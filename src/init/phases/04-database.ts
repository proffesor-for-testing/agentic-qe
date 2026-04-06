/**
 * Phase 04: Database
 * Initializes SQLite persistence database using UnifiedMemoryManager
 *
 * This ensures ALL v3 tables are created for the full self-learning system:
 * - KV Store (v2 compatible)
 * - Vectors (HNSW embeddings)
 * - Q-Values (RL algorithms)
 * - GOAP (planning)
 * - Dreams (pattern discovery)
 * - QE Patterns (ReasoningBank)
 * - MinCut (self-healing)
 * - SONA (neural backbone)
 * - Hypergraph (complex relationships)
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import { getAQEVersion } from '../types.js';

export interface DatabaseResult {
  dbPath: string;
  created: boolean;
  tablesCreated: string[];
  schemaVersion: number;
}

/**
 * Database phase - initializes SQLite persistence via UnifiedMemoryManager
 */
export class DatabasePhase extends BasePhase<DatabaseResult> {
  readonly name = 'database';
  readonly description = 'Initialize persistence database';
  readonly order = 40;
  readonly critical = true;
  readonly requiresPhases = ['configuration'] as const;

  protected async run(context: InitContext): Promise<DatabaseResult> {
    const { projectRoot } = context;

    // Issue #399 / ADR-090: warn on stale ./vectors.db cruft.
    //
    // Prior to the hnswlib-node migration, NativeHnswBackend wrapped
    // @ruvector/router's VectorDb, whose constructor unconditionally wrote
    // a `vectors.db` redb file to the current working directory — outside
    // .agentic-qe/, in a non-SQLite format, never read by anything in
    // production (its HNSW search returned wrong answers anyway). Users
    // who upgrade from a pre-#399 version will have an orphaned multi-MB
    // file in their project root. We surface it once per `aqe init` so the
    // user can clean up at their convenience. We do NOT delete it
    // automatically — CLAUDE.md data protection rules forbid touching .db
    // files without explicit user confirmation.
    const staleVectorsDb = join(projectRoot, 'vectors.db');
    if (existsSync(staleVectorsDb)) {
      context.services.log(
        `  ⚠ Stale vectors.db detected at ${staleVectorsDb}\n` +
          `    This file is left over from @ruvector/router (pre-v3.9.6).\n` +
          `    It is no longer read or written by AQE. Safe to delete:\n` +
          `      rm "${staleVectorsDb}"`,
      );
    }

    // Create .agentic-qe directory structure
    const dataDir = join(projectRoot, '.agentic-qe');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Create workers directory for background workers
    const workersDir = join(dataDir, 'workers');
    if (!existsSync(workersDir)) {
      mkdirSync(workersDir, { recursive: true });
    }

    // Create data directory for domain-specific data
    const domainDataDir = join(dataDir, 'data');
    if (!existsSync(domainDataDir)) {
      mkdirSync(domainDataDir, { recursive: true });
    }

    const dbPath = join(dataDir, 'memory.db');
    const created = !existsSync(dbPath);

    try {
      // Use UnifiedMemoryManager to create ALL v3 tables
      // This runs migrations and creates the complete schema
      const { initializeUnifiedMemory, resetUnifiedMemory } = await import('../../kernel/unified-memory.js');

      const unifiedMemory = await initializeUnifiedMemory({
        dbPath,
        walMode: true,
        busyTimeout: 5000,
      });

      // Get stats to see what tables were created
      const stats = unifiedMemory.getStats();
      const tablesCreated = stats.tables.map(t => t.name);

      // Write init marker to kv_store
      await unifiedMemory.kvSet('_init_marker', {
        initialized: new Date().toISOString(),
        projectRoot,
        version: getAQEVersion(),
      }, '_system');

      // Get schema version
      const db = unifiedMemory.getDatabase();
      const versionRow = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined;
      const schemaVersion = versionRow?.version ?? 0;

      // Reset singleton so MCP server can reinitialize with its own config
      resetUnifiedMemory();

      context.services.log(`  Database: ${dbPath}`);
      context.services.log(`  Schema version: v${schemaVersion}`);
      context.services.log(`  Tables: ${tablesCreated.length} (v3 full schema)`);

      return {
        dbPath,
        created,
        tablesCreated,
        schemaVersion,
      };
    } catch (error) {
      throw new Error(
        `SQLite persistence initialization FAILED: ${error}\n` +
        `Database path: ${dbPath}\n` +
        'Ensure the directory is writable and has sufficient disk space.'
      );
    }
  }
}

// Instance exported from index.ts
