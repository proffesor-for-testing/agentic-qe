/**
 * SQL Schema Definitions for Unified Memory
 *
 * Contains all table schemas used by UnifiedMemoryManager.
 * Extracted from unified-memory.ts for maintainability.
 */

import { HYPERGRAPH_SCHEMA } from '../migrations/20260120_add_hypergraph_tables.js';

// Re-export for convenience
export { HYPERGRAPH_SCHEMA };

// ============================================================================
// Schema Version for Migrations
// ============================================================================

export const SCHEMA_VERSION = 8; // v8: adds feedback loop persistence tables (ADR-023, ADR-022)

export const SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    migrated_at TEXT DEFAULT (datetime('now'))
  );
`;

// ============================================================================
// Schema Definitions
// ============================================================================

export const KV_STORE_SCHEMA = `
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

export const VECTORS_SCHEMA = `
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

export const RL_QVALUES_SCHEMA = `
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

export const GOAP_SCHEMA = `
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
  CREATE INDEX IF NOT EXISTS idx_goap_sig_goal ON goap_plan_signatures(goal_hash);
`;

export const DREAM_SCHEMA = `
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

export const QE_PATTERNS_SCHEMA = `
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

  -- Pattern usage history (no FK -- used as analytics log by hooks with synthetic IDs)
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

export const MINCUT_SCHEMA = `
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

export const SONA_PATTERNS_SCHEMA = `
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

export const WITNESS_CHAIN_SCHEMA = `
  -- Witness Chain (ADR-070: Cryptographic audit trail for QE decisions)
  CREATE TABLE IF NOT EXISTS witness_chain (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prev_hash TEXT NOT NULL,
    action_hash TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_data TEXT,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_witness_action_type ON witness_chain(action_type);
  CREATE INDEX IF NOT EXISTS idx_witness_timestamp ON witness_chain(timestamp);
`;

export const FEEDBACK_SCHEMA = `
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
// Stats Table List (used by getStats)
// ============================================================================

export const STATS_TABLES = [
  'kv_store',
  'vectors',
  'rl_q_values',
  'goap_actions',
  'goap_goals',
  'goap_plans',
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
  // v9: Witness Chain (ADR-070)
  'witness_chain',
];
