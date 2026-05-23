/**
 * ReactShadowCompat Module Tests
 * Using Vitest with jsdom environment
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReactShadowCompat } from '../src/core/ReactShadowCompat';

// Mock React and ReactDOM
const mockRender = vi.fn();
const mockUnmount = vi.fn();

const mockReactRoot = {
  render: mockRender,
  unmount: mockUnmount,
};

const mockCreateRoot = vi.fn(() => mockReactRoot);

const mockReactDOM = {
  createRoot: mockCreateRoot,
};

// Create a test subclass that uses injected ReactDOM
class TestableReactShadowCompat extends ReactShadowCompat {
  protected getReactDOM() {
    return mockReactDOM;
  }
}

// ============================================================================
// Test Setup
// ============================================================================

describe('ReactShadowCompat Module', () => {
  let compat: TestableReactShadowCompat;

  beforeEach(() => {
    mockCreateRoot.mockClear();
    mockRender.mockClear();
    mockUnmount.mockClear();
    compat = new TestableReactShadowCompat();
    // Clear body
    document.body.innerHTML = '';
  });

  afterEach(() => {
    compat.destroy();
    document.body.innerHTML = '';
  });

  describe('ReactShadowCompat Class', () => {
    describe('constructor', () => {
      it('should create ReactShadowCompat instance', () => {
        expect(compat).toBeInstanceOf(ReactShadowCompat);
      });

      it('should initialize with empty roots', () => {
        expect(compat.getMountedKeys()).toEqual([]);
        expect(compat.isMounted('any')).toBe(false);
      });
    });

    describe('mount', () => {
      it('should create container element', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);

        const container = document.getElementById('orion-mf-test-app');
        expect(container).not.toBeNull();
      });

      it('should attach Shadow DOM to container', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);

        const container = document.getElementById('orion-mf-test-app');
        expect(container?.shadowRoot).not.toBeNull();
        expect(container?.shadowRoot?.mode).toBe('open');
      });

      it('should create portal container inside Shadow DOM', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);

        const container = document.getElementById('orion-mf-test-app');
        const portalContainer = container?.shadowRoot?.querySelector(
          '[data-orion-scope="test-app"]'
        );
        expect(portalContainer).not.toBeNull();
      });

      it('should render React component using createRoot', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);

        expect(mockCreateRoot).toHaveBeenCalledTimes(1);
        expect(mockRender).toHaveBeenCalledWith(mockComponent);
      });

      it('should return container element', () => {
        const mockComponent = () => null;
        const container = compat.mount('test-app', mockComponent);

        expect(container).toBeInstanceOf(HTMLElement);
        expect(container.id).toBe('orion-mf-test-app');
      });

      it('should track mounted key', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);

        expect(compat.isMounted('test-app')).toBe(true);
        expect(compat.getMountedKeys()).toContain('test-app');
      });

      it('should throw if ReactDOM.createRoot is not available', () => {
        const compat2 = new ReactShadowCompat();

        expect(() => {
          (compat2 as any).mount('test', () => null);
        }).toThrow('ReactDOM.createRoot not found');
      });

      it('should support multiple mounts with different keys', () => {
        const mockComponent = () => null;
        compat.mount('app1', mockComponent);
        compat.mount('app2', mockComponent);

        expect(compat.getMountedKeys()).toHaveLength(2);
        expect(compat.isMounted('app1')).toBe(true);
        expect(compat.isMounted('app2')).toBe(true);
      });
    });

    describe('getShadowRoot', () => {
      it('should return Shadow Root for mounted key', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);

        const shadowRoot = compat.getShadowRoot('test-app');
        expect(shadowRoot).toBeInstanceOf(ShadowRoot);
      });

      it('should return undefined for non-mounted key', () => {
        const shadowRoot = compat.getShadowRoot('non-existent');
        expect(shadowRoot).toBeUndefined();
      });
    });

    describe('unmount', () => {
      it('should unmount React component', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);
        compat.unmount('test-app');

        expect(mockUnmount).toHaveBeenCalled();
      });

      it('should remove container from DOM', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);
        const container = document.getElementById('orion-mf-test-app');

        compat.unmount('test-app');

        expect(container?.isConnected).toBe(false);
      });

      it('should clear mounted key', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);
        compat.unmount('test-app');

        expect(compat.isMounted('test-app')).toBe(false);
        expect(compat.getMountedKeys()).not.toContain('test-app');
      });

      it('should handle unmount non-existent key gracefully', () => {
        expect(() => {
          compat.unmount('non-existent');
        }).not.toThrow();
      });
    });

    describe('destroy', () => {
      it('should cleanup all mounted components', () => {
        const mockComponent = () => null;
        compat.mount('app1', mockComponent);
        compat.mount('app2', mockComponent);
        compat.mount('app3', mockComponent);

        compat.destroy();

        expect(mockUnmount).toHaveBeenCalledTimes(3);
        expect(compat.getMountedKeys()).toEqual([]);
      });

      it('should be safe to call destroy multiple times', () => {
        const mockComponent = () => null;
        compat.mount('test-app', mockComponent);

        compat.destroy();
        expect(() => {
          compat.destroy();
        }).not.toThrow();
      });
    });
  });

  describe('EventForwarder Integration', () => {
    it('should setup event forwarding on mount', () => {
      const mockComponent = () => null;
      const addEventListenerSpy = vi.spyOn(
        ShadowRoot.prototype,
        'addEventListener'
      );

      compat.mount('test-app', mockComponent);

      // Should add listeners for mouse, keyboard, and focus events
      // In capture phase (third argument = true)
      const captureCalls = addEventListenerSpy.mock.calls.filter(
        (call) => call[2] === true
      );

      expect(captureCalls.length).toBeGreaterThan(0);

      addEventListenerSpy.mockRestore();
    });

    it('should cleanup event forwarding on unmount', () => {
      const mockComponent = () => null;
      const removeEventListenerSpy = vi.spyOn(
        ShadowRoot.prototype,
        'removeEventListener'
      );

      compat.mount('test-app', mockComponent);
      compat.unmount('test-app');

      // Should remove event listeners
      expect(removeEventListenerSpy).toHaveBeenCalled();

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Event Forwarding', () => {
    it('should forward click events with composed: true', () => {
      const mockComponent = () => null;
      compat.mount('test-app', mockComponent);

      const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');

      // Create a click event inside shadow root
      const container = document.getElementById('orion-mf-test-app');
      const shadowRoot = container?.shadowRoot;

      if (shadowRoot) {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 200,
        });

        shadowRoot.dispatchEvent(clickEvent);

        // Check if event was dispatched to document with composed: true
        const forwardedEvent = dispatchEventSpy.mock.calls[0][0] as Event;
        expect(forwardedEvent).toBeInstanceOf(MouseEvent);
        expect(forwardedEvent.composed).toBe(true);

        // Check _originalTarget is attached
        expect((forwardedEvent as any)._originalTarget).toBeDefined();
      }

      dispatchEventSpy.mockRestore();
    });

    it('should forward keyboard events with full properties', () => {
      const mockComponent = () => null;
      compat.mount('test-app', mockComponent);

      const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');

      const container = document.getElementById('orion-mf-test-app');
      const shadowRoot = container?.shadowRoot;

      if (shadowRoot) {
        const keyEvent = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
        });

        shadowRoot.dispatchEvent(keyEvent);

        const forwardedEvent = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
        expect(forwardedEvent).toBeInstanceOf(KeyboardEvent);
        expect(forwardedEvent.key).toBe('Enter');
        expect(forwardedEvent.code).toBe('Enter');
      }

      dispatchEventSpy.mockRestore();
    });

    it('should preserve relatedTarget on focus events', () => {
      const mockComponent = () => null;
      compat.mount('test-app', mockComponent);

      const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');

      const container = document.getElementById('orion-mf-test-app');
      const shadowRoot = container?.shadowRoot;

      if (shadowRoot) {
        const focusEvent = new FocusEvent('focus', {
          bubbles: false,
          cancelable: false,
        });

        shadowRoot.dispatchEvent(focusEvent);

        const forwardedEvent = dispatchEventSpy.mock.calls[0][0] as FocusEvent;
        expect(forwardedEvent).toBeInstanceOf(FocusEvent);
        expect(forwardedEvent.composed).toBe(true);
      }

      dispatchEventSpy.mockRestore();
    });
  });
});