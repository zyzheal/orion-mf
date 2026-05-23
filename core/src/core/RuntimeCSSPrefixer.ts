/**
 * OrionMF RuntimeCSSPrefixer Module - CSS Runtime Prefix Hijacking
 *
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §4.2.4
 *
 * Problem: Shadow DOM cannot isolate third-party components mounted to body
 * (modals, tooltips, notifications). This module provides runtime CSS class
 * prefixing as a complement to Shadow DOM.
 *
 * Features:
 * - React: patch createElement/jsx/jsxs/cloneElement
 * - Vue: patch createVNode
 * - DOM fallback: patch className setter
 * - WeakMap based deduplication to avoid repeated patching
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** RuntimeCSSPrefixer configuration */
export interface CSSPrefixerConfig {
  /** App unique identifier */
  appKey: string;
  /** CSS class prefix to apply */
  prefix: string;
  /** Enable DOM fallback patching */
  enableDOMFallback?: boolean;
}

/** React element patching options */
export interface ReactPatchOptions {
  /** Patch createElement */
  patchCreateElement?: boolean;
  /** Patch React 18 jsx */
  patchJsx?: boolean;
  /** Patch React 18 jsxs */
  patchJsxs?: boolean;
  /** Patch cloneElement */
  patchCloneElement?: boolean;
}

// ============================================================================
// RuntimeCSSPrefixer Class
// ============================================================================

/**
 * RuntimeCSSPrefixer - CSS 运行时前缀劫持器
 *
 * Provides runtime CSS class prefixing to complement Shadow DOM isolation.
 * Handles third-party components that mount outside of Shadow DOM.
 */
export class RuntimeCSSPrefixer {
  /** App key to CSS prefix mapping */
  private prefixMap = new Map<string, string>();

  /** WeakMap to track patched React functions (avoid duplicate patches) */
  private patchedReactFunctions = new WeakMap<Function, Function>();

  /** WeakMap to track patched Vue functions (avoid duplicate patches) */
  private patchedVueFunctions = new WeakMap<Function, Function>();

  /** Flag to track if DOM setter has been patched */
  private domSetterPatched = false;

  /** Store original className descriptor */
  private originalClassNameDescriptor: PropertyDescriptor | undefined;

  /** Store app key -> enabled DOM fallback flag */
  private domFallbackEnabled = new Map<string, boolean>();

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Setup CSS prefix for a sub-app
   * @param config - Configuration containing appKey and prefix
   */
  setup(config: CSSPrefixerConfig | { appKey: string; prefix: string }): void {
    const { appKey, prefix, enableDOMFallback = true } = config as CSSPrefixerConfig;
    this.prefixMap.set(appKey, prefix);
    this.domFallbackEnabled.set(appKey, enableDOMFallback);

    // Patch DOM setter once when first app is set up
    if (enableDOMFallback && !this.domSetterPatched) {
      this.patchDOMSetter();
    }
  }

  /**
   * Patch React's createElement function
   * @param originalFn - Original React.createElement function
   * @param options - Patch options
   * @returns Patched function
   */
  patchReactCreateElement(
    originalFn: Function,
    options: ReactPatchOptions = {
      patchCreateElement: true,
      patchJsx: true,
      patchJsxs: true,
      patchCloneElement: true,
    }
  ): Function {
    // Check if already patched (using WeakMap for deduplication)
    if (this.patchedReactFunctions.has(originalFn)) {
      return this.patchedReactFunctions.get(originalFn)!;
    }

    const patched = this.createReactPatcher(originalFn, options);
    this.patchedReactFunctions.set(originalFn, patched);
    return patched;
  }

  /**
   * Patch React 18's jsx function
   * @param originalFn - Original jsx function
   * @returns Patched function
   */
  patchReactJsx(originalFn: Function): Function {
    return this.patchReactCreateElement(originalFn, { patchJsx: true });
  }

  /**
   * Patch React 18's jsxs function
   * @param originalFn - Original jsxs function
   * @returns Patched function
   */
  patchReactJsxs(originalFn: Function): Function {
    return this.patchReactCreateElement(originalFn, { patchJsxs: true });
  }

