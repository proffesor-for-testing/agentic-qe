/**
 * Fleet Initialization Handler Test Suite
 *
 * Comprehensive tests for fleet-init MCP tool handler.
 * Tests fleet creation, topology configuration, and coordination setup.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { FleetInitHandler, FleetInitArgs, FleetInstance } from '@mcp/handlers/fleet-init';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
jest.mock('../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../src/mcp/services/HookExecutor.js');
jest.mock('../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: jest.fn(() => 'test-fleet-id')
  }
}));

describe('FleetInitHandler', () => {
  let handler: FleetInitHandler;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockAgentRegistry = {
      createFleet: jest.fn(),
      getFleet: jest.fn(),
      listFleets: jest.fn(),
      getStatistics: jest.fn().mockReturnValue({ totalAgents: 0, activeAgents: 0, idleAgents: 0 })
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;

    handler = new FleetInitHandler(mockAgentRegistry, mockHookExecutor);
  });

  describe('Happy Path - Fleet Initialization', () => {
    it('should initialize hierarchical fleet successfully', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit', 'integration'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.topology).toBe('hierarchical');
      expect(response.data.maxAgents).toBe(10);
      expect(response.data.status).toBe('active');
    });

    it('should initialize mesh topology fleet', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'mesh',
          maxAgents: 8,
          testingFocus: ['e2e'],
          environments: ['staging'],
          frameworks: ['playwright']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.topology).toBe('mesh');
      expect(response.data.coordinationChannels).toBeDefined();
      expect(response.data.coordinationChannels.length).toBeGreaterThan(0);
    });

    it('should initialize ring topology fleet', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'ring',
          maxAgents: 6,
          testingFocus: ['performance'],
          environments: ['production'],
          frameworks: ['k6']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.topology).toBe('ring');
    });

    it('should initialize adaptive topology fleet', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'adaptive',
          maxAgents: 15,
          testingFocus: ['unit', 'integration', 'e2e', 'performance'],
          environments: ['development', 'staging'],
          frameworks: ['jest', 'playwright', 'k6']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.topology).toBe('adaptive');
    });

    it('should include project context in fleet configuration', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        },
        projectContext: {
          repositoryUrl: 'https://github.com/test/repo',
          language: 'typescript',
          buildSystem: 'npm'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.configuration).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should reject missing config parameter', async () => {
      const args = {} as FleetInitArgs;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject invalid topology', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'invalid-topology' as any,
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*topology/i);
    });

    it('should reject maxAgents below minimum', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 0,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/maxAgents.*between/i);
    });

    it('should reject maxAgents above maximum', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 100,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/maxAgents.*between/i);
    });
  });

  describe('Coordination Setup', () => {
    it('should establish coordination channels for mesh topology', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'mesh',
          maxAgents: 8,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.coordinationChannels).toBeDefined();
      expect(Array.isArray(response.data.coordinationChannels)).toBe(true);
    });

    it('should call pre-task hook before initialization', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executePreTask).toHaveBeenCalled();
    });

    it('should call post-task hook after initialization', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executePostTask).toHaveBeenCalled();
    });
  });

  describe('Fleet Status Management', () => {
    it('should initialize with "active" status', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.data.status).toBe('active');
    });

    it('should start with zero current agents', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.data.currentAgents).toBe(0);
    });

    it('should set createdAt timestamp', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.data.createdAt).toBeDefined();
      expect(new Date(response.data.createdAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle registry failures gracefully', async () => {
      const mockFailingRegistry = {
        getStatistics: jest.fn().mockImplementation(() => {
          throw new Error('Registry unavailable');
        })
      } as any;

      const failingHandler = new FleetInitHandler(mockFailingRegistry, mockHookExecutor);

      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Registry unavailable');
    });

    it('should handle hook execution failures', async () => {
      const mockFailingHook = {
        executePreTask: jest.fn().mockRejectedValue(new Error('Hook failed')),
        executePostTask: jest.fn()
      } as any;

      const failingHandler = new FleetInitHandler(mockAgentRegistry, mockFailingHook);

      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle maximum agent capacity fleet', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 50,
          testingFocus: ['unit', 'integration', 'e2e'],
          environments: ['development', 'staging', 'production'],
          frameworks: ['jest', 'playwright', 'k6']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.maxAgents).toBe(50);
    });

    it('should handle all testing focus areas', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'adaptive',
          maxAgents: 20,
          testingFocus: ['unit', 'integration', 'e2e', 'performance', 'security', 'accessibility'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });

    it('should handle concurrent fleet initializations', async () => {
      const initPromises = Array.from({ length: 10 }, (_, i) => {
        return handler.handle({
          config: {
            topology: 'hierarchical',
            maxAgents: 10,
            testingFocus: ['unit'],
            environments: ['development'],
            frameworks: ['jest']
          }
        });
      });

      const results = await Promise.all(initPromises);

      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(10);
    });
  });

  describe('Performance', () => {
    it('should initialize fleet within reasonable time (<200ms)', async () => {
      const args: FleetInitArgs = {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(200);
    });
  });
});
