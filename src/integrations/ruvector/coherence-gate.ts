/**
 * Coherence Gate - Barrel Re-export
 *
 * Backward-compatible barrel file. All implementation has been split into:
 *   - coherence-gate-core.ts: CoherenceGate class, types, factory functions
 *   - coherence-gate-energy.ts: Reflex/retrieval tiers, contradiction, Laplacian
 *   - coherence-gate-vector.ts: FNV-1a hashing, feature vectors, cosine similarity
 *   - coherence-gate-cohomology.ts: WASM CohomologyEngine lazy loader
 *
 * @module integrations/ruvector/coherence-gate
 * @see ADR-083-coherence-gated-agent-actions.md
 */

export {
  CoherenceGate,
  createCoherenceGate,
  createRealTransferCoherenceGate,
  DEFAULT_COHERENCE_THRESHOLD,
  type TestArtifact,
  type CoherenceResult,
  type EnergyComponents,
  type ValidationResult,
  type WitnessRecord,
  type CoherenceDecision,
} from './coherence-gate-core.js';

export {
  computeReflexEnergy,
  computeRetrievalEnergy,
  computeAssertionCoverageEnergy,
  computeCodeCoverageEnergy,
  computeConfidencePenalty,
  detectContradictions,
  computeLaplacianDeviation,
  enableCusumMonitoring,
  disableCusumMonitoring,
  onDriftDetected,
  drainDriftEvents,
  getCusumDetector,
  ENERGY_WEIGHTS,
  REFLEX_LATENCY_BUDGET_MS,
  type DriftDetectedPayload,
  type DriftDetectedListener,
} from './coherence-gate-energy.js';

export {
  textToWordFeatureVector,
  cosineSimilarity,
  hashWord,
  FEATURE_DIM,
} from './coherence-gate-vector.js';

export { resetCohomologyEngineLoader } from './coherence-gate-cohomology.js';
