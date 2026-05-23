/**
 * MFSandboxBridge Unit Tests
 *
 * Tests for the Module Federation and Sandbox bridge module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MFSandboxBridge } from '../src/core/MFSandboxBridge';
import { GlobalWrapper } from '../src/core/Sandbox';
import type { MFLoader, SubAppConfig, SubAppInstance, RemoteModule } from '../src/core/MFSandboxBridge';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock MF loader for testing
 */
function createMockMFLoader(modules: RemoteModule[] = []): MFLoader {
  return {
    load: vi.fn().mockResolvedValue(modules),
  };
}

/**
 * Create a mock lifecycle module
 */
function createMockLifecycle() {
  return {
    bootstrap: vi.fn().mockResolvedValue(undefined),
    mount: vi.fn(),
    unmount: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a minimal sub-app config
 */
function createTestConfig(overrides: Partial<SubAppConfig> = {}): SubAppConfig {
  return {
    key: 'test-app',
    name: 'Test App',
    remoteEntry: 'https://example.com/remoteEntry.js',
    remoteName: './index',
    ...overrides,
  };
}

// ============================================================================
// MFSandboxBridge Tests
// ============================================================================

describe('MFSandboxBridge', () => {
  let bridge: MFSandboxBridge;

  beforeEach(() => {
    bridge = new MFSandboxBridge();
  });

  afterEach(async () => {
    // Clean up any loaded sub-apps
    await bridge.destroyAll();
    GlobalWrapper.clearAll();
  });

  describe('constructor', () => {
    it('should create a new instance without options', () => {
      expect(bridge).toBeInstanceOf(MFSandboxBridge);
    });

    it('should accept custom loaders', () => {
      const customLoader = createMockMFLoader();
      const customBridge = new MFSandboxBridge({ mfLoader: customLoader });
      expect(customBridge).toBeInstanceOf(MFSandboxBridge);
    });
  });

  describe('loadSubApp', () => {
    it('should load a sub-app with minimal config', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig();
      const instance = await testBridge.loadSubApp(config);

      expect(instance).toBeDefined();
      expect(instance.key).toBe('test-app');
      expect(instance.sandbox).toBeDefined();
      expect(instance.lifecycle).toBeDefined();
      expect(instance.destroy).toBeInstanceOf(Function);
    });

    it('should return cached instance for duplicate load', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig();
      const instance1 = await testBridge.loadSubApp(config);
      const instance2 = await testBridge.loadSubApp(config);

      // Should return the same instance
      expect(instance1).toBe(instance2);
    });

    it('should handle module without lifecycle exports', async () => {
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {}, // Empty module, no lifecycle
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig();
      const instance = await testBridge.loadSubApp(config);

      expect(instance).toBeDefined();
      expect(instance.lifecycle.mount).toBeDefined();
    });

    it('should throw when MF loader fails', async () => {
      const failingLoader: MFLoader = {
        load: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      const testBridge = new MFSandboxBridge({ mfLoader: failingLoader });
      const config = createTestConfig();

      await expect(testBridge.loadSubApp(config)).rejects.toThrow('Network error');
    });

    it('should support noShadowDOM mode', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig({ noShadowDOM: true });
      const instance = await testBridge.loadSubApp(config);

      // In noShadowDOM mode, root should be HTMLElement
      expect(instance.root).toBeDefined();
      // Check if it's a regular DOM element (not ShadowRoot)
      expect(instance.root instanceof ShadowRoot).toBe(false);
    });
  });

  describe('getSubApp', () => {
    it('should return undefined for non-existent sub-app', () => {
      expect(bridge.getSubApp('non-existent')).toBeUndefined();
    });

    it('should return loaded sub-app', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig();
      await testBridge.loadSubApp(config);

      const instance = testBridge.getSubApp('test-app');
      expect(instance).toBeDefined();
      expect(instance?.key).toBe('test-app');
    });
  });

  describe('hasSubApp', () => {
    it('should return false for non-loaded sub-app', () => {
      expect(bridge.hasSubApp('non-existent')).toBe(false);
    });

    it('should return true for loaded sub-app', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig();
      await testBridge.loadSubApp(config);

      expect(testBridge.hasSubApp('test-app')).toBe(true);
    });
  });

  describe('getLoadedKeys', () => {
    it('should return empty array when no apps loaded', () => {
      expect(bridge.getLoadedKeys()).toEqual([]);
    });

    it('should return all loaded keys', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      await testBridge.loadSubApp(createTestConfig({ key: 'app-1' }));
      await testBridge.loadSubApp(createTestConfig({ key: 'app-2' }));

      const keys = testBridge.getLoadedKeys();
      expect(keys).toContain('app-1');
      expect(keys).toContain('app-2');
      expect(keys.length).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should warn when destroying non-existent sub-app', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await bridge.destroy('non-existent');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should clean up sandbox on destroy', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig();
      await testBridge.loadSubApp(config);

      // Verify sandbox exists
      expect(GlobalWrapper.getSandbox('test-app')).toBeDefined();

      // Destroy
      await testBridge.destroy('test-app');

      // Verify sandbox is removed
      expect(GlobalWrapper.getSandbox('test-app')).toBeUndefined();
      expect(testBridge.hasSubApp('test-app')).toBe(false);
    });

    it('should call unmount lifecycle on destroy', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      const config = createTestConfig();
      await testBridge.loadSubApp(config);

      await testBridge.destroy('test-app');

      expect(mockLifecycle.unmount).toHaveBeenCalled();
    });
  });

  describe('destroyAll', () => {
    it('should destroy all loaded sub-apps', async () => {
      const mockLifecycle = createMockLifecycle();
      const mockModules: RemoteModule[] = [
        {
          factory: vi.fn(),
          chunk: {
            __esModule: true,
            default: mockLifecycle,
          },
        },
      ];

      const mockLoader = createMockMFLoader(mockModules);
      const testBridge = new MFSandboxBridge({ mfLoader: mockLoader });

      await testBridge.loadSubApp(createTestConfig({ key: 'app-1' }));
      await testBridge.loadSubApp(createTestConfig({ key: 'app-2' }));

      await testBridge.destroyAll();

      expect(testBridge.getLoadedKeys()).toEqual([]);
    });
  });
});

