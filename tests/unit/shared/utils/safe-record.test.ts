import { describe, expect, it } from 'vitest';
import { addToCount, createSafeRecord, getOwn, setOwn } from '../../../../src/shared/utils/safe-record';

const NAMES = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'];

describe('safe-record (#914)', () => {
  it('creates a record with no inherited members', () => {
    const record = createSafeRecord<number>();
    expect(Object.getPrototypeOf(record)).toBeNull();
    for (const name of NAMES) expect(record[name]).toBeUndefined();
  });

  it.each(NAMES)('counts %s on a plain object without touching its prototype', (name) => {
    const counts: Record<string, number> = {};
    expect(addToCount(counts, name)).toBe(1);
    expect(addToCount(counts, name, 2.5)).toBe(3.5);
    expect(Object.hasOwn(counts, name)).toBe(true);
    expect(getOwn(counts, name)).toBe(3.5);
    expect(Object.getPrototypeOf(counts)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(counts))).toEqual(JSON.parse(`{"${name}": 3.5}`));
  });

  it('treats inherited members as absent', () => {
    const plain: Record<string, unknown> = {};
    expect(getOwn(plain, 'constructor')).toBeUndefined();
    expect(getOwn(plain, '__proto__')).toBeUndefined();
  });

  it('writes enumerable, writable own properties', () => {
    const record: Record<string, string> = {};
    setOwn(record, '__proto__', 'a');
    record.__proto__ = 'b' as never;
    expect(Object.keys(record)).toEqual(['__proto__']);
    expect(getOwn(record, '__proto__')).toBe('b');
  });
});
