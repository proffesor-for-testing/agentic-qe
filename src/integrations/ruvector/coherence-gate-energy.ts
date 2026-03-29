/**
 * Coherence Gate - Energy Computation
 *
 * Two-tier compute ladder for coherence energy:
 *   - Reflex (<1ms): Simple heuristic checks (assertion count, coverage overlap)
 *   - Retrieval (~10ms): Full word-frequency coherence computation with
 *     contradiction detection and sheaf Laplacian deviation
 *
 * @module integrations/ruvector/coherence-gate-energy
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { LoggerFactory } from '../../logging/index.js';
import { textToWordFeatureVector, cosineSimilarity } from './coherence-gate-vector.js';
import { getCohomologyEngine, type ICohomologyEngine } from './coherence-gate-cohomology.js';
import { CusumDetector, type CusumResult, type GateType } from './cusum-detector.js';
import { isCusumDriftDetectionEnabled } from './feature-flags.js';
import type { TestArtifact, EnergyComponents } from './coherence-gate-core.js';

const logger = LoggerFactory.create('coherence-gate-energy');

// ============================================================================
// CUSUM Drift Detection Integration (R2, Phase 5)
// ============================================================================

/** Payload emitted when CUSUM drift is detected */
export interface DriftDetectedPayload {
  gateType: GateType;
  energy: number;
  cusumResult: CusumResult;
  timestamp: number;
}

/** Callback type for drift detection events */
export type DriftDetectedListener = (payload: DriftDetectedPayload) => void;

/** Module-level CUSUM detector instance (lazy singleton) */
let cusumDetector: CusumDetector | null = null;

/** Registered drift listeners */
const driftListeners: DriftDetectedListener[] = [];

/** Accumulated drift events for polling by EventBus consumers */
const recentDriftEvents: DriftDetectedPayload[] = [];
const MAX_DRIFT_EVENT_BUFFER = 100;

/**
 * Auto-create CUSUM detector if the feature flag is enabled.
 * Returns null when the flag is off and no manual enable has occurred.
 */
function getCusumDetectorAuto(): CusumDetector | null {
  if (cusumDetector) return cusumDetector;
  if (!isCusumDriftDetectionEnabled()) return null;
  cusumDetector = new CusumDetector();
  logger.debug('CUSUM drift detector auto-created via feature flag');
  return cusumDetector;
}

/**
 * Get the module-level CUSUM detector.
 * Auto-creates if the feature flag is enabled.
 */
export function getCusumDetector(): CusumDetector | null {
  return getCusumDetectorAuto();
}

/**
 * Enable CUSUM drift monitoring on energy computations.
 * Once enabled, every energy computation feeds the
 * CUSUM detector and may emit 'drift-detected' events.
 *
 * Note: With useCusumDriftDetection feature flag enabled, the detector
 * is auto-created on first use. This function allows manual creation
 * with custom config when the flag is off.
 */
export function enableCusumMonitoring(
  config?: Partial<{ threshold: number; slack: number; resetOnAlarm: boolean; warmupSamples: number }>,
): CusumDetector {
  cusumDetector = new CusumDetector(config);
  return cusumDetector;
}

/**
 * Disable CUSUM drift monitoring and clear all listeners.
 */
export function disableCusumMonitoring(): void {
  cusumDetector = null;
  driftListeners.length = 0;
  recentDriftEvents.length = 0;
}

/**
 * Register a listener for 'drift-detected' events.
 * Returns an unsubscribe function.
 */
export function onDriftDetected(listener: DriftDetectedListener): () => void {
  driftListeners.push(listener);
  return () => {
    const idx = driftListeners.indexOf(listener);
    if (idx >= 0) driftListeners.splice(idx, 1);
  };
}

/**
 * Get and drain recent drift events (for EventBus polling integration).
 * Returns all accumulated drift events and clears the buffer.
 * Consumers (e.g. coordinators) can poll this in their tick loop and
 * forward to EventBus.emit('cusum:drift-detected', event).
 */
export function drainDriftEvents(): DriftDetectedPayload[] {
  const events = [...recentDriftEvents];
  recentDriftEvents.length = 0;
  return events;
}

/**
 * Feed a computed energy value to the CUSUM detector and emit
 * 'drift-detected' events if drift is found.
 *
 * Called for all four gate types: retrieve, write, learn, act.
 */
function checkCusumDrift(gateType: GateType, energy: number): void {
  const detector = getCusumDetectorAuto();
  if (!detector) return;

  const result = detector.update(gateType, energy);
  if (result.driftDetected) {
    const payload: DriftDetectedPayload = {
      gateType,
      energy,
      cusumResult: result,
      timestamp: Date.now(),
    };

    logger.warn('CUSUM drift detected', {
      gateType,
      energy,
      direction: result.direction,
      cumulativeSum: result.cumulativeSum,
    });

    // Buffer for EventBus polling
    recentDriftEvents.push(payload);
    if (recentDriftEvents.length > MAX_DRIFT_EVENT_BUFFER) {
      recentDriftEvents.shift();
    }

    for (const listener of driftListeners) {
      try {
        listener(payload);
      } catch (err) {
        logger.debug('Drift listener error', { error: String(err) });
      }
    }
  }
}

