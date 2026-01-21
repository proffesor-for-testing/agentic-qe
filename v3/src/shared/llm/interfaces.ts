/**
 * Agentic QE v3 - LLM Provider Interfaces
 * ADR-011: LLM Provider System for Quality Engineering
 *
 * Defines core interfaces for multi-provider LLM support with:
 * - Provider abstraction for Claude, OpenAI, and Ollama
 * - Cost tracking and token management
 * - Circuit breaker support for resilience
 * - Response caching
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported LLM provider types
 */
export type LLMProviderType = 'claude' | 'openai' | 'ollama' | 'openrouter' | 'bedrock' | 'azure-openai' | 'gemini';

/**
 * Message role in a conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * A single message in a conversation
 */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Cost information for a request
 */
export interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * LLM generation response
 */
export interface LLMResponse {
  /** Generated text content */
  content: string;
  /** Model used for generation */
  model: string;
  /** Provider that generated the response */
  provider: LLMProviderType;
  /** Token usage statistics */
  usage: TokenUsage;
  /** Cost of this request */
  cost: CostInfo;
  /** Response generation time in ms */
  latencyMs: number;
  /** Finish reason from the model */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  /** Whether response was served from cache */
  cached: boolean;
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  /** Embedding vector */
  embedding: number[];
  /** Model used */
  model: string;
  /** Provider that generated the embedding */
  provider: LLMProviderType;
  /** Token count for input */
  tokenCount: number;
  /** Generation time in ms */
  latencyMs: number;
  /** Whether response was served from cache */
  cached: boolean;
}

/**
 * Completion response (for code completion use cases)
 */
export interface CompletionResponse {
  /** Completed text */
  completion: string;
  /** Model used */
  model: string;
  /** Provider that generated the completion */
  provider: LLMProviderType;
  /** Token usage */
  usage: TokenUsage;
  /** Generation time in ms */
  latencyMs: number;
  /** Whether response was served from cache */
  cached: boolean;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Base LLM configuration
 */
export interface LLMConfig {
  /** API key for authentication */
  apiKey?: string;
  /** Base URL for API calls (for self-hosted or proxied setups) */
  baseUrl?: string;
  /** Default model to use */
  model: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Top-p sampling parameter */
  topP?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Number of retries on failure */
  maxRetries?: number;
  /** Enable response caching */
  enableCache?: boolean;
  /** Enable circuit breaker */
  enableCircuitBreaker?: boolean;
}

/**
 * Claude-specific configuration
 */
export interface ClaudeConfig extends LLMConfig {
  /** Claude model version */
  model:
    | 'claude-opus-4-5-20251101'
    | 'claude-sonnet-4-20250514'
    | 'claude-3-5-haiku-20241022'
    | string;
  /** Anthropic API version */
  anthropicVersion?: string;
  /** Maximum thinking tokens for extended thinking */
  maxThinkingTokens?: number;
}

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig extends LLMConfig {
  /** OpenAI model */
  model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-3.5-turbo' | string;
  /** Organization ID */
  organization?: string;
  /** Presence penalty (-2 to 2) */
  presencePenalty?: number;
  /** Frequency penalty (-2 to 2) */
  frequencyPenalty?: number;
}

/**
 * Ollama-specific configuration
 */
export interface OllamaConfig extends LLMConfig {
  /** Local model name */
  model: string;
  /** Ollama server URL */
  baseUrl?: string;
  /** Context window size */
  contextLength?: number;
  /** Number of GPU layers to use */
  numGpu?: number;
  /** Keep model loaded in memory */
  keepAlive?: string;
}

/**
 * OpenRouter-specific configuration (ADR-043)
 */
export interface OpenRouterConfig extends LLMConfig {
  /** OpenRouter model ID (e.g., 'anthropic/claude-sonnet-4', 'openai/gpt-4o') */
  model: string;
  /** Site URL for attribution */
  siteUrl?: string;
  /** Site name for attribution */
  siteName?: string;
  /** Fallback models in order of preference */
  fallbacks?: string[];
  /** Provider preferences */
  providerPreferences?: {
    allow?: string[];
    deny?: string[];
    order?: string[];
  };
}

/**
 * Google Gemini-specific configuration (ADR-043)
 */
export interface GeminiConfig extends LLMConfig {
  /** Gemini model (e.g., 'gemini-2.0-flash', 'gemini-1.5-pro') */
  model: string;
  /** Google Cloud project ID */
  projectId?: string;
  /** Google Cloud location */
  location?: string;
  /** Safety settings */
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
  /** Generation config overrides */
  generationConfig?: {
    stopSequences?: string[];
    candidateCount?: number;
  };
}

/**
 * Azure OpenAI-specific configuration (ADR-043)
 */
export interface AzureOpenAIConfig extends LLMConfig {
  /** Azure deployment ID */
  deploymentId: string;
  /** Azure OpenAI resource name */
  resourceName?: string;
  /** Azure API version */
  apiVersion?: string;
  /** Azure endpoint URL (alternative to resourceName) */
  endpoint?: string;
  /** Model name (for reference, actual model determined by deployment) */
  model: string;
}

/**
 * AWS Bedrock-specific configuration (ADR-043)
 */
export interface BedrockConfig extends LLMConfig {
  /** Bedrock model ID */
  model: string;
  /** AWS region */
  region?: string;
  /** AWS access key ID (if not using default credentials) */
  accessKeyId?: string;
  /** AWS secret access key (if not using default credentials) */
  secretAccessKey?: string;
  /** AWS session token (for temporary credentials) */
  sessionToken?: string;
  /** Inference profile ARN (for cross-region inference) */
  inferenceProfileArn?: string;
}

/**
 * Provider manager configuration
 */
export interface ProviderManagerConfig {
  /** Primary provider to use */
  primary: LLMProviderType;
  /** Fallback providers in order of preference */
  fallbacks: LLMProviderType[];
  /** Load balancing strategy */
  loadBalancing: 'round-robin' | 'least-cost' | 'least-latency' | 'random';
  /** Provider-specific configurations (ADR-043: All 7 providers) */
  providers: {
    claude?: ClaudeConfig;
    openai?: OpenAIConfig;
    ollama?: OllamaConfig;
    openrouter?: OpenRouterConfig;
    gemini?: GeminiConfig;
    'azure-openai'?: AzureOpenAIConfig;
    bedrock?: BedrockConfig;
  };
  /** Global settings */
  global?: {
    /** Max total cost per hour in USD */
    maxCostPerHour?: number;
    /** Max total cost per day in USD */
    maxCostPerDay?: number;
    /** Enable cost tracking */
    enableCostTracking?: boolean;
    /** Enable metrics collection */
    enableMetrics?: boolean;
  };
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Generation request options
 */
export interface GenerateOptions {
  /** Override default model */
  model?: string;
  /** Override temperature */
  temperature?: number;
  /** Override max tokens */
  maxTokens?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Stop sequences */
  stopSequences?: string[];
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Force skip cache */
  skipCache?: boolean;
  /** Force specific provider */
  preferredProvider?: LLMProviderType;
  /** User identifier for tracking */
  userId?: string;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Embedding request options
 */
export interface EmbedOptions {
  /** Override default model */
  model?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Force skip cache */
  skipCache?: boolean;
}

/**
 * Completion request options (for code completion)
 */
export interface CompleteOptions {
  /** Override default model */
  model?: string;
  /** Override temperature (usually low for code) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences (e.g., newlines for single-line completion) */
  stopSequences?: string[];
  /** Force skip cache */
  skipCache?: boolean;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Abstract LLM provider interface
 * Implementations: ClaudeProvider, OpenAIProvider, OllamaProvider
 */
export interface LLMProvider {
  /** Provider type identifier */
  readonly type: LLMProviderType;

