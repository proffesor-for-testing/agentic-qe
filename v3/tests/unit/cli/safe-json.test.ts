/**
 * SEC-001: Safe JSON Parsing Tests
 *
 * Verifies that the safe JSON parsing utilities properly protect against
 * prototype pollution attacks via __proto__, constructor, and prototype keys.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { safeJsonParse, parseJsonOption, parseJsonFile } from '../../../src/cli/helpers/safe-json.js';

describe('safeJsonParse', () => {
  describe('valid JSON parsing', () => {
    it('parses simple objects', () => {
      expect(safeJsonParse('{"a": 1}')).toEqual({ a: 1 });
    });

    it('parses nested objects', () => {
      expect(safeJsonParse('{"a": {"b": {"c": 3}}}')).toEqual({ a: { b: { c: 3 } } });
    });

    it('parses arrays', () => {
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it('parses mixed types', () => {
      expect(safeJsonParse('{"string": "test", "number": 42, "bool": true, "null": null}')).toEqual({
        string: 'test',
        number: 42,
        bool: true,
        null: null,
      });
    });

    it('parses empty object', () => {
      expect(safeJsonParse('{}')).toEqual({});
    });

    it('parses empty array', () => {
      expect(safeJsonParse('[]')).toEqual([]);
    });
  });

  describe('prototype pollution protection', () => {
    // Store original prototype state
    let originalPrototype: Record<string, unknown>;

    beforeEach(() => {
      // Capture current state of Object.prototype
      originalPrototype = { ...Object.prototype };
    });

    afterEach(() => {
      // Clean up any pollution that might have occurred (shouldn't happen with safe parsing)
      const currentKeys = Object.keys(Object.prototype);
      for (const key of currentKeys) {
        if (!(key in originalPrototype)) {
          delete (Object.prototype as Record<string, unknown>)[key];
        }
      }
    });

    it('removes __proto__ pollution attempts', () => {
      const result = safeJsonParse('{"__proto__": {"polluted": true}}');

      // The __proto__ key should be removed from the parsed object's own properties
      expect(result).toEqual({});
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);

      // Most importantly, Object.prototype should NOT be polluted
      expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('removes nested __proto__ pollution attempts', () => {
      const result = safeJsonParse('{"a": {"__proto__": {"nested_polluted": true}}}');

      // The nested object should exist but without __proto__
      expect(result).toEqual({ a: {} });

      // Object.prototype should NOT be polluted
      expect((Object.prototype as Record<string, unknown>).nested_polluted).toBeUndefined();
    });

    it('removes constructor pollution attempts', () => {
      const result = safeJsonParse('{"constructor": {"prototype": {"constructor_polluted": true}}}');

      // The constructor key should be removed from parsed object's own properties
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);

      // Object.prototype should NOT be polluted
      expect((Object.prototype as Record<string, unknown>).constructor_polluted).toBeUndefined();
    });

    it('allows safe prototype string key (not dangerous)', () => {
      // Note: A "prototype" string key is NOT dangerous - only __proto__ and constructor.prototype are
      // The "prototype" key as a regular property doesn't affect Object.prototype
      const result = safeJsonParse('{"a": {"prototype": {"value": true}}}');

      // Regular "prototype" string keys are preserved (they're not dangerous)
      expect(result).toEqual({ a: { prototype: { value: true } } });

      // Verify no pollution occurred
      expect((Object.prototype as Record<string, unknown>).value).toBeUndefined();
    });

    it('handles multiple pollution vectors in one payload', () => {
      const maliciousPayload = JSON.stringify({
        legitimate: 'data',
        __proto__: { polluted1: true },
        constructor: { prototype: { polluted2: true } },
        nested: {
          __proto__: { polluted3: true },
          safe: 'value',
        },
      });

      const result = safeJsonParse(maliciousPayload);

      // Only legitimate keys should remain
      expect(result).toEqual({
        legitimate: 'data',
        nested: {
          safe: 'value',
        },
      });

      // None of the pollution should have taken effect
      expect((Object.prototype as Record<string, unknown>).polluted1).toBeUndefined();
      expect((Object.prototype as Record<string, unknown>).polluted2).toBeUndefined();
      expect((Object.prototype as Record<string, unknown>).polluted3).toBeUndefined();
    });

    it('safely handles deeply nested pollution attempts', () => {
      const result = safeJsonParse('{"a": {"b": {"c": {"__proto__": {"deep_polluted": true}}}}}');

      expect(result).toEqual({ a: { b: { c: {} } } });
      expect((Object.prototype as Record<string, unknown>).deep_polluted).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('throws on invalid JSON', () => {
      expect(() => safeJsonParse('not json')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => safeJsonParse('')).toThrow();
    });

    it('throws on incomplete JSON', () => {
      expect(() => safeJsonParse('{"incomplete":')).toThrow();
    });

    it('throws on trailing commas', () => {
      expect(() => safeJsonParse('{"a": 1,}')).toThrow();
    });
  });
});

describe('parseJsonOption', () => {
  it('parses valid JSON and returns typed result', () => {
    const result = parseJsonOption<{ key: string }>('{"key": "value"}', 'test-option');
    expect(result).toEqual({ key: 'value' });
  });

  it('removes prototype pollution attempts', () => {
    const result = parseJsonOption('{"__proto__": {"polluted": true}, "safe": "data"}', 'params');
    expect(result).toEqual({ safe: 'data' });
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('throws with user-friendly error message on invalid JSON', () => {
    expect(() => parseJsonOption('invalid json', 'params')).toThrow('Invalid JSON in --params:');
  });

  it('includes the option name in error message', () => {
    expect(() => parseJsonOption('bad', 'payload')).toThrow('Invalid JSON in --payload:');
  });

  it('handles empty object JSON', () => {
    expect(parseJsonOption('{}', 'params')).toEqual({});
  });
});

describe('parseJsonFile', () => {
  it('parses valid JSON file content', () => {
    const content = '{"version": "1.0.0", "settings": {"debug": true}}';
    const result = parseJsonFile(content, '/path/to/config.json');
    expect(result).toEqual({ version: '1.0.0', settings: { debug: true } });
  });

  it('removes prototype pollution from config files', () => {
    const maliciousConfig = '{"__proto__": {"isAdmin": true}, "name": "config"}';
    const result = parseJsonFile(maliciousConfig, '/path/to/malicious.json');

    expect(result).toEqual({ name: 'config' });
    expect((Object.prototype as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it('throws with file path in error message', () => {
    expect(() => parseJsonFile('invalid', '/etc/config.json')).toThrow(
      'Invalid JSON in file /etc/config.json:'
    );
  });

  it('handles complex nested structures', () => {
    const content = JSON.stringify({
      kernel: { eventBus: 'in-memory' },
      domains: {
        'test-generation': { enabled: true },
        'coverage-analysis': { algorithm: 'hnsw' },
      },
    });

    const result = parseJsonFile(content, 'config.json');
    expect(result).toHaveProperty('kernel.eventBus', 'in-memory');
    expect(result).toHaveProperty('domains.coverage-analysis.algorithm', 'hnsw');
  });
});

describe('SEC-001 real-world attack scenarios', () => {
  afterEach(() => {
    // Extra safety: ensure Object.prototype is clean
    const dangerousKeys = ['isAdmin', 'isAuthenticated', 'role', 'permissions', 'polluted'];
    for (const key of dangerousKeys) {
      if (key in Object.prototype) {
        delete (Object.prototype as Record<string, unknown>)[key];
      }
    }
  });

  it('blocks privilege escalation via __proto__.isAdmin', () => {
    const attackPayload = '{"username": "attacker", "__proto__": {"isAdmin": true}}';
    const user = safeJsonParse(attackPayload);

    // Verify the attack was blocked
    expect((user as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();

    // New objects should not have isAdmin
    const newObj: Record<string, unknown> = {};
    expect(newObj.isAdmin).toBeUndefined();
  });

  it('blocks authentication bypass via constructor pollution', () => {
    const attackPayload =
      '{"token": "abc", "constructor": {"prototype": {"isAuthenticated": true}}}';
    const session = safeJsonParse(attackPayload);

    expect((session as Record<string, unknown>).isAuthenticated).toBeUndefined();
    expect(({} as Record<string, unknown>).isAuthenticated).toBeUndefined();
  });

  it('blocks CLI parameter injection attacks', () => {
    // Simulating a CLI command like: --params '{"__proto__": {"shell": "/bin/sh"}}'
    const attackParams = '{"command": "build", "__proto__": {"shell": "/bin/sh"}}';
    const params = parseJsonOption(attackParams, 'params');

    expect(params).toEqual({ command: 'build' });
    expect((params as Record<string, unknown>).shell).toBeUndefined();
    expect(({} as Record<string, unknown>).shell).toBeUndefined();
  });

  it('blocks config file poisoning', () => {
    // Malicious config file trying to inject permissions
    const poisonedConfig = JSON.stringify({
      name: 'my-project',
      version: '1.0.0',
      __proto__: {
        permissions: ['read', 'write', 'admin'],
        role: 'superuser',
      },
    });

    const config = parseJsonFile(poisonedConfig, 'package.json');

    expect(config).toEqual({ name: 'my-project', version: '1.0.0' });
    expect((config as Record<string, unknown>).permissions).toBeUndefined();
    expect((config as Record<string, unknown>).role).toBeUndefined();
    expect(({} as Record<string, unknown>).permissions).toBeUndefined();
    expect(({} as Record<string, unknown>).role).toBeUndefined();
  });
});
