/**
 * Agentic QE v3 - RuVector Integration
 *
 * RuVector provides ML-based code intelligence for QE.
 * This is an OPTIONAL dependency - all features work without it.
 *
 * Integration Points per ADR-017:
 * | RuVector Feature      | QE Application                    |
 * |----------------------|-----------------------------------|
 * | Q-Learning Router    | Route test tasks to optimal agents|
 * | AST Complexity       | Prioritize tests by code complexity|
 * | Diff Risk Classification | Target tests at high-risk changes |
 * | Coverage Routing     | Test coverage-aware agent selection|
 * | Graph Boundaries     | Focus integration tests at module boundaries |
 *
 * @example
 * ```typescript
 * import { createRuVectorClient, RuVectorConfig } from 'agentic-qe/integrations/ruvector';
 *
 * // Create client with optional RuVector
 * const client = await createRuVectorClient({
 *   enabled: true,  // Set to false for fallback-only mode
 *   endpoint: 'http://localhost:8080',
 *   fallbackEnabled: true,
 * });
 *
 * // All methods work with or without RuVector
 * const router = client.getQLearningRouter();
 * const result = await router.routeTask(task); // Uses ML or fallback
 * ```
 */

// ============================================================================
// Public Interfaces
// ============================================================================

export type {
  // Configuration
  RuVectorConfig,
  RuVectorHealthResult,
  RuVectorConnectionStatus,

  // Client Interface
  RuVectorClient,

  // Q-Learning Router
  QLearningRouter,
  QLearningState,
  QLearningAction,
  TestTask,
  AgentRoutingResult,

  // AST Complexity
  ASTComplexityAnalyzer,
  FileComplexityResult,
  ComplexityMetrics,

  // Diff Risk Classifier
  DiffRiskClassifier,
  RiskClassification,
  DiffContext,
  FileChange,

  // Coverage Router
  CoverageRouter,
  CoverageRoutingResult,
  FileCoverage,
  CoverageGap,

  // Graph Boundaries
  GraphBoundariesAnalyzer,
  GraphBoundariesResult,
  ModuleBoundary,
  BoundaryCrossing,
  ModuleDependency,
} from './interfaces';

// Export constants
export { DEFAULT_RUVECTOR_CONFIG } from './interfaces';

// Export errors
export {
  RuVectorError,
  RuVectorUnavailableError,
  RuVectorTimeoutError,
  RuVectorConfigError,
} from './interfaces';

// ============================================================================
// Factory Functions (Async - ML-first with observability)
// ============================================================================

export { createQLearningRouter, createQLearningRouterSync } from './q-learning-router';
export { createASTComplexityAnalyzer, createASTComplexityAnalyzerSync } from './ast-complexity';
export { createDiffRiskClassifier, createDiffRiskClassifierSync } from './diff-risk-classifier';
export { createCoverageRouter, createCoverageRouterSync } from './coverage-router';
export { createGraphBoundariesAnalyzer, createGraphBoundariesAnalyzerSync } from './graph-boundaries';
export { createFallbackComponents } from './fallback';

// Persistent Q-Learning Router (ADR-046: Q-value persistence)
export {
  createPersistentQLearningRouter,
  createPersistentQLearningRouterSync,
} from './persistent-q-router';

// Persistent SONA Engine (ADR-046: SONA pattern persistence)
export {
  createPersistentSONAEngine,
  createPersistentSONAEngineSync,
} from './sona-persistence';

// ============================================================================
// Implementation Classes (for advanced usage)
// ============================================================================

export { RuVectorQLearningRouter, type QLearningParams } from './q-learning-router';
export { RuVectorASTComplexityAnalyzer, type ComplexityThresholds } from './ast-complexity';
export { RuVectorDiffRiskClassifier, type RiskPatterns } from './diff-risk-classifier';
export { RuVectorCoverageRouter, type CoverageThresholds } from './coverage-router';
export { RuVectorGraphBoundariesAnalyzer, type GraphConfig } from './graph-boundaries';

// Persistent Q-Learning Router (ADR-046: Q-value persistence)
export {
  PersistentQLearningRouter,
  DEFAULT_EWC_CONFIG,
  DEFAULT_PERSISTENT_CONFIG,
  type EWCConfig,
  type PersistentQLearningRouterConfig,
} from './persistent-q-router';

