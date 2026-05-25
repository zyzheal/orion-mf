/**
 * OrionMF DevProxyManager - 在线联调模式模块
 *
 * 用于开发时将子应用入口替换为本地开发服务器地址
 */

import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

/** 代理配置映射 */
export type ProxyList = Record<string, string>;

/** 代理变更回调函数类型 */
export type ProxyChangeCallback = (proxyList: ProxyList) => void;

// ============================================================================
// DevProxyManager Class
// ============================================================================

/**
 * 开发代理管理器
 *
 * 负责微前端的在线联调模式，支持：
 * - 从 window.__ORIONMF_PROXY_LIST__ 读取代理配置
 * - 注册/注销子应用的本地开发地址
 * - 解析子应用入口（开发时替换为本地地址）
 * - 生成代理脚本供子应用注入
 * - 代理变更热更新回调
 *
 * @example
 * ```typescript
 * // 主应用启动时
 * const devProxy = new DevProxyManager();
 *
 * // 子应用入口解析
 * const entry = devProxy.resolveEntry('pipeline-dashboard', 'https://prod.com/remoteEntry.js');
 * // 开发环境返回: http://localhost:3002/remoteEntry.js
 * // 生产环境返回: https://prod.com/remoteEntry.js
 *
 * // 子应用开发者在浏览器控制台注入
 * window.__ORIONMF_PROXY_LIST__ = {
 *   'pipeline-dashboard': 'http://localhost:3002/remoteEntry.js',
 * };
 *
 * // 刷新页面，主应用自动加载本地子应用
 * ```
 */
export class DevProxyManager {
  /** 代理列表 */
  private proxyList: ProxyList = {};

  /** 代理变更回调 */
  private onChange?: ProxyChangeCallback;

  // ============================================================================
  // Constructor
  // ============================================================================

  /**
   * 创建设发代理管理器
   *
   * @param initialProxyList - 初始代理列表（可选）
   */
  constructor(initialProxyList?: ProxyList) {
    // 优先使用传入的代理列表，否则从 window 读取
    if (initialProxyList) {
      this.proxyList = { ...initialProxyList };
    } else {
      // 从 window.__ORIONMF_PROXY_LIST__ 读取
      this.proxyList = this.loadProxyFromWindow();
    }
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * 解析子应用入口地址
   *
   * 开发时自动替换为本地地址，生产时透传原始地址
   *
   * @param appKey - 子应用唯一标识
   * @param configEntry - 配置中的远程入口地址
   * @returns 解析后的入口地址
   */
  resolveEntry(appKey: string, configEntry: string): string {
    // 如果有代理配置且不是空字符串，则使用代理地址
    const proxyEntry = this.proxyList[appKey];
    if (proxyEntry && proxyEntry.trim() !== '') {
      return proxyEntry;
    }
    // 否则使用原始配置地址
    return configEntry;
  }

  /**
   * 注册子应用的本地开发地址
   *
   * @param appKey - 子应用唯一标识
   * @param localEntry - 本地开发服务器入口地址
   */
  register(appKey: string, localEntry: string): void {
    if (!appKey) {
      logger.warn('DevProxyManager', 'Cannot register proxy without appKey');
      return;
    }

    if (!localEntry) {
      logger.warn('DevProxyManager', 'Cannot register proxy without localEntry');
      return;
    }

    this.proxyList[appKey] = localEntry;

    // 同步到 window 对象
    this.syncToWindow();

    // 触发变更回调
    this.notifyChange();
  }

  /**
   * 注销子应用的代理配置
   *
   * @param appKey - 子应用唯一标识
   */
  unregister(appKey: string): void {
    if (!appKey) {
      logger.warn('DevProxyManager', 'Cannot unregister proxy without appKey');
      return;
    }

    if (this.proxyList[appKey]) {
      delete this.proxyList[appKey];

      // 同步到 window 对象
      this.syncToWindow();

      // 触发变更回调
      this.notifyChange();
    }
  }

  /**
   * 生成代理配置脚本
   *
   * 用于子应用开发时注入到主应用页面
   *
   * @returns 可执行的 JavaScript 脚本
   */
  generateProxyScript(): string {
    return `window.__ORIONMF_PROXY_LIST__ = ${JSON.stringify(this.proxyList, null, 2)};`;
  }

  /**
   * 获取所有代理配置
   *
   * @returns 代理列表的副本
   */
  getAll(): ProxyList {
    return { ...this.proxyList };
  }

  /**
   * 检查是否存在指定子应用的代理配置
   *
   * @param appKey - 子应用唯一标识
   * @returns 是否存在代理配置
   */
  hasProxy(appKey: string): boolean {
    const proxyEntry = this.proxyList[appKey];
    return !!(proxyEntry && proxyEntry.trim() !== '');
  }

  /**
   * 设置代理变更回调
   *
   * 当代理配置发生变更时（注册/注销）触发回调
   *
   * @param callback - 变更回调函数
   */
  setOnChange(callback: ProxyChangeCallback): void {
    this.onChange = callback;
  }

  /**
   * 手动刷新代理列表
   *
   * 从 window 对象重新加载代理配置
   */
  refresh(): void {
    this.proxyList = this.loadProxyFromWindow();
    this.notifyChange();
  }

  /**
   * 清除所有代理配置
   */
  clear(): void {
    this.proxyList = {};
    this.syncToWindow();
    this.notifyChange();
  }

  /**
   * 获取代理地址
   *
   * @param appKey - 子应用唯一标识
   * @returns 代理地址，如果不存在则返回 undefined
   */
  getProxy(appKey: string): string | undefined {
    const proxyEntry = this.proxyList[appKey];
    return proxyEntry?.trim() !== '' ? proxyEntry : undefined;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 从 window 对象加载代理列表
   *
   * @returns 代理列表
   */
  private loadProxyFromWindow(): ProxyList {
    try {
      const windowProxy = (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__;
      if (windowProxy && typeof windowProxy === 'object') {
        return { ...windowProxy };
      }
    } catch (e) {
      // 跨域环境下可能无法访问 window，忽略错误
      logger.debug('DevProxyManager', 'Cannot access window.__ORIONMF_PROXY_LIST__:', e);
    }
    return {};
  }

  /**
   * 同步代理列表到 window 对象
   */
  private syncToWindow(): void {
    try {
      (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__ = { ...this.proxyList };
    } catch (e) {
      logger.debug('DevProxyManager', 'Cannot write to window.__ORIONMF_PROXY_LIST__:', e);
    }
  }

  /**
   * 触发代理变更回调
   */
  private notifyChange(): void {
    if (this.onChange) {
      this.onChange({ ...this.proxyList });
    }
  }
}

// ============================================================================
// Default Export & Factory
// ============================================================================

/**
 * 默认 DevProxyManager 实例
 */
let defaultInstance: DevProxyManager | null = null;

/**
 * 获取默认 DevProxyManager 实例
 *
 * @param initialProxyList - 初始代理列表（可选）
 * @returns 默认实例
 */
export function getDevProxyManager(initialProxyList?: ProxyList): DevProxyManager {
  if (!defaultInstance) {
    defaultInstance = new DevProxyManager(initialProxyList);
  }
  return defaultInstance;
}

/**
 * 创建设发代理管理器（工厂函数）
 *
 * @param initialProxyList - 初始代理列表（可选）
 * @returns 新的 DevProxyManager 实例
 */
export function createDevProxyManager(initialProxyList?: ProxyList): DevProxyManager {
  return new DevProxyManager(initialProxyList);
}

export default DevProxyManager;