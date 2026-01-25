/**
 * Agentic QE v3 - Agentic-Flow Integration
 *
 * Integration adapters for agentic-flow capabilities per ADR-051:
 *
 * ## Agent Booster (Tier 0)
 * - 352x faster mechanical code transforms
 * - WASM-based transforms with TypeScript fallback
 * - var-to-const, add-types, remove-console, promise-to-async, cjs-to-esm, func-to-arrow
 *
 * ## ReasoningBank
 * - Cross-session learning and pattern persistence
 * - Trajectory tracking for learning paths
 * - Experience replay for pattern reinforcement
 * - Pattern evolution tracking
 *
 * @example Agent Booster
 * ```typescript
 * import { createAgentBoosterAdapter } from '@agentic-qe/v3/integrations/agentic-flow';
 *
 * const adapter = await createAgentBoosterAdapter({ enabled: true });
 * const result = await adapter.transform(code, 'var-to-const');
 * console.log(result.durationMs); // <5ms
 * ```
 *
 * @example ReasoningBank
 * ```typescript
 * import { createReasoningBankAdapter } from '@agentic-qe/v3/integrations/agentic-flow';
 *
 * const adapter = await createReasoningBankAdapter({ enabled: true });
 * const patterns = await adapter.searchPatterns('authentication');
 * ```
 *
 * @module integrations/agentic-flow
 */

// ============================================================================
// Agent Booster Exports
// ============================================================================

export {
  // Types
  type AgentBoosterConfig,
  type AgentBoosterLogger,
  type TransformType,
  type TransformMetadata,
  type TransformResult,
  type BatchTransformResult,
  type OpportunityDetectionResult,
  type TransformOpportunity,
  type CodeFile,
  type FileTransformResult,
  type CodeEdit,
  type SourceLocation,
  type AgentBoosterHealth,
  type IAgentBoosterAdapter,
  type TransformCacheEntry,
  type TransformResultType,
  type BatchTransformResultType,
  type OpportunityDetectionResultType,
  type TransformFunction,
  type TransformRegistry,

  // Constants
  DEFAULT_AGENT_BOOSTER_CONFIG,
  ALL_TRANSFORM_TYPES,
  TRANSFORM_METADATA,

  // Errors
  AgentBoosterError,
  TransformError,
  WasmUnavailableError,
  TransformTimeoutError,
  FileTooLargeError,

  // Adapter
  AgentBoosterAdapter,

  // Factory functions
  createAgentBoosterAdapter,
  createAgentBoosterAdapterSync,

  // Transform implementations
  transformVarToConst,
  transformAddTypes,
  transformRemoveConsole,
  transformPromiseToAsync,
  transformCjsToEsm,
  transformFuncToArrow,
  TRANSFORM_REGISTRY,
  executeTransform,
  getAvailableTransformTypes,

  // Convenience utilities
  quickTransform,
  quickBatchTransform,
  quickDetectOpportunities,
  isAgentBoosterAvailable,
  getAgentBoosterStatus,
} from './agent-booster';

// ============================================================================
// ReasoningBank Exports
// ============================================================================

export * from './reasoning-bank';

// ============================================================================
// Multi-Model Router Exports (ADR-051)
// ============================================================================

export {
  // Types
  type ModelTier,
  type ModelTierMetadata,
  type ComplexitySignals,
  type ComplexityScore,
  type IComplexityAnalyzer,
  type BudgetConfig,
  type TierBudget,
  type BudgetUsage,
  type BudgetDecision,
  type IBudgetEnforcer,
  type RoutingInput,
  type RoutingDecision,
  type ModelRouterConfig,
  type IModelRouter,
  type TierRoutingMetrics,
  type RouterMetrics,
  type RoutingResult,
  type ComplexityResult,
  type BudgetResult,

  // Constants
  TIER_METADATA,
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_ROUTER_CONFIG,

  // Errors
  ModelRouterError,
  BudgetExceededError,
  ComplexityAnalysisError,
  RoutingTimeoutError,

  // Classes
  ComplexityAnalyzer,
  BudgetEnforcer,
  ModelRouter,

  // Factory functions
  createComplexityAnalyzer,
  createBudgetEnforcer,
  createModelRouter,
  createModelRouterWithAgentBooster,

  // Convenience functions
  quickRoute,
  getTierRecommendation,
  checkAgentBoosterEligibility,
  estimateTaskCost,
} from './model-router';

// ============================================================================
// ONNX Embeddings Exports (ADR-051)
// ============================================================================

export {
  // Main adapter
  ONNXEmbeddingsAdapter,
  createONNXEmbeddingsAdapter,
  type ONNXEmbeddingsAdapterConfig,

  // Core components
  EmbeddingGenerator,
  SimilaritySearch,
  HyperbolicOps,

  // Types
  type Embedding,
  type EmbeddingConfig,
  type StoredEmbedding,
  type SimilarityResult,
  type SearchConfig,
  type BatchEmbeddingRequest,
  type BatchEmbeddingResult,
  type EmbeddingStats,
  type EmbeddingHealth,
  type HyperbolicConfig,

  // Enums and Errors
  EmbeddingModel,
  SimilarityMetric,
  EmbeddingErrorType,
  EmbeddingError,
} from './onnx-embeddings';

