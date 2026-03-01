/**
 * Agentic QE v3 - Model Registry
 * ADR-043: Vendor-Independent LLM Support (Milestone 2)
 *
 * Provides model metadata registry with capability flags and cost information.
 * Enables intelligent routing based on model capabilities.
 *
 * @example
 * ```typescript
 * import { getModelCapabilities, listModels, findModelsByCapability } from 'agentic-qe/shared/llm';
 *
 * // Get capabilities for a model
 * const caps = getModelCapabilities('claude-sonnet-4-5');
 * if (caps.supportsTools && caps.supportsStreaming) {
 *   // Use for tool-calling tasks
 * }
 *
 * // List all models for a provider
 * const models = listModels('anthropic');
 *
 * // Find models with specific capabilities
 * const visionModels = findModelsByCapability({ supportsVision: true });
 * ```
 */

import {
  MODEL_MAPPINGS,
  ProviderType,
  normalizeModelId,
  getModelMapping,
} from './model-mapping';

// ============================================================================
// Types
// ============================================================================

/**
 * Model capability flags
 */
export interface ModelCapabilities {
  /** Maximum context window in tokens */
  contextLength: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Supports function/tool calling */
  supportsTools: boolean;
  /** Supports streaming responses */
  supportsStreaming: boolean;
  /** Supports vision/image input */
  supportsVision: boolean;
  /** Supports JSON mode output */
  supportsJsonMode: boolean;
  /** Supports system prompts */
  supportsSystemPrompt: boolean;
  /** Supports extended thinking (Claude) */
  supportsExtendedThinking: boolean;
  /** Supports MCP (Model Context Protocol) */
  supportsMCP: boolean;
  /** Supports embeddings */
  supportsEmbeddings: boolean;
  /** Supports code execution */
  supportsCodeExecution: boolean;
}

/**
 * Cost information per million tokens
 */
export interface ModelCostInfo {
  /** Cost per 1M input tokens in USD */
  inputCostPerMillion: number;
  /** Cost per 1M output tokens in USD */
  outputCostPerMillion: number;
  /** Cost per 1M embedding tokens (if applicable) */
  embeddingCostPerMillion?: number;
  /** Cost per image input (if applicable) */
  imageCostPerUnit?: number;
}

/**
 * Full model information entry
 */
export interface ModelInfo {
  /** Canonical model ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model family (claude, gpt, gemini, etc.) */
  family: string;
  /** Model tier for routing */
  tier: 'economy' | 'standard' | 'premium' | 'flagship';
  /** Available providers */
  providers: ProviderType[];
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Cost information */
  cost: ModelCostInfo;
  /** Model description */
  description: string;
  /** Release date (ISO format) */
  releaseDate?: string;
  /** Deprecation date if scheduled (ISO format) */
  deprecationDate?: string;
  /** Whether model is recommended for new projects */
  recommended: boolean;
}

// ============================================================================
// Model Registry Data
// ============================================================================

/**
 * Comprehensive model registry with capabilities and costs
 */
