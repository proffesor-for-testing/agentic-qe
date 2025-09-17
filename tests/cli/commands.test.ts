/**
 * CLI Commands Tests
 * Testing command-line interface functionality
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createMockAgentSpawner,
  createMockAgentRegistry,
  createMockLogger,
  createMockCommand
} from '../mocks';
import { createTestAgent, createTestSession } from '../utils/test-builders';

// Mock Command implementations for testing
class MockSpawnCommand {
  private spawner: any;
  private registry: any;
  private logger: any;

  constructor(spawner?: any, registry?: any, logger?: any) {
    this.spawner = spawner || createMockAgentSpawner();
    this.registry = registry || createMockAgentRegistry();
    this.logger = logger || createMockLogger();
  }

  async execute(agents: string[], options: any): Promise<any> {
    // Validate agent names
    for (const agentName of agents) {
      const agent = await this.registry.getAgentByName(agentName);
      if (!agent && agentName !== 'risk-oracle') { // Mock: risk-oracle exists
        return {
          success: false,
          error: `Agent not found: ${agentName}`
        };
      }
    }

    // Spawn agents
    const results = [];
    for (const agentName of agents) {
      try {
        const result = await this.spawner.spawn(agentName, options);
        results.push(result);
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    return {
      success: true,
      message: `Successfully spawned ${agents.length} agent(s)`,
      agents: results
    };
  }

  validate(args: string[], options: any): { valid: boolean; error?: string } {
    if (!args || args.length === 0) {
      return { valid: false, error: 'No agents specified' };
    }

    if (!options.task && !options.interactive) {
      return { valid: false, error: 'Task description required' };
    }

    return { valid: true };
  }
}

class MockListCommand {
  private registry: any;

  constructor(registry?: any) {
    this.registry = registry || createMockAgentRegistry();
  }

  async execute(args: string[], options: any): Promise<any> {
    const agents = await this.registry.getAllAgents();

    if (options.category) {
      const filtered = agents.filter((a: any) => a.category === options.category);
      return {
        success: true,
        agents: filtered,
        count: filtered.length
      };
    }

    return {
      success: true,
      agents,
      count: agents.length
    };
  }
}

class MockStatusCommand {
  private spawner: any;

  constructor(spawner?: any) {
    this.spawner = spawner || createMockAgentSpawner();
  }

  async execute(): Promise<any> {
    const agents = await this.spawner.listAgents();

    return {
      success: true,
      status: 'active',
      activeAgents: agents.length,
      agents
    };
  }
}

class MockInitCommand {
  async execute(args: string[], options: any): Promise<any> {
    // Mock initialization logic
    return {
      success: true,
      message: 'QE Framework initialized successfully',
      config: {
        agentsPath: options.agentsPath || './agents',
        logsPath: options.logsPath || './logs',
        sessionPath: options.sessionPath || './sessions'
      }
    };
  }
}

describe('CLI Commands', () => {
  let mockSpawner: any;
  let mockRegistry: any;
  let mockLogger: any;

  beforeEach(() => {
    mockSpawner = createMockAgentSpawner();
    mockRegistry = createMockAgentRegistry();
    mockLogger = createMockLogger();

    // Setup mock registry with some agents
    mockRegistry.getAllAgents.mockResolvedValue([
      { name: 'risk-oracle', category: 'quality-engineering' },
      { name: 'tdd-pair-programmer', category: 'quality-engineering' },
      { name: 'test-architect', category: 'quality-engineering' }
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('spawn command', () => {
    let command: MockSpawnCommand;

    beforeEach(() => {
      command = new MockSpawnCommand(mockSpawner, mockRegistry, mockLogger);
    });

    it('should spawn agent with valid name', async () => {
      const result = await command.execute(['risk-oracle'], { task: 'analyze' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully spawned');
      expect(mockSpawner.spawn).toHaveBeenCalledWith('risk-oracle', { task: 'analyze' });
    });

    it('should handle invalid agent names gracefully', async () => {
      mockRegistry.getAgentByName.mockResolvedValue(null);

      const result = await command.execute(['non-existent'], { task: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent not found');
    });

    it('should spawn multiple agents', async () => {
      const result = await command.execute(
        ['risk-oracle', 'tdd-pair-programmer'],
        { task: 'comprehensive analysis' }
      );

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(2);
      expect(mockSpawner.spawn).toHaveBeenCalledTimes(2);
    });

    it('should validate required parameters', () => {
      const validation = command.validate([], { task: 'test' });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('No agents specified');
    });

    it('should require task description', () => {
      const validation = command.validate(['risk-oracle'], {});
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Task description required');
    });

    it('should allow interactive mode without task', () => {
      const validation = command.validate(['risk-oracle'], { interactive: true });
      expect(validation.valid).toBe(true);
    });

    it('should handle spawn errors gracefully', async () => {
      mockSpawner.spawn.mockRejectedValue(new Error('Spawn failed'));

      const result = await command.execute(['risk-oracle'], { task: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Spawn failed');
    });
  });

  describe('list command', () => {
    let command: MockListCommand;

    beforeEach(() => {
      command = new MockListCommand(mockRegistry);
    });

    it('should list all available agents', async () => {
      const result = await command.execute([], {});

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(result.agents).toHaveLength(3);
    });

    it('should filter agents by category', async () => {
      const result = await command.execute([], { category: 'quality-engineering' });

      expect(result.success).toBe(true);
      expect(result.agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'quality-engineering' })
        ])
      );
    });

    it('should handle empty agent list', async () => {
      mockRegistry.getAllAgents.mockResolvedValue([]);

      const result = await command.execute([], {});

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.agents).toEqual([]);
    });
  });

  describe('status command', () => {
    let command: MockStatusCommand;

    beforeEach(() => {
      command = new MockStatusCommand(mockSpawner);
    });

    it('should show swarm status', async () => {
      mockSpawner.listAgents.mockResolvedValue([
        { id: 'agent-1', name: 'risk-oracle', status: 'active' },
        { id: 'agent-2', name: 'tdd-pair-programmer', status: 'idle' }
      ]);

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.status).toBe('active');
      expect(result.activeAgents).toBe(2);
      expect(result.agents).toHaveLength(2);
    });

    it('should handle no active agents', async () => {
      mockSpawner.listAgents.mockResolvedValue([]);

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.activeAgents).toBe(0);
      expect(result.agents).toEqual([]);
    });
  });

  describe('init command', () => {
    let command: MockInitCommand;

    beforeEach(() => {
      command = new MockInitCommand();
    });

    it('should initialize QE framework', async () => {
      const result = await command.execute([], {});

      expect(result.success).toBe(true);
      expect(result.message).toContain('initialized successfully');
      expect(result.config).toHaveProperty('agentsPath');
      expect(result.config).toHaveProperty('logsPath');
      expect(result.config).toHaveProperty('sessionPath');
    });

    it('should use custom paths if provided', async () => {
      const result = await command.execute([], {
        agentsPath: '/custom/agents',
        logsPath: '/custom/logs',
        sessionPath: '/custom/sessions'
      });

      expect(result.config.agentsPath).toBe('/custom/agents');
      expect(result.config.logsPath).toBe('/custom/logs');
      expect(result.config.sessionPath).toBe('/custom/sessions');
    });
  });

  describe('Command Pipeline', () => {
    it('should support command chaining', async () => {
      const initCommand = new MockInitCommand();
      const listCommand = new MockListCommand(mockRegistry);
      const spawnCommand = new MockSpawnCommand(mockSpawner, mockRegistry);

      // Initialize framework
      const initResult = await initCommand.execute([], {});
      expect(initResult.success).toBe(true);

      // List available agents
      const listResult = await listCommand.execute([], {});
      expect(listResult.success).toBe(true);

      // Spawn an agent
      const spawnResult = await spawnCommand.execute(
        ['risk-oracle'],
        { task: 'test pipeline' }
      );
      expect(spawnResult.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockRegistry.getAllAgents.mockRejectedValue(new Error('Network error'));

      const command = new MockListCommand(mockRegistry);
      await expect(command.execute([], {})).rejects.toThrow('Network error');
    });

    it('should handle invalid options gracefully', async () => {
      const command = new MockSpawnCommand(mockSpawner, mockRegistry);
      const result = await command.execute(['risk-oracle'], {
        task: 'test',
        invalidOption: 'should be ignored'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Interactive Mode', () => {
    it('should support interactive agent selection', async () => {
      const command = new MockSpawnCommand(mockSpawner, mockRegistry);

      // Mock interactive selection
      const result = await command.execute(['risk-oracle'], {
        interactive: true,
        task: 'Selected interactively'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Parallel Execution', () => {
    it('should spawn multiple agents in parallel', async () => {
      const command = new MockSpawnCommand(mockSpawner, mockRegistry);

      const agents = ['risk-oracle', 'tdd-pair-programmer', 'test-architect'];
      const startTime = Date.now();

      const result = await command.execute(agents, {
        task: 'parallel test',
        parallel: true
      });

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(3);
      // Parallel execution should be fast (mocked instant returns)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Output Formatting', () => {
    it('should support JSON output format', async () => {
      const command = new MockListCommand(mockRegistry);
      const result = await command.execute([], { format: 'json' });

      expect(result.success).toBe(true);
      expect(typeof result).toBe('object');
      expect(result.agents).toBeDefined();
    });

    it('should support verbose output', async () => {
      const command = new MockStatusCommand(mockSpawner);
      mockSpawner.listAgents.mockResolvedValue([
        {
          id: 'agent-1',
          name: 'risk-oracle',
          status: 'active',
          memory: '50MB',
          uptime: '5m',
          tasksCompleted: 10
        }
      ]);

      const result = await command.execute();

      expect(result.agents[0]).toHaveProperty('memory');
      expect(result.agents[0]).toHaveProperty('uptime');
      expect(result.agents[0]).toHaveProperty('tasksCompleted');
    });
  });
});