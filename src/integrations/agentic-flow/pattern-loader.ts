/**
 * Agentic QE v3 - Pattern Loader
 *
 * Loads JSON patterns from assets/patterns/ directory and provides
 * typed access to pattern data for Agent Booster, Model Router, ONNX Embeddings,
 * and ReasoningBank integrations.
 *
 * This singleton lazy-loads patterns on first access and provides methods
 * to retrieve patterns by category.
 *
 * @module integrations/agentic-flow/pattern-loader
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toErrorMessage } from '../../shared/error-utils.js';
import { safeJsonParse } from '../../shared/safe-json.js';

// ============================================================================
// Pattern Type Definitions
// ============================================================================

/**
 * Performance metrics for a pattern
 */
export interface PatternPerformanceMetrics {
  readonly [key: string]: unknown;
}

/**
 * Base pattern structure
 */
export interface BasePattern {
  /** Unique key for this pattern */
  readonly key: string;
  /** Human-readable pattern name */
  readonly pattern: string;
  /** Detailed description */
  readonly description: string;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Last update timestamp */
  readonly lastUpdated: string;
}

// ============================================================================
// Booster Pattern Types
// ============================================================================

/**
 * Eligibility criteria for booster transforms
 */
export interface BoosterEligibilityCriteria {
  readonly simple_transforms: string[];
  readonly wasm_compatible: string;
  readonly fallback_strategy: string;
}

/**
 * Agent Booster transform eligibility pattern
 */
export interface BoosterTransformEligibilityPattern extends BasePattern {
  readonly key: 'booster-transform-eligibility';
  readonly eligibility_criteria: BoosterEligibilityCriteria;
  readonly performance_metrics: {
    readonly wasm_speedup: string;
    readonly latency: string;
    readonly cost: string;
  };
  readonly integration_points: string[];
}

/**
 * Batch optimization strategy
 */
export interface BoosterBatchStrategy {
  readonly grouping: string;
  readonly parallel_execution: string;
  readonly result_aggregation: string;
}

/**
 * Agent Booster batch optimization pattern
 */
export interface BoosterBatchOptimizationPattern extends BasePattern {
  readonly key: 'booster-batch-optimization';
  readonly batch_strategy: BoosterBatchStrategy;
  readonly optimization_techniques: string[];
  readonly performance_gains: {
    readonly single_transform: string;
    readonly batch_of_100: string;
    readonly throughput: string;
  };
  readonly error_handling: string;
}

/**
 * WASM fallback implementation details
 */
export interface BoosterFallbackImplementation {
  readonly detection: string;
  readonly pure_typescript_implementation: string;
  readonly api_compatibility: string;
  readonly performance_graceful_degradation: string;
}

/**
 * Agent Booster WASM fallback pattern
 */
export interface BoosterWasmFallbackPattern extends BasePattern {
  readonly key: 'booster-wasm-fallback';
  readonly fallback_triggers: string[];
  readonly implementation: BoosterFallbackImplementation;
  readonly testing_strategy: string[];
}

/**
 * All booster pattern types
 */
export type BoosterPattern =
  | BoosterTransformEligibilityPattern
  | BoosterBatchOptimizationPattern
  | BoosterWasmFallbackPattern;

/**
 * Booster patterns file structure
 */
export interface BoosterPatternsFile {
  readonly namespace: string;
  readonly description: string;
  readonly created: string;
  readonly patterns: BoosterPattern[];
}

// ============================================================================
// Router Pattern Types
// ============================================================================

/**
 * Tier definition in router patterns
 */
export interface RouterTierDefinition {
  readonly cost: string;
  readonly latency: string;
  readonly use_case: string;
  readonly eligibility?: string;
  readonly complexity_score?: string;
}

/**
 * 5-tier complexity scoring pattern
 */
export interface Router5TierComplexityPattern extends BasePattern {
  readonly key: 'router-5tier-complexity';
  readonly tier_hierarchy: {
    readonly tier_1_booster: RouterTierDefinition;
    readonly tier_2_haiku: RouterTierDefinition;
    readonly tier_3_sonnet: RouterTierDefinition;
    readonly tier_4_opus: RouterTierDefinition;
    readonly tier_5_human: RouterTierDefinition;
  };
  readonly scoring_factors: string[];
  readonly auto_downgrade: string;
}

/**
 * Budget constraints configuration
 */
