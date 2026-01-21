/**
 * Agentic QE v3 - Coherence-Gated Quality Gates Types
 * ADR-030: RuVector lambda-coherence integration with 4-tier compute allocation
 *
 * Based on ruvector-mincut-gated-transformer's coherence gate pattern
 */

// ============================================================================
// Quality Lambda Types
// ============================================================================

/**
 * Quality Lambda represents the "minimum cut" between acceptable and unacceptable quality states.
 * Inspired by ruvector-mincut-gated-transformer's gate.rs
 */
export interface QualityLambda {
  /** Current lambda value (0-100 scale) - minimum quality dimension */
  lambda: number;

  /** Previous lambda value for delta/drop calculation */
  lambdaPrev: number;

  /** Number of quality dimensions at boundary (near threshold, unstable) */
  boundaryEdges: number;

  /** Concentration of instability (Q15 fixed-point: 0-32767, where 32767 = 100%) */
  boundaryConcentrationQ15: number;

  /** Number of quality partitions (fragmented quality clusters) */
  partitionCount: number;

  /** Control flags for forced states */
  flags: QualityLambdaFlags;

  /** Timestamp of calculation */
  calculatedAt: Date;

  /** Individual dimension values (normalized 0-1) */
  dimensions: QualityDimensions;
}

/**
 * Quality dimensions normalized to 0-1 scale
 */
export interface QualityDimensions {
  /** Line/statement coverage (0-1) */
  coverage: number;

  /** Test pass rate (0-1) */
  passRate: number;

  /** Security score (0-1, where 1 = no vulnerabilities) */
  security: number;

  /** Performance score (0-1, based on P95 latency vs target) */
  performance: number;

  /** Maintainability index (0-1) */
  maintainability: number;

  /** Reliability score (0-1, based on flaky test ratio) */
  reliability: number;

  /** Technical debt ratio (0-1, where 1 = no debt) */
  technicalDebt?: number;

  /** Code duplication score (0-1, where 1 = no duplication) */
  duplication?: number;
}

/**
 * Raw quality metrics input (before normalization)
 */
export interface QualityMetricsInput {
  /** Line coverage percentage (0-100) */
  lineCoverage: number;

  /** Branch coverage percentage (0-100, optional) */
  branchCoverage?: number;

  /** Test pass rate percentage (0-100) */
  testPassRate: number;

  /** Count of critical security vulnerabilities */
  criticalVulns: number;

  /** Count of high severity vulnerabilities */
  highVulns?: number;

  /** Count of medium severity vulnerabilities */
  mediumVulns?: number;

  /** P95 latency in milliseconds */
  p95Latency: number;

  /** Target latency in milliseconds */
  targetLatency: number;

  /** Maintainability index (0-100) */
  maintainabilityIndex: number;

  /** Ratio of flaky tests (0-1) */
  flakyTestRatio?: number;

  /** Technical debt in hours */
  technicalDebtHours?: number;

  /** Maximum acceptable technical debt in hours */
  maxAcceptableDebtHours?: number;

  /** Code duplication percentage (0-100) */
  duplicationPercent?: number;

  /** Previous lambda value for trend detection */
  previousLambda?: number;
}

/**
 * Quality lambda control flags
 */
export enum QualityLambdaFlags {
  /** No flags set */
  NONE = 0,

  /** Force safe mode regardless of metrics */
  FORCE_SAFE = 1 << 0,

  /** Force quarantine regardless of metrics */
  FORCE_QUARANTINE = 1 << 1,

  /** Skip all quality checks (emergency bypass) */
  BYPASS_CHECKS = 1 << 2,

  /** Quality is trending downward */
  TRENDING_DOWN = 1 << 3,

  /** Quality is trending upward */
  TRENDING_UP = 1 << 4,

  /** First evaluation (no historical data) */
  FIRST_EVALUATION = 1 << 5,
}

// ============================================================================
// 4-Tier Response Types
// ============================================================================

/**
 * Quality tier for response allocation
 * Based on ruvector-mincut-gated-transformer's TierDecision
 */
export enum QualityTier {
  /** Tier 0: Normal operation - all checks pass, full deployment allowed */
  NORMAL = 0,

  /** Tier 1: Reduced scope - non-critical issues detected, additional verification required */
  REDUCED = 1,

  /** Tier 2: Safe mode - freeze risky operations, block deployment pending review */
  SAFE = 2,

  /** Tier 3: Quarantine - critical issues, block all deployments */
  QUARANTINE = 3,
}

/**
 * Reason for quality gate decision
 */
export type QualityGateReason =
  | 'none'                          // No issues, normal operation
  | 'lambdaBelowMin'               // Lambda below minimum threshold
  | 'lambdaDroppedFast'            // Lambda dropped too quickly (trend)
  | 'boundarySpike'                // Too many dimensions at boundary
  | 'boundaryConcentrationSpike'   // Instability concentrated in key areas
  | 'partitionDrift'               // Quality partitions drifted apart
  | 'forcedByFlag'                 // Forced by control flag
  | 'securityCritical'             // Critical security vulnerability
  | 'coverageDrop'                 // Significant coverage decrease
  | 'testFailureSpike';            // Sudden increase in test failures

/**
 * Quality actions to take based on decision
 */
