/**
 * JSON Patch Path Utilities Tests (RFC 6901 JSON Pointer)
 * Split from json-patch.test.ts
 *
 * Tests for path utilities: escape/unescape, parse/build, get/set/delete,
 * pathExists, and validatePath.
 */

import { describe, it, expect } from 'vitest';
import {
  escapePathToken,
  unescapePathToken,
  parsePath,
  buildPath,
  getValueAtPath,
  setValueAtPath,
  deleteValueAtPath,
  pathExists,
  validatePath,
  JsonPatchError,
} from '../../../../src/adapters/ag-ui/json-patch.js';

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
