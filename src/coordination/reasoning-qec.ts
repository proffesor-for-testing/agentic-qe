/**
 * Multi-Path Consensus Reasoning Validator - Task 4.5
 *
 * Applies error correction to AI reasoning using three independent paths.
 * Generates multiple independent reasoning chains for critical decisions,
 * extracts syndrome locations (disagreements between paths), and applies
 * confidence-weighted voting to produce a high-confidence result.
 *
 * Use cases:
 *   - Test generation validation
 *   - Security audit consensus
 *   - Defect triage decisions
 *
 * TypeScript implementation (no native package exists for reasoning QEC —
 * consensus logic doesn't benefit from native computation).
 *
 * @module coordination/reasoning-qec
 * @see docs/research/ruvector-quantum-solvers.md
 */

import { createLogger } from '../logging/logger-factory.js';
import { getRuVectorFeatureFlags } from '../integrations/ruvector/feature-flags.js';

const logger = createLogger('ReasoningQEC');

// ============================================================================
// Types
// ============================================================================

/**
 * A problem requiring multi-path reasoning validation.
 */
export interface ReasoningProblem {
  /** Problem domain: 'test-generation', 'security-audit', 'defect-triage' */
  type: string;
  /** Domain-specific context data */
  context: Record<string, unknown>;
  /** Reasoning steps to validate */
  steps: string[];
}

/**
 * A single step within a reasoning path.
 */
export interface ReasoningStep {
  /** Zero-based step index within the path */
  index: number;
  /** Human-readable description of what this step does */
  description: string;
  /** The conclusion reached at this step */
  conclusion: string;
  /** Evidence supporting this conclusion */
  evidence: string[];
}

/**
 * An independent reasoning path through a problem.
 */
export interface ReasoningPath {
  /** Path identifier (0, 1, 2) */
  id: number;
  /** Ordered reasoning steps */
  steps: ReasoningStep[];
  /** Final conclusion of this path */
  conclusion: string;
  /** Confidence in the conclusion (0-1) */
  confidence: number;
}

/**
 * A syndrome identifies a disagreement location between paths.
 */
export interface Syndrome {
  /** Step index where disagreement occurs */
  stepIndex: number;
  /** Which paths disagree, and what each concluded */
  disagreements: { pathId: number; conclusion: string }[];
  /** How severe the disagreement is */
  severity: 'minor' | 'major' | 'critical';
}

/**
 * The result after error correction has been applied.
 */
export interface CorrectedReasoning {
  /** Corrected reasoning steps */
  steps: ReasoningStep[];
  /** Corrected final conclusion */
  conclusion: string;
  /** Confidence in the corrected reasoning (0-1) */
  confidence: number;
  /** List of corrections applied */
  corrections: CorrectionEntry[];
  /** Number of syndromes detected */
  syndromeCount: number;
}

/**
 * A single correction applied during error correction.
 */
export interface CorrectionEntry {
  /** Step index where the correction was applied */
  stepIndex: number;
  /** Original (minority) conclusion that was overridden */
  original: string;
  /** Corrected (majority) conclusion */
  corrected: string;
  /** Human-readable reason for the correction */
  reason: string;
}

/**
 * Result of validating a corrected reasoning chain.
 */
export interface ValidationResult {
  /** Whether the corrected reasoning passes validation */
  valid: boolean;
  /** Overall confidence in the validated result (0-1) */
  confidence: number;
  /** Issues discovered during validation */
  issues: ValidationIssue[];
}

/**
 * A single issue found during validation.
 */
export interface ValidationIssue {
  /** Step index where issue was found, or -1 for conclusion-level */
  stepIndex: number;
  /** Type of issue */
  type: 'low-confidence' | 'no-majority' | 'inconsistent-evidence' | 'all-divergent';
  /** Human-readable description */
  description: string;
}

/**
 * Configuration for the ReasoningQEC engine.
 */
export interface ReasoningQECConfig {
  /** Minimum number of reasoning paths (default: 3) */
  minPaths: number;
  /** Confidence threshold below which syndromes are flagged (default: 0.5) */
  confidenceThreshold: number;
  /** Minimum agreement ratio for a corrected step to be considered valid (default: 0.5) */
  majorityThreshold: number;
  /** Whether to attempt loading the native ruqu-exotic module (default: true) */
  useNativeBackend: boolean;
  /** Voting method for error correction: 'weighted' uses path confidence, 'majority' uses simple count (default: 'weighted') */
  votingMethod: 'majority' | 'weighted';
}

