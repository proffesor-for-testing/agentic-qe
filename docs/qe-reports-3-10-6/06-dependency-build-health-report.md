# Dependency & Build Health Report - v3.10.6

**Date**: 2026-06-12
**Agent**: qe-dependency-mapper (06)
**Analyzed version**: v3.10.6 (`package.json` source of truth)
**Baseline for deltas**: v3.9.13 (`docs/qe-reports-3-9-13/06-dependency-build-health-report.md`)

---

## Executive Summary

**v3.10.6 is a decisive recovery cycle.** Every P0 from v3.9.13 is **FIXED**, and the fixes are genuine (validated, not override-masked):

1. **Tarball bloat fixed.** `rimraf` of the chunks dir was added to `build-cli.mjs` (lines 25-29). Packed tarball is back to **10.4 MB** (from 19.9 MB, **-48%**), even below the v3.8.13 baseline of 11.1 MB. The stale-chunk leak is closed.
2. **15 CRITICAL runtime vulns → 0.** Two independent fixes landed: (a) the `protobufjs` chain was force-overridden to `^7.5.6` (resolves to 7.5.8 in the installed tree), and (b) the root cause was excised — `@xenova/transformers` was migrated to `@huggingface/transformers@^4.2.0` and `@claude-flow/guidance`/`@claude-flow/browser` were demoted from `dependencies` to **optional `peerDependencies`**. The RCE chain is no longer a forced prod dependency. **Validated against override-masking** (see §4).
3. **Faker leak closed.** `services/test-data-generator.ts` no longer statically imports faker — it uses `import type` (erased) + a lazy `await import('@faker-js/faker')` (test-data-generator.ts:11,16-19). faker's ~3 MB locale data is **not** inlined into `dist/mcp/bundle.js` (verified).
4. **Hardcoded `"3.0.0"` literals: 15 → 0.** grep `src/` is clean.

The only items that did **not** improve: circular deps remain at **12** (UNCHANGED — same cycle list, no regression, no fix), and `@ruvector/attention` is still pinned at **0.1.3** (stale, now 27 patches behind 0.1.30).

**Overall Grade: A- (up from C).** Best dependency-health posture in the tracked history.

---

## Metrics Delta Table

| Metric | v3.9.13 | v3.10.6 | Delta | Evidence |
|--------|--------:|--------:|------:|----------|
| Packed tarball | 19.9 MB | **10.4 MB** | **-48%** | `npm pack --dry-run` → "package size: 10.4 MB" |
| Unpacked size | 88.5 MB | **54.8 MB** | **-38%** | `npm pack --dry-run` → "unpacked size: 54.8 MB" |
| Published files | 4,711 | **4,255** | -10% | `npm pack --dry-run` → "total files: 4255" |
| Prod CRITICAL vulns | 15 | **0** | **-15** | `npm audit --omit=dev` → "found 0 vulnerabilities" |
| Prod HIGH vulns | 0 | **0** | 0 | audit JSON `critical:0,high:0,...total:0` |
| Prod dep count | 25 | **23** | -2 | `package.json` dependencies block |
| Circular cycles (madge) | 12 | **12** | 0 | `npx madge --circular src/ --extensions ts` |
| Files processed (madge) | 1,263 | 1,295 | +32 | madge "Processed 1295 files" |
| Hardcoded `"3.0.0"` in src | 15 | **0** | **-15** | `grep -rn '"3\.0\.0"' src/` → 0 |
| dist/cli/chunks | 42 MB / 799 files | **4.8 MB / 266 files** | **-89%** | `du -sh dist/cli/chunks`; `ls \| wc -l` |
| dist/cli total | 44 MB | **7.7 MB** | -82% | `du -sh dist/cli` |
| dist/mcp/bundle.js | 6.9 MB | 3.6 MB | -48% | `ls -lh dist/mcp/bundle.js` |
| esbuild minify (cli/mcp) | true | true | unchanged | build-cli.mjs:199, build-mcp.mjs:173 |

---

## Remediation Table — Prior P0/P1 Findings

