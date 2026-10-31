/**
 * Regression: seedCrossDomainPatterns() must be idempotent (issue #1325).
 *
 * QEReasoningBank.initialize() seeds cross-domain transfers only while the KV
 * flag `reasoning-bank:cross-domain-seeded` is missing. The flag lives in the
 * KV backend, the patterns live in the unified SQLite DB. When the flag is lost
 * but the DB keeps its patterns, every initialize re-seeded: it re-transferred
 * patterns that were already transferred and transferred the transferred copies
 * again ("X (from a) (from b)"), so the DB grew on every session.
 *
 * This test uses a real SQLite file (own AQE_PROJECT_ROOT), seeds, drops the
 * flag, seeds again, and checks the DB rows directly.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';
import { createQEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import { InMemoryBackend } from '../../../src/kernel/memory-backend.js';
import { InMemoryEventBus } from '../../../src/kernel/event-bus.js';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import { seedCrossDomainPatterns } from '../../../src/learning/pattern-promotion.js';

const SEED_FLAG_KEY = 'reasoning-bank:cross-domain-seeded';

interface DbSnapshot {
  total: number;
  transferred: number;
  duplicateNames: number;
  transferOfTransfer: number;
}

function snapshot(dbPath: string): DbSnapshot {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const one = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
    return {
      total: one('SELECT COUNT(*) AS n FROM qe_patterns'),
      transferred: one(
        `SELECT COUNT(*) AS n FROM qe_patterns WHERE context_json LIKE '%"cross-domain-transfer"%'`,
      ),
      duplicateNames: one(
        `SELECT COUNT(*) AS n FROM (SELECT qe_domain, name FROM qe_patterns
           GROUP BY qe_domain, name HAVING COUNT(*) > 1)`,
      ),
      transferOfTransfer: one(
        `SELECT COUNT(*) AS n FROM qe_patterns WHERE name LIKE '%(from %(from %'`,
      ),
    };
  } finally {
    db.close();
  }
}

describe.each([
  { store: 'PatternStore', useRVFPatternStore: false },
  { store: 'RvfPatternStore', useRVFPatternStore: true },
])('seedCrossDomainPatterns idempotency (#1325) with $store', ({ useRVFPatternStore }) => {
  const previousRoot = process.env.AQE_PROJECT_ROOT;
  let root: string;
  let dbPath: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1325-'));
    process.env.AQE_PROJECT_ROOT = root;
    dbPath = path.join(root, '.agentic-qe', 'memory.db');
    resetUnifiedMemory();
    setRuVectorFeatureFlags({ useRVFPatternStore });
  });

  afterAll(() => {
    resetUnifiedMemory();
    resetRuVectorFeatureFlags();
    if (previousRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not re-transfer or chain transfers when the seed flag is lost', async () => {
    const memory = new InMemoryBackend();
    await memory.initialize();
    const eventBus = new InMemoryEventBus();

    // Run 1: fresh DB, flag missing -> seeds.
    const bank1 = createQEReasoningBank(memory, eventBus);
    await bank1.initialize();
    expect(await memory.get(SEED_FLAG_KEY)).toBe(true);
    const afterFirst = snapshot(dbPath);
    expect(afterFirst.transferred).toBeGreaterThan(0);
    expect(afterFirst.transferOfTransfer).toBe(0);
    await bank1.dispose();

    // Flag lost, DB kept (the #1318 memory.clear() scenario).
    await memory.clear();
    expect(await memory.get(SEED_FLAG_KEY)).toBeUndefined();

    // Run 2: initialize re-seeds against the populated DB.
    const bank2 = createQEReasoningBank(memory, eventBus);
    await bank2.initialize();
    expect(await memory.get(SEED_FLAG_KEY)).toBe(true);

    // Run 3: call the seeding entry point directly, on the same store.
    const third = await bank2.seedCrossDomainPatterns();
    expect(third.transferred).toBe(0);
    await bank2.dispose();

    const afterRepeat = snapshot(dbPath);
    expect(afterRepeat.transferOfTransfer).toBe(0);
    expect(afterRepeat.duplicateNames).toBe(0);
    expect(afterRepeat.transferred).toBe(afterFirst.transferred);
    expect(afterRepeat.total).toBe(afterFirst.total);
  }, 120_000);

  it('transfers a newly learned original pattern once, then stays idempotent', async () => {
    const memory = new InMemoryBackend();
    await memory.initialize();
    await memory.set(SEED_FLAG_KEY, true); // initialize() must not seed here
    const bank = createQEReasoningBank(memory, new InMemoryEventBus());
    await bank.initialize();

    const name = 'issue-1325 newly learned original';
    const stored = await bank.storePattern({
      patternType: 'test-template',
      qeDomain: 'test-generation',
      name,
      description: 'Original pattern learned after the first seed',
      template: { type: 'code', content: 'it("works", () => {})', variables: [] },
      context: { tags: ['issue-1325'], testType: 'unit' },
    });
    expect(stored.success).toBe(true);

    const first = await bank.seedCrossDomainPatterns();
    const afterFirst = snapshot(dbPath);
    const second = await bank.seedCrossDomainPatterns();
    await bank.dispose();
    const afterSecond = snapshot(dbPath);

    expect(first.transferred).toBeGreaterThan(0);
    expect(second.transferred).toBe(0);
    expect(afterSecond.total).toBe(afterFirst.total);
    expect(afterSecond.duplicateNames).toBe(0);
    expect(afterSecond.transferOfTransfer).toBe(0);

    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const copies = db
        .prepare(`SELECT qe_domain, name FROM qe_patterns WHERE name = ?`)
        .all(`${name} (from test-generation)`) as Array<{ qe_domain: string }>;
      expect(copies.length).toBeGreaterThan(0);
      expect(new Set(copies.map((c) => c.qe_domain)).size).toBe(copies.length);
    } finally {
      db.close();
    }
  }, 120_000);
});

describe('seedCrossDomainPatterns when a target domain cannot be listed (#1325)', () => {
  it('skips that target instead of writing possible duplicates', async () => {
    const original = {
      id: 'p1',
      name: 'Original',
      description: 'd',
      patternType: 'test-template',
      qeDomain: 'defect-intelligence',
      confidence: 0.8,
      template: { type: 'code', content: 'x', variables: [] },
      context: { tags: [] },
    };
    const searchPatterns = vi.fn(async (_query: unknown, options?: Record<string, unknown>) => {
      if (options?.domain === 'defect-intelligence') {
        return { success: true as const, value: [{ pattern: original, score: 1 }] };
      }
      return { success: false as const, error: new Error('store unavailable') };
    });
    const storePattern = vi.fn(async (o: Record<string, unknown>) => ({ success: true as const, value: o }));
    const patternStore = {
      getStats: vi.fn(async () => ({
        byDomain: { 'defect-intelligence': 1, 'quality-assessment': 1, 'code-intelligence': 0 },
      })),
    };

    const result = await seedCrossDomainPatterns({
      searchPatterns: searchPatterns as never,
      storePattern: storePattern as never,
      patternStore: patternStore as never,
    });

    // quality-assessment cannot be listed -> skipped, never written to.
    expect(storePattern.mock.calls.some(([o]) => o.qeDomain === 'quality-assessment')).toBe(false);
    // code-intelligence is empty (no listing needed) -> receives the copy.
    expect(storePattern).toHaveBeenCalledWith(
      expect.objectContaining({ qeDomain: 'code-intelligence', name: 'Original (from defect-intelligence)' }),
    );
    expect(result.skipped).toBeGreaterThan(0);
  });
});
