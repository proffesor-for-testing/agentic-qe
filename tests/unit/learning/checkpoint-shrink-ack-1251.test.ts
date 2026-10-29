/**
 * #1251: a deliberate shrink of memory.db leaves an acknowledgement that the
 * brain-checkpoint hook honours once, so `aqe learning prune --apply` and
 * dream retention are not refused by the checkpoint's richness guard.
 * Real SQLite in a tmp dir; no project database is opened.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';

import { ensureAllBrainTables } from '../../../src/integrations/ruvector/brain-table-ddl.js';
import {
  acknowledgeCheckpointShrink,
  CHECKPOINT_SHRINK_ACK_FILE,
  removedRows,
} from '../../../src/learning/checkpoint-shrink-ack.js';
import { resolveDefaultRetention, runDreamRetention } from '../../../src/learning/learning-retention.js';

const state = vi.hoisted(() => ({ dbPath: '' }));
vi.mock('../../../src/cli/commands/learning-helpers.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDbPath: () => state.dbPath,
}));

let dir: string;
let dbPath: string;
let ackPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aqe-1251-ack-'));
  dbPath = join(dir, 'memory.db');
  ackPath = join(dir, CHECKPOINT_SHRINK_ACK_FILE);
  state.dbPath = dbPath;
  const db = new Database(dbPath);
  ensureAllBrainTables(db);
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
  db.prepare(`INSERT INTO dream_cycles (id, start_time, end_time, status) VALUES ('old-failed', ?, ?, 'failed')`)
    .run(old, old);
  db.close();
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const step = (dryRun: boolean, before: number, after: number) => ({
  step: 'failed-dream-cycles' as const, dryRun, affected: before - after,
  tables: [{ table: 'dream_cycles', before, after }],
});

describe('removedRows', () => {
  it('should_beTrueOnlyForAStepThatRanAndLeftFewerRows', () => {
    expect([
      removedRows([step(false, 3, 1)]),
      removedRows([step(true, 3, 1)]),
      removedRows([step(false, 3, 3)]),
    ]).toEqual([true, false, false]);
  });
});

describe('acknowledgeCheckpointShrink', () => {
  const withDb = <T>(file: string, fn: (db: Database.Database) => T): T => {
    const db = new Database(file);
    try { return fn(db); } finally { db.close(); }
  };

  it('should_writeTheTimeProducerAndCounts_nextToTheDatabase', () => {
    const written = withDb(dbPath, (db) => acknowledgeCheckpointShrink(db, 'prune'));

    expect(written).toBe(ackPath);
    const ack = JSON.parse(readFileSync(ackPath, 'utf-8'));
    expect(ack.producer).toBe('prune');
    expect(ack.tableCounts).toMatchObject({ dream_cycles: 1, qe_patterns: 0 });
    expect(Number.isFinite(Date.parse(ack.at))).toBe(true);
  });

  it('should_writeNothing_when_theDatabaseIsInMemory', () => {
    expect(withDb(':memory:', (db) => acknowledgeCheckpointShrink(db, 'dream'))).toBeUndefined();
  });

  it('should_replaceAPlantedSymlinkWithoutWritingThroughIt', () => {
    const target = join(dir, 'elsewhere.txt');
    writeFileSync(target, 'UNTOUCHED');
    symlinkSync(target, ackPath);

    withDb(dbPath, (db) => acknowledgeCheckpointShrink(db, 'prune'));

    expect(readFileSync(target, 'utf-8')).toBe('UNTOUCHED');
    expect(lstatSync(ackPath).isSymbolicLink()).toBe(false);
  });
});

describe('deliberate shrinks acknowledge the checkpoint', () => {
  it('should_acknowledge_when_dreamRetentionRemovedRows', () => {
    const db = new Database(dbPath);
    try {
      runDreamRetention(db, resolveDefaultRetention({ AQE_DREAM_RETENTION: 'on' }));
    } finally {
      db.close();
    }

    expect(JSON.parse(readFileSync(ackPath, 'utf-8'))).toMatchObject({ producer: 'dream', tableCounts: { dream_cycles: 0 } });
  });

  it('should_notAcknowledge_when_dreamRetentionOnlyPreviews', () => {
    const db = new Database(dbPath);
    try {
      runDreamRetention(db, resolveDefaultRetention({}));
    } finally {
      db.close();
    }

    expect(existsSync(ackPath)).toBe(false);
  });

  async function prune(...args: string[]): Promise<void> {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { registerPruneCommand } = await import('../../../src/cli/commands/learning-prune.js');
    const learning = new Command('learning');
    registerPruneCommand(learning);
    await learning.parseAsync(['prune', ...args], { from: 'user' });
  }

  it('should_acknowledge_when_pruneApplyRemovedRows', async () => {
    await prune('--apply', '--no-backup');

    // The counts after the shrink, which the checkpoint export is held to.
    expect(JSON.parse(readFileSync(ackPath, 'utf-8'))).toMatchObject({ producer: 'prune', tableCounts: { dream_cycles: 0 } });
  });

  it('should_notAcknowledge_when_pruneIsADryRun', async () => {
    await prune();

    expect(existsSync(ackPath)).toBe(false);
  });
});
