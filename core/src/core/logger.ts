/**
 * OrionMF Logger — Minimal structured logging utility
 *
 * Replaces bare console.* calls with prefixed, structured logging.
 * All logs include module context for easier debugging and traceability.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface Logger {
  info(context: string, message: string, data?: unknown): void;
  warn(context: string, message: string, data?: unknown): void;
  error(context: string, message: string, data?: unknown): void;
  debug(context: string, message: string, data?: unknown): void;
}

const PREFIX = '[orion-mf]';

let logLevel: LogLevel = 'warn'; // default: only warn and error

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Set the minimum log level for all OrionMF logs.
 * @param level Minimum level to output (default: 'warn')
 */
export function setLogLevel(level: LogLevel): void {
  logLevel = level;
}

/**
 * Get the current minimum log level.
 */
export function getLogLevel(): LogLevel {
  return logLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[logLevel];
}

function format(context: string, message: string): string {
  return `${PREFIX} ${context}: ${message}`;
}

function log(level: LogLevel, context: string, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  const formatted = format(context, message);

  switch (level) {
    case 'info':
      // eslint-disable-next-line no-console
      data !== undefined ? console.info(formatted, data) : console.info(formatted);
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      data !== undefined ? console.warn(formatted, data) : console.warn(formatted);
      break;
    case 'error':
      // eslint-disable-next-line no-console
      data !== undefined ? console.error(formatted, data) : console.error(formatted);
      break;
    case 'debug':
      // eslint-disable-next-line no-console
      data !== undefined ? console.debug(formatted, data) : console.debug(formatted);
      break;
  }
}

/**
 * Default logger instance — use this for all OrionMF logging.
 *
 * @example
 * logger.info('Sandbox', 'activating sandbox', { name: 'my-app' });
 * logger.error('MFSandboxBridge', 'failed to load sub-app', error);
 */
export const logger: Logger = {
  info: (context, message, data) => log('info', context, message, data),
  warn: (context, message, data) => log('warn', context, message, data),
  error: (context, message, data) => log('error', context, message, data),
  debug: (context, message, data) => log('debug', context, message, data),
};
