/**
 * ObservabilityManager — 崩溃率上报与可观测性模块
 *
 * 提供子应用运行时可观测性能力：
 * - 指标采集：loadCount, errorCount, crashRate, avgLoadTime, p95/p99
 * - 导出器插件：MetricsExporter 接口对接 Prometheus/OpenTelemetry/APM
 * - 定期上报：setInterval，默认 30s
 */

export interface SubAppMetrics {
  /** 子应用唯一标识 */
  key: string;
  /** 加载次数 */
  loadCount: number;
  /** 错误次数 */
  errorCount: number;
  /** 崩溃率 = errorCount / loadCount */
  crashRate: number;
  /** 平均加载时间 (ms) */
  avgLoadTime: number;
  /** 平均切换时间 (ms) */
  avgSwitchTime: number;
  /** p95 加载时间 (ms) */
  p95LoadTime: number;
  /** p99 加载时间 (ms) */
  p99LoadTime: number;
  /** 内存使用量 (MB) */
  memoryUsage: number;
  /** 最后一次错误信息 */
  lastError?: {
    message: string;
    stack: string;
    timestamp: number;
  };
  /** 熔断器是否触发 */
  circuitBreakerTripped: boolean;
  /** 当前运行时间 (ms) */
  uptime: number;
}

/**
 * 指标导出器接口
 * 用于对接 Prometheus/OpenTelemetry/APM 等监控系统
 */
export type MetricsExporter = (metrics: SubAppMetrics[]) => Promise<void>;

export interface ObservabilityOptions {
  /** 上报间隔 (ms)，默认 30000ms (30s) */
  reportInterval?: number;
  /** 最大保留的加载时间记录数，用于计算百分位数 */
  maxTimeRecords?: number;
}

/**
 * ObservabilityManager — 可观测性管理器
 *
 * 用于收集、上报子应用的运行时指标：
 * - 加载次数、错误次数、崩溃率
 * - 加载时间、切换时间的平均值和百分位数 (p95/p99)
 * - 内存使用情况
 * - 熔断器状态
 */
export class ObservabilityManager {
  /** 子应用指标 Map: key -> SubAppMetrics */
  private metrics = new Map<string, SubAppMetrics>();

  /** 加载时间记录: key -> duration[] */
  private loadTimes = new Map<string, number[]>();

  /** 切换时间记录: key -> duration[] */
  private switchTimes = new Map<string, number[]>();

  /** 加载开始时间记录: key -> startTime */
  private loadStartTimes = new Map<string, number>();

  /** 已注册的导出器列表 */
  private exporters: MetricsExporter[] = [];

  /** 定期上报定时器 */
  private reportInterval: ReturnType<typeof setInterval> | null = null;

  /** 默认上报间隔 */
  private defaultReportInterval: number;

  /** 最大保留的时间记录数 */
  private maxTimeRecords: number;

  /** 应用启动时间 (使用 performance.now 获取高精度时间) */
  private readonly startTime: number;

  constructor(options?: ObservabilityOptions) {
    this.defaultReportInterval = options?.reportInterval ?? 30000;
    this.maxTimeRecords = options?.maxTimeRecords ?? 1000;
    this.startTime = performance.now();
  }

  /**
   * 获取当前运行时间 (ms)
   */
  private getUptime(): number {
    return performance.now() - this.startTime;
  }

  /**
   * 注册指标导出器
   * 支持同时注册多个导出器（如 Prometheus + 自定义 APM）
   * @param exporter 导出器函数
   */
  registerExporter(exporter: MetricsExporter): void {
    if (typeof exporter !== 'function') {
      throw new Error('[Observability] Exporter must be a function');
    }
    this.exporters.push(exporter);
  }

  /**
   * 移除指定导出器
   * @param exporter 导出器函数
   */
  unregisterExporter(exporter: MetricsExporter): void {
    const index = this.exporters.indexOf(exporter);
    if (index > -1) {
      this.exporters.splice(index, 1);
    }
  }

