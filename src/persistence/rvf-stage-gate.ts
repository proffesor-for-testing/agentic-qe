/**
 * RVF Stage Gate Enforcer (ADR-072)
 *
 * Enforces go/no-go criteria for promoting the RVF migration stage.
 * Each stage transition has specific requirements that must be met
 * before promotion is allowed.
 *
 * Stage gates (from ADR-072):
 *   Stage 2→3: divergence <0.01% over 7 days, RVF read latency <2x SQLite
 *   Stage 3→4: zero fallbacks over 14 days, RVF write latency <1.5x SQLite
 *
 * Supports manual override with witness chain recording for audit trail.
 *
 * @module persistence/rvf-stage-gate
 */

import type { MigrationStage, MigrationMetrics } from './rvf-migration-adapter.js';
import type { RvfConsistencyValidator } from './rvf-consistency-validator.js';
import type { WitnessChain } from '../audit/witness-chain.js';

// ============================================================================
// Types
// ============================================================================

export interface StageGateResult {
  /** Whether promotion is allowed */
  canPromote: boolean;
  /** Current stage */
  currentStage: MigrationStage;
  /** Target stage */
  targetStage: MigrationStage;
  /** Individual gate check results */
  checks: GateCheck[];
  /** Human-readable summary */
  summary: string;
}

export interface GateCheck {
  name: string;
  passed: boolean;
  actual: string;
  threshold: string;
}

export interface StageGateConfig {
  /** Max divergence rate for stage 2→3 (default: 0.0001 = 0.01%) */
  maxDivergenceRate2to3: number;
  /** Max RVF/SQLite read latency ratio for stage 2→3 (default: 2.0) */
  maxReadLatencyRatio2to3: number;
  /** Max fallbacks allowed for stage 3→4 (default: 0) */
  maxFallbacks3to4: number;
  /** Max RVF/SQLite write latency ratio for stage 3→4 (default: 1.5) */
  maxWriteLatencyRatio3to4: number;
  /** Minimum checks required in window before gate can pass (default: 10) */
  minChecksRequired: number;
}

const DEFAULT_CONFIG: StageGateConfig = {
  maxDivergenceRate2to3: 0.0001,  // 0.01%
  maxReadLatencyRatio2to3: 2.0,
  maxFallbacks3to4: 0,
  maxWriteLatencyRatio3to4: 1.5,
  minChecksRequired: 10,
};

// ============================================================================
// RvfStageGate
// ============================================================================

export class RvfStageGate {
  private readonly config: StageGateConfig;
  private witnessChain: WitnessChain | null = null;