export interface RouterBudgetConstraints {
  readonly max_tokens_per_task: string;
  readonly max_cost_per_task: string;
  readonly max_latency_ms: string;
}

/**
 * Auto-downgrade logic steps
 */
export interface RouterAutoDowngradeLogic {
  readonly step_1: string;
  readonly step_2: string;
  readonly step_3: string;
  readonly step_4: string;
  readonly step_5: string;
}

/**
 * Budget tracking configuration
 */
export interface RouterBudgetTracking {
  readonly per_task: string;
  readonly per_session: string;
  readonly per_day: string;
  readonly alerts: string;
}

/**
 * Router budget enforcement pattern
 */
export interface RouterBudgetEnforcementPattern extends BasePattern {
  readonly key: 'router-budget-enforcement';
  readonly budget_constraints: RouterBudgetConstraints;
  readonly auto_downgrade_logic: RouterAutoDowngradeLogic;
  readonly budget_tracking: RouterBudgetTracking;
  readonly recovery_strategies: string[];
}

/**
 * Router to booster integration flow
 */
export interface RouterBoosterIntegrationFlow {
  readonly step_1_receive_task: string;
  readonly step_2_classify: string;
  readonly step_3_check_booster: string;
  readonly step_4_route: string;
  readonly step_5_execute: string;
  readonly step_6_report: string;
}

/**
 * Eligibility handshake configuration
 */
export interface RouterEligibilityHandshake {
  readonly booster_can_handle: string;
  readonly transform_type: string;
  readonly fallback_model: string;
}

/**
 * Metrics collection configuration
 */
export interface RouterMetricsCollection {
  readonly booster_execution: string;
  readonly model_tier_usage: string;
  readonly cost_savings: string;
  readonly quality_correlation: string;
}

/**
 * Router to booster integration pattern
 */
export interface RouterBoosterIntegrationPattern extends BasePattern {
  readonly key: 'router-booster-integration';
  readonly integration_flow: RouterBoosterIntegrationFlow;
  readonly eligibility_handshake: RouterEligibilityHandshake;
  readonly metrics_collection: RouterMetricsCollection;
  readonly feedback_loop: string;
}

/**
 * All router pattern types
 */
export type RouterPattern =
  | Router5TierComplexityPattern
  | RouterBudgetEnforcementPattern
  | RouterBoosterIntegrationPattern;

/**
 * Router patterns file structure
 */
export interface RouterPatternsFile {
  readonly namespace: string;
  readonly description: string;
  readonly created: string;
  readonly patterns: RouterPattern[];
}

// ============================================================================
// Embedding Pattern Types
// ============================================================================

/**
 * Generation process configuration
 */
export interface EmbeddingGenerationProcess {
  readonly tokenization: string;
  readonly forward_pass: string;
  readonly pooling: string;
  readonly normalization: string;
}

/**
 * Performance characteristics for embeddings
 */
export interface EmbeddingPerformanceCharacteristics {
  readonly latency_per_text: string;
  readonly throughput: string;
  readonly memory_footprint: string;
  readonly cpu_intensive: string;
}

/**
 * Quality metrics for embeddings
 */
export interface EmbeddingQualityMetrics {
  readonly semantic_accuracy: string;
  readonly dimensionality: string;
  readonly normalized: string;
}

/**
 * Local ONNX embeddings generation pattern
 */
export interface EmbeddingLocalGenerationPattern extends BasePattern {
  readonly key: 'embeddings-local-generation';
  readonly models_supported: string[];
  readonly generation_process: EmbeddingGenerationProcess;
  readonly performance_characteristics: EmbeddingPerformanceCharacteristics;
  readonly quality_metrics: EmbeddingQualityMetrics;
}

/**
 * Cache architecture configuration
 */
export interface EmbeddingCacheArchitecture {
  readonly cache_type: string;
  readonly default_size: string;
  readonly configurable: string;
}

/**
 * Cache key strategy
 */
export interface EmbeddingCacheKeyStrategy {
  readonly primary_key: string;
  readonly collision_rate: string;
  readonly metadata: string;
}

/**
 * Eviction policy configuration
 */
export interface EmbeddingEvictionPolicy {
  readonly least_recently_used: string;
  readonly time_to_live: string;
  readonly size_limit: string;
}

/**
 * Hit ratio expectations
 */
