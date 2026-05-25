/**
 * Logger — Unit tests for structured logging utility
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger, setLogLevel, getLogLevel, LogLevel } from '../src/core/logger';

describe('Logger', () => {
  afterEach(() => {
    setLogLevel('warn'); // reset after each test
    vi.restoreAllMocks();
  });

  describe('format', () => {
    it('should format with [orion-mf] Context: message', () => {
      setLogLevel('debug');
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('TestModule', 'test message');
      expect(infoSpy).toHaveBeenCalledWith('[orion-mf] TestModule: test message');
    });

    it('should guard against undefined context', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // @ts-expect-error — testing undefined context
      logger.warn(undefined, 'test');
      expect(warnSpy).toHaveBeenCalledWith('[orion-mf] unknown: test');
    });

    it('should guard against null context', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // @ts-expect-error — testing null context
      logger.warn(null, 'test');
      expect(warnSpy).toHaveBeenCalledWith('[orion-mf] unknown: test');
    });

    it('should guard against empty message', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      setLogLevel('debug');
      // @ts-expect-error — testing empty message
      logger.info('TestModule', '');
      expect(infoSpy).toHaveBeenCalledWith('[orion-mf] TestModule: ');
    });
  });

  describe('log levels', () => {
    it('should call console.info for info level', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      setLogLevel('debug');
      logger.info('Ctx', 'msg');
      expect(spy).toHaveBeenCalledWith('[orion-mf] Ctx: msg');
    });

    it('should call console.warn for warn level', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('Ctx', 'msg');
      expect(spy).toHaveBeenCalledWith('[orion-mf] Ctx: msg');
    });

    it('should call console.error for error level', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('Ctx', 'msg');
      expect(spy).toHaveBeenCalledWith('[orion-mf] Ctx: msg');
    });

    it('should call console.debug for debug level', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      setLogLevel('debug');
      logger.debug('Ctx', 'msg');
      expect(spy).toHaveBeenCalledWith('[orion-mf] Ctx: msg');
    });
  });

  describe('log level filtering', () => {
    it('default level warn should filter out info and debug', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      logger.info('Ctx', 'msg');
      logger.debug('Ctx', 'msg');

      expect(infoSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('default level warn should allow warn and error', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.warn('Ctx', 'msg');
      logger.error('Ctx', 'msg');

      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('setLogLevel debug should allow all levels', () => {
      setLogLevel('debug');
      const spies = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      logger.debug('Ctx', 'msg');
      logger.info('Ctx', 'msg');
      logger.warn('Ctx', 'msg');
      logger.error('Ctx', 'msg');

      expect(spies.debug).toHaveBeenCalled();
      expect(spies.info).toHaveBeenCalled();
      expect(spies.warn).toHaveBeenCalled();
      expect(spies.error).toHaveBeenCalled();
    });

    it('setLogLevel error should only allow error', () => {
      setLogLevel('error');
      const spies = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      logger.debug('Ctx', 'msg');
      logger.info('Ctx', 'msg');
      logger.warn('Ctx', 'msg');
      logger.error('Ctx', 'msg');

      expect(spies.debug).not.toHaveBeenCalled();
      expect(spies.info).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).toHaveBeenCalled();
    });
  });

  describe('setLogLevel / getLogLevel', () => {
    it('should get and set log level', () => {
      expect(getLogLevel()).toBe('warn');
      setLogLevel('info');
      expect(getLogLevel()).toBe('info');
      setLogLevel('error');
      expect(getLogLevel()).toBe('error');
      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');
    });
  });

  describe('data parameter', () => {
    it('should pass data as second argument', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('Ctx', 'msg', { key: 'value' });
      expect(spy).toHaveBeenCalledWith('[orion-mf] Ctx: msg', { key: 'value' });
    });

    it('should handle circular references safely', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const obj: Record<string, unknown> = {};
      obj.self = obj; // circular reference
      logger.warn('Ctx', 'msg', obj);
      expect(spy).toHaveBeenCalled();
      // Should not throw, and should output something
      const call = spy.mock.calls[0];
      expect(call[0]).toBe('[orion-mf] Ctx: msg');
    });

    it('should pass primitives as data', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const err = new Error('test error');
      logger.error('Ctx', 'msg', err);
      expect(spy).toHaveBeenCalledWith('[orion-mf] Ctx: msg', err);
    });
  });
});
