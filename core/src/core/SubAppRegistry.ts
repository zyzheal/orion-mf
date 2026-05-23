/**
 * SubAppRegistry - 子应用注册中心
 *
 * 提供子应用的动态注册、远程配置拉取、缓存管理功能。
 * 支持：
 * - 动态注册：register() / unregister() 无需修改代码
 * - 远程配置：fetchRemote() 从配置中心拉取
 * - 缓存：5 分钟 TTL 避免频繁请求
 * - 环境适配：entry_dev / entry_prod 自动切换
 */

/** 子应用注册配置 */
export interface SubAppRegistration {
  /** 子应用唯一标识 */
  key: string;
  /** 子应用名称 */
  name: string;
  /** 开发环境入口 */
  entry_dev: string;
  /** 生产环境入口 */
  entry_prod: string;
  /** 路由前缀 */
  route: string;
  /** 安全策略 */
  security?: 'strict' | 'loose' | 'none';
  /** 是否预加载 */
  preload?: boolean;
  /** 是否可缓存 */
  cacheable?: boolean;
  /** 允许修改的全局状态 key */
  allowedStateKeys?: string[];
}

/** 远程配置选项 */
export interface SubAppRegistryOptions {
  /** 远程配置中心 URL */
  remoteUrl?: string;
  /** 缓存 TTL（毫秒），默认 5 分钟 */
  cacheTTL?: number;
  /** 自定义 fetch 函数 */
  fetchFn?: typeof fetch;
}

export interface RegistryConfig {
  remoteUrl?: string;
  cacheTTL: number;
  fetchFn: typeof fetch;
}

/**
 * SubAppRegistry - 子应用注册中心类
 *
 * 管理微前端子应用的注册表，支持动态注册、远程配置加载、环境适配等功能。
 */
export class SubAppRegistry {
  private apps = new Map<string, SubAppRegistration>();
  private config: RegistryConfig;
  private lastFetchTime = 0;

  constructor(options: SubAppRegistryOptions = {}) {
    this.config = {
      remoteUrl: options.remoteUrl,
      cacheTTL: options.cacheTTL ?? 5 * 60 * 1000, // 5 分钟默认缓存
      fetchFn: options.fetchFn ?? globalThis.fetch,
    };
  }

  /**
   * 注册子应用
   *
   * @param config - 子应用注册配置
   */
  register(config: SubAppRegistration): void {
    if (!config.key) {
      console.warn('[SubAppRegistry] Cannot register app without key');
      return;
    }
    this.apps.set(config.key, config);
  }

  /**
   * 批量注册子应用
   *
   * @param configs - 子应用注册配置数组
   */
  registerBatch(configs: SubAppRegistration[]): void {
    for (const config of configs) {
      this.register(config);
    }
  }

  /**
   * 注销子应用
   *
   * @param key - 子应用标识
   */
  unregister(key: string): void {
    this.apps.delete(key);
  }

  /**
   * 获取子应用配置
   *
   * @param key - 子应用标识
   * @returns 子应用配置或 undefined
   */
  getApp(key: string): SubAppRegistration | undefined {
    return this.apps.get(key);
  }

  /**
   * 获取所有已注册的子应用
   *
   * @returns 子应用配置数组
   */
  getAllApps(): SubAppRegistration[] {
    return Array.from(this.apps.values());
  }

  /**
   * 检查子应用是否已注册
   *
   * @param key - 子应用标识
   * @returns 是否已注册
   */
  has(key: string): boolean {
    return this.apps.has(key);
  }

  /**
   * 获取子应用入口（自动根据环境选择）
   *
   * @param key - 子应用标识
   * @returns 入口 URL
   * @throws 如果子应用不存在则抛出错误
   */
  getEntry(key: string): string {
    const app = this.apps.get(key);
    if (!app) {
      throw new Error(`Unknown app: ${key}`);
    }

    // 根据环境选择入口
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
    return isDev ? app.entry_dev : app.entry_prod;
  }

  /**
   * 强制指定环境获取入口
   *
   * @param key - 子应用标识
   * @param isDevelopment - 是否开发环境
   * @returns 入口 URL
   */
  getEntryForEnv(key: string, isDevelopment: boolean): string {
    const app = this.apps.get(key);
    if (!app) {
      throw new Error(`Unknown app: ${key}`);
    }

    return isDevelopment ? app.entry_dev : app.entry_prod;
  }

