/**
 * OrionMF Sandbox Module - Pure Proxy based JavaScript Sandbox
 *
 * Design: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §3.2
 */

import { SandBoxType } from './interface';
import type { SandBox } from './interface';

// ============================================================================
// Type Definitions
// ============================================================================

/** Generic global context type */
type GlobalContext = Record<PropertyKey, unknown>;

/** Sandbox proxy type exposed to micro apps */
export type SandboxProxy = Record<PropertyKey, unknown> & {
  hasOwnProperty: (key: PropertyKey) => boolean;
};

/** Running app context */
type RunningApp = { key: string; proxy: SandboxProxy };

// ============================================================================
// Constants - Whitelist & Denylist
// ============================================================================

/**
 * Whitelist: Allowed global properties (read-only)
 * These properties can be accessed from within the sandbox
 */
export const READONLY_WHITELIST: PropertyKey[] = [
  // Built-in constructors
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol',
  'Map', 'Set', 'WeakMap', 'WeakSet',
  'Promise', 'Date', 'RegExp', 'Error',
  'JSON', 'Math', 'Reflect', 'Intl',

  // Console & Performance
  'console', 'performance',

  // URL APIs
  'URL', 'URLSearchParams',

  // Timers
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',

  // Network APIs
  'fetch', 'XMLHttpRequest', 'FormData', 'Blob', 'File',

  // Storage APIs
  'localStorage', 'sessionStorage',

  // Browser APIs
  'navigator', 'location', 'history', 'screen',

  // Observers
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver',

  // Event APIs
  'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent',
];

/**
 * Denylist: Blocked properties
 * These properties cannot be accessed to prevent sandbox escape
 */
export const DENYLIST = new Set<PropertyKey>([
  // Prototype pollution
  '__proto__', 'constructor', 'prototype',
  // Object methods that could be used for prototype pollution
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', 'toSource', 'toString', 'valueOf',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',

  // Dangerous globals
  'eval', 'Function', 'alert', 'confirm', 'prompt',
  'open', 'showModalDialog', 'postMessage',
]);

/**
 * Properties blocked in getOwnPropertyDescriptor trap
 * Subset of DENYLIST that could be used to bypass sandbox via reflection
 */
const REFLECTION_DENYLIST = new Set<PropertyKey>([
  '__proto__', 'constructor', 'prototype',
  'hasOwnProperty', 'isPrototypeOf',
]);

/**
 * Unscopables: Fast path for basic types in 'in' operator
 * These are handled in the has trap for performance
 */
const UNSCOPABLES: Record<string, boolean> = {
  undefined: true,
  Array: true,
  Object: true,
  String: true,
  Boolean: true,
  Math: true,
  Number: true,
  Symbol: true,
  parseFloat: true,
  Float32Array: true,
  isNaN: true,
  Infinity: true,
  Reflect: true,
  Float64Array: true,
  Function: true,
  Map: true,
  NaN: true,
  Promise: true,
  Proxy: true,
  Set: true,
  parseInt: true,
  requestAnimationFrame: true,
};

/**
 * Properties that must be bound to native window for correct 'this' context
 * Without binding, calling these methods would throw "Illegal invocation" error
 */
const NATIVE_WINDOW_BINDINGS = new Set<PropertyKey>([
  'fetch',
  'XMLHttpRequest',
]);

/**
 * Variables that need to escape to global for compatibility (e.g., System.js)
 */
