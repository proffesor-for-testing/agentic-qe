import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const embeddingMocks = vi.hoisted(() => ({
  computeBatchEmbeddings: vi.fn().mockRejectedValue(new Error('optional model unavailable')),
  activeSpace: { spaceId: 'active-space' },
}));

vi.mock('../../../src/learning/real-embeddings.js', () => ({
  computeBatchEmbeddings: (...args: unknown[]) => embeddingMocks.computeBatchEmbeddings(...args),
  getEmbeddingDimension: () => 384,
  isUsingEndpoint: () => false,
  getActiveEmbeddingSpaceIdentity: () => embeddingMocks.activeSpace,
}));

import { SQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';

describe('SQLite pattern embedding backfill (#584)', () => {
  let tempDir: string | undefined;
  let store: SQLitePatternStore | undefined;

  afterEach(() => {
    store?.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail without writing hash proxies when semantic embedding is unavailable', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-pattern-backfill-'));
    store = new SQLitePatternStore({
      useUnified: false,
      dbPath: path.join(tempDir, 'memory.db'),
    });
    await store.initialize();
    store.exec(`
      INSERT INTO qe_patterns (
        id, pattern_type, qe_domain, domain, name, description, template_json,
        context_json, confidence, usage_count, successful_uses,
        success_rate, quality_score, tier, created_at, updated_at
      ) VALUES (
        'pattern-without-vector', 'unit', 'test-generation', 'test-generation',
        'AAA pattern', 'Arrange Act Assert', '{}', '{}', 0.8, 0, 0, 0, 0.8,
        'short-term', datetime('now'), datetime('now')
      )
    `);

    await expect(store.backfillEmbeddings()).rejects.toThrow('optional model unavailable');
  });

  it('re-embeds legacy and mismatched rows under the active space', async () => {
    embeddingMocks.computeBatchEmbeddings
      .mockReset()
      .mockResolvedValueOnce([new Array(384).fill(0.1)])
      .mockResolvedValueOnce([
        new Array(384).fill(0.2),
        new Array(384).fill(0.3),
      ]);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-pattern-backfill-'));
    store = new SQLitePatternStore({
      useUnified: false,
      dbPath: path.join(tempDir, 'memory.db'),
    });
    await store.initialize();
    for (const id of ['legacy', 'mismatched']) {
      store.exec(`
        INSERT INTO qe_patterns (
          id, pattern_type, qe_domain, domain, name, description, template_json,
          context_json, confidence, usage_count, successful_uses,
          success_rate, quality_score, tier, created_at, updated_at
        ) VALUES (
          '${id}', 'unit', 'test-generation', 'test-generation', '${id}', '${id}',
          '{}', '{}', 0.8, 0, 0, 0, 0.8, 'short-term', datetime('now'), datetime('now')
        );
      `);
      store.storePatternEmbedding(id, new Array(384).fill(0), id === 'legacy' ? 'old-space' : 'other-space');
    }
    store.exec("UPDATE qe_pattern_embeddings SET space_id = NULL WHERE pattern_id = 'legacy'");

    await expect(store.backfillEmbeddings()).resolves.toMatchObject({ processed: 2 });
    expect(store.getEmbeddingSpaceDiagnostics('active-space')).toMatchObject({
      status: 'healthy',
      verifiedVectors: 2,
      unverifiedVectors: 0,
      mismatchedVectors: 0,
    });
  });
});
  beforeEach(() => {
    embeddingMocks.computeBatchEmbeddings
      .mockReset()
      .mockRejectedValue(new Error('optional model unavailable'));
  });
