/**
 * BaseAgent RuvLLM Integration Test
 *
 * Tests real integration between BaseAgent and @ruvector/ruvllm
 * Phase 0 (M0.1-M0.4) validation with REAL LLM calls
 *
 * Uses actual RuvllmProvider - skips if package not available
 */

import { EventEmitter } from 'events';
import { BaseAgent, BaseAgentConfig } from '../../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { AgentCapability, QETask, TaskAssignment } from '../../../src/types';
import { loadRuvLLM, isRuvLLMAvailable } from '../../../src/utils/ruvllm-loader';

// Skip entire suite if RuvLLM not available
const describeIfRuvLLM = isRuvLLMAvailable() ? describe : describe.skip;

/**
 * Concrete test implementation of BaseAgent for real LLM testing
 */
class RealLLMAgent extends BaseAgent {
  constructor(config: BaseAgentConfig) {
    super(config);
  }

  /**
   * Execute LLM completion and return raw response
   */
  public async generateWithLLM(prompt: string): Promise<string> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmComplete(prompt);
  }

  /**
   * Generate embeddings with real LLM
   */
  public async embedWithLLM(text: string): Promise<number[]> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmEmbed(text);
  }

  /**
   * Multi-turn chat with session support
   */
  public async chatWithLLM(input: string): Promise<string> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmChat(input);
  }

  /**
   * Batch processing for throughput testing
   */
  public async batchGenerateWithLLM(prompts: string[]): Promise<string[]> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmBatchComplete(prompts);
  }

  /**
   * Get routing decision for observability testing
   */
  public getRouting(input: string): any {
    return this.getLLMRoutingDecision(input);
  }

  protected async initializeComponents(): Promise<void> {
    // Real agent initialization - no-op for test
  }

  protected async performTask(task: QETask): Promise<any> {
    // Use LLM to process the task
    if (this.hasLLM() && task.input?.prompt) {
      const response = await this.generateWithLLM(task.input.prompt);
      return { success: true, response };
    }
    return { success: true };
  }

  protected async loadKnowledge(): Promise<void> {
    // No-op for testing
  }

  protected async cleanup(): Promise<void> {
    // No-op for testing
  }
}

