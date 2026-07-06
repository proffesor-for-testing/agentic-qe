/**
 * QE Action Library for GOAP Planning
 *
 * This module provides 30+ QE-specific GOAP actions for the A* planner.
 * Actions are organized by category and linked to QE domains.
 *
 * Categories:
 * - coverage: Coverage measurement and improvement
 * - test: Test execution and maintenance
 * - security: Security scanning and remediation
 * - performance: Performance testing and optimization
 * - analysis: Code quality and complexity analysis
 * - fleet: Agent fleet management
 * - quality: Quality gates and reporting
 *
 * @module planning/actions/qe-action-library
 * @version 3.0.0
 */

import type { GOAPAction, StateConditions } from '../types.js';
import type { QEDomain } from '../../learning/qe-patterns.js';

// ============================================================================
// Action Template Type (without id and executionCount - added at runtime)
// ============================================================================

export type QEActionTemplate = Omit<GOAPAction, 'id' | 'executionCount'>;

// ============================================================================
// COVERAGE ACTIONS (6 actions)
// ============================================================================

const coverageActions: QEActionTemplate[] = [
  {
    name: 'measure-coverage',
    description: 'Run coverage analysis on the codebase to determine current coverage metrics',
    agentType: 'qe-coverage-specialist',
    preconditions: { 'coverage.measured': false },
    effects: { 'coverage.measured': true },
    cost: 2.0,
    estimatedDurationMs: 30000,
    successRate: 0.95,
    category: 'coverage',
    qeDomain: 'coverage-analysis',
    // A14: coordinator.ts:525 analyze() — real, but expects pre-collected
    // coverageData a GOAP plan step doesn't carry; will error on missing
    // required params rather than being given a fabricated value.
    method: 'analyze',
    params: {},
    implemented: true,
  },
  {
    name: 'analyze-coverage-gaps',
    description: 'Identify uncovered code paths and prioritize them by risk and complexity',
    agentType: 'qe-gap-detector',
    preconditions: { 'coverage.measured': true },
    effects: { 'coverage.gapsIdentified': true },
    cost: 1.5,
    estimatedDurationMs: 15000,
    successRate: 0.9,
    category: 'coverage',
    qeDomain: 'coverage-analysis',
    method: 'detectGaps', // coordinator.ts:555
    params: {},
    implemented: true,
  },
  {
    name: 'generate-coverage-tests',
    description: 'Generate tests targeting identified coverage gaps using AI-powered analysis',
    agentType: 'qe-test-generator',
    preconditions: { 'coverage.gapsIdentified': true },
    effects: { 'coverage.line': { delta: 10 } }, // +10% coverage improvement
    cost: 4.0,
    estimatedDurationMs: 60000,
    successRate: 0.8,
    category: 'coverage',
    qeDomain: 'test-generation',
    method: 'generateTests', // coordinator.ts:458
    params: {},
    implemented: true,
  },
  {
    name: 'run-mutation-testing',
    description: 'Run mutation testing to validate test effectiveness and find weak spots',
    agentType: 'qe-mutation-tester',
    preconditions: { 'coverage.line': { min: 60 } },
    effects: { 'quality.mutationScore': { set: true } },
    cost: 5.0,
    estimatedDurationMs: 120000,
    successRate: 0.85,
    category: 'coverage',
    qeDomain: 'coverage-analysis',
    // A14: no mutation-testing capability exists anywhere in src/domains —
    // do not fake it. GOAPExecutor must report this as not implemented.
    implemented: false,
  },
  {
    name: 'prioritize-uncovered-paths',
    description: 'Use sublinear O(log n) analysis to identify highest-risk uncovered paths',
    agentType: 'qe-coverage-specialist',
    preconditions: { 'coverage.gapsIdentified': true },
    effects: { 'coverage.riskPrioritized': true },
    cost: 1.0,
    estimatedDurationMs: 10000,
    successRate: 0.92,
    category: 'coverage',
    qeDomain: 'coverage-analysis',
    method: 'calculateRisk', // coordinator.ts:607
    params: {},
    implemented: true,
  },
  {
    name: 'generate-branch-tests',
    description: 'Generate tests specifically targeting branch coverage improvements',
    agentType: 'qe-test-generator',
    preconditions: {
      'coverage.measured': true,
      'coverage.branch': { max: 70 },
    },
    effects: { 'coverage.branch': { delta: 8 } },
    cost: 3.5,
    estimatedDurationMs: 45000,
    successRate: 0.78,
    category: 'coverage',
    qeDomain: 'test-generation',
    method: 'generateTests', // coordinator.ts:458 — no branch-target param; same caveat as generate-coverage-tests
    params: {},
    implemented: true,
  },
];

