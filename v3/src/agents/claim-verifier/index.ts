/**
 * Agentic QE v3 - Claim Verifier Agent
 * CV-001 & CV-002: ClaimVerifier agent interface with claim types and evidence schema
 *
 * The ClaimVerifier agent verifies claims made by other QE agents before publishing.
 * This module exports all interfaces, types, and utilities for claim verification.
 *
 * @module agents/claim-verifier
 * @see AQE_V3_IMPROVEMENTS_PLAN.md Phase 4
 *
 * @example
 * ```typescript
 * import {
 *   Claim,
 *   ClaimType,
 *   Evidence,
 *   VerificationResult,
 *   ClaimVerifierAgent,
 *   createVerificationError,
 * } from './agents/claim-verifier';
 *
 * // Create a claim to verify
 * const claim: Claim = {
 *   id: 'claim-001',
 *   type: 'security-implementation',
 *   statement: 'SQL injection prevented via parameterized queries',
 *   evidence: [],
 *   sourceAgent: 'security-scanner-001',
 *   severity: 'high',
 *   timestamp: new Date(),
 * };
 *
 * // Verify the claim
 * const result = await verifier.verify(claim);
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Claim types
  ClaimType,
  Claim,

  // Evidence types
  EvidenceType,
  Evidence,

  // Verification types
  VerificationMethod,
  VerificationResult,
  VerificationOptions,
  ReportVerificationOptions,

  // Report types
  QEReport,
  ReportVerification,
  FlaggedClaim,
  FlagReason,
  RecommendedAction,
  VerificationSummary,
  TypeSummary,

  // Statistics types
  VerificationStats,
  TypeStats,
  MethodStats,
  AgentStats,

  // Agent interface
  ClaimVerifierAgent,

  // Configuration types
  ClaimVerifierConfig,

  // Error types
  VerificationErrorCode,
  VerificationError,
} from './interfaces';

// ============================================================================
// Utilities and Constants
// ============================================================================

export {
  // Error factory
  createVerificationError,

  // Configuration defaults
  DEFAULT_CLAIM_VERIFIER_CONFIG,

  // Type mappings
  CLAIM_TYPE_TO_METHOD,
  STRICT_VERIFICATION_TYPES,
} from './interfaces';

// ============================================================================
// Type Guards
// ============================================================================

import type {
  ClaimType,
  VerificationMethod,
  EvidenceType,
  FlagReason,
  RecommendedAction,
  VerificationErrorCode,
} from './interfaces';

/**
 * Check if a string is a valid ClaimType.
 *
 * @param value - String to check
 * @returns True if value is a valid ClaimType
 */
export function isClaimType(value: string): value is ClaimType {
  const validTypes: ClaimType[] = [
    'security-implementation',
    'security-vulnerability',
    'metric-count',
    'pattern-implementation',
    'coverage-claim',
  ];
  return validTypes.includes(value as ClaimType);
}

/**
 * Check if a string is a valid VerificationMethod.
 *
 * @param value - String to check
 * @returns True if value is a valid VerificationMethod
 */
export function isVerificationMethod(value: string): value is VerificationMethod {
  const validMethods: VerificationMethod[] = [
    'code-trace',
    'execution',
    'cross-file',
    'multi-model',
    'static-analysis',
  ];
  return validMethods.includes(value as VerificationMethod);
}

/**
 * Check if a string is a valid EvidenceType.
 *
 * @param value - String to check
 * @returns True if value is a valid EvidenceType
 */
export function isEvidenceType(value: string): value is EvidenceType {
  const validTypes: EvidenceType[] = [
    'code-snippet',
    'file-reference',
    'command-output',
    'test-result',
    'ast-node',
    'coverage-data',
  ];
  return validTypes.includes(value as EvidenceType);
}

/**
 * Check if a string is a valid FlagReason.
 *
 * @param value - String to check
 * @returns True if value is a valid FlagReason
 */
export function isFlagReason(value: string): value is FlagReason {
  const validReasons: FlagReason[] = [
    'verification-failed',
    'low-confidence',
    'partial-verification',
    'insufficient-evidence',
    'conflicting-evidence',
    'verification-error',
  ];
  return validReasons.includes(value as FlagReason);
}

