# AQE v3.7.14 - Dependency & Build Health Report

**Report Date:** 2026-03-09
**Analyzer:** QE Dependency Mapper (V3)
**Scope:** Full project dependency graph, build system, TypeScript config, package distribution

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Production Dependencies | 23 direct | Healthy |
| Dev Dependencies | 17 direct | Healthy |
| Optional Dependencies | 13 (native platform binaries) | Healthy |
| Transitive Dependencies | 1,173 total installed | Heavy |
| Known Vulnerabilities | 6 high (all in eslint toolchain) | Action Needed |
| Outdated Packages | 20 | Action Needed |
| Circular Dependencies | 15 detected | Action Needed |
| Bundle Size (CLI) | 9.5 MB | Heavy |
| Bundle Size (MCP) | 10.5 MB | Heavy |
| Total dist/ Size | 60 MB (+ 3.8 MB source maps) | Heavy |
| Package Size (packed) | 10.6 MB / 50.7 MB unpacked | Improved |
| TypeScript Strict Mode | Enabled (all strict flags) | Excellent |
| Type Safety Escapes | 141 `as unknown` + 7 `as any` + 39 `: any` | Acceptable |
| Source Files | 1,083 TypeScript files | N/A |
| Total Source Lines | ~513,351 | N/A |
| Published Files | 3,301 files | Improved |

**Overall Health Grade: B+** -- Strong type safety, good build tooling, significant package size reduction since v3.7.10, but heavy bundles and unresolved ESLint vulnerabilities remain.

---

## 1. Dependency Health

### 1.1 Dependency Count Summary

| Category | Count | Weight |
|----------|-------|--------|
| Production (`dependencies`) | 23 | Users must install these |
| Development (`devDependencies`) | 17 | Build/test only |
| Optional (`optionalDependencies`) | 13 | Platform-specific native binaries |
| Transitive (all installed) | 1,173 | Full dependency tree |
| `node_modules/` size | 1.4 GB | Disk footprint |

**Change from v3.7.10:** Production dependencies reduced from 24 to 23.

### 1.2 Outdated Dependencies

**20 outdated packages detected.** Sorted by severity:

#### Major Version Behind (Breaking Changes Available)

| Package | Current | Latest | Gap |
|---------|---------|--------|-----|
| `@typescript-eslint/eslint-plugin` | 6.21.0 | 8.56.1 | 2 major |
| `@typescript-eslint/parser` | 6.21.0 | 8.56.1 | 2 major |
| `eslint` | 8.57.1 | 10.0.3 | 2 major |
| `uuid` | 9.0.1 | 13.0.0 | 4 major |
| `commander` | 12.1.0 | 14.0.3 | 2 major |
| `vibium` | 0.1.8 | 26.3.9 | 26 major |
| `@types/node` | 20.19.35 | 25.3.5 | 5 major |

#### Minor/Patch Behind

| Package | Current | Latest |
|---------|---------|--------|
| `@ruvector/attention` | 0.1.3 | 0.1.31 |
| `@ruvector/gnn` | 0.1.19 | 0.1.25 |
| `jose` | 6.1.3 | 6.2.0 |
| `pg` | 8.19.0 | 8.20.0 |

### 1.3 Known Vulnerabilities

**6 HIGH severity vulnerabilities** -- all in the ESLint toolchain (devDependencies only):

| Package | Vulnerability | Severity | CVE/Advisory |
|---------|--------------|----------|--------------|
| `minimatch` 9.0.0-9.0.6 | ReDoS via repeated wildcards | HIGH | GHSA-3ppc-4f35-3m26 |
| `minimatch` 9.0.0-9.0.6 | ReDoS via GLOBSTAR segments | HIGH | GHSA-7r86-cg39-jmmj (CVSS 7.5) |
| `minimatch` 9.0.0-9.0.6 | ReDoS via nested extglobs | HIGH | GHSA-23c5-xmqv-rm74 (CVSS 7.5) |
| `@typescript-eslint/eslint-plugin` | Transitive via minimatch | HIGH | -- |
| `@typescript-eslint/parser` | Transitive via minimatch | HIGH | -- |
| `@typescript-eslint/typescript-estree` | Direct minimatch dep | HIGH | -- |

