/**
 * DOMAPIPatcher - DOM API 劫持模块
 *
 * 劫持关键 DOM API 实现沙箱隔离
 */

import type { SandboxProxy } from './Sandbox';

/**
 * DOMAPIPatcher 类
 * 劫持 DOM API 实现隔离
 */
export class DOMAPIPatcher {
  private patched = false;
  private originalMethods = new Map<string, Function>();
  private proxy: SandboxProxy | null = null;

  /**
   * 初始化劫持
   */
  initialize(proxy: SandboxProxy): void {
    if (this.patched) return;

    this.proxy = proxy;

    // 劫持 document.createElement
    if (typeof document !== 'undefined') {
      this.patchDocumentMethods();
    }

    // 劫持 Element.prototype 方法
    if (typeof Element !== 'undefined') {
      this.patchElementMethods();
    }

    this.patched = true;
  }

  /**
   * 劫持 document 方法
   */
  private patchDocumentMethods(): void {
    const doc = document;
    const self = this;

    this.wrapMethod(doc, 'createElement', function (...args: any[]) {
      const original = self.originalMethods.get('createElement');
      const element = original!.apply(doc, args);
      self.processElement(element);
      return element;
    });

    this.wrapMethod(doc, 'createElementNS', function (...args: any[]) {
      const original = self.originalMethods.get('createElementNS');
      const element = original!.apply(doc, args);
      self.processElement(element);
      return element;
    });
  }

  /**
   * 劫持 Element 方法
   */
  private patchElementMethods(): void {
    const proto = Element.prototype;
    const self = this;

    this.wrapMethod(proto, 'appendChild', function (this: Element, node: Node) {
      self.processNode(node);
      return self.originalMethods.get('appendChild')!.call(this, node);
    });
  }

  /**
   * 包装方法
   */
  private wrapMethod(obj: any, method: string, wrapper: Function): void {
    if (!this.originalMethods.has(method)) {
      this.originalMethods.set(method, obj[method]);
    }
    obj[method] = function (this: any, ...args: any[]) {
      return wrapper.apply(this, args);
    };
  }

  /**
   * 处理创建的元素
   */
  private processElement(element: Element): void {
    // 添加沙箱作用域标记，用于追踪和隔离
    if (this.proxy && element instanceof HTMLElement) {
      element.setAttribute('data-orionmf-sandbox', 'true');
    }
  }

  /**
   * 处理节点
   */
  private processNode(node: Node): void {
    if (node instanceof Element) {
      this.processElement(node);
    }
  }

  /**
   * 清理劫持
   */
  cleanup(): void {
    const doc = typeof document !== 'undefined' ? document : null;
    const proto = typeof Element !== 'undefined' ? Element.prototype : null;

    for (const [method, original] of this.originalMethods) {
      if (doc && (method === 'createElement' || method === 'createElementNS')) {
        (doc as any)[method] = original;
      } else if (proto) {
        (proto as any)[method] = original;
      }
    }

    this.originalMethods.clear();
    this.patched = false;
    this.proxy = null;
  }
}

// 单例实例
const domPatcher = new DOMAPIPatcher();

export default domPatcher;
