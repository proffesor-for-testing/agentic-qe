import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import { AgentRegistry } from '../../src/agents/agent-registry';
import { Agent } from '../../src/types/agent';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('glob');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  const testAgentsPath = '/test/agents';
  const testClaudeAgentsPath = '/test/claude/agents';
  const testClaudeCommandsPath = '/test/claude/commands';

  beforeEach(() => {
    registry = new AgentRegistry({
      agentsPath: testAgentsPath,
      claudeAgentsPath: testClaudeAgentsPath,
      claudeCommandsPath: testClaudeCommandsPath,
      validateOnLoad: true,
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      const defaultRegistry = new AgentRegistry();
      expect(defaultRegistry).toBeInstanceOf(AgentRegistry);
    });

    it('should initialize with custom options', () => {
      expect(registry).toBeInstanceOf(AgentRegistry);
    });

    it('should ensure directories exist during initialization', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined);

      // Mock glob to return empty array
      const { glob } = require('glob');
      glob.mockResolvedValue([]);

      await registry.initialize();

      expect(mockFs.ensureDir).toHaveBeenCalledWith(testAgentsPath);
      expect(mockFs.ensureDir).toHaveBeenCalledWith(testClaudeAgentsPath);
      expect(mockFs.ensureDir).toHaveBeenCalledWith(testClaudeCommandsPath);
    });
  });

  describe('agent loading', () => {
    const mockAgent: Agent = {
      name: 'test-agent',
      version: '1.0.0',
      description: 'A test agent',
      category: 'testing',
      capabilities: ['test-capability'],
      system_prompt: 'You are a test agent',
    };

    const mockAgentYaml = yaml.stringify(mockAgent);

    beforeEach(() => {
      // Mock file system operations
      mockFs.readFile.mockResolvedValue(mockAgentYaml);
      mockFs.stat.mockResolvedValue({ mtime: new Date() } as any);
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.ensureDir.mockResolvedValue(undefined);

      // Mock glob
      const { glob } = require('glob');
      glob.mockResolvedValue(['/test/agents/test-agent/agent.yaml']);
    });

    it('should scan and load agents from YAML files', async () => {
      const agents = await registry.scanAndLoadAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].agent.name).toBe('test-agent');
      expect(agents[0].agent.description).toBe('A test agent');
    });

    it('should validate agent schema during loading', async () => {
      const invalidAgent = { name: 'invalid' }; // Missing required fields
      mockFs.readFile.mockResolvedValue(yaml.stringify(invalidAgent));

      const agents = await registry.scanAndLoadAgents();

      // Should return empty array for invalid agents
      expect(agents).toHaveLength(0);
    });

    it('should handle file reading errors gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const agents = await registry.scanAndLoadAgents();

      expect(agents).toHaveLength(0);
    });

    it('should load agent by name', async () => {
      // First load all agents
      await registry.scanAndLoadAgents();

      const agent = registry.getAgent('test-agent');

      expect(agent).toBeDefined();
      expect(agent?.agent.name).toBe('test-agent');
    });

    it('should return null for non-existent agent', () => {
      const agent = registry.getAgent('non-existent');

      expect(agent).toBeNull();
    });
  });

  describe('agent searching and filtering', () => {
    beforeEach(async () => {
      // Setup test agents
      const agents = [
        {
          name: 'test-agent-1',
          version: '1.0.0',
          description: 'First test agent',
          category: 'testing',
          capabilities: ['test-capability', 'analysis'],
          tags: ['test', 'unit'],
          pactLevel: 1,
        },
        {
          name: 'test-agent-2',
          version: '1.0.0',
          description: 'Second test agent',
          category: 'quality-engineering',
          capabilities: ['validation', 'reporting'],
          tags: ['test', 'integration'],
          pactLevel: 2,
        },
      ];

      // Mock file operations for each agent
      const { glob } = require('glob');
      glob.mockResolvedValue([
        '/test/agents/test-agent-1/agent.yaml',
        '/test/agents/test-agent-2/agent.yaml',
      ]);

      mockFs.readFile
        .mockResolvedValueOnce(yaml.stringify(agents[0]))
        .mockResolvedValueOnce(yaml.stringify(agents[1]));

      mockFs.stat.mockResolvedValue({ mtime: new Date() } as any);
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.ensureDir.mockResolvedValue(undefined);

      await registry.scanAndLoadAgents();
    });

    it('should get all agents', () => {
      const agents = registry.getAllAgents();

      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.agent.name)).toEqual(['test-agent-1', 'test-agent-2']);
    });

    it('should filter agents by category', () => {
      const testingAgents = registry.getAgentsByCategory('testing');
      const qeAgents = registry.getAgentsByCategory('quality-engineering');

      expect(testingAgents).toHaveLength(1);
      expect(testingAgents[0].agent.name).toBe('test-agent-1');

      expect(qeAgents).toHaveLength(1);
      expect(qeAgents[0].agent.name).toBe('test-agent-2');
    });

    it('should filter agents by capabilities', () => {
      const analysisAgents = registry.getAgentsByCapabilities(['analysis']);
      const validationAgents = registry.getAgentsByCapabilities(['validation']);

      expect(analysisAgents).toHaveLength(1);
      expect(analysisAgents[0].agent.name).toBe('test-agent-1');

      expect(validationAgents).toHaveLength(1);
      expect(validationAgents[0].agent.name).toBe('test-agent-2');
    });

    it('should filter agents by tags', () => {
      const unitTestAgents = registry.getAgentsByTags(['unit']);
      const integrationTestAgents = registry.getAgentsByTags(['integration']);

      expect(unitTestAgents).toHaveLength(1);
      expect(unitTestAgents[0].agent.name).toBe('test-agent-1');

      expect(integrationTestAgents).toHaveLength(1);
      expect(integrationTestAgents[0].agent.name).toBe('test-agent-2');
    });

    it('should filter agents by PACT level', () => {
      const level1Agents = registry.getAgentsByPactLevel(1);
      const level2Agents = registry.getAgentsByPactLevel(2);

      expect(level1Agents).toHaveLength(1);
      expect(level1Agents[0].agent.name).toBe('test-agent-1');

      expect(level2Agents).toHaveLength(1);
      expect(level2Agents[0].agent.name).toBe('test-agent-2');
    });

    it('should search agents with text query', () => {
      const searchResults = registry.searchAgents({
        searchText: 'first',
      });

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].agent.name).toBe('test-agent-1');
    });

    it('should search agents with multiple criteria', () => {
      const searchResults = registry.searchAgents({
        category: 'testing',
        capabilities: ['test-capability'],
        tags: ['unit'],
      });

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].agent.name).toBe('test-agent-1');
    });

    it('should sort search results', () => {
      const byNameAsc = registry.searchAgents({
        sortBy: 'name',
        sortOrder: 'asc',
      });

      const byNameDesc = registry.searchAgents({
        sortBy: 'name',
        sortOrder: 'desc',
      });

      expect(byNameAsc.map(a => a.agent.name)).toEqual(['test-agent-1', 'test-agent-2']);
      expect(byNameDesc.map(a => a.agent.name)).toEqual(['test-agent-2', 'test-agent-1']);
    });

    it('should limit search results', () => {
      const limitedResults = registry.searchAgents({
        limit: 1,
      });

      expect(limitedResults).toHaveLength(1);
    });
  });

  describe('agent registration', () => {
    beforeEach(async () => {
      const mockAgent = {
        name: 'test-agent',
        version: '1.0.0',
        description: 'A test agent',
        category: 'testing',
      };

      const { glob } = require('glob');
      glob.mockResolvedValue(['/test/agents/test-agent/agent.yaml']);

      mockFs.readFile.mockResolvedValue(yaml.stringify(mockAgent));
      mockFs.stat.mockResolvedValue({ mtime: new Date() } as any);
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.ensureDir.mockResolvedValue(undefined);

      await registry.scanAndLoadAgents();
    });

    it('should register an agent', () => {
      const result = registry.registerAgent('test-agent');

      expect(result).toBe(true);

      const agent = registry.getAgent('test-agent');
      expect(agent?.isRegistered).toBe(true);
    });

    it('should unregister an agent', () => {
      registry.registerAgent('test-agent');
      const result = registry.unregisterAgent('test-agent');

      expect(result).toBe(true);

      const agent = registry.getAgent('test-agent');
      expect(agent?.isRegistered).toBe(false);
    });

    it('should return false when registering non-existent agent', () => {
      const result = registry.registerAgent('non-existent');

      expect(result).toBe(false);
    });

    it('should get only registered agents', () => {
      registry.registerAgent('test-agent');

      const registeredAgents = registry.getRegisteredAgents();

      expect(registeredAgents).toHaveLength(1);
      expect(registeredAgents[0].agent.name).toBe('test-agent');
    });
  });

  describe('agent validation', () => {
    it('should validate valid agent definition', () => {
      const validAgent = {
        name: 'valid-agent',
        version: '1.0.0',
        description: 'A valid agent',
        category: 'testing',
      };

      const result = registry.validateAgent(validAgent);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should invalidate agent with missing required fields', () => {
      const invalidAgent = {
        name: 'invalid-agent',
        // Missing version, description, category
      };

      const result = registry.validateAgent(invalidAgent);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should invalidate agent with invalid field types', () => {
      const invalidAgent = {
        name: 'invalid-agent',
        version: '1.0.0',
        description: 'Invalid agent',
        category: 'testing',
        temperature: 'invalid', // Should be number
      };

      const result = registry.validateAgent(invalidAgent);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('statistics and utilities', () => {
    beforeEach(async () => {
      const agents = [
        {
          name: 'agent-1',
          version: '1.0.0',
          description: 'First agent',
          category: 'testing',
          tags: ['test', 'unit'],
          pactLevel: 1,
        },
        {
          name: 'agent-2',
          version: '1.0.0',
          description: 'Second agent',
          category: 'testing',
          tags: ['test', 'integration'],
          pactLevel: 2,
        },
        {
          name: 'agent-3',
          version: '1.0.0',
          description: 'Third agent',
          category: 'quality-engineering',
          tags: ['qa', 'automation'],
          pactLevel: 1,
        },
      ];

      const { glob } = require('glob');
      glob.mockResolvedValue([
        '/test/agents/agent-1/agent.yaml',
        '/test/agents/agent-2/agent.yaml',
        '/test/agents/agent-3/agent.yaml',
      ]);

      mockFs.readFile
        .mockResolvedValueOnce(yaml.stringify(agents[0]))
        .mockResolvedValueOnce(yaml.stringify(agents[1]))
        .mockResolvedValueOnce(yaml.stringify(agents[2]));

      mockFs.stat.mockResolvedValue({ mtime: new Date() } as any);
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.ensureDir.mockResolvedValue(undefined);

      await registry.scanAndLoadAgents();

      // Register some agents
      registry.registerAgent('agent-1');
      registry.registerAgent('agent-2');
    });

    it('should generate accurate statistics', () => {
      const stats = registry.getStatistics();

      expect(stats.total).toBe(3);
      expect(stats.loaded).toBe(3);
      expect(stats.registered).toBe(2);
      expect(stats.byCategory).toEqual({
        'testing': 2,
        'quality-engineering': 1,
      });
      expect(stats.byPactLevel).toEqual({
        1: 2,
        2: 1,
      });
      expect(stats.byTags).toEqual({
        'test': 2,
        'unit': 1,
        'integration': 1,
        'qa': 1,
        'automation': 1,
      });
    });

    it('should get agent names list', () => {
      const names = registry.getAgentNames();

      expect(names).toHaveLength(3);
      expect(names).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });

    it('should get categories list', () => {
      const categories = registry.getCategories();

      expect(categories).toHaveLength(2);
      expect(categories).toEqual(['quality-engineering', 'testing']);
    });

    it('should get all tags', () => {
      const tags = registry.getAllTags();

      expect(tags).toHaveLength(5);
      expect(tags).toEqual(['automation', 'integration', 'qa', 'test', 'unit']);
    });

    it('should check if agent exists', () => {
      expect(registry.hasAgent('agent-1')).toBe(true);
      expect(registry.hasAgent('non-existent')).toBe(false);
    });

    it('should remove agent from registry', () => {
      const result = registry.removeAgent('agent-1');

      expect(result).toBe(true);
      expect(registry.hasAgent('agent-1')).toBe(false);
      expect(registry.getAllAgents()).toHaveLength(2);
    });

    it('should export agents to YAML', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      await registry.exportAgents('/test/export.yaml', 'yaml');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/export.yaml',
        expect.stringContaining('name: agent-1'),
        'utf-8'
      );
    });

    it('should export agents to JSON', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      await registry.exportAgents('/test/export.json', 'json');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/export.json',
        expect.stringContaining('"name": "agent-1"'),
        'utf-8'
      );
    });

    it('should clear registry', () => {
      registry.clear();

      expect(registry.getAllAgents()).toHaveLength(0);
      expect(registry.getStatistics().total).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('Permission denied'));

      await expect(registry.initialize()).rejects.toThrow('Agent registry initialization failed');
    });

    it('should handle scan errors gracefully', async () => {
      const { glob } = require('glob');
      glob.mockRejectedValue(new Error('Scan failed'));

      await expect(registry.scanAndLoadAgents()).rejects.toThrow('Agent scanning failed');
    });

    it('should handle export errors gracefully', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(registry.exportAgents('/test/export.yaml')).rejects.toThrow('Write failed');
    });
  });
});