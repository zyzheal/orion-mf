/**
 * DegradationStrategy Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DegradationStrategy, DegradationLevel } from '../src/core/DegradationStrategy';
import { MFSandboxBridge, SubAppConfig, SubAppInstance } from '../src/core/MFSandboxBridge';

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Mock MFSandboxBridge for testing
 */
class MockMFSandboxBridge extends MFSandboxBridge {
  private shouldFail = false;
  private failCount = 0;
  private maxFails = 0;

  setFailureMode(shouldFail: boolean, maxFails = 1): void {
    this.shouldFail = shouldFail;
    this.failCount = 0;
    this.maxFails = maxFails;
  }

  async loadSubApp(config: SubAppConfig): Promise<SubAppInstance> {
    if (this.shouldFail && this.failCount < this.maxFails) {
      this.failCount++;
      throw new Error(`Mock failure for "${config.key}"`);
    }

    // Return mock instance
    return {
      key: config.key,
      root: document.createElement('div'),
      sandbox: new Proxy(
        {},
        {
          get() {
            return () => {};
          },
        }
      ),
      lifecycle: {
        mount: vi.fn(),
        unmount: vi.fn(),
      },
      destroy: vi.fn(),
    };
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createMockConfig(overrides: Partial<SubAppConfig> = {}): SubAppConfig {
  return {
    key: 'test-app',
    name: 'Test App',
    remoteEntry: 'http://localhost:3001/remoteEntry.js',
    entry_prod: 'http://localhost:3001/index.html',
    ...overrides,
  };
}

function createTestContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'test-container';
  document.body.appendChild(container);
  return container;
}

// ============================================================================
// Tests
// ============================================================================

describe('DegradationStrategy Module', () => {
  let bridge: MockMFSandboxBridge;
  let strategy: DegradationStrategy;
  let container: HTMLElement;

  beforeEach(() => {
    // Create mock bridge
    bridge = new MockMFSandboxBridge();

    // Create container for tests
    container = createTestContainer();

    // Create strategy instance
    strategy = new DegradationStrategy(bridge, {
      container,
    });
  });

  afterEach(() => {
    // Clean up
    strategy.resetAll();
    container.remove();
  });

  describe('DegradationStrategy Class', () => {
    describe('constructor', () => {
      it('should create DegradationStrategy instance', () => {
        expect(strategy).toBeInstanceOf(DegradationStrategy);
      });

      it('should use default configuration', () => {
        const defaultStrategy = new DegradationStrategy(bridge);
        expect(defaultStrategy).toBeDefined();
      });

      it('should accept custom configuration', () => {
        const customStrategy = new DegradationStrategy(bridge, {
          enabled: false,
          startLevel: DegradationLevel.Compatible,
        });
        expect(customStrategy).toBeDefined();
      });
    });

    describe('loadSubApp', () => {
      it('should load sub-app at Level 1 (Full) when successful', async () => {
        const config = createMockConfig();
        const instance = await strategy.loadSubApp(config);

        expect(instance).toBeDefined();
        expect(instance.key).toBe(config.key);
        expect(strategy.getLevel(config.key)).toBe(DegradationLevel.Full);
      });

      it('should fall back to Level 2 (Compatible) when Level 1 fails', async () => {
        // Make Level 1 fail
        bridge.setFailureMode(true, 1);

        const config = createMockConfig();
        const instance = await strategy.loadSubApp(config);

        expect(instance).toBeDefined();
        // Should have fallen back to Compatible (which uses the mock successfully)
        expect(strategy.getLevel(config.key)).toBe(DegradationLevel.Compatible);
      });

      it('should fall back to Level 3 (iframe) when Level 2 fails', async () => {
        // Make Level 1 and 2 fail
        bridge.setFailureMode(true, 2);

        const config = createMockConfig();
        const instance = await strategy.loadSubApp(config);

        expect(instance).toBeDefined();
        expect(instance.root instanceof HTMLIFrameElement).toBe(true);
        expect(strategy.getLevel(config.key)).toBe(DegradationLevel.Iframe);
      });

      it('should fall back to Level 4 (Fallback) when startLevel is Fallback', async () => {
        // Use startLevel to directly go to fallback
        const fallbackStrategy = new DegradationStrategy(bridge, {
          startLevel: DegradationLevel.Fallback,
          container,
        });

        const config = createMockConfig();
        const instance = await fallbackStrategy.loadSubApp(config);

        expect(instance).toBeDefined();
        // Fallback should create a div
        expect(instance.root instanceof HTMLDivElement).toBe(true);
        expect(fallbackStrategy.getLevel(config.key)).toBe(DegradationLevel.Fallback);
      });

      it('should skip to specified start level', async () => {
        const skipStrategy = new DegradationStrategy(bridge, {
          startLevel: DegradationLevel.Compatible,
        });

        const config = createMockConfig();
        const instance = await skipStrategy.loadSubApp(config);

        // Should start from Compatible level
        expect(instance).toBeDefined();
      });

      it('should disable degradation when enabled is false', async () => {
        const noDegradeStrategy = new DegradationStrategy(bridge, {
          enabled: false,
        });

        const config = createMockConfig();

        // Should throw when bridge fails and degradation is disabled
        bridge.setFailureMode(true, 1);
        await expect(noDegradeStrategy.loadSubApp(config)).rejects.toThrow();
      });

      it('should call onDegrade callback when degradation occurs', async () => {
        const onDegrade = vi.fn();
        const degradeStrategy = new DegradationStrategy(bridge, {
          onDegrade,
        });

        // Make Level 1 fail
        bridge.setFailureMode(true, 1);

        const config = createMockConfig();
        await degradeStrategy.loadSubApp(config);

        // onDegrade should have been called
        expect(onDegrade).toHaveBeenCalled();
        const event = onDegrade.mock.calls[0][0];
        expect(event.failedLevel).toBe(DegradationLevel.Full);
        expect(event.succeededLevel).toBe(DegradationLevel.Compatible);
      });
    });

    describe('getLevel', () => {
      it('should return undefined for unloaded sub-app', () => {
        expect(strategy.getLevel('non-existent')).toBeUndefined();
      });

      it('should return the degradation level for loaded sub-app', async () => {
        const config = createMockConfig();
        await strategy.loadSubApp(config);

        expect(strategy.getLevel(config.key)).toBeDefined();
      });
    });

    describe('getCurrentLevel', () => {
      it('should return Full by default', () => {
        expect(strategy.getCurrentLevel()).toBe(DegradationLevel.Full);
      });

      it('should return iframe level when bridge fails twice', async () => {
        bridge.setFailureMode(true, 2);
        const config = createMockConfig();
        await strategy.loadSubApp(config);

        // iframe mode succeeds, so current level is Iframe
        expect(strategy.getCurrentLevel()).toBe(DegradationLevel.Iframe);
      });
    });

    describe('reset', () => {
      it('should reset degradation state for a sub-app', async () => {
        const config = createMockConfig();
        await strategy.loadSubApp(config);

        expect(strategy.getLevel(config.key)).toBeDefined();

        strategy.reset(config.key);

        expect(strategy.getLevel(config.key)).toBeUndefined();
      });
    });

    describe('resetAll', () => {
      it('should reset all degradation state', async () => {
        await strategy.loadSubApp(createMockConfig({ key: 'app-1' }));
        await strategy.loadSubApp(createMockConfig({ key: 'app-2' }));

        strategy.resetAll();

        expect(strategy.getLevel('app-1')).toBeUndefined();
        expect(strategy.getLevel('app-2')).toBeUndefined();
      });
    });

    describe('updateConfig', () => {
      it('should update configuration', async () => {
        strategy.updateConfig({
          enabled: false,
        });

        // Try to load - should fail without degradation
        bridge.setFailureMode(true, 1);
        const config = createMockConfig();

        await expect(strategy.loadSubApp(config)).rejects.toThrow();
      });
    });
  });

  describe('DegradationLevel Enum', () => {
    it('should have correct level values', () => {
      expect(DegradationLevel.Full).toBe('Full');
      expect(DegradationLevel.Compatible).toBe('Compatible');
      expect(DegradationLevel.Iframe).toBe('Iframe');
      expect(DegradationLevel.Fallback).toBe('Fallback');
    });
  });

  describe('iframe mode', () => {
    it('should create iframe with correct attributes', async () => {
      bridge.setFailureMode(true, 2); // Force iframe level

      const config = createMockConfig();
      const instance = await strategy.loadSubApp(config);

      const iframe = instance.root as HTMLIFrameElement;
      expect(iframe.tagName).toBe('IFRAME');
      expect(iframe.src).toBe(config.entry_prod);
      expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    });

    it('should use entry_prod URL for iframe src', async () => {
      bridge.setFailureMode(true, 2);

      const config = createMockConfig({
        entry_prod: 'http://custom.com/app.html',
        remoteEntry: 'http://other.com/remote.js',
      });
      const instance = await strategy.loadSubApp(config);

      const iframe = instance.root as HTMLIFrameElement;
      expect(iframe.src).toBe('http://custom.com/app.html');
    });
  });

  describe('fallback mode', () => {
    it('should use custom fallback renderer when provided', async () => {
      // Use startLevel to directly go to fallback
      let calledWithConfig: SubAppConfig | undefined;
      const customFallback = vi.fn((config: SubAppConfig) => {
        calledWithConfig = config;
        const div = document.createElement('div');
        div.textContent = `Custom: ${config.name}`;
        return div;
      });

      const customStrategy = new DegradationStrategy(bridge, {
        startLevel: DegradationLevel.Fallback,
        renderFallback: customFallback,
        container,
      });

      const config = createMockConfig();
      const instance = await customStrategy.loadSubApp(config);

      // Verify custom renderer was called
      expect(calledWithConfig).toBeDefined();
      expect(calledWithConfig?.key).toBe(config.key);

      // Verify fallback element has custom content
      const root = instance.root as HTMLElement;
      expect(root.textContent).toContain('Custom:');
    });

    it('should create fallback element with correct attributes when using startLevel', async () => {
      // Use startLevel to directly go to fallback
      const fallbackStrategy = new DegradationStrategy(bridge, {
        startLevel: DegradationLevel.Fallback,
        container,
      });

      const config = createMockConfig({ key: 'my-app' });
      const instance = await fallbackStrategy.loadSubApp(config);

      const root = instance.root as HTMLElement;
      expect(root.id).toBe('orion-mf-fallback-my-app');
      expect(root.getAttribute('data-orion-mf-fallback')).toBe('my-app');
    });
  });
});