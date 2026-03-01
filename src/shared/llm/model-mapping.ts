/**
 * Agentic QE v3 - Model ID Normalization Layer
 * ADR-043: Vendor-Independent LLM Support (Milestone 2)
 *
 * Provides bidirectional model ID mapping between providers.
 * Enables seamless provider switching without code changes.
 *
 * @example
 * ```typescript
 * import { mapModelId, getCanonicalName, normalizeModelId } from 'agentic-qe/shared/llm';
 *
 * // Map a canonical model ID to a specific provider
 * const anthropicId = mapModelId('claude-sonnet-4-5', 'anthropic');
 * // => 'claude-sonnet-4-5-20250929'
 *
 * // Get human-readable name
 * const displayName = getCanonicalName('gpt-4o');
 * // => 'GPT-4o'
 *
 * // Reverse lookup from provider-specific ID to canonical
 * const canonical = normalizeModelId('anthropic/claude-sonnet-4.5');
 * // => 'claude-sonnet-4-5'
 * ```
 */

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Extended provider type supporting all vendors in ADR-043
 */
export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'gemini'
  | 'azure'
  | 'bedrock'
  | 'ollama';

/**
 * Model mapping entry for a single model
 */
export interface ModelMapping {
  /** Human-readable canonical name (e.g., 'Claude Sonnet 4.5') */
  canonical: string;
  /** Provider-specific model IDs */
  providers: Partial<Record<ProviderType, string>>;
  /** Model family (e.g., 'claude', 'gpt', 'gemini') */
  family: string;
  /** Model tier for cost-based routing */
  tier: 'economy' | 'standard' | 'premium' | 'flagship';
}

// ============================================================================
// Model Mappings Registry
// ============================================================================

/**
 * Comprehensive model mappings for all supported providers
 * Key is the canonical model ID used internally
 */
