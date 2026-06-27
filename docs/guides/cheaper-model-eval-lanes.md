# Save money on test generation with cheaper models (validated by the oracle)

> Related: [ADR-113](../implementation/adrs/ADR-113-evals-are-oracles.md) · plan `docs/plans/oracle-evals-durable-tests-plan.md`

AQE's oracle eval (run a generated test against a reference + operator mutants) means you
don't have to *trust* a model — you can *measure* it. That lets you safely swap the
frontier model for a much cheaper one for test generation, as long as the cheap model
clears the oracle. This guide shows how, with real measured results.

## TL;DR

- A cheap OpenRouter model, **`openai/gpt-oss-120b`**, reliably generates tests that clear the
  oracle (3/3 runs, 100% mutation kill) at **~$0.00013 per generation** — ~50–70× cheaper than
  Claude Sonnet for the same passing result.
- **Most budget models fail** — they write tests with *wrong* expected values that don't even pass
  against correct code. The oracle catches every one. Never ship a cheap model unvalidated.
- **Free (`:free`) models** need an OpenRouter account privacy toggle enabled and are heavily
  rate-limited; with default settings they return `404 "No allowed providers"`.

## Setup

1. Get an OpenRouter key (https://openrouter.ai/keys) and add it to a **gitignored** `.env`:
   ```
   OPENROUTER_API_KEY=sk-or-...
   ```
   (The eval scripts auto-load `.env`; it is never logged or committed.)

2. List current cheap / free models and prices:
   ```bash
   npm run eval:models:list          # cheapest priced models
   npm run eval:models:list -- free  # $0 / :free models
   ```

3. Benchmark candidates through the oracle (best-of-3 per model):
   ```bash
   npm run eval:models            # 5 free + 5 cheap
   npm run eval:models -- cheap   # cheap only
   ```
   Each model generates a test for a reference function; the oracle runs it against the
   reference (must pass) and 5 operator mutants (must kill). A model "PASSES" only if it
   produces a test that actually catches bugs.

4. Validate a specific model on the standard task: add it to the `CHEAP` list in
   `scripts/oracle-model-bench.ts` and run `npm run eval:models -- cheap`. To validate against
   *your own* code, change `REFERENCE_IMPL` to a function from your codebase.
   The single-run live lane (`npm run eval:live:claude` / `:ollama`) covers the Anthropic and
   local-Ollama paths; OpenRouter currently goes through the benchmark's direct-HTTP path (see
   Caveats).

## Measured results (2026-06-27, task: generate a durable test for a 3-branch `classify()`)

| Tier | Model | Verdict | Mutation | Latency | ~$/run |
|---|---|---|---|---|---|
| frontier | `claude-sonnet-4-6` | PASS (reliable) | 5/5 | ~6s | ~$0.005–0.01 |
| cheap | **`openai/gpt-oss-120b`** | **PASS 3/3** | 5/5 | 2.6s | **$0.00013** |
| cheap | `qwen3-235b-a22b-thinking` | PASS 3/3 | 5/5 | 86.6s | $0.0008 |
| cheap | `qwen3-235b-a22b-2507` | FAIL 0/3 | — | 6.6s | (wrong-assertion test) |
| cheap | `deepseek-v4-flash` | FAIL 0/3 | — | 13.7s | (wrong-assertion test) |
| cheap | `mistral-small-3.2-24b` | FAIL 0/3 | — | 5.4s | (wrong-assertion test) |
| local | `qwen3:30b-a3b` (Ollama) | FAIL | 0/5 | ~20s | $0 (self-host) |
| local | `Qwable-3.6-27b` (Ollama) | FAIL | — | ~60s | $0 (self-host) |

Why the FAILs fail: the model misread the function's branching and asserted, e.g., `'B'`
where correct behavior is `'C'`. Such a test would raise false alarms in real use — strictly
worse than no test. The oracle rejects them at baseline.

## Recommendations

- **Best value today:** `openai/gpt-oss-120b` — reliable, fast, ~$0.00013/gen. Validate on *your*
  modules before adopting (run `npm run eval:models -- cheap` after pointing it at your code).
- **Slow-but-capable:** `qwen3-235b-a22b-thinking` passes too but at ~87s/gen — only worth it if
  cost matters more than latency.
- **Self-hosted free:** local Ollama (`qwen3:30b-a3b`) is $0 but currently below the test-gen
  floor (writes weak tests). Fine for drafts you'll oracle-gate; not for unattended generation.
- **Always gate with the oracle.** Cheap-model output is nondeterministic — benchmark best-of-N
  and re-check periodically. The oracle is the safety net that makes cost optimization safe.

## Caveats / known issues

- **OpenRouter `:free` models** return `404 "No allowed providers"` unless you enable the
  free-endpoints data policy in OpenRouter account settings (Settings → Privacy), and even then
  are rate-limited (`429`). Budget for retries/backoff.
- **AQE's `OpenRouterProvider`** routing bug is **fixed** (its `type` was `'openai'` but it
  registered under `'openrouter'`, so `ProviderManager` failover never found it). OpenRouter now
  works through the normal provider path. The benchmark scripts still call the HTTP API directly
  (provider-independent), which is fine.
- **Reasoning models** (e.g. `openai/gpt-oss-120b`) need a generous `max_tokens` — with a small
  budget they spend it all on reasoning and return empty `content`. Use ≥1000 for test generation.
- **Retry stacking:** the provider's default `maxRetries: 3 × timeoutMs: 60000` means a hung
  endpoint can block ~3 min. Lower `maxRetries`/`timeoutMs` in the provider config for snappier
  failure on flaky free endpoints.
