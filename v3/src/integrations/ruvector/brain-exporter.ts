/**
 * QE Brain Export/Import System
 *
 * Exports learning state (patterns, Q-values, dream insights, witness chain)
 * into a portable directory format that can be imported by another AQE instance.
 *
 * Export format (.aqe-brain directory):
 *   manifest.json       — BrainExportManifest with checksum
 *   patterns.jsonl      — One QE pattern per line
 *   q-values.jsonl      — Q-learning state-action values
 *   dream-insights.jsonl — Dream cycle discoveries
 *   witness-chain.jsonl — Witness chain entries
 *
 * Safety: Export uses a READ-ONLY connection (WAL mode, no write lock).
 * Import validates manifest checksum before merging.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import Database from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

export interface BrainExportManifest {
  readonly version: '1.0';
  readonly exportedAt: string;
  readonly sourceDb: string;
  readonly stats: {
    readonly patternCount: number;
    readonly vectorCount: number;
    readonly qValueCount: number;
    readonly dreamInsightCount: number;
    readonly witnessChainLength: number;
  };
  readonly domains: readonly string[];
  readonly checksum: string;
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
  readonly mergeStrategy: 'latest-wins' | 'highest-confidence' | 'union' | 'skip-conflicts';
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

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

/**
 * Compute a combined checksum over all JSONL content files in an export.
 * Reads each file that exists, hashes its content, then hashes the
 * concatenation of individual hashes in a deterministic order.
 */
function computeChecksum(dir: string): string {
  const FILES = ['patterns.jsonl', 'q-values.jsonl', 'dream-insights.jsonl', 'witness-chain.jsonl'];
  const hashes: string[] = [];
  for (const file of FILES) {
    const filePath = join(dir, file);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      hashes.push(sha256(content));
    } else {
      hashes.push(sha256(''));
    }
  }
  return sha256(hashes.join(':'));
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name) as { cnt: number };
  return row.cnt > 0;
}

function countRows(db: Database.Database, table: string, whereClause?: string, params?: unknown[]): number {
  if (!tableExists(db, table)) return 0;
  const sql = `SELECT COUNT(*) as cnt FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
  const stmt = db.prepare(sql);
  const row = (params && params.length > 0 ? stmt.get(...params) : stmt.get()) as { cnt: number };
  return row.cnt;
}

function queryAll(db: Database.Database, table: string, whereClause?: string, params?: unknown[]): unknown[] {
  if (!tableExists(db, table)) return [];
  const sql = `SELECT * FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
  const stmt = db.prepare(sql);
  return (params && params.length > 0 ? stmt.all(...params) : stmt.all()) as unknown[];
}

function writeJsonl(filePath: string, rows: unknown[]): void {
  const lines = rows.map(r => JSON.stringify(r));
  writeFileSync(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf-8');
}

function readJsonl<T = unknown>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (content === '') return [];
  return content.split('\n').map(line => JSON.parse(line) as T);
}

/**
 * Build a domain filter WHERE clause for qe_patterns.
 * Returns [clause, params] or [undefined, []] when no filter is needed.
 */
