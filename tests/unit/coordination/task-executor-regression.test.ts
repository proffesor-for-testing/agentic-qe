/**
 * Regression tests for TaskExecutor — ADR-083 coherence gate & reasoning QEC paths
 *
 * Validates that the new advisory paths (coherence-action-gate, reasoning-qec)
 * added in the march-fixes-and-improvements branch do not break existing
 * task execution, and that they run in advisory (non-blocking) mode.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DomainTaskExecutor,
  createTaskExecutor,
} from '../../../src/coordination/task-executor';
import type { QueenTask } from '../../../src/coordination/queen-coordinator';
import type { QEKernel, EventBus, MemoryBackend, Subscription, StoreOptions, AgentCoordinator, AgentSpawnConfig, AgentFilter, AgentInfo, VectorSearchResult } from '../../../src/kernel/interfaces';
import type { DomainEvent, DomainName, AgentStatus } from '../../../src/shared/types';

// CQ-005: Side-effect imports for domain registration
import '../../../src/domains/test-generation';
import '../../../src/domains/coverage-analysis';
import '../../../src/domains/security-compliance';
import '../../../src/domains/code-intelligence';
import '../../../src/domains/quality-assessment';

// ============================================================================
// Mocks
// ============================================================================

class MockEventBus implements EventBus {
  public publishedEvents: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe<T>(_eventType: string, _handler: (event: DomainEvent<T>) => Promise<void>): Subscription {
    return { unsubscribe: () => {}, active: true };
  }

  subscribeToChannel(_domain: DomainName, _handler: (event: DomainEvent) => Promise<void>): Subscription {
    return { unsubscribe: () => {}, active: true };
  }

  async getHistory(): Promise<DomainEvent[]> { return this.publishedEvents; }
  async dispose(): Promise<void> { this.publishedEvents = []; }
}

class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();
  async initialize(): Promise<void> {}
  async set<T>(key: string, value: T, _opts?: StoreOptions): Promise<void> { this.store.set(key, value); }
  async get<T>(key: string): Promise<T | null> { return (this.store.get(key) as T) ?? null; }
  async delete(key: string): Promise<void> { this.store.delete(key); }
  async has(key: string): Promise<boolean> { return this.store.has(key); }
  async keys(): Promise<string[]> { return Array.from(this.store.keys()); }
  async search(pattern: string, _limit?: number): Promise<string[]> {
    const re = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter(k => re.test(k));
  }
  async clear(): Promise<void> { this.store.clear(); }
  async size(): Promise<number> { return this.store.size; }
  async close(): Promise<void> {}
  getState() { return { type: 'memory' as const, ready: true }; }

  // Vector search stubs
  async vectorSearch(_query: number[], _options?: { limit?: number; threshold?: number }): Promise<VectorSearchResult[]> { return []; }
  async vectorStore(_key: string, _vector: number[], _metadata?: Record<string, unknown>): Promise<void> {}

  // Namespace support
  createNamespace(ns: string): MemoryBackend { return this; }
}

function createMockKernel(): QEKernel {
  const memory = new MockMemoryBackend();
  const eventBus = new MockEventBus();
  return {
    memory,
    eventBus,
    config: {} as unknown,
    agents: {
      spawn: vi.fn(),
      terminate: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
    } as unknown as AgentCoordinator,
    initialize: vi.fn(),
    dispose: vi.fn(),
  } as unknown as QEKernel;
}

function createTestTask(overrides: Partial<QueenTask> = {}): QueenTask {
  return {
    id: `task-${Date.now()}`,
    type: 'generate-tests',
    payload: {
      codeContext: 'function add(a, b) { return a + b; }',
      language: 'typescript',
      framework: 'vitest',
    },
    priority: 5,
    targetDomains: ['test-generation'],
    timeout: 30000,
    status: 'pending',
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('TaskExecutor — Regression: coherence gate & reasoning QEC', () => {
  let kernel: QEKernel;
  let executor: DomainTaskExecutor;

  beforeEach(() => {
    kernel = createMockKernel();
    executor = createTaskExecutor(kernel, {
      timeout: 5000,
      maxRetries: 1,
      enableCaching: false,
      saveResults: false,
      resultsDir: '/tmp/aqe-regression-test',
      defaultLanguage: 'typescript',
      defaultFramework: 'vitest',
    });
  });

  it('should execute tasks without coherence gate blocking (advisory mode)', async () => {
    const task = createTestTask();
    const result = await executor.execute(task);

    // The coherence gate runs in advisory mode — it should never block
    expect(result).toBeDefined();
    expect(result.taskId).toBe(task.id);
    expect(result.domain).toBe('test-generation');
    // Task may succeed or fail depending on domain service resolution,
    // but the coherence gate must NOT throw
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should execute tasks with reasoning steps without QEC blocking', async () => {
    const task = createTestTask({
      payload: {
        codeContext: 'function multiply(a, b) { return a * b; }',
        language: 'typescript',
        framework: 'vitest',
        reasoningSteps: [
          'Analyze the function signature',
          'Identify edge cases (zero, negative, overflow)',
          'Generate test cases for each edge case',
        ],
        confidence: 0.8,
        riskLevel: 'low',
      },
    });

    const result = await executor.execute(task);
    // Even with reasoning steps, QEC should be advisory and not block
    expect(result).toBeDefined();
    expect(result.taskId).toBe(task.id);
    expect(typeof result.duration).toBe('number');
  });

  it('should handle high-risk tasks without coherence gate crash', async () => {
    const task = createTestTask({
      payload: {
        codeContext: 'function deleteAll() { db.drop(); }',
        confidence: 0.3,
        riskLevel: 'critical',
      },
    });

    const result = await executor.execute(task);
    // Even critical risk should not crash — advisory mode
    expect(result).toBeDefined();
    expect(result.taskId).toBe(task.id);
  });

  it('should reset coherence gate on resetServiceCaches', async () => {
    // Execute a task to initialize the gate
    const task = createTestTask();
    await executor.execute(task);

    // Reset caches — should not throw
    await executor.resetServiceCaches();

    // Execute another task — gate should be re-created lazily
    const task2 = createTestTask({ id: 'task-2' });
    const result = await executor.execute(task2);
    expect(result).toBeDefined();
    expect(result.taskId).toBe('task-2');
  });

  it('should reset coherence gate on sync reset', () => {
    // Sync reset should not throw
    expect(() => executor.resetServiceCachesSync()).not.toThrow();
  });
});