/**
 * Default configuration values.
 */
export const DEFAULT_QEC_CONFIG: ReasoningQECConfig = {
  minPaths: 3,
  confidenceThreshold: 0.5,
  majorityThreshold: 0.5,
  useNativeBackend: true,
  votingMethod: 'weighted',
};

// ============================================================================
// Strategy Generators
// ============================================================================

/**
 * Strategy registry: maps problem types to path generation approaches.
 * Each strategy produces slightly different reasoning perspectives.
 */
const STRATEGY_PERSPECTIVES: Record<string, string[]> = {
  'test-generation': [
    'specification-driven',
    'boundary-analysis',
    'mutation-testing',
  ],
  'security-audit': [
    'threat-modeling',
    'attack-surface',
    'defense-in-depth',
  ],
  'defect-triage': [
    'root-cause-analysis',
    'impact-assessment',
    'risk-prioritization',
  ],
};

const DEFAULT_PERSPECTIVES = [
  'analytical',
  'empirical',
  'heuristic',
];

// ============================================================================
// Native Backend Probe
// ============================================================================

/**
 * Attempt to load the ruqu-exotic native backend.
 * Returns null if unavailable (TypeScript fallback is used).
 */
let nativeBackend: unknown | null = null;
let nativeProbeComplete = false;

/**
 * Check for native QEC backend.
 * No native package exists — always returns false.
 * The TypeScript majority-vote implementation is used.
 */
async function probeNativeBackend(): Promise<boolean> {
  if (nativeProbeComplete) {
    return nativeBackend !== null;
  }
  nativeBackend = null;
  nativeProbeComplete = true;
  return false;
}

// ============================================================================
// ReasoningQEC Class
// ============================================================================

/**
 * Multi-Path Consensus Reasoning Validator.
 *
 * Named QEC by analogy with quantum error correction; implements consensus
 * voting across multiple reasoning paths, not quantum algorithms.
 *
 * Generates multiple independent reasoning paths for a given problem,
 * extracts syndrome locations where paths disagree, and applies
 * confidence-weighted (or simple majority) voting to produce a
 * high-confidence result.
 *
 * @example
 * ```typescript
 * const qec = new ReasoningQEC();
 *
 * const problem: ReasoningProblem = {
 *   type: 'security-audit',
 *   context: { file: 'auth.ts', finding: 'potential XSS' },
 *   steps: ['Analyze input handling', 'Check sanitization', 'Evaluate risk'],
 * };
 *
 * const paths = qec.generatePaths(problem);
 * const syndromes = qec.extractSyndromes(paths);
 * const corrected = qec.correctErrors(paths, syndromes);
 * const validation = qec.validate(corrected);
 * ```
 */
export class ReasoningQEC {
  private readonly config: ReasoningQECConfig;
  private nativeAvailable = false;

  constructor(config: Partial<ReasoningQECConfig> = {}) {
    this.config = { ...DEFAULT_QEC_CONFIG, ...config };
  }

  /**
   * Initialize the engine, probing for the native backend if configured.
   * Call this once before using generate/extract/correct methods.
   * If not called, the engine works in pure TypeScript mode.
   */
  async initialize(): Promise<void> {
    if (this.config.useNativeBackend) {
      const flags = getRuVectorFeatureFlags();
      if (flags.useQEFlashAttention || flags.useQEGNNIndex) {
        this.nativeAvailable = await probeNativeBackend();
      }
    }
  }

  /**
   * Generate independent reasoning paths for a problem.
   *
   * Each path represents a different analytical perspective on the problem,
   * producing its own step-by-step reasoning chain and conclusion.
   *
   * @param problem - The reasoning problem to analyze
   * @returns Array of independent reasoning paths (minimum 3)
   */
  generatePaths(problem: ReasoningProblem): ReasoningPath[] {
    const numPaths = Math.max(this.config.minPaths, 3);
    const perspectives = STRATEGY_PERSPECTIVES[problem.type] ?? DEFAULT_PERSPECTIVES;

    const paths: ReasoningPath[] = [];

    for (let pathId = 0; pathId < numPaths; pathId++) {
      const perspective = perspectives[pathId % perspectives.length];
      const steps = this.generatePathSteps(problem, pathId, perspective);
      const conclusion = this.deriveConclusion(steps, perspective);
      const confidence = this.calculatePathConfidence(steps);

      paths.push({
        id: pathId,
        steps,
        conclusion,
        confidence,
      });
    }

    logger.debug(`Generated ${paths.length} reasoning paths for problem type: ${problem.type}`);
    return paths;
  }

