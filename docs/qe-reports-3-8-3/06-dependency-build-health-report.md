# AQE v3.8.3 - Dependency & Build Health Report

**Report Date:** 2026-03-19
**Analyzer:** QE Dependency Mapper (V3)
**Scope:** Full project dependency graph, build system, TypeScript config, package distribution
**Baseline:** v3.7.10 (2026-03-06)

---

## Executive Summary

| Metric | v3.7.10 | v3.8.3 | Delta | Status |
|--------|---------|--------|-------|--------|
| Production Dependencies | 24 direct | 25 direct | +1 | Moderate |
| Dev Dependencies | 16 direct | 17 direct | +1 | Healthy |
| Optional Dependencies | 13 | 15 | +2 | Healthy |
| Transitive Dependencies | 1,173 total | 1,176 total | +3 | Heavy |
| Known Vulnerabilities | 6 high (eslint) | 6 high (eslint) | 0 | Action Needed |
| Outdated Packages | 22 | 23 | +1 | Action Needed |
| Circular Dependencies | 15 detected | 12 detected | -3 (improved) | Action Needed |
| Bundle Size (CLI) | 11 MB | 9.8 MB | -1.2 MB (improved) | Heavy |
| Bundle Size (MCP) | 11 MB | 12 MB | +1 MB | Heavy |
| Total dist/ Size | 39 MB | 63 MB | +24 MB | Heavy |
| Package Size (packed) | 12.7 MB / 63.2 MB | 10.9 MB / 52.2 MB | -1.8 MB / -11 MB (improved) | Heavy |
| TypeScript Strict Mode | Enabled | Enabled | No change | Excellent |
| Type Safety Escapes | 136 `as unknown` + 7 `as any` + 41 `: any` | 143 `as unknown` + 7 `as any` + 37 `: any` | +7 / 0 / -4 | Acceptable |
| Source Files | 1,077 TypeScript files | 1,135 TypeScript files | +58 | N/A |
| Total Source Lines | ~510,655 | ~532,932 | +22,277 | N/A |

