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
 *
 * 实现：基于 EventBus Channel，不再重复实现 listeners/ownerHandlers 逻辑
 */

import { EventBus, eventBus } from './EventBus';
import type { EventBusHandler, EventBusPayload } from './EventBus';

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
// 内部实现 — 基于 EventBus Channel
// ============================================

const ORION_CHANNEL_KEY = '__orion_bus__';

/**
 * Map to track original handler → wrapped handler for proper off() support.
 */
const handlerMap = new WeakMap<OrionBusHandler, Map<OrionBusEventType, EventBusHandler>>();

/**
 * Get the internal Orion channel (created once via EventBus).
 * Uses EventBus.getChannel() to get the internal Channel (not ChannelPublicAPI)
 * which exposes emit() and clearByOwner().
 */
function getChannel() {
  return eventBus.createChannel(ORION_CHANNEL_KEY);
}

/**
 * Get the internal Orion channel instance with full API access.
 */
function getChannelInternal() {
  return EventBus.getInstance().getChannel(ORION_CHANNEL_KEY);
}

/**
 * Get or create the handler map entry for a given handler.
 */
function getHandlerMapEntry(handler: OrionBusHandler): Map<OrionBusEventType, EventBusHandler> {
  let entry = handlerMap.get(handler);
  if (!entry) {
    entry = new Map();
    handlerMap.set(handler, entry);
  }
  return entry;
}

// ============================================
// 便捷方法
// ============================================

/**
 * 订阅事件
 */
export function on(type: OrionBusEventType, handler: OrionBusHandler, owner?: string): () => void {
  const wrapped: EventBusHandler = (payload: EventBusPayload) => {
    handler(payload.data as OrionBusPayload);
  };

  getHandlerMapEntry(handler).set(type, wrapped);

  return getChannel().on(type, wrapped, owner);
}

/**
 * 取消订阅
 */
export function off(type: OrionBusEventType, handler: OrionBusHandler): void {
  const entry = handlerMap.get(handler);
  const wrapped = entry?.get(type);
  if (wrapped && entry) {
    getChannel().off(type, wrapped);
    entry.delete(type);
  }
}

/**
 * 发布事件
 */
export function emit(type: OrionBusEventType, data: Record<string, any> = {}, options?: { source?: 'main' | 'subapp'; appKey?: string }): void {
  const payload: OrionBusPayload = {
    type,
    data,
    source: options?.source || 'main',
    appKey: options?.appKey,
    timestamp: Date.now(),
  };

  getChannelInternal()?.emit(type, payload);
}

/**
 * 按所有者批量清理（仅清理 OrionBus 的 Channel）
 */
export function clearByOwner(owner: string): void {
  getChannelInternal()?.clearByOwner(owner);
}

/**
 * 清空所有监听
 */
export function clear(): void {
  EventBus.getInstance().removeChannel(ORION_CHANNEL_KEY);
}

/**
 * 主应用 → 子应用：注入认证状态
 */
export function emitAuthState(auth: { token: string; tenantId?: string; user?: any }): void {
  emit('orionAuth', auth, { source: 'main' });
}

/**
 * 主应用 → 子应用：触发退出登录
 */
export function emitLogout(): void {
  emit('orionLogout', {}, { source: 'main' });
}

/**
 * 子应用 → 主应用：请求导航
 */
export function emitNavigate(path: string, appKey?: string): void {
  emit('subappNavigate', { path }, { source: 'subapp', appKey });
}

/**
 * 子应用 → 主应用：上报错误
 */
export function emitError(appKey: string, error: Error | string): void {
  emit('subappError', { appKey, error: error instanceof Error ? error.message : error }, { source: 'subapp', appKey });
}

/**
 * 子应用 → 主应用：通知已就绪
 */
export function emitReady(appKey: string, duration?: number): void {
  emit('subappReady', { appKey, duration }, { source: 'subapp', appKey });
}

/**
 * 子应用 → 主应用：请求认证
 */
export function emitNeedAuth(appKey: string): void {
  emit('subappNeedAuth', { appKey }, { source: 'subapp', appKey });
}

// ============================================
// 导出
// ============================================

/**
 * 获取底层通信接口（用于高级用法）
 */
export const orionBus = {
  on,
  off,
  emit,
  clearByOwner,
  clear,
};

export type OrionBusInstance = typeof orionBus;
