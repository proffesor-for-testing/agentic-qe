# ADR-093 Implementation Plan — Opus 4.7 Migration + Claude Code 2026-04 Feature Adoption

**ADR:** [ADR-093](../adrs/ADR-093-opus-4-7-migration.md)
**Branch strategy:** single PR on branch `adr-093-opus-4-7-migration`, separate commits per logical unit; one npm release when the block is complete
**Release strategy:** all commits ship in one npm version bump (not per-commit releases) — per user direction 2026-04-17
**Deprecation warnings:** none — migrate all at once per user direction
**Hard deadline:** 2026-06-15 (Sonnet 4 retirement) — **PR-1 and PR-2 must land before this date**
**Owner:** AQE Team
**Plan date:** 2026-04-17

---

## Guiding principles for this plan

1. **No unverified failure modes.** Every "this might break X" gets a test or a quarantine before merge.
2. **Structured output, not stdout grep.** Post-change verification uses `grep -c` counts and `tsc --noEmit` exit codes, not hand-inspection.
3. **Small, revertable PRs.** Each PR is independently revertable without breaking the next one.
4. **Feature-flag new behavior.** `xhigh` and 4.7 escalation land behind env/YAML flags that can be flipped off in seconds.
5. **No coupling of unrelated changes.** Routines/Monitor/Managed Agents stay out of this plan — tracked in a future ADR-094.

---

## Commit ordering (single PR)

```
Commit 1 (registry)  →  Commit 2 (mechanical sweep)  →  Commit 3 (effort + security-agent effort:max)  →  Commit 4 (thinking shim)  →  Commit 5 (escalation wiring)  →  Commit 6 (security pinning)
```

All 6 commits land on `adr-093-opus-4-7-migration`, merged as one PR, shipped in one npm release. Commit 3 includes per-agent `effort: max` frontmatter for `qe-security-auditor`, `qe-security-scanner`, `qe-security-reviewer`, `qe-pentest-validator` (decision 2 of 2026-04-17). PR-7 (telemetry recalibration) remains a future follow-up, gated on 30 days of production data — not part of this PR.

---

## PR-1: Model registry additions (no behavior change)

**Branch:** `adr-093-pr1-model-registry`
**Intent:** Add 4.7 and 4.6 entries, central constants, deprecation metadata for retiring IDs. Zero runtime behavior change.
**Estimated size:** ~150 LOC across 2 files + tests.

### Files changed

| File | Change |
|---|---|
| `src/shared/llm/model-registry.ts` | Add `claude-opus-4-7` entry (1M context, adaptive thinking, xhigh, new tokenizer flag), `claude-sonnet-4-6` entry (standard 200k context), `claude-haiku-4-5-20251001` entry. Export `DEFAULT_SONNET_MODEL`, `DEFAULT_OPUS_MODEL`, `DEFAULT_HAIKU_MODEL`, `RETIRING_MODELS` (with retirement dates). Mark `claude-sonnet-4-20250514` deprecationDate `2026-06-15`. |
| `src/shared/llm/model-mapping.ts` | Add Bedrock + Vertex IDs for Opus 4.7 (`anthropic.claude-opus-4-7-v1:0`) and Sonnet 4.6. |
| `src/shared/llm/model-registry.ts` | Extend `ModelCapabilities` interface with `supportsAdaptiveThinking: boolean`, `supportsEffortXHigh: boolean`, `tokenizerVersion: 'legacy' \| 'opus-4-7'`. Default existing entries to `false` / `'legacy'`. |
| `tests/unit/shared/llm/model-registry.test.ts` | New: assert `DEFAULT_SONNET_MODEL === 'claude-sonnet-4-6'`; assert `getModelCapabilities('claude-opus-4-7').contextLength === 1_000_000`; assert retiring models have a deprecationDate ≤ today + 60 days. |

### Open questions

- **Q1:** Is the canonical 4.6 model ID `claude-sonnet-4-6` or a dated variant like `claude-sonnet-4-6-20260101`? **Must verify against** `https://docs.anthropic.com/en/docs/about-claude/models/all-models` before merge. If dated, update `DEFAULT_SONNET_MODEL` literal accordingly.
- **Q2:** Does Bedrock publish a stable `anthropic.claude-opus-4-7-v1:0` model ID, or is it regional? **Must verify** via `aws bedrock list-foundation-models` before merge.

