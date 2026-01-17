/**
 * Agent Compatibility Layer for V2-to-V3 Migration
 *
 * This module provides backward compatibility for deprecated V2 agent names,
 * mapping them to their V3 equivalents according to ADR-048.
 *
 * @module migration/agent-compat
 * @see docs/adr/adr-048-agent-naming-conventions.md
 */

/**
 * Agent mapping entry with domain information.
 */
export interface AgentMappingEntry {
  v3Name: string;
  domain: string;
  notes?: string;
}

/**
 * Complete mapping of deprecated V2 agent names to their V3 equivalents with domain info.
 *
 * This mapping ensures backward compatibility during the migration period.
 * V2 names are preserved in the migration layer and will be supported
 * until the next major version (v4.0.0).
 *
 * @see ADR-048 for the complete migration strategy
 */
export const v2AgentMappingWithDomain: Record<string, AgentMappingEntry> = {
  // Test Generation Domain
  'qe-test-generator': {
    v3Name: 'qe-test-architect',
    domain: 'test-generation',
    notes: 'Renamed to reflect strategic planning role',
  },
  'qe-test-writer': {
    v3Name: 'qe-tdd-red',
    domain: 'test-generation',
    notes: 'TDD Red phase specialist',
  },
  'qe-test-implementer': {
    v3Name: 'qe-tdd-green',
    domain: 'test-generation',
    notes: 'TDD Green phase specialist',
  },
  'qe-test-refactorer': {
    v3Name: 'qe-tdd-refactor',
    domain: 'test-generation',
    notes: 'TDD Refactor phase specialist',
  },

  // Coverage Analysis Domain
  'qe-coverage-analyzer': {
    v3Name: 'qe-coverage-specialist',
    domain: 'coverage-analysis',
    notes: 'Renamed with enhanced O(log n) analysis',
  },
  'qe-gap-detector': {
    v3Name: 'qe-coverage-specialist',
    domain: 'coverage-analysis',
    notes: 'Consolidated into coverage-specialist',
  },

  // Test Execution Domain
  'qe-parallel-executor': {
    v3Name: 'qe-test-executor',
    domain: 'test-execution',
    notes: 'Unified test execution agent',
  },

  // Quality Assessment Domain
  'qe-deployment-advisor': {
    v3Name: 'qe-quality-gate',
    domain: 'quality-assessment',
    notes: 'Consolidated into quality-gate',
  },

  // Defect Intelligence Domain
  'qe-defect-predictor': {
    v3Name: 'qe-defect-intelligence',
    domain: 'defect-intelligence',
    notes: 'Unified defect intelligence agent',
  },
  'qe-root-cause-analyzer': {
    v3Name: 'qe-defect-intelligence',
    domain: 'defect-intelligence',
    notes: 'Consolidated into defect-intelligence',
  },

  // Learning & Optimization Domain
  'qe-learning-coordinator': {
    v3Name: 'qe-learning-optimization',
    domain: 'learning-optimization',
    notes: 'Renamed with enhanced learning capabilities',
  },

  // Visual & Accessibility Domain
  'qe-visual-tester': {
    v3Name: 'qe-visual-accessibility',
    domain: 'visual-accessibility',
    notes: 'Combined visual regression and accessibility testing',
  },

  // Contract Testing Domain
  'qe-graphql-tester': {
    v3Name: 'qe-contract-validator',
    domain: 'contract-testing',
    notes: 'Unified contract validation',
  },
  'qe-api-contract-validator': {
    v3Name: 'qe-contract-testing',
    domain: 'contract-testing',
    notes: 'Renamed for broader contract testing scope',
  },
};

/**
 * Simple mapping of deprecated V2 agent names to their V3 equivalents.
 *
 * For backward compatibility with code that expects simple string mappings.
 *
 * @example
 * ```typescript
 * const v3Name = v2AgentMapping['qe-test-writer']; // 'qe-tdd-red'
 * ```
 */
export const v2AgentMapping: Record<string, string> = Object.fromEntries(
  Object.entries(v2AgentMappingWithDomain).map(([v2Name, entry]) => [v2Name, entry.v3Name])
);

/**
 * Resolves an agent name from V2 format to V3 format.
 *
 * If the provided name is a deprecated V2 agent name, returns the
 * corresponding V3 name. Otherwise, returns the original name unchanged.
 *
 * This function is case-sensitive and expects agent names in lowercase
 * with hyphens as separators (e.g., 'qe-test-writer').
 *
 * @param name - The agent name to resolve (V2 or V3 format)
 * @returns The V3 agent name
 *
 * @example
 * ```typescript
 * resolveAgentName('qe-test-writer')      // Returns: 'qe-tdd-red'
 * resolveAgentName('qe-tdd-red')          // Returns: 'qe-tdd-red' (already V3)
 * resolveAgentName('qe-custom-agent')     // Returns: 'qe-custom-agent' (no mapping)
 * ```
 */
export function resolveAgentName(name: string): string {
  return v2AgentMapping[name] ?? name;
}

