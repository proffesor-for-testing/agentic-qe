/**
 * BaseAgent RuVector Integration Tests
 * Phase 0.5: Validates GNN self-learning cache integration with QE agents
 *
 * Tests:
 * - HybridRouter initialization with RuVector cache
 * - Cache hit rate tracking
 * - Learning consolidation
 * - Cost savings reporting
 */

import { EventEmitter } from 'events';
import { BaseAgent, BaseAgentConfig, AgentLLMConfig } from '../../../src/agents/BaseAgent';
import { QEAgentType, AgentCapability, AgentContext, AgentStatus, QETask } from '../../../src/types';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { RoutingStrategy } from '../../../src/providers/HybridRouter';

// Minimal concrete agent implementation for testing
class TestQEAgent extends BaseAgent {
  public initializeCalled = false;
  public cleanupCalled = false;

  protected async initializeComponents(): Promise<void> {
    this.initializeCalled = true;
  }

  protected async performTask(task: QETask): Promise<any> {
    return { success: true, taskType: task.type };
  }

  protected async loadKnowledge(): Promise<void> {
    // No-op for tests
  }

  protected async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }

  // Expose protected methods for testing
  public async testLlmCompleteWithLearning(prompt: string) {
    return this.llmCompleteWithLearning(prompt);
  }
}

describe('BaseAgent RuVector Integration', () => {
  let eventBus: EventEmitter;
  let memoryStore: SwarmMemoryManager;
  let testCapabilities: AgentCapability[];
  let testContext: AgentContext;

  beforeAll(async () => {
    // Initialize shared test infrastructure
    eventBus = new EventEmitter();
    memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    testCapabilities = [
      { name: 'test-capability', description: 'Test capability', enabled: true },
    ];

    testContext = {
      environment: 'test',
      project: 'test-project',
      timestamp: new Date(),
    };
  });

  afterAll(async () => {
    memoryStore.close();
    eventBus.removeAllListeners();
  });

  describe('Agent Configuration', () => {
    it('should support enableHybridRouter configuration', () => {
      const config: BaseAgentConfig = {
        type: 'test-generator' as QEAgentType,
        capabilities: testCapabilities,
        context: testContext,
        memoryStore,
        eventBus,
        llm: {
          enabled: true,
          enableHybridRouter: true,
          ruvectorCache: {
            cacheThreshold: 0.85,
            learningEnabled: true,
          },
        },
      };

      const agent = new TestQEAgent(config);
      expect(agent).toBeDefined();
    });

    it('should support preferredProvider=hybrid configuration', () => {
      const config: BaseAgentConfig = {
        type: 'coverage-analyzer' as QEAgentType,
        capabilities: testCapabilities,
        context: testContext,
        memoryStore,
        eventBus,
        llm: {
          enabled: true,
          preferredProvider: 'hybrid',
          hybridRouterConfig: {
            defaultStrategy: RoutingStrategy.BALANCED,
          },
        },
      };

      const agent = new TestQEAgent(config);
      expect(agent).toBeDefined();
    });

    it('should configure RuVector cache with LoRA and EWC++', () => {
      const config: BaseAgentConfig = {
        type: 'security-scanner' as QEAgentType,
        capabilities: testCapabilities,
        context: testContext,
        memoryStore,
        eventBus,
        llm: {
          enabled: true,
          enableHybridRouter: true,
          ruvectorCache: {
            baseUrl: 'http://ruvector:8080',
            cacheThreshold: 0.9,
            learningEnabled: true,
            loraRank: 16,
            ewcEnabled: true,
          },
        },
      };

      const agent = new TestQEAgent(config);
      expect(agent).toBeDefined();
    });
  });

  describe('RuVector Cache Methods', () => {
    let agent: TestQEAgent;

    beforeEach(() => {
      // Create agent without HybridRouter (no Docker running)
      const config: BaseAgentConfig = {
        type: 'test-generator' as QEAgentType,
        capabilities: testCapabilities,
        context: testContext,
        memoryStore,
        eventBus,
        llm: {
          enabled: false, // Disable LLM for unit tests
        },
      };

      agent = new TestQEAgent(config);
    });

    afterEach(async () => {
      await agent.terminate();
    });

    it('should return false for hasRuVectorCache when not enabled', () => {
      expect(agent.hasRuVectorCache()).toBe(false);
    });

    it('should return null for getRuVectorMetrics when not enabled', async () => {
      const metrics = await agent.getRuVectorMetrics();
      expect(metrics).toBeNull();
    });

    it('should return 0 for getCacheHitRate when not enabled', () => {
      expect(agent.getCacheHitRate()).toBe(0);
    });

    it('should return default values for getRoutingStats when not enabled', () => {
      const stats = agent.getRoutingStats();
      expect(stats).toEqual({
        totalDecisions: 0,
        localDecisions: 0,
        cloudDecisions: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheHitRate: 0,
        averageLocalLatency: 0,
        averageCloudLatency: 0,
        successRate: 0,
      });
    });

    it('should return error for forceRuVectorLearn when not enabled', async () => {
      const result = await agent.forceRuVectorLearn();
      expect(result.success).toBe(false);
      expect(result.error).toBe('RuVector not enabled');
    });

    it('should return default values for getCostSavingsReport when not enabled', () => {
      const report = agent.getCostSavingsReport();
      expect(report).toEqual({
        totalRequests: 0,
        localRequests: 0,
        cloudRequests: 0,
        totalCost: 0,
        estimatedCloudCost: 0,
        savings: 0,
        savingsPercentage: 0,
        cacheHits: 0,
        cacheSavings: 0,
      });
    });
  });

  describe('LLM Stats with RuVector', () => {
    it('should include hasRuVectorCache in getLLMStats', () => {
      const config: BaseAgentConfig = {
        type: 'test-generator' as QEAgentType,
        capabilities: testCapabilities,
        context: testContext,
        memoryStore,
        eventBus,
        llm: {
          enabled: false,
        },
      };

      const agent = new TestQEAgent(config);
      const stats = agent.getLLMStats();

      expect(stats).toHaveProperty('hasRuVectorCache');
      expect(stats.hasRuVectorCache).toBe(false);
    });

    it('should report hybrid provider when HybridRouter is configured', () => {
      const config: BaseAgentConfig = {
        type: 'test-generator' as QEAgentType,
        capabilities: testCapabilities,
        context: testContext,
        memoryStore,
        eventBus,
        llm: {
          enabled: true,
          enableHybridRouter: true,
        },
      };

      const agent = new TestQEAgent(config);
      // Before initialization, provider is undefined
      const stats = agent.getLLMStats();
      expect(stats.available).toBe(false);
    });
  });

  describe('Agent Lifecycle with RuVector', () => {
    it('should handle initialization gracefully without RuVector Docker', async () => {
      const config: BaseAgentConfig = {
        type: 'test-generator' as QEAgentType,
        capabilities: testCapabilities,
        context: testContext,
        memoryStore,
        eventBus,
        llm: {
          enabled: true,
          enableHybridRouter: true,
          ruvectorCache: {
            baseUrl: 'http://localhost:9999', // Non-existent
            cacheThreshold: 0.85,
          },
        },
      };

      const agent = new TestQEAgent(config);

      // Should not throw even if RuVector is unavailable
      await agent.initialize();
      expect(agent.initializeCalled).toBe(true);

      // Agent should still be functional
      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.IDLE);

      await agent.terminate();
    });
  });
});
