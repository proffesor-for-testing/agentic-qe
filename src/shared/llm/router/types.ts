/**
 * Agentic QE v3 - HybridRouter Type Definitions
 * ADR-043: Vendor-Independent LLM Support
 *
 * Comprehensive type system for the HybridRouter pattern:
 * - 4 routing modes (manual, rule-based, cost-optimized, performance-optimized)
 * - Model ID normalization layer with bidirectional mapping
 * - Prompt translation layer interface
 * - Integration with ProviderManager (ADR-011)
 * - Extended provider types (7+ providers)
 *
 * Design Principles:
 * - DDD alignment: Router is a domain service within the LLM bounded context
 * - Backward compatible: Extends ADR-011 without breaking changes
 * - Type-safe: Comprehensive type definitions for all routing scenarios
 * - Extensible: Easy to add new providers, models, and routing rules
 *
 * @see ADR-011 - LLM Provider System for QE (foundation)
 * @see ADR-043 - Vendor-Independent LLM Support (this extension)
 */

import {
  LLMProviderType,
  LLMProvider,
  Message,
  GenerateOptions,
  TokenUsage,
  CostInfo,
  HealthCheckResult,
  LLMConfig,
} from '../interfaces';

// ============================================================================
// Extended Provider Types (ADR-043 additions to ADR-011)
// ============================================================================

/**
 * Extended provider types including new ADR-043 providers
 * Extends LLMProviderType from ADR-011: 'claude' | 'openai' | 'ollama'
 */
export type ExtendedProviderType =
  | LLMProviderType           // ADR-011: 'claude' | 'openai' | 'ollama'
  | 'openrouter'              // 100+ models via unified API
  | 'gemini'                  // Google Gemini Pro/Ultra/Flash
  | 'azure-openai'            // Enterprise Azure deployment
  | 'bedrock'                 // AWS managed Claude/other models
  | 'onnx';                   // Local ONNX runtime (privacy/zero-cost)

/**
 * All supported provider types as a const array for iteration
 */
export const ALL_PROVIDER_TYPES: readonly ExtendedProviderType[] = [
  'claude',
  'openai',
  'ollama',
  'openrouter',
  'gemini',
  'azure-openai',
  'bedrock',
  'onnx',
] as const;

/**
 * Provider capability flags (extends ADR-011 LLMProvider)
 * Used for capability-based routing decisions
 */
export interface ProviderCapabilities {
  /** Supports streaming responses */
  readonly supportsStreaming: boolean;
  /** Supports function/tool calling */
  readonly supportsTools: boolean;
  /** Supports Model Context Protocol */
  readonly supportsMCP: boolean;
  /** Supports vision/image inputs */
  readonly supportsVision: boolean;
  /** Supports extended thinking/reasoning */
  readonly supportsExtendedThinking: boolean;
  /** Supports JSON mode / structured outputs */
  readonly supportsJsonMode: boolean;
  /** Maximum context window size in tokens */
  readonly maxContextTokens: number;
  /** Maximum output tokens supported */
  readonly maxOutputTokens: number;
  /** Cost tier for quick cost comparisons */
  readonly costTier: 'free' | 'low' | 'medium' | 'high' | 'premium';
  /** Average latency tier for performance routing */
  readonly latencyTier: 'fast' | 'medium' | 'slow';
  /** Whether provider requires internet (false = local/offline capable) */
  readonly requiresNetwork: boolean;
}

/**
 * Default capabilities for unknown providers
 */
export const DEFAULT_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: true,
  supportsTools: false,
  supportsMCP: false,
  supportsVision: false,
  supportsExtendedThinking: false,
  supportsJsonMode: false,
  maxContextTokens: 4096,
  maxOutputTokens: 4096,
  costTier: 'medium',
  latencyTier: 'medium',
  requiresNetwork: true,
};

/**
 * Extended LLM provider interface with capability flags
 * Extends the base LLMProvider from ADR-011
 */
export interface ExtendedLLMProvider extends LLMProvider {
  /** Extended provider type */
  readonly extendedType: ExtendedProviderType;
  /** Provider capabilities for routing */
  readonly capabilities: ProviderCapabilities;
  /** Validate that provider supports required features */
  validateCapabilities(features: RequiredFeature[]): boolean;
}

/**
 * Required features for capability-based routing
 */
export type RequiredFeature =
  | 'streaming'
  | 'tools'
  | 'mcp'
  | 'vision'
  | 'extended-thinking'
  | 'json-mode'
  | 'long-context'
  | 'local-only';

// ============================================================================
// Model ID Normalization Layer
// ============================================================================

/**
 * Model family groupings for intelligent routing
 */
export type ModelFamily =
  | 'claude'     // Anthropic Claude models
  | 'gpt'        // OpenAI GPT models
  | 'gemini'     // Google Gemini models
  | 'llama'      // Meta LLaMA models
  | 'mistral'    // Mistral AI models
  | 'phi'        // Microsoft Phi models
  | 'qwen'       // Alibaba Qwen models
  | 'deepseek'   // DeepSeek models
  | 'other';     // Other/custom models

/**
 * Model capability tiers for task-appropriate routing
 */
