/**
 * Agentic QE v3 - Competing Hypotheses Types
 * ADR-064 Phase 4A: Multi-Agent Investigation via Competing Hypotheses
 *
 * Defines types for the competing hypotheses pattern where N agents
 * investigate a defect from different angles in parallel, collect
 * evidence, and the system converges on the strongest hypothesis
 * via evidence scoring.
 */

// ============================================================================
// Hypothesis Types
// ============================================================================

/**
 * A hypothesis to investigate.
 * Each hypothesis is assigned to an agent that investigates from a specific angle.
 */
export interface Hypothesis {
  readonly id: string;
  readonly description: string;
  readonly investigatorAgentId?: string;
  readonly strategy: InvestigationStrategy;
  readonly status: HypothesisStatus;
  readonly evidence: Evidence[];
  readonly confidenceScore: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Lifecycle status of a hypothesis.
 * - pending: Awaiting investigation start
 * - investigating: Agent actively gathering evidence
 * - completed: Agent finished investigation
 * - rejected: Auto-rejected due to low confidence
 */
export type HypothesisStatus = 'pending' | 'investigating' | 'completed' | 'rejected';

// ============================================================================
// Investigation Strategy
// ============================================================================

/**
 * Strategy an agent uses to investigate a hypothesis.
 * Each strategy represents a different investigation angle.
 */
export type InvestigationStrategy =
  | 'code-analysis'       // Static analysis of the codebase
  | 'test-execution'      // Run targeted tests to confirm/deny
  | 'log-analysis'        // Analyze logs and traces
  | 'dependency-tracing'  // Trace dependency chains
  | 'historical-pattern'  // Compare with known defect patterns
  | 'adversarial';        // Devil's advocate approach

// ============================================================================
// Evidence Types
// ============================================================================

/**
 * Evidence gathered during hypothesis investigation.
 * Each piece of evidence either supports or refutes the hypothesis,
 * with a weight indicating how strongly it does so.
 */
export interface Evidence {
  readonly id: string;
  readonly hypothesisId: string;
  readonly type: EvidenceType;
  readonly description: string;
  /** Weight from 0 to 1 indicating strength of this evidence */
  readonly weight: number;
  /** Whether this evidence supports (true) or refutes (false) the hypothesis */
  readonly supports: boolean;
  /** Agent or tool that produced this evidence */
  readonly source: string;
  /** Raw evidence data, if any */
  readonly data?: unknown;
  readonly timestamp: number;
}

/**
 * Classification of evidence by origin.
 */
export type EvidenceType =
  | 'test-result'
  | 'code-match'
  | 'log-entry'
  | 'dependency-chain'
  | 'pattern-match'
  | 'counter-example';

// ============================================================================
// Investigation Types
// ============================================================================

/**
 * An investigation session grouping multiple competing hypotheses.
 * Created when a defect or issue needs root cause analysis from
 * multiple angles.
 */
export interface Investigation {
  readonly id: string;
  readonly taskId: string;
  readonly domain: string;
  readonly description: string;
  readonly hypotheses: Hypothesis[];
  readonly status: InvestigationStatus;
  readonly convergenceResult?: ConvergenceResult;
  readonly maxHypotheses: number;
  readonly convergenceThreshold: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Lifecycle status of an investigation session.
 * - open: Accepting new hypotheses
 * - investigating: Agents actively collecting evidence
 * - converging: Convergence in progress
 * - converged: A winning hypothesis was determined
 * - inconclusive: No clear winner could be determined
 */
export type InvestigationStatus =
  | 'open'
  | 'investigating'
  | 'converging'
  | 'converged'
  | 'inconclusive';

// ============================================================================
// Convergence Types
// ============================================================================

/**
 * Result of hypothesis convergence.
 * Produced when the system evaluates all hypotheses and evidence
 * to determine the most likely root cause.
 */
export interface ConvergenceResult {
  /** ID of the winning hypothesis, or null if inconclusive */
  readonly winningHypothesisId: string | null;
  /** Confidence score of the winning hypothesis */
  readonly confidence: number;
  /** Human-readable summary of evidence across all hypotheses */
  readonly evidenceSummary: string;
  /** IDs of hypotheses that were rejected */
  readonly rejectedHypotheses: string[];
  /** Method used for convergence */
  readonly method: ConvergenceMethod;
}

/**
 * Method used to converge on a winning hypothesis.
 * - evidence-scoring: Winner determined by confidence gap between top two
 * - unanimous: Only one non-rejected hypothesis remained
 * - majority: Multiple hypotheses, but one has clear majority evidence
 * - timeout: Investigation timed out, best available selected
 */
export type ConvergenceMethod = 'evidence-scoring' | 'unanimous' | 'majority' | 'timeout';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the HypothesisManager.
 * Controls how investigations are run and when convergence is triggered.
 */
export interface CompetingHypothesesConfig {
  /** Maximum number of hypotheses per investigation (default: 5) */
  readonly maxHypothesesPerInvestigation: number;
  /** Minimum confidence gap between top two hypotheses to declare a winner (default: 0.2) */
  readonly convergenceThreshold: number;
  /** Maximum time in ms for an investigation before timeout (default: 300000) */
  readonly investigationTimeoutMs: number;
  /** Minimum evidence pieces needed before convergence can succeed (default: 3) */
  readonly minEvidenceForConvergence: number;
  /** Confidence score below which a hypothesis is auto-rejected (default: 0.15) */
  readonly autoRejectThreshold: number;
}

/**
 * Default configuration for the competing hypotheses system.
 */
export const DEFAULT_COMPETING_HYPOTHESES_CONFIG: CompetingHypothesesConfig = {
  maxHypothesesPerInvestigation: 5,
  convergenceThreshold: 0.2,
  investigationTimeoutMs: 300_000, // 5 minutes
  minEvidenceForConvergence: 3,
  autoRejectThreshold: 0.15,
};
