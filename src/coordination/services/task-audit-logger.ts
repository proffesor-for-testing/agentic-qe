/**
 * Agentic QE v3 - Task Audit Logger (SEC-003 Simplified)
 * Lightweight observability for task operations.
 *
 * This replaces the full authorization service with simple audit logging
 * for a local CLI tool where all agents are trusted.
 */

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
  private readonly entries: TaskAuditEntry[] = [];
  private readonly config: TaskAuditConfig;

  constructor(config: Partial<TaskAuditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
    const entry: TaskAuditEntry = {
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
      this.entries.splice(0, this.entries.length - this.config.maxEntries);
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
  getEntries(filter?: {
    operation?: TaskOperation;
    taskId?: string;
    agentId?: string;
    domain?: DomainName;
    fromTimestamp?: Date;
    toTimestamp?: Date;
    limit?: number;
  }): TaskAuditEntry[] {
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
    return result.slice(-limit);
  }

  /**
   * Get statistics about task operations
   */
  getStatistics(): {
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
