/**
 * JSON Patch Utilities Unit Tests (RFC 6902)
 *
 * Tests for JSON Patch operations: add, remove, replace, move, copy, test
 * and path utilities for AG-UI STATE_DELTA event handling.
 */

import { describe, it, expect } from 'vitest';
import {
  // Path utilities
  escapePathToken,
  unescapePathToken,
  parsePath,
  buildPath,
  getValueAtPath,
  setValueAtPath,
  deleteValueAtPath,
  pathExists,

  // Validation
  validateOperation,
  validatePatch,

  // Patch application
  applyOperation,
  applyPatch,
  applyPatchAtomic,

  // Diff computation
  deepEqual,
  computeDiff,

  // Operation factories
  createTestOperation,
  createAddOperation,
  createRemoveOperation,
  createReplaceOperation,
  createMoveOperation,
  createCopyOperation,
} from '../../../../src/adapters/ag-ui/json-patch-utils.js';
import type { JsonPatchOperation } from '../../../../src/adapters/ag-ui/index.js';

// ============================================================================
// Path Utilities Tests
// ============================================================================

describe('Path Utilities', () => {
  describe('escapePathToken', () => {
    it('should escape tilde as ~0', () => {
      expect(escapePathToken('a~b')).toBe('a~0b');
    });

    it('should escape slash as ~1', () => {
      expect(escapePathToken('a/b')).toBe('a~1b');
    });

    it('should escape both tilde and slash', () => {
      expect(escapePathToken('a~b/c')).toBe('a~0b~1c');
    });

    it('should handle strings without special characters', () => {
      expect(escapePathToken('normal')).toBe('normal');
    });

    it('should handle empty string', () => {
      expect(escapePathToken('')).toBe('');
    });
  });

  describe('unescapePathToken', () => {
    it('should unescape ~0 as tilde', () => {
      expect(unescapePathToken('a~0b')).toBe('a~b');
    });

    it('should unescape ~1 as slash', () => {
      expect(unescapePathToken('a~1b')).toBe('a/b');
    });

    it('should unescape in correct order', () => {
      // ~01 should become ~1, not /
      expect(unescapePathToken('a~01b')).toBe('a~1b');
    });

    it('should handle normal strings', () => {
      expect(unescapePathToken('normal')).toBe('normal');
    });
  });

  describe('parsePath', () => {
    it('should parse empty path', () => {
      expect(parsePath('')).toEqual([]);
    });

    it('should parse simple path', () => {
      expect(parsePath('/foo')).toEqual(['foo']);
    });

    it('should parse nested path', () => {
      expect(parsePath('/foo/bar/baz')).toEqual(['foo', 'bar', 'baz']);
    });

    it('should parse path with escaped characters', () => {
      expect(parsePath('/a~0b/c~1d')).toEqual(['a~b', 'c/d']);
    });

    it('should parse path with numeric tokens', () => {
      expect(parsePath('/arr/0/value')).toEqual(['arr', '0', 'value']);
    });

    it('should throw for invalid path without leading slash', () => {
      expect(() => parsePath('foo')).toThrow();
    });
  });

  describe('buildPath', () => {
    it('should build empty path from empty tokens', () => {
      expect(buildPath([])).toBe('');
    });

    it('should build simple path', () => {
      expect(buildPath(['foo'])).toBe('/foo');
    });

    it('should build nested path', () => {
      expect(buildPath(['foo', 'bar', 'baz'])).toBe('/foo/bar/baz');
    });

    it('should escape special characters', () => {
      expect(buildPath(['a~b', 'c/d'])).toBe('/a~0b/c~1d');
    });

    it('should roundtrip with parsePath', () => {
      const original = '/foo/bar~0/baz~1';
      const tokens = parsePath(original);
      expect(buildPath(tokens)).toBe(original);
    });
  });

  describe('getValueAtPath', () => {
    const doc = {
      foo: 'bar',
      nested: { deep: { value: 42 } },
      arr: [1, 2, { x: 3 }],
    };

    it('should get root document for empty path', () => {
      expect(getValueAtPath(doc, '')).toBe(doc);
    });

    it('should get top-level value', () => {
      expect(getValueAtPath(doc, '/foo')).toBe('bar');
    });

    it('should get nested value', () => {
      expect(getValueAtPath(doc, '/nested/deep/value')).toBe(42);
    });

    it('should get array element', () => {
      expect(getValueAtPath(doc, '/arr/0')).toBe(1);
    });

    it('should get nested value in array', () => {
      expect(getValueAtPath(doc, '/arr/2/x')).toBe(3);
    });

    it('should return undefined for non-existent path', () => {
      expect(getValueAtPath(doc, '/nonexistent')).toBeUndefined();
    });

    it('should return undefined for invalid array index', () => {
      expect(getValueAtPath(doc, '/arr/99')).toBeUndefined();
    });
  });

  describe('setValueAtPath', () => {
    it('should set top-level value', () => {
      const doc = { foo: 'bar' };
      setValueAtPath(doc, '/foo', 'baz');
      expect(doc.foo).toBe('baz');
    });

    it('should set nested value', () => {
      const doc = { nested: { value: 1 } };
      setValueAtPath(doc, '/nested/value', 2);
      expect(doc.nested.value).toBe(2);
    });

    it('should set array element', () => {
      const doc = { arr: [1, 2, 3] };
      setValueAtPath(doc, '/arr/1', 99);
      expect(doc.arr[1]).toBe(99);
    });

    it('should throw for non-existent path', () => {
      const doc = { foo: 'bar' };
      expect(() => setValueAtPath(doc, '/nonexistent/deep', 'value')).toThrow();
    });

    it('should throw for empty path', () => {
      const doc = {};
      expect(() => setValueAtPath(doc, '', {})).toThrow();
    });
  });

  describe('deleteValueAtPath', () => {
    it('should delete top-level property', () => {
      const doc = { foo: 'bar', baz: 'qux' };
      deleteValueAtPath(doc, '/foo');
      expect(doc).toEqual({ baz: 'qux' });
    });

    it('should delete nested property', () => {
      const doc = { nested: { a: 1, b: 2 } };
      deleteValueAtPath(doc, '/nested/a');
      expect(doc.nested).toEqual({ b: 2 });
    });

    it('should delete array element', () => {
      const doc = { arr: [1, 2, 3] };
      deleteValueAtPath(doc, '/arr/1');
      expect(doc.arr).toEqual([1, 3]);
    });

    it('should throw for non-existent path', () => {
      const doc = { foo: 'bar' };
      expect(() => deleteValueAtPath(doc, '/nonexistent')).toThrow();
    });

    it('should throw for empty path', () => {
      const doc = {};
      expect(() => deleteValueAtPath(doc, '')).toThrow();
    });
  });

  describe('pathExists', () => {
    const doc = {
      foo: 'bar',
      nested: { value: null },
      arr: [1, 2],
    };

    it('should return true for root', () => {
      expect(pathExists(doc, '')).toBe(true);
    });

    it('should return true for existing path', () => {
      expect(pathExists(doc, '/foo')).toBe(true);
    });

    it('should return true for nested path', () => {
      expect(pathExists(doc, '/nested/value')).toBe(true);
    });

    it('should return true for array element', () => {
      expect(pathExists(doc, '/arr/0')).toBe(true);
    });

    it('should return false for non-existent path', () => {
      expect(pathExists(doc, '/nonexistent')).toBe(false);
    });

    it('should return false for out-of-bounds array index', () => {
      expect(pathExists(doc, '/arr/99')).toBe(false);
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation', () => {
  describe('validateOperation', () => {
    it('should validate add operation', () => {
      expect(validateOperation({ op: 'add', path: '/foo', value: 1 })).toEqual({ valid: true });
    });

    it('should validate remove operation', () => {
      expect(validateOperation({ op: 'remove', path: '/foo' })).toEqual({ valid: true });
    });

    it('should validate replace operation', () => {
      expect(validateOperation({ op: 'replace', path: '/foo', value: 2 })).toEqual({ valid: true });
    });

    it('should validate move operation', () => {
      expect(validateOperation({ op: 'move', from: '/a', path: '/b' })).toEqual({ valid: true });
    });

    it('should validate copy operation', () => {
      expect(validateOperation({ op: 'copy', from: '/a', path: '/b' })).toEqual({ valid: true });
    });

    it('should validate test operation', () => {
      expect(validateOperation({ op: 'test', path: '/foo', value: 1 })).toEqual({ valid: true });
    });

    it('should reject invalid operation type', () => {
      const result = validateOperation({ op: 'invalid' as 'add', path: '/foo', value: 1 });
      expect(result.valid).toBe(false);
    });

    it('should reject add without value', () => {
      const result = validateOperation({ op: 'add', path: '/foo' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
    });

    it('should reject move without from', () => {
      const result = validateOperation({ op: 'move', path: '/b' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid path format', () => {
      const result = validateOperation({ op: 'add', path: 'invalid', value: 1 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePatch', () => {
    it('should validate empty patch', () => {
      expect(validatePatch([])).toEqual({ valid: true });
    });

    it('should validate valid patch', () => {
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/foo', value: 1 },
        { op: 'replace', path: '/bar', value: 2 },
      ];
      expect(validatePatch(patch)).toEqual({ valid: true });
    });

    it('should reject patch with invalid operation', () => {
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/foo', value: 1 },
        { op: 'invalid' as 'add', path: '/bar', value: 2 },
      ];
      const result = validatePatch(patch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Operation 1');
    });
  });
});

// ============================================================================
// Patch Application Tests
// ============================================================================

describe('Patch Application', () => {
  describe('applyOperation - add', () => {
    it('should add new property', () => {
      const doc = { foo: 1 };
      const result = applyOperation(doc, { op: 'add', path: '/bar', value: 2 });
      expect(result).toEqual({ foo: 1, bar: 2 });
    });

    it('should add nested property', () => {
      const doc = { nested: {} };
      const result = applyOperation(doc, { op: 'add', path: '/nested/value', value: 42 });
      expect(result).toEqual({ nested: { value: 42 } });
    });

    it('should add to array using -', () => {
      const doc = { arr: [1, 2] };
      const result = applyOperation(doc, { op: 'add', path: '/arr/-', value: 3 });
      expect(result).toEqual({ arr: [1, 2, 3] });
    });

    it('should insert into array at index', () => {
      const doc = { arr: [1, 3] };
      const result = applyOperation(doc, { op: 'add', path: '/arr/1', value: 2 });
      expect(result).toEqual({ arr: [1, 2, 3] });
    });

    it('should not mutate original document', () => {
      const doc = { foo: 1 };
      applyOperation(doc, { op: 'add', path: '/bar', value: 2 });
      expect(doc).toEqual({ foo: 1 });
    });
  });

  describe('applyOperation - remove', () => {
    it('should remove property', () => {
      const doc = { foo: 1, bar: 2 };
      const result = applyOperation(doc, { op: 'remove', path: '/foo' });
      expect(result).toEqual({ bar: 2 });
    });

    it('should remove nested property', () => {
      const doc = { nested: { a: 1, b: 2 } };
      const result = applyOperation(doc, { op: 'remove', path: '/nested/a' });
      expect(result).toEqual({ nested: { b: 2 } });
    });

    it('should remove array element', () => {
      const doc = { arr: [1, 2, 3] };
      const result = applyOperation(doc, { op: 'remove', path: '/arr/1' });
      expect(result).toEqual({ arr: [1, 3] });
    });

    it('should throw for non-existent path', () => {
      const doc = { foo: 1 };
      expect(() => applyOperation(doc, { op: 'remove', path: '/nonexistent' })).toThrow();
    });
  });

  describe('applyOperation - replace', () => {
    it('should replace property', () => {
      const doc = { foo: 1 };
      const result = applyOperation(doc, { op: 'replace', path: '/foo', value: 2 });
      expect(result).toEqual({ foo: 2 });
    });

    it('should replace nested property', () => {
      const doc = { nested: { value: 1 } };
      const result = applyOperation(doc, { op: 'replace', path: '/nested/value', value: 2 });
      expect(result).toEqual({ nested: { value: 2 } });
    });

    it('should replace array element', () => {
      const doc = { arr: [1, 2, 3] };
      const result = applyOperation(doc, { op: 'replace', path: '/arr/1', value: 99 });
      expect(result).toEqual({ arr: [1, 99, 3] });
    });

    it('should throw for non-existent path', () => {
      const doc = { foo: 1 };
      expect(() => applyOperation(doc, { op: 'replace', path: '/nonexistent', value: 2 })).toThrow();
    });
  });

  describe('applyOperation - move', () => {
    it('should move property', () => {
      const doc = { a: 1, b: 2 };
      const result = applyOperation(doc, { op: 'move', from: '/a', path: '/c' });
      expect(result).toEqual({ b: 2, c: 1 });
    });

    it('should move nested property', () => {
      const doc = { source: { value: 42 }, target: {} };
      const result = applyOperation(doc, { op: 'move', from: '/source/value', path: '/target/value' });
      expect(result).toEqual({ source: {}, target: { value: 42 } });
    });

    it('should throw for non-existent source', () => {
      const doc = { a: 1 };
      expect(() => applyOperation(doc, { op: 'move', from: '/nonexistent', path: '/b' })).toThrow();
    });
  });

  describe('applyOperation - copy', () => {
    it('should copy property', () => {
      const doc = { a: 1 };
      const result = applyOperation(doc, { op: 'copy', from: '/a', path: '/b' });
      expect(result).toEqual({ a: 1, b: 1 });
    });

    it('should deep copy nested structures', () => {
      const doc = { source: { nested: { value: 42 } } };
      const result = applyOperation(doc, { op: 'copy', from: '/source', path: '/target' });
      expect(result.target).toEqual({ nested: { value: 42 } });
      // Verify deep copy
      expect(result.target).not.toBe(result.source);
    });

    it('should throw for non-existent source', () => {
      const doc = { a: 1 };
      expect(() => applyOperation(doc, { op: 'copy', from: '/nonexistent', path: '/b' })).toThrow();
    });
  });

  describe('applyOperation - test', () => {
    it('should pass when values match', () => {
      const doc = { foo: 1 };
      const result = applyOperation(doc, { op: 'test', path: '/foo', value: 1 });
      expect(result).toEqual({ foo: 1 });
    });

    it('should pass for complex value', () => {
      const doc = { obj: { a: 1, b: [2, 3] } };
      const result = applyOperation(doc, { op: 'test', path: '/obj', value: { a: 1, b: [2, 3] } });
      expect(result).toEqual(doc);
    });

    it('should throw when values do not match', () => {
      const doc = { foo: 1 };
      expect(() => applyOperation(doc, { op: 'test', path: '/foo', value: 2 })).toThrow();
    });

    it('should throw for non-existent path', () => {
      const doc = { foo: 1 };
      expect(() => applyOperation(doc, { op: 'test', path: '/bar', value: 1 })).toThrow();
    });
  });

  describe('applyPatch', () => {
    it('should apply empty patch', () => {
      const doc = { foo: 1 };
      const result = applyPatch(doc, []);
      expect(result.success).toBe(true);
      expect(result.document).toEqual({ foo: 1 });
    });

    it('should apply multiple operations', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/b', value: 2 },
        { op: 'replace', path: '/a', value: 10 },
        { op: 'add', path: '/c', value: 3 },
      ];
      const result = applyPatch(doc, patch);
      expect(result.success).toBe(true);
      expect(result.document).toEqual({ a: 10, b: 2, c: 3 });
    });

    it('should rollback on error', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/b', value: 2 },
        { op: 'remove', path: '/nonexistent' }, // This will fail
      ];
      const result = applyPatch(doc, patch);
      expect(result.success).toBe(false);
      expect(result.document).toEqual({ a: 1 }); // Rollback to original
      expect(result.failedOperationIndex).toBe(1);
    });

    it('should not mutate original document on success', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'add', path: '/b', value: 2 }];
      applyPatch(doc, patch);
      expect(doc).toEqual({ a: 1 });
    });

    it('should reject invalid patch', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [
        { op: 'invalid' as 'add', path: '/b', value: 2 },
      ];
      const result = applyPatch(doc, patch);
      expect(result.success).toBe(false);
    });
  });

  describe('applyPatchAtomic', () => {
    it('should return new document on success', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'add', path: '/b', value: 2 }];
      const result = applyPatchAtomic(doc, patch);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should throw on error', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'remove', path: '/nonexistent' }];
      expect(() => applyPatchAtomic(doc, patch)).toThrow();
    });
  });
});

