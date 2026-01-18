/**
 * Agentic QE v3 - Claim Verifier Agent Interfaces
 * CV-001 & CV-002: Design ClaimVerifier agent interface with claim types and evidence schema
 *
 * The ClaimVerifier agent verifies claims made by other QE agents before publishing.
 * This prevents false positives from reaching reports and ensures all security claims
 * are traced to actual evidence rather than assumptions.
 *
 * Key verification principles:
 * 1. ALL instances must be checked (not just one example)
 * 2. Evidence must be traceable and reproducible
 * 3. Counter-evidence is captured when claims are rejected
 * 4. Verification method is recorded for auditability
 *
 * @module agents/claim-verifier
 * @see AQE_V3_IMPROVEMENTS_PLAN.md Phase 4
 */

import { Severity, Result, DomainName, AgentType } from '../../shared/types';

// ============================================================================
// Claim Types - CV-002
// ============================================================================

/**
 * Types of claims that can be verified by the ClaimVerifier agent.
 * Each type requires specific verification methods:
 *
 * - security-implementation: Verified via code-trace (all entry points checked)
 * - security-vulnerability: Verified via code-trace + execution
 * - metric-count: Verified via execution (actual tooling)
 * - pattern-implementation: Verified via cross-file search
 * - coverage-claim: Verified via execution (coverage tools)
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   type: 'security-implementation',
 *   statement: 'SQL injection prevented via parameterized queries',
 *   // ...
 * };
 * ```
 */
export type ClaimType =
  | 'security-implementation'  // "SQL injection prevented", "Input validated"
  | 'security-vulnerability'   // "XSS vulnerability found at line 42"
  | 'metric-count'             // "80+ tests exist", "15,000 LOC"
  | 'pattern-implementation'   // "Timing attack prevention implemented"
  | 'coverage-claim';          // "90% coverage achieved"

/**
 * Verification methods used to validate claims.
 *
 * - code-trace: Trace data flow through code to verify implementation
 * - execution: Run actual commands/tools to verify metrics
 * - cross-file: Check all files in codebase for pattern presence
 * - multi-model: Verify with multiple LLM models for consensus
 * - static-analysis: Use AST parsing for structural verification
 *
 * @see VerificationResult.method
 */
export type VerificationMethod =
  | 'code-trace'       // Trace data flow through code paths
  | 'execution'        // Run actual command/tool for verification
  | 'cross-file'       // Check all files for pattern presence
  | 'multi-model'      // Verify with multiple LLM models
  | 'static-analysis'; // AST-based structural verification

// ============================================================================
// Evidence Schema - CV-002
// ============================================================================

/**
 * Types of evidence that can support or refute a claim.
 */
export type EvidenceType =
  | 'code-snippet'     // Actual code from source files
  | 'file-reference'   // Reference to specific file/line
  | 'command-output'   // Output from running a command
  | 'test-result'      // Result from test execution
  | 'ast-node'         // AST node reference
  | 'coverage-data';   // Coverage report data

/**
 * Evidence supporting or refuting a claim.
 * Evidence must be traceable and reproducible.
 *
 * @example
 * ```typescript
 * const evidence: Evidence = {
 *   type: 'code-snippet',
 *   location: 'src/auth/login.ts:42',
 *   content: 'const result = await db.query(sql, [username, password]);',
 *   verified: true,
 *   timestamp: new Date(),
 * };
 * ```
 */
export interface Evidence {
  /**
   * Type of evidence provided
   */
  readonly type: EvidenceType;

  /**
   * Location of the evidence (file path, line number, command, etc.)
   * Format: "file:line" for code, "command" for execution output
   */
  readonly location: string;

  /**
   * The actual evidence content (code, output, data)
   */
  readonly content: string;

  /**
   * Whether this evidence has been verified by the ClaimVerifier
   */
  readonly verified?: boolean;

  /**
   * When this evidence was collected
   */
  readonly timestamp?: Date;

  /**
   * Hash of the content for integrity verification
   */
  readonly contentHash?: string;

