/**
 * Test Strategy GOAP Actions
 *
 * Actions for test strategy planning:
 * - Impact analysis
 * - Test prioritization
 * - Coverage optimization
 * - Risk-based test selection
 *
 * @module planning/actions/test-strategy-actions
 * @version 1.0.0
 */

import { GOAPAction } from '../types';

/**
 * Analyze change impact action
 */
export const analyzeChangeImpact: GOAPAction = {
  id: 'ts-analyze-impact',
  name: 'Analyze Change Impact',
  description: 'Determine blast radius and affected test areas',
  agentType: 'qe-regression-risk-analyzer',
  preconditions: {
    'context.impactedFiles': { exists: true },
    'resources.timeRemaining': { gte: 30 }
  },
  effects: {
    'context.impactAnalyzed': { set: true },       // Flag: impact has been analyzed
    'resources.timeRemaining': { decrease: 60 }
  },
  cost: 0.5,
  durationEstimate: 60000,  // 1 minute
  successRate: 0.95,
  executionCount: 0,
  category: 'analysis'
};

/**
 * Prioritize tests by risk action
 */
export const prioritizeTestsByRisk: GOAPAction = {
  id: 'ts-prioritize-risk',
  name: 'Prioritize Tests by Risk',
  description: 'Rank tests based on failure probability and impact',
  agentType: 'qe-regression-risk-analyzer',
  preconditions: {
    'context.suggestedTests': { exists: true },
    'resources.timeRemaining': { gte: 20 }
  },
  effects: {
    'context.testPriority': { set: 'ranked' },
    'resources.timeRemaining': { decrease: 30 }
  },
  cost: 0.4,
  durationEstimate: 30000,
  successRate: 0.98,
  executionCount: 0,
  category: 'analysis'
};

/**
 * Select minimal test suite action
 */
export const selectMinimalTestSuite: GOAPAction = {
  id: 'ts-select-minimal',
  name: 'Select Minimal Test Suite',
  description: 'Choose smallest test set covering all changed code',
  agentType: 'qe-regression-risk-analyzer',
  preconditions: {
    'context.suggestedTests': { exists: true },
    'resources.timeRemaining': { lt: 600 }        // Only when time-constrained
  },
  effects: {
    'context.testPriority': { set: 'ranked' },
    'resources.timeRemaining': { decrease: 15 }
  },
  cost: 0.3,
  durationEstimate: 15000,
  successRate: 0.92,
  executionCount: 0,
  category: 'analysis'
};

/**
 * Analyze coverage gaps action
 */
export const analyzeCoverageGaps: GOAPAction = {
  id: 'ts-coverage-gaps',
  name: 'Analyze Coverage Gaps',
  description: 'Identify untested code paths and missing coverage',
  agentType: 'qe-coverage-analyzer',
  preconditions: {
    'coverage.line': { lt: 100 },                 // Has room for improvement
    'resources.timeRemaining': { gte: 60 }
  },
  effects: {
    'context.coverageGapsAnalyzed': { set: true },  // Flag: coverage gaps analyzed
    'resources.timeRemaining': { decrease: 90 }
  },
  cost: 0.8,
  durationEstimate: 90000,
  successRate: 0.95,
  executionCount: 0,
  category: 'analysis'
};

/**
 * Generate targeted tests action
 */
export const generateTargetedTests: GOAPAction = {
  id: 'ts-generate-targeted',
  name: 'Generate Targeted Tests',
  description: 'Create tests specifically for uncovered changes',
  agentType: 'qe-test-generator',
  preconditions: {
    'context.suggestedTests': { exists: true },
    'coverage.line': { lt: 80 },
    'resources.timeRemaining': { gte: 300 },
    'fleet.availableAgents': { contains: 'qe-test-generator' }
  },
  effects: {
    'coverage.line': { increase: 20 },
    'coverage.branch': { increase: 15 },
    'resources.timeRemaining': { decrease: 360 }
  },
  cost: 2.5,
  durationEstimate: 360000,  // 6 minutes
  successRate: 0.80,
  executionCount: 0,
  category: 'test'
};

/**
 * Run critical path tests action
 */
