/**
 * PreloadStrategy - 预加载/懒加载策略
 *
 * 管理微前端子应用的预加载逻辑
 * 支持 5 种预加载模式：idle / visible / all / smart / manual
 */

export type PrefetchMode = 'idle' | 'visible' | 'all' | 'smart' | 'manual';

export interface PrefetchConfig {
  mode: PrefetchMode;
  criticalApps: string[];
  excludedApps: string[];
  maxConcurrent: number;
  idleTimeout: number;
}

export interface PreloadStrategyOptions {
  mode?: PrefetchMode;
  criticalApps?: string[];
  excludedApps?: string[];
  maxConcurrent?: number;
  idleTimeout?: number;
}

/**
 * PreloadStrategy - 预加载/懒加载策略类
 *
 * 提供智能预加载能力，支持以下特性：
 * - 5 种预加载模式 (idle/visible/all/smart/manual)
 * - 关键应用 (criticalApps) 优先预加载
 * - 排除列表 (excludedApps) 控制不预加载的应用
 * - 并发控制 (maxConcurrent) 避免同时加载过多
 * - requestIdleCallback 空闲时预加载
 * - IntersectionObserver 可见时预加载
 */
export class PreloadStrategy {
  private config: PrefetchConfig;
  private loaded = new Set<string>();
  private loading = new Set<string>();

