# Seeded-mutant delivery (qe-court acceptance fixture)

A deliberately-planted defect used by `evals/qe-court.yaml` case
`overturn-catches-mutant`. **Do not "fix" it** — it is the test.

## The planted defect

`budget.ts` `canSpend()` uses `<=` where the contract requires `<`:

```ts
return budget.spentUsd + amountUsd <= budget.capUsd;   // allows landing exactly ON the cap
```

The documented contract is "total spend must stay **strictly below** the cap."
The mutant lets spend land exactly on the cap — a real off-by-one at the boundary
(directly analogous to the ADR-123 budget-cap enforcement AQE actually ships).

## Why a shallow reviewer rates it SHIP

- The code reads cleanly and is well-commented.
- `budget.test.ts` is **green** — but only covers clearly-under and clearly-over.
- No test asserts `spentUsd + amountUsd === capUsd`, so nothing fails.

A single happy-path reviewer sees "clean code + passing tests" → `SHIP` (~91/100).

## Why the court overturns it

- The **mutation** prosecutor mutates `<=`→`<` and finds the boundary case survives (weak test).
- The **sherlock** / **codex-review** lenses read the contract ("strictly below") and
  spot that `<=` admits the cap-equal case.
- The **overturn round** escalates and the boundary charge reproduces → verdict flips to
  `BLOCK` (or `REMAND` with "add the exact-cap test + change `<=` to `<`").

## The oracle property

- Correct behavior: final verdict ∈ {BLOCK, REMAND}.
- Regression guard: with `overturnDepth: 0`, the verdict MUST regress to `SHIP` —
  proving the overturn mechanic is what earns its keep.
