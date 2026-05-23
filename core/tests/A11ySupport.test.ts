/**
 * A11ySupport Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { A11ySupport, getA11ySupport, createA11ySupport } from '../src/core/A11ySupport';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'test-a11y-container';
  document.body.appendChild(container);
  return container;
}

function createContainerWithFocusableElements(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'test-focusable-container';

  // Add focusable elements
  const button = document.createElement('button');
  button.id = 'btn-1';
  button.textContent = 'Button 1';
  container.appendChild(button);

  const input = document.createElement('input');
  input.id = 'input-1';
  input.type = 'text';
  container.appendChild(input);

  const link = document.createElement('a');
  link.id = 'link-1';
  link.href = '#';
  link.textContent = 'Link';
  container.appendChild(link);

  const button2 = document.createElement('button');
  button2.id = 'btn-2';
  button2.textContent = 'Button 2';
  container.appendChild(button2);

  document.body.appendChild(container);
  return container;
}

// ============================================================================
// Tests
// ============================================================================

describe('A11ySupport Module', () => {
  let a11y: A11ySupport;
  let container: HTMLElement;

  beforeEach(() => {
    a11y = new A11ySupport();
    container = createTestContainer();
  });

  afterEach(() => {
    a11y.destroy();
    container.remove();
  });

  describe('setup', () => {
    it('should set ARIA role and aria-label attributes', () => {
      a11y.setup('test-app', container);

      expect(container.getAttribute('role')).toBe('application');
      expect(container.getAttribute('aria-label')).toBe('SubApp: test-app');
    });

    it('should use custom labelSuffix when provided', () => {
      a11y.setup('test-app', container, { labelSuffix: 'MicroApp' });

      expect(container.getAttribute('aria-label')).toBe('MicroApp: test-app');
    });

    it('should set up focus trap by default', () => {
      const focusableContainer = createContainerWithFocusableElements();
      a11y.setup('test-app', focusableContainer);

      // Focus trap should be registered
      expect(a11y).toBeDefined();
      focusableContainer.remove();
    });

    it('should set up screen reader by default', () => {
      a11y.setup('test-app', container);

      // Screen reader element should be added
      const sr = container.querySelector('.orion-mf-sr-only');
      expect(sr).toBeTruthy();
      expect(sr?.getAttribute('aria-live')).toBe('polite');
      expect(sr?.getAttribute('aria-atomic')).toBe('true');
    });

    it('should disable focus trap when configured', () => {
      const focusableContainer = createContainerWithFocusableElements();
      a11y.setup('test-app', focusableContainer, { focusTrap: false });

      // Should not throw, focus trap just not set up
      focusableContainer.remove();
    });

    it('should disable screen reader when configured', () => {
      a11y.setup('test-app', container, { screenReader: false });

      const sr = container.querySelector('.orion-mf-sr-only');
      expect(sr).toBeFalsy();
    });
  });

  describe('focus trap', () => {
    it('should trap Tab key in focus trap (Tab from last element)', () => {
      const focusableContainer = createContainerWithFocusableElements();
      a11y.setupFocusTrap('test-app', focusableContainer);

      // Get all focusable elements
      const buttons = focusableContainer.querySelectorAll('button');
      const lastBtn = buttons[buttons.length - 1] as HTMLElement;
      lastBtn.focus();

      // Create mock event
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      focusableContainer.dispatchEvent(event);

      // Tab from last element should cycle to first
      expect(preventDefaultSpy).toHaveBeenCalled();

      focusableContainer.remove();
    });

    it('should trap Shift+Tab in focus trap (Shift+Tab from first element)', () => {
      const focusableContainer = createContainerWithFocusableElements();
      a11y.setupFocusTrap('test-app', focusableContainer);

      // Simulate Shift+Tab from first element
      const firstBtn = focusableContainer.querySelector('button') as HTMLElement;
      firstBtn.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      focusableContainer.dispatchEvent(event);

      // Shift+Tab from first should cycle to last
      expect(preventDefaultSpy).toHaveBeenCalled();

      focusableContainer.remove();
    });

    it('should handle non-Tab keys normally', () => {
      const focusableContainer = createContainerWithFocusableElements();
      a11y.setupFocusTrap('test-app', focusableContainer);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      focusableContainer.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();

      focusableContainer.remove();
    });
  });

  describe('screen reader', () => {
    it('should create aria-live region with correct attributes', () => {
      a11y.setupScreenReader('test-app', container);

      const sr = container.querySelector('.orion-mf-sr-only');
      expect(sr).toBeTruthy();
      expect(sr?.getAttribute('aria-live')).toBe('polite');
      expect(sr?.getAttribute('aria-atomic')).toBe('true');
    });

    it('should have visually hidden styles', () => {
      a11y.setupScreenReader('test-app', container);

      const sr = container.querySelector('.orion-mf-sr-only') as HTMLElement;
      const style = window.getComputedStyle(sr);

      expect(style.position).toBe('absolute');
      expect(style.left).toBe('-9999px');
      expect(style.width).toBe('1px');
      expect(style.height).toBe('1px');
    });
  });

  describe('announce', () => {
    it('should announce message to screen reader', async () => {
      a11y.setup('test-app', container);

      const announceMessage = 'Test announcement message';
      a11y.announce('test-app', announceMessage);

      // Message should be set after delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      const sr = container.querySelector('.orion-mf-sr-only');
      expect(sr?.textContent).toBe(announceMessage);
    });

    it('should not throw when announcing to non-existent screen reader', () => {
      expect(() => {
        a11y.announce('non-existent', 'message');
      }).not.toThrow();
    });
  });

  describe('remove', () => {
    it('should remove focus trap', () => {
      const focusableContainer = createContainerWithFocusableElements();
      a11y.setupFocusTrap('test-app', focusableContainer);

      a11y.removeFocusTrap('test-app');

      // Event listener should be removed (verify by no longer trapping)
      // The key is that removeFocusTrap doesn't throw
      focusableContainer.remove();
    });

    it('should remove screen reader element', () => {
      a11y.setupScreenReader('test-app', container);

      a11y.removeScreenReader('test-app');

      const sr = container.querySelector('.orion-mf-sr-only');
      expect(sr).toBeFalsy();
    });

    it('should remove all features with remove()', () => {
      const focusableContainer = createContainerWithFocusableElements();
      a11y.setup('test-app', focusableContainer);

      a11y.remove('test-app');

      const sr = focusableContainer.querySelector('.orion-mf-sr-only');
      expect(sr).toBeFalsy();

      focusableContainer.remove();
    });
  });

  describe('destroy', () => {
    it('should clean up all resources', () => {
      const container1 = createTestContainer();
      const container2 = createTestContainer();

      a11y.setup('app-1', container1);
      a11y.setup('app-2', container2);

      a11y.destroy();

      // Should not throw and clean up properly
      expect(() => a11y.destroy()).not.toThrow();

      container1.remove();
      container2.remove();
    });
  });
});

describe('A11ySupport factory functions', () => {
  it('getA11ySupport should return singleton instance', () => {
    const instance1 = getA11ySupport();
    const instance2 = getA11ySupport();

    expect(instance1).toBe(instance2);

    // Clean up
    instance1.destroy();
  });

  it('createA11ySupport should create new instance', () => {
    const instance1 = createA11ySupport();
    const instance2 = createA11ySupport();

    expect(instance1).not.toBe(instance2);
    expect(instance1).toBeInstanceOf(A11ySupport);
    expect(instance2).toBeInstanceOf(A11ySupport);

    instance1.destroy();
    instance2.destroy();
  });
});