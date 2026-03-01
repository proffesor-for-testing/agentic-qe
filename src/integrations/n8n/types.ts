/**
 * N8n Platform Integration Types
 *
 * Types for the v3 n8n platform adapter that bridges v2 n8n agents
 * with v3 DDD domains.
 */

import type { QEDomain } from '../../learning/qe-patterns.js';

// ============================================================================
// V2 Compatibility Types (defined locally to avoid rootDir issues)
// These mirror the v2 types but are self-contained in v3
// ============================================================================

/**
 * N8n API configuration
 */
export interface N8nAPIConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
}

/**
 * N8n workflow structure
 */
export interface N8nWorkflow {
  id?: string;
  name?: string;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings?: {
    errorWorkflow?: string;
    [key: string]: unknown;
  };
  active?: boolean;
  tags?: string[];
}

/**
 * N8n node structure
 */
export interface N8nNode {
  type: string;
  name: string;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

/**
 * N8n execution result
 */
export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: Date;
  stoppedAt?: Date;
  data?: unknown;
  status?: 'success' | 'error' | 'running';
}

/**
 * Validation result from any validator
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  warnings?: string[];
}

/**
 * Security finding from audit
 */
export interface SecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  location?: string;
}

/**
 * Security audit result
 */
export interface SecurityAuditResult {
  passed: boolean;
  score: number;
  findings: SecurityFinding[];
  timestamp: Date;
}

// ============================================================================
// V3 Integration Types
// ============================================================================

/**
 * N8n agent type names (19 agents across 5 phases)
 */
export type N8nAgentType =
  // Phase 1: Core
  | 'workflow-executor'
  | 'node-validator'
  | 'trigger-test'
  | 'expression-validator'
  | 'integration-test'
  | 'security-auditor'
  // Phase 2: Advanced Testing
  | 'unit-tester'
  | 'performance-tester'
  | 'ci-orchestrator'
  // Phase 3: Quality Assurance
  | 'version-comparator'
  | 'bdd-scenario-tester'
  | 'monitoring-validator'
  // Phase 4: Enterprise
  | 'compliance-validator'
  | 'chaos-tester'
  // Phase 5: Data & Reliability
  | 'contract-tester'
  | 'replayability-tester'
  | 'failure-mode-tester'
  | 'idempotency-tester'
  | 'secrets-hygiene-auditor';

/**
 * Mapping from n8n agent type to v3 domains
 */
export interface N8nToDomainMapping {
  agentType: N8nAgentType;
  primaryDomain: QEDomain;
  secondaryDomains?: QEDomain[];
  capabilities: string[];
  description: string;
}

/**
 * Result of mapping an n8n workflow to v3 domain context
 */
export interface WorkflowDomainContext {
  workflowId: string;
  workflowName: string;
  relevantDomains: QEDomain[];
  suggestedAgents: N8nAgentType[];
  complexity: 'simple' | 'medium' | 'complex';
  analysisHints: {
    hasSecurityConcerns: boolean;
    hasPerformanceConcerns: boolean;
    hasComplianceRequirements: boolean;
    hasChaosTestingPotential: boolean;
    hasContractTestingNeeds: boolean;
  };
}

/**
 * Configuration for the n8n platform adapter
 */
export interface N8nAdapterConfig {
  /** Whether v2 n8n agents are available */
  v2AgentsAvailable: boolean;
  /** Path to v2 agents (for dynamic loading) */
  v2AgentsPath?: string;
  /** Default n8n API configuration */
  defaultApiConfig?: {
    baseUrl?: string;
    apiKey?: string;
    timeout?: number;
  };
  /** Enable domain routing */
  enableDomainRouting: boolean;
  /** Cache workflow analysis results */
  enableCaching: boolean;
  /** Cache TTL in milliseconds */
  cacheTTLMs: number;
}

/**
 * Result of routing an n8n task to v3 domains
 */
export interface N8nRoutingResult {
  /** The n8n agent type requested */
  requestedAgent: N8nAgentType;
  /** Primary v3 domain to handle the task */
  primaryDomain: QEDomain;
  /** Additional domains that may be involved */
  supportingDomains: QEDomain[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Routing explanation */
  explanation: string;
  /** Whether v2 agent fallback is recommended */
  useV2Fallback: boolean;
}

/**
 * N8n workflow analysis request
 */
export interface WorkflowAnalysisRequest {
  workflowId: string;
  workflow?: unknown; // N8nWorkflow when available
  analysisTypes: Array<
    | 'security'
    | 'performance'
    | 'compliance'
    | 'contracts'
    | 'triggers'
    | 'expressions'
    | 'chaos'
  >;
  options?: {
    depth?: 'shallow' | 'standard' | 'deep';
    includeRecommendations?: boolean;
    checkCompliance?: string[]; // GDPR, HIPAA, etc.
  };
}

/**
 * N8n workflow analysis result
 */
export interface WorkflowAnalysisResult {
  workflowId: string;
  analysisTimestamp: Date;
  domainContext: WorkflowDomainContext;
  analysisResults: {
    security?: unknown; // SecurityAuditResult
    performance?: unknown; // PerformanceTestResult
    compliance?: unknown; // ComplianceResult
    // ... other results
  };
  recommendations: string[];
  overallRiskScore: number;
}

/**
 * Platform configuration for init system
 */
export interface N8nPlatformConfig {
  enabled: boolean;
  installAgents: boolean;
  installSkills: boolean;
  installTypeScriptAgents: boolean;
  n8nApiConfig?: {
    baseUrl?: string;
    apiKey?: string;
  };
}

/**
 * Init result for n8n platform
 */
export interface N8nInitResult {
  success: boolean;
  agentsInstalled: number;
  skillsInstalled: number;
  configGenerated: boolean;
  errors?: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * All n8n agent types
 */
export const ALL_N8N_AGENT_TYPES: N8nAgentType[] = [
  // Phase 1: Core
  'workflow-executor',
  'node-validator',
  'trigger-test',
  'expression-validator',
  'integration-test',
  'security-auditor',
  // Phase 2: Advanced Testing
  'unit-tester',
  'performance-tester',
  'ci-orchestrator',
  // Phase 3: Quality Assurance
  'version-comparator',
  'bdd-scenario-tester',
  'monitoring-validator',
  // Phase 4: Enterprise
  'compliance-validator',
  'chaos-tester',
  // Phase 5: Data & Reliability
  'contract-tester',
  'replayability-tester',
  'failure-mode-tester',
  'idempotency-tester',
  'secrets-hygiene-auditor',
];

/**
 * N8n agent categories
 */
export const N8N_AGENT_CATEGORIES = {
  core: [
    'workflow-executor',
    'node-validator',
    'trigger-test',
    'expression-validator',
    'integration-test',
    'security-auditor',
  ],
  advanced: ['unit-tester', 'performance-tester', 'ci-orchestrator'],
  quality: ['version-comparator', 'bdd-scenario-tester', 'monitoring-validator'],
  enterprise: ['compliance-validator', 'chaos-tester'],
  reliability: [
    'contract-tester',
    'replayability-tester',
    'failure-mode-tester',
    'idempotency-tester',
    'secrets-hygiene-auditor',
  ],
} as const;
