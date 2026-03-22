/**
 * Multi-Path Consensus Reasoning Validator Unit Tests - Task 4.5
 *
 * Tests for:
 * - Three independent reasoning paths generated per problem with diverse conclusions
 * - Syndrome extraction identifies disagreements between paths
 * - Error correction resolves disagreements by weighted or majority vote
 * - Validation of corrected reasoning chains
 * - All paths agreeing (no correction needed)
 * - One path diverging (correction applied)
 * - All paths diverging (low confidence result)
 * - Weighted voting: high-confidence minority path influence
 * - Majority voting fallback mode
 * - Factory functions and convenience API
 */

import { describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
  ReasoningQEC,
  createReasoningQEC,
  processReasoning,
  type ReasoningProblem,
  type ReasoningPath,
  type ReasoningStep,
  type Syndrome,
  type CorrectedReasoning,
  type ValidationResult,
  DEFAULT_QEC_CONFIG,
} from '../../../src/coordination/reasoning-qec';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test reasoning problem.
 */
function createTestProblem(
  overrides: Partial<ReasoningProblem> = {},
): ReasoningProblem {
  return {
    type: 'test-generation',
    context: { filePath: 'src/service.ts', coverage: 0.75 },
    steps: [
      'Analyze function signatures',
      'Identify edge cases',
      'Generate assertions',
    ],
    ...overrides,
  };
}

/**
 * Create paths where all agree on conclusions.
 */
function createAgreementPaths(): ReasoningPath[] {
  const sharedConclusion = 'Functions require null checks';

  return [0, 1, 2].map(id => ({
    id,
    steps: [
      {
        index: 0,
        description: 'Analyze inputs',
        conclusion: 'Inputs may be null',
        evidence: ['param x has no type guard'],
      },
      {
        index: 1,
        description: 'Check boundaries',
        conclusion: 'Need boundary tests',
        evidence: ['range: 0-100 not validated'],
      },
    ],
    conclusion: sharedConclusion,
    confidence: 0.9,
  }));
}

/**
 * Create paths where one path diverges at step 1.
 */
function createOnePathDivergingPaths(): ReasoningPath[] {
  return [
    {
      id: 0,
      steps: [
        {
          index: 0,
          description: 'Analyze inputs',
          conclusion: 'Inputs are validated',
          evidence: ['type guards present'],
        },
        {
          index: 1,
          description: 'Check error handling',
          conclusion: 'Error handling is adequate',
          evidence: ['try-catch blocks found'],
        },
      ],
      conclusion: 'Code is safe',
      confidence: 0.85,
    },
    {
      id: 1,
      steps: [
        {
          index: 0,
          description: 'Analyze inputs',
          conclusion: 'Inputs are validated',
          evidence: ['type guards present'],
        },
        {
          index: 1,
          description: 'Check error handling',
          conclusion: 'Error handling is adequate',
          evidence: ['error boundaries found'],
        },
      ],
      conclusion: 'Code is safe',
      confidence: 0.80,
    },
    {
      id: 2,
      steps: [
        {
          index: 0,
          description: 'Analyze inputs',
          conclusion: 'Inputs are validated',
          evidence: ['validation layer exists'],
        },
        {
          index: 1,
          description: 'Check error handling',
          conclusion: 'Error handling is MISSING',
          evidence: ['no catch blocks'],
        },
      ],
      conclusion: 'Code has issues',
      confidence: 0.70,
    },
  ];
}

/**
 * Create paths where all three paths diverge at every step.
 */
