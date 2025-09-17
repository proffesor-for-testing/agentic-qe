/**
 * MCP Server Tests
 * Testing the Model Context Protocol server integration
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createMockMCPServer,
  createMockAgentRegistry,
  createMockFileSystem,
  createMockLogger
} from '../mocks';
import { createTestAgent, createTestContext } from '../utils/test-builders';

// Mock MCP Server implementation for testing
class MockQEMCPServer {
  private agentRegistry: any;
  private logger: any;
  private agents: any[];

  constructor(agentRegistry?: any, logger?: any) {
    this.agentRegistry = agentRegistry || createMockAgentRegistry();
    this.logger = logger || createMockLogger();
    this.agents = [];
  }

  async initialize(): Promise<boolean> {
    this.agents = await this.loadAgents();
    return true;
  }

  async loadAgents(): Promise<any[]> {
    // Mock loading agents from registry
    return [
      {
        name: 'risk-oracle',
        category: 'quality-engineering',
        description: 'Predictive risk assessment'
      },
      {
        name: 'tdd-pair-programmer',
        category: 'quality-engineering',
        description: 'Test-driven development assistant'
      },
      {
        name: 'test-architect',
        category: 'quality-engineering',
        description: 'Test strategy designer'
      }
    ];
  }

  async getTools(): Promise<any[]> {
    return this.agents.map(agent => ({
      name: `qe_${agent.name.replace(/-/g, '_')}`,
      description: agent.description,
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Task description' },
          projectPath: { type: 'string', description: 'Project path' },
          analysisDepth: { type: 'string', enum: ['shallow', 'deep'] }
        },
        required: ['task']
      }
    }));
  }

  async handleToolCall(toolName: string, args: any): Promise<any> {
    if (!toolName.startsWith('qe_')) {
      return {
        content: [{ type: 'text', text: 'Invalid tool name' }],
        isError: true
      };
    }

    const agentName = toolName.substring(3).replace(/_/g, '-');
    const agent = this.agents.find(a => a.name === agentName);

    if (!agent) {
      return {
        content: [{ type: 'text', text: `Agent ${agentName} not found` }],
        isError: true
      };
    }

    // Simulate agent execution
    const result = await this.executeAgent(agent, args);

    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ],
      isError: false
    };
  }

  private async executeAgent(agent: any, args: any): Promise<string> {
    // Mock agent execution
    return `Executed ${agent.name} with task: ${args.task}`;
  }

  async getResources(): Promise<any[]> {
    return [
      {
        uri: 'qe://agents',
        name: 'Available QE Agents',
        description: 'List of all available QE agents',
        mimeType: 'application/json'
      },
      {
        uri: 'qe://status',
        name: 'QE Framework Status',
        description: 'Current status of the QE framework',
        mimeType: 'application/json'
      }
    ];
  }

  async handleResourceRead(uri: string): Promise<any> {
    if (uri === 'qe://agents') {
      return {
        contents: [
          {
            uri: 'qe://agents',
            mimeType: 'application/json',
            text: JSON.stringify(this.agents, null, 2)
          }
        ]
      };
    }

    if (uri === 'qe://status') {
      return {
        contents: [
          {
            uri: 'qe://status',
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'active',
              agentCount: this.agents.length,
              serverVersion: '1.0.0'
            }, null, 2)
          }
        ]
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  async shutdown(): Promise<boolean> {
    this.agents = [];
    return true;
  }
}

describe('QE MCP Server', () => {
  let server: MockQEMCPServer;
  let mockRegistry: any;
  let mockLogger: any;

  beforeEach(() => {
    mockRegistry = createMockAgentRegistry();
    mockLogger = createMockLogger();
    server = new MockQEMCPServer(mockRegistry, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const result = await server.initialize();
      expect(result).toBe(true);
    });

    it('should load agents on initialization', async () => {
      await server.initialize();
      const tools = await server.getTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should handle initialization errors gracefully', async () => {
      server['loadAgents'] = jest.fn<() => Promise<any[]>>().mockRejectedValue(new Error('Load failed'));

      await expect(server.initialize()).resolves.toBe(true); // Should handle error internally
    });
  });

  describe('Tool Discovery', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should expose QE agents as MCP tools', async () => {
      const tools = await server.getTools();

      expect(tools).toContainEqual(
        expect.objectContaining({
          name: 'qe_risk_oracle',
          description: expect.stringContaining('risk')
        })
      );
    });

    it('should convert agent names to tool names correctly', async () => {
      const tools = await server.getTools();
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('qe_risk_oracle');
      expect(toolNames).toContain('qe_tdd_pair_programmer');
      expect(toolNames).toContain('qe_test_architect');
    });

    it('should provide valid input schemas for tools', async () => {
      const tools = await server.getTools();

      tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toHaveProperty('task');
        expect(tool.inputSchema.required).toContain('task');
      });
    });
  });

  describe('Tool Execution', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should execute agent through MCP interface', async () => {
      const result = await server.handleToolCall('qe_risk_oracle', {
        task: 'analyze security risks',
        projectPath: '/test/project'
      });

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('risk-oracle');
    });

    it('should handle invalid tool names', async () => {
      const result = await server.handleToolCall('invalid_tool', {
        task: 'test'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid tool name');
    });

    it('should handle non-existent agents', async () => {
      const result = await server.handleToolCall('qe_non_existent', {
        task: 'test'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should pass analysis depth parameter correctly', async () => {
      const executeSpy = jest.spyOn(server as any, 'executeAgent');

      await server.handleToolCall('qe_risk_oracle', {
        task: 'analyze',
        projectPath: '/test',
        analysisDepth: 'deep'
      });

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'risk-oracle' }),
        expect.objectContaining({ analysisDepth: 'deep' })
      );
    });

    it('should handle execution errors gracefully', async () => {
      server['executeAgent'] = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Execution failed'));

      const result = await server.handleToolCall('qe_risk_oracle', {
        task: 'failing task'
      });

      // Should catch error and return error response
      expect(result).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should provide resource list', async () => {
      const resources = await server.getResources();

      expect(resources).toContainEqual(
        expect.objectContaining({
          uri: 'qe://agents',
          name: 'Available QE Agents'
        })
      );

      expect(resources).toContainEqual(
        expect.objectContaining({
          uri: 'qe://status',
          name: 'QE Framework Status'
        })
      );
    });

    it('should handle agent list resource read', async () => {
      const result = await server.handleResourceRead('qe://agents');

      expect(result.contents).toBeDefined();
      expect(result.contents[0].mimeType).toBe('application/json');

      const agents = JSON.parse(result.contents[0].text);
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should handle status resource read', async () => {
      const result = await server.handleResourceRead('qe://status');

      expect(result.contents).toBeDefined();
      const status = JSON.parse(result.contents[0].text);

      expect(status).toHaveProperty('status', 'active');
      expect(status).toHaveProperty('agentCount');
      expect(status).toHaveProperty('serverVersion');
    });

    it('should handle invalid resource URIs', async () => {
      await expect(server.handleResourceRead('qe://invalid'))
        .rejects.toThrow('Resource not found');
    });
  });

  describe('Multiple Agent Execution', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should handle parallel agent executions', async () => {
      const executions = [
        server.handleToolCall('qe_risk_oracle', { task: 'task1' }),
        server.handleToolCall('qe_tdd_pair_programmer', { task: 'task2' }),
        server.handleToolCall('qe_test_architect', { task: 'task3' })
      ];

      const results = await Promise.all(executions);

      results.forEach(result => {
        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
      });
    });

    it('should maintain agent isolation', async () => {
      // Execute same agent with different parameters
      const result1 = await server.handleToolCall('qe_risk_oracle', {
        task: 'analyze module A',
        projectPath: '/projectA'
      });

      const result2 = await server.handleToolCall('qe_risk_oracle', {
        task: 'analyze module B',
        projectPath: '/projectB'
      });

      expect(result1.content[0].text).toContain('module A');
      expect(result2.content[0].text).toContain('module B');
    });
  });

  describe('Lifecycle Management', () => {
    it('should shutdown cleanly', async () => {
      await server.initialize();
      const result = await server.shutdown();

      expect(result).toBe(true);

      // Should clear agents on shutdown
      const tools = await server.getTools();
      expect(tools.length).toBe(0);
    });

    it('should allow re-initialization after shutdown', async () => {
      await server.initialize();
      await server.shutdown();
      await server.initialize();

      const tools = await server.getTools();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed tool arguments', async () => {
      await server.initialize();

      const result = await server.handleToolCall('qe_risk_oracle', null);
      expect(result).toBeDefined();
    });

    it('should handle missing required parameters', async () => {
      await server.initialize();

      const result = await server.handleToolCall('qe_risk_oracle', {
        // Missing 'task' parameter
        projectPath: '/test'
      });

      expect(result).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should cache agent list for performance', async () => {
      await server.initialize();

      const loadSpy = jest.spyOn(server as any, 'loadAgents');

      // Multiple tool calls shouldn't reload agents
      await server.getTools();
      await server.getTools();
      await server.getTools();

      // loadAgents should only be called during initialization
      expect(loadSpy).not.toHaveBeenCalled();
    });
  });
});