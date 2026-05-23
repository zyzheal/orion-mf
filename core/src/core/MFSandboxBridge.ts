/**
 * OrionMF MFSandboxBridge Module - MF and Sandbox Bridge
 *
 * Bridges Module Federation loading with JavaScript sandbox isolation
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §3.1
 */

import { Sandbox, GlobalWrapper, SandboxProxy } from './Sandbox';
import { StyleIsolator } from './StyleIsolator';
import { ErrorIsolator } from './ErrorIsolator';
import { GlobalStyleCache } from './GlobalStyleCache';
import type { IStyleIsolator, CSSIsolationMode } from './interface';

// ============================================================================
// Type Definitions
// ============================================================================

/** SubApp configuration */
export interface SubAppConfig {
  /** Unique key for the sub-app */
  key: string;
  /** Sub-app name */
  name: string;
  /** Module Federation remote entry URL */
  remoteEntry: string;
  /** Remote module name (default: './index') */
  remoteName?: string;
  /** Development entry URL */
  entry_dev?: string;
  /** Production entry URL */
  entry_prod?: string;
  /** Whether to skip Shadow DOM (for compatibility mode) */
  noShadowDOM?: boolean;
  /** CSS isolation strategy */
  cssIsolation?: CSSIsolationMode;
  /** Whether to share dependencies with the host app (default: false).
   * When true, the sub-app uses shared dependencies from the host.
   * Requires the sub-app to be built with matching shared config. */
  useShared?: boolean;
  /** Enable error boundary */
  errorBoundary?: boolean;
  /** Props passed to the sub-app's mount lifecycle (e.g., basename, token) */
  props?: Record<string, unknown>;
}

/** SubApp lifecycle hooks */
export interface SubAppLifecycle {
  /** Bootstrap hook - called once before mount */
  bootstrap?: () => Promise<void> | void;
  /** Mount hook - called when component should be mounted */
  mount: (container: HTMLElement, props?: Record<string, unknown>) => Promise<void> | void;
  /** Unmount hook - called when component should be unmounted */
  unmount?: () => Promise<void> | void;
}

/** Loaded sub-app instance */
export interface SubAppInstance {
  /** Sub-app key */
  key: string;
  /** Container element or Shadow Root */
  root: HTMLElement | ShadowRoot;
  /** Sandbox proxy for this sub-app */
  sandbox: SandboxProxy;
  /** Lifecycle hooks */
  lifecycle: SubAppLifecycle;
  /** Cleanup function */
  destroy: () => Promise<void>;
}

/** Remote module loaded from Module Federation */
export interface RemoteModule {
  /** Module factory function */
  factory: () => Promise<any>;
  /** Module chunk */
  chunk: any;
  /** Error if loading failed */
  error?: Error;
}

/** Module Federation loader interface */
export interface MFLoader {
  /** Load remote modules */
  load(remoteEntry: string, remoteName?: string): Promise<RemoteModule[]>;
}

/** Lifecycle modules from MF */
export interface LifecycleModules {
  /** Bootstrap function */
  bootstrap?: () => Promise<void> | void;
  /** Mount function */
  mount: (container: HTMLElement, props?: Record<string, unknown>) => Promise<void> | void;
  /** Unmount function */
  unmount?: () => Promise<void> | void;
}

// ============================================================================
// Default MF Loader (Browser Module Federation)
// ============================================================================

/**
 * Default Module Federation loader using native import()
 *
 * In a real implementation, this would use @module-federation/runtime
 * or webpack's Module Federation runtime
 */
class DefaultMFLoader implements MFLoader {
  private moduleCache = new Map<string, RemoteModule[]>();

