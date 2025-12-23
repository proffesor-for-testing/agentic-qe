/**
 * HybridRouter - Intelligent LLM Provider Router
 *
 * Provides intelligent routing between local (ruvllm) and cloud (Claude, GPT) providers
 * with circuit breakers, cost optimization, and adaptive learning.
 *
 * Features:
 * - Task complexity analysis for optimal routing
 * - Latency-aware provider selection
 * - Cost tracking and savings estimation
 * - Circuit breaker pattern for failing providers
 * - Priority queuing for urgent requests
 * - Learning from routing outcomes
 * - Privacy-first routing for sensitive data
 *
 * @module providers/HybridRouter
 * @version 1.0.0
 */

import {
  ILLMProvider,
  LLMProviderConfig,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMStreamEvent,
  LLMEmbeddingOptions,
  LLMEmbeddingResponse,
  LLMTokenCountOptions,
  LLMHealthStatus,
  LLMProviderMetadata,
  LLMProviderError
} from './ILLMProvider';
import { ClaudeProvider, ClaudeProviderConfig } from './ClaudeProvider';
import { RuvllmProvider, RuvllmProviderConfig, TRMConfig, RuvllmCompletionOptions } from './RuvllmProvider';
import { RuVectorClient, RuVectorConfig, QueryResult as RuVectorQueryResult } from './RuVectorClient';
import { Logger } from '../utils/Logger';

/**
 * Request priority levels
 */
export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

/**
 * Task complexity classification
 */
export enum TaskComplexity {
  SIMPLE = 'simple',        // Pattern matching, simple Q&A
  MODERATE = 'moderate',    // Standard reasoning
  COMPLEX = 'complex',      // Deep reasoning, code generation
  VERY_COMPLEX = 'very_complex' // Advanced analysis, architectural design
}

/**
 * Routing strategy
 */
export enum RoutingStrategy {
  COST_OPTIMIZED = 'cost_optimized',       // Minimize cost
  LATENCY_OPTIMIZED = 'latency_optimized', // Minimize latency
  QUALITY_OPTIMIZED = 'quality_optimized', // Maximize quality
  BALANCED = 'balanced',                   // Balance all factors
  PRIVACY_FIRST = 'privacy_first'          // Always use local
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Too many failures, reject requests
  HALF_OPEN = 'half_open' // Testing if provider recovered
}

/**
 * Circuit breaker for a provider
 */
interface CircuitBreaker {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

/**
 * Routing decision metadata
 */
export interface RoutingDecision {
  provider: 'local' | 'cloud';
  providerName: string;
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
  complexity: TaskComplexity;
  priority: RequestPriority;
  timestamp: Date;
}

/**
 * Routing outcome for learning
 */
interface RoutingOutcome {
  decision: RoutingDecision;
  actualCost: number;
  actualLatency: number;
  success: boolean;
  error?: string;
}

/**
 * Cost savings report
 */
export interface CostSavingsReport {
  totalRequests: number;
  localRequests: number;
  cloudRequests: number;
  totalCost: number;
  estimatedCloudCost: number;
  savings: number;
  savingsPercentage: number;
}

/**
 * Extended completion options with TRM and routing configuration
 */
export interface HybridCompletionOptions extends LLMCompletionOptions {
  /** TRM configuration for local provider */
  trmConfig?: TRMConfig;
  /** Override routing strategy for this request */
  routingStrategy?: RoutingStrategy;
  /** Request priority level */
  priority?: RequestPriority;
  /** Force use of specific provider */
  forceProvider?: 'local' | 'cloud';
}

/**
 * RuVector cache configuration for Phase 0.5 self-learning integration
 */
export interface RuVectorCacheConfig {
  /** Enable RuVector as intelligent cache layer */
  enabled: boolean;
  /** RuVector service base URL (default: http://localhost:8080) */
  baseUrl?: string;
  /** Confidence threshold for cache hits (default: 0.85) */
  cacheThreshold?: number;
  /** Enable automatic learning from LLM responses (default: true) */
  learningEnabled?: boolean;
  /** LoRA rank for adapter learning (default: 8) */
  loraRank?: number;
  /** Enable EWC to prevent catastrophic forgetting (default: true) */
  ewcEnabled?: boolean;
  /** Embedding dimension (default: 768) */
  embeddingDimension?: number;
  /** Skip cache for complex tasks (default: false) */
  skipCacheForComplexTasks?: boolean;
}

/**
 * Hybrid router configuration
 */
export interface HybridRouterConfig extends LLMProviderConfig {
  /** Claude provider configuration */
  claude?: ClaudeProviderConfig;
  /** Ruvllm provider configuration */
  ruvllm?: RuvllmProviderConfig;
  /** RuVector cache configuration (Phase 0.5 - Self-Learning Integration) */
  ruvector?: RuVectorCacheConfig;
  /** Default routing strategy */
  defaultStrategy?: RoutingStrategy;
  /** Enable circuit breakers */
  enableCircuitBreaker?: boolean;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number;
  /** Circuit breaker reset timeout (ms) */
  circuitBreakerTimeout?: number;
  /** Maximum latency for local provider (ms) */
  maxLocalLatency?: number;
  /** Enable learning from outcomes */
  enableLearning?: boolean;
  /** Privacy-sensitive keywords for automatic local routing */
  privacyKeywords?: string[];
  /** Auto-enable TRM for complex tasks routed locally */
  autoEnableTRM?: boolean;
  /** Default TRM configuration for auto-enabled requests */
  defaultTRMConfig?: TRMConfig;
}

/**
 * HybridRouter - Intelligent provider routing implementation
 *
 * Routes LLM requests between local and cloud providers based on:
 * - Task complexity and required capabilities
 * - Latency and cost constraints
 * - Provider health and circuit breaker state
 * - Request priority
 * - Privacy requirements
 */
export class HybridRouter implements ILLMProvider {
  private readonly logger: Logger;
  private config: Omit<Required<HybridRouterConfig>, 'claude' | 'ruvllm' | 'ruvector'> & Pick<HybridRouterConfig, 'claude' | 'ruvllm' | 'ruvector'>;
  private localProvider?: RuvllmProvider;
  private cloudProvider?: ClaudeProvider;
  private ruVectorClient?: RuVectorClient;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private routingHistory: RoutingOutcome[];
  private isInitialized: boolean;
  private totalCost: number;
  private requestCount: number;
  private localRequestCount: number;
  private cloudRequestCount: number;
  private cacheHitCount: number;
  private cacheMissCount: number;