export type ModelTier =
  | 'flagship'    // Most capable (Claude Opus, GPT-4, Gemini Ultra)
  | 'advanced'    // High capability (Claude Sonnet, GPT-4o)
  | 'standard'    // Good capability (Haiku, GPT-4o-mini)
  | 'efficient'   // Fast/cheap (Phi-4, small models)
  | 'embedding';  // Embedding-only models

/**
 * Provider-specific model identifier mapping
 */
export interface ModelMapping {
  /** Canonical model ID (vendor-neutral) */
  readonly canonicalId: string;
  /** Canonical display name */
  readonly canonicalName: string;
  /** Provider-specific model IDs */
  readonly providerIds: Partial<Record<ExtendedProviderType, string>>;
  /** Model capabilities */
  readonly capabilities: Partial<ProviderCapabilities>;
  /** Model tier */
  readonly tier: ModelTier;
  /** Model family */
  readonly family: ModelFamily;
  /** Cost per 1M input tokens (USD) */
  readonly inputCostPer1M?: number;
  /** Cost per 1M output tokens (USD) */
  readonly outputCostPer1M?: number;
  /** Whether model is deprecated */
  readonly deprecated?: boolean;
  /** Replacement model if deprecated */
  readonly replacementId?: string;
}

/**
 * Model registry interface for bidirectional model ID mapping
 */
export interface ModelRegistry {
  /** All registered model mappings indexed by canonical ID */
  readonly models: ReadonlyMap<string, ModelMapping>;

  /** Get provider-specific model ID from canonical ID */
  toProviderModel(canonicalId: string, provider: ExtendedProviderType): string | undefined;

  /** Get canonical model ID from provider-specific ID */
  toCanonicalModel(providerModelId: string, provider: ExtendedProviderType): string | undefined;

  /** Get all models available on a specific provider */
  getModelsForProvider(provider: ExtendedProviderType): ModelMapping[];

  /** Get models by tier */
  getModelsByTier(tier: ModelTier): ModelMapping[];

  /** Get models by family */
  getModelsByFamily(family: ModelFamily): ModelMapping[];

  /** Register a new model mapping */
  register(mapping: ModelMapping): void;

  /** Check if model is available on provider */
  isAvailableOn(canonicalId: string, provider: ExtendedProviderType): boolean;

  /** Get model mapping by canonical ID */
  get(canonicalId: string): ModelMapping | undefined;
}

// ============================================================================
// Prompt Translation Layer
// ============================================================================

/**
 * Message format variations across providers
 */
export type MessageFormat = 'anthropic' | 'openai' | 'gemini' | 'ollama';

/**
 * System prompt handling strategy
 */
export type SystemPromptStrategy =
  | 'native'           // Provider supports system prompt natively
  | 'first-message'    // Prepend to first user message
  | 'interleaved'      // Interleave in conversation
  | 'unsupported';     // Provider doesn't support system prompts

/**
 * Tool schema format variations
 */
export type ToolSchemaFormat = 'anthropic' | 'openai' | 'gemini' | 'custom';

/**
 * Translated messages for a target provider
 */
export interface TranslatedMessages {
  /** Translated message array */
  readonly messages: Message[];
  /** System prompt (if separated) */
  readonly systemPrompt?: string;
  /** System prompt handling notes */
  readonly systemPromptHandling: SystemPromptStrategy;
  /** Any warnings about translation */
  readonly warnings?: string[];
}

/**
 * Tool definition (unified format)
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly required?: string[];
}

/**
 * Translated tool definitions
 */
export interface TranslatedTools {
  /** Translated tool definitions */
  readonly tools: unknown[]; // Provider-specific format
  /** Target format */
  readonly format: ToolSchemaFormat;
  /** Any features lost in translation */
  readonly lostFeatures?: string[];
}

/**
 * Translation options
 */
export interface TranslationOptions {
  /** Source message format */
  readonly sourceFormat?: MessageFormat;
  /** Whether to preserve metadata */
  readonly preserveMetadata?: boolean;
  /** Whether to validate after translation */
  readonly validate?: boolean;
}

/**
 * Prompt translator interface for cross-provider message translation
 */
export interface PromptTranslator {
  /**
   * Translate messages from source to target provider format
   */
  translateMessages(
    messages: Message[],
    targetProvider: ExtendedProviderType,
    options?: TranslationOptions
  ): TranslatedMessages;

  /**
   * Handle system prompt for target provider
   */
  handleSystemPrompt(
    systemPrompt: string,
    targetProvider: ExtendedProviderType
  ): { strategy: SystemPromptStrategy; content: string };

  /**
   * Translate tool definitions to target provider format
   */
  translateTools(
    tools: ToolDefinition[],
    targetProvider: ExtendedProviderType
  ): TranslatedTools;

  /**
   * Get supported source formats
   */
  getSupportedSourceFormats(): MessageFormat[];

  /**
   * Get supported target providers
   */
  getSupportedTargetProviders(): ExtendedProviderType[];
}

// ============================================================================
// Routing Mode Types
// ============================================================================

/**
 * Available routing modes for provider selection
 *
 * - manual: Explicit provider selection via preferredProvider option
 * - rule-based: Rule engine evaluates conditions to select provider
 * - cost-optimized: Select provider with lowest cost for the request
 * - performance-optimized: Select provider with best latency/throughput
 */
export type RoutingMode =
  | 'manual'
  | 'rule-based'
  | 'cost-optimized'
  | 'performance-optimized';

