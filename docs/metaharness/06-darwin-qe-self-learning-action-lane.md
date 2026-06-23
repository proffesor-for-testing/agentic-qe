# Darwin-for-QE — Self-Learning + Cheap Local QE Specialists (GOAP Action Lane)

**Extends:** [`05-cross-pollination-goap-plan.md`](./05-cross-pollination-goap-plan.md) (operationalizes its A3 gate + A4 genome work).
**Related (AQE):** [`ADR-104` qe-arena](../implementation/adrs/ADR-104-qe-arena-competitive-tournaments.md) (existing QE evolutionary fitness) · [`llm-independence-goap-plan-2025-12`](../plans/llm-independence-goap-plan-2025-12.md) (75%-built provider layer).
**Source of capability:** MetaHarness `@metaharness/darwin@0.2.1` (`/workspaces/agent-harness-generator/packages/darwin-mode`) + RuVector `ruvllm` crate (`@ruvector/{ruvllm,sona,router,learning-wasm}`).
**Date:** 2026-06-19. **Status:** PLAN (not executed). **Empirical gate:** the A3/DRACO-for-QE benchmark authorizes Phase 2+.

> Graduates to a formal **ADR-111** once Phase 1 (D2/D3) lands a measured result.

---

## ADR-style decision statement (WH(Y))

**In the context of** wanting AQE's self-learning to close an objective feedback loop and to run on a *vendor-independent, cheap, local* model stack (down to 8 GB / CPU-only users),

**facing** a routing confidence stuck at ~40% across 2165 requests, a self-learning loop that records patterns but never *optimizes a model+harness against a QE objective*, and a deferred generic `vertical:qe` whose prior leans G-ABORT (ADR-038: generic harness loses to vanilla at the open-ended frontier),

