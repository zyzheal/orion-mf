/**
 * SubAppStateMachine - 生命周期状态机
 *
 * 管理微前端子应用的生命周期状态转换
 * 支持8个状态和快速切换场景下的取消操作
 */

export type SubAppState =
  | 'idle'
  | 'loading'       // 加载远程模块
  | 'bootstrapping' // 执行 bootstrap 钩子
  | 'mounting'      // 执行 mount 钩子
  | 'mounted'       // 已挂载
  | 'unmounting'    // 执行 unmount 钩子
  | 'unmounted'     // 已卸载
  | 'error';        // 错误状态

/**
 * 状态转换定义
 */
interface StateTransition {
  from: SubAppState;
  to: SubAppState;
  action: string;
}

/**
 * 有效的状态转换白名单
 * 定义了所有允许的状态转换及其触发动作
 */
export const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'idle', to: 'loading', action: 'load' },
  { from: 'loading', to: 'bootstrapping', action: 'bootstrap' },
  { from: 'bootstrapping', to: 'mounting', action: 'mount' },
  { from: 'mounting', to: 'mounted', action: 'complete' },
  { from: 'mounted', to: 'unmounting', action: 'unmount' },
  { from: 'unmounting', to: 'unmounted', action: 'complete' },
  { from: 'loading', to: 'error', action: 'fail' },
  { from: 'bootstrapping', to: 'error', action: 'fail' },
  { from: 'mounting', to: 'error', action: 'fail' },
  { from: 'mounted', to: 'error', action: 'fail' },
  { from: 'unmounting', to: 'error', action: 'fail' },
  { from: 'error', to: 'loading', action: 'retry' },
  { from: 'unmounted', to: 'loading', action: 'load' },
];

/**
 * SubAppStateMachine 配置选项
 */
interface SubAppStateMachineOptions {
  /**
   * 状态转换回调
   */
  onTransition?: (key: string, from: SubAppState, to: SubAppState) => void;
}

/**
 * 生命周期状态机
 *
 * 管理微前端子应用的8个生命周期状态：
 * idle → loading → bootstrapping → mounting → mounted → unmounting → unmounted → error
 *
 * 使用白名单机制验证状态转换，支持快速切换场景下的取消操作
 */
export class SubAppStateMachine {
  private states = new Map<string, SubAppState>();
  private abortControllers = new Map<string, AbortController>();
  private onTransition?: (key: string, from: SubAppState, to: SubAppState) => void;

  constructor(options?: SubAppStateMachineOptions) {
    this.onTransition = options?.onTransition;
  }

  /**
   * 初始化子应用状态
   * 将子应用设置为 idle 状态
   *
   * @param key - 子应用标识
   */
  init(key: string): void {
    this.states.set(key, 'idle');
  }

  /**
   * 执行状态转换
   * 根据当前状态和动作查找有效的转换规则
   *
   * @param key - 子应用标识
   * @param action - 触发动作
   * @throws 如果转换无效则抛出错误
   */
  transition(key: string, action: string): void {
    const currentState = this.states.get(key) ?? 'idle';
    const validTransition = VALID_TRANSITIONS.find(
      t => t.from === currentState && t.action === action
    );

    if (!validTransition) {
      throw new Error(
        `[SubAppStateMachine] Invalid transition: ${currentState} -> ${action} for ${key}`
      );
    }

    const oldState = currentState;
    this.states.set(key, validTransition.to);
    this.onTransition?.(key, oldState, validTransition.to);

    // 如果转换到 loading，创建新的 AbortController
    if (validTransition.to === 'loading') {
      this.abortControllers.set(key, new AbortController());
    }

    // 如果转换到 unmounted，清理 AbortController
    if (validTransition.to === 'unmounted') {
      this.abortControllers.delete(key);
    }

    // 如果转换到 error，保留 AbortController 供后续 retry 使用
  }

  /**
   * 获取子应用当前状态
   *
   * @param key - 子应用标识
   * @returns 当前状态，默认为 'idle'
   */
  getState(key: string): SubAppState {
    return this.states.get(key) ?? 'idle';
  }

  /**
   * 检查子应用是否可以加载
   * 只有在 idle、unmounted 或 error 状态时可以加载
   *
   * @param key - 子应用标识
   * @returns 是否可以加载
   */
  canLoad(key: string): boolean {
    const state = this.getState(key);
    return state === 'idle' || state === 'unmounted' || state === 'error';
  }

  /**
   * 取消正在进行的异步操作
   * 用于快速切换场景：用户从子应用A快速切换到子应用B时
   * 取消子应用A正在进行的 loading/bootstrapping/mounting 操作
   *
   * @param key - 子应用标识
   */
  cancelPending(key: string): void {
    const state = this.getState(key);
    if (state === 'loading' || state === 'bootstrapping' || state === 'mounting') {
      this.abortControllers.get(key)?.abort();
      this.states.set(key, 'unmounted');
      this.abortControllers.delete(key);
    }
  }

  /**
   * 获取 AbortSignal 用于取消正在进行的异步操作
   * 信号会传播到 MF 加载和 bootstrap/mount 钩子
   *
   * @param key - 子应用标识
   * @returns AbortSignal 或 undefined
   */
  getAbortSignal(key: string): AbortSignal | undefined {
    return this.abortControllers.get(key)?.signal;
  }

  /**
   * 销毁子应用状态
   * 清理所有相关资源
   *
   * @param key - 子应用标识
   */
  destroy(key: string): void {
    this.cancelPending(key);
    this.states.delete(key);
  }

  /**
   * 获取所有注册的子应用
   *
   * @returns 子应用 key 数组
   */
  getRegisteredApps(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * 重置状态机
   * 清空所有状态和 AbortController
   */
  reset(): void {
    // 先取消所有pending操作
    for (const key of this.states.keys()) {
      this.cancelPending(key);
    }
    this.states.clear();
  }
}