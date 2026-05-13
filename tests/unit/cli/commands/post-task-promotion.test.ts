/**
 * Regression: issue #455
 *
 * The post-task bridge loop updates qe_patterns.{usage_count, successful_uses,
 * success_rate, quality_score} for real pattern UUIDs but never promoted
 * short-term → long-term. recordOutcome() runs with a synthetic
 * `task:agent:taskId` patternId that never matches qe_patterns.id, so
 * checkPatternPromotionWithCoherence() was skipped for the real UUIDs.
 *
 * Patterns with successful_uses ≥ 3, success_rate ≥ 0.7, confidence ≥ 0.6
 * accumulated forever at tier='short-term'. This test seeds a row one
 * success-away from the promotion threshold and asserts the bridge loop
 * flips its tier to 'long-term' after a successful post-task invocation.
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

import Database from 'better-sqlite3';
import { persistTaskOutcome } from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';

describe('post-task bridge loop promotes patterns (#455)', () => {
  let tmpDir: string;
  let db: Database.Database;

  const createSchema = (database: Database.Database): void => {
    database.exec(`
      CREATE TABLE captured_experiences (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        agent TEXT,
        domain TEXT,
        success INTEGER,
        quality REAL,
        duration_ms INTEGER,
        model_tier TEXT,
        started_at TEXT,
        completed_at TEXT,
        source TEXT,
        consolidated_into TEXT
      );
      CREATE TABLE experience_applications (
        id TEXT PRIMARY KEY,
        experience_id TEXT,
        task TEXT,
        success INTEGER,
        tokens_saved INTEGER,
        feedback TEXT,
        applied_at TEXT
      );
      CREATE TABLE qe_trajectories (
        id TEXT PRIMARY KEY,
        task TEXT,
        agent TEXT,
        domain TEXT,
        started_at TEXT,
        ended_at TEXT,
        success INTEGER,
        steps_json TEXT
      );
      CREATE TABLE qe_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT,
        qe_domain TEXT,
        domain TEXT,
        name TEXT,
        description TEXT,
        confidence REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0,
        successful_uses INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0.0,
        quality_score REAL DEFAULT 0.0,
        tier TEXT DEFAULT 'short-term',
        last_used_at TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE kv_store (
        key TEXT,
        namespace TEXT,
        value TEXT,
        expires_at INTEGER,
        created_at INTEGER,
        PRIMARY KEY (namespace, key)
      );
      CREATE TABLE dream_insights (
        id TEXT PRIMARY KEY,
        applied INTEGER DEFAULT 0,
        actionable INTEGER DEFAULT 0,
        created_at TEXT
      );
    `);
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-promotion-'));
    db = new Database(path.join(tmpDir, 'unified.db'));
    createSchema(db);

    fakeUnifiedMemoryFactory.mockReturnValue({
      isInitialized: () => true,
      initialize: async () => undefined,
      getDatabase: () => db,
    });
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const seedBridge = (patternId: string): void => {
    db.prepare(`
      INSERT INTO kv_store (key, namespace, value, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'task:abc',
      'task-bridge',
      JSON.stringify({
        selectedPatternIds: [patternId],
        agent: 'qe-test-architect',
        description: 'd',
        taskType: 'test-generation',
        priority: 'normal',
        domain: 'general',
        complexityBucket: 3,
        estimatedTokenSavings: 0,
        ts: Date.now(),
      }),
      Date.now() + 600_000,
      Date.now(),
    );
  };

  it('promotes a short-term pattern to long-term when thresholds are met', async () => {
    // Seed a pattern one success away from promotion. After bridge update:
    //   usage_count: 2 → 3
    //   successful_uses: 2 → 3 (PROMOTION_THRESHOLD)
    //   success_rate: 2/2=1.0 → 3/3=1.0 (≥ 0.7)
    //   confidence: 0.7 (≥ 0.6)
    db.prepare(`
      INSERT INTO qe_patterns
        (id, pattern_type, qe_domain, domain, name,
         confidence, usage_count, successful_uses, success_rate, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'pat-ready',
      'test-template',
      'test-generation',
      'test-generation',
      'Ready Pattern',
      0.7,
      2,
      2,
      1.0,
      'short-term',
    );
    seedBridge('pat-ready');

    await persistTaskOutcome({
      taskId: 'hook-test',
      agent: 'qe-test-architect',
      success: true,
    });

    const row = db
      .prepare(`SELECT tier, successful_uses, success_rate, confidence FROM qe_patterns WHERE id = ?`)
      .get('pat-ready') as { tier: string; successful_uses: number; success_rate: number; confidence: number };

    expect(row.successful_uses).toBe(3);
    expect(row.success_rate).toBeCloseTo(1.0, 5);
    expect(row.tier).toBe('long-term');
  });

  it('does NOT promote when success_rate is below threshold', async () => {
    db.prepare(`
      INSERT INTO qe_patterns
        (id, pattern_type, qe_domain, domain, name,
         confidence, usage_count, successful_uses, success_rate, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'pat-low-success',
      'test-template',
      'test-generation',
      'test-generation',
      'Low Success Pattern',
      0.7,
      5, // usage_count = 5
      3, // successful_uses = 3 (meets threshold)
      0.6, // success_rate = 0.6 (BELOW 0.7 threshold)
      'short-term',
    );
    seedBridge('pat-low-success');

    await persistTaskOutcome({
      taskId: 'hook-test',
      agent: 'qe-test-architect',
      success: false, // failure — drops success_rate further
    });

    const row = db
      .prepare(`SELECT tier FROM qe_patterns WHERE id = ?`)
      .get('pat-low-success') as { tier: string };
    expect(row.tier).toBe('short-term');
  });

  it('does NOT promote when confidence is below threshold', async () => {
    db.prepare(`
      INSERT INTO qe_patterns
        (id, pattern_type, qe_domain, domain, name,
         confidence, usage_count, successful_uses, success_rate, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'pat-low-conf',
      'test-template',
      'test-generation',
      'test-generation',
      'Low Conf Pattern',
      0.4, // confidence BELOW 0.6 threshold
      2,
      2,
      1.0,
      'short-term',
    );
    seedBridge('pat-low-conf');

    await persistTaskOutcome({
      taskId: 'hook-test',
      agent: 'qe-test-architect',
      success: true,
    });

    const row = db
      .prepare(`SELECT tier FROM qe_patterns WHERE id = ?`)
      .get('pat-low-conf') as { tier: string };
    expect(row.tier).toBe('short-term');
  });

  it('leaves already-long-term rows untouched (idempotent)', async () => {
    db.prepare(`
      INSERT INTO qe_patterns
        (id, pattern_type, qe_domain, domain, name,
         confidence, usage_count, successful_uses, success_rate, tier, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'pat-already-long',
      'test-template',
      'test-generation',
      'test-generation',
      'Already Long Pattern',
      0.9,
      10,
      9,
      0.9,
      'long-term',
      '2026-01-01 00:00:00',
    );
    seedBridge('pat-already-long');

    await persistTaskOutcome({
      taskId: 'hook-test',
      agent: 'qe-test-architect',
      success: true,
    });

    const row = db
      .prepare(`SELECT tier FROM qe_patterns WHERE id = ?`)
      .get('pat-already-long') as { tier: string };
    expect(row.tier).toBe('long-term');
  });
});
