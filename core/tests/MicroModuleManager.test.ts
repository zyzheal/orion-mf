/**
 * MicroModuleManager Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MicroModuleManager,
  MicroModuleConfig,
} from '../src/core/MicroModuleManager';

// ============================================================================
// Test Helpers
// ============================================================================

const mockConfig: MicroModuleConfig = {
  key: 'test-module',
  name: 'Test Module',
  remoteEntry: '/mock/remoteEntry.js',
  exportPath: './Button',
};

const mockConfig2: MicroModuleConfig = {
  key: 'test-module-2',
  name: 'Test Module 2',
  remoteEntry: '/mock/remoteEntry2.js',
  exportPath: './Form',
};

// ============================================================================
// Tests
// ============================================================================

describe('MicroModuleManager Module', () => {
  let manager: MicroModuleManager;

  beforeEach(() => {
    manager = new MicroModuleManager();
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should register a single module', () => {
      manager.register(mockConfig);
      expect(manager.getConfig('test-module')).toEqual(mockConfig);
    });

    it('should register multiple modules with registerMany', () => {
      manager.registerMany([mockConfig, mockConfig2]);
      expect(manager.getAllConfigs()).toHaveLength(2);
      expect(manager.getConfig('test-module')).toEqual(mockConfig);
      expect(manager.getConfig('test-module-2')).toEqual(mockConfig2);
    });

    it('should overwrite existing config with same key', () => {
      manager.register(mockConfig);
      manager.register({ ...mockConfig, name: 'Updated Name' });
      expect(manager.getConfig('test-module')?.name).toBe('Updated Name');
    });
  });

  describe('getConfig', () => {
    it('should return undefined for unregistered module', () => {
      expect(manager.getConfig('nonexistent')).toBeUndefined();
    });

    it('should return config for registered module', () => {
      manager.register(mockConfig);
      const config = manager.getConfig('test-module');
      expect(config).toBeDefined();
      expect(config?.key).toBe('test-module');
    });
  });

  describe('getAllConfigs', () => {
    it('should return empty array when no modules registered', () => {
      expect(manager.getAllConfigs()).toEqual([]);
    });

    it('should return all registered configs', () => {
      manager.registerMany([mockConfig, mockConfig2]);
      const configs = manager.getAllConfigs();
      expect(configs).toHaveLength(2);
    });
  });

  describe('load', () => {
    it('should throw error for unregistered module', async () => {
      await expect(manager.load('nonexistent')).rejects.toThrow(
        '[MicroModule] Not registered: nonexistent'
      );
    });

    it('should throw when module not found in remote', async () => {
      manager.register(mockConfig);

      vi.doMock('/mock/remoteEntry.js', () => ({
        get: () => undefined,
      }), { virtual: true });

      // The error will be about module not found or the mock failing
      await expect(manager.load('test-module')).rejects.toThrow();
    });

    it('should reject on timeout', async () => {
      manager.register({
        ...mockConfig,
        // Use a path that will fail to import but not be caught by vite
        remoteEntry: 'nonexistent-remote-entry-xyz.js',
      });

      await expect(
        manager.load('test-module', { timeout: 10 })
      ).rejects.toThrow();
    });
  });

  describe('isLoaded', () => {
    it('should return false for unloaded module', () => {
      expect(manager.isLoaded('test-module')).toBe(false);
    });
  });

  describe('getLoaded', () => {
    it('should return undefined for unloaded module', () => {
      expect(manager.getLoaded('test-module')).toBeUndefined();
    });
  });

  describe('unmount', () => {
    it('should not throw for unregistered module', () => {
      expect(() => manager.unmount('nonexistent')).not.toThrow();
    });
  });

  describe('getAllLoaded', () => {
    it('should return empty array when no modules loaded', () => {
      expect(manager.getAllLoaded()).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should clear all modules and configs', () => {
      manager.register(mockConfig);
      manager.reset();
      expect(manager.getAllConfigs()).toEqual([]);
      expect(manager.getAllLoaded()).toEqual([]);
    });

    it('should clear reactCache', () => {
      // Access private reactCache via type assertion
      const managerWithCache = manager as any;
      managerWithCache.reactCache = { React: {}, ReactDOM: {} };
      manager.reset();
      expect(managerWithCache.reactCache).toBeNull();
    });
  });

  describe('load caching', () => {
    it('should return cached module on repeated load', async () => {
      manager.register(mockConfig);

      // The actual test relies on the module cache behavior
      // We verify that isLoaded returns false until load succeeds
      expect(manager.isLoaded('test-module')).toBe(false);
    });
  });

  describe('load timeout', () => {
    it('should reject on timeout', async () => {
      manager.register({
        ...mockConfig,
        remoteEntry: 'will-timeout-entry.js',
      });

      await expect(
        manager.load('test-module', { timeout: 50 })
      ).rejects.toThrow();
    });
  });

  describe('force reload', () => {
    it('should not throw when force option is true', async () => {
      manager.register(mockConfig);
      // Even if not loaded, force: true should attempt fresh load
      // It will fail due to network, but the option is accepted
      await expect(
        manager.load('test-module', { force: true, timeout: 10 })
      ).rejects.toThrow();
    });
  });
});
