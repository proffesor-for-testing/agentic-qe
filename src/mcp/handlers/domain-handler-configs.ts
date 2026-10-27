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
} from './handler-factory';
import { describeSavedResults } from './save-results-option';
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
import type { SecurityScanEvidence } from '../../domains/security-compliance/scan-evidence.js';
import type { SecurityCoverage } from '../../domains/security-compliance/interfaces.js';
import type { DependencyScanReport } from '../../domains/security-compliance/dependency-advisory-engine.js';
import type { ExcludedQualityFile, PartialQualityMetric } from '../../domains/quality-assessment/interfaces.js';
import { CallerInputError } from '../../shared/error-utils.js';

import {
  DEFAULT_FRAMEWORKS,
  FRAMEWORK_TO_LANGUAGE,
  type SupportedLanguage,
  type TestFramework,
} from '../../shared/types/test-frameworks.js';
import {
  buildRiskDecisionFromQualityGate,
  validateRiskDecision,
  type RiskDecision,
} from '../../contracts/verdicts.js';

import {
  INSUFFICIENT_EVIDENCE,
  type EvaluatedQualityCheck,
} from '../../domains/quality-assessment/quality-evidence.js';
import {
  validateRequestedMetrics,
  type MeasuredFailure,
} from '../../domains/quality-assessment/evidence-sufficiency.js';
import { validateBehaviorExamples } from '../../domains/test-generation/services/behavior-example-validation.js';
import { DEFAULT_TEST_RETRY_COUNT } from '../../domains/test-execution/services/retry-outcome.js';

const SUPPORTED_LANGUAGES = Object.keys(DEFAULT_FRAMEWORKS) as SupportedLanguage[];

/**
 * Normalize a language string from MCP input. Returns the canonical
 * SupportedLanguage or null if we don't have a generator for it.
 * Issue #474: previously unsupported languages silently produced JS/vitest.
 */
function normalizeLanguage(input: string | undefined): SupportedLanguage | null {
  if (!input) return 'typescript';
  const lower = input.toLowerCase().trim();
  // Common aliases
  const aliases: Record<string, SupportedLanguage> = {
    ts: 'typescript',
    js: 'javascript',
    py: 'python',
    'c#': 'csharp',
    'c-sharp': 'csharp',
    'cs': 'csharp',
    golang: 'go',
    rs: 'rust',
    kt: 'kotlin',
  };
  if (aliases[lower]) return aliases[lower];
  if ((SUPPORTED_LANGUAGES as string[]).includes(lower)) return lower as SupportedLanguage;
  return null;
}

// ============================================================================
// Result Types (extending base types for handlers that need them)
// ============================================================================

export interface TestExecuteResult {
  taskId: string;
  status: string;
  total: number;
  passed: number;
  failed: number;
  /** #1170: tests that failed and then passed on a retry; counted in `passed`. */
  flaky?: number;
  duration: number;
  /** Measured line coverage of the run, or null when none was collected (#1027 N5). */
  coverage?: number | null;
  workerStats?: Record<string, unknown>;
  retryStats?: Record<string, unknown>;
  /** #1110: per-test entries from the runner report; absent when it listed none. */
  results?: unknown[];
  summary?: Record<string, unknown>;
  learning?: Record<string, unknown>;
  /** #1110: output fields left out because nothing measured them. */
  unmeasured?: string[];
  /** #1110: why each unmeasured field has no value. */
  unmeasuredReasons?: Record<string, string>;
  savedFiles?: string[];
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
}