  async load(remoteEntry: string, remoteName: string = './index'): Promise<RemoteModule[]> {
    // Check cache first
    const cacheKey = `${remoteEntry}:${remoteName}`;
    if (this.moduleCache.has(cacheKey)) {
      return this.moduleCache.get(cacheKey)!;
    }

    try {
      // Dynamic import - in real implementation this would use MF runtime
      // For now, we simulate the loading
      const modules = await this.simulateMFLoad(remoteEntry, remoteName);
      this.moduleCache.set(cacheKey, modules);
      return modules;
    } catch (error) {
      console.error(`[orion-mf] Failed to load remote module: ${remoteEntry}`, error);
      throw error;
    }
  }

  /**
   * Simulate Module Federation loading
   * In production, this would use actual MF runtime
   */
  private async simulateMFLoad(remoteEntry: string, remoteName: string): Promise<RemoteModule[]> {
    try {
      // Step 1: Import the remoteEntry.js (federation bootstrap)
      const remoteEntryModule = await import(/* @vite-ignore */ remoteEntry);

      // Step 2: If it has a `get` function (originjs federation API), use it to load the actual chunk
      // NOTE: originjs's get() returns Promise<factory>, NOT a factory directly.
      // The factory is () => moduleExports or () => moduleExports.default
      if (remoteEntryModule && typeof remoteEntryModule.get === 'function') {
        // get() calls m[name]() which returns Promise<() => chunk> from the import().then() chain
        const factory = await remoteEntryModule.get(remoteName);
        if (factory && typeof factory === 'function') {
          // factory() returns the actual module namespace object (or e.default)
          const chunk = factory();
          return [
            {
              factory: () => Promise.resolve(chunk),
              chunk,
            },
          ];
        }
      }

      // Step 3: Fallback - treat the remoteEntry itself as the module (direct ESM)
      return [
        {
          factory: () => Promise.resolve(remoteEntryModule),
          chunk: remoteEntryModule,
        },
      ];
    } catch {
      return [];
    }
  }
}

// ============================================================================
// MFSandboxBridge Class
// ============================================================================

/**
 * MFSandboxBridge - Bridge between Module Federation and Sandbox
 *
 * Coordinates:
 * - MF Loader: loads shared modules from remote entries
 * - Sandbox: creates isolated execution context
 * - Renderer: mounts to Shadow DOM
 *
 * Lifecycle: MF load → Sandbox create → Lifecycle init → Mount
 */
export class MFSandboxBridge {
  /** Module Federation loader */
  private mfLoader: MFLoader;

  /** CSS style isolator */
  private styleIsolator: IStyleIsolator;

  /** Error isolator */
  private errorIsolator: ErrorIsolator;

  /** Global style cache */
  private styleCache = new GlobalStyleCache();

  /** Loaded sub-app instances */
  private instances = new Map<string, SubAppInstance>();

  /** Sandboxes */
  private sandboxes = new Map<string, Sandbox>();

  /** Global style mirror observers */
  private globalStyleObservers = new Map<string, MutationObserver>();

  /**
   * Create a new MFSandboxBridge
   *
   * @param options - Configuration options
   */
  constructor(options?: {
    mfLoader?: MFLoader;
    styleIsolator?: IStyleIsolator;
    errorIsolator?: ErrorIsolator;
  }) {
    this.mfLoader = options?.mfLoader ?? new DefaultMFLoader();
    this.styleIsolator = options?.styleIsolator ?? new StyleIsolator();
    this.errorIsolator = options?.errorIsolator ?? new ErrorIsolator();
  }