**Risk Assessment:** LOW production risk -- these are all devDependencies used only during development/CI linting. No production code paths are affected. However, upgrading `@typescript-eslint/*` to v8+ would resolve all 6 advisories.

**Production Dependencies: 0 known vulnerabilities.**

### 1.4 Dependency Misplacements

#### Production Dependencies That Should Be devDependencies

| Package | Reason | Impact |
|---------|--------|--------|
| `typescript` (^5.9.3) | Compiler, not runtime | Adds ~80 MB to user install |

`typescript` is listed in `dependencies` but is only needed at build time. However, the build scripts correctly handle this with a lazy-loading plugin that only loads typescript when actually needed for code analysis features, and provides a helpful error if missing.

**Note on @faker-js/faker:** This is used in test-generation generators to create realistic test data. Since it generates code that users may execute, keeping it as a production dependency is justified.

#### Potentially Unused Dependencies

| Package | Category | Notes |
|---------|----------|-------|
| `@claude-flow/guidance` | production | 54 imports found -- actively used |
| `vibium` | production | Zero direct imports (used via lazy `require` in wrappers) |
| `pg` | production | Zero direct imports (used via dynamic `require` in sync module) |
| `axe-core` | production | Zero direct imports (loaded dynamically at runtime) |

**Note:** `vibium`, `pg`, and `axe-core` are loaded dynamically at runtime for optional features.

### 1.5 Missing Dependencies (Imported but Not Declared)

Most of these are path aliases (`@shared/*`, `@kernel/*`, etc.) resolved by tsconfig paths and esbuild. Genuine missing packages:

| Package | Used In | Assessment |
|---------|---------|------------|
| `express` | CLI/MCP handlers | Should be optional/peer dependency |
| `ws` | WebSocket integrations | Should be declared |
| `@playwright/test` | Browser testing | Should be optional dependency |
| `puppeteer` / `patchright` | Browser orchestration | Should be optional dependency |

### 1.6 @ruvector Native Module Health

**Status: HEALTHY with caveats.**

| Aspect | Status | Details |
|--------|--------|---------|
| musl-to-gnu aliases | Working | `npm:` aliases redirect musl platforms to gnu builds |
| Lazy loading | Correct | `gnn-wrapper.ts`, `attention-wrapper.ts` use `try/catch require()` |
| Platform binaries | 12 optional | Darwin (arm64, x64), Linux (arm64-gnu, x64-gnu), musl redirects |
| Version alignment | Consistent | attention@0.1.3, gnn@0.1.19, sona@0.1.5 across all platform variants |
| Outdated | Yes | attention 0.1.3 vs 0.1.31 (28 patch versions behind), gnn 0.1.19 vs 0.1.25 |

**Build script integration:** Both `build-cli.mjs` and `build-mcp.mjs` correctly handle native modules via the `nativeRequirePlugin` which intercepts imports and rewrites them to `createRequire()` calls, solving the Node.js 22+ ESM `legacyMainResolve` issue.

### 1.7 Dependency Weight Analysis

| Component | Size |
|-----------|------|
| `node_modules/` total | 1.4 GB |
| npm pack (compressed) | 10.6 MB |
| npm pack (unpacked) | 50.7 MB |
| Published files | 3,301 files |

**Heaviest Dependency Subtrees (estimated):**
- `@xenova/transformers`: ~200 MB (ONNX runtime, ML models)
- `better-sqlite3`: ~50 MB (native addon + prebuilds)
- `typescript`: ~80 MB (compiler, lazy-loaded)
- `@ruvector/*` native binaries: ~100 MB across platforms
- `hnswlib-node`: ~30 MB (native HNSW index)

---

## 2. Build System Analysis

### 2.1 Build Scripts Inventory

