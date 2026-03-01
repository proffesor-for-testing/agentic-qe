/**
 * RVF Brain Export/Import
 *
 * Exports QE brain state into a single portable `.rvf` file using the
 * @ruvector/rvf-node native binding via rvf-native-adapter. The RVF container stores:
 *
 *   1. Vector embeddings (via adapter.ingest) — enables semantic brain search
 *   2. Full brain data JSON (via adapter.embedKernel) — complete data fidelity
 *   3. ID mapping sidecar (.idmap.json) — string-to-numeric label map
 *
 * Falls back to JSONL directory format when the native binding is unavailable.
 */

import { existsSync, statSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import {
  createRvfStore,
  openRvfStore,
  openRvfStoreReadonly,
  isRvfNativeAvailable,
} from './rvf-native-adapter.js';

// ============================================================================
// Types
// ============================================================================

export interface RvfBrainManifest {
  readonly version: '2.0';
  readonly format: 'rvf';
  readonly exportedAt: string;
  readonly sourceDb: string;
  readonly stats: {
    readonly patternCount: number;
    readonly embeddingCount: number;
    readonly qValueCount: number;
    readonly dreamInsightCount: number;
    readonly witnessChainLength: number;
  };
  readonly domains: readonly string[];
  readonly checksum: string;
  readonly rvfStatus: {
    readonly totalVectors: number;
    readonly totalSegments: number;
    readonly fileSizeBytes: number;
  };
}

export interface RvfBrainExportOptions {
  readonly outputPath: string;
  readonly domains?: readonly string[];
  readonly dimension?: number;
}

export interface RvfBrainImportOptions {
  readonly mergeStrategy: 'latest-wins' | 'highest-confidence' | 'union' | 'skip-conflicts';
  readonly dryRun?: boolean;
}

export interface RvfBrainImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly embeddingsRestored: number;
}

// ============================================================================
// Helpers
// ============================================================================

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name) as { cnt: number };
  return row.cnt > 0;
}

function queryAll(db: Database.Database, table: string, where?: string, params?: unknown[]): unknown[] {
  if (!tableExists(db, table)) return [];
  const sql = `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}`;
  const stmt = db.prepare(sql);
  return (params && params.length > 0 ? stmt.all(...params) : stmt.all()) as unknown[];
}

function domainFilter(domains?: readonly string[]): [string | undefined, string[]] {
  if (!domains || domains.length === 0) return [undefined, []];
  const placeholders = domains.map(() => '?').join(', ');
  return [`qe_domain IN (${placeholders})`, [...domains]];
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export brain state to a single `.rvf` file.
 *
 * The RVF file contains:
 * - Vector embeddings from qe_pattern_embeddings (via ingest)
 * - Full brain data serialized as JSON (via embedKernel)
 * - An idmap.json sidecar for string-to-numeric ID mapping
 */
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

  // Clean up any existing file
  if (existsSync(outPath)) unlinkSync(outPath);
  const idmapPath = `${outPath}.idmap.json`;
  if (existsSync(idmapPath)) unlinkSync(idmapPath);

  // Create RVF container via adapter (handles idmap automatically)
  const rvf = createRvfStore(outPath, dimension);

  try {
    // --- Collect all brain data ---
    const [domainWhere, domainParams] = domainFilter(options.domains);
    const patterns = queryAll(db, 'qe_patterns', domainWhere, domainParams);

    const domainSet = new Set<string>();
    for (const p of patterns as Array<{ qe_domain?: string }>) {
      if (p.qe_domain) domainSet.add(p.qe_domain);
    }

    // Q-values
    const [qWhere, qParams] = options.domains && options.domains.length > 0
      ? [`domain IN (${options.domains.map(() => '?').join(', ')})`, [...options.domains]]
      : [undefined, []];
    const qValues = queryAll(db, 'rl_q_values', qWhere, qParams);

    // Dream insights
    const dreamInsights = queryAll(db, 'dream_insights');

    // Witness chain
    const witnessChain = queryAll(db, 'witness_chain');

    // --- Ingest vector embeddings via adapter ---
    let embeddingCount = 0;

    if (tableExists(db, 'qe_pattern_embeddings')) {
      const embeddings = db.prepare(
        'SELECT pattern_id, embedding, dimension FROM qe_pattern_embeddings'
      ).all() as Array<{ pattern_id: string; embedding: Buffer; dimension: number }>;

      if (embeddings.length > 0) {
        const entries = embeddings.map(row => {
          const vecDim = Math.min(row.dimension, dimension);
          const vec = new Float32Array(dimension);
          const src = new Float32Array(
            row.embedding.buffer,
            row.embedding.byteOffset,
            vecDim
          );
          vec.set(src);
          return { id: row.pattern_id, vector: vec };
        });

        const result = rvf.ingest(entries);
        embeddingCount = result.accepted;
      }
    }

    // --- Embed full brain data as kernel ---
    const brainData = {
      version: '2.0' as const,
      format: 'rvf' as const,
      exportedAt: new Date().toISOString(),
      sourceDb: sourceDbLabel,
      patterns,
      qValues,
      dreamInsights,
      witnessChain,
      domains: [...domainSet].sort(),
    };

    const brainJson = JSON.stringify(brainData);
    const checksum = sha256(brainJson);

    rvf.embedKernel(Buffer.from(brainJson));

    // Get final status
    const status = rvf.status();

    return {
      version: '2.0',
      format: 'rvf',
      exportedAt: brainData.exportedAt,
      sourceDb: sourceDbLabel,
      stats: {
        patternCount: patterns.length,
        embeddingCount,
        qValueCount: qValues.length,
        dreamInsightCount: dreamInsights.length,
        witnessChainLength: witnessChain.length,
      },
      domains: brainData.domains,
      checksum,
      rvfStatus: {
        totalVectors: status.totalVectors,
        totalSegments: status.totalSegments,
        fileSizeBytes: status.fileSizeBytes,
      },
    };
  } finally {
    rvf.close();
  }
}

