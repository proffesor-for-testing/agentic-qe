# Dependency & Build Health Report - v3.9.13

**Date**: 2026-04-20
**Agent**: qe-dependency-mapper (06)
**Baseline**: v3.8.13 (2026-03-30)

---

## Executive Summary

v3.9.13 is a **mixed bag, trending negative**. P1 remediation from v3.8.13 is **partially done**: the two flagged production-source faker imports (`swift-testing-generator.ts`, `base-test-generator.ts`) are gone, replaced by a lightweight `test-value-helpers.ts`. But a **different** production file (`services/test-data-generator.ts`) still statically imports `@faker-js/faker`, so the leak is not closed — just relocated. `@claude-flow/guidance@3.0.0-alpha.1` remains pinned in production dependencies, and minification remains enabled.

Two new regressions dominate this cycle:

1. **15 CRITICAL production vulnerabilities** (was 0) — all propagated through the `@claude-flow/guidance` + `@claude-flow/browser` subtree via `@xenova/transformers` → `onnxruntime-web` → `onnx-proto` → `protobufjs <7.5.5` (GHSA-xq3m-2v4x-88gg, arbitrary code execution).
2. **Package size ballooned**: tarball 11.1 MB → **19.9 MB (+79%)**, unpacked 54 MB → **88.5 MB (+64%)**, total files 3,759 → **4,711 (+25%)**. CLI build switched to code-splitting (799 chunks in `dist/cli/chunks`, only 240 fresh — 559 stale chunks from prior builds ship in the tarball).
3. Circular deps regressed: **12** (up from 9). Two prior cycles were refactored away, but five new ones appeared.

**Overall Grade: C** (down from B+).

Path back to B+: prune stale chunks on build, `npm audit fix` (or drop `@claude-flow/browser`), move `@faker-js/faker` out of `test-data-generator.ts` or back to prod deps, relocate `@claude-flow/guidance` to `optionalDependencies`.

---

## 1. Package & Bundle Size

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|---------|---------|-------|
| Packed tarball | 11.1 MB | **19.9 MB** | **+79%** |
| Unpacked | 54.0 MB | **88.5 MB** | **+64%** |
| Published files | 3,759 | **4,711** | **+25%** |
| CLI bundle.js (entry) | 7.0 MB | **12 KB** | Refactored to code-split |
| CLI chunks dir (all) | N/A | **42 MB (799 files)** | **New: code-splitting** |
| CLI chunks (fresh only) | N/A | 7.4 MB (240 files) | Actual build output |
| MCP bundle.js | 6.8 MB | 6.9 MB | +1.5% |
| dist/cli total | 9.7 MB | 44 MB | +350% (stale chunks) |
| dist/mcp total | 11 MB | 11 MB | unchanged |

**Root cause of package bloat**: `scripts/build-cli.mjs` enabled `splitting: true` and `chunkNames: 'chunks/[name]-[hash]'`, but there is **no pre-build clean** of the chunks directory. Every build appends new hashed chunks; old ones remain. The published tarball carries 559 stale chunks (~31 MB) that no runtime code references. This is recoverable by adding `rm -rf dist/cli/chunks` to the build script or a clean step.

Minification is confirmed active (bundle prolog shows minified identifiers `Qte`, `wg`, `Jte`, etc.).

---

## 2. Production Dependencies (25 total, unchanged count)

Dependency list is structurally identical to v3.8.13 — only internal version bumps landed:

| Package | v3.8.13 | v3.9.13 | Notes |
|---------|---------|---------|-------|
| @claude-flow/guidance | 3.0.0-alpha.1 | 3.0.0-alpha.1 | **Still alpha-pinned in prod** |
| @ruvector/gnn | 0.1.19 | **0.1.25** | Patch-aligned with native binaries |
| @ruvector/attention | 0.1.3 | 0.1.3 | Unchanged (still 28 patches behind latest 0.1.31) |
| All others | unchanged | unchanged | |

