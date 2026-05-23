/**
 * OrionMF ErrorIsolator Module - Error Isolation for Micro Frontends
 *
 * Design: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §3.4
 *
 * Features:
 * - Singleton pattern: global listeners registered once only
 * - Error routing: match sub-app via filename/stack
 * - unhandledrejection: detect source via reason string
 * - Independent ErrorBoundary per sub-app
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** Error boundary callback */
export type ErrorCallback = (error: Error) => void;

/** Error boundary interface */
export interface ErrorBoundary {
  /** Capture an error */
  capture(error: Error): void;
  /** Get the sub-app key */
  getKey(): string;
}

// ============================================================================
// Global Handlers (Singleton Pattern)
// ============================================================================

/** Global error handler - registered once */
let globalErrorHandler: ((event: ErrorEvent) => void) | null = null;

/** Global unhandled rejection handler - registered once */
let globalRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

/** Reference to ErrorIsolator instance for routing */
let isolatorInstance: ErrorIsolator | null = null;

// ============================================================================
// ErrorBoundary Implementation
// ============================================================================

/**
 * ErrorBoundary - Captures errors for a specific sub-app
 */
class ErrorBoundaryImpl implements ErrorBoundary {
  constructor(
    private key: string,
    private onError: ErrorCallback
  ) {}