/**
 * Task complexity levels for routing decisions
 */
export type TaskComplexity = 'trivial' | 'low' | 'medium' | 'high' | 'expert';

// ============================================================================
// Routing Rule Types
// ============================================================================

/**
 * Condition for a routing rule
 * All specified conditions must match (AND logic)
 */
export interface RuleCondition {
  /** Route specific agent types (e.g., ['security-auditor', 'test-generator']) */
  agentType?: string[];

  /** Route requests that require tool/function calling */
  requiresTools?: boolean;

  /** Route based on task complexity assessment */
  complexity?: TaskComplexity | TaskComplexity[];

  /** Force local provider (e.g., ONNX, Ollama) */
  localOnly?: boolean;

  /** Route to advanced reasoning models */
  requiresReasoning?: boolean;

  /** Route based on estimated token count ranges */
  tokenRange?: {
    min?: number;
    max?: number;
  };

  /** Route based on specific feature requirements (ADR-043) */
  requiredFeatures?: RequiredFeature[];

  /** Route based on specific capabilities required (legacy) */
  requiredCapabilities?: string[];

  /** Minimum context size required (tokens) */
  minContextSize?: number;

  /** Pattern match on task description */
  taskPattern?: RegExp | string;

  /** Custom condition function for advanced logic */
  custom?: (params: ChatParams) => boolean;
}

/**
 * Action to take when a rule matches
 */
export interface RuleAction {
  /** Target provider type (supports extended providers from ADR-043) */
  provider: ExtendedProviderType;

  /** Specific model to use (canonical ID or provider-specific) */
  model: string;

  /** Override temperature setting */
  temperature?: number;

  /** Override max tokens */
  maxTokens?: number;

  /** Priority for this action (higher = preferred) */
  priority?: number;

  /** Additional generation options */
  options?: Partial<GenerateOptions>;
}

/**
 * Complete routing rule definition
 */
export interface RoutingRule {
  /** Unique identifier for the rule */
  id: string;

  /** Human-readable name */
  name: string;

  /** Rule description */
  description?: string;

  /** Conditions that trigger this rule */
  condition: RuleCondition;

  /** Action to take when conditions match */
  action: RuleAction;

  /** Whether rule is enabled */
  enabled: boolean;

  /** Rule priority (higher = evaluated first) */
  priority: number;
}

// ============================================================================
// Routing Decision Types
// ============================================================================

/**
 * Reason why a provider was selected
 */
export type SelectionReason =
  | 'manual'
  | 'rule-match'
  | 'cost-optimization'
  | 'performance-optimization'
  | 'capability-match'
  | 'fallback'
  | 'circuit-breaker'
  | 'rate-limit-avoidance'
  | 'load-balance'
  | 'default';

/**
 * Cost estimate for a request
 */
export interface CostEstimate {
  /** Estimated input tokens */
  readonly inputTokens: number;
  /** Estimated output tokens */
  readonly outputTokens: number;
  /** Estimated total cost in USD */
  readonly totalCostUsd: number;
  /** Cost per 1M input tokens */
  readonly inputCostPer1M: number;
  /** Cost per 1M output tokens */
  readonly outputCostPer1M: number;
}

/**
 * Alternative provider that was considered
 */
export interface AlternativeProvider {
  readonly provider: ExtendedProviderType;
  readonly model: string;
  readonly reason: string;
  readonly estimatedCost?: number;
  readonly estimatedLatencyMs?: number;
  readonly excluded: boolean;
  readonly exclusionReason?: string;
}

/**
 * Detailed routing trace for debugging
 */
export interface RoutingTrace {
  /** All rules evaluated */
  readonly rulesEvaluated: Array<{
    ruleId: string;
    ruleName: string;
    matched: boolean;
    reason?: string;
  }>;
  /** Providers considered */
  readonly providersConsidered: ExtendedProviderType[];
  /** Providers excluded and why */
  readonly providersExcluded: Array<{
    provider: ExtendedProviderType;
    reason: string;
  }>;
  /** Feature requirements checked */
  readonly featuresChecked: RequiredFeature[];
  /** Final selection reasoning */
  readonly selectionReasoning: string;
}

/**
 * Result of a routing decision
 */
export interface RoutingDecision {
  /** Selected provider instance */
  provider: LLMProvider;

  /** Provider type (extended for ADR-043) */
  providerType: ExtendedProviderType;

  /** Model to use (canonical ID) */
  model: string;

  /** Provider-specific model ID (translated from canonical) */
  providerModelId: string;

  /** Reason for selection */
  reason: SelectionReason;

  /** Rule that triggered this decision (if rule-based) */
  matchedRule?: RoutingRule;

  /** Confidence score for this decision (0-1) */
  confidence: number;

  /** Decision metadata */
  metadata: {
    /** Time taken to make decision in ms */
    decisionTimeMs: number;
    /** Decision timestamp */
    timestamp: Date;
    /** Number of rules evaluated */
    rulesEvaluated?: number;
    /** Alternative providers considered */
    alternativesConsidered?: AlternativeProvider[];
    /** Estimated cost for this request */
    estimatedCost?: CostEstimate;
    /** Estimated latency if performance-optimized */
    estimatedLatencyMs?: number;
    /** Correlation ID for tracing */
    correlationId?: string;
  };

  /** Detailed routing trace (for debugging) */
  trace?: RoutingTrace;
}