// ============================================================================
// Import
// ============================================================================

interface BrainKernelData {
  version: string;
  format: string;
  patterns: unknown[];
  qValues: unknown[];
  dreamInsights: unknown[];
  witnessChain: unknown[];
}

/**
 * Import brain state from a `.rvf` file into a SQLite database.
 */
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

  const rvf = openRvfStoreReadonly(filePath);

  try {
    // Extract brain data from kernel
    const kernel = rvf.extractKernel();
    if (!kernel || !kernel.image) {
      throw new Error('No brain data found in RVF file (missing kernel segment)');
    }

    const brainData: BrainKernelData = JSON.parse(kernel.image.toString('utf-8'));

    if (options.dryRun) {
      const total = (brainData.patterns?.length ?? 0) +
        (brainData.qValues?.length ?? 0) +
        (brainData.dreamInsights?.length ?? 0) +
        (brainData.witnessChain?.length ?? 0);
      return { imported: total, skipped: 0, conflicts: 0, embeddingsRestored: 0 };
    }

    // Ensure tables exist
    ensureTargetTables(db);

    let imported = 0;
    let skipped = 0;
    let conflicts = 0;

    // Import patterns
    if (brainData.patterns) {
      for (const pattern of brainData.patterns as PatternRow[]) {
        const r = mergePattern(db, pattern, options.mergeStrategy);
        imported += r.imported;
        skipped += r.skipped;
        conflicts += r.conflicts;
      }
    }

    // Import Q-values
    if (brainData.qValues) {
      for (const qv of brainData.qValues as QValueRow[]) {
        const r = mergeQValue(db, qv, options.mergeStrategy);
        imported += r.imported;
        skipped += r.skipped;
        conflicts += r.conflicts;
      }
    }

    // Import dream insights
    if (brainData.dreamInsights) {
      for (const ins of brainData.dreamInsights as DreamInsightRow[]) {
        const r = mergeDreamInsight(db, ins, options.mergeStrategy);
        imported += r.imported;
        skipped += r.skipped;
        conflicts += r.conflicts;
      }
    }

    // Import witness chain
    if (brainData.witnessChain) {
      for (const entry of brainData.witnessChain as WitnessRow[]) {
        const r = mergeWitnessEntry(db, entry, options.mergeStrategy);
        imported += r.imported;
        skipped += r.skipped;
        conflicts += r.conflicts;
      }
    }

    return { imported, skipped, conflicts, embeddingsRestored: 0 };
  } finally {
    rvf.close();
  }
}

// ============================================================================
// Info
// ============================================================================

