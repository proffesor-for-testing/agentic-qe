/**
 * RuVectorClient - TypeScript client for RuVector Docker integration
 *
 * Provides GNN-enhanced vector search with LoRA learning capabilities.
 * Part of AQE LLM Independence initiative (Phase 0.5).
 *
 * @module providers/RuVectorClient
 */

/**
 * Configuration for RuVector client
 */
export interface RuVectorConfig {
  /** Base URL for RuVector service (default: http://localhost:8080) */
  baseUrl: string;
  /** Enable automatic learning from queries (default: true) */
  learningEnabled: boolean;
  /** Confidence threshold for cache hits (0.7-0.9 recommended) */
  cacheThreshold: number;
  /** LoRA rank for low-rank adaptation (4-16 recommended) */
  loraRank: number;
  /** Enable Elastic Weight Consolidation to prevent catastrophic forgetting */
  ewcEnabled: boolean;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Search result from vector database
 */
export interface SearchResult {
  /** Unique identifier for the pattern */
  id: string;
  /** Content/response associated with this pattern */
  content: string;
  /** Vector embedding */
  embedding: number[];
  /** Confidence score (0-1) from GNN reranking */
  confidence: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Pattern to be stored in vector database
 */
export interface Pattern {
  /** Vector embedding */
  embedding: number[];
  /** Content/response to store */
  content: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result from query with learning
 */
export interface QueryResult {
  /** Response content */
  content: string;
  /** Source of the response */
  source: 'cache' | 'llm';
  /** Confidence score (0-1) */
  confidence: number;
  /** Latency in milliseconds */
  latency?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Learning metrics from the system
 */
export interface LearningMetrics {
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  /** Total number of queries processed */
  totalQueries: number;
  /** Number of LoRA parameter updates */
  loraUpdates: number;
  /** Average query latency in milliseconds */
  averageLatency: number;
  /** Number of patterns stored */
  patternCount: number;
  /** Current memory usage in MB */
  memoryUsageMB?: number;
  /** GNN accuracy metrics */
  gnnMetrics?: {
    precision: number;
    recall: number;
    f1Score: number;
  };
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  gnnStatus: 'active' | 'inactive';
  loraStatus: 'active' | 'inactive';
  vectorCount: number;
  lastError?: string;
}

/**
 * Custom error class for RuVector operations
 */
export class RuVectorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'RuVectorError';
    Object.setPrototypeOf(this, RuVectorError.prototype);
  }
}

/**
 * RuVector TypeScript Client
 *
 * Provides integration with RuVector Docker service for GNN-enhanced
 * vector search with LoRA learning capabilities.
 *
 * @example
 * ```typescript
 * const client = new RuVectorClient({
 *   baseUrl: 'http://localhost:8080',
 *   learningEnabled: true,
 *   cacheThreshold: 0.8,
 *   loraRank: 8,
 *   ewcEnabled: true
 * });
 *
 * // Query with automatic learning
 * const result = await client.queryWithLearning(
 *   'How do I test async functions?',
 *   embedding,
 *   async () => await llm.complete('How do I test async functions?')
 * );
 * ```
 */
export class RuVectorClient {
  private readonly baseUrl: string;
  private readonly config: Required<RuVectorConfig>;
  private queryCount = 0;
  private cacheHits = 0;
  private totalLatency = 0;

  /**
   * Creates a new RuVector client instance
   *
   * @param config - Configuration options
   */
  constructor(config: RuVectorConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.config = {
      ...config,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      debug: config.debug ?? false
    };

    this.log('RuVectorClient initialized', { baseUrl: this.baseUrl });
  }

