/**
 * Agentic QE v3 - Coherence Gate Controller
 * ADR-030: 4-tier compute allocation based on lambda coherence
 *
 * Evaluates quality lambda and makes 4-tier deployment decisions.
 * Based on ruvector-mincut-gated-transformer's gate control patterns.
 */

import {
  QualityLambda,
  QualityLambdaFlags,
  QualityTier,
  QualityGateReason,
  QualityAction,
  QualityGateDecision,
  CoherenceGatePolicy,
  DEFAULT_COHERENCE_GATE_POLICY,
  QualityDimensions,
} from './types';
import { LambdaCalculator, createLambdaCalculator } from './lambda-calculator';

/**
 * Configuration for the coherence gate controller
 */
export interface CoherenceGateControllerConfig {
  /** Policy settings */
  policy: CoherenceGatePolicy;

  /** Enable detailed explanations */
  verboseExplanations: boolean;

  /** Store decision history */
  recordHistory: boolean;

  /** Maximum history entries to keep */
  maxHistoryEntries: number;
}

/**
 * Default controller configuration
 */
const DEFAULT_CONTROLLER_CONFIG: CoherenceGateControllerConfig = {
  policy: DEFAULT_COHERENCE_GATE_POLICY,
  verboseExplanations: true,
  recordHistory: true,
  maxHistoryEntries: 100,
};

/**
 * Coherence Gate Controller
 * Makes 4-tier quality decisions based on lambda coherence metrics
 */
export class CoherenceGateController {
  private readonly config: CoherenceGateControllerConfig;
  private readonly lambdaCalculator: LambdaCalculator;
  private readonly decisionHistory: QualityGateDecision[] = [];

  constructor(config: Partial<CoherenceGateControllerConfig> = {}) {
    // Deep copy policy to prevent mutation of DEFAULT_COHERENCE_GATE_POLICY
    const defaultPolicy = { ...DEFAULT_COHERENCE_GATE_POLICY };
    const mergedConfig = { ...DEFAULT_CONTROLLER_CONFIG, ...config };
    this.config = {
      ...mergedConfig,
      policy: { ...defaultPolicy, ...(config.policy || {}) },
    };
    this.lambdaCalculator = createLambdaCalculator({
      policy: this.config.policy,
    });
  }

  /**
   * Evaluate quality lambda and return a 4-tier decision
   */
  evaluate(lambda: QualityLambda): QualityGateDecision {
    const reasons: QualityGateReason[] = [];

    // Check for forced flags first (highest priority)
    if (lambda.flags & QualityLambdaFlags.FORCE_QUARANTINE) {
      return this.createDecision('quarantine', 'forcedByFlag', [], lambda);
    }

    if (lambda.flags & QualityLambdaFlags.FORCE_SAFE) {
      return this.createDecision('freezeWrites', 'forcedByFlag', [], lambda);
    }

    if (lambda.flags & QualityLambdaFlags.BYPASS_CHECKS) {
      return this.createDecision('allow', 'none', [], lambda);
    }

    // Check 1: Lambda minimum threshold
    if (lambda.lambda < this.config.policy.lambdaMin) {
      reasons.push('lambdaBelowMin');
    }

    // Check 2: Lambda drop rate
    const dropRatioQ15 = this.calculateDropRatio(lambda);
    if (dropRatioQ15 > this.config.policy.dropRatioQ15Max) {
      reasons.push('lambdaDroppedFast');
    }

    // Check 3: Boundary edges (too many dimensions at threshold)
    if (lambda.boundaryEdges > this.config.policy.boundaryEdgesMax) {
      reasons.push('boundarySpike');
    }

    // Check 4: Boundary concentration
    if (lambda.boundaryConcentrationQ15 < this.config.policy.boundaryConcentrationQ15Max) {
      // Lower Q15 value means more concentrated issues (worse)
      reasons.push('boundaryConcentrationSpike');
    }

    // Check 5: Partition drift
    if (lambda.partitionCount > this.config.policy.partitionsMax) {
      reasons.push('partitionDrift');
    }

    // Check 6: Critical dimension failures
    const criticalFailure = this.checkCriticalDimensions(lambda.dimensions);
    if (criticalFailure) {
      reasons.push(criticalFailure);
    }

    // Determine tier based on reasons
    return this.determineDecision(lambda, reasons);
  }

