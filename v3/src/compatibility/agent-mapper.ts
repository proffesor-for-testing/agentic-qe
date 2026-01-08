/**
 * Agent Mapper - Maps V2 agent names to V3 equivalents
 */

import { AgentMapping, AgentResolution } from './types';

/**
 * Complete V2 to V3 agent mapping
 */
const AGENT_MAPPINGS: AgentMapping[] = [
  // Test Generation Domain
  {
    v2Name: 'qe-test-generator',
    v3Name: 'v3-qe-test-architect',
    domain: 'test-generation',
    deprecated: true,
    notes: 'Renamed to reflect strategic planning role',
  },
  {
    v2Name: 'qe-test-data-architect',
    v3Name: 'v3-qe-test-data-architect',
    domain: 'test-generation',
    deprecated: true,
  },

  // Test Execution Domain
  {
    v2Name: 'qe-test-executor',
    v3Name: 'v3-qe-parallel-executor',
    domain: 'test-execution',
    deprecated: true,
    notes: 'Renamed to emphasize parallel execution',
  },
  {
    v2Name: 'qe-flaky-test-hunter',
    v3Name: 'v3-qe-flaky-hunter',
    domain: 'test-execution',
    deprecated: true,
  },

  // Coverage Analysis Domain
  {
    v2Name: 'qe-coverage-analyzer',
    v3Name: 'v3-qe-coverage-specialist',
    domain: 'coverage-analysis',
    deprecated: true,
  },

  // Quality Assessment Domain
  {
    v2Name: 'qe-quality-gate',
    v3Name: 'v3-qe-quality-gate',
    domain: 'quality-assessment',
    deprecated: true,
  },
  {
    v2Name: 'qe-quality-analyzer',
    v3Name: 'v3-qe-quality-analyzer',
    domain: 'quality-assessment',
    deprecated: true,
  },
  {
    v2Name: 'qe-deployment-readiness',
    v3Name: 'v3-qe-deployment-advisor',
    domain: 'quality-assessment',
    deprecated: true,
    notes: 'Renamed to deployment-advisor',
  },
  {
    v2Name: 'qe-code-complexity',
    v3Name: 'v3-qe-code-complexity',
    domain: 'quality-assessment',
    deprecated: true,
  },

  // Defect Intelligence Domain
  {
    v2Name: 'qe-regression-risk-analyzer',
    v3Name: 'v3-qe-regression-analyzer',
    domain: 'defect-intelligence',
    deprecated: true,
  },

  // Requirements Validation Domain
  {
    v2Name: 'qe-requirements-validator',
    v3Name: 'v3-qe-requirements-validator',
    domain: 'requirements-validation',
    deprecated: true,
  },

  // Code Intelligence Domain
  {
    v2Name: 'qe-code-intelligence',
    v3Name: 'v3-qe-code-intelligence',
    domain: 'code-intelligence',
    deprecated: true,
  },

  // Security Compliance Domain
  {
    v2Name: 'qe-security-scanner',
    v3Name: 'v3-qe-security-scanner',
    domain: 'security-compliance',
    deprecated: true,
  },

  // Contract Testing Domain
  {
    v2Name: 'qe-api-contract-validator',
    v3Name: 'v3-qe-contract-validator',
    domain: 'contract-testing',
    deprecated: true,
  },

  // Visual Accessibility Domain
  {
    v2Name: 'qe-visual-tester',
    v3Name: 'v3-qe-visual-tester',
    domain: 'visual-accessibility',
    deprecated: true,
  },
  {
    v2Name: 'qe-a11y-ally',
    v3Name: 'v3-qe-a11y-specialist',
    domain: 'visual-accessibility',
    deprecated: true,
    notes: 'Renamed from ally to specialist',
  },

  // Chaos Resilience Domain
  {
    v2Name: 'qe-chaos-engineer',
    v3Name: 'v3-qe-chaos-engineer',
    domain: 'chaos-resilience',
    deprecated: true,
  },
  {
    v2Name: 'qe-performance-tester',
    v3Name: 'v3-qe-performance-profiler',
    domain: 'chaos-resilience',
    deprecated: true,
    notes: 'Renamed to performance-profiler',
  },

  // Learning Optimization Domain
  {
    v2Name: 'qe-production-intelligence',
    v3Name: 'v3-qe-production-intel',
    domain: 'learning-optimization',
    deprecated: true,
  },

  // Cross-Domain
  {
    v2Name: 'qx-partner',
    v3Name: 'v3-qe-qx-partner',
    domain: 'cross-domain',
    deprecated: true,
  },
  {
    v2Name: 'qe-fleet-commander',
    v3Name: 'v3-qe-fleet-commander',
    domain: 'cross-domain',
    deprecated: true,
  },
];

