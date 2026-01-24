/**
 * Coherence Test Suite Index
 * ADR-052: A1.4 - Unit Tests for CoherenceService and All 6 Engines
 *
 * This module exports test utilities, mocks, and types for the coherence
 * testing infrastructure based on the prime-radiant-advanced-wasm module.
 *
 * Test Files:
 * - wasm-loader.test.ts: WASM module loader with retry logic
 * - coherence-service.test.ts: Main coherence orchestration service
 * - engines/cohomology-adapter.test.ts: Sheaf Laplacian energy calculations
 * - engines/spectral-adapter.test.ts: Eigenvalue analysis and risk assessment
 * - engines/causal-adapter.test.ts: Causal relationship verification
 * - engines/category-adapter.test.ts: Category theory morphisms
 * - engines/homotopy-adapter.test.ts: Path equivalence and topology
 * - engines/witness-adapter.test.ts: Audit trails and witness records
 *
 * Total Tests: 209
 * Coverage Target: 80%+
 */

// Re-export from wasm-loader
export {
  WasmLoader,
  createMockWasmModule,
  type WasmModule,
  type WasmLoaderConfig,
} from './wasm-loader.test';

// Re-export from coherence-service
export {
  CoherenceService,
  createMockEngines,
  type ComputeLane,
  type BeliefState,
  type SwarmState,
  type CoherenceCheckResult,
  type ContradictionResult,
  type CollapseRiskResult,
  type CausalRelationship,
  type CausalVerificationResult,
  type WitnessRecord,
  type WitnessReplayResult,
  type AgentVote,
  type ConsensusResult,
} from './coherence-service.test';

// Re-export from engine adapters
export {
  CohomologyAdapter,
  type NodeData,
  type EdgeData,
  type CohomologyResult,
  type CohomologyEngineConfig,
} from './engines/cohomology-adapter.test';

export {
  SpectralAdapter,
  type SpectralNodeData,
  type SpectralEdgeData,
  type SpectralResult,
  type SpectralEngineConfig,
} from './engines/spectral-adapter.test';

export {
  CausalAdapter,
  type CausalNodeData,
  type CausalEdgeData,
  type CausalResult,
  type CausalDiscoveryResult,
} from './engines/causal-adapter.test';

export {
  CategoryAdapter,
  type CategoryNodeData,
  type CategoryEdgeData,
  type MorphismResult,
  type CategoryResult,
} from './engines/category-adapter.test';

export {
  HomotopyAdapter,
  type HomotopyNodeData,
  type HomotopyEdgeData,
  type HomotopyResult,
  type PathEquivalenceResult,
} from './engines/homotopy-adapter.test';

export {
  WitnessAdapter,
  type WitnessNodeData,
  type WitnessEdgeData,
  type WitnessVerificationResult,
  // Note: WitnessRecord and WitnessReplayResult are also in coherence-service
} from './engines/witness-adapter.test';
