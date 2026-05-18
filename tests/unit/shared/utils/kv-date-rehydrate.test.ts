/**
 * Unit tests for the kv-Date rehydration helper.
 *
 * Pins the contract that the cross-service kv-Date fixes depend on. If this
 * regresses, every consumer (production-intel, metrics-optimizer,
 * transfer-specialist, learning-coordinator.getReplayBuffer) loses its
 * protection against the #493 / #491-Bug-3 bug class.
 */

import { describe, it, expect } from 'vitest';
import { rehydrateDates, rehydrateDatesAll } from '../../../../src/shared/utils/kv-date-rehydrate';

interface SampleRecord {
  id: string;
  createdAt: Date;
  expiresAt?: Date;
  payload: { tag: string };
}

describe('rehydrateDates', () => {
  it('coerces an ISO-string field to a real Date', () => {
    const iso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const kvRecord = {
      id: 'r1',
      createdAt: iso as unknown as Date,
      payload: { tag: 'a' },
    } as SampleRecord;

    const result = rehydrateDates(kvRecord, ['createdAt'])!;

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe(iso);
    // Non-date fields untouched.
    expect(result.id).toBe('r1');
    expect(result.payload).toEqual({ tag: 'a' });
  });

  it('returns a shallow COPY — does not mutate the input', () => {
    const iso = new Date().toISOString();
    const input = {
      id: 'r1',
      createdAt: iso as unknown as Date,
      payload: { tag: 'a' },
    } as SampleRecord;

    const result = rehydrateDates(input, ['createdAt'])!;

    expect(result).not.toBe(input);
    // Input's runtime shape is preserved — important when the helper is
    // called from a service that hands the same record to multiple readers.
    expect(typeof (input as unknown as { createdAt: unknown }).createdAt).toBe('string');
  });

  it('leaves an already-Date field untouched', () => {
    const realDate = new Date();
    const input = {
      id: 'r1',
      createdAt: realDate,
      payload: { tag: 'a' },
    } as SampleRecord;

    const result = rehydrateDates(input, ['createdAt'])!;

    expect(result.createdAt).toBe(realDate); // Same instance — no needless allocation.
  });

  it('handles optional Date fields cleanly', () => {
    const iso = new Date().toISOString();
    const onlyCreated = {
      id: 'r1',
      createdAt: iso as unknown as Date,
      payload: { tag: 'a' },
    } as SampleRecord;

    const withExpiry = {
      id: 'r2',
      createdAt: iso as unknown as Date,
      expiresAt: iso as unknown as Date,
      payload: { tag: 'b' },
    } as SampleRecord;

    const r1 = rehydrateDates(onlyCreated, ['createdAt', 'expiresAt'])!;
    const r2 = rehydrateDates(withExpiry, ['createdAt', 'expiresAt'])!;

    expect(r1.createdAt).toBeInstanceOf(Date);
    expect(r1.expiresAt).toBeUndefined();
    expect(r2.createdAt).toBeInstanceOf(Date);
    expect(r2.expiresAt).toBeInstanceOf(Date);
  });

  it('returns null/undefined inputs as-is', () => {
    expect(rehydrateDates(null, ['createdAt'])).toBeNull();
    expect(rehydrateDates(undefined, ['createdAt'])).toBeUndefined();
  });

  it('coerces multiple fields in a single call', () => {
    const isoCreated = '2026-05-01T00:00:00.000Z';
    const isoExpires = '2026-06-01T00:00:00.000Z';
    const input = {
      id: 'r1',
      createdAt: isoCreated as unknown as Date,
      expiresAt: isoExpires as unknown as Date,
      payload: { tag: 'a' },
    } as SampleRecord;

    const result = rehydrateDates(input, ['createdAt', 'expiresAt'])!;

    expect(result.createdAt.toISOString()).toBe(isoCreated);
    expect(result.expiresAt!.toISOString()).toBe(isoExpires);
  });

  it('round-trip safety: rehydrated Dates round-trip cleanly through .getTime()', () => {
    // This is THE assertion that pins the #493 fix: post-rehydrate, the
    // downstream consumer's `.getTime()` returns a sensible number, not a
    // throw. Mirrors the exact failure mode from the issue.
    const iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const kvRecord = {
      id: 'r1',
      createdAt: iso as unknown as Date,
      payload: { tag: 'a' },
    } as SampleRecord;

    const result = rehydrateDates(kvRecord, ['createdAt'])!;

    // The original kv shape would throw here.
    expect(() => result.createdAt.getTime()).not.toThrow();
    expect(result.createdAt.getTime()).toBe(new Date(iso).getTime());
  });
});

describe('rehydrateDatesAll', () => {
  it('rehydrates every record in an array', () => {
    const iso1 = '2026-05-01T00:00:00.000Z';
    const iso2 = '2026-05-02T00:00:00.000Z';
    const records: SampleRecord[] = [
      { id: 'a', createdAt: iso1 as unknown as Date, payload: { tag: 'x' } },
      { id: 'b', createdAt: iso2 as unknown as Date, payload: { tag: 'y' } },
    ];

    const result = rehydrateDatesAll(records, ['createdAt']);

    expect(result).toHaveLength(2);
    expect(result[0]!.createdAt).toBeInstanceOf(Date);
    expect(result[1]!.createdAt).toBeInstanceOf(Date);
    expect(result[0]!.createdAt.toISOString()).toBe(iso1);
  });

  it('filters out null/undefined entries (common when memory.get returns nothing)', () => {
    const iso = new Date().toISOString();
    const records = [
      { id: 'a', createdAt: iso as unknown as Date, payload: { tag: 'x' } },
      null,
      undefined,
      { id: 'b', createdAt: iso as unknown as Date, payload: { tag: 'y' } },
    ] as Array<SampleRecord | null | undefined>;

    const result = rehydrateDatesAll(records, ['createdAt']);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty input', () => {
    expect(rehydrateDatesAll([], ['createdAt'])).toEqual([]);
  });
});