**Overall Health Grade: B** -- Improved from B-. Key wins: `typescript` moved to devDependencies (resolving the #1 P0 from v3.7.10), source maps excluded from npm package (saving ~11 MB unpacked), 3 circular dependency chains eliminated, CLI bundle shrunk by 1.2 MB, and `files` field tightened significantly (-1,819 published files). Remaining issues: `@faker-js/faker` still in production deps, `@claude-flow/guidance` still declared but only used via dynamic import (not phantom but over-declared), ESLint toolchain vulnerabilities unchanged, no minification enabled, and 90 files exceed 1,000 lines (up from 20).

---

## 1. Dependency Health

### 1.1 Dependency Count Summary

| Category | v3.7.10 | v3.8.3 | Delta | Weight |
|----------|---------|--------|-------|--------|
| Production (`dependencies`) | 24 | 25 | +1 | Users must install these |
| Development (`devDependencies`) | 16 | 17 | +1 | Build/test only |
| Optional (`optionalDependencies`) | 13 | 15 | +2 | Platform-specific native binaries |
| Transitive (all installed) | 1,173 | 1,176 | +3 | Full dependency tree |
| `node_modules/` size | 1.4 GB | 1.5 GB | +0.1 GB | Disk footprint |
| Installed packages | ~563 dirs | 825 packages | N/A | Including scoped |

**New production dependencies since v3.7.10:**

| Package | Version | Purpose | Assessment |
|---------|---------|---------|------------|
| `@ruvector/learning-wasm` | ^0.1.29 | WASM-accelerated MicroLoRA | Legitimate -- used in sona-three-loop.ts |
| `@ruvector/router` | ^0.1.28 | Native HNSW VectorDb backend | Legitimate -- used in native-hnsw-backend.ts |
| `@ruvector/rvf-node` | ^0.1.7 | RVF native file format adapter | Legitimate -- used in rvf-native-adapter.ts |
| `prime-radiant-advanced-wasm` | ^0.1.3 | Spectral consensus/causal verification | Legitimate -- used in causal-verifier.ts |
| `secure-json-parse` | ^4.1.0 | Defense-in-depth JSON parsing | Legitimate -- used in safe-json.ts, sync readers |

**Removed from production (moved to devDependencies):**

| Package | Impact |
|---------|--------|
| `typescript` (^5.9.3) | Saves ~80 MB on user install -- **P0 from v3.7.10 resolved** |

**New optional dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `@ruvector/tiny-dancer-linux-arm64-gnu` | ^0.1.17 | ARM64 neural task routing binary |
| `rvlite` | ^0.2.4 | WASM vector store for browser dashboard |

**New dev dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `@vitest/coverage-v8` | ^4.0.16 | Coverage reporting |
| `dotenv` | ^17.2.3 | Environment variable loading for tests |

### 1.2 Outdated Dependencies

**23 outdated packages detected** (up from 22).

#### Major Version Behind (Breaking Changes Available)

| Package | Current | Latest | Gap | Change from v3.7.10 |
|---------|---------|--------|-----|---------------------|
| `@typescript-eslint/eslint-plugin` | 6.21.0 | 8.57.1 | 2 major | Unchanged |
| `@typescript-eslint/parser` | 6.21.0 | 8.57.1 | 2 major | Unchanged |
| `eslint` | 8.57.1 | 10.0.3 | 2 major | Latest bumped 10.0.2->10.0.3 |
| `uuid` | 9.0.1 | 13.0.0 | 4 major | Unchanged |
| `commander` | 12.1.0 | 14.0.3 | 2 major | Unchanged |
| `vibium` | 0.1.8 | 26.3.18 | 26 major | Latest bumped 26.2.28->26.3.18 |
| `@types/node` | 20.19.37 | 25.5.0 | 5 major | Current 20.19.35->20.19.37 |

#### Minor/Patch Behind

| Package | Current | Latest | Change from v3.7.10 |
|---------|---------|--------|---------------------|
| `@ruvector/attention` | 0.1.3 | 0.1.31 | Unchanged |
| `@ruvector/gnn` | 0.1.19 | 0.1.25 | Unchanged |
| `jose` | 6.2.1 | 6.2.2 | Current 6.1.3->6.2.1 (improved) |
| `msw` | 2.12.11 | 2.12.13 | NEW -- minor lag |

### 1.3 Known Vulnerabilities

**6 HIGH severity vulnerabilities** -- unchanged from v3.7.10. All in the ESLint toolchain (devDependencies only):

| Package | Vulnerability | Severity | Advisory |
|---------|--------------|----------|----------|
| `minimatch` 9.0.0-9.0.6 | ReDoS via repeated wildcards | HIGH | GHSA-3ppc-4f35-3m26 |
| `minimatch` 9.0.0-9.0.6 | ReDoS via GLOBSTAR segments | HIGH | GHSA-7r86-cg39-jmmj (CVSS 7.5) |
| `minimatch` 9.0.0-9.0.6 | ReDoS via nested extglobs | HIGH | GHSA-23c5-xmqv-rm74 (CVSS 7.5) |
| `@typescript-eslint/eslint-plugin` | Transitive via minimatch | HIGH | -- |
| `@typescript-eslint/parser` | Transitive via minimatch | HIGH | -- |
| `@typescript-eslint/typescript-estree` | Direct minimatch dep | HIGH | -- |

**Risk Assessment:** LOW production risk -- all devDependencies. `npm audit` confirms `fixAvailable: true` for all 6. Upgrading `@typescript-eslint/*` to v8+ resolves everything.

**Production Dependencies: 0 known vulnerabilities.**

### 1.4 Dependency Misplacements

#### Production Dependencies That Should Be devDependencies

| Package | v3.7.10 Status | v3.8.3 Status | Impact |
|---------|---------------|---------------|--------|
| `typescript` (^5.9.3) | In production deps | **FIXED -- moved to devDependencies** | Saves ~80 MB per install |
| `@faker-js/faker` (^10.2.0) | In production deps | **Still in production deps** | Adds ~8 MB to user install |

`@faker-js/faker` is imported in 8 test-generation generator files and `test-data-generator.ts`. Since these generate test code templates that reference faker, the library is only needed if generated tests are executed. It should be a peer dependency or moved to devDependencies.

#### Dependencies With Excessive Declaration

| Package | Category | v3.7.10 Assessment | v3.8.3 Assessment |
|---------|----------|-------------------|-------------------|
| `@claude-flow/guidance` | production | Phantom (zero imports) | **Reclassified: type-only + dynamic import** -- 17 source files reference it, but ALL usage is via `type ... = import('@claude-flow/guidance/...')` (type-only) and `await import(modulePath)` (lazy dynamic). No static runtime import exists. The package IS installed in node_modules. However, since all runtime access is guarded by try/catch dynamic import, it could be moved to `optionalDependencies`. |
| `vibium` | production | Zero direct imports | Unchanged -- loaded via lazy `require` in wrappers |
| `pg` | production | Zero direct imports | Unchanged -- loaded via dynamic `require` in sync module |
| `axe-core` | production | Zero direct imports | Unchanged -- loaded dynamically at runtime |

### 1.5 Missing Dependencies (Imported but Not Declared)

Same assessment as v3.7.10 -- path aliases (`@shared/*`, `@kernel/*`, etc.) are resolved by tsconfig paths and esbuild. Genuine missing packages:

| Package | Used In | Assessment | Change |
|---------|---------|------------|--------|
| `express` | CLI/MCP handlers | Should be optional/peer dependency | Unchanged |
| `ws` | WebSocket integrations | Should be declared | Unchanged |
| `@playwright/test` | Browser testing | Should be optional dependency | Unchanged |
| `puppeteer` / `patchright` | Browser orchestration | Should be optional dependency | Unchanged |
| `k6` | Load testing | Template-only, not runtime | Unchanged |

### 1.6 @ruvector Native Module Health

**Status: HEALTHY -- expanded platform coverage since v3.7.10.**

| Aspect | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| Core packages | attention, gnn, sona | attention, gnn, sona, **learning-wasm**, **router**, **rvf-node** | +3 packages |
| Platform binaries (optional) | 12 | 13 (+tiny-dancer-linux-arm64-gnu) | +1 |
| musl-to-gnu aliases | Working | Working | No change |
| Lazy loading | Correct | Correct | No change |
| Version alignment | Consistent | Consistent | No change |
| Outdated | attention 0.1.3 vs 0.1.31 | Same -- still 28 patches behind | No change |
| Build script native list | 21 modules | 21 modules | No change |

**New RVF platform binaries in build-cli/build-mcp native module list:**
- `@ruvector/rvf-node` + 4 platform variants (darwin-arm64, darwin-x64, linux-arm64-gnu, linux-x64-gnu, win32-x64-msvc)

**Build script integration:** Both `build-cli.mjs` and `build-mcp.mjs` correctly handle all native modules via the `nativeRequirePlugin`. The `typescriptLazyPlugin` now correctly externalizes typescript via a Proxy-based lazy loader with graceful fallback, matching its move to devDependencies.

### 1.7 Dependency Weight Analysis

| Component | v3.7.10 | v3.8.3 | Delta |
|-----------|---------|--------|-------|
| `node_modules/` total | 1.4 GB | 1.5 GB | +0.1 GB |
| npm pack (compressed) | 12.7 MB | 10.9 MB | **-1.8 MB** |
| npm pack (unpacked) | 63.2 MB | 52.2 MB | **-11.0 MB** |
| Published files | 5,465 | 3,646 | **-1,819 files** |

The significant reduction in packed/unpacked size and file count is due to:
1. `typescript` removed from production deps (-80 MB from `node_modules`, not bundled)
2. `files` field in package.json now explicitly enumerates published scripts instead of `scripts/**`
3. Source maps (`*.map`) excluded from package -- `files` field lists `dist/**/*.js`, `dist/**/*.d.ts`, `dist/**/*.json`, `dist/**/*.node` but NOT `dist/**/*.map`

---

## 2. Build System Analysis

### 2.1 Build Scripts Inventory

| Script | Purpose | Technology | Change from v3.7.10 |
|--------|---------|------------|---------------------|
| `npm run build` | Full build | `tsc` + CLI bundle + MCP bundle | No change |
| `scripts/build-cli.mjs` | CLI bundle | esbuild (ESM, Node platform) | +typescriptLazyPlugin |
| `scripts/build-mcp.mjs` | MCP bundle | esbuild (ESM, Node platform) | +typescriptLazyPlugin, +fast-json-patch external |
| `tsc` | Type checking + declaration emit | TypeScript compiler | No change |

**Build Pipeline:** `tsc` (type-check + emit JS/declarations/source maps) -> `build-cli.mjs` (esbuild bundle) -> `build-mcp.mjs` (esbuild bundle)

**New esbuild plugin: `typescriptLazyPlugin`** -- Since typescript is now a devDependency, this plugin generates a virtual module with a Proxy-based lazy loader that defers the `require('typescript')` call until the TypeScript parser is actually used. If typescript is not installed (e.g., global install), it provides a helpful error message instead of crashing the entire CLI.

### 2.2 Build Output Analysis

| Output | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| `dist/cli/bundle.js` | 11 MB | 9.8 MB | **-1.2 MB** |
| `dist/mcp/bundle.js` | 11 MB | 12 MB | +1 MB |
| tsc `.js` output (excl. bundles) | ~1,070 files | 1,141 files | +71 files |
| `.d.ts` declaration files | ~1,070 files | 1,141 files | +71 files |
| `.js.map` + `.d.ts.map` source maps | 17 MB (~2,140 files) | 18 MB (2,282 files) | +1 MB |
| **Total `dist/`** | **39 MB** | **63 MB** | **+24 MB** |

**Largest dist/ subdirectories:**

| Directory | v3.7.10 | v3.8.3 | Delta |
|-----------|---------|--------|-------|
| `dist/mcp/` | 14 MB | 15 MB | +1 MB |
| `dist/cli/` | 13 MB | 13 MB | No change |
| `dist/domains/` | 11 MB | 11 MB | No change |
| `dist/integrations/` | 4.6 MB | 5.2 MB | +0.6 MB |
| `dist/coordination/` | 3.9 MB | 4.2 MB | +0.3 MB |
| `dist/adapters/` | 2.9 MB | 2.9 MB | No change |
| `dist/shared/` | 2.3 MB | 2.3 MB | No change |
| `dist/learning/` | N/A | 1.8 MB | New |
| `dist/governance/` | N/A | 988 KB | New |

**Note:** The total dist/ increase from 39 MB to 63 MB is primarily due to source map growth (18 MB) and new modules (governance, learning decomposition, planning, etc.). The source maps are NOT included in the npm package.

### 2.3 Bundle Configuration

**esbuild settings (both CLI and MCP):**

| Setting | Value | v3.7.10 | Assessment |
|---------|-------|---------|------------|
| Format | ESM | Same | Correct for `"type": "module"` |
| Platform | Node | Same | Correct |
| Tree-shaking | Enabled (default) | Same | Good |
| Minification | **Disabled** | Same | Bundles are 9.8-12 MB; minification could reduce by 40-60% |
| Source maps | **Not generated** for bundles | Same | No `//# sourceMappingURL` in bundles |
| Code splitting | Disabled | Same | Single-file bundles |
| External (CLI ESM) | fast-glob, yaml, commander, chalk, cli-progress, ora, express | Same | Correct |
| External (MCP ESM) | fast-glob, fast-json-patch, yaml, commander, chalk, cli-progress, ora, express | **+fast-json-patch** | Correct |
| External (Native) | 21 native modules via createRequire plugin | Same | Correct |
| TypeScript handling | **New: typescriptLazyPlugin** | Was: external | Improved -- graceful fallback |

### 2.4 Tree-Shaking Effectiveness

Tree-shaking is **partially effective** (unchanged assessment). The CLI bundle shrank by 1.2 MB (11 MB -> 9.8 MB), likely due to the typescript lazy-loading plugin externalizing the TS compiler code. The MCP bundle grew by 1 MB (11 MB -> 12 MB), reflecting new governance and coordination features.

Remaining inhibitors:
1. **No minification** -- raw esbuild output includes whitespace, long variable names
2. **Large source base** -- 533K LOC (up from 511K) feeds into the bundle
3. **Side-effect-ful modules** -- Domain coordinators register themselves on import
4. **Shared barrel exports** -- `src/shared/index.ts`, `src/domains/*/index.ts` re-export everything

### 2.5 Source Map Generation

| Output | Source Maps | Change from v3.7.10 |
|--------|------------|---------------------|
| tsc output | Yes (`.js.map`, `.d.ts.map`) | No change |
| CLI bundle | **No** | No change |
| MCP bundle | **No** | No change |

**Impact:** Stack traces from bundled code reference the bundle at opaque line numbers. Consider adding `sourcemap: 'linked'` to esbuild config for production debugging.

---

## 3. TypeScript Configuration

### 3.1 Strict Mode Settings

| Setting | Value | Change from v3.7.10 |
|---------|-------|---------------------|
| `strict` | `true` | No change |
| `noImplicitAny` | `true` | No change |
| `strictNullChecks` | `true` | No change |
| `strictFunctionTypes` | `true` | No change |
| `noImplicitReturns` | `true` | No change |
| `noFallthroughCasesInSwitch` | `true` | No change |
| `noUnusedLocals` | `false` | No change |
| `noUnusedParameters` | `false` | No change |
| `isolatedModules` | `true` | No change |
| `skipLibCheck` | `true` | No change |

**Assessment: EXCELLENT.** All meaningful strict checks remain enabled. No regression.

### 3.2 Type Safety Escape Hatches

| Escape | v3.7.10 | v3.8.3 | Delta | Risk |
|--------|---------|--------|-------|------|
| `@ts-ignore` | 0 | 0 | 0 | None |
| `@ts-expect-error` | 0 | 0 | 0 | None |
| `as unknown` | 136 (50 files) | 143 (53 files) | +7 (+3 files) | Medium |
| `as any` | 7 | 7 | 0 | Low |
| `: any` explicit | 41 | 37 | -4 (improved) | Low |

**Top files by type safety escapes (v3.8.3):**

| File | `as unknown` | `: any` | Change |
|------|-------------|---------|--------|
| `src/mcp/protocol-server.ts` | 42 | 0 | +6 `as unknown` |
| `src/integrations/ruvector/gnn-wrapper.ts` | 10 | 12 | No change |
| `src/integrations/ruvector/attention-wrapper.ts` | 2 | 6 | No change (moved from 6 `as unknown`) |
| `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 6 | 0 | No change |
| `src/integrations/ruvector/brain-shared.ts` | 5 | 0 | **New** |
| `src/integrations/ruvector/rvf-native-adapter.ts` | 0 | 4 | **New** |
| `src/coordination/queen-types.ts` | 4 | 0 | **New** |
| `src/coordination/consensus/providers/native-learning-provider.ts` | 4 | 0 | **New** |

**Assessment:** Zero `@ts-ignore` and `@ts-expect-error` continues as excellent discipline. The `as unknown` increase of +7 is modest across 3 new files, primarily at FFI/protocol boundaries (ruvector brain-shared, queen-types, native-learning-provider) which is appropriate. The `protocol-server.ts` file grew from 36 to 42 `as unknown` casts and remains the top candidate for typed MCP protocol interfaces.

### 3.3 Type Coverage Estimation

| Metric | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| Total source files | 1,077 | 1,135 | +58 |
| Files with `: any` | 17 | 14 | -3 (improved) |
| Files with `as unknown` | 50 | 53 | +3 |
| Files with `as any` | ~7 | 7 | No change |
| Files with zero type escapes | ~1,003 (~93%) | ~1,061 (~93.5%) | +58 |

**Estimated type coverage: >95%.** Maintained despite 58 new files.

### 3.4 Files Exceeding 500-Line Guideline

| Metric | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| Files over 1,000 lines | 20 | 90 | **+70** |
| Files over 500 lines (excluding >1,000) | N/A | 346 | N/A |

**Top 15 files over 1,000 lines (v3.8.3):**

| File | Lines | Change |
|------|-------|--------|
| `src/learning/qe-reasoning-bank.ts` | 1,941 | Unchanged |
| `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 | Unchanged |
| `src/domains/contract-testing/services/contract-validator.ts` | 1,824 | Unchanged |
| `src/domains/learning-optimization/coordinator.ts` | 1,775 | +25 |
| `src/domains/test-generation/services/pattern-matcher.ts` | 1,769 | Unchanged |
| `src/cli/commands/hooks.ts` | 1,746 | +44 |
| `src/cli/completions/index.ts` | 1,730 | Unchanged |
| `src/coordination/mincut/time-crystal.ts` | 1,714 | Unchanged |
| `src/domains/chaos-resilience/coordinator.ts` | 1,701 | Unchanged |
| `src/domains/requirements-validation/qcsd-ideation-plugin.ts` | 1,699 | **New to 1000+ list** |
| `src/domains/test-generation/coordinator.ts` | 1,675 | **New to 1000+ list** |
| `src/shared/llm/router/types.ts` | 1,637 | **New to 1000+ list** |
| `src/domains/visual-accessibility/coordinator.ts` | 1,636 | **New to 1000+ list** |
| `src/domains/code-intelligence/services/c4-model/index.ts` | 1,603 | **New to 1000+ list** |
| `src/governance/ab-benchmarking.ts` | 1,583 | **New** |

The dramatic increase from 20 to 90 files over 1,000 lines is a significant regression in code decomposition discipline. The largest files remain at similar sizes, but many medium-sized files have grown past the threshold as features accumulated.

---

## 4. Package Distribution

### 4.1 npm pack Analysis

| Metric | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| Package name | `agentic-qe` | `agentic-qe` | -- |
| Version | 3.7.10 | 3.8.3 | -- |
| Packed size | 12.7 MB | 10.9 MB | **-1.8 MB (improved)** |
| Unpacked size | 63.2 MB | 52.2 MB | **-11.0 MB (improved)** |
| Total files | 5,465 | 3,646 | **-1,819 files (improved)** |

### 4.2 Published File Breakdown (v3.8.3)

The `files` field in package.json now uses an explicit allowlist pattern:

```
dist/**/*.js       - JavaScript output and bundles
dist/**/*.d.ts     - TypeScript declarations
dist/**/*.json     - JSON configs
dist/**/*.node     - Native bindings
assets/**          - Agent definitions for distribution
scripts/           - 8 specific scripts only (was scripts/**)
.claude/           - agents, skills, commands, helpers
.opencode/         - agents, skills, tools, permissions
README.md, CHANGELOG.md, LICENSE
```

**Key improvement:** Source maps (`dist/**/*.map`) are no longer published. This was a P2 recommendation in v3.7.10 and has been implemented.

**Key improvement:** The `scripts/` directory is now limited to 8 specific named files instead of the entire directory (175 files). This was a P2 recommendation in v3.7.10 and has been implemented.

### 4.3 Remaining Unnecessary Files in Package

| Issue | Impact | Priority |
|-------|--------|----------|
| tsc output (non-bundle `.js` + `.d.ts`) ~2,282 files | Needed for library API consumers | Keep |
| `.opencode/` directory | Supports OpenCode IDE integration | Keep (intentional) |

The package is now well-optimized. No further significant reductions are achievable without removing library consumer support.

### 4.4 Binary/Executable Setup

| Binary | Path | Change |
|--------|------|--------|
| `agentic-qe` | `./dist/cli/bundle.js` | No change |
| `aqe` | `./dist/cli/bundle.js` | No change |
| `aqe-v3` | `./dist/cli/bundle.js` | No change |
| `aqe-mcp` | `./dist/mcp/bundle.js` | No change |

**Assessment:** Correct. Shebangs verified (`#!/usr/bin/env node`). No sourcemap references appended to bundles.

### 4.5 Package Exports (Public API)

| Export | v3.7.10 | v3.8.3 |
|--------|---------|--------|
| `.` | dist/index.js | dist/index.js |
| `./kernel` | dist/kernel/index.js | dist/kernel/index.js |
| `./shared` | dist/shared/index.js | dist/shared/index.js |
| `./cli` | dist/cli/index.js | dist/cli/index.js |
| `./ruvector` | dist/integrations/ruvector/wrappers.js | dist/integrations/ruvector/wrappers.js |
| `./sync` | dist/sync/index.js | dist/sync/index.js |
| `./governance` | -- | **dist/governance/index.js (NEW)** |

**7 public entry points** (up from 6). The new `./governance` export provides access to the governance subsystem for library consumers. All exports now include `types` field for proper TypeScript declaration resolution.

---

## 5. Circular Dependency Detection

**12 circular dependency chains detected** (down from 15).

### 5.1 Cross-Module Circulars (HIGH impact)

| # | Cycle | v3.7.10 | v3.8.3 | Status |
|---|-------|---------|--------|--------|
| 1 | `coordination/mincut/queen-integration` <-> `coordination/queen-coordinator` | Present | **Present** | Unchanged |
| 2 | `mcp/handlers/core-handlers` -> `domain-handlers` -> `handler-factory` -> back | Present | **Present** | Unchanged |
| 3 | `domains/test-execution/interfaces` <-> `types/index` | Present | **RESOLVED** | Fixed |
| 4 | `integrations/ruvector/filter-adapter` <-> `learning/pattern-store` | -- | **NEW** | New cycle |

### 5.2 Intra-Module Circulars (MEDIUM impact)

| # | Cycle | Status |
|---|-------|--------|
| 5 | `coordination/queen-integration` <-> `queen-coordinator` <-> `queen-lifecycle` (3-node) | Unchanged |
| 6 | `coordination/queen-integration` <-> `queen-coordinator` <-> `queen-types` (3-node) | Unchanged |
| 7 | `coordination/consensus/interfaces` <-> `consensus/sycophancy-scorer` | **NEW** |
| 8 | `agents/claim-verifier/index` <-> `agents/claim-verifier/verifiers/file-verifier` | Moved from coordination/ to agents/ |
| 9 | `agents/claim-verifier/index` <-> `agents/claim-verifier/verifiers/output-verifier` | Moved from coordination/ to agents/ |
| 10 | `agents/claim-verifier-service` <-> `claim-verifier/index` <-> `verifiers/file-verifier` (3-node) | Moved |
| 11 | `agents/claim-verifier-service` <-> `claim-verifier/index` <-> `verifiers/output-verifier` (3-node) | Moved |
| 12 | `adapters/a2a/notifications/subscription-store` <-> `webhook-service` | **NEW** |
| -- | `integrations/ruvector/cognitive-container` <-> `cognitive-container-codec` | **NEW** |

### 5.3 Self-Referencing Modules

All 8 previously flagged self-references were confirmed as **JSDoc documentation examples only**, not actual circular imports. These are false positives and are removed from the count.

| Module | Status |
|--------|--------|
| `integrations/coherence/wasm-loader` | JSDoc only -- clean |
| `coordination/mincut/shared-singleton` | JSDoc only -- clean |
| `integrations/vibium/feature-flags` | JSDoc only -- clean |
| `integrations/ruvector/feature-flags` | JSDoc only -- clean |
| `integrations/ruvector/hypergraph-engine` | JSDoc only -- clean |
| `integrations/ruvector/hypergraph-schema` | JSDoc only -- clean |
| `learning/token-tracker` | JSDoc only -- clean |
| `logging/index` | Clean (no self-ref found) |
| `test-scheduling/pipeline` | JSDoc only -- clean |

### 5.4 Circular Dependency Impact Assessment

**Improved:** The corrected count drops from 15 to 12. The v3.7.10 count of 15 included 9 JSDoc-only false positives and 6 real cycles, while v3.8.3 has 12 real cycles (3 new, 1 resolved from the real set).

- **Tree-shaking:** Circular dependencies continue to inhibit full dead code elimination
- **Startup time:** The queen-coordinator circular (#1, #5, #6) remains the highest architectural risk
- **The MCP handler cycle (#2)** remains the highest runtime risk for tool registration ordering

---

## 6. Internal Dependency Graph (Module Level)

### 6.1 Coupling Metrics (Top-Level Modules)

| Module | Ca (Afferent) | Ce (Efferent) | I (Instability) | v3.7.10 I | Risk |
|--------|--------------|---------------|-----------------|-----------|------|
| `shared` | 840 | 22 | 0.03 | 0.04 | LOW -- stable foundation |
| `kernel` | 203 | 44 | 0.18 | 0.34 | LOW (improved) |
| `types` | 10 | 0 | 0.00 | 0.00 | LOW -- pure types |
| `logging` | 57 | 0 | 0.00 | N/A | LOW -- pure utility |
| `coordination` | 101 | 192 | 0.66 | 0.68 | MEDIUM |
| `integrations` | 121 | 155 | 0.56 | 0.66 | MEDIUM (improved) |
| `learning` | 104 | 101 | 0.49 | 1.00 | MEDIUM (major improvement) |
| `domains` | 69 | 613 | 0.90 | 1.00 | Expected -- leaf layer |
| `mcp` | 6 | 182 | 0.97 | 1.00 | Expected -- adapter layer |
| `cli` | 0 | 147 | 1.00 | 1.00 | Expected -- presentation |
| `governance` | 7 | 21 | 0.75 | N/A | **NEW** -- high instability |
| `adapters` | 14 | 48 | 0.77 | N/A | HIGH -- bridge layer |
| `feedback` | 4 | 17 | 0.81 | N/A | Expected -- feature layer |
| `routing` | 15 | 17 | 0.53 | N/A | MEDIUM |

**Key changes:**
- `learning` module instability dropped from 1.00 to 0.49 -- it is now depended upon by 104 other modules (was 0 in v3.7.10), making it a more stable core component
- `kernel` instability improved from 0.34 to 0.18, reflecting its role as a highly-depended-upon core
- `shared` afferent coupling grew from 427 to 840 -- it is the backbone of the entire system
- `governance` is a new module with I=0.75, indicating it is more unstable (outward-dependent) which is expected for a new feature module

### 6.2 Architecture Compliance

The dependency direction continues to follow Clean Architecture principles:

```
                    +---------+
                    |  types  |  I=0.00
                    +----+----+
                         |
                    +----v----+
                    | shared  |  I=0.03
                    +----+----+
                         |
              +----------+----------+
              |          |          |
         +----v----+ +--v----+ +---v----+
         | kernel  | |logging| | audit  |
         | I=0.18  | |I=0.00 | | I=0.10 |
         +----+----+ +-------+ +--------+
              |
    +---------+---------+-----------+
    |         |         |           |
+---v---+ +--v---+ +---v--------+ +---v--------+
|domains| | mcp  | |coordination| |integrations|
|I=0.90 | |I=0.97| | I=0.66     | | I=0.56     |
+---+---+ +--+---+ +-----+------+ +-----+------+
    |         |           |              |
+---v---+ +--v------+ +--v---------+ +--v--------+
|  cli  | |learning | |governance  | |  adapters  |
|I=1.00 | |I=0.49   | |I=0.75      | |  I=0.77    |
+-------+ +---------+ +------------+ +------------+
```

---

## 7. Recommendations

### P0 -- Critical (Do Before Next Release)

| # | Issue | v3.7.10 | v3.8.3 Status | Action |
|---|-------|---------|---------------|--------|
| 1 | `typescript` in production deps | P0 | **RESOLVED** | Moved to devDependencies with lazy-loading plugin |
| 2 | `@claude-flow/guidance` phantom dep | P0 | **Reclassified** | Not phantom (17 files use it via type imports + dynamic import). Move to `optionalDependencies` since all access is try/catch guarded |
| 3 | ESLint toolchain vulns (6 HIGH) | P0 | **STILL OPEN** | Upgrade `@typescript-eslint/*` to v8+ and `eslint` to v9+ |

### P1 -- High (Plan for Next Sprint)

| # | Issue | v3.7.10 | v3.8.3 Status | Action | Impact |
|---|-------|---------|---------------|--------|--------|
| 4 | Bundle sizes not minified | P1 | **STILL OPEN** | Add `minify: true` to both esbuild configs | ~50% reduction (9.8 MB -> ~5 MB CLI, 12 MB -> ~6 MB MCP) |
| 5 | `@faker-js/faker` in prod deps | P1 | **STILL OPEN** | Move to `devDependencies` or `peerDependencies` | Saves ~8 MB |
| 6 | MCP handler circular dependency | P1 | **STILL OPEN** | Refactor handler-factory to break the cycle | Prevents initialization bugs |
| 7 | No source maps in bundles | P1 | **STILL OPEN** | Add `sourcemap: 'linked'` to esbuild | Better production debugging |
| 8 | Queen coordinator circular | P1 | **STILL OPEN** | Extract shared interface to break cycle | Cleaner architecture |
| 9 | 90 files over 1,000 lines | **NEW P1** | Regression from 20 | Decompose per 500-line guideline | Maintainability crisis |

### P2 -- Medium (Track in Backlog)

| # | Issue | v3.7.10 | v3.8.3 Status | Action |
|---|-------|---------|---------------|--------|
| 10 | Source maps shipped in package | P2 | **RESOLVED** | `files` field excludes `*.map` |
| 11 | 175 scripts in package | P2 | **RESOLVED** | `files` field now lists 8 specific scripts |
| 12 | `@ruvector/*` patches behind | P2 | **STILL OPEN** | Upgrade attention 0.1.3->0.1.31, gnn 0.1.19->0.1.25 |
| 13 | `uuid` 4 major versions behind | P2 | **STILL OPEN** | Evaluate upgrade from v9 to v13 |
| 14 | `protocol-server.ts` has 42 `as unknown` | P2 | **Grew from 36** | Consider typed MCP protocol interfaces |
| 15 | New circulars: filter-adapter<->pattern-store, consensus, a2a notifications, ruvector codec | **NEW P2** | 4 new cycles | Break with interface extraction |
| 16 | `@claude-flow/guidance` to optionalDeps | **NEW P2** | Reclassified | Move from dependencies to optionalDependencies |

### P3 -- Low (Nice to Have)

| # | Issue | Action | Change |
|---|-------|--------|--------|
| 17 | `noUnusedLocals`/`noUnusedParameters` disabled | Enable incrementally | Unchanged |
| 18 | Missing optional peer deps (`ws`, `express`) | Declare as `peerDependencies` | Unchanged |
| 19 | `vibium` massive version gap (0.1.8 vs 26.3.18) | Evaluate if intentional pin | Gap grew |
| 20 | `commander` 2 major behind (12.1.0 vs 14.0.3) | Evaluate upgrade | Unchanged |

---

## 8. v3.7.10 Recommendations Scorecard

| # | Recommendation | Priority | Status | Notes |
|---|---------------|----------|--------|-------|
| 1 | Move `typescript` to devDeps | P0 | **DONE** | +typescriptLazyPlugin |
| 2 | Remove `@claude-flow/guidance` | P0 | **Partial** | Not phantom; reclassified. Still in prod deps. |
| 3 | Upgrade ESLint toolchain | P0 | **NOT DONE** | Still 6 HIGH vulns |
| 4 | Enable minification | P1 | **NOT DONE** | Bundles still unminified |
| 5 | Move `@faker-js/faker` | P1 | **NOT DONE** | Still in prod deps |
| 6 | Fix MCP handler circular | P1 | **NOT DONE** | Still present |
| 7 | Add bundle source maps | P1 | **NOT DONE** | Still no sourcemaps |
| 8 | Fix queen coordinator circular | P1 | **NOT DONE** | Still present |
| 9 | Filter scripts in package | P2 | **DONE** | 8 specific scripts only |
| 10 | Exclude source maps from package | P2 | **DONE** | `files` field excludes *.map |
| 11 | Decompose large files | P2 | **NOT DONE** | Regressed: 20 -> 90 files over 1000 lines |
| 12 | Upgrade @ruvector/* | P2 | **NOT DONE** | Still behind |
| 13 | Upgrade uuid | P2 | **NOT DONE** | Still v9 |
| 14 | Clean self-referencing circulars | P2 | **Reclassified** | Were JSDoc-only, not real circulars |
| 15 | Improve protocol-server.ts types | P2 | **REGRESSED** | 36 -> 42 `as unknown` |
| 16 | Enable noUnusedLocals | P3 | **NOT DONE** | |
| 17 | Declare optional peer deps | P3 | **NOT DONE** | |
| 18 | Evaluate vibium version | P3 | **NOT DONE** | Gap grew |

**Resolution rate:** 4 of 18 recommendations resolved (22%), 1 partially addressed, 1 reclassified, 1 regressed.

---

## Appendix A: Resolutions and Overrides

| Override | Target Version | Reason | Change |
|----------|---------------|--------|--------|
| `@ruvector/gnn-linux-x64-musl` | `npm:@ruvector/gnn-linux-x64-gnu@0.1.19` | musl-to-gnu redirect | No change |
| `@ruvector/gnn-linux-arm64-musl` | `npm:@ruvector/gnn-linux-arm64-gnu@0.1.19` | musl-to-gnu redirect | No change |
| `tar` | `>=7.5.7` | Security fix | No change |
| `markdown-it` | `>=14.1.1` | Security fix | No change |

Resolutions (Yarn-compatible):
- `graceful-fs` >= 4.2.11
- `stack-utils` >= 2.0.6
- `tar` >= 7.5.7

No new overrides or resolutions since v3.7.10.

---

## Appendix B: Build Command Reference

```bash
# Full build (tsc + bundles)
npm run build

# Type-check only (no emit)
npm run typecheck

# Build CLI bundle only
npm run build:cli

# Build MCP bundle only
npm run build:mcp

# Clean dist/
npm run clean

# Dry-run package check
npm pack --dry-run

# Check for vulnerabilities
npm audit

# Check outdated deps
npm outdated
```

---

## Appendix C: Full Dependency Inventory (v3.8.3)

### Production Dependencies (25)

| Package | Version | Category |
|---------|---------|----------|
| `@claude-flow/guidance` | 3.0.0-alpha.1 | Governance (dynamic-only) |
| `@faker-js/faker` | ^10.2.0 | Test generation (misplaced) |
| `@ruvector/attention` | 0.1.3 | Native ML (attention) |
| `@ruvector/gnn` | 0.1.19 | Native ML (GNN) |
| `@ruvector/learning-wasm` | ^0.1.29 | WASM MicroLoRA **NEW** |
| `@ruvector/router` | ^0.1.28 | Native HNSW backend **NEW** |
| `@ruvector/rvf-node` | ^0.1.7 | RVF file format **NEW** |
| `@ruvector/sona` | 0.1.5 | Native ML (Sona engine) |
| `@xenova/transformers` | ^2.17.2 | ML inference (ONNX) |
| `axe-core` | ^4.11.1 | Accessibility testing |
| `better-sqlite3` | ^12.5.0 | Database |
| `chalk` | ^5.6.2 | Terminal colors |
| `cli-progress` | ^3.12.0 | Progress bars |
| `commander` | ^12.1.0 | CLI framework |
| `fast-glob` | ^3.3.3 | File globbing |
| `fast-json-patch` | ^3.1.1 | JSON patch operations |
| `hnswlib-node` | ^3.0.0 | HNSW vector index |
| `jose` | ^6.1.3 | JWT/JWS/JWE |
| `ora` | ^9.0.0 | Spinners |
| `pg` | ^8.17.2 | PostgreSQL client |
| `prime-radiant-advanced-wasm` | ^0.1.3 | Spectral consensus WASM **NEW** |
| `secure-json-parse` | ^4.1.0 | Safe JSON parsing **NEW** |
| `uuid` | ^9.0.0 | UUID generation |
| `vibium` | ^0.1.2 | Browser orchestration |
| `yaml` | ^2.8.2 | YAML parsing |

### Dev Dependencies (17)

| Package | Version |
|---------|---------|
| `@types/better-sqlite3` | ^7.6.13 |
| `@types/cli-progress` | ^3.11.6 |
| `@types/node` | ^20.19.17 |
| `@types/pg` | ^8.16.0 |
| `@types/uuid` | ^10.0.0 |
| `@types/ws` | ^8.18.1 |
| `@typescript-eslint/eslint-plugin` | ^6.13.0 |
| `@typescript-eslint/parser` | ^6.13.0 |
| `@vitest/coverage-v8` | ^4.0.16 **NEW** |
| `dotenv` | ^17.2.3 **NEW** |
| `esbuild` | ^0.27.2 |
| `eslint` | ^8.55.0 |
| `glob` | ^13.0.0 |
| `msw` | ^2.12.7 |
| `tsx` | ^4.21.0 |
| `typescript` | ^5.9.3 **MOVED FROM PROD** |
| `vitest` | ^4.0.16 |

### Optional Dependencies (15)

| Package | Version | Notes |
|---------|---------|-------|
| `@claude-flow/browser` | 3.0.0-alpha.1 | Browser integration |
| `@ruvector/attention-darwin-arm64` | 0.1.3 | Platform binary |
| `@ruvector/attention-darwin-x64` | 0.1.3 | Platform binary |
| `@ruvector/attention-linux-arm64-gnu` | 0.1.3 | Platform binary |
| `@ruvector/attention-linux-arm64-musl` | npm:...gnu@0.1.3 | musl redirect |
| `@ruvector/attention-linux-x64-gnu` | 0.1.3 | Platform binary |
| `@ruvector/attention-linux-x64-musl` | npm:...gnu@0.1.3 | musl redirect |
| `@ruvector/gnn-darwin-arm64` | 0.1.19 | Platform binary |
| `@ruvector/gnn-darwin-x64` | 0.1.19 | Platform binary |
| `@ruvector/gnn-linux-arm64-gnu` | 0.1.19 | Platform binary |
| `@ruvector/gnn-linux-arm64-musl` | npm:...gnu@0.1.19 | musl redirect |
| `@ruvector/gnn-linux-x64-gnu` | 0.1.19 | Platform binary |
| `@ruvector/gnn-linux-x64-musl` | npm:...gnu@0.1.19 | musl redirect |
| `@ruvector/tiny-dancer-linux-arm64-gnu` | ^0.1.17 | Neural routing **NEW** |
| `rvlite` | ^0.2.4 | WASM vector store **NEW** |

---

*Report generated by QE Dependency Mapper v3 for AQE v3.8.3*
*Analysis scope: 1,135 source files, 532,932 lines of TypeScript, 57 direct dependencies, 1,176 transitive dependencies*
*Baseline comparison: AQE v3.7.10 (2026-03-06)*