// Persistent SONA Engine (ADR-046: SONA pattern persistence)
export {
  PersistentSONAEngine,
  DEFAULT_PERSISTENT_SONA_CONFIG,
  SONA_PATTERNS_SCHEMA,
  SONA_FISHER_SCHEMA,
  type PersistentSONAConfig,
} from './sona-persistence';

// SONA Three-Loop Engine (Task 2.2: EWC++ & MicroLoRA)
export {
  SONAThreeLoopEngine,
  MicroLoRA,
  EWCPlusPlus,
  createSONAThreeLoopEngine,
  DEFAULT_THREE_LOOP_CONFIG,
  type AdaptationResult,
  type ConsolidationResult,
  type PeerState,
  type EWCMetrics,
  type ThreeLoopConfig,
} from './sona-three-loop';

// Fallback implementations
export {
  FallbackQLearningRouter,
  FallbackASTComplexityAnalyzer,
  FallbackDiffRiskClassifier,
  FallbackCoverageRouter,
  FallbackGraphBoundariesAnalyzer,
} from './fallback';

// ============================================================================
// Client Factory
// ============================================================================

import type {
  RuVectorConfig,
  RuVectorClient,
  RuVectorHealthResult,
  QLearningRouter,
  ASTComplexityAnalyzer,
  DiffRiskClassifier,
  CoverageRouter,
  GraphBoundariesAnalyzer,
} from './interfaces';
import { DEFAULT_RUVECTOR_CONFIG, RuVectorUnavailableError } from './interfaces';
import { createQLearningRouter } from './q-learning-router';
import { createASTComplexityAnalyzer } from './ast-complexity';
import { createDiffRiskClassifier } from './diff-risk-classifier';
import { createCoverageRouter } from './coverage-router';
import { createGraphBoundariesAnalyzer } from './graph-boundaries';

/**
 * Default RuVector client implementation
 * Provides unified access to all RuVector features with ML-first approach.
 * Uses observability layer to track ML vs fallback usage and alert on issues.
 */
class DefaultRuVectorClient implements RuVectorClient {
  private readonly config: Required<RuVectorConfig>;
  private _qLearningRouter: QLearningRouter | null = null;
  private _astComplexityAnalyzer: ASTComplexityAnalyzer | null = null;
  private _diffRiskClassifier: DiffRiskClassifier | null = null;
  private _coverageRouter: CoverageRouter | null = null;
  private _graphBoundaries: GraphBoundariesAnalyzer | null = null;
  private _initialized = false;
  private _available: boolean | null = null;
  private _lastHealthCheck: RuVectorHealthResult | null = null;

  constructor(config: Partial<RuVectorConfig> = {}) {
    this.config = { ...DEFAULT_RUVECTOR_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Check RuVector availability
    this._available = await this.checkAvailability();

    // Generate a unique agent ID for this client instance
    // Use process ID and timestamp for uniqueness across sessions
    const clientAgentId = `ruvector-client-${process.pid}-${Date.now()}`;

    // Initialize components with ML-first approach
    // Each factory function tries ML first and records observability metrics
    // Q-Learning router uses direct persistence to rl_q_values table
    // (PersistentQLearningRouter is deprecated — see persistent-q-router.ts)
    const [
      qLearningRouter,
      astComplexityAnalyzer,
      diffRiskClassifier,
      coverageRouter,
      graphBoundaries,
    ] = await Promise.all([
      createQLearningRouter(this.config),
      createASTComplexityAnalyzer(this.config),
      createDiffRiskClassifier(this.config),
      createCoverageRouter(this.config),
      createGraphBoundariesAnalyzer(this.config),
    ]);

    this._qLearningRouter = qLearningRouter;
    this._astComplexityAnalyzer = astComplexityAnalyzer;
    this._diffRiskClassifier = diffRiskClassifier;
    this._coverageRouter = coverageRouter;
    this._graphBoundaries = graphBoundaries;

    this._initialized = true;
  }

  async dispose(): Promise<void> {
    this._qLearningRouter = null;
    this._astComplexityAnalyzer = null;
    this._diffRiskClassifier = null;
    this._coverageRouter = null;
    this._graphBoundaries = null;
    this._initialized = false;
    this._available = null;
  }

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    this._available = await this.checkAvailability();
    return this._available;
  }