// ============================================================================
// Fallback Chain Types
// ============================================================================

/**
 * Fallback behavior configuration
 */
export interface FallbackBehavior {
  /** Maximum number of fallback attempts */
  maxAttempts: number;

  /** Delay between fallback attempts in ms */
  delayMs: number;

  /** Whether to retry same provider with different model */
  trySameProviderAlternateModel: boolean;

  /** Skip providers with open circuit breakers */
  skipOpenCircuits: boolean;

  /** Error types that should trigger fallback */
  retryableErrors: string[];
}

/**
 * Skip conditions for a fallback entry
 */
export interface FallbackSkipCondition {
  /** Error codes that trigger skip */
  readonly errorCodes?: string[];
  /** HTTP status codes that trigger skip */
  readonly httpStatuses?: number[];
  /** Whether to skip if rate limited */
  readonly skipIfRateLimited?: boolean;
  /** Whether to skip if circuit is open */
  readonly skipIfCircuitOpen?: boolean;
}

/**
 * Entry in the fallback chain
 */
export interface FallbackChainEntry {
  /** Provider type (supports extended providers) */
  provider: ExtendedProviderType;

  /** Models to try in order (canonical IDs) */
  models: string[];

  /** Whether this entry is enabled */
  enabled: boolean;

  /** Priority (higher = tried first) */
  priority: number;

  /** Maximum attempts for this entry */
  maxAttempts?: number;

  /** Timeout for this entry in ms */
  timeoutMs?: number;

  /** Conditions that would skip this entry */
  skipConditions?: FallbackSkipCondition[];
}

/**
 * Complete fallback chain configuration
 */
export interface FallbackChain {
  /** Chain identifier */
  readonly id: string;
  /** Ordered list of fallback entries */
  readonly entries: FallbackChainEntry[];
  /** Maximum retries across the chain */
  readonly maxRetries: number;
  /** Delay between retries in ms */
  readonly retryDelayMs: number;
  /** Exponential backoff multiplier */
  readonly backoffMultiplier: number;
  /** Maximum delay between retries */
  readonly maxDelayMs: number;
}

/**
 * Legacy fallback chain type (array format for backwards compatibility)
 */
export type FallbackChainEntries = FallbackChainEntry[];

// ============================================================================
// Router Configuration Types
// ============================================================================

/**
 * Per-provider configuration
 */
export interface ProviderConfig {
  /** Whether provider is enabled */
  readonly enabled: boolean;
  /** API key (or reference to secret) */
  readonly apiKey?: string;
  /** Base URL override */
  readonly baseUrl?: string;
  /** Default model for this provider */
  readonly defaultModel?: string;
  /** Request timeout in ms */
  readonly timeoutMs?: number;
  /** Maximum retries */
  readonly maxRetries?: number;
  /** Rate limiting configuration */
  readonly rateLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  /** Provider-specific options */
  readonly options?: Record<string, unknown>;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Whether metrics are enabled */
  readonly enabled: boolean;
  /** Metrics collection interval in ms */
  readonly collectionIntervalMs: number;
  /** Metrics retention period in ms */
  readonly retentionMs: number;
  /** Whether to track per-request metrics */
  readonly trackPerRequest: boolean;
  /** Whether to export metrics */
  readonly export?: {
    enabled: boolean;
    endpoint?: string;
    format?: 'prometheus' | 'json';
  };
}

/**
 * Audit logging configuration
 */
export interface AuditConfig {
  /** Whether audit logging is enabled */
  readonly enabled: boolean;
  /** Maximum audit entries to retain */
  readonly maxEntries: number;
  /** Whether to log request content */
  readonly logContent: boolean;
  /** Whether to log response content */
  readonly logResponse: boolean;
  /** Audit log export configuration */
  readonly export?: {
    enabled: boolean;
    destination?: string;
  };
}

/**
 * Router decision cache configuration
 */
export interface RouterCacheConfig {
  /** Whether caching is enabled */
  readonly enabled: boolean;
  /** Cache TTL in ms */
  readonly ttlMs: number;
  /** Maximum cache entries */
  readonly maxEntries: number;
  /** Cache key strategy */
  readonly keyStrategy: 'full-context' | 'agent-domain' | 'features-only';
}

/**
 * HybridRouter configuration
 */
export interface RouterConfig {
  /** Active routing mode */
  mode: RoutingMode;

  /** Custom routing rules */
  rules: RoutingRule[];

  /** Default provider when no rules match (supports extended providers) */
  defaultProvider: ExtendedProviderType;

  /** Default model for the default provider (canonical ID) */
  defaultModel: string;

  /** Fallback chain configuration */
  fallbackChain: FallbackChain;

  /** Fallback behavior settings */
  fallbackBehavior: FallbackBehavior;

  /** Provider configurations (ADR-043) */
  providers?: Partial<Record<ExtendedProviderType, ProviderConfig>>;

  /** Enable routing decision metrics collection */
  enableMetrics: boolean;

  /** Metrics configuration (ADR-043) */
  metricsConfig?: MetricsConfig;

  /** Maximum decision time before defaulting in ms */
  maxDecisionTimeMs: number;

  /** Whether to cache routing decisions */
  cacheDecisions: boolean;

  /** Decision cache TTL in ms */
  decisionCacheTtlMs: number;

