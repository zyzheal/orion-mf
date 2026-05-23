/**
 * OrionMF A11ySupport Module - Accessibility Support
 *
 * Provides accessibility features for micro-frontend containers:
 * - ARIA attributes (role, aria-label)
 * - Focus trap (Tab cycle within container)
 * - Screen reader support (aria-live region)
 *
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §4.4
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** A11ySupport configuration */
export interface A11yConfig {
  /** Enable/disable focus trap */
  focusTrap?: boolean;
  /** Enable/disable screen reader support */
  screenReader?: boolean;
  /** Custom ARIA label suffix */
  labelSuffix?: string;
}

/** Focus trap state */
interface FocusTrapState {
  container: HTMLElement;
  firstFocusable: HTMLElement | null;
  lastFocusable: HTMLElement | null;
  keydownHandler: (e: KeyboardEvent) => void;
}

// ============================================================================
// A11ySupport Class
// ============================================================================

/**
 * A11ySupport - Accessibility Support for Micro-Frontends
 *
 * Provides accessibility features to ensure micro-frontend containers
 * are accessible to users with disabilities.
 */
export class A11ySupport {
  /** Default configuration */
  private defaultConfig: Required<A11yConfig> = {
    focusTrap: true,
    screenReader: true,
    labelSuffix: 'SubApp',
  };

  /** Track focus trap handlers for cleanup */
  private focusTrapMap = new Map<string, FocusTrapState>();

  /** Track screen reader elements for cleanup */
  private srElementMap = new Map<string, HTMLElement>();

  /**
   * Set up accessibility features for a container
   *
   * @param key - Sub-app key/identifier
   * @param container - Container element to set up
   * @param config - Configuration options
   */
  setup(key: string, container: HTMLElement, config?: A11yConfig): void {
    const cfg = { ...this.defaultConfig, ...config };

    // Set ARIA attributes
    container.setAttribute('role', 'application');
    container.setAttribute('aria-label', `${cfg.labelSuffix}: ${key}`);

    // Focus management
    if (cfg.focusTrap) {
      this.setupFocusTrap(key, container);
    }

    // Screen reader support
    if (cfg.screenReader) {
      this.setupScreenReader(key, container);
    }

    console.info(`[A11y] Setup complete for "${key}"`);
  }

  /**
   * Set up focus trap within a container
   *
   * Traps Tab key focus within the container, cycling from last to first
   * and vice versa with Shift+Tab.
   *
   * @param key - Sub-app key for tracking
   * @param container - Container element
   */
  setupFocusTrap(key: string, container: HTMLElement): void {
    // Clean up existing trap if any
    this.removeFocusTrap(key);

    // Find focusable elements
    const focusable = this.getFocusableElements(container);
    const firstFocusable = focusable[0] ?? null;
    const lastFocusable = focusable[focusable.length - 1] ?? null;

    if (!firstFocusable || !lastFocusable) {
      console.warn(`[A11y] No focusable elements found in container "${key}"`);
      return;
    }

    // Create keydown handler
    const keydownHandler = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;

      // Handle Tab from first element (shift to last)
      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
      // Handle Tab from last element (cycle to first)
      else if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    };

    // Add event listener
    container.addEventListener('keydown', keydownHandler);

    // Store for cleanup
    this.focusTrapMap.set(key, {
      container,
      firstFocusable,
      lastFocusable,
      keydownHandler,
    });

    console.info(`[A11y] Focus trap enabled for "${key}"`);
  }

  /**
   * Set up screen reader support
   *
   * Creates an aria-live region for announcing dynamic content changes.
   *
   * @param key - Sub-app key for tracking
   * @param container - Container element
   */
  setupScreenReader(key: string, container: HTMLElement): void {
    // Clean up existing element if any
    this.removeScreenReader(key);

    // Create screen reader element
    const sr = document.createElement('div');
    sr.setAttribute('aria-live', 'polite');
    sr.setAttribute('aria-atomic', 'true');
    sr.className = 'orion-mf-sr-only';
    sr.style.cssText = `
      position: absolute;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;

    container.appendChild(sr);
    this.srElementMap.set(key, sr);

    console.info(`[A11y] Screen reader region enabled for "${key}"`);
  }

  /**
   * Get all focusable elements within a container
   *
   * @param container - Container element
   * @returns Array of focusable elements
   */
  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(', ');

    const elements = container.querySelectorAll<HTMLElement>(selector);
    return Array.from(elements).filter((el) => {
      // Filter out hidden elements
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  /**
   * Remove focus trap for a sub-app
   *
   * @param key - Sub-app key
   */
  removeFocusTrap(key: string): void {
    const state = this.focusTrapMap.get(key);
    if (state) {
      state.container.removeEventListener('keydown', state.keydownHandler);
      this.focusTrapMap.delete(key);
      console.info(`[A11y] Focus trap removed for "${key}"`);
    }
  }

  /**
   * Remove screen reader element for a sub-app
   *
   * @param key - Sub-app key
   */
  removeScreenReader(key: string): void {
    const sr = this.srElementMap.get(key);
    if (sr) {
      sr.remove();
      this.srElementMap.delete(key);
      console.info(`[A11y] Screen reader region removed for "${key}"`);
    }
  }

  /**
   * Remove all accessibility features for a sub-app
   *
   * @param key - Sub-app key
   */
  remove(key: string): void {
    this.removeFocusTrap(key);
    this.removeScreenReader(key);
    console.info(`[A11y] All features removed for "${key}"`);
  }

  /**
   * Announce message to screen readers
   *
   * @param key - Sub-app key
   * @param message - Message to announce
   */
  announce(key: string, message: string): void {
    const sr = this.srElementMap.get(key);
    if (sr) {
      // Clear and re-set to trigger aria-live announcement
      sr.textContent = '';
      setTimeout(() => {
        sr.textContent = message;
      }, 50);
    }
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    // Remove all focus traps
    this.focusTrapMap.forEach((_state, key) => {
      this.removeFocusTrap(key);
    });

    // Remove all screen reader elements
    this.srElementMap.forEach((_sr, key) => {
      this.removeScreenReader(key);
    });

    console.info('[A11y] Destroyed');
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/** Default A11ySupport instance */
let defaultInstance: A11ySupport | null = null;

/**
 * Get the default A11ySupport instance
 */
export function getA11ySupport(): A11ySupport {
  if (!defaultInstance) {
    defaultInstance = new A11ySupport();
  }
  return defaultInstance;
}

/**
 * Create a new A11ySupport instance
 */
export function createA11ySupport(_config?: A11yConfig): A11ySupport {
  return new A11ySupport();
}

// ============================================================================
// Export
// ============================================================================

export default A11ySupport;