function domainFilter(domains?: readonly string[]): [string | undefined, string[]] {
  if (!domains || domains.length === 0) return [undefined, []];
  const placeholders = domains.map(() => '?').join(', ');
  return [`qe_domain IN (${placeholders})`, [...domains]];
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export the QE brain state from a SQLite database into a portable directory.
 *
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

  // --- Patterns ---
  const [domainWhere, domainParams] = domainFilter(options.domains);
  const patterns = queryAll(db, 'qe_patterns', domainWhere, domainParams);
  writeJsonl(join(outDir, 'patterns.jsonl'), patterns);

  // Collect distinct domains from exported patterns
  const domainSet = new Set<string>();
  for (const p of patterns as Array<{ qe_domain?: string }>) {
    if (p.qe_domain) domainSet.add(p.qe_domain);
  }

  // --- Q-Values ---
  let qValueCount = 0;
  if (options.includeQValues !== false) {
    const [qWhere, qParams] = options.domains && options.domains.length > 0
      ? [`domain IN (${options.domains.map(() => '?').join(', ')})`, [...options.domains]]
      : [undefined, []];
    const qValues = queryAll(db, 'rl_q_values', qWhere, qParams);
    writeJsonl(join(outDir, 'q-values.jsonl'), qValues);
    qValueCount = qValues.length;
  } else {
    writeJsonl(join(outDir, 'q-values.jsonl'), []);
  }

  // --- Dream Insights ---
  let dreamInsightCount = 0;
  if (options.includeDreamInsights !== false) {
    const insights = queryAll(db, 'dream_insights');
    writeJsonl(join(outDir, 'dream-insights.jsonl'), insights);
    dreamInsightCount = insights.length;
  } else {
    writeJsonl(join(outDir, 'dream-insights.jsonl'), []);
  }

  // --- Witness Chain ---
  let witnessChainLength = 0;
  if (options.includeWitnessChain !== false) {
    const chain = queryAll(db, 'witness_chain');
    writeJsonl(join(outDir, 'witness-chain.jsonl'), chain);
    witnessChainLength = chain.length;
  } else {
    writeJsonl(join(outDir, 'witness-chain.jsonl'), []);
  }

  // --- Vectors ---
  let vectorCount = 0;
  if (options.includeVectors !== false) {
    vectorCount = countRows(db, 'vectors');
  }

  // --- Checksum ---
  const checksum = computeChecksum(outDir);

  // --- Manifest ---
  const manifest: BrainExportManifest = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    sourceDb: sourceDbLabel,
    stats: {
      patternCount: patterns.length,
      vectorCount,
      qValueCount,
      dreamInsightCount,
      witnessChainLength,
    },
    domains: [...domainSet].sort(),
    checksum,
  };

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  return manifest;
}

// ============================================================================
// Import
// ============================================================================

