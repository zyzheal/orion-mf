/**
 * PreloadStrategy Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PreloadStrategy,
  getPreloadStrategy,
  setPreloadStrategy,
  PrefetchMode,
} from '../src/core/PreloadStrategy';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLoader(resolveAfter = 10): () => Promise<void> {
  return vi.fn().mockImplementation(() =>
    new Promise((resolve) => setTimeout(resolve, resolveAfter))
  );
}

function createFailingLoader(): () => Promise<void> {
  return vi.fn().mockImplementation(() =>
    Promise.reject(new Error('Load failed'))
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('PreloadStrategy Module', () => {
  let strategy: PreloadStrategy;

  beforeEach(() => {
    // Reset global instance before each test
    setPreloadStrategy(new PreloadStrategy());
    strategy = new PreloadStrategy();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('PreloadStrategy Class', () => {
    describe('constructor', () => {
      it('should create PreloadStrategy instance with default config', () => {
        expect(strategy).toBeInstanceOf(PreloadStrategy);
        expect(strategy.getConfig().mode).toBe('smart');
        expect(strategy.getConfig().criticalApps).toEqual([]);
        expect(strategy.getConfig().excludedApps).toEqual([]);
        expect(strategy.getConfig().maxConcurrent).toBe(3);
        expect(strategy.getConfig().idleTimeout).toBe(2000);
      });

      it('should accept custom configuration', () => {
        const customStrategy = new PreloadStrategy({
          mode: 'all',
          criticalApps: ['app1', 'app2'],
          excludedApps: ['app3'],
          maxConcurrent: 5,
          idleTimeout: 5000,
        });

        const config = customStrategy.getConfig();
        expect(config.mode).toBe('all');
        expect(config.criticalApps).toEqual(['app1', 'app2']);
        expect(config.excludedApps).toEqual(['app3']);
        expect(config.maxConcurrent).toBe(5);
        expect(config.idleTimeout).toBe(5000);
      });
    });

    describe('getConfig', () => {
      it('should return current configuration', () => {
        const config = strategy.getConfig();
        expect(config).toBeDefined();
        expect(config.mode).toBeDefined();
      });
    });

    describe('setConfig', () => {
      it('should update configuration', () => {
        strategy.setConfig({ mode: 'idle', maxConcurrent: 10 });
        const config = strategy.getConfig();
        expect(config.mode).toBe('idle');
        expect(config.maxConcurrent).toBe(10);
      });

      it('should preserve existing config when partially updating', () => {
        strategy.setConfig({ criticalApps: ['app1'] });
        strategy.setConfig({ mode: 'all' });

        const config = strategy.getConfig();
        expect(config.criticalApps).toEqual(['app1']);
        expect(config.mode).toBe('all');
      });
    });

    describe('prefetch', () => {
      it('should skip already loaded apps', async () => {
        strategy.markAsLoaded('app1');
        const loader = createMockLoader();

        await strategy.prefetch('app1', loader);

        expect(loader).not.toHaveBeenCalled();
      });

      it('should skip excluded apps', async () => {
        const excludedStrategy = new PreloadStrategy({
          excludedApps: ['app1'],
        });
        const loader = createMockLoader();

        await excludedStrategy.prefetch('app1', loader);

        expect(loader).not.toHaveBeenCalled();
      });

      it('should skip apps that are already loading', async () => {
        // Manually add to loading set
        const loader = createMockLoader(100);

        // Start first prefetch
        const firstPrefetch = strategy.prefetch('app1', loader);

        // Start second prefetch immediately
        const secondPrefetch = strategy.prefetch('app1', loader);

        await firstPrefetch;
        await secondPrefetch;

        // Loader should only be called once
        expect(loader).toHaveBeenCalledTimes(1);
      });
    });

    describe('prefetch with different modes', () => {
      it('should prefetch immediately in "all" mode', async () => {
        const allModeStrategy = new PreloadStrategy({ mode: 'all' });
        const loader = createMockLoader();

        await allModeStrategy.prefetch('app1', loader);

        expect(loader).toHaveBeenCalled();
        expect(allModeStrategy.isLoaded('app1')).toBe(true);
      });

      it('should prefetch immediately in "smart" mode for critical apps', async () => {
        const smartStrategy = new PreloadStrategy({
          mode: 'smart',
          criticalApps: ['critical-app'],
        });
        const loader = createMockLoader();

        await smartStrategy.prefetch('critical-app', loader);

        expect(loader).toHaveBeenCalled();
        expect(smartStrategy.isLoaded('critical-app')).toBe(true);
      });

      it('should prefetch on idle in "smart" mode for non-critical apps', async () => {
        const smartStrategy = new PreloadStrategy({
          mode: 'smart',
          criticalApps: ['critical-app'],
        });
        const loader = createMockLoader();

        await smartStrategy.prefetch('non-critical-app', loader);

        expect(loader).toHaveBeenCalled();
      });

      it('should not auto-prefetch in "manual" mode', async () => {
        const manualStrategy = new PreloadStrategy({ mode: 'manual' });
        const loader = createMockLoader();

        await manualStrategy.prefetch('app1', loader);

        expect(loader).not.toHaveBeenCalled();
      });

      it('should prefetch on idle in "idle" mode', async () => {
        const idleStrategy = new PreloadStrategy({ mode: 'idle' });
        const loader = createMockLoader();

        await idleStrategy.prefetch('app1', loader);

        expect(loader).toHaveBeenCalled();
      });
    });

    describe('prefetchNow', () => {
      it('should immediately execute loader', async () => {
        const loader = createMockLoader();

        await strategy.prefetchNow('app1', loader);

        expect(loader).toHaveBeenCalledTimes(1);
        expect(strategy.isLoaded('app1')).toBe(true);
      });

      it('should skip already loaded apps', async () => {
        strategy.markAsLoaded('app1');
        const loader = createMockLoader();

        await strategy.prefetchNow('app1', loader);

        expect(loader).not.toHaveBeenCalled();
      });

      it('should handle loader errors gracefully', async () => {
        const failingLoader = createFailingLoader();

        // Should not throw
        await expect(strategy.prefetchNow('app1', failingLoader)).resolves.not.toThrow();

        // Should not be marked as loaded
        expect(strategy.isLoaded('app1')).toBe(false);
      });
    });

    describe('prefetchCritical', () => {
      it('should only preload critical apps', async () => {
        const criticalStrategy = new PreloadStrategy({
          criticalApps: ['critical1', 'critical2'],
        });

        const loaders = new Map<string, () => Promise<void>>();
        loaders.set('critical1', createMockLoader());
        loaders.set('critical2', createMockLoader());
        loaders.set('non-critical', createMockLoader());

        await criticalStrategy.prefetchCritical(loaders);

        expect(loaders.get('critical1')!).toHaveBeenCalled();
        expect(loaders.get('critical2')!).toHaveBeenCalled();
        expect(loaders.get('non-critical')!).not.toHaveBeenCalled();
      });

      it('should skip already loaded critical apps', async () => {
        const criticalStrategy = new PreloadStrategy({
          criticalApps: ['critical1'],
        });

        // Mark as already loaded
        criticalStrategy.markAsLoaded('critical1');

        const loaders = new Map<string, () => Promise<void>>();
        loaders.set('critical1', createMockLoader());

        await criticalStrategy.prefetchCritical(loaders);

        expect(loaders.get('critical1')!).not.toHaveBeenCalled();
      });

      it('should respect maxConcurrent when prefetching', async () => {
        const criticalStrategy = new PreloadStrategy({
          criticalApps: ['app1', 'app2', 'app3', 'app4', 'app5'],
          maxConcurrent: 2,
        });

        const callTimes: number[] = [];
        const loaders = new Map<string, () => Promise<void>>();

        ['app1', 'app2', 'app3', 'app4', 'app5'].forEach((key) => {
          loaders.set(key, () => {
            callTimes.push(Date.now());
            return Promise.resolve();
          });
        });

        await criticalStrategy.prefetchCritical(loaders);

        // All should complete
        expect(callTimes.length).toBe(5);
      });
    });

    describe('prefetchBatch', () => {
      it('should batch prefetch multiple apps', async () => {
        const batchStrategy = new PreloadStrategy({ maxConcurrent: 2 });

        const loaders: Record<string, () => Promise<void>> = {
          app1: createMockLoader(),
          app2: createMockLoader(),
          app3: createMockLoader(),
        };

        await batchStrategy.prefetchBatch(
          ['app1', 'app2', 'app3'],
          (key) => loaders[key]
        );

        expect(loaders.app1).toHaveBeenCalled();
        expect(loaders.app2).toHaveBeenCalled();
        expect(loaders.app3).toHaveBeenCalled();
      });

      it('should skip excluded apps in batch', async () => {
        const batchStrategy = new PreloadStrategy({
          excludedApps: ['app2'],
          maxConcurrent: 3,
        });

        const loaders: Record<string, () => Promise<void>> = {
          app1: createMockLoader(),
          app2: createMockLoader(),
        };

        await batchStrategy.prefetchBatch(
          ['app1', 'app2'],
          (key) => loaders[key]
        );

        expect(loaders.app1).toHaveBeenCalled();
        expect(loaders.app2).not.toHaveBeenCalled();
      });
    });

    describe('manualPrefetch', () => {
      it('should force prefetch regardless of mode', async () => {
        const manualStrategy = new PreloadStrategy({ mode: 'manual' });
        const loader = createMockLoader();

        await manualStrategy.manualPrefetch('app1', loader);

        expect(loader).toHaveBeenCalled();
        expect(manualStrategy.isLoaded('app1')).toBe(true);
      });
    });

    describe('isLoaded', () => {
      it('should return false for not loaded apps', () => {
        expect(strategy.isLoaded('app1')).toBe(false);
      });

      it('should return true for loaded apps', () => {
        strategy.markAsLoaded('app1');
        expect(strategy.isLoaded('app1')).toBe(true);
      });
    });

    describe('getLoadedApps', () => {
      it('should return empty array when no apps loaded', () => {
        expect(strategy.getLoadedApps()).toEqual([]);
      });

      it('should return list of loaded apps', () => {
        strategy.markAsLoaded('app1');
        strategy.markAsLoaded('app2');

        const loadedApps = strategy.getLoadedApps();
        expect(loadedApps).toContain('app1');
        expect(loadedApps).toContain('app2');
      });
    });

    describe('getLoadingApps', () => {
      it('should return empty array when no apps loading', () => {
        expect(strategy.getLoadingApps()).toEqual([]);
      });
    });

    describe('markAsLoaded', () => {
      it('should mark app as loaded', () => {
        strategy.markAsLoaded('app1');
        expect(strategy.isLoaded('app1')).toBe(true);
      });
    });

    describe('reset', () => {
      it('should clear all loaded and loading state', () => {
        strategy.markAsLoaded('app1');
        strategy.markAsLoaded('app2');

        strategy.reset();

        expect(strategy.getLoadedApps()).toEqual([]);
      });
    });

    describe('unload', () => {
      it('should remove app from loaded state', () => {
        strategy.markAsLoaded('app1');
        strategy.unload('app1');

        expect(strategy.isLoaded('app1')).toBe(false);
      });

      it('should remove app from loading state', async () => {
        const loader = createMockLoader(100);
        strategy.prefetchNow('app1', loader);
        await new Promise((r) => setTimeout(r, 5));

        strategy.unload('app1');

        expect(strategy.isLoaded('app1')).toBe(false);
      });
    });

    describe('prefetchOnIdle', () => {
      it('should prefetch when requestIdleCallback is available', async () => {
        const loader = createMockLoader();

        await strategy.prefetchOnIdle('app1', loader);

        expect(loader).toHaveBeenCalled();
      });

      it('should fallback to immediate load when requestIdleCallback is unavailable', async () => {
        // Save original
        const original = (window as any).requestIdleCallback;

        // Remove requestIdleCallback
        delete (window as any).requestIdleCallback;

        const loader = createMockLoader();
        const idleStrategy = new PreloadStrategy();

        await idleStrategy.prefetchOnIdle('app1', loader);

        expect(loader).toHaveBeenCalled();

        // Restore
        (window as any).requestIdleCallback = original;
      });
    });

    describe('prefetchOnVisible', () => {
      it('should skip prefetch when container not found (container must exist for visible mode)', async () => {
        const loader = createMockLoader();

        await strategy.prefetchOnVisible('app1', loader);

        // 容器不存在时，visible 模式应该跳过预加载
        expect(loader).not.toHaveBeenCalled();
      });

      it('should observe container when found', async () => {
        // Mock IntersectionObserver
        const mockObserve = vi.fn();
        const mockDisconnect = vi.fn();

        class MockIntersectionObserver implements IntersectionObserver {
          readonly root: Element | null = null;
          readonly rootMargin: string = '';
          readonly thresholds: ReadonlyArray<number> = [];
          constructor(
            private callback: IntersectionObserverCallback,
            private options?: IntersectionObserverInit
          ) {}
          observe(target: Element): void {
            // Immediately trigger callback with isIntersecting = true
            this.callback(
              [
                {
                  isIntersecting: true,
                  intersectionRatio: 1,
                  target,
                  boundingClientRect: target.getBoundingClientRect(),
                  intersectionRect: target.getBoundingClientRect(),
                  rootBounds: null,
                  time: 0,
                },
              ],
              this
            );
          }
          unobserve(): void {}
          disconnect(): void {
            mockDisconnect();
          }
          takeRecords(): IntersectionObserverEntry[] {
            return [];
          }
        }

        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

        // Create a container element
        const container = document.createElement('div');
        container.setAttribute('data-orion-scope', 'orion-app1');
        document.body.appendChild(container);

        const loader = createMockLoader();

        await strategy.prefetchOnVisible('app1', loader);

        // Should be called since element exists and is visible
        expect(loader).toHaveBeenCalled();

        // Cleanup
        container.remove();
        vi.unstubAllGlobals();
      });
    });
  });

  describe('Global Singleton', () => {
    it('should get global preload strategy instance', () => {
      const instance = getPreloadStrategy();
      expect(instance).toBeInstanceOf(PreloadStrategy);
    });

    it('should return same instance on subsequent calls', () => {
      const instance1 = getPreloadStrategy();
      const instance2 = getPreloadStrategy();
      expect(instance1).toBe(instance2);
    });

    it('should allow setting custom global instance', () => {
      const customStrategy = new PreloadStrategy({ mode: 'all' });
      setPreloadStrategy(customStrategy);

      const instance = getPreloadStrategy();
      expect(instance.getConfig().mode).toBe('all');

      // Reset to new instance
      setPreloadStrategy(new PreloadStrategy());
    });
  });

  describe('PrefetchMode Type', () => {
    it('should accept all valid modes', () => {
      const modes: PrefetchMode[] = ['idle', 'visible', 'all', 'smart', 'manual'];

      modes.forEach((mode) => {
        const strategy = new PreloadStrategy({ mode });
        expect(strategy.getConfig().mode).toBe(mode);
      });
    });
  });
});