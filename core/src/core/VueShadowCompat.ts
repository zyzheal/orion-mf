/**
 * VueShadowCompat - Vue 3 + Shadow DOM 兼容模块
 *
 * 处理 Vue 3 应用在 Shadow DOM 中的渲染兼容性
 */

// Vue 3 types (peer dependency - not installed at build time)
type Vue3App = {
  mount: (el: string | Element) => any;
  unmount: () => void;
  config: { globalProperties: Record<string, any> };
};

// ============================================================================
// Types
// ============================================================================

/**
 * Vue 应用实例配置
 */
export interface VueAppConfig {
  /** 子应用 key */
  key: string;
  /** Shadow Root 容器 */
  container: HTMLElement;
  /** Vue 根组件 */
  rootComponent: any;
  /** 根组件 props */
  props?: Record<string, any>;
}

/**
 * Vue 应用实例
 */
export interface VueAppInstance {
  /** 子应用 key */
  key: string;
  /** Vue 应用实例 */
  app: Vue3App;
  /** 根组件实例 */
  instance: any;
  /** Shadow Root */
  shadowRoot: ShadowRoot;
  /** 卸载函数 */
  unmount: () => void;
}

/**
 * VueShadowCompat 配置
 */
export interface VueShadowCompatConfig {
  /** 是否启用 CSS 作用域补丁 */
  enableCssScope?: boolean;
  /** 是否启用事件转发 */
  enableEventForwarding?: boolean;
}

// ============================================================================
// VueShadowCompat Class
// ============================================================================

/**
 * VueShadowCompat - 处理 Vue 3 在 Shadow DOM 中的渲染
 *
 * 解决的问题：
 * 1. Vue 模板编译后的样式 scoped 需要特殊处理
 * 2. Vue 动态组件的 DOM 操作需要劫持
 * 3. Vue Teleport 组件的目标容器处理
 * 4. 事件冒泡穿透 Shadow DOM 边界
 */
export class VueShadowCompat {
  private apps = new Map<string, VueAppInstance>();
  private config: Required<VueShadowCompatConfig>;

  constructor(config: VueShadowCompatConfig = {}) {
    this.config = {
      enableCssScope: config.enableCssScope ?? true,
      enableEventForwarding: config.enableEventForwarding ?? true,
    };
  }

  /**
   * 创建 Vue 应用并挂载到 Shadow DOM
   */
  async mount(config: VueAppConfig): Promise<VueAppInstance> {
    const { key, container, rootComponent, props = {} } = config;

    // 创建 Shadow DOM
    const shadowRoot = container.attachShadow({ mode: 'open' });

    // 设置作用域属性
    shadowRoot.host.setAttribute('data-orion-scope', `orion-${key}`);

    // 注入样式隔离补丁
    if (this.config.enableCssScope) {
      this.injectStylePatch(shadowRoot);
    }

    // 创建 Vue 应用
    const { createApp } = await this.loadVue();
    const app = createApp(rootComponent, props);

    // 创建容器元素
    const mountPoint = document.createElement('div');
    mountPoint.id = 'app';
    shadowRoot.appendChild(mountPoint);

    // 挂载应用
    const instance = app.mount(mountPoint);

    // 启用事件转发
    if (this.config.enableEventForwarding) {
      this.enableEventForwarding(key, shadowRoot);
    }

    const appInstance: VueAppInstance = {
      key,
      app,
      instance,
      shadowRoot,
      unmount: () => this.unmount(key),
    };

    this.apps.set(key, appInstance);
    return appInstance;
  }

  /**
   * 卸载 Vue 应用
   */
  unmount(key: string): void {
    const appInstance = this.apps.get(key);
    if (!appInstance) {
      console.warn(`[VueShadowCompat] App ${key} not found`);
      return;
    }

    // 卸载 Vue 应用
    appInstance.app.unmount();

    // 移除 DOM
    appInstance.shadowRoot.innerHTML = '';

    this.apps.delete(key);
  }

  /**
   * 获取已挂载的应用
   */
  getApp(key: string): VueAppInstance | undefined {
    return this.apps.get(key);
  }

  /**
   * 获取所有已挂载的应用
   */
  getAllApps(): VueAppInstance[] {
    return Array.from(this.apps.values());
  }

  /**
   * 检查应用是否已挂载
   */
  isMounted(key: string): boolean {
    return this.apps.has(key);
  }

  /**
   * 加载 Vue 3（从全局或模块）
   */
  private async loadVue(): Promise<{
    createApp: (...args: any[]) => Vue3App;
    version: string;
  }> {
    // 尝试从全局获取 Vue
    const vue = (globalThis as any).Vue;
    if (vue && vue.createApp) {
      return {
        createApp: vue.createApp,
        version: vue.version || '3.x',
      };
    }

    // 尝试从模块获取（SSR 场景）
    try {
      const vueModuleName = 'vue';
      const vueModule = await import(/* @vite-ignore */ vueModuleName);
      return {
        createApp: (vueModule as any).createApp,
        version: (vueModule as any).version || '3.x',
      };
    } catch (e) {
      throw new Error(
        '[VueShadowCompat] Vue 3 not found. Please ensure Vue 3 is loaded globally or imported.'
      );
    }
  }

  /**
   * 注入 Vue 样式隔离补丁
   */
  private injectStylePatch(shadowRoot: ShadowRoot): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Vue Shadow DOM 样式隔离补丁 */
      [data-orion-scope] {
        all: revert;
        box-sizing: border-box;
      }

      [data-orion-scope] * {
        box-sizing: border-box;
      }

      /* Vue Teleport 容器处理 */
      [data-orion-teleport] {
        position: absolute;
      }

      /* Vue transition 动画 */
      [data-orion-scope] .v-enter-active,
      [data-orion-scope] .v-leave-active {
        transition: opacity 0.3s ease;
      }

      [data-orion-scope] .v-enter-from,
      [data-orion-scope] .v-leave-to {
        opacity: 0;
      }
    `;
    style.setAttribute('data-orion-vue-patch', 'true');
    shadowRoot.appendChild(style);
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
   * 处理 Vue Teleport 组件
   * 将 Teleport 目标容器指向 Shadow DOM 内
   */
  handleTeleport(
    app: Vue3App,
    teleportTargets: Map<string, HTMLElement>
  ): void {
    // Vue 3 的 Teleport 默认挂载到 document.body
    // 需要拦截并重定向到 Shadow DOM 内
    app.config.globalProperties.$teleportTo = (target: string) => {
      return teleportTargets.get(target) || document.body;
    };
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
 * 创建 Vue 子应用实例的便捷函数
 */
export async function createVueSubApp(
  config: VueAppConfig,
  vueCompat?: VueShadowCompat
): Promise<VueAppInstance> {
  const compat = vueCompat || new VueShadowCompat();
  return compat.mount(config);
}

/**
 * 卸载 Vue 子应用
 */
export function destroyVueSubApp(
  key: string,
  vueCompat: VueShadowCompat
): void {
  vueCompat.unmount(key);
}

// ============================================================================
// Export
// ============================================================================

export default VueShadowCompat;