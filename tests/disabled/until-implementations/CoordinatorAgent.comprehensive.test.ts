import { CoordinatorAgent } from '@agents/CoordinatorAgent';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { EventBus } from '@core/EventBus';
import { TaskAssignment } from '@core/types';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('CoordinatorAgent Comprehensive Tests', () => {
  let agent: CoordinatorAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testDbPath = path.join(process.cwd(), '.swarm/test-coordinator.db');

  beforeAll(async () => {
    await fs.ensureDir(path.dirname(testDbPath));
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();
    await eventBus.initialize();
  });

  beforeEach(async () => {
    agent = new CoordinatorAgent('coordinator-test-001');
    await agent.initialize();
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
  });

  afterAll(async () => {
    await eventBus.shutdown();
    await memoryStore.close();
    await fs.remove(testDbPath);
  });

  describe('Task Distribution', () => {
    it('should distribute tasks to available agents', async () => {
      const tasks = [
        { id: 'task-1', type: 'test', priority: 'high' },
        { id: 'task-2', type: 'analysis', priority: 'medium' },
        { id: 'task-3', type: 'optimization', priority: 'low' }
      ];
      const distribution = await agent['distributeTasks'](tasks, {
        availableAgents: ['agent-1', 'agent-2', 'agent-3']
      });
      expect(distribution).toHaveLength(3);
      expect(distribution[0].priority).toBe('high');
    });

    it('should balance load across agents', async () => {
      const balanced = await agent['balanceLoad']({
        agents: [
          { id: 'agent-1', load: 80 },
          { id: 'agent-2', load: 20 }
        ],
        newTask: { weight: 30 }
      });
      expect(balanced.assignedTo).toBe('agent-2');
    });

    it('should prioritize critical tasks', async () => {
      const prioritized = await agent['prioritizeTasks']([
        { id: 'low', priority: 1 },
        { id: 'critical', priority: 100 },
        { id: 'medium', priority: 50 }
      ]);
      expect(prioritized[0].id).toBe('critical');
    });

    it('should handle task dependencies', async () => {
      const ordered = await agent['resolveDependencies']([
        { id: 'c', depends: ['a', 'b'] },
        { id: 'a', depends: [] },
        { id: 'b', depends: ['a'] }
      ]);
      expect(ordered.map(t => t.id)).toEqual(['a', 'b', 'c']);
    });

    it('should detect circular dependencies', async () => {
      const circular = await agent['detectCircularDeps']([
        { id: 'a', depends: ['b'] },
        { id: 'b', depends: ['c'] },
        { id: 'c', depends: ['a'] }
      ]);
      expect(circular).toBe(true);
    });

    it('should reassign failed tasks', async () => {
      const reassigned = await agent['reassignTask']({
        taskId: 'failed-task',
        failedAgent: 'agent-1',
        reason: 'timeout'
      });
      expect(reassigned.newAgent).not.toBe('agent-1');
    });

    it('should implement round-robin distribution', async () => {
      const distributed = await agent['roundRobinDistribute'](
        Array(10).fill({ type: 'task' }),
        ['agent-1', 'agent-2', 'agent-3']
      );
      expect(distributed['agent-1']).toHaveLength(4);
      expect(distributed['agent-2']).toHaveLength(3);
      expect(distributed['agent-3']).toHaveLength(3);
    });

    it('should handle agent unavailability', async () => {
      const handled = await agent['handleUnavailableAgent']({
        agentId: 'agent-down',
        assignedTasks: ['task-1', 'task-2']
      });
      expect(handled.redistributed).toBe(true);
    });

    it('should implement task queuing', async () => {
      const queued = await agent['queueTask']({
        id: 'new-task',
        priority: 'high'
      });
      expect(queued.position).toBeDefined();
    });

    it('should dequeue tasks by priority', async () => {
      await agent['queueTask']({ id: 'low', priority: 1 });
      await agent['queueTask']({ id: 'high', priority: 10 });
      const dequeued = await agent['dequeueTask']();
      expect(dequeued.id).toBe('high');
    });
  });

  describe('Agent Coordination', () => {
    it('should register new agents', async () => {
      const registered = await agent['registerAgent']({
        id: 'new-agent',
        type: 'tester',
        capabilities: ['unit-test', 'integration-test']
      });
      expect(registered.success).toBe(true);
    });

    it('should track agent status', async () => {
      await agent['updateAgentStatus']('agent-1', 'busy');
      const status = await agent['getAgentStatus']('agent-1');
      expect(status).toBe('busy');
    });

    it('should coordinate agent communication', async () => {
      const message = await agent['relayMessage']({
        from: 'agent-1',
        to: 'agent-2',
        content: { type: 'data-share', payload: {} }
      });
      expect(message.delivered).toBe(true);
    });

    it('should implement consensus protocol', async () => {
      const consensus = await agent['achieveConsensus']({
        proposals: [
          { agent: 'agent-1', vote: 'approve' },
          { agent: 'agent-2', vote: 'approve' },
          { agent: 'agent-3', vote: 'reject' }
        ],
        threshold: 0.67
      });
      expect(consensus.result).toBe('approved');
    });

    it('should handle agent conflicts', async () => {
      const resolved = await agent['resolveConflict']({
        agents: ['agent-1', 'agent-2'],
        resource: 'database-lock',
        strategy: 'priority'
      });
      expect(resolved.winner).toBeDefined();
    });

    it('should synchronize agent state', async () => {
      const synced = await agent['synchronizeState']({
        agents: ['agent-1', 'agent-2', 'agent-3'],
        stateKey: 'shared-config'
      });
      expect(synced.synchronized).toBe(true);
    });

    it('should implement leader election', async () => {
      const leader = await agent['electLeader']([
        { id: 'agent-1', score: 80 },
        { id: 'agent-2', score: 95 },
        { id: 'agent-3', score: 70 }
      ]);
      expect(leader.id).toBe('agent-2');
    });

    it('should handle leader failover', async () => {
      await agent['setLeader']('agent-1');
      const failover = await agent['handleLeaderFailure']('agent-1');
      expect(failover.newLeader).not.toBe('agent-1');
    });

    it('should broadcast messages to all agents', async () => {
      const broadcast = await agent['broadcastMessage']({
        type: 'fleet-update',
        payload: { version: '1.0.0' }
      });
      expect(broadcast.recipients).toBeGreaterThan(0);
    });

    it('should implement gossip protocol', async () => {
      const gossiped = await agent['gossipProtocol']({
        message: { key: 'value' },
        fanout: 3,
        ttl: 5
      });
      expect(gossiped.spread).toBe(true);
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve resource conflicts', async () => {
      const resolved = await agent['resolveResourceConflict']({
        resource: 'file.txt',
        contenders: [
          { agent: 'agent-1', timestamp: 1000 },
          { agent: 'agent-2', timestamp: 1100 }
        ]
      });
      expect(resolved.granted).toBe('agent-1');
    });

    it('should implement priority-based resolution', async () => {
      const resolved = await agent['priorityResolution']({
        conflicts: [
          { agent: 'agent-1', priority: 5 },
          { agent: 'agent-2', priority: 10 }
        ]
      });
      expect(resolved.winner).toBe('agent-2');
    });

    it('should implement fair scheduling', async () => {
      const scheduled = await agent['fairSchedule']({
        agents: ['agent-1', 'agent-2', 'agent-3'],
        resources: 10
      });
      expect(scheduled['agent-1']).toBeCloseTo(scheduled['agent-2'], 1);
    });

    it('should detect deadlocks', async () => {
      const deadlock = await agent['detectDeadlock']({
        locks: [
          { agent: 'agent-1', holds: ['A'], waits: ['B'] },
          { agent: 'agent-2', holds: ['B'], waits: ['A'] }
        ]
      });
      expect(deadlock.detected).toBe(true);
    });

    it('should resolve deadlocks', async () => {
      const resolved = await agent['resolveDeadlock']({
        cycle: ['agent-1', 'agent-2', 'agent-1']
      });
      expect(resolved.broken).toBe(true);
    });

    it('should implement timeout mechanisms', async () => {
      const timeout = await agent['implementTimeout']({
        task: async () => new Promise(resolve => setTimeout(resolve, 5000)),
        maxDuration: 1000
      });
      expect(timeout.timedOut).toBe(true);
    });
  });

  describe('Memory Integration', () => {
    it('should store coordination state', async () => {
      await agent['storeCoordinationState']({
        agents: 5,
        activeTasks: 10
      });
      const state = await memoryStore.retrieve('aqe/coordinator/state', {
        partition: 'coordination'
      });
      expect(state).toBeDefined();
    });

    it('should retrieve fleet status from memory', async () => {
      await memoryStore.store('aqe/fleet/status', { healthy: true }, {
        partition: 'coordination'
      });
      const status = await agent['retrieveFleetStatus']();
      expect(status.healthy).toBe(true);
    });

    it('should cache agent capabilities', async () => {
      await agent['cacheCapabilities']('agent-1', ['test', 'analyze']);
      const capabilities = await agent['getCachedCapabilities']('agent-1');
      expect(capabilities).toContain('test');
    });
  });

  describe('Event Handling', () => {
    it('should emit coordination events', async () => {
      const eventPromise = new Promise(resolve => {
        eventBus.on('coordination:complete', resolve);
      });
      agent['emitCoordinationComplete']({ taskId: 'test' });
      await expect(eventPromise).resolves.toBeDefined();
    });

    it('should handle agent join events', async () => {
      const handled = await agent['handleAgentJoin']({
        type: 'agent.join',
        payload: { agentId: 'new-agent' }
      });
      expect(handled).toBe(true);
    });

    it('should handle agent leave events', async () => {
      const handled = await agent['handleAgentLeave']({
        type: 'agent.leave',
        payload: { agentId: 'old-agent' }
      });
      expect(handled).toBe(true);
    });
  });

  describe('Monitoring & Metrics', () => {
    it('should track task completion rates', async () => {
      const metrics = await agent['trackCompletionRate']({
        completed: 80,
        failed: 10,
        pending: 10
      });
      expect(metrics.rate).toBe(0.8);
    });

    it('should monitor agent health', async () => {
      const health = await agent['monitorAgentHealth']([
        { id: 'agent-1', heartbeat: Date.now() },
        { id: 'agent-2', heartbeat: Date.now() - 60000 }
      ]);
      expect(health['agent-2'].status).toBe('unhealthy');
    });

    it('should generate coordination reports', async () => {
      const report = await agent['generateCoordinationReport']({
        period: '1h',
        metrics: ['throughput', 'latency', 'success-rate']
      });
      expect(report).toHaveProperty('summary');
    });
  });

  describe('Error Handling', () => {
    it('should handle coordination failures', async () => {
      const result = await agent['safeCoordinate'](async () => {
        throw new Error('Coordination failed');
      });
      expect(result).toHaveProperty('error');
    });

    it('should retry failed coordinations', async () => {
      let attempts = 0;
      const result = await agent['retryCoordination'](async () => {
        attempts++;
        if (attempts < 2) throw new Error('Fail');
        return { success: true };
      }, 3);
      expect(result.success).toBe(true);
    });

    it('should log coordination errors', async () => {
      await expect(
        agent['logCoordinationError'](new Error('Test'))
      ).resolves.not.toThrow();
    });
  });
});
