/**
 * SubAppDataChannel Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SubAppDataChannel,
  createDataChannel,
  createFullAccessChannel,
  createReadOnlyChannel,
  globalStore,
} from '../src/core';

// Mock console.warn to verify warning messages
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('SubAppDataChannel', () => {
  beforeEach(() => {
    // Clear store before each test
    globalStore.clear();
    warnSpy.mockClear();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create channel with allowed keys', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['key1', 'key2'],
      });

      expect(channel.getAllowedKeys()).toEqual(['key1', 'key2']);
    });

    it('should handle empty allowed keys', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      expect(channel.getAllowedKeys()).toEqual([]);
    });
  });

  describe('setState', () => {
    it('should set allowed keys successfully', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['currentPipeline', 'selectedVersion'],
      });

      const result = channel.setState({ currentPipeline: 'build-001' });

      expect(result.success).toContain('currentPipeline');
      expect(result.denied).toEqual([]);
      expect(globalStore.get('currentPipeline')).toBe('build-001');
    });

    it('should deny keys not in whitelist', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['currentPipeline'],
      });

      const result = channel.setState({
        currentPipeline: 'build-001',
        currentUser: 'admin',
      });

      expect(result.success).toContain('currentPipeline');
      expect(result.denied).toContain('currentUser');
      expect(globalStore.get('currentPipeline')).toBe('build-001');
      expect(globalStore.get('currentUser')).toBeUndefined();
    });

    it('should log warning for denied keys', () => {
      // eslint-disable-next-line no-console
      const originalWarn = console.warn;
      const warnings: string[] = [];
      // eslint-disable-next-line no-console
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(' '));
      };

      const channel = new SubAppDataChannel({
        appKey: 'pipeline-dashboard',
        allowedKeys: ['currentPipeline'],
      });

      channel.setState({ currentUser: 'admin' });

      // eslint-disable-next-line no-console
      console.warn = originalWarn;

      expect(warnings.some(w =>
        w.includes('pipeline-dashboard') &&
        w.includes('无权修改状态') &&
        w.includes('currentUser')
      )).toBe(true);
    });

    it('should set multiple allowed keys', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['key1', 'key2', 'key3'],
      });

      const result = channel.setState({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });

      expect(result.success).toHaveLength(3);
      expect(result.denied).toHaveLength(0);
    });

    it('should return success and denied arrays', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['allowedKey'],
      });

      const result = channel.setState({
        allowedKey: 'allowed',
        deniedKey: 'denied',
      });

      expect(result).toEqual({
        success: ['allowedKey'],
        denied: ['deniedKey'],
      });
    });
  });

  describe('getState', () => {
    it('should get any state value (no restriction)', () => {
      // Set up state by another app
      globalStore.set('secretKey', 'secretValue', 'otherApp');

      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['allowedKey'],
      });

      // Should be able to read any key
      expect(channel.getState('secretKey')).toBe('secretValue');
    });

    it('should return undefined for non-existent key', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      expect(channel.getState('nonExistent')).toBeUndefined();
    });
  });

  describe('getStates', () => {
    it('should get multiple states at once', () => {
      globalStore.set('key1', 'value1', 'app1');
      globalStore.set('key2', 'value2', 'app2');
      globalStore.set('key3', 'value3', 'app3');

      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      const result = channel.getStates(['key1', 'key2', 'key3']);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });
    });

    it('should return undefined for non-existent keys', () => {
      globalStore.set('key1', 'value1', 'app');

      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      const result = channel.getStates(['key1', 'nonExistent']);
      expect(result.nonExistent).toBeUndefined();
    });
  });

  describe('subscribe', () => {
    it('should subscribe to state changes', () => {
      const callback = vi.fn();
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      const unsubscribe = channel.subscribe('testKey', callback);
      globalStore.set('testKey', 'newValue', 'otherApp');

      expect(callback).toHaveBeenCalledWith('newValue');
      unsubscribe();
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      const unsubscribe = channel.subscribe('testKey', callback);
      unsubscribe();

      globalStore.set('testKey', 'newValue', 'otherApp');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getAllowedKeys', () => {
    it('should return allowed keys array', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['key1', 'key2', 'key3'],
      });

      expect(channel.getAllowedKeys()).toEqual(['key1', 'key2', 'key3']);
    });
  });

  describe('canModify', () => {
    it('should return true for allowed keys', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['allowedKey'],
      });

      expect(channel.canModify('allowedKey')).toBe(true);
    });

    it('should return false for non-allowed keys', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['allowedKey'],
      });

      expect(channel.canModify('deniedKey')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup states owned by this channel', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['key1', 'key2'],
      });

      channel.setState({ key1: 'value1', key2: 'value2' });
      channel.cleanup();

      expect(globalStore.get('key1')).toBeUndefined();
      expect(globalStore.get('key2')).toBeUndefined();
    });

    it('should not affect other apps states', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: ['key1'],
      });

      globalStore.set('key2', 'value2', 'otherApp');

      channel.setState({ key1: 'value1' });
      channel.cleanup();

      expect(globalStore.get('key2')).toBe('value2');
    });
  });

  describe('getAppKey', () => {
    it('should return the app key', () => {
      const channel = new SubAppDataChannel({
        appKey: 'myApp',
        allowedKeys: [],
      });

      expect(channel.getAppKey()).toBe('myApp');
    });
  });

  describe('getStateMeta', () => {
    it('should return state metadata', () => {
      globalStore.set('key', 'value', 'testApp');

      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      const meta = channel.getStateMeta('key');

      expect(meta).toBeDefined();
      expect(meta?.owner).toBe('testApp');
      expect(meta?.version).toBeDefined();
      expect(meta?.timestamp).toBeDefined();
    });

    it('should return undefined for non-existent key', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      expect(channel.getStateMeta('nonExistent')).toBeUndefined();
    });
  });

  describe('hasState', () => {
    it('should return true for existing state', () => {
      globalStore.set('key', 'value', 'app');

      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      expect(channel.hasState('key')).toBe(true);
    });

    it('should return false for non-existent state', () => {
      const channel = new SubAppDataChannel({
        appKey: 'testApp',
        allowedKeys: [],
      });

      expect(channel.hasState('nonExistent')).toBe(false);
    });
  });

  describe('factory functions', () => {
    it('createDataChannel should work', () => {
      const channel = createDataChannel('myApp', ['key1', 'key2']);

      expect(channel.getAppKey()).toBe('myApp');
      expect(channel.getAllowedKeys()).toEqual(['key1', 'key2']);
    });

    it('createFullAccessChannel should allow all keys', () => {
      const channel = createFullAccessChannel('myApp');

      const result = channel.setState({ anyKey: 'anyValue' });
      expect(result.success).toContain('anyKey');
    });

    it('createReadOnlyChannel should deny all writes', () => {
      const channel = createReadOnlyChannel('myApp');

      const result = channel.setState({ anyKey: 'anyValue' });
      expect(result.denied).toContain('anyKey');
    });
  });
});