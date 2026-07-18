# Reply for issue #557 — POSTED 2026-07-13

Posted: https://github.com/proffesor-for-testing/agentic-qe/issues/557#issuecomment-4955330086

---

Hi Stu — thanks for the detailed report and the verified billing context, and I'm genuinely sorry about the surprise bill. That's exactly the failure mode a QE tool must not have. I've gone through the codebase against your report; here's what checks out, one correction, and what we're going to do.

## What you're right about (and it's slightly worse than you described)

- **The API-only path is real.** `src/shared/llm/providers/claude.ts` (and the consensus provider) call `api.anthropic.com` directly with `ANTHROPIC_API_KEY` — there is structurally no subscription path today.
- **It's a silent default.** The router not only defaults to the Claude API provider — merely having `ANTHROPIC_API_KEY` exported **force-enables** it, even overriding an explicit `enabled: false` in `.agentic-qe/llm-config.json`. Having the key in your environment silently opts you into API billing.
- **The budget cap you asked for already exists — as dead code.** `maxCostPerDay` is declared in the config (one default even says `$100/day limit`), a `COST_LIMIT_EXCEEDED` error code exists, and there's a `wouldExceedLimit()` helper — but nothing calls any of it. Worse, cost tracking is in-memory per process, so a fleet of hundreds of separate agent processes would each see $0 cumulative spend even if it were enforced. This is exactly the class of failure that dead config was supposed to prevent.

## One correction on the mechanism

The ~374-agent audit/optimize/testgaps fleet is scheduled by the claude-flow daemon (configured under `claudeFlow.daemon` in `.claude/settings.json`), which spawns headless `claude` sessions — not by AQE's `providers/claude.ts`. But that doesn't change your conclusion, because per Anthropic's docs, **when `ANTHROPIC_API_KEY` is set in the environment, even the `claude` CLI silently switches from subscription to per-token API billing**. The exported key poisoned every path. (Also: `aqe init` already writes the daemon config with `autoStart: false`, so your ask #3 is the shipped default — the always-on config came from elsewhere in the environment.)

**Immediate mitigation, today:** unset `ANTHROPIC_API_KEY` in any environment where the fleet/daemon runs and authenticate Claude Code via your Max login. Headless `claude -p` then draws from the subscription, and the worst case becomes "hit the plan limit and pause."

One ask, if you still have them: the claude-flow daemon writes per-session logs under `.claude-flow/logs/headless/` (files like `audit_<ts>_<id>_prompt.log` / `_result.log`, with model and duration in the result JSON). If your ~374 sessions show up there, that would confirm the spend path was the daemon's headless sessions billing the exported key — which matters for us, because it tells us whether any of that spend flowed through AQE's own provider layer at all, and it scopes what our fix actually prevents versus what only key hygiene prevents. We'd rather be precise than take credit for a fix that wouldn't have saved you.

## What we're doing about it

Tracked in ADR-123 ("Billing-aware LLM execution"), phased:

1. **Guardrails first:** enforce the existing `maxCostPerHour/Day` config in the provider manager (`COST_LIMIT_EXCEEDED` on breach), persist cumulative spend in AQE's unified database so the cap holds **across processes and fleets**, add `--max-budget-usd` / `AQE_MAX_BUDGET_USD`, and print a one-line billing notice at startup whenever a metered API provider is active. We're also fixing the force-enable so an explicit `enabled: false` is honored.
2. **`claude-code` provider** — essentially your sketch: `AQE_LLM_PROVIDER=claude-code` spawns `claude -p --output-format json` on the user's subscription. The load-bearing detail is that the child process env must have `ANTHROPIC_API_KEY` stripped, or the CLI silently reverts to API billing — that gets its own regression test.
3. **Billing modes everywhere:** every provider (we support several — OpenRouter/Ollama/Gemini/etc., with another metered provider that has server-side hard spend caps coming soon) declares `metered-api` / `metered-capped` / `subscription` / `local`, so "who pays for this call" is always visible up front, including in `aqe health`.
4. Later, as a release-noted behavior change: when subscription auth is available and no provider was explicitly chosen, prefer the subscription path by default — flipping the worst case from "surprise bill" to "rate-limit and pause," as you put it.

Your offer to help prototype the `claude -p` provider — yes please, especially testing OAuth edge cases and plan-limit behavior on a real Max account, which we can't fully exercise from CI. I'll link the PR here when the first phase is up.

Thanks again — this is the kind of report that makes the tool better for everyone.

---

*End of draft. Post with:*
`gh issue comment 557 --repo proffesor-for-testing/agentic-qe --body-file <this file, header and footer stripped>`
