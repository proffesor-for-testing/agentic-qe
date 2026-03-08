/**
 * Shared Brain Export/Import Helpers
 *
 * Common types, merge functions, SQL helpers, and utilities used by both
 * the JSONL brain-exporter and the RVF brain-rvf-exporter modules.
 *
 * This module owns:
 *   - Row type interfaces (PatternRow, QValueRow, DreamInsightRow, WitnessRow)
 *   - Merge result type and merge strategy type
 *   - TABLE_CONFIGS: data-driven list of all 25 exportable tables
 *   - All 4 legacy merge functions + generic mergeGenericRow / mergeAppendOnlyRow
 *   - All SQL insert/update helpers
 *   - Utility functions (sha256, tableExists, queryAll, domainFilter, countRows)
 *   - JSONL I/O helpers (readJsonl, writeJsonl)
 *   - BLOB serialization helpers (serializeRowBlobs, deserializeRowBlobs)
 *   - DDL delegated to brain-table-ddl.ts
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'fs';
import Database from 'better-sqlite3';
import { ensureAllBrainTables } from './brain-table-ddl.js';

// --- Types ---

export type MergeStrategy = 'latest-wins' | 'highest-confidence' | 'union' | 'skip-conflicts';

export interface MergeResult {
  imported: number;
  skipped: number;
  conflicts: number;
}

export interface PatternRow {
  id: string;
  pattern_type: string;
  qe_domain: string;
  domain: string;
  name: string;
  description?: string;
  confidence?: number;
  usage_count?: number;
  success_rate?: number;
  quality_score?: number;
  tier?: string;
  template_json?: string;
  context_json?: string;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string;
  successful_uses?: number;
  tokens_used?: number;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  reusable?: number;
  reuse_count?: number;
  average_token_savings?: number;
  total_tokens_saved?: number;
}

export interface QValueRow {
  id: string;
  algorithm: string;
  agent_id: string;
  state_key: string;
  action_key: string;
  q_value: number;
  visits: number;
  last_reward?: number;
  domain?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DreamInsightRow {
  id: string;
  cycle_id: string;
  insight_type: string;
  source_concepts: string;
  description: string;
  novelty_score?: number;
  confidence_score?: number;
  actionable?: number;
  applied?: number;
  suggested_action?: string;
  pattern_id?: string;
  created_at?: string;
}

export interface WitnessRow {
  id: number;
  prev_hash: string;
  action_hash: string;
  action_type: string;
  action_data?: string;
  timestamp: string;
  actor: string;
}

/** Configuration for a table export. Describes how a table maps into the export. */
export interface TableExportConfig {
  readonly tableName: string;
  readonly fileName: string;
  readonly domainColumn?: string;
  /** Columns containing BLOB data that needs Base64 serialization. */
  readonly blobColumns?: readonly string[];
  /** For tables with AUTOINCREMENT PK, specify dedup columns. */
  readonly dedupColumns?: readonly string[];
}

// --- Merge column maps (shared by both JSONL and RVF importers) ---

/** PK column for tables with non-standard PK names. Default is 'id'. */
export const PK_COLUMNS: Record<string, string> = {
  qe_pattern_embeddings: 'pattern_id',
};

/** Confidence columns for tables that support highest-confidence merge strategy. */
export const CONFIDENCE_COLUMNS: Record<string, string> = {
  qe_patterns: 'confidence',
  rl_q_values: 'q_value',
  dream_insights: 'confidence_score',
  captured_experiences: 'quality',
  sona_patterns: 'confidence',
};

/** Timestamp columns for tables that support latest-wins merge strategy. */
export const TIMESTAMP_COLUMNS: Record<string, string> = {
  qe_patterns: 'updated_at',
  rl_q_values: 'updated_at',
  sona_patterns: 'updated_at',
  goap_actions: 'updated_at',
  concept_edges: 'updated_at',
};

// --- TABLE_CONFIGS: All 25 exportable tables in FK-aware import order ---

