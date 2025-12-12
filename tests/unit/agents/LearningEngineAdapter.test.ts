/**
 * LearningEngineAdapter Unit Tests
 *
 * Tests the adapter that bridges LearningEngine to AgentLearningStrategy.
 */

import { LearningEngineAdapter, createLearningAdapter } from '../../../src/agents/adapters';
import type { LearningEngine } from '../../../src/learning/LearningEngine';
import type { ExecutionEvent, LearnedPattern } from '../../../src/core/strategies';

// Mock LearningEngine
const createMockEngine = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  isEnabled: jest.fn().mockReturnValue(true),
  getPatterns: jest.fn().mockResolvedValue([]),
  recommendStrategy: jest.fn().mockResolvedValue({
    strategy: 'default',
    confidence: 0.8,
    reasoning: 'Test recommendation',
    alternatives: [],
    expectedImprovement: 0.1,
  }),
  learnFromExecution: jest.fn().mockResolvedValue({
    improved: true,
    previousPerformance: 0.5,
    newPerformance: 0.6,
    improvementRate: 0.2,
    confidence: 0.7,
    patterns: [],
    timestamp: new Date(),
  }),
  getTotalExperiences: jest.fn().mockReturnValue(100),
  getAlgorithmStats: jest.fn().mockReturnValue({
    algorithm: 'q-learning',
    stats: {
      steps: 100,
      episodes: 10,
      tableSize: 50,
      explorationRate: 0.1,
      avgQValue: 0.5,
      maxQValue: 1.0,
      minQValue: -0.5,
    },
  }),
  memoryStore: {
    storePattern: jest.fn().mockResolvedValue(undefined),
    queryPatternsByAgent: jest.fn().mockResolvedValue([]),
  },
  agentId: 'test-agent',
});

