/**
 * Deprecated MCP Tools - Phase 3 Migration
 *
 * This file contains deprecation wrappers for tools that were renamed/moved in Phase 3.
 * All wrappers maintain 100% backward compatibility while warning users to migrate.
 *
 * Deprecation Timeline: v3.0.0 (February 2026)
 * Migration Guide: docs/migration/phase3-tools.md
 */

import { z } from 'zod';

// Import new Phase 3 tools
import {
  analyzeWithRiskScoring as analyzeCoverageWithRiskScoring,
  detectGapsML as identifyUncoveredRiskAreas
} from './qe/coverage/index.js';

import {
  detectFlakyTestsStatistical,
  analyzeFlakyTestPatterns,
  stabilizeFlakyTestAuto
} from './qe/flaky-detection/index.js';

import {
  runPerformanceBenchmark,
  monitorPerformanceRealtime as monitorRealtimePerformance
} from './qe/performance/index.js';

// Security domain tools
import {
  securityScanComprehensive,
  validateAuthenticationFlow,
  checkAuthorizationRules,
  scanDependenciesVulnerabilities
} from '../handlers/security/index.js';

// Advanced domain tools (API-Contract, Requirements)
import {
  apiBreakingChanges,
  requirementsValidate,
  requirementsGenerateBDD
} from '../handlers/advanced/index.js';

// Integration domain tools (Contract validation)
import {
  contractValidate
} from '../handlers/integration/index.js';

// Placeholder functions for Phase 3 domains (to be implemented)
// Test-Data domain
async function generateTestData(params: any): Promise<any> {
  throw new Error('generateTestData() not yet implemented. Coming in Phase 3.');
}
async function maskSensitiveData(params: any): Promise<any> {
  throw new Error('maskSensitiveData() not yet implemented. Coming in Phase 3.');
}
async function validateDataSchema(params: any): Promise<any> {
  throw new Error('validateDataSchema() not yet implemented. Coming in Phase 3.');
}

// Code-Quality domain
async function analyzeComplexity(params: any): Promise<any> {
  throw new Error('analyzeComplexity() not yet implemented. Coming in Phase 3.');
}
async function calculateQualityMetrics(params: any): Promise<any> {
  throw new Error('calculateQualityMetrics() not yet implemented. Coming in Phase 3.');
}

// Fleet domain
async function coordinateFleet(params: any): Promise<any> {
  throw new Error('coordinateFleet() not yet implemented. Use fleet-init handler instead.');
}
async function getFleetStatus(params: any): Promise<any> {
  throw new Error('getFleetStatus() not yet implemented. Use fleet-status handler instead.');
}

// Helper for handler-based tools
async function regressionAnalyzeRisk(params: any): Promise<any> {
  throw new Error('regressionAnalyzeRisk() requires manual migration. Use RegressionRiskAnalyzeHandler directly with AgentRegistry and HookExecutor dependencies. See docs/migration/phase3-tools.md');
}
async function selectRegressionTests(params: any): Promise<any> {
  throw new Error('selectRegressionTests() not yet implemented. Coming in Phase 3.');
}
async function generateVersioningMatrix(params: any): Promise<any> {
  throw new Error('generateVersioningMatrix() not yet implemented. Coming in Phase 3.');
}

// Test generation tools - import from individual files
import { generateUnitTests } from '../handlers/test/generate-unit-tests.js';
import { generateIntegrationTests } from '../handlers/test/generate-integration-tests.js';
import { optimizeTestSuite } from '../handlers/test/optimize-test-suite.js';

// Quality gate tools (using handlers - no standalone functions)
import { QualityGateExecuteHandler } from '../handlers/quality/quality-gate-execute.js';
import { QualityRiskAssessHandler } from '../handlers/quality/quality-risk-assess.js';
import { QualityValidateMetricsHandler } from '../handlers/quality/quality-validate-metrics.js';

// Visual regression handler not exported as function - use handler pattern
import type { VisualTestRegressionArgs, VisualRegressionResult } from './qe/visual/index.js';

// ============================================================================
// Deprecation Warning Helper
// ============================================================================

