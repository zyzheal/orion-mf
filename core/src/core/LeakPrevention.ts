/**
 * LeakPrevention — 资源泄漏防护模块
 *
 * 提供子应用资源管理能力：
 * - DOM 注册表：管理已注册的 DOM 节点，unmount 时自动清理
 * - 网络请求：使用 AbortController 中断进行中的请求
 * - 内存监控：performance.memory (Chromium) 50MB 阈值，非 Chromium 使用 performance.mark() 降级
 * - 定时器管理：memoryMonitors Map 单独管理，cleanup 时 clearInterval
 */

export interface LeakContext {
  /** 子应用 key */
  key: string;
  /** 中止信号，可用于中断 fetch/XHR 请求 */
  signal: AbortSignal;
}

export interface MemoryStats {
  /** 当前堆内存使用量 (bytes) */
  usedJSHeapSize: number;
  /** 堆内存限制 (bytes) */
  jsHeapSizeLimit: number;
  /** 是否超出阈值 */
  isOverThreshold: boolean;
}

/**
 * Memory API 可用性检测
 */
function hasMemoryAPI(): boolean {
  return 'memory' in performance;
}

/**
 * 获取内存使用情况
 */
function getMemoryStats(threshold: number): MemoryStats | null {
  if (!hasMemoryAPI()) {
    return null;
  }

  const memory = (performance as any).memory;
  if (!memory) {
    return null;
  }

  const usedJSHeapSize = memory.usedJSHeapSize ?? 0;
  const jsHeapSizeLimit = memory.jsHeapSizeLimit ?? 0;

  return {
    usedJSHeapSize,
    jsHeapSizeLimit,
    isOverThreshold: usedJSHeapSize > threshold,
  };
}

export class LeakPrevention {
  /** DOM 节点注册表：key -> Set<HTMLElement> */
  private domNodes = new Map<string, Set<HTMLElement>>();

  /** AbortController 控制器：key -> AbortController */
  private abortControllers = new Map<string, AbortController>();

  /** 内存监控定时器：key -> timerId */
  private memoryMonitors = new Map<string, ReturnType<typeof setInterval>>();

  /** 内存阈值：默认 50MB */
  private memoryThreshold: number;

  /** 内存监控间隔：默认 5000ms */
  private memoryCheckInterval: number;

  /** 降级监控计数器 */
  private fallbackCheckCount = new Map<string, number>();

  /** 内存超限回调 */
  private onMemoryWarning?: (key: string, stats: MemoryStats) => void;

  constructor(options?: {
    /** 内存阈值 (bytes)，默认 50MB */
    memoryThreshold?: number;
    /** 内存检查间隔 (ms)，默认 5000ms */
    memoryCheckInterval?: number;
    /** 内存超限回调 */
    onMemoryWarning?: (key: string, stats: MemoryStats) => void;
  }) {
    this.memoryThreshold = options?.memoryThreshold ?? 50 * 1024 * 1024; // 50MB
    this.memoryCheckInterval = options?.memoryCheckInterval ?? 5000;
    this.onMemoryWarning = options?.onMemoryWarning;
  }

  /**
   * 为指定子应用设置泄漏防护上下文
   * @param key 子应用唯一标识
   * @returns LeakContext 包含 AbortSignal
   */
  setup(key: string): LeakContext {
    const controller = new AbortController();
    this.abortControllers.set(key, controller);
    this.domNodes.set(key, new Set());

    // 启动内存监控
    this.startMemoryMonitor(key);

    return { key, signal: controller.signal };
  }

  /**
   * 注册 DOM 节点
   * @param key 子应用标识
   * @param node 要注册的 DOM 节点
   */
  registerDOM(key: string, node: HTMLElement): void {
    const nodes = this.domNodes.get(key);
    if (nodes) {
      nodes.add(node);
    }
  }

  /**
   * 取消注册 DOM 节点
   * @param key 子应用标识
   * @param node 要取消注册的 DOM 节点
   */
  unregisterDOM(key: string, node: HTMLElement): void {
    const nodes = this.domNodes.get(key);
    if (nodes) {
      nodes.delete(node);
    }
  }

  /**
   * 使用 AbortController 发起 fetch 请求
   * @param key 子应用标识
   * @param url 请求 URL
   * @param options fetch 选项
   * @returns Promise<Response>
   * @throws Error 如果 key 未设置泄漏防护上下文
   */
  async fetch(key: string, url: string, options?: RequestInit): Promise<Response> {
    const controller = this.abortControllers.get(key);
    if (!controller) {
      throw new Error(`[LeakPrevention] ${key}: Leak context not setup, call setup(key) first`);
    }

    return fetch(url, {
      ...options,
      signal: controller.signal,
    });
  }

