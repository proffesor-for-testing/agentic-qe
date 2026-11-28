/**
 * #1501: post-edit / post-command rows written from the installed hooks'
 * constant `--success`, and the patterns built from them, raise no success
 * metric at read time. Stored rows are never modified.
 *
 * Also the #1493 leftovers: promotion counts only observed uses on every
 * pattern, and legacy-derived patterns are left out of search and routing
 * guidance whatever their tier.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isLegacyHookDerivedPattern,
  legacyHookUsageColumnsSql,
  LEGACY_HOOK_COMMAND_SOURCE,
  LEGACY_HOOK_EDIT_SOURCE,
  LEGACY_HOOK_PATTERN_SQL,
  LEGACY_HOOK_TASK_SOURCE,
  observedPromotionCounts,
  OBSERVED_EXPERIENCE_SQL,
  OBSERVED_HOOK_COMMAND_SOURCE,
  OBSERVED_HOOK_EDIT_SOURCE,
  OBSERVED_HOOK_TASK_SOURCE,
} from '../../../src/learning/hook-outcome-provenance.js';
import { shouldPromotePattern, type QEPattern } from '../../../src/learning/qe-patterns.js';
import { createSQLitePatternStore, type SQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';
import { createPatternStore, type PatternStore } from '../../../src/learning/pattern-store.js';
import { enhanceRoutingWithPatterns } from '../../../src/learning/pattern-routing-guidance.js';
import { EXECUTED_TEST_OUTCOME_SQL, isExecutedTestOutcome } from '../../../src/feedback/test-outcome-provenance.js';
import { PatternLifecycleManager } from '../../../src/learning/pattern-lifecycle.js';
import { RealQEReasoningBank } from '../../../src/learning/real-qe-reasoning-bank.js';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import type { QERoutingResult } from '../../../src/learning/qe-reasoning-bank-types.js';

const LEGACY_FANOUT = JSON.stringify({ source: LEGACY_HOOK_TASK_SOURCE, experience_id: 'exp-1' });

function pattern(id: string, tags: string[], over: Partial<QEPattern> = {}): QEPattern {
  const now = new Date();
  return {
    id, patternType: 'workflow', qeDomain: 'code-intelligence', domain: 'code-intelligence',
    name: `${id} code intelligence workflow`, description: `Auto-consolidated ${id} code intelligence workflow`,
    confidence: 0.99, usageCount: 10, successRate: 1, qualityScore: 0.99, successfulUses: 10,
    context: { tags }, template: { type: 'workflow', content: `${id} pattern`, variables: [] },
    tier: 'long-term', createdAt: now, lastUsedAt: now, reusable: true, reuseCount: 0, averageTokenSavings: 0,
    ...over,
  } as QEPattern;
}

describe('captured_experiences read-time filter (#1501)', () => {
  it('leaves out legacy post-task, post-edit and post-command rows, keeps observed and other writers', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE captured_experiences (id TEXT PRIMARY KEY, success INTEGER, source TEXT)`);
    const rows: Array<[string, string | null]> = [
      ['a', LEGACY_HOOK_TASK_SOURCE], ['b', LEGACY_HOOK_EDIT_SOURCE], ['c', LEGACY_HOOK_COMMAND_SOURCE],
      ['d', OBSERVED_HOOK_TASK_SOURCE], ['e', OBSERVED_HOOK_EDIT_SOURCE], ['f', OBSERVED_HOOK_COMMAND_SOURCE],
      ['g', 'middleware'], ['h', null],
    ];
    for (const [id, source] of rows) db.prepare(`INSERT INTO captured_experiences VALUES (?, 1, ?)`).run(id, source);

    const kept = db.prepare(`SELECT id FROM captured_experiences WHERE ${OBSERVED_EXPERIENCE_SQL} ORDER BY id`)
      .all().map((r) => (r as { id: string }).id);

    expect(kept).toEqual(['d', 'e', 'f', 'g', 'h']);
    expect((db.prepare(`SELECT COUNT(*) n FROM captured_experiences`).get() as { n: number }).n).toBe(8);
    db.close();
  });
});

describe('legacy hook-derived patterns (#1501)', () => {
  it.each([[LEGACY_HOOK_EDIT_SOURCE], [LEGACY_HOOK_COMMAND_SOURCE], [LEGACY_HOOK_TASK_SOURCE]])(
    'recognises a pattern tagged %s in SQL and TypeScript', (source) => {
      const db = new Database(':memory:');
      db.exec(`CREATE TABLE qe_patterns (id TEXT, context_json TEXT)`);
      db.prepare(`INSERT INTO qe_patterns VALUES ('legacy', ?), ('observed', ?), ('mixed', ?)`).run(
        JSON.stringify({ tags: [source] }),
        JSON.stringify({ tags: [`${source}-observed`] }),
        JSON.stringify({ tags: ['middleware', source] }),
      );
      const flagged = db.prepare(`SELECT id FROM qe_patterns WHERE ${LEGACY_HOOK_PATTERN_SQL} ORDER BY id`)
        .all().map((r) => (r as { id: string }).id);
      expect(flagged).toEqual(['legacy', 'mixed']);
      expect(isLegacyHookDerivedPattern({ context: { tags: [source] } })).toBe(true);
      expect(isLegacyHookDerivedPattern({ context: { tags: [`${source}-observed`] } })).toBe(false);
      db.close();
    });

  it('never promotes a pattern consolidated from legacy post-edit rows', () => {
    const check = shouldPromotePattern(pattern('p', [LEGACY_HOOK_EDIT_SOURCE], { tier: 'short-term' }));
    expect(check.meetsUsageCriteria).toBe(false);
  });

  it('keeps legacy-derived patterns out of routing guidance', () => {
    const base = { recommendedAgent: 'a', confidence: 0.5, alternatives: [], domains: [], patterns: [],
      guidance: [], reasoning: 'r' } as unknown as QERoutingResult;
    const out = enhanceRoutingWithPatterns(base, [
      { pattern: pattern('legacy', [LEGACY_HOOK_EDIT_SOURCE]), similarity: 0.9 },
      { pattern: pattern('observed', [OBSERVED_HOOK_EDIT_SOURCE]), similarity: 0.9 },
    ]);
    expect(out.patterns.map((p) => p.id)).toEqual(['observed']);
    expect(out.guidance.join('\n')).not.toContain('legacy code intelligence');
  });
});

describe('promotion counts only observed uses (#1501)', () => {
  it('subtracts legacy task-bridge fan-out uses from a pattern that is not legacy-tagged', () => {
    const inflated = pattern('p', ['seeded'], {
      tier: 'short-term', usageCount: 5, successfulUses: 4, successRate: 0.8,
      legacyHookUsage: { uses: 3, successes: 3 },
    });
    expect(observedPromotionCounts(inflated)).toEqual({ usageCount: 2, successfulUses: 1, successRate: 0.5 });
    expect(shouldPromotePattern(inflated).meetsUsageCriteria).toBe(false);
    expect(shouldPromotePattern({ ...inflated, legacyHookUsage: undefined }).meetsUsageCriteria).toBe(true);
  });

  describe('SQLitePatternStore annotation', () => {
    let dir: string;
    let store: SQLitePatternStore;

    beforeEach(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1501-sps-'));
      store = createSQLitePatternStore({ useUnified: false, dbPath: path.join(dir, 'p.db') });
      await store.initialize();
    });
    afterEach(() => {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('reads legacy fan-out usage into legacyHookUsage, so promotion leaves it out', () => {
      store.storePattern(pattern('fan', ['seeded'], { tier: 'short-term', usageCount: 0, successfulUses: 0, successRate: 0 }));
      const db = store.getDatabase();
      const use = db.prepare(`INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES ('fan', ?, ?)`);
      for (let i = 0; i < 3; i++) use.run(1, LEGACY_FANOUT);
      use.run(1, JSON.stringify({ source: OBSERVED_HOOK_TASK_SOURCE, outcome: 'measured' }));
      db.prepare(`UPDATE qe_patterns SET usage_count = 4, successful_uses = 4, success_rate = 1, confidence = 0.9 WHERE id = 'fan'`).run();

      const loaded = store.getPattern('fan')!;
      expect(loaded.legacyHookUsage).toEqual({ uses: 3, successes: 3 });
      expect(store.getPatterns().find((p) => p.id === 'fan')?.legacyHookUsage).toEqual({ uses: 3, successes: 3 });
      expect(shouldPromotePattern(loaded).meetsUsageCriteria).toBe(false);
      // stored counters are untouched
      expect(db.prepare(`SELECT usage_count, successful_uses FROM qe_patterns WHERE id = 'fan'`).get())
        .toEqual({ usage_count: 4, successful_uses: 4 });
    });

    it('adds no annotation without legacy usage', () => {
      store.storePattern(pattern('clean', ['seeded']));
      expect(store.getPattern('clean')!.legacyHookUsage).toBeUndefined();
    });
  });

  it('PatternLifecycleManager.checkPromotion counts observed uses only', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE qe_patterns (id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL,
        domain TEXT NOT NULL, name TEXT NOT NULL, description TEXT, confidence REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0, success_rate REAL DEFAULT 0.0, quality_score REAL DEFAULT 0.0,
        tier TEXT DEFAULT 'short-term', template_json TEXT, context_json TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT DEFAULT (datetime('now')), successful_uses INTEGER DEFAULT 0);
      CREATE TABLE qe_pattern_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT, success INTEGER,
        metrics_json TEXT, feedback TEXT, created_at TEXT DEFAULT (datetime('now')));
    `);
    const mgr = new PatternLifecycleManager(db);
    db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, confidence, usage_count,
      success_rate, quality_score, successful_uses, context_json) VALUES ('p', 't', 'test-generation', 'core', 'p',
      0.9, 10, 1.0, 0.95, 10, '{"tags":["seeded"]}')`).run();
    const before = mgr.checkPromotion('p');
    for (let i = 0; i < 8; i++) {
      db.prepare(`INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES ('p', 1, ?)`).run(LEGACY_FANOUT);
    }
    const after = mgr.checkPromotion('p');

    expect(before.currentOccurrences).toBe(10);
    expect(after.currentOccurrences).toBe(2);
    expect(after.meetsOccurrenceThreshold).toBe(false);
    db.close();
  });

  it('legacyHookUsageColumnsSql counts per pattern', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE qe_patterns (id TEXT); CREATE TABLE qe_pattern_usage (pattern_id TEXT, success INTEGER, metrics_json TEXT);
      INSERT INTO qe_patterns VALUES ('x'), ('y');`);
    db.prepare(`INSERT INTO qe_pattern_usage VALUES ('x', 1, ?), ('x', 0, ?), ('x', 1, ?), ('y', 1, NULL)`).run(
      LEGACY_FANOUT, LEGACY_FANOUT, JSON.stringify({ source: LEGACY_HOOK_TASK_SOURCE, outcome: 'measured' }));
    expect(db.prepare(`SELECT p.id, ${legacyHookUsageColumnsSql('p')} FROM qe_patterns p ORDER BY p.id`).all()).toEqual([
      { id: 'x', legacy_hook_uses: 2, legacy_hook_successes: 1 },
      { id: 'y', legacy_hook_uses: 0, legacy_hook_successes: 0 },
    ]);
    db.close();
  });
});

describe('pattern search leaves out legacy-derived patterns, whatever their tier (#1501)', () => {
  let dir: string;
  let sqlite: SQLitePatternStore;
  let store: PatternStore;

  const memoryBackend = (): MemoryBackend => {
    const m = new Map<string, unknown>();
    return {
      get: vi.fn(async (k: string) => m.get(k) ?? null), set: vi.fn(async (k: string, v: unknown) => { m.set(k, v); }),
      delete: vi.fn(async (k: string) => { m.delete(k); }), has: vi.fn(async (k: string) => m.has(k)),
      keys: vi.fn(async () => [...m.keys()]), search: vi.fn(async () => []), clear: vi.fn(async () => { m.clear(); }),
      size: vi.fn(async () => m.size), close: vi.fn(async () => undefined),
      getState: vi.fn(() => ({ type: 'memory', ready: true })),
    } as unknown as MemoryBackend;
  };

  beforeEach(async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1501-ps-'));
    sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(dir, 'p.db') });
    await sqlite.initialize();
    store = createPatternStore(memoryBackend(), { embeddingDimension: 8 }) as PatternStore;
    await store.initialize();
    store.setSqliteStore(sqlite);
    await store.store(pattern('legacy-edit', [LEGACY_HOOK_EDIT_SOURCE]));
    await store.store(pattern('legacy-command', [LEGACY_HOOK_COMMAND_SOURCE]));
    await store.store(pattern('observed', [OBSERVED_HOOK_EDIT_SOURCE], { qualityScore: 0.4 }));
  });
  afterEach(async () => {
    await store.dispose();
    sqlite.close();
    resetRuVectorFeatureFlags();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([['code intelligence workflow'], ['']])('query %j returns only the observed pattern', async (query) => {
    const result = await store.search(query, { limit: 10 });
    expect(result.success).toBe(true);
    expect(result.success ? result.value.map((r) => r.pattern.id) : []).toEqual(['observed']);
    // the rows are still stored
    expect(sqlite.getPattern('legacy-edit')?.tier).toBe('long-term');
  });
});

describe('RealQEReasoningBank.searchQEPatterns (the MCP task_orchestrate hint path) (#1501)', () => {
  let dir: string;
  let sqlite: SQLitePatternStore;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1501-rq-'));
    sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(dir, 'p.db') });
    await sqlite.initialize();
    sqlite.storePattern(pattern('legacy-edit', [LEGACY_HOOK_EDIT_SOURCE]));
    sqlite.storePattern(pattern('observed', [OBSERVED_HOOK_EDIT_SOURCE]));
  });
  afterEach(() => {
    sqlite.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The bank's search over a real SQLite store; HNSW is a stub returning both patterns. */
  const bank = (vector: boolean) => Object.assign(Object.create(RealQEReasoningBank.prototype), {
    sqliteStore: sqlite,
    embedOrUndefined: async () => (vector ? [1, 0, 0] : undefined),
    hnswIndex: { searchKnn: () => ({ neighbors: [0, 1], distances: [0.05, 0.05] }) },
    patternIdMap: new Map([[0, 'legacy-edit'], [1, 'observed']]),
  }) as RealQEReasoningBank;

  it.each([['vector + lexical', true], ['lexical only', false]])('%s: leaves the legacy pattern out', async (_l, vector) => {
    const result = await bank(vector).searchQEPatterns('code intelligence workflow', { limit: 10 });
    expect(result.success).toBe(true);
    expect(result.success ? result.value.map((r) => r.pattern.id) : []).toEqual(['observed']);
  });
});

describe('post-command test_outcomes (#1501)', () => {
  it('ignores legacy cli-hook-post-command rows, keeps observed ones', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test_outcomes (id TEXT, generated_by TEXT, domain TEXT, passed INTEGER)`);
    db.prepare(`INSERT INTO test_outcomes VALUES ('l', ?, 'test-execution', 1), ('o', ?, 'test-execution', 0),
      ('g', 'qe-test-generation', 'test-generation', 1), ('x', 'other', 'test-execution', 1)`)
      .run(LEGACY_HOOK_COMMAND_SOURCE, OBSERVED_HOOK_COMMAND_SOURCE);
    expect(db.prepare(`SELECT id FROM test_outcomes WHERE ${EXECUTED_TEST_OUTCOME_SQL} ORDER BY id`).all())
      .toEqual([{ id: 'o' }, { id: 'x' }]);
    expect(isExecutedTestOutcome({ generatedBy: LEGACY_HOOK_COMMAND_SOURCE, domain: 'test-execution' })).toBe(false);
    expect(isExecutedTestOutcome({ generatedBy: OBSERVED_HOOK_COMMAND_SOURCE, domain: 'test-execution' })).toBe(true);
    db.close();
  });
});
