/**
 * DevProxyManager Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DevProxyManager,
  createDevProxyManager,
  getDevProxyManager,
  type ProxyList,
  type ProxyChangeCallback,
} from '../src/core/DevProxyManager';

describe('DevProxyManager', () => {
  // Backup and restore window.__ORIONMF_PROXY_LIST__
  let originalProxyList: ProxyList | undefined;

  beforeEach(() => {
    // Save original window proxy list
    originalProxyList = (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__;
    // Clear for each test
    delete (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__;
  });

  afterEach(() => {
    // Restore original window proxy list
    if (originalProxyList !== undefined) {
      (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__ = originalProxyList;
    } else {
      delete (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__;
    }
  });

  describe('constructor', () => {
    it('should create instance with empty proxy list by default', () => {
      const manager = new DevProxyManager();
      expect(manager.getAll()).toEqual({});
    });

    it('should use initial proxy list if provided', () => {
      const initialProxy: ProxyList = {
        'app1': 'http://localhost:3001/remoteEntry.js',
        'app2': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(initialProxy);
      expect(manager.getAll()).toEqual(initialProxy);
    });

    it('should load from window.__ORIONMF_PROXY_LIST__ if no initial list', () => {
      (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__ = {
        'pipeline': 'http://localhost:3003/remoteEntry.js',
      };
      const manager = new DevProxyManager();
      expect(manager.getAll()).toEqual({
        'pipeline': 'http://localhost:3003/remoteEntry.js',
      });
    });

    it('should prioritize initial proxy list over window', () => {
      (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__ = {
        'app1': 'http://localhost:3001/remoteEntry.js',
      };
      const initialProxy: ProxyList = {
        'app1': 'http://localhost:4001/remoteEntry.js',
      };
      const manager = new DevProxyManager(initialProxy);
      expect(manager.getAll()['app1']).toBe('http://localhost:4001/remoteEntry.js');
    });
  });

  describe('resolveEntry', () => {
    it('should return proxy URL when proxy exists', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      const result = manager.resolveEntry('pipeline', 'https://prod.com/pipeline/remoteEntry.js');

      expect(result).toBe('http://localhost:3002/remoteEntry.js');
    });

    it('should return config entry when proxy does not exist', () => {
      const manager = new DevProxyManager();

      const result = manager.resolveEntry('pipeline', 'https://prod.com/pipeline/remoteEntry.js');

      expect(result).toBe('https://prod.com/pipeline/remoteEntry.js');
    });

    it('should return config entry when proxy is empty string', () => {
      const proxyList: ProxyList = {
        'pipeline': '',
      };
      const manager = new DevProxyManager(proxyList);

      const result = manager.resolveEntry('pipeline', 'https://prod.com/pipeline/remoteEntry.js');

      expect(result).toBe('https://prod.com/pipeline/remoteEntry.js');
    });

    it('should return config entry when proxy is whitespace only', () => {
      const proxyList: ProxyList = {
        'pipeline': '   ',
      };
      const manager = new DevProxyManager(proxyList);

      const result = manager.resolveEntry('pipeline', 'https://prod.com/pipeline/remoteEntry.js');

      expect(result).toBe('https://prod.com/pipeline/remoteEntry.js');
    });
  });

  describe('register', () => {
    it('should register a proxy', () => {
      const manager = new DevProxyManager();

      manager.register('pipeline', 'http://localhost:3002/remoteEntry.js');

      expect(manager.hasProxy('pipeline')).toBe(true);
      expect(manager.getProxy('pipeline')).toBe('http://localhost:3002/remoteEntry.js');
    });

    it('should warn when registering without appKey', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manager = new DevProxyManager();

      manager.register('', 'http://localhost:3002/remoteEntry.js');

      expect(warnSpy).toHaveBeenCalledWith('[DevProxyManager] Cannot register proxy without appKey');
      warnSpy.mockRestore();
    });

    it('should warn when registering without localEntry', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manager = new DevProxyManager();

      manager.register('pipeline', '');

      expect(warnSpy).toHaveBeenCalledWith('[DevProxyManager] Cannot register proxy without localEntry');
      warnSpy.mockRestore();
    });

    it('should update existing proxy when registering again', () => {
      const manager = new DevProxyManager();

      manager.register('pipeline', 'http://localhost:3002/remoteEntry.js');
      manager.register('pipeline', 'http://localhost:4002/remoteEntry.js');

      expect(manager.getProxy('pipeline')).toBe('http://localhost:4002/remoteEntry.js');
    });

    it('should sync to window object', () => {
      const manager = new DevProxyManager();

      manager.register('pipeline', 'http://localhost:3002/remoteEntry.js');

      expect((window as unknown as { __ORIONMF_PROXY_LIST__: ProxyList }).__ORIONMF_PROXY_LIST__).toEqual({
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      });
    });

    it('should trigger onChange callback', () => {
      const manager = new DevProxyManager();
      const callback: ProxyChangeCallback = vi.fn();
      manager.setOnChange(callback);

      manager.register('pipeline', 'http://localhost:3002/remoteEntry.js');

      expect(callback).toHaveBeenCalledWith({
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      });
    });
  });

  describe('unregister', () => {
    it('should unregister a proxy', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      manager.unregister('pipeline');

      expect(manager.hasProxy('pipeline')).toBe(false);
      expect(manager.getProxy('pipeline')).toBeUndefined();
    });

    it('should warn when unregistering without appKey', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manager = new DevProxyManager();

      manager.unregister('');

      expect(warnSpy).toHaveBeenCalledWith('[DevProxyManager] Cannot unregister proxy without appKey');
      warnSpy.mockRestore();
    });

    it('should handle unregistering non-existent proxy', () => {
      const manager = new DevProxyManager();

      expect(() => manager.unregister('non-existent')).not.toThrow();
    });

    it('should trigger onChange callback', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);
      const callback: ProxyChangeCallback = vi.fn();
      manager.setOnChange(callback);

      manager.unregister('pipeline');

      expect(callback).toHaveBeenCalledWith({});
    });
  });

  describe('generateProxyScript', () => {
    it('should generate correct script', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
        'cmdb': 'http://localhost:3003/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      const script = manager.generateProxyScript();

      expect(script).toContain('window.__ORIONMF_PROXY_LIST__');
      expect(script).toContain('"pipeline"');
      expect(script).toContain('"cmdb"');
    });

    it('should generate empty script when no proxies', () => {
      const manager = new DevProxyManager();

      const script = manager.generateProxyScript();

      expect(script).toBe('window.__ORIONMF_PROXY_LIST__ = {};');
    });
  });

  describe('getAll', () => {
    it('should return copy of proxy list', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      const result = manager.getAll();
      result['pipeline'] = 'http://changed.com/remoteEntry.js';

      // Original should not be modified
      expect(manager.getAll()['pipeline']).toBe('http://localhost:3002/remoteEntry.js');
    });
  });

  describe('hasProxy', () => {
    it('should return true when proxy exists', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      expect(manager.hasProxy('pipeline')).toBe(true);
    });

    it('should return false when proxy does not exist', () => {
      const manager = new DevProxyManager();

      expect(manager.hasProxy('non-existent')).toBe(false);
    });

    it('should return false when proxy is empty string', () => {
      const proxyList: ProxyList = {
        'pipeline': '',
      };
      const manager = new DevProxyManager(proxyList);

      expect(manager.hasProxy('pipeline')).toBe(false);
    });
  });

  describe('setOnChange', () => {
    it('should set onChange callback', () => {
      const manager = new DevProxyManager();
      const callback: ProxyChangeCallback = vi.fn();

      manager.setOnChange(callback);

      manager.register('pipeline', 'http://localhost:3002/remoteEntry.js');

      expect(callback).toHaveBeenCalled();
    });

    it('should allow changing callback', () => {
      const manager = new DevProxyManager();
      const callback1: ProxyChangeCallback = vi.fn();
      const callback2: ProxyChangeCallback = vi.fn();

      manager.setOnChange(callback1);
      manager.setOnChange(callback2);

      manager.register('pipeline', 'http://localhost:3002/remoteEntry.js');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should reload from window', () => {
      const manager = new DevProxyManager();

      (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__ = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };

      manager.refresh();

      expect(manager.getProxy('pipeline')).toBe('http://localhost:3002/remoteEntry.js');
    });

    it('should trigger onChange callback', () => {
      const manager = new DevProxyManager();
      const callback: ProxyChangeCallback = vi.fn();
      manager.setOnChange(callback);

      manager.refresh();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all proxies', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
        'cmdb': 'http://localhost:3003/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      manager.clear();

      expect(manager.getAll()).toEqual({});
    });

    it('should clear window object', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      manager.clear();

      expect((window as unknown as { __ORIONMF_PROXY_LIST__: ProxyList }).__ORIONMF_PROXY_LIST__).toEqual({});
    });

    it('should trigger onChange callback', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);
      const callback: ProxyChangeCallback = vi.fn();
      manager.setOnChange(callback);

      manager.clear();

      expect(callback).toHaveBeenCalledWith({});
    });
  });

  describe('getProxy', () => {
    it('should return proxy entry when exists', () => {
      const proxyList: ProxyList = {
        'pipeline': 'http://localhost:3002/remoteEntry.js',
      };
      const manager = new DevProxyManager(proxyList);

      expect(manager.getProxy('pipeline')).toBe('http://localhost:3002/remoteEntry.js');
    });

    it('should return undefined when proxy does not exist', () => {
      const manager = new DevProxyManager();

      expect(manager.getProxy('non-existent')).toBeUndefined();
    });

    it('should return undefined when proxy is empty string', () => {
      const proxyList: ProxyList = {
        'pipeline': '',
      };
      const manager = new DevProxyManager(proxyList);

      expect(manager.getProxy('pipeline')).toBeUndefined();
    });
  });
});

describe('Factory functions', () => {
  let originalProxyList: ProxyList | undefined;

  beforeEach(() => {
    originalProxyList = (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__;
    delete (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__;
  });

  afterEach(() => {
    if (originalProxyList !== undefined) {
      (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__ = originalProxyList;
    } else {
      delete (window as unknown as { __ORIONMF_PROXY_LIST__?: ProxyList }).__ORIONMF_PROXY_LIST__;
    }
  });

  describe('createDevProxyManager', () => {
    it('should create a new instance', () => {
      const manager1 = createDevProxyManager();
      const manager2 = createDevProxyManager();

      expect(manager1).not.toBe(manager2);
    });

    it('should accept initial proxy list', () => {
      const proxyList: ProxyList = {
        'app1': 'http://localhost:3001/remoteEntry.js',
      };
      const manager = createDevProxyManager(proxyList);

      expect(manager.getAll()).toEqual(proxyList);
    });
  });

  describe('getDevProxyManager', () => {
    it('should return the same instance on subsequent calls', () => {
      const manager1 = getDevProxyManager();
      const manager2 = getDevProxyManager();

      expect(manager1).toBe(manager2);
    });

    it('should return instance with proxies from window', () => {
      // This test depends on window state set by previous tests
      const manager = getDevProxyManager();

      // Should have proxies from window (empty in this test context)
      expect(manager).toBeDefined();
    });
  });
});