  /**
   * Patch React's cloneElement function
   * @param originalFn - Original React.cloneElement function
   * @returns Patched function
   */
  patchReactCloneElement(originalFn: Function): Function {
    return this.patchReactCreateElement(originalFn, { patchCloneElement: true });
  }

  /**
   * Patch Vue 3's createVNode function
   * @param originalFn - Original Vue createVNode function
   * @returns Patched function
   */
  patchVueCreateElement(originalFn: Function): Function {
    // Check if already patched (using WeakMap for deduplication)
    if (this.patchedVueFunctions.has(originalFn)) {
      return this.patchedVueFunctions.get(originalFn)!;
    }

    const patched = ((...args: any[]) => {
      const props = args[1];

      if (props && typeof props === 'object') {
        // Get all prefixes - use the last one as active prefix
        const prefixes = Array.from(this.prefixMap.values());
        const activePrefix = prefixes[prefixes.length - 1];

        // Vue uses 'class' instead of 'className'
        if (props.class && activePrefix) {
          props.class = this.applyPrefix(props.class, activePrefix);
        }
      }

      return (originalFn as any).apply(this, args);
    }) as Function;

    this.patchedVueFunctions.set(originalFn, patched);
    return patched;
  }

  /**
   * Patch Vue 3's createElementBlock function (block version)
   * @param originalFn - Original createElementBlock function
   * @returns Patched function
   */
  patchVueCreateElementBlock(originalFn: Function): Function {
    return this.patchVueCreateElement(originalFn);
  }

