/**
 * Agentic QE v3 - Domain Finding Types
 * Generic finding type for cross-domain consensus verification
 *
 * This module provides a generic DomainFinding type that can be used by any
 * domain coordinator to leverage multi-model consensus verification for
 * high-stakes decisions without coupling to security-specific types.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

// ============================================================================
// Generic Domain Finding Types
// ============================================================================

/**
 * Generic finding from any domain coordinator
 *
 * This is the foundation type for cross-domain consensus verification.
 * Any domain can use this to represent findings that need multi-model
 * verification before taking action.
 *
 * @typeParam T - The payload type specific to the domain
 *
 * @example
 * ```typescript
 * // Test generation finding
 * interface TestGapPayload {
 *   file: string;
 *   uncoveredLines: number[];
 *   suggestedTests: string[];
 * }
 *
 * const finding: DomainFinding<TestGapPayload> = {
 *   id: 'gap-001',
 *   type: 'coverage-gap',
 *   confidence: 0.85,
 *   description: 'Missing test coverage for error handling',
 *   payload: { file: 'src/api.ts', uncoveredLines: [45, 67], suggestedTests: [] },
 *   detectedAt: new Date(),
 *   detectedBy: 'coverage-analyzer',
 * };
 * ```
 */
export interface DomainFinding<T = unknown> {
  /** Unique identifier for this finding */
  readonly id: string;

  /** Type of finding (domain-specific, e.g., 'security-vulnerability', 'coverage-gap') */
  readonly type: string;

  /** Confidence level in the finding (0-1) */
  readonly confidence: number;

  /** Human-readable description of the finding */
  readonly description: string;

  /** Domain-specific payload data */
  readonly payload: T;

  /** When the finding was detected */
  readonly detectedAt: Date;

  /** Agent or component that detected this finding */
  readonly detectedBy: string;

  /** Optional severity for prioritization */
  readonly severity?: FindingSeverity;

  /** Optional correlation ID for tracing */
  readonly correlationId?: string;

  /** Optional additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Severity levels for domain findings
 */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Finding location for code-related findings
 */
export interface FindingLocation {
  /** File path */
  readonly file: string;

  /** Starting line number (1-indexed) */
  readonly line?: number;

  /** Starting column number (1-indexed) */
  readonly column?: number;

  /** Ending line number */
  readonly endLine?: number;

  /** Ending column number */
  readonly endColumn?: number;

  /** Function or method name */
  readonly function?: string;

  /** Class or module name */
  readonly class?: string;
}

/**
 * Evidence supporting a finding
 */
export interface FindingEvidence {
  /** Type of evidence */
  readonly type: 'code-snippet' | 'stack-trace' | 'data-flow' | 'configuration' | 'metric' | 'log';

  /** Evidence content */
  readonly content: string;

  /** Optional location */
  readonly location?: FindingLocation;

  /** Confidence that this evidence supports the finding (0-1) */
  readonly confidence?: number;
}

// ============================================================================
// Domain-Specific Payload Examples
// ============================================================================

/**
 * Payload for security-related findings
 */
export interface SecurityFindingPayload {
  /** Vulnerability type */
  readonly vulnerabilityType: string;

  /** Location in code */
  readonly location: FindingLocation;

  /** Supporting evidence */
  readonly evidence: FindingEvidence[];

  /** CWE ID if applicable */
  readonly cweId?: string;

  /** CVE ID if applicable */
  readonly cveId?: string;

  /** Recommended remediation */
  readonly remediation?: string;
}

/**
 * Payload for test coverage gaps
 */
export interface CoverageGapPayload {
  /** File with coverage gap */
  readonly file: string;

  /** Uncovered line numbers */
  readonly uncoveredLines: number[];

  /** Uncovered branches */
  readonly uncoveredBranches?: number[];

  /** Suggested test descriptions */
  readonly suggestedTests?: string[];

  /** Current coverage percentage */
  readonly currentCoverage: number;

  /** Target coverage percentage */
  readonly targetCoverage: number;
}

/**
 * Payload for defect predictions
 */
export interface DefectPredictionPayload {
  /** File predicted to have defects */
  readonly file: string;

  /** Predicted defect probability */
  readonly probability: number;

  /** Contributing factors */
  readonly factors: {
    readonly name: string;
    readonly weight: number;
    readonly value: number;
  }[];

  /** Historical defect data */
  readonly history?: {
    readonly defectCount: number;
    readonly lastDefectDate?: Date;
  };
}

/**
 * Payload for contract violations
 */
export interface ContractViolationPayload {
  /** Consumer name */
  readonly consumer: string;

  /** Provider name */
  readonly provider: string;

  /** Contract path */
  readonly contractPath: string;

  /** Violation details */
  readonly violations: {
    readonly path: string;
    readonly expected: unknown;
    readonly actual: unknown;
  }[];
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a domain finding with defaults
 *
 * @param params - Finding parameters
 * @returns Validated domain finding
 */
export function createDomainFinding<T>(params: {
  id: string;
  type: string;
  confidence: number;
  description: string;
  payload: T;
  detectedBy: string;
  severity?: FindingSeverity;
  correlationId?: string;
  context?: Record<string, unknown>;
}): DomainFinding<T> {
  // Validate confidence is in valid range
  if (params.confidence < 0 || params.confidence > 1) {
    throw new Error(`Invalid confidence: ${params.confidence}. Must be between 0 and 1.`);
  }

  return {
    id: params.id,
    type: params.type,
    confidence: params.confidence,
    description: params.description,
    payload: params.payload,
    detectedAt: new Date(),
    detectedBy: params.detectedBy,
    severity: params.severity,
    correlationId: params.correlationId,
    context: params.context,
  };
}

/**
 * Check if a finding is high-stakes based on severity and confidence
 *
 * @param finding - Finding to evaluate
 * @param severityThreshold - Minimum severity to consider high-stakes
 * @param confidenceThreshold - Minimum confidence to consider high-stakes
 * @returns true if the finding is high-stakes
 */
export function isHighStakesFinding<T>(
  finding: DomainFinding<T>,
  severityThreshold: FindingSeverity[] = ['critical', 'high'],
  confidenceThreshold: number = 0.7
): boolean {
  // High confidence findings of severe types are high-stakes
  if (finding.severity && severityThreshold.includes(finding.severity)) {
    return finding.confidence >= confidenceThreshold;
  }

  // Very high confidence findings are always worth reviewing
  return finding.confidence >= 0.9;
}

/**
 * Generate a unique finding ID
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique finding ID
 */
export function generateFindingId(prefix: string = 'finding'): string {
  // Use crypto.randomUUID() for cryptographically secure random IDs
  // This prevents ID collisions and enumeration attacks
  const uuid = crypto.randomUUID();
  return `${prefix}-${uuid}`;
}