function createAllDivergingPaths(): ReasoningPath[] {
  return [
    {
      id: 0,
      steps: [
        {
          index: 0,
          description: 'Analyze risk',
          conclusion: 'Low risk',
          evidence: ['no public API exposure'],
        },
        {
          index: 1,
          description: 'Assess impact',
          conclusion: 'Minimal impact',
          evidence: ['isolated module'],
        },
      ],
      conclusion: 'No action needed',
      confidence: 0.4,
    },
    {
      id: 1,
      steps: [
        {
          index: 0,
          description: 'Analyze risk',
          conclusion: 'Medium risk',
          evidence: ['internal API used by 3 modules'],
        },
        {
          index: 1,
          description: 'Assess impact',
          conclusion: 'Moderate impact',
          evidence: ['affects auth flow'],
        },
      ],
      conclusion: 'Monitor closely',
      confidence: 0.35,
    },
    {
      id: 2,
      steps: [
        {
          index: 0,
          description: 'Analyze risk',
          conclusion: 'High risk',
          evidence: ['exposed to external users'],
        },
        {
          index: 1,
          description: 'Assess impact',
          conclusion: 'Severe impact',
          evidence: ['data breach possible'],
        },
      ],
      conclusion: 'Immediate fix required',
      confidence: 0.3,
    },
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe('ReasoningQEC', () => {
  let qec: ReasoningQEC;

  beforeEach(() => {
    qec = new ReasoningQEC();
  });

  afterEach(() => {
    // Reset state to prevent leaks between tests
  });

  // ==========================================================================
  // Path Generation
  // ==========================================================================

  describe('generatePaths', () => {
    it('should generate at least 3 independent reasoning paths', () => {
      const problem = createTestProblem();
      const paths = qec.generatePaths(problem);

      expect(paths).toHaveLength(3);
      expect(paths[0].id).toBe(0);
      expect(paths[1].id).toBe(1);
      expect(paths[2].id).toBe(2);
    });

    it('should generate one step per problem step for each path', () => {
      const problem = createTestProblem({
        steps: ['Step A', 'Step B', 'Step C', 'Step D'],
      });
      const paths = qec.generatePaths(problem);

      for (const path of paths) {
        expect(path.steps).toHaveLength(4);
        path.steps.forEach((step, i) => {
          expect(step.index).toBe(i);
        });
      }
    });

    it('should use domain-specific perspectives for known problem types', () => {
      const securityProblem = createTestProblem({
        type: 'security-audit',
        steps: ['Analyze threats'],
      });
      const paths = qec.generatePaths(securityProblem);

      // Security audit perspectives: threat-modeling, attack-surface, defense-in-depth
      expect(paths[0].steps[0].description).toContain('threat-modeling');
      expect(paths[1].steps[0].description).toContain('attack-surface');
      expect(paths[2].steps[0].description).toContain('defense-in-depth');
    });

    it('should use default perspectives for unknown problem types', () => {
      const unknownProblem = createTestProblem({
        type: 'unknown-type',
        steps: ['Do something'],
      });
      const paths = qec.generatePaths(unknownProblem);

      expect(paths[0].steps[0].description).toContain('analytical');
      expect(paths[1].steps[0].description).toContain('empirical');
      expect(paths[2].steps[0].description).toContain('heuristic');
    });

    it('should include evidence in each step', () => {
      const problem = createTestProblem({
        context: { severity: 'high', file: 'auth.ts' },
        steps: ['Analyze'],
      });
      const paths = qec.generatePaths(problem);

      for (const path of paths) {
        expect(path.steps[0].evidence.length).toBeGreaterThan(0);
      }
    });

    it('should assign confidence to each path', () => {
      const problem = createTestProblem();
      const paths = qec.generatePaths(problem);

      for (const path of paths) {
        expect(path.confidence).toBeGreaterThan(0);
        expect(path.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should generate paths with genuinely diverse conclusions per perspective', () => {
      const problem = createTestProblem({
        steps: ['Evaluate risk'],
      });
      const paths = qec.generatePaths(problem);

      // Each path should have a different conclusion (different perspectives)
      const conclusions = new Set(paths.map(p => p.conclusion));
      expect(conclusions.size).toBe(3);

      // Conclusions should NOT just differ by a path-N suffix
      for (const path of paths) {
        expect(path.conclusion).not.toMatch(/\[path-\d+\]$/);
      }

      // Step conclusions should contain the perspective name
      expect(paths[0].steps[0].conclusion).toContain('specification-driven');
      expect(paths[1].steps[0].conclusion).toContain('boundary-analysis');
      expect(paths[2].steps[0].conclusion).toContain('mutation-testing');
    });

    it('should produce different focus areas per path based on context keys', () => {
      const problem = createTestProblem({
        context: { alpha: 1, beta: 2 },
        steps: ['Analyze'],
      });
      const paths = qec.generatePaths(problem);

      // Path 0 focuses on first key, path 1 on last key, path 2 cross-references
      const c0 = paths[0].steps[0].conclusion;
      const c1 = paths[1].steps[0].conclusion;
      const c2 = paths[2].steps[0].conclusion;

      expect(c0).toContain('Focused on alpha');
      expect(c1).toContain('Focused on beta');
      expect(c2).toContain('Cross-referencing alpha and beta');

      // All three must be genuinely different strings
      expect(c0).not.toBe(c1);
      expect(c1).not.toBe(c2);
      expect(c0).not.toBe(c2);
    });

    it('should respect minPaths config', () => {
      const qec5 = new ReasoningQEC({ minPaths: 5 });
      const problem = createTestProblem();
      const paths = qec5.generatePaths(problem);

      expect(paths.length).toBe(5);
    });
  });

  // ==========================================================================
  // Syndrome Extraction
  // ==========================================================================

  describe('extractSyndromes', () => {
    it('should return empty array when all paths agree', () => {
      const paths = createAgreementPaths();
      const syndromes = qec.extractSyndromes(paths);

      expect(syndromes).toHaveLength(0);
    });

    it('should detect disagreement when one path diverges', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      // Should find syndromes at step 1 and at conclusion level
      expect(syndromes.length).toBeGreaterThan(0);

      const step1Syndrome = syndromes.find(s => s.stepIndex === 1);
      expect(step1Syndrome).toBeDefined();
      expect(step1Syndrome!.disagreements.length).toBeGreaterThan(1);
    });

    it('should classify one-path divergence as minor severity', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      // With 3 paths and 2 agreeing, the step-level syndrome should be minor
      const step1Syndrome = syndromes.find(s => s.stepIndex === 1);
      expect(step1Syndrome).toBeDefined();
      expect(step1Syndrome!.severity).toBe('minor');
    });

    it('should detect all disagreements when all paths diverge', () => {
      const paths = createAllDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      // Every step and the conclusion should have syndromes
      expect(syndromes.length).toBeGreaterThanOrEqual(2);
    });

    it('should classify all-divergent syndromes as critical', () => {
      const paths = createAllDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const criticalSyndromes = syndromes.filter(s => s.severity === 'critical');
      expect(criticalSyndromes.length).toBeGreaterThan(0);
    });

    it('should include conclusion-level syndrome when conclusions disagree', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const conclusionSyndrome = syndromes.find(s => s.stepIndex === -1);
      expect(conclusionSyndrome).toBeDefined();
    });

    it('should not include conclusion-level syndrome when all conclude the same', () => {
      const paths = createAgreementPaths();
      const syndromes = qec.extractSyndromes(paths);

      const conclusionSyndrome = syndromes.find(s => s.stepIndex === -1);
      expect(conclusionSyndrome).toBeUndefined();
    });

    it('should handle single-path input gracefully', () => {
      const syndromes = qec.extractSyndromes([createAgreementPaths()[0]]);
      expect(syndromes).toHaveLength(0);
    });

    it('should handle empty input gracefully', () => {
      const syndromes = qec.extractSyndromes([]);
      expect(syndromes).toHaveLength(0);
    });

    it('should include all path IDs in disagreement entries', () => {
      const paths = createAllDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const step0 = syndromes.find(s => s.stepIndex === 0);
      expect(step0).toBeDefined();

      const pathIds = step0!.disagreements.map(d => d.pathId).sort();
      expect(pathIds).toEqual([0, 1, 2]);
    });
  });

  // ==========================================================================
  // Error Correction
  // ==========================================================================

  describe('correctErrors', () => {
    it('should produce corrected reasoning with no corrections when paths agree', () => {
      const paths = createAgreementPaths();
      const syndromes: Syndrome[] = [];

      const corrected = qec.correctErrors(paths, syndromes);

      expect(corrected.corrections).toHaveLength(0);
      expect(corrected.syndromeCount).toBe(0);
      expect(corrected.steps).toHaveLength(2);
      expect(corrected.confidence).toBeGreaterThan(0.5);
    });

    it('should apply weighted vote correction when one path diverges', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const corrected = qec.correctErrors(paths, syndromes);

      // Step 1 should be corrected to the weighted-majority conclusion
      // Paths 0 (0.85) and 1 (0.80) agree on 'Error handling is adequate' = 1.65
      // Path 2 (0.70) says 'Error handling is MISSING' = 0.70
      const step1 = corrected.steps.find(s => s.index === 1);
      expect(step1).toBeDefined();
      expect(step1!.conclusion).toBe('Error handling is adequate');
    });

    it('should record corrections applied', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const corrected = qec.correctErrors(paths, syndromes);

      // At least one correction should have been applied
      // (Path 0 agrees with majority at step 1, so correction is for the diverging path)
      expect(corrected.syndromeCount).toBeGreaterThan(0);
    });

    it('should maintain step ordering in corrected output', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const corrected = qec.correctErrors(paths, syndromes);

      for (let i = 0; i < corrected.steps.length; i++) {
        expect(corrected.steps[i].index).toBe(i);
      }
    });

    it('should handle all-divergent paths by selecting highest-count conclusion', () => {
      const paths = createAllDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const corrected = qec.correctErrors(paths, syndromes);

      // Should still produce a result, even with low confidence
      expect(corrected.steps.length).toBeGreaterThan(0);
      expect(corrected.conclusion).toBeTruthy();
    });

    it('should reduce confidence when syndromes are present', () => {
      const agreePaths = createAgreementPaths();
      const agreeResult = qec.correctErrors(agreePaths, []);

      const divergePaths = createAllDivergingPaths();
      const divergeSyndromes = qec.extractSyndromes(divergePaths);
      const divergeResult = qec.correctErrors(divergePaths, divergeSyndromes);

      expect(divergeResult.confidence).toBeLessThan(agreeResult.confidence);
    });

    it('should merge evidence from all paths for corrected steps', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const corrected = qec.correctErrors(paths, syndromes);

      // Corrected step 1 should have evidence merged from all paths
      const step1 = corrected.steps.find(s => s.index === 1);
      expect(step1).toBeDefined();
      expect(step1!.evidence.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty paths gracefully', () => {
      const corrected = qec.correctErrors([], []);

      expect(corrected.steps).toHaveLength(0);
      expect(corrected.conclusion).toBe('');
      expect(corrected.confidence).toBe(0);
    });

    it('should set syndromeCount from provided syndromes', () => {
      const paths = createOnePathDivergingPaths();
      const syndromes = qec.extractSyndromes(paths);

      const corrected = qec.correctErrors(paths, syndromes);

      expect(corrected.syndromeCount).toBe(syndromes.length);
    });

    it('should use simple count-based voting when votingMethod is majority', () => {
      const majorityQec = new ReasoningQEC({ votingMethod: 'majority' });
      const paths = createOnePathDivergingPaths();
      const syndromes = majorityQec.extractSyndromes(paths);

      const corrected = majorityQec.correctErrors(paths, syndromes);

      // With majority voting, 2 out of 3 paths agree on 'Error handling is adequate'
      const step1 = corrected.steps.find(s => s.index === 1);
      expect(step1).toBeDefined();
      expect(step1!.conclusion).toBe('Error handling is adequate');

      // The conclusion should also resolve to the 2-path majority
      expect(corrected.conclusion).toBe('Code is safe');
    });

    it('should give high-confidence minority path more influence with weighted voting', () => {
      // Construct a scenario where one high-confidence path disagrees with
      // two low-confidence paths. With weighted voting, the high-confidence
      // minority should win.
      const paths: ReasoningPath[] = [
        {
          id: 0,
          steps: [
            {
              index: 0,
              description: 'Analyze',
              conclusion: 'Safe',
              evidence: ['basic check'],
            },
          ],
          conclusion: 'No risk',
          confidence: 0.2, // Very low confidence
        },
        {
          id: 1,
          steps: [
            {
              index: 0,
              description: 'Analyze',
              conclusion: 'Safe',
              evidence: ['surface check'],
            },
          ],
          conclusion: 'No risk',
          confidence: 0.15, // Very low confidence
        },
        {
          id: 2,
          steps: [
            {
              index: 0,
              description: 'Analyze',
              conclusion: 'Vulnerable',
              evidence: ['deep analysis', 'CVE match', 'exploit confirmed'],
            },
          ],
          conclusion: 'Critical vulnerability',
          confidence: 0.95, // High confidence
        },
      ];

      // Weighted voting: 'Safe' = 0.2 + 0.15 = 0.35, 'Vulnerable' = 0.95
      // Vulnerable wins with weighted voting
      const weightedQec = new ReasoningQEC({ votingMethod: 'weighted' });
      const syndromes = weightedQec.extractSyndromes(paths);
      const corrected = weightedQec.correctErrors(paths, syndromes);

      expect(corrected.steps[0].conclusion).toBe('Vulnerable');
      expect(corrected.conclusion).toBe('Critical vulnerability');

      // With majority voting, 'Safe' wins (2 vs 1)
      const majorityQec = new ReasoningQEC({ votingMethod: 'majority' });
      const majSyndromes = majorityQec.extractSyndromes(paths);
      const majCorrected = majorityQec.correctErrors(paths, majSyndromes);

      expect(majCorrected.steps[0].conclusion).toBe('Safe');
      expect(majCorrected.conclusion).toBe('No risk');
    });

    it('should include "Weighted vote" in correction reason with weighted voting', () => {
      const paths: ReasoningPath[] = [
        {
          id: 0,
          steps: [
            { index: 0, description: 'S', conclusion: 'A', evidence: ['e'] },
          ],
          conclusion: 'X',
          confidence: 0.3,
        },
        {
          id: 1,
          steps: [
            { index: 0, description: 'S', conclusion: 'B', evidence: ['e'] },
          ],
          conclusion: 'Y',
          confidence: 0.9,
        },
        {
          id: 2,
          steps: [
            { index: 0, description: 'S', conclusion: 'B', evidence: ['e'] },
          ],
          conclusion: 'Y',
          confidence: 0.8,
        },
      ];

      const syndromes = qec.extractSyndromes(paths);
      const corrected = qec.correctErrors(paths, syndromes);

      // Path 0 has conclusion A, but B wins; correction should be recorded
      const correction = corrected.corrections.find(c => c.stepIndex === 0);
      expect(correction).toBeDefined();
      expect(correction!.reason).toContain('Weighted vote');
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  describe('validate', () => {
    it('should validate a high-confidence corrected reasoning as valid', () => {
      const corrected: CorrectedReasoning = {
        steps: [
          {
            index: 0,
            description: 'Analyze inputs',
            conclusion: 'Inputs validated',
            evidence: ['type guards present'],
          },
        ],
        conclusion: 'Code is safe',
        confidence: 0.9,
        corrections: [],
        syndromeCount: 0,
      };

      const result = qec.validate(corrected);

      expect(result.valid).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.issues).toHaveLength(0);
    });

    it('should flag low confidence as an issue', () => {
      const corrected: CorrectedReasoning = {
        steps: [
          {
            index: 0,
            description: 'Unclear analysis',
            conclusion: 'Maybe safe',
            evidence: ['some data'],
          },
        ],
        conclusion: 'Uncertain',
        confidence: 0.2,
        corrections: [],
        syndromeCount: 3,
      };

      const result = qec.validate(corrected);

      expect(result.valid).toBe(false);
      const lowConfIssue = result.issues.find(i => i.type === 'low-confidence');
      expect(lowConfIssue).toBeDefined();
    });

    it('should flag steps with no evidence', () => {
      const corrected: CorrectedReasoning = {
        steps: [
          {
            index: 0,
            description: 'Empty analysis',
            conclusion: 'No idea',
            evidence: [],
          },
        ],
        conclusion: 'Guessing',
        confidence: 0.8,
        corrections: [],
        syndromeCount: 0,
      };

      const result = qec.validate(corrected);

      expect(result.valid).toBe(false);
      const evidenceIssue = result.issues.find(i => i.type === 'inconsistent-evidence');
      expect(evidenceIssue).toBeDefined();
      expect(evidenceIssue!.stepIndex).toBe(0);
    });

    it('should flag all-divergent condition', () => {
      const corrected: CorrectedReasoning = {
        steps: [
          {
            index: 0,
            description: 'Divergent analysis',
            conclusion: 'Something',
            evidence: ['some evidence'],
          },
        ],
        conclusion: 'Best guess',
        confidence: 0.2,
        corrections: [
          {
            stepIndex: 0,
            original: 'A',
            corrected: 'B',
            reason: 'no clear majority (1/3)',
          },
        ],
        syndromeCount: 3,
      };

      const result = qec.validate(corrected);

      expect(result.valid).toBe(false);
      const divergentIssue = result.issues.find(i => i.type === 'all-divergent');
      expect(divergentIssue).toBeDefined();
    });

    it('should flag no-majority corrections', () => {
      const corrected: CorrectedReasoning = {
        steps: [
          {
            index: 0,
            description: 'Step',
            conclusion: 'C',
            evidence: ['e'],
          },
        ],
        conclusion: 'Result',
        confidence: 0.7,
        corrections: [
          {
            stepIndex: 0,
            original: 'A',
            corrected: 'C',
            reason: 'Selected highest weight (0.40/1.05), no clear majority',
          },
        ],
        syndromeCount: 1,
      };

      const result = qec.validate(corrected);

      expect(result.valid).toBe(false);
      const noMajorityIssue = result.issues.find(i => i.type === 'no-majority');
      expect(noMajorityIssue).toBeDefined();
    });

    it('should reduce confidence proportionally to issue count', () => {
      const corrected: CorrectedReasoning = {
        steps: [
          { index: 0, description: 'A', conclusion: 'A', evidence: [] },
          { index: 1, description: 'B', conclusion: 'B', evidence: [] },
        ],
        conclusion: 'Result',
        confidence: 0.3,
        corrections: [],
        syndromeCount: 2,
      };

      const result = qec.validate(corrected);

      // Multiple issues should reduce confidence
      expect(result.valid).toBe(false);
      expect(result.confidence).toBeLessThan(corrected.confidence);
    });

    it('should never return negative confidence', () => {
      const corrected: CorrectedReasoning = {
        steps: Array.from({ length: 20 }, (_, i) => ({
          index: i,
          description: `Step ${i}`,
          conclusion: `C${i}`,
          evidence: [],
        })),
        conclusion: 'Many issues',
        confidence: 0.1,
        corrections: [],
        syndromeCount: 10,
      };

      const result = qec.validate(corrected);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Full Pipeline (process)
  // ==========================================================================

  describe('process', () => {
    it('should run the full pipeline and return all intermediate results', () => {
      const problem = createTestProblem();
      const result = qec.process(problem);

      expect(result.paths).toBeDefined();
      expect(result.syndromes).toBeDefined();
      expect(result.corrected).toBeDefined();
      expect(result.validation).toBeDefined();

      expect(result.paths.length).toBeGreaterThanOrEqual(3);
      expect(result.corrected.steps.length).toBeGreaterThan(0);
    });

    it('should produce valid result for well-defined problems', () => {
      const problem = createTestProblem({
        type: 'defect-triage',
        context: { bugId: 'BUG-123', severity: 'high' },
        steps: ['Categorize', 'Prioritize'],
      });

      const result = qec.process(problem);

      expect(result.corrected.confidence).toBeGreaterThan(0);
      expect(result.corrected.steps).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe('configuration', () => {
    it('should use default config when none provided', () => {
      const config = qec.getConfig();

      expect(config.minPaths).toBe(DEFAULT_QEC_CONFIG.minPaths);
      expect(config.confidenceThreshold).toBe(DEFAULT_QEC_CONFIG.confidenceThreshold);
      expect(config.majorityThreshold).toBe(DEFAULT_QEC_CONFIG.majorityThreshold);
      expect(config.useNativeBackend).toBe(DEFAULT_QEC_CONFIG.useNativeBackend);
      expect(config.votingMethod).toBe('weighted');
    });

    it('should accept partial config overrides', () => {
      const custom = new ReasoningQEC({
        minPaths: 5,
        confidenceThreshold: 0.8,
      });

      const config = custom.getConfig();

      expect(config.minPaths).toBe(5);
      expect(config.confidenceThreshold).toBe(0.8);
      // Defaults preserved
      expect(config.majorityThreshold).toBe(DEFAULT_QEC_CONFIG.majorityThreshold);
    });

    it('should report native backend as unavailable by default', () => {
      // Before initialize(), native should not be available
      expect(qec.isNativeAvailable()).toBe(false);
    });
  });

  // ==========================================================================
  // Factory Functions
  // ==========================================================================

  describe('factory functions', () => {
    it('should create instance via createReasoningQEC', () => {
      const instance = createReasoningQEC({ minPaths: 4 });

      expect(instance).toBeInstanceOf(ReasoningQEC);
      expect(instance.getConfig().minPaths).toBe(4);
    });

    it('should run pipeline via processReasoning', () => {
      const problem = createTestProblem();
      const result = processReasoning(problem);

      expect(result.paths.length).toBeGreaterThanOrEqual(3);
      expect(result.corrected).toBeDefined();
      expect(result.validation).toBeDefined();
    });

    it('should pass config to processReasoning', () => {
      const problem = createTestProblem();
      const result = processReasoning(problem, { minPaths: 5 });

      expect(result.paths).toHaveLength(5);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle problem with zero steps', () => {
      const problem = createTestProblem({ steps: [] });
      const result = qec.process(problem);

      expect(result.paths).toHaveLength(3);
      for (const path of result.paths) {
        expect(path.steps).toHaveLength(0);
      }
      // Conclusions differ due to different perspectives, so a conclusion-level
      // syndrome is expected even with zero steps.
      const stepSyndromes = result.syndromes.filter(s => s.stepIndex >= 0);
      expect(stepSyndromes).toHaveLength(0);
    });

    it('should handle problem with single step', () => {
      const problem = createTestProblem({ steps: ['Only step'] });
      const result = qec.process(problem);

      expect(result.paths).toHaveLength(3);
      for (const path of result.paths) {
        expect(path.steps).toHaveLength(1);
      }
    });

    it('should handle problem with empty context', () => {
      const problem = createTestProblem({ context: {} });
      const result = qec.process(problem);

      expect(result.paths.length).toBeGreaterThanOrEqual(3);
      expect(result.corrected.steps.length).toBeGreaterThan(0);
    });

    it('should handle paths with different step counts', () => {
      const paths: ReasoningPath[] = [
        {
          id: 0,
          steps: [
            { index: 0, description: 'S0', conclusion: 'C0', evidence: ['e0'] },
            { index: 1, description: 'S1', conclusion: 'C1', evidence: ['e1'] },
          ],
          conclusion: 'Final',
          confidence: 0.8,
        },
        {
          id: 1,
          steps: [
            { index: 0, description: 'S0', conclusion: 'C0', evidence: ['e0'] },
          ],
          conclusion: 'Final',
          confidence: 0.7,
        },
        {
          id: 2,
          steps: [
            { index: 0, description: 'S0', conclusion: 'C0', evidence: ['e0'] },
            { index: 1, description: 'S1', conclusion: 'C1', evidence: ['e1'] },
            { index: 2, description: 'S2', conclusion: 'C2', evidence: ['e2'] },
          ],
          conclusion: 'Final',
          confidence: 0.75,
        },
      ];

      const syndromes = qec.extractSyndromes(paths);
      const corrected = qec.correctErrors(paths, syndromes);

      // Should handle the varying lengths without crashing.
      // Steps only present in a single path with no syndrome and no data
      // in path 0 are omitted. Path 0 has 2 steps, so at least 2 are produced.
      expect(corrected.steps.length).toBeGreaterThanOrEqual(2);
      expect(corrected.conclusion).toBeTruthy();
    });
  });
});