const ESCAPE_TO_GLOBAL: PropertyKey[] = [
  'System',
  '__cjsWrapper',
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Use new Function to get the native global this
 * This is safer than using window directly in sandbox context
 */
export const nativeGlobal = new Function('return this')();

/**
 * Check if a function is a bound function (created with .bind())
 */
function isBoundedFunction(fn: CallableFunction): boolean {
  return fn.name.startsWith('bound ') && !fn.hasOwnProperty('prototype');
}

/**
 * Check if a value is callable (function)
 */
function isCallable(fn: unknown): fn is CallableFunction {
  return typeof fn === 'function';
}

/**
 * Check if a function is constructable (can be used with new)
 */
function isConstructable(fn: unknown): boolean {
  if (!isCallable(fn)) return false;

  // Check if has prototype with constructor
  const proto = (fn as FunctionConstructor).prototype;
  if (proto && (proto as { constructor?: Function }).constructor === fn) {
    return true;
  }

  // Check function string pattern
  const fnString = String(fn);
  return /^function\s[A-Z]/.test(fnString) || fnString.startsWith('class ');
}

// ============================================================================
// WeakMap Cache for Bound Functions
// ============================================================================

const functionBoundedValueMap = new WeakMap<CallableFunction, CallableFunction>();

/**
 * Get the target value with proper binding
 *
 * For callable functions that need to be bound to native window context
 * to avoid "Illegal invocation" errors when called from micro apps.
 *
 * Uses WeakMap cache to avoid rebinding the same function multiple times.
 */
export function getTargetValue(target: unknown, value: unknown): unknown {
  if (
    isCallable(value) &&
    !isBoundedFunction(value) &&
    !isConstructable(value)
  ) {
    const cachedBoundFunction = functionBoundedValueMap.get(value);
    if (cachedBoundFunction) {
      return cachedBoundFunction;
    }

    const boundValue = Function.prototype.bind.call(value, target);

    // Copy enumerable properties
    const valueAsRecord = value as unknown as Record<string, unknown>;
    for (const key in valueAsRecord) {
      (boundValue as unknown as Record<string, unknown>)[key] = valueAsRecord[key];
    }

    // Copy prototype if needed
    if (
      value.hasOwnProperty('prototype') &&
      !boundValue.hasOwnProperty('prototype')
    ) {
      Object.defineProperty(boundValue, 'prototype', {
        value: (value as { prototype: unknown }).prototype,
        enumerable: false,
        writable: true,
      });
    }

    // Handle toString override
    if (typeof value.toString === 'function') {
      const valueHasOwnToString = value.hasOwnProperty('toString');
      const boundValueRecord = boundValue as { toString?: unknown };
      const boundValueHasPrototypeToString =
        boundValueRecord.toString === Function.prototype.toString;

      if (valueHasOwnToString || boundValueHasPrototypeToString) {
        const originToStringDescriptor = Object.getOwnPropertyDescriptor(
          valueHasOwnToString ? value : Function.prototype,
          'toString'
        );

        if (originToStringDescriptor) {
          Object.defineProperty(boundValue, 'toString', {
            ...originToStringDescriptor,
            ...(originToStringDescriptor.get
              ? {}
              : { value: () => value.toString() }),
          });
        }
      }
    }

    functionBoundedValueMap.set(value, boundValue);
    return boundValue;
  }

  return value;
}

// ============================================================================
// Running App Tracking
// ============================================================================

let currentRunningApp: RunningApp | null = null;
let globalTaskPending = false;

/**
 * Get the current running app
 * Used by global hijack methods (e.g., document.createElement) to know
 * which micro app is currently executing
 */
export function getCurrentRunningApp(): RunningApp | null {
  return currentRunningApp;
}

/**
 * Set the current running app
 */
export function setCurrentRunningApp(app: RunningApp | null): void {
  currentRunningApp = app;
}

/**
 * Execute a callback in the next microtask
 * Uses idempotent pattern - even if called multiple times in one task,
 * only the first callback will be executed
 */
export function nextTask(cb: () => void): void {
  if (!globalTaskPending) {
    globalTaskPending = true;
    Promise.resolve().then(() => {
      cb();
      globalTaskPending = false;
    });
  }
}

// ============================================================================
// FakeWindow Creation
// ============================================================================

const rawObjectDefineProperty = Object.defineProperty;

/**
 * Create a fake window object that handles configurable: false properties
 *
 * This is necessary because some browser properties (like top, self, window)
 * are non-configurable and would cause TypeError in Proxy's getOwnPropertyDescriptor trap
 */
function createFakeWindow(
  globalContext: GlobalContext
): { fakeWindow: Record<PropertyKey, unknown>; propertiesWithGetter: Map<PropertyKey, boolean> } {
  const propertiesWithGetter = new Map<PropertyKey, boolean>();
  const fakeWindow: Record<PropertyKey, unknown> = {};

  // Copy non-configurable properties from global context
  Object.getOwnPropertyNames(globalContext)
    .filter((p) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
      return descriptor && !descriptor.configurable;
    })
    .forEach((p) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
      if (descriptor) {
        const hasGetter = 'get' in descriptor;

        // Special handling for top/self/window/parent
        if (['top', 'parent', 'self', 'window'].includes(String(p))) {
          descriptor.configurable = true;
          if (!hasGetter) {
            descriptor.writable = true;
          }
        }

        if (hasGetter) {
          propertiesWithGetter.set(p, true);
        }

        // Freeze descriptor to prevent modification by zone.js
        rawObjectDefineProperty(fakeWindow, p, Object.freeze(descriptor));
      }
    });

  return { fakeWindow, propertiesWithGetter };
}