export const TABLE_CONFIGS: readonly TableExportConfig[] = [
  { tableName: 'qe_patterns', fileName: 'patterns.jsonl', domainColumn: 'qe_domain' },
  { tableName: 'rl_q_values', fileName: 'q-values.jsonl', domainColumn: 'domain' },
  { tableName: 'dream_cycles', fileName: 'dream-cycles.jsonl' },
  { tableName: 'dream_insights', fileName: 'dream-insights.jsonl' },
  { tableName: 'witness_chain', fileName: 'witness-chain.jsonl', dedupColumns: ['action_hash', 'timestamp'] },
  { tableName: 'qe_pattern_embeddings', fileName: 'pattern-embeddings.jsonl', blobColumns: ['embedding'] },
  { tableName: 'captured_experiences', fileName: 'captured-experiences.jsonl', domainColumn: 'domain', blobColumns: ['embedding'] },
  { tableName: 'sona_patterns', fileName: 'sona-patterns.jsonl', domainColumn: 'domain', blobColumns: ['state_embedding', 'action_embedding'] },
  { tableName: 'qe_trajectories', fileName: 'trajectories.jsonl', domainColumn: 'domain' },
  { tableName: 'trajectory_steps', fileName: 'trajectory-steps.jsonl' },
  { tableName: 'concept_nodes', fileName: 'concept-nodes.jsonl', blobColumns: ['embedding'] },
  { tableName: 'concept_edges', fileName: 'concept-edges.jsonl' },
  { tableName: 'goap_actions', fileName: 'goap-actions.jsonl', domainColumn: 'qe_domain' },
  { tableName: 'routing_outcomes', fileName: 'routing-outcomes.jsonl' },
  { tableName: 'goap_goals', fileName: 'goap-goals.jsonl', domainColumn: 'qe_domain' },
  { tableName: 'goap_plans', fileName: 'goap-plans.jsonl' },
  { tableName: 'goap_plan_signatures', fileName: 'goap-plan-signatures.jsonl' },
  { tableName: 'qe_pattern_usage', fileName: 'pattern-usage.jsonl', dedupColumns: ['pattern_id', 'created_at'] },
  { tableName: 'pattern_evolution_events', fileName: 'pattern-evolution.jsonl' },
  { tableName: 'pattern_relationships', fileName: 'pattern-relationships.jsonl' },
  { tableName: 'pattern_versions', fileName: 'pattern-versions.jsonl', blobColumns: ['embedding'] },
  { tableName: 'vectors', fileName: 'vectors.jsonl', blobColumns: ['embedding'] },
  { tableName: 'experience_applications', fileName: 'experience-applications.jsonl' },
  { tableName: 'execution_results', fileName: 'execution-results.jsonl' },
  { tableName: 'executed_steps', fileName: 'executed-steps.jsonl' },
];

// --- Derived BLOB column map (from TABLE_CONFIGS) ---

/** Maps table names to their BLOB columns. Derived from TABLE_CONFIGS for convenience. */
export const TABLE_BLOB_COLUMNS: Record<string, readonly string[]> = Object.fromEntries(
  TABLE_CONFIGS
    .filter(c => c.blobColumns && c.blobColumns.length > 0)
    .map(c => [c.tableName, c.blobColumns!])
);

// --- BLOB Serialization ---

/** Serialize BLOB columns to Base64 `_col_b64` keys, removing original BLOB. */
export function serializeRowBlobs(
  row: Record<string, unknown>, blobColumns: readonly string[]
): Record<string, unknown> {
  const result = { ...row };
  for (const col of blobColumns) {
    if (result[col] instanceof Buffer) {
      result[`_${col}_b64`] = (result[col] as Buffer).toString('base64');
      delete result[col];
    }
  }
  return result;
}

/** Deserialize Base64 `_col_b64` keys back to Buffer, restoring column name. */
export function deserializeRowBlobs(
  row: Record<string, unknown>, blobColumns: readonly string[]
): Record<string, unknown> {
  const result = { ...row };
  for (const col of blobColumns) {
    const b64Key = `_${col}_b64`;
    if (typeof result[b64Key] === 'string') {
      result[col] = Buffer.from(result[b64Key] as string, 'base64');
      delete result[b64Key];
    }
  }
  return result;
}

// --- Utility functions ---

export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

export function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name) as { cnt: number };
  return row.cnt > 0;
}

