/**
 * Agentic QE v3 - Tool Translator Unit Tests
 * ADR-043: Vendor-Independent LLM Support (Milestone 7)
 */

import { describe, it, expect } from 'vitest';
import {
  translateTools,
  normalizeTools,
  getToolSchemaFormat,
  toAnthropicTool,
  toOpenAIFunction,
  toGeminiFunctionDeclaration,
  fromAnthropicTool,
  fromOpenAIFunction,
  fromGeminiFunctionDeclaration,
  validateToolDefinition,
  mergeToolDefinitions,
  type AnthropicTool,
  type OpenAIFunction,
  type GeminiFunctionDeclaration,
} from '../../../../../src/shared/llm/translation/tool-translator';
import type { ToolDefinition } from '../../../../../src/shared/llm/router/types';

describe('Tool Translator', () => {
  // Sample tool definition for testing
  const sampleTool: ToolDefinition = {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit',
        },
      },
    },
    required: ['location'],
  };

  describe('getToolSchemaFormat', () => {
    it('should return anthropic for claude provider', () => {
      expect(getToolSchemaFormat('claude')).toBe('anthropic');
    });

    it('should return anthropic for bedrock provider', () => {
      expect(getToolSchemaFormat('bedrock')).toBe('anthropic');
    });

    it('should return openai for openai provider', () => {
      expect(getToolSchemaFormat('openai')).toBe('openai');
    });

    it('should return openai for azure-openai provider', () => {
      expect(getToolSchemaFormat('azure-openai')).toBe('openai');
    });

    it('should return gemini for gemini provider', () => {
      expect(getToolSchemaFormat('gemini')).toBe('gemini');
    });

    it('should return openai for ollama provider', () => {
      expect(getToolSchemaFormat('ollama')).toBe('openai');
    });

    it('should return openai for openrouter provider', () => {
      expect(getToolSchemaFormat('openrouter')).toBe('openai');
    });
  });

  describe('toAnthropicTool', () => {
    it('should convert to Anthropic tool format', () => {
      const result = toAnthropicTool(sampleTool);
      expect(result.name).toBe('get_weather');
      expect(result.description).toBe('Get the current weather for a location');
      expect(result.input_schema.type).toBe('object');
      expect(result.input_schema.properties).toHaveProperty('location');
      expect(result.input_schema.required).toEqual(['location']);
    });

    it('should handle tool without required fields', () => {
      const toolWithoutRequired: ToolDefinition = {
        name: 'simple_tool',
        description: 'A simple tool',
        parameters: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
        },
      };
      const result = toAnthropicTool(toolWithoutRequired);
      expect(result.input_schema.required).toBeUndefined();
    });
  });

  describe('toOpenAIFunction', () => {
    it('should convert to OpenAI function format', () => {
      const result = toOpenAIFunction(sampleTool);
      expect(result.type).toBe('function');
      expect(result.function.name).toBe('get_weather');
      expect(result.function.description).toBe('Get the current weather for a location');
      expect(result.function.parameters.type).toBe('object');
      expect(result.function.parameters.properties).toHaveProperty('location');
      expect(result.function.parameters.required).toEqual(['location']);
    });
  });

  describe('toGeminiFunctionDeclaration', () => {
    it('should convert to Gemini function declaration format', () => {
      const result = toGeminiFunctionDeclaration(sampleTool);
      expect(result.name).toBe('get_weather');
      expect(result.description).toBe('Get the current weather for a location');
      expect(result.parameters.type).toBe('object');
      expect(result.parameters.properties).toHaveProperty('location');
      expect(result.parameters.required).toEqual(['location']);
    });

    it('should strip unsupported schema features for Gemini', () => {
      const toolWithAdvancedSchema: ToolDefinition = {
        name: 'advanced_tool',
        description: 'Tool with advanced schema',
        parameters: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: 'A count',
              minimum: 0,
              maximum: 100,
            },
            pattern_field: {
              type: 'string',
              pattern: '^[a-z]+$',
            },
          },
        },
      };
      const result = toGeminiFunctionDeclaration(toolWithAdvancedSchema);
      // Gemini schema doesn't have minimum/maximum/pattern
      expect(result.parameters.properties.count).not.toHaveProperty('minimum');
      expect(result.parameters.properties.count).not.toHaveProperty('maximum');
      expect(result.parameters.properties.pattern_field).not.toHaveProperty('pattern');
    });
  });

  describe('fromAnthropicTool', () => {
    it('should convert from Anthropic tool format', () => {
      const anthropicTool: AnthropicTool = {
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
      };
      const result = fromAnthropicTool(anthropicTool);
      expect(result.name).toBe('get_weather');
      expect(result.description).toBe('Get weather');
      expect(result.required).toEqual(['location']);
    });
  });

  describe('fromOpenAIFunction', () => {
    it('should convert from OpenAI function format', () => {
      const openaiFunc: OpenAIFunction = {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
          },
        },
      };
      const result = fromOpenAIFunction(openaiFunc);
      expect(result.name).toBe('get_weather');
      expect(result.description).toBe('Get weather');
      expect(result.required).toEqual(['location']);
    });
  });

  describe('fromGeminiFunctionDeclaration', () => {
    it('should convert from Gemini function declaration format', () => {
      const geminiFunc: GeminiFunctionDeclaration = {
        name: 'get_weather',
        description: 'Get weather',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
      };
      const result = fromGeminiFunctionDeclaration(geminiFunc);
      expect(result.name).toBe('get_weather');
      expect(result.description).toBe('Get weather');
      expect(result.required).toEqual(['location']);
    });
  });

  describe('translateTools', () => {
    it('should translate tools to Anthropic format', () => {
      const result = translateTools([sampleTool], 'claude');
      expect(result.format).toBe('anthropic');
      expect(result.tools).toHaveLength(1);
      const tool = result.tools[0] as AnthropicTool;
      expect(tool.input_schema).toBeDefined();
    });

    it('should translate tools to OpenAI format', () => {
      const result = translateTools([sampleTool], 'openai');
      expect(result.format).toBe('openai');
      expect(result.tools).toHaveLength(1);
      const tool = result.tools[0] as OpenAIFunction;
      expect(tool.type).toBe('function');
      expect(tool.function).toBeDefined();
    });

    it('should translate tools to Gemini format with lost features warning', () => {
      const toolWithConstraints: ToolDefinition = {
        name: 'constrained_tool',
        description: 'Tool with constraints',
        parameters: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
            name: {
              type: 'string',
              pattern: '^[a-z]+$',
              format: 'email',
              minLength: 1,
              maxLength: 50,
            },
          },
        },
      };
      const result = translateTools([toolWithConstraints], 'gemini');
      expect(result.format).toBe('gemini');
      expect(result.lostFeatures).toBeDefined();
      expect(result.lostFeatures!.length).toBeGreaterThan(0);
    });

    it('should handle multiple tools', () => {
      const tools: ToolDefinition[] = [
        sampleTool,
        {
          name: 'search',
          description: 'Search the web',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
          required: ['query'],
        },
      ];
      const result = translateTools(tools, 'openai');
      expect(result.tools).toHaveLength(2);
    });
  });

  describe('normalizeTools', () => {
    it('should normalize Anthropic tools to unified format', () => {
      const anthropicTools: AnthropicTool[] = [
        {
          name: 'test',
          description: 'Test tool',
          input_schema: {
            type: 'object',
            properties: { a: { type: 'string' } },
          },
        },
      ];
      const result = normalizeTools(anthropicTools, 'anthropic');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test');
    });

    it('should normalize OpenAI functions to unified format', () => {
      const openaiTools: OpenAIFunction[] = [
        {
          type: 'function',
          function: {
            name: 'test',
            description: 'Test tool',
            parameters: {
              type: 'object',
              properties: { a: { type: 'string' } },
            },
          },
        },
      ];
      const result = normalizeTools(openaiTools, 'openai');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test');
    });

    it('should normalize Gemini functions to unified format', () => {
      const geminiTools: GeminiFunctionDeclaration[] = [
        {
          name: 'test',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: { a: { type: 'string' } },
          },
        },
      ];
      const result = normalizeTools(geminiTools, 'gemini');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test');
    });
  });

  describe('validateToolDefinition', () => {
    it('should return no errors for valid tool', () => {
      const errors = validateToolDefinition(sampleTool);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing name', () => {
      const invalidTool = { ...sampleTool, name: '' };
      const errors = validateToolDefinition(invalidTool);
      expect(errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('should return error for missing description', () => {
      const invalidTool = { ...sampleTool, description: '' };
      const errors = validateToolDefinition(invalidTool);
      expect(errors.some((e) => e.includes('description'))).toBe(true);
    });

    it('should return error for invalid name format', () => {
      const invalidTool = { ...sampleTool, name: '123-invalid' };
      const errors = validateToolDefinition(invalidTool);
      expect(errors.some((e) => e.includes('name must start'))).toBe(true);
    });

    it('should return error for required param not in properties', () => {
      const invalidTool: ToolDefinition = {
        name: 'test',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: { a: { type: 'string' } },
        },
        required: ['b'], // 'b' doesn't exist
      };
      const errors = validateToolDefinition(invalidTool);
      expect(errors.some((e) => e.includes("'b' not found"))).toBe(true);
    });
  });

  describe('mergeToolDefinitions', () => {
    it('should merge tool definitions', () => {
      const base: ToolDefinition = {
        name: 'base_tool',
        description: 'Base description',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'string' },
          },
        },
        required: ['a'],
      };
      const override: Partial<ToolDefinition> = {
        description: 'Updated description',
        parameters: {
          properties: {
            b: { type: 'number' },
          },
        },
      };
      const result = mergeToolDefinitions(base, override);
      expect(result.name).toBe('base_tool');
      expect(result.description).toBe('Updated description');
      expect(result.parameters.properties).toHaveProperty('a');
      expect(result.parameters.properties).toHaveProperty('b');
      expect(result.required).toEqual(['a']);
    });

    it('should allow overriding required fields', () => {
      const base: ToolDefinition = {
        name: 'tool',
        description: 'Tool',
        parameters: { type: 'object', properties: {} },
        required: ['a'],
      };
      const override: Partial<ToolDefinition> = {
        required: ['b'],
      };
      const result = mergeToolDefinitions(base, override);
      expect(result.required).toEqual(['b']);
    });
  });

  describe('round-trip translation', () => {
    it('should preserve tool structure through Anthropic round-trip', () => {
      const translated = translateTools([sampleTool], 'claude');
      const normalized = normalizeTools(translated.tools, 'anthropic');
      expect(normalized[0].name).toBe(sampleTool.name);
      expect(normalized[0].description).toBe(sampleTool.description);
      expect(normalized[0].required).toEqual(sampleTool.required);
    });

    it('should preserve tool structure through OpenAI round-trip', () => {
      const translated = translateTools([sampleTool], 'openai');
      const normalized = normalizeTools(translated.tools, 'openai');
      expect(normalized[0].name).toBe(sampleTool.name);
      expect(normalized[0].description).toBe(sampleTool.description);
      expect(normalized[0].required).toEqual(sampleTool.required);
    });
  });
});
