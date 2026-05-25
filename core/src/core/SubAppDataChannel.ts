/**
 * OrionMF SubAppDataChannel Module - Global State Write Permission Control
 *
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §4.0.1
 */

import { globalStore } from './GlobalStore';
import { logger } from './logger';

// ============================================================================
// Type Definitions
// ============================================================================

/** Channel configuration */
export interface ChannelConfig {
  /** Sub-app key identifier */
  appKey: string;
  /** Whitelist of keys that this channel can modify */
  allowedKeys: string[];
}

/** State change callback */
export type StateChangeCallback = (value: unknown) => void;

// ============================================================================
// SubAppDataChannel Class
// ============================================================================

/**
 * SubAppDataChannel - Global state write permission control
 *
 * Features:
 * - Whitelist control: sub-app declares allowed keys at initialization
 * - Write interception: setState() only allows modifying whitelisted keys
 * - Read freedom: sub-app can read any global state
 * - Batch operations: getStates() retrieves multiple keys at once
 *
 * Security:
 * - Prevents unauthorized state modifications
 * - Logs warnings for unauthorized write attempts
 * - Maintains clear boundaries between sub-apps
 */
export class SubAppDataChannel {
  private allowedKeys: Set<string>;
  private appKey: string;
  private wildcard: boolean;

  /**
   * Create a new SubAppDataChannel
   * @param config - Channel configuration
   */
  constructor(config: ChannelConfig) {
    this.appKey = config.appKey;
    this.allowedKeys = new Set(config.allowedKeys);
    // Check for wildcard (*) to allow all keys
    this.wildcard = config.allowedKeys.includes('*');
  }

  /**
   * Check if a key can be modified (considering wildcard)
   */
  private isKeyAllowed(key: string): boolean {
    if (this.wildcard) return true;
    return this.allowedKeys.has(key);
  }

  /**
   * Set state (only allows modifying whitelisted keys)
   *
   * @param nextState - State object to set
   * @returns Object with results of each key modification
   *
   * @example
   * ```typescript
   * const channel = new SubAppDataChannel({
   *   appKey: 'pipeline-dashboard',
   *   allowedKeys: ['currentPipeline', 'selectedVersion'],
   * });
   *
   * channel.setState({ currentPipeline: 'build-001' });  // Success
   * channel.setState({ currentUser: 'admin' });          // Warning - not allowed
   * ```
   */
  setState(nextState: Record<string, unknown>): {
    /** Keys that were successfully set */
    success: string[];
    /** Keys that were denied */
    denied: string[];
  } {
    const success: string[] = [];
    const denied: string[] = [];
    const finalState: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(nextState)) {
      if (this.isKeyAllowed(key)) {
        finalState[key] = value;
        success.push(key);
      } else {
        denied.push(key);
        logger.warn(
          'SubAppDataChannel',
          `${this.appKey} 无权修改状态 "${key}"，` +
          `允许的范围: ${[...this.allowedKeys].join(', ')}`
        );
      }
    }

    // Batch set (only allowed keys)
    if (Object.keys(finalState).length > 0) {
      for (const [key, value] of Object.entries(finalState)) {
        globalStore.set(key, value, this.appKey);
      }
    }

    return { success, denied };
  }

  /**
   * Get a single state value (read any key - no restriction)
   *
   * @param key - State key
   * @returns State value or undefined
   */
  getState(key: string): unknown {
    return globalStore.get(key);
  }

  /**
   * Get multiple state values at once
   *
   * @param keys - Array of state keys
   * @returns Record of key-value pairs
   *
   * @example
   * ```typescript
   * const states = channel.getStates(['currentPipeline', 'selectedVersion', 'currentUser']);
   * ```
   */
  getStates(keys: string[]): Record<string, unknown> {
    return globalStore.getMany(keys);
  }

  /**
   * Subscribe to state changes
   *
   * @param key - State key to subscribe
   * @param callback - Callback function when state changes
   * @returns Unsubscribe function
   */
  subscribe(key: string, callback: StateChangeCallback): () => void {
    return globalStore.subscribe(key, (_k, v) => callback(v));
  }

  /**
   * Get the list of allowed keys for this channel
   *
   * @returns Array of allowed key strings
   */
  getAllowedKeys(): string[] {
    return [...this.allowedKeys];
  }

  /**
   * Check if a key is allowed to be modified
   *
   * @param key - State key to check
   * @returns true if key is in the whitelist
   */
  canModify(key: string): boolean {
    return this.isKeyAllowed(key);
  }

  /**
   * Cleanup states owned by this channel's app
   * Useful when sub-app is unmounted
   */
  cleanup(): void {
    globalStore.cleanup(this.appKey);
  }

  /**
   * Get app key
   * @returns The app key identifier
   */
  getAppKey(): string {
    return this.appKey;
  }

  /**
   * Get state metadata (for debugging)
   *
   * @param key - State key
   * @returns Store value with metadata
   */
  getStateMeta(key: string): { version: number; timestamp: number; owner: string } | undefined {
    const meta = globalStore.getMeta(key);
    if (!meta) return undefined;
    return {
      version: meta.version,
      timestamp: meta.timestamp,
      owner: meta.owner,
    };
  }

  /**
   * Check if state exists
   *
   * @param key - State key
   * @returns true if key exists in store
   */
  hasState(key: string): boolean {
    return globalStore.has(key);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SubAppDataChannel with default configuration
 *
 * @param appKey - Sub-app key identifier
 * @param allowedKeys - Array of allowed keys
 * @returns SubAppDataChannel instance
 */
export const createDataChannel = (appKey: string, allowedKeys: string[]): SubAppDataChannel => {
  return new SubAppDataChannel({ appKey, allowedKeys });
};

/**
 * Create a SubAppDataChannel with all-write permission (use with caution)
 *
 * @param appKey - Sub-app key identifier
 * @returns SubAppDataChannel instance with full access
 */
export const createFullAccessChannel = (appKey: string): SubAppDataChannel => {
  return new SubAppDataChannel({ appKey, allowedKeys: ['*'] });
};

/**
 * Create a read-only SubAppDataChannel
 *
 * @param appKey - Sub-app key identifier
 * @returns SubAppDataChannel instance with no write access
 */
export const createReadOnlyChannel = (appKey: string): SubAppDataChannel => {
  return new SubAppDataChannel({ appKey, allowedKeys: [] });
};