# AQE v3.7.10 - Dependency & Build Health Report

**Report Date:** 2026-03-06
**Analyzer:** QE Dependency Mapper (V3)
**Scope:** Full project dependency graph, build system, TypeScript config, package distribution

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Production Dependencies | 24 direct | Moderate |
| Dev Dependencies | 16 direct | Healthy |
| Optional Dependencies | 13 (native platform binaries) | Healthy |
| Transitive Dependencies | 1,173 total installed | Heavy |
| Known Vulnerabilities | 6 high (all in eslint toolchain) | Action Needed |
| Outdated Packages | 22 | Action Needed |
| Circular Dependencies | 15 detected | Action Needed |
| Bundle Size (CLI) | 11 MB | Heavy |
| Bundle Size (MCP) | 11 MB | Heavy |
| Total dist/ Size | 39 MB (+ 17 MB source maps) | Heavy |
| Package Size (packed) | 12.7 MB / 63.2 MB unpacked | Heavy |
| TypeScript Strict Mode | Enabled (all strict flags) | Excellent |
| Type Safety Escapes | 136 `as unknown` + 7 `as any` + 41 `: any` | Acceptable |
| Source Files | 1,077 TypeScript files | N/A |
| Total Source Lines | ~510,655 | N/A |

**Overall Health Grade: B-** -- Strong type safety, good build tooling, but heavy bundles, several misplaced dependencies, and unresolved circular imports need attention.

---

## 1. Dependency Health

### 1.1 Dependency Count Summary

| Category | Count | Weight |
|----------|-------|--------|
| Production (`dependencies`) | 24 | Users must install these |
| Development (`devDependencies`) | 16 | Build/test only |
| Optional (`optionalDependencies`) | 13 | Platform-specific native binaries |
| Transitive (all installed) | 1,173 | Full dependency tree |
| `node_modules/` size | 1.4 GB | Disk footprint |

### 1.2 Outdated Dependencies

**22 outdated packages detected.** Sorted by severity:

#### Major Version Behind (Breaking Changes Available)

| Package | Current | Latest | Gap |
|---------|---------|--------|-----|
| `@typescript-eslint/eslint-plugin` | 6.21.0 | 8.56.1 | 2 major |
| `@typescript-eslint/parser` | 6.21.0 | 8.56.1 | 2 major |
| `eslint` | 8.57.1 | 10.0.2 | 2 major |
| `uuid` | 9.0.1 | 13.0.0 | 4 major |
| `commander` | 12.1.0 | 14.0.3 | 2 major |
| `vibium` | 0.1.8 | 26.2.28 | 26 major |
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
| `@faker-js/faker` (^10.2.0) | Test data generator, used only in test-generation templates | Adds ~8 MB to user install |

`typescript` is listed in `dependencies` but is only needed at build time. Moving it to `devDependencies` would reduce install weight significantly.

`@faker-js/faker` is imported in 8 test-generation generator files (`src/domains/test-generation/generators/`) and `src/domains/test-generation/services/test-data-generator.ts`. These generate test code templates that reference faker, but the faker library itself is only needed if the generated tests are executed. Consider making it a peer dependency or documenting it as an optional runtime dependency.

#### Unused Dependencies (Zero Imports in Source)

| Package | Category | Notes |
|---------|----------|-------|
| `@claude-flow/guidance` | production | Never imported -- phantom dependency |
| `vibium` | production | Zero direct imports (used via lazy `require` in wrappers) |
| `pg` | production | Zero direct imports (used via dynamic `require` in sync module) |
| `axe-core` | production | Zero direct imports (loaded dynamically at runtime) |

**Note:** `vibium`, `pg`, and `axe-core` may be loaded dynamically at runtime. `@claude-flow/guidance` appears to be entirely unused and should be removed.

### 1.5 Missing Dependencies (Imported but Not Declared)

Most of these are path aliases (`@shared/*`, `@kernel/*`, etc.) resolved by tsconfig paths and esbuild, not actual npm packages. Genuine missing packages used in specialized code:

