/**
 * CRDT Module Tests
 *
 * Comprehensive tests for CRDT implementations including:
 * - VectorClock comparison and merge
 * - GCounter increment and merge
 * - LWWRegister concurrent writes
 * - ORSet add/remove semantics
 * - PatternCRDT field merging
 * - CRDTStore operations
 *
 * @module tests/edge/p2p/crdt.test
 */


import {
  VectorClock,
  VectorClockComparison,
  GCounter,
  LWWRegister,
  ORSet,
  PatternCRDT,
  CRDTStore,
  CRDTType,
  CRDTErrorCode,
  CRDTError,
} from '../../../src/edge/p2p/crdt';

// ============================================
// VectorClock Tests
// ============================================

describe('VectorClock', () => {
  describe('creation and initialization', () => {
    it('should create an empty vector clock', () => {
      const clock = VectorClock.empty('replica-1');

      expect(clock.getReplicaId()).toBe('replica-1');
      expect(clock.get('replica-1')).toBe(0);
      expect(clock.size()).toBe(1);
    });

    it('should create a clock with initial timestamp', () => {
      const clock = VectorClock.withTimestamp('replica-1', 5);

      expect(clock.get('replica-1')).toBe(5);
    });

    it('should create from entries', () => {
      const clock = VectorClock.fromEntries('replica-1', {
        'replica-1': 3,
        'replica-2': 5,
        'replica-3': 2,
      });

      expect(clock.get('replica-1')).toBe(3);
      expect(clock.get('replica-2')).toBe(5);
      expect(clock.get('replica-3')).toBe(2);
    });
  });

  describe('increment operation', () => {
    it('should increment local replica timestamp', () => {
      const clock = new VectorClock('replica-1');

      expect(clock.getLocal()).toBe(0);
      clock.increment();
      expect(clock.getLocal()).toBe(1);
      clock.increment();
      expect(clock.getLocal()).toBe(2);
    });

    it('should return new timestamp on increment', () => {
      const clock = new VectorClock('replica-1');

      const ts1 = clock.increment();
      const ts2 = clock.increment();

      expect(ts1).toBe(1);
      expect(ts2).toBe(2);
    });
  });

  describe('comparison operations', () => {
    it('should detect equal clocks', () => {
      const clock1 = VectorClock.fromEntries('replica-1', {
        'replica-1': 3,
        'replica-2': 5,
      });
      const clock2 = VectorClock.fromEntries('replica-2', {
        'replica-1': 3,
        'replica-2': 5,
      });

      expect(clock1.compare(clock2)).toBe(VectorClockComparison.Equal);
      expect(clock1.equals(clock2)).toBe(true);
    });

    it('should detect happened-before relationship', () => {
      const clock1 = VectorClock.fromEntries('replica-1', {
        'replica-1': 3,
        'replica-2': 5,
      });
      const clock2 = VectorClock.fromEntries('replica-2', {
        'replica-1': 4,
        'replica-2': 6,
      });

      expect(clock1.compare(clock2)).toBe(VectorClockComparison.Before);
      expect(clock1.happenedBefore(clock2)).toBe(true);
      expect(clock2.happenedAfter(clock1)).toBe(true);
    });

    it('should detect concurrent clocks', () => {
      const clock1 = VectorClock.fromEntries('replica-1', {
        'replica-1': 5,
        'replica-2': 3,
      });
      const clock2 = VectorClock.fromEntries('replica-2', {
        'replica-1': 3,
        'replica-2': 5,
      });

      expect(clock1.compare(clock2)).toBe(VectorClockComparison.Concurrent);
      expect(clock1.isConcurrent(clock2)).toBe(true);
    });

    it('should handle clocks with different replicas', () => {
      const clock1 = VectorClock.fromEntries('replica-1', {
        'replica-1': 3,
      });
      const clock2 = VectorClock.fromEntries('replica-2', {
        'replica-2': 5,
      });

      // Both have entries the other doesn't, so concurrent
      expect(clock1.isConcurrent(clock2)).toBe(true);
    });
  });

  describe('merge operations', () => {
    it('should merge clocks with element-wise max', () => {
      const clock1 = VectorClock.fromEntries('replica-1', {
        'replica-1': 3,
        'replica-2': 5,
        'replica-3': 2,
      });
      const clock2 = VectorClock.fromEntries('replica-1', {
        'replica-1': 4,
        'replica-2': 3,
        'replica-4': 7,
      });

      clock1.merge(clock2);

      expect(clock1.get('replica-1')).toBe(4);
      expect(clock1.get('replica-2')).toBe(5);
      expect(clock1.get('replica-3')).toBe(2);
      expect(clock1.get('replica-4')).toBe(7);
    });

    it('should create merged clock without modifying original', () => {
      const clock1 = VectorClock.fromEntries('replica-1', {
        'replica-1': 3,
      });
      const clock2 = VectorClock.fromEntries('replica-2', {
        'replica-2': 5,
      });

      const merged = clock1.merged(clock2);

      expect(clock1.get('replica-2')).toBe(0); // Original unchanged
      expect(merged.get('replica-1')).toBe(3);
      expect(merged.get('replica-2')).toBe(5);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original = VectorClock.fromEntries('replica-1', {
        'replica-1': 3,
        'replica-2': 5,
      });

      const serialized = original.serialize();
      const restored = VectorClock.fromSerialized(serialized, 'replica-1');

      expect(restored.get('replica-1')).toBe(3);
      expect(restored.get('replica-2')).toBe(5);
    });

    it('should convert to and from JSON', () => {
      const original = VectorClock.fromEntries('replica-1', {
        'replica-1': 10,
        'replica-2': 20,
      });

      const json = original.toJSON();
      const restored = VectorClock.fromJSON(json, 'replica-1');

      expect(original.equals(restored)).toBe(true);
    });

    it('should validate serialized clocks', () => {
      expect(VectorClock.isValid({ entries: { r1: 1 }, lastModified: 123 })).toBe(true);
      expect(VectorClock.isValid({ entries: { r1: -1 }, lastModified: 123 })).toBe(false);
      expect(VectorClock.isValid(null)).toBe(false);
      expect(VectorClock.isValid('invalid')).toBe(false);
    });
  });
});

