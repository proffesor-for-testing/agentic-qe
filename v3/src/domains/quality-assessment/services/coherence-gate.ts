/**
 * Agentic QE v3 - Coherence-Enhanced Quality Gate Service
 * ADR-030: Integrates lambda-coherence with existing quality gate evaluation
 *
 * This service extends the basic QualityGateService with coherence-based
 * 4-tier decision making using RuVector-inspired patterns.
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  GateEvaluationRequest,
  GateResult,
  QualityMetrics,
} from '../interfaces';
import { QualityGateService } from './quality-gate';
import {
  QualityLambda,
  QualityGateDecision,
  QualityMetricsInput,
  QualityTier,
  CoherenceGatePolicy,
  DEFAULT_COHERENCE_GATE_POLICY,
  QualitySummary,
} from '../coherence';
import {
  LambdaCalculator,
  createLambdaCalculator,
} from '../coherence/lambda-calculator';
import {
  CoherenceGateController,
  createCoherenceGateController,
} from '../coherence/gate-controller';
import { toError } from '../../../shared/error-utils.js';
import {
  PartitionDetector,
  createPartitionDetector,
  PartitionDetectionResult,
} from '../coherence/partition-detector';

/**
 * Extended gate result with coherence information
 */
export interface CoherenceGateResult extends GateResult {
  /** Coherence decision */
  coherenceDecision: QualityGateDecision;

  /** Partition analysis */
  partitionResult: PartitionDetectionResult;

  /** Lambda value (0-100) */
  lambdaValue: number;

  /** Quality tier (0-3) */
  tier: QualityTier;

  /** Whether traditional gate passed but coherence failed */
  coherenceOverride: boolean;
}

/**
 * Configuration for coherence-enhanced gate service
 */
export interface CoherenceGateServiceConfig {
  /** Coherence policy settings */
  policy: CoherenceGatePolicy;

  /** Enable coherence override (coherence can block even if traditional passes) */
  enableCoherenceOverride: boolean;

  /** Store detailed coherence history */
  storeDetailedHistory: boolean;

  /** Maximum history entries */
  maxHistoryEntries: number;
}

/**
 * Default service configuration
 */
const DEFAULT_SERVICE_CONFIG: CoherenceGateServiceConfig = {
  policy: DEFAULT_COHERENCE_GATE_POLICY,
  enableCoherenceOverride: true,
  storeDetailedHistory: true,
  maxHistoryEntries: 100,
};

/**
 * Coherence-Enhanced Quality Gate Service
 * Combines traditional threshold checking with lambda-coherence analysis
 */
export class CoherenceGateService extends QualityGateService {
  private readonly serviceConfig: CoherenceGateServiceConfig;
  private readonly lambdaCalculator: LambdaCalculator;
  private readonly gateController: CoherenceGateController;
  private readonly partitionDetector: PartitionDetector;
  private readonly coherenceHistory: CoherenceGateResult[] = [];

  constructor(
    memory: MemoryBackend,
    config: Partial<CoherenceGateServiceConfig> = {}
  ) {
    super(memory);
    this.serviceConfig = { ...DEFAULT_SERVICE_CONFIG, ...config };

    // Initialize coherence components
    this.lambdaCalculator = createLambdaCalculator({
      policy: this.serviceConfig.policy,
    });
    this.gateController = createCoherenceGateController({
      policy: this.serviceConfig.policy,
    });
    this.partitionDetector = createPartitionDetector({
      policy: this.serviceConfig.policy,
    });
  }