export interface EmbeddingHitRatioExpectations {
  readonly typical_workload: string;
  readonly repeated_queries: string;
  readonly cold_start: string;
}

/**
 * LRU cache pattern for embeddings
 */
export interface EmbeddingLRUCachePattern extends BasePattern {
  readonly key: 'embeddings-lru-cache';
  readonly cache_architecture: EmbeddingCacheArchitecture;
  readonly cache_key_strategy: EmbeddingCacheKeyStrategy;
  readonly eviction_policy: EmbeddingEvictionPolicy;
  readonly hit_ratio_expectations: EmbeddingHitRatioExpectations;
  readonly optimization_techniques: string[];
  readonly memory_efficiency: string;
}

/**
 * Hyperbolic geometry configuration
 */
export interface EmbeddingHyperbolicGeometry {
  readonly model: string;
  readonly curvature: string;
  readonly distance_metric: string;
  readonly property: string;
}

/**
 * Conversion process for hyperbolic embeddings
 */
export interface EmbeddingConversionProcess {
  readonly euclidean_to_hyperbolic: string;
  readonly poincare_projection: string;
  readonly bidirectional: string;
}

/**
 * Distance computation configuration
 */
export interface EmbeddingDistanceComputation {
  readonly poincare_distance: string;
  readonly advantages: string;
  readonly computational_cost: string;
}

/**
 * Similarity metrics for hyperbolic space
 */
export interface EmbeddingSimilarityMetricsConfig {
  readonly poincare: string;
  readonly euclidean: string;
  readonly mixed: string;
}

/**
 * Hyperbolic space pattern for embeddings
 */
export interface EmbeddingHyperbolicSpacePattern extends BasePattern {
  readonly key: 'embeddings-hyperbolic-space';
  readonly hyperbolic_geometry: EmbeddingHyperbolicGeometry;
  readonly use_cases: string[];
  readonly conversion_process: EmbeddingConversionProcess;
  readonly distance_computation: EmbeddingDistanceComputation;
  readonly similarity_metrics: EmbeddingSimilarityMetricsConfig;
  readonly memory_efficiency: string;
}

/**
 * Metric definition
 */
export interface EmbeddingMetricDefinition {
  readonly formula: string;
  readonly range: string;
  readonly best_for: string;
  readonly computational_complexity: string;
  readonly use_case: string;
}

/**
 * Metrics overview
 */
export interface EmbeddingMetricsOverview {
  readonly cosine_similarity: EmbeddingMetricDefinition;
  readonly euclidean_distance: EmbeddingMetricDefinition;
  readonly poincare_distance: EmbeddingMetricDefinition;
}

/**
 * Selection strategy
 */
export interface EmbeddingSelectionStrategy {
  readonly step_1: string;
  readonly step_2: string;
  readonly step_3: string;
  readonly step_4: string;
}

/**
 * Threshold tuning configuration
 */
export interface EmbeddingThresholdTuning {
  readonly cosine: string;
  readonly euclidean: string;
  readonly poincare: string;
}

/**
 * Similarity metrics pattern
 */
export interface EmbeddingSimilarityMetricsPattern extends BasePattern {
  readonly key: 'embeddings-similarity-metrics';
  readonly metrics_overview: EmbeddingMetricsOverview;
  readonly selection_strategy: EmbeddingSelectionStrategy;
  readonly threshold_tuning: EmbeddingThresholdTuning;
  readonly hybrid_approach: string;
}

/**
 * All embedding pattern types
 */
export type EmbeddingPattern =
  | EmbeddingLocalGenerationPattern
  | EmbeddingLRUCachePattern
  | EmbeddingHyperbolicSpacePattern
  | EmbeddingSimilarityMetricsPattern;

/**
 * Embedding patterns file structure
 */
export interface EmbeddingPatternsFile {
  readonly namespace: string;
  readonly description: string;
  readonly created: string;
  readonly patterns: EmbeddingPattern[];
}

// ============================================================================
// Reasoning Pattern Types
// ============================================================================

/**
 * Step in a trajectory
 */
export interface ReasoningTrajectoryStep {
  readonly step_number: number;
  readonly action: string;
  readonly result: string;
  readonly quality: number;
}

/**
 * Trajectory structure
 */
export interface ReasoningTrajectoryStructure {
  readonly trajectory_id: string;
  readonly task_description: string;
  readonly steps: ReasoningTrajectoryStep[];
  readonly final_outcome: string;
  readonly completion_time: string;
}

