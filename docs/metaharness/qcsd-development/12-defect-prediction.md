# Defect Prediction — MetaHarness (`create-agent-harness`)

**Agent:** qe-defect-predictor (QCSD Development Swarm, step 8)
**Target repo:** `/workspaces/agent-harness-generator` — `ruvnet/agent-harness-generator`, v0.1.7
**Source under analysis:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src`
**Date:** 2026-06-15
**Repo state:** 206 commits, 37 source modules, 23 test files (`__tests__/`)

---

## Methodology & Evidence

This is a **STATIC + INFERRED** prediction. No defect-history ground truth exists for this repo, so no ML model was trained — predictions are heuristic, calibrated against the four-dimension defect signature (churn × complexity × coupling × test-thinness) plus targeted code inspection of the named fragile areas. Findings are labeled per ADR-105.

### Metrics collected (all EXECUTED)

| Dimension | Command | Evidence class |
|-----------|---------|----------------|
| Churn | `git log --pretty=format: --name-only -- 'src/*.ts' \| sort \| uniq -c \| sort -rn` | EXECUTED |
| Complexity | `wc -l` + branch-point grep (`if/else/for/while/case/catch/&&/\|\|/??/?./=>`) per file | EXECUTED |
| Coupling (fan-in) | `grep -lE "from ['\"]\./<mod>(\.js)?['\"]"` across `src/*.ts` | EXECUTED |
| Test mapping | dedicated `__tests__/<mod>.test.ts` presence + import refs | EXECUTED |
| Assertion density | `it/test(` count vs `expect/.toBe/.toEqual/.toThrow` count per test file | EXECUTED |
| Fragile-area inspection | direct `sed`/`grep` reads of `upgrade.ts`, `witness-client.ts`, `publish.ts`, `mcp-scan.ts` | EXECUTED |

### Risk score model (INFERRED)

```
risk = 0.30*complexity_n + 0.25*churn_n + 0.15*coupling_n + 0.30*test_gap_n
```
Each factor normalized 0–1 against the observed max. `test_gap` = 1.0 when no dedicated test AND the destructive/core path is unexercised; scaled down as assertion coverage improves. Weights front-load complexity and test-thinness because, with churn this low across the repo (max 25 commits/file), the historical-churn signal is weak and the structural signals dominate.

> Caveat (STATIC): churn is shallow. The single most-changed file (`index.ts`, 25 commits) is the CLI router; high churn there is expected and not inherently defect-predictive. Treat churn as a tie-breaker, not a primary driver, for this codebase.

---

## Raw metric table (EXECUTED)

| Module | Lines | Branch pts | await | try/catch | Churn | Fan-in | Dedicated test | Assert density |
|--------|------:|-----------:|------:|----------:|------:|-------:|:--------------:|:--------------:|
| subcommands.ts | 390 | 67 | 11 | 14 | 23 | 2 | yes | 19/10 cases |
| score.ts | 422 | 66 | 0 | 10 | 1 | 1 | **NO** | — |
| index.ts | 484 | 62 | 16 | 7 | 25 | 3 | NO (imported x5) | indirect |
| analyze-repo.ts | 399 | 56 | 1 | 8 | 3 | 3 | yes | 20/6 cases |
| diag.ts | 404 | 54 | 4 | 15 | 10 | 2 | **NO** | — |
| validate.ts | 257 | 46 | 16 | 6 | 5 | 1 | yes | 28/10 cases |
| threat-model.ts | 265 | 45 | 0 | 4 | 1 | 1 | **NO** | — |
| secrets.ts | 242 | 44 | 9 | 5 | 1 | 2 | yes | 19/8 cases |
| mcp-scan.ts | 164 | 38 | 0 | 2 | 1 | 2 | yes | 18/6 cases |
| compare-cmd.ts | 220 | 37 | 4 | 2 | 1 | 0 | **NO** | — |
| oia-manifest.ts | 285 | 29 | 0 | 8 | 1 | 1 | **NO** | — |
| genome.ts | 266 | 28 | 0 | 2 | 3 | 0 | **NO** | — |
| upgrade.ts | 159 | 16 | 7 | 0 | 1 | 1 | yes (partial) | 15/5 cases |
| witness-client.ts | 123 | 17 | 4 | 4 | 2 | 2 | yes | 18/11 cases |
| publish.ts | 154 | 7 | 6 | 0 | 2 | 1 | yes | 7/3 cases |
| renderer.ts | 81 | 14 | 0 | 0 | 1 | **5** | yes | 18/10 cases |
| walker.ts | 96 | 12 | 5 | 0 | 1 | 3 | **NO** | — |
| writer.ts | 57 | 6 | 7 | 3 | 1 | 1 | **NO** | — |

(Full 37-module data captured during the run; only the risk-relevant rows shown.)

---

## Ranked Top-8 Defect-Prone Modules

| # | Module (absolute path) | Risk | Primary driver | Secondary |
|---|------------------------|:----:|----------------|-----------|
| 1 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/upgrade.ts` | **0.86** | weak-tests (destructive `applyPlan` path untested) | complexity of merge logic |
| 2 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/score.ts` | **0.82** | complexity (422 LOC, 66 branch pts) | weak-tests (no dedicated test) |
| 3 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/diag.ts` | **0.79** | complexity (54 branch pts, 15 try/catch) | weak-tests (no dedicated test) + churn (10) |
| 4 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/index.ts` | **0.74** | churn (25, highest) + coupling (fan-in 3, central router) | complexity (484 LOC) |
| 5 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/witness-client.ts` | **0.72** | weak-tests on degraded/silent-pass path | coupling (fan-in 2, gates publish) |
| 6 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/threat-model.ts` | **0.70** | complexity (45 branch pts) | weak-tests (no dedicated test) |
| 7 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/publish.ts` | **0.66** | weak-tests (network paths under-asserted, 7 asserts/3 cases) | error-handling (no try/catch around `fetch`) |
| 8 | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/mcp-scan.ts` | **0.62** | complexity of severity rules (38 branch pts) | coupling (fan-in 2, security-gating) |

Honorable mentions just below the cut: `subcommands.ts` (0.61 — high complexity but well-tested, 19 asserts), `analyze-repo.ts` (0.58 — large but tested), `renderer.ts` (0.55 — highest fan-in at 5, but small and tested; a defect here radiates widest).

---

## Per-module rationale

### 1. upgrade.ts — 0.86 (CRITICAL) — driver: weak-tests
**EXECUTED finding:** The "3-way merge" is **not a line-level 3-way merge**. `planUpgrade` does SHA-256 fingerprint comparison (`manifest.ts` `diffFingerprints`) to classify files as `clean | conflict`; `inlineConflictMarkers` dumps the **entire** local and entire upstream file inside Git markers (no hunk-level merge). On conflict it overwrites the user's file with a marker blob.
**The destructive write path `applyPlan` is never called by `upgrade.test.ts`.** Tests cover `planUpgrade`, `formatPlan`, `inlineConflictMarkers` only — i.e., the pure functions, not the function that writes to the user's disk (lines 124–159). This is the textbook defect signature: real side-effects, zero coverage. Likely defects: data loss on `clean` overwrite when fingerprint matches but content drifted via line endings/encoding; `.rej` style untested; `existsSync`-then-read race; empty-string fallback (`?? ''`) silently truncating files.

### 2. score.ts — 0.82 (HIGH) — driver: complexity
**STATIC:** 422 LOC, 66 branch points, 10 try/catch — the densest scoring/decision logic in the package — and **no dedicated test file** (`__tests__/score.test.ts` absent; 0 test imports). Branchy scoring code with no unit tests is high-yield for off-by-one and threshold-boundary defects.

### 3. diag.ts — 0.79 (HIGH) — driver: complexity + churn
**STATIC:** 404 LOC, 54 branch points, **15 try/catch** (most in the package — heavy error-swallowing surface), churn 10 (3rd highest), and **no dedicated test**. High try/catch density without tests means failure-mode behavior is unverified; diagnostics that silently swallow errors are a classic source of "works on my machine" defects.

### 4. index.ts — 0.74 (HIGH) — driver: churn + coupling
**STATIC:** Highest churn (25 commits), 484 LOC (largest file), 62 branch points, fan-in 3, the central CLI dispatch router (imports nearly every command module). No dedicated `index.test.ts` but exercised indirectly by 5 test files. Risk is concentrated in argument routing / dispatch edge cases; a regression here breaks every subcommand. Churn here is partly expected (router grows with features) — the concern is the combination of size + dispatch centrality.

### 5. witness-client.ts — 0.72 (HIGH) — driver: weak-tests on degraded path
**EXECUTED finding:** `verifyWitness` has a `catch {}` (line 80) that, when the kernel isn't loaded, returns `{ valid: true, reason: 'shape verified; kernel not loaded (degraded)' }` — i.e., **it returns VALID on crypto-verification failure to load**. This is a fail-open security path. The publish gate (`publish.ts` line ~129) trusts this result. While there are 11 test cases, the risk is that the degraded path's *semantics* (silently passing without Ed25519 verification) are easy to regress into production code paths, not just local dev.

### 6. threat-model.ts — 0.70 (HIGH) — driver: complexity
**STATIC:** 265 LOC, 45 branch points, **no dedicated test** (only 1 incidental import ref). Security-relevant rule evaluation with no unit coverage — wrong-classification defects here are both likely (branchy) and high-impact (security output).

### 7. publish.ts — 0.66 (MEDIUM-HIGH) — driver: weak-tests on network paths
**EXECUTED finding:** `fetch` to Pinata (line 61) with **no try/catch and no retry/timeout** — only a status-code check that throws. Network failures (DNS, socket reset, partial body) surface as raw rejections. The test file has only 3 cases / 7 assertions — thin for a module that does live HTTP, secret handling (`PINATA_API_JWT`), and gates on witness verification. Untested failure modes: HTTP 5xx retry behavior, timeout, malformed JSON response, missing-JWT branch.

### 8. mcp-scan.ts — 0.62 (MEDIUM) — driver: severity-rule complexity
**EXECUTED finding:** 38 branch points encoding the security severity rules (`high/medium/low/info`) with a hand-rolled `SEV_ORDER` ranking. Has a dedicated test (6 cases / 18 asserts) but the **severity-ranking + highest-severity aggregation logic** is exactly where boundary defects hide (e.g., a new rule added at the wrong severity, or `info` clean-state masking a real finding). Fan-in 2 and security-gating role raise the blast radius.

---

## Top 3 Highest-Risk Code Paths

1. **`upgrade.ts::applyPlan` → conflict/clean write loop (lines 124–159).**
   The only path in the package that **overwrites user files**, classifies via coarse SHA fingerprints, and is **entirely untested**. A misclassification or empty-string fallback here = silent user data loss. Highest severity × highest test gap. **This is the single riskiest path.**

2. **`witness-client.ts::verifyWitness` catch → `{ valid: true, degraded }` (lines 80–86), consumed by `publish.ts::publish` gate (line ~129).**
   A **fail-open** security path: failure to load the crypto kernel yields a *valid* verdict. If this branch is ever reached in CI/production rather than local dev, unsigned/tampered manifests publish successfully. Cross-module path: witness-client → publish.

3. **`publish.ts::pinFile` `fetch` (lines 50–72) network path.**
   Live HTTP with no timeout, no retry, no try/catch, secret-dependent, gated on (2). Thinly asserted (3 cases). Transient network conditions produce unhandled rejections mid-publish, potentially after partial side effects.

---

## Recommended Testing Focus

**Priority 1 — Close the destructive-path gap (upgrade.ts).**
Add `applyPlan` integration tests against a real temp dir: clean overwrite, conflict-marker write, `.rej` style, empty-`newContents` truncation guard, line-ending/encoding drift that fingerprints-equal but content-differs, and a round-trip "marker file is re-detected as conflict" case. This is the highest ROI test work in the package.

**Priority 2 — Pin the fail-open security semantics (witness-client.ts + publish.ts).**
Add an explicit test asserting that the *degraded* branch is reachable ONLY when intended, and an integration test that `publish` **rejects** when verification is not genuinely performed in a non-dev context. Make the fail-open a conscious, asserted decision — not an accident waiting to regress.

**Priority 3 — Unit-test the untested branchy modules.**
Create dedicated tests for `score.ts`, `diag.ts`, and `threat-model.ts` (currently 0 dedicated tests, 45–66 branch points each). Target branch coverage on scoring thresholds, diagnostic error-swallow paths, and threat-rule classification. These are pure-logic modules — cheap to test, high defect yield.

**Priority 4 — Harden network paths (publish.ts).**
Add tests with a mocked `fetch` for: timeout, HTTP 5xx, malformed JSON, missing `PINATA_API_JWT`. Recommend (to dev team) wrapping `fetch` in try/catch with a timeout and bounded retry before adding the tests.

**Priority 5 — Severity-rule boundary tests (mcp-scan.ts).**
Add a table-driven test over the `SEV_ORDER` aggregation: each rule fires at its declared severity, and `highest` is computed correctly when multiple fire, including the `info`/clean masking case.

**Do NOT over-invest in:** `index.ts`/`subcommands.ts` beyond dispatch regression tests — they are large and churny but `subcommands.ts` is already well-asserted (19 asserts/10 cases) and `index.ts` is covered indirectly by 5 suites. `renderer.ts` (fan-in 5) is small and tested; keep its tests green as a radiating-blast safeguard but it is not a top defect source.

---

## Evidence labels summary
- **EXECUTED:** all metric tables, fragile-area code inspections (upgrade/witness/publish/mcp-scan).
- **STATIC:** per-module risk drivers derived from the metric data.
- **INFERRED:** the composite risk scores and rankings (heuristic model, no trained classifier).
- **CONJECTURE:** specific defect mechanisms named per module (e.g., "line-ending drift truncation") — plausible from code shape, not yet reproduced.

Quality-gate consumers: only the EXECUTED/STATIC findings should block; the INFERRED rankings route to adversarial verification; CONJECTURE items are test-design hints, not gate criteria.
