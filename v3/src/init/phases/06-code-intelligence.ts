/**
 * Phase 06: Code Intelligence
 * Pre-scans project and builds knowledge graph
 *
 * IMPORTANT: KG data is persisted to SQLite (.agentic-qe/memory.db)
 * so QE agents can use it later to reduce token consumption via
 * semantic code search instead of full file reads.
 */

import { existsSync } from 'fs';
import { join } from 'path';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import { createMemoryBackend, type MemoryBackendConfig } from '../../kernel/memory-factory.js';

export interface CodeIntelligenceResult {
  status: 'indexed' | 'existing' | 'skipped' | 'error';
  entries: number;
}

/**
 * Code Intelligence phase - builds knowledge graph
 */
export class CodeIntelligencePhase extends BasePhase<CodeIntelligenceResult> {
  readonly name = 'code-intelligence';
  readonly description = 'Code intelligence pre-scan';
  readonly order = 60;
  readonly critical = false;
  readonly requiresPhases = ['database'] as const;

  protected async run(context: InitContext): Promise<CodeIntelligenceResult> {
    const { projectRoot } = context;

    // Check for existing index
    const hasIndex = await this.checkCodeIntelligenceIndex(projectRoot);

    if (hasIndex) {
      const entryCount = await this.getKGEntryCount(projectRoot);
      context.services.log(`  Using existing index (${entryCount} entries)`);
      return { status: 'existing', entries: entryCount };
    }

    // Run full scan
    context.services.log('  Building knowledge graph...');
    return await this.runCodeIntelligenceScan(projectRoot, context);
  }

  /**
   * Check if code intelligence index exists
   */
  private async checkCodeIntelligenceIndex(projectRoot: string): Promise<boolean> {
    const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');
    if (!existsSync(dbPath)) {
      return false;
    }

    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM kv_store
        WHERE namespace = 'code-intelligence:kg'
      `).get() as { count: number };
      db.close();
      return result.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get count of KG entries
   */
  private async getKGEntryCount(projectRoot: string): Promise<number> {
    const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM kv_store
        WHERE namespace LIKE 'code-intelligence:kg%'
      `).get() as { count: number };
      db.close();
      return result.count;
    } catch {
      return 0;
    }
  }

  /**
   * Run code intelligence scan
   *
   * CRITICAL: Uses SQLite backend to persist KG data to .agentic-qe/memory.db
   * This allows QE agents to query the KG later for:
   * - Semantic code search (find functions by intent, not just name)
   * - Dependency analysis (impact of changes)
   * - Test target discovery (what tests cover what code)
   * - Token reduction (search KG instead of reading entire files)
   */
  private async runCodeIntelligenceScan(
    projectRoot: string,
    context: InitContext
  ): Promise<CodeIntelligenceResult> {
    try {
      // Import knowledge graph service
      const { KnowledgeGraphService } = await import('../../domains/code-intelligence/services/knowledge-graph.js');

      // FIXED: Use SQLite backend for PERSISTENCE instead of InMemoryBackend
      // This ensures KG data survives init and is available to QE agents
      const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');
      const memoryConfig: MemoryBackendConfig = {
        type: 'sqlite',
        sqlite: {
          path: dbPath,
          walMode: true,
        },
      };

      const { backend: memory } = await createMemoryBackend(memoryConfig, true);

      const kgService = new KnowledgeGraphService(memory, {
        namespace: 'code-intelligence:kg',
        enableVectorEmbeddings: true,
      });

      // Find source files
      const glob = await import('fast-glob');
      const files = await glob.default([
        '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'
      ], {
        cwd: projectRoot,
        ignore: ['node_modules/**', 'dist/**', 'coverage/**', '.agentic-qe/**'],
      });

      // Index files - this now persists to SQLite
      const result = await kgService.index({
        paths: files.map(f => join(projectRoot, f)),
        incremental: false,
        includeTests: true,
      });

      // Clear caches but keep persisted data
      kgService.destroy();

      // Dispose memory backend to flush writes
      await memory.dispose();

      if (result.success) {
        const entries = result.value.nodesCreated + result.value.edgesCreated;
        context.services.log(`  Indexed ${entries} entries to ${dbPath}`);
        return { status: 'indexed', entries };
      }

      return { status: 'error', entries: 0 };
    } catch (error) {
      context.services.warn(`Code intelligence scan warning: ${error}`);
      return { status: 'skipped', entries: 0 };
    }
  }
}

// Instance exported from index.ts
