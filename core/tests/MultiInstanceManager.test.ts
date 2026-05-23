/**
 * MultiInstanceManager Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MultiInstanceManager,
  type InstanceConfig,
  type InstanceInfo,
} from '../src/core/MultiInstanceManager';

describe('MultiInstanceManager', () => {
  let manager: MultiInstanceManager;

  beforeEach(() => {
    manager = new MultiInstanceManager();
  });

  describe('createInstance', () => {
    it('should create instance with auto-generated ID', () => {
      const instanceId = manager.createInstance({ appKey: 'pipeline-dashboard' });

      expect(instanceId).toMatch(/^pipeline-dashboard__\d+$/);
      expect(manager.hasInstance(instanceId)).toBe(true);
    });

    it('should create instance with custom ID', () => {
      const instanceId = manager.createInstance({
        instanceId: 'custom-instance-id',
        appKey: 'pipeline-dashboard',
        props: { tenantId: 'tenant-a' },
      });

      expect(instanceId).toBe('custom-instance-id');
      const instance = manager.getInstance(instanceId);
      expect(instance?.props.tenantId).toBe('tenant-a');
    });

    it('should create independent state machine for each instance', () => {
      const localManager = new MultiInstanceManager();
      const id1 = localManager.createInstance({ appKey: 'app1', instanceId: 'sm-test-1' });
      const id2 = localManager.createInstance({ appKey: 'app1', instanceId: 'sm-test-2' });

      const sm1 = localManager.getStateMachine(id1);
      const sm2 = localManager.getStateMachine(id2);

      expect(sm1).toBeDefined();
      expect(sm2).toBeDefined();
      expect(sm1).not.toBe(sm2);
    });

    it('should register app key when creating first instance', () => {
      manager.createInstance({ appKey: 'new-app' });

      expect(manager.getRegisteredApps()).toContain('new-app');
    });
  });

  describe('destroyInstance', () => {
    it('should destroy instance and cleanup resources', () => {
      const instanceId = manager.createInstance({ appKey: 'app1' });

      manager.destroyInstance(instanceId);

      expect(manager.hasInstance(instanceId)).toBe(false);
      expect(manager.getStateMachine(instanceId)).toBeUndefined();
    });

    it('should cleanup app key mapping when last instance is destroyed', () => {
      const instanceId = manager.createInstance({ appKey: 'temp-app' });

      manager.destroyInstance(instanceId);

      expect(manager.hasAppInstances('temp-app')).toBe(false);
    });

    it('should handle destroying non-existent instance gracefully', () => {
      expect(() => {
        manager.destroyInstance('non-existent');
      }).not.toThrow();
    });
  });

  describe('getInstances', () => {
    it('should return all instance IDs for an app', () => {
      const localManager = new MultiInstanceManager();
      localManager.createInstance({ appKey: 'pipeline', instanceId: 'pipe-1' });
      localManager.createInstance({ appKey: 'pipeline', instanceId: 'pipe-2' });
      localManager.createInstance({ appKey: 'pipeline', instanceId: 'pipe-3' });

      const instances = localManager.getInstances('pipeline');
      expect(instances).toHaveLength(3);
    });

    it('should return empty array for non-existent app', () => {
      const instances = manager.getInstances('non-existent');
      expect(instances).toEqual([]);
    });
  });

  describe('getInstance', () => {
    it('should return instance info', () => {
      const instanceId = manager.createInstance({
        appKey: 'app1',
        props: { key: 'value' },
        metadata: { version: '1.0' },
      });

      const instance = manager.getInstance(instanceId);

      expect(instance).toBeDefined();
      expect(instance?.appKey).toBe('app1');
      expect(instance?.props.key).toBe('value');
      expect(instance?.metadata?.version).toBe('1.0');
      expect(instance?.createdAt).toBeDefined();
      expect(instance?.state).toBe('idle');
    });

    it('should return undefined for non-existent instance', () => {
      expect(manager.getInstance('non-existent')).toBeUndefined();
    });
  });

  describe('getInstanceCount', () => {
    it('should return correct count', () => {
      const localManager = new MultiInstanceManager();
      localManager.createInstance({ appKey: 'app1', instanceId: 'test-app1-1' });
      localManager.createInstance({ appKey: 'app1', instanceId: 'test-app1-2' });
      localManager.createInstance({ appKey: 'app2', instanceId: 'test-app2-1' });

      expect(localManager.getInstanceCount('app1')).toBe(2);
      expect(localManager.getInstanceCount('app2')).toBe(1);
      expect(localManager.getInstanceCount('app3')).toBe(0);
    });
  });

  describe('getTotalInstanceCount', () => {
    it('should return total instance count', () => {
      const localManager = new MultiInstanceManager();
      localManager.createInstance({ appKey: 'app1', instanceId: 'unique-app1-1' });
      localManager.createInstance({ appKey: 'app1', instanceId: 'unique-app1-2' });
      localManager.createInstance({ appKey: 'app2', instanceId: 'unique-app2-1' });

      expect(localManager.getTotalInstanceCount()).toBe(3);
    });
  });

  describe('cleanupApp', () => {
    it('should cleanup all instances for an app', () => {
      const localManager = new MultiInstanceManager();
      localManager.createInstance({ appKey: 'pipeline', instanceId: 'pipeline-1' });
      localManager.createInstance({ appKey: 'pipeline', instanceId: 'pipeline-2' });
      localManager.createInstance({ appKey: 'cmdb', instanceId: 'cmdb-1' });

      const count = localManager.cleanupApp('pipeline');

      expect(count).toBe(2);
      expect(localManager.getInstanceCount('pipeline')).toBe(0);
      expect(localManager.getInstanceCount('cmdb')).toBe(1);
    });

    it('should return 0 for non-existent app', () => {
      const count = manager.cleanupApp('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('hasInstance', () => {
    it('should return true for existing instance', () => {
      const instanceId = manager.createInstance({ appKey: 'app1' });
      expect(manager.hasInstance(instanceId)).toBe(true);
    });

    it('should return false for non-existing instance', () => {
      expect(manager.hasInstance('non-existent')).toBe(false);
    });
  });

  describe('hasAppInstances', () => {
    it('should return true when app has instances', () => {
      manager.createInstance({ appKey: 'app1' });
      expect(manager.hasAppInstances('app1')).toBe(true);
    });

    it('should return false when app has no instances', () => {
      expect(manager.hasAppInstances('non-existent')).toBe(false);
    });
  });

  describe('getRegisteredApps', () => {
    it('should return all registered app keys', () => {
      manager.createInstance({ appKey: 'app1' });
      manager.createInstance({ appKey: 'app2' });
      manager.createInstance({ appKey: 'app1' });

      const apps = manager.getRegisteredApps();
      expect(apps).toContain('app1');
      expect(apps).toContain('app2');
      expect(apps).toHaveLength(2);
    });
  });

  describe('updateInstanceProps', () => {
    it('should update instance props', () => {
      const instanceId = manager.createInstance({ appKey: 'app1' });

      const success = manager.updateInstanceProps(instanceId, { newKey: 'newValue' });

      expect(success).toBe(true);
      expect(manager.getInstanceProps(instanceId)?.newKey).toBe('newValue');
    });

    it('should merge props', () => {
      const instanceId = manager.createInstance({
        appKey: 'app1',
        props: { existing: 'value' },
      });

      manager.updateInstanceProps(instanceId, { new: 'value' });

      const props = manager.getInstanceProps(instanceId);
      expect(props?.existing).toBe('value');
      expect(props?.new).toBe('value');
    });

    it('should return false for non-existent instance', () => {
      const success = manager.updateInstanceProps('non-existent', {});
      expect(success).toBe(false);
    });
  });

  describe('updateInstanceMetadata', () => {
    it('should update instance metadata', () => {
      const instanceId = manager.createInstance({ appKey: 'app1' });

      const success = manager.updateInstanceMetadata(instanceId, { version: '2.0' });

      expect(success).toBe(true);
      expect(manager.getInstance(instanceId)?.metadata?.version).toBe('2.0');
    });
  });

  describe('parseUrl', () => {
    it('should parse single instance URL', () => {
      const result = manager.parseUrl('/app/pipeline-dashboard');

      expect(result.appKey).toBe('pipeline-dashboard');
      expect(result.instanceId).toBeUndefined();
      expect(result.isMultiInstance).toBe(false);
    });

    it('should parse multi-instance URL', () => {
      const result = manager.parseUrl('/app/pipeline-dashboard/tenant-a');

      expect(result.appKey).toBe('pipeline-dashboard');
      expect(result.instanceId).toBe('tenant-a');
      expect(result.isMultiInstance).toBe(true);
    });

    it('should throw for invalid path format', () => {
      expect(() => manager.parseUrl('/invalid')).toThrow();
    });
  });

  describe('generateUrl', () => {
    it('should generate single instance URL', () => {
      const url = manager.generateUrl('pipeline-dashboard');
      expect(url).toBe('/app/pipeline-dashboard');
    });

    it('should generate multi-instance URL', () => {
      const url = manager.generateUrl('pipeline-dashboard', 'tenant-a');
      expect(url).toBe('/app/pipeline-dashboard/tenant-a');
    });
  });

  describe('getInstanceState', () => {
    it('should return instance state', () => {
      const instanceId = manager.createInstance({ appKey: 'app1' });

      expect(manager.getInstanceState(instanceId)).toBe('idle');
    });

    it('should return undefined for non-existent instance', () => {
      expect(manager.getInstanceState('non-existent')).toBeUndefined();
    });
  });

  describe('getAllInstances', () => {
    it('should return all instances', () => {
      manager.createInstance({ appKey: 'app1' });
      manager.createInstance({ appKey: 'app2' });

      const all = manager.getAllInstances();
      expect(all).toHaveLength(2);
    });
  });

  describe('autoCleanup', () => {
    it('should auto cleanup when max instances reached', () => {
      const managerWithCleanup = new MultiInstanceManager({
        autoCleanup: true,
        maxInstancesPerApp: 2,
      });

      // 前两次创建不受限制，第三次创建时会触发自动清理
      managerWithCleanup.createInstance({ appKey: 'app1', instanceId: 'app1-1' });
      managerWithCleanup.createInstance({ appKey: 'app1', instanceId: 'app1-2' });
      managerWithCleanup.createInstance({ appKey: 'app1', instanceId: 'app1-3' });

      // 触发清理后保留 maxInstancesPerApp=2 个实例
      expect(managerWithCleanup.getInstanceCount('app1')).toBe(2);
    });
  });

  describe('state machine integration', () => {
    it('should integrate with SubAppStateMachine', () => {
      const instanceId = manager.createInstance({ appKey: 'app1' });
      const stateMachine = manager.getStateMachine(instanceId);

      expect(stateMachine).toBeDefined();
      expect(stateMachine?.getState(instanceId)).toBe('idle');

      stateMachine?.transition(instanceId, 'load');
      expect(stateMachine?.getState(instanceId)).toBe('loading');
      expect(manager.getInstanceState(instanceId)).toBe('loading');
    });
  });

  describe('custom instanceIdGenerator', () => {
    it('should use custom generator', () => {
      const generator = vi.fn((appKey: string) => `custom-${appKey}-${Date.now()}`);
      const managerWithGenerator = new MultiInstanceManager({
        instanceIdGenerator: generator,
      });

      const instanceId = managerWithGenerator.createInstance({ appKey: 'app1' });

      expect(generator).toHaveBeenCalledWith('app1');
      expect(instanceId).toMatch(/^custom-app1-/);
    });
  });

  describe('destroy', () => {
    it('should destroy all instances', () => {
      manager.createInstance({ appKey: 'app1' });
      manager.createInstance({ appKey: 'app1' });
      manager.createInstance({ appKey: 'app2' });

      manager.destroy();

      expect(manager.getTotalInstanceCount()).toBe(0);
      expect(manager.getRegisteredApps()).toHaveLength(0);
    });
  });

  describe('global singleton', () => {
    it('should get and set global manager', async () => {
      const { getMultiInstanceManager, setMultiInstanceManager, createMultiInstanceManager } =
        await import('../src/core/MultiInstanceManager');

      const newManager = createMultiInstanceManager();
      setMultiInstanceManager(newManager);

      const retrieved = getMultiInstanceManager();
      expect(retrieved).toBe(newManager);
    });
  });
});