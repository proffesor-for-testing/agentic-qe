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
  'goap_goals', 'goap_actions', 'goap_plans', 'goap_execution_steps', 'goap_plan_signatures',
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
  'sona_patterns',
  // Sync tables
  'patterns',
  // Hypergraph tables
  'hypergraph_vertices', 'hypergraph_hyperedges', 'hypergraph_edge_vertices',
  'hypergraph_vertex_properties', 'hypergraph_edge_properties',
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
