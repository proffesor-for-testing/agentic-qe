/**
 * ADR-121 provenance gate wired into PatternLifecycleManager.
 *
 * A pattern with excellent metrics must still NOT promote unless its evidence
 * tier is strong enough (oracle:test-exec, or judge:llm under an explicit budget
 * flag). This closes the "a structural guess is promoted like a proof" class.
 * Also verifies the additive migration backfills legacy rows conservatively.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PatternLifecycleManager } from '../../../src/learning/pattern-lifecycle.js';

// Deliberately the OLD schema — no provenance_tier, no promotion_date — so the
// manager's ensureSchema migration is exercised on construction.
const OLD_SCHEMA = `
  CREATE TABLE IF NOT EXISTS qe_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    qe_domain TEXT NOT NULL,
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    confidence REAL DEFAULT 0.5,
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    quality_score REAL DEFAULT 0.0,
    tier TEXT DEFAULT 'short-term',
    template_json TEXT,
    context_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT,
    successful_uses INTEGER DEFAULT 0
  );
`;

function nowIso(offsetDays = 0): string {
  const ms = Date.now() - offsetDays * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

/** Seed a pattern whose metrics comfortably clear every non-tier threshold. */
function seedPromotable(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO qe_patterns
       (id, pattern_type, qe_domain, domain, name, confidence, usage_count,
        success_rate, quality_score, tier, created_at, last_used_at, successful_uses)
     VALUES (?, 'test', 'test-generation', 'core', ?, 0.9, 50,
             0.95, 0.95, 'short-term', ?, ?, 48)`,
  ).run(id, id, nowIso(2), nowIso(0));
}

function setTier(db: Database.Database, id: string, tier: string): void {
  db.prepare(`UPDATE qe_patterns SET provenance_tier = ? WHERE id = ?`).run(tier, id);
}

describe('PatternLifecycleManager — ADR-121 provenance gate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(OLD_SCHEMA);
  });

  afterEach(() => db.close());

  it('should_add_provenance_tier_column_and_backfill_legacy_rows_as_proxy', () => {
    // Arrange: a legacy row exists BEFORE the manager migrates the schema.
    db.prepare(
      `INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name)
       VALUES ('legacy', 'test', 'test-generation', 'core', 'legacy')`,
    ).run();

    // Act: constructing the manager runs the additive migration.
    new PatternLifecycleManager(db);

    // Assert: the legacy row is conservatively backfilled, never over-credited.
    const row = db.prepare(`SELECT provenance_tier FROM qe_patterns WHERE id = 'legacy'`)
      .get() as { provenance_tier: string };
    expect(row.provenance_tier).toBe('proxy:structural');
  });

  it('should_NOT_promote_a_metrically_perfect_pattern_when_tier_is_proxy', () => {
    // Arrange: perfect metrics, but default (proxy) tier after migration.
    const mgr = new PatternLifecycleManager(db);
    seedPromotable(db, 'p1'); // inherits the proxy:structural column default

    // Act
    const check = mgr.checkPromotion('p1');

    // Assert: every metric threshold is met, but the tier gate blocks promotion.
    expect(check.meetsRewardThreshold).toBe(true);
    expect(check.meetsOccurrenceThreshold).toBe(true);
    expect(check.meetsSuccessRateThreshold).toBe(true);
    expect(check.meetsProvenanceTier).toBe(false);
    expect(check.shouldPromote).toBe(false);
    expect(mgr.promotePattern('p1')).toBe(false);
  });

  it('should_promote_when_tier_is_oracle_test_exec', () => {
    // Arrange
    const mgr = new PatternLifecycleManager(db);
    seedPromotable(db, 'p2');
    setTier(db, 'p2', 'oracle:test-exec');

    // Act
    const check = mgr.checkPromotion('p2');

    // Assert
    expect(check.meetsProvenanceTier).toBe(true);
    expect(check.shouldPromote).toBe(true);
    expect(mgr.promotePattern('p2')).toBe(true);
  });

  it('should_NOT_promote_judge_tier_by_default_but_SHOULD_under_explicit_budget', () => {
    // Arrange: two managers differing only in the budget flag. Construct the
    // default one first so the provenance_tier migration runs before setTier.
    const defaultMgr = new PatternLifecycleManager(db);
    const budgetMgr = new PatternLifecycleManager(db, { allowJudgeTierPromotion: true });
    seedPromotable(db, 'p3');
    setTier(db, 'p3', 'judge:llm');

    // Act + Assert
    expect(defaultMgr.checkPromotion('p3').shouldPromote).toBe(false);
    expect(budgetMgr.checkPromotion('p3').shouldPromote).toBe(true);
  });
});