  /** Provider display name */
  readonly name: string;

  /** Check if provider is available and configured */
  isAvailable(): Promise<boolean>;

  /** Health check with latency measurement */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Generate text from a prompt or messages
   * @param input - String prompt or array of messages
   * @param options - Generation options
   */
  generate(
    input: string | Message[],
    options?: GenerateOptions
  ): Promise<LLMResponse>;

  /**
   * Generate embedding for text
   * @param text - Input text to embed
   * @param options - Embedding options
   */
  embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse>;

  /**
   * Complete a partial text (code completion style)
   * @param prompt - Partial text to complete
   * @param options - Completion options
   */
  complete(
    prompt: string,
    options?: CompleteOptions
  ): Promise<CompletionResponse>;

  /** Get current provider configuration */
  getConfig(): LLMConfig;

  /** Get supported models */
  getSupportedModels(): string[];

  /** Get cost per token for current model */
  getCostPerToken(): { input: number; output: number };

  /** Dispose provider resources */
  dispose(): Promise<void>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Whether provider is healthy */
  healthy: boolean;
  /** Latency in ms (if healthy) */
  latencyMs?: number;
  /** Error message (if unhealthy) */
  error?: string;
  /** Available models */
  models?: string[];
  /** Provider status details */
  details?: Record<string, unknown>;
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before half-open */
  resetTimeoutMs: number;
  /** Number of successes in half-open before closing */
  halfOpenSuccessThreshold: number;
  /** Time window for failure counting in ms */
  failureWindowMs: number;
  /** Whether to include timeouts as failures */
  includeTimeouts: boolean;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  /** Current state */
  state: CircuitBreakerState;
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successCount: number;
  /** Failed requests */
  failureCount: number;
  /** Requests rejected due to open circuit */
  rejectedCount: number;
  /** Last failure time */
  lastFailureTime?: Date;
  /** Last success time */
  lastSuccessTime?: Date;
  /** Time until circuit transitions (for open/half-open) */
  timeUntilTransitionMs?: number;
}

// ============================================================================
// Cost Tracking Types
// ============================================================================

/**
 * Cost tracking period
 */
export type CostPeriod = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'all';

/**
 * Cost summary for a period
 */
export interface CostSummary {
  /** Period type */
  period: CostPeriod;
  /** Start of period */
  periodStart: Date;
  /** End of period */
  periodEnd: Date;
  /** Total cost in USD */
  totalCost: number;
  /** Cost breakdown by provider */
  byProvider: Record<LLMProviderType, number>;
  /** Cost breakdown by model */
  byModel: Record<string, number>;
  /** Total tokens used */
  totalTokens: number;
  /** Total requests */
  totalRequests: number;
}

/**
 * Cost alert configuration
 */
export interface CostAlert {
  /** Alert threshold in USD */
  threshold: number;
  /** Period for threshold */
  period: CostPeriod;
  /** Callback when threshold reached */
  onThreshold: (summary: CostSummary) => void;
  /** Whether alert is currently active */
  active: boolean;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry structure
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Creation timestamp */
  createdAt: Date;
  /** Last access timestamp */
  lastAccessedAt: Date;
  /** Access count */
  accessCount: number;
  /** Time-to-live in ms (0 = no expiry) */
  ttlMs: number;
  /** Cache key hash */
  keyHash: string;
}

/**
 * Cache configuration
 */
export interface LLMCacheConfig {
  /** Maximum number of entries */
  maxSize: number;
  /** Default TTL in ms (0 = no expiry) */
  defaultTtlMs: number;
  /** Enable LRU eviction */
  enableLRU: boolean;
  /** Cache generation responses */
  cacheGenerations: boolean;
  /** Cache embedding responses */
  cacheEmbeddings: boolean;
  /** Cache completion responses */
  cacheCompletions: boolean;
}

/**
 * Cache statistics
 */
export interface LLMCacheStats {
  /** Current number of entries */
  size: number;
  /** Maximum size */
  maxSize: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Total evictions */
  evictions: number;
  /** Memory usage estimate in bytes */
  memoryUsageBytes: number;
}

// ============================================================================
// Provider Manager Types
// ============================================================================

/**
 * Provider selection result
 */
export interface ProviderSelection {
  /** Selected provider */
  provider: LLMProvider;
  /** Reason for selection */
  reason:
    | 'primary'
    | 'fallback'
    | 'load-balance'
    | 'cost-optimization'
    | 'latency-optimization';
  /** Selection metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Provider metrics
 */
export interface ProviderMetrics {
  /** Provider type */
  provider: LLMProviderType;
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successCount: number;
  /** Failed requests */
  failureCount: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** P95 latency in ms */
  p95LatencyMs: number;
  /** P99 latency in ms */
  p99LatencyMs: number;
  /** Total cost */
  totalCost: number;
  /** Total tokens */
  totalTokens: number;
  /** Circuit breaker state */
  circuitState: CircuitBreakerState;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * LLM-specific error codes
 */
export type LLMErrorCode =
  | 'API_KEY_INVALID'
  | 'API_KEY_MISSING'
  | 'RATE_LIMITED'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'CONTENT_FILTERED'
  | 'MODEL_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'CIRCUIT_OPEN'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'COST_LIMIT_EXCEEDED'
  | 'UNKNOWN';

/**
 * LLM error with rich context
 */
export interface LLMError extends Error {
  /** Error code */
  code: LLMErrorCode;
  /** Provider that caused the error */
  provider?: LLMProviderType;
  /** Model that caused the error */
  model?: string;
  /** Whether error is retryable */
  retryable: boolean;
  /** Suggested retry after time in ms */
  retryAfterMs?: number;
  /** Original error */
  cause?: Error;
}

/**
 * Create an LLM error
 */
export function createLLMError(
  message: string,
  code: LLMErrorCode,
  options?: {
    provider?: LLMProviderType;
    model?: string;
    retryable?: boolean;
    retryAfterMs?: number;
    cause?: Error;
  }
): LLMError {
  const error = new Error(message) as LLMError;
  error.name = 'LLMError';
  error.code = code;
  error.provider = options?.provider;
  error.model = options?.model;
  error.retryable = options?.retryable ?? false;
  error.retryAfterMs = options?.retryAfterMs;
  error.cause = options?.cause;
  return error;
}

/**
 * Type guard for LLM errors
 */
export function isLLMError(error: unknown): error is LLMError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as LLMError).code === 'string'
  );
}
