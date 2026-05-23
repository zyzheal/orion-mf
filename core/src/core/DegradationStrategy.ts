/**
 * OrionMF DegradationStrategy Module - Four-Level Degradation Strategy
 *
 * Implements graceful degradation for micro-frontend loading:
 * - Level 1: Full mode (MF + Proxy + Shadow DOM)
 * - Level 2: Compatible mode (MF + Proxy, no Shadow DOM)
 * - Level 3: iframe mode (full isolation)
 * - Level 4: Fallback (static placeholder)
 *
 * Reference: docs/superpowers/specs/2026-05-20-orionmf-v2-design.md §4.3
 */

import { MFSandboxBridge } from './MFSandboxBridge';
import type { SubAppConfig, SubAppInstance } from './MFSandboxBridge';

// ============================================================================
// Type Definitions
// ============================================================================

/** Degradation level enumeration */
export enum DegradationLevel {
  /** Full mode: MF + Proxy + Shadow DOM */
  Full = 'Full',
  /** Compatible mode: MF + Proxy, no Shadow DOM */
  Compatible = 'Compatible',
  /** iframe mode: full isolation */
  Iframe = 'Iframe',
  /** Fallback: static placeholder */
  Fallback = 'Fallback',
}

/** Degradation event */
export interface DegradationEvent {
  /** Original error that triggered degradation */
  error: Error;
  /** Level that failed */
  failedLevel: DegradationLevel;
  /** Level that succeeded */
  succeededLevel: DegradationLevel;
}

/** DegradationStrategy configuration */
export interface DegradationConfig {
  /** Enable/disable degradation */
  enabled?: boolean;
  /** Start from a specific level (skip higher levels) */
  startLevel?: DegradationLevel;
  /** Callback when degradation occurs */
  onDegrade?: (event: DegradationEvent) => void;
  /** Container element for fallback/iframe */
  container?: HTMLElement;
  /** Custom fallback renderer */
  renderFallback?: (config: SubAppConfig) => HTMLElement;
}

// ============================================================================
// DegradationStrategy Class
// ============================================================================

/**
 * DegradationStrategy - Four-level degradation for micro-frontend loading
 *
 * Automatically falls back to lower levels if loading fails at any level.
 * This ensures the application remains functional even if advanced features fail.
 */
export class DegradationStrategy {
  /** MFSandboxBridge instance */
  private bridge: MFSandboxBridge;

  /** Current degradation level */
  private currentLevel: DegradationLevel = DegradationLevel.Full;

  /** Configuration */
  private config: Required<DegradationConfig>;

  /** Track which level was used for each sub-app */
  private levelTracker = new Map<string, DegradationLevel>();

  /** Track iframe elements for cleanup */
  private iframeTracker = new Map<string, HTMLIFrameElement>();

  /**
   * Create a new DegradationStrategy
   *
   * @param bridge - MFSandboxBridge instance
   * @param config - Configuration options
   */
  constructor(bridge: MFSandboxBridge, config: DegradationConfig = {}) {
    this.bridge = bridge;
    this.config = {
      enabled: config.enabled ?? true,
      startLevel: config.startLevel ?? DegradationLevel.Full,
      onDegrade: config.onDegrade ?? (() => {}),
      container: config.container ?? document.body,
      renderFallback: config.renderFallback ?? this.defaultRenderFallback,
    };
  }

  /**
   * Load a sub-app with automatic degradation
   *
   * @param config - Sub-app configuration
   * @returns Loaded sub-app instance
   */
  async loadSubApp(config: SubAppConfig): Promise<SubAppInstance> {
    if (!this.config.enabled) {
      // Degradation disabled, use bridge directly
      return this.bridge.loadSubApp(config);
    }

    // Determine starting level
    const startLevel = this.getStartLevel();
    const startPriority = this.getLevelPriority(startLevel);
    console.info(`[Degradation] Starting from level: ${startLevel}`);

    // Level 1: Full mode (MF + Proxy + Shadow DOM)
    if (startPriority <= this.getLevelPriority(DegradationLevel.Full)) {
      try {
        const instance = await this.loadFull(config);
        this.setLevel(config.key, DegradationLevel.Full);
        return instance;
      } catch (error) {
        console.warn(`[Degradation] Full mode failed, trying compatible...`, error);
        this.handleDegradation(error as Error, DegradationLevel.Full, DegradationLevel.Compatible);
      }
    }

    // Level 2: Compatible mode (MF + Proxy, no Shadow DOM)
    if (startPriority <= this.getLevelPriority(DegradationLevel.Compatible)) {
      try {
        const instance = await this.loadCompatible(config);
        this.setLevel(config.key, DegradationLevel.Compatible);
        return instance;
      } catch (error) {
        console.warn(`[Degradation] Compatible mode failed, trying iframe...`, error);
        this.handleDegradation(error as Error, DegradationLevel.Compatible, DegradationLevel.Iframe);
      }
    }

    // Level 3: iframe mode (full isolation)
    if (startPriority <= this.getLevelPriority(DegradationLevel.Iframe)) {
      try {
        const instance = await this.loadIframe(config);
        this.setLevel(config.key, DegradationLevel.Iframe);
        return instance;
      } catch (error) {
        console.warn(`[Degradation] iframe mode failed, using fallback...`, error);
        this.handleDegradation(error as Error, DegradationLevel.Iframe, DegradationLevel.Fallback);
      }
    }

    // Level 4: Fallback (static placeholder)
    const instance = this.loadFallback(config);
    this.setLevel(config.key, DegradationLevel.Fallback);
    return instance;
  }

