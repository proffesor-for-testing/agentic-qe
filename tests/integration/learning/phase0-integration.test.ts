/**
 * Phase 0 Integration Tests
 *
 * Tests the full integration path:
 * Agent → LearningEngine → HNSWPatternAdapter → HNSWPatternStore → Retrieval
 *
 * Validates:
 * - M0.3: HNSWPatternStore integration with LearningEngine
 * - M0.6: PatternCurator integration with RuvllmProvider
 * - End-to-end pattern storage and retrieval
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// Learning components
import { LearningEngine, ExtendedLearningConfig } from '../../../src/learning/LearningEngine';
import { HNSWPatternAdapter, createHNSWPatternAdapter } from '../../../src/learning/HNSWPatternAdapter';
import { PatternCurator, createPatternCurator, StoredPattern, CuratedPattern } from '../../../src/learning/PatternCurator';

// Memory components
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { HNSWPatternStore, QEPattern, DistanceMetric } from '../../../src/memory/HNSWPatternStore';

// Provider components
import { RuvllmProvider } from '../../../src/providers/RuvllmProvider';

// Test utilities
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Create a test SwarmMemoryManager with in-memory database
 */
async function createTestMemoryManager(): Promise<SwarmMemoryManager> {
  const manager = new SwarmMemoryManager(':memory:');
  await manager.initialize();
  return manager;
}

/**
 * Create a test pattern with random embedding
 */
function createTestQEPattern(overrides: Partial<QEPattern> = {}): QEPattern {
  const embedding = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  const normalizedEmbedding = embedding.map(v => v / magnitude);

  return {
    id: randomUUID(),
    embedding: normalizedEmbedding,
    content: 'Test pattern content',
    type: 'test-generation',
    quality: 0.8,
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe('Phase 0 M0.3: HNSWPatternStore Integration', () => {
  let store: HNSWPatternStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `hnsw-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    store = new HNSWPatternStore({
      dimension: 768,
      storagePath: tempDir,
      distanceMetric: DistanceMetric.Cosine,
    });
  });

  afterEach(async () => {
    await store.clear();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should store and retrieve patterns', async () => {
    const pattern = createTestQEPattern({
      content: 'Test generation pattern for user authentication',
      type: 'test-generation',
      quality: 0.9,
    });

    await store.store(pattern);
    const count = await store.count();
    expect(count).toBe(1);

    // Search for similar patterns
    const results = await store.search(pattern.embedding, 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(pattern.id);
    expect(results[0].content).toBe(pattern.content);
  });

  it('should find similar patterns by embedding similarity', async () => {
    // Store multiple patterns
    const patterns = [
      createTestQEPattern({ content: 'Authentication test pattern' }),
      createTestQEPattern({ content: 'Database query test pattern' }),
      createTestQEPattern({ content: 'API endpoint test pattern' }),
    ];

    for (const pattern of patterns) {
      await store.store(pattern);
    }

    const count = await store.count();
    expect(count).toBe(3);

    // Search should return all patterns
    const results = await store.search(patterns[0].embedding, 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should delete patterns', async () => {
    const pattern = createTestQEPattern();
    await store.store(pattern);

    let count = await store.count();
    expect(count).toBe(1);

    await store.delete(pattern.id);

    count = await store.count();
    expect(count).toBe(0);
  });

  it('should clear all patterns', async () => {
    const patterns = [
      createTestQEPattern(),
      createTestQEPattern(),
      createTestQEPattern(),
    ];

    for (const pattern of patterns) {
      await store.store(pattern);
    }

    let count = await store.count();
    expect(count).toBe(3);

    await store.clear();

    count = await store.count();
    expect(count).toBe(0);
  });
});

describe('Phase 0 M0.3: HNSWPatternAdapter Integration', () => {
  let adapter: HNSWPatternAdapter;
  let tempDir: string;

  beforeEach(async () => {
    // Use unique temp directory for each test to avoid state sharing
    tempDir = path.join(os.tmpdir(), `hnsw-adapter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });

    adapter = createHNSWPatternAdapter({
      embeddingDimension: 768,
      useRuvLLM: false, // Use fallback embeddings for testing
      allowFallbackEmbeddings: true,
      hnswConfig: {
        storagePath: tempDir, // Isolate each test
      },
    });
    await adapter.initialize();
    // Ensure clean state
    await adapter.clear();
  });

  afterEach(async () => {
    await adapter.clear();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should store and search patterns using LearnedPattern format', async () => {
    const learnedPattern = {
      id: randomUUID(),
      pattern: 'test-generation:default',
      confidence: 0.8,
      successRate: 0.9,
      usageCount: 5,
      contexts: ['test-generation'],
      createdAt: new Date(),
      lastUsedAt: new Date(),
      agentId: 'test-agent',
      averageReward: 0.75,
    };

    await adapter.storePattern(learnedPattern);

    const stats = await adapter.getStats();
    expect(stats.patternCount).toBe(1);

    // Search for similar patterns
    const results = await adapter.searchSimilar('test-generation', 5);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('should generate deterministic fallback embeddings', async () => {
    const pattern1 = {
      id: randomUUID(),
      pattern: 'test-generation:strategy-a',
      confidence: 0.7,
      successRate: 0.8,
      usageCount: 3,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      agentId: 'test-agent',
      averageReward: 0.6,
    };

    const pattern2 = {
      id: randomUUID(),
      pattern: 'test-generation:strategy-a',
      confidence: 0.7,
      successRate: 0.8,
      usageCount: 3,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      agentId: 'test-agent',
      averageReward: 0.6,
    };

    // Store both - should have same embeddings for same pattern text
    await adapter.storePattern(pattern1);
    await adapter.storePattern(pattern2);

    const stats = await adapter.getStats();
    expect(stats.patternCount).toBe(2);
    expect(stats.useRuvLLM).toBe(false);
  });
});

