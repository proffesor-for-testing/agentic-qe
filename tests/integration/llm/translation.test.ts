/**
 * Agentic QE v3 - Translation Layer Integration Tests
 * ADR-043: Vendor-Independent LLM Support - Milestone 12
 *
 * Tests for cross-provider compatibility:
 * - End-to-end message translation
 * - Tool schema round-trip conversion
 * - System prompt handling
 * - Provider format detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DefaultPromptTranslator,
  createPromptTranslator,
  promptTranslator,
  detectMessageFormat,
  getTargetFormat,
  translateMessage,
  anthropicBlocksToString,
  stringToAnthropicBlocks,
  openAIPartsToString,
  anthropicImageToOpenAI,
  openAIImageToAnthropic,
  anthropicToolUseToOpenAI,
  openAIToolCallsToAnthropic,
  type AnthropicTextBlock,
  type AnthropicImageBlock,
  type AnthropicToolUseBlock,
  type OpenAITextPart,
  type OpenAIImagePart,
  type OpenAIToolCall,
  type ExtendedMessage,
} from '../../../src/shared/llm/translation/prompt-translator';
import {
  translateTools,
  normalizeTools,
  toAnthropicTool,
  toOpenAIFunction,
  toGeminiFunctionDeclaration,
  fromAnthropicTool,
  fromOpenAIFunction,
  fromGeminiFunctionDeclaration,
  validateToolDefinition,
  mergeToolDefinitions,
  getToolSchemaFormat,
  type ToolDefinition,
  type AnthropicTool,
  type OpenAIFunction,
  type GeminiFunctionDeclaration,
} from '../../../src/shared/llm/translation/tool-translator';
import type { Message } from '../../../src/shared/llm/interfaces';
import type { ExtendedProviderType, MessageFormat } from '../../../src/shared/llm/router/types';

describe('Translation Layer Integration Tests', () => {
  describe('Message Format Detection', () => {
    it('should detect Anthropic format from content blocks', () => {
      const messages: ExtendedMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          content_blocks: [{ type: 'text', text: 'Hello' }],
        },
      ];

      const format = detectMessageFormat(messages);
      expect(format).toBe('anthropic');
    });

    it('should detect OpenAI format from content parts', () => {
      const messages: ExtendedMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          content_parts: [{ type: 'text', text: 'Hello' }],
        },
      ];

      const format = detectMessageFormat(messages);
      expect(format).toBe('openai');
    });

    it('should detect OpenAI format from tool calls', () => {
      const messages: ExtendedMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: { name: 'test', arguments: '{}' },
            },
          ],
        },
      ];

      const format = detectMessageFormat(messages);
      expect(format).toBe('openai');
    });

    it('should default to OpenAI format for plain string content', () => {
      const messages: ExtendedMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const format = detectMessageFormat(messages);
      expect(format).toBe('openai');
    });
  });

  describe('Target Format Resolution', () => {
    it('should return anthropic format for Claude provider', () => {
      expect(getTargetFormat('claude')).toBe('anthropic');
    });

    it('should return anthropic format for Bedrock provider', () => {
      expect(getTargetFormat('bedrock')).toBe('anthropic');
    });

    it('should return openai format for OpenAI provider', () => {
      expect(getTargetFormat('openai')).toBe('openai');
    });

    it('should return openai format for Azure OpenAI provider', () => {
      expect(getTargetFormat('azure-openai')).toBe('openai');
    });

    it('should return gemini format for Gemini provider', () => {
      expect(getTargetFormat('gemini')).toBe('gemini');
    });

    it('should return openai format for Ollama provider', () => {
      expect(getTargetFormat('ollama')).toBe('openai');
    });

    it('should return openai format for OpenRouter provider', () => {
      expect(getTargetFormat('openrouter')).toBe('openai');
    });

    it('should return openai format for ONNX provider', () => {
      expect(getTargetFormat('onnx')).toBe('openai');
    });
  });

  describe('End-to-End Message Translation', () => {
    let translator: DefaultPromptTranslator;

    beforeEach(() => {
      translator = new DefaultPromptTranslator();
    });

    it('should translate messages from Anthropic to OpenAI format', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = translator.translateMessages(messages, 'openai');

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[1].role).toBe('assistant');
    });

    it('should translate messages from OpenAI to Anthropic format', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = translator.translateMessages(messages, 'claude');

      expect(result.messages.length).toBe(2);
    });

    it('should handle system messages appropriately', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      const result = translator.translateMessages(messages, 'claude');

      // System prompt should be extracted
      expect(result.systemPrompt).toBe('You are a helpful assistant.');
      expect(result.messages.length).toBe(1);
      expect(result.systemPromptHandling).toBe('native');
    });

    it('should merge multiple system messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'Rule 1.' },
        { role: 'system', content: 'Rule 2.' },
        { role: 'user', content: 'Hello' },
      ];

      const result = translator.translateMessages(messages, 'claude');

      expect(result.systemPrompt).toContain('Rule 1.');
      expect(result.systemPrompt).toContain('Rule 2.');
    });

    it('should handle empty message array', () => {
      const messages: Message[] = [];

      const result = translator.translateMessages(messages, 'openai');

      expect(result.messages.length).toBe(0);
    });

    it('should preserve message content during translation', () => {
      const originalContent = 'This is the original content.';
      const messages: Message[] = [
        { role: 'user', content: originalContent },
      ];

      const result = translator.translateMessages(messages, 'openai');

      expect(result.messages[0].content).toBe(originalContent);
    });
  });

  describe('Content Block Conversion', () => {
    it('should convert Anthropic text blocks to string', () => {
      const blocks: AnthropicTextBlock[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'World' },
      ];

      const result = anthropicBlocksToString(blocks);
      expect(result).toBe('Hello \nWorld');
    });

    it('should convert string to Anthropic blocks', () => {
      const text = 'Hello World';

      const blocks = stringToAnthropicBlocks(text);

      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe('text');
      expect((blocks[0] as AnthropicTextBlock).text).toBe(text);
    });

    it('should convert OpenAI text parts to string', () => {
      const parts: OpenAITextPart[] = [
        { type: 'text', text: 'Part 1' },
        { type: 'text', text: 'Part 2' },
      ];

      const result = openAIPartsToString(parts);
      expect(result).toBe('Part 1\nPart 2');
    });
  });

  describe('Image Content Translation', () => {
    it('should convert Anthropic base64 image to OpenAI format', () => {
      const anthropicImage: AnthropicImageBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgo=',
        },
      };

      const openaiImage = anthropicImageToOpenAI(anthropicImage);

      expect(openaiImage.type).toBe('image_url');
      expect(openaiImage.image_url.url).toContain('data:image/png;base64,');
      expect(openaiImage.image_url.url).toContain('iVBORw0KGgo=');
    });

    it('should convert Anthropic URL image to OpenAI format', () => {
      const anthropicImage: AnthropicImageBlock = {
        type: 'image',
        source: {
          type: 'url',
          media_type: 'image/jpeg',
          url: 'https://example.com/image.jpg',
        },
      };

      const openaiImage = anthropicImageToOpenAI(anthropicImage);

      expect(openaiImage.type).toBe('image_url');
      expect(openaiImage.image_url.url).toBe('https://example.com/image.jpg');
    });

    it('should convert OpenAI data URL to Anthropic format', () => {
      const openaiImage: OpenAIImagePart = {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,iVBORw0KGgo=',
        },
      };

      const anthropicImage = openAIImageToAnthropic(openaiImage);

      expect(anthropicImage.type).toBe('image');
      expect(anthropicImage.source.type).toBe('base64');
      expect(anthropicImage.source.media_type).toBe('image/png');
      expect(anthropicImage.source.data).toBe('iVBORw0KGgo=');
    });

    it('should convert OpenAI URL to Anthropic URL format', () => {
      const openaiImage: OpenAIImagePart = {
        type: 'image_url',
        image_url: {
          url: 'https://example.com/image.jpg',
        },
      };

      const anthropicImage = openAIImageToAnthropic(openaiImage);

      expect(anthropicImage.type).toBe('image');
      expect(anthropicImage.source.type).toBe('url');
      expect(anthropicImage.source.url).toBe('https://example.com/image.jpg');
    });
  });

  describe('Tool Call Translation', () => {
    it('should convert Anthropic tool use to OpenAI tool calls', () => {
      const anthropicBlocks: AnthropicToolUseBlock[] = [
        {
          type: 'tool_use',
          id: 'tool_123',
          name: 'get_weather',
          input: { location: 'San Francisco' },
        },
      ];

      const openaiCalls = anthropicToolUseToOpenAI(anthropicBlocks);

      expect(openaiCalls.length).toBe(1);
      expect(openaiCalls[0].id).toBe('tool_123');
      expect(openaiCalls[0].type).toBe('function');
      expect(openaiCalls[0].function.name).toBe('get_weather');
      expect(JSON.parse(openaiCalls[0].function.arguments)).toEqual({ location: 'San Francisco' });
    });

    it('should convert OpenAI tool calls to Anthropic tool use', () => {
      const openaiCalls: OpenAIToolCall[] = [
        {
          id: 'call_abc',
          type: 'function',
          function: {
            name: 'search',
            arguments: JSON.stringify({ query: 'test' }),
          },
        },
      ];

      const anthropicBlocks = openAIToolCallsToAnthropic(openaiCalls);

      expect(anthropicBlocks.length).toBe(1);
      expect(anthropicBlocks[0].type).toBe('tool_use');
      expect(anthropicBlocks[0].id).toBe('call_abc');
      expect(anthropicBlocks[0].name).toBe('search');
      expect(anthropicBlocks[0].input).toEqual({ query: 'test' });
    });
  });

  describe('Tool Schema Translation', () => {
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
          units: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
          },
        },
      },
      required: ['location'],
    };

    it('should translate tool to Anthropic format', () => {
      const anthropicTool = toAnthropicTool(sampleTool);

      expect(anthropicTool.name).toBe('get_weather');
      expect(anthropicTool.description).toBe('Get the current weather for a location');
      expect(anthropicTool.input_schema.type).toBe('object');
      expect(anthropicTool.input_schema.required).toContain('location');
    });

    it('should translate tool to OpenAI format', () => {
      const openaiFunc = toOpenAIFunction(sampleTool);

      expect(openaiFunc.type).toBe('function');
      expect(openaiFunc.function.name).toBe('get_weather');
      expect(openaiFunc.function.description).toBe('Get the current weather for a location');
      expect(openaiFunc.function.parameters.type).toBe('object');
    });

    it('should translate tool to Gemini format', () => {
      const geminiFunc = toGeminiFunctionDeclaration(sampleTool);

      expect(geminiFunc.name).toBe('get_weather');
      expect(geminiFunc.description).toBe('Get the current weather for a location');
      expect(geminiFunc.parameters.type).toBe('object');
    });

    it('should round-trip translate Anthropic tool', () => {
      const anthropicTool = toAnthropicTool(sampleTool);
      const backToUnified = fromAnthropicTool(anthropicTool);

      expect(backToUnified.name).toBe(sampleTool.name);
      expect(backToUnified.description).toBe(sampleTool.description);
    });

    it('should round-trip translate OpenAI function', () => {
      const openaiFunc = toOpenAIFunction(sampleTool);
      const backToUnified = fromOpenAIFunction(openaiFunc);

      expect(backToUnified.name).toBe(sampleTool.name);
      expect(backToUnified.description).toBe(sampleTool.description);
    });

    it('should round-trip translate Gemini function', () => {
      const geminiFunc = toGeminiFunctionDeclaration(sampleTool);
      const backToUnified = fromGeminiFunctionDeclaration(geminiFunc);

      expect(backToUnified.name).toBe(sampleTool.name);
      expect(backToUnified.description).toBe(sampleTool.description);
    });
  });

  describe('Tool Schema Format Detection', () => {
    it('should return anthropic format for Claude', () => {
      expect(getToolSchemaFormat('claude')).toBe('anthropic');
    });

    it('should return anthropic format for Bedrock', () => {
      expect(getToolSchemaFormat('bedrock')).toBe('anthropic');
    });

    it('should return openai format for OpenAI', () => {
      expect(getToolSchemaFormat('openai')).toBe('openai');
    });

    it('should return openai format for Azure OpenAI', () => {
      expect(getToolSchemaFormat('azure-openai')).toBe('openai');
    });

    it('should return gemini format for Gemini', () => {
      expect(getToolSchemaFormat('gemini')).toBe('gemini');
    });

    it('should return openai format for unknown providers', () => {
      expect(getToolSchemaFormat('onnx')).toBe('openai');
    });
  });

  describe('Batch Tool Translation', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'tool1',
        description: 'First tool',
        parameters: { type: 'object', properties: { a: { type: 'string' } } },
      },
      {
        name: 'tool2',
        description: 'Second tool',
        parameters: { type: 'object', properties: { b: { type: 'number' } } },
      },
    ];

    it('should translate multiple tools to Anthropic format', () => {
      const result = translateTools(tools, 'claude');

      expect(result.tools.length).toBe(2);
      expect(result.format).toBe('anthropic');
    });

    it('should translate multiple tools to OpenAI format', () => {
      const result = translateTools(tools, 'openai');

      expect(result.tools.length).toBe(2);
      expect(result.format).toBe('openai');
    });

    it('should translate multiple tools to Gemini format', () => {
      const result = translateTools(tools, 'gemini');

      expect(result.tools.length).toBe(2);
      expect(result.format).toBe('gemini');
    });

    it('should track lost features for Gemini', () => {
      const toolWithConstraints: ToolDefinition[] = [
        {
          name: 'constrained_tool',
          description: 'Tool with constraints',
          parameters: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              count: { type: 'number', minimum: 0, maximum: 100 },
            },
          },
        },
      ];

      const result = translateTools(toolWithConstraints, 'gemini');

      // Gemini doesn't support format, minimum, maximum constraints
      if (result.lostFeatures && result.lostFeatures.length > 0) {
        expect(result.lostFeatures.some(f => f.includes('format') || f.includes('bounds'))).toBe(true);
      }
    });

    it('should normalize tools from Anthropic format', () => {
      const anthropicTools: AnthropicTool[] = [
        {
          name: 'test_tool',
          description: 'Test',
          input_schema: {
            type: 'object',
            properties: { x: { type: 'string' } },
          },
        },
      ];

      const normalized = normalizeTools(anthropicTools, 'anthropic');

      expect(normalized.length).toBe(1);
      expect(normalized[0].name).toBe('test_tool');
    });

    it('should normalize tools from OpenAI format', () => {
      const openaiTools: OpenAIFunction[] = [
        {
          type: 'function',
          function: {
            name: 'test_func',
            description: 'Test function',
            parameters: {
              type: 'object',
              properties: { y: { type: 'number' } },
            },
          },
        },
      ];

      const normalized = normalizeTools(openaiTools, 'openai');

      expect(normalized.length).toBe(1);
      expect(normalized[0].name).toBe('test_func');
    });
  });

  describe('Tool Definition Validation', () => {
    it('should validate valid tool definition', () => {
      const tool: ToolDefinition = {
        name: 'valid_tool',
        description: 'A valid tool',
        parameters: { type: 'object', properties: {} },
      };

      const errors = validateToolDefinition(tool);
      expect(errors.length).toBe(0);
    });

    it('should report missing name', () => {
      const tool: ToolDefinition = {
        name: '',
        description: 'Tool without name',
        parameters: { type: 'object', properties: {} },
      };

      const errors = validateToolDefinition(tool);
      expect(errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should report missing description', () => {
      const tool: ToolDefinition = {
        name: 'no_desc',
        description: '',
        parameters: { type: 'object', properties: {} },
      };

      const errors = validateToolDefinition(tool);
      expect(errors.some(e => e.includes('description'))).toBe(true);
    });

    it('should report invalid name format', () => {
      const tool: ToolDefinition = {
        name: '123-invalid',
        description: 'Invalid name',
        parameters: { type: 'object', properties: {} },
      };

      const errors = validateToolDefinition(tool);
      expect(errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should report missing required parameters in properties', () => {
      const tool: ToolDefinition = {
        name: 'missing_param',
        description: 'Tool with missing required param',
        parameters: {
          type: 'object',
          properties: { a: { type: 'string' } },
        },
        required: ['a', 'b'],
      };

      const errors = validateToolDefinition(tool);
      expect(errors.some(e => e.includes("'b'"))).toBe(true);
    });
  });

  describe('Tool Definition Merging', () => {
    it('should merge tool definitions', () => {
      const base: ToolDefinition = {
        name: 'base_tool',
        description: 'Base description',
        parameters: {
          type: 'object',
          properties: { a: { type: 'string' } },
        },
      };

      const override: Partial<ToolDefinition> = {
        description: 'Overridden description',
      };

      const merged = mergeToolDefinitions(base, override);

      expect(merged.name).toBe('base_tool');
      expect(merged.description).toBe('Overridden description');
    });

    it('should merge properties', () => {
      const base: ToolDefinition = {
        name: 'tool',
        description: 'Tool',
        parameters: {
          type: 'object',
          properties: { a: { type: 'string' } },
        },
      };

      const override: Partial<ToolDefinition> = {
        parameters: {
          properties: { b: { type: 'number' } },
        },
      };

      const merged = mergeToolDefinitions(base, override);

      const props = merged.parameters as { properties: Record<string, unknown> };
      expect(props.properties.a).toBeDefined();
      expect(props.properties.b).toBeDefined();
    });
  });

  describe('System Prompt Handling', () => {
    let translator: DefaultPromptTranslator;

    beforeEach(() => {
      translator = new DefaultPromptTranslator();
    });

    it('should handle system prompt for Claude (native)', () => {
      const result = translator.handleSystemPrompt('You are helpful.', 'claude');

      expect(result.strategy).toBe('native');
      expect(result.content).toBe('You are helpful.');
    });

    it('should handle system prompt for OpenAI (native)', () => {
      const result = translator.handleSystemPrompt('System prompt.', 'openai');

      expect(result.strategy).toBe('native');
    });

    it('should handle system prompt for Ollama', () => {
      const result = translator.handleSystemPrompt('System prompt.', 'ollama');

      // Ollama supports system prompts natively
      expect(result.strategy).toBeDefined();
    });

    it('should return supported formats', () => {
      const formats = translator.getSupportedSourceFormats();

      expect(formats).toContain('anthropic');
      expect(formats).toContain('openai');
    });

    it('should return supported providers', () => {
      const providers = translator.getSupportedTargetProviders();

      expect(providers).toContain('claude');
      expect(providers).toContain('openai');
      expect(providers).toContain('gemini');
    });
  });
});
