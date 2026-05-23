/**
 * OrionMF StyleIsolator Module - CSS Isolation using Shadow DOM
 *
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §3.3
 */

import type { IStyleIsolator, CSSIsolationMode } from './interface';

/**
 * StyleIsolator - CSS 样式隔离器
 *
 * Features:
 * - Shadow DOM based isolation (styles don't leak out)
 * - Dynamic style interception via MutationObserver
 * - CSS scope prefix for external style isolation
 * - Performance optimized with subtree: false
 * - Anti-duplicate processing with data-orion-scoped marker
 */
export class StyleIsolator implements IStyleIsolator {
  /** Registry of ShadowRoot instances by app key */
  private shadowRoots = new Map<string, ShadowRoot>();

  /** Registry of scoped containers by app key (for scoped-css mode) */
  private scopedContainers = new Map<string, HTMLElement>();

  /** Registry of MutationObserver instances by app key */
  private observers = new Map<string, MutationObserver>();

  /** Counter for generating unique scope IDs */
  private scopeCounter = 0;

  /**
   * Mount a micro app container with CSS isolation
   * @param key - Unique identifier for the micro app
   * @param container - HTML element to attach isolation to
   * @param mode - CSS isolation mode (default: 'shadow-dom')
   * @returns The created ShadowRoot or scoped HTMLElement
   */
  mount(key: string, container: HTMLElement, mode: CSSIsolationMode = 'shadow-dom'): ShadowRoot | HTMLElement {
    const scopeId = `orion-${key}`;
    container.setAttribute('data-orion-scope', scopeId);

    if (mode === 'scoped-css') {
      return this.mountScopedCSS(key, container, scopeId);
    }

    // Default: shadow-dom mode
    const shadowRoot = container.attachShadow({ mode: 'open' });
    this.shadowRoots.set(key, shadowRoot);

    // Setup dynamic style interception
    this.setupStyleObserver(key, shadowRoot);

    // Inject global style isolation patch
    this.injectIsolationPatch(shadowRoot);

    return shadowRoot;
  }

  /**
   * Mount in scoped-css mode (no Shadow DOM, CSS scope prefix only)
   *
   * Used for internal trusted apps that need Ant Design Modal/Notification
   * to work correctly (they mount to document.body, which breaks in Shadow DOM).
   */
  private mountScopedCSS(key: string, container: HTMLElement, scopeId: string): HTMLElement {
    this.scopedContainers.set(key, container);

    // Setup MutationObserver on the container to scope dynamically injected styles
    this.setupScopedStyleObserver(key, container, scopeId);

    // Inject a scope marker style
    this.injectScopedPatch(container, scopeId);

    return container;
  }

  /**
   * Unmount a micro app and cleanup resources
   * @param key - Unique identifier for the micro app
   */
  unmount(key: string): void {
    // Cleanup MutationObserver
    const observer = this.observers.get(key);
    if (observer) {
      observer.disconnect();
      this.observers.delete(key);
    }

    const shadowRoot = this.shadowRoots.get(key);
    if (shadowRoot) {
      // Remove the host element from DOM
      shadowRoot.host.remove();
      this.shadowRoots.delete(key);
    }

    // Cleanup scoped-css mode container marker
    const scopedContainer = this.scopedContainers.get(key);
    if (scopedContainer) {
      scopedContainer.removeAttribute('data-orion-scope');
      this.scopedContainers.delete(key);
    }
  }

  /**
   * Get ShadowRoot by app key
   * @param key - Unique identifier for the micro app
   * @returns The ShadowRoot or undefined if not found
   */
  getShadowRoot(key: string): ShadowRoot | undefined {
    return this.shadowRoots.get(key);
  }

  /**
   * Check if a key has been mounted
   * @param key - Unique identifier for the micro app
   * @returns true if mounted (shadow-dom or scoped-css)
   */
  isMounted(key: string): boolean {
    return this.shadowRoots.has(key) || this.scopedContainers.has(key);
  }

