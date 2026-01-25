/**
 * Agentic QE v3 - HybridRouter
 * ADR-043: Vendor-Independent LLM Support - Milestone 3
 *
 * Intelligent provider selection with:
 * - 4 routing modes (manual, rule-based, cost-optimized, performance-optimized)
 * - Agent-type aware routing
 * - Fallback chain with automatic failover
 * - Metrics collection for routing decisions
 * - Integration with existing ProviderManager
 */

import { v4 as uuidv4 } from 'uuid';
import {
  LLMProvider,
  LLMProviderType,
  LLMResponse,
  createLLMError,
  isLLMError,
} from '../interfaces';
import { ProviderManager } from '../provider-manager';
import {
  RoutingMode,
  RoutingRule,
  RouterConfig,
  RoutingDecision,
  FallbackChain,
  ChatParams,
  ChatResponse,
  StreamChunk,
  RouterMetrics,
  ProviderRoutingMetrics,
  SelectionReason,
  ExtendedProviderType,
  CostEstimate,
  AlternativeProvider,
  DEFAULT_ROUTER_CONFIG,
  DEFAULT_FALLBACK_CHAIN,
} from './types';
import { RoutingRuleEngine, DEFAULT_QE_ROUTING_RULES } from './routing-rules';
import {
  RouterMetricsCollector,
  CostMetricsCollector,
  createRouterMetricsCollector,
  createCostMetricsCollector,
} from '../metrics';
import {
  mapModelId,
  normalizeModelId,
  getModelMapping,
  type ProviderType as ModelProviderType,
} from '../model-mapping';

// ============================================================================
// Decision Cache
// ============================================================================

interface CachedDecision {
  decision: RoutingDecision;
  expiresAt: number;
}

/**
 * Simple LRU-like decision cache
 */
class DecisionCache {
  private cache = new Map<string, CachedDecision>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 100, ttlMs: number = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): RoutingDecision | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.decision;
  }

  set(key: string, decision: RoutingDecision): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      decision,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { hits: number; misses: number; size: number } {
    return {
      hits: 0,
      misses: 0,
      size: this.cache.size,
    };
  }
}

// ============================================================================
// HybridRouter Implementation
// ============================================================================

/**
 * HybridRouter - Intelligent provider selection for LLM requests
 */
export class HybridRouter {
  private config: RouterConfig;
  private providerManager: ProviderManager;
  private ruleEngine: RoutingRuleEngine;
  private decisionCache: DecisionCache;
  private metrics: RouterMetricsTracker;
  private routerMetrics: RouterMetricsCollector;
  private costMetrics: CostMetricsCollector;
  private initialized: boolean = false;

  constructor(
    providerManager: ProviderManager,
    config?: Partial<RouterConfig>
  ) {
    this.providerManager = providerManager;
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };

    // Initialize rule engine with default QE rules merged with custom rules
    const rules = this.config.rules.length > 0
      ? this.config.rules
      : DEFAULT_QE_ROUTING_RULES;
    this.ruleEngine = new RoutingRuleEngine(rules);

    // Initialize decision cache
    this.decisionCache = new DecisionCache(
      100,
      this.config.decisionCacheTtlMs
    );

