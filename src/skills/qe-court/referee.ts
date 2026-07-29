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
  /**
   * Spelling used by the shipped `config.json` `options` block. Accepted as a
   * synonym for `minVendors` so the config's declared policy actually binds to
   * the validator instead of silently doing nothing (issue #576).
   */
  minDistinctVendors?: number;
  /**
   * Enforce that the jury vendor differs from the writer/defense vendor.
   * Defaults to TRUE. Setting it to `false` deliberately weakens the court's
   * central anti-collusion rule — the option exists so `config.json` controls
   * what it claims to control, not as an invitation to disable it.
   */
  writerIsNeverJuror?: boolean;
}

/**
 * Validate a seated panel against the court's anti-collusion invariants.
 * Returns a list of violation codes (empty == valid).
 *   - 'writerIsNeverJuror' : the jury shares a vendor with the writer/defense.
 *   - 'vendor-diversity'   : fewer than `minVendors` distinct vendors seated.
 *   - 'missing-jury'       : no jury seated, so no verdict can be rendered.
 */
export function validatePanel(panel: PanelSeat[], policy: PanelPolicy = {}): string[] {
  const minVendors = policy.minVendors ?? policy.minDistinctVendors ?? 2;
  const violations: string[] = [];

  const vendorsSeated = new Set(panel.map((s) => vendorOf(s.provider)));
  if (vendorsSeated.size < minVendors) violations.push('vendor-diversity');

  const jury = panel.find((s) => s.role === 'jury');
  const writerLike = panel.filter((s) => s.role === 'writer' || s.role === 'defense');
  if (!jury) {
    violations.push('missing-jury');
  } else if (policy.writerIsNeverJuror !== false) {
    const juryVendor = vendorOf(jury.provider);
    if (writerLike.some((w) => vendorOf(w.provider) === juryVendor)) {
      violations.push('writerIsNeverJuror');
    }
  }
  return violations;
}

/** A `routing` entry in the skill's `config.json`: one seat, one provider. */
export interface RoutingSeat {
  provider?: string;
  model?: string;
}

/** The `routing` map in `config.json`, keyed by role. `_`-prefixed keys are notes. */
export type CourtRouting = Record<string, RoutingSeat | undefined>;

/**
 * Seat a panel from the skill's `config.json` `routing` map.
 *
 * This is the missing link that let a bad panel ship: the invariants were
 * enforceable but nothing converted config → panel, so `validatePanel` was
 * never reached outside its own unit test (issue #576). Meta keys (`_note`,
 * `_description`, …) and provider-less entries are skipped, never seated.
 */
export function panelFromRouting(routing: CourtRouting): PanelSeat[] {
  return Object.entries(routing ?? {})
    .filter(([role]) => !role.startsWith('_'))
    .filter(([, seat]) => typeof seat?.provider === 'string' && seat.provider.length > 0)
    .map(([role, seat]) => ({ role, provider: seat!.provider! }));
}

/** The subset of the skill's `config.json` the referee needs to rule on a panel. */
export interface CourtConfig {
  routing?: CourtRouting;
  options?: PanelPolicy;
}

/**
 * Validate a whole `config.json` — seat the panel from `routing`, then apply
 * `options` as the policy. Returns violation codes (empty == valid).
 *
 * The court MUST call this before convening; a non-empty result means the panel
 * cannot render a trustworthy verdict and the run should abort rather than seat
 * a colluding panel.
 */
export function validateCourtConfig(config: CourtConfig): string[] {
  return validatePanel(panelFromRouting(config.routing ?? {}), config.options ?? {});
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
