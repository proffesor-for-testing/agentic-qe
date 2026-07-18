/**
 * QE-Court referee (ADR-124) — the falsifiable core of the adversarial court,
 * as pure, deterministic functions so the court's invariants are ENFORCED in
 * code (and unit-testable as oracles), not merely described in the skill doc.
 *
 * These back the qe-court acceptance eval (`.claude/skills/qe-court/evals`):
 *   - verdict resolution + the overturn mechanic (SHIP must survive escalation)
 *   - panel validation (writer≠juror, vendor diversity)
 *   - DoE-gated scoring (no un-validated numeric score)
 *
 * No I/O, no LLM calls — the orchestration (spawning prosecutors, calling the
 * two-gate judge) lives in the skill; the RULES live here.
 */

export type Verdict = 'SHIP' | 'REMAND' | 'BLOCK';

/** Coarse model vendor — diversity is measured across vendors, not tiers. */
export type Vendor = 'claude' | 'cognitum' | 'gpt' | 'openrouter' | 'local' | 'unknown';

/** A charge filed by a prosecutor (or surfaced by a deeper reviewer). */
export interface Charge {
  id: string;
  /** A fatal charge blocks the ship; a non-fatal charge remands it. */
  fatal: boolean;
  /** Did the charge reproduce (oracle-grade) rather than stay a claim? */
  reproduced: boolean;
  /** Overturn depth at which it was surfaced (0 = base panel, ≥1 = deeper rounds). */
  depthFound: number;
}

export interface PanelSeat {
  role: string;       // 'writer' | 'defense' | 'jury' | 'prosecutor.<name>' | 'deeperReviewer'
  provider: string;   // provider id, e.g. 'cognitum-high', 'codex', 'claude-code'
}

/** Map a provider id to its coarse vendor. */
export function vendorOf(providerId: string): Vendor {
  const p = providerId.toLowerCase();
  if (p.startsWith('claude')) return 'claude';
  if (p.startsWith('cognitum')) return 'cognitum';
  if (p === 'codex' || p === 'openai' || p.startsWith('gpt') || p.startsWith('o3') || p.startsWith('o4')) return 'gpt';
  if (p.startsWith('openrouter')) return 'openrouter';
  if (p === 'ollama' || p === 'local') return 'local';
  return 'unknown';
}

/**
 * Resolve the verdict from the surviving charges, applying the overturn window.
 *
 * THE OVERTURN MECHANIC: only charges surfaced at depth ≤ `overturnDepth` count.
 * With `overturnDepth = 0` the deeper-review rounds are disabled, so a mutant a
 * shallow pass missed (surfaced at depth ≥ 1) does NOT count and the verdict
 * stays SHIP — which is exactly the false-SHIP the court exists to catch. With
 * `overturnDepth ≥ 1` that same charge counts and flips the verdict. This
 * asymmetry is the whole point: a SHIP must SURVIVE escalation.
 */
export function resolveVerdict(charges: Charge[], overturnDepth: number): Verdict {
  const surviving = charges.filter((c) => c.reproduced && c.depthFound <= overturnDepth);
  if (surviving.some((c) => c.fatal)) return 'BLOCK';
  if (surviving.length > 0) return 'REMAND';
  return 'SHIP';
}

export interface PanelPolicy {
  /** Minimum number of DISTINCT vendors on the panel (default 2). */
  minVendors?: number;
}

/**
 * Validate a seated panel against the court's anti-collusion invariants.
 * Returns a list of violation codes (empty == valid).
 *   - 'writerIsNeverJuror' : the jury shares a vendor with the writer/defense.
 *   - 'vendor-diversity'   : fewer than `minVendors` distinct vendors seated.
 */
export function validatePanel(panel: PanelSeat[], policy: PanelPolicy = {}): string[] {
  const minVendors = policy.minVendors ?? 2;
  const violations: string[] = [];

  const vendorsSeated = new Set(panel.map((s) => vendorOf(s.provider)));
  if (vendorsSeated.size < minVendors) violations.push('vendor-diversity');

  const jury = panel.find((s) => s.role === 'jury');
  const writerLike = panel.filter((s) => s.role === 'writer' || s.role === 'defense');
  if (jury) {
    const juryVendor = vendorOf(jury.provider);
    if (writerLike.some((w) => vendorOf(w.provider) === juryVendor)) {
      violations.push('writerIsNeverJuror');
    }
  }
  return violations;
}

/**
 * DoE-gated scoring: emit a numeric score ONLY when the operator asked for one
 * AND the scoring rubric passed the ADR-122 ANOVA screen (it actually
 * discriminates). Otherwise the court reports the verdict class + charges, never
 * a noise "91/100".
 */
export function shouldEmitScore(rubricDoePassed: boolean, emitScore: boolean): boolean {
  return emitScore && rubricDoePassed;
}