// ============================================================================
// Unique Array Helper
// ============================================================================

/**
 * Get unique keys from array
 */
function uniq<T extends PropertyKey[]>(array: T): T {
  return array.filter(function (this: Record<string, boolean>, element) {
    return element in this
      ? false
      : ((this as Record<string, boolean>)[String(element)] = true);
  }, Object.create(null)) as T;
}

// ============================================================================
// Sandbox Class
// ============================================================================

let activeSandboxCount = 0;

/**
 * Proxy-based Sandbox implementation
 *
 * Features:
 * - Pure Proxy, no eval/with, compatible with ES Module & Strict Mode
 * - Whitelist/denylist for global access control
 * - Function binding to avoid "Illegal invocation"
 * - FakeWindow for configurable:false properties
 * - RunningApp tracking for global hijack methods
 * - Unscopables fast path for performance
 */
export class Sandbox implements SandBox {
  /** Name of the sandbox */
  name: string;

  /** Sandbox type */
  type: SandBoxType;

  /** The proxy object exposed to micro apps */
  proxy: SandboxProxy;

  /** Original global context */
  globalContext: GlobalContext;

  /** Whether the sandbox is currently running */
  sandboxRunning = true;

  /** Latest property that was set */
  latestSetProp: PropertyKey | null = null;

  /** Set of properties that have been modified */
  private updatedValueSet = new Set<PropertyKey>();

  /** Pending writes queued while sandbox was inactive */
  pendingWrites: Map<PropertyKey, unknown> | null = null;

  /** Properties that have getters */
  private propertiesWithGetter: Map<PropertyKey, boolean>;

  /** HasOwnProperty function for proxy */
  private hasOwnProperty: (key: PropertyKey) => boolean;

  /** Local reference to self for use in proxy handlers */
  private self: Sandbox;

  /**
   * Register the running app
   * Called on each get/set operation to track which micro app is executing
   */
  private registerRunningApp(key: string, proxy: SandboxProxy): void {
    if (this.sandboxRunning) {
      const currentApp = getCurrentRunningApp();
      if (!currentApp || currentApp.key !== key) {
        setCurrentRunningApp({ key, proxy });
      }
      // Use nextTask to clear after current task completes
      nextTask(() => {
        const app = getCurrentRunningApp();
        if (app?.key === key) {
          setCurrentRunningApp(null);
        }
      });
    }
  }