/** Weights for energy component computation */
export const ENERGY_WEIGHTS = {
  assertionCoverage: 0.4,
  codeCoverage: 0.3,
  confidencePenalty: 0.3,
  contradictionWeight: 0.2,
  laplacianWeight: 0.15,
} as const;

/** Reflex tier latency cutoff in ms */
export const REFLEX_LATENCY_BUDGET_MS = 1;

// ============================================================================
// Component Energy Functions
// ============================================================================

/**
 * Compute assertion coverage energy.
 * High energy when assertions far exceed observed behavior (hallucination signal).
 */
export function computeAssertionCoverageEnergy(artifact: TestArtifact): number {
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
export function computeCodeCoverageEnergy(artifact: TestArtifact): number {
  return Math.max(0, Math.min(1 - artifact.coverage, 1));
}

/**
 * Compute confidence penalty.
 * Higher energy for lower confidence.
 */
export function computeConfidencePenalty(artifact: TestArtifact): number {
  return Math.max(0, Math.min(1 - artifact.confidence, 1));
}

// ============================================================================
// Contradiction Detection
// ============================================================================

/**
 * Detect contradictions between assertions and observed behavior.
 *
 * Simple heuristic: look for negation patterns and semantic opposites
 * in the assertion/behavior pairing.
 */
export function detectContradictions(artifact: TestArtifact): number {
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

// ============================================================================
// Laplacian Deviation
// ============================================================================

/**
 * Compute Laplacian deviation using the native CohomologyEngine.
 * Builds a sheaf graph where each assertion is a node and related
 * assertion pairs form edges with identity restriction maps.
 */
export function computeNativeLaplacianDeviation(
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
export function computeFallbackLaplacianDeviation(vectors: number[][]): number {
  let totalSimilarity = 0;
  let pairCount = 0;

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      totalSimilarity += cosineSimilarity(vectors[i], vectors[j]);
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
export function computeLaplacianDeviation(artifact: TestArtifact): number {
  if (artifact.assertions.length < 2) {
    return 0;
  }

  // Build word-level feature vectors from assertions
  const vectors = artifact.assertions.map(a => textToWordFeatureVector(a));

  // Try native CohomologyEngine for real sheaf Laplacian
  const engine = getCohomologyEngine();
  if (engine) {
    try {
      return computeNativeLaplacianDeviation(engine, artifact, vectors);
    } catch (err) {
      logger.debug('CohomologyEngine.consistencyEnergy failed, using fallback', { error: String(err) });
    }
  }

  // Fallback: pairwise cosine similarity
  return computeFallbackLaplacianDeviation(vectors);
}

// ============================================================================
// Tier Computation
// ============================================================================

/**
 * Reflex-tier energy computation using simple heuristics.
 * Must complete in <1ms.
 *
 * @param artifact - Test artifact to compute energy for
 * @param gateType - Gate action type for CUSUM tracking (default: 'act')
 */
export function computeReflexEnergy(
  artifact: TestArtifact,
  gateType: GateType = 'act',
): {
  energy: number;
  components: EnergyComponents;
} {
  const assertionCoverage = computeAssertionCoverageEnergy(artifact);
  const codeCoverage = computeCodeCoverageEnergy(artifact);
  const confidencePenalty = computeConfidencePenalty(artifact);

  const energy = Math.min(
    assertionCoverage * ENERGY_WEIGHTS.assertionCoverage +
    codeCoverage * ENERGY_WEIGHTS.codeCoverage +
    confidencePenalty * ENERGY_WEIGHTS.confidencePenalty,
    1,
  );

  // R2: CUSUM drift check for reflex-tier gate actions
  checkCusumDrift(gateType, energy);

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

/**
 * Retrieval-tier energy computation using sheaf Laplacian.
 * Includes contradiction detection and Laplacian deviation.
 *
 * @param artifact - Test artifact to compute energy for
 * @param gateType - Gate action type for CUSUM tracking (default: 'retrieve')
 */
export function computeRetrievalEnergy(
  artifact: TestArtifact,
  gateType: GateType = 'retrieve',
): {
  energy: number;
  components: EnergyComponents;
} {
  const assertionCoverage = computeAssertionCoverageEnergy(artifact);
  const codeCoverage = computeCodeCoverageEnergy(artifact);
  const confidencePenalty = computeConfidencePenalty(artifact);
  const contradictionScore = detectContradictions(artifact);
  const laplacianDeviation = computeLaplacianDeviation(artifact);

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

  // R2: CUSUM drift check for all four gate types
  checkCusumDrift(gateType, energy);

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
