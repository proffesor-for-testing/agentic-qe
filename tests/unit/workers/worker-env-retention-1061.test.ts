/**
 * Issue #1061: background workers ignored AQE_WORKERS_ENABLED and the
 * dream_insights retention sweep deleted rows silently on the first tick of
 * every MCP session.
 *
 * Covers:
 * - env parsing for AQE_WORKERS_ENABLED / AQE_DISABLED_WORKERS /
 *   AQE_DREAM_INSIGHTS_RETENTION_DAYS
 * - AQE_DISABLED_WORKERS keeps a worker out of the daemon
 * - the LearningConsolidationWorker sweep, against a real SQLite file:
 *   skipped on the first tick, configurable, disable-able, logged to stderr
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbHolder = vi.hoisted(() => ({ db: null as Database.Database | null }));

vi.mock('../../../src/kernel/unified-memory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/kernel/unified-memory.js')>();
  return {
    ...actual,
    getUnifiedMemory: () => ({
      getDatabase: () => {
        if (!dbHolder.db) throw new Error('test database not open');
        return dbHolder.db;
      },
      initialize: async () => undefined,
    }),
  };
});

import {
  isWorkersEnabled,
  parseDisabledWorkers,
  resolveDreamInsightsRetention,
} from '../../../src/workers/worker-env';
import { createDaemon, resetDaemon } from '../../../src/workers/daemon';
import { LearningConsolidationWorker } from '../../../src/workers/workers/learning-consolidation';
import type { WorkerFinding } from '../../../src/workers/interfaces';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

describe('#1061 worker env parsing', () => {
  it('keeps workers enabled when AQE_WORKERS_ENABLED is unset', () => {
    expect(isWorkersEnabled({})).toBe(true);
  });

  it('keeps workers enabled when AQE_WORKERS_ENABLED=true', () => {
    expect(isWorkersEnabled({ AQE_WORKERS_ENABLED: 'true' })).toBe(true);
  });

  it.each(['false', 'FALSE', ' false ', '0', 'off', 'no'])(
    'disables workers when AQE_WORKERS_ENABLED=%j',
    (value) => {
      expect(isWorkersEnabled({ AQE_WORKERS_ENABLED: value })).toBe(false);
    },
  );

  it('parses AQE_DISABLED_WORKERS as a trimmed, de-duplicated comma list', () => {
    expect(
      parseDisabledWorkers({ AQE_DISABLED_WORKERS: ' learning-consolidation, ,test-health,learning-consolidation ' }),
    ).toEqual(['learning-consolidation', 'test-health']);
  });

  it('returns no disabled workers when AQE_DISABLED_WORKERS is unset', () => {
    expect(parseDisabledWorkers({})).toEqual([]);
  });

  it('defaults the retention window to 30 days', () => {
    expect(resolveDreamInsightsRetention({})).toEqual({ retentionDays: 30 });
  });

  it.each(['0', 'off', 'OFF', ' off '])('disables the sweep for %j', (value) => {
    expect(resolveDreamInsightsRetention({ AQE_DREAM_INSIGHTS_RETENTION_DAYS: value })).toEqual({
      retentionDays: null,
    });
  });

  it('accepts a whole number of days', () => {
    expect(resolveDreamInsightsRetention({ AQE_DREAM_INSIGHTS_RETENTION_DAYS: '90' })).toEqual({
      retentionDays: 90,
    });
  });

  it.each(['-5', '1.5', 'abc', '30d', '99999999', 'true'])(
    'rejects %j with a warning and turns the sweep off (#1066 fail safe)',
    (value) => {
      const result = resolveDreamInsightsRetention({ AQE_DREAM_INSIGHTS_RETENTION_DAYS: value });
      expect(result.retentionDays).toBeNull();
      expect(result.warning).toContain('Invalid AQE_DREAM_INSIGHTS_RETENTION_DAYS');
    },
  );
});

describe('#1061 AQE_DISABLED_WORKERS in the daemon', () => {
  const saved = process.env.AQE_DISABLED_WORKERS;

  afterEach(() => {
    if (saved === undefined) delete process.env.AQE_DISABLED_WORKERS;
    else process.env.AQE_DISABLED_WORKERS = saved;
    resetDaemon();
  });

  it('does not register workers listed in AQE_DISABLED_WORKERS', () => {
    process.env.AQE_DISABLED_WORKERS = 'learning-consolidation';
    const ids = createDaemon({ autoStart: false })
      .getWorkerManager()
      .list()
      .map((w) => w.config.id);
    expect(ids).not.toContain('learning-consolidation');
    expect(ids).toContain('test-health');
  });

  it('registers every worker when AQE_DISABLED_WORKERS is unset', () => {
    delete process.env.AQE_DISABLED_WORKERS;
    const ids = createDaemon({ autoStart: false })
      .getWorkerManager()
      .list()
      .map((w) => w.config.id);
    expect(ids).toContain('learning-consolidation');
  });

  it('lets an explicit config override the environment', () => {
    process.env.AQE_DISABLED_WORKERS = 'learning-consolidation';
    const ids = createDaemon({ autoStart: false, disabledWorkers: [] })
      .getWorkerManager()
      .list()
      .map((w) => w.config.id);
    expect(ids).toContain('learning-consolidation');
  });
});

describe('#1061 LearningConsolidationWorker dream_insights sweep (real SQLite)', () => {
  let dir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const savedRetention = process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS;

  function seed(db: Database.Database): void {
    db.exec(`
      CREATE TABLE dream_insights (
        id TEXT PRIMARY KEY,
        cycle_id TEXT NOT NULL,
        insight_type TEXT NOT NULL,
        source_concepts TEXT NOT NULL,
        description TEXT NOT NULL,
        actionable INTEGER DEFAULT 0,
        applied INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    const insert = db.prepare(
      `INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, actionable, applied, created_at)
       VALUES (?, 'c1', 'novel_association', '[]', 'synthetic', 1, ?, datetime('now', ?))`,
    );
    insert.run('old-unapplied', 0, '-45 days');
    insert.run('old-applied', 1, '-45 days');
    insert.run('recent-unapplied', 0, '-5 days');
  }

  function remainingIds(): string[] {
    // Independent connection: proves what is on disk, not what the worker saw.
    const reader = new Database(join(dir, 'memory.db'), { readonly: true });
    try {
      return (reader.prepare('SELECT id FROM dream_insights ORDER BY id').all() as Array<{ id: string }>).map(
        (r) => r.id,
      );
    } finally {
      reader.close();
    }
  }

  function prune(worker: LearningConsolidationWorker, findings: WorkerFinding[] = []): number {
    return (worker as unknown as { pruneDreamInsights: (f: WorkerFinding[]) => number }).pruneDreamInsights(
      findings,
    );
  }

  function stderrText(): string {
    return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1061-'));
    dbHolder.db = new Database(join(dir, 'memory.db'));
    seed(dbHolder.db);
    delete process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    vi.useRealTimers();
    dbHolder.db?.close();
    dbHolder.db = null;
    rmSync(dir, { recursive: true, force: true });
    if (savedRetention === undefined) delete process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS;
    else process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS = savedRetention;
  });

  it('does not delete anything on the first tick after startup', () => {
    const worker = new LearningConsolidationWorker();
    expect(prune(worker)).toBe(0);
    expect(remainingIds()).toEqual(['old-applied', 'old-unapplied', 'recent-unapplied']);
  });

  it('does not delete on a retry of the first tick 30 s later', () => {
    const worker = new LearningConsolidationWorker();
    prune(worker);
    vi.setSystemTime(Date.now() + 30_000);
    expect(prune(worker)).toBe(0);
    expect(remainingIds()).toEqual(['old-applied', 'old-unapplied', 'recent-unapplied']);
  });

  it('archives stale unapplied insights once a full interval has passed and logs the count to stderr', () => {
    const worker = new LearningConsolidationWorker();
    vi.setSystemTime(Date.now() + THIRTY_MINUTES_MS);
    const findings: WorkerFinding[] = [];

    expect(prune(worker, findings)).toBe(1);
    expect(remainingIds()).toEqual(['old-applied', 'recent-unapplied']);
    expect(stderrText()).toContain(
      '[AQE] dream_insights retention: moved 1 unapplied insight(s) older than 30 days to dream_insights_archive',
    );
    expect(findings.map((f) => f.type)).toEqual(['dream-insights-pruned']);
  });

  it('never deletes when AQE_DREAM_INSIGHTS_RETENTION_DAYS=off', () => {
    process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS = 'off';
    const worker = new LearningConsolidationWorker();
    vi.setSystemTime(Date.now() + 2 * THIRTY_MINUTES_MS);
    expect(prune(worker)).toBe(0);
    expect(remainingIds()).toEqual(['old-applied', 'old-unapplied', 'recent-unapplied']);
  });

  it('never deletes when AQE_DREAM_INSIGHTS_RETENTION_DAYS=0', () => {
    process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS = '0';
    const worker = new LearningConsolidationWorker();
    vi.setSystemTime(Date.now() + 2 * THIRTY_MINUTES_MS);
    expect(prune(worker)).toBe(0);
    expect(remainingIds()).toEqual(['old-applied', 'old-unapplied', 'recent-unapplied']);
  });

  it('honours a custom retention window', () => {
    process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS = '60';
    const worker = new LearningConsolidationWorker();
    vi.setSystemTime(Date.now() + THIRTY_MINUTES_MS);
    expect(prune(worker)).toBe(0);
    expect(remainingIds()).toEqual(['old-applied', 'old-unapplied', 'recent-unapplied']);
  });

  it('warns once on an invalid retention value and deletes nothing (#1066)', () => {
    process.env.AQE_DREAM_INSIGHTS_RETENTION_DAYS = 'forever';
    const worker = new LearningConsolidationWorker();
    vi.setSystemTime(Date.now() + THIRTY_MINUTES_MS);

    expect(prune(worker)).toBe(0);
    prune(worker);
    expect(remainingIds()).toEqual(['old-applied', 'old-unapplied', 'recent-unapplied']);
    const warnings = stderrText().split('\n').filter((l) => l.includes('Invalid AQE_DREAM_INSIGHTS_RETENTION_DAYS'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('[AQE] WARN');
  });
});