  constructor(config: PreloadStrategyOptions = {}) {
    this.config = {
      mode: config.mode ?? 'smart',
      criticalApps: config.criticalApps ?? [],
      excludedApps: config.excludedApps ?? [],
      maxConcurrent: config.maxConcurrent ?? 3,
      idleTimeout: config.idleTimeout ?? 2000,
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<PrefetchConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  setConfig(config: Partial<PreloadStrategyOptions>): void {
    this.config = {
      ...this.config,
      mode: config.mode ?? this.config.mode,
      criticalApps: config.criticalApps ?? this.config.criticalApps,
      excludedApps: config.excludedApps ?? this.config.excludedApps,
      maxConcurrent: config.maxConcurrent ?? this.config.maxConcurrent,
      idleTimeout: config.idleTimeout ?? this.config.idleTimeout,
    };
  }

  /**
   * 智能预加载策略
   * 根据配置的模式决定预加载时机
   *
   * @param appKey - 子应用标识
   * @param loader - 加载函数
   */
  async prefetch(appKey: string, loader: () => Promise<void>): Promise<void> {
    if (this.loaded.has(appKey) || this.config.excludedApps.includes(appKey)) {
      return;
    }
    if (this.loading.has(appKey)) {
      return;
    }

    switch (this.config.mode) {
      case 'all':
        return this.prefetchNow(appKey, loader);
      case 'idle':
        return this.prefetchOnIdle(appKey, loader);
      case 'visible':
        return this.prefetchOnVisible(appKey, loader);
      case 'smart':
        if (this.config.criticalApps.includes(appKey)) {
          return this.prefetchNow(appKey, loader);
        }
        return this.prefetchOnIdle(appKey, loader);
      case 'manual':
        // 不自动预加载，由外部手动调用
        return;
    }
  }

  /**
   * 预加载关键子应用（分批并发）
   *
   * @param loaders - 应用 key 到加载函数的映射
   */
  async prefetchCritical(loaders: Map<string, () => Promise<void>>): Promise<void> {
    const critical = this.config.criticalApps.filter(
      (k) => loaders.has(k) && !this.loaded.has(k)
    );
    const batches = this.chunk(critical, this.config.maxConcurrent);

    for (const batch of batches) {
      await Promise.allSettled(
        batch.map((key) => {
          const loader = loaders.get(key)!;
          return this.prefetchNow(key, loader);
        })
      );
    }
  }

  /**
   * 批量预加载多个应用
   *
   * @param appKeys - 应用 key 数组
   * @param getLoader - 获取加载函数的回调
   */
  async prefetchBatch(
    appKeys: string[],
    getLoader: (appKey: string) => (() => Promise<void>) | undefined
  ): Promise<void> {
    const validKeys = appKeys.filter(
      (key) =>
        !this.loaded.has(key) &&
        !this.loading.has(key) &&
        !this.config.excludedApps.includes(key) &&
        typeof getLoader(key) === 'function'
    );

    const batches = this.chunk(validKeys, this.config.maxConcurrent);

    for (const batch of batches) {
      await Promise.allSettled(
        batch.map((key) => {
          const loader = getLoader(key)!;
          return this.prefetch(key, loader);
        })
      );
    }
  }

  /**
   * 手动立即预加载指定应用
   * 绕过模式检查，强制预加载
   *
   * @param appKey - 子应用标识
   * @param loader - 加载函数
   */
  async prefetchNow(appKey: string, loader: () => Promise<void>): Promise<void> {
    if (this.loaded.has(appKey) || this.loading.has(appKey)) {
      return;
    }

    this.loading.add(appKey);
    try {
      await loader();
      this.loaded.add(appKey);
    } catch (e) {
      console.warn(`[Preload] Failed to prefetch ${appKey}:`, e);
    } finally {
      this.loading.delete(appKey);
    }
  }

  /**
   * 空闲时预加载
   * 使用 requestIdleCallback 在浏览器空闲时触发加载
   *
   * @param appKey - 子应用标识
   * @param loader - 加载函数
   */
  prefetchOnIdle(appKey: string, loader: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === 'undefined') {
        this.prefetchNow(appKey, loader).then(resolve);
        return;
      }

      requestIdleCallback(
        () => {
          this.prefetchNow(appKey, loader).then(resolve);
        },
        { timeout: this.config.idleTimeout }
      );
    });
  }

  /**
   * 可见时预加载
   * 使用 IntersectionObserver 监听元素可见性
   * 如果容器不存在，返回 Promise.resolve() 表示跳过
   *
   * @param appKey - 子应用标识
   * @param loader - 加载函数
   */
  prefetchOnVisible(appKey: string, loader: () => Promise<void>): Promise<void> {
    // 先检查 DOM 中是否存在容器元素
    // 注意：首次加载时容器可能尚未创建，此时应该跳过
    if (typeof document === 'undefined') {
      return this.prefetchNow(appKey, loader);
    }

    const container = document.querySelector(`[data-orion-scope="orion-${appKey}"]`);
    if (!container) {
      // 容器不存在说明子应用尚未渲染，跳过预加载
      // 这符合"可见时预加载"的语义
      console.debug(`[Preload] ${appKey}: container not found, skipping visible prefetch`);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            observer.disconnect();
            this.prefetchNow(appKey, loader).then(resolve);
          }
        },
        {
          threshold: 0,
          rootMargin: '100px',
        }
      );
      observer.observe(container);
    });
  }

  /**
   * 手动触发预加载（用于 manual 模式）
   *
   * @param appKey - 子应用标识
   * @param loader - 加载函数
   */
  async manualPrefetch(appKey: string, loader: () => Promise<void>): Promise<void> {
    return this.prefetchNow(appKey, loader);
  }

  /**
   * 检查应用是否已加载
   *
   * @param appKey - 子应用标识
   * @returns 是否已加载
   */
  isLoaded(appKey: string): boolean {
    return this.loaded.has(appKey);
  }

  /**
   * 获取所有已加载的应用列表
   *
   * @returns 已加载的应用 key 数组
   */
  getLoadedApps(): string[] {
    return Array.from(this.loaded);
  }

  /**
   * 获取所有正在加载的应用列表
   *
   * @returns 正在加载的应用 key 数组
   */
  getLoadingApps(): string[] {
    return Array.from(this.loading);
  }

  /**
   * 标记应用为已加载（用于外部加载完成后的同步）
   *
   * @param appKey - 子应用标识
   */
  markAsLoaded(appKey: string): void {
    this.loaded.add(appKey);
  }

  /**
   * 重置加载状态
   * 清除所有已加载和加载中的状态记录
   */
  reset(): void {
    this.loaded.clear();
    this.loading.clear();
  }

  /**
   * 从加载状态中移除指定应用
   * 用于手动卸载场景
   *
   * @param appKey - 子应用标识
   */
  unload(appKey: string): void {
    this.loaded.delete(appKey);
    this.loading.delete(appKey);
  }

  /**
   * 分批工具方法
   *
   * @param arr - 要分批的数组
   * @param size - 每批大小
   * @returns 分批后的数组
   */
  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}

// 全局单例实例
let globalPreloadStrategy: PreloadStrategy | null = null;

/**
 * 获取全局 PreloadStrategy 实例
 *
 * @param options - 初始化选项
 * @returns PreloadStrategy 实例
 */
export function getPreloadStrategy(options?: PreloadStrategyOptions): PreloadStrategy {
  if (!globalPreloadStrategy) {
    globalPreloadStrategy = new PreloadStrategy(options);
  }
  return globalPreloadStrategy;
}

/**
 * 设置全局 PreloadStrategy 实例
 *
 * @param strategy - PreloadStrategy 实例
 */
export function setPreloadStrategy(strategy: PreloadStrategy): void {
  globalPreloadStrategy = strategy;
}