/**
 * Agentic QE v3 - MCP Tool Base Tests
 * Tests for the base MCP tool infrastructure per ADR-010
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../../../../src/mcp/tools/base';
import { ToolResult } from '../../../../src/mcp/types';

// ============================================================================
// Test Implementation
// ============================================================================

interface TestParams {
  input: string;
  count?: number;
  [key: string]: unknown;
}

interface TestResult {
  output: string;
  processed: number;
}

class TestTool extends MCPToolBase<TestParams, TestResult> {
  readonly config: MCPToolConfig = {
    name: 'test/tool',
    description: 'A test tool',
    domain: 'test-generation',
    schema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Input text',
        },
        count: {
          type: 'number',
          description: 'Count',
          default: 1,
        },
      },
      required: ['input'],
    },
    streaming: true,
    timeout: 5000,
  };

  async execute(
    params: TestParams,
    context: MCPToolContext
  ): Promise<ToolResult<TestResult>> {
    this.emitStream(context, { status: 'processing', message: 'Starting' });

    if (this.isAborted(context)) {
      return { success: false, error: 'Aborted' };
    }

    return {
      success: true,
      data: {
        output: params.input.toUpperCase(),
        processed: params.count || 1,
      },
    };
  }
}

class FailingTool extends MCPToolBase<TestParams, TestResult> {
  readonly config: MCPToolConfig = {
    name: 'test/failing',
    description: 'A failing test tool',
    domain: 'test-generation',
    schema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input' },
      },
      required: ['input'],
    },
    streaming: false,
    timeout: 5000,
  };

  async execute(): Promise<ToolResult<TestResult>> {
    throw new Error('Intentional failure');
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('MCPToolBase', () => {
  let tool: TestTool;
  let failingTool: FailingTool;

  beforeEach(() => {
    tool = new TestTool();
    failingTool = new FailingTool();
  });

  describe('properties', () => {
    it('should expose tool name', () => {
      expect(tool.name).toBe('test/tool');
    });

    it('should expose tool description', () => {
      expect(tool.description).toBe('A test tool');
    });

    it('should expose tool domain', () => {
      expect(tool.domain).toBe('test-generation');
    });

    it('should expose timeout', () => {
      expect(tool.timeout).toBe(5000);
    });

    it('should indicate streaming support', () => {
      expect(tool.supportsStreaming).toBe(true);
      expect(failingTool.supportsStreaming).toBe(false);
    });
  });

  describe('getSchema', () => {
    it('should return the tool schema', () => {
      const schema = tool.getSchema();
      expect(schema.type).toBe('object');
      expect(schema.properties.input).toBeDefined();
      expect(schema.properties.count).toBeDefined();
      expect(schema.required).toContain('input');
    });

    it('should include property descriptions', () => {
      const schema = tool.getSchema();
      expect(schema.properties.input.description).toBe('Input text');
    });

    it('should include default values', () => {
      const schema = tool.getSchema();
      expect(schema.properties.count.default).toBe(1);
    });
  });

  describe('validate', () => {
    it('should validate correct params', () => {
      const result = tool.validate({ input: 'test' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when required param is missing', () => {
      const result = tool.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: input');
    });

    it('should validate param types', () => {
      const result = tool.validate({ input: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('input');
      expect(result.errors[0]).toContain('string');
    });

    it('should accept optional params', () => {
      const result = tool.validate({ input: 'test', count: 5 });
      expect(result.valid).toBe(true);
    });

    it('should validate optional param types', () => {
      const result = tool.validate({ input: 'test', count: 'not a number' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('count');
    });
  });

  describe('invoke', () => {
    it('should execute tool and return result', async () => {
      const result = await tool.invoke({ input: 'hello' });
      expect(result.success).toBe(true);
      expect(result.data?.output).toBe('HELLO');
      expect(result.data?.processed).toBe(1);
    });

    it('should pass count parameter', async () => {
      const result = await tool.invoke({ input: 'test', count: 5 });
      expect(result.success).toBe(true);
      expect(result.data?.processed).toBe(5);
    });

    it('should include metadata', async () => {
      const result = await tool.invoke({ input: 'test' });
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.requestId).toBeDefined();
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.toolName).toBe('test/tool');
    });

    it('should fail validation for invalid params', async () => {
      const result = await tool.invoke({} as TestParams);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should catch errors and return failure', async () => {
      const result = await failingTool.invoke({ input: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Intentional failure');
    });
  });

  describe('streaming', () => {
    it('should call onStream callback', async () => {
      const streamData: unknown[] = [];

      await tool.invoke({ input: 'test' }, {
        streaming: true,
        onStream: (data) => streamData.push(data),
      });

      expect(streamData.length).toBeGreaterThan(0);
      expect(streamData[0]).toMatchObject({
        status: 'processing',
        message: 'Starting',
      });
    });

    it('should not fail if onStream is not provided', async () => {
      const result = await tool.invoke({ input: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('abort signal', () => {
    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await tool.invoke({ input: 'test' }, {
        abortSignal: controller.signal,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Aborted');
    });
  });

  describe('metadata', () => {
    it('should include metadata in result', async () => {
      const result = await tool.invoke({ input: 'test' });
      expect(result.success).toBe(true);
      expect(result.metadata?.requestId).toBeDefined();
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.domain).toBe('test-generation');
    });
  });
});

describe('MCPToolSchema', () => {
  it('should support string properties', () => {
    const schema: MCPToolSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name' },
      },
      required: ['name'],
    };
    expect(schema.properties.name.type).toBe('string');
  });

  it('should support number properties', () => {
    const schema: MCPToolSchema = {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Count', minimum: 0, maximum: 100 },
      },
    };
    expect(schema.properties.count.minimum).toBe(0);
    expect(schema.properties.count.maximum).toBe(100);
  });

  it('should support boolean properties', () => {
    const schema: MCPToolSchema = {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Enabled', default: false },
      },
    };
    expect(schema.properties.enabled.default).toBe(false);
  });

  it('should support array properties', () => {
    const schema: MCPToolSchema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Items',
          items: { type: 'string', description: 'Item' },
        },
      },
    };
    expect(schema.properties.items.type).toBe('array');
    expect(schema.properties.items.items?.type).toBe('string');
  });

  it('should support enum properties', () => {
    const schema: MCPToolSchema = {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          description: 'Level',
          enum: ['low', 'medium', 'high'],
        },
      },
    };
    expect(schema.properties.level.enum).toContain('medium');
  });

  it('should support object properties', () => {
    const schema: MCPToolSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Configuration',
          properties: {
            timeout: { type: 'number', description: 'Timeout' },
          },
        },
      },
    };
    expect(schema.properties.config.type).toBe('object');
  });
});
