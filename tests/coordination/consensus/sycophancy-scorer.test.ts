/**
 * Tests for SycophancyScorer - rubber-stamping detection in multi-agent consensus
 */

import { describe, it, expect } from 'vitest';
import {
  SycophancyScorer,
  createSycophancyScorer,
  type SycophancyLevel,
} from '../../../src/coordination/consensus/sycophancy-scorer.js';
import type { ModelVote } from '../../../src/coordination/consensus/interfaces.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createVote(overrides: Partial<ModelVote> = {}): ModelVote {
  return {
    modelId: overrides.modelId ?? 'model-1',
    agrees: overrides.agrees ?? true,
    assessment: overrides.assessment ?? 'confirmed',
    confidence: overrides.confidence ?? 0.85,
    reasoning: overrides.reasoning ?? 'This finding is valid based on code analysis.',
    executionTime: overrides.executionTime ?? 1500,
    votedAt: overrides.votedAt ?? new Date(),
    suggestions: overrides.suggestions,
    suggestedSeverity: overrides.suggestedSeverity,
    modelVersion: overrides.modelVersion,
    tokenUsage: overrides.tokenUsage,
    cost: overrides.cost,
    error: overrides.error,
  };
}

function createIdenticalVotes(count: number): ModelVote[] {
  return Array.from({ length: count }, (_, i) =>
    createVote({
      modelId: `model-${i}`,
      agrees: true,
      confidence: 0.9,
      reasoning: 'The SQL injection vulnerability is confirmed in the login handler.',
      suggestions: ['Use parameterized queries'],
    })
  );
}

function createDiverseVotes(): ModelVote[] {
  return [
    createVote({
      modelId: 'claude',
      agrees: true,
      confidence: 0.92,
      reasoning: 'SQL injection confirmed. The user input is directly concatenated into the query string without sanitization.',
      suggestions: ['Use parameterized queries', 'Add input validation'],
    }),
    createVote({
      modelId: 'gpt',
      agrees: true,
      confidence: 0.75,
      reasoning: 'Potential vulnerability detected but context suggests limited exploitability due to authentication layer.',
      suggestions: ['Consider prepared statements'],
    }),
    createVote({
      modelId: 'gemini',
      agrees: false,
      confidence: 0.6,
      reasoning: 'The ORM layer appears to handle escaping. This may be a false positive. Further investigation needed.',
      suggestions: ['Review ORM documentation', 'Check escaping behavior', 'Test with payloads'],
    }),
  ];
}

// ============================================================================
// Factory Tests
// ============================================================================

