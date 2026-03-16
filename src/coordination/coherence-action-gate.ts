/**
 * Coherence-Gated Agent Actions (Task 3.2, ADR-083)
 *
 * Evaluates agent actions through three stacked filters with
 * heuristic scoring with CUSUM drift detection:
 *   1. Structural filter: Action type familiarity and context completeness check
 *   2. Shift filter: Confidence-risk alignment with CUSUM change detection
 *   3. Evidence filter: Multiplicative context evidence accumulation score
 *
 * Decisions: PERMIT / DEFER / DENY
 *   - PERMIT: all filters pass (scores above permit thresholds)
 *   - DEFER: one or more filters marginal (needs human review)
 *   - DENY: one or more filters clearly fail
 *
 * Advisory mode by default: logs decisions but does not block execution.
 *
 * TypeScript implementation (no native package exists for this —
 * heuristic filters work well without native computation).
 *
 * @module coordination/coherence-action-gate
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { createLogger } from '../logging/logger-factory.js';
import { getRuVectorFeatureFlags } from '../integrations/ruvector/feature-flags.js';

const logger = createLogger('CoherenceActionGate');

// ============================================================================
// Types
// ============================================================================

/**
 * An action that an agent intends to perform.
 */
export interface AgentAction {
  /** Action type identifier */
  type: string;
  /** Domain the action belongs to */
  domain: string;
  /** Agent's confidence in the action (0-1) */
  confidence: number;
  /** Arbitrary context for the action */
  context: Record<string, unknown>;
  /** Risk classification */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Gate decision: PERMIT, DEFER, or DENY.
 */
export type GateDecision = 'PERMIT' | 'DEFER' | 'DENY';

/**
 * Full evaluation result from the three-filter pipeline.
 */
export interface GateEvaluation {
  /** Final decision */
  decision: GateDecision;
  /** Structural filter score (0-1, higher = better fit) */
  structuralScore: number;
  /** Shift filter score (0-1, higher = less shift) */
  shiftScore: number;
  /** Evidence filter score (0-1, higher = more evidence) */
  evidenceScore: number;
  /** Weighted combined score (0-1) */
  combinedScore: number;
  /** Human-readable reasoning for the decision */
  reasoning: string;
  /** Whether this was advisory-only (logged, not enforced) */
  advisory: boolean;
}

/**
 * Configurable thresholds for the three filters.
 */
export interface ThresholdConfig {
  /** Structural filter: minimum score to pass (default: 0.4) */
  structuralPermit?: number;
  /** Structural filter: below this score = DENY (default: 0.2) */
  structuralDeny?: number;
  /** Shift filter: minimum score to pass (default: 0.5) */
  shiftPermit?: number;
  /** Shift filter: below this score = DENY (default: 0.25) */
  shiftDeny?: number;
  /** Evidence filter: minimum score to pass (default: 0.5) */
  evidencePermit?: number;
  /** Evidence filter: below this score = DENY (default: 0.2) */
  evidenceDeny?: number;
  /** Combined score: minimum to PERMIT (default: 0.5) */
  combinedPermit?: number;
  /** Combined score: below this = DENY (default: 0.25) */
  combinedDeny?: number;
}

/**
 * Aggregate statistics for observability.
 */
export interface GateStats {
  /** Total evaluations performed */
  totalEvaluations: number;
  /** Count of PERMIT decisions */
  permitCount: number;
  /** Count of DEFER decisions */
  deferCount: number;
  /** Count of DENY decisions */
  denyCount: number;
  /** Average combined score */
  averageCombinedScore: number;
  /** Average structural filter score */
  averageStructuralScore: number;
  /** Average shift filter score */
  averageShiftScore: number;
  /** Average evidence filter score */
  averageEvidenceScore: number;
  /** Whether advisory mode is active */
  advisoryMode: boolean;
}

/**
 * Internal resolved thresholds (all required).
 */
interface ResolvedThresholds {
  structuralPermit: number;
  structuralDeny: number;
  shiftPermit: number;
  shiftDeny: number;
  evidencePermit: number;
  evidenceDeny: number;
  combinedPermit: number;
  combinedDeny: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_THRESHOLDS: ResolvedThresholds = {
  structuralPermit: 0.4,
  structuralDeny: 0.2,
  shiftPermit: 0.5,
  shiftDeny: 0.25,
  evidencePermit: 0.5,
  evidenceDeny: 0.2,
  combinedPermit: 0.5,
  combinedDeny: 0.25,
};

/** Weights for combining filter scores */
const FILTER_WEIGHTS = {
  structural: 0.3,
  shift: 0.35,
  evidence: 0.35,
} as const;

/** Risk level multipliers (higher risk = stricter evaluation) */
const RISK_MULTIPLIERS: Record<string, number> = {
  low: 1.0,
  medium: 0.9,
  high: 0.75,
  critical: 0.6,
};

/** Maximum evaluations to retain for statistics */
const MAX_EVALUATION_HISTORY = 1000;

// ============================================================================
// CoherenceActionGate Implementation
// ============================================================================

/**
 * Three-filter coherence gate for agent action evaluation.
 *
 * Evaluates whether an agent action should proceed by running it through
 * structural, shift, and evidence filters. Advisory mode by default.
 *
 * @example
 * ```typescript
 * const gate = new CoherenceActionGate();
 * const evaluation = gate.evaluate({
 *   type: 'generate-test',
 *   domain: 'test-generation',
 *   confidence: 0.85,
 *   context: { filePath: 'src/service.ts' },
 *   riskLevel: 'medium',
 * });
 * if (evaluation.decision === 'DENY') {
 *   console.warn('Action denied:', evaluation.reasoning);
 * }
 * ```
 */
export class CoherenceActionGate {
  private thresholds: ResolvedThresholds;
  private readonly advisoryMode: boolean;
  private nativeAvailable: boolean | null = null;

