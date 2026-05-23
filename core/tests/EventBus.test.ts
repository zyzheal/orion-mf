/**
 * EventBus Module Tests
 * Using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus, eventBus, EventBusHandler, EventBusPayload } from '../src/core/EventBus';

describe('EventBus', () => {
  let eventBusInstance: EventBus;

  beforeEach(() => {
    // Get fresh instance for each test (with clear state)
    eventBusInstance = EventBus.getInstance();
    eventBusInstance.clearAll();
    eventBusInstance.setDefaultVersion('2.0.0');
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should have a global eventBus export', () => {
      expect(eventBus).toBeDefined();
      expect(eventBus).toBe(EventBus.getInstance());
    });
  });

  describe('createChannel', () => {
    it('should create a new channel', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      expect(channel).toBeDefined();
      expect(eventBusInstance.hasChannel('test-channel')).toBe(true);
    });

    it('should use default version when not specified', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      expect(channel.getVersion()).toBe('2.0.0');
    });

    it('should use custom version when specified', () => {
      const channel = eventBusInstance.createChannel('test-channel', '1.5.0');
      expect(channel.getVersion()).toBe('1.5.0');
    });

    it('should return existing channel if key already exists', () => {
      const channel1 = eventBusInstance.createChannel('test-channel', '1.0.0');
      const channel2 = eventBusInstance.createChannel('test-channel', '2.0.0');
      expect(channel1).toBe(channel2);
      expect(channel1.getVersion()).toBe('1.0.0');
    });
  });

  describe('removeChannel', () => {
    it('should remove an existing channel', () => {
      eventBusInstance.createChannel('test-channel');
      expect(eventBusInstance.hasChannel('test-channel')).toBe(true);

      eventBusInstance.removeChannel('test-channel');
      expect(eventBusInstance.hasChannel('test-channel')).toBe(false);
    });

    it('should handle removing non-existent channel gracefully', () => {
      expect(() => {
        eventBusInstance.removeChannel('non-existent');
      }).not.toThrow();
    });
  });

  describe('Channel.on()', () => {
    it('should register an event handler', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const handler: EventBusHandler = vi.fn();

      channel.on('test-event', handler);
      expect(channel.getListenerCount('test-event')).toBe(1);
    });

    it('should allow multiple handlers for same event', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const handler1: EventBusHandler = vi.fn();
      const handler2: EventBusHandler = vi.fn();

      channel.on('test-event', handler1);
      channel.on('test-event', handler2);
      expect(channel.getListenerCount('test-event')).toBe(2);
    });

    it('should allow handlers for different events', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const handler1: EventBusHandler = vi.fn();
      const handler2: EventBusHandler = vi.fn();

      channel.on('event-1', handler1);
      channel.on('event-2', handler2);
      expect(channel.getListenerCount('event-1')).toBe(1);
      expect(channel.getListenerCount('event-2')).toBe(1);
    });
  });

  describe('Channel.emit()', () => {
    it('should call all handlers for the event', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const handler1: EventBusHandler = vi.fn();
      const handler2: EventBusHandler = vi.fn();

      channel.on('test-event', handler1);
      channel.on('test-event', handler2);

      channel.emit('test-event', { message: 'hello' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should pass correct payload to handlers', () => {
      const channel = eventBusInstance.createChannel('test-channel', '2.1.0');
      let receivedPayload: EventBusPayload | null = null;
      const handler: EventBusHandler = (payload) => {
        receivedPayload = payload;
      };

      channel.on('test-event', handler);
      channel.emit('test-event', { message: 'hello', count: 42 });

      expect(receivedPayload).not.toBeNull();
      expect(receivedPayload!.event).toBe('test-event');
      expect(receivedPayload!.data).toEqual({ message: 'hello', count: 42 });
      expect(receivedPayload!.version).toBe('2.1.0');
    });

    it('should not call handlers for other events', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const handler: EventBusHandler = vi.fn();

      channel.on('event-1', handler);
      channel.emit('event-2', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle errors in handlers gracefully', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorHandler: EventBusHandler = () => {
        throw new Error('Handler error');
      };

      channel.on('test-event', errorHandler);
      expect(() => {
        channel.emit('test-event', {});
      }).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('Channel.off()', () => {
    it('should remove a specific handler', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const handler1: EventBusHandler = vi.fn();
      const handler2: EventBusHandler = vi.fn();

      channel.on('test-event', handler1);
      channel.on('test-event', handler2);

      channel.off('test-event', handler1);

      channel.emit('test-event', {});
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle removing non-existent handler gracefully', () => {
      const channel = eventBusInstance.createChannel('test-channel');
      const handler: EventBusHandler = vi.fn();

      channel.off('test-event', handler); // Never registered
      expect(() => {
        channel.emit('test-event', {});
      }).not.toThrow();
    });
  });

  describe('Channel.getSubscribedEvents()', () => {
    it('should return list of subscribed events', () => {
      const channel = eventBusInstance.createChannel('test-channel');

      channel.on('event-1', vi.fn());
      channel.on('event-2', vi.fn());

      const events = channel.getSubscribedEvents();
      expect(events).toContain('event-1');
      expect(events).toContain('event-2');
    });
  });

  describe('Version Control', () => {
    it('should use version from channel creation', () => {
      const channel = eventBusInstance.createChannel('v1-channel', '1.0.0');

      let receivedVersion = '';
      const handler: EventBusHandler = (payload) => {
        receivedVersion = payload.version;
      };

      channel.on('test-event', handler);
      channel.emit('test-event', {});

      expect(receivedVersion).toBe('1.0.0');
    });

    it('should allow different channels with different versions', () => {
      const channel1 = eventBusInstance.createChannel('channel-1', '1.0.0');
      const channel2 = eventBusInstance.createChannel('channel-2', '2.0.0');

      let version1 = '';
      let version2 = '';

      channel1.on('test', (p) => { version1 = p.version; });
      channel2.on('test', (p) => { version2 = p.version; });

      channel1.emit('test', {});
      channel2.emit('test', {});

      expect(version1).toBe('1.0.0');
      expect(version2).toBe('2.0.0');
    });

    it('should set and get default version', () => {
      eventBusInstance.setDefaultVersion('3.0.0');
      expect(eventBusInstance.getDefaultVersion()).toBe('3.0.0');

      const channel = eventBusInstance.createChannel('test-channel');
      expect(channel.getVersion()).toBe('3.0.0');
    });
  });

  describe('getChannel', () => {
    it('should return existing channel', () => {
      eventBusInstance.createChannel('test-channel');
      const channel = eventBusInstance.getChannel('test-channel');
      expect(channel).toBeDefined();
    });

    it('should return undefined for non-existent channel', () => {
      const channel = eventBusInstance.getChannel('non-existent');
      expect(channel).toBeUndefined();
    });
  });

  describe('getChannelKeys', () => {
    it('should return all channel keys', () => {
      eventBusInstance.createChannel('channel-1');
      eventBusInstance.createChannel('channel-2');
      eventBusInstance.createChannel('channel-3');

      const keys = eventBusInstance.getChannelKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('channel-1');
      expect(keys).toContain('channel-2');
      expect(keys).toContain('channel-3');
    });

    it('should return empty array when no channels', () => {
      const keys = eventBusInstance.getChannelKeys();
      expect(keys).toEqual([]);
    });
  });

  describe('clearAll', () => {
    it('should remove all channels', () => {
      eventBusInstance.createChannel('channel-1');
      eventBusInstance.createChannel('channel-2');

      eventBusInstance.clearAll();

      expect(eventBusInstance.getChannelKeys()).toEqual([]);
    });
  });

  describe('Integration', () => {
    it('should work with multiple channels and events', () => {
      const channelA = eventBusInstance.createChannel('channel-A');
      const channelB = eventBusInstance.createChannel('channel-B');

      const results: string[] = [];

      channelA.on('update', (p) => {
        results.push(`A:${p.event}:${JSON.stringify(p.data)}`);
      });

      channelB.on('update', (p) => {
        results.push(`B:${p.event}:${JSON.stringify(p.data)}`);
      });

      channelA.emit('update', { id: 1 });
      channelB.emit('update', { id: 2 });

      expect(results).toEqual([
        'A:update:{"id":1}',
        'B:update:{"id":2}',
      ]);
    });

    it('should support pub/sub pattern', () => {
      const channel = eventBusInstance.createChannel('pub-sub');

      // Subscriber 1
      channel.on('data', (p) => {
        // Handle data
      });

      // Subscriber 2
      channel.on('data', (p) => {
        // Handle data differently
      });

      // Publisher
      channel.emit('data', { value: 123 });
    });
  });
});