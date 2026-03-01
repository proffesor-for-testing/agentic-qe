/**
 * OR-Set Unit Tests
 *
 * Tests for the Observed-Remove Set CRDT implementation.
 * Verifies add-wins semantics, convergence, commutativity, idempotency.
 */

import { describe, it, expect } from 'vitest';

import {
  createORSet,
  createORSetFromState,
  isORSetState,
  getORSetStats,
  compactORSetState,
} from '../../../src/memory/crdt/or-set.js';

describe('OR-Set', () => {
  describe('add and remove', () => {
    it('should start empty', () => {
      // Arrange & Act
      const set = createORSet<string>('node-a');

      // Assert
      expect(set.size()).toBe(0);
      expect(set.values()).toEqual([]);
    });

    it('should add and check membership', () => {
      // Arrange
      const set = createORSet<string>('node-a');

      // Act
      set.add('apple');

      // Assert
      expect(set.has('apple')).toBe(true);
      expect(set.has('banana')).toBe(false);
      expect(set.size()).toBe(1);
    });

    it('should remove elements', () => {
      // Arrange
      const set = createORSet<string>('node-a');
      set.add('apple');
      set.add('banana');

      // Act
      set.remove('apple');

      // Assert
      expect(set.has('apple')).toBe(false);
      expect(set.has('banana')).toBe(true);
      expect(set.size()).toBe(1);
    });

    it('should allow re-adding a removed element', () => {
      // Arrange
      const set = createORSet<string>('node-a');
      set.add('apple');
      set.remove('apple');

      // Act
      set.add('apple');

      // Assert
      expect(set.has('apple')).toBe(true);
    });

    it('should handle removing non-existent element gracefully', () => {
      // Arrange
      const set = createORSet<string>('node-a');

      // Act & Assert - should not throw
      set.remove('ghost');
      expect(set.size()).toBe(0);
    });

    it('should clear all elements', () => {
      // Arrange
      const set = createORSet<string>('node-a');
      set.add('a');
      set.add('b');
      set.add('c');

      // Act
      set.clear();

      // Assert
      expect(set.size()).toBe(0);
      expect(set.has('a')).toBe(false);
    });
  });

  describe('convergence after merge', () => {
    it('should converge two replicas with different adds to union', () => {
      // Arrange
      const a = createORSet<string>('node-a');
      const b = createORSet<string>('node-b');
      a.add('apple');
      b.add('banana');

      // Act
      const mergedA = createORSetFromState<string>('node-a', a.getState());
      mergedA.applyState(b.getState());

      const mergedB = createORSetFromState<string>('node-b', b.getState());
      mergedB.applyState(a.getState());

      // Assert - both converge to {apple, banana}
      expect(mergedA.values().sort()).toEqual(['apple', 'banana']);
      expect(mergedB.values().sort()).toEqual(['apple', 'banana']);
    });

    it('should resolve concurrent add-remove with add-wins semantics', () => {
      // Arrange
      const a = createORSet<string>('node-a');
      const b = createORSet<string>('node-b');

      // Both start with 'apple'
      a.add('apple');
      b.applyState(a.getState());

      // Concurrently: A removes, B re-adds
      a.remove('apple');
      b.add('apple'); // creates a new tag that A's tombstone doesn't cover

      // Act - merge
      a.merge(b);

      // Assert - add wins over concurrent remove
      expect(a.has('apple')).toBe(true);
    });
  });

  describe('commutativity', () => {
    it('should produce same result regardless of merge order', () => {
      // Arrange
      const a = createORSet<string>('node-a');
      const b = createORSet<string>('node-b');
      a.add('x');
      a.add('y');
      b.add('y');
      b.add('z');

      // Act
      const ab = createORSetFromState<string>('node-x', a.getState());
      ab.applyState(b.getState());

      const ba = createORSetFromState<string>('node-y', b.getState());
      ba.applyState(a.getState());

      // Assert
      expect(ab.values().sort()).toEqual(ba.values().sort());
      expect(ab.values().sort()).toEqual(['x', 'y', 'z']);
    });
  });

  describe('idempotency', () => {
    it('should produce same set when merged with self', () => {
      // Arrange
      const set = createORSet<string>('node-a');
      set.add('hello');
      set.add('world');

      // Act
      set.applyState(set.getState());

      // Assert
      expect(set.size()).toBe(2);
      expect(set.values().sort()).toEqual(['hello', 'world']);
    });

    it('should produce same set when applying same remote state multiple times', () => {
      // Arrange
      const a = createORSet<string>('node-a');
      const b = createORSet<string>('node-b');
      a.add('local');
      b.add('remote');
      const stateB = b.getState();

      // Act
      a.applyState(stateB);
      a.applyState(stateB);
      a.applyState(stateB);

      // Assert
      expect(a.size()).toBe(2);
    });
  });

  describe('serialization types', () => {
    it('should handle number elements', () => {
      const set = createORSet<number>('node-a');
      set.add(42);
      set.add(0);
      expect(set.has(42)).toBe(true);
      expect(set.has(0)).toBe(true);
      expect(set.size()).toBe(2);
    });

    it('should handle boolean elements', () => {
      const set = createORSet<boolean>('node-a');
      set.add(true);
      set.add(false);
      expect(set.has(true)).toBe(true);
      expect(set.has(false)).toBe(true);
    });
  });

  describe('utility functions', () => {
    it('should compute OR-Set stats', () => {
      // Arrange
      const set = createORSet<string>('node-a');
      set.add('a');
      set.add('b');
      set.remove('a');

      // Act
      const stats = getORSetStats(set.getState());

      // Assert
      expect(stats.activeElements).toBe(1);
      expect(stats.totalTags).toBe(2);
      expect(stats.totalTombstones).toBe(1);
      expect(stats.elementsWithTombstones).toBe(1);
    });

    it('should compact state by removing fully tombstoned elements', () => {
      // Arrange
      const set = createORSet<string>('node-a');
      set.add('keep');
      set.add('remove-me');
      set.remove('remove-me');

      // Act
      const compacted = compactORSetState(set.getState());

      // Assert
      expect(Object.keys(compacted.elements)).toHaveLength(1);
      expect(compacted.tombstones).toEqual({});
    });

    it('should validate OR-Set state', () => {
      const set = createORSet<string>('node-a');
      set.add('test');
      expect(isORSetState(set.getState())).toBe(true);
      expect(isORSetState(null)).toBe(false);
      expect(isORSetState({})).toBe(false);
    });
  });
});