### Verification

- `npm run build` passes
- `npm test -- tests/unit/shared/llm/model-registry.test.ts` passes
- `grep -c 'DEFAULT_SONNET_MODEL' src/shared/llm/model-registry.ts` returns 1 (the export)

### Rollback

`git revert` the PR commit. No data, no config, no user-facing change — trivial revert.

---

## PR-2: Mechanical sweep of hardcoded model IDs

**Branch:** `adr-093-pr2-model-id-sweep`
**Depends on:** PR-1 merged
**Intent:** Replace every hardcoded `claude-sonnet-4-20250514`, `claude-opus-4-5-20251101`, and `claude-3-5-haiku-20241022` with imports of the central constants from PR-1. Zero runtime behavior change (constants point to the same model strings during this PR; the switch to 4.6/4.7 is configuration, not code).
**Estimated size:** ~60 line edits across 25+ files, plus 2 lint-rule additions, plus tests.

### Files to change (confirmed from grep 2026-04-17)

1. `src/coordination/task-executor.ts:155-159` — tier map
2. `src/cli/commands/llm-router.ts:501,556`
3. `src/shared/llm/router/routing-rules.ts:268,303,320,337,354`
4. `src/shared/llm/router/types.ts:1092,1151,1155,1474`
5. `src/shared/llm/router/hybrid-router.ts:1106`
6. `src/shared/llm/router/agent-router-config.ts:145,154,181,208,668,687`
7. `src/shared/llm/interfaces.ts:154` — type union
8. `src/shared/llm/provider-manager.ts:684`
9. `src/shared/llm/cost-tracker.ts:29` — **must add new entries for 4.6 and 4.7 with updated $/MTok**
10. `src/shared/llm/model-mapping.ts:83,113`
11. `src/shared/llm/providers/claude.ts:34,322`
12. `src/shared/llm/providers/bedrock.ts:115,121`

### Important: cost-tracker update

`cost-tracker.ts:29` currently has `claude-sonnet-4-20250514: {input: 3.0, output: 15.0}`. Add:
- `claude-sonnet-4-6: {input: 3.0, output: 15.0}` (unchanged pricing)
- `claude-opus-4-7: {input: 5.0, output: 25.0, tokenizer: 'opus-4-7'}` (new; tokenizer multiplier for realistic cost reporting per ADR-093 Context §1)

### Lint rule additions

Add ESLint rule banning raw `claude-sonnet-4-20250514` / `claude-opus-4-5-20251101` string literals outside the registry itself:

```js
// .eslintrc.js or equivalent
'no-restricted-syntax': ['error', {
  selector: "Literal[value=/^claude-(sonnet-4-2025|opus-4-5-2025|3-5-haiku)/]",
  message: 'Use DEFAULT_SONNET_MODEL / DEFAULT_OPUS_MODEL / DEFAULT_HAIKU_MODEL from model-registry instead of hardcoded IDs',
}]
```

Exception: `src/shared/llm/model-registry.ts` (the registry itself) and `tests/fixtures/*.ts`.

### Verification (pre-merge must-pass)

```bash
# 1. Zero remaining hardcoded retired IDs outside the registry
npm run lint 2>&1 | grep -c 'no-restricted-syntax' # must be 0

# 2. All IDs resolvable
npm test -- tests/unit/shared/llm/ # full LLM test suite passes

# 3. Type safety
npx tsc --noEmit # zero errors

# 4. Existing integration tests still pass
npm test -- tests/integration/llm/ # MSW provider tests
```

### Risks

- **R1:** A missed file — grep was run once, but new code may have landed since. **Mitigation:** Re-run the grep from ADR-093's Context section as the last step before commit; PR description must show grep count before/after.
- **R2:** Type union in `interfaces.ts:154` is a string literal union — changing it may cascade. **Mitigation:** Expand the union rather than replace, add 4.6 and 4.7 as new members; retire 4-20250514 in a follow-up after PR-5.
- **R3:** Cost regression in reports if tokenizer multiplier not applied. **Mitigation:** `cost-tracker.ts` applies the 1.0x (legacy) or 1.35x (Opus 4.7) multiplier based on registry `tokenizerVersion`.