export interface QualityAssessResult {
  taskId: string;
  status: string;
  /** Static analysis score; omitted for measured gates, which have no aggregate score. */
  qualityScore?: number;
  /** Canonical measured checks, present when runGate is true. */
  checks?: EvaluatedQualityCheck[];
  passed: boolean;
  metrics: Record<string, number>;
  recommendations: string[];
  duration: number;
  savedFiles?: string[];
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
  /** ADR-103: versioned, schema-validated gate verdict (additive) */
  riskDecision?: RiskDecision;
  /**
   * #996 (additive): 'measured' when every requested metric had data;
   * 'insufficient-evidence' when any did not — `passed` is then false and
   * `status` is 'insufficient-evidence'.
   */
  evidenceStatus?: 'measured' | 'insufficient-evidence';
  /** #996: requested metrics with no measured data (reported as -1 in `metrics`). */
  unmeasured?: string[];
  /** #1011: why each unmeasured metric has no value (e.g. a file could not be parsed). */
  unmeasuredReasons?: Record<string, string>;
  /** #1021: metrics measured over part of the scope (files that failed to read or parse are listed). */
  partialMetrics?: PartialQualityMetric[];
  /** #1021: files left out of the analysis (binary, generated, minified, .d.ts, reader policy); first 50. */
  excludedFiles?: ExcludedQualityFile[];
  /** #1021: total number of excluded files. */
  excludedCount?: number;
  /** #1021: the directory, file, or 'sourceFiles' that was analysed. */
  scope?: string;
  /**
   * #1021 round 2b: the metrics `qualityScore` was computed from, present when
   * the score covers only part of the request (insufficient evidence) or of the
   * files (partial metrics). Such a score is not a verdict.
   */
  scoreBasis?: string[];
  /** Why `qualityScore` is -1: the requested metrics that were unmeasured. */
  qualityScoreReason?: string;
  /** The score over the measured metrics (`scoreBasis`) when `qualityScore` is -1. Not a verdict. */
  subsetScore?: number;
  /** #996: measured metrics that fail their own limit; any entry blocks. */
  measuredFailures?: MeasuredFailure[];
  /** #996: false for static analysis (runGate omitted/false) — no quality gate ran. */
  gateEvaluated?: boolean;
  /** #996: share of requested metrics that were measured, in [0, 1]. */
  confidence?: number;
  /** #996: plain statement of what was (and was not) evaluated. */
  note?: string;
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
  findings?: unknown[];
  recommendations: string[];
  duration: number;
  savedFiles?: string[];
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
  informational?: number;
  evidence?: SecurityScanEvidence;
  limitations?: readonly string[];
  coverage?: SecurityCoverage;
  filesScanned?: number;
  jstsFilesScanned?: number;
  otherFilesScanned?: number;
  deepAnalysisPerformed?: boolean;
  analysisDepth?: string;
  scanTypes?: { sast: boolean; dast: boolean; dependencies?: boolean };
  /** #1049: OSV dependency advisory scan; status other than 'complete' is not a clean result. */
  dependencyScan?: DependencyScanReport;
  note?: string;
}

export interface ContractValidateResult {
  taskId: string;
  status: string;
  valid: boolean;
  breakingChanges: string[];
  warnings: string[];
  duration: number;
  savedFiles?: string[];
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
}

export interface AccessibilityTestResult {
  taskId: string;
  status: string;
  passed: boolean;
  score: number;
  violations: unknown[];
  warnings: unknown[];
  /** #1145: false when no page was audited; `passed` is then not a verdict and `score` is -1. */
  measured?: boolean;
  note?: string;
  duration: number;
  savedFiles?: string[];
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
}

export interface ChaosTestResult {
  taskId: string;
  /** #1258: 'not-executed' when no fault was injected, so nothing was observed. */
  status: string;
  faultType: string;
  /** #1258: null when not measured; never a default recovered/dataLoss verdict. */
  resilience: {
    recovered: boolean;
    recoveryTime: number;
    dataLoss: boolean;
  } | null;
  /** Why the fault was not executed, when status is 'not-executed'. */
  note?: string;
  duration: number;
  savedFiles?: string[];
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
}

export interface DefectPredictParams {
  target?: string;
  lookback?: number;
  minConfidence?: number;
  /** #933: write result files under .agentic-qe/results/ (default true). false skips them. */
  saveResults?: boolean;
}

export interface DefectPredictResult {
  filesAnalyzed?: number;
  filesSkipped?: number;
  scanStatus?: 'partial' | 'complete';
  predictionMethod?: 'static-code-indicators';
  estimated?: boolean;
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
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
}

export interface RequirementsValidateParams {
  requirementsPath?: string;
  testPath?: string;
  generateBDD?: boolean;
  /** #933: write result files under .agentic-qe/results/ (default true). false skips them. */
  saveResults?: boolean;
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
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
}

export interface CodeIndexParams {
  target?: string;
  incremental?: boolean;
  gitSince?: string;
  /** #933: write result files under .agentic-qe/results/ (default true). false skips them. */
  saveResults?: boolean;
}

