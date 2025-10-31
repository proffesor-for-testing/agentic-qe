/**
 * Agent Spawn Handler Test Suite
 *
 * Comprehensive tests for agent-spawn MCP tool handler.
 * Tests agent spawning, validation, lifecycle, and resource management.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentSpawnHandler, AgentSpawnArgs, AgentInstance } from '@mcp/handlers/agent-spawn';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
vi.mock('../../../src/mcp/services/AgentRegistry.js');
vi.mock('../../../src/mcp/services/HookExecutor.js');
vi.mock('../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: vi.fn(() => 'test-random-id')
  }
}));

describe('AgentSpawnHandler', () => {
  let handler: AgentSpawnHandler;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockAgentRegistry = {
      spawnAgent: vi.fn(),
      getAgent: vi.fn(),
      listAgents: vi.fn()
    } as any;

    mockHookExecutor = {
      executePreTask: vi.fn().mockResolvedValue(undefined),
      executePostTask: vi.fn().mockResolvedValue(undefined),
      notify: vi.fn().mockResolvedValue(undefined)
    } as any;

    handler = new AgentSpawnHandler(mockAgentRegistry, mockHookExecutor);
  });

  describe('Happy Path - Agent Spawning', () => {
    it('should successfully spawn a test-generator agent', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen-1',
          capabilities: ['unit-tests', 'integration-tests']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.type).toBe('test-generator');
      expect(response.data.name).toBe('test-gen-1');
      expect(response.data.capabilities).toContain('unit-tests');
      expect(response.data.status).toBe('active');
    });

    it('should spawn coverage-analyzer agent with custom resources', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'coverage-analyzer',
          name: 'cov-analyzer-1',
          capabilities: ['gap-detection', 'sublinear-analysis'],
          resources: {
            memory: 2048,
            cpu: 2,
            storage: 1024
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.resources.memory).toBe(2048);
      expect(response.data.resources.cpu).toBe(2);
    });

    it('should spawn agent with fleet association', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'quality-gate',
          name: 'qg-1',
          capabilities: ['policy-enforcement']
        },
        fleetId: 'fleet-12345'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.fleetId).toBe('fleet-12345');
    });

    it('should spawn all 7 QE agent types successfully', async () => {
      const agentTypes = [
        'test-generator',
        'coverage-analyzer',
        'quality-gate',
        'performance-tester',
        'security-scanner',
        'chaos-engineer',
        'visual-tester'
      ];

      for (const type of agentTypes) {
        const args: AgentSpawnArgs = {
          spec: {
            type,
            name: `${type}-agent`,
            capabilities: ['default']
          }
        };

        const response = await handler.handle(args);
        expect(response.success).toBe(true);
        expect(response.data.type).toBe(type);
      }
    });
  });

  describe('Input Validation', () => {
    it('should reject missing spec parameter', async () => {
      const args = {} as AgentSpawnArgs;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('spec');
    });

    it('should reject invalid agent type', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'invalid-agent-type',
          name: 'test',
          capabilities: []
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*type/i);
    });

    it('should reject missing agent name', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: '',
          capabilities: []
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/name.*required/i);
    });

    it('should reject empty capabilities array for specialized agents', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: []
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/capabilities/i);
    });

    it('should validate resource constraints', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests'],
          resources: {
            memory: -100, // Invalid negative value
            cpu: 2,
            storage: 512
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/resource.*invalid/i);
    });
  });

  describe('Agent Lifecycle Management', () => {
    it('should initialize agent with correct initial status', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests']
        }
      };

      const response = await handler.handle(args);

      expect(response.data.status).toBe('active');
      expect(response.data.spawnedAt).toBeDefined();
      expect(response.data.lastActivity).toBeDefined();
    });

    it('should initialize metrics to zero', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests']
        }
      };

      const response = await handler.handle(args);

      expect(response.data.metrics.tasksCompleted).toBe(0);
      expect(response.data.metrics.averageExecutionTime).toBe(0);
      expect(response.data.metrics.successRate).toBe(0);
    });

    it('should assign default resources when not specified', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests']
        }
      };

      const response = await handler.handle(args);

      expect(response.data.resources).toBeDefined();
      expect(response.data.resources.memory).toBeGreaterThan(0);
      expect(response.data.resources.cpu).toBeGreaterThan(0);
      expect(response.data.resources.storage).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle registry failures gracefully', async () => {
      const mockFailingRegistry = {
        spawnAgent: vi.fn().mockRejectedValue(new Error('Registry unavailable'))
      } as any;

      const failingHandler = new AgentSpawnHandler(mockFailingRegistry, mockHookExecutor);

      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests']
        }
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Registry unavailable');
    });

    it('should handle resource exhaustion', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests'],
          resources: {
            memory: 999999999, // Unrealistic high value
            cpu: 1000,
            storage: 999999999
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/resource.*limit/i);
    });

    it('should handle duplicate agent names in same fleet', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'duplicate-name',
          capabilities: ['unit-tests']
        },
        fleetId: 'fleet-123'
      };

      // Spawn first agent
      await handler.handle(args);

      // Try to spawn duplicate
      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/duplicate.*name/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle agent spawning with maximum capabilities', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: [
            'unit-tests',
            'integration-tests',
            'e2e-tests',
            'property-based-tests',
            'mutation-tests',
            'contract-tests',
            'visual-tests',
            'performance-tests',
            'security-tests',
            'accessibility-tests'
          ]
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.capabilities.length).toBe(10);
    });

    it('should handle spawning during high load', async () => {
      const spawnPromises = Array.from({ length: 50 }, (_, i) => {
        return handler.handle({
          spec: {
            type: 'test-generator',
            name: `test-gen-${i}`,
            capabilities: ['unit-tests']
          }
        });
      });

      const results = await Promise.all(spawnPromises);

      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(0);
    });

    it('should handle special characters in agent names', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen-α-β-γ',
          capabilities: ['unit-tests']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.name).toBe('test-gen-α-β-γ');
    });
  });

  describe('Performance', () => {
    it('should spawn agent within reasonable time (<100ms)', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests']
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Agent Type Configurations', () => {
    it('should apply test-generator specific defaults', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'test-generator',
          name: 'test-gen',
          capabilities: ['unit-tests']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.type).toBe('test-generator');
    });

    it('should apply performance-tester specific defaults', async () => {
      const args: AgentSpawnArgs = {
        spec: {
          type: 'performance-tester',
          name: 'perf-tester',
          capabilities: ['load-testing']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.type).toBe('performance-tester');
    });
  });
});
