/**
 * @ruvector/adversarial-verify — blind refuter prompt (ADR-074 Loki-mode).
 *
 * The refuter sees ONLY the bare claim + evidence + a lens — never the finder's
 * confidence, dimension, or other refuters' votes. Anti-sycophancy: its job is to
 * ATTACK the claim, and uncertainty defaults to refuted (unverifiable claims must
 * not survive).
 */
import type { Finding } from './types.js';

/** Default refutation lenses — distinct angles of attack (one per refuter). */
export const DEFAULT_LENSES = [
  'does-the-evidence-reproduce',
  'is-it-actually-a-problem',
  'is-the-cited-code-really-doing-this',
];

/** Build the blind refuter prompt for one finding under one lens. */
export function refuterPrompt(finding: Finding, lens: string): string {
  return (
    `You are an adversarial reviewer. Try to REFUTE this code-review claim using the ${lens} lens.\n` +
    `Claim: "${finding.title}"${finding.file ? ` in ${finding.file}` : ''}\n` +
    `Evidence offered: ${finding.evidence.join(' | ')}\n` +
    `Read the actual code at the cited locations and judge ONLY what you can verify yourself. ` +
    `Set refuted=true unless the evidence checks out AND the claim is a real, actionable problem ` +
    `(default to refuted=true when uncertain — unverifiable claims must not survive). ` +
    `Give one-sentence reasoning.`
  );
}