  /**
   * 从远程配置中心加载注册表
   *
   * 使用缓存机制，5 分钟内不会重复请求。
   */
  async fetchRemote(): Promise<void> {
    const { remoteUrl, cacheTTL, fetchFn } = this.config;

    if (!remoteUrl) {
      console.warn('[SubAppRegistry] No remoteUrl configured');
      return;
    }

    // 检查缓存
    const now = Date.now();
    if (now - this.lastFetchTime < cacheTTL) {
      console.log('[SubAppRegistry] Using cached config, skipping fetch');
      return;
    }

    try {
      const response = await fetchFn(remoteUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch remote config: ${response.status} ${response.statusText}`);
      }

      const configs: SubAppRegistration[] = await response.json();

      if (!Array.isArray(configs)) {
        throw new Error('Remote config must be an array of SubAppRegistration');
      }

      this.registerBatch(configs);
      this.lastFetchTime = now;
      console.log(`[SubAppRegistry] Successfully loaded ${configs.length} apps from remote`);
    } catch (e) {
      console.warn('[SubAppRegistry] Failed to fetch remote config:', e);
    }
  }

  /**
   * 强制刷新远程配置（忽略缓存）
   *
   * @returns 加载是否成功
   */
  async fetchRemoteForce(): Promise<boolean> {
    const { remoteUrl, fetchFn } = this.config;

    if (!remoteUrl) {
      console.warn('[SubAppRegistry] No remoteUrl configured');
      return false;
    }

    try {
      const response = await fetchFn(remoteUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch remote config: ${response.status} ${response.statusText}`);
      }

      const configs: SubAppRegistration[] = await response.json();

      if (!Array.isArray(configs)) {
        throw new Error('Remote config must be an array of SubAppRegistration');
      }

      // 清除旧配置并加载新配置
      this.apps.clear();
      this.registerBatch(configs);
      this.lastFetchTime = Date.now();
      console.log(`[SubAppRegistry] Successfully refreshed ${configs.length} apps from remote`);
      return true;
    } catch (e) {
      console.warn('[SubAppRegistry] Failed to force refresh remote config:', e);
      return false;
    }
  }

  /**
   * 获取当前配置
   *
   * @returns 注册表配置
   */
  getConfig(): Readonly<RegistryConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   *
   * @param options - 新配置选项
   */
  setConfig(options: Partial<SubAppRegistryOptions>): void {
    if (options.remoteUrl !== undefined) {
      this.config.remoteUrl = options.remoteUrl;
    }
    if (options.cacheTTL !== undefined) {
      this.config.cacheTTL = options.cacheTTL;
    }
    if (options.fetchFn !== undefined) {
      this.config.fetchFn = options.fetchFn;
    }
  }

  /**
   * 获取注册表大小
   */
  get size(): number {
    return this.apps.size;
  }

  /**
   * 清除缓存时间戳，强制下次 fetchRemote() 重新请求
   */
  invalidateCache(): void {
    this.lastFetchTime = 0;
  }

  /**
   * 获取最后 fetch 的时间
   */
  getLastFetchTime(): number {
    return this.lastFetchTime;
  }

  /**
   * 清除所有注册的子应用
   */
  clear(): void {
    this.apps.clear();
  }
}

// ============================================================================
// Global Singleton
// ============================================================================

let globalSubAppRegistry: SubAppRegistry | null = null;

/**
 * 获取全局 SubAppRegistry 实例
 *
 * @param options - 初始化选项
 * @returns SubAppRegistry 实例
 */
export function getSubAppRegistry(options?: SubAppRegistryOptions): SubAppRegistry {
  if (!globalSubAppRegistry) {
    globalSubAppRegistry = new SubAppRegistry(options);
  }
  return globalSubAppRegistry;
}

/**
 * 设置全局 SubAppRegistry 实例
 *
 * @param registry - SubAppRegistry 实例
 */
export function setSubAppRegistry(registry: SubAppRegistry): void {
  globalSubAppRegistry = registry;
}

/**
 * 创建 SubAppRegistry 实例的工厂函数
 *
 * @param options - 初始化选项
 * @returns 新的 SubAppRegistry 实例
 */
export function createSubAppRegistry(options?: SubAppRegistryOptions): SubAppRegistry {
  return new SubAppRegistry(options);
}