/**
 * Agentic QE v3 - Prompt Translator
 * ADR-043: Vendor-Independent LLM Support (Milestone 7)
 *
 * Implements cross-provider message translation with:
 * - Anthropic <-> OpenAI message format conversion
 * - Image/vision content handling across providers
 * - Tool use/tool results preservation during translation
 * - System prompt handling per provider requirements
 */

import type {
  PromptTranslator,
  TranslatedMessages,
  TranslationOptions,
  SystemPromptStrategy,
  MessageFormat,
  ExtendedProviderType,
  ToolDefinition,
  TranslatedTools,
} from '../router/types';
import type { Message, MessageRole } from '../interfaces';
import { translateTools, getToolSchemaFormat } from './tool-translator';
import { handleSystemPrompt, formatResponse } from './message-formatter';

// ============================================================================
// Content Block Types (Provider-specific formats)
// ============================================================================

/**
 * Anthropic content block types
 */
export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: string;
    data?: string;
    url?: string;
  };
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | AnthropicContentBlock[];
  is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

/**
 * OpenAI content part types
 */
export interface OpenAITextPart {
  type: 'text';
  text: string;
}

export interface OpenAIImagePart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

/**
 * OpenAI tool call types
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Extended message with provider-specific content
 */
export interface ExtendedMessage extends Message {
  /** Anthropic-style content blocks */
  content_blocks?: AnthropicContentBlock[];
  /** OpenAI-style content parts */
  content_parts?: OpenAIContentPart[];
  /** OpenAI tool calls */
  tool_calls?: OpenAIToolCall[];
  /** Tool call ID for tool result messages */
  tool_call_id?: string;
  /** Message name (for tool results) */
  name?: string;
}

// ============================================================================
// Provider Format Detection
// ============================================================================

/**
 * Detect the message format from message structure
 */
export function detectMessageFormat(messages: ExtendedMessage[]): MessageFormat {
  for (const msg of messages) {
    // Check for Anthropic format indicators
    if (msg.content_blocks?.length) {
      return 'anthropic';
    }
    // Check for OpenAI format indicators
    if (msg.content_parts?.length || msg.tool_calls?.length) {
      return 'openai';
    }
  }
  // Default to OpenAI (string content is valid for both)
  return 'openai';
}

/**
 * Get target message format for a provider
 */
export function getTargetFormat(provider: ExtendedProviderType): MessageFormat {
  switch (provider) {
    case 'claude':
    case 'bedrock':
      return 'anthropic';
    case 'openai':
    case 'azure-openai':
      return 'openai';
    case 'gemini':
      return 'gemini';
    case 'ollama':
    case 'openrouter':
    case 'onnx':
    default:
      return 'openai'; // Most compatible
  }
}

// ============================================================================
// Message Translation Functions
// ============================================================================

/**
 * Convert Anthropic content blocks to string content
 */
export function anthropicBlocksToString(blocks: AnthropicContentBlock[]): string {
  return blocks
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Convert string content to Anthropic content blocks
 */
export function stringToAnthropicBlocks(content: string): AnthropicContentBlock[] {
  return [{ type: 'text', text: content }];
}

/**
 * Convert OpenAI content parts to string
 */
export function openAIPartsToString(parts: OpenAIContentPart[]): string {
  return parts
    .filter((p): p is OpenAITextPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/**
 * Convert Anthropic image block to OpenAI format
 */
export function anthropicImageToOpenAI(block: AnthropicImageBlock): OpenAIImagePart {
  let url: string;
  if (block.source.type === 'base64' && block.source.data) {
    url = `data:${block.source.media_type};base64,${block.source.data}`;
  } else if (block.source.url) {
    url = block.source.url;
  } else {
    throw new Error('Invalid Anthropic image block: missing data or url');
  }
  return {
    type: 'image_url',
    image_url: { url, detail: 'auto' },
  };
}

/**
 * Convert OpenAI image part to Anthropic format
 */
export function openAIImageToAnthropic(part: OpenAIImagePart): AnthropicImageBlock {
  const url = part.image_url.url;
  if (url.startsWith('data:')) {
    // Parse data URL
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: match[1],
          data: match[2],
        },
      };
    }
  }
  // URL-based image
  return {
    type: 'image',
    source: {
      type: 'url',
      media_type: 'image/jpeg', // Default
      url,
    },
  };
}

