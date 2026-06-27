# Defect Prediction — MetaHarness (Round 2)

**Agent:** qe-defect-predictor (QCSD Development Swarm, step 8 — ALWAYS-RUN)
**Target repo:** `/workspaces/agent-harness-generator` — `ruvnet/agent-harness-generator`
**Snapshot:** HEAD `5f63ac6`, `v0.1.15-467-g5f63ac6`, branch `claude/darwin-mode-evolve-polyglot` (checked out as `main`, same commit), **2026-06-27**
**Packages under analysis (absolute paths):**
1. `/workspaces/agent-harness-generator/packages/create-agent-harness/src` (`metaharness` v0.2.7)
2. `/workspaces/agent-harness-generator/packages/darwin-mode/src` (`@metaharness/darwin` v0.7.1)
**Repo state:** 730 commits total.

---

## Methodology & Evidence

This is a **STATIC + INFERRED** prediction. No defect-history ground-truth/labels exist, so no ML classifier was trained — the ranking is the four-dimension defect signature **churn × complexity × (1 − coverage)** plus **bug-fix density** (the single strongest empirical defect predictor), calibrated against the Batch-1 reports and confirmed by targeted code reads. Findings labelled per ADR-105.

### Inputs (all EXECUTED unless noted)

| Dimension | Source | Class |
|-----------|--------|-------|
| Commit churn (per file) | `git log --pretty=format: --name-only -- <pkg>/src/**` \| `sort` \| `uniq -c` | EXECUTED |
| Line churn (added+deleted) | `git log --numstat` + awk sum per file | EXECUTED |
| Bug-fix density | `git log -i --grep='fix\|bug\|revert\|hotfix\|regress\|broke\|patch' -- <file>` count | EXECUTED |
| Complexity (genuine cyc/cog/nest) | Batch-1 `03-complexity-analysis.md` (TS-AST analyzer, hand-corrected for flat ladders) | STATIC (cross-ref) |
| Coverage (line/branch per module) | Batch-1 `04-coverage-analysis.md` (vitest v8, src∪dist max-merge) | STATIC (cross-ref) |
| Fragile-path inspection | direct reads of `upgrade.ts`, `upgrade-cmd.ts`, `applyPlan` test path | EXECUTED |

### Risk model (INFERRED)

```
risk = 0.40·churn_score + 0.30·complexity_n + 0.30·coverage_gap     [× security/confirmed-defect multiplier]
churn_score   = 0.5·norm(commits) + 0.5·norm(bugfix_count)
coverage_gap  = 0.5·(1 − line%) + 0.5·(1 − branch%)
complexity_n  = genuine_cyc_of_worst_fn / package_max  (flat-ladder artifacts discounted per Batch-1)
```
A confirmed live defect or confirmed security finding applies a ×1.25 multiplier (×1.5 for confirmed-exploitable). I deliberately use a **weighted sum, not a pure product**, so a low-churn-but-security-critical module (e.g. `secrets.ts`) is not zeroed out — the brief's `churn × complexity × (1−coverage)` intuition drives the weights, but the additive form preserves single-axis severity. Each axis flagged where it diverges.

> **Calibration caveat (STATIC):** churn is moderate repo-wide (cah max 34 commits, darwin max 22). Bug-fix density (cah max 17 on `subcommands.ts`, darwin max 10 on a barrel) is the more discriminating churn signal and is weighted equally with raw commits.

---

## Raw metric table — EXECUTED (risk-relevant rows)

### Package A — create-agent-harness

