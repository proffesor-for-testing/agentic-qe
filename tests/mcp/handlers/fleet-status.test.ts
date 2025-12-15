/**
 * Tests for Fleet Status Handler - MCP Tool
 * Coverage for fleet status monitoring functionality
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { FleetStatusHandler, FleetStatusArgs } from '@mcp/handlers/fleet-status';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
jest.mock('../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../src/mcp/services/HookExecutor.js');

describe('FleetStatusHandler', () => {
  let handler: FleetStatusHandler;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockAgentRegistry = {
      getStatistics: jest.fn().mockReturnValue({
        totalAgents: 5,
        activeAgents: 3,
        idleAgents: 2,
        totalTasks: 100,
        completedTasks: 90,
        failedTasks: 5
      }),
      getAllAgents: jest.fn().mockReturnValue([
        { id: 'agent-1', type: 'test-generator', status: 'active', tasksCompleted: 10 },
        { id: 'agent-2', type: 'coverage-analyzer', status: 'idle', tasksCompleted: 20 }
      ])
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;

    handler = new FleetStatusHandler(mockAgentRegistry, mockHookExecutor);
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
      expect(result.data.fleetId).toBe('default-fleet');
      expect(result.data.health).toBeDefined();
    });

    it('should include metrics when requested', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'test-fleet-123',
        includeMetrics: true
      };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.metrics).toBeDefined();
      expect(result.data.metrics.totalTasks).toBeDefined();
    });

    it('should include agent details when requested', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'test-fleet-123',
        includeAgentDetails: true
      };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.agents).toBeInstanceOf(Array);
      // When includeAgentDetails is true, agents come from registry
      expect(mockAgentRegistry.getAllAgents).toHaveBeenCalled();
    });

    it('should return agent summaries', async () => {
      const args: FleetStatusArgs = {
        fleetId: 'test-fleet-123'
      };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.agents).toBeInstanceOf(Array);
      expect(result.data.agents.length).toBeGreaterThan(0);
    });

    it('should return health status', async () => {
      const args: FleetStatusArgs = { fleetId: 'test-fleet-123' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.health).toBeDefined();
      expect(result.data.health.overall).toBeDefined();
      expect(result.data.health.score).toBeGreaterThanOrEqual(0);
      expect(result.data.health.score).toBeLessThanOrEqual(100);
    });

    it('should return coordination channels', async () => {
      const args: FleetStatusArgs = { fleetId: 'test-fleet-123' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.coordinationChannels).toBeInstanceOf(Array);
      expect(result.data.coordinationChannels.length).toBeGreaterThan(0);
    });

    it('should return topology information', async () => {
      const args: FleetStatusArgs = { fleetId: 'test-fleet-123' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.topology).toBeDefined();
    });

    it('should include lastUpdated timestamp', async () => {
      const args: FleetStatusArgs = { fleetId: 'test-fleet-123' };
      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.lastUpdated).toBeDefined();
      expect(() => new Date(result.data.lastUpdated)).not.toThrow();
    });
  });

  describe('Response Metadata', () => {
    it('should include metadata in response', async () => {
      const args: FleetStatusArgs = { fleetId: 'test-fleet-123' };
      const result = await handler.handle(args);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.requestId).toBeDefined();
      expect(result.metadata?.timestamp).toBeDefined();
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle registry errors gracefully', async () => {
      mockAgentRegistry.getStatistics = jest.fn().mockImplementation(() => {
        throw new Error('Registry unavailable');
      });

      const args: FleetStatusArgs = { fleetId: 'test-fleet-123' };
      const result = await handler.handle(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Registry unavailable');
    });
  });
});
