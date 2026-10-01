/**
 * Agentic QE v3 - Task Audit Logger (SEC-003 Simplified)
 * Lightweight observability for task operations.
 *
 * This replaces the full authorization service with simple audit logging
 * for a local CLI tool where all agents are trusted.
 */

import { randomUUID } from 'node:crypto';
import { DomainName } from '../../shared/types';

/**
 * Task operation types for audit logging
 */
export type TaskOperation =
  | 'submit'
  | 'assign'
  | 'reassign'
  | 'complete'
  | 'fail'
  | 'cancel'
  | 'steal'
  | 'queue'
  | 'dequeue';

/**
 * Audit log entry for task operations
 */
export interface TaskAuditEntry {
  readonly timestamp: Date;
  readonly operation: TaskOperation;
  readonly taskId: string;
  readonly agentId?: string;
  readonly domain?: DomainName;
  readonly details?: Record<string, unknown>;
}

/** An entry produced by this logger, positioned within its generation. */
export interface TaskAuditSequencedEntry extends TaskAuditEntry {
  readonly sequence: number;
}

/** Filters select retained entries; they do not change retention metadata. */
export interface TaskAuditFilter {
  operation?: TaskOperation;
  taskId?: string;
  agentId?: string;
  domain?: DomainName;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  limit?: number;
}

/** Completeness of the bounded observation window since construction/clear. */
export interface TaskAuditWindow {
  generation: string;
  recordedEntries: number;
  retainedEntries: number;
  droppedEntries: number;
  firstRetainedSequence: number | null;
  lastRetainedSequence: number | null;
  disposition: 'complete' | 'truncated';
}

/** Filtered entries with metadata for the entire retained window. */
export interface TaskAuditSnapshot extends TaskAuditWindow {
  entries: TaskAuditSequencedEntry[];
}

/**
 * Configuration for task audit logger
 */
export interface TaskAuditConfig {
  /** Enable console logging */
  enableConsoleLog: boolean;
  /** Maximum entries to keep in memory */
  maxEntries: number;
  /** Log prefix for console output */
  logPrefix: string;
}

const DEFAULT_CONFIG: TaskAuditConfig = {
  enableConsoleLog: true,
  maxEntries: 1000,
  logPrefix: '[TASK]',
};

/**
 * Lightweight Task Audit Logger
 *
 * Provides observability for task operations without authorization overhead.
 * Useful for debugging, monitoring, and understanding task flow.
 */
export class TaskAuditLogger {
  private readonly entries: TaskAuditSequencedEntry[] = [];
  private readonly config: TaskAuditConfig;
  private generation = randomUUID();
  private recordedEntries = 0;
  private droppedEntries = 0;

