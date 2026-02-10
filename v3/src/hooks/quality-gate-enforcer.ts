/**
 * Quality Gate Enforcer
 * ADR-064: TaskCompleted Hook with Pattern Training (Phase 1C)
 *
 * Validates task results against configurable quality gates.
 * Returns exit code 2 on rejection (Agent Teams convention).
 *
 * @module quality-gate-enforcer
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the quality gate system
 */
export interface QualityGateConfig {
  /** Enable quality gate validation */
  readonly enabled: boolean;
  /** Minimum quality score to accept (0-1) */
  readonly minQualityScore: number;
  /** Individual gate thresholds */
  readonly gates: QualityGate[];
  /** Whether to reject (exit code 2) or warn on failure */
  readonly rejectOnFailure: boolean;
}

/**
 * Individual quality gate definition
 */
export interface QualityGate {
  readonly name: string;
  readonly type: 'coverage' | 'test-pass-rate' | 'security' | 'performance' | 'custom';
  readonly threshold: number;
  /** Weight in overall score (0-1, should sum to 1 across all gates) */
  readonly weight: number;
  /** If true, failing this gate fails the whole check regardless of score */
  readonly required: boolean;
}

/**
 * Result of evaluating all quality gates
 */
export interface QualityGateResult {
  readonly passed: boolean;
  /** Overall weighted score (0-1) */
  readonly score: number;
  /** 0 = accept, 2 = reject */
  readonly exitCode: 0 | 2;
  readonly gates: GateCheckResult[];
  readonly reason?: string;
}

/**
 * Result of checking a single gate
 */
export interface GateCheckResult {
  readonly gate: string;
  readonly passed: boolean;
  readonly actual: number;
  readonly threshold: number;
  readonly weight: number;
}

/**
 * Task metrics used for gate evaluation
 */
export interface TaskMetrics {
  readonly coverageChange?: number;
  readonly testsPassed?: number;
  readonly testsFailed?: number;
  readonly securityIssues?: number;
  readonly performanceMs?: number;
  readonly linesChanged?: number;
}

/**
 * Minimal task result shape needed for gate evaluation
 */
export interface TaskResult {
  readonly taskId: string;
  readonly agentId: string;
  readonly domain: string;
  readonly type: string;
  readonly status: 'completed' | 'failed';
  readonly output: Record<string, unknown>;
  readonly metrics: TaskMetrics;
  readonly artifacts?: string[];
  readonly duration: number;
  readonly timestamp: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default quality gate configuration with sensible thresholds
 */
export const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = {
  enabled: true,
  minQualityScore: 0.6,
  rejectOnFailure: true,
  gates: [
    {
      name: 'test-pass-rate',
      type: 'test-pass-rate',
      threshold: 0.8,
      weight: 0.35,
      required: true,
    },
    {
      name: 'coverage',
      type: 'coverage',
      threshold: 0.0,
      weight: 0.25,
      required: false,
    },
    {
      name: 'security',
      type: 'security',
      threshold: 0.0,
      weight: 0.25,
      required: true,
    },
    {
      name: 'performance',
      type: 'performance',
      threshold: 30000,
      weight: 0.15,
      required: false,
    },
  ],
};

// ============================================================================
// Quality Gate Enforcer
// ============================================================================

/**
 * Evaluates task results against configurable quality gates.
 *
 * Each gate has a type, threshold, weight, and required flag.
 * The overall score is the weighted sum of individual gate scores.
 * Any required gate failure causes overall failure regardless of score.
 */
export class QualityGateEnforcer {
  private readonly config: QualityGateConfig;

  constructor(config: Partial<QualityGateConfig> = {}) {
    this.config = { ...DEFAULT_QUALITY_GATE_CONFIG, ...config };

    // Merge gates if provided, otherwise use defaults
    if (config.gates) {
      this.config = { ...this.config, gates: config.gates };
    }
  }

