# MetaHarness — Coverage Analysis (QCSD Development)

- **Repo under review:** `ruvnet/agent-harness-generator` (package `metaharness` v0.1.7)
- **Source path:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src` (37 TS files, 6,751 LOC)
- **Test locations (both inspected):**
  - `/workspaces/agent-harness-generator/packages/create-agent-harness/__tests__` (22 files)
  - `/workspaces/agent-harness-generator/__tests__` (43 files)
- **Analyst:** qe-coverage-specialist
- **Date:** 2026-06-15
- **Evidence class:** EXECUTED (real `vitest run --coverage`, v8 provider) + STATIC (per-line lcov/json mapping)

---

## 1. Headline verdict

| Metric | Value | Evidence |
|---|---|---|
| **Line / statement coverage** | **82.32%** (3463 / 4207) | EXECUTED + merged dist/src |
| Branch coverage | 73.33% (1056 / 1440) | EXECUTED |
| Function coverage | 94.59% (175 / 185) | EXECUTED |
| Tests | 878 pass / 881 (3 failures are repo-hygiene, not src logic) | EXECUTED |

**GATE VERDICT: SHIP** (line coverage 82.32% ≥ 80%).

Excluding the two trivial `#!/usr/bin/env node` bin shims (16 lines, no logic) the figure is ~82.6%. Branch coverage (73.33%) sits in the CONDITIONAL band and is the area to harden next, but it does not block the gate.

---

## 2. Measurement method (and a critical correction to naive coverage)

This is **measured**, not estimated. Steps performed:

1. `cd /workspaces/agent-harness-generator && npm run build` → success (10.1s).
2. `@vitest/coverage-v8` was missing; installed with `--no-save` (no `package.json` mutation; reverted afterward).
3. First run: `npx vitest run --coverage` produced **no report** — root cause: vitest v2 default `coverage.reportOnFailure: false`, and 3 hygiene tests fail. Re-ran with `--coverage.reportOnFailure=true`.

### The false-positive trap (this is why a naive read is wrong)

The root `vitest.config.ts` only instruments `packages/*/src/**`. **Many root `__tests__/harness-*.test.ts` import the COMPILED artifact via a `file://` dynamic import**, e.g.:

