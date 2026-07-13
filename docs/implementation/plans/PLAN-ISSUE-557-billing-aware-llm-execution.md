# PLAN — Issue #557: Billing-Aware LLM Execution (Subscription Provider + Enforced Budgets)

**Issue:** [proffesor-for-testing/agentic-qe#557](https://github.com/proffesor-for-testing/agentic-qe/issues/557)
**ADR:** [ADR-123](../adrs/ADR-123-billing-aware-llm-execution.md)
**Status:** Proposed (2026-07-13)

## Problem

AQE's LLM layer can only bill the paid Anthropic Developer API. A user with a
Claude Pro/Max subscription (which already covers Claude Code usage) has no way
to run QE analysis on that subscription. A real incident: ~374 headless agents
over ~11h quietly ran up a large surprise API bill while the user's Max plan sat
unused. No warning was printed, and no budget cap stopped it.

**Attribution caveat:** the evidence points to the claude-flow daemon's headless
sessions (not AQE's provider layer) as the proximate biller — see ADR-123
"Incident attribution". The structural complaints against AQE's layer are valid
regardless, but only the billing notice below would plausibly have mitigated
that specific incident; the phases fix the same failure class *inside AQE*.

### Verified current state (2026-07-13)

| Fact | Evidence |
|---|---|
| Claude provider is API-key-only, raw fetch to `api.anthropic.com` | `src/shared/llm/providers/claude.ts:394,401` (no `@anthropic-ai/*` SDK in package.json) |
| Claude is the silent default provider | `src/shared/llm/router/types.ts:1149` (`defaultProvider: 'claude'`), `src/shared/llm/provider-manager.ts:48` |
| Key-in-env **force-enables** the API provider, overriding explicit `enabled: false` on disk | `src/shared/llm/router/config-store.ts:233-251` (`applyEnvProviderDetection`, self-described "COUNTERINTUITIVE") |
| Budget caps are declared but **never enforced** | `interfaces.ts:296-298` (`maxCostPerHour/Day`), `provider-manager.ts:702` (`maxCostPerDay: 100` — dead), `cost-tracker.ts:426-441` (`wouldExceedLimit` — no callers), `COST_LIMIT_EXCEEDED` error code unused |
| CostTracker is in-memory, per-process | `cost-tracker.ts:131` — a fleet of N processes each sees $0 cumulative spend |
| No provider-selection env var exists | no `AQE_LLM_PROVIDER` anywhere; only `llm-config.json` `defaultProvider` |
| The incident's fleet (audit/optimize/testgaps) is the **claude-flow daemon**, not this repo's workers | `.claude/settings.json` `claudeFlow.daemon`; this repo's `src/workers/daemon.ts` workers make no LLM calls |
| `ANTHROPIC_API_KEY` in env flips even the `claude` CLI from subscription to API billing | Anthropic support article 11145838 (verified 2026-07-13) |
| `aqe init` already writes daemon `autoStart: false` for users | `src/init/init-wizard-hooks.ts:335` |

### Cognitum context (verified live 2026-07-13)

We will soon support `api.cognitum.one`. Probed with the local `COGNITUM_API_KEY`:

- **OpenAI-compatible** `POST /v1/chat/completions` and **Anthropic-compatible** `POST /v1/messages`; also `/v1/embeddings`, `/v1/responses`, `/v1/batches`. Auth: `X-API-Key` or `Authorization: Bearer`.
- Tiered models `cognitum-auto|low|mid|high(|low-agent)`; the server routes tier → concrete model (observed: `low → z-ai/glm-5.2`).
- Every response carries an **`x_cognitum` routing receipt**: `resolved_model`, `resolved_tier`, `escalated`, **`price_usd`** (authoritative per-request cost), cache status.
- `GET /v1/usage` returns month-to-date spend **and a server-side budget**: `servingBudgetUsd`, `hardCapUsd`, `headroomUsd`, `status` — the provider natively has the "hit cap and pause" failure mode issue #557 asks for.

**Implication:** the budget/cost design must accept *provider-reported authoritative
cost* (receipts), not just locally computed price-table estimates, and the
transparency layer generalizes to a per-provider **billing mode**, not a
Claude-specific warning.

## Design: billing modes

Add `billingMode` to the provider contract (`LLMProvider` + registry metadata):

| Mode | Providers | Worst-case failure |
|---|---|---|
| `metered-api` | claude (API), openai, openrouter, gemini, azure-openai, bedrock | unbounded spend → needs local enforced budget |
| `metered-capped` | cognitum (server-side `hardCapUsd`) | provider pauses at cap; local budget optional belt-and-braces |
| `subscription` | claude-code (new) | plan rate limit → pause until window resets |
| `local` | ollama, onnx | none (compute only) |

Startup notice (kernel/router init + `aqe health`) prints the active provider's
billing mode and, for `metered-*`, the budget status.

## Phases

### Phase 1 — Guardrails (ship first, no new provider needed)

1. **Enforce budgets.** Wire `CostTracker.wouldExceedLimit()` into
   `ProviderManager.generate()`/`complete()`; throw `COST_LIMIT_EXCEEDED` when
   `global.maxCostPerHour/Day` would be breached.
2. **Persist spend in `memory.db`** (unified persistence ADR — no new SQLite
   file). Table `llm_spend` (ts, provider, model, prompt_tokens,
   completion_tokens, cost_usd, cost_source, request_id). Budget checks read
   the rolling window from the DB so the cap holds **across processes/fleets**.
3. **Provider-authoritative cost.** `LLMResponse.cost` gains
   `source: 'provider-receipt' | 'local-estimate'`. Cognitum receipts and
   OpenRouter's usage-cost field populate `provider-receipt`; others keep
   local price tables.
4. **CLI/env surface:** `--max-budget-usd <n>` on `eval`, `fleet`, `test`
   generation commands; `AQE_MAX_BUDGET_USD` env (maps to per-run cap).
5. **Billing notice** at startup when a `metered-api` provider is primary:
   one line, includes rough per-run cost and the opt-out
   (`AQE_LLM_PROVIDER=claude-code` once Phase 2 lands).
6. **Honor `enabled: false`.** `applyEnvProviderDetection` no longer overrides
   an explicit disk-level disable (ADR-043 addendum change + migration note).

### Phase 2 — `claude-code` subscription provider (the headline ask)

1. New `src/shared/llm/providers/claude-code.ts` implementing `LLMProvider`:
   - `generate()` spawns `claude -p --output-format json --model <model>
     --max-turns 1` with tools disabled; parses `result`/`usage`/`is_error`.
   - **Strip `ANTHROPIC_API_KEY`/`CLAUDE_API_KEY` from the child env** —
     otherwise the CLI silently reverts to API billing (dedicated test).
   - `billingMode: 'subscription'`; marginal cost $0, token usage still
     recorded; `RATE_LIMITED` mapped from plan-limit responses (retryable,
     long backoff — the *desired* failure mode).
   - `isAvailable()`: `claude` binary on PATH + cached tiny health probe.
   - Concurrency cap (default 2) — each call is a process spawn.
2. Registration: `LLMProviderType`/`ExtendedProviderType` unions,
   `PROVIDER_ENV_KEYS['claude-code'] = []` (local-style detection),
   `RUNTIME_CONSTRUCTIBLE_PROVIDERS`, `createProvider()` switch, providers
   index, model registry aliases (sonnet/opus/haiku).
3. **`AQE_LLM_PROVIDER` env var** honored in `loadRouterConfig()` as the
   highest-precedence `defaultProvider` override:
   `claude-code | claude | openai | openrouter | gemini | ollama | cognitum | ...`
   (accept `anthropic` as alias for `claude`).
4. Consensus providers (`src/coordination/consensus/providers/`) get the same
   option or are routed through the shared layer.

### Phase 3 — Cognitum provider

1. `src/shared/llm/providers/cognitum.ts` — OpenAI-compatible chat surface,
   `X-API-Key` auth, models = tier names; parse `x_cognitum` receipt into
   `cost` (`source: 'provider-receipt'`) and metadata (resolved model,
   escalated). `billingMode: 'metered-capped'`.
2. `embed()` implemented via `/v1/embeddings` (unlike Claude — closes AQE's
   embedding gap for cloud path).
3. Optional `getRemoteBudget()` on the provider interface — Cognitum reads
   `/v1/usage` (`headroomUsd`, `status`) so `aqe health` / the billing notice
   can show real remaining budget; local enforcement remains the universal
   layer.
4. Env detection: `PROVIDER_ENV_KEYS['cognitum'] = ['COGNITUM_API_KEY']`.

### Phase 4 — Preference flip (separate, behavior-changing)

When no explicit provider is chosen and both subscription auth (claude-code)
and `ANTHROPIC_API_KEY` are available, prefer `claude-code`. Ships with release
notes; overridable via `AQE_LLM_PROVIDER=claude` for users who *want* API
billing (CI service accounts).

## Verification (per project rules)

- Reproduction-first: real `claude -p` round-trip on a fixture project; real
  Cognitum call asserting receipt parsing; budget-cap kill test with a fleet
  of ≥2 processes sharing `memory.db`.
- MCP–CLI parity: provider selection + budget enforcement verified through
  both `aqe` CLI and MCP tool calls.
- Env-strip test: assert child env of the spawned CLI contains no
  `ANTHROPIC_API_KEY` even when the parent has it.
- No mutation of any existing `.db` without backup (`llm_spend` is additive).

## Implementation status (2026-07-13)

All four phases implemented on branch `feat/issue-557-billing-aware-llm`.

**New files:** `src/shared/llm/spend-ledger.ts` (cross-process `llm_spend` ledger
in `memory.db`), `src/shared/llm/billing-modes.ts` (mode resolution + notice),
`src/shared/llm/providers/claude-code.ts`, `src/shared/llm/providers/cognitum.ts`.
**Changed:** `interfaces.ts` (BillingMode, CostSource, `cost.source`,
`maxCostPerRun`, two configs, two provider types), `provider-manager.ts`
(enforceBudget + ledger + notice + createProvider cases), `router/config-store.ts`
(honor `enabled:false`, `AQE_LLM_PROVIDER`), `router/types.ts`, `cli/commands/eval.ts`
(`--max-budget-usd`), plus exhaustive-record updates in `hybrid-router.ts`,
`message-formatter.ts`, `llm-router.ts`.

**Verification — automated:** `npm run build` green; `tsc --noEmit` 0 errors;
766/766 `tests/unit/shared/llm` pass, including 6 new ADR-123 suites (41 tests):
cross-process ledger, env-strip, billing modes, budget enforcement, receipt
parsing, `enabled:false` honoring + `AQE_LLM_PROVIDER`.

**Verification — live, from user perspective:**
- **claude-code** — real `claude -p` round-trip returned `"pong"` on the
  subscription; `cost.totalCost=0` (source `provider-receipt`); model resolved
  to `claude-haiku-4-5-20251001`. LOAD-BEARING check passed: with a leaked
  `ANTHROPIC_API_KEY` in the parent env, the child env leaked **zero** billing
  keys — so it billed the subscription, not the API.
- **cognitum** — real call returned `"pong"`, model resolved from the receipt
  to `z-ai/glm-5.2`, `cost.source=provider-receipt`, and `getRemoteBudget()`
  parsed the server-side cap (`hardCapUsd=$20`, `headroomUsd=$19.57`,
  `status=active`).
- **CLI** — `aqe eval run --help` (bundled) shows `--max-budget-usd`.

**MCP–CLI parity:** provider selection (`AQE_LLM_PROVIDER`) and budgets
(`AQE_MAX_BUDGET_USD`) are read at the shared `config-store`/`ProviderManager`
layer used by both entrypoints, so both paths inherit the same behavior.

### Gap-fix pass (post-review, 2026-07-13)

A follow-up audit ("did we miss something") found and closed real gaps:

- **CRITICAL — budget bypass on the real QE path.** Domains call
  `HybridRouter.chat()` → `executeWithFallback()` → `provider.generate()`
  **directly**, bypassing `ProviderManager.generate()` where enforcement/ledger
  lived. The cap would have protected nothing on the fleet path. Fixed:
  exposed `ProviderManager.assertWithinBudget()` + `recordResponseSpend()` and
  wired them into `executeWithFallback` (gate once per request, record on
  success). **Proven with real classes**: `HybridRouter.chat()` over a seeded
  ledger throws `COST_LIMIT_EXCEEDED` before any provider call. `stream()`
  delegates to `chat()`, so it inherits the gate.
- **Second billing path named in the issue** —
  `coordination/consensus/providers/` (multi-model verification) auto-registers
  an Anthropic-API provider from `ANTHROPIC_API_KEY` with no cap. It uses a
  different `ModelProvider` interface; full subscription/budget port is deferred,
  but it now prints a billing-transparency warning so the spend isn't silent.
- **`aqe health`** now prints an "LLM Billing" section (active provider, billing
  mode, budget cap / opt-out tips) — the plan's promised surface.
- **Cognitum embeddings** added to the embedding-provider preference list.
- **Translator mapping**: `claude-code` → `anthropic`, `cognitum` → `openai`
  formats (were falling to the default).
- **Note:** `aqe eval run` uses a **mock** runner (`generateMockResponse`), so
  its `--max-budget-usd` sets the universal `AQE_MAX_BUDGET_USD` env but caps no
  real spend there; real enforcement is on the `HybridRouter`/`ProviderManager`
  paths. Regression tests updated (HybridRouter mock gained the two new methods;
  3 new budget-wiring tests). Full suite: 769 llm + 1032 cli/consensus green.

**Deferred:** Phase-4 default flip to `claude-code` (separate release-noted PR);
`--max-budget-usd` on `fleet`/`test` commands (env var already covers them);
consensus providers in `coordination/consensus/` still API-key only.

## Follow-up fix: `aqe eval run` made fabricated results (2026-07-13)

**Found during review.** `ParallelEvalRunner` defaulted to `MockLLMExecutor`
(canned keyword-matched strings) and the CLI never injected a real one — there
was **no** real `LLMExecutor` in the codebase. So LLM-mode `aqe eval run`
scored fabricated output. Per the repo's release rules ("returns fabricated
data → block the release"), this gated the release.

**Fix** (`src/validation/provider-llm-executor.ts`): a real
`ProviderLLMExecutor` that calls through `ProviderManager.generate()`, so eval
inherits all ADR-123 guardrails (budget caps, `AQE_LLM_PROVIDER` incl.
claude-code subscription, billing notice, spend ledger). `resolveEvalExecutor()`
picks a provider via a **non-billing** readiness check (API key in env /
claude-code binary / live Ollama probe), honoring `AQE_LLM_PROVIDER`.

**Behavior (per user decision):** `aqe eval run` / `run-all` now use **real
calls by default**. No provider configured → **hard error** (never fabricate).
`--mock` opts into canned responses for offline testing, behind a loud banner.

**Verified live:** real executor returned `"pong"` from cognitum (75 tokens);
`resolveEvalExecutor({})` returns a reason + no executor (never a disguised
mock); bundled CLI with no provider exits 1 with an actionable message; 269
validation tests pass (2 new executor suites). Model surfaced to the user with
its billing mode before the run.

## Out of scope

- The claude-flow daemon scheduler itself (external package) — but our billing
  notice + budget cap protect against any spawner.
- Anthropic Agent SDK integration (revisit if the paused SDK credit pool
  ships; `claude -p` is the stable subscription path today).