// ============================================================================
// Pattern Loader Exports (ADR-051)
// ============================================================================

export {
  // Main class
  PatternLoader,

  // Factory and convenience functions
  createPatternLoader,
  getPatternLoader,
  loadBoosterPatterns,
  loadRouterPatterns,
  loadEmbeddingPatterns,
  loadReasoningPatterns,
  isBoosterEligible,

  // Error type
  PatternLoaderError,

  // Configuration type
  type PatternLoaderConfig,

  // Index types
  type PatternIndexFile,
  type NamespaceIndex,
  type PatternReference,
  type PatternStatistics,
  type AccessPattern,
  type SessionInitialization,
  type CrossSessionLearning,
  type MemoryCoordination,

  // Booster pattern types
  type BoosterPatternsFile,
  type BoosterPattern,
  type BoosterTransformEligibilityPattern,
  type BoosterBatchOptimizationPattern,
  type BoosterWasmFallbackPattern,
  type BoosterEligibilityCriteria,
  type BoosterBatchStrategy,
  type BoosterFallbackImplementation,

  // Router pattern types
  type RouterPatternsFile,
  type RouterPattern,
  type Router5TierComplexityPattern,
  type RouterBudgetEnforcementPattern,
  type RouterBoosterIntegrationPattern,
  type RouterTierDefinition,
  type RouterBudgetConstraints,
  type RouterAutoDowngradeLogic,
  type RouterBudgetTracking,
  type RouterBoosterIntegrationFlow,
  type RouterEligibilityHandshake,
  type RouterMetricsCollection,

  // Embedding pattern types
  type EmbeddingPatternsFile,
  type EmbeddingPattern,
  type EmbeddingLocalGenerationPattern,
  type EmbeddingLRUCachePattern,
  type EmbeddingHyperbolicSpacePattern,
  type EmbeddingSimilarityMetricsPattern,
  type EmbeddingGenerationProcess,
  type EmbeddingPerformanceCharacteristics,
  type EmbeddingQualityMetrics,
  type EmbeddingCacheArchitecture,
  type EmbeddingCacheKeyStrategy,
  type EmbeddingEvictionPolicy,
  type EmbeddingHitRatioExpectations,
  type EmbeddingHyperbolicGeometry,
  type EmbeddingConversionProcess,
  type EmbeddingDistanceComputation,
  type EmbeddingSimilarityMetricsConfig,
  type EmbeddingMetricDefinition,
  type EmbeddingMetricsOverview,
  type EmbeddingSelectionStrategy,
  type EmbeddingThresholdTuning,

  // Reasoning pattern types
  type ReasoningPatternsFile,
  type ReasoningPattern,
  type ReasoningTrajectoryTrackingPattern,
  type ReasoningPatternQualityGatesPattern,
  type ReasoningExperienceReplayPattern,
  type ReasoningCrossAgentSharingPattern,
  type ReasoningTrajectoryStep,
  type ReasoningTrajectoryStructure,
  type ReasoningTrackingMechanism,
  type ReasoningLearningExtraction,
  type ReasoningTrajectoryReplay,
  type ReasoningQualityCriteria,
  type ReasoningQualityScoring,
  type ReasoningGateThresholds,
  type ReasoningReplayMechanism,
  type ReasoningBufferManagement,
  type ReasoningLearningIntegration,
  type ReasoningMetricsTracking,
  type ReasoningSharingChannels,
  type ReasoningKnowledgeTransfer,
  type ReasoningRecipientAdaptation,
  type ReasoningConflictResolution,

  // Base types
  type BasePattern,
  type PatternPerformanceMetrics,
} from './pattern-loader';

// ============================================================================
// Metrics Tracking Exports (ADR-051)
// ============================================================================

export {
  // Main class
  MetricsTracker,

  // Factory and singleton functions
  createMetricsTracker,
  createMetricsTrackerSync,
  getMetricsTracker,
  resetMetricsTracker,

  // Pattern updater
  PatternUpdater,
  createPatternUpdater,
  updatePatternsWithRealMetrics,
  type PatternUpdaterConfig,

  // Types
  type MetricComponent,
  type OutcomeStatus,
  type OutcomeMetadata,
  type RecordedOutcome,
  type SuccessRateStats,
  type SubTypeMetrics,
  type ComponentMetricsSummary,
  type MetricsSummary,
  type PatternMetricsUpdate,
  type TimeWindow,
  type MetricsTrackerConfig,
  type IMetricsTracker,

  // Constants and utilities
  timeWindowToMs,
  DEFAULT_METRICS_TRACKER_CONFIG,
} from './metrics';
