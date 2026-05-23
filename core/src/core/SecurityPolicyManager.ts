/**
 * OrionMF SecurityPolicyManager Module - Security Policy Configuration
 *
 * Provides configurable security policies for micro-frontend sandboxing
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §4.2.6
 */

import type { SandboxConfig } from './interface';

// ============================================================================
// Type Definitions
// ============================================================================

/** Sandbox mode types */
export type SandboxMode = 'strict' | 'loose' | 'none';

/** CSS isolation mode types */
export type CSSIsolationMode = 'shadow-dom' | 'scoped-css' | 'runtime-prefix' | 'none';

/** Security policy configuration */
export interface SecurityPolicy {
  /** Sandbox execution mode */
  mode: SandboxMode;
  /** Whitelist: allowed global properties (effective in 'loose' mode) */
  whitelist: string[];
  /** Blacklist: blocked global properties (effective in all modes) */
  blacklist: string[];
  /** CSS isolation mode */
  cssIsolation: CSSIsolationMode;
  /** Whether to isolate localStorage/sessionStorage */
  isolateStorage: boolean;
  /** Whether to block dynamic script injection */
  blockDynamicScripts: boolean;
  /** Whether to block eval/Function */
  blockEval: boolean;
}

/** Preset policy keys */
export type PresetKey = 'strict' | 'loose' | 'none';

// ============================================================================
// Preset Policies
// ============================================================================

/**
 * Preset security policies
 */
