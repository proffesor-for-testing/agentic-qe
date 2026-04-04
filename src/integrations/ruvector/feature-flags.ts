/**
 * RuVector Feature Flags for V3 QE Integration
 *
 * Controls which @ruvector package features are enabled for QE operations.
 * All flags default to true (enabled) and can be disabled for debugging,
 * testing, or opt-out scenarios.
 *
 * Note: These are enable/disable flags for feature control, NOT error hiding.
 * If a dependency fails, it throws an error - we don't silently fall back.
 *
 * @module integrations/ruvector/feature-flags
 */

// ============================================================================
// Feature Flags Interface
// ============================================================================

/**
 * Feature flags controlling @ruvector package usage in QE
 *
 * @example
 * ```typescript
 * import { setRuVectorFeatureFlags, getRuVectorFeatureFlags } from './feature-flags';
 *
 * // Disable SONA for debugging
 * setRuVectorFeatureFlags({ useQESONA: false });
 *
 * // Check current flags
 * const flags = getRuVectorFeatureFlags();
 * if (flags.useQEFlashAttention) {
 *   // Use Flash Attention for similarity computation
 * }
 * ```
 */
export interface RuVectorFeatureFlags {
  /**
   * Enable QE SONA (Self-Optimizing Neural Architecture)
   * Uses @ruvector/sona for pattern learning and adaptation
   * @default true
   */
  useQESONA: boolean;

  /**
   * Enable QE Flash Attention
   * Uses @ruvector/attention for SIMD-accelerated attention computation
   * @default true
   */
  useQEFlashAttention: boolean;

  /**
   * Enable QE GNN Embedding Index
   * Uses @ruvector/gnn for differentiable search and HNSW indexing
   * @default true
   */
  useQEGNNIndex: boolean;

  /**
   * Log migration metrics when transitioning between implementations
   * Useful for tracking performance differences during rollout
   * @default true
   */
  logMigrationMetrics: boolean;

  /**
   * Enable Native HNSW backend via @ruvector/router VectorDb
   * Uses the Rust-based HNSW implementation for higher throughput
   * and lower latency vector search. Falls back to ProgressiveHnswBackend
   * when the native binary is unavailable or the database lock is held.
   * @default true
   */
  useNativeHNSW: boolean;

  /**
   * Enable Temporal Tensor Compression (ADR-085)
   * Compresses pattern embeddings based on access frequency using tiered
   * quantization (8-bit hot, 5-bit warm, 3-bit cold). Reduces memory
   * usage for infrequently accessed patterns.
   * @default true
   */
  useTemporalCompression: boolean;

  /**
   * Enable metadata filtering on pattern search results (Task 1.2)
   * Uses TypeScript in-memory filtering (no native package exists).
   * Filtering is applied post-search to refine results by domain,
   * severity, confidence range, tags, date range, etc.
   * @default true
   */
  useMetadataFiltering: boolean;

  /**
   * Enable deterministic dithering for embedding quantization (Task 1.4)
   * Uses golden-ratio quasi-random dithering to produce cross-platform
   * reproducible quantization results. When enabled, tensor compression
   * applies dithering as a post-processing step, improving reconstruction
   * quality at low bit depths while guaranteeing identical outputs on
   * x86, ARM, and WASM platforms.
   * @default true
   */
  useDeterministicDither: boolean;

  /**
   * Enable Neural Model Routing via SimpleNeuralRouter (ADR-082, Task 2.1)
   * Replaces rule-based TinyDancer complexity thresholds with a lightweight
   * TypeScript neural network (Input(4)→Dense(32)→Dense(3)→Softmax).
   * Starts in shadow mode (runs alongside rule-based for first 1000 decisions),
   * then transitions to neural-primary when disagreement rate falls below 10%.
   * Circuit breaker falls back to rule-based if error rate exceeds 20%.
   * Note: `@ruvector/tiny-dancer` NAPI binary is missing from ARM64 package;
   * the TS SimpleNeuralRouter is production-ready (4→32→3 network is too
   * small to benefit from native acceleration).
   * @default true
   */
  useNeuralRouting: boolean;

  /**
   * Enable SONA Three-Loop Engine (Task 2.2: EWC++ & MicroLoRA)
   * Adds three-loop coordination to SONA:
   * - Instant loop: per-request MicroLoRA adaptation (<100us)
   * - Background loop: periodic EWC++ consolidation
   * - Coordination loop: cross-agent state synchronization
   * When disabled, SONA operates without the three-loop enhancement.
   * @default true
   */
  useSONAThreeLoop: boolean;

  /**
   * Enable Cross-Domain Transfer Learning (ADR-084, Task 2.3)
   * Enables knowledge transfer between QE domains using Thompson Sampling
   * with Beta priors for exploration/exploitation, sqrt-dampening to prevent
   * overly aggressive transfers, and a double verification gate (source must
   * not regress, target must improve). Coherence gate integration uses a
   * pass-through stub until Task 3.1 implements the real gate.
   * @default true
   */
  useCrossDomainTransfer: boolean;

