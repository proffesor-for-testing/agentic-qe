/**
 * JSON Patch Wrapper Unit Tests (RFC 6902)
 *
 * Comprehensive tests for the fast-json-patch based wrapper including:
 * - All JSON Patch operations (add, remove, replace, move, copy, test)
 * - Edge cases (nested paths, array operations, escape sequences)
 * - Invalid patch detection
 * - RFC 6902 compliance validation
 * - Performance comparison
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  validatePath,

  // Validation
  validateOperation,
  validatePatch,

  // Compliance
  checkCompliance,
  ensureCompliance,

  // Patch application
  applyOperation,
  applyPatch,
  applyPatchAtomic,
  validate,

  // Diff computation
  deepEqual,
  computeDiff,
  observe,
  unobserve,

  // Operation factories
  createTestOperation,
  createAddOperation,
  createRemoveOperation,
  createReplaceOperation,
  createMoveOperation,
  createCopyOperation,

  // Error handling
  JsonPatchError,

  // Fast-json-patch access
  fastJsonPatchLib,
} from '../../../../src/adapters/ag-ui/json-patch.js';
import type { JsonPatchOperation } from '../../../../src/adapters/ag-ui/event-types.js';

// ============================================================================
// Path Utilities Tests (RFC 6901 JSON Pointer)
// ============================================================================

describe('Path Utilities (RFC 6901)', () => {
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

    it('should handle multiple consecutive special characters', () => {
      expect(escapePathToken('~~//~~')).toBe('~0~0~1~1~0~0');
    });
  });

  describe('unescapePathToken', () => {
    it('should unescape ~0 as tilde', () => {
      expect(unescapePathToken('a~0b')).toBe('a~b');
    });

    it('should unescape ~1 as slash', () => {
      expect(unescapePathToken('a~1b')).toBe('a/b');
    });

    it('should unescape in correct order (~1 before ~0)', () => {
      // ~01 should become ~1 (first ~0->~, then we have ~1 which stays)
      expect(unescapePathToken('a~01b')).toBe('a~1b');
    });

    it('should handle normal strings', () => {
      expect(unescapePathToken('normal')).toBe('normal');
    });

    it('should roundtrip with escapePathToken', () => {
      const original = 'path/with~special/chars~';
      const escaped = escapePathToken(original);
      expect(unescapePathToken(escaped)).toBe(original);
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

    it('should parse path with hyphen (array append)', () => {
      expect(parsePath('/arr/-')).toEqual(['arr', '-']);
    });

    it('should throw for invalid path without leading slash', () => {
      expect(() => parsePath('foo')).toThrow(JsonPatchError);
    });

    it('should throw with meaningful error message', () => {
      expect(() => parsePath('invalid')).toThrow(/must start with/);
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

  describe('validatePath', () => {
    it('should accept empty path', () => {
      expect(validatePath('')).toBe(true);
    });

    it('should accept valid path', () => {
      expect(validatePath('/foo/bar')).toBe(true);
    });

    it('should accept path with escape sequences', () => {
      expect(validatePath('/a~0b/c~1d')).toBe(true);
    });

    it('should reject path without leading slash', () => {
      expect(validatePath('foo')).toBe(false);
    });

    it('should reject path with invalid escape sequence', () => {
      expect(validatePath('/a~2b')).toBe(false);
    });

    it('should reject path with bare tilde', () => {
      expect(validatePath('/a~')).toBe(false);
    });
  });

  describe('getValueAtPath', () => {
    const doc = {
      foo: 'bar',
      nested: { deep: { value: 42 } },
      arr: [1, 2, { x: 3 }],
      nullValue: null,
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

    it('should return undefined for out-of-bounds array index', () => {
      expect(getValueAtPath(doc, '/arr/99')).toBeUndefined();
    });

    it('should handle null values', () => {
      expect(getValueAtPath(doc, '/nullValue')).toBeNull();
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

    it('should return true for null value', () => {
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
      expect(() => setValueAtPath(doc, '/nonexistent/deep', 'value')).toThrow(JsonPatchError);
    });

    it('should throw for empty path', () => {
      const doc = {};
      expect(() => setValueAtPath(doc, '', {})).toThrow(JsonPatchError);
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
      expect(() => deleteValueAtPath(doc, '/nonexistent')).toThrow(JsonPatchError);
    });

    it('should throw for empty path', () => {
      const doc = {};
      expect(() => deleteValueAtPath(doc, '')).toThrow(JsonPatchError);
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
      expect(result.error).toContain('Invalid operation type');
    });

    it('should reject add without value', () => {
      const result = validateOperation({ op: 'add', path: '/foo' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a \'value\' field');
    });

    it('should reject move without from', () => {
      const result = validateOperation({ op: 'move', path: '/b' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a \'from\' path');
    });

    it('should reject invalid path format', () => {
      const result = validateOperation({ op: 'add', path: 'invalid', value: 1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JSON Pointer');
    });

    it('should collect all errors', () => {
      const result = validateOperation({ op: 'invalid' as 'add', path: 'bad' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(1);
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
// RFC 6902 Compliance Tests
// ============================================================================

describe('RFC 6902 Compliance', () => {
  describe('checkCompliance', () => {
    it('should pass compliant patch', () => {
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/foo', value: 1 },
        { op: 'remove', path: '/bar' },
        { op: 'replace', path: '/baz', value: 2 },
        { op: 'move', from: '/a', path: '/b' },
        { op: 'copy', from: '/c', path: '/d' },
        { op: 'test', path: '/e', value: 3 },
      ];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect invalid operation type', () => {
      const patch = [{ op: 'invalid', path: '/foo' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('invalid_op');
      expect(result.issues[0].rfcSection).toBe('4');
    });

    it('should detect missing path', () => {
      const patch = [{ op: 'add', value: 1 }] as unknown as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues.some(i => i.type === 'missing_path')).toBe(true);
    });

    it('should detect invalid path format', () => {
      const patch: JsonPatchOperation[] = [{ op: 'add', path: 'invalid', value: 1 }];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('invalid_path');
    });

    it('should detect missing value for add', () => {
      const patch = [{ op: 'add', path: '/foo' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('missing_value');
      expect(result.issues[0].rfcSection).toBe('4.1');
    });

    it('should detect missing value for replace', () => {
      const patch = [{ op: 'replace', path: '/foo' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].rfcSection).toBe('4.3');
    });

    it('should detect missing from for move', () => {
      const patch = [{ op: 'move', path: '/b' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('missing_from');
      expect(result.issues[0].rfcSection).toBe('4.4');
    });

    it('should detect missing from for copy', () => {
      const patch = [{ op: 'copy', path: '/b' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].rfcSection).toBe('4.5');
    });

    it('should detect invalid from path', () => {
      const patch: JsonPatchOperation[] = [{ op: 'move', from: 'invalid', path: '/b' }];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('invalid_from');
    });
  });

  describe('ensureCompliance', () => {
    it('should not throw for compliant patch', () => {
      const patch: JsonPatchOperation[] = [{ op: 'add', path: '/foo', value: 1 }];
      expect(() => ensureCompliance(patch)).not.toThrow();
    });

    it('should throw JsonPatchError for non-compliant patch', () => {
      const patch = [{ op: 'invalid', path: '/foo' }] as JsonPatchOperation[];
      expect(() => ensureCompliance(patch)).toThrow(JsonPatchError);
    });

    it('should include compliance details in error', () => {
      const patch = [{ op: 'add', path: 'bad' }] as JsonPatchOperation[];
      try {
        ensureCompliance(patch);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonPatchError);
        expect((error as JsonPatchError).code).toBe('COMPLIANCE_FAILED');
        expect((error as JsonPatchError).details?.issues).toBeDefined();
      }
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

    it('should handle complex nested values', () => {
      const doc = {};
      const result = applyOperation(doc, {
        op: 'add',
        path: '/complex',
        value: { nested: { arr: [1, 2, 3], obj: { a: 1 } } },
      });
      expect(result).toEqual({
        complex: { nested: { arr: [1, 2, 3], obj: { a: 1 } } },
      });
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
      // Verify deep copy - modifying target should not affect source
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

    it('should pass for null value', () => {
      const doc = { foo: null };
      const result = applyOperation(doc, { op: 'test', path: '/foo', value: null });
      expect(result).toEqual({ foo: null });
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
        { op: 'remove', path: '/nonexistent' },
      ];
      const result = applyPatch(doc, patch);
      expect(result.success).toBe(false);
      expect(result.document).toEqual({ a: 1 }); // Rollback to original
    });

    it('should not mutate original document', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'add', path: '/b', value: 2 }];
      applyPatch(doc, patch);
      expect(doc).toEqual({ a: 1 });
    });

    it('should reject invalid patch with validation errors', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [
        { op: 'invalid' as 'add', path: '/b', value: 2 },
      ];
      const result = applyPatch(doc, patch);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
    });

    it('should reject non-compliant patch', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: 'invalid-path', value: 2 },
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

    it('should throw JsonPatchError on error', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'remove', path: '/nonexistent' }];
      expect(() => applyPatchAtomic(doc, patch)).toThrow(JsonPatchError);
    });

    it('should include failure details in error', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'remove', path: '/nonexistent' }];
      try {
        applyPatchAtomic(doc, patch);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonPatchError);
        expect((error as JsonPatchError).code).toBe('APPLICATION_FAILED');
      }
    });
  });

  describe('validate (dry run)', () => {
    it('should return true for valid patch', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/b', value: 2 },
        { op: 'replace', path: '/a', value: 10 },
      ];
      expect(validate(doc, patch)).toBe(true);
    });

    it('should return false for invalid syntax', () => {
      const doc = { a: 1 };
      const patch = [{ op: 'invalid' }] as JsonPatchOperation[];
      expect(validate(doc, patch)).toBe(false);
    });

    it('should return false for patch that would fail', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'remove', path: '/nonexistent' }];
      expect(validate(doc, patch)).toBe(false);
    });

    it('should not mutate document during validation', () => {
      const doc = { a: 1 };
      const patch: JsonPatchOperation[] = [{ op: 'add', path: '/b', value: 2 }];
      validate(doc, patch);
      expect(doc).toEqual({ a: 1 });
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

      // Make changes
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
    expect(diff.some(op => op.path === '/arr/0' || op.path === '/arr/-')).toBe(true);
  });

  it('should handle deeply nested structures', () => {
    const oldState = {
      level1: {
        level2: {
          level3: {
            level4: { value: 1 },
          },
        },
      },
    };
    const newState = {
      level1: {
        level2: {
          level3: {
            level4: { value: 2 },
          },
        },
      },
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
    // Note: JSON doesn't support undefined. structuredClone converts undefined to missing.
    // This test verifies behavior for explicitly set properties that need removal.
    const doc: Record<string, unknown> = { a: 1 };
    doc.b = 'temporary'; // Add a property to remove
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
          notifications: true,
        },
      },
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ],
      metadata: {
        version: 1,
        lastUpdated: '2026-01-01',
      },
    };

    const newState = {
      user: {
        name: 'Alice',
        preferences: {
          theme: 'dark',
          notifications: false,
          language: 'en',
        },
      },
      items: [
        { id: 1, name: 'Item 1 Updated' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ],
      metadata: {
        version: 2,
        lastUpdated: '2026-01-30',
      },
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
      { op: 'replace', path: '/data', value: 'updated' },
    ];

    const result = applyPatch(doc, patch);
    expect(result.success).toBe(true);
    expect(result.document).toEqual({ version: 2, data: 'updated' });

    // Now try with wrong version
    const failPatch: JsonPatchOperation[] = [
      { op: 'test', path: '/version', value: 1 }, // This should fail
      { op: 'replace', path: '/data', value: 'conflict' },
    ];

    const failResult = applyPatch(result.document, failPatch);
    expect(failResult.success).toBe(false);
  });

  it('should handle move operations for reordering', () => {
    const doc = {
      items: ['a', 'b', 'c', 'd'],
    };

    // Move 'd' to position 1
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

// ============================================================================
// Error Handling Tests
// ============================================================================

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

// ============================================================================
// Fast-json-patch Library Access Tests
// ============================================================================

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
    expect(error).toBeUndefined(); // No error means valid
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

// ============================================================================
// Performance Comparison Tests
// ============================================================================

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
    // Modify some users
    newState.users[50].name = 'Modified User';
    newState.users[75].preferences.theme = 'dark';
    newState.users.push({ id: 100, name: 'New User', email: 'new@example.com', preferences: { theme: 'light', notifications: true } });

    const result = benchmark('computeDiff (100 users)', () => {
      computeDiff(oldState, newState);
    });

    // Should complete 100 iterations in reasonable time
    expect(result.totalMs).toBeLessThan(5000); // 5 seconds max
    expect(result.avgMs).toBeLessThan(50); // 50ms per diff max
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

    expect(result.totalMs).toBeLessThan(1000); // 1 second max
    expect(result.avgMs).toBeLessThan(10); // 10ms per apply max
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

    expect(result.totalMs).toBeLessThan(500); // 500ms max
    expect(result.avgMs).toBeLessThan(5); // 5ms per validate max
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

    expect(result.totalMs).toBeLessThan(200); // 200ms max
    expect(result.avgMs).toBeLessThan(2); // 2ms per check max
  });
});

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

describe('Backward Compatibility', () => {
  it('should maintain same interface as json-patch-utils.ts', () => {
    // These are the functions exported from the old module
    // Verify they exist and work the same way
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

    // Check structure matches old interface
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('document');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.document).toBe('object');
  });

  it('should return same structure from validateOperation', () => {
    const result = validateOperation({ op: 'add', path: '/foo', value: 1 });

    // Check structure matches old interface
    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');
    if (!result.valid) {
      expect(result).toHaveProperty('error');
    }
  });

  it('should maintain PatchResult type compatibility', () => {
    const doc = { a: 1 };
    const result = applyPatch(doc, [{ op: 'remove', path: '/nonexistent' }]);

    // Failed result should have error and optionally failedOperationIndex
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    // failedOperationIndex is optional
    if (result.failedOperationIndex !== undefined) {
      expect(typeof result.failedOperationIndex).toBe('number');
    }
  });

  it('should maintain DiffConfig compatibility', () => {
    const oldState = { deep: { nested: { value: 1 } } };
    const newState = { deep: { nested: { value: 2 } } };

    // maxDepth should work
    const diff1 = computeDiff(oldState, newState, { maxDepth: 1 });
    expect(diff1.length).toBe(1);

    // Default should go deep
    const diff2 = computeDiff(oldState, newState, {});
    expect(diff2.length).toBeGreaterThanOrEqual(1);
  });
});
