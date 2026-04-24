/**
 * Brain Export Search
 *
 * Offline, read-only filtered search over a JSONL brain export directory.
 * Useful for exploring what a snapshot contains without importing it.
 *
 * Defaults to searching qe_patterns but can target any of the 25 exported
 * tables via the `table` option. Supports filters by domain, pattern_type,
 * date range, and a substring query that matches `name` + `description`.
 *
 * RVF exports are not supported directly by this module — callers should use
 * `aqe brain export --format jsonl` for searchable snapshots.
 */

import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { safeJsonParse } from '../../shared/safe-json.js';
import { readJsonl, TABLE_CONFIGS } from './brain-shared.js';

// ============================================================================
// Types
// ============================================================================

export interface BrainSearchOptions {
  /** Table to search. Defaults to 'qe_patterns'. */
  readonly table?: string;
  /** Restrict to these domains (matched against the table's domain column). */
  readonly domains?: readonly string[];
  /** Restrict to rows with this exact pattern_type (qe_patterns only). */
  readonly patternType?: string;
  /** ISO timestamp — only rows at or after this are included. */
  readonly since?: string;
  /** ISO timestamp — only rows at or before this are included. */
  readonly until?: string;
  /** Case-insensitive substring matched against name + description. */
  readonly query?: string;
  /** Max rows to return. Defaults to 20. */
  readonly limit?: number;
}

export interface BrainSearchHit {
  /** Primary-key identity string (best effort per table). */
  readonly id: string;
  /** Minimal surface shown in default CLI output. */
  readonly display: {
    readonly name?: string;
    readonly description?: string;
    readonly domain?: string;
    readonly patternType?: string;
    readonly confidence?: number;
    readonly updatedAt?: string;
  };
  /** Full raw row for callers that want more (used by --json). */
  readonly row: Record<string, unknown>;
}

export interface BrainSearchResult {
  readonly table: string;
  readonly inputPath: string;
  readonly totalScanned: number;
  readonly totalMatched: number;
  readonly limit: number;
  readonly hits: readonly BrainSearchHit[];
  readonly truncated: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LIMIT = 20;
const DEFAULT_TABLE = 'qe_patterns';

// ============================================================================
// Public API
// ============================================================================

/**
 * Search a brain export directory for rows matching the given filters.
 *
 * Throws if the path isn't a JSONL export directory, if the requested table
 * isn't known, or if the JSONL file for that table is missing.
 */
export function searchBrain(
  inputPath: string,
  options: BrainSearchOptions = {},
): BrainSearchResult {
  const resolved = resolve(inputPath);
  assertJsonlExport(resolved);

  const tableName = options.table ?? DEFAULT_TABLE;
  const config = TABLE_CONFIGS.find((c) => c.tableName === tableName);
  if (!config) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  const filePath = join(resolved, config.fileName);
  if (!existsSync(filePath)) {
    throw new Error(
      `Table file not found: ${config.fileName} ` +
        `(expected in ${resolved}). Was this export generated with --format jsonl?`,
    );
  }

  const rows = readJsonl<Record<string, unknown>>(filePath, safeJsonParse);
  const domainColumn = config.domainColumn;

  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const queryLower = options.query ? options.query.toLowerCase() : undefined;
  const domains = options.domains && options.domains.length > 0 ? new Set(options.domains) : undefined;
  const since = options.since;
  const until = options.until;
  const patternType = options.patternType;

  let matched = 0;
  const hits: BrainSearchHit[] = [];

  for (const row of rows) {
    if (!rowMatches(row, { domainColumn, domains, patternType, since, until, queryLower })) {
      continue;
    }
    matched++;
    if (hits.length < limit) {
      hits.push(toHit(row, config.tableName, domainColumn));
    }
  }

  return {
    table: tableName,
    inputPath: resolved,
    totalScanned: rows.length,
    totalMatched: matched,
    limit,
    hits,
    truncated: matched > limit,
  };
}

// ============================================================================
// Filtering
// ============================================================================

interface FilterContext {
  readonly domainColumn?: string;
  readonly domains?: Set<string>;
  readonly patternType?: string;
  readonly since?: string;
  readonly until?: string;
  readonly queryLower?: string;
}

function rowMatches(row: Record<string, unknown>, ctx: FilterContext): boolean {
  // Domain filter — only applied if table has a domain column.
  if (ctx.domains) {
    if (!ctx.domainColumn) return false; // caller asked for a domain filter on a table that has none
    const v = row[ctx.domainColumn];
    if (typeof v !== 'string' || !ctx.domains.has(v)) return false;
  }

  // Pattern type filter — only meaningful for qe_patterns.
  if (ctx.patternType !== undefined) {
    const v = row['pattern_type'];
    if (v !== ctx.patternType) return false;
  }

  // Date range — matched against updated_at | created_at | timestamp (in that order).
  if (ctx.since !== undefined || ctx.until !== undefined) {
    const ts = pickTimestamp(row);
    if (ts === undefined) return false;
    if (ctx.since !== undefined && ts < ctx.since) return false;
    if (ctx.until !== undefined && ts > ctx.until) return false;
  }

  // Substring query — matched against name + description (case-insensitive).
  if (ctx.queryLower !== undefined) {
    const name = typeof row['name'] === 'string' ? (row['name'] as string).toLowerCase() : '';
    const desc =
      typeof row['description'] === 'string' ? (row['description'] as string).toLowerCase() : '';
    if (!name.includes(ctx.queryLower) && !desc.includes(ctx.queryLower)) return false;
  }

  return true;
}

function pickTimestamp(row: Record<string, unknown>): string | undefined {
  for (const col of ['updated_at', 'created_at', 'timestamp']) {
    const v = row[col];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

// ============================================================================
// Result formatting
// ============================================================================

function toHit(
  row: Record<string, unknown>,
  tableName: string,
  domainColumn: string | undefined,
): BrainSearchHit {
  const id =
    (typeof row['id'] === 'string' || typeof row['id'] === 'number'
      ? String(row['id'])
      : undefined) ?? `${tableName}:?`;

  const display: BrainSearchHit['display'] = {
    name: typeof row['name'] === 'string' ? (row['name'] as string) : undefined,
    description: typeof row['description'] === 'string' ? (row['description'] as string) : undefined,
    domain: domainColumn && typeof row[domainColumn] === 'string' ? (row[domainColumn] as string) : undefined,
    patternType: typeof row['pattern_type'] === 'string' ? (row['pattern_type'] as string) : undefined,
    confidence: typeof row['confidence'] === 'number' ? (row['confidence'] as number) : undefined,
    updatedAt: pickTimestamp(row),
  };

  return { id, display, row };
}

// ============================================================================
// Helpers
// ============================================================================

function assertJsonlExport(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Path not found: ${path}`);
  }
  const s = statSync(path);
  if (s.isFile()) {
    if (path.endsWith('.rvf')) {
      throw new Error(
        'Brain search does not support RVF exports. Re-export with --format jsonl, or use `aqe brain info` for RVF summaries.',
      );
    }
    throw new Error(`Unsupported brain export: ${path} (expected a JSONL directory)`);
  }
  const manifest = join(path, 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`Manifest not found at ${manifest}. Is this a brain export directory?`);
  }
}

// Re-export for test access / future helpers without widening the public API.
export const __test__ = { pickTimestamp, rowMatches, toHit };
