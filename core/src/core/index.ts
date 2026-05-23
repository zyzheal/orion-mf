/**
 * OrionMF Core Module
 *
 * Core micro-frontend isolation and lifecycle management
 */

export {
  Sandbox,
  GlobalWrapper,
  createScopedStorage,
  getTargetValue,
  getCurrentRunningApp,
  setCurrentRunningApp,
  nextTask,
  nativeGlobal,
  READONLY_WHITELIST,
  DENYLIST,
} from "./Sandbox";

export {
  SandboxProxy,
} from "./Sandbox";

export {
  SandBoxType,
  SandBox,
  RunningApp,
  SandboxConfig,
  ScopedFunction,
  IStyleIsolator,
  CSSIsolationMode,
} from "./interface";

export { StyleIsolator } from "./StyleIsolator";

export { ErrorIsolator } from "./ErrorIsolator";

export { RouterManager } from "./RouterManager";

export type {
  ErrorBoundary as ErrorBoundaryType,
  ErrorCallback,
} from "./ErrorIsolator";

export type {
  RouteConfig,
  RouteState,
  RouteChangeCallback,
} from "./RouterManager";

// GlobalStore exports
export { GlobalStore, globalStore } from "./GlobalStore";
export {
  setGlobalState,
  getGlobalState,
  subscribeGlobalState,
  getGlobalStates,
  cleanupSubApp,
} from "./GlobalStore";
export type { StoreValue, SubscriberCallback } from "./GlobalStore";

// SubAppDataChannel exports
export { SubAppDataChannel } from "./SubAppDataChannel";
export {
  createDataChannel,
  createFullAccessChannel,
  createReadOnlyChannel,
} from "./SubAppDataChannel";
export type { ChannelConfig, StateChangeCallback } from "./SubAppDataChannel";


export { CrashRecovery } from "./CrashRecovery";

export type {
  RecoveryContext,
  CircuitBreakerConfig as CrashRecoveryConfig,
} from "./CrashRecovery";

// LeakPrevention exports
export { LeakPrevention } from "./LeakPrevention";

export type {
  LeakContext,
  MemoryStats,
} from "./LeakPrevention";

// DegradationStrategy exports
export { DegradationStrategy } from "./DegradationStrategy";

export {
  createDegradationStrategy,
  getDegradationStrategy,
  setDegradationStrategy,
} from "./DegradationStrategy";

export type {
  DegradationLevel,
  DegradationEvent,
  DegradationConfig,
} from "./DegradationStrategy";

// RuntimeCSSPrefixer exports
export { RuntimeCSSPrefixer } from "./RuntimeCSSPrefixer";

export {
  getRuntimeCSSPrefixer,
  createRuntimeCSSPrefixer,
  cleanupRuntimeCSSPrefixer,
} from "./RuntimeCSSPrefixer";

export type {
  CSSPrefixerConfig,
  ReactPatchOptions,
} from "./RuntimeCSSPrefixer";

// EventBus exports
export { EventBus, eventBus } from "./EventBus";
export type {
  EventBusHandler,
  EventBusPayload,
  ChannelOptions,
} from "./EventBus";

// PreloadStrategy exports
export { PreloadStrategy } from "./PreloadStrategy";

export {
  getPreloadStrategy,
  setPreloadStrategy,
} from "./PreloadStrategy";

export type {
  PrefetchMode,
  PrefetchConfig,
  PreloadStrategyOptions,
} from "./PreloadStrategy";

// SubAppCache exports
export { SubAppCache } from "./SubAppCache";

export {
  getSubAppCache,
  setSubAppCache,
} from "./SubAppCache";

export type {
  CacheMode,
  CacheConfig,
  CacheEntry,
  SubAppCacheOptions,
} from "./SubAppCache";

export { DevProxyManager } from "./DevProxyManager";
export { getDevProxyManager, createDevProxyManager } from "./DevProxyManager";
export type { ProxyList, ProxyChangeCallback } from "./DevProxyManager";

// ObservabilityManager exports
export { ObservabilityManager, getObservabilityManager, setObservabilityManager } from './ObservabilityManager';

