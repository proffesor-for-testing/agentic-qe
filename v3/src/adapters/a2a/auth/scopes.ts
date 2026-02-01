/**
 * A2A OAuth 2.0 Scope Definitions
 *
 * Defines OAuth 2.0 scopes for the A2A protocol, including platform access,
 * agent operations, task management, and domain-specific scopes for the
 * 12 QE domains.
 *
 * @module adapters/a2a/auth/scopes
 * @see https://a2a-protocol.org/latest/specification/
 */

// ============================================================================
// Core A2A Scopes
// ============================================================================

/**
 * Core A2A protocol scopes with descriptions
 */
export const A2A_CORE_SCOPES = {
  // Platform scopes
  'platform:read': 'Read platform discovery information',
  'platform:admin': 'Administer platform settings',

  // Agent scopes
  'agent:read': 'Read agent cards and capabilities',
  'agent:extended': 'Access extended agent card information',
  'agent:register': 'Register new agents on the platform',
  'agent:manage': 'Manage agent configuration and status',

  // Task scopes
  'task:read': 'Read task status and history',
  'task:create': 'Create and send new tasks',
  'task:cancel': 'Cancel running tasks',
  'task:resubmit': 'Resubmit failed or completed tasks',

  // Message scopes
  'message:send': 'Send messages to agents',
  'message:stream': 'Access streaming message responses',

  // Notification scopes
  'notification:manage': 'Configure push notifications',
} as const;

/**
 * Type for core A2A scope names
 */
export type A2ACoreScope = keyof typeof A2A_CORE_SCOPES;

// ============================================================================
// QE Domain Scopes
// ============================================================================

/**
 * QE domain-specific scopes for the 12 bounded contexts
 */
export const A2A_DOMAIN_SCOPES = {
  // Test Generation Domain
  'qe:test-generation:read': 'Read test generation results',
  'qe:test-generation:execute': 'Execute test generation',

  // Test Execution Domain
  'qe:test-execution:read': 'Read test execution results',
  'qe:test-execution:execute': 'Execute tests',

  // Coverage Analysis Domain
  'qe:coverage-analysis:read': 'Read coverage reports',
  'qe:coverage-analysis:execute': 'Execute coverage analysis',

  // Quality Assessment Domain
  'qe:quality-assessment:read': 'Read quality assessments',
  'qe:quality-assessment:execute': 'Execute quality assessment',

  // Defect Intelligence Domain
  'qe:defect-intelligence:read': 'Read defect predictions',
  'qe:defect-intelligence:execute': 'Execute defect analysis',

  // Learning Optimization Domain
  'qe:learning-optimization:read': 'Read learning patterns',
  'qe:learning-optimization:execute': 'Execute learning operations',

  // Security Compliance Domain
  'qe:security-compliance:read': 'Read security scan results',
  'qe:security-compliance:execute': 'Execute security scans',

  // Chaos Resilience Domain
  'qe:chaos-resilience:read': 'Read chaos test results',
  'qe:chaos-resilience:execute': 'Execute chaos tests',

  // Accessibility Domain
  'qe:accessibility:read': 'Read accessibility audit results',
  'qe:accessibility:execute': 'Execute accessibility audits',

  // Performance Domain
  'qe:performance:read': 'Read performance metrics',
  'qe:performance:execute': 'Execute performance tests',

  // Contract Testing Domain
  'qe:contract-testing:read': 'Read contract validation results',
  'qe:contract-testing:execute': 'Execute contract validation',

  // Visual Testing Domain
  'qe:visual-testing:read': 'Read visual regression results',
  'qe:visual-testing:execute': 'Execute visual testing',
} as const;

/**
 * Type for QE domain scope names
 */
export type A2ADomainScope = keyof typeof A2A_DOMAIN_SCOPES;

// ============================================================================
// Combined Scopes
// ============================================================================

/**
 * All A2A scopes (core + domain)
 */
export const A2A_SCOPES = {
  ...A2A_CORE_SCOPES,
  ...A2A_DOMAIN_SCOPES,
} as const;

/**
 * Type for all A2A scope names
 */
export type A2AScope = keyof typeof A2A_SCOPES;

/**
 * Get the description for a scope
 *
 * @param scope - The scope name
 * @returns The scope description or undefined if not found
 */
export function getScopeDescription(scope: string): string | undefined {
  return A2A_SCOPES[scope as A2AScope];
}

/**
 * Check if a scope is valid
 *
 * @param scope - The scope to validate
 * @returns True if the scope is valid
 */
export function isValidScope(scope: string): scope is A2AScope {
  return scope in A2A_SCOPES;
}

// ============================================================================
// Scope Hierarchy
// ============================================================================

/**
 * Scope hierarchy definitions - broader scopes include narrower ones
 */
