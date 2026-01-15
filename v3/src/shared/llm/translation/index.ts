/**
 * Agentic QE v3 - Translation Layer Exports
 * ADR-043: Vendor-Independent LLM Support (Milestone 7)
 *
 * Provides cross-provider message and tool translation capabilities.
 */

// ============================================================================
// Prompt Translator
// ============================================================================

export {
  // Main class and factory
  DefaultPromptTranslator,
  createPromptTranslator,
  promptTranslator,

  // Content block types
  type AnthropicTextBlock,
  type AnthropicImageBlock,
  type AnthropicToolUseBlock,
  type AnthropicToolResultBlock,
  type AnthropicContentBlock,
  type OpenAITextPart,
  type OpenAIImagePart,
  type OpenAIContentPart,
  type OpenAIToolCall,
  type ExtendedMessage,

  // Format detection
  detectMessageFormat,
  getTargetFormat,

  // Content conversion utilities
  anthropicBlocksToString,
  stringToAnthropicBlocks,
  openAIPartsToString,
  anthropicImageToOpenAI,
  openAIImageToAnthropic,
  anthropicToolUseToOpenAI,
  openAIToolCallsToAnthropic,
  translateMessage,
} from './prompt-translator';

// ============================================================================
// Tool Translator
// ============================================================================

export {
  // Types
  type AnthropicTool,
  type OpenAIFunction,
  type GeminiFunctionDeclaration,
  type JsonSchema,
  type GeminiSchema,

  // Main translation function
  translateTools,
  normalizeTools,
  getToolSchemaFormat,

  // Individual converters
  toAnthropicTool,
  toOpenAIFunction,
  toGeminiFunctionDeclaration,
  fromAnthropicTool,
  fromOpenAIFunction,
  fromGeminiFunctionDeclaration,

  // Utilities
  validateToolDefinition,
  mergeToolDefinitions,
} from './tool-translator';

// ============================================================================
// Message Formatter
// ============================================================================

export {
  // System prompt handling
  handleSystemPrompt,
  createSystemMessage,
  extractSystemPrompt,

  // Response types
  type AnthropicResponse,
  type OpenAIResponse,
  type GeminiResponse,

  // Response formatting
  formatResponse,
  normalizeFinishReason,
} from './message-formatter';
