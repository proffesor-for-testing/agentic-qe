# ADR-122: Harness features admitted only with designed-experiment evidence (DoE gate)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-122 |
| **Status** | RE-RUN 2026-07-10 (27/27 cells, $1.538, OpenRouter + real F-test) — supersedes the 2026-07-09 directional run. `scripts/doe-run.ts` (qwen local $0 + `anthropic/claude-haiku-4.5` + `anthropic/claude-opus-4.8` via OpenRouter, N=5 stochastic replicates of fixed item A1-inRange) + `doe-aggregate.mjs` (real main-effects ANOVA). **Findings, now significance-tested: scaffold DOMINATES and is NEGATIVE — none 1.00 ≫ plan 0.31 ≫ reflexion 0.067, F(2,108)=218.9 p=1e-38, 71.9% of variance → both DROP; retrieval is beads — F(1,108)=1.5 p=0.22 n.s., slightly negative → DROP (explained by the 2026-07-10 coupling no-headroom finding); model qwen 0.644 > haiku 0.400 > opus 0.333, F=25.1 p=1e-9 (local qwen best, opus 5×+ cost = negative value); prompt TDD best p=4.5e-3.** Simplest+cheapest stack wins (none/off/TDD/local-qwen). Raw data persisted at `docs/implementation/doe-run-2026-07-10.jsonl` (reproducibility gap from the first run fixed). Full writeup: DOE-HARNESS-SCREEN-DESIGN.md §Results (DEFINITIVE). |
| **Date** | 2026-07-07 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-108](./ADR-108-benchmark-lineage-preregistered-rubrics.md) (pre-registered rubrics — DoE screens are pre-registered), [ADR-111](./ADR-111-darwin-qe-self-learning.md) (measure on our scorer, not external rank), [ADR-118](./ADR-118-receipt-gated-qe-policy-flywheel.md) (a flywheel is itself a harness feature to screen). Cross-repo provenance: retort ANOVA/`beads` designed-experiment engine (`/workspaces/retort/README.md`, `platform-evolution-engine-plan.md`, `/workspaces/retort/src/retort/cli.py`). |

---

## WH(Y) Decision Statement

**In the context of** AQE continually adding orchestration/harness features — new agents, swarm topologies, routing layers, tool loops, the ADR-118 flywheel itself — on the intuition that "more harness = better outcomes,"

**facing** retort's measured, uncomfortable counter-evidence: its `beads` orchestration tooling **actively destabilized** hard runs (a maturity/reliability drop) and its ANOVA attributed `beads` **+10% cost with no quality or coverage payoff** — so it was **dropped** — proving that a plausible harness addition can *lower* reliability and cost money while doing it, and you cannot tell which by inspection,

**we decided for** a **designed-experiment (DoE) gate**: before adding or keeping a *significant* orchestration feature, measure it as a **factor** in a fractional-factorial screen — pass-proportion over N replicates as the response, ANOVA attribution of variance to each factor — using retort as the initial instrument; a feature that does not show a significant positive effect (or that *lowers* reliability) is **dropped or not admitted**,

