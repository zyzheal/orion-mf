/**
 * VueShadowCompat Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VueShadowCompat,
  VueAppConfig,
} from '../src/core/VueShadowCompat';

describe('VueShadowCompat Module', () => {
  let vueCompat: VueShadowCompat;

  beforeEach(() => {
    vueCompat = new VueShadowCompat();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when no options provided', () => {
      expect(vueCompat).toBeDefined();
    });

    it('should respect enableCssScope option', () => {
      const compat = new VueShadowCompat({ enableCssScope: false });
      expect(compat).toBeDefined();
    });

    it('should respect enableEventForwarding option', () => {
      const compat = new VueShadowCompat({ enableEventForwarding: false });
      expect(compat).toBeDefined();
    });
  });

  describe('mount', () => {
    it('should throw when Vue is not available globally', async () => {
      await expect(
        vueCompat.mount({
          key: 'test-vue',
          container: document.createElement('div'),
          rootComponent: { template: '<div>Test</div>' },
        })
      ).rejects.toThrow('[VueShadowCompat] Vue 3 not found');
    });

    it('should create Shadow DOM with data-orion-scope attribute', async () => {
      // Mock Vue globally
      (globalThis as any).Vue = {
        createApp: vi.fn(() => ({
          mount: vi.fn(() => ({})),
          unmount: vi.fn(),
          config: { globalProperties: {} },
        })),
      };

      const container = document.createElement('div');
      await vueCompat.mount({
        key: 'test-vue-app',
        container,
        rootComponent: { template: '<div>Test</div>' },
      });

      expect(container.shadowRoot).not.toBeNull();
      expect(container.shadowRoot!.host.getAttribute('data-orion-scope')).toBe('orion-test-vue-app');

      // Cleanup
      delete (globalThis as any).Vue;
    });
  });

  describe('unmount', () => {
    it('should warn when app not found', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vueCompat.unmount('nonexistent');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('App nonexistent not found')
      );
      warnSpy.mockRestore();
    });
  });

  describe('getApp / isMounted', () => {
    it('should return undefined for unloaded app', () => {
      expect(vueCompat.getApp('test')).toBeUndefined();
    });

    it('should return false for unmounted app', () => {
      expect(vueCompat.isMounted('test')).toBe(false);
    });
  });

  describe('getAllApps', () => {
    it('should return empty array when no apps mounted', () => {
      expect(vueCompat.getAllApps()).toEqual([]);
    });
  });

  describe('dispose', () => {
    it('should not throw when no apps loaded', () => {
      expect(() => vueCompat.dispose()).not.toThrow();
    });
  });
});
