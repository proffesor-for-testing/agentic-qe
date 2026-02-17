/**
 * PN-Counter Unit Tests
 *
 * Tests for the Positive-Negative Counter CRDT implementation.
 * Verifies increment/decrement, convergence, commutativity, idempotency.
 */

import { describe, it, expect } from 'vitest';

import {
  createPNCounter,
  createPNCounterFromState,
  isPNCounterState,
  getPNCounterBreakdown,
} from '../../../src/memory/crdt/pn-counter.js';

describe('PN-Counter', () => {
  describe('increment and decrement', () => {
    it('should start at zero', () => {
      // Arrange & Act
      const counter = createPNCounter('node-a');

      // Assert
      expect(counter.get()).toBe(0);
    });

    it('should increment correctly', () => {
      // Arrange
      const counter = createPNCounter('node-a');

      // Act
      counter.increment(10);

      // Assert
      expect(counter.get()).toBe(10);
    });

    it('should decrement correctly', () => {
      // Arrange
      const counter = createPNCounter('node-a');
      counter.increment(10);

      // Act
      counter.decrement(3);

      // Assert
      expect(counter.get()).toBe(7);
    });

    it('should support going negative', () => {
      // Arrange
      const counter = createPNCounter('node-a');

      // Act
      counter.decrement(5);

      // Assert
      expect(counter.get()).toBe(-5);
    });

    it('should throw when increment receives negative value', () => {
      const counter = createPNCounter('node-a');
      expect(() => counter.increment(-1)).toThrow('Use decrement() for negative values');
    });

    it('should throw when decrement receives negative value', () => {
      const counter = createPNCounter('node-a');
      expect(() => counter.decrement(-1)).toThrow('Use increment() for negative values');
    });

    it('should no-op on zero increment or decrement', () => {
      // Arrange
      const counter = createPNCounter('node-a');
      counter.increment(5);

      // Act
      counter.increment(0);
      counter.decrement(0);

      // Assert
      expect(counter.get()).toBe(5);
    });
  });

  describe('convergence after merge', () => {
    it('should converge two replicas with different operations to same value', () => {
      // Arrange
      const a = createPNCounter('node-a');
      const b = createPNCounter('node-b');
      a.increment(10);
      a.decrement(2);
      b.increment(5);
      b.decrement(3);

      // Act
      const mergedA = createPNCounterFromState('node-a', a.getState());
      mergedA.applyState(b.getState());

      const mergedB = createPNCounterFromState('node-b', b.getState());
      mergedB.applyState(a.getState());

      // Assert - both converge: (10-2) + (5-3) = 10
      expect(mergedA.get()).toBe(10);
      expect(mergedB.get()).toBe(10);
    });

    it('should converge three replicas after full sync', () => {
      // Arrange
      const a = createPNCounter('node-a');
      const b = createPNCounter('node-b');
      const c = createPNCounter('node-c');
      a.increment(10);
      b.decrement(3);
      c.increment(7);

      // Act - full pairwise sync
      a.merge(b);
      a.merge(c);
      b.merge(a);
      c.merge(a);

      // Assert - all converge to 10 - 3 + 7 = 14
      expect(a.get()).toBe(14);
      expect(b.get()).toBe(14);
      expect(c.get()).toBe(14);
    });
  });

  describe('commutativity', () => {
    it('should produce same result regardless of merge order', () => {
      // Arrange
      const a = createPNCounter('node-a');
      const b = createPNCounter('node-b');
      a.increment(8);
      a.decrement(2);
      b.increment(3);
      b.decrement(1);

      // Act
      const ab = createPNCounterFromState('node-x', a.getState());
      ab.applyState(b.getState());

      const ba = createPNCounterFromState('node-y', b.getState());
      ba.applyState(a.getState());

      // Assert
      expect(ab.get()).toBe(ba.get());
      expect(ab.get()).toBe(8); // (8-2) + (3-1) = 8
    });
  });

  describe('idempotency', () => {
    it('should produce same value when merged with self', () => {
      // Arrange
      const counter = createPNCounter('node-a');
      counter.increment(5);
      counter.decrement(2);

      // Act
      counter.applyState(counter.getState());

      // Assert
      expect(counter.get()).toBe(3);
    });

    it('should produce same value when applying same remote state repeatedly', () => {
      // Arrange
      const a = createPNCounter('node-a');
      const b = createPNCounter('node-b');
      a.increment(10);
      b.increment(5);
      const stateB = b.getState();

      // Act
      a.applyState(stateB);
      a.applyState(stateB);
      a.applyState(stateB);

      // Assert
      expect(a.get()).toBe(15);
    });
  });

  describe('factory from state', () => {
    it('should restore counter from serialized state', () => {
      // Arrange
      const original = createPNCounter('node-a');
      original.increment(20);
      original.decrement(7);

      // Act
      const restored = createPNCounterFromState('node-a', original.getState());

      // Assert
      expect(restored.get()).toBe(13);
    });
  });

  describe('utility functions', () => {
    it('should provide breakdown of counter state', () => {
      // Arrange
      const counter = createPNCounter('node-a');
      counter.increment(10);
      counter.decrement(3);

      // Act
      const breakdown = getPNCounterBreakdown(counter.getState());

      // Assert
      expect(breakdown.total).toBe(7);
      expect(breakdown.positiveTotal).toBe(10);
      expect(breakdown.negativeTotal).toBe(3);
      expect(breakdown.positiveByNode['node-a']).toBe(10);
      expect(breakdown.negativeByNode['node-a']).toBe(3);
    });

    it('should validate PNCounterState', () => {
      const counter = createPNCounter('node-a');
      counter.increment(5);
      expect(isPNCounterState(counter.getState())).toBe(true);
      expect(isPNCounterState(null)).toBe(false);
      expect(isPNCounterState({})).toBe(false);
    });
  });
});
