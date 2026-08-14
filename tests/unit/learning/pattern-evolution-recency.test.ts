import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { memoryMock } = vi.hoisted(() => ({
  memoryMock: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getDatabase: vi.fn(),
  },
}));

vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: vi.fn(() => memoryMock),
}));

import { PatternEvolution } from '../../../src/integrations/agentic-flow/reasoning-bank/pattern-evolution.js';

describe('PatternEvolution merge recency', () => {
  let tempDir: string;
  let db: Database.Database;
  let evolution: PatternEvolution;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-pattern-evolution-'));
    db = new Database(path.join(tempDir, 'memory.db'));
    db.exec(`
      CREATE TABLE qe_patterns (
        id TEXT PRIMARY KEY, name TEXT, quality_score REAL, success_rate REAL,
        usage_count INTEGER, successful_uses INTEGER, last_used_at TEXT,
        updated_at TEXT, tier TEXT, qe_domain TEXT
      );
      CREATE TABLE qe_pattern_embeddings (
        pattern_id TEXT PRIMARY KEY, embedding BLOB, dimension INTEGER
      );
    `);
    memoryMock.getDatabase.mockReturnValue(db);
    evolution = new PatternEvolution();
    await evolution.initialize();
  });

  afterEach(async () => {
    await evolution.dispose();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('preserves the newest non-null last_used_at from both merged patterns', async () => {
    const insert = db.prepare(`
      INSERT INTO qe_patterns
        (id, name, quality_score, success_rate, usage_count, successful_uses,
         last_used_at, tier, qe_domain)
      VALUES (?, ?, ?, 1, 2, 2, ?, 'long-term', 'test-generation')
    `);
    insert.run('retained', 'retained', 0.9, '2026-07-01 00:00:00');
    insert.run('archived', 'archived', 0.8, '2026-08-01 00:00:00');

    await evolution.mergePatterns('retained', 'archived');

    const retained = db.prepare(
      `SELECT usage_count, last_used_at FROM qe_patterns WHERE id = 'retained'`,
    ).get() as { usage_count: number; last_used_at: string | null };
    expect(retained).toEqual({ usage_count: 4, last_used_at: '2026-08-01 00:00:00' });
  });
});