export const MODEL_MAPPINGS: Record<string, ModelMapping> = {
  // ==========================================================================
  // Claude Models (Anthropic)
  // ==========================================================================
  'claude-sonnet-4-5': {
    canonical: 'Claude Sonnet 4.5',
    family: 'claude',
    tier: 'standard',
    providers: {
      anthropic: 'claude-sonnet-4-5-20250929',
      openrouter: 'anthropic/claude-sonnet-4.5',
      bedrock: 'anthropic.claude-sonnet-4-5-v2:0',
    },
  },
  'claude-opus-4': {
    canonical: 'Claude Opus 4',
    family: 'claude',
    tier: 'flagship',
    providers: {
      anthropic: 'claude-opus-4-20250514',
      openrouter: 'anthropic/claude-opus-4',
      bedrock: 'anthropic.claude-opus-4-v1:0',
    },
  },
  'claude-opus-4-5': {
    canonical: 'Claude Opus 4.5',
    family: 'claude',
    tier: 'flagship',
    providers: {
      anthropic: 'claude-opus-4-5-20251101',
      openrouter: 'anthropic/claude-opus-4.5',
      bedrock: 'anthropic.claude-opus-4-5-v1:0',
    },
  },
  'claude-haiku-3-5': {
    canonical: 'Claude Haiku 3.5',
    family: 'claude',
    tier: 'economy',
    providers: {
      anthropic: 'claude-3-5-haiku-20241022',
      openrouter: 'anthropic/claude-3.5-haiku',
      bedrock: 'anthropic.claude-3-5-haiku-v1:0',
    },
  },
  'claude-sonnet-4': {
    canonical: 'Claude Sonnet 4',
    family: 'claude',
    tier: 'standard',
    providers: {
      anthropic: 'claude-sonnet-4-20250514',
      openrouter: 'anthropic/claude-sonnet-4',
      bedrock: 'anthropic.claude-sonnet-4-v1:0',
    },
  },

  // ==========================================================================
  // OpenAI Models
  // ==========================================================================
  'gpt-4o': {
    canonical: 'GPT-4o',
    family: 'gpt',
    tier: 'standard',
    providers: {
      openai: 'gpt-4o',
      azure: 'gpt-4o',
      openrouter: 'openai/gpt-4o',
    },
  },
  'gpt-4o-mini': {
    canonical: 'GPT-4o Mini',
    family: 'gpt',
    tier: 'economy',
    providers: {
      openai: 'gpt-4o-mini',
      azure: 'gpt-4o-mini',
      openrouter: 'openai/gpt-4o-mini',
    },
  },
  'gpt-4-turbo': {
    canonical: 'GPT-4 Turbo',
    family: 'gpt',
    tier: 'premium',
    providers: {
      openai: 'gpt-4-turbo',
      azure: 'gpt-4-turbo',
      openrouter: 'openai/gpt-4-turbo',
    },
  },
  'gpt-4': {
    canonical: 'GPT-4',
    family: 'gpt',
    tier: 'premium',
    providers: {
      openai: 'gpt-4',
      azure: 'gpt-4',
      openrouter: 'openai/gpt-4',
    },
  },
  'o1': {
    canonical: 'OpenAI o1',
    family: 'gpt',
    tier: 'flagship',
    providers: {
      openai: 'o1',
      azure: 'o1',
      openrouter: 'openai/o1',
    },
  },
  'o1-mini': {
    canonical: 'OpenAI o1 Mini',
    family: 'gpt',
    tier: 'standard',
    providers: {
      openai: 'o1-mini',
      azure: 'o1-mini',
      openrouter: 'openai/o1-mini',
    },
  },

  // ==========================================================================
  // Google Gemini Models
  // ==========================================================================
  'gemini-pro': {
    canonical: 'Gemini Pro',
    family: 'gemini',
    tier: 'standard',
    providers: {
      gemini: 'gemini-pro',
      openrouter: 'google/gemini-pro',
    },
  },
  'gemini-pro-1.5': {
    canonical: 'Gemini Pro 1.5',
    family: 'gemini',
    tier: 'standard',
    providers: {
      gemini: 'gemini-1.5-pro',
      openrouter: 'google/gemini-pro-1.5',
    },
  },
  'gemini-flash-1.5': {
    canonical: 'Gemini Flash 1.5',
    family: 'gemini',
    tier: 'economy',
    providers: {
      gemini: 'gemini-1.5-flash',
      openrouter: 'google/gemini-flash-1.5',
    },
  },
  'gemini-ultra': {
    canonical: 'Gemini Ultra',
    family: 'gemini',
    tier: 'flagship',
    providers: {
      gemini: 'gemini-ultra',
      openrouter: 'google/gemini-ultra',
    },
  },

  // ==========================================================================
  // Ollama Local Models (Zero Cost)
  // ==========================================================================
  'llama3': {
    canonical: 'Llama 3',
    family: 'llama',
    tier: 'economy',
    providers: {
      ollama: 'llama3',
      openrouter: 'meta-llama/llama-3-8b-instruct',
    },
  },
  'llama3.1': {
    canonical: 'Llama 3.1',
    family: 'llama',
    tier: 'economy',
    providers: {
      ollama: 'llama3.1',
      openrouter: 'meta-llama/llama-3.1-8b-instruct',
    },
  },
  'codellama': {
    canonical: 'CodeLlama',
    family: 'llama',
    tier: 'economy',
    providers: {
      ollama: 'codellama',
      openrouter: 'meta-llama/codellama-34b-instruct',
    },
  },
  'mistral': {
    canonical: 'Mistral',
    family: 'mistral',
    tier: 'economy',
    providers: {
      ollama: 'mistral',
      openrouter: 'mistralai/mistral-7b-instruct',
    },
  },
  'mixtral': {
    canonical: 'Mixtral',
    family: 'mistral',
    tier: 'standard',
    providers: {
      ollama: 'mixtral',
      openrouter: 'mistralai/mixtral-8x7b-instruct',
    },
  },
  'phi3': {
    canonical: 'Phi-3',
    family: 'phi',
    tier: 'economy',
    providers: {
      ollama: 'phi3',
      azure: 'phi-3-mini-128k-instruct',
    },
  },
  'qwen2': {
    canonical: 'Qwen 2',
    family: 'qwen',
    tier: 'economy',
    providers: {
      ollama: 'qwen2',
      openrouter: 'qwen/qwen-2-7b-instruct',
    },
  },
};

