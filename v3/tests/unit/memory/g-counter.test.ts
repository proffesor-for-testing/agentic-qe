/**
 * G-Counter Unit Tests
 *
 * Tests for the Grow-only Counter CRDT implementation.
 * Verifies CRDT properties: convergence, commutativity, idempotency.
 */

import { describe, it, expect } from 'vitest';

import {
  createGCounter,
  createGCounterFromState,
  isGCounterState,
  getNodeCountFromState,
  getContributingNodes,
} from '../../../src/memory/crdt/g-counter.js';

describe('G-Counter', () => {
  describe('increment and value', () => {
    it('should start at zero', () => {
      // Arrange
      const counter = createGCounter('node-a');

      // Act
      const value = counter.get();

      // Assert
      expect(value).toBe(0);
    });

    it('should increment by 1 by default', () => {
      // Arrange
      const counter = createGCounter('node-a');

      // Act
      counter.increment();

      // Assert
      expect(counter.get()).toBe(1);
    });

    it('should increment by arbitrary positive value', () => {
      // Arrange
      const counter = createGCounter('node-a');

      // Act
      counter.increment(42);

      // Assert
      expect(counter.get()).toBe(42);
    });

    it('should accumulate multiple increments', () => {
      // Arrange
      const counter = createGCounter('node-a');

      // Act
      counter.increment(3);
      counter.increment(7);
      counter.increment(5);

      // Assert
      expect(counter.get()).toBe(15);
      expect(counter.getLocalCount()).toBe(15);
    });

    it('should reject negative increment values', () => {
      // Arrange
      const counter = createGCounter('node-a');

      // Act & Assert
      expect(() => counter.increment(-1)).toThrow('G-Counter can only increment by positive values');
    });

    it('should no-op on zero increment', () => {
      // Arrange
      const counter = createGCounter('node-a');
      counter.increment(5);
      const stateBefore = counter.getState();

      // Act
      counter.increment(0);

      // Assert
      expect(counter.get()).toBe(5);
      expect(counter.getState().version).toBe(stateBefore.version);
    });
  });

  describe('convergence after merge', () => {
    it('should converge two replicas with independent increments to same value', () => {
      // Arrange
      const replicaA = createGCounter('node-a');
      const replicaB = createGCounter('node-b');
      replicaA.increment(10);
      replicaB.increment(7);

      // Act - merge in both directions
      const mergedA = createGCounterFromState('node-a', replicaA.getState());
      mergedA.applyState(replicaB.getState());

      const mergedB = createGCounterFromState('node-b', replicaB.getState());
      mergedB.applyState(replicaA.getState());

      // Assert - both converge to 17
      expect(mergedA.get()).toBe(17);
      expect(mergedB.get()).toBe(17);
    });

    it('should converge three replicas after pairwise merges', () => {
      // Arrange
      const a = createGCounter('node-a');
      const b = createGCounter('node-b');
      const c = createGCounter('node-c');
      a.increment(5);
      b.increment(3);
      c.increment(8);

      // Act - merge all into each
      a.merge(b);
      a.merge(c);
      b.merge(a); // b now has a's merged state (which includes c)
      c.merge(a);

      // Assert
      expect(a.get()).toBe(16);
      expect(b.get()).toBe(16);
      expect(c.get()).toBe(16);
    });
  });

  describe('commutativity', () => {
    it('should produce same result regardless of merge order: merge(a,b) === merge(b,a)', () => {
      // Arrange
      const a = createGCounter('node-a');
      const b = createGCounter('node-b');
      a.increment(4);
      b.increment(9);

      // Act
      const ab = createGCounterFromState('node-x', a.getState());
      ab.applyState(b.getState());

      const ba = createGCounterFromState('node-y', b.getState());
      ba.applyState(a.getState());

      // Assert
      expect(ab.get()).toBe(ba.get());
      expect(ab.get()).toBe(13);
    });
  });

  describe('idempotency', () => {
    it('should produce same value when merging with self: merge(a,a) === a', () => {
      // Arrange
      const counter = createGCounter('node-a');
      counter.increment(7);
      const valueBefore = counter.get();

      // Act
      counter.applyState(counter.getState());

      // Assert
      expect(counter.get()).toBe(valueBefore);
      expect(counter.get()).toBe(7);
    });

    it('should produce same value when merging same state multiple times', () => {
      // Arrange
      const a = createGCounter('node-a');
      const b = createGCounter('node-b');
      a.increment(5);
      b.increment(3);
      const stateB = b.getState();

      // Act - apply same state 3 times
      a.applyState(stateB);
      a.applyState(stateB);
      a.applyState(stateB);

      // Assert
      expect(a.get()).toBe(8);
    });
  });

  describe('factory from state', () => {
    it('should restore counter from serialized state', () => {
      // Arrange
      const original = createGCounter('node-a');
      original.increment(12);
      const state = original.getState();

      // Act
      const restored = createGCounterFromState('node-a', state);

      // Assert
      expect(restored.get()).toBe(12);
      expect(restored.getLocalCount()).toBe(12);
    });
  });

  describe('type guards and utilities', () => {
    it('should validate correct GCounterState', () => {
      // Arrange
      const counter = createGCounter('node-a');
      counter.increment(5);
      const state = counter.getState();

      // Assert
      expect(isGCounterState(state)).toBe(true);
    });

    it('should reject invalid state objects', () => {
      expect(isGCounterState(null)).toBe(false);
      expect(isGCounterState({})).toBe(false);
      expect(isGCounterState({ counts: { a: -1 }, version: 0, lastUpdated: 0 })).toBe(false);
    });

    it('should get node count from state', () => {
      // Arrange
      const counter = createGCounter('node-a');
      counter.increment(8);

      // Act & Assert
      expect(getNodeCountFromState(counter.getState(), 'node-a')).toBe(8);
      expect(getNodeCountFromState(counter.getState(), 'node-b')).toBe(0);
    });

    it('should get contributing nodes', () => {
      // Arrange
      const a = createGCounter('node-a');
      const b = createGCounter('node-b');
      a.increment(3);
      b.increment(5);
      a.merge(b);

      // Act
      const contributors = getContributingNodes(a.getState());

      // Assert
      expect(contributors).toContain('node-a');
      expect(contributors).toContain('node-b');
      expect(contributors).toHaveLength(2);
    });
  });
});
