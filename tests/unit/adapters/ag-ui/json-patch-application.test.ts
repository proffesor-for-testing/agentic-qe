/**
 * JSON Patch Application Tests
 * Split from json-patch.test.ts
 *
 * Tests for applyOperation (add, remove, replace, move, copy, test),
 * applyPatch, applyPatchAtomic, and validate (dry run).
 */

import { describe, it, expect } from 'vitest';
import {
  applyOperation,
  applyPatch,
  applyPatchAtomic,
  validate,
  JsonPatchError,
} from '../../../../src/adapters/ag-ui/json-patch.js';
import type { JsonPatchOperation } from '../../../../src/adapters/ag-ui/event-types.js';

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
      expect(result.document).toEqual({ a: 1 });
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
