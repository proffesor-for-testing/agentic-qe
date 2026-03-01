/**
 * CRDT Module Tests
 *
 * Comprehensive tests for Conflict-free Replicated Data Types including:
 * - LWW-Register (Last-Write-Wins)
 * - G-Counter (Grow-only)
 * - PN-Counter (Positive-Negative)
 * - OR-Set (Observed-Remove Set)
 * - CRDT Store (Unified store)
 * - Convergence Tracker
 *
 * Tests verify CRDT properties:
 * - Commutativity: merge(a, b) = merge(b, a)
 * - Associativity: merge(merge(a, b), c) = merge(a, merge(b, c))
 * - Idempotency: merge(a, a) = a
 * - Eventual consistency
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  // LWW Register
  createLWWRegister,
  createLWWRegisterFromState,
  isLWWRegisterState,

  // G-Counter
  createGCounter,
  createGCounterFromState,
  isGCounterState,
  getContributingNodes,

  // PN-Counter
  createPNCounter,
  createPNCounterFromState,
  isPNCounterState,
  getPNCounterBreakdown,

  // OR-Set
  createORSet,
  createORSetFromState,
  isORSetState,
  getORSetStats,
  compactORSetState,

  // CRDT Store
  createCRDTStore,
  createCRDTStoreFromState,
  isCRDTStoreState,
  isCRDTStoreDelta,

  // Convergence Tracker
  createConvergenceTracker,
  createMetricsConvergenceTracker,

  // Types
  type LWWRegisterState,
  type GCounterState,
  type PNCounterState,
  type ORSetState,
  type CRDTStoreState,
} from '../../../src/memory/crdt/index.js';

// =============================================================================
// LWW-Register Tests
// =============================================================================

describe('LWW-Register', () => {
  describe('basic operations', () => {
    it('should return undefined for uninitialized register', () => {
      const reg = createLWWRegister<string>('node-1');
      expect(reg.get()).toBeUndefined();
    });

    it('should store and retrieve a value', () => {
      const reg = createLWWRegister<string>('node-1');
      reg.set('hello');
      expect(reg.get()).toBe('hello');
    });

    it('should store complex objects', () => {
      const reg = createLWWRegister<{ name: string; age: number }>('node-1');
      reg.set({ name: 'Alice', age: 30 });
      expect(reg.get()).toEqual({ name: 'Alice', age: 30 });
    });

    it('should update value with newer timestamp', () => {
      const reg = createLWWRegister<string>('node-1');
      reg.set('first', 1000);
      reg.set('second', 2000);
      expect(reg.get()).toBe('second');
    });

    it('should ignore value with older timestamp', () => {
      const reg = createLWWRegister<string>('node-1');
      reg.set('first', 2000);
      reg.set('second', 1000);
      expect(reg.get()).toBe('first');
    });

    it('should use nodeId as tiebreaker for same timestamp', () => {
      const regA = createLWWRegister<string>('node-a');
      const regB = createLWWRegister<string>('node-b');

      regA.set('from-a', 1000);
      regB.set('from-b', 1000);

      // Merge: node-b wins because 'node-b' > 'node-a' lexicographically
      regA.merge(regB);
      expect(regA.get()).toBe('from-b');
    });

    it('should return correct nodeId', () => {
      const reg = createLWWRegister<string>('my-node');
      expect(reg.getNodeId()).toBe('my-node');
    });

    it('should return correct timestamp', () => {
      const reg = createLWWRegister<string>('node-1');
      reg.set('value', 12345);
      expect(reg.getTimestamp()).toBe(12345);
    });
  });

  describe('merge operations', () => {
    it('should merge registers from different nodes', () => {
      const regA = createLWWRegister<string>('node-a');
      const regB = createLWWRegister<string>('node-b');

      regA.set('value-a', 1000);
      regB.set('value-b', 2000);

      regA.merge(regB);
      expect(regA.get()).toBe('value-b');
    });

    it('should be commutative', () => {
      const regA = createLWWRegister<string>('node-a');
      const regB = createLWWRegister<string>('node-b');

      regA.set('value-a', 1000);
      regB.set('value-b', 2000);

      const regA1 = createLWWRegister<string>('node-a');
      regA1.applyState(regA.getState());
      regA1.merge(regB);

      const regB1 = createLWWRegister<string>('node-b');
      regB1.applyState(regB.getState());
      regB1.merge(regA);

      expect(regA1.get()).toBe(regB1.get());
    });

    it('should be idempotent', () => {
      const regA = createLWWRegister<string>('node-a');
      regA.set('value', 1000);

      const valueBefore = regA.get();
      regA.merge(regA);
      expect(regA.get()).toBe(valueBefore);
    });
  });

  describe('state operations', () => {
    it('should get state for replication', () => {
      const reg = createLWWRegister<string>('node-1');
      reg.set('hello', 1000);

      const state = reg.getState();
      expect(state.value).toBe('hello');
      expect(state.timestamp).toBe(1000);
      expect(state.nodeId).toBe('node-1');
      expect(state.version).toBeGreaterThan(0);
    });

    it('should apply state from another register', () => {
      const regA = createLWWRegister<string>('node-a');
      regA.set('original', 2000);

      const regB = createLWWRegister<string>('node-b');
      regB.applyState(regA.getState());

      expect(regB.get()).toBe('original');
    });

    it('should create register from existing state', () => {
      const state: LWWRegisterState<string> = {
        value: 'restored',
        timestamp: 5000,
        nodeId: 'old-node',
        version: 10,
        lastUpdated: Date.now(),
      };

      const reg = createLWWRegisterFromState('new-node', state);
      expect(reg.get()).toBe('restored');
      expect(reg.getNodeId()).toBe('new-node');
    });

    it('should validate state correctly', () => {
      expect(isLWWRegisterState({
        value: 'test',
        timestamp: 1000,
        nodeId: 'node-1',
        version: 1,
        lastUpdated: Date.now(),
      })).toBe(true);

      expect(isLWWRegisterState(null)).toBe(false);
      expect(isLWWRegisterState({ timestamp: 'invalid' })).toBe(false);
    });
  });
});

// =============================================================================
// G-Counter Tests
// =============================================================================

describe('G-Counter', () => {
  describe('basic operations', () => {
    it('should start at zero', () => {
      const counter = createGCounter('node-1');
      expect(counter.get()).toBe(0);
    });

    it('should increment by 1 by default', () => {
      const counter = createGCounter('node-1');
      counter.increment();
      expect(counter.get()).toBe(1);
    });

    it('should increment by specified amount', () => {
      const counter = createGCounter('node-1');
      counter.increment(5);
      expect(counter.get()).toBe(5);
    });

    it('should accumulate multiple increments', () => {
      const counter = createGCounter('node-1');
      counter.increment(3);
      counter.increment(2);
      counter.increment(1);
      expect(counter.get()).toBe(6);
    });

    it('should throw for negative increment', () => {
      const counter = createGCounter('node-1');
      expect(() => counter.increment(-1)).toThrow();
    });

    it('should handle zero increment gracefully', () => {
      const counter = createGCounter('node-1');
      counter.increment(5);
      counter.increment(0);
      expect(counter.get()).toBe(5);
    });

    it('should track local count', () => {
      const counter = createGCounter('node-1');
      counter.increment(10);
      expect(counter.getLocalCount()).toBe(10);
    });
  });

  describe('merge operations', () => {
    it('should merge counters from different nodes', () => {
      const counterA = createGCounter('node-a');
      const counterB = createGCounter('node-b');

      counterA.increment(5);
      counterB.increment(3);

      counterA.merge(counterB);
      expect(counterA.get()).toBe(8);
    });

    it('should be commutative', () => {
      const counterA = createGCounter('node-a');
      const counterB = createGCounter('node-b');

      counterA.increment(5);
      counterB.increment(3);

      const counterA1 = createGCounterFromState('node-a', counterA.getState());
      counterA1.merge(counterB);

      const counterB1 = createGCounterFromState('node-b', counterB.getState());
      counterB1.merge(counterA);

      expect(counterA1.get()).toBe(counterB1.get());
    });

    it('should be associative', () => {
      const counterA = createGCounter('node-a');
      const counterB = createGCounter('node-b');
      const counterC = createGCounter('node-c');

      counterA.increment(2);
      counterB.increment(3);
      counterC.increment(4);

      // (A merge B) merge C
      const result1 = createGCounterFromState('test', counterA.getState());
      result1.merge(counterB);
      result1.merge(counterC);

      // A merge (B merge C)
      const tempBC = createGCounterFromState('test', counterB.getState());
      tempBC.merge(counterC);
      const result2 = createGCounterFromState('test', counterA.getState());
      result2.merge(tempBC);

      expect(result1.get()).toBe(result2.get());
    });

    it('should be idempotent', () => {
      const counter = createGCounter('node-1');
      counter.increment(5);

      const valueBefore = counter.get();
      counter.merge(counter);
      expect(counter.get()).toBe(valueBefore);
    });

    it('should take max for each node on merge', () => {
      const counterA = createGCounter('node-a');
      counterA.increment(10);

      const counterB = createGCounterFromState('node-b', counterA.getState());
      // Both have node-a: 10

      counterA.increment(5); // node-a: 15
      counterB.increment(3); // node-a: 10, node-b: 3

      counterA.merge(counterB);
      // node-a: max(15, 10) = 15, node-b: 3
      expect(counterA.get()).toBe(18);
    });
  });

  describe('utility functions', () => {
    it('should get contributing nodes', () => {
      const counter = createGCounter('node-1');
      counter.increment(5);

      const counter2 = createGCounter('node-2');
      counter2.increment(3);

      counter.merge(counter2);

      const nodes = getContributingNodes(counter.getState());
      expect(nodes).toContain('node-1');
      expect(nodes).toContain('node-2');
    });

    it('should validate state correctly', () => {
      expect(isGCounterState({
        counts: { 'node-1': 5 },
        version: 1,
        lastUpdated: Date.now(),
      })).toBe(true);

      expect(isGCounterState(null)).toBe(false);
      expect(isGCounterState({ counts: 'invalid' })).toBe(false);
    });
  });
});

// =============================================================================
// PN-Counter Tests
// =============================================================================

describe('PN-Counter', () => {
  describe('basic operations', () => {
    it('should start at zero', () => {
      const counter = createPNCounter('node-1');
      expect(counter.get()).toBe(0);
    });

    it('should increment correctly', () => {
      const counter = createPNCounter('node-1');
      counter.increment(5);
      expect(counter.get()).toBe(5);
    });

    it('should decrement correctly', () => {
      const counter = createPNCounter('node-1');
      counter.increment(10);
      counter.decrement(3);
      expect(counter.get()).toBe(7);
    });

    it('should support negative values', () => {
      const counter = createPNCounter('node-1');
      counter.decrement(5);
      expect(counter.get()).toBe(-5);
    });

    it('should throw for negative increment value', () => {
      const counter = createPNCounter('node-1');
      expect(() => counter.increment(-1)).toThrow();
    });

    it('should throw for negative decrement value', () => {
      const counter = createPNCounter('node-1');
      expect(() => counter.decrement(-1)).toThrow();
    });
  });

  describe('merge operations', () => {
    it('should merge counters from different nodes', () => {
      const counterA = createPNCounter('node-a');
      const counterB = createPNCounter('node-b');

      counterA.increment(10);
      counterA.decrement(2);

      counterB.increment(5);
      counterB.decrement(1);

      counterA.merge(counterB);
      // A: +10, -2 = 8
      // B: +5, -1 = 4
      // Merged: +15, -3 = 12
      expect(counterA.get()).toBe(12);
    });

    it('should be commutative', () => {
      const counterA = createPNCounter('node-a');
      const counterB = createPNCounter('node-b');

      counterA.increment(5);
      counterA.decrement(2);
      counterB.increment(3);

      const counterA1 = createPNCounterFromState('test-a', counterA.getState());
      counterA1.merge(counterB);

      const counterB1 = createPNCounterFromState('test-b', counterB.getState());
      counterB1.merge(counterA);

      expect(counterA1.get()).toBe(counterB1.get());
    });

    it('should be idempotent', () => {
      const counter = createPNCounter('node-1');
      counter.increment(10);
      counter.decrement(3);

      const valueBefore = counter.get();
      counter.merge(counter);
      expect(counter.get()).toBe(valueBefore);
    });
  });

  describe('utility functions', () => {
    it('should provide breakdown of counter state', () => {
      const counter = createPNCounter('node-1');
      counter.increment(10);
      counter.decrement(3);

      const breakdown = getPNCounterBreakdown(counter.getState());
      expect(breakdown.total).toBe(7);
      expect(breakdown.positiveTotal).toBe(10);
      expect(breakdown.negativeTotal).toBe(3);
    });

    it('should validate state correctly', () => {
      const counter = createPNCounter('node-1');
      counter.increment(5);
      expect(isPNCounterState(counter.getState())).toBe(true);

      expect(isPNCounterState(null)).toBe(false);
      expect(isPNCounterState({ positive: 'invalid' })).toBe(false);
    });
  });
});

// =============================================================================
// OR-Set Tests
// =============================================================================

describe('OR-Set', () => {
  describe('basic operations', () => {
    it('should start empty', () => {
      const set = createORSet<string>('node-1');
      expect(set.size()).toBe(0);
      expect(set.values()).toEqual([]);
    });

    it('should add elements', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      expect(set.has('apple')).toBe(true);
      expect(set.size()).toBe(1);
    });

    it('should remove elements', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      set.remove('apple');
      expect(set.has('apple')).toBe(false);
      expect(set.size()).toBe(0);
    });

    it('should handle multiple elements', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      set.add('banana');
      set.add('cherry');

      expect(set.size()).toBe(3);
      expect(set.values()).toContain('apple');
      expect(set.values()).toContain('banana');
      expect(set.values()).toContain('cherry');
    });

    it('should handle re-adding removed elements', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      set.remove('apple');
      set.add('apple');
      expect(set.has('apple')).toBe(true);
    });

    it('should handle objects', () => {
      const set = createORSet<{ id: number; name: string }>('node-1');
      set.add({ id: 1, name: 'item1' });
      expect(set.has({ id: 1, name: 'item1' })).toBe(true);
    });

    it('should handle numbers', () => {
      const set = createORSet<number>('node-1');
      set.add(42);
      set.add(3.14);
      expect(set.has(42)).toBe(true);
      expect(set.has(3.14)).toBe(true);
    });

    it('should handle booleans', () => {
      const set = createORSet<boolean>('node-1');
      set.add(true);
      set.add(false);
      expect(set.has(true)).toBe(true);
      expect(set.has(false)).toBe(true);
    });

    it('should clear all elements', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      set.add('banana');
      set.clear();
      expect(set.size()).toBe(0);
    });
  });

  describe('merge operations', () => {
    it('should merge sets from different nodes', () => {
      const setA = createORSet<string>('node-a');
      const setB = createORSet<string>('node-b');

      setA.add('apple');
      setB.add('banana');

      setA.merge(setB);
      expect(setA.has('apple')).toBe(true);
      expect(setA.has('banana')).toBe(true);
      expect(setA.size()).toBe(2);
    });

    it('should be commutative', () => {
      const setA = createORSet<string>('node-a');
      const setB = createORSet<string>('node-b');

      setA.add('apple');
      setB.add('banana');

      const setA1 = createORSetFromState<string>('test-a', setA.getState());
      setA1.merge(setB);

      const setB1 = createORSetFromState<string>('test-b', setB.getState());
      setB1.merge(setA);

      expect(setA1.values().sort()).toEqual(setB1.values().sort());
    });

    it('should be idempotent', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      set.add('banana');

      const valuesBefore = set.values().sort();
      set.merge(set);
      expect(set.values().sort()).toEqual(valuesBefore);
    });

    it('should handle concurrent add-remove (add wins)', () => {
      // Node A adds 'apple', Node B removes 'apple' concurrently
      const setA = createORSet<string>('node-a');
      const setB = createORSet<string>('node-b');

      // Both start with 'apple'
      setA.add('apple');
      setB.applyState(setA.getState());

      // Concurrent operations
      setA.add('apple'); // Re-add with new tag
      setB.remove('apple'); // Remove with old tag

      // Merge
      setA.merge(setB);
      setB.merge(setA);

      // Add wins: both should have 'apple'
      expect(setA.has('apple')).toBe(true);
      expect(setB.has('apple')).toBe(true);
    });
  });

  describe('utility functions', () => {
    it('should get set statistics', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      set.add('banana');
      set.remove('apple');

      const stats = getORSetStats(set.getState());
      expect(stats.activeElements).toBe(1);
      expect(stats.totalTags).toBeGreaterThanOrEqual(2);
      expect(stats.totalTombstones).toBeGreaterThanOrEqual(1);
    });

    it('should compact state', () => {
      const set = createORSet<string>('node-1');
      set.add('apple');
      set.add('banana');
      set.remove('apple');

      const originalState = set.getState();
      const compactedState = compactORSetState(originalState);

      // Compacted state should not have apple's tags
      expect(Object.keys(compactedState.elements)).not.toContain(
        expect.stringContaining('apple')
      );
    });

    it('should validate state correctly', () => {
      const set = createORSet<string>('node-1');
      set.add('test');
      expect(isORSetState(set.getState())).toBe(true);

      expect(isORSetState(null)).toBe(false);
      expect(isORSetState({ elements: 'invalid' })).toBe(false);
    });
  });
});

// =============================================================================
// CRDT Store Tests
// =============================================================================

describe('CRDTStore', () => {
  let store: ReturnType<typeof createCRDTStore>;

  beforeEach(() => {
    store = createCRDTStore({ nodeId: 'test-node' });
  });

  describe('register management', () => {
    it('should create and get registers', () => {
      store.setRegister('config', { maxAgents: 100 });
      expect(store.getRegister('config').get()).toEqual({ maxAgents: 100 });
    });

    it('should check if register exists', () => {
      expect(store.hasRegister('config')).toBe(false);
      store.setRegister('config', { value: 1 });
      expect(store.hasRegister('config')).toBe(true);
    });

    it('should delete registers', () => {
      store.setRegister('config', { value: 1 });
      expect(store.deleteRegister('config')).toBe(true);
      expect(store.hasRegister('config')).toBe(false);
    });
  });

  describe('g-counter management', () => {
    it('should create and increment G-Counters', () => {
      store.incrementGCounter('events', 5);
      expect(store.getGCounter('events').get()).toBe(5);
    });

    it('should check if G-Counter exists', () => {
      expect(store.hasGCounter('events')).toBe(false);
      store.incrementGCounter('events');
      expect(store.hasGCounter('events')).toBe(true);
    });
  });

  describe('pn-counter management', () => {
    it('should create and use PN-Counters', () => {
      store.incrementCounter('tasks', 10);
      store.decrementCounter('tasks', 3);
      expect(store.getCounter('tasks').get()).toBe(7);
    });

    it('should check if PN-Counter exists', () => {
      expect(store.hasCounter('tasks')).toBe(false);
      store.incrementCounter('tasks');
      expect(store.hasCounter('tasks')).toBe(true);
    });
  });

  describe('or-set management', () => {
    it('should create and use OR-Sets', () => {
      store.addToSet('agents', 'agent-1');
      store.addToSet('agents', 'agent-2');
      expect(store.getSet<string>('agents').has('agent-1')).toBe(true);
      expect(store.getSet<string>('agents').size()).toBe(2);
    });

    it('should remove from sets', () => {
      store.addToSet('agents', 'agent-1');
      store.removeFromSet('agents', 'agent-1');
      expect(store.getSet<string>('agents').has('agent-1')).toBe(false);
    });
  });

  describe('merge operations', () => {
    it('should merge entire stores', () => {
      const storeA = createCRDTStore({ nodeId: 'node-a' });
      const storeB = createCRDTStore({ nodeId: 'node-b' });

      storeA.setRegister('config', { maxAgents: 100 });
      storeA.incrementCounter('tasks', 5);
      storeA.addToSet('agents', 'agent-a');

      storeB.incrementCounter('tasks', 3);
      storeB.addToSet('agents', 'agent-b');

      storeA.merge(storeB);

      expect(storeA.getCounter('tasks').get()).toBe(8);
      expect(storeA.getSet<string>('agents').values()).toContain('agent-a');
      expect(storeA.getSet<string>('agents').values()).toContain('agent-b');
    });

    it('should achieve eventual consistency', () => {
      const storeA = createCRDTStore({ nodeId: 'node-a' });
      const storeB = createCRDTStore({ nodeId: 'node-b' });

      // Concurrent operations
      storeA.incrementCounter('count', 5);
      storeB.incrementCounter('count', 3);

      // Merge in different orders
      const storeA1 = createCRDTStoreFromState('test-a', storeA.getState());
      storeA1.merge(storeB);

      const storeB1 = createCRDTStoreFromState('test-b', storeB.getState());
      storeB1.merge(storeA);

      // Both should converge to same value
      expect(storeA1.getCounter('count').get()).toBe(storeB1.getCounter('count').get());
    });
  });

  describe('state operations', () => {
    it('should get full state', () => {
      store.setRegister('config', { value: 1 });
      store.incrementCounter('tasks', 5);
      store.addToSet('agents', 'agent-1');

      const state = store.getState();

      expect(state.nodeId).toBe('test-node');
      expect(state.version).toBeGreaterThan(0);
      expect(Object.keys(state.registers)).toContain('config');
      expect(Object.keys(state.pnCounters)).toContain('tasks');
      expect(Object.keys(state.sets)).toContain('agents');
    });

    it('should apply full state', () => {
      const storeA = createCRDTStore({ nodeId: 'node-a' });
      storeA.setRegister('config', { maxAgents: 50 });

      const storeB = createCRDTStore({ nodeId: 'node-b' });
      storeB.applyState(storeA.getState());

      expect(storeB.getRegister('config').get()).toEqual({ maxAgents: 50 });
    });

    it('should validate state correctly', () => {
      expect(isCRDTStoreState(store.getState())).toBe(true);
      expect(isCRDTStoreState(null)).toBe(false);
      expect(isCRDTStoreState({ version: 'invalid' })).toBe(false);
    });
  });

  describe('delta replication', () => {
    it('should generate deltas since version', () => {
      // First operation
      store.incrementCounter('tasks', 5);
      // Force flush of pending changes by getting state (which calls flushDelta)
      store.getState();
      const v1 = store.getVersion();

      // More operations after v1
      store.incrementCounter('tasks', 3);
      store.addToSet('agents', 'agent-1');
      // Force another flush
      store.getState();

      const delta = store.getDelta(v1);
      expect(delta).not.toBeNull();
      // Delta should cover changes after v1
      expect(delta!.toVersion).toBeGreaterThan(v1);
      expect(delta!.pnCounters).toBeDefined();
      expect(delta!.sets).toBeDefined();
    });

    it('should apply deltas', () => {
      const storeA = createCRDTStore({ nodeId: 'node-a' });
      storeA.incrementCounter('tasks', 10);

      const storeB = createCRDTStore({ nodeId: 'node-b' });

      // Get delta and apply
      const delta = storeA.getDelta(0);
      if (delta) {
        storeB.applyDelta(delta);
      }

      expect(storeB.getCounter('tasks').get()).toBe(10);
    });

    it('should validate delta correctly', () => {
      const delta = store.getDelta(0);
      if (delta) {
        expect(isCRDTStoreDelta(delta)).toBe(true);
      }
      expect(isCRDTStoreDelta(null)).toBe(false);
      expect(isCRDTStoreDelta({ fromVersion: 'invalid' })).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit change events', () => {
      const events: Array<{ key: string; type: string }> = [];
      store.on('change', (event) => {
        events.push({ key: event.key, type: event.type });
      });

      store.setRegister('config', { value: 1 });
      store.incrementCounter('tasks');

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ key: 'config', type: 'lww-register' });
      expect(events[1]).toEqual({ key: 'tasks', type: 'pn-counter' });
    });

    it('should unsubscribe from events', () => {
      const events: string[] = [];
      const unsubscribe = store.on('change', (event) => {
        events.push(event.key);
      });

      store.incrementCounter('before');
      unsubscribe();
      store.incrementCounter('after');

      expect(events).toEqual(['before']);
    });
  });

  describe('utilities', () => {
    it('should list keys by type', () => {
      store.setRegister('config1', {});
      store.setRegister('config2', {});
      store.incrementCounter('count1');

      expect(store.keys('lww-register')).toEqual(['config1', 'config2']);
      expect(store.keys('pn-counter')).toEqual(['count1']);
    });

    it('should get stats', () => {
      store.setRegister('config', {});
      store.incrementCounter('tasks');
      store.addToSet('agents', 'a1');

      const stats = store.getStats();
      expect(stats.registers).toBe(1);
      expect(stats.pnCounters).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.total).toBe(3);
      expect(stats.nodeId).toBe('test-node');
    });

    it('should clear all data', () => {
      store.setRegister('config', {});
      store.incrementCounter('tasks');
      store.clear();

      expect(store.getStats().total).toBe(0);
    });
  });
});

// =============================================================================
// Convergence Tracker Tests
// =============================================================================

describe('ConvergenceTracker', () => {
  describe('basic operations', () => {
    it('should start converged with no nodes', () => {
      const tracker = createConvergenceTracker();
      expect(tracker.hasConverged()).toBe(true);
    });

    it('should track node states', () => {
      const tracker = createConvergenceTracker();
      const store = createCRDTStore({ nodeId: 'node-1' });
      store.incrementCounter('tasks', 5);

      tracker.recordNodeState('node-1', store.getState());
      expect(tracker.isTracking('node-1')).toBe(true);
      expect(tracker.getTrackedNodes()).toContain('node-1');
    });

    it('should detect convergence', () => {
      const tracker = createConvergenceTracker();

      const storeA = createCRDTStore({ nodeId: 'node-a' });
      const storeB = createCRDTStore({ nodeId: 'node-b' });

      storeA.incrementCounter('tasks', 5);
      storeB.applyState(storeA.getState());

      tracker.recordNodeState('node-a', storeA.getState());
      tracker.recordNodeState('node-b', storeB.getState());

      expect(tracker.hasConverged()).toBe(true);
    });

    it('should detect divergence', () => {
      const tracker = createConvergenceTracker();

      const storeA = createCRDTStore({ nodeId: 'node-a' });
      const storeB = createCRDTStore({ nodeId: 'node-b' });

      storeA.incrementCounter('tasks', 5);
      storeB.incrementCounter('tasks', 3);

      tracker.recordNodeState('node-a', storeA.getState());
      tracker.recordNodeState('node-b', storeB.getState());

      expect(tracker.hasConverged()).toBe(false);
    });
  });

  describe('convergence status', () => {
    it('should provide detailed status', () => {
      const tracker = createConvergenceTracker();

      const storeA = createCRDTStore({ nodeId: 'node-a' });
      const storeB = createCRDTStore({ nodeId: 'node-b' });

      storeA.incrementCounter('tasks', 5);
      storeB.incrementCounter('tasks', 3);

      tracker.recordNodeState('node-a', storeA.getState());
      tracker.recordNodeState('node-b', storeB.getState());

      const status = tracker.getStatus();
      expect(status.nodeCount).toBe(2);
      expect(status.converged).toBe(false);
      expect(status.laggingNodes.length).toBeGreaterThan(0);
    });

    it('should get lagging nodes', () => {
      const tracker = createConvergenceTracker();

      const storeA = createCRDTStore({ nodeId: 'node-a' });
      const storeB = createCRDTStore({ nodeId: 'node-b' });

      // A has more changes than B
      storeA.incrementCounter('tasks', 10);
      storeA.addToSet('agents', 'a1');
      storeB.incrementCounter('tasks', 5);

      tracker.recordNodeState('node-a', storeA.getState());
      tracker.recordNodeState('node-b', storeB.getState());

      const lagging = tracker.getLaggingNodes();
      expect(lagging.length).toBeGreaterThan(0);
    });
  });

  describe('time tracking', () => {
    it('should track time since convergence', async () => {
      const tracker = createConvergenceTracker();

      const store = createCRDTStore({ nodeId: 'node-1' });
      tracker.recordNodeState('node-1', store.getState());

      // Wait a bit - use 50ms to be more reliable across different environments
      await new Promise((resolve) => setTimeout(resolve, 50));

      const timeSince = tracker.getTimeSinceConvergence();
      expect(timeSince).not.toBeNull();
      // Allow for some timing variance by checking >= 40ms instead of exact 50ms
      expect(timeSince!).toBeGreaterThanOrEqual(40);
    });
  });

  describe('node management', () => {
    it('should remove nodes', () => {
      const tracker = createConvergenceTracker();
      const store = createCRDTStore({ nodeId: 'node-1' });

      tracker.recordNodeState('node-1', store.getState());
      expect(tracker.isTracking('node-1')).toBe(true);

      tracker.removeNode('node-1');
      expect(tracker.isTracking('node-1')).toBe(false);
    });

    it('should clear all state', () => {
      const tracker = createConvergenceTracker();

      const storeA = createCRDTStore({ nodeId: 'node-a' });
      const storeB = createCRDTStore({ nodeId: 'node-b' });

      tracker.recordNodeState('node-a', storeA.getState());
      tracker.recordNodeState('node-b', storeB.getState());

      tracker.clear();
      expect(tracker.getTrackedNodes()).toHaveLength(0);
    });

    it('should get node version', () => {
      const tracker = createConvergenceTracker();
      const store = createCRDTStore({ nodeId: 'node-1' });
      store.incrementCounter('tasks', 5);

      tracker.recordNodeState('node-1', store.getState());

      const version = tracker.getNodeVersion('node-1');
      expect(version).not.toBeNull();
      expect(version).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Metrics Convergence Tracker Tests
// =============================================================================

describe('MetricsConvergenceTracker', () => {
  it('should track convergence metrics', () => {
    const tracker = createMetricsConvergenceTracker();

    const store = createCRDTStore({ nodeId: 'node-1' });
    tracker.recordNodeState('node-1', store.getState());

    const metrics = tracker.getMetrics();
    expect(metrics.convergenceCount).toBeGreaterThanOrEqual(0);
    expect(metrics.trackingDuration).toBeGreaterThanOrEqual(0);
    expect(metrics.convergenceRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.convergenceRatio).toBeLessThanOrEqual(1);
  });

  it('should reset metrics', () => {
    const tracker = createMetricsConvergenceTracker();

    const store = createCRDTStore({ nodeId: 'node-1' });
    tracker.recordNodeState('node-1', store.getState());

    tracker.resetMetrics();

    const metrics = tracker.getMetrics();
    expect(metrics.convergenceCount).toBe(0);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('CRDT Integration', () => {
  it('should maintain consistency across multiple agents', () => {
    // Simulate 3 agents with concurrent operations
    const agents = [
      createCRDTStore({ nodeId: 'agent-1' }),
      createCRDTStore({ nodeId: 'agent-2' }),
      createCRDTStore({ nodeId: 'agent-3' }),
    ];

    // Each agent performs operations
    agents[0].incrementCounter('task-count');
    agents[0].addToSet('active-agents', 'agent-1');

    agents[1].incrementCounter('task-count');
    agents[1].addToSet('active-agents', 'agent-2');

    agents[2].incrementCounter('task-count');
    agents[2].addToSet('active-agents', 'agent-3');

    // Merge all agents (simulating gossip)
    for (let i = 0; i < agents.length; i++) {
      for (let j = 0; j < agents.length; j++) {
        if (i !== j) {
          agents[i].merge(agents[j]);
        }
      }
    }

    // All agents should have same values
    for (const agent of agents) {
      expect(agent.getCounter('task-count').get()).toBe(3);
      expect(agent.getSet<string>('active-agents').size()).toBe(3);
    }
  });

  it('should handle network partitions and healing', () => {
    // Two agents in different partitions
    const agentA = createCRDTStore({ nodeId: 'partition-a' });
    const agentB = createCRDTStore({ nodeId: 'partition-b' });

    // Operations during partition
    agentA.incrementCounter('ops', 10);
    agentA.setRegister('config', { setting: 'A' }, );

    agentB.incrementCounter('ops', 5);
    agentB.setRegister('config', { setting: 'B' });

    // Partition heals - merge
    agentA.merge(agentB);
    agentB.merge(agentA);

    // Both should have combined ops count
    expect(agentA.getCounter('ops').get()).toBe(15);
    expect(agentB.getCounter('ops').get()).toBe(15);

    // Register should converge to same value (LWW)
    expect(agentA.getRegister('config').get()).toEqual(
      agentB.getRegister('config').get()
    );
  });

  it('should track convergence across cluster', () => {
    const tracker = createConvergenceTracker();
    const agents = [
      createCRDTStore({ nodeId: 'agent-1' }),
      createCRDTStore({ nodeId: 'agent-2' }),
      createCRDTStore({ nodeId: 'agent-3' }),
    ];

    // Initial state - all empty, converged
    agents.forEach((agent) => {
      tracker.recordNodeState(agent.getNodeId(), agent.getState());
    });
    expect(tracker.hasConverged()).toBe(true);

    // Agent 1 makes changes
    agents[0].incrementCounter('tasks', 5);
    tracker.recordNodeState('agent-1', agents[0].getState());

    // Now diverged
    expect(tracker.hasConverged()).toBe(false);

    // Propagate changes
    agents[1].merge(agents[0]);
    agents[2].merge(agents[0]);
    tracker.recordNodeState('agent-2', agents[1].getState());
    tracker.recordNodeState('agent-3', agents[2].getState());

    // Now converged again
    expect(tracker.hasConverged()).toBe(true);
  });
});
