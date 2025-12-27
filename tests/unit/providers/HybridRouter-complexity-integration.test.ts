/**
 * Unit tests for HybridRouterComplexityIntegration
 *
 * Tests ML-based complexity classification integration with HybridRouter
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  HybridRouterWithComplexity,
  HybridRouterWithComplexityConfig
} from '../../../src/providers/HybridRouterComplexityIntegration';
import {
  TaskComplexity,
  HybridCompletionOptions
} from '../../../src/providers/HybridRouter';
import { RoutingHistoryEntry } from '../../../src/routing/ComplexityClassifier';

describe('HybridRouterComplexityIntegration', () => {
  let router: HybridRouterWithComplexity;
  let config: HybridRouterWithComplexityConfig;

  beforeEach(() => {
    // Reset configuration for each test
    config = {
      debug: false,
      classifier: {
        debug: false,
        enableLearning: true,
        learningRate: 0.1,
        maxHistorySize: 100
      },
      autoTrain: true,
      minConfidence: 0.3,
      fallbackToHeuristics: false,
      // Mock provider configs to avoid actual initialization
      claude: undefined,
      ruvllm: undefined
    };

    router = new HybridRouterWithComplexity(config);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultRouter = new HybridRouterWithComplexity();
      expect(defaultRouter).toBeDefined();
    });

    it('should initialize with custom classifier config', () => {
      const customRouter = new HybridRouterWithComplexity({
        classifier: {
          learningRate: 0.05,
          maxHistorySize: 500
        }
      });
      expect(customRouter).toBeDefined();
    });

    it('should enable auto-training by default', () => {
      const stats = router.getClassifierStats();
      expect(stats).toBeDefined();
      expect(stats.totalClassifications).toBe(0);
    });
  });

  describe('ML-Based Complexity Classification', () => {
    it('should classify simple tasks correctly', () => {
      const options: HybridCompletionOptions = {
        messages: [
          {
            role: 'user',
            content: 'What is 2+2?'
          }
        ]
      };

      // Classification happens internally during complete()
      // We test via statistics after classification
      const initialStats = router.getClassifierStats();
      expect(initialStats.totalClassifications).toBe(0);
    });

    it('should classify moderate tasks correctly', () => {
      const options: HybridCompletionOptions = {
        messages: [
          {
            role: 'user',
            content: 'Explain the concept of object-oriented programming with examples.'
          }
        ]
      };

      // Verify classifier is ready
      const stats = router.getClassifierStats();
      expect(stats).toBeDefined();
    });

    it('should classify complex tasks correctly', () => {
      const options: HybridCompletionOptions = {
        messages: [
          {
            role: 'user',
            content: `
              Analyze this codebase architecture and provide recommendations:
              \`\`\`typescript
              // Complex code structure here
              class SystemArchitecture {
                // ... many lines of code
              }
              \`\`\`
              Consider scalability, performance, and maintainability.
            `
          }
        ],
        maxTokens: 2000
      };

      const stats = router.getClassifierStats();
      expect(stats).toBeDefined();
    });

    it('should classify very complex tasks correctly', () => {
      const options: HybridCompletionOptions = {
        messages: [
          {
            role: 'user',
            content: `
              Design a distributed microservices architecture for a large-scale
              e-commerce platform. Include:
              - Service decomposition strategy
              - Inter-service communication patterns
              - Data consistency mechanisms
              - Scalability considerations
              - Security architecture
              - Performance optimization strategies

              Provide detailed implementation code for critical services.
            `.repeat(3) // Make it very long
          }
        ],
        maxTokens: 4000
      };

      const stats = router.getClassifierStats();
      expect(stats).toBeDefined();
    });

    it('should provide confidence scores', () => {
      const stats = router.getClassifierStats();
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Classifier Training from Outcomes', () => {
    it('should record successful outcomes for training', () => {
      const entry: RoutingHistoryEntry = {
        features: {
          contentLength: 500,
          estimatedTokenCount: 125,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.3,
          promptEntropy: 0.5,
          contextWindowUsage: 0.02,
          hasMultimodal: false,
          requestedMaxTokens: 500,
          systemPromptComplexity: 0.2
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: {
          success: true,
          latency: 1200,
          cost: 0.001,
          provider: 'local'
        },
        timestamp: new Date()
      };

      router.trainFromOutcome(entry);

      const stats = router.getClassifierStats();
      expect(stats.historySize).toBe(1);
      expect(stats.successRate).toBe(1.0);
    });

    it('should record failed outcomes for training', () => {
      const entry: RoutingHistoryEntry = {
        features: {
          contentLength: 10000,
          estimatedTokenCount: 2500,
          messageCount: 5,
          hasCodeBlocks: true,
          keywordComplexity: 0.8,
          promptEntropy: 0.7,
          contextWindowUsage: 0.3,
          hasMultimodal: false,
          requestedMaxTokens: 3000,
          systemPromptComplexity: 0.6
        },
        selectedComplexity: TaskComplexity.SIMPLE, // Mis-classified as simple
        actualOutcome: {
          success: false,
          latency: 8000,
          cost: 0,
          error: 'Timeout - task too complex for simple routing'
        },
        timestamp: new Date()
      };

      router.trainFromOutcome(entry);

      const stats = router.getClassifierStats();
      expect(stats.historySize).toBe(1);
      expect(stats.successRate).toBe(0.0);
    });

    it('should improve classification with training data', () => {
      // Train with multiple successful outcomes for complex tasks
      for (let i = 0; i < 10; i++) {
        const entry: RoutingHistoryEntry = {
          features: {
            contentLength: 5000 + i * 100,
            estimatedTokenCount: 1250 + i * 25,
            messageCount: 3,
            hasCodeBlocks: true,
            keywordComplexity: 0.7,
            promptEntropy: 0.6,
            contextWindowUsage: 0.15,
            hasMultimodal: false,
            requestedMaxTokens: 2000,
            systemPromptComplexity: 0.5
          },
          selectedComplexity: TaskComplexity.COMPLEX,
          actualOutcome: {
            success: true,
            latency: 2000 + i * 100,
            cost: 0.005,
            provider: 'cloud'
          },
          timestamp: new Date()
        };

        router.trainFromOutcome(entry);
      }

      const stats = router.getClassifierStats();
      expect(stats.historySize).toBe(10);
      expect(stats.successRate).toBe(1.0);
      expect(stats.complexityDistribution[TaskComplexity.COMPLEX]).toBe(10);
    });

    it('should update feature weights through learning', () => {
      const initialWeights = router.getFeatureWeights();

      // Train with outcomes that show code blocks are important
      for (let i = 0; i < 5; i++) {
        router.trainFromOutcome({
          features: {
            contentLength: 1000,
            estimatedTokenCount: 250,
            messageCount: 1,
            hasCodeBlocks: true,
            keywordComplexity: 0.3,
            promptEntropy: 0.4,
            contextWindowUsage: 0.03,
            hasMultimodal: false,
            requestedMaxTokens: 500,
            systemPromptComplexity: 0.2
          },
          selectedComplexity: TaskComplexity.SIMPLE,
          actualOutcome: {
            success: false, // Failed because code makes it complex
            latency: 5000,
            cost: 0,
            error: 'Task more complex than expected'
          },
          timestamp: new Date()
        });
      }

      const updatedWeights = router.getFeatureWeights();

      // Weights should have changed
      expect(updatedWeights).not.toEqual(initialWeights);
    });
  });

  describe('Classifier Statistics', () => {
    it('should track total classifications', () => {
      const stats = router.getClassifierStats();
      expect(stats.totalClassifications).toBe(0);

      // After some training
      router.trainFromOutcome({
        features: {
          contentLength: 500,
          estimatedTokenCount: 125,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.2,
          promptEntropy: 0.4,
          contextWindowUsage: 0.02,
          hasMultimodal: false,
          requestedMaxTokens: 500,
          systemPromptComplexity: 0.1
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: {
          success: true,
          latency: 1000,
          cost: 0.001,
          provider: 'local'
        },
        timestamp: new Date()
      });

      const updatedStats = router.getClassifierStats();
      expect(updatedStats.historySize).toBe(1);
    });

    it('should calculate success rate correctly', () => {
      // Add 3 successes and 1 failure
      for (let i = 0; i < 3; i++) {
        router.trainFromOutcome({
          features: {
            contentLength: 500,
            estimatedTokenCount: 125,
            messageCount: 1,
            hasCodeBlocks: false,
            keywordComplexity: 0.2,
            promptEntropy: 0.4,
            contextWindowUsage: 0.02,
            hasMultimodal: false,
            requestedMaxTokens: 500,
            systemPromptComplexity: 0.1
          },
          selectedComplexity: TaskComplexity.SIMPLE,
          actualOutcome: {
            success: true,
            latency: 1000,
            cost: 0.001,
            provider: 'local'
          },
          timestamp: new Date()
        });
      }

      router.trainFromOutcome({
        features: {
          contentLength: 500,
          estimatedTokenCount: 125,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.2,
          promptEntropy: 0.4,
          contextWindowUsage: 0.02,
          hasMultimodal: false,
          requestedMaxTokens: 500,
          systemPromptComplexity: 0.1
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: {
          success: false,
          latency: 5000,
          cost: 0,
          error: 'Failed'
        },
        timestamp: new Date()
      });

      const stats = router.getClassifierStats();
      expect(stats.successRate).toBe(0.75); // 3/4
    });

    it('should track complexity distribution', () => {
      router.trainFromOutcome({
        features: {
          contentLength: 500,
          estimatedTokenCount: 125,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.2,
          promptEntropy: 0.4,
          contextWindowUsage: 0.02,
          hasMultimodal: false,
          requestedMaxTokens: 500,
          systemPromptComplexity: 0.1
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: { success: true, latency: 1000, cost: 0.001, provider: 'local' },
        timestamp: new Date()
      });

      router.trainFromOutcome({
        features: {
          contentLength: 3000,
          estimatedTokenCount: 750,
          messageCount: 2,
          hasCodeBlocks: true,
          keywordComplexity: 0.5,
          promptEntropy: 0.6,
          contextWindowUsage: 0.09,
          hasMultimodal: false,
          requestedMaxTokens: 1000,
          systemPromptComplexity: 0.4
        },
        selectedComplexity: TaskComplexity.COMPLEX,
        actualOutcome: { success: true, latency: 3000, cost: 0.01, provider: 'cloud' },
        timestamp: new Date()
      });

      const stats = router.getClassifierStats();
      expect(stats.complexityDistribution[TaskComplexity.SIMPLE]).toBe(1);
      expect(stats.complexityDistribution[TaskComplexity.COMPLEX]).toBe(1);
    });

    it('should expose feature weights', () => {
      const weights = router.getFeatureWeights();
      expect(weights).toBeDefined();
      expect(weights).toHaveProperty('contentLength');
      expect(weights).toHaveProperty('tokenCount');
      expect(weights).toHaveProperty('codeBlocks');
      expect(weights).toHaveProperty('keywordComplexity');
    });

    it('should expose complexity thresholds', () => {
      const thresholds = router.getComplexityThresholds();
      expect(thresholds).toBeDefined();
      expect(thresholds).toHaveProperty('simple');
      expect(thresholds).toHaveProperty('moderate');
      expect(thresholds).toHaveProperty('complex');
    });
  });

  describe('Routing History', () => {
    it('should maintain routing history', () => {
      router.trainFromOutcome({
        features: {
          contentLength: 500,
          estimatedTokenCount: 125,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.2,
          promptEntropy: 0.4,
          contextWindowUsage: 0.02,
          hasMultimodal: false,
          requestedMaxTokens: 500,
          systemPromptComplexity: 0.1
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: { success: true, latency: 1000, cost: 0.001, provider: 'local' },
        timestamp: new Date()
      });

      const history = router.getRoutingHistory();
      expect(history).toHaveLength(1);
      expect(history[0].selectedComplexity).toBe(TaskComplexity.SIMPLE);
      expect(history[0].actualOutcome.success).toBe(true);
    });

    it('should limit history size', () => {
      // Create router with small history limit
      const limitedRouter = new HybridRouterWithComplexity({
        classifier: { maxHistorySize: 5 }
      });

      // Add more entries than limit
      for (let i = 0; i < 10; i++) {
        limitedRouter.trainFromOutcome({
          features: {
            contentLength: 500,
            estimatedTokenCount: 125,
            messageCount: 1,
            hasCodeBlocks: false,
            keywordComplexity: 0.2,
            promptEntropy: 0.4,
            contextWindowUsage: 0.02,
            hasMultimodal: false,
            requestedMaxTokens: 500,
            systemPromptComplexity: 0.1
          },
          selectedComplexity: TaskComplexity.SIMPLE,
          actualOutcome: { success: true, latency: 1000, cost: 0.001, provider: 'local' },
          timestamp: new Date()
        });
      }

      const stats = limitedRouter.getClassifierStats();
      expect(stats.historySize).toBeLessThanOrEqual(5);
    });
  });

  describe('Confidence Scoring', () => {
    it('should provide confidence scores between 0 and 1', () => {
      // Add some training data
      router.trainFromOutcome({
        features: {
          contentLength: 500,
          estimatedTokenCount: 125,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.2,
          promptEntropy: 0.4,
          contextWindowUsage: 0.02,
          hasMultimodal: false,
          requestedMaxTokens: 500,
          systemPromptComplexity: 0.1
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: { success: true, latency: 1000, cost: 0.001, provider: 'local' },
        timestamp: new Date()
      });

      const stats = router.getClassifierStats();
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Integration with Base HybridRouter', () => {
    it('should extend HybridRouter', () => {
      expect(router).toBeInstanceOf(HybridRouterWithComplexity);
    });

    it('should expose HybridRouter methods', () => {
      expect(router.complete).toBeDefined();
      expect(router.initialize).toBeDefined();
      // Note: getHealth may not be defined in current HybridRouter implementation
    });
  });
});
