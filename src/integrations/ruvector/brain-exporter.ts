/**
 * QE Brain Export/Import System
 *
 * Exports learning state (25 tables) into a portable directory format
 * that can be imported by another AQE instance.
 *
 * Export format (.aqe-brain directory):
 *   manifest.json            -- BrainExportManifest with checksum
 *   patterns.jsonl           -- One QE pattern per line
 *   q-values.jsonl           -- Q-learning state-action values
 *   dream-cycles.jsonl       -- Dream cycle metadata
 *   dream-insights.jsonl     -- Dream cycle discoveries
 *   witness-chain.jsonl      -- Witness chain entries
 *   pattern-embeddings.jsonl -- Pattern vector embeddings
 *   captured-experiences.jsonl, sona-patterns.jsonl, trajectories.jsonl, ...
 *
 * Safety: Export uses a READ-ONLY connection (WAL mode, no write lock).
 * Import validates manifest checksum before merging.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import Database from 'better-sqlite3';
import { safeJsonParse } from '../../shared/safe-json.js';

import {
  sha256,
  queryAll,
  queryIterator,
  countRows,
  domainFilterForColumn,
  writeJsonl,
  writeJsonlStreaming,
  readJsonl,
  ensureTargetTables,
  serializeRowBlobs,
  deserializeRowBlobs,
  mergeGenericRow,
  mergeAppendOnlyRow,
  TABLE_CONFIGS,
  PK_COLUMNS,
  CONFIDENCE_COLUMNS,
  TIMESTAMP_COLUMNS,
  type MergeStrategy,
  type MergeResult,
  type TableExportConfig,
  type PatternRow,
  type QValueRow,
  type DreamInsightRow,
  type WitnessRow,
} from './brain-shared.js';

// Re-export shared types for external consumers
export type { MergeStrategy, MergeResult, PatternRow, QValueRow, DreamInsightRow, WitnessRow };

// ============================================================================
// Types
// ============================================================================

export interface BrainExportManifest {
  readonly version: '1.0' | '3.0';
  readonly exportedAt: string;
  readonly sourceDb: string;
  readonly stats: {
    readonly patternCount: number;
    readonly vectorCount: number;
    readonly qValueCount: number;
    readonly dreamInsightCount: number;
    readonly witnessChainLength: number;
    readonly totalRecords: number;
  };
  readonly domains: readonly string[];
  readonly checksum: string;
  readonly tableRecordCounts?: Record<string, number>;
}

export interface BrainExportOptions {
  readonly domains?: readonly string[];
  readonly includeVectors?: boolean;
  readonly includeQValues?: boolean;
  readonly includeDreamInsights?: boolean;
  readonly includeWitnessChain?: boolean;
  readonly outputPath: string;
}

export interface BrainImportOptions {
  readonly mergeStrategy: MergeStrategy;
  readonly dryRun?: boolean;
}

export interface BrainImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly conflicts: number;
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Tables that can be disabled via BrainExportOptions flags. */
const OPTIONAL_TABLE_FLAGS: Record<string, keyof BrainExportOptions> = {
  rl_q_values: 'includeQValues',
  dream_insights: 'includeDreamInsights',
  dream_cycles: 'includeDreamInsights',
  witness_chain: 'includeWitnessChain',
  vectors: 'includeVectors',
};

/** Check if a table should be exported given the options. */
function shouldExportTable(config: TableExportConfig, options: BrainExportOptions): boolean {
  const flag = OPTIONAL_TABLE_FLAGS[config.tableName] as keyof BrainExportOptions | undefined;
  if (flag && options[flag] === false) return false;
  return true;
}

/** Row count above which we stream to JSONL instead of buffering all in memory. */
const STREAMING_THRESHOLD = 10_000;

/**
 * Export rows for a single table config, handling domain filtering and BLOB serialization.
 * For tables exceeding STREAMING_THRESHOLD rows, streams directly to disk
 * to avoid holding 68K+ rows (e.g., concept_edges) in memory.
 */
