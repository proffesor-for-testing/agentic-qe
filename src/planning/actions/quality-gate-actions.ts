/**
 * Quality Gate GOAP Actions
 *
 * Actions for achieving quality gate goals:
 * - Test execution and coverage
 * - Security scanning
 * - Performance validation
 * - Code quality checks
 *
 * @module planning/actions/quality-gate-actions
 * @version 1.0.0
 */

import { GOAPAction } from '../types';

/**
 * Run unit tests action (MEASUREMENT ACTION)
 *
 * This action MEASURES the current state - it does NOT improve metrics.
 * It sets measurement flags that enable improvement actions to run.
 * Can only run once (precondition: not already measured).
 */
export const runUnitTests: GOAPAction = {
  id: 'qg-run-unit-tests',
  name: 'Run Unit Tests',
  description: 'Execute unit test suite to measure current test pass rate and coverage',
  agentType: 'qe-test-executor',
  preconditions: {
    'resources.timeRemaining': { gte: 60 },
    'resources.parallelSlots': { gte: 1 },
    'quality.testsMeasured': { eq: false }  // Only run if not already measured
  },
  effects: {
    'quality.testsMeasured': { set: true },  // Flag: tests have been run
    'coverage.measured': { set: true },       // Flag: coverage is known
    'resources.timeRemaining': { decrease: 120 }
  },
  cost: 1.0,
  durationEstimate: 120000,
  successRate: 0.95,
  executionCount: 0,
  category: 'test'
};

/**
 * Run integration tests action (MEASUREMENT ACTION)
 *
 * Measures integration test pass rate. Sets integration testing flag.
 */
