/**
 * adversarial-verify — output gate (A5). The plan's verification criteria:
 * (a) a seeded FALSE claim is killed, (b) a TRUE claim survives, (c) the gate is
 * a no-op (zero Judge calls) when disabled, (d) overhead is measured.
 */
import { describe, it, expect, vi } from 'vitest';
import { verifyGate } from '../../../../src/verification/adversarial-verify/index.js';
import type { Finding, Judge } from '../../../../src/verification/adversarial-verify/index.js';

const mk = (id: string, over: Partial<Finding> = {}): Finding => ({
  id, title: `claim ${id}`, file: `src/${id}.ts`, severity: 'medium', confidence: 0.9, evidence: [`src/${id}.ts:1`], ...over,
});

// Refuters refute findings titled "...FALSE..." and uphold the rest.
const oracleJudge: Judge = async (prompt) =>
  /claim FALSE/.test(prompt) ? { refuted: true, reasoning: 'fabricated' } : { refuted: false, reasoning: 'verified' };

describe('verifyGate — output gating (A5)', () => {
  it('(a) should KILL a seeded false claim before it is emitted', async () => {
    const r = await verifyGate([mk('FALSE')], { judge: oracleJudge, refuters: 3 });
    expect(r.emitted).toHaveLength(0);
    expect(r.blocked.map((v) => v.verdict)).toEqual(['refuted']);
  });

  it('(b) should let a true claim survive the gate', async () => {
    const r = await verifyGate([mk('real')], { judge: oracleJudge, refuters: 3 });
    expect(r.emitted.map((v) => v.id)).toEqual(['real']);
    expect(r.blocked).toHaveLength(0);
  });

  it('(a+b) should emit only the survivors from a mixed batch', async () => {
    const r = await verifyGate([mk('real-1'), mk('FALSE-1'), mk('real-2'), mk('FALSE-2')], { judge: oracleJudge, refuters: 3 });
    expect(r.emitted.map((v) => v.id)).toEqual(['real-1', 'real-2']);
    expect(r.blocked.map((v) => v.id)).toEqual(['FALSE-1', 'FALSE-2']);
    expect(r.all).toHaveLength(4); // every verdict surfaced for witness
  });

  it('(c) should be a NO-OP with ZERO judge calls when disabled (cost-neutral)', async () => {
    const judge = vi.fn<Judge>(async () => ({ refuted: true, reasoning: 'r' }));
    const r = await verifyGate([mk('FALSE'), mk('real')], { judge, enabled: false, refuters: 3 });
    expect(judge).not.toHaveBeenCalled();
    expect(r.judgeCalls).toBe(0);
    expect(r.emitted.map((v) => v.id)).toEqual(['FALSE', 'real']); // nothing blocked when off
    expect(r.emitted.every((v) => v.verdict === 'uncertain')).toBe(true); // honestly un-verified
  });

  it('(d) should report measured overhead + judge-call count (token-cost proxy)', async () => {
    const r = await verifyGate([mk('real'), mk('FALSE')], { judge: oracleJudge, refuters: 3 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.judgeCalls).toBe(6); // 2 findings × 3 refuters
  });

  it('should optionally drop uncertain verdicts (all refuters failed)', async () => {
    const failing: Judge = async () => null; // every refuter fails → uncertain
    const kept = await verifyGate([mk('x')], { judge: failing, refuters: 3 });
    expect(kept.emitted).toHaveLength(1); // uncertain emitted by default
    const dropped = await verifyGate([mk('x')], { judge: failing, refuters: 3, dropUncertain: true });
    expect(dropped.emitted).toHaveLength(0); // uncertain blocked when requested
  });
});
