# Goal Plan: Oracle Evals + Durable Tests + Regenerability Gate

> Status: **P0–P5 complete + live-validated** (39 tests green; durable-first lifts mutation 0%→100%; ADR-113 Accepted) · Created 2026-06-27 · Owner: working-june
> Done since: 5 `assets/` drifts reconciled (parity `--ci` clean); live provider wiring shipped + validated on BOTH lanes — `npm run eval:live:claude` (claude-sonnet-4-6) generates a durable suite that clears the oracle **5/5 (100%) PASS**, while local Ollama weak output correctly FAILS; `qe-test-generation` eval flipped to oracle (skips in CI, runs in live lane).
> Remaining: verify the live path via MCP (not just CLI); extend oracle cases to any other true test-generator skills; optionally add a CI eval lane keyed with ANTHROPIC_API_KEY (secret-gated, non-blocking).
> Origin: Phoenix Architecture analysis (Chad Fowler) applied to AQE — "evals are the real codebase", compaction discipline, regenerability over durability.

## Goal (what "done" looks like — end-user terms)

A developer running AQE on their project gets tests and evals they can *trust to catch real bugs*:

1. **Evals are oracles** — every AQE skill eval proves a generated test by *running* it: it must pass
   against a correct implementation and **fail against seeded bugs (mutants)**. No eval passes on
   keyword presence alone.
2. **Agents write durable tests** — `aqe test generate` leads with invariants / contracts /
   property-based tests at boundaries that survive a rewrite, with happy-path/mock tests clearly
   labeled as the disposable tier.
3. **The metric changed** — `aqe quality assess` and deployment gates report **mutation score +
   regenerability** (which oracle tier backs each module), not just line coverage. A suite that can't
   notice a bug fails the gate.

**Concrete success criteria:** mutation score of generated suites measurably up on a real fixture;
≥1 durable assertion per generated target; ≥90% of QE-skill evals migrated to oracle format; the 5
trees provably can't drift; before/after numbers documented; verified via **both CLI and MCP**.

## Current state (measured)

| Fact | Value | Implication |
|---|---|---|
| Test files | 899 | large surface |
| `toHaveBeenCalled[With]` files | 226 | mostly ephemeral/impl-coupled |
| property-based files | **5** | durable tier nearly absent |
| qe-test-generation guidance | `mock`×14, `property/invariant/contract`×**0** | steers agents to disposable tests |
| Eval validation | `must_contain` keyword grep (`run-skill-eval.ts`) | **evals are not oracles** |
| **Mutation engine** | **`src/arena/{mutator,runner,arena,rng}.ts` + `aqe arena` CLI EXISTS** | **reuse, don't build** |
| mutation-testing skill + qe-mutation-tester agent | exist | reuse operators |
| qe-quality-assessment | mentions mutation in prose; gate is `coverage:{min:80,blocking:true}` | mutation not actually gated |
| Skills with evals | 54–56 of 119 | rollout target ≈ 54 (QE subset first) |
| Trees carrying copies | `.claude/skills`(canon, 56) · `assets/skills`(56) · `plugins`(8) · `docs`(2) | sync/parity needed |

## Key design decision

The hard part (a mutation engine) **already exists in `src/arena/`**. The work is *integration*:
route generated tests through the arena mutator inside the eval runner, change agent guidance, and
promote mutation score to a gate. Turns a multi-month build into a wiring + rollout effort.

---

## Plan (phased; each phase carries all four lenses)

Convention: **I**=implementation · **N**=integration · **V**=verification · **U**=user-validation.

### Phase 0 — Foundation: oracle schema + arena reuse spike  `[Task #1]`
- **Precondition:** `src/arena/mutator.ts` exports usable mutate(); `run-skill-eval.ts` parses eval YAML.
  **Effect:** proven path "generated test string" → "executed against ref + mutants → kill rate". **Cost:** S–M.
- **I:** extend `docs/schemas/skill-eval.schema.json` + `eval.template.yaml` with an `oracle` test-case type:
  `{reference_impl, mutants[] | mutate:auto, extract}`.
- **N:** spike importing `src/arena` into `run-skill-eval.ts` (static ESM imports — require-vs-vitest rule).
- **V:** on `qe-test-generation.yaml` tc002 (`divide`), a real generated test passes ref and kills a `/`→`*`
  mutant; a no-op test survives (fails the eval).
- **U:** none yet. **Exit gate:** spike kills mutants on one case.

