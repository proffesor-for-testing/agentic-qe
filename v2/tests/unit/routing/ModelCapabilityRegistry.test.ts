/**
 * Unit tests for ModelCapabilityRegistry
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ModelCapabilityRegistry, type ModelCapabilities } from '../../../src/routing/ModelCapabilityRegistry';
import modelData from '../../../src/routing/data/model-capabilities.json';

describe('ModelCapabilityRegistry', () => {
  let registry: ModelCapabilityRegistry;

  beforeEach(() => {
    registry = new ModelCapabilityRegistry();
  });

  describe('Model Registration', () => {
    it('should register a model', () => {
      const model: ModelCapabilities = {
        modelId: 'test-model',
        provider: 'ollama',
        parameters: '7B',
        contextWindow: 8192,
        supportedTasks: ['test-generation'],
        strengths: ['fast'],
        availableOn: ['local'],
        requiresGPU: false
      };

      registry.registerModel(model);
      const retrieved = registry.getModel('test-model');
      expect(retrieved).toEqual(model);
    });

    it('should retrieve undefined for non-existent model', () => {
      const result = registry.getModel('non-existent');
      expect(result).toBeUndefined();
    });

    it('should load all default models from JSON', () => {
      // Manually load models from JSON for testing
      (modelData as ModelCapabilities[]).forEach(model => registry.registerModel(model));

      const allModels = registry.getAllModels();
      expect(allModels.length).toBeGreaterThan(10);

      // Verify some key models
      expect(registry.getModel('qwen2.5-coder:32b')).toBeDefined();
      expect(registry.getModel('llama3.3:70b')).toBeDefined();
      expect(registry.getModel('anthropic/claude-sonnet-4')).toBeDefined();
    });
  });

  describe('Provider Filtering', () => {
    beforeEach(() => {
      (modelData as ModelCapabilities[]).forEach(model => registry.registerModel(model));
    });

    it('should get models by provider', () => {
      const ollamaModels = registry.getModelsForProvider('ollama');
      expect(ollamaModels.length).toBeGreaterThan(0);
      expect(ollamaModels.every(m => m.provider === 'ollama')).toBe(true);
    });

    it('should filter free tier models', () => {
      const freeModels = registry.getAllModels().filter(m =>
        !m.pricing || (m.pricing.inputPer1M === 0 && m.pricing.outputPer1M === 0)
      );
      expect(freeModels.length).toBeGreaterThan(0);
      expect(freeModels.some(m => m.modelId.includes('free'))).toBe(true);
    });
  });

  describe('Task-Based Model Selection', () => {
    beforeEach(() => {
      (modelData as ModelCapabilities[]).forEach(model => registry.registerModel(model));
    });

    it('should select best model for simple test generation', () => {
      const modelId = registry.getBestModelForTask('test-generation', 'simple');
      expect(modelId).toBeDefined();

      const model = registry.getModel(modelId!);
      expect(model?.supportedTasks).toContain('test-generation');
    });

    it('should select best model for complex code review', () => {
      const modelId = registry.getBestModelForTask('code-review', 'very_complex');
      expect(modelId).toBeDefined();

      const model = registry.getModel(modelId!);
      expect(model?.supportedTasks).toContain('code-review');

      // Complex tasks should favor larger models
      const paramMatch = model?.parameters.match(/(\d+)/);
      const params = paramMatch ? parseInt(paramMatch[1]) : 0;
      expect(params).toBeGreaterThan(30);
    });

    it('should respect free tier constraint', () => {
      const modelId = registry.getBestModelForTask('test-generation', 'moderate', {
        preferFree: true
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);

      // Should be free or very low cost
      if (model?.pricing) {
        expect(model.pricing.inputPer1M).toBeLessThanOrEqual(0.2);
      }
    });

    it('should respect local deployment constraint', () => {
      const modelId = registry.getBestModelForTask('code-review', 'moderate', {
        requiresLocal: true
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);
      expect(model?.provider === 'ollama' || model?.availableOn.includes('local')).toBe(true);
    });

    it('should respect context window constraint', () => {
      const modelId = registry.getBestModelForTask('documentation', 'complex', {
        minContextWindow: 100000
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);
      expect(model?.contextWindow).toBeGreaterThanOrEqual(100000);
    });

    it('should respect maximum cost constraint', () => {
      const modelId = registry.getBestModelForTask('bug-detection', 'moderate', {
        maxCostPer1M: 1.0
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);

      if (model?.pricing) {
        const avgCost = (model.pricing.inputPer1M + model.pricing.outputPer1M) / 2;
        expect(avgCost).toBeLessThanOrEqual(1.0);
      }
    });

    it('should return undefined when no model matches constraints', () => {
      const modelId = registry.getBestModelForTask('test-generation', 'simple', {
        requiresLocal: true,
        minContextWindow: 500000, // Unrealistic
        maxCostPer1M: 0
      });

      expect(modelId).toBeUndefined();
    });
  });

  describe('Quality Rating Updates', () => {
    beforeEach(() => {
      (modelData as ModelCapabilities[]).forEach(model => registry.registerModel(model));
    });

    it('should update quality rating for a task', () => {
      const modelId = 'qwen2.5-coder:32b';
      const task = 'test-generation';

      const initialRating = registry.getModel(modelId)?.qualityRatings?.[task] ?? 0.5;

      registry.updateQualityRating(modelId, task, 0.9);

      const updatedRating = registry.getModel(modelId)?.qualityRatings?.[task];
      expect(updatedRating).toBeDefined();
      expect(updatedRating).not.toBe(initialRating);

      // Should be weighted average
      const expected = initialRating * 0.7 + 0.9 * 0.3;
      expect(updatedRating).toBeCloseTo(expected, 2);
    });

    it('should throw error for non-existent model', () => {
      expect(() => {
        registry.updateQualityRating('non-existent', 'test-generation', 0.8);
      }).toThrow('Model not found');
    });
  });

  describe('Model Benchmark Verification', () => {
    beforeEach(() => {
      (modelData as ModelCapabilities[]).forEach(model => registry.registerModel(model));
    });

    it('should have accurate benchmark data for top models', () => {
      // Verify Claude Opus 4 has best benchmarks
      const opus = registry.getModel('anthropic/claude-opus-4');
      expect(opus?.benchmarks?.humanEval).toBeGreaterThan(90);
      expect(opus?.benchmarks?.sweBench).toBeGreaterThan(70);

      // Verify Devstral has strong SWE-bench
      const devstral = registry.getModel('mistralai/devstral-2-123b');
      expect(devstral?.benchmarks?.sweBench).toBeGreaterThan(70);

      // Verify free tier models have competitive benchmarks
      const llamaFree = registry.getModel('llama-3.3-70b-versatile');
      expect(llamaFree?.benchmarks?.humanEval).toBeGreaterThan(70);
    });

    it('should have pricing data for paid models', () => {
      const opus = registry.getModel('anthropic/claude-opus-4');
      expect(opus?.pricing).toBeDefined();
      expect(opus?.pricing?.inputPer1M).toBeGreaterThan(0);

      const sonnet = registry.getModel('anthropic/claude-sonnet-4');
      expect(sonnet?.pricing).toBeDefined();
      expect(sonnet?.pricing?.inputPer1M).toBeLessThan(opus?.pricing?.inputPer1M!);
    });

    it('should have zero pricing for free tier models', () => {
      const freeModels = [
        'llama-3.3-70b-versatile',
        'mistralai/devstral-2512:free'
      ];

      freeModels.forEach(modelId => {
        const model = registry.getModel(modelId);
        expect(model?.pricing?.inputPer1M).toBe(0);
        expect(model?.pricing?.outputPer1M).toBe(0);
      });
    });
  });

  describe('Task Support Coverage', () => {
    beforeEach(() => {
      (modelData as ModelCapabilities[]).forEach(model => registry.registerModel(model));
    });

    it('should have models for all task types', () => {
      const taskTypes = [
        'test-generation',
        'coverage-analysis',
        'code-review',
        'bug-detection',
        'documentation',
        'refactoring',
        'performance-testing',
        'security-scanning'
      ];

      taskTypes.forEach(task => {
        const models = registry.getAllModels().filter(m =>
          m.supportedTasks.includes(task as any)
        );
        expect(models.length).toBeGreaterThan(0);
      });
    });

    it('should have at least one free model for each task type', () => {
      const taskTypes = [
        'test-generation',
        'code-review',
        'bug-detection',
        'refactoring'
      ];

      taskTypes.forEach(task => {
        const freeModels = registry.getAllModels().filter(m =>
          m.supportedTasks.includes(task as any) &&
          (!m.pricing || (m.pricing.inputPer1M === 0 && m.pricing.outputPer1M === 0))
        );
        expect(freeModels.length).toBeGreaterThan(0);
      });
    });
  });
});
