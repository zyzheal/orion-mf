/**
 * OrionMF PerformanceBenchmark Module - Performance Benchmark Testing
 *
 * ⚠️  DEV-ONLY MODULE: This module should NOT be used in production builds.
 *  It directly imports core modules (DegradationStrategy, MFSandboxBridge, etc.)
 *  which can trigger unintended sub-app loading during benchmarking.
 *
 *  Tree-shake this module in production via bundler configuration or
 *  guard usage with `process.env.NODE_ENV !== 'production'`.
 *
 * Provides 6 performance benchmarks:
 * - firstPaint: First paint time for single app load
 * - multiAppLoad: Load time for multiple apps in parallel
 * - switchLatency: App switching latency
 * - memoryUsage: JS heap memory usage (Chrome only, unavailable in Firefox/Safari)
 * - sandboxOverhead: Sandbox creation/destruction overhead
 * - cssIsolationOverhead: CSS isolation mounting overhead
 *
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §4.3
 */

import { DegradationStrategy } from './DegradationStrategy';
import { MFSandboxBridge } from './MFSandboxBridge';
import type { SubAppConfig } from './MFSandboxBridge';
import { GlobalWrapper } from './Sandbox';
import { StyleIsolator } from './StyleIsolator';

// ============================================================================
// Type Definitions
// ============================================================================

/** Benchmark result for all 6 metrics */
export interface BenchmarkResult {
  /** First paint time in milliseconds */
  firstPaint: number;
  /** Multi-app parallel load time in milliseconds */
  multiAppLoad: number;
  /** App switching latency in milliseconds */
  switchLatency: number;
  /** Memory usage in bytes (NaN if unavailable - Chrome only) */
  memoryUsage: number;
  /** Sandbox overhead in milliseconds */
  sandboxOverhead: number;
  /** CSS isolation overhead in milliseconds */
  cssIsolationOverhead: number;
}

/** Threshold configuration */
export interface BenchmarkThresholds {
  /** First paint threshold in ms (default: 1500) */
  firstPaint?: number;
  /** Multi-app load threshold in ms (default: 3000) */
  multiAppLoad?: number;
  /** Switch latency threshold in ms (default: 300) */
  switchLatency?: number;
  /** Memory usage threshold in bytes (default: 50MB) */
  memoryUsage?: number;
  /** Sandbox overhead threshold in ms (default: 5) */
  sandboxOverhead?: number;
  /** CSS isolation overhead threshold in ms (default: 10) */
  cssIsolationOverhead?: number;
}

/** Threshold warning */
export interface ThresholdWarning {
  /** Metric name */
  metric: keyof BenchmarkResult;
  /** Actual value */
  value: number;
  /** Threshold value */
  threshold: number;
  /** Unit string */
  unit: string;
}

/** Benchmark configuration */
export interface BenchmarkConfig {
  /** Number of iterations for switch latency test (default: 10) */
  switchIterations?: number;
  /** Number of apps for multi-app load test (default: 5) */
  multiAppCount?: number;
  /** Number of iterations for sandbox overhead test (default: 100) */
  sandboxIterations?: number;
  /** Custom thresholds */
  thresholds?: BenchmarkThresholds;
  /** Whether to enable console warnings (default: true) */
  enableWarnings?: boolean;
}

/** Default thresholds */
const DEFAULT_THRESHOLDS: Required<BenchmarkThresholds> = {
  firstPaint: 1500,       // 1.5s
  multiAppLoad: 3000,     // 3s (5 apps)
  switchLatency: 300,     // 300ms
  memoryUsage: 50 * 1024 * 1024, // 50MB
  sandboxOverhead: 5,     // 5ms
  cssIsolationOverhead: 10, // 10ms
};

/** Default benchmark configuration */
const DEFAULT_CONFIG: Required<BenchmarkConfig> = {
  switchIterations: 10,
  multiAppCount: 5,
  sandboxIterations: 100,
  thresholds: DEFAULT_THRESHOLDS,
  enableWarnings: true,
};

