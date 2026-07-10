# ADR-122 DoE Harness Screen — Design (DESIGN + SCAFFOLD ONLY, NO SPEND)

> **Status:** pre-registered design. **Nothing here has been run.** No live model
> calls, no token spend, no network eval have occurred. Executing the screen
> requires explicit user budget confirmation (see [§9 STOP](#9-stop-requires-user-spend-confirmation)).
>
> **Companion scaffold:** `scripts/doe-screen-scaffold.mjs` — a zero-dependency,
> no-network dry-run planner that prints this design + a cost estimate and
> refuses to spend. Run `node scripts/doe-screen-scaffold.mjs` (dry-run) or
> `--smoke` ($0 pipeline test).

This screens **AQE's own harness configuration** as factors in a
fractional-factorial designed experiment, per
[ADR-122](./adrs/ADR-122-designed-experiment-harness-gate.md). The thesis it
operationalizes: *more harness can lower reliability, and only a designed
experiment can tell you which.* retort's `beads` tooling is the cautionary
proof — a plausible addition that ANOVA showed added **+10% cost with no quality
or coverage payoff** and **destabilized hard runs** (maturity 0.88→0.54), so it
was dropped (`/workspaces/retort/README.md:248-251, 299`).

---

## 1. What we are screening and why

AQE keeps adding orchestration knobs on the intuition that they help. Two of
them are direct `beads` analogs — plausible, token-costly, unproven:

- **Retrieval** (the ADR-118 receipt-gated flywheel policy): injects retrieved
  patterns into the generation context. Costs input tokens every run. Does it
  actually raise the reliability of generated tests, or is it `beads`?
- **Scaffold** (plan-and-solve / reflexion): extra reasoning passes. Doubles
  tokens under reflexion. Does the extra pass catch more mutants, or just
  over-iterate and cost money?

These are the **features under screen**. `model` and `prompt` are context
factors we cross them against so ANOVA can de-confound (retort's clean
separation of concerns: model governs reliability, prompt/methodology barely
moves it — `README.md:249, 222-231`).

---

## 2. Factor table (factors × levels)

| Factor | Role | Levels | Grounding |
|---|---|---|---|
| **model** | context/blocking | `qwen3-coder:30b` (local Ollama) · `haiku-4.5` (cheap cloud) · `opus-4.8` (frontier) | AQE's 3-tier routing (CLAUDE.md ADR-026); local default per `project_local_qe_model_qwen3coder30b`; qwen3:30b clears the D3 test-gen floor (`project_d3_qe_test_gen_model_floor`) |
| **prompt** | context/blocking | `neutral` · `TDD` · `ATDD` | retort exp-13 methodology factor (`README.md:204-235`) |
| **retrieval** | **FEATURE** | `off` · `on` | ADR-118 flywheel policy — the `beads`-analog on trial |
| **scaffold** | **FEATURE** | `none` · `plan-and-solve` · `reflexion` | retort-metaharness scaffold factor (`retort_metaharness/factors.py`, `README.md:30`) |

Full factorial = 3 × 3 × 2 × 3 = **54 cells**.

**Deliberately excluded** (kept as held-constant blocking constants, not factors,
to keep the screen small and the anchor honest):

- **task/fixture** is held constant at the **ADR-117 frozen oracle anchor set** —
  the reference implementations + operator mutants that the oracle grades against
  (`src/validation/oracle-eval.ts`, `tests/unit/validation/oracle-eval.test.ts`).
  Holding it constant is what makes replicates comparable. Promoting fixture
  difficulty to a 2-level factor (easy/hard fixture family) is the first planned
  **augmentation** once the 4-factor screen clears (retort's `intake`/D-optimal
  augmentation path, `README.md:333`).

---

## 3. Response metric — pass-proportion over N replicates (NOT single runs)

The primary response is **pass-proportion**: over N replicate runs of a cell,
the fraction whose generated tests clear the oracle gate. This is retort's
headline metric read as *"the probability a single run of this stack comes out
correct"* (`README.md:111`).

**Why not a single run per cell.** retort measured single-pass LLM grading
swinging **0.33 ↔ 1.0 on identical code** (`README.md:15`); a single replicate is
noise. ADR-122 §2 makes N replicates mandatory. We default **N = 5** (N = 3 is
the cheap floor).

**The oracle (ADR-113).** The gate is **not** an LLM judge. It is
`evaluateOracle` (`src/validation/oracle-eval.ts`): the generated test is run
with real `node --test` against a reference impl (must pass) and against every
first-order operator mutant; the **mutation kill rate** is the pass signal, and
a test that asserts nothing scores 0 and fails
(`tests/unit/validation/oracle-eval.test.ts`). A cell **run passes** when its
kill rate meets the gate (default ≥ threshold, or `== 1.0` for a strict anchor).
**Consequence for cost:** grading is compute-only — it spends **$0 in tokens**.
Only generation is metered. This is a structural advantage over retort, whose
spec-gate pays for a second-opinion LLM judge.

**Secondary responses** (recorded per run, log-transformed for ANOVA):
`cost_per_run`, `tokens`, `latency_s` — so a feature that buys no reliability but
adds cost is caught exactly as `beads` was.

---

## 4. Design choice — half-fraction screen (Resolution IV target)

| Option | Cells (×N=5) | Verdict |
|---|---|---|
| Full factorial (54) | 270 runs | Rejected for the screen: estimates every interaction we don't yet need, at 2× the cost. Reserve for **confirmation** on surviving factors. |
| **Half-fraction (27), Res IV target** | **135 runs** | **Selected.** Main effects estimable **clear of two-factor interactions**; 2FIs aliased among themselves. |
| Quarter-fraction (~14), Res III | ~70 runs | Rejected: Res III aliases main effects **with** 2FIs — exactly the confounding ADR-122 exists to avoid. Fine only as a first ultra-cheap sniff. |

**Why Resolution IV, not III.** The entire point of ADR-122 is *de-confounding a
feature's effect from model/task noise* (`ADR-122:66`). Res III would alias
`retrieval` or `scaffold` main effects with two-factor interactions — you could
not tell a real feature effect from an interaction artifact. Res IV keeps every
main effect clean. retort's own screening/characterization split uses exactly
this ladder: screening = Res III (mains only), characterization = Res IV (+ 2FI)
(`retort/src/retort/design/generator.py:27-28`,
`design/aliasing.py:206`). We run at the **characterization/Res-IV** level
because the mains are precisely what the gate rules on.

**Aliasing to publish before the run.** Per ADR-108 pre-registration, generate
and commit the aliasing report so the analysis cannot be retrofitted:

```
retort design generate --phase characterization --fraction 0.5 --config <factors>
retort report aliasing --phase characterization --max-order 2 --config <factors>
```

> The scaffold's own cell list uses a transparent modular balanced-subset
> selector (documented in the script) as a **stand-in** for retort's
> aliasing-aware generator. For the authoritative matrix, use the retort commands
> above; the scaffold is for cost + pipeline shape, not the final aliasing
> structure.

---

## 5. Concrete design matrix (half-fraction, 27 cells)

Produced by `node scripts/doe-screen-scaffold.mjs` (balanced subset: 9 cells per
model, each prompt/retrieval/scaffold level evenly represented). Each cell is run
**N=5** times → 135 runs.

| # | model | prompt | retrieval | scaffold |
|--:|---|---|---|---|
| 1 | qwen3-coder:30b | neutral | off | none |
| 2 | opus-4.8 | neutral | off | none |
| 3 | haiku-4.5 | TDD | off | none |
| 4 | qwen3-coder:30b | ATDD | off | none |
| 5 | opus-4.8 | ATDD | off | none |
| 6 | haiku-4.5 | neutral | on | none |
| 7 | qwen3-coder:30b | TDD | on | none |
| 8 | opus-4.8 | TDD | on | none |
| 9 | haiku-4.5 | ATDD | on | none |
| 10 | haiku-4.5 | neutral | off | plan-and-solve |
| 11 | qwen3-coder:30b | TDD | off | plan-and-solve |
| 12 | opus-4.8 | TDD | off | plan-and-solve |
| 13 | haiku-4.5 | ATDD | off | plan-and-solve |
| 14 | qwen3-coder:30b | neutral | on | plan-and-solve |
| 15 | opus-4.8 | neutral | on | plan-and-solve |
| 16 | haiku-4.5 | TDD | on | plan-and-solve |
| 17 | qwen3-coder:30b | ATDD | on | plan-and-solve |
| 18 | opus-4.8 | ATDD | on | plan-and-solve |
| 19 | qwen3-coder:30b | neutral | off | reflexion |
| 20 | opus-4.8 | neutral | off | reflexion |
| 21 | haiku-4.5 | TDD | off | reflexion |
| 22 | qwen3-coder:30b | ATDD | off | reflexion |
| 23 | opus-4.8 | ATDD | off | reflexion |
| 24 | haiku-4.5 | neutral | on | reflexion |
| 25 | qwen3-coder:30b | TDD | on | reflexion |
| 26 | opus-4.8 | TDD | on | reflexion |
| 27 | haiku-4.5 | ATDD | on | reflexion |

---

## 6. ANOVA model — what is estimable

Type-II ANOVA per response (retort `analyze`, `retort/src/retort/analysis`),
proportions handled on an arcsine-sqrt (or logistic) scale; cost/tokens/latency
log-transformed (multiplicative), matching retort (`README.md:241`).

**Estimable at Res IV (half-fraction):**
- All four **main effects** — `model`, `prompt`, `retrieval`, `scaffold` — clear
  of two-factor interactions. These are what the ADR-122 gate rules on.

**Aliased (not independently estimable) at this fraction:**
- Two-factor interactions are aliased among themselves. The two we most suspect —
  `model × prompt` (the ATDD×weak-model drop) and `model × retrieval` (retrieval
  helping strong models but confusing weak ones) — are **confounded** here and
  need the confirmation run to separate.

**Two-stage plan:**
1. **Screen (this design, 135 runs):** rank main effects; drop any feature whose
   effect on pass-proportion is negative or null-with-cost.
2. **Confirm (follow-up):** full factorial on the ≤2 surviving factors (e.g.
   `retrieval × model` at fixed best prompt/scaffold) to estimate the
   interactions the screen aliased. Cost is small once the grid is trimmed.

**Admission rule (ADR-122 §3):** a feature earns admission **only** on a
significant, **non-negative** effect on pass-proportion. A significant *negative*
effect ⇒ dropped. A null effect that still costs tokens (the `beads` verdict) ⇒
dropped. Bayesian accumulation (retort `bayesian.py`) is allowed if fixed-N is
impractical.

---

## 7. Cost / token estimate

**Assumptions (all adjustable in the scaffold):**

- Tokens per generation run: **8 000 in / 4 000 out** (base — one anchor
  fixture), scaled by `retrieval` (`on` = ×1.2 input) and `scaffold`
  (`plan-and-solve` ×1.3, `reflexion` ×2.0 tokens).
- Prices per **million** tokens (input/output): **local $0/$0** · **haiku-4.5
  $1/$5** · **opus-4.8 $5/$25** (Opus 4.8 rate grounded in
  `/workspaces/retort/README.md:186`, `:312` and the Opus 4.8 announcement).
- Oracle grading: **$0** (mutation kill via `node --test`, no LLM judge).
- Replicates: N = 5.

| Screen | Runs | qwen (local) | haiku-4.5 | opus-4.8 | **Total** |
|---|--:|--:|--:|--:|--:|
| **Half-fraction, N=5** (recommended) | 135 | $0.00 | $1.86 | $9.25 | **≈ $11.12** |
| Half-fraction, N=3 (cheap floor) | 81 | $0.00 | $1.12 | $5.55 | ≈ $6.67 |
| Full factorial, N=5 (confirmation-grade) | 270 | $0.00 | $3.72 | $18.58 | ≈ $22.29 |

The frontier tier dominates the bill (~83%). Swapping the frontier level to
`sonnet` ($3/$15) roughly halves it; dropping the local tier costs nothing (it is
already $0 and is the tier we most want validated). **Reproduce any figure:**
`node scripts/doe-screen-scaffold.mjs [--full] [--replicates N]`.

> These are *token* costs only. Local `qwen3-coder:30b` is $0/token but consumes
> wall-clock + host GPU on the M5 Ollama box; budget calendar time, not dollars,
> for its 45 runs.

---

## 8. "What could lower reliability" — hypotheses to test (the beads watchlist)

Pre-registered predictions of where a harness feature might *hurt* — the
outcomes that would get a feature dropped:

1. **Retrieval ON is AQE's `beads`.** The ADR-118 flywheel injects retrieved
   patterns every run at a token premium. Hypothesis: on the frozen anchor set it
   shows **null effect on pass-proportion with a positive cost effect** — the
   exact `beads` signature (`README.md:251`). Watch the `model × retrieval`
   interaction: stale/off-target patterns may *lower* kill rate on the **weak
   model** (qwen/haiku) while barely helping the frontier.
2. **Reflexion over-iterates.** The second pass may polish tests toward the
   reference and *soften* mutation-catching assertions, or just burn 2× tokens
   for no kill-rate gain. Hypothesis: `scaffold=reflexion` shows **higher cost,
   flat-or-negative pass-proportion**.
3. **ATDD × weak model — retort's confirmed drop.** exp-13 saw ATDD on the
   weakest stack (sonnet+go) fall to **0.33** because ATDD front-loads the most
   work (`README.md:216, 224-227`). Predict the same `model × prompt` interaction:
   ATDD × `qwen3-coder:30b` under-finishes the anchor.
4. **Local model below the reliability floor.** qwen3:30b clears the D3 floor
   that 8b fails (`project_d3_qe_test_gen_model_floor`), but the screen must
   confirm its pass-proportion is not dragged below the cloud tiers once
   retrieval/scaffold noise is added.
5. **Retrieval × scaffold context dilution.** Both add context; combined they may
   exceed the useful window and dilute the fixture signal — a negative
   interaction that only a crossed design (not OFAT) can surface.

Any feature that lands in (1)-(2) — cost up, reliability flat/down — is dropped
per ADR-122, exactly as `beads` was.

---

## 9. STOP: requires user spend confirmation

**Total estimated spend for the recommended screen: ≈ $11.12** (half-fraction,
N=5). **Nothing has run. $0 spent so far.**

**Before any live run:**

1. **Smoke the pipeline at $0** (LocalStubRunner — retort's pattern):
   ```
   node scripts/doe-screen-scaffold.mjs --smoke
   ```
   Proves design → run → aggregate → summarize end-to-end with deterministic
   fake results, zero tokens.

2. **Approve the dollar estimate** above (adjust N / frontier tier as desired via
   the scaffold flags).

3. **Hand the design to the real harness** (this scaffold never spends, even with
   `--confirm-spend` — it has no model binding and no network by design):
   ```
   retort design generate --phase characterization --fraction 0.5 --config <factors> -o design.csv
   retort report aliasing --phase characterization --max-order 2 --config <factors>   # pre-register
   retort-metaharness run -d design.csv --replicates 5 \
       --runner metaharness --runner-cmd "<AQE test-gen + oracle-eval binding>"
   retort-metaharness analyze  -r results.csv    # Type-II ANOVA (admission rule)
   retort-metaharness report   -r results.csv    # effects + accuracy-vs-cost Pareto
   ```
   The `--runner-cmd` is the one piece of glue not yet built: an AQE binding that
   takes a cell's factor levels, runs the QE test-generation harness in that
   config, grades with `evaluateOracle`, and emits
   `{status, requirement_coverage/pass, cost_per_task, tokens, latency_s}` — the
   contract in `retort_metaharness/README.md:74-80`. Building it is the follow-up;
   it is **not** run here.

---

## 10. References (all read, grounded)

| Ref | Location |
|---|---|
| ADR-122 (this gate) | `docs/implementation/adrs/ADR-122-designed-experiment-harness-gate.md` |
| retort DoE + ANOVA + `beads` dropped | `/workspaces/retort/README.md:15, 111, 204-255, 287-301, 306-317` |
| retort resolution ladder (Res III screen / Res IV char.) | `/workspaces/retort/src/retort/design/generator.py:27-28`, `design/aliasing.py:206` |
| retort-metaharness factor model + $0 LocalStubRunner + runner contract | `/workspaces/retort/retort_metaharness/README.md:24-80` |
| AQE oracle (mutation-kill response metric) | `src/validation/oracle-eval.ts`, `tests/unit/validation/oracle-eval.test.ts` |
| Local QE model floor | memory `project_d3_qe_test_gen_model_floor`, `project_local_qe_model_qwen3coder30b` |
| ADR-117 frozen oracle anchor / ADR-118 flywheel | `docs/implementation/adrs/ADR-117-frozen-oracle-anchor-set.md`, `ADR-118-receipt-gated-qe-policy-flywheel.md` |

---

## RESULTS — executed 2026-07-09 (25 of 27 cells; ~$1.25, well under budget)

Run via `scripts/doe-run.ts` (qwen=Ollama, cloud=raw Anthropic fetch) + `scripts/doe-aggregate.mjs`. Task = the 5 frozen anchor items; pass = mutation-kill ≥ 0.8 via the ADR-113 oracle. 2 opus cells missing (account API usage-limit reached at $1.25 — NOT the $11 budget); opus n=7.

**Which factor moves reliability (level-mean pass-proportion range):**

| Factor | Δ pass-proportion | Verdict |
|---|---|---|
| **scaffold** | **0.636** | dominant |
| prompt | 0.133 | modest |
| model | 0.111 | small |
| retrieval | 0.022 | negligible |

**scaffold (the headline):** `none`=0.711 ≫ `plan-and-solve`=0.300 ≫ `reflexion`=0.075. Scaffolding *destroys* reliability here AND costs ~2× (2 calls). Both flagged **DROP** (beads: +cost, −quality).

**retrieval (the ADR-118 flywheel feature on trial):** `off`=0.386 vs `on`=0.364 → −0.022 pass, +$0.008 cost ⇒ **DROP** — the exact `beads` signature. Retrieval as a generation aid does not help on this task.

**model:** haiku=0.444 ≥ opus=0.343 ≈ qwen=0.333. Paying 5× for Opus buys nothing here; **haiku is the value pick**, qwen (local, $0) is within noise. **UNEQUAL n — read the opus number with caution:** the model means are over different sample sizes (opus n=7 vs haiku/qwen n=9), because 2 opus cells were cut when the account usage limit was hit at $1.25. Opus's 0.343 is the least reliable of the three, and the whole "which factor moves reliability" ranking here is **directional**, not inferential — the original run reported level-mean ranges with **no F-test / significance test** (see the separate stats fix). Treat the ordering as a screen signal to confirm, not a decided result.

**prompt:** TDD=0.444 > ATDD=0.371 > neutral=0.311. TDD modestly best.

**Bottom line:** the SIMPLEST, CHEAPEST stack wins — **none-scaffold + retrieval-off + TDD + haiku**. Every added feature (scaffold, retrieval) hurt reliability while adding cost. This is retort's "more harness lowers reliability" writ large.

**Honest caveats:** (1) task = 5 toy anchor functions the models know well — scaffolding/retrieval might help on genuinely hard problems; this verdict is scoped to this anchor (fixture-difficulty is the planned augmentation). (2) `reflexion`=0.075 was VERIFIED directly (qwen, $0) — it is NOT merely a format artifact. Minor real bug: the reflexion step sometimes emits UNCLOSED ```` ```javascript ```` fences and the runner's `strip()` only removes closed blocks → a leading syntax-error line (small cross-cell noise, worth fixing). BUT fixing the fence does not rescue the test: reflexion genuinely fails baseline by OVER-REACHING past the spec (e.g. for `inRange` ref `x>=lo && x<=hi`, the revise step invented a "reversed range" rule and asserted `inRange(5,10,1)===true`, contradicting the reference). So the reliability hit is a genuine over-iteration effect (the pre-registered hypothesis), with small artifact inflation on top — the scaffold verdict stands. (3) opus incomplete (7/9). (4) N=5 items as replicates, temp=0 — a characterization screen, not a definitive study.
