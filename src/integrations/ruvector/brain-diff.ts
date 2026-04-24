/**
 * Brain Export Diff
 *
 * Compares two brain exports (JSONL directory or RVF file) and returns a
 * structured diff.
 *
 * Two levels of comparison:
 *   - Manifest-level (always available): version, checksum, per-table record
 *     counts, exported_at, domain list delta.
 *   - Record-level (JSONL exports only): for each table with a PK, the set of
 *     added / removed / changed record IDs. For append-only tables only counts
 *     are reported.
 *
 * For RVF exports, record-level diff is not supported by this module (the
 * kernel is opaque without @ruvector/rvf-node). Export as JSONL for full diff.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { safeJsonParse } from '../../shared/safe-json.js';
import { brainInfoFromRvf } from './brain-rvf-exporter.js';
import {
  readJsonl,
  sha256,
  TABLE_CONFIGS,
  PK_COLUMNS,
  type TableExportConfig,
} from './brain-shared.js';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'rvf' | 'jsonl';

export interface ManifestSummary {
  readonly format: ExportFormat;
  readonly version: string;
  readonly exportedAt: string;
  readonly sourceDb: string;
  readonly checksum: string;
  readonly totalRecords: number;
  readonly domains: readonly string[];
  readonly tableRecordCounts: Record<string, number>;
}

export interface TableDiff {
  readonly tableName: string;
  readonly countA: number;
  readonly countB: number;
  readonly delta: number;
  /** Only populated for JSONL↔JSONL record-level diffs on PK tables. */
  readonly added?: readonly string[];
  readonly removed?: readonly string[];
  readonly changed?: readonly string[];
}

export interface BrainDiffResult {
  readonly pathA: string;
  readonly pathB: string;
  readonly formatA: ExportFormat;
  readonly formatB: ExportFormat;
  readonly manifestA: ManifestSummary;
  readonly manifestB: ManifestSummary;
  readonly checksumMatch: boolean;
  readonly versionMatch: boolean;
  readonly identical: boolean;
  readonly recordLevel: boolean;
  readonly tableDiffs: readonly TableDiff[];
  readonly domainsOnlyInA: readonly string[];
  readonly domainsOnlyInB: readonly string[];
}