  /** Decision cache configuration (ADR-043) */
  cacheConfig?: RouterCacheConfig;

  /** Audit logging configuration (ADR-043) */
  auditConfig?: AuditConfig;
}

// ============================================================================
// Chat Types (for Router Interface)
// ============================================================================

/**
 * Routing context provided with chat requests
 */
export interface RoutingContext {
  /** Agent type making the request */
  readonly agentType?: string;
  /** Domain of the requesting agent */
  readonly domain?: string;
  /** Task description for pattern matching */
  readonly taskDescription?: string;
  /** Estimated task complexity */
  readonly complexity?: TaskComplexity;
  /** Required features for this request */
  readonly requiredFeatures?: RequiredFeature[];
  /** Priority level */
  readonly priority?: 'p0' | 'p1' | 'p2' | 'p3';
  /** Whether local-only providers are required */
  readonly localOnly?: boolean;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Chat request parameters
 */
export interface ChatParams {
  /** Messages for the conversation */
  messages: Message[];

  /** System prompt */
  systemPrompt?: string;

  /** Agent type making the request */
  agentType?: string;

  /** Task complexity hint */
  complexity?: TaskComplexity;

  /** Specific model to use (for manual mode) - canonical or provider-specific ID */
  model?: string;

  /** Preferred provider (for manual mode) - supports extended providers */
  preferredProvider?: ExtendedProviderType;

  /** Required capabilities (legacy) */
  requiredCapabilities?: string[];

  /** Required features (ADR-043) */
  requiredFeatures?: RequiredFeature[];

  /** Whether request requires tools */
  requiresTools?: boolean;

  /** Temperature override */
  temperature?: number;

  /** Max tokens override */
  maxTokens?: number;

  /** Request timeout in ms */
  timeoutMs?: number;

  /** Skip response cache */
  skipCache?: boolean;

  /** Request metadata */
  metadata?: Record<string, unknown>;

  /** Extended routing context (ADR-043) */
  routingContext?: RoutingContext;
}

/**
 * Chat response
 */
export interface ChatResponse {
  /** Generated content */
  content: string;

  /** Model that generated the response (canonical ID) */
  model: string;

  /** Provider-specific model ID */
  providerModelId: string;

  /** Provider that handled the request (extended) */
  provider: ExtendedProviderType;

  /** Token usage information */
  usage: TokenUsage;

  /** Cost information */
  cost: CostInfo;

  /** Response latency in ms */
  latencyMs: number;

  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';

  /** Whether response was from cache */
  cached: boolean;

  /** Unique request ID */
  requestId: string;

  /** Routing decision that led to this response */
  routingDecision: RoutingDecision;
}

/**
 * Streaming chunk
 */
export interface StreamChunk {
  /** Chunk type */
  type: 'content' | 'thinking' | 'tool_use' | 'error' | 'done';

  /** Content delta */
  delta?: string;

  /** Accumulated content */
  accumulated?: string;

  /** Whether this is the final chunk */
  done: boolean;

  /** Accumulated token count */
  tokenCount?: number;

  /** Model generating the stream */
  model: string;

  /** Provider handling the stream (extended) */
  provider: ExtendedProviderType;

  /** Token usage (for done chunk) */
  usage?: TokenUsage;

  /** Error information (for error chunk) */
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Routing metrics for a specific provider
 */
export interface ProviderRoutingMetrics {
  /** Provider type (extended) */
  provider: ExtendedProviderType;

  /** Total times this provider was selected */
  selectionCount: number;

  /** Times selected due to rule match */
  ruleMatchCount: number;

  /** Times selected as fallback */
  fallbackCount: number;

  /** Average decision time when selected in ms */
  avgDecisionTimeMs: number;

  /** Success rate when selected (0-1) */
  successRate: number;

  /** Average response latency in ms */
  avgLatencyMs: number;

  /** P95 latency in ms */
  p95LatencyMs: number;

  /** P99 latency in ms */
  p99LatencyMs: number;

  /** Total cost when using this provider */
  totalCost: number;

  /** Total tokens processed */
  totalTokens: number;

  /** Circuit breaker state */
  circuitState: 'closed' | 'open' | 'half-open';

  /** Rate limit status */
  rateLimitStatus?: {
    limited: boolean;
    resetAt?: Date;
    remaining?: number;
  };
}

/**
 * Routing decision audit log entry
 */
export interface RoutingAuditEntry {
  /** Entry ID */
  readonly id: string;
  /** Timestamp */
  readonly timestamp: Date;
  /** Routing context */
  readonly context: Partial<RoutingContext>;
  /** Routing decision */
  readonly decision: Omit<RoutingDecision, 'provider'> & { providerType: ExtendedProviderType };
  /** Request outcome (if known) */
  readonly outcome?: {
    success: boolean;
    latencyMs: number;
    tokenUsage?: TokenUsage;
    cost?: CostInfo;
    error?: string;
  };
}

/**
 * Overall routing metrics
 */
export interface RouterMetrics {
  /** Metrics per provider (extended) */
  byProvider: Partial<Record<ExtendedProviderType, ProviderRoutingMetrics>>;

  /** Total routing decisions made */
  totalDecisions: number;

  /** Decisions by routing mode */
  decisionsByMode: Record<RoutingMode, number>;

  /** Average decision time across all providers in ms */
  avgDecisionTimeMs: number;

