/**
 * RVF Brain Export/Import — exports QE brain state into a single portable
 * `.rvf` file using the @ruvector/rvf-node native binding via rvf-native-adapter.
 * Falls back to JSONL directory format when the native binding is unavailable.
 */

import { existsSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import Database from 'better-sqlite3';
import {
  createRvfStore,
  openRvfStore,
  openRvfStoreReadonly,
  isRvfNativeAvailable,
  type RvfIngestEntry,
} from './rvf-native-adapter.js';

import {
  sha256,
  tableExists,
  queryAll,
  domainFilterForColumn,
  runImportTransaction,
  mergeGenericRow,
  remapPatternReferences,
  mergeAppendOnlyRow,
  TABLE_CONFIGS,
  TABLE_BLOB_COLUMNS,
  PK_COLUMNS,
  CONFIDENCE_COLUMNS,
  TIMESTAMP_COLUMNS,
  serializeRowBlobs,
  deserializeRowBlobs,
  type MergeStrategy,
  type MergeResult,
} from './brain-shared.js';
import { appendBrainImportWitness } from './brain-import-audit.js';
import { assertNotPoorerThanMirror, RvfMirrorGuardError, type RichnessPolicy } from './brain-rvf-richness.js';

// --- Types ---

export interface RvfBrainManifest {
  readonly version: '2.0' | '3.0';
  readonly format: 'rvf';
  readonly exportedAt: string;
  readonly sourceDb: string;
  readonly stats: {
    readonly patternCount: number;
    readonly embeddingCount: number;
    readonly qValueCount: number;
    readonly dreamInsightCount: number;
    readonly witnessChainLength: number;
    readonly totalRecords?: number;
    /** Per-table row counts used by the recovery-mirror richness guard. */
    readonly tableCounts?: Readonly<Record<string, number>>;
    /** Regenerable cache rows left out of the kernel, per table (#1238). */
    readonly skippedCacheRows?: Readonly<Record<string, number>>;
  };
  readonly domains: readonly string[];
  readonly checksum: string;
  readonly rvfStatus: {
    readonly totalVectors: number;
    readonly totalSegments: number;
    readonly fileSizeBytes: number;
  };
  /** Ed25519 signature of the kernel data (hex-encoded, opt-in) */
  readonly signature?: string;
  /** Key identifier for the signer (opt-in) */
  readonly signerKeyId?: string;
  /** RVF file lineage tracking */
  readonly lineage?: {
    readonly fileId: string;
    readonly parentId: string | null;
    readonly lineageDepth: number;
  };
}

export interface RvfBrainExportOptions {
  readonly outputPath: string;
  readonly domains?: readonly string[];
  readonly dimension?: number;
  /** Enable Ed25519 signing of the kernel (requires native support) */
  readonly sign?: boolean;
  /** Key identifier to record in manifest when signing */
  readonly signerKeyId?: string;
  /** Explicit operator acknowledgement that a richer existing mirror may be replaced. */
  readonly allowOverwriteRicher?: boolean;
  /**
   * The mirror to compare richness against, when it is not `outputPath`
   * (#1251: the checkpoint hook exports to a temp path, then renames).
   */
  readonly compareWithPath?: string;
  /** How much shrinkage the richness guard tolerates. Defaults to 'strict'. */
  readonly richnessPolicy?: RichnessPolicy;
  /** Kernel size ceiling in bytes. Defaults to RVF_MAX_KERNEL_BYTES; lowered only by tests. */
  readonly maxKernelBytes?: number;
}

export interface RvfBrainImportOptions {
  readonly mergeStrategy: MergeStrategy;
  readonly dryRun?: boolean;
}

export interface RvfBrainImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly embeddingsRestored: number;
}

// --- Export ---

/**
 * Largest kernel image @ruvector/rvf-node accepts. One byte more and
 * `embedKernel` fails with a misleading `RVF error 0x0303: FsyncFailed`
 * (#1238; measured 134,217,728 B ok, 134,217,729 B fails).
 */
export const RVF_MAX_KERNEL_BYTES = 128 * 1024 * 1024;

/**
 * Vector ids written by the code-intelligence domain (KG nodes, semantic code
 * index, C4 diagrams). They are derived from source code and rebuilt by
 * `aqe code index`, so they stay out of the brain kernel (#1238).
 */
