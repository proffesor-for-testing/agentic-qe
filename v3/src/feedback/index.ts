/**
 * Feedback Module Exports
 * ADR-023: Quality Feedback Loop System
 *
 * Provides a closed-loop feedback system for pattern quality improvement.
 */

// Types
export type {
  TestOutcome,
  CoverageMetrics,
  CoverageSession,
  CoverageGap,
  CoverageTechnique,
  CoverageStrategy,
  QualityScore,
  QualityDimensions,
  QualityWeights,
  PatternTier,
  PromotionCriteria,
  PatternPromotionEvent,
  PatternDemotionEvent,
  FeedbackConfig,
} from './types.js';

export {
  DEFAULT_QUALITY_WEIGHTS,
  DEFAULT_PROMOTION_CRITERIA,
  DEFAULT_FEEDBACK_CONFIG,
} from './types.js';

// Test Outcome Tracker
export {
  TestOutcomeTracker,
  createTestOutcomeTracker,
} from './test-outcome-tracker.js';

// Coverage Learner
export {
  CoverageLearner,
  createCoverageLearner,
} from './coverage-learner.js';

// Quality Score Calculator
export {
  QualityScoreCalculator,
  createQualityScoreCalculator,
} from './quality-score-calculator.js';

// Pattern Promotion Manager
export {
  PatternPromotionManager,
  createPatternPromotionManager,
} from './pattern-promotion.js';
export type { PatternMetrics } from './pattern-promotion.js';

// Main Feedback Loop Integrator
export {
  QualityFeedbackLoop,
  createQualityFeedbackLoop,
  createInitializedFeedbackLoop,
} from './feedback-loop.js';
export type {
  FeedbackLoopStats,
  RoutingAnalysis,
  RoutingOutcomeInput,
} from './feedback-loop.js';

// Re-export routing feedback for direct access
export {
  RoutingFeedbackCollector,
  createRoutingFeedbackCollector,
} from '../routing/routing-feedback.js';
