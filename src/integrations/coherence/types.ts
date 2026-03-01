/**
 * Agentic QE v3 - Coherence Service Types
 *
 * Type definitions for the Prime Radiant coherence integration.
 * Provides mathematical coherence gates using advanced mathematics:
 * - Sheaf cohomology for contradiction detection
 * - Spectral analysis for collapse prediction
 * - Causal inference for spurious correlation detection
 * - Category theory for type verification
 * - Homotopy type theory for formal verification
 * - Blake3 witness chain for audit trails
 *
 * Per ADR-052, coherence gates verify belief consistency across agents
 * before allowing execution to proceed.
 *
 * @module integrations/coherence/types
 */

import type { AgentType, DomainName, Severity, Priority } from '../../shared/types';

// ============================================================================
// Compute Lane Types
// ============================================================================

/**
 * Compute lane based on energy threshold
 *
 * | Lane | Energy Range | Latency | Action |
 * |------|--------------|---------|--------|
 * | Reflex | E < 0.1 | <1ms | Immediate execution |
 * | Retrieval | 0.1 - 0.4 | ~10ms | Fetch additional context |
 * | Heavy | 0.4 - 0.7 | ~100ms | Deep analysis |
 * | Human | E > 0.7 | Async | Queen escalation |
 */
export type ComputeLane = 'reflex' | 'retrieval' | 'heavy' | 'human';

/**
 * Compute lane configuration thresholds
 */
export interface ComputeLaneConfig {
  /** Energy threshold for reflex lane (default: 0.1) */
  reflexThreshold: number;
  /** Energy threshold for retrieval lane (default: 0.4) */
  retrievalThreshold: number;
  /** Energy threshold for heavy lane (default: 0.7) */
  heavyThreshold: number;
}

/**
 * Default compute lane configuration
 */
export const DEFAULT_LANE_CONFIG: ComputeLaneConfig = {
  reflexThreshold: 0.1,
  retrievalThreshold: 0.4,
  heavyThreshold: 0.7,
};

// ============================================================================
// Core Coherence Types
// ============================================================================

/**
 * A node in the coherence graph
 * Represents a belief, fact, or agent state
 */
export interface CoherenceNode {
  /** Unique identifier for the node */
  id: string;
  /** Vector embedding of the node's content */
  embedding: number[];
  /** Optional weight for the node (default: 1.0) */
  weight?: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * An edge connecting two nodes in the coherence graph
 */
export interface CoherenceEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Edge weight (relationship strength) */
  weight: number;
  /** Optional edge type */
  type?: 'agreement' | 'contradiction' | 'implication' | 'correlation';
}

/**
 * Result of a coherence check
 */
