/**
 * Unit Tests for Cost Optimization Strategies
 *
 * Tests all optimization utilities:
 * - PromptCompressor (whitespace, abbreviations, token optimization)
 * - RequestBatcher (grouping, savings estimation)
 * - SmartCacheStrategy (task-specific TTLs, key generation)
 * - ModelRightSizer (budget-aware downgrading)
 * - CostOptimizationManager (orchestration)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  PromptCompressor,
  RequestBatcher,
  SmartCacheStrategy,
  ModelRightSizer,
  CostOptimizationManager,
  CompressionResult,
  RequestGroup,
  CacheStrategy,
  ModelRightSizingResult
} from '../../../src/providers/CostOptimizationStrategies';
import { LLMCompletionOptions, LLMCompletionResponse } from '../../../src/providers/ILLMProvider';
import { TaskComplexity, BudgetStatus } from '../../../src/providers/HybridRouter';
import { TaskType } from '../../../src/routing/ModelCapabilityRegistry';

describe('PromptCompressor', () => {
  let compressor: PromptCompressor;

  beforeEach(() => {
    compressor = new PromptCompressor({
      debug: false,
      enableCompression: true,
      minCompressionRatio: 0.05
    });
  });

  describe('compressWhitespace', () => {
    it('should remove redundant spaces', () => {
      const input = 'This  has   multiple    spaces';
      const result = compressor.compressWhitespace(input);
      expect(result).toBe('This has multiple spaces');
    });

    it('should preserve single newlines but compress multiple', () => {
      const input = 'Line 1\n\n\n\nLine 2\n\nLine 3';
      const result = compressor.compressWhitespace(input);
      expect(result).toBe('Line 1\n\nLine 2\n\nLine 3');
    });

    it('should trim lines', () => {
      const input = '  Line 1  \n  Line 2  ';
      const result = compressor.compressWhitespace(input);
      expect(result).toBe('Line 1\nLine 2');
    });

    it('should handle empty string', () => {
      const result = compressor.compressWhitespace('');
      expect(result).toBe('');
    });
  });

  describe('abbreviatePatterns', () => {
    it('should abbreviate function to fn', () => {
      const input = 'This function does something';
      const result = compressor.abbreviatePatterns(input);
      expect(result).toContain('fn');
      expect(result).not.toContain('function');
    });

    it('should abbreviate multiple patterns', () => {
      const input = 'The application uses a database and repository';
      const result = compressor.abbreviatePatterns(input);
      expect(result).toContain('app');
      expect(result).toContain('db');
      expect(result).toContain('repo');
    });

    it('should handle case insensitivity', () => {
      const input = 'Function and FUNCTION and function';
      const result = compressor.abbreviatePatterns(input);
      const matches = result.match(/fn/gi);
      expect(matches).toHaveLength(3);
    });

    it('should abbreviate test-related terms', () => {
      const input = 'This test case is a unit test';
      const result = compressor.abbreviatePatterns(input);
      expect(result).toContain('test');
      expect(result).toContain('unit');
      expect(result).not.toContain('test case');
    });
  });

  describe('optimizeTokenUsage', () => {
    it('should remove filler words', () => {
      const input = 'This is very really actually just basically simple';
      const result = compressor.optimizeTokenUsage(input);
      expect(result).not.toContain('very');
      expect(result).not.toContain('really');
      expect(result).not.toContain('actually');
      expect(result).not.toContain('just');
      expect(result).not.toContain('basically');
    });

    it('should simplify verbose phrases', () => {
      const input = 'In order to proceed, due to the fact that we need it';
      const result = compressor.optimizeTokenUsage(input);
      expect(result).toContain('to proceed');
      expect(result).toContain('because');
    });

    it('should convert "prior to" to "before"', () => {
      const input = 'Prior to running tests';
      const result = compressor.optimizeTokenUsage(input);
      expect(result).toContain('before');
    });
  });

  describe('compress', () => {
    it('should apply all compression techniques', () => {
      const input = 'This  is   a  very  simple  function  that  does  something';
      const result = compressor.compress(input);

      expect(result.compressed).not.toBe(input);
      expect(result.tokensSaved).toBeGreaterThan(0);
      expect(result.ratio).toBeGreaterThan(0);
      expect(result.techniques.length).toBeGreaterThan(0);
      expect(result.original).toBe(input);
    });

    it('should calculate token savings correctly', () => {
      const input = 'a'.repeat(1000); // 1000 chars ≈ 250 tokens
      const result = compressor.compress(input);

      const originalTokens = Math.ceil(input.length / 4);
      const compressedTokens = Math.ceil(result.compressed.length / 4);
      expect(result.tokensSaved).toBe(originalTokens - compressedTokens);
    });

    it('should not compress if below minimum ratio', () => {
      const compressorStrict = new PromptCompressor({
        minCompressionRatio: 0.9 // Very high threshold
      });

      const input = 'Short text';
      const result = compressorStrict.compress(input);

      expect(result.compressed).toBe(input);
      expect(result.tokensSaved).toBe(0);
      expect(result.ratio).toBe(0);
    });

    it('should preserve original in result', () => {
      const input = 'Test input';
      const result = compressor.compress(input);
      expect(result.original).toBe(input);
    });
  });

  describe('compressOptions', () => {
    it('should compress message content', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'This  is  a  very  simple  function  test'
          }
        ]
      };

      const result = compressor.compressOptions(options);

      expect(result.options.messages[0].content).not.toBe(options.messages[0].content);
      expect(result.result.tokensSaved).toBeGreaterThan(0);
    });

    it('should compress array content blocks', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'This  is  very  verbose  text' },
              { type: 'text', text: 'Another  very  verbose  section' }
            ]
          }
        ]
      };

      const result = compressor.compressOptions(options);

      const content = result.options.messages[0].content as Array<{ type: string; text?: string }>;
      expect(content[0].text).not.toContain('  '); // Double spaces removed
      expect(result.result.tokensSaved).toBeGreaterThan(0);
    });

    it('should compress system prompts', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        system: [
          { type: 'text', text: 'This  is  a  very  detailed  system  prompt' }
        ],
        messages: [
          { role: 'user', content: 'Test' }
        ]
      };

      const result = compressor.compressOptions(options);

      expect(result.options.system?.[0].text).not.toContain('  ');
    });

    it('should preserve non-text content blocks', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Test' },
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

      const result = compressor.compressOptions(options);
      const content = result.options.messages[0].content as Array<any>;
      expect(content[1].type).toBe('image');
      expect(content[1].source?.data).toBe('base64data');
    });
  });
});

describe('RequestBatcher', () => {
  let batcher: RequestBatcher;

  beforeEach(() => {
    batcher = new RequestBatcher({
      enableBatching: true,
      maxBatchSize: 5
    });
  });

  describe('groupSimilarRequests', () => {
    it('should group similar requests', () => {
      const requests: LLMCompletionOptions[] = [
        {
          model: 'test-model',
          temperature: 0.7,
          maxTokens: 1000,
          messages: [{ role: 'user', content: 'Test 1' }]
        },
        {
          model: 'test-model',
          temperature: 0.7,
          maxTokens: 1000,
          messages: [{ role: 'user', content: 'Test 2' }]
        },
        {
          model: 'test-model',
          temperature: 0.7,
          maxTokens: 1000,
          messages: [{ role: 'user', content: 'Test 3' }]
        }
      ];

      const groups = batcher.groupSimilarRequests(requests);

      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].requests.length).toBe(3);
    });

    it('should not group requests with different models', () => {
      const requests: LLMCompletionOptions[] = [
        {
          model: 'model-a',
          messages: [{ role: 'user', content: 'Test 1' }]
        },
        {
          model: 'model-b',
          messages: [{ role: 'user', content: 'Test 2' }]
        }
      ];

      const groups = batcher.groupSimilarRequests(requests);

      // Should not create groups with only 1 request
      expect(groups.length).toBe(0);
    });

    it('should respect max batch size', () => {
      const requests: LLMCompletionOptions[] = Array(12).fill(null).map((_, i) => ({
        model: 'test-model',
        messages: [{ role: 'user', content: `Test ${i}` }]
      }));

      const groups = batcher.groupSimilarRequests(requests);

      groups.forEach(group => {
        expect(group.requests.length).toBeLessThanOrEqual(5);
      });
    });

    it('should not create groups with less than 2 requests', () => {
      const requests: LLMCompletionOptions[] = [
        {
          model: 'test-model',
          messages: [{ role: 'user', content: 'Single request' }]
        }
      ];

      const groups = batcher.groupSimilarRequests(requests);
      expect(groups.length).toBe(0);
    });

    it('should calculate group characteristics', () => {
      const requests: LLMCompletionOptions[] = [
        {
          model: 'test-model',
          messages: [{ role: 'user', content: '```\ncode block\n```' }]
        },
        {
          model: 'test-model',
          messages: [{ role: 'user', content: '```\nanother code\n```' }]
        }
      ];

      const groups = batcher.groupSimilarRequests(requests);

      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].characteristics.hasCode).toBe(true);
      expect(groups[0].characteristics.averageTokens).toBeGreaterThan(0);
    });
  });

  describe('estimateBatchSavings', () => {
    it('should estimate zero savings for single request', () => {
      const requests: LLMCompletionOptions[] = [
        { model: 'test', messages: [{ role: 'user', content: 'Test' }] }
      ];

      const savings = batcher.estimateBatchSavings(requests);
      expect(savings).toBe(0);
    });

    it('should estimate savings for multiple requests', () => {
      const requests: LLMCompletionOptions[] = [
        { model: 'test', messages: [{ role: 'user', content: 'Test 1' }] },
        { model: 'test', messages: [{ role: 'user', content: 'Test 2' }] },
        { model: 'test', messages: [{ role: 'user', content: 'Test 3' }] }
      ];

      const savings = batcher.estimateBatchSavings(requests);
      expect(savings).toBeGreaterThan(0);
    });

    it('should scale savings with batch size', () => {
      const small = [
        { model: 'test', messages: [{ role: 'user', content: 'Test' }] },
        { model: 'test', messages: [{ role: 'user', content: 'Test' }] }
      ];

      const large = [...small, ...small, ...small];

      const smallSavings = batcher.estimateBatchSavings(small);
      const largeSavings = batcher.estimateBatchSavings(large);

      expect(largeSavings).toBeGreaterThan(smallSavings);
    });
  });
});

describe('SmartCacheStrategy', () => {
  let strategy: SmartCacheStrategy;

  beforeEach(() => {
    strategy = new SmartCacheStrategy({
      enableSmartCaching: true,
      defaultCacheTTL: 3600
    });
  });

  describe('getCacheStrategy', () => {
    it('should return strategy for test-generation', () => {
      const cacheStrategy = strategy.getCacheStrategy('test-generation');

      expect(cacheStrategy.taskType).toBe('test-generation');
      expect(cacheStrategy.ttlSeconds).toBe(1800); // 30 minutes
      expect(cacheStrategy.aggressive).toBe(false);
    });

    it('should return strategy for documentation (aggressive)', () => {
      const cacheStrategy = strategy.getCacheStrategy('documentation');

      expect(cacheStrategy.aggressive).toBe(true);
      expect(cacheStrategy.ttlSeconds).toBe(14400); // 4 hours
    });

    it('should return default strategy for unknown task type', () => {
      const cacheStrategy = strategy.getCacheStrategy('unknown' as TaskType);

      expect(cacheStrategy.ttlSeconds).toBe(3600);
      expect(cacheStrategy.aggressive).toBe(false);
    });

    it('should have appropriate TTLs for different task types', () => {
      const bugDetection = strategy.getCacheStrategy('bug-detection');
      const coverage = strategy.getCacheStrategy('coverage-analysis');

      // Bug detection should have shorter TTL than coverage
      expect(bugDetection.ttlSeconds).toBeLessThan(coverage.ttlSeconds);
    });
  });

  describe('shouldCache', () => {
    it('should cache successful responses', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test query' }]
      };

      const response: LLMCompletionResponse = {
        id: 'test-id',
        content: [{ type: 'text', text: 'This is a valid response with enough content to be cached' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'test-model',
        stop_reason: 'end_turn'
      };

      const shouldCache = strategy.shouldCache(options, response);
      expect(shouldCache).toBe(true);
    });

    it('should not cache streaming responses', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        stream: true,
        messages: [{ role: 'user', content: 'Test' }]
      };

      const response: LLMCompletionResponse = {
        id: 'test-id',
        content: [{ type: 'text', text: 'Response text that is long enough' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'test-model',
        stop_reason: 'end_turn'
      };

      const shouldCache = strategy.shouldCache(options, response);
      expect(shouldCache).toBe(false);
    });

    it('should not cache very short responses', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }]
      };

      const response: LLMCompletionResponse = {
        id: 'test-id',
        content: [{ type: 'text', text: 'Short' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'test-model',
        stop_reason: 'end_turn'
      };

      const shouldCache = strategy.shouldCache(options, response);
      expect(shouldCache).toBe(false);
    });

    it('should not cache very expensive responses', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }]
      };

      const response: LLMCompletionResponse = {
        id: 'test-id',
        content: [{ type: 'text', text: 'Response ' + 'x'.repeat(100) }],
        usage: { input_tokens: 5000, output_tokens: 6000 }, // > 10k total
        model: 'test-model',
        stop_reason: 'end_turn'
      };

      const shouldCache = strategy.shouldCache(options, response);
      expect(shouldCache).toBe(false);
    });

    it('should not cache error responses', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }]
      };

      const response: LLMCompletionResponse = {
        id: 'test-id',
        content: [{ type: 'text', text: 'Response text that is long enough' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'test-model',
        stop_reason: 'max_tokens'
      };

      const shouldCache = strategy.shouldCache(options, response);
      expect(shouldCache).toBe(false);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys for same content', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        temperature: 0.7,
        messages: [{ role: 'user', content: 'Same query' }]
      };

      const key1 = strategy.generateCacheKey(options);
      const key2 = strategy.generateCacheKey(options);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different content', () => {
      const options1: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Query 1' }]
      };

      const options2: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Query 2' }]
      };

      const key1 = strategy.generateCacheKey(options1);
      const key2 = strategy.generateCacheKey(options2);

      expect(key1).not.toBe(key2);
    });

    it('should include model in cache key', () => {
      const options1: LLMCompletionOptions = {
        model: 'model-a',
        messages: [{ role: 'user', content: 'Query' }]
      };

      const options2: LLMCompletionOptions = {
        model: 'model-b',
        messages: [{ role: 'user', content: 'Query' }]
      };

      const key1 = strategy.generateCacheKey(options1);
      const key2 = strategy.generateCacheKey(options2);

      expect(key1).not.toBe(key2);
    });

    it('should use task-specific key generator when provided', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: '```\ncode\n```' }]
      };

      const key = strategy.generateCacheKey(options, 'test-generation');
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    });
  });
});

describe('ModelRightSizer', () => {
  let rightSizer: ModelRightSizer;

  beforeEach(() => {
    rightSizer = new ModelRightSizer();
  });

  describe('shouldDowngradeModel', () => {
    it('should not downgrade when budget is healthy', () => {
      const budgetStatus: BudgetStatus = {
        dailySpent: 5,
        dailyRemaining: 95,
        monthlySpent: 50,
        monthlyRemaining: 950,
        utilizationPercentage: 5,
        isOverBudget: false,
        alertTriggered: false
      };

      const result = rightSizer.shouldDowngradeModel(
        TaskComplexity.MODERATE,
        budgetStatus
      );

      expect(result.shouldDowngrade).toBe(false);
      expect(result.reason).toContain('Budget healthy');
    });

    it('should downgrade when over budget', () => {
      const budgetStatus: BudgetStatus = {
        dailySpent: 110,
        dailyRemaining: -10,
        monthlySpent: 1100,
        monthlyRemaining: -100,
        utilizationPercentage: 110,
        isOverBudget: true,
        alertTriggered: true
      };

      const result = rightSizer.shouldDowngradeModel(
        TaskComplexity.SIMPLE,
        budgetStatus
      );

      expect(result.shouldDowngrade).toBe(true);
      expect(result.recommendedModel).toBeDefined();
      expect(result.estimatedSavings).toBeGreaterThan(0);
    });

    it('should not downgrade very complex tasks', () => {
      const budgetStatus: BudgetStatus = {
        dailySpent: 110,
        dailyRemaining: -10,
        monthlySpent: 1100,
        monthlyRemaining: -100,
        utilizationPercentage: 110,
        isOverBudget: true,
        alertTriggered: true
      };

      const result = rightSizer.shouldDowngradeModel(
        TaskComplexity.VERY_COMPLEX,
        budgetStatus
      );

      expect(result.shouldDowngrade).toBe(false);
      expect(result.reason).toContain('complexity requires');
    });

    it('should downgrade to appropriate tier based on complexity', () => {
      const budgetStatus: BudgetStatus = {
        dailySpent: 110,
        dailyRemaining: -10,
        monthlySpent: 1100,
        monthlyRemaining: -100,
        utilizationPercentage: 110,
        isOverBudget: true,
        alertTriggered: true
      };

      const simpleResult = rightSizer.shouldDowngradeModel(
        TaskComplexity.SIMPLE,
        budgetStatus
      );

      const complexResult = rightSizer.shouldDowngradeModel(
        TaskComplexity.COMPLEX,
        budgetStatus
      );

      expect(simpleResult.recommendedModel).toContain('haiku');
      expect(complexResult.recommendedModel).toContain('sonnet');
    });

    it('should provide quality impact assessment', () => {
      const budgetStatus: BudgetStatus = {
        dailySpent: 110,
        dailyRemaining: -10,
        monthlySpent: 1100,
        monthlyRemaining: -100,
        utilizationPercentage: 110,
        isOverBudget: true,
        alertTriggered: true
      };

      const result = rightSizer.shouldDowngradeModel(
        TaskComplexity.SIMPLE,
        budgetStatus
      );

      expect(result.qualityImpact).toBeGreaterThan(0);
      expect(result.qualityImpact).toBeLessThanOrEqual(1);
    });

    it('should downgrade at high budget utilization', () => {
      const budgetStatus: BudgetStatus = {
        dailySpent: 85,
        dailyRemaining: 15,
        monthlySpent: 850,
        monthlyRemaining: 150,
        utilizationPercentage: 85,
        isOverBudget: false,
        alertTriggered: true
      };

      const result = rightSizer.shouldDowngradeModel(
        TaskComplexity.SIMPLE,
        budgetStatus
      );

      expect(result.shouldDowngrade).toBe(true);
    });

    it('should include meaningful reason in result', () => {
      const budgetStatus: BudgetStatus = {
        dailySpent: 110,
        dailyRemaining: -10,
        monthlySpent: 1100,
        monthlyRemaining: -100,
        utilizationPercentage: 110,
        isOverBudget: true,
        alertTriggered: true
      };

      const result = rightSizer.shouldDowngradeModel(
        TaskComplexity.MODERATE,
        budgetStatus
      );

      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(10);
    });
  });
});

describe('CostOptimizationManager', () => {
  let manager: CostOptimizationManager;

  beforeEach(() => {
    manager = new CostOptimizationManager({
      debug: false,
      enableCompression: true,
      enableBatching: true,
      enableSmartCaching: true
    });
  });

  it('should provide access to all optimization components', () => {
    expect(manager.getCompressor()).toBeDefined();
    expect(manager.getBatcher()).toBeDefined();
    expect(manager.getCacheStrategy()).toBeDefined();
    expect(manager.getRightSizer()).toBeDefined();
  });

  describe('optimizeRequest', () => {
    it('should apply compression optimization', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [
          { role: 'user', content: 'This  is  a  very  verbose  function  call' }
        ]
      };

      const result = manager.optimizeRequest(options);

      expect(result.compressionResult).toBeDefined();
      expect(result.compressionResult!.tokensSaved).toBeGreaterThan(0);
      expect(result.estimatedSavings).toBeGreaterThan(0);
    });

    it('should apply model downgrade when budget pressured', () => {
      const options: LLMCompletionOptions = {
        model: 'claude-opus-4',
        messages: [{ role: 'user', content: 'Simple query' }]
      };

      const budgetStatus: BudgetStatus = {
        dailySpent: 110,
        dailyRemaining: -10,
        monthlySpent: 1100,
        monthlyRemaining: -100,
        utilizationPercentage: 110,
        isOverBudget: true,
        alertTriggered: true
      };

      const result = manager.optimizeRequest(options, {
        complexity: TaskComplexity.SIMPLE,
        budgetStatus
      });

      expect(result.modelDowngrade).toBeDefined();
      expect(result.modelDowngrade!.shouldDowngrade).toBe(true);
      expect(result.optimizedOptions.model).not.toBe(options.model);
    });

    it('should combine compression and downgrade savings', () => {
      const options: LLMCompletionOptions = {
        model: 'claude-opus-4',
        messages: [
          { role: 'user', content: 'This  is  a  very  verbose  simple  query' }
        ]
      };

      const budgetStatus: BudgetStatus = {
        dailySpent: 110,
        dailyRemaining: -10,
        monthlySpent: 1100,
        monthlyRemaining: -100,
        utilizationPercentage: 110,
        isOverBudget: true,
        alertTriggered: true
      };

      const result = manager.optimizeRequest(options, {
        complexity: TaskComplexity.SIMPLE,
        budgetStatus
      });

      expect(result.estimatedSavings).toBeGreaterThan(0);
      expect(result.compressionResult).toBeDefined();
      expect(result.modelDowngrade).toBeDefined();
    });

    it('should preserve original options structure', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        temperature: 0.8,
        maxTokens: 2000,
        messages: [{ role: 'user', content: 'Test' }],
        metadata: { custom: 'field' }
      };

      const result = manager.optimizeRequest(options);

      expect(result.optimizedOptions.temperature).toBe(0.8);
      expect(result.optimizedOptions.maxTokens).toBe(2000);
      expect(result.optimizedOptions.metadata).toEqual({ custom: 'field' });
    });

    it('should handle requests without context gracefully', () => {
      const options: LLMCompletionOptions = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test  query' }]
      };

      const result = manager.optimizeRequest(options);

      expect(result.optimizedOptions).toBeDefined();
      expect(result.compressionResult).toBeDefined();
      expect(result.modelDowngrade).toBeUndefined();
    });
  });
});
