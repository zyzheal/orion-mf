/**
 * MultiInstanceManager - 多实例支持
 *
 * 管理同一子应用的多个实例，每个实例拥有独立的状态机。
 * 适用于需要在同一页面展示同一子应用多个实例的场景（如多租户场景）。
 *
 * 实例 ID 格式: {appKey}__{timestamp}
 * URL 路由格式: /app/{key}/{instanceId}/*
 */

import { SubAppStateMachine, type SubAppState } from './SubAppStateMachine';

/**
 * 实例配置
 */
export interface InstanceConfig {
  /** 唯一实例 ID（可选，不提供则自动生成） */
  instanceId?: string;
  /** 子应用 key */
  appKey: string;
  /** 实例专属参数 */
  props?: Record<string, any>;
  /** 额外的实例元数据 */
  metadata?: Record<string, any>;
}

/**
 * 实例信息（包含状态）
 */
export interface InstanceInfo {
  /** 实例 ID */
  instanceId: string;
  /** 子应用 key */
  appKey: string;
  /** 实例专属参数 */
  props: Record<string, any>;
  /** 额外的实例元数据 */
  metadata?: Record<string, any>;
  /** 创建时间戳 */
  createdAt: number;
  /** 当前状态 */
  state: SubAppState;
}

/**
 * MultiInstanceManager 配置选项
 */
export interface MultiInstanceManagerOptions {
  /**
   * 实例 ID 生成器
   * 默认为: (appKey) => `${appKey}__${Date.now()}`
   */
  instanceIdGenerator?: (appKey: string) => string;
  /**
   * 是否启用自动清理
   * 当实例数量超过限制时自动清理最旧的实例
   */
  autoCleanup?: boolean;
  /**
   * 每个子应用的最大实例数
   * 默认为 10
   */
  maxInstancesPerApp?: number;
  /**
   * 状态转换回调
   */
  onTransition?: (instanceId: string, from: SubAppState, to: SubAppState) => void;
}

/**
 * MultiInstanceManager - 多实例管理器
 *
 * 核心功能：
 * - 为每个子应用创建和管理多个独立实例
 * - 每个实例拥有独立的 SubAppStateMachine
 * - 支持实例 ID 自动生成和手动指定
 * - 支持实例数量限制和自动清理
 *
 * 使用示例：
 * ```typescript
 * const manager = new MultiInstanceManager();
 *
 * // 创建实例
 * const instanceId1 = manager.createInstance({ appKey: 'pipeline-dashboard' });
 * const instanceId2 = manager.createInstance({ appKey: 'pipeline-dashboard', props: { tenantId: 'tenant-a' } });
 *
 * // 获取实例
 * const instance = manager.getInstance(instanceId1);
 * const instances = manager.getInstances('pipeline-dashboard');
 *
 * // 获取状态机
 * const stateMachine = manager.getStateMachine(instanceId1);
 *
 * // 销毁实例
 * manager.destroyInstance(instanceId1);
 *
 * // 清理应用所有实例
 * manager.cleanupApp('pipeline-dashboard');
 * ```
 */
export class MultiInstanceManager {
  /** 实例配置映射: instanceId → InstanceInfo */
  private instances = new Map<string, InstanceInfo>();

  /** 子应用 key 到实例 ID 集合的映射: appKey → Set<instanceId> */
  private appKeyToInstances = new Map<string, Set<string>>();

  /** 实例 ID 到状态机的映射: instanceId → SubAppStateMachine */
  private stateMachines = new Map<string, SubAppStateMachine>();

  /** 配置选项 */
  private options: Required<MultiInstanceManagerOptions>;

  constructor(options: MultiInstanceManagerOptions = {}) {
    this.options = {
      instanceIdGenerator: options.instanceIdGenerator ?? ((appKey) => `${appKey}__${Date.now()}`),
      autoCleanup: options.autoCleanup ?? false,
      maxInstancesPerApp: options.maxInstancesPerApp ?? 10,
      onTransition: options.onTransition ?? (() => {}),
    };
  }

