import { TaskRouter } from '../../../src/core/coordination/TaskRouter';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../../src/core/EventBus';
import { Task, AgentCapability } from '../../../src/core/types';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('TaskRouter Comprehensive Tests', () => {
  let router: TaskRouter;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testDbPath = path.join(process.cwd(), '.swarm/test-router.db');

  beforeAll(async () => {
    await fs.ensureDir(path.dirname(testDbPath));
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();
    await eventBus.initialize();
  });

  beforeEach(() => {
    router = new TaskRouter(memoryStore, eventBus);
  });

  afterAll(async () => {
    await eventBus.shutdown();
    await memoryStore.close();
    await fs.remove(testDbPath);
  });

  describe('Task Routing Algorithms', () => {
    it('should route tasks based on agent capabilities', async () => {
      const task: Task = {
        id: 'task-1',
        description: 'Run tests',
        priority: 'high',
        requiredCapabilities: ['testing']
      };
      const agents = [
        { id: 'agent-1', capabilities: ['testing', 'analysis'] },
        { id: 'agent-2', capabilities: ['coding'] }
      ];
      const routed = await router.routeTask(task, agents);
      expect(routed.agentId).toBe('agent-1');
    });

    it('should implement least-loaded routing', async () => {
      const task: Task = { id: 'task-1', description: 'Process', priority: 'medium' };
      const agents = [
        { id: 'agent-1', load: 80 },
        { id: 'agent-2', load: 20 }
      ];
      const routed = await router.leastLoadedRouting(task, agents);
      expect(routed.agentId).toBe('agent-2');
    });

    it('should implement round-robin routing', async () => {
      const tasks = [
        { id: 'task-1', description: 'Task 1', priority: 'low' },
        { id: 'task-2', description: 'Task 2', priority: 'low' },
        { id: 'task-3', description: 'Task 3', priority: 'low' }
      ];
      const agents = ['agent-1', 'agent-2'];
      const routed = await router.roundRobinRouting(tasks, agents);
      expect(routed[0].agentId).not.toBe(routed[1].agentId);
    });

    it('should implement priority-based routing', async () => {
      const tasks = [
        { id: 'low', description: 'Low priority', priority: 'low' },
        { id: 'high', description: 'High priority', priority: 'high' },
        { id: 'medium', description: 'Medium priority', priority: 'medium' }
      ];
      const sorted = await router.sortByPriority(tasks);
      expect(sorted[0].id).toBe('high');
      expect(sorted[2].id).toBe('low');
    });

    it('should implement capability-based routing', async () => {
      const task: Task = {
        id: 'task-1',
        description: 'Complex analysis',
        priority: 'high',
        requiredCapabilities: ['analysis', 'statistics']
      };
      const agents = [
        { id: 'agent-1', capabilities: ['testing'] },
        { id: 'agent-2', capabilities: ['analysis', 'statistics', 'reporting'] }
      ];
      const routed = await router.capabilityMatch(task, agents);
      expect(routed.agentId).toBe('agent-2');
      expect(routed.score).toBeGreaterThan(0);
    });

    it('should implement locality-aware routing', async () => {
      const task: Task = {
        id: 'task-1',
        description: 'Process data',
        priority: 'medium',
        dataLocation: 'region-east'
      };
      const agents = [
        { id: 'agent-1', location: 'region-west' },
        { id: 'agent-2', location: 'region-east' }
      ];
      const routed = await router.localityAwareRouting(task, agents);
      expect(routed.agentId).toBe('agent-2');
    });

    it('should implement cost-based routing', async () => {
      const task: Task = { id: 'task-1', description: 'Process', priority: 'low' };
      const agents = [
        { id: 'agent-1', costPerTask: 10 },
        { id: 'agent-2', costPerTask: 5 }
      ];
      const routed = await router.costBasedRouting(task, agents);
      expect(routed.agentId).toBe('agent-2');
    });

    it('should implement SLA-aware routing', async () => {
      const task: Task = {
        id: 'task-1',
        description: 'Critical task',
        priority: 'critical',
        sla: { responseTime: 100 }
      };
      const agents = [
        { id: 'agent-1', avgResponseTime: 200 },
        { id: 'agent-2', avgResponseTime: 50 }
      ];
      const routed = await router.slaAwareRouting(task, agents);
      expect(routed.agentId).toBe('agent-2');
    });

    it('should implement sticky routing for related tasks', async () => {
      const task1: Task = { id: 'task-1', description: 'Part 1', sessionId: 'session-1' };
      const task2: Task = { id: 'task-2', description: 'Part 2', sessionId: 'session-1' };
      await router.routeTask(task1, [{ id: 'agent-1' }]);
      const routed = await router.stickyRouting(task2, [{ id: 'agent-1' }, { id: 'agent-2' }]);
      expect(routed.agentId).toBe('agent-1');
    });

    it('should implement weighted routing', async () => {
      const task: Task = { id: 'task-1', description: 'Process', priority: 'medium' };
      const agents = [
        { id: 'agent-1', weight: 3 },
        { id: 'agent-2', weight: 1 }
      ];
      const routes = await Promise.all(
        Array(100).fill(task).map(() => router.weightedRouting(task, agents))
      );
      const agent1Count = routes.filter(r => r.agentId === 'agent-1').length;
      expect(agent1Count).toBeGreaterThan(60); // Should get ~75% with weight 3
    });
  });

  describe('Priority Queue Management', () => {
    it('should maintain priority queue order', async () => {
      await router.enqueue({ id: 'low', priority: 'low' });
      await router.enqueue({ id: 'high', priority: 'high' });
      await router.enqueue({ id: 'medium', priority: 'medium' });

      const first = await router.dequeue();
      expect(first?.id).toBe('high');
    });

    it('should handle FIFO within same priority', async () => {
      await router.enqueue({ id: 'task-1', priority: 'medium' });
      await router.enqueue({ id: 'task-2', priority: 'medium' });

      const first = await router.dequeue();
      const second = await router.dequeue();
      expect(first?.id).toBe('task-1');
      expect(second?.id).toBe('task-2');
    });

    it('should support priority updates', async () => {
      await router.enqueue({ id: 'task-1', priority: 'low' });
      await router.updatePriority('task-1', 'high');

      await router.enqueue({ id: 'task-2', priority: 'medium' });
      const first = await router.dequeue();
      expect(first?.id).toBe('task-1');
    });

    it('should remove tasks from queue', async () => {
      await router.enqueue({ id: 'task-1', priority: 'medium' });
      await router.enqueue({ id: 'task-2', priority: 'medium' });

      await router.removeTask('task-1');
      const size = await router.queueSize();
      expect(size).toBe(1);
    });

    it('should peek without dequeuing', async () => {
      await router.enqueue({ id: 'task-1', priority: 'high' });

      const peeked = await router.peek();
      const size = await router.queueSize();
      expect(peeked?.id).toBe('task-1');
      expect(size).toBe(1);
    });

    it('should handle empty queue gracefully', async () => {
      const dequeued = await router.dequeue();
      expect(dequeued).toBeNull();
    });

    it('should implement priority aging', async () => {
      await router.enqueue({ id: 'old-low', priority: 'low', timestamp: Date.now() - 3600000 });
      await router.enqueue({ id: 'new-high', priority: 'high', timestamp: Date.now() });

      await router.ageTaskPriorities(3000000); // Age tasks older than 50min
      const first = await router.dequeue();
      expect(first?.id).toBe('old-low'); // Should be promoted
    });

    it('should support batch enqueue', async () => {
      const tasks = [
        { id: 'task-1', priority: 'low' },
        { id: 'task-2', priority: 'high' },
        { id: 'task-3', priority: 'medium' }
      ];
      await router.batchEnqueue(tasks);

      const size = await router.queueSize();
      expect(size).toBe(3);
    });

    it('should support queue draining', async () => {
      await router.enqueue({ id: 'task-1', priority: 'medium' });
      await router.enqueue({ id: 'task-2', priority: 'low' });

      const drained = await router.drain();
      expect(drained).toHaveLength(2);
      expect(await router.queueSize()).toBe(0);
    });

    it('should filter queue by criteria', async () => {
      await router.enqueue({ id: 'task-1', priority: 'high', type: 'testing' });
      await router.enqueue({ id: 'task-2', priority: 'low', type: 'analysis' });

      const filtered = await router.filterQueue(task => task.type === 'testing');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('task-1');
    });
  });

  describe('Load Balancing', () => {
    it('should balance load across agents', async () => {
      const tasks = Array(10).fill(null).map((_, i) => ({
        id: `task-${i}`,
        description: `Task ${i}`,
        priority: 'medium'
      }));
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      const distribution = await router.balanceLoad(tasks, agents);
      const loads = Object.values(distribution).map((t: any) => t.length);
      const maxDiff = Math.max(...loads) - Math.min(...loads);
      expect(maxDiff).toBeLessThanOrEqual(1);
    });

    it('should consider agent capacity', async () => {
      const tasks = Array(10).fill(null).map((_, i) => ({ id: `task-${i}` }));
      const agents = [
        { id: 'agent-1', capacity: 5 },
        { id: 'agent-2', capacity: 3 }
      ];

      const distribution = await router.capacityAwareBalance(tasks, agents);
      expect(distribution['agent-1'].length).toBeGreaterThan(distribution['agent-2'].length);
    });

    it('should implement dynamic rebalancing', async () => {
      await router.assignTask('agent-1', { id: 'task-1' });
      await router.assignTask('agent-1', { id: 'task-2' });
      await router.assignTask('agent-2', { id: 'task-3' });

      await router.rebalance();
      const agent1Load = await router.getAgentLoad('agent-1');
      const agent2Load = await router.getAgentLoad('agent-2');
      expect(Math.abs(agent1Load - agent2Load)).toBeLessThanOrEqual(1);
    });

    it('should handle agent failures during balancing', async () => {
      const tasks = Array(5).fill(null).map((_, i) => ({ id: `task-${i}` }));
      const agents = ['agent-1', 'agent-2'];

      const distribution = await router.balanceLoad(tasks, agents);
      await router.handleAgentFailure('agent-1');

      const redistributed = await router.redistributeTasks('agent-1', agents);
      expect(redistributed).toBe(true);
    });

    it('should implement weighted load balancing', async () => {
      const tasks = Array(12).fill(null).map((_, i) => ({ id: `task-${i}` }));
      const agents = [
        { id: 'agent-1', weight: 3 },
        { id: 'agent-2', weight: 1 }
      ];

      const distribution = await router.weightedBalance(tasks, agents);
      expect(distribution['agent-1'].length).toBe(9);
      expect(distribution['agent-2'].length).toBe(3);
    });
  });

  describe('Memory Integration', () => {
    it('should store routing decisions', async () => {
      const decision = {
        taskId: 'task-1',
        agentId: 'agent-1',
        reason: 'capability-match',
        timestamp: Date.now()
      };
      await router.storeRoutingDecision(decision);

      const stored = await memoryStore.retrieve('aqe/router/decisions/task-1', {
        partition: 'coordination'
      });
      expect(stored).toBeDefined();
    });

    it('should retrieve routing history', async () => {
      await memoryStore.store('aqe/router/history', [{ taskId: 'task-1' }], {
        partition: 'coordination'
      });
      const history = await router.getRoutingHistory();
      expect(history).toBeInstanceOf(Array);
    });

    it('should cache agent capabilities', async () => {
      await router.cacheAgentCapabilities('agent-1', ['testing', 'analysis']);
      const cached = await router.getCachedCapabilities('agent-1');
      expect(cached).toContain('testing');
    });
  });

  describe('Event Handling', () => {
    it('should emit routing events', async () => {
      const eventPromise = new Promise(resolve => {
        eventBus.on('task:routed', resolve);
      });

      await router.routeTask(
        { id: 'task-1', description: 'Test', priority: 'medium' },
        [{ id: 'agent-1' }]
      );

      await expect(eventPromise).resolves.toBeDefined();
    });

    it('should handle agent status events', async () => {
      const handled = await router.handleAgentStatusChange({
        type: 'agent.status',
        payload: { agentId: 'agent-1', status: 'busy' }
      });
      expect(handled).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle routing failures gracefully', async () => {
      const result = await router.safeRoute(
        { id: 'task-1', description: 'Test', priority: 'high' },
        []
      );
      expect(result).toHaveProperty('error');
    });

    it('should retry failed routing attempts', async () => {
      let attempts = 0;
      const result = await router.retryRoute(
        async () => {
          attempts++;
          if (attempts < 2) throw new Error('Fail');
          return { agentId: 'agent-1' };
        },
        3
      );
      expect(result.agentId).toBe('agent-1');
    });

    it('should log routing errors', async () => {
      await expect(
        router.logRoutingError(new Error('Test'))
      ).resolves.not.toThrow();
    });
  });

  describe('Performance & Optimization', () => {
    it('should handle high-throughput routing', async () => {
      const tasks = Array(1000).fill(null).map((_, i) => ({
        id: `task-${i}`,
        description: `Task ${i}`,
        priority: 'medium'
      }));
      const agents = Array(10).fill(null).map((_, i) => ({ id: `agent-${i}` }));

      const start = Date.now();
      await router.bulkRoute(tasks, agents);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete in <1s
    });

    it('should optimize routing decisions over time', async () => {
      // Simulate learning from routing history
      for (let i = 0; i < 100; i++) {
        await router.routeTask(
          { id: `task-${i}`, description: 'Test', priority: 'medium' },
          [{ id: 'agent-1', successRate: 0.95 }, { id: 'agent-2', successRate: 0.8 }]
        );
      }

      const optimized = await router.getOptimizedRouting();
      expect(optimized.preferredAgent).toBe('agent-1');
    });
  });
});
