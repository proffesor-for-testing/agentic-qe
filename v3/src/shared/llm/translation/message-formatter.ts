/**
 * Agentic QE v3 - Message Formatter
 * ADR-043: Vendor-Independent LLM Support (Milestone 7)
 *
 * Handles provider-specific message formatting:
 * - System prompt handling per provider requirements
 * - Response normalization across formats
 * - Message role mapping
 */

import type {
  SystemPromptStrategy,
  ExtendedProviderType,
} from '../router/types';
import type { Message, TokenUsage, CostInfo, LLMResponse, LLMProviderType } from '../interfaces';

// ============================================================================
// System Prompt Handling
// ============================================================================

/**
 * Provider-specific system prompt strategies
 */
const SYSTEM_PROMPT_STRATEGIES: Record<ExtendedProviderType, SystemPromptStrategy> = {
  claude: 'native',           // Anthropic supports separate system param
  openai: 'native',           // OpenAI supports system role messages
  ollama: 'native',           // Ollama supports system role
  openrouter: 'native',       // OpenRouter passes through to underlying provider
  gemini: 'native',           // Gemini supports systemInstruction
  'azure-openai': 'native',   // Azure OpenAI same as OpenAI
  bedrock: 'native',          // Bedrock supports system for Claude
  onnx: 'first-message',      // ONNX models typically don't have system prompt support
};

/**
 * Handle system prompt for target provider
 *
 * Different providers handle system prompts differently:
 * - Anthropic: Separate 'system' parameter in API request
 * - OpenAI: First message with role 'system'
 * - Gemini: systemInstruction parameter
 * - Others: May need to prepend to first user message
 */
export function handleSystemPrompt(
  systemPrompt: string,
  targetProvider: ExtendedProviderType
): { strategy: SystemPromptStrategy; content: string } {
  const strategy = SYSTEM_PROMPT_STRATEGIES[targetProvider] || 'first-message';

  // Clean up the system prompt
  const cleanedPrompt = systemPrompt.trim();

  // For providers that don't support system prompts natively,
  // we may need to wrap or prefix the content
  if (strategy === 'first-message') {
    return {
      strategy,
      content: `[System Instructions]\n${cleanedPrompt}\n[End System Instructions]`,
    };
  }

  if (strategy === 'interleaved') {
    return {
      strategy,
      content: `Instructions: ${cleanedPrompt}`,
    };
  }

  if (strategy === 'unsupported') {
    return {
      strategy,
      content: cleanedPrompt, // Still return it, let caller decide what to do
    };
  }

  // Native support - return as-is
  return {
    strategy,
    content: cleanedPrompt,
  };
}

/**
 * Create system message for OpenAI-style APIs
 */
export function createSystemMessage(systemPrompt: string): Message {
  return {
    role: 'system',
    content: systemPrompt,
  };
}

/**
 * Extract system prompt from messages (OpenAI-style)
 */
export function extractSystemPrompt(messages: Message[]): {
  systemPrompt: string | undefined;
  otherMessages: Message[];
} {
  const systemMessages: string[] = [];
  const otherMessages: Message[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg.content);
    } else {
      otherMessages.push(msg);
    }
  }

  return {
    systemPrompt: systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined,
    otherMessages,
  };
}

// ============================================================================
// Response Formatting
// ============================================================================

/**
 * Anthropic API response structure
 */
export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * OpenAI API response structure
 */
export interface OpenAIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Gemini API response structure
 */
export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string } | { functionCall: { name: string; args: unknown } }>;
      role: 'model';
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    safetyRatings?: Array<{ category: string; probability: string }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Normalize finish reason across providers
 */
export function normalizeFinishReason(
  reason: string | null | undefined,
  sourceProvider: ExtendedProviderType
): 'stop' | 'length' | 'content_filter' | 'error' {
  if (!reason) return 'stop';

  const lowerReason = reason.toLowerCase();

  // Stop conditions
  if (
    lowerReason === 'stop' ||
    lowerReason === 'end_turn' ||
    lowerReason === 'stop_sequence' ||
    lowerReason === 'tool_use' ||
    lowerReason === 'tool_calls'
  ) {
    return 'stop';
  }

  // Length conditions
  if (lowerReason === 'length' || lowerReason === 'max_tokens') {
    return 'length';
  }

  // Content filter conditions
  if (
    lowerReason === 'content_filter' ||
    lowerReason === 'safety' ||
    lowerReason === 'recitation'
  ) {
    return 'content_filter';
  }

  return 'stop'; // Default
}