| Package | Used In | Assessment |
|---------|---------|------------|
| `express` | CLI/MCP handlers | Should be optional/peer dependency |
| `ws` | WebSocket integrations | Should be declared |
| `@playwright/test` | Browser testing | Should be optional dependency |
| `puppeteer` / `patchright` | Browser orchestration | Should be optional dependency |
| `k6` | Load testing | Template-only, not runtime |
| `chai` / `sinon` / `testcafe` | Test generation templates | Template-only, not runtime |

### 1.6 @ruvector Native Module Health

**Status: HEALTHY with caveats.**

| Aspect | Status | Details |
|--------|--------|---------|
| musl-to-gnu aliases | Working | `npm:` aliases redirect musl platforms to gnu builds |
| Lazy loading | Correct | `gnn-wrapper.ts` (10 `as unknown`), `attention-wrapper.ts` (6 `as unknown`) use `try/catch require()` |
| Platform binaries | 12 optional | Darwin (arm64, x64), Linux (arm64-gnu, x64-gnu), musl redirects |
| Version alignment | Consistent | attention@0.1.3, gnn@0.1.19, sona@0.1.5 across all platform variants |
| Outdated | Yes | attention 0.1.3 vs 0.1.31 (28 patch versions behind), gnn 0.1.19 vs 0.1.25 |

**Build script integration:** Both `build-cli.mjs` and `build-mcp.mjs` correctly handle native modules via the `nativeRequirePlugin` which intercepts imports and rewrites them to `createRequire()` calls, solving the Node.js 22+ ESM `legacyMainResolve` issue.

### 1.7 Dependency Weight Analysis

| Component | Size |
|-----------|------|
| `node_modules/` total | 1.4 GB |
| npm pack (compressed) | 12.7 MB |
| npm pack (unpacked) | 63.2 MB |
| Published files | 5,465 files |

**Heaviest Dependency Subtrees (estimated):**
- `@xenova/transformers`: ~200 MB (ONNX runtime, ML models)
- `better-sqlite3`: ~50 MB (native addon + prebuilds)
- `typescript`: ~80 MB (compiler, not needed at runtime)
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
| `dist/cli/bundle.js` | 11 MB | 1 (bundled) |
| `dist/mcp/bundle.js` | 11 MB | 1 (bundled) |
| tsc `.js` output (excluding bundles) | 16 MB | ~1,070 files |
| `.d.ts` declaration files | (included in 16 MB) | ~1,070 files |
| `.js.map` + `.d.ts.map` source maps | 17 MB | ~2,140 files |
| **Total `dist/`** | **39 MB** | **~4,282 files** |

**Largest dist/ subdirectories:**
| Directory | Size | Notes |
|-----------|------|-------|
| `dist/mcp/` | 14 MB | Includes 11 MB bundle |
| `dist/cli/` | 13 MB | Includes 11 MB bundle |
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
| Minification | **Disabled** | Bundles are 11 MB each; minification could reduce by 40-60% |
| Source maps | **Not generated** for bundles | No `//# sourceMappingURL` in bundles |
| Code splitting | Disabled | Single-file bundles |
| External (ESM) | typescript, fast-glob, yaml, commander, chalk, cli-progress, ora | Correct |
| External (Native) | 21 native modules via createRequire plugin | Correct |

### 2.4 Tree-Shaking Effectiveness

Tree-shaking is **partially effective**. The bundles are 11 MB each despite externalizing ~29 packages because:

1. **No minification** -- raw esbuild output includes whitespace, long variable names
2. **Large source base** -- 510K LOC feeds into the bundle
3. **Side-effect-ful modules** -- Many domain coordinators register themselves on import
4. **Shared barrel exports** -- `src/shared/index.ts`, `src/domains/*/index.ts` re-export everything

**Recommendation:** Enable `minify: true` in esbuild config to reduce bundle sizes by an estimated 40-60% (from 11 MB to ~5 MB each).

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

| Escape | Count | Risk |
|--------|-------|------|
| `@ts-ignore` | 0 | None |
| `@ts-expect-error` | 0 | None |
| `as unknown` | 136 (across 50 files) | Medium |
| `as any` | 7 | Low |
| `: any` explicit annotations | 41 | Low |

**Top files by type safety escapes:**

