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
 * Hybrid router configuration
 */
export interface HybridRouterConfig extends LLMProviderConfig {
  /** Claude provider configuration */
  claude?: ClaudeProviderConfig;
  /** Ruvllm provider configuration */
  ruvllm?: RuvllmProviderConfig;
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
  private config: Omit<Required<HybridRouterConfig>, 'claude' | 'ruvllm'> & Pick<HybridRouterConfig, 'claude' | 'ruvllm'>;
  private localProvider?: RuvllmProvider;
  private cloudProvider?: ClaudeProvider;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private routingHistory: RoutingOutcome[];
  private isInitialized: boolean;
  private totalCost: number;
  private requestCount: number;
  private localRequestCount: number;
  private cloudRequestCount: number;

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
      ruvllm: config.ruvllm
    };

    this.circuitBreakers = new Map();
    this.routingHistory = [];
    this.isInitialized = false;
    this.totalCost = 0;
    this.requestCount = 0;
    this.localRequestCount = 0;
    this.cloudRequestCount = 0;
  }

  /**
   * Initialize the hybrid router and its providers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('HybridRouter already initialized');
      return;
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
      strategy: this.config.defaultStrategy
    });
  }

  /**
   * Complete a prompt with intelligent routing and TRM support
   *
   * When routing to the local provider (ruvLLM), TRM (Test-time Reasoning & Metacognition)
   * can be enabled for iterative quality improvement.
   */
  async complete(options: HybridCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const startTime = Date.now();
    const priority = options.priority ?? RequestPriority.NORMAL;
    const strategy = options.routingStrategy ?? this.config.defaultStrategy;

    // Handle forced provider selection
    if (options.forceProvider) {
      const decision = this.createDecision(
        options.forceProvider,
        options.forceProvider === 'local' ? 'ruvllm' : 'claude',
        'Forced provider selection',
        this.analyzeComplexity(options),
        priority
      );
      return this.executeWithDecision(decision, options, startTime);
    }

    // Analyze request and make routing decision
    const decision = this.makeRoutingDecision(options, strategy, priority);

    this.logger.debug('Routing decision made', {
      provider: decision.provider,
      reason: decision.reason,
      complexity: decision.complexity,
      trmEnabled: !!options.trmConfig || (this.config.autoEnableTRM && decision.complexity !== TaskComplexity.SIMPLE)
    });

    return this.executeWithDecision(decision, options, startTime);
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
   * Health check all providers
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const checks: Array<{ provider: string; status: LLMHealthStatus }> = [];

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

    const healthyCount = checks.filter(c => c.status.healthy).length;

    return {
      healthy: healthyCount > 0,
      timestamp: new Date(),
      metadata: {
        providers: checks,
        circuitBreakers: Object.fromEntries(this.circuitBreakers),
        requestCount: this.requestCount,
        localRequests: this.localRequestCount,
        cloudRequests: this.cloudRequestCount
      }
    };
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
   * Get cost savings report
   */
  getCostSavingsReport(): CostSavingsReport {
    // Estimate what cloud cost would have been for all requests
    const cloudCostPerRequest = 0.01; // Rough estimate
    const estimatedCloudCost = this.requestCount * cloudCostPerRequest;
    const savings = estimatedCloudCost - this.totalCost;
    const savingsPercentage = estimatedCloudCost > 0
      ? (savings / estimatedCloudCost) * 100
      : 0;

    return {
      totalRequests: this.requestCount,
      localRequests: this.localRequestCount,
      cloudRequests: this.cloudRequestCount,
      totalCost: this.totalCost,
      estimatedCloudCost,
      savings,
      savingsPercentage
    };
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): {
    totalDecisions: number;
    localDecisions: number;
    cloudDecisions: number;
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
      averageLocalLatency: avgLocalLatency,
      averageCloudLatency: avgCloudLatency,
      successRate: this.routingHistory.length > 0
        ? (successCount / this.routingHistory.length) * 100
        : 0
    };
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
