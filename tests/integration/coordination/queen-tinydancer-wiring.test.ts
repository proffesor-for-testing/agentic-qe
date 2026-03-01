/**
 * Integration Tests: Queen Coordinator ↔ TinyDancer Router Wiring
 *
 * Verifies that the TinyDancer intelligent model routing is ACTUALLY integrated
 * with the Queen Coordinator, not just code that compiles.
 *
 * Per Brutal Honesty Review - Integration Test Requirements:
 * 1. Component is initialized when config enables it
 * 2. Component method is called during parent operation
 * 3. Result from component affects parent output
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QueenCoordinator,
  QueenConfig,
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
import { QueenRouterAdapter } from '../../../src/routing/queen-integration';

// ============================================================================
// Mock Implementations (minimal - only what's needed)
// ============================================================================

class MockEventBus implements EventBus {
  private handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  public publishedEvents: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe<T>(
    eventType: string,
    handler: (event: DomainEvent<T>) => Promise<void>
  ): Subscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as (event: DomainEvent) => Promise<void>);
    return { unsubscribe: () => {}, active: true };
  }

  subscribeToChannel(
    _domain: DomainName,
    _handler: (event: DomainEvent) => Promise<void>
  ): Subscription {
    return { unsubscribe: () => {}, active: true };
  }

  async getHistory(): Promise<DomainEvent[]> {
    return this.publishedEvents;
  }
}

class MockAgentCoordinator implements AgentCoordinator {
  public spawnCalls: AgentSpawnConfig[] = [];

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    this.spawnCalls.push(config);
    return ok(`agent-${config.name}`);
  }

  async stop(_agentId: string): Promise<Result<void, Error>> {
    return ok(undefined);
  }

  async terminate(_agentId: string): Promise<Result<void, Error>> {
    return ok(undefined);
  }

  getAgent(_agentId: string): AgentInfo | undefined {
    return undefined;
  }

  listAgents(_filter?: AgentFilter): AgentInfo[] {
    return [];
  }

  canSpawn(): boolean {
    return true;
  }

  getCapacity(): { current: number; max: number } {
    return { current: 0, max: 15 };
  }
}

class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async get<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }

  async set(_key: string, _value: unknown, _options?: StoreOptions): Promise<void> {}

  async delete(_key: string): Promise<boolean> {
    return true;
  }

  async has(_key: string): Promise<boolean> {
    return false;
  }

  async keys(_pattern?: string): Promise<string[]> {
    return [];
  }

  async clear(): Promise<void> {}

  async getStats(): Promise<{ size: number; namespaces: string[] }> {
    return { size: 0, namespaces: [] };
  }

  async vectorSearch(_query: number[], _options?: { topK?: number }): Promise<VectorSearchResult[]> {
    return [];
  }
}

class MockCrossDomainRouter implements CrossDomainRouter {
  private subscriptionCounter = 0;

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}

  route(_event: DomainEvent): DomainName[] {
    return ['test-generation'];
  }

  registerRoute(_source: DomainName, _target: DomainName): void {}
  unregisterRoute(_source: DomainName, _target: DomainName): void {}
  listRoutes(): { source: DomainName; target: DomainName }[] {
    return [];
  }

  subscribeToDoamin(
    _domain: DomainName,
    _handler: (event: DomainEvent) => Promise<void>
  ): string {
    return `sub-${this.subscriptionCounter++}`;
  }

  subscribeToEventType(
    _type: string,
    _handler: (event: DomainEvent) => Promise<void>
  ): string {
    return `sub-${this.subscriptionCounter++}`;
  }

  unsubscribe(_subscriptionId: string): void {}
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Queen Coordinator ↔ TinyDancer Router Wiring', () => {
  let queen: QueenCoordinator;
  let eventBus: MockEventBus;
  let agentCoordinator: MockAgentCoordinator;
  let memory: MockMemoryBackend;
  let router: MockCrossDomainRouter;

  beforeEach(() => {
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

  describe('Requirement 1: Component Initialization', () => {
    it('TinyDancer router is initialized when enableRouting is true (default)', async () => {
      // Create Queen with default config (enableRouting defaults to true)
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {} // Use defaults
      );
      await queen.initialize();

      // VERIFY: TinyDancer router MUST be initialized
      const tinyDancer = queen.getTinyDancerRouter();
      expect(tinyDancer).not.toBeNull();
      expect(tinyDancer).toBeInstanceOf(QueenRouterAdapter);
    });

    it('TinyDancer router is NOT initialized when enableRouting is false', async () => {
      // Create Queen with routing explicitly disabled
      const config: Partial<QueenConfig> = {
        enableRouting: false,
      };
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        config
      );
      await queen.initialize();

      // VERIFY: TinyDancer router MUST be null
      const tinyDancer = queen.getTinyDancerRouter();
      expect(tinyDancer).toBeNull();
    });

    it('TinyDancer router accepts custom configuration', async () => {
      // Create Queen with custom routing config
      const config: Partial<QueenConfig> = {
        enableRouting: true,
        routing: {
          tinyDancer: {
            defaultComplexity: 'medium',
          },
          routing: {
            verbose: true,
          },
        },
      };
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        config
      );
      await queen.initialize();

      // VERIFY: Router is initialized with custom config
      const tinyDancer = queen.getTinyDancerRouter();
      expect(tinyDancer).not.toBeNull();

      // Config should be accessible
      const routingConfig = tinyDancer!.getConfig();
      expect(routingConfig).toBeDefined();
    });
  });

  describe('Requirement 2: Method is Called During Parent Operation', () => {
    it('tinyDancerRouter.route() is called when submitting a task', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      const tinyDancer = queen.getTinyDancerRouter();
      expect(tinyDancer).not.toBeNull();

      // Spy on the route method
      const routeSpy = vi.spyOn(tinyDancer!, 'route');

      // Submit a task
      const result = await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: { file: 'src/example.ts' },
        timeout: 30000,
      });

      expect(result.success).toBe(true);

      // VERIFY: route() was called during task submission
      expect(routeSpy).toHaveBeenCalled();
      expect(routeSpy).toHaveBeenCalledTimes(1);

      // Check the task that was passed
      const callArg = routeSpy.mock.calls[0][0];
      expect(callArg.description).toContain('generate-tests');
    });

    it('tinyDancerRouter.route() is called for each task individually', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      const tinyDancer = queen.getTinyDancerRouter();
      const routeSpy = vi.spyOn(tinyDancer!, 'route');

      // Submit multiple tasks
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p0',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      await queen.submitTask({
        type: 'scan-security',
        priority: 'p1',
        targetDomains: ['security-compliance'],
        payload: {},
        timeout: 30000,
      });

      // VERIFY: route() was called twice
      expect(routeSpy).toHaveBeenCalledTimes(2);
    });

    it('route() is NOT called when routing is disabled', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: false }
      );
      await queen.initialize();

      const tinyDancer = queen.getTinyDancerRouter();
      expect(tinyDancer).toBeNull();

      // Submit a task - should work without routing
      const result = await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      // No spy to check - router is null, so route() was not called
    });
  });

  describe('Requirement 3: Result Affects Parent Output', () => {
    it('routing decision tier is used for agent spawn', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      // Submit a task
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: { complexity: 'simple' },
        timeout: 30000,
      });

      // VERIFY: Agent spawn was called with routing-derived type
      expect(agentCoordinator.spawnCalls.length).toBeGreaterThan(0);
      const spawnCall = agentCoordinator.spawnCalls[0];

      // The agent type should be from TinyDancer routing decision (booster/haiku/sonnet/opus)
      const validTiers = ['booster', 'haiku', 'sonnet', 'opus'];
      expect(validTiers).toContain(spawnCall.type);
    });

    it('routing decision model is included in agent capabilities', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      // VERIFY: Agent capabilities include model specification
      expect(agentCoordinator.spawnCalls.length).toBeGreaterThan(0);
      const capabilities = agentCoordinator.spawnCalls[0].capabilities;

      // Should have a model capability
      const modelCapability = capabilities.find(c => c.startsWith('model:'));
      expect(modelCapability).toBeDefined();

      // Model should be one of the valid Claude models
      const model = modelCapability!.replace('model:', '');
      expect(['haiku', 'sonnet', 'opus']).toContain(model);
    });

    it('higher priority tasks get routed appropriately', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      const tinyDancer = queen.getTinyDancerRouter();
      const routeSpy = vi.spyOn(tinyDancer!, 'route');

      // Submit a critical priority task
      await queen.submitTask({
        type: 'scan-security',
        priority: 'p0', // Critical
        targetDomains: ['security-compliance'],
        payload: { critical: true },
        timeout: 30000,
      });

      // VERIFY: Route was called with correct priority mapping
      expect(routeSpy).toHaveBeenCalled();
      const taskArg = routeSpy.mock.calls[0][0];
      expect(taskArg.priority).toBe('critical'); // p0 → critical
    });

    it('task domain is passed to routing decision', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      const tinyDancer = queen.getTinyDancerRouter();
      const routeSpy = vi.spyOn(tinyDancer!, 'route');

      await queen.submitTask({
        type: 'scan-security',
        priority: 'p1',
        targetDomains: ['security-compliance'],
        payload: {},
        timeout: 30000,
      });

      // VERIFY: Domain was passed to routing
      const taskArg = routeSpy.mock.calls[0][0];
      expect(taskArg.domain).toBe('security-compliance');
    });

    it('logging includes routing decision when metrics enabled', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true, enableMetrics: true }
      );
      await queen.initialize();

      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      // VERIFY: TinyDancer routing was logged
      const routingLogCall = consoleLogSpy.mock.calls.find(
        call => call[0]?.toString().includes('[Queen] TinyDancer routing')
      );
      expect(routingLogCall).toBeDefined();

      consoleLogSpy.mockRestore();
    });
  });

  describe('Integration Health Check', () => {
    it('getTinyDancerRouter() returns the router for external access', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      const tinyDancer = queen.getTinyDancerRouter();
      expect(tinyDancer).not.toBeNull();

      // External code should be able to query the router directly
      const costStats = tinyDancer!.getCostStats();
      expect(costStats.totalTasks).toBeDefined();
      expect(costStats.totalCost).toBeDefined();
    });

    it('router accumulates statistics across tasks', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        { enableRouting: true }
      );
      await queen.initialize();

      const tinyDancer = queen.getTinyDancerRouter();
      const initialStats = tinyDancer!.getCostStats();
      const initialTasks = initialStats.totalTasks;

      // Submit multiple tasks
      await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
      });

      await queen.submitTask({
        type: 'assess-quality',
        priority: 'p2',
        targetDomains: ['quality-assessment'],
        payload: {},
        timeout: 30000,
      });

      // VERIFY: Statistics accumulated
      const finalStats = tinyDancer!.getCostStats();
      expect(finalStats.totalTasks).toBe(initialTasks + 2);
    });
  });
});
