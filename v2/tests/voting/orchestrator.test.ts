/**
 * Tests for voting orchestrator
 * Validates parallel coordination, timeout handling, and result aggregation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSeededRandom } from '../../src/utils/SeededRandom';
import {
  VotingOrchestrator,
  DefaultAgentPool,
  DefaultVotingStrategy,
  ConsensusFactory
} from '../../src/voting/index.js';
import type {
  VotingAgent,
  VotingTask,
  Vote,
  VotingPanelConfig
} from '../../src/voting/types.js';

describe('VotingOrchestrator', () => {
  let orchestrator: VotingOrchestrator;
  let pool: DefaultAgentPool;
  let strategy: DefaultVotingStrategy;
  let mockVoteExecutor: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockAgents = (): VotingAgent[] => [
    {
      id: 'agent-1',
      type: 'test-generator',
      expertise: ['unit-testing', 'integration-testing'],
      weight: 1.0
    },
    {
      id: 'agent-2',
      type: 'coverage-analyzer',
      expertise: ['coverage-analysis', 'gap-detection'],
      weight: 1.2
    },
    {
      id: 'agent-3',
      type: 'quality-gate',
      expertise: ['quality-metrics', 'policy-enforcement'],
      weight: 1.5
    },
    {
      id: 'agent-4',
      type: 'performance-tester',
      expertise: ['performance', 'benchmarking'],
      weight: 0.9
    },
    {
      id: 'agent-5',
      type: 'security-scanner',
      expertise: ['security', 'vulnerability-detection'],
      weight: 1.3
    }
  ];

  const createMockTask = (): VotingTask => ({
    id: 'task-1',
    type: 'test-generation',
    description: 'Generate comprehensive test suite',
    context: { sourceFile: 'user-service.ts' },
    priority: 'high',
    requiredExpertise: ['unit-testing', 'coverage-analysis']
  });

  beforeEach(() => {
    vi.useFakeTimers();

    const agents = createMockAgents();
    pool = new DefaultAgentPool(agents);
    strategy = new DefaultVotingStrategy();
    const rng = createSeededRandom(21000);

    mockVoteExecutor = vi.fn().mockImplementation(
      async (agent: VotingAgent, task: VotingTask): Promise<Vote> => {
        // Simulate voting delay using fake timers
        await vi.advanceTimersByTimeAsync(10);

        return {
          agentId: agent.id,
          taskId: task.id,
          score: 0.8 + rng.random() * 0.2,
          confidence: 0.85 + rng.random() * 0.15,
          reasoning: `Agent ${agent.id} evaluated task ${task.id}`,
          timestamp: new Date()
        };
      }
    );

    orchestrator = new VotingOrchestrator(pool, strategy, mockVoteExecutor);
  });

  describe('Panel Assembly', () => {
    it('should assemble panel with required size', async () => {
      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const result = await orchestrator.assemblePanel(config);

      expect(result.panel.length).toBeGreaterThanOrEqual(config.minPanelSize);
      expect(result.panel.length).toBeLessThanOrEqual(config.maxPanelSize);
      expect(result.assemblyTime).toBeGreaterThan(0);
      expect(result.coverage.expertise.length).toBeGreaterThan(0);
    });

    it('should select agents with matching expertise', async () => {
      const config: VotingPanelConfig = {
        minPanelSize: 2,
        maxPanelSize: 4,
        requiredExpertise: ['unit-testing', 'coverage-analysis'],
        consensusMethod: 'quorum',
        quorumThreshold: 0.67,
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const result = await orchestrator.assemblePanel(config);

      const hasRequiredExpertise = result.panel.every(agent =>
        config.requiredExpertise?.some(e => agent.expertise.includes(e))
      );

      expect(hasRequiredExpertise).toBe(true);
    });
  });

  describe('Parallel Voting', () => {
    it('should distribute task and collect votes in parallel', async () => {
      const task = createMockTask();
      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const panelResult = await orchestrator.assemblePanel(config);
      await orchestrator.distributeTask(task, panelResult.panel);

      const votes = await orchestrator.collectVotes(task.id, 5000);

      expect(votes.length).toBeGreaterThan(0);
      expect(votes.length).toBeLessThanOrEqual(panelResult.panel.length);
      expect(mockVoteExecutor).toHaveBeenCalledTimes(panelResult.panel.length);
    });

    it('should handle concurrent voting for multiple agents', async () => {
      const task = createMockTask();
      const agents = createMockAgents();

      await orchestrator.distributeTask(task, agents);
      const votes = await orchestrator.collectVotes(task.id, 5000);

      // Verify all agents voted
      const agentIds = votes.map(v => v.agentId);
      expect(agentIds.length).toBe(agents.length);
      expect(new Set(agentIds).size).toBe(agents.length); // All unique
    });
  });

  describe('Timeout Handling', () => {
    it('should handle vote timeout gracefully', async () => {
      // Create slow vote executor using fake timers
      const slowExecutor = vi.fn().mockImplementation(
        async (agent: VotingAgent, task: VotingTask): Promise<Vote> => {
          if (agent.id === 'agent-3') {
            // Simulate timeout for one agent
            await vi.advanceTimersByTimeAsync(6000);
          }
          await vi.advanceTimersByTimeAsync(10);

          return {
            agentId: agent.id,
            taskId: task.id,
            score: 0.8,
            confidence: 0.85,
            reasoning: `Vote from ${agent.id}`,
            timestamp: new Date()
          };
        }
      );

      const slowOrchestrator = new VotingOrchestrator(
        pool,
        strategy,
        slowExecutor
      );

      const task = createMockTask();
      const agents = createMockAgents().slice(0, 3); // Use 3 agents

      await slowOrchestrator.distributeTask(task, agents);
      const votes = await slowOrchestrator.collectVotes(task.id, 1000); // Short timeout

      // Should collect votes from agents that completed in time
      expect(votes.length).toBeGreaterThan(0);
      expect(votes.length).toBeLessThan(agents.length);

      const metrics = slowOrchestrator.getMetrics();
      expect(metrics.timeoutVotes).toBeGreaterThan(0);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed votes', async () => {
      let attemptCount = 0;

      const flakyExecutor = vi.fn().mockImplementation(
        async (agent: VotingAgent, task: VotingTask): Promise<Vote> => {
          attemptCount++;

          // Fail first attempt, succeed on retry
          if (agent.id === 'agent-2' && attemptCount === 1) {
            throw new Error('ECONNRESET: Connection reset');
          }

          await vi.advanceTimersByTimeAsync(10);

          return {
            agentId: agent.id,
            taskId: task.id,
            score: 0.8,
            confidence: 0.85,
            reasoning: `Vote from ${agent.id}`,
            timestamp: new Date()
          };
        }
      );

      const retryOrchestrator = new VotingOrchestrator(
        pool,
        strategy,
        flakyExecutor
      );

      const task = createMockTask();
      const agent = createMockAgents()[1]; // agent-2

      const vote = await retryOrchestrator.retry(agent.id, task.id, 1);

      expect(vote).not.toBeNull();
      expect(vote?.agentId).toBe(agent.id);

      const metrics = retryOrchestrator.getMetrics();
      expect(metrics.retryRate).toBeGreaterThan(0);
    });

    it('should not retry after max attempts', async () => {
      const failingExecutor = vi.fn().mockRejectedValue(
        new Error('Persistent failure')
      );

      const retryOrchestrator = new VotingOrchestrator(
        pool,
        strategy,
        failingExecutor
      );

      const task = createMockTask();
      const agent = createMockAgents()[0];

      const vote = await retryOrchestrator.retry(agent.id, task.id, 3);

      expect(vote).toBeNull();
    });
  });

  describe('Result Aggregation', () => {
    it('should aggregate votes using weighted average', async () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'task-1',
          score: 0.8,
          confidence: 0.9,
          reasoning: 'Good coverage',
          timestamp: new Date()
        },
        {
          agentId: 'agent-2',
          taskId: 'task-1',
          score: 0.85,
          confidence: 0.95,
          reasoning: 'Excellent patterns',
          timestamp: new Date()
        },
        {
          agentId: 'agent-3',
          taskId: 'task-1',
          score: 0.9,
          confidence: 0.85,
          reasoning: 'Strong quality',
          timestamp: new Date()
        }
      ];

      const result = orchestrator.aggregateResults(votes, 'weighted-average');

      expect(result.consensusReached).toBe(true);
      expect(result.finalScore).toBeGreaterThan(0.8);
      expect(result.finalScore).toBeLessThan(0.9);
      expect(result.votes.length).toBe(3);
      expect(result.aggregationMethod).toBe('weighted-average');
    });

    it('should detect consensus with majority method', async () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'task-1',
          score: 0.9,
          confidence: 0.9,
          reasoning: 'Excellent',
          timestamp: new Date()
        },
        {
          agentId: 'agent-2',
          taskId: 'task-1',
          score: 0.9,
          confidence: 0.95,
          reasoning: 'Excellent',
          timestamp: new Date()
        },
        {
          agentId: 'agent-3',
          taskId: 'task-1',
          score: 0.5,
          confidence: 0.8,
          reasoning: 'Needs work',
          timestamp: new Date()
        }
      ];

      const result = orchestrator.aggregateResults(votes, 'majority');

      expect(result.finalScore).toBe(0.9);
      expect(result.consensusReached).toBe(true);
    });
  });

  describe('Orchestration Metrics', () => {
    it('should track orchestration metrics', async () => {
      const task = createMockTask();
      const agents = createMockAgents().slice(0, 3);

      await orchestrator.distributeTask(task, agents);
      await orchestrator.collectVotes(task.id, 5000);

      const metrics = orchestrator.getMetrics();

      expect(metrics.totalTasks).toBe(1);
      expect(metrics.successfulVotes).toBeGreaterThan(0);
      expect(metrics.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Orchestration Logging', () => {
    it('should log orchestration events', async () => {
      const task = createMockTask();
      const config: VotingPanelConfig = {
        minPanelSize: 2,
        maxPanelSize: 3,
        consensusMethod: 'quorum',
        quorumThreshold: 0.67,
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      await orchestrator.assemblePanel(config);
      const logs = orchestrator.getLogs();

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].event).toBe('panel-assembled');
      expect(logs[0].taskId).toBeDefined();
    });

    it('should filter logs by task ID', async () => {
      const task1 = { ...createMockTask(), id: 'task-1' };
      const task2 = { ...createMockTask(), id: 'task-2' };
      const agents = createMockAgents().slice(0, 2);

      await orchestrator.distributeTask(task1, agents);
      await orchestrator.distributeTask(task2, agents);

      const task1Logs = orchestrator.getLogs('task-1');
      const task2Logs = orchestrator.getLogs('task-2');

      expect(task1Logs.every(log => log.taskId === 'task-1')).toBe(true);
      expect(task2Logs.every(log => log.taskId === 'task-2')).toBe(true);
    });
  });
});