// ============================================================================
// Reverse Lookup Table (Provider-specific ID -> Canonical ID)
// ============================================================================

/**
 * Build reverse lookup table for fast normalization
 * Maps provider-specific IDs back to canonical IDs
 */
function buildReverseLookup(): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const [canonicalId, mapping] of Object.entries(MODEL_MAPPINGS)) {
    // Also map the canonical ID to itself
    lookup.set(canonicalId, canonicalId);
    lookup.set(canonicalId.toLowerCase(), canonicalId);

    for (const [provider, providerId] of Object.entries(mapping.providers)) {
      if (providerId) {
        // Store both the raw ID and a prefixed version
        lookup.set(providerId, canonicalId);
        lookup.set(providerId.toLowerCase(), canonicalId);
        lookup.set(`${provider}/${providerId}`, canonicalId);
        lookup.set(`${provider}/${providerId}`.toLowerCase(), canonicalId);
      }
    }
  }

  return lookup;
}

const REVERSE_LOOKUP = buildReverseLookup();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Map a model ID to a specific provider's format
 *
 * @param modelId - Canonical model ID or any provider-specific ID
 * @param targetProvider - Provider to map to
 * @returns Provider-specific model ID
 * @throws Error if model is not supported by the target provider
 *
 * @example
 * ```typescript
 * mapModelId('claude-sonnet-4-5', 'anthropic');
 * // => 'claude-sonnet-4-5-20250929'
 *
 * mapModelId('claude-sonnet-4-5', 'openrouter');
 * // => 'anthropic/claude-sonnet-4.5'
 *
 * // Also works with provider-specific IDs as input
 * mapModelId('anthropic/claude-sonnet-4.5', 'bedrock');
 * // => 'anthropic.claude-sonnet-4-5-v2:0'
 * ```
 */
export function mapModelId(modelId: string, targetProvider: ProviderType): string {
  // First normalize the input to canonical ID
  const canonicalId = normalizeModelId(modelId);

  const mapping = MODEL_MAPPINGS[canonicalId];
  if (!mapping) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const providerId = mapping.providers[targetProvider];
  if (!providerId) {
    throw new Error(
      `Model '${canonicalId}' (${mapping.canonical}) is not available on provider '${targetProvider}'`
    );
  }

  return providerId;
}

/**
 * Normalize any model ID to its canonical form
 *
 * @param modelId - Any model ID (canonical or provider-specific)
 * @returns Canonical model ID
 * @throws Error if model ID is not recognized
 *
 * @example
 * ```typescript
 * normalizeModelId('claude-sonnet-4-5-20250929');
 * // => 'claude-sonnet-4-5'
 *
 * normalizeModelId('anthropic/claude-sonnet-4.5');
 * // => 'claude-sonnet-4-5'
 *
 * normalizeModelId('gpt-4o');
 * // => 'gpt-4o'
 * ```
 */
export function normalizeModelId(modelId: string): string {
  // Try exact match first
  let canonical = REVERSE_LOOKUP.get(modelId);
  if (canonical) {
    return canonical;
  }

  // Try lowercase
  canonical = REVERSE_LOOKUP.get(modelId.toLowerCase());
  if (canonical) {
    return canonical;
  }

  // Try stripping common prefixes
  const prefixPatterns = [
    /^anthropic\//i,
    /^openai\//i,
    /^google\//i,
    /^meta-llama\//i,
    /^mistralai\//i,
    /^qwen\//i,
  ];

  for (const pattern of prefixPatterns) {
    const stripped = modelId.replace(pattern, '');
    canonical = REVERSE_LOOKUP.get(stripped);
    if (canonical) {
      return canonical;
    }
    canonical = REVERSE_LOOKUP.get(stripped.toLowerCase());
    if (canonical) {
      return canonical;
    }
  }

  throw new Error(`Unknown model ID: ${modelId}`);
}

