/**
 * RuvLLM Type Re-exports and Extensions
 *
 * This file re-exports types from @ruvector/ruvllm and provides
 * additional type definitions for our integration layer.
 *
 * @module types/ruvllm
 * @version 1.0.0
 */

// Re-export all types from @ruvector/ruvllm
export type {
  // Core configuration types
  RuvLLMConfig,
  GenerationConfig,
  QueryResponse,
  RoutingDecision,
  MemoryResult,
  RuvLLMStats,
  Feedback,
  Embedding,
  BatchQueryRequest,
  BatchQueryResponse,
  ModelSize,

  // Session types
  Session,
  ConversationSession,
  ConversationMessage,

  // SONA learning types
  SonaConfig,
  LearningSignal,
  SignalType,
  QueryTrajectory,
  TrajectoryStep,
  TrajectoryOutcome,
  LearnedPattern as RuvllmLearnedPattern,
  PatternType,
  EwcStats,

  // LoRA types
  LoRAConfig,

  // Streaming types
  StreamChunk,
  StreamOptions,

  // Federated learning types
  FederatedConfig,
  TrajectoryExport,
  AgentExport,
  AgentExportStats,
  AgentContribution,
  AggregationResult,
  CoordinatorStats,
  FederatedTopology,

  // Training types
  TrainingConfig,
  TrainingMetricsSnapshot,
  TrainingResult,
  TrainingCheckpoint,

  // Utility types
  CompressionResult,
  ArchiveResult,
  AttentionWeights,
  AttentionAnalysis,
  ExportFormat,
  ModelMetadata,
  SimdCapabilities,
} from '@ruvector/ruvllm';

// Re-export classes
export {
  RuvLLM,
  SessionManager,
  SonaCoordinator,
  TrajectoryBuilder,
  ReasoningBank,
  EwcManager,
  LoraAdapter,
  LoraManager,
  EphemeralAgent,
  FederatedCoordinator,
} from '@ruvector/ruvllm';

// Re-export LoRA weight types
export type { LoraWeights, LoraTrainingState } from '@ruvector/ruvllm';

/**
 * TRM (Test-time Reasoning & Metacognition) configuration
 * Extension of base config for TRM-specific settings
 */
export interface TRMConfig {
  /** Maximum refinement iterations (default: 7) */
  maxIterations?: number;
  /** Convergence threshold (0-1) - stop when improvement is below this (default: 0.95) */
  convergenceThreshold?: number;
  /** Quality metric to optimize for */
  qualityMetric?: TRMQualityMetric;
}

/**
 * TRM quality metrics
 */
export type TRMQualityMetric = 'coherence' | 'coverage' | 'diversity' | 'composite';

/**
 * TRM iteration tracking
 */
export interface TRMIteration {
  /** Iteration number (0-indexed) */
  iteration: number;
  /** Quality score at this iteration */
  quality: number;
  /** Improvement from previous iteration */
  improvement: number;
  /** Reasoning for this iteration */
  reasoning?: string;
}

/**
 * TRM completion response extending base QueryResponse
 */
export interface TRMCompletionResponse {
  /** Generated text */
  text: string;
  /** Final quality score */
  finalQuality: number;
  /** Number of TRM iterations */
  trmIterations: number;
  /** Convergence history */
  convergenceHistory: TRMIteration[];
  /** Confidence score */
  confidence: number;
  /** Model used */
  model: string;
  /** Request ID for feedback */
  requestId: string;
  /** Latency in ms */
  latencyMs: number;
  /** Metadata */
  metadata?: {
    trmLatency?: number;
    qualityMetric?: string;
    converged?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Extended SONA configuration for our integration
 */
export interface ExtendedSonaConfig {
  /** Enable SONA adaptive learning */
  enabled: boolean;
  /** LoRA rank for adapters (1-2 for micro, 4-16 for base) */
  loraRank: number;
  /** LoRA alpha scaling factor */
  loraAlpha: number;
  /** EWC++ lambda for forgetting prevention (default: 2000) */
  ewcLambda: number;
  /** Pattern similarity threshold for ReasoningBank */
  patternThreshold?: number;
  /** Enable instant loop (real-time learning) */
  instantLoopEnabled?: boolean;
  /** Enable background loop (batch learning) */
  backgroundLoopEnabled?: boolean;
}

/**
 * Type guard to check if value is a QueryResponse
 */
export function isQueryResponse(value: unknown): value is import('@ruvector/ruvllm').QueryResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    'confidence' in value &&
    'requestId' in value
  );
}

/**
 * Type guard to check if value is a TRMCompletionResponse
 */
export function isTRMCompletionResponse(value: unknown): value is TRMCompletionResponse {
  return (
    isQueryResponse(value) &&
    'trmIterations' in value &&
    'finalQuality' in value &&
    'convergenceHistory' in value
  );
}