function exportTableRows(
  db: Database.Database, config: TableExportConfig, options: BrainExportOptions, outDir: string
): { count: number; rows?: unknown[] } {
  if (!shouldExportTable(config, options)) {
    writeJsonl(join(outDir, config.fileName), []);
    return { count: 0, rows: [] };
  }

  const [where, params] = config.domainColumn
    ? domainFilterForColumn(options.domains, config.domainColumn)
    : [undefined, [] as string[]];

  const rowCount = countRows(db, config.tableName, where, params);

  // For large tables, stream to avoid OOM
  if (rowCount >= STREAMING_THRESHOLD) {
    const blobCols = config.blobColumns;
    const transform = blobCols && blobCols.length > 0
      ? (r: unknown) => serializeRowBlobs(r as Record<string, unknown>, blobCols)
      : undefined;
    const count = writeJsonlStreaming(
      join(outDir, config.fileName),
      queryIterator(db, config.tableName, where, params),
      transform,
    );
    return { count };
  }

  // For smaller tables, buffer in memory (needed for domain collection, etc.)
  let rows = queryAll(db, config.tableName, where, params);

  // Base64-encode BLOB columns for JSON safety
  if (config.blobColumns && config.blobColumns.length > 0) {
    rows = rows.map(r => serializeRowBlobs(r as Record<string, unknown>, config.blobColumns!));
  }

  writeJsonl(join(outDir, config.fileName), rows);
  return { count: rows.length, rows };
}

/**
 * Compute a combined checksum over all JSONL content files in an export.
 * Includes all files from TABLE_CONFIGS in deterministic order.
 */
