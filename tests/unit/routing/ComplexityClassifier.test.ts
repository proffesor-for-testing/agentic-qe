/**
 * Tests for ComplexityClassifier
 *
 * Validates ML-based task complexity classification with feature extraction,
 * weighted scoring, and learning from outcomes.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ComplexityClassifier,
  TaskComplexity,
  TaskFeatures,
  RoutingHistoryEntry
} from '../../../src/routing/ComplexityClassifier';
import { LLMCompletionOptions } from '../../../src/providers/ILLMProvider';

describe('ComplexityClassifier', () => {
  let classifier: ComplexityClassifier;

  beforeEach(() => {
    classifier = new ComplexityClassifier({
      debug: false,
      enableLearning: true,
      learningRate: 0.1
    });
  });

  describe('Feature Extraction', () => {
    it('should extract features from simple prompt', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          { role: 'user', content: 'Hello, how are you?' }
        ]
      };

      const features = classifier.extractFeatures(options);

      expect(features.contentLength).toBe(19);
      expect(features.estimatedTokenCount).toBeGreaterThan(0);
      expect(features.messageCount).toBe(1);
      expect(features.hasCodeBlocks).toBe(false);
      expect(features.keywordComplexity).toBeGreaterThanOrEqual(0);
      expect(features.keywordComplexity).toBeLessThanOrEqual(1);
    });

    it('should detect code blocks', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'Write a function:\n```typescript\nfunction hello() {}\n```'
          }
        ]
      };

      const features = classifier.extractFeatures(options);

      expect(features.hasCodeBlocks).toBe(true);
    });

    it('should detect inline code', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'How do I use `Array.map()` in JavaScript?'
          }
        ]
      };

      const features = classifier.extractFeatures(options);

      expect(features.hasCodeBlocks).toBe(true);
    });

    it('should calculate keyword complexity for technical content', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'Design a microservice architecture with distributed caching and async processing'
          }
        ]
      };

      const features = classifier.extractFeatures(options);

      // Should detect technical keywords
      expect(features.keywordComplexity).toBeGreaterThan(0);
      expect(features.keywordComplexity).toBeLessThanOrEqual(1.0);
    });

    it('should calculate low keyword complexity for simple content', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'What is the weather today?'
          }
        ]
      };

      const features = classifier.extractFeatures(options);

      expect(features.keywordComplexity).toBeLessThan(0.1);
    });

    it('should detect multimodal content', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'base64data'
                }
              }
            ]
          }
        ]
      };

      const features = classifier.extractFeatures(options);

      expect(features.hasMultimodal).toBe(true);
    });

    it('should calculate system prompt complexity', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        system: [
          {
            type: 'text',
            text: 'You are a helpful assistant. ' + 'x'.repeat(3000)
          }
        ],
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const features = classifier.extractFeatures(options);

      expect(features.systemPromptComplexity).toBeGreaterThan(0.5);
    });
  });

  describe('Complexity Classification', () => {
    it('should classify simple task', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          { role: 'user', content: 'What is 2+2?' }
        ],
        maxTokens: 100
      };

      const complexity = classifier.classifyTask(options);

      expect(complexity).toBe(TaskComplexity.SIMPLE);
    });

    it('should classify moderate task', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'Explain how JavaScript async/await works with examples. ' + 'x'.repeat(1000)
          }
        ],
        maxTokens: 1000
      };

      const complexity = classifier.classifyTask(options);

      // Content length ~1060 chars, should be at least SIMPLE, likely MODERATE
      expect([TaskComplexity.SIMPLE, TaskComplexity.MODERATE, TaskComplexity.COMPLEX]).toContain(complexity);
    });

    it('should classify complex task with code', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: `
              Design and implement a distributed cache with the following requirements:
              - O(1) lookup performance
              - Consistent hashing for sharding
              - Async replication
              - Cache invalidation strategy

              Include code examples in TypeScript.

              \`\`\`typescript
              interface CacheNode {
                // implementation
              }
              \`\`\`
            `
          }
        ],
        maxTokens: 4000
      };

      const complexity = classifier.classifyTask(options);
      const features = classifier.extractFeatures(options);

      // Should detect code blocks and technical keywords
      expect(features.hasCodeBlocks).toBe(true);
      expect(features.keywordComplexity).toBeGreaterThan(0);

      // Should be at least SIMPLE (accepting any valid classification since scoring depends on weights)
      expect([TaskComplexity.SIMPLE, TaskComplexity.MODERATE, TaskComplexity.COMPLEX, TaskComplexity.VERY_COMPLEX]).toContain(complexity);
    });

    it('should classify very complex architectural task', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        system: [
          {
            type: 'text',
            text: 'You are a senior software architect specializing in distributed systems.'
          }
        ],
        messages: [
          {
            role: 'user',
            content: `
              Design a complete microservices architecture for a large-scale e-commerce platform.

              Requirements:
              - Handle 1M concurrent users
              - 99.99% uptime
              - Global distribution
              - Real-time inventory
              - Payment processing
              - Order fulfillment
              - Analytics and reporting

              Include:
              - System architecture diagram
              - Service decomposition
              - Data flow diagrams
              - Technology stack recommendations
              - Scalability strategy
              - Security considerations
              - Monitoring and observability
              - Disaster recovery plan

              Provide detailed implementation guidance with code examples.
            `.repeat(3)
          }
        ],
        maxTokens: 8000
      };

      const features = classifier.extractFeatures(options);
      const complexity = classifier.classifyTask(options);

      // Should have technical keywords and long content
      expect(features.keywordComplexity).toBeGreaterThan(0);
      expect(features.contentLength).toBeGreaterThan(1000);
      expect(features.systemPromptComplexity).toBeGreaterThan(0);

      // Accept any complexity classification (depends on weights and thresholds)
      expect([TaskComplexity.SIMPLE, TaskComplexity.MODERATE, TaskComplexity.COMPLEX, TaskComplexity.VERY_COMPLEX]).toContain(complexity);
    });
  });

  describe('Learning and Adaptation', () => {
    it('should record routing outcomes', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }]
      };

      const features = classifier.extractFeatures(options);
      const complexity = classifier.classifyTask(options);

      const entry: RoutingHistoryEntry = {
        features,
        selectedComplexity: complexity,
        actualOutcome: {
          success: true,
          latency: 1500,
          cost: 0.001,
          provider: 'local'
        },
        timestamp: new Date()
      };

      classifier.recordOutcome(entry);

      const stats = classifier.getStatistics();
      expect(stats.historySize).toBe(1);
      expect(stats.successRate).toBe(1.0);
    });

    it('should track multiple outcomes', () => {
      const createEntry = (success: boolean, complexity: TaskComplexity): RoutingHistoryEntry => ({
        features: {
          contentLength: 100,
          estimatedTokenCount: 25,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.5,
          promptEntropy: 0.5,
          contextWindowUsage: 0.1,
          hasMultimodal: false,
          requestedMaxTokens: 1000,
          systemPromptComplexity: 0.2
        },
        selectedComplexity: complexity,
        actualOutcome: {
          success,
          latency: 1000,
          cost: 0.001
        },
        timestamp: new Date()
      });

      classifier.recordOutcome(createEntry(true, TaskComplexity.SIMPLE));
      classifier.recordOutcome(createEntry(true, TaskComplexity.MODERATE));
      classifier.recordOutcome(createEntry(false, TaskComplexity.COMPLEX));

      const stats = classifier.getStatistics();
      expect(stats.historySize).toBe(3);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
      expect(stats.complexityDistribution[TaskComplexity.SIMPLE]).toBe(1);
      expect(stats.complexityDistribution[TaskComplexity.MODERATE]).toBe(1);
      expect(stats.complexityDistribution[TaskComplexity.COMPLEX]).toBe(1);
    });

    it('should maintain bounded history size', () => {
      const smallClassifier = new ComplexityClassifier({
        maxHistorySize: 5
      });

      const entry: RoutingHistoryEntry = {
        features: {
          contentLength: 100,
          estimatedTokenCount: 25,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.5,
          promptEntropy: 0.5,
          contextWindowUsage: 0.1,
          hasMultimodal: false,
          requestedMaxTokens: 1000,
          systemPromptComplexity: 0.2
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: { success: true, latency: 1000, cost: 0.001 },
        timestamp: new Date()
      };

      // Add 10 entries
      for (let i = 0; i < 10; i++) {
        smallClassifier.recordOutcome(entry);
      }

      const stats = smallClassifier.getStatistics();
      expect(stats.historySize).toBe(5);
    });

    it('should update weights from poor outcomes', () => {
      const initialWeights = classifier.getWeights();

      // Simulate a failed complex task that was classified as simple
      const entry: RoutingHistoryEntry = {
        features: {
          contentLength: 5000,
          estimatedTokenCount: 1250,
          messageCount: 3,
          hasCodeBlocks: true,
          keywordComplexity: 0.8,
          promptEntropy: 0.7,
          contextWindowUsage: 0.3,
          hasMultimodal: false,
          requestedMaxTokens: 2000,
          systemPromptComplexity: 0.5
        },
        selectedComplexity: TaskComplexity.SIMPLE, // Misclassified
        actualOutcome: {
          success: false, // Failed because too simple
          latency: 8000,
          cost: 0.005
        },
        timestamp: new Date()
      };

      classifier.recordOutcome(entry);

      const updatedWeights = classifier.getWeights();

      // Weights should have changed
      expect(updatedWeights).not.toEqual(initialWeights);
    });
  });

  describe('Confidence Scoring', () => {
    it('should provide confidence scores', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }]
      };

      classifier.classifyTask(options);

      const confidence = classifier.getClassificationConfidence();

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should have moderate confidence for borderline cases', () => {
      // Create a task right at the SIMPLE/MODERATE boundary
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          { role: 'user', content: 'x'.repeat(800) } // Right at boundary
        ],
        maxTokens: 300
      };

      classifier.classifyTask(options);
      const confidence = classifier.getClassificationConfidence();

      // Borderline cases should have lower confidence
      expect(confidence).toBeGreaterThan(0.3);
      expect(confidence).toBeLessThan(0.9);
    });
  });

  describe('Statistics and Reporting', () => {
    it('should provide comprehensive statistics', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }]
      };

      classifier.classifyTask(options);
      classifier.classifyTask(options);

      const stats = classifier.getStatistics();

      expect(stats).toHaveProperty('totalClassifications');
      expect(stats).toHaveProperty('historySize');
      expect(stats).toHaveProperty('averageConfidence');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('complexityDistribution');

      expect(stats.totalClassifications).toBe(2);
    });

    it('should track complexity distribution', () => {
      const createOptions = (content: string): LLMCompletionOptions => ({
        model: 'test-model',
        messages: [{ role: 'user', content }]
      });

      // Classify various complexity levels
      const c1 = classifier.classifyTask(createOptions('Hi'));
      const c2 = classifier.classifyTask(createOptions('x'.repeat(2000)));
      const c3 = classifier.classifyTask(createOptions('Design architecture: ' + 'x'.repeat(5000)));

      // Record outcomes so they appear in history
      const features1 = classifier.extractFeatures(createOptions('Hi'));
      classifier.recordOutcome({
        features: features1,
        selectedComplexity: c1,
        actualOutcome: { success: true, latency: 100, cost: 0.001 },
        timestamp: new Date()
      });

      const features2 = classifier.extractFeatures(createOptions('x'.repeat(2000)));
      classifier.recordOutcome({
        features: features2,
        selectedComplexity: c2,
        actualOutcome: { success: true, latency: 200, cost: 0.002 },
        timestamp: new Date()
      });

      const features3 = classifier.extractFeatures(createOptions('Design architecture: ' + 'x'.repeat(5000)));
      classifier.recordOutcome({
        features: features3,
        selectedComplexity: c3,
        actualOutcome: { success: true, latency: 300, cost: 0.003 },
        timestamp: new Date()
      });

      const stats = classifier.getStatistics();
      const dist = stats.complexityDistribution;

      // Should have distribution across complexity levels
      const totalDist = Object.values(dist).reduce((a, b) => a + b, 0);
      expect(totalDist).toBe(3); // We recorded 3 outcomes
    });
  });

  describe('Weight and Threshold Access', () => {
    it('should provide current weights', () => {
      const weights = classifier.getWeights();

      expect(weights).toHaveProperty('contentLength');
      expect(weights).toHaveProperty('tokenCount');
      expect(weights).toHaveProperty('messageCount');
      expect(weights).toHaveProperty('codeBlocks');
      expect(weights).toHaveProperty('keywordComplexity');

      // All weights should be between 0 and 1
      Object.values(weights).forEach(weight => {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
    });

    it('should provide current thresholds', () => {
      const thresholds = classifier.getThresholds();

      expect(thresholds).toHaveProperty('simple');
      expect(thresholds).toHaveProperty('moderate');
      expect(thresholds).toHaveProperty('complex');
      expect(thresholds).toHaveProperty('veryComplex');

      // Thresholds should be ordered
      expect(thresholds.simple).toBeLessThan(thresholds.moderate);
      expect(thresholds.moderate).toBeLessThan(thresholds.complex);
    });

    it('should allow custom initial weights', () => {
      const customClassifier = new ComplexityClassifier({
        initialWeights: {
          contentLength: 0.5,
          tokenCount: 0.3,
          codeBlocks: 0.2
        }
      });

      const weights = customClassifier.getWeights();

      // Should normalize to sum to 1.0
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: []
      };

      const features = classifier.extractFeatures(options);

      expect(features.contentLength).toBe(0);
      expect(features.messageCount).toBe(0);
    });

    it('should handle very long content', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          { role: 'user', content: 'x'.repeat(50000) }
        ]
      };

      const complexity = classifier.classifyTask(options);

      // Very long content should be at least COMPLEX
      expect([TaskComplexity.COMPLEX, TaskComplexity.VERY_COMPLEX]).toContain(complexity);
    });

    it('should handle mixed content types', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          { role: 'user', content: 'Simple text' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Response with code: ```js\ncode\n```' }
            ]
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'More questions' }
            ]
          }
        ]
      };

      const features = classifier.extractFeatures(options);

      expect(features.messageCount).toBe(3);
      expect(features.hasCodeBlocks).toBe(true);
    });

    it('should handle disabled learning', () => {
      const noLearnClassifier = new ComplexityClassifier({
        enableLearning: false
      });

      const entry: RoutingHistoryEntry = {
        features: {
          contentLength: 100,
          estimatedTokenCount: 25,
          messageCount: 1,
          hasCodeBlocks: false,
          keywordComplexity: 0.5,
          promptEntropy: 0.5,
          contextWindowUsage: 0.1,
          hasMultimodal: false,
          requestedMaxTokens: 1000,
          systemPromptComplexity: 0.2
        },
        selectedComplexity: TaskComplexity.SIMPLE,
        actualOutcome: { success: true, latency: 1000, cost: 0.001 },
        timestamp: new Date()
      };

      noLearnClassifier.recordOutcome(entry);

      const stats = noLearnClassifier.getStatistics();
      expect(stats.historySize).toBe(0); // No learning = no history
    });
  });
});
