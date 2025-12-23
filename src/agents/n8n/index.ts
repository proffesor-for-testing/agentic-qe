/**
 * N8n Testing Agents - Index
 *
 * Exports all n8n testing agent implementations
 *
 * Phase 1: Core Testing Agents
 * - WorkflowExecutor: Execute and validate workflows
 * - NodeValidator: Validate node configurations
 * - TriggerTest: Test workflow triggers
 * - ExpressionValidator: Validate expressions and code
 * - IntegrationTest: Test external integrations
 * - SecurityAuditor: Security vulnerability scanning
 *
 * Phase 2: Advanced Testing Agents
 * - UnitTester: Node-level unit testing
 * - PerformanceTester: Performance benchmarking
 * - CIOrchestrator: CI/CD pipeline orchestration
 *
 * Phase 3: Quality Assurance Agents
 * - VersionComparator: Version comparison and migration
 * - BDDScenarioTester: BDD/Gherkin scenario testing
 * - MonitoringValidator: Monitoring and observability validation
 *
 * Phase 4: Enterprise Agents
 * - ComplianceValidator: Regulatory compliance (GDPR, HIPAA, etc.)
 * - ChaosTester: Chaos engineering and resilience testing
 *
 * Phase 5: Data & Reliability Agents
 * - ContractTester: Data-shape/schema validation at node boundaries
 * - ReplayabilityTester: Determinism and replay testing
 * - FailureModeTester: Retry/error handling and resilience testing
 * - IdempotencyTester: Concurrency and duplicate handling testing
 * - SecretsHygieneAuditor: Credential scoping and log leakage detection
 */

// Types
export * from './types';

// API Client
export { N8nAPIClient, N8nAPIError } from './N8nAPIClient';

