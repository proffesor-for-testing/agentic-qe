import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { memoryMock } = vi.hoisted(() => ({
  memoryMock: { getDatabase: vi.fn() },
}));

vi.mock('../../../../src/kernel/unified-memory.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/kernel/unified-memory.js')>(),
  getUnifiedMemory: vi.fn(() => memoryMock),
}));
vi.mock('../../../../src/learning/embed-and-insert-pattern.js', () => ({
  ensurePatternEmbedding: vi.fn().mockResolvedValue(true),
}));

import { LearningConsolidationWorker } from '../../../../src/workers/workers/learning-consolidation.js';

describe('LearningConsolidationWorker pattern recency invariant', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-worker-consolidation-'));
    db = new Database(path.join(tempDir, 'memory.db'));
    db.exec(`
      CREATE TABLE qe_patterns (
        id TEXT PRIMARY KEY, pattern_type TEXT, qe_domain TEXT, domain TEXT,
        name TEXT, description TEXT, confidence REAL, usage_count INTEGER,
        success_rate REAL, quality_score REAL, tier TEXT, template_json TEXT,
        context_json TEXT, created_at TEXT, updated_at TEXT, last_used_at TEXT,
        successful_uses INTEGER
      )
    `);
    memoryMock.getDatabase.mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('stamps every inserted pattern that starts with usage_count above zero', async () => {
    const worker = new LearningConsolidationWorker();
    const createPatterns = Reflect.get(worker, 'createPatternsFromCandidates').bind(worker);

    const created = await createPatterns([{
      patternType: 'workflow',
      domain: 'test-generation',
      name: 'worker-consolidated',
      confidence: 0.8,
      successRate: 0.75,
      sourceExperiences: 4,
      avgReward: 0.75,
      templateContent: 'test workflow',
      actions: ['test'],
    }]);

    expect(created).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS count FROM qe_patterns').get() as { count: number }).count)
      .toBe(1);
    const invalid = db.prepare(
      'SELECT COUNT(*) AS count FROM qe_patterns WHERE usage_count > 0 AND last_used_at IS NULL',
    ).get() as { count: number };
    expect(invalid.count).toBe(0);
  });
});
