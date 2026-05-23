/**
 * Vue2ShadowCompat - Vue 2 + Shadow DOM 兼容模块
 *
 * 处理 Vue 2 应用在 Shadow DOM 中的渲染兼容性
 */

type Vue2Constructor = {
  new (options?: Record<string, any>): any;
  version: string;
};

// ============================================================================
// Types
// ============================================================================

/**
 * Vue2 应用配置
 */
export interface Vue2AppConfig {
  /** 子应用 key */
  key: string;
  /** Shadow Root 容器 */
  container: HTMLElement;
  /** Vue2 根组件 */
  rootComponent: any;
  /** 根组件 props */
  props?: Record<string, any>;
}

/**
 * Vue2 应用实例
 */
export interface Vue2AppInstance {
  /** 子应用 key */
  key: string;
  /** Vue2 构造函数 */
  Vue: Vue2Constructor;
  /** Vue 实例 */
  instance: any;
  /** Shadow Root */
  shadowRoot: ShadowRoot;
  /** 卸载函数 */
  unmount: () => void;
}

/**
 * Vue2ShadowCompat 配置
 */
export interface Vue2ShadowCompatConfig {
  /** 是否启用 CSS 作用域补丁 */
  enableCssScope?: boolean;
  /** 是否启用事件转发 */
  enableEventForwarding?: boolean;
  /** Vue2 版本 */
  version?: '2.6' | '2.7';
}

// ============================================================================
// Vue2ShadowCompat Class
// ============================================================================

/**
 * Vue2ShadowCompat - 处理 Vue 2 在 Shadow DOM 中的渲染
 *
 * Vue 2 vs Vue 3 差异：
 * 1. Vue 2 使用 Vue.extend 创建组件
 * 2. Vue 2 使用 new Vue() 创建实例
 * 3. Vue 2 没有 createApp，需要手动挂载
 */
export class Vue2ShadowCompat {
  private apps = new Map<string, Vue2AppInstance>();
  private config: Required<Vue2ShadowCompatConfig>;

  constructor(config: Vue2ShadowCompatConfig = {}) {
    this.config = {
      enableCssScope: config.enableCssScope ?? true,
      enableEventForwarding: config.enableEventForwarding ?? true,
      version: config.version ?? '2.7',
    };
  }

  /**
   * 创建 Vue2 应用并挂载到 Shadow DOM
   */
  async mount(config: Vue2AppConfig): Promise<Vue2AppInstance> {
    const { key, container, rootComponent, props = {} } = config;

    // 创建 Shadow DOM
    const shadowRoot = container.attachShadow({ mode: 'open' });

    // 设置作用域属性
    shadowRoot.host.setAttribute('data-orion-scope', `orion-${key}`);

    // 注入样式隔离补丁
    if (this.config.enableCssScope) {
      this.injectStylePatch(shadowRoot);
    }

    // 加载 Vue2
    const Vue = await this.loadVue2();

    // 创建容器元素
    const mountPoint = document.createElement('div');
    mountPoint.id = 'app';
    shadowRoot.appendChild(mountPoint);

    // 创建 Vue2 实例
    const instance = new Vue({
      ...(rootComponent as any),
      propsData: props,
      // 确保 Vue2 使用 Shadow DOM 内的元素
      el: mountPoint,
    });

    // 启用事件转发
    if (this.config.enableEventForwarding) {
      this.enableEventForwarding(key, shadowRoot);
    }

    const appInstance: Vue2AppInstance = {
      key,
      Vue,
      instance,
      shadowRoot,
      unmount: () => this.unmount(key),
    };

    this.apps.set(key, appInstance);
    return appInstance;
  }

  /**
   * 卸载 Vue2 应用
   */
  unmount(key: string): void {
    const appInstance = this.apps.get(key);
    if (!appInstance) {
      console.warn(`[Vue2ShadowCompat] App ${key} not found`);
      return;
    }

    // 销毁 Vue 实例
    if (appInstance.instance.$destroy) {
      appInstance.instance.$destroy();
    }

    // 移除 DOM
    appInstance.shadowRoot.innerHTML = '';

    this.apps.delete(key);
  }