const SCOPE_HIERARCHY: Record<string, string[]> = {
  // Platform admin includes read
  'platform:admin': ['platform:read'],

  // Agent manage includes read and extended
  'agent:manage': ['agent:read', 'agent:extended', 'agent:register'],
  'agent:extended': ['agent:read'],

  // Task hierarchy
  'task:resubmit': ['task:read', 'task:create'],
  'task:cancel': ['task:read'],
  'task:create': ['task:read'],

  // Message hierarchy
  'message:stream': ['message:send'],

  // QE domain hierarchies - execute includes read
  'qe:test-generation:execute': ['qe:test-generation:read'],
  'qe:test-execution:execute': ['qe:test-execution:read'],
  'qe:coverage-analysis:execute': ['qe:coverage-analysis:read'],
  'qe:quality-assessment:execute': ['qe:quality-assessment:read'],
  'qe:defect-intelligence:execute': ['qe:defect-intelligence:read'],
  'qe:learning-optimization:execute': ['qe:learning-optimization:read'],
  'qe:security-compliance:execute': ['qe:security-compliance:read'],
  'qe:chaos-resilience:execute': ['qe:chaos-resilience:read'],
  'qe:accessibility:execute': ['qe:accessibility:read'],
  'qe:performance:execute': ['qe:performance:read'],
  'qe:contract-testing:execute': ['qe:contract-testing:read'],
  'qe:visual-testing:execute': ['qe:visual-testing:read'],
};

/**
 * Get all scopes implied by a given scope (including itself)
 *
 * @param scope - The scope to expand
 * @returns Array of all implied scopes
 *
 * @example
 * ```typescript
 * scopeHierarchy('agent:manage')
 * // Returns: ['agent:manage', 'agent:read', 'agent:extended', 'agent:register']
 * ```
 */
export function scopeHierarchy(scope: string): string[] {
  const result = new Set<string>([scope]);
  const hierarchy = SCOPE_HIERARCHY[scope];

  if (hierarchy) {
    for (const impliedScope of hierarchy) {
      // Recursively get implied scopes
      const nested = scopeHierarchy(impliedScope);
      for (const s of nested) {
        result.add(s);
      }
    }
  }

  return Array.from(result);
}

/**
 * Expand a list of scopes to include all implied scopes
 *
 * @param scopes - The scopes to expand
 * @returns Array of all scopes including implied ones
 */
export function expandScopes(scopes: string[]): string[] {
  const result = new Set<string>();

  for (const scope of scopes) {
    const expanded = scopeHierarchy(scope);
    for (const s of expanded) {
      result.add(s);
    }
  }

  return Array.from(result);
}

/**
 * Validate that requested scopes are covered by granted scopes
 *
 * @param requested - The scopes being requested
 * @param granted - The scopes that have been granted
 * @returns True if all requested scopes are covered by granted scopes
 *
 * @example
 * ```typescript
 * validateScopes(['agent:read'], ['agent:manage'])
 * // Returns: true (agent:manage implies agent:read)
 *
 * validateScopes(['task:cancel'], ['task:read'])
 * // Returns: false (task:read does not imply task:cancel)
 * ```
 */
export function validateScopes(requested: string[], granted: string[]): boolean {
  // Expand granted scopes to include all implied scopes
  const expandedGranted = new Set(expandScopes(granted));

  // Check that every requested scope is covered
  for (const scope of requested) {
    if (!expandedGranted.has(scope)) {
      return false;
    }
  }

  return true;
}

/**
 * Get the missing scopes from a request
 *
 * @param requested - The scopes being requested
 * @param granted - The scopes that have been granted
 * @returns Array of scopes that are requested but not granted
 */
export function getMissingScopes(requested: string[], granted: string[]): string[] {
  const expandedGranted = new Set(expandScopes(granted));
  return requested.filter((scope) => !expandedGranted.has(scope));
}

/**
 * Normalize scopes by removing duplicates and sorting
 *
 * @param scopes - The scopes to normalize
 * @returns Sorted unique array of scopes
 */
export function normalizeScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes)).sort();
}

/**
 * Parse a space-separated scope string into an array
 *
 * @param scopeString - Space-separated scopes
 * @returns Array of scope strings
 */
export function parseScopeString(scopeString: string): string[] {
  return scopeString
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0);
}

/**
 * Convert a scope array to a space-separated string
 *
 * @param scopes - Array of scopes
 * @returns Space-separated scope string
 */
export function formatScopeString(scopes: string[]): string {
  return normalizeScopes(scopes).join(' ');
}

// ============================================================================
// Scope Categories
// ============================================================================

/**
 * Get all scopes in a category
 *
 * @param prefix - The scope category prefix (e.g., 'platform', 'agent', 'qe:test-generation')
 * @returns Array of scopes in that category
 */
export function getScopesByCategory(prefix: string): string[] {
  return Object.keys(A2A_SCOPES).filter((scope) => scope.startsWith(prefix + ':'));
}

/**
 * Get all QE domain scopes
 *
 * @returns Array of all QE domain scopes
 */
export function getQEDomainScopes(): string[] {
  return Object.keys(A2A_DOMAIN_SCOPES);
}

/**
 * Get all core A2A scopes
 *
 * @returns Array of all core A2A scopes
 */
export function getCoreScopes(): string[] {
  return Object.keys(A2A_CORE_SCOPES);
}

/**
 * Default scopes for a new client (minimal access)
 */
export const DEFAULT_CLIENT_SCOPES: A2AScope[] = [
  'platform:read',
  'agent:read',
  'task:read',
  'message:send',
];

/**
 * Full access scopes (for admin clients)
 */
export const ADMIN_SCOPES: A2AScope[] = Object.keys(A2A_SCOPES) as A2AScope[];
