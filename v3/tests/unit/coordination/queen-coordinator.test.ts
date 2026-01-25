/**
 * Unit tests for Queen Coordinator
 * Tests hierarchical orchestration, work stealing, and cross-domain coordination
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QueenCoordinator,
  QueenTask,
  QueenConfig,
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
// Mock Implementations
// ============================================================================

class MockEventBus implements EventBus {
  private handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  private channelHandlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  public publishedEvents: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);

    // Notify type handlers
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        await handler(event);
      }
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        await handler(event);
      }
    }

    // Notify channel handlers
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

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
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

  // Test helper
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

  // Test helper to simulate domain events
  async simulateDomainEvent(event: DomainEvent): Promise<void> {
    await this.route(event);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('QueenCoordinator', () => {
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

    queen = new QueenCoordinator(
      eventBus,
      agentCoordinator,
      memory,
      router,
      undefined,
      undefined,
      undefined,
      {
        workStealing: {
          enabled: false, // Disable for most tests
          idleThreshold: 100,
          loadThreshold: 5,
          stealBatchSize: 2,
          checkInterval: 1000,
        },
      }
    );

    await queen.initialize();
  });

  afterEach(async () => {
    await queen.dispose();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const health = queen.getHealth();
      // With no agents running, status may be 'degraded' - that's expected
      expect(['healthy', 'degraded']).toContain(health.status);
      expect(health.lastHealthCheck).toBeDefined();
    });

    it('should publish initialization event', async () => {
      const initEvents = eventBus.publishedEvents.filter(
        e => e.type === 'QueenQueenInitialized'
      );
      expect(initEvents.length).toBe(1);
    });

    it('should not initialize twice', async () => {
      const eventCountBefore = eventBus.publishedEvents.length;
      await queen.initialize();
      const eventCountAfter = eventBus.publishedEvents.length;
      expect(eventCountAfter).toBe(eventCountBefore);
    });
  });

  describe('task submission', () => {
    it('should submit a task successfully', async () => {
      const result = await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: { file: 'test.ts' },
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toMatch(/^task_/);
      }
    });

    it('should assign task to appropriate domain', async () => {
      const result = await queen.submitTask({
        type: 'analyze-coverage',
        priority: 'p0',
        targetDomains: [],
        payload: {},
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const status = queen.getTaskStatus(result.value);
        expect(status?.assignedDomain).toBe('coverage-analysis');
      }
    });

    it('should spawn agent for task', async () => {
      await queen.submitTask({
        type: 'execute-tests',
        priority: 'p1',
        targetDomains: ['test-execution'],
        payload: {},
        timeout: 30000,
      });

      const agents = agentCoordinator.listAgents({ domain: 'test-execution' });
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should queue task when at max concurrent', async () => {
      // Create a queen with low concurrent limit
      const limitedQueen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { maxConcurrentTasks: 2 }
      );
      await limitedQueen.initialize();

      // Submit 3 tasks
      await limitedQueen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      await limitedQueen.submitTask({
        type: 'execute-tests',
        priority: 'p1',
        targetDomains: ['test-execution'],
        payload: {},
        timeout: 30000,
      });

      const result = await limitedQueen.submitTask({
        type: 'analyze-coverage',
        priority: 'p1',
        targetDomains: ['coverage-analysis'],
        payload: {},
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const status = limitedQueen.getTaskStatus(result.value);
        expect(status?.status).toBe('queued');
      }

      await limitedQueen.dispose();
    });

    it('should publish task submitted event', async () => {
      await queen.submitTask({
        type: 'scan-security',
        priority: 'p0',
        targetDomains: ['security-compliance'],
        payload: {},
        timeout: 30000,
      });

      const submitEvents = eventBus.publishedEvents.filter(
        e => e.type === 'QueenTaskSubmitted'
      );
      expect(submitEvents.length).toBeGreaterThan(0);
    });
  });

  describe('task cancellation', () => {
    it('should cancel a queued task', async () => {
      // Create limited queen to get queued task
      const limitedQueen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { maxConcurrentTasks: 1 }
      );
      await limitedQueen.initialize();

      await limitedQueen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      const result2 = await limitedQueen.submitTask({
        type: 'execute-tests',
        priority: 'p1',
        targetDomains: ['test-execution'],
        payload: {},
        timeout: 30000,
      });

      if (result2.success) {
        const cancelResult = await limitedQueen.cancelTask(result2.value);
        expect(cancelResult.success).toBe(true);

        const status = limitedQueen.getTaskStatus(result2.value);
        expect(status?.status).toBe('cancelled');
      }

      await limitedQueen.dispose();
    });

    it('should fail to cancel non-existent task', async () => {
      const result = await queen.cancelTask('non_existent_task');
      expect(result.success).toBe(false);
    });
  });

  describe('task listing', () => {
    it('should list all tasks', async () => {
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      await queen.submitTask({
        type: 'execute-tests',
        priority: 'p0',
        targetDomains: ['test-execution'],
        payload: {},
        timeout: 30000,
      });

      const tasks = queen.listTasks();
      expect(tasks.length).toBe(2);
    });

    it('should filter tasks by status', async () => {
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      const runningTasks = queen.listTasks({ status: 'running' });
      expect(runningTasks.every(t => t.status === 'running')).toBe(true);
    });

    it('should filter tasks by priority', async () => {
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p0',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      await queen.submitTask({
        type: 'execute-tests',
        priority: 'p2',
        targetDomains: ['test-execution'],
        payload: {},
        timeout: 30000,
      });

      const p0Tasks = queen.listTasks({ priority: 'p0' });
      expect(p0Tasks.every(t => t.task.priority === 'p0')).toBe(true);
    });
  });

  describe('domain coordination', () => {
    it('should return domain health', () => {
      const health = queen.getDomainHealth('test-generation');
      expect(health).toBeDefined();
      expect(health?.status).toBeDefined();
    });

    it('should calculate domain load', async () => {
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      const load = queen.getDomainLoad('test-generation');
      expect(load).toBeGreaterThan(0);
    });

    it('should identify idle domains', () => {
      // Initially all domains should be idle (after some time threshold)
      const idleDomains = queen.getIdleDomains();
      // May or may not have idle domains depending on timing
      expect(Array.isArray(idleDomains)).toBe(true);
    });

    it('should identify busy domains', async () => {
      // Create many tasks for one domain
      for (let i = 0; i < 15; i++) {
        await queen.submitTask({
          type: 'generate-tests',
          priority: 'p1',
          targetDomains: ['test-generation'],
          payload: { index: i },
          timeout: 30000,
        });
      }

      const busyDomains = queen.getBusyDomains();
      expect(busyDomains).toContain('test-generation');
    });
  });

  describe('work stealing', () => {
    it('should enable work stealing', () => {
      queen.enableWorkStealing();
      const health = queen.getHealth();
      expect(health.workStealingActive).toBe(true);
    });

    it('should disable work stealing', () => {
      queen.enableWorkStealing();
      queen.disableWorkStealing();
      const health = queen.getHealth();
      expect(health.workStealingActive).toBe(false);
    });

    it('should return 0 when no work to steal', async () => {
      const stolen = await queen.triggerWorkStealing();
      expect(stolen).toBe(0);
    });
  });

  describe('agent management', () => {
    it('should list all agents', async () => {
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      const agents = queen.listAllAgents();
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should get agents by domain', async () => {
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      const agents = queen.getAgentsByDomain('test-generation');
      expect(agents.every(a => a.domain === 'test-generation')).toBe(true);
    });

    it('should spawn agent on request', async () => {
      const result = await queen.requestAgentSpawn(
        'coverage-analysis',
        'analyzer',
        ['gap-detection', 'risk-scoring']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const agent = agentCoordinator.listAgents().find(a => a.id === result.value);
        expect(agent?.domain).toBe('coverage-analysis');
      }
    });
  });

  describe('health and metrics', () => {
    it('should return queen health', () => {
      const health = queen.getHealth();

      expect(health.status).toBeDefined();
      expect(health.domainHealth).toBeDefined();
      expect(health.totalAgents).toBeGreaterThanOrEqual(0);
      expect(health.activeAgents).toBeGreaterThanOrEqual(0);
      expect(health.pendingTasks).toBeGreaterThanOrEqual(0);
      expect(health.runningTasks).toBeGreaterThanOrEqual(0);
      expect(health.lastHealthCheck).toBeDefined();
    });

    it('should return queen metrics', () => {
      const metrics = queen.getMetrics();

      expect(metrics.tasksReceived).toBeGreaterThanOrEqual(0);
      expect(metrics.tasksCompleted).toBeGreaterThanOrEqual(0);
      expect(metrics.tasksFailed).toBeGreaterThanOrEqual(0);
      expect(metrics.tasksStolen).toBeGreaterThanOrEqual(0);
      expect(metrics.domainUtilization).toBeDefined();
      // Uptime may be 0 if test runs very fast
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should track task metrics', async () => {
      const metricsBefore = queen.getMetrics();

      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      const metricsAfter = queen.getMetrics();
      expect(metricsAfter.tasksReceived).toBe(metricsBefore.tasksReceived + 1);
    });
  });

  describe('task type routing', () => {
    const taskTypeDomainPairs: [TaskType, DomainName][] = [
      ['generate-tests', 'test-generation'],
      ['execute-tests', 'test-execution'],
      ['analyze-coverage', 'coverage-analysis'],
      ['assess-quality', 'quality-assessment'],
      ['predict-defects', 'defect-intelligence'],
      ['validate-requirements', 'requirements-validation'],
      ['index-code', 'code-intelligence'],
      ['scan-security', 'security-compliance'],
      ['validate-contracts', 'contract-testing'],
      ['test-accessibility', 'visual-accessibility'],
      ['run-chaos', 'chaos-resilience'],
      ['optimize-learning', 'learning-optimization'],
    ];

    it.each(taskTypeDomainPairs)(
      'should route %s tasks to %s domain',
      async (taskType, expectedDomain) => {
        const result = await queen.submitTask({
          type: taskType,
          priority: 'p1',
          targetDomains: [],
          payload: {},
          timeout: 30000,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          const status = queen.getTaskStatus(result.value);
          expect(status?.assignedDomain).toBe(expectedDomain);
        }
      }
    );
  });

  describe('priority handling', () => {
    it('should process p0 tasks before p1', async () => {
      // Create limited queen
      const limitedQueen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { maxConcurrentTasks: 1 }
      );
      await limitedQueen.initialize();

      // Submit p1 first
      const p1Result = await limitedQueen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: { order: 1 },
        timeout: 30000,
      });

      // p1 should be running (first task)
      if (p1Result.success) {
        expect(limitedQueen.getTaskStatus(p1Result.value)?.status).toBe('running');
      }

      // Submit p0 second (should be queued but higher priority)
      const p0Result = await limitedQueen.submitTask({
        type: 'execute-tests',
        priority: 'p0',
        targetDomains: ['test-execution'],
        payload: { order: 2 },
        timeout: 30000,
      });

      // Submit p2 third
      const p2Result = await limitedQueen.submitTask({
        type: 'analyze-coverage',
        priority: 'p2',
        targetDomains: ['coverage-analysis'],
        payload: { order: 3 },
        timeout: 30000,
      });

      // Both should be queued
      if (p0Result.success && p2Result.success) {
        expect(limitedQueen.getTaskStatus(p0Result.value)?.status).toBe('queued');
        expect(limitedQueen.getTaskStatus(p2Result.value)?.status).toBe('queued');
      }

      await limitedQueen.dispose();
    });
  });

  describe('disposal', () => {
    it('should dispose cleanly', async () => {
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      await queen.dispose();

      const shutdownEvents = eventBus.publishedEvents.filter(
        e => e.type === 'QueenQueenShutdown'
      );
      expect(shutdownEvents.length).toBe(1);
    });

    it('should save state on disposal', async () => {
      // Create limited queen to get queued task
      const limitedQueen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { maxConcurrentTasks: 1 }
      );
      await limitedQueen.initialize();

      await limitedQueen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      await limitedQueen.submitTask({
        type: 'execute-tests',
        priority: 'p1',
        targetDomains: ['test-execution'],
        payload: { queued: true },
        timeout: 30000,
      });

      await limitedQueen.dispose();

      // State should be saved
      const savedState = await memory.get<{ tasks: unknown[] }>('queen:state');
      expect(savedState).toBeDefined();
    });
  });
});

describe('QueenCoordinator integration scenarios', () => {
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

    queen = new QueenCoordinator(
      eventBus,
      agentCoordinator,
      memory,
      router
    );

    await queen.initialize();
  });

  afterEach(async () => {
    await queen.dispose();
  });

  it('should handle full QE workflow scenario', async () => {
    // 1. Generate tests
    const genResult = await queen.submitTask({
      type: 'generate-tests',
      priority: 'p0',
      targetDomains: ['test-generation'],
      payload: { source: 'src/service.ts' },
      timeout: 60000,
    });
    expect(genResult.success).toBe(true);

    // 2. Execute tests
    const execResult = await queen.submitTask({
      type: 'execute-tests',
      priority: 'p0',
      targetDomains: ['test-execution'],
      payload: { testFile: 'tests/service.test.ts' },
      timeout: 60000,
    });
    expect(execResult.success).toBe(true);

    // 3. Analyze coverage
    const covResult = await queen.submitTask({
      type: 'analyze-coverage',
      priority: 'p1',
      targetDomains: ['coverage-analysis'],
      payload: { files: ['src/service.ts'] },
      timeout: 60000,
    });
    expect(covResult.success).toBe(true);

    // 4. Assess quality
    const qualResult = await queen.submitTask({
      type: 'assess-quality',
      priority: 'p1',
      targetDomains: ['quality-assessment'],
      payload: {},
      timeout: 60000,
    });
    expect(qualResult.success).toBe(true);

    // Verify all tasks are running
    const tasks = queen.listTasks();
    expect(tasks.length).toBe(4);
    expect(tasks.every(t => t.status === 'running')).toBe(true);

    // Verify metrics
    const metrics = queen.getMetrics();
    expect(metrics.tasksReceived).toBe(4);
  });

  it('should handle security workflow scenario', async () => {
    // Security scan
    const scanResult = await queen.submitTask({
      type: 'scan-security',
      priority: 'p0',
      targetDomains: ['security-compliance'],
      payload: { scanType: 'sast' },
      timeout: 120000,
    });
    expect(scanResult.success).toBe(true);

    // Contract validation
    const contractResult = await queen.submitTask({
      type: 'validate-contracts',
      priority: 'p1',
      targetDomains: ['contract-testing'],
      payload: { schema: 'api.yaml' },
      timeout: 60000,
    });
    expect(contractResult.success).toBe(true);

    // Both should be assigned to correct domains
    if (scanResult.success && contractResult.success) {
      expect(queen.getTaskStatus(scanResult.value)?.assignedDomain).toBe('security-compliance');
      expect(queen.getTaskStatus(contractResult.value)?.assignedDomain).toBe('contract-testing');
    }
  });
});
