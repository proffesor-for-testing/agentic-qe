/**
 * Tests for NeuralCapableMixin
 *
 * Validates neural pattern matching, prediction, caching, and error handling.
 */

import {
  DefaultNeuralMatcher,
  createNeuralMatcher,
  safeNeuralPredict,
  mergeWithNeuralPrediction,
  getNeuralMetrics,
  NeuralInput,
  NeuralConfig,
  DEFAULT_NEURAL_CONFIG
} from '../../../src/agents/mixins/NeuralCapableMixin';

describe('NeuralCapableMixin', () => {
  describe('DefaultNeuralMatcher', () => {
    let matcher: DefaultNeuralMatcher;

    beforeEach(() => {
      matcher = new DefaultNeuralMatcher({ enabled: true });
    });

    test('should initialize with default config', () => {
      const status = matcher.getStatus();
      expect(status.available).toBe(true);
      expect(status.predictions).toBe(0);
    });

    test('should make flakiness predictions', async () => {
      const input: NeuralInput = {
        type: 'flakiness',
        data: {
          testName: 'test_example',
          results: [
            { testName: 'test_example', duration: 100, passed: true, timestamp: new Date() },
            { testName: 'test_example', duration: 120, passed: false, timestamp: new Date() },
            { testName: 'test_example', duration: 110, passed: true, timestamp: new Date() },
            { testName: 'test_example', duration: 105, passed: true, timestamp: new Date() },
            { testName: 'test_example', duration: 115, passed: false, timestamp: new Date() }
          ]
        }
      };

      const prediction = await matcher.predict(input);

      expect(prediction).toBeDefined();
      expect(prediction).not.toBeNull();
      expect(prediction.result).toBeDefined();
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(typeof prediction.result.isFlaky).toBe('boolean');
      expect(prediction.result.confidence).toBeGreaterThan(0);
      expect(prediction.timestamp).toBeInstanceOf(Date);
      expect(prediction.reasoning).toBeInstanceOf(Array);
      expect(prediction.reasoning.length).toBeGreaterThan(0);
    });

    test('should make test generation predictions', async () => {
      const input: NeuralInput = {
        type: 'test-generation',
        data: {
          codeSignature: { functionName: 'calculateSum' },
          framework: 'jest'
        }
      };

      const prediction = await matcher.predict(input);

      expect(prediction).toBeDefined();
      expect(prediction.result).toHaveProperty('suggestedTests');
      expect(prediction.result.suggestedTests).toBeInstanceOf(Array);
      expect(prediction.confidence).toBeGreaterThan(0.7);
    });

    test('should make coverage gap predictions', async () => {
      const input: NeuralInput = {
        type: 'coverage-gap',
        data: {
          currentCoverage: 0.65,
          codebase: { files: [] }
        }
      };

      const prediction = await matcher.predict(input);

      expect(prediction).toBeDefined();
      expect(prediction.result).toHaveProperty('gaps');
      expect(prediction.result.gaps).toBeInstanceOf(Array);
    });

    test('should make risk score predictions', async () => {
      const input: NeuralInput = {
        type: 'risk-score',
        data: {
          changes: [],
          historicalData: {}
        }
      };

      const prediction = await matcher.predict(input);

      expect(prediction).toBeDefined();
      expect(prediction.result).toHaveProperty('riskScore');
      expect(prediction.result.riskLevel).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
    });

    test('should cache predictions', async () => {
      const input: NeuralInput = {
        type: 'test-generation',
        data: { codeSignature: {}, framework: 'jest' }
      };

      // First prediction
      const pred1 = await matcher.predict(input);
      const status1 = matcher.getStatus();

      // Second prediction (should be cached)
      const pred2 = await matcher.predict(input);
      const status2 = matcher.getStatus();

      expect(pred1.confidence).toBe(pred2.confidence);
      expect(status2.cacheHitRate).toBeGreaterThan(status1.cacheHitRate);
    });

    test('should respect cache TTL', async () => {
      const shortCacheMatcher = new DefaultNeuralMatcher({
        enabled: true,
        cacheTTL: 100 // 100ms
      });

      const input: NeuralInput = {
        type: 'test-generation',
        data: { codeSignature: {}, framework: 'jest' }
      };

      // First prediction
      await shortCacheMatcher.predict(input);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should generate new prediction
      const pred2 = await shortCacheMatcher.predict(input);
      expect(pred2).toBeDefined();
    });

    test('should handle fallback on errors', async () => {
      const matcher = new DefaultNeuralMatcher({
        enabled: true,
        fallbackEnabled: true
      });

      const input: NeuralInput = {
        type: 'test-generation' as any,
        data: null // Invalid data to trigger error
      };

      const prediction = await matcher.predict(input);

      expect(prediction).toBeDefined();
      expect(prediction.confidence).toBe(0.5); // Fallback confidence
      expect(prediction.reasoning).toContain('Neural prediction unavailable');
    });
  });

  describe('createNeuralMatcher', () => {
    test('should create matcher when enabled', () => {
      const matcher = createNeuralMatcher({ enabled: true });
      expect(matcher).not.toBeNull();
      expect(matcher?.isAvailable()).toBe(true);
    });

    test('should return null when disabled', () => {
      const matcher = createNeuralMatcher({ enabled: false });
      expect(matcher).toBeNull();
    });

    test('should apply custom configuration', () => {
      const config: Partial<NeuralConfig> = {
        enabled: true,
        confidence: 0.85,
        cacheEnabled: false
      };

      const matcher = createNeuralMatcher(config);
      expect(matcher).not.toBeNull();
    });
  });

  describe('safeNeuralPredict', () => {
    test('should return null for null matcher', async () => {
      const result = await safeNeuralPredict(null, {} as NeuralInput);
      expect(result).toBeNull();
    });

    test('should return null for unavailable matcher', async () => {
      const matcher = createNeuralMatcher({ enabled: false });
      const result = await safeNeuralPredict(matcher, {} as NeuralInput);
      expect(result).toBeNull();
    });

    test('should return prediction for valid matcher', async () => {
      const matcher = createNeuralMatcher({ enabled: true });
      const input: NeuralInput = {
        type: 'test-generation',
        data: { codeSignature: {}, framework: 'jest' }
      };

      const result = await safeNeuralPredict(matcher, input);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThan(0);
    });

    test('should handle prediction errors gracefully', async () => {
      const matcher = new DefaultNeuralMatcher({ enabled: true, fallbackEnabled: false });

      // Mock predict to throw error
      jest.spyOn(matcher, 'predict').mockRejectedValue(new Error('Test error'));

      const input: NeuralInput = {
        type: 'test-generation',
        data: {}
      };

      const result = await safeNeuralPredict(matcher, input);
      expect(result).toBeNull(); // Should return null on error
    });
  });

  describe('mergeWithNeuralPrediction', () => {
    test('should return traditional result when no neural prediction', () => {
      const traditional = { value: 42 };
      const merged = mergeWithNeuralPrediction(traditional, null);

      expect(merged).toEqual({ value: 42 });
    });

    test('should include neural prediction in result', () => {
      const traditional = { value: 42 };
      const neural = {
        result: { suggestedValue: 50 },
        confidence: 0.8,
        timestamp: new Date()
      };

      const merged = mergeWithNeuralPrediction(traditional, neural);

      expect(merged.value).toBe(42);
      expect(merged.neural).toBeDefined();
      expect(merged.neural?.confidence).toBe(0.8);
    });

    test('should prefer neural with high confidence in neural-first strategy', () => {
      const traditional = { value: 42 };
      const neural = {
        result: { value: 50 },
        confidence: 0.9,
        timestamp: new Date()
      };

      const merged = mergeWithNeuralPrediction(traditional, neural, 'neural-first');

      expect(merged.value).toBe(50); // Neural value used
      expect(merged.neural).toBeDefined();
    });
  });

  describe('getNeuralMetrics', () => {
    test('should return disabled metrics for null matcher', () => {
      const metrics = getNeuralMetrics(null);

      expect(metrics.enabled).toBe(false);
      expect(metrics.predictions).toBe(0);
      expect(metrics.avgConfidence).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
    });

    test('should return metrics for active matcher', async () => {
      const matcher = createNeuralMatcher({ enabled: true });

      // Make some predictions
      const input: NeuralInput = {
        type: 'test-generation',
        data: { codeSignature: {}, framework: 'jest' }
      };

      await matcher?.predict(input);
      await matcher?.predict(input); // Cached

      const metrics = getNeuralMetrics(matcher);

      expect(metrics.enabled).toBe(true);
      expect(metrics.predictions).toBeGreaterThan(0);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    test('should work in complete workflow', async () => {
      // Create matcher
      const matcher = createNeuralMatcher({
        enabled: true,
        confidence: 0.75,
        cacheEnabled: true
      });

      expect(matcher).not.toBeNull();

      // Make prediction
      const input: NeuralInput = {
        type: 'test-generation',
        data: {
          codeSignature: { functionName: 'processData' },
          framework: 'jest',
          complexity: { cyclomaticComplexity: 5 }
        }
      };

      const prediction = await safeNeuralPredict(matcher, input);

      expect(prediction).not.toBeNull();
      expect(prediction?.confidence).toBeGreaterThan(0.7);

      // Merge with traditional analysis
      const traditional = { testsGenerated: 10 };
      const merged = mergeWithNeuralPrediction(traditional, prediction, 'weighted');

      expect(merged.testsGenerated).toBe(10);
      expect(merged.neural).toBeDefined();

      // Get metrics
      const metrics = getNeuralMetrics(matcher);

      expect(metrics.enabled).toBe(true);
      expect(metrics.predictions).toBeGreaterThan(0);
    });
  });
});
