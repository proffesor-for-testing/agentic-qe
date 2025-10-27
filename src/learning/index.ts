/**
 * Learning System - Phase 2 (Milestone 2.2)
 * Enhanced (v1.3.3+) - ML Root Cause Analysis and Fix Recommendations
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