  /**
   * Enable HNSW Health Monitor (Task 3.4)
   * Performs periodic spectral health checks on HNSW indexes computing
   * Fiedler value, spectral gap, effective resistance, and coherence score.
   * Generates alerts when thresholds are exceeded (FragileIndex, PoorExpansion,
   * HighResistance, LowCoherence). Uses TypeScript power iteration
   * approximations (no native package exists for spectral computation).
   * @default true
   */
  useHnswHealthMonitor: boolean;

  /**
   * Enable Regret Tracking (Task 2.4: Regret Tracking & Learning Health)
   * Tracks cumulative regret per domain to assess whether QE agents are
   * learning over time. Classifies regret growth as sublinear (learning),
   * linear (stagnating), or superlinear (degrading). Alerts on transitions.
   * @default true
   */
  useRegretTracking: boolean;

  /**
   * Enable Sheaf-Gated Coherence Gate (ADR-083, Task 3.1)
   * Validates AI-generated test artifacts using sheaf Laplacian coherence
   * energy computation. Detects hallucinated or inconsistent test outputs.
   * Uses a two-tier compute ladder (reflex <1ms, retrieval ~10ms).
   * Implements ITransferCoherenceGate replacing the stub.
   * @default true
   */
  useCoherenceGate: boolean;

  /**
   * Enable Blake3 hash-chained witness records (Task 3.1)
   * Creates a tamper-evident audit trail of all coherence gate decisions.
   * Each witness record is hash-chained to the previous one.
   * Falls back to SHA-256 when Blake3 is unavailable.
   * @default true
   */
  useWitnessChain: boolean;

  /**
   * Enable CNN Visual Regression (Task 4.3)
   * Uses spatial pooling embeddings for visual regression testing
   * instead of pixel-level diffing. TypeScript implementation with
   * 8x8 grid spatial pooling (no native CNN package exists).
   * @default true
   */
  useCNNVisualRegression: boolean;

  /**
   * Enable DAG Attention for Test Scheduling (Phase 4, Task 4.2)
   * Uses DAG-based attention mechanisms for intelligent test execution ordering:
   * critical path attention, parallel branch attention, and MinCut-gated pruning.
   * TypeScript implementation (no native package exists for DAG attention).
   * @default true
   */
  useDAGAttention: boolean;

  /**
   * Enable Coherence-Gated Agent Actions (ADR-083, Task 3.2)
   * Evaluates agent actions through three stacked filters (structural, shift,
   * evidence) before execution. Produces PERMIT/DEFER/DENY decisions.
   * Advisory mode by default: logs decisions but does not block execution.
   * TypeScript implementation (no native package exists).
   * @default true
   */
  useCoherenceActionGate: boolean;

  /**
   * Enable Reasoning QEC (Task 4.5: Multi-Path Consensus)
   * Applies error correction to AI reasoning using three independent paths.
   * Syndrome extraction identifies disagreements between paths; majority-vote
   * correction produces a high-confidence corrected reasoning chain.
   * Applicable to test generation validation, security audit consensus,
   * and defect triage. TypeScript implementation (no native package exists).
   * @default true
   */
  useReasoningQEC: boolean;

  // ==========================================================================
  // RVF Cluster (ADR-065–072) — Persistent vector storage & COW branching
  // ==========================================================================

  /**
   * Enable RVF-backed PatternStore (ADR-066)
   * Replaces SQLite BLOB + in-memory HNSW rebuild with @ruvector/rvf-node
   * persistent HNSW. Eliminates cold-start index rebuild, provides sub-ms
   * search via native SIMD acceleration, and enables COW branching (ADR-067/069).
   * Pattern metadata remains in SQLite; only vector storage moves to RVF.
   * @default false — will flip to true after benchmarks confirm improvement
   */
  useRVFPatternStore: boolean;

  /**
   * Enable Agent Memory Branching via RVF COW (ADR-067)
   * Each spawned agent gets a lightweight COW-derived .rvf branch file.
   * Agent writes are isolated; successful agents merge back, failed agents
   * discard at zero cost. Requires useRVFPatternStore to be enabled.
   * @default false — will flip to true after benchmarks confirm improvement
   */
  useAgentMemoryBranching: boolean;

  /**
   * Enable Unified HNSW Provider (ADR-071)
   * Routes all three legacy HNSW implementations (TypeScript, RuvectorFlatIndex,
   * QEGNNEmbeddingIndex) through a single HnswAdapter backend. Eliminates
   * inconsistent search results and triples maintenance burden.
   * @default false — will flip to true after shadow validation confirms <2% divergence
   */
  useUnifiedHnsw: boolean;

