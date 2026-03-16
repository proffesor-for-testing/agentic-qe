/**
 * Behavior Tree Core Nodes
 *
 * Composable behavior tree nodes for agent orchestration.
 * Each node implements a tick-based evaluation model returning
 * SUCCESS, FAILURE, or RUNNING.
 */

// ============================================================================
// Types
// ============================================================================

/** Result status of a behavior tree node tick */
export type NodeStatus = 'SUCCESS' | 'FAILURE' | 'RUNNING';

/** Serialized representation of a behavior tree node */
export interface SerializedNode {
  type: string;
  name: string;
  children?: SerializedNode[];
  config?: Record<string, unknown>;
}

/** Base interface for all behavior tree nodes */
export interface BehaviorNode {
  /** Node type identifier */
  readonly type: string;
  /** Human-readable name */
  readonly name: string;
  /** Evaluate this node and return its status */
  tick(): Promise<NodeStatus>;
  /** Reset this node (and children) to initial state */
  reset(): void;
  /** Serialize this node to a JSON-compatible structure */
  serialize(): SerializedNode;
}

/** Function signature for Action node handlers */
export type ActionFunction = () => Promise<NodeStatus>;

/** Function signature for Condition node predicates */
export type ConditionPredicate = () => Promise<boolean>;

/** Configuration for Parallel node */
export interface ParallelConfig {
  /** Number of children that must succeed for this node to succeed */
  successThreshold: number;
  /** Whether to wait for all children or return early */
  waitForAll?: boolean;
}

// ============================================================================
// Abstract Base
// ============================================================================

abstract class BaseNode implements BehaviorNode {
  abstract readonly type: string;

  constructor(public readonly name: string) {}

  abstract tick(): Promise<NodeStatus>;
  abstract reset(): void;

  serialize(): SerializedNode {
    return { type: this.type, name: this.name };
  }
}

abstract class CompositeNode extends BaseNode {
  protected readonly children: BehaviorNode[];

  constructor(name: string, children: BehaviorNode[]) {
    super(name);
    this.children = children;
  }

  reset(): void {
    for (const child of this.children) {
      child.reset();
    }
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      children: this.children.map((c) => c.serialize()),
    };
  }
}

// ============================================================================
// Composite Nodes
// ============================================================================

/**
 * Sequence node - AND logic.
 *
 * Runs children in order from left to right:
 * - Returns FAILURE immediately when any child fails
 * - Returns RUNNING if a child is still running
 * - Returns SUCCESS only when all children succeed
 */
export class SequenceNode extends CompositeNode {
  readonly type = 'Sequence';
  private currentIndex = 0;

  constructor(name: string, children: BehaviorNode[]) {
    super(name, children);
  }

  async tick(): Promise<NodeStatus> {
    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex];
      const status = await child.tick();

      if (status === 'FAILURE') {
        return 'FAILURE';
      }

      if (status === 'RUNNING') {
        return 'RUNNING';
      }

      // SUCCESS - move to next child
      this.currentIndex++;
    }

    return 'SUCCESS';
  }

  reset(): void {
    this.currentIndex = 0;
    super.reset();
  }
}

/**
 * Selector node - OR logic.
 *
 * Runs children in order from left to right:
 * - Returns SUCCESS immediately when any child succeeds
 * - Returns RUNNING if a child is still running
 * - Returns FAILURE only when all children fail
 */
export class SelectorNode extends CompositeNode {
  readonly type = 'Selector';
  private currentIndex = 0;

  constructor(name: string, children: BehaviorNode[]) {
    super(name, children);
  }

  async tick(): Promise<NodeStatus> {
    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex];
      const status = await child.tick();

      if (status === 'SUCCESS') {
        return 'SUCCESS';
      }

      if (status === 'RUNNING') {
        return 'RUNNING';
      }

      // FAILURE - try next child
      this.currentIndex++;
    }

    return 'FAILURE';
  }

  reset(): void {
    this.currentIndex = 0;
    super.reset();
  }
}

