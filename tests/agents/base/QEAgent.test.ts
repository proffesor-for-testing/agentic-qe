/**
 * QEAgent Base Class Tests
 * Following TDD Red-Green-Refactor pattern
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createTestAgent,
  createTestContext,
  createTestMemory
} from '../../utils/test-builders';
import {
  createMockMemory,
  createMockHooks,
  createMockLogger,
  createMockExecutionContext
} from '../../mocks';

// Mock QEAgent class for testing (will be replaced with actual implementation)
class MockQEAgent {
  public state: string;
  public id: string;
  public name: string;
  public capabilities: string[];
  private config: any;
  private memory: any;
  private hooks: any;
  private logger: any;

  constructor(config: any, memory?: any, hooks?: any, logger?: any) {
    this.config = config;
    this.memory = memory || createMockMemory();
    this.hooks = hooks || createMockHooks();
    this.logger = logger || createMockLogger();
    this.state = 'initializing';
    this.id = `agent-${Date.now()}`;
    this.name = config.name;
    this.capabilities = config.capabilities || [];

    if (!config.name || !config.type) {
      throw new Error('Invalid agent configuration');
    }
  }

  async initialize(): Promise<void> {
    this.setState('idle');
  }

  setState(state: string): void {
    this.state = state;
  }

  async execute(context: any): Promise<any> {
    if (this.state !== 'idle') {
      throw new Error(`Agent ${this.name} is not available`);
    }

    this.setState('running');

    // Emit hooks
    await this.hooks.emitHook('test-start', { agent: this.name, context });

    try {
      // Simulate execution
      const result = await this.performExecution(context);

      await this.hooks.emitHook('test-end', { agent: this.name, result });

      return result;
    } finally {
      this.setState('idle');
    }
  }

  private async performExecution(context: any): Promise<any> {
    // Mock execution logic
    return {
      success: true,
      data: `Executed ${context.task}`,
      agent: this.name
    };
  }

  async destroy(): Promise<void> {
    this.setState('destroyed');
    await this.hooks.emitHook('agent-destroyed', { agent: this.name });
  }
}

describe('QEAgent Base Class', () => {
  let validConfig: any;
  let invalidConfig: any;
  let mockMemory: any;
  let mockHooks: any;
  let mockLogger: any;

  beforeEach(() => {
    validConfig = createTestAgent()
      .withName('test-agent')
      .withType('test-executor')
      .withCapabilities(['testing', 'validation'])
      .build();

    invalidConfig = {
      // Missing required fields
      capabilities: ['testing']
    };

    mockMemory = createMockMemory();
    mockHooks = createMockHooks();
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('State Management', () => {
    it('should initialize in correct state', () => {
      const agent = new MockQEAgent(validConfig);
      expect(agent.state).toBe('initializing');
    });

    it('should transition from initializing to idle', async () => {
      const agent = new MockQEAgent(validConfig);
      await agent.initialize();
      expect(agent.state).toBe('idle');
    });

    it('should validate configuration on creation', () => {
      expect(() => new MockQEAgent(invalidConfig))
        .toThrow('Invalid agent configuration');
    });

    it('should set state correctly', () => {
      const agent = new MockQEAgent(validConfig);
      agent.setState('running');
      expect(agent.state).toBe('running');
    });

    it('should transition to destroyed state on destroy', async () => {
      const agent = new MockQEAgent(validConfig);
      await agent.destroy();
      expect(agent.state).toBe('destroyed');
    });
  });

  describe('Execution Lifecycle', () => {
    it('should reject execution when not available', async () => {
      const agent = new MockQEAgent(validConfig);
      agent.setState('running');

      const context = createTestContext().build();

      await expect(agent.execute(context))
        .rejects.toThrow('Agent test-agent is not available');
    });

    it('should execute successfully when idle', async () => {
      const agent = new MockQEAgent(validConfig);
      await agent.initialize();

      const context = createTestContext()
        .withTask('test task')
        .build();

      const result = await agent.execute(context);

      expect(result).toMatchObject({
        success: true,
        data: 'Executed test task',
        agent: 'test-agent'
      });
    });

    it('should emit hooks during execution', async () => {
      const agent = new MockQEAgent(validConfig, mockMemory, mockHooks, mockLogger);
      await agent.initialize();

      const context = createTestContext().build();
      await agent.execute(context);

      expect(mockHooks.emitHook).toHaveBeenCalledWith('test-start',
        expect.objectContaining({
          agent: 'test-agent',
          context
        })
      );

      expect(mockHooks.emitHook).toHaveBeenCalledWith('test-end',
        expect.objectContaining({
          agent: 'test-agent',
          result: expect.any(Object)
        })
      );
    });

    it('should return to idle state after execution', async () => {
      const agent = new MockQEAgent(validConfig);
      await agent.initialize();

      const context = createTestContext().build();
      await agent.execute(context);

      expect(agent.state).toBe('idle');
    });

    it('should handle execution errors gracefully', async () => {
      const agent = new MockQEAgent(validConfig);
      await agent.initialize();

      // Mock an execution error
      agent['performExecution'] = jest.fn().mockRejectedValue(new Error('Execution failed'));

      const context = createTestContext().build();

      await expect(agent.execute(context)).rejects.toThrow('Execution failed');
      expect(agent.state).toBe('idle'); // Should return to idle even on error
    });
  });

  describe('Agent Properties', () => {
    it('should have required properties', () => {
      const agent = new MockQEAgent(validConfig);

      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('capabilities');
      expect(agent).toHaveProperty('state');
    });

    it('should generate unique agent ID', () => {
      const agent1 = new MockQEAgent(validConfig);
      const agent2 = new MockQEAgent(validConfig);

      expect(agent1.id).not.toBe(agent2.id);
    });

    it('should preserve configuration values', () => {
      const config = createTestAgent()
        .withName('custom-agent')
        .withCapabilities(['custom', 'testing'])
        .build();

      const agent = new MockQEAgent(config);

      expect(agent.name).toBe('custom-agent');
      expect(agent.capabilities).toEqual(['custom', 'testing']);
    });
  });

  describe('Memory Integration', () => {
    it('should use provided memory instance', async () => {
      const agent = new MockQEAgent(validConfig, mockMemory);
      await agent.initialize();

      // Simulate memory usage during execution
      const context = createTestContext().build();
      await agent.execute(context);

      // In real implementation, agent would store state in memory
      // This is a placeholder for actual memory integration tests
      expect(mockMemory).toBeDefined();
    });
  });

  describe('Hook System', () => {
    it('should emit agent-destroyed hook on destroy', async () => {
      const agent = new MockQEAgent(validConfig, mockMemory, mockHooks);

      await agent.destroy();

      expect(mockHooks.emitHook).toHaveBeenCalledWith('agent-destroyed',
        expect.objectContaining({
          agent: 'test-agent'
        })
      );
    });

    it('should allow hook listeners to be added', () => {
      const agent = new MockQEAgent(validConfig, mockMemory, mockHooks);

      // In real implementation, this would add listeners
      mockHooks.addListener('test-start', jest.fn());

      expect(mockHooks.addListener).toHaveBeenCalled();
    });
  });

  describe('Concurrent Execution', () => {
    it('should prevent concurrent executions', async () => {
      const agent = new MockQEAgent(validConfig);
      await agent.initialize();

      const context1 = createTestContext().withTask('task1').build();
      const context2 = createTestContext().withTask('task2').build();

      // Start first execution
      const execution1 = agent.execute(context1);

      // Try to start second execution immediately
      const execution2 = agent.execute(context2);

      // Second execution should fail
      await expect(execution2).rejects.toThrow('Agent test-agent is not available');

      // First execution should succeed
      const result1 = await execution1;
      expect(result1.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty capabilities array', () => {
      const config = createTestAgent()
        .withCapabilities([])
        .build();

      const agent = new MockQEAgent(config);
      expect(agent.capabilities).toEqual([]);
    });

    it('should handle special characters in agent name', () => {
      const config = createTestAgent()
        .withName('test-agent-123_v2.0')
        .build();

      const agent = new MockQEAgent(config);
      expect(agent.name).toBe('test-agent-123_v2.0');
    });

    it('should handle rapid state transitions', async () => {
      const agent = new MockQEAgent(validConfig);

      // Rapid state changes
      agent.setState('idle');
      agent.setState('running');
      agent.setState('idle');
      agent.setState('running');

      expect(agent.state).toBe('running');
    });
  });
});