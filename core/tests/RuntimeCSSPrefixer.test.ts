/**
 * RuntimeCSSPrefixer Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RuntimeCSSPrefixer,
  getRuntimeCSSPrefixer,
  createRuntimeCSSPrefixer,
  cleanupRuntimeCSSPrefixer,
} from '../src/core/RuntimeCSSPrefixer';

describe('RuntimeCSSPrefixer', () => {
  let prefixer: RuntimeCSSPrefixer;

  beforeEach(() => {
    prefixer = new RuntimeCSSPrefixer();
  });

  afterEach(() => {
    prefixer.cleanupAll();
    cleanupRuntimeCSSPrefixer();
  });

  describe('setup', () => {
    it('should setup prefix for an app', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      expect(prefixer.getPrefix('app1')).toBe('app1');
    });

    it('should allow multiple app prefixes', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });
      prefixer.setup({ appKey: 'app2', prefix: 'app2' });

      expect(prefixer.getPrefix('app1')).toBe('app1');
      expect(prefixer.getPrefix('app2')).toBe('app2');
    });

    it('should update prefix if already exists', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });
      prefixer.setup({ appKey: 'app1', prefix: 'app1-new' });

      expect(prefixer.getPrefix('app1')).toBe('app1-new');
    });
  });

  describe('applyPrefix', () => {
    beforeEach(() => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });
    });

    it('should apply prefix to className', () => {
      const result = prefixer.applyPrefix('button', 'app1');
      expect(result).toBe('app1-button');
    });

    it('should not double-prefix if already has prefix', () => {
      const result = prefixer.applyPrefix('app1-button', 'app1');
      expect(result).toBe('app1-button');
    });

    it('should handle multiple classes', () => {
      const result = prefixer.applyPrefix('button primary active', 'app1');
      expect(result).toBe('app1-button app1-primary app1-active');
    });

    it('should handle empty className', () => {
      expect(prefixer.applyPrefix('', 'app1')).toBe('');
      expect(prefixer.applyPrefix(null as any, 'app1')).toBe(null);
      expect(prefixer.applyPrefix(undefined as any, 'app1')).toBe(undefined);
    });

    it('should skip CSS variables', () => {
      const result = prefixer.applyPrefix('--primary-color', 'app1');
      expect(result).toBe('--primary-color');
    });

    it('should skip class selectors', () => {
      const result = prefixer.applyPrefix('.my-class', 'app1');
      expect(result).toBe('.my-class');
    });

    it('should handle classes with existing prefix', () => {
      // When both app1 and app2 prefixes are registered, classes should not be double-prefixed
      prefixer.setup({ appKey: 'app2', prefix: 'app2' });
      const result = prefixer.applyPrefix('app1-button app2-button', 'app1');
      expect(result).toBe('app1-button app2-button');
    });
  });

  describe('patchReactCreateElement', () => {
    it('should return original function if already patched', () => {
      const original = vi.fn((type: any, props: any) => ({ type, props }));

      const patched1 = prefixer.patchReactCreateElement(original);
      const patched2 = prefixer.patchReactCreateElement(original);

      expect(patched1).toBe(patched2);
    });

    it('should add prefix to className in props', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const original = vi.fn((type: any, props: any, ...args: any[]) => ({ type, props, args }));
      const patched = prefixer.patchReactCreateElement(original);

      patched('div', { className: 'button' });

      expect(original).toHaveBeenCalledWith(
        'div',
        { className: 'app1-button' }
      );
    });

    it('should handle array className', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const original = vi.fn((type: any, props: any, ...args: any[]) => ({ type, props, args }));
      const patched = prefixer.patchReactCreateElement(original);

      patched('div', { className: ['button', 'primary'] });

      expect(original).toHaveBeenCalledWith(
        'div',
        { className: 'app1-button app1-primary' }
      );
    });

    it('should not modify if no className', () => {
      const original = vi.fn((type: any, props: any, ...args: any[]) => ({ type, props, args }));
      const patched = prefixer.patchReactCreateElement(original);

      patched('div', { id: 'test' });

      expect(original).toHaveBeenCalledWith('div', { id: 'test' });
    });

    it('should handle multiple prefixes', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });
      prefixer.setup({ appKey: 'app2', prefix: 'app2' });

      const original = vi.fn((type: any, props: any, ...args: any[]) => ({ type, props, args }));
      const patched = prefixer.patchReactCreateElement(original);

      patched('div', { className: 'button' });

      // Last prefix wins for single className
      expect(original).toHaveBeenCalledWith(
        'div',
        { className: 'app2-button' }
      );
    });
  });

  describe('patchVueCreateElement', () => {
    it('should add prefix to class in props', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const original = vi.fn((...args: any[]) => ({ args }));
      const patched = prefixer.patchVueCreateElement(original);

      patched('div', { class: 'button' });

      expect(original).toHaveBeenCalledWith(
        'div',
        { class: 'app1-button' }
      );
    });

    it('should return original function if already patched', () => {
      const original = vi.fn((...args: any[]) => ({ args }));

      const patched1 = prefixer.patchVueCreateElement(original);
      const patched2 = prefixer.patchVueCreateElement(original);

      expect(patched1).toBe(patched2);
    });

    it('should handle multiple classes', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const original = vi.fn((...args: any[]) => ({ args }));
      const patched = prefixer.patchVueCreateElement(original);

      patched('div', { class: 'button primary active' });

      expect(original).toHaveBeenCalledWith(
        'div',
        { class: 'app1-button app1-primary app1-active' }
      );
    });
  });

  describe('getPrefixes', () => {
    it('should return all registered prefixes', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });
      prefixer.setup({ appKey: 'app2', prefix: 'app2' });

      const prefixes = prefixer.getPrefixes();

      expect(prefixes.size).toBe(2);
      expect(prefixes.get('app1')).toBe('app1');
      expect(prefixes.get('app2')).toBe('app2');
    });

    it('should return a copy, not the original map', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const prefixes = prefixer.getPrefixes();
      prefixes.set('app3', 'app3');

      // Original should not be modified
      expect(prefixer.getPrefixes().size).toBe(1);
    });
  });

  describe('hasPrefix', () => {
    it('should return true for registered app', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      expect(prefixer.hasPrefix('app1')).toBe(true);
    });

    it('should return false for non-registered app', () => {
      expect(prefixer.hasPrefix('app1')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove prefix for specific app', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });
      prefixer.setup({ appKey: 'app2', prefix: 'app2' });

      prefixer.cleanup('app1');

      expect(prefixer.getPrefix('app1')).toBeUndefined();
      expect(prefixer.getPrefix('app2')).toBe('app2');
    });

    it('should cleanup all prefixes', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });
      prefixer.setup({ appKey: 'app2', prefix: 'app2' });

      prefixer.cleanupAll();

      expect(prefixer.getPrefixes().size).toBe(0);
    });
  });

  describe('getRuntimeCSSPrefixer', () => {
    it('should return singleton instance', () => {
      const instance1 = getRuntimeCSSPrefixer();
      const instance2 = getRuntimeCSSPrefixer();

      expect(instance1).toBe(instance2);
    });
  });

  describe('createRuntimeCSSPrefixer', () => {
    it('should create new instance', () => {
      const instance1 = createRuntimeCSSPrefixer();
      const instance2 = createRuntimeCSSPrefixer();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('patchReactJsx and patchReactJsxs', () => {
    it('should work similarly to patchReactCreateElement', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const original = vi.fn((type: any, props: any, ...args: any[]) => ({ type, props, args }));

      const jsxPatched = prefixer.patchReactJsx(original);
      jsxPatched('div', { className: 'button' });

      expect(original).toHaveBeenCalledWith(
        'div',
        { className: 'app1-button' }
      );
    });
  });

  describe('patchVueCreateElementBlock', () => {
    it('should work similarly to patchVueCreateElement', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const original = vi.fn((...args: any[]) => ({ args }));
      const patched = prefixer.patchVueCreateElementBlock(original);

      patched('div', { class: 'button' });

      expect(original).toHaveBeenCalledWith(
        'div',
        { class: 'app1-button' }
      );
    });
  });

  describe('patchReactCloneElement', () => {
    it('should add prefix to className', () => {
      prefixer.setup({ appKey: 'app1', prefix: 'app1' });

      const original = vi.fn((type: any, props: any) => ({ type, props }));
      const patched = prefixer.patchReactCloneElement(original);

      // Simulate cloneElement signature
      const element = { type: 'div', props: { className: 'button' } };
      patched(element, { className: 'primary' });

      // Original should be called with merged props
      expect(original).toHaveBeenCalled();
    });
  });
});