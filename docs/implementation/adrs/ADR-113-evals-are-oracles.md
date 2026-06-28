# ADR-113: Evals Are Oracles, Tests Are Durable-First, Mutation Score Is the Gate

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-113 |
| **Status** | Accepted (2026-06-27) — implemented P0–P5 (38 tests green; durable-first proven to lift mutation score 0%→100% on a worked module). Follow-ups: reconcile 5 pre-existing assets/ drifts; wire live `aqe test generate` into oracle evals (CLI+MCP) |
| **Date** | 2026-06-27 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-104](./ADR-104-qe-arena-competitive-tournaments.md) (reused mutator + node --test runner), [ADR-111](./ADR-111-darwin-qe-self-learning.md) (deterministic-gate discipline); plan `docs/plans/oracle-evals-durable-tests-plan.md` |

---

## WH(Y) Decision Statement

**In the context of** AQE being a quality-engineering platform whose value to end users is the tests and evals it produces, and an analysis of Chad Fowler's "Phoenix Architecture" arguing that when AI makes code cheap to regenerate, the durable asset is the *evaluation* (code that survives deleting the implementation), not the implementation,

**facing** measured evidence that AQE largely fails its own standard — its flagship `qe-test-generation` skill steers agents to write happy-path + mock tests (`mock`×14, `property`/`invariant`/`contract`×0 in its guidance), 226 of 899 test files assert on `toHaveBeenCalled` while only 5 use property-based testing, **skill evals validate generated output by `must_contain` keyword substring matching** (`run-skill-eval.ts`) so an empty test containing the word "zero" passes, and `qe-quality-assessment` gates on line coverage while only mentioning mutation score in prose,

**we decided for** three connected changes: (a) **evals are oracles** — a skill eval proves a generated test by *running* it against a reference implementation (must pass) and against operator mutants of it (each surviving mutant is a missed bug), with mutation kill rate as the pass signal; (b) **tests are durable-first** — `qe-test-generation` leads with invariants, contracts, and property-based tests at boundaries that survive a reimplementation, with happy-path/mock tests retained but explicitly tagged as the ephemeral tier; (c) **mutation score / regenerability is the target metric** — surfaced alongside coverage in `qe-quality-assessment`/`qe-quality-gate`,

**and neglected** building a new mutation framework (we **reuse** the existing qe-arena mutator + `node --test` runner from ADR-104), removing keyword matching outright (it stays as a deprecated fallback through migration), removing TDD-London interaction tests (they remain valid as the ephemeral tier, just no longer sufficient alone), and flipping the gate to blocking on day one (it ships warn-by-default, opt-in blocking),

**to achieve** tests and evals — for AQE itself and for end users — that certify real fault detection and survive reimplementation, plus a differentiated "regenerability score" no other QE tool ships,

**accepting that** durable evals are harder to author than the code they specify (extracting true invariants is real work), oracle evals spawn many `node --test` subprocesses (mitigated by mutant sampling / nightly runs off the publish fast path), and the live "LLM generates test → oracle grades it" loop is only fully exercised once real `aqe test generate` output is wired (P2/P5) — until then the oracle path is proven by dedicated tests, not by the simulating eval harness.

---

## Current state (grounded, verified 2026-06-27)

| Fact | Evidence |
|---|---|
| Test-gen guidance steers to disposable tests | `.claude/skills/qe-test-generation/SKILL.md` — `mock`×14, `property-based`/`invariant`/`contract`×0; workflow says "Happy path tests for all public methods … Mock external dependencies" |
| Suite is implementation-coupled | 226 files assert `toHaveBeenCalled[With]`, 117 are mock-heavy, **5** use `fast-check` (grep across `tests/`,`src/`) |
| **Evals are keyword greps, not oracles** | `scripts/run-skill-eval.ts` `validateOutput()` scores `must_contain` substring matches; `qe-test-generation.yaml` tc002 passes on `must_contain: [zero, edge, negative]` — never runs the test |
| Gate optimizes coverage, not fault detection | `qe-quality-assessment/SKILL.md` gate = `coverage: { min: 80, blocking: true }`; mutation score named in prose only |
| A mutation engine already exists | `src/arena/mutator.ts` (`enumerateMutants`/`applyMutant`), `src/arena/runner.ts` (`prepareWorkspace`/`runNodeTest`), `aqe arena` CLI — real runs, ADR-104 |
| Skill artifacts are duplicated across trees | `.claude/skills`(canonical, 56 evals) · `assets/skills`(56) · `plugins`(8) · `docs`(2) — copies drift |