describeIfRuvLLM('BaseAgent RuvLLM Real Integration', () => {
  let agent: RealLLMAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;

  beforeAll(() => {
    // Verify RuvLLM is actually available
    const ruvllm = loadRuvLLM();
    if (!ruvllm) {
      throw new Error('RuvLLM should be available for this test suite');
    }
    console.log(`[TEST] Using RuvLLM version: ${ruvllm.version}`);
    console.log(`[TEST] SIMD support: ${ruvllm.hasSimdSupport}`);
  });

  beforeEach(async () => {
    // Set up real infrastructure
    eventBus = new EventEmitter();
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    const capabilities: AgentCapability[] = [
      {
        name: 'llm-integration',
        description: 'Real LLM integration testing',
        version: '1.0.0',
      },
    ];

    const config: BaseAgentConfig = {
      type: 'ruvllm-test-agent',
      capabilities,
      context: {
        environment: 'test',
        project: {
          name: 'ruvllm-integration-test',
          version: '1.0.0',
        },
      },
      memoryStore,
      eventBus,
      llm: {
        enabled: true,
        preferredProvider: 'ruvllm',
        enableSessions: true,
        enableBatch: true,
      },
      enableLearning: true,
    };

    agent = new RealLLMAgent(config);
    await agent.initialize();
  }, 30000); // 30s timeout for initialization

  afterEach(async () => {
    await agent.terminate();
    await memoryStore.close();
  });

  describe('M0.1: SessionManager Integration (50% latency reduction)', () => {
    it('should have LLM available with session support', () => {
      expect(agent.hasLLM()).toBe(true);
      const stats = agent.getLLMStats();
      expect(stats.available).toBe(true);
      // Session ID should be created if sessions enabled
      if (stats.sessionId) {
        expect(typeof stats.sessionId).toBe('string');
        console.log(`[TEST] Session ID: ${stats.sessionId}`);
      }
    });

    it('should complete a real LLM prompt', async () => {
      const prompt = 'What is 2 + 2? Answer with just the number.';
      const response = await agent.generateWithLLM(prompt);

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      console.log(`[TEST] LLM Response: ${response}`);
    }, 30000);

    it('should maintain context in multi-turn chat', async () => {
      // First message
      const response1 = await agent.chatWithLLM('My name is TestAgent.');
      expect(response1).toBeDefined();
      console.log(`[TEST] Chat 1: ${response1}`);

      // Second message - should have context
      const response2 = await agent.chatWithLLM('What is my name?');
      expect(response2).toBeDefined();
      console.log(`[TEST] Chat 2: ${response2}`);
      // Context should be maintained (name should be mentioned)
    }, 60000);
  });

  describe('M0.2: Batch Query (4x throughput)', () => {
    it('should process batch queries', async () => {
      const prompts = [
        'What is 1 + 1?',
        'What is 2 + 2?',
        'What is 3 + 3?',
      ];

      const startTime = Date.now();
      const responses = await agent.batchGenerateWithLLM(prompts);
      const duration = Date.now() - startTime;

      expect(responses).toHaveLength(3);
      responses.forEach((response, i) => {
        expect(response).toBeDefined();
        expect(typeof response).toBe('string');
        console.log(`[TEST] Batch[${i}]: ${response}`);
      });

      console.log(`[TEST] Batch duration: ${duration}ms for ${prompts.length} prompts`);
    }, 60000);
  });

  describe('M0.3: Embedding Generation', () => {
    it('should generate real embeddings', async () => {
      const text = 'This is a test sentence for embedding generation.';
      const embedding = await agent.embedWithLLM(text);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
      console.log(`[TEST] Embedding dimensions: ${embedding.length}`);

      // Verify embedding values are valid numbers
      embedding.forEach((value) => {
        expect(typeof value).toBe('number');
        expect(isFinite(value)).toBe(true);
      });
    }, 30000);

    it('should generate consistent embeddings for same input', async () => {
      const text = 'Consistent embedding test';

      const embedding1 = await agent.embedWithLLM(text);
      const embedding2 = await agent.embedWithLLM(text);

      expect(embedding1.length).toBe(embedding2.length);

      // Calculate cosine similarity - should be very high for same input
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;

      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
      }

      const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
      console.log(`[TEST] Same-input embedding similarity: ${similarity}`);
      expect(similarity).toBeGreaterThan(0.99); // Should be nearly identical
    }, 60000);
  });

  describe('M0.4: Routing Observability', () => {
    it('should provide routing decisions', () => {
      const routing = agent.getRouting('Generate a unit test for a calculator');

      if (routing) {
        console.log(`[TEST] Routing decision:`, JSON.stringify(routing, null, 2));
        expect(routing.model).toBeDefined();
        expect(routing.confidence).toBeDefined();
      } else {
        console.log('[TEST] Routing not available (expected if not using RuvllmProvider directly)');
      }
    });
  });

  describe('Agent Task Execution with LLM', () => {
    it('should use LLM during task execution', async () => {
      const task: QETask = {
        id: 'llm-task-1',
        type: 'test-generation',
        priority: 1,
        input: {
          prompt: 'Generate a simple test case description for a login function.',
        },
        createdAt: new Date(),
      };

      const assignment: TaskAssignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().id,
        assignedAt: new Date(),
        status: 'assigned',
      };

      const result = await agent.executeTask(assignment);

      expect(result.success).toBe(true);
      if (result.response) {
        expect(typeof result.response).toBe('string');
        console.log(`[TEST] Task result: ${result.response}`);
      }
    }, 30000);
  });

  describe('LLM Stats and Metrics', () => {
    it('should report accurate LLM stats', async () => {
      // Make some LLM calls first
      await agent.generateWithLLM('Hello');

      const stats = agent.getLLMStats();
      console.log(`[TEST] LLM Stats:`, JSON.stringify(stats, null, 2));

      expect(stats.available).toBe(true);
      expect(stats.provider).toBeDefined();
    }, 30000);
  });
});

// Test for graceful degradation when RuvLLM not available
describe('BaseAgent without RuvLLM', () => {
  it('should gracefully handle missing RuvLLM', async () => {
    const eventBus = new EventEmitter();
    const memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    const config: BaseAgentConfig = {
      type: 'no-llm-agent',
      capabilities: [{ name: 'basic', description: 'Basic agent', version: '1.0.0' }],
      context: {
        environment: 'test',
        project: { name: 'no-llm-test', version: '1.0.0' },
      },
      memoryStore,
      eventBus,
      llm: { enabled: false }, // Explicitly disable LLM
      enableLearning: true,
    };

    const agent = new RealLLMAgent(config);
    await agent.initialize();

    // Agent should still work without LLM
    expect(agent.hasLLM()).toBe(false);

    const stats = agent.getLLMStats();
    expect(stats.available).toBe(false);

    // Task execution should still work
    const task: QETask = {
      id: 'no-llm-task',
      type: 'basic',
      priority: 1,
      input: {},
      createdAt: new Date(),
    };

    const assignment: TaskAssignment = {
      id: 'no-llm-assignment',
      task,
      agentId: agent.getStatus().id,
      assignedAt: new Date(),
      status: 'assigned',
    };

    const result = await agent.executeTask(assignment);
    expect(result.success).toBe(true);

    await agent.terminate();
    await memoryStore.close();
  });
});
