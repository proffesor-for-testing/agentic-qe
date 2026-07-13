# ADR-123: Billing-Aware LLM Execution — Subscription Provider, Enforced Budgets, Billing Modes

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-123 |
| **Status** | Proposed |
| **Date** | 2026-07-13 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — (extends ADR-011 / ADR-043; amends one ADR-043 addendum behavior) |
| **Related** | [ADR-043](./ADR-043-vendor-independent-llm.md) (provider adapters + HybridRouter this extends), ADR-011 (LLM provider system), unified-persistence ADR (spend ledger lives in `memory.db`), [ADR-118](./ADR-118-receipt-gated-qe-policy-flywheel.md) (provider receipts as evidence), issue [#557](https://github.com/proffesor-for-testing/agentic-qe/issues/557) |

---

## WH(Y) Decision Statement

**In the context of** AQE's vendor-independent LLM layer (ADR-011/ADR-043) whose Claude provider can only call `api.anthropic.com` with `ANTHROPIC_API_KEY`, whose router silently force-enables that provider whenever the key is present in the environment, and whose declared budget caps (`maxCostPerHour/Day`, `COST_LIMIT_EXCEEDED`, `wouldExceedLimit()`) are dead code enforced nowhere,

**facing** a real user incident reported against AQE (issue #557: a fleet of ~374 headless agents ran unattended for ~11h and ran up a large surprise API bill while a paid Claude Max subscription sat unused, with no warning and no cap — attribution note in Context: the spend most likely flowed through claude-flow daemon headless sessions, not AQE's provider layer, but AQE's layer has the same structural failure), the verified platform fact that Pro/Max subscriptions cover headless Claude Code usage while an exported `ANTHROPIC_API_KEY` silently flips even the `claude` CLI to per-token billing, and the imminent addition of `api.cognitum.one` — a metered provider that returns authoritative per-request cost receipts (`x_cognitum.price_usd`) and enforces a server-side hard budget cap (`/v1/usage` `hardCapUsd`/`headroomUsd`),

**we decided for** (1) a **billing-mode taxonomy** on the provider contract — `metered-api` (claude API, openai, openrouter, gemini, azure-openai, bedrock), `metered-capped` (cognitum), `subscription` (new `claude-code` provider), `local` (ollama, onnx) — surfaced as a one-line startup notice whenever a metered provider is primary; (2) **enforced cross-process budgets**: spend persisted to a `llm_spend` ledger in the unified `memory.db`, checked in `ProviderManager` before each call, breach throws `COST_LIMIT_EXCEEDED`, surfaced as `--max-budget-usd` / `AQE_MAX_BUDGET_USD`; (3) a **`claude-code` provider** that spawns `claude -p --output-format json` with `ANTHROPIC_API_KEY` stripped from the child environment so it bills the user's subscription, selected via a new `AQE_LLM_PROVIDER` env var; (4) **provider-authoritative cost**: `LLMResponse.cost` carries `source: 'provider-receipt' | 'local-estimate'`, with Cognitum receipts preferred over price-table estimates; and (5) env-key detection **no longer overrides an explicit `enabled: false`** in disk config,

**and neglected** adopting the Anthropic Agent SDK for the subscription path (its separate credit pool was announced 2026-06-15 then paused; `claude -p` is the stable, documented subscription path today — revisit on SDK GA), a LiteLLM-style external gateway (same rejection as ADR-043: deployment complexity, external dependency), keeping budget enforcement in-process only (rejected: a fleet of N processes each sees $0 cumulative spend — the exact incident shape), and silently flipping the default to `claude-code` in the same release (deferred to a Phase-4 behavior-change release with notes; CI service accounts legitimately want API billing),

**to achieve** a worst-case failure mode of "hit your plan's rate limit or budget cap and pause" instead of "surprise four-figure bill," subscription-covered QE analysis for Pro/Max users, honest per-request cost attribution from providers that report it, and a transparent, provider-agnostic answer to "who is paying for this call,"

**accepting that** `claude -p` adds process-spawn latency (seconds per call — acceptable for QE analysis, wrong for tight loops; concurrency capped), subscription usage consumes the user's shared Claude/Claude Code allowance and can pause interactive work, the budget ledger adds a write per LLM call to `memory.db`, local price tables remain approximate for providers without receipts, and honoring `enabled: false` is a breaking behavior change for anyone who relied on key-presence force-enabling (release-noted, ADR-043 addendum amended).

---

## Context

Issue #557 (verified in code 2026-07-13): `src/shared/llm/providers/claude.ts:394,401`
is API-key-only raw fetch; `router/types.ts:1149` defaults the router to it;
`router/config-store.ts:233-251` force-enables it on key presence, overriding
explicit disables; `interfaces.ts:296-298` + `provider-manager.ts:702` +
`cost-tracker.ts:426-441` declare budgets that nothing enforces; `CostTracker`
is per-process in-memory. Anthropic's billing docs confirm subscription-covered
headless usage and the key-presence billing flip. Cognitum's live API (probed
2026-07-13) confirms OpenAI- and Anthropic-compatible surfaces, per-request
`price_usd` receipts, embeddings, and a server-side hard cap — the design must
generalize beyond a Claude-specific fix.

### Incident attribution (honest scoping, 2026-07-13)

We are **not** certain the surprise spend flowed through AQE's provider layer, and the
available evidence points elsewhere: the cited worker names
(audit/optimize/testgaps) are claude-flow daemon workers verbatim (AQE's
`src/workers/daemon.ts` workers make no LLM calls; `aqe audit` is witness-chain
verification — a pure name collision); AQE has no interval scheduler that
spawns LLM agents; this repo's own `.claude-flow/logs/headless/audit_*` logs
demonstrate the daemon's headless-session mechanism; and with
`ANTHROPIC_API_KEY` exported, those headless `claude` sessions bill the API key
directly — AQE code never needs to execute. Confirmation would require the
reporter's claude-flow logs (requested in the issue reply).

**Consequence for scoping:** the phases below fix the *class* of failure inside
AQE's own layer (which has the identical structure: API-only path, silent
force-enable, dead budget code) — but only the startup billing notice would
plausibly have mitigated the reporter's specific incident, since that spend
bypassed AQE's provider layer. This ADR must not be read as "AQE's fix would
have prevented issue #557's bill." Environment-level key hygiene (unset
`ANTHROPIC_API_KEY` where fleets run) is the incident-preventing measure and is
documented as the immediate mitigation.

## Consequences

- New provider types `claude-code` (Phase 2) and `cognitum` (Phase 3) join the
  `LLMProviderType`/`ExtendedProviderType` unions and provider registry.
- `AQE_LLM_PROVIDER` becomes the documented, highest-precedence provider
  selector; `.agentic-qe/llm-config.json` remains the durable config.
- The env-strip requirement for the spawned `claude` CLI is load-bearing and
  gets a dedicated regression test.
- MCP–CLI parity and reproduction-first verification apply (project rules):
  real `claude -p` round-trip, real Cognitum receipt parse, multi-process
  budget-kill test.

## Implementation

Phased plan with file-level detail:
[PLAN-ISSUE-557-billing-aware-llm-execution.md](../plans/PLAN-ISSUE-557-billing-aware-llm-execution.md)