/**
 * Tracking mechanism configuration
 */
export interface ReasoningTrackingMechanism {
  readonly event_capture: string;
  readonly context_preservation: string;
  readonly outcome_recording: string;
  readonly metadata_annotation: string;
}

/**
 * Learning extraction configuration
 */
export interface ReasoningLearningExtraction {
  readonly success_patterns: string;
  readonly failure_analysis: string;
  readonly performance_correlation: string;
  readonly decision_confidence: string;
}

/**
 * Trajectory replay configuration
 */
export interface ReasoningTrajectoryReplay {
  readonly similar_task_detection: string;
  readonly experience_adaptation: string;
  readonly outcome_prediction: string;
  readonly strategy_transfer: string;
}

/**
 * Trajectory tracking pattern
 */
export interface ReasoningTrajectoryTrackingPattern extends BasePattern {
  readonly key: 'reasoning-trajectory-tracking';
  readonly trajectory_structure: ReasoningTrajectoryStructure;
  readonly tracking_mechanism: ReasoningTrackingMechanism;
  readonly learning_extraction: ReasoningLearningExtraction;
  readonly trajectory_replay: ReasoningTrajectoryReplay;
}

/**
 * Quality criteria configuration
 */
export interface ReasoningQualityCriteria {
  readonly success_rate: string;
  readonly outcome_consistency: string;
  readonly generalizability: string;
  readonly edge_case_coverage: string;
  readonly documentation: string;
}

/**
 * Quality scoring dimensions
 */
export interface ReasoningQualityScoring {
  readonly dimension_1_accuracy: string;
  readonly dimension_2_robustness: string;
  readonly dimension_3_efficiency: string;
  readonly dimension_4_clarity: string;
  readonly composite_score: string;
}

/**
 * Gate thresholds configuration
 */
export interface ReasoningGateThresholds {
  readonly bronze_tier: string;
  readonly silver_tier: string;
  readonly gold_tier: string;
  readonly platinum_tier: string;
}

/**
 * Pattern quality gates pattern
 */
export interface ReasoningPatternQualityGatesPattern extends BasePattern {
  readonly key: 'reasoning-pattern-quality-gates';
  readonly quality_criteria: ReasoningQualityCriteria;
  readonly quality_scoring: ReasoningQualityScoring;
  readonly gate_thresholds: ReasoningGateThresholds;
  readonly pattern_validation: string[];
  readonly rejection_reasons: string[];
}

/**
 * Replay mechanism configuration
 */
export interface ReasoningReplayMechanism {
  readonly sample_trajectory: string;
  readonly extract_experience: string;
  readonly analyze_decision: string;
  readonly reinforce_pattern: string;
  readonly prevent_forgetting: string;
}

/**
 * Buffer management configuration
 */
export interface ReasoningBufferManagement {
  readonly trajectory_buffer_size: string;
  readonly prioritized_sampling: string;
  readonly diversity_sampling: string;
  readonly staleness_threshold: string;
  readonly checkpointing: string;
}

/**
 * Learning integration configuration
 */
export interface ReasoningLearningIntegration {
  readonly offline_replay: string;
  readonly online_replay: string;
  readonly consolidation: string;
  readonly transfer_learning: string;
}

/**
 * Metrics tracking for experience replay
 */
export interface ReasoningMetricsTracking {
  readonly replay_frequency: string;
  readonly learning_gain: string;
  readonly forgetting_rate: string;
  readonly transfer_success: string;
}

/**
 * Experience replay pattern
 */
export interface ReasoningExperienceReplayPattern extends BasePattern {
  readonly key: 'reasoning-experience-replay';
  readonly replay_mechanism: ReasoningReplayMechanism;
  readonly buffer_management: ReasoningBufferManagement;
  readonly learning_integration: ReasoningLearningIntegration;
  readonly metrics_tracking: ReasoningMetricsTracking;
  readonly scaling_strategy: string;
}

/**
 * Sharing channels configuration
 */
export interface ReasoningSharingChannels {
  readonly pattern_broadcast: string;
  readonly trajectory_publishing: string;
  readonly failure_alerts: string;
  readonly performance_updates: string;
}

/**
 * Knowledge transfer configuration
 */