export type {
  SubAppMetrics,
  MetricsExporter,
  ObservabilityOptions,
} from './ObservabilityManager';


// SubAppRegistry exports
export { SubAppRegistry } from "./SubAppRegistry";
export {
  getSubAppRegistry,
  setSubAppRegistry,
  createSubAppRegistry,
} from "./SubAppRegistry";
export type {
  SubAppRegistration,
  SubAppRegistryOptions,
  RegistryConfig,
} from "./SubAppRegistry";

// A11ySupport exports
export { A11ySupport } from "./A11ySupport";
export {
  getA11ySupport,
  createA11ySupport,
} from "./A11ySupport";
export type {
  A11yConfig,
} from "./A11ySupport";

// MultiInstanceManager exports
export { MultiInstanceManager } from "./MultiInstanceManager";
export {
  getMultiInstanceManager,
  setMultiInstanceManager,
  createMultiInstanceManager,
} from "./MultiInstanceManager";
export type {
  InstanceConfig,
  InstanceInfo,
  MultiInstanceManagerOptions,
} from "./MultiInstanceManager";

// PerformanceBenchmark exports
export { PerformanceBenchmark } from "./PerformanceBenchmark";
export {
  createPerformanceBenchmark,
} from "./PerformanceBenchmark";
export type {
  BenchmarkResult,
  BenchmarkThresholds,
  BenchmarkConfig,
  ThresholdWarning,
} from "./PerformanceBenchmark";

// FrameworkUpgrade exports
export { FrameworkUpgrade } from "./FrameworkUpgrade";
export {
  getFrameworkUpgrade,
  setFrameworkUpgrade,
  createFrameworkUpgrade,
  parseVersion,
  compareVersions,
  isVersionCompatible,
  registerMigration,
  getMigration,
} from "./FrameworkUpgrade";
export type {
  Version,
  CompatibilityResult,
  CodemodChangeType,
  CodemodFileChange,
  Codemod,
  CodemodResult,
  UpgradeProgress,
} from "./FrameworkUpgrade";

// VueShadowCompat exports
export { VueShadowCompat, createVueSubApp, destroyVueSubApp } from './VueShadowCompat';
export type {
  VueAppConfig,
  VueAppInstance,
  VueShadowCompatConfig,
} from './VueShadowCompat';

// Vue2ShadowCompat exports
export { Vue2ShadowCompat, createVue2SubApp, destroyVue2SubApp } from './Vue2ShadowCompat';
export type {
  Vue2AppConfig,
  Vue2AppInstance,
  Vue2ShadowCompatConfig,
} from './Vue2ShadowCompat';

// MicroModuleManager exports
export { MicroModuleManager } from './MicroModuleManager';
export type {
  MicroModuleConfig,
  MicroModuleInstance,
  MicroModuleLoadOptions,
} from './MicroModuleManager';

// DOMAPIPatcher exports
export { DOMAPIPatcher } from './DOMAPIPatcher';

// GlobalStyleCache exports
export { GlobalStyleCache } from './GlobalStyleCache';

// ReactRefreshDetector exports
export {
  ReactRefreshDetector,
  detectReactRefresh,
  isReactRefreshInjected,
} from './ReactRefreshDetector';

// MFSandboxBridge exports (用于子应用加载)
export {
  MFSandboxBridge,
  loadSubApp,
  destroySubApp,
  getSubApp,
  getBridge,
  setBridge,
} from './MFSandboxBridge';

export type {
  SubAppConfig as MFSubAppConfig,
  SubAppInstance,
  SubAppLifecycle,
  RemoteModule,
  MFLoader,
  LifecycleModules,
} from './MFSandboxBridge';

// OrionBus exports - 主应用与子应用标准化通信层
export {
  orionBus,
  emitAuthState,
  emitLogout,
  emitNavigate,
  emitError,
  emitReady,
  emitNeedAuth,
} from './OrionBus';
export type {
  OrionBusInstance,
  OrionBusEventType,
  OrionBusPayload,
  OrionBusHandler,
} from './OrionBus';