  // ==========================================================================
  // Phase 5 Capabilities (ADR-087) — verified, default true (opt-out)
  // ==========================================================================

  /**
   * Enable HDC Pattern Fingerprinting (R1, ADR-087)
   * Uses 10,000-bit binary hypervectors with XOR binding for O(1) compositional
   * pattern fingerprinting and nanosecond Hamming-distance similarity.
   * TypeScript fallback; WASM upgrade path via @ruvector/hdc-wasm.
   * @default true
   */
  useHDCFingerprinting: boolean;

  /**
   * Enable CUSUM Drift Detection (R2, ADR-087)
   * Adds statistical change-point detection to the coherence gate using
   * two-sided Cumulative Sum (CUSUM) algorithm. Replaces heuristic thresholds
   * with statistically rigorous drift detection per gate type.
   * @default true
   */
  useCusumDriftDetection: boolean;

  /**
   * Enable Delta Event Sourcing (R3, ADR-087)
   * Tracks pattern version history as delta events in SQLite. Enables rollback
   * to any previous pattern state and incremental sync between agents.
   * @default true
   */
  useDeltaEventSourcing: boolean;

  /**
   * Enable EWC++ Regularization (ADR-087)
   * Activates Elastic Weight Consolidation++ Fisher Information Matrix
   * computation in domain coordinators. Prevents catastrophic forgetting
   * when learning new domains. Requires useSONAThreeLoop to be enabled.
   * @default true
   */
  useEwcPlusPlusRegularization: boolean;

  // ==========================================================================
  // Phase 5 Capabilities (ADR-087) — Milestone 2: verified, default true
  // ==========================================================================

  /**
   * Enable GraphMAE Self-Supervised Embeddings (R4, ADR-087)
   * Zero-label graph learning via masked graph autoencoders. Produces embeddings
   * from code dependency graph structure without labeled training data.
   * Consumer: coordinator-gnn.ts generateGraphMAEEmbeddings()
   * Activation: enable after verifying 1K-node embedding quality in your graph
   * @default false
   */
  useGraphMAEEmbeddings: boolean;

  /**
   * Enable Modern Hopfield Memory (R5, ADR-087)
   * Exponential-capacity associative memory for exact pattern recall.
   * Complements HNSW approximate search with content-addressable exact retrieval.
   * Consumer: pattern-store.ts store()/search() exact recall path
   * Activation: enable after verifying recall accuracy at your pattern count
   * Note: at beta=8 with normalized patterns, softmax recall is equivalent
   * to a single Hopfield fixed-point iteration (Ramsauer 2020, Theorem 3)
   * @default false
   */
  useHopfieldMemory: boolean;

  /**
   * Enable Cold-Tier GNN Training (R6, ADR-087)
   * LRU-cached mini-batch GNN training for graphs exceeding hotsetSize.
   * FileBackedGraph available for true disk-backed larger-than-RAM graphs.
   * Consumer: coordinator-gnn.ts trainWithColdTier()
   * Activation: enable when pattern graph exceeds 10K nodes
   * @default false
   */
  useColdTierGNN: boolean;

  // ==========================================================================
  // Phase 5 Capabilities (ADR-087) — Milestone 3: Scale & Optimization
  // Activation: set to true after verifying success criteria in your
  // environment. See ruvector-improvements-plan.md §Milestone 3.
  // ==========================================================================

  /**
   * Enable Meta-Learning Enhancements (R7, ADR-087)
   * Adds DecayingBeta, PlateauDetector, ParetoFront, and CuriosityBonus
   * to the cross-domain transfer engine for adaptive exploration.
   * Consumer: domain-transfer.ts DomainTransferEngine
   * Activation: enable after verifying plateau detection on transfer history
   * @default false
   */
  useMetaLearningEnhancements: boolean;

  /**
   * Enable Sublinear Solver (R8, ADR-087)
   * O(log n) PageRank for graph-based pattern importance scoring.
   * TypeScript power-iteration fallback; native @ruvector/solver-node optional.
   * Consumer: pattern-promotion.ts (future integration)
   * Activation: enable after bootstrapping a pattern citation graph
   * @default false
   */
  useSublinearSolver: boolean;

  /**
   * Enable Spectral Graph Sparsification (R9, ADR-087)
   * Effective resistance sampling to compress graphs while preserving
   * Laplacian spectral properties. Reduces cost of graph operations.
   * Consumer: coherence checks, mincut analysis (future integration)
   * Activation: enable when graph edge count exceeds 10K
   * @default false
   */
  useSpectralSparsification: boolean;

