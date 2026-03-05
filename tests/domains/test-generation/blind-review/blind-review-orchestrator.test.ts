/**
 * Blind Review Orchestrator Tests
 *
 * Verifies the loki-mode inspired blind review pattern:
 * - Parallel independent test generation passes
 * - Jaccard-based deduplication of similar tests
 * - Timeout and error handling for individual reviewers
 */

import { describe, it, expect, vi } from 'vitest';
import {
  BlindReviewOrchestrator,
  tokenize,
  jaccardSimilarity,
  deduplicateTests,
} from '../../../../src/domains/test-generation/blind-review/blind-review-orchestrator.js';
import type { ITestGenerationService } from '../../../../src/domains/test-generation/services/test-generator.js';
import type {
  IGeneratedTest,
  IGenerateTestsRequest,
  IGeneratedTests,
} from '../../../../src/domains/test-generation/interfaces.js';
import type { Result } from '../../../../src/shared/types/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTest(overrides: Partial<IGeneratedTest> = {}): IGeneratedTest {
  return {
    id: overrides.id ?? `test-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? 'test case',
    sourceFile: overrides.sourceFile ?? 'src/utils.ts',
    testFile: overrides.testFile ?? 'tests/utils.test.ts',
    testCode: overrides.testCode ?? 'expect(add(1, 2)).toBe(3);',
    type: overrides.type ?? 'unit',
    assertions: overrides.assertions ?? 1,
  };
}

function makeRequest(): IGenerateTestsRequest {
  return {
    sourceFiles: ['src/utils.ts'],
    testType: 'unit',
    framework: 'vitest',
  };
}

function createMockService(
  responses: Array<Result<IGeneratedTests, Error>>
): ITestGenerationService {
  let callIndex = 0;
  return {
    generateTests: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return response;
    }),
    generateForCoverageGap: vi.fn(),
    generateTDDTests: vi.fn(),
    generatePropertyTests: vi.fn(),
    generateTestData: vi.fn(),
  } as unknown as ITestGenerationService;
}

function okResult(tests: IGeneratedTest[]): Result<IGeneratedTests, Error> {
  return {
    success: true,
    value: { tests, coverageEstimate: 80, patternsUsed: [] },
  };
}

function errResult(message: string): Result<IGeneratedTests, Error> {
  return { success: false, error: new Error(message) };
}

// ============================================================================
// Tokenization Tests
// ============================================================================

describe('tokenize', () => {
  it('should extract meaningful tokens from code', () => {
    const tokens = tokenize('expect(add(1, 2)).toBe(3);');
    expect(tokens.has('expect')).toBe(true);
    expect(tokens.has('add')).toBe(true);
    expect(tokens.has('toBe')).toBe(true);
  });

  it('should filter tokens shorter than 3 characters', () => {
    const tokens = tokenize('const a = b + cd;');
    expect(tokens.has('a')).toBe(false);
    expect(tokens.has('b')).toBe(false);
    expect(tokens.has('cd')).toBe(false);
    expect(tokens.has('const')).toBe(true);
  });

  it('should return empty set for whitespace-only input', () => {
    const tokens = tokenize('   \n\t  ');
    expect(tokens.size).toBe(0);
  });
});

// ============================================================================
// Jaccard Similarity Tests
// ============================================================================

describe('jaccardSimilarity', () => {
  it('should return 1 for identical sets', () => {
    const a = new Set(['foo', 'bar', 'baz']);
    expect(jaccardSimilarity(a, a)).toBe(1);
  });

  it('should return 0 for disjoint sets', () => {
    const a = new Set(['foo', 'bar']);
    const b = new Set(['baz', 'qux']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('should return 0 for two empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it('should compute partial overlap correctly', () => {
    const a = new Set(['foo', 'bar', 'baz']);
    const b = new Set(['bar', 'baz', 'qux']);
    // intersection = {bar, baz} = 2, union = {foo, bar, baz, qux} = 4
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5);
  });
});

// ============================================================================
// Deduplication Tests
// ============================================================================

describe('deduplicateTests', () => {
  it('should deduplicate identical tests down to 1', () => {
    const test = makeTest({ testCode: 'expect(add(1, 2)).toBe(3);' });
    const tests = [
      { ...test, id: 'a' },
      { ...test, id: 'b' },
      { ...test, id: 'c' },
    ];
    const result = deduplicateTests(tests, 0.8);
    expect(result).toHaveLength(1);
  });

  it('should keep completely different tests', () => {
    const tests = [
      makeTest({
        id: 'a',
        testCode: 'expect(calculateTax(100)).toBe(10);',
        assertions: 1,
      }),
      makeTest({
        id: 'b',
        testCode: 'const user = createUser("alice"); expect(user.name).toBe("alice");',
        assertions: 1,
      }),
      makeTest({
        id: 'c',
        testCode: 'await expect(fetchData()).rejects.toThrow("network error");',
        assertions: 1,
      }),
    ];
    const result = deduplicateTests(tests, 0.8);
    expect(result).toHaveLength(3);
  });

  it('should keep the test with the most assertions from a cluster', () => {
    const tests = [
      makeTest({
        id: 'few',
        testCode: 'expect(add(1, 2)).toBe(3);',
        assertions: 1,
      }),
      makeTest({
        id: 'many',
        testCode: 'expect(add(1, 2)).toBe(3);',
        assertions: 5,
      }),
    ];
    const result = deduplicateTests(tests, 0.8);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('many');
  });

  it('should handle empty input', () => {
    expect(deduplicateTests([], 0.8)).toHaveLength(0);
  });

  it('should group by source file before deduplication', () => {
    const code = 'expect(add(1, 2)).toBe(3);';
    const tests = [
      makeTest({ id: 'a', sourceFile: 'src/a.ts', testCode: code }),
      makeTest({ id: 'b', sourceFile: 'src/b.ts', testCode: code }),
    ];
    // Same code but different source files => different groups => both kept
    const result = deduplicateTests(tests, 0.8);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// BlindReviewOrchestrator Tests
// ============================================================================

describe('BlindReviewOrchestrator', () => {
  it('should run multiple reviewers and merge results', async () => {
    const testA = makeTest({ id: 'a', testCode: 'expect(foo()).toBe(true);' });
    const testB = makeTest({
      id: 'b',
      testCode: 'const result = computeHash("data"); expect(result).toBeDefined();',
    });
    const testC = makeTest({
      id: 'c',
      testCode: 'await expect(asyncOp()).resolves.toEqual({ status: "ok" });',
    });

    const service = createMockService([
      okResult([testA]),
      okResult([testB]),
      okResult([testC]),
    ]);

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 3,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.stats.totalGenerated).toBe(3);
    expect(result.value.reviewerOutputs).toHaveLength(3);
    // All tests are different, so all should survive dedup
    expect(result.value.mergedTests.length).toBeGreaterThanOrEqual(3);
  });

  it('should deduplicate identical tests across reviewers', async () => {
    const sameTest = makeTest({
      testCode: 'expect(add(1, 2)).toBe(3);',
      assertions: 2,
    });

    const service = createMockService([okResult([sameTest])]);

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 3,
      deduplicationThreshold: 0.8,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.stats.totalGenerated).toBe(3);
    expect(result.value.stats.afterDedup).toBe(1);
  });

  it('should compute uniqueness score correctly', async () => {
    const sameTest = makeTest({ testCode: 'expect(add(1, 2)).toBe(3);' });
    const service = createMockService([okResult([sameTest])]);

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 3,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // 1 unique out of 3 total => 1/3
    expect(result.value.stats.uniquenessScore).toBeCloseTo(1 / 3);
  });

  it('should handle a single reviewer (degenerate case)', async () => {
    const test = makeTest({ id: 'solo' });
    const service = createMockService([okResult([test])]);

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 1,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.mergedTests).toHaveLength(1);
    expect(result.value.reviewerOutputs).toHaveLength(1);
    expect(result.value.stats.uniquenessScore).toBe(1);
  });

  it('should return error when all reviewers fail', async () => {
    const service = createMockService([errResult('generation failed')]);

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 3,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('All reviewers failed');
  });

  it('should succeed when some reviewers fail but others succeed', async () => {
    const test = makeTest({ id: 'survivor' });
    let callCount = 0;
    const service: ITestGenerationService = {
      generateTests: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return okResult([test]);
        return errResult('failed');
      }),
      generateForCoverageGap: vi.fn(),
      generateTDDTests: vi.fn(),
      generatePropertyTests: vi.fn(),
      generateTestData: vi.fn(),
    } as unknown as ITestGenerationService;

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 3,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.mergedTests.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle timeout for slow reviewers', async () => {
    const fastTest = makeTest({ id: 'fast' });
    let callCount = 0;
    const service: ITestGenerationService = {
      generateTests: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          // Slow reviewer - will time out
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        return okResult([fastTest]);
      }),
      generateForCoverageGap: vi.fn(),
      generateTDDTests: vi.fn(),
      generatePropertyTests: vi.fn(),
      generateTestData: vi.fn(),
    } as unknown as ITestGenerationService;

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 3,
      timeoutMs: 200,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // At least the fast reviewers should have produced results
    expect(result.value.mergedTests.length).toBeGreaterThanOrEqual(1);
  });

  it('should return error for reviewerCount < 1', async () => {
    const service = createMockService([okResult([makeTest()])]);
    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 0,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('reviewerCount must be at least 1');
  });

  it('should handle reviewer throwing an exception', async () => {
    const test = makeTest({ id: 'ok' });
    let callCount = 0;
    const service: ITestGenerationService = {
      generateTests: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('unexpected crash');
        }
        return okResult([test]);
      }),
      generateForCoverageGap: vi.fn(),
      generateTDDTests: vi.fn(),
      generatePropertyTests: vi.fn(),
      generateTestData: vi.fn(),
    } as unknown as ITestGenerationService;

    const orchestrator = new BlindReviewOrchestrator(service);
    const result = await orchestrator.generateWithBlindReview(makeRequest(), {
      reviewerCount: 3,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.mergedTests.length).toBeGreaterThanOrEqual(1);
  });
});
