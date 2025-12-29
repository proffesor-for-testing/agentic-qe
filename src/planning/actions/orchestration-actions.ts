/**
 * Orchestration Actions for GOAP Planning
 *
 * These actions correspond to workflow steps in task orchestration.
 * They enable dynamic workflow generation based on world state.
 *
 * @module planning/actions/orchestration-actions
 * @version 1.0.0
 */

import { GOAPAction } from '../types';

/**
 * Analysis Actions - Code analysis and impact assessment
 */
export const analyzeCodebase: GOAPAction = {
  id: 'orch-analyze-codebase',
  name: 'Analyze Codebase',
  description: 'Perform comprehensive code analysis including complexity metrics',
  agentType: 'qe-code-intelligence',
  preconditions: {
    'resources.timeRemaining': { gte: 300 },
    'resources.parallelSlots': { gte: 1 },
    'quality.complexityMeasured': { eq: false }
  },
  effects: {
    'quality.complexityMeasured': { set: true },
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 1.0,
  durationEstimate: 300,
  category: 'analysis'
};

export const analyzeChangeImpact: GOAPAction = {
  id: 'orch-analyze-change-impact',
  name: 'Analyze Change Impact',
  description: 'Analyze code changes to identify impacted areas and required tests',
  agentType: 'qe-coverage-analyzer',
  preconditions: {
    'resources.timeRemaining': { gte: 180 },
    'context.impactAnalyzed': { eq: false }
  },
  effects: {
    'context.impactAnalyzed': { set: true },
    'resources.timeRemaining': { decrease: 180 }
  },
  cost: 1.0,
  durationEstimate: 180,
  category: 'analysis'
};

export const analyzeCoverageGaps: GOAPAction = {
  id: 'orch-analyze-coverage-gaps',
  name: 'Analyze Coverage Gaps',
  description: 'Identify gaps in test coverage that need to be addressed',
  agentType: 'qe-coverage-analyzer',
  preconditions: {
    'resources.timeRemaining': { gte: 120 },
    'context.coverageGapsAnalyzed': { eq: false },
    'coverage.measured': { eq: true } // Need coverage data first
  },
  effects: {
    'context.coverageGapsAnalyzed': { set: true },
    'resources.timeRemaining': { decrease: 120 }
  },
  cost: 1.5,
  durationEstimate: 120,
  category: 'analysis'
};

/**
 * Test Generation Actions
 */
export const generateUnitTests: GOAPAction = {
  id: 'orch-generate-unit-tests',
  name: 'Generate Unit Tests',
  description: 'Generate unit tests for uncovered code',
  agentType: 'qe-test-generator',
  preconditions: {
    'resources.timeRemaining': { gte: 600 },
    'resources.parallelSlots': { gte: 1 },
    'quality.complexityMeasured': { eq: true } // Need analysis first
  },
  effects: {
    'coverage.line': { increase: 15 },
    'coverage.branch': { increase: 10 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 3.0,
  durationEstimate: 600,
  category: 'test'
};

export const generateIntegrationTests: GOAPAction = {
  id: 'orch-generate-integration-tests',
  name: 'Generate Integration Tests',
  description: 'Generate integration tests for component interactions',
  agentType: 'qe-test-generator',
  preconditions: {
    'resources.timeRemaining': { gte: 900 },
    'resources.parallelSlots': { gte: 1 },
    'quality.complexityMeasured': { eq: true }
  },
  effects: {
    'quality.integrationTested': { set: true },
    'coverage.line': { increase: 10 },
    'resources.timeRemaining': { decrease: 900 }
  },
  cost: 4.0,
  durationEstimate: 900,
  category: 'test'
};

export const generateBDDScenarios: GOAPAction = {
  id: 'orch-generate-bdd-scenarios',
  name: 'Generate BDD Scenarios',
  description: 'Generate behavior-driven development scenarios',
  agentType: 'qe-test-generator',
  preconditions: {
    'resources.timeRemaining': { gte: 420 },
    'context.impactAnalyzed': { eq: true },
    'context.bddGenerated': { eq: false }
  },
  effects: {
    'context.bddGenerated': { set: true },
    'resources.timeRemaining': { decrease: 420 }
  },
  cost: 3.5,
  durationEstimate: 420,
  category: 'test'
};

/**
 * Test Execution Actions
 */
export const executeUnitTests: GOAPAction = {
  id: 'orch-execute-unit-tests',
  name: 'Execute Unit Tests',
  description: 'Run the unit test suite',
  agentType: 'qe-test-executor',
  preconditions: {
    'resources.timeRemaining': { gte: 180 },
    'resources.parallelSlots': { gte: 1 },
    'quality.testsMeasured': { eq: false }
  },
  effects: {
    'quality.testsMeasured': { set: true },
    'quality.testsPassing': { set: 85 }, // Will be updated with real value
    'coverage.measured': { set: true },
    'coverage.line': { set: 70 }, // Will be updated with real value
    'resources.timeRemaining': { decrease: 180 }
  },
  cost: 1.5,
  durationEstimate: 180,
  category: 'test'
};

export const executeIntegrationTests: GOAPAction = {
  id: 'orch-execute-integration-tests',
  name: 'Execute Integration Tests',
  description: 'Run the integration test suite',
  agentType: 'qe-test-executor',
  preconditions: {
    'resources.timeRemaining': { gte: 600 },
    'resources.parallelSlots': { gte: 1 },
    'quality.testsMeasured': { eq: true } // Unit tests first
  },
  effects: {
    'quality.integrationTested': { set: true },
    'quality.testsPassing': { increase: 5 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 3.0,
  durationEstimate: 600,
  category: 'test'
};

/**
 * Coverage Analysis Actions
 */
export const measureCoverage: GOAPAction = {
  id: 'orch-measure-coverage',
  name: 'Measure Test Coverage',
  description: 'Collect and analyze test coverage metrics',
  agentType: 'qe-coverage-analyzer',
  preconditions: {
    'resources.timeRemaining': { gte: 120 },
    'quality.testsMeasured': { eq: true },
    'coverage.measured': { eq: false }
  },
  effects: {
    'coverage.measured': { set: true },
    'resources.timeRemaining': { decrease: 120 }
  },
  cost: 1.0,
  durationEstimate: 120,
  category: 'coverage'
};

export const improveCoverage: GOAPAction = {
  id: 'orch-improve-coverage',
  name: 'Improve Test Coverage',
  description: 'Generate additional tests to improve coverage',
  agentType: 'qe-test-generator',
  preconditions: {
    'resources.timeRemaining': { gte: 600 },
    'coverage.measured': { eq: true },
    'coverage.line': { lt: 80 }
  },
  effects: {
    'coverage.line': { increase: 15 },
    'coverage.branch': { increase: 10 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 4.0,
  durationEstimate: 600,
  category: 'coverage'
};

/**
 * Security Analysis Actions
 */
export const runSecurityScan: GOAPAction = {
  id: 'orch-run-security-scan',
  name: 'Run Security Scan',
  description: 'Execute security vulnerability scan',
  agentType: 'qe-security-scanner',
  preconditions: {
    'resources.timeRemaining': { gte: 300 },
    'quality.securityMeasured': { eq: false }
  },
  effects: {
    'quality.securityMeasured': { set: true },
    'quality.securityScore': { set: 85 }, // Will be updated with real value
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 2.0,
  durationEstimate: 300,
  category: 'security'
};

export const fixSecurityIssues: GOAPAction = {
  id: 'orch-fix-security-issues',
  name: 'Fix Security Issues',
  description: 'Apply automated fixes for security vulnerabilities',
  agentType: 'qe-security-scanner',
  preconditions: {
    'resources.timeRemaining': { gte: 600 },
    'quality.securityMeasured': { eq: true },
    'quality.securityScore': { lt: 70 }
  },
  effects: {
    'quality.securityScore': { increase: 20 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 5.0,
  durationEstimate: 600,
  category: 'security'
};

/**
 * Performance Testing Actions
 */
export const measurePerformanceBaseline: GOAPAction = {
  id: 'orch-measure-performance-baseline',
  name: 'Measure Performance Baseline',
  description: 'Establish performance baseline metrics',
  agentType: 'qe-performance-tester',
  preconditions: {
    'resources.timeRemaining': { gte: 300 },
    'quality.performanceMeasured': { eq: false }
  },
  effects: {
    'quality.performanceMeasured': { set: true },
    'quality.performanceScore': { set: 75 }, // Will be updated with real value
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 2.5,
  durationEstimate: 300,
  category: 'performance'
};

export const runLoadTests: GOAPAction = {
  id: 'orch-run-load-tests',
  name: 'Run Load Tests',
  description: 'Execute load tests to validate scalability',
  agentType: 'qe-performance-tester',
  preconditions: {
    'resources.timeRemaining': { gte: 900 },
    'quality.performanceMeasured': { eq: true }
  },
  effects: {
    'quality.performanceScore': { increase: 10 },
    'resources.timeRemaining': { decrease: 900 }
  },
  cost: 4.0,
  durationEstimate: 900,
  category: 'performance'
};

export const runStressTests: GOAPAction = {
  id: 'orch-run-stress-tests',
  name: 'Run Stress Tests',
  description: 'Execute stress tests to find breaking points',
  agentType: 'qe-performance-tester',
  preconditions: {
    'resources.timeRemaining': { gte: 600 },
    'quality.performanceMeasured': { eq: true }
  },
  effects: {
    'quality.slaCompliant': { set: true },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 3.5,
  durationEstimate: 600,
  category: 'performance'
};

export const analyzeBottlenecks: GOAPAction = {
  id: 'orch-analyze-bottlenecks',
  name: 'Analyze Performance Bottlenecks',
  description: 'Identify and analyze performance bottlenecks',
  agentType: 'qe-performance-tester',
  preconditions: {
    'resources.timeRemaining': { gte: 240 },
    'quality.performanceMeasured': { eq: true }
  },
  effects: {
    'quality.performanceScore': { increase: 5 },
    'resources.timeRemaining': { decrease: 240 }
  },
  cost: 2.0,
  durationEstimate: 240,
  category: 'performance'
};

/**
 * Quality Gate Actions
 */
export const evaluateQualityGate: GOAPAction = {
  id: 'orch-evaluate-quality-gate',
  name: 'Evaluate Quality Gate',
  description: 'Make quality gate pass/fail decision',
  agentType: 'qe-quality-gate',
  preconditions: {
    'resources.timeRemaining': { gte: 30 },
    'quality.testsMeasured': { eq: true },
    'quality.securityMeasured': { eq: true },
    'quality.performanceMeasured': { eq: true },
    'quality.gateEvaluated': { eq: false }
  },
  effects: {
    'quality.gateEvaluated': { set: true },
    'resources.timeRemaining': { decrease: 30 }
  },
  cost: 0.5,
  durationEstimate: 30,
  category: 'process'
};

/**
 * All orchestration actions
 */
export const orchestrationActions: GOAPAction[] = [
  // Analysis
  analyzeCodebase,
  analyzeChangeImpact,
  analyzeCoverageGaps,
  // Test Generation
  generateUnitTests,
  generateIntegrationTests,
  generateBDDScenarios,
  // Test Execution
  executeUnitTests,
  executeIntegrationTests,
  // Coverage
  measureCoverage,
  improveCoverage,
  // Security
  runSecurityScan,
  fixSecurityIssues,
  // Performance
  measurePerformanceBaseline,
  runLoadTests,
  runStressTests,
  analyzeBottlenecks,
  // Quality Gate
  evaluateQualityGate
];

/**
 * Get actions by category
 */
export function getOrchestrationActionsByCategory(category: string): GOAPAction[] {
  return orchestrationActions.filter(a => a.category === category);
}

/**
 * Get actions suitable for a specific task type
 */
export function getActionsForTaskType(taskType: string): GOAPAction[] {
  const categoryMap: Record<string, string[]> = {
    'comprehensive-testing': ['analysis', 'test', 'coverage'],
    'quality-gate': ['test', 'security', 'performance', 'process', 'coverage'],
    'defect-prevention': ['analysis', 'test', 'coverage'],
    'performance-validation': ['performance', 'analysis']
  };

  const categories = categoryMap[taskType] || [];
  return orchestrationActions.filter(a => categories.includes(a.category));
}
