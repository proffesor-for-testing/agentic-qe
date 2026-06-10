# ADR-104: qe-arena — Competitive Test-Strategy Tournaments (Phase 1)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-104 |
| **Status** | Implemented (Phase 1) |
| **Date** | 2026-06-10 |
| **Author** | AQE Core (Fable 5 improvement initiative, issue #520) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** test-strategy selection, where QE has objective fitness functions (mutation kill rate, coverage, runtime) but no mechanism that lets candidate strategies *compete* on them,

**facing** the absence of any empirical, reproducible way to compare test suites — and inspired by ruflo-arena's Wolfram-style competitive ruliology (strategies as programs, tournaments as competitive arrays),

**we decided for** a self-contained arena engine (`src/arena/`) where Phase-1 strategies are deterministic test-group selections over a committed fixture, fitness comes from REAL runs — a built-in first-order operator mutator with `node --test` executions per mutant (0.6·killRate + 0.3·coverage − 0.1·suiteCost) — tournaments emit pairwise competitive arrays, hill-climb evolves the winner by seeded group flips, and everything reproduces byte-identically under `--seed`,

**and neglected** LLM-generated strategies in Phase 1 (not seedably reproducible — Phase 2, distilling winners into qe-test-architect priors), Stryker as the mutation engine (heavyweight dependency for a fixture-scale arena; the built-in mutator runs real mutants in milliseconds), and measured-wall-clock runtime penalties (empirically jitter-dominated at fixture scale — see Reproducibility note),

**to achieve** an `aqe arena run` that produces a reproducible competitive array with real kill rates, plus fail-soft persistence of runs into memory.db (`kv_store`, namespace `arena`),

**accepting that** Phase 1 fitness is fixture-scoped (suite selection, not generation), the runtime term is a suite-size proxy rather than measured milliseconds, and MCP `arena_run` registration is a follow-up (the CLI and any future MCP handler call the identical `runArena()` — parity by construction).

---

## Reproducibility note (empirical)

The first implementation penalized runtime by *measured-duration rank*. Verification caught it: at fixture scale every baseline runs in 50–300 ms where node-boot jitter dominates, so ranks shuffled across identical-seed runs and flipped rankings. The deterministic replacement is `suiteCostRatio = selectedGroups / totalGroups` — a runtime proxy that preserves the economic trade-off; real per-strategy milliseconds remain in the envelope under `informational` (explicitly excluded from the reproducibility contract).

## Options Considered

### Option 1: Deterministic suite-selection arena with built-in mutator (Selected)
**Pros:** every number from real executions; byte-reproducible; zero new dependencies; fast enough for CI
### Option 2: Stryker-based mutation scoring (Rejected for Phase 1)
**Why rejected:** heavyweight dependency + per-run instrumentation for a fixture-scale tournament; revisit if Phase 2 targets real projects.
### Option 3: LLM-generated strategies now (Rejected for Phase 1)
**Why rejected:** generation isn't seed-reproducible; reproducibility is the Phase-1 acceptance criterion. Phase 2: generate, then freeze candidates as artifacts and tournament them.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-094 | Kernel-Side Dream Cycles | Candidate offline-evolution host (Phase 2) |
| Relates To | ADR-103 | Structured Verdict Handoffs | `arena-result@1` follows the same versioned-envelope convention |
| Part Of | — | Fable 5 / ruflo-parity initiative | Tracking issue #520, improvement 7 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| — | Engine | Source | `src/arena/{arena,mutator,runner,rng}.ts` |
| — | CLI | Source | `src/cli/commands/arena.ts` (`aqe arena run|list`) |
| — | Fixture | Source | `fixtures/arena-demo/` (pricing module + 4 test groups of varying kill power) |
| — | Tests (10) | Tests | `tests/unit/arena/arena.test.ts` (incl. real-engine reproducibility) |
| — | ruflo prior art | External | ruvnet/ruflo PR #2315 (ruflo-arena) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-06-10 | Implemented (Phase 1) | 2026-12-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-06-10 | From Fable 5 improvement plan (issue #520) |
| Implemented | 2026-06-10 | Engine + fixture + CLI + 10 tests; E2E reproducibility verified after replacing the jitter-prone runtime-rank penalty |

---

## Definition of Done Checklist

- [x] Evidence: plan's exact command run twice → byte-identical deterministic envelope; different seed → different tournament; hill-climb steps with real re-evaluation; persistence + `arena list` verified against memory.db
- [x] Criteria: 3 options compared; reproducibility contract explicit (informational.runtimesMs excluded)
- [x] Agreement: ruflo-arena prior art; no core changes (self-contained per plan)
- [x] Documentation: this ADR; MCP follow-up + Phase 2 scope recorded
- [x] Review: verification record on issue #520
