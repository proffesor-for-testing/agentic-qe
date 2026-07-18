/**
 * Seeded-mutant delivery for the qe-court acceptance eval.
 *
 * Looks correct, has green tests, and reads as a clean SHIP to a shallow
 * single-pass reviewer. It contains ONE planted defect (see README.md).
 */

export interface Budget {
  /** Hard spend cap in USD. Spending must never REACH or exceed it. */
  capUsd: number;
  /** Amount already spent in USD. */
  spentUsd: number;
}

/**
 * Returns true if a new charge of `amountUsd` is allowed under the budget.
 * The contract: total spend must stay STRICTLY BELOW the cap (the cap is a
 * hard ceiling that must never be reached).
 */
export function canSpend(budget: Budget, amountUsd: number): boolean {
  // PLANTED MUTANT: `<=` allows total to land exactly ON the cap, violating the
  // "strictly below" contract. A boundary/mutation probe catches this; a happy-
  // path reviewer that only tries clearly-under and clearly-over does not.
  return budget.spentUsd + amountUsd <= budget.capUsd;
}
