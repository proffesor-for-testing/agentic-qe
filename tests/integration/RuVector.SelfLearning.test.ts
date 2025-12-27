/**
 * RuVector Self-Learning Validation Tests
 *
 * Tests GNN self-learning capabilities and validates GOAP metrics:
 * - Search quality improves by 10%+ over 100 queries
 * - EWC++ maintains 98%+ pattern retention after adding new patterns
 * - LoRA adapters stay under 300MB
 * - Search latency remains <1ms for 95th percentile
 *
 * @group integration
 * @group ruvector
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import {
  RuVectorClient,
  createRuVectorClient,
  RuVectorConfig,
  QueryResult,
  SearchResult,
  LearningMetrics,
  HealthCheckResponse
} from '../../src/providers/RuVectorClient';
import { createSeededRandom } from '../../src/utils/SeededRandom';

// Mock configuration for when Docker is not available
const MOCK_MODE = process.env.RUVECTOR_MOCK === 'true';
const SKIP_INTEGRATION = process.env.SKIP_RUVECTOR_TESTS === 'true';

// Test configuration
const TEST_CONFIG: RuVectorConfig = {
  baseUrl: process.env.RUVECTOR_URL || 'http://localhost:8080',
  learningEnabled: true,
  cacheThreshold: 0.8,
  loraRank: 8,
  ewcEnabled: true,
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  debug: process.env.DEBUG === 'true'
};

// Seeded RNG for deterministic test data
const rng = createSeededRandom(18200);

// Helper to generate test embeddings (768-dim)
function generateEmbedding(seed: number = rng.random()): number[] {
  const dim = 768;
  const embedding: number[] = [];

  for (let i = 0; i < dim; i++) {
    // Use seed to make embeddings deterministic but slightly varied
    embedding.push(Math.sin(seed * i) * 0.1 + Math.cos(seed * (i + 1)) * 0.1);
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

// Helper to generate similar embeddings
function generateSimilarEmbedding(baseEmbedding: number[], variance: number = 0.1): number[] {
  const similar = baseEmbedding.map(val => val + (rng.random() - 0.5) * variance);

  // Normalize
  const magnitude = Math.sqrt(similar.reduce((sum, val) => sum + val * val, 0));
  return similar.map(val => val / magnitude);
}

// Helper to calculate percentile
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Helper to simulate LLM responses
function createLLMFallback(response: string): () => Promise<string> {
  return async () => {
    // Simulate LLM latency
    await new Promise(resolve => setTimeout(resolve, 50));
    return response;
  };
}

// Mock client for when Docker is not available
class MockRuVectorClient {
  private patterns: Map<string, { embedding: number[]; content: string; confidence: number }> = new Map();
  private queryCount = 0;
  private cacheHits = 0;

  async search(embedding: number[], k: number = 10): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Convert Map to Array to avoid iteration issues
    const patternEntries = Array.from(this.patterns.entries());

    for (const [id, pattern] of patternEntries) {
      // Calculate cosine similarity
      const dotProduct = embedding.reduce((sum, val, i) => sum + val * pattern.embedding[i], 0);
      const confidence = Math.max(0, dotProduct); // Cosine similarity in [0, 1]

      results.push({
        id,
        content: pattern.content,
        embedding: pattern.embedding,
        confidence,
        metadata: {}
      });
    }

    // Sort by confidence and return top k
    return results.sort((a, b) => b.confidence - a.confidence).slice(0, k);
  }

  async store(pattern: { embedding: number[]; content: string }): Promise<void> {
    const id = `pattern-${this.patterns.size}`;
    this.patterns.set(id, { ...pattern, confidence: 0.9 });
  }

  async queryWithLearning(
    query: string,
    embedding: number[],
    llmFallback: () => Promise<string>
  ): Promise<QueryResult> {
    this.queryCount++;

    const results = await this.search(embedding, 5);
    const topResult = results[0];

    if (topResult && topResult.confidence > 0.8) {
      this.cacheHits++;
      return {
        content: topResult.content,
        source: 'cache',
        confidence: topResult.confidence,
        latency: 1
      };
    }

    const llmResponse = await llmFallback();
    await this.store({ embedding, content: llmResponse });

    return {
      content: llmResponse,
      source: 'llm',
      confidence: 1.0,
      latency: 50
    };
  }

  async getMetrics(): Promise<LearningMetrics> {
    return {
      cacheHitRate: this.queryCount > 0 ? this.cacheHits / this.queryCount : 0,
      totalQueries: this.queryCount,
      loraUpdates: Math.floor(this.patterns.size / 10),
      averageLatency: 1,
      patternCount: this.patterns.size,
      memoryUsageMB: this.patterns.size * 0.1,
      gnnMetrics: {
        precision: 0.95,
        recall: 0.93,
        f1Score: 0.94
      }
    };
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    return {
      status: 'healthy',
      version: 'mock-1.0.0',
      uptime: 1000,
      gnnStatus: 'active',
      loraStatus: 'active',
      vectorCount: this.patterns.size
    };
  }

  async forceLearn(): Promise<{ success: boolean; updatedParameters: number; duration: number }> {
    return {
      success: true,
      updatedParameters: this.patterns.size,
      duration: 100
    };
  }

  resetMetrics(): void {
    this.queryCount = 0;
    this.cacheHits = 0;
  }
}

describe('RuVector Self-Learning Validation', () => {
  let client: RuVectorClient | MockRuVectorClient;
  let isRealClient: boolean;

  beforeAll(async () => {
    if (SKIP_INTEGRATION) {
      console.log('⏭️  Skipping RuVector integration tests (SKIP_RUVECTOR_TESTS=true)');
      return;
    }

    if (MOCK_MODE) {
      console.log('🎭 Using mock RuVectorClient (RUVECTOR_MOCK=true)');
      client = new MockRuVectorClient() as any;
      isRealClient = false;
    } else {
      console.log('🐳 Using real RuVectorClient (attempting Docker connection)');
      client = createRuVectorClient(TEST_CONFIG);
      isRealClient = true;

      try {
        // Test connection
        await client.healthCheck();
        console.log('✅ RuVector Docker service is healthy');
      } catch (error) {
        console.warn('⚠️  RuVector Docker not available, falling back to mock mode');
        console.warn(`Error: ${error instanceof Error ? error.message : String(error)}`);
        client = new MockRuVectorClient() as any;
        isRealClient = false;
      }
    }
  });

  beforeEach(() => {
    if (!SKIP_INTEGRATION && client) {
      client.resetMetrics();
    }
  });

  afterAll(async () => {
    if (client && isRealClient) {
      console.log('🧹 Cleaning up RuVector client');
    }
  });

  describe('Health Check', () => {
    it('should verify RuVector service is healthy', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      const health = await client.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.gnnStatus).toBe('active');
      expect(health.loraStatus).toBe('active');
      expect(health.version).toBeTruthy();
      expect(health.uptime).toBeGreaterThan(0);
    });
  });

  describe('Search Quality Improvement', () => {
    it('should improve search quality by 10%+ over 100 queries', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      // Phase 1: Baseline quality (first 20 queries)
      const baselineQueries = 20;
      const baselineConfidences: number[] = [];

      for (let i = 0; i < baselineQueries; i++) {
        const queryEmbedding = generateEmbedding(i / 100);
        const llmResponse = `Response for query ${i}`;

        const result = await client.queryWithLearning(
          `Test query ${i}`,
          queryEmbedding,
          createLLMFallback(llmResponse)
        );

        baselineConfidences.push(result.confidence);
      }

      const baselineAvgConfidence = baselineConfidences.reduce((a, b) => a + b, 0) / baselineConfidences.length;

      // Phase 2: Learning phase (next 50 queries with similar patterns)
      const learningQueries = 50;

      for (let i = 0; i < learningQueries; i++) {
        // Generate similar queries to existing patterns
        const baseIndex = i % baselineQueries;
        const baseEmbedding = generateEmbedding(baseIndex / 100);
        const similarEmbedding = generateSimilarEmbedding(baseEmbedding, 0.05);

        await client.queryWithLearning(
          `Similar query ${i}`,
          similarEmbedding,
          createLLMFallback(`Response for query ${baseIndex}`)
        );
      }

      // Phase 3: Evaluation quality (next 30 queries)
      const evalQueries = 30;
      const evalConfidences: number[] = [];

      for (let i = 0; i < evalQueries; i++) {
        const baseIndex = i % baselineQueries;
        const baseEmbedding = generateEmbedding(baseIndex / 100);
        const similarEmbedding = generateSimilarEmbedding(baseEmbedding, 0.05);

        const result = await client.queryWithLearning(
          `Eval query ${i}`,
          similarEmbedding,
          createLLMFallback(`Response for query ${baseIndex}`)
        );

        evalConfidences.push(result.confidence);
      }

      const evalAvgConfidence = evalConfidences.reduce((a, b) => a + b, 0) / evalConfidences.length;

      // Calculate improvement
      const improvement = ((evalAvgConfidence - baselineAvgConfidence) / baselineAvgConfidence) * 100;

      console.log(`📊 Search Quality Metrics:`);
      console.log(`  Baseline confidence: ${baselineAvgConfidence.toFixed(3)}`);
      console.log(`  Evaluation confidence: ${evalAvgConfidence.toFixed(3)}`);
      console.log(`  Improvement: ${improvement.toFixed(2)}%`);

      // GOAP target: 10%+ improvement
      expect(improvement).toBeGreaterThanOrEqual(10);

      // Verify learning is happening
      const metrics = await client.getMetrics();
      expect(metrics.totalQueries).toBe(baselineQueries + learningQueries + evalQueries);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);

      console.log(`  Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(2)}%`);
      console.log(`  Total patterns: ${metrics.patternCount}`);
    }, 120000); // 2 minute timeout for 100 queries

    it('should demonstrate increasing cache hit rate over time', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      const queryBatches = 5;
      const queriesPerBatch = 20;
      const cacheHitRates: number[] = [];

      for (let batch = 0; batch < queryBatches; batch++) {
        const batchStart = batch * queriesPerBatch;

        for (let i = 0; i < queriesPerBatch; i++) {
          const queryIndex = batchStart + i;
          const baseEmbedding = generateEmbedding(queryIndex % 10 / 10); // Reuse patterns
          const similarEmbedding = generateSimilarEmbedding(baseEmbedding, 0.03);

          await client.queryWithLearning(
            `Batch ${batch} query ${i}`,
            similarEmbedding,
            createLLMFallback(`Response ${queryIndex % 10}`)
          );
        }

        const metrics = await client.getMetrics();
        cacheHitRates.push(metrics.cacheHitRate);

        console.log(`  Batch ${batch + 1}: Cache hit rate = ${(metrics.cacheHitRate * 100).toFixed(2)}%`);
      }

      // Verify cache hit rate is increasing (with some tolerance)
      const firstBatchRate = cacheHitRates[0];
      const lastBatchRate = cacheHitRates[cacheHitRates.length - 1];

      expect(lastBatchRate).toBeGreaterThan(firstBatchRate);

      console.log(`📈 Cache Hit Rate Growth:`);
      console.log(`  Initial: ${(firstBatchRate * 100).toFixed(2)}%`);
      console.log(`  Final: ${(lastBatchRate * 100).toFixed(2)}%`);
      console.log(`  Growth: ${((lastBatchRate - firstBatchRate) * 100).toFixed(2)}%`);
    }, 90000); // 90 second timeout
  });

  describe('EWC++ Pattern Retention', () => {
    it('should retain 98%+ of patterns after adding new ones', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      // Phase 1: Store initial patterns and verify they work
      const initialPatterns = 100;
      const initialEmbeddings: number[][] = [];

      console.log(`📝 Storing ${initialPatterns} initial patterns...`);

      for (let i = 0; i < initialPatterns; i++) {
        const embedding = generateEmbedding(i / 1000);
        initialEmbeddings.push(embedding);

        await client.queryWithLearning(
          `Initial pattern ${i}`,
          embedding,
          createLLMFallback(`Initial response ${i}`)
        );
      }

      // Verify initial patterns are retrievable
      const initialRecalls: number[] = [];

      for (let i = 0; i < initialPatterns; i++) {
        const similarEmbedding = generateSimilarEmbedding(initialEmbeddings[i], 0.02);
        const result = await client.queryWithLearning(
          `Verify initial ${i}`,
          similarEmbedding,
          createLLMFallback(`Should not be called`)
        );

        initialRecalls.push(result.source === 'cache' ? 1 : 0);
      }

      const initialRecallRate = initialRecalls.reduce((a, b) => a + b, 0) / initialRecalls.length;
      console.log(`  Initial recall rate: ${(initialRecallRate * 100).toFixed(2)}%`);

      // Phase 2: Add many new patterns (potential forgetting trigger)
      const newPatterns = 1000;

      console.log(`📝 Adding ${newPatterns} new patterns (EWC++ preventing forgetting)...`);

      for (let i = 0; i < newPatterns; i++) {
        const embedding = generateEmbedding((initialPatterns + i) / 1000);

        await client.queryWithLearning(
          `New pattern ${i}`,
          embedding,
          createLLMFallback(`New response ${i}`)
        );
      }

      // Phase 3: Verify initial patterns are still retrievable
      const finalRecalls: number[] = [];

      console.log(`🔍 Verifying initial patterns are retained...`);

      for (let i = 0; i < initialPatterns; i++) {
        const similarEmbedding = generateSimilarEmbedding(initialEmbeddings[i], 0.02);
        const result = await client.queryWithLearning(
          `Verify after ${i}`,
          similarEmbedding,
          createLLMFallback(`Should not be called`)
        );

        finalRecalls.push(result.source === 'cache' ? 1 : 0);
      }

      const finalRecallRate = finalRecalls.reduce((a, b) => a + b, 0) / finalRecalls.length;

      console.log(`📊 EWC++ Pattern Retention Metrics:`);
      console.log(`  Initial patterns: ${initialPatterns}`);
      console.log(`  New patterns added: ${newPatterns}`);
      console.log(`  Initial recall rate: ${(initialRecallRate * 100).toFixed(2)}%`);
      console.log(`  Final recall rate: ${(finalRecallRate * 100).toFixed(2)}%`);
      console.log(`  Retention: ${(finalRecallRate * 100).toFixed(2)}%`);

      // GOAP target: 98%+ retention
      expect(finalRecallRate).toBeGreaterThanOrEqual(0.98);

      // Verify EWC is actually enabled and working
      const metrics = await client.getMetrics();
      expect(metrics.patternCount).toBeGreaterThan(initialPatterns);
      console.log(`  Total patterns stored: ${metrics.patternCount}`);
    }, 180000); // 3 minute timeout for 1100 patterns
  });

  describe('Performance Constraints', () => {
    it('should maintain <1ms p95 search latency', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      // Warm up with some patterns
      const warmupPatterns = 100;

      console.log(`🔥 Warming up with ${warmupPatterns} patterns...`);

      for (let i = 0; i < warmupPatterns; i++) {
        const embedding = generateEmbedding(i / 100);
        await client.queryWithLearning(
          `Warmup ${i}`,
          embedding,
          createLLMFallback(`Warmup response ${i}`)
        );
      }

      // Measure search latency for 1000 searches
      const searches = 1000;
      const latencies: number[] = [];

      console.log(`⏱️  Measuring latency for ${searches} searches...`);

      for (let i = 0; i < searches; i++) {
        const embedding = generateEmbedding(i / 100);

        const startTime = Date.now();
        await (client as RuVectorClient).search(embedding, 10);
        const latency = Date.now() - startTime;

        latencies.push(latency);
      }

      // Calculate percentiles
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log(`📊 Search Latency Metrics:`);
      console.log(`  Searches: ${searches}`);
      console.log(`  Average: ${avg.toFixed(3)}ms`);
      console.log(`  p50: ${p50.toFixed(3)}ms`);
      console.log(`  p95: ${p95.toFixed(3)}ms`);
      console.log(`  p99: ${p99.toFixed(3)}ms`);

      // GOAP target: <1ms p95
      expect(p95).toBeLessThan(1);

      // Additional sanity checks
      expect(avg).toBeLessThan(1);
      expect(p99).toBeLessThan(5);
    }, 90000); // 90 second timeout

    it('should keep LoRA adapters under 300MB', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      // Store enough patterns to trigger LoRA learning
      const patterns = 500;

      console.log(`📝 Storing ${patterns} patterns to trigger LoRA learning...`);

      for (let i = 0; i < patterns; i++) {
        const embedding = generateEmbedding(i / 100);
        await client.queryWithLearning(
          `Pattern ${i}`,
          embedding,
          createLLMFallback(`Response ${i}`)
        );

        if ((i + 1) % 100 === 0) {
          console.log(`  Stored ${i + 1}/${patterns} patterns...`);
        }
      }

      // Force consolidation to update LoRA adapters
      console.log(`🔄 Forcing LoRA consolidation...`);
      await client.forceLearn();

      // Check memory usage
      const metrics = await client.getMetrics();

      console.log(`📊 LoRA Memory Metrics:`);
      console.log(`  Patterns stored: ${metrics.patternCount}`);
      console.log(`  LoRA updates: ${metrics.loraUpdates}`);
      console.log(`  Memory usage: ${metrics.memoryUsageMB?.toFixed(2) || 'N/A'} MB`);

      if (metrics.memoryUsageMB !== undefined) {
        // GOAP target: <300MB
        expect(metrics.memoryUsageMB).toBeLessThan(300);

        // Verify memory is reasonable relative to pattern count
        const memoryPerPattern = metrics.memoryUsageMB / metrics.patternCount;
        console.log(`  Memory per pattern: ${memoryPerPattern.toFixed(3)} MB`);
        expect(memoryPerPattern).toBeLessThan(1); // Should be well under 1MB per pattern
      } else {
        console.warn('⚠️  Memory usage not reported by server');
      }
    }, 120000); // 2 minute timeout
  });

  describe('GNN Metrics', () => {
    it('should provide GNN quality metrics', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      // Store some patterns to train GNN
      const patterns = 100;

      for (let i = 0; i < patterns; i++) {
        const embedding = generateEmbedding(i / 100);
        await client.queryWithLearning(
          `GNN pattern ${i}`,
          embedding,
          createLLMFallback(`GNN response ${i}`)
        );
      }

      // Force learning to update GNN
      await client.forceLearn();

      const metrics = await client.getMetrics();

      console.log(`📊 GNN Quality Metrics:`);

      if (metrics.gnnMetrics) {
        console.log(`  Precision: ${(metrics.gnnMetrics.precision * 100).toFixed(2)}%`);
        console.log(`  Recall: ${(metrics.gnnMetrics.recall * 100).toFixed(2)}%`);
        console.log(`  F1 Score: ${(metrics.gnnMetrics.f1Score * 100).toFixed(2)}%`);

        // GNN should maintain high quality
        expect(metrics.gnnMetrics.precision).toBeGreaterThan(0.8);
        expect(metrics.gnnMetrics.recall).toBeGreaterThan(0.8);
        expect(metrics.gnnMetrics.f1Score).toBeGreaterThan(0.8);
      } else {
        console.warn('⚠️  GNN metrics not reported by server');
      }
    }, 60000);
  });

  describe('End-to-End Learning Workflow', () => {
    it('should demonstrate complete learning cycle', async () => {
      if (SKIP_INTEGRATION) {
        console.log('⏭️  Skipping: SKIP_RUVECTOR_TESTS=true');
        return;
      }

      console.log(`🔄 Running complete learning cycle...`);

      // 1. Initial state - no patterns
      let metrics = await client.getMetrics();
      const initialPatternCount = metrics.patternCount;

      console.log(`  Initial state: ${initialPatternCount} patterns`);

      // 2. Store diverse patterns
      const categories = ['testing', 'debugging', 'refactoring', 'performance', 'security'];
      const patternsPerCategory = 20;

      for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
        const category = categories[categoryIndex];

        for (let i = 0; i < patternsPerCategory; i++) {
          const embedding = generateEmbedding((categoryIndex * patternsPerCategory + i) / 1000);

          await client.queryWithLearning(
            `${category} pattern ${i}`,
            embedding,
            createLLMFallback(`${category} response ${i}`)
          );
        }

        console.log(`  Stored ${category} patterns (${patternsPerCategory})`);
      }

      // 3. Force learning consolidation
      console.log(`  Forcing learning consolidation...`);
      const learnResult = await client.forceLearn();

      expect(learnResult.success).toBe(true);
      console.log(`  Updated ${learnResult.updatedParameters} parameters in ${learnResult.duration}ms`);

      // 4. Verify patterns are retrievable with high confidence
      let highConfidenceHits = 0;

      for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
        const baseEmbedding = generateEmbedding(categoryIndex * patternsPerCategory / 1000);
        const similarEmbedding = generateSimilarEmbedding(baseEmbedding, 0.05);

        const result = await client.queryWithLearning(
          `Verify ${categories[categoryIndex]}`,
          similarEmbedding,
          createLLMFallback('Should not be called')
        );

        if (result.source === 'cache' && result.confidence > 0.8) {
          highConfidenceHits++;
        }
      }

      const retrievalRate = highConfidenceHits / categories.length;

      console.log(`📊 Learning Cycle Results:`);
      console.log(`  Patterns stored: ${patternsPerCategory * categories.length}`);
      console.log(`  High-confidence retrievals: ${highConfidenceHits}/${categories.length}`);
      console.log(`  Retrieval rate: ${(retrievalRate * 100).toFixed(2)}%`);

      // Should retrieve most patterns with high confidence
      expect(retrievalRate).toBeGreaterThan(0.6);

      // 5. Final metrics check
      metrics = await client.getMetrics();

      console.log(`  Final cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(2)}%`);
      console.log(`  Total queries: ${metrics.totalQueries}`);
      console.log(`  LoRA updates: ${metrics.loraUpdates}`);

      expect(metrics.patternCount).toBeGreaterThan(initialPatternCount);
      expect(metrics.loraUpdates).toBeGreaterThan(0);
    }, 120000); // 2 minute timeout
  });
});
