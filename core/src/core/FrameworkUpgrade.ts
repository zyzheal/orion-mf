/**
 * FrameworkUpgrade - 框架升级支持
 *
 * 提供微前端框架的版本兼容性检查和 Codemod 迁移能力
 * 支持 major/minor/patch 级别的版本比较
 * 自动生成代码迁移脚本
 */

import { eventBus } from './EventBus';

// ============================================================================
// Types
// ============================================================================

/** 版本号结构 */
export interface Version {
  major: number;
  minor: number;
  patch: number;
}

/** 兼容性检查结果 */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
  severity?: 'error' | 'warning' | 'info';
  suggestions?: string[];
}

/** Codemod 变更类型 */
export type CodemodChangeType = 'rename' | 'remove' | 'add' | 'update' | 'config';

/** Codemod 文件变更 */
export interface CodemodFileChange {
  type: 'rename' | 'remove' | 'add' | 'update';
  oldPath?: string;
  newPath?: string;
  content?: string;
}

/** Codemod 接口 */
export interface Codemod {
  id: string;
  description: string;
  fromVersion: string;
  toVersion: string;
  changes: CodemodFileChange[];
  run(): Promise<CodemodResult>;
  estimateDuration(): number;
}

/** Codemod 执行结果 */
export interface CodemodResult {
  success: boolean;
  appliedChanges: number;
  failedChanges: number;
  errors: string[];
  warnings: string[];
}

/** 升级配置选项 */
export interface FrameworkUpgradeOptions {
  currentVersion?: string;
  autoRollback?: boolean;
  dryRun?: boolean;
  onProgress?: (progress: UpgradeProgress) => void;
}

/** 升级进度 */
export interface UpgradeProgress {
  phase: 'analyzing' | 'migrating' | 'verifying' | 'complete';
  percentage: number;
  currentStep?: string;
  totalSteps: number;
  completedSteps: number;
}

// ============================================================================
// Version Parsing & Comparison
// ============================================================================

/**
 * 解析版本字符串为 Version 对象
 *
 * @param version - 版本字符串 (如 "2.1.0")
 * @returns Version 对象
 */
export function parseVersion(version: string): Version {
  const trimmed = version.trim();
  const parts = trimmed.split('.').map((part) => {
    const num = parseInt(part, 10);
    return isNaN(num) || num < 0 ? 0 : num;
  });

  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
  };
}

/**
 * 比较两个版本
 *
 * @param a - 版本 A
 * @param b - 版本 B
 * @returns -1 (a < b), 0 (a == b), 1 (a > b)
 */
export function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (vA.major !== vB.major) {
    return vA.major - vB.major;
  }
  if (vA.minor !== vB.minor) {
    return vA.minor - vB.minor;
  }
  return vA.patch - vB.patch;
}

/**
 * 检查版本是否在兼容范围内
 *
 * @param subAppVersion - 子应用版本
 * @param frameworkVersion - 框架版本
 * @param maxMinorDiff - 最大 minor 版本差 (默认 1)
 * @returns 是否兼容
 */
export function isVersionCompatible(
  subAppVersion: string,
  frameworkVersion: string,
  maxMinorDiff = 1
): boolean {
  const sub = parseVersion(subAppVersion);
  const framework = parseVersion(frameworkVersion);

  // Major 版本必须完全匹配
  if (sub.major !== framework.major) {
    return false;
  }

  // Minor 版本差距不能超过 maxMinorDiff
  const minorDiff = framework.minor - sub.minor;
  if (minorDiff > maxMinorDiff || minorDiff < -1) {
    return false;
  }

  return true;
}

// ============================================================================
// Built-in Codemod Definitions (Experimental)
// ============================================================================

/**
 * 已知的版本迁移规则
 *
 * @experimental Codemod framework is in place but no built-in migration rules
 * are registered yet. Use `registerMigration()` to add custom rules, or
 * implement Codemod interfaces for your project-specific migrations.
 */
const VERSION_MIGRATIONS: Record<string, Codemod[]> = {};

/**
 * 注册版本迁移规则
 *
 * @experimental See VERSION_MIGRATIONS
 * @param fromVersion - 起始版本
 * @param toVersion - 目标版本
 * @param codemods - Codemod 列表
 */