  // Statistics tracking
  private evaluationHistory: GateEvaluation[] = [];
  private permitCount = 0;
  private deferCount = 0;
  private denyCount = 0;
  private totalCombinedScore = 0;
  private totalStructuralScore = 0;
  private totalShiftScore = 0;
  private totalEvidenceScore = 0;

  // CUSUM state for shift detection
  private cusumHigh: number = 0;
  private cusumLow: number = 0;
  private cusumMean: number = 0.7; // Target mean confidence
  private cusumK: number = 0.05;   // Allowance parameter (half the shift to detect)
  private cusumH: number = 4.0;    // Decision threshold
  private cusumSampleCount: number = 0;
  private cusumAlertActive: boolean = false;

  constructor(options?: { advisory?: boolean; thresholds?: ThresholdConfig }) {
    this.advisoryMode = options?.advisory ?? true;
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...options?.thresholds,
    };
  }

  // ==========================================================================
  // Core API
  // ==========================================================================

  /**
   * Evaluate an agent action through the three-filter pipeline.
   *
   * @param action - The agent action to evaluate
   * @returns Full evaluation with decision, scores, and reasoning
   */
  evaluate(action: AgentAction): GateEvaluation {
    const structuralScore = this.computeStructuralScore(action);
    const shiftScore = this.computeShiftScore(action);
    const evidenceScore = this.computeEvidenceScore(action);

    const combinedScore =
      structuralScore * FILTER_WEIGHTS.structural +
      shiftScore * FILTER_WEIGHTS.shift +
      evidenceScore * FILTER_WEIGHTS.evidence;

    // Apply risk multiplier
    const riskMultiplier = RISK_MULTIPLIERS[action.riskLevel] ?? 1.0;
    const adjustedCombined = combinedScore * riskMultiplier;

    const decision = this.computeDecision(
      structuralScore,
      shiftScore,
      evidenceScore,
      adjustedCombined,
    );

    const reasoning = this.buildReasoning(
      action,
      decision,
      structuralScore,
      shiftScore,
      evidenceScore,
      adjustedCombined,
    );

    const evaluation: GateEvaluation = {
      decision,
      structuralScore,
      shiftScore,
      evidenceScore,
      combinedScore: adjustedCombined,
      reasoning,
      advisory: this.advisoryMode,
    };

    this.recordEvaluation(evaluation);

    logger.debug('Action gate evaluation', {
      action: action.type,
      domain: action.domain,
      decision,
      combinedScore: adjustedCombined,
      advisory: this.advisoryMode,
    });

    return evaluation;
  }

