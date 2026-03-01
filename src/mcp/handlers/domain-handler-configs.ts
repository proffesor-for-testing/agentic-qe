/**
 * Agentic QE v3 - Domain Handler Configurations
 *
 * Domain-specific configurations for the handler factory.
 * Each configuration defines how to handle a specific domain's tasks.
 *
 * @module mcp/handlers/domain-handler-configs
 */

import {
  DomainHandlerConfig,
  generateV2LearningFeedback,
  analyzeComplexity,
  generateV2AIInsights,
  generateV2Tests,
  detectAntiPatterns,
  generateTestId,
  V2LearningFeedback,
} from './handler-factory';
import {
  TestGenerateParams,
  TestGenerateResult,
  TestExecuteParams,
  CoverageAnalyzeParams,
  CoverageAnalyzeResult,
  QualityAssessParams,
  SecurityScanParams,
  ContractValidateParams,
  AccessibilityTestParams,
  ChaosTestParams,
} from '../types';
import { MetricsCollector } from '../metrics';

// ============================================================================
// Result Types (extending base types for handlers that need them)
// ============================================================================

export interface TestExecuteResult {
  taskId: string;
  status: string;
  total: number;
  passed: number;
  failed: number;
  duration: number;
  coverage?: number;
  workerStats?: Record<string, unknown>;
  retryStats?: Record<string, unknown>;
  results?: unknown[];
  summary?: Record<string, unknown>;
  learning?: Record<string, unknown>;
  savedFiles?: string[];
}

export interface QualityAssessResult {
  taskId: string;
  status: string;
  qualityScore: number;
  passed: boolean;
  metrics: Record<string, number>;
  recommendations: string[];
  duration: number;
  savedFiles?: string[];
}

export interface SecurityScanResult {
  taskId: string;
  status: string;
  vulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  topVulnerabilities: unknown[];
  recommendations: string[];
  duration: number;
  savedFiles?: string[];
}

export interface ContractValidateResult {
  taskId: string;
  status: string;
  valid: boolean;
  breakingChanges: string[];
  warnings: string[];
  duration: number;
  savedFiles?: string[];
}

export interface AccessibilityTestResult {
  taskId: string;
  status: string;
  passed: boolean;
  score: number;
  violations: unknown[];
  warnings: unknown[];
  duration: number;
  savedFiles?: string[];
}

export interface ChaosTestResult {
  taskId: string;
  status: string;
  faultType: string;
  resilience: {
    recovered: boolean;
    recoveryTime: number;
    dataLoss: boolean;
  };
  duration: number;
  savedFiles?: string[];
}

export interface DefectPredictParams {
  target?: string;
  lookback?: number;
  minConfidence?: number;
}

export interface DefectPredictResult {
  taskId: string;
  status: string;
  predictedDefects: Array<{
    file: string;
    probability: number;
    reason: string;
  }>;
  riskScore: number;
  recommendations: string[];
  duration: number;
  savedFiles?: string[];
}

export interface RequirementsValidateParams {
  requirementsPath?: string;
  testPath?: string;
  generateBDD?: boolean;
}

export interface RequirementsValidateResult {
  taskId: string;
  status: string;
  requirementsAnalyzed: number;
  testable: number;
  coverage: number;
  bddScenarios: string[];
  duration: number;
  savedFiles?: string[];
}

export interface CodeIndexParams {
  target?: string;
  incremental?: boolean;
  gitSince?: string;
}

export interface CodeIndexResult {
  taskId: string;
  status: string;
  filesIndexed: number;
  symbolsExtracted: number;
  relationsFound: number;
  duration: number;
  savedFiles?: string[];
}

// ============================================================================
// Test Generation Configuration
// ============================================================================

