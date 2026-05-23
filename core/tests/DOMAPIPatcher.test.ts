/**
 * DOMAPIPatcher Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DOMAPIPatcher } from '../src/core/DOMAPIPatcher';

describe('DOMAPIPatcher Module', () => {
  let patcher: DOMAPIPatcher;

  beforeEach(() => {
    patcher = new DOMAPIPatcher();
  });

  afterEach(() => {
    patcher.cleanup();
  });

  describe('initialize', () => {
    it('should not throw when initialized with proxy', () => {
      const mockProxy = {} as any;
      expect(() => patcher.initialize(mockProxy)).not.toThrow();
    });

    it('should be idempotent - second initialize should not re-patch', () => {
      const mockProxy = {} as any;
      patcher.initialize(mockProxy);
      expect(() => patcher.initialize(mockProxy)).not.toThrow();
    });
  });

  describe('createElement interception', () => {
    it('should add data-orionmf-sandbox attribute to created elements', () => {
      const mockProxy = {} as any;
      patcher.initialize(mockProxy);

      const div = document.createElement('div');
      expect(div.getAttribute('data-orionmf-sandbox')).toBe('true');
    });

    it('should work with createElementNS', () => {
      const mockProxy = {} as any;
      patcher.initialize(mockProxy);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      expect(svg.getAttribute('data-orionmf-sandbox')).toBe('true');
    });
  });

  describe('appendChild interception', () => {
    it('should not throw when appending child', () => {
      const mockProxy = {} as any;
      patcher.initialize(mockProxy);

      const parent = document.createElement('div');
      const child = document.createElement('span');
      expect(() => parent.appendChild(child)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should restore original methods after cleanup', () => {
      const mockProxy = {} as any;
      const originalCreateElement = document.createElement;

      patcher.initialize(mockProxy);
      patcher.cleanup();

      // After cleanup, document.createElement should be restored
      expect(document.createElement).toBe(originalCreateElement);
    });
  });
});