  /**
   * Get aggregate statistics for observability.
   */
  getStatistics(): GateStats {
    const total = this.evaluationHistory.length;
    return {
      totalEvaluations: total,
      permitCount: this.permitCount,
      deferCount: this.deferCount,
      denyCount: this.denyCount,
      averageCombinedScore: total > 0 ? this.totalCombinedScore / total : 0,
      averageStructuralScore: total > 0 ? this.totalStructuralScore / total : 0,
      averageShiftScore: total > 0 ? this.totalShiftScore / total : 0,
      averageEvidenceScore: total > 0 ? this.totalEvidenceScore / total : 0,
      advisoryMode: this.advisoryMode,
    };
  }

  /**
   * Update thresholds at runtime.
   *
   * @param config - Partial threshold overrides
   */
  configureThresholds(config: ThresholdConfig): void {
    this.thresholds = {
      ...this.thresholds,
      ...config,
    };
    logger.info('Action gate thresholds updated', {
      thresholds: this.thresholds,
    });
  }

  /**
   * Get the current threshold configuration.
   */
  getThresholds(): Readonly<ResolvedThresholds> {
    return { ...this.thresholds };
  }

  /**
   * Whether advisory mode is active.
   */
  isAdvisory(): boolean {
    return this.advisoryMode;
  }

  /**
   * Get the evaluation history (bounded).
   */
  getEvaluationHistory(): GateEvaluation[] {
    return [...this.evaluationHistory];
  }

  /**
   * Clear evaluation history and reset statistics.
   */
  resetStatistics(): void {
    this.evaluationHistory = [];
    this.permitCount = 0;
    this.deferCount = 0;
    this.denyCount = 0;
    this.totalCombinedScore = 0;
    this.totalStructuralScore = 0;
    this.totalShiftScore = 0;
    this.totalEvidenceScore = 0;
    this.resetCusum();
  }

  /**
   * Reset CUSUM change detection state.
   */
  resetCusum(): void {
    this.cusumHigh = 0;
    this.cusumLow = 0;
    this.cusumAlertActive = false;
    this.cusumSampleCount = 0;
  }

  // ==========================================================================
  // Filter 1: Structural
  // ==========================================================================

  /**
   * Structural filter: Action type familiarity and context completeness check.
   *
   * Considers:
   * - Action type familiarity (known vs unknown action types)
   * - Domain alignment (is the action appropriate for this domain?)
   * - Context completeness (does the action have sufficient context?)
   *
   * Higher score = better structural fit.
   */
  private computeStructuralScore(action: AgentAction): number {
    let score = 0.5; // Baseline

    // Action type familiarity - known action types score higher
    const knownActionTypes = [
      'generate-test', 'modify-code', 'analyze-coverage',
      'scan-security', 'assess-quality', 'validate-contracts',
      'test-accessibility', 'execute-tests', 'index-code',
      'predict-defects', 'validate-requirements', 'deploy',
      'run-chaos', 'optimize-learning',
    ];
    if (knownActionTypes.includes(action.type)) {
      score += 0.2;
    }

    // Domain alignment - check if context references this domain
    const contextStr = JSON.stringify(action.context).toLowerCase();
    if (contextStr.includes(action.domain.toLowerCase())) {
      score += 0.15;
    }

    // Context completeness - more context keys = more structural support
    const contextKeys = Object.keys(action.context);
    if (contextKeys.length >= 3) {
      score += 0.15;
    } else if (contextKeys.length >= 1) {
      score += 0.05;
    }

    return Math.min(Math.max(score, 0), 1);
  }

  // ==========================================================================
  // Filter 2: Shift Detection
  // ==========================================================================

