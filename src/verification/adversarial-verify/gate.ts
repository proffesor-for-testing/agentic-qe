/**
 * @ruvector/adversarial-verify — output gate (plan 05 / A5).
 *
 * An opt-in "verify before you emit" gate any vertical/harness can embed: route
 * emitted findings/claims through the blind refuters and DROP the refuted ones
 * before acting. Default-off-able and cost-neutral when disabled (no Judge calls).
 * Surfaces every verdict for witness/telemetry, and reports the gate's overhead.
 *
 * Vendor-ready: zero dependencies beyond this module, so MetaHarness (or any host)
 * can embed it as a per-vertical `verify` hook.
 */
import type { AdversarialVerifyOptions, Finding, FindingVerdict } from './types.js';
import type { Judge } from './types.js';
import { adversarialVerify } from './verify.js';

export interface VerifyGateOptions extends AdversarialVerifyOptions {
  /** Off ⇒ no-op pass-through, ZERO Judge calls (cost-neutral). Default true. */
  enabled?: boolean;
  /** Also block `uncertain` verdicts (all refuters failed), not just `refuted`. Default false. */
  dropUncertain?: boolean;
}

export interface VerifyGateResult {
  enabled: boolean;
  /** Findings that PASS the gate — emit these. */
  emitted: FindingVerdict[];
  /** Findings the gate blocked (refuted, + uncertain when `dropUncertain`). */
  blocked: FindingVerdict[];
  /** All verdicts (for witness/telemetry). */
  all: FindingVerdict[];
  /** Gate wall-clock overhead in ms (A5 (d) — measured cost). */
  latencyMs: number;
  /** Judge invocations the gate made (0 when disabled). Token cost ∝ this. */
  judgeCalls: number;
}

/** A finding passed through un-verified (gate disabled): honest `uncertain`. */
function passthrough(f: Finding): FindingVerdict {
  return {
    contract: 'finding-verdict@1',
    id: f.id, title: f.title,
    ...(f.file !== undefined ? { file: f.file } : {}),
    severity: f.severity, confidence: f.confidence, evidence: f.evidence,
    verdict: 'uncertain', refutations: [],
  };
}

const isBlocked = (v: FindingVerdict, dropUncertain: boolean) =>
  v.verdict === 'refuted' || (dropUncertain && v.verdict === 'uncertain');

/**
 * Verify findings before emitting them. Returns the survivors (`emitted`), the
 * killed (`blocked`), every verdict (`all`), and the gate's overhead. When
 * `enabled === false` it is a no-op: no Judge calls, everything passes through.
 */
export async function verifyGate(findings: Finding[], opts: VerifyGateOptions): Promise<VerifyGateResult> {
  const t0 = Date.now();
  if (opts.enabled === false) {
    const emitted = findings.map(passthrough);
    return { enabled: false, emitted, blocked: [], all: emitted, latencyMs: Date.now() - t0, judgeCalls: 0 };
  }
  let judgeCalls = 0;
  const countingJudge: Judge = (prompt) => { judgeCalls++; return opts.judge(prompt); };
  const all = await adversarialVerify(findings, { ...opts, judge: countingJudge });
  const dropUncertain = opts.dropUncertain ?? false;
  const blocked = all.filter((v) => isBlocked(v, dropUncertain));
  const emitted = all.filter((v) => !isBlocked(v, dropUncertain));
  return { enabled: true, emitted, blocked, all, latencyMs: Date.now() - t0, judgeCalls };
}
