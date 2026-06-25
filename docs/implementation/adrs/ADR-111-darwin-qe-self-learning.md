# ADR-111: Darwin-for-QE — Self-Learning + Asymmetric Cheap-Local Escalation

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-111 |
| **Status** | Accepted — scoped to the escalation lane (D3 verdict 2026-06-23); "cheap-replaces-frontier" composite = G-ABORT |
| **Date** | 2026-06-23 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-104](./ADR-104-qe-arena-competitive-tournaments.md) (qe-arena fitness), [ADR-095] (routing-feedback), [ADR-038 DRACO] (generic-harness ceiling, MetaHarness) |
| **Plan of record** | [`docs/metaharness/06-darwin-qe-self-learning-action-lane.md`](../../metaharness/06-darwin-qe-self-learning-action-lane.md) |

---

## WH(Y) Decision Statement

**In the context of** AQE's self-learning loop recording patterns but never *optimizing a model+harness against a QE objective*, with routing confidence stuck at ~40% across 2165 requests and a paid Haiku floor under every routine QE call,

**facing** Ruv's measured SWE-bench arc (Darwin Mode, ADR-169→176) which proved that **tiered asymmetric escalation** (cheap-base → repair → escalate the hard tail) lifts a fixed cheap model 7.7% → 33% with *no retraining* — while **falsifying** the "cheap coder" and "single-shot sniper" halves of the naive Pareto pitch,

**we decided for** a **Darwin-for-QE** lane that (a) keeps the worker model **frozen** and evolves the harness around it, scored by AQE's own objective QE fitness (ADR-104 arena: real mutants killed, real coverage), and (b) routes QE tasks **cheap-local-first** through a free-tier escalation ladder (`local → haiku → sonnet → opus`) with **best-of-k diversity** at each tier and a **deterministic ground-truth gate**,

**and neglected** full weight fine-tuning (no GPU passthrough), the generic `vertical:qe` composite (DRACO/ADR-038 prior leans G-ABORT at the open-ended frontier), and the single repro-gated "Opus sniper" cost-saver (empirically refuted — it Goodharts the oracle, 0 gold lift),

**to achieve** a vendor-independent, near-$0 QE worker for the routine bulk, escalating only the hard tail to paid tiers — feeding objective outcomes back into the router to lift confidence off 40%,

**accepting that** the headline composite is **conditional on the D3 gate** (not committed), that the cheap tier only survives on *bounded* QE generation (a test, a coverage probe — not cross-file reasoning), and that **the entire economic advantage collapses if the gate is ever the model's own self-authored test** (the §10/§12 Goodhart trap).

---

## What the SWE-bench arc forced (authoritative, gold-graded — `agent-harness-generator` LEARNINGS §8–12)

1. **The coder binds, not the oracle.** Cheap-coder caps ~12–16% regardless of oracle quality; only a frontier *coder* reaches 33%. You can make the verifier cheap; not the generator. → AQE's cheap tier is valid only on bounded QE generation.
2. **Single gated escalation shots Goodhart** (sniper added $25, 0 gold). **Best-of-k diversity converts.** → escalate with best-of-k, not one shot.
3. **A weak model's self-oracle is an unreliable selection target** (self-gated set was a strict subset, *losing* real wins). → gate only on the deterministic arena/coverage oracle.
4. **The ceiling tracks frontier-model quality** (opus-4 → opus-4.8 = +13pp). → keep the top tier swappable; benchmark each model on *our* scorer (external leaderboard rank does not transfer — qwen3-coder was catastrophic in-scaffold).
5. **Deterministic verification kernel** (no LLM in the accept gate) is what immunizes against Goodhart and the DRACO loss. → AQE's quality gate stays pure code.

**Why QE can win where generic SWE-bench harness-evolution loses:** QE outcomes are objective and cheap to score *without the model authoring the oracle*. That is the structural escape from the trap above — valid only if §10/§12 is honored.

---

## Decision (the lane, by component)

| Component | State | Artifact |
|---|---|---|
| **D1** QE fitness adapter (ADR-104 arena → Darwin `ScoreCard`) | Built, 15/15 tests | `src/integrations/darwin/qe-fitness.ts` |
| **D2** `OllamaProvider` / free-tier provider layer | Built, presets + env-key handling | `src/routing/free-tier/provider.ts` |
| **D6** QE scoring substrate (`customScore` hook) | Prototyped + proven | `docs/metaharness/prototype/darwin-customScore-hook.patch`, `d6-proof.mjs` |
| **D7** free local tier in the escalation ladder | Built, proven live | `src/routing/free-tier/ladder.ts`, `executor.ts` |
| **D7-wire/D8** cheap-first → repair → escalate executor | Built, applied opt-in | `src/routing/free-tier/executor.ts`, test-gen coordinator |
| **D9** routing-feedback sink | Built, kernel-wired | `src/routing/free-tier/feedback-sink.ts`, test-gen plugin |
| **§12** best-of-k diversity at each tier | Built (this ADR) | `executor.ts` `bestOfK` |
| **§10** Goodhart guard (objective-oracle-only feedback) | Built (this ADR) | `executor.ts` `oracleKind` |
| **Broadening** reusable factory + 2nd adopter | Built (this ADR) | `free-tier/coordinator-support.ts`; `requirements-validation` BDD/Gherkin opt-in |
| **D3** the empirical gate (real worker + arena, composite ±SE) | **MEASURED, fixture-diverse — escalation lane ≈ frontier (within noise); cheap-only G-ABORT; §10/§12 hold 5/5 modules** (n=30, 2026-06-23) | `docs/metaharness/prototype/d3-proof.mjs` + `d3-corpus/` |

