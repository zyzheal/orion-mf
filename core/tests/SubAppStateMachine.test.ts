/**
 * SubAppStateMachine Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SubAppStateMachine,
  VALID_TRANSITIONS,
  type SubAppState,
} from '../src/core/SubAppStateMachine';

describe('SubAppStateMachine', () => {
  let stateMachine: SubAppStateMachine;

  beforeEach(() => {
    stateMachine = new SubAppStateMachine();
  });

  describe('init', () => {
    it('should initialize subapp to idle state', () => {
      stateMachine.init('pipeline');
      expect(stateMachine.getState('pipeline')).toBe('idle');
    });

    it('should allow initializing multiple subapps', () => {
      stateMachine.init('pipeline');
      stateMachine.init('cmdb');
      stateMachine.init('chatops');

      expect(stateMachine.getState('pipeline')).toBe('idle');
      expect(stateMachine.getState('cmdb')).toBe('idle');
      expect(stateMachine.getState('chatops')).toBe('idle');
    });

    it('should overwrite existing state to idle', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.init('pipeline');

      expect(stateMachine.getState('pipeline')).toBe('idle');
    });
  });

  describe('getState', () => {
    it('should return idle for non-initialized subapp', () => {
      expect(stateMachine.getState('unknown')).toBe('idle');
    });

    it('should return current state after transition', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      expect(stateMachine.getState('pipeline')).toBe('loading');
    });
  });

  describe('transition', () => {
    it('should transition from idle to loading with load action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      expect(stateMachine.getState('pipeline')).toBe('loading');
    });

    it('should transition from loading to bootstrapping with bootstrap action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');

      expect(stateMachine.getState('pipeline')).toBe('bootstrapping');
    });

    it('should transition from bootstrapping to mounting with mount action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');

      expect(stateMachine.getState('pipeline')).toBe('mounting');
    });

    it('should transition from mounting to mounted with complete action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');

      expect(stateMachine.getState('pipeline')).toBe('mounted');
    });

    it('should transition from mounted to unmounting with unmount action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');
      stateMachine.transition('pipeline', 'unmount');

      expect(stateMachine.getState('pipeline')).toBe('unmounting');
    });

    it('should transition from unmounting to unmounted with complete action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');
      stateMachine.transition('pipeline', 'unmount');
      stateMachine.transition('pipeline', 'complete');

      expect(stateMachine.getState('pipeline')).toBe('unmounted');
    });

    it('should transition to error state on fail action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'fail');

      expect(stateMachine.getState('pipeline')).toBe('error');
    });

    it('should fail transition from mounted to loading directly', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');

      expect(() => stateMachine.transition('pipeline', 'load')).toThrow();
    });

    it('should transition from error to loading with retry action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'fail');

      expect(stateMachine.getState('pipeline')).toBe('error');

      stateMachine.transition('pipeline', 'retry');
      expect(stateMachine.getState('pipeline')).toBe('loading');
    });

    it('should transition from unmounted to loading with load action', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');
      stateMachine.transition('pipeline', 'unmount');
      stateMachine.transition('pipeline', 'complete');

      expect(stateMachine.getState('pipeline')).toBe('unmounted');

      stateMachine.transition('pipeline', 'load');
      expect(stateMachine.getState('pipeline')).toBe('loading');
    });

    it('should throw error for invalid transition', () => {
      stateMachine.init('pipeline');

      expect(() => stateMachine.transition('pipeline', 'unmount')).toThrow();
    });
  });

  describe('canLoad', () => {
    it('should return true for idle state', () => {
      stateMachine.init('pipeline');
      expect(stateMachine.canLoad('pipeline')).toBe(true);
    });

    it('should return true for error state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'fail');

      expect(stateMachine.canLoad('pipeline')).toBe(true);
    });

    it('should return true for unmounted state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');
      stateMachine.transition('pipeline', 'unmount');
      stateMachine.transition('pipeline', 'complete');

      expect(stateMachine.canLoad('pipeline')).toBe(true);
    });

    it('should return false for loading state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      expect(stateMachine.canLoad('pipeline')).toBe(false);
    });

    it('should return false for mounted state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');

      expect(stateMachine.canLoad('pipeline')).toBe(false);
    });

    it('should return true for unknown subapp (defaults to idle)', () => {
      expect(stateMachine.canLoad('unknown')).toBe(true);
    });
  });

  describe('cancelPending', () => {
    it('should do nothing for idle state', () => {
      stateMachine.init('pipeline');
      stateMachine.cancelPending('pipeline');

      expect(stateMachine.getState('pipeline')).toBe('idle');
    });

    it('should cancel loading state and set to unmounted', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      expect(stateMachine.getAbortSignal('pipeline')).toBeDefined();

      stateMachine.cancelPending('pipeline');

      expect(stateMachine.getState('pipeline')).toBe('unmounted');
      expect(stateMachine.getAbortSignal('pipeline')).toBeUndefined();
    });

    it('should cancel bootstrapping state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');

      stateMachine.cancelPending('pipeline');

      expect(stateMachine.getState('pipeline')).toBe('unmounted');
    });

    it('should cancel mounting state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');

      stateMachine.cancelPending('pipeline');

      expect(stateMachine.getState('pipeline')).toBe('unmounted');
    });

    it('should do nothing for mounted state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');

      stateMachine.cancelPending('pipeline');

      expect(stateMachine.getState('pipeline')).toBe('mounted');
    });
  });

  describe('getAbortSignal', () => {
    it('should return undefined for non-initialized subapp', () => {
      expect(stateMachine.getAbortSignal('unknown')).toBeUndefined();
    });

    it('should return undefined for idle state', () => {
      stateMachine.init('pipeline');
      expect(stateMachine.getAbortSignal('pipeline')).toBeUndefined();
    });

    it('should return AbortSignal after load transition', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      const signal = stateMachine.getAbortSignal('pipeline');
      expect(signal).toBeDefined();
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    it('should return undefined after cancelPending', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.cancelPending('pipeline');

      expect(stateMachine.getAbortSignal('pipeline')).toBeUndefined();
    });

    it('should abort signal when cancelPending is called', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      const signal = stateMachine.getAbortSignal('pipeline');
      const abortSpy = vi.spyOn(signal!, 'addEventListener');

      stateMachine.cancelPending('pipeline');

      expect(signal?.aborted).toBe(true);
    });
  });

  describe('onTransition callback', () => {
    it('should call onTransition callback on state change', () => {
      const onTransition = vi.fn();
      const sm = new SubAppStateMachine({ onTransition });

      sm.init('pipeline');
      sm.transition('pipeline', 'load');

      expect(onTransition).toHaveBeenCalledWith('pipeline', 'idle', 'loading');
    });

    it('should not call onTransition for invalid transition (before throw)', () => {
      const onTransition = vi.fn();
      const sm = new SubAppStateMachine({ onTransition });

      sm.init('pipeline');

      expect(() => sm.transition('pipeline', 'mount')).toThrow();
      expect(onTransition).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should remove subapp state', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      stateMachine.destroy('pipeline');

      expect(stateMachine.getState('pipeline')).toBe('idle');
    });

    it('should cancel pending operations on destroy', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');

      const signal = stateMachine.getAbortSignal('pipeline');
      stateMachine.destroy('pipeline');

      expect(signal?.aborted).toBe(true);
    });
  });

  describe('getRegisteredApps', () => {
    it('should return empty array when no apps registered', () => {
      expect(stateMachine.getRegisteredApps()).toEqual([]);
    });

    it('should return all registered app keys', () => {
      stateMachine.init('pipeline');
      stateMachine.init('cmdb');
      stateMachine.init('chatops');

      const apps = stateMachine.getRegisteredApps();
      expect(apps).toContain('pipeline');
      expect(apps).toContain('cmdb');
      expect(apps).toContain('chatops');
    });
  });

  describe('reset', () => {
    it('should clear all states', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.init('cmdb');

      stateMachine.reset();

      expect(stateMachine.getRegisteredApps()).toEqual([]);
    });

    it('should abort all pending operations', () => {
      stateMachine.init('pipeline');
      stateMachine.transition('pipeline', 'load');
      stateMachine.init('cmdb');
      stateMachine.transition('cmdb', 'load');

      const pipelineSignal = stateMachine.getAbortSignal('pipeline');
      const cmdbSignal = stateMachine.getAbortSignal('cmdb');

      stateMachine.reset();

      expect(pipelineSignal?.aborted).toBe(true);
      expect(cmdbSignal?.aborted).toBe(true);
    });
  });

  describe('VALID_TRANSITIONS', () => {
    it('should have correct number of transitions', () => {
      expect(VALID_TRANSITIONS.length).toBe(13);
    });

    it('should include idle to loading', () => {
      const transition = VALID_TRANSITIONS.find(
        t => t.from === 'idle' && t.action === 'load'
      );
      expect(transition?.to).toBe('loading');
    });

    it('should include complete error paths', () => {
      const errorTransitions = VALID_TRANSITIONS.filter(t => t.to === 'error');
      expect(errorTransitions.length).toBe(5);
    });
  });

  describe('full lifecycle', () => {
    it('should complete full lifecycle from load to unmounted', () => {
      const onTransition = vi.fn();
      const sm = new SubAppStateMachine({ onTransition });

      sm.init('pipeline');
      expect(sm.getState('pipeline')).toBe('idle');

      sm.transition('pipeline', 'load');
      expect(sm.getState('pipeline')).toBe('loading');

      sm.transition('pipeline', 'bootstrap');
      expect(sm.getState('pipeline')).toBe('bootstrapping');

      sm.transition('pipeline', 'mount');
      expect(sm.getState('pipeline')).toBe('mounting');

      sm.transition('pipeline', 'complete');
      expect(sm.getState('pipeline')).toBe('mounted');

      sm.transition('pipeline', 'unmount');
      expect(sm.getState('pipeline')).toBe('unmounting');

      sm.transition('pipeline', 'complete');
      expect(sm.getState('pipeline')).toBe('unmounted');

      // Should have 6 transitions (excluding init)
      expect(onTransition).toHaveBeenCalledTimes(6);
    });

    it('should handle error and retry cycle', () => {
      stateMachine.init('pipeline');

      // Load and fail
      stateMachine.transition('pipeline', 'load');
      stateMachine.transition('pipeline', 'fail');
      expect(stateMachine.getState('pipeline')).toBe('error');

      // Retry and succeed
      stateMachine.transition('pipeline', 'retry');
      expect(stateMachine.getState('pipeline')).toBe('loading');

      stateMachine.transition('pipeline', 'bootstrap');
      stateMachine.transition('pipeline', 'mount');
      stateMachine.transition('pipeline', 'complete');
      expect(stateMachine.getState('pipeline')).toBe('mounted');
    });

    it('should support multiple subapp lifecycle simultaneously', () => {
      stateMachine.init('pipeline');
      stateMachine.init('cmdb');
      stateMachine.init('chatops');

      // Pipeline loading
      stateMachine.transition('pipeline', 'load');

      // CMDB mounted
      stateMachine.transition('cmdb', 'load');
      stateMachine.transition('cmdb', 'bootstrap');
      stateMachine.transition('cmdb', 'mount');
      stateMachine.transition('cmdb', 'complete');

      // ChatOps still idle

      expect(stateMachine.getState('pipeline')).toBe('loading');
      expect(stateMachine.getState('cmdb')).toBe('mounted');
      expect(stateMachine.getState('chatops')).toBe('idle');
    });
  });
});