/**
 * Check if a string is a valid RecommendedAction.
 *
 * @param value - String to check
 * @returns True if value is a valid RecommendedAction
 */
export function isRecommendedAction(value: string): value is RecommendedAction {
  const validActions: RecommendedAction[] = [
    'remove-from-report',
    'add-disclaimer',
    'human-review-required',
    're-verify',
    'request-more-evidence',
    'escalate',
  ];
  return validActions.includes(value as RecommendedAction);
}

/**
 * Check if a string is a valid VerificationErrorCode.
 *
 * @param value - String to check
 * @returns True if value is a valid VerificationErrorCode
 */
export function isVerificationErrorCode(value: string): value is VerificationErrorCode {
  const validCodes: VerificationErrorCode[] = [
    'CLAIM_NOT_FOUND',
    'INVALID_CLAIM',
    'VERIFICATION_TIMEOUT',
    'METHOD_NOT_AVAILABLE',
    'CODE_INTELLIGENCE_UNAVAILABLE',
    'EXECUTION_FAILED',
    'MULTI_MODEL_FAILED',
    'INTERNAL_ERROR',
  ];
  return validCodes.includes(value as VerificationErrorCode);
}

// ============================================================================
// Utility Functions
// ============================================================================

import {
  CLAIM_TYPE_TO_METHOD,
  STRICT_VERIFICATION_TYPES,
} from './interfaces';

/**
 * Get the recommended verification method for a claim type.
 *
 * @param type - The claim type
 * @returns Recommended verification method
 */
export function getRecommendedMethod(type: ClaimType): VerificationMethod {
  return CLAIM_TYPE_TO_METHOD[type];
}

/**
 * Check if a claim type requires strict verification.
 * Strict verification means all instances must be checked.
 *
 * @param type - The claim type
 * @returns True if strict verification is required
 */
export function requiresStrictVerification(type: ClaimType): boolean {
  return STRICT_VERIFICATION_TYPES.includes(type);
}

/**
 * Check if a claim is security-related and needs elevated verification.
 *
 * @param type - The claim type
 * @returns True if the claim is security-related
 */
export function isSecurityClaim(type: ClaimType): boolean {
  return type === 'security-implementation' || type === 'security-vulnerability';
}

/**
 * Calculate the priority of verification based on claim properties.
 *
 * @param claim - The claim to prioritize
 * @returns Priority level ('urgent' | 'high' | 'medium' | 'low')
 */
export function calculateVerificationPriority(
  claim: { type: ClaimType; severity: string }
): 'urgent' | 'high' | 'medium' | 'low' {
  // Security claims with critical/high severity are urgent
  if (isSecurityClaim(claim.type)) {
    if (claim.severity === 'critical') return 'urgent';
    if (claim.severity === 'high') return 'high';
    return 'medium';
  }

  // Other claim types based on severity
  if (claim.severity === 'critical') return 'high';
  if (claim.severity === 'high') return 'medium';
  return 'low';
}

/**
 * Generate a unique claim ID.
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique claim ID
 */
export function generateClaimId(prefix = 'claim'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate a unique evidence content hash.
 *
 * @param content - The evidence content to hash
 * @returns Content hash string
 */
export function generateContentHash(content: string): string {
  // Simple hash for demonstration - in production use crypto
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// Verifiers - CV-003, CV-004, CV-005
// ============================================================================

export {
  FileBasedVerifier,
  type FileVerifierConfig,
} from './verifiers/file-verifier';

export {
  TestBasedVerifier,
  type TestVerifierConfig,
} from './verifiers/test-verifier';

export {
  OutputBasedVerifier,
  type OutputVerifierConfig,
} from './verifiers/output-verifier';

// ============================================================================
// Service - CV-003, CV-004, CV-005
// ============================================================================

export {
  ClaimVerifierService,
  createClaimVerifierService,
  type ClaimVerifierServiceConfig,
} from './claim-verifier-service';