| Module | Commits | Line churn | Bug-fix | Worst-fn cyc (genuine) | Cov L% | Cov B% |
|--------|:------:|:----------:|:------:|:----------------------:|:------:|:------:|
| index.ts | **34** | **921** | 13 | **33** (`scaffold`, nest~3) | 76.42 | 76.36 |
| subcommands.ts | 23 | 410 | **17** | flat dispatch (coupling hub, 23 imports) | 83.54 | **65.30** |
| diag.ts | 10 | 468 | 5 | 17 (`buildSupportBundle`, **nest=5**) | 92–94 | 66–93 |
| completions-cmd.ts | 9 | — | 9 | low | 94–96 | — |
| score.ts | 1 | 422 | 1 | 27 (flat `scoreCmd`) | 79.36 | 67.32 |
| validate.ts | 5 | 271 | 4 | 12 (`walk`, **nest=6**) | 85.50 | 79.74 |
| repo-scorecard.ts | 3 | 278 | — | mid | 83.52 | 57.40 |
| secrets.ts | 1 | 242 | 1 | mid (token-validation) | **48.81** | **53.12** |
| with-wasm.ts | 2 | 193 | 1 | low (kernel-wasm wrapper) | **28.57** | 50 |
| publish.ts | 2 | — | 1 | low | 69.31 | **42.85** |
| external-template.ts | 2 | — | — | low | 55.55 | 40 |
| threat-model.ts | 1 | 265 | 1 | 27 (flat `threatModelCmd`) | 92–94 | 66–93 |
| upgrade.ts | 1 | — | — | 16 (merge logic) | **92.24** | 66.66 |
| witness-client.ts | 2 | — | 1 | low | 86.07 | 94.28 |

### Package B — darwin-mode

| Module | Commits | Line churn | Bug-fix | Worst-fn cyc (genuine) | Cov L% | Cov B% |
|--------|:------:|:----------:|:------:|:----------------------:|:------:|:------:|
| evolve.ts | **22** | **644** | 7 | **53** (`evolve`, **cog=124, nest=6, 311 lines**) | 68.66 | 62.96 |
| cli.ts | 16 | 262 | 6 | 25 (flat dispatch) | **0** | **0** |
| types.ts | 19 | 272 | 4 | n/a (type decls) | high | — |
| security/index.ts | 12 | — | **10** | barrel re-export | 0 (barrel) | — |
| mutator.ts | 6 | 403 | 3 | mid | covered | — |
| security/bench.ts | 4 | 354 | 4 | mid | mid | — |
| security/real-evolve.ts | 3 | 268 | — | 20 (`evolveDetectorsReal`) | **23.48** | **9.09** |
| security/real-loop.ts | 2 | — | 2 | mid | 39.47 | 60 |
| security/semgrep-oracle.ts | 2 | — | 2 | mid | 43.82 | 64.28 |
| security/swarm.ts | 2 | — | 2 | 17 (`runSwarm`, **nest=4**) | covered | — |
| security/agentic.ts | — | 264 | — | 15 (`runRepo`, **cog=35, nest=4**) | mid | — |
| security/selfwrite.ts | 1 | 403 | 1 | mid | 90–100 | — |
| security/invariant.ts | — | 338 | — | mid | 90–100 | — |
| openrouter-mutator.ts | 3 | — | — | low | **0** | **0** |
| requesty-mutator.ts | — | — | — | low | **0** | **0** |
| tier2-driver.ts | 1 | — | — | low | **0** | 100 |
| tier2-sandbox.ts | 1 | — | — | mid | covered (e2e) | — |

---

## Ranked Top-10 — Package A (create-agent-harness)

