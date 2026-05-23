/**
 * ReactRefreshDetector Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectReactRefresh,
  isReactRefreshInjected,
} from '../src/core/ReactRefreshDetector';

describe('ReactRefreshDetector Module', () => {
  beforeEach(() => {
    // The module uses an internal singleton, so we test via public API
  });

  describe('isReactRefreshInjected', () => {
    it('should return false for unknown app', () => {
      expect(isReactRefreshInjected('nonexistent-app')).toBe(false);
    });
  });

  describe('detectReactRefresh', () => {
    it('should mark app as injected', () => {
      detectReactRefresh('test-app');
      expect(isReactRefreshInjected('test-app')).toBe(true);
    });

    it('should not affect other apps', () => {
      detectReactRefresh('app-a');
      expect(isReactRefreshInjected('app-b')).toBe(false);
      expect(isReactRefreshInjected('app-a')).toBe(true);
    });
  });
});
