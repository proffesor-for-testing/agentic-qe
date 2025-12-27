/**
 * Routing Module - Intelligent Task Routing and Classification
 *
 * Provides ML-based complexity classification for optimal LLM provider routing.
 *
 * @module routing
 * @version 1.0.0
 */

export {
  ComplexityClassifier,
  TaskComplexity,
  TaskFeatures,
  RoutingHistoryEntry,
  ComplexityClassifierConfig
} from './ComplexityClassifier';

export {
  ModelCapabilityRegistry,
  type ModelCapabilities,
  type ModelConstraints,
  type TaskType
} from './ModelCapabilityRegistry';

// Cost Optimization Strategies (Task 2.3.2)
export {
  PromptCompressor,
  RequestBatcher,
  SmartCacheStrategy,
  ModelRightSizer,
  CostOptimizationManager
} from '../providers/CostOptimizationStrategies';
export type {
  RequestGroup,
  CacheStrategy,
  CompressionResult,
  ModelRightSizingResult,
  BatchExecutionResult,
  CostOptimizationConfig
} from '../providers/CostOptimizationStrategies';
