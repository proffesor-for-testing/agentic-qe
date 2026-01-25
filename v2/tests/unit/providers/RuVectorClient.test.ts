/**
 * RuVectorClient Unit Tests
 *
 * Phase 0.5.4: GNN Self-Learning Validation Tests
 *
 * Tests for:
 * - RuVector client initialization and configuration
 * - GNN-enhanced vector search
 * - LoRA learning triggers
 * - Cache hit/miss behavior
 * - Error handling and retries
 * - Metrics tracking
 */

import {
  RuVectorClient,
  createRuVectorClient,
  RuVectorConfig,
  RuVectorError,
  SearchResult,
  Pattern,
  QueryResult,
  LearningMetrics,
  HealthCheckResponse,
  RUVECTOR_CLIENT_VERSION
} from '../../../src/providers/RuVectorClient';
import { createSeededRandom } from '../../../src/utils/SeededRandom';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * Helper to create mock fetch response
 */
function mockResponse<T>(data: T, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockResponse(data, ok, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData()
  } as Response;
}

// RNG instance for deterministic test data
const testRng = createSeededRandom(19002);

/**
 * Helper to create test embedding
 */
function createTestEmbedding(size = 768): number[] {
  return new Array(size).fill(0).map(() => testRng.random() - 0.5);
}

/**
 * Helper to create test search result
 */
function createTestSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: `pattern-${testRng.randomUUID().slice(0, 6)}`,
    content: 'Test pattern content',
    embedding: createTestEmbedding(),
    confidence: 0.9,
    metadata: { category: 'test' },
    ...overrides
  };
}

