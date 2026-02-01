/**
 * A2UI Data Binding Unit Tests
 *
 * Comprehensive test suite for A2UI data binding including:
 * - JSON Pointer (RFC 6901) parsing and resolution
 * - BoundValue types and resolution
 * - Reactive store with subscriptions
 *
 * Target: 40+ unit tests covering all data binding functionality.
 *
 * @module tests/unit/adapters/a2ui/data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  // ===== JSON Pointer =====
  JsonPointerError,
  escapeSegment,
  unescapeSegment,
  parseJsonPointer,
  buildJsonPointer,
  isValidPointer,
  resolvePointer,
  resolvePointerWithInfo,
  pointerExists,
  setAtPointer,
  deleteAtPointer,
  getAllPaths,
  isParentPointer,
  getParentPointer,
  getPointerKey,
  joinPointers,
  getRelativePath,

  // ===== BoundValue =====
  type DataBoundValue,
  type DataLiteralValue,
  type DataPathValue,
  type DataCombinedValue,
  isDataLiteralValue,
  isDataPathValue,
  isDataCombinedValue,
  isDataBoundValue,
  isDataExplicitListChildren,
  isDataTemplateChildren,
  createDataLiteralValue,
  createDataPathValue,
  createDataCombinedValue,
  createDataExplicitListChildren,
  createDataTemplateChildren,
  BoundValueResolver,
  createBoundValueResolver,
  getDataStaticValue,
  getDataBindingPath,
  hasDynamicBinding,
  hasStaticDefault,
  toBoundValue,
  extractBoundPaths,
  resolveAllBoundValues,

  // ===== Reactive Store =====
  type StoreChange,
  ReactiveStore,
  createReactiveStore,
  createComputed,
  createSelector,
  combineStores,
} from '../../../../src/adapters/a2ui/index.js';

// ============================================================================
// JSON Pointer Tests (RFC 6901)
// ============================================================================

describe('JSON Pointer (RFC 6901)', () => {
  describe('Escape/Unescape Segments', () => {
    it('should escape tilde as ~0', () => {
      expect(escapeSegment('a~b')).toBe('a~0b');
    });

    it('should escape forward slash as ~1', () => {
      expect(escapeSegment('a/b')).toBe('a~1b');
    });

    it('should escape both tilde and slash correctly', () => {
      expect(escapeSegment('a/b~c')).toBe('a~1b~0c');
    });

    it('should unescape ~0 to tilde', () => {
      expect(unescapeSegment('a~0b')).toBe('a~b');
    });

    it('should unescape ~1 to forward slash', () => {
      expect(unescapeSegment('a~1b')).toBe('a/b');
    });

    it('should unescape in correct order (~1 before ~0)', () => {
      expect(unescapeSegment('a~1b~0c')).toBe('a/b~c');
    });

    it('should handle empty string', () => {
      expect(escapeSegment('')).toBe('');
      expect(unescapeSegment('')).toBe('');
    });

    it('should handle strings without special characters', () => {
      expect(escapeSegment('normal')).toBe('normal');
      expect(unescapeSegment('normal')).toBe('normal');
    });
  });

  describe('parseJsonPointer', () => {
    it('should parse empty string as empty array (root)', () => {
      expect(parseJsonPointer('')).toEqual([]);
    });

    it('should parse simple path', () => {
      expect(parseJsonPointer('/metrics')).toEqual(['metrics']);
    });

    it('should parse nested path', () => {
      expect(parseJsonPointer('/metrics/coverage/line')).toEqual([
        'metrics',
        'coverage',
        'line',
      ]);
    });

    it('should parse array index path', () => {
      expect(parseJsonPointer('/users/0/name')).toEqual(['users', '0', 'name']);
    });

    it('should unescape segments', () => {
      expect(parseJsonPointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
    });

    it('should handle single segment', () => {
      expect(parseJsonPointer('/root')).toEqual(['root']);
    });

    it('should throw for pointer not starting with /', () => {
      expect(() => parseJsonPointer('invalid')).toThrow(JsonPointerError);
      expect(() => parseJsonPointer('invalid')).toThrow(
        /must start with '\/' or be empty/
      );
    });
  });

  describe('buildJsonPointer', () => {
    it('should build empty string from empty array', () => {
      expect(buildJsonPointer([])).toBe('');
    });

    it('should build simple pointer', () => {
      expect(buildJsonPointer(['metrics'])).toBe('/metrics');
    });

    it('should build nested pointer', () => {
      expect(buildJsonPointer(['a', 'b', 'c'])).toBe('/a/b/c');
    });

    it('should escape special characters', () => {
      expect(buildJsonPointer(['a/b', 'c~d'])).toBe('/a~1b/c~0d');
    });
  });

  describe('isValidPointer', () => {
    it('should return true for empty string', () => {
      expect(isValidPointer('')).toBe(true);
    });

    it('should return true for valid pointers', () => {
      expect(isValidPointer('/a')).toBe(true);
      expect(isValidPointer('/a/b/c')).toBe(true);
      expect(isValidPointer('/a~0b')).toBe(true);
      expect(isValidPointer('/a~1b')).toBe(true);
    });

    it('should return false for pointers not starting with /', () => {
      expect(isValidPointer('invalid')).toBe(false);
      expect(isValidPointer('a/b')).toBe(false);
    });

    it('should return false for invalid escape sequences', () => {
      expect(isValidPointer('/a~b')).toBe(false);
      expect(isValidPointer('/a~2b')).toBe(false);
    });
  });

  describe('resolvePointer', () => {
    const data = {
      metrics: {
        coverage: {
          line: 85,
          branch: 70,
        },
      },
      users: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
      empty: null,
    };

    it('should resolve root pointer', () => {
      expect(resolvePointer(data, '')).toEqual(data);
    });

    it('should resolve simple path', () => {
      expect(resolvePointer(data, '/metrics')).toEqual(data.metrics);
    });

    it('should resolve nested path', () => {
      expect(resolvePointer(data, '/metrics/coverage/line')).toBe(85);
    });

    it('should resolve array index', () => {
      expect(resolvePointer(data, '/users/0')).toEqual({ name: 'Alice', age: 30 });
      expect(resolvePointer(data, '/users/0/name')).toBe('Alice');
      expect(resolvePointer(data, '/users/1/age')).toBe(25);
    });

    it('should return undefined for non-existent path', () => {
      expect(resolvePointer(data, '/nonexistent')).toBeUndefined();
      expect(resolvePointer(data, '/metrics/nonexistent')).toBeUndefined();
    });

    it('should return undefined for out of bounds array index', () => {
      expect(resolvePointer(data, '/users/5')).toBeUndefined();
    });

    it('should return undefined for invalid array index', () => {
      expect(resolvePointer(data, '/users/abc')).toBeUndefined();
      expect(resolvePointer(data, '/users/-1')).toBeUndefined();
    });

    it('should handle null values', () => {
      expect(resolvePointer(data, '/empty')).toBeNull();
      expect(resolvePointer(data, '/empty/nested')).toBeUndefined();
    });
  });

  describe('resolvePointerWithInfo', () => {
    const data = { a: { b: 'value' } };

    it('should return found: true with value for existing path', () => {
      const result = resolvePointerWithInfo(data, '/a/b');
      expect(result.found).toBe(true);
      expect(result.value).toBe('value');
      expect(result.parent).toEqual({ b: 'value' });
      expect(result.key).toBe('b');
    });

    it('should return found: false for non-existent path', () => {
      const result = resolvePointerWithInfo(data, '/x/y');
      expect(result.found).toBe(false);
      expect(result.value).toBeUndefined();
    });
  });

  describe('pointerExists', () => {
    const data = { a: { b: null } };

    it('should return true for existing paths', () => {
      expect(pointerExists(data, '/a')).toBe(true);
      expect(pointerExists(data, '/a/b')).toBe(true);
    });

    it('should return false for non-existent paths', () => {
      expect(pointerExists(data, '/x')).toBe(false);
      expect(pointerExists(data, '/a/b/c')).toBe(false);
    });
  });

  describe('setAtPointer', () => {
    it('should set value at simple path', () => {
      const data: Record<string, unknown> = { a: 1 };
      setAtPointer(data, '/a', 2);
      expect(data.a).toBe(2);
    });

    it('should set value at nested path', () => {
      const data: Record<string, unknown> = { a: { b: 1 } };
      setAtPointer(data, '/a/b', 2);
      expect((data.a as Record<string, unknown>).b).toBe(2);
    });

    it('should create intermediate objects', () => {
      const data: Record<string, unknown> = {};
      setAtPointer(data, '/a/b', 'value');
      expect((data.a as Record<string, unknown>).b).toBe('value');
    });

    it('should set array elements', () => {
      const data: Record<string, unknown> = { arr: [1, 2, 3] };
      setAtPointer(data, '/arr/1', 99);
      expect((data.arr as number[])[1]).toBe(99);
    });

    it('should append to array with - index', () => {
      const data: Record<string, unknown> = { arr: [1, 2] };
      setAtPointer(data, '/arr/-', 3);
      expect(data.arr).toEqual([1, 2, 3]);
    });

    it('should throw for root replacement', () => {
      const data = {};
      expect(() => setAtPointer(data, '', 'new')).toThrow(JsonPointerError);
    });

    it('should throw for navigation through primitive', () => {
      const data: Record<string, unknown> = { a: 'string' };
      expect(() => setAtPointer(data, '/a/b', 'value')).toThrow(JsonPointerError);
    });
  });

  describe('deleteAtPointer', () => {
    it('should delete object property', () => {
      const data: Record<string, unknown> = { a: 1, b: 2 };
      expect(deleteAtPointer(data, '/a')).toBe(true);
      expect(data.a).toBeUndefined();
      expect(data.b).toBe(2);
    });

    it('should delete array element', () => {
      const data: Record<string, unknown> = { arr: [1, 2, 3] };
      expect(deleteAtPointer(data, '/arr/1')).toBe(true);
      expect(data.arr).toEqual([1, 3]);
    });

    it('should return false for non-existent path', () => {
      const data: Record<string, unknown> = { a: 1 };
      expect(deleteAtPointer(data, '/nonexistent')).toBe(false);
    });
  });

  describe('getAllPaths', () => {
    it('should return all paths in nested object', () => {
      const data = { a: { b: 1 }, c: 2 };
      const paths = getAllPaths(data);
      expect(paths).toContain('/a');
      expect(paths).toContain('/a/b');
      expect(paths).toContain('/c');
    });

    it('should include array element paths', () => {
      const data = { arr: [1, 2] };
      const paths = getAllPaths(data);
      expect(paths).toContain('/arr');
      expect(paths).toContain('/arr/0');
      expect(paths).toContain('/arr/1');
    });
  });

  describe('Path Utilities', () => {
    it('isParentPointer should identify parent-child relationships', () => {
      expect(isParentPointer('/a', '/a/b')).toBe(true);
      expect(isParentPointer('/a', '/a/b/c')).toBe(true);
      expect(isParentPointer('', '/a')).toBe(true);
      expect(isParentPointer('/a/b', '/a')).toBe(false);
      expect(isParentPointer('/a', '/a')).toBe(false);
      expect(isParentPointer('/a', '/ab')).toBe(false);
    });

    it('getParentPointer should return parent path', () => {
      expect(getParentPointer('/a/b/c')).toBe('/a/b');
      expect(getParentPointer('/a')).toBe('');
      expect(getParentPointer('')).toBeUndefined();
    });

    it('getPointerKey should return last segment', () => {
      expect(getPointerKey('/a/b/c')).toBe('c');
      expect(getPointerKey('/a')).toBe('a');
      expect(getPointerKey('')).toBeUndefined();
    });

    it('joinPointers should combine paths', () => {
      expect(joinPointers('/a', '/b')).toBe('/a/b');
      expect(joinPointers('/a/b', '/c/d')).toBe('/a/b/c/d');
      expect(joinPointers('', '/a')).toBe('/a');
    });

    it('getRelativePath should calculate relative path', () => {
      expect(getRelativePath('/a', '/a/b/c')).toEqual(['b', 'c']);
      expect(getRelativePath('/a/b', '/a/b/c')).toEqual(['c']);
      expect(getRelativePath('/a/b', '/a/b')).toEqual([]);
    });
  });
});

// ============================================================================
// BoundValue Tests
// ============================================================================

describe('BoundValue Types', () => {
  describe('Type Guards', () => {
    it('isDataLiteralValue should identify literal values', () => {
      expect(isDataLiteralValue({ literalString: 'test' })).toBe(true);
      expect(isDataLiteralValue({ literalString: 42 })).toBe(true);
      expect(isDataLiteralValue({ path: '/test' })).toBe(false);
      expect(isDataLiteralValue({ literalString: 'x', path: '/y' })).toBe(false);
      expect(isDataLiteralValue(null)).toBe(false);
    });

    it('isDataPathValue should identify path values', () => {
      expect(isDataPathValue({ path: '/test' })).toBe(true);
      expect(isDataPathValue({ literalString: 'test' })).toBe(false);
      expect(isDataPathValue({ literalString: 'x', path: '/y' })).toBe(false);
      expect(isDataPathValue(null)).toBe(false);
    });

    it('isDataCombinedValue should identify combined values', () => {
      expect(isDataCombinedValue({ literalString: 'default', path: '/test' })).toBe(true);
      expect(isDataCombinedValue({ literalString: 'test' })).toBe(false);
      expect(isDataCombinedValue({ path: '/test' })).toBe(false);
      expect(isDataCombinedValue(null)).toBe(false);
    });

    it('isDataBoundValue should identify any bound value', () => {
      expect(isDataBoundValue({ literalString: 'test' })).toBe(true);
      expect(isDataBoundValue({ path: '/test' })).toBe(true);
      expect(isDataBoundValue({ literalString: 'x', path: '/y' })).toBe(true);
      expect(isDataBoundValue(null)).toBe(false);
      expect(isDataBoundValue('string')).toBe(false);
      expect(isDataBoundValue(123)).toBe(false);
    });
  });

  describe('Children Type Guards', () => {
    it('isDataExplicitListChildren should identify explicit lists', () => {
      expect(isDataExplicitListChildren({ explicitList: ['a', 'b'] })).toBe(true);
      expect(isDataExplicitListChildren({ explicitList: [] })).toBe(true);
      expect(isDataExplicitListChildren({ template: {} })).toBe(false);
      expect(isDataExplicitListChildren(null)).toBe(false);
    });

    it('isDataTemplateChildren should identify template children', () => {
      expect(
        isDataTemplateChildren({
          template: { dataBinding: '/items', componentId: 'item' },
        })
      ).toBe(true);
      expect(isDataTemplateChildren({ explicitList: [] })).toBe(false);
      expect(isDataTemplateChildren(null)).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    it('createDataLiteralValue should create literal value', () => {
      expect(createDataLiteralValue('test')).toEqual({ literalString: 'test' });
      expect(createDataLiteralValue(42)).toEqual({ literalString: 42 });
      expect(createDataLiteralValue(true)).toEqual({ literalString: true });
    });

    it('createDataPathValue should create path value', () => {
      expect(createDataPathValue('/test')).toEqual({ path: '/test' });
      expect(createDataPathValue('')).toEqual({ path: '' });
    });

    it('createDataPathValue should throw for invalid path', () => {
      expect(() => createDataPathValue('invalid')).toThrow(/must start with/);
    });

    it('createDataCombinedValue should create combined value', () => {
      expect(createDataCombinedValue('default', '/test')).toEqual({
        literalString: 'default',
        path: '/test',
      });
    });

    it('createDataExplicitListChildren should create explicit list', () => {
      expect(createDataExplicitListChildren(['a', 'b'])).toEqual({
        explicitList: ['a', 'b'],
      });
    });

    it('createDataTemplateChildren should create template children', () => {
      expect(createDataTemplateChildren('/items', 'item-template')).toEqual({
        template: {
          dataBinding: '/items',
          componentId: 'item-template',
        },
      });
    });

    it('createDataTemplateChildren should support keyPath', () => {
      expect(createDataTemplateChildren('/items', 'item', '/id')).toEqual({
        template: {
          dataBinding: '/items',
          componentId: 'item',
          keyPath: '/id',
        },
      });
    });
  });

  describe('Utility Functions', () => {
    it('getDataStaticValue should extract static value', () => {
      expect(getDataStaticValue({ literalString: 'test' })).toBe('test');
      expect(getDataStaticValue({ literalString: 'default', path: '/x' })).toBe('default');
      expect(getDataStaticValue({ path: '/test' })).toBeUndefined();
    });

    it('getDataBindingPath should extract path', () => {
      expect(getDataBindingPath({ path: '/test' })).toBe('/test');
      expect(getDataBindingPath({ literalString: 'x', path: '/y' })).toBe('/y');
      expect(getDataBindingPath({ literalString: 'test' })).toBeUndefined();
    });

    it('hasDynamicBinding should check for path', () => {
      expect(hasDynamicBinding({ path: '/test' })).toBe(true);
      expect(hasDynamicBinding({ literalString: 'x', path: '/y' })).toBe(true);
      expect(hasDynamicBinding({ literalString: 'test' })).toBe(false);
    });

    it('hasStaticDefault should check for literalString', () => {
      expect(hasStaticDefault({ literalString: 'test' })).toBe(true);
      expect(hasStaticDefault({ literalString: 'x', path: '/y' })).toBe(true);
      expect(hasStaticDefault({ path: '/test' })).toBe(false);
    });

    it('toBoundValue should convert raw values to BoundValue', () => {
      expect(toBoundValue('test')).toEqual({ literalString: 'test' });
      expect(toBoundValue(42)).toEqual({ literalString: 42 });
      // Already a BoundValue - return as-is
      const existing = { path: '/test' };
      expect(toBoundValue(existing)).toBe(existing);
    });
  });
});

// ============================================================================
// BoundValueResolver Tests
// ============================================================================

describe('BoundValueResolver', () => {
  const data = {
    user: {
      name: 'Alice',
      age: 30,
    },
    items: [
      { id: 1, label: 'Item 1' },
      { id: 2, label: 'Item 2' },
    ],
    settings: {
      theme: 'dark',
    },
  };

  describe('resolve', () => {
    it('should resolve LiteralValue directly', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.resolve({ literalString: 'test' }, data)).toBe('test');
      expect(resolver.resolve({ literalString: 42 }, data)).toBe(42);
    });

    it('should resolve PathValue from data', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.resolve({ path: '/user/name' }, data)).toBe('Alice');
      expect(resolver.resolve({ path: '/user/age' }, data)).toBe(30);
      expect(resolver.resolve({ path: '/items/0/label' }, data)).toBe('Item 1');
    });

    it('should return undefined for non-existent path', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.resolve({ path: '/nonexistent' }, data)).toBeUndefined();
    });

    it('should resolve CombinedValue with path first', () => {
      const resolver = createBoundValueResolver();
      expect(
        resolver.resolve({ literalString: 'default', path: '/user/name' }, data)
      ).toBe('Alice');
    });

    it('should fall back to literalString for CombinedValue', () => {
      const resolver = createBoundValueResolver();
      expect(
        resolver.resolve({ literalString: 'fallback', path: '/nonexistent' }, data)
      ).toBe('fallback');
    });

    it('should use default value when path not found', () => {
      const resolver = createBoundValueResolver({ defaultValue: 'N/A' });
      expect(resolver.resolve({ path: '/nonexistent' }, data)).toBe('N/A');
    });

    it('should throw in strict mode for missing path', () => {
      const resolver = createBoundValueResolver({ strictMode: true });
      expect(() => resolver.resolve({ path: '/nonexistent' }, data)).toThrow(
        /Path not found/
      );
    });
  });

  describe('dependsOn', () => {
    it('should return false for LiteralValue', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.dependsOn({ literalString: 'test' }, '/any')).toBe(false);
    });

    it('should return true for exact path match', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.dependsOn({ path: '/user/name' }, '/user/name')).toBe(true);
    });

    it('should return true when path is parent of bound path', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.dependsOn({ path: '/user/name' }, '/user')).toBe(true);
    });

    it('should return true when bound path is parent of path', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.dependsOn({ path: '/user' }, '/user/name')).toBe(true);
    });

    it('should return false for unrelated paths', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.dependsOn({ path: '/user/name' }, '/settings')).toBe(false);
    });
  });

  describe('getDependencies', () => {
    it('should return empty array for LiteralValue', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.getDependencies({ literalString: 'test' })).toEqual([]);
    });

    it('should return path for PathValue', () => {
      const resolver = createBoundValueResolver();
      expect(resolver.getDependencies({ path: '/user/name' })).toEqual(['/user/name']);
    });

    it('should return path for CombinedValue', () => {
      const resolver = createBoundValueResolver();
      expect(
        resolver.getDependencies({ literalString: 'x', path: '/y' })
      ).toEqual(['/y']);
    });
  });

  describe('resolveTemplateChildren', () => {
    it('should resolve template children from array', () => {
      const resolver = createBoundValueResolver();
      const children = {
        template: {
          dataBinding: '/items',
          componentId: 'item-component',
        },
      };

      const result = resolver.resolveTemplateChildren(children, data);
      expect(result).toHaveLength(2);
      expect(result[0].templateId).toBe('item-component');
      expect(result[0].index).toBe(0);
      expect(result[0].itemData).toEqual({ id: 1, label: 'Item 1' });
      expect(result[1].index).toBe(1);
      expect(result[1].itemData).toEqual({ id: 2, label: 'Item 2' });
    });

    it('should generate IDs with keyPath', () => {
      const resolver = createBoundValueResolver();
      const children = {
        template: {
          dataBinding: '/items',
          componentId: 'item',
          keyPath: '/id',
        },
      };

      const result = resolver.resolveTemplateChildren(children, data);
      expect(result[0].id).toBe('item-1');
      expect(result[0].key).toBe('1');
      expect(result[1].id).toBe('item-2');
      expect(result[1].key).toBe('2');
    });

    it('should generate index-based IDs without keyPath', () => {
      const resolver = createBoundValueResolver();
      const children = {
        template: {
          dataBinding: '/items',
          componentId: 'item',
        },
      };

      const result = resolver.resolveTemplateChildren(children, data);
      expect(result[0].id).toBe('item-0');
      expect(result[1].id).toBe('item-1');
    });

    it('should return empty array for non-array data', () => {
      const resolver = createBoundValueResolver();
      const children = {
        template: {
          dataBinding: '/user',
          componentId: 'item',
        },
      };

      const result = resolver.resolveTemplateChildren(children, data);
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// extractBoundPaths and resolveAllBoundValues Tests
// ============================================================================

describe('BoundValue Extraction and Resolution', () => {
  describe('extractBoundPaths', () => {
    it('should extract paths from nested properties', () => {
      const properties = {
        title: { path: '/user/name' },
        subtitle: { literalString: 'static' },
        value: { literalString: 'default', path: '/metrics/value' },
        nested: {
          inner: { path: '/nested/path' },
        },
      };

      const paths = extractBoundPaths(properties);
      expect(paths).toContain('/user/name');
      expect(paths).toContain('/metrics/value');
      expect(paths).toContain('/nested/path');
      expect(paths).toHaveLength(3);
    });

    it('should extract paths from template children', () => {
      const properties = {
        children: {
          template: {
            dataBinding: '/items',
            componentId: 'item',
          },
        },
      };

      const paths = extractBoundPaths(properties);
      expect(paths).toContain('/items');
    });

    it('should handle arrays with bound values', () => {
      const properties = {
        items: [{ path: '/a' }, { path: '/b' }],
      };

      const paths = extractBoundPaths(properties);
      expect(paths).toContain('/a');
      expect(paths).toContain('/b');
    });
  });

  describe('resolveAllBoundValues', () => {
    const data = {
      user: { name: 'Alice' },
      count: 42,
      items: [{ label: 'A' }, { label: 'B' }],
    };

    it('should resolve all BoundValues in properties', () => {
      const properties = {
        title: { path: '/user/name' },
        subtitle: { literalString: 'static' },
        count: { path: '/count' },
      };

      const resolved = resolveAllBoundValues(properties, data);
      expect(resolved.title).toBe('Alice');
      expect(resolved.subtitle).toBe('static');
      expect(resolved.count).toBe(42);
    });

    it('should preserve non-BoundValue properties', () => {
      const properties = {
        enabled: true,
        threshold: 80,
        name: 'test',
      };

      const resolved = resolveAllBoundValues(properties, data);
      expect(resolved.enabled).toBe(true);
      expect(resolved.threshold).toBe(80);
      expect(resolved.name).toBe('test');
    });

    it('should resolve nested objects', () => {
      const properties = {
        outer: {
          inner: { path: '/user/name' },
          static: 'value',
        },
      };

      const resolved = resolveAllBoundValues(properties, data);
      expect((resolved.outer as Record<string, unknown>).inner).toBe('Alice');
      expect((resolved.outer as Record<string, unknown>).static).toBe('value');
    });

    it('should resolve template children', () => {
      const properties = {
        children: {
          template: {
            dataBinding: '/items',
            componentId: 'item',
          },
        },
      };

      const resolved = resolveAllBoundValues(properties, data);
      expect(Array.isArray(resolved.children)).toBe(true);
      expect((resolved.children as unknown[]).length).toBe(2);
    });

    it('should preserve explicit list children', () => {
      const properties = {
        children: { explicitList: ['a', 'b', 'c'] },
      };

      const resolved = resolveAllBoundValues(properties, data);
      expect(resolved.children).toEqual({ explicitList: ['a', 'b', 'c'] });
    });
  });
});

// ============================================================================
// ReactiveStore Tests
// ============================================================================

describe('ReactiveStore', () => {
  describe('Basic Operations', () => {
    it('should initialize with empty data', () => {
      const store = createReactiveStore();
      expect(store.getData()).toEqual({});
    });

    it('should initialize with initial data', () => {
      const store = createReactiveStore({
        initialData: { a: 1, b: 2 },
      });
      expect(store.getData()).toEqual({ a: 1, b: 2 });
    });

    it('should get and set data', () => {
      const store = createReactiveStore();
      store.setData({ x: 10 });
      expect(store.getData()).toEqual({ x: 10 });
    });

    it('should get value at path', () => {
      const store = createReactiveStore({
        initialData: { a: { b: 'value' } },
      });
      expect(store.getAt('/a/b')).toBe('value');
      expect(store.getAt('/nonexistent')).toBeUndefined();
    });

    it('should set value at path', () => {
      const store = createReactiveStore({
        initialData: { a: { b: 1 } },
      });
      store.setAt('/a/b', 2);
      expect(store.getAt('/a/b')).toBe(2);
    });

    it('should create nested paths when setting', () => {
      const store = createReactiveStore();
      store.setAt('/x/y/z', 'nested');
      expect(store.getAt('/x/y/z')).toBe('nested');
    });

    it('should delete value at path', () => {
      const store = createReactiveStore({
        initialData: { a: 1, b: 2 },
      });
      expect(store.deleteAt('/a')).toBe(true);
      expect(store.getAt('/a')).toBeUndefined();
      expect(store.getAt('/b')).toBe(2);
    });

    it('should return false when deleting non-existent path', () => {
      const store = createReactiveStore();
      expect(store.deleteAt('/nonexistent')).toBe(false);
    });

    it('should check if path exists', () => {
      const store = createReactiveStore({
        initialData: { a: { b: null } },
      });
      expect(store.has('/a')).toBe(true);
      expect(store.has('/a/b')).toBe(true);
      expect(store.has('/x')).toBe(false);
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers on setAt', () => {
      const store = createReactiveStore({
        initialData: { value: 1 },
      });
      const callback = vi.fn();

      store.subscribe('/value', callback);
      store.setAt('/value', 2);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(2, 1);
    });

    it('should notify subscribers on setData', () => {
      const store = createReactiveStore();
      const callback = vi.fn();

      store.subscribeAll(callback);
      store.setData({ x: 1 });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should notify parent path subscribers', () => {
      const store = createReactiveStore({
        initialData: { a: { b: 1 } },
      });
      const callback = vi.fn();

      store.subscribe('/a', callback);
      store.setAt('/a/b', 2);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should notify child path subscribers on parent change', () => {
      const store = createReactiveStore({
        initialData: { a: { b: 1 } },
      });
      const callback = vi.fn();

      store.subscribe('/a/b', callback);
      store.setAt('/a', { b: 2 });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe correctly', () => {
      const store = createReactiveStore({
        initialData: { value: 1 },
      });
      const callback = vi.fn();

      const subscription = store.subscribe('/value', callback);
      subscription.unsubscribe();
      store.setAt('/value', 2);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle multiple subscribers', () => {
      const store = createReactiveStore({
        initialData: { value: 1 },
      });
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      store.subscribe('/value', callback1);
      store.subscribe('/value', callback2);
      store.setAt('/value', 2);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should notify global subscribers on any change', () => {
      const store = createReactiveStore();
      const callback = vi.fn();

      store.subscribeAll(callback);
      store.setAt('/a', 1);
      store.setAt('/b', 2);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should track subscription count', () => {
      const store = createReactiveStore();
      expect(store.getSubscriptionCount()).toBe(0);

      const sub1 = store.subscribe('/a', () => {});
      expect(store.getSubscriptionCount()).toBe(1);

      const sub2 = store.subscribeAll(() => {});
      expect(store.getSubscriptionCount()).toBe(2);

      sub1.unsubscribe();
      expect(store.getSubscriptionCount()).toBe(1);

      sub2.unsubscribe();
      expect(store.getSubscriptionCount()).toBe(0);
    });
  });

  describe('Batch Updates', () => {
    it('should apply multiple updates', () => {
      const store = createReactiveStore();
      store.batch([
        { pointer: '/a', value: 1 },
        { pointer: '/b', value: 2 },
        { pointer: '/c', value: 3 },
      ]);

      expect(store.getAt('/a')).toBe(1);
      expect(store.getAt('/b')).toBe(2);
      expect(store.getAt('/c')).toBe(3);
    });

    it('should notify subscribers once per batch', () => {
      const store = createReactiveStore();
      const callback = vi.fn();

      store.subscribeAll(callback);
      store.batch([
        { pointer: '/a', value: 1 },
        { pointer: '/b', value: 2 },
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle delete operations in batch', () => {
      const store = createReactiveStore({
        initialData: { a: 1, b: 2 },
      });

      store.batch([{ pointer: '/a', value: undefined, operation: 'delete' }]);

      expect(store.has('/a')).toBe(false);
      expect(store.getAt('/b')).toBe(2);
    });
  });

  describe('Deep Clone', () => {
    it('should deep clone data when enabled', () => {
      const original = { nested: { value: 1 } };
      const store = createReactiveStore({
        initialData: original,
        deepClone: true,
      });

      // Modify original should not affect store
      original.nested.value = 999;
      expect(store.getAt('/nested/value')).toBe(1);

      // Modify returned data should not affect store
      const data = store.getData();
      (data.nested as Record<string, unknown>).value = 888;
      expect(store.getAt('/nested/value')).toBe(1);
    });

    it('should not deep clone when disabled', () => {
      const original = { nested: { value: 1 } };
      const store = createReactiveStore({
        initialData: original,
        deepClone: false,
      });

      // Changes to getData() result will affect internal state
      const data = store.getData();
      // Note: with deepClone: false, getData() still returns a shallow copy
      // but nested objects are shared
    });
  });

  describe('Clear', () => {
    it('should clear all data and subscriptions', () => {
      const store = createReactiveStore({
        initialData: { a: 1 },
      });
      const callback = vi.fn();
      store.subscribe('/a', callback);

      store.clear();

      expect(store.getData()).toEqual({});
      expect(store.getSubscriptionCount()).toBe(0);
    });
  });
});

// ============================================================================
// Reactive Store Utilities Tests
// ============================================================================

describe('Reactive Store Utilities', () => {
  describe('createComputed', () => {
    it('should compute initial value', () => {
      const store = createReactiveStore({
        initialData: { a: 1, b: 2 },
      });

      const callback = vi.fn();
      createComputed(store, ['/a', '/b'], (data) => {
        const a = (data.a as number) || 0;
        const b = (data.b as number) || 0;
        return a + b;
      }, callback);

      expect(callback).toHaveBeenCalledWith(3);
    });

    it('should recompute when dependencies change', () => {
      const store = createReactiveStore({
        initialData: { a: 1, b: 2 },
      });

      const callback = vi.fn();
      createComputed(store, ['/a', '/b'], (data) => {
        const a = (data.a as number) || 0;
        const b = (data.b as number) || 0;
        return a + b;
      }, callback);

      callback.mockClear();
      store.setAt('/a', 10);

      expect(callback).toHaveBeenCalledWith(12);
    });

    it('should unsubscribe from all dependencies', () => {
      const store = createReactiveStore({
        initialData: { a: 1, b: 2 },
      });

      const callback = vi.fn();
      const subscription = createComputed(store, ['/a', '/b'], (data) => {
        return (data.a as number) + (data.b as number);
      }, callback);

      subscription.unsubscribe();
      callback.mockClear();
      store.setAt('/a', 100);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('createSelector', () => {
    it('should get current value', () => {
      const store = createReactiveStore({
        initialData: { user: { name: 'Alice' } },
      });

      const selector = createSelector<{ name: string }>(store, '/user');
      expect(selector.getValue()).toEqual({ name: 'Alice' });
    });

    it('should transform value', () => {
      const store = createReactiveStore({
        initialData: { value: 5 },
      });

      const selector = createSelector<number, string>(
        store,
        '/value',
        (v) => `Value: ${v}`
      );
      expect(selector.getValue()).toBe('Value: 5');
    });

    it('should subscribe to changes', () => {
      const store = createReactiveStore({
        initialData: { value: 1 },
      });

      const callback = vi.fn();
      const selector = createSelector<number>(store, '/value');
      selector.subscribe(callback);

      store.setAt('/value', 2);
      expect(callback).toHaveBeenCalledWith(2);
    });
  });

  describe('combineStores', () => {
    it('should get values from multiple stores', () => {
      const stores = new Map([
        ['users', createReactiveStore({ initialData: { name: 'Alice' } })],
        ['settings', createReactiveStore({ initialData: { theme: 'dark' } })],
      ]);

      const combined = combineStores(stores);
      expect(combined.getAt('users', '/name')).toBe('Alice');
      expect(combined.getAt('settings', '/theme')).toBe('dark');
    });

    it('should set values in specific store', () => {
      const stores = new Map([
        ['data', createReactiveStore()],
      ]);

      const combined = combineStores(stores);
      combined.setAt('data', '/value', 42);

      expect(stores.get('data')!.getAt('/value')).toBe(42);
    });

    it('should subscribe to specific store', () => {
      const stores = new Map([
        ['data', createReactiveStore({ initialData: { value: 1 } })],
      ]);

      const callback = vi.fn();
      const combined = combineStores(stores);
      combined.subscribe('data', '/value', callback);

      stores.get('data')!.setAt('/value', 2);
      expect(callback).toHaveBeenCalled();
    });

    it('should handle non-existent namespace', () => {
      const stores = new Map<string, ReactiveStore>();
      const combined = combineStores(stores);

      expect(combined.getAt('nonexistent', '/value')).toBeUndefined();

      const subscription = combined.subscribe('nonexistent', '/value', () => {});
      subscription.unsubscribe(); // Should not throw
    });
  });
});

// ============================================================================
// Async Store Tests
// ============================================================================

describe('ReactiveStore Async Mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce notifications in async mode', () => {
    const store = createReactiveStore({
      synchronous: false,
      debounceMs: 50,
    });

    const callback = vi.fn();
    store.subscribeAll(callback);

    store.setAt('/a', 1);
    store.setAt('/b', 2);
    store.setAt('/c', 3);

    // Should not have been called yet
    expect(callback).not.toHaveBeenCalled();

    // Advance timers
    vi.advanceTimersByTime(50);

    // Should be called once with all changes
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