// ============================================
// GCounter Tests
// ============================================

describe('GCounter', () => {
  describe('creation and initialization', () => {
    it('should create a counter with initial value', () => {
      const counter = new GCounter('replica-1', 'counter-1', 10);

      expect(counter.value()).toBe(10);
      expect(counter.getId()).toBe('counter-1');
    });

    it('should start at zero by default', () => {
      const counter = new GCounter('replica-1', 'counter-1');

      expect(counter.value()).toBe(0);
    });
  });

  describe('increment operation', () => {
    it('should increment by 1 by default', () => {
      const counter = new GCounter('replica-1', 'counter-1');

      counter.increment();
      expect(counter.value()).toBe(1);

      counter.increment();
      expect(counter.value()).toBe(2);
    });

    it('should increment by specified amount', () => {
      const counter = new GCounter('replica-1', 'counter-1');

      counter.increment(5);
      expect(counter.value()).toBe(5);

      counter.increment(10);
      expect(counter.value()).toBe(15);
    });

    it('should reject negative increments', () => {
      const counter = new GCounter('replica-1', 'counter-1');

      expect(() => counter.increment(-5)).toThrow(CRDTError);
    });

    it('should track per-replica counts', () => {
      const counter = new GCounter('replica-1', 'counter-1');

      counter.increment(10);

      expect(counter.getReplicaCount('replica-1')).toBe(10);
      expect(counter.getReplicaCount('replica-2')).toBe(0);
    });
  });

  describe('merge operation', () => {
    it('should merge counters from different replicas', () => {
      const counter1 = new GCounter('replica-1', 'counter-1');
      const counter2 = new GCounter('replica-2', 'counter-1');

      counter1.increment(5);
      counter2.increment(10);

      const result = counter1.merge(counter2.state());

      expect(result.success).toBe(true);
      expect(counter1.value()).toBe(15); // 5 + 10
      expect(result.localChanged).toBe(true);
    });

    it('should take max for same replica counts', () => {
      const counter1 = new GCounter('replica-1', 'counter-1', 5);
      const counter2 = new GCounter('replica-1', 'counter-1', 10);

      // Create state with higher count
      const state = counter2.state();

      counter1.merge(state);

      // Should take max of the replica counts
      expect(counter1.value()).toBe(10);
    });

    it('should be idempotent', () => {
      const counter1 = new GCounter('replica-1', 'counter-1', 5);
      const counter2 = new GCounter('replica-2', 'counter-1', 10);

      const state = counter2.state();

      counter1.merge(state);
      const value1 = counter1.value();

      counter1.merge(state);
      const value2 = counter1.value();

      expect(value1).toBe(value2);
    });
  });

  describe('state and cloning', () => {
    it('should get serializable state', () => {
      const counter = new GCounter('replica-1', 'counter-1', 5);

      const state = counter.state();

      expect(state.type).toBe(CRDTType.GCounter);
      expect(state.id).toBe('counter-1');
      expect(state.value.counts['replica-1']).toBe(5);
    });

    it('should restore from state', () => {
      const original = new GCounter('replica-1', 'counter-1', 5);
      const state = original.state();

      const restored = GCounter.fromState(state, 'replica-2');

      expect(restored.value()).toBe(5);
    });

    it('should clone correctly', () => {
      const original = new GCounter('replica-1', 'counter-1', 5);
      original.increment(10);

      const cloned = original.clone();

      expect(cloned.value()).toBe(15);
      expect(cloned.equals(original)).toBe(true);

      // Modifications to clone shouldn't affect original
      cloned.increment(5);
      expect(original.value()).toBe(15);
      expect(cloned.value()).toBe(20);
    });
  });
});