  /**
   * Enable Reservoir Replay with Coherence Gating (R10, ADR-087)
   * Fixed-size replay buffer with coherence-gated admission and
   * tier-weighted sampling. Uses CUSUM for drift-aware threshold.
   * Consumer: experience-replay.ts (future integration)
   * Activation: enable after verifying admission quality on your workload
   * @default false
   */
  useReservoirReplay: boolean;

  // ==========================================================================
  // Phase 5 Capabilities (ADR-087) — Milestone 4: Advanced Learning
  // ==========================================================================

  /**
   * Enable E-prop Online Learning (R11, ADR-087)
   * Eligibility propagation with 12 bytes/synapse, no backprop required.
   * Registers as RL algorithm #10 in the suite.
   * Consumer: rl-suite algorithms/eprop.ts
   * @default false
   */
  useEpropOnlineLearning: boolean;

  /**
   * Enable Granger Causality for Test Failure Prediction (R12, ADR-087)
   * Discovers causal chains in test execution history using VAR + F-test.
   * Complements STDP (real-time) with batch historical analysis.
   * Consumer: defect-intelligence domain
   * @default false
   */
  useGrangerCausality: boolean;

  // ==========================================================================
  // Phase 5 Capabilities (ADR-087) — Milestone 5: Routing & Geometry
  // ==========================================================================

  /**
   * Enable Cognitive Routing (R13, ADR-087)
   * Predictive coding for agent communication bandwidth reduction. Predicts
   * next message from sliding window context and sends only the delta.
   * Oscillatory routing multiplexes concurrent message streams.
   * Consumer: agent communication layer
   * @default false
   */
  useCognitiveRouting: boolean;

  /**
   * Enable Hyperbolic HNSW (R14, ADR-087)
   * Poincare ball embeddings for hierarchical data. Maps tree-structured data
   * (module hierarchies, test suite trees) into hyperbolic space where distances
   * naturally preserve parent-child relationships.
   * Consumer: code-intelligence hierarchical search
   * @default false
   */
  useHyperbolicHnsw: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default feature flags - all enabled by default
 */
const DEFAULT_FEATURE_FLAGS: RuVectorFeatureFlags = {
  useQESONA: true,
  useQEFlashAttention: true,
  useQEGNNIndex: true,
  logMigrationMetrics: true,
  useNativeHNSW: true,
  useTemporalCompression: true,
  useMetadataFiltering: true,
  useDeterministicDither: true,
  useNeuralRouting: true,
  useSONAThreeLoop: true,
  useCrossDomainTransfer: true,
  useHnswHealthMonitor: true,
  useRegretTracking: true,
  useCoherenceGate: true,
  useWitnessChain: true,
  useCNNVisualRegression: true,
  useDAGAttention: true,
  useCoherenceActionGate: true,
  useReasoningQEC: true,
  // RVF Cluster (ADR-065–072)
  useRVFPatternStore: true, // benchmarked: 0.4ms cold-start, 0.5ms search p50
  useAgentMemoryBranching: false, // blocked: merge corrupts data + not wired into boot
  useUnifiedHnsw: false, // blocked: bridge not wired into any consumer
  // Phase 5 (ADR-087) — enabled by default, opt-out
  useHDCFingerprinting: true,
  useCusumDriftDetection: true,
  useDeltaEventSourcing: true,
  useEwcPlusPlusRegularization: true,
  // Phase 5 Milestone 2 (ADR-087) — verified, default true (opt-out)
  useGraphMAEEmbeddings: true,
  useHopfieldMemory: true,
  useColdTierGNN: true,
  // Phase 5 Milestone 3 (ADR-087) — verified, default true (opt-out)
  useMetaLearningEnhancements: true,
  useSublinearSolver: true,
  useSpectralSparsification: true,
  useReservoirReplay: true,
  // Phase 5 Milestone 4 (ADR-087) — verified, default true (opt-out)
  useEpropOnlineLearning: true,
  useGrangerCausality: true,
  // Phase 5 Milestone 5 (ADR-087) — backlog/speculative, default false (opt-in)
  useCognitiveRouting: false,
  useHyperbolicHnsw: false,
};

// ============================================================================
// Internal State
// ============================================================================

/**
 * Current feature flags state (mutable for runtime configuration)
 */
let currentFeatureFlags: RuVectorFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };

// ============================================================================
// Public API
// ============================================================================

/**
 * Get current RuVector feature flags
 *
 * @returns Current feature flag configuration (immutable copy)
 *
 * @example
 * ```typescript
 * const flags = getRuVectorFeatureFlags();
 * console.log(`SONA enabled: ${flags.useQESONA}`);
 * console.log(`Flash Attention enabled: ${flags.useQEFlashAttention}`);
 * console.log(`GNN Index enabled: ${flags.useQEGNNIndex}`);
 * ```
 */
export function getRuVectorFeatureFlags(): Readonly<RuVectorFeatureFlags> {
  return { ...currentFeatureFlags };
}

