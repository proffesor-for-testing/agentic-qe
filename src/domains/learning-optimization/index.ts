/**
 * Agentic QE v3 - Learning & Optimization Domain
 * Cross-domain learning, pattern extraction, and strategy optimization
 *
 * This module exports the public API for the learning-optimization domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  LearningOptimizationPlugin,
  createLearningOptimizationPlugin,
  type LearningOptimizationPluginConfig,
  type LearningOptimizationAPI,
  type LearningOptimizationExtendedAPI,
} from './plugin.js';

// ============================================================================
// Coordinator
// ============================================================================

export {
  LearningOptimizationCoordinator,
  type LearningCoordinatorConfig,
  type LearningWorkflowStatus,
} from './coordinator.js';

// ============================================================================
// Services
// ============================================================================

export {
  LearningCoordinatorService,
  type LearningCoordinatorConfig as LearningServiceConfig,
  type LearningCoordinatorDependencies,
} from './services/learning-coordinator.js';

export {
  TransferSpecialistService,
  type TransferSpecialistConfig,
  type TransferResult,
} from './services/transfer-specialist.js';

export {
  MetricsOptimizerService,
  type MetricsOptimizerConfig,
  type MetricsSnapshot,
} from './services/metrics-optimizer.js';

export {
  ProductionIntelService,
  type ProductionIntelConfig,
  type ProductionMetric,
  type ProductionIncident,
  type ProductionHealth,
} from './services/production-intel.js';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // Coordinator interface
  ILearningOptimizationCoordinator,
  LearningCycleReport,
  OptimizationReport,
  CrossDomainSharingReport,
  LearningDashboard,
  ModelExport,
  ImportReport,
  ImportConflict,
  Improvement,
  DomainOptimizationResult,
  TrendPoint,
  Milestone,

  // Pattern types
  LearnedPattern,
  PatternType,
  PatternContext,
  PatternTemplate,
  TemplateVariable,
  PatternStats,
  IPatternLearningService,

  // Experience types
  Experience,
  ExperienceResult,
  StateSnapshot,
  ResourceUsage,
  MinedInsights,
  ExperienceCluster,
  ExperienceAnomaly,
  IExperienceMiningService,

  // Knowledge types
  Knowledge,
  KnowledgeType,
  KnowledgeContent,
  KnowledgeQuery,
  IKnowledgeSynthesisService,

  // Strategy types
  Strategy,
  OptimizedStrategy,
  OptimizationObjective,
  Constraint,
  ValidationResult,
  ABTestConfig,
  ABTestResult,
  StrategyEvaluation,
  IStrategyOptimizerService,

  // Repository interfaces
  IPatternRepository,
  IExperienceRepository,
  IKnowledgeRepository,
  IStrategyRepository,

  // Domain events
  PatternLearnedEvent,
  KnowledgeSharedEvent,
  StrategyOptimizedEvent,
  ExperienceRecordedEvent,
  LearningMilestoneReachedEvent,
} from './interfaces.js';