function emitDeprecationWarning(
  oldName: string,
  newName: string,
  domain: string
): void {
  console.warn(
    `\n⚠️  DEPRECATION WARNING\n` +
    `   Tool: ${oldName}()\n` +
    `   Status: Deprecated in v1.5.0\n` +
    `   Removal: v3.0.0 (February 2026)\n` +
    `   Migration: Use ${newName}() from '${domain}' domain\n` +
    `   Guide: docs/migration/phase3-tools.md\n`
  );
}

// ============================================================================
// Coverage Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use analyzeCoverageWithRiskScoring() from 'agentic-qe/tools/qe/coverage' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_coverage_detailed = {
  name: 'test_coverage_detailed',
  description: '[DEPRECATED] Use analyzeCoverageWithRiskScoring() instead. Detailed coverage analysis with risk scoring.',
  schema: z.object({
    source_dirs: z.array(z.string()).optional(),
    test_dirs: z.array(z.string()).optional(),
    framework: z.enum(['jest', 'mocha', 'vitest', 'pytest']).optional(),
    risk_threshold: z.number().min(0).max(1).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_coverage_detailed',
      'analyzeWithRiskScoring',
      'coverage'
    );
    return analyzeCoverageWithRiskScoring(params);
  }
};

/**
 * @deprecated Use identifyUncoveredRiskAreas() from 'agentic-qe/tools/qe/coverage' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_coverage_gaps = {
  name: 'test_coverage_gaps',
  description: '[DEPRECATED] Use identifyUncoveredRiskAreas() instead. Identify uncovered risk areas.',
  schema: z.object({
    source_dirs: z.array(z.string()).optional(),
    coverage_threshold: z.number().min(0).max(100).optional(),
    risk_factors: z.array(z.string()).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_coverage_gaps',
      'detectGapsML',
      'coverage'
    );
    return identifyUncoveredRiskAreas(params);
  }
};

// ============================================================================
// Flaky Detection Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use detectFlakyTestsStatistical() from 'agentic-qe/tools/qe/flaky-detection' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const flaky_test_detect = {
  name: 'flaky_test_detect',
  description: '[DEPRECATED] Use detectFlakyTestsStatistical() instead. Detect flaky tests using statistical analysis.',
  schema: z.object({
    test_results_dir: z.string().optional(),
    runs_threshold: z.number().optional(),
    confidence_level: z.number().min(0).max(1).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'flaky_test_detect',
      'detectFlakyTestsStatistical',
      'flaky-detection'
    );
    return detectFlakyTestsStatistical(params);
  }
};

/**
 * @deprecated Use analyzeFlakyTestPatterns() from 'agentic-qe/tools/qe/flaky-detection' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const flaky_test_patterns = {
  name: 'flaky_test_patterns',
  description: '[DEPRECATED] Use analyzeFlakyTestPatterns() instead. Analyze patterns in flaky test behavior.',
  schema: z.object({
    test_results_dir: z.string().optional(),
    pattern_types: z.array(z.string()).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'flaky_test_patterns',
      'analyzeFlakyTestPatterns',
      'flaky-detection'
    );
    return analyzeFlakyTestPatterns(params);
  }
};

/**
 * @deprecated Use stabilizeFlakyTestAuto() from 'agentic-qe/tools/qe/flaky-detection' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const flaky_test_stabilize = {
  name: 'flaky_test_stabilize',
  description: '[DEPRECATED] Use stabilizeFlakyTestAuto() instead. Auto-stabilize flaky tests with ML-powered fixes.',
  schema: z.object({
    test_file: z.string(),
    flaky_test_name: z.string(),
    stabilization_strategy: z.enum(['retry', 'timeout', 'isolation', 'auto']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'flaky_test_stabilize',
      'stabilizeFlakyTestAuto',
      'flaky-detection'
    );
    return stabilizeFlakyTestAuto(params);
  }
};

// ============================================================================
// Performance Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use runPerformanceBenchmark() from 'agentic-qe/tools/qe/performance' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const performance_benchmark_run = {
  name: 'performance_benchmark_run',
  description: '[DEPRECATED] Use runPerformanceBenchmark() instead. Run comprehensive performance benchmarks.',
  schema: z.object({
    target: z.string().optional(),
    duration: z.number().optional(),
    concurrency: z.number().optional(),
    tool: z.enum(['k6', 'jmeter', 'gatling', 'artillery']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'performance_benchmark_run',
      'runPerformanceBenchmark',
      'performance'
    );
    return runPerformanceBenchmark(params);
  }
};

/**
 * @deprecated Use monitorRealtimePerformance() from 'agentic-qe/tools/qe/performance' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const performance_monitor_realtime = {
  name: 'performance_monitor_realtime',
  description: '[DEPRECATED] Use monitorRealtimePerformance() instead. Monitor performance metrics in real-time.',
  schema: z.object({
    target: z.string().optional(),
    metrics: z.array(z.string()).optional(),
    interval: z.number().optional(),
    duration: z.number().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'performance_monitor_realtime',
      'monitorPerformanceRealtime',
      'performance'
    );
    return monitorRealtimePerformance(params);
  }
};

// ============================================================================
// Security Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use securityScanComprehensive() from 'agentic-qe/handlers/security' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const security_scan_comprehensive = {
  name: 'security_scan_comprehensive',
  description: '[DEPRECATED] Use securityScanComprehensive() instead. Comprehensive multi-layer security scanning.',
  schema: z.object({
    targets: z.array(z.string()),
    scanTypes: z.array(z.enum(['sast', 'dast', 'sca', 'secrets', 'dependencies'])).optional(),
    severity: z.array(z.enum(['critical', 'high', 'medium', 'low'])).optional(),
    includeCompliance: z.boolean().optional(),
    fixSuggestions: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'security_scan_comprehensive',
      'securityScanComprehensive',
      'security'
    );
    return securityScanComprehensive(params);
  }
};

/**
 * @deprecated Use validateAuthenticationFlow() from 'agentic-qe/handlers/security' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const security_validate_auth = {
  name: 'security_validate_auth',
  description: '[DEPRECATED] Use validateAuthenticationFlow() instead. Validate authentication flows and security.',
  schema: z.object({
    endpoints: z.array(z.string()),
    authType: z.enum(['jwt', 'oauth2', 'basic', 'api-key', 'custom']).optional(),
    includeTokenValidation: z.boolean().optional(),
    testNegativeCases: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'security_validate_auth',
      'validateAuthenticationFlow',
      'security'
    );
    return validateAuthenticationFlow(params);
  }
};

/**
 * @deprecated Use checkAuthorizationRules() from 'agentic-qe/handlers/security' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const security_check_authz = {
  name: 'security_check_authz',
  description: '[DEPRECATED] Use checkAuthorizationRules() instead. Check authorization rules and policies.',
  schema: z.object({
    policies: z.array(z.any()),
    testCases: z.array(z.any()).optional(),
    validateRBAC: z.boolean().optional(),
    validateABAC: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'security_check_authz',
      'checkAuthorizationRules',
      'security'
    );
    return checkAuthorizationRules(params);
  }
};

// ============================================================================
// Test Generation Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use generateUnitTests() from 'agentic-qe/handlers/test' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_generate_unit = {
  name: 'test_generate_unit',
  description: '[DEPRECATED] Use generateUnitTests() instead. Generate comprehensive unit test suites.',
  schema: z.object({
    sourceCode: z.string(),
    language: z.enum(['typescript', 'javascript', 'python', 'java', 'go']),
    framework: z.enum(['jest', 'mocha', 'pytest', 'junit', 'testing']),
    coverageGoal: z.number().min(0).max(100).optional(),
    aiEnhanced: z.boolean().optional(),
    includeEdgeCases: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_generate_unit',
      'generateUnitTests',
      'test-generation'
    );
    return generateUnitTests(params);
  }
};

/**
 * @deprecated Use generateIntegrationTests() from 'agentic-qe/handlers/test' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_generate_integration = {
  name: 'test_generate_integration',
  description: '[DEPRECATED] Use generateIntegrationTests() instead. Generate integration test suites.',
  schema: z.object({
    apiSpec: z.string().optional(),
    endpoints: z.array(z.string()).optional(),
    framework: z.enum(['supertest', 'axios', 'pact', 'rest-assured']).optional(),
    includeContractTests: z.boolean().optional(),
    includeDatabaseTests: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_generate_integration',
      'generateIntegrationTests',
      'test-generation'
    );
    return generateIntegrationTests(params);
  }
};

/**
 * @deprecated Use optimizeTestSuite() from 'agentic-qe/handlers/test' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_optimize_suite = {
  name: 'test_optimize_suite',
  description: '[DEPRECATED] Use optimizeTestSuite() instead. Optimize test suites for speed and coverage.',
  schema: z.object({
    testDirectory: z.string(),
    framework: z.enum(['jest', 'mocha', 'vitest', 'pytest']).optional(),
    targetCoverage: z.number().min(0).max(100).optional(),
    removeDuplicates: z.boolean().optional(),
    parallelizeTests: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_optimize_suite',
      'optimizeTestSuite',
      'test-generation'
    );
    return optimizeTestSuite(params);
  }
};

// ============================================================================
// Quality Gates Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use QualityGateExecuteHandler from 'agentic-qe/handlers/quality' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const quality_gate_execute = {
  name: 'quality_gate_execute',
  description: '[DEPRECATED] Use QualityGateExecuteHandler instead. Execute quality gates with policy enforcement.',
  schema: z.object({
    projectId: z.string(),
    buildId: z.string(),
    environment: z.enum(['development', 'staging', 'production']),
    metrics: z.any(),
    policy: z.any().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'quality_gate_execute',
      'QualityGateExecuteHandler',
      'quality-gates'
    );
    throw new Error(
      'Quality gate tools require manual migration. ' +
      'QualityGateExecuteHandler requires AgentRegistry and HookExecutor dependencies. ' +
      'See docs/migration/phase3-tools.md for migration guide.'
    );
  }
};

/**
 * @deprecated Use QualityRiskAssessHandler from 'agentic-qe/handlers/quality' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const quality_assess_risk = {
  name: 'quality_assess_risk',
  description: '[DEPRECATED] Use QualityRiskAssessHandler instead. Assess deployment risk based on quality metrics.',
  schema: z.object({
    changes: z.array(z.any()),
    metrics: z.any(),
    historicalData: z.any().optional(),
    deploymentTarget: z.string().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'quality_assess_risk',
      'QualityRiskAssessHandler',
      'quality-gates'
    );
    throw new Error(
      'Quality gate tools require manual migration. ' +
      'QualityRiskAssessHandler requires AgentRegistry dependency. ' +
      'See docs/migration/phase3-tools.md for migration guide.'
    );
  }
};

/**
 * @deprecated Use QualityValidateMetricsHandler from 'agentic-qe/handlers/quality' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const quality_validate_metrics = {
  name: 'quality_validate_metrics',
  description: '[DEPRECATED] Use QualityValidateMetricsHandler instead. Validate quality metrics against thresholds.',
  schema: z.object({
    metrics: z.any(),
    thresholds: z.any(),
    validateTrends: z.boolean().optional(),
    includeHistorical: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'quality_validate_metrics',
      'QualityValidateMetricsHandler',
      'quality-gates'
    );
    throw new Error(
      'Quality gate tools require manual migration. ' +
      'QualityValidateMetricsHandler requires AgentRegistry dependency. ' +
      'See docs/migration/phase3-tools.md for migration guide.'
    );
  }
};

// ============================================================================
// Visual Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use detectVisualRegression() from 'agentic-qe/tools/qe/visual' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const visual_test_regression = {
  name: 'visual_test_regression',
  description: '[DEPRECATED] Use detectVisualRegression() instead. Visual regression testing with AI-powered comparison.',
  schema: z.object({
    baseline_dir: z.string().optional(),
    current_dir: z.string().optional(),
    threshold: z.number().min(0).max(1).optional(),
    ai_analysis: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'visual_test_regression',
      'detectVisualRegression',
      'visual'
    );
    throw new Error('Visual regression tool needs API wrapper. Use VisualTestRegressionHandler directly or wait for v1.6.0');
  }
};

// ============================================================================
// API-Contract Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use contractValidate() from 'agentic-qe/handlers/integration' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const api_contract_validate = {
  name: 'api_contract_validate',
  description: '[DEPRECATED] Use contractValidate() instead. Validate API contracts between services.',
  schema: z.object({
    providerContract: z.string(),
    consumerContract: z.string(),
    strictMode: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'api_contract_validate',
      'contractValidate',
      'api-contract'
    );
    return contractValidate(params);
  }
};

/**
 * @deprecated Use apiBreakingChanges() from 'agentic-qe/handlers/advanced' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const api_contract_breaking_changes = {
  name: 'api_contract_breaking_changes',
  description: '[DEPRECATED] Use apiBreakingChanges() instead. Detect breaking changes in API contracts.',
  schema: z.object({
    oldAPI: z.string(),
    newAPI: z.string(),
    language: z.enum(['typescript', 'javascript', 'openapi']).optional(),
    calculateSemver: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'api_contract_breaking_changes',
      'apiBreakingChanges',
      'api-contract'
    );
    return apiBreakingChanges(params);
  }
};

/**
 * @deprecated Use generateVersioningMatrix() from 'agentic-qe/handlers/advanced' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const api_contract_versioning = {
  name: 'api_contract_versioning',
  description: '[DEPRECATED] Use generateVersioningMatrix() instead. Generate API versioning compatibility matrix.',
  schema: z.object({
    versions: z.array(z.string()),
    contracts: z.array(z.any()),
    checkBackwardCompatibility: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'api_contract_versioning',
      'generateVersioningMatrix',
      'api-contract'
    );
    return generateVersioningMatrix(params);
  }
};

// ============================================================================
// Test-Data Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use generateTestData() from 'agentic-qe/tools/qe/test-data' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_data_generate = {
  name: 'test_data_generate',
  description: '[DEPRECATED] Use generateTestData() instead. Generate realistic test data.',
  schema: z.object({
    schema: z.any(),
    count: z.number().optional(),
    locale: z.string().optional(),
    seed: z.number().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_data_generate',
      'generateTestData',
      'test-data'
    );
    return generateTestData(params);
  }
};

/**
 * @deprecated Use maskSensitiveData() from 'agentic-qe/tools/qe/test-data' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_data_mask = {
  name: 'test_data_mask',
  description: '[DEPRECATED] Use maskSensitiveData() instead. Mask sensitive data in test datasets.',
  schema: z.object({
    data: z.any(),
    fields: z.array(z.string()).optional(),
    maskingStrategy: z.enum(['redact', 'hash', 'tokenize', 'shuffle']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_data_mask',
      'maskSensitiveData',
      'test-data'
    );
    return maskSensitiveData(params);
  }
};

/**
 * @deprecated Use validateDataSchema() from 'agentic-qe/tools/qe/test-data' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_data_schema = {
  name: 'test_data_schema',
  description: '[DEPRECATED] Use validateDataSchema() instead. Validate test data against schema.',
  schema: z.object({
    data: z.any(),
    schema: z.any(),
    strictMode: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_data_schema',
      'validateDataSchema',
      'test-data'
    );
    return validateDataSchema(params);
  }
};

// ============================================================================
// Regression Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use regressionAnalyzeRisk() from 'agentic-qe/handlers/prediction' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const regression_analyze_risk = {
  name: 'regression_analyze_risk',
  description: '[DEPRECATED] Use regressionAnalyzeRisk() instead. Analyze regression risk for code changes.',
  schema: z.object({
    changedFiles: z.array(z.string()),
    commitHistory: z.array(z.any()).optional(),
    testHistory: z.array(z.any()).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'regression_analyze_risk',
      'regressionAnalyzeRisk',
      'regression'
    );
    return regressionAnalyzeRisk(params);
  }
};

/**
 * @deprecated Use selectRegressionTests() from 'agentic-qe/handlers/prediction' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const regression_select_tests = {
  name: 'regression_select_tests',
  description: '[DEPRECATED] Use selectRegressionTests() instead. Select optimal tests for regression testing.',
  schema: z.object({
    changedFiles: z.array(z.string()),
    testSuite: z.array(z.string()),
    maxTests: z.number().optional(),
    strategy: z.enum(['risk-based', 'coverage-based', 'hybrid']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'regression_select_tests',
      'selectRegressionTests',
      'regression'
    );
    return selectRegressionTests(params);
  }
};

// ============================================================================
// Requirements Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use requirementsValidate() from 'agentic-qe/handlers/advanced' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const requirements_validate = {
  name: 'requirements_validate',
  description: '[DEPRECATED] Use requirementsValidate() instead. Validate requirements for testability.',
  schema: z.object({
    requirements: z.array(z.string()),
    strictMode: z.boolean().optional(),
    generateTestSuggestions: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'requirements_validate',
      'requirementsValidate',
      'requirements'
    );
    return requirementsValidate(params);
  }
};

/**
 * @deprecated Use requirementsGenerateBDD() from 'agentic-qe/handlers/advanced' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const requirements_bdd = {
  name: 'requirements_bdd',
  description: '[DEPRECATED] Use requirementsGenerateBDD() instead. Generate BDD scenarios from requirements.',
  schema: z.object({
    requirement: z.string(),
    format: z.enum(['gherkin', 'cucumber', 'jest-cucumber']).optional(),
    includeEdgeCases: z.boolean().optional(),
    generateTestCode: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'requirements_bdd',
      'requirementsGenerateBDD',
      'requirements'
    );
    return requirementsGenerateBDD(params);
  }
};

// ============================================================================
// Code-Quality Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use analyzeComplexity() from 'agentic-qe/tools/qe/code-quality' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const code_complexity_analyze = {
  name: 'code_complexity_analyze',
  description: '[DEPRECATED] Use analyzeComplexity() instead. Analyze code complexity metrics.',
  schema: z.object({
    sourceFiles: z.array(z.string()),
    metrics: z.array(z.enum(['cyclomatic', 'cognitive', 'halstead', 'maintainability'])).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'code_complexity_analyze',
      'analyzeComplexity',
      'code-quality'
    );
    return analyzeComplexity(params);
  }
};

/**
 * @deprecated Use calculateQualityMetrics() from 'agentic-qe/tools/qe/code-quality' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const code_quality_metrics = {
  name: 'code_quality_metrics',
  description: '[DEPRECATED] Use calculateQualityMetrics() instead. Calculate comprehensive quality metrics.',
  schema: z.object({
    projectPath: z.string(),
    includeTests: z.boolean().optional(),
    thresholds: z.any().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'code_quality_metrics',
      'calculateQualityMetrics',
      'code-quality'
    );
    return calculateQualityMetrics(params);
  }
};

// ============================================================================
// Fleet Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use coordinateFleet() from 'agentic-qe/handlers/fleet' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const fleet_coordinate = {
  name: 'fleet_coordinate',
  description: '[DEPRECATED] Use coordinateFleet() instead. Coordinate multiple agents in a fleet.',
  schema: z.object({
    agents: z.array(z.string()),
    task: z.string(),
    strategy: z.enum(['parallel', 'sequential', 'hierarchical']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'fleet_coordinate',
      'coordinateFleet',
      'fleet'
    );
    return coordinateFleet(params);
  }
};

/**
 * @deprecated Use getFleetStatus() from 'agentic-qe/handlers/fleet' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const fleet_status = {
  name: 'fleet_status',
  description: '[DEPRECATED] Use getFleetStatus() instead. Get status of all agents in the fleet.',
  schema: z.object({
    verbose: z.boolean().optional(),
    agentIds: z.array(z.string()).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'fleet_status',
      'getFleetStatus',
      'fleet'
    );
    return getFleetStatus(params);
  }
};

// ============================================================================
// Export All Deprecated Tools
// ============================================================================

export const deprecatedTools = [
  // Coverage (2 tools)
  test_coverage_detailed,
  test_coverage_gaps,

  // Flaky Detection (3 tools)
  flaky_test_detect,
  flaky_test_patterns,
  flaky_test_stabilize,

  // Performance (2 tools)
  performance_benchmark_run,
  performance_monitor_realtime,

  // Security (3 tools)
  security_scan_comprehensive,
  security_validate_auth,
  security_check_authz,

  // Test Generation (3 tools)
  test_generate_unit,
  test_generate_integration,
  test_optimize_suite,

  // Quality Gates (3 tools)
  quality_gate_execute,
  quality_assess_risk,
  quality_validate_metrics,

  // Visual (1 tool)
  visual_test_regression,

  // API-Contract (3 tools)
  api_contract_validate,
  api_contract_breaking_changes,
  api_contract_versioning,

  // Test-Data (3 tools)
  test_data_generate,
  test_data_mask,
  test_data_schema,

  // Regression (2 tools)
  regression_analyze_risk,
  regression_select_tests,

  // Requirements (2 tools)
  requirements_validate,
  requirements_bdd,

  // Code-Quality (2 tools)
  code_complexity_analyze,
  code_quality_metrics,

  // Fleet (2 tools)
  fleet_coordinate,
  fleet_status
];

/**
 * Get deprecation info for a tool
 */
