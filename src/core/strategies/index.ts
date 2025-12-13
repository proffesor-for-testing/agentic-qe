/**
 * Agent Strategies - Unified Exports
 *
 * Composable strategy interfaces for BaseAgent decomposition.
 * Part of Phase 2 (B1) layered architecture refactoring.
 *
 * Architecture:
 * - Lifecycle Strategy: Agent initialization, state transitions, cleanup
 * - Memory Strategy: Storage, retrieval, persistence
 * - Learning Strategy: Pattern learning, recommendations
 * - Coordination Strategy: Events, messages, swarm coordination
 *
 * @module core/strategies
 * @version 1.0.0
 */

// === Strategy Interfaces ===

export type {
  AgentLifecycleStrategy,
  LifecycleConfig,
  LifecycleEvent,
  LifecycleMetrics,
  LifecycleStrategyFactory,
} from './AgentLifecycleStrategy';

export type {
  AgentMemoryStrategy,
  MemoryOptions,
  MemoryEntry,
  MemoryQueryOptions,
  MemoryStats,
  MemoryStrategyFactory,
} from './AgentMemoryStrategy';

export type {
  AgentLearningStrategy,
  LearnedPattern,
  PatternQuery,
  StrategyRecommendation,
  ExecutionEvent,
  TrainingResult,
  LearningStatus,
  LearningMetrics,
  LearningStrategyFactory,
} from './AgentLearningStrategy';

export type {
  AgentCoordinationStrategy,
  AgentMessage,
  MessageHandler,
  SwarmMembership,
  CoordinationMetrics,
  CoordinationStrategyFactory,
  CoordinationEventHandler,
} from './AgentCoordinationStrategy';

// === Default Implementations ===

export {
  DefaultLifecycleStrategy,
  PooledLifecycleStrategy,
  DisabledLifecycleStrategy,
  createLifecycleStrategy,
} from './DefaultLifecycleStrategy';

export {
  DefaultMemoryStrategy,
  createMemoryStrategy,
} from './DefaultMemoryStrategy';

export {
  DefaultLearningStrategy,
  DisabledLearningStrategy,
  createLearningStrategy,
} from './DefaultLearningStrategy';

export {
  DefaultCoordinationStrategy,
  createCoordinationStrategy,
} from './DefaultCoordinationStrategy';

// === Advanced Strategy Implementations ===

export {
  DistributedMemoryStrategy,
  type DistributedMemoryConfig,
} from './DistributedMemoryStrategy';

export {
  AcceleratedLearningStrategy,
  type AcceleratedLearningConfig,
} from './AcceleratedLearningStrategy';

// === Strategy Configuration ===

/**
 * Combined strategy configuration
 */
export interface AgentStrategiesConfig {
  lifecycle?: AgentLifecycleStrategyConfig;
  memory?: AgentMemoryStrategyConfig;
  learning?: AgentLearningStrategyConfig;
  coordination?: AgentCoordinationStrategyConfig;
}

/**
 * Lifecycle strategy configuration
 */
export interface AgentLifecycleStrategyConfig {
  type: 'default' | 'pooled' | 'distributed';
  enableHooks?: boolean;
  initializationTimeout?: number;
  shutdownTimeout?: number;
}

/**
 * Memory strategy configuration
 */
export interface AgentMemoryStrategyConfig {
  type: 'default' | 'cached' | 'distributed';
  storagePath?: string;
  enableCache?: boolean;
  cacheMaxAge?: number;
}

/**
 * Learning strategy configuration
 */
export interface AgentLearningStrategyConfig {
  type: 'default' | 'accelerated' | 'disabled';
  enablePatternLearning?: boolean;
  learningRate?: number;
  minConfidenceThreshold?: number;
}

/**
 * Coordination strategy configuration
 */
export interface AgentCoordinationStrategyConfig {
  type: 'default' | 'swarm' | 'distributed';
  enableBroadcast?: boolean;
  messageTimeout?: number;
}

/**
 * Quick Start Example:
 *
 * ```typescript
 * import type {
 *   AgentLifecycleStrategy,
 *   AgentMemoryStrategy,
 *   AgentLearningStrategy,
 *   AgentCoordinationStrategy,
 * } from './core/strategies';
 *
 * // Custom agent with pluggable strategies
 * class MyAgent extends BaseAgent {
 *   constructor(config: MyAgentConfig) {
 *     super({
 *       ...config,
 *       lifecycleStrategy: new DefaultLifecycleStrategy(),
 *       memoryStrategy: new CachedMemoryStrategy({ path: './cache' }),
 *       learningStrategy: new AcceleratedLearningStrategy(),
 *       coordinationStrategy: new SwarmCoordinationStrategy(),
 *     });
 *   }
 * }
 * ```
 */
