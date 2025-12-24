/**
 * BaseAgent AgentLLM Integration Tests
 * Phase 1.2.2: Verify BaseAgent properly wraps ILLMProvider with IAgentLLM
 */

import { BaseAgent, BaseAgentConfig } from '../../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QETask } from '../../../src/types';
import type { ILLMProvider, LLMCompletionOptions, LLMCompletionResponse } from '../../../src/providers/ILLMProvider';
import type { IAgentLLM } from '../../../src/agents/interfaces/IAgentLLM';

// Mock agent implementation for testing
class TestAgent extends BaseAgent {
  protected async initializeComponents(): Promise<void> {
    // No-op for test
  }

  protected async performTask(task: QETask): Promise<any> {
    return { result: 'test' };
  }

  protected async loadKnowledge(): Promise<void> {
    // No-op for test
  }

  protected async cleanup(): Promise<void> {
    // No-op for test
  }

  // Expose agentLLM for testing
  public getTestAgentLLM(): IAgentLLM | undefined {
    return this.agentLLM;
  }
}

// Mock LLM Provider
class MockLLMProvider implements ILLMProvider {
  async initialize(): Promise<void> {}

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    return {
      id: 'test-id',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Mock response' }],
      model: 'mock-model',
      stopReason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }

  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<any> {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Mock' } };
  }

  async embed(options: { text: string }): Promise<{ embedding: number[] }> {
    return { embedding: [0.1, 0.2, 0.3] };
  }

  async healthCheck(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }

  getMetadata() {
    return {
      name: 'mock-provider',
      type: 'local' as const,
      location: 'local' as const,
      models: ['mock-model'],
      capabilities: {
        streaming: true,
        vision: false,
      },
      costs: {
        inputPerMillion: 0,
        outputPerMillion: 0,
      },
    };
  }

  async shutdown(): Promise<void> {}
}

describe('BaseAgent AgentLLM Integration', () => {
  let memoryStore: SwarmMemoryManager;
  let agent: TestAgent;
  let mockProvider: MockLLMProvider;

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    mockProvider = new MockLLMProvider();
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
    // Note: SwarmMemoryManager doesn't have shutdown() in test mode
  });

  describe('AgentLLM Initialization', () => {
    it('should create agentLLM when LLM provider is injected', async () => {
      const config: BaseAgentConfig = {
        type: 'test-generator',
        memoryStore,
        llm: {
          enabled: true,
          provider: mockProvider,
        },
      };

      agent = new TestAgent(config);
      await agent.initialize();

      // Verify agentLLM is created
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeDefined();
      expect(agent.hasLLM()).toBe(true);
    });

    it('should not create agentLLM when LLM is disabled', async () => {
      const config: BaseAgentConfig = {
        type: 'test-generator',
        memoryStore,
        llm: {
          enabled: false,
        },
      };

      agent = new TestAgent(config);
      await agent.initialize();

      // Verify agentLLM is not created
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeUndefined();
      expect(agent.hasLLM()).toBe(false);
    });

    it('should expose both getLLMProvider() and getAgentLLM()', async () => {
      const config: BaseAgentConfig = {
        type: 'test-generator',
        memoryStore,
        llm: {
          enabled: true,
          provider: mockProvider,
        },
      };

      agent = new TestAgent(config);
      await agent.initialize();

      // Both interfaces should be available
      expect(agent.getLLMProvider()).toBe(mockProvider);
      expect(agent.getAgentLLM()).toBeDefined();
    });
  });

  describe('AgentLLM API Usage', () => {
    beforeEach(async () => {
      const config: BaseAgentConfig = {
        type: 'test-generator',
        memoryStore,
        llm: {
          enabled: true,
          provider: mockProvider,
        },
      };

      agent = new TestAgent(config);
      await agent.initialize();
    });

    it('should use agentLLM.complete() for simple completions', async () => {
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeDefined();

      const result = await agentLLM!.complete('Test prompt', {
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(result).toBe('Mock response');
    });

    it('should track usage statistics', async () => {
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeDefined();

      // Make a request
      await agentLLM!.complete('Test prompt');

      // Check stats
      const stats = agentLLM!.getUsageStats();
      expect(stats.requestCount).toBe(1);
      expect(stats.tokensUsed).toBe(15); // 10 input + 5 output from mock
    });

    it('should generate embeddings', async () => {
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeDefined();

      const embedding = await agentLLM!.embed('Test text');
      expect(embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should check health status', async () => {
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeDefined();

      const isHealthy = await agentLLM!.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it('should get available models', async () => {
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeDefined();

      const models = await agentLLM!.getAvailableModels();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('mock-model');
      expect(models[0].provider).toBe('mock-provider');
    });

    it('should get current model', async () => {
      const agentLLM = agent.getAgentLLM();
      expect(agentLLM).toBeDefined();

      const currentModel = agentLLM!.getCurrentModel();
      expect(currentModel).toBe('mock-model');
    });
  });

  describe('Backward Compatibility', () => {
    beforeEach(async () => {
      const config: BaseAgentConfig = {
        type: 'test-generator',
        memoryStore,
        llm: {
          enabled: true,
          provider: mockProvider,
        },
      };

      agent = new TestAgent(config);
      await agent.initialize();
    });

    it('should maintain hasLLM() compatibility', async () => {
      // hasLLM() should work with both agentLLM and llmProvider
      expect(agent.hasLLM()).toBe(true);
      expect(agent.getLLMProvider()).toBeDefined();
      expect(agent.getAgentLLM()).toBeDefined();
    });

    it('should maintain getLLMProvider() access for advanced usage', async () => {
      const provider = agent.getLLMProvider();
      expect(provider).toBe(mockProvider);

      // Provider should still be usable directly
      const response = await provider!.complete({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'test' }],
      });
      expect(response.content[0].text).toBe('Mock response');
    });
  });
});
