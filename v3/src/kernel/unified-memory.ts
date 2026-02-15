/**
 * True Unified Memory Manager for AQE V3
 *
 * Single database file: .agentic-qe/memory.db
 *
 * Consolidates ALL persistence into one file:
 * - KV Store (v2 compatible)
 * - Vectors (BLOB storage, HNSW index built in-memory)
 * - Q-Values (RL algorithms)
 * - GOAP (planning)
 * - Dreams (concept graph)
 *
 * Benefits:
 * - Single file for backup/restore
 * - v2 backward compatibility (existing memory.db migrates seamlessly)
 * - Atomic cross-feature transactions
 * - No confusion about where data lives
 */

import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { cosineSimilarity } from '../shared/utils/vector-math.js';
import { HYPERGRAPH_SCHEMA } from '../migrations/20260120_add_hypergraph_tables.js';
import { MEMORY_CONSTANTS, HNSW_CONSTANTS } from './constants.js';

// ============================================================================
// SQL Table Name Allowlist (defense-in-depth against SQL injection)
// ============================================================================

// Re-export from shared module for backward compatibility
export { validateTableName, ALLOWED_TABLE_NAMES } from '../shared/sql-safety.js';
import { validateTableName } from '../shared/sql-safety.js';

// CRDT imports for distributed state synchronization
import {
  createCRDTStore,
  type CRDTStore,
  type CRDTStoreState,
  type CRDTStoreDelta,
} from '../memory/crdt/index.js';

// ============================================================================
// Project Root Detection
// ============================================================================

/**
 * Find the project root by walking up the directory tree.
 *
 * Priority order:
 * 1. AQE_PROJECT_ROOT environment variable (set by MCP config or init)
 * 2. Walk up looking for .agentic-qe directory (existing AQE project)
 * 3. Walk up looking for .git directory (git repo root)
 * 4. Walk up looking for package.json WITHOUT node_modules sibling (monorepo root)
 * 5. Fallback to current working directory
 *
 * This ensures ALL V3 systems persist to the same database regardless
 * of which subdirectory they are run from (especially in monorepos).
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  // Priority 1: Environment variable (set by MCP config)
  if (process.env.AQE_PROJECT_ROOT) {
    return process.env.AQE_PROJECT_ROOT;
  }

  let dir = startDir;
  const root = path.parse(dir).root;

  // Priority 2: Look for existing .agentic-qe directory (AQE project marker)
  // Walk ALL the way up and use the TOPMOST .agentic-qe found, not the first.
  // This prevents subdirectories (e.g. v3/.agentic-qe) from shadowing the
  // root project database, which caused a split-brain with two DBs growing.
  let checkDir = dir;
  let topmostAqeDir: string | null = null;
  while (checkDir !== root) {
    if (fs.existsSync(path.join(checkDir, '.agentic-qe'))) {
      topmostAqeDir = checkDir;
    }
    checkDir = path.dirname(checkDir);
  }
  if (topmostAqeDir) {
    return topmostAqeDir;
  }

  // Priority 3: Look for .git directory (repo root)
  checkDir = dir;
  while (checkDir !== root) {
    if (fs.existsSync(path.join(checkDir, '.git'))) {
      return checkDir;
    }
    checkDir = path.dirname(checkDir);
  }

  // Priority 4: Look for root package.json (skip monorepo subdirectories)
  // A root package.json typically has workspaces or is not inside node_modules
  checkDir = dir;
  let lastPackageJson: string | null = null;
  while (checkDir !== root) {
    if (fs.existsSync(path.join(checkDir, 'package.json'))) {
      lastPackageJson = checkDir;
    }
    checkDir = path.dirname(checkDir);
  }
  if (lastPackageJson) {
    return lastPackageJson;
  }

  // Fallback to current working directory
  return process.cwd();
}

/**
 * Get the default database path using project root detection.
 * Always resolves to {project_root}/.agentic-qe/memory.db
 */
export function getDefaultDbPath(): string {
  const projectRoot = findProjectRoot();
  return path.join(projectRoot, '.agentic-qe', 'memory.db');
}

// ============================================================================
// Configuration
// ============================================================================

export interface UnifiedMemoryConfig {
  /** Database file path - defaults to .agentic-qe/memory.db */
  dbPath: string;
  /** Enable WAL mode for better concurrency */
  walMode: boolean;
  /** Memory-mapped I/O size in bytes */
  mmapSize: number;
  /** Cache size in pages (-ve = KB) */
  cacheSize: number;
  /** Busy timeout in milliseconds */
  busyTimeout: number;
  /** Vector dimensions (for HNSW) */
  vectorDimensions: number;
}

/**
 * Default config uses project root detection for the database path.
 * This ensures all V3 systems (MCP, CLI, hooks) use the same database.
 *
 * NOTE: dbPath is resolved lazily via getDefaultDbPath() when config
 * is first used. The static value here is a fallback for edge cases.
 */
export const DEFAULT_UNIFIED_MEMORY_CONFIG: UnifiedMemoryConfig = {
  dbPath: '.agentic-qe/memory.db',  // Resolved to project root at runtime
  walMode: true,
  mmapSize: MEMORY_CONSTANTS.MMAP_SIZE_BYTES,
  cacheSize: MEMORY_CONSTANTS.CACHE_SIZE_KB,
  busyTimeout: MEMORY_CONSTANTS.BUSY_TIMEOUT_MS,
  vectorDimensions: MEMORY_CONSTANTS.DEFAULT_VECTOR_DIMENSIONS,
};

/**
 * Get the resolved default config with project root detection applied.
 * Call this instead of using DEFAULT_UNIFIED_MEMORY_CONFIG directly.
 */
export function getResolvedDefaultConfig(): UnifiedMemoryConfig {
  return {
    ...DEFAULT_UNIFIED_MEMORY_CONFIG,
    dbPath: getDefaultDbPath(),
  };
}

// ============================================================================
// Empty Tables Audit (Issue #260, 2026-02-14)
// ============================================================================
// The following 10 tables exist in the schema but have ZERO production writes.
// They are candidates for removal in a future schema migration:
//   - artifacts, baselines, consensus_state, learning_history,
//     memory_acl, nervous_system_state, pattern_versions,
//     sessions, transfer_test_results, transfer_validations
//
// Tables actively wired (DO NOT remove):
//   - embeddings, executed_steps, execution_results,
//     goap_execution_steps, goap_goals, goap_plan_signatures,
//     hypergraph_edges, hypergraph_nodes
//
// Tables partially wired (in allowlist, need INSERT code):
//   - learning_metrics, ooda_cycles, performance_metrics,
//     workflow_state, experience_applications
// ============================================================================

// ============================================================================
// Schema Version for Migrations
// ============================================================================

const SCHEMA_VERSION = 8; // v8: adds feedback loop persistence tables (ADR-023, ADR-022)

const SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    migrated_at TEXT DEFAULT (datetime('now'))
  );
`;

// ============================================================================
// Schema Definitions
// ============================================================================

const KV_STORE_SCHEMA = `
  -- Key-Value Store (v2 compatible - same schema as HybridBackend)
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT NOT NULL,
    namespace TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (namespace, key)
  );
  CREATE INDEX IF NOT EXISTS idx_kv_namespace ON kv_store(namespace);
  CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_store(expires_at) WHERE expires_at IS NOT NULL;