  constructor(config: HybridRouterConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'hybrid-router',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 120000,
      maxRetries: config.maxRetries ?? 2,
      defaultStrategy: config.defaultStrategy ?? RoutingStrategy.BALANCED,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout ?? 60000,
      maxLocalLatency: config.maxLocalLatency ?? 5000,
      enableLearning: config.enableLearning ?? true,
      privacyKeywords: config.privacyKeywords ?? [
        'secret', 'password', 'token', 'key', 'credential',
        'private', 'confidential', 'internal', 'api_key'
      ],
      autoEnableTRM: config.autoEnableTRM ?? true,
      defaultTRMConfig: config.defaultTRMConfig ?? {
        maxIterations: 5,
        convergenceThreshold: 0.95,
        qualityMetric: 'coherence'
      },
      claude: config.claude,
      ruvllm: config.ruvllm,
      ruvector: config.ruvector
    };

    this.circuitBreakers = new Map();
    this.routingHistory = [];
    this.isInitialized = false;
    this.totalCost = 0;
    this.requestCount = 0;
    this.localRequestCount = 0;
    this.cloudRequestCount = 0;
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
  }

  /**
   * Initialize the hybrid router and its providers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('HybridRouter already initialized');
      return;
    }

    // Initialize RuVector cache layer (Phase 0.5 - Self-Learning Integration)
    if (this.config.ruvector?.enabled) {
      try {
        const ruVectorConfig: RuVectorConfig = {
          baseUrl: this.config.ruvector.baseUrl ?? 'http://localhost:8080',
          learningEnabled: this.config.ruvector.learningEnabled ?? true,
          cacheThreshold: this.config.ruvector.cacheThreshold ?? 0.85,
          loraRank: this.config.ruvector.loraRank ?? 8,
          ewcEnabled: this.config.ruvector.ewcEnabled ?? true,
          debug: this.config.debug
        };

        this.ruVectorClient = new RuVectorClient(ruVectorConfig);

        // Health check to verify connection
        const health = await this.ruVectorClient.healthCheck();
        if (health.status === 'healthy' || health.status === 'degraded') {
          this.logger.info('RuVector cache layer initialized', {
            status: health.status,
            vectorCount: health.vectorCount,
            gnnStatus: health.gnnStatus,
            loraStatus: health.loraStatus
          });
        } else {
          this.logger.warn('RuVector cache layer unhealthy, disabling', {
            status: health.status,
            lastError: health.lastError
          });
          this.ruVectorClient = undefined;
        }
      } catch (error) {
        this.logger.warn('Failed to initialize RuVector cache layer', {
          error: (error as Error).message
        });
        this.ruVectorClient = undefined;
      }
    }

    // Initialize local provider (ruvllm)
    try {
      this.localProvider = new RuvllmProvider(this.config.ruvllm ?? {});
      await this.localProvider.initialize();
      this.initCircuitBreaker('local');
      this.logger.info('Local provider (ruvllm) initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize local provider', {
        error: (error as Error).message
      });
    }

    // Initialize cloud provider (Claude)
    try {
      this.cloudProvider = new ClaudeProvider(this.config.claude ?? {});
      await this.cloudProvider.initialize();
      this.initCircuitBreaker('cloud');
      this.logger.info('Cloud provider (Claude) initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize cloud provider', {
        error: (error as Error).message
      });
    }

    if (!this.localProvider && !this.cloudProvider) {
      throw new LLMProviderError(
        'Failed to initialize any providers',
        'hybrid-router',
        'INIT_ERROR',
        false
      );
    }

    this.isInitialized = true;
    this.logger.info('HybridRouter initialized', {
      hasLocal: !!this.localProvider,
      hasCloud: !!this.cloudProvider,
      hasRuVectorCache: !!this.ruVectorClient,
      strategy: this.config.defaultStrategy
    });
  }

  /**
   * Complete a prompt with intelligent routing and TRM support
   *
   * Phase 0.5 Enhancement: RuVector cache layer for sub-ms pattern matching
   * - Check RuVector cache first (GNN-enhanced semantic search)
   * - If cache hit with high confidence, return cached result
   * - Otherwise, route to LLM and store result for learning
   *
   * When routing to the local provider (ruvLLM), TRM (Test-time Reasoning & Metacognition)
   * can be enabled for iterative quality improvement.
   */
  async complete(options: HybridCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const startTime = Date.now();
    const priority = options.priority ?? RequestPriority.NORMAL;
    const strategy = options.routingStrategy ?? this.config.defaultStrategy;
    const complexity = this.analyzeComplexity(options);

    // Phase 0.5: Try RuVector cache first (sub-ms pattern matching)
    if (this.ruVectorClient && this.shouldUseCache(options, complexity)) {
      try {
        const cacheResult = await this.tryRuVectorCache(options, complexity);
        if (cacheResult) {
          this.cacheHitCount++;
          this.requestCount++;

          this.logger.debug('RuVector cache hit', {
            confidence: cacheResult.confidence,
            latency: Date.now() - startTime,
            complexity
          });

          return cacheResult.response;
        }
      } catch (error) {
        // Cache error should not block the request, continue to LLM
        this.logger.warn('RuVector cache error, falling back to LLM', {
          error: (error as Error).message
        });
      }
    }

    // Cache miss or cache disabled
    this.cacheMissCount++;

    // Handle forced provider selection
    if (options.forceProvider) {
      const decision = this.createDecision(
        options.forceProvider,
        options.forceProvider === 'local' ? 'ruvllm' : 'claude',
        'Forced provider selection',
        complexity,
        priority
      );
      return this.executeWithDecisionAndLearn(decision, options, startTime);
    }

    // Analyze request and make routing decision
    const decision = this.makeRoutingDecision(options, strategy, priority);

    this.logger.debug('Routing decision made', {
      provider: decision.provider,
      reason: decision.reason,
      complexity: decision.complexity,
      trmEnabled: !!options.trmConfig || (this.config.autoEnableTRM && decision.complexity !== TaskComplexity.SIMPLE)
    });

    return this.executeWithDecisionAndLearn(decision, options, startTime);
  }

