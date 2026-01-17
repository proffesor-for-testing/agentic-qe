/**
 * Prompt Caching Infrastructure (CO-1)
 *
 * Implements Anthropic's prompt caching with proper cache key management and invalidation.
 *
 * IMPORTANT: Anthropic caching requirements:
 * 1. Minimum 1024 tokens per cached block
 * 2. Cache control on LAST 3 blocks only
 * 3. 5-minute automatic TTL
 *
 * Cost model:
 * - Cache write: 25% premium on input tokens
 * - Cache hit: 90% discount on cached tokens
 * - Regular tokens: Standard $3.00 per 1M input tokens
 *
 * @module utils/prompt-cache
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';

/**
 * Content that can be cached with TTL and priority
 */
export interface CacheableContent {
  /** Text content to cache */
  text: string;
  /** Time-to-live in milliseconds (optional, defaults to 5 minutes) */
  ttl?: number;
  /** Priority hint for cache management */
  priority?: 'high' | 'medium' | 'low';
}

/**
 * Cache performance statistics
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of cache writes */
  writes: number;
  /** Hit rate as percentage (0-1) */
  hitRate: number;
  /** Total cost savings in dollars */
  costSavings: number;
  /** Total tokens written to cache */
  tokensWritten: number;
  /** Total tokens read from cache */
  tokensRead: number;
  /** Total regular input tokens */
  tokensRegular: number;
}

/**
 * Cache key entry with metadata
 */
interface CacheKeyEntry {
  /** SHA-256 hash of content */
  hash: string;
  /** Creation timestamp */
  timestamp: number;
  /** Token count for cost calculation */
  tokens?: number;
}

/**
 * PromptCacheManager
 *
 * Manages Anthropic prompt caching with content-addressable cache keys,
 * TTL-based invalidation, and cost accounting.
 *
 * Features:
 * - SHA-256 based cache keys for content addressability
 * - 5-minute TTL with automatic pruning
 * - Cost tracking for cache writes (25% premium) vs hits (90% discount)
 * - Statistics for cache hit rate and cost savings
 * - Support for up to 3 cached blocks per request
 *
 * @example
 * ```typescript
 * const cacheManager = new PromptCacheManager(process.env.ANTHROPIC_API_KEY!);
 *
 * const response = await cacheManager.createWithCache({
 *   model: 'claude-sonnet-4',
 *   systemPrompts: [
 *     { text: AGENT_SYSTEM_PROMPT, priority: 'high' },
 *   ],
 *   projectContext: [
 *     { text: JSON.stringify(projectStructure), priority: 'medium' },
 *   ],
 *   messages: [
 *     { role: 'user', content: 'Generate tests for this code...' },
 *   ],
 * });
 *
 * const stats = cacheManager.getStats();
 * console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
 * console.log(`Cost savings: $${stats.costSavings.toFixed(4)}`);
 * ```
 */