  /**
   * Load a sub-app
   *
   * @param config - Sub-app configuration
   * @returns Loaded sub-app instance
   */
  async loadSubApp(config: SubAppConfig): Promise<SubAppInstance> {
    const { key, name, remoteEntry, remoteName, noShadowDOM, cssIsolation, errorBoundary, props } = config;

    console.log(`[orion-mf] loadSubApp called for "${key}" with props:`, props);

    // Check if already loaded
    if (this.instances.has(key)) {
      console.warn(`[orion-mf] Sub-app "${key}" already loaded, returning existing instance`);
      return this.instances.get(key)!;
    }

    console.info(`[orion-mf] Loading sub-app: ${name} (${key})`);

    // Step 1: Load remote modules via Module Federation
    let remoteModules: RemoteModule[];
    try {
      remoteModules = await this.mfLoader.load(remoteEntry, remoteName);
    } catch (error) {
      console.error(`[orion-mf] Failed to load remote modules for "${key}":`, error);
      throw error;
    }

    // Step 2: Create sandbox for isolation
    const sandbox = GlobalWrapper.createSandbox(key);
    this.sandboxes.set(key, sandbox);
    const sandboxCtx = sandbox.proxy;

    // Step 3: Extract lifecycle from remote modules
    const lifecycle = this.initLifecycle(remoteModules, sandboxCtx, key);

    // Step 4: Setup error boundary if enabled
    let errorCallback: ((error: Error) => void) | undefined;
    if (errorBoundary) {
      errorCallback = (error: Error) => {
        console.error(`[orion-mf] Error in sub-app "${key}":`, error);
        // Trigger crash recovery if available
      };
      this.errorIsolator.setup(key, errorCallback);
    }

    // Step 5: Mount to Shadow DOM or regular DOM
    let root: HTMLElement | ShadowRoot;
    try {
      if (noShadowDOM) {
        // Compatible mode: mount to regular DOM
        root = this.mountToDOM(key, lifecycle, props);
      } else {
        // Full mode: mount to Shadow DOM
        root = this.mountToShadowDOM(key, lifecycle, cssIsolation, props);
      }
    } catch (error) {
      console.error(`[orion-mf] Failed to mount sub-app "${key}":`, error);
      // Cleanup sandbox on mount failure
      this.cleanupSubApp(key);
      throw error;
    }

    // Create instance
    const instance: SubAppInstance = {
      key,
      root,
      sandbox: sandboxCtx,
      lifecycle,
      destroy: () => this.destroy(key),
    };

    this.instances.set(key, instance);

    console.info(`[orion-mf] Sub-app loaded: ${name} (${key})`);

    return instance;
  }

  /**
   * Initialize lifecycle hooks from remote modules
   *
   * @param remoteModules - Modules loaded from MF
   * @param ctx - Sandbox proxy context
   * @param key - Sub-app key for error tracking
   * @returns Initialized lifecycle hooks
   */
  private initLifecycle(
    remoteModules: RemoteModule[],
    ctx: SandboxProxy,
    key: string
  ): SubAppLifecycle {
    const module = remoteModules[0]?.chunk;
    let lifecycle: SubAppLifecycle = {
      mount: () => {
        console.warn(`[orion-mf] Default mount called for "${key}" - no lifecycle found`);
      },
    };

    if (module) {
      let exports = module;

      // Debug: log module structure
      console.log(`[orion-mf][initLifecycle] ${key} - module keys:`, typeof exports === 'object' ? Object.keys(exports).slice(0, 10).join(', ') + '...' : typeof exports);
      console.log(`[orion-mf][initLifecycle] ${key} - __esModule:`, exports?.__esModule);
      console.log(`[orion-mf][initLifecycle] ${key} - has mount/bootstrap/unmount:`, !!(exports as any)?.mount, !!(exports as any)?.bootstrap, !!(exports as any)?.unmount);
      console.log(`[orion-mf][initLifecycle] ${key} - default type:`, typeof (exports as any)?.default);

      if (exports?.__esModule) {
        const hasLifecycle = (exports as any).bootstrap || (exports as any).mount || (exports as any).unmount;
        if (!hasLifecycle) {
          console.log(`[orion-mf][initLifecycle] ${key} - no lifecycle on __esModule, unwrapping .default`);
          exports = exports.default ?? exports;
        } else {
          console.log(`[orion-mf][initLifecycle] ${key} - lifecycle found on __esModule, keeping as-is`);
        }
      }

      if (
        typeof exports === 'object' &&
        exports !== null &&
        'default' in exports &&
        typeof exports.default !== 'function' &&
        !(exports as any).bootstrap && !(exports as any).mount && !(exports as any).unmount
      ) {
        console.log(`[orion-mf][initLifecycle] ${key} - unwrapping UMD compat .default`);
        exports = exports.default;
      }

      if (typeof exports === 'object' && exports !== null) {
        const { bootstrap, mount, unmount } = exports as any;
        console.log(`[orion-mf][initLifecycle] ${key} - extracted mount:`, typeof mount, 'bootstrap:', typeof bootstrap);

        lifecycle = {
          bootstrap: bootstrap ? this.bindLifecycle(bootstrap, ctx, key) : undefined,
          mount: mount ? this.bindLifecycle(mount, ctx, key) : this.defaultMount,
          unmount: unmount ? this.bindLifecycle(unmount, ctx, key) : undefined,
        };
      } else if (typeof exports === 'function') {
        console.log(`[orion-mf][initLifecycle] ${key} - exports is function, using as mount`);
        lifecycle = {
          mount: this.bindLifecycle(exports, ctx, key),
        };
      }
    } else {
      console.warn(`[orion-mf][initLifecycle] ${key} - no module found`);
    }

    return lifecycle;
  }