### Rollback

`git revert`. Because PR-1's constants point to the same underlying IDs the sweep is replacing, rollback is safe.

---

## PR-3: Effort-level plumbing (`xhigh` fleet-wide configurable)

**Branch:** `adr-093-pr3-effort-level`
**Depends on:** PR-1 (registry knows which models support xhigh)
**Intent:** Add `QE_EFFORT_LEVEL` env var + `config/fleet-defaults.yaml` + per-agent frontmatter override. Default to `xhigh` fleet-wide. First real behavior change.
**Estimated size:** ~400 LOC across 6 files + tests + config.

### Resolution chain (highest priority wins)

```
runtime call site override (e.g. explicit `{effort: 'max'}` on .chat())
  ↓
per-agent frontmatter `effort: <level>` (parsed from .claude/agents/v3/qe-*.md)
  ↓
`QE_EFFORT_LEVEL` env var
  ↓
`config/fleet-defaults.yaml` → `effort_level`
  ↓
hardcoded default in resolver: `xhigh`
```

### Files changed

| File | Change |
|---|---|
| `src/shared/llm/interfaces.ts` | Add `type EffortLevel = 'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'`; add optional `effort?: EffortLevel` to `LLMRequestOptions`. |
| `src/shared/llm/effort-resolver.ts` | **NEW.** `resolveEffortLevel(agentName?, runtimeOverride?): EffortLevel` implementing the chain above. Exports `DEFAULT_EFFORT_LEVEL = 'xhigh'`. |
| `config/fleet-defaults.yaml` | **NEW.** `effort_level: xhigh` (plus placeholder for future fleet-wide defaults). |
| `src/shared/llm/providers/claude.ts` | Read `options.effort`; if target model has `capabilities.supportsEffortXHigh` and `effort === 'xhigh'`, include `effort: 'xhigh'` in the API request. Silently downgrade to `high` if the model doesn't support xhigh (logged at debug). |
| `src/shared/llm/router/hybrid-router.ts` | `chat()` calls `resolveEffortLevel()` when `options.effort` is not passed. |
| `.claude/agents/v3/_schema.md` or agent-loader | Extend agent frontmatter schema to accept optional `effort: <level>`. |
| `tests/unit/shared/llm/effort-resolver.test.ts` | **NEW.** Tests for all 5 resolution-chain levels + invalid-value rejection + downgrade path on non-supporting model. |

### Per-agent override examples (not part of this PR — documented for reviewers)

- `qe-security-auditor.md` adds `effort: max` in frontmatter (higher-stakes agent)
- `qe-coverage-specialist.md` adds `effort: medium` (cheap, frequent scans)
- All 60 qe-* agents default to fleet `xhigh` if they don't declare the field

### Verification

```bash
# 1. Resolver returns xhigh by default
node -e "require('./dist/shared/llm/effort-resolver').resolveEffortLevel() === 'xhigh' || process.exit(1)"

# 2. Env var override works
QE_EFFORT_LEVEL=medium node -e "require('./dist/shared/llm/effort-resolver').resolveEffortLevel() === 'medium' || process.exit(1)"

# 3. Downgrade path: resolver asks for xhigh, target is Haiku, provider receives high
npm test -- tests/unit/shared/llm/effort-resolver.test.ts
npm test -- tests/unit/shared/llm/providers/claude.test.ts
```

### Risks

- **R4:** `xhigh` on every agent raises token spend. **Mitigation:** PR-3 ships with a debug log line `[aqe] effort resolved to <level> for <agent>` so cost anomalies can be traced. PR-7 recalibrates after 30 days of data.
- **R5:** Per-agent frontmatter parser already runs at agent-load time; adding a field is safe but needs a test. **Mitigation:** Unit test loading a qe-* agent file with and without the field.
- **R6:** The YAML config file is new — no existing loader. **Mitigation:** Use an existing YAML loader if present (`yaml` package per package.json) or fall back to env-var-only in this PR and add YAML loading in PR-3.1.

