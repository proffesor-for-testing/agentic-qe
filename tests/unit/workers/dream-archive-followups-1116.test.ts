/**
 * #1116 follow-ups to the dream archive work (#1066):
 * 2. A stale dream_insights row with a NULL id made every retention sweep
 *    fail (the archive's id is NOT NULL), and the worker logged the failure
 *    on every tick. Such rows are now left in place and counted; the others
 *    are archived; the worker warns only when the count changes.
 * 3. The generated start-daemon.cjs spawned the MCP server and printed
 *    "started" when workers were disabled, and also when the server exited
 *    right away.
 * 4. A worker daemon start that failed in the background was still reported
 *    as started, and the daemon kept reporting itself running.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
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

import { pruneStaleDreamInsights, DREAM_INSIGHTS_ARCHIVE_TABLE } from '../../../src/learning/dream/dream-insights-pruner';
import { LearningConsolidationWorker } from '../../../src/workers/workers/learning-consolidation';
import { QEDaemon } from '../../../src/workers/daemon';
import { WorkersPhase } from '../../../src/init/phases/10-workers.js';
import type { InitContext } from '../../../src/init/phases/phase-interface.js';
import { createDefaultConfig } from '../../../src/init/types.js';
import type { WorkerFinding } from '../../../src/workers/interfaces';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function seed(db: Database.Database): void {
  db.exec(`
    CREATE TABLE dream_insights (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      insight_type TEXT NOT NULL,
      source_concepts TEXT NOT NULL,
      description TEXT NOT NULL,
      applied INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const insert = db.prepare(
    `INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, applied, created_at)
     VALUES (?, 'c1', 'novel_association', '[]', ?, 0, datetime('now', ?))`,
  );
  insert.run('old-1', 'old 1', '-45 days');
  insert.run('old-2', 'old 2', '-45 days');
  insert.run(null, 'old, no id', '-45 days');
  insert.run('recent', 'recent', '-1 days');
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('#1116 sweep with a NULL-id stale row (real SQLite)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1116-'));
    dbHolder.db = new Database(join(dir, 'memory.db'));
    seed(dbHolder.db);
  });
  afterEach(() => {
    dbHolder.db?.close();
    dbHolder.db = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it('archives the other stale rows, leaves the NULL-id row, and succeeds on every sweep', () => {
    const db = dbHolder.db!;
    expect(pruneStaleDreamInsights(db, { retentionDays: 30 })).toEqual({ pruned: 2, archived: 2, skippedNullId: 1 });
    expect(pruneStaleDreamInsights(db, { retentionDays: 30 })).toEqual({ pruned: 0, archived: 0, skippedNullId: 1 });

    expect(count(db, `SELECT COUNT(*) n FROM ${DREAM_INSIGHTS_ARCHIVE_TABLE}`)).toBe(2);
    expect(count(db, 'SELECT COUNT(*) n FROM dream_insights WHERE id IS NULL')).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM dream_insights WHERE id = 'recent'")).toBe(1);
  });

  it('the worker warns about NULL-id rows once, not on every tick', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const worker = new LearningConsolidationWorker();
      const prune = (findings: WorkerFinding[] = []) =>
        (worker as unknown as { pruneDreamInsights: (f: WorkerFinding[]) => number }).pruneDreamInsights(findings);
      vi.setSystemTime(Date.now() + THIRTY_MINUTES_MS);

      expect(prune()).toBe(2);
      expect(prune()).toBe(0);
      expect(prune()).toBe(0);

      const warnings = stderr.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('have no id'));
      expect(warnings).toEqual([expect.stringContaining('1 stale insight(s) have no id and were left in place')]);
    } finally {
      vi.useRealTimers();
      stderr.mockRestore();
    }
  });
});

describe('#1116 a failed worker daemon start is not reported as running', () => {
  it('start() rejects and the daemon reports not running', async () => {
    const daemon = new QEDaemon({ healthCheckIntervalMs: 60_000 });
    const manager = daemon.getWorkerManager() as unknown as { startAll: () => Promise<void> };
    vi.spyOn(manager, 'startAll').mockRejectedValue(new Error('worker init failed'));

    await expect(daemon.start()).rejects.toThrow('worker init failed');
    expect(daemon.running).toBe(false);
    expect(daemon.getStatus().running).toBe(false);
  });
});

describe('#1116 generated start-daemon.cjs reports what happened', () => {
  let tmp: string;
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  async function generate(): Promise<{ projectRoot: string; workers: string }> {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-1116-daemon-'));
    const projectRoot = join(tmp, 'proj');
    mkdirSync(projectRoot);
    const context: InitContext = {
      projectRoot, options: {}, config: createDefaultConfig('demo', projectRoot),
      enhancements: { claudeFlow: false, ruvector: false }, results: new Map(),
      services: { log: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await new WorkersPhase().execute(context);
    expect(result.success, result.error?.message).toBe(true);
    return { projectRoot, workers: join(projectRoot, '.agentic-qe', 'workers') };
  }

  /** Run the script with spawn faked; `exitAfterMs` makes the fake server exit. */
  function run(workers: string, env: NodeJS.ProcessEnv, exitAfterMs?: number) {
    const preload = join(tmp, 'fake-spawn.cjs');
    writeFileSync(preload, `const cp = require('child_process'); const { EventEmitter } = require('events');
      cp.spawn = (cmd, args, opts) => {
        require('fs').writeFileSync(${JSON.stringify(join(tmp, 'spawned.json'))}, JSON.stringify(opts.env.AQE_WORKERS_ENABLED));
        const child = Object.assign(new EventEmitter(), { pid: 4242, stdout: new EventEmitter(), stderr: new EventEmitter(), unref() {} });
        ${exitAfterMs === undefined ? '' : `setTimeout(() => child.emit('exit', 0, null), ${exitAfterMs});`}
        return child;
      };`);
    try {
      const stdout = execFileSync(process.execPath, ['-r', preload, join(workers, 'start-daemon.cjs')], {
        env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
      }).toString();
      return { code: 0, out: stdout };
    } catch (error) {
      const e = error as { status: number; stdout: Buffer; stderr: Buffer };
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  }

  it.each(['false', 'off', '0', 'no'])('does not spawn anything when AQE_WORKERS_ENABLED=%s', async (value) => {
    const { workers } = await generate();
    const result = run(workers, { AQE_WORKERS_ENABLED: value });

    expect(result.code).toBe(0);
    expect(result.out).toContain(`not started: background workers are disabled (AQE_WORKERS_ENABLED=${value})`);
    expect(existsSync(join(tmp, 'spawned.json'))).toBe(false);
    expect(existsSync(join(workers, 'daemon.pid'))).toBe(false);
  });

  it('reads AQE_WORKERS_ENABLED from .claude/settings.json when the environment has none', async () => {
    const { projectRoot, workers } = await generate();
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    writeFileSync(join(projectRoot, '.claude', 'settings.json'), JSON.stringify({ env: { AQE_WORKERS_ENABLED: 'false' } }));

    const result = run(workers, {});

    expect(result.out).toContain('not started: background workers are disabled (AQE_WORKERS_ENABLED=false)');
    expect(existsSync(join(tmp, 'spawned.json'))).toBe(false);
  });

  it('honours a JSON boolean false in .claude/settings.json', async () => {
    const { projectRoot, workers } = await generate();
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    writeFileSync(join(projectRoot, '.claude', 'settings.json'), JSON.stringify({ env: { AQE_WORKERS_ENABLED: false } }));

    const result = run(workers, {});

    expect(result.code).toBe(0);
    expect(result.out).toContain('not started: background workers are disabled (AQE_WORKERS_ENABLED=false)');
    expect(existsSync(join(tmp, 'spawned.json'))).toBe(false);
  });

  it('reads .claude/settings.local.json, which wins over settings.json', async () => {
    const { projectRoot, workers } = await generate();
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    writeFileSync(join(projectRoot, '.claude', 'settings.json'), JSON.stringify({ env: { AQE_WORKERS_ENABLED: 'true' } }));
    writeFileSync(join(projectRoot, '.claude', 'settings.local.json'), JSON.stringify({ env: { AQE_WORKERS_ENABLED: 'off' } }));

    const result = run(workers, {});

    expect(result.out).toContain('not started: background workers are disabled (AQE_WORKERS_ENABLED=off)');
    expect(existsSync(join(tmp, 'spawned.json'))).toBe(false);
  });

  it('exits 1 and writes no pid file when the server command cannot be spawned (no npx on PATH)', async () => {
    const { workers } = await generate();
    const emptyBin = join(tmp, 'empty-bin');
    mkdirSync(emptyBin);

    // The real spawn: no bundle in the fixture, so the script falls back to npx.
    let code = 0;
    let out = '';
    try {
      out = execFileSync(process.execPath, [join(workers, 'start-daemon.cjs')], {
        env: { PATH: emptyBin }, stdio: ['ignore', 'pipe', 'pipe'],
      }).toString();
    } catch (error) {
      const e = error as { status: number; stdout: Buffer; stderr: Buffer };
      code = e.status;
      out = `${e.stdout}${e.stderr}`;
    }

    expect(code).toBe(1);
    expect(out).toContain('AQE v3 Worker Daemon not started: spawn');
    expect(out).not.toContain('Unhandled');
    expect(existsSync(join(workers, 'daemon.pid'))).toBe(false);
  });

  it('says not started, exits 1 and removes the pid file when the server exits right away', async () => {
    const { workers } = await generate();
    const result = run(workers, {}, 100);

    expect(result.code).toBe(1);
    expect(result.out).toContain('not started: the MCP server exited right away');
    expect(result.out).not.toContain('Daemon started');
    expect(existsSync(join(workers, 'daemon.pid'))).toBe(false);
  });

  it('says started when the server is still running', async () => {
    const { workers } = await generate();
    const result = run(workers, {});

    expect(result.code).toBe(0);
    expect(result.out).toContain('AQE v3 Worker Daemon started (PID: 4242)');
    expect(JSON.parse(readFileSync(join(tmp, 'spawned.json'), 'utf-8'))).toBe('true');
  });
});
