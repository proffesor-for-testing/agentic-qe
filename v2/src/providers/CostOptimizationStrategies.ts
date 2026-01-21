/**
 * Cost Optimization Strategies for LLM Independence
 *
 * Provides intelligent cost optimization through:
 * - Prompt compression (6-10% token savings)
 * - Request batching for bulk operations
 * - Smart caching with task-specific TTLs
 * - Model right-sizing based on budget and complexity
 *
 * Designed as standalone utilities for integration with HybridRouter.
 *
 * @module providers/CostOptimizationStrategies
 * @version 1.0.0
 */

import { LLMCompletionOptions, LLMCompletionResponse } from './ILLMProvider';
import { TaskComplexity, BudgetStatus } from './HybridRouter';
import { TaskType, ModelConstraints } from '../routing/ModelCapabilityRegistry';
import { Logger } from '../utils/Logger';

/**
 * Request group for batching
 */
export interface RequestGroup {
  /** Group identifier based on similarity */
  groupId: string;
  /** Requests in this group */
  requests: LLMCompletionOptions[];
  /** Common characteristics */
  characteristics: {
    averageTokens: number;
    hasCode: boolean;
    taskType?: TaskType;
    complexity?: TaskComplexity;
  };
  /** Estimated savings from batching */
  estimatedSavings: number;
}

/**
 * Cache strategy configuration
 */
export interface CacheStrategy {
  /** Task type this strategy applies to */
  taskType: TaskType;
  /** Time-to-live in seconds */
  ttlSeconds: number;
  /** Aggressive caching (cache more aggressively) */
  aggressive: boolean;
  /** Cache key generator function */
  keyGenerator: (options: LLMCompletionOptions) => string;
  /** Confidence threshold for cache hits (0-1) */
  confidenceThreshold: number;
}

/**
 * Prompt compression result
 */
export interface CompressionResult {
  /** Compressed prompt */
  compressed: string;
  /** Original prompt */
  original: string;
  /** Tokens saved (estimated) */
  tokensSaved: number;
  /** Compression ratio (0-1, higher = more compression) */
  ratio: number;
  /** Techniques applied */
  techniques: string[];
}

/**
 * Model right-sizing recommendation
 */
export interface ModelRightSizingResult {
  /** Should downgrade to smaller model */
  shouldDowngrade: boolean;
  /** Recommended model ID */
  recommendedModel?: string;
  /** Reason for recommendation */
  reason: string;
  /** Estimated cost savings */
  estimatedSavings?: number;
  /** Quality impact score (0-1, 1 = no impact) */
  qualityImpact: number;
}

/**
 * Batch execution result
 */
export interface BatchExecutionResult {
  /** Individual responses */
  responses: LLMCompletionResponse[];
  /** Total cost */
  totalCost: number;
  /** Cost savings from batching */
  savings: number;
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Configuration for cost optimization
 */
export interface CostOptimizationConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Enable prompt compression */
  enableCompression?: boolean;
  /** Enable request batching */
  enableBatching?: boolean;
  /** Enable smart caching */
  enableSmartCaching?: boolean;
  /** Minimum compression ratio to apply (0-1) */
  minCompressionRatio?: number;
  /** Maximum batch size */
  maxBatchSize?: number;
  /** Default cache TTL in seconds */
  defaultCacheTTL?: number;
}

/**
 * PromptCompressor - Reduce token usage through intelligent compression
 *
 * Achieves 6-10% token savings through:
 * - Redundant whitespace removal
 * - Common pattern abbreviation
 * - Token-efficient phrasing
 */
export class PromptCompressor {
  private readonly logger: Logger;
  private readonly config: Required<CostOptimizationConfig>;