export const CODE_INDEX_VECTOR_ID_PREFIX = 'code-intelligence:';

const CODE_INDEX_VECTOR_MATCH = `substr(id, 1, ${CODE_INDEX_VECTOR_ID_PREFIX.length}) = ?`;

function isCodeIndexVectorRow(tableName: string, row: unknown): boolean {
  if (tableName !== 'vectors') return false;
  const id = (row as { id?: unknown }).id;
  return typeof id === 'string' && id.startsWith(CODE_INDEX_VECTOR_ID_PREFIX);
}

/** Thrown before any native call when the kernel would exceed the RVF limit. */
export class RvfKernelTooLargeError extends Error {
  readonly code = 'RVF_KERNEL_TOO_LARGE';

  constructor(
    readonly kernelBytes: number,
    readonly limitBytes: number,
    readonly tableBytes: Readonly<Record<string, number>>,
    readonly complete: boolean,
  ) {
    const largest = Object.entries(tableBytes)
      .filter(([, bytes]) => bytes >= 1024 * 1024)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([table, bytes]) => `${table} ${formatMb(bytes)}`)
      .join(', ');
    super(
      `RVF_KERNEL_TOO_LARGE: the brain kernel needs ${complete ? '' : 'at least '}` +
      `${formatMb(kernelBytes)}, over the ${formatMb(limitBytes)} limit of the native RVF writer.` +
      (largest ? ` Largest tables: ${largest}.` : '') +
      ' Nothing was written. ' +
      `Use --format jsonl (no size limit), or reduce the largest learning tables first.`,
    );
    this.name = 'RvfKernelTooLargeError';
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sidecar suffixes that make up a complete store on disk. `''` is the store
 * itself; the adapter writes `.idmap.json` on close, and we write the manifest.
 */
const RVF_STORE_SUFFIXES = ['', '.idmap.json', '.manifest.json'] as const;

/**
 * Everything an abandoned tmp export can leave behind. `.lock` is cleaned up
 * but deliberately absent from RVF_STORE_SUFFIXES — renaming a lock into the
 * final path is the very corruption this fix exists to prevent.
 */
const RVF_CLEANUP_SUFFIXES = [...RVF_STORE_SUFFIXES, '.lock'] as const;

/** Best-effort removal of a store and its sidecars at `base`. */
function removeStoreFiles(base: string): void {
  for (const suffix of RVF_CLEANUP_SUFFIXES) {
    try {
      const p = `${base}${suffix}`;
      if (existsSync(p)) unlinkSync(p);
    } catch {
      // best-effort — a leftover tmp is inert, unlike a corrupt final store
    }
  }
}

/**
 * Remove tmp stores orphaned by killed exports (#563). Each interrupted export
 * strands a full-size tmp store, so on a project where the checkpoint hook is
 * killed regularly these would accumulate unbounded.
 *
 * Only tmps whose owning pid is gone are removed: a live pid means a concurrent
 * export is mid-write, and deleting its tmp would corrupt exactly what this
 * change exists to protect.
 */
function sweepStaleTmpFiles(outPath: string): void {
  const dir = dirname(outPath);
  const prefix = `${basename(outPath)}.tmp.`;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    // `<name>.rvf.tmp.<pid>` and its `<...>.tmp.<pid>.idmap.json` siblings.
    const pid = Number.parseInt(entry.slice(prefix.length).split('.')[0], 10);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (pid !== process.pid && isPidAlive(pid)) continue;
    try {
      unlinkSync(join(dir, entry));
    } catch {
      // best-effort
    }
  }
}