  /**
   * Setup MutationObserver to intercept dynamically injected styles
   * @param key - Unique identifier for the micro app
   * @param shadowRoot - ShadowRoot to observe
   */
  private setupStyleObserver(key: string, shadowRoot: ShadowRoot): void {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          this.interceptNewStyles(key, mutation.addedNodes);
        }
      }
    });

    // subtree: false - only listen to direct child nodes for performance
    observer.observe(shadowRoot, {
      childList: true,
      subtree: false,
    });

    this.observers.set(key, observer);
  }

  /**
   * Intercept newly added style nodes and scope them
   * @param key - Unique identifier for the micro app
   * @param nodes - NodeList of added nodes
   */
  private interceptNewStyles(key: string, nodes: NodeList): void {
    const scopeId = `orion-${key}`;

    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;

        // Process style elements
        if (element instanceof HTMLStyleElement) {
          this.scopeCSS(element, scopeId);
        }

        // Recursively handle nested Shadow DOMs
        if (element.shadowRoot) {
          this.interceptNewStyles(key, element.shadowRoot.childNodes);
        }
      }
    }
  }

  /**
   * Scope CSS content with scope prefix
   * @param styleEl - Style element to scope
   * @param scopeId - Scope ID to use as prefix
   */
  scopeCSS(styleEl: HTMLStyleElement, scopeId: string): void {
    const existingScopeId = styleEl.getAttribute('data-orion-scoped');

    // Already scoped for this exact scope - skip
    if (existingScopeId === scopeId) {
      return;
    }

    const css = styleEl.textContent || '';
    if (!css.trim()) {
      return;
    }

    // If previously scoped for a different scope, un-scope first
    // by removing the existing scope prefixes before re-scoping
    const baseCss = existingScopeId
      ? this.removeScopePrefix(css, existingScopeId)
      : css;

    const scopedCss = this.addScopePrefix(baseCss, scopeId);
    styleEl.textContent = scopedCss;
    styleEl.setAttribute('data-orion-scoped', scopeId);
  }

  /**
   * Remove scope prefix from CSS (for re-scoping scenarios)
   * @param css - Scoped CSS content
   * @param scopeId - Scope ID to remove
   * @returns Unscoped CSS content
   */
  private removeScopePrefix(css: string, scopeId: string): string {
    const scopePattern = `\\[data-orion-scope="${scopeId}"\\]\\s*`;
    return css.replace(new RegExp(scopePattern, 'g'), '');
  }

  /**
   * Add scope prefix to CSS selectors
   * @param css - Original CSS content
   * @param scopeId - Scope ID to use as prefix
   * @returns Scoped CSS content
   */
  addScopePrefix(css: string, scopeId: string): string {
    // Use a more sophisticated approach to handle nested braces
    // Process the CSS in a way that handles @media, @keyframes, etc.

    let result = '';
    let i = 0;

    while (i < css.length) {
      // Check for @ rules first (they start with @)
      if (css[i] === '@') {
        // Find the end of the @ rule
        // Some @ rules like @import have no braces
        const withoutBraceMatch = css.slice(i).match(/^@(import|charset|namespace)[^;]*;/);
        if (withoutBraceMatch) {
          result += withoutBraceMatch[0];
          i += withoutBraceMatch[0].length;
          continue;
        }

        // Find the matching closing brace
        const start = i;
        let braceCount = 0;
        let inString = false;
        let stringChar = '';

        while (i < css.length) {
          const char = css[i];

          // Handle strings (don't count braces inside strings)
          if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
          } else if (inString && char === stringChar && css[i - 1] !== '\\') {
            inString = false;
          }

          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                // Found the matching closing brace
                const ruleContent = css.slice(start, i + 1);
                // Recursively process the content inside @ rules
                result += this.processAtRuleContent(ruleContent, scopeId);
                i++;
                break;
              }
            }
          }
          i++;
        }
        continue;
      }

      // Find the next regular selector rule
      const selectorMatch = css.slice(i).match(/^([^{}]+)\{/);
      if (selectorMatch) {
        // Handle regular selector rules
        const selector = selectorMatch[1].trim();
        const start = i;
        i += selector.length + 1; // +1 for '{'

        // Find the matching closing brace
        let braceCount = 1;
        let inString = false;
        let stringChar = '';

        while (i < css.length && braceCount > 0) {
          const char = css[i];

          if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
          } else if (inString && char === stringChar && css[i - 1] !== '\\') {
            inString = false;
          }

          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
            }
          }
          i++;
        }

        const ruleContent = css.slice(start, i);
        const scopedRule = this.scopeSingleRule(ruleContent, scopeId);
        result += scopedRule;
      } else {
        // Non-rule content (comments, whitespace, etc.)
        result += css[i];
        i++;
      }
    }

    return result;
  }

  /**
   * Process content inside @ rules (media, keyframes, etc.)
   * @param ruleContent - Full @ rule content including braces
   * @param scopeId - Scope ID
   * @returns Processed content
   */
  private processAtRuleContent(ruleContent: string, scopeId: string): string {
    // Extract content between outer braces
    const outerBraceStart = ruleContent.indexOf('{');
    const outerBraceEnd = ruleContent.lastIndexOf('}');

    if (outerBraceStart === -1 || outerBraceEnd === -1) {
      return ruleContent;
    }

    const atKeyword = ruleContent.slice(0, outerBraceStart).trim();
    const innerContent = ruleContent.slice(outerBraceStart + 1, outerBraceEnd);

    // Check if this @ rule contains selectors that need scoping
    // @font-face, @import, @charset, @namespace don't have selectors
    // @supports DOES have selectors inside it (e.g., @supports (display: grid) { .card {} })
    const atRulesWithoutSelectors = ['@font-face', '@import', '@charset', '@namespace'];
    const needsScoping = !atRulesWithoutSelectors.some(rule =>
      atKeyword.toLowerCase().startsWith(rule.toLowerCase())
    );

    if (!needsScoping) {
      // Preserve @ rules without selectors as-is
      return ruleContent;
    }

    // Process the inner content (might contain nested rules or selectors)
    const processedInner = this.addScopePrefix(innerContent, scopeId);

    return `${atKeyword} { ${processedInner} }`;
  }

  /**
   * Scope a single CSS rule
   * @param rule - Single CSS rule (selector { properties })
   * @param scopeId - Scope ID
   * @returns Scoped rule
   */
  private scopeSingleRule(rule: string, scopeId: string): string {
    const braceIndex = rule.indexOf('{');
    if (braceIndex === -1) {
      return rule;
    }

    const selector = rule.slice(0, braceIndex).trim();
    const rules = rule.slice(braceIndex + 1, -1).trim();

    // Handle multiple selectors (comma separated)
    const scopedSelectors = selector
      .split(',')
      .map((s: string) => s.trim())
      .map((s: string) => {
        // :host selector doesn't need modification
        if (s.includes(':host')) {
          return s;
        }

        // Handle body/html/:root special selectors
        if (s === 'body' || s === 'html' || s === ':root') {
          return `[data-orion-scope="${scopeId}"]`;
        }

        // Handle :host-context() pseudo-class
        if (s.includes(':host-context')) {
          return s;
        }

        // Handle CSS Nesting (&) — replace & with the scope selector
        if (s.includes('&')) {
          return s.replace(/&/g, `[data-orion-scope="${scopeId}"]`);
        }

        // Regular selector - add scope prefix
        return `[data-orion-scope="${scopeId}"] ${s}`;
      })
      .join(', ');

    return `${scopedSelectors} { ${rules} }`;
  }

  /**
   * Inject global style isolation patch into Shadow DOM
   * This helps handle edge cases like imported stylesheets
   * @param shadowRoot - ShadowRoot to inject patch into
   */
  private injectIsolationPatch(shadowRoot: ShadowRoot): void {
    const patchStyle = document.createElement('style');
    patchStyle.textContent = `
      /* OrionMF Style Isolation Patch */
      /* Reset layout and box-model properties while preserving inherited typography */

      [data-orion-scope] {
        all: revert;
        box-sizing: border-box;
      }

      [data-orion-scope] * {
        box-sizing: border-box;
      }
    `;
    patchStyle.setAttribute('data-orion-patch', 'true');
    shadowRoot.appendChild(patchStyle);
  }

  /**
   * Setup MutationObserver on container for scoped-css mode
   * Intercepts dynamically injected <style> tags and scopes them
   */
  private setupScopedStyleObserver(key: string, container: HTMLElement, scopeId: string): void {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          this.interceptNewStylesScoped(key, mutation.addedNodes, scopeId);
        }
      }
    });

    // Observe the container for dynamically injected style tags
    // Also observe document.head for global style injections (e.g., Ant Design runtime styles)
    observer.observe(container, { childList: true, subtree: true });

    this.observers.set(key, observer);
  }

  /**
   * Intercept newly added style nodes in scoped-css mode
   */
  private interceptNewStylesScoped(key: string, nodes: NodeList, scopeId: string): void {
    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;

        if (element instanceof HTMLStyleElement) {
          this.scopeCSS(element, scopeId);
        }

        // Recursively handle nested Shadow DOMs
        if (element.shadowRoot) {
          this.interceptNewStylesScoped(key, element.shadowRoot.childNodes, scopeId);
        }
      }
    }
  }

  /**
   * Inject scope marker style for scoped-css mode
   * This provides a CSS hook for prefix-based scoping
   */
  private injectScopedPatch(container: HTMLElement, scopeId: string): void {
    const patchStyle = document.createElement('style');
    patchStyle.textContent = `
      /* OrionMF Scoped CSS Patch */
      /* Scoped mode: styles are prefixed but can leak to/from main app */
      [data-orion-scope="${scopeId}"] {
        box-sizing: border-box;
      }

      [data-orion-scope="${scopeId}"] * {
        box-sizing: border-box;
      }
    `;
    patchStyle.setAttribute('data-orion-patch', 'true');
    patchStyle.setAttribute('data-orion-mode', 'scoped');
    container.appendChild(patchStyle);
  }

  /**
   * Generate a unique scope ID
   * @param key - Base key for the scope
   * @returns Unique scope ID
   */
  generateScopeId(key: string): string {
    this.scopeCounter++;
    return `orion-${key}-${this.scopeCounter}`;
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    // Disconnect all observers
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();

    // Clear shadow roots registry
    this.shadowRoots.clear();

    // Clear scoped containers registry
    this.scopedContainers.clear();

    this.scopeCounter = 0;
  }
}

// ============================================================================
// Export
// ============================================================================

export type { StyleIsolator as IStyleIsolator };