/**
 * Format response to normalized LLMResponse
 */
export function formatResponse(
  response: unknown,
  sourceProvider: ExtendedProviderType,
  latencyMs: number,
  cached: boolean = false
): LLMResponse {
  // Handle Anthropic response
  if (sourceProvider === 'claude' || sourceProvider === 'bedrock') {
    const anthropicResp = response as AnthropicResponse;
    const textContent = anthropicResp.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      content: textContent,
      model: anthropicResp.model,
      provider: sourceProvider as LLMProviderType,
      usage: {
        promptTokens: anthropicResp.usage.input_tokens,
        completionTokens: anthropicResp.usage.output_tokens,
        totalTokens: anthropicResp.usage.input_tokens + anthropicResp.usage.output_tokens,
      },
      cost: calculateCost(
        anthropicResp.usage.input_tokens,
        anthropicResp.usage.output_tokens,
        anthropicResp.model
      ),
      latencyMs,
      finishReason: normalizeFinishReason(anthropicResp.stop_reason, sourceProvider),
      cached,
      requestId: anthropicResp.id,
    };
  }

  // Handle OpenAI response
  if (
    sourceProvider === 'openai' ||
    sourceProvider === 'azure-openai' ||
    sourceProvider === 'openrouter'
  ) {
    const openaiResp = response as OpenAIResponse;
    const choice = openaiResp.choices[0];

    return {
      content: choice?.message?.content || '',
      model: openaiResp.model,
      provider: sourceProvider as LLMProviderType,
      usage: {
        promptTokens: openaiResp.usage.prompt_tokens,
        completionTokens: openaiResp.usage.completion_tokens,
        totalTokens: openaiResp.usage.total_tokens,
      },
      cost: calculateCost(
        openaiResp.usage.prompt_tokens,
        openaiResp.usage.completion_tokens,
        openaiResp.model
      ),
      latencyMs,
      finishReason: normalizeFinishReason(choice?.finish_reason, sourceProvider),
      cached,
      requestId: openaiResp.id,
    };
  }

  // Handle Gemini response
  if (sourceProvider === 'gemini') {
    const geminiResp = response as GeminiResponse;
    const candidate = geminiResp.candidates[0];
    const textContent = candidate?.content.parts
      .filter((p): p is { text: string } => 'text' in p)
      .map((p) => p.text)
      .join('');

    const usage = geminiResp.usageMetadata;

    return {
      content: textContent || '',
      model: 'gemini',
      provider: 'openai' as LLMProviderType, // Gemini maps to openai in LLMProviderType
      usage: {
        promptTokens: usage?.promptTokenCount || 0,
        completionTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
      },
      cost: calculateCost(
        usage?.promptTokenCount || 0,
        usage?.candidatesTokenCount || 0,
        'gemini-pro'
      ),
      latencyMs,
      finishReason: normalizeFinishReason(candidate?.finishReason, sourceProvider),
      cached,
      requestId: `gemini-${Date.now()}`,
    };
  }

  // Default/fallback formatting
  const anyResp = response as Record<string, unknown>;
  return {
    content: String(anyResp.content || anyResp.text || ''),
    model: String(anyResp.model || 'unknown'),
    provider: sourceProvider as LLMProviderType,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
    latencyMs,
    finishReason: 'stop',
    cached,
    requestId: `${sourceProvider}-${Date.now()}`,
  };
}

/**
 * Calculate cost based on model pricing
 * Note: This is a simplified version - real implementation should use model-mapping pricing
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): CostInfo {
  // Simplified pricing per 1M tokens (should be loaded from model-mapping)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4-5-20251101': { input: 15, output: 75 },
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gemini-pro': { input: 1.25, output: 5 },
    'gemini-2.0-pro': { input: 1.25, output: 5 },
  };

  // Find matching pricing or use default
  let modelPricing = pricing[model];
  if (!modelPricing) {
    // Try prefix matching
    for (const [key, value] of Object.entries(pricing)) {
      if (model.includes(key) || key.includes(model.split('-')[0])) {
        modelPricing = value;
        break;
      }
    }
  }
  modelPricing = modelPricing || { input: 1, output: 2 }; // Default fallback

  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD',
  };
}