/**
 * Parallel node - concurrent execution.
 *
 * Runs all children concurrently:
 * - Returns SUCCESS when successThreshold children succeed
 * - Returns FAILURE when it becomes impossible to meet the threshold
 * - Returns RUNNING while children are still executing
 */
export class ParallelNode extends CompositeNode {
  readonly type = 'Parallel';
  private readonly config: Required<ParallelConfig>;

  constructor(name: string, children: BehaviorNode[], config: ParallelConfig) {
    super(name, children);
    this.config = {
      successThreshold: config.successThreshold,
      waitForAll: config.waitForAll ?? false,
    };
  }

  async tick(): Promise<NodeStatus> {
    const results = await Promise.all(
      this.children.map((child) => child.tick())
    );

    let successCount = 0;
    let failureCount = 0;
    let runningCount = 0;

    for (const status of results) {
      if (status === 'SUCCESS') successCount++;
      else if (status === 'FAILURE') failureCount++;
      else runningCount++;
    }

    // Enough successes to meet threshold
    if (successCount >= this.config.successThreshold) {
      if (this.config.waitForAll && runningCount > 0) {
        return 'RUNNING';
      }
      return 'SUCCESS';
    }

    // Impossible to reach threshold
    const maxPossibleSuccesses = successCount + runningCount;
    if (maxPossibleSuccesses < this.config.successThreshold) {
      return 'FAILURE';
    }

    return 'RUNNING';
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      children: this.children.map((c) => c.serialize()),
      config: {
        successThreshold: this.config.successThreshold,
        waitForAll: this.config.waitForAll,
      },
    };
  }
}

// ============================================================================
// Leaf Nodes
// ============================================================================

/**
 * Action node - leaf node that executes a function.
 *
 * Wraps an async function that returns a NodeStatus.
 * Use for side-effectful operations like running tests or generating code.
 */
export class ActionNode extends BaseNode {
  readonly type = 'Action';
  private readonly action: ActionFunction;
  private readonly actionId: string;

  constructor(name: string, action: ActionFunction, actionId?: string) {
    super(name);
    this.action = action;
    this.actionId = actionId ?? name;
  }

  async tick(): Promise<NodeStatus> {
    try {
      return await this.action();
    } catch {
      return 'FAILURE';
    }
  }

  reset(): void {
    // Leaf nodes have no state to reset
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      config: { actionId: this.actionId },
    };
  }
}

/**
 * Condition node - leaf node that checks a predicate.
 *
 * Wraps an async predicate that returns boolean.
 * Returns SUCCESS if predicate is true, FAILURE if false.
 * Use for checking preconditions or guard clauses.
 */
export class ConditionNode extends BaseNode {
  readonly type = 'Condition';
  private readonly predicate: ConditionPredicate;
  private readonly conditionId: string;

  constructor(name: string, predicate: ConditionPredicate, conditionId?: string) {
    super(name);
    this.predicate = predicate;
    this.conditionId = conditionId ?? name;
  }

  async tick(): Promise<NodeStatus> {
    try {
      const result = await this.predicate();
      return result ? 'SUCCESS' : 'FAILURE';
    } catch {
      return 'FAILURE';
    }
  }

  reset(): void {
    // Leaf nodes have no state to reset
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      config: { conditionId: this.conditionId },
    };
  }
}

// ============================================================================
// Deserialization Support
// ============================================================================

/** Registry of action/condition handlers for deserialization */
export interface NodeHandlerRegistry {
  actions: Map<string, ActionFunction>;
  conditions: Map<string, ConditionPredicate>;
}

/**
 * Deserialize a serialized node tree back into executable BehaviorNodes.
 *
 * Requires a handler registry to reconstruct Action and Condition nodes
 * since functions cannot be serialized directly.
 *
 * Supports both core nodes (Sequence, Selector, Parallel, Action, Condition)
 * and decorator nodes (Inverter, Repeat, UntilFail, Timeout, Retry).
 * Decorator classes must be registered via registerDecoratorTypes() before
 * deserialization of trees containing decorators.
 */