  /**
   * Shift filter: Confidence-risk alignment with CUSUM change detection.
   *
   * Considers:
   * - Confidence level (low confidence suggests distributional shift)
   * - Risk level alignment (high risk with low confidence = shift)
   * - Context consistency (presence of contradictory signals)
   * - CUSUM cumulative sum control chart for persistent drift detection
   *
   * Higher score = less distributional shift detected.
   */
  private computeShiftScore(action: AgentAction): number {
    let score = action.confidence; // Start with agent's own confidence

    // Risk-confidence alignment penalty
    // High risk actions with low confidence suggest distributional shift
    const riskValues: Record<string, number> = {
      low: 0.25, medium: 0.5, high: 0.75, critical: 1.0,
    };
    const riskValue = riskValues[action.riskLevel] ?? 0.5;
    const riskConfidenceGap = Math.max(0, riskValue - action.confidence);

    // Penalize when risk is high but confidence is low
    score -= riskConfidenceGap * 0.3;

    // Context staleness check - look for timestamp or freshness signals
    const context = action.context;
    if (context.stale === true || context.outdated === true) {
      score -= 0.3;
    }

    // If context has explicit shift markers
    if (context.distributionShift === true || context.contextChanged === true) {
      score -= 0.4;
    }

    // CUSUM change detection
    this.cusumSampleCount++;
    const x = action.confidence;
    this.cusumHigh = Math.max(0, this.cusumHigh + (x - this.cusumMean) - this.cusumK);
    this.cusumLow = Math.max(0, this.cusumLow - (x - this.cusumMean) - this.cusumK);

    if (this.cusumHigh > this.cusumH || this.cusumLow > this.cusumH) {
      // Persistent drift detected
      score -= 0.2;
      if (!this.cusumAlertActive) {
        this.cusumAlertActive = true;
        logger.warn('CUSUM shift detected', { cusumHigh: this.cusumHigh, cusumLow: this.cusumLow });
      }
    } else {
      this.cusumAlertActive = false;
    }

    return Math.min(Math.max(score, 0), 1);
  }

  // ==========================================================================
  // Filter 3: Evidence (Multiplicative Accumulation)
  // ==========================================================================

  /**
   * Evidence filter: Multiplicative context evidence accumulation score.
   *
   * Uses multiplicative accumulation where each piece of evidence
   * compounds on the previous score. Multiple negative signals compound
   * more aggressively than additive scoring.
   *
   * Considers:
   * - Supporting evidence in context (test results, coverage data, etc.)
   * - Evidence against (errors, failures, warnings)
   * - Risk-level specific evidence requirements
   *
   * Higher score = more evidence supporting the action.
   */
  private computeEvidenceScore(action: AgentAction): number {
    let evidence = 0.5; // Start at neutral

    const context = action.context;

    // Positive evidence signals - multiplicative accumulation
    const positiveKeys = [
      'testResults', 'coverageData', 'securityScan',
      'qualityReport', 'peerReview', 'analysisResult',
      'validationPassed', 'precedent', 'historicalSuccess',
    ];
    for (const key of positiveKeys) {
      if (context[key] !== undefined && context[key] !== null) {
        evidence *= (1 + 0.15); // Each positive signal boosts by 15%
      }
    }

    // Negative evidence signals - multiplicative reduction
    const negativeKeys = [
      'errors', 'failures', 'warnings', 'regressions',
      'conflictingResults', 'noTestCoverage',
    ];
    for (const key of negativeKeys) {
      if (context[key] !== undefined && context[key] !== null) {
        evidence *= (1 - 0.18); // Each negative signal reduces by 18%
      }
    }

    // Action-specific evidence requirements
    if (action.riskLevel === 'critical' || action.riskLevel === 'high') {
      // High-risk actions need more evidence - raise the bar
      if (!context.testResults && !context.peerReview) {
        evidence -= 0.15;
      }
    }

    // Bonus for explicit evidence count
    if (typeof context.evidenceCount === 'number') {
      const evidenceCount = context.evidenceCount as number;
      evidence += Math.min(evidenceCount * 0.05, 0.2);
    }

    return Math.min(Math.max(evidence, 0), 1);
  }

  // ==========================================================================
  // Decision Logic
  // ==========================================================================

  /**
   * Determine the final PERMIT/DEFER/DENY decision from filter scores.
   *
   * Logic:
   * - DENY if any individual filter is below its deny threshold
   * - DENY if combined score is below combined deny threshold
   * - PERMIT if all filters are above their permit thresholds AND
   *   combined score is above combined permit threshold
   * - DEFER otherwise (marginal - needs human review)
   */
  private computeDecision(
    structural: number,
    shift: number,
    evidence: number,
    combined: number,
  ): GateDecision {
    // Check for clear DENY
    if (structural < this.thresholds.structuralDeny) return 'DENY';
    if (shift < this.thresholds.shiftDeny) return 'DENY';
    if (evidence < this.thresholds.evidenceDeny) return 'DENY';
    if (combined < this.thresholds.combinedDeny) return 'DENY';

    // Check for clear PERMIT
    if (
      structural >= this.thresholds.structuralPermit &&
      shift >= this.thresholds.shiftPermit &&
      evidence >= this.thresholds.evidencePermit &&
      combined >= this.thresholds.combinedPermit
    ) {
      return 'PERMIT';
    }

    // Marginal - needs review
    return 'DEFER';
  }

