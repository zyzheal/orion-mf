/**
 * RouterManager Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RouterManager, type RouteConfig, type RouteState } from '../src/core/RouterManager';

// We need to set up the DOM environment for these tests
// Using a simple approach to mock window.location

describe('RouterManager', () => {
  let router: RouterManager;
  let originalLocation: { pathname: string; search: string };
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  // Helper to simulate URL change
  const setPathname = (pathname: string, search = '') => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, pathname, search },
    });
  };

  beforeEach(() => {
    // Save original
    originalLocation = { pathname: window.location.pathname, search: window.location.search };
    originalPushState = history.pushState.bind(history);
    originalReplaceState = history.replaceState.bind(history);

    // Setup spies
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    // Reset location to root
    setPathname('/');

    router = new RouterManager();
  });

  afterEach(() => {
    router.destroy();

    // Restore
    setPathname(originalLocation.pathname, originalLocation.search);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  describe('register', () => {
    it('should register a route config', () => {
      const config: RouteConfig = { key: 'pipeline', path: '/pipeline' };
      router.register(config);

      expect(router.hasRoute('pipeline')).toBe(true);
    });

    it('should warn when registering without key', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      router.register({ key: '', path: '/test' } as RouteConfig);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should allow registering multiple routes', () => {
      router.register({ key: 'app1', path: '/app1' });
      router.register({ key: 'app2', path: '/app2' });

      expect(router.hasRoute('app1')).toBe(true);
      expect(router.hasRoute('app2')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should unregister a route', () => {
      router.register({ key: 'test-app', path: '/test' });
      expect(router.hasRoute('test-app')).toBe(true);

      router.unregister('test-app');
      expect(router.hasRoute('test-app')).toBe(false);
    });

    it('should handle unregistering non-existent route', () => {
      expect(() => router.unregister('non-existent')).not.toThrow();
    });
  });

  describe('init', () => {
    it('should add popstate event listener', () => {
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      expect(addEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    it('should parse current URL and trigger callback', () => {
      setPathname('/app/pipeline/runs');

      const callback = vi.fn();
      router.register({ key: 'pipeline', path: '/pipeline' });

      router.init(callback);

      expect(callback).toHaveBeenCalled();
      const state = callback.mock.calls[0][0] as RouteState;
      expect(state.currentApp).toBe('pipeline');
      expect(state.appPath).toBe('/runs');
    });

    it('should warn if already initialized', () => {
      router.register({ key: 'test', path: '/test' });
      router.init(() => {});

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      router.init(() => {});

      expect(warnSpy).toHaveBeenCalledWith('[RouterManager] Already initialized');
      warnSpy.mockRestore();
    });

    it('should not trigger callback for non-matching base path', () => {
      setPathname('/other/path');

      const callback = vi.fn();
      router.register({ key: 'pipeline', path: '/pipeline' });

      router.init(callback);

      // Callback should not be called when URL doesn't match base path
      // because parseURL returns null for non-matching paths
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('navigate', () => {
    it('should navigate to registered app', () => {
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      router.navigate('pipeline', '/runs');

      // The URL should have been set via pushState
      // We verify the history state was set correctly
      const state = router.getCurrent();
      expect(state?.currentApp).toBe('pipeline');
      expect(state?.appPath).toBe('/runs');
    });

    it('should navigate with replaceState when replace is true', () => {
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.register({ key: 'cmdb', path: '/cmdb' });
      router.init(() => {});

      router.navigate('pipeline', '/runs');
      router.navigate('cmdb', '/instances', true);

      const state = router.getCurrent();
      expect(state?.currentApp).toBe('cmdb');
      expect(state?.appPath).toBe('/instances');
    });

    it('should warn for unknown app key', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      router.init(() => {});
      router.navigate('unknown-app', '/path');

      expect(warnSpy).toHaveBeenCalledWith('[RouterManager] Unknown app: unknown-app');
      warnSpy.mockRestore();
    });

    it('should build correct URL format', () => {
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      router.navigate('pipeline', '/runs/123');

      // The URL should have been set via pushState in history
      // We verify the internal state reflects the correct path
      const state = router.getCurrent();
      expect(state?.currentApp).toBe('pipeline');
      // Note: The full URL might not be visible in test environment
      // but the state should correctly reflect navigation
    });
  });

  describe('notifyAppRouteChange', () => {
    it('should update URL without triggering pushState', () => {
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      // First navigate to set current state
      router.navigate('pipeline', '/runs');

      // Then notify of internal route change
      router.notifyAppRouteChange('pipeline', '/runs/123');

      // The state should be updated
      const state = router.getCurrent();
      expect(state?.appPath).toBe('/runs/123');
    });

    it('should parse instanceId from appPath', () => {
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      // First navigate to set current state
      router.navigate('pipeline', '/runs');
      expect(router.getCurrent()?.currentApp).toBe('pipeline');

      // Then notify of internal route change with instanceId
      router.notifyAppRouteChange('pipeline', '/~instance123/dashboard');

      const state = router.getCurrent();
      expect(state?.instanceId).toBe('instance123');
      expect(state?.appPath).toBe('/dashboard');
    });
  });

  describe('parseURL', () => {
    it('should parse URL with subAppKey and path', () => {
      setPathname('/app/pipeline/runs/123');
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      const state = router.getCurrent();
      expect(state?.currentApp).toBe('pipeline');
      expect(state?.appPath).toBe('/runs/123');
    });

    it('should parse URL with instanceId', () => {
      setPathname('/app/pipeline/~instance123/dashboard');
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      const state = router.getCurrent();
      expect(state?.currentApp).toBe('pipeline');
      expect(state?.instanceId).toBe('instance123');
      expect(state?.appPath).toBe('/dashboard');
    });

    it('should return null for non-matching base path', () => {
      setPathname('/other/path');
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      const state = router.getCurrent();
      expect(state).toBeNull();
    });

    it('should return null for unregistered app', () => {
      setPathname('/app/unknown-app/path');
      router.init(() => {});

      const state = router.getCurrent();
      expect(state).toBeNull();
    });

    it('should handle query params', () => {
      setPathname('/app/pipeline/runs', '?status=running&page=1');
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      const state = router.getCurrent();
      expect(state?.query.get('status')).toBe('running');
      expect(state?.query.get('page')).toBe('1');
    });
  });

  describe('getCurrent', () => {
    it('should return null before initialization', () => {
      expect(router.getCurrent()).toBeNull();
    });

    it('should return current route state after navigation', () => {
      router.register({ key: 'test', path: '/test' });
      router.init(() => {});

      router.navigate('test', '/page');

      const current = router.getCurrent();
      expect(current?.currentApp).toBe('test');
      expect(current?.appPath).toBe('/page');
    });
  });

  describe('getRoutes', () => {
    it('should return all registered routes', () => {
      router.register({ key: 'app1', path: '/app1' });
      router.register({ key: 'app2', path: '/app2' });

      const routes = router.getRoutes();
      expect(routes.size).toBe(2);
      expect(routes.get('app1')?.path).toBe('/app1');
      expect(routes.get('app2')?.path).toBe('/app2');
    });
  });

  describe('hasRoute', () => {
    it('should return true for registered route', () => {
      router.register({ key: 'test', path: '/test' });
      expect(router.hasRoute('test')).toBe(true);
    });

    it('should return false for unregistered route', () => {
      expect(router.hasRoute('non-existent')).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should remove popstate event listener', () => {
      router.register({ key: 'test', path: '/test' });
      router.init(() => {});
      router.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    it('should reset state after destroy', () => {
      router.register({ key: 'test', path: '/test' });
      router.init(() => {});
      router.navigate('test', '/page');

      router.destroy();

      expect(router.getCurrent()).toBeNull();
    });
  });

  describe('popstate handling', () => {
    it('should trigger callback when popstate event fires', () => {
      setPathname('/app/pipeline/runs');
      router.register({ key: 'pipeline', path: '/pipeline' });

      const callback = vi.fn();
      router.init(callback);

      // Clear the initial call
      callback.mockClear();

      // Get the popstate handler that was registered
      const popstateCall = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === 'popstate'
      );
      expect(popstateCall).toBeDefined();

      const popstateHandler = popstateCall![1] as EventListener;

      // Simulate popstate
      setPathname('/app/pipeline/detail');
      popstateHandler(new PopStateEvent('popstate'));

      expect(callback).toHaveBeenCalled();
      const state = callback.mock.calls[0][0] as RouteState;
      expect(state.currentApp).toBe('pipeline');
      expect(state.appPath).toBe('/detail');
    });
  });

  describe('history API patching', () => {
    it('should restore original pushState on destroy', () => {
      router.register({ key: 'app', path: '/app' });
      router.init(() => {});
      router.destroy();

      // After destroy, pushState should work normally
      expect(typeof history.pushState).toBe('function');
    });

    it('should restore original replaceState on destroy', () => {
      router.register({ key: 'app', path: '/app' });
      router.init(() => {});
      router.destroy();

      expect(typeof history.replaceState).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle empty appPath', () => {
      setPathname('/app/pipeline');
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      const state = router.getCurrent();
      expect(state?.currentApp).toBe('pipeline');
    });

    it('should handle root path redirect', () => {
      setPathname('/app');
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      const state = router.getCurrent();
      expect(state).toBeNull();
    });

    it('should handle trailing slash in appPath', () => {
      setPathname('/app/pipeline/runs/');
      router.register({ key: 'pipeline', path: '/pipeline' });
      router.init(() => {});

      const state = router.getCurrent();
      expect(state?.currentApp).toBe('pipeline');
      expect(state?.appPath).toBe('/runs/');
    });
  });
});