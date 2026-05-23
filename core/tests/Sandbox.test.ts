/**
 * Sandbox Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Sandbox,
  GlobalWrapper,
  createScopedStorage,
  getTargetValue,
  getCurrentRunningApp,
  setCurrentRunningApp,
  nextTask,
  READONLY_WHITELIST,
  DENYLIST,
} from '../src/core/Sandbox';
import { SandBoxType } from '../src/core/interface';

// Create mock window factory
const createMockWindow = () => ({
  customGlobal: 'global-value',
  customFn: function () { return 'fn-result'; },
  Array,
  Object,
  JSON,
  Math,
  Promise,
  Date,
  RegExp,
  Symbol,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Reflect,
  Intl: {},
  console,
  performance: { now: () => Date.now() },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 16),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  fetch: globalThis.fetch || (() => Promise.resolve({})),
  XMLHttpRequest: globalThis.XMLHttpRequest || class XMLHttpRequest {},
  FormData: globalThis.FormData || class FormData {},
  Blob: globalThis.Blob || class Blob {},
  File: globalThis.File || class File {},
  localStorage: globalThis.localStorage || {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  },
  sessionStorage: globalThis.sessionStorage || {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  },
  navigator: globalThis.navigator || { userAgent: 'node' },
  location: globalThis.location || { href: 'http://localhost', origin: 'http://localhost' },
  history: globalThis.history || { pushState: () => {}, replaceState: () => {} },
  screen: globalThis.screen || { width: 1920, height: 1080 },
  IntersectionObserver: globalThis.IntersectionObserver || class IntersectionObserver {},
  MutationObserver: globalThis.MutationObserver || class MutationObserver {},
  ResizeObserver: globalThis.ResizeObserver || class ResizeObserver {},
  CustomEvent: globalThis.CustomEvent || class CustomEvent {},
  Event: globalThis.Event || class Event {},
  MouseEvent: globalThis.MouseEvent || class MouseEvent {},
  KeyboardEvent: globalThis.KeyboardEvent || class KeyboardEvent {},
  URL: globalThis.URL || URL,
  URLSearchParams: globalThis.URLSearchParams || URLSearchParams,
  document: globalThis.document || {
    createElement: () => ({}),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  top: globalThis.top,
  parent: globalThis.parent,
  self: globalThis.self,
  window: globalThis.window,
});

describe('Sandbox Module', () => {
  describe('Sandbox Class', () => {
    let sandbox: Sandbox;
    let testWindow: ReturnType<typeof createMockWindow>;

    beforeEach(() => {
      testWindow = createMockWindow();
      sandbox = new Sandbox('test-app', testWindow as unknown as typeof window);
    });

    afterEach(() => {
      sandbox.inactive();
    });

    describe('constructor', () => {
      it('should create sandbox with correct properties', () => {
        expect(sandbox.name).toBe('test-app');
        expect(sandbox.type).toBe(SandBoxType.Proxy);
        expect(sandbox.sandboxRunning).toBe(true);
        expect(sandbox.proxy).toBeDefined();
      });

      it('should use globalThis as default global context', () => {
        const defaultSandbox = new Sandbox('default-test');
        expect(defaultSandbox.globalContext).toBe(globalThis);
        defaultSandbox.inactive();
      });
    });

    describe('proxy', () => {
      it('should return sandbox proxy for window access', () => {
        // Access to window/self should return proxy itself
        expect(sandbox.proxy.self).toBe(sandbox.proxy);
        expect(sandbox.proxy.window).toBe(sandbox.proxy);
        expect(sandbox.proxy.globalThis).toBe(sandbox.proxy);
      });

      it('should allow access to whitelisted globals', () => {
        expect(sandbox.proxy.Array).toBeDefined();
        expect(sandbox.proxy.Object).toBeDefined();
        expect(sandbox.proxy.JSON).toBeDefined();
        expect(sandbox.proxy.Math).toBeDefined();
        expect(sandbox.proxy.Promise).toBeDefined();
      });

      it('should allow access to custom global properties', () => {
        expect(sandbox.proxy.customGlobal).toBe('global-value');
      });

      it('should track latestSetProp on property set', () => {
        sandbox.proxy.testProp = 'test-value';
        expect(sandbox.latestSetProp).toBe('testProp');
      });

      it('should block prototype pollution attempts', () => {
        // These should return undefined or warning but not crash
        expect(sandbox.proxy.__proto__).toBeUndefined();
      });
    });

    describe('set operations', () => {
      it('should set properties in sandbox', () => {
        sandbox.proxy.foo = 'bar';
        expect(sandbox.proxy.foo).toBe('bar');
      });

      it('should track updated values', () => {
        sandbox.proxy.newProp = 'value';
        // Verify property was tracked (internal state)
        expect(sandbox.proxy.newProp).toBe('value');
      });
    });

    describe('active/inactive', () => {
      it('should toggle sandbox state', () => {
        expect(sandbox.sandboxRunning).toBe(true);
        sandbox.inactive();
        expect(sandbox.sandboxRunning).toBe(false);
        sandbox.active();
        expect(sandbox.sandboxRunning).toBe(true);
      });
    });

    describe('has trap', () => {
      it('should return true for unscopables', () => {
        expect('Object' in sandbox.proxy).toBe(true);
        expect('Array' in sandbox.proxy).toBe(true);
        expect('undefined' in sandbox.proxy).toBe(true);
      });

      it('should return true for global properties', () => {
        expect('customGlobal' in sandbox.proxy).toBe(true);
        expect('customFn' in sandbox.proxy).toBe(true);
      });
    });

    describe('deleteProperty trap', () => {
      it('should delete properties from sandbox', () => {
        sandbox.proxy.deletable = 'to-be-deleted';
        expect(sandbox.proxy.deletable).toBe('to-be-deleted');
        delete sandbox.proxy.deletable;
        // After deletion, should return undefined (from fakeWindow)
        expect(sandbox.proxy.deletable).toBeUndefined();
      });
    });
  });

  describe('GlobalWrapper', () => {
    afterEach(() => {
      GlobalWrapper.clearAll();
    });

    describe('createSandbox', () => {
      it('should create and register a sandbox', () => {
        const mockWin = createMockWindow();
        const sb = GlobalWrapper.createSandbox('app1', mockWin as unknown as typeof window);
        expect(sb).toBeInstanceOf(Sandbox);
        expect(GlobalWrapper.getSandboxNames()).toContain('app1');
      });

      it('should allow creating multiple sandboxes', () => {
        const mockWin1 = createMockWindow();
        const mockWin2 = createMockWindow();
        GlobalWrapper.createSandbox('app1', mockWin1 as unknown as typeof window);
        GlobalWrapper.createSandbox('app2', mockWin2 as unknown as typeof window);
        expect(GlobalWrapper.getSandboxNames()).toHaveLength(2);
      });
    });

    describe('getSandbox', () => {
      it('should retrieve sandbox by name', () => {
        const mockWin = createMockWindow();
        const original = GlobalWrapper.createSandbox('app1', mockWin as unknown as typeof window);
        const retrieved = GlobalWrapper.getSandbox('app1');
        expect(retrieved).toBe(original);
      });

      it('should return undefined for non-existent sandbox', () => {
        expect(GlobalWrapper.getSandbox('non-existent')).toBeUndefined();
      });
    });

    describe('activate/deactivate', () => {
      it('should toggle sandbox state', () => {
        const mockWin = createMockWindow();
        const sb = GlobalWrapper.createSandbox('app1', mockWin as unknown as typeof window);
        sb.inactive();

        const result = GlobalWrapper.activateSandbox('app1');
        expect(result).toBe(true);
        expect(sb.sandboxRunning).toBe(true);

        GlobalWrapper.deactivateSandbox('app1');
        expect(sb.sandboxRunning).toBe(false);
      });

      it('should return false for non-existent sandbox', () => {
        expect(GlobalWrapper.activateSandbox('non-existent')).toBe(false);
        expect(GlobalWrapper.deactivateSandbox('non-existent')).toBe(false);
      });
    });

    describe('removeSandbox', () => {
      it('should remove sandbox completely', () => {
        const mockWin = createMockWindow();
        GlobalWrapper.createSandbox('app1', mockWin as unknown as typeof window);
        expect(GlobalWrapper.getSandboxNames()).toContain('app1');

        const result = GlobalWrapper.removeSandbox('app1');
        expect(result).toBe(true);
        expect(GlobalWrapper.getSandboxNames()).not.toContain('app1');
      });
    });

    describe('clearAll', () => {
      it('should clear all sandboxes', () => {
        const mockWin1 = createMockWindow();
        const mockWin2 = createMockWindow();
        GlobalWrapper.createSandbox('app1', mockWin1 as unknown as typeof window);
        GlobalWrapper.createSandbox('app2', mockWin2 as unknown as typeof window);
        GlobalWrapper.clearAll();
        expect(GlobalWrapper.getSandboxNames()).toHaveLength(0);
      });
    });
  });

  describe('createScopedStorage', () => {
    it('should create isolated storage', () => {
      const storage1 = createScopedStorage('app1');
      const storage2 = createScopedStorage('app2');

      (storage1 as Record<string, unknown>).foo = 'bar';
      (storage2 as Record<string, unknown>).foo = 'baz';

      expect((storage1 as Record<string, unknown>).foo).toBe('bar');
      expect((storage2 as Record<string, unknown>).foo).toBe('baz');
    });

    it('should block __proto__ property', () => {
      const storage = createScopedStorage('app1');

      // Should log warning but not crash
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Setting __proto__ should return true but not actually set
      (storage as Record<string, unknown>).__proto__ = {};
      // Getting __proto__ should return undefined (blocked)
      expect((storage as Record<string, unknown>).__proto__).toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should support has operator', () => {
      const storage = createScopedStorage('app1');
      (storage as Record<string, unknown>).testProp = 'value';

      expect('testProp' in storage).toBe(true);
      expect('nonExistent' in storage).toBe(false);
    });

    it('should support delete operator', () => {
      const storage = createScopedStorage('app1');
      (storage as Record<string, unknown>).testProp = 'value';

      delete (storage as Record<string, unknown>).testProp;
      expect('testProp' in storage).toBe(false);
    });
  });

  describe('getTargetValue', () => {
    const mockWin = createMockWindow();

    it('should return non-functions unchanged', () => {
      expect(getTargetValue(mockWin, 'string')).toBe('string');
      expect(getTargetValue(mockWin, 123)).toBe(123);
      expect(getTargetValue(mockWin, null)).toBe(null);
      expect(getTargetValue(mockWin, undefined)).toBeUndefined();
      expect(getTargetValue(mockWin, { obj: true })).toEqual({ obj: true });
      expect(getTargetValue(mockWin, [1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('should bind callable functions', () => {
      const mockTarget = { name: 'target' };
      const fn = function (this: { name: string }) { return this.name; };

      const boundFn = getTargetValue(mockTarget, fn) as (this: { name: string }) => string;
      expect(boundFn.call(mockTarget)).toBe('target');
    });

    it('should cache bound functions', () => {
      const mockTarget = {};
      const fn = function () { return 'result'; };

      const bound1 = getTargetValue(mockTarget, fn);
      const bound2 = getTargetValue(mockTarget, fn);

      // Should return the same cached function
      expect(bound1).toBe(bound2);
    });

    it('should not bind constructable functions', () => {
      // Class constructors should not be bound
      class TestClass {
        static test() { return 'static'; }
      }

      const result = getTargetValue(mockWin, TestClass);
      expect(result).toBe(TestClass);
    });

    it('should copy enumerable properties', () => {
      const mockTarget = {};
      const fn = function () { return 'result'; };
      (fn as Record<string, string>).customProp = 'customValue';

      const boundFn = getTargetValue(mockTarget, fn) as Record<string, string>;
      expect(boundFn.customProp).toBe('customValue');
    });
  });

  describe('Running App Tracking', () => {
    beforeEach(() => {
      setCurrentRunningApp(null);
    });

    afterEach(() => {
      setCurrentRunningApp(null);
    });

    describe('getCurrentRunningApp', () => {
      it('should return null initially', () => {
        expect(getCurrentRunningApp()).toBeNull();
      });

      it('should return set value', () => {
        const mockProxy = { window: true } as unknown as import('../src/core/Sandbox').SandboxProxy;
        setCurrentRunningApp({ key: 'app1', proxy: mockProxy });

        const app = getCurrentRunningApp();
        expect(app?.key).toBe('app1');
      });
    });

    describe('setCurrentRunningApp', () => {
      it('should set running app', () => {
        const mockProxy = {} as unknown as import('../src/core/Sandbox').SandboxProxy;
        setCurrentRunningApp({ key: 'test-app', proxy: mockProxy });

        expect(getCurrentRunningApp()?.key).toBe('test-app');
      });

      it('should allow clearing', () => {
        const mockProxy = {} as unknown as import('../src/core/Sandbox').SandboxProxy;
        setCurrentRunningApp({ key: 'test-app', proxy: mockProxy });
        setCurrentRunningApp(null);

        expect(getCurrentRunningApp()).toBeNull();
      });
    });
  });

  describe('nextTask', () => {
    it('should execute callback in next microtask', async () => {
      let executed = false;
      nextTask(() => {
        executed = true;
      });

      expect(executed).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(executed).toBe(true);
    });

    it('should be idempotent within same task', async () => {
      let executionCount = 0;

      nextTask(() => executionCount++);
      nextTask(() => executionCount++);
      nextTask(() => executionCount++);

      await new Promise(resolve => setTimeout(resolve, 10));
      // Should only execute once due to idempotent behavior
      expect(executionCount).toBe(1);
    });
  });

  describe('Constants', () => {
    describe('READONLY_WHITELIST', () => {
      it('should include built-in constructors', () => {
        expect(READONLY_WHITELIST).toContain('Object');
        expect(READONLY_WHITELIST).toContain('Array');
        expect(READONLY_WHITELIST).toContain('Promise');
      });

      it('should include network APIs', () => {
        expect(READONLY_WHITELIST).toContain('fetch');
        expect(READONLY_WHITELIST).toContain('XMLHttpRequest');
      });

      it('should be an array', () => {
        expect(Array.isArray(READONLY_WHITELIST)).toBe(true);
      });
    });

    describe('DENYLIST', () => {
      it('should include prototype pollution properties', () => {
        expect(DENYLIST.has('__proto__')).toBe(true);
        expect(DENYLIST.has('constructor')).toBe(true);
        expect(DENYLIST.has('prototype')).toBe(true);
      });

      it('should include dangerous globals', () => {
        expect(DENYLIST.has('eval')).toBe(true);
        expect(DENYLIST.has('Function')).toBe(true);
      });

      it('should be a Set', () => {
        expect(DENYLIST).toBeInstanceOf(Set);
      });
    });
  });

  describe('Edge Cases', () => {
    let sandbox: Sandbox;
    let testWindow: ReturnType<typeof createMockWindow>;

    beforeEach(() => {
      testWindow = createMockWindow();
      sandbox = new Sandbox('edge-case-test', testWindow as unknown as typeof window);
    });

    afterEach(() => {
      sandbox.inactive();
    });

    it('should handle Symbol properties', () => {
      const sym = Symbol('test');
      (sandbox.proxy as Record<symbol, string>)[sym] = 'symbol-value';
      expect((sandbox.proxy as Record<symbol, string>)[sym]).toBe('symbol-value');
    });

    it('should handle numeric property names', () => {
      (sandbox.proxy as Record<number, string>)[0] = 'zero';
      expect((sandbox.proxy as Record<number, string>)[0]).toBe('zero');
    });

    it('should work with hasOwnProperty correctly', () => {
      // This should not throw
      expect(typeof sandbox.proxy.hasOwnProperty).toBe('function');
    });

    it('should return correct prototype', () => {
      // getPrototypeOf trap should return the global context's prototype
      const proto = Object.getPrototypeOf(sandbox.proxy);
      // In Node.js test environment, Window is not defined, but we can verify the proxy has a valid prototype
      expect(proto).toBeDefined();
    });
  });
});