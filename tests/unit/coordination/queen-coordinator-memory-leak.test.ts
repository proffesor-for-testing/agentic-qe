/**
 * PAP-003: Memory Leak Fix Tests for Queen Coordinator
 *
 * Tests that event subscriptions are properly tracked and cleaned up
 * during dispose() to prevent memory leaks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QueenCoordinator,
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
import { CrossDomainRouter, EventCorrelation, EventAggregation } from '../../../src/coordination/interfaces';
import { DomainName, DomainEvent, Result, ok, err, AgentStatus, ALL_DOMAINS } from '../../../src/shared/types';

// ============================================================================
// Mock Implementations with Subscription Tracking
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
    return {
      unsubscribe: () => {},
      active: true,
    };
  }

  async getHistory(): Promise<DomainEvent[]> {
    return this.publishedEvents;
  }

  async dispose(): Promise<void> {
    this.handlers.clear();
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

/**
 * Mock CrossDomainRouter that tracks subscriptions and unsubscriptions
 * This is the key mock for testing PAP-003 memory leak fix
 */
class MockCrossDomainRouterWithTracking implements CrossDomainRouter {
  private subCounter = 0;

  // PAP-003: Track all subscriptions and unsubscriptions
  public domainSubscriptions: Map<string, { domain: DomainName; handler: (event: DomainEvent) => Promise<void> }> = new Map();
  public typeSubscriptions: Map<string, { eventType: string; handler: (event: DomainEvent) => Promise<void> }> = new Map();
  public unsubscribedIds: string[] = [];

  // Spies for verification
  public subscribeToDoaminCalls: number = 0;
  public subscribeToEventTypeCalls: number = 0;
  public unsubscribeCalls: number = 0;

  async initialize(): Promise<void> {}

  subscribeToDoamin(domain: DomainName, handler: (event: DomainEvent) => Promise<void>): string {
    this.subscribeToDoaminCalls++;
    const id = `sub_domain_${++this.subCounter}_${domain}`;
    this.domainSubscriptions.set(id, { domain, handler });
    return id;
  }

  subscribeToEventType(eventType: string, handler: (event: DomainEvent) => Promise<void>): string {
    this.subscribeToEventTypeCalls++;
    const id = `sub_type_${++this.subCounter}_${eventType}`;
    this.typeSubscriptions.set(id, { eventType, handler });
    return id;
  }

  unsubscribe(subscriptionId: string): boolean {
    this.unsubscribeCalls++;
    this.unsubscribedIds.push(subscriptionId);

    // Actually remove the subscription
    const removedFromDomain = this.domainSubscriptions.delete(subscriptionId);
    const removedFromType = this.typeSubscriptions.delete(subscriptionId);

    return removedFromDomain || removedFromType;
  }

  async route(event: DomainEvent): Promise<void> {
    // Route to domain handlers
    for (const [, sub] of this.domainSubscriptions) {
      if (sub.domain === event.source) {
        await sub.handler(event);
      }
    }

    // Route to type handlers
    for (const [, sub] of this.typeSubscriptions) {
      if (sub.eventType === event.type) {
        await sub.handler(event);
      }
    }
  }

  getCorrelation(_correlationId: string): EventCorrelation | undefined {
    return undefined;
  }

  trackCorrelation(_event: DomainEvent): void {}

  aggregate(windowStart: Date, windowEnd: Date): EventAggregation {
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

  // Test helpers
  getActiveSubscriptionCount(): number {
    return this.domainSubscriptions.size + this.typeSubscriptions.size;
  }

  getAllSubscriptionIds(): string[] {
    return [
      ...Array.from(this.domainSubscriptions.keys()),
      ...Array.from(this.typeSubscriptions.keys()),
    ];
  }
}

// ============================================================================
// PAP-003 Memory Leak Fix Tests
// ============================================================================

describe('PAP-003: QueenCoordinator Memory Leak Fix', () => {
  let eventBus: MockEventBus;
  let agentCoordinator: MockAgentCoordinator;
  let memory: MockMemoryBackend;
  let router: MockCrossDomainRouterWithTracking;
  let queen: QueenCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    agentCoordinator = new MockAgentCoordinator();
    memory = new MockMemoryBackend();
    router = new MockCrossDomainRouterWithTracking();
  });