  /**
   * Bind a lifecycle function to sandbox context
   *
   * This ensures the function runs with `this` pointing to the sandbox proxy
   */
  private bindLifecycle(
    fn: Function,
    ctx: SandboxProxy,
    key: string
  ): (...args: any[]) => any {
    return (...args: any[]) => {
      try {
        console.log(`[orion-mf] bindLifecycle executing for "${key}", args count:`, args.length);
        // Activate sandbox before executing lifecycle
        GlobalWrapper.activateSandbox(key);

        // Bind function to sandbox context
        return fn.apply(ctx, args);
      } catch (error) {
        console.error(`[orion-mf] Error in lifecycle for "${key}":`, error);
        throw error;
      } finally {
        // Deactivate sandbox after execution
        GlobalWrapper.deactivateSandbox(key);
      }
    };
  }

  /**
   * Copy global styles into Shadow DOM
   * Uses adoptedStyleSheets API for efficient style sharing
   */
  private injectGlobalStyles(shadowRoot: ShadowRoot): void {
    const styleSheets: CSSStyleSheet[] = [];

    // Collect stylesheets from the main document
    for (const sheet of document.styleSheets) {
      try {
        // Try to access cssRules (may fail for cross-origin stylesheets)
        const cssRules = sheet.cssRules;
        if (cssRules) {
          // Create a new stylesheet from the rules
          const newSheet = new CSSStyleSheet();
          let cssText = '';
          for (let i = 0; i < cssRules.length; i++) {
            cssText += cssRules[i].cssText + '\n';
          }
          newSheet.replaceSync(cssText);
          styleSheets.push(newSheet);
        }
      } catch (e) {
        // Cross-origin stylesheet, skip
        console.warn(`[orion-mf] Skipping cross-origin stylesheet:`, sheet.href);
      }
    }

    // Apply all collected stylesheets to the shadow root
    if (styleSheets.length > 0) {
      shadowRoot.adoptedStyleSheets = [...styleSheets];
      console.log(`[orion-mf] Injected ${styleSheets.length} global stylesheets into Shadow DOM`);
    }
  }

  /**
   * Setup observer to catch dynamically injected styles
   * Vite HMR and runtime style injections need to be mirrored into Shadow DOM
   */
  private setupGlobalStyleMirror(key: string, shadowRoot: ShadowRoot): void {
    const observer = new MutationObserver(() => {
      // Re-collect all stylesheets and apply (debounced)
      this._refreshShadowStyles(shadowRoot);
    });

    observer.observe(document.head, { childList: true, subtree: true });
    // Also observe body for style tags that might be appended there
    observer.observe(document.body, { childList: true, subtree: true });

    // Store observer for cleanup
    this.globalStyleObservers.set(key, observer);
  }