  /**
   * Activate the sandbox
   */
  active(): void {
    if (!this.sandboxRunning) {
      activeSandboxCount++;
    }
    this.sandboxRunning = true;

    // Apply pending writes that were queued while inactive
    if (this.pendingWrites && this.pendingWrites.size > 0) {
      for (const [key, value] of this.pendingWrites) {
        try {
          (this as any).proxy[key] = value;
        } catch (e) {
          console.warn(`[orion-mf] Failed to apply pending write for "${String(key)}":`, e);
        }
      }
      this.pendingWrites.clear();
    }
  }

  /**
   * Deactivate the sandbox
   * Restores modified global properties
   */
  inactive(): void {
    if (process.env.NODE_ENV === 'development') {
      console.info(
        `[orion-mf:sandbox] ${this.name} modified global properties restore...`,
        [...this.updatedValueSet.keys()]
      );
    }

    if (--activeSandboxCount === 0) {
      // Restore escaped variables to global
      ESCAPE_TO_GLOBAL.forEach((p) => {
        if (this.proxy.hasOwnProperty(p)) {
          delete this.globalContext[p as string];
        }
      });
    }

    this.sandboxRunning = false;
  }

  /**
   * Create a new Sandbox instance
   * @param name - Unique identifier for this sandbox
   * @param globalContext - The global context to sandbox (defaults to globalThis)
   */
  constructor(name: string, globalContext: GlobalContext = globalThis) {
    this.name = name;
    this.globalContext = globalContext;
    this.type = SandBoxType.Proxy;
    this.self = this;

    const { fakeWindow, propertiesWithGetter } = createFakeWindow(globalContext);
    this.propertiesWithGetter = propertiesWithGetter;
    this.hasOwnProperty = (key: PropertyKey) =>
      fakeWindow.hasOwnProperty(key) || globalContext.hasOwnProperty(key);

    // Create the main proxy
    const proxy = new Proxy(fakeWindow, {
      /**
       * Set trap - Handle property assignment
       */
      set: (target: Record<PropertyKey, unknown>, p: PropertyKey, value: unknown): boolean => {
        const sandbox = this.self;
        if (sandbox.sandboxRunning) {
          sandbox.registerRunningApp(name, proxy);

          // If property doesn't exist in target but exists in globalContext,
          // we need to preserve its descriptor
          if (!target.hasOwnProperty(p) && globalContext.hasOwnProperty(p)) {
            const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
            if (descriptor) {
              const { writable, configurable, enumerable } = descriptor;
              if (writable) {
                Object.defineProperty(target, p, {
                  configurable,
                  enumerable,
                  writable,
                  value,
                });
              }
            }
          } else {
            target[p] = value;
          }

          // Some variables need to escape to global
          if (ESCAPE_TO_GLOBAL.includes(p)) {
            globalContext[p as string] = value;
          }

          sandbox.updatedValueSet.add(p);
          sandbox.latestSetProp = p;

          return true;
        }

        // Sandbox is inactive - queue the write for next activation
        if (!sandbox.pendingWrites) {
          sandbox.pendingWrites = new Map();
        }
        sandbox.pendingWrites.set(p, value);

        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[orion-mf] Set window.${String(p)} while sandbox inactive in ${name}, queued for next activation`
          );
        }

        return true;
      },

      /**
       * Get trap - Handle property access
       */
      get: (target: Record<PropertyKey, unknown>, p: PropertyKey): unknown => {
        const sandbox = this.self;
        sandbox.registerRunningApp(name, proxy);

        // Block __proto__ to prevent prototype pollution
        if (p === '__proto__') {
          return undefined;
        }

        // Block denylisted properties (eval, Function, alert, etc.)
        if (DENYLIST.has(p)) {
          return undefined;
        }

        // Handle Symbol.unscopables for 'with' statement compatibility
        if (p === Symbol.unscopables) {
          return UNSCOPABLES;
        }

        // Prevent escape via window.window or window.self
        if (p === 'window' || p === 'self') {
          return proxy;
        }

        // Handle globalThis
        if (p === 'globalThis') {
          return proxy;
        }

        // Handle top/parent with iframe awareness
        if (p === 'top' || p === 'parent') {
          // If not in iframe, return proxy; otherwise return real global
          const parentValue = globalContext.parent;
          if (parentValue === globalContext) {
            return proxy;
          }
          return parentValue;
        }

        // Handle hasOwnProperty
        if (p === 'hasOwnProperty') {
          return sandbox.hasOwnProperty;
        }

        // Return native document
        if (p === 'document') {
          return globalContext.document;
        }

        // Determine the value source
        const value = sandbox.propertiesWithGetter.has(p)
          ? globalContext[p as string]
          : p in target
          ? target[p]
          : globalContext[p as string];

        // Bind functions that need native window context
        const boundTarget = NATIVE_WINDOW_BINDINGS.has(p)
          ? nativeGlobal
          : globalContext;

        return getTargetValue(boundTarget, value);
      },

      /**
       * Has trap - Fast path for unscopables
       */
      has: (target: Record<PropertyKey, unknown>, p: PropertyKey): boolean => {
        return (
          p in UNSCOPABLES ||
          p in target ||
          p in globalContext
        );
      },

      /**
       * getOwnPropertyDescriptor trap
       * Required for proper property enumeration
       */
      getOwnPropertyDescriptor(
        target: Record<PropertyKey, unknown>,
        p: PropertyKey
      ): PropertyDescriptor | undefined {
        // Block reflection-based sandbox escape for prototype pollution keys
        if (REFLECTION_DENYLIST.has(p)) {
          return undefined;
        }

        if (target.hasOwnProperty(p)) {
          return Object.getOwnPropertyDescriptor(target, p);
        }

        if (globalContext.hasOwnProperty(p)) {
          const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
          // Make non-configurable properties configurable to avoid errors
          if (descriptor && !descriptor.configurable) {
            descriptor.configurable = true;
          }
          return descriptor;
        }

        return undefined;
      },

      /**
       * ownKeys trap - Support property iteration
       */
      ownKeys: (target: Record<PropertyKey, unknown>): Array<string | symbol> => {
        return uniq(
          Reflect.ownKeys(globalContext).concat(Reflect.ownKeys(target))
        );
      },

      /**
       * defineProperty trap
       */
      defineProperty(
        target: Record<PropertyKey, unknown>,
        p: PropertyKey,
        attributes: PropertyDescriptor
      ): boolean {
        // For simplicity, always define on target
        return Reflect.defineProperty(target, p, attributes);
      },

      /**
       * deleteProperty trap
       */
      deleteProperty: (
        target: Record<PropertyKey, unknown>,
        p: PropertyKey
      ): boolean => {
        const sandbox = this.self;
        sandbox.registerRunningApp(name, proxy);

        if (target.hasOwnProperty(p)) {
          delete target[p];
          sandbox.updatedValueSet.delete(p);
          return true;
        }

        return true;
      },

      /**
       * getPrototypeOf trap
       * Makes 'instanceof Window' work correctly
       */
      getPrototypeOf(): object | null {
        return Reflect.getPrototypeOf(globalContext);
      },
    });

    this.proxy = proxy as SandboxProxy;
    activeSandboxCount++;
  }
}

// ============================================================================
// GlobalWrapper Singleton
// ============================================================================

/** Registry for all active sandboxes */
const sandboxRegistry = new Map<string, Sandbox>();

/**
 * GlobalWrapper - Manages all sandbox instances
 *
 * Provides centralized sandbox lifecycle management:
 * - Create/activate/deactivate sandboxes
 * - Query sandbox state
 * - Clear all sandboxes
 */
export const GlobalWrapper = {
  /**
   * Create and register a new sandbox
   */
  createSandbox(name: string, globalContext?: GlobalContext): Sandbox {
    const sandbox = new Sandbox(name, globalContext);
    sandboxRegistry.set(name, sandbox);
    return sandbox;
  },

  /**
   * Get a sandbox by name
   */
  getSandbox(name: string): Sandbox | undefined {
    return sandboxRegistry.get(name);
  },

  /**
   * Get all sandbox names
   */
  getSandboxNames(): string[] {
    return Array.from(sandboxRegistry.keys());
  },

  /**
   * Get all active sandboxes
   */
  getAllSandboxes(): Sandbox[] {
    return Array.from(sandboxRegistry.values());
  },

  /**
   * Activate a sandbox by name
   */
  activateSandbox(name: string): boolean {
    const sandbox = sandboxRegistry.get(name);
    if (sandbox) {
      sandbox.active();
      return true;
    }
    return false;
  },

  /**
   * Deactivate a sandbox by name
   */
  deactivateSandbox(name: string): boolean {
    const sandbox = sandboxRegistry.get(name);
    if (sandbox) {
      sandbox.inactive();
      return true;
    }
    return false;
  },

  /**
   * Remove a sandbox completely
   */
  removeSandbox(name: string): boolean {
    const sandbox = sandboxRegistry.get(name);
    if (sandbox) {
      // Only deactivate if still running to avoid double-decrementing activeSandboxCount
      if (sandbox.sandboxRunning) {
        sandbox.inactive();
      }
      sandboxRegistry.delete(name);
      return true;
    }
    return false;
  },

  /**
   * Clear all sandboxes
   */
  clearAll(): void {
    sandboxRegistry.forEach((sandbox) => {
      if (sandbox.sandboxRunning) {
        sandbox.inactive();
      }
    });
    sandboxRegistry.clear();
  },
};

// ============================================================================
// Scoped Storage Helper
// ============================================================================

/**
 * Create a scoped storage for a micro app
 * Provides isolated storage that won't conflict with other apps
 */
export function createScopedStorage(
  sandboxKey: string
): Record<string, unknown> {
  const storage: Record<string, unknown> = {};

  // Use a handler object with all required traps
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop): unknown {
      // Handle __proto__ specially - return undefined to block prototype pollution
      if (prop === '__proto__' || prop === 'constructor') {
        console.warn(
          `[orion-mf:sandbox] Blocked access to '${String(prop)}' in scoped storage for "${sandboxKey}"`
        );
        return undefined;
      }

      // Check denylist
      if (DENYLIST.has(prop)) {
        console.warn(
          `[orion-mf:sandbox] Blocked access to '${String(prop)}' in scoped storage for "${sandboxKey}"`
        );
        return undefined;
      }

      return storage[prop as string];
    },

    set(_target, prop, value): boolean {
      // Handle __proto__ and constructor specially
      if (prop === '__proto__' || prop === 'constructor') {
        console.warn(
          `[orion-mf:sandbox] Blocked access to '${String(prop)}' in scoped storage for "${sandboxKey}"`
        );
        // Return true but don't actually set to avoid errors
        return true;
      }

      // Check denylist
      if (DENYLIST.has(prop)) {
        console.warn(
          `[orion-mf:sandbox] Blocked access to '${String(prop)}' in scoped storage for "${sandboxKey}"`
        );
        return false;
      }

      storage[prop as string] = value;
      return true;
    },

    has(_target, prop): boolean {
      return prop in storage;
    },

    deleteProperty(_target, prop): boolean {
      // Handle __proto__ and constructor specially
      if (prop === '__proto__' || prop === 'constructor') {
        return true; // Pretend it's deleted
      }
      return delete storage[prop as string];
    },

    getOwnPropertyDescriptor(_target, prop): PropertyDescriptor | undefined {
      if (prop in storage) {
        return {
          configurable: true,
          enumerable: true,
          value: storage[prop as string],
        };
      }
      return undefined;
    },
  };

  return new Proxy(storage, handler);
}

// ============================================================================
// Export Types
// ============================================================================

export { SandBoxType };
export type { SandBox };