export interface ReasoningKnowledgeTransfer {
  readonly sender_agent: string;
  readonly quality_assessment: string;
  readonly packaging: string;
  readonly distribution: string;
  readonly integration: string;
}

/**
 * Recipient adaptation configuration
 */
export interface ReasoningRecipientAdaptation {
  readonly context_adjustment: string;
  readonly validation: string;
  readonly confidence_tracking: string;
  readonly feedback_loop: string;
}

/**
 * Conflict resolution configuration
 */
export interface ReasoningConflictResolution {
  readonly version_mismatch: string;
  readonly contradictory_patterns: string;
  readonly domain_specificity: string;
}

/**
 * Cross-agent sharing pattern
 */
export interface ReasoningCrossAgentSharingPattern extends BasePattern {
  readonly key: 'reasoning-cross-agent-sharing';
  readonly sharing_channels: ReasoningSharingChannels;
  readonly knowledge_transfer: ReasoningKnowledgeTransfer;
  readonly recipient_adaptation: ReasoningRecipientAdaptation;
  readonly knowledge_domains: string[];
  readonly conflict_resolution: ReasoningConflictResolution;
  readonly scaling_approach: string;
}

/**
 * All reasoning pattern types
 */
export type ReasoningPattern =
  | ReasoningTrajectoryTrackingPattern
  | ReasoningPatternQualityGatesPattern
  | ReasoningExperienceReplayPattern
  | ReasoningCrossAgentSharingPattern;

/**
 * Reasoning patterns file structure
 */
export interface ReasoningPatternsFile {
  readonly namespace: string;
  readonly description: string;
  readonly created: string;
  readonly patterns: ReasoningPattern[];
}

// ============================================================================
// Index File Types
// ============================================================================

/**
 * Pattern reference in index
 */
export interface PatternReference {
  readonly file: string;
  readonly patterns: string[];
  readonly description: string;
}

/**
 * Namespace index structure
 */
export interface NamespaceIndex {
  readonly 'booster-patterns': PatternReference;
  readonly 'router-patterns': PatternReference;
  readonly 'embedding-patterns': PatternReference;
  readonly 'reasoning-patterns': PatternReference;
  readonly summary: {
    readonly file: string;
    readonly description: string;
  };
}

/**
 * Pattern statistics
 */
export interface PatternStatistics {
  readonly total_patterns: number;
  readonly namespaces: number;
  readonly avg_success_rate: number;
  readonly implementation_status: string;
}

/**
 * Access pattern definition
 */
export interface AccessPattern {
  readonly pattern_type: string;
  readonly operation: string;
  readonly time_complexity: string;
  readonly use_case: string;
}

/**
 * Session initialization steps
 */
export interface SessionInitialization {
  readonly steps: string[];
  readonly initialization_time: string;
}

/**
 * Memory coordination config
 */
export interface MemoryCoordination {
  readonly agent_communication: string;
  readonly knowledge_sharing: string;
  readonly learning_integration: string;
}

/**
 * Cross-session learning config
 */
export interface CrossSessionLearning {
  readonly enabled: boolean;
  readonly persistence_layer: string;
  readonly synchronization: string;
  readonly conflict_resolution: string;
  readonly archival_strategy: string;
  readonly memory_coordination: MemoryCoordination;
}

/**
 * Index file structure
 */
export interface PatternIndexFile {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly created: string;
  readonly namespace_index: {
    readonly 'adr-051': NamespaceIndex;
  };
  readonly pattern_statistics: PatternStatistics;
  readonly access_patterns: AccessPattern[];
  readonly session_initialization: SessionInitialization;
  readonly cross_session_learning: CrossSessionLearning;
  readonly usage_examples: Record<string, unknown>;
  readonly maintenance: Record<string, unknown>;
  readonly notes: string;
}

// ============================================================================
// Pattern Loader Error
// ============================================================================

/**
 * Error thrown when pattern loading fails
 */
export class PatternLoaderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'PatternLoaderError';
  }
}

// ============================================================================
// Pattern Loader Implementation
// ============================================================================

/**
 * Pattern loader configuration
 */
export interface PatternLoaderConfig {
  /** Base path for patterns directory */
  readonly basePath?: string;
  /** Whether to throw on missing files (default: false) */
  readonly throwOnMissing?: boolean;
  /** Whether to validate pattern structure (default: true) */
  readonly validatePatterns?: boolean;
}