  private _refreshShadowStyles(shadowRoot: ShadowRoot): void {
    const styleSheets: CSSStyleSheet[] = [];
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.cssRules) {
          const newSheet = new CSSStyleSheet();
          let cssText = '';
          for (let i = 0; i < sheet.cssRules.length; i++) {
            cssText += sheet.cssRules[i].cssText + '\n';
          }
          newSheet.replaceSync(cssText);
          styleSheets.push(newSheet);
        }
      } catch {
        // Skip cross-origin
      }
    }
    shadowRoot.adoptedStyleSheets = [...styleSheets];
  }

  /**
   * Mount to Shadow DOM with style isolation
   */
  private mountToShadowDOM(
    key: string,
    lifecycle: SubAppLifecycle,
    cssIsolation?: CSSIsolationMode,
    props?: Record<string, unknown>,
  ): ShadowRoot | HTMLElement {
    // 防御性检查：如果已存在同名的容器，直接返回（防止重复挂载）
    const existingContainer = document.getElementById(`orion-mf-container-${key}`);
    if (existingContainer) {
      console.warn(`[orion-mf] Container already exists for "${key}", reusing existing instance`);
      // For shadow-dom mode return the ShadowRoot; for scoped-css return the container
      return existingContainer.shadowRoot || existingContainer;
    }

    // Record global style snapshot before mounting
    this.styleCache.recordStyles(key);

    // Create container in main DOM
    const container = document.createElement('div');
    container.id = `orion-mf-container-${key}`;
    document.body.appendChild(container);

    // Use StyleIsolator with the specified mode
    // 'none' falls back to direct Shadow DOM without CSS scope prefix
    const mode: CSSIsolationMode = cssIsolation || 'shadow-dom';
    let root: ShadowRoot | HTMLElement;

    if (mode === 'none') {
      // Direct Shadow DOM without CSS isolation
      root = container.attachShadow({ mode: 'open' });
    } else {
      // StyleIsolator handles 'shadow-dom' or 'scoped-css'
      root = this.styleIsolator.mount(key, container, mode);
    }

    // For shadow-dom mode: copy global styles and setup mirror
    if (mode === 'shadow-dom' && root instanceof ShadowRoot) {
      this.injectGlobalStyles(root);
      this.setupGlobalStyleMirror(key, root);
    }

    // Run bootstrap if exists
    if (lifecycle.bootstrap) {
      lifecycle.bootstrap();
    }

    // Run mount with props (including basename)
    console.log(`[orion-mf] mountToShadowDOM calling lifecycle.mount with props:`, props);
    lifecycle.mount(root as unknown as HTMLElement, props);

    // Track styles added during mount
    this.styleCache.trackAddedStyles(key);

    return root;
  }

  /**
   * Default mount function (fallback)
   */
  private defaultMount(container: HTMLElement): void {
    container.innerHTML = '<p>Sub-app mounted (default)</p>';
  }

  /**
   * Mount to regular DOM (compatible mode)
   */
  private mountToDOM(key: string, lifecycle: SubAppLifecycle, props?: Record<string, unknown>): HTMLElement {
    // 防御性检查：如果已存在同名的容器，直接返回（防止重复挂载）
    const existingContainer = document.getElementById(`orion-mf-container-${key}`);
    if (existingContainer) {
      console.warn(`[orion-mf] DOM container already exists for "${key}", reusing existing instance`);
      return existingContainer;
    }

    // Record global style snapshot before mounting
    this.styleCache.recordStyles(key);

    // Create container in main DOM
    const container = document.createElement('div');
    container.id = `orion-mf-container-${key}`;
    document.body.appendChild(container);

    // Run bootstrap if exists
    if (lifecycle.bootstrap) {
      lifecycle.bootstrap();
    }

    // Run mount with props (including basename)
    console.log(`[orion-mf] mountToDOM calling lifecycle.mount with props:`, props);
    lifecycle.mount(container, props);

    // Track styles added during mount
    this.styleCache.trackAddedStyles(key);

    return container;
  }

  /**
   * Get a loaded sub-app instance
   */
  getSubApp(key: string): SubAppInstance | undefined {
    return this.instances.get(key);
  }

  /**
   * Check if a sub-app is loaded
   */
  hasSubApp(key: string): boolean {
    return this.instances.has(key);
  }

  /**
   * Get all loaded sub-app keys
   */
  getLoadedKeys(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Cleanup a sub-app resources
   */
  private cleanupSubApp(key: string): void {
    // Remove sandbox
    const sandbox = this.sandboxes.get(key);
    if (sandbox) {
      GlobalWrapper.removeSandbox(key);
      this.sandboxes.delete(key);
    }

    // Remove error boundary
    if (this.errorIsolator.hasBoundary(key)) {
      this.errorIsolator.remove(key);
    }

    // Cleanup global style mirror observer
    const observer = this.globalStyleObservers.get(key);
    if (observer) {
      observer.disconnect();
      this.globalStyleObservers.delete(key);
    }

    // Remove style isolation
    try {
      this.styleIsolator.unmount(key);
    } catch {
      // Ignore cleanup errors
    }

    // Restore global styles (remove styles added by this sub-app)
    this.styleCache.restoreStyles(key);
  }

  /**
   * Destroy a sub-app
   *
   * @param key - Sub-app key
   */
  async destroy(key: string): Promise<void> {
    const instance = this.instances.get(key);
    if (!instance) {
      console.warn(`[orion-mf] Sub-app "${key}" not found, nothing to destroy`);
      return;
    }

    console.info(`[orion-mf] Destroying sub-app: ${key}`);

    // Run unmount lifecycle
    try {
      if (instance.lifecycle.unmount) {
        // Activate sandbox for unmount
        GlobalWrapper.activateSandbox(key);
        await instance.lifecycle.unmount();
      }
    } catch (error) {
      console.error(`[orion-mf] Error during unmount for "${key}":`, error);
    }

    // Always deactivate sandbox regardless of whether unmount lifecycle exists
    GlobalWrapper.deactivateSandbox(key);

    // Unmount from DOM/Shadow DOM
    try {
      if (instance.root instanceof ShadowRoot) {
        // Clean up React root from Shadow DOM
        const container = instance.root.host;
        container.remove();
      } else {
        // Regular DOM
        instance.root.remove();
      }
    } catch (error) {
      console.error(`[orion-mf] Error during DOM cleanup for "${key}":`, error);
    }

    // Cleanup resources
    this.cleanupSubApp(key);

    // Remove instance
    this.instances.delete(key);

    console.info(`[orion-mf] Sub-app destroyed: ${key}`);
  }

  /**
   * Destroy all loaded sub-apps
   */
  async destroyAll(): Promise<void> {
    const keys = Array.from(this.instances.keys());
    await Promise.all(keys.map((key) => this.destroy(key)));
    console.info('[orion-mf] All sub-apps destroyed');
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/** Default MFSandboxBridge instance */
let defaultBridge: MFSandboxBridge | null = null;

/**
 * Get the default MFSandboxBridge instance
 */
export function getBridge(): MFSandboxBridge {
  if (!defaultBridge) {
    defaultBridge = new MFSandboxBridge();
  }
  return defaultBridge;
}

/**
 * Set the default MFSandboxBridge instance
 */
export function setBridge(bridge: MFSandboxBridge): void {
  defaultBridge = bridge;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Load a sub-app using the default bridge
 */
export async function loadSubApp(config: SubAppConfig): Promise<SubAppInstance> {
  return getBridge().loadSubApp(config);
}

/**
 * Destroy a sub-app using the default bridge
 */
export async function destroySubApp(key: string): Promise<void> {
  return getBridge().destroy(key);
}

/**
 * Get a sub-app instance from the default bridge
 */
export function getSubApp(key: string): SubAppInstance | undefined {
  return getBridge().getSubApp(key);
}

// ============================================================================
// Export
// ============================================================================

export default MFSandboxBridge;