/**
 * Agentic QE v3 - MCP Server Tests
 * Tests for the Model Context Protocol server
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPServer, createMCPServer } from '../../../src/mcp/server';
import { ToolRegistry, createToolRegistry } from '../../../src/mcp/tool-registry';
import { ALL_DOMAINS } from '../../../src/shared/types';

describe('MCP Server', () => {
  let server: MCPServer;

  beforeEach(async () => {
    server = createMCPServer();
    await server.initialize();
  });

  afterEach(async () => {
    await server.dispose();
  });

  describe('initialization', () => {
    it('should initialize server successfully', () => {
      const tools = server.getTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should register core tools', () => {
      const tools = server.getTools();
      const coreTools = tools.filter((t) => t.category === 'core');
      expect(coreTools.length).toBeGreaterThanOrEqual(3); // init, status, health
    });

    it('should register task tools', () => {
      const tools = server.getTools();
      const taskTools = tools.filter((t) => t.category === 'task');
      expect(taskTools.length).toBeGreaterThanOrEqual(4); // submit, list, status, cancel
    });

    it('should register agent tools', () => {
      const tools = server.getTools();
      const agentTools = tools.filter((t) => t.category === 'agent');
      expect(agentTools.length).toBeGreaterThanOrEqual(3); // list, spawn, metrics
    });

    it('should register domain tools', () => {
      const tools = server.getTools();
      const domainTools = tools.filter((t) => t.category === 'domain');
      expect(domainTools.length).toBeGreaterThanOrEqual(10); // Various domain tools
    });

    it('should register memory tools', () => {
      const tools = server.getTools();
      const memoryTools = tools.filter((t) => t.category === 'memory');
      expect(memoryTools.length).toBeGreaterThanOrEqual(5); // store, retrieve, query, delete, usage
    });
  });

  describe('tool definitions', () => {
    it('should have valid tool names', () => {
      const tools = server.getTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.name.startsWith('mcp__agentic_qe__')).toBe(true);
      }
    });

    it('should have descriptions for all tools', () => {
      const tools = server.getTools();
      for (const tool of tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it('should have parameters defined for all tools', () => {
      const tools = server.getTools();
      for (const tool of tools) {
        expect(Array.isArray(tool.parameters)).toBe(true);
      }
    });
  });

  describe('tool invocation', () => {
    it('should fail when fleet not initialized', async () => {
      await expect(
        server.invoke('mcp__agentic_qe__fleet_status', {})
      ).rejects.toThrow();
    });

    it('should initialize fleet successfully', async () => {
      const result = await server.invoke('mcp__agentic_qe__fleet_init', {
        topology: 'hierarchical',
        maxAgents: 5,
      });

      expect(result).toBeDefined();
      expect((result as any).fleetId).toBeDefined();
      expect((result as any).status).toBe('initialized');
    }, 30000);

    it('should get fleet status after init', async () => {
      // First init
      await server.invoke('mcp__agentic_qe__fleet_init', {
        topology: 'hierarchical',
        maxAgents: 5,
      });

      // Then get status
      const result = await server.invoke('mcp__agentic_qe__fleet_status', {
        verbose: true,
        includeMetrics: true,
      });

      expect(result).toBeDefined();
      expect((result as any).status).toBeDefined();
      expect((result as any).uptime).toBeGreaterThanOrEqual(0);
    });

    it('should get fleet health after init', async () => {
      // First init
      await server.invoke('mcp__agentic_qe__fleet_init', {});

      // Then get health
      const result = await server.invoke('mcp__agentic_qe__fleet_health', {
        detailed: true,
      });

      expect(result).toBeDefined();
      expect((result as any).status).toBeDefined();
    });
  });

  describe('task operations', () => {
    beforeEach(async () => {
      await server.invoke('mcp__agentic_qe__fleet_init', {
        maxAgents: 5,
      });
    });

    it('should submit a task', async () => {
      const result = await server.invoke('mcp__agentic_qe__task_submit', {
        type: 'generate-tests',
        priority: 'p1',
      });

      expect(result).toBeDefined();
      expect((result as any).taskId).toBeDefined();
    });

    it('should list tasks', async () => {
      // Submit a task first
      await server.invoke('mcp__agentic_qe__task_submit', {
        type: 'generate-tests',
        priority: 'p1',
      });

      // Then list
      const result = await server.invoke('mcp__agentic_qe__task_list', {
        limit: 10,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should get task status', async () => {
      // Submit a task first
      const submitResult = await server.invoke('mcp__agentic_qe__task_submit', {
        type: 'generate-tests',
        priority: 'p1',
      });

      // Then get status
      const result = await server.invoke('mcp__agentic_qe__task_status', {
        taskId: (submitResult as any).taskId,
      });

      expect(result).toBeDefined();
      expect((result as any).taskId).toBe((submitResult as any).taskId);
    });

    it('should orchestrate tasks', async () => {
      const result = await server.invoke('mcp__agentic_qe__task_orchestrate', {
        task: 'Generate unit tests for the UserService class',
        strategy: 'adaptive',
        priority: 'high',
      });

      expect(result).toBeDefined();
      expect((result as any).taskId).toBeDefined();
    });
  });

  describe('agent operations', () => {
    beforeEach(async () => {
      await server.invoke('mcp__agentic_qe__fleet_init', {
        maxAgents: 5,
      });
    });

    it('should list agents', async () => {
      const result = await server.invoke('mcp__agentic_qe__agent_list', {
        limit: 10,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should spawn an agent', async () => {
      const result = await server.invoke('mcp__agentic_qe__agent_spawn', {
        domain: 'test-generation',
        type: 'worker',
        capabilities: ['unit-test', 'integration-test'],
      });

      expect(result).toBeDefined();
      expect((result as any).agentId).toBeDefined();
      expect((result as any).domain).toBe('test-generation');
    });

    it('should get agent metrics', async () => {
      const result = await server.invoke('mcp__agentic_qe__agent_metrics', {
        metric: 'all',
      });

      expect(result).toBeDefined();
      expect((result as any).totalAgents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('memory operations', () => {
    beforeEach(async () => {
      await server.invoke('mcp__agentic_qe__fleet_init', {});
    });

    it('should store data in memory', async () => {
      const result = await server.invoke('mcp__agentic_qe__memory_store', {
        key: 'test-key',
        value: { message: 'hello world' },
        namespace: 'test',
      });

      expect(result).toBeDefined();
      expect((result as any).stored).toBe(true);
    });

    it('should retrieve data from memory', async () => {
      // Store first
      await server.invoke('mcp__agentic_qe__memory_store', {
        key: 'test-key-2',
        value: { data: 123 },
        namespace: 'test',
      });

      // Then retrieve
      const result = await server.invoke('mcp__agentic_qe__memory_retrieve', {
        key: 'test-key-2',
        namespace: 'test',
      });

      expect(result).toBeDefined();
      expect((result as any).found).toBe(true);
      expect((result as any).value).toEqual({ data: 123 });
    });

    it('should delete from memory', async () => {
      // Store first
      await server.invoke('mcp__agentic_qe__memory_store', {
        key: 'to-delete',
        value: { temp: true },
        namespace: 'test',
      });

      // Then delete
      const result = await server.invoke('mcp__agentic_qe__memory_delete', {
        key: 'to-delete',
        namespace: 'test',
      });

      expect(result).toBeDefined();
      expect((result as any).deleted).toBe(true);
    });
  });

  describe('domain tools', () => {
    beforeEach(async () => {
      await server.invoke('mcp__agentic_qe__fleet_init', {});
    });

    it('should submit test generation task', async () => {
      const result = await server.invoke('mcp__agentic_qe__test_generate_enhanced', {
        // Provide inline source code to avoid file system operations
        sourceCode: 'export function add(a: number, b: number): number { return a + b; }',
        language: 'typescript',
        testType: 'unit',
        coverageGoal: 80,
      });

      expect(result).toBeDefined();
      expect((result as any).taskId).toBeDefined();
    }, 15000); // Extended timeout for task execution

    it('should submit coverage analysis task', async () => {
      // Use a non-existent path to trigger fast fallback path (no file system walking)
      const result = await server.invoke('mcp__agentic_qe__coverage_analyze_sublinear', {
        target: '/tmp/nonexistent-coverage-test-path',
        includeRisk: true,
        detectGaps: true,
      });

      expect(result).toBeDefined();
      expect((result as any).taskId).toBeDefined();
    }, 15000); // Extended timeout for task execution

    it('should submit security scan task', async () => {
      // Use a non-existent path to trigger fast fallback path (no file system walking)
      const result = await server.invoke('mcp__agentic_qe__security_scan_comprehensive', {
        target: '/tmp/nonexistent-security-test-path',
        sast: true,
        compliance: ['owasp'],
      });

      expect(result).toBeDefined();
      expect((result as any).taskId).toBeDefined();
    }, 15000); // Extended timeout for task execution

    it('should submit quality assessment task', async () => {
      // Use a non-existent path to trigger fast fallback path (no file system walking)
      const result = await server.invoke('mcp__agentic_qe__quality_assess', {
        target: '/tmp/nonexistent-quality-test-path',
        runGate: true,
        threshold: 80,
      });

      expect(result).toBeDefined();
      expect((result as any).taskId).toBeDefined();
    }, 15000); // Extended timeout for task execution
  });

  describe('statistics', () => {
    it('should track tool statistics', async () => {
      await server.invoke('mcp__agentic_qe__fleet_init', {});

      const stats = server.getStats();
      expect(stats.totalTools).toBeGreaterThan(0);
      expect(stats.invocations).toBeGreaterThan(0);
    });
  });
});

describe('Tool Registry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  describe('registration', () => {
    it('should register a tool', () => {
      registry.register(
        {
          name: 'test_tool',
          description: 'A test tool',
          category: 'core',
          parameters: [],
        },
        async () => ({ success: true, data: 'test' })
      );

      expect(registry.has('test_tool')).toBe(true);
    });

    it('should get tool definitions', () => {
      registry.register(
        {
          name: 'tool1',
          description: 'Tool 1',
          category: 'core',
          parameters: [],
        },
        async () => ({ success: true })
      );

      registry.register(
        {
          name: 'tool2',
          description: 'Tool 2',
          category: 'domain',
          domain: 'test-generation',
          lazyLoad: true,
          parameters: [],
        },
        async () => ({ success: true })
      );

      const definitions = registry.getDefinitions();
      expect(definitions.length).toBe(2);
    });

    it('should get tools by category', () => {
      registry.register(
        {
          name: 'core_tool',
          description: 'Core tool',
          category: 'core',
          parameters: [],
        },
        async () => ({ success: true })
      );

      registry.register(
        {
          name: 'domain_tool',
          description: 'Domain tool',
          category: 'domain',
          parameters: [],
        },
        async () => ({ success: true })
      );

      const coreTools = registry.getByCategory('core');
      expect(coreTools.length).toBe(1);
      expect(coreTools[0].name).toBe('core_tool');
    });

    it('should get tools by domain', () => {
      registry.register(
        {
          name: 'test_gen_tool',
          description: 'Test generation tool',
          category: 'domain',
          domain: 'test-generation',
          parameters: [],
        },
        async () => ({ success: true })
      );

      const tools = registry.getByDomain('test-generation');
      expect(tools.length).toBe(1);
    });
  });

  describe('invocation', () => {
    it('should invoke a registered tool', async () => {
      registry.register(
        {
          name: 'echo_tool',
          description: 'Echo tool',
          category: 'core',
          parameters: [
            { name: 'message', type: 'string', description: 'Message to echo' },
          ],
        },
        async (params) => ({ success: true, data: params })
      );

      const result = await registry.invoke('echo_tool', { message: 'hello' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'hello' });
    });

    it('should return error for unknown tool', async () => {
      const result = await registry.invoke('unknown_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });

    it('should add metadata to results', async () => {
      registry.register(
        {
          name: 'meta_tool',
          description: 'Meta tool',
          category: 'core',
          parameters: [],
        },
        async () => ({ success: true, data: 'test' })
      );

      const result = await registry.invoke('meta_tool', {});
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.requestId).toBeDefined();
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('lazy loading', () => {
    it('should detect domains from message', () => {
      const domains = registry.detectDomainsFromMessage(
        'Generate unit tests for the UserService class'
      );
      expect(domains).toContain('test-generation');
    });

    it('should detect security domain from keywords', () => {
      const domains = registry.detectDomainsFromMessage(
        'Check for SQL injection vulnerabilities'
      );
      expect(domains).toContain('security-compliance');
    });

    it('should detect coverage domain from keywords', () => {
      const domains = registry.detectDomainsFromMessage(
        'Analyze code coverage and find gaps'
      );
      expect(domains).toContain('coverage-analysis');
    });

    it('should detect multiple domains', () => {
      const domains = registry.detectDomainsFromMessage(
        'Run security scan and generate test cases for accessibility'
      );
      expect(domains.length).toBeGreaterThan(1);
    });
  });

  describe('statistics', () => {
    it('should track tool statistics', () => {
      registry.register(
        {
          name: 'stat_tool',
          description: 'Stats tool',
          category: 'core',
          parameters: [],
        },
        async () => ({ success: true })
      );

      const stats = registry.getStats();
      expect(stats.totalTools).toBe(1);
      expect(stats.byCategory.core).toBe(1);
    });

    it('should track invocations', async () => {
      registry.register(
        {
          name: 'counter_tool',
          description: 'Counter tool',
          category: 'core',
          parameters: [],
        },
        async () => ({ success: true })
      );

      await registry.invoke('counter_tool', {});
      await registry.invoke('counter_tool', {});

      const stats = registry.getStats();
      expect(stats.invocations).toBe(2);
    });
  });
});
