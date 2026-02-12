/**
 * Phase 06: Code Intelligence
 * Pre-scans project and builds knowledge graph
 *
 * IMPORTANT: KG data is persisted to SQLite (.agentic-qe/memory.db)
 * so QE agents can use it later to reduce token consumption via
 * semantic code search instead of full file reads.
 */

import { existsSync, statSync } from 'fs';
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

/** Patterns to exclude from code intelligence scanning */
const SCAN_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.agentic-qe/**',
  '**/.git/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/target/**',
  '**/vendor/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.tox/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.map',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Pipfile.lock',
  '**/poetry.lock',
  '**/.env',
  '**/.env.*',
];

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

    const hasIndex = await this.checkCodeIntelligenceIndex(projectRoot);

    if (!hasIndex) {
      context.services.log('  Building knowledge graph...');
      return await this.runCodeIntelligenceScan(projectRoot, context, false);
    }

    // Delta scan: check for files modified since last index
    const lastIndexedAt = await this.getLastIndexedAt(projectRoot);
    if (!lastIndexedAt) {
      const entryCount = await this.getKGEntryCount(projectRoot);
      context.services.log(`  Using existing index (${entryCount} entries)`);
      return { status: 'existing', entries: entryCount };
    }

    const changedFiles = await this.findChangedFiles(projectRoot, lastIndexedAt);
    if (changedFiles.length === 0) {
      const entryCount = await this.getKGEntryCount(projectRoot);
      context.services.log(`  Index up to date (${entryCount} entries)`);
      return { status: 'existing', entries: entryCount };
    }

    context.services.log(`  Delta scan: ${changedFiles.length} files changed since last index...`);
    return await this.runCodeIntelligenceScan(projectRoot, context, true, changedFiles);
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
    context: InitContext,
    incremental: boolean,
    changedFiles?: string[]
  ): Promise<CodeIntelligenceResult> {
    try {
      const { KnowledgeGraphService } = await import('../../domains/code-intelligence/services/knowledge-graph.js');

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

      let filesToIndex: string[];
      if (changedFiles) {
        filesToIndex = changedFiles;
      } else {
        const glob = await import('fast-glob');
        const files = await glob.default([
          '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'
        ], {
          cwd: projectRoot,
          ignore: SCAN_IGNORE_PATTERNS,
        });
        filesToIndex = files.map(f => join(projectRoot, f));
      }

      const result = await kgService.index({
        paths: filesToIndex,
        incremental,
        includeTests: true,
      });

      kgService.destroy();
      await memory.dispose();

      if (result.success) {
        const entries = result.value.nodesCreated + result.value.edgesCreated;
        const label = incremental ? 'Delta indexed' : 'Indexed';
        context.services.log(`  ${label} ${entries} entries to ${dbPath}`);
        return { status: 'indexed', entries };
      }

      return { status: 'error', entries: 0 };
    } catch (error) {
      context.services.warn(`Code intelligence scan warning: ${error}`);
      return { status: 'skipped', entries: 0 };
    }
  }

  /**
   * Read the indexedAt timestamp from KG metadata
   */
  private async getLastIndexedAt(projectRoot: string): Promise<Date | null> {
    const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);
      const row = db.prepare(`
        SELECT value FROM kv_store
        WHERE namespace = 'code-intelligence:kg'
          AND key = 'metadata:index'
      `).get() as { value: string } | undefined;
      db.close();

      if (!row) return null;
      const metadata = JSON.parse(row.value);
      if (!metadata.indexedAt) return null;
      const date = new Date(metadata.indexedAt);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Find files modified since the given date
   */
  private async findChangedFiles(projectRoot: string, since: Date): Promise<string[]> {
    const glob = await import('fast-glob');
    const files = await glob.default([
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'
    ], {
      cwd: projectRoot,
      ignore: SCAN_IGNORE_PATTERNS,
    });

    const sinceMs = since.getTime();
    const changed: string[] = [];
    for (const file of files) {
      const fullPath = join(projectRoot, file);
      try {
        if (statSync(fullPath).mtimeMs > sinceMs) {
          changed.push(fullPath);
        }
      } catch {
        // File may have been deleted between glob and stat
      }
    }
    return changed;
  }
}

// Instance exported from index.ts
