/**
 * Tests for config-snapshot: deep-freeze and captureHooksConfigSnapshot
 * @see IMP-07 Hook Security Hardening
 */

import { describe, it, expect } from 'vitest';
import {
  deepFreeze,
  captureHooksConfigSnapshot,
} from '../../../src/hooks/security/config-snapshot.js';

// =============================================================================
// deepFreeze
// =============================================================================

describe('deepFreeze', () => {
  it('prevents top-level property mutation', () => {
    const obj = deepFreeze({ a: 1, b: 'hello' });

    expect(() => {
      (obj as Record<string, unknown>).a = 999;
    }).toThrow(TypeError);

    expect(obj.a).toBe(1);
  });

  it('freezes nested objects recursively', () => {
    const obj = deepFreeze({
      level1: {
        level2: {
          value: 'deep',
        },
      },
    });

    expect(() => {
      (obj.level1.level2 as Record<string, unknown>).value = 'mutated';
    }).toThrow(TypeError);

    expect(obj.level1.level2.value).toBe('deep');
  });

  it('freezes arrays within objects', () => {
    const obj = deepFreeze({
      items: [1, 2, 3],
      nested: { tags: ['a', 'b'] },
    });

    expect(() => {
      (obj.items as number[]).push(4);
    }).toThrow(TypeError);

    expect(() => {
      (obj.nested.tags as string[])[0] = 'mutated';
    }).toThrow(TypeError);

    expect(obj.items).toEqual([1, 2, 3]);
    expect(obj.nested.tags).toEqual(['a', 'b']);
  });

  it('handles objects with only primitive values', () => {
    const obj = deepFreeze({ x: 42, y: true, z: 'str' });

    expect(() => {
      (obj as Record<string, unknown>).x = 0;
    }).toThrow(TypeError);

    expect(obj.x).toBe(42);
  });

  it('does not throw on already-frozen sub-objects', () => {
    const inner = Object.freeze({ val: 10 });
    const outer = { inner };

    // Should not throw even though inner is already frozen
    const frozen = deepFreeze(outer);
    expect(frozen.inner.val).toBe(10);
  });
});

// =============================================================================
// captureHooksConfigSnapshot
// =============================================================================

describe('captureHooksConfigSnapshot', () => {
  it('creates an independent clone (mutating original does not affect snapshot)', () => {
    const original = {
      version: '1.0',
      hooks: {
        onComplete: { enabled: true, timeout: 5000 },
      },
    };

    const snapshot = captureHooksConfigSnapshot(original);

    // Mutate the original
    original.version = '2.0';
    original.hooks.onComplete.timeout = 9999;

    // Snapshot is unaffected
    expect(snapshot.version).toBe('1.0');
    expect(snapshot.hooks.onComplete.timeout).toBe(5000);
  });

  it('returns a deeply frozen snapshot', () => {
    const config = {
      enabled: true,
      actions: [{ type: 'notify', target: 'agent-1' }],
    };

    const snapshot = captureHooksConfigSnapshot(config);

    expect(() => {
      (snapshot as Record<string, unknown>).enabled = false;
    }).toThrow(TypeError);

    expect(() => {
      (snapshot.actions[0] as Record<string, unknown>).type = 'malicious';
    }).toThrow(TypeError);
  });

  it('handles empty objects', () => {
    const snapshot = captureHooksConfigSnapshot({});
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.keys(snapshot)).toHaveLength(0);
  });

  it('handles deeply nested configuration', () => {
    const config = {
      a: { b: { c: { d: { value: 'deep' } } } },
    };

    const snapshot = captureHooksConfigSnapshot(config);

    expect(() => {
      (snapshot.a.b.c.d as Record<string, unknown>).value = 'hacked';
    }).toThrow(TypeError);

    expect(snapshot.a.b.c.d.value).toBe('deep');
  });
});