/**
 * Convert Anthropic tool use to OpenAI tool calls
 */
export function anthropicToolUseToOpenAI(
  blocks: AnthropicToolUseBlock[]
): OpenAIToolCall[] {
  return blocks.map((block) => ({
    id: block.id,
    type: 'function' as const,
    function: {
      name: block.name,
      arguments: JSON.stringify(block.input),
    },
  }));
}

/**
 * Convert OpenAI tool calls to Anthropic tool use blocks
 */
export function openAIToolCallsToAnthropic(
  toolCalls: OpenAIToolCall[]
): AnthropicToolUseBlock[] {
  return toolCalls.map((call) => ({
    type: 'tool_use' as const,
    id: call.id,
    name: call.function.name,
    input: JSON.parse(call.function.arguments),
  }));
}

/**
 * Translate a single message from source to target format
 */
export function translateMessage(
  message: ExtendedMessage,
  targetFormat: MessageFormat
): ExtendedMessage {
  const result: ExtendedMessage = {
    role: message.role,
    content: message.content,
  };

  if (targetFormat === 'anthropic') {
    // Convert to Anthropic format
    if (message.content_parts?.length) {
      const blocks: AnthropicContentBlock[] = [];
      for (const part of message.content_parts) {
        if (part.type === 'text') {
          blocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url') {
          blocks.push(openAIImageToAnthropic(part));
        }
      }
      result.content_blocks = blocks;
      result.content = anthropicBlocksToString(blocks);
    }
    // Convert OpenAI tool calls to Anthropic tool use
    if (message.tool_calls?.length) {
      const toolUseBlocks = openAIToolCallsToAnthropic(message.tool_calls);
      result.content_blocks = result.content_blocks || [];
      result.content_blocks.push(...toolUseBlocks);
    }
    // Handle tool result messages
    if (message.role === 'assistant' && message.tool_call_id) {
      // In Anthropic format, tool results are content blocks
      result.content_blocks = [
        {
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: message.content,
        },
      ];
    }
  } else if (targetFormat === 'openai') {
    // Convert to OpenAI format
    if (message.content_blocks?.length) {
      const parts: OpenAIContentPart[] = [];
      const toolUseBlocks: AnthropicToolUseBlock[] = [];

      for (const block of message.content_blocks) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text });
        } else if (block.type === 'image') {
          parts.push(anthropicImageToOpenAI(block));
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      if (parts.length) {
        result.content_parts = parts;
        result.content = openAIPartsToString(parts);
      }
      if (toolUseBlocks.length) {
        result.tool_calls = anthropicToolUseToOpenAI(toolUseBlocks);
      }
    }
  }
  // Gemini format is similar to OpenAI, handle same way
  else if (targetFormat === 'gemini') {
    // Gemini uses parts similar to OpenAI
    if (message.content_blocks?.length) {
      const parts: OpenAIContentPart[] = [];
      for (const block of message.content_blocks) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text });
        } else if (block.type === 'image') {
          parts.push(anthropicImageToOpenAI(block));
        }
      }
      result.content_parts = parts;
      result.content = openAIPartsToString(parts);
    }
  }

  return result;
}

// ============================================================================
// Main Prompt Translator Implementation
// ============================================================================

/**
 * Default PromptTranslator implementation
 */
export class DefaultPromptTranslator implements PromptTranslator {
  private readonly supportedSourceFormats: MessageFormat[] = [
    'anthropic',
    'openai',
    'gemini',
    'ollama',
  ];
  private readonly supportedProviders: ExtendedProviderType[] = [
    'claude',
    'openai',
    'ollama',
    'openrouter',
    'gemini',
    'azure-openai',
    'bedrock',
    'onnx',
  ];