### Rollback

Set `QE_EFFORT_LEVEL=high` (or whatever the prior effective default was) as a safety switch. Full revert is clean.

---

## PR-4: Thinking-config compatibility shim — SKIPPED 2026-04-17

**Status: skipped.** Pre-commit grep of `src/` for `budget_tokens`, `thinking: {type:"enabled"}`, and uses of `maxThinkingTokens` returned **zero callers** that actually set thinking config on outbound requests. The `maxThinkingTokens` field exists on `ClaudeConfig` but is unreferenced. A shim with no callers is dead code.

Revisit when the first caller that sets thinking config appears — typically in the ADR-092 advisor path if/when it starts passing thinking budgets to Opus 4.7. Track as an open concern in ADR-093 §Validation Criteria.

**Original intent (preserved for history):** Translate legacy `{type: "enabled", budget_tokens: N}` → `{type: "adaptive"}` when target model is `claude-opus-4-7`; opt-in streamed CoT via `thinking.display: "summarized"` where consumers exist.

### Files changed

| File | Change |
|---|---|
| `src/shared/llm/providers/claude.ts` | Before calling Anthropic SDK, inspect `request.thinking` + target model. If model is 4.7 and thinking has `{type:"enabled", budget_tokens:N}`, rewrite to `{type:"adaptive"}` and log `console.warn('[aqe] ADR-093 shim: translated legacy thinking config for Opus 4.7, please migrate caller at <stack trace>')`. Preserve `display: "summarized"` if caller set it. |
| `tests/unit/shared/llm/providers/claude-thinking-shim.test.ts` | **NEW.** Table-driven test: (target model, input thinking config) → (expected API payload). Cover (4.7, enabled+budget) → adaptive; (4.7, adaptive) → passthrough; (4.6, enabled+budget) → passthrough; (4.7, nothing) → nothing. |
| `docs/implementation/adrs/ADR-093-opus-4-7-migration.md` | Update Phase 3 status to "Implemented" when this PR merges. |

### Verification

```bash
npm test -- tests/unit/shared/llm/providers/claude-thinking-shim.test.ts
# Must cover 4 scenarios from the table above
```

### Risks

- **R7:** Shim silently changes caller-visible behavior. **Mitigation:** warn-level log on every translation; telemetry counter in `RouterMetricsCollector` so shim usage can be tracked and call sites prioritized for direct migration.
- **R8:** Thinking block content omitted by default on 4.7 may break callers that consume CoT. **Mitigation:** Audit callers of `response.thinking` in the codebase before merge: `grep -r 'response\.thinking\|message\.thinking' src/`. If any found, add `thinking.display: "summarized"` at those call sites.

### Rollback

Revert PR. Callers that have started relying on the shim will see 400s on 4.7 — so this PR must stay landed once 4.7 escalation (PR-5) is live.

---

## PR-5: Wire Opus 4.7 as ADR-092 escalation target

**Branch:** `adr-093-pr5-advisor-escalation`
**Depends on:** PR-1, PR-2, PR-4
**Intent:** When `triggerMultiModel=true` and complexity warrants, `MultiModelExecutor` dispatches to Opus 4.7 (not Opus 4 or 4.5) via `HybridRouter.chat()`. 4.7 becomes the default Opus advisor model.
**Estimated size:** ~100 LOC across 3 files + tests + config.

### Files changed

| File | Change |
|---|---|
| `src/routing/advisor/multi-model-executor.ts` | Default `advisorModel` changes from prior Opus ID to `DEFAULT_OPUS_MODEL` (= `claude-opus-4-7`). |
| `config/fleet-defaults.yaml` | Add `advisor.default_model: claude-opus-4-7`. |
| `.claude/agents/_shared/executor-preamble.md` | No change expected; verify that the preamble works unchanged on 4.7. |
| `tests/integration/routing/advisor-opus-4-7.test.ts` | **NEW.** End-to-end: TinyDancer sets `triggerMultiModel=true`, MultiModelExecutor.consult() dispatches to 4.7 via MSW-mocked Anthropic provider, result passes through redaction + circuit breaker. |