  // ==========================================================================
  // Reasoning & Statistics
  // ==========================================================================

  /**
   * Build a human-readable reasoning string.
   */
  private buildReasoning(
    action: AgentAction,
    decision: GateDecision,
    structural: number,
    shift: number,
    evidence: number,
    combined: number,
  ): string {
    const parts: string[] = [];
    parts.push(`Decision: ${decision} for ${action.type} (${action.domain}).`);
    parts.push(
      `Scores: structural=${structural.toFixed(2)}, ` +
      `shift=${shift.toFixed(2)}, evidence=${evidence.toFixed(2)}, ` +
      `combined=${combined.toFixed(2)}.`,
    );

    if (decision === 'DENY') {
      if (structural < this.thresholds.structuralDeny) {
        parts.push('Structural filter failed: action does not fit codebase graph.');
      }
      if (shift < this.thresholds.shiftDeny) {
        parts.push('Shift filter failed: significant context distribution shift detected.');
      }
      if (evidence < this.thresholds.evidenceDeny) {
        parts.push('Evidence filter failed: insufficient evidence to justify action.');
      }
      if (combined < this.thresholds.combinedDeny) {
        parts.push('Combined score below minimum threshold.');
      }
    } else if (decision === 'DEFER') {
      const marginalFilters: string[] = [];
      if (structural < this.thresholds.structuralPermit) marginalFilters.push('structural');
      if (shift < this.thresholds.shiftPermit) marginalFilters.push('shift');
      if (evidence < this.thresholds.evidencePermit) marginalFilters.push('evidence');
      if (marginalFilters.length > 0) {
        parts.push(`Marginal filters: ${marginalFilters.join(', ')}. Human review recommended.`);
      }
    }

    if (this.advisoryMode) {
      parts.push('(Advisory mode: decision logged only, not enforced.)');
    }

    return parts.join(' ');
  }

  /**
   * Record an evaluation for statistics tracking.
   */
  private recordEvaluation(evaluation: GateEvaluation): void {
    this.evaluationHistory.push(evaluation);
    if (this.evaluationHistory.length > MAX_EVALUATION_HISTORY) {
      this.evaluationHistory = this.evaluationHistory.slice(-MAX_EVALUATION_HISTORY);
    }

    this.totalCombinedScore += evaluation.combinedScore;
    this.totalStructuralScore += evaluation.structuralScore;
    this.totalShiftScore += evaluation.shiftScore;
    this.totalEvidenceScore += evaluation.evidenceScore;

    switch (evaluation.decision) {
      case 'PERMIT':
        this.permitCount++;
        break;
      case 'DEFER':
        this.deferCount++;
        break;
      case 'DENY':
        this.denyCount++;
        break;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a CoherenceActionGate instance.
 *
 * @param options - Optional configuration
 * @returns A new CoherenceActionGate instance
 */
export function createCoherenceActionGate(
  options?: { advisory?: boolean; thresholds?: ThresholdConfig },
): CoherenceActionGate {
  return new CoherenceActionGate(options);
}

// ============================================================================
// Task Executor Integration Helper
// ============================================================================

/**
 * Evaluate a task execution action through the coherence gate.
 *
 * This is the integration point called by the task executor. It checks
 * the feature flag, creates an AgentAction from task metadata, and
 * returns the evaluation result.
 *
 * @param taskType - The type of task being executed
 * @param domain - The domain the task targets
 * @param confidence - Confidence level (0-1)
 * @param riskLevel - Risk classification
 * @param context - Additional context
 * @param gate - Optional pre-existing gate instance (for reuse)
 * @returns The gate evaluation, or null if the feature flag is off
 */
export function evaluateTaskAction(
  taskType: string,
  domain: string,
  confidence: number,
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  context: Record<string, unknown>,
  gate?: CoherenceActionGate,
): GateEvaluation | null {
  const flags = getRuVectorFeatureFlags();
  if (!flags.useCoherenceActionGate) {
    return null;
  }

  const effectiveGate = gate ?? new CoherenceActionGate();
  const action: AgentAction = {
    type: taskType,
    domain,
    confidence,
    context,
    riskLevel,
  };

  return effectiveGate.evaluate(action);
}