  /**
   * Evaluate a task result against all configured quality gates.
   *
   * @param result - The completed task result to evaluate
   * @returns Quality gate evaluation result with pass/fail, score, and per-gate details
   */
  evaluate(result: TaskResult): QualityGateResult {
    if (!this.config.enabled) {
      console.log('[QualityGateEnforcer] Gates disabled, auto-passing');
      return {
        passed: true,
        score: 1.0,
        exitCode: 0,
        gates: [],
        reason: 'Quality gates disabled',
      };
    }

    // Auto-fail tasks that reported failure status
    if (result.status === 'failed') {
      console.log(`[QualityGateEnforcer] Task ${result.taskId} has failed status`);
      return {
        passed: false,
        score: 0,
        exitCode: this.config.rejectOnFailure ? 2 : 0,
        gates: [],
        reason: 'Task reported failed status',
      };
    }

    const gateResults: GateCheckResult[] = [];
    const failedRequiredGates: string[] = [];

    for (const gate of this.config.gates) {
      const checkResult = this.checkGate(gate, result);
      gateResults.push(checkResult);

      if (!checkResult.passed && gate.required) {
        failedRequiredGates.push(gate.name);
      }
    }

    // Compute weighted overall score
    const totalWeight = this.config.gates.reduce((sum, g) => sum + g.weight, 0);
    const weightedScore = totalWeight > 0
      ? gateResults.reduce((sum, gr) => {
          const gateConfig = this.config.gates.find(g => g.name === gr.gate);
          if (!gateConfig) return sum;
          const gateScore = gr.passed ? 1.0 : this.computePartialScore(gr);
          return sum + gateScore * (gateConfig.weight / totalWeight);
        }, 0)
      : 1.0;

    // Determine pass/fail
    const requiredGatesFailed = failedRequiredGates.length > 0;
    const scoreBelowMinimum = weightedScore < this.config.minQualityScore;
    const passed = !requiredGatesFailed && !scoreBelowMinimum;

    // Build reason string for failures
    let reason: string | undefined;
    if (!passed) {
      const reasons: string[] = [];
      if (requiredGatesFailed) {
        reasons.push(`Required gates failed: ${failedRequiredGates.join(', ')}`);
      }
      if (scoreBelowMinimum) {
        reasons.push(
          `Score ${weightedScore.toFixed(3)} below minimum ${this.config.minQualityScore}`
        );
      }
      reason = reasons.join('; ');
    }

    const exitCode: 0 | 2 = !passed && this.config.rejectOnFailure ? 2 : 0;

    console.log(
      `[QualityGateEnforcer] Task ${result.taskId}: ` +
      `${passed ? 'PASSED' : 'FAILED'} (score=${weightedScore.toFixed(3)}, ` +
      `gates=${gateResults.filter(g => g.passed).length}/${gateResults.length})`
    );

    return {
      passed,
      score: weightedScore,
      exitCode,
      gates: gateResults,
      reason,
    };
  }

  /**
   * Get the current gate configuration
   */
  getConfig(): QualityGateConfig {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Check a single gate against the task result
   */
  private checkGate(gate: QualityGate, result: TaskResult): GateCheckResult {
    const actual = this.extractMetricForGate(gate, result);
    const passed = this.meetsThreshold(gate, actual);

    return {
      gate: gate.name,
      passed,
      actual,
      threshold: gate.threshold,
      weight: gate.weight,
    };
  }

  /**
   * Extract the relevant metric value for a gate type from the task result
   */
  private extractMetricForGate(gate: QualityGate, result: TaskResult): number {
    const metrics = result.metrics;

    switch (gate.type) {
      case 'coverage': {
        // Coverage change (delta). Threshold is the minimum acceptable delta.
        return metrics.coverageChange ?? 0;
      }

      case 'test-pass-rate': {
        const passed = metrics.testsPassed ?? 0;
        const failed = metrics.testsFailed ?? 0;
        const total = passed + failed;
        return total > 0 ? passed / total : 1.0;
      }

      case 'security': {
        // Number of security issues. Lower is better.
        // We return the count; threshold comparison is inverted (actual <= threshold).
        return metrics.securityIssues ?? 0;
      }

      case 'performance': {
        // Task duration in ms. Lower is better.
        return metrics.performanceMs ?? result.duration;
      }

      case 'custom': {
        // Check output for a custom metric matching the gate name
        const customValue = result.output[gate.name];
        return typeof customValue === 'number' ? customValue : 0;
      }

      default:
        return 0;
    }
  }

  /**
   * Determine if the actual value meets the gate threshold.
   * For "lower is better" metrics (security, performance), the comparison is inverted.
   */
  private meetsThreshold(gate: QualityGate, actual: number): boolean {
    switch (gate.type) {
      case 'security':
        // Security issues: actual must be at or below threshold
        return actual <= gate.threshold;

      case 'performance':
        // Performance ms: actual must be at or below threshold
        return actual <= gate.threshold;

      case 'coverage':
      case 'test-pass-rate':
      case 'custom':
      default:
        // Higher is better: actual must meet or exceed threshold
        return actual >= gate.threshold;
    }
  }

  /**
   * Compute a partial score (0-1) for a gate that did not pass.
   * Used for weighted scoring so near-misses contribute partial credit.
   */
  private computePartialScore(gateResult: GateCheckResult): number {
    const gate = this.config.gates.find(g => g.name === gateResult.gate);
    if (!gate) return 0;

    switch (gate.type) {
      case 'security':
      case 'performance': {
        // Lower is better: partial score based on how close to threshold
        if (gate.threshold === 0) return 0;
        const ratio = gate.threshold / gateResult.actual;
        return Math.max(0, Math.min(1, ratio));
      }

      case 'coverage':
      case 'test-pass-rate':
      case 'custom':
      default: {
        // Higher is better
        if (gate.threshold === 0) return 1;
        const ratio = gateResult.actual / gate.threshold;
        return Math.max(0, Math.min(1, ratio));
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a QualityGateEnforcer with optional configuration overrides
 *
 * @param config - Partial configuration to merge with defaults
 * @returns A new QualityGateEnforcer instance
 */
export function createQualityGateEnforcer(
  config?: Partial<QualityGateConfig>
): QualityGateEnforcer {
  return new QualityGateEnforcer(config);
}
