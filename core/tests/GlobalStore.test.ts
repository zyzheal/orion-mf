/**
 * GlobalStore Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GlobalStore,
  globalStore,
  setGlobalState,
  getGlobalState,
  subscribeGlobalState,
  getGlobalStates,
  cleanupSubApp,
} from '../src/core/GlobalStore';

describe('GlobalStore', () => {
  beforeEach(() => {
    // Clear store before each test
    globalStore.clear();
  });

  describe('set and get', () => {
    it('should set and get a value', () => {
      globalStore.set('testKey', 'testValue', 'testApp');
      expect(globalStore.get('testKey')).toBe('testValue');
    });

    it('should return undefined for non-existent key', () => {
      expect(globalStore.get('nonExistent')).toBeUndefined();
    });

    it('should store with correct owner', () => {
      globalStore.set('key1', 'value1', 'app1');
      const meta = globalStore.getMeta('key1');
      expect(meta?.owner).toBe('app1');
    });

    it('should increment version on each set', () => {
      globalStore.set('key', 'value1', 'app');
      const meta1 = globalStore.getMeta('key');
      const v1 = meta1?.version;

      globalStore.set('key', 'value2', 'app');
      const meta2 = globalStore.getMeta('key');
      const v2 = meta2?.version;

      expect(v2).toBeGreaterThan(v1!);
    });
  });

  describe('getMany', () => {
    it('should get multiple values at once', () => {
      globalStore.set('key1', 'value1', 'app1');
      globalStore.set('key2', 'value2', 'app2');
      globalStore.set('key3', 'value3', 'app3');

      const result = globalStore.getMany(['key1', 'key2', 'key3']);
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });
    });

    it('should return undefined for non-existent keys', () => {
      globalStore.set('key1', 'value1', 'app');

      const result = globalStore.getMany(['key1', 'nonExistent']);
      expect(result).toEqual({
        key1: 'value1',
        nonExistent: undefined,
      });
    });
  });

  describe('setMany', () => {
    it('should set multiple values at once', () => {
      globalStore.setMany({ key1: 'value1', key2: 'value2' }, 'app');

      expect(globalStore.get('key1')).toBe('value1');
      expect(globalStore.get('key2')).toBe('value2');
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on state change', () => {
      const callback = vi.fn();
      globalStore.subscribe('testKey', callback);

      globalStore.set('testKey', 'newValue', 'app');

      expect(callback).toHaveBeenCalledWith(
        'testKey',
        'newValue',
        expect.objectContaining({ version: expect.any(Number), owner: 'app' })
      );
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = globalStore.subscribe('testKey', callback);

      unsubscribe();
      globalStore.set('testKey', 'newValue', 'app');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not notify subscribers of other keys', () => {
      const callback = vi.fn();
      globalStore.subscribe('key1', callback);

      globalStore.set('key2', 'value2', 'app');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup states owned by specific app', () => {
      globalStore.set('key1', 'value1', 'app1');
      globalStore.set('key2', 'value2', 'app1');
      globalStore.set('key3', 'value3', 'app2');

      globalStore.cleanup('app1');

      expect(globalStore.get('key1')).toBeUndefined();
      expect(globalStore.get('key2')).toBeUndefined();
      expect(globalStore.get('key3')).toBe('value3');
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      globalStore.set('key', 'value', 'app');
      expect(globalStore.has('key')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(globalStore.has('nonExistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a specific key', () => {
      globalStore.set('key', 'value', 'app');
      globalStore.delete('key');
      expect(globalStore.get('key')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all states', () => {
      globalStore.set('key1', 'value1', 'app');
      globalStore.set('key2', 'value2', 'app');
      globalStore.clear();

      expect(globalStore.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      expect(globalStore.size()).toBe(0);

      globalStore.set('key1', 'value1', 'app');
      expect(globalStore.size()).toBe(1);

      globalStore.set('key2', 'value2', 'app');
      expect(globalStore.size()).toBe(2);
    });
  });

  describe('debug', () => {
    it('should return all store values with metadata', () => {
      globalStore.set('key1', 'value1', 'app1');

      const debug = globalStore.debug();
      expect(debug.key1).toBeDefined();
      expect(debug.key1?.data).toBe('value1');
      expect(debug.key1?.owner).toBe('app1');
      expect(debug.key1?.version).toBeDefined();
      expect(debug.key1?.timestamp).toBeDefined();
    });
  });

  describe('convenience functions', () => {
    it('setGlobalState should work', () => {
      setGlobalState('testKey', 'testValue', 'app');
      expect(getGlobalState('testKey')).toBe('testValue');
    });

    it('subscribeGlobalState should work', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeGlobalState('testKey', callback);

      setGlobalState('testKey', 'newValue', 'app');
      expect(callback).toHaveBeenCalledWith(
        'testKey',
        'newValue',
        expect.objectContaining({ version: expect.any(Number), owner: 'app' })
      );

      unsubscribe();
    });

    it('getGlobalStates should work', () => {
      setGlobalState('key1', 'value1', 'app');
      setGlobalState('key2', 'value2', 'app');

      const result = getGlobalStates(['key1', 'key2']);
      expect(result.key1).toBe('value1');
      expect(result.key2).toBe('value2');
    });

    it('cleanupSubApp should work', () => {
      setGlobalState('key1', 'value1', 'app1');
      setGlobalState('key2', 'value2', 'app2');

      cleanupSubApp('app1');

      expect(getGlobalState('key1')).toBeUndefined();
      expect(getGlobalState('key2')).toBe('value2');
    });
  });
});