  /**
   * Get the starting degradation level
   */
  private getStartLevel(): DegradationLevel {
    return this.config.startLevel ?? DegradationLevel.Full;
  }

  /**
   * Get priority number for a degradation level (lower = higher priority)
   */
  private getLevelPriority(level: DegradationLevel): number {
    const priorityMap: Record<DegradationLevel, number> = {
      [DegradationLevel.Full]: 1,
      [DegradationLevel.Compatible]: 2,
      [DegradationLevel.Iframe]: 3,
      [DegradationLevel.Fallback]: 4,
    };
    return priorityMap[level];
  }

  /**
   * Set the degradation level for a sub-app
   */
  private setLevel(key: string, level: DegradationLevel): void {
    this.currentLevel = level;
    this.levelTracker.set(key, level);
  }

  /**
   * Handle degradation event
   */
  private handleDegradation(
    error: Error,
    failedLevel: DegradationLevel,
    succeededLevel: DegradationLevel
  ): void {
    this.config.onDegrade({
      error,
      failedLevel,
      succeededLevel,
    });
  }

  /**
   * Level 1: Full mode - MF + Proxy + Shadow DOM
   *
   * @param config - Sub-app configuration
   * @returns Sub-app instance
   */
  private async loadFull(config: SubAppConfig): Promise<SubAppInstance> {
    return this.bridge.loadSubApp({
      ...config,
      noShadowDOM: false,
    });
  }

  /**
   * Level 2: Compatible mode - MF + Proxy, no Shadow DOM
   *
   * @param config - Sub-app configuration
   * @returns Sub-app instance
   */
  private async loadCompatible(config: SubAppConfig): Promise<SubAppInstance> {
    return this.bridge.loadSubApp({
      ...config,
      noShadowDOM: true,
    });
  }

  /**
   * Level 3: iframe mode - completely isolated
   *
   * @param config - Sub-app configuration
   * @returns Sub-app instance with iframe root
   */
  private async loadIframe(config: SubAppConfig): Promise<SubAppInstance> {
    const container = this.config.container ?? document.body;

    // Determine entry URL - prefer HTML entry, fall back to remoteEntry
    // remoteEntry is a JS bundle, not suitable for direct iframe loading
    const entryUrl = config.entry_prod || config.entry_dev;
    if (!entryUrl) {
      throw new Error(
        `[Degradation] iframe mode requires an HTML entry (entry_dev or entry_prod). ` +
        `remoteEntry (${config.remoteEntry}) is a JS bundle and cannot be loaded directly in iframe.`
      );
    }

    // Create iframe element
    const iframe = document.createElement('iframe');
    iframe.src = entryUrl;
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    // Set ID for tracking
    const iframeId = `orion-mf-iframe-${config.key}`;
    iframe.id = iframeId;

    // Append to container
    container.appendChild(iframe);

    // Track iframe for cleanup
    this.iframeTracker.set(config.key, iframe);

    // Create instance with iframe as root
    const instance: SubAppInstance = {
      key: config.key,
      root: iframe,
      sandbox: this.createIframeSandbox(iframe),
      lifecycle: {
        mount: () => {
          console.info(`[Degradation] iframe mode: ${config.name} mounted`);
        },
        unmount: () => {
          console.info(`[Degradation] iframe mode: ${config.name} unmounted`);
        },
      },
      destroy: () => this.destroyIframe(config.key),
    };

    console.info(`[Degradation] iframe mode: ${config.name} loaded`);

    return instance;
  }

