/**
 * Sync Embedding Generator
 * Cloud Sync Plan Phase 3: Generate embeddings for patterns
 *
 * Generates embeddings for patterns before cloud sync to enable
 * vector similarity search in ruvector-postgres.
 */

import { EmbeddingGenerator } from '../../integrations/embeddings/base/EmbeddingGenerator.js';
import type { IEmbedding } from '../../integrations/embeddings/base/types.js';
import { SQLiteReader } from '../readers/sqlite-reader.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { validateTableName } from '../../shared/sql-safety.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { safeJsonParse } from '../../shared/safe-json.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Pattern record from database
 */
export interface PatternRecord {
  id: string;
  pattern?: string;
  content?: string;
  type?: string;
  domain?: string;
  confidence?: number;
  embedding?: string | number[];
  created_at?: number;
}

/**
 * Embedding result with metadata
 */
export interface PatternEmbeddingResult {
  id: string;
  embedding: number[];
  text: string;
  dimension: number;
  generatedAt: Date;
}

/**
 * Batch processing stats
 */
export interface EmbeddingBatchStats {
  totalPatterns: number;
  patternsWithEmbeddings: number;
  patternsGenerated: number;
  patternsSkipped: number;
  errors: string[];
  durationMs: number;
}

/**
 * Sync Embedding Generator
 *
 * Generates 384-dimensional embeddings for patterns using
 * the all-MiniLM-L6-v2 model via @xenova/transformers.
 */
export class SyncEmbeddingGenerator {
  private generator: EmbeddingGenerator;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(dbPath?: string) {
    // Default to root database
    this.dbPath = dbPath || resolve(__dirname, '../../../../.agentic-qe/memory.db');
    this.generator = new EmbeddingGenerator({
      model: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384,
      cacheEnabled: true,
      onnxEnabled: true,
    });
  }