  constructor(config: CostOptimizationConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      debug: config.debug ?? false,
      enableCompression: config.enableCompression ?? true,
      enableBatching: config.enableBatching ?? true,
      enableSmartCaching: config.enableSmartCaching ?? true,
      minCompressionRatio: config.minCompressionRatio ?? 0.05,
      maxBatchSize: config.maxBatchSize ?? 10,
      defaultCacheTTL: config.defaultCacheTTL ?? 3600
    };
  }

  /**
   * Compress whitespace - remove redundant spaces, newlines
   */
  compressWhitespace(prompt: string): string {
    return prompt
      // Replace multiple spaces with single space
      .replace(/  +/g, ' ')
      // Replace multiple newlines with double newline (preserve paragraph breaks)
      .replace(/\n\n\n+/g, '\n\n')
      // Trim lines
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Remove trailing/leading whitespace
      .trim();
  }

  /**
   * Abbreviate common patterns to save tokens
   */
  abbreviatePatterns(prompt: string): string {
    const abbreviations: Array<{ pattern: RegExp; replacement: string }> = [
      // Code-related patterns
      { pattern: /\bfunction\b/gi, replacement: 'fn' },
      { pattern: /\bconstant\b/gi, replacement: 'const' },
      { pattern: /\bvariable\b/gi, replacement: 'var' },
      { pattern: /\bparameter\b/gi, replacement: 'param' },
      { pattern: /\bargument\b/gi, replacement: 'arg' },
      { pattern: /\bconfiguration\b/gi, replacement: 'config' },
      { pattern: /\benvironment\b/gi, replacement: 'env' },
      { pattern: /\bdocumentation\b/gi, replacement: 'docs' },
      { pattern: /\bapplication\b/gi, replacement: 'app' },
      { pattern: /\bdatabase\b/gi, replacement: 'db' },
      { pattern: /\brepository\b/gi, replacement: 'repo' },

      // Test-related patterns
      { pattern: /\btest case\b/gi, replacement: 'test' },
      { pattern: /\bunit test\b/gi, replacement: 'unit' },
      { pattern: /\bintegration test\b/gi, replacement: 'integration' },

      // Common phrases
      { pattern: /\bfor example\b/gi, replacement: 'e.g.' },
      { pattern: /\bthat is\b/gi, replacement: 'i.e.' },
      { pattern: /\band so on\b/gi, replacement: 'etc.' }
    ];

    let compressed = prompt;
    const appliedAbbreviations: string[] = [];

    for (const { pattern, replacement } of abbreviations) {
      const before = compressed;
      compressed = compressed.replace(pattern, replacement);
      if (compressed !== before) {
        appliedAbbreviations.push(`${pattern.source} → ${replacement}`);
      }
    }

    if (this.config.debug && appliedAbbreviations.length > 0) {
      this.logger.debug('Applied abbreviations', {
        count: appliedAbbreviations.length,
        examples: appliedAbbreviations.slice(0, 3)
      });
    }

    return compressed;
  }

  /**
   * Optimize token usage through efficient phrasing
   */
  optimizeTokenUsage(prompt: string): string {
    let optimized = prompt;

    // Remove filler words that don't add meaning
    const fillerWords = [
      /\bvery\s+/gi,
      /\breally\s+/gi,
      /\bactually\s+/gi,
      /\bjust\s+/gi,
      /\bbasically\s+/gi,
      /\bsimply\s+/gi
    ];

    fillerWords.forEach(pattern => {
      optimized = optimized.replace(pattern, '');
    });

    // Simplify verbose phrases
    const verbosePatterns: Array<{ pattern: RegExp; replacement: string }> = [
      { pattern: /\bin order to\b/gi, replacement: 'to' },
      { pattern: /\bdue to the fact that\b/gi, replacement: 'because' },
      { pattern: /\bat this point in time\b/gi, replacement: 'now' },
      { pattern: /\bin the event that\b/gi, replacement: 'if' },
      { pattern: /\bprior to\b/gi, replacement: 'before' },
      { pattern: /\bsubsequent to\b/gi, replacement: 'after' }
    ];

    verbosePatterns.forEach(({ pattern, replacement }) => {
      optimized = optimized.replace(pattern, replacement);
    });

    return optimized;
  }

  /**
   * Full compression pipeline
   */
  compress(prompt: string): CompressionResult {
    if (!this.config.enableCompression) {
      return {
        compressed: prompt,
        original: prompt,
        tokensSaved: 0,
        ratio: 0,
        techniques: []
      };
    }

    const original = prompt;
    const techniques: string[] = [];

    // Apply compression techniques
    let compressed = this.compressWhitespace(prompt);
    techniques.push('whitespace');

    compressed = this.abbreviatePatterns(compressed);
    techniques.push('abbreviations');

    compressed = this.optimizeTokenUsage(compressed);
    techniques.push('token-optimization');

    // Calculate savings (rough estimate: 1 token ≈ 4 characters)
    const originalTokens = Math.ceil(original.length / 4);
    const compressedTokens = Math.ceil(compressed.length / 4);
    const tokensSaved = Math.max(0, originalTokens - compressedTokens);
    const ratio = originalTokens > 0 ? tokensSaved / originalTokens : 0;

    // Only return compressed version if meets minimum ratio
    if (ratio < this.config.minCompressionRatio) {
      if (this.config.debug) {
        this.logger.debug('Compression below threshold, using original', {
          ratio: ratio.toFixed(3),
          threshold: this.config.minCompressionRatio
        });
      }
      return {
        compressed: original,
        original,
        tokensSaved: 0,
        ratio: 0,
        techniques: []
      };
    }

    if (this.config.debug) {
      this.logger.debug('Prompt compressed', {
        originalLength: original.length,
        compressedLength: compressed.length,
        tokensSaved,
        ratio: ratio.toFixed(3),
        techniques
      });
    }

    return {
      compressed,
      original,
      tokensSaved,
      ratio,
      techniques
    };
  }

  /**
   * Compress LLM completion options
   */
  compressOptions(options: LLMCompletionOptions): {
    options: LLMCompletionOptions;
    result: CompressionResult;
  } {
    // Compress message content
    const compressedMessages = options.messages.map(msg => {
      if (typeof msg.content === 'string') {
        const result = this.compress(msg.content);
        return { ...msg, content: result.compressed };
      }

      // Handle array content (compress text blocks)
      const compressedContent = msg.content.map(block => {
        if (block.type === 'text' && block.text) {
          const result = this.compress(block.text);
          return { ...block, text: result.compressed };
        }
        return block;
      });

      return { ...msg, content: compressedContent };
    });

    // Compress system prompts
    const compressedSystem = options.system?.map(sys => {
      const result = this.compress(sys.text);
      return { ...sys, text: result.compressed };
    });

    // Calculate overall compression
    const originalText = this.extractAllText(options);
    const compressedText = this.extractAllText({
      ...options,
      messages: compressedMessages,
      system: compressedSystem
    });

    const originalTokens = Math.ceil(originalText.length / 4);
    const compressedTokens = Math.ceil(compressedText.length / 4);

    const compressionResult: CompressionResult = {
      compressed: compressedText,
      original: originalText,
      tokensSaved: originalTokens - compressedTokens,
      ratio: originalTokens > 0 ? (originalTokens - compressedTokens) / originalTokens : 0,
      techniques: ['full-options-compression']
    };

    return {
      options: {
        ...options,
        messages: compressedMessages,
        system: compressedSystem
      },
      result: compressionResult
    };
  }

  /**
   * Extract all text from options
   */
  private extractAllText(options: LLMCompletionOptions): string {
    const parts: string[] = [];

    if (options.system) {
      parts.push(...options.system.map(s => s.text));
    }

    options.messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else {
        parts.push(...msg.content.filter(c => c.type === 'text').map(c => c.text || ''));
      }
    });

    return parts.join('\n');
  }
}