| Script | Purpose | Technology |
|--------|---------|------------|
| `npm run build` | Full build | `tsc` + CLI bundle + MCP bundle |
| `scripts/build-cli.mjs` | CLI bundle | esbuild (ESM, Node platform) |
| `scripts/build-mcp.mjs` | MCP bundle | esbuild (ESM, Node platform) |
| `tsc` | Type checking + declaration emit | TypeScript compiler |

**Build Pipeline:** `tsc` (type-check + emit JS/declarations/source maps) -> `build-cli.mjs` (esbuild bundle) -> `build-mcp.mjs` (esbuild bundle)

### 2.2 Build Output Analysis

| Output | Size | File Count |
|--------|------|------------|
| `dist/cli/bundle.js` | 9.5 MB | 1 (bundled) |
| `dist/mcp/bundle.js` | 10.5 MB | 1 (bundled) |
| tsc `.js` output (excluding bundles) | ~35 MB | ~1,080 files |
| `.d.ts` declaration files | (included above) | ~1,080 files |
| `.js.map` + `.d.ts.map` source maps | 3.8 MB | 2,152 files |
| **Total `dist/`** | **60 MB** | ~4,312 files |

**Comparison to v3.7.10:**
- dist/ size: 39 MB -> 60 MB (increased due to more source files)
- Source maps: 17 MB -> 3.8 MB (significantly reduced!)
- CLI bundle: 11 MB -> 9.5 MB (improved)
- MCP bundle: 11 MB -> 10.5 MB (improved)

**Largest dist/ subdirectories:**
| Directory | Size | Notes |
|-----------|------|-------|
| `dist/mcp/` | 15 MB | Includes 10.5 MB bundle |
| `dist/cli/` | 12 MB | Includes 9.5 MB bundle |
| `dist/domains/` | 11 MB | 13 bounded contexts |
| `dist/integrations/` | 4.6 MB | ruvector, browser, etc. |
| `dist/coordination/` | 3.9 MB | Queen, claims, consensus |
| `dist/adapters/` | 2.9 MB | A2A, AG-UI adapters |
| `dist/shared/` | 2.3 MB | Common utilities |

### 2.3 Bundle Configuration

**esbuild settings (both CLI and MCP):**

| Setting | Value | Assessment |
|---------|-------|------------|
| Format | ESM | Correct for `"type": "module"` |
| Platform | Node | Correct |
| Tree-shaking | Enabled (default) | Good |
| Minification | **Disabled** | Bundles are 9.5-10.5 MB; minification could reduce by 40-60% |
| Source maps | **Not generated** for bundles | No `//# sourceMappingURL` in bundles |
| Code splitting | Disabled | Single-file bundles |
| External (ESM) | fast-glob, yaml, commander, chalk, cli-progress, ora, express | Correct |
| External (Native) | 21 native modules via createRequire plugin | Correct |
| TypeScript lazy loading | Custom plugin | Excellent - prevents crash when typescript not installed |

### 2.4 Tree-Shaking Effectiveness

Tree-shaking is **partially effective**. The bundles are 9.5-10.5 MB each despite externalizing ~29 packages because:

1. **No minification** -- raw esbuild output includes whitespace, long variable names
2. **Large source base** -- 513K LOC feeds into the bundle
3. **Side-effect-ful modules** -- Many domain coordinators register themselves on import
4. **Shared barrel exports** -- `src/shared/index.ts`, `src/domains/*/index.ts` re-export everything

**Recommendation:** Enable `minify: true` in esbuild config to reduce bundle sizes by an estimated 40-60% (from 10 MB to ~4-5 MB each).

### 2.5 Source Map Generation

| Output | Source Maps | Notes |
|--------|------------|-------|
| tsc output | Yes (`.js.map`, `.d.ts.map`) | `"sourceMap": true`, `"declarationMap": true` in tsconfig |
| CLI bundle | **No** | No `sourcemap` option in build-cli.mjs |
| MCP bundle | **No** | No `sourcemap` option in build-mcp.mjs |

