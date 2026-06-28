# Session Report — Oracle Evals, Provider Fixes & Conservation Guard

- **Date:** 2026-06-27
- **Branch:** `feat/oracle-evals-and-conservation-guard`
- **Origin:** Applying Chad Fowler's "Phoenix Architecture" essays to the AQE platform.
- **ADRs:** [ADR-113](../implementation/adrs/ADR-113-evals-are-oracles.md), [ADR-114](../implementation/adrs/ADR-114-conservation-layer.md)
- **Plan:** [oracle-evals-durable-tests-plan](../plans/oracle-evals-durable-tests-plan.md)

## What this session delivered

### 1. Evals are oracles; tests are durable-first; mutation score is the gate (ADR-113)
Reframed AQE quality from *durability* to *regenerability* (Phoenix essays 5/7/8/15).
- `src/validation/oracle-eval.ts` — grades a generated test by RUNNING it against a reference impl
  (must pass) and operator mutants (must kill). Reuses the qe-arena engine (ADR-104) — no new
  mutation framework. An assertion-less/empty test is rejected at a sanity guard.
- Wired oracle mode into `scripts/run-skill-eval.ts` (`oracle` test-case type, skips under the
  simulating runner so CI stays green; runs in the live lane). Schema + eval template updated.
- `qe-test-generation` SKILL rewritten durable-first (durability tiers, language-swap heuristic,
  ≥1 durable assertion/target, oracle-graded checks). `qe-test-generation` eval flipped to oracle.
- `src/feedback/regenerability-gate.ts` — mutation-score + per-module regenerability gate
  (warn-by-default, opt-in blocking); surfaced in `qe-quality-assessment`.
- **Proof:** on one module, old happy-path tests kill **0/5** mutants; durable tests kill **5/5**.
- **Live-validated (real providers):** Claude `claude-sonnet-4-6` clears the oracle **5/5 (100%)**;
  local Ollama `qwen3:30b` writes a passing-but-weak test the oracle correctly **fails** — a keyword
  eval would have passed it. `npm run eval:live:claude` / `:ollama`.

### 2. Cheaper-model eval lanes (cost finding)
`scripts/oracle-model-bench.ts` + `openrouter-models.ts`. **`openai/gpt-oss-120b` reliably clears the
oracle (3/3, 100%) at ~$0.00013/gen — ~50–70× cheaper than Claude Sonnet.** Three other budget models
FAILED (wrote wrong-assertion tests). Free `:free` models are blocked by an OpenRouter account privacy
setting. Guide: [cheaper-model-eval-lanes](../guides/cheaper-model-eval-lanes.md).

### 3. LLM provider router fixes
- **OpenRouter routing bug fixed:** `type` was `'openai'` but it registered under `'openrouter'`, so
  `ProviderManager` failover never found it. Now `'openrouter'` end-to-end.
- **Gemini default model fixed:** `gemini-1.5-pro` was retired → `gemini-2.5-flash`; supported-list +
  pricing refreshed from the live Gemini ListModels API (2.5/3.x + `-latest` aliases).
- `scripts/provider-health.ts` (`npm run providers:health`): Claude, OpenAI, OpenRouter, Gemini,
  Ollama all ✓; Azure/Bedrock code intact, no creds here.

### 4. The Conservation Layer (ADR-114, Phoenix essay 14)
The complement to ADR-113: *regenerate internals, conserve the interface.*
- `src/validation/conservation-guard.ts` — pure diff core (additive passes; removals break unless
  deprecated).
- `scripts/conservation-guard.ts` (`npm run verify:conservation`) guards three surfaces with baselines
  in `verification/conservation/`: `cli-commands` (39), `output-schemas` (555 keys), `dashboard-api`
  (14 symbols). MCP covered by `mcp:parity`; rendered UIs by `aqe visual test`.
- Deprecation registry + policy ([conservation-layer-policy](../guides/conservation-layer-policy.md));
  wired into `invariant-check.yml` **non-blocking** initially.

## Verification
- `npm run build` ✓ (tsc + CLI + MCP bundles)
- New conservation/oracle/feedback test files + touched provider tests: **115/115**
- Full LLM suite: **724/724** · lint (new files) clean · `verify:conservation` & `verify:skill-parity` clean

## Known limitations (follow-ups)
- `plugins/` and `.kiro/` skill trees are not gated/synced by the parity guard (it checks
  `assets/skills` only) — they can drift; durable-first SKILL + oracle eval case are not in them.
- Bulk flip of the remaining ~54 skill evals to oracle awaits the live-generation lane.
- Oracle/gate/conservation are internal tooling (npm scripts + libs), not yet `aqe` commands / MCP tools.
- Full `npm test` not run locally (OOM); relied on targeted suites + build + CI.

## New npm scripts
`eval:live:claude` · `eval:live:ollama` · `eval:models` · `eval:models:list` · `providers:health` ·
`verify:conservation` · `verify:skill-parity`