| # | Prior finding (v3.9.13) | Status | Evidence |
|---|-------------------------|--------|----------|
| 1 | **P0** — 15 CRITICAL prod vulns (protobufjs <7.5.5 RCE chain) | **FIXED** | `npm audit --omit=dev` → 0 vulns. Override `protobufjs: ^7.5.6` (package.json:200,208). Root cause excised: `@xenova/transformers` migrated to `@huggingface/transformers` (commit 122f223c). |
| 2 | **P0** — Tarball +79% (799 stale chunks, missing `rimraf`) | **FIXED** | `build-cli.mjs:25-29` now `rmSync(chunksDir, {recursive,force})` pre-build. Tarball 19.9 → 10.4 MB. Chunks 799 → 266 files. |
| 3 | **P0** — faker leak in `services/test-data-generator.ts:8` (static import) | **FIXED** | Now `import type` only (line 11) + lazy `await import()` (line 16-19). faker NOT inlined in `dist/mcp/bundle.js` (only the dynamic call site `Ble()` survives, line 3567). |
| 4 | **P1** — `@claude-flow/guidance@3.0.0-alpha.1` pinned in prod deps | **FIXED (exceeded)** | Demoted from `dependencies` to optional `peerDependencies` (package.json:169 + peerDependenciesMeta:174-175 `optional:true`) and `devDependencies` (line 215). Not installed for consumers by default. |
| 5 | **P2** — 15 hardcoded `"3.0.0"` literals in src | **FIXED** | `grep -rn '"3\.0\.0"' src/` → 0 occurrences. |
| 6 | **P1** — `queen-coordinator ↔ mincut/queen-integration` cycle | **UNCHANGED** | Still cycle #7 in madge output. |
| 7 | **P1** — mcp/handlers 4-file cycle | **UNCHANGED** | Still cycle #10 in madge output. |
| 8 | **P2** — 3 new cycles (a2a, learning/pattern-store, ruvector coherence-gate) | **UNCHANGED** | Still cycles #1, #3, #12. |
| 9 | **P2** — `@ruvector/attention` 0.1.3, 28 behind | **UNCHANGED** | Still `0.1.3` in package.json; installed 0.1.3; latest 0.1.30. |

**Net P0 outcome: 3 of 3 FIXED. P1: 1 of 3 fixed (guidance). P2: 1 of 3 fixed (version literals).**

---

## 1. Package & Bundle Size — FIXED

| Metric | v3.9.13 | v3.10.6 | Delta |
|--------|--------:|--------:|------:|
| Packed tarball | 19.9 MB | **10.4 MB** | -48% |
| Unpacked | 88.5 MB | **54.8 MB** | -38% |
| Published files | 4,711 | **4,255** | -10% |
| dist/cli/chunks | 42 MB (799) | **4.8 MB (266)** | -89% |

**Root-cause fix (build-cli.mjs:25-29):**
```
// Pre-build clean: delete stale code-split chunks so only fresh artefacts ship.
// Without this, dist/cli/chunks/ accumulates across builds (audit found 799
// chunks shipped with only 240 fresh), inflating the npm tarball by ~79%.
const chunksDir = join(__dirname, '..', 'dist/cli/chunks');
rmSync(chunksDir, { recursive: true, force: true });
```
The comment block directly cites the v3.9.13 audit finding — the remediation was actioned exactly as recommended. Tarball is now smaller than the v3.8.13 baseline (11.1 MB). Code-splitting (`splitting:true`, build-cli.mjs:198) and minification (line 199) are preserved.

---

## 2. Production Dependencies — 25 → 23, attack surface reduced

The two `@claude-flow/*` alpha packages that pulled the RCE chain are gone from `dependencies`:

| Package | v3.9.13 | v3.10.6 | Notes |
|---------|---------|---------|-------|
| @xenova/transformers | direct prod dep | **removed** | Migrated to `@huggingface/transformers@^4.2.0` (commit 122f223c). Now only transitive under optional `@claude-flow/guidance`. |
| @claude-flow/guidance | dependencies (alpha) | **optional peerDep** | package.json:169 + peerDependenciesMeta `optional:true` (line 174-175); also devDep (215). |
| @claude-flow/browser | optional prod dep | **optional peerDep** | package.json:168, optional. |
| @ruvector/sona | — | **^0.1.7** (installed 0.1.7) | SONA learning weight-update fix (commit 7a0c289c). |
| @ruvector/rvf-node | — | **^0.1.7** (installed 0.1.8) | Lags June `rvf-runtime` 0.3.0 line — see §6. |
| @ruvector/router | — | ^0.1.28 (installed 0.1.30) | Current. |
| @ruvector/learning-wasm | — | ^0.1.29 (installed 0.1.29) | Current. |
| @ruvector/gnn | 0.1.25 | 0.1.25 | Native-binary aligned. |
| @ruvector/attention | 0.1.3 | **0.1.3** | **STALE — 27 patches behind 0.1.30.** |
| @faker-js/faker | devDep | devDep `^10.2.0` | Correct; lazy-loaded. |

