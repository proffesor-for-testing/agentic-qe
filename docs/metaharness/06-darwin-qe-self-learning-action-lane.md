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

---

## Update — 2026-06-23: Ruv's full SWE-bench road-to-#1 arc (ADR-169→176) revises the escalation design

**Trigger:** pulled `agent-harness-generator` `main` (now `6f15460`, 2026-06-23) and read the entire Darwin SWE-bench campaign Ruv ran 06-21→06-23 (`LEARNINGS.md` §8–12, `SOTA_HORIZON.md`, ADR-173/174/175/176), plus confirmed ruflo **v3.14.0** now depends on `metaharness ~0.2.6`, `@metaharness/router ~0.3.2`, `@metaharness/kernel ~0.1.0`, `@metaharness/darwin ~0.3.1` (published deps → the `metaharness_*` MCP tools). Ruv's private-group note framed an "Asymmetric Compute Routing" thesis (cheap oracle + cheap coder + Opus-sniper tail). **His own commits in the same 24h falsify the cheap halves of it** — the message is the aspirational pitch; the repo is the measured correction. This update records the corrections that bear on our D-lane.

### What Ruv measured (authoritative, gold-graded, Wilson CIs)

| Finding | Evidence | Bearing on AQE |
|---|---|---|
| **The CODER binds, not the oracle. Cheap-Pareto FALSIFIED.** Opus-oracle+cheap-coder = 16%; Opus+Opus = 33%; cheap coder caps ~12–16% *regardless of oracle quality* | `LEARNINGS.md §11` (2×2+D ablation, `c92cbd5`) | You can make the *oracle/verifier* cheap; you cannot make the *generator* cheap on reasoning-dense work. AQE's cheap tier only survives where generation is **bounded** (a unit test, a coverage probe), not on cross-file reasoning. |
| **The asymmetric Opus-sniper is REFUTED.** A single repro-gated Opus shot drove in-loop repro-pass 7→23/25, cost +$25.34, **added ZERO gold resolves** — it overfits the oracle | `LEARNINGS.md §12` (`6f15460`) | **Single gated escalation shots Goodhart.** What converts is **best-of-k diversity** (Arm D Opus best-of-3 = 33%). Our `FreeTierEscalatingExecutor` does single-attempt-per-tier → must do best-of-k at the paid tier. |
| **Goodhart on weak self-oracle:** combined self-repro-gated set was a STRICT SUBSET of the floor's, *losing* real wins; "a weak model cannot author a faithful repro, so its self-oracle is an unreliable selection target" | `LEARNINGS.md §10` | Direct hit on D8/D9: **never gate the loop on the local model's own self-authored test.** Gate on the ground-truth arena/coverage oracle (the D6 substrate already does this) — this is AQE's structural escape that SWE-bench lacks. |
| **MiniMax-M2.7 patch swap FALSIFIED** (20.0% = DeepSeek at 2.2× cost); **qwen3-coder catastrophic in-scaffold** (0–4%) despite leaderboard-#10 | `d25be2b`, §11 | A model's external leaderboard rank **does not transfer** to your scaffold. Benchmark each free-tier preset on *your* QE scorer; the winner is repo/task-specific. |
| **The ceiling tracks frontier-model quality:** opus-4 → opus-4.8 = +13pp (55.3 → 68.3%) on identical inputs | `LEARNINGS.md §8` (`4ddcaf8`) | Model choice is a first-class lever, not noise (we already saw qwen3≫gemma4 in D0). Keep the Sage/top tier swappable. |
| **Oracle-ON (you hold the acceptance test) = 68.3% legit *product* mode**, distinct from conformant ~20% leaderboard | `LEARNINGS.md §9`, ADR-175 | Adopt the same reporting split for trust tiers: "QE quality when handed the acceptance test" vs "cold." Don't conflate. |
| **Verification Kernel is deterministic** (py_compile, repro, patch-quality — *no LLM in the accept gate*) | ADR-176 | Mirror it: AQE's quality gate / arena scorer stays pure code. This is what immunizes against Goodhart and the DRACO/ADR-038 loss pattern. |

### Net effect on this lane

Our **D7→D9 escalation lane is architecturally correct** and matches the part of Ruv's arc that survived contact with data (tiered escalation as a **Pareto-cost** win — *not* "SOTA at pennies", which §11 explicitly calls dead). Two corrections fold in:

1. **Best-of-k at the paid tier**, not a single escalated shot (§12), picked by the objective oracle.
2. **Gate everything on the deterministic arena/coverage oracle, never the model's self-test** (§10) — the QE-specific advantage, only valid if we don't throw it away.

