/**
 * Vue2ShadowCompat Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Vue2ShadowCompat,
} from '../src/core/Vue2ShadowCompat';

describe('Vue2ShadowCompat Module', () => {
  let vue2Compat: Vue2ShadowCompat;

  beforeEach(() => {
    vue2Compat = new Vue2ShadowCompat();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when no options provided', () => {
      expect(vue2Compat).toBeDefined();
    });

    it('should respect version option', () => {
      const compat = new Vue2ShadowCompat({ version: '2.6' });
      expect(compat).toBeDefined();
    });
  });

  describe('mount', () => {
    it('should throw when Vue 2 is not available', async () => {
      delete (globalThis as any).Vue;
      await expect(
        vue2Compat.mount({
          key: 'test-vue2',
          container: document.createElement('div'),
          rootComponent: { template: '<div>Test</div>' },
        })
      ).rejects.toThrow('[Vue2ShadowCompat] Vue 2 not found');
    });
  });

  describe('unmount', () => {
    it('should warn when app not found', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vue2Compat.unmount('nonexistent');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('App nonexistent not found')
      );
      warnSpy.mockRestore();
    });
  });

  describe('getApp / isMounted', () => {
    it('should return undefined for unloaded app', () => {
      expect(vue2Compat.getApp('test')).toBeUndefined();
    });

    it('should return false for unmounted app', () => {
      expect(vue2Compat.isMounted('test')).toBe(false);
    });
  });

  describe('getAllApps', () => {
    it('should return empty array when no apps mounted', () => {
      expect(vue2Compat.getAllApps()).toEqual([]);
    });
  });

  describe('dispose', () => {
    it('should not throw when no apps loaded', () => {
      expect(() => vue2Compat.dispose()).not.toThrow();
    });
  });
});