| # | Module (absolute path) | Risk | Dominant factor | Recommended test focus |
|---|------------------------|:----:|-----------------|------------------------|
| 1 | `…/create-agent-harness/src/index.ts` | **0.72** | churn (34 commits/921 lines, highest) × complexity (`scaffold` cyc=33) × below-avg cov (76% L/B) | Dispatch + `scaffold` integration: host-overlay/package.json mutation edge cases, per-host artifact emission |
| 2 | `…/create-agent-harness/src/subcommands.ts` | **0.68** | **bug-fix density (17, highest)** + **confirmed live defect** (openclaw `doctor` allowlist) + branch 65.30% | Fix + test `subcommands.ts:153-158` doctor allowlist; add per-host `validate` cases (openclaw `.openclaw/openclaw.json`, audit rvm/others) |
| 3 | `…/create-agent-harness/src/diag.ts` | **0.41** | churn (10/468/5 fixes) × `buildSupportBundle` nest=5 × branch ~66% **+ confirmed security finding** | Branch tests on the dep-harvest pyramid + the bundle redaction path (key-name vs value) |
| 4 | `…/create-agent-harness/src/upgrade.ts` | **0.40** ↓ | residual: branch 66.66% + weak accept-either apply assertions (was **0.86**) | Assert **file content after `--apply`** (clean overwrite + conflict marker bytes), `.rej` style branch, empty-`?? ''` truncation guard |
| 5 | `…/create-agent-harness/src/secrets.ts` | **0.38** | **security blast-radius** + lowest real cov (48.81% L/53.12% B); churn low (mid by pure formula) | `validateToken()` (`secrets.ts:133`) + `fetch()` (`:164`): false-valid-token, 4xx/5xx, malformed body |
| 6 | `…/create-agent-harness/src/with-wasm.ts` | **0.35** | NEW module on kernel/witness critical path, cov 28.57% L | Kernel-load success/absent paths; degraded behavior on the witness path |
| 7 | `…/create-agent-harness/src/completions-cmd.ts` | **0.28** | high bug-fix density (9 fixes/9 commits) — fiddly shell-completion generation | Shell-dialect output snapshots (bash/zsh/fish), arg-edge cases |
| 8 | `…/create-agent-harness/src/publish.ts` | **0.27** | lowest branch (42.85%), live HTTP + secret + witness gate | Mocked `fetch`: timeout, 5xx, malformed JSON, missing JWT, non-2xx must fail loud |
| 9 | `…/create-agent-harness/src/validate.ts` | **0.24** | `walk` genuine nest=6 (deepest tangle); branch 79.74% | Split + table-test the per-line scan; symlink/deep-dir recursion edge cases |
| 10 | `…/create-agent-harness/src/external-template.ts` | **0.21** | cov 55.55% L / 40% B; fetch/error path untested | Template-fetch error + not-found branches |

Just below the cut: `repo-scorecard.ts` (0.18, branch 57%), `score.ts` (0.19 — **dropped**, now has a test, 79% L), `threat-model.ts` (0.17 — **dropped**, now ~92% L).

## Ranked Top-10 — Package B (darwin-mode)

| # | Module (absolute path) | Risk | Dominant factor | Recommended test focus |
|---|------------------------|:----:|-----------------|------------------------|
| 1 | `…/darwin-mode/src/evolve.ts` | **0.74** | **the repo's worst on every axis**: churn (22/644/7) × `evolve` cyc=53/cog=124/nest=6/311-line god-fn × cov 68.66% L/62.96% B | Decompose `evolve` (Batch-1 refactor #1), then unit-test promotion / SGM statistical-gate / curriculum-escalation / crossover-epistasis in isolation |
| 2 | `…/darwin-mode/src/cli.ts` | **0.64** | churn (16 commits/6 fixes) × **0% coverage (0/171)** | End-to-end CLI flag dispatch smoke tests; every subcommand routes + exit codes |
| 3 | `…/darwin-mode/src/security/real-evolve.ts` | **0.49** | **Darwin Shield** real-evolve: cov 23.48% L / **9.09% B**, `evolveDetectorsReal` cyc=20 **+ security** | Un-skip / fixture the real detector-evolution loop; branch coverage on the discovery path |
| 4 | `…/darwin-mode/src/openrouter-mutator.ts` | **0.39** | network-gated LLM mutator, **0% coverage**, churn 3 | Mock provider: prompt-build, response-parse, error/timeout fallback |
| 5 | `…/darwin-mode/src/security/real-loop.ts` | **0.37** | cov 39.47% L; defensive loop **+ security** | Loop-termination, budget-exhaustion, finding-aggregation branches |
| 6 | `…/darwin-mode/src/security/semgrep-oracle.ts` | **0.36** | cov 43.82% L; oracle parsing **+ security** | Semgrep-output parse: empty/malformed/multi-finding, severity mapping |
| 7 | `…/darwin-mode/src/requesty-mutator.ts` | **0.36** | sibling alt-provider mutator, **0% coverage** | Same as openrouter; share a provider-mutator contract test |
| 8 | `…/darwin-mode/src/security/agentic.ts` | **0.30** | `runRepo` cog=35/nest=4 (highest cog/line in security) + 264-line churn | Nested repo-iteration tangle; per-repo failure isolation |
| 9 | `…/darwin-mode/src/tier2-driver.ts` | **0.27** | **0% line cov (0/40)**, tier2 sandbox-adjacent **+ confirmed security area** | Driver invocation + sandbox-boundary enforcement |
| 10 | `…/darwin-mode/src/security/swarm.ts` | **0.25** | `runSwarm` cyc=17/cog=30/nest=4, security, 4 commits/2 fixes | Nested agent/round loop branches; consensus/timeout paths |

