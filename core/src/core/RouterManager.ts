/**
 * OrionMF RouterManager - 路由管理模块
 *
 * 负责微前端的路由同步、浏览器前进/后退、URL 编码管理
 */

// ============================================================================
// Types
// ============================================================================

/** History state type */
type HistoryState = Record<string, unknown> | null;

/** 子应用路由配置 */
export interface RouteConfig {
  /** 子应用唯一标识 */
  key: string;
  /** 子应用路由前缀，如 /pipeline */
  path: string;
  /** 是否精确匹配 */
  exact?: boolean;
}

/** 当前路由状态 */
export interface RouteState {
  /** 当前子应用 key */
  currentApp: string;
  /** 子应用内部路径 */
  appPath: string;
  /** URL 查询参数 */
  query: URLSearchParams;
  /** 实例 ID（可选） */
  instanceId?: string;
}

/** 路由变化回调函数类型 */
export type RouteChangeCallback = (state: RouteState) => void;

// ============================================================================
// RouterManager Class
// ============================================================================

/**
 * 路由管理器
 *
 * 负责管理微前端应用的路由同步，包括：
 * - URL 格式: /app/{subAppKey}/* 或 /app/{subAppKey}/{instanceId}/*
 * - 浏览器前进/后退支持 (popstate 事件)
 * - pushState/replaceState 拦截
 * - 子应用内部路由变化通知
 *
 * @example
 * ```typescript
 * const router = new RouterManager();
 * router.register({ key: 'pipeline', path: '/pipeline' });
 * router.init((state) => {
 *   console.log('Route changed:', state);
 * });
 * router.navigate('pipeline', '/runs/123');
 * ```
 */
export class RouterManager {
  /** 注册的路由配置 */
  private routes: Map<string, RouteConfig> = new Map();

  /** 当前路由状态 */
  private current: RouteState | null = null;

  /** popstate 事件处理器 */
  private popStateHandler: ((e: PopStateEvent) => void) | null = null;

  /** 路由变化回调 */
  private onRouteChange?: RouteChangeCallback;

  /** 基础路径 */
  private basePath = '/app';

  /** 原始 pushState 方法 */
  private originalPushState: typeof history.pushState | null = null;

  /** 原始 replaceState 方法 */
  private originalReplaceState: typeof history.replaceState | null = null;

  /** 是否已初始化 */
  private initialized = false;

  /** 是否正在处理内部导航（避免循环触发） */
  private isInternalNavigation = false;

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * 注册子应用路由配置
   *
   * @param config - 路由配置
   */
  register(config: RouteConfig): void {
    if (!config.key) {
      console.warn('[RouterManager] Cannot register route without key');
      return;
    }
    this.routes.set(config.key, config);
  }

  /**
   * 注销子应用路由配置
   *
   * @param key - 子应用 key
   */
  unregister(key: string): void {
    this.routes.delete(key);
  }

  /**
   * 初始化路由监听
   *
   * @param onChange - 路由变化回调函数
   */
  init(onChange: RouteChangeCallback): void {
    if (this.initialized) {
      console.warn('[RouterManager] Already initialized');
      return;
    }

    this.onRouteChange = onChange;

    // 设置 popstate 事件监听
    this.popStateHandler = (_event: PopStateEvent) => {
      const state = this.parseURL();
      if (state) {
        this.current = state;
        this.onRouteChange?.(state);
      }
    };

    window.addEventListener('popstate', this.popStateHandler);

    // 拦截 pushState/replaceState
    this.patchHistoryAPI();

    // 首次解析当前 URL
    const initialState = this.parseURL();
    if (initialState) {
      this.current = initialState;
      this.onRouteChange?.(initialState);
    }

    this.initialized = true;
  }

  /**
   * 导航到子应用
   *
   * @param appKey - 子应用 key
   * @param appPath - 子应用内部路径
   * @param replace - 是否替换当前历史记录
   */
  navigate(appKey: string, appPath: string, replace = false): void {
    const route = this.routes.get(appKey);
    if (!route) {
      console.warn(`[RouterManager] Unknown app: ${appKey}`);
      return;
    }

    // 构建 URL
    const url = this.buildURL(appKey, appPath);

    // 执行导航
    this.isInternalNavigation = true;
    try {
      if (replace) {
        history.replaceState({ appKey, appPath }, '', url);
      } else {
        history.pushState({ appKey, appPath }, '', url);
      }
    } finally {
      this.isInternalNavigation = false;
    }

    // 更新当前状态
    const instanceId = this.parseInstanceId(appPath);
    // 如果 appPath 包含 instanceId 前缀，需要去掉它得到纯路径
    const normalizedAppPath = instanceId
      ? appPath.replace(/^\/~[^/]+/, '')
      : appPath;

    this.current = {
      currentApp: appKey,
      appPath: normalizedAppPath || '/',
      query: new URLSearchParams(window.location.search),
      instanceId,
    };
  }

