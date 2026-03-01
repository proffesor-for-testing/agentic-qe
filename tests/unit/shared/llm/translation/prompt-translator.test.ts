/**
 * Agentic QE v3 - Prompt Translator Unit Tests
 * ADR-043: Vendor-Independent LLM Support (Milestone 7)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DefaultPromptTranslator,
  createPromptTranslator,
  detectMessageFormat,
  getTargetFormat,
  anthropicBlocksToString,
  stringToAnthropicBlocks,
  openAIPartsToString,
  anthropicImageToOpenAI,
  openAIImageToAnthropic,
  anthropicToolUseToOpenAI,
  openAIToolCallsToAnthropic,
  translateMessage,
  type ExtendedMessage,
  type AnthropicContentBlock,
  type OpenAIContentPart,
  type OpenAIToolCall,
} from '../../../../../src/shared/llm/translation/prompt-translator';
import type { Message } from '../../../../../src/shared/llm/interfaces';

describe('Prompt Translator', () => {
  let translator: DefaultPromptTranslator;

  beforeEach(() => {
    translator = new DefaultPromptTranslator();
  });

  describe('detectMessageFormat', () => {
    it('should detect Anthropic format from content_blocks', () => {
      const messages: ExtendedMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          content_blocks: [{ type: 'text', text: 'Hello' }],
        },
      ];
      expect(detectMessageFormat(messages)).toBe('anthropic');
    });

    it('should detect OpenAI format from content_parts', () => {
      const messages: ExtendedMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          content_parts: [{ type: 'text', text: 'Hello' }],
        },
      ];
      expect(detectMessageFormat(messages)).toBe('openai');
    });

    it('should detect OpenAI format from tool_calls', () => {
      const messages: ExtendedMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'test', arguments: '{}' },
            },
          ],
        },
      ];
      expect(detectMessageFormat(messages)).toBe('openai');
    });

    it('should default to OpenAI for string-only content', () => {
      const messages: ExtendedMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      expect(detectMessageFormat(messages)).toBe('openai');
    });
  });

  describe('getTargetFormat', () => {
    it('should return anthropic for claude provider', () => {
      expect(getTargetFormat('claude')).toBe('anthropic');
    });

    it('should return anthropic for bedrock provider', () => {
      expect(getTargetFormat('bedrock')).toBe('anthropic');
    });

    it('should return openai for openai provider', () => {
      expect(getTargetFormat('openai')).toBe('openai');
    });

    it('should return openai for azure-openai provider', () => {
      expect(getTargetFormat('azure-openai')).toBe('openai');
    });

    it('should return gemini for gemini provider', () => {
      expect(getTargetFormat('gemini')).toBe('gemini');
    });

    it('should return openai for ollama provider', () => {
      expect(getTargetFormat('ollama')).toBe('openai');
    });

    it('should return openai for openrouter provider', () => {
      expect(getTargetFormat('openrouter')).toBe('openai');
    });
  });

  describe('anthropicBlocksToString', () => {
    it('should extract text from text blocks', () => {
      const blocks: AnthropicContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];
      expect(anthropicBlocksToString(blocks)).toBe('Hello\nWorld');
    });

    it('should ignore non-text blocks', () => {
      const blocks: AnthropicContentBlock[] = [
        { type: 'text', text: 'Hello' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'abc' },
        },
        { type: 'text', text: 'World' },
      ];
      expect(anthropicBlocksToString(blocks)).toBe('Hello\nWorld');
    });
  });

  describe('stringToAnthropicBlocks', () => {
    it('should convert string to text block array', () => {
      const result = stringToAnthropicBlocks('Hello World');
      expect(result).toEqual([{ type: 'text', text: 'Hello World' }]);
    });
  });

  describe('openAIPartsToString', () => {
    it('should extract text from text parts', () => {
      const parts: OpenAIContentPart[] = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];
      expect(openAIPartsToString(parts)).toBe('Hello\nWorld');
    });

    it('should ignore image parts', () => {
      const parts: OpenAIContentPart[] = [
        { type: 'text', text: 'Hello' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
        { type: 'text', text: 'World' },
      ];
      expect(openAIPartsToString(parts)).toBe('Hello\nWorld');
    });
  });

  describe('anthropicImageToOpenAI', () => {
    it('should convert base64 image to data URL', () => {
      const block = {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png',
          data: 'abc123',
        },
      };
      const result = anthropicImageToOpenAI(block);
      expect(result.type).toBe('image_url');
      expect(result.image_url.url).toBe('data:image/png;base64,abc123');
    });

    it('should pass through URL images', () => {
      const block = {
        type: 'image' as const,
        source: {
          type: 'url' as const,
          media_type: 'image/jpeg',
          url: 'https://example.com/img.jpg',
        },
      };
      const result = anthropicImageToOpenAI(block);
      expect(result.image_url.url).toBe('https://example.com/img.jpg');
    });
  });

  describe('openAIImageToAnthropic', () => {
    it('should convert data URL to base64 image', () => {
      const part = {
        type: 'image_url' as const,
        image_url: {
          url: 'data:image/png;base64,abc123',
        },
      };
      const result = openAIImageToAnthropic(part);
      expect(result.type).toBe('image');
      expect(result.source.type).toBe('base64');
      expect(result.source.media_type).toBe('image/png');
      expect(result.source.data).toBe('abc123');
    });

    it('should convert URL to URL image', () => {
      const part = {
        type: 'image_url' as const,
        image_url: {
          url: 'https://example.com/img.jpg',
        },
      };
      const result = openAIImageToAnthropic(part);
      expect(result.type).toBe('image');
      expect(result.source.type).toBe('url');
      expect(result.source.url).toBe('https://example.com/img.jpg');
    });
  });

  describe('anthropicToolUseToOpenAI', () => {
    it('should convert tool use blocks to tool calls', () => {
      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'get_weather',
          input: { location: 'NYC' },
        },
      ];
      const result = anthropicToolUseToOpenAI(blocks);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call_1');
      expect(result[0].type).toBe('function');
      expect(result[0].function.name).toBe('get_weather');
      expect(result[0].function.arguments).toBe('{"location":"NYC"}');
    });
  });

  describe('openAIToolCallsToAnthropic', () => {
    it('should convert tool calls to tool use blocks', () => {
      const toolCalls: OpenAIToolCall[] = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location":"NYC"}',
          },
        },
      ];
      const result = openAIToolCallsToAnthropic(toolCalls);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool_use');
      expect(result[0].id).toBe('call_1');
      expect(result[0].name).toBe('get_weather');
      expect(result[0].input).toEqual({ location: 'NYC' });
    });
  });

  describe('translateMessage', () => {
    it('should translate simple message to OpenAI format', () => {
      const message: ExtendedMessage = {
        role: 'user',
        content: 'Hello',
        content_blocks: [{ type: 'text', text: 'Hello' }],
      };
      const result = translateMessage(message, 'openai');
      expect(result.role).toBe('user');
      expect(result.content).toBe('Hello');
      expect(result.content_parts).toHaveLength(1);
    });

    it('should translate message with images to OpenAI format', () => {
      const message: ExtendedMessage = {
        role: 'user',
        content: 'Look at this image',
        content_blocks: [
          { type: 'text', text: 'Look at this image' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'abc' },
          },
        ],
      };
      const result = translateMessage(message, 'openai');
      expect(result.content_parts).toHaveLength(2);
      expect(result.content_parts![0].type).toBe('text');
      expect(result.content_parts![1].type).toBe('image_url');
    });

    it('should translate message with tool use to OpenAI format', () => {
      const message: ExtendedMessage = {
        role: 'assistant',
        content: '',
        content_blocks: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'test',
            input: { a: 1 },
          },
        ],
      };
      const result = translateMessage(message, 'openai');
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls![0].function.name).toBe('test');
    });

    it('should translate OpenAI content parts to Anthropic format', () => {
      const message: ExtendedMessage = {
        role: 'user',
        content: 'Hello',
        content_parts: [
          { type: 'text', text: 'Hello' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,abc' },
          },
        ],
      };
      const result = translateMessage(message, 'anthropic');
      expect(result.content_blocks).toHaveLength(2);
      expect(result.content_blocks![0].type).toBe('text');
      expect(result.content_blocks![1].type).toBe('image');
    });
  });

  describe('translateMessages', () => {
    it('should translate messages to OpenAI format', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const result = translator.translateMessages(messages, 'openai');
      expect(result.messages).toHaveLength(2);
      expect(result.systemPromptHandling).toBe('native');
    });

    it('should extract system messages for Claude', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];
      const result = translator.translateMessages(messages, 'claude');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.systemPrompt).toBe('You are helpful');
      expect(result.systemPromptHandling).toBe('native');
    });

    it('should merge multiple system messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'Be helpful' },
        { role: 'system', content: 'Be concise' },
        { role: 'user', content: 'Hello' },
      ];
      const result = translator.translateMessages(messages, 'claude');
      expect(result.systemPrompt).toBe('Be helpful\nBe concise');
    });

    it('should add warnings for consecutive same-role messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Are you there?' },
      ];
      const result = translator.translateMessages(messages, 'claude', {
        validate: true,
      });
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Consecutive'))).toBe(true);
    });

    it('should handle ONNX provider system prompt', () => {
      const messages: Message[] = [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hello' },
      ];
      const result = translator.translateMessages(messages, 'onnx');
      // ONNX uses first-message strategy
      expect(result.systemPromptHandling).toBe('first-message');
      // System prompt prepended to first message
      expect(result.messages[0].content).toContain('System Instructions');
      expect(result.messages[0].content).toContain('Hello');
    });
  });

  describe('handleSystemPrompt', () => {
    it('should return native strategy for Claude', () => {
      const result = translator.handleSystemPrompt('Be helpful', 'claude');
      expect(result.strategy).toBe('native');
      expect(result.content).toBe('Be helpful');
    });

    it('should return native strategy for OpenAI', () => {
      const result = translator.handleSystemPrompt('Be helpful', 'openai');
      expect(result.strategy).toBe('native');
    });

    it('should return first-message strategy for ONNX', () => {
      const result = translator.handleSystemPrompt('Be helpful', 'onnx');
      expect(result.strategy).toBe('first-message');
      expect(result.content).toContain('[System Instructions]');
    });
  });

  describe('getSupportedSourceFormats', () => {
    it('should return all supported source formats', () => {
      const formats = translator.getSupportedSourceFormats();
      expect(formats).toContain('anthropic');
      expect(formats).toContain('openai');
      expect(formats).toContain('gemini');
      expect(formats).toContain('ollama');
    });
  });

  describe('getSupportedTargetProviders', () => {
    it('should return all supported target providers', () => {
      const providers = translator.getSupportedTargetProviders();
      expect(providers).toContain('claude');
      expect(providers).toContain('openai');
      expect(providers).toContain('gemini');
      expect(providers).toContain('azure-openai');
      expect(providers).toContain('bedrock');
      expect(providers).toContain('onnx');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('ollama');
    });
  });

  describe('createPromptTranslator', () => {
    it('should create a new translator instance', () => {
      const instance = createPromptTranslator();
      expect(instance).toBeInstanceOf(DefaultPromptTranslator);
    });
  });
});
