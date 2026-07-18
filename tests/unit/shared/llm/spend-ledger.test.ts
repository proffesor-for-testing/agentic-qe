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

const entryFor = (costUsd: number, agent?: string) => ({ ...entry(costUsd), requestId: `r-${agent}-${costUsd}`, agent });

describe('per-agent attribution (ADR-124 M2.3)', () => {
  it('should_groupSpendByAgentType_when_charges_have_agents', () => {
    const ledger = new SqliteSpendLedger(new Database(tempDbPath()));
    ledger.record(entryFor(1, 'qe-security-scanner'));
    ledger.record(entryFor(2, 'qe-security-scanner'));
    ledger.record(entryFor(3, 'qe-coverage-specialist'));

    const byAgent = ledger.spentByAgentSince(3_600_000);
    expect(byAgent['qe-security-scanner']).toBeCloseTo(3, 6);
    expect(byAgent['qe-coverage-specialist']).toBeCloseTo(3, 6);
    // The total still reconciles with the flat sum.
    expect(ledger.spentSince(3_600_000)).toBeCloseTo(6, 6);
  });

  it('should_bucketChargesWithNoAgent_under_unattributed', () => {
    const ledger = new SqliteSpendLedger(new Database(tempDbPath()));
    ledger.record(entry(4)); // no agent field

    const byAgent = ledger.spentByAgentSince(3_600_000);
    expect(byAgent['(unattributed)']).toBeCloseTo(4, 6);
  });

  it('should_migrateAnOldSchemaTable_when_agentColumnIsMissing', () => {
    // Simulate a memory.db written before M2.3: llm_spend without agent_type.
    const dbPath = tempDbPath();
    const raw = new Database(dbPath);
    raw.exec(
      `CREATE TABLE llm_spend (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
        provider TEXT NOT NULL, model TEXT NOT NULL, cost_usd REAL NOT NULL,
        cost_source TEXT NOT NULL, prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0, request_id TEXT)`
    );
    raw.prepare(
      `INSERT INTO llm_spend (ts, provider, model, cost_usd, cost_source) VALUES (?,?,?,?,?)`
    ).run(Date.now(), 'claude', 'sonnet', 5, 'local-estimate'); // legacy row, no agent
    raw.close();

    // Constructing the ledger runs the additive ALTER without dropping the legacy row.
    const ledger = new SqliteSpendLedger(new Database(dbPath));
    ledger.record(entryFor(2, 'qe-flaky-hunter'));

    expect(ledger.spentSince(3_600_000)).toBeCloseTo(7, 6); // legacy 5 + new 2 — no data lost
    const byAgent = ledger.spentByAgentSince(3_600_000);
    expect(byAgent['(unattributed)']).toBeCloseTo(5, 6); // legacy row bucketed
    expect(byAgent['qe-flaky-hunter']).toBeCloseTo(2, 6);
  });

  it('should_attributeInMemoryLedger_too', () => {
    const ledger = new InMemorySpendLedger();
    ledger.record(entryFor(1.5, 'qe-mutation-tester'));
    ledger.record(entryFor(0.5, 'qe-mutation-tester'));
    expect(ledger.spentByAgentSince(3_600_000)['qe-mutation-tester']).toBeCloseTo(2, 6);
  });
});