  /**
   * Initialize the embedding generator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.generator.initialize();
    this.initialized = true;
    console.log('[SyncEmbedding] Model initialized');
  }

  /**
   * Generate embedding for a single pattern
   */
  async generateForPattern(pattern: PatternRecord): Promise<PatternEmbeddingResult> {
    await this.initialize();

    // Extract text content from pattern
    const text = this.extractText(pattern);

    // Generate embedding (use 'text' namespace as 'patterns' is not in EmbeddingNamespace)
    const embedding: IEmbedding = await this.generator.embed(text, {
      namespace: 'text',
    });

    return {
      id: pattern.id,
      embedding: Array.isArray(embedding.vector)
        ? embedding.vector
        : Array.from(embedding.vector as Float32Array),
      text,
      dimension: embedding.dimension,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate embeddings for all patterns without embeddings
   */
  async generateForAllPatterns(
    tableName: string = 'patterns',
    options: { force?: boolean; batchSize?: number; verbose?: boolean } = {}
  ): Promise<EmbeddingBatchStats> {
    const startTime = Date.now();
    const stats: EmbeddingBatchStats = {
      totalPatterns: 0,
      patternsWithEmbeddings: 0,
      patternsGenerated: 0,
      patternsSkipped: 0,
      errors: [],
      durationMs: 0,
    };

    await this.initialize();

    // Open database
    const db = new Database(this.dbPath, { readonly: false });

    try {
      // Check if embedding column exists
      const columns = db.prepare(`PRAGMA table_info(${validateTableName(tableName)})`).all() as { name: string }[];
      const hasEmbeddingColumn = columns.some((col) => col.name === 'embedding');

      if (!hasEmbeddingColumn) {
        // Add embedding column
        db.prepare(`ALTER TABLE ${validateTableName(tableName)} ADD COLUMN embedding TEXT`).run();
        console.log(`[SyncEmbedding] Added embedding column to ${tableName}`);
      }

      // Get patterns
      const validTable = validateTableName(tableName);
      const query = options.force
        ? `SELECT * FROM ${validTable}`
        : `SELECT * FROM ${validTable} WHERE embedding IS NULL OR embedding = ''`;

      const patterns = db.prepare(query).all() as PatternRecord[];
      stats.totalPatterns = patterns.length;

      if (options.verbose) {
        console.log(`[SyncEmbedding] Processing ${patterns.length} patterns from ${tableName}`);
      }

      // Count existing embeddings
      const existingCount = db
        .prepare(`SELECT COUNT(*) as count FROM ${validTable} WHERE embedding IS NOT NULL AND embedding != ''`)
        .get() as { count: number };
      stats.patternsWithEmbeddings = existingCount.count;

      // Prepare update statement
      const updateStmt = db.prepare(`UPDATE ${validTable} SET embedding = ? WHERE id = ?`);

      // Process in batches
      const batchSize = options.batchSize || 50;
      for (let i = 0; i < patterns.length; i += batchSize) {
        const batch = patterns.slice(i, Math.min(i + batchSize, patterns.length));

        for (const pattern of batch) {
          try {
            const result = await this.generateForPattern(pattern);

            // Store as JSON array string
            const embeddingJson = JSON.stringify(result.embedding);
            updateStmt.run(embeddingJson, pattern.id);
            stats.patternsGenerated++;

            if (options.verbose && stats.patternsGenerated % 10 === 0) {
              console.log(`[SyncEmbedding] Generated ${stats.patternsGenerated}/${patterns.length}`);
            }
          } catch (error) {
            const errorMsg = toErrorMessage(error);
            stats.errors.push(`Pattern ${pattern.id}: ${errorMsg}`);
            stats.patternsSkipped++;
          }
        }
      }

      stats.durationMs = Date.now() - startTime;

      if (options.verbose) {
        console.log(`[SyncEmbedding] Completed: ${stats.patternsGenerated} generated, ${stats.patternsSkipped} skipped`);
        console.log(`[SyncEmbedding] Duration: ${stats.durationMs}ms`);
      }

      return stats;
    } finally {
      db.close();
    }
  }

  /**
   * Search for similar patterns using vector similarity
   */
  async findSimilarPatterns(
    query: string,
    options: { limit?: number; threshold?: number; tableName?: string } = {}
  ): Promise<Array<{ pattern: PatternRecord; similarity: number }>> {
    await this.initialize();

    const limit = options.limit || 10;
    const threshold = options.threshold || 0.5;
    const tableName = options.tableName || 'patterns';

    // Generate query embedding
    const queryEmbedding = await this.generator.embed(query, { namespace: 'text' });
    const queryVector = Array.isArray(queryEmbedding.vector)
      ? queryEmbedding.vector
      : Array.from(queryEmbedding.vector as Float32Array);

    // Get all patterns with embeddings
    const db = new Database(this.dbPath, { readonly: true });

    try {
      const patterns = db
        .prepare(`SELECT * FROM ${validateTableName(tableName)} WHERE embedding IS NOT NULL AND embedding != ''`)
        .all() as PatternRecord[];

      // Calculate similarities
      const results: Array<{ pattern: PatternRecord; similarity: number }> = [];

      for (const pattern of patterns) {
        try {
          const patternVector = typeof pattern.embedding === 'string'
            ? safeJsonParse<number[]>(pattern.embedding)
            : pattern.embedding;

          if (Array.isArray(patternVector) && patternVector.length === queryVector.length) {
            const similarity = this.cosineSimilarity(queryVector, patternVector);
            if (similarity >= threshold) {
              results.push({ pattern, similarity });
            }
          }
        } catch {
          // Skip patterns with invalid embeddings
        }
      }

      // Sort by similarity and limit
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } finally {
      db.close();
    }
  }

  /**
   * Extract text content from pattern for embedding
   */
  private extractText(pattern: PatternRecord): string {
    const parts: string[] = [];

    if (pattern.pattern) {
      parts.push(pattern.pattern);
    }

    if (pattern.content) {
      // Handle JSON content
      try {
        const content = typeof pattern.content === 'string'
          ? safeJsonParse(pattern.content)
          : pattern.content;

        if (typeof content === 'object') {
          // Extract key fields
          if (content.description) parts.push(content.description);
          if (content.name) parts.push(content.name);
          if (content.summary) parts.push(content.summary);
          if (content.text) parts.push(content.text);
        } else if (typeof content === 'string') {
          parts.push(content);
        }
      } catch {
        // Not JSON, use as-is
        parts.push(String(pattern.content));
      }
    }

    if (pattern.type) {
      parts.push(`type:${pattern.type}`);
    }

    if (pattern.domain) {
      parts.push(`domain:${pattern.domain}`);
    }

    // Combine and truncate to model's max length
    const text = parts.join(' ').trim();
    return text.substring(0, 512);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get embedding statistics
   */
  getStats() {
    return this.generator.getStats();
  }

  /**
   * Clear resources
   */
  async clear(): Promise<void> {
    await this.generator.clear();
    this.initialized = false;
  }
}

/**
 * Create a sync embedding generator
 */
export function createSyncEmbeddingGenerator(dbPath?: string): SyncEmbeddingGenerator {
  return new SyncEmbeddingGenerator(dbPath);
}