/**
 * Checks if an agent name is a deprecated V2 agent.
 *
 * Returns true if the agent name exists in the V2-to-V3 mapping,
 * indicating it's a deprecated V2 name that should be migrated.
 *
 * @param name - The agent name to check
 * @returns True if the name is a deprecated V2 agent, false otherwise
 *
 * @example
 * ```typescript
 * isDeprecatedAgent('qe-test-writer')     // Returns: true
 * isDeprecatedAgent('qe-tdd-red')         // Returns: false
 * isDeprecatedAgent('qe-custom-agent')    // Returns: false
 * ```
 */
export function isDeprecatedAgent(name: string): boolean {
  return name in v2AgentMapping;
}

/**
 * Generates a deprecation warning message for a V2 agent name.
 *
 * Provides a user-friendly warning message that includes both the
 * deprecated V2 name and the recommended V3 replacement. This message
 * can be logged or displayed to users during migration.
 *
 * If the provided name is not a deprecated V2 agent, returns an empty string.
 *
 * @param v2Name - The deprecated V2 agent name
 * @returns A deprecation warning message, or empty string if not deprecated
 *
 * @example
 * ```typescript
 * getDeprecationWarning('qe-test-writer')
 * // Returns: "Agent name 'qe-test-writer' is deprecated. Please use 'qe-tdd-red' instead."
 *
 * getDeprecationWarning('qe-tdd-red')
 * // Returns: ""
 * ```
 */
export function getDeprecationWarning(v2Name: string): string {
  const v3Name = v2AgentMapping[v2Name];

  if (!v3Name) {
    return '';
  }

  return `Agent name '${v2Name}' is deprecated. Please use '${v3Name}' instead.`;
}

/**
 * List of all deprecated V2 agent names.
 *
 * Useful for validation, migration scripts, or displaying a complete
 * list of agents that need to be updated.
 *
 * @example
 * ```typescript
 * deprecatedAgents.forEach(v2Name => {
 *   console.log(getDeprecationWarning(v2Name));
 * });
 * ```
 */
export const deprecatedAgents: readonly string[] = Object.keys(v2AgentMapping);

/**
 * List of all V3 agent names (targets of the migration).
 *
 * Useful for validation to ensure agent names are recognized V3 agents.
 *
 * @example
 * ```typescript
 * const isValidV3Agent = v3Agents.includes(agentName);
 * ```
 */
export const v3Agents: readonly string[] = [
  ...new Set(Object.values(v2AgentMapping))
];

/**
 * Gets the domain for an agent name (V2 or V3).
 *
 * @param agentName - The agent name to look up
 * @returns The domain string, or null if not found
 */
export function getAgentDomain(agentName: string): string | null {
  // Check V2 mapping
  const v2Entry = v2AgentMappingWithDomain[agentName];
  if (v2Entry) {
    return v2Entry.domain;
  }

  // Check if it's a V3 name by looking in values
  for (const entry of Object.values(v2AgentMappingWithDomain)) {
    if (entry.v3Name === agentName) {
      return entry.domain;
    }
  }

  return null;
}

/**
 * Gets all mappings for a specific domain.
 *
 * @param domain - The domain to filter by
 * @returns Array of [v2Name, entry] tuples for that domain
 */
export function getMappingsByDomain(domain: string): Array<[string, AgentMappingEntry]> {
  return Object.entries(v2AgentMappingWithDomain)
    .filter(([, entry]) => entry.domain === domain);
}

/**
 * Gets all unique domains in the mapping.
 */
export function getAllDomains(): string[] {
  return [...new Set(Object.values(v2AgentMappingWithDomain).map(e => e.domain))];
}

/**
 * Gets the V2 name for a V3 agent (reverse lookup).
 *
 * @param v3Name - The V3 agent name
 * @returns Array of V2 names that map to this V3 agent (can be multiple)
 */
export function getV2Names(v3Name: string): string[] {
  return Object.entries(v2AgentMappingWithDomain)
    .filter(([, entry]) => entry.v3Name === v3Name)
    .map(([v2Name]) => v2Name);
}

/**
 * Migration report structure.
 */
export interface MigrationReport {
  needsMigration: Array<{ v2Name: string; v3Name: string; domain: string }>;
  alreadyV3: string[];
  unknown: string[];
}

/**
 * Generates a migration report for a list of used agents.
 *
 * @param usedAgents - List of agent names currently in use
 * @returns Report categorizing agents by migration status
 */
export function generateMigrationReport(usedAgents: string[]): MigrationReport {
  const needsMigration: Array<{ v2Name: string; v3Name: string; domain: string }> = [];
  const alreadyV3: string[] = [];
  const unknown: string[] = [];

  for (const agent of usedAgents) {
    const v2Entry = v2AgentMappingWithDomain[agent];
    if (v2Entry) {
      needsMigration.push({
        v2Name: agent,
        v3Name: v2Entry.v3Name,
        domain: v2Entry.domain,
      });
    } else if (v3Agents.includes(agent)) {
      alreadyV3.push(agent);
    } else {
      unknown.push(agent);
    }
  }

  return { needsMigration, alreadyV3, unknown };
}