**Impact:** Stack traces from bundled code will reference the bundle file at opaque line numbers, making production debugging harder. Consider adding `sourcemap: 'linked'` to esbuild config.

---

## 3. TypeScript Configuration

### 3.1 Strict Mode Settings

| Setting | Value | Assessment |
|---------|-------|------------|
| `strict` | `true` | Enables all strict checks |
| `noImplicitAny` | `true` | No implicit `any` |
| `strictNullChecks` | `true` | Null safety enforced |
| `strictFunctionTypes` | `true` | Contravariant parameter types |
| `noImplicitReturns` | `true` | All paths must return |
| `noFallthroughCasesInSwitch` | `true` | Switch safety |
| `noUnusedLocals` | **`false`** | Dead code allowed |
| `noUnusedParameters` | **`false`** | Unused params allowed |
| `isolatedModules` | `true` | Safe for esbuild |
| `skipLibCheck` | `true` | Skips .d.ts checking |

**Assessment: EXCELLENT.** All meaningful strict checks are enabled. `noUnusedLocals` and `noUnusedParameters` being `false` is pragmatic for a large codebase with generated code.

### 3.2 Type Safety Escape Hatches

| Escape | Count | Change from v3.7.10 | Risk |
|--------|-------|---------------------|------|
| `@ts-ignore` | 0 | No change | None |
| `@ts-expect-error` | 0 | No change | None |
| `as unknown` | 141 | +5 | Medium |
| `as any` | 7 | No change | Low |
| `: any` explicit annotations | 39 | -2 | Low |

**Top files by type safety escapes:**

| File | `as unknown` | `: any` | Notes |
|------|-------------|---------|-------|
| `src/mcp/protocol-server.ts` | ~36 | 0 | MCP protocol requires dynamic typing |
| `src/integrations/ruvector/gnn-wrapper.ts` | 10 | 12 | Native FFI boundary |
| `src/integrations/ruvector/attention-wrapper.ts` | 2 | 6 | Native FFI boundary |
| `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 6 | 0 | Complex schema handling |

**Assessment:** Zero `@ts-ignore` and `@ts-expect-error` is excellent discipline. The `as unknown` casts are concentrated at FFI boundaries (ruvector wrappers) and protocol boundaries (MCP server), which is appropriate.

### 3.3 Type Coverage Estimation

| Metric | Value |
|--------|-------|
| Total source files | 1,083 |
| Files with `: any` | ~17 |
| Files with `as unknown` | ~50 |
| Files with zero type escapes | ~1,010 (~93%) |

**Estimated type coverage: >95%.** The vast majority of code is fully typed with no escape hatches.

### 3.4 Files Exceeding 500-Line Guideline

**25 files exceed 1,000 lines** (project guideline is 500 max):

| File | Lines | Module |
|------|-------|--------|
| `src/learning/qe-reasoning-bank.ts` | 1,941 | learning |
| `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 | domains |
| `src/domains/contract-testing/services/contract-validator.ts` | 1,824 | domains |
| `src/domains/test-generation/services/pattern-matcher.ts` | 1,769 | domains |
| `src/domains/learning-optimization/coordinator.ts` | 1,750 | domains |
| `src/cli/completions/index.ts` | 1,730 | cli |
| `src/coordination/mincut/time-crystal.ts` | 1,714 | coordination |
| `src/cli/commands/hooks.ts` | 1,702 | cli |
| `src/domains/chaos-resilience/coordinator.ts` | 1,701 | domains |

These files are 3-4x the recommended limit and should be candidates for decomposition.

---

## 4. Package Distribution

### 4.1 npm pack Analysis

| Metric | Value | Change from v3.7.10 |
|--------|-------|---------------------|
| Package name | `agentic-qe` | -- |
| Version | 3.7.14 | +0.0.4 |
| Packed size | 10.6 MB | -2.1 MB (improved) |
| Unpacked size | 50.7 MB | -12.5 MB (improved) |
| Total files | 3,301 | -2,164 files (improved) |

**Significant improvement in package size!**