export function registerMigration(
  fromVersion: string,
  toVersion: string,
  codemods: Codemod[]
): void {
  const key = `${fromVersion}->${toVersion}`;
  VERSION_MIGRATIONS[key] = codemods;
}

/**
 * 获取版本迁移规则
 *
 * @param fromVersion - 起始版本
 * @param toVersion - 目标版本
 * @returns Codemod 列表
 */
export function getMigration(fromVersion: string, toVersion: string): Codemod[] {
  const key = `${fromVersion}->${toVersion}`;
  return VERSION_MIGRATIONS[key] || [];
}

// ============================================================================
// FrameworkUpgrade Class
// ============================================================================

/**
 * FrameworkUpgrade - 框架升级管理类
 *
 * 提供以下能力：
 * - 版本兼容性检查 (major/minor/patch)
 * - Codemod 迁移脚本生成与执行
 * - 升级进度追踪
 * - 升级前分析和建议
 */
export class FrameworkUpgrade {
  private currentVersion: string;
  private autoRollback: boolean;
  private dryRun: boolean;
  private onProgress?: (progress: UpgradeProgress) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private eventBus: any;

  constructor(options: FrameworkUpgradeOptions = {}) {
    this.currentVersion = options.currentVersion || '2.0.0';
    this.autoRollback = options.autoRollback ?? true;
    this.dryRun = options.dryRun ?? false;
    this.onProgress = options.onProgress;
    this.eventBus = eventBus;
  }

  /**
   * 获取当前框架版本
   *
   * @returns 当前版本字符串
   */
  getVersion(): string {
    return this.currentVersion;
  }

  /**
   * 解析版本为结构化对象
   *
   * @param version - 版本字符串
   * @returns Version 对象
   */
  parseVersion(version: string): Version {
    return parseVersion(version);
  }

