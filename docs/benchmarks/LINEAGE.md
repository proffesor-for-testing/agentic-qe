# Benchmark Lineage Registry (ADR-108)

Every benchmark or eval whose numbers are quoted anywhere (README, release notes, issues, marketing) gets a row here. Deprecated results are archived, never deleted. A number that gets quoted must have committed data behind it.

**Rules** (full rationale in [ADR-108](../implementation/adrs/ADR-108-benchmark-lineage-preregistered-rubrics.md)):

1. **Rubric before data** — any judged/rubric-scored benchmark commits `RUBRIC-v<N>.md` (rubric, judge instructions, weights) *before* result generation. Result rows embed the rubric file's git hash; post-hoc edits are detectable by construction.
2. **Rubric changelog** — a rubric revision's LINEAGE entry enumerates ALL changes from the prior version, verifiable against the file diff. Never describe a rebuild as a one-variable change.
3. **Abandoned runs keep their data** — partial results move to `archive/<run>/` with a README stating the abandonment reason.
4. **Clustered statistics** — report results clustered by experimental unit (scenario-level sign test / mixed model, with CIs). Raw pooled counts may appear only alongside the clustered result.
5. **Style-neutral judges** — judge instructions must not reveal treatment identity or pre-frame any output style as a virtue or fault.

## Registry

| Benchmark | Version | Measures | Method | Known limitations / confounds | Status | Cite |
|---|---|---|---|---|---|---|
| qe-arena tournaments | Phase 1 (ADR-104) | Test-suite selection fitness: 0.6·killRate + 0.3·coverage − 0.1·suiteCostRatio, real mutant executions via `node --test` | Objective (no judge, no rubric); byte-reproducible under `--seed` | Fixture-scoped (suite selection, not generation); runtime term is a suite-size proxy, not measured ms — the measured-duration variant was **retracted** for jitter-driven rank instability (see ADR-104 "Reproducibility note", the model entry for this registry) | **Current** | ADR-104 + `aqe arena run --seed <s>` output |
| Interaction benchmark for qualitative agents | Planned (ADR-109) | Developer movement: ground-truth (hidden acceptance test passes) primary; pre-registered rubric dimensions secondary | Reactive interactor; non-same-family two-pass judging; scenario-clustered sign test | Simulated developer ≠ real developer (stated per report); per-conversation cost → release-cadence only | **Planned — rubric must land here before any data** | — |

## Backfill

Historical performance/benchmark numbers quoted in older docs predate this registry. They are **uncited-by-default**: before quoting any pre-2026-06 benchmark figure, add its row here first (measures, method, limitations) or treat it as deprecated.