Note: `security/index.ts` shows the package's **highest bug-fix count (10)** but is a **barrel re-export** — the "fixes" are export-wiring churn, not logic defects. **Excluded** from the ranking as a non-predictive artifact. Likewise `types.ts` (19 commits) is type declarations — low executable defect risk. `selfwrite.ts`/`invariant.ts` are high line-churn (403/338) but **well-covered (90–100%)** → churn alone does not make them top risks.

---

## Priority flags — high-churn × low-coverage × high-complexity

These satisfy all three legs of the defect signature simultaneously (the brief's explicit priority criterion):

1. **`darwin-mode/src/evolve.ts`** — churn 22/644/7-fixes × cyc=53/nest=6 × 68.66% L/62.96% B. **The single highest-defect-risk module in the repo.** Every axis is maxed. EXECUTED (churn) + STATIC (cyc, cov).
2. **`create-agent-harness/src/index.ts`** — churn 34/921/13-fixes × `scaffold` cyc=33 × 76% L/B (below the package's 84.86% avg). EXECUTED + STATIC.
3. **`create-agent-harness/src/subcommands.ts`** — bug-fix density 17 (repo max) × coupling hub (23 imports) × branch 65.30% **and a realized defect** (openclaw). The only module here whose risk is already **confirmed-realized**, not latent. EXECUTED + STATIC.
4. **`darwin-mode/src/cli.ts`** — churn 16/6-fixes × 0% coverage. Complexity is flat-dispatch (artifact), but churn × zero-coverage is a genuine regression-risk combination. EXECUTED + STATIC.

---

## Security cross-reference — do confirmed findings coincide with high defect risk?

The brief's confirmed security findings: **witness-client, secrets, diag, tier2-sandbox**. The answer is **PARTIAL — and the divergence is itself the finding:**

| Security finding | Defect-risk rank | Coincides? | Why |
|------------------|:---------------:|:----------:|-----|
| **diag** | cah #3 (0.41) | **YES** | High churn (10/468/5-fixes) × `buildSupportBundle` nest=5 × branch ~66%. Security severity AND defect density align. |
| **secrets** | cah #5 (0.38) | **PARTIAL** | Coincides on the **coverage axis only** (48.81% L — lowest real-code coverage). Churn is low, so a pure churn-driven model under-ranks it; security blast-radius pulls it into the top-5. |
| **witness-client** | cah unranked (~0.15) | **NO** | Well-tested (86% L / 94% B), low churn (2/1-fix). Its risk is a **design fail-open** (`{valid:true, degraded}`), not defect density. Tests passing ≠ correct semantics — this is a severity finding a defect-density model is structurally blind to. |
| **tier2-sandbox** | darwin unranked (covered) | **NO** (but adjacent does) | `tier2-sandbox.ts` is covered via e2e; the coincident gap is **`tier2-driver.ts` at 0% line coverage** (darwin #9). The sandbox boundary's *driver* is the untested edge, not the sandbox itself. |

**Conclusion:** defect-density and security-severity overlap on **diag** (fully) and **secrets** (coverage axis). They **diverge** on **witness-client** and **tier2-sandbox** — both are well-tested/low-churn, so their security risk is design/semantic, not predictable from churn×complexity×coverage. A defect predictor must therefore be read **alongside** the security agent, not as a substitute: two of four confirmed security findings sit in low-defect-density code.

---

## upgrade.ts — did the prior top risk drop? YES (0.86 → 0.40)

The prior round's #1 risk (`upgrade.ts` **0.86**, "destructive `applyPlan` write path entirely untested") is **substantially reduced**:

- **EXECUTED/STATIC:** line coverage rose **66.66% → 92.24%** (Batch-1 `04-coverage-analysis.md`). The destructive path now executes in tests.
- **EXECUTED (trace):** `applyPlan` (`upgrade.ts:127`) is now reached **indirectly** via `upgrade-cmd.ts:102` → exercised by `__tests__/upgrade-cmd.test.ts:70` (`--apply runs the apply path`). `inlineConflictMarkers`/`planUpgrade` also unit-tested in `packages/create-agent-harness/__tests__/upgrade.test.ts`.

**Residual (why 0.40, not lower):**
- **Branch coverage is still 66.66%.** The `style === 'rej'` branch (`upgrade.ts:153`, writes `target + '.rej'`) is not covered — the only apply test uses `--conflict=inline`.
- **The `--apply` test is a weak, accept-either assertion** (`__tests__/upgrade-cmd.test.ts:70-85`): `expect([0,1]).toContain(r.code)` and a regex matching `/APPLY|No drift|Modified|Clean apply|conflict/i`. It confirms the path *runs without crashing* but **never reads the file back** to assert correct bytes were written.
- The prior CONJECTURE defect mechanisms remain **unverified, not eliminated**: the empty-string fallback `newContents[path] ?? ''` (`upgrade.ts:138`) can still silently truncate a file, and fingerprint-equal-but-content-drifted (line-ending/encoding) clean overwrites are not asserted at the content level.

So: **the gap closed from "no execution at all" to "executed but weakly asserted."** Real progress; finish it by asserting post-apply file content, the `.rej` branch, and the empty-fallback guard.

---

## Evidence labels summary
- **EXECUTED:** all git-archaeology tables (commit/line churn, bug-fix density); the `applyPlan` exercise trace.
- **STATIC:** complexity (Batch-1 03) and coverage (Batch-1 04) cross-references; per-module risk drivers.
- **INFERRED:** the composite risk scores and rankings (heuristic model, no trained classifier).
- **CONJECTURE:** named defect mechanisms (e.g. `upgrade.ts` empty-fallback truncation, line-ending drift) — plausible from code shape, not reproduced.

Gate consumers: only EXECUTED/STATIC findings block (notably the **confirmed openclaw `subcommands.ts` defect** — also surfaced by the coverage agent — and the **`evolve.ts` coverage-under-gate at file level**); INFERRED rankings route to adversarial verification; CONJECTURE items are test-design hints.

---

## Status vs prior round

| Prior finding (2026-06-15) | Status | Evidence (file:line) |
|---|---|---|
| `upgrade.ts` top risk **0.86** (destructive `applyPlan` untested) | **Fixed (largely)** → ~0.40 | cov 66→92% L; `applyPlan` exercised via `upgrade-cmd.ts:102` + `__tests__/upgrade-cmd.test.ts:70`; residual branch 66.66% + weak assertions |
| `score.ts` 0.82 (no dedicated test, cyc-dense) | **Improved** | now 79.36% L / 67.32% B — has coverage; dropped below top-10 |
| `diag.ts` 0.79 | **Still-open** | 10 commits/5-fixes, `buildSupportBundle` nest=5, branch ~66% — cah #3 |
| `index.ts` 0.74 | **Still-open (now #1 in pkg A)** | 34 commits/921 lines/13-fixes, `scaffold` cyc=33, 76% L/B |
| `witness-client.ts` 0.72 (fail-open degraded path) | **Defect-risk dropped; security still-open** | 86% L/94% B, low churn → low defect density; design fail-open is a *severity* not a *density* finding |
| `threat-model.ts` 0.70 (no dedicated test) | **Improved** | now ~92% L; dropped out of top-10 |
| `publish.ts` 0.66 (network paths under-asserted) | **Still-open** | branch 42.85% (lowest in pkg) — cah #8 |
| `mcp-scan.ts` 0.62 | **Improved** | ~92–94% L; out of top-10 |
| darwin-mode defect baseline | **New** | `evolve.ts` **0.74 — new repo-wide #1**; cli.ts 0.64; Darwin-Shield `real-*` security paths thin (9–44% B) |
| `secrets.ts` security/coverage gap | **Still-open** | 48.81% L / 53.12% B — cah #5 |
| openclaw host `validate` | **New realized defect** | `subcommands.ts:153-158` allowlist ≠ `host-config.ts:100` — cah #2, defect already realized (4 failing tests) |
