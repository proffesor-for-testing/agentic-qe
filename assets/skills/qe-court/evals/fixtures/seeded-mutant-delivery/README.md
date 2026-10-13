# Seeded-mutant delivery (qe-court acceptance fixture)

A deliberately-planted defect used by `evals/qe-court.yaml` case
`overturn-catches-mutant`. **Do not "fix" it** — it is the test.

The files ship as `budget.ts.fixture` and `budget-tests.ts.fixture`, not
`budget.ts` / `budget.test.ts`: `aqe init` copies this skill into the user's
project, and a `*.test.ts` name there is collected by the user's own vitest or
jest run (#1017). To exercise the fixture by hand, copy both files to a scratch
directory and drop the `.fixture` suffix (rename `budget-tests.ts` to
`budget.test.ts`).

## The planted defect

`budget.ts.fixture` `canSpend()` uses `<=` where the contract requires `<`:

```ts
return budget.spentUsd + amountUsd <= budget.capUsd;   // allows landing exactly ON the cap
```

The documented contract is "total spend must stay **strictly below** the cap."
The mutant lets spend land exactly on the cap — a real off-by-one at the boundary
(directly analogous to the ADR-123 budget-cap enforcement AQE actually ships).

## Why a shallow reviewer rates it SHIP

- The code reads cleanly and is well-commented.
- `budget-tests.ts.fixture` (the delivery's own tests) is **green** — but only covers clearly-under and clearly-over.
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
