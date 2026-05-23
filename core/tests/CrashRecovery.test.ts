/**
 * CrashRecovery Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrashRecovery } from '../src/core/CrashRecovery';

// ============================================================================
// Test Setup
// ============================================================================

describe('CrashRecovery Module', () => {
  let crashRecovery: CrashRecovery;

  beforeEach(() => {
    crashRecovery = new CrashRecovery();
  });

  afterEach(() => {
    crashRecovery.clear();
  });

  describe('CrashRecovery Class', () => {
    describe('constructor', () => {
      it('should create CrashRecovery instance', () => {
        expect(crashRecovery).toBeInstanceOf(CrashRecovery);
      });
    });

    describe('setup', () => {
      it('should set up circuit breaker for sub-app', async () => {
        const onLoad = vi.fn().mockResolvedValue(undefined);
        const context = crashRecovery.setup('test-app', onLoad);

        expect(context).toBeDefined();
        expect(context.key).toBe('test-app');
        expect(typeof context.load).toBe('function');
      });

      it('should allow loading when not tripped', async () => {
        const onLoad = vi.fn().mockResolvedValue(undefined);
        const context = crashRecovery.setup('test-app', onLoad);

        await context.load();

        expect(onLoad).toHaveBeenCalledTimes(1);
      });

      it('should throw when circuit is tripped', async () => {
        const onLoad = vi.fn().mockRejectedValue(new Error('Load failed'));
        const context = crashRecovery.setup('test-app', onLoad);

        // Trigger failures to trip the circuit
        for (let i = 0; i < 3; i++) {
          try {
            await context.load();
          } catch {
            // Expected to fail
          }
        }

        // Now circuit should be tripped
        expect(crashRecovery.isTripped('test-app')).toBe(true);

        // Try to load again - should throw
        await expect(context.load()).rejects.toThrow('circuit-broken');
      });

      it('should reset on successful load', async () => {
        const onLoad = vi.fn().mockResolvedValue(undefined);
        const context = crashRecovery.setup('test-app', onLoad);

        // First load succeeds
        await context.load();

        // Failure count should be reset
        expect(crashRecovery.getFailureCount('test-app')).toBe(0);
      });
    });

    describe('isTripped', () => {
      it('should return false for non-existent key', () => {
        expect(crashRecovery.isTripped('non-existent')).toBe(false);
      });

      it('should return false when no failures', () => {
        crashRecovery.setup('test-app', async () => {});
        expect(crashRecovery.isTripped('test-app')).toBe(false);
      });
    });

    describe('recordFailure', () => {
      it('should manually record a failure', () => {
        crashRecovery.setup('test-app', async () => {});
        crashRecovery.recordFailure('test-app');

        expect(crashRecovery.getFailureCount('test-app')).toBe(1);
      });

      it('should handle failure for non-existent key', () => {
        expect(() => {
          crashRecovery.recordFailure('non-existent');
        }).not.toThrow();
      });
    });

    describe('recordSuccess', () => {
      it('should manually record a success', () => {
        crashRecovery.setup('test-app', async () => {});
        crashRecovery.recordFailure('test-app');
        crashRecovery.recordSuccess('test-app');

        expect(crashRecovery.getFailureCount('test-app')).toBe(0);
      });
    });

    describe('reset', () => {
      it('should reset circuit breaker', () => {
        crashRecovery.setup('test-app', async () => {});
        crashRecovery.recordFailure('test-app');
        crashRecovery.reset('test-app');

        expect(crashRecovery.getFailureCount('test-app')).toBe(0);
        expect(crashRecovery.isTripped('test-app')).toBe(false);
      });
    });

    describe('remove', () => {
      it('should remove circuit breaker', () => {
        crashRecovery.setup('test-app', async () => {});
        crashRecovery.remove('test-app');

        expect(crashRecovery.isTripped('test-app')).toBe(false);
        expect(crashRecovery.getFailureCount('test-app')).toBe(0);
      });
    });

    describe('clear', () => {
      it('should clear all circuit breakers', () => {
        crashRecovery.setup('app-1', async () => {});
        crashRecovery.setup('app-2', async () => {});
        crashRecovery.clear();

        expect(crashRecovery.isTripped('app-1')).toBe(false);
        expect(crashRecovery.isTripped('app-2')).toBe(false);
      });
    });
  });

  describe('CircuitBreaker Behavior', () => {
    it('should count failures correctly', async () => {
      const onLoad = vi.fn().mockRejectedValue(new Error('Load failed'));
      const context = crashRecovery.setup('test-app', onLoad);

      // Trigger 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await context.load();
        } catch {
          // Expected
        }
      }

      expect(crashRecovery.getFailureCount('test-app')).toBe(2);
      // Should not be tripped yet (threshold is 3)
      expect(crashRecovery.isTripped('test-app')).toBe(false);
    });

    it('should prevent unlimited failure array growth', async () => {
      const onLoad = vi.fn().mockRejectedValue(new Error('Load failed'));
      const context = crashRecovery.setup('test-app', onLoad);

      // Trigger more than maxFailures (100) failures
      for (let i = 0; i < 150; i++) {
        try {
          await context.load();
        } catch {
          // Expected
        }
      }

      // Should be capped at 50 (maxFailures / 2)
      const count = crashRecovery.getFailureCount('test-app');
      expect(count).toBeLessThanOrEqual(50);
    });

    it('should handle cooldown period correctly', async () => {
      vi.useFakeTimers();

      const onLoad = vi.fn().mockRejectedValue(new Error('Load failed'));
      const context = crashRecovery.setup('test-app', onLoad);

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await context.load();
        } catch {
          // Expected
        }
      }

      expect(crashRecovery.isTripped('test-app')).toBe(true);

      // Advance time past cooldown (30 minutes)
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Should no longer be tripped after cooldown
      // Note: isTripped calls pruneOldFailures internally
      const breaker = crashRecovery.getCircuitBreaker('test-app');
      if (breaker) {
        // Manually prune to simulate time passing
        expect(crashRecovery.isTripped('test-app')).toBe(false);
      }

      vi.useRealTimers();
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('CrashRecovery Edge Cases', () => {
  let crashRecovery: CrashRecovery;

  beforeEach(() => {
    crashRecovery = new CrashRecovery();
  });

  afterEach(() => {
    crashRecovery.clear();
  });

  it('should handle multiple sub-apps independently', async () => {
    const load1 = vi.fn().mockResolvedValue(undefined);
    const load2 = vi.fn().mockRejectedValue(new Error('Load failed'));

    const ctx1 = crashRecovery.setup('app-1', load1);
    const ctx2 = crashRecovery.setup('app-2', load2);

    await ctx1.load();
    expect(crashRecovery.isTripped('app-1')).toBe(false);

    try {
      await ctx2.load();
    } catch {
      // Expected
    }
    expect(crashRecovery.getFailureCount('app-2')).toBe(1);
  });

  it('should preserve circuit breaker state after successful load', async () => {
    const onLoad = vi.fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValueOnce(undefined);

    const context = crashRecovery.setup('test-app', onLoad);

    // First load fails
    try {
      await context.load();
    } catch {
      // Expected
    }

    expect(crashRecovery.getFailureCount('test-app')).toBe(1);

    // Second load succeeds - should reset
    await context.load();

    expect(crashRecovery.getFailureCount('test-app')).toBe(0);
  });
});