  /**
   * Extract syndromes (disagreement locations) from reasoning paths.
   *
   * Compares all paths step-by-step and identifies indices where
   * paths reach different conclusions. Severity is classified as:
   *   - minor: only one path disagrees (easily correctable)
   *   - major: paths are split (no clear majority)
   *   - critical: all paths disagree (low confidence in any correction)
   *
   * @param paths - Array of reasoning paths to compare
   * @returns Array of syndromes identifying disagreement locations
   */
  extractSyndromes(paths: ReasoningPath[]): Syndrome[] {
    if (paths.length < 2) {
      return [];
    }

    const syndromes: Syndrome[] = [];
    const maxSteps = Math.max(...paths.map(p => p.steps.length));

    for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
      const conclusions = new Map<string, number[]>();

      for (const path of paths) {
        const step = path.steps[stepIdx];
        if (!step) continue;

        const existing = conclusions.get(step.conclusion) ?? [];
        existing.push(path.id);
        conclusions.set(step.conclusion, existing);
      }

      // If all conclusions are the same, no syndrome at this step
      if (conclusions.size <= 1) {
        continue;
      }

      const disagreements = [...conclusions.entries()].map(
        ([conclusion, pathIds]) =>
          pathIds.map(pathId => ({ pathId, conclusion }))
      ).flat();

      const severity = this.classifySyndromeSeverity(conclusions, paths.length);

      syndromes.push({
        stepIndex: stepIdx,
        disagreements,
        severity,
      });
    }

    // Also check for conclusion-level disagreement
    const conclusionMap = new Map<string, number[]>();
    for (const path of paths) {
      const existing = conclusionMap.get(path.conclusion) ?? [];
      existing.push(path.id);
      conclusionMap.set(path.conclusion, existing);
    }

    if (conclusionMap.size > 1) {
      const disagreements = [...conclusionMap.entries()].map(
        ([conclusion, pathIds]) =>
          pathIds.map(pathId => ({ pathId, conclusion }))
      ).flat();

      const severity = this.classifySyndromeSeverity(conclusionMap, paths.length);

      syndromes.push({
        stepIndex: -1, // Conclusion-level syndrome
        disagreements,
        severity,
      });
    }

    logger.debug(
      `Extracted ${syndromes.length} syndromes: ` +
      `${syndromes.filter(s => s.severity === 'critical').length} critical, ` +
      `${syndromes.filter(s => s.severity === 'major').length} major, ` +
      `${syndromes.filter(s => s.severity === 'minor').length} minor`
    );