// ============================================================================
// Diff Computation Tests
// ============================================================================

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
      expect(diff).toContainEqual({ op: 'replace', path: '/nested/b', value: 3 });
      expect(diff).toContainEqual({ op: 'add', path: '/nested/c', value: 4 });
    });

    it('should handle array changes', () => {
      const oldState = { arr: [1, 2, 3] };
      const newState = { arr: [1, 4, 3] };
      const diff = computeDiff(oldState, newState);
      expect(diff).toContainEqual({ op: 'replace', path: '/arr/1', value: 4 });
    });

    it('should handle array length changes', () => {
      const oldState = { arr: [1, 2] };
      const newState = { arr: [1, 2, 3] };
      const diff = computeDiff(oldState, newState);
      expect(diff.some(op => op.op === 'add' && op.path === '/arr/2')).toBe(true);
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
      // Should replace entire deep object instead of drilling down
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
  });
});

// ============================================================================
// Operation Factory Tests
// ============================================================================

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
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty objects', () => {
    expect(computeDiff({}, {})).toEqual([]);
    expect(computeDiff({}, { a: 1 })).toEqual([{ op: 'add', path: '/a', value: 1 }]);
    expect(computeDiff({ a: 1 }, {})).toEqual([{ op: 'remove', path: '/a' }]);
  });

  it('should handle empty arrays', () => {
    const diff = computeDiff({ arr: [] }, { arr: [1] });
    expect(diff).toContainEqual({ op: 'add', path: '/arr/0', value: 1 });
  });

  it('should handle deeply nested structures', () => {
    const oldState = {
      level1: {
        level2: {
          level3: {
            level4: { value: 1 }
          }
        }
      }
    };
    const newState = {
      level1: {
        level2: {
          level3: {
            level4: { value: 2 }
          }
        }
      }
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

  it('should handle undefined removal', () => {
    const doc = { a: 1, b: undefined };
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
        preferences: {
          theme: 'light',
          notifications: true
        }
      },
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ],
      metadata: {
        version: 1,
        lastUpdated: '2026-01-01'
      }
    };

    const newState = {
      user: {
        name: 'Alice',
        preferences: {
          theme: 'dark',
          notifications: false,
          language: 'en'
        }
      },
      items: [
        { id: 1, name: 'Item 1 Updated' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ],
      metadata: {
        version: 2,
        lastUpdated: '2026-01-30'
      }
    };

    const diff = computeDiff(oldState, newState);
    const result = applyPatch(oldState, diff);

    expect(result.success).toBe(true);
    expect(deepEqual(result.document, newState)).toBe(true);
  });

  it('should handle test operations for optimistic concurrency', () => {
    const doc = { version: 1, data: 'original' };

    // Simulate optimistic locking
    const patch: JsonPatchOperation[] = [
      { op: 'test', path: '/version', value: 1 },
      { op: 'replace', path: '/version', value: 2 },
      { op: 'replace', path: '/data', value: 'updated' }
    ];

    const result = applyPatch(doc, patch);
    expect(result.success).toBe(true);
    expect(result.document).toEqual({ version: 2, data: 'updated' });

    // Now try with wrong version
    const failPatch: JsonPatchOperation[] = [
      { op: 'test', path: '/version', value: 1 }, // This should fail
      { op: 'replace', path: '/data', value: 'conflict' }
    ];

    const failResult = applyPatch(result.document, failPatch);
    expect(failResult.success).toBe(false);
  });
});
