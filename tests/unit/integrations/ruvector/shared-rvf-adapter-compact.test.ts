/**
 * Tests for the patterns.rvf compaction + size guard introduced after the
 * "59 GB regrowth on a fresh clone" field report.
 *
 * Approach: shared-rvf-adapter uses a dynamic `require('./rvf-native-adapter.js')`
 * which `vi.mock` does not intercept reliably. Instead we exercise:
 *   - `decideCompactionFromStatus()` — pure decision logic
 *   - `runBootCompactGuard()` — boot-time path with an injected fake adapter
 *   - `compactSharedRvfAdapter()` — via the `__setSharedRvfAdapterForTests` seam
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  RvfNativeAdapter,
  RvfStatus,
} from '../../../../src/integrations/ruvector/rvf-native-adapter.js';
import {
  compactSharedRvfAdapter,
  decideCompactionFromStatus,
  runBootCompactGuard,
  resetSharedRvfAdapter,
  __setSharedRvfAdapterForTests,
} from '../../../../src/integrations/ruvector/shared-rvf-adapter.js';

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

interface FakeHandle {
  ref: RvfNativeAdapter;
  callLog: { compact: number };
  setStatus(s: Partial<RvfStatus>): void;
  setCompactResult(r: { segmentsCompacted: number; bytesReclaimed: number; epoch: number } | null): void;
  setCompactThrows(err: Error | null): void;
  setStatusThrows(err: Error | null): void;
}

function makeFakeAdapter(initial?: Partial<RvfStatus>): FakeHandle {
  let currentStatus: RvfStatus = {
    totalVectors: 0,
    totalSegments: 1,
    fileSizeBytes: 0,
    epoch: 1,
    witnessValid: true,
    witnessEntries: 0,
    deadSpaceRatio: 0,
    ...initial,
  };
  let compactResult: { segmentsCompacted: number; bytesReclaimed: number; epoch: number } | null = {
    segmentsCompacted: 3,
    bytesReclaimed: 1_000_000,
    epoch: 2,
  };
  let compactThrows: Error | null = null;
  let statusThrows: Error | null = null;
  const callLog = { compact: 0 };

  const ref = {
    ingest: vi.fn(),
    search: vi.fn(() => []),
    delete: vi.fn(() => 0),
    fork: vi.fn(),
    status: vi.fn(() => {
      if (statusThrows) throw statusThrows;
      return currentStatus;
    }),
    dimension: vi.fn(() => 384),
    size: vi.fn(() => currentStatus.totalVectors),
    compact: vi.fn(() => {
      callLog.compact++;
      if (compactThrows) throw compactThrows;
      return compactResult;
    }),
    close: vi.fn(),
    isOpen: vi.fn(() => true),
    path: vi.fn(() => '/tmp/fake-patterns.rvf'),
    embedKernel: vi.fn(),
    extractKernel: vi.fn(() => null),
    verifyWitness: vi.fn(() => ({ valid: true, totalEntries: 0, errors: [] })),
    sign: vi.fn(() => null),
    fileId: vi.fn(() => 'fake-file-id'),
    parentId: vi.fn(() => null),
    lineageDepth: vi.fn(() => 0),
    indexStats: vi.fn(() => ({
      totalVectors: currentStatus.totalVectors,
      dimension: 384,
      totalSegments: currentStatus.totalSegments,
      fileSizeBytes: currentStatus.fileSizeBytes,
      epoch: currentStatus.epoch,
      witnessValid: currentStatus.witnessValid,
      witnessEntries: currentStatus.witnessEntries,
      idMapSize: 0,
    })),
    freeze: vi.fn(() => 1),
    derive: vi.fn(),
  } as unknown as RvfNativeAdapter;

  return {
    ref,
    callLog,
    setStatus: (s) => {
      currentStatus = { ...currentStatus, ...s };
    },
    setCompactResult: (r) => {
      compactResult = r;
    },
    setCompactThrows: (e) => {
      compactThrows = e;
    },
    setStatusThrows: (e) => {
      statusThrows = e;
    },
  };
}

// ---------------------------------------------------------------------------
// decideCompactionFromStatus — pure function, no singletons involved
// ---------------------------------------------------------------------------

describe('decideCompactionFromStatus()', () => {
  const baseStatus: RvfStatus = {
    totalVectors: 0,
    totalSegments: 1,
    fileSizeBytes: 0,
    epoch: 1,
    witnessValid: true,
    witnessEntries: 0,
    deadSpaceRatio: 0,
  };

  it('returns shouldCompact=false when nothing crosses thresholds', () => {
    expect(
      decideCompactionFromStatus(
        { ...baseStatus, fileSizeBytes: 1024, deadSpaceRatio: 0.05 },
        { sizeGuardBytes: 100 * 1024 * 1024, deadRatioThreshold: 0.5 },
      ),
    ).toEqual({ shouldCompact: false, trigger: 'none' });
  });

  it('returns trigger=size-guard when fileSize crosses', () => {
    expect(
      decideCompactionFromStatus(
        { ...baseStatus, fileSizeBytes: 200 * 1024 * 1024, deadSpaceRatio: 0 },
        { sizeGuardBytes: 100 * 1024 * 1024, deadRatioThreshold: 0.5 },
      ),
    ).toEqual({ shouldCompact: true, trigger: 'size-guard' });
  });

  it('returns trigger=dead-ratio when fragmentation crosses', () => {
    expect(
      decideCompactionFromStatus(
        { ...baseStatus, fileSizeBytes: 1024, deadSpaceRatio: 0.7 },
        { sizeGuardBytes: 100 * 1024 * 1024, deadRatioThreshold: 0.5 },
      ),
    ).toEqual({ shouldCompact: true, trigger: 'dead-ratio' });
  });

  it('returns trigger=force when force=true', () => {
    expect(
      decideCompactionFromStatus(
        { ...baseStatus, fileSizeBytes: 0, deadSpaceRatio: 0 },
        { force: true },
      ),
    ).toEqual({ shouldCompact: true, trigger: 'force' });
  });

  it('treats missing deadSpaceRatio as 0', () => {
    const status = { ...baseStatus } as RvfStatus;
    delete (status as { deadSpaceRatio?: number }).deadSpaceRatio;
    expect(
      decideCompactionFromStatus(status, { sizeGuardBytes: 100, deadRatioThreshold: 0.5 }),
    ).toEqual({ shouldCompact: false, trigger: 'none' });
  });
});

// ---------------------------------------------------------------------------
// compactSharedRvfAdapter — integrates the decision with the singleton
// ---------------------------------------------------------------------------

describe('compactSharedRvfAdapter()', () => {
  beforeEach(() => {
    resetSharedRvfAdapter();
    delete process.env.AQE_RVF_SIZE_GUARD_BYTES;
    delete process.env.AQE_RVF_DEAD_RATIO_THRESHOLD;
  });

  afterEach(() => {
    __setSharedRvfAdapterForTests(null);
  });

  it('returns null when no adapter has been initialized', () => {
    expect(compactSharedRvfAdapter()).toBeNull();
  });

  it('runs compact() and returns reclaim stats when fileSize is oversized', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 1024 * 1024 * 1024, deadSpaceRatio: 0 });
    __setSharedRvfAdapterForTests(fake.ref);

    const result = compactSharedRvfAdapter({
      sizeGuardBytes: 100 * 1024 * 1024,
      deadRatioThreshold: 0.5,
    });

    expect(result).not.toBeNull();
    expect(result?.bytesReclaimed).toBe(1_000_000);
    expect(fake.callLog.compact).toBe(1);
  });

  it('runs compact() when deadSpaceRatio crosses threshold', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 1024, deadSpaceRatio: 0.7 });
    __setSharedRvfAdapterForTests(fake.ref);

    const result = compactSharedRvfAdapter({
      sizeGuardBytes: 100 * 1024 * 1024,
      deadRatioThreshold: 0.5,
    });

    expect(result).not.toBeNull();
    expect(fake.callLog.compact).toBe(1);
  });

  it('skips compact() when below thresholds', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 1024, deadSpaceRatio: 0.05 });
    __setSharedRvfAdapterForTests(fake.ref);

    const result = compactSharedRvfAdapter({
      sizeGuardBytes: 100 * 1024 * 1024,
      deadRatioThreshold: 0.5,
    });

    expect(result).toBeNull();
    expect(fake.callLog.compact).toBe(0);
  });

  it('runs compact() unconditionally when force=true', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 0, deadSpaceRatio: 0 });
    __setSharedRvfAdapterForTests(fake.ref);

    const result = compactSharedRvfAdapter({ force: true });

    expect(result).not.toBeNull();
    expect(fake.callLog.compact).toBe(1);
  });

  it('returns null when adapter.compact() throws', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 1024 * 1024 * 1024, deadSpaceRatio: 0 });
    fake.setCompactThrows(new Error('native compact crashed'));
    __setSharedRvfAdapterForTests(fake.ref);

    const result = compactSharedRvfAdapter({
      sizeGuardBytes: 100 * 1024 * 1024,
    });

    // The thin wrapper at rvf-native-adapter.ts swallows the throw and returns
    // null. compactSharedRvfAdapter therefore returns null too.
    expect(result).toBeNull();
    expect(fake.callLog.compact).toBe(1);
  });

  it('returns null when adapter.status() throws', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 0, deadSpaceRatio: 0 });
    fake.setStatusThrows(new Error('status crashed'));
    __setSharedRvfAdapterForTests(fake.ref);

    const result = compactSharedRvfAdapter({ force: true });

    expect(result).toBeNull();
    // compact() never reached because status() failed
    expect(fake.callLog.compact).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runBootCompactGuard — exercised directly with a fake adapter
// ---------------------------------------------------------------------------

describe('runBootCompactGuard()', () => {
  it('compacts when fileSize is oversized (uses default thresholds)', () => {
    // 1 GB exceeds the 256 MB default
    const fake = makeFakeAdapter({ fileSizeBytes: 1024 * 1024 * 1024, deadSpaceRatio: 0 });

    const result = runBootCompactGuard(fake.ref, '/tmp/x.rvf');

    expect(result).not.toBeNull();
    expect(fake.callLog.compact).toBe(1);
  });

  it('compacts when deadSpaceRatio is high', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 1024, deadSpaceRatio: 0.9 });

    const result = runBootCompactGuard(fake.ref, '/tmp/x.rvf');

    expect(result).not.toBeNull();
    expect(fake.callLog.compact).toBe(1);
  });

  it('does NOT compact a small, clean file', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 1024, deadSpaceRatio: 0.05 });

    const result = runBootCompactGuard(fake.ref, '/tmp/x.rvf');

    expect(result).toBeNull();
    expect(fake.callLog.compact).toBe(0);
  });

  it('swallows status() errors and returns null', () => {
    const fake = makeFakeAdapter({ fileSizeBytes: 1024, deadSpaceRatio: 0 });
    fake.setStatusThrows(new Error('boom'));

    expect(() => runBootCompactGuard(fake.ref, '/tmp/x.rvf')).not.toThrow();
    expect(fake.callLog.compact).toBe(0);
  });
});
