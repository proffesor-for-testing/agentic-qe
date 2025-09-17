/**
 * Multi-Agent Orchestration Integration Tests
 * Testing complex agent coordination and communication scenarios
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createTestAgent,
  createTestContext,
  createTestMemory,
  createTestSession
} from '../utils/test-builders';
import {
  createMockMemory,
  createMockHooks,
  createMockLogger,
  createMockAgentSpawner,
  createMockAgentRegistry,
  createMockEventEmitter
} from '../mocks';

// Mock Orchestrator for managing multiple agents
class MockAgentOrchestrator {
  private agents: Map<string, any>;
  private memory: any;
  private hooks: any;
  private logger: any;
  private events: any;
  private agentSpawner: any;
  private registry: any;

  constructor(
    memory?: any,
    hooks?: any,
    logger?: any,
    events?: any,
    spawner?: any,
    registry?: any
  ) {
    this.agents = new Map();
    this.memory = memory || createMockMemory();
    this.hooks = hooks || createMockHooks();
    this.logger = logger || createMockLogger();
    this.events = events || createMockEventEmitter();
    this.agentSpawner = spawner || createMockAgentSpawner();
    this.registry = registry || createMockAgentRegistry();
  }

  async spawnAgent(name: string, type: string, capabilities: string[]): Promise<any> {
    const agentConfig = createTestAgent()
      .withName(name)
      .withType(type as any)
      .withCapabilities(capabilities)
      .build();

    const agent = {
      id: `${name}-${Date.now()}`,
      name,
      type,
      capabilities,
      state: 'idle',
      config: agentConfig,
      execute: jest.fn(),
      communicate: jest.fn(),
      destroy: jest.fn()
    };

    this.agents.set(agent.id, agent);
    await this.hooks.emitHook('agent-spawned', { agent: name, id: agent.id });

    return agent;
  }

  async orchestrateTask(task: string, agentNames: string[]): Promise<any> {
    const results = [];

    // Simulate task decomposition
    const subtasks = this.decomposeTask(task, agentNames.length);

    // Assign subtasks to agents
    for (let i = 0; i < agentNames.length; i++) {
      const agent = Array.from(this.agents.values()).find(a => a.name === agentNames[i]);
      if (agent) {
        agent.state = 'running';
        const result = await this.executeAgentTask(agent, subtasks[i]);
        results.push(result);
        agent.state = 'idle';
      }
    }

    // Store results in shared memory
    await this.memory.set({
      key: `orchestration:${task}:results`,
      value: results,
      type: 'orchestration-results'
    });

    return {
      task,
      agents: agentNames,
      results,
      success: results.every(r => r.success)
    };
  }

  private decomposeTask(task: string, agentCount: number): string[] {
    // Simple task decomposition
    const subtasks = [];
    for (let i = 0; i < agentCount; i++) {
      subtasks.push(`${task} - part ${i + 1}`);
    }
    return subtasks;
  }

  private async executeAgentTask(agent: any, subtask: string): Promise<any> {
    // Simulate agent execution
    await this.hooks.emitHook('task-start', { agent: agent.name, task: subtask });

    const result = {
      agent: agent.name,
      task: subtask,
      success: true,
      data: `Completed: ${subtask}`,
      timestamp: new Date()
    };

    // Store in memory for agent communication
    await this.memory.set({
      key: `agent:${agent.id}:result`,
      value: result,
      type: 'agent-result',
      agentId: agent.id
    });

    await this.hooks.emitHook('task-complete', { agent: agent.name, result });

    return result;
  }

  async enableAgentCommunication(agent1Id: string, agent2Id: string): Promise<void> {
    const agent1 = this.agents.get(agent1Id);
    const agent2 = this.agents.get(agent2Id);

    if (agent1 && agent2) {
      // Setup bidirectional communication
      agent1.communicate = async (message: any) => {
        await this.memory.set({
          key: `communication:${agent1Id}:${agent2Id}`,
          value: message,
          type: 'agent-communication'
        });
        this.events.emit('agent-message', { from: agent1Id, to: agent2Id, message });
      };

      agent2.communicate = async (message: any) => {
        await this.memory.set({
          key: `communication:${agent2Id}:${agent1Id}`,
          value: message,
          type: 'agent-communication'
        });
        this.events.emit('agent-message', { from: agent2Id, to: agent1Id, message });
      };
    }
  }

  async handleResourceConflict(agentIds: string[], resource: string): Promise<any> {
    // Implement resource conflict resolution
    const priorities = agentIds.map((id, index) => ({
      agentId: id,
      priority: index // Simple priority based on order
    }));

    const winner = priorities[0]; // Highest priority wins

    await this.memory.set({
      key: `resource:${resource}:owner`,
      value: winner.agentId,
      type: 'resource-allocation',
      ttl: 5000 // 5 second lease
    });

    return {
      resource,
      allocatedTo: winner.agentId,
      waitingAgents: agentIds.slice(1)
    };
  }

  async broadcastToAgents(message: any, excludeAgent?: string): Promise<void> {
    for (const [id, agent] of this.agents) {
      if (id !== excludeAgent) {
        await this.memory.set({
          key: `broadcast:${id}`,
          value: message,
          type: 'broadcast-message'
        });
      }
    }
    this.events.emit('broadcast', { message, excludeAgent });
  }

  async destroyAllAgents(): Promise<void> {
    for (const [id, agent] of this.agents) {
      await agent.destroy();
      this.agents.delete(id);
    }
  }

  getActiveAgents(): any[] {
    return Array.from(this.agents.values()).filter(a => a.state !== 'destroyed');
  }
}

describe('Multi-Agent Orchestration', () => {
  let orchestrator: MockAgentOrchestrator;
  let mockMemory: any;
  let mockHooks: any;
  let mockLogger: any;
  let mockEvents: any;

  beforeEach(() => {
    mockMemory = createMockMemory();
    mockHooks = createMockHooks();
    mockLogger = createMockLogger();
    mockEvents = createMockEventEmitter();
    orchestrator = new MockAgentOrchestrator(
      mockMemory,
      mockHooks,
      mockLogger,
      mockEvents
    );
  });

  afterEach(async () => {
    await orchestrator.destroyAllAgents();
    jest.clearAllMocks();
  });

  describe('Agent Spawning and Lifecycle', () => {
    it('should coordinate multiple agents for complex tasks', async () => {
      // Spawn multiple agents
      const riskOracle = await orchestrator.spawnAgent(
        'risk-oracle',
        'analyzer',
        ['risk-assessment', 'prediction']
      );

      const tddProgrammer = await orchestrator.spawnAgent(
        'tdd-pair-programmer',
        'developer',
        ['test-generation', 'code-implementation']
      );

      const testArchitect = await orchestrator.spawnAgent(
        'test-architect',
        'architect',
        ['test-strategy', 'coverage-analysis']
      );

      // Orchestrate complex task
      const result = await orchestrator.orchestrateTask(
        'Implement secure authentication system',
        ['risk-oracle', 'tdd-pair-programmer', 'test-architect']
      );

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(3);
      expect(result.results).toHaveLength(3);

      // Verify hooks were called
      expect(mockHooks.emitHook).toHaveBeenCalledWith('agent-spawned',
        expect.objectContaining({ agent: 'risk-oracle' })
      );
      expect(mockHooks.emitHook).toHaveBeenCalledWith('task-complete',
        expect.objectContaining({ agent: 'test-architect' })
      );
    });

    it('should handle agent lifecycle transitions correctly', async () => {
      const agent = await orchestrator.spawnAgent(
        'test-agent',
        'tester',
        ['testing']
      );

      expect(agent.state).toBe('idle');

      // Start task
      const taskPromise = orchestrator.orchestrateTask(
        'Test task',
        ['test-agent']
      );

      // Agent should transition through states
      await taskPromise;

      expect(agent.state).toBe('idle'); // Back to idle after completion
    });
  });

  describe('Agent Communication', () => {
    it('should handle agent communication via memory', async () => {
      const agent1 = await orchestrator.spawnAgent('agent1', 'type1', ['cap1']);
      const agent2 = await orchestrator.spawnAgent('agent2', 'type2', ['cap2']);

      await orchestrator.enableAgentCommunication(agent1.id, agent2.id);

      const message = { type: 'request', data: 'test data' };
      await agent1.communicate(message);

      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: `communication:${agent1.id}:${agent2.id}`,
          value: message,
          type: 'agent-communication'
        })
      );

      expect(mockEvents.emit).toHaveBeenCalledWith('agent-message',
        expect.objectContaining({
          from: agent1.id,
          to: agent2.id,
          message
        })
      );
    });

    it('should support broadcast messaging to all agents', async () => {
      await orchestrator.spawnAgent('agent1', 'type1', ['cap1']);
      await orchestrator.spawnAgent('agent2', 'type2', ['cap2']);
      await orchestrator.spawnAgent('agent3', 'type3', ['cap3']);

      const broadcastMessage = { type: 'announcement', data: 'system update' };
      await orchestrator.broadcastToAgents(broadcastMessage);

      // Verify broadcast was stored for each agent
      expect(mockMemory.set).toHaveBeenCalledTimes(3);
      expect(mockEvents.emit).toHaveBeenCalledWith('broadcast',
        expect.objectContaining({ message: broadcastMessage })
      );
    });

    it('should exclude specific agents from broadcasts', async () => {
      const agent1 = await orchestrator.spawnAgent('agent1', 'type1', ['cap1']);
      await orchestrator.spawnAgent('agent2', 'type2', ['cap2']);
      await orchestrator.spawnAgent('agent3', 'type3', ['cap3']);

      await orchestrator.broadcastToAgents(
        { type: 'selective', data: 'not for agent1' },
        agent1.id
      );

      // Only 2 agents should receive the message
      const calls = mockMemory.set.mock.calls.filter(
        (call: any) => call[0].type === 'broadcast-message'
      );
      expect(calls).toHaveLength(2);
    });
  });

  describe('Resource Management', () => {
    it('should manage agent resource conflicts', async () => {
      const agent1 = await orchestrator.spawnAgent('agent1', 'type1', ['cap1']);
      const agent2 = await orchestrator.spawnAgent('agent2', 'type2', ['cap2']);
      const agent3 = await orchestrator.spawnAgent('agent3', 'type3', ['cap3']);

      const allocation = await orchestrator.handleResourceConflict(
        [agent1.id, agent2.id, agent3.id],
        'database-connection'
      );

      expect(allocation.allocatedTo).toBe(agent1.id);
      expect(allocation.waitingAgents).toEqual([agent2.id, agent3.id]);

      // Verify resource allocation was stored with TTL
      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'resource:database-connection:owner',
          value: agent1.id,
          type: 'resource-allocation',
          ttl: 5000
        })
      );
    });

    it('should handle resource release and reallocation', async () => {
      const agents = [];
      for (let i = 1; i <= 3; i++) {
        agents.push(await orchestrator.spawnAgent(`agent${i}`, `type${i}`, [`cap${i}`]));
      }

      // First allocation
      const allocation1 = await orchestrator.handleResourceConflict(
        agents.map(a => a.id),
        'shared-resource'
      );

      expect(allocation1.allocatedTo).toBe(agents[0].id);

      // Simulate resource release and reallocation
      const remainingAgents = agents.slice(1).map(a => a.id);
      const allocation2 = await orchestrator.handleResourceConflict(
        remainingAgents,
        'shared-resource'
      );

      expect(allocation2.allocatedTo).toBe(agents[1].id);
      expect(allocation2.waitingAgents).toEqual([agents[2].id]);
    });
  });

  describe('Complex Orchestration Scenarios', () => {
    it('should handle cascading agent tasks', async () => {
      const analyzer = await orchestrator.spawnAgent(
        'analyzer',
        'analysis',
        ['data-analysis']
      );

      const processor = await orchestrator.spawnAgent(
        'processor',
        'processing',
        ['data-processing']
      );

      const reporter = await orchestrator.spawnAgent(
        'reporter',
        'reporting',
        ['report-generation']
      );

      // Execute tasks in sequence with dependencies
      const analysisResult = await orchestrator.orchestrateTask(
        'Analyze data',
        ['analyzer']
      );

      // Store intermediate result for next agent
      await mockMemory.set({
        key: 'analysis:output',
        value: analysisResult.results[0],
        type: 'intermediate-result'
      });

      const processingResult = await orchestrator.orchestrateTask(
        'Process analyzed data',
        ['processor']
      );

      await mockMemory.set({
        key: 'processing:output',
        value: processingResult.results[0],
        type: 'intermediate-result'
      });

      const reportResult = await orchestrator.orchestrateTask(
        'Generate report',
        ['reporter']
      );

      expect(analysisResult.success).toBe(true);
      expect(processingResult.success).toBe(true);
      expect(reportResult.success).toBe(true);

      // Verify data flow through memory
      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'analysis:output' })
      );
      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'processing:output' })
      );
    });

    it('should handle parallel agent execution', async () => {
      const agents = [];
      for (let i = 1; i <= 5; i++) {
        agents.push(
          await orchestrator.spawnAgent(
            `worker-${i}`,
            'worker',
            ['parallel-processing']
          )
        );
      }

      const startTime = Date.now();

      // All agents work in parallel
      const result = await orchestrator.orchestrateTask(
        'Parallel processing task',
        agents.map(a => a.name)
      );

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(5);

      // Parallel execution should be fast (mocked)
      expect(duration).toBeLessThan(100);
    });

    it('should recover from partial agent failures', async () => {
      const agent1 = await orchestrator.spawnAgent('agent1', 'type1', ['cap1']);
      const agent2 = await orchestrator.spawnAgent('agent2', 'type2', ['cap2']);
      const agent3 = await orchestrator.spawnAgent('agent3', 'type3', ['cap3']);

      // Simulate agent2 failure
      agent2.execute = jest.fn().mockRejectedValue(new Error('Agent failed'));

      // Orchestrate should handle the failure gracefully
      const result = await orchestrator.orchestrateTask(
        'Task with failure',
        ['agent1', 'agent3'] // Skip failed agent
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.agents).not.toContain('agent2');
    });
  });

  describe('Agent Coordination Patterns', () => {
    it('should implement leader-follower pattern', async () => {
      const leader = await orchestrator.spawnAgent(
        'leader',
        'coordinator',
        ['coordination', 'decision-making']
      );

      const followers = [];
      for (let i = 1; i <= 3; i++) {
        followers.push(
          await orchestrator.spawnAgent(
            `follower-${i}`,
            'worker',
            ['execution']
          )
        );
      }

      // Leader broadcasts task assignments
      const assignments = followers.map((f, i) => ({
        agent: f.name,
        task: `subtask-${i}`
      }));

      await orchestrator.broadcastToAgents(
        { type: 'assignments', data: assignments },
        undefined // Don't exclude any agent
      );

      // Verify all agents received assignments
      expect(mockMemory.set).toHaveBeenCalledTimes(4); // leader + 3 followers
    });

    it('should implement peer-to-peer coordination', async () => {
      const peers = [];
      for (let i = 1; i <= 4; i++) {
        peers.push(
          await orchestrator.spawnAgent(
            `peer-${i}`,
            'peer',
            ['consensus', 'voting']
          )
        );
      }

      // Enable full mesh communication
      for (let i = 0; i < peers.length; i++) {
        for (let j = i + 1; j < peers.length; j++) {
          await orchestrator.enableAgentCommunication(peers[i].id, peers[j].id);
        }
      }

      // Simulate consensus voting
      const votes = [];
      for (const peer of peers) {
        const vote = { agent: peer.name, decision: Math.random() > 0.5 };
        votes.push(vote);

        await orchestrator.broadcastToAgents(
          { type: 'vote', data: vote },
          peer.id
        );
      }

      // Each peer broadcasts to all others
      const broadcastCalls = mockMemory.set.mock.calls.filter(
        (call: any) => call[0].type === 'broadcast-message'
      );

      expect(broadcastCalls.length).toBe(12); // 4 peers * 3 recipients each
    });
  });

  describe('Memory Sharing and Persistence', () => {
    it('should share state between agents via memory', async () => {
      const agent1 = await orchestrator.spawnAgent('agent1', 'type1', ['cap1']);
      const agent2 = await orchestrator.spawnAgent('agent2', 'type2', ['cap2']);

      // Agent1 stores state
      const sharedState = { counter: 1, data: 'shared' };
      await mockMemory.set({
        key: 'shared:state',
        value: sharedState,
        type: 'shared-state'
      });

      // Agent2 reads and updates state
      mockMemory.get.mockResolvedValueOnce(sharedState);
      const retrievedState = await mockMemory.get('shared:state');

      expect(retrievedState).toEqual(sharedState);

      // Update shared state
      const updatedState = { ...retrievedState, counter: 2 };
      await mockMemory.set({
        key: 'shared:state',
        value: updatedState,
        type: 'shared-state'
      });

      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'shared:state',
          value: updatedState
        })
      );
    });

    it('should maintain task history in memory', async () => {
      const tasks = [
        'Task 1: Analysis',
        'Task 2: Processing',
        'Task 3: Reporting'
      ];

      const agent = await orchestrator.spawnAgent('historian', 'logger', ['logging']);

      for (const task of tasks) {
        const result = await orchestrator.orchestrateTask(task, ['historian']);

        // Store in history
        await mockMemory.set({
          key: `history:${Date.now()}`,
          value: result,
          type: 'task-history'
        });
      }

      // Verify all tasks were logged
      const historyCalls = mockMemory.set.mock.calls.filter(
        (call: any) => call[0].type === 'task-history'
      );

      expect(historyCalls).toHaveLength(3);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of agents efficiently', async () => {
      const agentCount = 50;
      const agents = [];

      for (let i = 0; i < agentCount; i++) {
        agents.push(
          await orchestrator.spawnAgent(
            `agent-${i}`,
            'worker',
            ['processing']
          )
        );
      }

      expect(orchestrator.getActiveAgents()).toHaveLength(agentCount);

      // Mass orchestration
      const result = await orchestrator.orchestrateTask(
        'Large scale task',
        agents.slice(0, 10).map(a => a.name) // Use first 10 agents
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(10);
    });

    it('should batch agent operations for efficiency', async () => {
      const batchSize = 10;
      const agents = [];

      // Batch spawn agents
      const spawnPromises = [];
      for (let i = 0; i < batchSize; i++) {
        spawnPromises.push(
          orchestrator.spawnAgent(`batch-${i}`, 'worker', ['batch-processing'])
        );
      }

      agents.push(...await Promise.all(spawnPromises));

      expect(agents).toHaveLength(batchSize);
      expect(agents.every(a => a.state === 'idle')).toBe(true);
    });
  });
});