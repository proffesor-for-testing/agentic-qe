/**
 * Behavior Tree Decorators
 *
 * Decorators wrap a single child node and modify its behavior.
 * They act as middleware between the parent and child nodes.
 *
 * Decorator types:
 * - Inverter: Flips SUCCESS/FAILURE
 * - Repeat: Repeats child n times
 * - UntilFail: Repeats child until it fails
 * - Timeout: Fails if child takes too long
 * - Retry: Retries child on failure up to n times
 */

import type { BehaviorNode, NodeStatus, SerializedNode } from './nodes.js';
import { registerDecoratorFactory } from './nodes.js';

// ============================================================================
// Abstract Decorator Base
// ============================================================================

abstract class DecoratorNode implements BehaviorNode {
  abstract readonly type: string;

  constructor(
    public readonly name: string,
    protected readonly child: BehaviorNode
  ) {}

  abstract tick(): Promise<NodeStatus>;

  reset(): void {
    this.child.reset();
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      children: [this.child.serialize()],
    };
  }
}

// ============================================================================
// Decorators
// ============================================================================

/**
 * Inverter decorator - flips SUCCESS to FAILURE and vice versa.
 *
 * RUNNING is passed through unchanged.
 * Useful for negating conditions (e.g., "if NOT ready, then ...").
 */
export class InverterNode extends DecoratorNode {
  readonly type = 'Inverter';

  constructor(name: string, child: BehaviorNode) {
    super(name, child);
  }

  async tick(): Promise<NodeStatus> {
    const status = await this.child.tick();

    if (status === 'SUCCESS') return 'FAILURE';
    if (status === 'FAILURE') return 'SUCCESS';

    return 'RUNNING';
  }
}

/**
 * Repeat decorator - repeats the child node n times.
 *
 * - Returns FAILURE immediately if child fails on any iteration
 * - Returns RUNNING if child returns RUNNING
 * - Returns SUCCESS after n successful completions
 */
export class RepeatNode extends DecoratorNode {
  readonly type = 'Repeat';
  private readonly count: number;
  private currentIteration = 0;

  constructor(name: string, child: BehaviorNode, count: number) {
    super(name, child);
    this.count = Math.max(1, Math.floor(count));
  }

  async tick(): Promise<NodeStatus> {
    while (this.currentIteration < this.count) {
      const status = await this.child.tick();

      if (status === 'FAILURE') {
        return 'FAILURE';
      }

      if (status === 'RUNNING') {
        return 'RUNNING';
      }

      // SUCCESS - increment and reset child for next iteration
      this.currentIteration++;
      if (this.currentIteration < this.count) {
        this.child.reset();
      }
    }

    return 'SUCCESS';
  }

  reset(): void {
    this.currentIteration = 0;
    super.reset();
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      children: [this.child.serialize()],
      config: { count: this.count },
    };
  }
}

/**
 * UntilFail decorator - repeats the child until it fails.
 *
 * - Returns RUNNING as long as child succeeds (will repeat on next tick)
 * - Returns SUCCESS when child finally fails
 * - Passes through RUNNING from child
 *
 * Note: When used with a single tick() call, this runs the child
 * repeatedly in a loop until failure. Safeguard with a Timeout decorator
 * to prevent infinite loops.
 */
export class UntilFailNode extends DecoratorNode {
  readonly type = 'UntilFail';

  constructor(name: string, child: BehaviorNode) {
    super(name, child);
  }

  async tick(): Promise<NodeStatus> {
    const status = await this.child.tick();

    if (status === 'FAILURE') {
      return 'SUCCESS';
    }

    if (status === 'RUNNING') {
      return 'RUNNING';
    }

    // SUCCESS - reset and signal RUNNING so caller ticks again
    this.child.reset();
    return 'RUNNING';
  }
}