interface PatternRow {
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

interface QValueRow {
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

interface DreamInsightRow {
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

interface WitnessRow {
  id: number;
  prev_hash: string;
  action_hash: string;
  action_type: string;
  action_data?: string;
  timestamp: string;
  actor: string;
}

/**
 * Import a brain export directory into a target SQLite database.
 *
 * Validates the manifest checksum before proceeding. Applies the chosen
 * merge strategy to resolve conflicts on existing IDs.
 */
export function importBrain(
  db: Database.Database,
  containerPath: string,
  options: BrainImportOptions
): BrainImportResult {
  const dir = resolve(containerPath);

  // Validate manifest exists
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest: BrainExportManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  // Validate checksum
  const actualChecksum = computeChecksum(dir);
  if (actualChecksum !== manifest.checksum) {
    throw new Error(
      `Checksum mismatch: expected ${manifest.checksum}, got ${actualChecksum}. ` +
      'The export may have been tampered with or corrupted.'
    );
  }

  let imported = 0;
  let skipped = 0;
  let conflicts = 0;

  if (options.dryRun) {
    // Count what would be imported without actually writing
    const patterns = readJsonl<PatternRow>(join(dir, 'patterns.jsonl'));
    const qValues = readJsonl<QValueRow>(join(dir, 'q-values.jsonl'));
    const insights = readJsonl<DreamInsightRow>(join(dir, 'dream-insights.jsonl'));
    const chain = readJsonl<WitnessRow>(join(dir, 'witness-chain.jsonl'));
    return {
      imported: patterns.length + qValues.length + insights.length + chain.length,
      skipped: 0,
      conflicts: 0,
    };
  }

  // Ensure target tables exist
  ensureTargetTables(db);

  // --- Import patterns ---
  const patterns = readJsonl<PatternRow>(join(dir, 'patterns.jsonl'));
  for (const pattern of patterns) {
    const result = mergePattern(db, pattern, options.mergeStrategy);
    imported += result.imported;
    skipped += result.skipped;
    conflicts += result.conflicts;
  }

  // --- Import Q-Values ---
  const qValues = readJsonl<QValueRow>(join(dir, 'q-values.jsonl'));
  for (const qv of qValues) {
    const result = mergeQValue(db, qv, options.mergeStrategy);
    imported += result.imported;
    skipped += result.skipped;
    conflicts += result.conflicts;
  }

  // --- Import Dream Insights ---
  const insights = readJsonl<DreamInsightRow>(join(dir, 'dream-insights.jsonl'));
  for (const insight of insights) {
    const result = mergeDreamInsight(db, insight, options.mergeStrategy);
    imported += result.imported;
    skipped += result.skipped;
    conflicts += result.conflicts;
  }

  // --- Import Witness Chain ---
  const chain = readJsonl<WitnessRow>(join(dir, 'witness-chain.jsonl'));
  for (const entry of chain) {
    const result = mergeWitnessEntry(db, entry, options.mergeStrategy);
    imported += result.imported;
    skipped += result.skipped;
    conflicts += result.conflicts;
  }

  return { imported, skipped, conflicts };
}

// ============================================================================
// Merge helpers
// ============================================================================

interface MergeResult {
  imported: number;
  skipped: number;
  conflicts: number;
}

function mergePattern(
  db: Database.Database,
  pattern: PatternRow,
  strategy: BrainImportOptions['mergeStrategy']
): MergeResult {
  const existing = tableExists(db, 'qe_patterns')
    ? db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get(pattern.id) as PatternRow | undefined
    : undefined;

  if (!existing) {
    insertPattern(db, pattern);
    return { imported: 1, skipped: 0, conflicts: 0 };
  }

  // Conflict resolution
  switch (strategy) {
    case 'skip-conflicts':
      return { imported: 0, skipped: 1, conflicts: 1 };

    case 'latest-wins': {
      const existingTime = existing.updated_at || existing.created_at || '';
      const incomingTime = pattern.updated_at || pattern.created_at || '';
      if (incomingTime > existingTime) {
        updatePattern(db, pattern);
        return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }

    case 'highest-confidence': {
      const existingConf = existing.confidence ?? 0;
      const incomingConf = pattern.confidence ?? 0;
      if (incomingConf > existingConf) {
        updatePattern(db, pattern);
        return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }

    case 'union':
      // Union: keep existing, skip duplicate IDs
      return { imported: 0, skipped: 1, conflicts: 1 };

    default:
      return { imported: 0, skipped: 1, conflicts: 1 };
  }
}

function mergeQValue(
  db: Database.Database,
  qv: QValueRow,
  strategy: BrainImportOptions['mergeStrategy']
): MergeResult {
  const existing = tableExists(db, 'rl_q_values')
    ? db.prepare('SELECT * FROM rl_q_values WHERE id = ?').get(qv.id) as QValueRow | undefined
    : undefined;

  if (!existing) {
    insertQValue(db, qv);
    return { imported: 1, skipped: 0, conflicts: 0 };
  }

  switch (strategy) {
    case 'skip-conflicts':
      return { imported: 0, skipped: 1, conflicts: 1 };

    case 'latest-wins': {
      const existingTime = existing.updated_at || existing.created_at || '';
      const incomingTime = qv.updated_at || qv.created_at || '';
      if (incomingTime > existingTime) {
        updateQValue(db, qv);
        return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }

    case 'highest-confidence': {
      // For Q-values, use q_value as the confidence proxy
      if (qv.q_value > existing.q_value) {
        updateQValue(db, qv);
        return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }

    case 'union':
      return { imported: 0, skipped: 1, conflicts: 1 };

    default:
      return { imported: 0, skipped: 1, conflicts: 1 };
  }
}

function mergeDreamInsight(
  db: Database.Database,
  insight: DreamInsightRow,
  strategy: BrainImportOptions['mergeStrategy']
): MergeResult {
  const existing = tableExists(db, 'dream_insights')
    ? db.prepare('SELECT * FROM dream_insights WHERE id = ?').get(insight.id) as DreamInsightRow | undefined
    : undefined;

  if (!existing) {
    insertDreamInsight(db, insight);
    return { imported: 1, skipped: 0, conflicts: 0 };
  }

  switch (strategy) {
    case 'skip-conflicts':
      return { imported: 0, skipped: 1, conflicts: 1 };

    case 'latest-wins': {
      const existingTime = existing.created_at || '';
      const incomingTime = insight.created_at || '';
      if (incomingTime > existingTime) {
        updateDreamInsight(db, insight);
        return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }

    case 'highest-confidence': {
      const existingConf = existing.confidence_score ?? 0;
      const incomingConf = insight.confidence_score ?? 0;
      if (incomingConf > existingConf) {
        updateDreamInsight(db, insight);
        return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }

    case 'union':
      return { imported: 0, skipped: 1, conflicts: 1 };

    default:
      return { imported: 0, skipped: 1, conflicts: 1 };
  }
}

function mergeWitnessEntry(
  db: Database.Database,
  entry: WitnessRow,
  strategy: BrainImportOptions['mergeStrategy']
): MergeResult {
  // Witness chain uses INTEGER AUTOINCREMENT id — check by action_hash + timestamp for dedup
  const existing = tableExists(db, 'witness_chain')
    ? db.prepare(
        'SELECT * FROM witness_chain WHERE action_hash = ? AND timestamp = ?'
      ).get(entry.action_hash, entry.timestamp) as WitnessRow | undefined
    : undefined;

  if (!existing) {
    insertWitnessEntry(db, entry);
    return { imported: 1, skipped: 0, conflicts: 0 };
  }

  // All strategies skip duplicate witness entries (append-only log)
  return { imported: 0, skipped: 1, conflicts: 1 };
}

// ============================================================================
// SQL Insert/Update helpers
// ============================================================================

function insertPattern(db: Database.Database, p: PatternRow): void {
  db.prepare(`
    INSERT INTO qe_patterns (
      id, pattern_type, qe_domain, domain, name, description,
      confidence, usage_count, success_rate, quality_score, tier,
      template_json, context_json, created_at, updated_at, last_used_at,
      successful_uses, tokens_used, input_tokens, output_tokens,
      latency_ms, reusable, reuse_count, average_token_savings, total_tokens_saved
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    p.id, p.pattern_type, p.qe_domain, p.domain, p.name, p.description ?? null,
    p.confidence ?? 0.5, p.usage_count ?? 0, p.success_rate ?? 0, p.quality_score ?? 0, p.tier ?? 'short-term',
    p.template_json ?? null, p.context_json ?? null, p.created_at ?? null, p.updated_at ?? null, p.last_used_at ?? null,
    p.successful_uses ?? 0, p.tokens_used ?? null, p.input_tokens ?? null, p.output_tokens ?? null,
    p.latency_ms ?? null, p.reusable ?? 0, p.reuse_count ?? 0, p.average_token_savings ?? 0, p.total_tokens_saved ?? null
  );
}

function updatePattern(db: Database.Database, p: PatternRow): void {
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

function insertQValue(db: Database.Database, qv: QValueRow): void {
  db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, last_reward, domain, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    qv.id, qv.algorithm, qv.agent_id, qv.state_key, qv.action_key,
    qv.q_value, qv.visits, qv.last_reward ?? null, qv.domain ?? null,
    qv.created_at ?? null, qv.updated_at ?? null
  );
}

function updateQValue(db: Database.Database, qv: QValueRow): void {
  db.prepare(`
    UPDATE rl_q_values SET
      algorithm = ?, agent_id = ?, state_key = ?, action_key = ?,
      q_value = ?, visits = ?, last_reward = ?, domain = ?, updated_at = ?
    WHERE id = ?
  `).run(
    qv.algorithm, qv.agent_id, qv.state_key, qv.action_key,
    qv.q_value, qv.visits, qv.last_reward ?? null, qv.domain ?? null,
    qv.updated_at ?? null, qv.id
  );
}

function insertDreamInsight(db: Database.Database, ins: DreamInsightRow): void {
  db.prepare(`
    INSERT INTO dream_insights (
      id, cycle_id, insight_type, source_concepts, description,
      novelty_score, confidence_score, actionable, applied,
      suggested_action, pattern_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ins.id, ins.cycle_id, ins.insight_type, ins.source_concepts, ins.description,
    ins.novelty_score ?? 0.5, ins.confidence_score ?? 0.5,
    ins.actionable ?? 0, ins.applied ?? 0,
    ins.suggested_action ?? null, ins.pattern_id ?? null, ins.created_at ?? null
  );
}

function updateDreamInsight(db: Database.Database, ins: DreamInsightRow): void {
  db.prepare(`
    UPDATE dream_insights SET
      cycle_id = ?, insight_type = ?, source_concepts = ?, description = ?,
      novelty_score = ?, confidence_score = ?, actionable = ?, applied = ?,
      suggested_action = ?, pattern_id = ?, created_at = ?
    WHERE id = ?
  `).run(
    ins.cycle_id, ins.insight_type, ins.source_concepts, ins.description,
    ins.novelty_score ?? 0.5, ins.confidence_score ?? 0.5,
    ins.actionable ?? 0, ins.applied ?? 0,
    ins.suggested_action ?? null, ins.pattern_id ?? null, ins.created_at ?? null,
    ins.id
  );
}

function insertWitnessEntry(db: Database.Database, entry: WitnessRow): void {
  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.prev_hash, entry.action_hash, entry.action_type,
    entry.action_data ?? null, entry.timestamp, entry.actor
  );
}

// ============================================================================
// Table creation for import targets
// ============================================================================

function ensureTargetTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS qe_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      qe_domain TEXT NOT NULL,
      domain TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0,
      quality_score REAL DEFAULT 0.0,
      tier TEXT DEFAULT 'short-term',
      template_json TEXT,
      context_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      successful_uses INTEGER DEFAULT 0,
      tokens_used INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms REAL,
      reusable INTEGER DEFAULT 0,
      reuse_count INTEGER DEFAULT 0,
      average_token_savings REAL DEFAULT 0,
      total_tokens_saved INTEGER
    );

    CREATE TABLE IF NOT EXISTS rl_q_values (
      id TEXT PRIMARY KEY,
      algorithm TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      action_key TEXT NOT NULL,
      q_value REAL NOT NULL DEFAULT 0.0,
      visits INTEGER NOT NULL DEFAULT 0,
      last_reward REAL,
      domain TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(algorithm, agent_id, state_key, action_key)
    );

    CREATE TABLE IF NOT EXISTS dream_insights (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      insight_type TEXT NOT NULL,
      source_concepts TEXT NOT NULL,
      description TEXT NOT NULL,
      novelty_score REAL DEFAULT 0.5,
      confidence_score REAL DEFAULT 0.5,
      actionable INTEGER DEFAULT 0,
      applied INTEGER DEFAULT 0,
      suggested_action TEXT,
      pattern_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dream_cycles (
      id TEXT PRIMARY KEY,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_ms INTEGER,
      concepts_processed INTEGER DEFAULT 0,
      associations_found INTEGER DEFAULT 0,
      insights_generated INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS witness_chain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prev_hash TEXT NOT NULL,
      action_hash TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_data TEXT,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vectors (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL DEFAULT 'default',
      embedding BLOB NOT NULL,
      dimensions INTEGER NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ============================================================================
// Brain Info
// ============================================================================

/**
 * Read and return the manifest from a brain export directory.
 */
export function brainInfo(containerPath: string): BrainExportManifest {
  const dir = resolve(containerPath);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as BrainExportManifest;
}
