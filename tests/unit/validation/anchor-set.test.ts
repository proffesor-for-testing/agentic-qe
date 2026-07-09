/**
 * ADR-117 frozen anchor set: loader hash-drift refusal + no-regression contract.
 *
 * The whole point of the anchor is that it cannot be silently edited: the loader
 * recomputes the content hash and throws on drift. Also verifies the
 * constant-denominator mean and the zero-tolerance no-regression gate.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadAnchorSet,
  computeContentHash,
  canonicalizeItems,
  anchorMean,
  meetsNoRegression,
  type AnchorSet,
  type AnchorItem,
} from '../../../src/validation/anchor-set.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FROZEN = join(process.cwd(), 'verification/anchors/qe-anchor-v1.json');

describe('loadAnchorSet — the real frozen v1 anchor', () => {
  it('should_load_the_committed_anchor_without_drift', () => {
    const a = loadAnchorSet(FROZEN);
    expect(a.items.length).toBe(5);
    expect(a.passBar).toEqual({ mutationThreshold: 0.8, checklistCoverage: 1.0 });
    expect(a.anchorTol).toBe(0);
    // every item has the pinned constant denominator of 4 requirements
    for (const it of a.items) expect(it.requirements.length).toBe(4);
  });

  it('should_have_a_contentHash_matching_its_items', () => {
    const a = loadAnchorSet(FROZEN);
    expect(a.contentHash).toBe(computeContentHash(a.items));
  });
});

describe('loadAnchorSet — hash-drift refusal', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'anchor-'));
    path = join(dir, 'a.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('should_throw_when_an_item_is_silently_edited', () => {
    // Arrange: take the real anchor and tamper one requirement WITHOUT updating the hash.
    const a = JSON.parse(readFileSync(FROZEN, 'utf8')) as AnchorSet;
    a.items[0].requirements[0] = 'TAMPERED requirement';
    writeFileSync(path, JSON.stringify(a));

    // Act + Assert
    expect(() => loadAnchorSet(path)).toThrow(/hash drift/i);
  });

  it('should_throw_when_the_recorded_hash_is_wrong', () => {
    const a = JSON.parse(readFileSync(FROZEN, 'utf8')) as AnchorSet;
    a.contentHash = 'deadbeef';
    writeFileSync(path, JSON.stringify(a));
    expect(() => loadAnchorSet(path)).toThrow(/Refusing to load a mutated frozen anchor/);
  });

  it('should_throw_on_an_empty_anchor', () => {
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(FROZEN, 'utf8')), items: [], contentHash: computeContentHash([]) }));
    expect(() => loadAnchorSet(path)).toThrow(/non-empty/);
  });
});

describe('canonicalizeItems — order independence', () => {
  it('should_hash_identically_regardless_of_item_or_key_order', () => {
    const base: AnchorItem = {
      id: 'X', moduleName: 'x', inputUnderTest: 'i', referenceImpl: 'r',
      requirements: ['a', 'b'], expectedMutants: 1,
    };
    const other: AnchorItem = { ...base, id: 'Y' };
    // reversed order + a key-shuffled clone must canonicalize identically
    const reordered = { expectedMutants: 1, requirements: ['a', 'b'], referenceImpl: 'r', inputUnderTest: 'i', moduleName: 'x', id: 'X' } as AnchorItem;
    expect(canonicalizeItems([base, other])).toBe(canonicalizeItems([other, reordered]));
  });
});

describe('anchorMean + meetsNoRegression', () => {
  it('should_average_over_a_constant_denominator', () => {
    expect(anchorMean([1, 1, 0.5, 1, 1])).toBeCloseTo(0.9);
  });

  it('should_reject_any_drop_at_zero_tolerance', () => {
    expect(meetsNoRegression(0.9, 0.9, 0)).toBe(true);   // equal is allowed
    expect(meetsNoRegression(0.89, 0.9, 0)).toBe(false); // any drop rejected
    expect(meetsNoRegression(0.95, 0.9, 0)).toBe(true);  // improvement allowed
  });

  it('should_absorb_noise_when_tolerance_is_positive', () => {
    expect(meetsNoRegression(0.88, 0.9, 0.05)).toBe(true);
    expect(meetsNoRegression(0.84, 0.9, 0.05)).toBe(false);
  });
});
