# MetaHarness Round-2 — Coverage Analysis + Build/Test Reproduction (QCSD Development)

- **Subject repo:** `ruvnet/agent-harness-generator` (`/workspaces/agent-harness-generator`)
- **Snapshot:** HEAD `5f63ac6` (`v0.1.15-467-g5f63ac6`), checked out on branch `main` (same commit as the brief's `claude/darwin-mode-evolve-polyglot`), date **2026-06-27**
- **In-scope packages:** `packages/create-agent-harness` (`metaharness` **v0.2.7**) and `packages/darwin-mode` (`@metaharness/darwin` **v0.7.1**)
- **Analyst:** qe-coverage-specialist (also owns the official build+test repro this round)
- **Evidence classes:** EXECUTED (real `npm run build`, `npm test`, `vitest run --coverage`) + STATIC (per-module v8 json-summary, src/dist merge)

> Note: package versions moved since the prior round, which described `metaharness` v0.1.7. The package is now `metaharness` v0.2.7 / `@metaharness/darwin` v0.7.1.

---

## 0. Headline

| Item | Result | Evidence |
|---|---|---|
| Official `npm run build` | **FAILS (exit 1)** | EXECUTED — halts at `@metaharness/router` (`tsc` TS2307, missing `@ruvector/tiny-dancer`) |
| Official `npm test` | **FAILS (exit 1)** | EXECUTED — `pretest` runs `npm run build`, so the build failure aborts the suite before any test runs |
| Real repo-wide test count | **1855 tests** (1831 pass / 14 skip / **10 fail**), 206 files | EXECUTED — `npx vitest run` (root config, bypassing the broken `pretest`) |
| "568 passing" README badge | **STALE** — understated ~3.2x | STATIC (README.md badge) vs EXECUTED (1855) |
| `create-agent-harness` coverage | **84.86% L / 77.08% B / 87.88% F** → **SHIP** (lines ≥ 80) | EXECUTED + STATIC (src∪dist max merge) |
| `darwin-mode` coverage | **84.19% L / 83.88% B / 91.47% F** → **SHIP** | EXECUTED + STATIC (src-instrumented) |

**Per-package coverage gate: BOTH SHIP.** But two pipeline-level issues are louder than the coverage numbers: (1) the official fresh build+test is **broken**, and (2) **10 tests fail**, one cluster of which is a genuine functional regression (openclaw host can never pass `validate`).

---

## 1. Build + test reproduction (EXECUTED — P0 #2 re-check)

### 1.1 `npm run build` — FAILS

```
$ cd /workspaces/agent-harness-generator && npm run build ; echo EXIT=$?
> node scripts/build-ordered.mjs
[build-ordered] phase 1/4: kernel-js, router, harness, darwin-mode, projects
[router] FAILED
> @metaharness/router@0.3.2 build > tsc
src/native.ts(54,31): error TS2307: Cannot find module '@ruvector/tiny-dancer'
  or its corresponding type declarations.
[build-ordered] phase 1 failed: router
EXIT=1
```

`kernel-js`, `harness`, `darwin-mode`, `projects` build cleanly; **`router` fails** and `scripts/build-ordered.mjs:79` does `process.exit(1)` on any phase failure, so the ordered build stops. `create-agent-harness` (a later phase) is never reached by the official build.

**Root cause.** `@ruvector/tiny-dancer` is a **peerDependency** of `router` (`packages/router/package.json` → `peerDependencies`), consumed at runtime through a try/catch dynamic import that is *deliberately optional* (`packages/router/src/native.ts:53-69`: "Returns null (cached) when absent"). But `tsc` hard-fails with TS2307 when the module is absent — the optional-at-runtime contract is not expressed in a way the type build tolerates (no ambient `declare module '@ruvector/tiny-dancer'` shim / `// @ts-expect-error`).

**Environmental vs genuine.** The package IS pinned in `package-lock.json` (`node_modules/@ruvector/tiny-dancer`, v0.1.21, marked `"dev": true`) but is **absent from `node_modules`** in this checkout (only `@ruvector/{emergent-time,ruvllm,ruvllm-linux-arm64-gnu}` are present — consistent with the known "optional/platform `@ruvector` deps get pruned" pattern). So:
- For THIS checkout, the build failure is an **EXECUTED fact**.
- Whether CI is affected is **INFERRED**: a clean `npm ci` would restore `tiny-dancer` from the lock and the build would likely pass. I could **not** verify a clean reinstall (host-shared `node_modules`, no network reinstall performed). Either way, the underlying fragility is real — the type build depends on an "optional" peer dep being physically present, so any prune/partial-install breaks the whole monorepo build.

**Status of prior P0 #2** ("fresh-clone `npm test` failed — no pretest build"): the `"pretest": "npm run build"` hook now exists (good), but the build it triggers is itself broken here → `npm test` still cannot run end-to-end. **REGRESSED in effect** (different cause than last round).

### 1.2 `npm test` — FAILS

```
$ npm test ; echo EXIT=$?
> agent-harness-generator@0.1.0 pretest > npm run build
... [router] FAILED ... [build-ordered] phase 1 failed: router
EXIT=1
```

No package tests execute — the suite aborts in `pretest`.

### 1.3 Real test count (bypassing the broken pretest)

```
$ npx vitest run            # root vitest.config.ts: packages/*/__tests__ + __tests__
 Test Files  10 failed | 196 passed (206)
      Tests  10 failed | 1831 passed | 14 skipped (1855)
```

- **Real total = 1855 tests** (1831 passing). The README badge **`tests — 568 passing`** (README.md) is **stale by ~3.2x**. (Darwin alone — 563 tests — already exceeds the badge.) This is a fresh instance of prior **P0 #3** (counts in the status story don't match reality): the badge undercounts.
- The **same 10 failures** appear here and in the create-agent-harness-scoped run (they all live under root `__tests__/`).

### 1.4 The 10 failing tests — classified

| Failure | File:line | Class | Real? |
|---|---|---|---|
| openclaw validate not HEALTHY | `__tests__/e2e-scaffold-validate.test.ts:130` | functional | **YES — real bug** |
| openclaw lifecycle (scaffold+validate+sbom) | `__tests__/e2e-lifecycle.test.ts:135` | functional | **YES (same bug)** |
| quickstart smoke for every host (openclaw) | `__tests__/examples-quickstart.test.ts:57` | functional | **YES (same bug)** |
| diag `--bundle` for fresh scaffold | `__tests__/harness-diag.test.ts:229` | functional | **YES (same bug — fails doctor inside bundle)** |
| upgrade reports "No drift" on fresh scaffold | `__tests__/upgrade-cmd.test.ts:44` | template-drift | borderline (template vs upgrade logic) |
| path-guard green on live repo (apps/web-ui) | `__tests__/path-handling.test.ts` | repo-hygiene | no (lint over live repo) |
| ADR INDEX.md lists every ADR | `__tests__/adr-index.test.ts:23` | docs-hygiene | no |
| ADR canonical sections | `__tests__/adr-index.test.ts:43` | docs-hygiene | no |
| marketplace skill backing dir | `__tests__/claude-marketplace-plugin.test.ts:79` | hygiene | no |
| marketplace declared==codex count | `__tests__/claude-marketplace-plugin.test.ts:111` | hygiene | no |

(`__tests__/agent-harness-generator-lib.test.ts` also reports "0 test / FAIL" — a workspace-entry resolution issue, same as prior round; not a src-logic failure.)

So of 10: **~4 are one real functional regression** (openclaw), **1 borderline** (upgrade drift), **~5 are docs/repo-hygiene** (the adr-index + marketplace family the prior round already flagged — STILL OPEN).

### 1.5 Real functional regression — openclaw host can never pass `validate` (NEW)

EXECUTED: every e2e that iterates hosts fails **only** on `openclaw` with:
```
FAIL doctor — ... FAIL at least one host artifact present
     (.claude/, .codex/, AGENTS.md, or cli-config.yaml)
Result: 1 issue
```
STATIC root cause:
- The doctor allowlist accepts only four artifacts — `packages/create-agent-harness/src/subcommands.ts:153-158`:
  `.claude/settings.json` ∨ `.codex/config.toml` ∨ `AGENTS.md` ∨ `cli-config.yaml`.
- But the openclaw generator emits **`.openclaw/openclaw.json`** — `packages/create-agent-harness/src/host-config.ts:100`.
- The allowlist never learned about openclaw's artifact, so a *correctly* scaffolded openclaw harness fails `doctor`/`validate`/`diag --bundle`/quickstart.

This is a real CLI↔host-adapter contract bug (generator vs validator drift). Recommend the functional/test-pass owner fix `subcommands.ts:158` to also accept `.openclaw/openclaw.json` (and audit `rvm` / other ADR-046-era hosts for the same allowlist gap). It does not block the coverage gate, but it blocks a clean test run and ships a broken host.

---

## 2. Coverage method (and the dist→src correction is STILL required for create-agent-harness)

The shipped `vitest.config.ts` instruments only `packages/*/src/**` and excludes `dist/**`. The prior round's false-positive trap is **partially fixed but not gone**:

- `packages/create-agent-harness/__tests__/*` now import from `../src/*` (34 src refs vs 2 `file://`) — these measure correctly.
- The **43 root `__tests__/harness-*.test.ts`** still `await import(\`file://${distDir}/score.js\`)` etc. (`__tests__/harness-score.test.ts:34`). 13 modules are still exercised via `file://` dist imports (`index.js`×6, `diag.js`×4, `oia-manifest.js`×2, plus `score/genome/wizard/validate/threat-model/export-config/compare-cmd`). v8 attributes that execution to `dist/*.js` (excluded), so a naive read still understates those modules.

**Correction applied (same as prior round):** instrumented BOTH `src/**` and `dist/**`, then took **max(src%, dist%) per module**. Darwin needs no correction — its tests import `../src/*.js` (vite resolves to `.ts`), so its numbers are honest as-is.

> **Process finding (carried over, still valid):** under the shipped config, CI coverage for `create-agent-harness` is understated because of the `file://` dist imports. The fix the prior report recommended — a `dist→src` resolve alias or importing from `src` — has been done for the *package's own* tests but **not** for the root `harness-*` tests. Until those import `src`, CI coverage remains misleadingly low for ~13 modules.

Reproduction:
```bash
cd /workspaces/agent-harness-generator
# darwin (honest, src-instrumented):
npx vitest run --coverage --config <tmp: include packages/darwin-mode/__tests__, cover packages/darwin-mode/src/**>
# create-agent-harness (corrected): include packages/create-agent-harness/__tests__ + __tests__,
#   cover BOTH src/** and dist/**, then max() per module.
```
(`@vitest/coverage-v8` is now installed in the repo — it was missing last round. Temp configs were used for scoping and removed afterward; working tree left clean.)

---

## 3. `create-agent-harness` — coverage by module (corrected, ascending)

**Totals: 84.86% lines (4715/5556) · 77.08% branch (1456/1889) · 87.88% func (261/297). Gate: SHIP** (lines ≥ 80; branch 77% sits in the CONDITIONAL band and is the thing to harden).

| Module | Line% | Branch% | Func% | Note |
|---|---|---|---|---|
| bin / harness-bin | 0 / 0 | 0 | 0 | `#!/usr/bin/env node` shims — acceptable to exclude |
| **with-wasm** | **28.57** | 50 | 66.66 | **NEW module** (kernel-wasm wrapper) — lowest real gap |
| **secrets** | **48.81** | **53.12** | 63.63 | GCP Secret Manager — still the top security gap (see §5) |
| external-template | 55.55 | 40 | 100 | fetch/error path untested |
| **audit-cmd** | 66.66 | 80.30 | 100 | dependency-audit command body |
| **publish** | **69.31** | **42.85** | 100 | IPFS/Pinata publish — lowest branch in package |
| writer | 73.07 | 88.88 | 100 | |
| federate | 74.83 | 76.47 | 71.42 | |
| index | 76.42 | 76.36 | 77.77 | top-level dispatch |
| export-config | 78.68 | 66.66 | 60 | |
| score | 79.36 | 67.32 | 94.73 | |
| repo-scorecard | 83.52 | 57.40 | 88.88 | low branch |
| subcommands | 83.54 | 65.30 | 100 | contains the openclaw doctor bug (§1.5) |
| upgrade-cmd | 84.61 | 80.64 | 100 | |
| validate | 85.50 | 79.74 | 100 | |
| witness-client | 86.07 | 94.28 | 83.33 | (see security agent re: no-op) |
| wizard | 86.95 | 72.72 | 75 | |
| **upgrade** | **92.24** | 66.66 | 75 | **was 66.66% last round — applyPlan now largely covered** |
| analyze-repo / threat-model / compare-cmd / genome / diag / mcp-scan / oia-manifest | 92–94 | 66–93 | 87–93 | strong |
| sbom-cmd / publish-cmd / host-config / completions-cmd | 94–96 | 62–100 | 80–100 | |
| constraints / eject / genome-scorers / manifest / plugin-init-cmd / registry / rename / renderer / tarball | 100 | 63–100 | 83–100 | fully line-covered |

---

## 4. `darwin-mode` — coverage by module (honest, ascending)

**Totals: 84.19% lines (4486/5328) · 83.88% branch (1145/1365) · 91.47% func (311/340). Gate: SHIP** (both lines and branch ≥ 80). 62 test files, 549 pass / 14 skip / 0 fail.

| Module | Line% | Branch% | Func% | Note |
|---|---|---|---|---|
| **cli.ts** | **0** | 0 | 0 | 0/171 — entire CLI entrypoint untested (biggest single line gap) |
| **openrouter-mutator.ts** | **0** | 0 | 0 | 0/66 — LLM-provider mutator, untested |
| **requesty-mutator.ts** | **0** | 0 | 0 | 0/66 — LLM-provider mutator, untested |
| tier2-driver.ts | 0 | 100 | 100 | 0/40 — driver path uncovered |
| bench/index.ts, security/index.ts, index.ts | 0 | 0 | 0 | barrel/index re-exports |
| **security/real-evolve.ts** | 23.48 | 9.09 | 14.28 | 31/132 — Darwin Shield real-evolve path thin |
| security/real-loop.ts | 39.47 | 60 | 50 | 30/76 |
| security/semgrep-oracle.ts | 43.82 | 64.28 | 77.77 | 39/89 |
| **evolve.ts** | 68.66 | 62.96 | 83.33 | 252/367 — core evolution loop, largest partially-covered file |
| security/agents.ts | 76.76 | 100 | 80 | |
| sandbox.ts | 87.27 | 76 | 100 | |
| safety.ts | 88.97 | 84.61 | 66.66 | safety gate — branch ok, func 66% |
| (remaining ~40 modules) | 90–100 | 60–100 | — | genome, mutator, pareto, clade, curriculum, epistasis etc. well covered |

Darwin clears the gate comfortably even with several 0% modules dragging it; the suite is dense on the evolutionary core (genome/mutator/pareto/scorer) and thin on (a) the **CLI** (`cli.ts` 0/171), (b) **alternate provider mutators** (openrouter/requesty, network-gated), and (c) the **Darwin Shield "real-*" security paths** (`real-evolve` 23%, `real-loop` 39%, `semgrep-oracle` 44%) — which are heavily `.skip`-guarded (14 skipped tests live here; see `__tests__/security/*`).

---

## 5. Risk-weighted gaps (close in this order)

Risk = security/blast-radius × (1 − branch coverage).

| # | Gap | File:line | Pkg | Why |
|---|---|---|---|---|
| **1** | **openclaw `validate` is broken** (doctor allowlist ≠ generator artifact) | `subcommands.ts:153-158` vs `host-config.ts:100` | cah | Ships a host that can never pass its own health check; causes 4 test failures. EXECUTED. |
| **2** | `secrets.validateToken()` + `fetch()` untested | `secrets.ts:133`, `secrets.ts:164` | cah | GCP Secret Manager token validation/fetch; 48.8% L / 53% B. A false "valid token" is a security incident. STILL OPEN from prior round. |
| **3** | `publish` error/non-2xx branches | `publish.ts` (69.3% L / **42.85% B**) | cah | IPFS/Pinata publish; lowest branch in package. Failed/auth-rejected pins must fail loudly. STILL OPEN. |
| **4** | `with-wasm` largely untested (NEW) | `with-wasm.ts` (28.57% L) | cah | New kernel-wasm wrapper on the critical witness/kernel path. NEW. |
| **5** | darwin `cli.ts` 0/171 + provider mutators 0% | `cli.ts`, `openrouter-mutator.ts`, `requesty-mutator.ts` | darwin | CLI entry + alt-provider mutation paths have zero coverage. |
| **6** | darwin Shield `real-evolve`/`real-loop` thin | `security/real-evolve.ts:` (9% B), `security/real-loop.ts` | darwin | Defensive zero-day discovery paths; heavily skip-guarded → low real coverage. |
| 7 | `audit-cmd` / `external-template` error paths | `audit-cmd.ts`, `external-template.ts` | cah | medium. |

Accept/exclude: `bin.ts`, `harness-bin.ts` (shims); barrel `index.ts` files in darwin.

---

## 6. Status vs prior round (working-may, 2026-06-15)

| Prior finding | Now | Evidence |
|---|---|---|
| Coverage ~82.32% L / 73.33% B (cah) | **Improved → 84.86% L / 77.08% B** | §3 (corrected merge) |
| Coverage config understates CI by ~27pts (`file://` dist imports) | **Partially fixed** — package tests now import `src`; root `harness-*` tests still use `file://` dist (13 modules) | §2 |
| `@vitest/coverage-v8` missing | **Fixed** — installed in repo | §2 |
| `upgrade.applyPlan()` fully uncovered (top gap) | **Largely Fixed** — `upgrade.ts` 66.66%→**92.24%** L | §3 |
| `secrets.validateToken()`/`fetch()` uncovered | **Still open** — 48.81% L / 53.12% B | §5 #2 |
| `publish.pinJson`/error handling uncovered | **Still open** — 42.85% B | §5 #3 |
| P0 #2 fresh `npm test` (no pretest build) | **`pretest` added, but build now broken** → npm test still fails (router/tiny-dancer) | §1.1-1.2 |
| P0 #3 counts disagree; tests badge 568 | **Regressed/confirmed** — real total **1855**, badge **568** (stale ~3.2x) | §1.3 |
| 3 hygiene test failures | **Worse — 10 failures**: ~5 hygiene (adr-index, marketplace, lib-load, path-guard) STILL OPEN + 1 borderline + **4 NEW real openclaw failures** | §1.4-1.5 |
| openclaw host validate | **NEW regression** — doctor allowlist missing `.openclaw/openclaw.json` | §1.5 |

---

## 7. Verdict

- **Coverage gate per package: BOTH SHIP** — create-agent-harness 84.86% lines, darwin-mode 84.19% lines / 83.88% branch.
- **But do not read SHIP as "ready":** the official `npm run build` and `npm test` are **broken** in this checkout (router/`tiny-dancer`), **10 tests fail**, the **568 badge is stale** (real 1855), and the **openclaw host ships broken** (`validate` always fails). The coverage is healthy; the build/test integrity and one functional regression are the blocking concerns for the Development swarm.
