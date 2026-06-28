/**
 * P3 tests for the regenerability gate (ADR-113). Durable-first: these are
 * invariant/behavioral assertions on the scoring contract, not coupled to the
 * implementation — they would survive a rewrite of regenerability-gate.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTier,
  regenerabilityScore,
  evaluateRegenerabilityGate,
  DEFAULT_REGENERABILITY_GATE,
  type ModuleTestProfile,
} from '../../../src/feedback/regenerability-gate';

const durable = (mutationScore: number): ModuleTestProfile => ({
  module: 'm',
  mutationScore,
  hasDurable: true,
  hasEphemeral: true,
});
const ephemeralOnly = (mutationScore: number): ModuleTestProfile => ({
  module: 'm',
  mutationScore,
  hasDurable: false,
  hasEphemeral: true,
});
const untested: ModuleTestProfile = { module: 'm', mutationScore: 0, hasDurable: false };

describe('classifyTier', () => {
  it('picks the highest tier present (durable beats ephemeral)', () => {
    expect(classifyTier(durable(1))).toBe('durable');
  });

  it('reports none when a module has no tests', () => {
    expect(classifyTier(untested)).toBe('none');
  });
});

describe('regenerabilityScore (invariants)', () => {
  it('equals the mutation score for durable-backed modules', () => {
    expect(regenerabilityScore(durable(0.8)).score).toBe(0.8);
  });

  it('discounts ephemeral-only tests below their mutation score (they will not survive a rewrite)', () => {
    const m = ephemeralOnly(1);
    expect(regenerabilityScore(m).score).toBeLessThan(m.mutationScore);
  });

  it('scores an untested module at zero (fails the Deletion Test)', () => {
    expect(regenerabilityScore(untested).score).toBe(0);
  });

  it('is monotonic in mutation score for a fixed tier', () => {
    expect(regenerabilityScore(durable(0.9)).score).toBeGreaterThan(regenerabilityScore(durable(0.4)).score);
  });
});

describe('evaluateRegenerabilityGate', () => {
  it('passes when every module clears both thresholds', () => {
    const verdict = evaluateRegenerabilityGate([durable(0.9)]);
    expect(verdict.passed).toBe(true);
    expect(verdict.blocking).toBe(false);
  });

  it('warns but never blocks in default (warn) mode even when thresholds fail', () => {
    const verdict = evaluateRegenerabilityGate([ephemeralOnly(0.2)]);
    expect(verdict.passed).toBe(false);
    expect(verdict.blocking).toBe(false); // warn-by-default
    expect(verdict.failures[0].module).toBe('m');
  });

  it('blocks CI only in opt-in block mode when thresholds fail', () => {
    const verdict = evaluateRegenerabilityGate([untested], { ...DEFAULT_REGENERABILITY_GATE, mode: 'block' });
    expect(verdict.passed).toBe(false);
    expect(verdict.blocking).toBe(true);
  });

  it('reports a clean summary for an empty module set', () => {
    expect(evaluateRegenerabilityGate([]).passed).toBe(true);
  });
});