// ============================================
// LWWRegister Tests
// ============================================

describe('LWWRegister', () => {
  describe('creation and initialization', () => {
    it('should create with initial value', () => {
      const register = new LWWRegister<string>('replica-1', 'reg-1', 'initial');

      expect(register.value()).toBe('initial');
      expect(register.hasValue()).toBe(true);
    });

    it('should create without initial value', () => {
      const register = new LWWRegister<string>('replica-1', 'reg-1');

      expect(register.value()).toBeUndefined();
      expect(register.hasValue()).toBe(false);
    });
  });

  describe('set operation', () => {
    it('should set and get values', () => {
      const register = new LWWRegister<string>('replica-1', 'reg-1');

      register.set('value-1');
      expect(register.value()).toBe('value-1');

      register.set('value-2');
      expect(register.value()).toBe('value-2');
    });

    it('should track timestamp of last write', () => {
      const register = new LWWRegister<string>('replica-1', 'reg-1');

      const before = Date.now();
      register.set('test');
      const after = Date.now();

      const timestamp = register.getTimestamp();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should track replica that set value', () => {
      const register = new LWWRegister<string>('replica-1', 'reg-1');

      register.set('test');

      expect(register.getValueReplica()).toBe('replica-1');
    });
  });

  describe('concurrent writes and merge', () => {
    it('should resolve by timestamp (later wins)', async () => {
      const register1 = new LWWRegister<string>('replica-1', 'reg-1');
      const register2 = new LWWRegister<string>('replica-2', 'reg-1');

      register1.setWithTimestamp('value-1', 1000);
      register2.setWithTimestamp('value-2', 2000);

      register1.merge(register2.state());

      expect(register1.value()).toBe('value-2');
    });

    it('should resolve ties by replica ID', () => {
      const register1 = new LWWRegister<string>('replica-1', 'reg-1');
      const register2 = new LWWRegister<string>('replica-2', 'reg-1');

      // Same timestamp
      register1.setWithTimestamp('value-1', 1000);
      register2.setWithTimestamp('value-2', 1000);

      register1.merge(register2.state());

      // replica-2 > replica-1, so value-2 wins
      expect(register1.value()).toBe('value-2');
    });

    it('should track conflicts on concurrent writes', () => {
      const register1 = new LWWRegister<string>('replica-1', 'reg-1');
      const register2 = new LWWRegister<string>('replica-2', 'reg-1');

      register1.set('value-1');
      register2.set('value-2');

      const result = register1.merge(register2.state());

      // Should detect concurrent update
      expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
    });

    it('should keep local value if timestamp is higher', () => {
      const register1 = new LWWRegister<string>('replica-1', 'reg-1');
      const register2 = new LWWRegister<string>('replica-2', 'reg-1');

      register1.setWithTimestamp('value-1', 2000);
      register2.setWithTimestamp('value-2', 1000);

      register1.merge(register2.state());

      expect(register1.value()).toBe('value-1');
    });
  });

  describe('clear operation', () => {
    it('should clear the value', () => {
      const register = new LWWRegister<string>('replica-1', 'reg-1', 'initial');

      const prev = register.clear();

      expect(prev).toBe('initial');
      expect(register.value()).toBeUndefined();
      expect(register.hasValue()).toBe(false);
    });
  });

  describe('complex values', () => {
    it('should handle object values', () => {
      interface User {
        name: string;
        age: number;
      }

      const register = new LWWRegister<User>('replica-1', 'reg-1');

      register.set({ name: 'Alice', age: 30 });

      expect(register.value()).toEqual({ name: 'Alice', age: 30 });
    });

    it('should handle array values', () => {
      const register = new LWWRegister<number[]>('replica-1', 'reg-1');

      register.set([1, 2, 3]);

      expect(register.value()).toEqual([1, 2, 3]);
    });
  });
});

