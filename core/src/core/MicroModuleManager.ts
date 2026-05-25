/**
 * MicroModuleManager - 模块级共享管理器
 *
 * 实现比子应用更细粒度的模块共享
 */

import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

/**
 * MicroModule 配置
 */
export interface MicroModuleConfig {
  /** 模块 key */
  key: string;
  /** 模块名称 */
  name: string;
  /** Remote Entry URL */
  remoteEntry: string;
  /** 导出组件路径 */
  exportPath: string;
  /** 依赖模块 */
  shared?: Record<string, any>;
}

/**
 * MicroModule 实例
 */
export interface MicroModuleInstance {
  /** 模块 key */
  key: string;
  /** 加载的模块 */
  module: any;
  /** 加载时间 */
  loadedAt: number;
  /** React 渲染结果（仅 React 模块） */
  renderResult?: {
    root: any; // ReactDOM Root
    wrapper: HTMLElement;
  };
}

/**
 * MicroModule 加载选项
 */
export interface MicroModuleLoadOptions {
  /** 是否强制重新加载 */
  force?: boolean;
  /** 加载超时时间 */
  timeout?: number;
}

// ============================================================================
// MicroModuleManager Class
// ============================================================================

/**
 * MicroModule 管理器
 *
 * 与 SubApp 的区别：
 * - SubApp: 完整的子应用，包含 mount/unmount 生命周期
 * - MicroModule: 独立的组件/模块，按需加载渲染
 */
export class MicroModuleManager {
  private modules = new Map<string, MicroModuleInstance>();
  private loading = new Map<string, Promise<any>>();
  private config: Map<string, MicroModuleConfig> = new Map();
  private reactCache: { React: any; ReactDOM: any } | null = null;

  /**
   * 注册 MicroModule
   */
  register(config: MicroModuleConfig): void {
    this.config.set(config.key, config);
    logger.info('MicroModule', `Registered: ${config.key}`);
  }

  /**
   * 批量注册
   */
  registerMany(configs: MicroModuleConfig[]): void {
    configs.forEach((config) => this.register(config));
  }

  /**
   * 加载 MicroModule
   */
  async load(key: string, options: MicroModuleLoadOptions = {}): Promise<any> {
    const { force = false, timeout = 30000 } = options;

    // 检查是否已加载
    if (!force && this.modules.has(key)) {
      return this.modules.get(key)!.module;
    }

    // 检查是否正在加载
    if (this.loading.has(key)) {
      return this.loading.get(key);
    }

    // 获取配置
    const config = this.config.get(key);
    if (!config) {
      throw new Error(`[MicroModule] Not registered: ${key}`);
    }

    // 加载模块
    const loadPromise = this.doLoad(key, config, timeout);
    this.loading.set(key, loadPromise);

    try {
      const module = await loadPromise;
      this.modules.set(key, {
        key,
        module,
        loadedAt: Date.now(),
      });
      return module;
    } finally {
      this.loading.delete(key);
    }
  }

  /**
   * 执行实际加载
   */
  private async doLoad(
    key: string,
    config: MicroModuleConfig,
    timeout: number
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[MicroModule] Load timeout: ${key}`));
      }, timeout);

      try {
        // 动态导入 remote entry
        const remote = await import(/* @vite-ignore */ config.remoteEntry);

        // 获取模块工厂
        const factory = await remote.get(config.exportPath);

        if (!factory) {
          throw new Error(`[MicroModule] Module not found: ${config.exportPath}`);
        }

        clearTimeout(timer);
        resolve(factory);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * 渲染 MicroModule 组件
   */
  async render(
    key: string,
    container: HTMLElement,
    props: Record<string, any> = {}
  ): Promise<any> {
    const config = this.config.get(key);
    if (!config) {
      throw new Error(`[MicroModule] Not registered: ${key}`);
    }

    const module = await this.load(key);

    // 渲染组件（根据框架类型）
    if (module.default) {
      // 默认导出
      if (typeof module.default === 'function') {
        // 尝试作为组件渲染
        const { React, ReactDOM } = await this.loadReact();

        // 创建 React 容器
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-orion-micromodule', key);
        container.appendChild(wrapper);

        const root = ReactDOM.createRoot(wrapper);
        root.render(React.createElement(module.default, props));

        const renderResult = { root, wrapper };

        // 记录渲染结果以便卸载时清理
        const instance = this.modules.get(key);
        if (instance) {
          instance.renderResult = renderResult;
        }

        return renderResult;
      }
    }

    throw new Error(`[MicroModule] Unsupported module type: ${key}`);
  }

  /**
   * 加载 React 和 ReactDOM（带缓存）
   */
  private async loadReact(): Promise<{ React: any; ReactDOM: any }> {
    if (this.reactCache) return this.reactCache;

    const React = await import('react');
    const ReactDOM = await import('react-dom/client');

    this.reactCache = { React, ReactDOM };
    return this.reactCache;
  }

  /**
   * 卸载 MicroModule
   */
  unmount(key: string): void {
    const instance = this.modules.get(key);
    if (!instance) return;

    // 清理 React root（防止内存泄漏）
    if (instance.renderResult) {
      try {
        instance.renderResult.root.unmount();
      } catch (e) {
        logger.warn('MicroModule', `Error unmounting React root for "${key}":`, e);
      }
      // 移除 DOM wrapper
      try {
        instance.renderResult.wrapper.remove();
      } catch (e) {
        // DOM already removed
      }
    }

    this.modules.delete(key);
    logger.info('MicroModule', `Unmounted: ${key}`);
  }

  /**
   * 获取已加载的模块
   */
  getLoaded(key: string): any {
    return this.modules.get(key)?.module;
  }

  /**
   * 获取所有已加载模块
   */
  getAllLoaded(): MicroModuleInstance[] {
    return Array.from(this.modules.values());
  }

  /**
   * 检查模块是否已加载
   */
  isLoaded(key: string): boolean {
    return this.modules.has(key);
  }

  /**
   * 获取模块配置
   */
  getConfig(key: string): MicroModuleConfig | undefined {
    return this.config.get(key);
  }

  /**
   * 获取所有模块配置
   */
  getAllConfigs(): MicroModuleConfig[] {
    return Array.from(this.config.values());
  }

  /**
   * 清理所有模块
   */
  reset(): void {
    this.modules.clear();
    this.config.clear();
    this.loading.clear();
    this.reactCache = null;
  }
}

// ============================================================================
// Singleton
// ============================================================================

const microModuleManager = new MicroModuleManager();

export default microModuleManager;