    return syndromes;
  }

  /**
   * Correct errors using voting across paths.
   *
   * For each step, the conclusion with the highest vote weight among paths
   * is selected. When votingMethod is 'weighted', path confidence is used
   * as vote weight. When 'majority', simple count-based voting is used.
   * If no clear majority exists, the highest-weighted conclusion is used
   * but confidence is reduced.
   *
   * @param paths - Array of reasoning paths
   * @param syndromes - Array of extracted syndromes
   * @returns Corrected reasoning with applied corrections
   */
  correctErrors(
    paths: ReasoningPath[],
    syndromes: Syndrome[],
  ): CorrectedReasoning {
    if (paths.length === 0) {
      return {
        steps: [],
        conclusion: '',
        confidence: 0,
        corrections: [],
        syndromeCount: syndromes.length,
      };
    }

    const syndromeStepIndices = new Set(
      syndromes.filter(s => s.stepIndex >= 0).map(s => s.stepIndex)
    );

    const maxSteps = Math.max(...paths.map(p => p.steps.length));
    const correctedSteps: ReasoningStep[] = [];
    const corrections: CorrectionEntry[] = [];

    for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
      if (syndromeStepIndices.has(stepIdx)) {
        const { step, correction } = this.correctStep(paths, stepIdx);
        correctedSteps.push(step);
        if (correction) {
          corrections.push(correction);
        }
      } else {
        // No disagreement at this step — use the first path's step
        const baseStep = paths[0].steps[stepIdx];
        if (baseStep) {
          correctedSteps.push({ ...baseStep });
        }
      }
    }

    // Correct the final conclusion using majority vote
    const conclusion = this.correctConclusion(paths);
    const confidence = this.calculateCorrectedConfidence(paths, syndromes);

    const result: CorrectedReasoning = {
      steps: correctedSteps,
      conclusion,
      confidence,
      corrections,
      syndromeCount: syndromes.length,
    };

    logger.debug(
      `Error correction applied: ${corrections.length} corrections, ` +
      `confidence: ${confidence.toFixed(3)}`
    );

    return result;
  }

  /**
   * Validate a corrected reasoning chain.
   *
   * Checks for low confidence, missing majority, inconsistent evidence,
   * and all-divergent conditions. Returns a validation result indicating
   * whether the corrected reasoning is trustworthy.
   *
   * @param corrected - The corrected reasoning to validate
   * @returns Validation result with confidence and any issues found
   */
  validate(corrected: CorrectedReasoning): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Check overall confidence
    if (corrected.confidence < this.config.confidenceThreshold) {
      issues.push({
        stepIndex: -1,
        type: 'low-confidence',
        description:
          `Overall confidence ${corrected.confidence.toFixed(3)} is below ` +
          `threshold ${this.config.confidenceThreshold}`,
      });
    }

    // Check for steps with low confidence
    for (const step of corrected.steps) {
      if (step.evidence.length === 0) {
        issues.push({
          stepIndex: step.index,
          type: 'inconsistent-evidence',
          description: `Step ${step.index} has no supporting evidence`,
        });
      }
    }

    // Check if too many corrections were needed (signal of unreliable reasoning)
    if (corrected.syndromeCount > 0 && corrected.confidence < 0.3) {
      issues.push({
        stepIndex: -1,
        type: 'all-divergent',
        description:
          `${corrected.syndromeCount} syndromes with confidence ${corrected.confidence.toFixed(3)} ` +
          `suggests all paths diverged significantly`,
      });
    }

    // Check individual corrections for no-majority situations
    for (const correction of corrected.corrections) {
      if (correction.reason.includes('no clear majority')) {
        issues.push({
          stepIndex: correction.stepIndex,
          type: 'no-majority',
          description:
            `Step ${correction.stepIndex}: ${correction.reason}`,
        });
      }
    }

    const valid = issues.length === 0;
    const confidence = valid
      ? corrected.confidence
      : corrected.confidence * (1 - issues.length * 0.1);

    return {
      valid,
      confidence: Math.max(0, confidence),
      issues,
    };
  }

  /**
   * Convenience method: run the full QEC pipeline on a problem.
   *
   * @param problem - The reasoning problem
   * @returns Object containing paths, syndromes, corrected reasoning, and validation
   */
  process(problem: ReasoningProblem): {
    paths: ReasoningPath[];
    syndromes: Syndrome[];
    corrected: CorrectedReasoning;
    validation: ValidationResult;
  } {
    const paths = this.generatePaths(problem);
    const syndromes = this.extractSyndromes(paths);
    const corrected = this.correctErrors(paths, syndromes);
    const validation = this.validate(corrected);

    return { paths, syndromes, corrected, validation };
  }

  /**
   * Get current configuration.
   */
  getConfig(): Readonly<ReasoningQECConfig> {
    return { ...this.config };
  }

  /**
   * Check if native backend is available.
   */
  isNativeAvailable(): boolean {
    return this.nativeAvailable;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Generate steps for a single reasoning path from a given perspective.
   */
  private generatePathSteps(
    problem: ReasoningProblem,
    pathId: number,
    perspective: string,
  ): ReasoningStep[] {
    return problem.steps.map((stepDescription, index) => {
      const conclusion = this.generateStepConclusion(
        stepDescription, perspective, problem.context, pathId,
      );
      const evidence = this.gatherEvidence(
        stepDescription, perspective, problem.context,
      );

      return {
        index,
        description: `[${perspective}] ${stepDescription}`,
        conclusion,
        evidence,
      };
    });
  }

  /**
   * Generate a conclusion for a step based on perspective and context.
   *
   * Each perspective prioritizes different aspects of the context, producing
   * genuinely diverse conclusions rather than identical text with a path suffix.
   *
   * In production this would call an LLM or apply domain-specific heuristics.
   * The TypeScript fallback uses deterministic derivation from inputs.
   */
  private generateStepConclusion(
    description: string,
    perspective: string,
    context: Record<string, unknown>,
    pathId: number,
  ): string {
    const contextKeys = Object.keys(context).sort();

    // Weight context keys differently per perspective to generate diverse conclusions.
    // Each perspective prioritizes different aspects of the context.
    const perspectiveWeights: Record<number, (keys: string[]) => string> = {
      0: (keys) => keys.length > 0 ? `Focused on ${keys[0]}` : 'Primary analysis',
      1: (keys) => keys.length > 1 ? `Focused on ${keys[keys.length - 1]}` : 'Secondary analysis',
      2: (keys) => keys.length > 0 ? `Cross-referencing ${keys.join(' and ')}` : 'Holistic analysis',
    };

    const focusGenerator = perspectiveWeights[pathId % 3] ?? perspectiveWeights[0];
    const focus = focusGenerator(contextKeys);

    return `[${perspective}] ${description}: ${focus}`;
  }

  /**
   * Gather evidence for a step from the given perspective.
   */
  private gatherEvidence(
    description: string,
    perspective: string,
    context: Record<string, unknown>,
  ): string[] {
    const evidence: string[] = [];
    evidence.push(`Analysis via ${perspective}: ${description}`);

    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        evidence.push(`Context[${key}]: ${String(value)}`);
      }
    }

    return evidence;
  }

  /**
   * Derive a final conclusion from a set of completed steps.
   */
  private deriveConclusion(steps: ReasoningStep[], perspective: string): string {
    if (steps.length === 0) {
      return `No conclusion (${perspective})`;
    }

    const lastStep = steps[steps.length - 1];
    return `${perspective}: ${lastStep.conclusion}`;
  }

  /**
   * Calculate confidence for a single path based on its steps.
   */
  private calculatePathConfidence(steps: ReasoningStep[]): number {
    if (steps.length === 0) return 0;

    // Base confidence from step count and evidence
    const avgEvidence = steps.reduce((sum, s) => sum + s.evidence.length, 0) / steps.length;
    // More evidence = higher confidence, capped at 1
    return Math.min(1, 0.5 + (avgEvidence * 0.1));
  }

  /**
   * Classify syndrome severity based on how many distinct conclusions exist.
   */
  private classifySyndromeSeverity(
    conclusions: Map<string, number[]>,
    totalPaths: number,
  ): 'minor' | 'major' | 'critical' {
    const maxGroupSize = Math.max(...[...conclusions.values()].map(ids => ids.length));

    if (maxGroupSize >= Math.ceil(totalPaths * 2 / 3)) {
      // Clear majority — disagreement is minor
      return 'minor';
    }

    if (maxGroupSize >= Math.ceil(totalPaths / 2)) {
      // Slim majority — disagreement is major
      return 'major';
    }

    // No majority — all paths diverge
    return 'critical';
  }

  /**
   * Correct a single step by voting among paths.
   *
   * When votingMethod is 'weighted', each path's vote is weighted by its
   * confidence score. When 'majority', simple count-based voting is used.
   */
  private correctStep(
    paths: ReasoningPath[],
    stepIndex: number,
  ): { step: ReasoningStep; correction: CorrectionEntry | null } {
    const weightedCounts = new Map<string, number>();
    const stepsByConclusion = new Map<string, ReasoningStep>();

    const useWeighted = this.config.votingMethod === 'weighted';

    for (const path of paths) {
      const step = path.steps[stepIndex];
      if (!step) continue;

      const currentWeight = weightedCounts.get(step.conclusion) ?? 0;
      const increment = useWeighted ? path.confidence : 1;
      weightedCounts.set(step.conclusion, currentWeight + increment);
      stepsByConclusion.set(step.conclusion, step);
    }

    if (weightedCounts.size === 0) {
      // No steps available at this index
      return {
        step: {
          index: stepIndex,
          description: `Step ${stepIndex} (no data)`,
          conclusion: '',
          evidence: [],
        },
        correction: null,
      };
    }

    // Sort by weighted count descending, then by conclusion alphabetically for stability
    const sorted = [...weightedCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    const [majorityConclusion, majorityWeight] = sorted[0];
    const majorityStep = stepsByConclusion.get(majorityConclusion)!;

    // Merge evidence from all paths for this step
    const mergedEvidence = new Set<string>();
    for (const path of paths) {
      const step = path.steps[stepIndex];
      if (step) {
        for (const e of step.evidence) {
          mergedEvidence.add(e);
        }
      }
    }

    const correctedStep: ReasoningStep = {
      index: stepIndex,
      description: majorityStep.description,
      conclusion: majorityConclusion,
      evidence: [...mergedEvidence],
    };

    // Determine if a correction was applied
    const firstPathConclusion = paths[0].steps[stepIndex]?.conclusion;
    let correction: CorrectionEntry | null = null;

    if (firstPathConclusion && firstPathConclusion !== majorityConclusion) {
      const totalPaths = paths.filter(p => p.steps[stepIndex]).length;
      const totalWeight = [...weightedCounts.values()].reduce((a, b) => a + b, 0);
      const ratio = majorityWeight / totalWeight;
      const hasMajority = ratio > this.config.majorityThreshold;

      const voteLabel = useWeighted ? 'Weighted vote' : 'Majority vote';

      correction = {
        stepIndex,
        original: firstPathConclusion,
        corrected: majorityConclusion,
        reason: hasMajority
          ? `${voteLabel} (${majorityWeight.toFixed(2)}/${totalWeight.toFixed(2)} weight from ${totalPaths} paths)`
          : `Selected highest ${useWeighted ? 'weight' : 'count'} (${majorityWeight.toFixed(2)}/${totalWeight.toFixed(2)}), no clear majority`,
      };
    }

    return { step: correctedStep, correction };
  }

  /**
   * Correct the final conclusion using voting among paths.
   *
   * When votingMethod is 'weighted', each path's vote is weighted by its
   * confidence score. When 'majority', simple count-based voting is used.
   */
  private correctConclusion(paths: ReasoningPath[]): string {
    const weightedCounts = new Map<string, number>();
    const useWeighted = this.config.votingMethod === 'weighted';

    for (const path of paths) {
      const currentWeight = weightedCounts.get(path.conclusion) ?? 0;
      const increment = useWeighted ? path.confidence : 1;
      weightedCounts.set(path.conclusion, currentWeight + increment);
    }

    const sorted = [...weightedCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    return sorted[0]?.[0] ?? '';
  }

  /**
   * Calculate confidence for the corrected reasoning based on path agreement
   * and syndrome severity.
   */
  private calculateCorrectedConfidence(
    paths: ReasoningPath[],
    syndromes: Syndrome[],
  ): number {
    // Start with average path confidence
    const avgPathConfidence =
      paths.reduce((sum, p) => sum + p.confidence, 0) / paths.length;

    // Penalize for syndromes
    const criticalCount = syndromes.filter(s => s.severity === 'critical').length;
    const majorCount = syndromes.filter(s => s.severity === 'major').length;
    const minorCount = syndromes.filter(s => s.severity === 'minor').length;

    const penalty =
      criticalCount * 0.2 +
      majorCount * 0.1 +
      minorCount * 0.03;

    // Boost for agreement (no syndromes = high agreement)
    const agreementBoost = syndromes.length === 0 ? 0.1 : 0;

    return Math.max(0, Math.min(1, avgPathConfidence - penalty + agreementBoost));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new ReasoningQEC engine with optional configuration.
 *
 * @param config - Partial configuration overrides
 * @returns Configured ReasoningQEC instance
 */
export function createReasoningQEC(
  config?: Partial<ReasoningQECConfig>,
): ReasoningQEC {
  return new ReasoningQEC(config);
}

/**
 * Run the full QEC pipeline on a problem in one call.
 *
 * @param problem - The reasoning problem to process
 * @param config - Optional configuration overrides
 * @returns Pipeline result with paths, syndromes, corrected reasoning, and validation
 */
export function processReasoning(
  problem: ReasoningProblem,
  config?: Partial<ReasoningQECConfig>,
): {
  paths: ReasoningPath[];
  syndromes: Syndrome[];
  corrected: CorrectedReasoning;
  validation: ValidationResult;
} {
  const qec = createReasoningQEC(config);
  return qec.process(problem);
}