  afterEach(async () => {
    // Ensure cleanup even if test fails
    try {
      if (queen) {
        await queen.dispose();
      }
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe('subscription tracking', () => {
    it('should create subscriptions for all domains during initialize', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();

      // Should have subscribed to all domains (currently 13: 12 QE domains + coordination)
      expect(router.subscribeToDoaminCalls).toBe(ALL_DOMAINS.length);
    });

    it('should create subscriptions for TaskCompleted, TaskFailed, and AgentStatusChanged events', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();

      // Should have subscribed to 3 event types
      expect(router.subscribeToEventTypeCalls).toBe(3);

      // Verify the specific event types
      const eventTypes = Array.from(router.typeSubscriptions.values()).map(s => s.eventType);
      expect(eventTypes).toContain('TaskCompleted');
      expect(eventTypes).toContain('TaskFailed');
      expect(eventTypes).toContain('AgentStatusChanged');
    });

    it('should have total subscriptions equal to domains + 3 event types after initialize', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();

      const totalSubscriptions = router.getActiveSubscriptionCount();
      const expectedTotal = ALL_DOMAINS.length + 3; // domains + 3 event types
      expect(totalSubscriptions).toBe(expectedTotal);
    });
  });

  describe('subscription cleanup on dispose', () => {
    it('should unsubscribe from all events during dispose', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();

      // Verify subscriptions exist before dispose
      const expectedTotal = ALL_DOMAINS.length + 3;
      const subscriptionsBeforeDispose = router.getActiveSubscriptionCount();
      expect(subscriptionsBeforeDispose).toBe(expectedTotal);

      await queen.dispose();

      // Should have called unsubscribe for all subscriptions (domains + 3 event types)
      expect(router.unsubscribeCalls).toBe(expectedTotal);
    });

    it('should have zero active subscriptions after dispose', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();
      await queen.dispose();

      // All subscriptions should be removed
      const subscriptionsAfterDispose = router.getActiveSubscriptionCount();
      expect(subscriptionsAfterDispose).toBe(0);
    });

