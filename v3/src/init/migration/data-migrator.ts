/**
 * V2 Data Migrator
 * Migrates patterns and experiences from v2 to v3 format
 */

import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { toErrorMessage } from '../../shared/error-utils.js';
import { safeJsonParse } from '../../shared/safe-json.js';
import { openDatabase } from '../../shared/safe-db.js';

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  backupPath?: string;
  tablesMigrated: string[];
  counts: Record<string, number>;
  errors: string[];
}

/**
 * Migration progress callback
 */
export interface MigrationProgress {
  stage: string;
  message: string;
  progress?: number;
}

/**
 * V2 Data Migrator
 */
export class V2DataMigrator {
  private v2DbPath: string;
  private v3PatternsDbPath: string;
  private onProgress?: (progress: MigrationProgress) => void;

  constructor(options: {
    v2DbPath: string;
    v3PatternsDbPath: string;
    onProgress?: (progress: MigrationProgress) => void;
  }) {
    this.v2DbPath = options.v2DbPath;
    this.v3PatternsDbPath = options.v3PatternsDbPath;
    this.onProgress = options.onProgress;
  }

  /**
   * Run migration
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      tablesMigrated: [],
      counts: {},
      errors: [],
    };

    // Check source exists
    if (!existsSync(this.v2DbPath)) {
      result.errors.push('V2 database not found');
      return result;
    }

    try {
      // Create backup
      this.report('backup', 'Creating backup of v2 database...');
      const backupPath = await this.createBackup();
      result.backupPath = backupPath;

      // Initialize v3 database
      this.report('init', 'Initializing v3 patterns database...');
      await this.initializeV3Database();

      // Migrate patterns
      this.report('patterns', 'Migrating patterns...');
      const patternsCount = await this.migratePatterns();
      if (patternsCount > 0) {
        result.tablesMigrated.push('patterns');
        result.counts.patterns = patternsCount;
      }

      // Migrate experiences
      this.report('experiences', 'Migrating experiences...');
      const experiencesCount = await this.migrateExperiences();
      if (experiencesCount > 0) {
        result.tablesMigrated.push('experiences');
        result.counts.experiences = experiencesCount;
      }

      // Migrate concept graph
      this.report('concepts', 'Migrating concept graph...');
      const conceptsCount = await this.migrateConceptGraph();
      if (conceptsCount > 0) {
        result.tablesMigrated.push('concept_graph');
        result.counts.concepts = conceptsCount;
      }

      result.success = true;
      this.report('complete', 'Migration completed successfully');
    } catch (error) {
      result.errors.push(toErrorMessage(error));
    }

    return result;
  }

  /**
   * Report progress
   */
  private report(stage: string, message: string, progress?: number): void {
    this.onProgress?.({ stage, message, progress });
  }

  /**
   * Create backup of v2 database
   */
  private async createBackup(): Promise<string> {
    const backupDir = join(dirname(this.v2DbPath), 'backup');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `memory-v2-${timestamp}.db`);

    copyFileSync(this.v2DbPath, backupPath);
    return backupPath;
  }

  /**
   * Initialize v3 patterns database
   */
  private async initializeV3Database(): Promise<void> {
    const dir = dirname(this.v3PatternsDbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const db = openDatabase(this.v3PatternsDbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        confidence REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 0.5,
        domain TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        migrated_from TEXT
      );

      CREATE TABLE IF NOT EXISTS experiences (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        task_description TEXT,
        agent TEXT,
        outcome TEXT,
        success INTEGER,
        quality_score REAL,
        patterns_used TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        migrated_from TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_patterns_domain ON patterns(domain);
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type);
      CREATE INDEX IF NOT EXISTS idx_experiences_task_type ON experiences(task_type);
    `);

    db.close();
  }

  /**
   * Migrate patterns from v2 kv_store
   */
  private async migratePatterns(): Promise<number> {
    const v2Db = openDatabase(this.v2DbPath, { readonly: true });
    const v3Db = openDatabase(this.v3PatternsDbPath);

    try {
      // Find patterns in v2 database
      const v2Patterns = v2Db.prepare(`
        SELECT key, namespace, value FROM kv_store
        WHERE namespace LIKE '%pattern%' OR key LIKE '%pattern%'
      `).all() as Array<{ key: string; namespace: string; value: string }>;

      let count = 0;
      const insertStmt = v3Db.prepare(`
        INSERT OR IGNORE INTO patterns (id, type, content, domain, metadata, migrated_from)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const row of v2Patterns) {
        try {
          const data = safeJsonParse<Record<string, unknown>>(row.value);
          const id = `migrated-${row.namespace}-${row.key}`;
          const type = (data as Record<string, unknown>).type || 'unknown';
          const content = JSON.stringify(data);
          const domain = row.namespace.replace(':patterns', '') || 'general';

          insertStmt.run(id, type, content, domain, null, `v2:${row.namespace}:${row.key}`);
          count++;
        } catch (error) {
          // Non-critical: skip invalid entries during migration
          console.debug('[DataMigrator] Skipped invalid pattern entry:', error instanceof Error ? error.message : error);
        }
      }

      return count;
    } finally {
      v2Db.close();
      v3Db.close();
    }
  }

  /**
   * Migrate experiences from v2
   */
  private async migrateExperiences(): Promise<number> {
    const v2Db = openDatabase(this.v2DbPath, { readonly: true });
    const v3Db = openDatabase(this.v3PatternsDbPath);

    try {
      // Find experiences in v2 database
      const v2Experiences = v2Db.prepare(`
        SELECT key, namespace, value FROM kv_store
        WHERE namespace LIKE '%experience%' OR key LIKE '%experience%'
      `).all() as Array<{ key: string; namespace: string; value: string }>;

      let count = 0;
      const insertStmt = v3Db.prepare(`
        INSERT OR IGNORE INTO captured_experiences (id, task, agent, domain, success, quality, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of v2Experiences) {
        try {
          const data = safeJsonParse<Record<string, unknown>>(row.value);
          const id = `migrated-${row.namespace}-${row.key}`;
          const taskDescription = (data as Record<string, unknown>).description || (data as Record<string, unknown>).task || '';
          const agent = data.agent || 'unknown';
          const domain = data.domain || data.taskType || data.task_type || '';
          const success = data.success ? 1 : 0;
          const qualityScore = data.quality || data.qualityScore || 0.5;

          insertStmt.run(id, taskDescription, agent, domain, success, qualityScore, `v2-migration:${row.namespace}:${row.key}`);
          count++;
        } catch (error) {
          // Non-critical: skip invalid entries during migration
          console.debug('[DataMigrator] Skipped invalid experience entry:', error instanceof Error ? error.message : error);
        }
      }

      return count;
    } finally {
      v2Db.close();
      v3Db.close();
    }
  }

  /**
   * Migrate concept graph from v2
   */
  private async migrateConceptGraph(): Promise<number> {
    // Concept graph migration would be more complex
    // For now, return 0 to indicate no concepts migrated
    return 0;
  }
}

/**
 * Create V2 data migrator
 */
export function createV2DataMigrator(options: {
  v2DbPath: string;
  v3PatternsDbPath: string;
  onProgress?: (progress: MigrationProgress) => void;
}): V2DataMigrator {
  return new V2DataMigrator(options);
}