  async getHealth(): Promise<RuVectorHealthResult> {
    const lastChecked = new Date();

    if (!this.config.enabled) {
      return {
        status: 'unavailable',
        features: ['fallback-only'],
        lastChecked,
        error: 'RuVector is disabled by configuration',
      };
    }

    try {
      const isAvailable = await this.isAvailable();

      if (isAvailable) {
        this._lastHealthCheck = {
          status: 'connected',
          version: '1.0.0', // Would come from actual RuVector
          features: [
            'q-learning-router', // Direct persistence to rl_q_values table
            'ast-complexity',
            'diff-risk-classifier',
            'coverage-router',
            'graph-boundaries',
          ],
          latencyMs: 10, // Would be measured
          lastChecked,
        };
      } else {
        this._lastHealthCheck = {
          status: 'disconnected',
          features: ['fallback-only'],
          lastChecked,
          error: 'RuVector service not reachable',
        };
      }
    } catch (error) {
      this._lastHealthCheck = {
        status: 'error',
        features: ['fallback-only'],
        lastChecked,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    return this._lastHealthCheck;
  }

  getQLearningRouter(): QLearningRouter {
    this.ensureInitialized();
    return this._qLearningRouter!;
  }

  getASTComplexityAnalyzer(): ASTComplexityAnalyzer {
    this.ensureInitialized();
    return this._astComplexityAnalyzer!;
  }

  getDiffRiskClassifier(): DiffRiskClassifier {
    this.ensureInitialized();
    return this._diffRiskClassifier!;
  }

  getCoverageRouter(): CoverageRouter {
    this.ensureInitialized();
    return this._coverageRouter!;
  }

  getGraphBoundaries(): GraphBoundariesAnalyzer {
    this.ensureInitialized();
    return this._graphBoundaries!;
  }

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new RuVectorUnavailableError(
        'RuVector client not initialized. Call initialize() first.'
      );
    }
  }

  private async checkAvailability(): Promise<boolean> {
    if (!this.config.enabled) return false;

    // In a real implementation, this would check if RuVector service is reachable
    // For now, we simulate availability based on configuration
    try {
      // Simulate availability check
      // Would actually ping this.config.endpoint
      return this.config.enabled;
    } catch {
      return false;
    }
  }
}

/**
 * Create a RuVector client with optional ML capabilities
 *
 * @example
 * ```typescript
 * // Full ML capabilities (when RuVector is available)
 * const client = await createRuVectorClient({ enabled: true });
 *
 * // Fallback-only mode (no ML, rule-based logic)
 * const fallbackClient = await createRuVectorClient({ enabled: false });
 *
 * // Both work the same way:
 * const router = client.getQLearningRouter();
 * const result = await router.routeTask(task);
 * console.log(result.usedFallback); // true if RuVector unavailable
 * ```
 */
export async function createRuVectorClient(
  config: Partial<RuVectorConfig> = {}
): Promise<RuVectorClient> {
  const client = new DefaultRuVectorClient(config);
  await client.initialize();
  return client;
}

/**
 * Create a RuVector client synchronously (must call initialize() manually)
 */