export function computeChecksum(dir: string): string {
  const hashes: string[] = [];
  for (const config of TABLE_CONFIGS) {
    const filePath = join(dir, config.fileName);
    if (existsSync(filePath)) {
      hashes.push(sha256(readFileSync(filePath, 'utf-8')));
    } else {
      hashes.push(sha256(''));
    }
  }
  return sha256(hashes.join(':'));
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export the QE brain state from a SQLite database into a portable directory.
 * Uses a read-only connection to avoid acquiring write locks.
 */
export function exportBrain(
  db: Database.Database,
  options: BrainExportOptions,
  sourceDbLabel = 'memory.db'
): BrainExportManifest {
  const outDir = resolve(options.outputPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  let totalRecords = 0;
  const tableRecordCounts: Record<string, number> = {};
  const domainSet = new Set<string>();

  // Export each table using TABLE_CONFIGS
  for (const config of TABLE_CONFIGS) {
    const result = exportTableRows(db, config, options, outDir);
    tableRecordCounts[config.tableName] = result.count;
    totalRecords += result.count;

    // Collect domains from pattern rows
    if (config.tableName === 'qe_patterns') {
      if (result.rows) {
        // Buffered path — collect from in-memory rows
        for (const p of result.rows as Array<{ qe_domain?: string }>) {
          if (p.qe_domain) domainSet.add(p.qe_domain);
        }
      } else if (result.count > 0) {
        // Streamed path — query domains separately
        const [where, params] = config.domainColumn
          ? domainFilterForColumn(options.domains, config.domainColumn)
          : [undefined, [] as string[]];
        const whereClause = where
          ? `WHERE ${where} AND qe_domain IS NOT NULL`
          : 'WHERE qe_domain IS NOT NULL';
        const domainSql = `SELECT DISTINCT qe_domain FROM qe_patterns ${whereClause}`;
        try {
          const domainRows = db.prepare(domainSql).all(...(params || [])) as Array<{ qe_domain: string }>;
          for (const r of domainRows) domainSet.add(r.qe_domain);
        } catch { /* best-effort domain collection */ }
      }
    }
  }

  // Special case: vectors count (for backward compat manifest stat)
  const vectorCount = options.includeVectors !== false ? countRows(db, 'vectors') : 0;

  const checksum = computeChecksum(outDir);

  const manifest: BrainExportManifest = {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    sourceDb: sourceDbLabel,
    stats: {
      patternCount: tableRecordCounts['qe_patterns'] || 0,
      vectorCount,
      qValueCount: tableRecordCounts['rl_q_values'] || 0,
      dreamInsightCount: tableRecordCounts['dream_insights'] || 0,
      witnessChainLength: tableRecordCounts['witness_chain'] || 0,
      totalRecords,
    },
    domains: [...domainSet].sort(),
    checksum,
    tableRecordCounts,
  };

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  return manifest;
}

// ============================================================================
// Import
// ============================================================================

/** The 4 original table names included in v1.0 exports. */
const V1_LEGACY_TABLES = new Set([
  'qe_patterns',
  'rl_q_values',
  'dream_insights',
  'witness_chain',
]);

/**
 * Determine which TABLE_CONFIGS entries to import based on manifest version.
 *
 * - v1.0 exports only contain the 4 original JSONL files.
 * - v3.0 (and any future version) exports contain all TABLE_CONFIGS files.
 * - Unknown versions attempt a full import with a console warning.
 */
function tablesToImport(version: string): readonly TableExportConfig[] {
  if (version === '1.0') {
    return TABLE_CONFIGS.filter(c => V1_LEGACY_TABLES.has(c.tableName));
  }
  if (version === '3.0') {
    return TABLE_CONFIGS;
  }
  // Unknown version — attempt full import with warning
  console.warn(
    `[brain-import] Unknown manifest version '${version}'. ` +
    'Attempting full import — some files may be missing.'
  );
  return TABLE_CONFIGS;
}

/**
 * Import a brain export directory into a target SQLite database.
 * Validates the manifest checksum before proceeding.
 *
 * Supports both v1.0 (4-table) and v3.0 (all-table) exports.
 */
export function importBrain(
  db: Database.Database,
  containerPath: string,
  options: BrainImportOptions
): BrainImportResult {
  const dir = resolve(containerPath);

  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest: BrainExportManifest = safeJsonParse<BrainExportManifest>(readFileSync(manifestPath, 'utf-8'));

  const actualChecksum = computeChecksum(dir);
  if (actualChecksum !== manifest.checksum) {
    throw new Error(
      `Checksum mismatch: expected ${manifest.checksum}, got ${actualChecksum}. ` +
      'The export may have been tampered with or corrupted.'
    );
  }

  const configs = tablesToImport(manifest.version);

  if (options.dryRun) {
    let total = 0;
    for (const config of configs) {
      const rows = readJsonl(join(dir, config.fileName), safeJsonParse);
      total += rows.length;
    }
    return { imported: total, skipped: 0, conflicts: 0 };
  }

  ensureTargetTables(db);

  let imported = 0;
  let skipped = 0;
  let conflicts = 0;

  // Wrap entire import in a transaction for atomicity (Risk #3 from plan)
  const importAll = db.transaction(() => {
    for (const config of configs) {
      const filePath = join(dir, config.fileName);
      let rows = readJsonl<Record<string, unknown>>(filePath, safeJsonParse);

      // Deserialize BLOBs from Base64
      if (config.blobColumns && config.blobColumns.length > 0) {
        rows = rows.map(r => deserializeRowBlobs(r, config.blobColumns!));
      }

      for (const row of rows) {
        let result: MergeResult;

        if (config.dedupColumns && config.dedupColumns.length > 0) {
          // Append-only tables (witness_chain, qe_pattern_usage)
          result = mergeAppendOnlyRow(db, config.tableName, row, config.dedupColumns);
        } else {
          // Tables with TEXT PK
          const idCol = PK_COLUMNS[config.tableName] || 'id';
          const tsCol = TIMESTAMP_COLUMNS[config.tableName];
          const confCol = CONFIDENCE_COLUMNS[config.tableName];
          result = mergeGenericRow(db, config.tableName, row, idCol, options.mergeStrategy, tsCol, confCol);
        }

        imported += result.imported;
        skipped += result.skipped;
        conflicts += result.conflicts;
      }
    }
  });

  importAll();

  return { imported, skipped, conflicts };
}

// ============================================================================
// Brain Info
// ============================================================================

/** Read and return the manifest from a brain export directory. */
export function brainInfo(containerPath: string): BrainExportManifest {
  const dir = resolve(containerPath);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  return safeJsonParse<BrainExportManifest>(readFileSync(manifestPath, 'utf-8'));
}