  /** P95 decision time in ms */
  p95DecisionTimeMs: number;

  /** P99 decision time in ms */
  p99DecisionTimeMs: number;

  /** Fallback rate (0-1) */
  fallbackRate: number;

  /** Rule match rate (0-1) */
  ruleMatchRate: number;

  /** Estimated cost savings from optimization (USD) */
  estimatedCostSavings: number;

  /** Rule evaluation statistics */
  ruleStats: {
    /** Total rules evaluated */
    totalEvaluated: number;
    /** Rules that matched */
    matched: number;
    /** Average rules evaluated per decision */
    avgRulesPerDecision: number;
  };

  /** Decision cache statistics */
  cacheStats: {
    /** Cache hit count */
    hits: number;
    /** Cache miss count */
    misses: number;
    /** Hit rate (0-1) */
    hitRate: number;
  };

  /** Metrics collection period */
  period: {
    start: Date;
    end: Date;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default fallback behavior settings
 */
export const DEFAULT_FALLBACK_BEHAVIOR: FallbackBehavior = {
  maxAttempts: 3,
  delayMs: 100,
  trySameProviderAlternateModel: true,
  skipOpenCircuits: true,
  retryableErrors: [
    'RATE_LIMITED',
    'TIMEOUT',
    'NETWORK_ERROR',
    'PROVIDER_UNAVAILABLE',
  ],
};

/**
 * Default fallback chain entries (for backwards compatibility)
 */
export const DEFAULT_FALLBACK_CHAIN_ENTRIES: FallbackChainEntry[] = [
  {
    provider: 'claude',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    enabled: true,
    priority: 100,
    maxAttempts: 2,
    timeoutMs: 30000,
  },
  {
    provider: 'openai',
    models: ['gpt-4o', 'gpt-4o-mini'],
    enabled: true,
    priority: 90,
    maxAttempts: 2,
    timeoutMs: 30000,
  },
  {
    provider: 'openrouter',
    models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o'],
    enabled: true,
    priority: 85,
    maxAttempts: 2,
    timeoutMs: 30000,
  },
  {
    provider: 'ollama',
    models: ['llama3.1', 'mistral'],
    enabled: true,
    priority: 80,
    maxAttempts: 2,
    timeoutMs: 60000,
  },
  {
    provider: 'onnx',
    models: ['phi-4', 'all-MiniLM-L6-v2'],
    enabled: true,
    priority: 70,
    maxAttempts: 1,
    timeoutMs: 120000,
  },
];

/**
 * Default fallback chain configuration
 */
export const DEFAULT_FALLBACK_CHAIN: FallbackChain = {
  id: 'default-fallback-chain',
  entries: DEFAULT_FALLBACK_CHAIN_ENTRIES,
  maxRetries: 3,
  retryDelayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
};

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  mode: 'rule-based',
  rules: [],
  defaultProvider: 'claude',
  defaultModel: 'claude-sonnet-4-20250514',
  fallbackChain: DEFAULT_FALLBACK_CHAIN,
  fallbackBehavior: DEFAULT_FALLBACK_BEHAVIOR,
  providers: {
    claude: { enabled: true, defaultModel: 'claude-sonnet-4-20250514' },
    openai: { enabled: true, defaultModel: 'gpt-4o' },
    ollama: { enabled: true, defaultModel: 'llama3.1' },
    openrouter: { enabled: true, defaultModel: 'anthropic/claude-sonnet-4' },
    gemini: { enabled: false, defaultModel: 'gemini-pro' },
    'azure-openai': { enabled: false },
    bedrock: { enabled: false },
    onnx: { enabled: true, defaultModel: 'phi-4' },
  },
  enableMetrics: true,
  metricsConfig: {
    enabled: true,
    collectionIntervalMs: 60000,
    retentionMs: 86400000, // 24 hours
    trackPerRequest: true,
  },
  maxDecisionTimeMs: 10,
  cacheDecisions: true,
  decisionCacheTtlMs: 60000, // 1 minute
  cacheConfig: {
    enabled: true,
    ttlMs: 60000,
    maxEntries: 1000,
    keyStrategy: 'agent-domain',
  },
  auditConfig: {
    enabled: true,
    maxEntries: 10000,
    logContent: false,
    logResponse: false,
  },
};

// ============================================================================
// HybridRouter Interface
// ============================================================================

/**
 * HybridRouter interface - the main entry point for ADR-043
 * Extends ProviderManager capabilities with intelligent routing
 *
 * This interface defines the contract for the HybridRouter class that will:
 * - Route requests to optimal providers based on 4 routing modes
 * - Handle fallback chains with automatic retry
 * - Track metrics for routing decisions
 * - Support model ID normalization across providers
 * - Translate prompts between provider formats
 */
export interface HybridRouter {
  /** Current routing mode */
  readonly routingMode: RoutingMode;

  /** Fallback chain configuration */
  readonly fallbackChain: FallbackChain;

  /** Model registry for ID normalization */
  readonly modelRegistry: ModelRegistry;

  /** Prompt translator for cross-provider compatibility */
  readonly promptTranslator: PromptTranslator;

  /**
   * Select optimal provider for a request
   * Core routing function that evaluates rules and selects best provider
   */
  selectProvider(context: RoutingContext): Promise<RoutingDecision>;

