/**
 * BaseAgent Race Condition Tests
 * Tests thread-safe initialization with concurrent calls
 * Issue: #52 - Race condition in BaseAgent.initialize()
 */

import { BaseAgent, BaseAgentConfig } from '../../../src/agents/BaseAgent';
import { AgentStatus, AgentCapability, QETask } from '../../../src/types';
import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';

/**
 * Test implementation of BaseAgent
 */
class TestAgent extends BaseAgent {
  public initializeCallCount = 0;
  public initializeComponentsCallCount = 0;

  protected async initializeComponents(): Promise<void> {
    this.initializeComponentsCallCount++;
    // Simulate async work that takes time
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  protected async performTask(_task: QETask): Promise<any> {
    return { success: true };
  }

  protected async loadKnowledge(): Promise<void> {
    // No-op for testing
  }

  protected async cleanup(): Promise<void> {
    // No-op for testing
  }
}

describe('BaseAgent Race Condition Tests', () => {
  let eventBus: EventEmitter;
  let memoryStore: SwarmMemoryManager;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();
  });

  afterEach(async () => {
    await memoryStore.close();
  });

  const createTestAgent = (): TestAgent => {
    const capabilities: AgentCapability[] = [
      {
        name: 'test-capability',
        description: 'Test capability',
        version: '1.0.0'
      }
    ];

    const config: BaseAgentConfig = {
      type: 'test-generator',
      capabilities,
      context: {
        environment: 'test',
        project: {
          name: 'race-condition-test',
          version: '1.0.0'
        }
      },
      memoryStore,
      eventBus,
      enableLearning: false
    };

    return new TestAgent(config);
  };

  describe('Concurrent Initialization', () => {
    it('should handle concurrent initialize() calls without double-initialization', async () => {
      const agent = createTestAgent();

      // Call initialize() 5 times concurrently
      const initPromises = Array.from({ length: 5 }, () => agent.initialize());

      // All promises should resolve successfully
      await Promise.all(initPromises);

      // Verify initialization only happened once
      expect(agent.initializeComponentsCallCount).toBe(1);

      // Verify agent is in correct state
      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.IDLE);

      await agent.terminate();
    });

    it('should handle rapid sequential initialize() calls', async () => {
      const agent = createTestAgent();

      // Call initialize() multiple times in sequence without awaiting
      const promise1 = agent.initialize();
      const promise2 = agent.initialize();
      const promise3 = agent.initialize();

      await Promise.all([promise1, promise2, promise3]);

      // Verify initialization only happened once
      expect(agent.initializeComponentsCallCount).toBe(1);

      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.IDLE);

      await agent.terminate();
    });

    it('should allow re-initialization after termination', async () => {
      const agent = createTestAgent();

      // First initialization
      await agent.initialize();
      expect(agent.initializeComponentsCallCount).toBe(1);

      // Terminate
      await agent.terminate();
      expect(agent.getStatus().status).toBe(AgentStatus.TERMINATED);

      // Second initialization should be allowed after termination
      await agent.initialize();
      expect(agent.initializeComponentsCallCount).toBe(2);

      await agent.terminate();
    });

    it('should wait for in-progress initialization', async () => {
      const agent = createTestAgent();

      // Start first initialization
      const firstInit = agent.initialize();

      // Start second initialization while first is in progress
      const secondInit = agent.initialize();

      await Promise.all([firstInit, secondInit]);

      // Both should complete successfully
      expect(agent.initializeComponentsCallCount).toBe(1);
      expect(agent.getStatus().status).toBe(AgentStatus.IDLE);

      await agent.terminate();
    });