  /**
   * Additional context about the evidence
   */
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Claim Entity - CV-001
// ============================================================================

/**
 * A claim made by a QE agent that requires verification.
 * Claims represent assertions about the codebase that must be validated
 * before being included in reports.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'claim-001',
 *   type: 'security-implementation',
 *   statement: 'SQL injection prevented via parameterized queries',
 *   evidence: [
 *     { type: 'code-snippet', location: 'src/db.ts:15', content: '...' }
 *   ],
 *   sourceAgent: 'security-scanner-001',
 *   severity: 'high',
 *   timestamp: new Date(),
 * };
 * ```
 */
export interface Claim {
  /**
   * Unique identifier for this claim
   */
  readonly id: string;

  /**
   * Type of claim being made
   */
  readonly type: ClaimType;

  /**
   * The actual claim statement to be verified
   */
  readonly statement: string;

  /**
   * Evidence provided by the source agent to support the claim
   */
  readonly evidence: Evidence[];

  /**
   * ID of the agent that made this claim
   */
  readonly sourceAgent: string;

  /**
   * Type of the source agent
   */
  readonly sourceAgentType?: AgentType;

  /**
   * Domain the claim relates to
   */
  readonly domain?: DomainName;

  /**
   * Severity level of the claim (affects verification priority)
   */
  readonly severity: Severity;

  /**
   * When the claim was made
   */
  readonly timestamp: Date;

  /**
   * Tags for categorization and filtering
   */
  readonly tags?: string[];

  /**
   * Correlation ID for tracing across agents
   */
  readonly correlationId?: string;

  /**
   * Additional metadata about the claim
   */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Verification Results - CV-001
// ============================================================================

/**
 * Result of verifying a single claim.
 * Captures whether the claim was verified, the confidence level,
 * and any counter-evidence if the claim was rejected.
 *
 * @example
 * ```typescript
 * const result: VerificationResult = {
 *   claimId: 'claim-001',
 *   verified: false,
 *   confidence: 0.92,
 *   method: 'code-trace',
 *   reasoning: '2 of 5 entry points missing parameterized queries',
 *   allInstancesChecked: true,
 *   counterEvidence: [
 *     { type: 'file-reference', location: 'src/legacy/query.ts:89', content: '...' }
 *   ],
 * };
 * ```
 */
export interface VerificationResult {
  /**
   * ID of the claim that was verified
   */
  readonly claimId: string;

  /**
   * Whether the claim was verified as true
   */
  readonly verified: boolean;

  /**
   * Confidence level of the verification (0-1)
   * Higher values indicate more certain verification
   */
  readonly confidence: number;

  /**
   * Method used to verify the claim
   */
  readonly method: VerificationMethod;

  /**
   * Evidence that contradicts the claim (if rejected)
   */
  readonly counterEvidence?: Evidence[];

  /**
   * Human-readable explanation of the verification result
   */
  readonly reasoning: string;

  /**
   * Whether ALL instances were checked, not just a sample.
   * Critical for security claims where one missed instance = vulnerability
   */
  readonly allInstancesChecked: boolean;

  /**
   * Number of instances checked during verification
   */
  readonly instancesChecked?: number;

  /**
   * Number of instances that passed verification
   */
  readonly instancesPassed?: number;

  /**
   * Time taken to verify (milliseconds)
   */
  readonly verificationTimeMs?: number;

  /**
   * Whether human review is recommended
   */
  readonly requiresHumanReview?: boolean;

  /**
   * When the verification was performed
   */
  readonly verifiedAt?: Date;
}

// ============================================================================
// Report Types - CV-001
// ============================================================================

/**
 * A QE report containing claims that need verification.
 * Reports are generated by various QE agents and contain
 * assertions that must be validated before publishing.
 */
export interface QEReport {
  /**
   * Unique identifier for this report
   */
  readonly id: string;

  /**
   * Type of report (security-scan, coverage-analysis, etc.)
   */
  readonly type: string;

  /**
   * Claims made in this report
   */
  readonly claims: Claim[];

  /**
   * When the report was generated
   */
  readonly generatedAt: Date;

  /**
   * Agent that generated this report
   */
  readonly sourceAgent: string;

  /**
   * Domain this report belongs to
   */
  readonly domain?: DomainName;

  /**
   * Overall confidence of the report before verification
   */
  readonly preVerificationConfidence?: number;

  /**
   * Additional report metadata
   */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of verifying all claims in a QE report.
 * Provides overall confidence and highlights flagged claims.
 */
export interface ReportVerification {
  /**
   * ID of the verified report
   */
  readonly reportId: string;

  /**
   * Original report that was verified
   */
  readonly report: QEReport;

  /**
   * All claims from the report
   */
  readonly claims: Claim[];

