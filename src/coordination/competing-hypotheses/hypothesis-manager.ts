/**
 * Agentic QE v3 - Hypothesis Manager
 * ADR-064 Phase 4A: Coordinates competing hypotheses investigations
 *
 * Manages the lifecycle of investigations where multiple agents each
 * pursue a different hypothesis in parallel. Evidence is collected,
 * confidence scores are computed, and the system converges on the
 * strongest hypothesis via evidence-weighted scoring.
 *
 * @example
 * ```typescript
 * import { createHypothesisManager } from './coordination/competing-hypotheses';
 *
 * const manager = createHypothesisManager();
 * const inv = manager.createInvestigation('task-1', 'test-execution', 'Flaky test failure');
 *
 * const h1 = manager.addHypothesis(inv.id, 'Race condition in DB pool', 'code-analysis');
 * const h2 = manager.addHypothesis(inv.id, 'Timeout from slow network', 'log-analysis');
 *
 * manager.submitEvidence(inv.id, h1.id, {
 *   type: 'code-match',
 *   description: 'Found unsynchronized access to connection pool',
 *   weight: 0.8,
 *   supports: true,
 *   source: 'code-analyzer-agent',
 * });
 *
 * manager.completeHypothesis(inv.id, h1.id);
 * manager.completeHypothesis(inv.id, h2.id);
 *
 * const result = manager.converge(inv.id);
 * // result.winningHypothesisId === h1.id
 * ```
 */
import { randomUUID } from 'node:crypto';
import type {
  Hypothesis,
  HypothesisStatus,
  Evidence,
  Investigation,
  InvestigationStatus,
  InvestigationStrategy,
  ConvergenceResult,
  ConvergenceMethod,
  CompetingHypothesesConfig,
} from './types.js';
import { DEFAULT_COMPETING_HYPOTHESES_CONFIG } from './types.js';

// ============================================================================
// Internal Mutable State
// ============================================================================

/**
 * Internal mutable representation of an investigation.
 * External consumers receive immutable snapshots via `toSnapshot()`.
 */
interface MutableInvestigation {
  id: string;
  taskId: string;
  domain: string;
  description: string;
  hypotheses: Hypothesis[];
  status: InvestigationStatus;
  convergenceResult?: ConvergenceResult;
  maxHypotheses: number;
  convergenceThreshold: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// HypothesisManager
// ============================================================================

/**
 * Manages competing hypothesis investigations for root cause analysis.
 *
 * The lifecycle of an investigation:
 * 1. Create investigation (status: 'open')
 * 2. Add hypotheses with different strategies (status: 'investigating')
 * 3. Agents submit evidence for/against their hypotheses
 * 4. Complete hypotheses as agents finish
 * 5. Converge to determine the winning hypothesis
 */
export class HypothesisManager {
  private readonly investigations = new Map<string, MutableInvestigation>();
  private readonly config: CompetingHypothesesConfig;