// ============================================================================
// TEST ACTIONS (7 actions)
// ============================================================================

const testActions: QEActionTemplate[] = [
  {
    name: 'run-unit-tests',
    description: 'Execute unit test suite with parallel execution',
    agentType: 'qe-test-executor',
    preconditions: {},
    effects: { 'quality.unitTestsRun': true },
    cost: 1.0,
    estimatedDurationMs: 20000,
    successRate: 0.95,
    category: 'test',
    qeDomain: 'test-execution',
    method: 'runTests', // plugin.ts:51
    params: {},
    implemented: true,
  },
  {
    name: 'run-integration-tests',
    description: 'Execute integration test suite with real database connections',
    agentType: 'qe-test-executor',
    preconditions: { 'quality.unitTestsRun': true },
    effects: { 'quality.integrationTestsRun': true },
    cost: 2.5,
    estimatedDurationMs: 45000,
    successRate: 0.85,
    category: 'test',
    qeDomain: 'test-execution',
    method: 'execute', // plugin.ts:52 — framework/env selection is caller's job
    params: {},
    implemented: true,
  },
  {
    name: 'run-e2e-tests',
    description: 'Execute end-to-end tests using Playwright or Cypress',
    agentType: 'qe-e2e-tester',
    preconditions: { 'quality.integrationTestsRun': true },
    effects: { 'quality.e2eTestsRun': true },
    cost: 4.0,
    estimatedDurationMs: 90000,
    successRate: 0.8,
    category: 'test',
    qeDomain: 'test-execution',
    method: 'executeE2ETestSuite', // plugin.ts:57
    params: {},
    implemented: true,
  },
  {
    name: 'fix-failing-tests',
    description: 'Analyze and fix failing tests based on error messages and stack traces',
    agentType: 'qe-tdd-specialist',
    preconditions: { 'quality.testsPassing': { max: 90 } },
    effects: { 'quality.testsPassing': { delta: 10 } },
    cost: 3.0,
    estimatedDurationMs: 30000,
    successRate: 0.75,
    category: 'test',
    qeDomain: 'test-generation',
    // A14: test-generation only generates; there's no "repair a failing
    // test" capability anywhere in src/domains.
    implemented: false,
  },
  {
    name: 'fix-flaky-tests',
    description: 'Identify and stabilize flaky tests by analyzing timing and async issues',
    agentType: 'qe-flaky-hunter',
    preconditions: { 'quality.flakyTests': { min: 1 } },
    effects: { 'quality.flakyTests': { delta: -3 } },
    cost: 4.0,
    estimatedDurationMs: 45000,
    successRate: 0.7,
    category: 'test',
    qeDomain: 'test-execution',
    // A14: detectFlaky() only detects, doesn't stabilize — name/effects
    // ("fix"/-3 flaky count) overstate what this binding actually does;
    // still real, non-fabricated detection work, so kept implemented.
    method: 'detectFlaky', // plugin.ts:54
    params: {},
    implemented: true,
  },
  {
    name: 'generate-property-tests',
    description: 'Generate property-based tests using fast-check or similar library',
    agentType: 'qe-test-generator',
    preconditions: { 'quality.unitTestsRun': true },
    effects: { 'quality.propertyTestsGenerated': true },
    cost: 3.5,
    estimatedDurationMs: 40000,
    successRate: 0.82,
    category: 'test',
    qeDomain: 'test-generation',
    method: 'generatePropertyTests', // coordinator.ts:759
    params: {},
    implemented: true,
  },
  {
    name: 'run-contract-tests',
    description: 'Execute consumer-driven contract tests using Pact or similar',
    agentType: 'qe-contract-tester',
    preconditions: { 'context.hasApiContracts': true },
    effects: { 'quality.contractTestsRun': true },
    cost: 2.0,
    estimatedDurationMs: 25000,
    successRate: 0.88,
    category: 'test',
    qeDomain: 'contract-testing',
    method: 'verifyAllConsumers', // plugin.ts:163
    params: {},
    implemented: true,
  },
];