export const testGenerateConfig: DomainHandlerConfig<TestGenerateParams, TestGenerateResult> = {
  domain: 'test-generation',
  taskType: 'generate-tests',
  priority: 'p1',
  defaultTimeout: 120000,

  buildTaskDescription: (params) =>
    `Generate ${params.testType || 'unit'} tests for ${params.language || 'typescript'} code`,

  includeCodeContext: (params) => params.sourceCode,

  mapToPayload: (params, routingResult) => ({
    sourceCode: params.sourceCode,
    filePath: params.filePath,
    language: params.language || 'typescript',
    framework: params.framework || 'vitest',
    testType: params.testType || 'unit',
    coverageGoal: params.coverageGoal || 80,
    aiEnhancement: params.aiEnhancement !== false,
    detectAntiPatterns: params.detectAntiPatterns || false,
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles, params) => {
    const sourceCode = params?.sourceCode || '';
    const language = params?.language || 'typescript';
    const testType = params?.testType || 'unit';
    const testsCount = (data.testsGenerated as number) || 6;

    const complexity = analyzeComplexity(sourceCode);
    const aiInsights = params?.aiEnhancement !== false
      ? generateV2AIInsights(complexity, testType)
      : { recommendations: [], estimatedTime: '0 minutes', confidence: 0 };
    const antiPatterns = params?.detectAntiPatterns
      ? detectAntiPatterns(sourceCode, language)
      : [];
    const learning = generateV2LearningFeedback('test-generator');

    // Use real tests from domain service when available, fall back to V2 stubs
    const domainTests = data.tests as Array<{
      name: string; file?: string; testFile?: string; type: string;
      sourceFile?: string; assertions?: number; testCode?: string;
    }> | undefined;
    const hasRealTests = Array.isArray(domainTests) && domainTests.length > 0
      && domainTests[0].testCode;

    const tests = hasRealTests
      ? domainTests!.map((t, i) => ({
          id: generateTestId(),
          name: t.name || `test_${i}`,
          type: t.type || testType,
          parameters: [],
          assertions: t.testCode
            ? extractAssertionsFromCode(t.testCode)
            : [`test assertion ${i}`],
          expectedResult: null,
          estimatedDuration: t.type === 'integration' ? 2000 : 1000,
          aiGenerated: true,
          testCode: t.testCode,
          sourceFile: t.sourceFile,
          testFile: t.testFile || t.file,
        }))
      : generateV2Tests(sourceCode, testType, language, testsCount);

    return {
      // V2-compatible fields
      tests,
      antiPatterns,
      suggestions: antiPatterns.map(ap => `Fix: ${ap.type} - ${ap.suggestion}`),
      aiInsights,
      coverage: {
        predicted: (data.coverageEstimate as number) || params?.coverageGoal || 80,
        confidence: 0.9,
        achievable: true,
      },
      properties: tests.filter(t => t.type === 'property').map(t => ({
        name: t.name,
        invariant: 'output_matches_expectation'
      })),
      language,
      complexity,
      learning,
      // V3 fields
      taskId,
      status: 'completed',
      testsGenerated: tests.length,
      coverageEstimate: (data.coverageEstimate as number) || params?.coverageGoal || 80,
      patternsUsed: (data.patternsUsed as string[]) || ['assertion-patterns', 'mock-generation', 'edge-case-detection'],
      duration,
      savedFiles,
    };
  },
};

// ============================================================================
// Test Execution Configuration
// ============================================================================

export const testExecuteConfig: DomainHandlerConfig<TestExecuteParams, TestExecuteResult> = {
  domain: 'test-execution',
  taskType: 'execute-tests',
  priority: 'p1',
  defaultTimeout: 300000,

  buildTaskDescription: (params) =>
    `Execute ${params.testFiles?.length || 0} test files with ${params.parallel !== false ? 'parallel' : 'sequential'} execution`,

  mapToPayload: (params, routingResult) => ({
    testFiles: params.testFiles || [],
    testSuites: params.testSuites || [],
    parallel: params.parallel !== false,
    parallelism: params.parallelism || 4,
    retryCount: params.retryCount || 3,
    timeout: params.timeout || 60000,
    collectCoverage: params.collectCoverage || false,
    reportFormat: params.reportFormat || 'json',
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  calculateTimeout: (params) => params.timeout || 300000,

  mapToResult: (taskId, data, duration, savedFiles, params) => {
    const total = (data.total as number) || 0;
    const passed = (data.passed as number) || 0;
    const failed = (data.failed as number) || 0;
    const coverage = data.coverage as number | undefined;

    const parallelism = params?.parallelism || 4;
    const realRetryStats = MetricsCollector.getRetryStats();
    const workersUsed = MetricsCollector.getWorkersUsed();

    const workerStats = {
      workersUsed: workersUsed > 0 ? workersUsed : Math.min(parallelism, total || 1),
      efficiency: MetricsCollector.getWorkerEfficiency(),
      loadBalance: MetricsCollector.getLoadBalanceScore(),
      avgExecutionTime: duration / Math.max(total, 1),
    };

    const retryStats = {
      totalRetries: realRetryStats.totalRetries,
      successfulRetries: realRetryStats.successfulRetries,
      maxRetriesReached: realRetryStats.maxRetriesReached,
    };

    const learning = generateV2LearningFeedback('test-executor');

    return {
      // V2-compatible fields
      workerStats,
      retryStats,
      results: (() => {
        const testDurations = MetricsCollector.getTestDurations(total);
        return Array.from({ length: total }, (_, i) => ({
          id: generateTestId(),
          name: `test_case_${i}`,
          status: i < passed ? 'passed' : 'failed',
          duration: testDurations[i] || 200,
          retries: 0,
        }));
      })(),
      summary: {
        totalTests: total,
        passRate: total > 0 ? (passed / total) * 100 : 0,
        avgDuration: duration / Math.max(total, 1),
        parallelEfficiency: workerStats.efficiency,
      },
      learning,
      // V3 fields
      taskId,
      status: 'completed',
      total,
      passed,
      failed,
      duration,
      coverage,
      savedFiles,
    };
  },
};

// ============================================================================
// Coverage Analysis Configuration
// ============================================================================

export const coverageAnalyzeConfig: DomainHandlerConfig<CoverageAnalyzeParams, CoverageAnalyzeResult> = {
  domain: 'coverage-analysis',
  taskType: 'analyze-coverage',
  priority: 'p1',
  defaultTimeout: 180000,

  buildTaskDescription: (params) =>
    `Analyze coverage for ${params.target || 'project'} with gap detection`,

  mapToPayload: (params, routingResult) => ({
    target: params.target || '.',
    includeRisk: params.includeRisk || false,
    detectGaps: params.detectGaps !== false,
    mlPowered: params.mlPowered || false,
    prioritization: params.prioritization || 'complexity',
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => {
    // The domain returns CoverageReport { summary: { line, branch, function, statement, files }, ... }
    // Map from both nested (domain) and flat (legacy) field shapes.
    const summary = data.summary as { line?: number; branch?: number; function?: number; statement?: number; files?: number } | undefined;
    const lineCoverage = summary?.line ?? (data.lineCoverage as number) ?? 0;
    const branchCoverage = summary?.branch ?? (data.branchCoverage as number) ?? 0;
    const functionCoverage = summary?.function ?? (data.functionCoverage as number) ?? 0;
    const statementCoverage = summary?.statement ?? (data.statementCoverage as number) ?? lineCoverage;
    const totalFiles = summary?.files ?? (data.totalFiles as number) ?? 0;
    const gaps = (data.gaps as unknown[]) || [];

    const learning = generateV2LearningFeedback('coverage-analyzer');

    // Map gap analysis from real data — never fabricate file paths
    const detailedGaps = gaps.map((gap: unknown, i: number) => {
      const g = gap as Record<string, unknown>;
      // Only include gaps that have real file paths from the analyzer
      if (!g?.file) return null;
      return {
        id: `gap-${Date.now()}-${i}`,
        file: g.file as string,
        line: ((g.lines as number[])?.[0]) || 0,
        uncoveredLines: (g.lines as number[]) || [],
        type: ((g.type as string) || 'uncovered-line') as 'uncovered-line' | 'uncovered-branch' | 'uncovered-function',
        severity: ((g.severity as string) || 'medium') as 'critical' | 'high' | 'medium' | 'low',
        reason: (g.reason as string) || 'Missing test case',
        priority: (g.priority as string) || 'medium',
        suggestion: (g.suggestedTest as string) || 'Add test coverage',
        suggestedTest: (g.suggestedTest as string) || 'Add test coverage',
        riskScore: (g.riskScore as number) || 0.5,
        confidence: (g.confidence as number) || 0.7,
      };
    }).filter((g): g is NonNullable<typeof g> => g !== null);

    // Use real file data from the analyzer if available, never fabricate file paths
    const coverageByFileData = data.coverageByFile as Array<Record<string, unknown>> | undefined;
    const realCoverageByFile = coverageByFileData
      ? coverageByFileData.map(f => ({
          file: f.file as string,
          lineCoverage: (f.lineCoverage as number) || 0,
          branchCoverage: (f.branchCoverage as number) || 0,
          functionCoverage: (f.functionCoverage as number) || 0,
        }))
      : [];

    return {
      // V2-compatible fields — only real data, no synthetic file paths
      coverageByFile: realCoverageByFile,
      gapAnalysis: {
        totalGaps: detailedGaps.length,
        highPriority: detailedGaps.filter(g => g.priority === 'high').length,
        gaps: detailedGaps,
      },
      trends: {
        lineCoverageTrend: totalFiles > 0 ? 'stable' : 'no-data',
        branchCoverageTrend: totalFiles > 0 ? 'stable' : 'no-data',
        weeklyChange: 0,
      },
      aiInsights: totalFiles > 0 ? {
        recommendations: (data.recommendations as string[]) || [
          'Run tests with coverage enabled to get accurate metrics',
        ],
        riskAssessment: lineCoverage < 70 ? 'high' : lineCoverage < 85 ? 'medium' : 'low',
        confidence: 0.88,
      } : {
        recommendations: [
          'No coverage data found. Run tests with coverage first (e.g., npm test -- --coverage, or pytest --cov)',
        ],
        riskAssessment: 'unknown',
        confidence: 0,
      },
      learning,
      // V3 fields
      taskId,
      status: 'completed',
      lineCoverage,
      branchCoverage,
      functionCoverage,
      statementCoverage,
      totalFiles,
      gaps: detailedGaps,
      duration,
      savedFiles,
    };
  },
};

// ============================================================================
// Quality Assessment Configuration
// ============================================================================

export const qualityAssessConfig: DomainHandlerConfig<QualityAssessParams, QualityAssessResult> = {
  domain: 'quality-assessment',
  taskType: 'assess-quality',
  priority: 'p0',
  defaultTimeout: 180000,

  buildTaskDescription: (params) =>
    `Assess quality with ${params.runGate ? 'quality gate' : 'metrics analysis'}`,

  mapToPayload: (params, routingResult) => ({
    runGate: params.runGate || false,
    threshold: params.threshold || 80,
    metrics: params.metrics || ['coverage', 'complexity', 'maintainability'],
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    qualityScore: (data.qualityScore as number) || 0,
    passed: (data.passed as boolean) || false,
    metrics: (data.metrics as Record<string, number>) || {},
    recommendations: (data.recommendations as string[]) || [],
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Security Scan Configuration
// ============================================================================

export const securityScanConfig: DomainHandlerConfig<SecurityScanParams, SecurityScanResult> = {
  domain: 'security-compliance',
  taskType: 'scan-security',
  priority: 'p0',
  defaultTimeout: 600000,

  buildTaskDescription: (params) => {
    const scanTypes: string[] = [];
    if (params.sast !== false) scanTypes.push('SAST');
    if (params.dast) scanTypes.push('DAST');
    return `Security scan (${scanTypes.join(', ')}) for ${params.target || 'project'}`;
  },

  mapToPayload: (params, routingResult) => ({
    sast: params.sast !== false,
    dast: params.dast || false,
    compliance: params.compliance || [],
    target: params.target || '.',
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    vulnerabilities: (data.vulnerabilities as number) || 0,
    critical: (data.critical as number) || 0,
    high: (data.high as number) || 0,
    medium: (data.medium as number) || 0,
    low: (data.low as number) || 0,
    topVulnerabilities: (data.topVulnerabilities as unknown[]) || [],
    recommendations: (data.recommendations as string[]) || [],
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Contract Validation Configuration
// ============================================================================

export const contractValidateConfig: DomainHandlerConfig<ContractValidateParams, ContractValidateResult> = {
  domain: 'contract-testing',
  taskType: 'validate-contracts',
  priority: 'p1',
  defaultTimeout: 180000,

  buildTaskDescription: (params) =>
    `Validate API contract at ${params.contractPath}`,

  mapToPayload: (params, routingResult) => ({
    contractPath: params.contractPath,
    providerUrl: params.providerUrl,
    consumerName: params.consumerName,
    checkBreakingChanges: params.checkBreakingChanges !== false,
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    valid: (data.valid as boolean) || false,
    breakingChanges: (data.breakingChanges as string[]) || [],
    warnings: (data.warnings as string[]) || [],
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Accessibility Test Configuration
// ============================================================================

export const accessibilityTestConfig: DomainHandlerConfig<AccessibilityTestParams, AccessibilityTestResult> = {
  domain: 'visual-accessibility',
  taskType: 'test-accessibility',
  priority: 'p1',
  defaultTimeout: 180000,

  buildTaskDescription: (params) =>
    `Test accessibility for ${params.url} against ${params.standard || 'WCAG 2.1 AA'} standard`,

  mapToPayload: (params, routingResult) => ({
    url: params.url,
    standard: params.standard || 'wcag21-aa',
    includeScreenReader: params.includeScreenReader || false,
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    passed: (data.passed as boolean) || false,
    score: (data.score as number) || 0,
    violations: (data.violations as unknown[]) || [],
    warnings: (data.warnings as unknown[]) || [],
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Chaos Test Configuration
// ============================================================================

export const chaosTestConfig: DomainHandlerConfig<ChaosTestParams, ChaosTestResult> = {
  domain: 'chaos-resilience',
  taskType: 'run-chaos',
  priority: 'p2',
  defaultTimeout: 90000,

  buildTaskDescription: (params) =>
    `Run chaos test with ${params.faultType || 'latency'} fault injection on ${params.target}`,

  mapToPayload: (params, routingResult) => ({
    faultType: params.faultType || 'latency',
    target: params.target,
    duration: params.duration || 30000,
    intensity: params.intensity || 50,
    dryRun: params.dryRun !== false,
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  calculateTimeout: (params) => (params.duration || 30000) + 60000,

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    faultType: (data.faultType as string) || 'latency',
    resilience: (data.resilience as { recovered: boolean; recoveryTime: number; dataLoss: boolean }) || {
      recovered: false,
      recoveryTime: 0,
      dataLoss: false,
    },
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Defect Prediction Configuration
// ============================================================================

export const defectPredictConfig: DomainHandlerConfig<DefectPredictParams, DefectPredictResult> = {
  domain: 'defect-intelligence',
  taskType: 'predict-defects',
  priority: 'p1',
  defaultTimeout: 180000,

  buildTaskDescription: (params) =>
    `Predict defects in ${params.target || 'codebase'} with ${params.lookback || 30} day lookback`,

  mapToPayload: (params, routingResult) => ({
    target: params.target || '.',
    lookback: params.lookback || 30,
    minConfidence: params.minConfidence || 0.7,
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    predictedDefects: (data.predictedDefects as Array<{ file: string; probability: number; reason: string }>) || [],
    riskScore: (data.riskScore as number) || 0,
    recommendations: (data.recommendations as string[]) || [],
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Requirements Validation Configuration
// ============================================================================

export const requirementsValidateConfig: DomainHandlerConfig<RequirementsValidateParams, RequirementsValidateResult> = {
  domain: 'requirements-validation',
  taskType: 'validate-requirements',
  priority: 'p1',
  defaultTimeout: 180000,

  buildTaskDescription: (params) =>
    `Validate requirements${params.generateBDD ? ' and generate BDD scenarios' : ''}`,

  mapToPayload: (params, routingResult) => ({
    requirementsPath: params.requirementsPath,
    testPath: params.testPath,
    generateBDD: params.generateBDD || false,
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    requirementsAnalyzed: (data.requirementsAnalyzed as number) || 0,
    testable: (data.testable as number) || 0,
    coverage: (data.coverage as number) || 0,
    bddScenarios: (data.bddScenarios as string[]) || [],
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Code Index Configuration
// ============================================================================

export const codeIndexConfig: DomainHandlerConfig<CodeIndexParams, CodeIndexResult> = {
  domain: 'code-intelligence',
  taskType: 'index-code',
  priority: 'p2',
  defaultTimeout: 300000,

  buildTaskDescription: (params) =>
    `Index code in ${params.target || 'codebase'}${params.incremental ? ' incrementally' : ''}`,

  mapToPayload: (params, routingResult) => ({
    target: params.target || '.',
    incremental: params.incremental || false,
    gitSince: params.gitSince,
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    filesIndexed: (data.filesIndexed as number) || 0,
    symbolsExtracted: (data.symbolsExtracted as number) || 0,
    relationsFound: (data.relationsFound as number) || 0,
    duration,
    savedFiles,
  }),
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract human-readable assertion descriptions from generated test code.
 * Looks for expect(), assert(), it(), test() patterns in the test source.
 */
function extractAssertionsFromCode(testCode: string): string[] {
  const assertions: string[] = [];
  const lines = testCode.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match expect(...).toBe/toEqual/toThrow patterns
    const expectMatch = trimmed.match(/expect\((.+?)\)\.(to\w+)\((.+?)\)/);
    if (expectMatch) {
      assertions.push(`expect(${expectMatch[1]}).${expectMatch[2]}(${expectMatch[3]})`);
      continue;
    }
    // Match assert patterns
    const assertMatch = trimmed.match(/assert\w*\((.+)\)/);
    if (assertMatch) {
      assertions.push(assertMatch[0]);
      continue;
    }
    // Match it()/test() descriptions
    const itMatch = trimmed.match(/(?:it|test)\s*\(\s*['"`](.+?)['"`]/);
    if (itMatch) {
      assertions.push(itMatch[1]);
    }
  }

  return assertions.length > 0 ? assertions : ['test generated from source analysis'];
}

// ============================================================================
// All Configurations Export
// ============================================================================

export const domainHandlerConfigs = {
  testGenerate: testGenerateConfig,
  testExecute: testExecuteConfig,
  coverageAnalyze: coverageAnalyzeConfig,
  qualityAssess: qualityAssessConfig,
  securityScan: securityScanConfig,
  contractValidate: contractValidateConfig,
  accessibilityTest: accessibilityTestConfig,
  chaosTest: chaosTestConfig,
  defectPredict: defectPredictConfig,
  requirementsValidate: requirementsValidateConfig,
  codeIndex: codeIndexConfig,
};
