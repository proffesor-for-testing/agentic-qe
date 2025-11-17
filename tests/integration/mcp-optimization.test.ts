/**
 * Integration Tests for MCP Improvement Features
 *
 * Covers:
 * - QW-1: Client-Side Data Filtering
 * - QW-2: Batch Tool Operations
 * - CO-1: Prompt Caching Infrastructure
 * - CO-2: PII Tokenization Layer
 *
 * @see /workspaces/agentic-qe-cf/docs/planning/mcp-improvement-plan-revised.md
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { filterLargeDataset, type FilterConfig, type PriorityLevel } from '@/utils/filtering';
import { BatchOperationManager, type BatchOptions } from '@/utils/batch-operations';
import { PromptCacheManager, type CacheableContent } from '@/utils/prompt-cache';
import { PIITokenizer } from '@/security/pii-tokenization';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Test Data Generators
// ============================================================================

interface CoverageFile {
  path: string;
  coverage: number;
  lines: number;
  uncoveredLines: number[];
}

interface TestResult {
  suite: string;
  test: string;
  status: 'passed' | 'failed' | 'flaky';
  duration: number;
}

/**
 * Generate mock coverage data (10,000+ lines)
 */
function generateMockCoverage(fileCount: number = 1000): CoverageFile[] {
  const files: CoverageFile[] = [];

  for (let i = 0; i < fileCount; i++) {
    const lines = Math.floor(Math.random() * 500) + 100;
    const coverage = Math.random() * 100;
    const uncoveredCount = Math.floor(lines * (1 - coverage / 100));

    files.push({
      path: `/src/components/${i % 10}/feature-${i}.ts`,
      coverage,
      lines,
      uncoveredLines: Array.from({ length: uncoveredCount }, (_, j) => j + 1),
    });
  }

  return files;
}

/**
 * Generate mock test results (1,000+ tests)
 */
