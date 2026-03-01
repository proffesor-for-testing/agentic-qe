/**
 * N8n Workflow Mapper
 *
 * Maps n8n workflow concepts and agent types to v3 DDD domains.
 * This enables existing v3 domain agents to understand and process
 * n8n workflow testing tasks.
 */

import type { QEDomain } from '../../learning/qe-patterns.js';
import type {
  N8nAgentType,
  N8nToDomainMapping,
  WorkflowDomainContext,
} from './types.js';

// ============================================================================
// Domain Mapping Table
// ============================================================================

/**
 * Maps each n8n agent type to its corresponding v3 domain(s)
 * Primary domain is the main handler; secondary domains provide supporting capabilities
 */
export const N8N_TO_V3_DOMAIN_MAP: Record<N8nAgentType, N8nToDomainMapping> = {
  // Security & Compliance
  'security-auditor': {
    agentType: 'security-auditor',
    primaryDomain: 'security-compliance',
    capabilities: ['sast', 'vulnerability-scanning', 'owasp-compliance'],
    description: 'Security vulnerability scanning and OWASP compliance checking',
  },
  'secrets-hygiene-auditor': {
    agentType: 'secrets-hygiene-auditor',
    primaryDomain: 'security-compliance',
    secondaryDomains: ['code-intelligence'],
    capabilities: ['secret-detection', 'credential-scoping', 'log-leakage'],
    description: 'Credential scoping, log leakage detection, and secrets hygiene',
  },
  'compliance-validator': {
    agentType: 'compliance-validator',
    primaryDomain: 'security-compliance',
    capabilities: ['gdpr', 'hipaa', 'soc2', 'pci-dss', 'regulatory-compliance'],
    description: 'Regulatory compliance validation (GDPR, HIPAA, SOC2, PCI-DSS)',
  },

  // Testing & Execution
  'workflow-executor': {
    agentType: 'workflow-executor',
    primaryDomain: 'test-execution',
    capabilities: ['workflow-execution', 'test-data-injection', 'output-validation'],
    description: 'Execute and validate n8n workflows with test data',
  },
  'trigger-test': {
    agentType: 'trigger-test',
    primaryDomain: 'test-execution',
    capabilities: ['webhook-testing', 'schedule-validation', 'event-triggers'],
    description: 'Test workflow triggers (webhooks, schedules, events)',
  },
  'performance-tester': {
    agentType: 'performance-tester',
    primaryDomain: 'test-execution',
    capabilities: ['load-testing', 'stress-testing', 'bottleneck-detection'],
    description: 'Performance benchmarking, load testing, bottleneck identification',
  },
  'unit-tester': {
    agentType: 'unit-tester',
    primaryDomain: 'test-generation',
    capabilities: ['unit-test', 'mock-generation', 'edge-case-coverage'],
    description: 'Node-level unit testing with mock data generation',
  },
  'replayability-tester': {
    agentType: 'replayability-tester',
    primaryDomain: 'test-execution',
    capabilities: ['determinism-testing', 'fixture-recording', 'replay-validation'],
    description: 'Determinism testing, fixture recording, and replay validation',
  },
  'idempotency-tester': {
    agentType: 'idempotency-tester',
    primaryDomain: 'test-execution',
    secondaryDomains: ['chaos-resilience'],
    capabilities: ['concurrency-safety', 'duplicate-handling', 'race-detection'],
    description: 'Concurrency safety, duplicate handling, race condition detection',
  },

  // Resilience
  'chaos-tester': {
    agentType: 'chaos-tester',
    primaryDomain: 'chaos-resilience',
    capabilities: ['fault-injection', 'resilience-testing', 'recovery-validation'],
    description: 'Chaos engineering with fault injection and resilience testing',
  },
  'failure-mode-tester': {
    agentType: 'failure-mode-tester',
    primaryDomain: 'chaos-resilience',
    capabilities: ['retry-analysis', 'error-branch-coverage', 'resilience-testing'],
    description: 'Retry configuration analysis, error handling validation',
  },
  'monitoring-validator': {
    agentType: 'monitoring-validator',
    primaryDomain: 'chaos-resilience',
    capabilities: ['observability', 'sla-compliance', 'alerting-validation'],
    description: 'Monitoring configuration and SLA compliance validation',
  },

  // Contracts & Integration
  'contract-tester': {
    agentType: 'contract-tester',
    primaryDomain: 'contract-testing',
    capabilities: ['schema-validation', 'boundary-testing', 'drift-detection'],
    description: 'Data-shape/schema validation at node boundaries',
  },
  'integration-test': {
    agentType: 'integration-test',
    primaryDomain: 'contract-testing',
    capabilities: ['api-testing', 'connectivity', 'authentication-validation'],
    description: 'Test external service integrations and API contracts',
  },

  // Analysis & Validation
  'expression-validator': {
    agentType: 'expression-validator',
    primaryDomain: 'code-intelligence',
    capabilities: ['expression-parsing', 'semantic-analysis', 'code-validation'],
    description: 'Validate n8n expressions and code nodes',
  },
  'node-validator': {
    agentType: 'node-validator',
    primaryDomain: 'code-intelligence',
    capabilities: ['config-validation', 'connection-analysis', 'credential-check'],
    description: 'Validate node configurations and connections',
  },
  'bdd-scenario-tester': {
    agentType: 'bdd-scenario-tester',
    primaryDomain: 'requirements-validation',
    capabilities: ['gherkin', 'bdd', 'business-requirement-validation'],
    description: 'BDD/Gherkin scenario testing for business requirements',
  },
  'ci-orchestrator': {
    agentType: 'ci-orchestrator',
    primaryDomain: 'quality-assessment',
    capabilities: ['ci-cd', 'quality-gates', 'deployment-decisions'],
    description: 'CI/CD pipeline orchestration with quality gates',
  },
  'version-comparator': {
    agentType: 'version-comparator',
    primaryDomain: 'defect-intelligence',
    capabilities: ['breaking-change-detection', 'migration-validation', 'diff-analysis'],
    description: 'Version comparison and breaking change detection',
  },
};