// ============================================================================
// SECURITY ACTIONS (5 actions)
// ============================================================================

const securityActions: QEActionTemplate[] = [
  {
    name: 'security-scan',
    description: 'Run comprehensive security scan using SAST and dependency analysis',
    agentType: 'qe-security-scanner',
    preconditions: {},
    effects: { 'quality.securityScanned': true },
    cost: 2.0,
    estimatedDurationMs: 30000,
    successRate: 0.95,
    category: 'security',
    qeDomain: 'security-compliance',
    method: 'runSecurityAudit', // plugin.ts:142
    params: {},
    implemented: true,
  },
  {
    name: 'fix-vulnerabilities',
    description: 'Remediate identified security vulnerabilities and update dependencies',
    agentType: 'qe-security-auditor',
    preconditions: {
      'quality.securityScanned': true,
      'quality.vulnerabilities': { min: 1 },
    },
    effects: {
      'quality.vulnerabilities': { delta: -5 },
      'quality.securityScore': { delta: 10 },
    },
    cost: 5.0,
    estimatedDurationMs: 60000,
    successRate: 0.7,
    category: 'security',
    qeDomain: 'security-compliance',
    // A14: only triageVulnerabilities() (identification) exists — no
    // remediation/dependency-update capability anywhere in src/domains.
    implemented: false,
  },
  {
    name: 'owasp-audit',
    description: 'Perform OWASP Top 10 security audit on the application',
    agentType: 'qe-security-auditor',
    preconditions: { 'quality.securityScanned': true },
    effects: { 'quality.owaspCompliant': true },
    cost: 3.0,
    estimatedDurationMs: 45000,
    successRate: 0.85,
    category: 'security',
    qeDomain: 'security-compliance',
    method: 'runComplianceCheck', // plugin.ts:147
    params: { standard: 'owasp' },
    implemented: true,
  },
  {
    name: 'scan-secrets',
    description: 'Scan codebase for hardcoded secrets and credentials',
    agentType: 'qe-security-scanner',
    preconditions: {},
    effects: { 'quality.secretsScanned': true },
    cost: 1.0,
    estimatedDurationMs: 15000,
    successRate: 0.98,
    category: 'security',
    qeDomain: 'security-compliance',
    // A14: no dedicated secrets-scan method — includeSecrets is a flag on
    // runSecurityAudit (plugin.ts:179), not a standalone capability.
    method: 'runSecurityAudit',
    params: { includeSecrets: true },
    implemented: true,
  },
  {
    name: 'run-dast',
    description: 'Run dynamic application security testing against running application',
    agentType: 'qe-security-auditor',
    preconditions: { 'context.environment': 'staging' },
    effects: { 'quality.dastCompleted': true },
    cost: 4.5,
    estimatedDurationMs: 120000,
    successRate: 0.8,
    category: 'security',
    qeDomain: 'security-compliance',
    method: 'runDASTScan', // plugin.ts:145
    params: {},
    implemented: true,
  },
];

// ============================================================================
// PERFORMANCE ACTIONS (5 actions)
// ============================================================================

