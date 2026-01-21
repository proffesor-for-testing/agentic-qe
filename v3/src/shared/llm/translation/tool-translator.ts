/**
 * Agentic QE v3 - Tool Translator
 * ADR-043: Vendor-Independent LLM Support (Milestone 7)
 *
 * Handles tool/function schema translation between providers:
 * - Anthropic tool format <-> OpenAI function format
 * - Gemini function declaration format support
 * - Required/optional parameters handling
 */

import type {
  ToolDefinition,
  TranslatedTools,
  ToolSchemaFormat,
  ExtendedProviderType,
} from '../router/types';

// ============================================================================
// Provider-Specific Tool Schema Types
// ============================================================================

/**
 * Anthropic tool definition format
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, JsonSchema>;
    required?: string[];
  };
}

/**
 * OpenAI function definition format
 */
export interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, JsonSchema>;
      required?: string[];
    };
    strict?: boolean;
  };
}

/**
 * Gemini function declaration format
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, GeminiSchema>;
    required?: string[];
  };
}

/**
 * JSON Schema property definition
 */
export interface JsonSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

/**
 * Gemini schema (subset of JSON Schema)
 */
export interface GeminiSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
}

// ============================================================================
// Format Detection and Conversion
// ============================================================================

/**
 * Get the tool schema format for a provider
 */
export function getToolSchemaFormat(provider: ExtendedProviderType): ToolSchemaFormat {
  switch (provider) {
    case 'claude':
    case 'bedrock':
      return 'anthropic';
    case 'openai':
    case 'azure-openai':
    case 'openrouter':
    case 'ollama':
    case 'onnx':
      return 'openai';
    case 'gemini':
      return 'gemini';
    default:
      return 'openai'; // Default fallback
  }
}

/**
 * Convert unified ToolDefinition to Anthropic format
 */
export function toAnthropicTool(tool: ToolDefinition): AnthropicTool {
  const params = tool.parameters as { properties?: Record<string, JsonSchema> };
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: params.properties || {},
      required: tool.required,
    },
  };
}

/**
 * Convert unified ToolDefinition to OpenAI function format
 */
export function toOpenAIFunction(tool: ToolDefinition): OpenAIFunction {
  const params = tool.parameters as { properties?: Record<string, JsonSchema> };
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: params.properties || {},
        required: tool.required,
      },
    },
  };
}

/**
 * Convert JSON Schema to Gemini-compatible schema
 * Gemini has a more limited schema support
 */
function toGeminiSchema(schema: JsonSchema): GeminiSchema {
  const result: GeminiSchema = {
    type: schema.type,
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.items) {
    result.items = toGeminiSchema(schema.items);
  }

  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = toGeminiSchema(value);
    }
  }

  if (schema.required) {
    result.required = schema.required;
  }

  return result;
}

/**
 * Convert unified ToolDefinition to Gemini function declaration
 */
export function toGeminiFunctionDeclaration(
  tool: ToolDefinition
): GeminiFunctionDeclaration {
  const params = tool.parameters as { properties?: Record<string, JsonSchema> };
  const geminiProperties: Record<string, GeminiSchema> = {};

  if (params.properties) {
    for (const [key, value] of Object.entries(params.properties)) {
      geminiProperties[key] = toGeminiSchema(value);
    }
  }

  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: geminiProperties,
      required: tool.required,
    },
  };
}

/**
 * Convert Anthropic tool to unified format
 */
export function fromAnthropicTool(tool: AnthropicTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.input_schema.properties,
    },
    required: tool.input_schema.required,
  };
}

/**
 * Convert OpenAI function to unified format
 */
export function fromOpenAIFunction(func: OpenAIFunction): ToolDefinition {
  return {
    name: func.function.name,
    description: func.function.description,
    parameters: {
      type: 'object',
      properties: func.function.parameters.properties,
    },
    required: func.function.parameters.required,
  };
}

/**
 * Convert Gemini function declaration to unified format
 */
export function fromGeminiFunctionDeclaration(
  decl: GeminiFunctionDeclaration
): ToolDefinition {
  return {
    name: decl.name,
    description: decl.description,
    parameters: {
      type: 'object',
      properties: decl.parameters.properties as Record<string, unknown>,
    },
    required: decl.parameters.required,
  };
}