  /**
   * Verification results for each claim
   */
  readonly results: VerificationResult[];

  /**
   * Overall confidence in the report after verification (0-1)
   */
  readonly overallConfidence: number;

  /**
   * Claims that failed verification or have low confidence
   */
  readonly flaggedClaims: FlaggedClaim[];

  /**
   * Summary statistics of the verification
   */
  readonly summary: VerificationSummary;

  /**
   * When the verification was completed
   */
  readonly verifiedAt: Date;

  /**
   * Whether the report passed quality threshold
   */
  readonly passed: boolean;

  /**
   * Quality threshold used for pass/fail decision
   */
  readonly qualityThreshold: number;
}

/**
 * A claim that was flagged during verification.
 * Includes the original claim, verification result, and recommended action.
 */
export interface FlaggedClaim {
  /**
   * The original claim
   */
  readonly claim: Claim;

  /**
   * The verification result
   */
  readonly result: VerificationResult;

  /**
   * Reason the claim was flagged
   */
  readonly reason: FlagReason;

  /**
   * Recommended action to resolve the flagged claim
   */
  readonly recommendedAction: RecommendedAction;

  /**
   * Priority of addressing this flagged claim
   */
  readonly priority: 'urgent' | 'high' | 'medium' | 'low';
}

/**
 * Reasons a claim might be flagged
 */
export type FlagReason =
  | 'verification-failed'      // Claim was proven false
  | 'low-confidence'           // Verification confidence below threshold
  | 'partial-verification'     // Some instances passed, others failed
  | 'insufficient-evidence'    // Not enough evidence to verify
  | 'conflicting-evidence'     // Evidence contradicts itself
  | 'verification-error';      // Error during verification process

/**
 * Recommended actions for flagged claims
 */
export type RecommendedAction =
  | 'remove-from-report'       // Claim should not be published
  | 'add-disclaimer'           // Publish with uncertainty disclaimer
  | 'human-review-required'    // Needs human verification
  | 're-verify'                // Try verification again
  | 'request-more-evidence'    // Ask source agent for more evidence
  | 'escalate';                // Escalate to senior reviewer

/**
 * Summary statistics from verification
 */
export interface VerificationSummary {
  /**
   * Total number of claims verified
   */
  readonly totalClaims: number;

  /**
   * Number of claims that passed verification
   */
  readonly verified: number;

  /**
   * Number of claims that failed verification
   */
  readonly rejected: number;

  /**
   * Number of claims with disputed/uncertain results
   */
  readonly disputed: number;

  /**
   * Number of claims requiring human review
   */
  readonly requiresReview: number;

  /**
   * Average confidence across all verifications
   */
  readonly averageConfidence: number;

  /**
   * Total verification time (milliseconds)
   */
  readonly totalTimeMs: number;

  /**
   * Breakdown by claim type
   */
  readonly byType: Record<ClaimType, TypeSummary>;

  /**
   * Breakdown by verification method
   */
  readonly byMethod: Record<VerificationMethod, number>;
}

/**
 * Summary statistics for a specific claim type
 */
export interface TypeSummary {
  readonly total: number;
  readonly verified: number;
  readonly rejected: number;
  readonly avgConfidence: number;
}

// ============================================================================
// Verification Statistics - CV-001
// ============================================================================

/**
 * Statistics collected by the ClaimVerifier over time.
 * Used for monitoring accuracy and improving verification methods.
 */
export interface VerificationStats {
  /**
   * Total number of claims processed
   */
  readonly totalClaims: number;

  /**
   * Number of claims verified as true
   */
  readonly verified: number;

  /**
   * Number of claims rejected as false
   */
  readonly rejected: number;

  /**
   * Number of claims with disputed/uncertain results
   */
  readonly disputed: number;

  /**
   * Average confidence across all verifications
   */
  readonly avgConfidence: number;

  /**
   * Verification accuracy (if ground truth available)
   */
  readonly accuracy?: number;

  /**
   * False positive rate (claims incorrectly verified)
   */
  readonly falsePositiveRate?: number;

  /**
   * False negative rate (claims incorrectly rejected)
   */
  readonly falseNegativeRate?: number;

  /**
   * Statistics by claim type
   */
  readonly byType: Record<ClaimType, TypeStats>;

  /**
   * Statistics by verification method
   */
  readonly byMethod: Record<VerificationMethod, MethodStats>;