  /**
   * Generate response using intelligent routing
   * Main entry point for LLM requests with automatic routing
   */
  chat(params: ChatParams): Promise<ChatResponse>;

  /**
   * Stream response using intelligent routing
   * Streaming variant of chat() with same routing logic
   */
  stream(params: ChatParams): AsyncGenerator<StreamChunk, void, undefined>;

  /**
   * Set routing mode
   */
  setRoutingMode(mode: RoutingMode): void;

  /**
   * Add a routing rule
   */
  addRule(rule: RoutingRule): void;

  /**
   * Remove a routing rule by ID
   */
  removeRule(ruleId: string): boolean;

  /**
   * Get all routing rules
   */
  getRules(): RoutingRule[];

  /**
   * Update fallback chain
   */
  setFallbackChain(chain: FallbackChain): void;

  /**
   * Get router metrics
   */
  getMetrics(): RouterMetrics;

  /**
   * Get provider-specific routing metrics
   */
  getProviderMetrics(provider?: ExtendedProviderType): ProviderRoutingMetrics | ProviderRoutingMetrics[];

  /**
   * Health check all providers
   */
  healthCheck(): Promise<Record<ExtendedProviderType, HealthCheckResult>>;

  /**
   * Get available providers (healthy + circuit closed)
   */
  getAvailableProviders(): ExtendedProviderType[];

  /**
   * Get a specific provider instance
   */
  getProvider(type: ExtendedProviderType): LLMProvider | undefined;

  /**
   * Explain a routing decision (for debugging)
   */
  explainDecision(context: RoutingContext): Promise<RoutingTrace>;

  /**
   * Get audit log entries
   */
  getAuditLog(options?: {
    limit?: number;
    since?: Date;
    provider?: ExtendedProviderType;
  }): RoutingAuditEntry[];

  /**
   * Clear audit log
   */
  clearAuditLog(): void;

  /**
   * Reset metrics
   */
  resetMetrics(): void;

  /**
   * Dispose router and release resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Factory and Builder Types
// ============================================================================

/**
 * HybridRouter factory configuration
 */
export interface HybridRouterFactoryConfig {
  /** Base router configuration */
  readonly config: Partial<RouterConfig>;
  /** Pre-built provider instances (optional) */
  readonly providers?: Map<ExtendedProviderType, ExtendedLLMProvider>;
  /** Custom model registry (optional) */
  readonly modelRegistry?: ModelRegistry;
  /** Custom prompt translator (optional) */
  readonly promptTranslator?: PromptTranslator;
}

/**
 * Builder pattern for HybridRouter configuration
 */
export interface HybridRouterBuilder {
  /** Set default routing mode */
  withRoutingMode(mode: RoutingMode): HybridRouterBuilder;

  /** Add a provider configuration */
  withProvider(
    type: ExtendedProviderType,
    config: ProviderConfig
  ): HybridRouterBuilder;

  /** Add a routing rule */
  withRule(rule: RoutingRule): HybridRouterBuilder;

  /** Add multiple routing rules */
  withRules(rules: RoutingRule[]): HybridRouterBuilder;

  /** Set fallback chain */
  withFallbackChain(chain: FallbackChain): HybridRouterBuilder;

  /** Set default provider */
  withDefaultProvider(provider: ExtendedProviderType, model: string): HybridRouterBuilder;

  /** Configure metrics */
  withMetrics(config: MetricsConfig): HybridRouterBuilder;

  /** Configure audit logging */
  withAudit(config: AuditConfig): HybridRouterBuilder;

  /** Configure caching */
  withCache(config: RouterCacheConfig): HybridRouterBuilder;

  /** Set custom model registry */
  withModelRegistry(registry: ModelRegistry): HybridRouterBuilder;

  /** Set custom prompt translator */
  withPromptTranslator(translator: PromptTranslator): HybridRouterBuilder;

  /** Get current configuration */
  getConfig(): RouterConfig;

