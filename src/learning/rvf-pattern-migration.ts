/**
 * SQLite → RVF Pattern Migration Utility (ADR-066)
 *
 * Reads pattern embeddings from the SQLite qe_patterns/qe_pattern_embeddings
 * tables and ingests them into an RVF file. This is a one-time migration
 * that creates the .rvf file for the RvfPatternStore.
 *
 * Safety:
 * - Read-only on SQLite (never modifies memory.db)
 * - Creates a NEW .rvf file (never overwrites existing)
 * - Batch ingestion (500 vectors at a time) for memory efficiency
 *
 * @module learning/rvf-pattern-migration
 */

import type {
  RvfNativeAdapter,
} from '../integrations/ruvector/rvf-native-adapter.js';
import type { SQLitePatternStore } from './sqlite-persistence.js';

// ============================================================================
// Types
// ============================================================================

export interface MigrationResult {
  /** Total patterns successfully migrated */
  totalMigrated: number;
  /** Patterns skipped (no embedding or dimension mismatch) */
  totalSkipped: number;
  /** Errors encountered during ingestion */
  errors: string[];
  /** Migration duration in milliseconds */
  durationMs: number;
  /** Path to the created .rvf file */
  rvfPath: string;
}

export interface MigrationOptions {
  /** Batch size for ingestion (default: 500) */
  batchSize?: number;
  /** Expected embedding dimension (default: 384) */
  dimension?: number;
  /** Log progress every N patterns (default: 1000) */
  progressInterval?: number;
}

// ============================================================================
// Migration Function
// ============================================================================

/**
 * Migrate pattern embeddings from SQLite to an RVF file.
 *
 * This function is read-only on SQLite. It reads all embeddings from
 * the qe_pattern_embeddings table and ingests them into the provided
 * RVF adapter in batches.
 *
 * @param sqliteStore - Initialized SQLitePatternStore to read from
 * @param rvfAdapter - Initialized RvfNativeAdapter to write to
 * @param options - Migration options (batch size, dimension)
 * @returns Migration result with counts and timing
 */
export function migratePatterns(
  sqliteStore: SQLitePatternStore,
  rvfAdapter: RvfNativeAdapter,
  options: MigrationOptions = {},
): MigrationResult {
  const startTime = performance.now();
  const batchSize = options.batchSize ?? 500;
  const dimension = options.dimension ?? 384;
  const progressInterval = options.progressInterval ?? 1000;

  const result: MigrationResult = {
    totalMigrated: 0,
    totalSkipped: 0,
    errors: [],
    durationMs: 0,
    rvfPath: rvfAdapter.path(),
  };

  // Read all embeddings from SQLite
  let allEmbeddings: Array<{ patternId: string; embedding: number[] }>;
  try {
    allEmbeddings = sqliteStore.getAllEmbeddings();
  } catch (error) {
    result.errors.push(`Failed to read embeddings from SQLite: ${error}`);
    result.durationMs = performance.now() - startTime;
    return result;
  }

  console.log(
    `[RVF Migration] Found ${allEmbeddings.length} embeddings to migrate (dim=${dimension})`,
  );

  // Process in batches
  let batch: Array<{ id: string; vector: Float32Array }> = [];

  for (let i = 0; i < allEmbeddings.length; i++) {
    const { patternId, embedding } = allEmbeddings[i];

    // Skip if dimension doesn't match
    if (embedding.length !== dimension) {
      result.totalSkipped++;
      continue;
    }

    batch.push({
      id: patternId,
      vector: new Float32Array(embedding),
    });

    // Flush batch when full
    if (batch.length >= batchSize) {
      const batchResult = flushBatch(rvfAdapter, batch, result);
      if (!batchResult) break; // Fatal error
      batch = [];
    }

    // Progress logging
    if ((i + 1) % progressInterval === 0) {
      console.log(
        `[RVF Migration] Progress: ${i + 1}/${allEmbeddings.length} ` +
        `(migrated: ${result.totalMigrated}, skipped: ${result.totalSkipped})`,
      );
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    flushBatch(rvfAdapter, batch, result);
  }

  result.durationMs = performance.now() - startTime;

  console.log(
    `[RVF Migration] Complete: ${result.totalMigrated} migrated, ` +
    `${result.totalSkipped} skipped, ${result.errors.length} errors ` +
    `in ${result.durationMs.toFixed(0)}ms`,
  );

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function flushBatch(
  adapter: RvfNativeAdapter,
  batch: Array<{ id: string; vector: Float32Array }>,
  result: MigrationResult,
): boolean {
  try {
    const ingestResult = adapter.ingest(batch);
    result.totalMigrated += ingestResult.accepted;
    if (ingestResult.rejected > 0) {
      result.errors.push(
        `Batch rejected ${ingestResult.rejected} of ${batch.length} vectors`,
      );
    }
    return true;
  } catch (error) {
    result.errors.push(`Batch ingest failed: ${error}`);
    return false;
  }
}
