/**
 * SubAppCache - 子应用缓存/Keep-Alive 管理
 *
 * 管理微前端子应用的缓存策略，支持两种模式：
 * - keep-alive: 隐藏 DOM 保留状态，秒级恢复
 * - full-unmount: 完全卸载释放内存，下次需重新 mount
 */

export type CacheMode = 'keep-alive' | 'full-unmount';

export interface CacheConfig {
  maxSize: number;
  ttl: number;
  defaultMode: CacheMode;
}

export interface CacheEntry {
  unmount: () => Promise<void>;
  timestamp: number;
  mode: CacheMode;
  container: HTMLElement | null;
}

export interface SubAppCacheOptions {
  maxSize?: number;
  ttl?: number;
  defaultMode?: CacheMode;
}

/**
 * SubAppCache - 子应用缓存管理类
 *
 * 提供智能缓存能力，支持以下特性：
 * - Keep-Alive 模式：display:none 隐藏 DOM，保留表单/滚动位置
 * - 完全卸载模式：调用 unmount，释放内存
 * - LRU 淘汰：maxSize 限制防止内存泄漏
 * - TTL 过期：可配置过期时间避免缓存永远不被清理
 */
export class SubAppCache {
  private cache = new Map<string, CacheEntry>();
  private config: CacheConfig;

  constructor(options: SubAppCacheOptions = {}) {
    this.config = {
      maxSize: options.maxSize ?? 5,
      ttl: options.ttl ?? 0,
      defaultMode: options.defaultMode ?? 'keep-alive',
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<CacheConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  setConfig(options: Partial<SubAppCacheOptions>): void {
    this.config = {
      maxSize: options.maxSize ?? this.config.maxSize,
      ttl: options.ttl ?? this.config.ttl,
      defaultMode: options.defaultMode ?? this.config.defaultMode,
    };
  }

  /**
   * 卸载子应用并放入缓存
   *
   * @param key - 子应用标识
   * @param unmount - 卸载函数
   * @param container - DOM 容器元素（keep-alive 模式需要）
   */
  async evict(key: string, unmount: () => Promise<void>, container?: HTMLElement): Promise<void> {
    // 如果缓存已满，淘汰最旧的
    if (this.cache.size >= this.config.maxSize) {
      await this.evictOldest();
    }

    const mode = this.config.defaultMode;

    if (mode === 'keep-alive' && container) {
      // Keep-Alive 模式：隐藏 DOM 但不卸载
      container.style.display = 'none';
      this.cache.set(key, {
        unmount,
        timestamp: Date.now(),
        mode: 'keep-alive',
        container,
      });
    } else {
      // 完全卸载模式：调用 unmount 但保留模块引用
      await unmount();
      this.cache.set(key, {
        unmount,
        timestamp: Date.now(),
        mode: 'full-unmount',
        container: null,
      });
    }
  }

  /**
   * 从缓存恢复子应用
   *
   * @param key - 子应用标识
   * @param remount - 重新挂载函数（full-unmount 模式需要）
   * @returns 是否恢复成功
   */
  async restore(key: string, remount?: () => Promise<void>): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // 检查 TTL 过期
    if (this.config.ttl > 0 && Date.now() - entry.timestamp > this.config.ttl) {
      await this.purge(key);
      return false;
    }

    if (entry.mode === 'keep-alive' && entry.container) {
      // Keep-Alive 恢复：显示 DOM，不调用 remount
      entry.container.style.display = '';
      entry.timestamp = Date.now();
      // 更新缓存顺序（LRU）
      this.cache.delete(key);
      this.cache.set(key, entry);
      return true;
    }

    // 完全卸载模式：需要重新 mount
    if (!remount) {
      // 没有 remount 函数无法恢复，清除缓存条目
      this.cache.delete(key);
      return false;
    }
    await remount();
    entry.timestamp = Date.now();
    // 更新缓存顺序（LRU）
    this.cache.delete(key);
    this.cache.set(key, entry);
    return true;
  }

  /**
   * 清除指定缓存
   *
   * @param key - 子应用标识
   */
  async purge(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      // 如果是 keep-alive 模式，需要调用 unmount 彻底清理
      if (entry.mode === 'keep-alive' && entry.container) {
        await entry.unmount();
        entry.container.style.display = '';
      }
      this.cache.delete(key);
    }
  }

  /**
   * 清除所有缓存
   */
  async purgeAll(): Promise<void> {
    const entries = [...this.cache.entries()];
    this.cache.clear();

    for (const [key, entry] of entries) {
      try {
        if (entry.mode === 'keep-alive' && entry.container) {
          await entry.unmount();
          entry.container.style.display = '';
        }
      } catch (e) {
        console.warn(`[SubAppCache] Failed to purge ${key}:`, e);
      }
    }
  }

  /**
   * 淘汰最旧的缓存项（LRU）
   */
  private async evictOldest(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      await this.purge(oldestKey);
    }
  }

  /**
   * 检查指定 key 是否在缓存中
   *
   * @param key - 子应用标识
   * @returns 是否在缓存中
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * 获取缓存条目信息（如果存在）
   *
   * @param key - 子应用标识
   * @returns 缓存条目或 undefined
   */
  get(key: string): CacheEntry | undefined {
    return this.cache.get(key);
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有缓存的 key
   *
   * @returns key 数组
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存条目信息列表
   *
   * @returns 包含 key 和条目的数组
   */
  entries(): Array<[string, CacheEntry]> {
    return Array.from(this.cache.entries());
  }

  /**
   * 重置缓存
   * 清除所有缓存但不调用 unmount
   */
  reset(): void {
    this.cache.clear();
  }
}

// 全局单例实例
let globalSubAppCache: SubAppCache | null = null;

/**
 * 获取全局 SubAppCache 实例
 *
 * @param options - 初始化选项
 * @returns SubAppCache 实例
 */
export function getSubAppCache(options?: SubAppCacheOptions): SubAppCache {
  if (!globalSubAppCache) {
    globalSubAppCache = new SubAppCache(options);
  }
  return globalSubAppCache;
}

/**
 * 设置全局 SubAppCache 实例
 *
 * @param cache - SubAppCache 实例
 */
export function setSubAppCache(cache: SubAppCache): void {
  globalSubAppCache = cache;
}