  capture(error: Error): void {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[orion-mf:error-isolator] Error captured from sub-app "${this.key}":`, error);
    }
    this.onError(error);
  }

  getKey(): string {
    return this.key;
  }
}

// ============================================================================
// ErrorIsolator Implementation
// ============================================================================

/**
 * ErrorIsolator - Provides error isolation for micro frontends
 *
 * Singleton pattern ensures global listeners are only registered once,
 * preventing listener accumulation when multiple sub-apps are mounted.
 *
 * Usage:
 * ```typescript
 * const isolator = new ErrorIsolator();
 * const boundary = isolator.setup('my-subapp', (error) => {
 *   console.error('Sub-app crashed:', error);
 *   // Show fallback UI, etc.
 * });
 *
 * // When unmounting sub-app:
 * isolator.remove('my-subapp');
 *
 * // When framework is destroyed:
 * isolator.destroy();
 * ```
 */
export class ErrorIsolator {
  /** Map of sub-app keys to their error boundaries */
  private errorBoundaries = new Map<string, ErrorBoundaryImpl>();

  /**
   * Create a new ErrorIsolator
   *
   * Note: Due to singleton pattern, multiple ErrorIsolator instances
   * will share the same global listeners. Only the first instance
   * will actually register the listeners.
   */
  constructor() {
    // Register global listeners only once
    if (!globalErrorHandler) {
      globalErrorHandler = (event: ErrorEvent) => {
        isolatorInstance?.routeError(event);
      };

      globalRejectionHandler = (event: PromiseRejectionEvent) => {
        isolatorInstance?.routeRejection(event);
      };

      window.addEventListener('error', globalErrorHandler);
      window.addEventListener('unhandledrejection', globalRejectionHandler);

      // Set the first instance as the routing target
      isolatorInstance = this;
    } else {
      // Subsequent instances use the same global handlers
      // but have their own errorBoundaries map
    }
  }

  /**
   * Set up error boundary for a sub-app
   *
   * @param key - Unique identifier for the sub-app
   * @param onError - Callback when error occurs in this sub-app
   * @returns ErrorBoundary instance
   */
  setup(key: string, onError: ErrorCallback): ErrorBoundary {
    const boundary = new ErrorBoundaryImpl(key, onError);
    this.errorBoundaries.set(key, boundary);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[orion-mf:error-isolator] Setup error boundary for "${key}"`);
    }

    return boundary;
  }

  /**
   * Route error to appropriate sub-app's error boundary
   *
   * @param event - Error event
   */
  private routeError(event: ErrorEvent): void {
    // Iterate through all registered sub-apps to find matching error source
    for (const [key, boundary] of this.errorBoundaries) {
      if (this.isFromSubApp(event, key)) {
        // Stop propagation to prevent error from bubbling to global handler
        event.stopImmediatePropagation();

        if (event.error) {
          boundary.capture(event.error);
        } else {
          // Handle cases where error object is not provided
          boundary.capture(
            new Error(event.message || 'Unknown error')
          );
        }
        return;
      }
    }
  }

  /**
   * Route unhandled promise rejection to appropriate sub-app
   *
   * @param event - Promise rejection event
   */
  private routeRejection(event: PromiseRejectionEvent): void {
    const reason = event.reason;

    for (const [key, boundary] of this.errorBoundaries) {
      // Determine if rejection originated from this sub-app
      if (this.isRejectionFromSubApp(reason, key)) {
        // Prevent default handling (which would log to console)
        event.preventDefault();

        const error = reason instanceof Error
          ? reason
          : new Error(String(reason));

        boundary.capture(error);
        return;
      }
    }
  }

  /**
   * Check if error originated from a specific sub-app
   *
   * @param event - Error event
   * @param key - Sub-app key to check against
   * @returns true if error is from the specified sub-app
   */
  private isFromSubApp(event: ErrorEvent, key: string): boolean {
    // Check filename from error event
    if (event.filename?.includes(key)) {
      return true;
    }

    // Check error stack trace
    if (event.error?.stack?.includes(key)) {
      return true;
    }

    // Check error message as fallback
    if (event.error?.message?.includes(key)) {
      return true;
    }

    return false;
  }

  /**
   * Check if promise rejection originated from a specific sub-app
   *
   * @param reason - Rejection reason
   * @param key - Sub-app key to check against
   * @returns true if rejection is from the specified sub-app
   */
  private isRejectionFromSubApp(reason: unknown, key: string): boolean {
    if (!reason) return false;

    // Check string representation of reason
    const reasonString = reason.toString();
    if (reasonString.includes(key)) {
      return true;
    }

    // Check if reason is an Error with stack/message containing key
    if (reason instanceof Error) {
      if (reason.stack?.includes(key) || reason.message?.includes(key)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Remove error boundary for a sub-app
   *
   * Note: Global listeners remain active to serve other sub-apps
   *
   * @param key - Sub-app key to remove
   */
  remove(key: string): void {
    const removed = this.errorBoundaries.delete(key);

    if (process.env.NODE_ENV === 'development' && removed) {
      console.log(`[orion-mf:error-isolator] Removed error boundary for "${key}"`);
    }
  }

  /**
   * Get error boundary for a specific sub-app
   *
   * @param key - Sub-app key
   * @returns ErrorBoundary if found, undefined otherwise
   */
  getBoundary(key: string): ErrorBoundary | undefined {
    return this.errorBoundaries.get(key);
  }

  /**
   * Check if a sub-app has an active error boundary
   *
   * @param key - Sub-app key
   * @returns true if error boundary exists
   */
  hasBoundary(key: string): boolean {
    return this.errorBoundaries.has(key);
  }

  /**
   * Get all registered sub-app keys
   *
   * @returns Array of sub-app keys
   */
  getRegisteredKeys(): string[] {
    return Array.from(this.errorBoundaries.keys());
  }

  /**
   * Destroy the ErrorIsolator
   *
   * Called when the framework is unmounted.
   * Removes all error boundaries and cleans up global listeners.
   */
  destroy(): void {
    // Clear all boundaries
    this.errorBoundaries.clear();

    // Clean up global listeners (only if this is the last instance)
    if (globalErrorHandler) {
      window.removeEventListener('error', globalErrorHandler);
      window.removeEventListener('unhandledrejection', globalRejectionHandler!);
      globalErrorHandler = null;
      globalRejectionHandler = null;
      isolatorInstance = null;

      if (process.env.NODE_ENV === 'development') {
        console.log('[orion-mf:error-isolator] Global listeners removed');
      }
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export type { ErrorBoundary as ErrorBoundaryType };