/**
 * RequestBatcher - Batch similar requests for cost efficiency
 */
export class RequestBatcher {
  private readonly logger: Logger;
  private readonly config: Required<CostOptimizationConfig>;

  constructor(config: CostOptimizationConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      debug: config.debug ?? false,
      enableCompression: config.enableCompression ?? true,
      enableBatching: config.enableBatching ?? true,
      enableSmartCaching: config.enableSmartCaching ?? true,
      minCompressionRatio: config.minCompressionRatio ?? 0.05,
      maxBatchSize: config.maxBatchSize ?? 10,
      defaultCacheTTL: config.defaultCacheTTL ?? 3600
    };
  }

  /**
   * Group similar requests for batch processing
   */
  groupSimilarRequests(requests: LLMCompletionOptions[]): RequestGroup[] {
    if (!this.config.enableBatching || requests.length === 0) {
      return [];
    }

    const groups = new Map<string, LLMCompletionOptions[]>();

    // Group by similarity characteristics
    requests.forEach(request => {
      const groupKey = this.calculateGroupKey(request);
      const existing = groups.get(groupKey) || [];
      existing.push(request);
      groups.set(groupKey, existing);
    });

    // Convert to RequestGroup objects
    const requestGroups: RequestGroup[] = [];

    groups.forEach((groupRequests, groupId) => {
      // Only create groups with 2+ requests
      if (groupRequests.length < 2) {
        return;
      }

      // Limit group size
      const batches = this.splitIntoBatches(groupRequests, this.config.maxBatchSize);

      batches.forEach((batch, index) => {
        const characteristics = this.analyzeGroupCharacteristics(batch);
        const estimatedSavings = this.estimateBatchSavings(batch);

        requestGroups.push({
          groupId: `${groupId}-${index}`,
          requests: batch,
          characteristics,
          estimatedSavings
        });
      });
    });

    if (this.config.debug) {
      this.logger.debug('Requests grouped for batching', {
        totalRequests: requests.length,
        groups: requestGroups.length,
        largestGroup: Math.max(...requestGroups.map(g => g.requests.length))
      });
    }

    return requestGroups;
  }

  /**
   * Estimate savings from batching
   */
  estimateBatchSavings(requests: LLMCompletionOptions[]): number {
    if (requests.length < 2) {
      return 0;
    }

    // Rough estimate: batching saves ~15% on overhead per request after first
    const avgCostPerRequest = 0.001; // $0.001 per request estimate
    const overheadSavings = (requests.length - 1) * avgCostPerRequest * 0.15;

    return overheadSavings;
  }

  /**
   * Calculate group key for similarity
   */
  private calculateGroupKey(request: LLMCompletionOptions): string {
    const parts: string[] = [];

    // Model
    parts.push(request.model);

    // Temperature (rounded)
    const temp = request.temperature ?? 0.7;
    parts.push(`temp-${Math.round(temp * 10)}`);

    // Max tokens (bucketed)
    const maxTokens = request.maxTokens ?? 1024;
    const tokenBucket = Math.floor(maxTokens / 1000) * 1000;
    parts.push(`tokens-${tokenBucket}`);

    // Has system prompt
    parts.push(request.system && request.system.length > 0 ? 'sys' : 'nosys');

    // Content characteristics
    const allContent = this.extractAllText(request);
    const hasCode = /```/.test(allContent);
    parts.push(hasCode ? 'code' : 'text');

    return parts.join('|');
  }

  /**
   * Analyze group characteristics
   */
  private analyzeGroupCharacteristics(requests: LLMCompletionOptions[]): RequestGroup['characteristics'] {
    const allContent = requests.map(r => this.extractAllText(r)).join('\n');
    const totalLength = allContent.length;
    const averageTokens = Math.ceil(totalLength / (requests.length * 4));
    const hasCode = /```/.test(allContent);

    return {
      averageTokens,
      hasCode
    };
  }

  /**
   * Split requests into batches
   */
  private splitIntoBatches(requests: LLMCompletionOptions[], maxSize: number): LLMCompletionOptions[][] {
    const batches: LLMCompletionOptions[][] = [];

    for (let i = 0; i < requests.length; i += maxSize) {
      batches.push(requests.slice(i, i + maxSize));
    }

    return batches;
  }

  /**
   * Extract all text from request
   */
  private extractAllText(request: LLMCompletionOptions): string {
    const parts: string[] = [];

    if (request.system) {
      parts.push(...request.system.map(s => s.text));
    }

    request.messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else {
        parts.push(...msg.content.filter(c => c.type === 'text').map(c => c.text || ''));
      }
    });

    return parts.join('\n');
  }
}

