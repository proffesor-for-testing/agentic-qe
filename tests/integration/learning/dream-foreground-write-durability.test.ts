/**
 * #1060 regression: an acknowledged foreground memory_store made while a dream
 * is in flight must survive the dream being cancelled (discard path) and the
 * process shutting down mid-dream.
 *
 * Before the fix, DreamEngine held a SQLite SAVEPOINT on the process-wide
 * shared connection for the whole async dream. The foreground write joined
 * it and was rolled back by the discard, or lost when the connection closed.
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

const repoRoot = resolve(__dirname, '../../..');
const childScript = join(repoRoot, 'tests/fixtures/dream-durability/foreground-write-child.ts');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');

interface CaseResult {
  status: number | null;
  output: string;
  ack: { success: boolean; persisted?: boolean; inTransaction: boolean; dreamingAtWrite: boolean };
  markerRows: number;
  cycleStatuses: string[];
}

let root: string;

function runCase(mode: 'cancel' | 'shutdown' | 'engine-close' | 'complete'): CaseResult {
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
    return {
      status: child.status,
      output: `${child.stdout}\n${child.stderr}`,
      ack: JSON.parse(readFileSync(join(project, 'ack.json'), 'utf8')),
      markerRows,
      cycleStatuses,
    };
  } finally {
    reader.close();
  }
}

describe('#1060 acknowledged foreground writes survive an in-flight dream', () => {
  const results: Partial<Record<'cancel' | 'shutdown' | 'engine-close' | 'complete', CaseResult>> = {};

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-1060-'));
    for (const mode of ['cancel', 'shutdown', 'engine-close', 'complete'] as const) {
      results[mode] = runCase(mode);
    }
  }, 180_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each(['cancel', 'shutdown', 'engine-close', 'complete'] as const)(
    'acknowledges the write as persisted while the dream runs (%s)',
    (mode) => {
      const r = results[mode]!;
      expect(r.status, r.output).toBe(0);
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
});

describe('#1060 dream branching is opt-in', () => {
  it('defaults enableBranching to false', () => {
    expect(DEFAULT_DREAM_CONFIG.enableBranching).toBe(false);
  });

  it('creates no branch manager for a default engine', () => {
    expect(new DreamEngine().getBranchManager()).toBeNull();
  });
});