  /**
   * 创建新实例
   *
   * @param config - 实例配置
   * @returns 实例 ID
   */
  createInstance(config: InstanceConfig): string {
    const { appKey, props = {}, metadata } = config;
    const instanceId = config.instanceId ?? this.options.instanceIdGenerator(appKey);

    // 检查实例是否已存在
    if (this.instances.has(instanceId)) {
      console.warn(`[MultiInstanceManager] Instance ${instanceId} already exists, overwriting`);
      this.destroyInstance(instanceId);
    }

    // 自动清理：如果达到最大实例数，清理最旧的实例
    if (this.options.autoCleanup) {
      this.autoCleanupIfNeeded(appKey);
    }

    // 创建实例信息
    const instanceInfo: InstanceInfo = {
      instanceId,
      appKey,
      props,
      metadata,
      createdAt: Date.now(),
      state: 'idle',
    };

    this.instances.set(instanceId, instanceInfo);

    // 更新 appKey → instanceIds 映射
    if (!this.appKeyToInstances.has(appKey)) {
      this.appKeyToInstances.set(appKey, new Set());
    }
    this.appKeyToInstances.get(appKey)!.add(instanceId);

    // 为实例创建独立的状态机
    const stateMachine = new SubAppStateMachine({
      onTransition: (_key, from, to) => {
        // 更新实例状态
        const instance = this.instances.get(instanceId);
        if (instance) {
          instance.state = to;
        }
        // 触发回调
        this.options.onTransition(instanceId, from, to);
      },
    });
    stateMachine.init(instanceId);
    this.stateMachines.set(instanceId, stateMachine);

    console.log(`[MultiInstanceManager] Created instance ${instanceId} for app ${appKey}`);

    return instanceId;
  }