/**
 * SmartCacheStrategy - Task-specific caching strategies
 */
export class SmartCacheStrategy {
  private readonly logger: Logger;
  private readonly config: Required<CostOptimizationConfig>;
  private readonly strategies: Map<TaskType, CacheStrategy>;

  constructor(config: CostOptimizationConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      debug: config.debug ?? false,
      enableCompression: config.enableCompression ?? true,
      enableBatching: config.enableBatching ?? true,
      enableSmartCaching: config.enableSmartCaching ?? true,
      minCompressionRatio: config.minCompressionRatio ?? 0.05,
      maxBatchSize: config.maxBatchSize ?? 10,
      defaultCacheTTL: config.defaultCacheTTL ?? 3600
    };

    this.strategies = new Map();
    this.initializeDefaultStrategies();
  }

  /**
   * Get cache strategy for task type
   */
  getCacheStrategy(taskType: TaskType): CacheStrategy {
    const strategy = this.strategies.get(taskType);

    if (!strategy) {
      // Return default strategy
      return {
        taskType,
        ttlSeconds: this.config.defaultCacheTTL,
        aggressive: false,
        confidenceThreshold: 0.85,
        keyGenerator: this.defaultKeyGenerator.bind(this)
      };
    }

    return strategy;
  }

  /**
   * Check if result should be cached
   */
  shouldCache(options: LLMCompletionOptions, response: LLMCompletionResponse): boolean {
    if (!this.config.enableSmartCaching) {
      return false;
    }

    // Don't cache errors
    if (response.stop_reason !== 'end_turn') {
      return false;
    }

    // Don't cache streaming responses
    if (options.stream) {
      return false;
    }

    // Don't cache very short responses (likely errors or incomplete)
    const responseText = response.content.map(c => c.text).join('');
    if (responseText.length < 50) {
      return false;
    }

    // Don't cache very expensive responses (might be one-off)
    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    if (totalTokens > 10000) {
      return false;
    }

    return true;
  }

  /**
   * Generate cache key for request
   */
  generateCacheKey(options: LLMCompletionOptions, taskType?: TaskType): string {
    if (taskType) {
      const strategy = this.getCacheStrategy(taskType);
      return strategy.keyGenerator(options);
    }

    return this.defaultKeyGenerator(options);
  }

  /**
   * Default cache key generator
   */
  private defaultKeyGenerator(options: LLMCompletionOptions): string {
    const parts: string[] = [];

    // Model
    parts.push(options.model);

    // Extract query (last user message)
    const userMessages = options.messages.filter(m => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1];

    if (lastUserMsg) {
      const content = typeof lastUserMsg.content === 'string'
        ? lastUserMsg.content
        : lastUserMsg.content.filter(c => c.type === 'text').map(c => c.text).join('');

      // Create hash from content (simple hash for cache key)
      const hash = this.simpleHash(content);
      parts.push(hash);
    }

    // Temperature
    const temp = options.temperature ?? 0.7;
    parts.push(`t${Math.round(temp * 10)}`);

    return parts.join(':');
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Initialize default caching strategies
   */
  private initializeDefaultStrategies(): void {
    // Test generation - moderate caching (tests change frequently)
    this.strategies.set('test-generation', {
      taskType: 'test-generation',
      ttlSeconds: 1800, // 30 minutes
      aggressive: false,
      confidenceThreshold: 0.90,
      keyGenerator: this.testGenerationKeyGenerator.bind(this)
    });

    // Coverage analysis - aggressive caching (code doesn't change often)
    this.strategies.set('coverage-analysis', {
      taskType: 'coverage-analysis',
      ttlSeconds: 7200, // 2 hours
      aggressive: true,
      confidenceThreshold: 0.80,
      keyGenerator: this.defaultKeyGenerator.bind(this)
    });

    // Code review - moderate caching
    this.strategies.set('code-review', {
      taskType: 'code-review',
      ttlSeconds: 3600, // 1 hour
      aggressive: false,
      confidenceThreshold: 0.85,
      keyGenerator: this.defaultKeyGenerator.bind(this)
    });

    // Bug detection - conservative caching (need fresh analysis)
    this.strategies.set('bug-detection', {
      taskType: 'bug-detection',
      ttlSeconds: 900, // 15 minutes
      aggressive: false,
      confidenceThreshold: 0.92,
      keyGenerator: this.defaultKeyGenerator.bind(this)
    });

    // Documentation - very aggressive caching (stable content)
    this.strategies.set('documentation', {
      taskType: 'documentation',
      ttlSeconds: 14400, // 4 hours
      aggressive: true,
      confidenceThreshold: 0.75,
      keyGenerator: this.defaultKeyGenerator.bind(this)
    });

    // Refactoring - conservative caching
    this.strategies.set('refactoring', {
      taskType: 'refactoring',
      ttlSeconds: 1800, // 30 minutes
      aggressive: false,
      confidenceThreshold: 0.88,
      keyGenerator: this.defaultKeyGenerator.bind(this)
    });

    // Performance testing - moderate caching
    this.strategies.set('performance-testing', {
      taskType: 'performance-testing',
      ttlSeconds: 3600, // 1 hour
      aggressive: false,
      confidenceThreshold: 0.85,
      keyGenerator: this.defaultKeyGenerator.bind(this)
    });

    // Security scanning - conservative caching (security landscape changes)
    this.strategies.set('security-scanning', {
      taskType: 'security-scanning',
      ttlSeconds: 1800, // 30 minutes
      aggressive: false,
      confidenceThreshold: 0.90,
      keyGenerator: this.defaultKeyGenerator.bind(this)
    });
  }

  /**
   * Specialized key generator for test generation
   */
  private testGenerationKeyGenerator(options: LLMCompletionOptions): string {
    const parts: string[] = ['test-gen'];

    // Extract source code being tested (if in messages)
    const allContent = options.messages
      .filter(m => m.role === 'user')
      .map(m => typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join(''))
      .join('\n');

    // Look for code blocks
    const codeMatches = allContent.match(/```[\s\S]*?```/g);
    if (codeMatches && codeMatches.length > 0) {
      // Hash the first code block (likely the source under test)
      const hash = this.simpleHash(codeMatches[0]);
      parts.push(hash);
    } else {
      // Hash all content
      const hash = this.simpleHash(allContent);
      parts.push(hash);
    }

    return parts.join(':');
  }
}