### Phase 1 — Oracle eval runner  `[Task #2]`
- **Precondition:** P0 spike green. **Effect:** runner scores by execution+mutation, not keywords. **Cost:** M.
- **I:** oracle validation mode in `src/validation/parallel-eval-runner.ts` + `scripts/run-skill-eval.ts`;
  result fields `mutation_score`, `killed[]`, `survived[]`; keep `must_contain` as deprecated fallback.
- **N:** feed outcomes into learning path (`track_outcomes`, ReasoningBank) — learn which test shapes kill mutants.
- **V:** unit + integration tests for the runner; run against unbuilt + built dist.
- **U:** none yet. **Exit gate:** runner reports mutation score on ≥3 evals.

### Phase 2 — Change what agents write  `[Task #3]`
- **Precondition:** oracle runner grades durable tests. **Effect:** `aqe test generate` emits durable-first. **Cost:** M.
- **I:** rewrite `qe-test-generation/SKILL.md` + `qe-test-architect`; promote `qe-property-tester` +
  `qe-contract-validator` to default pipeline; require ≥1 invariant/contract/property per target;
  language-swap heuristic; tag tests `ephemeral|durable|live`.
- **N:** reconcile with CLAUDE.md "TDD London mock-first" — London = ephemeral tier; durable is additive (ADR).
- **V:** P1 oracle eval for qe-test-generation now demands a mutant-killing durable test.
- **U:** generated property/contract tests survive a reimplementation on a fixture. **Exit gate:** generated
  suite kills more mutants than old happy-path+mock suite.

### Phase 3 — Change the target metric (gate)  `[Task #4]`
- **Precondition:** mutation score computable per suite. **Effect:** verdicts reflect bug-catching + regenerability. **Cost:** M.
- **I:** mutation-score + **regenerability score** (which oracle tier backs a module) in
  `qe-quality-assessment`/`qe-quality-gate` + `src/feedback/quality-score-calculator.ts`; wire into
  `aqe quality assess` + `qe-deployment-advisor`.
- **N:** non-blocking warn by default, opt-in blocking (don't break existing pipelines).
- **V:** gate flags 90%-coverage/low-mutation suite as failing.
- **U:** user sees "Coverage 88% ✅ / Mutation 41% ⚠️ / Regenerability: ephemeral-only ⚠️". **Exit gate:** correct verdict on known-weak suite.

### Phase 4 — Full rollout + 5-tree anti-drift  `[Task #5]`
- **Precondition:** P1–P3 stable. **Effect:** all (QE-first) evals are oracles; trees can't drift. **Cost:** L.
- **I:** migrate ~54 eval suites must_contain→oracle, batched by domain.
- **N:** single-source templates (`.claude/skills/.validation/`); generate/sync `assets/`,`plugins/`,`docs/`;
  **drift-detector parity eval in CI**.
- **V:** CI fails on tree divergence; migration-coverage metric tracked.
- **U:** every shipped AQE skill grades itself by real bug-catching. **Exit gate:** ≥90% QE evals oracle + parity green.

### Phase 5 — End-user verification & validation  `[Task #6]`
- **Precondition:** rollout done. **Effect:** evidence it helps real users. **Cost:** M.
- **V (reproduction-first):** real fixture, `aqe test generate` before/after, mutation-score delta; verify CLI **and** MCP.
- **U (acceptance scenarios):**
  1. Generated tests **survive a reimplementation**.
  2. Gate **catches a seeded regression coverage missed**.
  3. Eval suite **rejects a deliberately-empty generated test**.
- Smoke-test top MCP tools + CLI before release; document before/after numbers.

## Cross-cutting: capture intent (P0)
ADR — "Evals are oracles; regenerability is a first-class quality metric": thesis, London-school
tension resolution, non-blocking→blocking rollout policy. (Provenance layer.)

## Risk factors (replan triggers)
- Arena mutator not generic enough → fallback: Stryker for JS/TS, arena for AQE-internal.
- Mutation too slow across 54 evals → sample/cache/nightly; keep off blocking fast path initially.
- **memory.db**: oracle outcomes write learning records — append only, back up first, verify row counts.
- 5-tree migration touches npm-distributed `assets/` — stage behind parity check, human-gate the flip.
- London-mandate friction — resolve in ADR before P2.

## Fallback
Degrade oracle from "mutation kill rate" to "executable behavioral assertion": run generated test
against ref impl (must pass) + one counter-impl (must fail). Weaker than mutation, still a real oracle,
far stronger than keyword matching. Mutation becomes a P3+ enhancement.
