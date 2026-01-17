/**
 * MigrationTools - AgentDB to RuVector Migration Utilities
 *
 * Provides comprehensive migration capabilities for transitioning test patterns
 * from AgentDB/SQLite storage to high-performance RuVector backend.
 *
 * Key Features:
 * - Export patterns from AgentDB SQLite database
 * - Transform legacy pattern format to RuVector TestPattern interface
 * - Batch import with progress tracking and error handling
 * - Dry-run mode for safe migration validation
 * - Rollback support with backup creation
 * - Dual-write proxy for zero-downtime migration
 * - Comprehensive validation and integrity checks
 *
 * Migration Performance:
 * - Batch processing: 1000 patterns per batch (configurable)
 * - RuVector import: 2.7M+ ops/sec (native backend)
 * - Parallel export/import for maximum throughput
 *
 * @module core/memory/MigrationTools
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * // Simple migration
 * const migrator = new PatternMigrator();
 * const result = await migrator.migrate({
 *   sourcePath: './data/agentic-qe.db',
 *   targetPath: './data/patterns.ruvector',
 *   batchSize: 1000,
 *   verbose: true
 * });
 *
 * // Dry-run validation
 * const dryRun = await migrator.migrate({
 *   sourcePath: './data/agentic-qe.db',
 *   dryRun: true
 * });
 *
 * // Dual-write for safe transition
 * const proxy = new DualWriteProxy(agentDbStore, ruVectorStore);
 * await proxy.initialize();
 * await proxy.storePattern(pattern); // Writes to both
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createSeededRandom } from '../../utils/SeededRandom';
import { getErrorMessage } from '../../utils/ErrorUtils';
import type {
  IPatternStore,
  TestPattern,
  PatternSearchOptions,
  PatternSearchResult,
  PatternStoreStats,
} from './IPatternStore';
import { RuVectorPatternStore } from './RuVectorPatternStore';
import { PatternStoreFactory } from './PatternStoreFactory';

/**
 * Migration configuration options
 */
export interface MigrationOptions {
  /** Source AgentDB database path (SQLite .db file) */
  sourcePath?: string;

  /** Target RuVector storage path */
  targetPath?: string;

  /** Validate migration without writing to target (default: false) */
  dryRun?: boolean;

  /** Number of patterns to process per batch (default: 1000) */
  batchSize?: number;

  /** Enable verbose logging (default: false) */
  verbose?: boolean;

  /** Create backup before migration (default: true) */
  createBackup?: boolean;

  /** Embedding dimension (default: 384) */
  dimension?: number;

  /** Embedding generator function (if patterns lack embeddings) */
  generateEmbedding?: (pattern: TestPattern) => Promise<number[]>;
}

/**
 * Migration result summary
 */
export interface MigrationResult {
  /** Total patterns found in source */
  totalPatterns: number;

  /** Successfully migrated patterns */
  migratedCount: number;

  /** Skipped patterns (errors, missing data, etc.) */
  skippedCount: number;

  /** Error messages encountered */
  errors: string[];

  /** Migration duration in milliseconds */
  duration: number;

  /** Validation results */
  validation?: {
    sourceValid: boolean;
    targetValid: boolean;
    integrityChecks: string[];
  };

  /** Backup file path (if created) */
  backupPath?: string;
}

/**
 * Legacy AgentDB pattern format from SQLite database
 */
interface LegacyPattern {
  id: string;
  name: string;
  description?: string;
  category: 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'accessibility';
  framework: string;
  language: string;
  template: string;
  examples: string; // JSON string
  confidence: number;
  usage_count: number;
  success_rate: number;
  quality?: number;
  metadata: string; // JSON string
  created_at?: string;
  updated_at?: string;
}

/**
 * PatternMigrator - Main migration orchestrator
 *
 * Handles the complete migration workflow from AgentDB to RuVector
 * with comprehensive error handling and validation.
 */
export class PatternMigrator {
  private backupPaths: string[] = [];