/**
 * Loaded patterns state
 */
interface LoadedPatterns {
  index: PatternIndexFile | null;
  booster: BoosterPatternsFile | null;
  router: RouterPatternsFile | null;
  embedding: EmbeddingPatternsFile | null;
  reasoning: ReasoningPatternsFile | null;
  loadedAt: Date | null;
  errors: string[];
}

/**
 * PatternLoader singleton class
 *
 * Lazy-loads pattern JSON files from .agentic-qe/patterns/ directory
 * and provides typed access to pattern data.
 *
 * @example
 * ```typescript
 * import { PatternLoader } from '@agentic-qe/v3/integrations/agentic-flow';
 *
 * const loader = PatternLoader.getInstance();
 * await loader.loadPatterns();
 *
 * const boosterPatterns = loader.getBoosterPatterns();
 * console.log(boosterPatterns?.patterns[0].key);
 * ```
 */
export class PatternLoader {
  private static instance: PatternLoader | null = null;

  private readonly config: Required<PatternLoaderConfig>;
  private patterns: LoadedPatterns;
  private isLoading = false;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(config: PatternLoaderConfig = {}) {
    this.config = {
      basePath: config.basePath ?? this.getDefaultBasePath(),
      throwOnMissing: config.throwOnMissing ?? false,
      validatePatterns: config.validatePatterns ?? true,
    };

    this.patterns = {
      index: null,
      booster: null,
      router: null,
      embedding: null,
      reasoning: null,
      loadedAt: null,
      errors: [],
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config?: PatternLoaderConfig): PatternLoader {
    if (!PatternLoader.instance) {
      PatternLoader.instance = new PatternLoader(config);
    }
    return PatternLoader.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    PatternLoader.instance = null;
  }

  /**
   * Get the default base path for patterns directory
   */
  private getDefaultBasePath(): string {
    // Try to find the v3 project root
    // In ESM, we need to derive __dirname from import.meta.url
    try {
      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);
      const currentDir = dirname(currentFilePath);

      // Navigate from src/integrations/agentic-flow to project root
      const projectRoot = join(currentDir, '..', '..', '..');

      // Use assets/patterns (bundled with package, tracked in git)
      return join(projectRoot, 'assets', 'patterns');
    } catch {
      // Fallback for CJS or other environments
      return join(process.cwd(), 'assets', 'patterns');
    }
  }

