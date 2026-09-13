/**
 * MCP tool safety annotations and the built-in safety inventory.
 *
 * The inventory is deliberately conservative. A tool is marked read-only
 * only when its registered operation is an observation/query with no write or
 * execution path. Every other built-in receives the MCP-safe fallback: it may
 * be destructive, is not assumed idempotent, and may interact with the world.
 * These values guide clients but never replace authorization, sandbox, or
 * policy enforcement.
 */

import type { ToolAnnotations } from './types';

export type ResolvedToolAnnotations = Required<
  Pick<ToolAnnotations, 'readOnlyHint' | 'destructiveHint' | 'idempotentHint' | 'openWorldHint'>
> & Pick<ToolAnnotations, 'title'>;

export interface BuiltInToolSafetyDisposition {
  annotations: ResolvedToolAnnotations;
  reason: string;
}

export const CONSERVATIVE_TOOL_ANNOTATIONS: ResolvedToolAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
});

const HARD_CODED_TOOL_NAMES = [
  'accessibility_test', 'advisor_consult', 'agent_complete', 'agent_list',
  'agent_metrics', 'agent_spawn', 'agent_status', 'aqe_health', 'chaos_test',
  'code_index', 'contract_validate', 'coverage_analyze_sublinear',
  'cross_phase_cleanup', 'cross_phase_query', 'cross_phase_stats',
  'cross_phase_store', 'defect_predict', 'fleet_health', 'fleet_init',
  'fleet_status', 'format_signals', 'infra_healing_feed_output',
  'infra_healing_recover', 'infra_healing_status', 'memory_delete',
  'memory_query', 'memory_retrieve', 'memory_share', 'memory_store',
  'memory_usage', 'migration_check', 'migration_promote', 'migration_status',
  'model_route', 'phase_end', 'phase_start', 'pipeline_list', 'pipeline_load',
  'pipeline_run', 'pipeline_validate', 'quality_assess',
  'requirements_validate', 'routing_economics', 'routing_metrics',
  'security_scan_comprehensive', 'session_cache_stats', 'task_cancel',
  'task_list', 'task_orchestrate', 'task_status', 'task_submit',
  'team_broadcast', 'team_health', 'team_list', 'team_message', 'team_rebalance',
  'team_scale', 'test_execute_parallel', 'test_generate_enhanced',
  'validation_pipeline',
] as const;

// QE tools not duplicated by the hard-coded protocol registrations.
const BRIDGED_TOOL_NAMES = [
  'qe/analysis/token_usage', 'qe/code/c4',
  'qe/coherence/audit', 'qe/coherence/check', 'qe/coherence/collapse',
  'qe/coherence/consensus', 'qe/coverage/gaps',
  'qe/embeddings/compare', 'qe/embeddings/generate', 'qe/embeddings/search',
  'qe/embeddings/stats', 'qe/embeddings/store',
  'qe/learning/dream', 'qe/learning/optimize',
  'qe/mincut/health', 'qe/mincut/analyze', 'qe/mincut/strengthen',
  'qe/planning/goap_execute', 'qe/planning/goap_plan', 'qe/planning/goap_status',
  'qe/quality/gate', 'qe/qx/analyze', 'qe/requirements/quality-criteria',
  'qe/security/url-validate', 'qe/tests/load', 'qe/tests/schedule',
  'qe/visual/compare', 'qe/workflows/browser-load',
] as const;

/** Complete deterministic inventory of names advertised by both MCP paths. */
export const BUILT_IN_TOOL_NAMES: readonly string[] = Object.freeze(
  [...HARD_CODED_TOOL_NAMES, ...BRIDGED_TOOL_NAMES].sort()
);

function conservativeDisposition(): BuiltInToolSafetyDisposition {
  return {
    annotations: CONSERVATIVE_TOOL_ANNOTATIONS,
    reason: 'No narrow side-effect-free guarantee is recorded for this built-in; retain conservative policy defaults.',
  };
}

export const BUILT_IN_TOOL_SAFETY_INVENTORY: Readonly<Record<string, BuiltInToolSafetyDisposition>> = Object.freeze(
  Object.fromEntries(BUILT_IN_TOOL_NAMES.map((name) => [name, conservativeDisposition()]))
);

/** Resolve explicit metadata over inventory metadata over conservative defaults. */
export function resolveToolAnnotations(
  name: string,
  annotations?: ToolAnnotations
): ResolvedToolAnnotations {
  const reviewedDisposition = BUILT_IN_TOOL_SAFETY_INVENTORY[name];
  return Object.freeze({
    ...(reviewedDisposition?.annotations ?? CONSERVATIVE_TOOL_ANNOTATIONS),
    // Dynamic and plugin-supplied names cannot self-assert optimistic hints.
    // Add the name to the reviewed inventory before accepting overrides.
    ...(reviewedDisposition ? annotations : undefined),
  });
}

export function getBuiltInToolAnnotations(): Readonly<Record<string, ToolAnnotations>> {
  return Object.fromEntries(
    Object.entries(BUILT_IN_TOOL_SAFETY_INVENTORY).map(([name, disposition]) => [name, disposition.annotations])
  );
}

export function getBuiltInToolSafetyInventory(): Readonly<Record<string, BuiltInToolSafetyDisposition>> {
  return BUILT_IN_TOOL_SAFETY_INVENTORY;
}
