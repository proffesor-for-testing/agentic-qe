/**
 * Tests for panel assembly logic
 * Validates agent selection, weighting, and pool management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PanelAssembler,
  DefaultVotingStrategy,
  DefaultAgentPool
} from '../../src/voting/index.js';
import type {
  VotingAgent,
  VotingTask,
  VotingPanelConfig
} from '../../src/voting/types.js';

describe('PanelAssembler', () => {
  let assembler: PanelAssembler;
  let pool: DefaultAgentPool;
  let strategy: DefaultVotingStrategy;

  const createAgents = (): VotingAgent[] => [
    {
      id: 'agent-1',
      type: 'test-generator',
      expertise: ['unit-testing', 'integration-testing', 'tdd'],
      weight: 1.0
    },
    {
      id: 'agent-2',
      type: 'coverage-analyzer',
      expertise: ['coverage-analysis', 'gap-detection', 'sublinear-algorithms'],
      weight: 1.2
    },
    {
      id: 'agent-3',
      type: 'quality-gate',
      expertise: ['quality-metrics', 'policy-enforcement', 'risk-assessment'],
      weight: 1.5
    },
    {
      id: 'agent-4',
      type: 'performance-tester',
      expertise: ['performance', 'benchmarking', 'load-testing'],
      weight: 0.9
    },
    {
      id: 'agent-5',
      type: 'security-scanner',
      expertise: ['security', 'vulnerability-detection', 'sast'],
      weight: 1.3
    },
    {
      id: 'agent-6',
      type: 'flaky-detector',
      expertise: ['flaky-detection', 'statistical-analysis', 'pattern-recognition'],
      weight: 1.1
    }
  ];

  beforeEach(() => {
    const agents = createAgents();
    pool = new DefaultAgentPool(agents);
    strategy = new DefaultVotingStrategy();
    assembler = new PanelAssembler(pool, strategy);
  });

  describe('Panel Assembly', () => {
    it('should assemble panel within size constraints', async () => {
      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate unit tests',
        context: {},
        priority: 'high'
      };

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const result = await assembler.assemblePanel(task, config);

      expect(result.panel.length).toBeGreaterThanOrEqual(3);
      expect(result.panel.length).toBeLessThanOrEqual(5);
    });

    it('should select agents with required expertise', async () => {
      const task: VotingTask = {
        id: 'task-2',
        type: 'coverage-analysis',
        description: 'Analyze coverage gaps',
        context: {},
        priority: 'high',
        requiredExpertise: ['coverage-analysis', 'gap-detection']
      };

      const config: VotingPanelConfig = {
        minPanelSize: 2,
        maxPanelSize: 4,
        requiredExpertise: task.requiredExpertise,
        consensusMethod: 'quorum',
        quorumThreshold: 0.67,
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const result = await assembler.assemblePanel(task, config);

      const hasRequiredExpertise = result.panel.every(agent =>
        task.requiredExpertise?.some(e => agent.expertise.includes(e))
      );

      expect(hasRequiredExpertise).toBe(true);
      expect(result.coverage.expertise).toContain('coverage-analysis');
      expect(result.coverage.expertise).toContain('gap-detection');
    });

    it('should calculate total panel weight', async () => {
      const task: VotingTask = {
        id: 'task-3',
        type: 'quality-gate',
        description: 'Evaluate quality metrics',
        context: {},
        priority: 'critical'
      };

      const config: VotingPanelConfig = {
        minPanelSize: 4,
        maxPanelSize: 6,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const result = await assembler.assemblePanel(task, config);

      expect(result.coverage.totalWeight).toBeGreaterThan(0);
      expect(result.coverage.totalWeight).toBe(
        result.panel.reduce((sum, agent) => sum + agent.weight, 0)
      );
    });

    it('should throw error if insufficient agents', async () => {
      const task: VotingTask = {
        id: 'task-4',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high',
        requiredExpertise: ['non-existent-skill']
      };

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        requiredExpertise: task.requiredExpertise,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      await expect(assembler.assemblePanel(task, config)).rejects.toThrow(
        /Insufficient agents/
      );
    });

    it('should reserve agents in pool during assembly', async () => {
      const task: VotingTask = {
        id: 'task-5',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high'
      };

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const result = await assembler.assemblePanel(task, config);

      // Verify agents are reserved
      result.panel.forEach(agent => {
        expect(pool.busy.has(agent.id)).toBe(true);
      });
    });

    it('should release agents after assembly', async () => {
      const task: VotingTask = {
        id: 'task-6',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high'
      };

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const result = await assembler.assemblePanel(task, config);
      assembler.releasePanel(result.panel);

      // Verify agents are released
      result.panel.forEach(agent => {
        expect(pool.busy.has(agent.id)).toBe(false);
      });
    });
  });
});

describe('DefaultVotingStrategy', () => {
  let strategy: DefaultVotingStrategy;
  let pool: DefaultAgentPool;

  beforeEach(() => {
    const agents: VotingAgent[] = [
      {
        id: 'agent-1',
        type: 'test-generator',
        expertise: ['unit-testing'],
        weight: 1.0
      },
      {
        id: 'agent-2',
        type: 'coverage-analyzer',
        expertise: ['coverage-analysis'],
        weight: 1.2
      }
    ];
    pool = new DefaultAgentPool(agents);
    strategy = new DefaultVotingStrategy();
  });

  describe('Agent Selection', () => {
    it('should select agents based on scoring', () => {
      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high',
        requiredExpertise: ['unit-testing']
      };

      const config: VotingPanelConfig = {
        minPanelSize: 1,
        maxPanelSize: 2,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
        parallelExecution: true
      };

      const selected = strategy.selectAgents(pool, task, config);

      expect(selected.length).toBeGreaterThan(0);
      expect(selected.length).toBeLessThanOrEqual(config.maxPanelSize);
    });
  });

  describe('Weight Calculation', () => {
    it('should calculate higher weight for matching expertise', () => {
      const agent: VotingAgent = {
        id: 'agent-1',
        type: 'test-generator',
        expertise: ['unit-testing', 'integration-testing'],
        weight: 1.0
      };

      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high',
        requiredExpertise: ['unit-testing']
      };

      const weight = strategy.calculateWeight(agent, task);

      expect(weight).toBeGreaterThan(1.0); // Should boost for matching expertise
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient errors', () => {
      const agent: VotingAgent = {
        id: 'agent-1',
        type: 'test-generator',
        expertise: ['unit-testing'],
        weight: 1.0
      };

      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high'
      };

      const error = new Error('ETIMEDOUT: Connection timeout');
      const shouldRetry = strategy.shouldRetry(agent, task, 1, error);

      expect(shouldRetry).toBe(true);
    });

    it('should not retry after max attempts', () => {
      const agent: VotingAgent = {
        id: 'agent-1',
        type: 'test-generator',
        expertise: ['unit-testing'],
        weight: 1.0
      };

      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high'
      };

      const shouldRetry = strategy.shouldRetry(agent, task, 3);

      expect(shouldRetry).toBe(false);
    });
  });

  describe('Timeout Adjustment', () => {
    it('should increase timeout with exponential backoff', () => {
      const baseTimeout = 1000;
      const attempt = 2;
      const agentLoad = 0.5;

      const adjustedTimeout = strategy.adjustTimeout(
        baseTimeout,
        attempt,
        agentLoad
      );

      expect(adjustedTimeout).toBeGreaterThan(baseTimeout);
    });
  });
});

describe('DefaultAgentPool', () => {
  let pool: DefaultAgentPool;

  const createAgents = (): VotingAgent[] => [
    {
      id: 'agent-1',
      type: 'test-generator',
      expertise: ['unit-testing'],
      weight: 1.0
    },
    {
      id: 'agent-2',
      type: 'coverage-analyzer',
      expertise: ['coverage-analysis'],
      weight: 1.2
    }
  ];

  beforeEach(() => {
    pool = new DefaultAgentPool(createAgents());
  });

  describe('Agent Availability', () => {
    it('should return available agents', () => {
      const available = pool.getAvailable();

      expect(available.length).toBe(2);
    });

    it('should filter by expertise', () => {
      const available = pool.getAvailable(['unit-testing']);

      expect(available.length).toBe(1);
      expect(available[0].id).toBe('agent-1');
    });

    it('should exclude busy agents', () => {
      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high'
      };

      pool.reserve('agent-1', task);
      const available = pool.getAvailable();

      expect(available.length).toBe(1);
      expect(available[0].id).toBe('agent-2');
    });

    it('should exclude failed agents', () => {
      pool.markFailed('agent-1');
      const available = pool.getAvailable();

      expect(available.length).toBe(1);
      expect(available[0].id).toBe('agent-2');
    });
  });

  describe('Agent Reservation', () => {
    it('should reserve agent for task', () => {
      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high'
      };

      pool.reserve('agent-1', task);

      expect(pool.busy.has('agent-1')).toBe(true);
      expect(pool.busy.get('agent-1')).toBe(task);
    });

    it('should release agent after task', () => {
      const task: VotingTask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate tests',
        context: {},
        priority: 'high'
      };

      pool.reserve('agent-1', task);
      pool.release('agent-1');

      expect(pool.busy.has('agent-1')).toBe(false);
    });
  });

  describe('Failure Handling', () => {
    it('should mark agent as failed', () => {
      pool.markFailed('agent-1');

      expect(pool.failed.has('agent-1')).toBe(true);
      expect(pool.busy.has('agent-1')).toBe(false);
    });

    it('should restore failed agent', () => {
      pool.markFailed('agent-1');
      pool.restore('agent-1');

      expect(pool.failed.has('agent-1')).toBe(false);
    });
  });
});