/**
 * ModelRightSizer - Budget-aware model selection
 */
export class ModelRightSizer {
  private readonly logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Determine if should use smaller model based on budget
   */
  shouldDowngradeModel(
    complexity: TaskComplexity,
    budgetStatus: BudgetStatus,
    constraints?: ModelConstraints
  ): ModelRightSizingResult {
    // If not over budget and no alert, no need to downgrade
    if (!budgetStatus.isOverBudget && !budgetStatus.alertTriggered) {
      return {
        shouldDowngrade: false,
        reason: 'Budget healthy, no downgrade needed',
        qualityImpact: 1.0
      };
    }

    // Calculate budget pressure (0-1, higher = more pressure)
    const budgetPressure = this.calculateBudgetPressure(budgetStatus);

    // Determine if task allows downgrade
    const downgradePossible = this.canDowngrade(complexity, constraints);

    if (!downgradePossible) {
      return {
        shouldDowngrade: false,
        reason: 'Task complexity requires current model tier',
        qualityImpact: 1.0
      };
    }

    // Decide based on budget pressure and complexity
    const { shouldDowngrade, recommendedTier, qualityImpact } = this.makeDowngradeDecision(
      complexity,
      budgetPressure,
      budgetStatus
    );

    if (!shouldDowngrade) {
      return {
        shouldDowngrade: false,
        reason: 'Budget pressure not severe enough to warrant downgrade',
        qualityImpact: 1.0
      };
    }

    // Calculate estimated savings
    const estimatedSavings = this.estimateSavings(complexity, recommendedTier);

    return {
      shouldDowngrade: true,
      recommendedModel: this.getModelForTier(recommendedTier),
      reason: this.getDowngradeReason(budgetPressure, budgetStatus),
      estimatedSavings,
      qualityImpact
    };
  }