// ============================================================================
// PerformanceBenchmark Class
// ============================================================================

/**
 * PerformanceBenchmark - 6项性能基准测试
 *
 * Provides comprehensive performance benchmarking for micro-frontend operations:
 * - Measures load times, memory, and overhead metrics
 * - Integrates with DegradationStrategy and MFSandboxBridge
 * - Threshold checking with configurable warnings
 */
export class PerformanceBenchmark {
  /** DegradationStrategy instance */
  private degradation: DegradationStrategy;

  /** MFSandboxBridge instance */
  private bridge: MFSandboxBridge;

  /** Benchmark configuration */
  private config: Required<BenchmarkConfig>;

  /** Threshold warnings from last run */
  private lastWarnings: ThresholdWarning[] = [];

  /**
   * Create a new PerformanceBenchmark
   *
   * @param degradation - DegradationStrategy instance
   * @param bridge - MFSandboxBridge instance
   * @param config - Optional configuration
   */
  constructor(
    degradation: DegradationStrategy,
    bridge: MFSandboxBridge,
    config: BenchmarkConfig = {}
  ) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      console.warn(
        '[Benchmark] PerformanceBenchmark is a DEV-ONLY module and should not be used in production builds.'
      );
    }
    this.degradation = degradation;
    this.bridge = bridge;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        ...config.thresholds,
      },
    } as Required<BenchmarkConfig>;
  }

  /**
   * Run all 6 benchmark tests
   *
   * @param config - SubApp configuration for testing
   * @returns Benchmark results
   */
  async runAll(subAppConfig: SubAppConfig): Promise<BenchmarkResult> {
    const results: BenchmarkResult = {
      firstPaint: await this.measureFirstPaint(subAppConfig),
      multiAppLoad: await this.measureMultiAppLoad(subAppConfig),
      switchLatency: await this.measureSwitchLatency(subAppConfig),
      memoryUsage: await this.measureMemoryUsage(subAppConfig),
      sandboxOverhead: await this.measureSandboxOverhead(),
      cssIsolationOverhead: await this.measureCSSIsolationOverhead(subAppConfig),
    };

    // Check thresholds
    this.lastWarnings = this.checkThresholds(results);

    return results;
  }

  /**
   * Measure first paint time (single app load)
   *
   * @param config - SubApp configuration
   * @returns Load time in milliseconds
   */
  async measureFirstPaint(config: SubAppConfig): Promise<number> {
    const start = performance.now();
    await this.degradation.loadSubApp(config);
    return performance.now() - start;
  }

  /**
   * Measure multi-app parallel load time
   *
   * @param baseConfig - Base SubApp configuration
   * @returns Load time in milliseconds
   */
  async measureMultiAppLoad(baseConfig: SubAppConfig): Promise<number> {
    // Create multiple configs with unique keys
    const configs: SubAppConfig[] = [];
    for (let i = 0; i < this.config.multiAppCount; i++) {
      configs.push({
        ...baseConfig,
        key: `${baseConfig.key}-${i}`,
      });
    }

    const start = performance.now();
    await Promise.all(configs.map((c) => this.degradation.loadSubApp(c)));
    return performance.now() - start;
  }

  /**
   * Measure app switching latency
   *
   * Simulates rapid app switching to measure latency
   *
   * @param config - SubApp configuration
   * @returns Average latency in milliseconds
   */
  async measureSwitchLatency(config: SubAppConfig): Promise<number> {
    const times: number[] = [];

    for (let i = 0; i < this.config.switchIterations; i++) {
      const uniqueKey = `${config.key}-switch-${i}`;
      const start = performance.now();

      try {
        await this.bridge.loadSubApp({
          ...config,
          key: uniqueKey,
        });
      } catch {
        // Ignore load errors, still measure time
      }

      times.push(performance.now() - start);

      // Cleanup after each iteration
      try {
        await this.bridge.destroy(uniqueKey);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Return average
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  /**
   * Measure memory usage
   *
   * @param config - SubApp configuration
   * @returns Memory usage in bytes (0 if not available)
   */
  async measureMemoryUsage(config: SubAppConfig): Promise<number> {
    // Check if Performance.memory API is available (Chrome only)
    if (!('memory' in performance)) {
      // Return NaN to indicate "unavailable" rather than 0 which looks like a valid measurement
      return NaN;
    }

    // Force garbage collection if available (requires --expose-gc flag)
    if ('gc' in window) {
      (window as any).gc();
    }

    // Load the sub-app
    await this.degradation.loadSubApp(config);

    // Get memory info
    const memory = (performance as any).memory;
    return memory?.usedJSHeapSize ?? NaN;
  }

  /**
   * Measure sandbox creation/destruction overhead
   *
   * @returns Average time per iteration in milliseconds
   */
  async measureSandboxOverhead(): Promise<number> {
    const iterations = this.config.sandboxIterations;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const sandboxName = `bench-${i}`;

      const start = performance.now();
      const sandbox = GlobalWrapper.createSandbox(sandboxName);
      sandbox.inactive();
      GlobalWrapper.removeSandbox(sandboxName);

      times.push(performance.now() - start);
    }

    // Return average
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  /**
   * Measure CSS isolation mounting overhead
   *
   * @param config - SubApp configuration
   * @returns Time in milliseconds
   */
  async measureCSSIsolationOverhead(config: SubAppConfig): Promise<number> {
    const isolator = new StyleIsolator();
    const container = document.createElement('div');

    const start = performance.now();
    isolator.mount(config.key, container);
    isolator.unmount(config.key);

    return performance.now() - start;
  }

  /**
   * Check benchmark results against thresholds
   *
   * @param results - Benchmark results
   * @returns Array of threshold warnings
   */
  checkThresholds(results: BenchmarkResult): ThresholdWarning[] {
    const warnings: ThresholdWarning[] = [];
    const thresholds = this.config.thresholds;

    const metricEntries = Object.entries(results) as [keyof BenchmarkResult, number][];

    for (const [key, value] of metricEntries) {
      // Skip NaN values (unavailable measurements)
      if (Number.isNaN(value)) continue;

      const threshold = thresholds[key];
      if (threshold !== undefined && value > threshold) {
        const warning: ThresholdWarning = {
          metric: key,
          value,
          threshold,
          unit: key === 'memoryUsage' ? 'bytes' : 'ms',
        };
        warnings.push(warning);

        if (this.config.enableWarnings) {
          const unit = key === 'memoryUsage' ? 'bytes' : 'ms';
          console.warn(
            `[Benchmark] ${key} exceeds threshold: ${value.toFixed(2)}${unit} > ${threshold}${unit}`
          );
        }
      }
    }

    this.lastWarnings = warnings;
    return warnings;
  }

  /**
   * Get warnings from last run
   *
   * @returns Array of threshold warnings
   */
  getWarnings(): ThresholdWarning[] {
    return this.lastWarnings;
  }

  /**
   * Update configuration
   *
   * @param config - New configuration
   */
  updateConfig(config: Partial<BenchmarkConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      thresholds: {
        ...this.config.thresholds,
        ...config.thresholds,
      },
    } as Required<BenchmarkConfig>;
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration
   */
  getConfig(): Required<BenchmarkConfig> {
    return this.config;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a PerformanceBenchmark with default instances
 */
export function createPerformanceBenchmark(config?: BenchmarkConfig): PerformanceBenchmark {
  const bridge = new MFSandboxBridge();
  const degradation = new DegradationStrategy(bridge);
  return new PerformanceBenchmark(degradation, bridge, config);
}

// ============================================================================
// Export
// ============================================================================

export default PerformanceBenchmark;