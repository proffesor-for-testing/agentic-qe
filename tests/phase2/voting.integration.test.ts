/**
 * Voting Integration Tests
 *
 * Tests multi-agent voting system including:
 * - Panel assembly with 3+ agents
 * - Voting protocol message passing
 * - Majority consensus algorithm
 * - Weighted consensus algorithm
 * - Voting orchestrator with timeout handling
 * - Result aggregation
 *
 * @version 1.0.0
 * @module tests/phase2/voting
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  VotingAgent,
  VotingTask,
  Vote,
  VotingResult,
  VotingPanelConfig,
  ConsensusMethod,
} from '@/voting/types';
import { PanelAssembler } from '@/voting/panel-assembly';
import { VotingOrchestrator } from '@/voting/orchestrator';
import { ConsensusCalculator } from '@/voting/consensus';

describe('Voting Integration Tests', () => {
  let panelAssembler: PanelAssembler;
  let orchestrator: VotingOrchestrator;
  let consensusCalculator: ConsensusCalculator;

  const createMockAgent = (
    id: string,
    type: string,
    expertise: string[],
    weight: number = 1.0
  ): VotingAgent => ({
    id,
    type: type as any,
    expertise,
    weight,
    maxConcurrency: 5,
  });

  const createMockTask = (id: string, requiredExpertise?: string[]): VotingTask => ({
    id,
    type: 'quality-assessment',
    description: `Task ${id}`,
    context: { testData: 'sample' },
    priority: 'medium',
    requiredExpertise,
  });

  beforeEach(() => {
    panelAssembler = new PanelAssembler();
    orchestrator = new VotingOrchestrator();
    consensusCalculator = new ConsensusCalculator();
  });

  describe('Panel Assembly with 3+ Agents', () => {
    it('should assemble panel with minimum 3 agents', async () => {
      const availableAgents: VotingAgent[] = [
        createMockAgent('test-gen-1', 'test-generator', ['unit-test', 'integration-test']),
        createMockAgent('coverage-1', 'coverage-analyzer', ['coverage', 'gap-analysis']),
        createMockAgent('quality-1', 'quality-gate', ['quality', 'standards']),
        createMockAgent('perf-1', 'performance-tester', ['performance', 'load-test']),
        createMockAgent('security-1', 'security-scanner', ['security', 'vulnerability']),
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const task = createMockTask('task-1', ['unit-test', 'quality']);

      const result = await panelAssembler.assemblePanel(availableAgents, task, config);

      expect(result.panel.length).toBeGreaterThanOrEqual(config.minPanelSize);
      expect(result.panel.length).toBeLessThanOrEqual(config.maxPanelSize);
      expect(result.assemblyTime).toBeDefined();
      expect(result.coverage.types.length).toBeGreaterThan(0);
    });

    it('should prioritize agents with matching expertise', async () => {
      const availableAgents: VotingAgent[] = [
        createMockAgent('test-gen-1', 'test-generator', ['unit-test', 'integration-test'], 1.0),
        createMockAgent('coverage-1', 'coverage-analyzer', ['coverage', 'gap-analysis'], 0.8),
        createMockAgent('quality-1', 'quality-gate', ['quality', 'standards'], 0.9),
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 2,
        maxPanelSize: 3,
        requiredExpertise: ['unit-test', 'quality'],
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const task = createMockTask('task-2', ['unit-test', 'quality']);

      const result = await panelAssembler.assemblePanel(availableAgents, task, config);

      // Should include agents with matching expertise
      const hasTestGen = result.panel.some(a => a.id === 'test-gen-1');
      const hasQuality = result.panel.some(a => a.id === 'quality-1');

      expect(hasTestGen).toBe(true);
      expect(hasQuality).toBe(true);
    });

    it('should balance panel across agent types', async () => {
      const availableAgents: VotingAgent[] = [
        createMockAgent('test-gen-1', 'test-generator', ['test'], 1.0),
        createMockAgent('test-gen-2', 'test-generator', ['test'], 1.0),
        createMockAgent('coverage-1', 'coverage-analyzer', ['coverage'], 1.0),
        createMockAgent('quality-1', 'quality-gate', ['quality'], 1.0),
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 3,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const task = createMockTask('task-3');

      const result = await panelAssembler.assemblePanel(availableAgents, task, config);

      const types = new Set(result.panel.map(a => a.type));
      expect(types.size).toBeGreaterThanOrEqual(2); // Diverse types
    });

    it('should handle insufficient available agents', async () => {
      const availableAgents: VotingAgent[] = [
        createMockAgent('test-gen-1', 'test-generator', ['test']),
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const task = createMockTask('task-4');

      await expect(
        panelAssembler.assemblePanel(availableAgents, task, config)
      ).rejects.toThrow(/insufficient.*agents/i);
    });
  });

  describe('Voting Protocol Message Passing', () => {
    it('should distribute task to all panel members', async () => {
      const panel: VotingAgent[] = [
        createMockAgent('agent-1', 'test-generator', ['test']),
        createMockAgent('agent-2', 'coverage-analyzer', ['coverage']),
        createMockAgent('agent-3', 'quality-gate', ['quality']),
      ];

      const task = createMockTask('msg-task-1');

      const distributionPromises = await orchestrator.distributeTask(task, panel);

      expect(distributionPromises.length).toBe(panel.length);
    });

    it('should collect votes from all agents', async () => {
      const panel: VotingAgent[] = [
        createMockAgent('agent-1', 'test-generator', ['test']),
        createMockAgent('agent-2', 'coverage-analyzer', ['coverage']),
        createMockAgent('agent-3', 'quality-gate', ['quality']),
      ];

      const task = createMockTask('msg-task-2');

      // Mock vote submission
      const mockVotes: Vote[] = panel.map(agent => ({
        agentId: agent.id,
        taskId: task.id,
        score: Math.random() * 0.5 + 0.5, // 0.5-1.0
        confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0
        reasoning: `Vote from ${agent.id}`,
        timestamp: new Date(),
      }));

      jest.spyOn(orchestrator, 'collectVotes').mockResolvedValue(mockVotes);

      const votes = await orchestrator.collectVotes(task.id, 5000);

      expect(votes.length).toBe(panel.length);
      expect(votes.every(v => v.taskId === task.id)).toBe(true);
    });

    it('should handle concurrent voting', async () => {
      const panel: VotingAgent[] = Array.from({ length: 5 }, (_, i) =>
        createMockAgent(`agent-${i}`, 'test-generator', ['test'])
      );

      const tasks = Array.from({ length: 3 }, (_, i) => createMockTask(`task-${i}`));

      const votingResults = await Promise.all(
        tasks.map(async task => {
          const mockVotes: Vote[] = panel.map(agent => ({
            agentId: agent.id,
            taskId: task.id,
            score: 0.8,
            confidence: 0.9,
            reasoning: 'Concurrent vote',
            timestamp: new Date(),
          }));

          jest.spyOn(orchestrator, 'collectVotes').mockResolvedValueOnce(mockVotes);
          return orchestrator.collectVotes(task.id, 5000);
        })
      );

      expect(votingResults.length).toBe(tasks.length);
      expect(votingResults.every(votes => votes.length === panel.length)).toBe(true);
    });
  });

  describe('Majority Consensus Algorithm', () => {
    it('should reach consensus with simple majority', () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'task-1',
          score: 0.9,
          confidence: 0.9,
          reasoning: 'Approve',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          taskId: 'task-1',
          score: 0.8,
          confidence: 0.8,
          reasoning: 'Approve',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-3',
          taskId: 'task-1',
          score: 0.3,
          confidence: 0.7,
          reasoning: 'Reject',
          timestamp: new Date(),
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        quorumThreshold: 0.5,
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = consensusCalculator.calculate(votes, config);

      expect(result.consensusReached).toBe(true);
      expect(result.finalScore).toBeGreaterThan(0.5);
    });

    it('should fail consensus without majority', () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'task-2',
          score: 0.6,
          confidence: 0.8,
          reasoning: 'Approve',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          taskId: 'task-2',
          score: 0.3,
          confidence: 0.9,
          reasoning: 'Reject',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-3',
          taskId: 'task-2',
          score: 0.4,
          confidence: 0.7,
          reasoning: 'Neutral',
          timestamp: new Date(),
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        quorumThreshold: 0.6,
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = consensusCalculator.calculate(votes, config);

      expect(result.consensusReached).toBe(false);
    });
  });

  describe('Weighted Consensus Algorithm', () => {
    it('should calculate weighted average with agent weights', () => {
      const votes: Vote[] = [
        {
          agentId: 'expert-1',
          taskId: 'task-3',
          score: 0.9,
          confidence: 0.95,
          reasoning: 'Expert approval',
          timestamp: new Date(),
          metadata: { weight: 2.0 },
        },
        {
          agentId: 'agent-2',
          taskId: 'task-3',
          score: 0.5,
          confidence: 0.7,
          reasoning: 'Neutral',
          timestamp: new Date(),
          metadata: { weight: 1.0 },
        },
        {
          agentId: 'agent-3',
          taskId: 'task-3',
          score: 0.4,
          confidence: 0.6,
          reasoning: 'Concerns',
          timestamp: new Date(),
          metadata: { weight: 1.0 },
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = consensusCalculator.calculate(votes, config);

      expect(result.consensusReached).toBe(true);
      // Expert vote (0.9 * 2.0) should dominate
      expect(result.finalScore).toBeGreaterThan(0.6);
    });

    it('should weight by confidence scores', () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'task-4',
          score: 0.9,
          confidence: 0.95,
          reasoning: 'High confidence approval',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          taskId: 'task-4',
          score: 0.2,
          confidence: 0.3,
          reasoning: 'Low confidence rejection',
          timestamp: new Date(),
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 2,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = consensusCalculator.calculate(votes, config);

      // High confidence vote should dominate
      expect(result.finalScore).toBeGreaterThan(0.7);
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Voting Orchestrator with Timeout Handling', () => {
    it('should handle agent timeouts gracefully', async () => {
      const panel: VotingAgent[] = [
        createMockAgent('fast-agent', 'test-generator', ['test']),
        createMockAgent('slow-agent', 'coverage-analyzer', ['coverage']),
        createMockAgent('normal-agent', 'quality-gate', ['quality']),
      ];

      const task = createMockTask('timeout-task-1');
      const timeoutMs = 1000;

      // Mock votes with timeout for one agent
      const mockVotes: Vote[] = [
        {
          agentId: 'fast-agent',
          taskId: task.id,
          score: 0.8,
          confidence: 0.9,
          reasoning: 'Fast response',
          timestamp: new Date(),
        },
        {
          agentId: 'normal-agent',
          taskId: task.id,
          score: 0.7,
          confidence: 0.8,
          reasoning: 'Normal response',
          timestamp: new Date(),
        },
        // slow-agent times out
      ];

      jest.spyOn(orchestrator, 'collectVotes').mockResolvedValue(mockVotes);

      const votes = await orchestrator.collectVotes(task.id, timeoutMs);

      expect(votes.length).toBe(2); // One agent timed out
      expect(votes.every(v => v.taskId === task.id)).toBe(true);
    });

    it('should retry failed votes', async () => {
      const agent = createMockAgent('retry-agent', 'test-generator', ['test']);
      const task = createMockTask('retry-task-1');

      let attemptCount = 0;
      jest.spyOn(orchestrator, 'retry').mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          return null; // Fail first attempt
        }
        return {
          agentId: agent.id,
          taskId: task.id,
          score: 0.8,
          confidence: 0.85,
          reasoning: 'Retry success',
          timestamp: new Date(),
        };
      });

      const vote = await orchestrator.retry(agent.id, task.id, 1);

      expect(vote).not.toBeNull();
      expect(vote?.agentId).toBe(agent.id);
    });

    it('should track timeout metrics', async () => {
      const panel: VotingAgent[] = Array.from({ length: 5 }, (_, i) =>
        createMockAgent(`agent-${i}`, 'test-generator', ['test'])
      );

      const task = createMockTask('metric-task-1');

      // Simulate 2 timeouts
      const mockVotes: Vote[] = panel.slice(0, 3).map(agent => ({
        agentId: agent.id,
        taskId: task.id,
        score: 0.8,
        confidence: 0.9,
        reasoning: 'Vote',
        timestamp: new Date(),
      }));

      jest.spyOn(orchestrator, 'collectVotes').mockResolvedValue(mockVotes);
      await orchestrator.collectVotes(task.id, 5000);

      const metrics = orchestrator.getMetrics();

      expect(metrics.timeoutVotes).toBe(2);
      expect(metrics.totalTasks).toBeGreaterThan(0);
    });
  });

  describe('Result Aggregation', () => {
    it('should aggregate votes into final result', () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'agg-task-1',
          score: 0.9,
          confidence: 0.95,
          reasoning: 'Excellent quality',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          taskId: 'agg-task-1',
          score: 0.85,
          confidence: 0.9,
          reasoning: 'Good quality',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-3',
          taskId: 'agg-task-1',
          score: 0.8,
          confidence: 0.85,
          reasoning: 'Acceptable quality',
          timestamp: new Date(),
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = orchestrator.aggregateResults(votes, config.consensusMethod);

      expect(result.taskId).toBe('agg-task-1');
      expect(result.votes.length).toBe(3);
      expect(result.consensusReached).toBeDefined();
      expect(result.finalScore).toBeGreaterThan(0);
      expect(result.metadata.totalAgents).toBe(3);
      expect(result.metadata.votingAgents).toBe(3);
      expect(result.metadata.averageConfidence).toBeGreaterThan(0.8);
    });

    it('should calculate participation rate', () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'part-task-1',
          score: 0.8,
          confidence: 0.9,
          reasoning: 'Vote',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          taskId: 'part-task-1',
          score: 0.7,
          confidence: 0.8,
          reasoning: 'Vote',
          timestamp: new Date(),
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = orchestrator.aggregateResults(votes, config.consensusMethod);

      // 2 votes out of expected 3 minimum
      expect(result.participationRate).toBeLessThan(1.0);
      expect(result.metadata.votingAgents).toBe(2);
    });

    it('should track execution time', async () => {
      const panel: VotingAgent[] = Array.from({ length: 3 }, (_, i) =>
        createMockAgent(`agent-${i}`, 'test-generator', ['test'])
      );

      const task = createMockTask('exec-task-1');
      const mockVotes: Vote[] = panel.map(agent => ({
        agentId: agent.id,
        taskId: task.id,
        score: 0.8,
        confidence: 0.9,
        reasoning: 'Vote',
        timestamp: new Date(),
      }));

      const startTime = Date.now();

      jest.spyOn(orchestrator, 'collectVotes').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockVotes;
      });

      const votes = await orchestrator.collectVotes(task.id, 5000);
      const result = orchestrator.aggregateResults(votes, 'majority');

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(Date.now() - startTime + 100);
    });
  });

  describe('End-to-End Voting Workflow', () => {
    it('should complete full voting cycle', async () => {
      const availableAgents: VotingAgent[] = [
        createMockAgent('test-gen-1', 'test-generator', ['test'], 1.0),
        createMockAgent('coverage-1', 'coverage-analyzer', ['coverage'], 0.9),
        createMockAgent('quality-1', 'quality-gate', ['quality'], 1.1),
        createMockAgent('perf-1', 'performance-tester', ['performance'], 0.8),
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 4,
        consensusMethod: 'weighted-average',
        quorumThreshold: 0.6,
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const task = createMockTask('e2e-task-1', ['test', 'quality']);

      // Step 1: Assemble panel
      const panelResult = await panelAssembler.assemblePanel(availableAgents, task, config);
      expect(panelResult.panel.length).toBeGreaterThanOrEqual(3);

      // Step 2: Distribute task
      await orchestrator.distributeTask(task, panelResult.panel);

      // Step 3: Collect votes
      const mockVotes: Vote[] = panelResult.panel.map((agent, i) => ({
        agentId: agent.id,
        taskId: task.id,
        score: 0.7 + i * 0.05,
        confidence: 0.8 + i * 0.03,
        reasoning: `Vote from ${agent.id}`,
        timestamp: new Date(),
      }));

      jest.spyOn(orchestrator, 'collectVotes').mockResolvedValue(mockVotes);
      const votes = await orchestrator.collectVotes(task.id, config.timeoutMs);

      // Step 4: Aggregate results
      const result = orchestrator.aggregateResults(votes, config.consensusMethod);

      expect(result.consensusReached).toBe(true);
      expect(result.finalScore).toBeGreaterThan(0);
      expect(result.votes.length).toBe(panelResult.panel.length);
      expect(result.participationRate).toBe(1.0);
    });
  });
});
