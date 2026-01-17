/**
 * AgentDB Learning Integration Tests
 *
 * Tests the integration of AgentDB learning with QE agents:
 * - Experience recording and training
 * - Pattern storage and retrieval
 * - Learning recommendations
 * - Pattern optimization
 * - Statistics tracking
 *
 * @group integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgentDBLearningIntegration } from '../../src/learning/AgentDBLearningIntegration';
import { AgentDBPatternOptimizer, VectorEmbeddingGenerator, PatternConsolidator } from '../../src/learning/AgentDBPatternOptimizer';
import { EnhancedAgentDBService } from '../../src/core/memory/EnhancedAgentDBService';
import { QEReasoningBank, TestPattern } from '../../src/reasoning/QEReasoningBank';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { TaskResult } from '../../src/learning/RewardCalculator';
import { TaskState, AgentAction } from '../../src/learning/types';

describe('AgentDB Learning Integration', () => {
  let integration: AgentDBLearningIntegration;
  let agentDB: EnhancedAgentDBService;
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    // Initialize in-memory test environment
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();

    agentDB = new EnhancedAgentDBService({
      dbPath: ':memory:',
      enableQuic: false,
      enableLearning: true,
      learningPlugins: [
        { algorithm: 'q-learning', learningRate: 0.1 }
      ]
    });

    await agentDB.initialize();

    reasoningBank = new QEReasoningBank({ minQuality: 0.7 });

    learningEngine = new LearningEngine('test-agent', memoryManager);
    await learningEngine.initialize();

    integration = new AgentDBLearningIntegration(
      learningEngine,
      agentDB,
      reasoningBank,
      {
        enabled: true,
        algorithm: 'q-learning',
        useVectorSearch: true,
        storePatterns: true,
        batchSize: 10,
        trainingFrequency: 5
      }
    );

    await integration.initialize();
  });

  afterEach(async () => {
    await integration.clearLearningData('test-agent');

    // Dispose learning engine
    if (learningEngine?.dispose) {
      await learningEngine.dispose();
    }

    await agentDB.close();

    if (memoryManager?.clear) {
      await memoryManager.clear();
    }
  });

  describe('Experience Recording', () => {
    it('should record successful experience', async () => {
      const task = { id: 'task-1', type: 'unit-test-generation' };
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['jest', 'typescript'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8,
        timeConstraint: 30000
      };
      const action: AgentAction = {
        strategy: 'comprehensive',
        toolsUsed: ['jest', 'mock'],
        parallelization: 0.5,
        retryPolicy: 'exponential',
        resourceAllocation: 0.5
      };
      const result: TaskResult = {
        success: true,
        executionTime: 1200,
        metadata: { testsGenerated: 10 }
      };

      await integration.recordExperience('test-agent', task, result, state, action, 0.85);

      const stats = await integration.getStatistics('test-agent');
      expect(stats.totalExperiences).toBeGreaterThan(0);
      expect(stats.avgReward).toBeGreaterThan(0);
    });

    it('should trigger batch training after threshold', async () => {
      const task = { id: 'task-1', type: 'unit-test-generation' };
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['jest'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };
      const action: AgentAction = {
        strategy: 'default',
        toolsUsed: [],
        parallelization: 0.5,
        retryPolicy: 'exponential',
        resourceAllocation: 0.5
      };
      const result: TaskResult = { success: true, executionTime: 1000 };

      // Record 10 experiences (training frequency is 5)
      for (let i = 0; i < 10; i++) {
        await integration.recordExperience('test-agent', task, result, state, action, 0.8);
      }

      const stats = await integration.getStatistics('test-agent');
      expect(stats.totalExperiences).toBe(10);
      expect(stats.lastTrainingTime).toBeGreaterThan(0);
    });

    it('should store successful patterns', async () => {
      const task = { id: 'task-1', type: 'unit-test-generation' };
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['jest'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };
      const action: AgentAction = {
        strategy: 'comprehensive',
        toolsUsed: ['jest'],
        parallelization: 0.5,
        retryPolicy: 'exponential',
        resourceAllocation: 0.5
      };
      const result: TaskResult = { success: true, executionTime: 1000 };

      await integration.recordExperience('test-agent', task, result, state, action, 0.9);

      const stats = await integration.getStatistics('test-agent');
      expect(stats.patternsStored).toBeGreaterThan(0);
    });
  });

  describe('Learning Recommendations', () => {
    it('should provide learning-enhanced recommendations', async () => {
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['jest', 'typescript'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await integration.getRecommendations('test-agent', state);

      expect(recommendation).toHaveProperty('action');
      expect(recommendation).toHaveProperty('confidence');
      expect(recommendation).toHaveProperty('reasoning');
      expect(recommendation).toHaveProperty('alternatives');
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
    });

    it('should combine multiple recommendation sources', async () => {
      // Train with some experiences first
      const task = { id: 'task-1', type: 'unit-test-generation' };
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['jest'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };
      const action: AgentAction = {
        strategy: 'comprehensive',
        toolsUsed: ['jest'],
        parallelization: 0.5,
        retryPolicy: 'exponential',
        resourceAllocation: 0.5
      };
      const result: TaskResult = { success: true, executionTime: 1000 };

      for (let i = 0; i < 5; i++) {
        await integration.recordExperience('test-agent', task, result, state, action, 0.85);
      }

      const recommendation = await integration.getRecommendations('test-agent', state);

      expect(recommendation.confidence).toBeGreaterThan(0.5);
      expect(recommendation.reasoning).toContain('AgentDB');
    });
  });

  describe('Statistics', () => {
    it('should track learning statistics', async () => {
      const stats = await integration.getStatistics('test-agent');

      expect(stats).toHaveProperty('totalExperiences');
      expect(stats).toHaveProperty('avgReward');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('modelsActive');
      expect(stats).toHaveProperty('patternsStored');
      expect(stats).toHaveProperty('lastTrainingTime');
    });

    it('should update statistics after training', async () => {
      const statsBefore = await integration.getStatistics('test-agent');

      const task = { id: 'task-1', type: 'unit-test-generation' };
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['jest'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };
      const action: AgentAction = {
        strategy: 'default',
        toolsUsed: [],
        parallelization: 0.5,
        retryPolicy: 'exponential',
        resourceAllocation: 0.5
      };
      const result: TaskResult = { success: true, executionTime: 1000 };

      await integration.recordExperience('test-agent', task, result, state, action, 0.8);

      const statsAfter = await integration.getStatistics('test-agent');

      expect(statsAfter.totalExperiences).toBeGreaterThan(statsBefore.totalExperiences);
    });
  });

  describe('Model Export/Import', () => {
    it('should export learning model', async () => {
      // Train some experiences
      const task = { id: 'task-1', type: 'unit-test-generation' };
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['jest'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };
      const action: AgentAction = {
        strategy: 'default',
        toolsUsed: [],
        parallelization: 0.5,
        retryPolicy: 'exponential',
        resourceAllocation: 0.5
      };
      const result: TaskResult = { success: true, executionTime: 1000 };

      for (let i = 0; i < 5; i++) {
        await integration.recordExperience('test-agent', task, result, state, action, 0.8);
      }

      const exported = await integration.exportLearningModel('test-agent');

      expect(exported).toHaveProperty('agentId', 'test-agent');
      expect(exported).toHaveProperty('algorithm', 'q-learning');
      expect(exported).toHaveProperty('experiences');
      expect(exported).toHaveProperty('stats');
      expect(exported).toHaveProperty('exportedAt');
    });
  });
});

describe('AgentDB Pattern Optimizer', () => {
  let optimizer: AgentDBPatternOptimizer;
  let reasoningBank: QEReasoningBank;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank({ minQuality: 0.7 });
    optimizer = new AgentDBPatternOptimizer(reasoningBank);
  });

  describe('Vector Embedding Generation', () => {
    it('should generate embeddings for patterns', () => {
      const generator = new VectorEmbeddingGenerator(384);

      const pattern: TestPattern = {
        id: 'pattern-1',
        name: 'API validation test',
        description: 'Tests API endpoint validation',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        template: '{}',
        examples: ['test code'],
        confidence: 0.8,
        usageCount: 5,
        successRate: 0.9,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'validation', 'integration']
        }
      };

      const embedding = generator.generateEmbedding(pattern);

      expect(embedding).toHaveLength(384);
      expect(embedding.every(val => typeof val === 'number')).toBe(true);
      expect(embedding.every(val => !isNaN(val))).toBe(true);
    });

    it('should generate normalized embeddings', () => {
      const generator = new VectorEmbeddingGenerator(384);

      const pattern: TestPattern = {
        id: 'pattern-1',
        name: 'Test pattern',
        description: 'Description',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: '{}',
        examples: [],
        confidence: 0.8,
        usageCount: 1,
        successRate: 1,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      const embedding = generator.generateEmbedding(pattern);

      // Check if vector is normalized (magnitude ≈ 1)
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 1);
    });
  });

  describe('Pattern Consolidation', () => {
    it('should consolidate similar patterns', () => {
      const consolidator = new PatternConsolidator(0.85);

      const patterns: TestPattern[] = [
        {
          id: 'pattern-1',
          name: 'API validation test 1',
          description: 'Test API validation',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: '{}',
          examples: ['code1'],
          confidence: 0.8,
          usageCount: 5,
          successRate: 0.9,
          quality: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['api', 'validation']
          }
        },
        {
          id: 'pattern-2',
          name: 'API validation test 2',
          description: 'Test API validation',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: '{}',
          examples: ['code2'],
          confidence: 0.75,
          usageCount: 3,
          successRate: 0.85,
          quality: 0.80,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['api', 'validation']
          }
        },
        {
          id: 'pattern-3',
          name: 'Unit test for utils',
          description: 'Test utility functions',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: '{}',
          examples: ['code3'],
          confidence: 0.9,
          usageCount: 10,
          successRate: 0.95,
          quality: 0.90,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['unit', 'utils']
          }
        }
      ];

      const consolidated = consolidator.consolidatePatterns(patterns);

      // Should merge the two similar API patterns
      expect(consolidated.length).toBeLessThan(patterns.length);
      expect(consolidated.length).toBe(2);

      // Merged pattern should have aggregated metrics
      const apiPattern = consolidated.find(p => p.category === 'integration');
      expect(apiPattern).toBeDefined();
      expect(apiPattern!.usageCount).toBe(8); // 5 + 3
    });
  });

  describe('Pattern Optimization', () => {
    it('should optimize patterns with embeddings', async () => {
      const patterns: TestPattern[] = [
        {
          id: 'pattern-1',
          name: 'Test pattern 1',
          description: 'Description 1',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: '{}',
          examples: [],
          confidence: 0.8,
          usageCount: 5,
          successRate: 0.9,
          quality: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['test']
          }
        }
      ];

      const result = await optimizer.optimizePatterns(patterns);

      expect(result.optimized).toHaveLength(patterns.length);
      expect(result.embeddings.size).toBe(patterns.length);
      expect(result.stats.originalCount).toBe(patterns.length);
      expect(result.stats.consolidatedCount).toBeGreaterThan(0);
      expect(result.stats.memoryReduction).toBeGreaterThanOrEqual(0);
    });
  });
});