**The core problem in one line:** AQE's evals cannot tell a correct generated test from a useless one, and its agents are told to write the useless kind.

---

## Decision detail

### 1. Oracle evaluator — reuse, don't build

`src/validation/oracle-eval.ts` (`evaluateOracle`) runs a generated test against a reference implementation, then against each first-order operator mutant; `mutationScore = killed / total`; `passed = baselinePassed && mutationScore >= threshold`. It composes the ADR-104 primitives directly — the only new code is the thin evaluator. Nothing is simulated.

```
generatedTest + referenceImpl
   └─ runNodeTest(reference)            ──► must pass (else baselinePassed=false)
   └─ for each enumerateMutants(impl):
        runNodeTest(applyMutant(impl))  ──► fail = mutant killed
   └─ mutationScore = killed / total    ──► passed if >= threshold
```

### 2. Runner wiring — oracle mode alongside keyword mode

`scripts/run-skill-eval.ts` gains an `oracle` test-case type (`OracleConfig`) and a `validation.oracle` flag. When set, the runner treats the skill output as the generated test, routes it through `evaluateOracle`, and reports `mutation_score` / `mutants_killed` / `survived_mutant_ids`. Keyword `must_contain` validation remains the default fallback so unmigrated evals keep working. The schema (`docs/schemas/skill-eval.schema.json`) carries the `oracle_config` `$def`.

### 3. Durable-first generation — the TDD-London tension, resolved

`CLAUDE.md` mandates "TDD London School (mock-first)". London interaction tests are the **ephemeral tier** — fine for the red-green loop, zero regeneration confidence. This ADR makes the **durable tier (invariants / contracts / property-based) additive and mandatory** alongside them: every generated target carries ≥1 durable assertion, each test is tagged `durable|ephemeral|live`, and the **language-swap heuristic** ("if a rewrite in another language breaks the test, it is at the wrong boundary") pushes assertions to the contract.

### 4. Metric + rollout

`qe-quality-assessment`/`qe-quality-gate` report mutation score and a per-module regenerability score (which oracle tier backs the module) beside coverage. The gate ships **non-blocking (warn) by default, opt-in blocking**. Eval migration is staged QE-skills-first across the duplicated trees behind a CI drift/parity check; mutation runs stay off the blocking publish fast path (sampled / nightly).

### 5. Data safety

Oracle outcomes written to `memory.db` are append-only; back up and verify row counts per the unified-memory rule. No `DROP`/`DELETE`/schema-destructive operations.

---

## Consequences

- **Positive:** evals certify real fault detection; generated suites survive reimplementation; quality verdicts reflect bug-catching power; end users get a regenerability score unique to AQE.
- **Cost:** durable evals cost more to author; oracle runs are subprocess-heavy (sampled/nightly mitigation).
- **Reversible:** keyword matching remains as a fallback; the gate is non-blocking until explicitly opted in.

## Status of work (38 tests green)