    it('should handle concurrent initialize() from multiple sources', async () => {
      const agent = createTestAgent();

      // Simulate initialization from different "threads"
      const initFromThread1 = agent.initialize();
      const initFromThread2 = agent.initialize();
      const initFromThread3 = agent.initialize();

      // Wait for all to complete
      await Promise.all([initFromThread1, initFromThread2, initFromThread3]);

      // Verify single initialization
      expect(agent.initializeComponentsCallCount).toBe(1);

      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.IDLE);

      await agent.terminate();
    });
  });

  describe('Initialization Idempotency', () => {
    it('should be safe to call initialize() multiple times after completion', async () => {
      const agent = createTestAgent();

      // First initialization
      await agent.initialize();
      const firstCallCount = agent.initializeComponentsCallCount;
      expect(firstCallCount).toBe(1);

      // Second call after completion
      await agent.initialize();
      expect(agent.initializeComponentsCallCount).toBe(firstCallCount); // No additional initialization

      // Third call
      await agent.initialize();
      expect(agent.initializeComponentsCallCount).toBe(firstCallCount);

      await agent.terminate();
    });

    it('should maintain correct status during concurrent initialization', async () => {
      const agent = createTestAgent();

      const statusChecks: AgentStatus[] = [];

      // Start initialization and check status concurrently
      const initPromise = agent.initialize();

      // Check status during initialization
      const checkStatus = async () => {
        for (let i = 0; i < 10; i++) {
          statusChecks.push(agent.getStatus().status);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };

      await Promise.all([initPromise, checkStatus()]);

      // Status should eventually be IDLE
      expect(agent.getStatus().status).toBe(AgentStatus.IDLE);

      // All status checks should be valid states
      const validStates = [
        AgentStatus.INITIALIZING,
        AgentStatus.IDLE,
        AgentStatus.ACTIVE
      ];
      for (const status of statusChecks) {
        expect(validStates).toContain(status);
      }

      await agent.terminate();
    });
  });

  describe('Error Handling in Concurrent Initialization', () => {
    it('should handle initialization errors consistently across concurrent calls', async () => {
      class FailingAgent extends TestAgent {
        protected async initializeComponents(): Promise<void> {
          this.initializeComponentsCallCount++;
          throw new Error('Initialization failed');
        }
      }

      const agent = new FailingAgent({
        type: 'test-generator',
        capabilities: [],
        context: {
          environment: 'test',
          project: { name: 'test', version: '1.0.0' }
        },
        memoryStore,
        eventBus,
        enableLearning: false
      });

      // All concurrent calls should fail with the same error
      const initPromises = Array.from({ length: 3 }, () =>
        agent.initialize().catch(e => e)
      );

      const results = await Promise.all(initPromises);

      // All should have failed
      for (const result of results) {
        expect(result).toBeInstanceOf(Error);
      }

      // Only one initialization attempt should have occurred
      expect(agent.initializeComponentsCallCount).toBe(1);

      // Agent should be in ERROR state
      expect(agent.getStatus().status).toBe(AgentStatus.ERROR);
    });
  });

  describe('Memory and Resource Safety', () => {
    it('should not leak memory with multiple concurrent initialize() calls', async () => {
      const agent = createTestAgent();

      // Run multiple rounds of concurrent initialization
      for (let round = 0; round < 3; round++) {
        const promises = Array.from({ length: 10 }, () => agent.initialize());
        await Promise.all(promises);
      }

      // Verify clean state
      expect(agent.initializeComponentsCallCount).toBe(1);
      expect(agent.getStatus().status).toBe(AgentStatus.IDLE);

      await agent.terminate();
    });

    it('should properly clean up mutex after initialization', async () => {
      const agent = createTestAgent();

      await agent.initialize();

      // Access private property for testing (TypeScript hack)
      const mutex = (agent as any).initializationMutex;
      expect(mutex).toBeUndefined();

      await agent.terminate();
    });
  });

  describe('Event-Driven Coordination with Concurrent Initialization', () => {
    it('should emit correct events during concurrent initialization', async () => {
      const agent = createTestAgent();
      const events: string[] = [];

      eventBus.on('agent.initialized', () => events.push('initialized'));
      eventBus.on('agent.error', () => events.push('error'));

      // Concurrent initialization
      await Promise.all([
        agent.initialize(),
        agent.initialize(),
        agent.initialize()
      ]);

      // Should have exactly one initialized event
      expect(events.filter(e => e === 'initialized')).toHaveLength(1);
      expect(events.filter(e => e === 'error')).toHaveLength(0);

      await agent.terminate();
    });

    it('should support waitForReady() during concurrent initialization', async () => {
      const agent = createTestAgent();

      // Start initialization (don't await yet)
      const initPromise = agent.initialize();

      // Give initialization a moment to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Wait for ready from another "thread" (with longer timeout for CI)
      const waitPromise = agent.waitForReady(10000);

      await Promise.all([initPromise, waitPromise]);

      expect(agent.getStatus().status).toBe(AgentStatus.IDLE);

      await agent.terminate();
    });
  });

  describe('Integration with AgentDB', () => {
    it('should prevent double-initialization of AgentDB', async () => {
      // Create fresh memory store for this test
      const agentDBMemoryStore = new SwarmMemoryManager(':memory:');
      await agentDBMemoryStore.initialize();

      const agentDBConfig = {
        dbPath: ':memory:',
        enableQUICSync: false,
        enableLearning: true,
        enableReasoning: true
      };

      const config: BaseAgentConfig = {
        type: 'test-generator',
        capabilities: [],
        context: {
          environment: 'test',
          project: { name: 'test', version: '1.0.0' }
        },
        memoryStore: agentDBMemoryStore,
        eventBus,
        enableLearning: true,
        agentDBConfig
      };

      const agent = new TestAgent(config);

      // Concurrent initialization with AgentDB
      await Promise.all([
        agent.initialize(),
        agent.initialize(),
        agent.initialize()
      ]);

      // Verify AgentDB is initialized
      expect(agent.hasAgentDB()).toBe(true);

      // Verify single initialization
      expect(agent.initializeComponentsCallCount).toBe(1);

      await agent.terminate();
      await agentDBMemoryStore.close();
    });
  });
});
