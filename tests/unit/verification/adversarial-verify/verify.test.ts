/**
 * adversarial-verify — orchestration (A2). Blind refuters (judge never sees the
 * finder's confidence/dimension), N votes per finding, failed-vote exclusion,
 * input-order output. The Judge is a stub — no real LLM.
 */
import { describe, it, expect, vi } from 'vitest';
import { adversarialVerify, partitionVerdicts } from '../../../../src/verification/adversarial-verify/index.js';
import type { Finding, Judge } from '../../../../src/verification/adversarial-verify/index.js';

const mk = (id: string, over: Partial<Finding> = {}): Finding => ({
  id, title: `claim ${id}`, file: `src/${id}.ts`, severity: 'medium', confidence: 0.9, evidence: [`src/${id}.ts:1`], ...over,
});

describe('adversarialVerify — verdicts', () => {
  it('should kill a finding when the majority of refuters refute', async () => {
    let n = 0;
    const judge: Judge = async () => ({ refuted: ++n <= 2, reasoning: 'r' }); // 2 refute, 1 uphold
    const [v] = await adversarialVerify([mk('a')], { judge, refuters: 3 });
    expect(v.verdict).toBe('refuted');
  });

  it('should uphold a finding the refuters cannot refute', async () => {
    const judge: Judge = async () => ({ refuted: false, reasoning: 'verified' });
    const [v] = await adversarialVerify([mk('a')], { judge });
    expect(v.verdict).toBe('upheld');
  });

  it('should run exactly `refuters` blind judges per finding', async () => {
    const judge = vi.fn<Judge>(async () => ({ refuted: false, reasoning: 'ok' }));
    await adversarialVerify([mk('a'), mk('b')], { judge, refuters: 3 });
    expect(judge).toHaveBeenCalledTimes(6); // 2 findings × 3 refuters
  });

  it('should keep the refuter BLIND — prompt never leaks confidence or id', async () => {
    const seen: string[] = [];
    const judge: Judge = async (prompt) => { seen.push(prompt); return { refuted: false, reasoning: 'x' }; };
    await adversarialVerify([mk('secret', { confidence: 0.123456 })], { judge, refuters: 1 });
    expect(seen[0]).not.toContain('0.123456'); // confidence hidden
    expect(seen[0]).toContain('claim secret'); // only the bare claim + evidence
  });

  it('should treat failed/null judge calls as uncast votes, not refutations', async () => {
    const judge: Judge = async () => null; // every refuter fails
    const [v] = await adversarialVerify([mk('a')], { judge, refuters: 3 });
    expect(v.verdict).toBe('uncertain'); // 0 cast votes → uncertain (not refuted)
  });

  it('should partition verdicts into confirmed/killed/uncertain', async () => {
    const judge: Judge = async (p) => (p.includes('claim bad') ? { refuted: true, reasoning: 'r' } : { refuted: false, reasoning: 'ok' });
    const verdicts = await adversarialVerify([mk('good'), mk('bad')], { judge, refuters: 3 });
    const { confirmed, killed } = partitionVerdicts(verdicts);
    expect(confirmed.map((v) => v.id)).toEqual(['good']);
    expect(killed.map((v) => v.id)).toEqual(['bad']);
  });

  it('should preserve input order in the output verdicts', async () => {
    const judge: Judge = async () => ({ refuted: false, reasoning: 'ok' });
    const verdicts = await adversarialVerify([mk('z'), mk('a'), mk('m')], { judge });
    expect(verdicts.map((v) => v.id)).toEqual(['z', 'a', 'm']);
  });
});