export function createRuVectorClientSync(
  config: Partial<RuVectorConfig> = {}
): RuVectorClient {
  return new DefaultRuVectorClient(config);
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Quick check if RuVector integration is available
 */
export async function isRuVectorAvailable(
  config: Partial<RuVectorConfig> = {}
): Promise<boolean> {
  if (!config.enabled && config.enabled !== undefined) return false;

  const client = await createRuVectorClient(config);
  try {
    return await client.isAvailable();
  } finally {
    await client.dispose();
  }
}

/**
 * Get RuVector status summary
 */
export async function getRuVectorStatus(
  config: Partial<RuVectorConfig> = {}
): Promise<{
  available: boolean;
  mode: 'ml' | 'fallback';
  features: string[];
}> {
  const client = await createRuVectorClient(config);
  try {
    const health = await client.getHealth();
    return {
      available: health.status === 'connected',
      mode: health.status === 'connected' ? 'ml' : 'fallback',
      features: health.features,
    };
  } finally {
    await client.dispose();
  }
}

// ============================================================================
// @ruvector Package Wrappers (SONA, Flash Attention, GNN)
// ============================================================================

// QE Wrappers for @ruvector packages
export * from './wrappers';

// ============================================================================
// Service Provider (Dependency Injection)
// ============================================================================

export {
  RuVectorServiceProvider,
  getDomainRuVectorServices,
  getRuVectorProvider,
  getRuVectorServiceAvailability,
  type RuVectorServiceConfig,
} from './provider';

// ============================================================================
// Feature Flags
// ============================================================================

export {
  getRuVectorFeatureFlags,
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
  isSONAEnabled,
  isFlashAttentionEnabled,
  isGNNIndexEnabled,
  isTemporalCompressionEnabled,
  isCrossDomainTransferEnabled,
  shouldLogMigrationMetrics,
  initFeatureFlagsFromEnv,
  // Phase 5 Milestone 1 (ADR-087)
  isHDCFingerprintingEnabled,
  isCusumDriftDetectionEnabled,
  isDeltaEventSourcingEnabled,
  isEwcPlusPlusEnabled,
  // Phase 5 Milestone 2 (ADR-087)
  isGraphMAEEnabled,
  isHopfieldMemoryEnabled,
  isColdTierGNNEnabled,
  DEFAULT_FEATURE_FLAGS,
  type RuVectorFeatureFlags,
} from './feature-flags';

// ============================================================================
// Cross-Domain Transfer Learning (ADR-084, Task 2.3)
// ============================================================================

export {
  DomainTransferEngine,
  ThompsonSampler,
  createDomainTransferEngine,
  DEFAULT_DOMAIN_TRANSFER_CONFIG,
  type TransferCandidate,
  type TransferResult,
  type TransferRecord,
  type DomainTransferConfig,
} from './domain-transfer';

export {
  TransferCoherenceStub,
  createTransferCoherenceGate,
  type ITransferCoherenceGate,
  type CoherenceValidation,
} from './transfer-coherence-stub';

export {
  TransferVerifier,
  createTransferVerifier,
  DEFAULT_VERIFICATION_CONFIG,
  type DomainPerformanceSnapshot,
  type TransferResultForVerification,
  type VerificationResult,
  type TransferVerificationConfig,
} from './transfer-verification';

// ============================================================================
// Temporal Tensor Compression (ADR-085)
// ============================================================================

export {
  TemporalCompressionService,
  getTemporalCompressionService,
  createTemporalCompressionService,
  resetTemporalCompressionService,
  cosineSimilarity,
  TIER_CONFIG,
  THEORETICAL_COMPRESSION_RATIOS,
  ACTUAL_FALLBACK_RATIO,
  EXPECTED_COMPRESSION_RATIOS,
  HOT_THRESHOLD_DAYS,
  WARM_THRESHOLD_DAYS,
  type CompressionTier,
  type CompressedVector,
  type CompressionStats,
} from './temporal-compression';

// ============================================================================
// Hypergraph Schema (Neural Backbone)
// ============================================================================

export {
  HypergraphSchemaManager,
  nodeToRow,
  rowToNode,
  edgeToRow,
  rowToEdge,
  generateEdgeId,
  NODE_TYPES,
  EDGE_TYPES,
  type HypergraphNode,
  type HypergraphEdge,
  type HypergraphNodeRow,
  type HypergraphEdgeRow,
  type NodeType,
  type EdgeType,
} from './hypergraph-schema';

// ============================================================================
// Hypergraph Query Engine (Neural Backbone - GOAP Action 6)
// ============================================================================

export {
  HypergraphEngine,
  createHypergraphEngine,
  createHypergraphEngineSync,
  DEFAULT_HYPERGRAPH_ENGINE_CONFIG,
  type HypergraphEngineConfig,
  type NodeCriteria,
  type EdgeCriteria,
  type TraversalResult,
  type ModuleDependencyResult,
  type BuildResult,
  type SyncResult,
  type HypergraphStats,
  type CodeIndexResult,
} from './hypergraph-engine';

// ============================================================================
// ML Observability
// ============================================================================

export {
  RuVectorObservability,
  getRuVectorObservability,
  recordMLUsage,
  recordFallback,
  getObservabilityReport,
  type RuVectorComponent,
  type FallbackReason,
  type ComponentMetrics,
  type MLObservabilityMetrics,
  type MLUsageAlert,
  type MLObservabilityConfig,
  type ObservabilityReport,
} from './observability';

// ============================================================================
// RuVector Server Client (GOAP Action 8)
// ============================================================================

export {
  RuVectorServerClient,
  createRuVectorServerClient,
  createRuVectorServerClientSync,
  getSharedServerClient,
  resetSharedServerClient,
  DEFAULT_SERVER_CONFIG,
  type RuVectorServerConfig,
  type ServerHealthResult,
  type VectorSearchResult,
  type ServerStats,
} from './server-client';

// ============================================================================
// RVF Native Adapter (ADR-069: Native RVF Container Integration)
// ============================================================================

export { createRvfStore, openRvfStore, isRvfNativeAvailable } from './rvf-native-adapter.js';
export type { RvfNativeAdapter, RvfSearchResult as RvfNativeSearchResult, RvfStatus as RvfNativeStatus } from './rvf-native-adapter.js';
export { RvfDualWriter, createDualWriter } from './rvf-dual-writer.js';
export type { DualWriteConfig, DualWriteResult, DivergenceReport } from './rvf-dual-writer.js';
export {
  getSharedRvfDualWriter,
  getSharedRvfDualWriterSync,
  resetSharedRvfDualWriter,
} from './shared-rvf-dual-writer.js';

// ============================================================================
// Cognitive Container Export/Import (Task 4.1: RVF v2)
// ============================================================================

export {
  CognitiveContainer,
  createCognitiveContainer,
  generateSigningKeyPair,
  type ContainerSegment,
  type ContainerManifest,
  type ExportOptions,
  type ImportOptions,
  type ImportResult,
  type VerificationResult as CognitiveContainerVerificationResult,
  type ContainerInfo,
  type Ed25519KeyPair,
} from './cognitive-container';

// ============================================================================
// Phase 5: Pattern Intelligence (ADR-087, Milestone 1)
// ============================================================================

// R1: HDC Pattern Fingerprinting
export {
  HdcFingerprinter,
  createHdcFingerprinter,
  type HdcConfig,
  type PatternFingerprint,
} from './hdc-fingerprint';

// R2: CUSUM Drift Detection
export {
  CusumDetector,
  type CusumConfig,
  type CusumResult,
  type GateType,
} from './cusum-detector';

// R3: Delta Event Sourcing
export {
  DeltaTracker,
  PATTERN_DELTAS_SCHEMA,
  type DeltaEvent,
  type DeltaTrackerConfig,
  type JsonPatch,
} from './delta-tracker';

// ============================================================================
// Phase 5: Graph Learning (ADR-087, Milestone 2)
// ============================================================================

// R4: GraphMAE Self-Supervised Learning
export {
  GraphMAEEncoder,
  createGraphMAEEncoder,
  type GraphMAEConfig,
  type QEGraph,
  type GraphMAEResult,
} from './graphmae-encoder';

// R5: Modern Hopfield Networks
export {
  HopfieldMemory,
  createHopfieldMemory,
  type HopfieldConfig,
  type StoredPattern,
  type RecallResult,
} from './hopfield-memory';

// R6: Cold-Tier GNN Training
export {
  ColdTierTrainer,
  InMemoryGraph,
  FileBackedGraph,
  createColdTierTrainer,
  type ColdTierConfig,
  type ColdTierGraph,
  type TrainingResult,
  type CacheStats,
} from './cold-tier-trainer';

// ============================================================================
// Shared Memory Integration (Fleet Integration)
// ============================================================================

export {
  initializeSharedMemory,
  getSharedServerClient as getFleetSharedClient,
  setSharedServerClient,
  isSharedMemoryAvailable,
  getSharedMemoryStatus,
  getLastInitResult,
  shutdownSharedMemory,
  resetSharedMemoryState,
  integrateWithFleet,
  DEFAULT_SHARED_MEMORY_CONFIG,
  type SharedMemoryConfig,
  type SharedMemoryResult,
  type SharedMemoryStatus,
} from './shared-memory';