  /**
   * Calculate budget pressure score (0-1)
   */
  private calculateBudgetPressure(budgetStatus: BudgetStatus): number {
    if (budgetStatus.isOverBudget) {
      return 1.0; // Maximum pressure
    }

    // Use utilization percentage as pressure indicator
    return Math.min(budgetStatus.utilizationPercentage / 100, 0.95);
  }

  /**
   * Check if task allows model downgrade
   */
  private canDowngrade(complexity: TaskComplexity, constraints?: ModelConstraints): boolean {
    // Very complex tasks should not be downgraded
    if (complexity === TaskComplexity.VERY_COMPLEX) {
      return false;
    }

    // Check constraints
    if (constraints?.requiredCapabilities && constraints.requiredCapabilities.length > 0) {
      // If specific capabilities required, be conservative
      return complexity === TaskComplexity.SIMPLE;
    }

    return true;
  }

  /**
   * Make downgrade decision
   */
  private makeDowngradeDecision(
    complexity: TaskComplexity,
    budgetPressure: number,
    budgetStatus: BudgetStatus
  ): {
    shouldDowngrade: boolean;
    recommendedTier: 'small' | 'medium' | 'large';
    qualityImpact: number;
  } {
    // Over budget - always downgrade if possible
    if (budgetStatus.isOverBudget) {
      return {
        shouldDowngrade: true,
        recommendedTier: complexity === TaskComplexity.SIMPLE ? 'small' : 'medium',
        qualityImpact: complexity === TaskComplexity.SIMPLE ? 0.95 : 0.85
      };
    }

    // High budget pressure (>80%)
    if (budgetPressure > 0.80) {
      if (complexity === TaskComplexity.SIMPLE || complexity === TaskComplexity.MODERATE) {
        return {
          shouldDowngrade: true,
          recommendedTier: 'medium',
          qualityImpact: 0.90
        };
      }
    }

    // Moderate budget pressure (>60%)
    if (budgetPressure > 0.60) {
      if (complexity === TaskComplexity.SIMPLE) {
        return {
          shouldDowngrade: true,
          recommendedTier: 'small',
          qualityImpact: 0.95
        };
      }
    }

    return {
      shouldDowngrade: false,
      recommendedTier: 'large',
      qualityImpact: 1.0
    };
  }

