/**
 * Fleet Management MCP Integration Tests
 * Tests fleet_init, agent_spawn, task_orchestrate, and fleet_status tools
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MCPTestHarness } from './test-harness';
import { TOOL_NAMES } from '@mcp/tools';

// SKIP: These integration tests need redesign - AgenticQEMCPServer doesn't expose handleToolCall
// The MCP server uses SDK request handlers internally, not a direct method call API
// TODO: Redesign tests to use proper MCP client-server communication
describe.skip('Fleet Management MCP Integration', () => {
  let harness: MCPTestHarness;

  beforeAll(async () => {
    harness = new MCPTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  beforeEach(async () => {
    await harness.clearMemory();
  });

  describe('Fleet Initialization', () => {
    it('should initialize fleet with hierarchical topology', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit', 'integration'],
          environments: ['development', 'staging'],
          frameworks: ['jest', 'mocha']
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['fleetId', 'topology', 'status']);
      expect(data.topology).toBe('hierarchical');
      expect(data.maxAgents).toBe(10);
    });

    it('should initialize fleet with mesh topology', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 8,
          testingFocus: ['performance', 'security'],
          environments: ['production'],
          frameworks: ['k6', 'gatling']
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.topology).toBe('mesh');
    });

    it('should initialize fleet with ring topology', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'ring',
          maxAgents: 6,
          testingFocus: ['e2e'],
          environments: ['staging'],
          frameworks: ['playwright']
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.topology).toBe('ring');
    });

    it('should initialize fleet with adaptive topology', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'adaptive',
          maxAgents: 15,
          testingFocus: ['unit', 'integration', 'e2e'],
          environments: ['development', 'staging', 'production'],
          frameworks: ['jest', 'cypress', 'k6']
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.topology).toBe('adaptive');
    });

    it('should fail with invalid topology', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'invalid-topology',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject maxAgents below minimum', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 3, // Below minimum of 5
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject maxAgents above maximum', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 100, // Above maximum of 50
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Agent Spawning', () => {
    const agentTypes = [
      'test-generator',
      'coverage-analyzer',
      'quality-gate',
      'performance-tester',
      'security-scanner',
      'chaos-engineer',
      'visual-tester'
    ] as const;

    agentTypes.forEach(agentType => {
      it(`should spawn ${agentType} agent`, async () => {
        const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
          spec: {
            type: agentType,
            name: `test-${agentType}`,
            capabilities: ['testing', 'analysis']
          }
        });

        harness.assertSuccess(result);
        const data = harness.parseToolResponse(result);

        harness.assertContainsFields(data, ['agentId', 'type', 'status']);
        expect(data.type).toBe(agentType);
      });
    });

    it('should spawn agent with custom resources', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          name: 'resource-heavy-generator',
          capabilities: ['test-generation', 'ai-powered'],
          resources: {
            memory: 2048,
            cpu: 4,
            storage: 10240
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.resources).toBeDefined();
      expect(data.resources.memory).toBe(2048);
      expect(data.resources.cpu).toBe(4);
    });

    it('should spawn multiple agents with unique names', async () => {
      const agents = [];

      for (let i = 0; i < 3; i++) {
        const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
          spec: {
            type: 'test-generator',
            name: `generator-${i}`,
            capabilities: ['testing']
          }
        });

        harness.assertSuccess(result);
        const data = harness.parseToolResponse(result);
        agents.push(data.agentId);
      }

      // All agents should have unique IDs
      const uniqueIds = new Set(agents);
      expect(uniqueIds.size).toBe(3);
    });

    it('should fail with invalid agent type', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'invalid-agent-type',
          capabilities: ['testing']
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Task Orchestration', () => {
    it('should orchestrate task with parallel strategy', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Generate comprehensive test suite for authentication module',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 5
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['taskId', 'strategy', 'assignedAgents']);
      expect(data.strategy).toBe('parallel');
    });

    it('should orchestrate task with sequential strategy', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Analyze code coverage and generate report',
        priority: 'medium',
        strategy: 'sequential'
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.strategy).toBe('sequential');
    });

    it('should orchestrate task with adaptive strategy', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Run full regression test suite',
        priority: 'critical',
        strategy: 'adaptive',
        maxAgents: 8
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.strategy).toBe('adaptive');
      expect(data.priority).toBe('critical');
    });

    it('should handle different priority levels', async () => {
      const priorities = ['low', 'medium', 'high', 'critical'] as const;

      for (const priority of priorities) {
        const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
          task: `Priority ${priority} task`,
          priority,
          strategy: 'adaptive'
        });

        harness.assertSuccess(result);
        const data = harness.parseToolResponse(result);
        expect(data.priority).toBe(priority);
      }
    });

    it('should limit agent assignment based on maxAgents', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Large scale performance testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 3
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.assignedAgents.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Fleet Status', () => {
    it('should get fleet status without fleet ID (active fleet)', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_STATUS, {});

      // May or may not succeed depending on whether a fleet is active
      expect(result).toBeDefined();
    });

    it('should get fleet status with verbose metrics', async () => {
      // First initialize a fleet
      const initResult = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      harness.assertSuccess(initResult);
      const initData = harness.parseToolResponse(initResult);

      // Then get status
      const statusResult = await harness.callTool(TOOL_NAMES.FLEET_STATUS, {
        fleetId: initData.fleetId,
        includeMetrics: true
      });

      harness.assertSuccess(statusResult);
      const statusData = harness.parseToolResponse(statusResult);

      harness.assertContainsFields(statusData, ['fleetId', 'topology', 'agentCount', 'status']);
    });

    it('should handle non-existent fleet ID gracefully', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_STATUS, {
        fleetId: 'non-existent-fleet-id'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Agent Lifecycle Management', () => {
    it('should track agent lifecycle from spawn to execution', async () => {
      // 1. Spawn agent
      const spawnResult = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          name: 'lifecycle-test-agent',
          capabilities: ['test-generation']
        }
      });

      harness.assertSuccess(spawnResult);
      const spawnData = harness.parseToolResponse(spawnResult);
      const agentId = spawnData.agentId;

      // 2. Assign task to agent
      const taskResult = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Generate unit tests',
        priority: 'medium',
        strategy: 'sequential'
      });

      harness.assertSuccess(taskResult);

      // 3. Check task status
      const taskData = harness.parseToolResponse(taskResult);
      const statusResult = await harness.callTool(TOOL_NAMES.TASK_STATUS, {
        taskId: taskData.taskId
      });

      expect(statusResult).toBeDefined();
    });
  });

  describe('Parallel Agent Spawning', () => {
    it('should handle concurrent agent spawn requests', async () => {
      const spawnPromises = [];

      for (let i = 0; i < 5; i++) {
        spawnPromises.push(
          harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
            spec: {
              type: 'test-generator',
              name: `concurrent-agent-${i}`,
              capabilities: ['testing']
            }
          })
        );
      }

      const results = await Promise.all(spawnPromises);

      // All spawns should succeed
      results.forEach(result => {
        harness.assertSuccess(result);
      });

      // All agents should have unique IDs
      const agentIds = results.map(r => harness.parseToolResponse(r).agentId);
      const uniqueIds = new Set(agentIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('Fleet Coordination', () => {
    it('should coordinate multiple agents for complex workflow', async () => {
      // 1. Initialize fleet
      const fleetResult = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit', 'integration', 'performance'],
          environments: ['development'],
          frameworks: ['jest', 'k6']
        }
      });

      harness.assertSuccess(fleetResult);
      const fleetData = harness.parseToolResponse(fleetResult);

      // 2. Spawn multiple specialized agents
      const generatorResult = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          capabilities: ['test-generation']
        }
      });

      const analyzerResult = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'coverage-analyzer',
          capabilities: ['coverage-analysis']
        }
      });

      const qualityResult = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'quality-gate',
          capabilities: ['quality-validation']
        }
      });

      harness.assertSuccess(generatorResult);
      harness.assertSuccess(analyzerResult);
      harness.assertSuccess(qualityResult);

      // 3. Orchestrate coordinated workflow
      const workflowResult = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Execute complete testing workflow',
        priority: 'high',
        strategy: 'adaptive',
        maxAgents: 3
      });

      harness.assertSuccess(workflowResult);

      // 4. Check fleet status
      const statusResult = await harness.callTool(TOOL_NAMES.FLEET_STATUS, {
        fleetId: fleetData.fleetId
      });

      harness.assertSuccess(statusResult);
      const statusData = harness.parseToolResponse(statusResult);

      expect(statusData.agentCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Error Recovery', () => {
    it('should handle agent spawn failures gracefully', async () => {
      // Attempt to spawn with invalid configuration
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          capabilities: [], // Empty capabilities
          resources: {
            memory: -1, // Invalid memory
            cpu: 0
          }
        }
      });

      // Should fail gracefully
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
