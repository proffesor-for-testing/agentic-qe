/**
 * ADR-119 frontier spec judge.
 *
 * Verifies the guarantees the two-gate verdict depends on: a full-coverage
 * response passes; a dead provider maps preflight → false (⇒ inconclusive
 * upstream); a thrown/timed-out provider or an unparseable response is a
 * NON-real opinion (ran=false, can never contribute to a fail); coverage is
 * computed over the CONSTANT denominator. The provider is faked via the
 * `complete` seam — NO network.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createFrontierJudge,
  buildGradePrompt,
  parseUnmetIndices,
  withTimeout,
  type CompleteFn,
} from '../../../src/validation/frontier-judge.js';
import type { RequirementChecklist } from '../../../src/validation/quality-verdict.js';

const CHECKLIST: RequirementChecklist = {
  id: 'A1-inRange',
  requirements: ['R1', 'R2', 'R3', 'R4'],
};

/** A fake `complete` seam returning a fixed string. */
const respond = (text: string): CompleteFn => async () => text;

describe('createFrontierJudge.grade', () => {
  it('should_returnFullCoverage_when_noRequirementsUnmet', async () => {
    // Arrange
    const judge = createFrontierJudge({ complete: respond('{"unmet": []}') });

    // Act
    const opinion = await judge.grade('artifact', CHECKLIST);

    // Assert
    expect(opinion).toEqual({ ran: true, coverage: 1.0, unmet: [] });
  });

  it('should_computeCoverageOverConstantDenominator_when_someUnmet', async () => {
    // Arrange: requirements 2 and 4 unmet ⇒ 2/4 satisfied
    const judge = createFrontierJudge({ complete: respond('{"unmet": [2, 4]}') });

    // Act
    const opinion = await judge.grade('artifact', CHECKLIST);

    // Assert
    expect(opinion.ran).toBe(true);
    expect(opinion.coverage).toBe(0.5);
    expect(opinion.unmet).toEqual(['R2', 'R4']);
  });

  it('should_markRanFalse_when_providerThrows', async () => {
    // Arrange
    const judge = createFrontierJudge({
      complete: async () => {
        throw new Error('usage limit reached');
      },
    });

    // Act
    const opinion = await judge.grade('artifact', CHECKLIST);

    // Assert: a thrown provider is NOT a real opinion — cannot contribute to a fail
    expect(opinion.ran).toBe(false);
    expect(opinion.coverage).toBe(0);
    expect(opinion.unmet).toEqual([]);
  });

  it('should_markRanFalse_when_responseUnparseable', async () => {
    // Arrange
    const judge = createFrontierJudge({ complete: respond('the model rambled without JSON') });

    // Act
    const opinion = await judge.grade('artifact', CHECKLIST);

    // Assert
    expect(opinion.ran).toBe(false);
  });

  it('should_markRanFalse_when_gradeTimesOut', async () => {
    // Arrange: a provider that never settles, with a tiny timeout
    const judge = createFrontierJudge({
      complete: () => new Promise<string>(() => {}),
      timeoutMs: 20,
    });

    // Act
    const opinion = await judge.grade('artifact', CHECKLIST);

    // Assert
    expect(opinion.ran).toBe(false);
  });

  it('should_ignoreOutOfRangeIndices_when_modelReturnsGarbledNumbers', async () => {
    // Arrange: 99 is out of range and must not inflate the unmet count
    const judge = createFrontierJudge({ complete: respond('{"unmet": [1, 99]}') });

    // Act
    const opinion = await judge.grade('artifact', CHECKLIST);

    // Assert: only requirement 1 counts ⇒ 3/4
    expect(opinion.coverage).toBe(0.75);
    expect(opinion.unmet).toEqual(['R1']);
  });
});

describe('createFrontierJudge.preflight', () => {
  it('should_returnTrue_when_providerRespondsToPing', async () => {
    // Arrange
    const judge = createFrontierJudge({ complete: respond('OK') });

    // Act
    const ready = await judge.preflight();

    // Assert
    expect(ready).toBe(true);
  });

  it('should_returnFalse_when_providerThrows', async () => {
    // Arrange: a dead/unauthenticated provider
    const judge = createFrontierJudge({
      complete: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    // Act
    const ready = await judge.preflight();

    // Assert: a dead provider must never read as ready (⇒ inconclusive upstream)
    expect(ready).toBe(false);
  });

  it('should_returnFalse_when_providerReturnsEmpty', async () => {
    // Arrange
    const judge = createFrontierJudge({ complete: respond('   ') });

    // Act
    const ready = await judge.preflight();

    // Assert
    expect(ready).toBe(false);
  });

  it('should_useInjectedPing_when_provided', async () => {
    // Arrange
    const ping = vi.fn().mockResolvedValue(false);
    const judge = createFrontierJudge({ complete: respond('OK'), ping });

    // Act
    const ready = await judge.preflight();

    // Assert
    expect(ping).toHaveBeenCalledOnce();
    expect(ready).toBe(false);
  });
});

describe('parseUnmetIndices', () => {
  it('should_extractJson_when_wrappedInMarkdownFences', () => {
    // Arrange
    const raw = '```json\n{"unmet": [2]}\n```';

    // Act
    const idx = parseUnmetIndices(raw, 4);

    // Assert
    expect(idx).not.toBeNull();
    expect([...idx!]).toEqual([1]); // 1-based 2 -> 0-based 1
  });

  it('should_returnNull_when_unmetFieldMissing', () => {
    expect(parseUnmetIndices('{"other": []}', 4)).toBeNull();
  });

  it('should_returnNull_when_noJsonObject', () => {
    expect(parseUnmetIndices('no json here', 4)).toBeNull();
  });

  it('should_coerceStringNumbers_when_modelQuotesIndices', () => {
    // Act
    const idx = parseUnmetIndices('{"unmet": ["1", "3"]}', 4);

    // Assert
    expect([...idx!].sort()).toEqual([0, 2]);
  });
});

describe('buildGradePrompt', () => {
  it('should_numberRequirementsAndEmbedArtifact', () => {
    // Act
    const prompt = buildGradePrompt('const t = 1;', CHECKLIST);

    // Assert
    expect(prompt).toContain('1. R1');
    expect(prompt).toContain('4. R4');
    expect(prompt).toContain('const t = 1;');
    expect(prompt).toContain('A1-inRange');
  });
});

describe('withTimeout', () => {
  it('should_reject_when_promiseExceedsDeadline', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'test')).rejects.toThrow(/timed out/);
  });

  it('should_resolve_when_promiseSettlesInTime', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000, 'test')).resolves.toBe('done');
  });
});
