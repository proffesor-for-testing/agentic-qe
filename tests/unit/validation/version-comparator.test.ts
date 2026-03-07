/**
 * Version Comparator Tests
 * ADR-056: Skill validation system - version comparison support
 *
 * Tests for statistical comparison of two skill versions using
 * Cohen's d effect size and confidence scoring.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createVersionComparator,
  VersionComparator,
  type SkillVersion,
  type VersionComparisonResult,
} from '../../../src/validation/version-comparator.js';
import type {
  TestCaseResult,
  SkillValidationOutcome,
} from '../../../src/learning/skill-validation-learner.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function makeTestCaseResult(overrides: Partial<TestCaseResult> = {}): TestCaseResult {
  return {
    testId: `test-${Math.random().toString(36).slice(2, 8)}`,
    passed: true,
    expectedPatterns: ['expected-pattern'],
    actualPatterns: ['expected-pattern'],
    reasoningQuality: 0.85,
    executionTimeMs: 150,
    category: 'functional',
    priority: 'medium',
    ...overrides,
  };
}

function makeResultSet(
  count: number,
  overrides: Partial<TestCaseResult> = {},
  idPrefix = 'test',
): TestCaseResult[] {
  return Array.from({ length: count }, (_, i) =>
    makeTestCaseResult({ testId: `${idPrefix}-${i}`, ...overrides }),
  );
}

function makeMatchedResultSets(
  count: number,
  overridesA: Partial<TestCaseResult> = {},
  overridesB: Partial<TestCaseResult> = {},
): { resultsA: TestCaseResult[]; resultsB: TestCaseResult[] } {
  const resultsA = Array.from({ length: count }, (_, i) =>
    makeTestCaseResult({ testId: `shared-${i}`, ...overridesA }),
  );
  const resultsB = Array.from({ length: count }, (_, i) =>
    makeTestCaseResult({ testId: `shared-${i}`, ...overridesB }),
  );
  return { resultsA, resultsB };
}

function makeSkillVersion(overrides: Partial<SkillVersion> = {}): SkillVersion {
  return {
    versionId: 'v1.0.0',
    skillName: 'test-skill',
    skillPath: '/skills/test-skill/SKILL.md',
    ...overrides,
  };
}

function makeOutcome(
  testCaseResults: TestCaseResult[],
  overrides: Partial<SkillValidationOutcome> = {},
): SkillValidationOutcome {
  const passed = testCaseResults.every(r => r.passed);
  return {
    skillName: 'test-skill',
    trustTier: 2,
    validationLevel: 'eval',
    model: 'claude-sonnet',
    passed,
    score: passed ? 0.9 : 0.5,
    testCaseResults,
    timestamp: new Date(),
    runId: `run-${Date.now()}`,
    ...overrides,
  } as SkillValidationOutcome;
}

// ============================================================================
// Tests
// ============================================================================

describe('VersionComparator', () => {
  let comparator: VersionComparator;

  beforeEach(() => {
    comparator = createVersionComparator();
  });

  // ==========================================================================
  // calculateEffectSize
  // ==========================================================================

  describe('calculateEffectSize', () => {
    it('should return 0 for identical score arrays', () => {
      // GIVEN: Two identical arrays of scores
      const scores = [0.8, 0.85, 0.9, 0.75, 0.88];

      // WHEN: Calculating effect size
      const effectSize = comparator.calculateEffectSize(scores, [...scores]);

      // THEN: Effect size is 0 (no difference)
      expect(effectSize).toBe(0);
    });

    it('should return positive value when B scores are higher', () => {
      // GIVEN: Version B has consistently higher scores
      const scoresA = [0.5, 0.55, 0.6, 0.52, 0.58];
      const scoresB = [0.8, 0.85, 0.9, 0.82, 0.88];

      // WHEN: Calculating effect size
      const effectSize = comparator.calculateEffectSize(scoresA, scoresB);

      // THEN: Effect size is positive (B > A)
      expect(effectSize).toBeGreaterThan(0);
    });

    it('should return negative value when A scores are higher', () => {
      // GIVEN: Version A has consistently higher scores
      const scoresA = [0.9, 0.92, 0.95, 0.88, 0.91];
      const scoresB = [0.5, 0.55, 0.52, 0.48, 0.53];

      // WHEN: Calculating effect size
      const effectSize = comparator.calculateEffectSize(scoresA, scoresB);

      // THEN: Effect size is negative (A > B, so meanB - meanA < 0)
      expect(effectSize).toBeLessThan(0);
    });

    it('should handle arrays of length 1', () => {
      // GIVEN: Single-element score arrays (variance is undefined for n=1,
      // so pooledStdDev computes 0/0 = NaN, yielding NaN effect size)
      const scoresA = [0.5];
      const scoresB = [0.9];

      // WHEN: Calculating effect size
      const effectSize = comparator.calculateEffectSize(scoresA, scoresB);

      // THEN: Returns NaN because pooled variance is 0/0 with n=1 per group
      expect(typeof effectSize).toBe('number');
      expect(Number.isNaN(effectSize)).toBe(true);
    });

    it('should return 0 for two empty arrays', () => {
      // GIVEN: Empty score arrays
      const scoresA: number[] = [];
      const scoresB: number[] = [];

      // WHEN: Calculating effect size
      const effectSize = comparator.calculateEffectSize(scoresA, scoresB);

      // THEN: Returns 0
      expect(effectSize).toBe(0);
    });

    it('should return 0 when all values are the same across both arrays', () => {
      // GIVEN: Both arrays have identical constant values
      const scoresA = [0.7, 0.7, 0.7, 0.7, 0.7];
      const scoresB = [0.7, 0.7, 0.7, 0.7, 0.7];

      // WHEN: Calculating effect size (pooled std dev is 0)
      const effectSize = comparator.calculateEffectSize(scoresA, scoresB);

      // THEN: Returns 0
      expect(effectSize).toBe(0);
    });
  });

  // ==========================================================================
  // calculateConfidence
  // ==========================================================================

  describe('calculateConfidence', () => {
    it('should return higher confidence for larger sample sizes', () => {
      // GIVEN: Two sets of results with different sample sizes
      const smallSet = makeResultSet(3, { reasoningQuality: 0.8 });
      const largeSet = makeResultSet(50, { reasoningQuality: 0.8 });

      // WHEN: Calculating confidence for small vs large
      const smallConfidence = comparator.calculateConfidence(smallSet, smallSet);
      const largeConfidence = comparator.calculateConfidence(largeSet, largeSet);

      // THEN: Larger sample size produces higher confidence
      expect(largeConfidence).toBeGreaterThan(smallConfidence);
    });

    it('should return higher confidence for lower variance', () => {
      // GIVEN: One set with low variance, one with high variance
      const lowVarianceResults = makeResultSet(10, { reasoningQuality: 0.8 });
      const highVarianceResults = Array.from({ length: 10 }, (_, i) =>
        makeTestCaseResult({
          testId: `hv-${i}`,
          reasoningQuality: i % 2 === 0 ? 0.2 : 0.95,
        }),
      );

      // WHEN: Calculating confidence for both
      const lowVarConfidence = comparator.calculateConfidence(lowVarianceResults, lowVarianceResults);
      const highVarConfidence = comparator.calculateConfidence(highVarianceResults, highVarianceResults);

      // THEN: Lower variance produces higher confidence
      expect(lowVarConfidence).toBeGreaterThan(highVarConfidence);
    });

    it('should return value between 0 and 1', () => {
      // GIVEN: Arbitrary result sets of various sizes
      const resultsA = makeResultSet(7, { reasoningQuality: 0.75 });
      const resultsB = makeResultSet(12, { reasoningQuality: 0.85 });

      // WHEN: Calculating confidence
      const confidence = comparator.calculateConfidence(resultsA, resultsB);

      // THEN: Confidence is clamped to [0, 1]
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should return 0 for empty result sets', () => {
      // GIVEN: Empty result arrays
      const empty: TestCaseResult[] = [];

      // WHEN: Calculating confidence
      const confidence = comparator.calculateConfidence(empty, empty);

      // THEN: Returns 0
      expect(confidence).toBe(0);
    });
  });

  // ==========================================================================
  // compareFromResults
  // ==========================================================================

  describe('compareFromResults', () => {
    it('should declare winner when effect size exceeds threshold', () => {
      // GIVEN: Version B is substantially better than A
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0' });
      const { resultsA, resultsB } = makeMatchedResultSets(
        10,
        { reasoningQuality: 0.4, passed: false },
        { reasoningQuality: 0.95, passed: true },
      );

      // WHEN: Comparing
      const result = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);

      // THEN: B should be declared winner
      expect(result.winner).toBe('B');
      expect(result.comparison.isSignificant).toBe(true);
    });

    it('should return null winner when difference is not significant', () => {
      // GIVEN: Both versions perform nearly identically
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v1.0.1' });
      const { resultsA, resultsB } = makeMatchedResultSets(
        10,
        { reasoningQuality: 0.85 },
        { reasoningQuality: 0.85 },
      );

      // WHEN: Comparing
      const result = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);

      // THEN: No winner declared
      expect(result.winner).toBeNull();
      expect(result.comparison.isSignificant).toBe(false);
    });

    it('should match test cases by testId for per-test comparison', () => {
      // GIVEN: Two result sets with shared and unshared testIds
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0' });

      const resultsA = [
        makeTestCaseResult({ testId: 'shared-1', reasoningQuality: 0.7 }),
        makeTestCaseResult({ testId: 'shared-2', reasoningQuality: 0.8 }),
        makeTestCaseResult({ testId: 'only-in-A', reasoningQuality: 0.9 }),
      ];
      const resultsB = [
        makeTestCaseResult({ testId: 'shared-1', reasoningQuality: 0.75 }),
        makeTestCaseResult({ testId: 'shared-2', reasoningQuality: 0.85 }),
        makeTestCaseResult({ testId: 'only-in-B', reasoningQuality: 0.6 }),
      ];

      // WHEN: Comparing
      const result = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);

      // THEN: Only shared testIds appear in per-test comparisons
      expect(result.testCaseComparisons).toHaveLength(2);
      const comparedIds = result.testCaseComparisons.map(c => c.testId);
      expect(comparedIds).toContain('shared-1');
      expect(comparedIds).toContain('shared-2');
      expect(comparedIds).not.toContain('only-in-A');
      expect(comparedIds).not.toContain('only-in-B');
    });

    it('should correctly compute passRateDiff', () => {
      // GIVEN: Version A has 40% pass rate, Version B has 80%
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0' });

      const resultsA = [
        ...makeResultSet(2, { passed: true, reasoningQuality: 0.9 }, 'pa'),
        ...makeResultSet(3, { passed: false, reasoningQuality: 0.3 }, 'fa'),
      ];
      const resultsB = [
        ...makeResultSet(4, { passed: true, reasoningQuality: 0.9 }, 'pb'),
        ...makeResultSet(1, { passed: false, reasoningQuality: 0.3 }, 'fb'),
      ];

      // WHEN: Comparing
      const result = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);

      // THEN: passRateDiff = B.passRate - A.passRate = 0.8 - 0.4 = 0.4
      expect(result.comparison.passRateDiff).toBeCloseTo(0.4, 5);
    });

    it('should correctly compute scoreDiff and reasoningQualityDiff', () => {
      // GIVEN: Known reasoning quality values
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0' });

      const resultsA = makeResultSet(5, { reasoningQuality: 0.6 });
      const resultsB = makeResultSet(5, { reasoningQuality: 0.9 });

      // WHEN: Comparing
      const result = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);

      // THEN: scoreDiff = avgB - avgA = 0.9 - 0.6 = 0.3
      expect(result.comparison.scoreDiff).toBeCloseTo(0.3, 5);
      expect(result.comparison.reasoningQualityDiff).toBeCloseTo(0.3, 5);
    });

    it('should set isSignificant=false when fewer than minTestCases matched', () => {
      // GIVEN: Comparator with minTestCases=5, but only 3 results provided
      const comparatorStrict = createVersionComparator({ minTestCases: 5 });
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0' });

      const resultsA = makeResultSet(3, { reasoningQuality: 0.4 });
      const resultsB = makeResultSet(3, { reasoningQuality: 0.95 });

      // WHEN: Comparing with insufficient sample size
      const result = comparatorStrict.compareFromResults(versionA, resultsA, versionB, resultsB);

      // THEN: isSignificant is false despite large effect size
      expect(result.comparison.isSignificant).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('should include comparisonId and timestamp in result', () => {
      // GIVEN: Any two versions
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0' });
      const results = makeResultSet(5);

      // WHEN: Comparing
      const result = comparator.compareFromResults(versionA, results, versionB, results);

      // THEN: Metadata is populated
      expect(result.comparisonId).toMatch(/^cmp-/);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // compare
  // ==========================================================================

  describe('compare', () => {
    it('should accept SkillValidationOutcome objects and delegate to compareFromResults', () => {
      // GIVEN: Two SkillValidationOutcome objects
      const versionA = makeSkillVersion({ versionId: 'current', skillName: 'auth-skill' });
      const versionB = makeSkillVersion({ versionId: 'proposed', skillName: 'auth-skill' });

      const { resultsA, resultsB } = makeMatchedResultSets(
        6,
        { reasoningQuality: 0.5, passed: false },
        { reasoningQuality: 0.95, passed: true },
      );

      const outcomeA = makeOutcome(resultsA);
      const outcomeB = makeOutcome(resultsB);

      // WHEN: Using the compare method with outcomes
      const result = comparator.compare(versionA, versionB, { a: outcomeA, b: outcomeB });

      // THEN: Returns a valid VersionComparisonResult
      expect(result.versionA.testCaseResults).toEqual(resultsA);
      expect(result.versionB.testCaseResults).toEqual(resultsB);
      expect(result.winner).toBeDefined(); // null or 'A' or 'B'
    });

    it('should preserve version metadata in results', () => {
      // GIVEN: Versions with metadata
      const versionA = makeSkillVersion({
        versionId: 'v1.0.0',
        skillName: 'security-testing',
        metadata: { author: 'alice', commit: 'abc123' },
      });
      const versionB = makeSkillVersion({
        versionId: 'v2.0.0',
        skillName: 'security-testing',
        metadata: { author: 'bob', commit: 'def456' },
      });

      const results = makeResultSet(5);
      const outcomeA = makeOutcome(results);
      const outcomeB = makeOutcome(results);

      // WHEN: Comparing
      const result = comparator.compare(versionA, versionB, { a: outcomeA, b: outcomeB });

      // THEN: Version metadata is preserved in the result
      expect(result.versionA.version.versionId).toBe('v1.0.0');
      expect(result.versionA.version.metadata).toEqual({ author: 'alice', commit: 'abc123' });
      expect(result.versionB.version.versionId).toBe('v2.0.0');
      expect(result.versionB.version.metadata).toEqual({ author: 'bob', commit: 'def456' });
    });
  });

  // ==========================================================================
  // generateSummary
  // ==========================================================================

  describe('generateSummary', () => {
    it('should mention winner name when there is one', () => {
      // GIVEN: A comparison result where B wins
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0' });
      const { resultsA, resultsB } = makeMatchedResultSets(
        10,
        { reasoningQuality: 0.3, passed: false },
        { reasoningQuality: 0.95, passed: true },
      );

      const result = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);

      // WHEN: Generating summary
      const summary = comparator.generateSummary(result);

      // THEN: Summary mentions the winning version name
      expect(summary).toContain('v2.0.0');
      expect(summary).toContain('winner');
    });

    it('should indicate no significant difference when winner is null', () => {
      // GIVEN: A comparison result with no winner
      const versionA = makeSkillVersion({ versionId: 'v1.0.0' });
      const versionB = makeSkillVersion({ versionId: 'v1.0.1' });
      const { resultsA, resultsB } = makeMatchedResultSets(
        10,
        { reasoningQuality: 0.85 },
        { reasoningQuality: 0.85 },
      );

      const result = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);

      // WHEN: Generating summary
      const summary = comparator.generateSummary(result);

      // THEN: Summary indicates no significant difference
      expect(summary).toContain('No significant difference');
    });

    it('should include pass rate and confidence information', () => {
      // GIVEN: Any comparison result
      const versionA = makeSkillVersion({ versionId: 'alpha' });
      const versionB = makeSkillVersion({ versionId: 'beta' });
      const results = makeResultSet(6, { reasoningQuality: 0.8 });

      const result = comparator.compareFromResults(versionA, results, versionB, results);

      // WHEN: Generating summary
      const summary = comparator.generateSummary(result);

      // THEN: Summary includes pass rate and confidence data
      expect(summary).toContain('Pass rate');
      expect(summary).toContain('Confidence');
    });
  });

  // ==========================================================================
  // formatReport
  // ==========================================================================

  describe('formatReport', () => {
    let comparisonResult: VersionComparisonResult;

    beforeEach(() => {
      const versionA = makeSkillVersion({ versionId: 'v1.0.0', skillName: 'auth-skill' });
      const versionB = makeSkillVersion({ versionId: 'v2.0.0', skillName: 'auth-skill' });
      const { resultsA, resultsB } = makeMatchedResultSets(
        8,
        { reasoningQuality: 0.6, passed: true, executionTimeMs: 100 },
        { reasoningQuality: 0.9, passed: true, executionTimeMs: 80 },
      );

      comparisonResult = comparator.compareFromResults(versionA, resultsA, versionB, resultsB);
    });

    it('should produce valid markdown with headers', () => {
      // WHEN: Formatting the report
      const report = comparator.formatReport(comparisonResult);

      // THEN: Contains markdown headers
      expect(report).toContain('# Skill Version Comparison Report');
      expect(report).toContain('## Summary');
      expect(report).toContain('## Metrics');
      expect(report).toContain('## Statistics');
    });

    it('should include metrics table', () => {
      // WHEN: Formatting the report
      const report = comparator.formatReport(comparisonResult);

      // THEN: Contains metric rows in the table
      expect(report).toContain('| Pass Rate |');
      expect(report).toContain('| Avg Score |');
      expect(report).toContain('| Reasoning Quality |');
      expect(report).toContain('| Avg Execution (ms) |');
      expect(report).toContain('| Total Tokens |');
    });

    it('should include per-test comparison section', () => {
      // WHEN: Formatting the report
      const report = comparator.formatReport(comparisonResult);

      // THEN: Contains per-test comparison table
      expect(report).toContain('## Per-Test Comparison');
      expect(report).toContain('| Test ID |');
    });

    it('should include comparison metadata', () => {
      // WHEN: Formatting the report
      const report = comparator.formatReport(comparisonResult);

      // THEN: Contains comparison ID, skill name, and date
      expect(report).toContain(comparisonResult.comparisonId);
      expect(report).toContain('auth-skill');
      expect(report).toContain('**Winner:**');
    });

    it('should include statistics section with effect size and significance', () => {
      // WHEN: Formatting the report
      const report = comparator.formatReport(comparisonResult);

      // THEN: Contains statistics
      expect(report).toContain("Effect Size (Cohen's d)");
      expect(report).toContain('Significant');
      expect(report).toContain('Confidence');
    });
  });
});

describe('createVersionComparator', () => {
  it('should create a VersionComparator instance with default config', () => {
    // WHEN: Creating via factory
    const comparator = createVersionComparator();

    // THEN: Returns a VersionComparator
    expect(comparator).toBeInstanceOf(VersionComparator);
  });

  it('should accept custom configuration', () => {
    // WHEN: Creating with custom config
    const comparator = createVersionComparator({
      minTestCases: 10,
      significanceThreshold: 0.1,
      parallel: false,
    });

    // THEN: Instance is created (config is private, verify via behavior)
    expect(comparator).toBeInstanceOf(VersionComparator);

    // Verify config takes effect: with minTestCases=10 and only 5 results, not significant
    const vA = { versionId: 'a', skillName: 's', skillPath: '/s' };
    const vB = { versionId: 'b', skillName: 's', skillPath: '/s' };
    const resultsA = Array.from({ length: 5 }, (_, i) => ({
      testId: `t-${i}`, passed: false, expectedPatterns: [], actualPatterns: [],
      reasoningQuality: 0.2,
    })) as TestCaseResult[];
    const resultsB = Array.from({ length: 5 }, (_, i) => ({
      testId: `t-${i}`, passed: true, expectedPatterns: [], actualPatterns: [],
      reasoningQuality: 0.95,
    })) as TestCaseResult[];

    const result = comparator.compareFromResults(vA, resultsA, vB, resultsB);
    expect(result.comparison.isSignificant).toBe(false);
  });
});
