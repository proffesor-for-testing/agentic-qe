/**
 * Flaky Test Detection System - Public API
 * Export all components for external use
 */

export { FlakyTestDetector, FlakyDetectionOptions } from './FlakyTestDetector';
export { FlakyPredictionModel } from './FlakyPredictionModel';
export { StatisticalAnalysis } from './StatisticalAnalysis';
export { FlakyFixRecommendations } from './FlakyFixRecommendations';

export type {
  TestResult,
  FlakyTest,
  FlakyFixRecommendation,
  StatisticalMetrics,
  FlakyPrediction,
  ModelTrainingData,
  ModelMetrics
} from './types';