  /**
   * Quick evaluation returning just the tier
   */
  evaluateTier(lambda: QualityLambda): QualityTier {
    return this.evaluate(lambda).tier;
  }

  /**
   * Check if deployment is allowed
   */
  canDeploy(lambda: QualityLambda): boolean {
    const decision = this.evaluate(lambda);
    return decision.decision === 'allow' ||
           (decision.decision === 'reduceScope' && this.config.policy.allowDeployWhenUnstable);
  }

  /**
   * Get the decision history
   */
  getHistory(): QualityGateDecision[] {
    return [...this.decisionHistory];
  }

  /**
   * Clear decision history
   */
  clearHistory(): void {
    this.decisionHistory.length = 0;
  }

  /**
   * Get the current policy
   */
  getPolicy(): CoherenceGatePolicy {
    return { ...this.config.policy };
  }

  /**
   * Update policy settings
   * Note: This creates a new policy object to avoid mutating any shared references
   */
  updatePolicy(policy: Partial<CoherenceGatePolicy>): void {
    // Create new policy object instead of mutating in place
    (this.config as { policy: CoherenceGatePolicy }).policy = {
      ...this.config.policy,
      ...policy,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculate drop ratio in Q15 format
   */
  private calculateDropRatio(lambda: QualityLambda): number {
    if (lambda.lambdaPrev === 0 || lambda.lambdaPrev === lambda.lambda) {
      return 0;
    }

    const drop = lambda.lambdaPrev - lambda.lambda;
    if (drop <= 0) {
      return 0; // No drop (improved or stayed same)
    }

    return Math.round((drop / lambda.lambdaPrev) * 32767);
  }

  /**
   * Check critical dimensions for failures
   */
  private checkCriticalDimensions(dimensions: QualityDimensions): QualityGateReason | null {
    // Security is critical
    if (dimensions.security < 0.5) {
      return 'securityCritical';
    }

    // Test pass rate is critical
    if (dimensions.passRate < 0.8) {
      return 'testFailureSpike';
    }

    // Coverage drop is concerning (if previously high)
    if (dimensions.coverage < 0.5) {
      return 'coverageDrop';
    }

    return null;
  }

  /**
   * Determine the final decision based on collected reasons
   */
  private determineDecision(
    lambda: QualityLambda,
    reasons: QualityGateReason[]
  ): QualityGateDecision {
    if (reasons.length === 0) {
      // All checks passed - Tier 0: Normal
      return this.createDecision('allow', 'none', [], lambda);
    }

    // Check for critical reasons that require quarantine (Tier 3)
    const quarantineReasons: QualityGateReason[] = ['lambdaBelowMin', 'securityCritical'];
    const hasQuarantineReason = reasons.some(r => quarantineReasons.includes(r));

    if (hasQuarantineReason) {
      return this.createDecision(
        'quarantine',
        reasons[0],
        reasons.slice(1),
        lambda
      );
    }

    // Check for safe mode reasons (Tier 2)
    const safeModeReasons: QualityGateReason[] = ['testFailureSpike', 'partitionDrift'];
    const hasSafeModeReason = reasons.some(r => safeModeReasons.includes(r));

    if (hasSafeModeReason && reasons.length > 1) {
      return this.createDecision(
        'freezeWrites',
        reasons[0],
        reasons.slice(1),
        lambda
      );
    }

    // Otherwise, reduced scope (Tier 1)
    return this.createDecision(
      'reduceScope',
      reasons[0],
      reasons.slice(1),
      lambda
    );
  }

  /**
   * Create a complete decision object
   */
  private createDecision(
    decision: QualityGateDecision['decision'],
    reason: QualityGateReason,
    additionalReasons: QualityGateReason[],
    lambda: QualityLambda
  ): QualityGateDecision {
    const tier = this.decisionToTier(decision);
    const actions = this.getActionsForTier(tier, reason);
    const confidence = this.calculateConfidence(lambda, tier);
    const explanation = this.generateExplanation(decision, reason, additionalReasons, lambda);

    const result: QualityGateDecision = {
      decision,
      reason,
      additionalReasons: additionalReasons.length > 0 ? additionalReasons : undefined,
      tier,
      actions,
      confidence,
      explanation,
      lambda,
      decidedAt: new Date(),
      ttlSeconds: this.config.policy.decisionTtlSeconds,
      overridable: tier < QualityTier.QUARANTINE,
    };

    // Record in history
    if (this.config.recordHistory) {
      this.recordDecision(result);
    }

    return result;
  }

  /**
   * Convert decision string to tier enum
   */
  private decisionToTier(decision: QualityGateDecision['decision']): QualityTier {
    switch (decision) {
      case 'allow':
        return QualityTier.NORMAL;
      case 'reduceScope':
        return QualityTier.REDUCED;
      case 'freezeWrites':
        return QualityTier.SAFE;
      case 'quarantine':
        return QualityTier.QUARANTINE;
    }
  }

  /**
   * Get recommended actions for a given tier
   */
  private getActionsForTier(tier: QualityTier, reason: QualityGateReason): QualityAction[] {
    switch (tier) {
      case QualityTier.NORMAL:
        return [];

      case QualityTier.REDUCED:
        const reducedActions: QualityAction[] = [
          'runAdditionalTests',
          'notifyReviewers',
          'requireApproval',
        ];
        if (reason === 'lambdaDroppedFast') {
          reducedActions.push('increaseMonitoring');
        }
        return reducedActions;

      case QualityTier.SAFE:
        const safeActions: QualityAction[] = [
          'blockDeploy',
          'alertTeam',
          'scheduleReview',
          'generateReport',
        ];
        if (reason === 'testFailureSpike') {
          safeActions.push('runAdditionalTests');
        }
        return safeActions;

      case QualityTier.QUARANTINE:
        const quarantineActions: QualityAction[] = [
          'blockAllDeploys',
          'escalateToLeads',
          'rollbackIfNeeded',
          'generateReport',
        ];
        if (reason === 'securityCritical') {
          quarantineActions.push('runSecurityScan');
        }
        return quarantineActions;
    }
  }

  /**
   * Calculate confidence in the decision
   */
  private calculateConfidence(lambda: QualityLambda, tier: QualityTier): number {
    // Base confidence based on tier
    let confidence = 1.0;

    // Reduce confidence if first evaluation
    if (lambda.flags & QualityLambdaFlags.FIRST_EVALUATION) {
      confidence *= 0.8;
    }

    // Reduce confidence if at boundary
    if (lambda.boundaryEdges > 0) {
      confidence *= (1 - lambda.boundaryEdges * 0.1);
    }

    // Adjust by tier (higher tiers have higher confidence since more checks failed)
    if (tier === QualityTier.REDUCED) {
      confidence *= 0.85;
    } else if (tier === QualityTier.SAFE) {
      confidence *= 0.95;
    }

    return Math.max(Math.min(confidence, 1.0), 0.5);
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    decision: QualityGateDecision['decision'],
    reason: QualityGateReason,
    additionalReasons: QualityGateReason[],
    lambda: QualityLambda
  ): string {
    if (!this.config.verboseExplanations) {
      return this.getBasicExplanation(decision, reason);
    }

    const parts: string[] = [];

    // Main decision
    switch (decision) {
      case 'allow':
        parts.push(`Quality coherence is stable (lambda: ${lambda.lambda}).`);
        parts.push('All deployment checks passed.');
        break;

      case 'reduceScope':
        parts.push(`Quality instability detected (lambda: ${lambda.lambda}).`);
        parts.push(`Primary concern: ${this.reasonToString(reason)}.`);
        parts.push('Additional verification required before deployment.');
        break;

      case 'freezeWrites':
        parts.push(`Quality coherence compromised (lambda: ${lambda.lambda}).`);
        parts.push(`Critical issue: ${this.reasonToString(reason)}.`);
        parts.push('Deployment blocked pending quality review.');
        break;

      case 'quarantine':
        parts.push(`Critical quality failure (lambda: ${lambda.lambda}).`);
        parts.push(`Blocking issue: ${this.reasonToString(reason)}.`);
        parts.push('All deployments quarantined until resolved.');
        break;
    }

    // Additional reasons
    if (additionalReasons.length > 0) {
      const additionalStr = additionalReasons.map(r => this.reasonToString(r)).join(', ');
      parts.push(`Additional concerns: ${additionalStr}.`);
    }

    // Dimension summary
    const summary = this.getDimensionSummary(lambda.dimensions);
    parts.push(
      `Quality dimensions: ${summary.healthy} healthy, ${summary.warning} warning, ${summary.critical} critical.`
    );

    return parts.join(' ');
  }

  /**
   * Get basic explanation for decision
   */
  private getBasicExplanation(
    decision: QualityGateDecision['decision'],
    reason: QualityGateReason
  ): string {
    switch (decision) {
      case 'allow':
        return 'Quality coherence is stable. Deployment allowed.';
      case 'reduceScope':
        return `Quality instability detected: ${reason}. Additional verification required.`;
      case 'freezeWrites':
        return `Quality coherence compromised: ${reason}. Deployment blocked pending review.`;
      case 'quarantine':
        return `Critical quality failure: ${reason}. All deployments quarantined.`;
    }
  }

  /**
   * Convert reason enum to human-readable string
   */
  private reasonToString(reason: QualityGateReason): string {
    const reasonStrings: Record<QualityGateReason, string> = {
      'none': 'no issues',
      'lambdaBelowMin': 'quality lambda below minimum threshold',
      'lambdaDroppedFast': 'quality lambda dropped rapidly',
      'boundarySpike': 'multiple quality dimensions at threshold boundary',
      'boundaryConcentrationSpike': 'quality issues concentrated in critical areas',
      'partitionDrift': 'quality partitions have drifted apart',
      'forcedByFlag': 'forced by control flag',
      'securityCritical': 'critical security vulnerability detected',
      'coverageDrop': 'significant test coverage decrease',
      'testFailureSpike': 'sudden increase in test failures',
    };

    return reasonStrings[reason] || reason;
  }

  /**
   * Get summary of dimension health
   */
  private getDimensionSummary(dimensions: QualityDimensions): {
    healthy: number;
    warning: number;
    critical: number;
  } {
    const thresh = this.config.policy.boundaryThreshold;
    const criticalThresh = thresh - this.config.policy.boundaryTolerance;

    let healthy = 0;
    let warning = 0;
    let critical = 0;

    const entries = Object.entries(dimensions) as [keyof QualityDimensions, number | undefined][];

    for (const [, value] of entries) {
      if (value !== undefined) {
        if (value >= thresh) {
          healthy++;
        } else if (value >= criticalThresh) {
          warning++;
        } else {
          critical++;
        }
      }
    }

    return { healthy, warning, critical };
  }

  /**
   * Record decision in history
   */
  private recordDecision(decision: QualityGateDecision): void {
    this.decisionHistory.push(decision);

    // Trim history if needed
    while (this.decisionHistory.length > this.config.maxHistoryEntries) {
      this.decisionHistory.shift();
    }
  }
}

/**
 * Factory function to create a coherence gate controller
 */
export function createCoherenceGateController(
  config?: Partial<CoherenceGateControllerConfig>
): CoherenceGateController {
  return new CoherenceGateController(config);
}

/**
 * Convenience function to evaluate lambda and get decision
 */
export function evaluateQualityGate(
  lambda: QualityLambda,
  policy?: Partial<CoherenceGatePolicy>
): QualityGateDecision {
  const controller = createCoherenceGateController({
    policy: { ...DEFAULT_COHERENCE_GATE_POLICY, ...policy },
  });
  return controller.evaluate(lambda);
}