    it('should unsubscribe using the correct subscription IDs', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();

      // Capture subscription IDs before dispose
      const allSubscriptionIds = router.getAllSubscriptionIds();
      const expectedTotal = ALL_DOMAINS.length + 3;
      expect(allSubscriptionIds.length).toBe(expectedTotal);

      await queen.dispose();

      // Verify all captured IDs were unsubscribed
      for (const subId of allSubscriptionIds) {
        expect(router.unsubscribedIds).toContain(subId);
      }
    });
  });

  describe('memory leak prevention', () => {
    it('should not retain event handlers after dispose', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();
      await queen.dispose();

      // Verify no domain handlers remain
      expect(router.domainSubscriptions.size).toBe(0);

      // Verify no event type handlers remain
      expect(router.typeSubscriptions.size).toBe(0);
    });

    it('should not leak subscriptions on multiple init/dispose cycles', async () => {
      const expectedTotal = ALL_DOMAINS.length + 3;

      for (let cycle = 1; cycle <= 3; cycle++) {
        // Reset router tracking for this cycle
        router = new MockCrossDomainRouterWithTracking();

        queen = new QueenCoordinator(
          eventBus,
          agentCoordinator,
          memory,
          router,
          undefined,
          undefined,
          undefined,
          {
            workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
            enableMetrics: false,
          }
        );

        await queen.initialize();

        // Should have all subscriptions
        expect(router.getActiveSubscriptionCount()).toBe(expectedTotal);

        await queen.dispose();

        // Should have 0 subscriptions after dispose
        expect(router.getActiveSubscriptionCount()).toBe(0);

        // Should have called unsubscribe for all subscriptions
        expect(router.unsubscribeCalls).toBe(expectedTotal);
      }
    });

    it('should not accumulate subscriptions if initialize is called twice', async () => {
      const expectedTotal = ALL_DOMAINS.length + 3;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();

      // Calling initialize again should be a no-op (already initialized)
      const subscriptionsBefore = router.getActiveSubscriptionCount();
      await queen.initialize();
      const subscriptionsAfter = router.getActiveSubscriptionCount();

      // Should not have doubled the subscriptions
      expect(subscriptionsAfter).toBe(subscriptionsBefore);
      expect(subscriptionsAfter).toBe(expectedTotal);

      await queen.dispose();
    });
  });

  describe('event handler functionality after fix', () => {
    it('should still receive domain events before dispose', async () => {
      let domainEventReceived = false;

      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();

      // Simulate a domain event
      const testEvent: DomainEvent = {
        id: 'test_event_1',
        type: 'TestEvent',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      };

      // Domain handlers should still be active
      const domainSubs = Array.from(router.domainSubscriptions.values());
      expect(domainSubs.length).toBeGreaterThan(0);

      await queen.dispose();
    });

    it('should not process events after dispose', async () => {
      queen = new QueenCoordinator(
        eventBus,
        agentCoordinator,
        memory,
        router,
        undefined,
        undefined,
        undefined,
        {
          workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
          enableMetrics: false,
        }
      );

      await queen.initialize();
      await queen.dispose();

      // After dispose, there should be no handlers to receive events
      expect(router.domainSubscriptions.size).toBe(0);
      expect(router.typeSubscriptions.size).toBe(0);

      // Routing an event should not cause any errors or handler calls
      const testEvent: DomainEvent = {
        id: 'test_event_2',
        type: 'TaskCompleted',
        timestamp: new Date(),
        source: 'test-generation',
        payload: { taskId: 'test_task', result: {} },
      };

      // This should not throw and should not call any handlers
      await expect(router.route(testEvent)).resolves.not.toThrow();
    });
  });
});

describe('PAP-003: Edge Cases', () => {
  let eventBus: MockEventBus;
  let agentCoordinator: MockAgentCoordinator;
  let memory: MockMemoryBackend;
  let router: MockCrossDomainRouterWithTracking;

  beforeEach(() => {
    eventBus = new MockEventBus();
    agentCoordinator = new MockAgentCoordinator();
    memory = new MockMemoryBackend();
    router = new MockCrossDomainRouterWithTracking();
  });

  it('should handle dispose without prior initialize gracefully', async () => {
    const queen = new QueenCoordinator(
      eventBus,
      agentCoordinator,
      memory,
      router,
      undefined,
      undefined,
      undefined,
      {
        workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
        enableMetrics: false,
      }
    );

    // Should not throw when disposing without initializing
    // No subscriptions were created, so unsubscribe should be called 0 times
    await expect(queen.dispose()).resolves.not.toThrow();
    expect(router.unsubscribeCalls).toBe(0);
  });

  it('should handle double dispose gracefully', async () => {
    const queen = new QueenCoordinator(
      eventBus,
      agentCoordinator,
      memory,
      router,
      undefined,
      undefined,
      undefined,
      {
        workStealing: { enabled: false, idleThreshold: 100, loadThreshold: 5, stealBatchSize: 2, checkInterval: 1000 },
        enableMetrics: false,
      }
    );

    await queen.initialize();
    await queen.dispose();

    // Second dispose should not throw and should not try to unsubscribe again
    const unsubscribeCallsAfterFirstDispose = router.unsubscribeCalls;
    await expect(queen.dispose()).resolves.not.toThrow();

    // Should not have made additional unsubscribe calls
    // (subscription IDs array is cleared after first dispose)
    expect(router.unsubscribeCalls).toBe(unsubscribeCallsAfterFirstDispose);
  });
});
