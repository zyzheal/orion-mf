/**
 * SecurityPolicyManager Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SecurityPolicyManager,
  securityPolicyManager,
  PRESETS,
  applyPreset,
  setPolicy,
  getPolicy,
  cleanupSecurityPolicy,
} from '../src/core/SecurityPolicyManager';
import type { SecurityPolicy, SandboxMode, CSSIsolationMode, PresetKey } from '../src/core/SecurityPolicyManager';

describe('SecurityPolicyManager', () => {
  let manager: SecurityPolicyManager;

  beforeEach(() => {
    manager = new SecurityPolicyManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('PRESETS', () => {
    it('should have strict preset defined', () => {
      expect(PRESETS.strict).toBeDefined();
      expect(PRESETS.strict.mode).toBe('strict');
      expect(PRESETS.strict.whitelist).toEqual([]);
      expect(PRESETS.strict.blacklist).toContain('eval');
      expect(PRESETS.strict.cssIsolation).toBe('shadow-dom');
      expect(PRESETS.strict.isolateStorage).toBe(true);
      expect(PRESETS.strict.blockDynamicScripts).toBe(true);
      expect(PRESETS.strict.blockEval).toBe(true);
    });

    it('should have loose preset defined', () => {
      expect(PRESETS.loose).toBeDefined();
      expect(PRESETS.loose.mode).toBe('loose');
      expect(PRESETS.loose.whitelist).toContain('console');
      expect(PRESETS.loose.blacklist).toContain('eval');
      expect(PRESETS.loose.cssIsolation).toBe('scoped-css');
      expect(PRESETS.loose.isolateStorage).toBe(false);
      expect(PRESETS.loose.blockDynamicScripts).toBe(false);
      expect(PRESETS.loose.blockEval).toBe(true);
    });

    it('should have none preset defined', () => {
      expect(PRESETS.none).toBeDefined();
      expect(PRESETS.none.mode).toBe('none');
      expect(PRESETS.none.whitelist).toEqual([]);
      // none 模式仍保留基础原型链保护
      expect(PRESETS.none.blacklist).toEqual(['__proto__', 'constructor']);
      expect(PRESETS.none.cssIsolation).toBe('none');
      expect(PRESETS.none.isolateStorage).toBe(false);
      expect(PRESETS.none.blockDynamicScripts).toBe(false);
      expect(PRESETS.none.blockEval).toBe(false);
    });
  });

  describe('applyPreset', () => {
    it('should apply strict preset', () => {
      manager.applyPreset('app1', 'strict');
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('strict');
      expect(policy.cssIsolation).toBe('shadow-dom');
      expect(policy.isolateStorage).toBe(true);
    });

    it('should apply loose preset', () => {
      manager.applyPreset('app1', 'loose');
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('loose');
      expect(policy.cssIsolation).toBe('scoped-css');
      expect(policy.isolateStorage).toBe(false);
    });

    it('should apply none preset', () => {
      manager.applyPreset('app1', 'none');
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('none');
      expect(policy.cssIsolation).toBe('none');
      expect(policy.isolateStorage).toBe(false);
    });

    it('should clone preset arrays to avoid mutation', () => {
      manager.applyPreset('app1', 'strict');
      const policy1 = manager.getPolicy('app1');
      policy1.whitelist.push('custom');
      const policy2 = manager.getPolicy('app1');
      expect(policy2.whitelist).not.toContain('custom');
    });

    it('should fallback to strict for unknown preset', () => {
      manager.applyPreset('app1', 'unknown' as PresetKey);
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('strict');
    });
  });

  describe('setPolicy', () => {
    it('should set custom policy', () => {
      manager.setPolicy('app1', { mode: 'loose', cssIsolation: 'runtime-prefix' });
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('loose');
      expect(policy.cssIsolation).toBe('runtime-prefix');
    });

    it('should merge with existing policy', () => {
      manager.applyPreset('app1', 'strict');
      manager.setPolicy('app1', { cssIsolation: 'scoped-css' });
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('strict');
      expect(policy.cssIsolation).toBe('scoped-css');
      expect(policy.isolateStorage).toBe(true); // From strict
    });

    it('should merge with default strict preset if no policy exists', () => {
      manager.setPolicy('app1', { blockDynamicScripts: false });
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('strict');
      expect(policy.blockDynamicScripts).toBe(false);
    });
  });

  describe('getPolicy', () => {
    it('should return policy for existing app', () => {
      manager.applyPreset('app1', 'loose');
      const policy = manager.getPolicy('app1');
      expect(policy).toBeDefined();
      expect(policy.mode).toBe('loose');
    });

    it('should return strict preset for unknown app', () => {
      const policy = manager.getPolicy('unknown-app');
      expect(policy.mode).toBe('strict');
    });
  });

  describe('setPolicies', () => {
    it('should batch set policies', () => {
      manager.setPolicies({
        app1: { mode: 'strict' },
        app2: { mode: 'loose' },
        app3: { cssIsolation: 'none' },
      });

      expect(manager.getPolicy('app1').mode).toBe('strict');
      expect(manager.getPolicy('app2').mode).toBe('loose');
      expect(manager.getPolicy('app3').cssIsolation).toBe('none');
    });
  });

  describe('getAll', () => {
    it('should return all policies', () => {
      manager.applyPreset('app1', 'strict');
      manager.applyPreset('app2', 'loose');

      const all = manager.getAll();
      expect(Object.keys(all)).toContain('app1');
      expect(Object.keys(all)).toContain('app2');
    });

    it('should return cloned policies', () => {
      manager.applyPreset('app1', 'strict');
      const all = manager.getAll();
      all.app1.whitelist.push('custom');
      const policy = manager.getPolicy('app1');
      expect(policy.whitelist).not.toContain('custom');
    });
  });

  describe('hasPolicy', () => {
    it('should return true for existing policy', () => {
      manager.applyPreset('app1', 'strict');
      expect(manager.hasPolicy('app1')).toBe(true);
    });

    it('should return false for non-existing policy', () => {
      expect(manager.hasPolicy('unknown')).toBe(false);
    });
  });

  describe('removePolicy', () => {
    it('should remove policy', () => {
      manager.applyPreset('app1', 'strict');
      expect(manager.hasPolicy('app1')).toBe(true);
      manager.removePolicy('app1');
      expect(manager.hasPolicy('app1')).toBe(false);
    });

    it('should return strict preset after removal', () => {
      manager.applyPreset('app1', 'loose');
      manager.removePolicy('app1');
      const policy = manager.getPolicy('app1');
      expect(policy.mode).toBe('strict');
    });
  });

  describe('clear', () => {
    it('should clear all policies', () => {
      manager.applyPreset('app1', 'strict');
      manager.applyPreset('app2', 'loose');
      manager.clear();

      expect(manager.getPolicy('app1').mode).toBe('strict');
      expect(manager.getPolicy('app2').mode).toBe('strict');
    });
  });

  describe('cleanup', () => {
    it('should cleanup specific app policy', () => {
      manager.applyPreset('app1', 'strict');
      manager.applyPreset('app2', 'loose');
      manager.cleanup('app1');

      expect(manager.hasPolicy('app1')).toBe(false);
      expect(manager.hasPolicy('app2')).toBe(true);
    });
  });

  describe('isPropertyAllowed', () => {
    it('should block blacklist properties in strict mode', () => {
      manager.applyPreset('app1', 'strict');
      expect(manager.isPropertyAllowed('app1', 'eval')).toBe(false);
      expect(manager.isPropertyAllowed('app1', 'Function')).toBe(false);
      expect(manager.isPropertyAllowed('app1', '__proto__')).toBe(false);
      expect(manager.isPropertyAllowed('app1', 'constructor')).toBe(false);
    });

    it('should allow whitelist properties in loose mode', () => {
      manager.applyPreset('app1', 'loose');
      expect(manager.isPropertyAllowed('app1', 'console')).toBe(true);
      expect(manager.isPropertyAllowed('app1', 'localStorage')).toBe(true);
      expect(manager.isPropertyAllowed('app1', 'fetch')).toBe(true);
    });

    it('should block eval in loose mode', () => {
      manager.applyPreset('app1', 'loose');
      expect(manager.isPropertyAllowed('app1', 'eval')).toBe(false);
    });

    it('should allow all properties in none mode', () => {
      manager.applyPreset('app1', 'none');
      expect(manager.isPropertyAllowed('app1', 'eval')).toBe(true);
      expect(manager.isPropertyAllowed('app1', 'any-property')).toBe(true);
    });

    it('should return strict policy for unknown app', () => {
      expect(manager.isPropertyAllowed('unknown', 'eval')).toBe(false);
      expect(manager.isPropertyAllowed('unknown', 'console')).toBe(true);
    });
  });

  describe('applyPolicyToSandbox', () => {
    it('should convert policy to sandbox config', () => {
      manager.applyPreset('app1', 'loose');
      const config = manager.applyPolicyToSandbox('app1');

      expect(config.key).toBe('app1');
      expect(config.enabled).toBe(true);
      expect(config.whitelist).toContain('console');
      expect(config.cssIsolation).toBe('scoped-css');
      expect(config.blockEval).toBe(true);
    });

    it('should set enabled to false for none mode', () => {
      manager.applyPreset('app1', 'none');
      const config = manager.applyPolicyToSandbox('app1');
      expect(config.enabled).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should notify on policy change', () => {
      const callback = vi.fn();
      manager.subscribe(callback);

      manager.applyPreset('app1', 'strict');
      expect(callback).toHaveBeenCalledWith('app1', expect.any(Object));
      expect(callback.mock.calls[0][1].mode).toBe('strict');
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = manager.subscribe(callback);

      unsubscribe();
      manager.applyPreset('app1', 'strict');
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

describe('Module-level convenience functions', () => {
  beforeEach(() => {
    securityPolicyManager.clear();
  });

  afterEach(() => {
    securityPolicyManager.clear();
  });

  it('applyPreset should work', () => {
    applyPreset('app1', 'loose');
    expect(getPolicy('app1').mode).toBe('loose');
  });

  it('setPolicy should work', () => {
    setPolicy('app1', { cssIsolation: 'runtime-prefix' });
    expect(getPolicy('app1').cssIsolation).toBe('runtime-prefix');
  });

  it('getPolicy should work', () => {
    applyPreset('app1', 'strict');
    const policy = getPolicy('app1');
    expect(policy.mode).toBe('strict');
  });

  it('cleanupSecurityPolicy should work', () => {
    applyPreset('app1', 'strict');
    cleanupSecurityPolicy('app1');
    expect(securityPolicyManager.hasPolicy('app1')).toBe(false);
  });
});