export const MODEL_REGISTRY: Record<string, Omit<ModelInfo, 'id' | 'providers'>> = {
  // ==========================================================================
  // Claude Models
  // ==========================================================================
  'claude-sonnet-4-5': {
    name: 'Claude Sonnet 4.5',
    family: 'claude',
    tier: 'standard',
    description: 'Most intelligent model, best for complex reasoning and coding tasks',
    releaseDate: '2025-09-29',
    recommended: true,
    capabilities: {
      contextLength: 200000,
      maxOutputTokens: 16384,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: true,
      supportsMCP: true,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
    },
  },
  'claude-opus-4': {
    name: 'Claude Opus 4',
    family: 'claude',
    tier: 'flagship',
    description: 'Flagship model with exceptional reasoning and reliability',
    releaseDate: '2025-05-14',
    recommended: true,
    capabilities: {
      contextLength: 200000,
      maxOutputTokens: 16384,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: true,
      supportsMCP: true,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
    },
  },
  'claude-opus-4-5': {
    name: 'Claude Opus 4.5',
    family: 'claude',
    tier: 'flagship',
    description: 'Latest flagship model with enhanced reasoning capabilities',
    releaseDate: '2025-11-01',
    recommended: true,
    capabilities: {
      contextLength: 200000,
      maxOutputTokens: 32768,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: true,
      supportsMCP: true,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
    },
  },
  'claude-haiku-3-5': {
    name: 'Claude Haiku 3.5',
    family: 'claude',
    tier: 'economy',
    description: 'Fast and cost-effective for routine tasks',
    releaseDate: '2024-10-22',
    recommended: true,
    capabilities: {
      contextLength: 200000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: true,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 1.0,
      outputCostPerMillion: 5.0,
    },
  },
  'claude-sonnet-4': {
    name: 'Claude Sonnet 4',
    family: 'claude',
    tier: 'standard',
    description: 'Balanced model for general-purpose tasks',
    releaseDate: '2025-05-14',
    recommended: true,
    capabilities: {
      contextLength: 200000,
      maxOutputTokens: 16384,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: true,
      supportsMCP: true,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
    },
  },

  // ==========================================================================
  // OpenAI Models
  // ==========================================================================
  'gpt-4o': {
    name: 'GPT-4o',
    family: 'gpt',
    tier: 'standard',
    description: 'OpenAI flagship multimodal model, fast and capable',
    releaseDate: '2024-05-13',
    recommended: true,
    capabilities: {
      contextLength: 128000,
      maxOutputTokens: 16384,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 5.0,
      outputCostPerMillion: 15.0,
      imageCostPerUnit: 0.00765,
    },
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    family: 'gpt',
    tier: 'economy',
    description: 'Small, fast, and affordable for lightweight tasks',
    releaseDate: '2024-07-18',
    recommended: true,
    capabilities: {
      contextLength: 128000,
      maxOutputTokens: 16384,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
      imageCostPerUnit: 0.001275,
    },
  },
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    family: 'gpt',
    tier: 'premium',
    description: 'Previous flagship with vision and function calling',
    releaseDate: '2024-04-09',
    recommended: false,
    capabilities: {
      contextLength: 128000,
      maxOutputTokens: 4096,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 30.0,
    },
  },
  'gpt-4': {
    name: 'GPT-4',
    family: 'gpt',
    tier: 'premium',
    description: 'Original GPT-4 model, now superseded by GPT-4o',
    releaseDate: '2023-03-14',
    deprecationDate: '2025-06-01',
    recommended: false,
    capabilities: {
      contextLength: 8192,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 30.0,
      outputCostPerMillion: 60.0,
    },
  },
  'o1': {
    name: 'OpenAI o1',
    family: 'gpt',
    tier: 'flagship',
    description: 'Reasoning-focused model with extended thinking',
    releaseDate: '2024-12-05',
    recommended: true,
    capabilities: {
      contextLength: 200000,
      maxOutputTokens: 100000,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: true,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 60.0,
    },
  },
  'o1-mini': {
    name: 'OpenAI o1 Mini',
    family: 'gpt',
    tier: 'standard',
    description: 'Faster reasoning model optimized for STEM tasks',
    releaseDate: '2024-09-12',
    recommended: true,
    capabilities: {
      contextLength: 128000,
      maxOutputTokens: 65536,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: true,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 12.0,
    },
  },

  // ==========================================================================
  // Google Gemini Models
  // ==========================================================================
  'gemini-pro': {
    name: 'Gemini Pro',
    family: 'gemini',
    tier: 'standard',
    description: 'Google balanced model for diverse tasks',
    releaseDate: '2023-12-06',
    recommended: false,
    capabilities: {
      contextLength: 32000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 1.5,
    },
  },
  'gemini-pro-1.5': {
    name: 'Gemini Pro 1.5',
    family: 'gemini',
    tier: 'standard',
    description: 'Google mid-size model with 1M context window',
    releaseDate: '2024-02-15',
    recommended: true,
    capabilities: {
      contextLength: 1000000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: true,
    },
    cost: {
      inputCostPerMillion: 3.5,
      outputCostPerMillion: 10.5,
    },
  },
  'gemini-flash-1.5': {
    name: 'Gemini Flash 1.5',
    family: 'gemini',
    tier: 'economy',
    description: 'Fast and efficient with 1M context window',
    releaseDate: '2024-05-14',
    recommended: true,
    capabilities: {
      contextLength: 1000000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: true,
    },
    cost: {
      inputCostPerMillion: 0.075,
      outputCostPerMillion: 0.3,
    },
  },
  'gemini-ultra': {
    name: 'Gemini Ultra',
    family: 'gemini',
    tier: 'flagship',
    description: 'Google most capable model',
    releaseDate: '2024-02-08',
    recommended: false,
    capabilities: {
      contextLength: 32000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 12.0,
      outputCostPerMillion: 36.0,
    },
  },

  // ==========================================================================
  // Ollama Local Models (Zero Cost)
  // ==========================================================================
  'llama3': {
    name: 'Llama 3',
    family: 'llama',
    tier: 'economy',
    description: 'Meta open-source 8B model, runs locally',
    releaseDate: '2024-04-18',
    recommended: true,
    capabilities: {
      contextLength: 8192,
      maxOutputTokens: 4096,
      supportsTools: false,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: false,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  },
  'llama3.1': {
    name: 'Llama 3.1',
    family: 'llama',
    tier: 'economy',
    description: 'Meta latest open-source model with tool support',
    releaseDate: '2024-07-23',
    recommended: true,
    capabilities: {
      contextLength: 128000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  },
  'codellama': {
    name: 'CodeLlama',
    family: 'llama',
    tier: 'economy',
    description: 'Meta code-specialized model',
    releaseDate: '2023-08-24',
    recommended: true,
    capabilities: {
      contextLength: 100000,
      maxOutputTokens: 4096,
      supportsTools: false,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: false,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  },
  'mistral': {
    name: 'Mistral',
    family: 'mistral',
    tier: 'economy',
    description: 'Mistral AI 7B instruction-tuned model',
    releaseDate: '2023-09-27',
    recommended: true,
    capabilities: {
      contextLength: 32000,
      maxOutputTokens: 4096,
      supportsTools: false,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: false,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  },
  'mixtral': {
    name: 'Mixtral',
    family: 'mistral',
    tier: 'standard',
    description: 'Mistral AI mixture of experts model',
    releaseDate: '2023-12-11',
    recommended: true,
    capabilities: {
      contextLength: 32000,
      maxOutputTokens: 4096,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  },
  'phi3': {
    name: 'Phi-3',
    family: 'phi',
    tier: 'economy',
    description: 'Microsoft small language model, efficient',
    releaseDate: '2024-04-23',
    recommended: true,
    capabilities: {
      contextLength: 128000,
      maxOutputTokens: 4096,
      supportsTools: false,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: false,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  },
  'qwen2': {
    name: 'Qwen 2',
    family: 'qwen',
    tier: 'economy',
    description: 'Alibaba multilingual model',
    releaseDate: '2024-06-07',
    recommended: true,
    capabilities: {
      contextLength: 32000,
      maxOutputTokens: 4096,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: false,
      supportsJsonMode: true,
      supportsSystemPrompt: true,
      supportsExtendedThinking: false,
      supportsMCP: false,
      supportsEmbeddings: false,
      supportsCodeExecution: false,
    },
    cost: {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get capabilities for a model
 *
 * @param modelId - Any model ID (canonical or provider-specific)
 * @returns Model capabilities
 * @throws Error if model is not found
 *
 * @example
 * ```typescript
 * const caps = getModelCapabilities('claude-sonnet-4-5');
 * if (caps.supportsTools) {
 *   // Can use function calling
 * }
 * if (caps.contextLength >= 100000) {
 *   // Can handle large documents
 * }
 * ```
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  const canonicalId = normalizeModelId(modelId);
  const entry = MODEL_REGISTRY[canonicalId];

  if (!entry) {
    throw new Error(`Model not found in registry: ${modelId}`);
  }

  return { ...entry.capabilities };
}

/**
 * Get cost information for a model
 *
 * @param modelId - Any model ID
 * @returns Cost information per million tokens
 */
export function getModelCost(modelId: string): ModelCostInfo {
  try {
    const canonicalId = normalizeModelId(modelId);
    const entry = MODEL_REGISTRY[canonicalId];

    if (!entry) {
      // Return zero cost for unknown models (assume local)
      return {
        inputCostPerMillion: 0,
        outputCostPerMillion: 0,
      };
    }

    return { ...entry.cost };
  } catch {
    // Return zero cost for unknown models (assume local)
    return {
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    };
  }
}

/**
 * Get full model information
 *
 * @param modelId - Any model ID
 * @returns Full model information including capabilities and cost
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  try {
    const canonicalId = normalizeModelId(modelId);
    const entry = MODEL_REGISTRY[canonicalId];
    const mapping = getModelMapping(canonicalId);

    if (!entry || !mapping) {
      return undefined;
    }

    return {
      id: canonicalId,
      providers: Object.keys(mapping.providers) as ProviderType[],
      ...entry,
    };
  } catch {
    return undefined;
  }
}

/**
 * List all models, optionally filtered by provider
 *
 * @param provider - Optional provider to filter by
 * @returns Array of model information
 *
 * @example
 * ```typescript
 * // List all models
 * const allModels = listModels();
 *
 * // List only Anthropic models
 * const claudeModels = listModels('anthropic');
 * ```
 */
export function listModels(provider?: ProviderType): ModelInfo[] {
  const models: ModelInfo[] = [];

  for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
    const mapping = getModelMapping(id);
    if (!mapping) continue;

    const providers = Object.keys(mapping.providers) as ProviderType[];

    // Filter by provider if specified
    if (provider && !providers.includes(provider)) {
      continue;
    }

    models.push({
      id,
      providers,
      ...entry,
    });
  }

  return models;
}

/**
 * Find models that match specific capability requirements
 *
 * @param requirements - Partial capability requirements
 * @returns Array of matching model IDs
 *
 * @example
 * ```typescript
 * // Find models with vision support
 * const visionModels = findModelsByCapability({ supportsVision: true });
 *
 * // Find models with tools and large context
 * const advancedModels = findModelsByCapability({
 *   supportsTools: true,
 *   contextLength: 100000, // minimum context length
 * });
 * ```
 */
export function findModelsByCapability(
  requirements: Partial<ModelCapabilities>
): string[] {
  const matches: string[] = [];

  for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
    const caps = entry.capabilities;
    let match = true;

    for (const [key, value] of Object.entries(requirements)) {
      const capKey = key as keyof ModelCapabilities;
      const capValue = caps[capKey];

      // For numeric values (contextLength, maxOutputTokens), check minimum
      if (typeof value === 'number' && typeof capValue === 'number') {
        if (capValue < value) {
          match = false;
          break;
        }
      }
      // For boolean values, check exact match
      else if (typeof value === 'boolean') {
        if (capValue !== value) {
          match = false;
          break;
        }
      }
    }

    if (match) {
      matches.push(id);
    }
  }

  return matches;
}

/**
 * Find models within a cost budget
 *
 * @param maxInputCost - Maximum input cost per million tokens
 * @param maxOutputCost - Maximum output cost per million tokens
 * @returns Array of matching model IDs
 */
export function findModelsByCost(
  maxInputCost: number,
  maxOutputCost?: number
): string[] {
  const matches: string[] = [];

  for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
    const { inputCostPerMillion, outputCostPerMillion } = entry.cost;

    if (inputCostPerMillion <= maxInputCost) {
      if (maxOutputCost === undefined || outputCostPerMillion <= maxOutputCost) {
        matches.push(id);
      }
    }
  }

  return matches;
}

/**
 * Find the cheapest model that meets capability requirements
 *
 * @param requirements - Required capabilities
 * @param provider - Optional provider constraint
 * @returns Cheapest matching model ID or undefined
 */
export function findCheapestModel(
  requirements: Partial<ModelCapabilities>,
  provider?: ProviderType
): string | undefined {
  const candidates = findModelsByCapability(requirements);

  if (candidates.length === 0) {
    return undefined;
  }

  // Filter by provider if specified
  let filtered = candidates;
  if (provider) {
    filtered = candidates.filter((id) => {
      const mapping = getModelMapping(id);
      return mapping?.providers[provider] !== undefined;
    });
  }

  if (filtered.length === 0) {
    return undefined;
  }

  // Sort by total cost (input + output as rough estimate)
  filtered.sort((a, b) => {
    const costA = MODEL_REGISTRY[a].cost;
    const costB = MODEL_REGISTRY[b].cost;
    const totalA = costA.inputCostPerMillion + costA.outputCostPerMillion;
    const totalB = costB.inputCostPerMillion + costB.outputCostPerMillion;
    return totalA - totalB;
  });

  return filtered[0];
}

/**
 * Find the most capable model within a budget
 *
 * @param maxTotalCost - Maximum total cost (input + output) per million tokens
 * @param provider - Optional provider constraint
 * @returns Best model ID within budget or undefined
 */
export function findBestModelInBudget(
  maxTotalCost: number,
  provider?: ProviderType
): string | undefined {
  const candidates: Array<{ id: string; score: number }> = [];

  for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
    const totalCost = entry.cost.inputCostPerMillion + entry.cost.outputCostPerMillion;

    if (totalCost > maxTotalCost) {
      continue;
    }

    // Filter by provider
    if (provider) {
      const mapping = getModelMapping(id);
      if (!mapping?.providers[provider]) {
        continue;
      }
    }

    // Calculate capability score
    const caps = entry.capabilities;
    let score = 0;

    // Context length contributes to score (log scale)
    score += Math.log10(caps.contextLength) * 10;

    // Output tokens
    score += Math.log10(caps.maxOutputTokens) * 5;

    // Boolean capabilities
    if (caps.supportsTools) score += 20;
    if (caps.supportsVision) score += 15;
    if (caps.supportsStreaming) score += 5;
    if (caps.supportsJsonMode) score += 10;
    if (caps.supportsExtendedThinking) score += 20;
    if (caps.supportsMCP) score += 10;
    if (caps.supportsCodeExecution) score += 10;

    // Tier bonus
    const tierBonus: Record<string, number> = {
      flagship: 30,
      premium: 20,
      standard: 10,
      economy: 0,
    };
    score += tierBonus[entry.tier] || 0;

    candidates.push({ id, score });
  }

  if (candidates.length === 0) {
    return undefined;
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates[0].id;
}

/**
 * Get recommended models for a specific use case
 *
 * @param useCase - Use case identifier
 * @returns Array of recommended model IDs in priority order
 */
export function getRecommendedModels(
  useCase: 'coding' | 'reasoning' | 'vision' | 'chat' | 'embedding' | 'local'
): string[] {
  switch (useCase) {
    case 'coding':
      return [
        'claude-sonnet-4-5',
        'claude-opus-4',
        'gpt-4o',
        'o1-mini',
        'codellama',
      ];
    case 'reasoning':
      return [
        'claude-opus-4-5',
        'o1',
        'claude-opus-4',
        'o1-mini',
        'claude-sonnet-4-5',
      ];
    case 'vision':
      return [
        'claude-sonnet-4-5',
        'gpt-4o',
        'gemini-pro-1.5',
        'claude-opus-4',
      ];
    case 'chat':
      return [
        'claude-haiku-3-5',
        'gpt-4o-mini',
        'gemini-flash-1.5',
        'llama3.1',
      ];
    case 'embedding':
      // Models with embedding support (none in current registry, suggest alternatives)
      return [];
    case 'local':
      return [
        'llama3.1',
        'mixtral',
        'codellama',
        'mistral',
        'phi3',
        'qwen2',
      ];
    default:
      return ['claude-sonnet-4-5', 'gpt-4o'];
  }
}

/**
 * Check if a model is deprecated or scheduled for deprecation
 *
 * @param modelId - Model ID to check
 * @returns Deprecation info or undefined if not deprecated
 */
export function getDeprecationStatus(
  modelId: string
): { deprecated: boolean; date?: string } | undefined {
  try {
    const canonicalId = normalizeModelId(modelId);
    const entry = MODEL_REGISTRY[canonicalId];

    if (!entry) {
      return undefined;
    }

    if (entry.deprecationDate) {
      const deprecationDate = new Date(entry.deprecationDate);
      const now = new Date();

      return {
        deprecated: now >= deprecationDate,
        date: entry.deprecationDate,
      };
    }

    return { deprecated: false };
  } catch {
    return undefined;
  }
}

/**
 * Calculate estimated cost for a request
 *
 * @param modelId - Model ID
 * @param inputTokens - Estimated input tokens
 * @param outputTokens - Estimated output tokens
 * @returns Estimated cost in USD
 */
export function estimateRequestCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const cost = getModelCost(modelId);

  const inputCost = (inputTokens / 1_000_000) * cost.inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * cost.outputCostPerMillion;

  return inputCost + outputCost;
}

/**
 * Compare two models on capabilities and cost
 *
 * @param modelA - First model ID
 * @param modelB - Second model ID
 * @returns Comparison result
 */
export function compareModels(
  modelA: string,
  modelB: string
): {
  contextLengthDiff: number;
  costDiff: number;
  capabilityDiff: string[];
} {
  const infoA = getModelInfo(modelA);
  const infoB = getModelInfo(modelB);

  if (!infoA || !infoB) {
    throw new Error('One or both models not found');
  }

  const contextLengthDiff =
    infoA.capabilities.contextLength - infoB.capabilities.contextLength;

  const totalCostA =
    infoA.cost.inputCostPerMillion + infoA.cost.outputCostPerMillion;
  const totalCostB =
    infoB.cost.inputCostPerMillion + infoB.cost.outputCostPerMillion;
  const costDiff = totalCostA - totalCostB;

  // Find capability differences
  const capabilityDiff: string[] = [];
  const booleanCaps: Array<keyof ModelCapabilities> = [
    'supportsTools',
    'supportsStreaming',
    'supportsVision',
    'supportsJsonMode',
    'supportsSystemPrompt',
    'supportsExtendedThinking',
    'supportsMCP',
    'supportsEmbeddings',
    'supportsCodeExecution',
  ];

  for (const cap of booleanCaps) {
    const capA = infoA.capabilities[cap];
    const capB = infoB.capabilities[cap];

    if (capA !== capB) {
      if (capA && !capB) {
        capabilityDiff.push(`+${cap} (${modelA})`);
      } else {
        capabilityDiff.push(`+${cap} (${modelB})`);
      }
    }
  }

  return {
    contextLengthDiff,
    costDiff,
    capabilityDiff,
  };
}