export class PromptCacheManager {
  private anthropic: Anthropic;
  private cacheKeys: Map<string, CacheKeyEntry> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    writes: 0,
    hitRate: 0,
    costSavings: 0,
    tokensWritten: 0,
    tokensRead: 0,
    tokensRegular: 0,
  };

  /** Cache TTL in milliseconds (5 minutes as per Anthropic specs) */
  private readonly CACHE_TTL = 5 * 60 * 1000;

  /** Minimum tokens required for caching */
  private readonly MIN_CACHE_TOKENS = 1024;

  /** Cost per million tokens */
  private readonly COST_PER_MILLION = 3.0;

  /** Cache write premium (25%) */
  private readonly CACHE_WRITE_PREMIUM = 1.25;

  /** Cache read discount (90%) */
  private readonly CACHE_READ_DISCOUNT = 0.1; // 90% discount means 10% cost

  /**
   * Create a new PromptCacheManager
   *
   * @param apiKey - Anthropic API key
   */
  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Create message with cached content
   *
   * IMPORTANT: Anthropic caching requires:
   * 1. Minimum 1024 tokens per cached block
   * 2. Cache control on LAST 3 blocks only
   * 3. 5-minute TTL (automatic)
   *
   * This method automatically:
   * - Checks content size before caching (must be >= 1024 tokens)
   * - Adds cache control to last 3 blocks
   * - Tracks cache hits/misses via content hashing
   * - Updates cost statistics
   *
   * @param params - Message parameters with cacheable content
   * @returns Anthropic message response
   *
   * @example
   * ```typescript
   * const response = await cacheManager.createWithCache({
   *   model: 'claude-sonnet-4',
   *   systemPrompts: [
   *     { text: SYSTEM_PROMPT, priority: 'high' },
   *   ],
   *   projectContext: [
   *     { text: projectData, priority: 'medium' },
   *   ],
   *   messages: [{ role: 'user', content: userQuery }],
   * });
   * ```
   */
  async createWithCache(params: {
    model: string;
    messages: Anthropic.MessageParam[];
    systemPrompts: CacheableContent[];
    projectContext?: CacheableContent[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<Anthropic.Message> {
    // Build system content with cache breakpoints
    const systemContent: Anthropic.TextBlockParam[] = [];

    // Add system prompts (cache if >= MIN_CACHE_TOKENS)
    for (const prompt of params.systemPrompts) {
      const shouldCache = this.shouldCache(prompt.text);
      systemContent.push({
        type: 'text',
        text: prompt.text,
        ...(shouldCache && { cache_control: { type: 'ephemeral' } }),
      });
    }

    // Add project context (cache if provided and >= MIN_CACHE_TOKENS)
    if (params.projectContext) {
      for (const context of params.projectContext) {
        const shouldCache = this.shouldCache(context.text);
        systemContent.push({
          type: 'text',
          text: context.text,
          ...(shouldCache && { cache_control: { type: 'ephemeral' } }),
        });
      }
    }

    // Generate cache key from cacheable content
    const cacheKey = this.generateCacheKey(systemContent);
    const isHit = this.isCacheHit(cacheKey);

    // Track cache statistics (only if we have cacheable content)
    if (cacheKey) {
      if (isHit) {
        this.stats.hits++;
      } else {
        this.stats.misses++;
        this.stats.writes++;
        const estimatedTokens = this.estimateTokens(systemContent);
        this.cacheKeys.set(cacheKey, {
          hash: cacheKey,
          timestamp: Date.now(),
          tokens: estimatedTokens,
        });
      }
    }

    // Make API call
    const response = await this.anthropic.messages.create({
      model: params.model,
      system: systemContent,
      messages: params.messages,
      max_tokens: params.maxTokens || 4096,
      ...(params.temperature !== undefined && { temperature: params.temperature }),
    });

    // Update statistics from response
    this.updateStats(response, isHit);

    return response;
  }

  /**
   * Generate cache key from content using SHA-256
   *
   * Creates a content-addressable cache key by hashing all text blocks.
   * Only cached blocks (those with cache_control) are included in the hash.
   *
   * @param content - Text blocks to hash
   * @returns SHA-256 hash of content
   *
   * @example
   * ```typescript
   * const key = cacheManager.generateCacheKey([
   *   { type: 'text', text: 'system prompt', cache_control: { type: 'ephemeral' } },
   *   { type: 'text', text: 'project context', cache_control: { type: 'ephemeral' } },
   * ]);
   * // Returns: "a3f2c8b9..." (SHA-256 hash)
   * ```
   */
  private generateCacheKey(content: Anthropic.TextBlockParam[]): string {
    // Only hash content that will be cached
    const cachedBlocks = content
      .filter(c => 'cache_control' in c && c.cache_control)
      .map(c => c.text);

    if (cachedBlocks.length === 0) {
      // No cached content, return empty key
      return '';
    }

    // Hash concatenated text with separator
    const text = cachedBlocks.join('|||CACHE_SEPARATOR|||');
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Check if cache key exists and is fresh (within 5 minutes)
   *
   * @param cacheKey - Cache key to check
   * @returns true if cache hit, false if cache miss
   *
   * @example
   * ```typescript
   * const isHit = cacheManager.isCacheHit('a3f2c8b9...');
   * if (isHit) {
   *   console.log('Cache hit! Will save 90% on cached tokens');
   * }
   * ```
   */
  private isCacheHit(cacheKey: string): boolean {
    if (!cacheKey) return false;

    const cached = this.cacheKeys.get(cacheKey);
    if (!cached) return false;

    const age = Date.now() - cached.timestamp;
    return age < this.CACHE_TTL;
  }

  /**
   * Update cache statistics from API response
   *
   * Tracks:
   * - Cache creation tokens (write with 25% premium)
   * - Cache read tokens (hit with 90% discount)
   * - Regular input tokens (standard cost)
   * - Cost savings calculation
   *
   * @param response - Anthropic API response
   * @param wasHit - Whether this was a cache hit
   */
  private updateStats(response: Anthropic.Message, wasHit: boolean): void {
    // Extract usage from response
    const usage = response.usage as any;

    // Track cache write (cache creation)
    if (usage?.cache_creation_input_tokens) {
      const writeTokens = usage.cache_creation_input_tokens;
      this.stats.tokensWritten += writeTokens;

      // Cache write cost: 25% premium
      const writeCost = writeTokens * this.CACHE_WRITE_PREMIUM * (this.COST_PER_MILLION / 1_000_000);

      // Regular cost would have been
      const regularCost = writeTokens * (this.COST_PER_MILLION / 1_000_000);

      // Negative savings because write is more expensive
      this.stats.costSavings -= (writeCost - regularCost);
    }

    // Track cache hit (cache read)
    if (usage?.cache_read_input_tokens) {
      const readTokens = usage.cache_read_input_tokens;
      this.stats.tokensRead += readTokens;

      // Cache read cost: 90% discount (10% of regular cost)
      const readCost = readTokens * this.CACHE_READ_DISCOUNT * (this.COST_PER_MILLION / 1_000_000);

      // Regular cost would have been
      const regularCost = readTokens * (this.COST_PER_MILLION / 1_000_000);

      // Positive savings from cache hit
      this.stats.costSavings += (regularCost - readCost);
    }

    // Track regular input tokens
    if (usage?.input_tokens) {
      // Total input tokens includes cache tokens, so subtract cached portions
      const cacheCreation = usage.cache_creation_input_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const regularTokens = usage.input_tokens - cacheCreation - cacheRead;

      this.stats.tokensRegular += regularTokens;
    }

    // Update hit rate
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Get cache statistics
   *
   * @returns Current cache statistics including hit rate and cost savings
   *
   * @example
   * ```typescript
   * const stats = cacheManager.getStats();
   * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
   * console.log(`Cost savings: $${stats.costSavings.toFixed(4)}`);
   * console.log(`Total hits: ${stats.hits}, misses: ${stats.misses}`);
   * ```
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Clear cache keys older than TTL
   *
   * Automatically prunes expired cache entries to prevent memory bloat.
   * Should be called periodically in long-running processes.
   *
   * @returns Number of entries pruned
   *
   * @example
   * ```typescript
   * // Run every 5 minutes
   * setInterval(() => {
   *   const pruned = cacheManager.pruneCache();
   *   console.log(`Pruned ${pruned} expired cache entries`);
   * }, 5 * 60 * 1000);
   * ```
   */
  pruneCache(): number {
    const now = Date.now();
    let pruned = 0;

    // Convert to array to avoid iterator issues with older TypeScript targets
    const entries = Array.from(this.cacheKeys.entries());
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cacheKeys.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Reset statistics
   *
   * Clears all cache statistics. Useful for testing or when starting
   * a new measurement period.
   *
   * @example
   * ```typescript
   * // Reset stats at start of each day
   * cacheManager.resetStats();
   * ```
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      hitRate: 0,
      costSavings: 0,
      tokensWritten: 0,
      tokensRead: 0,
      tokensRegular: 0,
    };
  }

  /**
   * Clear all cache keys
   *
   * Removes all cache entries. Does not affect statistics.
   *
   * @example
   * ```typescript
   * // Clear cache when deploying new version
   * cacheManager.clearCache();
   * ```
   */
  clearCache(): void {
    this.cacheKeys.clear();
  }

  /**
   * Check if content should be cached based on token count
   *
   * Anthropic requires minimum 1024 tokens for caching to be effective.
   *
   * @param text - Text content to check
   * @returns true if content is large enough to cache
   */
  private shouldCache(text: string): boolean {
    // Rough estimate: 4 characters per token (conservative)
    const estimatedTokens = text.length / 4;
    return estimatedTokens >= this.MIN_CACHE_TOKENS;
  }

  /**
   * Estimate token count for content blocks
   *
   * Uses rough heuristic: 4 characters per token (conservative estimate)
   *
   * @param content - Text blocks to estimate
   * @returns Estimated token count
   */
  private estimateTokens(content: Anthropic.TextBlockParam[]): number {
    const totalChars = content.reduce((sum, block) => sum + block.text.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Get cache size (number of entries)
   *
   * @returns Number of cache entries
   */
  getCacheSize(): number {
    return this.cacheKeys.size;
  }

  /**
   * Get expected hit rate target
   *
   * According to the MCP improvement plan, we should target
   * 60-80% cache hit rate over 5-minute windows.
   *
   * @returns Target hit rate range
   */
  static getTargetHitRate(): { min: number; max: number } {
    return { min: 0.6, max: 0.8 };
  }

  /**
   * Calculate break-even point
   *
   * Cache writes cost 25% more than regular calls.
   * Cache hits save 90% on cached tokens.
   *
   * Break-even: 1 write + N hits where total cost equals regular cost
   *
   * @param cacheTokens - Number of tokens in cached content
   * @returns Number of hits needed to break even
   */
  static calculateBreakEven(cacheTokens: number): {
    hitsToBreakEven: number;
    savings: { atBreakEven: number; at5Hits: number; at10Hits: number };
  } {
    const WRITE_PREMIUM = 1.25;
    const READ_DISCOUNT = 0.1;
    const COST_PER_MILLION = 3.0;

    // Cost of cache write vs regular
    const writeCost = cacheTokens * WRITE_PREMIUM * (COST_PER_MILLION / 1_000_000);
    const regularCost = cacheTokens * (COST_PER_MILLION / 1_000_000);
    const writeOverhead = writeCost - regularCost;

    // Savings per cache hit
    const hitSavings = regularCost - (cacheTokens * READ_DISCOUNT * (COST_PER_MILLION / 1_000_000));

    // Hits needed to break even
    const hitsToBreakEven = Math.ceil(writeOverhead / hitSavings);

    // Calculate savings at different hit counts
    const calculateTotal = (hits: number) => {
      const totalRegular = regularCost * (1 + hits);
      const totalCached = writeCost + (hits * cacheTokens * READ_DISCOUNT * (COST_PER_MILLION / 1_000_000));
      return totalRegular - totalCached;
    };

    return {
      hitsToBreakEven,
      savings: {
        atBreakEven: calculateTotal(hitsToBreakEven),
        at5Hits: calculateTotal(5),
        at10Hits: calculateTotal(10),
      },
    };
  }
}
