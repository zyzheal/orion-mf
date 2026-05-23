/**
 * SubAppRegistry Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SubAppRegistry,
  SubAppRegistration,
  getSubAppRegistry,
  setSubAppRegistry,
  createSubAppRegistry,
} from '../src/core/SubAppRegistry';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockApp(overrides: Partial<SubAppRegistration> = {}): SubAppRegistration {
  return {
    key: 'test-app',
    name: 'Test App',
    entry_dev: 'http://localhost:3001/test-app/index.js',
    entry_prod: 'https://cdn.example.com/test-app/index.js',
    route: '/test-app',
    security: 'strict',
    preload: false,
    cacheable: true,
    allowedStateKeys: ['user', 'theme'],
    ...overrides,
  };
}

function createMockFetch(responseData: SubAppRegistration[]): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => responseData,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('SubAppRegistry Module', () => {
  let registry: SubAppRegistry;

  beforeEach(() => {
    // Reset global instance before each test
    setSubAppRegistry(new SubAppRegistry());
    registry = new SubAppRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('SubAppRegistry Class', () => {
    describe('constructor', () => {
      it('should create SubAppRegistry instance with default config', () => {
        expect(registry).toBeInstanceOf(SubAppRegistry);
        expect(registry.getConfig().cacheTTL).toBe(5 * 60 * 1000);
        expect(registry.getConfig().remoteUrl).toBeUndefined();
      });

      it('should accept custom configuration', () => {
        const customRegistry = new SubAppRegistry({
          remoteUrl: 'https://config.example.com/apps.json',
          cacheTTL: 60000,
        });

        const config = customRegistry.getConfig();
        expect(config.remoteUrl).toBe('https://config.example.com/apps.json');
        expect(config.cacheTTL).toBe(60000);
      });
    });

    describe('getConfig', () => {
      it('should return current configuration', () => {
        const config = registry.getConfig();
        expect(config).toBeDefined();
        expect(config.cacheTTL).toBeDefined();
        // remoteUrl can be undefined by default
        expect('remoteUrl' in config).toBe(true);
      });

      it('should return a copy of config', () => {
        const config1 = registry.getConfig();
        const config2 = registry.getConfig();
        expect(config1).not.toBe(config2);
      });
    });

    describe('setConfig', () => {
      it('should update remoteUrl', () => {
        registry.setConfig({ remoteUrl: 'https://test.com' });
        expect(registry.getConfig().remoteUrl).toBe('https://test.com');
      });

      it('should update cacheTTL', () => {
        registry.setConfig({ cacheTTL: 10000 });
        expect(registry.getConfig().cacheTTL).toBe(10000);
      });

      it('should preserve other config values', () => {
        registry.setConfig({ remoteUrl: 'https://test.com' });
        expect(registry.getConfig().cacheTTL).toBe(5 * 60 * 1000);
      });
    });
  });

  describe('register', () => {
    it('should register a single app', () => {
      const app = createMockApp({ key: 'app1' });
      registry.register(app);

      expect(registry.has('app1')).toBe(true);
      expect(registry.getApp('app1')).toEqual(app);
    });

    it('should update existing app if re-registering', () => {
      const app1 = createMockApp({ key: 'app1', name: 'App 1' });
      const app1Updated = createMockApp({ key: 'app1', name: 'App 1 Updated' });

      registry.register(app1);
      registry.register(app1Updated);

      expect(registry.getApp('app1')?.name).toBe('App 1 Updated');
      expect(registry.size).toBe(1);
    });

    it('should warn if registering app without key', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = createMockApp({ key: '' } as any);

      registry.register(app);

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(registry.size).toBe(0);

      consoleWarnSpy.mockRestore();
    });

    it('should not add app without key', () => {
      const app = { name: 'Test', entry_dev: '', entry_prod: '', route: '' } as any;
      registry.register(app);

      expect(registry.size).toBe(0);
    });
  });

  describe('registerBatch', () => {
    it('should register multiple apps', () => {
      const apps = [
        createMockApp({ key: 'app1' }),
        createMockApp({ key: 'app2' }),
        createMockApp({ key: 'app3' }),
      ];

      registry.registerBatch(apps);

      expect(registry.size).toBe(3);
      expect(registry.has('app1')).toBe(true);
      expect(registry.has('app2')).toBe(true);
      expect(registry.has('app3')).toBe(true);
    });

    it('should handle empty array', () => {
      registry.registerBatch([]);

      expect(registry.size).toBe(0);
    });
  });

  describe('unregister', () => {
    it('should unregister existing app', () => {
      registry.register(createMockApp({ key: 'app1' }));

      registry.unregister('app1');

      expect(registry.has('app1')).toBe(false);
      expect(registry.getApp('app1')).toBeUndefined();
    });

    it('should handle unregistering non-existent app', () => {
      // Should not throw
      expect(() => registry.unregister('non-existent')).not.toThrow();
    });
  });

  describe('getApp', () => {
    it('should return app config for existing key', () => {
      const app = createMockApp({ key: 'app1' });
      registry.register(app);

      expect(registry.getApp('app1')).toEqual(app);
    });

    it('should return undefined for non-existent key', () => {
      expect(registry.getApp('non-existent')).toBeUndefined();
    });
  });

  describe('getAllApps', () => {
    it('should return empty array when no apps registered', () => {
      expect(registry.getAllApps()).toEqual([]);
    });

    it('should return all registered apps', () => {
      const apps = [
        createMockApp({ key: 'app1' }),
        createMockApp({ key: 'app2' }),
      ];
      registry.registerBatch(apps);

      const allApps = registry.getAllApps();
      expect(allApps.length).toBe(2);
      expect(allApps).toContainEqual(apps[0]);
      expect(allApps).toContainEqual(apps[1]);
    });
  });

  describe('has', () => {
    it('should return false for non-registered key', () => {
      expect(registry.has('app1')).toBe(false);
    });

    it('should return true for registered key', () => {
      registry.register(createMockApp({ key: 'app1' }));

      expect(registry.has('app1')).toBe(true);
    });
  });

  describe('getEntry', () => {
    it('should return entry_dev in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      registry.register(createMockApp({
        key: 'app1',
        entry_dev: 'http://localhost:3001/app.js',
        entry_prod: 'https://cdn.com/app.js',
      }));

      expect(registry.getEntry('app1')).toBe('http://localhost:3001/app.js');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return entry_prod in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      registry.register(createMockApp({
        key: 'app1',
        entry_dev: 'http://localhost:3001/app.js',
        entry_prod: 'https://cdn.com/app.js',
      }));

      expect(registry.getEntry('app1')).toBe('https://cdn.com/app.js');

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw error for unknown app', () => {
      expect(() => registry.getEntry('non-existent')).toThrow('Unknown app: non-existent');
    });
  });

  describe('getEntryForEnv', () => {
    it('should return entry_dev when isDevelopment is true', () => {
      registry.register(createMockApp({
        key: 'app1',
        entry_dev: 'http://localhost:3001/app.js',
        entry_prod: 'https://cdn.com/app.js',
      }));

      expect(registry.getEntryForEnv('app1', true)).toBe('http://localhost:3001/app.js');
    });

    it('should return entry_prod when isDevelopment is false', () => {
      registry.register(createMockApp({
        key: 'app1',
        entry_dev: 'http://localhost:3001/app.js',
        entry_prod: 'https://cdn.com/app.js',
      }));

      expect(registry.getEntryForEnv('app1', false)).toBe('https://cdn.com/app.js');
    });

    it('should throw error for unknown app', () => {
      expect(() => registry.getEntryForEnv('non-existent', true)).toThrow('Unknown app: non-existent');
    });
  });

  describe('fetchRemote', () => {
    it('should fetch and register apps from remote URL', async () => {
      const remoteApps = [
        createMockApp({ key: 'remote-app-1' }),
        createMockApp({ key: 'remote-app-2' }),
      ];

      const mockFetch = createMockFetch(remoteApps);
      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
        cacheTTL: 0, // Disable cache for test
      });

      await testRegistry.fetchRemote();

      expect(mockFetch).toHaveBeenCalledWith('https://config.example.com/apps.json');
      expect(testRegistry.has('remote-app-1')).toBe(true);
      expect(testRegistry.has('remote-app-2')).toBe(true);
    });

    it('should use cache and skip fetch if within TTL', async () => {
      const mockFetch = createMockFetch([]);
      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
        cacheTTL: 5 * 60 * 1000, // 5 minutes
      });

      // First fetch
      await testRegistry.fetchRemote();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second fetch should use cache
      await testRegistry.fetchRemote();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should skip fetch if no remoteUrl configured', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const testRegistry = new SubAppRegistry();
      await testRegistry.fetchRemote();

      expect(consoleWarnSpy).toHaveBeenCalledWith('[SubAppRegistry] No remoteUrl configured');

      consoleWarnSpy.mockRestore();
    });

    it('should handle fetch error gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
        cacheTTL: 0,
      });

      await testRegistry.fetchRemote();

      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
        cacheTTL: 0,
      });

      await testRegistry.fetchRemote();

      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('fetchRemoteForce', () => {
    it('should force refresh and clear old configs', async () => {
      // First register a local app
      registry.register(createMockApp({ key: 'local-app' }));

      const remoteApps = [
        createMockApp({ key: 'remote-app-1' }),
      ];

      const mockFetch = createMockFetch(remoteApps);
      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
      });

      // Force refresh
      const result = await testRegistry.fetchRemoteForce();

      expect(result).toBe(true);
      expect(testRegistry.has('local-app')).toBe(false); // Old config cleared
      expect(testRegistry.has('remote-app-1')).toBe(true);
    });

    it('should return false on fetch failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
      });

      const result = await testRegistry.fetchRemoteForce();

      expect(result).toBe(false);
    });
  });

  describe('size', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('should return correct size after registering apps', () => {
      registry.registerBatch([
        createMockApp({ key: 'app1' }),
        createMockApp({ key: 'app2' }),
        createMockApp({ key: 'app3' }),
      ]);

      expect(registry.size).toBe(3);
    });

    it('should return correct size after unregistering', () => {
      registry.registerBatch([
        createMockApp({ key: 'app1' }),
        createMockApp({ key: 'app2' }),
      ]);

      registry.unregister('app1');

      expect(registry.size).toBe(1);
    });
  });

  describe('invalidateCache', () => {
    it('should set lastFetchTime to 0', async () => {
      const mockFetch = createMockFetch([]);
      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
      });

      await testRegistry.fetchRemote();
      expect(testRegistry.getLastFetchTime()).toBeGreaterThan(0);

      testRegistry.invalidateCache();
      expect(testRegistry.getLastFetchTime()).toBe(0);
    });
  });

  describe('getLastFetchTime', () => {
    it('should return 0 before any fetch', () => {
      expect(registry.getLastFetchTime()).toBe(0);
    });

    it('should return timestamp after fetch', async () => {
      const mockFetch = createMockFetch([]);
      const testRegistry = new SubAppRegistry({
        remoteUrl: 'https://config.example.com/apps.json',
        fetchFn: mockFetch,
        cacheTTL: 0,
      });

      await testRegistry.fetchRemote();

      expect(testRegistry.getLastFetchTime()).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should remove all registered apps', () => {
      registry.registerBatch([
        createMockApp({ key: 'app1' }),
        createMockApp({ key: 'app2' }),
      ]);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.has('app1')).toBe(false);
      expect(registry.has('app2')).toBe(false);
    });
  });

  describe('global singleton', () => {
    it('getSubAppRegistry should return global instance', () => {
      const registry1 = getSubAppRegistry();
      const registry2 = getSubAppRegistry();
      expect(registry1).toBe(registry2);
    });

    it('setSubAppRegistry should set global instance', () => {
      const customRegistry = new SubAppRegistry({ cacheTTL: 10000 });
      setSubAppRegistry(customRegistry);

      expect(getSubAppRegistry()).toBe(customRegistry);
    });

    it('should use custom config from options', () => {
      setSubAppRegistry(new SubAppRegistry({ cacheTTL: 20000, remoteUrl: 'https://test.com' }));

      const registry = getSubAppRegistry();
      expect(registry.getConfig().cacheTTL).toBe(20000);
      expect(registry.getConfig().remoteUrl).toBe('https://test.com');
    });

    it('createSubAppRegistry should create new instance', () => {
      const registry1 = createSubAppRegistry({ key: 'test1' });
      const registry2 = createSubAppRegistry({ key: 'test2' });

      expect(registry1).not.toBe(registry2);
    });
  });
});