  /**
   * 清理指定子应用的所有资源
   * @param key 子应用标识
   */
  cleanup(key: string): void {
    // 1. 中断所有网络请求
    const controller = this.abortControllers.get(key);
    if (controller) {
      try {
        controller.abort();
      } catch {
        // AbortError 是预期行为，忽略
      }
    }

    // 2. 停止内存监控定时器
    const monitorId = this.memoryMonitors.get(key);
    if (monitorId) {
      clearInterval(monitorId);
      this.memoryMonitors.delete(key);
    }

    // 3. 清理降级监控计数器
    this.fallbackCheckCount.delete(key);

    // 4. 移除所有注册的 DOM 节点
    const nodes = this.domNodes.get(key);
    if (nodes) {
      for (const node of nodes) {
        try {
          if (node.parentNode) {
            node.remove();
          }
        } catch {
          // 节点可能已被移除，忽略错误
        }
      }
    }

    // 5. 清理引用
    this.abortControllers.delete(key);
    this.domNodes.delete(key);
  }

  /**
   * 清理所有子应用的资源
   */
  cleanupAll(): void {
    const keys = Array.from(this.abortControllers.keys());
    for (const key of keys) {
      this.cleanup(key);
    }
  }

  /**
   * 启动内存监控（Chromium 专用）
   * @param key 子应用标识
   */
  private startMemoryMonitor(key: string): void {
    // 仅 Chromium 支持 performance.memory
    if (!hasMemoryAPI()) {
      console.warn(`[LeakPrevention] ${key}: performance.memory not supported, using fallback monitor`);
      this.startFallbackMonitor(key);
      return;
    }

    const check = () => {
      const stats = getMemoryStats(this.memoryThreshold);
      if (stats) {
        if (stats.isOverThreshold) {
          console.warn(
            `[LeakPrevention] ${key}: memory exceeds ${this.memoryThreshold / 1024 / 1024}MB threshold ` +
            `(${Math.round(stats.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(stats.jsHeapSizeLimit / 1024 / 1024)}MB)`
          );
          this.onMemoryWarning?.(key, stats);
        }
      }
    };

    const id = setInterval(check, this.memoryCheckInterval);
    this.memoryMonitors.set(key, id);
  }

  /**
   * 启动降级监控（非 Chromium 浏览器使用）
   * 使用 performance.mark() 测量标记间隔时间作为启发式内存检测
   * @param key 子应用标识
   */
  private startFallbackMonitor(key: string): void {
    let lastCheck = performance.now();
    this.fallbackCheckCount.set(key, 0);

    const check = () => {
      const now = performance.now();
      const elapsed = now - lastCheck;

      // 记录检查次数
      const count = (this.fallbackCheckCount.get(key) ?? 0) + 1;
      this.fallbackCheckCount.set(key, count);

      // 尝试使用 performance.mark 记录检查点
      try {
        if (performance.mark) {
          performance.mark(`leak-prevention-${key}-check-${count}`);
        }
      } catch {
        // 忽略标记错误
      }

      // 检查间隔是否异常长（可能存在 GC 暂停或内存压力）
      if (elapsed > this.memoryCheckInterval * 2) {
        console.warn(
          `[LeakPrevention] ${key}: fallback monitor detected unusual delay (${Math.round(elapsed)}ms), ` +
          `possible memory pressure`
        );
        this.onMemoryWarning?.(key, {
          usedJSHeapSize: 0,
          jsHeapSizeLimit: 0,
          isOverThreshold: true,
        });
      }

      lastCheck = now;
    };

    const id = setInterval(check, this.memoryCheckInterval);
    this.memoryMonitors.set(key, id);
  }

  /**
   * 获取指定子应用的 DOM 节点数量
   * @param key 子应用标识
   * @returns 注册的 DOM 节点数量
   */
  getRegisteredDOMCount(key: string): number {
    return this.domNodes.get(key)?.size ?? 0;
  }

  /**
   * 获取当前内存使用情况
   * @returns MemoryStats 或 null（如果不支持）
   */
  getCurrentMemoryStats(): MemoryStats | null {
    return getMemoryStats(this.memoryThreshold);
  }

  /**
   * 检查指定子应用是否已设置泄漏防护
   * @param key 子应用标识
   * @returns 是否已设置
   */
  hasContext(key: string): boolean {
    return this.abortControllers.has(key);
  }
}

export default LeakPrevention;