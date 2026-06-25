/**
 * Witnessed delivery of review findings (plan 05 / A7).
 *
 * Bridges adversarial-verify's finding-verdict@1 envelopes into the tamper-evident
 * WitnessChain so AQE has signed, hash-chained PROVENANCE of what it delivered (and
 * what its verify gate blocked) — not just internal events. Fail-closed: verifying
 * a tampered delivery chain THROWS.
 *
 * Lives AQE-side (not in @ruvector/adversarial-verify, which stays host-agnostic):
 * it depends on the WitnessChain. Accepts a structural verdict shape so it works
 * with both the package's FindingVerdict and src/contracts/verdicts.
 */
import type { WitnessChain, WitnessEntry } from './witness-chain.js';

/** Minimal finding-verdict@1 shape this recorder needs (structural). */
export interface DeliverableVerdict {
  id: string;
  title: string;
  verdict: 'upheld' | 'refuted' | 'uncertain';
  severity?: string;
  file?: string;
  confidence?: number;
  refutations?: string[];
}

/** A verify-gate result (subset) — emitted survivors + blocked findings. */
export interface DeliverableGateResult {
  emitted: DeliverableVerdict[];
  blocked: DeliverableVerdict[];
}

const DEFAULT_ACTOR = 'qe-verify-gate';

/** Append one verdict to the witness chain under the given action type. */
function witnessVerdict(chain: WitnessChain, v: DeliverableVerdict, type: 'FINDING_DELIVERED' | 'FINDING_BLOCKED', actor: string): WitnessEntry {
  return chain.append(type, {
    id: v.id, title: v.title, verdict: v.verdict,
    ...(v.severity !== undefined ? { severity: v.severity } : {}),
    ...(v.file !== undefined ? { file: v.file } : {}),
    ...(v.confidence !== undefined ? { confidence: v.confidence } : {}),
    refutations: v.refutations ?? [],
  }, actor);
}

/** Record DELIVERED findings (the verified survivors) into the witness chain. */
export function recordDeliveredFindings(
  chain: WitnessChain,
  verdicts: DeliverableVerdict[],
  actor: string = DEFAULT_ACTOR,
): WitnessEntry[] {
  return verdicts.map((v) => witnessVerdict(chain, v, 'FINDING_DELIVERED', actor));
}

/**
 * Record a full verify-gate result: survivors as FINDING_DELIVERED, killed as
 * FINDING_BLOCKED — so the audit log shows both what shipped and what was caught.
 */
export function recordGateResult(
  chain: WitnessChain,
  result: DeliverableGateResult,
  actor: string = DEFAULT_ACTOR,
): { delivered: WitnessEntry[]; blocked: WitnessEntry[] } {
  return {
    delivered: result.emitted.map((v) => witnessVerdict(chain, v, 'FINDING_DELIVERED', actor)),
    blocked: result.blocked.map((v) => witnessVerdict(chain, v, 'FINDING_BLOCKED', actor)),
  };
}

/**
 * Fail-closed verification of the delivery chain. Returns the (valid) result, or
 * THROWS if the chain is tampered / a signature fails — provenance you can't trust
 * must not pass silently (resolves the MetaHarness `{valid:true}` degraded path).
 */
export function verifyDeliveryChain(chain: WitnessChain, opts?: { checkSignatures?: boolean }): { valid: true; entriesChecked: number } {
  const r = chain.verify({ checkSignatures: opts?.checkSignatures === true });
  if (!r.valid) {
    throw new Error(`Witness delivery chain INVALID — tampering detected at entry ${r.brokenAt ?? '?'} (checked ${r.entriesChecked}). Delivered findings cannot be trusted.`);
  }
  if (opts?.checkSignatures && (r.signatureFailures ?? 0) > 0) {
    throw new Error(`Witness delivery chain has ${r.signatureFailures} signature failure(s) — provenance unverifiable.`);
  }
  return { valid: true, entriesChecked: r.entriesChecked };
}
