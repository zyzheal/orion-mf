/**
 * CrashRecovery Module
 *
 * Provides circuit breaker pattern for sub-app crash recovery.
 * Prevents repeated loading of failing sub-apps within a cooldown period.
 */

// ============================================================================
// Types
// ============================================================================

/** Recovery context returned by setup() */
export interface RecoveryContext {
  /** Sub-app key */
  key: string;
  /** Wrapped load function with circuit breaker protection */
  load: () => Promise<void>;
}

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Number of failures to trigger circuit break */
  threshold: number;
  /** Time window for counting failures (ms) */
  window: number;
  /** Cooldown period after circuit breaks (ms) */
  cooldown: number;
}

/** Default configuration */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  threshold: 3,
  window: 5 * 60 * 1000, // 5 minutes
  cooldown: 30 * 60 * 1000, // 30 minutes
};

// ============================================================================
// CircuitBreaker Class
// ============================================================================

/**
 * Circuit breaker for tracking sub-app failures
 * Uses a fixed-size circular buffer to prevent unlimited growth
 */
class CircuitBreaker {
  private failures: number[] = [];
  private maxFailures = 100; // Maximum records to keep
  private lastSuccess = 0;
  private lastFailure = 0;
  private readonly key: string;

  constructor(
    key: string,
    private config: CircuitBreakerConfig = DEFAULT_CONFIG
  ) {
    this.key = key;
  }

  /** Get circuit breaker key */
  getKey(): string {
    return this.key;
  }

  /**
   * Check if the circuit breaker is currently tripped
   */
  isTripped(): boolean {
    const now = Date.now();

    // Clean up expired entries
    this.pruneOldFailures(now);

    if (this.failures.length >= this.config.threshold) {
      const lastFailureTime = this.failures[this.failures.length - 1];
      return now - lastFailureTime < this.config.cooldown;
    }
    return false;
  }

  /**
   * Record a failure occurrence
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailure = now;
    this.failures.push(now);

    // Prevent unlimited growth - keep only half when limit reached
    if (this.failures.length > this.maxFailures) {
      this.failures = this.failures.slice(-this.maxFailures / 2);
    }
  }

  /**
   * Record a successful load
   * Resets the failure count
   */
  recordSuccess(): void {
    this.lastSuccess = Date.now();
    this.failures = [];
  }

  /**
   * Get the current failure count
   */
  getFailureCount(): number {
    return this.failures.length;
  }

  /**
   * Get the last failure timestamp
   */
  getLastFailure(): number {
    return this.lastFailure;
  }

  /**
   * Get the last success timestamp
   */
  getLastSuccess(): number {
    return this.lastSuccess;
  }

  /**
   * Clean up expired failure entries (beyond the window period)
   */
  private pruneOldFailures(now: number): void {
    const cutoff = now - this.config.window;

    // Binary search or linear scan to find first entry within window
    // Since timestamps are sorted, we can use findIndex for simplicity
    const index = this.failures.findIndex((t) => t >= cutoff);

    if (index >= 0) {
      // Keep entries from index onwards (within window)
      this.failures = this.failures.slice(index);
    } else if (this.failures.length > 0) {
      // All entries are expired
      this.failures = [];
    }
  }
}

// ============================================================================
// CrashRecovery Class
// ============================================================================

/**
 * CrashRecovery Manager
 *
 * Provides circuit breaker functionality for sub-app loading.
 * Prevents repeated loading of sub-apps that have crashed repeatedly.
 */
export class CrashRecovery {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  /**
   * Set up circuit breaker for a sub-app
   *
   * @param key - Sub-app identifier
   * @param onLoad - Load function to wrap with circuit breaker
   * @returns RecoveryContext with wrapped load function
   */
  setup(key: string, onLoad: () => Promise<void>): RecoveryContext {
    // Use DEFAULT_CONFIG for consistent settings
    const breaker = new CircuitBreaker(key, DEFAULT_CONFIG);

    this.circuitBreakers.set(key, breaker);

    return {
      key,
      load: async () => {
        if (breaker.isTripped()) {
          throw new Error(
            `SubApp ${key} is circuit-broken, retry after cooldown`
          );
        }

        try {
          await onLoad();
        } catch (error) {
          breaker.recordFailure();
          throw error;
        }
        breaker.recordSuccess();
      },
    };
  }

  /**
   * Get the circuit breaker for a specific sub-app
   */
  getCircuitBreaker(key: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(key);
  }

  /**
   * Check if a sub-app's circuit breaker is tripped
   */
  isTripped(key: string): boolean {
    const breaker = this.circuitBreakers.get(key);
    return breaker ? breaker.isTripped() : false;
  }

  /**
   * Manually record a failure for a sub-app
   */
  recordFailure(key: string): void {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      breaker.recordFailure();
    }
  }

  /**
   * Manually record a success for a sub-app
   */
  recordSuccess(key: string): void {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      breaker.recordSuccess();
    }
  }

  /**
   * Get failure count for a sub-app
   */
  getFailureCount(key: string): number {
    const breaker = this.circuitBreakers.get(key);
    return breaker ? breaker.getFailureCount() : 0;
  }

  /**
   * Reset the circuit breaker for a sub-app
   */
  reset(key: string): void {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      breaker.recordSuccess();
    }
  }

  /**
   * Remove a circuit breaker
   */
  remove(key: string): void {
    this.circuitBreakers.delete(key);
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.circuitBreakers.clear();
  }
}

// ============================================================================
// Export
// ============================================================================

export type { CircuitBreakerConfig as CrashRecoveryConfig };