/**
 * SubAppCache Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SubAppCache,
  getSubAppCache,
  setSubAppCache,
  CacheMode,
  CacheEntry,
} from '../src/core/SubAppCache';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockUnmount(): () => Promise<void> {
  return vi.fn().mockResolvedValue(undefined);
}

function createMockContainer(): HTMLElement {
  const container = document.createElement('div');
  container.style.display = '';
  document.body.appendChild(container);
  return container;
}

function cleanupContainer(container: HTMLElement | null): void {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('SubAppCache Module', () => {
  let cache: SubAppCache;

  beforeEach(() => {
    // Reset global instance before each test
    setSubAppCache(new SubAppCache());
    cache = new SubAppCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('SubAppCache Class', () => {
    describe('constructor', () => {
      it('should create SubAppCache instance with default config', () => {
        expect(cache).toBeInstanceOf(SubAppCache);
        expect(cache.getConfig().maxSize).toBe(5);
        expect(cache.getConfig().ttl).toBe(0);
        expect(cache.getConfig().defaultMode).toBe('keep-alive');
      });

      it('should accept custom configuration', () => {
        const customCache = new SubAppCache({
          maxSize: 10,
          ttl: 60000,
          defaultMode: 'full-unmount',
        });

        const config = customCache.getConfig();
        expect(config.maxSize).toBe(10);
        expect(config.ttl).toBe(60000);
        expect(config.defaultMode).toBe('full-unmount');
      });
    });

    describe('getConfig', () => {
      it('should return current configuration', () => {
        const config = cache.getConfig();
        expect(config).toBeDefined();
        expect(config.maxSize).toBeDefined();
        expect(config.ttl).toBeDefined();
        expect(config.defaultMode).toBeDefined();
      });

      it('should return a copy of config', () => {
        const config1 = cache.getConfig();
        const config2 = cache.getConfig();
        expect(config1).not.toBe(config2);
      });
    });

    describe('setConfig', () => {
      it('should update maxSize', () => {
        cache.setConfig({ maxSize: 3 });
        expect(cache.getConfig().maxSize).toBe(3);
      });

      it('should update ttl', () => {
        cache.setConfig({ ttl: 5000 });
        expect(cache.getConfig().ttl).toBe(5000);
      });

      it('should update defaultMode', () => {
        cache.setConfig({ defaultMode: 'full-unmount' });
        expect(cache.getConfig().defaultMode).toBe('full-unmount');
      });

      it('should preserve other config values', () => {
        cache.setConfig({ maxSize: 3 });
        expect(cache.getConfig().ttl).toBe(0);
        expect(cache.getConfig().defaultMode).toBe('keep-alive');
      });
    });

    describe('has', () => {
      it('should return false for non-cached key', () => {
        expect(cache.has('app1')).toBe(false);
      });

      it('should return true for cached key after evict', async () => {
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);

        expect(cache.has('app1')).toBe(true);

        cleanupContainer(container);
      });

      it('should return false after purge', async () => {
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);
        await cache.purge('app1');

        expect(cache.has('app1')).toBe(false);

        cleanupContainer(container);
      });
    });

    describe('size', () => {
      it('should return 0 for empty cache', () => {
        expect(cache.size).toBe(0);
      });

      it('should return correct size after evicting', async () => {
        const unmount1 = createMockUnmount();
        const unmount2 = createMockUnmount();
        const container1 = createMockContainer();
        const container2 = createMockContainer();

        await cache.evict('app1', unmount1, container1);
        await cache.evict('app2', unmount2, container2);

        expect(cache.size).toBe(2);

        cleanupContainer(container1);
        cleanupContainer(container2);
      });

      it('should return correct size after purging', async () => {
        const unmount1 = createMockUnmount();
        const unmount2 = createMockUnmount();
        const container1 = createMockContainer();
        const container2 = createMockContainer();

        await cache.evict('app1', unmount1, container1);
        await cache.evict('app2', unmount2, container2);
        await cache.purge('app1');

        expect(cache.size).toBe(1);

        cleanupContainer(container1);
        cleanupContainer(container2);
      });
    });

    describe('keys', () => {
      it('should return empty array for empty cache', () => {
        expect(cache.keys()).toEqual([]);
      });

      it('should return all keys', async () => {
        const unmount1 = createMockUnmount();
        const unmount2 = createMockUnmount();
        const container1 = createMockContainer();
        const container2 = createMockContainer();

        await cache.evict('app1', unmount1, container1);
        await cache.evict('app2', unmount2, container2);

        const keys = cache.keys();
        expect(keys).toContain('app1');
        expect(keys).toContain('app2');
        expect(keys.length).toBe(2);

        cleanupContainer(container1);
        cleanupContainer(container2);
      });
    });

    describe('get', () => {
      it('should return undefined for non-cached key', () => {
        expect(cache.get('app1')).toBeUndefined();
      });

      it('should return cache entry for cached key', async () => {
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);
        const entry = cache.get('app1');

        expect(entry).toBeDefined();
        expect(entry?.unmount).toBe(unmount);
        expect(entry?.mode).toBe('keep-alive');
        expect(entry?.container).toBe(container);

        cleanupContainer(container);
      });
    });

    describe('entries', () => {
      it('should return empty array for empty cache', () => {
        expect(cache.entries()).toEqual([]);
      });

      it('should return all entries', async () => {
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);
        const entries = cache.entries();

        expect(entries.length).toBe(1);
        expect(entries[0][0]).toBe('app1');
        expect(entries[0][1]).toBeDefined();

        cleanupContainer(container);
      });
    });
  });

  describe('evict', () => {
    describe('keep-alive mode', () => {
      it('should hide container in keep-alive mode', async () => {
        const cache = new SubAppCache({ defaultMode: 'keep-alive' });
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);

        expect(container.style.display).toBe('none');
        expect(unmount).not.toHaveBeenCalled();

        cleanupContainer(container);
      });

      it('should not hide container in full-unmount mode', async () => {
        const cache = new SubAppCache({ defaultMode: 'full-unmount' });
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);

        expect(container.style.display).toBe('');
        expect(unmount).toHaveBeenCalled();

        cleanupContainer(container);
      });

      it('should call unmount if no container in keep-alive mode', async () => {
        const cache = new SubAppCache({ defaultMode: 'keep-alive' });
        const unmount = createMockUnmount();

        await cache.evict('app1', unmount);

        expect(unmount).toHaveBeenCalled();
      });
    });

    describe('LRU eviction', () => {
      it('should evict oldest when cache is full', async () => {
        const cache = new SubAppCache({ maxSize: 2, defaultMode: 'full-unmount' });

        const unmount1 = createMockUnmount();
        const unmount2 = createMockUnmount();
        const unmount3 = createMockUnmount();

        await cache.evict('app1', unmount1);
        await cache.evict('app2', unmount2);
        await cache.evict('app3', unmount3);

        expect(cache.size).toBe(2);
        expect(cache.has('app1')).toBe(false);
        expect(cache.has('app2')).toBe(true);
        expect(cache.has('app3')).toBe(true);
      });

      it('should update access order on restore', async () => {
        const cache = new SubAppCache({ maxSize: 2, defaultMode: 'full-unmount' });

        const unmount1 = createMockUnmount();
        const unmount2 = createMockUnmount();
        const unmount3 = createMockUnmount();

        await cache.evict('app1', unmount1);
        await cache.evict('app2', unmount2);

        // Access app1 to update its timestamp
        await cache.restore('app1', async () => {});

        // Now evict app3, should evict app2 (oldest)
        await cache.evict('app3', unmount3);

        expect(cache.size).toBe(2);
        expect(cache.has('app1')).toBe(true);
        expect(cache.has('app2')).toBe(false);
        expect(cache.has('app3')).toBe(true);
      });
    });
  });

  describe('restore', () => {
    describe('keep-alive mode', () => {
      it('should show container in keep-alive mode', async () => {
        const cache = new SubAppCache({ defaultMode: 'keep-alive' });
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);
        await cache.restore('app1');

        expect(container.style.display).toBe('');
        expect(unmount).not.toHaveBeenCalled();
        cleanupContainer(container);
      });

      it('should not require remount in keep-alive mode', async () => {
        const cache = new SubAppCache({ defaultMode: 'keep-alive' });
        const unmount = createMockUnmount();
        const container = createMockContainer();

        await cache.evict('app1', unmount, container);
        const result = await cache.restore('app1');

        expect(result).toBe(true);
        cleanupContainer(container);
      });
    });

    describe('full-unmount mode', () => {
      it('should call remount in full-unmount mode', async () => {
        const cache = new SubAppCache({ defaultMode: 'full-unmount' });
        const unmount = createMockUnmount();
        const remount = createMockUnmount();

        await cache.evict('app1', unmount);
        const result = await cache.restore('app1', remount);

        expect(remount).toHaveBeenCalled();
        expect(result).toBe(true);
      });
    });

    describe('TTL expiration', () => {
      it('should return false and purge if TTL expired', async () => {
        const cache = new SubAppCache({ ttl: 50, defaultMode: 'full-unmount' });
        const unmount = createMockUnmount();

        await cache.evict('app1', unmount);

        // Wait for TTL to expire
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result = await cache.restore('app1', async () => {});

        expect(result).toBe(false);
        expect(cache.has('app1')).toBe(false);
      });

      it('should not expire if TTL is 0 (no expiration)', async () => {
        const cache = new SubAppCache({ ttl: 0, defaultMode: 'full-unmount' });
        const unmount = createMockUnmount();
        const remount = createMockUnmount();

        await cache.evict('app1', unmount);

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result = await cache.restore('app1', remount);

        expect(result).toBe(true);
        expect(remount).toHaveBeenCalled();
      });
    });

    describe('cache miss', () => {
      it('should return false for non-existent key', async () => {
        const result = await cache.restore('app1', async () => {});
        expect(result).toBe(false);
      });
    });

    describe('LRU update on restore', () => {
      it('should update access order on restore', async () => {
        const cache = new SubAppCache({ maxSize: 2, defaultMode: 'full-unmount' });

        const unmount1 = createMockUnmount();
        const unmount2 = createMockUnmount();
        const unmount3 = createMockUnmount();

        await cache.evict('app1', unmount1);
        await cache.evict('app2', unmount2);

        // Access app1 to make it most recent
        await cache.restore('app1', async () => {});

        // Evict app3 should evict app2 (oldest)
        await cache.evict('app3', unmount3);

        expect(cache.has('app1')).toBe(true);
        expect(cache.has('app2')).toBe(false);
        expect(cache.has('app3')).toBe(true);
      });
    });
  });

  describe('purge', () => {
    it('should call unmount and remove entry in keep-alive mode', async () => {
      const cache = new SubAppCache({ defaultMode: 'keep-alive' });
      const unmount = createMockUnmount();
      const container = createMockContainer();

      await cache.evict('app1', unmount, container);
      await cache.purge('app1');

      expect(unmount).toHaveBeenCalled();
      expect(container.style.display).toBe('');
      expect(cache.has('app1')).toBe(false);

      cleanupContainer(container);
    });

    it('should remove entry without calling unmount in full-unmount mode', async () => {
      const cache = new SubAppCache({ defaultMode: 'full-unmount' });
      const unmount = createMockUnmount();

      await cache.evict('app1', unmount);
      await cache.purge('app1');

      expect(unmount).toHaveBeenCalledTimes(1); // Only called during evict
      expect(cache.has('app1')).toBe(false);
    });

    it('should handle non-existent key', async () => {
      // Should not throw
      await expect(cache.purge('app1')).resolves.not.toThrow();
    });
  });

  describe('purgeAll', () => {
    it('should clear all entries and call unmount', async () => {
      const cache = new SubAppCache({ defaultMode: 'keep-alive' });

      const unmount1 = createMockUnmount();
      const unmount2 = createMockUnmount();
      const container1 = createMockContainer();
      const container2 = createMockContainer();

      await cache.evict('app1', unmount1, container1);
      await cache.evict('app2', unmount2, container2);

      await cache.purgeAll();

      expect(unmount1).toHaveBeenCalled();
      expect(unmount2).toHaveBeenCalled();
      expect(cache.size).toBe(0);

      cleanupContainer(container1);
      cleanupContainer(container2);
    });

    it('should handle empty cache', async () => {
      // Should not throw
      await expect(cache.purgeAll()).resolves.not.toThrow();
    });

    it('should continue purging even if one unmount fails', async () => {
      const cache = new SubAppCache({ defaultMode: 'keep-alive' });

      const failingUnmount = vi.fn().mockRejectedValue(new Error('fail'));
      const successUnmount = createMockUnmount();
      const container1 = createMockContainer();
      const container2 = createMockContainer();

      await cache.evict('app1', failingUnmount, container1);
      await cache.evict('app2', successUnmount, container2);

      // Should not throw, continue to purge all
      await expect(cache.purgeAll()).resolves.not.toThrow();

      expect(cache.size).toBe(0);

      cleanupContainer(container1);
      cleanupContainer(container2);
    });
  });

  describe('reset', () => {
    it('should clear all entries without calling unmount', async () => {
      const unmount = createMockUnmount();
      const container = createMockContainer();

      await cache.evict('app1', unmount, container);
      cache.reset();

      expect(unmount).not.toHaveBeenCalled();
      expect(cache.has('app1')).toBe(false);

      cleanupContainer(container);
    });
  });

  describe('global singleton', () => {
    it('getSubAppCache should return global instance', () => {
      const cache1 = getSubAppCache();
      const cache2 = getSubAppCache();
      expect(cache1).toBe(cache2);
    });

    it('setSubAppCache should set global instance', () => {
      const customCache = new SubAppCache({ maxSize: 10 });
      setSubAppCache(customCache);

      expect(getSubAppCache()).toBe(customCache);
    });

    it('should use custom config from options', () => {
      setSubAppCache(new SubAppCache({ maxSize: 20, ttl: 5000 }));

      const cache = getSubAppCache();
      expect(cache.getConfig().maxSize).toBe(20);
      expect(cache.getConfig().ttl).toBe(5000);
    });
  });
});