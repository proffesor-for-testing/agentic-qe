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
  ensureTargetTables,
  mergeGenericRow,
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

  // Create RVF container via adapter (handles idmap automatically)
  const rvf = createRvfStore(tmpPath, dimension);
  let closed = false;

  try {
    // --- Export all tables using TABLE_CONFIGS ---
    const allTableData: Record<string, unknown[]> = {};
    const domainSet = new Set<string>();
    let totalRecords = 0;

    for (const config of TABLE_CONFIGS) {
      const [where, params] = config.domainColumn
        ? domainFilterForColumn(options.domains, config.domainColumn)
        : [undefined, [] as string[]];

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

      allTableData[config.tableName] = rows;
      totalRecords += rows.length;
    }

    // --- Ingest vector embeddings into HNSW ---
    let embeddingCount = 0;
    const embeddingEntries: RvfIngestEntry[] = [];

    if (tableExists(db, 'qe_pattern_embeddings')) {
      const rows = db.prepare(
        'SELECT pattern_id, embedding, dimension FROM qe_pattern_embeddings'
      ).all() as Array<{ pattern_id: string; embedding: Buffer; dimension: number }>;
      for (const row of rows) {
        if (row.embedding && row.dimension === dimension) {
          embeddingEntries.push({
            id: `pe:${row.pattern_id}`,
            vector: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, dimension),
            metadata: { tableName: 'qe_pattern_embeddings' },
          });
        }
      }
    }

    if (tableExists(db, 'captured_experiences')) {
      const rows = db.prepare(
        'SELECT id, embedding, embedding_dimension, domain, quality FROM captured_experiences WHERE embedding IS NOT NULL'
      ).all() as Array<{
        id: string; embedding: Buffer; embedding_dimension: number;
        domain?: string; quality?: number;
      }>;
      for (const row of rows) {
        if (row.embedding_dimension === dimension) {
          embeddingEntries.push({
            id: `exp:${row.id}`,
            vector: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, dimension),
            metadata: {
              tableName: 'captured_experiences',
              domain: row.domain,
              confidence: row.quality,
            },
          });
        }
      }
    }

    if (tableExists(db, 'sona_patterns')) {
      const rows = db.prepare(
        'SELECT id, state_embedding, domain, confidence FROM sona_patterns WHERE state_embedding IS NOT NULL'
      ).all() as Array<{
        id: string; state_embedding: Buffer;
        domain?: string; confidence?: number;
      }>;
      for (const row of rows) {
        const dim = row.state_embedding.byteLength / 4;
        if (dim === dimension) {
          embeddingEntries.push({
            id: `sona:${row.id}`,
            vector: new Float32Array(
              row.state_embedding.buffer, row.state_embedding.byteOffset, dimension
            ),
            metadata: {
              tableName: 'sona_patterns',
              domain: row.domain,
              confidence: row.confidence,
            },
          });
        }
      }
    }

    if (embeddingEntries.length > 0) {
      const result = rvf.ingest(embeddingEntries);
      embeddingCount = result.accepted;
    }

    // --- Embed full brain data as kernel ---
    const brainData = {
      version: '3.0' as const,
      format: 'rvf' as const,
      exportedAt: new Date().toISOString(),
      sourceDb: sourceDbLabel,
      domains: [...domainSet].sort(),
      tables: allTableData,
    };

    const brainJson = JSON.stringify(brainData);
    const checksum = sha256(brainJson);
    const kernelBuffer = Buffer.from(brainJson);
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
      exportedAt: brainData.exportedAt,
      sourceDb: sourceDbLabel,
      stats: {
        patternCount: (allTableData['qe_patterns'] || []).length,
        embeddingCount,
        qValueCount: (allTableData['rl_q_values'] || []).length,
        dreamInsightCount: (allTableData['dream_insights'] || []).length,
        witnessChainLength: (allTableData['witness_chain'] || []).length,
        totalRecords,
        tableCounts: Object.fromEntries(
          TABLE_CONFIGS.map(({ tableName }) => [tableName, allTableData[tableName]?.length ?? 0]),
        ),
      },
      domains: brainData.domains,
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
    if (existsSync(outPath) && !options.allowOverwriteRicher) {
      let existing: RvfBrainManifest | undefined;
      try {
        existing = brainInfoFromRvf(outPath);
      } catch (error) {
        if (hasReadableBrainKernel(outPath) || !isKnownUnusableRvfError(error)) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(
            `RVF_MIRROR_INSPECTION_AMBIGUOUS: the existing mirror is readable but its ` +
            `richness could not be established (${detail}). Preserve/import it before retrying, ` +
            `or repeat with --force-overwrite-richer after preserving a backup.`,
          );
        }
      }

      if (existing) {
        const existingCounts = existing.stats.tableCounts;
        const candidateCounts = manifest.stats.tableCounts!;
        const missing = TABLE_CONFIGS
          .map(({ tableName }) => tableName)
          .filter((tableName) => !existingCounts || !Number.isSafeInteger(existingCounts[tableName]));
        if (missing.length > 0) {
          throw new Error(
            `RVF_MIRROR_INSPECTION_AMBIGUOUS: existing mirror lacks trustworthy counts for ` +
            `${missing.join(', ')}. Preserve/import it before retrying, or repeat with ` +
            `--force-overwrite-richer after preserving a backup.`,
          );
        }

        const richer = TABLE_CONFIGS
          .map(({ tableName }) => ({
            tableName,
            existing: existingCounts![tableName],
            candidate: candidateCounts[tableName],
          }))
          .filter(({ existing: existingCount, candidate }) => existingCount > candidate);
        if (richer.length > 0) {
          const differences = richer
            .map(({ tableName, existing: existingCount, candidate }) =>
              `${tableName} ${existingCount} -> ${candidate}`)
            .join(', ');
          throw new Error(
            `RVF_MIRROR_RICHER: refusing to replace richer mirrored tables: ${differences}. ` +
            `Restore/import the mirror first, or repeat with --force-overwrite-richer after ` +
            `preserving a backup.`,
          );
        }
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
  const rvf = openRvfStore(filePath);

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

    if (options.dryRun) {
      let total = 0;
      if (brainData.tables) {
        for (const rows of Object.values(brainData.tables)) {
          total += (rows?.length ?? 0);
        }
      } else {
        total = (brainData.patterns?.length ?? 0) +
          (brainData.qValues?.length ?? 0) +
          (brainData.dreamInsights?.length ?? 0) +
          (brainData.witnessChain?.length ?? 0);
      }
      return { imported: total, skipped: 0, conflicts: 0, embeddingsRestored: 0 };
    }

    ensureTargetTables(db);

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
    const importAll = db.transaction(() => {
      // Import in TABLE_CONFIGS order (FK-aware)
      for (const config of TABLE_CONFIGS) {
        let rows = tablesMap[config.tableName];
        if (!rows || !Array.isArray(rows)) continue;

        // Deserialize BLOBs
        const blobCols = TABLE_BLOB_COLUMNS[config.tableName];
        if (blobCols && blobCols.length > 0) {
          rows = rows.map(r => deserializeRowBlobs(r, blobCols));
          for (const row of rows) {
            for (const col of blobCols) {
              if (row[col] instanceof Buffer) embeddingsRestored++;
            }
          }
        }

        for (const row of rows) {
          let result: MergeResult;
          if (config.dedupColumns && config.dedupColumns.length > 0) {
            result = mergeAppendOnlyRow(db, config.tableName, row, config.dedupColumns, config.preserveId);
          } else {
            const idCol = PK_COLUMNS[config.tableName] || 'id';
            const tsCol = TIMESTAMP_COLUMNS[config.tableName];
            const confCol = CONFIDENCE_COLUMNS[config.tableName];
            result = mergeGenericRow(db, config.tableName, row, idCol,
              options.mergeStrategy, tsCol, confCol);
          }
          imported += result.imported;
          skipped += result.skipped;
          conflicts += result.conflicts;
        }
      }
    });

    importAll();

    // Compact after conflict resolution (best-effort)
    if (conflicts > 0) { try { rvf.compact(); } catch { /* best-effort */ } }

    return { imported, skipped, conflicts, embeddingsRestored };
  } finally {
    rvf.close();
  }
}

// --- Info ---

/** Read brain info from an RVF file without importing. */
export function brainInfoFromRvf(rvfPath: string): RvfBrainManifest {
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
            .map(([tableName, rows]) => [tableName, rows.length]),
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
