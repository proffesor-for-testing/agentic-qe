/**
 * DefaultLearningStrategy Unit Tests
 *
 * Tests for the learning strategy implementation.
 */

import {
  DefaultLearningStrategy,
  DisabledLearningStrategy,
  createLearningStrategy,
} from '../../../src/core/strategies/DefaultLearningStrategy';
import type { LearnedPattern, ExecutionEvent } from '../../../src/core/strategies/AgentLearningStrategy';

describe('DefaultLearningStrategy', () => {
  let strategy: DefaultLearningStrategy;

  beforeEach(async () => {
    strategy = new DefaultLearningStrategy({
      maxPatterns: 100,
      maxExecutions: 50,
      minConfidenceThreshold: 0.3,
      learningRate: 0.1,
    });
    await strategy.initialize();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const status = strategy.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.enabled).toBe(true);
    });
  });

  describe('pattern storage', () => {
    it('should store and retrieve patterns', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-1',
        type: 'test-pattern',
        domain: 'testing',
        content: 'Test content',
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await strategy.storePattern(pattern);
      const patterns = await strategy.getPatterns({ type: 'test-pattern' });

      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('pattern-1');
    });

    it('should filter patterns by confidence', async () => {
      await strategy.storePattern({
        id: 'high-conf',
        type: 'test',
        domain: 'testing',
        content: 'High',
        confidence: 0.9,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await strategy.storePattern({
        id: 'low-conf',
        type: 'test',
        domain: 'testing',
        content: 'Low',
        confidence: 0.2,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const patterns = await strategy.getPatterns({ minConfidence: 0.5 });
      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('high-conf');
    });

    it('should evict lowest confidence pattern when max reached', async () => {
      const limitedStrategy = new DefaultLearningStrategy({ maxPatterns: 2 });
      await limitedStrategy.initialize();

      await limitedStrategy.storePattern({
        id: 'p1',
        type: 'test',
        domain: 'testing',
        content: 'First',
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await limitedStrategy.storePattern({
        id: 'p2',
        type: 'test',
        domain: 'testing',
        content: 'Second',
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await limitedStrategy.storePattern({
        id: 'p3',
        type: 'test',
        domain: 'testing',
        content: 'Third',
        confidence: 0.9,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const patterns = await limitedStrategy.getPatterns({});
      expect(patterns).toHaveLength(2);
      expect(patterns.find((p) => p.id === 'p1')).toBeUndefined();
    });
  });

  describe('pattern confidence updates', () => {
    beforeEach(async () => {
      await strategy.storePattern({
        id: 'test-pattern',
        type: 'test',
        domain: 'testing',
        content: 'Test',
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should increase confidence on success', async () => {
      await strategy.updatePatternConfidence('test-pattern', true);
      const patterns = await strategy.getPatterns({ type: 'test' });

      expect(patterns[0].confidence).toBeGreaterThan(0.5);
      expect(patterns[0].usageCount).toBe(1);
    });

    it('should decrease confidence on failure', async () => {
      await strategy.updatePatternConfidence('test-pattern', false);
      const patterns = await strategy.getPatterns({ type: 'test' });

      expect(patterns[0].confidence).toBeLessThan(0.5);
    });

    it('should clamp confidence between 0 and 1', async () => {
      // Increase multiple times
      for (let i = 0; i < 20; i++) {
        await strategy.updatePatternConfidence('test-pattern', true);
      }
      let patterns = await strategy.getPatterns({ type: 'test' });
      expect(patterns[0].confidence).toBeLessThanOrEqual(1);

      // Reset and decrease multiple times
      await strategy.storePattern({
        id: 'low-pattern',
        type: 'low',
        domain: 'testing',
        content: 'Low',
        confidence: 0.1,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      for (let i = 0; i < 5; i++) {
        await strategy.updatePatternConfidence('low-pattern', false);
      }
      patterns = await strategy.getPatterns({ type: 'low' });
      expect(patterns[0].confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('execution recording', () => {
    it('should record execution events', async () => {
      const event: ExecutionEvent = {
        task: { id: 'task-1', type: 'test', description: 'Test task' },
        startTime: new Date(),
        endTime: new Date(),
        success: true,
        duration: 1000,
      };

      await strategy.recordExecution(event);
      const history = await strategy.getExecutionHistory();

      expect(history).toHaveLength(1);
      expect(history[0].task.id).toBe('task-1');
    });

    it('should enforce max executions limit', async () => {
      const limitedStrategy = new DefaultLearningStrategy({ maxExecutions: 3 });
      await limitedStrategy.initialize();

      for (let i = 0; i < 5; i++) {
        await limitedStrategy.recordExecution({
          task: { id: `task-${i}`, type: 'test', description: `Task ${i}` },
          startTime: new Date(),
          endTime: new Date(),
          success: true,
          duration: 100,
        });
      }

      const history = await limitedStrategy.getExecutionHistory();
      expect(history).toHaveLength(3);
      expect(history[0].task.id).toBe('task-2');
    });
  });

  describe('strategy recommendations', () => {
    beforeEach(async () => {
      await strategy.storePattern({
        id: 'best-pattern',
        type: 'recommended',
        domain: 'testing',
        content: 'Best pattern',
        confidence: 0.9,
        usageCount: 10,
        successRate: 0.85,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should recommend strategy based on patterns', async () => {
      const recommendation = await strategy.recommendStrategy({});

      expect(recommendation).not.toBeNull();
      expect(recommendation!.strategy).toBe('recommended');
      expect(recommendation!.confidence).toBe(0.9);
    });

    it('should return null when no patterns exist', async () => {
      await strategy.reset();
      const recommendation = await strategy.recommendStrategy({});

      expect(recommendation).toBeNull();
    });

    it('should record recommendation outcomes', async () => {
      const recommendation = await strategy.recommendStrategy({});
      await strategy.recordRecommendationOutcome(recommendation!, true);

      const patterns = await strategy.getPatterns({ type: 'recommended' });
      expect(patterns[0].confidence).toBeGreaterThan(0.9);
    });
  });

  describe('training', () => {
    beforeEach(async () => {
      await strategy.recordExecution({
        task: { id: 'task-1', type: 'unit-test', description: 'Test' },
        startTime: new Date(),
        endTime: new Date(),
        success: true,
        duration: 100,
      });
    });

    it('should train and learn patterns from executions', async () => {
      const result = await strategy.train(5);

      expect(result.iterations).toBe(5);
      expect(result.patternsLearned).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should update training status', async () => {
      await strategy.train(1);
      const status = strategy.getStatus();

      expect(status.lastTraining).toBeDefined();
    });
  });

  describe('pattern import/export', () => {
    it('should export patterns', async () => {
      await strategy.storePattern({
        id: 'export-test',
        type: 'test',
        domain: 'testing',
        content: 'Export test',
        confidence: 0.7,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const patterns = await strategy.exportPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('export-test');
    });

    it('should import patterns', async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'import-1',
          type: 'imported',
          domain: 'testing',
          content: 'Imported pattern',
          confidence: 0.8,
          usageCount: 0,
          successRate: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const imported = await strategy.importPatterns(patterns);
      expect(imported).toBe(1);

      const stored = await strategy.getPatterns({ type: 'imported' });
      expect(stored).toHaveLength(1);
    });

    it('should not import duplicate patterns', async () => {
      await strategy.storePattern({
        id: 'existing',
        type: 'test',
        domain: 'testing',
        content: 'Existing',
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const imported = await strategy.importPatterns([
        {
          id: 'existing',
          type: 'test',
          domain: 'testing',
          content: 'Duplicate',
          confidence: 0.9,
          usageCount: 0,
          successRate: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      expect(imported).toBe(0);
    });
  });

  describe('metrics', () => {
    it('should track learning metrics', async () => {
      await strategy.recordExecution({
        task: { id: 'task-1', type: 'test', description: 'Test' },
        startTime: new Date(),
        endTime: new Date(),
        success: true,
        duration: 100,
      });
      await strategy.recordExecution({
        task: { id: 'task-2', type: 'test', description: 'Test 2' },
        startTime: new Date(),
        endTime: new Date(),
        success: false,
        duration: 200,
      });

      const metrics = await strategy.getMetrics();

      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successfulExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all state on reset', async () => {
      await strategy.storePattern({
        id: 'test',
        type: 'test',
        domain: 'testing',
        content: 'Test',
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await strategy.recordExecution({
        task: { id: 'task-1', type: 'test', description: 'Test' },
        startTime: new Date(),
        endTime: new Date(),
        success: true,
        duration: 100,
      });

      await strategy.reset();

      const patterns = await strategy.getPatterns({});
      const history = await strategy.getExecutionHistory();

      expect(patterns).toHaveLength(0);
      expect(history).toHaveLength(0);
    });
  });
});

describe('DisabledLearningStrategy', () => {
  let strategy: DisabledLearningStrategy;

  beforeEach(() => {
    strategy = new DisabledLearningStrategy();
  });

  it('should report disabled status', () => {
    const status = strategy.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.initialized).toBe(true);
  });

  it('should return empty patterns', async () => {
    const patterns = await strategy.getPatterns({});
    expect(patterns).toHaveLength(0);
  });

  it('should return null recommendations', async () => {
    const rec = await strategy.recommendStrategy({});
    expect(rec).toBeNull();
  });
});

describe('createLearningStrategy factory', () => {
  it('should create default strategy', () => {
    const strategy = createLearningStrategy('default');
    expect(strategy).toBeInstanceOf(DefaultLearningStrategy);
  });

  it('should create disabled strategy', () => {
    const strategy = createLearningStrategy('disabled');
    expect(strategy).toBeInstanceOf(DisabledLearningStrategy);
  });
});