  /**
   * Search for similar patterns with GNN-enhanced ranking
   *
   * @param embedding - Query embedding vector
   * @param k - Number of results to return (default: 10)
   * @param options - Additional search options
   * @returns Array of search results ranked by GNN confidence
   *
   * @example
   * ```typescript
   * const results = await client.search(embedding, 5);
   * console.log(`Top result: ${results[0].content} (${results[0].confidence})`);
   * ```
   */
  async search(
    embedding: number[],
    k: number = 10,
    options?: {
      useGNN?: boolean;
      attentionType?: 'single-head' | 'multi-head';
      minConfidence?: number;
    }
  ): Promise<SearchResult[]> {
    this.validateEmbedding(embedding);

    const startTime = Date.now();

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embedding,
          k,
          useGNN: options?.useGNN ?? true,
          attentionType: options?.attentionType ?? 'multi-head',
          minConfidence: options?.minConfidence ?? 0.0
        })
      });

      const results = await this.parseJsonResponse<SearchResult[]>(response);
      const latency = Date.now() - startTime;

      this.log('Search completed', {
        k,
        resultsCount: results.length,
        latency,
        topConfidence: results[0]?.confidence
      });

      return results;
    } catch (error) {
      throw this.handleError('search', error, { k, embeddingSize: embedding.length });
    }
  }

  /**
   * Store pattern with automatic LoRA learning
   *
   * @param pattern - Pattern to store
   * @param options - Storage options
   *
   * @example
   * ```typescript
   * await client.store({
   *   embedding: [0.1, 0.2, ...],
   *   content: 'Use jest.fn() for mocking',
   *   metadata: { category: 'testing', framework: 'jest' }
   * });
   * ```
   */
  async store(
    pattern: Pattern,
    options?: {
      triggerLearning?: boolean;
      priority?: 'low' | 'normal' | 'high';
    }
  ): Promise<void> {
    this.validateEmbedding(pattern.embedding);

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/v1/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embedding: pattern.embedding,
          content: pattern.content,
          metadata: pattern.metadata,
          learningConfig: this.config.learningEnabled ? {
            loraRank: this.config.loraRank,
            ewcLambda: this.config.ewcEnabled ? 0.5 : 0,
            triggerConsolidation: options?.triggerLearning ?? false
          } : undefined,
          priority: options?.priority ?? 'normal'
        })
      });

      if (!response.ok) {
        throw new RuVectorError(
          `Failed to store pattern: ${response.statusText}`,
          'STORE_FAILED',
          response.status
        );
      }

      this.log('Pattern stored successfully', {
        contentLength: pattern.content.length,
        metadataKeys: Object.keys(pattern.metadata).length
      });
    } catch (error) {
      throw this.handleError('store', error, { embeddingSize: pattern.embedding.length });
    }
  }

  /**
   * Query with automatic learning and LLM fallback
   *
   * Implements intelligent routing:
   * 1. Search vector DB for similar patterns
   * 2. If confidence > threshold, return cached result
   * 3. Otherwise, call LLM fallback
   * 4. Store LLM result for future learning
   *
   * @param query - Query string for logging
   * @param embedding - Query embedding vector
   * @param llmFallback - Function to call LLM if cache misses
   * @returns Query result with source information
   *
   * @example
   * ```typescript
   * const result = await client.queryWithLearning(
   *   'How to mock API calls?',
   *   embedding,
   *   async () => await anthropic.complete('How to mock API calls?')
   * );
   *
   * if (result.source === 'cache') {
   *   console.log('Served from cache, saving costs!');
   * }
   * ```
   */
  async queryWithLearning(
    query: string,
    embedding: number[],
    llmFallback: () => Promise<string>
  ): Promise<QueryResult> {
    const startTime = Date.now();
    this.queryCount++;

    try {
      // Phase 1: Search for similar patterns
      const results = await this.search(embedding, 5);
      const topResult = results[0];

      // Phase 2: Check confidence threshold
      if (topResult && topResult.confidence > this.config.cacheThreshold) {
        this.cacheHits++;
        const latency = Date.now() - startTime;
        this.totalLatency += latency;

        this.log('Cache hit', {
          query,
          confidence: topResult.confidence,
          threshold: this.config.cacheThreshold,
          latency
        });

        return {
          content: topResult.content,
          source: 'cache',
          confidence: topResult.confidence,
          latency,
          metadata: topResult.metadata
        };
      }

      // Phase 3: Cache miss - call LLM
      this.log('Cache miss, calling LLM fallback', {
        query,
        topConfidence: topResult?.confidence ?? 0,
        threshold: this.config.cacheThreshold
      });

      const llmResponse = await llmFallback();
      const latency = Date.now() - startTime;
      this.totalLatency += latency;

      // Phase 4: Store for future learning
      if (this.config.learningEnabled) {
        await this.store(
          {
            embedding,
            content: llmResponse,
            metadata: {
              query,
              timestamp: new Date().toISOString(),
              source: 'llm',
              originalConfidence: topResult?.confidence ?? 0
            }
          },
          { triggerLearning: true }
        );
      }

      return {
        content: llmResponse,
        source: 'llm',
        confidence: 1.0, // LLM responses are assumed to be high quality
        latency,
        metadata: {
          query,
          cachedResultConfidence: topResult?.confidence
        }
      };
    } catch (error) {
      throw this.handleError('queryWithLearning', error, { query });
    }
  }

  /**
   * Get learning metrics
   *
   * @returns Current learning metrics
   */
  async getMetrics(): Promise<LearningMetrics> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/v1/metrics`);
      const serverMetrics = await this.parseJsonResponse<{
        loraUpdates: number;
        patternCount: number;
        memoryUsageMB?: number;
        gnnMetrics?: {
          precision: number;
          recall: number;
          f1Score: number;
        };
      }>(response);

      return {
        cacheHitRate: this.queryCount > 0 ? this.cacheHits / this.queryCount : 0,
        totalQueries: this.queryCount,
        loraUpdates: serverMetrics.loraUpdates,
        averageLatency: this.queryCount > 0 ? this.totalLatency / this.queryCount : 0,
        patternCount: serverMetrics.patternCount,
        memoryUsageMB: serverMetrics.memoryUsageMB,
        gnnMetrics: serverMetrics.gnnMetrics
      };
    } catch (error) {
      throw this.handleError('getMetrics', error);
    }
  }

  /**
   * Force learning consolidation
   *
   * Triggers manual LoRA parameter consolidation.
   * Use sparingly - automatic consolidation is preferred.
   *
   * @returns Consolidation result with updated metrics
   */
  async forceLearn(): Promise<{
    success: boolean;
    updatedParameters: number;
    duration: number;
  }> {
    this.log('Forcing learning consolidation');

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/v1/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loraRank: this.config.loraRank,
          ewcLambda: this.config.ewcEnabled ? 0.5 : 0
        })
      });

      const result = await this.parseJsonResponse<{
        success: boolean;
        updatedParameters: number;
        duration: number;
      }>(response);

      this.log('Learning consolidation completed', result);

      return result;
    } catch (error) {
      throw this.handleError('forceLearn', error);
    }
  }

  /**
   * Health check
   *
   * @returns Health status of RuVector service
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/health`, {
        method: 'GET'
      });

      const health = await this.parseJsonResponse<HealthCheckResponse>(response);

      this.log('Health check completed', {
        status: health.status,
        uptime: health.uptime,
        vectorCount: health.vectorCount
      });

      return health;
    } catch (error) {
      throw this.handleError('healthCheck', error);
    }
  }

  /**
   * Reset metrics
   *
   * Resets client-side query metrics. Does not affect server metrics.
   */
  resetMetrics(): void {
    this.queryCount = 0;
    this.cacheHits = 0;
    this.totalLatency = 0;
    this.log('Metrics reset');
  }

  // Private helper methods

  private validateEmbedding(embedding: number[]): void {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new RuVectorError(
        'Embedding must be a non-empty array',
        'INVALID_EMBEDDING'
      );
    }

    if (!embedding.every(v => typeof v === 'number' && !isNaN(v))) {
      throw new RuVectorError(
        'Embedding must contain only valid numbers',
        'INVALID_EMBEDDING'
      );
    }
  }

  private async fetchWithRetry(
    url: string,
    options?: RequestInit,
    attempt = 1
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok && attempt < this.config.maxRetries) {
        const delay = this.config.retryDelay * attempt;
        this.log(`Request failed (attempt ${attempt}), retrying in ${delay}ms`, {
          status: response.status,
          url
        });

        await this.sleep(delay);
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (attempt < this.config.maxRetries) {
        const delay = this.config.retryDelay * attempt;
        this.log(`Request error (attempt ${attempt}), retrying in ${delay}ms`, {
          error: error instanceof Error ? error.message : String(error),
          url
        });

        await this.sleep(delay);
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      throw error;
    }
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new RuVectorError(
        `Request failed: ${response.statusText}`,
        'REQUEST_FAILED',
        response.status,
        errorText
      );
    }

    try {
      return await response.json() as T;
    } catch (error) {
      throw new RuVectorError(
        'Failed to parse JSON response',
        'PARSE_ERROR',
        response.status,
        error
      );
    }
  }

  private handleError(
    operation: string,
    error: unknown,
    context?: Record<string, unknown>
  ): RuVectorError {
    if (error instanceof RuVectorError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const ruVectorError = new RuVectorError(
      `${operation} failed: ${message}`,
      'OPERATION_FAILED',
      undefined,
      { originalError: error, context }
    );

    this.log(`Error in ${operation}`, {
      error: message,
      context
    });

    return ruVectorError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(message: string, data?: Record<string, unknown>): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[RuVectorClient] ${timestamp} - ${message}`, data || '');
    }
  }
}

// Export default instance factory for convenience
export function createRuVectorClient(config: RuVectorConfig): RuVectorClient {
  return new RuVectorClient(config);
}

// Export version for compatibility checks
export const RUVECTOR_CLIENT_VERSION = '1.0.0';
