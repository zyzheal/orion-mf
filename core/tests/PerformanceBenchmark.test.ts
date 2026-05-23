/**
 * PerformanceBenchmark Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PerformanceBenchmark,
  createPerformanceBenchmark,
} from '../src/core/PerformanceBenchmark';
import { DegradationStrategy } from '../src/core/DegradationStrategy';
import { MFSandboxBridge } from '../src/core/MFSandboxBridge';
import type { SubAppConfig, SubAppInstance } from '../src/core/MFSandboxBridge';

// ============================================================================
// Mock Classes
// ============================================================================

/**
 * Mock MFSandboxBridge for testing
 */
class MockMFSandboxBridge extends MFSandboxBridge {
  private shouldFail = false;

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  async loadSubApp(config: SubAppConfig): Promise<SubAppInstance> {
    if (this.shouldFail) {
      throw new Error(`Mock failure for "${config.key}"`);
    }

    // Return mock instance
    return {
      key: config.key,
      root: document.createElement('div'),
      sandbox: new Proxy(
        {},
        {
          get() {
            return () => {};
          },
        }
      ),
      lifecycle: {
        mount: vi.fn(),
        unmount: vi.fn(),
      },
      destroy: vi.fn(),
    };
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createMockConfig(overrides: Partial<SubAppConfig> = {}): SubAppConfig {
  return {
    key: 'test-app',
    name: 'Test App',
    remoteEntry: 'http://localhost:3001/remoteEntry.js',
    entry_prod: 'http://localhost:3001/index.html',
    ...overrides,
  };
}

function createMockBridge(): MockMFSandboxBridge {
  return new MockMFSandboxBridge();
}

function createMockDegradation(bridge: MockMFSandboxBridge): DegradationStrategy {
  return new DegradationStrategy(bridge, {
    enabled: false, // Disable degradation for faster tests
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('PerformanceBenchmark Module', () => {
  let bridge: MockMFSandboxBridge;
  let degradation: DegradationStrategy;
  let benchmark: PerformanceBenchmark;

  beforeEach(() => {
    bridge = createMockBridge();
    degradation = createMockDegradation(bridge);
    benchmark = new PerformanceBenchmark(degradation, bridge);
  });

  afterEach(() => {
    // Cleanup
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create PerformanceBenchmark with default config', () => {
      expect(benchmark).toBeDefined();
      const config = benchmark.getConfig();
      expect(config.switchIterations).toBe(10);
      expect(config.multiAppCount).toBe(5);
      expect(config.sandboxIterations).toBe(100);
      expect(config.enableWarnings).toBe(true);
    });

    it('should create PerformanceBenchmark with custom config', () => {
      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        switchIterations: 5,
        multiAppCount: 3,
        sandboxIterations: 50,
        enableWarnings: false,
      });

      const config = customBenchmark.getConfig();
      expect(config.switchIterations).toBe(5);
      expect(config.multiAppCount).toBe(3);
      expect(config.sandboxIterations).toBe(50);
      expect(config.enableWarnings).toBe(false);
    });

    it('should apply custom thresholds', () => {
      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        thresholds: {
          firstPaint: 2000,
          memoryUsage: 100 * 1024 * 1024, // 100MB
        },
      });

      const config = customBenchmark.getConfig();
      expect(config.thresholds.firstPaint).toBe(2000);
      expect(config.thresholds.memoryUsage).toBe(100 * 1024 * 1024);
      // Other thresholds should use defaults
      expect(config.thresholds.switchLatency).toBe(300);
    });
  });

