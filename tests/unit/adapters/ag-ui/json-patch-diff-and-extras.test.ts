/**
 * JSON Patch Diff Computation, Operation Factories, Edge Cases,
 * Error Handling, Library Access, Performance, and Backward Compatibility Tests
 * Split from json-patch.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  computeDiff,
  observe,
  unobserve,
  applyPatch,
  validatePatch,
  applyOperation,
  validateOperation,
  checkCompliance,

  createTestOperation,
  createAddOperation,
  createRemoveOperation,
  createReplaceOperation,
  createMoveOperation,
  createCopyOperation,

  JsonPatchError,
  fastJsonPatchLib,

  escapePathToken,
  unescapePathToken,
  parsePath,
  buildPath,
  getValueAtPath,
  setValueAtPath,
  deleteValueAtPath,
  pathExists,
  applyPatchAtomic,
  validate,
} from '../../../../src/adapters/ag-ui/json-patch.js';
import type { JsonPatchOperation } from '../../../../src/adapters/ag-ui/event-types.js';

describe('Diff Computation', () => {
  describe('deepEqual', () => {
    it('should compare primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('a', 'a')).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
    });

    it('should compare arrays', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(deepEqual([1, 2, 3], [1, 3, 2])).toBe(false);
    });

    it('should compare objects', () => {
      expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('should compare nested structures', () => {
      const a = { nested: { arr: [1, { x: 2 }] } };
      const b = { nested: { arr: [1, { x: 2 }] } };
      const c = { nested: { arr: [1, { x: 3 }] } };
      expect(deepEqual(a, b)).toBe(true);
      expect(deepEqual(a, c)).toBe(false);
    });

    it('should handle null vs object', () => {
      expect(deepEqual(null, {})).toBe(false);
      expect(deepEqual({}, null)).toBe(false);
    });

    it('should compare undefined correctly', () => {
      expect(deepEqual(undefined, undefined)).toBe(true);
      expect(deepEqual(undefined, null)).toBe(false);
    });
  });

  describe('computeDiff', () => {
    it('should return empty diff for equal states', () => {
      const state = { a: 1, b: 2 };
      expect(computeDiff(state, state)).toEqual([]);
    });

    it('should detect added properties', () => {
      const oldState = { a: 1 };
      const newState = { a: 1, b: 2 };
      const diff = computeDiff(oldState, newState);
      expect(diff).toContainEqual({ op: 'add', path: '/b', value: 2 });
    });

    it('should detect removed properties', () => {
      const oldState = { a: 1, b: 2 };
      const newState = { a: 1 };
      const diff = computeDiff(oldState, newState);
      expect(diff).toContainEqual({ op: 'remove', path: '/b' });
    });

    it('should detect replaced properties', () => {
      const oldState = { a: 1 };
      const newState = { a: 2 };
      const diff = computeDiff(oldState, newState);
      expect(diff).toContainEqual({ op: 'replace', path: '/a', value: 2 });
    });

    it('should handle nested changes', () => {
      const oldState = { nested: { a: 1, b: 2 } };
      const newState = { nested: { a: 1, b: 3, c: 4 } };
      const diff = computeDiff(oldState, newState);
      expect(diff.some(op => op.path === '/nested/b' && op.op === 'replace')).toBe(true);
      expect(diff.some(op => op.path === '/nested/c' && op.op === 'add')).toBe(true);
    });

    it('should handle array changes', () => {
      const oldState = { arr: [1, 2, 3] };
      const newState = { arr: [1, 4, 3] };
      const diff = computeDiff(oldState, newState);
      expect(diff.some(op => op.path === '/arr/1' && op.op === 'replace')).toBe(true);
    });

    it('should generate valid patch that transforms old to new', () => {
      const oldState = { a: 1, b: { c: 2 }, d: [1, 2] };
      const newState = { a: 10, b: { c: 3, e: 4 }, d: [1, 2, 3], f: 'new' };

      const diff = computeDiff(oldState, newState);
      const result = applyPatch(oldState, diff);

      expect(result.success).toBe(true);
      expect(deepEqual(result.document, newState)).toBe(true);
    });

    it('should respect maxDepth option', () => {
      const oldState = { deep: { nested: { value: 1 } } };
      const newState = { deep: { nested: { value: 2 } } };

      const diff = computeDiff(oldState, newState, { maxDepth: 1 });
      expect(diff).toHaveLength(1);
      expect(diff[0].op).toBe('replace');
      expect(diff[0].path).toBe('/deep');
    });

    it('should handle type changes', () => {
      const oldState = { value: 'string' };
      const newState = { value: 123 };
      const diff = computeDiff(oldState, newState);
      expect(diff).toContainEqual({ op: 'replace', path: '/value', value: 123 });
    });

    it('should handle null values', () => {
      const oldState = { value: null };
      const newState = { value: 'not null' };
      const diff = computeDiff(oldState, newState);
      expect(diff).toContainEqual({ op: 'replace', path: '/value', value: 'not null' });
    });

    it('should handle empty objects', () => {
      expect(computeDiff({}, {})).toEqual([]);
      const addDiff = computeDiff({}, { a: 1 });
      expect(addDiff).toContainEqual({ op: 'add', path: '/a', value: 1 });
    });
  });

  describe('observe/unobserve', () => {
    it('should observe changes to object', () => {
      const doc = { a: 1 } as Record<string, unknown>;
      const { observer, generate } = observe(doc);

      doc.b = 2;
      doc.a = 10;

      const patches = generate();
      expect(patches.length).toBeGreaterThan(0);
      expect(patches.some(p => p.path === '/b' && p.op === 'add')).toBe(true);
      expect(patches.some(p => p.path === '/a' && p.op === 'replace')).toBe(true);

      unobserve(doc, observer);
    });

    it('should detect array mutations', () => {
      const doc = { arr: [1, 2, 3] } as Record<string, unknown>;
      const { observer, generate } = observe(doc);

      (doc.arr as number[]).push(4);

      const patches = generate();
      expect(patches.some(p => p.path === '/arr/3' || p.path === '/arr/-')).toBe(true);

      unobserve(doc, observer);
    });
  });
});

describe('Operation Factories', () => {
  it('should create test operation', () => {
    const op = createTestOperation('/foo', 42);
    expect(op).toEqual({ op: 'test', path: '/foo', value: 42 });
  });

  it('should create add operation', () => {
    const op = createAddOperation('/foo', 'bar');
    expect(op).toEqual({ op: 'add', path: '/foo', value: 'bar' });
  });

  it('should create remove operation', () => {
    const op = createRemoveOperation('/foo');
    expect(op).toEqual({ op: 'remove', path: '/foo' });
  });

  it('should create replace operation', () => {
    const op = createReplaceOperation('/foo', { nested: true });
    expect(op).toEqual({ op: 'replace', path: '/foo', value: { nested: true } });
  });

  it('should create move operation', () => {
    const op = createMoveOperation('/a', '/b');
    expect(op).toEqual({ op: 'move', from: '/a', path: '/b' });
  });

  it('should create copy operation', () => {
    const op = createCopyOperation('/source', '/target');
    expect(op).toEqual({ op: 'copy', from: '/source', path: '/target' });
  });

  it('should create operations that pass validation', () => {
    const ops = [
      createTestOperation('/a', 1),
      createAddOperation('/b', 2),
      createRemoveOperation('/c'),
      createReplaceOperation('/d', 3),
      createMoveOperation('/e', '/f'),
      createCopyOperation('/g', '/h'),
    ];

    for (const op of ops) {
      expect(validateOperation(op).valid).toBe(true);
    }
  });
});

describe('Edge Cases', () => {
  it('should handle empty objects', () => {
    expect(computeDiff({}, {})).toEqual([]);
    expect(computeDiff({}, { a: 1 })).toEqual([{ op: 'add', path: '/a', value: 1 }]);
    expect(computeDiff({ a: 1 }, {})).toEqual([{ op: 'remove', path: '/a' }]);
  });

  it('should handle empty arrays', () => {
    const diff = computeDiff({ arr: [] }, { arr: [1] });
    expect(diff.some(op => op.path === '/arr/0' || op.path === '/arr/-')).toBe(true);
  });

  it('should handle deeply nested structures', () => {
    const oldState = {
      level1: { level2: { level3: { level4: { value: 1 } } } },
    };
    const newState = {
      level1: { level2: { level3: { level4: { value: 2 } } } },
    };

    const diff = computeDiff(oldState, newState);
    const result = applyPatch(oldState, diff);

    expect(result.success).toBe(true);
    expect(result.document).toEqual(newState);
  });

  it('should handle special characters in keys', () => {
    const oldState = { 'key/with/slashes': 1, 'key~with~tildes': 2 };
    const newState = { 'key/with/slashes': 3, 'key~with~tildes': 4 };

    const diff = computeDiff(oldState, newState);
    const result = applyPatch(oldState, diff);

    expect(result.success).toBe(true);
    expect(result.document).toEqual(newState);
  });

  it('should handle numeric keys', () => {
    const oldState = { '0': 'zero', '1': 'one' };
    const newState = { '0': 'ZERO', '1': 'one', '2': 'two' };

    const diff = computeDiff(oldState, newState);
    const result = applyPatch(oldState, diff);

    expect(result.success).toBe(true);
    expect(result.document).toEqual(newState);
  });

  it('should handle boolean and null values', () => {
    const oldState = { flag: true, nullable: null };
    const newState = { flag: false, nullable: 'not null' };

    const diff = computeDiff(oldState, newState);
    const result = applyPatch(oldState, diff);

    expect(result.success).toBe(true);
    expect(result.document).toEqual(newState);
  });

  it('should handle arrays with objects', () => {
    const oldState = {
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ],
    };
    const newState = {
      items: [
        { id: 1, name: 'Item 1 Updated' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ],
    };

    const diff = computeDiff(oldState, newState);
    const result = applyPatch(oldState, diff);

    expect(result.success).toBe(true);
    expect(deepEqual(result.document, newState)).toBe(true);
  });

  it('should handle undefined removal', () => {
    const doc: Record<string, unknown> = { a: 1 };
    doc.b = 'temporary';
    const result = applyPatch(doc, [{ op: 'remove', path: '/b' }]);
    expect(result.success).toBe(true);
    expect('b' in result.document).toBe(false);
  });
});

describe('Complex Integration Scenarios', () => {
  it('should handle realistic state transformations', () => {
    const oldState = {
      user: {
        name: 'Alice',
        preferences: { theme: 'light', notifications: true },
      },
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ],
      metadata: { version: 1, lastUpdated: '2026-01-01' },
    };

    const newState = {
      user: {
        name: 'Alice',
        preferences: { theme: 'dark', notifications: false, language: 'en' },
      },
      items: [
        { id: 1, name: 'Item 1 Updated' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ],
      metadata: { version: 2, lastUpdated: '2026-01-30' },
    };

    const diff = computeDiff(oldState, newState);
    const result = applyPatch(oldState, diff);

    expect(result.success).toBe(true);
    expect(deepEqual(result.document, newState)).toBe(true);
  });

  it('should handle test operations for optimistic concurrency', () => {
    const doc = { version: 1, data: 'original' };

    const patch: JsonPatchOperation[] = [
      { op: 'test', path: '/version', value: 1 },
      { op: 'replace', path: '/version', value: 2 },
      { op: 'replace', path: '/data', value: 'updated' },
    ];

    const result = applyPatch(doc, patch);
    expect(result.success).toBe(true);
    expect(result.document).toEqual({ version: 2, data: 'updated' });

    const failPatch: JsonPatchOperation[] = [
      { op: 'test', path: '/version', value: 1 },
      { op: 'replace', path: '/data', value: 'conflict' },
    ];

    const failResult = applyPatch(result.document, failPatch);
    expect(failResult.success).toBe(false);
  });

  it('should handle move operations for reordering', () => {
    const doc = { items: ['a', 'b', 'c', 'd'] };

    const patch: JsonPatchOperation[] = [
      { op: 'remove', path: '/items/3' },
      { op: 'add', path: '/items/1', value: 'd' },
    ];

    const result = applyPatch(doc, patch);
    expect(result.success).toBe(true);
    expect(result.document).toEqual({ items: ['a', 'd', 'b', 'c'] });
  });

  it('should handle copy for duplication', () => {
    const doc = {
      template: { name: 'Template', config: { enabled: true } },
      instances: [],
    };

    const patch: JsonPatchOperation[] = [
      { op: 'copy', from: '/template', path: '/instances/-' },
    ];

    const result = applyPatch(doc, patch);
    expect(result.success).toBe(true);
    expect((result.document.instances as unknown[]).length).toBe(1);
    expect((result.document.instances as unknown[])[0]).toEqual(doc.template);
  });
});

describe('Error Handling', () => {
  describe('JsonPatchError', () => {
    it('should have correct name', () => {
      const error = new JsonPatchError('test', 'INVALID_PATH');
      expect(error.name).toBe('JsonPatchError');
    });

    it('should have code property', () => {
      const error = new JsonPatchError('test', 'TEST_FAILED');
      expect(error.code).toBe('TEST_FAILED');
    });

    it('should have details property', () => {
      const error = new JsonPatchError('test', 'INVALID_PATH', { path: '/foo' });
      expect(error.details).toEqual({ path: '/foo' });
    });

    it('should be instanceof Error', () => {
      const error = new JsonPatchError('test', 'INVALID_PATH');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(JsonPatchError);
    });

    it('should create test failed error', () => {
      const error = JsonPatchError.testFailed('/path', 'expected', 'actual');
      expect(error.code).toBe('TEST_FAILED');
      expect(error.message).toContain('/path');
      expect(error.details?.path).toBe('/path');
    });
  });

  it('should provide meaningful error for invalid operation', () => {
    const doc = { a: 1 };
    try {
      applyOperation(doc, { op: 'invalid' as 'add', path: '/b', value: 2 });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(JsonPatchError);
      expect((error as Error).message).toContain('Invalid operation type');
    }
  });

  it('should provide meaningful error for path not found', () => {
    const doc = { a: 1 };
    const result = applyPatch(doc, [{ op: 'remove', path: '/nonexistent' }]);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('Fast-json-patch Library Access', () => {
  it('should expose fast-json-patch compare function', () => {
    const oldState = { a: 1 };
    const newState = { a: 2 };
    const patches = fastJsonPatchLib.compare(oldState, newState);
    expect(patches).toBeDefined();
    expect(patches.length).toBeGreaterThan(0);
  });

  it('should expose fast-json-patch applyPatch function', () => {
    const doc = { a: 1 };
    const patches = [{ op: 'add' as const, path: '/b', value: 2 }];
    const result = fastJsonPatchLib.applyPatch(doc, patches);
    expect(result.newDocument).toBeDefined();
  });

  it('should expose fast-json-patch validate function', () => {
    const doc = { a: 1 };
    const patches = [{ op: 'add' as const, path: '/b', value: 2 }];
    const error = fastJsonPatchLib.validate(patches, doc);
    expect(error).toBeUndefined();
  });

  it('should expose fast-json-patch getValueByPointer function', () => {
    const doc = { nested: { value: 42 } };
    const value = fastJsonPatchLib.getValueByPointer(doc, '/nested/value');
    expect(value).toBe(42);
  });

  it('should expose fast-json-patch escape/unescape functions', () => {
    const escaped = fastJsonPatchLib.escapePathComponent('a/b');
    expect(escaped).toBe('a~1b');

    const unescaped = fastJsonPatchLib.unescapePathComponent('a~1b');
    expect(unescaped).toBe('a/b');
  });
});

describe('Performance Comparison', () => {
  const ITERATIONS = 100;

  interface PerformanceResult {
    name: string;
    totalMs: number;
    avgMs: number;
    opsPerSecond: number;
  }

  function benchmark(name: string, fn: () => void): PerformanceResult {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      fn();
    }
    const totalMs = performance.now() - start;
    return {
      name,
      totalMs,
      avgMs: totalMs / ITERATIONS,
      opsPerSecond: (ITERATIONS / totalMs) * 1000,
    };
  }

  it('should compute diffs efficiently', () => {
    const oldState = {
      users: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        preferences: { theme: 'light', notifications: true },
      })),
    };
    const newState = structuredClone(oldState) as typeof oldState;
    newState.users[50].name = 'Modified User';
    newState.users[75].preferences.theme = 'dark';
    newState.users.push({ id: 100, name: 'New User', email: 'new@example.com', preferences: { theme: 'light', notifications: true } });

    const result = benchmark('computeDiff (100 users)', () => {
      computeDiff(oldState, newState);
    });

    expect(result.totalMs).toBeLessThan(5000);
    expect(result.avgMs).toBeLessThan(50);
  });

  it('should apply patches efficiently', () => {
    const doc = {
      items: Array.from({ length: 50 }, (_, i) => ({ id: i, value: i })),
    };
    const patch: JsonPatchOperation[] = [
      { op: 'add', path: '/newField', value: 'test' },
      { op: 'replace', path: '/items/25/value', value: 999 },
      { op: 'add', path: '/items/-', value: { id: 50, value: 50 } },
    ];

    const result = benchmark('applyPatch (3 operations)', () => {
      applyPatch(doc, patch);
    });

    expect(result.totalMs).toBeLessThan(1000);
    expect(result.avgMs).toBeLessThan(10);
  });

  it('should validate patches efficiently', () => {
    const patch: JsonPatchOperation[] = Array.from({ length: 50 }, (_, i) => ({
      op: 'add' as const,
      path: `/field${i}`,
      value: i,
    }));

    const result = benchmark('validatePatch (50 operations)', () => {
      validatePatch(patch);
    });

    expect(result.totalMs).toBeLessThan(500);
    expect(result.avgMs).toBeLessThan(5);
  });

  it('should check compliance efficiently', () => {
    const patch: JsonPatchOperation[] = [
      { op: 'add', path: '/a', value: 1 },
      { op: 'remove', path: '/b' },
      { op: 'replace', path: '/c', value: 2 },
      { op: 'move', from: '/d', path: '/e' },
      { op: 'copy', from: '/f', path: '/g' },
      { op: 'test', path: '/h', value: 3 },
    ];

    const result = benchmark('checkCompliance (6 operations)', () => {
      checkCompliance(patch);
    });

    expect(result.totalMs).toBeLessThan(200);
    expect(result.avgMs).toBeLessThan(2);
  });
});

describe('Backward Compatibility', () => {
  it('should maintain same interface as json-patch-utils.ts', () => {
    expect(typeof escapePathToken).toBe('function');
    expect(typeof unescapePathToken).toBe('function');
    expect(typeof parsePath).toBe('function');
    expect(typeof buildPath).toBe('function');
    expect(typeof getValueAtPath).toBe('function');
    expect(typeof setValueAtPath).toBe('function');
    expect(typeof deleteValueAtPath).toBe('function');
    expect(typeof pathExists).toBe('function');
    expect(typeof validateOperation).toBe('function');
    expect(typeof validatePatch).toBe('function');
    expect(typeof applyOperation).toBe('function');
    expect(typeof applyPatch).toBe('function');
    expect(typeof applyPatchAtomic).toBe('function');
    expect(typeof deepEqual).toBe('function');
    expect(typeof computeDiff).toBe('function');
    expect(typeof createTestOperation).toBe('function');
    expect(typeof createAddOperation).toBe('function');
    expect(typeof createRemoveOperation).toBe('function');
    expect(typeof createReplaceOperation).toBe('function');
    expect(typeof createMoveOperation).toBe('function');
    expect(typeof createCopyOperation).toBe('function');
  });

  it('should return same structure from applyPatch', () => {
    const doc = { a: 1 };
    const patch: JsonPatchOperation[] = [{ op: 'add', path: '/b', value: 2 }];
    const result = applyPatch(doc, patch);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('document');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.document).toBe('object');
  });

  it('should return same structure from validateOperation', () => {
    const result = validateOperation({ op: 'add', path: '/foo', value: 1 });

    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');
    if (!result.valid) {
      expect(result).toHaveProperty('error');
    }
  });

  it('should maintain PatchResult type compatibility', () => {
    const doc = { a: 1 };
    const result = applyPatch(doc, [{ op: 'remove', path: '/nonexistent' }]);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    if (result.failedOperationIndex !== undefined) {
      expect(typeof result.failedOperationIndex).toBe('number');
    }
  });

  it('should maintain DiffConfig compatibility', () => {
    const oldState = { deep: { nested: { value: 1 } } };
    const newState = { deep: { nested: { value: 2 } } };

    const diff1 = computeDiff(oldState, newState, { maxDepth: 1 });
    expect(diff1.length).toBe(1);

    const diff2 = computeDiff(oldState, newState, {});
    expect(diff2.length).toBeGreaterThanOrEqual(1);
  });
});