/** True when a process with `pid` exists (signal 0 probes without delivering). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but belongs to another user — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Export brain state to a single `.rvf` file with vector embeddings + kernel. */
export function exportBrainToRvf(
  db: Database.Database,
  options: RvfBrainExportOptions,
  sourceDbLabel = 'memory.db'
): RvfBrainManifest {
  if (!isRvfNativeAvailable()) {
    throw new Error(
      '@ruvector/rvf-node is not available. Install it or use --format jsonl instead.'
    );
  }

  const outPath = resolve(options.outputPath);
  const dimension = options.dimension ?? 384;

  // Issue #563: build the store at a private tmp path and rename it over the
  // final path only once it is closed and complete. The previous code deleted
  // the old store and then built the new one in place, so any interruption
  // (hook timeout, session teardown, SIGKILL) left a created-but-incomplete
  // store that could neither be opened (ManifestNotFound) nor created over
  // (FsyncFailed) — permanently disabling the RVF backend. With tmp+rename an
  // interrupted export leaves the *previous* good store untouched and orphans
  // only an inert tmp file, which the next export sweeps.
  const tmpPath = `${outPath}.tmp.${process.pid}`;
  sweepStaleTmpFiles(outPath);
  removeStoreFiles(tmpPath);

  // --- Serialize all tables using TABLE_CONFIGS, before any native call ---
  // Issue #1238: the native writer has a hard kernel ceiling, so each table is
  // serialized once and measured as it goes. An oversized brain fails here,
  // without creating a store or spending time on the rest of the tables.
  const maxKernelBytes = options.maxKernelBytes ?? RVF_MAX_KERNEL_BYTES;
  const allTableData: Record<string, unknown[]> = {};
  const tableJson: Array<[string, string]> = [];
  const tableBytes: Record<string, number> = {};
  const tableCounts: Record<string, number> = {};
  const skippedCacheRows: Record<string, number> = {};
  const domainSet = new Set<string>();
  let totalRecords = 0;
  let kernelBytes = 0;

  for (const config of TABLE_CONFIGS) {
    let [where, params]: [string | undefined, unknown[]] = config.domainColumn
      ? domainFilterForColumn(options.domains, config.domainColumn)
      : [undefined, []];

    if (config.tableName === 'vectors' && tableExists(db, 'vectors')) {
      const { n } = db.prepare(
        `SELECT COUNT(*) AS n FROM vectors WHERE ${CODE_INDEX_VECTOR_MATCH}`
      ).get(CODE_INDEX_VECTOR_ID_PREFIX) as { n: number };
      if (n > 0) skippedCacheRows.vectors = n;
      where = `(id IS NULL OR NOT ${CODE_INDEX_VECTOR_MATCH})`;
      params = [CODE_INDEX_VECTOR_ID_PREFIX];
    }

    let rows = queryAll(db, config.tableName, where, params);

    if (options.domains && options.domains.length > 0) {
      const manifestIds = new Set(
        (allTableData.learning_evidence_manifests ?? []).map(
          row => (row as { id: string }).id
        )
      );
      const patternIds = new Set(
        (allTableData.qe_patterns ?? []).map(row => (row as { id: string }).id)
      );
      if (['learning_evidence_segments', 'learning_segment_edges', 'learning_evidence_admissions'].includes(config.tableName)) {
        rows = rows.filter(row => manifestIds.has((row as { manifest_id: string }).manifest_id));
      } else if (config.tableName === 'pattern_manifest_lineage') {
        rows = rows.filter(row => {
          const lineage = row as { manifest_id: string; pattern_id: string };
          return manifestIds.has(lineage.manifest_id) && patternIds.has(lineage.pattern_id);
        });
      } else if (config.tableName === 'pattern_segment_lineage') {
        rows = rows.filter(row => {
          const lineage = row as { manifest_id: string; pattern_id: string };
          return manifestIds.has(lineage.manifest_id) && patternIds.has(lineage.pattern_id);
        });
      }
    }

    if (config.tableName === 'qe_patterns') {
      for (const p of rows as Array<{ qe_domain?: string }>) {
        if (p.qe_domain) domainSet.add(p.qe_domain);
      }
    }

    // Serialize BLOBs to Base64 for JSON storage
    const blobCols = TABLE_BLOB_COLUMNS[config.tableName];
    if (blobCols && blobCols.length > 0) {
      rows = rows.map(r => serializeRowBlobs(r as Record<string, unknown>, blobCols));
    }

    // Only these two tables are read back (domain-filtered lineage above).
    if (config.tableName === 'qe_patterns' || config.tableName === 'learning_evidence_manifests') {
      allTableData[config.tableName] = rows;
    }
    tableCounts[config.tableName] = rows.length;
    totalRecords += rows.length;

    const json = JSON.stringify(rows);
    tableJson.push([config.tableName, json]);
    tableBytes[config.tableName] = Buffer.byteLength(json);
    kernelBytes += tableBytes[config.tableName];
    if (kernelBytes > maxKernelBytes) {
      throw new RvfKernelTooLargeError(kernelBytes, maxKernelBytes, tableBytes, false);
    }
  }

  // Same bytes JSON.stringify would produce for { version, format, exportedAt,
  // sourceDb, domains, tables }, assembled from the per-table JSON above.
  const exportedAt = new Date().toISOString();
  const domains = [...domainSet].sort();
  const brainJson =
    `{"version":"3.0","format":"rvf","exportedAt":${JSON.stringify(exportedAt)},` +
    `"sourceDb":${JSON.stringify(sourceDbLabel)},"domains":${JSON.stringify(domains)},"tables":{` +
    tableJson.map(([tableName, json]) => `${JSON.stringify(tableName)}:${json}`).join(',') +
    '}}';
  tableJson.length = 0;
  const kernelBuffer = Buffer.from(brainJson);
  if (kernelBuffer.length > maxKernelBytes) {
    throw new RvfKernelTooLargeError(kernelBuffer.length, maxKernelBytes, tableBytes, true);
  }
  const checksum = sha256(brainJson);

  // Create RVF container via adapter (handles idmap automatically)
  const rvf = createRvfStore(tmpPath, dimension);
  let closed = false;

  try {
    // --- Ingest vector embeddings into HNSW ---
    let embeddingCount = 0;
    const embeddingEntries: RvfIngestEntry[] = [];

    if (tableExists(db, 'qe_pattern_embeddings')) {
      const hasSpaceId = (db.prepare("PRAGMA table_info('qe_pattern_embeddings')").all() as Array<{ name: string }>)
        .some((column) => column.name === 'space_id');
      const rows = db.prepare(
        `SELECT pattern_id, embedding, dimension, ${hasSpaceId ? 'space_id' : 'NULL'} AS space_id
           FROM qe_pattern_embeddings`
      ).all() as Array<{ pattern_id: string; embedding: Buffer; dimension: number; space_id: string | null }>;
      for (const row of rows) {
        // Legacy vectors without executable provenance remain in the embedded
        // SQLite kernel for re-embedding, but must never enter the portable ANN
        // index where their space would be indistinguishable from query vectors.
        if (row.embedding && row.dimension === dimension && row.space_id) {
          embeddingEntries.push({
            id: `pe:${row.pattern_id}`,
            vector: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, dimension),
            metadata: { tableName: 'qe_pattern_embeddings', spaceId: row.space_id },
          });
        }
      }
    }

    // captured_experiences and sona_patterns are still included in the kernel
    // below, but their schemas do not yet carry embedding-space provenance.
    // Mixing them into this ANN index would violate #633 even when dimensions
    // and model labels happen to match, so they are intentionally excluded
    // until their own write paths persist a space_id.

    if (embeddingEntries.length > 0) {
      const result = rvf.ingest(embeddingEntries);
      embeddingCount = result.accepted;
    }

    // --- Embed full brain data as kernel ---
    rvf.embedKernel(kernelBuffer);

    // Optional Ed25519 signing
    const signature = options.sign ? rvf.sign(kernelBuffer) ?? undefined : undefined;
    const signerKeyId = signature ? (options.signerKeyId ?? 'default') : undefined;

    // Lineage tracking
    const fId = rvf.fileId();
    const lineage: RvfBrainManifest['lineage'] = fId
      ? { fileId: fId, parentId: rvf.parentId(), lineageDepth: rvf.lineageDepth() }
      : undefined;

    const status = rvf.status();

    const manifest: RvfBrainManifest = {
      version: '3.0',
      format: 'rvf',
      exportedAt,
      sourceDb: sourceDbLabel,
      stats: {
        patternCount: tableCounts['qe_patterns'] ?? 0,
        embeddingCount,
        qValueCount: tableCounts['rl_q_values'] ?? 0,
        dreamInsightCount: tableCounts['dream_insights'] ?? 0,
        witnessChainLength: tableCounts['witness_chain'] ?? 0,
        totalRecords,
        tableCounts,
        ...(Object.keys(skippedCacheRows).length > 0 ? { skippedCacheRows } : {}),
      },
      domains,
      checksum,
      rvfStatus: {
        totalVectors: status.totalVectors,
        totalSegments: status.totalSegments,
        fileSizeBytes: status.fileSizeBytes,
      },
      // Attach optional fields only if present
      ...(signature ? { signature, signerKeyId } : {}),
      ...(lineage ? { lineage } : {}),
    };

    // Freeze the RVF file after signing to prevent accidental modification
    if (signature) {
      try { rvf.freeze(); } catch { /* best-effort */ }
    }

    // Persist manifest as sidecar JSON alongside the .rvf file
    writeFileSync(`${tmpPath}.manifest.json`, JSON.stringify(manifest, null, 2), 'utf-8');

    // Close before promoting: close() flushes the store and writes the idmap
    // sidecar, so renaming any earlier would publish an incomplete store.
    rvf.close();
    closed = true;

    // Issue #629: a stage-2 mirror must not be destroyed when SQLite has just
    // been recreated from seed data. Compare every mirrored table in the fully
    // materialized candidate with the still-published store immediately before
    // promotion. Inspection is fail-closed when the RVF itself remains readable
    // but its kernel cannot yield a complete table inventory. A genuinely
    // unreadable/corrupt RVF remains replaceable to preserve #563 recovery.
    // #1251: the Stop-hook checkpoint writes to a temp path and names the
    // published checkpoint in `compareWithPath`, so it is compared here too.
    const comparePath = options.compareWithPath ? resolve(options.compareWithPath) : outPath;
    if (existsSync(comparePath) && !options.allowOverwriteRicher) {
      let existing: RvfBrainManifest | undefined;
      try {
        // Code-index vectors are no longer exported (#1238), so an older mirror
        // that still holds them is compared on the rows both exports carry.
        existing = readBrainInfo(comparePath, true);
      } catch (error) {
        if (hasReadableBrainKernel(comparePath) || !isKnownUnusableRvfError(error)) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new RvfMirrorGuardError(
            'RVF_MIRROR_INSPECTION_AMBIGUOUS',
            `the existing mirror is readable but its richness could not be established ` +
            `(${detail}). Preserve/import it before retrying, or repeat with ` +
            `--force-overwrite-richer after preserving a backup.`,
          );
        }
      }

      if (existing) {
        assertNotPoorerThanMirror(
          TABLE_CONFIGS.map(({ tableName }) => tableName),
          existing.stats.tableCounts,
          manifest.stats.tableCounts!,
          options.richnessPolicy,
        );
      }
    }

    // Promote tmp → final. The store itself goes last: until it lands, the
    // previous store (if any) is still the one on disk, and a crash mid-promote
    // leaves the old store readable rather than a half-written new one.
    for (const suffix of [...RVF_STORE_SUFFIXES].reverse()) {
      const from = `${tmpPath}${suffix}`;
      const to = `${outPath}${suffix}`;
      if (existsSync(from)) {
        renameSync(from, to);
      } else if (existsSync(to)) {
        // No new sidecar produced — drop the stale one so it can't be read
        // against the new store.
        unlinkSync(to);
      }
    }

    return manifest;
  } catch (err) {
    if (!closed) {
      try { rvf.close(); } catch { /* best-effort */ }
    }
    removeStoreFiles(tmpPath);
    throw err;
  }
}