Full prod dependency list (23): @huggingface/transformers, @ruvector/{attention,gnn,learning-wasm,router,rvf-node,sona}, axe-core, better-sqlite3, chalk, cli-progress, commander, fast-glob, fast-json-patch, jose, ora, pg, prime-radiant-advanced-wasm, secure-json-parse, uuid, vibium, web-tree-sitter, yaml.

---

## 3. Faker Leak — CLOSED

`src/domains/test-generation/services/test-data-generator.ts`:
- Line 11: `import type { Faker, LocaleDefinition } from '@faker-js/faker';` — type-only, erased at compile.
- Lines 15-27: `loadFakerRuntime()` does `_fakerModule = await import('@faker-js/faker')` with a graceful catch instructing `npm install --save-dev @faker-js/faker`.

**Bundle verification:** `grep -c "faker" dist/mcp/bundle.js` → 1 (the dynamic import string only). faker's internal locale data is NOT present — only `allLocales` appears once as a destructured property name in the lazy loader. The ~3 MB faker payload is not shipped; faker is correctly a devDependency (`^10.2.0`, not in `dependencies`).

---

## 4. npm audit — VALIDATED against override-masking

| Severity | v3.9.13 | v3.10.6 | Scope |
|----------|--------:|--------:|-------|
| Critical | 15 | **0** | prod |
| High | 0 | **0** | prod |
| Moderate | 0 | **0** | prod |
| **Prod total** (`--omit=dev`) | 15 | **0** | — |

**Raw in-repo result:** `npm audit --omit=dev` → "found 0 vulnerabilities"; JSON metadata `{critical:0,high:0,moderate:0,total:0}`.

**Override-masking validation (mandatory caveat honored):** A raw 0-vuln audit cannot be trusted when `overrides` are present. I validated three independent ways:

1. **Installed-tree resolution.** `npm ls protobufjs --all` shows ALL three protobufjs consumers — including the historically-vulnerable `@xenova/transformers@2.17.2 → onnxruntime-web@1.14.0 → onnx-proto@4.0.4` path — **deduped to `protobufjs@7.5.8`** (>7.5.5, fixed). `find node_modules -path "*/protobufjs/package.json"` returns a single installed copy: **7.5.8**.

2. **Clean-resolve WITHOUT overrides.** Generated a `package.json` with `overrides` stripped and ran `npm install --package-lock-only`. npm's own resolver picked `protobufjs@7.6.3` — i.e., even *unforced*, the upstream ranges now resolve to a fixed version. The override is belt-and-suspenders, not a mask hiding a vulnerable resolution.

3. **Root-cause excision.** `@xenova/transformers` is no longer a direct prod dep (migrated to `@huggingface/transformers`), and the only remaining transitive path to it is via `@claude-flow/guidance`, now an **optional peerDependency** — not installed for normal consumers. So the chain is absent from a default consumer install entirely.

**Conclusion: the protobufjs/<7.5.5 RCE chain is GENUINELY fixed, not override-masked. Effective runtime CRITICAL=0, HIGH=0.**

Active overrides (package.json:194-210): `protobufjs ^7.5.6`, `@protobufjs/utf8 ^1.1.1`, `tar >=7.5.7`, `markdown-it >=14.1.1`, three `@opentelemetry/*` floors, two `@ruvector/gnn-*-musl` → `-gnu` aliases.

---

## 5. Circular Dependencies — UNCHANGED at 12

`npx madge --circular src/ --extensions ts` → "Found 12 circular dependencies!" (1295 files processed). The cycle list is **identical** to v3.9.13 — no regression, but no remediation either:

