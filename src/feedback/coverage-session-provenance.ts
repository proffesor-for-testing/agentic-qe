/**
 * Agentic QE v3 - Provenance of coverage_sessions rows (#1014)
 *
 * Up to 3.15.5 the MCP handler factory (agent `qe-coverage-analysis`) wrote a
 * coverage_sessions row for EVERY coverage_analyze_sublinear call: a static
 * estimate's figure, or 0.0 for an UNMEASURED target. Those rows have no
 * provenance and never expire. Rows written from now on carry
 * `context_json.measured = true`.
 *
 * Readers ignore legacy rows of that agent instead of deleting them (no data
 * is destroyed; the coverage-learner's own retention ages them out). Rows of
 * other writers (e.g. the post-command hook, which records a real istanbul
 * coverage-summary.json) are unaffected.
 */

/** The agent id of the MCP handler factory's coverage sessions. */
export const MCP_COVERAGE_AGENT_ID = 'qe-coverage-analysis';

/**
 * SQL predicate (no parameters) selecting coverage_sessions rows that are
 * evidence. `CASE` keeps `json_extract` from running on malformed JSON.
 */
export const MEASURED_COVERAGE_SESSION_SQL =
  `(agent_id != '${MCP_COVERAGE_AGENT_ID}' OR ` +
  `(CASE WHEN json_valid(context_json) THEN json_extract(context_json, '$.measured') END) = 1)`;

/** JS form of {@link MEASURED_COVERAGE_SESSION_SQL} for rows already loaded. */
export function isMeasuredCoverageSession(row: { agent_id?: string; agentId?: string; context?: unknown; context_json?: string | null }): boolean {
  const agent = row.agent_id ?? row.agentId;
  if (agent !== MCP_COVERAGE_AGENT_ID) return true;
  let context: unknown = row.context;
  if (context === undefined && typeof row.context_json === 'string') {
    try { context = JSON.parse(row.context_json); } catch { return false; }
  }
  return !!context && typeof context === 'object' && (context as Record<string, unknown>).measured === true;
}