// --- Import ---

interface BrainKernelData {
  version: string;
  format: string;
  tables?: Record<string, Record<string, unknown>[]>;
  // Legacy v2.0 format fields (backward compat)
  patterns?: unknown[];
  qValues?: unknown[];
  dreamInsights?: unknown[];
  witnessChain?: unknown[];
}

/**
 * Distinguish a corrupt/unopenable store (#563, replaceable) from a readable
 * store whose richness inspection failed (ambiguous, therefore protected).
 */
function hasReadableBrainKernel(rvfPath: string): boolean {
  let rvf: ReturnType<typeof openRvfStoreReadonly> | undefined;
  try {
    rvf = openRvfStoreReadonly(resolve(rvfPath));
    const kernel = rvf.extractKernel();
    return Boolean(kernel?.image);
  } catch {
    return false;
  } finally {
    try { rvf?.close(); } catch { /* best-effort probe cleanup */ }
  }
}

/**
 * Only known structural corruption is replaceable without an operator
 * override. Permission, locking, I/O, and programmer errors are ambiguous and
 * must fail closed instead of being mistaken for disposable corruption.
 */
function isKnownUnusableRvfError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ManifestNotFound|InvalidMagic|ChecksumMismatch|CorruptStore/i.test(message);
}

/** Legacy field-to-table mapping for older RVF exports. */
const LEGACY_FIELD_MAP: Record<string, string> = {
  patterns: 'qe_patterns',
  qValues: 'rl_q_values',
  dreamInsights: 'dream_insights',
  witnessChain: 'witness_chain',
};