  /**
   * Check if cache should be used for this request
   */
  private shouldUseCache(options: HybridCompletionOptions, complexity: TaskComplexity): boolean {
    // Skip if RuVector not configured
    if (!this.ruVectorClient) return false;

    // Skip for complex tasks if configured
    if (this.config.ruvector?.skipCacheForComplexTasks &&
        (complexity === TaskComplexity.COMPLEX || complexity === TaskComplexity.VERY_COMPLEX)) {
      return false;
    }

    // Skip for privacy-sensitive data (should go directly to local LLM)
    if (this.containsPrivacySensitiveData(options)) {
      return false;
    }

    return true;
  }

  /**
   * Try to get response from RuVector cache
   */
  private async tryRuVectorCache(
    options: HybridCompletionOptions,
    complexity: TaskComplexity
  ): Promise<{ response: LLMCompletionResponse; confidence: number } | null> {
    if (!this.ruVectorClient || !this.localProvider) return null;

    // Extract query from messages
    const query = this.extractQueryFromOptions(options);
    if (!query) return null;

    // Generate embedding using local provider
    let embedding: number[];
    try {
      const embeddingResponse = await this.localProvider.embed({
        text: query,
        model: 'default'
      });
      embedding = embeddingResponse.embedding;
    } catch (error) {
      this.logger.debug('Failed to generate embedding for cache lookup', {
        error: (error as Error).message
      });
      return null;
    }

    // Query RuVector with learning integration
    const result = await this.ruVectorClient.queryWithLearning(
      query,
      embedding,
      async () => {
        // This fallback won't be used here - we return null to trigger LLM routing
        throw new Error('CACHE_MISS_MARKER');
      }
    );

    // Check if we got a cache hit
    if (result.source === 'cache' && result.confidence >= (this.config.ruvector?.cacheThreshold ?? 0.85)) {
      // Convert cache result to LLMCompletionResponse
      const response: LLMCompletionResponse = {
        id: `ruvector-cache-${Date.now()}`,
        content: [{
          type: 'text',
          text: result.content
        }],
        usage: {
          input_tokens: 0, // Cache hit, no token usage
          output_tokens: 0
        },
        model: 'ruvector-cache',
        stop_reason: 'end_turn',
        metadata: {
          source: 'ruvector-cache',
          confidence: result.confidence,
          complexity,
          latency: result.latency
        }
      };

      return { response, confidence: result.confidence };
    }

    return null;
  }

