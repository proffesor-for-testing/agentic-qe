/**
 * QE-Court referee oracle suite (ADR-124).
 *
 * These ARE the acceptance eval for the qe-court skill — the command-eval yaml
 * runs them through the `aqe eval` CLI. Each case is an oracle: it passes on the
 * correct referee logic and FAILS on a seeded regression (e.g. an overturn
 * mechanic that lets a mutant SHIP).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveVerdict,
  validatePanel,
  validateCourtConfig,
  panelFromRouting,
  shouldEmitScore,
  vendorOf,
  type Charge,
  type CourtConfig,
  type PanelSeat,
} from '../../../../src/skills/qe-court/referee';

// A seeded mutant charge: a fatal, reproduced boundary defect the base panel
// missed and only the deeper (overturn) reviewer surfaced (depthFound = 1).
// Mirrors the seeded-mutant fixture (canSpend `<=` vs `<`).
const MUTANT_CHARGE: Charge = { id: 'boundary-off-by-one', fatal: true, reproduced: true, depthFound: 1 };

describe('qe-court referee', () => {
  it('overturn_catches_mutant__flips_shallow_ship_to_block', () => {
    // With the overturn round active (depth >= 1), the deeper reviewer's charge counts.
    expect(resolveVerdict([MUTANT_CHARGE], 2)).toBe('BLOCK');
  });

  it('overturn_disabled__regresses_to_ship__proving_the_mechanic', () => {
    // KILL CONDITION: with overturnDepth = 0 the mutant (found at depth 1) is NOT
    // counted, so the verdict regresses to SHIP — proving the overturn round is
    // what earns its keep. If resolveVerdict ignored depth, this would fail.
    expect(resolveVerdict([MUTANT_CHARGE], 0)).toBe('SHIP');
  });

  it('writer_not_juror_enforced__same_vendor_is_a_violation', () => {
    const badPanel: PanelSeat[] = [
      { role: 'writer', provider: 'codex' },   // gpt
      { role: 'jury', provider: 'codex' },     // gpt — same vendor as writer
      { role: 'prosecutor.sherlock', provider: 'cognitum-high' },
    ];
    expect(validatePanel(badPanel)).toContain('writerIsNeverJuror');

    const goodPanel: PanelSeat[] = [
      { role: 'writer', provider: 'codex' },        // gpt
      { role: 'jury', provider: 'cognitum-high' },  // cognitum — different vendor
      { role: 'prosecutor.brutal-honesty', provider: 'claude-code' },
    ];
    expect(validatePanel(goodPanel)).not.toContain('writerIsNeverJuror');
  });

  it('vendor_diversity_enforced__single_vendor_panel_is_a_violation', () => {
    const singleVendor: PanelSeat[] = [
      { role: 'writer', provider: 'cognitum-low' },
      { role: 'prosecutor.sherlock', provider: 'cognitum-high' },
      { role: 'jury', provider: 'cognitum-mid' },
    ];
    expect(validatePanel(singleVendor)).toContain('vendor-diversity');

    const diverse: PanelSeat[] = [
      { role: 'writer', provider: 'cognitum-low' },   // cognitum
      { role: 'prosecutor.codex-review', provider: 'codex' }, // gpt
      { role: 'jury', provider: 'claude-code' },       // claude
    ];
    expect(validatePanel(diverse)).not.toContain('vendor-diversity');
  });

  it('no_score_without_doe_gate__suppresses_unvalidated_number', () => {
    expect(shouldEmitScore(false, true)).toBe(false); // rubric not DoE-validated → no number
    expect(shouldEmitScore(true, true)).toBe(true);   // validated + requested → emit
    expect(shouldEmitScore(true, false)).toBe(false); // not requested → no number
  });

  it('verdict_classes__block_remand_ship_resolve_correctly', () => {
    const fatal: Charge = { id: 'f', fatal: true, reproduced: true, depthFound: 0 };
    const nonFatal: Charge = { id: 'n', fatal: false, reproduced: true, depthFound: 0 };
    const unreproduced: Charge = { id: 'u', fatal: true, reproduced: false, depthFound: 0 };
    expect(resolveVerdict([fatal], 2)).toBe('BLOCK');
    expect(resolveVerdict([nonFatal], 2)).toBe('REMAND');
    expect(resolveVerdict([unreproduced], 2)).toBe('SHIP'); // killed in the refuter round
    expect(resolveVerdict([], 2)).toBe('SHIP');
  });

  it('vendor_mapping__distinguishes_the_three_core_vendors', () => {
    expect(vendorOf('claude-code')).toBe('claude');
    expect(vendorOf('cognitum-high')).toBe('cognitum');
    expect(vendorOf('codex')).toBe('gpt');
    expect(vendorOf('ollama')).toBe('local');
  });

  it('missing_jury__is_a_violation__no_jury_no_verdict', () => {
    const juryless: PanelSeat[] = [
      { role: 'defense', provider: 'claude-code' },
      { role: 'prosecutor.codex-review', provider: 'codex' },
    ];
    expect(validatePanel(juryless)).toContain('missing-jury');
  });

  it('config_option_names_bind__minDistinctVendors_is_honored', () => {
    // KILL CONDITION: config.json spells the policy `minDistinctVendors`, but
    // PanelPolicy only accepted `minVendors` — so the shipped policy silently did
    // nothing and only APPEARED to work because both defaulted to 2 (issue #576).
    const twoVendors: PanelSeat[] = [
      { role: 'defense', provider: 'claude-code' },  // claude
      { role: 'jury', provider: 'cognitum-high' },   // cognitum
    ];
    expect(validatePanel(twoVendors, { minDistinctVendors: 2 })).not.toContain('vendor-diversity');
    expect(validatePanel(twoVendors, { minDistinctVendors: 3 })).toContain('vendor-diversity');
  });

  it('writerIsNeverJuror_option_binds__false_disables_the_check', () => {
    const colluding: PanelSeat[] = [
      { role: 'defense', provider: 'cognitum-low' },
      { role: 'jury', provider: 'cognitum-high' },
      { role: 'prosecutor.codex-review', provider: 'codex' },
    ];
    // Default (and explicit true) enforce it; only an explicit false weakens it.
    expect(validatePanel(colluding)).toContain('writerIsNeverJuror');
    expect(validatePanel(colluding, { writerIsNeverJuror: true })).toContain('writerIsNeverJuror');
    expect(validatePanel(colluding, { writerIsNeverJuror: false })).not.toContain('writerIsNeverJuror');
  });

  it('panelFromRouting__seats_roles_and_skips_meta_keys', () => {
    const panel = panelFromRouting({
      _note: undefined,
      defense: { provider: 'claude-code' },
      jury: { provider: 'cognitum-high' },
      'prosecutor.broken': {},           // no provider → never seated
    } as never);
    expect(panel).toEqual([
      { role: 'defense', provider: 'claude-code' },
      { role: 'jury', provider: 'cognitum-high' },
    ]);
  });
});

/**
 * THE REGRESSION GUARD for issue #576.
 *
 * The court's invariants were enforceable and unit-tested, but nothing ever ran
 * them against the config we actually SHIP — so the default template violated
 * `writerIsNeverJuror` from the moment it was copied into a user's project, with
 * zero user action. These cases validate the real files on disk, so a future
 * routing edit that re-breaks the panel fails here instead of in a user's court.
 */
