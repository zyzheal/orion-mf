/**
 * OrionBus - 主应用与子应用标准化通信层
 *
 * 对标方案：
 * - qiankun: initGlobalState + onGlobalStateChange
 * - Wujie: wujie.props + wujie.bus
 *
 * 功能：
 * - 主应用 → 子应用：认证状态、主题、菜单、权限等下发
 * - 子应用 → 主应用：导航请求、错误上报、状态反馈等
 * - 支持 owner 追踪，自动清理过期监听器
 */

export type OrionBusEventType =
  // 主应用 → 子应用
  | 'orionAuth'       // 认证状态变更 { token, tenantId, user }
  | 'orionTheme'      // 主题切换 { mode: 'light' | 'dark' }
  | 'orionMenu'       // 菜单配置更新 { items: MenuItem[] }
  | 'orionPermission' // 权限列表更新 { permissions: string[] }
  | 'orionLogout'     // 主应用退出登录

  // 子应用 → 主应用
  | 'subappNavigate'  // 子应用请求导航 { path, state }
  | 'subappReady'     // 子应用加载完成 { appKey, duration }
  | 'subappError'     // 子应用错误上报 { appKey, error }
  | 'subappNeedAuth'  // 子应用需要认证 { appKey }
  | 'subappRefresh'   // 子应用请求刷新数据 { appKey }

  // 双向
  | 'subappCustom';   // 自定义事件 { appKey, event, data }

export interface OrionBusPayload {
  type: OrionBusEventType;
  data: Record<string, any>;
  source: 'main' | 'subapp';
  appKey?: string;
  timestamp: number;
}

export type OrionBusHandler = (payload: OrionBusPayload) => void;

// ============================================
// 内部实现
// ============================================

class OrionBusImpl {
  private listeners = new Map<string, Set<OrionBusHandler>>();
  private ownerHandlers = new Map<string, Set<OrionBusHandler>>();

  /**
   * 订阅事件
   * @param type 事件类型
   * @param handler 处理函数
   * @param owner 可选的所有者标识，用于批量清理
   * @returns 取消订阅函数
   */
  on(type: OrionBusEventType, handler: OrionBusHandler, owner?: string): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);

    if (owner) {
      if (!this.ownerHandlers.has(owner)) {
        this.ownerHandlers.set(owner, new Set());
      }
      this.ownerHandlers.get(owner)!.add(handler);
    }

    return () => this.off(type, handler);
  }

  /**
   * 取消订阅
   */
  off(type: OrionBusEventType, handler: OrionBusHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  /**
   * 发布事件
   */
  emit(type: OrionBusEventType, data: Record<string, any> = {}, options?: { source?: 'main' | 'subapp'; appKey?: string }): void {
    const payload: OrionBusPayload = {
      type,
      data,
      source: options?.source || 'main',
      appKey: options?.appKey,
      timestamp: Date.now(),
    };

    const handlers = this.listeners.get(type);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (e) {
        console.error(`[OrionBus] Handler error for "${type}":`, e);
      }
    }
  }

  /**
   * 按所有者批量清理
   */
  clearByOwner(owner: string): void {
    const handlers = this.ownerHandlers.get(owner);
    if (!handlers) return;

    for (const handler of handlers) {
      for (const listenerSet of this.listeners.values()) {
        listenerSet.delete(handler);
      }
    }
    this.ownerHandlers.delete(owner);
  }

  /**
   * 清空所有监听
   */
  clear(): void {
    this.listeners.clear();
    this.ownerHandlers.clear();
  }
}

// 全局单例
const globalBus = new OrionBusImpl();

// ============================================
// 便捷方法
// ============================================

/**
 * 主应用 → 子应用：注入认证状态
 */
export function emitAuthState(auth: { token: string; tenantId?: string; user?: any }): void {
  globalBus.emit('orionAuth', auth, { source: 'main' });
}

/**
 * 主应用 → 子应用：触发退出登录
 */
export function emitLogout(): void {
  globalBus.emit('orionLogout', {}, { source: 'main' });
}

/**
 * 子应用 → 主应用：请求导航
 */
export function emitNavigate(path: string, appKey?: string): void {
  globalBus.emit('subappNavigate', { path }, { source: 'subapp', appKey });
}

/**
 * 子应用 → 主应用：上报错误
 */
export function emitError(appKey: string, error: Error | string): void {
  globalBus.emit('subappError', { appKey, error: error instanceof Error ? error.message : error }, { source: 'subapp', appKey });
}

/**
 * 子应用 → 主应用：通知已就绪
 */
export function emitReady(appKey: string, duration?: number): void {
  globalBus.emit('subappReady', { appKey, duration }, { source: 'subapp', appKey });
}

/**
 * 子应用 → 主应用：请求认证
 */
export function emitNeedAuth(appKey: string): void {
  globalBus.emit('subappNeedAuth', { appKey }, { source: 'subapp', appKey });
}

// ============================================
// 导出
// ============================================

/**
 * 获取底层 EventBus 实例（用于高级用法）
 */
export const orionBus = {
  on: globalBus.on.bind(globalBus),
  off: globalBus.off.bind(globalBus),
  emit: globalBus.emit.bind(globalBus),
  clearByOwner: globalBus.clearByOwner.bind(globalBus),
  clear: globalBus.clear.bind(globalBus),
};

export type OrionBusInstance = typeof orionBus;
