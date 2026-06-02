/**
 * EWC++ catastrophic-forgetting protection (#510 item 6).
 *
 * Confidence decay and stale-deprecation were uniform across all patterns, so a
 * proven high-success pattern was forgotten at the same rate as noise. These
 * tests verify that high-IMPORTANCE patterns (success_rate gated on usage)
 * resist decay and stale-deprecation, while:
 *   - low-importance patterns decay EXACTLY as before (no regression), and
 *   - a high-importance pattern that is FAILING is still deprecated (we blend
 *     retention, we don't permanently shield dead weight).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  PatternLifecycleManager,
  patternImportance,
  EWC_MIN_USAGE_FOR_PROTECTION,
  EWC_DECAY_PROTECTION,
} from '../../../src/learning/pattern-lifecycle.js';

const SCHEMA = `
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

interface SeedOpts {
  id: string;
  confidence: number;
  successRate: number;
  usageCount: number;
  daysSinceUse: number;
  consecutiveFailures?: number;
}

function isoDaysAgo(days: number): string {
  // SQLite datetime string in UTC.
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

describe('PatternLifecycleManager — EWC++ forgetting protection (#510 item 6)', () => {
  let db: Database.Database;
  let mgr: PatternLifecycleManager;

  function seed(o: SeedOpts): void {
    db.prepare(
      `INSERT INTO qe_patterns
        (id, pattern_type, qe_domain, domain, name, confidence, usage_count,
         success_rate, quality_score, tier, created_at, last_used_at, successful_uses,
         consecutive_failures)
       VALUES (?, 'test', 'test-generation', 'core', ?, ?, ?, ?, 0.8, 'long-term',
               ?, ?, ?, ?)`,
    ).run(
      o.id,
      o.id,
      o.confidence,
      o.usageCount,
      o.successRate,
      isoDaysAgo(o.daysSinceUse + 1),
      isoDaysAgo(o.daysSinceUse),
      Math.round(o.successRate * o.usageCount),
      o.consecutiveFailures ?? 0,
    );
  }

  function confidenceOf(id: string): number {
    return (db.prepare('SELECT confidence FROM qe_patterns WHERE id = ?').get(id) as { confidence: number }).confidence;
  }

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    // Manager ALTERs in consecutive_failures/deprecated_at/promotion_date as needed,
    // but we pre-add consecutive_failures so seed() can set it.
    db.exec(`ALTER TABLE qe_patterns ADD COLUMN consecutive_failures INTEGER DEFAULT 0`);
    mgr = new PatternLifecycleManager(db);
  });

  afterEach(() => db.close());

  describe('patternImportance proxy', () => {
    it('is 0 below the usage trust threshold', () => {
      expect(patternImportance(0.99, EWC_MIN_USAGE_FOR_PROTECTION - 1)).toBe(0);
    });
    it('equals clamped success rate once trusted', () => {
      expect(patternImportance(0.9, EWC_MIN_USAGE_FOR_PROTECTION)).toBeCloseTo(0.9);
      expect(patternImportance(1.5, 50)).toBe(1);
      expect(patternImportance(-1, 50)).toBe(0);
    });
  });

  describe('importance-weighted confidence decay', () => {
    // Patterns must be older than the decay window (strict `<` cutoff), so use
    // daysSinceUse=15 with a 10-day decay run.
    it('decays a low-importance pattern EXACTLY as the old uniform formula (no regression)', () => {
      seed({ id: 'noise', confidence: 0.8, successRate: 0.0, usageCount: 20, daysSinceUse: 15 });
      mgr.applyConfidenceDecay(10); // base decay amount = 0.01 * 10 = 0.1
      // old formula: 0.8 * (1 - 0.1) = 0.72
      expect(confidenceOf('noise')).toBeCloseTo(0.72, 6);
    });

    it('shields a high-importance pattern from decay', () => {
      seed({ id: 'proven', confidence: 0.8, successRate: 1.0, usageCount: 20, daysSinceUse: 15 });
      mgr.applyConfidenceDecay(10);
      // importance=1 => effective decay = 0.1 * (1 - 0.9) = 0.01 => 0.8 * 0.99 = 0.792
      expect(confidenceOf('proven')).toBeCloseTo(0.792, 6);
      // And it must be clearly higher than the unprotected case.
      expect(confidenceOf('proven')).toBeGreaterThan(0.72);
    });

    it('a usage-trusted pattern below the usage threshold gets no protection', () => {
      seed({ id: 'lucky', confidence: 0.8, successRate: 1.0, usageCount: EWC_MIN_USAGE_FOR_PROTECTION - 1, daysSinceUse: 15 });
      mgr.applyConfidenceDecay(10);
      expect(confidenceOf('lucky')).toBeCloseTo(0.72, 6); // decays like noise
    });

    it('uses the protection constant correctly (sanity on the shielded delta)', () => {
      seed({ id: 'p', confidence: 1.0, successRate: 1.0, usageCount: 20, daysSinceUse: 15 });
      mgr.applyConfidenceDecay(10);
      // 1.0 * (1 - 0.1*(1 - EWC_DECAY_PROTECTION))
      expect(confidenceOf('p')).toBeCloseTo(1 - 0.1 * (1 - EWC_DECAY_PROTECTION), 6);
    });
  });

  describe('importance-weighted stale-deprecation', () => {
    it('does NOT stale-deprecate a high-importance pattern just past the base window', () => {
      // base stale = 30d; proven pattern effective window = 30 * (1 + 1*2) = 90d.
      seed({ id: 'proven', confidence: 0.8, successRate: 0.95, usageCount: 20, daysSinceUse: 45 });
      const check = mgr.checkDeprecation('proven');
      expect(check.reason).not.toBe('stale');
      expect(check.shouldDeprecate).toBe(false);
    });

    it('still stale-deprecates a low-importance pattern past the base window', () => {
      seed({ id: 'noise', confidence: 0.8, successRate: 0.1, usageCount: 20, daysSinceUse: 45 });
      const check = mgr.checkDeprecation('noise');
      expect(check.shouldDeprecate).toBe(true);
      expect(check.reason).toBe('stale');
    });

    it('eventually stale-deprecates even a high-importance pattern past its extended window', () => {
      seed({ id: 'ancient', confidence: 0.8, successRate: 1.0, usageCount: 20, daysSinceUse: 120 });
      const check = mgr.checkDeprecation('ancient');
      expect(check.shouldDeprecate).toBe(true);
      expect(check.reason).toBe('stale');
    });
  });

  describe('protection does not shield dead weight', () => {
    // The stale/decay protection extends retention but is independent of the
    // low_confidence check, so a high-success pattern whose confidence has
    // collapsed below minActiveConfidence is still deprecated — we blend
    // retention, we don't permanently shield a pattern that became low-quality.
    it('still deprecates a high-importance pattern once its confidence collapses', () => {
      seed({ id: 'decayed', confidence: 0.2, successRate: 0.95, usageCount: 20, daysSinceUse: 10 });
      const check = mgr.checkDeprecation('decayed');
      expect(check.shouldDeprecate).toBe(true);
      expect(check.reason).toBe('low_confidence');
    });
  });
});