const performanceActions: QEActionTemplate[] = [
  {
    name: 'run-benchmarks',
    description: 'Execute performance benchmarks to establish baseline metrics',
    agentType: 'qe-performance-tester',
    preconditions: {},
    effects: { 'quality.benchmarked': true },
    cost: 2.0,
    estimatedDurationMs: 45000,
    successRate: 0.9,
    category: 'performance',
    qeDomain: 'chaos-resilience',
    // A14: no baseline-benchmark concept exists — load testing is
    // semantically different (see load-test below), not a substitute.
    implemented: false,
  },
  {
    name: 'load-test',
    description: 'Run load testing with simulated concurrent traffic',
    agentType: 'qe-load-tester',
    preconditions: { 'context.environment': 'staging' },
    effects: { 'quality.loadTested': true },
    cost: 3.5,
    estimatedDurationMs: 120000,
    successRate: 0.85,
    category: 'performance',
    qeDomain: 'chaos-resilience',
    method: 'runLoadTestSuite', // plugin.ts:168
    params: {},
    implemented: true,
  },
  {
    name: 'stress-test',
    description: 'Run stress testing to find breaking points and system limits',
    agentType: 'qe-chaos-engineer',
    preconditions: {
      'context.environment': 'staging',
      'quality.loadTested': true,
    },
    effects: { 'quality.stressTested': true },
    cost: 4.0,
    estimatedDurationMs: 90000,
    successRate: 0.8,
    category: 'performance',
    qeDomain: 'chaos-resilience',
    // A14: real chaos-resilience test path (plugin.ts runTest), typed as
    // 'stress' — createTest() is a separate prep step this binding doesn't
    // perform, so this may error without a pre-created test id.
    method: 'runTest',
    params: { type: 'stress' },
    implemented: true,
  },
  {
    name: 'profile-memory',
    description: 'Profile memory usage and identify memory leaks',
    agentType: 'qe-performance-tester',
    preconditions: { 'quality.benchmarked': true },
    effects: { 'quality.memoryProfiled': true },
    cost: 2.5,
    estimatedDurationMs: 60000,
    successRate: 0.88,
    category: 'performance',
    qeDomain: 'chaos-resilience',
    // A14: no memory-profiling capability exists anywhere in src/domains.
    implemented: false,
  },
  {
    name: 'optimize-slow-tests',
    description: 'Identify and optimize slow-running tests to improve CI/CD speed',
    agentType: 'qe-performance-tester',
    preconditions: { 'quality.unitTestsRun': true },
    effects: { 'quality.testsOptimized': true },
    cost: 2.0,
    estimatedDurationMs: 30000,
    successRate: 0.82,
    category: 'performance',
    qeDomain: 'test-execution',
    // A14: getStats() reports timing only — no "optimize" action exists.
    implemented: false,
  },
];

// ============================================================================
// ANALYSIS ACTIONS (5 actions)
// ============================================================================

