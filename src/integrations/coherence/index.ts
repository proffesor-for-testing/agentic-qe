/**
 * Agentic QE v3 - Coherence Service Module
 *
 * Mathematical coherence verification using Prime Radiant engines.
 * Provides coherence gates for multi-agent coordination per ADR-052.
 *
 * **Six Prime Radiant Engines:**
 * 1. CohomologyEngine - Sheaf cohomology for contradiction detection
 * 2. SpectralEngine - Spectral analysis for collapse prediction
 * 3. CausalEngine - Causal inference for spurious correlation detection
 * 4. CategoryEngine - Category theory for type verification
 * 5. HomotopyEngine - Homotopy type theory for formal verification
 * 6. WitnessEngine - Blake3 witness chain for audit trails
 *
 * **Compute Lanes (based on energy threshold):**
 * | Lane | Energy Range | Latency | Action |
 * |------|--------------|---------|--------|
 * | Reflex | E < 0.1 | <1ms | Immediate execution |
 * | Retrieval | 0.1 - 0.4 | ~10ms | Fetch additional context |
 * | Heavy | 0.4 - 0.7 | ~100ms | Deep analysis |
 * | Human | E > 0.7 | Async | Queen escalation |
 *
 * @example Basic Usage
 * ```typescript
 * import { CoherenceService, createCoherenceService } from '@agentic-qe/v3/integrations/coherence';
 *
 * // Create and initialize
 * const service = await createCoherenceService(wasmLoader);
 *
 * // Check coherence
 * const result = await service.checkCoherence(nodes);
 *
 * if (!result.isCoherent) {
 *   console.log('Contradictions found:', result.contradictions);
 * }
 *
 * // Route based on lane
 * switch (result.lane) {
 *   case 'reflex': return executeImmediately();
 *   case 'retrieval': return fetchContextAndRetry();
 *   case 'heavy': return deepAnalysis();
 *   case 'human': return escalateToQueen();
 * }
 * ```
 *
 * @example Strange Loop Integration
 * ```typescript
 * const coherence = await createCoherenceService(wasmLoader);
 *
 * strangeLoop.on('observation_complete', async ({ observation }) => {
 *   const check = await coherence.checkSwarmCoherence(observation.agentHealth);
 *   if (!check.isCoherent) {
 *     await strangeLoop.reconcileBeliefs(check.contradictions);
 *   }
 * });
 * ```
 *
 * @example Consensus Verification
 * ```typescript
 * const votes: AgentVote[] = [
 *   { agentId: 'agent-1', verdict: 'pass', confidence: 0.9, ... },
 *   { agentId: 'agent-2', verdict: 'pass', confidence: 0.85, ... },
 *   { agentId: 'agent-3', verdict: 'fail', confidence: 0.6, ... },
 * ];
 *
 * const consensus = await service.verifyConsensus(votes);
 *
 * if (consensus.isFalseConsensus) {
 *   // Spawn independent reviewer
 * }
 * ```
 *
 * @module integrations/coherence
 */

// ============================================================================
// Main Service
// ============================================================================

export {
  CoherenceService,
  createCoherenceService,
  type ICoherenceService,
} from './coherence-service';

// ============================================================================
// Engine Adapters
// ============================================================================

export {
  // Cohomology (Contradiction Detection)
  CohomologyAdapter,
  createCohomologyAdapter,
  type ICohomologyAdapter,

  // Spectral (Collapse Prediction)
  SpectralAdapter,
  createSpectralAdapter,
  type ISpectralAdapter,

  // Causal (Spurious Correlation Detection)
  CausalAdapter,
  createCausalAdapter,
  type ICausalAdapter,

  // Category (Type Verification)
  CategoryAdapter,
  createCategoryAdapter,
  type ICategoryAdapter,

  // Homotopy (Formal Verification)
  HomotopyAdapter,
  createHomotopyAdapter,
  type IHomotopyAdapter,
  type Proposition,
  type PathEquivalenceResult,
  type VerificationStatus,

  // Witness (Audit Trails)
  WitnessAdapter,
  createWitnessAdapter,
  type IWitnessAdapter,
} from './engines';

// ============================================================================
// Types
// ============================================================================

export type {
  // Compute Lanes
  ComputeLane,
  ComputeLaneConfig,

  // Core Types
  CoherenceNode,
  CoherenceEdge,
  CoherenceResult,
  Contradiction,

  // Belief Types
  Belief,

  // Swarm Types
  AgentHealth,
  SwarmState,
  CollapseRisk,

  // Causal Types
  CausalData,
  CausalVerification,

  // Type Verification
  TypedElement,
  TypedPipeline,
  TypeVerification,
  TypeMismatch,

  // Witness Chain
  Decision,
  WitnessRecord,
  ReplayResult,

  // Consensus
  AgentVote,
  ConsensusResult,

  // Utility Types
  HasEmbedding,

  // Configuration
  CoherenceServiceConfig,
  CoherenceStats,
  CoherenceLogger,

  // WASM Types
  IWasmLoader,
  WasmModule,
  SpectralEngineConstructor,
  HoTTEngineConstructor,
  CoherenceEngines,
  RawCoherenceEngines,

  // Engine Interfaces (adapter-expected, snake_case)
  ICohomologyEngine,
  ISpectralEngine,
  ICausalEngine,
  ICategoryEngine,
  IHomotopyEngine,
  IWitnessEngine,

  // Raw WASM Engine Interfaces (actual API, camelCase)
  IRawCohomologyEngine,
  IRawSpectralEngine,
  IRawCausalEngine,
  IRawCategoryEngine,
  IRawHoTTEngine,
  IRawQuantumEngine,

  // Raw WASM Types
  ContradictionRaw,
  TypeMismatchRaw,
  WitnessRaw,

  // Loader Events
  WasmLoaderEvent,
} from './types';

// ============================================================================
// Constants & Defaults
// ============================================================================

export {
  DEFAULT_COHERENCE_CONFIG,
  DEFAULT_LANE_CONFIG,
  DEFAULT_COHERENCE_LOGGER,
} from './types';

// ============================================================================
// Errors
// ============================================================================

export {
  CoherenceError,
  WasmNotLoadedError,
  WasmLoadError,
  CoherenceCheckError,
  CoherenceTimeoutError,
  UnresolvableContradictionError,
} from './types';

// ============================================================================
// WASM Loader
// ============================================================================

export {
  WasmLoader,
  wasmLoader,
  createLoader,
  isLoaded as isWasmLoaded,
  getEngines as getWasmEngines,
  // ADR-052 A4.3: Fallback exports
  isInDegradedMode,
  getFallbackState,
  getEnginesWithFallback,
} from './wasm-loader';

// ============================================================================
// ADR-052 A4.3: Fallback Types
// ============================================================================

export type { FallbackResult, FallbackState } from './types';

export { DEFAULT_FALLBACK_RESULT } from './types';

// ============================================================================
// Threshold Auto-Tuning (ADR-052 A4.2)
// ============================================================================

export {
  ThresholdTuner,
  createThresholdTuner,
  type IThresholdTuner,
  type ThresholdTunerConfig,
  type ThresholdStats,
  type DomainStats,
  type OutcomeRecord,
  type ThresholdCalibratedPayload,
  type IThresholdMemoryStore,
  type IThresholdEventBus,
  DEFAULT_TUNER_CONFIG,
} from './threshold-tuner';