export const runIntegrationTests: GOAPAction = {
  id: 'qg-run-integration-tests',
  name: 'Run Integration Tests',
  description: 'Execute integration test suite to verify component interactions',
  agentType: 'qe-integration-tester',
  preconditions: {
    'resources.timeRemaining': { gte: 180 },
    'resources.parallelSlots': { gte: 1 },
    'quality.testsMeasured': { eq: true },    // Unit tests must run first
    'quality.integrationTested': { eq: false } // Only run once
  },
  effects: {
    'quality.integrationTested': { set: true },
    'quality.criticalPathTested': { set: true },
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 1.5,
  durationEstimate: 300000,
  successRate: 0.90,
  executionCount: 0,
  category: 'test'
};

/**
 * Generate missing tests action (IMPROVEMENT ACTION)
 *
 * Requires coverage to have been measured first.
 */
export const generateMissingTests: GOAPAction = {
  id: 'qg-generate-tests',
  name: 'Generate Missing Tests',
  description: 'AI-powered test generation for uncovered code paths',
  agentType: 'qe-test-generator',
  preconditions: {
    'coverage.measured': { eq: true },            // Coverage must be measured first
    'coverage.line': { lt: 80 },                  // Only if coverage is low
    'resources.timeRemaining': { gte: 300 }
  },
  effects: {
    'coverage.line': { increase: 15 },
    'coverage.branch': { increase: 10 },
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 2.0,
  durationEstimate: 300000,  // 5 minutes
  successRate: 0.85,
  executionCount: 0,
  category: 'test'
};

/**
 * Run security scan action (MEASUREMENT ACTION)
 *
 * Measures security vulnerabilities. Sets measurement flag.
 * Can only run once - improvement actions require this to run first.
 */
export const runSecurityScan: GOAPAction = {
  id: 'qg-security-scan',
  name: 'Run Security Scan',
  description: 'SAST/DAST security vulnerability scanning',
  agentType: 'qe-security-scanner',
  preconditions: {
    'resources.timeRemaining': { gte: 120 },
    'quality.securityMeasured': { eq: false }  // Only run if not already measured
  },
  effects: {
    'quality.securityMeasured': { set: true },  // Flag: security has been scanned
    'resources.timeRemaining': { decrease: 180 }
  },
  cost: 1.2,
  durationEstimate: 180000,  // 3 minutes
  successRate: 0.98,
  executionCount: 0,
  category: 'security'
};

/**
 * Fix critical vulnerabilities action (IMPROVEMENT ACTION)
 *
 * Requires security scan to have been run first.
 */
export const fixCriticalVulnerabilities: GOAPAction = {
  id: 'qg-fix-critical-vulns',
  name: 'Fix Critical Vulnerabilities',
  description: 'Auto-remediate critical security issues',
  agentType: 'qe-security-scanner',
  preconditions: {
    'quality.securityMeasured': { eq: true },     // Security scan must run first
    'quality.securityScore': { lt: 75 },          // Has security issues
    'resources.timeRemaining': { gte: 600 }
  },
  effects: {
    'quality.securityScore': { increase: 25 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 3.0,
  durationEstimate: 600000,  // 10 minutes
  successRate: 0.75,
  executionCount: 0,
  category: 'security'
};

/**
 * Fix medium vulnerabilities action (IMPROVEMENT ACTION)
 * Works on systems with medium-range security scores
 */
export const fixMediumVulnerabilities: GOAPAction = {
  id: 'qg-fix-medium-vulns',
  name: 'Fix Medium Vulnerabilities',
  description: 'Remediate medium-severity security issues',
  agentType: 'qe-security-scanner',
  preconditions: {
    'quality.securityMeasured': { eq: true },  // Security scan must run first
    'quality.securityScore': { lt: 90 },       // Still has issues to fix
    'resources.timeRemaining': { gte: 400 }
  },
  effects: {
    'quality.securityScore': { increase: 15 },
    'resources.timeRemaining': { decrease: 400 }
  },
  cost: 2.0,
  durationEstimate: 400000,  // ~7 minutes
  successRate: 0.85,
  executionCount: 0,
  category: 'security'
};

/**
 * Fix low vulnerabilities action (IMPROVEMENT ACTION)
 * Works on systems with higher security scores needing final polish
 */
export const fixLowVulnerabilities: GOAPAction = {
  id: 'qg-fix-low-vulns',
  name: 'Fix Low Vulnerabilities',
  description: 'Clean up low-severity security issues',
  agentType: 'qe-security-scanner',
  preconditions: {
    'quality.securityMeasured': { eq: true },  // Security scan must run first
    'quality.securityScore': { lt: 95 },
    'resources.timeRemaining': { gte: 300 }
  },
  effects: {
    'quality.securityScore': { increase: 10 },
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 1.5,
  durationEstimate: 300000,  // 5 minutes
  successRate: 0.90,
  executionCount: 0,
  category: 'security'
};

/**
 * Run performance benchmark action (MEASUREMENT ACTION)
 *
 * Measures performance metrics. Sets measurement flag.
 * Improvement actions require this to run first.
 */
export const runPerformanceBenchmark: GOAPAction = {
  id: 'qg-performance-benchmark',
  name: 'Run Performance Benchmark',
  description: 'Execute performance tests and measure metrics',
  agentType: 'qe-performance-tester',
  preconditions: {
    'resources.timeRemaining': { gte: 300 },
    'quality.testsMeasured': { eq: true },           // Tests must run first
    'quality.performanceMeasured': { eq: false }     // Only run if not already measured
  },
  effects: {
    'quality.performanceMeasured': { set: true },  // Flag: performance has been measured
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 1.5,
  durationEstimate: 300000,  // 5 minutes
  successRate: 0.92,
  executionCount: 0,
  category: 'performance'
};

/**
 * Analyze code complexity action (MEASUREMENT ACTION)
 *
 * Measures code complexity and technical debt. Sets measurement flag.
 */
export const analyzeCodeComplexity: GOAPAction = {
  id: 'qg-code-complexity',
  name: 'Analyze Code Complexity',
  description: 'Measure cyclomatic complexity and technical debt',
  agentType: 'qe-code-complexity',
  preconditions: {
    'resources.timeRemaining': { gte: 60 },
    'quality.complexityMeasured': { eq: false }  // Only run if not already measured
  },
  effects: {
    'quality.complexityMeasured': { set: true },  // Flag: complexity has been analyzed
    'resources.timeRemaining': { decrease: 90 }
  },
  cost: 0.8,
  durationEstimate: 90000,  // 1.5 minutes
  successRate: 0.98,
  executionCount: 0,
  category: 'analysis'
};

/**
 * Request quality gate exception action
 */
export const requestGateException: GOAPAction = {
  id: 'qg-request-exception',
  name: 'Request Gate Exception',
  description: 'Request temporary exception for quality gate failure',
  agentType: 'qe-quality-gate',
  preconditions: {
    'quality.gateStatus': { eq: 'failed' },
    'context.riskLevel': { ne: 'critical' }       // Cannot except critical
  },
  effects: {
    'quality.gateStatus': { set: 'exception_requested' }
  },
  cost: 5.0,  // High cost - discourage exceptions
  durationEstimate: 5000,
  successRate: 0.60,  // Often rejected
  executionCount: 0,
  category: 'process'
};

/**
 * Run smoke tests action (fast validation)
 */
export const runSmokeTests: GOAPAction = {
  id: 'qg-smoke-tests',
  name: 'Run Smoke Tests',
  description: 'Quick sanity check for critical paths',
  agentType: 'qe-test-executor',
  preconditions: {
    'resources.timeRemaining': { gte: 30 }
  },
  effects: {
    'quality.smokeTestsPassing': { set: true },
    'resources.timeRemaining': { decrease: 45 }
  },
  cost: 0.5,  // Low cost - quick check
  durationEstimate: 45000,  // 45 seconds
  successRate: 0.97,
  executionCount: 0,
  category: 'test'
};

/**
 * Evaluate quality gate action (MEASUREMENT ACTION)
 *
 * Evaluates all quality metrics against thresholds.
 * Requires all measurements to be complete first.
 */
export const evaluateQualityGate: GOAPAction = {
  id: 'qg-evaluate-gate',
  name: 'Evaluate Quality Gate',
  description: 'Final quality gate evaluation against thresholds',
  agentType: 'qe-quality-gate',
  preconditions: {
    'quality.testsMeasured': { eq: true },        // Tests must be measured
    'quality.securityMeasured': { eq: true },     // Security must be checked
    'quality.performanceMeasured': { eq: true },  // Performance must be measured
    'quality.gateEvaluated': { eq: false }        // Only evaluate once
  },
  effects: {
    'quality.gateEvaluated': { set: true }        // Flag: gate has been evaluated
  },
  cost: 0.3,
  durationEstimate: 10000,
  successRate: 0.99,
  executionCount: 0,
  category: 'process'
};

/**
 * Fix failing tests action (IMPROVEMENT ACTION)
 *
 * Requires tests to have been run first.
 */
export const fixFailingTests: GOAPAction = {
  id: 'qg-fix-failing-tests',
  name: 'Fix Failing Tests',
  description: 'Analyze and fix failing test cases',
  agentType: 'qe-test-writer',
  preconditions: {
    'quality.testsMeasured': { eq: true },       // Tests must be run first
    'quality.testsPassing': { lt: 95 },          // Tests need fixing
    'resources.timeRemaining': { gte: 300 }
  },
  effects: {
    'quality.testsPassing': { increase: 10 },
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 2.5,
  durationEstimate: 300000,  // 5 minutes
  successRate: 0.80,
  executionCount: 0,
  category: 'test'
};

/**
 * Fix flaky tests action (IMPROVEMENT ACTION)
 *
 * Requires tests to have been run first.
 */
export const fixFlakyTests: GOAPAction = {
  id: 'qg-fix-flaky-tests',
  name: 'Fix Flaky Tests',
  description: 'Identify and stabilize flaky test cases',
  agentType: 'qe-flaky-test-hunter',
  preconditions: {
    'quality.testsMeasured': { eq: true },       // Tests must be run first
    'quality.testsPassing': { lt: 98 },
    'resources.timeRemaining': { gte: 600 }
  },
  effects: {
    'quality.testsPassing': { increase: 5 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 3.5,
  durationEstimate: 600000,  // 10 minutes
  successRate: 0.75,
  executionCount: 0,
  category: 'test'
};

/**
 * Refactor brittle tests action (IMPROVEMENT ACTION)
 * Alternative approach to improving test pass rate
 */
export const refactorBrittleTests: GOAPAction = {
  id: 'qg-refactor-brittle-tests',
  name: 'Refactor Brittle Tests',
  description: 'Identify and refactor brittle/unreliable tests',
  agentType: 'qe-test-writer',
  preconditions: {
    'quality.testsMeasured': { eq: true },       // Tests must be run first
    'quality.testsPassing': { lt: 92 },
    'resources.timeRemaining': { gte: 450 }
  },
  effects: {
    'quality.testsPassing': { increase: 8 },
    'resources.timeRemaining': { decrease: 450 }
  },
  cost: 2.8,
  durationEstimate: 450000,  // 7.5 minutes
  successRate: 0.82,
  executionCount: 0,
  category: 'test'
};

/**
 * Optimize performance action (IMPROVEMENT ACTION)
 *
 * Requires performance benchmark to have been run first.
 */
export const optimizePerformance: GOAPAction = {
  id: 'qg-optimize-performance',
  name: 'Optimize Performance',
  description: 'Profile and optimize critical performance paths',
  agentType: 'qe-performance-tester',
  preconditions: {
    'quality.performanceMeasured': { eq: true }, // Performance must be measured first
    'quality.performanceScore': { lt: 80 },
    'resources.timeRemaining': { gte: 600 }
  },
  effects: {
    'quality.performanceScore': { increase: 20 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 4.0,
  durationEstimate: 600000,  // 10 minutes
  successRate: 0.70,
  executionCount: 0,
  category: 'performance'
};

/**
 * Increase test coverage action (IMPROVEMENT ACTION)
 * Alternative to generateMissingTests
 */
export const increaseTestCoverage: GOAPAction = {
  id: 'qg-increase-coverage',
  name: 'Increase Test Coverage',
  description: 'Target uncovered code paths with new tests',
  agentType: 'qe-coverage-analyzer',
  preconditions: {
    'coverage.measured': { eq: true },           // Coverage must be measured first
    'coverage.line': { lt: 85 },
    'resources.timeRemaining': { gte: 480 }
  },
  effects: {
    'coverage.line': { increase: 12 },
    'coverage.branch': { increase: 8 },
    'resources.timeRemaining': { decrease: 480 }
  },
  cost: 2.8,
  durationEstimate: 480000,  // 8 minutes
  successRate: 0.82,
  executionCount: 0,
  category: 'test'
};

/**
 * Target uncovered branches action (IMPROVEMENT ACTION)
 * Alternative path for branch coverage improvement
 */
export const targetUncoveredBranches: GOAPAction = {
  id: 'qg-target-branches',
  name: 'Target Uncovered Branches',
  description: 'Generate tests specifically for uncovered branches',
  agentType: 'qe-coverage-analyzer',
  preconditions: {
    'coverage.measured': { eq: true },           // Coverage must be measured first
    'coverage.branch': { lt: 75 },
    'resources.timeRemaining': { gte: 400 }
  },
  effects: {
    'coverage.branch': { increase: 12 },
    'coverage.line': { increase: 8 },
    'resources.timeRemaining': { decrease: 400 }
  },
  cost: 2.5,
  durationEstimate: 400000,  // ~7 minutes
  successRate: 0.80,
  executionCount: 0,
  category: 'test'
};

/**
 * Add edge case tests action (IMPROVEMENT ACTION)
 * Thorough coverage boost through edge case testing
 */
export const addEdgeCaseTests: GOAPAction = {
  id: 'qg-edge-case-tests',
  name: 'Add Edge Case Tests',
  description: 'Generate comprehensive edge case tests for boundary conditions',
  agentType: 'qe-test-generator',
  preconditions: {
    'coverage.measured': { eq: true },           // Coverage must be measured first
    'coverage.line': { lt: 90 },
    'resources.timeRemaining': { gte: 600 }
  },
  effects: {
    'coverage.line': { increase: 10 },
    'coverage.branch': { increase: 15 },
    'resources.timeRemaining': { decrease: 600 }
  },
  cost: 3.5,
  durationEstimate: 600000,  // 10 minutes
  successRate: 0.78,
  executionCount: 0,
  category: 'test'
};

/**
 * Profile hot paths action (IMPROVEMENT ACTION)
 * Quick performance analysis with modest improvement
 */
export const profileHotPaths: GOAPAction = {
  id: 'qg-profile-hot-paths',
  name: 'Profile Hot Paths',
  description: 'Analyze and optimize critical code paths',
  agentType: 'qe-performance-tester',
  preconditions: {
    'quality.performanceMeasured': { eq: true }, // Performance must be measured first
    'quality.performanceScore': { lt: 85 },
    'resources.timeRemaining': { gte: 300 }
  },
  effects: {
    'quality.performanceScore': { increase: 12 },
    'resources.timeRemaining': { decrease: 300 }
  },
  cost: 2.2,
  durationEstimate: 300000,  // 5 minutes
  successRate: 0.85,
  executionCount: 0,
  category: 'performance'
};

/**
 * Optimize database queries action (IMPROVEMENT ACTION)
 * Specific performance optimization for data layer
 */
export const optimizeDatabaseQueries: GOAPAction = {
  id: 'qg-optimize-db-queries',
  name: 'Optimize Database Queries',
  description: 'Profile and optimize slow database queries',
  agentType: 'qe-performance-tester',
  preconditions: {
    'quality.performanceMeasured': { eq: true }, // Performance must be measured first
    'quality.performanceScore': { lt: 90 },
    'resources.timeRemaining': { gte: 450 }
  },
  effects: {
    'quality.performanceScore': { increase: 15 },
    'resources.timeRemaining': { decrease: 450 }
  },
  cost: 3.0,
  durationEstimate: 450000,  // 7.5 minutes
  successRate: 0.80,
  executionCount: 0,
  category: 'performance'
};

/**
 * Implement caching optimization action (IMPROVEMENT ACTION)
 * Performance boost through caching strategies
 */
export const implementCaching: GOAPAction = {
  id: 'qg-implement-caching',
  name: 'Implement Caching',
  description: 'Add or optimize caching for frequently accessed data',
  agentType: 'qe-performance-tester',
  preconditions: {
    'quality.performanceMeasured': { eq: true }, // Performance must be measured first
    'quality.performanceScore': { lt: 88 },
    'resources.timeRemaining': { gte: 500 }
  },
  effects: {
    'quality.performanceScore': { increase: 18 },
    'resources.timeRemaining': { decrease: 500 }
  },
  cost: 3.2,
  durationEstimate: 500000,  // ~8 minutes
  successRate: 0.82,
  executionCount: 0,
  category: 'performance'
};

/**
 * Finalize quality gate action (TERMINAL ACTION)
 *
 * This action validates that all quality criteria are met and
 * sets the gate status to 'passed'. It's the terminal action
 * for achieving PASS_QUALITY_GATE goal.
 *
 * Requires gate to have been evaluated first.
 */
export const finalizeQualityGate: GOAPAction = {
  id: 'qg-finalize-gate',
  name: 'Finalize Quality Gate',
  description: 'Validate all quality criteria and mark gate as passed',
  agentType: 'qe-quality-gate',
  preconditions: {
    // Gate must have been evaluated first
    'quality.gateEvaluated': { eq: true },
    // All quality criteria must be met before finalizing
    'quality.testsPassing': { gte: 95 },
    'coverage.line': { gte: 80 },
    'coverage.branch': { gte: 70 },
    'quality.securityScore': { gte: 70 },
    'quality.performanceScore': { gte: 70 }
  },
  effects: {
    'quality.gateStatus': { set: 'passed' }
  },
  cost: 0.1,  // Very low cost - just validation
  durationEstimate: 5000,  // 5 seconds
  successRate: 0.99,
  executionCount: 0,
  category: 'process'
};

/**
 * All quality gate actions
 */
export const qualityGateActions: GOAPAction[] = [
  // Test actions
  runUnitTests,
  runIntegrationTests,
  generateMissingTests,
  fixFailingTests,
  fixFlakyTests,
  runSmokeTests,
  increaseTestCoverage,
  targetUncoveredBranches,
  addEdgeCaseTests,
  refactorBrittleTests,
  // Security actions
  runSecurityScan,
  fixCriticalVulnerabilities,
  fixMediumVulnerabilities,
  fixLowVulnerabilities,
  // Performance actions
  runPerformanceBenchmark,
  optimizePerformance,
  profileHotPaths,
  optimizeDatabaseQueries,
  implementCaching,
  // Analysis actions
  analyzeCodeComplexity,
  // Process actions
  requestGateException,
  evaluateQualityGate,
  finalizeQualityGate
];

/**
 * Get quality gate action by ID
 */
export function getQualityGateAction(id: string): GOAPAction | undefined {
  return qualityGateActions.find(a => a.id === id);
}

/**
 * Get actions by category
 */
export function getQualityGateActionsByCategory(category: GOAPAction['category']): GOAPAction[] {
  return qualityGateActions.filter(a => a.category === category);
}