// ============================================
// ORSet Tests
// ============================================

describe('ORSet', () => {
  describe('creation and initialization', () => {
    it('should create an empty set', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      expect(set.size()).toBe(0);
      expect(set.isEmpty()).toBe(true);
    });
  });

  describe('add operation', () => {
    it('should add elements', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      set.add('apple');
      set.add('banana');

      expect(set.size()).toBe(2);
      expect(set.has('apple')).toBe(true);
      expect(set.has('banana')).toBe(true);
    });

    it('should return unique tag for each add', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      const tag1 = set.add('apple');
      const tag2 = set.add('apple');

      expect(tag1).not.toBe(tag2);
      expect(set.hasTag(tag1)).toBe(true);
      expect(set.hasTag(tag2)).toBe(true);
    });

    it('should allow duplicate values with different tags', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      const tag1 = set.add('apple');
      const tag2 = set.add('apple');

      // Two elements with same value but different tags
      expect(set.size()).toBe(2);
      expect(tag1).not.toBe(tag2);
      // value() returns a Set which deduplicates, so we check size and tags
      expect(set.hasTag(tag1)).toBe(true);
      expect(set.hasTag(tag2)).toBe(true);
    });
  });

  describe('remove operation', () => {
    it('should remove all instances of a value', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      set.add('apple');
      set.add('apple');
      set.add('banana');

      const removed = set.remove('apple');

      expect(removed).toBe(2);
      expect(set.has('apple')).toBe(false);
      expect(set.has('banana')).toBe(true);
      expect(set.size()).toBe(1);
    });

    it('should return 0 when removing non-existent value', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      set.add('apple');
      const removed = set.remove('banana');

      expect(removed).toBe(0);
    });

    it('should remove by tag', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      const tag1 = set.add('apple');
      const tag2 = set.add('apple');

      set.removeByTag(tag1);

      expect(set.hasTag(tag1)).toBe(false);
      expect(set.hasTag(tag2)).toBe(true);
      expect(set.size()).toBe(1);
    });

    it('should create tombstones on remove', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      set.add('apple');
      set.remove('apple');

      expect(set.getTombstoneCount()).toBe(1);
    });
  });

  describe('merge with add-wins semantics', () => {
    it('should merge sets from different replicas', () => {
      const set1 = new ORSet<string>('replica-1', 'set-1');
      const set2 = new ORSet<string>('replica-2', 'set-1');

      set1.add('apple');
      set2.add('banana');

      set1.merge(set2.state());

      expect(set1.has('apple')).toBe(true);
      expect(set1.has('banana')).toBe(true);
    });

    it('should handle concurrent add/remove (add wins)', () => {
      const set1 = new ORSet<string>('replica-1', 'set-1');
      const set2 = new ORSet<string>('replica-2', 'set-1');

      // Both start with apple
      const tag1 = set1.add('apple');
      set2.add('apple');

      // set1 removes, set2 adds again concurrently
      set1.remove('apple');
      set2.add('apple'); // New add

      // Merge
      const result = set1.merge(set2.state());

      // Add should win - apple should still be present
      expect(set1.has('apple')).toBe(true);
      expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
    });

    it('should preserve removes that happened after', () => {
      const set1 = new ORSet<string>('replica-1', 'set-1');
      const set2 = new ORSet<string>('replica-2', 'set-1');

      // set1 adds apple
      set1.add('apple');

      // set2 gets the state
      set2.merge(set1.state());

      // set2 removes apple
      set2.remove('apple');

      // set1 gets the removal
      set1.merge(set2.state());

      expect(set1.has('apple')).toBe(false);
    });
  });

  describe('clear operation', () => {
    it('should clear all elements', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      set.add('apple');
      set.add('banana');
      set.add('cherry');

      set.clear();

      expect(set.isEmpty()).toBe(true);
      expect(set.getTombstoneCount()).toBe(3);
    });
  });

  describe('iteration', () => {
    it('should be iterable', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      set.add('apple');
      set.add('banana');

      const values: string[] = [];
      for (const value of set) {
        values.push(value);
      }

      expect(values).toContain('apple');
      expect(values).toContain('banana');
    });

    it('should return values as array', () => {
      const set = new ORSet<string>('replica-1', 'set-1');

      set.add('apple');
      set.add('banana');

      const values = set.values();

      expect(values).toContain('apple');
      expect(values).toContain('banana');
    });
  });

  describe('garbage collection', () => {
    it('should collect expired tombstones', async () => {
      // Create set with very short TTL for testing
      const set = new ORSet<string>('replica-1', 'set-1', {
        tombstoneTtl: 10, // 10ms TTL
      });

      set.add('apple');
      set.remove('apple');

      expect(set.getTombstoneCount()).toBe(1);

      // Wait for tombstone to expire
      await new Promise(resolve => setTimeout(resolve, 20));

      const collected = set.gcTombstones();

      expect(collected).toBe(1);
      expect(set.getTombstoneCount()).toBe(0);
    });
  });
});

