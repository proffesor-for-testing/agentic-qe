/**
 * ADR-123 — Spend Ledger unit tests.
 * Focus: the cross-process guarantee (two connections to one memory.db see
 * each other's charges) that makes budget caps hold across a fleet.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import {
  SqliteSpendLedger,
  InMemorySpendLedger,
} from '../../../../src/shared/llm/spend-ledger';

const tempFiles: string[] = [];

function tempDbPath(): string {
  const p = path.join(
    os.tmpdir(),
    `aqe-spend-ledger-${process.pid}-${tempFiles.length}-${Date.now()}.db`
  );
  tempFiles.push(p);
  return p;
}

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(f + suffix);
      } catch {
        /* ignore */
      }
    }
  }
});

const entry = (costUsd: number) => ({
  provider: 'claude',
  model: 'claude-sonnet-4-6',
  costUsd,
  costSource: 'local-estimate' as const,
  promptTokens: 100,
  completionTokens: 50,
  requestId: `r-${costUsd}`,
});

describe('SqliteSpendLedger', () => {
  it('should_sumChargesWithinWindow_when_recordedRecently', () => {
    const ledger = new SqliteSpendLedger(new Database(tempDbPath()));

    ledger.record(entry(1.5));
    ledger.record(entry(2.25));

    expect(ledger.spentSince(3_600_000)).toBeCloseTo(3.75, 6);
  });

  it('should_excludeChargesOlderThanWindow', () => {
    const dbPath = tempDbPath();
    const db = new Database(dbPath);
    const ledger = new SqliteSpendLedger(db);
    ledger.record(entry(5));

    // Backdate the row two hours; a one-hour window must not see it.
    db.prepare('UPDATE llm_spend SET ts = ?').run(Date.now() - 2 * 3_600_000);

    expect(ledger.spentSince(3_600_000)).toBe(0);
    expect(ledger.spentSince(3 * 3_600_000)).toBeCloseTo(5, 6);
  });

  it('should_seeChargesAcrossSeparateConnections_when_sharingOneDbFile', () => {
    // Simulates two fleet processes: writer + reader on the same memory.db.
    const dbPath = tempDbPath();
    const writer = new SqliteSpendLedger(new Database(dbPath));
    const reader = new SqliteSpendLedger(new Database(dbPath));

    writer.record(entry(4));

    // The reader — a *different* connection — must observe the writer's spend.
    expect(reader.spentSince(3_600_000)).toBeCloseTo(4, 6);
  });

  it('should_notThrow_when_recordFailsOnClosedDb', () => {
    const db = new Database(tempDbPath());
    const ledger = new SqliteSpendLedger(db);
    db.close();

    expect(() => ledger.record(entry(1))).not.toThrow();
    expect(ledger.spentSince(3_600_000)).toBe(0);
  });
});

describe('InMemorySpendLedger', () => {
  it('should_enforceWithinProcess_but_stayIsolatedPerInstance', () => {
    const a = new InMemorySpendLedger();
    const b = new InMemorySpendLedger();

    a.record(entry(3));

    expect(a.spentSince(3_600_000)).toBeCloseTo(3, 6);
    // Different process/instance sees nothing — documents the fallback's limit.
    expect(b.spentSince(3_600_000)).toBe(0);
  });
});
