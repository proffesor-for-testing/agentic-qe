/**
 * IMP-10: QE Quality Daemon — Priority Queue
 *
 * 3-level priority queue for daemon task scheduling:
 * - 'now':   Quality gate failures, critical alerts (processed immediately)
 * - 'next':  New commits, coverage changes (processed on next tick)
 * - 'later': Nightly consolidation, pattern pruning (processed during idle)
 */

export type QueuePriority = 'now' | 'next' | 'later';

export interface QueueItem<T = unknown> {
  readonly id: string;
  readonly priority: QueuePriority;
  readonly payload: T;
  readonly createdAt: number;
  readonly source: string;
  /** Max age in ms before the item is discarded as stale */
  readonly ttlMs?: number;
}

/**
 * Typed payloads for known daemon task types.
 */
export interface GitCommitPayload {
  readonly type: 'git_commit';
  readonly branch: string;
  readonly commitHash: string;
  readonly changedFiles: string[];
}

export interface CoverageDeltaPayload {
  readonly type: 'coverage_delta';
  readonly previousSnapshot: string;
  readonly currentSnapshot: string;
}

export interface GateFailurePayload {
  readonly type: 'gate_failure';
  readonly gateName: string;
  readonly score: number;
  readonly threshold: number;
}

export interface NightlyPayload {
  readonly type: 'nightly';
  readonly tasks: string[];
}

export interface CIFailurePayload {
  readonly type: 'ci_failure';
  readonly workflowName: string;
  readonly runId: number;
  readonly conclusion: string;
}

export type DaemonTaskPayload =
  | GitCommitPayload
  | CoverageDeltaPayload
  | GateFailurePayload
  | NightlyPayload
  | CIFailurePayload;

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2,
};

/**
 * A bounded, 3-level priority queue with optional TTL expiry.
 */
export class PriorityQueue<T = DaemonTaskPayload> {
  private queues: Record<QueuePriority, QueueItem<T>[]> = {
    now: [],
    next: [],
    later: [],
  };

  private _maxSize: number;

  constructor(maxSize = 1000) {
    this._maxSize = maxSize;
  }

  /**
   * Enqueue an item at the given priority level.
   * Returns false if queue is full.
   */
  enqueue(item: QueueItem<T>): boolean {
    if (this.size >= this._maxSize) {
      return false;
    }
    this.queues[item.priority].push(item);
    return true;
  }

  /**
   * Dequeue the highest-priority item.
   * Within a priority level, FIFO order is maintained.
   * Stale items (past TTL) are silently skipped.
   */
  dequeue(): QueueItem<T> | undefined {
    const now = Date.now();
    for (const priority of ['now', 'next', 'later'] as QueuePriority[]) {
      const queue = this.queues[priority];
      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.ttlMs && now - item.createdAt > item.ttlMs) {
          continue; // expired, skip
        }
        return item;
      }
    }
    return undefined;
  }

  /**
   * Peek at the next item without removing it.
   */
  peek(): QueueItem<T> | undefined {
    const now = Date.now();
    for (const priority of ['now', 'next', 'later'] as QueuePriority[]) {
      const queue = this.queues[priority];
      for (const item of queue) {
        if (!item.ttlMs || now - item.createdAt <= item.ttlMs) {
          return item;
        }
      }
    }
    return undefined;
  }

  /**
   * Drain all items at a specific priority level.
   */
  drainPriority(priority: QueuePriority): QueueItem<T>[] {
    const items = this.queues[priority].splice(0);
    const now = Date.now();
    return items.filter(
      (item) => !item.ttlMs || now - item.createdAt <= item.ttlMs
    );
  }

  /**
   * Remove all expired items across all queues.
   */
  pruneExpired(): number {
    let pruned = 0;
    const now = Date.now();
    for (const priority of ['now', 'next', 'later'] as QueuePriority[]) {
      const before = this.queues[priority].length;
      this.queues[priority] = this.queues[priority].filter(
        (item) => !item.ttlMs || now - item.createdAt <= item.ttlMs
      );
      pruned += before - this.queues[priority].length;
    }
    return pruned;
  }

  /**
   * Total number of items across all priority levels.
   */
  get size(): number {
    return (
      this.queues.now.length +
      this.queues.next.length +
      this.queues.later.length
    );
  }

  /**
   * Per-priority counts.
   */
  get depths(): Record<QueuePriority, number> {
    return {
      now: this.queues.now.length,
      next: this.queues.next.length,
      later: this.queues.later.length,
    };
  }

  /**
   * Whether there are any items queued.
   */
  get isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Clear all items.
   */
  clear(): void {
    this.queues.now = [];
    this.queues.next = [];
    this.queues.later = [];
  }
}
