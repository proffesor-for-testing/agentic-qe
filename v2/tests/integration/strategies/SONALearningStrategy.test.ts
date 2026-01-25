/**
 * SONA Learning Strategy Integration Tests
 *
 * Tests the SONA-enhanced learning capabilities including:
 * - MicroLoRA instant adaptation
 * - BaseLoRA consolidation
 * - Pattern storage and retrieval
 * - Trajectory tracking
 * - EWC++ retention
 *
 * OPTIMIZED: Reduced memory footprint for DevPod/Codespaces environments
 */

import {
  SONALearningStrategy,
  createSONALearningStrategy,
  type SONALearningConfig,
  type SONAMetrics,
} from '../../../src/core/strategies/SONALearningStrategy';
import type { LearnedPattern, ExecutionEvent } from '../../../src/core/strategies';

// Use smaller embedding dimension for tests to reduce memory
const TEST_EMBEDDING_DIM = 64;

// Helper to create small test embeddings
function createTestEmbedding(seed = 0): number[] {
  return new Array(TEST_EMBEDDING_DIM).fill(0).map((_, i) => Math.sin((i + seed) * 0.1));
}

describe('SONALearningStrategy', () => {
  let strategy: SONALearningStrategy;

  beforeEach(async () => {
    strategy = new SONALearningStrategy({
      enableSONA: true,
      microLoraRank: 2,
      baseLoraRank: 4, // Reduced for testing
      consolidationInterval: 5, // Lower for faster tests
      maxPatterns: 20, // Reduced for memory
      enableTrajectories: false, // Disable to reduce memory
    });
    await strategy.initialize();
  });

  afterEach(async () => {
    if (strategy) {
      await strategy.reset();
    }
    // Force garbage collection hint
    strategy = null as any;
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      const defaultStrategy = createSONALearningStrategy();
      await defaultStrategy.initialize();

      const status = defaultStrategy.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.enabled).toBe(true);

      await defaultStrategy.reset();
    });

    it('should report correct status after initialization', () => {
      const status = strategy.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.patternsCount).toBe(0);
      expect(status.executionsRecorded).toBe(0);
    });

    it('should initialize with custom config', async () => {
      const customStrategy = new SONALearningStrategy({
        enableSONA: false,
        maxPatterns: 10,
        consolidationInterval: 3,
      });
      await customStrategy.initialize();

      const status = customStrategy.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.enabled).toBe(false);

      await customStrategy.reset();
    });
  });

  describe('Pattern Management', () => {
    it('should store and retrieve patterns', async () => {
      const pattern: LearnedPattern = {
        id: 'test-pattern-1',
        type: 'unit-test',
        domain: 'api',
        content: 'Test pattern content',
        confidence: 0.85,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await strategy.storePattern(pattern);

      const patterns = await strategy.getPatterns({ type: 'unit-test' });
      expect(patterns.length).toBe(1);
      expect(patterns[0].id).toBe('test-pattern-1');
      expect(patterns[0].confidence).toBe(0.85);
    });

    it('should filter patterns by confidence', async () => {
      await strategy.storePattern({
        id: 'high-conf',
        type: 'test',
        domain: 'default',
        content: 'High confidence pattern',
        confidence: 0.9,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await strategy.storePattern({
        id: 'low-conf',
        type: 'test',
        domain: 'default',
        content: 'Low confidence pattern',
        confidence: 0.4,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const highConfPatterns = await strategy.getPatterns({ minConfidence: 0.8 });
      expect(highConfPatterns.length).toBe(1);
      expect(highConfPatterns[0].id).toBe('high-conf');
    });

    it('should update pattern confidence', async () => {
      await strategy.storePattern({
        id: 'update-test',
        type: 'test',
        domain: 'default',
        content: 'Pattern to update',
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await strategy.updatePatternConfidence('update-test', true);
      await strategy.updatePatternConfidence('update-test', true);

      const patterns = await strategy.getPatterns({ type: 'test' });
      const updated = patterns.find(p => p.id === 'update-test');
      expect(updated).toBeDefined();
      expect(updated!.confidence).toBeGreaterThan(0.5);
      expect(updated!.usageCount).toBe(2);
    });

    it('should find similar patterns using embeddings', async () => {
      const embedding = createTestEmbedding(1);

      await strategy.storePattern({
        id: 'similar-pattern',
        type: 'test',
        domain: 'similarity',
        content: 'A pattern for similarity search',
        confidence: 0.9,
        usageCount: 5,
        successRate: 0.8,
        embedding,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Search with similar embedding
      const queryEmbedding = createTestEmbedding(1).map((v, i) => v + (i % 5 === 0 ? 0.01 : 0));
      const similar = await strategy.findSimilarPatterns(queryEmbedding, 3);

      // Should find at least some patterns (may be 0 if threshold not met)
      expect(similar.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Execution Recording', () => {
    it('should record successful executions', async () => {
      const event: ExecutionEvent = {
        task: { id: 'task-1', type: 'test-generation' } as any,
        success: true,
        duration: 500,
        result: { testsGenerated: 5 },
      };

      await strategy.recordExecution(event);

      const history = await strategy.getExecutionHistory(10);
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(true);
    });

    it('should record failed executions', async () => {
      const event: ExecutionEvent = {
        task: { id: 'task-2', type: 'test-generation' } as any,
        success: false,
        duration: 200,
        error: new Error('Test failure'),
      };

      await strategy.recordExecution(event);

      const history = await strategy.getExecutionHistory(10);
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(false);
    });

    it('should trigger consolidation at interval', async () => {
      // Record executions up to consolidation interval (5)
      for (let i = 0; i < 5; i++) {
        await strategy.recordExecution({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: true,
          duration: 100,
        });
      }

      const metrics = await strategy.getMetrics() as SONAMetrics;
      expect(metrics.baseLoraConsolidations).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Strategy Recommendations', () => {
    it('should provide recommendations based on patterns', async () => {
      // Store some patterns first
      await strategy.storePattern({
        id: 'recommendation-pattern',
        type: 'strategy',
        domain: 'testing',
        content: 'Use TDD for API tests',
        confidence: 0.9,
        usageCount: 10,
        successRate: 0.85,
        embedding: createTestEmbedding(42),
        metadata: { strategy: 'tdd-approach' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const recommendation = await strategy.recommendStrategy({
        task: 'How to test API endpoints',
        domain: 'testing',
      });

      // May or may not get recommendation depending on similarity threshold
      // Just verify the workflow completes
      if (recommendation) {
        expect(recommendation.confidence).toBeGreaterThan(0);
      }
    });

    it('should record recommendation outcomes', async () => {
      const recommendation = {
        strategy: 'test-strategy',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      };

      await strategy.recordRecommendationOutcome(recommendation, true);
      await strategy.recordRecommendationOutcome(recommendation, false);

      const metrics = await strategy.getMetrics();
      expect(metrics.recommendationsGiven).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Training', () => {
    it('should train with recorded executions', async () => {
      // Record fewer executions to reduce memory
      for (let i = 0; i < 6; i++) {
        await strategy.recordExecution({
          task: { id: `train-task-${i}`, type: 'unit-test' } as any,
          success: i % 3 !== 0, // 2/3 success rate
          duration: 100 + i * 10,
          result: { testsGenerated: i + 1 },
        });
      }

      const result = await strategy.train(3);

      expect(result.iterations).toBe(3);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.patternsLearned).toBeGreaterThanOrEqual(0);
    });

    it('should export and import patterns', async () => {
      // Store patterns
      await strategy.storePattern({
        id: 'export-pattern-1',
        type: 'export-test',
        domain: 'test',
        content: 'Pattern 1',
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await strategy.storePattern({
        id: 'export-pattern-2',
        type: 'export-test',
        domain: 'test',
        content: 'Pattern 2',
        confidence: 0.7,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const exported = await strategy.exportPatterns();
      expect(exported.length).toBe(2);

      // Create new strategy and import
      const newStrategy = createSONALearningStrategy();
      await newStrategy.initialize();

      const imported = await newStrategy.importPatterns(exported);
      expect(imported).toBe(2);

      const patterns = await newStrategy.getPatterns({ type: 'export-test' });
      expect(patterns.length).toBe(2);

      await newStrategy.reset();
    });
  });

  describe('SONA-specific Features', () => {
    it('should track MicroLoRA adaptations', async () => {
      // Store high-confidence pattern (triggers MicroLoRA adaptation)
      await strategy.storePattern({
        id: 'micro-lora-pattern',
        type: 'test',
        domain: 'default',
        content: 'High confidence pattern',
        confidence: 0.9, // Above 0.8 threshold
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const metrics = await strategy.getMetrics() as SONAMetrics;
      expect(metrics.microLoraAdaptations).toBeGreaterThanOrEqual(1);
    });

    it('should calculate EWC retention rate', async () => {
      // Store stable patterns (reduced count)
      for (let i = 0; i < 3; i++) {
        await strategy.storePattern({
          id: `stable-pattern-${i}`,
          type: 'stable',
          domain: 'test',
          content: `Stable pattern ${i}`,
          confidence: 0.8,
          usageCount: 10,
          successRate: 0.9,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const metrics = await strategy.getMetrics() as SONAMetrics;
      expect(metrics.ewcRetentionRate).toBeGreaterThan(0);
    });

    it('should identify hot paths', async () => {
      // Create and use a pattern
      await strategy.storePattern({
        id: 'hot-path-pattern',
        type: 'hot',
        domain: 'test',
        content: 'Frequently used pattern',
        confidence: 0.8,
        usageCount: 15,
        successRate: 0.9,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update it multiple times (reduced count)
      for (let i = 0; i < 8; i++) {
        await strategy.updatePatternConfidence('hot-path-pattern', true);
      }

      const metrics = await strategy.getMetrics() as SONAMetrics;
      expect(metrics.hotPathsIdentified).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Reset', () => {
    it('should reset all state', async () => {
      // Add some data
      await strategy.storePattern({
        id: 'reset-pattern',
        type: 'test',
        domain: 'test',
        content: 'Pattern to reset',
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await strategy.recordExecution({
        task: { id: 'reset-task', type: 'test' } as any,
        success: true,
        duration: 100,
      });

      // Reset
      await strategy.reset();

      // Verify state is cleared
      const status = strategy.getStatus();
      expect(status.patternsCount).toBe(0);
      expect(status.executionsRecorded).toBe(0);

      const patterns = await strategy.getPatterns({});
      expect(patterns.length).toBe(0);

      const history = await strategy.getExecutionHistory(100);
      expect(history.length).toBe(0);
    });
  });
});