export const runCriticalPathTests: GOAPAction = {
  id: 'ts-critical-path',
  name: 'Run Critical Path Tests',
  description: 'Execute tests for high-risk code paths only',
  agentType: 'qe-test-executor',
  preconditions: {
    'context.testPriority': { eq: 'ranked' },
    'resources.timeRemaining': { gte: 60 }
  },
  effects: {
    'quality.criticalPathTested': { set: true },
    'quality.testsMeasured': { set: true },        // Flag: tests have been measured
    'resources.timeRemaining': { decrease: 120 }
  },
  cost: 0.8,
  durationEstimate: 120000,
  successRate: 0.93,
  executionCount: 0,
  category: 'test'
};

/**
 * Detect flaky tests action
 */
export const detectFlakyTests: GOAPAction = {
  id: 'ts-detect-flaky',
  name: 'Detect Flaky Tests',
  description: 'Identify and quarantine unreliable tests',
  agentType: 'qe-flaky-test-hunter',
  preconditions: {
    'context.previousFailures': { gte: 1 },       // Has failure history
    'resources.timeRemaining': { gte: 120 }
  },
  effects: {
    'context.previousFailures': { decrease: 1 },
    'resources.timeRemaining': { decrease: 180 }
  },
  cost: 1.5,
  durationEstimate: 180000,
  successRate: 0.88,
  executionCount: 0,
  category: 'test'
};

/**
 * Stabilize flaky tests action
 */
export const stabilizeFlakyTests: GOAPAction = {
  id: 'ts-stabilize-flaky',
  name: 'Stabilize Flaky Tests',
  description: 'Auto-remediate detected flaky tests',
  agentType: 'qe-flaky-test-hunter',
  preconditions: {
    'context.previousFailures': { gte: 2 },       // Multiple failures
    'resources.timeRemaining': { gte: 300 }
  },
  effects: {
    'context.previousFailures': { set: 0 },
    'quality.testsPassing': { increase: 5 },
    'resources.timeRemaining': { decrease: 360 }
  },
  cost: 2.0,
  durationEstimate: 360000,
  successRate: 0.70,
  executionCount: 0,
  category: 'test'
};

/**
 * Generate BDD scenarios action
 */
export const generateBDDScenarios: GOAPAction = {
  id: 'ts-bdd-scenarios',
  name: 'Generate BDD Scenarios',
  description: 'Create behavior-driven test scenarios from requirements',
  agentType: 'qe-requirements-validator',
  preconditions: {
    'resources.timeRemaining': { gte: 180 },
    'fleet.availableAgents': { contains: 'qe-requirements-validator' }
  },
  effects: {
    'context.bddGenerated': { set: true },         // Flag: BDD scenarios generated
    'resources.timeRemaining': { decrease: 240 }
  },
  cost: 1.8,
  durationEstimate: 240000,
  successRate: 0.85,
  executionCount: 0,
  category: 'test'
};

/**
 * Optimize parallel execution action
 */
export const optimizeParallelExecution: GOAPAction = {
  id: 'ts-optimize-parallel',
  name: 'Optimize Parallel Execution',
  description: 'Rebalance test distribution for parallel runners',
  agentType: 'qe-test-executor',
  preconditions: {
    'resources.parallelSlots': { gte: 2 },        // Has parallelism available
    'resources.timeRemaining': { lt: 300 }        // Time pressure
  },
  effects: {
    'resources.parallelSlots': { increase: 2 },
    'resources.timeRemaining': { decrease: 30 }
  },
  cost: 0.6,
  durationEstimate: 30000,
  successRate: 0.95,
  executionCount: 0,
  category: 'process'
};

/**
 * All test strategy actions
 */
export const testStrategyActions: GOAPAction[] = [
  analyzeChangeImpact,
  prioritizeTestsByRisk,
  selectMinimalTestSuite,
  analyzeCoverageGaps,
  generateTargetedTests,
  runCriticalPathTests,
  detectFlakyTests,
  stabilizeFlakyTests,
  generateBDDScenarios,
  optimizeParallelExecution
];

/**
 * Get test strategy action by ID
 */
export function getTestStrategyAction(id: string): GOAPAction | undefined {
  return testStrategyActions.find(a => a.id === id);
}

/**
 * Get actions suitable for time-constrained scenarios
 */
export function getQuickTestStrategyActions(): GOAPAction[] {
  return testStrategyActions.filter(a => (a.durationEstimate ?? 0) < 120000);
}

/**
 * Get actions for coverage improvement
 */
export function getCoverageImprovementActions(): GOAPAction[] {
  return testStrategyActions.filter(a =>
    a.effects['coverage.line']?.increase ||
    a.effects['coverage.branch']?.increase
  );
}
