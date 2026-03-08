/**
 * Brain Table DDL Definitions
 *
 * Contains CREATE TABLE statements for all 25 brain-exportable tables.
 * Separated from brain-shared.ts to keep each file under 500 lines.
 *
 * Tables are listed in FK-aware import order:
 *   1. Parent tables first (qe_patterns, dream_cycles, goap_goals, etc.)
 *   2. Child tables after their parents (trajectory_steps after qe_trajectories, etc.)
 */

import Database from 'better-sqlite3';

/**
 * All DDL statements for brain-exportable tables, in FK-aware creation order.
 * Uses CREATE TABLE IF NOT EXISTS for idempotency.
 */
const BRAIN_TABLE_DDL: readonly string[] = [
  // --- Tier 0: Core tables (already existed in Phase 1) ---
  `CREATE TABLE IF NOT EXISTS qe_patterns (
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
  )`,
  `CREATE TABLE IF NOT EXISTS rl_q_values (
    id TEXT PRIMARY KEY, algorithm TEXT NOT NULL, agent_id TEXT NOT NULL,
    state_key TEXT NOT NULL, action_key TEXT NOT NULL,
    q_value REAL NOT NULL DEFAULT 0.0, visits INTEGER NOT NULL DEFAULT 0,
    last_reward REAL, domain TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(algorithm, agent_id, state_key, action_key)
  )`,
  `CREATE TABLE IF NOT EXISTS dream_cycles (
    id TEXT PRIMARY KEY, start_time TEXT NOT NULL, end_time TEXT, duration_ms INTEGER,
    concepts_processed INTEGER DEFAULT 0, associations_found INTEGER DEFAULT 0,
    insights_generated INTEGER DEFAULT 0, status TEXT DEFAULT 'running',
    error TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS dream_insights (
    id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, insight_type TEXT NOT NULL,
    source_concepts TEXT NOT NULL, description TEXT NOT NULL,
    novelty_score REAL DEFAULT 0.5, confidence_score REAL DEFAULT 0.5,
    actionable INTEGER DEFAULT 0, applied INTEGER DEFAULT 0,
    suggested_action TEXT, pattern_id TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS witness_chain (
    id INTEGER PRIMARY KEY AUTOINCREMENT, prev_hash TEXT NOT NULL,
    action_hash TEXT NOT NULL, action_type TEXT NOT NULL,
    action_data TEXT, timestamp TEXT NOT NULL, actor TEXT NOT NULL,
    hash_algo TEXT DEFAULT 'sha256', signature TEXT, signer_key_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS qe_pattern_embeddings (
    pattern_id TEXT PRIMARY KEY, embedding BLOB NOT NULL,
    dimension INTEGER NOT NULL, model TEXT DEFAULT 'all-MiniLM-L6-v2',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
  )`,

  // --- Tier 1: New tables ---
  `CREATE TABLE IF NOT EXISTS captured_experiences (
    id TEXT PRIMARY KEY, task TEXT NOT NULL, agent TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT '', success INTEGER NOT NULL DEFAULT 0,
    quality REAL NOT NULL DEFAULT 0.5, duration_ms INTEGER NOT NULL DEFAULT 0,
    model_tier INTEGER, routing_json TEXT, steps_json TEXT, result_json TEXT,
    error TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT DEFAULT 'middleware', application_count INTEGER DEFAULT 0,
    avg_token_savings REAL DEFAULT 0, embedding BLOB, embedding_dimension INTEGER,
    tags TEXT, last_applied_at TEXT, consolidated_into TEXT DEFAULT NULL,
    consolidation_count INTEGER DEFAULT 1, quality_updated_at TEXT DEFAULT NULL,
    reuse_success_count INTEGER DEFAULT 0, reuse_failure_count INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sona_patterns (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, domain TEXT NOT NULL,
    state_embedding BLOB, action_embedding BLOB,
    action_type TEXT NOT NULL, action_value TEXT,
    outcome_reward REAL NOT NULL DEFAULT 0.0, outcome_success INTEGER NOT NULL DEFAULT 0,
    outcome_quality REAL NOT NULL DEFAULT 0.0, confidence REAL DEFAULT 0.5,
    usage_count INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0, metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS qe_trajectories (
    id TEXT PRIMARY KEY, task TEXT NOT NULL, agent TEXT, domain TEXT,
    started_at TEXT DEFAULT (datetime('now')), ended_at TEXT,
    success INTEGER, steps_json TEXT, metadata_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS trajectory_steps (
    id TEXT PRIMARY KEY, trajectory_id TEXT NOT NULL, step_order INTEGER NOT NULL,
    action TEXT NOT NULL, outcome TEXT NOT NULL, quality REAL DEFAULT 0.5,
    duration_ms INTEGER DEFAULT 0, tokens_used INTEGER, result_data TEXT,
    error_message TEXT, metrics_json TEXT, context_json TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (trajectory_id) REFERENCES qe_trajectories(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS concept_nodes (
    id TEXT PRIMARY KEY, concept_type TEXT NOT NULL, content TEXT NOT NULL,
    embedding BLOB, activation_level REAL DEFAULT 0.0, last_activated TEXT,
    pattern_id TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS concept_edges (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, target TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0, edge_type TEXT NOT NULL,
    evidence INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (source) REFERENCES concept_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES concept_nodes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS goap_actions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    agent_type TEXT NOT NULL, preconditions TEXT NOT NULL, effects TEXT NOT NULL,
    cost REAL DEFAULT 1.0, estimated_duration_ms INTEGER,
    success_rate REAL DEFAULT 1.0, execution_count INTEGER DEFAULT 0,
    category TEXT NOT NULL, qe_domain TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS routing_outcomes (
    id TEXT PRIMARY KEY, task_json TEXT NOT NULL, decision_json TEXT NOT NULL,
    used_agent TEXT NOT NULL, followed_recommendation INTEGER NOT NULL,
    success INTEGER NOT NULL, quality_score REAL NOT NULL,
    duration_ms REAL NOT NULL, error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // --- Tier 2: Additional tables ---
  `CREATE TABLE IF NOT EXISTS goap_goals (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    conditions TEXT NOT NULL, priority INTEGER DEFAULT 3,
    qe_domain TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS goap_plans (
    id TEXT PRIMARY KEY, goal_id TEXT, initial_state TEXT NOT NULL,
    goal_state TEXT NOT NULL, action_sequence TEXT NOT NULL,
    total_cost REAL, estimated_duration_ms INTEGER,
    status TEXT DEFAULT 'pending', reused_from TEXT, similarity_score REAL,
    created_at TEXT DEFAULT (datetime('now')), executed_at TEXT, completed_at TEXT,
    FOREIGN KEY (goal_id) REFERENCES goap_goals(id)
  )`,
  `CREATE TABLE IF NOT EXISTS goap_plan_signatures (
    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL UNIQUE,
    goal_hash TEXT NOT NULL, state_vector TEXT NOT NULL,
    action_sequence TEXT NOT NULL, total_cost REAL NOT NULL,
    success_rate REAL DEFAULT 1.0, usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS qe_pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
    metrics_json TEXT, feedback TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS pattern_evolution_events (
    id TEXT PRIMARY KEY, pattern_id TEXT NOT NULL,
    event_type TEXT NOT NULL, details TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS pattern_relationships (
    id TEXT PRIMARY KEY, source_pattern_id TEXT NOT NULL,
    target_pattern_id TEXT NOT NULL, relationship_type TEXT NOT NULL,
    similarity_score REAL, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (source_pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS pattern_versions (
    id TEXT PRIMARY KEY, pattern_id TEXT NOT NULL,
    version INTEGER NOT NULL, embedding BLOB NOT NULL,
    embedding_dimension INTEGER NOT NULL, changes TEXT,
    quality_score REAL DEFAULT 0.5, success_rate REAL DEFAULT 0.5,
    trigger TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS vectors (
    id TEXT PRIMARY KEY, namespace TEXT NOT NULL DEFAULT 'default',
    embedding BLOB NOT NULL, dimensions INTEGER NOT NULL, metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS experience_applications (
    id TEXT PRIMARY KEY, experience_id TEXT NOT NULL,
    task TEXT NOT NULL, success INTEGER NOT NULL,
    tokens_saved INTEGER DEFAULT 0, feedback TEXT,
    applied_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (experience_id) REFERENCES captured_experiences(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS execution_results (
    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL,
    status TEXT NOT NULL, steps_completed INTEGER DEFAULT 0,
    steps_failed INTEGER DEFAULT 0, total_duration_ms INTEGER DEFAULT 0,
    final_world_state TEXT, error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS executed_steps (
    id TEXT PRIMARY KEY, execution_id TEXT NOT NULL,
    plan_id TEXT NOT NULL, action_id TEXT NOT NULL,
    step_order INTEGER NOT NULL, status TEXT NOT NULL,
    retries INTEGER DEFAULT 0, started_at TEXT NOT NULL,
    completed_at TEXT, duration_ms INTEGER, agent_id TEXT,
    agent_output TEXT, world_state_before TEXT, world_state_after TEXT,
    error_message TEXT,
    FOREIGN KEY (execution_id) REFERENCES execution_results(id)
  )`,
];

/**
 * Ensure all 25 brain-exportable tables exist in the target database.
 * Creates tables in FK-aware order so parent tables come before children.
 */
export function ensureAllBrainTables(db: Database.Database): void {
  for (const ddl of BRAIN_TABLE_DDL) {
    db.exec(ddl);
  }
}

/** List of all table names in creation/import order. */
export const ALL_BRAIN_TABLE_NAMES: readonly string[] = [
  'qe_patterns', 'rl_q_values', 'dream_cycles', 'dream_insights',
  'witness_chain', 'qe_pattern_embeddings',
  'captured_experiences', 'sona_patterns', 'qe_trajectories', 'trajectory_steps',
  'concept_nodes', 'concept_edges', 'goap_actions', 'routing_outcomes',
  'goap_goals', 'goap_plans', 'goap_plan_signatures',
  'qe_pattern_usage', 'pattern_evolution_events', 'pattern_relationships',
  'pattern_versions', 'vectors', 'experience_applications',
  'execution_results', 'executed_steps',
];
