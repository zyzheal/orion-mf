/**
 * ReactRefreshDetector - React Hot Reload 检测模块
 *
 * 确保 React Hot Reload 在每个子应用中独立运行
 */

/**
 * ReactRefreshDetector 类
 * 用于管理多个子应用的 React Refresh 状态
 */
export class ReactRefreshDetector {
  private injectedApps = new Set<string>();

  /**
   * 标记子应用已注入 React Refresh
   */
  markInjected(appKey: string): void {
    this.injectedApps.add(appKey);
  }

  /**
   * 检查子应用是否已注入
   */
  isInjected(appKey: string): boolean {
    return this.injectedApps.has(appKey);
  }

  /**
   * 清理子应用的 React Refresh 状态
   */
  cleanup(appKey: string): void {
    this.injectedApps.delete(appKey);
  }

  /**
   * 清理所有状态
   */
  reset(): void {
    this.injectedApps.clear();
  }
}

// 单例实例
const reactRefreshDetector = new ReactRefreshDetector();

/**
 * 标记子应用已注入 React Refresh（单例便捷方法）
 */
export function detectReactRefresh(appKey: string): void {
  reactRefreshDetector.markInjected(appKey);
}

/**
 * 检查子应用是否已注入 React Refresh（单例便捷方法）
 */
export function isReactRefreshInjected(appKey: string): boolean {
  return reactRefreshDetector.isInjected(appKey);
}

export default reactRefreshDetector;
