/**
 * #1239: dream retention is off by default: a committed dream then deletes
 * nothing and reports what retention would remove. With AQE_DREAM_RETENTION=on
 * it runs the steps and reports what they removed. Fixture: a fresh unified-persistence SQLite file under the OS
 * temp dir, as in dream-engine-1060.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDreamEngine, type DreamEngine } from '../../../../src/learning/dream/index.js';
import {
  getUnifiedPersistence,
  initializeUnifiedPersistence,
  resetUnifiedPersistence,
} from '../../../../src/kernel/unified-persistence.js';

const DIR = path.join(os.tmpdir(), `aqe-dream-1239-${process.pid}`);
const DB_PATH = path.join(DIR, 'memory.db');

let db: DatabaseType;
let engine: DreamEngine;

const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

function removeDb(): void {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
}

function seedGrowth(): void {
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const cycle = db.prepare(`INSERT INTO dream_cycles (id, start_time, end_time, status, error) VALUES (?, ?, ?, 'failed', 'database is locked')`);
  for (let i = 0; i < 40; i++) cycle.run(`locked-${i}`, old, old);
  const node = db.prepare(`INSERT INTO concept_nodes (id, concept_type, content, created_at)
    VALUES (?, 'outcome', 'applied', datetime('now', ?))`);
  const edge = db.prepare(`INSERT INTO concept_edges (id, source, target, weight, edge_type) VALUES (?, ?, ?, 0.5, 'co_occurrence')`);
  for (let i = 0; i < 2100; i++) {
    node.run(`outcome-${i}`, `-${2100 - i} minutes`);
    if (i > 0) edge.run(randomUUID(), `outcome-${i}`, `outcome-${i - 1}`);
  }
}

beforeEach(async () => {
  resetUnifiedPersistence();
  fs.mkdirSync(DIR, { recursive: true });
  removeDb();
  await initializeUnifiedPersistence({ dbPath: DB_PATH });
  db = getUnifiedPersistence().getDatabase();
  engine = createDreamEngine({ minConceptsRequired: 3, maxDurationMs: 5000 });
  await engine.initialize();
  await engine.loadPatternsAsConcepts(Array.from({ length: 12 }, (_, i) => ({
    id: `p-${i}`, name: `pattern ${i}`, description: `pattern ${i}`,
    domain: 'test-generation', confidence: 0.8, successRate: 0.9,
  })));
  seedGrowth();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await engine.close();
  resetUnifiedPersistence();
  removeDb();
});

describe('#1239 retention after a committed dream', () => {
  it('should_deleteNothing_andReportWhatItWouldRemove_when_theSettingIsUnset', async () => {
    vi.stubEnv('AQE_DREAM_RETENTION', '');

    const result = await engine.dream(300);

    expect(n(`SELECT COUNT(*) AS n FROM dream_cycles WHERE status = 'failed'`)).toBe(40);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE concept_type = 'outcome'`)).toBe(2100);
    expect(n(`SELECT COUNT(*) AS n FROM concept_edges WHERE source LIKE 'outcome-%'`)).toBe(2099);
    expect(result.retention?.enabled).toBe(false);
    expect(result.retention?.steps.map(s => [s.step, s.dryRun, s.affected])).toEqual([
      ['failed-dream-cycles', true, 40],
      ['outcome-concepts', true, 100],
    ]);
  });

  it('should_removeOldFailedCyclesAndCapOutcomes_andReportTheCounts_when_switchedOn', async () => {
    vi.stubEnv('AQE_DREAM_RETENTION', 'on');

    const result = await engine.dream(300);

    expect(n(`SELECT COUNT(*) AS n FROM dream_cycles WHERE status = 'failed'`)).toBe(0);
    expect(n(`SELECT COUNT(*) AS n FROM dream_cycles WHERE status = 'completed'`)).toBe(1);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE concept_type = 'outcome'`)).toBe(2000);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE id = 'outcome-99'`)).toBe(0);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE id = 'outcome-100'`)).toBe(1);
    expect(result.retention?.enabled).toBe(true);
    expect(result.retention?.steps.map(s => [s.step, s.affected])).toEqual([
      ['failed-dream-cycles', 40],
      ['outcome-concepts', 100],
    ]);
  });

  it('should_keepEverything_when_bothStepsAreSwitchedOff', async () => {
    vi.stubEnv('AQE_DREAM_RETENTION', 'on');
    vi.stubEnv('AQE_FAILED_DREAM_CYCLE_RETENTION_DAYS', 'off');
    vi.stubEnv('AQE_OUTCOME_CONCEPT_CAP', 'off');

    const result = await engine.dream(300);

    expect(result.retention).toEqual({ enabled: true, steps: [] });
    expect(n(`SELECT COUNT(*) AS n FROM dream_cycles WHERE status = 'failed'`)).toBe(40);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE concept_type = 'outcome'`)).toBe(2100);
  });

  it('should_notPrune_when_theDreamFails', async () => {
    vi.stubEnv('AQE_DREAM_RETENTION', 'on');
    const sparse = createDreamEngine({ minConceptsRequired: 100_000 });
    await sparse.initialize();
    try {
      await expect(sparse.dream(200)).rejects.toThrow('Insufficient concepts');
    } finally {
      await sparse.close();
    }

    expect(n(`SELECT COUNT(*) AS n FROM dream_cycles WHERE status = 'failed'`)).toBe(41);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE concept_type = 'outcome'`)).toBe(2100);
  });
});
