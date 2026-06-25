/**
 * adversarial-verify — regression PARITY with qcsd-development-review (A2 (c)).
 *
 * The Workflow harness sandboxes .claude/workflows/*.js (no module resolution),
 * so the workflow can't literally `import` the package — it inline-mirrors it.
 * This test guards the extraction: the package's synthesizeVerdict must produce
 * verdicts BYTE-IDENTICAL to the workflow's original inline synthesis, so the
 * extracted module is a faithful drop-in (and the inline mirror can't silently
 * drift from the package's behavior).
 */
import { describe, it, expect } from 'vitest';
import { synthesizeVerdict, refuterPrompt, DEFAULT_LENSES } from '../../../../src/verification/adversarial-verify/index.js';
import type { Finding, RefuterVote } from '../../../../src/verification/adversarial-verify/index.js';

// ── VERBATIM copy of qcsd-development-review.js synthesis (lines 140-155) ──────
// (the pre-extraction behavior; do not "fix" — it is the regression oracle.)
function workflowSynthesis(dimension: string, finding: any, votes: any[]) {
  const refutations = votes.filter((v) => v.refuted).map((v) => v.reasoning);
  const killed = votes.length > 0 && refutations.length >= Math.ceil(votes.length / 2);
  return {
    contract: 'finding-verdict@1',
    id: `${dimension}:${finding.id}`,
    title: finding.title,
    file: finding.file,
    severity: finding.severity,
    confidence: finding.confidence,
    evidence: finding.evidence,
    verdict: votes.length === 0 ? 'uncertain' : killed ? 'refuted' : 'upheld',
    refutations,
  };
}

const finding: Finding = {
  id: 'god-fn', title: 'god function', file: 'src/x.ts', severity: 'high',
  confidence: 0.8, evidence: ['src/x.ts:10', 'src/x.ts:42'],
};
const R = (reasoning: string): RefuterVote => ({ refuted: true, reasoning });
const U = (reasoning: string): RefuterVote => ({ refuted: false, reasoning });

const VOTE_SETS: RefuterVote[][] = [
  [],                                  // all refuters failed → uncertain
  [U('a'), U('b'), U('c')],            // 0 refute → upheld
  [R('a'), U('b'), U('c')],            // 1-of-3 → upheld
  [R('a'), R('b'), U('c')],            // 2-of-3 → refuted
  [R('a'), R('b'), R('c')],            // 3-of-3 → refuted
  [R('a'), U('b')],                    // 1-of-2 majority → refuted
];

describe('parity — package synthesizeVerdict matches the workflow inline synthesis', () => {
  for (const votes of VOTE_SETS) {
    it(`should match for ${votes.length} votes (${votes.filter((v) => v.refuted).length} refute)`, () => {
      // The workflow composes the id as `${dimension}:${finding.id}` before synth.
      const pkg = synthesizeVerdict({ ...finding, id: `complexity:${finding.id}` }, votes);
      const wf = workflowSynthesis('complexity', finding, votes);
      expect(pkg).toEqual(wf);
    });
  }

  it('should mirror the workflow refuter prompt + lenses', () => {
    // The workflow's refuterPrompt/LENSES are now the package's canonical ones.
    expect(DEFAULT_LENSES).toEqual([
      'does-the-evidence-reproduce',
      'is-it-actually-a-problem',
      'is-the-cited-code-really-doing-this',
    ]);
    const p = refuterPrompt(finding, DEFAULT_LENSES[0]);
    expect(p).toContain('Try to REFUTE');
    expect(p).toContain('default to refuted=true when uncertain');
    expect(p).not.toContain('0.8'); // blind: finder confidence never leaks
  });
});
