/**
 * Behavior Tree Orchestration
 *
 * Composable behavior trees for agent orchestration.
 * Provides core nodes, decorators, and pre-built QE workflow trees.
 */

// Core nodes and types
export type {
  NodeStatus,
  SerializedNode,
  BehaviorNode,
  ActionFunction,
  ConditionPredicate,
  ParallelConfig,
  NodeHandlerRegistry,
} from './nodes.js';

export {
  SequenceNode,
  SelectorNode,
  ParallelNode,
  ActionNode,
  ConditionNode,
  deserializeNode,
  registerDecoratorFactory,
  // Factory helpers
  sequence,
  selector,
  parallel,
  action,
  condition,
} from './nodes.js';

// Decorators
export {
  InverterNode,
  RepeatNode,
  UntilFailNode,
  TimeoutNode,
  RetryNode,
  // Factory helpers
  inverter,
  repeat,
  untilFail,
  timeout,
  retry,
} from './decorators.js';

// Pre-built QE trees
export type { QETreeHandlers } from './qe-trees.js';

export {
  QEActionIds,
  QEConditionIds,
  buildTestGenerationPipeline,
  buildRegressionSuite,
  buildSecurityAudit,
  createQEHandlerRegistry,
  serializeQETree,
  deserializeQETree,
} from './qe-trees.js';