export type QualityAction =
  | 'runAdditionalTests'           // Run more comprehensive tests
  | 'notifyReviewers'              // Notify code reviewers
  | 'requireApproval'              // Require explicit approval
  | 'blockDeploy'                  // Block deployment
  | 'alertTeam'                    // Alert development team
  | 'scheduleReview'               // Schedule a quality review
  | 'blockAllDeploys'              // Block all deployments
  | 'escalateToLeads'              // Escalate to tech leads
  | 'rollbackIfNeeded'             // Prepare rollback plan
  | 'increaseMonitoring'           // Increase production monitoring
  | 'runSecurityScan'              // Run additional security scans
  | 'generateReport';              // Generate detailed quality report

/**
 * Quality gate decision output
 */
export interface QualityGateDecision {
  /** Overall decision */
  decision: 'allow' | 'reduceScope' | 'freezeWrites' | 'quarantine';

  /** Primary reason for decision */
  reason: QualityGateReason;

  /** Additional reasons (if multiple issues detected) */
  additionalReasons?: QualityGateReason[];

  /** Tier level (0-3) */
  tier: QualityTier;

  /** Specific actions to take */
  actions: QualityAction[];

  /** Confidence in decision (0-1) */
  confidence: number;

  /** Human-readable explanation */
  explanation: string;

  /** Lambda metrics at time of decision */
  lambda: QualityLambda;

  /** Timestamp of decision */
  decidedAt: Date;

  /** Time to live for this decision in seconds */
  ttlSeconds: number;

  /** Can be overridden by authorized user */
  overridable: boolean;
}

// ============================================================================
// Policy Configuration Types
// ============================================================================

/**
 * Coherence gate policy configuration
 */
export interface CoherenceGatePolicy {
  /** Minimum lambda required for deployment (0-100, default: 60) */
  lambdaMin: number;

  /** Warning threshold for lambda (0-100, default: 70) */
  lambdaWarn: number;

  /** Maximum lambda drop ratio (Q15: 0-32767, default: 8192 = 25%) */
  dropRatioQ15Max: number;

  /** Maximum boundary edges before reducing scope (default: 3) */
  boundaryEdgesMax: number;

  /** Maximum boundary concentration Q15 (default: 16384 = 50%) */
  boundaryConcentrationQ15Max: number;

  /** Maximum partition count before concern (default: 4) */
  partitionsMax: number;

  /** Allow deployment with warnings when unstable (default: false) */
  allowDeployWhenUnstable: boolean;

  /** Boundary threshold for dimension detection (default: 0.7) */
  boundaryThreshold: number;

  /** Boundary tolerance for edge detection (default: 0.1) */
  boundaryTolerance: number;

  /** Decision TTL in seconds (default: 300) */
  decisionTtlSeconds: number;

  /** Enable trend analysis (default: true) */
  enableTrendAnalysis: boolean;

  /** Minimum samples for trend analysis (default: 3) */
  minTrendSamples: number;
}

/**
 * Default policy configuration
 */
export const DEFAULT_COHERENCE_GATE_POLICY: CoherenceGatePolicy = {
  lambdaMin: 60,
  lambdaWarn: 70,
  dropRatioQ15Max: 8192,  // 25% drop triggers reduced scope
  boundaryEdgesMax: 3,
  boundaryConcentrationQ15Max: 16384,  // 50% concentration triggers alert
  partitionsMax: 4,
  allowDeployWhenUnstable: false,
  boundaryThreshold: 0.7,
  boundaryTolerance: 0.1,
  decisionTtlSeconds: 300,
  enableTrendAnalysis: true,
  minTrendSamples: 3,
};

// ============================================================================
// Quality Partition Types
// ============================================================================

/**
 * A quality partition represents a cluster of related quality issues
 */
export interface QualityPartition {
  /** Unique partition identifier */
  id: string;

  /** Partition type/category */
  type: QualityPartitionType;

  /** Dimensions included in this partition */
  dimensions: (keyof QualityDimensions)[];

  /** Severity of this partition (0-1) */
  severity: number;

  /** Whether this partition is critical */
  isCritical: boolean;

  /** Related file paths (if applicable) */
  affectedPaths?: string[];

  /** Suggested remediation */
  remediation?: string;
}

/**
 * Quality partition types
 */
export type QualityPartitionType =
  | 'testing'           // Test coverage + pass rate issues
  | 'security'          // Security vulnerability issues
  | 'performance'       // Performance + reliability issues
  | 'maintainability'   // Technical debt + duplication issues
  | 'mixed';            // Mixed issues across categories

// ============================================================================
// Historical Tracking Types
// ============================================================================

/**
 * Historical lambda data point
 */
export interface LambdaHistoryPoint {
  /** Lambda value */
  lambda: number;

  /** Timestamp */
  timestamp: Date;

  /** Associated decision (if any) */
  decision?: QualityGateDecision;

  /** Commit SHA (if applicable) */
  commitSha?: string;

  /** Branch name (if applicable) */
  branch?: string;
}

/**
 * Lambda trend analysis result
 */
export interface LambdaTrend {
  /** Trend direction */
  direction: 'improving' | 'declining' | 'stable';

  /** Rate of change per day */
  ratePerDay: number;

  /** Confidence in trend (0-1) */
  confidence: number;

  /** Number of samples analyzed */
  sampleCount: number;

  /** Projected lambda in 7 days */
  projectedLambda7d?: number;

  /** Is trend concerning */
  isConcerning: boolean;
}
