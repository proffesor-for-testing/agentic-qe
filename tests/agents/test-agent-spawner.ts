import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { exec } from 'child_process';
import { AgentRegistry } from '../../src/agents/agent-registry';
import { AgentSpawner, createAgentSpawner } from '../../src/agents/agent-spawner';
import { AgentRegistryEntry, SpawnConfig } from '../../src/types/agent';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs-extra');

const mockExec = exec as jest.MockedFunction<typeof exec>;

describe('AgentSpawner', () => {
  let registry: AgentRegistry;
  let spawner: AgentSpawner;

  const mockAgent: AgentRegistryEntry = {
    agent: {
      name: 'test-agent',
      version: '1.0.0',
      description: 'A test agent',
      category: 'testing',
      capabilities: ['test-capability'],
      system_prompt: 'You are a test agent',
    },
    filePath: '/test/agents/test-agent/agent.yaml',
    lastModified: new Date(),
    isRegistered: false,
  };

  const mockSpawnConfig: SpawnConfig = {
    agents: ['test-agent'],
    parallel: true,
    coordination: false,
    memory_namespace: 'test-namespace',
    swarm_id: 'test-swarm',
    hooks: {
      pre_task: false,
      post_task: false,
      session_restore: false,
    },
  };

  beforeEach(() => {
    registry = new AgentRegistry();
    spawner = createAgentSpawner(registry);

    // Setup registry with mock agent
    jest.spyOn(registry, 'hasAgent').mockReturnValue(true);
    jest.spyOn(registry, 'getAgent').mockReturnValue(mockAgent);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('agent spawning', () => {
    it('should spawn a single agent successfully', async () => {
      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.spawned).toBe(1);
      expect(result.data.total).toBe(1);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].status).toBe('completed');
    });

    it('should spawn multiple agents in parallel', async () => {
      const multiAgentConfig: SpawnConfig = {
        ...mockSpawnConfig,
        agents: ['agent-1', 'agent-2', 'agent-3'],
      };

      jest.spyOn(registry, 'hasAgent').mockReturnValue(true);
      jest.spyOn(registry, 'getAgent').mockReturnValue(mockAgent);

      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, multiAgentConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.spawned).toBe(3);
      expect(result.data.total).toBe(3);
      expect(result.data.parallel).toBe(true);
    });

    it('should spawn agents sequentially when parallel is disabled', async () => {
      const sequentialConfig: SpawnConfig = {
        ...mockSpawnConfig,
        parallel: false,
        agents: ['agent-1', 'agent-2'],
      };

      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, sequentialConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.parallel).toBe(false);
    });

    it('should handle agent spawn failures gracefully', async () => {
      jest.spyOn(registry, 'hasAgent').mockReturnValue(false);

      const task = 'Test task';
      const options = {};

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('Agent "test-agent" not found in registry');
    });

    it('should validate agents before spawning', async () => {
      const invalidConfig: SpawnConfig = {
        ...mockSpawnConfig,
        agents: ['non-existent-agent'],
      };

      jest.spyOn(registry, 'hasAgent').mockReturnValue(false);

      const task = 'Test task';
      const options = {};

      const result = await spawner.spawnAgents(task, invalidConfig, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown agents');
    });
  });

  describe('execution strategies', () => {
    it('should try Claude Code task execution first', async () => {
      // Mock successful Claude task execution
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, { stdout: 'Task completed', stderr: '' } as any);
        }
      });

      const task = 'Test task';
      const options = { force_claude_task: true };

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.results[0].method).toBe('claude-task');
    });

    it('should fallback to Claude-Flow when Claude task fails', async () => {
      // Mock Claude task failure, then Claude-Flow success
      mockExec
        .mockImplementationOnce((command, options, callback) => {
          if (typeof callback === 'function') {
            callback(new Error('Claude task failed'), null);
          }
        })
        .mockImplementationOnce((command, options, callback) => {
          if (typeof callback === 'function') {
            callback(null, { stdout: 'Flow completed', stderr: '' } as any);
          }
        });

      const task = 'Test task';
      const options = { force_claude_flow: true };

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.results[0].method).toBe('claude-flow');
    });

    it('should use direct execution as fallback', async () => {
      const task = 'Test task';
      const options = { force_direct: true };

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.results[0].method).toBe('direct');
    });

    it('should use registered Claude agent when available', async () => {
      const registeredAgent: AgentRegistryEntry = {
        ...mockAgent,
        claudeAgentPath: '/claude/agents/test-agent.yaml',
        isRegistered: true,
      };

      jest.spyOn(registry, 'getAgent').mockReturnValue(registeredAgent);

      // Mock fs.pathExists to return true for Claude agent
      const { pathExists } = require('fs-extra');
      pathExists.mockResolvedValue(true);

      // Mock successful Claude agent execution
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, { stdout: 'Registered agent completed', stderr: '' } as any);
        }
      });

      const task = 'Test task';
      const options = {};

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.results[0].method).toBe('registered-claude');
    });
  });

  describe('coordination and hooks', () => {
    it('should initialize coordination when enabled', async () => {
      const coordConfig: SpawnConfig = {
        ...mockSpawnConfig,
        coordination: true,
      };

      // Mock successful coordination initialization
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, { stdout: 'Coordination initialized', stderr: '' } as any);
        }
      });

      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, coordConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.coordination).toBe(true);
    });

    it('should execute pre-task and post-task hooks when enabled', async () => {
      const hookConfig: SpawnConfig = {
        ...mockSpawnConfig,
        hooks: {
          pre_task: true,
          post_task: true,
          session_restore: false,
        },
      };

      // Mock hook executions
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, { stdout: 'Hook executed', stderr: '' } as any);
        }
      });

      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, hookConfig, options);

      expect(result.success).toBe(true);
    });

    it('should handle coordination failures gracefully', async () => {
      const coordConfig: SpawnConfig = {
        ...mockSpawnConfig,
        coordination: true,
      };

      // Mock coordination failure
      mockExec.mockImplementation((command, options, callback) => {
        if (command.includes('swarm init') && typeof callback === 'function') {
          callback(new Error('Coordination failed'), null);
        } else if (typeof callback === 'function') {
          callback(null, { stdout: 'Task completed', stderr: '' } as any);
        }
      });

      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, coordConfig, options);

      // Should still succeed even if coordination fails
      expect(result.success).toBe(true);
    });
  });

  describe('agent registration', () => {
    it('should auto-register agents when requested', async () => {
      const task = 'Test task';
      const options = { auto_register: true };

      // Mock file operations for registration
      const { writeFile, ensureDir } = require('fs-extra');
      writeFile.mockResolvedValue(undefined);
      ensureDir.mockResolvedValue(undefined);

      jest.spyOn(registry, 'registerAgent').mockReturnValue(true);

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(true);
      expect(registry.registerAgent).toHaveBeenCalledWith('test-agent');
    });

    it('should register agent for Claude execution', async () => {
      // Mock file operations
      const { writeFile, ensureDir } = require('fs-extra');
      writeFile.mockResolvedValue(undefined);
      ensureDir.mockResolvedValue(undefined);

      jest.spyOn(registry, 'registerAgent').mockReturnValue(true);

      await spawner.registerAgentForClaude('test-agent');

      expect(writeFile).toHaveBeenCalledTimes(2); // Agent config + command config
      expect(registry.registerAgent).toHaveBeenCalledWith('test-agent');
    });

    it('should handle registration errors gracefully', async () => {
      jest.spyOn(registry, 'getAgent').mockReturnValue(null);

      await expect(spawner.registerAgentForClaude('non-existent')).rejects.toThrow(
        'Agent non-existent not found in registry'
      );
    });
  });

  describe('dry run mode', () => {
    it('should simulate execution in dry run mode', async () => {
      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.results[0].result.message).toContain('Dry run');
    });

    it('should not execute hooks in dry run mode', async () => {
      const hookConfig: SpawnConfig = {
        ...mockSpawnConfig,
        hooks: {
          pre_task: true,
          post_task: true,
          session_restore: true,
        },
      };

      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, hookConfig, options);

      expect(result.success).toBe(true);
      // No real hook execution should occur
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('execution summary', () => {
    it('should generate execution summary with metrics', async () => {
      const multiAgentConfig: SpawnConfig = {
        ...mockSpawnConfig,
        agents: ['agent-1', 'agent-2', 'agent-3'],
      };

      const task = 'Test task';
      const options = { dry_run: true };

      const result = await spawner.spawnAgents(task, multiAgentConfig, options);

      expect(result.success).toBe(true);
      expect(result.data.execution_summary).toBeDefined();
      expect(result.data.execution_summary.successRate).toBe(1.0);
      expect(result.data.execution_summary.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.data.execution_summary.methodCounts).toBeDefined();
      expect(result.data.execution_summary.statusCounts).toBeDefined();
    });

    it('should calculate correct success rate with failures', async () => {
      const multiAgentConfig: SpawnConfig = {
        ...mockSpawnConfig,
        agents: ['valid-agent', 'invalid-agent'],
      };

      jest.spyOn(registry, 'hasAgent')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const task = 'Test task';
      const options = {};

      const result = await spawner.spawnAgents(task, multiAgentConfig, options);

      expect(result.success).toBe(false);
      expect(result.data.execution_summary.successRate).toBeLessThan(1.0);
    });
  });

  describe('error handling', () => {
    it('should handle timeout errors', async () => {
      // Mock timeout error
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          const error = new Error('Timeout') as any;
          error.code = 'TIMEOUT';
          callback(error, null);
        }
      });

      const task = 'Test task';
      const options = { timeout: 1 }; // Very short timeout

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle command execution errors', async () => {
      // Mock command execution error
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Command failed'), null);
        }
      });

      const task = 'Test task';
      const options = { force_claude_task: true };

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      // Should fallback to direct execution
      expect(result.success).toBe(true);
      expect(result.data.results[0].method).toBe('direct');
    });

    it('should handle spawning errors gracefully', async () => {
      // Force an error during spawning
      jest.spyOn(registry, 'getAgent').mockImplementation(() => {
        throw new Error('Registry error');
      });

      const task = 'Test task';
      const options = {};

      const result = await spawner.spawnAgents(task, mockSpawnConfig, options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('factory function', () => {
    it('should create agent spawner with registry', () => {
      const newSpawner = createAgentSpawner(registry);

      expect(newSpawner).toBeInstanceOf(AgentSpawner);
    });
  });
});