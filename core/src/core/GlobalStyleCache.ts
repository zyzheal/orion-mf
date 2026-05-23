/**
 * GlobalStyleCache - 全局样式缓存模块
 *
 * 记录每个子应用自己新增的样式元素，卸载时精确移除
 */

/**
 * 子应用样式记录
 */
interface AppStyleRecord {
  /** 该子应用新增的 style 元素 ID 集合 */
  addedStyleIds: Set<string>;
  /** 该子应用新增的 link 元素 ID 集合 */
  addedLinkIds: Set<string>;
  /** 快照时已存在的 style ID（内部使用） */
  _existingStyleIds?: Set<string>;
  /** 快照时已存在的 link ID（内部使用） */
  _existingLinkIds?: Set<string>;
}

/**
 * GlobalStyleCache 类
 * 管理每个子应用新增的全局样式
 */
export class GlobalStyleCache {
  private records = new Map<string, AppStyleRecord>();
  private nextId = 0;

  /**
   * 记录页面样式快照
   * 在子应用挂载时调用，标记当前已存在的样式
   */
  recordStyles(appKey: string): void {
    if (typeof document === 'undefined') return;

    // 为所有现有 style 元素标记 ID
    document.querySelectorAll('style').forEach((el) => {
      this.ensureStyleId(el);
    });

    // 为所有现有 link 元素标记 ID
    document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
      this.ensureLinkId(el);
    });

    // 记录当前已存在的 ID 集合
    const existingStyleIds = new Set<string>();
    document.querySelectorAll('style[data-orionmf-style-id]').forEach((el) => {
      existingStyleIds.add(el.getAttribute('data-orionmf-style-id')!);
    });

    const existingLinkIds = new Set<string>();
    document.querySelectorAll('link[rel="stylesheet"][data-orionmf-link-id]').forEach((el) => {
      existingLinkIds.add(el.getAttribute('data-orionmf-link-id')!);
    });

    this.records.set(appKey, {
      addedStyleIds: new Set(),
      addedLinkIds: new Set(),
      _existingStyleIds: existingStyleIds,
      _existingLinkIds: existingLinkIds,
    });
  }

  /**
   * 追踪并记录该子应用新增的样式
   * 在子应用挂载后调用，记录该子应用期间新增的样式
   */
  trackAddedStyles(appKey: string): void {
    if (typeof document === 'undefined') return;

    const record = this.records.get(appKey);
    if (!record) return;

    // 找出新增的 style 元素
    document.querySelectorAll('style[data-orionmf-style-id]').forEach((el) => {
      const id = el.getAttribute('data-orionmf-style-id')!;
      if (!record._existingStyleIds?.has(id)) {
        record.addedStyleIds.add(id);
      }
    });

    // 找出新增的 link 元素
    document.querySelectorAll('link[rel="stylesheet"][data-orionmf-link-id]').forEach((el) => {
      const id = el.getAttribute('data-orionmf-link-id')!;
      if (!record._existingLinkIds?.has(id)) {
        record.addedLinkIds.add(id);
      }
    });
  }

  /**
   * 恢复全局样式
   * 在子应用卸载时调用，只移除该子应用新增的样式
   */
  restoreStyles(appKey: string): void {
    if (typeof document === 'undefined') return;

    const record = this.records.get(appKey);
    if (!record) return;

    // 只移除该子应用新增的 style 标签
    record.addedStyleIds.forEach((id) => {
      const style = document.querySelector(`style[data-orionmf-style-id="${id}"]`);
      if (style) style.remove();
    });

    // 只移除该子应用新增的 link 标签
    record.addedLinkIds.forEach((id) => {
      const link = document.querySelector(`link[data-orionmf-link-id="${id}"]`);
      if (link) link.remove();
    });

    this.records.delete(appKey);
  }

  /**
   * 确保 style 元素有 ID
   */
  private ensureStyleId(el: Element): void {
    if (!el.getAttribute('data-orionmf-style-id')) {
      el.setAttribute('data-orionmf-style-id', `style-${this.nextId++}`);
    }
  }

  /**
   * 确保 link 元素有 ID
   */
  private ensureLinkId(el: Element): void {
    if (!el.getAttribute('data-orionmf-link-id')) {
      el.setAttribute('data-orionmf-link-id', `link-${this.nextId++}`);
    }
  }

  /**
   * 清理特定子应用的样式缓存
   */
  cleanup(appKey: string): void {
    this.records.delete(appKey);
  }

  /**
   * 清理所有缓存
   */
  reset(): void {
    this.records.clear();
  }

  /**
   * 获取缓存的记录数量
   */
  getSize(): number {
    return this.records.size;
  }
}

// 单例实例
const globalStyleCache = new GlobalStyleCache();

export default globalStyleCache;