  /**
   * Statistics by source agent
   */
  readonly bySourceAgent: Record<string, AgentStats>;

  /**
   * When these statistics were last updated
   */
  readonly lastUpdated: Date;

  /**
   * Time window these statistics cover
   */
  readonly timeWindow: {
    readonly start: Date;
    readonly end: Date;
  };
}

/**
 * Statistics for a specific claim type
 */
export interface TypeStats {
  readonly total: number;
  readonly verified: number;
  readonly rejected: number;
  readonly disputed: number;
  readonly avgConfidence: number;
  readonly avgVerificationTimeMs: number;
}

/**
 * Statistics for a specific verification method
 */
export interface MethodStats {
  readonly timesUsed: number;
  readonly successRate: number;
  readonly avgConfidence: number;
  readonly avgTimeMs: number;
}

/**
 * Statistics for claims from a specific agent
 */
export interface AgentStats {
  readonly claimsSubmitted: number;
  readonly claimsVerified: number;
  readonly claimsRejected: number;
  readonly verificationRate: number;
  readonly avgConfidence: number;
}

// ============================================================================
// Agent Interface - CV-001
// ============================================================================

/**
 * Configuration options for claim verification.
 */
export interface VerificationOptions {
  /**
   * Minimum confidence threshold for verification to pass (0-1)
   * @default 0.80
   */
  readonly confidenceThreshold?: number;

  /**
   * Maximum time to spend on verification (milliseconds)
   * @default 30000
   */
  readonly timeout?: number;

  /**
   * Preferred verification method(s) to use
   */
  readonly preferredMethods?: VerificationMethod[];

  /**
   * Whether to use multi-model verification for security claims
   * @default true for critical/high severity
   */
  readonly useMultiModel?: boolean;

  /**
   * Whether to check all instances or use sampling
   * @default true (always check all for security claims)
   */
  readonly checkAllInstances?: boolean;

  /**
   * Maximum number of instances to check (for non-security claims)
   */
  readonly maxInstances?: number;

  /**
   * Whether to collect counter-evidence when verification fails
   * @default true
   */
  readonly collectCounterEvidence?: boolean;

  /**
   * Correlation ID for tracing
   */
  readonly correlationId?: string;
}

/**
 * Configuration options for report verification.
 */
export interface ReportVerificationOptions extends VerificationOptions {
  /**
   * Quality threshold for report to pass (0-1)
   * @default 0.85
   */
  readonly qualityThreshold?: number;

  /**
   * Whether to fail fast on first rejected claim
   * @default false
   */
  readonly failFast?: boolean;

  /**
   * Maximum number of claims to verify in parallel
   * @default 5
   */
  readonly parallelLimit?: number;

  /**
   * Priority order for verification
   */
  readonly verificationOrder?: 'severity' | 'type' | 'sequential';
}

/**
 * The ClaimVerifier agent interface.
 * Responsible for verifying claims made by other QE agents before publishing.
 *
 * @example
 * ```typescript
 * const verifier: ClaimVerifierAgent = new ClaimVerifierAgentImpl(config);
 *
 * // Verify a single claim
 * const result = await verifier.verify(claim);
 * if (!result.verified) {
 *   console.log('Claim rejected:', result.reasoning);
 * }
 *
 * // Verify all claims in a report
 * const reportVerification = await verifier.verifyReport(report);
 * if (!reportVerification.passed) {
 *   console.log('Report failed verification');
 *   console.log('Flagged claims:', reportVerification.flaggedClaims);
 * }
 * ```
 */
export interface ClaimVerifierAgent {
  /**
   * Verify a single claim.
   * Uses the appropriate verification method based on claim type.
   *
   * @param claim - The claim to verify
   * @param options - Verification options
   * @returns Promise resolving to verification result
   */
  verify(
    claim: Claim,
    options?: VerificationOptions
  ): Promise<Result<VerificationResult, VerificationError>>;

  /**
   * Verify all claims in a QE report.
   * Returns overall verification status and flagged claims.
   *
   * @param report - The report to verify
   * @param options - Verification options
   * @returns Promise resolving to report verification result
   */
  verifyReport(
    report: QEReport,
    options?: ReportVerificationOptions
  ): Promise<Result<ReportVerification, VerificationError>>;