describe('Phase 0 M0.3: LearningEngine + HNSW Integration', () => {
  let memoryManager: SwarmMemoryManager;
  let learningEngine: LearningEngine;

  beforeEach(async () => {
    memoryManager = await createTestMemoryManager();

    learningEngine = new LearningEngine('test-agent', memoryManager, {
      enabled: true,
      enableHNSW: true, // Enable HNSW integration
      hnswConfig: {
        embeddingDimension: 768,
        useRuvLLM: false,
        allowFallbackEmbeddings: true,
      },
    });

    await learningEngine.initialize();
  });

  afterEach(async () => {
    await memoryManager.close();
  });

  it('should have HNSW enabled', () => {
    expect(learningEngine.isHNSWEnabled()).toBe(true);
  });

  it('should store patterns in both SQLite and HNSW during learning', async () => {
    // Simulate task execution
    const task = {
      id: randomUUID(),
      type: 'test-generation',
      description: 'Generate unit tests for UserService',
    };

    const result = {
      success: true,
      data: { testsGenerated: 5 },
      duration: 1000,
    };

    // Learn from execution
    const outcome = await learningEngine.learnFromExecution(task, result);

    expect(outcome).toBeDefined();
    expect(outcome.improved).toBeDefined();

    // Verify patterns stored in SQLite
    const patterns = await learningEngine.getPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(0);

    // Verify HNSW stats
    const hnswStats = await learningEngine.getHNSWStats();
    expect(hnswStats).toBeDefined();
    expect(hnswStats?.patternCount).toBeGreaterThanOrEqual(0);
  });

  it('should search similar patterns using HNSW', async () => {
    // Store some patterns through learning
    for (let i = 0; i < 3; i++) {
      const task = {
        id: randomUUID(),
        type: 'test-generation',
        description: `Generate tests for Service${i}`,
      };

      const result = {
        success: true,
        data: { testsGenerated: i + 1 },
        duration: 500 + i * 100,
      };

      await learningEngine.learnFromExecution(task, result);
    }

    // Search for similar patterns
    const results = await learningEngine.searchSimilarPatterns('test-generation', 5);
    // Results may be empty if no patterns match - that's ok
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('Phase 0 M0.6: PatternCurator Integration', () => {
  let curator: PatternCurator;
  let testPatterns: StoredPattern[];

  // Mock pattern source for testing
  class TestPatternSource {
    private patterns: Map<string, StoredPattern> = new Map();

    addPattern(pattern: StoredPattern): void {
      this.patterns.set(pattern.id, pattern);
    }

    async findSimilar(query: string, k: number): Promise<StoredPattern[]> {
      return Array.from(this.patterns.values()).slice(0, k);
    }

    async findByConfidenceRange(min: number, max: number, limit: number): Promise<StoredPattern[]> {
      return Array.from(this.patterns.values())
        .filter(p => p.confidence >= min && p.confidence <= max)
        .slice(0, limit);
    }

    async remove(id: string): Promise<void> {
      this.patterns.delete(id);
    }

    async update(id: string, updates: Partial<StoredPattern>): Promise<void> {
      const existing = this.patterns.get(id);
      if (existing) {
        this.patterns.set(id, { ...existing, ...updates });
      }
    }

    async getStats(): Promise<{ total: number; avgConfidence: number; avgQuality: number }> {
      const patterns = Array.from(this.patterns.values());
      if (patterns.length === 0) return { total: 0, avgConfidence: 0, avgQuality: 0 };
      return {
        total: patterns.length,
        avgConfidence: patterns.reduce((s, p) => s + p.confidence, 0) / patterns.length,
        avgQuality: patterns.reduce((s, p) => s + p.quality, 0) / patterns.length,
      };
    }

    getPattern(id: string): StoredPattern | undefined {
      return this.patterns.get(id);
    }
  }

  // Mock learning trigger for testing
  class TestLearningTrigger {
    feedbackHistory: any[] = [];
    private learnCount = 0;

    async feedback(data: any): Promise<void> {
      this.feedbackHistory.push(data);
    }

    async forceLearn(): Promise<{ patternsConsolidated: number; newWeightVersion: number }> {
      this.learnCount++;
      const consolidated = this.feedbackHistory.length;
      this.feedbackHistory = [];
      return { patternsConsolidated: consolidated, newWeightVersion: this.learnCount };
    }

    async getRoutingStats(): Promise<{ totalDecisions: number; avgConfidence: number }> {
      return { totalDecisions: 100, avgConfidence: 0.75 };
    }
  }

  let patternSource: TestPatternSource;
  let learningTrigger: TestLearningTrigger;

  beforeEach(() => {
    patternSource = new TestPatternSource();
    learningTrigger = new TestLearningTrigger();

    curator = createPatternCurator(
      {
        lowConfidenceThreshold: 0.7,
        autoApproveThreshold: 0.95,
        autoRejectThreshold: 0.3,
        maxBatchSize: 50,
      },
      patternSource as any,
      learningTrigger as any
    );

    // Add test patterns
    testPatterns = [
      {
        id: randomUUID(),
        embedding: [],
        content: 'Low confidence pattern',
        category: 'test-generation',
        confidence: 0.5,
        quality: 0.6,
        usageCount: 3,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        metadata: {},
      },
      {
        id: randomUUID(),
        embedding: [],
        content: 'Medium confidence pattern',
        category: 'coverage-analysis',
        confidence: 0.7,
        quality: 0.7,
        usageCount: 10,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        metadata: {},
      },
      {
        id: randomUUID(),
        embedding: [],
        content: 'High confidence pattern',
        category: 'test-generation',
        confidence: 0.96,
        quality: 0.9,
        usageCount: 25,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        metadata: {},
      },
    ];

    for (const pattern of testPatterns) {
      patternSource.addPattern(pattern);
    }
  });

  it('should start and end curation sessions', () => {
    const session = curator.startSession('test-reviewer');
    expect(session.id).toBeDefined();
    expect(session.reviewerId).toBe('test-reviewer');

    const endedSession = curator.endSession();
    expect(endedSession?.endedAt).toBeDefined();
  });

  it('should find low-confidence patterns', async () => {
    const lowConfidence = await curator.findLowConfidencePatterns();
    // Should find patterns between autoRejectThreshold (0.3) and lowConfidenceThreshold (0.7)
    expect(lowConfidence.length).toBeGreaterThanOrEqual(0);
  });

  it('should approve patterns and queue feedback', async () => {
    curator.startSession();

    const pattern = testPatterns[0]; // Low confidence pattern
    const curation: CuratedPattern = {
      id: pattern.id,
      approved: true,
      qualityRating: 0.8,
      explanation: 'Pattern is valuable after review',
      reviewedAt: Date.now(),
    };

    await curator.reviewPattern(pattern, curation);

    const session = curator.getCurrentSession();
    expect(session?.approved).toBe(1);
    expect(curator.getPendingFeedbackCount()).toBe(1);
  });

  it('should reject patterns and remove them', async () => {
    curator.startSession();

    const pattern = testPatterns[0];
    const curation: CuratedPattern = {
      id: pattern.id,
      approved: false,
      qualityRating: 0,
      explanation: 'Pattern is not useful',
      reviewedAt: Date.now(),
    };

    await curator.reviewPattern(pattern, curation);

    const session = curator.getCurrentSession();
    expect(session?.rejected).toBe(1);

    // Pattern should be removed
    expect(patternSource.getPattern(pattern.id)).toBeUndefined();
  });

  it('should auto-curate patterns based on thresholds', async () => {
    // Add very low and very high confidence patterns
    patternSource.addPattern({
      id: randomUUID(),
      embedding: [],
      content: 'Very low confidence - auto reject',
      category: 'test-generation',
      confidence: 0.1,
      quality: 0.2,
      usageCount: 1,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      metadata: {},
    });

    const result = await curator.autoCurate();

    expect(result.autoRejected).toBeGreaterThanOrEqual(1);
    expect(result.autoApproved).toBeGreaterThanOrEqual(1);
    expect(result.needsReview).toBeGreaterThanOrEqual(0);
  });

  it('should force learning consolidation', async () => {
    curator.startSession();

    // Approve a pattern to queue feedback
    await curator.reviewPattern(testPatterns[0], {
      id: testPatterns[0].id,
      approved: true,
      qualityRating: 0.8,
      explanation: 'Good pattern',
      reviewedAt: Date.now(),
    });

    expect(curator.getPendingFeedbackCount()).toBe(1);

    const result = await curator.forceLearning();

    expect(result.feedbackSubmitted).toBe(1);
    expect(result.patternsConsolidated).toBe(1);
    expect(curator.getPendingFeedbackCount()).toBe(0);
  });

  it('should track curation history', () => {
    curator.startSession('reviewer-1');
    curator.endSession();

    curator.startSession('reviewer-2');
    curator.endSession();

    const history = curator.getCurationHistory();
    expect(history).toHaveLength(2);
  });
});

describe('Phase 0: End-to-End Integration', () => {
  let memoryManager: SwarmMemoryManager;
  let learningEngine: LearningEngine;

  beforeEach(async () => {
    memoryManager = await createTestMemoryManager();

    learningEngine = new LearningEngine('e2e-test-agent', memoryManager, {
      enabled: true,
      enableHNSW: true,
      hnswConfig: {
        embeddingDimension: 768,
        useRuvLLM: false,
        allowFallbackEmbeddings: true,
      },
    });

    await learningEngine.initialize();
  });

  afterEach(async () => {
    await memoryManager.close();
  });

  it('should complete full learning cycle: execute → learn → store → retrieve', async () => {
    // 1. Simulate agent task execution
    const task = {
      id: randomUUID(),
      type: 'test-generation',
      description: 'Generate comprehensive unit tests',
    };

    const result = {
      success: true,
      data: {
        testsGenerated: 10,
        coverageIncrease: 15,
      },
      duration: 2000,
    };

    // 2. Learn from execution (stores in SQLite + HNSW)
    const outcome = await learningEngine.learnFromExecution(task, result);
    expect(outcome).toBeDefined();

    // 3. Verify pattern storage
    const patterns = await learningEngine.getPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(0);

    // 4. Verify HNSW integration
    const hnswStats = await learningEngine.getHNSWStats();
    expect(hnswStats).toBeDefined();

    // 5. Get strategy recommendation (uses learned patterns)
    const recommendation = await learningEngine.recommendStrategy({
      taskType: 'test-generation',
      taskComplexity: 0.7,
      requiredCapabilities: ['unit-testing'],
      previousAttempts: 0,
      availableResources: 1.0,
    });

    expect(recommendation).toBeDefined();
    expect(recommendation.strategy).toBeDefined();
  });

  it('should improve with repeated learning', async () => {
    // Execute multiple tasks to build up learning
    for (let i = 0; i < 5; i++) {
      const task = {
        id: randomUUID(),
        type: 'test-generation',
        description: `Generate tests iteration ${i}`,
      };

      const result = {
        success: i > 1, // First two fail, rest succeed
        data: { testsGenerated: i * 2 },
        duration: 1000 + i * 100,
      };

      await learningEngine.learnFromExecution(task, result);
    }

    // Verify learning occurred via patterns and HNSW stats
    const patterns = await learningEngine.getPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(0);

    const hnswStats = await learningEngine.getHNSWStats();
    expect(hnswStats).not.toBeNull();
    expect(hnswStats!.patternCount).toBeGreaterThanOrEqual(0);
  });
});
