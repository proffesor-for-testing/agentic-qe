/**
 * Agentic QE v3 - Domain MCP Handlers
 * Domain-specific tool handlers that execute tasks and return real V2-compatible results
 *
 * Enhanced in ADR-037 to return V2-level detail including:
 * - Individual test objects with IDs, assertions, durations
 * - AI insights with recommendations and confidence
 * - Learning feedback confirming pattern updates
 * - Worker efficiency and load balance stats
 * - Complexity analysis
 *
 * Refactored in Milestone 1.3 to use the handler factory pattern,
 * reducing code from ~1,578 lines to ~400 lines.
 *
 * @module mcp/handlers/domain-handlers
 */

import { createDomainHandler, resetTaskExecutor as resetExecutor } from './handler-factory';
import {
  testGenerateConfig,
  testExecuteConfig,
  coverageAnalyzeConfig,
  qualityAssessConfig,
  securityScanConfig,
  contractValidateConfig,
  accessibilityTestConfig,
  chaosTestConfig,
  defectPredictConfig,
  requirementsValidateConfig,
  codeIndexConfig,
  // Result types
  TestExecuteResult,
  QualityAssessResult,
  SecurityScanResult,
  ContractValidateResult,
  AccessibilityTestResult,
  ChaosTestResult,
  DefectPredictParams,
  DefectPredictResult,
  RequirementsValidateParams,
  RequirementsValidateResult,
  CodeIndexParams,
  CodeIndexResult,
} from './domain-handler-configs';
import {
  ToolResult,
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

// Re-export result types for backwards compatibility
export type {
  TestExecuteResult,
  QualityAssessResult,
  SecurityScanResult,
  ContractValidateResult,
  AccessibilityTestResult,
  ChaosTestResult,
  DefectPredictParams,
  DefectPredictResult,
  RequirementsValidateParams,
  RequirementsValidateResult,
  CodeIndexParams,
  CodeIndexResult,
};

// ============================================================================
// Task Executor Management
// ============================================================================

/**
 * Reset executor when fleet is reinitialized
 */
export function resetTaskExecutor(): void {
  resetExecutor();
}

// ============================================================================
// Domain Handlers - Created via Factory Pattern
// ============================================================================

/**
 * Handle test generation tasks
 *
 * @example
 * ```typescript
 * const result = await handleTestGenerate({
 *   sourceCode: 'function add(a, b) { return a + b; }',
 *   language: 'typescript',
 *   testType: 'unit',
 * });
 * ```
 */
export const handleTestGenerate = createDomainHandler<TestGenerateParams, TestGenerateResult>(
  testGenerateConfig
);

/**
 * Handle test execution tasks
 *
 * @example
 * ```typescript
 * const result = await handleTestExecute({
 *   testFiles: ['tests/unit/*.test.ts'],
 *   parallel: true,
 *   parallelism: 4,
 * });
 * ```
 */
export const handleTestExecute = createDomainHandler<TestExecuteParams, TestExecuteResult>(
  testExecuteConfig
);

/**
 * Handle coverage analysis tasks
 *
 * @example
 * ```typescript
 * const result = await handleCoverageAnalyze({
 *   target: 'src/',
 *   detectGaps: true,
 *   mlPowered: true,
 * });
 * ```
 */
export const handleCoverageAnalyze = createDomainHandler<CoverageAnalyzeParams, CoverageAnalyzeResult>(
  coverageAnalyzeConfig
);

/**
 * Handle quality assessment tasks
 *
 * @example
 * ```typescript
 * const result = await handleQualityAssess({
 *   runGate: true,
 *   threshold: 80,
 *   metrics: ['coverage', 'complexity'],
 * });
 * ```
 */
export const handleQualityAssess = createDomainHandler<QualityAssessParams, QualityAssessResult>(
  qualityAssessConfig
);

/**
 * Handle security scan tasks
 *
 * @example
 * ```typescript
 * const result = await handleSecurityScan({
 *   sast: true,
 *   dast: false,
 *   target: 'src/',
 * });
 * ```
 */
export const handleSecurityScan = createDomainHandler<SecurityScanParams, SecurityScanResult>(
  securityScanConfig
);

/**
 * Handle contract validation tasks
 *
 * @example
 * ```typescript
 * const result = await handleContractValidate({
 *   contractPath: 'contracts/api.yaml',
 *   checkBreakingChanges: true,
 * });
 * ```
 */
export const handleContractValidate = createDomainHandler<ContractValidateParams, ContractValidateResult>(
  contractValidateConfig
);

/**
 * Handle accessibility test tasks
 *
 * @example
 * ```typescript
 * const result = await handleAccessibilityTest({
 *   url: 'https://example.com',
 *   standard: 'wcag21-aa',
 * });
 * ```
 */
export const handleAccessibilityTest = createDomainHandler<AccessibilityTestParams, AccessibilityTestResult>(
  accessibilityTestConfig
);

/**
 * Handle chaos test tasks
 *
 * @example
 * ```typescript
 * const result = await handleChaosTest({
 *   faultType: 'latency',
 *   target: 'api-service',
 *   duration: 30000,
 *   dryRun: true,
 * });
 * ```
 */
export const handleChaosTest = createDomainHandler<ChaosTestParams, ChaosTestResult>(
  chaosTestConfig
);

/**
 * Handle defect prediction tasks
 *
 * @example
 * ```typescript
 * const result = await handleDefectPredict({
 *   target: 'src/',
 *   lookback: 30,
 *   minConfidence: 0.7,
 * });
 * ```
 */
export const handleDefectPredict = createDomainHandler<DefectPredictParams, DefectPredictResult>(
  defectPredictConfig
);

/**
 * Handle requirements validation tasks
 *
 * @example
 * ```typescript
 * const result = await handleRequirementsValidate({
 *   requirementsPath: 'docs/requirements.md',
 *   generateBDD: true,
 * });
 * ```
 */
export const handleRequirementsValidate = createDomainHandler<RequirementsValidateParams, RequirementsValidateResult>(
  requirementsValidateConfig
);

/**
 * Handle code indexing tasks
 *
 * @example
 * ```typescript
 * const result = await handleCodeIndex({
 *   target: 'src/',
 *   incremental: true,
 * });
 * ```
 */
export const handleCodeIndex = createDomainHandler<CodeIndexParams, CodeIndexResult>(
  codeIndexConfig
);

// ============================================================================
// ADR-057: Infrastructure Self-Healing Handlers
// ============================================================================

import type {
  InfraHealingOrchestrator,
} from '../../strange-loop/infra-healing/infra-healing-orchestrator.js';
import {
  setGlobalInfraHealing,
  getGlobalInfraHealing,
} from '../../strange-loop/infra-healing/global-instance.js';

/**
 * Set the infra-healing orchestrator instance (called during MCP server init).
 * Delegates to the shared global accessor so both MCP and domain layers can access it.
 */
export function setInfraHealingOrchestrator(orchestrator: InfraHealingOrchestrator): void {
  setGlobalInfraHealing(orchestrator);
}

/**
 * Get infra-healing stats, failing services, and last observation.
 */
export async function handleInfraHealingStatus(params: { verbose?: boolean }): Promise<ToolResult> {
  const infraHealing = getGlobalInfraHealing();
  if (!infraHealing) {
    return { success: false, error: 'Infrastructure healing not initialized' };
  }

  const stats = infraHealing.getStats();
  const observer = infraHealing.getObserver();
  const failingServices = [...observer.getFailingServices()];
  const rerunManager = infraHealing.getRerunManager();

  const result: Record<string, unknown> = {
    ready: infraHealing.isReady(),
    stats,
    failingServices,
    pendingReruns: rerunManager.hasPendingReruns(),
    pendingRerunCount: rerunManager.getPendingRerunCount(),
    servicesWithPendingReruns: rerunManager.getServicesWithPendingReruns(),
  };

  if (params.verbose) {
    const lastObs = observer.getLastObservation();
    if (lastObs) {
      result.lastObservation = {
        id: lastObs.id,
        totalLinesParsed: lastObs.totalLinesParsed,
        infraFailureCount: lastObs.infraFailures.length,
        vulnerabilityCount: lastObs.vulnerabilities.length,
        observedAt: lastObs.observedAt,
        parsingDurationMs: lastObs.parsingDurationMs,
      };
    }
  }

  return { success: true, data: result };
}

/**
 * Feed test runner output for infrastructure error detection.
 */
export async function handleInfraHealingFeedOutput(params: { output: string }): Promise<ToolResult> {
  const infraHealing = getGlobalInfraHealing();
  if (!infraHealing) {
    return { success: false, error: 'Infrastructure healing not initialized' };
  }

  if (!params.output) {
    return { success: false, error: 'Missing required parameter: output' };
  }

  infraHealing.feedTestOutput(params.output);

  const observer = infraHealing.getObserver();
  const lastObs = observer.getLastObservation();

  return {
    success: true,
    data: {
      infraFailuresDetected: lastObs?.infraFailures.length ?? 0,
      failingServices: [...observer.getFailingServices()],
      vulnerabilities: lastObs?.vulnerabilities.map(v => ({
        type: v.type,
        severity: v.severity,
        affectedAgents: v.affectedAgents,
        description: v.description,
      })) ?? [],
    },
  };
}

/**
 * Trigger infrastructure recovery cycle for detected failures.
 */
export async function handleInfraHealingRecover(params: {
  services?: string[];
  rerunTests?: boolean;
}): Promise<ToolResult> {
  const infraHealing = getGlobalInfraHealing();
  if (!infraHealing) {
    return { success: false, error: 'Infrastructure healing not initialized' };
  }

  const results = await infraHealing.runRecoveryCycle();

  // Optionally filter to requested services
  const filtered = params.services?.length
    ? results.filter(r => params.services!.includes(r.serviceName))
    : results;

  return {
    success: true,
    data: {
      recoveryResults: filtered.map(r => ({
        serviceName: r.serviceName,
        recovered: r.recovered,
        totalAttempts: r.totalAttempts,
        totalDurationMs: r.totalDurationMs,
        escalated: r.escalated,
        affectedTestIds: r.affectedTestIds,
      })),
      summary: {
        attempted: filtered.length,
        succeeded: filtered.filter(r => r.recovered).length,
        failed: filtered.filter(r => !r.recovered).length,
        testsToRerun: filtered.flatMap(r => [...r.affectedTestIds]),
      },
    },
  };
}

// ============================================================================
// Handler Registry (for dynamic dispatch)
// ============================================================================

/**
 * Registry of all domain handlers for dynamic dispatch
 */
export const domainHandlers = {
  'test-generation': handleTestGenerate,
  'test-execution': handleTestExecute,
  'coverage-analysis': handleCoverageAnalyze,
  'quality-assessment': handleQualityAssess,
  'security-compliance': handleSecurityScan,
  'contract-testing': handleContractValidate,
  'visual-accessibility': handleAccessibilityTest,
  'chaos-resilience': handleChaosTest,
  'defect-intelligence': handleDefectPredict,
  'requirements-validation': handleRequirementsValidate,
  'code-intelligence': handleCodeIndex,
} as const;

/**
 * Get a handler by domain name
 */
export function getHandlerByDomain(domain: keyof typeof domainHandlers): typeof domainHandlers[typeof domain] {
  return domainHandlers[domain];
}

/**
 * Check if a domain has a registered handler
 */
export function hasHandler(domain: string): domain is keyof typeof domainHandlers {
  return domain in domainHandlers;
}
