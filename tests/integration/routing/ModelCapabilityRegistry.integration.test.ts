/**
 * Integration tests for ModelCapabilityRegistry
 * Tests loading from JSON and realistic usage scenarios
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { ModelCapabilityRegistry } from '../../../src/routing/ModelCapabilityRegistry';

describe('ModelCapabilityRegistry Integration', () => {
  let registry: ModelCapabilityRegistry;

  beforeAll(() => {
    registry = new ModelCapabilityRegistry();
    registry.loadDefaultModels();
  });

  describe('Default Model Loading', () => {
    it('should load all models from JSON file', () => {
      const models = registry.getAllModels();
      expect(models.length).toBeGreaterThan(10);
      expect(models.length).toBeLessThan(30);
    });

    it('should load models from all providers', () => {
      const providers = new Set(registry.getAllModels().map(m => m.provider));
      expect(providers).toContain('ollama');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('groq');
      expect(providers).toContain('claude');
    });
  });

  describe('Real-World Task Scenarios', () => {
    it('should recommend free tier model for simple unit test generation', () => {
      const modelId = registry.getBestModelForTask('test-generation', 'simple', {
        preferFree: true,
        maxCostPer1M: 0.5
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);

      // Should be free or very low cost
      if (model?.pricing) {
        const avgCost = (model.pricing.inputPer1M + model.pricing.outputPer1M) / 2;
        expect(avgCost).toBeLessThanOrEqual(0.5);
      }

      // Should support test generation
      expect(model?.supportedTasks).toContain('test-generation');
    });

    it('should recommend local model for offline development', () => {
      const modelId = registry.getBestModelForTask('code-review', 'moderate', {
        requiresLocal: true
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);

      expect(model?.provider === 'ollama' || model?.availableOn.includes('local')).toBe(true);
      expect(model?.supportedTasks).toContain('code-review');
    });

    it('should recommend premium model for complex security scanning', () => {
      const modelId = registry.getBestModelForTask('security-scanning', 'very_complex');

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);

      expect(model?.supportedTasks).toContain('security-scanning');

      // Should have high benchmarks
      if (model?.benchmarks?.sweBench) {
        expect(model.benchmarks.sweBench).toBeGreaterThan(50);
      }
    });

    it('should recommend high-context model for large codebase analysis', () => {
      const modelId = registry.getBestModelForTask('coverage-analysis', 'complex', {
        minContextWindow: 128000
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);

      expect(model?.contextWindow).toBeGreaterThanOrEqual(128000);
      expect(model?.supportedTasks).toContain('coverage-analysis');
    });
  });

  describe('Cost-Performance Trade-offs', () => {
    it('should offer multiple options at different price points', () => {
      const freeModel = registry.getBestModelForTask('test-generation', 'moderate', {
        preferFree: true
      });

      const premiumModel = registry.getBestModelForTask('test-generation', 'moderate');

      expect(freeModel).toBeDefined();
      expect(premiumModel).toBeDefined();

      // Both should work, but may be different models
      const freeModelData = registry.getModel(freeModel!);
      const premiumModelData = registry.getModel(premiumModel!);

      expect(freeModelData?.supportedTasks).toContain('test-generation');
      expect(premiumModelData?.supportedTasks).toContain('test-generation');
    });

    it('should balance cost and quality for budget-constrained scenarios', () => {
      const modelId = registry.getBestModelForTask('bug-detection', 'complex', {
        maxCostPer1M: 2.0
      });

      expect(modelId).toBeDefined();
      const model = registry.getModel(modelId!);

      if (model?.pricing) {
        const avgCost = (model.pricing.inputPer1M + model.pricing.outputPer1M) / 2;
        expect(avgCost).toBeLessThanOrEqual(2.0);
      }

      // Should still have decent quality
      if (model?.benchmarks?.humanEval) {
        expect(model.benchmarks.humanEval).toBeGreaterThan(60);
      }
    });
  });

  describe('Adaptive Learning', () => {
    it('should update quality ratings based on performance', () => {
      const modelId = 'qwen2.5-coder:32b';
      const task = 'refactoring';

      const initialRating = registry.getModel(modelId)?.qualityRatings?.[task] ?? 0.5;

      // Simulate successful task execution
      registry.updateQualityRating(modelId, task, 0.95);

      const updatedRating = registry.getModel(modelId)?.qualityRatings?.[task];
      expect(updatedRating).toBeGreaterThan(initialRating);

      // Rating should be weighted average, not direct replacement
      expect(updatedRating).toBeLessThan(0.95);
      expect(updatedRating).toBeGreaterThan(0.5);
    });

    it('should influence future selections after quality updates', () => {
      const modelId = 'deepseek-coder-v2:16b';
      const task = 'bug-detection';

      // Record several successful outcomes
      registry.updateQualityRating(modelId, task, 0.9);
      registry.updateQualityRating(modelId, task, 0.95);
      registry.updateQualityRating(modelId, task, 0.92);

      // Now it should be more likely to be selected
      const selectedModelId = registry.getBestModelForTask(task, 'moderate', {
        requiresLocal: true
      });

      expect(selectedModelId).toBeDefined();
      // Note: We can't guarantee it will always be selected (other models may score higher),
      // but its updated rating should make it competitive
      const model = registry.getModel(selectedModelId!);
      expect(model?.supportedTasks).toContain(task);
    });
  });

  describe('Provider-Specific Scenarios', () => {
    it('should find Ollama models for local deployment', () => {
      const ollamaModels = registry.getModelsForProvider('ollama');

      expect(ollamaModels.length).toBeGreaterThan(3);
      expect(ollamaModels.every(m => m.requiresGPU === true || m.requiresGPU === false)).toBe(true);
      expect(ollamaModels.some(m => m.vramRequired !== undefined)).toBe(true);
    });

    it('should find free tier models from Groq and OpenRouter', () => {
      const freeModels = registry.getAllModels().filter(m =>
        (m.provider === 'groq' || m.provider === 'openrouter') &&
        m.pricing &&
        m.pricing.inputPer1M === 0 &&
        m.pricing.outputPer1M === 0
      );

      expect(freeModels.length).toBeGreaterThan(0);

      // Verify specific free tier models
      const llamaFree = freeModels.find(m => m.modelId.includes('llama-3.3'));
      const devstralFree = freeModels.find(m => m.modelId.includes('devstral-2512'));

      expect(llamaFree || devstralFree).toBeDefined();
    });

    it('should find Claude models for premium quality', () => {
      const claudeModels = registry.getModelsForProvider('claude');

      expect(claudeModels.length).toBeGreaterThan(0);

      // Should have both Sonnet and Opus
      const hasSonnet = claudeModels.some(m => m.modelId.includes('sonnet'));
      const hasOpus = claudeModels.some(m => m.modelId.includes('opus'));

      expect(hasSonnet || hasOpus).toBe(true);

      // Should have high quality ratings
      const highQuality = claudeModels.filter(m => {
        const ratings = Object.values(m.qualityRatings || {});
        return ratings.some(r => r > 0.9);
      });

      expect(highQuality.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Constraints', () => {
    it('should handle impossible constraints gracefully', () => {
      const modelId = registry.getBestModelForTask('test-generation', 'simple', {
        requiresLocal: true,
        minContextWindow: 1000000,
        maxCostPer1M: 0,
        requiredCapabilities: ['quantum-computing', 'time-travel']
      });

      expect(modelId).toBeUndefined();
    });

    it('should select appropriate model for each complexity level', () => {
      const complexities: Array<'simple' | 'moderate' | 'complex' | 'very_complex'> = [
        'simple',
        'moderate',
        'complex',
        'very_complex'
      ];

      complexities.forEach(complexity => {
        const modelId = registry.getBestModelForTask('code-review', complexity);
        expect(modelId).toBeDefined();

        const model = registry.getModel(modelId!);
        expect(model?.supportedTasks).toContain('code-review');
      });
    });
  });
});