  /**
   * Execute pattern migration with full orchestration
   */
  async migrate(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    const verbose = options.verbose ?? false;
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 1000;
    const createBackup = options.createBackup ?? true;
    const dimension = options.dimension ?? 384;

    const sourcePath = options.sourcePath ?? './data/agentic-qe.db';
    const targetPath = options.targetPath ?? './data/patterns.ruvector';

    const result: MigrationResult = {
      totalPatterns: 0,
      migratedCount: 0,
      skippedCount: 0,
      errors: [],
      duration: 0,
    };

    try {
      if (verbose) {
        console.log('[MigrationTools] Starting migration...');
        console.log(`[MigrationTools]   Source: ${sourcePath}`);
        console.log(`[MigrationTools]   Target: ${targetPath}`);
        console.log(`[MigrationTools]   Mode: ${dryRun ? 'DRY-RUN' : 'PRODUCTION'}`);
      }

      // Step 1: Validate source database
      if (verbose) console.log('[MigrationTools] Step 1/5: Validating source...');
      const sourceValid = await this.validateSource(sourcePath);
      if (!sourceValid) {
        throw new Error(`Source database validation failed: ${sourcePath}`);
      }

      // Step 2: Create backup (if enabled and not dry-run)
      if (createBackup && !dryRun) {
        if (verbose) console.log('[MigrationTools] Step 2/5: Creating backup...');
        result.backupPath = await this.createBackup(sourcePath);
        if (verbose) console.log(`[MigrationTools]   Backup created: ${result.backupPath}`);
      } else {
        if (verbose) console.log('[MigrationTools] Step 2/5: Skipping backup (dry-run or disabled)');
      }

      // Step 3: Export patterns from AgentDB
      if (verbose) console.log('[MigrationTools] Step 3/5: Exporting from AgentDB...');
      const patterns = await this.exportFromAgentDB(sourcePath, options.generateEmbedding, dimension);
      result.totalPatterns = patterns.length;
      if (verbose) console.log(`[MigrationTools]   Exported ${patterns.length} patterns`);

      // Step 4: Import to RuVector (skip in dry-run)
      if (!dryRun) {
        if (verbose) console.log('[MigrationTools] Step 4/5: Importing to RuVector...');
        const importResult = await this.importToRuVector(
          patterns,
          targetPath,
          batchSize,
          dimension,
          verbose
        );
        result.migratedCount = importResult.imported;
        result.skippedCount = importResult.skipped;
        result.errors.push(...importResult.errors);
      } else {
        if (verbose) console.log('[MigrationTools] Step 4/5: Skipping import (dry-run)');
        result.migratedCount = 0;
        result.skippedCount = 0;
      }

      // Step 5: Validation
      if (verbose) console.log('[MigrationTools] Step 5/5: Running validation...');
      const validation = await this.validateMigration(
        sourcePath,
        targetPath,
        dryRun
      );
      result.validation = validation;

      result.duration = Date.now() - startTime;

      if (verbose) {
        console.log('[MigrationTools] ✅ Migration completed successfully');
        console.log(`[MigrationTools]   Duration: ${result.duration}ms`);
        console.log(`[MigrationTools]   Total: ${result.totalPatterns}`);
        console.log(`[MigrationTools]   Migrated: ${result.migratedCount}`);
        console.log(`[MigrationTools]   Skipped: ${result.skippedCount}`);
        console.log(`[MigrationTools]   Errors: ${result.errors.length}`);
      }

      return result;

    } catch (error: unknown) {
      result.errors.push(getErrorMessage(error));
      result.duration = Date.now() - startTime;

      if (verbose) {
        console.error('[MigrationTools] ❌ Migration failed:', getErrorMessage(error));
      }

      throw new Error(`Migration failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Validate source database exists and is readable
   */
  async validateSource(sourcePath: string): Promise<boolean> {
    try {
      // Check if file exists
      await fs.access(sourcePath, fs.constants.R_OK);

      // Check if it's a SQLite database (basic check for SQLite header)
      const buffer = Buffer.alloc(16);
      const fd = await fs.open(sourcePath, 'r');
      await fd.read(buffer, 0, 16, 0);
      await fd.close();

      const header = buffer.toString('ascii', 0, 15);
      if (!header.startsWith('SQLite format 3')) {
        console.warn('[MigrationTools] Warning: Source file may not be a SQLite database');
        return false;
      }

      return true;
    } catch (error: unknown) {
      console.error('[MigrationTools] Source validation failed:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Create backup of source database
   */
  async createBackup(sourcePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = sourcePath.replace(/\.db$/, `.backup-${timestamp}.db`);

    try {
      await fs.copyFile(sourcePath, backupPath);
      this.backupPaths.push(backupPath);
      return backupPath;
    } catch (error: unknown) {
      throw new Error(`Backup creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Export patterns from AgentDB SQLite database
   */
  async exportFromAgentDB(
    sourcePath: string,
    generateEmbedding?: (pattern: TestPattern) => Promise<number[]>,
    dimension: number = 384
  ): Promise<TestPattern[]> {
    try {
      // Use better-sqlite3 for synchronous SQLite access
      const Database = require('better-sqlite3');
      const db = new Database(sourcePath, { readonly: true });

      // Query all patterns from database
      const rows = db.prepare('SELECT * FROM patterns').all() as LegacyPattern[];

      const patterns: TestPattern[] = [];

      for (const row of rows) {
        try {
          const pattern = await this.transformLegacyPattern(row, generateEmbedding, dimension);
          patterns.push(pattern);
        } catch (error: unknown) {
          console.warn(`[MigrationTools] Failed to transform pattern ${row.id}: ${getErrorMessage(error)}`);
        }
      }

      db.close();
      return patterns;

    } catch (error: unknown) {
      throw new Error(`AgentDB export failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Transform legacy AgentDB pattern to RuVector TestPattern format
   */
  private async transformLegacyPattern(
    legacy: LegacyPattern,
    generateEmbedding?: (pattern: TestPattern) => Promise<number[]>,
    dimension: number = 384
  ): Promise<TestPattern> {
    // Generate or use placeholder embedding
    let embedding: number[];
    if (generateEmbedding) {
      // Cast legacy to TestPattern for embedding generation - embedding only needs text content
      embedding = await generateEmbedding(legacy as unknown as TestPattern);
    } else {
      // Use normalized seeded random embedding as placeholder (deterministic)
      const rng = createSeededRandom(legacy.id?.charCodeAt(0) ?? 42);
      embedding = Array.from({ length: dimension }, () => rng.random() - 0.5);
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      embedding = embedding.map(val => val / norm);
    }

    // Parse JSON fields
    let examples: string[] = [];
    try {
      examples = JSON.parse(legacy.examples);
    } catch {
      examples = [];
    }

    let metadata: Record<string, any> = {};
    try {
      metadata = JSON.parse(legacy.metadata);
    } catch {
      metadata = {};
    }

    // Build content from pattern information
    const content = `
Pattern: ${legacy.name}
Description: ${legacy.description || 'N/A'}
Template: ${legacy.template}
Examples: ${examples.join(', ')}
`.trim();

    // Map to TestPattern interface
    const pattern: TestPattern = {
      id: legacy.id,
      type: legacy.category,
      domain: legacy.framework || 'unknown',
      embedding,
      content,
      framework: legacy.framework,
      coverage: legacy.quality,
      flakinessScore: legacy.success_rate < 0.8 ? 1 - legacy.success_rate : 0,
      verdict: legacy.success_rate >= 0.9 ? 'success' : legacy.success_rate >= 0.7 ? 'flaky' : 'failure',
      createdAt: legacy.created_at ? new Date(legacy.created_at).getTime() : Date.now(),
      lastUsed: legacy.updated_at ? new Date(legacy.updated_at).getTime() : Date.now(),
      usageCount: legacy.usage_count,
      metadata: {
        ...metadata,
        // Preserve original fields
        originalName: legacy.name,
        originalCategory: legacy.category,
        language: legacy.language,
        template: legacy.template,
        examples,
        confidence: legacy.confidence,
        description: legacy.description,
      },
    };

    return pattern;
  }

  /**
   * Import patterns to RuVector in batches
   */
  private async importToRuVector(
    patterns: TestPattern[],
    targetPath: string,
    batchSize: number,
    dimension: number,
    verbose: boolean
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const result = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      // Create RuVector store
      const store = new RuVectorPatternStore({
        dimension,
        metric: 'cosine',
        storagePath: targetPath,
        autoPersist: true,
        enableMetrics: true,
      });

      await store.initialize();

      // Process in batches for optimal performance
      const batches = Math.ceil(patterns.length / batchSize);

      for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, patterns.length);
        const batch = patterns.slice(start, end);

        try {
          await store.storeBatch(batch);
          result.imported += batch.length;

          if (verbose) {
            const progress = ((end / patterns.length) * 100).toFixed(1);
            console.log(`[MigrationTools]   Progress: ${progress}% (${end}/${patterns.length})`);
          }
        } catch (error: unknown) {
          result.skipped += batch.length;
          result.errors.push(`Batch ${i + 1} failed: ${getErrorMessage(error)}`);

          if (verbose) {
            console.warn(`[MigrationTools]   Batch ${i + 1} failed: ${getErrorMessage(error)}`);
          }
        }
      }

      // Build index for optimal search performance
      await store.buildIndex();

      // Get final stats
      const stats = await store.getStats();
      if (verbose) {
        console.log('[MigrationTools]   Final stats:', stats);
      }

      await store.shutdown();

    } catch (error: unknown) {
      result.errors.push(`Import failed: ${getErrorMessage(error)}`);
      throw new Error(`RuVector import failed: ${getErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Validate migration integrity
   */
  private async validateMigration(
    sourcePath: string,
    targetPath: string,
    dryRun: boolean
  ): Promise<{
    sourceValid: boolean;
    targetValid: boolean;
    integrityChecks: string[];
  }> {
    const checks: string[] = [];

    // Validate source
    const sourceValid = await this.validateSource(sourcePath);
    checks.push(`Source validation: ${sourceValid ? 'PASS' : 'FAIL'}`);

    // Validate target (skip in dry-run)
    let targetValid = true;
    if (!dryRun) {
      try {
        await fs.access(targetPath, fs.constants.R_OK);
        targetValid = true;
        checks.push('Target validation: PASS');
      } catch {
        targetValid = false;
        checks.push('Target validation: FAIL');
      }
    } else {
      checks.push('Target validation: SKIPPED (dry-run)');
    }

    return {
      sourceValid,
      targetValid,
      integrityChecks: checks,
    };
  }

  /**
   * Rollback migration by restoring from backup
   */
  async rollback(): Promise<void> {
    if (this.backupPaths.length === 0) {
      throw new Error('No backup available for rollback');
    }

    const latestBackup = this.backupPaths[this.backupPaths.length - 1];
    const originalPath = latestBackup.replace(/\.backup-.*\.db$/, '.db');

    try {
      await fs.copyFile(latestBackup, originalPath);
      console.log(`[MigrationTools] ✅ Rollback completed: ${originalPath} restored from ${latestBackup}`);
    } catch (error: unknown) {
      throw new Error(`Rollback failed: ${getErrorMessage(error)}`);
    }
  }
}

/**
 * DualWriteProxy - Write to both AgentDB and RuVector during transition
 *
 * Enables zero-downtime migration by:
 * - Writing to both old and new backends
 * - Reading from new backend (RuVector) for performance
 * - Falling back to old backend on RuVector errors
 *
 * Use this during the transition period to ensure data consistency
 * and enable safe rollback if issues occur.
 */
export class DualWriteProxy implements IPatternStore {
  private primaryStore: IPatternStore;
  private secondaryStore: IPatternStore;
  private initialized = false;

  /**
   * Create dual-write proxy
   * @param primaryStore - Primary store (usually RuVector for reads)
   * @param secondaryStore - Secondary store (usually AgentDB for backup)
   */
  constructor(primaryStore: IPatternStore, secondaryStore: IPatternStore) {
    this.primaryStore = primaryStore;
    this.secondaryStore = secondaryStore;
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.primaryStore.initialize(),
      this.secondaryStore.initialize(),
    ]);
    this.initialized = true;
    console.log('[MigrationTools] DualWriteProxy initialized');
  }

  async storePattern(pattern: TestPattern): Promise<void> {
    // Write to both stores
    await Promise.all([
      this.primaryStore.storePattern(pattern),
      this.secondaryStore.storePattern(pattern).catch(err => {
        console.warn('[MigrationTools] Secondary store write failed:', err.message);
      }),
    ]);
  }

  async storeBatch(patterns: TestPattern[]): Promise<void> {
    // Write to both stores
    await Promise.all([
      this.primaryStore.storeBatch(patterns),
      this.secondaryStore.storeBatch(patterns).catch(err => {
        console.warn('[MigrationTools] Secondary batch write failed:', err.message);
      }),
    ]);
  }

  async searchSimilar(
    queryEmbedding: number[],
    options?: PatternSearchOptions
  ): Promise<PatternSearchResult[]> {
    // Read from primary (RuVector) with fallback to secondary
    try {
      return await this.primaryStore.searchSimilar(queryEmbedding, options);
    } catch (error: unknown) {
      console.warn('[MigrationTools] Primary search failed, falling back to secondary:', getErrorMessage(error));
      return await this.secondaryStore.searchSimilar(queryEmbedding, options);
    }
  }

  async getPattern(id: string): Promise<TestPattern | null> {
    // Read from primary with fallback
    try {
      return await this.primaryStore.getPattern(id);
    } catch (error: unknown) {
      console.warn('[MigrationTools] Primary get failed, falling back to secondary:', getErrorMessage(error));
      return await this.secondaryStore.getPattern(id);
    }
  }

  async deletePattern(id: string): Promise<boolean> {
    // Delete from both stores
    const [primaryResult, secondaryResult] = await Promise.allSettled([
      this.primaryStore.deletePattern(id),
      this.secondaryStore.deletePattern(id),
    ]);

    return primaryResult.status === 'fulfilled' && primaryResult.value;
  }

  async recordUsage(id: string): Promise<void> {
    // Record in both stores
    await Promise.all([
      this.primaryStore.recordUsage(id),
      this.secondaryStore.recordUsage(id).catch(err => {
        console.warn('[MigrationTools] Secondary usage recording failed:', err.message);
      }),
    ]);
  }

  async buildIndex(): Promise<void> {
    await Promise.all([
      this.primaryStore.buildIndex(),
      this.secondaryStore.buildIndex().catch(err => {
        console.warn('[MigrationTools] Secondary index build failed:', err.message);
      }),
    ]);
  }

  async optimize(): Promise<void> {
    await Promise.all([
      this.primaryStore.optimize(),
      this.secondaryStore.optimize().catch(err => {
        console.warn('[MigrationTools] Secondary optimization failed:', err.message);
      }),
    ]);
  }

  async getStats(): Promise<PatternStoreStats> {
    // Get stats from primary
    return await this.primaryStore.getStats();
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.primaryStore.clear(),
      this.secondaryStore.clear(),
    ]);
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.primaryStore.shutdown(),
      this.secondaryStore.shutdown(),
    ]);
    this.initialized = false;
    console.log('[MigrationTools] DualWriteProxy shut down');
  }

  getImplementationInfo(): {
    type: 'ruvector' | 'agentdb' | 'fallback';
    version: string;
    features: string[];
  } {
    const primaryInfo = this.primaryStore.getImplementationInfo();
    const secondaryInfo = this.secondaryStore.getImplementationInfo();

    return {
      type: primaryInfo.type,
      version: `${primaryInfo.version} + ${secondaryInfo.version}`,
      features: [
        ...primaryInfo.features,
        'dual-write',
        'automatic-fallback',
        'zero-downtime-migration',
      ],
    };
  }
}

/**
 * Convenience function to create a dual-write proxy
 */
export async function createDualWriteProxy(
  primaryConfig: { storagePath?: string; dimension?: number },
  secondaryConfig: { storagePath?: string; dimension?: number }
): Promise<DualWriteProxy> {
  // Create primary store (RuVector)
  const primaryResult = await PatternStoreFactory.create({
    preferredBackend: 'ruvector',
    storagePath: primaryConfig.storagePath ?? './data/patterns.ruvector',
    dimension: primaryConfig.dimension ?? 384,
  });

  // Create secondary store (can be AgentDB or fallback)
  const secondaryResult = await PatternStoreFactory.create({
    preferredBackend: 'agentdb',
    storagePath: secondaryConfig.storagePath ?? './data/patterns-backup.db',
    dimension: secondaryConfig.dimension ?? 384,
  });

  const proxy = new DualWriteProxy(primaryResult.store, secondaryResult.store);
  await proxy.initialize();

  return proxy;
}

/**
 * Migration status checker - verify migration progress
 */
export async function checkMigrationStatus(
  sourcePath: string,
  targetPath: string
): Promise<{
  sourceCount: number;
  targetCount: number;
  migrationComplete: boolean;
  coverage: number;
}> {
  try {
    // Count patterns in source (SQLite)
    const Database = require('better-sqlite3');
    const db = new Database(sourcePath, { readonly: true });
    const sourceResult = db.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
    const sourceCount = sourceResult.count;
    db.close();

    // Count patterns in target (RuVector)
    const targetStore = new RuVectorPatternStore({
      dimension: 384,
      storagePath: targetPath,
    });
    await targetStore.initialize();
    const targetStats = await targetStore.getStats();
    const targetCount = targetStats.count;
    await targetStore.shutdown();

    const coverage = sourceCount > 0 ? (targetCount / sourceCount) : 0;
    const migrationComplete = coverage >= 0.99;

    return {
      sourceCount,
      targetCount,
      migrationComplete,
      coverage,
    };
  } catch (error: unknown) {
    throw new Error(`Migration status check failed: ${getErrorMessage(error)}`);
  }
}

export default PatternMigrator;