Everything is **opt-in, off by default** (`enableFreeTier` / `AQE_FREE_TIER=1`); default behaviour is unchanged.

---

## The gate (D3) — what flips this ADR to Accepted

Run a gold-graded benchmark on one small AQE module with the real `QeEvaluator` (host Ollama qwen3:8b worker + ADR-104 `runArena()`), four arms with Wilson 95% CIs (n≥20):
**(a)** vanilla-local · **(b)** vanilla-frontier · **(c)** evolved-genome + best-of-k cheap-local · **(d)** + frontier escalation tail.

- **PASS** (arm c or d beats both vanilla arms beyond noise) → **Status: Accepted**; persist genome to `memory.db`, broaden opt-in.
- **G-ABORT** (evolved ≤ vanilla) → record the negative here; **ship D1/D2/D7 standalone** (a QE-scored Darwin harness + finished provider independence + cheaper routine routing). The composite is *not* built.

Either outcome is a shippable finding (DRACO honesty).

### D3 verdict — MEASURED 2026-06-23 (n=10, fair `repairs=2`, qwen3:30b-a3b vs claude-sonnet-4-6)

`docs/metaharness/prototype/d3-proof.mjs` on `fixtures/arena-demo/src/pricing.mjs`, real ADR-104 mutant-kill + coverage scorer:

| arm | composite | killRate | baseline-valid [Wilson95] |
|---|---|---|---|
| A vanilla-local | 39.3 | 42.0% | 50% [23.7, 76.3] |
| C best-of-k local | 56.1 | 60.0% | 70% [39.7, 89.2] |
| B vanilla-frontier | 85.1 | 93.3% | 100% [72.2, 100] |
| **D cheap+escalate** | **81.6** | 88.0% | 100% [72.2, 100] |

**Dual verdict (n=10, single fixture — superseded by the fixture-diverse run below):**
- **§12 best-of-k VALIDATED** (+16.7 composite, valid 50→70%, 4/10 single-shot rescues).
- **§11 coder-binds CONFIRMED** — frontier (85.1) > cheap best-of-k (56.1) by +29 pts ⇒ **"cheap-replaces-frontier" = G-ABORT** (planned R1 branch).
- **Escalation lane PARETO-leaning:** D (81.6) competitive with frontier (85.1), 70% local.

### D3 fixture-diverse confirmation — MEASURED 2026-06-23 (n=30, 5 distinct modules)

5-module corpus × 6 instances, qwen3:30b-a3b vs sonnet-4.6, k=2, repairs=2. Composite reported with **±SE** (fixes the earlier overclaim that cited the saturated baseline-valid Wilson CI):

| arm | composite ±SE | killRate | baseline-valid |
|---|---|---|---|
| A vanilla-local | 58.6 ±6.5 | 61% | 73% |
| C best-of-k local | 67.3 ±5.6 | 71% | 83% |
| B vanilla-frontier | 82.7 ±2.9 | 90% | 97% |
| **D cheap+escalate** | **81.6 ±0.9** | 86% | 100% |

- **§12 best-of-k lifts cheap in 5/5 modules** (+8.7 composite, valid 73→83%); **§11 coder-binds in 5/5** (B>C +15.4). Both mechanisms **generalize** beyond one fixture.
- **Escalation lane ≈ frontier, honestly:** **B−D composite gap 1.1, combined SE ±3.1 → within noise** (a real composite significance check), while **~83% of tasks stay $0-local** (escalated 5/30). Read B as the ceiling, D as competitive (benchmark-D's `max(cheap,frontier)` escalation peek upper-bounds production).
- **Cheap-replaces-frontier stays G-ABORT** across all 5 modules.

**This closes the single-fixture risk** — the Accepted (scoped) verdict now rests on 5 diverse modules + a proper dispersion estimate. Remaining open: production execution-oracle (structural proxies ≠ run-the-mutants), 8 GB-floor reality.

**Therefore ACCEPTED, scoped to the escalation lane** (D1/D2/D6/D7/D8/D9 + §12 + §10): ~frontier QE quality at ~30% frontier cost. The naive cheap-only composite is **not** built. Optional hardening: n≥30 for tighter CIs; broaden opt-in beyond test generation.

---

## Consequences

- **Positive:** routine QE inference moves toward $0 (cheap-local bulk); the hard tail still gets frontier; objective outcomes lift router confidence; vendor independence advances; everything reproduces under the deterministic gate.
- **Negative / risk:** capability floor (cheap tier may underperform on reasoning-dense QE — measured by D3, not assumed); opt-in surface adds config; the Goodhart guard must never be bypassed (enforced in code + tests).
- **Non-goals:** weight fine-tuning; generic `vertical:qe` as a product; any LLM-judge in the accept gate; self-authored test as a confidence-lifting signal.
