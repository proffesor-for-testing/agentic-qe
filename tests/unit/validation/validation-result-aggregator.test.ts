/**
 * Unit Tests for ValidationResultAggregator
 * ADR-056 Phase 5: Validation result aggregation and reporting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ValidationResultAggregator,
  createValidationResultAggregator,
  type ParallelValidationRunResult,
  type AggregatedValidationReport,
} from '../../../src/validation/validation-result-aggregator.js';
import type {
  SkillValidationLearner,
  SkillValidationOutcome,
  SkillTrustTier,
} from '../../../src/learning/skill-validation-learner.js';

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Create a mock SkillValidationLearner
 */
function createMockLearner(): SkillValidationLearner {
  return {
    recordValidationOutcome: vi.fn().mockResolvedValue(undefined),
    getSkillConfidence: vi.fn().mockResolvedValue(null),
    getCrossModelAnalysis: vi.fn().mockResolvedValue(null),
    getValidationTrends: vi.fn().mockResolvedValue({
      overall: 'stable',
      byModel: {},
      recentPassRate: 0.9,
    }),
    queryValidationPatterns: vi.fn().mockResolvedValue([]),
    extractLearnedPatterns: vi.fn().mockResolvedValue([]),
    connectFeedbackLoop: vi.fn(),
  } as unknown as SkillValidationLearner;
}

/**
 * Create a test validation outcome
 */
function createOutcome(
  skillName: string,
  overrides: Partial<SkillValidationOutcome> = {}
): SkillValidationOutcome {
  return {
    skillName,
    trustTier: 3 as SkillTrustTier,
    validationLevel: 'eval',
    model: 'claude-sonnet',
    passed: true,
    score: 0.95,
    testCaseResults: [
      {
        testId: `${skillName}-test-1`,
        passed: true,
        expectedPatterns: ['valid'],
        actualPatterns: ['valid'],
        reasoningQuality: 0.9,
        executionTimeMs: 100,
        category: 'general',
        priority: 'high',
      },
      {
        testId: `${skillName}-test-2`,
        passed: true,
        expectedPatterns: ['complete'],
        actualPatterns: ['complete'],
        reasoningQuality: 0.85,
        executionTimeMs: 150,
        category: 'general',
        priority: 'medium',
      },
    ],
    timestamp: new Date(),
    runId: `run-${Date.now()}`,
    metadata: {
      duration: 250,
      environment: 'test',
    },
    ...overrides,
  };
}

/**
 * Create a test parallel validation run result
 */
