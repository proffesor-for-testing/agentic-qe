/**
 * #1060 regression: an acknowledged foreground memory_store made while a dream
 * is in flight must survive the dream being cancelled (discard path) and the
 * process shutting down mid-dream.
 *
 * Before the fix, DreamEngine held a SQLite SAVEPOINT on the process-wide
 * shared connection for the whole async dream. The foreground write joined
 * it and was rolled back by the discard, or lost when the connection closed.
 *
 * The full rework (compute, then commit) adds: the dream's own writes land in
 * one transaction (all or nothing, checked with an injected commit failure),
 * the deprecated enableBranching opens no savepoint, a SIGKILL mid-dream keeps
 * the write, and a second dream on the same engine is refused.
 *
 * Each case runs in its own child process against a fresh fixture project
 * (with .git, AQE_PROJECT_ROOT and a fake HOME). The test then reopens the
 * database on a separate connection in this process.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_DREAM_CONFIG, DreamEngine } from '../../../src/learning/dream/dream-engine';
import { markAbandonedCycles, ABANDONED_CYCLE_GRACE_MS } from '../../../src/learning/dream/dream-commit';

const repoRoot = resolve(__dirname, '../../..');
const childScript = join(repoRoot, 'tests/fixtures/dream-durability/foreground-write-child.ts');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');

interface CaseResult {
  status: number | null;
  output: string;
  ack: { success: boolean; persisted?: boolean; inTransaction: boolean; dreamingAtWrite: boolean };
  markerRows: number;
  cycleStatuses: string[];
  /** concept_nodes (id, activation_level, last_activated) before and after. */
  nodesBefore: unknown[];
  nodesAfter: unknown[];
  insightRows: number;
  dream: { outcome?: string; second?: string; stopMs?: number } | null;
  dbPath: string;
}

type Mode = 'cancel' | 'shutdown' | 'engine-close' | 'complete' | 'commit-error' | 'branching' | 'abrupt' | 'concurrent';
const MODES: Mode[] = ['cancel', 'shutdown', 'engine-close', 'complete', 'commit-error', 'branching', 'abrupt', 'concurrent'];

let root: string;

function runCase(mode: Mode): CaseResult {
  const project = join(root, mode);
  const home = join(project, '.home');
  mkdirSync(join(project, '.git'), { recursive: true });
  mkdirSync(join(project, '.agentic-qe'), { recursive: true });
  mkdirSync(home, { recursive: true });
  const dbPath = join(project, '.agentic-qe', 'memory.db');

  const child = spawnSync(process.execPath, ['--import', tsxLoader, childScript, mode], {
    cwd: project,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      XDG_CONFIG_HOME: home,
      XDG_CACHE_HOME: home,
      XDG_DATA_HOME: home,
      XDG_STATE_HOME: home,
      TMPDIR: project,
      AQE_PROJECT_ROOT: project,
      AQE_MEMORY_PATH: dbPath,
      // Fail optional vector indexing fast and locally (nothing listens here).
      AQE_EMBEDDER_ENDPOINT: 'http://127.0.0.1:9',
      // The child runs outside the repo; point tsx at the repo's path aliases.
      TSX_TSCONFIG_PATH: join(repoRoot, 'tsconfig.json'),
    },
    encoding: 'utf8',
    timeout: 60_000,
  });

  const reader = new Database(dbPath, { readonly: true });
  try {
    const markerRows = (
      reader
        .prepare("SELECT COUNT(*) AS n FROM kv_store WHERE key = 'repro-1060:fg-marker'")
        .get() as { n: number }
    ).n;
    const cycleStatuses = (
      reader.prepare('SELECT status FROM dream_cycles').all() as Array<{ status: string }>
    ).map((r) => r.status);
    const readJson = (name: string) => {
      try { return JSON.parse(readFileSync(join(project, name), 'utf8')); } catch { return null; }
    };
    return {
      status: child.status,
      output: `${child.stdout}\n${child.stderr}`,
      ack: readJson('ack.json'),
      markerRows,
      cycleStatuses,
      nodesBefore: readJson('before.json'),
      nodesAfter: reader.prepare('SELECT id, activation_level, last_activated FROM concept_nodes ORDER BY id').all(),
      insightRows: (reader.prepare('SELECT COUNT(*) AS n FROM dream_insights').get() as { n: number }).n,
      dream: readJson('dream.json'),
      dbPath,
    };
  } finally {
    reader.close();
  }
}