export function countRows(
  db: Database.Database, table: string,
  whereClause?: string, params?: unknown[]
): number {
  if (!tableExists(db, table)) return 0;
  const sql = `SELECT COUNT(*) as cnt FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
  const stmt = db.prepare(sql);
  const row = (params && params.length > 0 ? stmt.get(...params) : stmt.get()) as { cnt: number };
  return row.cnt;
}

export function queryAll(
  db: Database.Database, table: string,
  whereClause?: string, params?: unknown[]
): unknown[] {
  if (!tableExists(db, table)) return [];
  const sql = `SELECT * FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
  const stmt = db.prepare(sql);
  return (params && params.length > 0 ? stmt.all(...params) : stmt.all()) as unknown[];
}

/**
 * Return a synchronous iterator over rows using better-sqlite3's `.iterate()`.
 * Memory-efficient for large tables (e.g., concept_edges with 68K+ rows).
 */
export function* queryIterator(
  db: Database.Database, table: string,
  whereClause?: string, params?: unknown[]
): Generator<unknown> {
  if (!tableExists(db, table)) return;
  const sql = `SELECT * FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
  const stmt = db.prepare(sql);
  const iter = params && params.length > 0 ? stmt.iterate(...params) : stmt.iterate();
  for (const row of iter) {
    yield row;
  }
}

/** Build a domain filter for the `qe_domain` column. */
export function domainFilter(domains?: readonly string[]): [string | undefined, string[]] {
  if (!domains || domains.length === 0) return [undefined, []];
  const placeholders = domains.map(() => '?').join(', ');
  return [`qe_domain IN (${placeholders})`, [...domains]];
}

/** Build a domain filter for any named column. */
export function domainFilterForColumn(
  domains: readonly string[] | undefined, columnName: string
): [string | undefined, string[]] {
  if (!domains || domains.length === 0) return [undefined, []];
  const placeholders = domains.map(() => '?').join(', ');
  return [`${columnName} IN (${placeholders})`, [...domains]];
}

// --- JSONL I/O ---

export function writeJsonl(filePath: string, rows: unknown[]): void {
  const lines = rows.map(r => JSON.stringify(r));
  writeFileSync(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf-8');
}

/**
 * Stream rows to a JSONL file without holding all in memory.
 * Uses synchronous I/O for deterministic completion.
 * Returns the number of rows written.
 */
export function writeJsonlStreaming(
  filePath: string,
  rows: Iterable<unknown>,
  transform?: (row: unknown) => unknown,
): number {
  const fd = openSync(filePath, 'w');
  let count = 0;
  try {
    for (const row of rows) {
      const r = transform ? transform(row) : row;
      writeSync(fd, JSON.stringify(r) + '\n');
      count++;
    }
  } finally {
    closeSync(fd);
  }
  return count;
}

export function readJsonl<T = unknown>(
  filePath: string,
  parser: (line: string) => T = (line) => JSON.parse(line) as T
): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (content === '') return [];
  return content.split('\n').map(parser);
}

// --- Generic merge for TEXT PK tables ---

/** Dynamically insert a row into any table using its column keys. */
function dynamicInsert(db: Database.Database, tableName: string, row: Record<string, unknown>): void {
  const keys = Object.keys(row);
  const cols = keys.join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`).run(
    ...keys.map(k => row[k] ?? null)
  );
}