| # | Cycle | vs v3.9.13 |
|---|-------|-----------|
| 1 | a2a/notifications/subscription-store → webhook-service | unchanged |
| 2 | learning/pattern-store → ruvector/filter-adapter | unchanged |
| 3 | learning/pattern-store → learning/rvf-pattern-store | unchanged |
| 4 | claim-verifier-service → file-verifier → index | unchanged |
| 5 | file-verifier → index | unchanged |
| 6 | index → output-verifier | unchanged |
| 7 | queen-coordinator → mincut/queen-integration (**High**) | unchanged |
| 8 | consensus/interfaces → sycophancy-scorer | unchanged |
| 9 | ruvector/cognitive-container → codec | unchanged |
| 10 | mcp/handlers core → domain → configs → factory (**High**) | unchanged |
| 11 | mcp/handlers core → task-handlers | unchanged |
| 12 | ruvector/coherence-gate-core → coherence-gate-energy | unchanged |

Two high-risk cycles (#7 queen-coordinator, #10 mcp/handlers) persist since v3.8.3. This is the one dimension with zero movement this cycle.

---

## 6. Version Sync & @ruvector Currency

- **Hardcoded `"3.0.0"`: 0** (was 15). `grep -rn '"3\.0\.0"' src/` is clean. Release-protocol violation from v3.9.13 is resolved.
- **Build injection** correct: `build-cli.mjs:208` defines `__CLI_VERSION__` from root package.json; line 218 short-circuits `--version`/`-v` to print `3.10.6`. `3.10.6` is present in `dist/cli/bundle.js`.
- **@ruvector currency** (declared / installed / latest-observed):
  - `rvf-node` ^0.1.7 / **0.1.8** / lags the June `rvf-runtime` 0.3.0 line — the `@ruvector/rvf-node` 0.1.x package is a different artifact track than `rvf-runtime` 0.3.0, but if feature parity matters, the 0.1.x line is materially behind. **Note for platform owners.**
  - `sona` ^0.1.7 / **0.1.7** — freshly bumped 0.1.5→0.1.7 this cycle (commit 7a0c289c), current.
  - `attention` 0.1.3 / **0.1.3** / 0.1.30 — **27 patches stale, exact pin (no `^`), unmoved since v3.8.13.**
  - `router` ^0.1.28 / 0.1.30, `learning-wasm` ^0.1.29 / 0.1.29 — current.

---

## 7. Build Health

| Setting | v3.9.13 | v3.10.6 | Note |
|---------|---------|---------|------|
| esbuild minify (cli/mcp) | true | true | build-cli.mjs:199, build-mcp.mjs:173 |
| esbuild splitting (cli) | true | true | build-cli.mjs:198 |
| Pre-build chunk clean | **missing** | **present** | build-cli.mjs:25-29 (`rmSync`) |
| Version inject from package.json | yes | yes | build-cli.mjs:18-21,208 |

Build pipeline is now correct and self-documenting (the rimraf comment cites the audit it remediates).

---

## 8. Remaining Remediation Plan

| # | Item | Severity | Effort |
|---|------|----------|--------|
| 1 | Break `queen-coordinator ↔ mincut/queen-integration` (cycle #7) — extract shared interface | P1 | 2-4 h |
| 2 | Break `mcp/handlers` 4-file cycle (#10) — extract handler-types.ts | P1 | 2-4 h |
| 3 | Bump `@ruvector/attention` 0.1.3 → 0.1.30 (27 patches, exact-pinned) | P2 | 15 min + test |
| 4 | Fix remaining 3 P2 cycles (a2a #1, pattern-store #3, coherence-gate #12) | P2 | 1-2 h each |
| 5 | Evaluate `@ruvector/rvf-node` 0.1.x vs `rvf-runtime` 0.3.0 track parity | P2 | research |
| 6 | Enforce CI tarball size budget (hard-fail >15 MB) to prevent chunk-bloat recurrence | P3 | 1 h |
| 7 | Add `sideEffects: false` for consumer tree-shaking | P3 | 5 min |

---

## 9. Grading

| Category | v3.9.13 | v3.10.6 | Weight | Weighted |
|----------|---------|---------|--------|----------|
| Bundle optimization | C+ | **A** (tarball -48%, chunk clean) | 25% | 0.238 |
| Dependency hygiene | C | **A-** (faker closed, guidance demoted, -2 deps) | 25% | 0.213 |
| Circular dependencies | B- | **B-** (12, unchanged) | 15% | 0.105 |
| Security (npm audit) | D | **A** (0 prod vulns, validated genuine) | 15% | 0.143 |
| Build system | A- | **A** (chunk clean + version inject) | 10% | 0.095 |
| Freshness | B | **B+** (sona/router/learning-wasm current; attention stale) | 10% | 0.087 |

**Weighted Total: 0.881 / 1.0**

### Overall Grade: A- (up from C)

**Delta: C → A- (+two full letter grades).**

**Rationale:** All three v3.9.13 P0 blockers are FIXED with validated, root-cause remediation — not band-aids. The protobufjs RCE was eliminated three ways (override + dependency migration + optional-peer demotion), and I confirmed it survives an override-stripped resolve, so it is genuinely safe rather than masked. Tarball is below baseline. faker is genuinely de-bundled. The only drag is circular deps (frozen at 12) and the lone stale `@ruvector/attention` pin — neither is a release blocker.

**Trend:** v3.8.3 (B) → v3.8.13 (B+) → v3.9.13 (C) → **v3.10.6 (A-)**. The v3.9.13 regression was fully reversed in the v3.9.14 P0 wave (commit 6dd39a99) and the transformers migration (commit 122f223c).

---

## Appendix: Evidence Commands

```bash
npm pack --dry-run                              # 10.4 MB / 54.8 MB / 4255 files
npm audit --omit=dev                            # found 0 vulnerabilities
npm ls protobufjs --all                         # all deduped to 7.5.8
find node_modules -path "*/protobufjs/package.json"   # single copy, 7.5.8
# override-masking check: strip overrides, package-lock-only resolve -> protobufjs 7.6.3
npx madge --circular src/ --extensions ts       # 12 cycles
grep -rn '"3\.0\.0"' src/                        # 0
grep -rn "@faker-js/faker" src/                  # type-import + lazy import only
grep -c "faker" dist/mcp/bundle.js               # 1 (import string, not inlined)
du -sh dist/cli/chunks                           # 4.8 MB (266 files)
sed -n '25,29p' scripts/build-cli.mjs            # rmSync chunk clean
node -e "console.log(Object.keys(require('./package.json').dependencies).length)"  # 23
```

---

## Shared Memory

Findings stored to namespace `aqe/v3/qe-reports-3-10-6` (CLI memory store reported broken — recorded here as the system of record):

- **dependency-build-1 (P0 RESOLVED):** All 15 CRITICAL prod npm vulns are fixed and VALIDATED genuine (not override-masked). `npm ls protobufjs --all` shows the full @xenova→onnx-proto chain deduped to 7.5.8; an override-stripped resolve independently picks 7.6.3. Root cause excised by migrating @xenova/transformers → @huggingface/transformers (commit 122f223c). `npm audit --omit=dev` = 0.
- **dependency-build-2 (P0 RESOLVED):** Tarball bloat fixed — `rmSync(dist/cli/chunks)` added at build-cli.mjs:25-29. Packed 19.9 → 10.4 MB (-48%), chunks 799 → 266 files, below v3.8.13 baseline.
- **dependency-build-3 (P0 RESOLVED):** faker leak closed — test-data-generator.ts:11,16-19 uses `import type` + lazy `await import()`; faker's locale payload NOT inlined in dist/mcp/bundle.js (grep -c faker = 1, the import string).
- **dependency-build-4 (P1 RESOLVED, exceeded):** @claude-flow/guidance + @claude-flow/browser demoted from `dependencies` to optional `peerDependencies` (package.json:168-169, peerDependenciesMeta optional:true). Prod deps 25 → 23. Consumers no longer pull the alpha chain by default.
- **dependency-build-5 (UNCHANGED — only open item):** Circular deps frozen at 12 — identical cycle list to v3.9.13. Two High cycles persist: queen-coordinator↔mincut/queen-integration (#7) and mcp/handlers 4-file chain (#10). No regression, no fix.
- **dependency-build-6 (P2 STALE):** @ruvector/attention exact-pinned at 0.1.3 (27 patches behind 0.1.30), unmoved since v3.8.13. @ruvector/rvf-node 0.1.8 lags the rvf-runtime 0.3.0 track. sona/router/learning-wasm are current. Hardcoded "3.0.0" literals: 15 → 0 (FIXED).