export interface BrainDiffOptions {
  /** Restrict comparison to a single table (by table name). */
  readonly tableFilter?: string;
  /** Cap on the number of IDs retained per added/removed/changed list. */
  readonly maxIdsPerBucket?: number;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Compute the diff between two brain exports.
 *
 * Both paths may be JSONL directories or `.rvf` files. Record-level diff is
 * only available when both sides are JSONL.
 */
export function diffBrains(
  pathA: string,
  pathB: string,
  options: BrainDiffOptions = {},
): BrainDiffResult {
  const resolvedA = resolve(pathA);
  const resolvedB = resolve(pathB);

  const formatA = detectFormat(resolvedA);
  const formatB = detectFormat(resolvedB);

  const manifestA = readManifestSummary(resolvedA, formatA);
  const manifestB = readManifestSummary(resolvedB, formatB);

  const recordLevel = formatA === 'jsonl' && formatB === 'jsonl';

  const tableDiffs = computeTableDiffs({
    pathA: resolvedA,
    pathB: resolvedB,
    manifestA,
    manifestB,
    recordLevel,
    tableFilter: options.tableFilter,
    maxIdsPerBucket: options.maxIdsPerBucket ?? 500,
  });

  const domainsA = new Set(manifestA.domains);
  const domainsB = new Set(manifestB.domains);
  const domainsOnlyInA = manifestA.domains.filter((d) => !domainsB.has(d));
  const domainsOnlyInB = manifestB.domains.filter((d) => !domainsA.has(d));

  const checksumMatch = manifestA.checksum === manifestB.checksum;
  const versionMatch = manifestA.version === manifestB.version;

  const identical =
    checksumMatch &&
    versionMatch &&
    tableDiffs.every(
      (t) =>
        t.delta === 0 &&
        (t.added?.length ?? 0) === 0 &&
        (t.removed?.length ?? 0) === 0 &&
        (t.changed?.length ?? 0) === 0,
    );

  return {
    pathA: resolvedA,
    pathB: resolvedB,
    formatA,
    formatB,
    manifestA,
    manifestB,
    checksumMatch,
    versionMatch,
    identical,
    recordLevel,
    tableDiffs,
    domainsOnlyInA,
    domainsOnlyInB,
  };
}

// ============================================================================
// Format detection + manifest reading
// ============================================================================

function detectFormat(path: string): ExportFormat {
  if (!existsSync(path)) {
    throw new Error(`Path not found: ${path}`);
  }
  if (path.endsWith('.rvf')) return 'rvf';
  const s = statSync(path);
  if (s.isFile()) {
    // Any single file that isn't .rvf is treated as an error — JSONL exports
    // are directories.
    throw new Error(
      `Unsupported brain export: ${path} (expected a .rvf file or a JSONL directory)`,
    );
  }
  // Directory: assume JSONL
  return 'jsonl';
}

function readManifestSummary(path: string, format: ExportFormat): ManifestSummary {
  if (format === 'rvf') {
    return readRvfManifestSummary(path);
  }
  return readJsonlManifestSummary(path);
}

interface RawManifest {
  version?: string;
  exportedAt?: string;
  sourceDb?: string;
  checksum?: string;
  stats?: { totalRecords?: number };
  domains?: readonly string[];
  tableRecordCounts?: Record<string, number>;
}

function readJsonlManifestSummary(dir: string): ManifestSummary {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  const raw = safeJsonParse<RawManifest>(readFileSync(manifestPath, 'utf-8'));
  return toManifestSummary(raw, 'jsonl');
}

function readRvfManifestSummary(rvfPath: string): ManifestSummary {
  // Delegate to the RVF exporter's info path so we honour its format handling.
  const raw = brainInfoFromRvf(rvfPath) as unknown as RawManifest;
  return toManifestSummary(raw, 'rvf');
}

function toManifestSummary(raw: RawManifest, format: ExportFormat): ManifestSummary {
  return {
    format,
    version: raw.version ?? 'unknown',
    exportedAt: raw.exportedAt ?? 'unknown',
    sourceDb: raw.sourceDb ?? 'unknown',
    checksum: raw.checksum ?? '',
    totalRecords: raw.stats?.totalRecords ?? 0,
    domains: raw.domains ?? [],
    tableRecordCounts: raw.tableRecordCounts ?? {},
  };
}

// ============================================================================
// Table-level diff
// ============================================================================

interface TableDiffInput {
  readonly pathA: string;
  readonly pathB: string;
  readonly manifestA: ManifestSummary;
  readonly manifestB: ManifestSummary;
  readonly recordLevel: boolean;
  readonly tableFilter?: string;
  readonly maxIdsPerBucket: number;
}

function computeTableDiffs(input: TableDiffInput): TableDiff[] {
  const configs = input.tableFilter
    ? TABLE_CONFIGS.filter((c) => c.tableName === input.tableFilter)
    : TABLE_CONFIGS;

  if (input.tableFilter && configs.length === 0) {
    throw new Error(`Unknown table: ${input.tableFilter}`);
  }

  const diffs: TableDiff[] = [];
  for (const config of configs) {
    const countA = input.manifestA.tableRecordCounts[config.tableName] ?? 0;
    const countB = input.manifestB.tableRecordCounts[config.tableName] ?? 0;
    const delta = countB - countA;

    let added: readonly string[] | undefined;
    let removed: readonly string[] | undefined;
    let changed: readonly string[] | undefined;

    if (input.recordLevel && hasIdentity(config)) {
      const recordDiff = recordLevelDiff(
        join(input.pathA, config.fileName),
        join(input.pathB, config.fileName),
        config,
        input.maxIdsPerBucket,
      );
      added = recordDiff.added;
      removed = recordDiff.removed;
      changed = recordDiff.changed;
    }

    diffs.push({
      tableName: config.tableName,
      countA,
      countB,
      delta,
      ...(added !== undefined ? { added } : {}),
      ...(removed !== undefined ? { removed } : {}),
      ...(changed !== undefined ? { changed } : {}),
    });
  }

  return diffs;
}

function hasIdentity(_config: TableExportConfig): boolean {
  // PK tables always have identity; append-only tables can be deduped via
  // their dedup columns, which is good enough to compute added/removed.
  return true;
}

function pkFor(config: TableExportConfig): string {
  if (config.dedupColumns && config.dedupColumns.length > 0) {
    // Composite identity — joined with a separator unlikely to occur in values.
    return config.dedupColumns.join('');
  }
  return PK_COLUMNS[config.tableName] ?? 'id';
}

interface RecordDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

function recordLevelDiff(
  fileA: string,
  fileB: string,
  config: TableExportConfig,
  maxIdsPerBucket: number,
): RecordDiff {
  const mapA = buildIdentityMap(fileA, config);
  const mapB = buildIdentityMap(fileB, config);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  // In A but not in B → removed.
  for (const [id, hashA] of mapA) {
    const hashB = mapB.get(id);
    if (hashB === undefined) {
      if (removed.length < maxIdsPerBucket) removed.push(id);
    } else if (hashB !== hashA) {
      // Append-only tables use dedup columns as identity, so if the identity
      // matches the record IS the same — guard via dedup flag.
      if (config.dedupColumns && config.dedupColumns.length > 0) continue;
      if (changed.length < maxIdsPerBucket) changed.push(id);
    }
  }
  // In B but not in A → added.
  for (const id of mapB.keys()) {
    if (!mapA.has(id)) {
      if (added.length < maxIdsPerBucket) added.push(id);
    }
  }

  added.sort();
  removed.sort();
  changed.sort();

  return { added, removed, changed };
}

/**
 * Read a JSONL file and build a Map<identity, contentHash>.
 *
 * For PK tables the identity is the PK column value. For append-only tables
 * the identity is a concatenation of the dedup columns (collisions are
 * treated as "same record").
 */
function buildIdentityMap(
  filePath: string,
  config: TableExportConfig,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(filePath)) return map;