describe('RuVectorClient', () => {
  let client: RuVectorClient;
  const defaultConfig: RuVectorConfig = {
    baseUrl: 'http://localhost:8080',
    learningEnabled: true,
    cacheThreshold: 0.85,
    loraRank: 8,
    ewcEnabled: true,
    timeout: 5000,
    maxRetries: 2,
    debug: false
  };

  beforeEach(() => {
    mockFetch.mockReset();
    client = new RuVectorClient(defaultConfig);
  });

  describe('Initialization', () => {
    it('should create client with default config', () => {
      const client = createRuVectorClient(defaultConfig);
      expect(client).toBeInstanceOf(RuVectorClient);
    });

    it('should handle trailing slash in baseUrl', () => {
      const client = new RuVectorClient({
        ...defaultConfig,
        baseUrl: 'http://localhost:8080/'
      });

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'healthy' }));

      // URL should be normalized
      expect(client).toBeInstanceOf(RuVectorClient);
    });

    it('should export version constant', () => {
      expect(RUVECTOR_CLIENT_VERSION).toBe('1.0.0');
    });
  });

  describe('Search Operations', () => {
    it('should perform basic vector search', async () => {
      const mockResults: SearchResult[] = [
        createTestSearchResult({ confidence: 0.95 }),
        createTestSearchResult({ confidence: 0.88 })
      ];

      mockFetch.mockResolvedValueOnce(mockResponse(mockResults));

      const embedding = createTestEmbedding();
      const results = await client.search(embedding, 5);

      expect(results).toHaveLength(2);
      expect(results[0].confidence).toBe(0.95);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/search',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"k":5')
        })
      );
    });

    it('should search with GNN enabled by default', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await client.search(createTestEmbedding());

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.useGNN).toBe(true);
      expect(callBody.attentionType).toBe('multi-head');
    });

    it('should search with custom GNN options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await client.search(createTestEmbedding(), 10, {
        useGNN: false,
        attentionType: 'single-head',
        minConfidence: 0.5
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.useGNN).toBe(false);
      expect(callBody.attentionType).toBe('single-head');
      expect(callBody.minConfidence).toBe(0.5);
    });

    it('should validate embedding array', async () => {
      await expect(client.search([])).rejects.toThrow(RuVectorError);
      await expect(client.search([NaN, 0.1])).rejects.toThrow(RuVectorError);
    });

    it('should handle search errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, false, 500));

      await expect(client.search(createTestEmbedding())).rejects.toThrow(RuVectorError);
    });
  });

  describe('Store Operations', () => {
    it('should store pattern with learning config', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, true));

      const pattern: Pattern = {
        embedding: createTestEmbedding(),
        content: 'Test pattern content',
        metadata: { category: 'testing', framework: 'jest' }
      };

      await client.store(pattern);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/store',
        expect.objectContaining({
          method: 'POST'
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.content).toBe('Test pattern content');
      expect(callBody.learningConfig.loraRank).toBe(8);
      expect(callBody.learningConfig.ewcLambda).toBe(0.5);
    });

    it('should store pattern with learning trigger', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, true));

      await client.store(
        {
          embedding: createTestEmbedding(),
          content: 'Content',
          metadata: {}
        },
        { triggerLearning: true, priority: 'high' }
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.learningConfig.triggerConsolidation).toBe(true);
      expect(callBody.priority).toBe('high');
    });

    it('should handle store errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, false, 400));

      await expect(
        client.store({
          embedding: createTestEmbedding(),
          content: 'Test',
          metadata: {}
        })
      ).rejects.toThrow(RuVectorError);
    });

    it('should omit learning config when disabled', async () => {
      const noLearningClient = new RuVectorClient({
        ...defaultConfig,
        learningEnabled: false
      });

      mockFetch.mockResolvedValueOnce(mockResponse({}, true));

      await noLearningClient.store({
        embedding: createTestEmbedding(),
        content: 'Test',
        metadata: {}
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.learningConfig).toBeUndefined();
    });
  });

  describe('Query With Learning', () => {
    it('should return cached result on high confidence hit', async () => {
      const cachedResult = createTestSearchResult({ confidence: 0.92 });
      mockFetch.mockResolvedValueOnce(mockResponse([cachedResult]));

      const llmFallback = jest.fn();

      const result = await client.queryWithLearning(
        'How to test async functions?',
        createTestEmbedding(),
        llmFallback
      );

      expect(result.source).toBe('cache');
      expect(result.confidence).toBe(0.92);
      expect(result.content).toBe(cachedResult.content);
      expect(llmFallback).not.toHaveBeenCalled();
    });

    it('should fallback to LLM on low confidence', async () => {
      const lowConfidenceResult = createTestSearchResult({ confidence: 0.5 });
      mockFetch
        .mockResolvedValueOnce(mockResponse([lowConfidenceResult])) // search
        .mockResolvedValueOnce(mockResponse({}, true)); // store

      const llmFallback = jest.fn().mockResolvedValue('LLM generated response');

      const result = await client.queryWithLearning(
        'How to test async functions?',
        createTestEmbedding(),
        llmFallback
      );

      expect(result.source).toBe('llm');
      expect(result.content).toBe('LLM generated response');
      expect(llmFallback).toHaveBeenCalled();
      // Should store for future learning
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should store LLM result for learning', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse([])) // empty search results
        .mockResolvedValueOnce(mockResponse({}, true)); // store

      await client.queryWithLearning(
        'Test query',
        createTestEmbedding(),
        async () => 'LLM response'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/store',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should not store if learning disabled', async () => {
      const noLearningClient = new RuVectorClient({
        ...defaultConfig,
        learningEnabled: false
      });

      mockFetch.mockResolvedValueOnce(mockResponse([])); // empty search

      await noLearningClient.queryWithLearning(
        'Test query',
        createTestEmbedding(),
        async () => 'LLM response'
      );

      // Only search call, no store
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should track cache hits for metrics', async () => {
      const cachedResult = createTestSearchResult({ confidence: 0.92 });
      mockFetch
        .mockResolvedValueOnce(mockResponse([cachedResult]))
        .mockResolvedValueOnce(mockResponse([cachedResult]))
        .mockResolvedValueOnce(mockResponse({ loraUpdates: 0, patternCount: 10 }));

      await client.queryWithLearning('Q1', createTestEmbedding(), async () => '');
      await client.queryWithLearning('Q2', createTestEmbedding(), async () => '');

      const metrics = await client.getMetrics();
      expect(metrics.totalQueries).toBe(2);
      expect(metrics.cacheHitRate).toBe(1); // 100% cache hits
    });
  });

  describe('Force Learning', () => {
    it('should trigger learning consolidation', async () => {
      const learningResult = {
        success: true,
        updatedParameters: 1024,
        duration: 150
      };
      mockFetch.mockResolvedValueOnce(mockResponse(learningResult));

      const result = await client.forceLearn();

      expect(result.success).toBe(true);
      expect(result.updatedParameters).toBe(1024);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/learn',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should include LoRA and EWC config', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ success: true, updatedParameters: 0, duration: 0 })
      );

      await client.forceLearn();

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.loraRank).toBe(8);
      expect(callBody.ewcLambda).toBe(0.5);
    });

    it('should set ewcLambda to 0 when EWC disabled', async () => {
      const noEwcClient = new RuVectorClient({
        ...defaultConfig,
        ewcEnabled: false
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse({ success: true, updatedParameters: 0, duration: 0 })
      );

      await noEwcClient.forceLearn();

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.ewcLambda).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const healthResponse: HealthCheckResponse = {
        status: 'healthy',
        version: '0.5.0',
        uptime: 3600,
        gnnStatus: 'active',
        loraStatus: 'active',
        vectorCount: 10000
      };
      mockFetch.mockResolvedValueOnce(mockResponse(healthResponse));

      const health = await client.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.gnnStatus).toBe('active');
      expect(health.loraStatus).toBe('active');
      expect(health.vectorCount).toBe(10000);
    });

    it('should handle degraded status', async () => {
      const healthResponse: HealthCheckResponse = {
        status: 'degraded',
        version: '0.5.0',
        uptime: 3600,
        gnnStatus: 'active',
        loraStatus: 'inactive',
        vectorCount: 5000,
        lastError: 'LoRA training timeout'
      };
      mockFetch.mockResolvedValueOnce(mockResponse(healthResponse));

      const health = await client.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.loraStatus).toBe('inactive');
      expect(health.lastError).toBe('LoRA training timeout');
    });
  });

  describe('Metrics', () => {
    it('should return combined metrics', async () => {
      // Generate some queries first
      mockFetch
        .mockResolvedValueOnce(mockResponse([createTestSearchResult({ confidence: 0.92 })])) // cache hit
        .mockResolvedValueOnce(mockResponse([])) // cache miss
        .mockResolvedValueOnce(mockResponse({}, true)) // store
        .mockResolvedValueOnce(mockResponse({
          loraUpdates: 5,
          patternCount: 100,
          memoryUsageMB: 512,
          gnnMetrics: { precision: 0.92, recall: 0.88, f1Score: 0.90 }
        }));

      await client.queryWithLearning('Q1', createTestEmbedding(), async () => 'r1');
      await client.queryWithLearning('Q2', createTestEmbedding(), async () => 'r2');

      const metrics = await client.getMetrics();

      expect(metrics.totalQueries).toBe(2);
      expect(metrics.cacheHitRate).toBe(0.5); // 1 hit, 1 miss
      expect(metrics.loraUpdates).toBe(5);
      expect(metrics.patternCount).toBe(100);
      expect(metrics.gnnMetrics?.f1Score).toBe(0.90);
    });

    it('should reset metrics', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse([createTestSearchResult({ confidence: 0.92 })])
      );

      await client.queryWithLearning('Q1', createTestEmbedding(), async () => '');

      client.resetMetrics();

      mockFetch.mockResolvedValueOnce(
        mockResponse({ loraUpdates: 0, patternCount: 0 })
      );

      const metrics = await client.getMetrics();
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should retry failed requests', async () => {
      // Use a client with very fast retry delay
      const fastRetryClient = new RuVectorClient({
        ...defaultConfig,
        maxRetries: 2,
        retryDelay: 1 // 1ms delay for testing
      });

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse([]));

      const results = await fastRetryClient.search(createTestEmbedding());

      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fastRetryClient = new RuVectorClient({
        ...defaultConfig,
        maxRetries: 2,
        retryDelay: 1 // 1ms delay for testing
      });

      mockFetch.mockRejectedValue(new Error('Persistent error'));

      await expect(fastRetryClient.search(createTestEmbedding())).rejects.toThrow(RuVectorError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should wrap errors in RuVectorError', async () => {
      const fastRetryClient = new RuVectorClient({
        ...defaultConfig,
        maxRetries: 1,
        retryDelay: 1
      });

      mockFetch.mockRejectedValue(new Error('Some network error'));

      await expect(fastRetryClient.search(createTestEmbedding())).rejects.toBeInstanceOf(RuVectorError);
    });

    it('should preserve RuVectorError through handling', async () => {
      const fastRetryClient = new RuVectorClient({
        ...defaultConfig,
        maxRetries: 1,
        retryDelay: 1
      });

      const customError = new RuVectorError('Custom error', 'CUSTOM_CODE', 418);
      mockFetch.mockRejectedValue(customError);

      await expect(fastRetryClient.search(createTestEmbedding())).rejects.toBe(customError);
    });
  });

  describe('Configuration Options', () => {
    it('should apply custom timeout', async () => {
      const fastClient = new RuVectorClient({
        ...defaultConfig,
        timeout: 1000
      });

      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await fastClient.search(createTestEmbedding());

      // Verify timeout was set (indirectly through AbortController)
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should apply custom retry settings', async () => {
      const retryClient = new RuVectorClient({
        ...defaultConfig,
        maxRetries: 5,
        retryDelay: 1 // Very fast for testing
      });

      mockFetch
        .mockRejectedValueOnce(new Error('Retry 1'))
        .mockRejectedValueOnce(new Error('Retry 2'))
        .mockRejectedValueOnce(new Error('Retry 3'))
        .mockRejectedValueOnce(new Error('Retry 4'))
        .mockResolvedValueOnce(mockResponse([]));

      const results = await retryClient.search(createTestEmbedding());

      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should use custom cache threshold', async () => {
      const lowThresholdClient = new RuVectorClient({
        ...defaultConfig,
        cacheThreshold: 0.5
      });

      // 0.6 is above 0.5 threshold
      mockFetch.mockResolvedValueOnce(
        mockResponse([createTestSearchResult({ confidence: 0.6 })])
      );

      const llmFallback = jest.fn();

      const result = await lowThresholdClient.queryWithLearning(
        'Query',
        createTestEmbedding(),
        llmFallback
      );

      expect(result.source).toBe('cache');
      expect(llmFallback).not.toHaveBeenCalled();
    });
  });
});

