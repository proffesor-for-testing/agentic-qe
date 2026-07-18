/**
 * QE-Court referee oracle suite (ADR-124).
 *
 * These ARE the acceptance eval for the qe-court skill — the command-eval yaml
 * runs them through the `aqe eval` CLI. Each case is an oracle: it passes on the
 * correct referee logic and FAILS on a seeded regression (e.g. an overturn
 * mechanic that lets a mutant SHIP).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveVerdict,
  validatePanel,
  shouldEmitScore,
  vendorOf,
  type Charge,
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
});
