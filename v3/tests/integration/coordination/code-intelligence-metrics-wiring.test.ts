/**
 * Integration Tests: Code Intelligence Coordinator ↔ MetricCollector Wiring
 *
 * Verifies that the MetricCollector service is ACTUALLY integrated
 * with the Code Intelligence Coordinator, not just code that compiles.
 *
 * Per Brutal Honesty Review - Integration Test Requirements:
 * 1. Component is initialized when config enables it
 * 2. Component method is called during parent operation
 * 3. Result from component affects parent output
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import {
  CodeIntelligenceCoordinator,
  CoordinatorConfig,
} from '../../../src/domains/code-intelligence/coordinator';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
  AgentFilter,
  AgentInfo,
  Subscription,
  StoreOptions,
  VectorSearchResult,
} from '../../../src/kernel/interfaces';
import { DomainName, DomainEvent, Result, ok, err } from '../../../src/shared/types';
import {
  createMetricCollector,
  MetricCollectorService,
  type IMetricCollectorService,
  type ProjectMetrics,
} from '../../../src/domains/code-intelligence/services/metric-collector/index';

// Use fixture directory instead of FIXTURE_PROJECT_PATH to avoid OOM issues
const FIXTURE_PROJECT_PATH = join(__dirname, '../../fixtures/sample-project');

// ============================================================================
// Mock Implementations
// ============================================================================

class MockEventBus implements EventBus {
  public publishedEvents: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe<T>(
    _eventType: string,
    _handler: (event: DomainEvent<T>) => Promise<void>
  ): Subscription {
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

class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();
  public setCalls: Array<{ key: string; value: unknown }> = [];

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set(key: string, value: unknown, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
    this.setCalls.push({ key, value });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async keys(_pattern?: string): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async getStats(): Promise<{ size: number; namespaces: string[] }> {
    return { size: this.store.size, namespaces: [] };
  }

  async vectorSearch(_query: number[], _options?: { topK?: number }): Promise<VectorSearchResult[]> {
    return [];
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

// ============================================================================
// Integration Tests
// ============================================================================

describe('Code Intelligence Coordinator ↔ MetricCollector Wiring', () => {
  let coordinator: CodeIntelligenceCoordinator;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.dispose();
    }
  });

  describe('Requirement 1: Component Initialization', () => {
    it('MetricCollector is initialized when enableMetricCollector is true', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await coordinator.initialize();

      // Should log initialization
      const initLog = consoleSpy.mock.calls.find(
        call => call[0]?.toString().includes('MetricCollector initialized')
      );
      expect(initLog).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('MetricCollector is NOT initialized when enableMetricCollector is false', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: false,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await coordinator.initialize();

      // Should NOT see MetricCollector initialization
      const initLog = consoleSpy.mock.calls.find(
        call => call[0]?.toString().includes('MetricCollector initialized')
      );
      expect(initLog).toBeUndefined();

      // getMetricCollector should return undefined
      const collector = coordinator.getMetricCollector();
      expect(collector).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('getMetricCollector returns the collector when initialized', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      const collector = coordinator.getMetricCollector();
      expect(collector).toBeDefined();
      expect(typeof collector!.collectAll).toBe('function');
      expect(typeof collector!.countLOC).toBe('function');
      expect(typeof collector!.countTests).toBe('function');
    });
  });

  describe('Requirement 2: Method is Called During Parent Operation', () => {
    it('metricCollector.collectAll is called during collectProjectMetrics', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      const collector = coordinator.getMetricCollector();
      expect(collector).toBeDefined();

      // Spy on collectAll
      const collectAllSpy = vi.spyOn(collector!, 'collectAll');

      // Call collectProjectMetrics
      const result = await coordinator.collectProjectMetrics(FIXTURE_PROJECT_PATH);

      // Verify collectAll was called
      expect(collectAllSpy).toHaveBeenCalledTimes(1);
      expect(collectAllSpy).toHaveBeenCalledWith(FIXTURE_PROJECT_PATH);
    });

    it('collectProjectMetrics returns error when MetricCollector disabled', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: false,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      const result = await coordinator.collectProjectMetrics(FIXTURE_PROJECT_PATH);

      // Should return error since collector is not enabled
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('MetricCollector is not enabled');
      }
    });
  });

  describe('Requirement 3: Result Affects Parent Output', () => {
    it('collected metrics are returned from collectProjectMetrics', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      // Collect metrics for the current project
      const result = await coordinator.collectProjectMetrics(FIXTURE_PROJECT_PATH);

      // Should succeed with real metrics
      expect(result.success).toBe(true);
      if (result.success) {
        const metrics = result.value;

        // Metrics should have structure
        expect(metrics.loc).toBeDefined();
        expect(typeof metrics.loc.total).toBe('number');

        expect(metrics.tests).toBeDefined();
        expect(typeof metrics.tests.total).toBe('number');

        expect(metrics.collectedAt).toBeInstanceOf(Date);
        expect(Array.isArray(metrics.toolsUsed)).toBe(true);
      }
    });

    it('metrics are stored in memory after collection', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      // Collect metrics
      await coordinator.collectProjectMetrics(FIXTURE_PROJECT_PATH);

      // Check that metrics were stored in memory
      const metricsStoredCall = memory.setCalls.find(
        call => call.key.includes('project-metrics:')
      );
      expect(metricsStoredCall).toBeDefined();

      // LOC metrics should be stored separately
      const locStoredCall = memory.setCalls.find(
        call => call.key.includes('loc-metrics:')
      );
      expect(locStoredCall).toBeDefined();

      // Test metrics should be stored separately
      const testStoredCall = memory.setCalls.find(
        call => call.key.includes('test-metrics:')
      );
      expect(testStoredCall).toBeDefined();
    });

    it('MetricsCollected event is published when publishEvents is true', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: true,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      // Clear any existing events
      eventBus.publishedEvents = [];

      // Collect metrics
      await coordinator.collectProjectMetrics(FIXTURE_PROJECT_PATH);

      // Check for MetricsCollected event
      const metricsEvent = eventBus.publishedEvents.find(
        event => event.type === 'code-intelligence.MetricsCollected'
      );
      expect(metricsEvent).toBeDefined();

      if (metricsEvent) {
        const payload = metricsEvent.payload as any;
        expect(payload.projectPath).toBeDefined();
        expect(typeof payload.loc).toBe('number');
        expect(typeof payload.tests).toBe('number');
        expect(Array.isArray(payload.toolsUsed)).toBe(true);
      }
    });

    it('console logs show real metrics', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await coordinator.collectProjectMetrics(FIXTURE_PROJECT_PATH);

      // Should log real metrics collected
      const metricsLog = consoleSpy.mock.calls.find(
        call => call[0]?.toString().includes('Real metrics collected:')
      );
      expect(metricsLog).toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  describe('MetricCollector Service Verification', () => {
    it('createMetricCollector creates a working service', () => {
      const collector = createMetricCollector({
        enableCache: true,
        cacheTTL: 60000,
      });

      expect(collector).toBeDefined();
      expect(typeof collector.collectAll).toBe('function');
      expect(typeof collector.countLOC).toBe('function');
      expect(typeof collector.countTests).toBe('function');
      expect(typeof collector.countPatterns).toBe('function');
      expect(typeof collector.checkTools).toBe('function');
    });

    it('service can count LOC for a real directory', async () => {
      const collector = createMetricCollector();

      // Count LOC for the current project
      const loc = await collector.countLOC(FIXTURE_PROJECT_PATH);

      // Should return real LOC data
      expect(loc).toBeDefined();
      expect(typeof loc.total).toBe('number');
      expect(loc.total).toBeGreaterThanOrEqual(0);
      expect(typeof loc.source).toBe('string');
    });

    it('service can count tests for a real directory', async () => {
      const collector = createMetricCollector();

      // Count tests for the current project
      const tests = await collector.countTests(FIXTURE_PROJECT_PATH);

      // Should return real test data
      expect(tests).toBeDefined();
      expect(typeof tests.total).toBe('number');
      expect(tests.total).toBeGreaterThanOrEqual(0);
      expect(typeof tests.source).toBe('string');
    });

    it('service provides tool availability information', () => {
      const collector = createMetricCollector();

      const tools = collector.checkTools();

      // Should return array of tool availability
      expect(Array.isArray(tools)).toBe(true);
      tools.forEach(tool => {
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.available).toBe('boolean');
        // version is optional, only present when tool is available
        if (tool.available && tool.version) {
          expect(typeof tool.version).toBe('string');
        }
      });
    });

    it('service caches results when enabled', async () => {
      const collector = createMetricCollector({
        enableCache: true,
        cacheTTL: 60000,
      });

      // First call
      await collector.collectAll(FIXTURE_PROJECT_PATH);
      const statsAfterFirst = collector.getCacheStats();

      // Second call (should use cache)
      await collector.collectAll(FIXTURE_PROJECT_PATH);
      const statsAfterSecond = collector.getCacheStats();

      // Cache hits should increase
      expect(statsAfterSecond.hits).toBeGreaterThan(statsAfterFirst.hits);
    });
  });

  describe('Integration Health Check', () => {
    it('coordinator initializes without throwing when metrics enabled', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('coordinator can dispose cleanly after metrics init', async () => {
      const config: Partial<CoordinatorConfig> = {
        enableMetricCollector: true,
        publishEvents: false,
      };

      coordinator = new CodeIntelligenceCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        config
      );

      await coordinator.initialize();

      await expect(coordinator.dispose()).resolves.not.toThrow();
    });
  });
});
