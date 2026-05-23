/**
 * OrionMF Core Interface Definitions
 */

import type { SandboxProxy } from './Sandbox';

/** Sandbox type enumeration */
export enum SandBoxType {
  /** Snapshot sandbox - uses property copy snapshot */
  Snapshot = 'Snapshot',
  /** Proxy sandbox - uses ES6 Proxy */
  Proxy = 'Proxy',
}

/** Sandbox interface */
export interface SandBox {
  /** Unique name of the sandbox */
  name: string;
  /** Sandbox type */
  type: SandBoxType;
  /** The proxy object exposed to micro apps */
  proxy: SandboxProxy;
  /** Whether the sandbox is currently running */
  sandboxRunning: boolean;
  /** Latest property that was set */
  latestSetProp?: PropertyKey | null;
  /** Activate the sandbox */
  active: () => void;
  /** Deactivate the sandbox */
  inactive: () => void;
}

/** Running app context */
export interface RunningApp {
  /** App key/identifier */
  key: string;
  /** App's sandbox proxy */
  proxy: SandboxProxy;
}

/** Sandbox configuration */
export interface SandboxConfig {
  /** Unique key for the sandbox */
  key: string;
  /** Optional global context override */
  globalContext?: typeof window;
  /** Enable/disable sandbox */
  enabled?: boolean;
}

/** Sandboxed function wrapper */
export interface ScopedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T>;
}

// ============================================================================
// StyleIsolator Types
// ============================================================================

/** CSS isolation mode */
export type CSSIsolationMode = 'shadow-dom' | 'scoped-css' | 'none';

/** StyleIsolator interface */
export interface IStyleIsolator {
  /** Mount a micro app container with CSS isolation */
  mount(key: string, container: HTMLElement, mode?: CSSIsolationMode): ShadowRoot | HTMLElement;
  /** Unmount a micro app and cleanup resources */
  unmount(key: string): void;
}

// ============================================================================
// ErrorIsolator Types
// ============================================================================

/** Error callback type */
export type ErrorCallback = (error: Error) => void;

/** Error boundary interface */
export interface ErrorBoundary {
  /** Capture an error */
  capture(error: Error): void;
  /** Get the sub-app key */
  getKey(): string;
}

/** ErrorIsolator interface */
export interface IErrorIsolator {
  /** Set up error boundary for a sub-app */
  setup(key: string, onError: ErrorCallback): ErrorBoundary;
  /** Get error boundary for a specific sub-app */
  getBoundary(key: string): ErrorBoundary | undefined;
  /** Check if a sub-app has an active error boundary */
  hasBoundary(key: string): boolean;
  /** Remove error boundary for a sub-app */
  remove(key: string): void;
  /** Get all registered sub-app keys */
  getRegisteredKeys(): string[];
  /** Destroy the ErrorIsolator */
  destroy(): void;
}