/**
 * Wrapped Domain Handlers with Experience Capture
 *
 * ADR-051: Wraps all domain handlers with experience capture middleware
 * to automatically persist learning to V3 database.
 *
 * All QE agent invocations (MCP, CLI, Claude Code Task) now capture:
 * - Task context (domain, agent, model tier)
 * - Execution steps and outcomes
 * - Quality metrics and duration
 *
 * Experiences are persisted to:
 * - captured_experiences table (full detail)
 * - sona_patterns table (for learning integration)
 */

import {
  wrapWithExperienceCapture,
  initializeExperienceCapture,
} from '../../learning/experience-capture-middleware.js';

import type { QEDomain } from '../../learning/qe-patterns.js';

// Import original handlers and their result types
import {
  handleTestGenerate as originalTestGenerate,
  handleTestExecute as originalTestExecute,
  handleCoverageAnalyze as originalCoverageAnalyze,
  handleQualityAssess as originalQualityAssess,
  handleSecurityScan as originalSecurityScan,
  handleContractValidate as originalContractValidate,
  handleAccessibilityTest as originalAccessibilityTest,
  handleChaosTest as originalChaosTest,
  handleDefectPredict as originalDefectPredict,
  handleRequirementsValidate as originalRequirementsValidate,
  handleCodeIndex as originalCodeIndex,
  resetTaskExecutor,
  // Result types
  type TestExecuteResult,
  type QualityAssessResult,
  type SecurityScanResult,
  type ContractValidateResult,
  type AccessibilityTestResult,
  type ChaosTestResult,
  type DefectPredictParams,
  type DefectPredictResult,
  type RequirementsValidateParams,
  type RequirementsValidateResult,
  type CodeIndexParams,
  type CodeIndexResult,
} from './domain-handlers.js';

// Import types from MCP types
import type {
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
} from '../types.js';

// ============================================================================
// Initialize experience capture on module load
// ============================================================================

// Promise-based lock to prevent initialization race conditions
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeExperienceCapture();
  }
  await initPromise;
}

// ============================================================================
// Wrapped Handlers
// ============================================================================

/**
 * Wrap a handler to normalize its return type for experience capture
 */
function createWrappedHandler<TParams, TResult>(
  handler: (params: TParams) => Promise<ToolResult<TResult>>,
  domain: QEDomain,
  agent: string
): (params: TParams) => Promise<ToolResult<TResult>> {
  // Create the wrapped inner handler that normalizes to { success, data, error }
  const normalizedHandler = async (params: TParams): Promise<{ success: boolean; data?: TResult; error?: string }> => {
    await ensureInitialized();
    const result = await handler(params);
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  };

  // Wrap with experience capture - domain is now properly typed as QEDomain
  const wrapped = wrapWithExperienceCapture(
    normalizedHandler,
    domain,
    agent
  );

  // Return a handler that converts back to ToolResult
  return async (params: TParams): Promise<ToolResult<TResult>> => {
    const result = await wrapped(params);
    // Check success separately from data - success with undefined data is valid
    if (result.success) {
      return { success: true, data: result.data as TResult };
    }
    return { success: false, error: result.error || 'Unknown error' };
  };
}

// ============================================================================
// Export Wrapped Domain Handlers
// ============================================================================

export const handleTestGenerate = createWrappedHandler<TestGenerateParams, TestGenerateResult>(
  originalTestGenerate,
  'test-generation',
  'qe-test-architect'
);

export const handleTestExecute = createWrappedHandler<TestExecuteParams, TestExecuteResult>(
  originalTestExecute,
  'test-execution',
  'qe-parallel-executor'
);

export const handleCoverageAnalyze = createWrappedHandler<CoverageAnalyzeParams, CoverageAnalyzeResult>(
  originalCoverageAnalyze,
  'coverage-analysis',
  'qe-coverage-specialist'
);

export const handleQualityAssess = createWrappedHandler<QualityAssessParams, QualityAssessResult>(
  originalQualityAssess,
  'quality-assessment',
  'qe-quality-gate'
);

export const handleSecurityScan = createWrappedHandler<SecurityScanParams, SecurityScanResult>(
  originalSecurityScan,
  'security-compliance',
  'qe-security-scanner'
);

export const handleContractValidate = createWrappedHandler<ContractValidateParams, ContractValidateResult>(
  originalContractValidate,
  'contract-testing',
  'qe-contract-validator'
);

export const handleAccessibilityTest = createWrappedHandler<AccessibilityTestParams, AccessibilityTestResult>(
  originalAccessibilityTest,
  'visual-accessibility',
  'qe-accessibility-auditor'
);

export const handleChaosTest = createWrappedHandler<ChaosTestParams, ChaosTestResult>(
  originalChaosTest,
  'chaos-resilience',
  'qe-chaos-engineer'
);

export const handleDefectPredict = createWrappedHandler<DefectPredictParams, DefectPredictResult>(
  originalDefectPredict,
  'defect-intelligence',
  'qe-defect-predictor'
);

export const handleRequirementsValidate = createWrappedHandler<RequirementsValidateParams, RequirementsValidateResult>(
  originalRequirementsValidate,
  'requirements-validation',
  'qe-requirements-validator'
);

export const handleCodeIndex = createWrappedHandler<CodeIndexParams, CodeIndexResult>(
  originalCodeIndex,
  'code-intelligence',
  'qe-code-indexer'
);

// Re-export utility function
export { resetTaskExecutor };