export const PRESETS: Record<PresetKey, SecurityPolicy> = {
  /**
   * Strict mode - for untrusted third-party micro-apps
   */
  strict: {
    mode: 'strict',
    whitelist: [],
    blacklist: [
      'eval',
      'Function',
      '__proto__',
      'constructor',
      'alert',
      'confirm',
      'prompt',
    ],
    cssIsolation: 'shadow-dom',
    isolateStorage: true,
    blockDynamicScripts: true,
    blockEval: true,
  },

  /**
   * Loose mode - for trusted internal micro-apps
   */
  loose: {
    mode: 'loose',
    whitelist: [
      'console',
      'localStorage',
      'sessionStorage',
      'fetch',
      'XMLHttpRequest',
    ],
    blacklist: ['eval', 'Function', '__proto__', 'constructor'],
    cssIsolation: 'scoped-css',
    isolateStorage: false,
    blockDynamicScripts: false,
    blockEval: true,
  },

  /**
   * None mode - for fully trusted micro-apps (e.g., main app built-in modules)
   * Still preserves basic prototype pollution protection
   */
  none: {
    mode: 'none',
    whitelist: [],
    blacklist: ['__proto__', 'constructor'],
    cssIsolation: 'none',
    isolateStorage: false,
    blockDynamicScripts: false,
    blockEval: false,
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Deep clone a security policy (including array fields)
 */
function clonePolicy(policy: SecurityPolicy): SecurityPolicy {
  return {
    ...policy,
    whitelist: [...policy.whitelist],
    blacklist: [...policy.blacklist],
  };
}

/**
 * Merge partial policy with existing policy
 */
function mergePolicy(
  existing: SecurityPolicy,
  updates: Partial<SecurityPolicy>
): SecurityPolicy {
  const merged = { ...existing };

  if (updates.mode !== undefined) merged.mode = updates.mode;
  if (updates.whitelist !== undefined) merged.whitelist = [...updates.whitelist];
  if (updates.blacklist !== undefined) merged.blacklist = [...updates.blacklist];
  if (updates.cssIsolation !== undefined) merged.cssIsolation = updates.cssIsolation;
  if (updates.isolateStorage !== undefined) merged.isolateStorage = updates.isolateStorage;
  if (updates.blockDynamicScripts !== undefined)
    merged.blockDynamicScripts = updates.blockDynamicScripts;
  if (updates.blockEval !== undefined) merged.blockEval = updates.blockEval;

  return merged;
}

// ============================================================================
// SecurityPolicyManager Class
// ============================================================================

/**
 * SecurityPolicyManager - Manages security policies for micro-apps
 *
 * Features:
 * - Preset policies: strict / loose / none
 * - Custom policy override for any preset field
 * - Integration with Sandbox via applyPolicyToSandbox()
 */
export class SecurityPolicyManager {
  /** Internal policy storage */
  private policies = new Map<string, SecurityPolicy>();

  /** Event listeners for policy changes */
  private listeners = new Set<(key: string, policy: SecurityPolicy) => void>();

  /**
   * Apply a preset policy to a micro-app
   * @param appKey - Unique identifier for the micro-app
   * @param preset - Preset key: 'strict' | 'loose' | 'none'
   */
  applyPreset(appKey: string, preset: PresetKey): void {
    const presetPolicy = PRESETS[preset];
    if (!presetPolicy) {
      console.warn(
        `[orion-mf:SecurityPolicyManager] Unknown preset: ${preset}, using 'strict'`
      );
      this.policies.set(appKey, clonePolicy(PRESETS.strict));
    } else {
      this.policies.set(appKey, clonePolicy(presetPolicy));
    }
    this.notifyListeners(appKey);
  }

  /**
   * Set a custom policy for a micro-app
   * Merges with existing policy or default strict preset
   * @param appKey - Unique identifier for the micro-app
   * @param policy - Partial policy to merge
   */
  setPolicy(appKey: string, policy: Partial<SecurityPolicy>): void {
    const existing = this.policies.get(appKey) ?? clonePolicy(PRESETS.strict);
    const merged = mergePolicy(existing, policy);
    this.policies.set(appKey, merged);
    this.notifyListeners(appKey);
  }

  /**
   * Get the security policy for a micro-app
   * Returns strict preset if no policy is set
   * @param appKey - Unique identifier for the micro-app
   */
  getPolicy(appKey: string): SecurityPolicy {
    const policy = this.policies.get(appKey);
    return policy ? clonePolicy(policy) : clonePolicy(PRESETS.strict);
  }

  /**
   * Batch set policies for multiple micro-apps
   * @param policies - Record of appKey to partial policy
   */
  setPolicies(policies: Record<string, Partial<SecurityPolicy>>): void {
    for (const [key, policy] of Object.entries(policies)) {
      this.setPolicy(key, policy);
    }
  }

  /**
   * Get all policies (for debugging)
   */
  getAll(): Record<string, SecurityPolicy> {
    const result: Record<string, SecurityPolicy> = {};
    for (const [key, policy] of this.policies.entries()) {
      result[key] = clonePolicy(policy);
    }
    return result;
  }

  /**
   * Check if a policy exists for an app
   * @param appKey - Unique identifier for the micro-app
   */
  hasPolicy(appKey: string): boolean {
    return this.policies.has(appKey);
  }

  /**
   * Remove policy for a micro-app
   * @param appKey - Unique identifier for the micro-app
   */
  removePolicy(appKey: string): void {
    this.policies.delete(appKey);
    this.notifyListeners(appKey);
  }

  /**
   * Clear all policies
   */
  clear(): void {
    this.policies.clear();
    this.notifyListeners('');
  }

  /**
   * Cleanup resources for a specific micro-app
   * @param appKey - Unique identifier for the micro-app
   */
  cleanup(appKey: string): void {
    this.removePolicy(appKey);
  }

  /**
   * Subscribe to policy changes
   * @param callback - Function called when policy changes
   */
  subscribe(
    callback: (key: string, policy: SecurityPolicy) => void
  ): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Apply security policy to Sandbox configuration
   * Converts SecurityPolicy to SandboxConfig compatible settings
   * @param appKey - Unique identifier for the micro-app
   */
  applyPolicyToSandbox(appKey: string): Pick<
    SandboxConfig,
    'key' | 'enabled'
  > & {
    whitelist: string[];
    blacklist: string[];
    cssIsolation: CSSIsolationMode;
    isolateStorage: boolean;
    blockDynamicScripts: boolean;
    blockEval: boolean;
  } {
    const policy = this.getPolicy(appKey);

    return {
      key: appKey,
      enabled: policy.mode !== 'none',
      whitelist: [...policy.whitelist],
      blacklist: [...policy.blacklist],
      cssIsolation: policy.cssIsolation,
      isolateStorage: policy.isolateStorage,
      blockDynamicScripts: policy.blockDynamicScripts,
      blockEval: policy.blockEval,
    };
  }

  /**
   * Check if a property is allowed for a micro-app
   * @param appKey - Unique identifier for the micro-app
   * @param property - Property name to check
   */
  isPropertyAllowed(appKey: string, property: string): boolean {
    const policy = this.getPolicy(appKey);

    // Check blacklist first (applies to all modes)
    if (policy.blacklist.includes(property)) {
      return false;
    }

    // In strict mode, only whitelist is allowed
    if (policy.mode === 'strict') {
      return policy.whitelist.length === 0 || policy.whitelist.includes(property);
    }

    // In loose mode, check whitelist
    if (policy.mode === 'loose') {
      if (policy.whitelist.length === 0) return true;
      return policy.whitelist.includes(property);
    }

    // In none mode, allow all
    return true;
  }

  /**
   * Notify all listeners of policy change
   */
  private notifyListeners(appKey: string): void {
    const policy = appKey ? this.getPolicy(appKey) : null;
    this.listeners.forEach((callback) => {
      if (policy) {
        callback(appKey, policy);
      }
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Default SecurityPolicyManager instance */
export const securityPolicyManager = new SecurityPolicyManager();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Apply preset policy for a micro-app
 */
export function applyPreset(appKey: string, preset: PresetKey): void {
  securityPolicyManager.applyPreset(appKey, preset);
}

/**
 * Set custom policy for a micro-app
 */
export function setPolicy(appKey: string, policy: Partial<SecurityPolicy>): void {
  securityPolicyManager.setPolicy(appKey, policy);
}

/**
 * Get policy for a micro-app
 */
export function getPolicy(appKey: string): SecurityPolicy {
  return securityPolicyManager.getPolicy(appKey);
}

/**
 * Cleanup policy for a micro-app
 */
export function cleanupSecurityPolicy(appKey: string): void {
  securityPolicyManager.cleanup(appKey);
}

// ============================================================================
// Export Types
// ============================================================================

export type { SandboxConfig } from './interface';