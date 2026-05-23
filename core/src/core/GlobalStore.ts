/**
 * OrionMF GlobalStore Module - Global State Management
 *
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §4.0
 * Design: Shared state between micro-apps with version control and ownership
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** Store value with metadata */
export interface StoreValue {
  data: unknown;
  /** Per-key version number for CAS (Compare-And-Swap) support */
  version: number;
  timestamp: number;
  owner: string;
}

/** Subscriber callback type */
export type SubscriberCallback = (
  key: string,
  value: unknown,
  meta: Pick<StoreValue, 'version' | 'timestamp' | 'owner'>
) => void;

/** Options for set operation */
export interface SetOptions {
  /** Expected version for CAS - write only if current version matches */
  expectedVersion?: number;
}

/** Result of a CAS set operation */
export interface CasResult {
  /** Whether the write succeeded */
  success: boolean;
  /** Current version (may be newer if CAS failed) */
  currentVersion: number;
}

// ============================================================================
// GlobalStore Class
// ============================================================================

/**
 * GlobalStore - Global state management with version control and ownership
 *
 * Features:
 * - State sharing between micro-apps
 * - Per-key version control with CAS (Compare-And-Swap) support
 * - Subscription mechanism for state changes
 * - Ownership tracking for cleanup
 */
export class GlobalStore {
  private store = new Map<string, StoreValue>();
  private subscribers = new Map<string, Set<SubscriberCallback>>();

  /**
   * Set global state
   * @param key - State key
   * @param value - State value
   * @param owner - Owner app key (sub-app identifier)
   * @returns CasResult for CAS operations, void for simple set
   */
  set(key: string, value: unknown, owner: string): void;
  set(key: string, value: unknown, owner: string, options: SetOptions): CasResult;
  set(key: string, value: unknown, owner: string, options?: SetOptions): void | CasResult {
    const existing = this.store.get(key);
    const currentVersion = existing?.version ?? 0;

    // CAS check if expectedVersion is provided
    if (options?.expectedVersion !== undefined) {
      if (currentVersion !== options.expectedVersion) {
        return { success: false, currentVersion };
      }
    }

    const newVersion = currentVersion + 1;
    const meta: StoreValue = {
      data: value,
      version: newVersion,
      timestamp: Date.now(),
      owner,
    };
    this.store.set(key, meta);

    // Notify subscribers with metadata
    const keySubscribers = this.subscribers.get(key);
    if (keySubscribers) {
      const { version, timestamp, owner: ownerName } = meta;
      for (const cb of keySubscribers) {
        cb(key, value, { version, timestamp, owner: ownerName });
      }
    }

    // Return CAS result if options were provided
    if (options?.expectedVersion !== undefined) {
      return { success: true, currentVersion: newVersion };
    }
  }

  /**
   * Get global state
   * @param key - State key
   * @returns State value or undefined
   */
  get(key: string): unknown {
    return this.store.get(key)?.data;
  }

  /**
   * Subscribe to state changes
   * @param key - State key to subscribe
   * @param callback - Callback function (receives key, value, and metadata)
   * @returns Unsubscribe function
   */
  subscribe(key: string, callback: SubscriberCallback): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  /**
   * Get multiple states at once
   * @param keys - Array of state keys
   * @returns Record of key-value pairs
   */
  getMany(keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = this.get(key);
    }
    return result;
  }

  /**
   * Batch set multiple states with single notification batch
   * @param states - Record of key-value pairs
   * @param owner - Owner app key
   */
  setMany(states: Record<string, unknown>, owner: string): void {
    const updatedKeys: string[] = [];

    // First pass: update all values without notifying
    for (const [key, value] of Object.entries(states)) {
      const existing = this.store.get(key);
      const newVersion = (existing?.version ?? 0) + 1;
      this.store.set(key, {
        data: value,
        version: newVersion,
        timestamp: Date.now(),
        owner,
      });
      updatedKeys.push(key);
    }

    // Second pass: batch notify subscribers
    for (const key of updatedKeys) {
      const entry = this.store.get(key);
      if (entry) {
        const keySubscribers = this.subscribers.get(key);
        if (keySubscribers) {
          const { version, timestamp, owner: ownerName } = entry;
          for (const cb of keySubscribers) {
            cb(key, entry.data, { version, timestamp, owner: ownerName });
          }
        }
      }
    }
  }

  /**
   * Cleanup states owned by a specific sub-app
   * @param owner - Owner app key to cleanup
   */
  cleanup(owner: string): void {
    for (const [key, value] of this.store) {
      if (value.owner === owner) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get all states (for debugging)
   * @returns Object containing all store values
   */
  debug(): Record<string, StoreValue> {
    return Object.fromEntries(this.store);
  }

  /**
   * Check if a key exists in the store
   * @param key - State key
   * @returns true if key exists
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Get state metadata
   * @param key - State key
   * @returns StoreValue or undefined
   */
  getMeta(key: string): StoreValue | undefined {
    return this.store.get(key);
  }

  /**
   * Delete a specific state
   * @param key - State key to delete
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all states
   */
  clear(): void {
    this.store.clear();
    this.subscribers.clear();
  }

  /**
   * Reset the globalStore singleton (TEST ONLY).
   * Replaces the exported reference with a fresh instance.
   * @internal
   */
  static resetForTest(): void {
    // The module-level export holds a reference to the old instance,
    // so we just clear — tests should call globalStore.clear() in beforeEach.
    // This method exists as a documented escape hatch if full re-instantiation is needed.
    globalStore.store.clear();
    globalStore.subscribers.clear();
  }

  /**
   * Get store size
   * @returns Number of states in store
   */
  size(): number {
    return this.store.size;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global singleton instance
 */
export const globalStore = new GlobalStore();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Set global state (convenience function)
 */
export const setGlobalState = (key: string, value: unknown, owner: string): void => {
  globalStore.set(key, value, owner);
};

/**
 * Set global state with CAS (convenience function)
 */
export const setGlobalStateCas = (
  key: string,
  value: unknown,
  owner: string,
  expectedVersion: number
): import('./GlobalStore').CasResult => {
  return globalStore.set(key, value, owner, { expectedVersion });
};

/**
 * Get global state (convenience function)
 */
export const getGlobalState = (key: string): unknown => {
  return globalStore.get(key);
};

/**
 * Subscribe to global state (convenience function)
 */
export const subscribeGlobalState = (
  key: string,
  callback: SubscriberCallback
): (() => void) => {
  return globalStore.subscribe(key, callback);
};

/**
 * Get multiple global states (convenience function)
 */
export const getGlobalStates = (keys: string[]): Record<string, unknown> => {
  return globalStore.getMany(keys);
};

/**
 * Batch set multiple global states (convenience function)
 */
export const setGlobalStates = (
  states: Record<string, unknown>,
  owner: string
): void => {
  globalStore.setMany(states, owner);
};

/**
 * Cleanup sub-app states (convenience function)
 */
export const cleanupSubApp = (owner: string): void => {
  globalStore.cleanup(owner);
};