describe('#1060 acknowledged foreground writes survive an in-flight dream', () => {
  const results: Partial<Record<Mode, CaseResult>> = {};

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-1060-'));
    for (const mode of MODES) {
      results[mode] = runCase(mode);
    }
  }, 360_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each(MODES)(
    'acknowledges the write as persisted while the dream runs (%s)',
    (mode) => {
      const r = results[mode]!;
      // SIGKILL ends the abrupt case; every other child exits 0.
      if (mode === 'abrupt') expect(r.status, r.output).toBeNull();
      else expect(r.status, r.output).toBe(0);
      expect(r.ack.dreamingAtWrite).toBe(true);
      expect(r.ack.success).toBe(true);
      expect(r.ack.persisted).toBe(true);
    },
  );

  it('keeps the write when the dream is cancelled (discard path)', () => {
    expect(results.cancel!.markerRows).toBe(1);
  });

  it('keeps the write when the process shuts down mid-dream', () => {
    expect(results.shutdown!.markerRows).toBe(1);
  });

  it('keeps the write when the engine is closed mid-dream', () => {
    expect(results['engine-close']!.markerRows).toBe(1);
  });

  it('keeps the write when the dream completes (control)', () => {
    expect(results.complete!.markerRows).toBe(1);
  });

  it('does not hold an open transaction on the shared connection during the dream', () => {
    expect(results.cancel!.ack.inTransaction).toBe(false);
  });

  it('records a cycle interrupted by shutdown as interrupted, not running', () => {
    expect(results.shutdown!.cycleStatuses).toEqual(['interrupted']);
  });

  it('records a cycle whose engine was closed mid-dream as interrupted', () => {
    expect(results['engine-close']!.cycleStatuses).toEqual(['interrupted']);
  });

  it('records completed and cancelled cycles with their final status', () => {
    expect(results.complete!.cycleStatuses).toEqual(['completed']);
    expect(results.cancel!.cycleStatuses).toEqual(['interrupted']);
  });

  it('keeps the write for every other way a dream can end (commit failure, branching, SIGKILL, refused second dream)', () => {
    for (const mode of ['commit-error', 'branching', 'abrupt', 'concurrent'] as const) {
      expect(results[mode]!.markerRows, mode).toBe(1);
      expect(results[mode]!.ack.inTransaction, mode).toBe(false);
    }
    // The deprecated enableBranching: true changes nothing about the dream.
    expect(results.branching!.cycleStatuses).toEqual(['completed']);
  });

  it('commits a completed dream in one go: activations change and the cycle completes', () => {
    const r = results.complete!;
    expect(r.nodesAfter).not.toEqual(r.nodesBefore);
  });

  it('writes nothing of a dream whose commit fails: activations, insights and status are untouched', () => {
    const r = results['commit-error']!;
    expect(r.dream?.outcome).toMatch(/rejected: .*injected commit failure/);
    expect(r.nodesAfter).toEqual(r.nodesBefore);
    expect(r.insightRows).toBe(0);
    expect(r.cycleStatuses).toEqual(['failed']);
  });

  it('a cancelled dream stops at once instead of running out its duration', () => {
    // The dream had about 1.2 s left when it was cancelled.
    expect(results.cancel!.dream?.outcome).toMatch(/rejected: Dream cycle cancelled/);
    expect(results.cancel!.dream?.stopMs).toBeLessThan(500);
  });

  it('writes nothing of a cancelled or interrupted dream', () => {
    for (const mode of ['cancel', 'shutdown', 'engine-close'] as const) {
      expect(results[mode]!.nodesAfter, mode).toEqual(results[mode]!.nodesBefore);
      expect(results[mode]!.insightRows, mode).toBe(0);
    }
  });

  it('refuses a second dream on the same engine while one runs, and finishes the first', () => {
    expect(results.concurrent!.dream).toEqual({ second: 'DreamAlreadyRunningError', outcome: 'completed' });
    expect(results.concurrent!.cycleStatuses).toEqual(['completed']);
  });

  it('a dream killed with SIGKILL stays running until the abandoned-cycle sweep marks it interrupted', () => {
    const r = results.abrupt!;
    expect(r.cycleStatuses).toEqual(['running']);
    expect(r.nodesAfter).toEqual(r.nodesBefore);

    const db = new Database(r.dbPath);
    try {
      // What DreamEngine.initialize() runs: longest dream plus 10 minutes.
      const olderThanMs = 60_000 + ABANDONED_CYCLE_GRACE_MS;
      expect(markAbandonedCycles(db, olderThanMs)).toBe(0); // may still be running elsewhere
      expect(markAbandonedCycles(db, olderThanMs, Date.now() + olderThanMs + 1000)).toBe(1);
      expect(db.prepare('SELECT status, error FROM dream_cycles').get()).toEqual({
        status: 'interrupted',
        error: 'abandoned: process exited',
      });
      expect((db.prepare('SELECT COUNT(*) AS n FROM dream_cycles').get() as { n: number }).n).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe('#1060 dream branching is deprecated', () => {
  it('defaults enableBranching to false', () => {
    expect(DEFAULT_DREAM_CONFIG.enableBranching).toBe(false);
  });

  it('creates no branch manager, even when enableBranching is set', () => {
    expect(new DreamEngine().getBranchManager()).toBeNull();
    expect(new DreamEngine({ enableBranching: true }).getBranchManager()).toBeNull();
  });

});