/**
 * Agent Mapper class for V2 to V3 agent name resolution
 */
export class AgentMapper {
  private mappings: Map<string, AgentMapping>;
  private v3ToV2: Map<string, string>;

  constructor() {
    this.mappings = new Map();
    this.v3ToV2 = new Map();

    for (const mapping of AGENT_MAPPINGS) {
      this.mappings.set(mapping.v2Name.toLowerCase(), mapping);
      this.v3ToV2.set(mapping.v3Name.toLowerCase(), mapping.v2Name);
    }
  }

  /**
   * Resolve an agent name (v2 or v3) to v3 format
   */
  resolve(agentName: string): AgentResolution {
    const normalized = agentName.toLowerCase().trim();

    // Already v3 format
    if (normalized.startsWith('v3-qe-')) {
      return {
        resolved: true,
        v3Agent: agentName,
        wasV2: false,
        domain: this.getDomainForV3Agent(normalized),
      };
    }

    // Try to map from v2
    const mapping = this.mappings.get(normalized);
    if (mapping) {
      return {
        resolved: true,
        v3Agent: mapping.v3Name,
        wasV2: true,
        domain: mapping.domain,
        deprecationWarning: `Agent "${agentName}" is deprecated. Use "${mapping.v3Name}" instead.`,
      };
    }

    // Unknown agent
    return {
      resolved: false,
      v3Agent: null,
      wasV2: false,
      domain: null,
    };
  }

  /**
   * Get the v2 name for a v3 agent (for documentation/migration)
   */
  getV2Name(v3Agent: string): string | null {
    return this.v3ToV2.get(v3Agent.toLowerCase()) || null;
  }

  /**
   * Check if an agent name is a v2 format
   */
  isV2Agent(agentName: string): boolean {
    const normalized = agentName.toLowerCase().trim();
    return (
      !normalized.startsWith('v3-') && this.mappings.has(normalized)
    );
  }

  /**
   * Get all agent mappings
   */
  getAllMappings(): AgentMapping[] {
    return AGENT_MAPPINGS;
  }

  /**
   * Get mappings by domain
   */
  getMappingsByDomain(domain: string): AgentMapping[] {
    return AGENT_MAPPINGS.filter((m) => m.domain === domain);
  }

  /**
   * Get domain for a v3 agent
   */
  private getDomainForV3Agent(v3Agent: string): string | null {
    const mapping = AGENT_MAPPINGS.find(
      (m) => m.v3Name.toLowerCase() === v3Agent.toLowerCase()
    );
    return mapping?.domain || null;
  }

  /**
   * Generate migration report
   */
  generateMigrationReport(usedAgents: string[]): {
    needsMigration: string[];
    alreadyV3: string[];
    unknown: string[];
  } {
    const needsMigration: string[] = [];
    const alreadyV3: string[] = [];
    const unknown: string[] = [];

    for (const agent of usedAgents) {
      const resolution = this.resolve(agent);
      if (resolution.resolved) {
        if (resolution.wasV2) {
          needsMigration.push(`${agent} → ${resolution.v3Agent}`);
        } else {
          alreadyV3.push(agent);
        }
      } else {
        unknown.push(agent);
      }
    }

    return { needsMigration, alreadyV3, unknown };
  }
}
