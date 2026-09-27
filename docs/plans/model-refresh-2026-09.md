# Model Refresh Plan — September 2026

GOAP plan for bringing AI model references in agentic-qe up to the current
model generation. Created 2026-09-27 from a deep-research audit plus live
provider catalog checks.

## Goal state

- No retired model ID is used as a default, fallback, or routing target.
- Every model that routing can select has a model-registry capability row and a
  cost-tracker price row (ADR-123 budget enforcement never sees an unpriced
  model).
- Native Anthropic requests are valid for every model they can target
  (no `temperature`/`top_p` on models that reject them; effort in
  `output_config.effort`).
- Claude routing tiers use the current generation; local free-tier defaults
  follow ADR-111 (`qwen3-coder:30b`, never `qwen3:8b`).
- Shipped agent/skill text, CI model flags, and user docs match the code.
- Build, lint, focused and unit test suites pass; CLI and MCP paths verified.

## Current state (verified)

Live catalog checks on 2026-09-27 (read-only `GET /v1/models` calls; OpenRouter
public catalog for pricing):

| Vendor | Verified current IDs | Retired / not served |
|---|---|---|
| Anthropic `/v1/models` | `claude-opus-5-5`, `claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-5-20251101`, `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929` | all `claude-3*`, `claude-sonnet-4-20250514`, `claude-opus-4-20250514`, `claude-opus-4-1-*` |
| OpenAI `/v1/models` | `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-{sol,luna,terra}`, `gpt-5.x-codex`, … | `gpt-4o`/`gpt-4*`/`o4-mini` still listed; announced Oct 2026 retirement is UNVERIFIED from a primary source |
| OpenRouter | `anthropic/claude-sonnet-5`, `openai/gpt-6-sol`, `google/gemini-3.8-flash`, `meta-llama/llama-4-maverick`, `deepseek/deepseek-v4-pro`, `qwen/qwen3-coder`, `openai/gpt-oss-120b` | `anthropic/claude-3.5-sonnet` absent |
| Gemini API | not verifiable (`.env` key invalid) | — |

Verified prices ($/MTok in/out): Opus 5 5/25, Opus 5.5 4/20, Fable 5.1 10/50,
Sonnet 5 2/10, Haiku 4.5 1/5, Opus 4.7 5/25, Sonnet 4.6 3/15, GPT-6 Astra 10/50,
GPT-6 Sol 2/10, GPT-6 Luna 0.10/0.50, Gemini 3.8 Flash 0.75/3.75,
Gemini 3.5 Flash 1.5/9, Gemini 3.1 Pro (preview) 2/12.

Live API probes (unbilled 400s) proved a **current production bug**:
`src/shared/llm/providers/claude.ts` always sends `temperature` and puts effort
under `thinking.adaptive.effort`. Against `claude-opus-4-7` (today's tier 4)
both return 400 (`temperature is deprecated for this model`,
`thinking.adaptive.effort: Extra inputs are not permitted`). `claude-sonnet-5`
also rejects `temperature`. A request without `temperature` and with
`output_config.effort` succeeds on Sonnet 5.

## Decisions (defaults taken; revisit in review)

| # | Decision | Rationale |
|---|---|---|
| D1 | Tiers: T1 `claude-haiku-4-5-20251001` (unchanged), T2 `claude-sonnet-5`, T3 `claude-sonnet-5` (extended-thinking tier, same model as before), T4 `claude-opus-5-5` | Opus 5.5 is GA (in `/v1/models`) and cheaper than Opus 5/4.7 ($4/$20 vs $5/$25); maintainer chose it over Opus 5. No AQE code sends forced `tool_choice` or disables thinking, the two Opus 5.5 breaking changes. Sonnet 5 is cheaper than Sonnet 4.6 ($2/$10 vs $3/$15) |
| D2 | Register and price `claude-opus-5`, `claude-fable-5-1`, `claude-fable-5`, `claude-opus-4-8` but do not make them defaults | Opt-in; Fable is 2.5× Opus 5.5 price |
| D3 | OpenAI defaults: capable `gpt-4o` → `gpt-6-sol`, cheap `gpt-4o-mini` → `gpt-6-luna` | Verified in catalog and priced; avoids the GPT-4 family retirement |
| D4 | Codex keeps the `'default'` sentinel; `getSupportedModels()` stops gatekeeping and lists current IDs | Codex model churn is weekly; CLI decides |
| D5 | Gemini default stays `gemini-2.5-flash`; add 3.x rows | 3.x IDs unverifiable against the Gemini API with our key |
| D6 | Local default `qwen3:8b` → `qwen3-coder:30b` everywhere | ADR-111 quality floor |
| D7 | `value-score.ts` measured numbers untouched; only labels | Measured data needs a re-run, not an edit |
| D8 | Retired rows stay in cost tables marked deprecated | Historical cost reconciliation |

## Actions

| # | Action | Preconditions | Effects | Cost |
|---|---|---|---|---|
| A1 | Fix native Anthropic request builder: omit sampling params for models whose registry capability says they are rejected; send effort as `output_config.effort`; same for other Anthropic-shaped builders (bedrock, cognitum, consensus claude-provider) | live probe evidence | tier-4 calls succeed; tier bump safe | M |
| A2 | Add registry capability + cost rows for current models; mark retired rows | verified pricing | budgets price every routable model | S |
| A3 | Centralize Claude tier → model mapping in one module; replace ~18 duplicated maps | A2 | one-line future bumps | M |
| A4 | Apply D1 via A3; update default models in router/MCP/context callers | A1, A2, A3 | routing on current gen | M |
| A5 | Non-Anthropic provider defaults and model lists (openai, azure, openrouter, gemini, codex, ollama, consensus providers, provider-health script) | A2 | no retired defaults | M |
| A6 | Local free-tier defaults (D6) + docs | — | ADR-111 compliance | S |
| A7 | Agent/skill markdown across every tree (`.claude/`, `assets/`, `plugins/`, docs copies), CI `--model` flags, user docs | A4 | shipped text matches code | S |
| A8 | Update tests pinning IDs; run build, lint, focused + unit suites | A1–A7 | green evidence | M |
| A9 | Verify CLI/MCP parity (`model_route` tool + CLI routing) and one live low-cost Anthropic call per tier through the provider | A8 | real-path evidence | S |
| A10 | Open PR; adversarial review (independent reviewer agent + codex); fix findings; merge | A9 | shipped | M |

Plan order: A1 → A2 → A3 → A4 → (A5 ∥ A6 ∥ A7) → A8 → A9 → A10.

## Risks and replanning triggers

- A provider test suite asserts old IDs broadly: update assertions, never loosen behavior checks.
- Anthropic thinking defaults: Opus 5 runs adaptive thinking when `thinking` is omitted (higher output tokens). Keep `max_tokens` budgets and effort explicit on tier 4.
- OpenRouter may not pass `temperature` through for Claude 5 models: verify the OpenRouter path strips or omits it.
- If the live tier probe fails for any tier, stop and replan before merging.

## Fallback

If the tier bump (A4) destabilizes tests, ship A1 + A2 + A5 + A6 (bug fixes and
retired-ID removal) alone and move A3/A4 to a follow-up PR.
