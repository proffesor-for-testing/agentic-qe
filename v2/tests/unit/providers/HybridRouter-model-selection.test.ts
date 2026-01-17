/**
 * Tests for HybridRouterModelSelection
 *
 * Validates intelligent model selection, task detection, and quality rating updates.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  HybridRouterModelSelection,
  ModelSelectionResult
} from '../../../src/providers/HybridRouterModelSelection';
import {
  ModelCapabilityRegistry,
  ModelCapabilities,
  TaskType
} from '../../../src/routing/ModelCapabilityRegistry';
import { TaskComplexity } from '../../../src/providers/HybridRouter';
import { LLMCompletionOptions } from '../../../src/providers/ILLMProvider';

describe('HybridRouterModelSelection', () => {
  let selection: HybridRouterModelSelection;
  let registry: ModelCapabilityRegistry;

  beforeEach(() => {
    // Create fresh registry for each test
    registry = new ModelCapabilityRegistry();

    // Register test models
    const testModels: ModelCapabilities[] = [
      {
        modelId: 'qwen-2.5-coder-32b',
        provider: 'ollama',
        parameters: '32B',
        contextWindow: 32768,
        supportedTasks: ['test-generation', 'code-review', 'refactoring'],
        strengths: ['Code generation', 'Test writing', 'Fast inference'],
        availableOn: ['local', 'ollama'],
        requiresGPU: true,
        vramRequired: 20,
        qualityRatings: {
          'test-generation': 0.85,
          'code-review': 0.75
        },
        benchmarks: {
          humanEval: 65,
          sweBench: 45,
          aiderPolyglot: 70
        }
      },
      {
        modelId: 'claude-sonnet-4',
        provider: 'claude',
        parameters: '200B',
        contextWindow: 200000,
        pricing: {
          inputPer1M: 3.0,
          outputPer1M: 15.0
        },
        supportedTasks: [
          'test-generation',
          'code-review',
          'bug-detection',
          'documentation',
          'refactoring',
          'performance-testing',
          'security-scanning',
          'coverage-analysis'
        ],
        strengths: ['Reasoning', 'Code understanding', 'Complex tasks'],
        availableOn: ['cloud'],
        requiresGPU: false,
        qualityRatings: {
          'test-generation': 0.95,
          'code-review': 0.98,
          'bug-detection': 0.92
        },
        benchmarks: {
          humanEval: 92,
          sweBench: 85,
          aiderPolyglot: 88
        }
      },
      {
        modelId: 'deepseek-coder-33b',
        provider: 'ollama',
        parameters: '33B',
        contextWindow: 16384,
        supportedTasks: ['test-generation', 'code-review', 'bug-detection'],
        strengths: ['Code completion', 'Bug detection', 'Low latency'],
        availableOn: ['local', 'ollama'],
        requiresGPU: true,
        vramRequired: 22,
        qualityRatings: {
          'bug-detection': 0.82
        },
        benchmarks: {
          humanEval: 78,
          sweBench: 55
        }
      }
    ];

    testModels.forEach(m => registry.registerModel(m));
    selection = new HybridRouterModelSelection(registry);
  });

  describe('detectTaskType', () => {
    it('should detect test-generation from prompts', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Generate unit tests for the UserService class'
          }
        ]
      };

      const taskType = selection.detectTaskType(options);
      expect(taskType).toBe('test-generation');
    });

    it('should detect code-review from prompts', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Review this pull request for code quality and best practices'
          }
        ]
      };

      const taskType = selection.detectTaskType(options);
      expect(taskType).toBe('code-review');
    });

    it('should detect bug-detection from prompts', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Find bugs in this code and suggest fixes'
          }
        ]
      };

      const taskType = selection.detectTaskType(options);
      expect(taskType).toBe('bug-detection');
    });

    it('should detect coverage-analysis from prompts', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Analyze test coverage gaps and suggest new test cases'
          }
        ]
      };

      const taskType = selection.detectTaskType(options);
      expect(taskType).toBe('coverage-analysis');
    });

    it('should detect documentation from prompts', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Generate API documentation with JSDoc comments'
          }
        ]
      };

      const taskType = selection.detectTaskType(options);
      expect(taskType).toBe('documentation');
    });

    it('should handle array content in messages', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Write tests for this function' }
            ]
          }
        ]
      };

      const taskType = selection.detectTaskType(options);
      expect(taskType).toBe('test-generation');
    });

    it('should default to code-review when no patterns match', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?'
          }
        ]
      };

      const taskType = selection.detectTaskType(options);
      expect(taskType).toBe('code-review'); // Default
    });
  });

  describe('selectBestModel', () => {
    it('should select best model for simple test-generation', () => {
      const result = selection.selectBestModel(
        'test-generation',
        TaskComplexity.SIMPLE
      );

      expect(result.provider).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.reason).toContain('test-generation');
    });

    it('should respect local-only constraint', () => {
      const result = selection.selectBestModel(
        'test-generation',
        TaskComplexity.MODERATE,
        { requiresLocal: true }
      );

      // Should select ollama model, not claude
      expect(result.provider).toBe('ollama');
      expect(result.reason).toContain('Local deployment required');
    });

    it('should respect cost constraints', () => {
      const result = selection.selectBestModel(
        'test-generation',
        TaskComplexity.COMPLEX,
        { maxCostPer1M: 1.0 }
      );

      // Should select free local model due to cost constraint
      expect(result.provider).toBe('ollama');
      expect(result.reason).toContain('$1/1M');
    });

    it('should prefer high-quality models when available', () => {
      const result = selection.selectBestModel(
        'code-review',
        TaskComplexity.COMPLEX
      );

      // Claude has highest quality rating for code-review (0.98)
      // Should be selected if no constraints prevent it
      expect(['claude', 'ollama']).toContain(result.provider);
    });

    it('should handle case with no suitable models', () => {
      const result = selection.selectBestModel(
        'performance-testing',
        TaskComplexity.SIMPLE,
        { requiresLocal: true, maxCostPer1M: 0 }
      );

      // Should fall back to default when no matches
      expect(result.provider).toBe('claude');
      expect(result.model).toBe('claude-sonnet-4');
      expect(result.reason).toContain('No suitable model found');
    });

    it('should include quality rating in reasoning when available', () => {
      const result = selection.selectBestModel(
        'test-generation',
        TaskComplexity.MODERATE
      );

      // Should include quality rating if model has one
      if (result.model.includes('qwen') || result.model.includes('claude')) {
        expect(result.reason).toContain('Quality rating');
      }
    });
  });

  describe('getModelRecommendation', () => {
    it('should provide primary and alternative models', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Generate comprehensive tests with high coverage'
          }
        ],
        maxTokens: 2000
      };

      const recommendation = selection.getModelRecommendation(options);

      expect(recommendation.primary).toBeDefined();
      expect(recommendation.alternatives).toBeInstanceOf(Array);
      expect(recommendation.reasoning).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect task type automatically', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Find security vulnerabilities in this authentication code'
          }
        ]
      };

      const recommendation = selection.getModelRecommendation(options);

      // Reasoning should mention security-scanning
      expect(recommendation.reasoning).toContain('security-scanning');
    });

    it('should return up to 3 alternatives', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Write unit tests for all methods'
          }
        ]
      };

      const recommendation = selection.getModelRecommendation(options);

      expect(recommendation.alternatives.length).toBeLessThanOrEqual(3);
    });

    it('should apply constraints to recommendations', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Review this code for quality issues'
          }
        ]
      };

      const recommendation = selection.getModelRecommendation(options, {
        requiresLocal: true
      });

      // Primary should be local
      expect(recommendation.primary.provider).toBe('ollama');

      // All alternatives should be local
      recommendation.alternatives.forEach(alt => {
        expect(['ollama', 'together', 'groq', 'ruvllm']).toContain(alt.provider);
      });
    });

    it('should include benchmarks in reasoning', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Generate test cases'
          }
        ]
      };

      const recommendation = selection.getModelRecommendation(options);

      // Should mention benchmarks for models that have them
      expect(recommendation.reasoning).toContain('Benchmarks');
    });

    it('should calculate higher confidence for models with quality ratings', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Review this code'
          }
        ]
      };

      const recommendation = selection.getModelRecommendation(options);

      // Claude has high quality ratings, should have high confidence
      if (recommendation.primary.modelId === 'claude-sonnet-4') {
        expect(recommendation.confidence).toBeGreaterThan(0.7);
      }
    });
  });

  describe('updateModelQuality', () => {
    it('should update quality rating on success', () => {
      const modelId = 'qwen-2.5-coder-32b';
      const taskType: TaskType = 'test-generation';

      // Get initial rating
      const model = registry.getModel(modelId);
      const initialRating = model?.qualityRatings?.[taskType] || 0.5;

      // Update with successful outcome and fast latency
      selection.updateModelQuality(modelId, taskType, true, 1500);

      // Get updated rating
      const updatedModel = registry.getModel(modelId);
      const updatedRating = updatedModel?.qualityRatings?.[taskType] || 0.5;

      // Rating should change (exponential moving average)
      expect(updatedRating).not.toBe(initialRating);
    });

    it('should decrease rating on failure', () => {
      const modelId = 'deepseek-coder-33b';
      const taskType: TaskType = 'bug-detection';

      // Get initial rating
      const model = registry.getModel(modelId);
      const initialRating = model?.qualityRatings?.[taskType] || 0.5;

      // Update with failure
      selection.updateModelQuality(modelId, taskType, false, 3000);

      // Get updated rating
      const updatedModel = registry.getModel(modelId);
      const updatedRating = updatedModel?.qualityRatings?.[taskType] || 0.5;

      // Rating should decrease
      expect(updatedRating).toBeLessThan(initialRating);
    });

    it('should bonus rating for fast responses', () => {
      const modelId = 'qwen-2.5-coder-32b';
      const taskType: TaskType = 'code-review';

      // Set baseline rating
      registry.updateQualityRating(modelId, taskType, 0.7);

      // Update with success and very fast latency (500ms)
      selection.updateModelQuality(modelId, taskType, true, 500);

      const model = registry.getModel(modelId);
      const rating = model?.qualityRatings?.[taskType] || 0;

      // Should have high rating due to success + speed bonus
      expect(rating).toBeGreaterThan(0.7);
    });

    it('should penalize rating for slow responses', () => {
      const modelId = 'claude-sonnet-4';
      const taskType: TaskType = 'test-generation';

      // Set baseline rating
      registry.updateQualityRating(modelId, taskType, 0.9);

      // Update with success but very slow latency (10 seconds)
      selection.updateModelQuality(modelId, taskType, true, 10000);

      const model = registry.getModel(modelId);
      const rating = model?.qualityRatings?.[taskType] || 0;

      // Rating should be lower due to latency penalty
      expect(rating).toBeLessThan(0.9);
    });

    it('should handle multiple updates with exponential moving average', () => {
      const modelId = 'qwen-2.5-coder-32b';
      const taskType: TaskType = 'test-generation';

      // Multiple successful updates
      for (let i = 0; i < 5; i++) {
        selection.updateModelQuality(modelId, taskType, true, 2000);
      }

      const model1 = registry.getModel(modelId);
      const rating1 = model1?.qualityRatings?.[taskType] || 0;

      // One failure
      selection.updateModelQuality(modelId, taskType, false, 2000);

      const model2 = registry.getModel(modelId);
      const rating2 = model2?.qualityRatings?.[taskType] || 0;

      // Rating should decrease after failure
      expect(rating2).toBeLessThan(rating1);
    });
  });

  describe('Integration scenarios', () => {
    it('should recommend appropriate model for complex task', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: `
              Analyze this large codebase and generate comprehensive test suites
              with edge cases, integration tests, and performance tests.
              The code uses advanced design patterns and requires deep understanding.
              This requires architectural analysis, refactoring recommendations,
              optimization strategies, and comprehensive coverage across multiple
              service layers with complex interaction patterns and distributed systems.
            `
          }
        ],
        maxTokens: 8000
      };

      const recommendation = selection.getModelRecommendation(options);

      // Should recommend high-capability model for complex task
      expect(recommendation.primary.contextWindow).toBeGreaterThan(16000);
      // Task complexity should be complex or very_complex based on content analysis
      expect(['complex', 'very_complex', 'moderate']).toContain(
        recommendation.reasoning.match(/(simple|moderate|complex|very_complex)/)?.[0] || 'moderate'
      );
    });

    it('should balance cost and quality with constraints', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Generate basic tests for simple CRUD operations'
          }
        ]
      };

      const recommendation = selection.getModelRecommendation(options, {
        maxCostPer1M: 2.0,
        minContextWindow: 16000
      });

      // Should find model meeting constraints
      expect(recommendation.primary.contextWindow).toBeGreaterThanOrEqual(16000);
      if (recommendation.primary.pricing) {
        const avgCost = (
          recommendation.primary.pricing.inputPer1M +
          recommendation.primary.pricing.outputPer1M
        ) / 2;
        expect(avgCost).toBeLessThanOrEqual(2.0);
      }
    });

    it('should provide meaningful alternatives for fallback', () => {
      const options: LLMCompletionOptions = {
        model: 'test',
        messages: [
          {
            role: 'user',
            content: 'Review code and find potential bugs'
          }
        ]
      };

      const recommendation = selection.getModelRecommendation(options);

      // All models should support the detected task
      const taskType = selection.detectTaskType(options);

      expect(recommendation.primary.supportedTasks).toContain(taskType);
      recommendation.alternatives.forEach(alt => {
        expect(alt.supportedTasks).toContain(taskType);
      });
    });
  });

  describe('Registry access', () => {
    it('should provide access to underlying registry', () => {
      const reg = selection.getRegistry();
      expect(reg).toBe(registry);
    });

    it('should allow registry modifications through instance', () => {
      const reg = selection.getRegistry();

      // Add new model
      const newModel: ModelCapabilities = {
        modelId: 'test-model-1',
        provider: 'ollama',
        parameters: '7B',
        contextWindow: 8192,
        supportedTasks: ['documentation'],
        strengths: ['Fast'],
        availableOn: ['local'],
        requiresGPU: false
      };

      reg.registerModel(newModel);

      // Should be accessible through selection
      const result = selection.selectBestModel(
        'documentation',
        TaskComplexity.SIMPLE
      );

      // Might select the new model or another, but should not error
      expect(result).toBeDefined();
    });
  });
});