/** Dynamically update a row in any table using its column keys minus the PK. */
function dynamicUpdate(
  db: Database.Database, tableName: string, row: Record<string, unknown>, idColumn: string
): void {
  const keys = Object.keys(row).filter(k => k !== idColumn);
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE ${tableName} SET ${sets} WHERE ${idColumn} = ?`).run(
    ...keys.map(k => row[k] ?? null), row[idColumn]
  );
}

/**
 * Generic merge for tables with a TEXT PRIMARY KEY.
 * Uses strategy-based conflict resolution identical to the pattern-specific merges.
 */
export function mergeGenericRow(
  db: Database.Database, tableName: string, row: Record<string, unknown>,
  idColumn: string, strategy: MergeStrategy,
  timestampColumn?: string, confidenceColumn?: string
): MergeResult {
  if (!tableExists(db, tableName)) {
    dynamicInsert(db, tableName, row);
    return { imported: 1, skipped: 0, conflicts: 0 };
  }
  const existing = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`)
    .get(row[idColumn]) as Record<string, unknown> | undefined;
  if (!existing) {
    dynamicInsert(db, tableName, row);
    return { imported: 1, skipped: 0, conflicts: 0 };
  }
  switch (strategy) {
    case 'skip-conflicts':
      return { imported: 0, skipped: 1, conflicts: 1 };
    case 'latest-wins': {
      const ts = timestampColumn || 'created_at';
      const existingTime = (existing[ts] as string) || '';
      const incomingTime = (row[ts] as string) || '';
      if (incomingTime > existingTime) {
        dynamicUpdate(db, tableName, row, idColumn);
        return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    case 'highest-confidence': {
      const cc = confidenceColumn || 'confidence';
      if (typeof row[cc] === 'number' && typeof existing[cc] === 'number') {
        if ((row[cc] as number) > (existing[cc] as number)) {
          dynamicUpdate(db, tableName, row, idColumn);
          return { imported: 1, skipped: 0, conflicts: 1 };
        }
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    default:
      return { imported: 0, skipped: 1, conflicts: 1 };
  }
}

/**
 * Merge for append-only tables (AUTOINCREMENT PK).
 * Deduplicates by checking composite columns; inserts if no match found.
 */
export function mergeAppendOnlyRow(
  db: Database.Database, tableName: string,
  row: Record<string, unknown>, dedupColumns: readonly string[]
): MergeResult {
  if (!tableExists(db, tableName)) {
    dynamicInsert(db, tableName, row);
    return { imported: 1, skipped: 0, conflicts: 0 };
  }
  const whereParts = dedupColumns.map(c => `${c} = ?`);
  const params = dedupColumns.map(c => row[c] ?? null);
  const existing = db.prepare(
    `SELECT 1 FROM ${tableName} WHERE ${whereParts.join(' AND ')} LIMIT 1`
  ).get(...params);
  if (existing) {
    return { imported: 0, skipped: 1, conflicts: 1 };
  }
  // Strip AUTOINCREMENT id column before insert
  const insertRow = { ...row };
  delete insertRow.id;
  dynamicInsert(db, tableName, insertRow);
  return { imported: 1, skipped: 0, conflicts: 0 };
}

// --- Legacy typed merge functions (keep for backward compat) ---

export function mergePattern(db: Database.Database, pattern: PatternRow, strategy: MergeStrategy): MergeResult {
  return mergeGenericRow(db, 'qe_patterns', pattern as unknown as Record<string, unknown>,
    'id', strategy, 'updated_at', 'confidence');
}

export function mergeQValue(db: Database.Database, qv: QValueRow, strategy: MergeStrategy): MergeResult {
  return mergeGenericRow(db, 'rl_q_values', qv as unknown as Record<string, unknown>,
    'id', strategy, 'updated_at', 'q_value');
}

export function mergeDreamInsight(db: Database.Database, insight: DreamInsightRow, strategy: MergeStrategy): MergeResult {
  return mergeGenericRow(db, 'dream_insights', insight as unknown as Record<string, unknown>,
    'id', strategy, 'created_at', 'confidence_score');
}

export function mergeWitnessEntry(db: Database.Database, entry: WitnessRow, _strategy: MergeStrategy): MergeResult {
  return mergeAppendOnlyRow(db, 'witness_chain', entry as unknown as Record<string, unknown>,
    ['action_hash', 'timestamp']);
}

// --- SQL Insert/Update helpers (kept for backward compat and tests) ---

export function insertPattern(db: Database.Database, p: PatternRow): void {
  db.prepare(`
    INSERT INTO qe_patterns (
      id, pattern_type, qe_domain, domain, name, description,
      confidence, usage_count, success_rate, quality_score, tier,
      template_json, context_json, created_at, updated_at, last_used_at,
      successful_uses, tokens_used, input_tokens, output_tokens,
      latency_ms, reusable, reuse_count, average_token_savings, total_tokens_saved
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.id, p.pattern_type, p.qe_domain, p.domain, p.name, p.description ?? null,
    p.confidence ?? 0.5, p.usage_count ?? 0, p.success_rate ?? 0, p.quality_score ?? 0, p.tier ?? 'short-term',
    p.template_json ?? null, p.context_json ?? null, p.created_at ?? null, p.updated_at ?? null, p.last_used_at ?? null,
    p.successful_uses ?? 0, p.tokens_used ?? null, p.input_tokens ?? null, p.output_tokens ?? null,
    p.latency_ms ?? null, p.reusable ?? 0, p.reuse_count ?? 0, p.average_token_savings ?? 0, p.total_tokens_saved ?? null
  );
}

export function updatePattern(db: Database.Database, p: PatternRow): void {
  db.prepare(`
    UPDATE qe_patterns SET
      pattern_type = ?, qe_domain = ?, domain = ?, name = ?, description = ?,
      confidence = ?, usage_count = ?, success_rate = ?, quality_score = ?, tier = ?,
      template_json = ?, context_json = ?, updated_at = ?, last_used_at = ?,
      successful_uses = ?, tokens_used = ?, input_tokens = ?, output_tokens = ?,
      latency_ms = ?, reusable = ?, reuse_count = ?, average_token_savings = ?, total_tokens_saved = ?
    WHERE id = ?
  `).run(
    p.pattern_type, p.qe_domain, p.domain, p.name, p.description ?? null,
    p.confidence ?? 0.5, p.usage_count ?? 0, p.success_rate ?? 0, p.quality_score ?? 0, p.tier ?? 'short-term',
    p.template_json ?? null, p.context_json ?? null, p.updated_at ?? null, p.last_used_at ?? null,
    p.successful_uses ?? 0, p.tokens_used ?? null, p.input_tokens ?? null, p.output_tokens ?? null,
    p.latency_ms ?? null, p.reusable ?? 0, p.reuse_count ?? 0, p.average_token_savings ?? 0, p.total_tokens_saved ?? null,
    p.id
  );
}

export function insertQValue(db: Database.Database, qv: QValueRow): void {
  db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, last_reward, domain, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(qv.id, qv.algorithm, qv.agent_id, qv.state_key, qv.action_key,
    qv.q_value, qv.visits, qv.last_reward ?? null, qv.domain ?? null,
    qv.created_at ?? null, qv.updated_at ?? null);
}

export function updateQValue(db: Database.Database, qv: QValueRow): void {
  db.prepare(`
    UPDATE rl_q_values SET algorithm = ?, agent_id = ?, state_key = ?, action_key = ?,
      q_value = ?, visits = ?, last_reward = ?, domain = ?, updated_at = ?
    WHERE id = ?
  `).run(qv.algorithm, qv.agent_id, qv.state_key, qv.action_key,
    qv.q_value, qv.visits, qv.last_reward ?? null, qv.domain ?? null,
    qv.updated_at ?? null, qv.id);
}

export function insertDreamInsight(db: Database.Database, ins: DreamInsightRow): void {
  db.prepare(`
    INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description,
      novelty_score, confidence_score, actionable, applied, suggested_action, pattern_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ins.id, ins.cycle_id, ins.insight_type, ins.source_concepts, ins.description,
    ins.novelty_score ?? 0.5, ins.confidence_score ?? 0.5, ins.actionable ?? 0, ins.applied ?? 0,
    ins.suggested_action ?? null, ins.pattern_id ?? null, ins.created_at ?? null);
}

export function updateDreamInsight(db: Database.Database, ins: DreamInsightRow): void {
  db.prepare(`
    UPDATE dream_insights SET cycle_id = ?, insight_type = ?, source_concepts = ?, description = ?,
      novelty_score = ?, confidence_score = ?, actionable = ?, applied = ?,
      suggested_action = ?, pattern_id = ?, created_at = ?
    WHERE id = ?
  `).run(ins.cycle_id, ins.insight_type, ins.source_concepts, ins.description,
    ins.novelty_score ?? 0.5, ins.confidence_score ?? 0.5, ins.actionable ?? 0, ins.applied ?? 0,
    ins.suggested_action ?? null, ins.pattern_id ?? null, ins.created_at ?? null, ins.id);
}

export function insertWitnessEntry(db: Database.Database, entry: WitnessRow): void {
  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.prev_hash, entry.action_hash, entry.action_type,
    entry.action_data ?? null, entry.timestamp, entry.actor);
}

// --- Table creation (delegates to brain-table-ddl.ts) ---

/** Ensure all brain-related tables exist in the target database. */
export function ensureTargetTables(db: Database.Database): void {
  ensureAllBrainTables(db);
}
