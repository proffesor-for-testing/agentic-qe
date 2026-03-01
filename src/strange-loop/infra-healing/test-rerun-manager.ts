/**
 * Test Re-Run Manager
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Tracks which tests were affected by infrastructure failures and provides
 * a re-run queue per service. After successful recovery, the coordinator
 * can pull the affected test IDs and re-execute them.
 */

// ============================================================================
// Interface
// ============================================================================

/**
 * Manages a queue of test IDs affected by infrastructure failures.
 * After recovery, callers retrieve the queue and re-run those tests.
 */
export interface ITestRerunManager {
  /** Record tests that failed due to infra issues for a given service */
  recordAffectedTests(serviceName: string, testIds: readonly string[]): void;
  /** Get tests that should be re-run after service recovery */
  getTestsToRerun(serviceName: string): readonly string[];
  /** Clear recorded tests after successful re-run */
  clearRerunQueue(serviceName: string): void;
  /** Check if there are tests waiting for re-run across any service */
  hasPendingReruns(): boolean;
  /** Get all services with pending re-runs */
  getServicesWithPendingReruns(): readonly string[];
  /** Get total count of tests awaiting re-run */
  getPendingRerunCount(): number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * In-memory implementation of ITestRerunManager.
 * Thread-safe within a single Node.js event loop (no concurrent mutation).
 */
export class TestRerunManager implements ITestRerunManager {
  private readonly queues = new Map<string, Set<string>>();

  recordAffectedTests(serviceName: string, testIds: readonly string[]): void {
    if (testIds.length === 0) return;

    let queue = this.queues.get(serviceName);
    if (!queue) {
      queue = new Set<string>();
      this.queues.set(serviceName, queue);
    }

    for (const id of testIds) {
      queue.add(id);
    }
  }

  getTestsToRerun(serviceName: string): readonly string[] {
    const queue = this.queues.get(serviceName);
    if (!queue || queue.size === 0) return [];
    return [...queue];
  }

  clearRerunQueue(serviceName: string): void {
    this.queues.delete(serviceName);
  }

  hasPendingReruns(): boolean {
    for (const queue of this.queues.values()) {
      if (queue.size > 0) return true;
    }
    return false;
  }

  getServicesWithPendingReruns(): readonly string[] {
    const services: string[] = [];
    for (const [service, queue] of this.queues) {
      if (queue.size > 0) {
        services.push(service);
      }
    }
    return services;
  }

  getPendingRerunCount(): number {
    let count = 0;
    for (const queue of this.queues.values()) {
      count += queue.size;
    }
    return count;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new TestRerunManager instance.
 */
export function createTestRerunManager(): TestRerunManager {
  return new TestRerunManager();
}
