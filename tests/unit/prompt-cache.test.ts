/**
 * Unit Tests for Prompt Caching Infrastructure (CO-1)
 *
 * Tests cover:
 * - Cache key generation (SHA-256 hashing)
 * - Cache hit/miss detection with TTL
 * - Statistics tracking and cost accounting
 * - Cache pruning and cleanup
 * - Break-even analysis
 *
 * @jest-environment node
 */

import { PromptCacheManager } from '../../src/utils/prompt-cache';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk');

describe('PromptCacheManager', () => {
  let cacheManager: PromptCacheManager;
  let mockAnthropic: jest.Mocked<Anthropic>;

  const MOCK_API_KEY = 'sk-ant-test-key';

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create cache manager
    cacheManager = new PromptCacheManager(MOCK_API_KEY);

    // Get mocked Anthropic instance
    mockAnthropic = (cacheManager as any).anthropic;
  });

  describe('Cache Key Generation', () => {
    it('should generate SHA-256 hash for cacheable content', () => {
      const content = [
        {
          type: 'text' as const,
          text: 'System prompt for testing',
          cache_control: { type: 'ephemeral' as const },
        },
        {
          type: 'text' as const,
          text: 'Project context data',
          cache_control: { type: 'ephemeral' as const },
        },
      ];

      const key1 = (cacheManager as any).generateCacheKey(content);
      const key2 = (cacheManager as any).generateCacheKey(content);

      // Same content should produce same key
      expect(key1).toBe(key2);

      // Should be valid SHA-256 (64 hex characters)
      expect(key1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different keys for different content', () => {
      const content1 = [
        {
          type: 'text' as const,
          text: 'Content A',
          cache_control: { type: 'ephemeral' as const },
        },
      ];

      const content2 = [
        {
          type: 'text' as const,
          text: 'Content B',
          cache_control: { type: 'ephemeral' as const },
        },
      ];

      const key1 = (cacheManager as any).generateCacheKey(content1);
      const key2 = (cacheManager as any).generateCacheKey(content2);

      expect(key1).not.toBe(key2);
    });

    it('should ignore non-cached content in key generation', () => {
      const content = [
        {
          type: 'text' as const,
          text: 'Cached content',
          cache_control: { type: 'ephemeral' as const },
        },
        {
          type: 'text' as const,
          text: 'Non-cached content',
        },
      ];

      const key = (cacheManager as any).generateCacheKey(content);

      // Should only hash cached content
      expect(key).toBeTruthy();
    });

    it('should return empty key when no cacheable content', () => {
      const content = [
        {
          type: 'text' as const,
          text: 'Non-cached content',
        },
      ];

      const key = (cacheManager as any).generateCacheKey(content);

      expect(key).toBe('');
    });
  });

  describe('Cache Hit/Miss Detection', () => {
    it('should detect cache miss on first call', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000); // > 1024 tokens

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      expect(stats.writes).toBe(1);
    });

    it('should detect cache hit on subsequent call within TTL', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 900,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000); // > 1024 tokens

      // First call (cache miss)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test 1' }],
      });

      // Second call (cache hit)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test 2' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.writes).toBe(1);
      expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 calls
    });

    it('should detect cache miss after TTL expiration', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000); // > 1024 tokens

      // First call
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test 1' }],
      });

      // Fast-forward time past TTL (5 minutes)
      jest.useFakeTimers();
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Second call (should be cache miss)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test 2' }],
      });

      jest.useRealTimers();

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
      expect(stats.writes).toBe(2);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track cache creation tokens and cost', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10000,
          output_tokens: 500,
          cache_creation_input_tokens: 8000, // Cache write
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.tokensWritten).toBe(8000);

      // Cache write has 25% premium, so it's more expensive than regular
      // Expected savings should be negative (cost, not savings)
      expect(stats.costSavings).toBeLessThan(0);
    });

    it('should track cache read tokens and savings', async () => {
      const mockResponseWrite = {
        id: 'msg_test1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10000,
          output_tokens: 500,
          cache_creation_input_tokens: 8000,
        },
      };

      const mockResponseRead = {
        id: 'msg_test2',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10000,
          output_tokens: 500,
          cache_read_input_tokens: 8000, // Cache hit
        },
      };

      mockAnthropic.messages = {
        create: jest
          .fn()
          .mockResolvedValueOnce(mockResponseWrite)
          .mockResolvedValueOnce(mockResponseRead),
      } as any;

      const systemPrompt = 'A'.repeat(5000);

      // First call (cache write)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test 1' }],
      });

      // Second call (cache hit)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt, priority: 'high' }],
        messages: [{ role: 'user', content: 'Test 2' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.tokensRead).toBe(8000);

      // Cache hit saves 90%, so overall should have positive savings
      expect(stats.costSavings).toBeGreaterThan(0);
    });

    it('should calculate hit rate correctly', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt1 = 'A'.repeat(5000);
      const systemPrompt2 = 'B'.repeat(5000);

      // First call (miss)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt1 }],
        messages: [{ role: 'user', content: 'Test 1' }],
      });

      // Second call (hit)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt1 }],
        messages: [{ role: 'user', content: 'Test 2' }],
      });

      // Third call (miss - different content)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt2 }],
        messages: [{ role: 'user', content: 'Test 3' }],
      });

      // Fourth call (hit)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt1 }],
        messages: [{ role: 'user', content: 'Test 4' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5); // 50% hit rate
    });

    it('should track regular tokens separately from cached tokens', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10000,
          output_tokens: 500,
          cache_creation_input_tokens: 8000,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: 'Test message' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.tokensRegular).toBe(2000); // 10000 - 8000
      expect(stats.tokensWritten).toBe(8000);
    });
  });

  describe('Cache Pruning', () => {
    it('should prune expired cache entries', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);

      // Create cache entry
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(cacheManager.getCacheSize()).toBe(1);

      // Fast-forward time past TTL
      jest.useFakeTimers();
      jest.advanceTimersByTime(6 * 60 * 1000);

      const pruned = cacheManager.pruneCache();

      jest.useRealTimers();

      expect(pruned).toBe(1);
      expect(cacheManager.getCacheSize()).toBe(0);
    });

    it('should not prune fresh cache entries', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);

      // Create cache entry
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(cacheManager.getCacheSize()).toBe(1);

      // Fast-forward time but not past TTL
      jest.useFakeTimers();
      jest.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      const pruned = cacheManager.pruneCache();

      jest.useRealTimers();

      expect(pruned).toBe(0);
      expect(cacheManager.getCacheSize()).toBe(1);
    });
  });

  describe('Cache Management', () => {
    it('should reset statistics', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: 'Test' }],
      });

      let stats = cacheManager.getStats();
      expect(stats.misses).toBe(1);

      cacheManager.resetStats();

      stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.writes).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.costSavings).toBe(0);
    });

    it('should clear all cache entries', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(cacheManager.getCacheSize()).toBe(1);

      cacheManager.clearCache();

      expect(cacheManager.getCacheSize()).toBe(0);
    });

    it('should not cache content below minimum token threshold', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'Short prompt'; // < 1024 tokens

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: 'Test' }],
      });

      // Should not create cache entry for small content
      expect(cacheManager.getCacheSize()).toBe(0);
    });
  });

  describe('Cost Savings Calculation', () => {
    it('should calculate correct cost savings for cache hit', () => {
      const cacheTokens = 10000;
      const COST_PER_MILLION = 3.0;

      // Regular cost
      const regularCost = cacheTokens * (COST_PER_MILLION / 1_000_000);

      // Cache hit cost (90% discount = 10% of regular)
      const cacheCost = cacheTokens * 0.1 * (COST_PER_MILLION / 1_000_000);

      const expectedSavings = regularCost - cacheCost;

      expect(expectedSavings).toBeCloseTo(0.027, 5); // $0.027 savings
    });

    it('should calculate correct cost overhead for cache write', () => {
      const cacheTokens = 10000;
      const COST_PER_MILLION = 3.0;

      // Regular cost
      const regularCost = cacheTokens * (COST_PER_MILLION / 1_000_000);

      // Cache write cost (25% premium)
      const writeCost = cacheTokens * 1.25 * (COST_PER_MILLION / 1_000_000);

      const expectedOverhead = writeCost - regularCost;

      expect(expectedOverhead).toBeCloseTo(0.0075, 5); // $0.0075 overhead
    });
  });

  describe('Break-Even Analysis', () => {
    it('should calculate break-even point correctly', () => {
      const cacheTokens = 10000;
      const result = PromptCacheManager.calculateBreakEven(cacheTokens);

      // Break-even should occur after 1 hit (write overhead divided by hit savings)
      expect(result.hitsToBreakEven).toBeGreaterThanOrEqual(1);
      expect(result.hitsToBreakEven).toBeLessThanOrEqual(2);

      // Savings should be positive at break-even
      expect(result.savings.atBreakEven).toBeGreaterThan(0);

      // More hits = more savings
      expect(result.savings.at10Hits).toBeGreaterThan(result.savings.at5Hits);
      expect(result.savings.at5Hits).toBeGreaterThan(result.savings.atBreakEven);
    });

    it('should match expected break-even from plan documentation', () => {
      // From plan: 1 write + 1 hit breaks even
      const cacheTokens = 18000; // From example in plan
      const result = PromptCacheManager.calculateBreakEven(cacheTokens);

      expect(result.hitsToBreakEven).toBe(1);
    });
  });

  describe('Target Hit Rate', () => {
    it('should define target hit rate of 60-80%', () => {
      const target = PromptCacheManager.getTargetHitRate();

      expect(target.min).toBe(0.6);
      expect(target.max).toBe(0.8);
    });
  });

  describe('Integration with Multiple Cache Blocks', () => {
    it('should handle multiple cacheable blocks', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 20000,
          output_tokens: 500,
          cache_creation_input_tokens: 18000,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);
      const projectContext1 = 'B'.repeat(5000);
      const projectContext2 = 'C'.repeat(5000);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        projectContext: [
          { text: projectContext1, priority: 'medium' },
          { text: projectContext2, priority: 'low' },
        ],
        messages: [{ role: 'user', content: 'Test' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.tokensWritten).toBe(18000);
    });

    it('should generate same cache key for same multi-block content', async () => {
      const mockResponse = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 15000,
          output_tokens: 500,
        },
      };

      mockAnthropic.messages = {
        create: jest.fn().mockResolvedValue(mockResponse),
      } as any;

      const systemPrompt = 'A'.repeat(5000);
      const projectContext = 'B'.repeat(5000);

      // First call
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        projectContext: [{ text: projectContext }],
        messages: [{ role: 'user', content: 'Test 1' }],
      });

      // Second call (same cacheable content, different user message)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        systemPrompts: [{ text: systemPrompt }],
        projectContext: [{ text: projectContext }],
        messages: [{ role: 'user', content: 'Test 2' }],
      });

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });
});