  /**
   * Load all patterns from disk
   *
   * @returns Promise that resolves when all patterns are loaded
   */
  public async loadPatterns(): Promise<void> {
    // Prevent concurrent loads
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.patterns.errors = [];

    try {
      // Load index first
      this.patterns.index = this.loadJsonFile<PatternIndexFile>('index.json');

      // Load individual pattern files in parallel
      const [booster, router, embedding, reasoning] = await Promise.all([
        Promise.resolve(
          this.loadJsonFile<BoosterPatternsFile>('adr-051-booster-patterns.json')
        ),
        Promise.resolve(
          this.loadJsonFile<RouterPatternsFile>('adr-051-router-patterns.json')
        ),
        Promise.resolve(
          this.loadJsonFile<EmbeddingPatternsFile>('adr-051-embedding-patterns.json')
        ),
        Promise.resolve(
          this.loadJsonFile<ReasoningPatternsFile>('adr-051-reasoning-patterns.json')
        ),
      ]);

      this.patterns.booster = booster;
      this.patterns.router = router;
      this.patterns.embedding = embedding;
      this.patterns.reasoning = reasoning;
      this.patterns.loadedAt = new Date();

      // Validate patterns if enabled
      if (this.config.validatePatterns) {
        this.validateLoadedPatterns();
      }
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load a JSON file from the patterns directory
   */
  private loadJsonFile<T>(filename: string): T | null {
    const filePath = join(this.config.basePath, filename);

    try {
      if (!existsSync(filePath)) {
        const errorMsg = `Pattern file not found: ${filePath}`;
        this.patterns.errors.push(errorMsg);

        if (this.config.throwOnMissing) {
          throw new PatternLoaderError(errorMsg, 'FILE_NOT_FOUND');
        }
        return null;
      }

      const content = readFileSync(filePath, 'utf-8');
      return safeJsonParse(content) as T;
    } catch (error) {
      if (error instanceof PatternLoaderError) {
        throw error;
      }

      const errorMsg = `Failed to load pattern file ${filename}: ${
        toErrorMessage(error)
      }`;
      this.patterns.errors.push(errorMsg);

      if (this.config.throwOnMissing) {
        throw new PatternLoaderError(
          errorMsg,
          'PARSE_ERROR',
          error instanceof Error ? error : undefined
        );
      }
      return null;
    }
  }

  /**
   * Validate loaded patterns have expected structure
   */
  private validateLoadedPatterns(): void {
    // Validate booster patterns
    if (this.patterns.booster) {
      if (!Array.isArray(this.patterns.booster.patterns)) {
        this.patterns.errors.push(
          'Booster patterns file missing patterns array'
        );
      }
    }

    // Validate router patterns
    if (this.patterns.router) {
      if (!Array.isArray(this.patterns.router.patterns)) {
        this.patterns.errors.push('Router patterns file missing patterns array');
      }
    }

    // Validate embedding patterns
    if (this.patterns.embedding) {
      if (!Array.isArray(this.patterns.embedding.patterns)) {
        this.patterns.errors.push(
          'Embedding patterns file missing patterns array'
        );
      }
    }

    // Validate reasoning patterns
    if (this.patterns.reasoning) {
      if (!Array.isArray(this.patterns.reasoning.patterns)) {
        this.patterns.errors.push(
          'Reasoning patterns file missing patterns array'
        );
      }
    }
  }

  /**
   * Ensure patterns are loaded (lazy loading)
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.patterns.loadedAt) {
      await this.loadPatterns();
    }
  }

  /**
   * Get the pattern index
   */
  public async getIndex(): Promise<PatternIndexFile | null> {
    await this.ensureLoaded();
    return this.patterns.index;
  }

  /**
   * Get Agent Booster patterns
   */
  public async getBoosterPatterns(): Promise<BoosterPatternsFile | null> {
    await this.ensureLoaded();
    return this.patterns.booster;
  }

  /**
   * Get Model Router patterns
   */
  public async getRouterPatterns(): Promise<RouterPatternsFile | null> {
    await this.ensureLoaded();
    return this.patterns.router;
  }

  /**
   * Get ONNX Embedding patterns
   */
  public async getEmbeddingPatterns(): Promise<EmbeddingPatternsFile | null> {
    await this.ensureLoaded();
    return this.patterns.embedding;
  }

  /**
   * Get ReasoningBank patterns
   */
  public async getReasoningPatterns(): Promise<ReasoningPatternsFile | null> {
    await this.ensureLoaded();
    return this.patterns.reasoning;
  }

  /**
   * Get a specific pattern by key from booster patterns
   */
  public async getBoosterPatternByKey<K extends BoosterPattern['key']>(
    key: K
  ): Promise<Extract<BoosterPattern, { key: K }> | null> {
    const patterns = await this.getBoosterPatterns();
    if (!patterns) return null;

    const pattern = patterns.patterns.find((p) => p.key === key);
    return (pattern as Extract<BoosterPattern, { key: K }>) ?? null;
  }

  /**
   * Get a specific pattern by key from router patterns
   */
  public async getRouterPatternByKey<K extends RouterPattern['key']>(
    key: K
  ): Promise<Extract<RouterPattern, { key: K }> | null> {
    const patterns = await this.getRouterPatterns();
    if (!patterns) return null;

    const pattern = patterns.patterns.find((p) => p.key === key);
    return (pattern as Extract<RouterPattern, { key: K }>) ?? null;
  }

  /**
   * Get a specific pattern by key from embedding patterns
   */
  public async getEmbeddingPatternByKey<K extends EmbeddingPattern['key']>(
    key: K
  ): Promise<Extract<EmbeddingPattern, { key: K }> | null> {
    const patterns = await this.getEmbeddingPatterns();
    if (!patterns) return null;

    const pattern = patterns.patterns.find((p) => p.key === key);
    return (pattern as Extract<EmbeddingPattern, { key: K }>) ?? null;
  }

  /**
   * Get a specific pattern by key from reasoning patterns
   */
  public async getReasoningPatternByKey<K extends ReasoningPattern['key']>(
    key: K
  ): Promise<Extract<ReasoningPattern, { key: K }> | null> {
    const patterns = await this.getReasoningPatterns();
    if (!patterns) return null;

    const pattern = patterns.patterns.find((p) => p.key === key);
    return (pattern as Extract<ReasoningPattern, { key: K }>) ?? null;
  }

  /**
   * Get eligible transforms from booster patterns
   */
  public async getEligibleBoosterTransforms(): Promise<string[]> {
    const eligibilityPattern = await this.getBoosterPatternByKey(
      'booster-transform-eligibility'
    );
    if (!eligibilityPattern) return [];

    return eligibilityPattern.eligibility_criteria.simple_transforms;
  }

  /**
   * Get tier hierarchy from router patterns
   */
  public async getTierHierarchy(): Promise<Router5TierComplexityPattern['tier_hierarchy'] | null> {
    const tierPattern = await this.getRouterPatternByKey('router-5tier-complexity');
    if (!tierPattern) return null;

    return tierPattern.tier_hierarchy;
  }

  /**
   * Get quality gate thresholds from reasoning patterns
   */
  public async getQualityGateThresholds(): Promise<ReasoningGateThresholds | null> {
    const gatePattern = await this.getReasoningPatternByKey(
      'reasoning-pattern-quality-gates'
    );
    if (!gatePattern) return null;

    return gatePattern.gate_thresholds;
  }

  /**
   * Check if patterns have been loaded
   */
  public isLoaded(): boolean {
    return this.patterns.loadedAt !== null;
  }

  /**
   * Get the timestamp when patterns were loaded
   */
  public getLoadedAt(): Date | null {
    return this.patterns.loadedAt;
  }

  /**
   * Get any errors that occurred during loading
   */
  public getErrors(): string[] {
    return [...this.patterns.errors];
  }

  /**
   * Get pattern statistics
   */
  public async getStatistics(): Promise<PatternStatistics | null> {
    const index = await this.getIndex();
    if (!index) return null;

    return index.pattern_statistics;
  }

  /**
   * Force reload patterns from disk
   */
  public async reload(): Promise<void> {
    this.patterns = {
      index: null,
      booster: null,
      router: null,
      embedding: null,
      reasoning: null,
      loadedAt: null,
      errors: [],
    };
    await this.loadPatterns();
  }

  /**
   * Get all patterns as a combined object
   */
  public async getAllPatterns(): Promise<{
    index: PatternIndexFile | null;
    booster: BoosterPatternsFile | null;
    router: RouterPatternsFile | null;
    embedding: EmbeddingPatternsFile | null;
    reasoning: ReasoningPatternsFile | null;
    loadedAt: Date | null;
    errors: string[];
  }> {
    await this.ensureLoaded();
    return { ...this.patterns };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new PatternLoader instance
 * Note: This returns the singleton instance
 */
export function createPatternLoader(
  config?: PatternLoaderConfig
): PatternLoader {
  return PatternLoader.getInstance(config);
}

/**
 * Get the global PatternLoader instance
 */
export function getPatternLoader(): PatternLoader {
  return PatternLoader.getInstance();
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Load and get all booster patterns
 */
export async function loadBoosterPatterns(
  config?: PatternLoaderConfig
): Promise<BoosterPatternsFile | null> {
  const loader = PatternLoader.getInstance(config);
  return loader.getBoosterPatterns();
}

/**
 * Load and get all router patterns
 */
export async function loadRouterPatterns(
  config?: PatternLoaderConfig
): Promise<RouterPatternsFile | null> {
  const loader = PatternLoader.getInstance(config);
  return loader.getRouterPatterns();
}

/**
 * Load and get all embedding patterns
 */
export async function loadEmbeddingPatterns(
  config?: PatternLoaderConfig
): Promise<EmbeddingPatternsFile | null> {
  const loader = PatternLoader.getInstance(config);
  return loader.getEmbeddingPatterns();
}

/**
 * Load and get all reasoning patterns
 */
export async function loadReasoningPatterns(
  config?: PatternLoaderConfig
): Promise<ReasoningPatternsFile | null> {
  const loader = PatternLoader.getInstance(config);
  return loader.getReasoningPatterns();
}

/**
 * Check if a transform type is eligible for Agent Booster
 */
export async function isBoosterEligible(
  transformType: string,
  config?: PatternLoaderConfig
): Promise<boolean> {
  const loader = PatternLoader.getInstance(config);
  const eligibleTransforms = await loader.getEligibleBoosterTransforms();
  return eligibleTransforms.includes(transformType);
}