  /**
   * Execute with decision and store result in RuVector for learning
   */
  private async executeWithDecisionAndLearn(
    decision: RoutingDecision,
    options: HybridCompletionOptions,
    startTime: number
  ): Promise<LLMCompletionResponse> {
    const response = await this.executeWithDecision(decision, options, startTime);

    // Store successful response in RuVector for learning
    if (this.ruVectorClient && this.config.ruvector?.learningEnabled !== false) {
      this.storeResponseForLearning(options, response, decision).catch(error => {
        this.logger.warn('Failed to store response in RuVector for learning', {
          error: (error as Error).message
        });
      });
    }

    return response;
  }

  /**
   * Store LLM response in RuVector for future learning
   */
  private async storeResponseForLearning(
    options: HybridCompletionOptions,
    response: LLMCompletionResponse,
    decision: RoutingDecision
  ): Promise<void> {
    if (!this.ruVectorClient || !this.localProvider) return;

    try {
      // Extract query and response content
      const query = this.extractQueryFromOptions(options);
      const responseText = response.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      if (!query || !responseText) return;

      // Generate embedding
      const embeddingResponse = await this.localProvider.embed({
        text: query,
        model: 'default'
      });

      // Store pattern for future cache hits
      await this.ruVectorClient.store(
        {
          embedding: embeddingResponse.embedding,
          content: responseText,
          metadata: {
            query,
            model: response.model,
            provider: decision.provider,
            complexity: decision.complexity,
            timestamp: new Date().toISOString(),
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens
          }
        },
        { triggerLearning: true }
      );

      this.logger.debug('Response stored in RuVector for learning', {
        queryLength: query.length,
        responseLength: responseText.length,
        provider: decision.provider
      });
    } catch (error) {
      // Non-critical operation, just log
      this.logger.debug('Failed to store response for learning', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Extract query string from completion options
   */
  private extractQueryFromOptions(options: LLMCompletionOptions): string | null {
    if (!options.messages || options.messages.length === 0) return null;

    // Get the last user message
    const userMessages = options.messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    if (!lastUserMessage) return null;

    if (typeof lastUserMessage.content === 'string') {
      return lastUserMessage.content;
    }

    // Extract text from content blocks
    return lastUserMessage.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  /**
   * Execute request with routing decision
   */
  private async executeWithDecision(
    decision: RoutingDecision,
    options: HybridCompletionOptions,
    startTime: number
  ): Promise<LLMCompletionResponse> {
    try {
      let response: LLMCompletionResponse;

      if (decision.provider === 'local' && this.localProvider) {
        // Prepare TRM-enhanced options for local provider
        const localOptions = this.prepareTRMOptions(options, decision.complexity);

        response = await this.executeWithCircuitBreaker(
          'local',
          () => this.localProvider!.complete(localOptions)
        );
        this.localRequestCount++;
      } else if (decision.provider === 'cloud' && this.cloudProvider) {
        response = await this.executeWithCircuitBreaker(
          'cloud',
          () => this.cloudProvider!.complete(options)
        );
        this.cloudRequestCount++;
      } else {
        throw new LLMProviderError(
          `Selected provider (${decision.provider}) not available`,
          'hybrid-router',
          'PROVIDER_UNAVAILABLE',
          true
        );
      }

      this.requestCount++;

      // Track cost
      const actualCost = this.calculateCost(response, decision.provider);
      this.totalCost += actualCost;

      // Record outcome for learning
      if (this.config.enableLearning) {
        this.recordOutcome({
          decision,
          actualCost,
          actualLatency: Date.now() - startTime,
          success: true
        });
      }

      // Add routing metadata to response
      response.metadata = {
        ...response.metadata,
        routingDecision: decision,
        actualCost
      };

      return response;

    } catch (error) {
      // Record failure
      if (this.config.enableLearning) {
        this.recordOutcome({
          decision,
          actualCost: 0,
          actualLatency: Date.now() - startTime,
          success: false,
          error: (error as Error).message
        });
      }

      // Try fallback if enabled
      if (this.config.enableCircuitBreaker) {
        return this.executeFallback(options, decision.provider);
      }

      throw error;
    }
  }

  /**
   * Stream completion with routing
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    const decision = this.makeRoutingDecision(options);

    try {
      if (decision.provider === 'local' && this.localProvider) {
        yield* this.localProvider.streamComplete(options);
        this.localRequestCount++;
      } else if (decision.provider === 'cloud' && this.cloudProvider) {
        yield* this.cloudProvider.streamComplete(options);
        this.cloudRequestCount++;
      } else {
        throw new LLMProviderError(
          `Selected provider (${decision.provider}) not available`,
          'hybrid-router',
          'PROVIDER_UNAVAILABLE',
          true
        );
      }

      this.requestCount++;

    } catch (error) {
      throw new LLMProviderError(
        `Stream failed: ${(error as Error).message}`,
        'hybrid-router',
        'STREAM_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Generate embeddings (prefer local)
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    this.ensureInitialized();

    // Always prefer local for embeddings (privacy + cost)
    if (this.localProvider && this.isProviderAvailable('local')) {
      try {
        return await this.localProvider.embed(options);
      } catch (error) {
        this.logger.warn('Local embedding failed, no fallback available', {
          error: (error as Error).message
        });
        throw error;
      }
    }

    throw new LLMProviderError(
      'Embeddings not available. Local provider required.',
      'hybrid-router',
      'UNSUPPORTED',
      false
    );
  }

  /**
   * Count tokens
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    // Use local provider if available (faster, free)
    if (this.localProvider) {
      return this.localProvider.countTokens(options);
    }

    if (this.cloudProvider) {
      return this.cloudProvider.countTokens(options);
    }

    throw new LLMProviderError(
      'No provider available for token counting',
      'hybrid-router',
      'PROVIDER_UNAVAILABLE',
      false
    );
  }

  /**
   * Health check all providers including RuVector cache
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const checks: Array<{ provider: string; status: LLMHealthStatus | { healthy: boolean; status?: string; vectorCount?: number; error?: string } }> = [];

    // Check RuVector cache layer
    if (this.ruVectorClient) {
      try {
        const ruVectorHealth = await this.ruVectorClient.healthCheck();
        checks.push({
          provider: 'ruvector-cache',
          status: {
            healthy: ruVectorHealth.status === 'healthy',
            status: ruVectorHealth.status,
            vectorCount: ruVectorHealth.vectorCount
          }
        });
      } catch (error) {
        checks.push({
          provider: 'ruvector-cache',
          status: {
            healthy: false,
            error: (error as Error).message
          }
        });
      }
    }

    if (this.localProvider) {
      try {
        const status = await this.localProvider.healthCheck();
        checks.push({ provider: 'local', status });
      } catch (error) {
        checks.push({
          provider: 'local',
          status: {
            healthy: false,
            error: (error as Error).message,
            timestamp: new Date()
          }
        });
      }
    }

    if (this.cloudProvider) {
      try {
        const status = await this.cloudProvider.healthCheck();
        checks.push({ provider: 'cloud', status });
      } catch (error) {
        checks.push({
          provider: 'cloud',
          status: {
            healthy: false,
            error: (error as Error).message,
            timestamp: new Date()
          }
        });
      }
    }

    const healthyCount = checks.filter(c => 'healthy' in c.status && c.status.healthy).length;

    return {
      healthy: healthyCount > 0,
      timestamp: new Date(),
      metadata: {
        providers: checks,
        circuitBreakers: Object.fromEntries(this.circuitBreakers),
        requestCount: this.requestCount,
        localRequests: this.localRequestCount,
        cloudRequests: this.cloudRequestCount,
        cacheHits: this.cacheHitCount,
        cacheMisses: this.cacheMissCount,
        cacheHitRate: this.getCacheHitRate()
      }
    };
  }

  /**
   * Get cache hit rate (0-1)
   */
  getCacheHitRate(): number {
    const total = this.cacheHitCount + this.cacheMissCount;
    return total > 0 ? this.cacheHitCount / total : 0;
  }

  /**
   * Get metadata (aggregated from all providers)
   */
  getMetadata(): LLMProviderMetadata {
    const metadata: LLMProviderMetadata[] = [];

    if (this.localProvider) {
      metadata.push(this.localProvider.getMetadata());
    }

    if (this.cloudProvider) {
      metadata.push(this.cloudProvider.getMetadata());
    }

    return {
      name: 'hybrid-router',
      version: '1.0.0',
      models: [...new Set(metadata.flatMap(m => m.models))],
      capabilities: {
        streaming: metadata.some(m => m.capabilities.streaming),
        caching: metadata.some(m => m.capabilities.caching),
        embeddings: metadata.some(m => m.capabilities.embeddings),
        vision: metadata.some(m => m.capabilities.vision)
      },
      costs: {
        inputPerMillion: Math.min(...metadata.map(m => m.costs.inputPerMillion)),
        outputPerMillion: Math.min(...metadata.map(m => m.costs.outputPerMillion))
      },
      location: 'cloud' // Hybrid, but defaults to cloud
    };
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    if (this.localProvider) {
      shutdownPromises.push(this.localProvider.shutdown());
    }

    if (this.cloudProvider) {
      shutdownPromises.push(this.cloudProvider.shutdown());
    }

    await Promise.allSettled(shutdownPromises);

    this.isInitialized = false;
    this.logger.info('HybridRouter shutdown', {
      totalRequests: this.requestCount,
      totalCost: this.totalCost
    });
  }

  /**
   * Track cost (aggregated across providers)
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    // This is handled internally per request
    return 0;
  }

  /**
   * Get cost savings report including RuVector cache savings
   */
  getCostSavingsReport(): CostSavingsReport & {
    cacheHits: number;
    cacheSavings: number;
  } {
    // Estimate what cloud cost would have been for all requests
    const cloudCostPerRequest = 0.01; // Rough estimate
    const estimatedCloudCost = this.requestCount * cloudCostPerRequest;
    const savings = estimatedCloudCost - this.totalCost;
    const savingsPercentage = estimatedCloudCost > 0
      ? (savings / estimatedCloudCost) * 100
      : 0;

    // Cache hits are essentially free
    const cacheSavings = this.cacheHitCount * cloudCostPerRequest;

    return {
      totalRequests: this.requestCount,
      localRequests: this.localRequestCount,
      cloudRequests: this.cloudRequestCount,
      totalCost: this.totalCost,
      estimatedCloudCost,
      savings,
      savingsPercentage,
      cacheHits: this.cacheHitCount,
      cacheSavings
    };
  }

  /**
   * Get routing statistics including cache metrics
   */
  getRoutingStats(): {
    totalDecisions: number;
    localDecisions: number;
    cloudDecisions: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    averageLocalLatency: number;
    averageCloudLatency: number;
    successRate: number;
  } {
    const successCount = this.routingHistory.filter(o => o.success).length;
    const localOutcomes = this.routingHistory.filter(o => o.decision.provider === 'local');
    const cloudOutcomes = this.routingHistory.filter(o => o.decision.provider === 'cloud');

    const avgLocalLatency = localOutcomes.length > 0
      ? localOutcomes.reduce((sum, o) => sum + o.actualLatency, 0) / localOutcomes.length
      : 0;

    const avgCloudLatency = cloudOutcomes.length > 0
      ? cloudOutcomes.reduce((sum, o) => sum + o.actualLatency, 0) / cloudOutcomes.length
      : 0;

    return {
      totalDecisions: this.routingHistory.length,
      localDecisions: localOutcomes.length,
      cloudDecisions: cloudOutcomes.length,
      cacheHits: this.cacheHitCount,
      cacheMisses: this.cacheMissCount,
      cacheHitRate: this.getCacheHitRate(),
      averageLocalLatency: avgLocalLatency,
      averageCloudLatency: avgCloudLatency,
      successRate: this.routingHistory.length > 0
        ? (successCount / this.routingHistory.length) * 100
        : 0
    };
  }

  /**
   * Get RuVector cache metrics (Phase 0.5)
   */
  async getRuVectorMetrics(): Promise<{
    enabled: boolean;
    healthy: boolean;
    cacheHitRate: number;
    patternCount: number;
    loraUpdates: number;
    memoryUsageMB?: number;
  } | null> {
    if (!this.ruVectorClient) {
      return null;
    }

    try {
      const metrics = await this.ruVectorClient.getMetrics();
      const health = await this.ruVectorClient.healthCheck();

      return {
        enabled: true,
        healthy: health.status === 'healthy',
        cacheHitRate: metrics.cacheHitRate,
        patternCount: metrics.patternCount,
        loraUpdates: metrics.loraUpdates,
        memoryUsageMB: metrics.memoryUsageMB
      };
    } catch (error) {
      this.logger.warn('Failed to get RuVector metrics', {
        error: (error as Error).message
      });
      return {
        enabled: true,
        healthy: false,
        cacheHitRate: this.getCacheHitRate(),
        patternCount: 0,
        loraUpdates: 0
      };
    }
  }

  /**
   * Force RuVector learning consolidation
   */
  async forceRuVectorLearn(): Promise<{
    success: boolean;
    updatedParameters?: number;
    duration?: number;
    error?: string;
  }> {
    if (!this.ruVectorClient) {
      return { success: false, error: 'RuVector not enabled' };
    }

    try {
      const result = await this.ruVectorClient.forceLearn();
      return {
        success: result.success,
        updatedParameters: result.updatedParameters,
        duration: result.duration
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Make intelligent routing decision
   */
  private makeRoutingDecision(
    options: LLMCompletionOptions,
    strategy?: RoutingStrategy,
    priority: RequestPriority = RequestPriority.NORMAL
  ): RoutingDecision {
    const activeStrategy = strategy || this.config.defaultStrategy;
    const complexity = this.analyzeComplexity(options);

    // Check for privacy-sensitive content
    if (this.containsPrivacySensitiveData(options)) {
      return this.createDecision('local', 'ruvllm', 'Privacy-sensitive data detected', complexity, priority);
    }

    // PRIVACY_FIRST strategy
    if (activeStrategy === RoutingStrategy.PRIVACY_FIRST && this.isProviderAvailable('local')) {
      return this.createDecision('local', 'ruvllm', 'Privacy-first strategy', complexity, priority);
    }

    // Check circuit breakers
    const localAvailable = this.isProviderAvailable('local');
    const cloudAvailable = this.isProviderAvailable('cloud');

    if (!localAvailable && !cloudAvailable) {
      throw new LLMProviderError(
        'No providers available (circuit breakers open)',
        'hybrid-router',
        'NO_PROVIDERS',
        true
      );
    }

    // COST_OPTIMIZED strategy
    if (activeStrategy === RoutingStrategy.COST_OPTIMIZED) {
      if (localAvailable) {
        return this.createDecision('local', 'ruvllm', 'Cost optimization (local is free)', complexity, priority);
      }
    }

    // LATENCY_OPTIMIZED strategy
    if (activeStrategy === RoutingStrategy.LATENCY_OPTIMIZED) {
      // Use historical data to choose faster provider
      const stats = this.getRoutingStats();
      if (stats.averageLocalLatency > 0 && stats.averageCloudLatency > 0) {
        if (stats.averageLocalLatency < stats.averageCloudLatency && localAvailable) {
          return this.createDecision('local', 'ruvllm', 'Latency optimization (local faster)', complexity, priority);
        }
      }
    }

    // QUALITY_OPTIMIZED or BALANCED strategy
    // Route based on complexity
    switch (complexity) {
      case TaskComplexity.SIMPLE:
      case TaskComplexity.MODERATE:
        // Simple tasks → local
        if (localAvailable) {
          return this.createDecision('local', 'ruvllm', `${complexity} task suitable for local`, complexity, priority);
        }
        break;

      case TaskComplexity.COMPLEX:
        // Complex tasks → prefer cloud for quality, but local if cost-sensitive
        if (activeStrategy === RoutingStrategy.BALANCED && localAvailable) {
          return this.createDecision('local', 'ruvllm', 'Balanced strategy, trying local first', complexity, priority);
        }
        if (cloudAvailable) {
          return this.createDecision('cloud', 'claude', `${complexity} task needs cloud quality`, complexity, priority);
        }
        break;

      case TaskComplexity.VERY_COMPLEX:
        // Very complex → always cloud if available
        if (cloudAvailable) {
          return this.createDecision('cloud', 'claude', `${complexity} task requires cloud`, complexity, priority);
        }
        break;
    }

    // Fallback: use whatever is available
    if (cloudAvailable) {
      return this.createDecision('cloud', 'claude', 'Fallback to cloud', complexity, priority);
    }

    if (localAvailable) {
      return this.createDecision('local', 'ruvllm', 'Fallback to local', complexity, priority);
    }

    throw new LLMProviderError(
      'No providers available',
      'hybrid-router',
      'NO_PROVIDERS',
      true
    );
  }

  /**
   * Prepare TRM-enhanced options for local provider
   *
   * Enables TRM (Test-time Reasoning & Metacognition) for complex tasks
   * to iteratively improve response quality through recursive refinement.
   */
  private prepareTRMOptions(
    options: HybridCompletionOptions,
    complexity: TaskComplexity
  ): RuvllmCompletionOptions {
    // If TRM config explicitly provided, use it
    if (options.trmConfig) {
      return {
        ...options,
        trmConfig: options.trmConfig
      };
    }

    // Auto-enable TRM for non-simple tasks if configured
    if (this.config.autoEnableTRM && complexity !== TaskComplexity.SIMPLE) {
      // Adjust TRM iterations based on complexity
      const iterationsByComplexity: Record<TaskComplexity, number> = {
        [TaskComplexity.SIMPLE]: 1,
        [TaskComplexity.MODERATE]: 3,
        [TaskComplexity.COMPLEX]: 5,
        [TaskComplexity.VERY_COMPLEX]: 7
      };

      const trmConfig: TRMConfig = {
        maxIterations: iterationsByComplexity[complexity],
        convergenceThreshold: this.config.defaultTRMConfig?.convergenceThreshold ?? 0.95,
        qualityMetric: this.config.defaultTRMConfig?.qualityMetric ?? 'coherence'
      };

      this.logger.debug('Auto-enabling TRM for complex task', {
        complexity,
        maxIterations: trmConfig.maxIterations
      });

      return {
        ...options,
        trmConfig
      };
    }

    // No TRM enhancement
    return options;
  }

  /**
   * Analyze task complexity
   */
  private analyzeComplexity(options: LLMCompletionOptions): TaskComplexity {
    const maxTokens = options.maxTokens || 0;
    const messageCount = options.messages.length;
    const totalContent = options.messages
      .map(m => typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join(''))
      .join(' ');

    const contentLength = totalContent.length;

    // Complexity heuristics
    const codePatterns = /```|function|class|import|export|const|let|var/gi;
    const hasCode = codePatterns.test(totalContent);

    const complexKeywords = /architect|design|analyze|optimize|refactor|debug/gi;
    const hasComplexKeywords = complexKeywords.test(totalContent);

    // Scoring
    let score = 0;

    if (contentLength > 5000) score += 2;
    else if (contentLength > 2000) score += 1;

    if (maxTokens > 4000) score += 2;
    else if (maxTokens > 1000) score += 1;

    if (messageCount > 5) score += 1;
    if (hasCode) score += 1;
    if (hasComplexKeywords) score += 1;

    // Classification
    if (score >= 6) return TaskComplexity.VERY_COMPLEX;
    if (score >= 4) return TaskComplexity.COMPLEX;
    if (score >= 2) return TaskComplexity.MODERATE;
    return TaskComplexity.SIMPLE;
  }

  /**
   * Check for privacy-sensitive data
   */
  private containsPrivacySensitiveData(options: LLMCompletionOptions): boolean {
    const allContent = options.messages
      .map(m => typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join(''))
      .join(' ')
      .toLowerCase();

    return this.config.privacyKeywords.some(keyword =>
      allContent.includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if provider is available (circuit breaker check)
   */
  private isProviderAvailable(provider: 'local' | 'cloud'): boolean {
    if (provider === 'local' && !this.localProvider) return false;
    if (provider === 'cloud' && !this.cloudProvider) return false;

    if (!this.config.enableCircuitBreaker) return true;

    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return true;

    if (breaker.state === CircuitState.OPEN) {
      // Check if timeout expired
      if (breaker.nextAttemptTime && new Date() >= breaker.nextAttemptTime) {
        breaker.state = CircuitState.HALF_OPEN;
        this.logger.info(`Circuit breaker for ${provider} entering HALF_OPEN state`);
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Execute with circuit breaker protection
   */
  private async executeWithCircuitBreaker<T>(
    provider: 'local' | 'cloud',
    operation: () => Promise<T>
  ): Promise<T> {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) {
      return operation();
    }

    if (breaker.state === CircuitState.OPEN) {
      throw new LLMProviderError(
        `Circuit breaker OPEN for ${provider}`,
        'hybrid-router',
        'CIRCUIT_OPEN',
        true
      );
    }

    try {
      const result = await operation();

      // Success
      breaker.successCount++;
      breaker.failureCount = 0;

      if (breaker.state === CircuitState.HALF_OPEN) {
        // Recovered, close circuit
        breaker.state = CircuitState.CLOSED;
        this.logger.info(`Circuit breaker for ${provider} closed (recovered)`);
      }

      return result;

    } catch (error) {
      // Failure
      breaker.failureCount++;
      breaker.lastFailureTime = new Date();

      if (breaker.failureCount >= this.config.circuitBreakerThreshold) {
        breaker.state = CircuitState.OPEN;
        breaker.nextAttemptTime = new Date(Date.now() + this.config.circuitBreakerTimeout);
        this.logger.error(`Circuit breaker for ${provider} opened after ${breaker.failureCount} failures`);
      }

      throw error;
    }
  }

  /**
   * Execute fallback to alternative provider
   */
  private async executeFallback(
    options: LLMCompletionOptions,
    failedProvider: 'local' | 'cloud'
  ): Promise<LLMCompletionResponse> {
    const fallbackProvider = failedProvider === 'local' ? 'cloud' : 'local';

    this.logger.warn(`Attempting fallback to ${fallbackProvider} after ${failedProvider} failure`);

    if (!this.isProviderAvailable(fallbackProvider)) {
      throw new LLMProviderError(
        `Fallback provider ${fallbackProvider} not available`,
        'hybrid-router',
        'FALLBACK_FAILED',
        false
      );
    }

    if (fallbackProvider === 'local' && this.localProvider) {
      return this.localProvider.complete(options);
    }

    if (fallbackProvider === 'cloud' && this.cloudProvider) {
      return this.cloudProvider.complete(options);
    }

    throw new LLMProviderError(
      'Fallback failed: no alternative provider',
      'hybrid-router',
      'FALLBACK_FAILED',
      false
    );
  }

  /**
   * Initialize circuit breaker for a provider
   */
  private initCircuitBreaker(provider: 'local' | 'cloud'): void {
    this.circuitBreakers.set(provider, {
      state: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0
    });
  }

  /**
   * Create routing decision object
   */
  private createDecision(
    provider: 'local' | 'cloud',
    providerName: string,
    reason: string,
    complexity: TaskComplexity,
    priority: RequestPriority
  ): RoutingDecision {
    return {
      provider,
      providerName,
      reason,
      estimatedCost: provider === 'local' ? 0 : 0.01, // Rough estimate
      estimatedLatency: provider === 'local' ? 2000 : 1000, // Rough estimate
      complexity,
      priority,
      timestamp: new Date()
    };
  }

  /**
   * Calculate actual cost from response
   */
  private calculateCost(response: LLMCompletionResponse, provider: 'local' | 'cloud'): number {
    if (provider === 'local') {
      return 0; // Local is free
    }

    // Use cloud provider's tracking
    if (this.cloudProvider) {
      return this.cloudProvider.trackCost(response.usage);
    }

    return 0;
  }

  /**
   * Record routing outcome for learning
   */
  private recordOutcome(outcome: RoutingOutcome): void {
    this.routingHistory.push(outcome);

    // Keep only last 1000 outcomes
    if (this.routingHistory.length > 1000) {
      this.routingHistory.shift();
    }

    if (this.config.debug) {
      this.logger.debug('Routing outcome recorded', {
        provider: outcome.decision.provider,
        success: outcome.success,
        latency: outcome.actualLatency,
        cost: outcome.actualCost
      });
    }
  }

  /**
   * Ensure router is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new LLMProviderError(
        'HybridRouter not initialized. Call initialize() first.',
        'hybrid-router',
        'NOT_INITIALIZED',
        false
      );
    }
  }
}