  constructor(config?: Partial<CompetingHypothesesConfig>) {
    this.config = { ...DEFAULT_COMPETING_HYPOTHESES_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Investigation Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create a new investigation session.
   *
   * @param taskId - The parent task that triggered this investigation
   * @param domain - The QE domain context (e.g. 'test-execution')
   * @param description - Human-readable description of the problem
   * @returns Immutable snapshot of the created investigation
   */
  createInvestigation(taskId: string, domain: string, description: string): Investigation {
    const id = `inv-${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const investigation: MutableInvestigation = {
      id,
      taskId,
      domain,
      description,
      hypotheses: [],
      status: 'open',
      maxHypotheses: this.config.maxHypothesesPerInvestigation,
      convergenceThreshold: this.config.convergenceThreshold,
      createdAt: now,
      updatedAt: now,
    };
    this.investigations.set(id, investigation);
    return this.toSnapshot(investigation);
  }

  // --------------------------------------------------------------------------
  // Hypothesis Management
  // --------------------------------------------------------------------------

  /**
   * Add a hypothesis to an investigation.
   *
   * @param investigationId - Investigation to add the hypothesis to
   * @param description - What this hypothesis proposes as root cause
   * @param strategy - The investigation strategy the agent will use
   * @param agentId - Optional ID of the agent assigned to investigate
   * @returns The created hypothesis
   * @throws Error if investigation is at max hypothesis capacity
   */
  addHypothesis(
    investigationId: string,
    description: string,
    strategy: InvestigationStrategy,
    agentId?: string,
  ): Hypothesis {
    const inv = this.getInvestigationMutable(investigationId);

    if (inv.hypotheses.length >= inv.maxHypotheses) {
      throw new Error(
        `Investigation ${investigationId} already has ${inv.maxHypotheses} hypotheses (max)`,
      );
    }

    const hypothesis: Hypothesis = {
      id: `hyp-${randomUUID().slice(0, 8)}`,
      description,
      investigatorAgentId: agentId,
      strategy,
      status: 'pending',
      evidence: [],
      confidenceScore: 0.5, // Start neutral
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    inv.hypotheses.push(hypothesis);
    inv.updatedAt = Date.now();

    if (inv.status === 'open') {
      inv.status = 'investigating';
    }

    return hypothesis;
  }

  /**
   * Mark a hypothesis as actively being investigated.
   *
   * @param investigationId - Parent investigation ID
   * @param hypothesisId - Hypothesis to start
   * @throws Error if hypothesis is not in 'pending' status
   */
  startHypothesis(investigationId: string, hypothesisId: string): void {
    const inv = this.getInvestigationMutable(investigationId);
    const hyp = this.findHypothesis(inv, hypothesisId);

    if (hyp.status !== 'pending') {
      throw new Error(
        `Hypothesis ${hypothesisId} cannot be started (current status: ${hyp.status})`,
      );
    }

    (hyp as { status: HypothesisStatus }).status = 'investigating';
    (hyp as { updatedAt: number }).updatedAt = Date.now();
    inv.updatedAt = Date.now();
  }

  /**
   * Mark a hypothesis as completed by its investigator.
   *
   * @param investigationId - Parent investigation ID
   * @param hypothesisId - Hypothesis to complete
   */
  completeHypothesis(investigationId: string, hypothesisId: string): void {
    const inv = this.getInvestigationMutable(investigationId);
    const hyp = this.findHypothesis(inv, hypothesisId);

    (hyp as { status: HypothesisStatus }).status = 'completed';
    (hyp as { updatedAt: number }).updatedAt = Date.now();
    inv.updatedAt = Date.now();
  }

  // --------------------------------------------------------------------------
  // Evidence Collection
  // --------------------------------------------------------------------------

  /**
   * Submit evidence for a hypothesis.
   * Recalculates the hypothesis confidence score and may auto-reject
   * hypotheses that fall below the configured threshold.
   *
   * @param investigationId - Parent investigation ID
   * @param hypothesisId - Hypothesis this evidence pertains to
   * @param evidence - Evidence data (id, hypothesisId, timestamp are auto-generated)
   * @returns The fully populated evidence record
   */
  submitEvidence(
    investigationId: string,
    hypothesisId: string,
    evidence: Omit<Evidence, 'id' | 'hypothesisId' | 'timestamp'>,
  ): Evidence {
    const inv = this.getInvestigationMutable(investigationId);
    const hyp = this.findHypothesis(inv, hypothesisId);

    const fullEvidence: Evidence = {
      ...evidence,
      id: `evi-${randomUUID().slice(0, 8)}`,
      hypothesisId,
      timestamp: Date.now(),
    };

    (hyp as { evidence: Evidence[] }).evidence.push(fullEvidence);

    // Recalculate confidence from all evidence
    (hyp as { confidenceScore: number }).confidenceScore = this.calculateConfidence(hyp);
    (hyp as { updatedAt: number }).updatedAt = Date.now();
    inv.updatedAt = Date.now();

    // Auto-reject if confidence drops below threshold with sufficient evidence
    if (
      hyp.confidenceScore < this.config.autoRejectThreshold &&
      hyp.evidence.length >= 2
    ) {
      (hyp as { status: HypothesisStatus }).status = 'rejected';
    }

    return fullEvidence;
  }

  // --------------------------------------------------------------------------
  // Convergence
  // --------------------------------------------------------------------------

  /**
   * Attempt to converge the investigation by evaluating all hypotheses
   * and selecting a winner based on evidence scoring.
   *
   * Convergence succeeds if:
   * - Sufficient evidence has been collected (>= minEvidenceForConvergence)
   * - One hypothesis has a confidence gap >= convergenceThreshold above the next
   * - Or only one non-rejected hypothesis remains (unanimous)
   *
   * @param investigationId - Investigation to converge
   * @returns The convergence result with winning hypothesis (or null if inconclusive)
   */
  converge(investigationId: string): ConvergenceResult {
    const inv = this.getInvestigationMutable(investigationId);

    // Check minimum evidence across all hypotheses
    const totalEvidence = inv.hypotheses.reduce(
      (sum, h) => sum + h.evidence.length,
      0,
    );

    if (totalEvidence < this.config.minEvidenceForConvergence) {
      inv.status = 'inconclusive';
      const result: ConvergenceResult = {
        winningHypothesisId: null,
        confidence: 0,
        evidenceSummary: `Insufficient evidence (${totalEvidence}/${this.config.minEvidenceForConvergence} required)`,
        rejectedHypotheses: inv.hypotheses
          .filter(h => h.status === 'rejected')
          .map(h => h.id),
        method: 'evidence-scoring',
      };
      inv.convergenceResult = result;
      inv.updatedAt = Date.now();
      return result;
    }

    // Rank non-rejected hypotheses by confidence descending
    const ranked = [...inv.hypotheses]
      .filter(h => h.status !== 'rejected')
      .sort((a, b) => b.confidenceScore - a.confidenceScore);

    let method: ConvergenceMethod = 'evidence-scoring';
    let winningId: string | null = null;
    let confidence = 0;

    if (ranked.length === 0) {
      // All rejected
      inv.status = 'inconclusive';
    } else if (ranked.length === 1) {
      // Only one non-rejected hypothesis
      winningId = ranked[0].id;
      confidence = ranked[0].confidenceScore;
      method = 'unanimous';
      inv.status = 'converged';
    } else {
      const gap = ranked[0].confidenceScore - ranked[1].confidenceScore;
      if (gap >= inv.convergenceThreshold) {
        winningId = ranked[0].id;
        confidence = ranked[0].confidenceScore;
        inv.status = 'converged';
      } else {
        // No clear winner
        inv.status = 'inconclusive';
      }
    }

    const result: ConvergenceResult = {
      winningHypothesisId: winningId,
      confidence,
      evidenceSummary: this.buildEvidenceSummary(inv),
      rejectedHypotheses: inv.hypotheses
        .filter(h => h.status === 'rejected')
        .map(h => h.id),
      method,
    };

    inv.convergenceResult = result;
    inv.updatedAt = Date.now();
    return result;
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Get an immutable snapshot of an investigation.
   *
   * @param id - Investigation ID
   * @returns Investigation snapshot, or undefined if not found
   */
  getInvestigation(id: string): Investigation | undefined {
    const inv = this.investigations.get(id);
    return inv ? this.toSnapshot(inv) : undefined;
  }

  /**
   * List all investigations as immutable snapshots.
   *
   * @returns Array of investigation snapshots
   */
  listInvestigations(): Investigation[] {
    return Array.from(this.investigations.values()).map(inv =>
      this.toSnapshot(inv),
    );
  }

  /**
   * Get the current configuration.
   *
   * @returns The active configuration
   */
  getConfig(): CompetingHypothesesConfig {
    return this.config;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Dispose all investigations and release resources.
   */
  dispose(): void {
    this.investigations.clear();
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private getInvestigationMutable(id: string): MutableInvestigation {
    const inv = this.investigations.get(id);
    if (!inv) {
      throw new Error(`Investigation ${id} not found`);
    }
    return inv;
  }

  private findHypothesis(inv: MutableInvestigation, hypothesisId: string): Hypothesis {
    const hyp = inv.hypotheses.find(h => h.id === hypothesisId);
    if (!hyp) {
      throw new Error(`Hypothesis ${hypothesisId} not found in investigation ${inv.id}`);
    }
    return hyp;
  }

  /**
   * Calculate confidence score for a hypothesis based on its evidence.
   * Returns the ratio of supporting evidence weight to total evidence weight.
   * With no evidence, returns 0.5 (neutral).
   */
  private calculateConfidence(hypothesis: Hypothesis): number {
    if (hypothesis.evidence.length === 0) return 0.5;

    let supportWeight = 0;
    let refuteWeight = 0;

    for (const e of hypothesis.evidence) {
      if (e.supports) {
        supportWeight += e.weight;
      } else {
        refuteWeight += e.weight;
      }
    }

    const total = supportWeight + refuteWeight;
    if (total === 0) return 0.5;

    return Math.min(1, Math.max(0, supportWeight / total));
  }

  /**
   * Build a human-readable summary of evidence across all hypotheses.
   */
  private buildEvidenceSummary(inv: MutableInvestigation): string {
    const parts: string[] = [];
    for (const h of inv.hypotheses) {
      const supporting = h.evidence.filter(e => e.supports).length;
      const refuting = h.evidence.filter(e => !e.supports).length;
      parts.push(
        `${h.id}: ${supporting} supporting, ${refuting} refuting (confidence: ${h.confidenceScore.toFixed(2)})`,
      );
    }
    return parts.join('; ');
  }

  /**
   * Create a deep-copied immutable snapshot of an investigation.
   */
  private toSnapshot(inv: MutableInvestigation): Investigation {
    return {
      ...inv,
      hypotheses: inv.hypotheses.map(h => ({
        ...h,
        evidence: [...h.evidence],
      })),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new HypothesisManager instance.
 *
 * @param config - Optional partial configuration overrides
 * @returns A configured HypothesisManager
 */
export function createHypothesisManager(
  config?: Partial<CompetingHypothesesConfig>,
): HypothesisManager {
  return new HypothesisManager(config);
}
