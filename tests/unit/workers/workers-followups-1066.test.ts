/**
 * Issue #1066: follow-ups to the #1061 worker switches.
 *
 * 1. AQE_DREAM_INSIGHTS_RETENTION_DAYS=false / no / disabled turns the sweep
 *    off, and any unreadable value fails safe (nothing is deleted).
 * 2. AQE_DISABLED_WORKERS ids are matched without regard to case.
 * 3. The unknown-id warning is printed only when the daemon starts.
 * -  The sweep archives rows to dream_insights_archive before deleting them,
 *    reads the copies back, and rolls back if they do not match.
 * -  `aqe daemon start` honours AQE_WORKERS_ENABLED.
 * 5. A stop issued while startAll is still running stops further first runs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { qualityStart } = vi.hoisted(() => ({ qualityStart: vi.fn(async () => undefined) }));

vi.mock('../../../src/workers/quality-daemon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/workers/quality-daemon')>();
  return {
    ...actual,
    QualityDaemon: class {
      running = false;
      start = qualityStart;
      async stop(): Promise<void> {}
      getStatus() {
        return {};
      }
    },
  };
});

import {
  parseDisabledWorkers,
  resolveDreamInsightsRetention,
} from '../../../src/workers/worker-env';
import { createDaemon, resetDaemon } from '../../../src/workers/daemon';
import { WorkerManagerImpl } from '../../../src/workers/worker-manager';
import {
  pruneStaleDreamInsights,
  DREAM_INSIGHTS_ARCHIVE_TABLE,
} from '../../../src/learning/dream/dream-insights-pruner';
import { createDaemonCommand } from '../../../src/cli/commands/daemon';
import type { Worker } from '../../../src/workers/interfaces';

describe('#1066 AQE_DREAM_INSIGHTS_RETENTION_DAYS opt-out values', () => {
  it.each(['false', 'FALSE', 'no', 'off', '0', 'disabled', 'none', 'never'])(
    'turns the sweep off for %j without a warning',
    (value) => {
      expect(resolveDreamInsightsRetention({ AQE_DREAM_INSIGHTS_RETENTION_DAYS: value })).toEqual({
        retentionDays: null,
      });
    },
  );

  it.each(['-5', '1.5', 'abc', '30d', '99999999', 'true'])(
    'fails safe for the unreadable value %j: warns and deletes nothing',
    (value) => {
      const result = resolveDreamInsightsRetention({ AQE_DREAM_INSIGHTS_RETENTION_DAYS: value });
      expect(result.retentionDays).toBeNull();
      expect(result.warning).toContain('Invalid AQE_DREAM_INSIGHTS_RETENTION_DAYS');
      expect(result.warning).toContain('nothing is deleted');
    },
  );
});

describe('#1066 AQE_DISABLED_WORKERS case and warning', () => {
  const saved = process.env.AQE_DISABLED_WORKERS;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    if (saved === undefined) delete process.env.AQE_DISABLED_WORKERS;
    else process.env.AQE_DISABLED_WORKERS = saved;
    resetDaemon();
  });

  function unknownIdWarnings(): string[] {
    return warnSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('unknown worker id'));
  }

  it('lower-cases the parsed ids', () => {
    expect(parseDisabledWorkers({ AQE_DISABLED_WORKERS: 'Learning-Consolidation, TEST-HEALTH' })).toEqual([
      'learning-consolidation',
      'test-health',
    ]);
  });

  it('keeps Learning-Consolidation out of the daemon and does not call it unknown', async () => {
    process.env.AQE_DISABLED_WORKERS = 'Learning-Consolidation';
    const daemon = createDaemon({ autoStart: false });
    const ids = daemon.getWorkerManager().list().map((w) => w.config.id);

    expect(ids).not.toContain('learning-consolidation');
    await daemon.start();
    await daemon.stop();
    expect(unknownIdWarnings()).toEqual([]);
  });

  it('matches mixed-case ids passed in explicit config too', () => {
    const ids = createDaemon({ autoStart: false, disabledWorkers: ['Security-Scan'] })
      .getWorkerManager()
      .list()
      .map((w) => w.config.id);
    expect(ids).not.toContain('security-scan');
  });

  it('does not warn about unknown ids when the daemon is only constructed', () => {
    process.env.AQE_DISABLED_WORKERS = 'no-such-worker';
    createDaemon({ autoStart: false });
    expect(unknownIdWarnings()).toEqual([]);
  });

  it('warns about unknown ids when the daemon starts', async () => {
    process.env.AQE_DISABLED_WORKERS = 'no-such-worker';
    const daemon = createDaemon({ autoStart: false });
    await daemon.start();
    await daemon.stop();
    expect(unknownIdWarnings()).toEqual([
      '[AQE] WARN AQE_DISABLED_WORKERS: unknown worker id(s) ignored: no-such-worker',
    ]);
  });
});

describe('#1066 dream_insights sweep archives before deleting (real SQLite)', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1066-'));
    db = new Database(join(dir, 'memory.db'));
    db.exec(`
      CREATE TABLE dream_insights (
        id TEXT PRIMARY KEY,
        cycle_id TEXT NOT NULL,
        insight_type TEXT NOT NULL,
        source_concepts TEXT NOT NULL,
        description TEXT NOT NULL,
        novelty_score REAL DEFAULT 0.5,
        confidence_score REAL DEFAULT 0.5,
        actionable INTEGER DEFAULT 0,
        applied INTEGER DEFAULT 0,
        suggested_action TEXT,
        pattern_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    const insert = db.prepare(
      `INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, applied, created_at)
       VALUES (?, 'c1', 'analogy', '["a","b"]', ?, ?, datetime('now', ?))`,
    );
    insert.run('old-unapplied-1', 'first stale insight', 0, '-45 days');
    insert.run('old-unapplied-2', 'second stale insight', 0, '-90 days');
    insert.run('old-applied', 'applied insight', 1, '-45 days');
    insert.run('recent-unapplied', 'recent insight', 0, '-5 days');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function ids(table: string): string[] {
    const reader = new Database(join(dir, 'memory.db'), { readonly: true });
    try {
      return (reader.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as Array<{ id: string }>).map((r) => r.id);
    } finally {
      reader.close();
    }
  }

  it('copies every removed row, with its content, to the archive table', () => {
    const result = pruneStaleDreamInsights(db, { retentionDays: 30 });

    expect(result).toEqual({ pruned: 2, archived: 2 });
    expect(ids('dream_insights')).toEqual(['old-applied', 'recent-unapplied']);
    expect(ids(DREAM_INSIGHTS_ARCHIVE_TABLE)).toEqual(['old-unapplied-1', 'old-unapplied-2']);
    const row = db
      .prepare(`SELECT description, source_concepts, applied, archived_at FROM ${DREAM_INSIGHTS_ARCHIVE_TABLE} WHERE id = ?`)
      .get('old-unapplied-1') as Record<string, unknown>;
    expect(row).toMatchObject({ description: 'first stale insight', source_concepts: '["a","b"]', applied: 0 });
    expect(row.archived_at).toEqual(expect.any(String));
  });

  it('does not create the archive table when nothing qualifies', () => {
    expect(pruneStaleDreamInsights(db, { retentionDays: 365 })).toEqual({ pruned: 0, archived: 0 });
    const table = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(DREAM_INSIGHTS_ARCHIVE_TABLE);
    expect(table).toBeUndefined();
  });

  it('deletes nothing and rolls back the copy when the archive read-back does not match', () => {
    // Simulate a lost archive write: a trigger drops every copied row.
    db.exec(`
      CREATE TABLE ${DREAM_INSIGHTS_ARCHIVE_TABLE} (
        id TEXT PRIMARY KEY, cycle_id TEXT, insight_type TEXT, source_concepts TEXT,
        description TEXT, novelty_score REAL, confidence_score REAL, actionable INTEGER,
        applied INTEGER, suggested_action TEXT, pattern_id TEXT, created_at TEXT,
        archived_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TRIGGER lose_archive AFTER INSERT ON ${DREAM_INSIGHTS_ARCHIVE_TABLE}
      BEGIN DELETE FROM ${DREAM_INSIGHTS_ARCHIVE_TABLE} WHERE id = NEW.id; END;
    `);

    expect(() => pruneStaleDreamInsights(db, { retentionDays: 30 })).toThrow(/archive check failed/);
    expect(ids('dream_insights')).toEqual(['old-applied', 'old-unapplied-1', 'old-unapplied-2', 'recent-unapplied']);
  });

  it('copies only the columns an older dream_insights table has', () => {
    db.exec(`
      CREATE TABLE legacy (id TEXT PRIMARY KEY, cycle_id TEXT, insight_type TEXT, source_concepts TEXT,
        description TEXT, applied INTEGER, created_at TEXT);
      INSERT INTO legacy SELECT id, cycle_id, insight_type, source_concepts, description, applied, created_at FROM dream_insights;
      DROP TABLE dream_insights;
      ALTER TABLE legacy RENAME TO dream_insights;
    `);

    expect(pruneStaleDreamInsights(db, { retentionDays: 30 })).toEqual({ pruned: 2, archived: 2 });
    expect(ids(DREAM_INSIGHTS_ARCHIVE_TABLE)).toEqual(['old-unapplied-1', 'old-unapplied-2']);
  });
});

describe('#1066 aqe daemon start honours AQE_WORKERS_ENABLED', () => {
  const saved = process.env.AQE_WORKERS_ENABLED;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    qualityStart.mockClear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (saved === undefined) delete process.env.AQE_WORKERS_ENABLED;
    else process.env.AQE_WORKERS_ENABLED = saved;
  });

  it.each(['false', '0', 'off', 'no'])('does not start the QualityDaemon when AQE_WORKERS_ENABLED=%s', async (value) => {
    process.env.AQE_WORKERS_ENABLED = value;
    await createDaemonCommand().parseAsync(['start'], { from: 'user' });

    expect(qualityStart).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain(`Background workers are disabled (AQE_WORKERS_ENABLED=${value})`);
  });
});

describe('#1066 startAll stops starting workers once the manager is stopped', () => {
  function fakeWorker(id: string, onExecute: () => Promise<void>): Worker {
    return {
      config: { id, name: id, description: '', intervalMs: 60_000, priority: 'normal', targetDomains: [], enabled: true, timeoutMs: 1000, retryCount: 0, retryDelayMs: 0 },
      status: 'idle',
      lastResult: undefined,
      lastRunAt: undefined,
      nextRunAt: undefined,
      initialize: async () => undefined,
      execute: async () => {
        await onExecute();
        return { workerId: id, timestamp: new Date(), durationMs: 0, success: true, metrics: {}, findings: [], recommendations: [] } as never;
      },
      pause: () => undefined,
      resume: () => undefined,
      stop: async () => undefined,
      getHealth: () => ({}) as never,
    } as unknown as Worker;
  }

  it('does not run the next worker after stopAll', async () => {
    const manager = new WorkerManagerImpl();
    const ran: string[] = [];
    manager.register(
      fakeWorker('first', async () => {
        ran.push('first');
        await manager.stopAll();
      }),
    );
    manager.register(fakeWorker('second', async () => { ran.push('second'); }));

    await manager.startAll();
    expect(ran).toEqual(['first']);
  });
});

describe('#1066 generated start-daemon.cjs keeps the user\'s AQE_WORKERS_ENABLED', () => {
  it('does not force AQE_WORKERS_ENABLED=true over the caller\'s environment', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(join(__dirname, '../../../src/init/phases/10-workers.ts'), 'utf-8');
    expect(source).toContain("AQE_WORKERS_ENABLED: process.env.AQE_WORKERS_ENABLED ?? 'true'");
    expect(source).not.toContain("AQE_WORKERS_ENABLED: 'true', AQE_HTTP_PORT");
  });
});