```ts
const mod = await import(`file://${join(distDir, 'score.js')}`);
```

v8 attributes that execution to `dist/score.js` (which is `exclude`d), so the matching `src/score.ts` reads **0–2%** even though the module is thoroughly tested. A naive coverage read reports these as whole-module gaps. They are **NOT** gaps.

Corrected measurement:
- Re-ran with a temporary config aliasing `dist/*.js → src/*.ts` (catches static dist imports).
- For modules imported via absolute `file://` URLs (which bypass vite aliasing), instrumented `dist/**` and took the higher per-file coverage as the true value.

Modules that were false positives in the naive run (naive → true line%):

| Module | Naive | True | Test driver |
|---|---|---|---|
| `compare-cmd.ts` | 0.7% | **92.2%** | `file://` dist import |
| `score.ts` | 1.25% | **75.8%** | `file://` dist import |
| `export-config.ts` | 2.19% | **78.0%** | `file://` dist import |
| `threat-model.ts` | 2.19% | **91.2%** | `file://` dist import |
| `wizard.ts` | 0% | **83.5%** | `file://` dist import |
| `genome.ts` | 2.32% | **90.1%** | `file://` dist import |
| `oia-manifest.ts` | 8.64% | **93.0%** | `file://` dist import |
| `diag.ts` | 58.0% | **93.4%** | `file://` dist import |

> Note: the test suite's reliance on `dist/` imports is itself a **process/testability finding** — coverage tooling cannot see those paths without an alias, so CI coverage numbers under the shipped config understate reality by ~27 points. Recommend the project add a `dist→src` resolve alias (or import from `src`) so coverage reflects truth in CI.

---

## 3. Coverage by module (true, merged)

Sorted by line coverage ascending. `via` = which instrumentation surfaced the truth.

| Module | Line% | Branch% | Func% | Lines | Branches | via |
|---|---|---|---|---|---|---|
| bin.ts | 0 | 0 | 0 | 0/6 | 0/1 | src (shim) |
| harness-bin.ts | 0 | 0 | 0 | 0/10 | 0/1 | src (shim) |
| **secrets.ts** | **44.08** | **53.12** | 66.66 | 82/186 | 17/32 | src |
| **audit-cmd.ts** | **50.42** | **57.14** | 100 | 59/117 | 28/49 | src |
| external-template.ts | 55.55 | 40 | 100 | 15/27 | 4/10 | src |
| **index.ts** | **59.59** | **54.54** | 66.66 | 177/297 | 30/55 | dist |
| **publish.ts** | **65.21** | **42.85** | 100 | 45/69 | 6/14 | src |
| **upgrade.ts** | **66.66** | 100* | 75 | 62/93 | 12/12 | src |
| upgrade-cmd.ts | 68.25 | 86.36 | 100 | 43/63 | 19/22 | src |
| federate.ts | 73.42 | 76.47 | 100 | 105/143 | 26/34 | src |
| score.ts | 75.78 | 64.94 | 100 | 241/318 | 63/97 | dist |
| validate.ts | 76.96 | 70.49 | 100 | 127/165 | 43/61 | src |
| export-config.ts | 78.02 | 66.66 | 100 | 71/91 | 14/21 | dist |
| wizard.ts | 83.51 | 72.72 | 75 | 76/91 | 24/33 | dist |
| walker.ts | 83.92 | 78.57 | 100 | 47/56 | 11/14 | src |
| subcommands.ts | 85 | 60.46 | 100 | 238/280 | 52/86 | src |
| writer.ts | 89.28 | 91.66 | 100 | 25/28 | 11/12 | src |
| mcp-cmd.ts | 89.47 | 79.31 | 100 | 119/133 | 46/58 | src |
| genome.ts | 90.11 | 60.71 | 100 | 155/172 | 34/56 | dist |
| witness-client.ts | 90.16 | 94.28 | 100 | 55/61 | 33/35 | src |
| threat-model.ts | 91.2 | 87.17 | 100 | 166/182 | 68/78 | dist |
| compare-cmd.ts | 92.19 | 66.15 | 100 | 130/141 | 43/65 | dist |
| oia-manifest.ts | 92.97 | 81.7 | 100 | 172/185 | 67/82 | dist |
| diag.ts | 93.41 | 69.23 | 100 | 227/243 | 63/91 | dist |
| analyze-repo.ts | 94.4 | 68.29 | 93.75 | 236/250 | 84/123 | src |
| publish-cmd.ts | 95.12 | 78.57 | 100 | 39/41 | 11/14 | src |
| mcp-scan.ts | 95.37 | 90.47 | 100 | 103/108 | 57/63 | src |
| sbom-cmd.ts | 97.08 | 70.27 | 100 | 100/103 | 26/37 | src |
| completions-cmd.ts | 100 | 100 | 100 | 70/70 | 11/11 | src |
| eject.ts | 100 | 83.33 | 100 | 96/96 | 20/24 | src |
| genome-scorers.ts | 100 | 63.33 | 100 | 46/46 | 19/30 | src |
| manifest.ts | 100 | 100 | 100 | 46/46 | 12/12 | src |
| plugin-init-cmd.ts | 100 | 92.85 | 100 | 72/72 | 39/42 | src |
| registry.ts | 100 | 87.5 | 100 | 51/51 | 7/8 | src |
| rename.ts | 100 | 100 | 100 | 48/48 | 22/22 | src |
| renderer.ts | 100 | 100 | 100 | 37/37 | 17/17 | src |
| tarball.ts | 100 | 94.44 | 100 | 82/82 | 17/18 | src |

\* `upgrade.ts` reads 100% branch on the *covered* statements, but its largest function `applyPlan` is uncovered entirely, so the branch denominator is misleadingly small — see §4.

---

## 4. Genuine uncovered branches / paths (absolute `file:line`)

These are real gaps confirmed against per-line v8 data, not module-level false positives.

### Security / governance (weighted HIGH)

- **`/workspaces/agent-harness-generator/packages/create-agent-harness/src/secrets.ts:164-204`**
  `validateToken()` is **entirely uncovered** (and `fetch()` paths 70/73-127 largely uncovered). This is GCP Secret Manager token validation/fetch — a governance-critical surface. Branch coverage 53%.
- **`.../src/publish.ts:70-73`** — `pinJson()` non-2xx HTTP error branch (`if (!res.ok) throw …`). CONFIRMED uncovered. Network failure / auth-rejection from Pinata is never exercised.
- **`.../src/publish.ts:75-81, 127-131, 141, 149-154`** — `publishHarness()` happy path and error handling after `pinJson` are uncovered. Branch coverage 42.85% (lowest in the package).
- **`.../src/audit-cmd.ts:34-109, 121-142`** — bulk of `auditCmd()` (the dependency/security audit command) uncovered; only the early-return/usage paths are tested. 50.42% lines, 57% branch.

### Upgrade safety (weighted HIGH — filesystem mutation)

- **`.../src/upgrade.ts:127-159`** — `applyPlan()` is **fully uncovered**. Tests exercise `planUpgrade`/`formatPlan`/`inlineConflictMarkers` only. Untested sub-paths include:
  - added-file write loop (137-140)
  - clean-change write (147-148)
  - inline conflict-marker write (151-152)
  - **`--conflict=rej` `.rej` write branch (153-154)** — the residual micro-gap named in the brief, confirmed uncovered, and it is part of a wholly-untested function, not an isolated line.

### CLI dispatch / entrypoints (weighted MEDIUM-LOW)

- **`.../src/index.ts:297-478`** — large blocks of `main()` argument dispatch uncovered (the in-process `main()` path; many subcommands are exercised via their own modules instead). 59.6% lines, 54.5% branch.
- **`.../src/external-template.ts:38-52`** — external template fetch/error path uncovered (40% branch).
- **`.../src/bin.ts:1-6`** and **`.../src/harness-bin.ts:1-18`** — trivial `#!/usr/bin/env node` shims that delegate to `main()`/`dispatch()`. 0% in-process but logic lives in covered modules. **Acceptable to exclude from the gate.**

---

## 5. Risk-weighted prioritization (close in this order)

Risk weight = security/governance criticality × (1 − branch coverage) × blast radius.

| # | Gap | File:line | Why it weighs most |
|---|---|---|---|
| **1** | `upgrade.applyPlan()` fully untested incl. `--conflict=rej` | `upgrade.ts:127-159` | Mutates the user's filesystem; a regression silently corrupts/overwrites local files or drops conflicts. Zero coverage on a write path is the highest-blast-radius gap. |
| **2** | `secrets.validateToken()` + `fetch()` untested | `secrets.ts:164-204`, `133-160` | Governance/secret-handling. A false "valid token" or leaked error path is a security incident. 53% branch. |
| **3** | `publish.pinJson` non-2xx + `publishHarness` error handling | `publish.ts:70-73, 75-81, 127-154` | Publish/IPFS path; lowest branch coverage in package (42.85%). Failed/auth-rejected pins must fail loudly, not silently. |
| **4** | `auditCmd()` body untested | `audit-cmd.ts:34-142` | Security audit command itself is ~50% covered — a broken audit gives false assurance. |
| **5** | `index.main()` dispatch branches | `index.ts:297-478` | Top-level routing; medium risk, partly mitigated by per-subcommand module tests. |

Lower priority / accept: `bin.ts`, `harness-bin.ts` (shims), `external-template.ts` error path.

---

## 6. Process findings (testability, for the Development swarm)

1. **Coverage config understates truth by ~27 pts in CI.** Tests import `dist/*.js` via `file://`; the shipped `vitest.config.ts` instruments only `src/**`. Add a `resolve.alias` mapping `dist→src` (or have tests import `src`) so CI coverage is honest. Without this, anyone reading CI coverage would wrongly conclude HOLD.
2. **`coverage.reportOnFailure` is false** while 3 hygiene tests fail — coverage silently produces no report at all in CI. Set `reportOnFailure: true` or fix the 3 hygiene tests (ADR-038 unindexed; marketplace skill-count drift). These 3 failures are **not** source-logic failures.
3. **Write-path functions are the systematic blind spot** (`applyPlan`, publish error handling) — the suite is strong on pure/format functions and weak on side-effecting I/O paths.

---

## 7. Reproduction (EXECUTED)

```bash
cd /workspaces/agent-harness-generator
npm run build
npm install -D @vitest/coverage-v8@^2.0.0 --no-save   # provider was missing
npx vitest run --coverage --coverage.reportOnFailure=true \
  --coverage.reporter=json-summary --coverage.reporter=text
# For true numbers on file://-imported modules: alias dist->src and/or
# instrument dist/** and take max per-file (see §2).
```

Result: 878/881 tests pass; 3 failures are repo-hygiene (`adr-index`, `claude-marketplace-plugin`) and one suite (`agent-harness-generator-lib.test.ts`) fails to resolve a workspace entry — none touch `create-agent-harness/src` logic.