describe('qe-court shipped config is a valid panel (issue #576)', () => {
  const CONFIGS = {
    'assets/skills/qe-court/config.json': resolve(__dirname, '../../../../assets/skills/qe-court/config.json'),
    '.claude/skills/qe-court/config.json': resolve(__dirname, '../../../../.claude/skills/qe-court/config.json'),
  };

  for (const [label, path] of Object.entries(CONFIGS)) {
    it(`${label}__seats_a_panel_with_no_violations`, () => {
      const config = JSON.parse(readFileSync(path, 'utf8')) as CourtConfig;
      expect(validateCourtConfig(config)).toEqual([]);
    });
  }

  it('the_two_shipped_copies_do_not_drift', () => {
    const [a, b] = Object.values(CONFIGS).map((p) => readFileSync(p, 'utf8'));
    expect(a).toEqual(b);
  });

  it('shipped_panel_keeps_the_overturn_round_cross_vendor', () => {
    // Not a validatePanel rule, but the reason we moved `defense` rather than
    // `jury`: an escalation reviewed by the jury's own vendor is a weaker
    // overturn round, which is the mechanic the whole court rests on.
    const config = JSON.parse(
      readFileSync(CONFIGS['assets/skills/qe-court/config.json'], 'utf8'),
    ) as CourtConfig;
    const seatOf = (role: string) =>
      panelFromRouting(config.routing!).find((s) => s.role === role)!;
    expect(vendorOf(seatOf('jury').provider)).not.toBe(vendorOf(seatOf('deeperReviewer').provider));
  });
});