`;

const VECTORS_SCHEMA = `
  -- Vector Embeddings (new in v3 - replaces in-memory AgentDB)
  CREATE TABLE IF NOT EXISTS vectors (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL DEFAULT 'default',
    embedding BLOB NOT NULL,
    dimensions INTEGER NOT NULL,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vectors_namespace ON vectors(namespace);
  CREATE INDEX IF NOT EXISTS idx_vectors_dimensions ON vectors(dimensions);
`;

const RL_QVALUES_SCHEMA = `
  -- Q-Values for RL algorithms (ADR-046)
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
  CREATE INDEX IF NOT EXISTS idx_qvalues_agent ON rl_q_values(agent_id);
  CREATE INDEX IF NOT EXISTS idx_qvalues_algorithm ON rl_q_values(algorithm);
  CREATE INDEX IF NOT EXISTS idx_qvalues_state ON rl_q_values(agent_id, state_key);
  CREATE INDEX IF NOT EXISTS idx_qvalues_domain ON rl_q_values(domain);
  CREATE INDEX IF NOT EXISTS idx_qvalues_updated ON rl_q_values(updated_at);
`;

const GOAP_SCHEMA = `
  -- GOAP Goals
  CREATE TABLE IF NOT EXISTS goap_goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    conditions TEXT NOT NULL,
    priority INTEGER DEFAULT 3,
    qe_domain TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- GOAP Actions
  CREATE TABLE IF NOT EXISTS goap_actions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    agent_type TEXT NOT NULL,
    preconditions TEXT NOT NULL,
    effects TEXT NOT NULL,
    cost REAL DEFAULT 1.0,
    estimated_duration_ms INTEGER,
    success_rate REAL DEFAULT 1.0,
    execution_count INTEGER DEFAULT 0,
    category TEXT NOT NULL,
    qe_domain TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- GOAP Plans
  CREATE TABLE IF NOT EXISTS goap_plans (
    id TEXT PRIMARY KEY,
    goal_id TEXT,
    initial_state TEXT NOT NULL,
    goal_state TEXT NOT NULL,
    action_sequence TEXT NOT NULL,
    total_cost REAL,
    estimated_duration_ms INTEGER,
    status TEXT DEFAULT 'pending',
    reused_from TEXT,
    similarity_score REAL,
    created_at TEXT DEFAULT (datetime('now')),
    executed_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (goal_id) REFERENCES goap_goals(id)
  );

  -- GOAP Execution Steps
  CREATE TABLE IF NOT EXISTS goap_execution_steps (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    world_state_before TEXT,
    world_state_after TEXT,
    status TEXT DEFAULT 'pending',
    duration_ms INTEGER,
    agent_id TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (plan_id) REFERENCES goap_plans(id),
    FOREIGN KEY (action_id) REFERENCES goap_actions(id)
  );

  -- Plan Signatures (for similarity matching)
  CREATE TABLE IF NOT EXISTS goap_plan_signatures (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL UNIQUE,
    goal_hash TEXT NOT NULL,
    state_vector TEXT NOT NULL,
    action_sequence TEXT NOT NULL,
    total_cost REAL NOT NULL,
    success_rate REAL DEFAULT 1.0,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- GOAP Indexes
  CREATE INDEX IF NOT EXISTS idx_goap_actions_category ON goap_actions(category);
  CREATE INDEX IF NOT EXISTS idx_goap_actions_agent ON goap_actions(agent_type);
  CREATE INDEX IF NOT EXISTS idx_goap_plans_status ON goap_plans(status);
  CREATE INDEX IF NOT EXISTS idx_goap_steps_plan ON goap_execution_steps(plan_id);
  CREATE INDEX IF NOT EXISTS idx_goap_sig_goal ON goap_plan_signatures(goal_hash);
`;

const DREAM_SCHEMA = `
  -- Concept Graph Nodes (Dream Engine)
  CREATE TABLE IF NOT EXISTS concept_nodes (
    id TEXT PRIMARY KEY,
    concept_type TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    activation_level REAL DEFAULT 0.0,
    last_activated TEXT,
    pattern_id TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Concept Edges
  CREATE TABLE IF NOT EXISTS concept_edges (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    edge_type TEXT NOT NULL,
    evidence INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (source) REFERENCES concept_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES concept_nodes(id) ON DELETE CASCADE
  );

  -- Dream Cycles
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

  -- Dream Insights
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
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cycle_id) REFERENCES dream_cycles(id) ON DELETE CASCADE
  );

  -- Dream Indexes
  CREATE INDEX IF NOT EXISTS idx_concept_type ON concept_nodes(concept_type);
  CREATE INDEX IF NOT EXISTS idx_concept_activation ON concept_nodes(activation_level);
  CREATE INDEX IF NOT EXISTS idx_concept_pattern ON concept_nodes(pattern_id);
  CREATE INDEX IF NOT EXISTS idx_edge_source ON concept_edges(source);
  CREATE INDEX IF NOT EXISTS idx_edge_target ON concept_edges(target);
  CREATE INDEX IF NOT EXISTS idx_edge_type ON concept_edges(edge_type);
  CREATE INDEX IF NOT EXISTS idx_edge_weight ON concept_edges(weight DESC);
  CREATE INDEX IF NOT EXISTS idx_insight_cycle ON dream_insights(cycle_id);
  CREATE INDEX IF NOT EXISTS idx_dream_status ON dream_cycles(status);
`;

const QE_PATTERNS_SCHEMA = `
  -- QE Patterns table (unified from sqlite-persistence.ts)
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

  -- Pattern embeddings table (BLOB storage for vectors)
  CREATE TABLE IF NOT EXISTS qe_pattern_embeddings (
    pattern_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    dimension INTEGER NOT NULL,
    model TEXT DEFAULT 'all-MiniLM-L6-v2',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
  );

  -- Pattern usage history (no FK — used as analytics log by hooks with synthetic IDs)
  CREATE TABLE IF NOT EXISTS qe_pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    success INTEGER NOT NULL,
    metrics_json TEXT,
    feedback TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Learning trajectories
  CREATE TABLE IF NOT EXISTS qe_trajectories (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    agent TEXT,
    domain TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    success INTEGER,
    steps_json TEXT,
    metadata_json TEXT
  );

  -- Embeddings table (unified from EmbeddingCache.ts)
  -- Renamed from 'embedding_cache' to 'embeddings' to match existing code
  CREATE TABLE IF NOT EXISTS embeddings (
    key TEXT NOT NULL,
    namespace TEXT NOT NULL,
    vector BLOB NOT NULL,
    dimension INTEGER NOT NULL,
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    quantization TEXT NOT NULL,
    metadata TEXT,
    access_count INTEGER DEFAULT 1,
    last_access INTEGER NOT NULL,
    PRIMARY KEY (key, namespace)
  );

  -- Execution results table (unified from plan-executor.ts)
  CREATE TABLE IF NOT EXISTS execution_results (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    steps_completed INTEGER DEFAULT 0,
    steps_failed INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    final_world_state TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Executed steps table (unified from plan-executor.ts)
  CREATE TABLE IF NOT EXISTS executed_steps (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    status TEXT NOT NULL,
    retries INTEGER DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,
    agent_id TEXT,
    agent_output TEXT,
    world_state_before TEXT,
    world_state_after TEXT,
    error_message TEXT,
    FOREIGN KEY (execution_id) REFERENCES execution_results(id)
  );

  -- QE Patterns indexes
  CREATE INDEX IF NOT EXISTS idx_qe_patterns_domain ON qe_patterns(qe_domain);
  CREATE INDEX IF NOT EXISTS idx_qe_patterns_type ON qe_patterns(pattern_type);
  CREATE INDEX IF NOT EXISTS idx_qe_patterns_tier ON qe_patterns(tier);
  CREATE INDEX IF NOT EXISTS idx_qe_patterns_quality ON qe_patterns(quality_score DESC);
  CREATE INDEX IF NOT EXISTS idx_qe_usage_pattern ON qe_pattern_usage(pattern_id);
  CREATE INDEX IF NOT EXISTS idx_qe_trajectories_domain ON qe_trajectories(domain);
  CREATE INDEX IF NOT EXISTS idx_embeddings_namespace ON embeddings(namespace);
  CREATE INDEX IF NOT EXISTS idx_embeddings_timestamp ON embeddings(timestamp);
  CREATE INDEX IF NOT EXISTS idx_execution_results_plan ON execution_results(plan_id);
  CREATE INDEX IF NOT EXISTS idx_execution_results_status ON execution_results(status);
  CREATE INDEX IF NOT EXISTS idx_executed_steps_execution ON executed_steps(execution_id);
  CREATE INDEX IF NOT EXISTS idx_executed_steps_action ON executed_steps(action_id);
`;

const MINCUT_SCHEMA = `
  -- MinCut Graph Snapshots (ADR-047)
  CREATE TABLE IF NOT EXISTS mincut_snapshots (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    vertex_count INTEGER NOT NULL,
    edge_count INTEGER NOT NULL,
    total_weight REAL NOT NULL DEFAULT 0.0,
    is_connected INTEGER NOT NULL DEFAULT 1,
    component_count INTEGER NOT NULL DEFAULT 1,
    vertices_json TEXT NOT NULL,
    edges_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- MinCut History (time-series MinCut values)
  CREATE TABLE IF NOT EXISTS mincut_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    mincut_value REAL NOT NULL,
    vertex_count INTEGER NOT NULL,
    edge_count INTEGER NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'weighted-degree',
    duration_ms INTEGER,
    snapshot_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (snapshot_id) REFERENCES mincut_snapshots(id) ON DELETE SET NULL
  );

  -- MinCut Weak Vertices (detected bottlenecks)
  CREATE TABLE IF NOT EXISTS mincut_weak_vertices (
    id TEXT PRIMARY KEY,
    vertex_id TEXT NOT NULL,
    weighted_degree REAL NOT NULL,
    risk_score REAL NOT NULL,
    reason TEXT NOT NULL,
    domain TEXT,
    vertex_type TEXT NOT NULL,
    suggestions_json TEXT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    snapshot_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (snapshot_id) REFERENCES mincut_snapshots(id) ON DELETE SET NULL
  );

  -- MinCut Alerts
  CREATE TABLE IF NOT EXISTS mincut_alerts (
    id TEXT PRIMARY KEY,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    mincut_value REAL NOT NULL,
    threshold REAL NOT NULL,
    affected_vertices_json TEXT,
    remediations_json TEXT,
    acknowledged INTEGER DEFAULT 0,
    acknowledged_at TEXT,
    acknowledged_by TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- MinCut Healing Actions (self-healing history)
  CREATE TABLE IF NOT EXISTS mincut_healing_actions (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    action_params_json TEXT NOT NULL,
    success INTEGER NOT NULL,
    mincut_before REAL NOT NULL,
    mincut_after REAL NOT NULL,
    improvement REAL NOT NULL DEFAULT 0.0,
    error_message TEXT,
    duration_ms INTEGER NOT NULL,
    triggered_by TEXT,
    snapshot_before_id TEXT,
    snapshot_after_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (snapshot_before_id) REFERENCES mincut_snapshots(id) ON DELETE SET NULL,
    FOREIGN KEY (snapshot_after_id) REFERENCES mincut_snapshots(id) ON DELETE SET NULL
  );

  -- MinCut Strange Loop Observations (P1: self-organizing)
  CREATE TABLE IF NOT EXISTS mincut_observations (
    id TEXT PRIMARY KEY,
    iteration INTEGER NOT NULL,
    mincut_value REAL NOT NULL,
    weak_vertex_count INTEGER NOT NULL DEFAULT 0,
    weak_vertices_json TEXT,
    snapshot_id TEXT,
    prediction_json TEXT,
    actual_vs_predicted_diff REAL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (snapshot_id) REFERENCES mincut_snapshots(id) ON DELETE SET NULL
  );

  -- MinCut Indexes
  CREATE INDEX IF NOT EXISTS idx_mincut_history_timestamp ON mincut_history(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_mincut_history_value ON mincut_history(mincut_value);
  CREATE INDEX IF NOT EXISTS idx_mincut_weak_vertex ON mincut_weak_vertices(vertex_id);
  CREATE INDEX IF NOT EXISTS idx_mincut_weak_risk ON mincut_weak_vertices(risk_score DESC);
  CREATE INDEX IF NOT EXISTS idx_mincut_weak_resolved ON mincut_weak_vertices(resolved_at);
  CREATE INDEX IF NOT EXISTS idx_mincut_alerts_severity ON mincut_alerts(severity);
  CREATE INDEX IF NOT EXISTS idx_mincut_alerts_ack ON mincut_alerts(acknowledged);
  CREATE INDEX IF NOT EXISTS idx_mincut_healing_type ON mincut_healing_actions(action_type);
  CREATE INDEX IF NOT EXISTS idx_mincut_healing_success ON mincut_healing_actions(success);
  CREATE INDEX IF NOT EXISTS idx_mincut_observations_iter ON mincut_observations(iteration);
`;

const SONA_PATTERNS_SCHEMA = `
  -- SONA Patterns table (ADR-046: Pattern Persistence for Neural Backbone)
  CREATE TABLE IF NOT EXISTS sona_patterns (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    domain TEXT NOT NULL,
    state_embedding BLOB,
    action_embedding BLOB,
    action_type TEXT NOT NULL,
    action_value TEXT,
    outcome_reward REAL NOT NULL DEFAULT 0.0,
    outcome_success INTEGER NOT NULL DEFAULT 0,
    outcome_quality REAL NOT NULL DEFAULT 0.0,
    confidence REAL DEFAULT 0.5,
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_type ON sona_patterns(type);
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_domain ON sona_patterns(domain);
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_confidence ON sona_patterns(confidence DESC);
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_updated ON sona_patterns(updated_at DESC);
`;

const FEEDBACK_SCHEMA = `
  -- Test outcomes (ADR-023: Quality Feedback Loop)
  CREATE TABLE IF NOT EXISTS test_outcomes (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    test_name TEXT NOT NULL,
    generated_by TEXT NOT NULL,
    pattern_id TEXT,
    framework TEXT NOT NULL,
    language TEXT NOT NULL,
    domain TEXT NOT NULL,
    passed INTEGER NOT NULL,
    error_message TEXT,
    coverage_lines REAL DEFAULT 0,
    coverage_branches REAL DEFAULT 0,
    coverage_functions REAL DEFAULT 0,
    mutation_score REAL,
    execution_time_ms REAL NOT NULL,
    flaky INTEGER DEFAULT 0,
    flakiness_score REAL,
    maintainability_score REAL NOT NULL,
    complexity REAL,
    lines_of_code INTEGER,
    assertion_count INTEGER,
    file_path TEXT,
    source_file_path TEXT,
    metadata_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_test_outcomes_pattern ON test_outcomes(pattern_id);
  CREATE INDEX IF NOT EXISTS idx_test_outcomes_agent ON test_outcomes(generated_by);
  CREATE INDEX IF NOT EXISTS idx_test_outcomes_domain ON test_outcomes(domain);
  CREATE INDEX IF NOT EXISTS idx_test_outcomes_created ON test_outcomes(created_at);

  -- Routing outcomes (ADR-022: Adaptive QE Agent Routing)
  CREATE TABLE IF NOT EXISTS routing_outcomes (
    id TEXT PRIMARY KEY,
    task_json TEXT NOT NULL,
    decision_json TEXT NOT NULL,
    used_agent TEXT NOT NULL,
    followed_recommendation INTEGER NOT NULL,
    success INTEGER NOT NULL,
    quality_score REAL NOT NULL,
    duration_ms REAL NOT NULL,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_routing_outcomes_agent ON routing_outcomes(used_agent);
  CREATE INDEX IF NOT EXISTS idx_routing_outcomes_created ON routing_outcomes(created_at);

  -- Coverage sessions (ADR-023: Coverage Learning)
  CREATE TABLE IF NOT EXISTS coverage_sessions (
    id TEXT PRIMARY KEY,
    target_path TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    technique TEXT NOT NULL,
    before_lines REAL DEFAULT 0,
    before_branches REAL DEFAULT 0,
    before_functions REAL DEFAULT 0,
    after_lines REAL DEFAULT 0,
    after_branches REAL DEFAULT 0,
    after_functions REAL DEFAULT 0,
    tests_generated INTEGER DEFAULT 0,
    tests_passed INTEGER DEFAULT 0,
    gaps_json TEXT,
    duration_ms REAL NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    context_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_coverage_sessions_technique ON coverage_sessions(technique);
  CREATE INDEX IF NOT EXISTS idx_coverage_sessions_agent ON coverage_sessions(agent_id);
  CREATE INDEX IF NOT EXISTS idx_coverage_sessions_created ON coverage_sessions(created_at);
`;

// ============================================================================
// In-Memory HNSW Index for Fast Vector Search
// ============================================================================

/**
 * Binary min/max heap for O(log n) insertion and extraction.
 * Replaces sorted arrays with O(n) splice in HNSW beam search.
 */
class BinaryHeap<T> {
  private data: T[] = [];
  private compareFn: (a: T, b: T) => number;

  constructor(compareFn: (a: T, b: T) => number) {
    this.compareFn = compareFn;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): T | undefined {
    return this.data[0];
  }

  size(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compareFn(this.data[i], this.data[parent]) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compareFn(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.compareFn(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else {
        break;
      }
    }
  }
}

interface HNSWNode {
  id: string;
  embedding: number[];
  neighbors: Map<number, string[]>; // level -> neighbor ids
}

/**
 * In-memory HNSW (Hierarchical Navigable Small World) index built from
 * SQLite vectors on startup. Provides O(log n) approximate nearest
 * neighbor search via a multi-layer navigable small-world graph.
 *
 * Algorithm reference: Malkov & Yashunin, "Efficient and robust approximate
 * nearest neighbor search using Hierarchical Navigable Small World graphs",
 * IEEE TPAMI 2018.
 */
class InMemoryHNSWIndex {
  private nodes: Map<string, HNSWNode> = new Map();
  private readonly M: number = HNSW_CONSTANTS.M_CONNECTIONS;
  private readonly Mmax0: number = HNSW_CONSTANTS.M_CONNECTIONS * 2;
  private readonly efConstruction: number = HNSW_CONSTANTS.EF_CONSTRUCTION;
  private readonly efSearch: number = HNSW_CONSTANTS.EF_SEARCH;
  private readonly mL: number = 1 / Math.log(HNSW_CONSTANTS.M_CONNECTIONS);
  private readonly maxLevel: number = 16;

  private entryPoint: string | null = null;
  private currentMaxLevel: number = -1;

  /**
   * Assign a random layer for a new node using a geometric distribution.
   * level = floor(-ln(uniform_random) * mL), capped at maxLevel.
   */
  private randomLevel(): number {
    return Math.min(
      Math.floor(-Math.log(Math.random()) * this.mL),
      this.maxLevel
    );
  }

  /**
   * Compute cosine similarity between a query vector and a stored node.
   */
  private similarity(query: number[], nodeId: string): number {
    const node = this.nodes.get(nodeId);
    if (!node) return -1;
    return cosineSimilarity(query, node.embedding);
  }

  /**
   * Greedy search at a single layer: starting from a single entry point,
   * greedily move to the neighbor closest to the query until no improvement.
   * Returns the closest node found.
   */
  private searchLayer(
    query: number[],
    entryId: string,
    level: number
  ): string {
    let current = entryId;
    let currentDist = this.similarity(query, current);
    let improved = true;

    while (improved) {
      improved = false;
      const node = this.nodes.get(current);
      if (!node) break;

      const neighbors = node.neighbors.get(level) ?? [];
      for (const neighborId of neighbors) {
        if (!this.nodes.has(neighborId)) continue;
        const dist = this.similarity(query, neighborId);
        if (dist > currentDist) {
          current = neighborId;
          currentDist = dist;
          improved = true;
        }
      }
    }

    return current;
  }

  /**
   * Beam search at a single layer: starting from an entry point, explore
   * up to `ef` candidates and return the `ef` closest found.
   * Uses a max-heap for candidates and a min-heap for results to achieve
   * O(log n) insertion instead of O(n) Array.splice.
   * Returns results sorted by descending similarity.
   */
  private searchLayerBeam(
    query: number[],
    entryIds: string[],
    level: number,
    ef: number
  ): Array<{ id: string; score: number }> {
    const visited = new Set<string>(entryIds);

    const initial = entryIds
      .filter(id => this.nodes.has(id))
      .map(id => ({ id, score: this.similarity(query, id) }));

    // Max-heap for candidates (best score = highest priority)
    const candidateHeap = new BinaryHeap<{ id: string; score: number }>(
      (a, b) => b.score - a.score // max-heap: highest score first
    );
    // Min-heap for results (worst score at top for fast eviction)
    const resultHeap = new BinaryHeap<{ id: string; score: number }>(
      (a, b) => a.score - b.score // min-heap: lowest score first
    );

    for (const entry of initial) {
      candidateHeap.push(entry);
      resultHeap.push(entry);
    }

    while (candidateHeap.size() > 0) {
      const closest = candidateHeap.pop()!;

      // If the closest candidate is worse than the worst in results
      // and we already have ef results, stop
      if (resultHeap.size() >= ef && closest.score < resultHeap.peek()!.score) {
        break;
      }

      const node = this.nodes.get(closest.id);
      if (!node) continue;

      const neighbors = node.neighbors.get(level) ?? [];
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        if (!this.nodes.has(neighborId)) continue;

        const score = this.similarity(query, neighborId);
        const worstResult = resultHeap.size() >= ef ? resultHeap.peek()!.score : -Infinity;

        if (resultHeap.size() < ef || score > worstResult) {
          const entry = { id: neighborId, score };
          candidateHeap.push(entry);
          resultHeap.push(entry);

          // Evict worst result if over capacity
          if (resultHeap.size() > ef) {
            resultHeap.pop();
          }
        }
      }
    }

    // Drain result heap into array sorted descending by score
    const results: Array<{ id: string; score: number }> = [];
    while (resultHeap.size() > 0) {
      results.push(resultHeap.pop()!);
    }
    results.reverse(); // min-heap drains ascending, reverse for descending
    return results;
  }

  /**
   * Select the M best neighbors from candidates for a node, using the
   * simple heuristic (closest M by similarity).
   */
  private selectNeighbors(
    query: number[],
    candidates: Array<{ id: string; score: number }>,
    maxConnections: number
  ): string[] {
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, maxConnections)
      .map(c => c.id);
  }

  /**
   * Get max connections allowed at a given level.
   * Level 0 allows Mmax0 (= 2*M), higher levels allow M.
   */
  private getMaxConnections(level: number): number {
    return level === 0 ? this.Mmax0 : this.M;
  }

  /**
   * Add a vector to the HNSW index with proper graph construction.
   * O(log n) amortized via hierarchical layer structure.
   */
  add(id: string, embedding: number[]): void {
    // Handle duplicate: remove old node first
    if (this.nodes.has(id)) {
      this.remove(id);
    }

    const nodeLevel = this.randomLevel();
    const newNode: HNSWNode = {
      id,
      embedding,
      neighbors: new Map(),
    };

    // Initialize neighbor lists for each layer
    for (let l = 0; l <= nodeLevel; l++) {
      newNode.neighbors.set(l, []);
    }

    this.nodes.set(id, newNode);

    // First node: set as entry point
    if (this.entryPoint === null) {
      this.entryPoint = id;
      this.currentMaxLevel = nodeLevel;
      return;
    }

    let currentEntry = this.entryPoint;

    // Phase 1: Traverse layers above the new node's level (greedy descent)
    for (let l = this.currentMaxLevel; l > nodeLevel; l--) {
      currentEntry = this.searchLayer(embedding, currentEntry, l);
    }

    // Phase 2: For each layer from nodeLevel down to 0, find neighbors and link
    for (let l = Math.min(nodeLevel, this.currentMaxLevel); l >= 0; l--) {
      const maxConn = this.getMaxConnections(l);

      // Beam search to find efConstruction nearest neighbors at this layer
      const nearest = this.searchLayerBeam(embedding, [currentEntry], l, this.efConstruction);

      // Select M best neighbors
      const selectedIds = this.selectNeighbors(embedding, nearest, maxConn);

      // Set the new node's neighbors at this layer
      newNode.neighbors.set(l, [...selectedIds]);

      // Add bidirectional connections and prune if over capacity
      for (const neighborId of selectedIds) {
        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const neighborList = neighbor.neighbors.get(l) ?? [];
        neighborList.push(id);

        // Prune if neighbor has too many connections
        if (neighborList.length > maxConn) {
          // Keep the maxConn closest neighbors
          const scored = neighborList
            .filter(nId => this.nodes.has(nId))
            .map(nId => ({
              id: nId,
              score: cosineSimilarity(neighbor.embedding, this.nodes.get(nId)!.embedding),
            }));
          scored.sort((a, b) => b.score - a.score);
          neighbor.neighbors.set(l, scored.slice(0, maxConn).map(s => s.id));
        } else {
          neighbor.neighbors.set(l, neighborList);
        }
      }

      // Update entry for next layer down
      if (nearest.length > 0) {
        currentEntry = nearest[0].id;
      }
    }

    // Update entry point if new node's level exceeds current max
    if (nodeLevel > this.currentMaxLevel) {
      this.entryPoint = id;
      this.currentMaxLevel = nodeLevel;
    }
  }

  /**
   * Remove a node from the HNSW index and repair connections.
   * Orphaned neighbors are reconnected to the removed node's other neighbors.
   */
  remove(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // For each layer the node exists in, remove from neighbor lists and repair
    for (const [level, neighbors] of node.neighbors.entries()) {
      for (const neighborId of neighbors) {
        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const neighborList = neighbor.neighbors.get(level);
        if (!neighborList) continue;

        // Remove the deleted node from this neighbor's list
        const idx = neighborList.indexOf(id);
        if (idx !== -1) {
          neighborList.splice(idx, 1);
        }

        // Try to reconnect: for each of the deleted node's other neighbors,
        // add a connection if capacity allows and not already connected
        const maxConn = this.getMaxConnections(level);
        if (neighborList.length < maxConn) {
          for (const otherNeighborId of neighbors) {
            if (
              otherNeighborId !== neighborId &&
              otherNeighborId !== id &&
              this.nodes.has(otherNeighborId) &&
              !neighborList.includes(otherNeighborId)
            ) {
              neighborList.push(otherNeighborId);
              // Add reverse connection too
              const otherNeighbor = this.nodes.get(otherNeighborId);
              if (otherNeighbor) {
                const otherList = otherNeighbor.neighbors.get(level) ?? [];
                if (!otherList.includes(neighborId) && otherList.length < maxConn) {
                  otherList.push(neighborId);
                  otherNeighbor.neighbors.set(level, otherList);
                }
              }
              if (neighborList.length >= maxConn) break;
            }
          }
        }

        neighbor.neighbors.set(level, neighborList);
      }
    }

    // Delete the node
    this.nodes.delete(id);

    // If the entry point was removed, pick a replacement
    if (this.entryPoint === id) {
      if (this.nodes.size === 0) {
        this.entryPoint = null;
        this.currentMaxLevel = -1;
      } else {
        // Find the node with the highest level to be the new entry point
        let bestId: string | null = null;
        let bestLevel = -1;
        for (const [nodeId, n] of this.nodes.entries()) {
          let maxNodeLevel = -1;
          for (const l of n.neighbors.keys()) {
            if (l > maxNodeLevel) maxNodeLevel = l;
          }
          if (maxNodeLevel > bestLevel) {
            bestLevel = maxNodeLevel;
            bestId = nodeId;
          }
        }
        this.entryPoint = bestId;
        this.currentMaxLevel = bestLevel;
      }
    }

    return true;
  }

  /**
   * Search for k approximate nearest neighbors using HNSW traversal.
   * O(log n) via hierarchical layer descent + beam search at base layer.
   */
  search(query: number[], k: number): Array<{ id: string; score: number }> {
    if (this.nodes.size === 0 || this.entryPoint === null) {
      return [];
    }

    // Single node shortcut
    if (this.nodes.size === 1) {
      const node = this.nodes.get(this.entryPoint)!;
      return [{ id: node.id, score: cosineSimilarity(query, node.embedding) }];
    }

    let currentEntry = this.entryPoint;

    // Phase 1: Greedily traverse layers above base to find local minimum
    for (let l = this.currentMaxLevel; l > 0; l--) {
      currentEntry = this.searchLayer(query, currentEntry, l);
    }

    // Phase 2: Beam search at layer 0 with efSearch candidates
    const ef = Math.max(this.efSearch, k);
    const results = this.searchLayerBeam(query, [currentEntry], 0, ef);

    // Return top-k results sorted by descending similarity
    return results.slice(0, k);
  }

  /**
   * Get index size
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Clear the index and reset entry point
   */
  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.currentMaxLevel = -1;
  }
}

// ============================================================================
// Unified Memory Manager
// ============================================================================

/**
 * Singleton manager for TRUE unified AQE persistence.
 *
 * Single file: .agentic-qe/memory.db
 *
 * Contains ALL data:
 * - KV store (v2 compatible)
 * - Vectors (persistent, with in-memory HNSW index)
 * - Q-Values
 * - GOAP
 * - Dreams
 */
export class UnifiedMemoryManager {
  private static instance: UnifiedMemoryManager | null = null;
  private static instancePromise: Promise<UnifiedMemoryManager> | null = null;

  private db: DatabaseType | null = null;
  private readonly config: UnifiedMemoryConfig;
  private initialized = false;
  private vectorsLoaded = false;
  private initPromise: Promise<void> | null = null;
  private preparedStatements: Map<string, Statement> = new Map();
  private vectorIndex: InMemoryHNSWIndex = new InMemoryHNSWIndex();

  // CRDT store for distributed state synchronization
  private crdtStore: CRDTStore | null = null;

  private constructor(config?: Partial<UnifiedMemoryConfig>) {
    // Use resolved config with project root detection for the dbPath
    const resolvedDefaults = getResolvedDefaultConfig();
    this.config = { ...resolvedDefaults, ...config };
  }

  /**
   * Get or create the singleton instance (synchronous).
   * Thread-safe: JS is single-threaded for synchronous code.
   */
  static getInstance(config?: Partial<UnifiedMemoryConfig>): UnifiedMemoryManager {
    // Synchronous return if already created
    if (UnifiedMemoryManager.instance) {
      return UnifiedMemoryManager.instance;
    }
    // Synchronous creation - JS single-threaded execution prevents race here
    UnifiedMemoryManager.instance = new UnifiedMemoryManager(config);
    return UnifiedMemoryManager.instance;
  }

  /**
   * Get or create the singleton instance with async initialization.
   * Thread-safe: Uses Promise lock to prevent concurrent initialization races.
   */
  static async getInstanceAsync(config?: Partial<UnifiedMemoryConfig>): Promise<UnifiedMemoryManager> {
    // Fast path: already fully initialized
    if (UnifiedMemoryManager.instance?.initialized) {
      return UnifiedMemoryManager.instance;
    }

    // Use Promise lock to prevent concurrent initialization
    if (!UnifiedMemoryManager.instancePromise) {
      UnifiedMemoryManager.instancePromise = (async () => {
        const instance = UnifiedMemoryManager.getInstance(config);
        await instance.initialize();
        return instance;
      })();
    }

    return UnifiedMemoryManager.instancePromise;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (UnifiedMemoryManager.instance) {
      UnifiedMemoryManager.instance.close();
      UnifiedMemoryManager.instance = null;
    }
    UnifiedMemoryManager.instancePromise = null;
  }

  /**
   * Initialize the database, run migrations, and load vector index.
   * Thread-safe: Uses Promise lock to prevent concurrent initialization races.
   */
  async initialize(): Promise<void> {
    // Fast path: already initialized
    if (this.initialized) return;

    // Use Promise lock to prevent concurrent initialization
    if (!this.initPromise) {
      this.initPromise = this._doInitialize();
    }

    return this.initPromise;
  }

  /**
   * Internal initialization implementation
   */
  private async _doInitialize(): Promise<void> {
    // Double-check after acquiring promise lock
    if (this.initialized) return;

    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Open database
      this.db = new Database(this.config.dbPath);

      // Configure for performance
      if (this.config.walMode) {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma(`mmap_size = ${this.config.mmapSize}`);
      this.db.pragma(`cache_size = ${this.config.cacheSize}`);
      this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
      this.db.pragma('foreign_keys = ON');

      // Run migrations
      await this.runMigrations();

      // Defer vector index loading until first search (startup optimization)
      this.vectorsLoaded = false;

      this.initialized = true;
      console.log(`[UnifiedMemory] Initialized: ${this.config.dbPath}`);

      // Guard: warn if duplicate .agentic-qe/memory.db files exist in project tree
      this.warnIfDuplicateDatabases();
    } catch (error) {
      // Allow retry on failure by clearing the promise
      this.initPromise = null;
      throw new Error(
        `Failed to initialize UnifiedMemoryManager: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Warn if multiple .agentic-qe/memory.db files exist in the project tree.
   * This prevents silent data splits where different modules write to different DBs.
   */
  private warnIfDuplicateDatabases(): void {
    try {
      const projectRoot = findProjectRoot();
      const canonicalDb = path.resolve(this.config.dbPath);
      const candidates = [
        path.join(projectRoot, '.agentic-qe', 'memory.db'),
        path.join(projectRoot, 'v3', '.agentic-qe', 'memory.db'),
      ];

      const duplicates = candidates
        .map(p => path.resolve(p))
        .filter(p => p !== canonicalDb && fs.existsSync(p));

      if (duplicates.length > 0) {
        console.warn(
          `[UnifiedMemory] WARNING: Duplicate database(s) detected!\n` +
          `  Canonical: ${canonicalDb}\n` +
          `  Duplicates: ${duplicates.join(', ')}\n` +
          `  This can cause data splits. Remove duplicates or set AQE_PROJECT_ROOT.`
        );
      }
    } catch {
      // Non-critical: don't fail initialization if guard check fails
    }
  }

  /**
   * Check if a column exists in a table
   */
  private columnExists(tableName: string, columnName: string): boolean {
    if (!this.db) return false;
    try {
      const safeName = validateTableName(tableName);
      const info = this.db.prepare(`PRAGMA table_info(${safeName})`).all() as Array<{ name: string }>;
      return info.some(col => col.name === columnName);
    } catch {
      return false;
    }
  }

  /**
   * Handle v2 schema incompatibilities by dropping and recreating tables
   * that have incompatible schemas (missing columns that v3 requires)
   */
  private handleV2SchemaIncompatibilities(): void {
    if (!this.db) return;

    // Tables that may exist from v2 with incompatible schemas
    // Only list tables where v2 has DIFFERENT schema than v3
    // The 'requiredColumn' must be a column that EXISTS in v3 but NOT in v2
    const v2IncompatibleTables = [
      // GOAP tables - v2 has simpler schemas
      { table: 'goap_plans', requiredColumn: 'status' },        // v2 missing status, initial_state, goal_state
      { table: 'goap_execution_steps', requiredColumn: 'agent_id' }, // v2 missing agent_id
      { table: 'goap_actions', requiredColumn: 'agent_type' },  // v2 missing agent_type
      // Note: goap_goals and goap_plan_signatures are compatible

      // Dream/Concept tables - v2 used 'type' column, v3 uses 'concept_type' or 'edge_type'
      { table: 'concept_nodes', requiredColumn: 'concept_type' }, // v2 has 'type'
      { table: 'concept_edges', requiredColumn: 'edge_type' },    // v2 has 'type'
      { table: 'dream_insights', requiredColumn: 'cycle_id' },    // v2 missing foreign key

      // RL tables - v2 has simpler schema
      { table: 'rl_q_values', requiredColumn: 'algorithm' },      // v2 missing algorithm field
    ];

    for (const { table, requiredColumn } of v2IncompatibleTables) {
      // Check if table exists
      const tableExists = this.db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(table);

      if (tableExists && !this.columnExists(table, requiredColumn)) {
        console.log(`[UnifiedMemory] Upgrading v2 table: ${table} (missing ${requiredColumn})`);
        // Drop the old table - will be recreated with v3 schema
        this.db.exec(`DROP TABLE IF EXISTS ${validateTableName(table)}`);
      }
    }
  }

  /**
   * Run schema migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create schema version table
    this.db.exec(SCHEMA_VERSION_TABLE);

    // Handle v2 schema incompatibilities BEFORE migration
    this.handleV2SchemaIncompatibilities();

    // Get current version
    const versionRow = this.db.prepare(
      'SELECT version FROM schema_version WHERE id = 1'
    ).get() as { version: number } | undefined;

    const currentVersion = versionRow?.version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      console.log(`[UnifiedMemory] Migrating from v${currentVersion} to v${SCHEMA_VERSION}`);

      // Create all schemas using transaction
      const migrate = this.db.transaction(() => {
        // v1: KV Store (v2 compatible)
        if (currentVersion < 1) {
          this.db!.exec(KV_STORE_SCHEMA);
        }

        // v2: Vectors table
        if (currentVersion < 2) {
          this.db!.exec(VECTORS_SCHEMA);
        }

        // v3: Learning features (Q-Values, GOAP, Dreams)
        if (currentVersion < 3) {
          this.db!.exec(RL_QVALUES_SCHEMA);
          this.db!.exec(GOAP_SCHEMA);
          this.db!.exec(DREAM_SCHEMA);
        }

        // v4: QE Patterns, Embedding Cache, Plan Executions (ADR-046)
        if (currentVersion < 4) {
          this.db!.exec(QE_PATTERNS_SCHEMA);
        }

        // v5: MinCut tables (ADR-047)
        if (currentVersion < 5) {
          this.db!.exec(MINCUT_SCHEMA);
        }

        // v6: Hypergraph tables (Neural Backbone)
        if (currentVersion < 6) {
          this.db!.exec(HYPERGRAPH_SCHEMA);
        }

        // v7: SONA Patterns table (Neural Backbone)
        if (currentVersion < 7) {
          this.db!.exec(SONA_PATTERNS_SCHEMA);
        }

        // v8: Feedback loop persistence tables (ADR-023, ADR-022)
        if (currentVersion < 8) {
          this.db!.exec(FEEDBACK_SCHEMA);
        }

        // Update schema version
        this.db!.prepare(`
          INSERT OR REPLACE INTO schema_version (id, version, migrated_at)
          VALUES (1, ?, datetime('now'))
        `).run(SCHEMA_VERSION);
      });

      migrate();
      console.log(`[UnifiedMemory] Migration complete`);
    }
  }

  /**
   * Load all vectors from SQLite into HNSW index
   */
  private async loadVectorIndex(): Promise<void> {
    if (this.vectorsLoaded) return;
    if (!this.db) throw new Error('Database not initialized');

    this.vectorIndex.clear();

    const rows = this.db.prepare(
      'SELECT id, embedding, dimensions FROM vectors'
    ).all() as Array<{ id: string; embedding: Buffer; dimensions: number }>;

    for (const row of rows) {
      const embedding = this.bufferToFloatArray(row.embedding, row.dimensions);
      this.vectorIndex.add(row.id, embedding);
    }

    this.vectorsLoaded = true;
    console.log(`[UnifiedMemory] Loaded ${rows.length} vectors into HNSW index`);
  }

  // ============================================================================
  // KV Store Operations (v2 compatible)
  // ============================================================================

  /**
   * Store a key-value pair
   */
  async kvSet(key: string, value: unknown, namespace: string = 'default', ttl?: number): Promise<void> {
    this.ensureInitialized();

    const expiresAt = ttl ? Date.now() + ttl * 1000 : null;
    const serialized = JSON.stringify(value);

    this.db!.prepare(`
      INSERT OR REPLACE INTO kv_store (key, namespace, value, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(key, namespace, serialized, expiresAt);
  }

  /**
   * Get a value by key
   */
  async kvGet<T>(key: string, namespace: string = 'default'): Promise<T | undefined> {
    this.ensureInitialized();

    const row = this.db!.prepare(`
      SELECT value, expires_at FROM kv_store
      WHERE key = ? AND namespace = ?
    `).get(key, namespace) as { value: string; expires_at: number | null } | undefined;

    if (!row) return undefined;

    // Check expiration
    if (row.expires_at && Date.now() > row.expires_at) {
      this.db!.prepare('DELETE FROM kv_store WHERE key = ? AND namespace = ?').run(key, namespace);
      return undefined;
    }

    return JSON.parse(row.value) as T;
  }

  /**
   * Delete a key
   */
  async kvDelete(key: string, namespace: string = 'default'): Promise<boolean> {
    this.ensureInitialized();
    const result = this.db!.prepare(
      'DELETE FROM kv_store WHERE key = ? AND namespace = ?'
    ).run(key, namespace);
    return result.changes > 0;
  }

  /**
   * Check if key exists
   */
  async kvExists(key: string, namespace: string = 'default'): Promise<boolean> {
    this.ensureInitialized();
    const row = this.db!.prepare(`
      SELECT 1 FROM kv_store
      WHERE key = ? AND namespace = ? AND (expires_at IS NULL OR expires_at > ?)
    `).get(key, namespace, Date.now());
    return row !== undefined;
  }

  /**
   * Search keys by pattern
   */
  async kvSearch(pattern: string, namespace: string = 'default', limit: number = 100): Promise<string[]> {
    this.ensureInitialized();
    const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');

    const rows = this.db!.prepare(`
      SELECT key FROM kv_store
      WHERE namespace = ? AND key LIKE ?
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT ?
    `).all(namespace, sqlPattern, Date.now(), limit) as Array<{ key: string }>;

    return rows.map(r => r.key);
  }

  /**
   * Cleanup expired entries
   */
  async kvCleanupExpired(): Promise<number> {
    this.ensureInitialized();
    const result = this.db!.prepare(
      'DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < ?'
    ).run(Date.now());
    return result.changes;
  }

  // ============================================================================
  // Vector Operations (REAL persistence!)
  // ============================================================================

  /**
   * Store a vector embedding
   */
  async vectorStore(
    id: string,
    embedding: number[],
    namespace: string = 'default',
    metadata?: unknown
  ): Promise<void> {
    this.ensureInitialized();

    const buffer = this.floatArrayToBuffer(embedding);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    this.db!.prepare(`
      INSERT OR REPLACE INTO vectors (id, namespace, embedding, dimensions, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, namespace, buffer, embedding.length, metadataJson);

    // Update in-memory index
    this.vectorIndex.add(id, embedding);
  }

  /**
   * Get a vector by ID
   */
  async vectorGet(id: string): Promise<{ embedding: number[]; metadata?: unknown } | undefined> {
    this.ensureInitialized();

    const row = this.db!.prepare(`
      SELECT embedding, dimensions, metadata FROM vectors WHERE id = ?
    `).get(id) as { embedding: Buffer; dimensions: number; metadata: string | null } | undefined;

    if (!row) return undefined;

    return {
      embedding: this.bufferToFloatArray(row.embedding, row.dimensions),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  /**
   * Delete a vector
   */
  async vectorDelete(id: string): Promise<boolean> {
    this.ensureInitialized();

    const result = this.db!.prepare('DELETE FROM vectors WHERE id = ?').run(id);
    this.vectorIndex.remove(id);

    return result.changes > 0;
  }

  /**
   * Search for similar vectors.
   * Uses batch SQL query instead of N+1 individual queries for metadata enrichment.
   */
  async vectorSearch(
    query: number[],
    k: number = 10,
    namespace?: string
  ): Promise<Array<{ id: string; score: number; metadata?: unknown }>> {
    this.ensureInitialized();

    // Lazy-load vectors on first search (deferred from startup for fast init)
    if (!this.vectorsLoaded) {
      await this.loadVectorIndex();
    }

    // Use in-memory HNSW index for fast search
    const results = this.vectorIndex.search(query, k * 2); // Get extra for namespace filtering

    if (results.length === 0) return [];

    // Batch fetch metadata for all result IDs in a single query (fixes N+1)
    const ids = results.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db!.prepare(
      `SELECT id, namespace, metadata FROM vectors WHERE id IN (${placeholders})`
    ).all(...ids) as Array<{ id: string; namespace: string; metadata: string | null }>;

    const metadataMap = new Map(rows.map(row => [row.id, row]));

    if (namespace) {
      const filteredResults: Array<{ id: string; score: number; metadata?: unknown }> = [];

      for (const result of results) {
        const row = metadataMap.get(result.id);
        if (row && row.namespace === namespace) {
          filteredResults.push({
            id: result.id,
            score: result.score,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          });
          if (filteredResults.length >= k) break;
        }
      }

      return filteredResults;
    }

    // No namespace filter, just enrich with metadata
    return results.slice(0, k).map(result => {
      const row = metadataMap.get(result.id);
      return {
        id: result.id,
        score: result.score,
        metadata: row?.metadata ? JSON.parse(row.metadata) : undefined,
      };
    });
  }

  /**
   * Get vector count
   */
  async vectorCount(namespace?: string): Promise<number> {
    this.ensureInitialized();

    if (namespace) {
      const row = this.db!.prepare(
        'SELECT COUNT(*) as count FROM vectors WHERE namespace = ?'
      ).get(namespace) as { count: number };
      return row.count;
    }

    const row = this.db!.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    return row.count;
  }

  // ============================================================================
  // CRDT Operations (distributed state synchronization)
  // ============================================================================

  /**
   * Initialize CRDT store for distributed state synchronization.
   * Call this with a unique node ID for each agent/node in the cluster.
   *
   * @param nodeId - Unique identifier for this node (e.g., 'agent-001', 'mcp-server-1')
   */
  initializeCRDT(nodeId: string): void {
    if (this.crdtStore) {
      console.warn('[UnifiedMemory] CRDT store already initialized');
      return;
    }

    this.crdtStore = createCRDTStore({ nodeId });
    console.log(`[UnifiedMemory] CRDT store initialized for node: ${nodeId}`);
  }

  /**
   * Get the CRDT store instance.
   * Returns null if CRDT has not been initialized.
   */
  getCRDTStore(): CRDTStore | null {
    return this.crdtStore;
  }

  /**
   * Check if CRDT is initialized
   */
  isCRDTInitialized(): boolean {
    return this.crdtStore !== null;
  }

  /**
   * Set a value in both CRDT store and KV store for durability.
   * The CRDT store provides conflict-free merge semantics,
   * while the KV store provides persistence.
   *
   * @param key - Key to store
   * @param value - Value to store
   * @param namespace - Optional namespace (default: 'crdt')
   */
  async crdtSet<T>(key: string, value: T, namespace: string = 'crdt'): Promise<void> {
    this.ensureInitialized();

    // Update CRDT store (in-memory, conflict-free)
    if (this.crdtStore) {
      this.crdtStore.setRegister(key, value);
    }

    // Persist to KV store
    await this.kvSet(key, value, namespace);
  }

  /**
   * Get a value from CRDT store (or fallback to KV store)
   *
   * @param key - Key to retrieve
   * @param namespace - Optional namespace (default: 'crdt')
   */
  async crdtGet<T>(key: string, namespace: string = 'crdt'): Promise<T | undefined> {
    // Try CRDT store first (has latest merged state)
    if (this.crdtStore) {
      const register = this.crdtStore.getRegister<T>(key);
      if (register) {
        return register.get();
      }
    }

    // Fallback to KV store
    return this.kvGet<T>(key, namespace);
  }

  /**
   * Increment a distributed counter (CRDT G-Counter)
   *
   * @param key - Counter key
   * @param amount - Amount to increment (default: 1)
   */
  crdtIncrement(key: string, amount: number = 1): void {
    if (!this.crdtStore) {
      throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    }

    // Get or create counter
    let counter = this.crdtStore.getCounter(key);
    if (!counter) {
      this.crdtStore.incrementCounter(key, 0); // Initialize
      counter = this.crdtStore.getCounter(key);
    }

    // Increment
    for (let i = 0; i < amount; i++) {
      this.crdtStore.incrementCounter(key);
    }
  }

  /**
   * Get distributed counter value
   *
   * @param key - Counter key
   */
  crdtGetCounter(key: string): number {
    if (!this.crdtStore) {
      return 0;
    }

    const counter = this.crdtStore.getCounter(key);
    return counter?.get() ?? 0;
  }

  /**
   * Add item to distributed set (CRDT OR-Set)
   *
   * @param key - Set key
   * @param item - Item to add
   */
  crdtAddToSet<T>(key: string, item: T): void {
    if (!this.crdtStore) {
      throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    }

    this.crdtStore.addToSet(key, item);
  }

  /**
   * Remove item from distributed set
   *
   * @param key - Set key
   * @param item - Item to remove
   */
  crdtRemoveFromSet<T>(key: string, item: T): void {
    if (!this.crdtStore) {
      throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    }

    this.crdtStore.removeFromSet(key, item);
  }

  /**
   * Get all items from distributed set
   *
   * @param key - Set key
   */
  crdtGetSet<T>(key: string): Set<T> {
    if (!this.crdtStore) {
      return new Set();
    }

    const orSet = this.crdtStore.getSet<T>(key);
    // ORSet.values() returns T[], convert to Set<T>
    return new Set(orSet.values());
  }

  /**
   * Get the current CRDT state for replication
   */
  crdtGetState(): CRDTStoreState | null {
    if (!this.crdtStore) {
      return null;
    }

    return this.crdtStore.getState();
  }

  /**
   * Get a delta of changes since a given version
   */
  crdtGetDelta(sinceVersion?: number): CRDTStoreDelta | null {
    if (!this.crdtStore) {
      return null;
    }

    return this.crdtStore.getDelta(sinceVersion ?? 0);
  }

  /**
   * Merge remote CRDT state into local store.
   * This operation is commutative, associative, and idempotent.
   *
   * @param remoteState - State from another node
   */
  crdtMerge(remoteState: CRDTStoreState): void {
    if (!this.crdtStore) {
      throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    }

    this.crdtStore.applyState(remoteState);
  }

  /**
   * Apply a delta from another node
   *
   * @param delta - Delta changes from another node
   */
  crdtApplyDelta(delta: CRDTStoreDelta): void {
    if (!this.crdtStore) {
      throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    }

    this.crdtStore.applyDelta(delta);
  }

  /**
   * Persist current CRDT state to KV store for recovery
   */
  async crdtPersist(): Promise<void> {
    if (!this.crdtStore) {
      return;
    }

    const state = this.crdtStore.getState();
    await this.kvSet('__crdt_state__', state, 'crdt-internal');
  }

  /**
   * Restore CRDT state from KV store
   */
  async crdtRestore(): Promise<boolean> {
    if (!this.crdtStore) {
      return false;
    }

    const state = await this.kvGet<CRDTStoreState>('__crdt_state__', 'crdt-internal');
    if (state) {
      this.crdtStore.applyState(state);
      return true;
    }

    return false;
  }

  // ============================================================================
  // Raw Database Access (for advanced operations)
  // ============================================================================

  /**
   * Get the raw database connection
   */
  getDatabase(): DatabaseType {
    if (!this.db || !this.initialized) {
      throw new Error('UnifiedMemoryManager not initialized');
    }
    return this.db;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the database path
   */
  getDbPath(): string {
    return this.config.dbPath;
  }

  /**
   * Prepare and cache a statement
   */
  prepare(name: string, sql: string): Statement {
    if (!this.db) throw new Error('Database not initialized');

    let stmt = this.preparedStatements.get(name);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.preparedStatements.set(name, stmt);
    }
    return stmt;
  }

  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(fn)();
  }

  /**
   * Get database statistics
   */
  getStats(): {
    tables: { name: string; rowCount: number }[];
    fileSize: number;
    walSize: number;
    vectorIndexSize: number;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const tables = [
      'kv_store',
      'vectors',
      'rl_q_values',
      'goap_actions',
      'goap_goals',
      'goap_plans',
      'goap_execution_steps',
      'goap_plan_signatures',
      'concept_nodes',
      'concept_edges',
      'dream_cycles',
      'dream_insights',
      // v4: QE Patterns tables (ADR-046)
      'qe_patterns',
      'qe_pattern_embeddings',
      'qe_pattern_usage',
      'qe_trajectories',
      'embeddings',
      'execution_results',
      'executed_steps',
      // v5: MinCut tables (ADR-047)
      'mincut_snapshots',
      'mincut_history',
      'mincut_weak_vertices',
      'mincut_alerts',
      'mincut_healing_actions',
      'mincut_observations',
      // v6: Hypergraph tables (Neural Backbone)
      'hypergraph_nodes',
      'hypergraph_edges',
      // v7: SONA Patterns table (Neural Backbone)
      'sona_patterns',
    ];

    const tableStats = tables.map(name => {
      try {
        const row = this.db!.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as { count: number };
        return { name, rowCount: row.count };
      } catch {
        return { name, rowCount: 0 };
      }
    });

    let fileSize = 0;
    let walSize = 0;
    try {
      if (fs.existsSync(this.config.dbPath)) {
        fileSize = fs.statSync(this.config.dbPath).size;
      }
      const walPath = this.config.dbPath + '-wal';
      if (fs.existsSync(walPath)) {
        walSize = fs.statSync(walPath).size;
      }
    } catch (error) {
      // Non-critical: file stat errors during storage stats
      console.debug('[UnifiedMemory] File stat error:', error instanceof Error ? error.message : error);
    }

    return {
      tables: tableStats,
      fileSize,
      walSize,
      vectorIndexSize: this.vectorIndex.size(),
    };
  }

  /**
   * Vacuum the database
   */
  vacuum(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('VACUUM');
  }

  /**
   * Checkpoint WAL
   */
  checkpoint(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.pragma('wal_checkpoint(TRUNCATE)');
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.preparedStatements.clear();
      this.vectorIndex.clear();
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[UnifiedMemory] Database closed');
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('UnifiedMemoryManager not initialized. Call initialize() first.');
    }
  }

  private floatArrayToBuffer(arr: number[]): Buffer {
    const buffer = Buffer.alloc(arr.length * 4);
    for (let i = 0; i < arr.length; i++) {
      buffer.writeFloatLE(arr[i], i * 4);
    }
    return buffer;
  }

  private bufferToFloatArray(buffer: Buffer, dimensions: number): number[] {
    const arr: number[] = [];
    for (let i = 0; i < dimensions; i++) {
      arr.push(buffer.readFloatLE(i * 4));
    }
    return arr;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the shared unified memory manager instance
 */
export function getUnifiedMemory(config?: Partial<UnifiedMemoryConfig>): UnifiedMemoryManager {
  return UnifiedMemoryManager.getInstance(config);
}

/**
 * Initialize the shared unified memory manager
 */
export async function initializeUnifiedMemory(
  config?: Partial<UnifiedMemoryConfig>
): Promise<UnifiedMemoryManager> {
  const manager = getUnifiedMemory(config);
  await manager.initialize();
  return manager;
}

/**
 * Reset the shared unified memory manager (for testing)
 */
export function resetUnifiedMemory(): void {
  UnifiedMemoryManager.resetInstance();
}

// ============================================================================
// Process Exit Handlers - Ensure cleanup on process exit
// ============================================================================

let exitHandlersRegistered = false;

function registerExitHandlers(): void {
  if (exitHandlersRegistered) return;
  exitHandlersRegistered = true;

  const cleanup = (): void => {
    try {
      const instance = UnifiedMemoryManager['instance'];
      if (instance) {
        instance.close();
      }
    } catch (error) {
      // Non-critical: cleanup errors during shutdown
      console.debug('[UnifiedMemory] Cleanup error:', error instanceof Error ? error.message : error);
    }
  };

  process.on('beforeExit', cleanup);

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

// Register exit handlers when module is loaded
registerExitHandlers();