export function getDeprecationInfo(toolName: string): {
  isDeprecated: boolean;
  newName?: string;
  domain?: string;
  removalVersion?: string;
} {
  const deprecationMap: Record<string, { newName: string; domain: string }> = {
    // Coverage
    'test_coverage_detailed': { newName: 'analyzeCoverageWithRiskScoring', domain: 'coverage' },
    'test_coverage_gaps': { newName: 'identifyUncoveredRiskAreas', domain: 'coverage' },

    // Flaky Detection
    'flaky_test_detect': { newName: 'detectFlakyTestsStatistical', domain: 'flaky-detection' },
    'flaky_test_patterns': { newName: 'analyzeFlakyTestPatterns', domain: 'flaky-detection' },
    'flaky_test_stabilize': { newName: 'stabilizeFlakyTestAuto', domain: 'flaky-detection' },

    // Performance
    'performance_benchmark_run': { newName: 'runPerformanceBenchmark', domain: 'performance' },
    'performance_monitor_realtime': { newName: 'monitorRealtimePerformance', domain: 'performance' },

    // Security
    'security_scan_comprehensive': { newName: 'securityScanComprehensive', domain: 'security' },
    'security_validate_auth': { newName: 'validateAuthenticationFlow', domain: 'security' },
    'security_check_authz': { newName: 'checkAuthorizationRules', domain: 'security' },

    // Test Generation
    'test_generate_unit': { newName: 'generateUnitTests', domain: 'test-generation' },
    'test_generate_integration': { newName: 'generateIntegrationTests', domain: 'test-generation' },
    'test_optimize_suite': { newName: 'optimizeTestSuite', domain: 'test-generation' },

    // Quality Gates
    'quality_gate_execute': { newName: 'QualityGateExecuteHandler', domain: 'quality-gates' },
    'quality_assess_risk': { newName: 'QualityRiskAssessHandler', domain: 'quality-gates' },
    'quality_validate_metrics': { newName: 'QualityValidateMetricsHandler', domain: 'quality-gates' },

    // Visual
    'visual_test_regression': { newName: 'detectVisualRegression', domain: 'visual' },

    // API-Contract
    'api_contract_validate': { newName: 'contractValidate', domain: 'api-contract' },
    'api_contract_breaking_changes': { newName: 'apiBreakingChanges', domain: 'api-contract' },
    'api_contract_versioning': { newName: 'generateVersioningMatrix', domain: 'api-contract' },

    // Test-Data
    'test_data_generate': { newName: 'generateTestData', domain: 'test-data' },
    'test_data_mask': { newName: 'maskSensitiveData', domain: 'test-data' },
    'test_data_schema': { newName: 'validateDataSchema', domain: 'test-data' },

    // Regression
    'regression_analyze_risk': { newName: 'regressionAnalyzeRisk', domain: 'regression' },
    'regression_select_tests': { newName: 'selectRegressionTests', domain: 'regression' },

    // Requirements
    'requirements_validate': { newName: 'requirementsValidate', domain: 'requirements' },
    'requirements_bdd': { newName: 'requirementsGenerateBDD', domain: 'requirements' },

    // Code-Quality
    'code_complexity_analyze': { newName: 'analyzeComplexity', domain: 'code-quality' },
    'code_quality_metrics': { newName: 'calculateQualityMetrics', domain: 'code-quality' },

    // Fleet
    'fleet_coordinate': { newName: 'coordinateFleet', domain: 'fleet' },
    'fleet_status': { newName: 'getFleetStatus', domain: 'fleet' }
  };

  if (toolName in deprecationMap) {
    return {
      isDeprecated: true,
      newName: deprecationMap[toolName].newName,
      domain: deprecationMap[toolName].domain,
      removalVersion: 'v3.0.0 (February 2026)'
    };
  }

  return { isDeprecated: false };
}

