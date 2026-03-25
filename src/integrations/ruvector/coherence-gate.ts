/**
 * Coherence Gate (Task 3.1, ADR-083)
 *
 * Validates AI-generated test artifacts using heuristic coherence scoring
 * based on word-level feature similarity. Detects hallucinated or inconsistent
 * test outputs by measuring the energy deviation from expected pattern consistency.
 *
 * Compute ladder:
 *   - Reflex (<1ms): Simple heuristic checks (assertion count, coverage overlap)
 *   - Retrieval (~10ms): Full word-frequency coherence computation
 *
 * Implements ITransferCoherenceGate for cross-domain transfer validation.
 * Uses SHA-256 hash-chained witness records for audit trail.
 *
 * @module integrations/ruvector/coherence-gate
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { createHash, randomUUID } from 'crypto';
import { createRequire } from 'module';
import { LoggerFactory } from '../../logging/index.js';

// Use createRequire for native CJS/WASM modules
const esmRequire = createRequire(import.meta.url);
import type {
  ITransferCoherenceGate,
  CoherenceValidation,
} from './transfer-coherence-stub.js';
import { getRuVectorFeatureFlags } from './feature-flags.js';
import type { WitnessChain as GovernanceWitnessChain, WitnessDecision } from '../../governance/witness-chain.js';

const logger = LoggerFactory.create('coherence-gate');

// ============================================================================
// Native CohomologyEngine (prime-radiant-advanced-wasm)
// ============================================================================

/**
 * Minimal interface for the CohomologyEngine from prime-radiant-advanced-wasm.
 */
interface ICohomologyEngine {
  consistencyEnergy(graph: {
    nodes: Array<{ id: number; label: string; section: number[]; weight: number }>;
    edges: Array<{ source: number; target: number; weight: number; restriction_map: number[]; source_dim: number; target_dim: number }>;
  }): number;
}

let cohomologyEngine: ICohomologyEngine | null = null;
let cohomologyLoadAttempted = false;

/**
 * Lazily load the CohomologyEngine from prime-radiant-advanced-wasm.
 * Returns null if the WASM module is unavailable.
 */
function getCohomologyEngine(): ICohomologyEngine | null {
  if (cohomologyLoadAttempted) return cohomologyEngine;
  cohomologyLoadAttempted = true;

  try {
    const pr = esmRequire('prime-radiant-advanced-wasm');
    const fs = esmRequire('fs');
    const path = esmRequire('path');
    const wasmPath = path.join(
      path.dirname(require.resolve('prime-radiant-advanced-wasm')),
      'prime_radiant_advanced_wasm_bg.wasm',
    );
    pr.initSync({ module: fs.readFileSync(wasmPath) });
    cohomologyEngine = new pr.CohomologyEngine() as ICohomologyEngine;
    logger.info('CohomologyEngine loaded from prime-radiant-advanced-wasm');
  } catch (err) {
    logger.debug('CohomologyEngine unavailable, using word-frequency fallback', { error: String(err) });
    cohomologyEngine = null;
  }

  return cohomologyEngine;
}

/**
 * Reset the CohomologyEngine loader state (for testing).
 */