  /**
   * Evaluate quality gate with coherence analysis
   */
  async evaluateGateWithCoherence(
    request: GateEvaluationRequest,
    previousLambda?: number
  ): Promise<Result<CoherenceGateResult, Error>> {
    try {
      // Step 1: Run traditional gate evaluation
      const traditionalResult = await this.evaluateGate(request);

      if (!traditionalResult.success) {
        return err(traditionalResult.error);
      }

      // Step 2: Convert metrics to coherence input
      const coherenceMetrics = this.convertToCoherenceMetrics(
        request.metrics,
        previousLambda
      );

      // Step 3: Calculate lambda
      const lambda = this.lambdaCalculator.calculate(coherenceMetrics);

      // Step 4: Update with partition info
      const updatedLambda = this.partitionDetector.updateLambdaWithPartitions(lambda);

      // Step 5: Detect partitions
      const partitionResult = this.partitionDetector.detect(lambda.dimensions);

      // Step 6: Get coherence decision
      const coherenceDecision = this.gateController.evaluate(updatedLambda);

      // Step 7: Determine if coherence overrides traditional result
      const coherenceOverride = this.checkCoherenceOverride(
        traditionalResult.value,
        coherenceDecision
      );

      // Step 8: Create extended result
      const result: CoherenceGateResult = {
        ...traditionalResult.value,
        // Override pass status if coherence fails
        passed: coherenceOverride
          ? coherenceDecision.tier === QualityTier.NORMAL
          : traditionalResult.value.passed,
        coherenceDecision,
        partitionResult,
        lambdaValue: updatedLambda.lambda,
        tier: coherenceDecision.tier,
        coherenceOverride,
      };

      // Step 9: Store in memory
      await this.storeCoherenceResult(result);

      // Step 10: Add to history
      if (this.serviceConfig.storeDetailedHistory) {
        this.recordHistory(result);
      }

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Quick lambda calculation from metrics
   */
  calculateLambda(metrics: QualityMetrics, previousLambda?: number): QualityLambda {
    const coherenceMetrics = this.convertToCoherenceMetrics(metrics, previousLambda);
    return this.lambdaCalculator.calculate(coherenceMetrics);
  }

  /**
   * Quick check if deployment is allowed
   */
  canDeploy(metrics: QualityMetrics, previousLambda?: number): boolean {
    const lambda = this.calculateLambda(metrics, previousLambda);
    const updatedLambda = this.partitionDetector.updateLambdaWithPartitions(lambda);
    return this.gateController.canDeploy(updatedLambda);
  }

  /**
   * Get quality summary
   */
  getQualitySummary(metrics: QualityMetrics, previousLambda?: number): QualitySummary {
    const lambda = this.calculateLambda(metrics, previousLambda);
    const updatedLambda = this.partitionDetector.updateLambdaWithPartitions(lambda);
    const partitionResult = this.partitionDetector.detect(lambda.dimensions);
    const decision = this.gateController.evaluate(updatedLambda);

    return {
      lambda: updatedLambda.lambda,
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
   * Get coherence evaluation history
   */
  getCoherenceHistory(): CoherenceGateResult[] {
    return [...this.coherenceHistory];
  }

  /**
   * Get lambda trend over recent evaluations
   */
  getLambdaTrend(): { values: number[]; direction: 'improving' | 'declining' | 'stable' } {
    const values = this.coherenceHistory.map(r => r.lambdaValue);

    if (values.length < 2) {
      return { values, direction: 'stable' };
    }

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const delta = avgSecond - avgFirst;

    if (delta > 5) {
      return { values, direction: 'improving' };
    } else if (delta < -5) {
      return { values, direction: 'declining' };
    }
    return { values, direction: 'stable' };
  }

  /**
   * Update coherence policy
   */
  updatePolicy(policy: Partial<CoherenceGatePolicy>): void {
    this.gateController.updatePolicy(policy);
    Object.assign(this.serviceConfig.policy, policy);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.coherenceHistory.length = 0;
    this.gateController.clearHistory();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Convert QualityMetrics to coherence input format
   */
  private convertToCoherenceMetrics(
    metrics: QualityMetrics,
    previousLambda?: number
  ): QualityMetricsInput {
    return {
      lineCoverage: metrics.coverage,
      testPassRate: metrics.testsPassing,
      criticalVulns: metrics.securityVulnerabilities,
      p95Latency: 100, // Default if not provided
      targetLatency: 200, // Default target
      maintainabilityIndex: 100 - metrics.technicalDebt * 10, // Convert debt hours to index
      duplicationPercent: metrics.duplications,
      previousLambda,
    };
  }

  /**
   * Check if coherence should override traditional result
   */
  private checkCoherenceOverride(
    traditionalResult: GateResult,
    coherenceDecision: QualityGateDecision
  ): boolean {
    if (!this.serviceConfig.enableCoherenceOverride) {
      return false;
    }

    // If traditional passed but coherence says no, override
    if (traditionalResult.passed && coherenceDecision.tier >= QualityTier.SAFE) {
      return true;
    }

    return false;
  }

  /**
   * Store coherence result in memory
   */
  private async storeCoherenceResult(result: CoherenceGateResult): Promise<void> {
    const key = `quality-gate:coherence:${result.gateName}:${Date.now()}`;

    await (this as unknown as { memory: MemoryBackend }).memory.set(
      key,
      {
        gateName: result.gateName,
        passed: result.passed,
        lambdaValue: result.lambdaValue,
        tier: result.tier,
        decision: result.coherenceDecision.decision,
        reason: result.coherenceDecision.reason,
        partitionCount: result.partitionResult.partitionCount,
        timestamp: new Date().toISOString(),
      },
      { namespace: 'quality-assessment', ttl: 86400 * 30 }
    );
  }

  /**
   * Record result in history
   */
  private recordHistory(result: CoherenceGateResult): void {
    this.coherenceHistory.push(result);

    // Trim history
    while (this.coherenceHistory.length > this.serviceConfig.maxHistoryEntries) {
      this.coherenceHistory.shift();
    }
  }
}

/**
 * Factory function to create a coherence-enhanced gate service
 */
export function createCoherenceGateService(
  memory: MemoryBackend,
  config?: Partial<CoherenceGateServiceConfig>
): CoherenceGateService {
  return new CoherenceGateService(memory, config);
}