| File | `as unknown` | `: any` | Notes |
|------|-------------|---------|-------|
| `src/mcp/protocol-server.ts` | 36 | 0 | MCP protocol requires dynamic typing |
| `src/integrations/ruvector/gnn-wrapper.ts` | 10 | 12 | Native FFI boundary |
| `src/integrations/ruvector/attention-wrapper.ts` | 2 | 6 | Native FFI boundary |
| `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 6 | 0 | Complex schema handling |

**Assessment:** Zero `@ts-ignore` and `@ts-expect-error` is excellent discipline. The `as unknown` casts are concentrated at FFI boundaries (ruvector wrappers) and protocol boundaries (MCP server), which is appropriate. The `protocol-server.ts` file with 36 `as unknown` casts warrants review for potential interface improvements.

### 3.3 Type Coverage Estimation

| Metric | Value |
|--------|-------|
| Total source files | 1,077 |
| Files with `: any` | 17 |
| Files with `as unknown` | 50 |
| Files with `as any` | ~7 |
| Files with zero type escapes | ~1,003 (~93%) |

**Estimated type coverage: >95%.** The vast majority of code is fully typed with no escape hatches.

### 3.4 Files Exceeding 500-Line Guideline

**20 files exceed 1,000 lines** (project guideline is 500 max):

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

| Metric | Value |
|--------|-------|
| Package name | `agentic-qe` |
| Version | 3.7.10 |
| Packed size | 12.7 MB |
| Unpacked size | 63.2 MB |
| Total files | 5,465 |

### 4.2 Published File Breakdown

| Category | File Count | Notes |
|----------|-----------|-------|
| `dist/` | 4,282 | JS, declarations, source maps, bundles |
| `.claude/` | 750 | Agents, skills, commands, helpers |
| `assets/` | 385 | Agent definitions for distribution |
| `scripts/` | 175 | Build, validation, utility scripts |
| Other (README, CHANGELOG, LICENSE, package.json) | ~4 | Standard files |

### 4.3 Unnecessary Files in Package

| Issue | Files | Impact |
|-------|-------|--------|
| tsc output (non-bundle `.js` + `.d.ts`) | ~2,140 | These are redundant since CLI/MCP are bundled; only needed for library consumers |
| Source maps (`.js.map`, `.d.ts.map`) | ~2,140 | 17 MB of source maps shipped to users |
| `scripts/` directory | 175 files | Many are dev-only scripts (eval, benchmarks, migrations) |
| `.claude/` directory | 750 files | Agent/skill definitions -- intentional for `aqe init` |

**Recommendations:**
1. Consider excluding source maps from the package (`!dist/**/*.map` in `files`) to save ~4 MB packed / ~17 MB unpacked
2. Filter `scripts/` to only include runtime-necessary scripts (preinstall, postinstall, sync-agents, prepare-assets)
3. The tsc output is needed for library API consumers (`import from 'agentic-qe/kernel'`), so it must stay

### 4.4 Binary/Executable Setup

| Binary | Path | Shebang |
|--------|------|---------|
| `agentic-qe` | `./dist/cli/bundle.js` | `#!/usr/bin/env node` |
| `aqe` | `./dist/cli/bundle.js` | `#!/usr/bin/env node` |
| `aqe-v3` | `./dist/cli/bundle.js` | `#!/usr/bin/env node` |
| `aqe-mcp` | `./dist/mcp/bundle.js` | `#!/usr/bin/env node` |

**Assessment:** Correct. All four binaries point to bundled entry points with proper shebangs. Three aliases (`agentic-qe`, `aqe`, `aqe-v3`) for the CLI provides backward compatibility.

---

## 5. Circular Dependency Detection

**15 circular dependency chains detected.**

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
| 7 | `integrations/coherence/wasm-loader` | Self-import (likely barrel re-export) |
| 8 | `coordination/mincut/shared-singleton` | Self-import |
| 9 | `integrations/vibium/feature-flags` | Self-import |
| 10 | `integrations/ruvector/feature-flags` | Self-import |
| 11 | `integrations/ruvector/hypergraph-engine` | Self-import |
| 12 | `integrations/ruvector/hypergraph-schema` | Self-import |
| 13 | `learning/token-tracker` | Self-import |
| 14 | `logging/index` | Self-import |
| 15 | `test-scheduling/pipeline` | Self-import |

### 5.4 Circular Dependency Impact Assessment

