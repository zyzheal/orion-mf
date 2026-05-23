/**
 * OrionMF ReactShadowCompat Module - React + Shadow DOM Compatibility
 *
 * Enables React components to be mounted inside Shadow DOM with proper event forwarding
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §3.9
 */

import type React from 'react';
import type { Root as ReactDOMRoot } from 'react-dom/client';

// ============================================================================
// Type Definitions
// ============================================================================

/** Extended event with original target reference */
interface EventWithOriginalTarget extends Event {
  _originalTarget?: EventTarget;
}

/** Event forwarder function signature */
type EventForwarderFn = (e: Event) => void;

/** Event listener cleanup function */
type EventCleanupFn = () => void;

/** ReactDOM createRoot function type */
type CreateRootFn = (container: Element) => ReactDOMRoot;

/** ReactDOM static interface */
interface ReactDOMStatic {
  createRoot: CreateRootFn;
}

// ============================================================================
// EventForwarder Class
// ============================================================================

/**
 * Handles event forwarding from Shadow DOM to document
 *
 * Uses capture phase to intercept events before they bubble,
 * then re-dispatches with composed: true to cross Shadow DOM boundaries
 */
class EventForwarder {
  private handlers: EventCleanupFn[] = [];

  constructor(
    private source: ShadowRoot,
    private target: Document
  ) {}

  /**
   * Start listening to events in the Shadow DOM
   */
  start(): void {
    // Use composed: true CustomEvent to cross Shadow DOM boundary
    const events: Array<{
      type: string;
      forwarder: EventForwarderFn;
    }> = [
      { type: 'click', forwarder: (e) => this.forwardMouseEvent(e, 'click') },
      { type: 'mousedown', forwarder: (e) => this.forwardMouseEvent(e, 'mousedown') },
      { type: 'mouseup', forwarder: (e) => this.forwardMouseEvent(e, 'mouseup') },
      { type: 'keydown', forwarder: (e) => this.forwardKeyboardEvent(e) },
      { type: 'keyup', forwarder: (e) => this.forwardKeyboardEvent(e) },
      { type: 'focus', forwarder: (e) => this.forwardFocusEvent(e) },
      { type: 'blur', forwarder: (e) => this.forwardFocusEvent(e) },
    ];

    for (const event of events) {
      // Capture phase to intercept events before they bubble
      this.source.addEventListener(event.type, event.forwarder, true);
      this.handlers.push(
        () => this.source.removeEventListener(event.type, event.forwarder, true)
      );
    }
  }

  /**
   * Forward mouse events with full property preservation
   */
  private forwardMouseEvent(e: Event, type: string): void {
    const me = e as MouseEvent;
    // Use MouseEvent constructor to preserve all properties
    const forwarded = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true, // Cross Shadow DOM boundary
      clientX: me.clientX,
      clientY: me.clientY,
      screenX: me.screenX,
      screenY: me.screenY,
      button: me.button,
      buttons: me.buttons,
      ctrlKey: me.ctrlKey,
      shiftKey: me.shiftKey,
      altKey: me.altKey,
      metaKey: me.metaKey,
      relatedTarget: me.relatedTarget,
    });

    // Attach original target reference for debugging/tracking
    (forwarded as EventWithOriginalTarget)._originalTarget = e.target ?? undefined;
    this.target.dispatchEvent(forwarded);
  }

  /**
   * Forward keyboard events with full property preservation
   */
  private forwardKeyboardEvent(e: Event): void {
    const ke = e as KeyboardEvent;
    const forwarded = new KeyboardEvent(e.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: ke.key,
      code: ke.code,
      keyCode: ke.keyCode,
      charCode: ke.charCode,
      which: ke.which,
      ctrlKey: ke.ctrlKey,
      shiftKey: ke.shiftKey,
      altKey: ke.altKey,
      metaKey: ke.metaKey,
      repeat: ke.repeat,
      location: ke.location,
    });

    (forwarded as EventWithOriginalTarget)._originalTarget = e.target ?? undefined;
    this.target.dispatchEvent(forwarded);
  }

  /**
   * Forward focus events with relatedTarget preservation
   */
  private forwardFocusEvent(e: Event): void {
    const forwarded = new FocusEvent(e.type, {
      bubbles: false,
      cancelable: false,
      composed: true,
      relatedTarget: (e as FocusEvent).relatedTarget,
    });

    (forwarded as EventWithOriginalTarget)._originalTarget = e.target ?? undefined;
    this.target.dispatchEvent(forwarded);
  }

  /**
   * Stop listening and cleanup all handlers
   */
  stop(): void {
    for (const cleanup of this.handlers) {
      cleanup();
    }
    this.handlers = [];
  }
}

