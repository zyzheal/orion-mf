/**
 * ObservabilityManager Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ObservabilityManager,
  getObservabilityManager,
  setObservabilityManager,
  SubAppMetrics,
  MetricsExporter,
} from '../src/core/ObservabilityManager';

// ============================================================================
// Test Setup
// ============================================================================

describe('ObservabilityManager Module', () => {
  let manager: ObservabilityManager;

  beforeEach(() => {
    manager = new ObservabilityManager();
  });

  afterEach(() => {
    manager.cleanupAll();
  });

  // ========================================================================
  // ObservabilityManager Class Tests
  // ========================================================================

  describe('ObservabilityManager Class', () => {
    describe('constructor', () => {
      it('should create ObservabilityManager instance', () => {
        expect(manager).toBeInstanceOf(ObservabilityManager);
      });

      it('should accept custom options', () => {
        const customManager = new ObservabilityManager({
          reportInterval: 60000,
          maxTimeRecords: 500,
        });

        expect(customManager).toBeInstanceOf(ObservabilityManager);
      });

      it('should use default values when no options provided', () => {
        const defaultManager = new ObservabilityManager();
        expect(defaultManager).toBeInstanceOf(ObservabilityManager);
      });
    });

    describe('registerExporter', () => {
      it('should register an exporter', () => {
        const exporter: MetricsExporter = vi.fn().mockResolvedValue(undefined);

        manager.registerExporter(exporter);

        expect(manager.getExporterCount()).toBe(1);
      });

      it('should register multiple exporters', () => {
        const exporter1: MetricsExporter = vi.fn().mockResolvedValue(undefined);
        const exporter2: MetricsExporter = vi.fn().mockResolvedValue(undefined);

        manager.registerExporter(exporter1);
        manager.registerExporter(exporter2);

        expect(manager.getExporterCount()).toBe(2);
      });

      it('should throw when registering non-function', () => {
        expect(() => {
          manager.registerExporter('not a function' as any);
        }).toThrow('Exporter must be a function');
      });
    });

    describe('unregisterExporter', () => {
      it('should unregister an exporter', () => {
        const exporter: MetricsExporter = vi.fn().mockResolvedValue(undefined);

        manager.registerExporter(exporter);
        manager.unregisterExporter(exporter);

        expect(manager.getExporterCount()).toBe(0);
      });

      it('should handle unregistering non-existent exporter', () => {
        const exporter: MetricsExporter = vi.fn().mockResolvedValue(undefined);

        // Should not throw
        manager.unregisterExporter(exporter);

        expect(manager.getExporterCount()).toBe(0);
      });
    });

    describe('recordLoadStart', () => {
      it('should increment loadCount', () => {
        manager.recordLoadStart('app-1');

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.loadCount).toBe(1);
      });

      it('should increment multiple loads', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadStart('app-1');
        manager.recordLoadStart('app-1');

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.loadCount).toBe(3);
      });

      it('should track loading state', () => {
        manager.recordLoadStart('app-1');

        expect(manager.isLoading('app-1')).toBe(true);
      });
    });

    describe('recordLoadComplete', () => {
      it('should record load duration and calculate stats', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.avgLoadTime).toBe(100);
        expect(metrics?.p95LoadTime).toBe(100);
        expect(metrics?.p99LoadTime).toBe(100);
      });

      it('should calculate average load time correctly', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 200);
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 300);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.avgLoadTime).toBe(200);
      });

      it('should calculate percentile correctly', () => {
        // Record 100 load times from 1 to 100
        for (let i = 1; i <= 100; i++) {
          manager.recordLoadStart('app-1');
          manager.recordLoadComplete('app-1', i);
        }

        const metrics = manager.getMetrics('app-1');

        // p95 should be around 95
        expect(metrics?.p95LoadTime).toBeGreaterThanOrEqual(90);
        expect(metrics?.p95LoadTime).toBeLessThanOrEqual(100);

        // p99 should be around 99
        expect(metrics?.p99LoadTime).toBeGreaterThanOrEqual(95);
        expect(metrics?.p99LoadTime).toBeLessThanOrEqual(100);
      });

      it('should update uptime', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.uptime).toBeGreaterThan(0);
      });

      it('should not clear loading state if not started', () => {
        // recordLoadComplete without recordLoadStart
        manager.recordLoadComplete('app-1', 100);

        expect(manager.isLoading('app-1')).toBe(false);
      });
    });

    describe('recordSwitchTime', () => {
      it('should record switch time', () => {
        manager.recordSwitchTime('app-1', 50);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.avgSwitchTime).toBe(50);
      });

      it('should calculate average switch time correctly', () => {
        manager.recordSwitchTime('app-1', 50);
        manager.recordSwitchTime('app-1', 100);
        manager.recordSwitchTime('app-1', 150);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.avgSwitchTime).toBe(100);
      });
    });

    describe('recordError', () => {
      it('should increment errorCount', () => {
        const error = new Error('Test error');
        manager.recordError('app-1', error);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.errorCount).toBe(1);
      });

      it('should record error details', () => {
        const error = new Error('Test error');
        error.stack = 'Error: Test error\n    at test';
        manager.recordError('app-1', error);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.lastError?.message).toBe('Test error');
        expect(metrics?.lastError?.stack).toBe('Error: Test error\n    at test');
        expect(metrics?.lastError?.timestamp).toBeGreaterThan(0);
      });

      it('should calculate crash rate', () => {
        const error = new Error('Test error');

        // 3 loads, 1 error
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);
        manager.recordLoadStart('app-1');
        manager.recordError('app-1', error);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.crashRate).toBeCloseTo(1 / 3, 2);
      });

      it('should calculate crash rate as 0 when no loads', () => {
        const error = new Error('Test error');
        manager.recordError('app-1', error);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.crashRate).toBe(0);
      });
    });

    describe('recordCircuitBreaker', () => {
      it('should record circuit breaker state as false', () => {
        manager.recordCircuitBreaker('app-1', false);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.circuitBreakerTripped).toBe(false);
      });

      it('should record circuit breaker state as true', () => {
        manager.recordCircuitBreaker('app-1', true);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.circuitBreakerTripped).toBe(true);
      });
    });

    describe('recordMemory', () => {
      it('should record memory usage', () => {
        manager.recordMemory('app-1', 50.5);

        const metrics = manager.getMetrics('app-1');
        expect(metrics?.memoryUsage).toBe(50.5);
      });
    });

    describe('getMetrics', () => {
      it('should return metrics for existing app', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);

        const metrics = manager.getMetrics('app-1');
        expect(metrics).toBeDefined();
        expect(metrics?.key).toBe('app-1');
      });

      it('should return undefined for non-existing app', () => {
        const metrics = manager.getMetrics('non-existent');
        expect(metrics).toBeUndefined();
      });

      it('should return a copy, not the original', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);

        const metrics1 = manager.getMetrics('app-1');
        const metrics2 = manager.getMetrics('app-1');

        // Modify the first metrics
        if (metrics1) {
          metrics1.loadCount = 999;
        }

        // The second one should not be affected
        expect(metrics2?.loadCount).toBe(1);
      });
    });

    describe('getAllMetrics', () => {
      it('should return all metrics', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);
        manager.recordLoadStart('app-2');
        manager.recordLoadComplete('app-2', 200);

        const allMetrics = manager.getAllMetrics();
        expect(allMetrics).toHaveLength(2);
      });

      it('should return empty array when no metrics', () => {
        const allMetrics = manager.getAllMetrics();
        expect(allMetrics).toHaveLength(0);
      });

      it('should return copies, not originals', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);

        const allMetrics1 = manager.getAllMetrics();
        const allMetrics2 = manager.getAllMetrics();

        // Modify the first
        if (allMetrics1[0]) {
          allMetrics1[0].loadCount = 999;
        }

        // The second should not be affected
        expect(allMetrics2[0]?.loadCount).toBe(1);
      });
    });

    describe('startReporting / stopReporting', () => {
      it('should start reporting', () => {
        manager.startReporting(1000);

        expect(manager.isReporting()).toBe(true);
      });

      it('should stop reporting', () => {
        manager.startReporting(1000);
        manager.stopReporting();

        expect(manager.isReporting()).toBe(false);
      });

      it('should use custom interval', () => {
        manager.startReporting(5000);

        // Should be able to start and stop without errors
        expect(manager.isReporting()).toBe(true);
        manager.stopReporting();
      });

      it('should restart with new interval when calling start again', () => {
        manager.startReporting(1000);
        manager.startReporting(2000);

        expect(manager.isReporting()).toBe(true);
        manager.stopReporting();
      });
    });

    describe('reportNow', () => {
      it('should call all registered exporters', async () => {
        const exporter1 = vi.fn().mockResolvedValue(undefined);
        const exporter2 = vi.fn().mockResolvedValue(undefined);

        manager.registerExporter(exporter1);
        manager.registerExporter(exporter2);

        await manager.reportNow();

        expect(exporter1).toHaveBeenCalled();
        expect(exporter2).toHaveBeenCalled();
      });

      it('should pass metrics to exporters', async () => {
        let receivedMetrics: SubAppMetrics[] = [];

        const exporter: MetricsExporter = vi.fn().mockImplementation((metrics) => {
          receivedMetrics = metrics;
          return Promise.resolve();
        });

        manager.registerExporter(exporter);
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);

        await manager.reportNow();

        expect(receivedMetrics).toHaveLength(1);
        expect(receivedMetrics[0]?.key).toBe('app-1');
        expect(receivedMetrics[0]?.avgLoadTime).toBe(100);
      });

      it('should handle exporter errors gracefully', async () => {
        const exporter: MetricsExporter = vi.fn().mockRejectedValue(new Error('Export failed'));

        manager.registerExporter(exporter);
        manager.recordLoadStart('app-1');

        // Should not throw
        await manager.reportNow();
      });
    });

    describe('cleanup', () => {
      it('should cleanup specific app metrics', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);
        manager.recordLoadStart('app-2');
        manager.recordLoadComplete('app-2', 200);

        manager.cleanup('app-1');

        expect(manager.getMetrics('app-1')).toBeUndefined();
        expect(manager.getMetrics('app-2')).toBeDefined();
      });

      it('should cleanup all metrics', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadComplete('app-1', 100);
        manager.recordLoadStart('app-2');
        manager.recordLoadComplete('app-2', 200);

        manager.cleanupAll();

        expect(manager.getAllMetrics()).toHaveLength(0);
      });

      it('should stop reporting when cleanupAll', () => {
        manager.startReporting(1000);
        manager.cleanupAll();

        expect(manager.isReporting()).toBe(false);
      });
    });

    describe('getLoadingApps', () => {
      it('should return loading apps', () => {
        manager.recordLoadStart('app-1');
        manager.recordLoadStart('app-2');
        manager.recordLoadStart('app-3');
        manager.recordLoadComplete('app-1', 100);

        const loadingApps = manager.getLoadingApps();
        expect(loadingApps).toContain('app-2');
        expect(loadingApps).toContain('app-3');
        expect(loadingApps).not.toContain('app-1');
      });
    });
  });

  // ========================================================================
  // Default Instance Tests
  // ========================================================================

  describe('Default Instance', () => {
    afterEach(() => {
      // Reset default instance after each test
      setObservabilityManager(new ObservabilityManager());
    });

    it('should get default instance', () => {
      const instance1 = getObservabilityManager();
      const instance2 = getObservabilityManager();

      expect(instance1).toBe(instance2);
    });

    it('should set custom default instance', () => {
      const customManager = new ObservabilityManager();
      setObservabilityManager(customManager);

      const instance = getObservabilityManager();
      expect(instance).toBe(customManager);
    });
  });

  // ========================================================================
  // Integration Tests
  // ========================================================================

  describe('Integration Scenarios', () => {
    it('should track full lifecycle', () => {
      // Simulate app loading lifecycle
      manager.recordLoadStart('app-1');

      // Record some errors during load
      try {
        throw new Error('Load error');
      } catch (e) {
        manager.recordError('app-1', e as Error);
      }

      // Complete load
      manager.recordLoadComplete('app-1', 150);

      // Record switch time
      manager.recordSwitchTime('app-1', 50);

      // Record memory
      manager.recordMemory('app-1', 45.5);

      // Record circuit breaker
      manager.recordCircuitBreaker('app-1', false);

      // Verify all metrics
      const metrics = manager.getMetrics('app-1');
      expect(metrics?.loadCount).toBe(1);
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.crashRate).toBe(1);
      expect(metrics?.avgLoadTime).toBe(150);
      expect(metrics?.avgSwitchTime).toBe(50);
      expect(metrics?.memoryUsage).toBe(45.5);
      expect(metrics?.circuitBreakerTripped).toBe(false);
    });

    it('should handle multiple apps independently', () => {
      // App 1: Good performance
      manager.recordLoadStart('app-1');
      manager.recordLoadComplete('app-1', 100);
      manager.recordMemory('app-1', 30);

      // App 2: Many errors
      manager.recordLoadStart('app-2');
      manager.recordLoadComplete('app-2', 100);
      manager.recordLoadStart('app-2');
      manager.recordLoadComplete('app-2', 100);
      manager.recordLoadStart('app-2');
      manager.recordError('app-2', new Error('Error'));

      // App 3: High memory
      manager.recordLoadStart('app-3');
      manager.recordLoadComplete('app-3', 500);
      manager.recordMemory('app-3', 150);

      const metrics1 = manager.getMetrics('app-1');
      const metrics2 = manager.getMetrics('app-2');
      const metrics3 = manager.getMetrics('app-3');

      expect(metrics1?.crashRate).toBe(0);
      expect(metrics2?.crashRate).toBeCloseTo(1 / 3);
      expect(metrics3?.memoryUsage).toBe(150);
    });
  });
});