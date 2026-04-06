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
import { safeJsonParse } from '../../shared/safe-json.js';
import { openDatabase } from '../../shared/safe-db.js';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import { createMemoryBackend, type MemoryBackendConfig } from '../../kernel/memory-factory.js';

export interface CodeIntelligenceResult {
  status: 'indexed' | 'existing' | 'skipped' | 'error' | 'timeout';
  entries: number;
  /** Last file the indexer touched before a timeout, if any. Used for diagnostics. */
  timeoutFile?: string;
}

// ============================================================================
// Watchdog configuration (fix/init-v3-9-3 Fix 5)
//
// These are deliberately generous. Normal codebases of 10k+ entities index
// in under 3 seconds on a laptop. The caps exist so that a pathological file
// or a native-layer stall (e.g. on an overlay filesystem) can't hang the
// entire init command indefinitely. When a cap fires the phase returns
// gracefully with status='timeout', the warning names the last file, and the
// user can open an issue with that exact filename.
// ============================================================================

/** Per-file timeout. A single file must not take longer than this to index. */
const PER_FILE_TIMEOUT_MS = 30_000;

/** Whole-phase timeout. The full KG build must not take longer than this. */
const PHASE_TIMEOUT_MS = 180_000;

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

  /**
   * Opt-out gate: v3.9.4 escape hatch for users whose code intelligence
   * pre-scan stalls on native calls that the phase-level watchdog can't
   * interrupt (because Node's event loop is blocked inside synchronous
   * NAPI code). Setting `AQE_SKIP_CODE_INDEX=1` or passing
   * `--skip-code-index` to `aqe init` bypasses this phase entirely.
   * Lazy on-demand indexing still works when the user runs
   * `aqe code index` or `aqe memory search` afterwards.
   *
   * See https://github.com/proffesor-for-testing/agentic-qe/issues/XXX
   * for the tracking issue on the proper killable-worker fix.
   */
  async shouldRun(context: InitContext): Promise<boolean> {
    const envSkip = process.env.AQE_SKIP_CODE_INDEX;
    if (envSkip === '1' || envSkip === 'true') {
      context.services.log('  Code intelligence skipped (AQE_SKIP_CODE_INDEX=1)');
      context.services.log('  Run `aqe code index` later to build the KG on demand.');
      return false;
    }
    if ((context.options as { skipCodeIndex?: boolean }).skipCodeIndex) {
      context.services.log('  Code intelligence skipped (--skip-code-index)');
      context.services.log('  Run `aqe code index` later to build the KG on demand.');
      return false;
    }
    return true;
  }

  protected async run(context: InitContext): Promise<CodeIntelligenceResult> {
    const { projectRoot } = context;
    const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');

    if (!existsSync(dbPath)) {
      context.services.log('  Building knowledge graph...');
      return await this.runCodeIntelligenceScan(projectRoot, context, false);
    }

    // Open a single DB connection for all pre-scan queries
    const db = openDatabase(dbPath);
    try {
      const hasIndex = this.checkCodeIntelligenceIndex(db);

      if (!hasIndex) {
        db.close();
        context.services.log('  Building knowledge graph...');
        return await this.runCodeIntelligenceScan(projectRoot, context, false);
      }

      // Delta scan: check for files modified since last index
      const lastIndexedAt = this.getLastIndexedAt(db);
      if (!lastIndexedAt) {
        const entryCount = this.getKGEntryCount(db);
        db.close();
        context.services.log(`  Using existing index (${entryCount} entries)`);
        return { status: 'existing', entries: entryCount };
      }

      const entryCount = this.getKGEntryCount(db);
      db.close();

      const changedFiles = await this.findChangedFiles(projectRoot, lastIndexedAt);
      if (changedFiles.length === 0) {
        context.services.log(`  Index up to date (${entryCount} entries)`);
        return { status: 'existing', entries: entryCount };
      }

      context.services.log(`  Delta scan: ${changedFiles.length} files changed since last index...`);
      return await this.runCodeIntelligenceScan(projectRoot, context, true, changedFiles);
    } catch (error) {
      try { db.close(); } catch { /* ignore */ }
      throw error;
    }
  }

  /**
   * Check if code intelligence index exists (uses provided db connection)
   */
  private checkCodeIntelligenceIndex(db: ReturnType<typeof openDatabase>): boolean {
    try {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM kv_store
        WHERE namespace = 'code-intelligence:kg'
      `).get() as { count: number };
      return result.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get count of KG entries (uses provided db connection)
   */
  private getKGEntryCount(db: ReturnType<typeof openDatabase>): number {
    try {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM kv_store
        WHERE namespace LIKE 'code-intelligence:kg%'
      `).get() as { count: number };
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
   *
   * fix/init-v3-9-3 Fix 5: The whole scan is wrapped in a phase-level
   * watchdog. Inside, each file is indexed via `indexOneFile()` with a
   * per-file timeout so a single pathological file or a native-layer
   * stall (e.g. @ruvector/rvf-node fsync on an overlay filesystem) can
   * never block the init command indefinitely. Progress is logged every
   * PROGRESS_LOG_INTERVAL files so operators can see exactly where the
   * indexer is — and, if a timeout fires, which file was responsible.
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

      context.services.log(`  Scanning ${filesToIndex.length} source files...`);

      // Race the whole scan against a phase-level watchdog. If the cap
      // fires, we stop eating files and report how far we got.
      const scanResult = await this.runBoundedScan(
        kgService,
        filesToIndex,
        incremental,
        context,
      );

      kgService.destroy();
      await memory.dispose();

      if (scanResult.status === 'timeout') {
        context.services.warn(
          `  ⚠ Code intelligence pre-scan exceeded ${PHASE_TIMEOUT_MS / 1000}s phase cap. ` +
          `Indexed ${scanResult.entries} entries before timeout. ` +
          `Last file: ${scanResult.timeoutFile ?? '(unknown)'}. ` +
          `Init is continuing — re-run 'aqe code index' later, or report this file to ` +
          `https://github.com/proffesor-for-testing/agentic-qe/issues.`
        );
        return scanResult;
      }

      if (scanResult.status === 'indexed') {
        const label = incremental ? 'Delta indexed' : 'Indexed';
        context.services.log(`  ${label} ${scanResult.entries} entries to ${dbPath}`);

        // Also populate the hypergraph tables (hypergraph_nodes/hypergraph_edges)
        // so CLI/MCP hypergraph queries work immediately after init
        await this.buildHypergraph(dbPath, filesToIndex, context);
      }

      return scanResult;
    } catch (error) {
      context.services.warn(`Code intelligence scan warning: ${error}`);
      return { status: 'skipped', entries: 0 };
    }
  }

  /**
   * Drive file-by-file indexing with per-file and phase-level timeouts.
   *
   * fix/init-v3-9-3 Fix 5. This method is the reason v3.9.3 can survive
   * pathological files and native-layer stalls that hung v3.9.1/v3.9.2.
   *
   * Invariants:
   *   - A single file cannot block longer than PER_FILE_TIMEOUT_MS.
   *   - The whole loop cannot block longer than PHASE_TIMEOUT_MS.
   *   - Progress is observable via structured log lines.
   *   - Partial results are kept — on timeout we return the entries
   *     indexed so far, not zero.
   */
  private async runBoundedScan(
    kgService: import('../../domains/code-intelligence/services/knowledge-graph.js').KnowledgeGraphService,
    filesToIndex: string[],
    incremental: boolean,
    context: InitContext,
  ): Promise<CodeIntelligenceResult> {
    // Use the public index() with a one-file array per call so we can
    // attach a per-file timeout and log progress.
    let totalNodes = 0;
    let totalEdges = 0;
    let processed = 0;
    let lastFile = '';
    const startedAt = Date.now();
    let timedOut = false;

    // Clear once up-front if this is a full rebuild. The per-file calls
    // below must not clear between files.
    if (!incremental) {
      await kgService.clear();
    }

    // Project-relative path helper for shorter per-file log lines.
    const projectRoot = context.projectRoot;
    const rel = (p: string): string =>
      p.startsWith(projectRoot) ? p.slice(projectRoot.length + 1) : p;

    for (const file of filesToIndex) {
      // Phase-level cap. Checked between files so in-flight work can
      // still complete bounded by its own per-file cap.
      //
      // IMPORTANT: This check only fires BETWEEN file iterations. If a
      // single call to kgService.index() blocks the Node event loop
      // inside synchronous native code (e.g. an @ruvector/router
      // native insert stalls on a specific vector shape), this check
      // never runs and the phase appears to hang past PHASE_TIMEOUT_MS.
      // That's the v3.9.3 failure mode observed on ruview. See
      // shouldRun() for the v3.9.4 AQE_SKIP_CODE_INDEX escape hatch
      // and the tracking issue for the killable-worker proper fix.
      if (Date.now() - startedAt > PHASE_TIMEOUT_MS) {
        timedOut = true;
        break;
      }

      lastFile = file;

      // fix/init-v3-9-4 Fix B: log EVERY file *before* we start
      // processing it, not at 100-file intervals. This is the single
      // most important diagnostic — when the next hang happens, the
      // last log line will name the exact file that stalls, which is
      // the data we need to fix the underlying native cause.
      context.services.log(
        `  [${processed + 1}/${filesToIndex.length}] ${rel(file)}`,
      );

      try {
        const indexResult = await this.withTimeout(
          kgService.index({
            paths: [file],
            incremental: true,      // don't clear — we already cleared above
            includeTests: true,
          }),
          PER_FILE_TIMEOUT_MS,
          file,
        );

        if (indexResult.success) {
          totalNodes += indexResult.value.nodesCreated;
          totalEdges += indexResult.value.edgesCreated;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('AQE_PER_FILE_TIMEOUT')) {
          // Skip the pathological file, log, and keep going.
          context.services.warn(
            `  ⚠ Skipped ${rel(file)} — indexing exceeded ${PER_FILE_TIMEOUT_MS / 1000}s`,
          );
        } else {
          context.services.warn(`  ⚠ Failed to index ${rel(file)}: ${message}`);
        }
      }

      processed++;
    }

    const entries = totalNodes + totalEdges;
    if (timedOut) {
      return { status: 'timeout', entries, timeoutFile: lastFile };
    }
    return { status: 'indexed', entries };
  }

  /**
   * Race a promise against a timer. On timeout, rejects with a tagged
   * error so the caller can distinguish timeouts from real failures.
   *
   * The tagged error prefix 'AQE_PER_FILE_TIMEOUT' is matched in
   * runBoundedScan to differentiate per-file timeouts from other errors.
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fileLabel: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`AQE_PER_FILE_TIMEOUT: ${fileLabel}`));
      }, timeoutMs);
      // unref so the timer doesn't keep the event loop alive if the
      // promise resolves via the fast path.
      if (typeof timer.unref === 'function') timer.unref();

      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /**
   * Build hypergraph from indexed files.
   * Uses shared extractor to populate hypergraph_nodes/hypergraph_edges in memory.db.
   */
  private async buildHypergraph(
    dbPath: string,
    filesToIndex: string[],
    context: InitContext
  ): Promise<void> {
    try {
      const { extractCodeIndex } = await import('../../shared/code-index-extractor.js');
      const { createHypergraphEngine } = await import('../../integrations/ruvector/hypergraph-engine.js');
      const db = openDatabase(dbPath);

      const engine = await createHypergraphEngine({
        db,
        maxTraversalDepth: 10,
        maxQueryResults: 1000,
        enableVectorSearch: false,
      });

      const codeIndexResult = await extractCodeIndex(filesToIndex);
      const buildResult = await engine.buildFromIndexResult(codeIndexResult);
      db.close();

      const total = buildResult.nodesCreated + buildResult.edgesCreated;
      if (total > 0) {
        context.services.log(`  Hypergraph: ${buildResult.nodesCreated} nodes, ${buildResult.edgesCreated} edges`);
      }
    } catch (error) {
      // Non-fatal: hypergraph is supplementary
      context.services.warn?.(`  Hypergraph build skipped: ${error}`);
    }
  }

  /**
   * Read the indexedAt timestamp from KG metadata (uses provided db connection)
   */
  private getLastIndexedAt(db: ReturnType<typeof openDatabase>): Date | null {
    try {
      const row = db.prepare(`
        SELECT value FROM kv_store
        WHERE namespace = 'code-intelligence:kg'
          AND key = 'metadata:index'
      `).get() as { value: string } | undefined;

      if (!row) return null;
      const metadata = safeJsonParse(row.value);
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