export interface CodeIndexResult {
  taskId: string;
  status: string;
  filesIndexed: number;
  symbolsExtracted: number;
  relationsFound: number;
  duration: number;
  /**
   * #999 MCP-CLI parity: project metrics collected by the code-intelligence
   * coordinator, rooted at the target (as `aqe code index` does). Absent when
   * no project root resolves or the metric step is unavailable.
   */
  projectMetrics?: {
    root: string;
    loc: number;
    locByLanguage: Record<string, number>;
    tests: number;
    toolsUsed: string[];
  };
  /**
   * #1224: non-fatal indexing warnings, e.g. that code search does not cover
   * every indexed file. Absent when there are none.
   */
  warnings?: string[];
  /**
   * #1096: discovered paths that were not indexed (missing, not a regular
   * file, outside the project root, filtered out), with the reason. Absent
   * when every discovered file was indexed.
   */
  skipped?: Array<{ path: string; reason: string }>;
  savedFiles?: string[];
  /** #933: true when result files were written; see savedFiles for their paths. */
  resultsSaved?: boolean;
  /** #933: plain statement of what was (or was not) written to disk. */
  resultsNote?: string;
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

  mapToPayload: (params, routingResult) => {
    // Issue #474: validate language and pick the matching framework instead of
    // silently emitting vitest JS for anything we don't recognize.
    const language = normalizeLanguage(params.language);
    if (language === null) {
      throw new Error(
        `Unsupported language '${params.language}'. Supported languages: ` +
        `${SUPPORTED_LANGUAGES.join(', ')}. ` +
        `Open a feature request for additional language support.`
      );
    }

    // Pick framework: user-provided wins; otherwise derive from language.
    // Reject obvious mismatches (e.g. language=python, framework=vitest).
    let framework: TestFramework;
    if (params.framework) {
      framework = params.framework as TestFramework;
      const fwLang = Object.hasOwn(FRAMEWORK_TO_LANGUAGE, framework) ? FRAMEWORK_TO_LANGUAGE[framework] : undefined; // #1157
      if (fwLang && fwLang !== language) {
        // typescript<->javascript is a soft compatibility — JS frameworks
        // can target both. Treat as same family.
        const isJsFamily = (l: string) => l === 'javascript' || l === 'typescript';
        if (!(isJsFamily(fwLang) && isJsFamily(language))) {
          throw new Error(
            `Framework '${framework}' targets ${fwLang}, but language was '${language}'. ` +
            `Either pick a matching framework or omit \`framework\` to use the default ` +
            `(${DEFAULT_FRAMEWORKS[language]}).`
          );
        }
      }
    } else {
      framework = DEFAULT_FRAMEWORKS[language];
    }

    // #795: validate caller fixtures here, before the task reaches the
    // domain. Throwing from mapToPayload returns a clean tool error without
    // submitting a task, so malformed input cannot trip the domain breaker.
    const behaviorExamples = validateBehaviorExamples(params.behaviorExamples);

    return {
      sourceCode: params.sourceCode,
      behaviorExamples,
      filePath: params.filePath,
      language,
      framework,
      testType: params.testType || 'unit',
      coverageGoal: params.coverageGoal || 80,
      aiEnhancement: params.aiEnhancement !== false,
      detectAntiPatterns: params.detectAntiPatterns || false,
      routingTier: routingResult?.decision.tier,
      useAgentBooster: routingResult?.useAgentBooster,
      compiledContext: routingResult?.compiledContext,
    };
  },

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
      generationMode?: string; generationLimits?: string[];
    }> | undefined;
    const hasRealTests = Array.isArray(domainTests) && domainTests.length > 0
      && domainTests[0].testCode;

    // #567: did the ADR-051 LLM branch actually run? Report it instead of
    // asserting `aiGenerated: true` unconditionally.
    const llmEnhanced = data.llmEnhanced === true;

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
          aiGenerated: llmEnhanced,
          testCode: t.testCode,
          generationMode: t.generationMode,
          generationLimits: t.generationLimits,
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
        predicted: (data.coverageEstimate as number | null | undefined) ?? null,
        // #567: a template scaffold's coverage prediction is a guess, not a
        // 0.9-confidence estimate. Don't dress it up as one.
        confidence: data.coverageEstimate == null ? 0 : llmEnhanced ? 0.9 : 0,
        achievable: data.coverageEstimate == null ? null : true,
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
      coverageEstimate: (data.coverageEstimate as number | null | undefined) ?? null,
      patternsUsed: (data.patternsUsed as string[]) || ['assertion-patterns', 'mock-generation', 'edge-case-detection'],
      duration,
      // #925: state plainly whether result files were written, with their paths.
      ...describeSavedResults(params?.saveResults !== false, savedFiles),
      // #567: propagate the LLM-enhancement signal to the MCP caller.
      llmEnhanced,
      ...(data.generationMode ? { generationMode: data.generationMode as string } : {}),
      ...(data.note ? { note: data.note as string } : {}),
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
    // #1170: the same default as `aqe test execute`.
    retryCount: params.retryCount ?? DEFAULT_TEST_RETRY_COUNT,
    timeout: params.timeout || 60000,
    collectCoverage: params.collectCoverage || false,
    reportFormat: params.reportFormat || 'json',
    routingTier: routingResult?.decision.tier,
    useAgentBooster: routingResult?.useAgentBooster,
    compiledContext: routingResult?.compiledContext,
    // #1247: validated by the execute-tests handler before any runner starts.
    ...(params.projectRoot !== undefined ? { projectRoot: params.projectRoot } : {}),
  }),

  calculateTimeout: (params) => params.timeout || 300000,

  mapToResult: (taskId, data, duration, savedFiles) => {
    const total = (data.total as number) || 0;
    const passed = (data.passed as number) || 0;
    const failed = (data.failed as number) || 0;
    // #1170: tests that passed on a retry; already counted in `passed`.
    const flaky = typeof data.flaky === 'number' && data.flaky > 0 ? data.flaky : undefined;
    // #1027 N5: no measured coverage → null, never a hardcoded 0.
    const coverage = typeof data.coverage === 'number' && Number.isFinite(data.coverage) ? data.coverage : null;

    // #1110: report only what was measured. A figure with no measurement is
    // left out and named in `unmeasured`, never filled with a baseline.
    const unmeasured: string[] = [];
    const unmeasuredReasons: Record<string, string> = {};
    const markUnmeasured = (field: string, reason: string): void => {
      unmeasured.push(field);
      unmeasuredReasons[field] = reason;
    };

    // Per-test results come from the runner's own report, or are left out.
    const testCases = Array.isArray(data.testCases)
      ? data.testCases as Array<{ name: string; file: string; status: string; duration?: number; flaky?: true }>
      : undefined;
    const results = testCases?.map(testCase => ({ id: generateTestId(), ...testCase }));
    if (!results) {
      markUnmeasured('results', 'The test runner report did not list every test case, so per-test results are omitted.');
    }

    // The average test time is the mean of the runner-reported per-test
    // durations. The task's wall time (`duration`) includes runner start-up and
    // skipped tests, so dividing it by `total` would contradict `results`.
    const testDurations = (testCases ?? [])
      .map(testCase => testCase.duration)
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
    const avgTestDuration = testDurations.length > 0
      ? testDurations.reduce((sum, d) => sum + d, 0) / testDurations.length
      : undefined;
    if (avgTestDuration === undefined) {
      const reason = 'The runner reported no per-test durations; the task wall time is in `duration`.';
      markUnmeasured('workerStats.avgExecutionTime', reason);
      markUnmeasured('summary.avgDuration', reason);
    }

    const workerStats: Record<string, unknown> = avgTestDuration !== undefined
      ? { avgExecutionTime: avgTestDuration }
      : {};
    const noWorkerData = 'No worker tasks were recorded by the metrics collector for this process.';
    const workersUsed = MetricsCollector.getWorkersUsed();
    if (workersUsed > 0) workerStats.workersUsed = workersUsed;
    else markUnmeasured('workerStats.workersUsed', noWorkerData);
    const efficiency = MetricsCollector.getWorkerEfficiency();
    if (efficiency !== null) workerStats.efficiency = efficiency;
    else markUnmeasured('workerStats.efficiency', noWorkerData);
    const loadBalance = MetricsCollector.getLoadBalanceScore();
    if (loadBalance !== null) workerStats.loadBalance = loadBalance;
    else markUnmeasured('workerStats.loadBalance', noWorkerData);

    // #1130: retryStats is this run's retry outcome as the domain measured
    // it, in one shape. The metrics collector's retry counters cover every
    // task in the process, not this run, so they are not reported here.
    let retryStats: Record<string, unknown> | undefined;
    if (data.retries && typeof data.retries === 'object') {
      retryStats = { ...(data.retries as Record<string, unknown>) };
    } else {
      markUnmeasured('retryStats', 'The run reported no retry outcome: no retries were requested, or the retry step failed.');
    }

    // No `learning` block: the run's experience is recorded asynchronously by
    // the learning-optimization plugin from TestRunCompleted, so this response
    // cannot name its id or confirm that it was written (#1110).

    return {
      // V2-compatible fields
      workerStats,
      ...(retryStats ? { retryStats } : {}),
      ...(results ? { results } : {}),
      summary: {
        totalTests: total,
        passRate: total > 0 ? (passed / total) * 100 : 0,
        ...(flaky !== undefined ? { flaky } : {}),
        ...(avgTestDuration !== undefined ? { avgDuration: avgTestDuration } : {}),
        ...(efficiency !== null ? { parallelEfficiency: efficiency } : {}),
      },
      ...(unmeasured.length > 0 ? { unmeasured, unmeasuredReasons } : {}),
      // V3 fields
      taskId,
      status: 'completed',
      total,
      passed,
      failed,
      ...(flaky !== undefined ? { flaky } : {}),
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
    compiledContext: routingResult?.compiledContext,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => {
    // The domain returns CoverageReport { summary: { line, branch, function, statement, files }, ... }
    // Map from both nested (domain) and flat (legacy) field shapes.
    const summary = data.summary as { line?: number; branch?: number; function?: number; statement?: number; files?: number } | undefined;
    const totalFiles = summary?.files ?? (data.totalFiles as number) ?? 0;
    const gaps = (data.gaps as unknown[]) || [];

    // #569/ADR-126: an ABSENT provenance flag means "unknown", never "collected".
    //
    // Defaulting these to `true` (`!== false`) meant any producer that supplies
    // no provenance at all — notably the coverage-analysis domain plugin, whose
    // handler returns a nested-`summary` CoverageReport — surfaced the exact
    // impossible pair from the issue: 100% branch coverage alongside 0% function
    // coverage, labelled `measured: true` with `confidence: 0.7` on its gaps.
    // Requiring an explicit `true` makes an unprovenanced result honest (`null`)
    // instead of confidently wrong.
    const branchDataCollected = data.branchDataCollected === true;
    const functionDataCollected = data.functionDataCollected === true;
    const branchCoverage = branchDataCollected
      ? (summary?.branch ?? (data.branchCoverage as number) ?? null)
      : null;
    const functionCoverage = functionDataCollected
      ? (summary?.function ?? (data.functionCoverage as number) ?? null)
      : null;

    // #569: is this a measurement or a static estimate? Everything downstream —
    // gap confidence, AI insights, risk assessment — must be qualified by it.
    const estimated = data.estimated === true;

    // #569/ADR-126: `measured` is NOT the complement of `estimated` — there is a
    // third state where nothing was collected at all. Deriving it as `!estimated`
    // reported an empty project (no sources, no coverage report, nothing run) as
    // `lineCoverage: 0, measured: true` — "we measured 0%" when the truth is "we
    // measured nothing". Trust only an explicit claim from the producer.
    const measured = data.measured === true;

    // Likewise, a `null` line/statement figure must survive as `null`. `?? 0`
    // turns "no data" into a plottable 0%.
    const rawLine = summary?.line ?? (data.lineCoverage as number | null | undefined);
    const lineCoverage = rawLine ?? null;
    const rawStatement = summary?.statement ?? (data.statementCoverage as number | null | undefined);
    // #1027 N7: an explicit null (no statement data, e.g. lcov) stays null.
    const statementCoverage = rawStatement === undefined ? lineCoverage : rawStatement;

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
        // #569: the 0.7 default confidence is only defensible for a gap derived
        // from a real measurement. An estimated gap carries its own low
        // confidence from the handler; a gap with no provenance at all is not
        // known to be measured either, so it gets the cautious value too.
        confidence: (g.confidence as number) ?? (measured ? 0.7 : 0.2),
        estimated: g.estimated === true || estimated,
      };
    }).filter((g): g is NonNullable<typeof g> => g !== null);

    // Use real file data from the analyzer if available, never fabricate file paths
    const coverageByFileData = data.coverageByFile as Array<Record<string, unknown>> | undefined;
    const realCoverageByFile = coverageByFileData
      ? coverageByFileData.map(f => ({
          file: f.file as string,
          lineCoverage: (f.lineCoverage as number) || 0,
          // #569: preserve null (metric not collected) instead of collapsing to 0.
          branchCoverage: (f.branchCoverage as number | null) ?? null,
          functionCoverage: (f.functionCoverage as number | null) ?? null,
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
        recommendations: estimated
          // #569: the reported insights ("Coverage is 15.9% below threshold",
          // "Function coverage is below 70%") were all derived from estimated
          // numbers and presented as findings. Lead with the caveat.
          ? [
              'ESTIMATED RESULT — no instrumentation ran. The figures below are a ' +
              'static guess from source shape, not measured coverage. Do not act on ' +
              'individual gaps without running real instrumentation first.',
              ...((data.recommendations as string[]) || []),
            ]
          : ((data.recommendations as string[]) || [
              'Run tests with coverage enabled to get accurate metrics',
            ]),
        // #569: risk can only be graded off a real number. `null < 70` is
        // `false` in JS, which would have silently graded "no data" as 'low'.
        riskAssessment: (estimated || !measured || lineCoverage === null)
          ? 'unknown'
          : (lineCoverage < 70 ? 'high' : lineCoverage < 85 ? 'medium' : 'low'),
        confidence: estimated ? 0.2 : (measured ? 0.88 : 0),
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
      // #569: provenance travels with the numbers so a caller can never mistake
      // a static estimate for a measurement.
      estimated,
      measured,
      coverageMethod: (data.coverageMethod as string) ?? 'unknown',
      branchDataCollected,
      functionDataCollected,
      ...(data.runStatus === 'passed' || data.runStatus === 'failed' ? { runStatus: data.runStatus as 'passed' | 'failed' } : {}),
      // #995: the target has no measurement at all — distinct from a measured 0%.
      ...(data.unmeasured === true ? { unmeasured: true } : {}),
      // #1154: target files the report does not cover, and a stale report.
      ...(data.evidenceStatus === 'complete' || data.evidenceStatus === 'insufficient-evidence'
        ? { evidenceStatus: data.evidenceStatus as 'complete' | 'insufficient-evidence' } : {}),
      ...(Array.isArray(data.unmeasuredFiles) ? { unmeasuredFiles: data.unmeasuredFiles as string[] } : {}),
      ...(data.staleReport ? { staleReport: data.staleReport as CoverageAnalyzeResult['staleReport'] } : {}),
      ...(data.warning ? { warning: data.warning as string } : {}),
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

  mapToPayload: (params, routingResult) => {
    if (params.runGate !== undefined && typeof params.runGate !== 'boolean') {
      throw new Error('runGate must be a boolean.');
    }
    // #996 (N3): a string or unknown name is a caller error, not a metric list.
    const metrics = params.metrics === undefined
      ? ['coverage', 'complexity', 'maintainability']
      : validateRequestedMetrics(params.metrics);
    // #1021: scope the analysis instead of silently analysing <cwd>/src.
    // Containment in the project root is enforced by the handler.
    // CallerInputError: a caller mistake, never a component failure (round 2b).
    if (params.target !== undefined && (typeof params.target !== 'string' || params.target.trim() === '')) {
      throw new CallerInputError('target must be a non-empty string path.');
    }
    if (params.sourceFiles !== undefined && (!Array.isArray(params.sourceFiles) || params.sourceFiles.length === 0
      || params.sourceFiles.some((f) => typeof f !== 'string' || f.trim() === ''))) {
      throw new CallerInputError('sourceFiles must be a non-empty array of file paths.');
    }
    return {
      runGate: params.runGate ?? false,
      ...(params.target !== undefined ? { target: params.target } : {}),
      ...(params.sourceFiles !== undefined ? { sourceFiles: params.sourceFiles } : {}),
      threshold: params.threshold || 80,
      // #996: only a caller-supplied threshold overrides the configured/default
      // per-metric limits; the 80 fallback above must not.
      thresholdSource: params.threshold === undefined ? 'default' : 'request',
      metrics,
      routingTier: routingResult?.decision.tier,
      useAgentBooster: routingResult?.useAgentBooster,
      compiledContext: routingResult?.compiledContext,
    };
  },

  mapToResult: (taskId, data, duration, savedFiles) => {
    // #996: never approve on missing data. Any unmeasured requested metric
    // forces passed=false and an explicit insufficient-evidence status.
    const unmeasured = Array.isArray(data.unmeasured)
      ? (data.unmeasured as unknown[]).filter((m): m is string => typeof m === 'string')
      : undefined;
    const insufficient = (unmeasured?.length ?? 0) > 0 || data.evidenceStatus === INSUFFICIENT_EVIDENCE;
    const gateEvaluated = typeof data.gateEvaluated === 'boolean' ? data.gateEvaluated : undefined;
    const confidence = typeof data.confidence === 'number' ? data.confidence : undefined;
    const measuredFailures = Array.isArray(data.measuredFailures)
      ? (data.measuredFailures as MeasuredFailure[])
      : undefined;
    const failedMetrics = (measuredFailures ?? []).map((f) => f.metric);
    // #1011: reasons travel only as a string-to-string map.
    const unmeasuredReasons = data.unmeasuredReasons && typeof data.unmeasuredReasons === 'object'
      && Object.values(data.unmeasuredReasons as Record<string, unknown>).every((r) => typeof r === 'string')
      ? data.unmeasuredReasons as Record<string, string>
      : undefined;
    // -1 = no measured score; never quote it as a score.
    const measuredScore = typeof data.qualityScore === 'number' && data.qualityScore >= 0
      ? data.qualityScore
      : undefined;
    const passed = !insufficient && failedMetrics.length === 0 && data.passed === true;
    // ADR-103: attach a schema-validated RiskDecision envelope at the MCP
    // boundary (additive — existing fields unchanged). Omit rather than
    // emit an invalid envelope.
    const riskDecision = buildRiskDecisionFromQualityGate({
      passed: insufficient || failedMetrics.length > 0
        ? false
        : typeof data.passed === 'boolean' ? data.passed : undefined,
      qualityScore: insufficient ? undefined : measuredScore,
      recommendations: (data.recommendations as string[]) || [],
      unmeasured: insufficient ? (unmeasured?.length ? unmeasured : ['unknown']) : [],
      failedMetrics,
      evidenceConfidence: confidence,
      gateEvaluated,
    });
    return {
      taskId,
      status: insufficient ? INSUFFICIENT_EVIDENCE : 'completed',
      // An insufficient-evidence result has no overall score (-1); a number
      // from a producer that did not apply that rule is kept only as a subset.
      ...(typeof data.qualityScore === 'number'
        ? { qualityScore: insufficient && !Array.isArray(data.checks) ? -1 : data.qualityScore } : {}),
      ...(typeof data.qualityScoreReason === 'string' ? { qualityScoreReason: data.qualityScoreReason } : {}),
      ...(typeof data.subsetScore === 'number' ? { subsetScore: data.subsetScore }
        : insufficient && measuredScore !== undefined && !Array.isArray(data.checks) ? { subsetScore: measuredScore } : {}),
      ...(Array.isArray(data.checks) ? { checks: data.checks as EvaluatedQualityCheck[] } : {}),
      passed,
      metrics: (data.metrics as Record<string, number>) || {},
      recommendations: (data.recommendations as string[]) || [],
      ...(data.evidenceStatus === 'measured' || insufficient
        ? { evidenceStatus: insufficient ? INSUFFICIENT_EVIDENCE : 'measured' as const }
        : {}),
      ...(unmeasured ? { unmeasured } : {}),
      ...(unmeasuredReasons ? { unmeasuredReasons } : {}),
      // #1021: partial evidence, exclusions and the analysed scope travel with the verdict.
      ...(Array.isArray(data.partialMetrics) ? { partialMetrics: data.partialMetrics as PartialQualityMetric[] } : {}),
      ...(Array.isArray(data.excludedFiles) ? { excludedFiles: data.excludedFiles as ExcludedQualityFile[] } : {}),
      ...(typeof data.excludedCount === 'number' ? { excludedCount: data.excludedCount } : {}),
      ...(typeof data.scope === 'string' ? { scope: data.scope } : {}),
      ...(Array.isArray(data.scoreBasis) && data.scoreBasis.every((m) => typeof m === 'string')
        ? { scoreBasis: data.scoreBasis as string[] } : {}),
      ...(measuredFailures ? { measuredFailures } : {}),
      ...(gateEvaluated !== undefined ? { gateEvaluated } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(typeof data.note === 'string' ? { note: data.note } : {}),
      duration,
      savedFiles,
      ...(validateRiskDecision(riskDecision).valid ? { riskDecision } : {}),
    };
  },
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
    if (params.dependencies) scanTypes.push('dependency advisories');
    return `Security scan (${scanTypes.join(', ')}) for ${params.target || 'project'}`;
  },

  mapToPayload: (params, routingResult) => {
    for (const name of ['sast', 'dast', 'dependencies'] as const) {
      if (params[name] !== undefined && typeof params[name] !== 'boolean') {
        throw new Error(`${name} must be a boolean`);
      }
    }
    return {
      sast: params.sast !== false,
      dast: params.dast || false,
      dependencies: params.dependencies === true,
      compliance: params.compliance || [],
      target: params.target || '.',
      targetUrl: params.targetUrl,
      routingTier: routingResult?.decision.tier,
      useAgentBooster: routingResult?.useAgentBooster,
      compiledContext: routingResult?.compiledContext,
    };
  },

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    // Legacy task results without receipts cannot establish scan completeness.
    status: (data.evidence as SecurityScanEvidence | undefined)?.completeness === 'complete' ? 'completed'
      : (data.evidence as SecurityScanEvidence | undefined)?.completeness === 'partial' ? 'partial'
      : data.evidence ? 'unavailable' : 'unverified',
    vulnerabilities: (data.vulnerabilities as number) || 0,
    critical: (data.critical as number) || 0,
    high: (data.high as number) || 0,
    medium: (data.medium as number) || 0,
    low: (data.low as number) || 0,
    informational: (data.informational as number) || 0,
    topVulnerabilities: (data.topVulnerabilities as unknown[]) || [],
    findings: data.findings as unknown[] | undefined,
    recommendations: (data.recommendations as string[]) || [],
    evidence: data.evidence as SecurityScanEvidence | undefined,
    limitations: (data.limitations as string[]) || ['Execution receipts unavailable; scan completeness is unverified.'],
    ...(data.evidence ? {
      filesScanned: data.filesScanned as number | undefined,
      jstsFilesScanned: data.jstsFilesScanned as number | undefined,
      otherFilesScanned: data.otherFilesScanned as number | undefined,
      coverage: data.coverage as SecurityCoverage | undefined,
    } : {}),
    deepAnalysisPerformed: Boolean(data.evidence && data.deepAnalysisPerformed === true),
    analysisDepth: data.analysisDepth as string | undefined,
    scanTypes: data.scanTypes as SecurityScanResult['scanTypes'],
    ...(data.dependencyScan ? { dependencyScan: data.dependencyScan as DependencyScanReport } : {}),
    note: data.note as string | undefined,
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
    compiledContext: routingResult?.compiledContext,
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
    compiledContext: routingResult?.compiledContext,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: data.measured === true ? 'completed' : 'not-measured',
    passed: (data.passed as boolean) || false,
    // #1145: an unmeasured score is -1, never a 0/100 grade
    score: data.measured === true && typeof data.score === 'number' ? data.score : -1,
    violations: (data.violations as unknown[]) || [],
    warnings: (data.warnings as unknown[]) || [],
    // #1145: fail closed; only an explicit measurement counts as one
    measured: data.measured === true,
    ...(typeof data.note === 'string' ? { note: data.note } : {}),
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
    compiledContext: routingResult?.compiledContext,
  }),

  calculateTimeout: (params) => (params.duration || 30000) + 60000,

  mapToResult: (taskId, data, duration, savedFiles) => {
    // #1258: the run-chaos handler injects nothing and says so (systemBehavior
    // 'not-executed', resilience null). Report that instead of 'completed' with
    // a made-up recovered/dataLoss result.
    const resilience = (data.resilience as ChaosTestResult['resilience']) ?? null;
    const executed = data.systemBehavior !== 'not-executed' && resilience !== null;
    return {
      taskId,
      status: executed ? 'completed' : 'not-executed',
      faultType: (data.faultType as string) || 'latency',
      resilience: executed ? resilience : null,
      ...(typeof data.note === 'string' ? { note: data.note } : {}),
      duration,
      savedFiles,
    };
  },
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
    compiledContext: routingResult?.compiledContext,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    ...(data.predictionMethod === 'static-code-indicators' ? {
      predictionMethod: 'static-code-indicators', estimated: true,
      filesAnalyzed: data.filesAnalyzed as number, filesSkipped: data.filesSkipped as number,
      scanStatus: data.scanStatus as 'partial' | 'complete',
    } : {}),
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
    compiledContext: routingResult?.compiledContext,
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
    compiledContext: routingResult?.compiledContext,
  }),

  mapToResult: (taskId, data, duration, savedFiles) => ({
    taskId,
    status: 'completed',
    filesIndexed: (data.filesIndexed as number) || 0,
    symbolsExtracted: (data.symbolsExtracted as number) || 0,
    relationsFound: (data.relationsFound as number) || 0,
    ...(data.projectMetrics ? { projectMetrics: data.projectMetrics as CodeIndexResult['projectMetrics'] } : {}),
    ...(Array.isArray(data.warnings) && data.warnings.length > 0
      ? { warnings: data.warnings as string[] }
      : {}),
    ...(Array.isArray(data.skipped) && data.skipped.length > 0
      ? { skipped: data.skipped as CodeIndexResult['skipped'] }
      : {}),
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