export interface CoherenceResult {
  /** Sheaf Laplacian energy (lower = more coherent) */
  energy: number;
  /** Whether the system is coherent (energy < threshold) */
  isCoherent: boolean;
  /** Recommended compute lane based on energy */
  lane: ComputeLane;
  /** Detected contradictions */
  contradictions: Contradiction[];
  /** Recommendations for resolving incoherence */
  recommendations: string[];
  /** Analysis duration in milliseconds */
  durationMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

/**
 * A detected contradiction between beliefs
 */
export interface Contradiction {
  /** IDs of the conflicting nodes */
  nodeIds: [string, string];
  /** Severity of the contradiction */
  severity: Severity;
  /** Description of the contradiction */
  description: string;
  /** Confidence that this is a true contradiction */
  confidence: number;
  /** Suggested resolution */
  resolution?: string;
}

// ============================================================================
// Belief Types
// ============================================================================

/**
 * A belief held by an agent or the system
 */
export interface Belief {
  /** Unique belief identifier */
  id: string;
  /** The belief statement */
  statement: string;
  /** Embedding of the belief */
  embedding: number[];
  /** Confidence in this belief (0-1) */
  confidence: number;
  /** Source of the belief */
  source: string;
  /** When the belief was acquired */
  timestamp: Date;
  /** Supporting evidence */
  evidence?: string[];
}

// ============================================================================
// Swarm State Types
// ============================================================================

/**
 * Health status of an agent
 */
export interface AgentHealth {
  /** Agent identifier */
  agentId: string;
  /** Agent type */
  agentType: AgentType;
  /** Current health score (0-1) */
  health: number;
  /** Agent's current beliefs */
  beliefs: Belief[];
  /** Last activity timestamp */
  lastActivity: Date;
  /** Error count in recent window */
  errorCount: number;
  /** Task completion rate */
  successRate: number;
}

/**
 * Current state of the swarm
 */
export interface SwarmState {
  /** All agent health states */
  agents: AgentHealth[];
  /** Total active tasks */
  activeTasks: number;
  /** Pending tasks */
  pendingTasks: number;
  /** System-wide error rate */
  errorRate: number;
  /** Resource utilization */
  utilization: number;
  /** Timestamp of this state snapshot */
  timestamp: Date;
}

/**
 * Risk of swarm collapse
 */
export interface CollapseRisk {
  /** Overall collapse risk (0-1) */
  risk: number;
  /** Fiedler value (spectral gap) */
  fiedlerValue: number;
  /** Whether collapse is predicted */
  collapseImminent: boolean;
  /** Agents at highest risk */
  weakVertices: string[];
  /** Recommended actions */
  recommendations: string[];
  /** Analysis duration in milliseconds */
  durationMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

// ============================================================================
// Causal Inference Types
// ============================================================================

/**
 * Data for causal analysis
 */
export interface CausalData {
  /** Observed values for the cause variable */
  causeValues: number[];
  /** Observed values for the effect variable */
  effectValues: number[];
  /** Optional confounding variables */
  confounders?: Record<string, number[]>;
  /** Sample size */
  sampleSize: number;
}

/**
 * Result of causal verification
 */
export interface CausalVerification {
  /** Whether causal relationship is verified */
  isCausal: boolean;
  /** Strength of causal effect (0-1) */
  effectStrength: number;
  /** Type of relationship detected */
  relationshipType: 'causal' | 'spurious' | 'reverse' | 'confounded' | 'none';
  /** Confidence in the analysis */
  confidence: number;
  /** Detected confounders */
  confounders: string[];
  /** Explanation of the analysis */
  explanation: string;
  /** Analysis duration in milliseconds */
  durationMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

// ============================================================================
// Type Verification Types
// ============================================================================

/**
 * A typed element in a pipeline
 */
export interface TypedElement {
  /** Element name */
  name: string;
  /** Input type specification */
  inputType: string;
  /** Output type specification */
  outputType: string;
  /** Optional type constraints */
  constraints?: string[];
}

/**
 * A typed pipeline for verification
 */
export interface TypedPipeline {
  /** Pipeline identifier */
  id: string;
  /** Elements in the pipeline */
  elements: TypedElement[];
  /** Expected input type */
  inputType: string;
  /** Expected output type */
  outputType: string;
}

/**
 * Result of type verification
 */
export interface TypeVerification {
  /** Whether types are consistent */
  isValid: boolean;
  /** Type mismatches found */
  mismatches: TypeMismatch[];
  /** Warning about potential issues */
  warnings: string[];
  /** Analysis duration in milliseconds */
  durationMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

/**
 * A type mismatch error
 */
export interface TypeMismatch {
  /** Location in the pipeline */
  location: string;
  /** Expected type */
  expected: string;
  /** Actual type */
  actual: string;
  /** Severity of the mismatch */
  severity: Severity;
}

// ============================================================================
// Witness Chain Types
// ============================================================================

/**
 * A decision that needs to be witnessed
 */
export interface Decision {
  /** Decision identifier */
  id: string;
  /** Type of decision */
  type: 'consensus' | 'routing' | 'generation' | 'healing' | 'escalation';
  /** Decision inputs */
  inputs: Record<string, unknown>;
  /** Decision output */
  output: unknown;
  /** Agents involved in the decision */
  agents: string[];
  /** Decision timestamp */
  timestamp: Date;
  /** Reasoning for the decision */
  reasoning?: string;
}

/**
 * A witness record for a decision
 */
export interface WitnessRecord {
  /** Unique witness ID */
  witnessId: string;
  /** Decision ID being witnessed */
  decisionId: string;
  /** Blake3 hash of the decision */
  hash: string;
  /** Previous witness in the chain */
  previousWitnessId?: string;
  /** Chain position */
  chainPosition: number;
  /** Timestamp of witnessing */
  timestamp: Date;
  /** Signature (if available) */
  signature?: string;
}

/**
 * Result of replaying from a witness
 */
export interface ReplayResult {
  /** Whether replay was successful */
  success: boolean;
  /** The replayed decision */
  decision: Decision;
  /** Whether the replay matched the original */
  matchesOriginal: boolean;
  /** Differences found (if any) */
  differences?: string[];
  /** Replay duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// Consensus Types
// ============================================================================

/**
 * A vote from an agent in a consensus
 */
export interface AgentVote {
  /** Agent ID */
  agentId: string;
  /** Agent type */
  agentType: AgentType;
  /** The verdict (what the agent voted for) */
  verdict: string | number | boolean;
  /** Confidence in the vote */
  confidence: number;
  /** Reasoning for the vote */
  reasoning?: string;
  /** Timestamp of the vote */
  timestamp: Date;
}

/**
 * Result of consensus verification
 */
export interface ConsensusResult {
  /** Whether consensus is valid */
  isValid: boolean;
  /** Confidence in the consensus */
  confidence: number;
  /** Whether this might be a false consensus */
  isFalseConsensus: boolean;
  /** Fiedler value indicating network connectivity */
  fiedlerValue: number;
  /** Collapse risk of the consensus */
  collapseRisk: number;
  /** Recommendation for next steps */
  recommendation: string;
  /** Analysis duration in milliseconds */
  durationMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

// ============================================================================
// Interface for items with embeddings
// ============================================================================

/**
 * Interface for items that have an embedding
 */
export interface HasEmbedding {
  /** Unique identifier */
  id: string;
  /** Vector embedding */
  embedding: number[];
}

// ============================================================================
// Coherence Service Configuration
// ============================================================================

/**
 * Configuration for the Coherence Service
 */
export interface CoherenceServiceConfig {
  /** Whether coherence checking is enabled */
  enabled: boolean;
  /** Compute lane configuration */
  laneConfig: ComputeLaneConfig;
  /** Default coherence threshold */
  coherenceThreshold: number;
  /** Whether to use fallback when WASM unavailable */
  fallbackEnabled: boolean;
  /** Timeout for coherence operations in milliseconds */
  timeoutMs: number;
  /** Whether to cache coherence results */
  cacheEnabled: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
}

/**
 * Default coherence service configuration
 */
export const DEFAULT_COHERENCE_CONFIG: CoherenceServiceConfig = {
  enabled: true,
  laneConfig: DEFAULT_LANE_CONFIG,
  coherenceThreshold: 0.1,
  fallbackEnabled: true,
  timeoutMs: 5000,
  cacheEnabled: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// Coherence Statistics
// ============================================================================

/**
 * Statistics for the coherence service
 */
export interface CoherenceStats {
  /** Total coherence checks performed */
  totalChecks: number;
  /** Number of coherent results */
  coherentCount: number;
  /** Number of incoherent results */
  incoherentCount: number;
  /** Average energy value */
  averageEnergy: number;
  /** Average check duration in milliseconds */
  averageDurationMs: number;
  /** Total contradictions detected */
  totalContradictions: number;
  /** Distribution across compute lanes */
  laneDistribution: Record<ComputeLane, number>;
  /** Fallback usage count */
  fallbackCount: number;
  /** WASM availability */
  wasmAvailable: boolean;
  /** Last check timestamp */
  lastCheckAt?: Date;
}

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Logger interface for coherence operations
 */
export interface CoherenceLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Default no-op logger
 */
export const DEFAULT_COHERENCE_LOGGER: CoherenceLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ============================================================================
// WASM Loader Interface
// ============================================================================

/**
 * Interface for the WASM module loader
 * This is injected to allow testing and different loading strategies
 */
export interface IWasmLoader {
  /** Check if WASM is available */
  isAvailable(): Promise<boolean>;
  /** Load and initialize the WASM module */
  load(): Promise<WasmModule>;
  /** Get the loaded module (throws if not loaded) */
  getModule(): WasmModule;
}

/**
 * The loaded WASM module interface
 * Matches the prime-radiant-advanced-wasm package API
 */
export interface WasmModule {
  /** Sheaf cohomology engine for contradiction detection */
  CohomologyEngine: new () => IRawCohomologyEngine;
  /** Spectral analysis engine for collapse prediction */
  SpectralEngine: SpectralEngineConstructor;
  /** Causal inference engine */
  CausalEngine: new () => IRawCausalEngine;
  /** Category theory engine for type verification */
  CategoryEngine: new () => IRawCategoryEngine;
  /** Homotopy Type Theory engine for formal verification */
  HoTTEngine: HoTTEngineConstructor;
  /** Quantum/topological analysis engine */
  QuantumEngine: new () => IRawQuantumEngine;
  /** Get library version */
  getVersion: () => string;
  /** Initialize the module */
  initModule: () => void;
}

/**
 * Constructor for SpectralEngine with static factory method
 */
export interface SpectralEngineConstructor {
  new (): IRawSpectralEngine;
  /** Create with custom configuration */
  withConfig(numEigenvalues: number, tolerance: number, maxIterations: number): IRawSpectralEngine;
}

/**
 * Constructor for HoTTEngine with static factory method
 */
export interface HoTTEngineConstructor {
  new (): IRawHoTTEngine;
  /** Create with strict mode */
  withStrictMode(strict: boolean): IRawHoTTEngine;
}

/**
 * All available raw WASM engines after initialization
 * These use the actual prime-radiant-advanced-wasm API (camelCase)
 */
export interface RawCoherenceEngines {
  /** Sheaf cohomology computation engine */
  cohomology: IRawCohomologyEngine;
  /** Spectral analysis engine */
  spectral: IRawSpectralEngine;
  /** Causal inference engine */
  causal: IRawCausalEngine;
  /** Category theory engine */
  category: IRawCategoryEngine;
  /** Homotopy type theory engine */
  hott: IRawHoTTEngine;
  /** Quantum/topological analysis engine */
  quantum: IRawQuantumEngine;
}

/**
 * All available coherence engines after initialization (adapter interface)
 * @deprecated Use RawCoherenceEngines for direct WASM access
 */
export interface CoherenceEngines {
  /** Sheaf cohomology computation engine */
  cohomology: ICohomologyEngine;
  /** Spectral analysis engine */
  spectral: ISpectralEngine;
  /** Causal inference engine */
  causal: ICausalEngine;
  /** Category theory engine */
  category: ICategoryEngine;
  /** Homotopy type theory engine */
  hott: IHomotopyEngine;
  /** Witness engine for audit trails */
  witness: IWitnessEngine;
}

// ============================================================================
// Engine Interfaces (expected interface for adapters)
// ============================================================================

/**
 * Cohomology engine for contradiction detection
 * This is the interface expected by adapters (snake_case)
 */
export interface ICohomologyEngine {
  add_node(id: string, embedding: Float64Array): void;
  add_edge(source: string, target: string, weight: number): void;
  remove_node(id: string): void;
  remove_edge(source: string, target: string): void;
  sheaf_laplacian_energy(): number;
  detect_contradictions(threshold: number): ContradictionRaw[];
  clear(): void;
}

/**
 * Spectral engine for collapse prediction
 * This is the interface expected by adapters (snake_case)
 */
export interface ISpectralEngine {
  add_node(id: string): void;
  add_edge(source: string, target: string, weight: number): void;
  remove_node(id: string): void;
  compute_fiedler_value(): number;
  predict_collapse_risk(): number;
  get_weak_vertices(count: number): string[];
  clear(): void;
}

/**
 * Causal engine for spurious correlation detection
 * This is the interface expected by adapters (snake_case)
 */
export interface ICausalEngine {
  set_data(cause: Float64Array, effect: Float64Array): void;
  add_confounder(name: string, values: Float64Array): void;
  compute_causal_effect(): number;
  detect_spurious_correlation(): boolean;
  get_confounders(): string[];
  clear(): void;
}

/**
 * Category engine for type verification
 * This is the interface expected by adapters (snake_case)
 */
export interface ICategoryEngine {
  add_type(name: string, schema: string): void;
  add_morphism(source: string, target: string, name: string): void;
  verify_composition(path: string[]): boolean;
  check_type_consistency(): TypeMismatchRaw[];
  clear(): void;
}

/**
 * Homotopy engine for formal verification
 * This is the interface expected by adapters (snake_case)
 */
export interface IHomotopyEngine {
  add_proposition(id: string, formula: string): void;
  add_proof(propositionId: string, proof: string): boolean;
  verify_path_equivalence(path1: string[], path2: string[]): boolean;
  get_unproven_propositions(): string[];
  clear(): void;
}

/**
 * Witness engine for audit trails (Blake3)
 * This is the interface expected by adapters (snake_case)
 */
export interface IWitnessEngine {
  create_witness(data: Uint8Array, previousHash?: string): WitnessRaw;
  verify_witness(data: Uint8Array, hash: string): boolean;
  verify_chain(witnesses: WitnessRaw[]): boolean;
  get_chain_length(): number;
}

// ============================================================================
// Raw WASM Engine Interfaces (actual prime-radiant-advanced-wasm API)
// ============================================================================

/**
 * Raw CohomologyEngine from prime-radiant-advanced-wasm (camelCase)
 */
export interface IRawCohomologyEngine {
  /** Compute cohomology groups of a sheaf graph */
  computeCohomology(graph: unknown): unknown;
  /** Compute global sections (H^0) */
  computeGlobalSections(graph: unknown): unknown;
  /** Compute consistency energy (0 = coherent, 1 = incoherent) */
  consistencyEnergy(graph: unknown): number;
  /** Detect all obstructions to global consistency */
  detectObstructions(graph: unknown): unknown;
  /** Free WASM memory */
  free(): void;
}

/**
 * Raw SpectralEngine from prime-radiant-advanced-wasm (camelCase)
 */
export interface IRawSpectralEngine {
  /** Compute algebraic connectivity (Fiedler value) */
  algebraicConnectivity(graph: unknown): number;
  /** Compute Cheeger bounds for expansion */
  computeCheegerBounds(graph: unknown): unknown;
  /** Compute eigenvalues of the graph Laplacian */
  computeEigenvalues(graph: unknown): unknown;
  /** Compute Fiedler vector for spectral partitioning */
  computeFiedlerVector(graph: unknown): unknown;
  /** Compute spectral gap */
  computeSpectralGap(graph: unknown): unknown;
  /** Predict minimum cut in the graph */
  predictMinCut(graph: unknown): unknown;
  /** Free WASM memory */
  free(): void;
}

/**
 * Raw CausalEngine from prime-radiant-advanced-wasm (camelCase)
 */
export interface IRawCausalEngine {
  /** Check d-separation between two variables */
  checkDSeparation(model: unknown, x: string, y: string, conditioning: unknown): unknown;
  /** Compute causal effect via do-operator */
  computeCausalEffect(model: unknown, treatment: string, outcome: string, value: number): unknown;
  /** Find all confounders between treatment and outcome */
  findConfounders(model: unknown, treatment: string, outcome: string): unknown;
  /** Check if model is a valid DAG */
  isValidDag(model: unknown): boolean;
  /** Get topological order of variables */
  topologicalOrder(model: unknown): unknown;
  /** Free WASM memory */
  free(): void;
}

/**
 * Raw CategoryEngine from prime-radiant-advanced-wasm (camelCase)
 */
export interface IRawCategoryEngine {
  /** Apply morphism to an object */
  applyMorphism(morphism: unknown, data: unknown): unknown;
  /** Compose two morphisms */
  composeMorphisms(f: unknown, g: unknown): unknown;
  /** Functorial retrieval: find similar objects */
  functorialRetrieve(category: unknown, query: unknown, k: number): unknown;
  /** Verify categorical laws (identity, associativity) */
  verifyCategoryLaws(category: unknown): boolean;
  /** Check if functor preserves composition */
  verifyFunctoriality(functor: unknown, sourceCat: unknown): boolean;
  /** Free WASM memory */
  free(): void;
}

/**
 * Raw HoTTEngine from prime-radiant-advanced-wasm (camelCase)
 */
export interface IRawHoTTEngine {
  /** Check type equivalence (univalence-related) */
  checkTypeEquivalence(type1: unknown, type2: unknown): boolean;
  /** Compose two paths */
  composePaths(path1: unknown, path2: unknown): unknown;
  /** Create reflexivity path */
  createReflPath(type: unknown, point: unknown): unknown;
  /** Infer type of a term */
  inferType(term: unknown): unknown;
  /** Invert a path */
  invertPath(path: unknown): unknown;
  /** Type check a term against expected type */
  typeCheck(term: unknown, expectedType: unknown): unknown;
  /** Free WASM memory */
  free(): void;
}

/**
 * Raw QuantumEngine from prime-radiant-advanced-wasm (camelCase)
 */
export interface IRawQuantumEngine {
  /** Apply quantum gate to state */
  applyGate(state: unknown, gate: unknown, targetQubit: number): unknown;
  /** Compute entanglement entropy of a subsystem */
  computeEntanglementEntropy(state: unknown, subsystemSize: number): number;
  /** Compute fidelity between two quantum states */
  computeFidelity(state1: unknown, state2: unknown): unknown;
  /** Compute topological invariants of a simplicial complex */
  computeTopologicalInvariants(simplices: unknown): unknown;
  /** Create a GHZ (Greenberger-Horne-Zeilinger) state */
  createGHZState(numQubits: number): unknown;
  /** Create a W state */
  createWState(numQubits: number): unknown;
  /** Free WASM memory */
  free(): void;
}

// ============================================================================
// Raw WASM Types (before transformation)
// ============================================================================

/**
 * Raw contradiction from WASM
 */
export interface ContradictionRaw {
  node1: string;
  node2: string;
  severity: number;
  distance: number;
}

/**
 * Raw type mismatch from WASM
 */
export interface TypeMismatchRaw {
  location: string;
  expected: string;
  actual: string;
}

/**
 * Raw witness from WASM
 */
export interface WitnessRaw {
  hash: string;
  previousHash?: string;
  position: number;
  timestamp: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error for coherence operations
 */
export class CoherenceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CoherenceError';
  }
}

/**
 * Error when WASM is not available
 */
export class WasmNotLoadedError extends CoherenceError {
  constructor(message: string = 'WASM module is not loaded', cause?: Error) {
    super(message, 'WASM_NOT_LOADED', cause);
    this.name = 'WasmNotLoadedError';
  }
}

/**
 * Error when coherence check fails
 */
export class CoherenceCheckError extends CoherenceError {
  constructor(message: string, cause?: Error) {
    super(message, 'COHERENCE_CHECK_ERROR', cause);
    this.name = 'CoherenceCheckError';
  }
}

/**
 * Error when operation times out
 */
export class CoherenceTimeoutError extends CoherenceError {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number
  ) {
    super(`Coherence operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT');
    this.name = 'CoherenceTimeoutError';
  }
}

/**
 * Error when there are unresolvable contradictions
 */
export class UnresolvableContradictionError extends CoherenceError {
  constructor(
    public readonly contradictions: Contradiction[]
  ) {
    super(
      `Found ${contradictions.length} unresolvable contradiction(s)`,
      'UNRESOLVABLE_CONTRADICTION'
    );
    this.name = 'UnresolvableContradictionError';
  }
}

/**
 * Error when WASM loading fails after all retries
 */
export class WasmLoadError extends CoherenceError {
  constructor(
    message: string,
    public readonly attempts: number,
    cause?: Error
  ) {
    super(message, 'WASM_LOAD_FAILED', cause);
    this.name = 'WasmLoadError';
  }
}

// ============================================================================
// WASM Loader Event Types
// ============================================================================

/**
 * Events emitted by the WASM loader
 * ADR-052 A4.3: Added 'degraded_mode' and 'recovered' events
 */
export type WasmLoaderEvent = 'loaded' | 'error' | 'retry' | 'degraded_mode' | 'recovered';

/**
 * Event data for each loader event type
 */
export interface WasmLoaderEventData {
  /** Emitted when WASM module is successfully loaded */
  loaded: {
    /** WASM library version */
    version: string;
    /** Time taken to load in milliseconds */
    loadTimeMs: number;
  };
  /** Emitted when an error occurs */
  error: {
    /** The error that occurred */
    error: Error;
    /** Whether this error is fatal (no more retries) */
    fatal: boolean;
    /** Number of attempts made */
    attempt: number;
  };
  /** Emitted before a retry attempt */
  retry: {
    /** Current attempt number (1-based) */
    attempt: number;
    /** Maximum number of attempts */
    maxAttempts: number;
    /** Delay before this retry in milliseconds */
    delayMs: number;
    /** The error from the previous attempt */
    previousError: Error;
  };
  /**
   * ADR-052 A4.3: Emitted when fallback mode is activated
   * This event is published to the EventBus for system-wide notification
   */
  degraded_mode: {
    /** Reason for entering degraded mode */
    reason: string;
    /** Number of retry attempts made */
    retryCount: number;
    /** Last error that triggered fallback */
    lastError?: string;
    /** Timestamp when degraded mode was activated */
    activatedAt: Date;
    /** Scheduled time for next WASM load retry */
    nextRetryAt?: Date;
  };
  /**
   * ADR-052 A4.3: Emitted when WASM is recovered after degraded mode
   */
  recovered: {
    /** Duration spent in degraded mode in milliseconds */
    degradedDurationMs: number;
    /** Number of retry attempts before recovery */
    retryCount: number;
    /** WASM version after recovery */
    version: string;
  };
}

/**
 * Event listener function type for WASM loader events
 */
export type WasmLoaderEventListener<E extends WasmLoaderEvent> = (
  data: WasmLoaderEventData[E]
) => void;

/**
 * Configuration for the WASM loader
 */
export interface WasmLoaderConfig {
  /** Maximum number of load attempts (default: 3) */
  maxAttempts: number;
  /** Base delay for exponential backoff in ms (default: 100) */
  baseDelayMs: number;
  /** Maximum delay cap in ms (default: 5000) */
  maxDelayMs: number;
  /** Timeout for each load attempt in ms (default: 10000) */
  timeoutMs: number;
}

/**
 * Default WASM loader configuration
 */
export const DEFAULT_WASM_LOADER_CONFIG: WasmLoaderConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  timeoutMs: 10000,
};

// ============================================================================
// Fallback Result Types (ADR-052 A4.3)
// ============================================================================

/**
 * Result from fallback operation when WASM is unavailable
 * Per ADR-052 A4.3: Full WASM Fallback Handler
 */
export interface FallbackResult {
  /** Whether fallback logic was used instead of WASM */
  usedFallback: boolean;
  /** Confidence in the result (0.5 for fallback, higher for WASM) */
  confidence: number;
  /** Number of retry attempts made before fallback */
  retryCount: number;
  /** Last error that triggered fallback (if any) */
  lastError?: string;
  /** Timestamp when fallback was activated */
  activatedAt?: Date;
}

/**
 * Default fallback result for degraded mode
 */
export const DEFAULT_FALLBACK_RESULT: FallbackResult = {
  usedFallback: true,
  confidence: 0.5,
  retryCount: 0,
  activatedAt: undefined,
};

/**
 * State of the WASM fallback system
 */
export interface FallbackState {
  /** Current mode of operation */
  mode: 'wasm' | 'fallback' | 'recovering';
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Next scheduled retry timestamp */
  nextRetryAt?: Date;
  /** Total fallback activations since startup */
  totalActivations: number;
  /** Last successful WASM load timestamp */
  lastSuccessfulLoad?: Date;
}