**and neglected** ad-hoc one-off benchmarks (rejected: they confound factors — you can't separate the feature's effect from model/task/language noise, which is the whole point of retort's ANOVA), and trust-by-default / add-because-it-sounds-good (rejected: this is exactly how `beads` got in and stayed until a designed experiment removed it),

**to achieve** a harness that grows only by evidence — every significant orchestration addition earns its place by measured effect on a real response variable, and reliability-lowering features are caught and removed rather than accumulated as "sophistication,"

**accepting that** DoE screens cost real compute and calendar time (a factorial over models × tasks × features × replicates is not free), that they apply only to *significant* features (a proportionate threshold — not every one-line change gets a factorial), and that the initial instrument (retort) measures code-generation/spec-conformance responses, so QE-specific responses may need an AQE-side adapter before the gate covers all harness features.

---

## Context

The seductive failure in agentic systems is assuming orchestration monotonically helps. retort's designed-experiment platform falsified this directly. Running a balanced factorial (language × model × tooling, replicated) and a Type-II ANOVA, retort found a **clean separation of concerns**: *language* governs code quality and test coverage, *task* governs cost and time, and the *model* mostly governs spec-reliability. Crucially, the `beads` tooling factor "shows up in exactly one place — extra cost and time — with no quality or coverage payoff, which is why it was dropped from the later experiments." On hard tasks `beads` was associated with *lower* maturity/reliability. This is the headline lesson: **more harness can lower reliability**, and only a designed experiment — not an anecdote or a single benchmark run — can tell you.

This directly generalizes ADR-111's discipline ("benchmark each model on *our* scorer; external leaderboard rank does not transfer") from models to harness features, and ADR-108's pre-registered rubrics from evals to experiments. It also disciplines ADR-118: a flywheel is itself a significant harness feature and should be screened, not assumed beneficial (which aligns with MetaHarness's honest-null ceiling — a flywheel that produces zero promotions is a feature with no positive effect on that response).

retort is a usable instrument today: it has a factor/experiment engine (`platform-evolution-engine-plan.md`: `anova.py` main-effects + interactions, `bayesian.py` for accumulating confidence without fixed sample sizes), a `_factor_match_sql` for querying runs by factor config, and ANOVA reporting in its README. AQE can drive it as the initial DoE instrument and later add a QE-response adapter.

---

## Current state (grounded, verified 2026-07-07)

| Fact | Evidence |
|---|---|
| retort's ANOVA cleanly attributes variance to factors | `/workspaces/retort/README.md:239-251` "Factor analysis (ANOVA): what actually moves each metric"; Type-II ANOVA on balanced experiments |
| `beads` tooling added cost with no payoff | `README.md:248` "cost … tooling +10% (p < 0.001)"; `:251` "`beads` … extra cost and time — with no quality or coverage payoff, which is why it was dropped" |
| More harness can lower reliability | 2026-07-07 cross-repo analysis: `beads` destabilized hard runs (maturity 0.88→0.54) |
| retort has a designed-experiment engine | `platform-evolution-engine-plan.md:70,319` `anova.py` (statsmodels OLS + `f_oneway`), `bayesian.py` (pymc, confidence without fixed N) |
| retort queries runs by factor | `/workspaces/retort/src/retort/cli.py` `_factor_match_sql(run_config, col)` |
| retort separates concerns by response | `README.md:251` "language governs code quality/tests, task governs cost/time, model governs spec-reliability" |
| AQE already measures models on its own scorer | ADR-111 (arena fitness; external rank does not transfer) |

**The core problem in one line:** AQE adds harness features on the assumption they help, but retort proved with a designed experiment that a plausible feature (`beads`) can lower reliability and only add cost — so significant features need factorial evidence, not intuition.

---

## Options Considered

### Option 1: DoE gate — factorial screen + ANOVA attribution, retort as initial instrument (Selected)

Before admitting/keeping a significant orchestration feature, run a fractional-factorial screen with the feature as a factor (pass-proportion over N replicates as the response; other factors — model, task — as blocking factors), attribute variance via ANOVA, and admit the feature only on a significant non-negative effect. Use retort's engine initially; build an AQE-response adapter for QE-specific responses (mutation kill, coverage lift) as a follow-up.

**Pros:**
- Catches reliability-lowering features (retort's `beads` result is the proof case).
- ANOVA de-confounds the feature's effect from model/task noise — impossible with a single benchmark.
- Reuses a working instrument (retort) rather than building one.
- Generalizes ADR-111/108 discipline to the harness layer.

**Cons:**
- Screens cost compute + calendar time.
- Initial instrument measures code-gen/spec responses; QE responses need an adapter.
- Applies only to *significant* features (a judgment call on the threshold).

### Option 2: Ad-hoc one-off benchmarks (Rejected)

Benchmark a new feature once, on/off, and eyeball the result.

**Why rejected:** a single run confounds the feature with model, task, and run-to-run noise — exactly what retort's balanced factorial + ANOVA exists to separate. An on/off benchmark could easily have "cleared" `beads` on an easy task while it was destabilizing hard ones.

### Option 3: Trust-by-default (Rejected — status quo)

Add orchestration features because they are plausibly useful; remove them only when something visibly breaks.

**Why rejected:** this is precisely how `beads` entered and persisted until a designed experiment removed it. Reliability-lowering features rarely "visibly break" — they quietly cost reliability and money, which is invisible without measurement.

---

## Decision detail

### 1. Scope — significant features only
The gate applies to **significant** orchestration additions: a new agent role, a swarm topology, a routing layer, a tool-loop policy, the ADR-118 flywheel, a new consensus mode. A proportionate threshold — trivial changes do not require a factorial. The "significant" bar is set at review.

### 2. The screen (pre-registered — ADR-108)
Feature is a **factor**; model and task are blocking factors; response is **pass-proportion over N replicates** (plus cost/time as secondary responses). Design + hypothesis are pre-registered before the run (ADR-108 rubric discipline) so the analysis cannot be retrofitted to the result.

### 3. Attribution (ANOVA)
Type-II ANOVA attributes variance to each factor with significance; a feature earns admission only on a **significant, non-negative** effect on the primary response. A significant *negative* effect ⇒ the feature is dropped or not admitted. Bayesian accumulation (retort `bayesian.py`) is allowed when fixed-N is impractical.

### 4. Instrument
retort is the **initial** instrument (its ANOVA engine + factor-query SQL are usable now). A follow-up builds an AQE-side adapter so QE-specific responses (mutation kill rate, coverage lift, defect-detection) can be the screen's response variable, not just code-gen/spec-conformance.

### 5. Composition with ADR-118
The QE-policy flywheel is itself screened by this gate. A flywheel that yields no measured positive effect (e.g. an honest-null / no-headroom outcome, MetaHarness ADR-234) is a harness feature that did not clear the DoE gate for that response — an acceptable, evidence-based "do not adopt."

### 6. Data safety
Screen results are recorded append-only; no destructive DB operations. Pre-registration artifacts and ANOVA outputs are versioned alongside the feature under review.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-108 | Benchmark lineage / pre-registered rubrics | DoE screens are pre-registered before the run |
| Relates To | ADR-111 | Darwin-for-QE | Extends "measure on our scorer, not external rank" from models to harness features |
| Screens | ADR-118 | QE-policy flywheel | The flywheel is a significant harness feature subject to this gate |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| R-1 | retort ANOVA factor analysis (concerns separation) | Prior art | `/workspaces/retort/README.md:239-251` |
| R-2 | retort `beads` dropped (cost, no payoff, destabilized hard runs) | Prior art | `/workspaces/retort/README.md:248-251`; 2026-07-07 cross-repo analysis |
| R-3 | retort designed-experiment engine (anova.py / bayesian.py) | Prior art | `/workspaces/retort/platform-evolution-engine-plan.md:70,319` |
| R-4 | retort factor-query SQL | Prior art | `/workspaces/retort/src/retort/cli.py` `_factor_match_sql` |
| R-5 | MetaHarness honest-null ceiling (feature with no positive effect) | Upstream ADR | `/workspaces/agent-harness-generator/docs/adrs/ADR-234-ruvllm-microloop-under-flywheel-macroloop.md` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-07-07 | Proposed | 2026-10-07 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-07-07 | Initial creation; extracted from 2026-07-07 cross-repo analysis |
| Run (directional) | 2026-07-09 | 25/27 cells, $1.25; level-mean ranges, no F-test; 2 opus cells cut at usage limit; raw data not persisted |
| Re-run (definitive) | 2026-07-10 | 27/27 cells, $1.538 via OpenRouter (opus-4.8); real ANOVA F-tests; scaffold p=1e-38 NEGATIVE, retrieval p=0.22 beads, model p=1e-9 (qwen best); raw data persisted in-repo |

---

## Definition of Done Checklist

### Core (ECADR)
- [x] **E - Evidence**: retort ANOVA + `beads`-dropped result verified in README + plan
- [x] **C - Criteria**: 3 options compared (DoE gate / ad-hoc benchmark / trust-by-default)
- [ ] **A - Agreement**: AQE Core sign-off pending
- [x] **D - Documentation**: WH(Y) complete, ADR published
- [x] **R - Review**: 3-month cadence, AQE Core owner
### Extended
- [x] **Dp - Dependencies**: Typed relationships to ADR-108/111/118
- [x] **Rf - References**: Grounded in verified retort file paths
- [ ] **M - Master**: Part of the ADR-117…122 learning-integrity cluster