// Base Agent
export { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';

// Phase 1: Core Agents
export {
  N8nWorkflowExecutorAgent,
  WorkflowExecutionResult,
  ExecutionTask,
} from './N8nWorkflowExecutorAgent';

export {
  N8nNodeValidatorAgent,
  NodeValidationResult,
  NodeValidationTask,
} from './N8nNodeValidatorAgent';

export {
  N8nTriggerTestAgent,
  TriggerTestTask,
} from './N8nTriggerTestAgent';

export {
  N8nExpressionValidatorAgent,
  ExpressionValidationTask,
} from './N8nExpressionValidatorAgent';

export {
  N8nIntegrationTestAgent,
  IntegrationTestTask,
} from './N8nIntegrationTestAgent';

export {
  N8nSecurityAuditorAgent,
  SecurityAuditTask,
} from './N8nSecurityAuditorAgent';

// Phase 2: Advanced Testing Agents
export {
  N8nUnitTesterAgent,
  UnitTestTask,
  NodeUnitTestResult,
} from './N8nUnitTesterAgent';

export {
  N8nPerformanceTesterAgent,
  PerformanceTestTask,
  PerformanceTestResult,
} from './N8nPerformanceTesterAgent';

export {
  N8nCIOrchestratorAgent,
  CITestTask,
  CITestResult,
} from './N8nCIOrchestratorAgent';

// Phase 3: Quality Assurance Agents
export {
  N8nVersionComparatorAgent,
  VersionCompareTask,
  VersionCompareResult,
} from './N8nVersionComparatorAgent';

export {
  N8nBDDScenarioTesterAgent,
  BDDTestTask,
  BDDTestResult,
  GherkinScenario,
} from './N8nBDDScenarioTesterAgent';

export {
  N8nMonitoringValidatorAgent,
  MonitoringValidationTask,
  MonitoringValidationResult,
} from './N8nMonitoringValidatorAgent';

// Phase 4: Enterprise Agents
export {
  N8nComplianceValidatorAgent,
  ComplianceValidationTask,
  ComplianceValidationResult,
  ComplianceFramework,
} from './N8nComplianceValidatorAgent';

export {
  N8nChaosTesterAgent,
  ChaosTestTask,
  ChaosTestResult,
  ChaosExperiment,
} from './N8nChaosTesterAgent';

// Phase 5: Data & Reliability Agents
export {
  N8nContractTesterAgent,
  ContractTestTask,
  ContractTestResult,
  JsonSchema,
  SchemaViolation,
  BoundaryTestResult,
} from './N8nContractTesterAgent';

export {
  N8nReplayabilityTesterAgent,
  ReplayabilityTestTask,
  ReplayabilityTestResult,
  ExecutionFixture,
  NodeSnapshot,
  SnapshotComparison,
} from './N8nReplayabilityTesterAgent';

export {
  N8nFailureModeTesterAgent,
  FailureModeTestTask,
  FailureModeTestResult,
  RetryAnalysis,
  ErrorBranchAnalysis,
  ContinueOnFailAnalysis,
} from './N8nFailureModeTesterAgent';

export {
  N8nIdempotencyTesterAgent,
  IdempotencyTestTask,
  IdempotencyTestResult,
  DedupKeyAnalysis,
  ConcurrencyRiskAnalysis,
  ParallelExecutionAnalysis,
  WebhookDuplicateAnalysis,
} from './N8nIdempotencyTesterAgent';

export {
  N8nSecretsHygieneAuditorAgent,
  SecretsHygieneAuditTask,
  SecretsHygieneAuditResult,
  CredentialScopeAnalysis,
  MaskedFieldAnalysis,
  LogLeakageAnalysis,
  EnvironmentAnalysis,
  HardcodedSecretFinding,
} from './N8nSecretsHygieneAuditorAgent';

// Persistence & Reporting
export {
  N8nAuditPersistence,
  AuditRecord,
  AuditSummary,
  ReportOptions,
  TrendData,
  PersistenceConfig,
  getDefaultPersistence,
  setDefaultPersistence,
} from './N8nAuditPersistence';

// Factory function imports
import { EventEmitter } from 'events';
import { MemoryStore } from '../../types';
import { N8nAPIConfig } from './types';
import { N8nWorkflowExecutorAgent } from './N8nWorkflowExecutorAgent';
import { N8nNodeValidatorAgent } from './N8nNodeValidatorAgent';
import { N8nTriggerTestAgent } from './N8nTriggerTestAgent';
import { N8nExpressionValidatorAgent } from './N8nExpressionValidatorAgent';
import { N8nIntegrationTestAgent } from './N8nIntegrationTestAgent';
import { N8nSecurityAuditorAgent } from './N8nSecurityAuditorAgent';
import { N8nUnitTesterAgent } from './N8nUnitTesterAgent';
import { N8nPerformanceTesterAgent } from './N8nPerformanceTesterAgent';
import { N8nCIOrchestratorAgent } from './N8nCIOrchestratorAgent';
import { N8nVersionComparatorAgent } from './N8nVersionComparatorAgent';
import { N8nBDDScenarioTesterAgent } from './N8nBDDScenarioTesterAgent';
import { N8nMonitoringValidatorAgent } from './N8nMonitoringValidatorAgent';
import { N8nComplianceValidatorAgent } from './N8nComplianceValidatorAgent';
import { N8nChaosTesterAgent } from './N8nChaosTesterAgent';
import { N8nContractTesterAgent } from './N8nContractTesterAgent';
import { N8nReplayabilityTesterAgent } from './N8nReplayabilityTesterAgent';
import { N8nFailureModeTesterAgent } from './N8nFailureModeTesterAgent';
import { N8nIdempotencyTesterAgent } from './N8nIdempotencyTesterAgent';
import { N8nSecretsHygieneAuditorAgent } from './N8nSecretsHygieneAuditorAgent';

/**
 * All available n8n agent types
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

export interface CreateN8nAgentOptions {
  n8nConfig: N8nAPIConfig;
  memoryStore: MemoryStore;
  eventBus: EventEmitter;
  context?: {
    projectId?: string;
    environment?: string;
  };
}

/**
 * Factory function to create n8n testing agents
 */
export function createN8nAgent(
  type: N8nAgentType,
  options: CreateN8nAgentOptions
) {
  const baseConfig: any = {
    type: `n8n-${type}`,
    n8nConfig: options.n8nConfig,
    memoryStore: options.memoryStore,
    eventBus: options.eventBus,
    context: {
      id: `n8n-${type}-${Date.now()}`,
      type: `n8n-${type}`,
      status: 'idle',
      projectId: options.context?.projectId || 'default',
      environment: options.context?.environment || 'test',
      metadata: {},
    },
    capabilities: [],
  };

  switch (type) {
    // Phase 1: Core Agents
    case 'workflow-executor':
      return new N8nWorkflowExecutorAgent(baseConfig);
    case 'node-validator':
      return new N8nNodeValidatorAgent(baseConfig);
    case 'trigger-test':
      return new N8nTriggerTestAgent(baseConfig);
    case 'expression-validator':
      return new N8nExpressionValidatorAgent(baseConfig);
    case 'integration-test':
      return new N8nIntegrationTestAgent(baseConfig);
    case 'security-auditor':
      return new N8nSecurityAuditorAgent(baseConfig);

    // Phase 2: Advanced Testing Agents
    case 'unit-tester':
      return new N8nUnitTesterAgent(baseConfig);
    case 'performance-tester':
      return new N8nPerformanceTesterAgent(baseConfig);
    case 'ci-orchestrator':
      return new N8nCIOrchestratorAgent(baseConfig);

    // Phase 3: Quality Assurance Agents
    case 'version-comparator':
      return new N8nVersionComparatorAgent(baseConfig);
    case 'bdd-scenario-tester':
      return new N8nBDDScenarioTesterAgent(baseConfig);
    case 'monitoring-validator':
      return new N8nMonitoringValidatorAgent(baseConfig);

    // Phase 4: Enterprise Agents
    case 'compliance-validator':
      return new N8nComplianceValidatorAgent(baseConfig);
    case 'chaos-tester':
      return new N8nChaosTesterAgent(baseConfig);

    // Phase 5: Data & Reliability Agents
    case 'contract-tester':
      return new N8nContractTesterAgent(baseConfig);
    case 'replayability-tester':
      return new N8nReplayabilityTesterAgent(baseConfig);
    case 'failure-mode-tester':
      return new N8nFailureModeTesterAgent(baseConfig);
    case 'idempotency-tester':
      return new N8nIdempotencyTesterAgent(baseConfig);
    case 'secrets-hygiene-auditor':
      return new N8nSecretsHygieneAuditorAgent(baseConfig);

    default:
      throw new Error(`Unknown n8n agent type: ${type}`);
  }
}

/**
 * Get all available n8n agent types
 */
export function getAvailableN8nAgentTypes(): N8nAgentType[] {
  return [
    // Phase 1
    'workflow-executor',
    'node-validator',
    'trigger-test',
    'expression-validator',
    'integration-test',
    'security-auditor',
    // Phase 2
    'unit-tester',
    'performance-tester',
    'ci-orchestrator',
    // Phase 3
    'version-comparator',
    'bdd-scenario-tester',
    'monitoring-validator',
    // Phase 4
    'compliance-validator',
    'chaos-tester',
    // Phase 5
    'contract-tester',
    'replayability-tester',
    'failure-mode-tester',
    'idempotency-tester',
    'secrets-hygiene-auditor',
  ];
}

/**
 * Agent type descriptions
 */
export const N8N_AGENT_DESCRIPTIONS: Record<N8nAgentType, string> = {
  // Phase 1: Core
  'workflow-executor': 'Execute and validate n8n workflows with test data injection and output assertions',
  'node-validator': 'Validate node configurations, connections, and credential references',
  'trigger-test': 'Test workflow triggers including webhooks, schedules, and event-driven activation',
  'expression-validator': 'Validate n8n expressions, data transformations, and code nodes',
  'integration-test': 'Test external service integrations with connectivity and authentication validation',
  'security-auditor': 'Security vulnerability scanning including secrets, injection risks, and OWASP compliance',

  // Phase 2: Advanced Testing
  'unit-tester': 'Node-level unit testing with mock data generation and edge case coverage',
  'performance-tester': 'Performance benchmarking, load testing, and bottleneck identification',
  'ci-orchestrator': 'CI/CD pipeline orchestration with quality gates and environment promotion',

  // Phase 3: Quality Assurance
  'version-comparator': 'Version comparison, breaking change detection, and migration path validation',
  'bdd-scenario-tester': 'BDD/Gherkin scenario testing for business requirement validation',
  'monitoring-validator': 'Monitoring configuration validation and SLA compliance checking',

  // Phase 4: Enterprise
  'compliance-validator': 'Regulatory compliance validation (GDPR, HIPAA, SOC2, PCI-DSS)',
  'chaos-tester': 'Chaos engineering with fault injection and resilience testing',

  // Phase 5: Data & Reliability
  'contract-tester': 'Data-shape/schema validation at node boundaries with drift detection',
  'replayability-tester': 'Determinism testing, fixture recording, and replay validation',
  'failure-mode-tester': 'Retry configuration analysis, error branch coverage, and resilience testing',
  'idempotency-tester': 'Concurrency safety, duplicate handling, and race condition detection',
  'secrets-hygiene-auditor': 'Credential scoping, log leakage detection, and environment validation',
};

/**
 * Agent type categories for organization
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
  advanced: [
    'unit-tester',
    'performance-tester',
    'ci-orchestrator',
  ],
  quality: [
    'version-comparator',
    'bdd-scenario-tester',
    'monitoring-validator',
  ],
  enterprise: [
    'compliance-validator',
    'chaos-tester',
  ],
  reliability: [
    'contract-tester',
    'replayability-tester',
    'failure-mode-tester',
    'idempotency-tester',
    'secrets-hygiene-auditor',
  ],
} as const;

/**
 * Get agents by category
 */
export function getAgentsByCategory(category: keyof typeof N8N_AGENT_CATEGORIES): N8nAgentType[] {
  return [...N8N_AGENT_CATEGORIES[category]] as N8nAgentType[];
}