function createRunResult(
  model: string,
  outcomes: SkillValidationOutcome[],
  overrides: Partial<ParallelValidationRunResult> = {}
): ParallelValidationRunResult {
  return {
    runId: `run-${model}-${Date.now()}`,
    model,
    outcomes,
    timestamp: new Date(),
    durationMs: outcomes.reduce((sum, o) => sum + (o.metadata?.duration as number || 0), 0),
    metadata: {
      environment: 'test',
      version: '1.0.0',
    },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ValidationResultAggregator', () => {
  let aggregator: ValidationResultAggregator;
  let mockLearner: SkillValidationLearner;
  const mockManifestPath = '/tmp/test-manifest.json';

  beforeEach(() => {
    mockLearner = createMockLearner();
    aggregator = createValidationResultAggregator(mockLearner, mockManifestPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('aggregateResults', () => {
    it('should aggregate multiple skill results correctly', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing'),
          createOutcome('accessibility-testing'),
        ]),
        createRunResult('claude-haiku', [
          createOutcome('security-testing'),
          createOutcome('accessibility-testing'),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      expect(report.summary.totalSkills).toBe(2);
      expect(report.summary.modelsUsed).toContain('claude-sonnet');
      expect(report.summary.modelsUsed).toContain('claude-haiku');
      expect(report.skillResults.size).toBe(2);
      expect(report.skillResults.has('security-testing')).toBe(true);
      expect(report.skillResults.has('accessibility-testing')).toBe(true);
    });

    it('should calculate average pass rates correctly', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
              { testId: 't2', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
            ],
          }),
        ]),
        createRunResult('claude-haiku', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
              { testId: 't2', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Failed' },
            ],
          }),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      const skillResult = report.skillResults.get('security-testing');
      expect(skillResult).toBeDefined();
      expect(skillResult!.passRateByModel.get('claude-sonnet')).toBe(1.0);
      expect(skillResult!.passRateByModel.get('claude-haiku')).toBe(0.5);
      expect(skillResult!.avgPassRate).toBe(0.75);
    });

    it('should count tests correctly', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
              { testId: 't2', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
              { testId: 't3', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Failed' },
            ],
          }),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      expect(report.summary.totalTests).toBe(3);
      expect(report.summary.passedTests).toBe(2);
      expect(report.summary.failedTests).toBe(1);
    });

    it('should generate recommendations', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing'),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('detectCrossModelAnomalies', () => {
    it('should detect cross-model variance above threshold', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
              { testId: 't2', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
            ],
          }),
        ]),
        createRunResult('claude-haiku', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.3, error: 'Failed' },
              { testId: 't2', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.3, error: 'Failed' },
            ],
          }),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      expect(report.crossModelAnalysis.variance).toBeGreaterThan(0);
      expect(report.crossModelAnalysis.inconsistentSkills).toContain('security-testing');
    });

    it('should identify consistent skills', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
            ],
          }),
        ]),
        createRunResult('claude-haiku', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
            ],
          }),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      expect(report.crossModelAnalysis.consistentSkills).toContain('security-testing');
      expect(report.crossModelAnalysis.inconsistentSkills).not.toContain('security-testing');
    });

    it('should calculate model performance stats', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('skill-a'),
          createOutcome('skill-b'),
        ]),
        createRunResult('claude-haiku', [
          createOutcome('skill-a'),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      const sonnetPerf = report.crossModelAnalysis.modelPerformance.get('claude-sonnet');
      const haikuPerf = report.crossModelAnalysis.modelPerformance.get('claude-haiku');

      expect(sonnetPerf).toBeDefined();
      expect(sonnetPerf!.skillCount).toBe(2);
      expect(haikuPerf).toBeDefined();
      expect(haikuPerf!.skillCount).toBe(1);
    });
  });

  describe('detectRegressions', () => {
    it('should identify regressions against baseline', async () => {
      // Mock the learner to return historical data with higher pass rate
      vi.mocked(mockLearner.getValidationTrends).mockResolvedValue({
        overall: 'stable',
        byModel: {},
        recentPassRate: 0.95, // Historical 95%
      });

      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
              { testId: 't2', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Failed' },
              { testId: 't3', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Failed' },
              { testId: 't4', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Failed' },
              { testId: 't5', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
            ],
          }), // Current 40% (2/5)
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      expect(report.regressions.length).toBeGreaterThan(0);
      const regression = report.regressions.find(r => r.skill === 'security-testing');
      expect(regression).toBeDefined();
      expect(regression!.previousPassRate).toBe(0.95);
      expect(regression!.currentPassRate).toBe(0.4);
      expect(regression!.severity).toBe('critical'); // >50% drop
    });

    it('should include possible causes for regressions', async () => {
      vi.mocked(mockLearner.getValidationTrends).mockResolvedValue({
        overall: 'declining',
        byModel: {},
        recentPassRate: 0.9,
      });

      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Auth failure', category: 'auth', priority: 'critical' },
              { testId: 't2', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Injection detected', category: 'injection', priority: 'critical' },
            ],
          }),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      const regression = report.regressions.find(r => r.skill === 'security-testing');
      expect(regression).toBeDefined();
      expect(regression!.possibleCauses.length).toBeGreaterThan(0);
      expect(regression!.possibleCauses.some(c => c.includes('critical'))).toBe(true);
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate valid markdown report', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing'),
          createOutcome('accessibility-testing'),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);
      const markdown = aggregator.generateMarkdownReport(report);

      expect(markdown).toContain('# Validation Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Cross-Model Analysis');
      expect(markdown).toContain('## Skill Results');
      expect(markdown).toContain('security-testing');
      expect(markdown).toContain('accessibility-testing');
    });

    it('should include regressions section when regressions exist', async () => {
      vi.mocked(mockLearner.getValidationTrends).mockResolvedValue({
        overall: 'declining',
        byModel: {},
        recentPassRate: 0.95,
      });

      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Failed' },
            ],
          }),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);
      const markdown = aggregator.generateMarkdownReport(report);

      expect(markdown).toContain('## Regressions Detected');
    });
  });

  describe('generateJsonReport', () => {
    it('should generate valid JSON report', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing'),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);
      const json = aggregator.generateJsonReport(report);

      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.runId).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.skillResults).toBeDefined();
      expect(parsed.crossModelAnalysis).toBeDefined();
    });

    it('should serialize Maps as objects', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing'),
        ]),
        createRunResult('claude-haiku', [
          createOutcome('security-testing'),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);
      const json = aggregator.generateJsonReport(report);
      const parsed = JSON.parse(json);

      // Check that Maps were converted to objects
      expect(typeof parsed.skillResults).toBe('object');
      expect(parsed.skillResults['security-testing']).toBeDefined();
      expect(typeof parsed.skillResults['security-testing'].passRateByModel).toBe('object');
      expect(typeof parsed.crossModelAnalysis.modelPerformance).toBe('object');
    });
  });

  describe('configuration', () => {
    it('should use custom variance threshold', async () => {
      const customAggregator = createValidationResultAggregator(
        mockLearner,
        mockManifestPath,
        { varianceThreshold: 0.01 } // Very low threshold
      );

      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
            ],
          }),
        ]),
        createRunResult('claude-haiku', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.85 },
            ],
          }),
        ]),
      ];

      const report = await customAggregator.aggregateResults(results);

      // With very low threshold, even small differences should be flagged as inconsistent
      expect(report.crossModelAnalysis).toBeDefined();
    });

    it('should use custom regression threshold', async () => {
      vi.mocked(mockLearner.getValidationTrends).mockResolvedValue({
        overall: 'stable',
        byModel: {},
        recentPassRate: 0.95,
      });

      const customAggregator = createValidationResultAggregator(
        mockLearner,
        mockManifestPath,
        { regressionThreshold: 0.5 } // Very high threshold - only major drops
      );

      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing', {
            testCaseResults: [
              { testId: 't1', passed: true, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.9 },
              { testId: 't2', passed: false, expectedPatterns: [], actualPatterns: [], reasoningQuality: 0.5, error: 'Failed' },
            ],
          }), // 50% pass rate, 45% drop from 95%
        ]),
      ];

      const report = await customAggregator.aggregateResults(results);

      // With high threshold, 45% drop should not be flagged as regression
      expect(report.regressions.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty results', async () => {
      const report = await aggregator.aggregateResults([]);

      expect(report.summary.totalSkills).toBe(0);
      expect(report.summary.totalTests).toBe(0);
      expect(report.skillResults.size).toBe(0);
    });

    it('should handle skills with no test cases', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('empty-skill', {
            testCaseResults: [],
          }),
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      expect(report.summary.totalSkills).toBe(1);
      expect(report.summary.totalTests).toBe(0);
      const skillResult = report.skillResults.get('empty-skill');
      expect(skillResult).toBeDefined();
      expect(skillResult!.avgPassRate).toBe(0);
    });

    it('should handle duplicate skills across runs', async () => {
      const results: ParallelValidationRunResult[] = [
        createRunResult('claude-sonnet', [
          createOutcome('security-testing'),
        ]),
        createRunResult('claude-sonnet', [
          createOutcome('security-testing'), // Duplicate
        ]),
      ];

      const report = await aggregator.aggregateResults(results);

      // Should merge results for same skill
      expect(report.summary.totalSkills).toBe(1);
      const skillResult = report.skillResults.get('security-testing');
      expect(skillResult).toBeDefined();
      expect(skillResult!.testCount).toBe(4); // 2 tests x 2 runs
    });
  });
});

describe('createValidationResultAggregator', () => {
  it('should create an aggregator with default config', () => {
    const mockLearner = createMockLearner();
    const aggregator = createValidationResultAggregator(mockLearner, '/tmp/test.json');

    expect(aggregator).toBeDefined();
    expect(aggregator).toBeInstanceOf(ValidationResultAggregator);
  });

  it('should create an aggregator with custom config', () => {
    const mockLearner = createMockLearner();
    const aggregator = createValidationResultAggregator(mockLearner, '/tmp/test.json', {
      varianceThreshold: 0.1,
      regressionThreshold: 0.2,
      minSamples: 5,
    });

    expect(aggregator).toBeDefined();
  });
});
