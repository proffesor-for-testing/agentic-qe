/**
 * Nervous System Integration Components
 *
 * These modules connect the bio-inspired WASM nervous system adapters
 * to the existing QE agent infrastructure:
 *
 * - HybridPatternStore: HDC + IPatternStore for 50ns pattern binding
 * - BTSPLearningEngine: BTSP + LearningEngine for one-shot learning
 * - WorkspaceAgentCoordinator: Global Workspace + agent coordination
 * - CircadianAgentManager: Circadian + agent lifecycle
 * - NervousSystemEnhancement: Mixin to enhance any BaseAgent (planned)
 *
 * @module nervous-system/integration
 */

// Pattern storage with HDC acceleration
export {
  HybridPatternStore,
  type HybridPatternStoreConfig,
  createHybridPatternStore,
  createHighPerformanceHybridStore,
} from './HybridPatternStore.js';

// One-shot learning with BTSP
export {
  BTSPLearningEngine,
  type BTSPLearningEngineConfig,
  type BTSPLearningOutcome,
  type BTSPLearningMetrics,
  type BTSPStrategyRecommendation,
  createBTSPLearningEngine,
} from './BTSPLearningEngine.js';

// Global Workspace agent coordination
export {
  WorkspaceAgentCoordinator,
  type AgentWorkspaceItem,
  type TaskCoordinationRequest,
  type TaskCoordinationResult,
  type WorkspaceAgentCoordinatorConfig,
  type WorkspaceAgentEvents,
  createWorkspaceCoordinator,
  createFocusedCoordinator,
  createExpandedCoordinator,
} from './WorkspaceAgent.js';

// Circadian duty cycling
export {
  CircadianAgentManager,
  type AgentPhaseConfig,
  type ManagedAgentState,
  type EnergySavingsReport,
  type CriticalityLevel,
  type PhaseTransitionEvent,
  type AgentSleepEvent,
  type CircadianAgentManagerConfig,
  type CircadianAgentEvents,
} from './CircadianAgent.js';

// Nervous System Enhancement - Mixin to enhance any BaseAgent
export {
  // Core enhancement function
  enhanceWithNervousSystem,
  // Class decorator
  WithNervousSystem,
  // Fleet coordinator
  NervousSystemFleetCoordinator,
  // Configuration types
  type NervousSystemConfig,
  type NervousSystemEnhancedAgent,
  type NervousSystemStats,
  type FleetNervousSystemStats,
  // Additional types
  type TaskFailure,
  type WorkspaceItem,
  type StrategyRecommendation as NervousSystemStrategyRecommendation,
} from './NervousSystemEnhancement.js';

// Type re-exports for convenience
export type {
  TestPattern,
  PatternSearchResult,
  PatternStoreStats,
  PatternSearchOptions,
  PatternStoreConfig,
  IPatternStore,
} from '../../core/memory/IPatternStore.js';

export type {
  LearningOutcome,
  StrategyRecommendation,
  TaskState,
  TaskExperience,
  AgentAction,
  LearningFeedback,
  LearnedPattern,
} from '../../learning/types.js';