const analysisActions: QEActionTemplate[] = [
  {
    name: 'analyze-complexity',
    description: 'Measure cyclomatic and cognitive complexity of codebase',
    agentType: 'code-analyzer',
    preconditions: {},
    effects: { 'quality.complexityAnalyzed': true },
    cost: 1.0,
    estimatedDurationMs: 15000,
    successRate: 0.95,
    category: 'analysis',
    // A14: fixed domain-assignment bug — analyzeComplexity() actually lives
    // on quality-assessment (plugin.ts:393), not code-intelligence, which
    // has no complexity/smell/technical-debt methods at all.
    qeDomain: 'quality-assessment',
    method: 'analyzeComplexity',
    params: {},
    implemented: true,
  },
  {
    name: 'detect-code-smells',
    description: 'Identify code smells and anti-patterns using static analysis',
    agentType: 'code-analyzer',
    preconditions: {},
    effects: { 'quality.smellsDetected': true },
    cost: 1.5,
    estimatedDurationMs: 20000,
    successRate: 0.9,
    category: 'analysis',
    qeDomain: 'code-intelligence',
    // A14: no code-smell/anti-pattern detector exists anywhere in src/domains.
    implemented: false,
  },
  {
    name: 'analyze-dependencies',
    description: 'Analyze dependency graph and identify circular or outdated dependencies',
    agentType: 'code-analyzer',
    preconditions: {},
    effects: { 'quality.dependenciesAnalyzed': true },
    cost: 1.0,
    estimatedDurationMs: 15000,
    successRate: 0.92,
    category: 'analysis',
    qeDomain: 'code-intelligence',
    method: 'mapDependencies', // plugin.ts:373
    params: {},
    implemented: true,
  },
  {
    name: 'measure-technical-debt',
    description: 'Calculate technical debt metrics and generate remediation plan',
    agentType: 'code-analyzer',
    preconditions: {
      'quality.complexityAnalyzed': true,
      'quality.smellsDetected': true,
    },
    effects: { 'quality.technicalDebtMeasured': true },
    cost: 2.0,
    estimatedDurationMs: 25000,
    successRate: 0.88,
    category: 'analysis',
    qeDomain: 'code-intelligence',
    // A14: no technical-debt measurement capability exists anywhere in src/domains.
    implemented: false,
  },
  {
    name: 'build-knowledge-graph',
    description: 'Build semantic knowledge graph of codebase for intelligent context retrieval',
    agentType: 'qe-intelligence-builder',
    preconditions: { 'quality.dependenciesAnalyzed': true },
    effects: { 'quality.knowledgeGraphBuilt': true },
    cost: 3.0,
    estimatedDurationMs: 60000,
    successRate: 0.85,
    category: 'analysis',
    qeDomain: 'code-intelligence',
    method: 'index', // plugin.ts:317 — real KG/semantic index build
    params: {},
    implemented: true,
  },
];

// ============================================================================
// FLEET ACTIONS (5 actions)
// ============================================================================

const fleetActions: QEActionTemplate[] = [
  {
    name: 'spawn-test-agent',
    description: 'Spawn additional test execution agent for parallel work',
    agentType: 'queen-coordinator',
    preconditions: { 'fleet.activeAgents': { max: 10 } }, // Below max limit
    effects: { 'fleet.activeAgents': { delta: 1 } },
    cost: 0.5,
    estimatedDurationMs: 5000,
    successRate: 0.95,
    category: 'fleet',
    qeDomain: 'test-execution',
    // A14: agent spawning is a Queen/fleet coordinator concern, not exposed
    // via any domain API method — no real binding exists for this today.
    implemented: false,
  },
  {
    name: 'optimize-fleet-topology',
    description: 'Reconfigure fleet topology for optimal task distribution',
    agentType: 'queen-coordinator',
    preconditions: { 'fleet.activeAgents': { min: 3 } },
    effects: { 'fleet.efficiency': { delta: 15 } },
    cost: 1.0,
    estimatedDurationMs: 10000,
    successRate: 0.85,
    category: 'fleet',
    // A14: no qeDomain — a pure fleet/Queen concern with no domain API to bind to.
    implemented: false,
  },
  {
    name: 'scale-down-fleet',
    description: 'Reduce fleet size to conserve resources during low-activity periods',
    agentType: 'queen-coordinator',
    preconditions: { 'fleet.activeAgents': { min: 5 } },
    effects: { 'fleet.activeAgents': { delta: -2 } },
    cost: 0.3,
    estimatedDurationMs: 3000,
    successRate: 0.98,
    category: 'fleet',
    implemented: false,
  },
  {
    name: 'spawn-specialist-agent',
    description: 'Spawn a specialized agent for specific domain work',
    agentType: 'queen-coordinator',
    preconditions: {
      'fleet.activeAgents': { max: 12 },
      'context.specialistNeeded': true,
    },
    effects: {
      'fleet.activeAgents': { delta: 1 },
      'fleet.specialistAvailable': true,
    },
    cost: 1.0,
    estimatedDurationMs: 8000,
    successRate: 0.9,
    category: 'fleet',
    implemented: false,
  },
  {
    name: 'rebalance-workload',
    description: 'Redistribute tasks across agents based on current load',
    agentType: 'queen-coordinator',
    preconditions: { 'fleet.activeAgents': { min: 2 } },
    effects: { 'fleet.workloadBalanced': true },
    cost: 0.5,
    estimatedDurationMs: 5000,
    successRate: 0.92,
    category: 'fleet',
    implemented: false,
  },
];

