/**
 * Issue #1014.3 — legacy coverage records without provenance are ignored by
 * readers (no deletion, no migration):
 *
 *  - `coverage_sessions` rows of the MCP handler (`qe-coverage-analysis`)
 *    written before provenance stamping held estimates and 0.0 for unmeasured
 *    runs; `gate-check` / `threshold-check` / the coverage-learner read the
 *    latest one. Rows of other writers (the post-command hook) are unaffected.
 *  - `coverage:file:*` / `coverage:latest` estimate records written by
 *    <= 3.15.4 never expire; quality_assess read "coverage 10" from them.
 */
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { FEEDBACK_SCHEMA } from '../../../src/kernel/unified-memory-schemas';
import {
  MEASURED_COVERAGE_SESSION_SQL,
  isMeasuredCoverageSession,
} from '../../../src/feedback/coverage-session-provenance';
import { QualityAnalyzerService } from '../../../src/domains/quality-assessment/services/quality-analyzer';
import { DefectPredictorService } from '../../../src/domains/defect-intelligence/services/defect-predictor';

function sessionsDb() {
  const db = new Database(':memory:');
  db.exec(FEEDBACK_SCHEMA);
  const insert = db.prepare(`INSERT INTO coverage_sessions
    (id, target_path, agent_id, technique, after_lines, duration_ms, started_at, completed_at, context_json, created_at)
    VALUES (?, 't', ?, 'gap-analysis', ?, 1, 'x', 'x', ?, ?)`);
  return { db, insert };
}

const latestMeasured = (db: Database.Database) =>
  (db.prepare(`SELECT after_lines FROM coverage_sessions WHERE ${MEASURED_COVERAGE_SESSION_SQL} ORDER BY created_at DESC LIMIT 1`)
    .get() as { after_lines: number } | undefined)?.after_lines;

describe('#1014.3 — coverage_sessions provenance', () => {
  it('skips legacy MCP estimate / unmeasured rows and reads the latest measured one', () => {
    const { db, insert } = sessionsDb();
    insert.run('m1', 'qe-coverage-analysis', 57.1, JSON.stringify({ measured: true }), '2026-01-01 00:00:01');
    insert.run('e1', 'qe-coverage-analysis', 11.1, null, '2026-01-01 00:00:02');          // legacy estimate
    insert.run('u1', 'qe-coverage-analysis', 0.0, null, '2026-01-01 00:00:03');           // legacy unmeasured
    insert.run('b1', 'qe-coverage-analysis', 0.0, '{not json', '2026-01-01 00:00:04');    // malformed context
    expect(latestMeasured(db)).toBe(57.1);
  });

  it('keeps rows of other writers (post-command hook)', () => {
    const { db, insert } = sessionsDb();
    insert.run('e1', 'qe-coverage-analysis', 11.1, null, '2026-01-01 00:00:01');
    insert.run('h1', 'cli-hook-post-command', 70, null, '2026-01-01 00:00:02');
    expect(latestMeasured(db)).toBe(70);
  });

  it('returns nothing when only legacy rows exist (never their estimate)', () => {
    const { db, insert } = sessionsDb();
    insert.run('e1', 'qe-coverage-analysis', 11.1, null, '2026-01-01 00:00:01');
    expect(latestMeasured(db)).toBeUndefined();
  });

  it('isMeasuredCoverageSession matches the SQL predicate', () => {
    expect(isMeasuredCoverageSession({ agent_id: 'qe-coverage-analysis', context_json: null })).toBe(false);
    expect(isMeasuredCoverageSession({ agent_id: 'qe-coverage-analysis', context_json: '{"measured":true}' })).toBe(true);
    expect(isMeasuredCoverageSession({ agentId: 'qe-coverage-analysis', context: { measured: true } })).toBe(true);
    expect(isMeasuredCoverageSession({ agent_id: 'cli-hook-post-command', context_json: null })).toBe(true);
  });
});

function kv(records: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => records[key]),
    set: vi.fn(), delete: vi.fn(), storeVector: vi.fn(), vectorSearch: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]), search: vi.fn().mockResolvedValue([]),
  };
}

const legacy = {
  'coverage:file:src/a.ts': { line: 10, branch: 0, function: 0, statement: 10 },            // <= 3.15.4 estimate
  'coverage:latest': { line: 10, branch: 0, function: 0, statement: 10, files: 3 },          // unstamped
};

describe('#1014.3 — per-file / latest coverage readers ignore unstamped records', () => {
  it('quality-analyzer reports no stored coverage (null) instead of the legacy 10', async () => {
    const analyzer = new QualityAnalyzerService(kv(legacy) as never);
    const read = (analyzer as unknown as { getStoredCoverage(f: string): Promise<number | null> }).getStoredCoverage.bind(analyzer);
    expect(await read('src/a.ts')).toBeNull();
  });

  it('quality-analyzer reads a measured per-file record', async () => {
    const analyzer = new QualityAnalyzerService(kv({ 'coverage:file:src/a.ts': { line: 64, branch: null, measured: true } }) as never);
    const read = (analyzer as unknown as { getStoredCoverage(f: string): Promise<number | null> }).getStoredCoverage.bind(analyzer);
    expect(await read('src/a.ts')).toBe(64);
  });

  it('defect-predictor falls back to its neutral prior instead of the legacy record', async () => {
    const predictor = new DefectPredictorService(kv(legacy) as never);
    const read = (predictor as unknown as { getTestCoverage(f: string): Promise<number> }).getTestCoverage.bind(predictor);
    expect(await read('src/a.ts')).toBe(0.4);
  });
});