  constructor(config: Partial<TaskAuditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!Number.isSafeInteger(this.config.maxEntries) || this.config.maxEntries < 0) {
      throw new RangeError('maxEntries must be a non-negative safe integer');
    }
  }

  /**
   * Log a task operation
   */
  log(
    operation: TaskOperation,
    taskId: string,
    options?: {
      agentId?: string;
      domain?: DomainName;
      details?: Record<string, unknown>;
    }
  ): void {
    const entry: TaskAuditSequencedEntry = {
      sequence: ++this.recordedEntries,
      timestamp: new Date(),
      operation,
      taskId,
      agentId: options?.agentId,
      domain: options?.domain,
      details: options?.details,
    };

    this.entries.push(entry);

    // Trim if exceeds max
    if (this.entries.length > this.config.maxEntries) {
      const dropped = this.entries.length - this.config.maxEntries;
      this.entries.splice(0, dropped);
      this.droppedEntries += dropped;
    }

    // Console log if enabled
    if (this.config.enableConsoleLog) {
      const agent = options?.agentId ? ` by ${options.agentId}` : '';
      const domain = options?.domain ? ` (${options.domain})` : '';
      console.log(`${this.config.logPrefix} ${operation.toUpperCase()} ${taskId}${agent}${domain}`);
    }
  }

  /**
   * Convenience methods for common operations
   */
  logSubmit(taskId: string, details?: Record<string, unknown>): void {
    this.log('submit', taskId, { details });
  }

  logAssign(taskId: string, agentId: string, domain: DomainName): void {
    this.log('assign', taskId, { agentId, domain });
  }

  logReassign(taskId: string, fromAgent: string, toAgent: string, domain: DomainName): void {
    this.log('reassign', taskId, { agentId: toAgent, domain, details: { fromAgent } });
  }

  logComplete(taskId: string, agentId?: string): void {
    this.log('complete', taskId, { agentId });
  }

  logFail(taskId: string, agentId?: string, error?: string): void {
    this.log('fail', taskId, { agentId, details: error ? { error } : undefined });
  }

  logCancel(taskId: string): void {
    this.log('cancel', taskId);
  }

  logSteal(taskId: string, fromDomain: DomainName, toDomain: DomainName): void {
    this.log('steal', taskId, { domain: toDomain, details: { fromDomain } });
  }

  logQueue(taskId: string, position: number): void {
    this.log('queue', taskId, { details: { position } });
  }

  logDequeue(taskId: string): void {
    this.log('dequeue', taskId);
  }

  /**
   * Get audit entries with optional filtering
   */
  getEntries(filter?: TaskAuditFilter): TaskAuditSequencedEntry[] {
    let result = [...this.entries];

    if (filter) {
      if (filter.operation) {
        result = result.filter(e => e.operation === filter.operation);
      }
      if (filter.taskId) {
        result = result.filter(e => e.taskId === filter.taskId);
      }
      if (filter.agentId) {
        result = result.filter(e => e.agentId === filter.agentId);
      }
      if (filter.domain) {
        result = result.filter(e => e.domain === filter.domain);
      }
      if (filter.fromTimestamp) {
        result = result.filter(e => e.timestamp >= filter.fromTimestamp!);
      }
      if (filter.toTimestamp) {
        result = result.filter(e => e.timestamp <= filter.toTimestamp!);
      }
    }

    const limit = filter?.limit ?? result.length;
    return limit === 0 ? [] : result.slice(-limit);
  }

  /** Get selected entries without losing evidence of earlier evictions/resets. */
  getSnapshot(filter?: TaskAuditFilter): TaskAuditSnapshot {
    return { ...this.getWindow(), entries: this.getEntries(filter) };
  }

  private getWindow(): TaskAuditWindow {
    return {
      generation: this.generation,
      recordedEntries: this.recordedEntries,
      retainedEntries: this.entries.length,
      droppedEntries: this.droppedEntries,
      firstRetainedSequence: this.entries[0]?.sequence ?? null,
      lastRetainedSequence: this.entries[this.entries.length - 1]?.sequence ?? null,
      disposition: this.droppedEntries > 0 ? 'truncated' : 'complete',
    };
  }

  /** Get counts for the retained window, with its completeness metadata. */
  getStatistics(): TaskAuditWindow & {
    basis: 'retained-window';
    totalEntries: number;
    operationCounts: Record<TaskOperation, number>;
    taskCount: number;
    agentCount: number;
  } {
    const operationCounts: Record<TaskOperation, number> = {
      submit: 0,
      assign: 0,
      reassign: 0,
      complete: 0,
      fail: 0,
      cancel: 0,
      steal: 0,
      queue: 0,
      dequeue: 0,
    };

    const taskIds = new Set<string>();
    const agentIds = new Set<string>();

    for (const entry of this.entries) {
      operationCounts[entry.operation]++;
      taskIds.add(entry.taskId);
      if (entry.agentId) {
        agentIds.add(entry.agentId);
      }
    }

    return {
      ...this.getWindow(),
      basis: 'retained-window',
      totalEntries: this.entries.length,
      operationCounts,
      taskCount: taskIds.size,
      agentCount: agentIds.size,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.length = 0;
    this.generation = randomUUID();
    this.recordedEntries = 0;
    this.droppedEntries = 0;
  }
}

/**
 * Factory function to create a TaskAuditLogger
 */
export function createTaskAuditLogger(
  config?: Partial<TaskAuditConfig>
): TaskAuditLogger {
  return new TaskAuditLogger(config);
}