describe('LearningEngineAdapter', () => {
  let mockEngine: ReturnType<typeof createMockEngine>;
  let adapter: LearningEngineAdapter;

  beforeEach(() => {
    mockEngine = createMockEngine();
    adapter = new LearningEngineAdapter(mockEngine as unknown as LearningEngine);
  });

  describe('initialize', () => {
    it('should initialize the engine', async () => {
      await adapter.initialize();

      expect(mockEngine.initialize).toHaveBeenCalled();
    });

    it('should set initialized state', async () => {
      const status = adapter.getStatus();
      expect(status.initialized).toBe(false);

      await adapter.initialize();

      const statusAfter = adapter.getStatus();
      expect(statusAfter.initialized).toBe(true);
    });
  });

  describe('storePattern', () => {
    it('should store pattern via memoryStore', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-1',
        type: 'test-type',
        domain: 'test-domain',
        content: 'test content',
        confidence: 0.8,
        usageCount: 5,
        successRate: 0.9,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await adapter.storePattern(pattern);

      expect(mockEngine.memoryStore.storePattern).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pattern-1',
          pattern: 'test-type:test-domain',
          confidence: 0.8,
        })
      );
    });
  });

  describe('getPatterns', () => {
    it('should return patterns from engine', async () => {
      mockEngine.getPatterns.mockResolvedValue([
        {
          id: 'p1',
          pattern: 'type:domain',
          confidence: 0.9,
          usageCount: 10,
          successRate: 0.85,
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
      ]);

      const patterns = await adapter.getPatterns({});

      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('p1');
      expect(patterns[0].type).toBe('type');
      expect(patterns[0].domain).toBe('domain');
    });

    it('should filter by minConfidence', async () => {
      mockEngine.getPatterns.mockResolvedValue([
        { id: 'p1', pattern: 'a:b', confidence: 0.9, usageCount: 1, successRate: 0.5, createdAt: new Date(), lastUsedAt: new Date() },
        { id: 'p2', pattern: 'c:d', confidence: 0.3, usageCount: 1, successRate: 0.5, createdAt: new Date(), lastUsedAt: new Date() },
      ]);

      const patterns = await adapter.getPatterns({ minConfidence: 0.5 });

      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('p1');
    });

    it('should respect limit', async () => {
      mockEngine.getPatterns.mockResolvedValue([
        { id: 'p1', pattern: 'a:b', confidence: 0.9, usageCount: 1, successRate: 0.5, createdAt: new Date(), lastUsedAt: new Date() },
        { id: 'p2', pattern: 'c:d', confidence: 0.8, usageCount: 1, successRate: 0.5, createdAt: new Date(), lastUsedAt: new Date() },
        { id: 'p3', pattern: 'e:f', confidence: 0.7, usageCount: 1, successRate: 0.5, createdAt: new Date(), lastUsedAt: new Date() },
      ]);

      const patterns = await adapter.getPatterns({ limit: 2 });

      expect(patterns).toHaveLength(2);
    });
  });

  describe('findSimilarPatterns', () => {
    it('should return patterns sorted by confidence', async () => {
      mockEngine.getPatterns.mockResolvedValue([
        { id: 'p1', pattern: 'a:b', confidence: 0.5, usageCount: 1, successRate: 0.5, createdAt: new Date(), lastUsedAt: new Date() },
        { id: 'p2', pattern: 'c:d', confidence: 0.9, usageCount: 1, successRate: 0.5, createdAt: new Date(), lastUsedAt: new Date() },
      ]);

      const patterns = await adapter.findSimilarPatterns([0.1, 0.2], 10);

      expect(patterns[0].confidence).toBe(0.9);
      expect(patterns[1].confidence).toBe(0.5);
    });
  });

  describe('recommendStrategy', () => {
    it('should return recommendation from engine', async () => {
      const rec = await adapter.recommendStrategy({ complexity: 0.5 });

      expect(rec).not.toBeNull();
      expect(rec!.strategy).toBe('default');
      expect(rec!.confidence).toBe(0.8);
    });

    it('should return null for low confidence', async () => {
      mockEngine.recommendStrategy.mockResolvedValue({
        strategy: 'test',
        confidence: 0.05,
        reasoning: 'Low confidence',
        alternatives: [],
        expectedImprovement: 0,
      });

      const rec = await adapter.recommendStrategy({});

      expect(rec).toBeNull();
    });
  });

  describe('recordExecution', () => {
    it('should call learnFromExecution on engine', async () => {
      const event: ExecutionEvent = {
        task: { id: 'task-1', type: 'test' } as any,
        success: true,
        duration: 1000,
      };

      await adapter.recordExecution(event);

      expect(mockEngine.learnFromExecution).toHaveBeenCalled();
    });

    it('should track execution history', async () => {
      const event: ExecutionEvent = {
        task: { id: 'task-1', type: 'test' } as any,
        success: true,
        duration: 1000,
      };

      await adapter.recordExecution(event);
      const history = await adapter.getExecutionHistory();

      expect(history).toHaveLength(1);
      expect(history[0].task.id).toBe('task-1');
    });

    it('should bound execution history to 1000 entries', async () => {
      // Record 1005 executions
      for (let i = 0; i < 1005; i++) {
        await adapter.recordExecution({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: true,
          duration: 100,
        });
      }

      const history = await adapter.getExecutionHistory(2000);
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('train', () => {
    it('should return training result', async () => {
      const result = await adapter.train(10);

      expect(result.iterations).toBe(10);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('exportPatterns', () => {
    it('should export patterns in strategy format', async () => {
      mockEngine.getPatterns.mockResolvedValue([
        {
          id: 'p1',
          pattern: 'test:export',
          confidence: 0.9,
          usageCount: 5,
          successRate: 0.8,
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
      ]);

      const patterns = await adapter.exportPatterns();

      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('test');
      expect(patterns[0].domain).toBe('export');
    });
  });

  describe('importPatterns', () => {
    it('should import patterns', async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'p1',
          type: 'test',
          domain: 'import',
          content: 'content',
          confidence: 0.9,
          usageCount: 5,
          successRate: 0.8,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const imported = await adapter.importPatterns(patterns);

      expect(imported).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('should return learning status', async () => {
      await adapter.initialize();
      const status = adapter.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.initialized).toBe(true);
      expect(status.executionsRecorded).toBe(100);
    });
  });

  describe('getMetrics', () => {
    it('should return learning metrics', async () => {
      // Record some executions
      await adapter.recordExecution({
        task: { id: 't1', type: 'test' } as any,
        success: true,
        duration: 100,
      });
      await adapter.recordExecution({
        task: { id: 't2', type: 'test' } as any,
        success: false,
        duration: 200,
      });

      const metrics = await adapter.getMetrics();

      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successfulExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset adapter state', async () => {
      await adapter.recordExecution({
        task: { id: 't1', type: 'test' } as any,
        success: true,
        duration: 100,
      });

      await adapter.reset!();

      const history = await adapter.getExecutionHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('createLearningAdapter factory', () => {
    it('should create an adapter from an engine', () => {
      const factoryAdapter = createLearningAdapter(mockEngine as unknown as LearningEngine);
      expect(factoryAdapter.getStatus().enabled).toBe(true);
    });
  });
});