  /**
   * 子应用内部路由变化时调用
   *
   * 更新 URL 但不触发 pushState（避免循环）
   *
   * @param appKey - 子应用 key
   * @param appPath - 子应用内部路径（可包含 instanceId，如 /~instance123/dashboard）
   */
  notifyAppRouteChange(appKey: string, appPath: string): void {
    // 解析 instanceId 并提取纯 appPath
    const instanceId = this.parseInstanceId(appPath);
    // 如果 appPath 包含 instanceId 前缀，需要去掉它得到纯路径
    const normalizedAppPath = instanceId
      ? appPath.replace(/^\/~[^/]+/, '')
      : appPath;

    // 构建 URL 并更新
    const url = this.buildURL(appKey, appPath) + window.location.search;
    history.replaceState({ appKey, appPath }, '', url);

    if (this.current) {
      this.current.appPath = normalizedAppPath || '/';
      this.current.instanceId = instanceId;
      this.current.query = new URLSearchParams(window.location.search);
    }
  }

  /**
   * 获取当前路由状态
   *
   * @returns 当前路由状态
   */
  getCurrent(): RouteState | null {
    return this.current;
  }

  /**
   * 获取所有注册的路由
   *
   * @returns 路由配置映射
   */
  getRoutes(): Map<string, RouteConfig> {
    return new Map(this.routes);
  }

  /**
   * 检查路由是否已注册
   *
   * @param key - 子应用 key
   * @returns 是否已注册
   */
  hasRoute(key: string): boolean {
    return this.routes.has(key);
  }

  /**
   * 销毁路由管理器
   */
  destroy(): void {
    // 移除 popstate 监听
    if (this.popStateHandler) {
      window.removeEventListener('popstate', this.popStateHandler);
      this.popStateHandler = null;
    }

    // 恢复原始 history API
    this.restoreHistoryAPI();

    // 清除状态
    this.onRouteChange = undefined;
    this.current = null;
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 构建 URL
   *
   * @param appKey - 子应用 key
   * @param appPath - 子应用内部路径
   * @returns 完整 URL
   */
  private buildURL(appKey: string, appPath: string): string {
    // 处理 instanceId 格式: /app/{subAppKey}/{instanceId}/*
    if (appPath.startsWith('/~')) {
      // 包含 instanceId 的路径
      return `${this.basePath}/${appKey}${appPath}`;
    }
    return `${this.basePath}/${appKey}${appPath}`;
  }

  /**
   * 解析 URL 为路由状态
   *
   * @returns 路由状态
   */
  private parseURL(): RouteState | null {
    const pathname = window.location.pathname;

    // 检查是否以 basePath 开头
    if (!pathname.startsWith(this.basePath)) {
      return null;
    }

    // 解析路径: /app/{subAppKey}/* 或 /app/{subAppKey}/{instanceId}/*
    const pathAfterBase = pathname.slice(this.basePath.length + 1);
    if (!pathAfterBase) {
      return null;
    }

    const parts = pathAfterBase.split('/');
    const appKey = parts[0];

    // 检查路由是否注册
    const route = this.routes.get(appKey);
    if (!route) {
      console.warn(`[RouterManager] No route registered for app: ${appKey}`);
      return null;
    }

    // 解析 appPath 和 instanceId
    const remainingParts = parts.slice(1);
    let appPath: string;
    let instanceId: string | undefined;

    if (remainingParts.length > 0) {
      // 检查是否有 instanceId (以 ~ 开头)
      if (remainingParts[0].startsWith('~')) {
        instanceId = remainingParts[0].slice(1); // 去掉 ~ 前缀
        appPath = '/' + remainingParts.slice(1).join('/');
      } else {
        appPath = '/' + remainingParts.join('/');
      }
    } else {
      appPath = route.path || '/';
    }

    return {
      currentApp: appKey,
      appPath,
      query: new URLSearchParams(window.location.search),
      instanceId,
    };
  }

  /**
   * 解析 instanceId
   *
   * @param appPath - 应用路径
   * @returns instanceId 或 undefined
   */
  private parseInstanceId(appPath: string): string | undefined {
    // 检查路径是否包含 instanceId (格式: /~{instanceId}/...)
    const match = appPath.match(/^\/~([^/]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * 拦截 History API
   */
  private patchHistoryAPI(): void {
    // 保存原始方法
    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);

    // 拦截 pushState
    history.pushState = ((state: unknown, title: string, url?: string | URL | null) => {
      this.originalPushState?.(state as HistoryState, title, url);

      // 解析新的 URL 并触发回调
      if (!this.isInternalNavigation) {
        const parsed = this.parseURL();
        if (parsed) {
          this.current = parsed;
          this.onRouteChange?.(parsed);
        }
      }
    }) as typeof history.pushState;

    // 拦截 replaceState
    history.replaceState = ((state: unknown, title: string, url?: string | URL | null) => {
      this.originalReplaceState?.(state as HistoryState, title, url);

      // 解析新的 URL 并触发回调
      if (!this.isInternalNavigation) {
        const parsed = this.parseURL();
        if (parsed) {
          this.current = parsed;
          this.onRouteChange?.(parsed);
        }
      }
    }) as typeof history.replaceState;
  }

  /**
   * 恢复原始 History API
   */
  private restoreHistoryAPI(): void {
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default RouterManager;