describe('SycophancyScorer', () => {
  describe('createSycophancyScorer', () => {
    it('should create a scorer instance', () => {
      const scorer = createSycophancyScorer();
      expect(scorer).toBeInstanceOf(SycophancyScorer);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should return independent for empty votes', () => {
      const scorer = createSycophancyScorer();
      const result = scorer.evaluate([]);
      expect(result.level).toBe('independent');
      expect(result.compositeScore).toBe(0);
      expect(result.recommendation).toContain('Insufficient');
    });

    it('should return independent for a single vote', () => {
      const scorer = createSycophancyScorer();
      const result = scorer.evaluate([createVote()]);
      expect(result.level).toBe('independent');
      expect(result.compositeScore).toBe(0);
      expect(result.signals).toHaveLength(4);
      expect(result.signals.every(s => s.score === 0)).toBe(true);
    });

    it('should detect severe sycophancy for 2 identical votes', () => {
      const scorer = createSycophancyScorer();
      const votes = createIdenticalVotes(2);
      const result = scorer.evaluate(votes);
      expect(result.level).toBe('severe');
      expect(result.compositeScore).toBeGreaterThanOrEqual(0.7);
    });

    it('should handle votes with empty reasoning', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', reasoning: '' }),
        createVote({ modelId: 'b', reasoning: '' }),
      ];
      const result = scorer.evaluate(votes);
      // Should not crash; reasoning similarity should be 0
      const reasoningSignal = result.signals.find(s => s.name === 'reasoning-similarity');
      expect(reasoningSignal?.score).toBe(0);
    });

    it('should handle votes with no suggestions', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', suggestions: undefined }),
        createVote({ modelId: 'b', suggestions: undefined }),
      ];
      const result = scorer.evaluate(votes);
      // Both have 0 suggestions -> mildly suspicious (0.5)
      const issueSignal = result.signals.find(s => s.name === 'issue-count-consistency');
      expect(issueSignal?.score).toBe(0.5);
    });
  });

  // ============================================================================
  // Signal 1: Verdict Unanimity
  // ============================================================================

  describe('verdict unanimity signal', () => {
    it('should score 1.0 when all votes agree (all true)', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', agrees: true }),
        createVote({ modelId: 'b', agrees: true }),
        createVote({ modelId: 'c', agrees: true }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'verdict-unanimity');
      expect(signal?.score).toBeCloseTo(1.0);
    });

    it('should score 1.0 when all votes agree (all false)', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', agrees: false }),
        createVote({ modelId: 'b', agrees: false }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'verdict-unanimity');
      expect(signal?.score).toBeCloseTo(1.0);
    });

    it('should score 0.0 when votes are evenly split', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', agrees: true }),
        createVote({ modelId: 'b', agrees: false }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'verdict-unanimity');
      expect(signal?.score).toBeCloseTo(0.0);
    });

    it('should score ~0.33 for 2/3 agreement', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', agrees: true }),
        createVote({ modelId: 'b', agrees: true }),
        createVote({ modelId: 'c', agrees: false }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'verdict-unanimity');
      // ratio = 2/3 = 0.667, score = |0.667 - 0.5| * 2 = 0.333
      expect(signal?.score).toBeCloseTo(0.333, 2);
    });
  });

  // ============================================================================
  // Signal 2: Reasoning Similarity
  // ============================================================================

  describe('reasoning similarity signal', () => {
    it('should score 1.0 for identical reasoning', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', reasoning: 'The vulnerability is confirmed in the handler.' }),
        createVote({ modelId: 'b', reasoning: 'The vulnerability is confirmed in the handler.' }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'reasoning-similarity');
      expect(signal?.score).toBeCloseTo(1.0);
    });

    it('should score low for completely different reasoning', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', reasoning: 'Critical SQL injection vulnerability exploitable remotely.' }),
        createVote({ modelId: 'b', reasoning: 'Memory allocation buffer overflow in authentication module.' }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'reasoning-similarity');
      expect(signal!.score).toBeLessThan(0.3);
    });

    it('should handle short words being filtered out', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', reasoning: 'it is ok' }),
        createVote({ modelId: 'b', reasoning: 'no it is bad' }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'reasoning-similarity');
      // "it", "is", "ok" are all <= 2 chars except "bad" — these should be mostly filtered
      expect(signal).toBeDefined();
    });
  });

  // ============================================================================
  // Signal 3: Confidence Uniformity
  // ============================================================================

  describe('confidence uniformity signal', () => {
    it('should score 1.0 for identical confidence values', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', confidence: 0.85 }),
        createVote({ modelId: 'b', confidence: 0.85 }),
        createVote({ modelId: 'c', confidence: 0.85 }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'confidence-uniformity');
      expect(signal?.score).toBeCloseTo(1.0);
    });

    it('should score lower for varied confidence values', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', confidence: 0.95 }),
        createVote({ modelId: 'b', confidence: 0.50 }),
        createVote({ modelId: 'c', confidence: 0.20 }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'confidence-uniformity');
      expect(signal!.score).toBeLessThan(0.7);
    });

    it('should score 0.0 for maximum spread (0 and 1)', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', confidence: 0.0 }),
        createVote({ modelId: 'b', confidence: 1.0 }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'confidence-uniformity');
      expect(signal?.score).toBeCloseTo(0.0);
    });
  });

  // ============================================================================
  // Signal 4: Issue Count Consistency
  // ============================================================================

  describe('issue count consistency signal', () => {
    it('should score high when all models report same number of suggestions', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', suggestions: ['fix1', 'fix2'] }),
        createVote({ modelId: 'b', suggestions: ['fix3', 'fix4'] }),
        createVote({ modelId: 'c', suggestions: ['fix5', 'fix6'] }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'issue-count-consistency');
      expect(signal?.score).toBeCloseTo(1.0);
    });

    it('should score lower when suggestion counts vary widely', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', suggestions: ['fix1'] }),
        createVote({ modelId: 'b', suggestions: ['fix1', 'fix2', 'fix3', 'fix4', 'fix5'] }),
        createVote({ modelId: 'c', suggestions: ['fix1', 'fix2', 'fix3'] }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'issue-count-consistency');
      expect(signal!.score).toBeLessThan(0.8);
    });

    it('should score 0.5 when all suggestion counts are zero', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({ modelId: 'a', suggestions: [] }),
        createVote({ modelId: 'b', suggestions: [] }),
      ];
      const result = scorer.evaluate(votes);
      const signal = result.signals.find(s => s.name === 'issue-count-consistency');
      expect(signal?.score).toBe(0.5);
    });
  });

  // ============================================================================
  // Composite Score and Classification
  // ============================================================================

  describe('composite score calculation', () => {
    it('should weight signals correctly (sum of weights = 1.0)', () => {
      const scorer = createSycophancyScorer();
      const result = scorer.evaluate(createIdenticalVotes(3));
      const weightSum = result.signals.reduce((sum, s) => sum + s.weight, 0);
      expect(weightSum).toBeCloseTo(1.0);
    });

    it('should produce composite score as weighted sum of signals', () => {
      const scorer = createSycophancyScorer();
      const result = scorer.evaluate(createDiverseVotes());
      const expectedComposite = result.signals.reduce(
        (sum, s) => sum + s.weight * s.score,
        0
      );
      expect(result.compositeScore).toBeCloseTo(expectedComposite);
    });
  });

  describe('classification boundaries', () => {
    // We test with carefully crafted votes to hit boundary conditions

    it('should classify as independent for diverse votes', () => {
      const scorer = createSycophancyScorer();
      const result = scorer.evaluate(createDiverseVotes());
      // Diverse votes should not be severe or moderate
      expect(['independent', 'mild']).toContain(result.level);
    });

    it('should classify as severe for identical votes', () => {
      const scorer = createSycophancyScorer();
      const result = scorer.evaluate(createIdenticalVotes(5));
      expect(result.level).toBe('severe');
      expect(result.compositeScore).toBeGreaterThanOrEqual(0.7);
    });

    it('should provide appropriate recommendation for each level', () => {
      const scorer = createSycophancyScorer();

      const severe = scorer.evaluate(createIdenticalVotes(3));
      expect(severe.recommendation).toContain('human review');

      const diverse = scorer.evaluate(createDiverseVotes());
      expect(diverse.recommendation).toBeDefined();
      expect(diverse.recommendation.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Realistic Multi-Model Scenarios
  // ============================================================================

  describe('realistic scenarios', () => {
    it('should detect rubber-stamping in a 3-model unanimous agreement with similar reasoning', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({
          modelId: 'claude',
          agrees: true,
          confidence: 0.88,
          reasoning: 'SQL injection vulnerability confirmed in the login endpoint handler function.',
          suggestions: ['Use parameterized queries'],
        }),
        createVote({
          modelId: 'gpt-4',
          agrees: true,
          confidence: 0.90,
          reasoning: 'SQL injection vulnerability confirmed in the login endpoint handler function.',
          suggestions: ['Use prepared statements'],
        }),
        createVote({
          modelId: 'gemini',
          agrees: true,
          confidence: 0.87,
          reasoning: 'SQL injection vulnerability confirmed in the login endpoint handler.',
          suggestions: ['Parameterize queries'],
        }),
      ];
      const result = scorer.evaluate(votes);
      expect(result.level).toBe('severe');
    });

    it('should show independence for genuinely diverse assessments', () => {
      const scorer = createSycophancyScorer();
      const votes = [
        createVote({
          modelId: 'claude',
          agrees: true,
          confidence: 0.95,
          reasoning: 'Confirmed critical SQL injection via unsanitized user input in query builder.',
          suggestions: ['Use ORM', 'Add WAF rules', 'Input validation'],
        }),
        createVote({
          modelId: 'gpt-4',
          agrees: false,
          confidence: 0.45,
          reasoning: 'The database abstraction layer appears to handle escaping. Likely false positive.',
          suggestions: ['Verify ORM escaping behavior'],
        }),
        createVote({
          modelId: 'gemini',
          agrees: true,
          confidence: 0.70,
          reasoning: 'Partial agreement. While ORM provides some protection, raw queries in migration scripts are vulnerable.',
          suggestions: ['Review migration scripts', 'Add integration tests'],
        }),
      ];
      const result = scorer.evaluate(votes);
      expect(result.compositeScore).toBeLessThan(0.5);
      expect(['independent', 'mild']).toContain(result.level);
    });

    it('should return all 4 signals in every evaluation', () => {
      const scorer = createSycophancyScorer();
      const result = scorer.evaluate(createDiverseVotes());
      expect(result.signals).toHaveLength(4);
      const signalNames = result.signals.map(s => s.name);
      expect(signalNames).toContain('verdict-unanimity');
      expect(signalNames).toContain('reasoning-similarity');
      expect(signalNames).toContain('confidence-uniformity');
      expect(signalNames).toContain('issue-count-consistency');
    });
  });
});
