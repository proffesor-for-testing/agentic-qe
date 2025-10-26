/**
 * Tests for Fleet Status Handler - MCP Tool
 * Complete coverage for fleet status monitoring functionality
 */

import { FleetStatusHandler, FleetStatusArgs } from '@mcp/handlers/fleet-status';

describe('FleetStatusHandler', () => {
  let handler: FleetStatusHandler;

  beforeEach(() => {
    handler = new FleetStatusHandler();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty fleet registry', () => {
      expect(handler['fleetRegistry']).toBeInstanceOf(Map);
      expect(handler['fleetRegistry'].size).toBe(0);
    });

    it('should initialize agent performance tracker', () => {
      expect(handler['agentPerformance']).toBeInstanceOf(Map);
      expect(handler['agentPerformance'].size).toBe(0);
    });
  });

  describe('Handle Method - Fleet Status Retrieval', () => {
    it('should handle fleet status request with fleet ID', async () => {
      const args: FleetStatusArgs = { fleetId: 'test-fleet-123' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.fleetId).toBe('test-fleet-123');
      expect(result.data.status).toBeDefined();
      expect(result.data.agents).toBeInstanceOf(Array);
    });

    it('should handle global status request without fleet ID', async () => {
      const args: FleetStatusArgs = {};
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.globalStatus).toBeDefined();
      expect(result.data.totalFleets).toBeGreaterThanOrEqual(0);
      expect(result.data.totalAgents).toBeGreaterThanOrEqual(0);
    });

    it('should include detailed metrics when requested', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'test-fleet-123',
        detailed: true
      };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.performance).toBeDefined();
      expect(result.data.metrics).toBeDefined();
      expect(result.data.healthChecks).toBeDefined();
    });

    it('should filter by agent status when specified', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'test-fleet-123',
        agentStatus: 'active'
      };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      result.data.agents.forEach((agent: any) => {
        expect(agent.status).toBe('active');
      });
    });
  });

  describe('Fleet Registration and Management', () => {
    it('should register new fleet', () => {
      const fleetData = {
        id: 'fleet-001',
        name: 'Test Fleet',
        topology: 'mesh',
        agents: [],
        status: 'initializing',
        createdAt: new Date().toISOString()
      };

      handler.registerFleet(fleetData);

      const registeredFleet = handler['fleetRegistry'].get('fleet-001');
      expect(registeredFleet).toBeDefined();
      expect(registeredFleet.name).toBe('Test Fleet');
      expect(registeredFleet.topology).toBe('mesh');
    });

    it('should update fleet status', () => {
      const fleetId = 'fleet-002';
      handler.registerFleet({
        id: fleetId,
        name: 'Update Test Fleet',
        topology: 'hierarchical',
        agents: [],
        status: 'initializing',
        createdAt: new Date().toISOString()
      });

      handler.updateFleetStatus(fleetId, 'active');

      const fleet = handler['fleetRegistry'].get(fleetId);
      expect(fleet?.status).toBe('active');
      expect(fleet?.lastUpdated).toBeDefined();
    });

    it('should handle non-existent fleet updates gracefully', () => {
      expect(() => {
        handler.updateFleetStatus('non-existent-fleet', 'active');
      }).not.toThrow();
    });

    it('should deregister fleet', () => {
      const fleetId = 'fleet-003';
      handler.registerFleet({
        id: fleetId,
        name: 'Temp Fleet',
        topology: 'star',
        agents: [],
        status: 'active',
        createdAt: new Date().toISOString()
      });

      handler.deregisterFleet(fleetId);

      expect(handler['fleetRegistry'].has(fleetId)).toBe(false);
    });
  });

  describe('Agent Status Tracking', () => {
    beforeEach(() => {
      // Register a test fleet with agents
      handler.registerFleet({
        id: 'fleet-with-agents',
        name: 'Agent Test Fleet',
        topology: 'mesh',
        agents: [
          {
            id: 'agent-001',
            type: 'test-generator',
            status: 'active',
            assignedTasks: ['generate-unit-tests'],
            performance: { score: 85, uptime: 98.5 }
          },
          {
            id: 'agent-002',
            type: 'coverage-analyzer',
            status: 'idle',
            assignedTasks: [],
            performance: { score: 92, uptime: 99.1 }
          }
        ],
        status: 'active',
        createdAt: new Date().toISOString()
      });
    });

    it('should track agent performance metrics', () => {
      const agentId = 'agent-001';
      const metrics = {
        testsGenerated: 150,
        executionTime: 5420,
        successRate: 94.5,
        memoryUsage: 256,
        cpuUsage: 15.2
      };

      handler.updateAgentPerformance(agentId, metrics);

      const storedMetrics = handler['agentPerformance'].get(agentId);
      expect(storedMetrics).toBeDefined();
      expect(storedMetrics?.testsGenerated).toBe(150);
      expect(storedMetrics?.successRate).toBe(94.5);
    });

    it('should calculate agent health scores', () => {
      const agentData = {
        performance: { score: 88, uptime: 97.5 },
        status: 'active',
        lastActivity: new Date(Date.now() - 5000).toISOString() // 5 seconds ago
      };

      const healthScore = handler.calculateAgentHealth(agentData);

      expect(healthScore).toBeGreaterThanOrEqual(0);
      expect(healthScore).toBeLessThanOrEqual(100);
      expect(healthScore).toBeGreaterThan(80); // Should be healthy
    });

    it('should identify unhealthy agents', () => {
      const unhealthyAgent = {
        performance: { score: 45, uptime: 60.5 },
        status: 'error',
        lastActivity: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
      };

      const healthScore = handler.calculateAgentHealth(unhealthyAgent);

      expect(healthScore).toBeLessThan(50);
    });

    it('should handle agents with missing performance data', () => {
      const agentWithoutPerf = {
        status: 'active',
        lastActivity: new Date().toISOString()
      };

      const healthScore = handler.calculateAgentHealth(agentWithoutPerf);

      expect(healthScore).toBeGreaterThanOrEqual(0);
      expect(healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Fleet Health Monitoring', () => {
    it('should calculate overall fleet health', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents',
        detailed: true
      };

      const result = await handler.handle(args);

      expect(result.data.healthChecks.overall).toBeDefined();
      expect(result.data.healthChecks.overall.score).toBeGreaterThanOrEqual(0);
      expect(result.data.healthChecks.overall.score).toBeLessThanOrEqual(100);
      expect(result.data.healthChecks.overall.status).toMatch(/healthy|degraded|critical/);
    });

    it('should identify fleet bottlenecks', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents',
        detailed: true
      };

      const result = await handler.handle(args);

      expect(result.data.metrics.bottlenecks).toBeInstanceOf(Array);
      expect(result.data.metrics.resourceUtilization).toBeDefined();
    });

    it('should track fleet coordination efficiency', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents',
        detailed: true
      };

      const result = await handler.handle(args);

      expect(result.data.metrics.coordinationEfficiency).toBeGreaterThanOrEqual(0);
      expect(result.data.metrics.coordinationEfficiency).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance Analytics', () => {
    it('should provide task completion statistics', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents',
        detailed: true
      };

      const result = await handler.handle(args);

      expect(result.data.performance.taskCompletion).toBeDefined();
      expect(result.data.performance.taskCompletion.total).toBeGreaterThanOrEqual(0);
      expect(result.data.performance.taskCompletion.completed).toBeGreaterThanOrEqual(0);
      expect(result.data.performance.taskCompletion.failed).toBeGreaterThanOrEqual(0);
      expect(result.data.performance.taskCompletion.successRate).toBeGreaterThanOrEqual(0);
    });

    it('should track resource utilization trends', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents',
        detailed: true
      };

      const result = await handler.handle(args);

      expect(result.data.metrics.resourceUtilization.cpu).toBeDefined();
      expect(result.data.metrics.resourceUtilization.memory).toBeDefined();
      expect(result.data.metrics.resourceUtilization.network).toBeDefined();
    });

    it('should calculate fleet efficiency metrics', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents',
        detailed: true
      };

      const result = await handler.handle(args);

      expect(result.data.performance.efficiency).toBeDefined();
      expect(result.data.performance.efficiency.overall).toBeGreaterThanOrEqual(0);
      expect(result.data.performance.efficiency.overall).toBeLessThanOrEqual(100);
    });
  });

  describe('Real-time Monitoring', () => {
    it('should provide current activity status', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents'
      };

      const result = await handler.handle(args);

      expect(result.data.currentActivity).toBeDefined();
      expect(result.data.currentActivity.activeTasks).toBeGreaterThanOrEqual(0);
      expect(result.data.currentActivity.queuedTasks).toBeGreaterThanOrEqual(0);
      expect(result.data.currentActivity.activeAgents).toBeGreaterThanOrEqual(0);
    });

    it('should track agent workload distribution', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'fleet-with-agents',
        detailed: true
      };

      const result = await handler.handle(args);

      expect(result.data.metrics.workloadDistribution).toBeInstanceOf(Array);
      result.data.metrics.workloadDistribution.forEach((agent: any) => {
        expect(agent.agentId).toBeDefined();
        expect(agent.workload).toBeGreaterThanOrEqual(0);
        expect(agent.workload).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Error Conditions and Edge Cases', () => {
    it('should handle empty fleet registry', async () => {
      const args: FleetStatusArgs = {};
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.totalFleets).toBe(0);
      expect(result.data.totalAgents).toBe(0);
      expect(result.data.globalStatus).toBe('no_fleets');
    });

    it('should handle non-existent fleet ID', async () => {
      const args: FleetStatusArgs = { fleetId: 'non-existent-fleet' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('not_found');
      expect(result.data.agents).toEqual([]);
    });

    it('should handle malformed fleet data gracefully', () => {
      const malformedFleet = {
        id: 'malformed-fleet',
        // Missing required fields
        agents: 'not-an-array' as any
      };

      expect(() => {
        handler.registerFleet(malformedFleet);
      }).not.toThrow();

      const fleet = handler['fleetRegistry'].get('malformed-fleet');
      expect(fleet).toBeDefined();
      expect(Array.isArray(fleet?.agents)).toBe(true);
    });

    it('should handle large fleet registries efficiently', async () => {
      // Register many fleets
      for (let i = 0; i < 1000; i++) {
        handler.registerFleet({
          id: `fleet-${i}`,
          name: `Fleet ${i}`,
          topology: 'mesh',
          agents: Array(10).fill(0).map((_, j) => ({
            id: `agent-${i}-${j}`,
            type: 'worker',
            status: 'active'
          })),
          status: 'active',
          createdAt: new Date().toISOString()
        });
      }

      const startTime = Date.now();
      const args: FleetStatusArgs = {};
      const result = await handler.handle(args);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.data.totalFleets).toBe(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Fleet Status Filtering and Sorting', () => {
    beforeEach(() => {
      // Register multiple fleets with different statuses
      const fleetStatuses = ['active', 'idle', 'error', 'terminated'];
      fleetStatuses.forEach((status, index) => {
        handler.registerFleet({
          id: `fleet-${status}-${index}`,
          name: `${status} Fleet ${index}`,
          topology: 'mesh',
          agents: [],
          status,
          createdAt: new Date(Date.now() - index * 1000).toISOString()
        });
      });
    });

    it('should filter fleets by status', async () => {
      const args: FleetStatusArgs = { fleetStatus: 'active' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.fleets).toBeInstanceOf(Array);
      result.data.fleets.forEach((fleet: any) => {
        expect(fleet.status).toBe('active');
      });
    });

    it('should sort fleets by creation time', async () => {
      const args: FleetStatusArgs = { sortBy: 'createdAt', sortOrder: 'desc' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      if (result.data.fleets && result.data.fleets.length > 1) {
        for (let i = 1; i < result.data.fleets.length; i++) {
          const prev = new Date(result.data.fleets[i - 1].createdAt);
          const curr = new Date(result.data.fleets[i].createdAt);
          expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
        }
      }
    });
  });

  describe('Integration with Claude Flow Memory', () => {
    it('should store fleet status in coordination memory', async () => {
      const args: FleetStatusArgs = { fleetId: 'fleet-with-agents' };
      await handler.handle(args);

      // Verify that fleet status is stored for coordination
      // This would normally interact with the actual memory system
      expect(handler['lastStatusUpdate']).toBeDefined();
    });

    it('should track status query frequency for optimization', () => {
      const initialQueries = handler['queryCount'] || 0;

      handler.handle({ fleetId: 'test-fleet' });
      handler.handle({ fleetId: 'test-fleet' });
      handler.handle({ fleetId: 'test-fleet' });

      expect(handler['queryCount']).toBe(initialQueries + 3);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should respond to status queries within performance targets', async () => {
      const startTime = Date.now();
      const args: FleetStatusArgs = { fleetId: 'fleet-with-agents', detailed: true };
      const result = await handler.handle(args);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should respond in under 100ms
    });

    it('should handle concurrent status requests efficiently', async () => {
      const promises = Array(50).fill(null).map(() =>
        handler.handle({ fleetId: 'fleet-with-agents' })
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      expect(endTime - startTime).toBeLessThan(500); // All requests in under 500ms
    });
  });
});