    // Initialize metrics trackers
    this.metrics = new RouterMetricsTracker();
    this.routerMetrics = createRouterMetricsCollector();
    this.costMetrics = createCostMetricsCollector();
  }

  /**
   * Initialize the router
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure provider manager is initialized
    await this.providerManager.initialize();
    this.initialized = true;
  }

  /**
   * Get current routing mode
   */
  getMode(): RoutingMode {
    return this.config.mode;
  }

  /**
   * Set routing mode
   */
  setMode(mode: RoutingMode): void {
    this.config.mode = mode;
    this.decisionCache.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.rules) {
      this.ruleEngine.setRules(config.rules);
    }

    if (config.decisionCacheTtlMs) {
      this.decisionCache = new DecisionCache(100, config.decisionCacheTtlMs);
    }
  }

  /**
   * Select provider based on current routing mode
   */
  async selectProvider(params: ChatParams): Promise<RoutingDecision> {
    await this.ensureInitialized();

    const startTime = Date.now();

    // Check cache first
    if (this.config.cacheDecisions) {
      const cacheKey = this.generateCacheKey(params);
      const cached = this.decisionCache.get(cacheKey);
      if (cached) {
        this.metrics.recordCacheHit();
        this.routerMetrics.recordCacheHit();
        return cached;
      }
      this.metrics.recordCacheMiss();
      this.routerMetrics.recordCacheMiss();
    }

    let decision: RoutingDecision;

    switch (this.config.mode) {
      case 'manual':
        decision = await this.selectManual(params);
        break;
      case 'rule-based':
        decision = await this.selectRuleBased(params);
        break;
      case 'cost-optimized':
        decision = await this.selectCostOptimized(params);
        break;
      case 'performance-optimized':
        decision = await this.selectPerformanceOptimized(params);
        break;
      default:
        decision = await this.selectRuleBased(params);
    }

    // Update decision time
    decision.metadata.decisionTimeMs = Date.now() - startTime;

    // Cache the decision
    if (this.config.cacheDecisions) {
      const cacheKey = this.generateCacheKey(params);
      this.decisionCache.set(cacheKey, decision);
    }

    // Record metrics
    this.metrics.recordDecision(decision, this.config.mode);

    return decision;
  }

  /**
   * Execute chat request with intelligent provider selection
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    await this.ensureInitialized();

    const requestId = uuidv4();
    const decision = await this.selectProvider(params);

    // Try the selected provider
    const result = await this.executeWithFallback(params, decision, requestId);
    return result;
  }

  /**
   * Execute streaming chat request
   */
  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    await this.ensureInitialized();

    const decision = await this.selectProvider(params);

    // For now, implement basic streaming that yields chunks
    const response = await this.chat(params);

    // Simulate streaming by yielding the response in chunks
    const chunkSize = 100;
    for (let i = 0; i < response.content.length; i += chunkSize) {
      const isLast = i + chunkSize >= response.content.length;
      yield {
        type: isLast ? 'done' : 'content',
        delta: response.content.slice(i, i + chunkSize),
        accumulated: response.content.slice(0, i + chunkSize),
        done: isLast,
        tokenCount: Math.ceil((i + chunkSize) / 4),
        model: response.model,
        provider: decision.providerType,
        usage: isLast ? response.usage : undefined,
      };
    }
  }

  /**
   * Get routing metrics
   */
  getMetrics(): RouterMetrics {
    return this.metrics.getMetrics();
  }

  /**
   * Get enhanced router metrics with detailed breakdowns
   */
  getEnhancedMetrics(timeWindow?: '1m' | '5m' | '15m' | '1h' | '24h' | '7d' | 'all') {
    return this.routerMetrics.getMetrics(timeWindow);
  }

  /**
   * Get metrics for a specific provider
   */
  getProviderMetrics(provider: ExtendedProviderType) {
    return this.routerMetrics.getMetricsByProvider(provider);
  }

  /**
   * Get metrics for a specific agent type
   */
  getAgentMetrics(agentType: string) {
    return this.routerMetrics.getMetricsByAgentType(agentType);
  }

  /**
   * Get cost breakdown by provider
   */
  getCostByProvider(period?: '1h' | '24h' | '7d' | '30d' | 'all') {
    return this.costMetrics.getCostByProvider(period);
  }

  /**
   * Get cost breakdown by agent type
   */
  getCostByAgentType(period?: '1h' | '24h' | '7d' | '30d' | 'all') {
    return this.costMetrics.getCostByAgentType(period);
  }

  /**
   * Get cost breakdown by model
   */
  getCostByModel(period?: '1h' | '24h' | '7d' | '30d' | 'all') {
    return this.costMetrics.getCostByModel(period);
  }

  /**
   * Get total cost for a period
   */
  getTotalCost(period?: '1h' | '24h' | '7d' | '30d' | 'all') {
    return this.costMetrics.getTotalCost(period);
  }

  /**
   * Get cost trends over time
   */
  getCostTrend(period: '1h' | '24h' | '7d') {
    return this.costMetrics.getCostTrend(period);
  }

  /**
   * Get routing audit log
   */
  getAuditLog(options?: {
    limit?: number;
    since?: Date;
    provider?: ExtendedProviderType;
    agentType?: string;
  }) {
    return this.routerMetrics.getAuditLog(options);
  }

  /**
   * Get cost optimization suggestions
   */
  getOptimizationSuggestions() {
    return this.costMetrics.getOptimizationSuggestions();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.reset();
    this.routerMetrics.resetMetrics();
    this.costMetrics.reset();
  }

  /**
   * Clear decision cache
   */
  clearCache(): void {
    this.decisionCache.clear();
  }

  // ============================================================================
  // Provider Selection Methods
  // ============================================================================

  /**
   * Manual selection - use preferredProvider or default
   */
  private async selectManual(params: ChatParams): Promise<RoutingDecision> {
    const providerType = (params.preferredProvider ?? this.config.defaultProvider) as LLMProviderType;
    const model = params.model ?? this.config.defaultModel;

    const provider = this.providerManager.getProvider(providerType);
    if (!provider) {
      return this.createFallbackDecision(params, 'manual');
    }

    return this.createDecision(provider, providerType, model, 'manual');
  }

  /**
   * Rule-based selection - evaluate rules to find matching provider
   */
  private async selectRuleBased(params: ChatParams): Promise<RoutingDecision> {
    const result = this.ruleEngine.evaluate(params);

    if (result) {
      const { rule, rulesEvaluated } = result;
      const providerType = rule.action.provider as LLMProviderType;
      const provider = this.providerManager.getProvider(providerType);

      if (provider) {
        const decision = this.createDecision(
          provider,
          providerType,
          rule.action.model,
          'rule-match',
          rule
        );
        decision.metadata.rulesEvaluated = rulesEvaluated;
        return decision;
      }
    }

    // No rule matched, use default
    const defaultProviderType = this.config.defaultProvider as LLMProviderType;
    const defaultProvider = this.providerManager.getProvider(defaultProviderType);
    if (defaultProvider) {
      return this.createDecision(
        defaultProvider,
        defaultProviderType,
        this.config.defaultModel,
        'default'
      );
    }

    return this.createFallbackDecision(params, 'rule-based');
  }

  /**
   * Cost-optimized selection - choose cheapest available provider
   */
  private async selectCostOptimized(params: ChatParams): Promise<RoutingDecision> {
    const availableProviders = this.providerManager.getAvailableProviders();

    if (availableProviders.length === 0) {
      return this.createFallbackDecision(params, 'cost-optimized');
    }

    let lowestCost = Infinity;
    let selectedType: LLMProviderType = availableProviders[0];
    let selectedProvider: LLMProvider | undefined;
    const alternatives: AlternativeProvider[] = [];

    for (const type of availableProviders) {
      const provider = this.providerManager.getProvider(type);
      if (!provider) continue;

      const { input, output } = provider.getCostPerToken();
      const estimatedCost = this.estimateCostValue(params, input, output);

      alternatives.push({
        provider: type as ExtendedProviderType,
        model: provider.getConfig().model,
        reason: `Estimated cost: $${estimatedCost.toFixed(6)}`,
        estimatedCost,
        excluded: false,
      });

      if (estimatedCost < lowestCost) {
        lowestCost = estimatedCost;
        selectedType = type;
        selectedProvider = provider;
      }
    }

    if (selectedProvider) {
      const config = selectedProvider.getConfig();
      const decision = this.createDecision(
        selectedProvider,
        selectedType,
        config.model,
        'cost-optimization'
      );
      decision.metadata.estimatedCost = this.createCostEstimate(params, selectedProvider);
      decision.metadata.alternativesConsidered = alternatives;
      return decision;
    }

    return this.createFallbackDecision(params, 'cost-optimized');
  }

  /**
   * Performance-optimized selection - choose fastest available provider
   */
  private async selectPerformanceOptimized(params: ChatParams): Promise<RoutingDecision> {
    const availableProviders = this.providerManager.getAvailableProviders();
    const providerMetrics = this.providerManager.getMetrics();

    if (availableProviders.length === 0) {
      return this.createFallbackDecision(params, 'performance-optimized');
    }

    let lowestLatency = Infinity;
    let selectedType: LLMProviderType = availableProviders[0];
    let selectedProvider: LLMProvider | undefined;
    const alternatives: AlternativeProvider[] = [];

    for (const type of availableProviders) {
      const provider = this.providerManager.getProvider(type);
      if (!provider) continue;

      const metrics = providerMetrics[type];
      const avgLatency = metrics?.avgLatencyMs ?? Infinity;

      alternatives.push({
        provider: type as ExtendedProviderType,
        model: provider.getConfig().model,
        reason: `Avg latency: ${avgLatency}ms`,
        estimatedLatencyMs: avgLatency,
        excluded: false,
      });

      if (avgLatency < lowestLatency) {
        lowestLatency = avgLatency;
        selectedType = type;
        selectedProvider = provider;
      }
    }

    if (selectedProvider) {
      const config = selectedProvider.getConfig();
      const decision = this.createDecision(
        selectedProvider,
        selectedType,
        config.model,
        'performance-optimization'
      );
      decision.metadata.estimatedLatencyMs = lowestLatency;
      decision.metadata.alternativesConsidered = alternatives;
      return decision;
    }

    return this.createFallbackDecision(params, 'performance-optimized');
  }

  // ============================================================================
  // Fallback and Execution
  // ============================================================================

  /**
   * Execute request with fallback chain
   */
  private async executeWithFallback(
    params: ChatParams,
    decision: RoutingDecision,
    requestId: string
  ): Promise<ChatResponse> {
    const { fallbackChain, fallbackBehavior } = this.config;
    let lastError: Error | undefined;
    let attempts = 0;

    // Build execution order: decision provider first, then fallback chain
    // Use providerModelId for provider-specific model IDs (ADR-043)
    const executionOrder: Array<{ provider: LLMProviderType; model: string }> = [
      { provider: decision.providerType as LLMProviderType, model: decision.providerModelId },
    ];

    // Add fallback chain entries
    for (const entry of fallbackChain.entries) {
      if (!entry.enabled) continue;
      if (entry.provider === decision.providerType) continue;

      // Only include providers that exist in the base system
      const baseProviders: LLMProviderType[] = ['claude', 'openai', 'ollama'];
      if (!baseProviders.includes(entry.provider as LLMProviderType)) continue;

      for (const model of entry.models) {
        executionOrder.push({ provider: entry.provider as LLMProviderType, model });
      }
    }

    // Execute with fallback
    for (const { provider: providerType, model } of executionOrder) {
      if (attempts >= fallbackBehavior.maxAttempts) break;

      const provider = this.providerManager.getProvider(providerType);
      if (!provider) continue;

      attempts++;

      const callStartTime = Date.now();

      try {
        const response = await provider.generate(params.messages, {
          model,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          systemPrompt: params.systemPrompt,
          timeoutMs: params.timeoutMs,
          skipCache: params.skipCache,
          metadata: params.metadata,
        });

        const callLatency = Date.now() - callStartTime;

        // Record success in legacy tracker
        this.metrics.recordSuccess(providerType as ExtendedProviderType);

        // Record enhanced metrics
        this.routerMetrics.recordRoutingDecision(decision, callLatency, {
          agentType: params.agentType,
          success: true,
          tokenUsage: response.usage,
          cost: response.cost,
        });

        this.routerMetrics.recordProviderCall(
          providerType as ExtendedProviderType,
          model,
          callLatency,
          response.usage.totalTokens,
          {
            inputTokens: response.usage.promptTokens,
            outputTokens: response.usage.completionTokens,
            success: true,
            cost: response.cost.totalCost,
            agentType: params.agentType,
          }
        );

        // Record cost metrics
        this.costMetrics.recordCostFromInfo(
          providerType as ExtendedProviderType,
          model,
          response.usage,
          response.cost,
          {
            agentType: params.agentType,
            requestId: response.requestId,
          }
        );

        return {
          content: response.content,
          model: response.model,
          providerModelId: response.model,
          provider: response.provider as ExtendedProviderType,
          usage: response.usage,
          cost: response.cost,
          latencyMs: response.latencyMs,
          finishReason: response.finishReason,
          cached: response.cached,
          requestId: response.requestId,
          routingDecision: decision,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const callLatency = Date.now() - callStartTime;

        // Record failure in legacy tracker
        this.metrics.recordFailure(providerType as ExtendedProviderType);

        // Record failed call in enhanced metrics
        this.routerMetrics.recordProviderCall(
          providerType as ExtendedProviderType,
          model,
          callLatency,
          0,
          {
            success: false,
            agentType: params.agentType,
          }
        );

        // Record fallback if moving to next provider
        if (attempts < executionOrder.length) {
          const nextProvider = executionOrder[attempts];
          if (nextProvider) {
            this.routerMetrics.recordFallback(
              providerType as ExtendedProviderType,
              nextProvider.provider as ExtendedProviderType,
              lastError.message,
              params.agentType
            );
          }
        }

        // Check if error is retryable
        if (isLLMError(error) && !error.retryable) {
          throw error;
        }

        // Delay before retry
        if (attempts < fallbackBehavior.maxAttempts) {
          await this.delay(fallbackBehavior.delayMs);
        }
      }
    }

    throw createLLMError(
      `All providers failed after ${attempts} attempts: ${lastError?.message ?? 'Unknown error'}`,
      'PROVIDER_UNAVAILABLE',
      { retryable: false, cause: lastError }
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Create a routing decision with proper model ID normalization (ADR-043)
   */
  private createDecision(
    provider: LLMProvider,
    providerType: LLMProviderType,
    model: string,
    reason: SelectionReason,
    matchedRule?: RoutingRule
  ): RoutingDecision {
    // Normalize to canonical model ID and map to provider-specific
    const { canonicalModel, providerModelId } = this.resolveModelIds(model, providerType);

    return {
      provider,
      providerType: providerType as ExtendedProviderType,
      model: canonicalModel,
      providerModelId,
      reason,
      matchedRule,
      confidence: reason === 'rule-match' ? 0.95 : 0.8,
      metadata: {
        decisionTimeMs: 0,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Resolve canonical and provider-specific model IDs (ADR-043)
   * Handles bidirectional mapping between canonical and provider formats
   */
  private resolveModelIds(
    model: string,
    providerType: LLMProviderType
  ): { canonicalModel: string; providerModelId: string } {
    // Map provider type to model-mapping provider format
    const providerMapping: Record<LLMProviderType, ModelProviderType> = {
      claude: 'anthropic',
      openai: 'openai',
      ollama: 'ollama',
      openrouter: 'openrouter',
      gemini: 'gemini',
      'azure-openai': 'azure',
      bedrock: 'bedrock',
    };
    const mappingProvider = providerMapping[providerType];
    if (!mappingProvider) {
      // Unknown provider type - pass through unchanged
      return { canonicalModel: model, providerModelId: model };
    }

    try {
      // Try to normalize the model ID to canonical form
      const canonicalModel = normalizeModelId(model);
      // Then map back to provider-specific format
      const providerModelId = mapModelId(canonicalModel, mappingProvider);
      return { canonicalModel, providerModelId };
    } catch {
      // If normalization fails, the model might already be in provider-specific format
      // Try to map it directly
      try {
        const mapping = getModelMapping(model);
        if (mapping) {
          // Model is canonical, map to provider
          const providerModelId = mapModelId(model, mappingProvider);
          return { canonicalModel: model, providerModelId };
        }
      } catch {
        // Model not found in mappings - pass through unchanged
      }
      // Unknown model - use as-is for both
      return { canonicalModel: model, providerModelId: model };
    }
  }

  /**
   * Create a fallback decision when primary selection fails
   */
  private createFallbackDecision(
    params: ChatParams,
    fromMode: string
  ): RoutingDecision {
    // Try fallback chain in order
    for (const entry of this.config.fallbackChain.entries) {
      if (!entry.enabled) continue;

      // Only use base providers
      const baseProviders: LLMProviderType[] = ['claude', 'openai', 'ollama'];
      if (!baseProviders.includes(entry.provider as LLMProviderType)) continue;

      const provider = this.providerManager.getProvider(entry.provider as LLMProviderType);
      if (provider) {
        return this.createDecision(
          provider,
          entry.provider as LLMProviderType,
          entry.models[0],
          'fallback'
        );
      }
    }

    // Last resort: try any available provider
    const available = this.providerManager.getAvailableProviders();
    if (available.length > 0) {
      const type = available[0];
      const provider = this.providerManager.getProvider(type)!;
      return this.createDecision(
        provider,
        type,
        provider.getConfig().model,
        'fallback'
      );
    }

    throw createLLMError(
      `No providers available for ${fromMode} selection`,
      'PROVIDER_UNAVAILABLE',
      { retryable: false }
    );
  }

  /**
   * Generate cache key for decision caching
   */
  private generateCacheKey(params: ChatParams): string {
    const keyParts = [
      this.config.mode,
      params.agentType ?? 'default',
      params.complexity ?? 'medium',
      params.requiresTools ? 'tools' : 'no-tools',
      params.preferredProvider ?? 'any',
    ];
    return keyParts.join(':');
  }

  /**
   * Estimate cost value for a request
   */
  private estimateCostValue(
    params: ChatParams,
    inputCostPerToken: number,
    outputCostPerToken: number
  ): number {
    let inputTokens = 0;

    if (params.systemPrompt) {
      inputTokens += Math.ceil(params.systemPrompt.length / 4);
    }

    for (const message of params.messages) {
      inputTokens += Math.ceil(message.content.length / 4);
    }

    const outputTokens = params.maxTokens ?? 1000;

    return inputTokens * inputCostPerToken + outputTokens * outputCostPerToken;
  }

  /**
   * Create cost estimate object
   */
  private createCostEstimate(params: ChatParams, provider: LLMProvider): CostEstimate {
    const { input, output } = provider.getCostPerToken();

    let inputTokens = 0;
    if (params.systemPrompt) {
      inputTokens += Math.ceil(params.systemPrompt.length / 4);
    }
    for (const message of params.messages) {
      inputTokens += Math.ceil(message.content.length / 4);
    }

    const outputTokens = params.maxTokens ?? 1000;
    const totalCostUsd = inputTokens * input + outputTokens * output;

    return {
      inputTokens,
      outputTokens,
      totalCostUsd,
      inputCostPer1M: input * 1000000,
      outputCostPer1M: output * 1000000,
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Ensure router is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// ============================================================================
// Metrics Tracker
// ============================================================================

/**
 * Internal metrics tracker for routing decisions
 */
class RouterMetricsTracker {
  private decisions: Map<ExtendedProviderType, ProviderRoutingMetrics> = new Map();
  private decisionsByMode: Record<RoutingMode, number> = {
    'manual': 0,
    'rule-based': 0,
    'cost-optimized': 0,
    'performance-optimized': 0,
  };
  private totalDecisions: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private totalRulesEvaluated: number = 0;
  private rulesMatched: number = 0;
  private fallbackCount: number = 0;
  private startTime: Date = new Date();

  recordDecision(decision: RoutingDecision, mode: RoutingMode): void {
    this.totalDecisions++;
    this.decisionsByMode[mode]++;

    if (decision.metadata.rulesEvaluated) {
      this.totalRulesEvaluated += decision.metadata.rulesEvaluated;
    }

    if (decision.matchedRule) {
      this.rulesMatched++;
    }

    if (decision.reason === 'fallback') {
      this.fallbackCount++;
    }

    // Update provider metrics
    let metrics = this.decisions.get(decision.providerType);
    if (!metrics) {
      metrics = this.createEmptyMetrics(decision.providerType);
      this.decisions.set(decision.providerType, metrics);
    }

    metrics.selectionCount++;
    if (decision.reason === 'rule-match') {
      metrics.ruleMatchCount++;
    }
    if (decision.reason === 'fallback') {
      metrics.fallbackCount++;
    }
  }

  recordSuccess(provider: ExtendedProviderType): void {
    const metrics = this.decisions.get(provider);
    if (metrics) {
      const successCount = metrics.successRate * metrics.selectionCount;
      metrics.successRate = (successCount + 1) / metrics.selectionCount;
    }
  }

  recordFailure(provider: ExtendedProviderType): void {
    // Success rate calculation - no change needed
  }

  recordCacheHit(): void {
    this.cacheHits++;
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  getMetrics(): RouterMetrics {
    const byProvider: Partial<Record<ExtendedProviderType, ProviderRoutingMetrics>> = {};

    for (const [provider, metrics] of this.decisions) {
      byProvider[provider] = { ...metrics };
    }

    const ruleMatchRate = this.totalDecisions > 0
      ? this.rulesMatched / this.totalDecisions
      : 0;

    return {
      byProvider,
      totalDecisions: this.totalDecisions,
      decisionsByMode: { ...this.decisionsByMode },
      avgDecisionTimeMs: 0,
      p95DecisionTimeMs: 0,
      p99DecisionTimeMs: 0,
      fallbackRate: this.totalDecisions > 0 ? this.fallbackCount / this.totalDecisions : 0,
      ruleMatchRate,
      estimatedCostSavings: 0,
      ruleStats: {
        totalEvaluated: this.totalRulesEvaluated,
        matched: this.rulesMatched,
        avgRulesPerDecision:
          this.totalDecisions > 0 ? this.totalRulesEvaluated / this.totalDecisions : 0,
      },
      cacheStats: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate:
          this.cacheHits + this.cacheMisses > 0
            ? this.cacheHits / (this.cacheHits + this.cacheMisses)
            : 0,
      },
      period: {
        start: this.startTime,
        end: new Date(),
      },
    };
  }

  reset(): void {
    this.decisions.clear();
    this.decisionsByMode = {
      'manual': 0,
      'rule-based': 0,
      'cost-optimized': 0,
      'performance-optimized': 0,
    };
    this.totalDecisions = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalRulesEvaluated = 0;
    this.rulesMatched = 0;
    this.fallbackCount = 0;
    this.startTime = new Date();
  }

  private createEmptyMetrics(provider: ExtendedProviderType): ProviderRoutingMetrics {
    return {
      provider,
      selectionCount: 0,
      ruleMatchCount: 0,
      fallbackCount: 0,
      avgDecisionTimeMs: 0,
      successRate: 1,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      totalCost: 0,
      totalTokens: 0,
      circuitState: 'closed',
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a HybridRouter with default configuration
 */
export function createHybridRouter(
  providerManager: ProviderManager,
  config?: Partial<RouterConfig>
): HybridRouter {
  return new HybridRouter(providerManager, config);
}

/**
 * Create a HybridRouter optimized for QE agents
 */
export function createQERouter(providerManager: ProviderManager): HybridRouter {
  return new HybridRouter(providerManager, {
    mode: 'rule-based',
    rules: DEFAULT_QE_ROUTING_RULES,
    defaultProvider: 'claude',
    defaultModel: 'claude-sonnet-4-20250514',
    enableMetrics: true,
    cacheDecisions: true,
  });
}
