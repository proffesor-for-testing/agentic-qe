/**
 * Agentic QE v3 - MCP Tool Registry Tests
 * Tests for the tool registry used by MCPProtocolServer
 *
 * Note: Legacy MCPServer tests removed — server.ts was dead code
 * (never used in production; entry.ts imports MCPProtocolServer).
 * Protocol server integration tests live in tests/integration/.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, createToolRegistry } from '../../../src/mcp/tool-registry';

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
