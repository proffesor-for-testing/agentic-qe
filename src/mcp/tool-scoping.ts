/**
 * Per-Agent Tool Scoping
 *
 * Restricts MCP tool access by agent role for security isolation.
 * Each agent type has a defined set of tools it can invoke.
 */

export type AgentRole =
  | 'test-generator'
  | 'coverage-analyzer'
  | 'security-scanner'
  | 'quality-assessor'
  | 'defect-predictor'
  | 'contract-validator'
  | 'accessibility-tester'
  | 'chaos-engineer'
  | 'fleet-admin'
  | 'unrestricted';

/**
 * Tool scope definition for an agent role
 */
export interface ToolScope {
  /** Tools the agent can use (if empty/undefined, uses allowAll) */
  allowed?: string[];
  /** Tools explicitly denied (overrides allowed) */
  denied?: string[];
  /** Allow all tools (default for fleet-admin and unrestricted) */
  allowAll?: boolean;
}

/**
 * Default tool scopes per agent role
 */
const DEFAULT_SCOPES: Record<AgentRole, ToolScope> = {
  'test-generator': {
    allowed: [
      'test_generate_enhanced',
      'test_execute_parallel',
      'coverage_analyze_sublinear',
      'code_index',
      'memory_query',
      'memory_retrieve',
      'model_route',
    ],
  },
  'coverage-analyzer': {
    allowed: [
      'coverage_analyze_sublinear',
      'code_index',
      'quality_assess',
      'memory_query',
      'memory_retrieve',
    ],
  },
  'security-scanner': {
    allowed: [
      'security_scan_comprehensive',
      'code_index',
      'memory_query',
      'memory_retrieve',
    ],
  },
  'quality-assessor': {
    allowed: [
      'quality_assess',
      'coverage_analyze_sublinear',
      'defect_predict',
      'memory_query',
      'memory_retrieve',
    ],
  },
  'defect-predictor': {
    allowed: [
      'defect_predict',
      'code_index',
      'memory_query',
      'memory_retrieve',
    ],
  },
  'contract-validator': {
    allowed: [
      'contract_validate',
      'memory_query',
      'memory_retrieve',
    ],
  },
  'accessibility-tester': {
    allowed: [
      'accessibility_test',
      'memory_query',
      'memory_retrieve',
    ],
  },
  'chaos-engineer': {
    allowed: [
      'chaos_test',
      'quality_assess',
      'memory_query',
      'memory_retrieve',
    ],
  },
  'fleet-admin': {
    allowAll: true,
  },
  'unrestricted': {
    allowAll: true,
  },
};

/**
 * Check if an agent role is allowed to use a specific tool
 */
export function isToolAllowed(role: AgentRole, toolName: string): boolean {
  const scope = DEFAULT_SCOPES[role];
  if (!scope) return false;

  // Check explicit deny first
  if (scope.denied?.includes(toolName)) return false;

  // Allow-all roles
  if (scope.allowAll) return true;

  // Check allowed list
  if (scope.allowed) return scope.allowed.includes(toolName);

  return false;
}

/**
 * Get the tool scope for an agent role
 */
export function getToolScope(role: AgentRole): ToolScope {
  return DEFAULT_SCOPES[role] ?? { allowed: [] };
}

/**
 * Get all allowed tools for an agent role
 */
export function getAllowedTools(role: AgentRole): string[] | 'all' {
  const scope = DEFAULT_SCOPES[role];
  if (!scope) return [];
  if (scope.allowAll) return 'all';
  return scope.allowed ?? [];
}

/**
 * Validate a tool call against the agent's scope.
 * Returns an error message if denied, or null if allowed.
 */
export function validateToolAccess(role: AgentRole, toolName: string): string | null {
  if (isToolAllowed(role, toolName)) return null;
  return `Agent role "${role}" is not allowed to use tool "${toolName}". Allowed tools: ${JSON.stringify(getAllowedTools(role))}`;
}
