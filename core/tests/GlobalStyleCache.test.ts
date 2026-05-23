/**
 * GlobalStyleCache Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GlobalStyleCache } from '../src/core/GlobalStyleCache';

describe('GlobalStyleCache Module', () => {
  let cache: GlobalStyleCache;

  beforeEach(() => {
    cache = new GlobalStyleCache();
    // Clean up any existing test styles
    document.querySelectorAll('style[data-test-style]').forEach((el) => el.remove());
  });

  describe('recordStyles', () => {
    it('should record snapshot without error', () => {
      expect(() => cache.recordStyles('app-a')).not.toThrow();
    });

    it('should assign IDs to existing style elements', () => {
      const style = document.createElement('style');
      style.setAttribute('data-test-style', 'true');
      document.head.appendChild(style);

      cache.recordStyles('app-a');

      expect(style.getAttribute('data-orionmf-style-id')).not.toBeNull();

      style.remove();
    });
  });

  describe('trackAddedStyles', () => {
    it('should not throw for unregistered app', () => {
      expect(() => cache.trackAddedStyles('unknown')).not.toThrow();
    });

    it('should track styles added after recordStyles', () => {
      cache.recordStyles('app-a');

      // Add a new style element
      const newStyle = document.createElement('style');
      newStyle.setAttribute('data-test-style', 'true');
      document.head.appendChild(newStyle);

      cache.trackAddedStyles('app-a');

      // The record should now contain the added style ID
      const record = (cache as any).records.get('app-a');
      expect(record.addedStyleIds.size).toBeGreaterThan(0);

      newStyle.remove();
    });
  });

  describe('restoreStyles', () => {
    it('should not throw for unregistered app', () => {
      expect(() => cache.restoreStyles('unknown')).not.toThrow();
    });

    it('should remove only styles added by the specific app', () => {
      // Record initial state
      cache.recordStyles('app-a');

      // App A adds a style
      const styleA = document.createElement('style');
      styleA.setAttribute('data-test-style', 'true');
      document.head.appendChild(styleA);
      cache.trackAddedStyles('app-a');

      // Record for app B (styleA now exists)
      cache.recordStyles('app-b');

      // App B adds a style
      const styleB = document.createElement('style');
      styleB.setAttribute('data-test-style', 'true');
      document.head.appendChild(styleB);
      cache.trackAddedStyles('app-b');

      // Verify both styles exist
      expect(document.contains(styleA)).toBe(true);
      expect(document.contains(styleB)).toBe(true);

      // Restore app A - should only remove styleA
      cache.restoreStyles('app-a');

      expect(document.contains(styleA)).toBe(false);
      expect(document.contains(styleB)).toBe(true);

      // Cleanup
      styleB.remove();
    });
  });

  describe('getSize', () => {
    it('should return 0 when no records', () => {
      expect(cache.getSize()).toBe(0);
    });

    it('should return correct count after recording', () => {
      cache.recordStyles('app-a');
      cache.recordStyles('app-b');
      expect(cache.getSize()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should clear all records', () => {
      cache.recordStyles('app-a');
      cache.recordStyles('app-b');
      cache.reset();
      expect(cache.getSize()).toBe(0);
    });
  });
});