- **Tree-shaking:** Circular dependencies prevent esbuild from fully tree-shaking dead code in the affected modules, contributing to the 11 MB bundle size
- **Startup time:** Node.js handles circular ESM imports by providing incomplete module objects, which can cause subtle runtime bugs where imported values are `undefined` at call time
- **The MCP handler cycle (#2)** is the highest risk because it involves the handler factory pattern -- if initialization order changes, tools may fail to register

---

## 6. Internal Dependency Graph (Module Level)

### 6.1 Cross-Module Import Analysis

**245 unique cross-module import edges** across the codebase.

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
| `learning` | 0 | 48 | 1.00 | Expected -- feature layer |
| `cli` | 0 | 50 | 1.00 | Expected -- presentation layer |

**Assessment:** The dependency direction follows Clean Architecture principles well: `domains` and `cli` are fully unstable (depend outward, nothing depends on them), while `shared` and `types` are highly stable (depended upon, depend on little). The `coordination` module has the highest bidirectional coupling, which is expected for an orchestration layer but should be monitored.

### 6.3 Package Exports (Public API)

```json
{
  ".": "dist/index.js",
  "./kernel": "dist/kernel/index.js",
  "./shared": "dist/shared/index.js",
  "./cli": "dist/cli/index.js",
  "./ruvector": "dist/integrations/ruvector/wrappers.js",
  "./sync": "dist/sync/index.js"
}
```

**6 public entry points.** Well-scoped for a DDD architecture. Consumers can import the full API, kernel subsystem, shared utilities, or specific integrations without pulling in everything.

---

## 7. Recommendations

### P0 -- Critical (Do Before Next Release)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 1 | `typescript` in production deps | Move to `devDependencies` | Saves ~80 MB on user install |
| 2 | `@claude-flow/guidance` phantom dep | Remove from `dependencies` | Clean dependency tree |
| 3 | ESLint toolchain vulnerabilities (6 HIGH) | Upgrade `@typescript-eslint/*` to v8+ and `eslint` to v9+ | Resolves all 6 advisories |

### P1 -- High (Plan for Next Sprint)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 4 | 11 MB bundle sizes | Add `minify: true` to esbuild config | ~50% size reduction |
| 5 | `@faker-js/faker` in prod deps | Move to `devDependencies` or `peerDependencies` | Saves ~8 MB |
| 6 | MCP handler circular dependency | Refactor handler-factory to break the cycle | Prevents initialization bugs |
| 7 | No source maps in bundles | Add `sourcemap: 'linked'` to esbuild | Better production debugging |
| 8 | Queen coordinator circular | Extract shared interface to break `queen-integration` <-> `queen-coordinator` cycle | Cleaner architecture |

### P2 -- Medium (Track in Backlog)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 9 | 175 scripts in package | Filter `files` to include only runtime scripts | ~2 MB package reduction |
| 10 | Source maps shipped in package | Add `!dist/**/*.map` exclusion pattern | ~4 MB packed size reduction |
| 11 | 20 files over 1,000 lines | Decompose per 500-line guideline | Maintainability |
| 12 | `@ruvector/*` 28 patches behind | Upgrade attention 0.1.3->0.1.31, gnn 0.1.19->0.1.25 | Bug fixes, perf |
| 13 | `uuid` 4 major versions behind | Evaluate upgrade from v9 to v13 | Smaller, faster |
| 14 | 9 self-referencing circular imports | Clean up barrel re-exports | Minor tree-shaking improvement |
| 15 | `protocol-server.ts` has 36 `as unknown` | Consider typed MCP protocol interfaces | Type safety at MCP boundary |

### P3 -- Low (Nice to Have)

| # | Issue | Action |
|---|-------|--------|
| 16 | `noUnusedLocals`/`noUnusedParameters` disabled | Enable incrementally with per-file overrides |
| 17 | Missing optional peer deps (`ws`, `express`, `@playwright/test`) | Declare as `peerDependencies` with `optional: true` |
| 18 | `vibium` massive version gap (0.1.8 vs 26.2.28) | Evaluate if intentional pin or needs update |

---

## 8. Dependency Graph Visualization (Text)

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

*Report generated by QE Dependency Mapper v3 for AQE v3.7.10*
*Analysis scope: 1,077 source files, 510,655 lines of TypeScript, 53 direct dependencies, 1,173 transitive dependencies*