  constructor(config?: Partial<StageGateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Attach witness chain for audit trail of promotions */
  setWitnessChain(wc: WitnessChain): void {
    this.witnessChain = wc;
  }

  // --------------------------------------------------------------------------
  // Gate Evaluation
  // --------------------------------------------------------------------------

  /**
   * Evaluate whether promotion from currentStage to currentStage+1 is allowed.
   */
  evaluate(
    currentStage: MigrationStage,
    validator: RvfConsistencyValidator,
    metrics: MigrationMetrics,
  ): StageGateResult {
    const targetStage = Math.min(currentStage + 1, 4) as MigrationStage;

    if (currentStage >= 4) {
      return {
        canPromote: false,
        currentStage,
        targetStage: 4,
        checks: [],
        summary: 'Already at maximum stage (4: RVF primary)',
      };
    }

    if (currentStage < 2) {
      // Stages 0→1 and 1→2 don't have automated gates
      return {
        canPromote: true,
        currentStage,
        targetStage,
        checks: [],
        summary: `Stage ${currentStage}→${targetStage} has no automated gates — manual promotion allowed`,
      };
    }

    const checks: GateCheck[] = [];

    if (currentStage === 2) {
      // Stage 2→3: divergence + read latency
      const divergenceRate = validator.getRollingDivergenceRate();
      const checkCount = validator.getCheckCount();

      checks.push({
        name: 'consistency-checks-count',
        passed: checkCount >= this.config.minChecksRequired,
        actual: `${checkCount} checks`,
        threshold: `>= ${this.config.minChecksRequired} checks`,
      });

      checks.push({
        name: 'divergence-rate',
        passed: divergenceRate <= this.config.maxDivergenceRate2to3,
        actual: `${(divergenceRate * 100).toFixed(4)}%`,
        threshold: `<= ${(this.config.maxDivergenceRate2to3 * 100).toFixed(4)}%`,
      });

      const latencyRatio = metrics.sqliteReadLatencyAvgMs > 0
        ? metrics.rvfReadLatencyAvgMs / metrics.sqliteReadLatencyAvgMs
        : 0;
      checks.push({
        name: 'read-latency-ratio',
        passed: latencyRatio <= this.config.maxReadLatencyRatio2to3 || metrics.rvfReadLatencyAvgMs === 0,
        actual: `${latencyRatio.toFixed(2)}x`,
        threshold: `<= ${this.config.maxReadLatencyRatio2to3}x`,
      });
    }

    if (currentStage === 3) {
      // Stage 3→4: zero fallbacks + write latency
      checks.push({
        name: 'fallback-count',
        passed: metrics.fallbacksUsed <= this.config.maxFallbacks3to4,
        actual: `${metrics.fallbacksUsed} fallbacks`,
        threshold: `<= ${this.config.maxFallbacks3to4} fallbacks`,
      });

      // Use write latency metrics when available, fall back to read latency as proxy
      const sqliteWriteAvg = metrics.sqliteWriteLatencyAvgMs ?? metrics.sqliteReadLatencyAvgMs;
      const rvfWriteAvg = metrics.rvfWriteLatencyAvgMs ?? metrics.rvfReadLatencyAvgMs;
      const writeLatencyRatio = sqliteWriteAvg > 0 ? rvfWriteAvg / sqliteWriteAvg : 0;
      checks.push({
        name: 'write-latency-ratio',
        passed: writeLatencyRatio <= this.config.maxWriteLatencyRatio3to4 || rvfWriteAvg === 0,
        actual: `${writeLatencyRatio.toFixed(2)}x`,
        threshold: `<= ${this.config.maxWriteLatencyRatio3to4}x`,
      });
    }

    const canPromote = checks.length > 0 && checks.every(c => c.passed);
    const failedChecks = checks.filter(c => !c.passed).map(c => c.name);

    return {
      canPromote,
      currentStage,
      targetStage,
      checks,
      summary: canPromote
        ? `All gates passed — safe to promote to stage ${targetStage}`
        : `Blocked: ${failedChecks.join(', ')} failed`,
    };
  }

  // --------------------------------------------------------------------------
  // Promotion
  // --------------------------------------------------------------------------

  /**
   * Attempt to promote to the next stage. Returns the new stage if successful.
   * Records the promotion (or block) in the witness chain.
   */
  promote(
    currentStage: MigrationStage,
    validator: RvfConsistencyValidator,
    metrics: MigrationMetrics,
    force = false,
  ): { promoted: boolean; newStage: MigrationStage; result: StageGateResult } {
    const result = this.evaluate(currentStage, validator, metrics);

    if (!result.canPromote && !force) {
      this.recordWitness('QUALITY_GATE_FAIL', {
        action: 'stage-promotion-blocked',
        from: currentStage,
        to: result.targetStage,
        failedChecks: result.checks.filter(c => !c.passed),
        summary: result.summary,
      });

      return { promoted: false, newStage: currentStage, result };
    }

    const newStage = result.targetStage;

    this.recordWitness(
      force ? 'QUALITY_GATE_PASS' : 'QUALITY_GATE_PASS',
      {
        action: force ? 'stage-promotion-forced' : 'stage-promotion-approved',
        from: currentStage,
        to: newStage,
        checks: result.checks,
        forced: force,
        summary: result.summary,
      },
    );

    return { promoted: true, newStage, result };
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private recordWitness(
    actionType: 'QUALITY_GATE_PASS' | 'QUALITY_GATE_FAIL',
    data: Record<string, unknown>,
  ): void {
    try {
      this.witnessChain?.append(actionType, data, 'rvf-stage-gate');
    } catch {
      // Witness recording is best-effort
    }
  }
}