/**
 * List all deprecated tools
 */
export function listDeprecatedTools(): Array<{
  oldName: string;
  newName: string;
  domain: string;
  removalVersion: string;
}> {
  return [
    // Coverage (2)
    { oldName: 'test_coverage_detailed', newName: 'analyzeCoverageWithRiskScoring', domain: 'coverage', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'test_coverage_gaps', newName: 'identifyUncoveredRiskAreas', domain: 'coverage', removalVersion: 'v3.0.0 (February 2026)' },

    // Flaky Detection (3)
    { oldName: 'flaky_test_detect', newName: 'detectFlakyTestsStatistical', domain: 'flaky-detection', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'flaky_test_patterns', newName: 'analyzeFlakyTestPatterns', domain: 'flaky-detection', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'flaky_test_stabilize', newName: 'stabilizeFlakyTestAuto', domain: 'flaky-detection', removalVersion: 'v3.0.0 (February 2026)' },

    // Performance (2)
    { oldName: 'performance_benchmark_run', newName: 'runPerformanceBenchmark', domain: 'performance', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'performance_monitor_realtime', newName: 'monitorRealtimePerformance', domain: 'performance', removalVersion: 'v3.0.0 (February 2026)' },

    // Security (3)
    { oldName: 'security_scan_comprehensive', newName: 'securityScanComprehensive', domain: 'security', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'security_validate_auth', newName: 'validateAuthenticationFlow', domain: 'security', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'security_check_authz', newName: 'checkAuthorizationRules', domain: 'security', removalVersion: 'v3.0.0 (February 2026)' },

    // Test Generation (3)
    { oldName: 'test_generate_unit', newName: 'generateUnitTests', domain: 'test-generation', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'test_generate_integration', newName: 'generateIntegrationTests', domain: 'test-generation', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'test_optimize_suite', newName: 'optimizeTestSuite', domain: 'test-generation', removalVersion: 'v3.0.0 (February 2026)' },

    // Quality Gates (3)
    { oldName: 'quality_gate_execute', newName: 'QualityGateExecuteHandler', domain: 'quality-gates', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'quality_assess_risk', newName: 'QualityRiskAssessHandler', domain: 'quality-gates', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'quality_validate_metrics', newName: 'QualityValidateMetricsHandler', domain: 'quality-gates', removalVersion: 'v3.0.0 (February 2026)' },

    // Visual (1)
    { oldName: 'visual_test_regression', newName: 'detectVisualRegression', domain: 'visual', removalVersion: 'v3.0.0 (February 2026)' },

    // API-Contract (3)
    { oldName: 'api_contract_validate', newName: 'contractValidate', domain: 'api-contract', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'api_contract_breaking_changes', newName: 'apiBreakingChanges', domain: 'api-contract', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'api_contract_versioning', newName: 'generateVersioningMatrix', domain: 'api-contract', removalVersion: 'v3.0.0 (February 2026)' },

    // Test-Data (3)
    { oldName: 'test_data_generate', newName: 'generateTestData', domain: 'test-data', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'test_data_mask', newName: 'maskSensitiveData', domain: 'test-data', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'test_data_schema', newName: 'validateDataSchema', domain: 'test-data', removalVersion: 'v3.0.0 (February 2026)' },

    // Regression (2)
    { oldName: 'regression_analyze_risk', newName: 'regressionAnalyzeRisk', domain: 'regression', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'regression_select_tests', newName: 'selectRegressionTests', domain: 'regression', removalVersion: 'v3.0.0 (February 2026)' },

    // Requirements (2)
    { oldName: 'requirements_validate', newName: 'requirementsValidate', domain: 'requirements', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'requirements_bdd', newName: 'requirementsGenerateBDD', domain: 'requirements', removalVersion: 'v3.0.0 (February 2026)' },

    // Code-Quality (2)
    { oldName: 'code_complexity_analyze', newName: 'analyzeComplexity', domain: 'code-quality', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'code_quality_metrics', newName: 'calculateQualityMetrics', domain: 'code-quality', removalVersion: 'v3.0.0 (February 2026)' },

    // Fleet (2)
    { oldName: 'fleet_coordinate', newName: 'coordinateFleet', domain: 'fleet', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'fleet_status', newName: 'getFleetStatus', domain: 'fleet', removalVersion: 'v3.0.0 (February 2026)' }
  ];
}
