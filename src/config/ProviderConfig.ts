/**
 * Multi-Provider Configuration System
 *
 * Defines configuration types for managing multiple LLM providers
 * with support for YAML-based configuration, environment variables,
 * rate limiting, cost tracking, and fallback chains.
 *
 * @module config/ProviderConfig
 * @version 1.0.0
 */

/**
 * Task types for provider-specific model routing
 */
export type TaskType =
  | 'test-generation'
  | 'coverage-analysis'
  | 'code-review'
  | 'bug-detection'
  | 'documentation'
  | 'refactoring'
  | 'performance-testing'
  | 'security-scanning'
  | 'accessibility-testing';

/**
 * Supported LLM provider types
 */
export type ProviderType =
  | 'ollama'
  | 'openrouter'
  | 'groq'
  | 'claude'
  | 'ruvllm'
  | 'google'
  | 'together'
  | 'github';

/**
 * Deployment modes for multi-provider configuration
 */
export type DeploymentMode =
  | 'local_first'   // Prefer local providers (Ollama, ruvLLM) with hosted fallback
  | 'hosted'        // Only use hosted providers (Groq, OpenRouter, Claude)
  | 'free_only'     // Only use free-tier models
  | 'hybrid';       // Balance between local and hosted based on task complexity

/**
 * Rate limiting configuration for a provider
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute?: number;
  /** Maximum requests per day */
  requestsPerDay?: number;
  /** Maximum tokens per minute */
  tokensPerMinute?: number;
  /** Maximum tokens per day */
  tokensPerDay?: number;
}

/**
 * Cost configuration for a provider
 */
export interface CostConfig {
  /** Cost per 1 million input tokens (USD) */
  input: number;
  /** Cost per 1 million output tokens (USD) */
  output: number;
  /** Cost multiplier for cached reads (e.g., 0.1 for 90% discount) */
  cacheReadMultiplier?: number;
  /** Cost multiplier for cache writes (e.g., 1.25 for 25% premium) */
  cacheWriteMultiplier?: number;
}

/**
 * Configuration for a single LLM provider
 */
export interface ProviderConfig {
  /** Provider type */
  type: ProviderType;

  /** Whether this provider is enabled */
  enabled: boolean;

  /** Priority for provider selection (lower = higher priority) */
  priority: number;

  // Authentication
  /** API key for the provider (supports env var interpolation) */
  apiKey?: string;
  /** Base URL for the provider API */
  baseUrl?: string;
  /** Additional headers for requests */
  headers?: Record<string, string>;

  // Model selection
  /** Default model to use for this provider */
  defaultModel: string;
  /** Model overrides for specific task types */
  modelOverrides?: Partial<Record<TaskType, string>>;
  /** List of available models (for validation) */
  availableModels?: string[];

  // Rate limiting
  /** Rate limit configuration */
  limits?: RateLimitConfig;

  // Cost tracking
  /** Cost per 1M tokens (input/output) */
  costPer1MTokens?: CostConfig;

  // Fallback
  /** Name of fallback provider if this one fails */
  fallbackProvider?: string;

  // Capabilities
  /** Whether this provider supports streaming */
  supportsStreaming?: boolean;
  /** Whether this provider supports prompt caching */
  supportsCaching?: boolean;
  /** Whether this provider supports embeddings */
  supportsEmbeddings?: boolean;
  /** Whether this provider supports vision/multimodal */
  supportsVision?: boolean;

  // Provider-specific options
  /** Additional provider-specific configuration */
  options?: Record<string, any>;
}

/**
 * Cost budget configuration
 */
export interface CostBudgetConfig {
  /** Daily cost limit in USD */
  daily?: number;
  /** Monthly cost limit in USD */
  monthly?: number;
  /** Warn when cost reaches this percentage of budget */
  warnThreshold?: number; // e.g., 80 for 80%
  /** Block requests when cost exceeds budget */
  enforceLimit?: boolean;
}

/**
 * Multi-provider configuration
 */
export interface MultiProviderConfig {
  /** Deployment mode */
  mode: DeploymentMode;

  /** List of provider configurations */
  providers: ProviderConfig[];

  /** Fallback chain (provider names in order of preference) */
  fallbackChain?: string[];

  /** Cost budget tracking */
  costBudget?: CostBudgetConfig;

  /** Enable automatic provider health checks */
  enableHealthChecks?: boolean;