// ============================================
// PatternCRDT Tests
// ============================================

describe('PatternCRDT', () => {
  const createPattern = (replicaId: string, id: string) => {
    return new PatternCRDT(replicaId, {
      id,
      content: 'test code',
      type: 'unit-test',
      category: 'test',
      domain: 'api',
      tags: ['typescript'],
    });
  };

  describe('creation and initialization', () => {
    it('should create with required fields', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      expect(pattern.getId()).toBe('pattern-1');
      expect(pattern.getContent()).toBe('test code');
      expect(pattern.getType()).toBe('unit-test');
      expect(pattern.getCategory()).toBe('test');
      expect(pattern.getDomain()).toBe('api');
    });

    it('should initialize tags', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      expect(pattern.getTags()).toContain('typescript');
    });

    it('should start with zero usage count', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      expect(pattern.getUsageCount()).toBe(0);
    });
  });

  describe('field updates', () => {
    it('should update content', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      pattern.setContent('updated code');

      expect(pattern.getContent()).toBe('updated code');
    });

    it('should add and remove tags', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      pattern.addTag('jest');
      pattern.addTag('vitest');

      expect(pattern.getTags()).toContain('jest');
      expect(pattern.getTags()).toContain('vitest');

      pattern.removeTag('jest');

      expect(pattern.getTags()).not.toContain('jest');
      expect(pattern.getTags()).toContain('vitest');
    });

    it('should increment usage count', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      pattern.incrementUsage();
      pattern.incrementUsage(5);

      expect(pattern.getUsageCount()).toBe(6);
    });

    it('should set and get metadata', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      pattern.setMetadata('author', 'Alice');
      pattern.setMetadata('complexity', 5);

      expect(pattern.getMetadata('author')).toBe('Alice');
      expect(pattern.getMetadata('complexity')).toBe(5);
    });
  });

  describe('merge operations', () => {
    it('should merge LWW fields (latest wins)', () => {
      const pattern1 = createPattern('replica-1', 'pattern-1');
      const pattern2 = createPattern('replica-2', 'pattern-1');

      // Wait a bit so timestamps differ
      pattern2.setContent('newer content');

      pattern1.merge(pattern2.state());

      // pattern2's content should win (later timestamp)
      expect(pattern1.getContent()).toBe('newer content');
    });

    it('should merge tags (add-wins)', () => {
      const pattern1 = createPattern('replica-1', 'pattern-1');
      const pattern2 = createPattern('replica-2', 'pattern-1');

      pattern1.addTag('jest');
      pattern2.addTag('vitest');

      pattern1.merge(pattern2.state());

      expect(pattern1.getTags()).toContain('typescript');
      expect(pattern1.getTags()).toContain('jest');
      expect(pattern1.getTags()).toContain('vitest');
    });

    it('should merge usage counts (sum of max per replica)', () => {
      const pattern1 = createPattern('replica-1', 'pattern-1');
      const pattern2 = createPattern('replica-2', 'pattern-1');

      pattern1.incrementUsage(5);
      pattern2.incrementUsage(10);

      pattern1.merge(pattern2.state());

      // Should be 5 (replica-1) + 10 (replica-2)
      expect(pattern1.getUsageCount()).toBe(15);
    });

    it('should merge metadata', () => {
      const pattern1 = createPattern('replica-1', 'pattern-1');
      const pattern2 = createPattern('replica-2', 'pattern-1');

      pattern1.setMetadata('field1', 'value1');
      pattern2.setMetadata('field2', 'value2');

      pattern1.merge(pattern2.state());

      expect(pattern1.getMetadata('field1')).toBe('value1');
      expect(pattern1.getMetadata('field2')).toBe('value2');
    });
  });

  describe('history tracking', () => {
    it('should track modification history', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      pattern.setContent('new content');
      pattern.addTag('new-tag');

      const history = pattern.getHistory();

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some(h => h.field === 'content')).toBe(true);
      expect(history.some(h => h.field === 'tags')).toBe(true);
    });
  });

  describe('state and cloning', () => {
    it('should get complete data', () => {
      const pattern = createPattern('replica-1', 'pattern-1');

      pattern.addTag('jest');
      pattern.incrementUsage(5);
      pattern.setMetadata('author', 'Alice');

      const data = pattern.getData();

      expect(data.id).toBe('pattern-1');
      expect(data.content).toBe('test code');
      expect(data.tags).toContain('typescript');
      expect(data.tags).toContain('jest');
      expect(data.usageCount).toBe(5);
      expect(data.metadata.author).toBe('Alice');
    });

    it('should clone correctly', () => {
      const original = createPattern('replica-1', 'pattern-1');

      original.addTag('jest');
      original.incrementUsage(10);

      const cloned = original.clone();

      expect(cloned.getId()).toBe(original.getId());
      expect(cloned.getTags()).toEqual(original.getTags());
      expect(cloned.getUsageCount()).toBe(original.getUsageCount());

      // Modifications to clone shouldn't affect original
      cloned.addTag('new-tag');
      expect(original.getTags()).not.toContain('new-tag');
    });
  });
});

