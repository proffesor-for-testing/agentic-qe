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