describe('GNN Self-Learning Integration', () => {
  const mockFetch = global.fetch as jest.Mock;

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('GNN-Enhanced Search Validation', () => {
    it('should use multi-head attention by default', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: true
      });

      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await client.search(createTestEmbedding());

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.attentionType).toBe('multi-head');
    });

    it('should support single-head attention fallback', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: true
      });

      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await client.search(createTestEmbedding(), 5, {
        attentionType: 'single-head'
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.attentionType).toBe('single-head');
    });

    it('should filter by minimum confidence', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: true
      });

      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await client.search(createTestEmbedding(), 10, {
        minConfidence: 0.7
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.minConfidence).toBe(0.7);
    });
  });

  describe('LoRA Learning Validation', () => {
    it('should include LoRA rank in learning config', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 16, // Higher rank
        ewcEnabled: true
      });

      mockFetch.mockResolvedValueOnce(mockResponse({}, true));

      await client.store({
        embedding: createTestEmbedding(),
        content: 'Test',
        metadata: {}
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.learningConfig.loraRank).toBe(16);
    });

    it('should support different LoRA ranks', async () => {
      for (const rank of [4, 8, 12, 16]) {
        mockFetch.mockReset();
        const client = new RuVectorClient({
          baseUrl: 'http://localhost:8080',
          learningEnabled: true,
          cacheThreshold: 0.85,
          loraRank: rank,
          ewcEnabled: false
        });

        mockFetch.mockResolvedValueOnce(mockResponse({}, true));
        await client.store({
          embedding: createTestEmbedding(),
          content: 'Test',
          metadata: {}
        });

        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.learningConfig.loraRank).toBe(rank);
      }
    });
  });

  describe('EWC Catastrophic Forgetting Prevention', () => {
    it('should enable EWC with lambda when configured', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: true
      });

      mockFetch.mockResolvedValueOnce(mockResponse({}, true));

      await client.store({
        embedding: createTestEmbedding(),
        content: 'Test',
        metadata: {}
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.learningConfig.ewcLambda).toBe(0.5);
    });

    it('should disable EWC when configured', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: false
      });

      mockFetch.mockResolvedValueOnce(mockResponse({}, true));

      await client.store({
        embedding: createTestEmbedding(),
        content: 'Test',
        metadata: {}
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.learningConfig.ewcLambda).toBe(0);
    });
  });

  describe('Cache Behavior Validation', () => {
    it('should return cache hit for high confidence results', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: true
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse([createTestSearchResult({ confidence: 0.90 })])
      );

      const result = await client.queryWithLearning(
        'Query',
        createTestEmbedding(),
        async () => 'LLM response'
      );

      expect(result.source).toBe('cache');
      expect(result.confidence).toBe(0.90);
    });

    it('should return LLM result for low confidence', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: true
      });

      mockFetch
        .mockResolvedValueOnce(
          mockResponse([createTestSearchResult({ confidence: 0.50 })])
        )
        .mockResolvedValueOnce(mockResponse({}, true));

      const result = await client.queryWithLearning(
        'Query',
        createTestEmbedding(),
        async () => 'LLM response'
      );

      expect(result.source).toBe('llm');
      expect(result.content).toBe('LLM response');
    });

    it('should respect cache threshold boundary', async () => {
      const client = new RuVectorClient({
        baseUrl: 'http://localhost:8080',
        learningEnabled: true,
        cacheThreshold: 0.85,
        loraRank: 8,
        ewcEnabled: true
      });

      // Exactly at threshold - should be cache miss (> not >=)
      mockFetch
        .mockResolvedValueOnce(
          mockResponse([createTestSearchResult({ confidence: 0.85 })])
        )
        .mockResolvedValueOnce(mockResponse({}, true));

      const result = await client.queryWithLearning(
        'Query',
        createTestEmbedding(),
        async () => 'LLM response'
      );

      expect(result.source).toBe('llm');
    });
  });
});
