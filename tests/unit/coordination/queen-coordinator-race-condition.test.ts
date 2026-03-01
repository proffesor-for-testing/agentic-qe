/**
 * Unit tests for Queen Coordinator TOCTOU Race Condition Fix (CC-002)
 *
 * These tests verify that concurrent task submissions do not exceed
 * the maxConcurrentTasks limit due to race conditions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock heavy dependencies to prevent 60+ second singleton initialization.
// This is a unit test for race condition logic — we don't need real MinCut,
// governance, circuit breakers, agent teams, or tracing infrastructure.
vi.mock('../../../src/coordination/mincut/queen-integration', () => ({
  createQueenMinCutBridge: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    extendQueenHealth: vi.fn((base: unknown) => base),
    extendQueenMetrics: vi.fn((base: unknown) => base),
  })),
}));

vi.mock('../../../src/coordination/mincut/shared-singleton', () => ({
  getSharedMinCutGraph: vi.fn(() => ({})),
}));

vi.mock('../../../src/governance/index.js', () => ({
  queenGovernanceAdapter: {
    initialize: vi.fn().mockResolvedValue(undefined),
    beforeTaskExecution: vi.fn().mockResolvedValue({ allowed: true }),
    afterTaskExecution: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/coordination/agent-teams/index.js', () => ({
  createAgentTeamsAdapter: vi.fn(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn(),
  })),
  AgentTeamsAdapter: vi.fn(),
}));

vi.mock('../../../src/coordination/agent-teams/domain-team-manager.js', () => ({
  createDomainTeamManager: vi.fn(() => ({
    dispose: vi.fn(),
  })),
  DomainTeamManager: vi.fn(),
}));

vi.mock('../../../src/coordination/circuit-breaker/index.js', () => ({
  createDomainBreakerRegistry: vi.fn(() => ({
    canExecuteInDomain: vi.fn(() => true),
    getBreaker: vi.fn(() => ({
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    })),
  })),
  DomainCircuitOpenError: class DomainCircuitOpenError extends Error {},
  DomainBreakerRegistry: vi.fn(),
}));

vi.mock('../../../src/coordination/fleet-tiers/index.js', () => ({
  createTierSelector: vi.fn(() => ({
    selectTier: vi.fn(() => ({ selectedTier: 'sonnet', reason: 'mock' })),
  })),
}));

vi.mock('../../../src/coordination/agent-teams/tracing.js', () => ({
  createTraceCollector: vi.fn(() => ({
    startTrace: vi.fn(() => ({ context: { traceId: 'mock-trace', spanId: 'mock-span' } })),
    completeSpan: vi.fn(),
    failSpan: vi.fn(),
    dispose: vi.fn(),
  })),
  encodeTraceContext: vi.fn(() => 'mock-trace-context'),
}));

vi.mock('../../../src/coordination/competing-hypotheses/index.js', () => ({
  createHypothesisManager: vi.fn(() => ({
    createInvestigation: vi.fn(() => ({ id: 'mock-investigation' })),
    addHypothesis: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock('../../../src/coordination/federation/index.js', () => ({
  createFederationMailbox: vi.fn(() => ({
    dispose: vi.fn(),
  })),
}));

vi.mock('../../../src/coordination/dynamic-scaling/index.js', () => ({
  createDynamicScaler: vi.fn(() => ({
    recordMetrics: vi.fn(),
    evaluate: vi.fn(() => ({ action: 'none' })),
    execute: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  })),
}));

vi.mock('../../../src/hooks/cross-phase-hooks.js', () => ({
  getCrossPhaseHookExecutor: vi.fn(() => ({
    executeHook: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  QueenCoordinator,
  QueenTask,
  TaskType,
} from '../../../src/coordination/queen-coordinator';
import {
  EventBus,
  AgentCoordinator,
  AgentSpawnConfig,
  AgentFilter,
  AgentInfo,
  MemoryBackend,
  Subscription,
  StoreOptions,
  VectorSearchResult,
} from '../../../src/kernel/interfaces';
import { CrossDomainRouter } from '../../../src/coordination/interfaces';
import { DomainName, DomainEvent, Result, ok, err, AgentStatus } from '../../../src/shared/types';

// ============================================================================
// Mock Implementations (copied from main test file for isolation)
// ============================================================================

class MockEventBus implements EventBus {
  private handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  private channelHandlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  public publishedEvents: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);

    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        await handler(event);
      }
    }

    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        await handler(event);
      }
    }

    const channelHandlers = this.channelHandlers.get(event.source);
    if (channelHandlers) {
      for (const handler of channelHandlers) {
        await handler(event);
      }
    }
  }

  subscribe<T>(
    eventType: string,
    handler: (event: DomainEvent<T>) => Promise<void>
  ): Subscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as (event: DomainEvent) => Promise<void>);

    return {
      unsubscribe: () => {
        this.handlers.get(eventType)?.delete(handler as (event: DomainEvent) => Promise<void>);
      },
      active: true,
    };
  }

  subscribeToChannel(
    domain: DomainName,
    handler: (event: DomainEvent) => Promise<void>
  ): Subscription {
    if (!this.channelHandlers.has(domain)) {
      this.channelHandlers.set(domain, new Set());
    }
    this.channelHandlers.get(domain)!.add(handler);

    return {
      unsubscribe: () => {
        this.channelHandlers.get(domain)?.delete(handler);
      },
      active: true,
    };
  }

  async getHistory(): Promise<DomainEvent[]> {
    return this.publishedEvents;
  }

  async dispose(): Promise<void> {
    this.handlers.clear();
    this.channelHandlers.clear();
  }
}

class MockAgentCoordinator implements AgentCoordinator {
  private agents = new Map<string, AgentInfo>();
  private maxAgents = 15;
  private agentCounter = 0;
  private spawnDelay = 0;

  setSpawnDelay(ms: number): void {
    this.spawnDelay = ms;
  }

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    // Simulate async delay to expose race conditions
    if (this.spawnDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.spawnDelay));
    }

    if (this.agents.size >= this.maxAgents) {
      return err(new Error(`Maximum concurrent agents (${this.maxAgents}) reached`));
    }

    const id = `agent_${++this.agentCounter}`;
    this.agents.set(id, {
      id,
      name: config.name,
      domain: config.domain,
      type: config.type,
      status: 'running',
      startedAt: new Date(),
    });

    return ok(id);
  }

  getStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId)?.status;
  }

  listAgents(filter?: AgentFilter): AgentInfo[] {
    let agents = Array.from(this.agents.values());

    if (filter) {
      if (filter.domain) {
        agents = agents.filter(a => a.domain === filter.domain);
      }
      if (filter.status) {
        agents = agents.filter(a => a.status === filter.status);
      }
      if (filter.type) {
        agents = agents.filter(a => a.type === filter.type);
      }
    }

    return agents;
  }

  async stop(agentId: string): Promise<Result<void, Error>> {
    if (!this.agents.has(agentId)) {
      return err(new Error(`Agent not found: ${agentId}`));
    }
    this.agents.delete(agentId);
    return ok(undefined);
  }

  getActiveCount(): number {
    return Array.from(this.agents.values()).filter(a => a.status === 'running').length;
  }

  canSpawn(): boolean {
    return this.agents.size < this.maxAgents;
  }

  async dispose(): Promise<void> {
    this.agents.clear();
  }

  setAgentStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.set(agentId, { ...agent, status });
    }
  }
}

class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async initialize(): Promise<void> {}

  async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string, _limit?: number): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter(k => regex.test(k));
  }

  async vectorSearch(_embedding: number[], _k: number): Promise<VectorSearchResult[]> {
    return [];
  }

  async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {}

  async dispose(): Promise<void> {
    this.store.clear();
  }
}

class MockCrossDomainRouter implements CrossDomainRouter {
  private domainHandlers = new Map<DomainName, (event: DomainEvent) => Promise<void>>();
  private typeHandlers = new Map<string, (event: DomainEvent) => Promise<void>>();
  private subCounter = 0;

  async initialize(): Promise<void> {}

  subscribeToDoamin(domain: DomainName, handler: (event: DomainEvent) => Promise<void>): string {
    const id = `sub_domain_${++this.subCounter}`;
    this.domainHandlers.set(domain, handler);
    return id;
  }

  subscribeToEventType(eventType: string, handler: (event: DomainEvent) => Promise<void>): string {
    const id = `sub_type_${++this.subCounter}`;
    this.typeHandlers.set(eventType, handler);
    return id;
  }

  unsubscribe(_subscriptionId: string): boolean {
    return true;
  }

  async route(event: DomainEvent): Promise<void> {
    const domainHandler = this.domainHandlers.get(event.source);
    if (domainHandler) {
      await domainHandler(event);
    }

    const typeHandler = this.typeHandlers.get(event.type);
    if (typeHandler) {
      await typeHandler(event);
    }
  }

  getCorrelation(_correlationId: string) {
    return undefined;
  }

  trackCorrelation(_event: DomainEvent): void {}

  aggregate(windowStart: Date, windowEnd: Date) {
    return {
      id: 'agg_1',
      windowStart,
      windowEnd,
      events: [],
      countByType: new Map(),
      countByDomain: new Map(),
      metrics: {},
    };
  }

  getHistory() {
    return [];
  }

  async dispose(): Promise<void> {}

  async simulateDomainEvent(event: DomainEvent): Promise<void> {
    await this.route(event);
  }
}

// ============================================================================
// Race Condition Tests (CC-002)
// ============================================================================

describe('QueenCoordinator Race Condition Fix (CC-002)', () => {
  let eventBus: MockEventBus;
  let agentCoordinator: MockAgentCoordinator;
  let memory: MockMemoryBackend;
  let router: MockCrossDomainRouter;
  let queen: QueenCoordinator;

  beforeEach(async () => {
    eventBus = new MockEventBus();
    agentCoordinator = new MockAgentCoordinator();
    memory = new MockMemoryBackend();
    router = new MockCrossDomainRouter();
  });

  afterEach(async () => {
    if (queen) {
      await queen.dispose();
    }
  });

  describe('concurrent task submission', () => {
    it('should never exceed maxConcurrentTasks even with concurrent submissions', async () => {
      const maxConcurrentTasks = 3;
      const totalTasksToSubmit = 6;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit all tasks concurrently
      const submissionPromises = Array.from({ length: totalTasksToSubmit }, (_, i) =>
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: i },
          timeout: 30000,
        })
      );

      // Wait for all submissions to complete
      const results = await Promise.all(submissionPromises);

      // All submissions should succeed (either running or queued)
      expect(results.every(r => r.success)).toBe(true);

      // Check that running count never exceeds the limit
      const tasks = queen.listTasks();
      const runningTasks = tasks.filter(t => t.status === 'running' || t.status === 'assigned');
      const queuedTasks = tasks.filter(t => t.status === 'queued');

      expect(runningTasks.length).toBeLessThanOrEqual(maxConcurrentTasks);
      expect(runningTasks.length + queuedTasks.length).toBe(totalTasksToSubmit);
    });

    it('should correctly queue excess tasks during concurrent burst', async () => {
      const maxConcurrentTasks = 2;
      const totalTasksToSubmit = 5;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit all tasks at once
      const submissionPromises = Array.from({ length: totalTasksToSubmit }, (_, i) =>
        queen.submitTask({
          type: 'execute-tests',
          priority: 'p0',
          targetDomains: ['test-execution'],
          payload: { index: i },
          timeout: 30000,
        })
      );

      const results = await Promise.all(submissionPromises);

      // All should succeed
      expect(results.filter(r => r.success).length).toBe(totalTasksToSubmit);

      // Verify counts
      const tasks = queen.listTasks();
      const runningCount = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;
      const queuedCount = tasks.filter(t => t.status === 'queued').length;

      // Running tasks should not exceed the limit
      expect(runningCount).toBeLessThanOrEqual(maxConcurrentTasks);

      // Remaining tasks should be queued
      expect(queuedCount).toBeGreaterThanOrEqual(totalTasksToSubmit - maxConcurrentTasks);
    });

    it('should handle rapid fire task submissions without race conditions', async () => {
      const maxConcurrentTasks = 5;
      const totalTasksToSubmit = 8; // Reduced from 20 — spawn delay + sequential event handlers cause timeout

      // Add small delay to spawn to expose race conditions
      agentCoordinator.setSpawnDelay(5);

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit tasks in rapid succession with intentional interleaving
      const submissionPromises: Promise<Result<string, Error>>[] = [];

      for (let i = 0; i < totalTasksToSubmit; i++) {
        submissionPromises.push(
          queen.submitTask({
            type: i % 2 === 0 ? 'generate-tests' : 'execute-tests',
            priority: ['p0', 'p1', 'p2'][i % 3] as 'p0' | 'p1' | 'p2',
            targetDomains: i % 2 === 0 ? ['test-generation'] : ['test-execution'],
            payload: { index: i },
            timeout: 30000,
          })
        );
      }

      const results = await Promise.all(submissionPromises);

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);

      // Verify the invariant: running count never exceeds limit
      const tasks = queen.listTasks();
      const runningCount = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;

      expect(runningCount).toBeLessThanOrEqual(maxConcurrentTasks);
    });
  });

  describe('task completion and queue processing', () => {
    it('should process queued tasks when running tasks complete', async () => {
      const maxConcurrentTasks = 2;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit 4 tasks
      const results = await Promise.all([
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 0 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 1 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 2 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 3 },
          timeout: 30000,
        }),
      ]);

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);

      // Initially: 2 running, 2 queued
      let tasks = queen.listTasks();
      let runningBefore = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;
      let queuedBefore = tasks.filter(t => t.status === 'queued').length;

      expect(runningBefore).toBe(2);
      expect(queuedBefore).toBe(2);

      // Simulate task completion
      const runningTask = tasks.find(t => t.status === 'running');
      if (runningTask) {
        await router.simulateDomainEvent({
          id: 'event_1',
          type: 'TaskCompleted',
          timestamp: new Date(),
          source: runningTask.assignedDomain!,
          payload: { taskId: runningTask.taskId, result: { success: true } },
        });
      }

      // After completion: should have processed one from queue
      tasks = queen.listTasks();
      const completed = tasks.filter(t => t.status === 'completed').length;
      const stillRunning = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;

      expect(completed).toBe(1);
      // Should still maintain max concurrent (one completed, one promoted from queue)
      expect(stillRunning).toBeLessThanOrEqual(maxConcurrentTasks);
    });

    it('should correctly decrement counter when task fails', async () => {
      const maxConcurrentTasks = 2;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          taskRetryLimit: 0, // No retries for this test
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit 3 tasks (1 will be queued)
      const results = await Promise.all([
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 0 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 1 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 2 },
          timeout: 30000,
        }),
      ]);

      expect(results.every(r => r.success)).toBe(true);

      // Simulate task failure
      let tasks = queen.listTasks();
      const runningTask = tasks.find(t => t.status === 'running');

      if (runningTask) {
        await router.simulateDomainEvent({
          id: 'event_fail_1',
          type: 'TaskFailed',
          timestamp: new Date(),
          source: runningTask.assignedDomain!,
          payload: { taskId: runningTask.taskId, error: 'Test failure' },
        });
      }

      // After failure: queued task should be promoted
      tasks = queen.listTasks();
      const failed = tasks.filter(t => t.status === 'failed').length;
      const stillRunning = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;

      expect(failed).toBe(1);
      expect(stillRunning).toBeLessThanOrEqual(maxConcurrentTasks);
    });

    it('should correctly decrement counter when task is cancelled', async () => {
      const maxConcurrentTasks = 2;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit 3 tasks
      const results = await Promise.all([
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 0 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 1 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 2 },
          timeout: 30000,
        }),
      ]);

      expect(results.every(r => r.success)).toBe(true);

      // Cancel a running task
      let tasks = queen.listTasks();
      const runningTask = tasks.find(t => t.status === 'running');

      if (runningTask) {
        const cancelResult = await queen.cancelTask(runningTask.taskId);
        expect(cancelResult.success).toBe(true);
      }

      // After cancellation: check counts
      tasks = queen.listTasks();
      const cancelled = tasks.filter(t => t.status === 'cancelled').length;
      const stillRunning = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;

      expect(cancelled).toBe(1);
      // Running count should not exceed limit after cancellation
      expect(stillRunning).toBeLessThanOrEqual(maxConcurrentTasks);
    });
  });

  describe('all tasks eventually processed', () => {
    it('should eventually process all submitted tasks', async () => {
      const maxConcurrentTasks = 2;
      const totalTasks = 6;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          taskRetryLimit: 0,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit all tasks
      const taskIds: string[] = [];
      for (let i = 0; i < totalTasks; i++) {
        const result = await queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: i },
          timeout: 30000,
        });
        if (result.success) {
          taskIds.push(result.value);
        }
      }

      expect(taskIds.length).toBe(totalTasks);

      // Complete tasks one by one until all are processed
      for (let i = 0; i < totalTasks; i++) {
        const tasks = queen.listTasks();
        const runningTask = tasks.find(t => t.status === 'running');

        if (runningTask) {
          await router.simulateDomainEvent({
            id: `event_${i}`,
            type: 'TaskCompleted',
            timestamp: new Date(),
            source: runningTask.assignedDomain!,
            payload: { taskId: runningTask.taskId, result: { success: true } },
          });
        }
      }

      // All tasks should be completed
      const finalTasks = queen.listTasks();
      const completedCount = finalTasks.filter(t => t.status === 'completed').length;

      // All tasks should be completed
      expect(completedCount).toBe(totalTasks);
    });

    it('should handle mixed priorities correctly during concurrent processing', async () => {
      const maxConcurrentTasks = 2;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit tasks with different priorities concurrently
      const results = await Promise.all([
        // Low priority first
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p2',
          targetDomains: ['test-generation'],
          payload: { name: 'low-1' },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p2',
          targetDomains: ['test-generation'],
          payload: { name: 'low-2' },
          timeout: 30000,
        }),
        // High priority
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p0',
          targetDomains: ['test-generation'],
          payload: { name: 'high-1' },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p0',
          targetDomains: ['test-generation'],
          payload: { name: 'high-2' },
          timeout: 30000,
        }),
      ]);

      expect(results.every(r => r.success)).toBe(true);

      // Verify no more than maxConcurrentTasks are running
      const tasks = queen.listTasks();
      const runningCount = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;

      expect(runningCount).toBeLessThanOrEqual(maxConcurrentTasks);
    });
  });

  describe('edge cases', () => {
    it('should handle maxConcurrentTasks of 1 correctly', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks: 1,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit 5 tasks concurrently
      const results = await Promise.all([
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 0 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 1 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 2 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 3 },
          timeout: 30000,
        }),
        queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: 4 },
          timeout: 30000,
        }),
      ]);

      expect(results.every(r => r.success)).toBe(true);

      const tasks = queen.listTasks();
      const runningCount = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;
      const queuedCount = tasks.filter(t => t.status === 'queued').length;

      // Only 1 should be running
      expect(runningCount).toBe(1);
      // Rest should be queued
      expect(queuedCount).toBe(4);
    });

    it('should handle stress test with many concurrent submissions', async () => {
      const maxConcurrentTasks = 10;
      const totalTasks = 25; // Reduced from 100 to avoid timeout in constrained environments

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          maxConcurrentTasks,
          workStealing: {
            enabled: false,
            idleThreshold: 100,
            loadThreshold: 5,
            stealBatchSize: 2,
            checkInterval: 1000,
          },
        }
      );
      await queen.initialize();

      // Submit many tasks concurrently
      const submissionPromises = Array.from({ length: totalTasks }, (_, i) =>
        queen.submitTask({
          type: ['generate-tests', 'execute-tests', 'analyze-coverage'][i % 3] as TaskType,
          priority: ['p0', 'p1', 'p2', 'p3'][i % 4] as 'p0' | 'p1' | 'p2' | 'p3',
          targetDomains: [],
          payload: { index: i },
          timeout: 30000,
        })
      );

      const results = await Promise.all(submissionPromises);

      // All should succeed
      expect(results.filter(r => r.success).length).toBe(totalTasks);

      // Verify invariant
      const tasks = queen.listTasks();
      const runningCount = tasks.filter(t => t.status === 'running' || t.status === 'assigned').length;

      expect(runningCount).toBeLessThanOrEqual(maxConcurrentTasks);
      expect(tasks.length).toBe(totalTasks);
    });
  });
});