And one graduation: ruflo now consumes **published `@metaharness/darwin`**, so A8's "real dep + version contract" is unblocked — we can retire the structural type-mirror (plan A8) and land our two ready upstream PRs (`customScore` hook, `--ruvllm-timeout` flags).

### Promotion plan → ADR-111 ACCEPTED

The lane graduates to a formal **ADR-111** once Phase 1 (D3 — the gate) lands a measured verdict. Tracked tasks:

1. **D3-real** *(PENDING — the gate)* — wire the real `QeEvaluator` (host Ollama qwen3:8b worker + ADR-104 `runArena()` real mutants/coverage) behind the D6 `customScore` hook; run the gate (vanilla-local / vanilla-frontier / evolved-genome / +best-of-k) on one small AQE module with Wilson CIs. **This is the empirical authorization for ADR-111.**
2. **Best-of-k escalation** *(DONE 2026-06-23)* — `FreeTierEscalatingExecutor` gained `bestOfK`: round-0 runs k deterministic diverse attempts per tier, accepts the first that passes the objective verifier, else repairs/escalates. +2 tests (convert-via-variant, diversification nudge). `executor.ts` `diversify()`.
3. **Goodhart guard** *(DONE 2026-06-23)* — `oracleKind: 'objective' | 'self-authored'` (default `objective`); a self-authored gate is withheld from `tracker.recordOutcome` + `onOutcome` so a Goodharted self-test pass can never lift confidence (`result.goodhartGuarded`). +2 tests. **64 green across the lane (free-tier 38 + tracker 26), strict-tsc clean.**
4. **Per-preset QE bench** *(PENDING)* — measure each `FREE_TIER_PRESETS` model on the AQE scorer for the corpus module; record the winner per task (don't trust external ranks).
5. **Upstream PRs** *(PENDING — needs OK; shared-state)* — open `customScore` hook + `--ruvllm-timeout`/`--ruvllm-max-tokens` against `agent-harness-generator`; pin `@metaharness/darwin` as a real dep (retire the type-mirror).
6. **Author ADR-111** *(SCAFFOLDED 2026-06-23 — `Proposed`)* — `docs/implementation/adrs/ADR-111-darwin-qe-self-learning.md` folds D1/D2/D6/D7-wire/D8/D9 + the §10/§12 corrections; flips to `Accepted` if D3 shows evolved-genome/best-of-k > both vanilla arms, else records the negative per **G-ABORT** and ships D1/D2/D7 standalone.

### D3 status — first gate run (EXECUTED 2026-06-23, real models + real ADR-104 scorer)

`docs/metaharness/prototype/d3-proof.mjs` — REAL throughout: worker models generate a `node --test` suite for `fixtures/arena-demo/src/pricing.mjs`; the scorer runs a baseline + every mutant (ADR-104 kill-rate + coverage). Arms: A vanilla-local (qwen3:8b), C best-of-k local (k=2 + D8 repair, pick best by the oracle), B vanilla-frontier (claude-sonnet-4-6), D cheap+escalate. Pilot n=3, 12 mutants.

| arm | composite | killRate | coverage | baseline-valid [Wilson95] |
|---|---|---|---|---|
| A vanilla-local | 0.0 | 0% | 0 | **0/3** [0, 56.2] |
| C best-of-k local | 0.0 | 0% | 0 | 0/3 |
| B vanilla-frontier | **84.1** | **91.7%** | 97.1 | 3/3 [43.8, 100] |
| D cheap+escalate | 84.1 | 91.7% | 97.1 | 3/3 (escalated **3/3**) |

**Finding — reproduces Ruv's §11 "the coder binds" on a real AQE QE task.** sonnet writes baseline-valid ~92%-kill suites every time; **qwen3:8b could not produce even a *baseline-valid* suite** across 3 instances — best-of-k + D8 repair gave **0/3 lift** (you cannot pick or repair your way out of an invalid base). The "cheap-replaces-frontier" composite **leans G-ABORT here**; the escalation lane still *delivers frontier quality* (D arm), but with **no cost saving on this task** because the cheap tier escalated every time.

**Two confounds — this run is PRELIMINARY:** (1) several qwen3:8b calls hit the 150 s abort (infra latency, not pure capability); (2) `/no_think` did not engage (one 17.3 KB ramble). **The fix was model choice, not harness tuning** — see the qwen3:30b re-run below.

### D3 re-run — qwen3:30b-a3b cheap arm (EXECUTED 2026-06-23) — the verdict FLIPS

Same harness/fixture/scorer, cheap arm swapped to **qwen3:30b-a3b** (MoE, 3B active — D0's fastest), n=3, k=2, repairs=1:

| arm | composite | killRate | coverage | baseline-valid [Wilson95] |
|---|---|---|---|---|
| A vanilla-local (qwen3:30b) | 53.9 | 58.3% | 62.9 | 2/3 [20.8, 93.9] |
| **C best-of-k local** | **81.9** | **88.9%** | 95.2 | **3/3** [43.8, 100] |
| B vanilla-frontier (sonnet) | 28.0* | 30.6%* | 32.4 | 1/3* |
| D cheap+escalate | 81.9 | 88.9% | 95.2 | 3/3 (escalated **0/3**) |

**Findings (the qwen3:8b G-ABORT lean is reversed by a floor-clearing model):**
1. **§12 best-of-k VALIDATED on a real QE task.** Best-of-k lifted the cheap arm **53.9 → 81.9 composite (+28 pts)** and baseline-valid **2/3 → 3/3** — diversity converts an otherwise-invalid base, exactly the mechanism. This is the first *measured* QE-domain confirmation of the §12 correction now shipped in `FreeTierEscalatingExecutor`.
2. **§8 "model choice is a first-class lever" CONFIRMED.** qwen3:30b-a3b clears the floor qwen3:8b face-planted on (0/3 → **3/3 valid, 88.9% mutation kill at $0**). The 8B→30B gap *is* the result — mirrors Ruv's opus-4→4.8 (+13pp) and qwen≫gemma findings. **Practical: ship qwen3:30b-a3b (or larger), NOT qwen3:8b, as the cheap QE tier for test generation** (task #4 per-preset signal).
3. **\*Frontier 28.0 is a MEASUREMENT ARTIFACT, not "cheap beats frontier."** `repairs=1` starved sonnet's aggressive suites — it tripped its own baseline on over-precise RangeError/NaN assertions 2/3 times; the qwen3:8b run measured sonnet at a clean **84.1**. **Do not claim cheap > frontier from this run.** The defensible claim: **cheap-local best-of-k reaches strong absolute QE quality (88.9% kill, $0) and is competitive.**

**Status:** the n=3 run *leaned* PASS but had a frontier confound (`repairs=1`). Resolved by the clean confirmation below.

### D3 confirmation — clean, fair repair budget (EXECUTED 2026-06-23) — THE GATE VERDICT

Same harness/scorer/fixture; qwen3:30b-a3b cheap arm vs claude-sonnet-4-6 frontier; **n=10, k=2, repairs=2 (equal budget both arms)** — the confound is removed (frontier now 100% valid):

| arm | composite | killRate | coverage | baseline-valid [Wilson95] |
|---|---|---|---|---|
| A vanilla-local (qwen3:30b) | 39.3 | 42.0% | 47.1 | 50% [23.7, 76.3] |
| C best-of-k local | 56.1 | 60.0% | 66.9 | 70% [39.7, 89.2] |
| B vanilla-frontier (sonnet) | **85.1** | 93.3% | 97.1 | 100% [72.2, 100] |
| **D cheap+escalate** | **81.6** | 88.0% | 96.0 | 100% [72.2, 100] |

§12 best-of-k > single-shot: **4/10** instances, mean lift **+16.7** composite pts. Coder-binds: frontier − cheap = **+29.1** pts. Escalations fired: **3/10**.

**THE VERDICT (dual, honest):**
1. **§12 best-of-k — VALIDATED.** +16.7 composite pts (A 39.3 → C 56.1), baseline-valid 50% → 70%, single-shot failures rescued 4/10. The `bestOfK` change shipped in `executor.ts` is empirically earned on a real QE task.
2. **§11 coder-binds — CONFIRMED.** Frontier (85.1) beats cheap best-of-k (56.1) by +29 pts. **"Cheap-local replaces frontier" = G-ABORT** — the cheap model alone does not reach frontier QE quality. (The n=3 "PASS" was the `repairs=1` frontier artifact, now eliminated.)
3. **The escalation lane — PARETO-leaning (the candidate product).** Arm **D = 81.6 / 88% kill** vs frontier **85.1 / 93%** — *competitive* while keeping **7/10 tasks $0-local** (escalated 3/10). This is Ruv's surviving thesis: competitive QE quality cheaper than pure-frontier — a Pareto point, not "SOTA at pennies."

**Honest limits of this run (do not over-read the verdict — flagged by an adversarial review):**
- **No significance test on composite.** The Wilson CIs above are on *baseline-valid* (saturated at 100% for both B and D) — `d3-proof.mjs` computes **no CI/SE on the composite** the verdict rests on. "D ≈ B" is a point-estimate comparison (n=10, **single fixture** `pricing.mjs`), **not** a proven statistical tie. Treat +16.7 (best-of-k) and the D≈B gap as suggestive, not significant.
- **"~30% cost" is escalation rate, not a measured cost ratio.** The harness records no tokens/$$ (runtime term dropped). Escalation fired 3/10 — Wilson 95% CI **[0.11, 0.60]** — and escalated tasks pay *both* k local attempts *and* the frontier call. State it as "escalated 3/10 on this fixture", not a cost figure.
- **Arm D is an upper bound.** `d3-proof.mjs:191` picks `max(cheap, frontier)` on escalation; production (`executor.ts`) ships the escalated output unconditionally. Production-D ≤ benchmark-D.
- **The cheap-arm numbers are still `/no_think`-confounded.** It was never confirmed to engage on qwen3:30b either; the fix was model choice, not removing the confound. A/C absolute values (39.3 / 56.1) carry that caveat.
- **The benchmark oracle ≠ the production oracle.** D3 graded with the *real* execution oracle (run mutants). The shipped coordinators gate on **structural proxies** (test+assertion regex; Gherkin structure+relevance) that do **not execute** — so the production confidence signal (D9) is only as trustworthy as those proxies. Closing this (run-the-test oracle in the hot path, or sampled offline) is open work.

**Consequence for ADR-111:** **Accepted, scoped to the escalation lane** (D1/D2/D6/D7/D8/D9 + §12 best-of-k + §10 Goodhart guard). The naive "cheap composite replaces frontier" is **recorded as G-ABORT** (the planned R1 branch). The single-fixture caveat was the main open risk — **closed by the fixture-diverse run below.** Artifacts: `/tmp/d3-gate-result.json`, `docs/metaharness/prototype/d3-proof.mjs`.

### D3 fixture-diverse confirmation (EXECUTED 2026-06-23) — the verdict GENERALIZES + the composite-SE overclaim is fixed

Re-ran the harness over a **5-module corpus** (`pricing`, `strings`, `stats`, `validate`, `timefmt` — distinct shapes; `docs/metaharness/prototype/d3-corpus/`), **6 instances each → n=30**, qwen3:30b-a3b vs sonnet-4.6, k=2, repairs=2. The harness now reports **composite ±SE** (the audit's #3 fix — earlier "indistinguishable" wrongly cited the saturated `validRate` Wilson CI).

| arm | composite ±SE | killRate | coverage | baseline-valid [Wilson95] |
|---|---|---|---|---|
| A vanilla-local | 58.6 ±6.5 | 61.3% | 72.7 | 73.3% [55.6, 85.8] |
| C best-of-k local | 67.3 ±5.6 | 70.9% | 82.6 | 83.3% [66.4, 92.7] |
| B vanilla-frontier | 82.7 ±2.9 | 89.8% | 96.2 | 96.7% [83.3, 99.4] |
| **D cheap+escalate** | **81.6 ±0.9** | 86.4% | 99.1 | 100% [88.6, 100] |

Per-fixture composite (A / C / B / D, escalations):

| module | A | C | B | D | esc |
|---|---|---|---|---|---|
| pricing | 39.0 | 52.5 | 71.0\* | 80.9 | 2/6 |
| strings | 50.0 | 63.7 | 80.7 | 76.7 | 1/6 |
| stats | 78.0 | 78.7 | 82.0 | 78.7 | 0/6 |
| validate | 67.0 | 67.7 | 90.0 | 82.7 | 1/6 |
| timefmt | 59.1 | 74.1 | 90.0 | 89.1 | 1/6 |

**Verdict — it generalizes (this is what the run was for):**
- **§12 best-of-k VALIDATED across 5/5 modules** (aggregate A→C +8.7 composite, valid 73%→83%; rescued an invalid cheap attempt 7/30). Not pricing-specific.
- **§11 coder-binds CONFIRMED across 5/5 modules** (B > C by +15.4 composite / +18.9 kill). Cheap-replaces-frontier stays **G-ABORT**, now on diverse fixtures.
- **Escalation lane ≈ frontier, now honestly:** **B−D composite gap = 1.1, combined SE ±3.1 → within noise** — a real significance check on the *composite* (n=30), not the saturated valid-rate. D keeps **~83% of tasks $0-local** (escalated 5/30, ~17% — *better* cost story than the n=10's 30%) at 100% valid.
- **\*Caveat preserved:** pricing B=71.0 is dragged by **one** frontier baseline failure (sonnet wrote an over-precise assertion, even at repairs=2); D=80.9>B there partly because benchmark-D takes `max(cheap,frontier)` on escalation (the known upper-bound peek — production-D would ship the escalated output). So read **B as the ceiling and D as competitive-with-B**, not "D beats frontier."

**This closes the single-fixture risk.** ADR-111's "Accepted (scoped to the escalation lane)" now rests on **5 diverse modules with a proper dispersion estimate**, and the §10/§12 mechanisms hold across all of them. Remaining open work is the *production* execution-oracle gap (structural proxies ≠ the benchmark's run-the-mutants oracle) and the 8 GB-floor reality — both already recorded.

### Broadening the opt-in beyond test generation (SHIPPED 2026-06-23)

The inline free-tier wiring (30 LoC duplicated in the test-gen coordinator) was extracted into a reusable factory so any coordinator opts in with a few lines:
- `src/routing/free-tier/coordinator-support.ts` — `buildFreeTierExecutor()` (config + router → executor, or `null` when off), `runFreeTierTextTask()` generic bounded-gen helper, `FreeTierCoordinatorConfig`. **Default cheap model raised to `qwen3:30b-a3b`** (D3: the 8B is below the floor). Test-gen refactored onto the factory.
- **`bestOfK` now SHIPPED (validated-vs-shipped gap closed).** D3 validated k=2, but the first cut of the coordinators ran `bestOfK=1` (single-shot — the config the executor warns Goodharts). Both coordinators now pass `bestOfK: config.freeTierBestOfK ?? 2`, matching the benchmarked config; best-of-k costs an extra local call ONLY when variant 0 fails. New test asserts the shipped path runs k=2 and converts a failed first variant without escalating.
- **The 8 GB / CPU target tension (called out honestly):** `qwen3:30b-a3b` is **18.6 GB** — it does **not** fit the lane's stated 8 GB envelope (§"Hardware envelope"). D3 is *why*: the 8 GB-runnable `qwen3:8b` (5.2 GB) scored **0/3 baseline-valid** — i.e. **the 8 GB user is below the QE *generation* floor.** So the lane's promise for 8 GB users narrows to *escalation-only* value (cheap tier mostly fails → escalates), not local generation. Users set `freeTierModel` to fit their box; the default targets users who can run the 30B. This partially refutes the lane's original "cheap-local QE down to 8 GB" framing — recorded, not hidden.
- **Second adopter — `requirements-validation`**: opt-in cheap-first **BDD/Gherkin** generation in `generateTestArtifacts()` (`tryFreeTierScenarios`) — generates raw Gherkin on the local tier, gates on a **strengthened** oracle (valid structure + `parseGherkin` ≥1 scenario + **every scenario has non-empty Given/When/Then** + **relevance**: must reference the requirement's significant terms — so off-topic boilerplate is rejected, resisting the §10 Goodhart trap), and `parseGherkin()`s it back into structured `BDDScenario[]`; falls through to the structured path on a hard miss. Off by default. New test proves off-topic-but-valid Gherkin is rejected. **D9 wired** (coordinator `routingFeedback` arg + plugin `RoutingFeedbackCollector`).
  - **Known limits (adversarial review):** the oracle is a *structural proxy*, not semantic ground truth — it can't catch a relevant-looking-but-wrong scenario; and `parseGherkin` is lossy (drops doc-strings, data tables, `Background:`, tags; collapses `And/But`), so a non-empty cheap result **bypasses** the structured path's negative-scenario / per-AC / Examples synthesis. Acceptable for an off-by-default fast path; a sampled execution oracle is the real fix.
- **Fit criterion (enforced by judgement, not blanket adoption):** only coordinators whose work is **bounded generation graded by an objective oracle** qualify (test code → test+assertion; BDD → valid Gherkin). Analysis/judgement coordinators do **not** — the §11 "coder binds" finding means a cheap model can't carry open-ended reasoning. coverage-analysis's `generate-unit` is an RL action label (no direct code gen) → not a fit.
- **Tests:** `tests/routing/free-tier/coordinator-support.test.ts` (8) + `tests/unit/domains/requirements-validation/free-tier-optin.test.ts` (4, incl. D9). Full sweep green across free-tier + escalation + both coordinator domains; strict-tsc clean.
- **Still ahead:** broaden to further bounded-gen coordinators as they arise (the factory + D9 pattern is now turnkey).