/**
 * Read brain info from an RVF file without importing.
 */
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
    const brainData = JSON.parse(brainJson) as BrainKernelData & {
      exportedAt?: string;
      sourceDb?: string;
      domains?: string[];
    };

    const status = rvf.status();
    const fileSize = statSync(filePath).size;

    return {
      version: '2.0',
      format: 'rvf',
      exportedAt: brainData.exportedAt ?? 'unknown',
      sourceDb: brainData.sourceDb ?? 'unknown',
      stats: {
        patternCount: brainData.patterns?.length ?? 0,
        embeddingCount: status.totalVectors,
        qValueCount: brainData.qValues?.length ?? 0,
        dreamInsightCount: brainData.dreamInsights?.length ?? 0,
        witnessChainLength: brainData.witnessChain?.length ?? 0,
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

// ============================================================================
// Merge helpers
// ============================================================================

interface MergeResult { imported: number; skipped: number; conflicts: number }

interface PatternRow {
  id: string; pattern_type: string; qe_domain: string; domain: string; name: string;
  description?: string; confidence?: number; usage_count?: number; success_rate?: number;
  quality_score?: number; tier?: string; template_json?: string; context_json?: string;
  created_at?: string; updated_at?: string; last_used_at?: string; successful_uses?: number;
  tokens_used?: number; input_tokens?: number; output_tokens?: number; latency_ms?: number;
  reusable?: number; reuse_count?: number; average_token_savings?: number; total_tokens_saved?: number;
}

interface QValueRow {
  id: string; algorithm: string; agent_id: string; state_key: string; action_key: string;
  q_value: number; visits: number; last_reward?: number; domain?: string;
  created_at?: string; updated_at?: string;
}

interface DreamInsightRow {
  id: string; cycle_id: string; insight_type: string; source_concepts: string; description: string;
  novelty_score?: number; confidence_score?: number; actionable?: number; applied?: number;
  suggested_action?: string; pattern_id?: string; created_at?: string;
}

interface WitnessRow {
  id: number; prev_hash: string; action_hash: string; action_type: string;
  action_data?: string; timestamp: string; actor: string;
}

function mergePattern(db: Database.Database, pattern: PatternRow, strategy: string): MergeResult {
  const existing = tableExists(db, 'qe_patterns')
    ? db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get(pattern.id) as PatternRow | undefined
    : undefined;
  if (!existing) { insertPattern(db, pattern); return { imported: 1, skipped: 0, conflicts: 0 }; }
  switch (strategy) {
    case 'skip-conflicts': return { imported: 0, skipped: 1, conflicts: 1 };
    case 'latest-wins': {
      if ((pattern.updated_at || pattern.created_at || '') > (existing.updated_at || existing.created_at || '')) {
        updatePattern(db, pattern); return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    case 'highest-confidence': {
      if ((pattern.confidence ?? 0) > (existing.confidence ?? 0)) {
        updatePattern(db, pattern); return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    default: return { imported: 0, skipped: 1, conflicts: 1 };
  }
}

function mergeQValue(db: Database.Database, qv: QValueRow, strategy: string): MergeResult {
  const existing = tableExists(db, 'rl_q_values')
    ? db.prepare('SELECT * FROM rl_q_values WHERE id = ?').get(qv.id) as QValueRow | undefined
    : undefined;
  if (!existing) { insertQValue(db, qv); return { imported: 1, skipped: 0, conflicts: 0 }; }
  switch (strategy) {
    case 'skip-conflicts': return { imported: 0, skipped: 1, conflicts: 1 };
    case 'latest-wins': {
      if ((qv.updated_at || qv.created_at || '') > (existing.updated_at || existing.created_at || '')) {
        updateQValue(db, qv); return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    case 'highest-confidence': {
      if (qv.q_value > existing.q_value) { updateQValue(db, qv); return { imported: 1, skipped: 0, conflicts: 1 }; }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    default: return { imported: 0, skipped: 1, conflicts: 1 };
  }
}

function mergeDreamInsight(db: Database.Database, insight: DreamInsightRow, strategy: string): MergeResult {
  const existing = tableExists(db, 'dream_insights')
    ? db.prepare('SELECT * FROM dream_insights WHERE id = ?').get(insight.id) as DreamInsightRow | undefined
    : undefined;
  if (!existing) { insertDreamInsight(db, insight); return { imported: 1, skipped: 0, conflicts: 0 }; }
  switch (strategy) {
    case 'skip-conflicts': return { imported: 0, skipped: 1, conflicts: 1 };
    case 'latest-wins': {
      if ((insight.created_at ?? '') > (existing.created_at ?? '')) {
        updateDreamInsight(db, insight); return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    case 'highest-confidence': {
      if ((insight.confidence_score ?? 0) > (existing.confidence_score ?? 0)) {
        updateDreamInsight(db, insight); return { imported: 1, skipped: 0, conflicts: 1 };
      }
      return { imported: 0, skipped: 1, conflicts: 1 };
    }
    default: return { imported: 0, skipped: 1, conflicts: 1 };
  }
}

function mergeWitnessEntry(db: Database.Database, entry: WitnessRow, _strategy: string): MergeResult {
  const existing = tableExists(db, 'witness_chain')
    ? db.prepare('SELECT * FROM witness_chain WHERE action_hash = ? AND timestamp = ?')
        .get(entry.action_hash, entry.timestamp) as WitnessRow | undefined
    : undefined;
  if (!existing) { insertWitnessEntry(db, entry); return { imported: 1, skipped: 0, conflicts: 0 }; }
  return { imported: 0, skipped: 1, conflicts: 1 };
}

// ============================================================================
// SQL helpers
// ============================================================================

function insertPattern(db: Database.Database, p: PatternRow): void {
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
  `).run(qv.id, qv.algorithm, qv.agent_id, qv.state_key, qv.action_key,
    qv.q_value, qv.visits, qv.last_reward ?? null, qv.domain ?? null, qv.created_at ?? null, qv.updated_at ?? null);
}

function updateQValue(db: Database.Database, qv: QValueRow): void {
  db.prepare(`
    UPDATE rl_q_values SET algorithm = ?, agent_id = ?, state_key = ?, action_key = ?,
      q_value = ?, visits = ?, last_reward = ?, domain = ?, updated_at = ? WHERE id = ?
  `).run(qv.algorithm, qv.agent_id, qv.state_key, qv.action_key,
    qv.q_value, qv.visits, qv.last_reward ?? null, qv.domain ?? null, qv.updated_at ?? null, qv.id);
}

function insertDreamInsight(db: Database.Database, ins: DreamInsightRow): void {
  db.prepare(`
    INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description,
      novelty_score, confidence_score, actionable, applied, suggested_action, pattern_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ins.id, ins.cycle_id, ins.insight_type, ins.source_concepts, ins.description,
    ins.novelty_score ?? 0.5, ins.confidence_score ?? 0.5, ins.actionable ?? 0, ins.applied ?? 0,
    ins.suggested_action ?? null, ins.pattern_id ?? null, ins.created_at ?? null);
}

function updateDreamInsight(db: Database.Database, ins: DreamInsightRow): void {
  db.prepare(`
    UPDATE dream_insights SET cycle_id = ?, insight_type = ?, source_concepts = ?, description = ?,
      novelty_score = ?, confidence_score = ?, actionable = ?, applied = ?,
      suggested_action = ?, pattern_id = ?, created_at = ? WHERE id = ?
  `).run(ins.cycle_id, ins.insight_type, ins.source_concepts, ins.description,
    ins.novelty_score ?? 0.5, ins.confidence_score ?? 0.5, ins.actionable ?? 0, ins.applied ?? 0,
    ins.suggested_action ?? null, ins.pattern_id ?? null, ins.created_at ?? null, ins.id);
}

function insertWitnessEntry(db: Database.Database, entry: WitnessRow): void {
  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.prev_hash, entry.action_hash, entry.action_type,
    entry.action_data ?? null, entry.timestamp, entry.actor);
}

function ensureTargetTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL,
      domain TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
      confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0, quality_score REAL DEFAULT 0.0,
      tier TEXT DEFAULT 'short-term', template_json TEXT, context_json TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT, successful_uses INTEGER DEFAULT 0, tokens_used INTEGER,
      input_tokens INTEGER, output_tokens INTEGER, latency_ms REAL,
      reusable INTEGER DEFAULT 0, reuse_count INTEGER DEFAULT 0,
      average_token_savings REAL DEFAULT 0, total_tokens_saved INTEGER
    );
    CREATE TABLE IF NOT EXISTS rl_q_values (
      id TEXT PRIMARY KEY, algorithm TEXT NOT NULL, agent_id TEXT NOT NULL,
      state_key TEXT NOT NULL, action_key TEXT NOT NULL,
      q_value REAL NOT NULL DEFAULT 0.0, visits INTEGER NOT NULL DEFAULT 0,
      last_reward REAL, domain TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(algorithm, agent_id, state_key, action_key)
    );
    CREATE TABLE IF NOT EXISTS dream_insights (
      id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, insight_type TEXT NOT NULL,
      source_concepts TEXT NOT NULL, description TEXT NOT NULL,
      novelty_score REAL DEFAULT 0.5, confidence_score REAL DEFAULT 0.5,
      actionable INTEGER DEFAULT 0, applied INTEGER DEFAULT 0,
      suggested_action TEXT, pattern_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS witness_chain (
      id INTEGER PRIMARY KEY AUTOINCREMENT, prev_hash TEXT NOT NULL,
      action_hash TEXT NOT NULL, action_type TEXT NOT NULL,
      action_data TEXT, timestamp TEXT NOT NULL, actor TEXT NOT NULL
    );
  `);
}