Dev deps (18 total) also unchanged.

### Dependabot trail (v3.8.13 → v3.9.13)

12 `chore(deps)` commits, 6 merged PRs: #405 (vite), #414 (group x2), #422 (axios), #425 (follow-redirects), #426 (hono), #428 (protobufjs). Protobufjs bump is in the lockfile but the vulnerable copy under `@xenova/transformers` → `onnx-proto` → `protobufjs` is **not resolved** — still pulled at `<7.5.5` transitively (see §4).

---

## 3. P1 Remediation Verification (from v3.8.13)

| Item | v3.8.13 status | v3.9.13 status | Evidence |
|------|----------------|----------------|----------|
| `@faker-js/faker` as devDep only | Correct | **Correct** (package.json:186) | devDep |
| `swift-testing-generator.ts` imports faker | YES | **FIXED** (file does not reference faker) | grep clean |
| `base-test-generator.ts` imports faker | YES | **FIXED** (file does not reference faker) | grep clean |
| No faker in prod src anywhere | NO | **NO — still leaks** | `services/test-data-generator.ts:8` statically imports `@faker-js/faker` (and `test-generator.ts` imports `test-data-generator`). `test-value-helpers.ts` is clean (header comment only). |
| `@claude-flow/guidance` removed from prod | NO | **NO — still in prod deps at alpha** | package.json:131 |
| Bundle minification enabled | YES | **YES** (cli:187, mcp:167) | confirmed in output |

**Net P1 outcome**: 2 of 3 faker-import sites fixed; 1 new site remains. Guidance still alpha-pinned. Minification preserved. Credit for partial remediation, but the leak is not closed.

---

## 4. npm audit — **CRITICAL regression**

| Severity | v3.8.13 | v3.9.13 | Scope |
|----------|---------|---------|-------|
| Critical | 0 | **15** | production |
| High | 6 | 6 | dev (unchanged) |
| Moderate | 1 | 1 | dev |
| **Prod-only total** | **0** | **15 critical** | `npm audit --omit=dev` |
| **Full total** | 7 | 22 | all |

### Root cause

All 15 critical vulnerabilities stem from a single chain:

```
protobufjs <7.5.5  (GHSA-xq3m-2v4x-88gg, RCE)
  └─ onnx-proto (transitive)
      └─ onnxruntime-web (transitive)
          └─ @xenova/transformers >=2.0.2      [DIRECT PROD DEP]
              ├─ agentdb >=1.1.3
              │   ├─ @claude-flow/aidefence
              │   ├─ @claude-flow/memory
              │   │   ├─ @claude-flow/guidance  [DIRECT PROD DEP]
              │   │   ├─ @claude-flow/hooks
              │   │   ├─ @claude-flow/neural
              │   │   └─ @claude-flow/plugin-gastown-bridge
              │   └─ agentic-flow
              │       └─ @claude-flow/browser   [OPTIONAL PROD DEP]
              └─ @claude-flow/embeddings
                  └─ @claude-flow/cli
```

`npm audit fix` is offered but would pin `@xenova/transformers@2.0.1` as a breaking change. The `overrides` block in `package.json:179` already uses this pattern for `tar` and `markdown-it`; a targeted override `"protobufjs": ">=7.5.5"` would neutralize this chain without breaking the transformers API.

---

## 5. Circular Dependencies — slight regression

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|---------|---------|-------|
| Files processed (madge) | 875 | 1,263 | +388 |
| Circular cycles | 9 | **12** | **+3** |

### All 12 cycles