  /**
   * 记录子应用加载开始
   * @param key 子应用唯一标识
   */
  recordLoadStart(key: string): void {
    const m = this.getOrCreate(key);
    m.loadCount++;
    this.loadStartTimes.set(key, performance.now());
  }

  /**
   * 记录子应用加载完成
   * @param key 子应用唯一标识
   * @param duration 加载耗时 (ms)
   */
  recordLoadComplete(key: string, duration: number): void {
    const m = this.getOrCreate(key);

    // 记录加载时间
    const times = this.loadTimes.get(key) ?? [];
    times.push(duration);

    // 限制数组大小，避免内存无限增长
    if (times.length > this.maxTimeRecords) {
      times.splice(0, times.length - this.maxTimeRecords);
    }

    this.loadTimes.set(key, times);

    // 计算统计指标（优化：一次性排序，避免重复排序）
    const sorted = [...times].sort((a, b) => a - b);
    m.avgLoadTime = this.averageFromSorted(sorted);
    m.p95LoadTime = this.percentileFromSorted(sorted, 95);
    m.p99LoadTime = this.percentileFromSorted(sorted, 99);

    // 清除加载开始记录
    this.loadStartTimes.delete(key);

    // 实时计算崩溃率
    m.crashRate = m.loadCount > 0 ? m.errorCount / m.loadCount : 0;
  }

  /**
   * 记录子应用切换时间
   * @param key 子应用唯一标识
   * @param duration 切换耗时 (ms)
   */
  recordSwitchTime(key: string, duration: number): void {
    const m = this.getOrCreate(key);

    const times = this.switchTimes.get(key) ?? [];
    times.push(duration);

    // 限制数组大小
    if (times.length > this.maxTimeRecords) {
      times.splice(0, times.length - this.maxTimeRecords);
    }

    this.switchTimes.set(key, times);
    m.avgSwitchTime = this.average(times);
  }

  /**
   * 记录子应用错误
   * @param key 子应用唯一标识
   * @param error 错误对象
   */
  recordError(key: string, error: Error): void {
    const m = this.getOrCreate(key);

    m.errorCount++;
    m.lastError = {
      message: error.message,
      stack: error.stack || '',
      timestamp: Date.now(),
    };

    // 实时计算崩溃率
    m.crashRate = m.loadCount > 0 ? m.errorCount / m.loadCount : 0;
  }

  /**
   * 记录熔断器状态
   * @param key 子应用唯一标识
   * @param tripped 是否触发熔断
   */
  recordCircuitBreaker(key: string, tripped: boolean): void {
    const m = this.getOrCreate(key);
    m.circuitBreakerTripped = tripped;
  }

  /**
   * 记录内存使用情况
   * @param key 子应用唯一标识
   * @param usageMB 内存使用量 (MB)
   */
  recordMemory(key: string, usageMB: number): void {
    const m = this.getOrCreate(key);
    m.memoryUsage = usageMB;
  }

  /**
   * 获取指定子应用的指标
   * @param key 子应用唯一标识
   * @returns SubAppMetrics 或 undefined
   */
  getMetrics(key: string): SubAppMetrics | undefined {
    const metrics = this.metrics.get(key);
    if (metrics) {
      // 返回副本，避免外部修改
      return { ...metrics, uptime: this.getUptime() };
    }
    return undefined;
  }

  /**
   * 获取所有子应用的指标
   * @returns SubAppMetrics[] 所有指标的副本数组
   */
  getAllMetrics(): SubAppMetrics[] {
    return Array.from(this.metrics.values()).map((m) => ({
      ...m,
      uptime: this.getUptime(),
    }));
  }