  /**
   * Get model for tier
   */
  private getModelForTier(tier: 'small' | 'medium' | 'large'): string {
    const modelMap = {
      small: 'claude-haiku-3-5',
      medium: 'claude-sonnet-3-5',
      large: 'claude-opus-4'
    };

    return modelMap[tier];
  }

  /**
   * Estimate cost savings from downgrade
   */
  private estimateSavings(complexity: TaskComplexity, tier: 'small' | 'medium' | 'large'): number {
    // Rough cost estimates per 1M tokens
    const costs = {
      small: 1.00,   // $1 per 1M tokens
      medium: 3.00,  // $3 per 1M tokens
      large: 15.00   // $15 per 1M tokens
    };

    // Estimate tokens per task
    const tokensPerTask = {
      [TaskComplexity.SIMPLE]: 500,
      [TaskComplexity.MODERATE]: 2000,
      [TaskComplexity.COMPLEX]: 5000,
      [TaskComplexity.VERY_COMPLEX]: 10000
    };

    const tokens = tokensPerTask[complexity];
    const currentCost = (costs.large * tokens) / 1_000_000;
    const newCost = (costs[tier] * tokens) / 1_000_000;

    return currentCost - newCost;
  }

  /**
   * Get downgrade reason message
   */
  private getDowngradeReason(budgetPressure: number, budgetStatus: BudgetStatus): string {
    if (budgetStatus.isOverBudget) {
      return 'Budget exceeded - using cost-efficient model to stay within limits';
    }

    if (budgetPressure > 0.80) {
      return `Budget utilization high (${budgetStatus.utilizationPercentage.toFixed(1)}%) - downgrading to preserve budget`;
    }

    return `Budget pressure at ${(budgetPressure * 100).toFixed(1)}% - proactively optimizing costs`;
  }
}