// ============================================================================
// Main Translation Function
// ============================================================================

/**
 * Translate tool definitions to target provider format
 */
export function translateTools(
  tools: ToolDefinition[],
  targetProvider: ExtendedProviderType
): TranslatedTools {
  const format = getToolSchemaFormat(targetProvider);
  const lostFeatures: string[] = [];
  let translatedTools: unknown[];

  switch (format) {
    case 'anthropic':
      translatedTools = tools.map(toAnthropicTool);
      break;

    case 'openai':
      translatedTools = tools.map(toOpenAIFunction);
      break;

    case 'gemini':
      // Gemini has limited schema support - track lost features
      translatedTools = tools.map((tool) => {
        const params = tool.parameters as { properties?: Record<string, JsonSchema> };
        if (params.properties) {
          for (const prop of Object.values(params.properties)) {
            if (prop.format) {
              lostFeatures.push(`format constraint on ${tool.name}`);
            }
            if (prop.pattern) {
              lostFeatures.push(`pattern constraint on ${tool.name}`);
            }
            if (prop.minimum !== undefined || prop.maximum !== undefined) {
              lostFeatures.push(`numeric bounds on ${tool.name}`);
            }
            if (prop.minLength !== undefined || prop.maxLength !== undefined) {
              lostFeatures.push(`string length bounds on ${tool.name}`);
            }
          }
        }
        return toGeminiFunctionDeclaration(tool);
      });
      break;

    default:
      // Custom format - return as-is with warning
      translatedTools = tools;
      lostFeatures.push('Unknown format - tools returned unchanged');
  }

  return {
    tools: translatedTools,
    format,
    lostFeatures: lostFeatures.length > 0 ? [...new Set(lostFeatures)] : undefined,
  };
}

/**
 * Normalize tools from provider format to unified format
 */
export function normalizeTools(
  tools: unknown[],
  sourceFormat: ToolSchemaFormat
): ToolDefinition[] {
  switch (sourceFormat) {
    case 'anthropic':
      return (tools as AnthropicTool[]).map(fromAnthropicTool);

    case 'openai':
      return (tools as OpenAIFunction[]).map(fromOpenAIFunction);

    case 'gemini':
      return (tools as GeminiFunctionDeclaration[]).map(fromGeminiFunctionDeclaration);

    default:
      // Assume unified format
      return tools as ToolDefinition[];
  }
}

/**
 * Validate tool definition
 */
export function validateToolDefinition(tool: ToolDefinition): string[] {
  const errors: string[] = [];

  if (!tool.name || typeof tool.name !== 'string') {
    errors.push('Tool must have a valid name');
  }

  if (!tool.description || typeof tool.description !== 'string') {
    errors.push('Tool must have a description');
  }

  if (!tool.parameters || typeof tool.parameters !== 'object') {
    errors.push('Tool must have parameters object');
  }

  // Validate name format (alphanumeric, underscores, hyphens)
  if (tool.name && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tool.name)) {
    errors.push('Tool name must start with letter and contain only alphanumeric, underscore, or hyphen');
  }

  // Check required parameters exist in properties
  if (tool.required && tool.parameters) {
    const params = tool.parameters as { properties?: Record<string, unknown> };
    const props = params.properties || {};
    for (const req of tool.required) {
      if (!(req in props)) {
        errors.push(`Required parameter '${req}' not found in properties`);
      }
    }
  }

  return errors;
}

/**
 * Merge multiple tool definitions (for tool composition)
 */
export function mergeToolDefinitions(
  base: ToolDefinition,
  override: Partial<ToolDefinition>
): ToolDefinition {
  const baseParams = base.parameters as { properties?: Record<string, unknown> };
  const overrideParams = override.parameters as { properties?: Record<string, unknown> } | undefined;

  return {
    name: override.name ?? base.name,
    description: override.description ?? base.description,
    parameters: {
      ...baseParams,
      properties: {
        ...baseParams.properties,
        ...overrideParams?.properties,
      },
    },
    required: override.required ?? base.required,
  };
}