  /**
   * Apply CSS prefix to a className string
   * @param className - Original className
   * @param prefix - Prefix to apply
   * @returns Prefixed className
   */
  applyPrefix(className: string, prefix: string): string {
    if (!className || typeof className !== 'string') {
      return className;
    }

    // Get all registered prefixes to check against
    const registeredPrefixes = Array.from(this.prefixMap.values());

    return className
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => {
        // Skip if it's a CSS variable or special selector
        if (c.startsWith('--') || c.startsWith('.')) {
          return c;
        }
        // Skip if already has this exact prefix
        if (c === prefix) {
          return c;
        }
        // Skip if already has this prefix (e.g., "app1-button")
        if (c.startsWith(`${prefix}-`)) {
          return c;
        }
        // Skip if already has ANY registered prefix (e.g., "app2-button" when using app1)
        const hasOtherPrefix = registeredPrefixes.some(
          (p) => p !== prefix && (c === p || c.startsWith(`${p}-`))
        );
        if (hasOtherPrefix) {
          return c;
        }
        return `${prefix}-${c}`;
      })
      .join(' ');
  }

  /**
   * Get prefix for a specific app
   * @param appKey - App key
   * @returns Prefix string or undefined
   */
  getPrefix(appKey: string): string | undefined {
    return this.prefixMap.get(appKey);
  }

  /**
   * Get all registered prefixes
   * @returns Map of appKey -> prefix
   */
  getPrefixes(): Map<string, string> {
    return new Map(this.prefixMap);
  }

  /**
   * Check if an app has prefix configuration
   * @param appKey - App key
   * @returns true if configured
   */
  hasPrefix(appKey: string): boolean {
    return this.prefixMap.has(appKey);
  }

  /**
   * Cleanup prefix for a specific app
   * @param appKey - App key to remove
   */
  cleanup(appKey: string): void {
    this.prefixMap.delete(appKey);
    this.domFallbackEnabled.delete(appKey);

    // If no more apps, restore DOM setter
    if (this.prefixMap.size === 0 && this.domSetterPatched) {
      this.restoreDOMSetter();
    }
  }

  /**
   * Cleanup all prefixes
   */
  cleanupAll(): void {
    this.prefixMap.clear();
    this.domFallbackEnabled.clear();

    if (this.domSetterPatched) {
      this.restoreDOMSetter();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Create React element patcher function
   * @param originalFn - Original function to patch
   * @param options - Patch options
   * @returns Patched function
   */
  private createReactPatcher(
    originalFn: Function,
    _options: ReactPatchOptions
  ): Function {
    return ((type: any, props: any, ...children: any[]) => {
      if (props && typeof props === 'object') {
        // Get all prefixes - use the last one as active prefix
        const prefixes = Array.from(this.prefixMap.values());
        const activePrefix = prefixes[prefixes.length - 1];

        if (activePrefix) {
          // Handle React's className
          if (props.className && typeof props.className === 'string') {
            props.className = this.applyPrefix(props.className, activePrefix);
          }

          // Handle className as array (rare but possible)
          if (props.className && Array.isArray(props.className)) {
            props.className = props.className
              .map((c: any) => (typeof c === 'string' ? this.applyPrefix(c, activePrefix) : c))
              .join(' ');
          }
        }
      }

      return (originalFn as any).call(this, type, props, ...children);
    }) as Function;
  }

  /**
   * Patch DOM className setter as fallback
   * This handles dynamically added className that bypasses React/Vue patching
   */
  private patchDOMSetter(): void {
    if (this.domSetterPatched) return;

    try {
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'className'
      );

      if (!originalDescriptor) {
        console.warn('[RuntimeCSSPrefixer] Cannot get className descriptor');
        return;
      }

      this.originalClassNameDescriptor = { ...originalDescriptor };

      Object.defineProperty(HTMLElement.prototype, 'className', {
        get() {
          return originalDescriptor.get!.call(this);
        },
        set(value: string) {
          // Check if element has _orion-mf-prefix attribute
          const elementPrefix = (this as HTMLElement).getAttribute('_orion-mf-prefix');

          if (elementPrefix) {
            // Check if this app's fallback is enabled
            const enabled = RuntimeCSSPrefixer.instance?.domFallbackEnabled.get(elementPrefix);
            if (enabled) {
              value = value
                .split(/\s+/)
                .map((c: string) => {
                  // Skip if already has this prefix
                  if (c.startsWith(`${elementPrefix}-`) || c === elementPrefix) {
                    return c;
                  }
                  // Skip CSS variables and special selectors
                  if (c.startsWith('--') || c.startsWith('.')) {
                    return c;
                  }
                  return `${elementPrefix}-${c}`;
                })
                .join(' ');
            }
          }

          originalDescriptor.set!.call(this, value);
        },
        configurable: true,
      });

      this.domSetterPatched = true;
    } catch (error) {
      console.error('[RuntimeCSSPrefixer] Failed to patch DOM setter:', error);
    }
  }

  /**
   * Restore original DOM className setter
   */
  private restoreDOMSetter(): void {
    if (!this.domSetterPatched || !this.originalClassNameDescriptor) {
      return;
    }

    try {
      Object.defineProperty(
        HTMLElement.prototype,
        'className',
        this.originalClassNameDescriptor
      );
      this.domSetterPatched = false;
      this.originalClassNameDescriptor = undefined;
    } catch (error) {
      console.error('[RuntimeCSSPrefixer] Failed to restore DOM setter:', error);
    }
  }

  /**
   * Singleton instance reference for static access
   */
  private static instance: RuntimeCSSPrefixer | undefined;

  /**
   * Set singleton instance (for internal use)
   * @param instance - RuntimeCSSPrefixer instance
   */
  static setInstance(instance: RuntimeCSSPrefixer): void {
    RuntimeCSSPrefixer.instance = instance;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let globalInstance: RuntimeCSSPrefixer | undefined;

/**
 * Get or create global RuntimeCSSPrefixer instance
 * @returns RuntimeCSSPrefixer instance
 */
export function getRuntimeCSSPrefixer(): RuntimeCSSPrefixer {
  if (!globalInstance) {
    globalInstance = new RuntimeCSSPrefixer();
    RuntimeCSSPrefixer.setInstance(globalInstance);
  }
  return globalInstance;
}

/**
 * Create a new RuntimeCSSPrefixer instance
 * @returns New RuntimeCSSPrefixer instance
 */
export function createRuntimeCSSPrefixer(): RuntimeCSSPrefixer {
  return new RuntimeCSSPrefixer();
}

/**
 * Cleanup global RuntimeCSSPrefixer instance
 */
export function cleanupRuntimeCSSPrefixer(): void {
  if (globalInstance) {
    globalInstance.cleanupAll();
    globalInstance = undefined;
  }
}