### 4.2 Published File Breakdown

| Category | File Count | Notes |
|----------|-----------|-------|
| `dist/` | ~4,312 | JS, declarations, source maps, bundles |
| `.claude/` | ~750 | Agents, skills, commands, helpers |
| `assets/` | ~385 | Agent definitions for distribution |
| `scripts/` | ~175 | Build, validation, utility scripts |
| Other (README, CHANGELOG, LICENSE, package.json) | ~4 | Standard files |

### 4.3 Package Optimization Results

The package optimization from v3.7.10 to v3.7.14 shows significant improvements:

| Metric | v3.7.10 | v3.7.14 | Change |
|--------|---------|---------|--------|
| Packed size | 12.7 MB | 10.6 MB | -16.5% |
| Unpacked size | 63.2 MB | 50.7 MB | -19.8% |
| File count | 5,465 | 3,301 | -39.6% |

**This represents a significant improvement in package distribution efficiency.**

### 4.4 Binary/Executable Setup

| Binary | Path | Shebang |
|--------|------|---------|
| `agentic-qe` | `./dist/cli/bundle.js` | Preserved from source |
| `aqe` | `./dist/cli/bundle.js` | Preserved from source |
| `aqe-v3` | `./dist/cli/bundle.js` | Preserved from source |
| `aqe-mcp` | `./dist/mcp/bundle.js` | Added via banner |

**Assessment:** Correct. All four binaries point to bundled entry points with proper shebangs.

---

## 5. Circular Dependency Detection

**15 circular dependency chains detected** (unchanged from v3.7.10).

### 5.1 Cross-Module Circulars (HIGH impact)

| # | Cycle | Impact |
|---|-------|--------|
| 1 | `coordination/queen-integration` -> `coordination/queen-coordinator` -> back | Queen orchestration may have initialization order issues |
| 2 | `mcp/handlers/core-handlers` -> `mcp/handlers/domain-handlers` -> `mcp/handlers/handler-factory` -> back | MCP handler registration loop |
| 3 | `domains/test-execution/interfaces` -> `types/index` -> back | Type-level circular (may cause incomplete types at compile time) |

### 5.2 Intra-Module Circulars (MEDIUM impact)

| # | Cycle | Notes |
|---|-------|-------|
| 4 | `coordination/claim-verifier/index` <-> `coordination/verifiers/file-verifier` | Mutual dependency in claim verification |
| 5 | `coordination/claim-verifier/index` <-> `coordination/verifiers/output-verifier` | Same pattern |
| 6 | `coordination/claim-verifier/claim-verifier-service` -> `verifiers/file-verifier` -> `claim-verifier/index` -> back | 3-node cycle in claims |

### 5.3 Self-Referencing Modules (LOW impact, likely type-only)

| # | Module | Notes |
|---|--------|-------|
| 7-15 | Various modules | Self-imports (likely barrel re-exports) |

### 5.4 Circular Dependency Impact Assessment