  /**
   * 获取已挂载的应用
   */
  getApp(key: string): Vue2AppInstance | undefined {
    return this.apps.get(key);
  }

  /**
   * 获取所有已挂载的应用
   */
  getAllApps(): Vue2AppInstance[] {
    return Array.from(this.apps.values());
  }

  /**
   * 检查应用是否已挂载
   */
  isMounted(key: string): boolean {
    return this.apps.has(key);
  }

  /**
   * 加载 Vue2（从全局或模块）
   */
  private async loadVue2(): Promise<Vue2Constructor> {
    // 尝试从全局获取 Vue
    const vue = (globalThis as any).Vue;
    if (vue && vue.version) {
      const majorVersion = parseInt(vue.version.split('.')[0], 10);
      if (majorVersion === 2) {
        return vue as Vue2Constructor;
      }
    }

    // 尝试从模块获取
    try {
      const vueModuleName = 'vue';
      const vueModule = await import(/* @vite-ignore */ vueModuleName);
      const version = (vueModule as any).default?.version || (vueModule as any).version;
      const majorVersion = parseInt(version?.split('.')[0] || '2', 10);
      if (majorVersion === 2) {
        return (vueModule as any).default || vueModule;
      }
    } catch (e) {
      // 继续尝试
    }

    throw new Error(
      '[Vue2ShadowCompat] Vue 2 not found. Please ensure Vue 2 is loaded globally or imported.'
    );
  }

  /**
   * 启用事件转发（处理 Shadow DOM 边界事件）
   */
  private enableEventForwarding(_key: string, shadowRoot: ShadowRoot): void {
    const eventsToForward = [
      'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
      'keydown', 'keyup', 'keypress', 'submit', 'change', 'input',
      'focus', 'blur', 'wheel', 'touchstart', 'touchend',
      'contextmenu', 'drag', 'drop',
    ];

    for (const eventType of eventsToForward) {
      shadowRoot.addEventListener(eventType, (event: Event) => {
        if (!event.bubbles) return;

        const newEvent = event instanceof CustomEvent
          ? new CustomEvent(event.type, {
              bubbles: true,
              cancelable: event.cancelable,
              detail: event.detail,
            })
          : new Event(event.type, {
              bubbles: true,
              cancelable: event.cancelable,
            });

        (newEvent as any).originalEvent = event;

        shadowRoot.host.dispatchEvent(newEvent);
      }, true);
    }
  }

  /**
   * 注入 Vue2 样式隔离补丁
   */
  private injectStylePatch(shadowRoot: ShadowRoot): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Vue2 Shadow DOM 样式隔离补丁 */
      [data-orion-scope] {
        all: revert;
        box-sizing: border-box;
      }

      [data-orion-scope] * {
        box-sizing: border-box;
      }

      /* Vue2 transition */
      [data-orion-scope] .fade-enter-active,
      [data-orion-scope] .fade-leave-active {
        transition: opacity 0.3s;
      }

      [data-orion-scope] .fade-enter,
      [data-orion-scope] .fade-leave-to {
        opacity: 0;
      }

      /* Vue2 list transition */
      [data-orion-scope] .list-enter-active,
      [data-orion-scope] .list-leave-active {
        transition: all 0.3s;
      }

      [data-orion-scope] .list-enter,
      [data-orion-scope] .list-leave-to {
        opacity: 0;
        transform: translateX(30px);
      }
    `;
    style.setAttribute('data-orion-vue2-patch', 'true');
    shadowRoot.appendChild(style);
  }

  /**
   * 清理所有应用
   */
  dispose(): void {
    for (const key of this.apps.keys()) {
      this.unmount(key);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 创建 Vue2 子应用实例的便捷函数
 */
export async function createVue2SubApp(
  config: Vue2AppConfig,
  vue2Compat?: Vue2ShadowCompat
): Promise<Vue2AppInstance> {
  const compat = vue2Compat || new Vue2ShadowCompat();
  return compat.mount(config);
}

/**
 * 卸载 Vue2 子应用
 */
export function destroyVue2SubApp(
  key: string,
  vue2Compat: Vue2ShadowCompat
): void {
  vue2Compat.unmount(key);
}

// ============================================================================
// Export
// ============================================================================

export default Vue2ShadowCompat;