### Verification

```bash
# 1. Integration test with MSW mock
npm test -- tests/integration/routing/advisor-opus-4-7.test.ts

# 2. Real-API smoke test (gated on ANTHROPIC_API_KEY, runs in CI on release branches only)
AQE_E2E_ADVISOR=true npm run test:e2e -- advisor-4-7-smoke

# 3. Circuit breaker still trips at 10 calls
npm test -- tests/unit/routing/advisor/circuit-breaker.test.ts
```

### Risks

- **R9:** 4.7's $5/$25 per MTok + 1.35× tokenizer makes advisor calls more expensive than projected. **Mitigation:** PR-5 ships with `RouterMetricsCollector` recording per-advisor-call `estimatedCostUsd`; PR-7 uses that to recalibrate thresholds.
- **R10:** 4.7's different response style (more literal, less validation-heavy per research brief) may change advisor-output parsing. **Mitigation:** Advisor output is consumed as free text by the executor, not parsed by regex. Verified by reading `multi-model-executor.ts` consumer code.

### Rollback

Switch `config/fleet-defaults.yaml` `advisor.default_model` back to the prior Opus ID. Full revert of the PR restores prior behavior.

---

## PR-6: Security-agent pinning until Cyber Verification approval

**Branch:** `adr-093-pr6-security-pinning`
**Depends on:** PR-1 (needs registry entries)
**Independent of:** PR-2/3/4/5 (can merge in parallel)
**Intent:** Pin `qe-pentest-validator`, `qe-security-scanner`, `qe-security-auditor`, `qe-security-reviewer` to Sonnet 4.6 for any escalation path; reject 4.7 for these agents until `AQE_CYBER_VERIFIED=true` env var is set.
**Estimated size:** ~80 LOC across 2 files + tests.

### Files changed

| File | Change |
|---|---|
| `src/shared/llm/router/hybrid-router.ts` | Before dispatch: if agent name matches `^qe-(pentest|security)-` and target model is `claude-opus-4-7` and `process.env.AQE_CYBER_VERIFIED !== 'true'`, override target to `DEFAULT_SONNET_MODEL`. Log `[aqe] ADR-093: security agent pinned to Sonnet pending Cyber Verification`. |
| `src/routing/advisor/multi-model-executor.ts` | Apply the same pin when `triggerMultiModel=true` dispatches. |
| `tests/unit/shared/llm/router/security-pinning.test.ts` | **NEW.** Verify all 4 agent names hit the pin; verify `AQE_CYBER_VERIFIED=true` lifts the pin; verify non-security agents are unaffected. |

### Verification

```bash
npm test -- tests/unit/shared/llm/router/security-pinning.test.ts
# 8 test cases: 4 agents × (pinned | unpinned)
```

### Risks

- **R11:** Agent name detection by regex may false-match a future agent like `qe-security-config-validator`. **Mitigation:** Use an explicit allow-list (`SECURITY_AGENTS: readonly ['qe-pentest-validator', 'qe-security-scanner', 'qe-security-auditor', 'qe-security-reviewer']`) not a regex.
- **R12:** The pin silently downgrades the model — user may not know. **Mitigation:** Log once per agent per session at info level; add a `/aqe llm cyber-status` CLI subcommand that reports pin status.

### Rollback

Set `AQE_CYBER_VERIFIED=true` once Anthropic approval is received. To fully remove the pin later, a follow-up PR with approval reference number in the commit message.

### Activation condition

`AQE_CYBER_VERIFIED` stays `false` (or unset) until the Cyber Verification application (`docs/security/cyber-verification-application.md`) receives an approval reference number from Anthropic. Record that number in ADR-093's Validation Criteria §5 and in this PR's post-merge changelog.

---

## PR-7: Telemetry-gated threshold recalibration (+30 days)

