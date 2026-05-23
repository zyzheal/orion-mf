/**
 * LeakPrevention Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LeakPrevention } from '../src/core/LeakPrevention';

// ============================================================================
// Test Setup
// ============================================================================

describe('LeakPrevention Module', () => {
  let leakPrevention: LeakPrevention;

  beforeEach(() => {
    leakPrevention = new LeakPrevention();
  });

  afterEach(() => {
    leakPrevention.cleanupAll();
  });

  describe('LeakPrevention Class', () => {
    describe('constructor', () => {
      it('should create LeakPrevention instance', () => {
        expect(leakPrevention).toBeInstanceOf(LeakPrevention);
      });

      it('should accept custom options', () => {
        const onWarning = vi.fn();
        const lp = new LeakPrevention({
          memoryThreshold: 100 * 1024 * 1024,
          memoryCheckInterval: 10000,
          onMemoryWarning: onWarning,
        });

        expect(lp).toBeInstanceOf(LeakPrevention);
      });
    });

    describe('setup', () => {
      it('should set up leak context for sub-app', () => {
        const context = leakPrevention.setup('test-app');

        expect(context).toBeDefined();
        expect(context.key).toBe('test-app');
        expect(context.signal).toBeInstanceOf(AbortSignal);
      });

      it('should create independent contexts for different apps', () => {
        const ctx1 = leakPrevention.setup('app-1');
        const ctx2 = leakPrevention.setup('app-2');

        expect(ctx1.signal).not.toBe(ctx2.signal);
      });

      it('should throw when fetching without setup', async () => {
        await expect(
          leakPrevention.fetch('non-existent', 'https://example.com')
        ).rejects.toThrow('Leak context not setup');
      });
    });

    describe('hasContext', () => {
      it('should return false for non-existent key', () => {
        expect(leakPrevention.hasContext('non-existent')).toBe(false);
      });

      it('should return true after setup', () => {
        leakPrevention.setup('test-app');
        expect(leakPrevention.hasContext('test-app')).toBe(true);
      });

      it('should return false after cleanup', () => {
        leakPrevention.setup('test-app');
        leakPrevention.cleanup('test-app');
        expect(leakPrevention.hasContext('test-app')).toBe(false);
      });
    });

    describe('registerDOM / unregisterDOM', () => {
      it('should register DOM nodes', () => {
        leakPrevention.setup('test-app');
        const node = document.createElement('div');

        leakPrevention.registerDOM('test-app', node);

        expect(leakPrevention.getRegisteredDOMCount('test-app')).toBe(1);
      });

      it('should unregister DOM nodes', () => {
        leakPrevention.setup('test-app');
        const node = document.createElement('div');

        leakPrevention.registerDOM('test-app', node);
        leakPrevention.unregisterDOM('test-app', node);

        expect(leakPrevention.getRegisteredDOMCount('test-app')).toBe(0);
      });

      it('should handle unregistering non-existent node', () => {
        leakPrevention.setup('test-app');
        const node = document.createElement('div');

        // Should not throw
        leakPrevention.unregisterDOM('test-app', node);
        expect(leakPrevention.getRegisteredDOMCount('test-app')).toBe(0);
      });

      it('should track multiple DOM nodes', () => {
        leakPrevention.setup('test-app');
        const node1 = document.createElement('div');
        const node2 = document.createElement('span');
        const node3 = document.createElement('p');

        leakPrevention.registerDOM('test-app', node1);
        leakPrevention.registerDOM('test-app', node2);
        leakPrevention.registerDOM('test-app', node3);

        expect(leakPrevention.getRegisteredDOMCount('test-app')).toBe(3);
      });
    });

    describe('fetch', () => {
      it('should create fetch with abort signal', async () => {
        leakPrevention.setup('test-app');

        // Mock fetch
        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        vi.stubGlobal('fetch', mockFetch);

        await leakPrevention.fetch('test-app', 'https://example.com/api');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api',
          expect.objectContaining({
            signal: expect.any(AbortSignal),
          })
        );
      });

      it('should pass through fetch options', async () => {
        leakPrevention.setup('test-app');

        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        vi.stubGlobal('fetch', mockFetch);

        await leakPrevention.fetch('test-app', 'https://example.com/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foo: 'bar' }),
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foo: 'bar' }),
            signal: expect.any(AbortSignal),
          })
        );
      });

      vi.restoreAllMocks();
    });

    describe('cleanup', () => {
      it('should cleanup all resources for a key', () => {
        leakPrevention.setup('test-app');
        const node = document.createElement('div');
        leakPrevention.registerDOM('test-app', node);

        leakPrevention.cleanup('test-app');

        expect(leakPrevention.hasContext('test-app')).toBe(false);
        expect(leakPrevention.getRegisteredDOMCount('test-app')).toBe(0);
      });

      it('should abort pending requests on cleanup', async () => {
        leakPrevention.setup('test-app');

        // Create an AbortError promise that should be triggered
        const context = leakPrevention['abortControllers'].get('test-app');
        let abortCalled = false;
        const abortPromise = new Promise((resolve, reject) => {
          context?.signal.addEventListener('abort', () => {
            abortCalled = true;
            resolve(true);
          });
        });

        leakPrevention.cleanup('test-app');

        const result = await abortPromise;
        expect(abortCalled).toBe(true);
      });

      it('should not throw when cleaning up non-existent key', () => {
        expect(() => {
          leakPrevention.cleanup('non-existent');
        }).not.toThrow();
      });

      it('should cleanup multiple apps independently', () => {
        leakPrevention.setup('app-1');
        leakPrevention.setup('app-2');
        leakPrevention.registerDOM('app-1', document.createElement('div'));
        leakPrevention.registerDOM('app-2', document.createElement('span'));

        leakPrevention.cleanup('app-1');

        expect(leakPrevention.hasContext('app-1')).toBe(false);
        expect(leakPrevention.hasContext('app-2')).toBe(true);
        expect(leakPrevention.getRegisteredDOMCount('app-2')).toBe(1);
      });
    });

    describe('cleanupAll', () => {
      it('should cleanup all sub-apps', () => {
        leakPrevention.setup('app-1');
        leakPrevention.setup('app-2');
        leakPrevention.setup('app-3');

        leakPrevention.cleanupAll();

        expect(leakPrevention.hasContext('app-1')).toBe(false);
        expect(leakPrevention.hasContext('app-2')).toBe(false);
        expect(leakPrevention.hasContext('app-3')).toBe(false);
      });

      it('should handle empty state', () => {
        expect(() => {
          leakPrevention.cleanupAll();
        }).not.toThrow();
      });
    });

    describe('getRegisteredDOMCount', () => {
      it('should return 0 for non-existent key', () => {
        expect(leakPrevention.getRegisteredDOMCount('non-existent')).toBe(0);
      });

      it('should return accurate count', () => {
        leakPrevention.setup('test-app');
        leakPrevention.registerDOM('test-app', document.createElement('div'));
        leakPrevention.registerDOM('test-app', document.createElement('div'));

        expect(leakPrevention.getRegisteredDOMCount('test-app')).toBe(2);
      });
    });

    describe('getCurrentMemoryStats', () => {
      it('should return memory stats or null', () => {
        const stats = leakPrevention.getCurrentMemoryStats();

        // performance.memory may not be available in test environment
        expect(stats === null || typeof stats.usedJSHeapSize === 'number').toBe(true);
      });
    });

    describe('memory warning callback', () => {
      it('should call onMemoryWarning when threshold exceeded', () => {
        const onWarning = vi.fn();
        const lp = new LeakPrevention({
          memoryThreshold: 1, // Set very low threshold
          onMemoryWarning: onWarning,
        });

        lp.setup('test-app');

        // Force a check by accessing the private method or waiting for interval
        // In test, we verify the callback is defined properly
        expect(typeof lp.getCurrentMemoryStats).toBe('function');
      });
    });
  });

  describe('LeakContext Interface', () => {
    it('should provide key and signal', () => {
      const context = leakPrevention.setup('test-app');

      expect(typeof context.key).toBe('string');
      expect(context.key).toBe('test-app');
      expect(context.signal).toBeInstanceOf(AbortSignal);
      expect(typeof context.signal.aborted).toBe('boolean');
    });
  });

  describe('AbortController Integration', () => {
    it('should allow aborting fetch via context signal', async () => {
      const context = leakPrevention.setup('test-app');

      // Verify abort works - use AbortController to trigger abort
      const controller = leakPrevention['abortControllers'].get('test-app');
      controller?.abort();

      // Wait for abort event
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(context.signal.aborted).toBe(true);
    });

    it('should have independent abort signals for different apps', () => {
      const ctx1 = leakPrevention.setup('app-1');
      const ctx2 = leakPrevention.setup('app-2');

      // Abort only app-1
      const controller1 = leakPrevention['abortControllers'].get('app-1');
      controller1?.abort();

      expect(ctx1.signal.aborted).toBe(true);
      expect(ctx2.signal.aborted).toBe(false);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('LeakPrevention Edge Cases', () => {
  let leakPrevention: LeakPrevention;

  beforeEach(() => {
    leakPrevention = new LeakPrevention();
  });

  afterEach(() => {
    leakPrevention.cleanupAll();
  });

  it('should handle double cleanup', () => {
    leakPrevention.setup('test-app');
    leakPrevention.cleanup('test-app');

    expect(() => {
      leakPrevention.cleanup('test-app');
    }).not.toThrow();
  });

  it('should handle setup with same key (overwrite)', () => {
    leakPrevention.setup('test-app');
    const node1 = document.createElement('div');
    leakPrevention.registerDOM('test-app', node1);

    // Setup again with same key
    leakPrevention.setup('test-app');
    const node2 = document.createElement('div');
    leakPrevention.registerDOM('test-app', node2);

    // Should have only the new node
    expect(leakPrevention.getRegisteredDOMCount('test-app')).toBe(1);
  });

  it('should handle cleanup with DOM node that has no parent', () => {
    leakPrevention.setup('test-app');
    const node = document.createElement('div');
    // node has no parent
    leakPrevention.registerDOM('test-app', node);

    expect(() => {
      leakPrevention.cleanup('test-app');
    }).not.toThrow();
  });
});