- **P0 (done):** `src/validation/oracle-eval.ts`; `tests/unit/validation/oracle-eval.test.ts` (4/4 — thorough kills 3/3 mutants and passes; no-op, weak, broken correctly rejected); `oracle_config` added to `docs/schemas/skill-eval.schema.json`.
- **P1 (done):** oracle mode in `scripts/run-skill-eval.ts`; `tests/integration/validation/oracle-runner.test.ts` (4/4); CLI dry-run verified; `main()` import-guard added.
- **P2 (done):** `qe-test-generation/SKILL.md` durable-first rewrite (durability tiers, language-swap heuristic, ≥1 durable assertion/target, oracle-graded quality checks); synced to `assets/`+`plugins/`.
- **P3 (done):** `src/feedback/regenerability-gate.ts` (warn-default / opt-in block) + `tests/unit/feedback/regenerability-gate.test.ts` (10/10); gate surfaced in `qe-quality-assessment` (+`assets/`).
- **P4 (done):** `src/validation/skill-parity.ts` + `scripts/check-skill-parity.ts` + `verify:skill-parity` npm script + `tests/unit/validation/skill-parity.test.ts` (7/7); oracle case added to `eval.template.yaml`. Baseline: 5 pre-existing `assets/` drifts surfaced (canonical is the richer side) — left for reconciliation, not auto-overwritten.
- **P5 (done):** `tests/integration/validation/oracle-value-proof.test.ts` (3/3) — on one module, old happy-path style kills **0/5** mutants (0%), new durable style kills **5/5** (100%); regenerability gate fails the old suite (ephemeral) and passes the new (durable).

### Live validation (real provider, 2026-06-27)

- **Wiring shipped:** `src/validation/test-gen-prompt.ts` (durable-first prompt) + `scripts/validate-live-oracle.ts` (`LiveSkillEvaluationRunner` overriding `produceSkillOutput` to call a real provider via `ProviderManager`). The eval runner now skips oracle cases under the simulating runner (`isLive()` guard) so evals can ship oracle cases that only activate in a live lane — CI stays green.
- **Results across both lanes:**
  - **Ollama (local):** `Qwable-3.6-27b` emitted an off-task agent transcript → correctly FAILED. `qwen3:30b-a3b` produced a valid, passing-but-weak test (mutation **0/5**) → correctly FAILED. A keyword `must_contain` eval would have PASSED that weak test; the oracle does not.
  - **Claude (frontier, `claude-sonnet-4-6` via `npm run eval:live:claude`):** generated a durable boundary/branch suite → baseline passes, mutation **5/5 (100%)**, oracle verdict **PASS**.
  - Net: the oracle discriminates real model quality — a frontier model clears it, a sub-floor local model does not (consistent with ADR-111/D3). The central thesis is demonstrated on real model output in both directions. The Claude key is read from a gitignored, untracked `.env` (never committed/logged).
- **Hardening surfaced by live runs:** oracle now rejects assertion-less output at a sanity guard (an empty file otherwise passes `node --test`).

### Cost: the oracle enables safe cheap-model swaps (2026-06-27)

Because the oracle *measures* a model instead of trusting it, you can shop for a cheaper
test-gen model and only adopt one that clears it. Measured via `npm run eval:models`
(OpenRouter, direct HTTP): **`openai/gpt-oss-120b` reliably clears the oracle (3/3, 100%
mutation) at ~$0.00013/gen — ~50–70× cheaper than Claude Sonnet**. Three other budget models
(`qwen3-235b-2507`, `deepseek-v4-flash`, `mistral-small-3.2-24b`) FAILED — they wrote tests with
wrong expected values that don't pass against correct code; the oracle caught all of them.
OpenRouter `:free` models are blocked by the account privacy setting (404). Setup guide:
`docs/guides/cheaper-model-eval-lanes.md`. (Aside: while benchmarking, found + fixed a routing bug
in AQE's `OpenRouterProvider` — its `type` was `'openai'` but it registered under `'openrouter'`, so
`ProviderManager` failover never found it; now `'openrouter'` end-to-end, 724 LLM tests green.)

### Eval flip scope (corrected)

Oracle mode applies ONLY to skills whose output is a runnable test/code (gradeable against a reference + mutants). `qe-test-generation` is flipped (oracle case `tc006`, skips in CI). Swarms (`qcsd-*`), Gherkin/requirements validators, and data generators are **not** oracle-appropriate — forcing mutation-oracle grading on them is a category error; they keep keyword/semantic (or future LLM-judge) grading. Adding oracle cases elsewhere uses the template in `eval.template.yaml`.