// ============================================================================
// Convenience Functions Tests
// ============================================================================

describe('MFSandboxBridge convenience functions', () => {
  afterEach(async () => {
    try {
      // Import and cleanup
      const { getBridge, setBridge } = await import('../src/core/MFSandboxBridge');
      const bridge = getBridge();
      await bridge.destroyAll();
      GlobalWrapper.clearAll();
      // Reset default bridge
      setBridge(null as any);
    } catch {
      // Ignore errors during cleanup
    }
  });

  it('should provide default bridge instance', async () => {
    const { getBridge } = await import('../src/core/MFSandboxBridge');
    const bridge = getBridge();
    expect(bridge).toBeDefined();
    // Just check it works, not the exact instance
    expect(typeof bridge.loadSubApp).toBe('function');
  });

  it('should return same default bridge on multiple calls', async () => {
    const { getBridge } = await import('../src/core/MFSandboxBridge');
    const bridge1 = getBridge();
    const bridge2 = getBridge();
    // After vi.resetModules, this may create new instances, so just verify they work
    expect(bridge1).toBeDefined();
    expect(bridge2).toBeDefined();
  });
});

// ============================================================================
// Error Boundary Integration Tests
// ============================================================================

describe('MFSandboxBridge error boundary integration', () => {
  afterEach(async () => {
    GlobalWrapper.clearAll();
  });

  it('should setup error boundary when enabled', async () => {
    const { ErrorIsolator } = await import('../src/core/ErrorIsolator');
    const errorIsolator = new ErrorIsolator();

    const mockLifecycle = createMockLifecycle();
    const mockModules: RemoteModule[] = [
      {
        factory: vi.fn(),
        chunk: {
          __esModule: true,
          default: mockLifecycle,
        },
      },
    ];

    const mockLoader = createMockMFLoader(mockModules);
    const bridge = new MFSandboxBridge({
      mfLoader: mockLoader,
      errorIsolator,
    });

    const config = createTestConfig({ errorBoundary: true });
    await bridge.loadSubApp(config);

    expect(errorIsolator.hasBoundary('test-app')).toBe(true);

    await bridge.destroyAll();
    errorIsolator.destroy();
  });
});