// ============================================================================
// QUALITY ACTIONS (5 actions)
// ============================================================================

const qualityActions: QEActionTemplate[] = [
  {
    name: 'generate-quality-report',
    description: 'Generate comprehensive quality report combining all metrics',
    agentType: 'qe-quality-gate',
    preconditions: {
      'coverage.measured': true,
      'quality.unitTestsRun': true,
    },
    effects: { 'quality.reported': true },
    cost: 1.0,
    estimatedDurationMs: 10000,
    successRate: 0.95,
    category: 'quality',
    qeDomain: 'quality-assessment',
    method: 'analyzeQuality', // plugin.ts:353
    params: {},
    implemented: true,
  },
  {
    name: 'enforce-quality-gate',
    description: 'Check if all quality gates pass and report status',
    agentType: 'qe-quality-gate',
    preconditions: { 'quality.reported': true },
    effects: { 'quality.gatePassed': true },
    cost: 0.5,
    estimatedDurationMs: 5000,
    successRate: 0.9,
    category: 'quality',
    qeDomain: 'quality-assessment',
    method: 'evaluateGate', // plugin.ts:333
    params: {},
    implemented: true,
  },
  {
    name: 'validate-requirements',
    description: 'Validate that tests cover all documented requirements',
    agentType: 'qe-requirements-validator',
    preconditions: { 'context.hasRequirements': true },
    effects: { 'quality.requirementsValidated': true },
    cost: 2.0,
    estimatedDurationMs: 20000,
    successRate: 0.88,
    category: 'quality',
    qeDomain: 'requirements-validation',
    method: 'validate', // plugin.ts:427
    params: {},
    implemented: true,
  },
  {
    name: 'predict-defects',
    description: 'Use ML-based defect prediction to identify high-risk code areas',
    agentType: 'qe-defect-predictor',
    preconditions: {
      'quality.complexityAnalyzed': true,
      'coverage.measured': true,
    },
    effects: { 'quality.defectsPredicted': true },
    cost: 2.5,
    estimatedDurationMs: 30000,
    successRate: 0.82,
    category: 'quality',
    qeDomain: 'defect-intelligence',
    method: 'predictDefects', // plugin.ts:366
    params: {},
    implemented: true,
  },
  {
    name: 'generate-deployment-report',
    description: 'Generate deployment readiness report with all quality metrics',
    agentType: 'qe-quality-gate',
    preconditions: {
      'quality.gatePassed': true,
      'quality.securityScanned': true,
    },
    effects: { 'quality.deploymentReady': true },
    cost: 1.5,
    estimatedDurationMs: 15000,
    successRate: 0.9,
    category: 'quality',
    qeDomain: 'quality-assessment',
    method: 'getDeploymentAdvice', // plugin.ts:373
    params: {},
    implemented: true,
  },
];

// ============================================================================
// ACCESSIBILITY & VISUAL ACTIONS (2 actions - bonus category)
// ============================================================================

const accessibilityActions: QEActionTemplate[] = [
  {
    name: 'run-accessibility-audit',
    description: 'Run WCAG 2.2 accessibility audit using axe-core or similar',
    agentType: 'qe-accessibility-tester',
    preconditions: { 'context.hasUI': true },
    effects: { 'quality.accessibilityAudited': true },
    cost: 2.0,
    estimatedDurationMs: 30000,
    successRate: 0.9,
    category: 'quality',
    qeDomain: 'visual-accessibility',
    method: 'runAccessibilityAudit', // plugin.ts:143
    params: {},
    implemented: true,
  },
  {
    name: 'run-visual-regression',
    description: 'Run visual regression testing with screenshot comparison',
    agentType: 'qe-visual-tester',
    preconditions: { 'context.hasUI': true },
    effects: { 'quality.visualRegressionRun': true },
    cost: 3.0,
    estimatedDurationMs: 60000,
    successRate: 0.85,
    category: 'quality',
    qeDomain: 'visual-accessibility',
    method: 'runVisualTests', // plugin.ts:142
    params: {},
    implemented: true,
  },
];