**we decided for** a **"Darwin-for-QE"** lane that keeps the model **frozen** and **evolves the harness around it** (Ruv's Darwin Mode — a GA over 7 pure-policy surfaces, tree archive, statistically-gated promotion), driven by **AQE's own objective QE scorers as the fitness function**, with a **local model as both mutator and worker** (the M5 host Ollama / `ruvllm serve`, OpenAI `/v1`), and an optional **MicroLoRA/SONA weight-adaptation tier** for narrow QE tasks,

**and neglected** full weight fine-tuning (no GPU passthrough in Docker-on-Mac; out of envelope), the generic `vertical:qe` composite (conditional on a separate gate), and frontier-model mutators (Darwin's own finding: the mutator is not the quality lever — local is free with no quality loss),

**to achieve** a per-repo, per-task **"QE genome" (7 tuned policy files) + optional rank-1/2 adapter** — a portable *data* artifact that makes a $0 local model measurably better at one QE task, feeding AQE's routing confidence and the A3 benchmark,

**accepting that** harness-evolution only pays where the objective is crisp and bounded (which QE is, unlike open-ended SWE-bench), that small models have a *capability floor* below which the lift vanishes (Darwin ADR-150), and that the headline composite is **conditional on the A3 gate**, not committed.

---

## Why QE is the right domain for this (and the generic vertical was not)

DRACO/ADR-038 showed a generic harness **loses** to vanilla on open-ended, LLM-judge-scored deep research. QE is the **inverse**: outcomes are **objective and cheap to score** — a mutant is killed or not, a branch is covered or not, a finding reproduces or not. Harness-evolution wins exactly where the fitness signal is crisp. Darwin's own arc is the proof of mechanism: **closed-loop repair (test feedback) doubled SWE-bench Lite 7.7% → 15.3% on a *fixed cheap model*** — and QE is natively a test-feedback domain. This lane bets on the half of the cross-pollination plan most likely to *pass* its gate.

---

## Goal state

- **G-D1.** A QE fitness adapter exposes AQE's scorers (coverage Δ, mutation kill-rate, false-finding rate, assertion quality, cost/latency) as Darwin's `scoreVariant` contract.
- **G-D2.** `OllamaProvider` lands (thin `RuvllmProvider` port) so AQE *and* Darwin share one frozen local worker over OpenAI `/v1`.
- **G-D3 (THE GATE — A3/DRACO-for-QE).** A measured verdict: does *cheap-local + evolved-QE-genome* (± MicroLoRA) beat both *vanilla cheap-local* and *frontier-vanilla* on the QE scorers, at near-zero cost?
- **G-D4 (only on G-D3 pass).** Per-repo QE genome + per-task MicroLoRA adapter persisted to `memory.db`, wired into the router's quality predictor (lifting confidence off 40%), shipped to users as a data artifact (no training on their box).
- **G-ABORT.** If the evolved genome ≤ vanilla on the QE scorers, ship D1/D2 as standalone wins (a QE-scored Darwin harness + finished provider independence), record the negative as the ADR, do **not** build the adapter-as-product.

---

## Current state (grounded, verified 2026-06-19)

| Fact | Evidence |
|---|---|
| Darwin Mode = evolve harness, NOT weights; 7 surfaces, pure scorer, tree archive, safety gate | `packages/darwin-mode/README.md`; `src/{evolve,scorer,archive,safety}.ts` |
| `CodeGenerator` seam is clean & backend-agnostic | `generateMutation({parentCode,surface,repoSummary,parentScore,failedTraces})→{code,summary}` — `src/mutator.ts`; impls `ruvllm-mutator.ts`, `openrouter-mutator.ts` |
| Local mutator already ships; OpenAI `/v1`; safe no-op on unreachable | `RuvllmMutator` (`ruvllm-mutator.ts:78`); CLI `--mutator ruvllm --ruvllm-url --ruvllm-model` (`cli.ts:156-160`) |
| Mutator is NOT the quality lever (so local = free, no quality loss) | `ruvllm-mutator.ts:10-12` (deterministic + frontier both hit the 0.985 ceiling) |
| **Host M5 Ollama is LIVE & OpenAI-compatible** | `host.docker.internal:11434/v1/chat/completions` returns correct shape (tested); models `qwen3:8b`, `gemma4:12b-mlx`, `qwen3:30b-a3b` |
| AQE already ~75% vendor-independent | `llm-independence-goap-plan-2025-12.md`: `ILLMProvider`, `RuvllmProvider` (95%), `HybridRouter` (80%); missing critical = `OllamaProvider` (thin port) |
| AQE already ships the weight-adaptation crates | deps `@ruvector/{sona,router,learning-wasm,gnn,attention}`; `src/learning/aqe-learning-engine.ts`; SONA wired into 8+ domain coordinators |
| AQE already has a QE evolutionary fitness | `ADR-104` qe-arena: `0.6·killRate + 0.3·coverage − 0.1·suiteCostRatio`, real `node --test` mutants, seeded reproducibility — a ready blueprint for D1 |
| ruvllm crate = local inference + cheap adaptation | GGUF + Q4K/Q8, TurboQuant KV (6–8× mem, <0.5% loss), Metal/CPU, **MicroLoRA rank-1/2**, **SONA 3-tier**, RuvLTRA 494M–3B |
| reasoning-model `/v1` note (verified) | qwen3 & gemma4 split output into `reasoning` + `content`; `content` is correct as long as `max_tokens` covers reasoning + answer. `RuvllmMutator` default `maxTokens=2000` handles it (`ruvllm-mutator.ts:48`); only tiny budgets (≤~40) returned empty `content` |

---

## Action inventory (preconditions · effects · cost)

> Cost: **S** ≤ ~2 days · **M** ~1–2 weeks · **L** ~3+ weeks.

| # | Action | Pre | Effect | Cost | Risk |
|---|---|---|---|---|---|
| **D0** | **Spike**: `metaharness-darwin evolve` a tiny fixture with `--mutator ruvllm` → host Ollama; prove the seam end-to-end ($0) | darwin-mode built; host Ollama up | Validated local-mutator evolution loop | S | Low |
| **D1** | QE fitness adapter: AQE scorers → Darwin `scoreVariant` (reuse ADR-104 math) | D0; AQE scorer modules readable | G-D1; QE-objective evolution | M | Low |
| **D2** | `OllamaProvider` (port `RuvllmProvider`); shared frozen worker over `/v1` | ILLMProvider; Ollama reachable | G-D2; unblocks llm-independence critical path | S | Low |
| **D3** | **DRACO-for-QE benchmark** (vanilla-local / vanilla-frontier / evolved-genome / +MicroLoRA) on a fixed QE corpus | D1+D2; QE corpus w/ ground truth | **G-D3 verdict (the gate)** | M | Low (valuable either way) |
| **D4** | MicroLoRA/SONA tier: fit rank-1/2 adapter for ONE narrow QE task from ReasoningBank trajectories | D3 pass; `@ruvector/sona` wired | per-task weight nudge, CPU-feasible | M | Med (capability floor) |
| **D5** | Persist genome+adapter to `memory.db`; feed router quality predictor; ship as data artifact | D3 pass | confidence ↑ off 40%; vendor-free QE | M | Med |
| **D6** | Sandbox bridge: Darwin `sandboxMode:'agent'` runs real AQE QE tasks (not repo `npm test`, which OOMs) | D1 | real-task fitness, no OOM | M | Med |

## The plan (A* with the empirical gate)

```
Phase 0  (now, $0, zero coupling):        D0 spike  ||  D2 OllamaProvider
Phase 1  (THE GATE):                      D1 → D6 → D3  DRACO-for-QE
            ├─ evolved-genome > vanilla on QE scorers ─► Phase 2
            └─ evolved-genome ≤ vanilla ──────────────► G-ABORT (ship D1/D2, record negative)
Phase 2  (only on pass):                  D4 MicroLoRA  →  D5 persist + route
```

## Hardware envelope (honest, for the 8 GB / CPU target)

- **Evolve (D0/D1/D3/D6):** pure policy mutation + scored runs → **no GPU**; mutator/worker inference is the only cost. Offload inference to the **M5 host Metal** during dev/bench (`host.docker.internal:11434`); ship the *genome JSON* to users — **zero training on their machine**.
- **MicroLoRA/SONA (D4):** rank-1/2 adapters are kilobytes; SONA "deep" fitting is minutes-scale on a **494M–3B / Q4K** model — CPU-feasible, better on the M5. Adapter ships as **data**; an 8 GB user just *loads* it.
- **Out of envelope:** full fine-tuning (no GPU passthrough; `nvidia-smi` absent, 12 GiB). The design's whole point is not needing it.

## Honest limits / replanning triggers

- **Capability floor (Darwin ADR-150):** below some model size the harness lift vanishes — D3 must test the actual small worker, not assume.
- **Manifold degeneracy:** Darwin's `real` sandbox over a repo test command has `nicheEntropy=0` (ADR-099); D6 must use `agent`/`mock` substrate so traces depend on surface content.
- **OOM:** never wire AQE's full `npm test` as the sandbox command (known to OOM locally) — D6 scopes to single QE tasks.
- **Gate fails (R1, primary branch):** convert D4/D5 effort into shipping D1 (QE-scored Darwin) + D2 (finished independence) standalone.

## Phase 0 / D0 — the $0 spike (exact command)

```bash
# prereqs: build the CLI; confirm host Ollama is reachable
cd /workspaces/agent-harness-generator && npm run build -w @metaharness/darwin
curl -s http://host.docker.internal:11434/api/tags >/dev/null && echo "ollama up"

# evolve a TINY throwaway fixture (NOT AQE's heavy suite) with the local mutator
node packages/darwin-mode/dist/cli.js evolve /tmp/darwin-spike \
  --mutator ruvllm \
  --ruvllm-url http://host.docker.internal:11434 \
  --ruvllm-model gemma4:12b-mlx \
  --generations 2 --children 2 --concurrency 2 --seed 0
```

**Acceptance:** a leaderboard + winner lineage prints; `/tmp/darwin-spike/.metaharness/` archive is written; mutator telemetry shows real calls to the host model. This validates *only* the local-mutator evolution seam — QE-objective fitness against real AQE modules is D1/D6.

### D0 results (executed 2026-06-19, M5 host Ollama via Docker)

**Seam: VALIDATED.** Real host-model calls produced safety-gate-surviving regenerated surface files, archived as a lineage tree. Two operational findings + one methodological one:

| local model | wall (gen2×ch2, mock) | real mutations | no-ops | speed rank |
|---|---|---|---|---|
| `qwen3:30b-a3b` (MoE, 3B active) | **138.6s** | 3/6 | 3 | **fastest** |
| `qwen3:8b` | 242.5s | **4/6 (most productive)** | 2 | mid |
| `gemma4:12b-mlx` | **468.8s** | 1/6 | 5 | slowest |

1. **gemma4:12b-mlx is the *worst* mutator** on this hardware — slowest *and* least productive: its reasoning consumes the entire token budget, returning empty `content` → no-op (5/6). The naive "bigger MLX model is better" assumption is **false for the mutator role**. Prefer **qwen3:30b-a3b** (speed) or **qwen3:8b** (productivity).
2. **CLI gap:** `RuvllmMutator`'s 30s timeout + 2000 max-tokens are hardcoded (not CLI-exposed); reasoning models need ≥120s / ≥2048. Drive `evolve()` programmatically, or patch the CLI to expose `--ruvllm-timeout`/`--ruvllm-max-tokens`.
3. **Methodological (load-bearing for Phase 1):** **every variant scored a flat 0.765 (delta 0) even when real rewrites were produced.** The `mock` substrate scores *numeric surface params* deterministically; the LLM mutator is constrained to "preserve signatures, no new capabilities, small change," so its conservative semantic rewrites never move mock's knobs. **`mock` + LLM-mutator yields no fitness signal** — it is the wrong substrate for measuring QE lift. The README's 0.435–0.802 spread came from the *deterministic* param-tweaking mutator. **Therefore Phase 1 must use the `agent` substrate running real surface code against a real task with the D1 QE scorer (D6) — not `mock`.** This sharpens, not weakens, the plan: the fitness lever is the QE scorer on real tasks.

Artifacts: `/tmp/darwin-bench/{summary.json, <model>.json, run.log}`; per-model archives under `/tmp/darwin-bench/run-*/.metaharness/`.

### D1 status — QE fitness adapter (STARTED 2026-06-19)

**Shipped (pure, tested):** `src/integrations/darwin/{types,qe-fitness,index}.ts` + `tests/integrations/darwin/qe-fitness.test.ts` (**11/11 green, strict-tsc clean**). `qeFitnessToScoreCard()` folds AQE's ADR-104 arena metrics (`killRate`, `coveragePct`, `suiteCostRatio`, `fitness`) into a Darwin `ScoreCard`:
- `finalScore` = **QE-native** (the ADR-104 fitness `0.6·kill+0.3·cov−0.1·cost`), overriding Darwin's generic fold — analogous to how Darwin's `benchSuite` path overrides the single-run promote flag.
- term mapping wired to Darwin's gate clauses: `testPassRate`←baselinePassed (noRegression), `safetyScore`←safe (safety clauses), `hallucinatedFile`←falseFindingRate (penalty).
- Zero coupling: local structural mirror of Darwin's types (no `@metaharness/darwin` dependency yet — plan A8).

**Architecture finding that reshapes D6 (verified in source):**
- `evolve.ts:114-118` dispatches the sandbox by **mode only** (`real`/`mock`/`agent`) — there is **no custom-scorer / custom-sandbox injection hook**.
- `mock-sandbox.ts` & `tier2-sandbox.ts` score by whether **synthetic surface params** (contextWindow, maxAttempts, planSteps) solve **toy tasks** — **neither invokes a worker model.** So Darwin-as-shipped cannot, on its own, measure "cheap model + evolved harness on a real QE task."
- **Therefore D6 needs a `qe` substrate** (a 4th `sandboxMode`, or a `customSandbox` hook contributed upstream) that: runs the variant's surfaces → drives the **worker model** (host Ollama) on a **real QE task** → grades with **AQE's arena/coverage scorer** → emits a `RunTrace` whose verdict this adapter (D1) converts. This is the clean upstream PR to `agent-harness-generator` (pairs with the `--ruvllm-timeout` CLI gap from D0).

### D6 status — QE scoring substrate (PROTOTYPED + PROVEN 2026-06-19)

**The seam:** a minimal `customScore` hook in Darwin's `evaluateVariant` (`evolve.ts`) that, when set, replaces sandbox + frozen scorer so a host grades by its own objective — reusing Darwin's unchanged archive/selection/generational loop. 43-line diff captured as the proposed upstream PR: `docs/metaharness/prototype/darwin-customScore-hook.patch` (Ruv's tree was reverted to pristine after the run; reapply the patch to reproduce). AQE side adds `applyQePromotionGate()` (byte-faithful mirror of ADR-072's 4-clause gate) to `src/integrations/darwin/qe-fitness.ts` (now **15/15 tests green**).

**Proof run** (`prototype/d6-proof.mjs`, deterministic mutator, QE fitness = ADR-104 weights as a function of surface params; gen 3 × children 3):

| | result |
|---|---|
| finalScores | **4 distinct** (0.493 / 0.472 / 0.370 / 0.2935) — vs the **flat 0.765** mock+LLM gave |
| winner | `g3_v1` [retryPolicy] **0.4930** vs baseline **0.3700** → **delta +0.1230** |
| promotions | 3 (lineage: contextBuilder cw 30→50 lifts kill 0.40→0.52 & cov 50→60, then retryPolicy ma 3→4 lifts kill→0.56) |
| correctly rejected | a cw-15 variant scored 0.2935 < baseline → not promoted |

**This closes the D0 gap:** Darwin's loop now promotes *genuine QE improvements* under a QE-native objective. The deterministic evaluator stands in for the real one — D3 swaps it for **worker-model (host Ollama qwen3:8b) + ADR-104 arena `runArena()`** on a real AQE module.

**Two upstream PRs to `agent-harness-generator` are now well-defined:** (1) the `customScore` hook (patch ready); (2) `--ruvllm-timeout`/`--ruvllm-max-tokens` CLI flags (D0 gap). Both are small, additive, and pair naturally.

**Next:** D3 — wire the real `QeEvaluator` (model + arena) behind `customScore` and run the gate on one small AQE module; in parallel, offer the two upstream PRs.

---

## Update — 2026-06-20: Ruv's SWE-bench 4-lever data (revises the G-ABORT lean)

Ruv shared the full Darwin Mode SWE-bench Lite arc (full 300, same cheap model unless noted):

| Round | Lever | Resolved | Rate |
|---|---|---|---|
| 1 | one-shot (just ask) | 23/300 | 7.7% |
| 2 | **+ repair loop** (run tests, feed failures back, retry) | 46/300 | 15.3% |
| 3 | **+ escalation** (cheap first; send only *failures* to a stronger model) | 100/300 | 33.3% |
| 4 | **better cheap model**, same workflow | 88/300 | 29.3% |

**The headline correction to our earlier stance:** I had recorded the DRACO/ADR-038 ceiling as "harness > model → A3 gate leans G-ABORT." Ruv's data is more nuanced and **partially reverses that**:

- harness lift (repair loop): **7.7 → 15.3%** — real, but bounded.
- **model lift: 15.3 → 29.3%** — a *better cheap model* on the *same* harness nearly doubled it again. Model choice is a first-class lever, not noise (our D0 benchmark already saw this: qwen3 ≫ gemma4 as mutator).
- **escalation lift: 29.3 → ~33%+** — and **~6× cheaper** than running the frontier model on all tasks.

So the right product is **not** a generic `vertical:qe` that tries to beat frontier with harness-evolution alone (that still G-ABORTs). It's the **economic structure**: cheap-local handles the bulk, repair loop squeezes more out, escalate only the hard tail. The whole-arc gain (7.7 → 33.3%) came **without retraining a single model** — pure orchestration. That is squarely buildable for AQE.

### What AQE already has (grounded 2026-06-20)

- **Escalation mechanism EXISTS**: `src/routing/escalation/auto-escalation-tracker.ts` (167 LoC, real) — `escalateAfterFailures: 2`, `deEscalateAfterSuccesses: 5`, tier ladder `minTier:'haiku' → maxTier:'opus'`. This *is* Ruv's Round 3, already wired.
- **Outcome learning EXISTS**: `src/routing/routing-feedback.ts` + `routing_outcomes` table (ADR-095) — escalation outcomes can feed the router's confidence (the stuck-at-40% metric).
- **The GAP**: the ladder bottoms out at **Haiku (a paid API)**. There is **no free local tier 0** (host Ollama qwen3:8b) beneath it, and no repair-loop step between tiers. So today AQE pays Haiku for the 70–90% that a $0 local model could handle.

### New actions (fold into the lane)

| # | Action | Pre | Effect | Cost |
|---|---|---|---|---|
| **D7** | Add a **local tier 0** (host Ollama / `OllamaProvider`) below Haiku in `AutoEscalationTracker`'s ladder; cheap-local handles the bulk, escalate failures up the existing chain | escalation tracker (have); OllamaProvider (D2) | Ruv's Round-3 economics for QE: 50–90% inference-cost cut on routine QE calls | S |
| **D8** | Wire a **repair loop** between tiers (run the QE check, feed the failure back, retry *before* escalating) — Ruv's Round 2; QE is natively test-feedback. Reuse `qe-retry-handler` | tier 0 (D7) | the 7.7→15.3% harness lift, on AQE's own QE tasks | M |
| **D9** | Feed escalation + repair outcomes into `routing-feedback` so the **40% confidence climbs** from real cheap-vs-escalated results | D7/D8 | self-learning loop closes; better upfront routing over time | M |

These are **standalone wins independent of the A3 gate** (they pay off even if generic `vertical:qe` G-ABORTs) — same "floor" logic as plan 05's A1/A2/A5. D7 is the highest-leverage, lowest-cost next move after D2.

### D7 status — free local tier in the escalation ladder (PROTOTYPED + PROVEN 2026-06-20)

**Shipped (backward-compatible, tested):**
- `src/routing/escalation/auto-escalation-tracker.ts` — made **generic over the tier-name type** with a configurable `tierOrder` (default ladder resolved in the constructor, *not* in `DEFAULT_ESCALATION_CONFIG`, so the exact-match config test stays green). Zero behaviour change for existing callers; **all 26 original tracker tests pass**.
- `src/routing/free-tier/` — the configurable provider layer the user asked for:
  - `types.ts` — `FreeTierProviderConfig` (kind/model/baseUrl/apiKeyEnv/…), `QeRoutingLadder`, `TierBinding`.
  - `provider.ts` — `FREE_TIER_PRESETS` for **local-ollama / cloud-ollama / openrouter / openai-compatible**; `resolveFreeTierProvider()` (reads key from a named ENV VAR — **never stores secrets**); `freeTierChat()` (OpenAI-compatible `/v1/chat/completions`, reasoning-model aware, never-throws → a transport error is a tier *failure* that escalates).
  - `ladder.ts` — `defaultFreeTierLadder()` (`local → haiku → sonnet → opus`), `createFreeTierEscalation()` (builds the real tracker), `resolveTier()` (tier name → concrete handler).
- `tests/routing/free-tier/free-tier.test.ts` — **19 tests** (preset resolution, env-key handling, missingKey flag, ladder validation, escalation local→opus, de-escalation back to local, OpenRouter rebind). **45/45 green** with the tracker suite; strict-tsc clean.

**Live proof** (`prototype/d7-proof.mjs`, real M5 host Ollama):
- free `local` tier answered a QE question live (qwen3:8b, $0) — `ok=true`;
- **escalated** `local → haiku → sonnet → opus` on consecutive failures (each resolving to the correct free/claude handler);
- **de-escalated** `opus → sonnet → haiku → local` on sustained success.

**User-facing config** (any of):
```ts
const ladder = defaultFreeTierLadder('qwen3:8b');                 // local Ollama (M5/dev box), $0
ladder.bindings.local = { provider: 'free-tier',
  config: { kind: 'openrouter', model: 'mistralai/devstral-small:free', apiKeyEnv: 'OPENROUTER_API_KEY' } };
ladder.bindings.local = { provider: 'free-tier',
  config: { kind: 'cloud-ollama', model: 'qwen3:8b', apiKeyEnv: 'OLLAMA_API_KEY' } };
ladder.bindings.local = { provider: 'free-tier',
  config: { kind: 'openai-compatible', model: 'llama-3.3-70b', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' } };
```

### D7-wire status — the running executor (PROTOTYPED + PROVEN LIVE 2026-06-20)

**Shipped (additive, tested, zero production-hot-path edits):** `src/routing/free-tier/executor.ts` — `FreeTierEscalatingExecutor`, the primitive that makes the ladder *run* Ruv's economics for a QE task:
1. run the task on the **cheap free local tier**, 2. **verify** with an objective QE oracle (pass/fail), 3. on failure **escalate this task up the ladder** until it passes or tops out, 4. record the **start-tier** verdict in the tracker so the base tier adapts across tasks.

- Decoupled by injection: free tiers via `freeTierChat`; Claude tiers via an injected `ClaudeTierRunner` (a coordinator passes one that delegates to its existing `HybridRouter` — **no hard dep on the Anthropic SDK**). No runner → local-only mode (Claude tiers reported unavailable, never throws).
- `onOutcome` sink = the D9 seam into `routing-feedback`.
- **Tests: 8 new** (`tests/routing/free-tier/executor.test.ts`) — cheap-first happy path, escalation on verify-fail, transport-error→escalate, full-ladder failure, local-only mode, `maxEscalations` cap, **cross-task base-tier adaptation**, `onOutcome`. **53/53 green** across the free-tier+tracker suites; strict-tsc clean.

**Live proof** (`prototype/d7-wire-proof.mjs`, qwen3:8b @ M5 host, Claude tier stubbed — no API spend):
- real QE task → free local model produced a **correct vitest test that passed the objective verifier in 8.65s, $0, no escalation** (routine work stays free);
- impossible-verify task → correctly climbed `local→haiku→sonnet→opus` and reported failure at the top.

**Model pick: `qwen3:8b`** — most productive worker in the D0 benchmark (4/6 vs gemma4's 1/6) and 5.2 GB (fits the 8 GB-user story; qwen3:30b is 18.6 GB).

**Coordinator adoption (one call — not yet applied; shipped hot-path edit needs sign-off):** e.g. in `src/domains/test-generation/coordinator.ts`, which already holds a `HybridRouter`:
```ts
const exec = new FreeTierEscalatingExecutor({
  ladder: defaultFreeTierLadder('qwen3:8b'),
  claudeRunner: (tier, msgs) => this.llmRouter.complete({ tier, messages: msgs }), // delegate to existing router
  onOutcome: (o) => recordRoutingOutcome(o),                                        // D9
});
const r = await exec.execute({ agentId: `test-gen:${repo}`, messages, verify: runsGreen }); // verify = real test run
```

**Still ahead:** apply the adoption above behind a feature flag (needs OK — touches a shipped coordinator); **D8** repair loop *before* escalating (Ruv Round-2); **D9** wire `onOutcome` → `routing-feedback` to lift the 40% confidence.

### D7-wire APPLIED + D8 + D9 (SHIPPED 2026-06-20)

All three landed; opt-in, off by default, every affected suite green (**111 tests**).

- **Coordinator adoption (opt-in, no dev flag):** `src/domains/test-generation/coordinator.ts` now tries the **free local tier first** when opted in (`enableFreeTier` config or `AQE_FREE_TIER=1`), via a guarded `tryFreeTierGeneration()` that reads the source, prompts the local model, verifies the output is a real test (test block + assertion), and **falls through to the unchanged paid path on any miss**. Default OFF ⇒ zero impact (47 existing coordinator tests still green). New optional 8th ctor param `routingFeedback?` wires D9. Helpers `stripFence`/`deriveTestFilePath`. 4 new opt-in tests.
- **D8 — repair loop:** `executor.ts` gained a same-tier repair loop (`repairAttempts`; verifier may return `{passed,feedback}` fed back into the retry) and an `escalate:false` repair-only mode. The coordinator path runs **local-only + repair, no paid escalation yet** (per the ask). +3 executor tests.
- **D9 — routing-feedback sink:** `feedback-sink.ts` `createRoutingFeedbackSink()` maps executor outcomes onto the existing `RoutingFeedbackCollector.recordOutcome` (drives calibrator + escalation tracker + confidence), `usedAgent` = the tier that won so sustained cheap wins raise the cheap tier's confidence (lifts the stuck-40%). Best-effort (never breaks a task). 4 tests.
- **User docs:** `docs/guides/free-tier-local-models.md` (setup for local/cloud Ollama, OpenRouter, OpenAI-compatible; config; troubleshooting), linked from `README.md` (LLM Providers section + Documentation table).

### Paid escalation ON + D9 wired at the kernel layer (SHIPPED 2026-06-20)

- **Automatic paid escalation:** the coordinator now builds a `claudeRunner` from its existing `HybridRouter` (tier → complexity hint: haiku→low, sonnet→medium, opus→high) and runs the free-tier path with `escalate: true`. Flow is now full **cheap-first → local repair → escalate the hard tail** to paid tiers via the router. Local-only still applies automatically when no router is wired (Claude tiers report unavailable → safe fallback).
- **D9 at the kernel layer:** the **plugin** (`src/domains/test-generation/plugin.ts` `onInitialize`) now constructs a live `RoutingFeedbackCollector` (EMA calibration + auto-escalation enabled, memory-only fallback) when the free tier is opted in, and passes it to the coordinator as the `routingFeedback` arg → the sink records every cheap-vs-escalated outcome into the calibrator + escalation tracker + confidence metrics (lifts the stuck-40%). Constructed only when opted in (no overhead otherwise).
- **Tests:** +2 (escalation-via-router, D9 sink invocation) → **113 green** across the affected suites; existing coordinator (47) + plugin (38) suites unchanged.

**Still ahead:** the upstream `customScore` + `--ruvllm-timeout` PRs to `agent-harness-generator`; broaden the opt-in beyond test generation to other coordinators.