/**
 * Set RuVector feature flags
 *
 * Updates the current feature flags with the provided partial configuration.
 * Only specified flags are changed; others retain their current values.
 *
 * @param flags - Partial feature flag configuration to merge
 *
 * @example
 * ```typescript
 * // Disable SONA for debugging
 * setRuVectorFeatureFlags({ useQESONA: false });
 *
 * // Enable metrics logging only
 * setRuVectorFeatureFlags({
 *   useQESONA: false,
 *   useQEFlashAttention: false,
 *   useQEGNNIndex: false,
 *   logMigrationMetrics: true,
 * });
 * ```
 */
export function setRuVectorFeatureFlags(
  flags: Partial<RuVectorFeatureFlags>
): void {
  currentFeatureFlags = {
    ...currentFeatureFlags,
    ...flags,
  };
}

/**
 * Reset RuVector feature flags to defaults
 *
 * Restores all feature flags to their default values (all enabled).
 * Useful for cleanup after tests or debugging sessions.
 *
 * @example
 * ```typescript
 * // After tests
 * afterEach(() => {
 *   resetRuVectorFeatureFlags();
 * });
 * ```
 */
export function resetRuVectorFeatureFlags(): void {
  currentFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if SONA is enabled
 * @returns true if useQESONA flag is set
 */
export function isSONAEnabled(): boolean {
  return currentFeatureFlags.useQESONA;
}

/**
 * Check if Flash Attention is enabled
 * @returns true if useQEFlashAttention flag is set
 */
export function isFlashAttentionEnabled(): boolean {
  return currentFeatureFlags.useQEFlashAttention;
}

/**
 * Check if GNN Index is enabled
 * @returns true if useQEGNNIndex flag is set
 */
export function isGNNIndexEnabled(): boolean {
  return currentFeatureFlags.useQEGNNIndex;
}

/**
 * Check if migration metrics logging is enabled
 * @returns true if logMigrationMetrics flag is set
 */
export function shouldLogMigrationMetrics(): boolean {
  return currentFeatureFlags.logMigrationMetrics;
}

/**
 * Check if Native HNSW backend is enabled
 * @returns true if useNativeHNSW flag is set
 */
export function isNativeHNSWEnabled(): boolean {
  return currentFeatureFlags.useNativeHNSW;
}

/**
 * Check if Temporal Tensor Compression is enabled (ADR-085)
 * @returns true if useTemporalCompression flag is set
 */
export function isTemporalCompressionEnabled(): boolean {
  return currentFeatureFlags.useTemporalCompression;
}

/**
 * Check if metadata filtering is enabled (Task 1.2)
 * @returns true if useMetadataFiltering flag is set
 */
export function isMetadataFilteringEnabled(): boolean {
  return currentFeatureFlags.useMetadataFiltering;
}

/**
 * Check if deterministic dithering is enabled (Task 1.4)
 * @returns true if useDeterministicDither flag is set
 */
export function isDeterministicDitherEnabled(): boolean {
  return currentFeatureFlags.useDeterministicDither;
}

/**
 * Check if Neural Model Routing is enabled (ADR-082, Task 2.1)
 * @returns true if useNeuralRouting flag is set
 */
export function isNeuralRoutingEnabled(): boolean {
  return currentFeatureFlags.useNeuralRouting;
}

/**
 * Check if SONA Three-Loop Engine is enabled (Task 2.2)
 * @returns true if useSONAThreeLoop flag is set
 */
export function isSONAThreeLoopEnabled(): boolean {
  return currentFeatureFlags.useSONAThreeLoop;
}

/**
 * Check if Cross-Domain Transfer Learning is enabled (ADR-084, Task 2.3)
 * @returns true if useCrossDomainTransfer flag is set
 */
export function isCrossDomainTransferEnabled(): boolean {
  return currentFeatureFlags.useCrossDomainTransfer;
}

/**
 * Check if HNSW Health Monitor is enabled (Task 3.4)
 * @returns true if useHnswHealthMonitor flag is set
 */
export function isHnswHealthMonitorEnabled(): boolean {
  return currentFeatureFlags.useHnswHealthMonitor;
}

/**
 * Check if Regret Tracking is enabled (Task 2.4)
 * @returns true if useRegretTracking flag is set
 */
export function isRegretTrackingEnabled(): boolean {
  return currentFeatureFlags.useRegretTracking;
}

/**
 * Check if Coherence Gate is enabled (ADR-083, Task 3.1)
 * @returns true if useCoherenceGate flag is set
 */
export function isCoherenceGateEnabled(): boolean {
  return currentFeatureFlags.useCoherenceGate;
}

/**
 * Check if Witness Chain is enabled (Task 3.1)
 * @returns true if useWitnessChain flag is set
 */
export function isWitnessChainEnabled(): boolean {
  return currentFeatureFlags.useWitnessChain;
}

/**
 * Check if CNN Visual Regression is enabled (Task 4.3)
 * @returns true if useCNNVisualRegression flag is set
 */
export function isCNNVisualRegressionEnabled(): boolean {
  return currentFeatureFlags.useCNNVisualRegression;
}

/**
 * Check if DAG Attention for Test Scheduling is enabled (Phase 4, Task 4.2)
 * @returns true if useDAGAttention flag is set
 */
export function isDAGAttentionEnabled(): boolean {
  return currentFeatureFlags.useDAGAttention;
}

/**
 * Check if Coherence-Gated Agent Actions is enabled (ADR-083, Task 3.2)
 * @returns true if useCoherenceActionGate flag is set
 */
export function isCoherenceActionGateEnabled(): boolean {
  return currentFeatureFlags.useCoherenceActionGate;
}

/**
 * Check if Reasoning QEC is enabled (Task 4.5)
 * @returns true if useReasoningQEC flag is set
 */
export function isReasoningQECEnabled(): boolean {
  return currentFeatureFlags.useReasoningQEC;
}

// RVF Cluster (ADR-065–072) convenience functions

/**
 * Check if RVF-backed PatternStore is enabled (ADR-066)
 * @returns true if useRVFPatternStore flag is set
 */
export function isRVFPatternStoreEnabled(): boolean {
  return currentFeatureFlags.useRVFPatternStore;
}

/**
 * Check if Agent Memory Branching is enabled (ADR-067)
 * @returns true if useAgentMemoryBranching flag is set
 */
export function isAgentMemoryBranchingEnabled(): boolean {
  return currentFeatureFlags.useAgentMemoryBranching;
}

/**
 * Check if Unified HNSW Provider is enabled (ADR-071)
 * @returns true if useUnifiedHnsw flag is set
 */
export function isUnifiedHnswEnabled(): boolean {
  return currentFeatureFlags.useUnifiedHnsw;
}

// Phase 5 (ADR-087) convenience functions

/**
 * Check if HDC Pattern Fingerprinting is enabled (R1, ADR-087)
 * @returns true if useHDCFingerprinting flag is set
 */
export function isHDCFingerprintingEnabled(): boolean {
  return currentFeatureFlags.useHDCFingerprinting;
}

/**
 * Check if CUSUM Drift Detection is enabled (R2, ADR-087)
 * @returns true if useCusumDriftDetection flag is set
 */
export function isCusumDriftDetectionEnabled(): boolean {
  return currentFeatureFlags.useCusumDriftDetection;
}

/**
 * Check if Delta Event Sourcing is enabled (R3, ADR-087)
 * @returns true if useDeltaEventSourcing flag is set
 */
export function isDeltaEventSourcingEnabled(): boolean {
  return currentFeatureFlags.useDeltaEventSourcing;
}

/**
 * Check if EWC++ Regularization is enabled (ADR-087)
 * @returns true if useEwcPlusPlusRegularization flag is set
 */
export function isEwcPlusPlusEnabled(): boolean {
  return currentFeatureFlags.useEwcPlusPlusRegularization;
}

// Phase 5 Milestone 2 (ADR-087) convenience functions

/**
 * Check if GraphMAE embeddings are enabled
 * @returns true if useGraphMAEEmbeddings flag is set
 */
export function isGraphMAEEnabled(): boolean {
  return currentFeatureFlags.useGraphMAEEmbeddings;
}

/**
 * Check if Hopfield memory is enabled
 * @returns true if useHopfieldMemory flag is set
 */
export function isHopfieldMemoryEnabled(): boolean {
  return currentFeatureFlags.useHopfieldMemory;
}

/**
 * Check if Cold-Tier GNN training is enabled
 * @returns true if useColdTierGNN flag is set
 */
export function isColdTierGNNEnabled(): boolean {
  return currentFeatureFlags.useColdTierGNN;
}

// Phase 5 Milestone 3 (ADR-087) convenience functions

/**
 * Check if Meta-Learning Enhancements are enabled (R7, ADR-087)
 * @returns true if useMetaLearningEnhancements flag is set
 */
export function isMetaLearningEnabled(): boolean {
  return currentFeatureFlags.useMetaLearningEnhancements;
}

/**
 * Check if Sublinear Solver is enabled (R8, ADR-087)
 * @returns true if useSublinearSolver flag is set
 */
export function isSublinearSolverEnabled(): boolean {
  return currentFeatureFlags.useSublinearSolver;
}

/**
 * Check if Spectral Sparsification is enabled (R9, ADR-087)
 * @returns true if useSpectralSparsification flag is set
 */
export function isSpectralSparsificationEnabled(): boolean {
  return currentFeatureFlags.useSpectralSparsification;
}

/**
 * Check if Reservoir Replay is enabled (R10, ADR-087)
 * @returns true if useReservoirReplay flag is set
 */
export function isReservoirReplayEnabled(): boolean {
  return currentFeatureFlags.useReservoirReplay;
}

// Phase 5 Milestone 4 (ADR-087) convenience functions

/**
 * Check if E-prop Online Learning is enabled (R11, ADR-087)
 * @returns true if useEpropOnlineLearning flag is set
 */
export function isEpropOnlineLearningEnabled(): boolean {
  return currentFeatureFlags.useEpropOnlineLearning;
}

/**
 * Check if Granger Causality is enabled (R12, ADR-087)
 * @returns true if useGrangerCausality flag is set
 */
export function isGrangerCausalityEnabled(): boolean {
  return currentFeatureFlags.useGrangerCausality;
}

// Phase 5 Milestone 5 (ADR-087) convenience functions

/**
 * Check if Cognitive Routing is enabled (R13, ADR-087)
 * @returns true if useCognitiveRouting flag is set
 */
export function isCognitiveRoutingEnabled(): boolean {
  return currentFeatureFlags.useCognitiveRouting;
}

/**
 * Check if Hyperbolic HNSW is enabled (R14, ADR-087)
 * @returns true if useHyperbolicHnsw flag is set
 */
export function isHyperbolicHnswEnabled(): boolean {
  return currentFeatureFlags.useHyperbolicHnsw;
}

// ============================================================================
// Environment Variable Support
// ============================================================================

/**
 * Initialize feature flags from environment variables
 *
 * Reads the following environment variables:
 * - RUVECTOR_USE_SONA: 'true'/'false'
 * - RUVECTOR_USE_FLASH_ATTENTION: 'true'/'false'
 * - RUVECTOR_USE_GNN_INDEX: 'true'/'false'
 * - RUVECTOR_LOG_MIGRATION_METRICS: 'true'/'false'
 *
 * @example
 * ```typescript
 * // In application startup
 * initFeatureFlagsFromEnv();
 * ```
 */
export function initFeatureFlagsFromEnv(): void {
  const envFlags: Partial<RuVectorFeatureFlags> = {};

  if (process.env.RUVECTOR_USE_SONA !== undefined) {
    envFlags.useQESONA = process.env.RUVECTOR_USE_SONA === 'true';
  }

  if (process.env.RUVECTOR_USE_FLASH_ATTENTION !== undefined) {
    envFlags.useQEFlashAttention = process.env.RUVECTOR_USE_FLASH_ATTENTION === 'true';
  }

  if (process.env.RUVECTOR_USE_GNN_INDEX !== undefined) {
    envFlags.useQEGNNIndex = process.env.RUVECTOR_USE_GNN_INDEX === 'true';
  }

  if (process.env.RUVECTOR_LOG_MIGRATION_METRICS !== undefined) {
    envFlags.logMigrationMetrics = process.env.RUVECTOR_LOG_MIGRATION_METRICS === 'true';
  }

  if (process.env.RUVECTOR_USE_NATIVE_HNSW !== undefined) {
    envFlags.useNativeHNSW = process.env.RUVECTOR_USE_NATIVE_HNSW === 'true';
  }

  if (process.env.RUVECTOR_USE_TEMPORAL_COMPRESSION !== undefined) {
    envFlags.useTemporalCompression = process.env.RUVECTOR_USE_TEMPORAL_COMPRESSION === 'true';
  }

  if (process.env.RUVECTOR_USE_METADATA_FILTERING !== undefined) {
    envFlags.useMetadataFiltering = process.env.RUVECTOR_USE_METADATA_FILTERING === 'true';
  }

  if (process.env.RUVECTOR_USE_DETERMINISTIC_DITHER !== undefined) {
    envFlags.useDeterministicDither = process.env.RUVECTOR_USE_DETERMINISTIC_DITHER === 'true';
  }

  if (process.env.RUVECTOR_USE_NEURAL_ROUTING !== undefined) {
    envFlags.useNeuralRouting = process.env.RUVECTOR_USE_NEURAL_ROUTING === 'true';
  }

  if (process.env.RUVECTOR_USE_SONA_THREE_LOOP !== undefined) {
    envFlags.useSONAThreeLoop = process.env.RUVECTOR_USE_SONA_THREE_LOOP === 'true';
  }

  if (process.env.RUVECTOR_USE_CROSS_DOMAIN_TRANSFER !== undefined) {
    envFlags.useCrossDomainTransfer = process.env.RUVECTOR_USE_CROSS_DOMAIN_TRANSFER === 'true';
  }

  if (process.env.RUVECTOR_USE_HNSW_HEALTH_MONITOR !== undefined) {
    envFlags.useHnswHealthMonitor = process.env.RUVECTOR_USE_HNSW_HEALTH_MONITOR === 'true';
  }

  if (process.env.RUVECTOR_USE_REGRET_TRACKING !== undefined) {
    envFlags.useRegretTracking = process.env.RUVECTOR_USE_REGRET_TRACKING === 'true';
  }

  if (process.env.RUVECTOR_USE_COHERENCE_GATE !== undefined) {
    envFlags.useCoherenceGate = process.env.RUVECTOR_USE_COHERENCE_GATE === 'true';
  }

  if (process.env.RUVECTOR_USE_WITNESS_CHAIN !== undefined) {
    envFlags.useWitnessChain = process.env.RUVECTOR_USE_WITNESS_CHAIN === 'true';
  }

  if (process.env.RUVECTOR_USE_CNN_VISUAL_REGRESSION !== undefined) {
    envFlags.useCNNVisualRegression = process.env.RUVECTOR_USE_CNN_VISUAL_REGRESSION === 'true';
  }

  if (process.env.RUVECTOR_USE_DAG_ATTENTION !== undefined) {
    envFlags.useDAGAttention = process.env.RUVECTOR_USE_DAG_ATTENTION === 'true';
  }

  if (process.env.RUVECTOR_USE_COHERENCE_ACTION_GATE !== undefined) {
    envFlags.useCoherenceActionGate = process.env.RUVECTOR_USE_COHERENCE_ACTION_GATE === 'true';
  }

  if (process.env.RUVECTOR_USE_REASONING_QEC !== undefined) {
    envFlags.useReasoningQEC = process.env.RUVECTOR_USE_REASONING_QEC === 'true';
  }

  // Phase 5 (ADR-087) env vars
  if (process.env.RUVECTOR_USE_HDC_FINGERPRINTING !== undefined) {
    envFlags.useHDCFingerprinting = process.env.RUVECTOR_USE_HDC_FINGERPRINTING === 'true';
  }

  if (process.env.RUVECTOR_USE_CUSUM_DRIFT_DETECTION !== undefined) {
    envFlags.useCusumDriftDetection = process.env.RUVECTOR_USE_CUSUM_DRIFT_DETECTION === 'true';
  }

  if (process.env.RUVECTOR_USE_DELTA_EVENT_SOURCING !== undefined) {
    envFlags.useDeltaEventSourcing = process.env.RUVECTOR_USE_DELTA_EVENT_SOURCING === 'true';
  }

  if (process.env.RUVECTOR_USE_EWC_PLUS_PLUS !== undefined) {
    envFlags.useEwcPlusPlusRegularization = process.env.RUVECTOR_USE_EWC_PLUS_PLUS === 'true';
  }

  // Phase 5 Milestone 3 (ADR-087) env vars
  if (process.env.RUVECTOR_USE_META_LEARNING !== undefined) {
    envFlags.useMetaLearningEnhancements = process.env.RUVECTOR_USE_META_LEARNING === 'true';
  }

  if (process.env.RUVECTOR_USE_SUBLINEAR_SOLVER !== undefined) {
    envFlags.useSublinearSolver = process.env.RUVECTOR_USE_SUBLINEAR_SOLVER === 'true';
  }

  if (process.env.RUVECTOR_USE_SPECTRAL_SPARSIFICATION !== undefined) {
    envFlags.useSpectralSparsification = process.env.RUVECTOR_USE_SPECTRAL_SPARSIFICATION === 'true';
  }

  if (process.env.RUVECTOR_USE_RESERVOIR_REPLAY !== undefined) {
    envFlags.useReservoirReplay = process.env.RUVECTOR_USE_RESERVOIR_REPLAY === 'true';
  }

  // Phase 5 Milestone 4 (ADR-087) env vars
  if (process.env.RUVECTOR_USE_EPROP_ONLINE_LEARNING !== undefined) {
    envFlags.useEpropOnlineLearning = process.env.RUVECTOR_USE_EPROP_ONLINE_LEARNING === 'true';
  }

  if (process.env.RUVECTOR_USE_GRANGER_CAUSALITY !== undefined) {
    envFlags.useGrangerCausality = process.env.RUVECTOR_USE_GRANGER_CAUSALITY === 'true';
  }

  // Phase 5 Milestone 5 (ADR-087) env vars
  if (process.env.RUVECTOR_USE_COGNITIVE_ROUTING !== undefined) {
    envFlags.useCognitiveRouting = process.env.RUVECTOR_USE_COGNITIVE_ROUTING === 'true';
  }

  if (process.env.RUVECTOR_USE_HYPERBOLIC_HNSW !== undefined) {
    envFlags.useHyperbolicHnsw = process.env.RUVECTOR_USE_HYPERBOLIC_HNSW === 'true';
  }

  setRuVectorFeatureFlags(envFlags);
}

// ============================================================================
// Export Default Flags
// ============================================================================

export { DEFAULT_FEATURE_FLAGS };