// ============================================================================
// COMBINED QE_ACTIONS ARRAY (38 total actions)
// ============================================================================

/**
 * All QE actions for GOAP planning.
 * 38 actions across 7 categories:
 * - coverage: 6 actions
 * - test: 7 actions
 * - security: 5 actions
 * - performance: 5 actions
 * - analysis: 5 actions
 * - fleet: 5 actions
 * - quality: 7 actions (including accessibility)
 */
export const QE_ACTIONS: QEActionTemplate[] = [
  ...coverageActions,
  ...testActions,
  ...securityActions,
  ...performanceActions,
  ...analysisActions,
  ...fleetActions,
  ...qualityActions,
  ...accessibilityActions,
];

// ============================================================================
// Action ID Generator
// ============================================================================

/**
 * Generate unique action ID from name
 */
function generateActionId(name: string): string {
  return `action-${name}`;
}

/**
 * Convert action template to full GOAPAction with ID
 */
export function toGOAPAction(template: QEActionTemplate): GOAPAction {
  return {
    ...template,
    id: generateActionId(template.name),
    executionCount: 0,
  };
}

// ============================================================================
// Action Retrieval Helpers
// ============================================================================

/**
 * Get all QE actions as full GOAPAction objects
 */
export function getAllQEActions(): GOAPAction[] {
  return QE_ACTIONS.map(toGOAPAction);
}

/**
 * Get actions by category
 */
export function getActionsByCategory(
  category: GOAPAction['category']
): GOAPAction[] {
  return QE_ACTIONS.filter((a) => a.category === category).map(toGOAPAction);
}

/**
 * Get actions by QE domain
 */
export function getActionsByDomain(domain: QEDomain): GOAPAction[] {
  return QE_ACTIONS.filter((a) => a.qeDomain === domain).map(toGOAPAction);
}

/**
 * Get actions by agent type
 */
export function getActionsByAgentType(agentType: string): GOAPAction[] {
  return QE_ACTIONS.filter((a) => a.agentType === agentType).map(toGOAPAction);
}

/**
 * Get action by name
 */
export function getActionByName(name: string): GOAPAction | undefined {
  const template = QE_ACTIONS.find((a) => a.name === name);
  return template ? toGOAPAction(template) : undefined;
}

// ============================================================================
// Seeding Function (for database persistence)
// ============================================================================

/**
 * GOAPPlanner interface for seeding (matches src/planning/goap-planner.ts)
 */
interface GOAPPlannerLike {
  addAction(action: Omit<GOAPAction, 'id' | 'executionCount'>): Promise<void>;
}

/**
 * Seed all QE actions into the planner's action library
 * @param planner - GOAPPlanner instance
 * @returns Number of actions seeded
 */
export async function seedQEActions(planner: GOAPPlannerLike): Promise<number> {
  let count = 0;
  for (const actionTemplate of QE_ACTIONS) {
    await planner.addAction(actionTemplate);
    count++;
  }
  return count;
}

// ============================================================================
// Pre-defined Goals for Common QE Workflows
// ============================================================================

/**
 * Pre-defined goal template (without runtime ID)
 */
export interface QEGoalTemplate {
  name: string;
  description: string;
  conditions: StateConditions;
  priority: number;
  qeDomain?: QEDomain;
}

/**
 * Pre-defined goals for common QE workflows
 */