  /**
   * Verify multiple claims in batch.
   *
   * @param claims - Claims to verify
   * @param options - Verification options
   * @returns Promise resolving to verification results
   */
  verifyBatch(
    claims: Claim[],
    options?: VerificationOptions
  ): Promise<Result<VerificationResult[], VerificationError>>;

  /**
   * Get verification statistics.
   *
   * @returns Current verification statistics
   */
  getStats(): VerificationStats;

  /**
   * Reset verification statistics.
   */
  resetStats(): void;

  /**
   * Check if a claim type requires strict verification.
   * Security claims always require checking all instances.
   *
   * @param type - The claim type to check
   * @returns Whether strict verification is required
   */
  requiresStrictVerification(type: ClaimType): boolean;

  /**
   * Get the recommended verification method for a claim type.
   *
   * @param type - The claim type
   * @returns Recommended verification method
   */
  getRecommendedMethod(type: ClaimType): VerificationMethod;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for verification failures.
 */
export type VerificationErrorCode =
  | 'CLAIM_NOT_FOUND'
  | 'INVALID_CLAIM'
  | 'VERIFICATION_TIMEOUT'
  | 'METHOD_NOT_AVAILABLE'
  | 'CODE_INTELLIGENCE_UNAVAILABLE'
  | 'EXECUTION_FAILED'
  | 'MULTI_MODEL_FAILED'
  | 'INTERNAL_ERROR';

/**
 * Error returned when verification fails.
 */
export interface VerificationError extends Error {
  /**
   * Error code for programmatic handling
   */
  readonly code: VerificationErrorCode;

  /**
   * ID of the claim that failed verification (if applicable)
   */
  readonly claimId?: string;

  /**
   * Additional error details
   */
  readonly details?: Record<string, unknown>;

  /**
   * Whether the error is retryable
   */
  readonly retryable: boolean;
}

/**
 * Create a verification error.
 *
 * @param code - Error code
 * @param message - Error message
 * @param options - Additional error options
 * @returns VerificationError instance
 */
export function createVerificationError(
  code: VerificationErrorCode,
  message: string,
  options?: {
    claimId?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  }
): VerificationError {
  const error = new Error(message) as VerificationError;
  (error as { code: VerificationErrorCode }).code = code;
  (error as { claimId: string | undefined }).claimId = options?.claimId;
  (error as { details: Record<string, unknown> | undefined }).details = options?.details;
  (error as { retryable: boolean }).retryable = options?.retryable ?? false;
  return error;
}

// ============================================================================
// Factory and Configuration
// ============================================================================

/**
 * Configuration for the ClaimVerifier agent.
 */
export interface ClaimVerifierConfig {
  /**
   * Default confidence threshold for verification
   * @default 0.80
   */
  readonly defaultConfidenceThreshold: number;

  /**
   * Default timeout for verification (milliseconds)
   * @default 30000
   */
  readonly defaultTimeout: number;

  /**
   * Quality threshold for reports to pass
   * @default 0.85
   */
  readonly reportQualityThreshold: number;

  /**
   * Whether to use multi-model verification by default for security claims
   * @default true
   */
  readonly enableMultiModel: boolean;

  /**
   * Maximum parallel verifications
   * @default 5
   */
  readonly maxParallelVerifications: number;

  /**
   * Whether to collect and report statistics
   * @default true
   */
  readonly enableStatistics: boolean;

  /**
   * How often to persist statistics (milliseconds)
   * @default 60000
   */
  readonly statisticsPersistInterval: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CLAIM_VERIFIER_CONFIG: ClaimVerifierConfig = {
  defaultConfidenceThreshold: 0.80,
  defaultTimeout: 30000,
  reportQualityThreshold: 0.85,
  enableMultiModel: true,
  maxParallelVerifications: 5,
  enableStatistics: true,
  statisticsPersistInterval: 60000,
};

/**
 * Mapping of claim types to their default verification methods.
 */
export const CLAIM_TYPE_TO_METHOD: Record<ClaimType, VerificationMethod> = {
  'security-implementation': 'code-trace',
  'security-vulnerability': 'code-trace',
  'metric-count': 'execution',
  'pattern-implementation': 'cross-file',
  'coverage-claim': 'execution',
};

/**
 * Claim types that require strict verification (all instances checked).
 */
export const STRICT_VERIFICATION_TYPES: ClaimType[] = [
  'security-implementation',
  'security-vulnerability',
];
