/**
 * adversarial-verify — synthesis math (A2). Pure k-of-n majority-kill, default-
 * uncertain, custom thresholds. Mirrors the qcsd-development-review workflow.
 */
import { describe, it, expect } from 'vitest';
import { synthesizeVerdict, majorityKill, isFindingVerdict } from '../../../../src/verification/adversarial-verify/index.js';
import type { Finding, RefuterVote } from '../../../../src/verification/adversarial-verify/index.js';

const finding: Finding = {
  id: 'complexity:god-fn', title: 'god function', file: 'src/x.ts',
  severity: 'high', confidence: 0.8, evidence: ['src/x.ts:10 — 200-line function'],
};
const refute = (reasoning = 'no'): RefuterVote => ({ refuted: true, reasoning });
const uphold = (reasoning = 'verified'): RefuterVote => ({ refuted: false, reasoning });

describe('majorityKill threshold', () => {
  it('should require a simple majority of cast votes', () => {
    expect(majorityKill(3)).toBe(2); // 2-of-3
    expect(majorityKill(2)).toBe(1); // 1-of-2
    expect(majorityKill(1)).toBe(1); // 1-of-1
  });
});

describe('synthesizeVerdict', () => {
  it('should REFUTE when refute-votes meet the majority (2-of-3)', () => {
    const v = synthesizeVerdict(finding, [refute(), refute(), uphold()]);
    expect(v.verdict).toBe('refuted');
    expect(v.refutations).toHaveLength(2);
  });

  it('should UPHOLD when refute-votes are below majority (1-of-3)', () => {
    const v = synthesizeVerdict(finding, [refute(), uphold(), uphold()]);
    expect(v.verdict).toBe('upheld');
    expect(v.refutations).toEqual(['no']);
  });

  it('should be UNCERTAIN when no votes were cast (all refuters failed)', () => {
    const v = synthesizeVerdict(finding, []);
    expect(v.verdict).toBe('uncertain');
    expect(v.refutations).toEqual([]);
  });

  it('should refute a tie when threshold is met (1-of-2 majority)', () => {
    expect(synthesizeVerdict(finding, [refute(), uphold()]).verdict).toBe('refuted');
  });

  it('should honor a custom (unanimous) kill threshold', () => {
    const unanimous = (n: number) => n; // all must refute
    expect(synthesizeVerdict(finding, [refute(), refute(), uphold()], unanimous).verdict).toBe('upheld');
    expect(synthesizeVerdict(finding, [refute(), refute(), refute()], unanimous).verdict).toBe('refuted');
  });

  it('should emit a schema-valid finding-verdict@1 envelope carrying the finding fields', () => {
    const v = synthesizeVerdict(finding, [uphold(), uphold(), uphold()]);
    expect(isFindingVerdict(v)).toBe(true);
    expect(v).toMatchObject({ contract: 'finding-verdict@1', id: 'complexity:god-fn', title: 'god function', file: 'src/x.ts', severity: 'high', confidence: 0.8 });
  });

  it('should omit file when the finding has none', () => {
    const { file, ...noFile } = finding;
    const v = synthesizeVerdict(noFile, [uphold()]);
    expect('file' in v).toBe(false);
  });
});
