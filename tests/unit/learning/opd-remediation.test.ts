/**
 * Unit Tests for OPD Remediation Hints
 * Tests all 5 remediation categories plus edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  generateRemediationHints,
  findCommonKeywords,
} from '../../../src/learning/opd-remediation.js';
import type {
  PatternInput,
  ExecutionRecord,
  RemediationHint,
} from '../../../src/learning/opd-remediation.js';

// ============================================================================
// Helpers
// ============================================================================

function makePattern(overrides: Partial<PatternInput> = {}): PatternInput {
  return {
    id: 'pat-001',
    name: 'Test Pattern',
    description: 'A test pattern for validating login flows',
    successRate: 0.5,
    usageCount: 10,
    confidence: 0.7,
    tags: ['login', 'auth'],
    ...overrides,
  };
}

function makeHistory(
  total: number,
  failRate: number,
  opts?: { feedback?: string },
): ExecutionRecord[] {
  const failCount = Math.round(total * failRate);
  const records: ExecutionRecord[] = [];
  for (let i = 0; i < total - failCount; i++) {
    records.push({ success: true });
  }
  for (let i = 0; i < failCount; i++) {
    records.push({ success: false, feedback: opts?.feedback });
  }
  return records;
}

function hasCategory(hints: RemediationHint[], cat: RemediationHint['category']): boolean {
  return hints.some((h) => h.category === cat);
}

// ============================================================================
// Tests
// ============================================================================

describe('generateRemediationHints', () => {
  // --------------------------------------------------------------------------
  // Category 1: Flaky
  // --------------------------------------------------------------------------
  describe('flaky detection', () => {
    it('should detect flaky pattern with 50% fail rate and 4 executions', () => {
      const pattern = makePattern({ name: 'FlakySvc' });
      const history = makeHistory(4, 0.5);
      const hints = generateRemediationHints(pattern, history);

      expect(hasCategory(hints, 'flaky')).toBe(true);
      const flaky = hints.find((h) => h.category === 'flaky')!;
      expect(flaky.observation).toContain('50%');
      expect(flaky.suggestion).toContain('retry');
      expect(flaky.confidence).toBeGreaterThan(0.5);
      expect(flaky.confidence).toBeLessThanOrEqual(0.9);
    });

    it('should not detect flaky when fail rate is below 20%', () => {
      const hints = generateRemediationHints(
        makePattern(),
        makeHistory(10, 0.1),
      );
      expect(hasCategory(hints, 'flaky')).toBe(false);
    });

    it('should not detect flaky when fail rate is 80% or above', () => {
      const hints = generateRemediationHints(
        makePattern(),
        makeHistory(5, 0.8),
      );
      expect(hasCategory(hints, 'flaky')).toBe(false);
    });

    it('should not detect flaky with fewer than 3 executions', () => {
      const hints = generateRemediationHints(
        makePattern(),
        makeHistory(2, 0.5),
      );
      expect(hasCategory(hints, 'flaky')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Category 2: False Positive
  // --------------------------------------------------------------------------
  describe('false-positive detection', () => {
    it('should detect false positive at 100% fail rate', () => {
      const hints = generateRemediationHints(
        makePattern({ name: 'BrokenPattern' }),
        makeHistory(5, 1.0),
      );

      expect(hasCategory(hints, 'false-positive')).toBe(true);
      const fp = hints.find((h) => h.category === 'false-positive')!;
      expect(fp.observation).toContain('100%');
      expect(fp.confidence).toBe(0.85);
    });

    it('should detect false positive at exactly 80% fail rate with 5 runs', () => {
      const hints = generateRemediationHints(
        makePattern(),
        makeHistory(5, 0.8),
      );
      expect(hasCategory(hints, 'false-positive')).toBe(true);
    });

    it('should not detect false positive with only 1 execution', () => {
      const hints = generateRemediationHints(
        makePattern(),
        [{ success: false }],
      );
      expect(hasCategory(hints, 'false-positive')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Category 3: Outdated
  // --------------------------------------------------------------------------
  describe('outdated detection', () => {
    it('should detect outdated pattern that was working then started failing', () => {
      // 5 early successes, then 3 recent failures
      const history: ExecutionRecord[] = [
        { success: true },
        { success: true },
        { success: true },
        { success: true },
        { success: true },
        { success: false },
        { success: false },
        { success: false },
      ];

      const hints = generateRemediationHints(makePattern(), history);
      expect(hasCategory(hints, 'outdated')).toBe(true);
      const outdated = hints.find((h) => h.category === 'outdated')!;
      expect(outdated.observation).toContain('worked previously');
      expect(outdated.confidence).toBe(0.8);
    });

    it('should not detect outdated with fewer than 5 executions', () => {
      const history: ExecutionRecord[] = [
        { success: true },
        { success: true },
        { success: false },
        { success: false },
      ];
      const hints = generateRemediationHints(makePattern(), history);
      expect(hasCategory(hints, 'outdated')).toBe(false);
    });

    it('should not detect outdated when failures were always present', () => {
      const history: ExecutionRecord[] = [
        { success: false },
        { success: false },
        { success: false },
        { success: false },
        { success: false },
      ];
      const hints = generateRemediationHints(makePattern(), history);
      expect(hasCategory(hints, 'outdated')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Category 4: Wrong Scope
  // --------------------------------------------------------------------------
  describe('wrong-scope detection', () => {
    it('should detect wrong scope with short description and high failure', () => {
      const pattern = makePattern({ description: 'auth test', name: 'Vague' });
      const hints = generateRemediationHints(pattern, makeHistory(5, 0.6));

      expect(hasCategory(hints, 'wrong-scope')).toBe(true);
      const ws = hints.find((h) => h.category === 'wrong-scope')!;
      expect(ws.suggestion).toContain('Narrow the pattern scope');
      expect(ws.confidence).toBe(0.6);
    });

    it('should not detect wrong scope with a detailed description', () => {
      const pattern = makePattern({
        description: 'Validates that the user login flow handles expired JWT tokens correctly',
      });
      const hints = generateRemediationHints(pattern, makeHistory(5, 0.6));
      expect(hasCategory(hints, 'wrong-scope')).toBe(false);
    });

    it('should not detect wrong scope when fail rate is 30% or below', () => {
      const pattern = makePattern({ description: 'auth test' });
      const hints = generateRemediationHints(pattern, makeHistory(10, 0.3));
      expect(hasCategory(hints, 'wrong-scope')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Category 5: Missing Context
  // --------------------------------------------------------------------------
  describe('missing-context detection', () => {
    it('should detect missing context from recurring feedback keywords', () => {
      const history: ExecutionRecord[] = [
        { success: false, feedback: 'timeout waiting for database connection' },
        { success: false, feedback: 'database connection pool exhausted with timeout' },
        { success: true },
      ];

      const hints = generateRemediationHints(makePattern(), history);
      expect(hasCategory(hints, 'missing-context')).toBe(true);
      const mc = hints.find((h) => h.category === 'missing-context')!;
      expect(mc.observation).toContain('recurring themes');
      expect(mc.confidence).toBe(0.65);
    });

    it('should not detect missing context when no feedback is provided', () => {
      const hints = generateRemediationHints(
        makePattern(),
        makeHistory(5, 0.8),
      );
      expect(hasCategory(hints, 'missing-context')).toBe(false);
    });

    it('should not detect missing context when feedback keywords are unique', () => {
      const history: ExecutionRecord[] = [
        { success: false, feedback: 'alpha beta gamma' },
        { success: false, feedback: 'delta epsilon zeta' },
      ];
      const hints = generateRemediationHints(makePattern(), history);
      expect(hasCategory(hints, 'missing-context')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------
  describe('edge cases', () => {
    it('should return empty array for empty execution history', () => {
      const hints = generateRemediationHints(makePattern(), []);
      expect(hints).toEqual([]);
    });

    it('should handle single successful execution gracefully', () => {
      const hints = generateRemediationHints(makePattern(), [{ success: true }]);
      expect(hints).toEqual([]);
    });

    it('should handle single failed execution gracefully', () => {
      const hints = generateRemediationHints(
        makePattern({ description: 'long enough description to avoid wrong-scope' }),
        [{ success: false }],
      );
      // 100% fail rate but only 1 execution — not enough for false-positive (needs >=2)
      expect(hints).toEqual([]);
    });

    it('should respect maxHintsPerPattern config', () => {
      // Trigger multiple categories simultaneously
      const pattern = makePattern({ description: 'short', name: 'Multi' });
      const history: ExecutionRecord[] = [
        { success: true },
        { success: true },
        { success: false, feedback: 'timeout connection' },
        { success: false, feedback: 'timeout connection refused' },
        { success: false, feedback: 'timeout issue' },
      ];

      const hints = generateRemediationHints(pattern, history, {
        maxHintsPerPattern: 1,
      });
      expect(hints.length).toBeLessThanOrEqual(1);
    });

    it('should return no hints when all executions succeed', () => {
      const hints = generateRemediationHints(
        makePattern(),
        makeHistory(10, 0),
      );
      expect(hints).toEqual([]);
    });
  });
});

// ============================================================================
// findCommonKeywords Tests
// ============================================================================

describe('findCommonKeywords', () => {
  it('should find words appearing in 2+ feedback messages', () => {
    const result = findCommonKeywords([
      'database connection timeout',
      'database pool exhausted',
      'redis cache miss',
    ]);
    expect(result).toContain('database');
  });

  it('should exclude stop words', () => {
    const result = findCommonKeywords([
      'the error was in the code',
      'the error broke the build',
    ]);
    expect(result).not.toContain('the');
    expect(result).not.toContain('error');
  });

  it('should exclude words with 2 or fewer characters', () => {
    const result = findCommonKeywords([
      'it is ok to skip',
      'it is ok overall',
    ]);
    expect(result).not.toContain('it');
    expect(result).not.toContain('is');
    expect(result).not.toContain('ok');
  });

  it('should return empty array for single message', () => {
    const result = findCommonKeywords(['single unique message here']);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty input', () => {
    const result = findCommonKeywords([]);
    expect(result).toEqual([]);
  });

  it('should limit to 5 results', () => {
    const feedback = [
      'alpha bravo charlie delta echo foxtrot golf hotel',
      'alpha bravo charlie delta echo foxtrot golf hotel',
    ];
    const result = findCommonKeywords(feedback);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('should sort by frequency descending', () => {
    const result = findCommonKeywords([
      'timeout timeout timeout database',
      'timeout database connection',
      'timeout database retry',
    ]);
    // 'timeout' appears in all 3, 'database' in all 3, etc.
    expect(result[0]).toBe('timeout');
  });
});
