/**
 * LWW-Register Unit Tests
 *
 * Tests for the Last-Write-Wins Register CRDT implementation.
 * Verifies timestamp-based conflict resolution and CRDT properties.
 */

import { describe, it, expect } from 'vitest';

import {
  createLWWRegister,
  createLWWRegisterFromState,
  isLWWRegisterState,
} from '../../../src/memory/crdt/lww-register.js';

describe('LWW-Register', () => {
  describe('get and set', () => {
    it('should start with undefined value when no initial value provided', () => {
      // Arrange & Act
      const register = createLWWRegister<string>('node-a');

      // Assert
      expect(register.get()).toBeUndefined();
    });

    it('should accept an initial value', () => {
      // Arrange & Act
      const register = createLWWRegister<string>('node-a', 'hello', 100);

      // Assert
      expect(register.get()).toBe('hello');
      expect(register.getTimestamp()).toBe(100);
    });

    it('should update value with set', () => {
      // Arrange
      const register = createLWWRegister<string>('node-a');

      // Act
      register.set('world', 200);

      // Assert
      expect(register.get()).toBe('world');
      expect(register.getTimestamp()).toBe(200);
    });

    it('should reject older writes (LWW semantics)', () => {
      // Arrange
      const register = createLWWRegister<string>('node-a');
      register.set('newer', 1000);

      // Act - try to set with older timestamp
      register.set('older', 500);

      // Assert - newer value persists
      expect(register.get()).toBe('newer');
      expect(register.getTimestamp()).toBe(1000);
    });

    it('should resolve timestamp ties using node ID lexicographic order', () => {
      // Arrange
      const regA = createLWWRegister<string>('node-a');
      const regB = createLWWRegister<string>('node-b');

      // Act - both set at same timestamp
      regA.set('from-a', 1000);
      regB.set('from-b', 1000);

      // Merge B into A
      regA.merge(regB);

      // Assert - 'node-b' > 'node-a' lexicographically, so B wins
      expect(regA.get()).toBe('from-b');
    });
  });

  describe('convergence after merge', () => {
    it('should converge two replicas to the value with the latest timestamp', () => {
      // Arrange
      const replicaA = createLWWRegister<string>('node-a');
      const replicaB = createLWWRegister<string>('node-b');
      replicaA.set('value-a', 100);
      replicaB.set('value-b', 200);

      // Act
      const mergedA = createLWWRegisterFromState<string>('node-a', replicaA.getState());
      mergedA.applyState(replicaB.getState());

      const mergedB = createLWWRegisterFromState<string>('node-b', replicaB.getState());
      mergedB.applyState(replicaA.getState());

      // Assert - both converge to value-b (timestamp 200 wins)
      expect(mergedA.get()).toBe('value-b');
      expect(mergedB.get()).toBe('value-b');
    });
  });

  describe('commutativity', () => {
    it('should produce same result regardless of merge order', () => {
      // Arrange
      const a = createLWWRegister<number>('node-a');
      const b = createLWWRegister<number>('node-b');
      a.set(42, 100);
      b.set(99, 200);

      // Act - merge(a,b)
      const ab = createLWWRegisterFromState<number>('node-x', a.getState());
      ab.applyState(b.getState());

      // Act - merge(b,a)
      const ba = createLWWRegisterFromState<number>('node-y', b.getState());
      ba.applyState(a.getState());

      // Assert
      expect(ab.get()).toBe(ba.get());
      expect(ab.get()).toBe(99);
    });
  });

  describe('idempotency', () => {
    it('should produce same value when merged with self', () => {
      // Arrange
      const register = createLWWRegister<string>('node-a');
      register.set('hello', 500);

      // Act
      register.applyState(register.getState());

      // Assert
      expect(register.get()).toBe('hello');
    });

    it('should produce same value when applying same remote state multiple times', () => {
      // Arrange
      const a = createLWWRegister<string>('node-a');
      const b = createLWWRegister<string>('node-b');
      a.set('local', 100);
      b.set('remote', 200);
      const stateB = b.getState();

      // Act
      a.applyState(stateB);
      a.applyState(stateB);
      a.applyState(stateB);

      // Assert
      expect(a.get()).toBe('remote');
    });
  });

  describe('complex value types', () => {
    it('should store object values', () => {
      // Arrange
      const register = createLWWRegister<{ name: string; count: number }>('node-a');

      // Act
      register.set({ name: 'test', count: 42 }, 100);

      // Assert
      expect(register.get()).toEqual({ name: 'test', count: 42 });
    });
  });

  describe('type guards', () => {
    it('should validate correct LWWRegisterState', () => {
      // Arrange
      const register = createLWWRegister<string>('node-a', 'hello', 100);

      // Assert
      expect(isLWWRegisterState(register.getState())).toBe(true);
    });

    it('should reject invalid state objects', () => {
      expect(isLWWRegisterState(null)).toBe(false);
      expect(isLWWRegisterState({})).toBe(false);
      expect(isLWWRegisterState({ timestamp: 'not-a-number', nodeId: '', version: 0, lastUpdated: 0, value: null })).toBe(false);
    });
  });
});