/**
 * Timeout decorator - fails if child takes too long.
 *
 * - Wraps the child's tick with a timeout
 * - Returns FAILURE if the timeout is exceeded
 * - Otherwise passes through the child's result
 */
export class TimeoutNode extends DecoratorNode {
  readonly type = 'Timeout';
  private readonly timeoutMs: number;

  constructor(name: string, child: BehaviorNode, timeoutMs: number) {
    super(name, child);
    this.timeoutMs = Math.max(1, timeoutMs);
  }

  async tick(): Promise<NodeStatus> {
    const timeoutPromise = new Promise<NodeStatus>((resolve) => {
      setTimeout(() => resolve('FAILURE'), this.timeoutMs);
    });

    const childPromise = this.child.tick();

    return Promise.race([childPromise, timeoutPromise]);
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      children: [this.child.serialize()],
      config: { timeoutMs: this.timeoutMs },
    };
  }
}

/**
 * Retry decorator - retries the child on failure up to n times.
 *
 * - Returns SUCCESS immediately on child success
 * - Returns RUNNING if child is running
 * - On FAILURE, retries up to maxRetries times before returning FAILURE
 */
export class RetryNode extends DecoratorNode {
  readonly type = 'Retry';
  private readonly maxRetries: number;
  private currentRetry = 0;

  constructor(name: string, child: BehaviorNode, maxRetries: number) {
    super(name, child);
    this.maxRetries = Math.max(0, Math.floor(maxRetries));
  }

  async tick(): Promise<NodeStatus> {
    const status = await this.child.tick();

    if (status === 'SUCCESS') {
      return 'SUCCESS';
    }

    if (status === 'RUNNING') {
      return 'RUNNING';
    }

    // FAILURE - check if we can retry
    if (this.currentRetry < this.maxRetries) {
      this.currentRetry++;
      this.child.reset();
      return this.tick();
    }

    return 'FAILURE';
  }

  reset(): void {
    this.currentRetry = 0;
    super.reset();
  }

  serialize(): SerializedNode {
    return {
      type: this.type,
      name: this.name,
      children: [this.child.serialize()],
      config: { maxRetries: this.maxRetries },
    };
  }
}

// ============================================================================
// Factory Helpers
// ============================================================================

/** Create an Inverter decorator */
export function inverter(name: string, child: BehaviorNode): InverterNode {
  return new InverterNode(name, child);
}

/** Create a Repeat decorator */
export function repeat(
  name: string,
  child: BehaviorNode,
  count: number
): RepeatNode {
  return new RepeatNode(name, child, count);
}

/** Create an UntilFail decorator */
export function untilFail(
  name: string,
  child: BehaviorNode
): UntilFailNode {
  return new UntilFailNode(name, child);
}

/** Create a Timeout decorator */
export function timeout(
  name: string,
  child: BehaviorNode,
  timeoutMs: number
): TimeoutNode {
  return new TimeoutNode(name, child, timeoutMs);
}

/** Create a Retry decorator */
export function retry(
  name: string,
  child: BehaviorNode,
  maxRetries: number
): RetryNode {
  return new RetryNode(name, child, maxRetries);
}

// ============================================================================
// Self-Registration for Deserialization
// ============================================================================

registerDecoratorFactory('Inverter', (name, child) => {
  return new InverterNode(name, child);
});

registerDecoratorFactory('Repeat', (name, child, config) => {
  const count = (config.count as number) ?? 1;
  return new RepeatNode(name, child, count);
});

registerDecoratorFactory('UntilFail', (name, child) => {
  return new UntilFailNode(name, child);
});

registerDecoratorFactory('Timeout', (name, child, config) => {
  const timeoutMs = (config.timeoutMs as number) ?? 30000;
  return new TimeoutNode(name, child, timeoutMs);
});

registerDecoratorFactory('Retry', (name, child, config) => {
  const maxRetries = (config.maxRetries as number) ?? 1;
  return new RetryNode(name, child, maxRetries);
});