  /** Build the HybridRouter instance */
  build(): Promise<HybridRouter>;
}

// ============================================================================
// QE-Specific Types and Presets
// ============================================================================

/**
 * QE agent type for routing (extended agent types)
 */
export type QEAgentType =
  | 'v3-qe-test-generator'
  | 'v3-qe-test-executor'
  | 'v3-qe-coverage-analyzer'
  | 'v3-qe-quality-assessor'
  | 'v3-qe-defect-predictor'
  | 'v3-qe-requirements-validator'
  | 'v3-qe-code-analyzer'
  | 'v3-qe-security-scanner'
  | 'v3-qe-contract-tester'
  | 'v3-qe-visual-tester'
  | 'v3-qe-chaos-engineer'
  | 'v3-qe-learning-optimizer'
  | 'security-auditor'
  | 'security-architect'
  | 'code-analyzer'
  | 'tester'
  | 'reviewer';

/**
 * Configuration for creating a QE-optimized router
 */
export interface QERouterConfig {
  /** Enable security-first routing */
  readonly securityFirst?: boolean;
  /** Enable cost optimization */
  readonly optimizeCost?: boolean;
  /** Maximum cost per day in USD */
  readonly maxDailyCost?: number;
  /** Prefer local models when possible */
  readonly preferLocal?: boolean;
  /** Default provider */
  readonly defaultProvider?: ExtendedProviderType;
  /** Default model */
  readonly defaultModel?: string;
  /** Include default QE routing rules */
  readonly includeDefaultRules?: boolean;
}

/**
 * Quick factory type for common use cases
 */
export type RouterPreset =
  | 'qe-default'           // Balanced QE routing
  | 'qe-security'          // Security-focused
  | 'qe-cost-optimized'    // Cost-focused
  | 'qe-performance'       // Performance-focused
  | 'development'          // Local development (Ollama/ONNX)
  | 'enterprise';          // Enterprise (Azure/Bedrock)

// ============================================================================
// Default Model Mappings (ADR-043 Milestone 2)
// ============================================================================

/**
 * Default model mappings for common models across providers
 * This enables vendor-neutral model references
 */
export const DEFAULT_MODEL_MAPPINGS: ModelMapping[] = [
  // Claude Opus 4.5 (flagship)
  {
    canonicalId: 'claude-opus-4.5',
    canonicalName: 'Claude Opus 4.5',
    providerIds: {
      claude: 'claude-opus-4-5-20251101',
      openrouter: 'anthropic/claude-opus-4.5',
      bedrock: 'anthropic.claude-opus-4-5-v1:0',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      supportsExtendedThinking: true,
      supportsJsonMode: true,
      maxContextTokens: 200000,
      maxOutputTokens: 32000,
    },
    tier: 'flagship',
    family: 'claude',
    inputCostPer1M: 15,
    outputCostPer1M: 75,
  },
  // Claude Sonnet 4 (advanced)
  {
    canonicalId: 'claude-sonnet-4',
    canonicalName: 'Claude Sonnet 4',
    providerIds: {
      claude: 'claude-sonnet-4-20250514',
      openrouter: 'anthropic/claude-sonnet-4',
      bedrock: 'anthropic.claude-sonnet-4-v1:0',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      supportsExtendedThinking: true,
      supportsJsonMode: true,
      maxContextTokens: 200000,
      maxOutputTokens: 64000,
    },
    tier: 'advanced',
    family: 'claude',
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  // Claude Haiku 3.5 (standard)
  {
    canonicalId: 'claude-haiku-3.5',
    canonicalName: 'Claude Haiku 3.5',
    providerIds: {
      claude: 'claude-3-5-haiku-20241022',
      openrouter: 'anthropic/claude-3.5-haiku',
      bedrock: 'anthropic.claude-3-5-haiku-v1:0',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      supportsExtendedThinking: false,
      supportsJsonMode: true,
      maxContextTokens: 200000,
      maxOutputTokens: 8192,
    },
    tier: 'standard',
    family: 'claude',
    inputCostPer1M: 0.8,
    outputCostPer1M: 4,
  },
  // GPT-4o (advanced)
  {
    canonicalId: 'gpt-4o',
    canonicalName: 'GPT-4o',
    providerIds: {
      openai: 'gpt-4o',
      'azure-openai': 'gpt-4o',
      openrouter: 'openai/gpt-4o',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      supportsExtendedThinking: false,
      supportsJsonMode: true,
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    },
    tier: 'advanced',
    family: 'gpt',
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  // GPT-4o-mini (standard)
  {
    canonicalId: 'gpt-4o-mini',
    canonicalName: 'GPT-4o Mini',
    providerIds: {
      openai: 'gpt-4o-mini',
      'azure-openai': 'gpt-4o-mini',
      openrouter: 'openai/gpt-4o-mini',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      supportsExtendedThinking: false,
      supportsJsonMode: true,
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    },
    tier: 'standard',
    family: 'gpt',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  // Gemini Pro (advanced)
  {
    canonicalId: 'gemini-pro',
    canonicalName: 'Gemini 2.0 Pro',
    providerIds: {
      gemini: 'gemini-2.0-pro',
      openrouter: 'google/gemini-2.0-pro',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      supportsExtendedThinking: false,
      supportsJsonMode: true,
      maxContextTokens: 2000000,
      maxOutputTokens: 8192,
    },
    tier: 'advanced',
    family: 'gemini',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5,
  },
  // LLaMA 3.1 70B (local/open)
  {
    canonicalId: 'llama-3.1-70b',
    canonicalName: 'LLaMA 3.1 70B',
    providerIds: {
      ollama: 'llama3.1:70b',
      openrouter: 'meta-llama/llama-3.1-70b',
      bedrock: 'meta.llama3-1-70b-instruct-v1:0',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: false,
      supportsExtendedThinking: false,
      supportsJsonMode: true,
      maxContextTokens: 128000,
      maxOutputTokens: 4096,
    },
    tier: 'advanced',
    family: 'llama',
    inputCostPer1M: 0.9,
    outputCostPer1M: 0.9,
  },
  // Phi-4 (efficient/local)
  {
    canonicalId: 'phi-4',
    canonicalName: 'Microsoft Phi-4',
    providerIds: {
      ollama: 'phi4',
      onnx: 'phi-4',
      openrouter: 'microsoft/phi-4',
    },
    capabilities: {
      supportsStreaming: true,
      supportsTools: false,
      supportsMCP: false,
      supportsVision: false,
      supportsExtendedThinking: false,
      supportsJsonMode: false,
      maxContextTokens: 16000,
      maxOutputTokens: 4096,
      requiresNetwork: false,
    },
    tier: 'efficient',
    family: 'phi',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
  },
];