/**
 * Get human-readable canonical name for a model
 *
 * @param modelId - Any model ID
 * @returns Human-readable model name
 *
 * @example
 * ```typescript
 * getCanonicalName('claude-sonnet-4-5');
 * // => 'Claude Sonnet 4.5'
 *
 * getCanonicalName('gpt-4o');
 * // => 'GPT-4o'
 *
 * getCanonicalName('anthropic/claude-opus-4');
 * // => 'Claude Opus 4'
 * ```
 */
export function getCanonicalName(modelId: string): string {
  try {
    const canonicalId = normalizeModelId(modelId);
    return MODEL_MAPPINGS[canonicalId].canonical;
  } catch {
    // Return the model ID itself if not found
    return modelId;
  }
}

/**
 * Get the model family for a given model ID
 *
 * @param modelId - Any model ID
 * @returns Model family (e.g., 'claude', 'gpt', 'gemini')
 */
export function getModelFamily(modelId: string): string {
  try {
    const canonicalId = normalizeModelId(modelId);
    return MODEL_MAPPINGS[canonicalId].family;
  } catch {
    return 'unknown';
  }
}

/**
 * Get the model tier for cost-based routing
 *
 * @param modelId - Any model ID
 * @returns Model tier ('economy', 'standard', 'premium', 'flagship')
 */
export function getModelTier(modelId: string): ModelMapping['tier'] {
  try {
    const canonicalId = normalizeModelId(modelId);
    return MODEL_MAPPINGS[canonicalId].tier;
  } catch {
    return 'standard';
  }
}

/**
 * Check if a model is available on a specific provider
 *
 * @param modelId - Any model ID
 * @param provider - Provider to check
 * @returns true if model is available on provider
 */
export function isModelAvailableOnProvider(
  modelId: string,
  provider: ProviderType
): boolean {
  try {
    const canonicalId = normalizeModelId(modelId);
    const mapping = MODEL_MAPPINGS[canonicalId];
    return !!mapping?.providers[provider];
  } catch {
    return false;
  }
}

/**
 * Get all providers that support a given model
 *
 * @param modelId - Any model ID
 * @returns Array of provider types that support this model
 */
export function getSupportedProviders(modelId: string): ProviderType[] {
  try {
    const canonicalId = normalizeModelId(modelId);
    const mapping = MODEL_MAPPINGS[canonicalId];
    return Object.keys(mapping.providers) as ProviderType[];
  } catch {
    return [];
  }
}

/**
 * List all canonical model IDs
 *
 * @returns Array of all canonical model IDs
 */
export function listCanonicalModels(): string[] {
  return Object.keys(MODEL_MAPPINGS);
}

/**
 * List all models available on a specific provider
 *
 * @param provider - Provider to list models for
 * @returns Array of canonical model IDs available on the provider
 */
export function listModelsByProvider(provider: ProviderType): string[] {
  return Object.entries(MODEL_MAPPINGS)
    .filter(([, mapping]) => mapping.providers[provider])
    .map(([id]) => id);
}

/**
 * List all models in a specific family
 *
 * @param family - Model family (e.g., 'claude', 'gpt')
 * @returns Array of canonical model IDs in the family
 */
export function listModelsByFamily(family: string): string[] {
  return Object.entries(MODEL_MAPPINGS)
    .filter(([, mapping]) => mapping.family === family)
    .map(([id]) => id);
}

/**
 * List all models in a specific tier
 *
 * @param tier - Model tier
 * @returns Array of canonical model IDs in the tier
 */
export function listModelsByTier(tier: ModelMapping['tier']): string[] {
  return Object.entries(MODEL_MAPPINGS)
    .filter(([, mapping]) => mapping.tier === tier)
    .map(([id]) => id);
}

/**
 * Get the full mapping entry for a model
 *
 * @param modelId - Any model ID
 * @returns Full mapping entry or undefined if not found
 */
export function getModelMapping(modelId: string): ModelMapping | undefined {
  try {
    const canonicalId = normalizeModelId(modelId);
    return MODEL_MAPPINGS[canonicalId];
  } catch {
    return undefined;
  }
}