/**
 * CostOptimizationManager - Orchestrates all optimization strategies
 */
export class CostOptimizationManager {
  private readonly compressor: PromptCompressor;
  private readonly batcher: RequestBatcher;
  private readonly cacheStrategy: SmartCacheStrategy;
  private readonly rightSizer: ModelRightSizer;
  private readonly logger: Logger;

  constructor(config: CostOptimizationConfig = {}) {
    this.compressor = new PromptCompressor(config);
    this.batcher = new RequestBatcher(config);
    this.cacheStrategy = new SmartCacheStrategy(config);
    this.rightSizer = new ModelRightSizer();
    this.logger = Logger.getInstance();
  }

  /**
   * Get prompt compressor
   */
  getCompressor(): PromptCompressor {
    return this.compressor;
  }

  /**
   * Get request batcher
   */
  getBatcher(): RequestBatcher {
    return this.batcher;
  }

  /**
   * Get cache strategy manager
   */
  getCacheStrategy(): SmartCacheStrategy {
    return this.cacheStrategy;
  }

  /**
   * Get model right-sizer
   */
  getRightSizer(): ModelRightSizer {
    return this.rightSizer;
  }

  /**
   * Apply all applicable optimizations to a request
   */
  optimizeRequest(
    options: LLMCompletionOptions,
    context?: {
      taskType?: TaskType;
      complexity?: TaskComplexity;
      budgetStatus?: BudgetStatus;
    }
  ): {
    optimizedOptions: LLMCompletionOptions;
    compressionResult?: CompressionResult;
    modelDowngrade?: ModelRightSizingResult;
    estimatedSavings: number;
  } {
    let optimizedOptions = { ...options };
    let estimatedSavings = 0;
    let compressionResult: CompressionResult | undefined;
    let modelDowngrade: ModelRightSizingResult | undefined;

    // 1. Apply prompt compression
    const compressed = this.compressor.compressOptions(optimizedOptions);
    optimizedOptions = compressed.options;
    compressionResult = compressed.result;

    // Estimate savings from compression (rough: $3 per 1M tokens)
    estimatedSavings += (compressionResult.tokensSaved / 1_000_000) * 3;

    // 2. Check for model right-sizing
    if (context?.complexity && context?.budgetStatus) {
      modelDowngrade = this.rightSizer.shouldDowngradeModel(
        context.complexity,
        context.budgetStatus
      );

      if (modelDowngrade.shouldDowngrade && modelDowngrade.recommendedModel) {
        optimizedOptions.model = modelDowngrade.recommendedModel;
        estimatedSavings += modelDowngrade.estimatedSavings || 0;
      }
    }

    this.logger.debug('Request optimized', {
      compressionRatio: compressionResult.ratio.toFixed(3),
      tokensSaved: compressionResult.tokensSaved,
      modelDowngraded: modelDowngrade?.shouldDowngrade,
      estimatedSavings: estimatedSavings.toFixed(4)
    });

    return {
      optimizedOptions,
      compressionResult,
      modelDowngrade,
      estimatedSavings
    };
  }
}