  const rows = readJsonl<Record<string, unknown>>(filePath, safeJsonParse);
  for (const row of rows) {
    const id = identityOf(row, config);
    if (id === undefined) continue;
    // Stable content hash: JSON-stringify with sorted keys.
    const content = stableStringify(row);
    map.set(id, sha256Hex(content));
  }
  return map;
}

function identityOf(
  row: Record<string, unknown>,
  config: TableExportConfig,
): string | undefined {
  if (config.dedupColumns && config.dedupColumns.length > 0) {
    const parts: string[] = [];
    for (const col of config.dedupColumns) {
      const v = row[col];
      if (v === undefined || v === null) return undefined;
      parts.push(String(v));
    }
    return parts.join('');
  }
  const pk = PK_COLUMNS[config.tableName] ?? 'id';
  const v = row[pk];
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}

function sha256Hex(s: string): string {
  // sha256() from brain-shared operates on utf-8 strings; both paths yield the
  // same hash for the same input. Kept as a thin wrapper for readability.
  return sha256(s);
}

// ============================================================================
// Presentation helpers (used by the CLI handler, exported for tests)
// ============================================================================

export interface DiffSummary {
  readonly tablesChanged: number;
  readonly totalAdded: number;
  readonly totalRemoved: number;
  readonly totalChanged: number;
  readonly recordCountDelta: number;
}

export function summarizeDiff(result: BrainDiffResult): DiffSummary {
  let tablesChanged = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalChanged = 0;
  for (const t of result.tableDiffs) {
    const hasChange =
      t.delta !== 0 ||
      (t.added && t.added.length > 0) ||
      (t.removed && t.removed.length > 0) ||
      (t.changed && t.changed.length > 0);
    if (hasChange) tablesChanged++;
    totalAdded += t.added?.length ?? 0;
    totalRemoved += t.removed?.length ?? 0;
    totalChanged += t.changed?.length ?? 0;
  }
  return {
    tablesChanged,
    totalAdded,
    totalRemoved,
    totalChanged,
    recordCountDelta: result.manifestB.totalRecords - result.manifestA.totalRecords,
  };
}

// Export internal helpers for test access without widening the public API.
export const __test__ = { stableStringify, identityOf, buildIdentityMap, pkFor };