| # | Cycle | Severity | Module | vs v3.8.13 |
|---|-------|----------|--------|-----------|
| 1 | a2a/notifications/subscription-store → webhook-service | Medium | adapters/a2a | **NEW** |
| 2 | learning/pattern-store → ruvector/filter-adapter | Medium | learning | unchanged |
| 3 | learning/pattern-store → learning/rvf-pattern-store | Medium | learning | **NEW** |
| 4 | claim-verifier-service → file-verifier → index | Medium | agents | unchanged |
| 5 | file-verifier → index | Medium | agents | unchanged |
| 6 | index → output-verifier | Medium | agents | unchanged |
| 7 | queen-coordinator → mincut/queen-integration | High | coordination | unchanged |
| 8 | consensus/interfaces → sycophancy-scorer | Low | consensus | unchanged |
| 9 | ruvector/cognitive-container → codec | Low | integrations | unchanged |
| 10 | mcp/core-handlers → domain-handlers → configs → factory | High | mcp/handlers | unchanged |
| 11 | mcp/core-handlers → task-handlers | Medium | mcp/handlers | unchanged |
| 12 | ruvector/coherence-gate-core → coherence-gate-energy | Low | integrations | **NEW** |

3 new cycles outpace the 0 cycles broken. Two high-risk cycles (queen-coordinator, MCP handler chain) persist unaddressed from v3.8.3 through v3.9.13.

---

## 6. Version Sync

Hardcoded `"3.0.0"` version strings in `src/**`: **15 occurrences** across 15 files. None match the package version (3.9.13). None match the prior version (3.8.13) either — all are `3.0.0`. Example sites:

| File | Line | Literal |
|------|------|---------|
| `adapters/a2ui/catalog/index.ts` | 273 | `QE_CATALOG_VERSION = '3.0.0'` |
| `adapters/a2a/agent-cards/generator.ts` | 63 | `defaultVersion: '3.0.0'` |
| `adapters/a2a/discovery/discovery-service.ts` | 58 | `platformVersion: '3.0.0'` |
| `coordination/workflow-builtin.ts` | 414 | `version: '3.0.0'` |
| `coordination/result-saver.ts` | 507 | `version: '3.0.0'` |
| `mcp/tools/planning/*.ts` | 8-10 | `@version 3.0.0` (JSDoc) |
| `planning/*.ts` | 7-17 | `@version 3.0.0` (JSDoc) |
| `init/types.ts` | 451 | `__CLI_VERSION__ ?? '3.0.0'` (fallback) |
| `init/settings-merge.ts` | 116 | `version: config.version ?? '3.0.0'` |
| `cli/commands/learning.ts` | 266 | `version: '3.0.0'` |
| `domains/code-intelligence/.../c4-model/index.ts` | 50 | `GENERATOR_VERSION = '3.0.0'` |

These are not breaking (most are semantic schema versions or JSDoc tags), but CLAUDE.md mandates "grep the entire codebase for hardcoded version numbers" on each release. The protocol is being violated. Only `src/cli/commands/mcp.ts:88` and `src/kernel/*` correctly reference the current minor-series.

`dist/cli/bundle.js` does correctly inject `"3.9.13"` via the esbuild `define` block — so the user-facing `--version` output is right; the concern is consistency of the semantic version literals in the sources.

---

## 7. Build Health

| Setting | v3.8.13 | v3.9.13 | Note |
|---------|---------|---------|------|
| TypeScript target | ES2022 | ES2022 | unchanged |
| esbuild minify | true | true | unchanged |
| esbuild splitting | false | **true** | NEW for CLI |
| Pre-build clean of dist/cli/chunks | N/A | **missing** | **bug** |
| Lazy typescript plugin | yes | yes | unchanged |
| Tree shaking | default | default | unchanged |

Build pipeline is functional. Artifacts are fresh (`Apr 20 09:26`). Build script is otherwise well-structured.

---

## 8. Remediation Plan

