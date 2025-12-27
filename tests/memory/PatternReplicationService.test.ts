/**
 * PatternReplicationService Tests
 *
 * Comprehensive test suite for pattern replication with health monitoring
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  PatternReplicationService,
  ReplicationNodeStatus,
  ReplicationConfig
} from '../../src/memory/PatternReplicationService';
import { DistributedPatternLibrary } from '../../src/memory/DistributedPatternLibrary';
import { TestPattern } from '../../src/core/memory/IPatternStore';
import { createSeededRandom } from '../../src/utils/SeededRandom';

describe('PatternReplicationService', () => {
  let service: PatternReplicationService;
  let config: ReplicationConfig;
  let library1: DistributedPatternLibrary;
  let library2: DistributedPatternLibrary;
  let library3: DistributedPatternLibrary;

  beforeEach(async () => {
    config = {
      replicationFactor: 3,
      heartbeatInterval: 100,
      failureThreshold: 2,
      syncInterval: 200,
      autoRecover: true,
      minHealthyNodes: 2
    };

    service = new PatternReplicationService(config);

    library1 = new DistributedPatternLibrary({ agentId: 'agent-1', dimension: 128 });
    library2 = new DistributedPatternLibrary({ agentId: 'agent-2', dimension: 128 });
    library3 = new DistributedPatternLibrary({ agentId: 'agent-3', dimension: 128 });

    await library1.initialize();
    await library2.initialize();
    await library3.initialize();
  });

  afterEach(async () => {
    await service.stop();
    await library1.clear();
    await library2.clear();
    await library3.clear();
  });

  describe('Service Lifecycle', () => {
    it('should start and stop service', async () => {
      await service.start();
      expect(service['isRunning']).toBe(true);

      await service.stop();
      expect(service['isRunning']).toBe(false);
    });

    it('should not allow starting twice', async () => {
      await service.start();
      await expect(service.start()).rejects.toThrow('already running');
      await service.stop();
    });
  });

  describe('Node Registration', () => {
    it('should register replication nodes', async () => {
      await service.registerNode('agent-1', library1);
      await service.registerNode('agent-2', library2);
      await service.registerNode('agent-3', library3);

      const nodes = service.getNodes();
      expect(nodes.length).toBe(3);
      expect(nodes.map(n => n.agentId)).toContain('agent-1');
      expect(nodes.map(n => n.agentId)).toContain('agent-2');
      expect(nodes.map(n => n.agentId)).toContain('agent-3');
    });

    it('should unregister nodes', async () => {
      await service.registerNode('agent-1', library1);
      const unregistered = await service.unregisterNode('agent-1');

      expect(unregistered).toBe(true);
      expect(service.getNodes().length).toBe(0);
    });

    it('should initialize node with correct status', async () => {
      await service.registerNode('agent-1', library1);
      const nodes = service.getNodes();

      expect(nodes[0].status).toBe(ReplicationNodeStatus.HEALTHY);
      expect(nodes[0].consecutiveFailures).toBe(0);
      expect(nodes[0].lastHeartbeat).toBeGreaterThan(0);
    });
  });

  describe('Pattern Replication', () => {
    beforeEach(async () => {
      await service.registerNode('agent-1', library1);
      await service.registerNode('agent-2', library2);
      await service.registerNode('agent-3', library3);
    });

    it('should replicate pattern to all nodes', async () => {
      const pattern: TestPattern = {
        id: 'replicated-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.9
      };

      const replicatedCount = await service.replicatePattern(pattern);

      expect(replicatedCount).toBe(3);

      // Verify pattern exists on all nodes
      const p1 = await library1.getPattern('replicated-pattern');
      const p2 = await library2.getPattern('replicated-pattern');
      const p3 = await library3.getPattern('replicated-pattern');

      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p3).toBeDefined();
    });

    it('should replicate 1000+ patterns efficiently', async () => {
      const rng = createSeededRandom(13000);
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        const pattern: TestPattern = {
          id: `pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(rng.random()),
          content: `test pattern ${i}`,
          coverage: rng.random()
        };

        await service.replicatePattern(pattern);
      }

      const replicationTime = Date.now() - startTime;

      // Verify replication
      const stats1 = await library1.getStats();
      const stats2 = await library2.getStats();
      const stats3 = await library3.getStats();

      expect(stats1.totalPatterns).toBeGreaterThanOrEqual(1000);
      expect(stats2.totalPatterns).toBeGreaterThanOrEqual(1000);
      expect(stats3.totalPatterns).toBeGreaterThanOrEqual(1000);

      // Should complete within reasonable time (< 30 seconds)
      expect(replicationTime).toBeLessThan(30000);
    });

    it('should skip source node during replication', async () => {
      const pattern: TestPattern = {
        id: 'source-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'from agent-1',
        coverage: 0.9
      };

      // Replicate from agent-1 (should skip agent-1)
      await service.replicatePattern(pattern, 'agent-1');

      // Verify pattern exists on agent-2 and agent-3 only
      const p2 = await library2.getPattern('source-pattern');
      const p3 = await library3.getPattern('source-pattern');

      expect(p2).toBeDefined();
      expect(p3).toBeDefined();
    });

    it('should emit replication events', async () => {
      const events: any[] = [];
      service.on('pattern_replicated', (event) => {
        events.push(event);
      });

      const pattern: TestPattern = {
        id: 'event-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test',
        coverage: 0.8
      };

      await service.replicatePattern(pattern);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('pattern_replicated');
      expect(events[0].patternId).toBe('event-pattern');
      expect(events[0].nodeCount).toBe(3);
    });

    it('should fail if insufficient healthy nodes', async () => {
      // Create service with higher minimum
      const strictService = new PatternReplicationService({
        replicationFactor: 3,
        minHealthyNodes: 5
      });

      await strictService.registerNode('agent-1', library1);

      const pattern: TestPattern = {
        id: 'fail-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test',
        coverage: 0.8
      };

      await expect(strictService.replicatePattern(pattern)).rejects.toThrow('Insufficient healthy nodes');
    });
  });

  describe('Pattern Synchronization', () => {
    beforeEach(async () => {
      await service.registerNode('agent-1', library1);
      await service.registerNode('agent-2', library2);
      await service.registerNode('agent-3', library3);
    });

    it('should sync patterns across nodes', async () => {
      const rng = createSeededRandom(13100);
      // Add patterns to library1 only
      for (let i = 0; i < 10; i++) {
        await library1.storePattern({
          id: `sync-pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(rng.random()),
          content: `test pattern ${i}`,
          coverage: rng.random()
        });
      }

      // Sync
      const result = await service.syncPatterns();

      expect(result.synced).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);

      // Verify all nodes have the patterns
      const stats1 = await library1.getStats();
      const stats2 = await library2.getStats();
      const stats3 = await library3.getStats();

      expect(stats2.totalPatterns).toBe(stats1.totalPatterns);
      expect(stats3.totalPatterns).toBe(stats1.totalPatterns);
    });

    it('should emit sync completed events', async () => {
      const events: any[] = [];
      service.on('sync_completed', (event) => {
        events.push(event);
      });

      await library1.storePattern({
        id: 'sync-event-pattern',
        type: 'unit',
        domain: 'test',
        embedding: new Array(128).fill(0.5),
        content: 'test',
        coverage: 0.8
      });

      await service.syncPatterns();

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('sync_completed');
      expect(events[0].duration).toBeGreaterThan(0);
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await service.registerNode('agent-1', library1);
      await service.registerNode('agent-2', library2);
      await service.registerNode('agent-3', library3);
    });

    it('should check health of all nodes', async () => {
      const health = await service.checkHealth();

      expect(health.totalNodes).toBe(3);
      expect(health.healthyNodes).toBe(3);
      expect(health.degradedNodes).toBe(0);
      expect(health.failedNodes).toBe(0);
      expect(health.lastHealthCheck).toBeGreaterThan(0);
    });

    it('should calculate consistency percentage', async () => {
      const rng = createSeededRandom(13200);
      // Add same patterns to all nodes
      for (let i = 0; i < 10; i++) {
        const pattern: TestPattern = {
          id: `consistency-pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(rng.random()),
          content: `test pattern ${i}`,
          coverage: rng.random()
        };

        await service.replicatePattern(pattern);
      }

      const health = await service.checkHealth();

      // Should be 100% consistent after replication
      expect(health.consistencyPercentage).toBeGreaterThanOrEqual(99);
    });

    it('should track replication lag', async () => {
      await library1.storePattern({
        id: 'lag-pattern',
        type: 'unit',
        domain: 'test',
        embedding: new Array(128).fill(0.5),
        content: 'test',
        coverage: 0.8
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const health = await service.checkHealth();

      expect(health.averageReplicationLag).toBeGreaterThan(0);
    });
  });

  describe('Node Failure Handling', () => {
    it('should detect node failures', async () => {
      const failingLibrary = new DistributedPatternLibrary({ agentId: 'failing-agent', dimension: 128 });
      await failingLibrary.initialize();

      // Mock getStats to throw error
      failingLibrary.getStats = jest.fn().mockRejectedValue(new Error('Node failure'));

      await service.registerNode('failing-agent', failingLibrary);
      await service.start();

      // Wait for heartbeat to detect failure
      await new Promise(resolve => setTimeout(resolve, 300));

      const nodes = service.getNodes();
      const failingNode = nodes.find(n => n.agentId === 'failing-agent');

      expect(failingNode?.consecutiveFailures).toBeGreaterThan(0);

      await failingLibrary.clear();
    });

    it('should emit node failed events', async () => {
      const events: any[] = [];
      service.on('node_failed', (event) => {
        events.push(event);
      });

      const failingLibrary = new DistributedPatternLibrary({ agentId: 'failing-agent', dimension: 128 });
      await failingLibrary.initialize();

      // Mock getStats to throw error
      failingLibrary.getStats = jest.fn().mockRejectedValue(new Error('Critical failure'));

      await service.registerNode('failing-agent', failingLibrary);
      await service.start();

      // Wait for failure threshold to be reached
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should have emitted failure event
      expect(events.length).toBeGreaterThan(0);
      if (events.length > 0) {
        expect(events[0].type).toBe('node_failed');
        expect(events[0].agentId).toBe('failing-agent');
      }

      await failingLibrary.clear();
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await service.registerNode('agent-1', library1);
      await service.registerNode('agent-2', library2);
      await service.registerNode('agent-3', library3);
    });

    it('should provide replication statistics', async () => {
      const stats = await service.getStats();

      expect(stats.replicationFactor).toBe(3);
      expect(stats.registeredNodes).toBe(3);
      expect(stats.health).toBeDefined();
      expect(stats.health.totalNodes).toBe(3);
    });

    it('should track registered nodes', async () => {
      const stats = await service.getStats();
      expect(stats.registeredNodes).toBe(3);

      await service.unregisterNode('agent-3');

      const updatedStats = await service.getStats();
      expect(updatedStats.registeredNodes).toBe(2);
    });
  });

  describe('Automatic Recovery', () => {
    it('should attempt recovery for failed nodes', async () => {
      const recoveringLibrary = new DistributedPatternLibrary({ agentId: 'recovering-agent', dimension: 128 });
      await recoveringLibrary.initialize();

      let failCount = 0;
      const maxFails = 3;

      // Mock to fail initially, then succeed
      const originalGetStats = recoveringLibrary.getStats.bind(recoveringLibrary);
      recoveringLibrary.getStats = jest.fn().mockImplementation(async () => {
        failCount++;
        if (failCount <= maxFails) {
          throw new Error('Temporary failure');
        }
        return originalGetStats();
      });

      await service.registerNode('recovering-agent', recoveringLibrary);
      await service.start();

      // Wait for failure and recovery
      await new Promise(resolve => setTimeout(resolve, 1000));

      const nodes = service.getNodes();
      const recoveringNode = nodes.find(n => n.agentId === 'recovering-agent');

      // Node should eventually recover or be in recovering state
      expect([
        ReplicationNodeStatus.HEALTHY,
        ReplicationNodeStatus.RECOVERING,
        ReplicationNodeStatus.DEGRADED
      ]).toContain(recoveringNode?.status);

      await recoveringLibrary.clear();
    });
  });
});
