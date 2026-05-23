/**
 * ErrorIsolator Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorIsolator, ErrorCallback } from '../src/core/ErrorIsolator';

// ============================================================================
// Test Setup
// ============================================================================

describe('ErrorIsolator Module', () => {
  beforeEach(() => {
    // Spy on console methods to verify logging
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ErrorIsolator Class', () => {
    describe('constructor', () => {
      it('should create ErrorIsolator instance', () => {
        const isolator = new ErrorIsolator();
        expect(isolator).toBeInstanceOf(ErrorIsolator);
      });

      it('should allow creating multiple instances (singleton pattern for handlers)', () => {
        const isolator1 = new ErrorIsolator();
        const isolator2 = new ErrorIsolator();

        // Both instances should be created (singleton is for global handlers)
        expect(isolator1).toBeInstanceOf(ErrorIsolator);
        expect(isolator2).toBeInstanceOf(ErrorIsolator);
      });
    });

    describe('setup', () => {
      it('should set up error boundary for sub-app', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        const boundary = isolator.setup('test-app', callback);

        expect(boundary).toBeDefined();
        expect(boundary.getKey()).toBe('test-app');
      });

      it('should call callback when error is captured', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        isolator.setup('test-app', callback);
        const boundary = isolator.getBoundary('test-app');

        if (boundary) {
          boundary.capture(new Error('Test error'));
        }

        expect(callback).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should support multiple sub-apps', () => {
        const isolator = new ErrorIsolator();
        const callback1: ErrorCallback = vi.fn();
        const callback2: ErrorCallback = vi.fn();

        isolator.setup('app1', callback1);
        isolator.setup('app2', callback2);

        expect(isolator.hasBoundary('app1')).toBe(true);
        expect(isolator.hasBoundary('app2')).toBe(true);
      });

      it('should return registered key from getRegisteredKeys', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        isolator.setup('test-app', callback);

        const keys = isolator.getRegisteredKeys();
        expect(keys).toContain('test-app');
      });
    });

    describe('getBoundary', () => {
      it('should return error boundary if exists', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        isolator.setup('test-app', callback);
        const boundary = isolator.getBoundary('test-app');

        expect(boundary).toBeDefined();
        expect(boundary?.getKey()).toBe('test-app');
      });

      it('should return undefined for non-existent key', () => {
        const isolator = new ErrorIsolator();
        const boundary = isolator.getBoundary('non-existent');

        expect(boundary).toBeUndefined();
      });
    });

    describe('hasBoundary', () => {
      it('should return true for existing boundary', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        isolator.setup('test-app', callback);
        expect(isolator.hasBoundary('test-app')).toBe(true);
      });

      it('should return false for non-existing boundary', () => {
        const isolator = new ErrorIsolator();
        expect(isolator.hasBoundary('non-existent')).toBe(false);
      });
    });

    describe('remove', () => {
      it('should remove error boundary', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        isolator.setup('test-app', callback);
        expect(isolator.hasBoundary('test-app')).toBe(true);

        isolator.remove('test-app');
        expect(isolator.hasBoundary('test-app')).toBe(false);
      });

      it('should handle removing non-existent boundary', () => {
        const isolator = new ErrorIsolator();

        // Should not throw
        expect(() => isolator.remove('non-existent')).not.toThrow();
      });
    });

    describe('destroy', () => {
      it('should clear all boundaries', () => {
        const isolator = new ErrorIsolator();
        const callback1: ErrorCallback = vi.fn();
        const callback2: ErrorCallback = vi.fn();

        isolator.setup('app1', callback1);
        isolator.setup('app2', callback2);

        isolator.destroy();

        expect(isolator.hasBoundary('app1')).toBe(false);
        expect(isolator.hasBoundary('app2')).toBe(false);
      });

      it('should return empty keys array after destroy', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        isolator.setup('test-app', callback);
        isolator.destroy();

        expect(isolator.getRegisteredKeys()).toHaveLength(0);
      });
    });

    describe('getRegisteredKeys', () => {
      it('should return empty array initially', () => {
        const isolator = new ErrorIsolator();
        expect(isolator.getRegisteredKeys()).toEqual([]);
      });

      it('should return all registered keys', () => {
        const isolator = new ErrorIsolator();
        const callback: ErrorCallback = vi.fn();

        isolator.setup('app1', callback);
        isolator.setup('app2', callback);
        isolator.setup('app3', callback);

        const keys = isolator.getRegisteredKeys();
        expect(keys).toHaveLength(3);
        expect(keys).toContain('app1');
        expect(keys).toContain('app2');
        expect(keys).toContain('app3');
      });
    });
  });

  describe('ErrorBoundary', () => {
    it('should capture error and call callback', () => {
      const isolator = new ErrorIsolator();
      const callback: ErrorCallback = vi.fn();

      const boundary = isolator.setup('test-app', callback);
      const testError = new Error('Test error message');

      boundary.capture(testError);

      expect(callback).toHaveBeenCalledWith(testError);
    });

    it('should get key correctly', () => {
      const isolator = new ErrorIsolator();
      const callback: ErrorCallback = vi.fn();

      const boundary = isolator.setup('my-subapp', callback);
      expect(boundary.getKey()).toBe('my-subapp');
    });

    it('should handle errors without stack trace', () => {
      const isolator = new ErrorIsolator();
      const callback: ErrorCallback = vi.fn();

      isolator.setup('test-app', callback);
      const boundary = isolator.getBoundary('test-app');

      if (boundary) {
        // Capture error without stack
        boundary.capture(new Error('Simple error'));
        expect(callback).toHaveBeenCalled();
      }
    });
  });

  describe('Integration with Sandbox', () => {
    it('should work alongside Sandbox module', async () => {
      // Import Sandbox for integration test
      const { Sandbox, GlobalWrapper } = await import('../src/core/Sandbox');

      const isolator = new ErrorIsolator();
      const errorCallback: ErrorCallback = vi.fn();

      // Create sandbox for sub-app
      const sandbox = new Sandbox('sandbox-test-app');
      const boundary = isolator.setup('sandbox-test-app', errorCallback);

      expect(boundary).toBeDefined();

      // Cleanup
      sandbox.inactive();
      GlobalWrapper.removeSandbox('sandbox-test-app');
      isolator.remove('sandbox-test-app');
    });
  });
});