| # | Item | Severity | Effort | Owner |
|---|------|----------|--------|-------|
| 1 | Add `"protobufjs": ">=7.5.5"` to `overrides` in package.json | **P0 (critical vulns)** | 5 min | release eng |
| 2 | Prune stale CLI chunks: prepend `rimraf dist/cli/chunks` to `build:cli` or pass `--clean` to esbuild equivalent | **P0 (25% tarball bloat)** | 15 min | build eng |
| 3 | Remove static `@faker-js/faker` import from `services/test-data-generator.ts` (mirror the approach already taken in test-value-helpers.ts), or move `@faker-js/faker` back to `dependencies` | **P0 (faker leak persists)** | 30 min – 2 h | test-gen domain |
| 4 | Move `@claude-flow/guidance` from `dependencies` to `optionalDependencies` (usage is dynamic-import-guarded) | P1 | 10 min | governance domain |
| 5 | Run `npm audit fix` for the 7 dev-chain vulns (`minimatch` via `@typescript-eslint/*` v6 → v8) | P1 | 20 min | build eng |
| 6 | Break `queen-coordinator ↔ mincut/queen-integration` cycle (extract shared interface) | P1 | 2–4 h | coordination domain |
| 7 | Break `mcp/handlers` 4-file cycle (extract handler-types.ts) | P1 | 2–4 h | mcp domain |
| 8 | Fix the 3 new cycles (a2a, learning/pattern-store, ruvector/coherence-gate) | P2 | 1–2 h each | respective domains |
| 9 | Unify hardcoded `"3.0.0"` version literals: either read from `package.json` at runtime or align JSDoc/schema versions with the release | P2 | 1–2 h | release eng |
| 10 | Upgrade `@ruvector/attention` 0.1.3 → 0.1.31 (28 patches behind) | P2 | 15 min + test | platform |
| 11 | Add `sideEffects: false` to package.json for consumer tree-shaking | P3 | 5 min | build eng |
| 12 | Enforce `--dry-run` size budget in CI (hard-fail above e.g. 15 MB tarball) | P3 | 1 h | CI |

---

## 9. Grading

| Category | v3.8.13 | v3.9.13 | Weight | Weighted |
|----------|---------|---------|--------|----------|
| Bundle optimization | A- | **C+** (stale-chunk bloat, +79% tarball) | 25% | 0.138 |
| Dependency hygiene | B | **C** (faker leak relocated, guidance unmoved) | 25% | 0.125 |
| Circular dependencies | B+ | **B-** (12, up from 9) | 15% | 0.105 |
| Security (npm audit) | B+ | **D** (15 critical in prod, was 0) | 15% | 0.060 |
| Build system | A | A- (split-build is sound; cleanup missing) | 10% | 0.090 |
| Freshness | B- | **B** (dependabot active, 12 bumps) | 10% | 0.080 |

**Weighted Total: 0.598 / 1.0**

### Overall Grade: C

**Rationale**: The 15 critical runtime vulnerabilities (all from `@claude-flow/guidance` + `@claude-flow/browser` subtree) and the 79% tarball growth are catastrophic in dependency-health terms. Minification survived, 2 of 3 faker sites were cleaned, and dependabot is moving, but none of that offsets shipping an RCE-exploitable `protobufjs` to every user. A **single 5-minute override fix** plus **one rimraf in build-cli.mjs** would restore this to B or higher.

**Trend**: v3.8.3 (B) → v3.8.13 (B+) → v3.9.13 (C). The minification and typescript fixes from v3.8.13 stuck; the dependency tree regressed underneath.

---

## Appendix: Evidence Commands

```bash
# Reproduce all findings
npx madge --circular src/ --extensions ts      # 12 cycles
npm audit --omit=dev                           # 15 critical prod
ls -lh dist/cli/bundle.js dist/mcp/bundle.js   # 12 KB / 6.9 MB
du -sh dist/cli/chunks                         # 42 MB (799 files)
find dist/cli/chunks -name "*.js" -newermt "2026-04-20 09:00" | wc -l  # 240 fresh
npm pack --dry-run                             # 19.9 MB packed
grep -rn "@faker-js/faker" src/                # test-data-generator.ts:8
grep -rn "\"3\.0\.0\"" src/                    # 15 stale literals
```