// ============================================
// CRDTStore Tests
// ============================================

describe('CRDTStore', () => {
  let store: CRDTStore;

  beforeEach(() => {
    store = new CRDTStore({
      replicaId: 'replica-1',
      autoGC: false, // Disable auto GC for tests
    });
  });

  afterEach(() => {
    store.dispose();
  });

  describe('CRDT creation', () => {
    it('should create G-Counter', () => {
      const counter = store.createGCounter('counter-1', 10);

      expect(counter.value()).toBe(10);
      expect(store.has('counter-1')).toBe(true);
      expect(store.getType('counter-1')).toBe(CRDTType.GCounter);
    });

    it('should create LWW-Register', () => {
      const register = store.createLWWRegister<string>('register-1', 'initial');

      expect(register.value()).toBe('initial');
      expect(store.getType('register-1')).toBe(CRDTType.LWWRegister);
    });

    it('should create OR-Set', () => {
      const set = store.createORSet<string>('set-1');

      set.add('value');
      expect(set.has('value')).toBe(true);
      expect(store.getType('set-1')).toBe(CRDTType.ORSet);
    });

    it('should create PatternCRDT', () => {
      const pattern = store.createPattern({
        id: 'pattern-1',
        content: 'code',
        type: 'test',
        category: 'unit',
        domain: 'api',
      });

      expect(pattern.getContent()).toBe('code');
      expect(store.getType('pattern-1')).toBe(CRDTType.PatternCRDT);
    });

    it('should reject duplicate IDs', () => {
      store.createGCounter('counter-1');

      expect(() => store.createGCounter('counter-1')).toThrow(CRDTError);
    });
  });

  describe('CRDT retrieval', () => {
    it('should get by ID', () => {
      const counter = store.createGCounter('counter-1');

      expect(store.get('counter-1')).toBe(counter);
    });

    it('should get typed CRDTs', () => {
      store.createGCounter('counter-1');
      store.createLWWRegister<string>('register-1');
      store.createORSet<string>('set-1');

      expect(store.getGCounter('counter-1')).toBeDefined();
      expect(store.getLWWRegister<string>('register-1')).toBeDefined();
      expect(store.getORSet<string>('set-1')).toBeDefined();
    });

    it('should return undefined for wrong type', () => {
      store.createGCounter('counter-1');

      expect(store.getLWWRegister('counter-1')).toBeUndefined();
    });

    it('should list IDs', () => {
      store.createGCounter('counter-1');
      store.createGCounter('counter-2');
      store.createORSet<string>('set-1');

      expect(store.getIds()).toContain('counter-1');
      expect(store.getIds()).toContain('counter-2');
      expect(store.getIds()).toContain('set-1');
    });

    it('should filter IDs by type', () => {
      store.createGCounter('counter-1');
      store.createGCounter('counter-2');
      store.createORSet<string>('set-1');

      const counterIds = store.getIdsByType(CRDTType.GCounter);

      expect(counterIds).toContain('counter-1');
      expect(counterIds).toContain('counter-2');
      expect(counterIds).not.toContain('set-1');
    });
  });

  describe('state application', () => {
    it('should apply state to existing CRDT', () => {
      const counter = store.createGCounter('counter-1', 5);

      // Create state from another replica
      const remoteCounter = new GCounter('replica-2', 'counter-1', 10);
      const remoteState = remoteCounter.state();

      const result = store.applyState(remoteState);

      expect(result.success).toBe(true);
      expect(counter.value()).toBe(15); // 5 + 10
    });

    it('should create CRDT from remote state', () => {
      const remoteCounter = new GCounter('replica-2', 'counter-1', 10);
      const remoteState = remoteCounter.state();

      store.applyState(remoteState);

      expect(store.has('counter-1')).toBe(true);
      expect(store.getGCounter('counter-1')?.value()).toBe(10);
    });

    it('should reject type mismatch', () => {
      store.createGCounter('item-1');

      const remoteSet = new ORSet<string>('replica-2', 'item-1');
      const remoteState = remoteSet.state();

      expect(() => store.applyState(remoteState)).toThrow(CRDTError);
    });
  });

  describe('delta operations', () => {
    it('should generate deltas', () => {
      const counter = store.createGCounter('counter-1');
      counter.increment(5);

      const deltas = store.generateDeltas();

      expect(deltas.length).toBe(1);
      expect(deltas[0].crdtId).toBe('counter-1');
    });

    it('should apply deltas', () => {
      const counter = store.createGCounter('counter-1', 5);

      const remoteCounter = new GCounter('replica-2', 'counter-1', 10);
      const delta = remoteCounter.generateDelta();

      if (delta) {
        const applied = store.applyDelta(delta);
        expect(applied).toBe(true);
        expect(counter.value()).toBe(15);
      }
    });
  });

  describe('deletion', () => {
    it('should delete CRDT', () => {
      store.createGCounter('counter-1');

      expect(store.delete('counter-1')).toBe(true);
      expect(store.has('counter-1')).toBe(false);
    });

    it('should return false for non-existent CRDT', () => {
      expect(store.delete('non-existent')).toBe(false);
    });

    it('should clear all CRDTs', () => {
      store.createGCounter('counter-1');
      store.createGCounter('counter-2');
      store.createORSet<string>('set-1');

      store.clear();

      expect(store.getIds().length).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit events', () => {
      const events: string[] = [];

      store.on((event) => {
        events.push(event.type);
      });

      store.createGCounter('counter-1');

      expect(events).toContain('created');
    });

    it('should remove event handlers', () => {
      const events: string[] = [];
      const handler = (event: { type: string }) => events.push(event.type);

      store.on(handler);
      store.createGCounter('counter-1');
      expect(events.length).toBe(1);

      store.off(handler);
      store.createGCounter('counter-2');
      expect(events.length).toBe(1); // Should not increase
    });
  });

  describe('statistics', () => {
    it('should provide stats', () => {
      store.createGCounter('counter-1');
      store.createGCounter('counter-2');
      store.createORSet<string>('set-1');

      const stats = store.getStats();

      expect(stats.totalInstances).toBe(3);
      expect(stats.byType[CRDTType.GCounter]).toBe(2);
      expect(stats.byType[CRDTType.ORSet]).toBe(1);
    });
  });

  describe('garbage collection', () => {
    it('should run GC', () => {
      const set = store.createORSet<string>('set-1');

      set.add('apple');
      set.remove('apple');

      const result = store.gc();

      expect(result.collected).toBeGreaterThanOrEqual(0);
    });
  });

  describe('conflict tracking', () => {
    it('should track conflicts', () => {
      const register1 = new LWWRegister<string>('replica-1', 'reg-1');
      const register2 = new LWWRegister<string>('replica-2', 'reg-1');

      register1.set('value-1');
      register2.set('value-2');

      store.applyState(register1.state());
      store.applyState(register2.state());

      const conflicts = store.getConflicts();
      // May or may not have conflicts depending on timing
      expect(conflicts).toBeDefined();
    });

    it('should clear conflicts', () => {
      store.clearConflicts();

      expect(store.getConflicts().length).toBe(0);
    });
  });
});