/** Import brain state from a `.rvf` file into a SQLite database. */
export function importBrainFromRvf(
  db: Database.Database,
  rvfPath: string,
  options: RvfBrainImportOptions
): RvfBrainImportResult {
  if (!isRvfNativeAvailable()) {
    throw new Error(
      '@ruvector/rvf-node is not available. Install it or use JSONL format.'
    );
  }

  const filePath = resolve(rvfPath);
  if (!existsSync(filePath)) {
    throw new Error(`RVF file not found: ${filePath}`);
  }

  // Open read-write so compact() can reclaim space after conflict resolution (4.5)
  const rvf = options.dryRun ? openRvfStoreReadonly(filePath) : openRvfStore(filePath);

  try {
    // --- Verify HNSW index integrity before importing (4.1) ---
    // Fresh RVF files report valid=false with totalEntries=0 and no errors —
    // that's normal (no witness chain to verify). Only reject when there are
    // actual entries that failed or explicit errors reported.
    const witness = rvf.verifyWitness();
    if (!witness.valid && (witness.totalEntries > 0 || witness.errors.length > 0)) {
      const errMsg = witness.errors.length > 0
        ? witness.errors.join('; ')
        : 'unknown integrity error';
      throw new Error(
        `RVF witness verification failed: ${errMsg}`
      );
    }

    const kernel = rvf.extractKernel();
    if (!kernel || !kernel.image) {
      throw new Error('No brain data found in RVF file (missing kernel segment)');
    }

    let brainData: BrainKernelData;
    try {
      brainData = JSON.parse(kernel.image.toString('utf-8'));
    } catch (parseErr) {
      throw new Error(`Failed to parse brain kernel data as JSON: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
    }



    let imported = 0;
    let skipped = 0;
    let conflicts = 0;
    let embeddingsRestored = 0;

    // Build a unified tables map (handles both new and legacy format)
    const tablesMap: Record<string, Record<string, unknown>[]> = {};
    if (brainData.tables) {
      Object.assign(tablesMap, brainData.tables);
    } else {
      // Legacy format: map old field names to table names
      for (const [field, tableName] of Object.entries(LEGACY_FIELD_MAP)) {
        const data = (brainData as unknown as Record<string, unknown>)[field];
        if (Array.isArray(data)) {
          tablesMap[tableName] = data as Record<string, unknown>[];
        }
      }
    }

    // Wrap entire import in a transaction for atomicity (Risk #3 from plan)
    const importAll = () => {
      const patternIds = new Map<string, string>();
      const patternWinners = new Map<string, string | null>();
      let sourceWitnessRows = 0;
      // Import in TABLE_CONFIGS order (FK-aware)
      for (const config of TABLE_CONFIGS) {
        let rows = tablesMap[config.tableName];
        if (!rows || !Array.isArray(rows)) continue;

        if (config.tableName === 'witness_chain') {
          // A source chain cannot be grafted into another store's live chain.
          sourceWitnessRows += rows.length;
          skipped += rows.length;
          continue;
        }

        // Deserialize BLOBs
        const blobCols = TABLE_BLOB_COLUMNS[config.tableName];
        if (blobCols && blobCols.length > 0) {
          rows = rows.map(r => deserializeRowBlobs(r, blobCols));
        }

        for (const originalRow of rows) {
          const row = remapPatternReferences(originalRow, patternIds);
          let result: MergeResult;
          if (config.dedupColumns && config.dedupColumns.length > 0) {
            result = mergeAppendOnlyRow(db, config.tableName, row, config.dedupColumns, config.preserveId);
          } else {
            const idCol = PK_COLUMNS[config.tableName] || 'id';
            const tsCol = TIMESTAMP_COLUMNS[config.tableName];
            const confCol = CONFIDENCE_COLUMNS[config.tableName];
            result = mergeGenericRow(db, config.tableName, row, idCol,
              options.mergeStrategy, tsCol, confCol, patternIds, patternWinners, originalRow.pattern_id);
          }
          if (result.imported) {
            for (const col of blobCols ?? []) {
              if (row[col] instanceof Buffer) embeddingsRestored++;
            }
          }
          imported += result.imported;
          skipped += result.skipped;
          conflicts += result.conflicts;
        }
      }
      appendBrainImportWitness(db, {
        sourceChecksum: sha256(kernel.image.toString('utf-8')),
        sourceWitnessRows,
        importedRecords: imported,
        skippedRecords: skipped,
        conflicts,
      });
      imported += 1;
    };

    runImportTransaction(db, options.dryRun ?? false, importAll);

    // Compact after conflict resolution (best-effort)
    if (!options.dryRun && conflicts > 0) { try { rvf.compact(); } catch { /* best-effort */ } }

    return { imported, skipped, conflicts, embeddingsRestored };
  } finally {
    rvf.close();
  }
}

// --- Info ---

/** Read brain info from an RVF file without importing. */
export function brainInfoFromRvf(rvfPath: string): RvfBrainManifest {
  return readBrainInfo(rvfPath, false);
}

/**
 * `excludeCodeIndex` drops code-index vector rows from `tableCounts`, which
 * makes them comparable with the counts of a current export.
 */
function readBrainInfo(rvfPath: string, excludeCodeIndex: boolean): RvfBrainManifest {
  if (!isRvfNativeAvailable()) {
    throw new Error('@ruvector/rvf-node is not available.');
  }

  const filePath = resolve(rvfPath);
  if (!existsSync(filePath)) {
    throw new Error(`RVF file not found: ${filePath}`);
  }

  const rvf = openRvfStoreReadonly(filePath);

  try {
    const kernel = rvf.extractKernel();
    if (!kernel || !kernel.image) {
      throw new Error('No brain data found in RVF file');
    }

    const brainJson = kernel.image.toString('utf-8');
    let brainData: BrainKernelData & {
      exportedAt?: string;
      sourceDb?: string;
      domains?: string[];
    };
    try {
      brainData = JSON.parse(brainJson);
    } catch (parseErr) {
      throw new Error(`Failed to parse brain kernel data as JSON: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
    }

    const status = rvf.status();
    const fileSize = statSync(filePath).size;

    const t = brainData.tables;
    const patternCount = t ? (t['qe_patterns']?.length ?? 0) : (brainData.patterns?.length ?? 0);
    const qValueCount = t ? (t['rl_q_values']?.length ?? 0) : (brainData.qValues?.length ?? 0);
    const dreamInsightCount = t ? (t['dream_insights']?.length ?? 0) : (brainData.dreamInsights?.length ?? 0);
    const witnessChainLength = t ? (t['witness_chain']?.length ?? 0) : (brainData.witnessChain?.length ?? 0);
    const tableCounts = t && typeof t === 'object' && !Array.isArray(t)
      ? Object.fromEntries(
          Object.entries(t)
            .filter((entry): entry is [string, Record<string, unknown>[]] => Array.isArray(entry[1]))
            .map(([tableName, rows]) => [
              tableName,
              excludeCodeIndex
                ? rows.filter(row => !isCodeIndexVectorRow(tableName, row)).length
                : rows.length,
            ]),
        )
      : undefined;

    return {
      version: '3.0',
      format: 'rvf',
      exportedAt: brainData.exportedAt ?? 'unknown',
      sourceDb: brainData.sourceDb ?? 'unknown',
      stats: {
        patternCount,
        embeddingCount: status.totalVectors,
        qValueCount,
        dreamInsightCount,
        witnessChainLength,
        ...(tableCounts ? { tableCounts } : {}),
      },
      domains: brainData.domains ?? [],
      checksum: sha256(brainJson),
      rvfStatus: {
        totalVectors: status.totalVectors,
        totalSegments: status.totalSegments,
        fileSizeBytes: fileSize,
      },
    };
  } finally {
    rvf.close();
  }
}

/**
 * Check if the native RVF binding is available on this platform.
 */
export function isRvfAvailable(): boolean {
  return isRvfNativeAvailable();
}