// ============================================================================
// ReactShadowCompat Class
// ============================================================================

/**
 * React + Shadow DOM Compatibility Layer
 *
 * Provides seamless integration between React and Shadow DOM:
 * - Mount React components inside Shadow DOM
 * - Forward mouse/keyboard/focus events across Shadow DOM boundaries
 * - Automatic cleanup on unmount
 */
export class ReactShadowCompat {
  private roots = new Map<string, ShadowRoot>();
  private reactRoots = new Map<string, ReactDOMRoot>();
  private eventForwarders = new Map<string, EventForwarder>();

  /**
   * Get ReactDOM interface - can be overridden for testing
   * Uses window.ReactDOM by default
   */
  protected getReactDOM(): ReactDOMStatic | undefined {
    return (globalThis as any).ReactDOM;
  }

  /**
   * Mount a React component into a Shadow DOM container
   *
   * @param key - Unique identifier for this mount point
   * @param component - React component to render
   * @returns The container element (host of Shadow DOM)
   */
  mount(key: string, component: React.ReactNode): HTMLElement {
    // Create container element
    const container = document.createElement('div');
    container.id = `orion-mf-${key}`;
    document.body.appendChild(container);

    // Attach Shadow DOM
    const shadowRoot = container.attachShadow({ mode: 'open' });
    this.roots.set(key, shadowRoot);

    // Create portal container for React
    const portalContainer = document.createElement('div');
    portalContainer.setAttribute('data-orion-scope', key);
    shadowRoot.appendChild(portalContainer);

    // Render React into Shadow DOM
    // Note: Requires react-dom >= 18.0.0 with createRoot
    const reactDOM = this.getReactDOM();
    const reactRoot = reactDOM?.createRoot(portalContainer);
    if (!reactRoot) {
      throw new Error(
        'ReactDOM.createRoot not found. Please ensure react-dom >= 18.0.0 is loaded.'
      );
    }
    reactRoot.render(component);
    this.reactRoots.set(key, reactRoot);

    // Setup event forwarding from Shadow DOM to document
    this.setupEventForwarding(key, shadowRoot);

    return container;
  }

  /**
   * Setup event forwarding for a Shadow Root
   */
  private setupEventForwarding(key: string, shadowRoot: ShadowRoot): void {
    const forwarder = new EventForwarder(shadowRoot, document);
    this.eventForwarders.set(key, forwarder);
    forwarder.start();
  }

  /**
   * Unmount and cleanup a mounted React component
   *
   * @param key - Unique identifier of the mount point to unmount
   */
  unmount(key: string): void {
    // Stop event forwarding
    this.eventForwarders.get(key)?.stop();
    this.eventForwarders.delete(key);

    // Unmount React root
    const reactRoot = this.reactRoots.get(key);
    if (reactRoot) {
      reactRoot.unmount();
      this.reactRoots.delete(key);
    }

    // Remove container from DOM
    const container = this.roots.get(key)?.host;
    if (container) {
      container.remove();
    }
    this.roots.delete(key);
  }

  /**
   * Get the Shadow Root for a mounted key
   */
  getShadowRoot(key: string): ShadowRoot | undefined {
    return this.roots.get(key);
  }

  /**
   * Check if a key is currently mounted
   */
  isMounted(key: string): boolean {
    return this.roots.has(key);
  }

  /**
   * Get all mounted keys
   */
  getMountedKeys(): string[] {
    return Array.from(this.roots.keys());
  }

  /**
   * Cleanup all mounted components
   */
  destroy(): void {
    for (const key of this.roots.keys()) {
      this.unmount(key);
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export default ReactShadowCompat;