**Branch:** `adr-093-pr7-recalibrate-thresholds`
**Depends on:** PR-5 landed for 30 calendar days
**Not part of initial ship.** Tracked here to keep the plan closed-loop.
**Intent:** Use 30 days of `routing_outcomes` data post-4.7-escalation to recalibrate (a) ADR-082 complexity thresholds for the new tokenizer, (b) ADR-092's 10-call circuit-breaker ceiling if data shows it's under- or over-sized, (c) `xhigh` cost impact and per-agent downgrade recommendations.

### Inputs

- SQLite `routing_outcomes` table, 30-day window
- `RouterMetricsCollector` per-agent effort-level breakdown
- `advisor_consultation` rows from PR-5 wiring

### Outputs

- A new ADR or amendment to ADR-082 with recalibrated thresholds
- A PR updating `config/fleet-defaults.yaml` with per-agent effort overrides where data justifies
- A decision log entry: "xhigh default retained" or "xhigh demoted to high for N agents"

---

## Cross-cutting concerns

### CI gate additions

Add to `.github/workflows/`:

- On every PR in this series: lint + `tsc --noEmit` + LLM unit tests must pass
- On PR-2 specifically: a custom step `grep -c 'claude-sonnet-4-20250514' src/ | grep -v 0` that fails if any remain outside the registry/tests
- On PR-5: the MSW-mocked integration test gates merge; the live-API smoke test runs only on `main` post-merge

### Documentation updates

Per CLAUDE.md "NEVER proactively create documentation files" — this plan does not add new documentation beyond:
- Updates to ADR-093 status as PRs land
- Updates to `v3-adrs.md` index row status (Proposed → Implementing → Implemented)
- Per-PR changelog entries in existing `CHANGELOG.md`

### Migration communication

Each merge notifies users via:
- PR description (outcome-focused per CLAUDE.md §PR & Git Conventions)
- `CHANGELOG.md` entry
- Release notes on the next npm version bump

No README rewrites. No separate migration guide unless a breaking API surface is exposed to users (none of these PRs do — they all land behind config).

---

## Timeline (proposed)

| Week of | Milestone |
|---|---|
| 2026-04-21 | PR-1 open, reviewed, merged |
| 2026-04-28 | PR-2 open, reviewed, merged |
| 2026-05-05 | PR-3 open, reviewed, merged; `xhigh` active in `working-april` |
| 2026-05-12 | PR-4 open, reviewed, merged |
| 2026-05-19 | PR-5 open, reviewed, merged; 4.7 live as escalation target |
| 2026-05-26 | PR-6 open, reviewed, merged (can move earlier; no PR-2/3/4/5 dependency) |
| 2026-05-26 → 2026-06-15 | Buffer: watch error rates, cost dashboards; file any hotfix PRs |
| 2026-06-15 | **Sonnet 4 retirement. Production fleet must be on 4.6 by this date.** Verify with grep + release smoke test. |
| 2026-06-19 | +30 day telemetry review cutoff → PR-7 drafted |
| 2026-07-03 | PR-7 merged if data supports; otherwise revised ADR proposed |

Sonnet 4 retirement leaves ~4 weeks of buffer after PR-5; any slip past 2026-06-01 should trigger a "critical path" escalation.

---

## Decisions resolved 2026-04-17

1. ✅ **Release vehicle:** one npm release for all 6 commits (not per-commit).
2. ✅ **Per-agent effort overrides:** `effort: max` added to the 4 security/pentest agents in Commit 3 (same commit as plumbing).
3. ✅ **Deprecation warnings:** none; migrate all at once.
4. ✅ **PR cadence:** single PR, separate commits, merge ASAP to beat Sonnet 4 retirement.

## Outstanding — non-blocking

- **Cyber Verification reference number:** paste into ADR-093 §Validation Criteria item 5 and the CHANGELOG entry when Anthropic responds. Application has been submitted per user update 2026-04-17.

---

## Non-goals for this plan

- Routines, Monitor, Managed Agents, Agent SDK rename, `/ultrareview`, high-res vision for qe-visual-tester — all deferred to ADR-094.
- Automatic prompt caching evaluation vs ADR-088 — deferred to ADR-095.
- Any change to the 60 qe-* agent prompts themselves — out of scope; this plan only changes routing/model/effort plumbing.
- Any change to MCP tool surface — ADR-093 is pure infra.