- **Tree-shaking:** Circular dependencies prevent esbuild from fully tree-shaking dead code in the affected modules, contributing to the 9.5-10.5 MB bundle size
- **Startup time:** Node.js handles circular ESM imports by providing incomplete module objects
- **The MCP handler cycle (#2)** is the highest risk because it involves the handler factory pattern

---

## 6. Internal Dependency Graph (Module Level)

### 6.1 Cross-Module Import Analysis

**245+ unique cross-module import edges** across the codebase.

**Top 10 most-imported-from modules (Afferent Coupling -- Ca):**

| Module | Inbound Imports | Role |
|--------|----------------|------|
| `shared` | 427+ | Utility foundation |
| `coordination` | 61+ | Orchestration layer |
| `integrations` | 52+ | External system adapters |
| `kernel` | 37+ | Core infrastructure |
| `types` | 26+ | Type definitions |

**Top 10 heaviest importers (Efferent Coupling -- Ce):**

| Module | Outbound Imports | Assessment |
|--------|-----------------|------------|
| `domains` | 656+ | Expected: 13 bounded contexts |
| `mcp` | 117+ | Bridges all domains |
| `coordination` | 130+ | Coordinates across modules |
| `integrations` | 100+ | Wraps external libs |
| `learning` | 48+ | ML/pattern system |

### 6.2 Coupling Metrics

| Module | Ca (Afferent) | Ce (Efferent) | I (Instability) | Risk |
|--------|--------------|---------------|-----------------|------|
| `shared` | 427 | 19 | 0.04 | LOW -- stable foundation |
| `kernel` | 37 | 19 | 0.34 | LOW -- appropriately stable |
| `types` | 26 | 0 | 0.00 | LOW -- pure type definitions |
| `coordination` | 61 | 130 | 0.68 | MEDIUM -- high coupling both ways |
| `domains` | 0 | 656 | 1.00 | Expected -- leaf layer |
| `mcp` | 0 | 117 | 1.00 | Expected -- adapter layer |
| `integrations` | 52 | 100 | 0.66 | MEDIUM -- bridge layer |

**Assessment:** The dependency direction follows Clean Architecture principles well.

### 6.3 Package Exports (Public API)

```json
{
  ".": "dist/index.js",
  "./kernel": "dist/kernel/index.js",
  "./shared": "dist/shared/index.js",
  "./cli": "dist/cli/index.js",
  "./ruvector": "dist/integrations/ruvector/wrappers.js",
  "./sync": "dist/sync/index.js",
  "./governance": "dist/governance/index.js"
}
```

**7 public entry points.** Well-scoped for a DDD architecture.

---

## 7. ESM/CJS Interop Analysis

### 7.1 Module System

| Aspect | Status | Notes |
|--------|--------|-------|
| Package type | `"type": "module"` | Full ESM |
| Build scripts | `.mjs` extension | Correct for ESM |
| Utility scripts | `.cjs` extension | Correct for CJS |
| tsconfig module | `ESNext` | Correct |
| tsconfig moduleResolution | `bundler` | Correct for esbuild |

### 7.2 Dynamic Require Usage

The codebase uses `require()` in specific cases:
- **init/phases/** -- Synchronous filesystem operations during project initialization
- **test-generation/** -- Template code generation (generates CommonJS test code)
- **coordination/consensus/** -- Lazy loading of provider modules
- **integrations/ruvector/** -- Native module loading via `createRequire`

All dynamic `require()` usage is intentional and handled correctly by the build system.

---

## 8. Comparison with v3.7.10

### 8.1 Improvements Since v3.7.10

| Metric | v3.7.10 | v3.7.14 | Status |
|--------|---------|---------|--------|
| Package size (packed) | 12.7 MB | 10.6 MB | **Improved -16.5%** |
| Package size (unpacked) | 63.2 MB | 50.7 MB | **Improved -19.8%** |
| File count | 5,465 | 3,301 | **Improved -39.6%** |
| CLI bundle size | 11 MB | 9.5 MB | **Improved -13.6%** |
| MCP bundle size | 11 MB | 10.5 MB | **Improved -4.5%** |
| Source map size | 17 MB | 3.8 MB | **Improved -77.6%** |
| Source files | 1,077 | 1,083 | +6 files |
| Lines of code | 510,655 | 513,351 | +2,696 lines |
| Production deps | 24 | 23 | -1 dep |
| Type escapes (as unknown) | 136 | 141 | +5 |
| Type escapes (: any) | 41 | 39 | -2 |

### 8.2 Unchanged Issues

- **ESLint vulnerabilities:** Still 6 HIGH severity in devDependencies
- **Outdated packages:** Similar count (22 vs 20)
- **Circular dependencies:** Still 15 detected
- **Large files:** Still 20+ files exceeding 1,000 lines
- **No bundle minification:** Still disabled
- **No bundle source maps:** Still not generated

---

## 9. Recommendations

### P0 -- Critical (Do Before Next Release)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 1 | `@claude-flow/guidance` usage | Verify 54 imports are intentional | Clean dependency tree |
| 2 | ESLint toolchain vulnerabilities (6 HIGH) | Upgrade `@typescript-eslint/*` to v8+ and `eslint` to v9+ | Resolves all 6 advisories |

### P1 -- High (Plan for Next Sprint)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 3 | 9.5-10.5 MB bundle sizes | Add `minify: true` to esbuild config | ~50% size reduction |
| 4 | MCP handler circular dependency | Refactor handler-factory to break the cycle | Prevents initialization bugs |
| 5 | No source maps in bundles | Add `sourcemap: 'linked'` to esbuild | Better production debugging |
| 6 | Queen coordinator circular | Extract shared interface to break cycle | Cleaner architecture |

### P2 -- Medium (Track in Backlog)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 7 | 175 scripts in package | Filter `files` to include only runtime scripts | ~2 MB package reduction |
| 8 | 25 files over 1,000 lines | Decompose per 500-line guideline | Maintainability |
| 9 | `@ruvector/*` 28 patches behind | Upgrade attention 0.1.3->0.1.31, gnn 0.1.19->0.1.25 | Bug fixes, perf |
| 10 | `uuid` 4 major versions behind | Evaluate upgrade from v9 to v13 | Smaller, faster |
| 11 | 9 self-referencing circular imports | Clean up barrel re-exports | Minor tree-shaking improvement |
| 12 | `protocol-server.ts` has 36 `as unknown` | Consider typed MCP protocol interfaces | Type safety at MCP boundary |

### P3 -- Low (Nice to Have)

| # | Issue | Action |
|---|-------|--------|
| 13 | `noUnusedLocals`/`noUnusedParameters` disabled | Enable incrementally with per-file overrides |
| 14 | Missing optional peer deps (`ws`, `express`, `@playwright/test`) | Declare as `peerDependencies` with `optional: true` |
| 15 | `vibium` massive version gap (0.1.8 vs 26.3.9) | Evaluate if intentional pin or needs update |

---

## 10. Dependency Graph Visualization (Text)

```
                    +---------+
                    |  types  |  I=0.00
                    +----+----+
                         |
                    +----v----+
                    | shared  |  I=0.04
                    +----+----+
                         |
              +----------+----------+
              |                     |
         +----v----+          +----v----+
         | kernel  |  I=0.34  | logging |
         +----+----+          +---------+
              |
    +---------+---------+
    |         |         |
+---v---+ +--v---+ +---v----------+
|domains| | mcp  | |coordination  |  I=0.68
|I=1.00 | |I=1.00| +---+----------+
+---+---+ +--+---+     |
    |         |    +----v---------+
    |         |    |integrations  |  I=0.66
    |         |    +--------------+
    |         |
+---v---+ +--v----+
|  cli  | |learning|
|I=1.00 | |I=1.00  |
+-------+ +--------+
```

---

## Appendix A: Resolutions and Overrides

The project uses npm `overrides` to pin transitive dependencies:

| Override | Target Version | Reason |
|----------|---------------|--------|
| `@ruvector/gnn-linux-x64-musl` | `npm:@ruvector/gnn-linux-x64-gnu@0.1.19` | musl-to-gnu redirect |
| `@ruvector/gnn-linux-arm64-musl` | `npm:@ruvector/gnn-linux-arm64-gnu@0.1.19` | musl-to-gnu redirect |
| `tar` | `>=7.5.7` | Security fix |
| `markdown-it` | `>=14.1.1` | Security fix |

Additionally, `resolutions` (Yarn-compatible) pins:
- `graceful-fs` >= 4.2.11
- `stack-utils` >= 2.0.6
- `tar` >= 7.5.7

**Assessment:** These overrides are well-documented and address known security issues. The musl-to-gnu redirects are a clever workaround for native module compatibility.

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

*Report generated by QE Dependency Mapper v3 for AQE v3.7.14*
*Analysis scope: 1,083 source files, 513,351 lines of TypeScript, 53 direct dependencies, 1,173 transitive dependencies*