  /**
   * 启动定期上报
   * @param intervalMs 上报间隔 (ms)，默认使用构造函数的默认值
   */
  startReporting(intervalMs?: number): void {
    // 如果已经在上报，先停止
    this.stopReporting();

    const interval = intervalMs ?? this.defaultReportInterval;

    this.reportInterval = setInterval(async () => {
      const metrics = this.getAllMetrics();

      for (const exporter of this.exporters) {
        try {
          await exporter(metrics);
        } catch (e) {
          console.error('[Observability] Export failed:', e);
        }
      }
    }, interval);

    // 立即执行一次上报
    this.reportNow();
  }

  /**
   * 立即执行一次上报
   */
  async reportNow(): Promise<void> {
    const metrics = this.getAllMetrics();

    const promises = this.exporters.map(async (exporter) => {
      try {
        await exporter(metrics);
      } catch (e) {
        console.error('[Observability] Export failed:', e);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 停止定期上报
   */
  stopReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  /**
   * 清理指定子应用的所有指标数据
   * @param key 子应用唯一标识
   */
  cleanup(key: string): void {
    this.metrics.delete(key);
    this.loadTimes.delete(key);
    this.switchTimes.delete(key);
    this.loadStartTimes.delete(key);
  }

  /**
   * 清理所有子应用的指标数据
   */
  cleanupAll(): void {
    this.metrics.clear();
    this.loadTimes.clear();
    this.switchTimes.clear();
    this.loadStartTimes.clear();
    this.stopReporting();
  }

  /**
   * 获取当前加载中的子应用列表
   * @returns 正在加载的子应用 key 数组
   */
  getLoadingApps(): string[] {
    return Array.from(this.loadStartTimes.keys());
  }

  /**
   * 检查指定子应用是否正在加载
   * @param key 子应用唯一标识
   * @returns 是否正在加载
   */
  isLoading(key: string): boolean {
    return this.loadStartTimes.has(key);
  }

  /**
   * 获取已注册的导出器数量
   * @returns 导出器数量
   */
  getExporterCount(): number {
    return this.exporters.length;
  }

  /**
   * 检查是否正在上报
   * @returns 是否正在上报
   */
  isReporting(): boolean {
    return this.reportInterval !== null;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * 获取或创建子应用指标对象
   * @param key 子应用唯一标识
   * @returns SubAppMetrics
   */
  private getOrCreate(key: string): SubAppMetrics {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        key,
        loadCount: 0,
        errorCount: 0,
        crashRate: 0,
        avgLoadTime: 0,
        avgSwitchTime: 0,
        p95LoadTime: 0,
        p99LoadTime: 0,
        memoryUsage: 0,
        circuitBreakerTripped: false,
        uptime: 0,
      });
    }
    return this.metrics.get(key)!;
  }

  /**
   * 计算平均值（从已排序数组）
   * @param sorted 数值数组（已排序）
   * @returns 平均值
   */
  private averageFromSorted(sorted: number[]): number {
    if (sorted.length === 0) return 0;
    const sum = sorted.reduce((a, b) => a + b, 0);
    return sum / sorted.length;
  }

  /**
   * 计算百分位数（从已排序数组）
   * @param sorted 数值数组（已排序）
   * @param p 百分位 (0-100)
   * @returns 百分位数值
   */
  private percentileFromSorted(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * 计算平均值（原始方法，保留兼容性）
   * @param values 数值数组
   * @returns 平均值
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }
}

/**
 * 创建默认的 ObservabilityManager 实例
 */
let defaultInstance: ObservabilityManager | null = null;

/**
 * 获取默认的 ObservabilityManager 实例
 * @param options 配置选项
 * @returns ObservabilityManager 实例
 */
export function getObservabilityManager(options?: ObservabilityOptions): ObservabilityManager {
  if (!defaultInstance) {
    defaultInstance = new ObservabilityManager(options);
  }
  return defaultInstance;
}

/**
 * 设置默认的 ObservabilityManager 实例
 * @param instance ObservabilityManager 实例
 */
export function setObservabilityManager(instance: ObservabilityManager): void {
  defaultInstance = instance;
}

export default ObservabilityManager;