  /**
   * Translate messages from source to target provider format
   */
  translateMessages(
    messages: Message[],
    targetProvider: ExtendedProviderType,
    options?: TranslationOptions
  ): TranslatedMessages {
    const extendedMessages = messages as ExtendedMessage[];
    const sourceFormat = options?.sourceFormat || detectMessageFormat(extendedMessages);
    const targetFormat = getTargetFormat(targetProvider);
    const warnings: string[] = [];

    // Extract system messages
    let systemPrompt: string | undefined;
    const conversationMessages: ExtendedMessage[] = [];

    for (const msg of extendedMessages) {
      if (msg.role === 'system') {
        // Accumulate system messages
        systemPrompt = systemPrompt ? `${systemPrompt}\n${msg.content}` : msg.content;
      } else {
        conversationMessages.push(msg);
      }
    }

    // Translate each message
    const translatedMessages: Message[] = conversationMessages.map((msg) =>
      translateMessage(msg, targetFormat)
    );

    // Handle system prompt for target provider
    const { strategy, content: translatedSystem } = systemPrompt
      ? handleSystemPrompt(systemPrompt, targetProvider)
      : { strategy: 'native' as SystemPromptStrategy, content: undefined };

    // If system prompt needs to be prepended to first message
    if (strategy === 'first-message' && translatedSystem && translatedMessages.length > 0) {
      const firstMsg = translatedMessages[0];
      firstMsg.content = `${translatedSystem}\n\n${firstMsg.content}`;
      warnings.push(
        `System prompt prepended to first user message for provider ${targetProvider}`
      );
    }

    // Validate if requested
    if (options?.validate) {
      const validationWarnings = this.validateTranslation(
        translatedMessages,
        targetProvider
      );
      warnings.push(...validationWarnings);
    }

    return {
      messages: translatedMessages,
      systemPrompt: strategy === 'native' ? translatedSystem : undefined,
      systemPromptHandling: strategy,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Handle system prompt for target provider
   */
  handleSystemPrompt(
    systemPrompt: string,
    targetProvider: ExtendedProviderType
  ): { strategy: SystemPromptStrategy; content: string } {
    return handleSystemPrompt(systemPrompt, targetProvider);
  }

  /**
   * Translate tool definitions to target provider format
   */
  translateTools(
    tools: ToolDefinition[],
    targetProvider: ExtendedProviderType
  ): TranslatedTools {
    return translateTools(tools, targetProvider);
  }

  /**
   * Get supported source formats
   */
  getSupportedSourceFormats(): MessageFormat[] {
    return [...this.supportedSourceFormats];
  }

  /**
   * Get supported target providers
   */
  getSupportedTargetProviders(): ExtendedProviderType[] {
    return [...this.supportedProviders];
  }

  /**
   * Validate translated messages for target provider
   */
  private validateTranslation(
    messages: Message[],
    targetProvider: ExtendedProviderType
  ): string[] {
    const warnings: string[] = [];

    // Check for empty messages
    const emptyMsgs = messages.filter((m) => !m.content || m.content.trim() === '');
    if (emptyMsgs.length > 0) {
      warnings.push(`${emptyMsgs.length} messages have empty content`);
    }

    // Check role sequence (user/assistant alternation for some providers)
    if (targetProvider === 'claude' || targetProvider === 'bedrock') {
      let lastRole: MessageRole | null = null;
      for (const msg of messages) {
        if (lastRole === msg.role && msg.role !== 'system') {
          warnings.push(
            `Consecutive ${msg.role} messages detected - may need merging for ${targetProvider}`
          );
          break;
        }
        lastRole = msg.role;
      }
    }

    return warnings;
  }
}

/**
 * Create a default prompt translator instance
 */
export function createPromptTranslator(): PromptTranslator {
  return new DefaultPromptTranslator();
}

/**
 * Export default instance for convenience
 */
export const promptTranslator = new DefaultPromptTranslator();