  /**
   * 销毁指定实例
   *
   * @param instanceId - 实例 ID
   */
  destroyInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.warn(`[MultiInstanceManager] Instance ${instanceId} not found`);
      return;
    }

    // 销毁状态机
    const stateMachine = this.stateMachines.get(instanceId);
    if (stateMachine) {
      stateMachine.reset();
      this.stateMachines.delete(instanceId);
    }

    // 从 appKey → instanceIds 映射中移除
    this.appKeyToInstances.get(instance.appKey)?.delete(instanceId);

    // 清理空的 appKey 映射
    if (this.appKeyToInstances.get(instance.appKey)?.size === 0) {
      this.appKeyToInstances.delete(instance.appKey);
    }

    // 删除实例
    this.instances.delete(instanceId);

    console.log(`[MultiInstanceManager] Destroyed instance ${instanceId}`);
  }

  /**
   * 获取子应用的所有实例 ID
   *
   * @param appKey - 子应用 key
   * @returns 实例 ID 数组
   */
  getInstances(appKey: string): string[] {
    return [...(this.appKeyToInstances.get(appKey) ?? [])];
  }

  /**
   * 获取实例信息
   *
   * @param instanceId - 实例 ID
   * @returns 实例信息或 undefined
   */
  getInstance(instanceId: string): InstanceInfo | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * 获取实例的配置参数
   *
   * @param instanceId - 实例 ID
   * @returns 实例参数或 undefined
   */
  getInstanceProps(instanceId: string): Record<string, any> | undefined {
    return this.instances.get(instanceId)?.props;
  }

  /**
   * 获取实例的状态机
   *
   * @param instanceId - 实例 ID
   * @returns 状态机或 undefined
   */
  getStateMachine(instanceId: string): SubAppStateMachine | undefined {
    return this.stateMachines.get(instanceId);
  }

  /**
   * 获取实例数量
   *
   * @param appKey - 子应用 key
   * @returns 实例数量
   */
  getInstanceCount(appKey: string): number {
    return this.appKeyToInstances.get(appKey)?.size ?? 0;
  }

  /**
   * 获取所有实例数量
   *
   * @returns 所有实例数量
   */
  getTotalInstanceCount(): number {
    return this.instances.size;
  }

  /**
   * 清理指定子应用的所有实例
   *
   * @param appKey - 子应用 key
   * @returns 清理的实例数量
   */
  cleanupApp(appKey: string): number {
    const instanceIds = this.getInstances(appKey);
    const count = instanceIds.length;

    for (const id of instanceIds) {
      this.destroyInstance(id);
    }

    console.log(`[MultiInstanceManager] Cleaned up ${count} instances for app ${appKey}`);

    return count;
  }

  /**
   * 检查实例是否存在
   *
   * @param instanceId - 实例 ID
   * @returns 是否存在
   */
  hasInstance(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  /**
   * 检查子应用是否有实例
   *
   * @param appKey - 子应用 key
   * @returns 是否有实例
   */
  hasAppInstances(appKey: string): boolean {
    return (this.appKeyToInstances.get(appKey)?.size ?? 0) > 0;
  }

  /**
   * 获取所有已创建的子应用 key
   *
   * @returns 子应用 key 数组
   */
  getRegisteredApps(): string[] {
    return [...this.appKeyToInstances.keys()];
  }

  /**
   * 更新实例参数
   *
   * @param instanceId - 实例 ID
   * @param props - 新的参数
   * @returns 是否更新成功
   */
  updateInstanceProps(instanceId: string, props: Record<string, any>): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return false;
    }

    instance.props = { ...instance.props, ...props };
    return true;
  }

  /**
   * 更新实例元数据
   *
   * @param instanceId - 实例 ID
   * @param metadata - 新的元数据
   * @returns 是否更新成功
   */
  updateInstanceMetadata(instanceId: string, metadata: Record<string, any>): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return false;
    }

    instance.metadata = { ...instance.metadata, ...metadata };
    return true;
  }

  /**
   * 根据 URL 路径解析实例 ID
   *
   * 支持以下格式：
   * - /app/pipeline-dashboard (单实例，无 instanceId)
   * - /app/pipeline-dashboard/tenant-a (多实例)
   *
   * @param path - URL 路径
   * @returns 解析结果 { appKey, instanceId?, isMultiInstance }
   */
  parseUrl(path: string): { appKey: string; instanceId?: string; isMultiInstance: boolean } {
    // 移除前缀 /app/
    if (!path.startsWith('/app/')) {
      throw new Error(`Invalid path format: ${path}, expected /app/{key} or /app/{key}/{instanceId}`);
    }

    const parts = path.slice(5).split('/').filter(Boolean);

    if (parts.length === 0) {
      throw new Error(`Invalid path format: ${path}, expected /app/{key} or /app/{key}/{instanceId}`);
    }

    const appKey = parts[0];
    const instanceId = parts[1];

    return {
      appKey,
      instanceId,
      isMultiInstance: !!instanceId,
    };
  }

  /**
   * 生成实例 URL 路径
   *
   * @param appKey - 子应用 key
   * @param instanceId - 实例 ID（可选）
   * @returns URL 路径
   */
  generateUrl(appKey: string, instanceId?: string): string {
    if (instanceId) {
      return `/app/${appKey}/${instanceId}`;
    }
    return `/app/${appKey}`;
  }

  /**
   * 自动清理：如果实例数量超过限制，清理最旧的实例
   *
   * @param appKey - 子应用 key
   */
  private autoCleanupIfNeeded(appKey: string): void {
    const instances = this.appKeyToInstances.get(appKey);
    if (!instances) return;

    if (instances.size >= this.options.maxInstancesPerApp) {
      // 找到最旧的实例
      let oldestInstanceId: string | null = null;
      let oldestTime = Infinity;

      for (const instanceId of instances) {
        const instance = this.instances.get(instanceId);
        if (instance && instance.createdAt < oldestTime) {
          oldestTime = instance.createdAt;
          oldestInstanceId = instanceId;
        }
      }

      if (oldestInstanceId) {
        console.log(`[MultiInstanceManager] Auto-cleanup: destroying oldest instance ${oldestInstanceId}`);
        this.destroyInstance(oldestInstanceId);
      }
    }
  }

  /**
   * 销毁所有实例
   */
  destroy(): void {
    const appKeys = [...this.appKeyToInstances.keys()];

    for (const appKey of appKeys) {
      this.cleanupApp(appKey);
    }

    console.log('[MultiInstanceManager] Destroyed all instances');
  }

  /**
   * 获取实例状态
   *
   * @param instanceId - 实例 ID
   * @returns 当前状态或 undefined
   */
  getInstanceState(instanceId: string): SubAppState | undefined {
    return this.instances.get(instanceId)?.state;
  }

  /**
   * 获取所有实例信息（用于调试）
   *
   * @returns 实例信息数组
   */
  getAllInstances(): InstanceInfo[] {
    return [...this.instances.values()];
  }
}

// ============================================================================
// Global Singleton
// ============================================================================

let globalMultiInstanceManager: MultiInstanceManager | null = null;

/**
 * 获取全局 MultiInstanceManager 实例
 *
 * @param options - 初始化选项
 * @returns MultiInstanceManager 实例
 */
export function getMultiInstanceManager(options?: MultiInstanceManagerOptions): MultiInstanceManager {
  if (!globalMultiInstanceManager) {
    globalMultiInstanceManager = new MultiInstanceManager(options);
  }
  return globalMultiInstanceManager;
}

/**
 * 设置全局 MultiInstanceManager 实例
 *
 * @param manager - MultiInstanceManager 实例
 */
export function setMultiInstanceManager(manager: MultiInstanceManager): void {
  globalMultiInstanceManager = manager;
}

/**
 * 创建 MultiInstanceManager 实例的工厂函数
 *
 * @param options - 初始化选项
 * @returns 新的 MultiInstanceManager 实例
 */
export function createMultiInstanceManager(options?: MultiInstanceManagerOptions): MultiInstanceManager {
  return new MultiInstanceManager(options);
}