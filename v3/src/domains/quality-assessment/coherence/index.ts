/**
 * Agentic QE v3 - Coherence-Gated Quality Gates Module
 * ADR-030: RuVector lambda-coherence integration with 4-tier compute allocation
 *
 * This module provides coherence-based quality gate decisions using:
 * - Lambda calculation (minimum cut in quality dimension graph)
 * - 4-tier response allocation (Normal, Reduced, Safe, Quarantine)
 * - Quality partition detection (clusters of related issues)
 *
 * @example
 * ```typescript
 * import {
 *   calculateQualityLambda,
 *   evaluateQualityGate,
 *   detectQualityPartitions,
 *   QualityTier,
 * } from './coherence';
 *
 * // Calculate lambda from raw metrics
 * const lambda = calculateQualityLambda({
 *   lineCoverage: 85,
 *   testPassRate: 98,
 *   criticalVulns: 0,
 *   p95Latency: 150,
 *   targetLatency: 200,
 *   maintainabilityIndex: 75,
 * });
 *
 * // Get 4-tier decision
 * const decision = evaluateQualityGate(lambda);
 *
 * if (decision.tier === QualityTier.NORMAL) {
 *   console.log('Deployment allowed');
 * } else {
 *   console.log(`Actions required: ${decision.actions.join(', ')}`);
 * }
 *
 * // Detect quality partitions
 * const partitions = detectQualityPartitions(lambda.dimensions);
 * console.log(`Found ${partitions.partitionCount} quality partitions`);
 * ```
 */

// Types
export {
  // Lambda Types
  QualityLambda,
  QualityDimensions,
  QualityMetricsInput,
  QualityLambdaFlags,

  // 4-Tier Response Types
  QualityTier,
  QualityGateReason,
  QualityAction,
  QualityGateDecision,

  // Policy Types
  CoherenceGatePolicy,
  DEFAULT_COHERENCE_GATE_POLICY,

  // Partition Types
  QualityPartition,
  QualityPartitionType,

  // History Types
  LambdaHistoryPoint,
  LambdaTrend,
} from './types';

// Lambda Calculator
export {
  LambdaCalculator,
  createLambdaCalculator,
  calculateQualityLambda,
} from './lambda-calculator';

export type {
  LambdaCalculatorConfig,
} from './lambda-calculator';

// Gate Controller
export {
  CoherenceGateController,
  createCoherenceGateController,
  evaluateQualityGate,
} from './gate-controller';

export type {
  CoherenceGateControllerConfig,
} from './gate-controller';

// Partition Detector
export {
  PartitionDetector,
  createPartitionDetector,
  detectQualityPartitions,
} from './partition-detector';

export type {
  PartitionDetectorConfig,
  PartitionDetectionResult,
  RemediationStep,
  RemediationPlan,
} from './partition-detector';

// ============================================================================
// Convenience Functions
// ============================================================================

import { QualityMetricsInput, QualityGateDecision, QualityLambda } from './types';
import { calculateQualityLambda } from './lambda-calculator';
import { evaluateQualityGate } from './gate-controller';
import { createPartitionDetector } from './partition-detector';

/**
 * End-to-end coherence gate evaluation from raw metrics
 *
 * @param metrics - Raw quality metrics
 * @returns Complete quality gate decision with lambda and partitions
 */
export function evaluateCoherenceGate(metrics: QualityMetricsInput): QualityGateDecision {
  // Step 1: Calculate lambda
  const lambda = calculateQualityLambda(metrics);

  // Step 2: Detect partitions and update lambda
  const partitionDetector = createPartitionDetector();
  const updatedLambda = partitionDetector.updateLambdaWithPartitions(lambda);

  // Step 3: Get gate decision
  return evaluateQualityGate(updatedLambda);
}

/**
 * Quick check if deployment is allowed based on metrics
 *
 * @param metrics - Raw quality metrics
 * @returns true if deployment is allowed
 */
export function canDeploy(metrics: QualityMetricsInput): boolean {
  const decision = evaluateCoherenceGate(metrics);
  return decision.decision === 'allow';
}

/**
 * Get the quality tier from raw metrics
 *
 * @param metrics - Raw quality metrics
 * @returns Quality tier (0-3)
 */
export function getQualityTier(metrics: QualityMetricsInput): number {
  const decision = evaluateCoherenceGate(metrics);
  return decision.tier;
}

/**
 * Calculate and return just the lambda value from metrics
 *
 * @param metrics - Raw quality metrics
 * @returns Lambda value (0-100)
 */
export function getLambdaValue(metrics: QualityMetricsInput): number {
  const lambda = calculateQualityLambda(metrics);
  return lambda.lambda;
}

/**
 * Get a summary of quality issues
 *
 * @param metrics - Raw quality metrics
 * @returns Summary object with issues and recommendations
 */
export function getQualitySummary(metrics: QualityMetricsInput): QualitySummary {
  const lambda = calculateQualityLambda(metrics);
  const partitionDetector = createPartitionDetector();
  const partitionResult = partitionDetector.detect(lambda.dimensions);
  const decision = evaluateQualityGate(partitionDetector.updateLambdaWithPartitions(lambda));

  return {
    lambda: lambda.lambda,
    tier: decision.tier,
    decision: decision.decision,
    partitionCount: partitionResult.partitionCount,
    isFragmented: partitionResult.isFragmented,
    actions: decision.actions,
    explanation: decision.explanation,
    topIssue: partitionResult.priorityPartition?.type,
    topRemediation: partitionResult.priorityPartition?.remediation,
  };
}

/**
 * Quality summary result type
 */
export interface QualitySummary {
  lambda: number;
  tier: number;
  decision: string;
  partitionCount: number;
  isFragmented: boolean;
  actions: string[];
  explanation: string;
  topIssue?: string;
  topRemediation?: string;
}
