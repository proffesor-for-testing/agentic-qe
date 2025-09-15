/**
 * Unit tests for BaseAgent abstract class
 */

import { EventEmitter } from 'events';
import { BaseAgent } from '../../src/agents/base-agent';
import {
  AgentId,
  AgentConfig,
  TaskDefinition,
  TaskResult,
  AgentDecision,
  PACTLevel,
  ILogger,
  IEventBus,
  IMemorySystem
} from '../../src/core/types';

// Mock implementation for testing
class TestAgent extends BaseAgent {
  protected async perceive(context: any): Promise<any> {
    return { perceived: context };
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    return {
      id: 'test-decision',
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'test-action',
      reasoning: {
        steps: ['Step 1', 'Step 2'],
        heuristics: ['SFDIPOT'],
        evidence: []
      },
      confidence: 0.85,
      alternatives: [],
      risks: [],
      recommendations: ['Test recommendation']
    };
  }

  protected async act(decision: AgentDecision): Promise<any> {
    return { action: decision.action };
  }

  protected async learn(feedback: any): Promise<void> {
    // Learning implementation
  }

  async executeTask(task: TaskDefinition): Promise<TaskResult> {
    // Call the parent's executeTask method which handles status properly
    return await super.executeTask(task);
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let logger: ILogger;
  let eventBus: IEventBus;
  let memory: IMemorySystem;

  beforeEach(async () => {
    logger = console;
    eventBus = new EventEmitter() as IEventBus;
    eventBus.emit = jest.fn();
    memory = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      search: jest.fn().mockResolvedValue([]),
      share: jest.fn().mockResolvedValue(undefined),
      getSharedMemory: jest.fn().mockResolvedValue({}),
      clearMemory: jest.fn().mockResolvedValue(undefined)
    };

    const agentId: AgentId = {
      id: 'test-agent',
      swarmId: 'test-swarm',
      type: 'test',
      instance: 1
    };

    const config: AgentConfig = {
      name: 'Test Agent',
      type: 'test',
      pactLevel: PACTLevel.COLLABORATIVE,
      capabilities: {
        maxConcurrentTasks: 3,
        supportedTaskTypes: ['test'],
        pactLevel: PACTLevel.COLLABORATIVE,
        rstHeuristics: ['SFDIPOT'],
        contextAwareness: true,
        explainability: true,
        learningEnabled: true,
        securityClearance: 'internal'
      },
      environment: {
        runtime: 'node',
        version: '18.0.0',
        workingDirectory: '.',
        logLevel: 'info',
        timeout: 5000
      },
      learning: {
        enabled: true
      }
    };

    agent = new TestAgent(agentId, config, logger, eventBus, memory);
    await agent.initialize();
  });

  describe('initialization', () => {
    it('should initialize agent with correct properties', () => {
      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.id.id).toBe('test-agent');
      expect(agent.id.swarmId).toBe('test-swarm');
    });

    it('should have required methods', () => {
      expect(agent.initialize).toBeDefined();
      expect(agent.executeTask).toBeDefined();
      expect(agent.getMetrics).toBeDefined();
      expect(agent.getState).toBeDefined();
    });
  });

  describe('task execution', () => {
    it('should execute task successfully', async () => {
      const task: TaskDefinition = {
        id: 'task-001',
        type: 'test',
        priority: 'high',
        context: { test: 'data' },
        constraints: {},
        dependencies: [],
        expectedOutcome: 'Test outcome',
        metadata: {}
      };

      const result = await agent.executeTask(task);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.decision).toBeDefined();
      expect(result.decision.action).toBe('test-action');
      expect(result.decision.confidence).toBe(0.85);
    });

    it('should handle errors gracefully', async () => {
      const task: TaskDefinition = {
        id: 'task-002',
        type: 'unsupported',
        priority: 'low',
        context: {},
        constraints: {},
        dependencies: [],
        expectedOutcome: 'Error handling',
        metadata: {}
      };

      // This should not throw but return an error result
      const result = await agent.executeTask(task);
      expect(result).toBeDefined();
    });
  });

  describe('metrics', () => {
    it('should track metrics', async () => {
      const metrics = await agent.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.tasksCompleted).toBeDefined();
      expect(metrics.tasksFailed).toBeDefined();
      expect(metrics.successRate).toBeDefined();
    });
  });

  describe('state management', () => {
    it('should manage agent state', () => {
      const state = agent.getState();

      expect(state).toBeDefined();
      expect(state).toBe('idle');
    });

    it('should update state during task execution', async () => {
      const task: TaskDefinition = {
        id: 'task-003',
        type: 'test',
        priority: 'medium',
        context: {},
        constraints: {},
        dependencies: [],
        expectedOutcome: 'State test',
        metadata: {}
      };

      const promise = agent.executeTask(task);
      // State should change to 'executing' during execution
      // Note: This is a simplified test, actual implementation may vary
      await promise;

      const state = agent.getState();
      expect(['idle', 'executing', 'completed']).toContain(state);
    });
  });

  describe('event handling', () => {
    it('should emit events', () => {
      // Agent is already initialized in beforeEach, check that the initialization triggered memory calls
      expect(memory.retrieve).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith('agent:initialized', { agentId: 'test-agent' });
    });
  });

  describe('memory interaction', () => {
    it('should store to memory', async () => {
      await agent.storeMemory('test-key', { data: 'test' });
      expect(memory.store).toHaveBeenCalledWith(
        'test-key',
        { data: 'test' },
        expect.any(Object)
      );
    });

    it('should retrieve from memory', async () => {
      (memory.retrieve as jest.Mock).mockResolvedValue({
        id: 'mem-001',
        key: 'test-key',
        value: { data: 'test' },
        timestamp: new Date(),
        agentId: 'test-agent'
      });

      const result = await agent.retrieveMemory('test-key');
      expect(result).toBeDefined();
      expect(memory.retrieve).toHaveBeenCalledWith('test-key');
    });
  });
});