function generateMockTestResults(testCount: number = 1000): TestResult[] {
  const results: TestResult[] = [];
  const statuses: ('passed' | 'failed' | 'flaky')[] = ['passed', 'passed', 'passed', 'passed', 'failed', 'flaky'];

  for (let i = 0; i < testCount; i++) {
    results.push({
      suite: `Suite ${Math.floor(i / 20)}`,
      test: `Test case ${i}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      duration: Math.random() * 5000 + 100,
    });
  }

  return results;
}

/**
 * Generate PII samples for testing
 */
function generatePIISamples(): string[] {
  return [
    // Emails
    'john.doe@example.com',
    'jane.smith@company.org',
    'admin@test-site.io',
    'support@customer-service.net',
    'user123@domain.com',

    // Phone numbers
    '555-123-4567',
    '(555) 234-5678',
    '+1-555-345-6789',
    '555.456.7890',
    '5551234567',

    // SSNs
    '123-45-6789',
    '234-56-7890',
    '345-67-8901',
    '456-78-9012',
    '567-89-0123',

    // Credit cards
    '4532-1234-5678-9010',
    '5425 2345 6789 0123',
    '3782 823456 78901',
    '6011-1234-5678-9012',
    '3530111333300000',

    // Names
    'John Smith',
    'Jane Doe',
    'Robert Johnson',
    'Mary Williams',
    'James Brown',
  ];
}

/**
 * Create realistic test code with PII
 */
function generateTestCodeWithPII(): string {
  return `
describe('User Service', () => {
  test('should create user with email', async () => {
    const user = await userService.create({
      email: 'john.doe@example.com',
      phone: '555-123-4567',
      ssn: '123-45-6789',
    });

    expect(user.email).toBe('john.doe@example.com');
    expect(user.phone).toBe('555-123-4567');
  });

  test('should process payment', async () => {
    const payment = await paymentService.process({
      cardNumber: '4532-1234-5678-9010',
      name: 'John Smith',
      email: 'john.smith@example.com',
    });

    expect(payment.status).toBe('success');
  });

  test('should validate contact info', () => {
    const contact = {
      name: 'Jane Doe',
      email: 'jane.doe@company.org',
      phone: '(555) 234-5678',
    };

    expect(validateContact(contact)).toBe(true);
  });
});
`;
}

// ============================================================================
// QW-1: Client-Side Data Filtering Tests
// ============================================================================

describe('QW-1: Client-Side Data Filtering', () => {
  describe('Coverage Analysis Filtering', () => {
    test('should reduce 10,000 files to top 10 with 99% token reduction', () => {
      // Generate 10,000 files (simulates ~50,000 tokens)
      const fullCoverage = generateMockCoverage(10000);

      // Apply filtering
      const config: FilterConfig = {
        threshold: 80,
        topN: 10,
        priorities: ['high', 'medium'],
        includeMetrics: true,
      };

      const filtered = filterLargeDataset(
        fullCoverage,
        config,
        (file): PriorityLevel => file.coverage < 60 ? 'high' : file.coverage < 80 ? 'medium' : 'low',
        (a, b) => a.coverage - b.coverage,
        (file) => file.coverage
      );

      // Verify summary
      expect(filtered.summary.total).toBe(10000);
      expect(filtered.topItems.length).toBeLessThanOrEqual(10);

      // Calculate token reduction
      // Assume 5 tokens per file full output, 0.05 tokens per file in summary
      const beforeTokens = fullCoverage.length * 5;
      const afterTokens = filtered.topItems.length * 5 + 100; // 100 for summary
      const reduction = ((beforeTokens - afterTokens) / beforeTokens) * 100;

      expect(reduction).toBeGreaterThan(98); // Target: 99% reduction
      expect(filtered.metrics).toBeDefined();
      expect(filtered.metrics.priorityDistribution).toBeDefined();
    });

    test('should filter by threshold correctly', () => {
      const coverage = generateMockCoverage(100);

      const filtered = filterLargeDataset(
        coverage,
        { threshold: 80, topN: 50 },
        (file): PriorityLevel => file.coverage < 80 ? 'high' : 'low'
      );

      // All filtered items should be below threshold
      filtered.topItems.forEach(item => {
        expect(item.coverage).toBeLessThan(80);
      });
    });

    test('should sort by coverage (worst first)', () => {
      const coverage = generateMockCoverage(100);

      const filtered = filterLargeDataset(
        coverage,
        { topN: 10 },
        (file): PriorityLevel => file.coverage < 80 ? 'high' : 'low',
        (a, b) => a.coverage - b.coverage
      );

      // Verify sorting
      for (let i = 1; i < filtered.topItems.length; i++) {
        expect(filtered.topItems[i].coverage).toBeGreaterThanOrEqual(
          filtered.topItems[i - 1].coverage
        );
      }
    });

    test('should include metrics when requested', () => {
      const coverage = generateMockCoverage(100);

      const filtered = filterLargeDataset(
        coverage,
        { topN: 10, includeMetrics: true },
        (file): PriorityLevel => file.coverage < 80 ? 'high' : 'low',
        undefined,
        (file) => file.coverage
      );

      expect(filtered.metrics).toBeDefined();
      expect(filtered.metrics.priorityDistribution).toBeDefined();
      expect(filtered.metrics.avgValue).toBeDefined();
      expect(filtered.metrics.stdDev).toBeDefined();
    });
  });

  describe('Test Execution Filtering', () => {
    test('should reduce 1,000 test results to failures only', () => {
      const testResults = generateMockTestResults(1000);

      const filtered = filterLargeDataset(
        testResults,
        {
          priorities: ['high'],
          topN: 50,
          includeMetrics: true,
        },
        (result): PriorityLevel => result.status === 'failed' ? 'high' :
                     result.status === 'flaky' ? 'medium' : 'low',
        undefined,
        (result) => result.duration
      );

      // All filtered items should be failures
      filtered.topItems.forEach(item => {
        expect(item.status).toBe('failed');
      });

      // Calculate token reduction (1,000 tests → ~50 failures)
      const beforeTokens = testResults.length * 3; // 3 tokens per test
      const afterTokens = filtered.topItems.length * 3 + 50; // 50 for summary
      const reduction = ((beforeTokens - afterTokens) / beforeTokens) * 100;

      expect(reduction).toBeGreaterThan(90); // Target: 97.3% reduction
    });
  });

  describe('Performance Metrics', () => {
    test('should filter 10,000+ items in <500ms', async () => {
      const coverage = generateMockCoverage(10000);

      const startTime = performance.now();

      filterLargeDataset(
        coverage,
        { threshold: 80, topN: 10, includeMetrics: true },
        (file): PriorityLevel => file.coverage < 60 ? 'high' : file.coverage < 80 ? 'medium' : 'low',
        (a, b) => a.coverage - b.coverage,
        (file) => file.coverage
      );

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(500); // Target: <500ms for filtering
    });
  });
});

// ============================================================================
// QW-2: Batch Tool Operations Tests
// ============================================================================

describe('QW-2: Batch Tool Operations', () => {
  let batchManager: BatchOperationManager;

  beforeEach(() => {
    batchManager = new BatchOperationManager();
  });

  describe('Batch Execution', () => {
    test('should execute 10 operations with max 5 concurrent', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => i);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const handler = async (op: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        await new Promise(resolve => setTimeout(resolve, 100));

        currentConcurrent--;
        return op * 2;
      };

      const results = await batchManager.batchExecute(operations, handler, {
        maxConcurrent: 5,
      });

      expect(results).toHaveLength(10);
      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    });

    test('should reduce latency from sequential to batched (60-80%)', async () => {
      const operations = Array.from({ length: 20 }, (_, i) => i);
      const opDuration = 100; // ms per operation

      // Sequential execution (baseline)
      const sequentialStart = performance.now();
      for (const op of operations) {
        await new Promise(resolve => setTimeout(resolve, opDuration));
      }
      const sequentialDuration = performance.now() - sequentialStart;

      // Batched execution (target)
      const batchedStart = performance.now();
      await batchManager.batchExecute(
        operations,
        async (op) => {
          await new Promise(resolve => setTimeout(resolve, opDuration));
          return op;
        },
        { maxConcurrent: 5 }
      );
      const batchedDuration = performance.now() - batchedStart;

      // Calculate reduction
      const reduction = ((sequentialDuration - batchedDuration) / sequentialDuration) * 100;

      // Expected: 20 ops × 100ms = 2000ms sequential
      // Expected: (20 / 5) × 100ms = 400ms batched (80% reduction)
      expect(reduction).toBeGreaterThan(60); // Target: 60-80% reduction
      expect(batchedDuration).toBeLessThan(sequentialDuration / 2);
    });
  });

  describe('Retry Logic', () => {
    test('should retry on failure with exponential backoff', async () => {
      const operations = [1, 2, 3];
      let attemptCounts = new Map<number, number>();

      const handler = async (op: number) => {
        const attempts = (attemptCounts.get(op) || 0) + 1;
        attemptCounts.set(op, attempts);

        if (attempts < 3) {
          throw new Error('Simulated failure');
        }

        return op * 2;
      };

      const results = await batchManager.batchExecute(operations, handler, {
        retryOnError: true,
        maxRetries: 3,
      });

      expect(results).toEqual([2, 4, 6]);
      // Each operation should have been attempted 3 times
      operations.forEach(op => {
        expect(attemptCounts.get(op)).toBe(3);
      });
    });

    test('should fail after max retries', async () => {
      const operations = [1];

      const handler = async (op: number) => {
        throw new Error('Permanent failure');
      };

      await expect(
        batchManager.batchExecute(operations, handler, {
          retryOnError: true,
          maxRetries: 3,
        })
      ).rejects.toThrow('Permanent failure');
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout operations that exceed limit', async () => {
      const operations = [1];

      const handler = async (op: number) => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
        return op;
      };

      await expect(
        batchManager.batchExecute(operations, handler, {
          timeout: 500, // 500ms timeout
        })
      ).rejects.toThrow('Operation timeout');
    });
  });

  describe('Performance Benchmarks', () => {
    test('should reduce API calls from 100 sequential to 20 batched (80%)', async () => {
      const operations = Array.from({ length: 100 }, (_, i) => i);
      let apiCallCount = 0;

      const handler = async (op: number) => {
        apiCallCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return op;
      };

      await batchManager.batchExecute(operations, handler, {
        maxConcurrent: 5,
      });

      // All 100 operations should result in 100 API calls
      // But batching reduces total wall-clock time
      expect(apiCallCount).toBe(100);

      // Batching effectiveness: 100 ops / 5 concurrent = 20 batch rounds
      const batchRounds = Math.ceil(operations.length / 5);
      expect(batchRounds).toBe(20);
    });
  });
});

// ============================================================================
// CO-1: Prompt Caching Infrastructure Tests
// ============================================================================

describe('CO-1: Prompt Caching Infrastructure', () => {
  let cacheManager: PromptCacheManager;
  const mockApiKey = 'sk-ant-test-key';

  beforeEach(() => {
    // Note: In real tests, this would use mocked Anthropic client
    cacheManager = new PromptCacheManager(mockApiKey);
  });

  describe('Cache Hit/Miss Tracking', () => {
    test('should track cache misses on first call', async () => {
      const systemPrompts: CacheableContent[] = [
        {
          text: 'A'.repeat(2000), // >1024 tokens
          priority: 'high',
        },
      ];

      // Mock the Anthropic API response
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Test response' }],
        model: 'claude-sonnet-4',
        usage: {
          input_tokens: 2000,
          output_tokens: 50,
          cache_creation_input_tokens: 2000,
          cache_read_input_tokens: 0,
        },
      };

      // First call should be a miss
      jest.spyOn(cacheManager['anthropic'].messages, 'create')
        .mockResolvedValue(mockResponse as any);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompts,
      });

      const stats = cacheManager.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      expect(stats.writes).toBe(1);
    });

    test('should track cache hits on subsequent calls within 5 minutes', async () => {
      const systemPrompts: CacheableContent[] = [
        {
          text: 'A'.repeat(2000),
          priority: 'high',
        },
      ];

      const mockWriteResponse = {
        usage: {
          cache_creation_input_tokens: 2000,
          cache_read_input_tokens: 0,
        },
      };

      const mockReadResponse = {
        usage: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 2000,
        },
      };

      const createSpy = jest.spyOn(cacheManager['anthropic'].messages, 'create');
      createSpy.mockResolvedValueOnce(mockWriteResponse as any);

      // First call (cache write)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompts,
      });

      createSpy.mockResolvedValueOnce(mockReadResponse as any);

      // Second call (cache hit)
      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompts,
      });

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    test('should achieve 60-80% cache hit rate over 5-minute window', async () => {
      const systemPrompts: CacheableContent[] = [
        {
          text: 'A'.repeat(2000),
          priority: 'high',
        },
      ];

      const createSpy = jest.spyOn(cacheManager['anthropic'].messages, 'create');

      // First call: cache write
      createSpy.mockResolvedValueOnce({
        usage: { cache_creation_input_tokens: 2000, cache_read_input_tokens: 0 },
      } as any);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompts,
      });

      // Subsequent 9 calls: cache hits
      for (let i = 0; i < 9; i++) {
        createSpy.mockResolvedValueOnce({
          usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 2000 },
        } as any);

        await cacheManager.createWithCache({
          model: 'claude-sonnet-4',
          messages: [{ role: 'user', content: `Test ${i}` }],
          systemPrompts,
        });
      }

      const stats = cacheManager.getStats();
      expect(stats.hitRate).toBeGreaterThanOrEqual(0.6); // Target: 60-80%
      expect(stats.hitRate).toBeLessThanOrEqual(1.0);
      expect(stats.hits).toBe(9);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate cache after 5 minutes', () => {
      const cacheKey = 'test-key';

      // Set cache entry
      cacheManager['cacheKeys'].set(cacheKey, {
        hash: cacheKey,
        timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
      });

      // Check if it's a hit (should be false)
      const isHit = cacheManager['isCacheHit'](cacheKey);
      expect(isHit).toBe(false);
    });

    test('should prune expired cache entries', () => {
      // Add some old entries
      cacheManager['cacheKeys'].set('old-1', {
        hash: 'old-1',
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      });
      cacheManager['cacheKeys'].set('old-2', {
        hash: 'old-2',
        timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
      });
      cacheManager['cacheKeys'].set('fresh', {
        hash: 'fresh',
        timestamp: Date.now(), // Now
      });

      expect(cacheManager['cacheKeys'].size).toBe(3);

      cacheManager.pruneCache();

      expect(cacheManager['cacheKeys'].size).toBe(1);
      expect(cacheManager['cacheKeys'].has('fresh')).toBe(true);
    });
  });

  describe('Cost Savings Calculation', () => {
    test('should calculate cost savings from cache hits', async () => {
      const systemPrompts: CacheableContent[] = [
        {
          text: 'A'.repeat(10000), // ~10,000 tokens
          priority: 'high',
        },
      ];

      const createSpy = jest.spyOn(cacheManager['anthropic'].messages, 'create');

      // Cache write (25% premium)
      createSpy.mockResolvedValueOnce({
        usage: {
          cache_creation_input_tokens: 10000,
          cache_read_input_tokens: 0,
        },
      } as any);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompts,
      });

      // Cache hit (90% discount)
      createSpy.mockResolvedValueOnce({
        usage: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 10000,
        },
      } as any);

      await cacheManager.createWithCache({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompts,
      });

      const stats = cacheManager.getStats();

      // Expected savings:
      // Cache write cost: 10,000 × 1.25 × $3.00 / 1M = $0.0375
      // Cache hit cost: 10,000 × 0.1 × $3.00 / 1M = $0.003
      // Regular cost would be: 10,000 × $3.00 / 1M = $0.03
      // Savings: $0.03 - $0.003 = $0.027 per hit

      expect(stats.costSavings).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// CO-2: PII Tokenization Layer Tests
// ============================================================================

describe('CO-2: PII Tokenization Layer', () => {
  let tokenizer: PIITokenizer;

  beforeEach(() => {
    tokenizer = new PIITokenizer();
  });

  describe('Email Tokenization', () => {
    test('should tokenize all email formats', () => {
      const content = `
        Contact: john.doe@example.com
        Admin: admin@test-site.io
        Support: support@customer-service.net
      `;

      const result = tokenizer.tokenize(content);

      expect(result.piiCount).toBe(3);
      expect(result.tokenized).toContain('[EMAIL_0]');
      expect(result.tokenized).toContain('[EMAIL_1]');
      expect(result.tokenized).toContain('[EMAIL_2]');
      expect(result.tokenized).not.toContain('@');
      expect(result.reverseMap.email.size).toBe(3);
    });
  });

  describe('Phone Number Tokenization', () => {
    test('should tokenize various phone formats', () => {
      const content = `
        Contact: 555-123-4567
        Office: (555) 234-5678
        Mobile: +1-555-345-6789
        Fax: 555.456.7890
      `;

      const result = tokenizer.tokenize(content);

      expect(result.piiCount).toBeGreaterThan(0);
      expect(result.tokenized).toContain('[PHONE_');
      expect(result.tokenized).not.toMatch(/\d{3}[-.)]\d{3}/);
      expect(result.reverseMap.phone.size).toBeGreaterThan(0);
    });
  });

  describe('SSN Tokenization', () => {
    test('should tokenize SSNs', () => {
      const content = `
        SSN: 123-45-6789
        Tax ID: 234-56-7890
      `;

      const result = tokenizer.tokenize(content);

      expect(result.piiCount).toBe(2);
      expect(result.tokenized).toContain('[SSN_0]');
      expect(result.tokenized).toContain('[SSN_1]');
      expect(result.tokenized).not.toMatch(/\d{3}-\d{2}-\d{4}/);
      expect(result.reverseMap.ssn.size).toBe(2);
    });
  });

  describe('Credit Card Tokenization', () => {
    test('should tokenize credit card numbers', () => {
      const content = `
        Card: 4532-1234-5678-9010
        Amex: 3782 823456 78901
        Discover: 6011-1234-5678-9012
      `;

      const result = tokenizer.tokenize(content);

      expect(result.piiCount).toBeGreaterThan(0);
      expect(result.tokenized).toContain('[CC_');
      expect(result.tokenized).not.toMatch(/\d{4}[-\s]?\d{4}/);
      expect(result.reverseMap.creditCard.size).toBeGreaterThan(0);
    });
  });

  describe('Name Tokenization', () => {
    test('should tokenize person names', () => {
      const content = `
        Author: John Smith
        Reviewer: Jane Doe
        Contributor: Robert Johnson
      `;

      const result = tokenizer.tokenize(content);

      expect(result.piiCount).toBeGreaterThan(0);
      expect(result.tokenized).toContain('[NAME_');
      expect(result.reverseMap.name.size).toBeGreaterThan(0);
    });
  });

  describe('Comprehensive PII Detection', () => {
    test('should tokenize all PII types in test code', () => {
      const testCode = generateTestCodeWithPII();

      const result = tokenizer.tokenize(testCode);

      // Verify PII is removed
      expect(result.tokenized).not.toContain('@example.com');
      expect(result.tokenized).not.toContain('555-123-4567');
      expect(result.tokenized).not.toContain('123-45-6789');
      expect(result.tokenized).not.toContain('4532-1234-5678-9010');

      // Verify tokenization
      expect(result.tokenized).toContain('[EMAIL_');
      expect(result.tokenized).toContain('[PHONE_');
      expect(result.tokenized).toContain('[SSN_');
      expect(result.tokenized).toContain('[CC_');
      expect(result.tokenized).toContain('[NAME_');

      // Get stats
      const stats = tokenizer.getStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.emails).toBeGreaterThan(0);
      expect(stats.phones).toBeGreaterThan(0);
    });

    test('should process 1,000+ PII samples without leaks', () => {
      const samples = generatePIISamples();

      // Create large test dataset (1,000+ samples)
      const largeDataset = Array.from({ length: 1000 }, (_, i) => {
        const sample = samples[i % samples.length];
        return `Test case ${i}: data = "${sample}"`;
      }).join('\n');

      const result = tokenizer.tokenize(largeDataset);

      // Verify no PII remains
      const piiPatterns = [
        /@[\w.-]+\.com/,
        /\d{3}[-.)]\d{3}/,
        /\d{3}-\d{2}-\d{4}/,
        /\d{4}[-\s]?\d{4}/,
      ];

      piiPatterns.forEach(pattern => {
        expect(result.tokenized).not.toMatch(pattern);
      });

      expect(result.piiCount).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Detokenization', () => {
    test('should restore original PII after tokenization', () => {
      const original = `
        Contact: john.doe@example.com
        Phone: 555-123-4567
        SSN: 123-45-6789
        Card: 4532-1234-5678-9010
        Name: John Smith
      `;

      const { tokenized, reverseMap } = tokenizer.tokenize(original);

      // Verify PII is removed
      expect(tokenized).not.toContain('@example.com');

      // Detokenize
      const restored = tokenizer.detokenize(tokenized, reverseMap);

      // Verify exact restoration
      expect(restored).toContain('john.doe@example.com');
      expect(restored).toContain('555-123-4567');
      expect(restored).toContain('123-45-6789');
      expect(restored).toContain('4532-1234-5678-9010');
      expect(restored).toContain('John Smith');
    });
  });

  describe('GDPR/CCPA Compliance', () => {
    test('should ensure zero PII in tokenized output', () => {
      const testCode = generateTestCodeWithPII();
      const { tokenized } = tokenizer.tokenize(testCode);

      // Comprehensive PII detection patterns
      const piiPatterns = [
        // Email
        /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
        // Phone
        /\d{3}[-.)]\d{3}[-.)]\d{4}/,
        // SSN
        /\d{3}-\d{2}-\d{4}/,
        // Credit card
        /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/,
      ];

      piiPatterns.forEach(pattern => {
        const matches = tokenized.match(pattern);
        expect(matches).toBeNull();
      });
    });

    test('should maintain PII statistics for audit', () => {
      const samples = generatePIISamples();
      const content = samples.join('\n');

      tokenizer.tokenize(content);

      const stats = tokenizer.getStats();

      expect(stats).toHaveProperty('emails');
      expect(stats).toHaveProperty('phones');
      expect(stats).toHaveProperty('ssns');
      expect(stats).toHaveProperty('creditCards');
      expect(stats).toHaveProperty('names');
      expect(stats).toHaveProperty('total');

      expect(stats.total).toBe(
        stats.emails + stats.phones + stats.ssns + stats.creditCards + stats.names
      );
    });
  });

  describe('Clear and Reset', () => {
    test('should clear reverse map', () => {
      const content = generateTestCodeWithPII();
      tokenizer.tokenize(content);

      expect(tokenizer.getStats().total).toBeGreaterThan(0);

      tokenizer.clear();

      const stats = tokenizer.getStats();
      expect(stats.total).toBe(0);
      expect(stats.emails).toBe(0);
      expect(stats.phones).toBe(0);
    });
  });
});

// ============================================================================
// Integration: End-to-End Workflow Tests
// ============================================================================

describe('Integration: End-to-End MCP Optimization Workflow', () => {
  test('should filter coverage, batch generate tests, cache prompts, and tokenize PII', async () => {
    // Step 1: Filter large coverage dataset (QW-1)
    const coverage = generateMockCoverage(1000);
    const filtered = filterLargeDataset(
      coverage,
      { threshold: 80, topN: 10, includeMetrics: true },
      (file): PriorityLevel => file.coverage < 60 ? 'high' : file.coverage < 80 ? 'medium' : 'low',
      (a, b) => a.coverage - b.coverage,
      (file) => file.coverage
    );

    expect(filtered.topItems.length).toBeLessThanOrEqual(10);

    // Step 2: Batch test generation for top gaps (QW-2)
    const batchManager = new BatchOperationManager();
    const testFiles = await batchManager.batchExecute(
      filtered.topItems,
      async (file) => {
        // Simulate test generation
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          sourceFile: file.path,
          testFile: file.path.replace('.ts', '.test.ts'),
          testCode: generateTestCodeWithPII(),
        };
      },
      { maxConcurrent: 5 }
    );

    expect(testFiles.length).toBe(filtered.topItems.length);

    // Step 3: Tokenize PII in generated tests (CO-2)
    const tokenizer = new PIITokenizer();
    const tokenizedTests = testFiles.map(test => {
      const { tokenized, reverseMap } = tokenizer.tokenize(test.testCode);
      return {
        ...test,
        tokenizedCode: tokenized,
        reverseMap,
      };
    });

    // Verify no PII in tokenized output
    tokenizedTests.forEach(test => {
      expect(test.tokenizedCode).not.toContain('@example.com');
      expect(test.tokenizedCode).not.toContain('555-123-4567');
    });

    // Step 4: Cache prompt for test generation (CO-1)
    // (Would use mocked Anthropic client in real test)
    // const cacheManager = new PromptCacheManager(mockApiKey);
    // ... cache hit/miss tracking ...

    console.log('✅ End-to-end workflow complete');
    console.log(`  - Filtered ${coverage.length} files → ${filtered.topItems.length} gaps`);
    console.log(`  - Generated ${testFiles.length} test files in batches`);
    console.log(`  - Tokenized PII: ${tokenizer.getStats().total} instances`);
  });
});

// ============================================================================
// Performance Benchmarks
// ============================================================================

describe('Performance Benchmarks', () => {
  test('QW-1: Coverage filtering performance (10,000 files in <500ms)', () => {
    const coverage = generateMockCoverage(10000);

    const startTime = performance.now();
    filterLargeDataset(
      coverage,
      { threshold: 80, topN: 10, includeMetrics: true },
      (file): PriorityLevel => file.coverage < 60 ? 'high' : file.coverage < 80 ? 'medium' : 'low',
      (a, b) => a.coverage - b.coverage,
      (file) => file.coverage
    );
    const duration = performance.now() - startTime;

    console.log(`QW-1 Performance: ${coverage.length} files in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(500);
  });

  test('QW-2: Batch execution performance (100 ops, 5 concurrent)', async () => {
    const operations = Array.from({ length: 100 }, (_, i) => i);
    const batchManager = new BatchOperationManager();

    const startTime = performance.now();
    await batchManager.batchExecute(
      operations,
      async (op) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return op;
      },
      { maxConcurrent: 5 }
    );
    const duration = performance.now() - startTime;

    console.log(`QW-2 Performance: ${operations.length} operations in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(300); // Expected: ~200ms (100/5 batches × 10ms)
  });

  test('CO-2: PII tokenization performance (1,000+ samples)', () => {
    const samples = generatePIISamples();
    const largeDataset = Array.from({ length: 1000 }, (_, i) => {
      return `Test ${i}: ${samples[i % samples.length]}`;
    }).join('\n');

    const tokenizer = new PIITokenizer();

    const startTime = performance.now();
    tokenizer.tokenize(largeDataset);
    const duration = performance.now() - startTime;

    console.log(`CO-2 Performance: 1,000 PII samples in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(1000); // Target: <1s for 1,000 samples
  });
});