export const QE_GOALS: QEGoalTemplate[] = [
  {
    name: 'achieve-90-percent-coverage',
    description: 'Reach 90% line coverage through targeted test generation',
    conditions: { 'coverage.line': { min: 90 } },
    priority: 1,
    qeDomain: 'coverage-analysis',
  },
  {
    name: 'all-tests-passing',
    description: 'All tests green with 100% pass rate',
    conditions: { 'quality.testsPassing': { min: 100 } },
    priority: 1,
    qeDomain: 'test-execution',
  },
  {
    name: 'security-compliant',
    description: 'Pass security audit with no critical vulnerabilities',
    conditions: {
      'quality.securityScanned': true,
      'quality.vulnerabilities': { max: 0 },
    },
    priority: 2,
    qeDomain: 'security-compliance',
  },
  {
    name: 'deployment-ready',
    description: 'Ready for production deployment with all quality gates passed',
    conditions: {
      'coverage.line': { min: 80 },
      'quality.testsPassing': { min: 100 },
      'quality.securityScanned': true,
      'quality.gatePassed': true,
    },
    priority: 1,
  },
  {
    name: 'performance-validated',
    description: 'Performance benchmarks and load tests completed successfully',
    conditions: {
      'quality.benchmarked': true,
      'quality.loadTested': true,
    },
    priority: 2,
    qeDomain: 'chaos-resilience',
  },
  {
    name: 'code-quality-excellent',
    description: 'Excellent code quality with low complexity and no code smells',
    conditions: {
      'quality.complexityAnalyzed': true,
      'quality.smellsDetected': true,
      'quality.technicalDebtMeasured': true,
    },
    priority: 3,
    qeDomain: 'code-intelligence',
  },
  {
    name: 'full-test-suite',
    description: 'Complete test suite with unit, integration, and e2e tests',
    conditions: {
      'quality.unitTestsRun': true,
      'quality.integrationTestsRun': true,
      'quality.e2eTestsRun': true,
    },
    priority: 2,
    qeDomain: 'test-execution',
  },
  {
    name: 'accessibility-compliant',
    description: 'WCAG 2.2 compliant with visual regression coverage',
    conditions: {
      'quality.accessibilityAudited': true,
      'quality.visualRegressionRun': true,
    },
    priority: 2,
    qeDomain: 'visual-accessibility',
  },
];

// ============================================================================
// Action Statistics
// ============================================================================

/**
 * Get statistics about the action library
 */
export function getActionStats(): {
  total: number;
  byCategory: Record<string, number>;
  byDomain: Record<string, number>;
  averageCost: number;
  averageSuccessRate: number;
} {
  const byCategory: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  let totalCost = 0;
  let totalSuccessRate = 0;

  for (const action of QE_ACTIONS) {
    // Count by category
    byCategory[action.category] = (byCategory[action.category] || 0) + 1;

    // Count by domain
    if (action.qeDomain) {
      byDomain[action.qeDomain] = (byDomain[action.qeDomain] || 0) + 1;
    }

    totalCost += action.cost;
    totalSuccessRate += action.successRate;
  }

  return {
    total: QE_ACTIONS.length,
    byCategory,
    byDomain,
    averageCost: totalCost / QE_ACTIONS.length,
    averageSuccessRate: totalSuccessRate / QE_ACTIONS.length,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate action library for duplicates and consistency
 */
export function validateActionLibrary(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const names = new Set<string>();

  for (const action of QE_ACTIONS) {
    // Check for duplicate names
    if (names.has(action.name)) {
      errors.push(`Duplicate action name: ${action.name}`);
    }
    names.add(action.name);

    // Check required fields
    if (!action.name) errors.push('Action missing name');
    if (!action.agentType) errors.push(`Action ${action.name} missing agentType`);
    if (!action.category) errors.push(`Action ${action.name} missing category`);
    if (action.cost <= 0) errors.push(`Action ${action.name} has invalid cost: ${action.cost}`);
    if (action.successRate < 0 || action.successRate > 1) {
      errors.push(`Action ${action.name} has invalid successRate: ${action.successRate}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