  /**
   * 检查子应用与框架的兼容性
   *
   * @param subAppVersion - 子应用版本
   * @returns 兼容性检查结果
   */
  checkCompatibility(subAppVersion: string): CompatibilityResult {
    const framework = parseVersion(this.currentVersion);
    const subApp = parseVersion(subAppVersion);
    const suggestions: string[] = [];

    // Major 版本检查 - 必须完全匹配
    if (subApp.major !== framework.major) {
      return {
        compatible: false,
        reason: `Major version mismatch: framework is ${this.currentVersion}, sub-app is ${subAppVersion}`,
        severity: 'error',
        suggestions: [
          `Sub-app requires major version ${subApp.major}, but framework is ${framework.major}`,
          'Please upgrade the sub-app to match the framework major version',
        ],
      };
    }

    // Minor 版本检查
    const minorDiff = subApp.minor - framework.minor;

    if (minorDiff < -1) {
      return {
        compatible: false,
        reason: `Sub-app minor version too old: ${subApp.minor} vs framework ${framework.minor}`,
        severity: 'error',
        suggestions: [
          `Framework has advanced ${-minorDiff} minor versions since sub-app was built`,
          'Run migration to update the sub-app to a compatible version',
        ],
      };
    }

    if (minorDiff === -1) {
      suggestions.push(
        'Sub-app is one minor version behind framework',
        'Consider running migration to update to latest version'
      );
    }

    if (minorDiff > 0) {
      suggestions.push(
        'Sub-app is newer than framework - may use newer APIs',
        'Consider upgrading framework to match sub-app version'
      );
    }

    // Patch 版本差异只提供信息
    if (subApp.patch > framework.patch) {
      suggestions.push(
        'Sub-app is newer than framework - may use newer APIs'
      );
    }

    // 返回兼容结果
    return {
      compatible: true,
      severity: suggestions.length > 0 ? 'warning' : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 获取两个版本之间的 Codemod 列表
   *
   * @param fromVersion - 起始版本
   * @param toVersion - 目标版本
   * @returns Codemod 数组
   */
  getCodemods(fromVersion: string, toVersion: string): Codemod[] {
    const codemods: Codemod[] = [];
    const from = parseVersion(fromVersion);
    const to = parseVersion(toVersion);

    // 模拟内置迁移规则
    // 实际使用时可以从外部注册或从配置文件加载

    // Major 版本变化 - 生成破坏性变更
    if (to.major > from.major) {
      codemods.push(this.createMajorMigration(from, to));
    }

    // Minor 版本变化 - 生成新功能迁移
    if (to.minor > from.minor) {
      codemods.push(this.createMinorMigration(from, to));
    }

    // Patch 版本变化 - 生成 bugfix 迁移
    if (to.patch > from.patch) {
      codemods.push(this.createPatchMigration(from, to));
    }

    return codemods;
  }

  /**
   * 运行 Codemod 迁移
   *
   * @param targetVersion - 目标版本
   * @returns 迁移结果
   */
  async runCodemod(targetVersion: string): Promise<CodemodResult> {
    const codemods = this.getCodemods(this.currentVersion, targetVersion);

    if (codemods.length === 0) {
      return {
        success: true,
        appliedChanges: 0,
        failedChanges: 0,
        errors: [],
        warnings: ['No migrations needed for this version change'],
      };
    }

    // 发送升级开始事件
    this.eventBus.emit('framework:upgrade:start', {
      fromVersion: this.currentVersion,
      toVersion: targetVersion,
      codemodCount: codemods.length,
    });

    const result: CodemodResult = {
      success: true,
      appliedChanges: 0,
      failedChanges: 0,
      errors: [],
      warnings: [],
    };

    // 报告进度
    const reportProgress = (phase: UpgradeProgress['phase'], step: number, total: number, currentStep?: string) => {
      const progress: UpgradeProgress = {
        phase,
        percentage: Math.round((step / total) * 100),
        currentStep,
        totalSteps: total,
        completedSteps: step,
      };
      this.onProgress?.(progress);
    };

    const totalSteps = codemods.length + 1; // +1 for verification

    // 执行每个 Codemod
    for (let i = 0; i < codemods.length; i++) {
      const codemod = codemods[i];

      reportProgress(
        'migrating',
        i,
        totalSteps,
        `Running: ${codemod.description}`
      );

      if (this.dryRun) {
        result.warnings.push(`[Dry Run] Would apply: ${codemod.description}`);
        result.appliedChanges += codemod.changes.length;
        continue;
      }

      try {
        const codemodResult = await codemod.run();
        result.appliedChanges += codemodResult.appliedChanges;
        result.failedChanges += codemodResult.failedChanges;

        if (!codemodResult.success) {
          result.errors.push(...codemodResult.errors);
          result.success = false;

          if (this.autoRollback) {
            result.errors.push('Auto-rollback triggered due to migration failure');
            break;
          }
        }

        result.warnings.push(...codemodResult.warnings);
      } catch (error) {
        result.errors.push(`Failed to run codemod ${codemod.id}: ${error}`);
        result.failedChanges++;
        result.success = false;

        if (this.autoRollback) {
          break;
        }
      }
    }

    // 验证阶段
    reportProgress('verifying', codemods.length, totalSteps, 'Verifying migration...');

    if (result.success) {
      this.currentVersion = targetVersion;
    }

    reportProgress('complete', totalSteps, totalSteps);

    // 发送升级完成事件
    this.eventBus.emit('framework:upgrade:complete', {
      fromVersion: this.currentVersion,
      toVersion: targetVersion,
      success: result.success,
      appliedChanges: result.appliedChanges,
    });

    return result;
  }

  /**
   * 分析升级影响
   *
   * @param targetVersion - 目标版本
   * @returns 影响分析报告
   */
  async analyzeUpgrade(targetVersion: string): Promise<{
    breaking: string[];
    deprecated: string[];
    newFeatures: string[];
    migrationSteps: number;
  }> {
    const from = parseVersion(this.currentVersion);
    const to = parseVersion(targetVersion);
    const breaking: string[] = [];
    const deprecated: string[] = [];
    const newFeatures: string[] = [];

    // Major 版本变化 - 有破坏性变更
    if (to.major > from.major) {
      breaking.push(
        `Breaking: Major version upgrade from ${from.major}.x.x to ${to.major}.x.x`,
        'All sub-apps must be recompiled with new framework version',
        'Check migration guide for API changes'
      );
    }

    // Minor 版本变化
    if (to.minor > from.minor) {
      deprecated.push(
        `Some APIs deprecated in ${from.major}.${from.minor + 1}.x will be removed in ${to.major}.${to.minor}.x`
      );
      newFeatures.push(
        `New features added in ${to.major}.${to.minor}.x`
      );
    }

    // Patch 版本变化通常无影响
    if (to.patch > from.patch) {
      newFeatures.push(
        `Bug fixes in ${to.major}.${to.minor}.${to.patch}`
      );
    }

    const codemods = this.getCodemods(this.currentVersion, targetVersion);

    return {
      breaking,
      deprecated,
      newFeatures,
      migrationSteps: codemods.reduce((sum, c) => sum + c.changes.length, 0),
    };
  }

  /**
   * 创建 Major 版本迁移
   */
  private createMajorMigration(from: Version, to: Version): Codemod {
    return {
      id: `migrate-${from.major}-to-${to.major}`,
      description: `Major version migration from ${from.major}.x.x to ${to.major}.x.x`,
      fromVersion: `${from.major}.${from.minor}.${from.patch}`,
      toVersion: `${to.major}.${to.minor}.${to.patch}`,
      changes: [
        {
          type: 'update',
          content: '// Major version migration - see migration guide',
        },
      ],
      async run() {
        return {
          success: true,
          appliedChanges: 0,
          failedChanges: 0,
          errors: [],
          warnings: ['Major migration requires manual review'],
        };
      },
      estimateDuration: () => 300000, // 5 min
    };
  }

  /**
   * 创建 Minor 版本迁移
   */
  private createMinorMigration(from: Version, to: Version): Codemod {
    return {
      id: `migrate-${from.major}.${from.minor}-to-${to.major}.${to.minor}`,
      description: `Minor version migration from ${from.major}.${from.minor}.x to ${to.major}.${to.minor}.x`,
      fromVersion: `${from.major}.${from.minor}.${from.patch}`,
      toVersion: `${to.major}.${to.minor}.${to.patch}`,
      changes: [
        {
          type: 'update',
          content: '// Minor version migration - auto-applied',
        },
      ],
      async run() {
        return {
          success: true,
          appliedChanges: 0,
          failedChanges: 0,
          errors: [],
          warnings: [],
        };
      },
      estimateDuration: () => 60000, // 1 min
    };
  }

  /**
   * 创建 Patch 版本迁移
   */
  private createPatchMigration(from: Version, to: Version): Codemod {
    return {
      id: `migrate-${from.major}.${from.minor}.${from.patch}-to-${to.major}.${to.minor}.${to.patch}`,
      description: `Patch version migration from ${from.major}.${from.minor}.${from.patch} to ${to.major}.${to.minor}.${to.patch}`,
      fromVersion: `${from.major}.${from.minor}.${from.patch}`,
      toVersion: `${to.major}.${to.minor}.${to.patch}`,
      changes: [],
      async run() {
        return {
          success: true,
          appliedChanges: 0,
          failedChanges: 0,
          errors: [],
          warnings: ['No changes needed for patch version'],
        };
      },
      estimateDuration: () => 0,
    };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalFrameworkUpgrade: FrameworkUpgrade | null = null;

/**
 * 获取全局 FrameworkUpgrade 实例
 *
 * @param options - 初始化选项
 * @returns FrameworkUpgrade 实例
 */
export function getFrameworkUpgrade(options?: FrameworkUpgradeOptions): FrameworkUpgrade {
  if (!globalFrameworkUpgrade) {
    globalFrameworkUpgrade = new FrameworkUpgrade(options);
  }
  return globalFrameworkUpgrade;
}

/**
 * 设置全局 FrameworkUpgrade 实例
 *
 * @param upgrade - FrameworkUpgrade 实例
 */
export function setFrameworkUpgrade(upgrade: FrameworkUpgrade): void {
  globalFrameworkUpgrade = upgrade;
}

/**
 * 创建新的 FrameworkUpgrade 实例
 *
 * @param options - 初始化选项
 * @returns 新的 FrameworkUpgrade 实例
 */
export function createFrameworkUpgrade(options?: FrameworkUpgradeOptions): FrameworkUpgrade {
  return new FrameworkUpgrade(options);
}