export function deserializeNode(
  data: SerializedNode,
  registry: NodeHandlerRegistry
): BehaviorNode {
  switch (data.type) {
    case 'Sequence': {
      const children = (data.children ?? []).map((c) =>
        deserializeNode(c, registry)
      );
      return new SequenceNode(data.name, children);
    }

    case 'Selector': {
      const children = (data.children ?? []).map((c) =>
        deserializeNode(c, registry)
      );
      return new SelectorNode(data.name, children);
    }

    case 'Parallel': {
      const children = (data.children ?? []).map((c) =>
        deserializeNode(c, registry)
      );
      const config: ParallelConfig = {
        successThreshold:
          (data.config?.successThreshold as number) ?? children.length,
        waitForAll: (data.config?.waitForAll as boolean) ?? false,
      };
      return new ParallelNode(data.name, children, config);
    }

    case 'Action': {
      const actionId = (data.config?.actionId as string) ?? data.name;
      const handler = registry.actions.get(actionId);
      if (!handler) {
        throw new Error(
          `Action handler not found in registry: '${actionId}'`
        );
      }
      return new ActionNode(data.name, handler, actionId);
    }

    case 'Condition': {
      const conditionId = (data.config?.conditionId as string) ?? data.name;
      const handler = registry.conditions.get(conditionId);
      if (!handler) {
        throw new Error(
          `Condition handler not found in registry: '${conditionId}'`
        );
      }
      return new ConditionNode(data.name, handler, conditionId);
    }

    // Decorator types - require exactly one child
    case 'Inverter':
    case 'Repeat':
    case 'UntilFail':
    case 'Timeout':
    case 'Retry': {
      const decoratorFactory = _decoratorFactories.get(data.type);
      if (!decoratorFactory) {
        throw new Error(
          `Decorator type '${data.type}' not registered. ` +
          `Call registerDecoratorTypes() before deserializing trees with decorators.`
        );
      }
      const children = data.children ?? [];
      if (children.length !== 1) {
        throw new Error(
          `Decorator '${data.type}' requires exactly 1 child, got ${children.length}`
        );
      }
      const child = deserializeNode(children[0], registry);
      return decoratorFactory(data.name, child, data.config ?? {});
    }

    default:
      throw new Error(`Unknown node type: '${data.type}'`);
  }
}

// ============================================================================
// Decorator Type Registration (avoids circular imports)
// ============================================================================

type DecoratorFactory = (
  name: string,
  child: BehaviorNode,
  config: Record<string, unknown>
) => BehaviorNode;

const _decoratorFactories = new Map<string, DecoratorFactory>();

/**
 * Register decorator type factories for deserialization.
 * Called automatically when decorators module is imported via the barrel export.
 */
export function registerDecoratorFactory(
  type: string,
  factory: DecoratorFactory
): void {
  _decoratorFactories.set(type, factory);
}

// ============================================================================
// Factory Helpers
// ============================================================================

/** Create a Sequence node */
export function sequence(
  name: string,
  children: BehaviorNode[]
): SequenceNode {
  return new SequenceNode(name, children);
}

/** Create a Selector node */
export function selector(
  name: string,
  children: BehaviorNode[]
): SelectorNode {
  return new SelectorNode(name, children);
}

/** Create a Parallel node */
export function parallel(
  name: string,
  children: BehaviorNode[],
  config: ParallelConfig
): ParallelNode {
  return new ParallelNode(name, children, config);
}

/** Create an Action node */
export function action(
  name: string,
  fn: ActionFunction,
  actionId?: string
): ActionNode {
  return new ActionNode(name, fn, actionId);
}

/** Create a Condition node */
export function condition(
  name: string,
  predicate: ConditionPredicate,
  conditionId?: string
): ConditionNode {
  return new ConditionNode(name, predicate, conditionId);
}
