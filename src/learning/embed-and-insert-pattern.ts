/**
 * Pattern embedding helper — unifies the 3 memory.db `qe_patterns` writers
 * per ADR-058 (embedding-locality).
 *
 * Three live writers in our codebase write to `qe_patterns`:
 *
 *   1. learning/sqlite-persistence.ts:497    SQLitePatternStore.storePattern (canonical)
 *   2. cli/commands/hooks-handlers/hooks-dream-learning.ts                  (consolidateAgentPatterns)
 *   3. workers/workers/learning-consolidation.ts                             (createPatternsFromCandidates)
 *
 * Only the canonical writer pairs the row with a `qe_pattern_embeddings` row
 * via `computeRealEmbedding(text, qeConfig.embeddings)`. Writers 2 & 3
 * historically bypassed embedding generation, producing "ghost" patterns that
 * loaded with no vectors and stayed invisible to HNSW pattern recall.
 *
 * This helper provides the embedding side so any caller can compute and persist
 * the embedding adjacent to its existing INSERT INTO qe_patterns. It is
 * fail-soft (errors are logged at debug level and swallowed) — pattern row
 * persistence must not regress when embedding computation fails.
 */

import type Database from 'better-sqlite3';
import {
  computeRealEmbedding,
  DEFAULT_EMBEDDING_CONFIG,
  getActiveEmbeddingSpaceIdentity,
  type EmbeddingConfig,
} from './real-embeddings.js';

/**
 * Compute an embedding for a pattern (`name + description + tags`) and persist
 * it to `qe_pattern_embeddings`. Caller is responsible for the matching
 * `qe_patterns` row.
 *
 * @param db          - better-sqlite3 database handle (typically from UnifiedMemoryManager.getDatabase())
 * @param patternId   - id of the pattern row this embedding belongs to
 * @param name        - pattern name (the most semantic component)
 * @param description - pattern description (optional)
 * @param tags        - pattern tags (optional)
 * @param config      - override embedding model/cache config (defaults to Xenova/all-MiniLM-L6-v2)
 */
export async function ensurePatternEmbedding(
  db: Database.Database,
  patternId: string,
  name: string,
  description: string | undefined | null,
  tags: string[] | undefined | null,
  config: Partial<EmbeddingConfig> = {},
): Promise<void> {
  try {
    const text = `${name ?? ''} ${description ?? ''} ${(tags ?? []).join(' ')}`.trim();
    if (!text) return;

    const embedding = await computeRealEmbedding(text, config);
    if (!embedding || embedding.length === 0) return;

    const buffer = Buffer.from(new Float32Array(embedding).buffer);
    const fullConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
    const spaceId = getActiveEmbeddingSpaceIdentity()?.spaceId;
    if (!spaceId) throw new Error('VECTOR_SPACE_UNVERIFIED: embedder has no runtime provenance');

    db.prepare(
      `INSERT OR REPLACE INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model, space_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(patternId, buffer, embedding.length, fullConfig.modelName, spaceId);
  } catch (error) {
    // Non-fatal: pattern row already persisted; embedding can be backfilled later.
    console.debug(
      '[ensurePatternEmbedding] non-fatal:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