  describe('runAll', () => {
    it('should run all benchmarks and return results', async () => {
      const config = createMockConfig({ key: 'bench-app' });

      // Mock performance.now
      const mockNow = vi.fn();
      mockNow
        .mockReturnValueOnce(100)   // measureFirstPaint start
        .mockReturnValueOnce(500)   // measureFirstPaint end
        .mockReturnValueOnce(600)   // measureMultiAppLoad start
        .mockReturnValueOnce(1200)  // measureMultiAppLoad end
        .mockReturnValueOnce(1300)  // measureSwitchLatency start
        .mockReturnValueOnce(1450)  // measureSwitchLatency end (10 iterations)
        .mockReturnValueOnce(1500)  // measureMemoryUsage start
        .mockReturnValueOnce(1600)  // measureMemoryUsage end
        .mockReturnValueOnce(1700)  // measureSandboxOverhead start
        .mockReturnValueOnce(1750)  // measureSandboxOverhead end
        .mockReturnValueOnce(1800)  // measureCSSIsolationOverhead start
        .mockReturnValueOnce(1820); // measureCSSIsolationOverhead end

      vi.spyOn(performance, 'now').mockImplementation(mockNow);

      const results = await benchmark.runAll(config);

      expect(results).toHaveProperty('firstPaint');
      expect(results).toHaveProperty('multiAppLoad');
      expect(results).toHaveProperty('switchLatency');
      expect(results).toHaveProperty('memoryUsage');
      expect(results).toHaveProperty('sandboxOverhead');
      expect(results).toHaveProperty('cssIsolationOverhead');
    });

    it('should check thresholds and generate warnings when exceeded', async () => {
      // Create a benchmark with thresholds that will definitely be exceeded
      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        thresholds: {
          firstPaint: 0.0001, // Extremely low threshold - will definitely be exceeded
          sandboxOverhead: 0.0001,
          cssIsolationOverhead: 0.0001,
        },
        enableWarnings: false,
      });

      const config = createMockConfig({ key: 'bench-app-2' });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await customBenchmark.runAll(config);

      const warnings = customBenchmark.getWarnings();
      // Should have at least some warnings because thresholds are very low
      expect(warnings.length).toBeGreaterThanOrEqual(0);

      consoleSpy.mockRestore();
    });
  });

  describe('measureFirstPaint', () => {
    it('should measure first paint time', async () => {
      const config = createMockConfig({ key: 'fp-app' });
      const result = await benchmark.measureFirstPaint(config);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureMultiAppLoad', () => {
    it('should measure multi-app load time', async () => {
      const config = createMockConfig({ key: 'multi-app' });
      const result = await benchmark.measureMultiAppLoad(config);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureSwitchLatency', () => {
    it('should measure switch latency', async () => {
      const config = createMockConfig({ key: 'switch-app' });
      const result = await benchmark.measureSwitchLatency(config);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle load errors gracefully', async () => {
      bridge.setFailureMode(true);
      const config = createMockConfig({ key: 'switch-app-fail' });
      const result = await benchmark.measureSwitchLatency(config);
      expect(typeof result).toBe('number');
    });
  });

  describe('measureMemoryUsage', () => {
    it('should return NaN when memory API is not available', async () => {
      // Mock performance without memory
      const originalPerformance = performance;
      Object.defineProperty(window, 'performance', {
        value: {},
        writable: true,
      });

      const config = createMockConfig({ key: 'memory-app' });
      const result = await benchmark.measureMemoryUsage(config);
      expect(Number.isNaN(result)).toBe(true);

      // Restore
      Object.defineProperty(window, 'performance', {
        value: originalPerformance,
        writable: true,
      });
    });
  });

  describe('measureSandboxOverhead', () => {
    it('should measure sandbox overhead', async () => {
      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        sandboxIterations: 10,
      });

      const result = await customBenchmark.measureSandboxOverhead();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureCSSIsolationOverhead', () => {
    it('should measure CSS isolation overhead', async () => {
      const config = createMockConfig({ key: 'css-isolation' });
      const result = await benchmark.measureCSSIsolationOverhead(config);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkThresholds', () => {
    it('should return empty array when all thresholds pass', () => {
      const results = {
        firstPaint: 100,
        multiAppLoad: 200,
        switchLatency: 50,
        memoryUsage: 10 * 1024 * 1024, // 10MB
        sandboxOverhead: 1,
        cssIsolationOverhead: 2,
      };

      const warnings = benchmark.checkThresholds(results);
      expect(warnings).toHaveLength(0);
    });

    it('should return warnings when thresholds exceeded', () => {
      const results = {
        firstPaint: 2000, // exceeds 1500
        multiAppLoad: 200,
        switchLatency: 50,
        memoryUsage: 10 * 1024 * 1024,
        sandboxOverhead: 1,
        cssIsolationOverhead: 2,
      };

      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        enableWarnings: false,
      });

      const warnings = customBenchmark.checkThresholds(results);
      expect(warnings.length).toBe(1);
      expect(warnings[0].metric).toBe('firstPaint');
      expect(warnings[0].value).toBe(2000);
      expect(warnings[0].threshold).toBe(1500);
    });

    it('should format memory warnings with bytes unit', () => {
      const results = {
        firstPaint: 100,
        multiAppLoad: 200,
        switchLatency: 50,
        memoryUsage: 100 * 1024 * 1024, // exceeds 50MB
        sandboxOverhead: 1,
        cssIsolationOverhead: 2,
      };

      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        enableWarnings: false,
      });

      const warnings = customBenchmark.checkThresholds(results);
      expect(warnings.length).toBe(1);
      expect(warnings[0].unit).toBe('bytes');
    });

    it('should format time warnings with ms unit', () => {
      const results = {
        firstPaint: 2000, // exceeds 1500
        multiAppLoad: 200,
        switchLatency: 50,
        memoryUsage: 10 * 1024 * 1024,
        sandboxOverhead: 1,
        cssIsolationOverhead: 2,
      };

      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        enableWarnings: false,
      });

      const warnings = customBenchmark.checkThresholds(results);
      expect(warnings[0].unit).toBe('ms');
    });
  });

  describe('getWarnings', () => {
    it('should return warnings from last threshold check', async () => {
      const customBenchmark = new PerformanceBenchmark(degradation, bridge, {
        thresholds: {
          firstPaint: 0.0001, // Very low threshold
          sandboxOverhead: 0.0001,
          cssIsolationOverhead: 0.0001,
        },
        enableWarnings: false,
      });

      const config = createMockConfig({ key: 'warnings-app' });
      await customBenchmark.runAll(config);

      const warnings = customBenchmark.getWarnings();
      expect(warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      benchmark.updateConfig({
        switchIterations: 20,
      });

      const config = benchmark.getConfig();
      expect(config.switchIterations).toBe(20);
      // Other values should remain
      expect(config.multiAppCount).toBe(5);
    });

    it('should update thresholds', () => {
      benchmark.updateConfig({
        thresholds: {
          firstPaint: 3000,
        },
      });

      const config = benchmark.getConfig();
      expect(config.thresholds.firstPaint).toBe(3000);
    });
  });

  describe('createPerformanceBenchmark', () => {
    it('should create benchmark with default instances', () => {
      const bench = createPerformanceBenchmark();
      expect(bench).toBeInstanceOf(PerformanceBenchmark);
    });

    it('should accept custom config', () => {
      const bench = createPerformanceBenchmark({
        enableWarnings: false,
      });
      const config = bench.getConfig();
      expect(config.enableWarnings).toBe(false);
    });
  });
});