  /** Health check interval in milliseconds */
  healthCheckInterval?: number;

  /** Maximum consecutive failures before marking provider unhealthy */
  maxConsecutiveFailures?: number;

  /** Enable request retries with exponential backoff */
  enableRetries?: boolean;

  /** Maximum retry attempts per request */
  maxRetries?: number;

  /** Enable request caching */
  enableCaching?: boolean;

  /** Cache TTL in seconds */
  cacheTTL?: number;

  /** Enable cost tracking and logging */
  enableCostTracking?: boolean;

  /** Log level for provider operations */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /** Additional global options */
  options?: Record<string, any>;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Validation errors (if any) */
  errors: string[];
  /** Validation warnings (non-blocking) */
  warnings: string[];
}

/**
 * Default provider configurations for common providers
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<ProviderType, Partial<ProviderConfig>> = {
  ollama: {
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2:3b',
    supportsStreaming: true,
    supportsCaching: false,
    supportsEmbeddings: true,
    supportsVision: false,
    costPer1MTokens: { input: 0, output: 0 }, // Free local inference
  },

  groq: {
    type: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsStreaming: true,
    supportsCaching: false,
    supportsEmbeddings: false,
    supportsVision: false,
    costPer1MTokens: { input: 0.59, output: 0.79 },
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 20000,
      tokensPerDay: 1000000,
    },
  },

  openrouter: {
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    supportsStreaming: true,
    supportsCaching: true,
    supportsEmbeddings: false,
    supportsVision: true,
    costPer1MTokens: { input: 3.0, output: 15.0 },
  },

  claude: {
    type: 'claude',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    supportsStreaming: true,
    supportsCaching: true,
    supportsEmbeddings: false,
    supportsVision: true,
    costPer1MTokens: {
      input: 3.0,
      output: 15.0,
      cacheReadMultiplier: 0.1,
      cacheWriteMultiplier: 1.25,
    },
  },

  ruvllm: {
    type: 'ruvllm',
    baseUrl: 'http://localhost:8080',
    defaultModel: 'ruvllm-default',
    supportsStreaming: true,
    supportsCaching: true,
    supportsEmbeddings: true,
    supportsVision: false,
    costPer1MTokens: { input: 0, output: 0 }, // Free local inference
  },

  google: {
    type: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    defaultModel: 'gemini-2.0-flash-exp',
    supportsStreaming: true,
    supportsCaching: false,
    supportsEmbeddings: true,
    supportsVision: true,
    costPer1MTokens: { input: 0, output: 0 }, // Free tier available
  },

  together: {
    type: 'together',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    supportsStreaming: true,
    supportsCaching: false,
    supportsEmbeddings: false,
    supportsVision: false,
    costPer1MTokens: { input: 0.88, output: 0.88 },
  },

  github: {
    type: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    defaultModel: 'gpt-4o',
    supportsStreaming: true,
    supportsCaching: false,
    supportsEmbeddings: false,
    supportsVision: true,
    costPer1MTokens: { input: 0, output: 0 }, // Free for GitHub users
  },
};

/**
 * Default multi-provider configurations for common deployment modes
 */
export const DEFAULT_MODE_CONFIGS: Record<DeploymentMode, Partial<MultiProviderConfig>> = {
  local_first: {
    mode: 'local_first',
    enableHealthChecks: true,
    healthCheckInterval: 60000,
    maxConsecutiveFailures: 3,
    enableRetries: true,
    maxRetries: 2,
    enableCostTracking: true,
  },

  hosted: {
    mode: 'hosted',
    enableHealthChecks: true,
    healthCheckInterval: 300000, // 5 minutes
    maxConsecutiveFailures: 5,
    enableRetries: true,
    maxRetries: 3,
    enableCostTracking: true,
    enableCaching: true,
    cacheTTL: 3600,
  },

  free_only: {
    mode: 'free_only',
    enableHealthChecks: true,
    healthCheckInterval: 60000,
    maxConsecutiveFailures: 2,
    enableRetries: true,
    maxRetries: 3,
    enableCostTracking: false, // No cost tracking needed for free tier
  },

  hybrid: {
    mode: 'hybrid',
    enableHealthChecks: true,
    healthCheckInterval: 120000, // 2 minutes
    maxConsecutiveFailures: 3,
    enableRetries: true,
    maxRetries: 3,
    enableCostTracking: true,
    enableCaching: true,
    cacheTTL: 1800,
  },
};
