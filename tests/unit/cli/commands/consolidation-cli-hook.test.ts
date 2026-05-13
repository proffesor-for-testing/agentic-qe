/**
 * Regression: issue #464
 *
 * consolidateExperiencesToPatterns() previously excluded `agent='cli-hook'`
 * rows because issue #348 had observed low-quality Bash telemetry (quality
 * ~0.40, success_rate ~0.24) flooding the pipeline. But post-edit also
 * tags experiences with agent='cli-hook', and those rows have quality
 * ~0.75 and success_rate ~1.0 — well above the HAVING thresholds. The
 * agent-name filter blanket-excluded the dominant share of high-quality
 * experiences and the consolidation pipeline never produced any patterns.
 *
 * The fix: remove the agent-name filter. The HAVING clause
 * (avg_quality >= 0.5 AND success_rate >= 0.6 AND cnt >= 3) is the real
 * quality gate. This test seeds a mix of high-quality cli-hook rows and
 * low-quality cli-hook rows, runs consolidation, and asserts only the
 * high-quality group creates a pattern.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { fakeUnifiedMemoryFactory } = vi.hoisted(() => ({
  fakeUnifiedMemoryFactory: vi.fn(),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => fakeUnifiedMemoryFactory(),
  findProjectRoot: () => process.cwd(),
}));

// Embedding helper does heavy I/O; stub it out so consolidation tests stay
// hermetic. Pattern row creation is what we care about.
vi.mock('../../../../src/learning/embed-and-insert-pattern.js', () => ({
  ensurePatternEmbedding: vi.fn(async () => undefined),
}));

import Database from 'better-sqlite3';
import { consolidateExperiencesToPatterns } from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';

const createSchema = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY,
      task TEXT,
      agent TEXT,
      domain TEXT,
      success INTEGER,
      quality REAL,
      duration_ms INTEGER,
      started_at TEXT,
      completed_at TEXT,
      source TEXT,
      application_count INTEGER DEFAULT 0,
      consolidated_into TEXT,
      consolidation_count INTEGER DEFAULT 1,
      quality_updated_at TEXT,
      reuse_success_count INTEGER DEFAULT 0,
      reuse_failure_count INTEGER DEFAULT 0
    );
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT, qe_domain TEXT, domain TEXT,
      name TEXT, description TEXT, confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 0, successful_uses INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0, quality_score REAL DEFAULT 0.0,
      tier TEXT DEFAULT 'short-term',
      template_json TEXT, context_json TEXT,
      created_at TEXT, updated_at TEXT
    );
  `);
};

const seed = (
  db: Database.Database,
  rows: Array<{ agent: string; domain: string; quality: number; success: 0 | 1; source: string }>,
): void => {
  const insert = db.prepare(`
    INSERT INTO captured_experiences
      (id, task, agent, domain, success, quality, duration_ms, source, application_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    insert.run(`exp-${i}`, `t${i}`, r.agent, r.domain, r.success, r.quality, 100, r.source);
  }
};

describe('consolidation does not exclude cli-hook agent (#464)', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-cli-hook-consol-'));
    db = new Database(path.join(tmpDir, 'unified.db'));
    createSchema(db);
    fakeUnifiedMemoryFactory.mockReturnValue({
      isInitialized: () => true,
      initialize: async () => undefined,
      getDatabase: () => db,
    });
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('creates a pattern from high-quality cli-hook experiences (post-edit shape)', async () => {
    // 4 post-edit cli-hook rows, all success, avg_quality 0.75 — well above
    // HAVING thresholds. Pre-fix this returned 0; now we expect 1 pattern.
    seed(db, [
      { agent: 'cli-hook', domain: 'code-intelligence', quality: 0.75, success: 1, source: 'cli-hook-post-edit' },
      { agent: 'cli-hook', domain: 'code-intelligence', quality: 0.75, success: 1, source: 'cli-hook-post-edit' },
      { agent: 'cli-hook', domain: 'code-intelligence', quality: 0.75, success: 1, source: 'cli-hook-post-edit' },
      { agent: 'cli-hook', domain: 'code-intelligence', quality: 0.75, success: 1, source: 'cli-hook-post-edit' },
    ]);

    const created = await consolidateExperiencesToPatterns();
    expect(created).toBe(1);

    const patterns = db
      .prepare(`SELECT name, success_rate, confidence, tier, usage_count FROM qe_patterns`)
      .all() as Array<{ name: string; success_rate: number; confidence: number; tier: string; usage_count: number }>;
    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toMatch(/^cli-hook-code-intelligence-\d{4}-\d{2}$/);
    expect(patterns[0].success_rate).toBeCloseTo(1.0, 5);
    expect(patterns[0].usage_count).toBe(4);
    expect(patterns[0].tier).toBe('short-term');
  });

  it('does NOT create a pattern from low-quality cli-hook experiences (HAVING gate)', async () => {
    // 4 rows: quality 0.4, success_rate 0.25. Mirrors the #348 Bash-telemetry
    // shape. HAVING filters this out even though the agent is now eligible.
    seed(db, [
      { agent: 'cli-hook', domain: 'shell-ops', quality: 0.4, success: 1, source: 'cli-hook-post-command' },
      { agent: 'cli-hook', domain: 'shell-ops', quality: 0.4, success: 0, source: 'cli-hook-post-command' },
      { agent: 'cli-hook', domain: 'shell-ops', quality: 0.4, success: 0, source: 'cli-hook-post-command' },
      { agent: 'cli-hook', domain: 'shell-ops', quality: 0.4, success: 0, source: 'cli-hook-post-command' },
    ]);

    const created = await consolidateExperiencesToPatterns();
    expect(created).toBe(0);
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM qe_patterns`).get() as { n: number }).n;
    expect(count).toBe(0);
  });

  it('still consolidates non-cli-hook agents the same way it always did', async () => {
    seed(db, [
      { agent: 'qe-test-architect', domain: 'test-generation', quality: 0.8, success: 1, source: 'mcp-task' },
      { agent: 'qe-test-architect', domain: 'test-generation', quality: 0.8, success: 1, source: 'mcp-task' },
      { agent: 'qe-test-architect', domain: 'test-generation', quality: 0.8, success: 1, source: 'mcp-task' },
    ]);

    const created = await consolidateExperiencesToPatterns();
    expect(created).toBe(1);

    const pattern = db.prepare(`SELECT name FROM qe_patterns`).get() as { name: string };
    expect(pattern.name).toMatch(/^qe-test-architect-test-generation-\d{4}-\d{2}$/);
  });

  it('marks consolidated experiences as processed (application_count > 0)', async () => {
    seed(db, [
      { agent: 'cli-hook', domain: 'code-intelligence', quality: 0.8, success: 1, source: 'cli-hook-post-edit' },
      { agent: 'cli-hook', domain: 'code-intelligence', quality: 0.8, success: 1, source: 'cli-hook-post-edit' },
      { agent: 'cli-hook', domain: 'code-intelligence', quality: 0.8, success: 1, source: 'cli-hook-post-edit' },
    ]);

    await consolidateExperiencesToPatterns();
    const remaining = (
      db.prepare(`SELECT COUNT(*) AS n FROM captured_experiences WHERE application_count = 0`).get() as { n: number }
    ).n;
    expect(remaining).toBe(0);
  });
});