export function resetCohomologyEngineLoader(): void {
  cohomologyEngine = null;
  cohomologyLoadAttempted = false;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Test artifact to validate for coherence.
 */
export interface TestArtifact {
  /** Assertions made by the generated test */
  assertions: string[];
  /** Observed behaviors from actual execution */
  observedBehavior: string[];
  /** Code coverage ratio (0-1) */
  coverage: number;
  /** Domain the test belongs to */
  domain: string;
  /** Confidence score of the generator (0-1) */
  confidence: number;
}

/**
 * Result of coherence energy computation.
 */
export interface CoherenceResult {
  /** Coherence energy score (0-1, lower = more coherent) */
  energy: number;
  /** Which compute tier was used */
  tier: 'reflex' | 'retrieval';
  /** Breakdown of energy components */
  components: EnergyComponents;
  /** Computation latency in milliseconds */
  latencyMs: number;
}

/**
 * Breakdown of energy components for explainability.
 */
export interface EnergyComponents {
  /** Energy from assertion-observation mismatch (0-1) */
  assertionCoverage: number;
  /** Energy from low code coverage (0-1) */
  codeCoverage: number;
  /** Energy from low confidence (0-1) */
  confidencePenalty: number;
  /** Energy from contradiction detection (0-1, retrieval only) */
  contradictionScore: number;
  /** Energy from sheaf Laplacian deviation (0-1, retrieval only) */
  laplacianDeviation: number;
}

/**
 * Result of validation against a threshold.
 */
export interface ValidationResult {
  /** Whether the artifact passes coherence validation */
  passed: boolean;
  /** The coherence energy score */
  energy: number;
  /** The threshold used for validation */
  threshold: number;
  /** Human-readable reason if validation failed */
  reason?: string;
  /** The witness record for this decision */
  witness: WitnessRecord;
}

/**
 * Hash-chained witness record for audit trail.
 */
export interface WitnessRecord {
  /** Unique record identifier */
  id: string;
  /** Timestamp of the decision */
  timestamp: number;
  /** Hash of the artifact that was validated */
  artifactHash: string;
  /** The coherence energy computed */
  energy: number;
  /** The threshold applied */
  threshold: number;
  /** Whether validation passed */
  passed: boolean;
  /** Hash of the previous witness record */
  previousHash: string;
  /** Hash of this record (chained) */
  recordHash: string;
}

/**
 * Decision log entry for observability.
 */
export interface CoherenceDecision {
  /** Unique decision identifier */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Domain of the artifact */
  domain: string;
  /** Computed energy */
  energy: number;
  /** Compute tier used */
  tier: 'reflex' | 'retrieval';
  /** Whether validation passed */
  passed: boolean;
  /** Threshold used */
  threshold: number;
}

/** Default coherence threshold (Normal regime) */
export const DEFAULT_COHERENCE_THRESHOLD = 0.4;

/** Weights for energy component computation */
const ENERGY_WEIGHTS = {
  assertionCoverage: 0.4,
  codeCoverage: 0.3,
  confidencePenalty: 0.3,
  contradictionWeight: 0.2,
  laplacianWeight: 0.15,
} as const;

/** Reflex tier latency cutoff in ms */
const REFLEX_LATENCY_BUDGET_MS = 1;

// ============================================================================
// Coherence Gate Implementation
// ============================================================================

/**
 * Coherence gate for validating AI-generated test artifacts.
 *
 * Uses word-level heuristic coherence scoring to detect hallucinated or
 * inconsistent test outputs. Implements ITransferCoherenceGate for
 * cross-domain transfer validation compatibility.
 *
 * @example
 * ```typescript
 * const gate = new CoherenceGate();
 * const result = gate.validate({
 *   assertions: ['expect(result).toBe(true)'],
 *   observedBehavior: ['result was true'],
 *   coverage: 0.85,
 *   domain: 'test-generation',
 *   confidence: 0.9,
 * });
 * if (!result.passed) {
 *   console.warn('Artifact may be hallucinated:', result.reason);
 * }
 * ```
 */
export class CoherenceGate implements ITransferCoherenceGate {
  private readonly threshold: number;
  private decisionLog: CoherenceDecision[] = [];
  private witnessChain: WitnessRecord[] = [];
  private lastWitnessHash: string = '0'.repeat(64);
  private nativeAvailable: boolean | null = null;
  /** Optional governance witness chain for SQLite persistence */
  private governanceChain: GovernanceWitnessChain | null = null;

  constructor(threshold: number = DEFAULT_COHERENCE_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * Attach a governance WitnessChain (or PersistentWitnessChain) for
   * durable persistence of coherence decisions. When attached, every
   * validation is appended to the governance chain in addition to the
   * in-memory witness array.
   */
  setGovernanceChain(chain: GovernanceWitnessChain): void {
    this.governanceChain = chain;
  }

  // ==========================================================================
  // Core API
  // ==========================================================================

  /**
   * Compute coherence energy for a test artifact.
   *
   * Uses a two-tier compute ladder:
   * - Reflex (<1ms): Simple heuristic checks
   * - Retrieval (~10ms): Full sheaf Laplacian computation
   *
   * @param artifact - The test artifact to evaluate
   * @param forceRetrieval - If true, skip reflex and go straight to retrieval
   * @returns Coherence result with energy score and component breakdown
   */
  computeEnergy(
    artifact: TestArtifact,
    forceRetrieval: boolean = false,
  ): CoherenceResult {
    const startTime = performance.now();

    // Tier 1: Reflex check
    if (!forceRetrieval) {
      const reflexResult = this.computeReflexEnergy(artifact);
      const reflexLatency = performance.now() - startTime;

      if (reflexLatency <= REFLEX_LATENCY_BUDGET_MS) {
        return {
          energy: reflexResult.energy,
          tier: 'reflex',
          components: reflexResult.components,
          latencyMs: reflexLatency,
        };
      }
    }

    // Tier 2: Full retrieval computation
    const retrievalResult = this.computeRetrievalEnergy(artifact);
    const latencyMs = performance.now() - startTime;

    return {
      energy: retrievalResult.energy,
      tier: 'retrieval',
      components: retrievalResult.components,
      latencyMs,
    };
  }

  /**
   * Validate a test artifact against the coherence threshold.
   *
   * @param artifact - The test artifact to validate
   * @param threshold - Optional override for the default threshold
   * @returns Validation result with witness record
   */
  validate(
    artifact: TestArtifact,
    threshold?: number,
  ): ValidationResult {
    const effectiveThreshold = threshold ?? this.threshold;
    const coherenceResult = this.computeEnergy(artifact);
    const passed = coherenceResult.energy <= effectiveThreshold;

    // Build reason for failure
    let reason: string | undefined;
    if (!passed) {
      reason = this.buildFailureReason(coherenceResult, effectiveThreshold);
    }

    // Create witness record
    const witness = this.createWitnessRecord(
      artifact,
      coherenceResult.energy,
      effectiveThreshold,
      passed,
    );

    // Log decision
    this.logDecision({
      id: witness.id,
      timestamp: witness.timestamp,
      domain: artifact.domain,
      energy: coherenceResult.energy,
      tier: coherenceResult.tier,
      passed,
      threshold: effectiveThreshold,
    });

    return {
      passed,
      energy: coherenceResult.energy,
      threshold: effectiveThreshold,
      reason,
      witness,
    };
  }

  /**
   * Get the decision log for observability.
   */
  getDecisionLog(): CoherenceDecision[] {
    return [...this.decisionLog];
  }

  /**
   * Get the witness chain for audit purposes.
   */
  getWitnessChain(): WitnessRecord[] {
    return [...this.witnessChain];
  }

  /**
   * Get the current threshold.
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Clear the decision log (for testing).
   */
  clearDecisionLog(): void {
    this.decisionLog = [];
  }

  // ==========================================================================
  // ITransferCoherenceGate Implementation
  // ==========================================================================

  /**
   * Validate whether a pattern can be transferred to a target domain
   * without introducing coherence violations.
   *
   * Converts the pattern into a TestArtifact and runs coherence validation.
   */
  validateTransfer(
    pattern: { id?: string; domain?: string; confidence?: number; [key: string]: unknown },
    targetDomain: string,
  ): CoherenceValidation {
    const flags = getRuVectorFeatureFlags();
    if (!flags.useCoherenceGate) {
      return { approved: true };
    }

    // Convert pattern to test artifact for coherence check
    const artifact: TestArtifact = {
      assertions: this.extractAssertions(pattern),
      observedBehavior: this.extractObservedBehavior(pattern),
      coverage: typeof pattern.coverage === 'number' ? pattern.coverage : 0.5,
      domain: targetDomain,
      confidence: pattern.confidence ?? 0.5,
    };

    const result = this.validate(artifact);

    return {
      approved: result.passed,
      energy: result.energy,
      rejectionReason: result.reason,
    };
  }

  // ==========================================================================
  // Private: Reflex Tier (Heuristic Checks)
  // ==========================================================================

  /**
   * Reflex-tier energy computation using simple heuristics.
   * Must complete in <1ms.
   */
  private computeReflexEnergy(artifact: TestArtifact): {
    energy: number;
    components: EnergyComponents;
  } {
    const assertionCoverage = this.computeAssertionCoverageEnergy(artifact);
    const codeCoverage = this.computeCodeCoverageEnergy(artifact);
    const confidencePenalty = this.computeConfidencePenalty(artifact);

    const energy = Math.min(
      assertionCoverage * ENERGY_WEIGHTS.assertionCoverage +
      codeCoverage * ENERGY_WEIGHTS.codeCoverage +
      confidencePenalty * ENERGY_WEIGHTS.confidencePenalty,
      1,
    );

    return {
      energy,
      components: {
        assertionCoverage,
        codeCoverage,
        confidencePenalty,
        contradictionScore: 0,
        laplacianDeviation: 0,
      },
    };
  }

  // ==========================================================================
  // Private: Retrieval Tier (Full Sheaf Laplacian)
  // ==========================================================================

  /**
   * Retrieval-tier energy computation using sheaf Laplacian.
   * Includes contradiction detection and Laplacian deviation.
   */
  private computeRetrievalEnergy(artifact: TestArtifact): {
    energy: number;
    components: EnergyComponents;
  } {
    const assertionCoverage = this.computeAssertionCoverageEnergy(artifact);
    const codeCoverage = this.computeCodeCoverageEnergy(artifact);
    const confidencePenalty = this.computeConfidencePenalty(artifact);
    const contradictionScore = this.detectContradictions(artifact);
    const laplacianDeviation = this.computeLaplacianDeviation(artifact);

    // Weighted combination including retrieval-only components
    const baseEnergy =
      assertionCoverage * ENERGY_WEIGHTS.assertionCoverage +
      codeCoverage * ENERGY_WEIGHTS.codeCoverage +
      confidencePenalty * ENERGY_WEIGHTS.confidencePenalty;

    const retrievalEnergy =
      contradictionScore * ENERGY_WEIGHTS.contradictionWeight +
      laplacianDeviation * ENERGY_WEIGHTS.laplacianWeight;

    // Normalize: base has weight sum 1.0, retrieval adds up to 0.35
    // Scale so total is still in [0, 1]
    const totalWeight =
      ENERGY_WEIGHTS.assertionCoverage +
      ENERGY_WEIGHTS.codeCoverage +
      ENERGY_WEIGHTS.confidencePenalty +
      ENERGY_WEIGHTS.contradictionWeight +
      ENERGY_WEIGHTS.laplacianWeight;

    const energy = Math.min((baseEnergy + retrievalEnergy) / totalWeight, 1);

    return {
      energy,
      components: {
        assertionCoverage,
        codeCoverage,
        confidencePenalty,
        contradictionScore,
        laplacianDeviation,
      },
    };
  }

  // ==========================================================================
  // Private: Energy Component Functions
  // ==========================================================================

  /**
   * Compute assertion coverage energy.
   * High energy when assertions far exceed observed behavior (hallucination signal).
   */
  private computeAssertionCoverageEnergy(artifact: TestArtifact): number {
    if (artifact.assertions.length === 0) {
      return 0;
    }
    const ratio = artifact.observedBehavior.length / artifact.assertions.length;
    return Math.max(0, Math.min(1 - ratio, 1));
  }

  /**
   * Compute code coverage energy.
   * Higher energy for lower coverage.
   */
  private computeCodeCoverageEnergy(artifact: TestArtifact): number {
    return Math.max(0, Math.min(1 - artifact.coverage, 1));
  }

  /**
   * Compute confidence penalty.
   * Higher energy for lower confidence.
   */
  private computeConfidencePenalty(artifact: TestArtifact): number {
    return Math.max(0, Math.min(1 - artifact.confidence, 1));
  }

  /**
   * Detect contradictions between assertions and observed behavior.
   *
   * Simple heuristic: look for negation patterns and semantic opposites
   * in the assertion/behavior pairing.
   */
  private detectContradictions(artifact: TestArtifact): number {
    if (artifact.assertions.length === 0 || artifact.observedBehavior.length === 0) {
      return 0;
    }

    let contradictions = 0;
    const negationPatterns = ['not', 'never', 'false', 'undefined', 'null', 'error', 'fail'];

    for (const assertion of artifact.assertions) {
      const assertionLower = assertion.toLowerCase();
      for (const behavior of artifact.observedBehavior) {
        const behaviorLower = behavior.toLowerCase();

        // Check if assertion and behavior have opposing sentiment
        for (const neg of negationPatterns) {
          const assertionHasNeg = assertionLower.includes(neg);
          const behaviorHasNeg = behaviorLower.includes(neg);

          // One has negation, the other does not, and they share a common term
          if (assertionHasNeg !== behaviorHasNeg) {
            const assertionWords = new Set(assertionLower.split(/\s+/));
            const behaviorWords = new Set(behaviorLower.split(/\s+/));
            let shared = 0;
            for (const word of assertionWords) {
              if (behaviorWords.has(word) && word.length > 3) {
                shared++;
              }
            }
            if (shared > 0) {
              contradictions++;
              break;
            }
          }
        }
      }
    }

    return Math.min(contradictions / artifact.assertions.length, 1);
  }

  /**
   * Compute coherence deviation using sheaf Laplacian energy.
   *
   * When `prime-radiant-advanced-wasm` CohomologyEngine is available,
   * builds a sheaf graph from assertion vectors and computes real sheaf
   * Laplacian consistency energy. Falls back to pairwise word-frequency
   * cosine similarity when the WASM module is unavailable.
   *
   * Uses 64-dim word-level feature hashing with FNV-1a for bucket assignment
   * and L2-normalized term-frequency vectors.
   */
  private computeLaplacianDeviation(artifact: TestArtifact): number {
    if (artifact.assertions.length < 2) {
      return 0;
    }

    // Build word-level feature vectors from assertions
    const vectors = artifact.assertions.map(a => this.textToWordFeatureVector(a));

    // Try native CohomologyEngine for real sheaf Laplacian
    const engine = getCohomologyEngine();
    if (engine) {
      try {
        return this.computeNativeLaplacianDeviation(engine, artifact, vectors);
      } catch (err) {
        logger.debug('CohomologyEngine.consistencyEnergy failed, using fallback', { error: String(err) });
      }
    }

    // Fallback: pairwise cosine similarity
    return this.computeFallbackLaplacianDeviation(vectors);
  }

  /**
   * Compute Laplacian deviation using the native CohomologyEngine.
   * Builds a sheaf graph where each assertion is a node and related
   * assertion pairs form edges with identity restriction maps.
   */
  private computeNativeLaplacianDeviation(
    engine: ICohomologyEngine,
    artifact: TestArtifact,
    vectors: number[][],
  ): number {
    const dim = vectors[0]?.length ?? 64;

    // Build sheaf graph: each assertion is a node
    const nodes = vectors.map((vec, i) => ({
      id: i,
      label: artifact.assertions[i]?.slice(0, 50) ?? `assertion-${i}`,
      section: vec,
      weight: artifact.confidence,
    }));

    // Build edges: connect all pairs with identity restriction maps
    const edges: Array<{
      source: number;
      target: number;
      weight: number;
      restriction_map: number[];
      source_dim: number;
      target_dim: number;
    }> = [];

    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        // Identity restriction map (flat dim x dim matrix)
        const identityMap: number[] = [];
        for (let r = 0; r < dim; r++) {
          for (let c = 0; c < dim; c++) {
            identityMap.push(r === c ? 1.0 : 0.0);
          }
        }

        edges.push({
          source: i,
          target: j,
          weight: 1.0,
          restriction_map: identityMap,
          source_dim: dim,
          target_dim: dim,
        });
      }
    }

    const rawEnergy = engine.consistencyEnergy({ nodes, edges });

    // Normalize: raw energy can vary widely; map to [0, 1]
    // Use sigmoid-like scaling: energy / (energy + 1)
    const normalizedEnergy = rawEnergy / (rawEnergy + 1);
    return Math.max(0, Math.min(normalizedEnergy, 1));
  }

  /**
   * Fallback: compute pairwise word-frequency cosine consistency score.
   */
  private computeFallbackLaplacianDeviation(vectors: number[][]): number {
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        totalSimilarity += this.cosineSimilarity(vectors[i], vectors[j]);
        pairCount++;
      }
    }

    if (pairCount === 0) {
      return 0;
    }

    // Average similarity -> deviation
    // High similarity = low deviation, low similarity = high deviation
    const avgSimilarity = totalSimilarity / pairCount;
    return Math.max(0, Math.min(1 - avgSimilarity, 1));
  }

  // ==========================================================================
  // Private: Utility Functions
  // ==========================================================================

  /**
   * Hash a word to a bucket index 0-63 using FNV-1a.
   */
  private hashWord(word: string): number {
    let h = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < word.length; i++) {
      h ^= word.charCodeAt(i);
      h = Math.imul(h, 0x01000193); // FNV prime
    }
    return ((h >>> 0) % 64);
  }

  /**
   * Convert text to a 64-dim word-level feature vector using feature hashing.
   *
   * Tokenizes on whitespace and punctuation, hashes each word to one of 64
   * buckets via FNV-1a, builds a term-frequency vector, and L2-normalizes it.
   */
  private textToWordFeatureVector(text: string): number[] {
    const vec = new Array(64).fill(0);
    const words = text.toLowerCase().split(/[\s,;:.!?()[\]{}"']+/).filter(w => w.length > 0);

    for (const word of words) {
      const bucket = this.hashWord(word);
      vec[bucket]++;
    }

    // L2-normalize
    let norm = 0;
    for (let i = 0; i < 64; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 1e-10) {
      for (let i = 0; i < 64; i++) {
        vec[i] /= norm;
      }
    }

    return vec;
  }

  /**
   * Compute cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 1e-10 ? dot / denom : 0;
  }

  /**
   * Build a human-readable failure reason from coherence results.
   */
  private buildFailureReason(
    result: CoherenceResult,
    threshold: number,
  ): string {
    const parts: string[] = [];
    parts.push(
      `Coherence energy ${result.energy.toFixed(3)} exceeds threshold ${threshold.toFixed(3)}.`,
    );

    const c = result.components;
    if (c.assertionCoverage > 0.5) {
      parts.push('High assertion-observation mismatch (possible hallucination).');
    }
    if (c.codeCoverage > 0.5) {
      parts.push('Low code coverage.');
    }
    if (c.confidencePenalty > 0.5) {
      parts.push('Low generator confidence.');
    }
    if (c.contradictionScore > 0.3) {
      parts.push('Contradictions detected between assertions and observed behavior.');
    }
    if (c.laplacianDeviation > 0.5) {
      parts.push('Inconsistent assertion structure (high Laplacian deviation).');
    }

    return parts.join(' ');
  }

  /**
   * Create a SHA-256 hash-chained witness record.
   */
  private createWitnessRecord(
    artifact: TestArtifact,
    energy: number,
    threshold: number,
    passed: boolean,
  ): WitnessRecord {
    const id = randomUUID();
    const timestamp = Date.now();
    const artifactHash = this.hashContent(JSON.stringify(artifact));

    const record: WitnessRecord = {
      id,
      timestamp,
      artifactHash,
      energy,
      threshold,
      passed,
      previousHash: this.lastWitnessHash,
      recordHash: '', // Will be computed below
    };

    // Compute record hash (chain link)
    const hashPayload = `${id}|${timestamp}|${artifactHash}|${energy}|${threshold}|${passed}|${this.lastWitnessHash}`;
    record.recordHash = this.hashContent(hashPayload);

    // Update chain
    const flags = getRuVectorFeatureFlags();
    if (flags.useWitnessChain) {
      this.witnessChain.push(record);
      this.lastWitnessHash = record.recordHash;

      // Persist to governance chain if attached
      if (this.governanceChain) {
        try {
          const governanceDecision: WitnessDecision = {
            type: 'coherence-gate',
            decision: passed ? 'PASS' : 'FAIL',
            context: { energy, threshold, artifactHash: record.artifactHash },
          };
          this.governanceChain.appendWitness(governanceDecision);
        } catch (err) {
          logger.debug('Failed to persist to governance chain', { error: String(err) });
        }
      }
    }

    return record;
  }

  /**
   * Hash content using SHA-256.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Log a coherence decision for observability.
   */
  private logDecision(decision: CoherenceDecision): void {
    this.decisionLog.push(decision);

    // Keep bounded
    const maxLog = 1000;
    if (this.decisionLog.length > maxLog) {
      this.decisionLog = this.decisionLog.slice(-maxLog);
    }

    logger.debug('Coherence decision', {
      domain: decision.domain,
      energy: decision.energy,
      tier: decision.tier,
      passed: decision.passed,
    });
  }

  /**
   * Extract assertions from a transfer pattern object.
   */
  private extractAssertions(pattern: Record<string, unknown>): string[] {
    if (Array.isArray(pattern.assertions)) {
      return pattern.assertions.map(String);
    }
    if (typeof pattern.description === 'string') {
      return [pattern.description];
    }
    return ['transfer-pattern'];
  }

  /**
   * Extract observed behaviors from a transfer pattern object.
   */
  private extractObservedBehavior(pattern: Record<string, unknown>): string[] {
    if (Array.isArray(pattern.observedBehavior)) {
      return pattern.observedBehavior.map(String);
    }
    if (typeof pattern.evidence === 'string') {
      return [pattern.evidence];
    }
    return ['observed'];
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a coherence gate instance.
 *
 * @param threshold - Coherence energy threshold (default: 0.4)
 * @returns A new CoherenceGate instance
 */
export function createCoherenceGate(
  threshold?: number,
  governanceChain?: GovernanceWitnessChain,
): CoherenceGate {
  const gate = new CoherenceGate(threshold);
  if (governanceChain) {
    gate.setGovernanceChain(governanceChain);
  }
  return gate;
}

/**
 * Create a transfer coherence gate.
 *
 * Returns the real CoherenceGate implementation (replacing the stub).
 * The CoherenceGate implements ITransferCoherenceGate.
 */
export function createRealTransferCoherenceGate(): ITransferCoherenceGate {
  return new CoherenceGate();
}
