/**
 * Transfer Verification (Task 2.3)
 *
 * Verifies that cross-domain pattern transfers do not cause regression
 * in either the source or target domain. A transfer is considered valid
 * only when:
 *   1. The target domain improves (or at least does not degrade)
 *   2. The source domain does not regress
 *
 * This double-gate ensures that knowledge sharing is always net-positive.
 *
 * @module integrations/ruvector/transfer-verification
 */

import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('transfer-verification');

// ============================================================================
// Types
// ============================================================================

/**
 * Performance snapshot for a domain at a point in time.
 */
export interface DomainPerformanceSnapshot {
  /** Domain identifier */
  domain: string;
  /** Success rate (0-1) */
  successRate: number;
  /** Average confidence of patterns in the domain */
  avgConfidence: number;
  /** Number of patterns in the domain */
  patternCount: number;
  /** Timestamp of the snapshot */
  timestamp: number;
}

/**
 * Transfer result to be verified.
 */
export interface TransferResultForVerification {
  /** Unique transfer identifier */
  transferId: string;
  /** Source domain */
  sourceDomain: string;
  /** Target domain */
  targetDomain: string;
  /** Source domain performance BEFORE the transfer */
  sourcePerformanceBefore: DomainPerformanceSnapshot;
  /** Source domain performance AFTER the transfer */
  sourcePerformanceAfter: DomainPerformanceSnapshot;
  /** Target domain performance BEFORE the transfer */
  targetPerformanceBefore: DomainPerformanceSnapshot;
  /** Target domain performance AFTER the transfer */
  targetPerformanceAfter: DomainPerformanceSnapshot;
}

/**
 * Result of the transfer verification.
 */
export interface VerificationResult {
  /** Whether the transfer passed verification */
  passed: boolean;
  /** Whether the source domain maintained performance */
  sourceStable: boolean;
  /** Whether the target domain improved */
  targetImproved: boolean;
  /** Change in source domain success rate */
  sourceDelta: number;
  /** Change in target domain success rate */
  targetDelta: number;
  /** Change in source domain confidence */
  sourceConfidenceDelta: number;
  /** Change in target domain confidence */
  targetConfidenceDelta: number;
  /** Failure reason (when passed is false) */
  failureReason?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for transfer verification thresholds.
 */
export interface TransferVerificationConfig {
  /**
   * Maximum allowed regression in source domain success rate.
   * A small tolerance is permitted to account for noise.
   * @default 0.05 (5%)
   */
  maxSourceRegression: number;

  /**
   * Minimum required improvement in target domain success rate.
   * Set to 0 to allow neutral transfers (no improvement but no regression).
   * @default 0.0
   */
  minTargetImprovement: number;

  /**
   * Maximum allowed regression in source domain confidence.
   * @default 0.1
   */
  maxSourceConfidenceRegression: number;
}

/** Default verification configuration */
export const DEFAULT_VERIFICATION_CONFIG: TransferVerificationConfig = {
  maxSourceRegression: 0.05,
  minTargetImprovement: 0.0,
  maxSourceConfidenceRegression: 0.1,
};

// ============================================================================
// Transfer Verifier
// ============================================================================

/**
 * Verifies cross-domain transfers to prevent regression.
 *
 * The verifier applies a double-gate:
 *   Gate 1 (Source Stability): Source domain must not regress beyond tolerance
 *   Gate 2 (Target Improvement): Target domain must improve or stay neutral
 *
 * Both gates must pass for the transfer to be approved.
 */
export class TransferVerifier {
  private readonly config: TransferVerificationConfig;

  constructor(config: Partial<TransferVerificationConfig> = {}) {
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...config };
  }

  /**
   * Verify that a transfer did not cause regression in either domain.
   *
   * @param result - The transfer result containing before/after performance data
   * @returns Verification result with pass/fail and detailed deltas
   */
  verifyTransfer(result: TransferResultForVerification): VerificationResult {
    const sourceDelta =
      result.sourcePerformanceAfter.successRate -
      result.sourcePerformanceBefore.successRate;

    const targetDelta =
      result.targetPerformanceAfter.successRate -
      result.targetPerformanceBefore.successRate;

    const sourceConfidenceDelta =
      result.sourcePerformanceAfter.avgConfidence -
      result.sourcePerformanceBefore.avgConfidence;

    const targetConfidenceDelta =
      result.targetPerformanceAfter.avgConfidence -
      result.targetPerformanceBefore.avgConfidence;

    // Gate 1: Source domain must not regress beyond tolerance
    const sourceStable =
      sourceDelta >= -this.config.maxSourceRegression &&
      sourceConfidenceDelta >= -this.config.maxSourceConfidenceRegression;

    // Gate 2: Target domain must improve (or at least not degrade)
    const targetImproved = targetDelta >= this.config.minTargetImprovement;

    // Both gates must pass
    const passed = sourceStable && targetImproved;

    let failureReason: string | undefined;
    if (!passed) {
      const reasons: string[] = [];
      if (!sourceStable) {
        reasons.push(
          `source domain regressed: successRate delta=${sourceDelta.toFixed(4)}, ` +
          `confidence delta=${sourceConfidenceDelta.toFixed(4)}`,
        );
      }
      if (!targetImproved) {
        reasons.push(
          `target domain did not improve: successRate delta=${targetDelta.toFixed(4)}`,
        );
      }
      failureReason = reasons.join('; ');
    }

    if (!passed) {
      logger.warn('Transfer verification failed', {
        transferId: result.transferId,
        sourceDomain: result.sourceDomain,
        targetDomain: result.targetDomain,
        sourceDelta,
        targetDelta,
        failureReason,
      });
    } else {
      logger.debug('Transfer verification passed', {
        transferId: result.transferId,
        sourceDelta,
        targetDelta,
      });
    }

    return {
      passed,
      sourceStable,
      targetImproved,
      sourceDelta,
      targetDelta,
      sourceConfidenceDelta,
      targetConfidenceDelta,
      failureReason,
    };
  }

  /** Get the current verification configuration */
  getConfig(): TransferVerificationConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a transfer verifier with the given configuration.
 */
export function createTransferVerifier(
  config?: Partial<TransferVerificationConfig>,
): TransferVerifier {
  return new TransferVerifier(config);
}
