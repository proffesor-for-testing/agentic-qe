/**
 * Agentic QE v3 - Tool Registry Security Tests (SEC-001)
 * Tests for input validation and sanitization in the tool registry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, createToolRegistry } from '../../../src/mcp/tool-registry';
import { ToolDefinition, ToolHandler, ToolResult } from '../../../src/mcp/types';

describe('Tool Registry Security (SEC-001)', () => {
  let registry: ToolRegistry;

  // Helper to create a test tool
  const createTestTool = (name: string, params: ToolDefinition['parameters'] = []): {
    definition: ToolDefinition;
    handler: ToolHandler;
  } => ({
    definition: {
      name,
      description: 'Test tool',
      parameters: params,
      category: 'core',
    },
    handler: async (p) => ({ success: true, data: p }),
  });

  beforeEach(() => {
    registry = createToolRegistry();
  });

  describe('Tool Name Validation', () => {
    it('should reject empty tool names', async () => {
      const result = await registry.invoke('', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool name cannot be empty');
    });

    it('should reject tool names with invalid characters', async () => {
      const invalidNames = [
        '../traversal',
        'tool;injection',
        'tool$(command)',
        'tool`backtick`',
        'tool|pipe',
        'tool&ampersand',
        'tool<angle>',
        'tool"quote"',
        "tool'apostrophe'",
      ];

      for (const name of invalidNames) {
        const result = await registry.invoke(name, {});
        expect(result.success).toBe(false);
        expect(result.error).toContain('invalid characters');
      }
    });

    it('should reject tool names exceeding max length', async () => {
      const longName = 'a'.repeat(129);
      const result = await registry.invoke(longName, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should accept valid tool names', async () => {
      const validNames = [
        'fleet_init',
        'agent-spawn',
        'mcp:test_generate',
        'qe-test-run',
        'Tool123',
        'a',
      ];

      for (const name of validNames) {
        const tool = createTestTool(name);
        registry.register(tool.definition, tool.handler);
        const result = await registry.invoke(name, {});
        expect(result.success).toBe(true);
      }
    });

    it('should reject names starting with numbers', async () => {
      const result = await registry.invoke('123tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid characters');
    });
  });

  describe('Parameter Validation', () => {
    it('should reject unknown parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'known', type: 'string', description: 'Known param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', {
        known: 'value',
        unknown: 'injection',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown parameter: 'unknown'");
    });

    it('should validate required parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'required_param', type: 'string', description: 'Required', required: true },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Required parameter 'required_param' is missing");
    });

    it('should validate string type parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'str_param', type: 'string', description: 'String param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', { str_param: 123 });
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be a string");
    });

    it('should validate number type parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'num_param', type: 'number', description: 'Number param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', { num_param: 'not-a-number' });
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be a number");
    });

    it('should validate boolean type parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'bool_param', type: 'boolean', description: 'Boolean param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', { bool_param: 'true' });
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be a boolean");
    });

    it('should validate array type parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'arr_param', type: 'array', description: 'Array param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', { arr_param: 'not-an-array' });
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be an array");
    });

    it('should validate object type parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'obj_param', type: 'object', description: 'Object param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', { obj_param: ['array', 'not', 'object'] });
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be an object");
    });

    it('should validate enum parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'enum_param', type: 'string', description: 'Enum param', enum: ['a', 'b', 'c'] },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', { enum_param: 'invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be one of: a, b, c");
    });

    it('should accept valid enum values', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'enum_param', type: 'string', description: 'Enum param', enum: ['a', 'b', 'c'] },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', { enum_param: 'b' });
      expect(result.success).toBe(true);
    });

    it('should reject oversized string parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'str_param', type: 'string', description: 'String param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const oversizedString = 'x'.repeat(1_000_001); // > 1MB
      const result = await registry.invoke('test_tool', { str_param: oversizedString });
      expect(result.success).toBe(false);
      expect(result.error).toContain("exceeds maximum length");
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize HTML tags in string parameters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'input', type: 'string', description: 'Input param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', {
        input: '<script>alert("xss")</script>',
      });
      expect(result.success).toBe(true);
      // The handler receives sanitized input
      expect((result.data as any).input).not.toContain('<script>');
    });

    it('should sanitize strings in arrays', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'items', type: 'array', description: 'Array param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', {
        items: ['safe', '<script>bad</script>', 'also safe'],
      });
      expect(result.success).toBe(true);
      const items = (result.data as any).items;
      expect(items[1]).not.toContain('<script>');
    });

    it('should sanitize strings in nested objects', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'config', type: 'object', description: 'Object param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', {
        config: {
          nested: {
            value: '<img src=x onerror=alert(1)>',
          },
        },
      });
      expect(result.success).toBe(true);
      const config = (result.data as any).config;
      expect(config.nested.value).not.toContain('onerror');
    });

    it('should strip shell metacharacters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'input', type: 'string', description: 'Input param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', {
        input: 'safe; rm -rf / | cat /etc/passwd',
      });
      expect(result.success).toBe(true);
      // Shell metacharacters are stripped
      const sanitizedInput = (result.data as any).input;
      expect(sanitizedInput).not.toContain(';');
      expect(sanitizedInput).not.toContain('|');
    });

    it('should strip null bytes and control characters', async () => {
      const tool = createTestTool('test_tool', [
        { name: 'input', type: 'string', description: 'Input param' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('test_tool', {
        input: 'value\x00injected\x1Bescape',
      });
      expect(result.success).toBe(true);
      const sanitizedInput = (result.data as any).input;
      // Null bytes and escape characters are stripped
      expect(sanitizedInput).not.toContain('\x00');
      expect(sanitizedInput).not.toContain('\x1B');
      expect(sanitizedInput).toBe('valueinjectedescape');
    });
  });

  describe('Valid Invocations', () => {
    it('should allow valid tool invocation with all parameter types', async () => {
      const tool = createTestTool('complex_tool', [
        { name: 'str', type: 'string', description: 'String' },
        { name: 'num', type: 'number', description: 'Number' },
        { name: 'bool', type: 'boolean', description: 'Boolean' },
        { name: 'arr', type: 'array', description: 'Array' },
        { name: 'obj', type: 'object', description: 'Object' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('complex_tool', {
        str: 'hello',
        num: 42,
        bool: true,
        arr: [1, 2, 3],
        obj: { key: 'value' },
      });
      expect(result.success).toBe(true);
    });

    it('should allow optional parameters to be omitted', async () => {
      const tool = createTestTool('optional_tool', [
        { name: 'required', type: 'string', description: 'Required', required: true },
        { name: 'optional', type: 'string', description: 'Optional' },
      ]);
      registry.register(tool.definition, tool.handler);

      const result = await registry.invoke('optional_tool', { required: 'value' });
      expect(result.success).toBe(true);
    });
  });
});
