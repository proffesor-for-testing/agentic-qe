/**
 * Learning System - Phase 2 (Milestone 2.2)
 * Enhanced (v1.3.3+) - ML Root Cause Analysis and Fix Recommendations
 * Enhanced (v2.2.0+) - Self-Learning Upgrade with RL Algorithms
 *
 * Exports all learning components for agent performance improvement.
 */

export * from './types';
export * from './LearningEngine';
export * from './QLearning';
export * from './ExperienceReplayBuffer';
export * from './PerformanceTracker';
export * from './ImprovementLoop';
export * from './ImprovementWorker';
export * from './FlakyTestDetector';
export * from './FlakyPredictionModel';
export * from './FlakyFixRecommendations';
export * from './StatisticalAnalysis';
export * from './SwarmIntegration';

// Enhanced fix recommendations (NEW in v1.3.3+)
export {
  FixRecommendationEngine
} from './FixRecommendationEngine';

// RL Algorithms (NEW in v2.2.0+)
// Note: RLAlgorithmType is already exported from LearningEngine, so we use explicit exports
export {
  AbstractRLLearner,
  RLConfig,
  QValue,
  SARSALearner,
  SARSAConfig,
  ActorCriticLearner,
  ActorCriticConfig,
  createDefaultActorCriticConfig,
  PPOLearner,
  PPOConfig,
  createDefaultPPOConfig,
  createRLAlgorithm
} from './algorithms';

// Experience Sharing (NEW in v2.2.0+)
export {
  ExperienceSharingProtocol,
  ExperienceSharingConfig,
  SharedExperience,
  SharingStats,
  PeerConnection,
  SharingEvent
} from './ExperienceSharingProtocol';

// Explainable Learning (NEW in v2.2.0+ - Issue #118)
export {
  ExplainableLearning,
  ActionExplanation,
  ActionAlternative,
  ContributingExperience,
  DecisionFactor,
  StructuredExplanation,
  NaturalLanguageExplanation,
  DecisionType
} from './ExplainableLearning';

// Gossip Pattern Sharing (NEW in v2.2.0+ - Issue #118)
export {
  GossipPatternSharingProtocol,
  SharedPattern,
  PatternSharingConfig,
  PatternSharingStats,
  AntiEntropyResult,
  PatternSharingEvent
} from './GossipPatternSharingProtocol';

// Transfer Learning (NEW in v2.2.0+ - Issue #118)
export {
  TransferLearningManager,
  TransferConfig,
  TransferMetrics,
  TransferMapping,
  FineTuningResult
} from './TransferLearningManager';
export type { QEDomain, DomainFeatures } from './TransferLearningManager';

// Performance Optimizer (NEW in v2.2.0+ - Issue #118)
export {
  PerformanceOptimizer
} from './PerformanceOptimizer';
export type { PerformanceOptimizerConfig } from './PerformanceOptimizer';

// Privacy Manager (NEW in v2.2.0+ - Issue #118)
export {
  PrivacyManager,
  PrivacyLevel
} from './PrivacyManager';
export type {
  PrivacyConfig,
  SanitizedExperience,
  RetentionPolicyResult
} from './PrivacyManager';
