/**
 * The delivery's own tests — GREEN, but they only exercise the happy path
 * (clearly-under, clearly-over). They never assert the exact-cap boundary, so
 * they pass against the planted mutant. This is what makes a shallow reviewer
 * (code looks fine + tests green) rate the delivery SHIP.
 */
import { describe, it, expect } from 'vitest';
import { canSpend } from './budget';

describe('canSpend', () => {
  it('allows a charge well under the cap', () => {
    expect(canSpend({ capUsd: 20, spentUsd: 5 }, 1)).toBe(true);
  });

  it('rejects a charge well over the cap', () => {
    expect(canSpend({ capUsd: 20, spentUsd: 19 }, 5)).toBe(false);
  });

  // NOTE: no case for spentUsd + amountUsd === capUsd. That is the uncovered
  // boundary the court's mutation/overturn lens must surface.
});