// ============================================================================
// Reverse Mapping (Domain -> Agents)
// ============================================================================

/**
 * Get all n8n agents that map to a specific v3 domain
 */
export function getAgentsForDomain(domain: QEDomain): N8nAgentType[] {
  const agents: N8nAgentType[] = [];

  for (const [agentType, mapping] of Object.entries(N8N_TO_V3_DOMAIN_MAP)) {
    if (
      mapping.primaryDomain === domain ||
      mapping.secondaryDomains?.includes(domain)
    ) {
      agents.push(agentType as N8nAgentType);
    }
  }

  return agents;
}

/**
 * Get the primary domain for an n8n agent type
 */
export function getPrimaryDomain(agentType: N8nAgentType): QEDomain {
  return N8N_TO_V3_DOMAIN_MAP[agentType].primaryDomain;
}

/**
 * Get all domains (primary + secondary) for an n8n agent type
 */
export function getAllDomains(agentType: N8nAgentType): QEDomain[] {
  const mapping = N8N_TO_V3_DOMAIN_MAP[agentType];
  return [mapping.primaryDomain, ...(mapping.secondaryDomains || [])];
}

// ============================================================================
// Workflow Analysis
// ============================================================================

/**
 * Analyze a workflow structure to determine relevant domains
 */
export function analyzeWorkflowForDomains(
  workflow: {
    nodes: Array<{ type: string; name: string; credentials?: unknown }>;
    connections: unknown;
    settings?: { errorWorkflow?: string };
  }
): WorkflowDomainContext {
  const relevantDomains = new Set<QEDomain>();
  const suggestedAgents = new Set<N8nAgentType>();
  const analysisHints = {
    hasSecurityConcerns: false,
    hasPerformanceConcerns: false,
    hasComplianceRequirements: false,
    hasChaosTestingPotential: false,
    hasContractTestingNeeds: false,
  };

  // Analyze nodes
  for (const node of workflow.nodes) {
    const nodeType = node.type.toLowerCase();

    // Security concerns
    if (
      nodeType.includes('http') ||
      nodeType.includes('webhook') ||
      nodeType.includes('api') ||
      node.credentials
    ) {
      analysisHints.hasSecurityConcerns = true;
      relevantDomains.add('security-compliance');
      suggestedAgents.add('security-auditor');
    }

    // Contract testing needs (external integrations)
    if (
      nodeType.includes('http') ||
      nodeType.includes('api') ||
      nodeType.includes('database') ||
      nodeType.includes('sql')
    ) {
      analysisHints.hasContractTestingNeeds = true;
      relevantDomains.add('contract-testing');
      suggestedAgents.add('contract-tester');
      suggestedAgents.add('integration-test');
    }

    // Performance concerns (complex processing)
    if (
      nodeType.includes('function') ||
      nodeType.includes('code') ||
      nodeType.includes('loop') ||
      nodeType.includes('batch')
    ) {
      analysisHints.hasPerformanceConcerns = true;
      relevantDomains.add('test-execution');
      suggestedAgents.add('performance-tester');
    }

    // Compliance concerns (data handling)
    if (
      nodeType.includes('customer') ||
      nodeType.includes('user') ||
      nodeType.includes('email') ||
      nodeType.includes('database')
    ) {
      analysisHints.hasComplianceRequirements = true;
      relevantDomains.add('security-compliance');
      suggestedAgents.add('compliance-validator');
    }

    // Expression validation
    if (nodeType.includes('function') || nodeType.includes('code')) {
      relevantDomains.add('code-intelligence');
      suggestedAgents.add('expression-validator');
    }
  }

  // Error workflow = chaos testing potential
  if (workflow.settings?.errorWorkflow) {
    analysisHints.hasChaosTestingPotential = true;
    relevantDomains.add('chaos-resilience');
    suggestedAgents.add('chaos-tester');
    suggestedAgents.add('failure-mode-tester');
  }

  // Always suggest basic testing
  relevantDomains.add('test-execution');
  suggestedAgents.add('workflow-executor');
  suggestedAgents.add('node-validator');

  // Determine complexity
  const nodeCount = workflow.nodes.length;
  let complexity: 'simple' | 'medium' | 'complex' = 'simple';
  if (nodeCount > 10 || relevantDomains.size > 3) {
    complexity = 'complex';
  } else if (nodeCount > 5 || relevantDomains.size > 2) {
    complexity = 'medium';
  }

  return {
    workflowId: '',
    workflowName: '',
    relevantDomains: Array.from(relevantDomains),
    suggestedAgents: Array.from(suggestedAgents),
    complexity,
    analysisHints,
  };
}

// ============================================================================
// Capability Matching
// ============================================================================

/**
 * Find n8n agents that have specific capabilities
 */
export function findAgentsByCapability(capability: string): N8nAgentType[] {
  const agents: N8nAgentType[] = [];

  for (const [agentType, mapping] of Object.entries(N8N_TO_V3_DOMAIN_MAP)) {
    if (
      mapping.capabilities.some((cap) =>
        cap.toLowerCase().includes(capability.toLowerCase())
      )
    ) {
      agents.push(agentType as N8nAgentType);
    }
  }

  return agents;
}

/**
 * Get all capabilities for an agent type
 * Returns empty array for unknown types
 */
export function getAgentCapabilities(agentType: N8nAgentType): string[] {
  const mapping = N8N_TO_V3_DOMAIN_MAP[agentType];
  return mapping?.capabilities || [];
}

/**
 * Get agent description
 */
export function getAgentDescription(agentType: N8nAgentType): string {
  return N8N_TO_V3_DOMAIN_MAP[agentType].description;
}
