/**
 * Regression: sealedHash must be STABLE across a JSON serialize/parse roundtrip.
 *
 * The `canonicalJson` bug (fixed 2026-07-08, found only by a live DB persist)
 * hashed an `undefined`-valued optional key as `null`, but `JSON.stringify`
 * (the DB store) DROPS undefined keys — so a receipt's recomputed `sealedHash`
 * differed after reload → `sealIntact` failed → it would have silently invalidated
 * EVERY persisted receipt. This test fails against the buggy canonicalJson and
 * pins the fix. (Addresses brutal-review MED-7 / HIGH-5: a corruption bug that
 * hid behind green tests.)
 */

import { describe, it, expect } from 'vitest';
import { sealedHash, type SealedInputs } from '../../../src/validation/gate-reexecute.js';

// allowJudgeTier is deliberately absent (undefined) — the field the bug tripped on.
const BASE: SealedInputs = {
  candidateHeldOut: 0.85,
  baselineHeldOut: 0.80,
  candidateAnchorMean: 0.92,
  baselineAnchorMean: 0.90,
  anchorHash: 'e566f31a',
  anchorTol: 0.0,
  provenanceTier: 'oracle:test-exec',
};

describe('sealedHash — JSON-roundtrip stability (canonicalJson undefined-key regression)', () => {
  it('should_produce_an_identical_hash_after_a_JSON_stringify_parse_roundtrip', () => {
    const before = sealedHash(BASE);
    // exactly what receipt-store does: JSON.stringify to the DB, JSON.parse on load.
    const roundtripped = JSON.parse(JSON.stringify(BASE)) as SealedInputs;
    const after = sealedHash(roundtripped);
    expect(after).toBe(before);
  });

  it('should_hash_an_explicit_undefined_key_the_same_as_an_absent_one', () => {
    const withUndefined = { ...BASE, allowJudgeTier: undefined };
    const withoutKey = { ...BASE };
    expect(sealedHash(withUndefined)).toBe(sealedHash(withoutKey));
  });

  it('should_still_distinguish_a_genuinely_different_sealed_input', () => {
    // sanity: the fix must not collapse real differences into one hash.
    expect(sealedHash({ ...BASE, candidateHeldOut: 0.99 })).not.toBe(sealedHash(BASE));
  });

  it('should_be_key_order_independent', () => {
    const reordered: SealedInputs = {
      provenanceTier: BASE.provenanceTier, anchorTol: BASE.anchorTol, anchorHash: BASE.anchorHash,
      baselineAnchorMean: BASE.baselineAnchorMean, candidateAnchorMean: BASE.candidateAnchorMean,
      baselineHeldOut: BASE.baselineHeldOut, candidateHeldOut: BASE.candidateHeldOut,
    };
    expect(sealedHash(reordered)).toBe(sealedHash(BASE));
  });
});
