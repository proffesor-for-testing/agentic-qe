/**
 * SQL Safety Utilities
 *
 * Defense-in-depth table name validation for SQLite operations.
 * SQLite doesn't support parameterized identifiers (table names),
 * so we validate against an allowlist before interpolation.
 */

/**
 * Allowlist of valid table names used across the codebase.
 * Any table name interpolated into SQL must be validated against this set.
 */
export const ALLOWED_TABLE_NAMES = new Set([
  // Core kernel tables
  'schema_version', 'kv_store', 'vectors', 'rl_q_values',
  // GOAP tables
  'goap_goals', 'goap_actions', 'goap_plans', 'goap_plan_signatures',
  // Concept/dream tables
  'concept_nodes', 'concept_edges', 'dream_cycles', 'dream_insights',
  // QE pattern tables
  'qe_patterns', 'qe_pattern_embeddings', 'qe_pattern_usage', 'qe_trajectories',
  // Execution tables
  'embeddings', 'execution_results', 'executed_steps',
  // MinCut tables
  'mincut_snapshots', 'mincut_history', 'mincut_weak_vertices',
  'mincut_alerts', 'mincut_healing_actions', 'mincut_observations',
  // SONA tables
  'sona_patterns', 'sona_fisher_matrices',
  // Feedback loop tables
  'test_outcomes', 'routing_outcomes', 'coverage_sessions',
  // Sync tables
  'patterns',
  // Hypergraph tables (actual table names from migration 20260120)
  'hypergraph_nodes', 'hypergraph_edges',
  // Legacy allowlist aliases (hypergraph-schema.ts compat)
  'hypergraph_vertices', 'hypergraph_hyperedges', 'hypergraph_edge_vertices',
  'hypergraph_vertex_properties', 'hypergraph_edge_properties',
  // Learning experience tables
  'captured_experiences', 'experience_applications',
  // Audit trail
  'witness_chain', 'witness_chain_receipts', 'witness_chain_archive',
  // Trajectory tables
  'trajectories', 'trajectory_steps',
  // Pattern evolution tables
  'pattern_evolution_events', 'pattern_relationships', 'pattern_versions',
  // Learning/metrics tables
  'learning_daily_snapshots', 'metrics_outcomes',
  'experience_consolidation_log', 'qe_pattern_reuse',
  // Co-execution tables
  'qe_agent_co_execution',
]);

/**
 * Validate a table name against the allowlist before interpolating into SQL.
 * Throws if the name is not in the allowlist, preventing SQL injection.
 */
export function validateTableName(tableName: string): string {
  if (!ALLOWED_TABLE_NAMES.has(tableName)) {
    throw new Error(`Invalid table name: "${tableName}" is not in the allowlist`);
  }
  return tableName;
}

/**
 * Valid PostgreSQL identifier pattern: starts with a lowercase letter or underscore,
 * followed by up to 62 lowercase alphanumeric characters or underscores.
 */
const IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Validate a PostgreSQL identifier (table or column name) against a strict regex.
 * Prevents SQL injection via dynamically interpolated identifiers (CWE-89).
 *
 * Supports schema-qualified names like "aqe.qe_patterns" by validating each
 * dot-separated part independently.
 *
 * @param name - The identifier to validate
 * @returns The validated identifier string if valid
 * @throws {Error} If the identifier contains invalid characters or format
 */
export function validateIdentifier(name: string): string {
  // Handle schema-qualified names (e.g., "aqe.qe_patterns")
  const parts = name.split('.');
  if (parts.length > 2) {
    throw new Error(
      `Invalid SQL identifier: "${name}" has too many parts (max: schema.table)`
    );
  }
  for (const part of parts) {
    if (!IDENTIFIER_REGEX.test(part)) {
      throw new Error(
        `Invalid SQL identifier: "${name}" — part "${part}" does not match pattern ${IDENTIFIER_REGEX}`
      );
    }
  }
  return name;
}