  /**
   * Create a minimal sandbox proxy for iframe mode
   *
   * Since iframe has its own global context, we provide a lightweight proxy
   */
  private createIframeSandbox(iframe: HTMLIFrameElement): any {
    return new Proxy(
      { iframe },
      {
        get(_target, prop) {
          if (prop === 'iframe') return iframe;
          if (prop === 'contentWindow') return iframe.contentWindow;
          if (prop === 'contentDocument') return iframe.contentDocument;
          return undefined;
        },
      }
    );
  }

  /**
   * Destroy iframe for a sub-app
   */
  private async destroyIframe(key: string): Promise<void> {
    const iframe = this.iframeTracker.get(key);
    if (iframe) {
      iframe.remove();
      this.iframeTracker.delete(key);
      console.info(`[Degradation] iframe for "${key}" destroyed`);
    }
  }

  /**
   * Level 4: Fallback - static placeholder
   *
   * @param config - Sub-app configuration
   * @returns Sub-app instance with static DOM
   */
  private loadFallback(config: SubAppConfig): SubAppInstance {
    const container = this.config.container ?? document.body;

    // Render fallback using custom or default renderer
    const fallbackElement = this.config.renderFallback(config);

    // Set ID for tracking
    fallbackElement.id = `orion-mf-fallback-${config.key}`;
    fallbackElement.setAttribute('data-orion-mf-fallback', config.key);

    // Append to container
    container.appendChild(fallbackElement);

    // Create instance with fallback element as root
    const instance: SubAppInstance = {
      key: config.key,
      root: fallbackElement,
      sandbox: this.createFallbackSandbox(fallbackElement),
      lifecycle: {
        mount: () => {
          console.info(`[Degradation] Fallback: ${config.name} displayed`);
        },
        unmount: () => {
          console.info(`[Degradation] Fallback: ${config.name} hidden`);
        },
      },
      destroy: () => this.destroyFallback(config.key),
    };

    console.info(`[Degradation] Fallback: ${config.name} rendered`);

    return instance;
  }

  /**
   * Create a minimal sandbox proxy for fallback mode
   */
  private createFallbackSandbox(element: HTMLElement): any {
    return new Proxy(
      { element },
      {
        get(_target, prop) {
          if (prop === 'element') return element;
          return undefined;
        },
      }
    );
  }

  /**
   * Default fallback renderer
   */
  private defaultRenderFallback(config: SubAppConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = 'orion-mf-fallback';
    div.innerHTML = `
      <div style="
        padding: 24px;
        text-align: center;
        background: #f5f5f7;
        border-radius: 8px;
        color: #8c8c8c;
      ">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #595959;">
          子应用暂时不可用
        </p>
        <p style="margin: 0; font-size: 12px;">
          ${config.name} (${config.key})
        </p>
      </div>
    `;
    return div;
  }

  /**
   * Destroy fallback for a sub-app
   */
  private async destroyFallback(key: string): Promise<void> {
    const element = document.getElementById(`orion-mf-fallback-${key}`);
    if (element) {
      element.remove();
      console.info(`[Degradation] Fallback for "${key}" destroyed`);
    }
  }

  /**
   * Get the degradation level used for a sub-app
   *
   * @param key - Sub-app key
   * @returns Degradation level or undefined if not loaded
   */
  getLevel(key: string): DegradationLevel | undefined {
    return this.levelTracker.get(key);
  }

  /**
   * Get the current degradation level
   */
  getCurrentLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /**
   * Reset degradation state for a sub-app
   *
   * @param key - Sub-app key
   */
  reset(key: string): void {
    this.levelTracker.delete(key);
    this.destroyIframe(key);
    this.destroyFallback(key);
  }

  /**
   * Reset all degradation state
   */
  resetAll(): void {
    this.levelTracker.clear();
    this.iframeTracker.forEach((iframe) => iframe.remove());
    this.iframeTracker.clear();
  }

  /**
   * Update configuration
   *
   * @param config - New configuration
   */
  updateConfig(config: Partial<DegradationConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/** Default DegradationStrategy instance */
let defaultStrategy: DegradationStrategy | null = null;

/**
 * Create a DegradationStrategy with default bridge
 */
export function createDegradationStrategy(config?: DegradationConfig): DegradationStrategy {
  const bridge = new MFSandboxBridge();
  return new DegradationStrategy(bridge, config);
}

/**
 * Get the default DegradationStrategy instance
 */
export function getDegradationStrategy(): DegradationStrategy | null {
  return defaultStrategy;
}

/**
 * Set the default DegradationStrategy instance
 */
export function setDegradationStrategy(strategy: DegradationStrategy): void {
  defaultStrategy = strategy;
}

// ============================================================================
// Export
// ============================================================================

export default DegradationStrategy;