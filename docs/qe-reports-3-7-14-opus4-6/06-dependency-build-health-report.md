# Dependency & Build Health Report -- AQE v3.7.14

**Report ID**: AQE-DEP-2026-03-09
**Analyzer**: QE Dependency Mapper (Opus 4.6)
**Date**: 2026-03-09
**Scope**: Full dependency graph, build system, bundle analysis, vulnerability audit
**Baseline**: v3.7.10 (Grade B-)

---

## Executive Summary

| Category | v3.7.10 | v3.7.14 | Delta |
|---|---|---|---|
| **Overall Grade** | **B-** | **B** | Improved |
| Production dep misclassification | 2 critical | 1 resolved, 1 remaining | Partial fix |
| Phantom dependencies | 1 (`@claude-flow/guidance`) | 0 (now lazily loaded) | Fixed |
| Bundle sizes (CLI/MCP) | ~11 MB each | 9.6 MB / 11 MB | Improved (CLI) |
| Minification | None | None | No change |
| Circular dependency chains | 15 | 53 (module-level) | Regression |
| Known vulnerabilities | 0 production | 0 production, 6 dev-only | Clean prod |
| Package file count | 5473 | 3301 | 40% reduction |
| Package size (packed) | N/A baseline | 10.6 MB | Measured |

**Grade: B** -- Meaningful progress on key v3.7.10 findings (`typescript` moved to devDependencies, phantom guidance dep resolved, package file count reduced by 40%). Two significant regressions remain: `@faker-js/faker` is still in production dependencies and circular dependency chains have grown substantially. No minification is applied to the 9.6 MB and 11 MB bundles, leaving approximately 30-40% size savings on the table.

---

## 1. Dependency Analysis

### 1.1 Production Dependencies (22 direct)

| Package | Version | Installed Size | Notes |
|---|---|---|---|
| `@xenova/transformers` | 2.17.2 | 68 MB | ML inference engine -- heaviest dep |
| `better-sqlite3` | 12.6.2 | 12 MB | Native addon, core data layer |
| `@faker-js/faker` | 10.3.0 | 5.3 MB | **ISSUE: Test data lib in prod deps** |
| `axe-core` | 4.11.1 | 2.9 MB | Accessibility testing engine |
| `@claude-flow/guidance` | 3.0.0-alpha.1 | 2.8 MB | Governance integration (lazy-loaded) |
| `yaml` | 2.8.2 | 1.3 MB | YAML parsing |
| `hnswlib-node` | 3.0.0 | 1.1 MB | HNSW vector search (native) |
| `jose` | 6.1.3 | 504 KB | JWT/JWE/JWS crypto |
| `uuid` | 9.0.1 | 348 KB | UUID generation |
| `fast-glob` | 3.3.3 | 296 KB | File pattern matching |
| `prime-radiant-advanced-wasm` | 0.1.3 | 288 KB | WASM computation module |
| `vibium` | 0.1.8 | 248 KB | Browser automation |
| `fast-json-patch` | 3.1.1 | 228 KB | RFC 6902 JSON Patch |
| `commander` | 12.1.0 | 228 KB | CLI framework |
| `pg` | 8.19.0 | 152 KB | PostgreSQL client |
| `cli-progress` | 3.12.0 | 116 KB | Progress bar display |
| `ora` | 9.3.0 | 108 KB | Terminal spinner |
| `secure-json-parse` | 4.1.0 | 104 KB | Safe JSON parsing |
| `chalk` | 5.6.2 | 72 KB | Terminal colors |
| `@ruvector/attention` | 0.1.3 | native | Neural attention (native addon) |
| `@ruvector/gnn` | 0.1.19 | native | Graph neural network (native addon) |
| `@ruvector/rvf-node` | 0.1.7 | native | RVF solver (native addon) |
| `@ruvector/sona` | 0.1.5 | native | Audio/signal processing (native) |

**Total @ruvector subtree**: 32 MB (includes platform-specific binaries)

### 1.2 v3.7.10 Finding Status

#### FIXED: `typescript` moved to devDependencies
In v3.7.10, `typescript` (23 MB installed) was listed under `dependencies`. It is now correctly in `devDependencies`. The build scripts use an esbuild plugin (`typescriptLazyPlugin`) that:
- Keeps `typescript` external (not bundled)
- Generates a virtual module using `createRequire()` for lazy loading
- Provides a Proxy-based fallback with a helpful error when TypeScript is unavailable at runtime

This is a well-architected solution that eliminates the 80 MB install-time penalty for end users while preserving code analysis functionality when TypeScript is available.

#### FIXED: `@claude-flow/guidance` phantom dependency
In v3.7.10, `@claude-flow/guidance` was flagged as declared but never imported. This has been properly resolved in v3.7.14:
- All usage is via `type ... = import(...)` syntax (compile-time only, erased at runtime)
- Runtime loading uses `await import(/* @vite-ignore */ modulePath)` wrapped in try/catch
- If the package is unavailable, the code falls back gracefully to local implementations
- The package (2.8 MB) is still listed in `dependencies`, but this is now intentional -- it provides governance features when available

#### NOT FIXED: `@faker-js/faker` in production dependencies
`@faker-js/faker` (5.3 MB installed) remains in `dependencies`. It is used in 8 source files, all within `src/domains/test-generation/`:

| File | Import |
|---|---|
| `services/test-data-generator.ts` | `Faker, faker, allLocales, base, en` |
| `generators/base-test-generator.ts` | `faker` |
| `generators/xunit-generator.ts` | `faker` |
| `generators/go-test-generator.ts` | `faker` |
| `generators/kotlin-junit-generator.ts` | `faker` |
| `generators/junit5-generator.ts` | `faker` |
| `generators/pytest-generator.ts` | `faker` |
| `generators/swift-testing-generator.ts` | `faker` |

**Impact**: Since `@faker-js/faker` is used at runtime (for generating realistic test data in QE-generated tests), this is a legitimate runtime dependency. However, the 5.3 MB size cost is significant. The team should evaluate whether this dependency can be made optional or whether a lighter-weight alternative exists for the test data generation use case.

**Verdict**: Reclassified from "misplaced" to "legitimate but heavyweight". The test-generation domain requires realistic data, but lazy-loading (similar to the `typescript` pattern) could reduce cold-start impact for users who do not use test generation features.

### 1.3 Optional Dependencies (12 packages)

All 12 optional dependencies are `@ruvector/*` platform-specific native binaries plus `@claude-flow/browser`. The musl-to-gnu aliasing pattern (`npm:@ruvector/gnn-linux-x64-gnu@0.1.19`) is correctly configured with matching `overrides` entries to prevent npm arborist semver crashes.

### 1.4 DevDependencies (12 packages)

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^5.9.3 | Language compiler |
| `vitest` | ^4.0.16 | Test runner |
| `@vitest/coverage-v8` | ^4.0.16 | Coverage reporting |
| `esbuild` | ^0.27.2 | Bundler |
| `eslint` | ^8.55.0 | Linter |
| `@typescript-eslint/*` | ^6.13.0 | TS ESLint rules |
| `tsx` | ^4.21.0 | TypeScript execution |
| `msw` | ^2.12.7 | Mock Service Worker |
| `dotenv` | ^17.2.3 | Environment config |
| `glob` | ^13.0.0 | File globbing |
| `@types/*` | various | Type definitions |

### 1.5 Transitive Dependencies

- **Direct production**: 22 packages (+ 12 optional)
- **Total transitive (production)**: ~1,839 entries in dependency tree
- **Total transitive (all)**: Approximately 2,500+ (including dev)

---

## 2. Vulnerability Report

### 2.1 npm audit Summary

| Severity | Count | Scope |
|---|---|---|
| Critical | 0 | -- |
| High | 6 | DevDependencies only |
| Moderate | 0 | -- |
| Low | 0 | -- |
| Info | 0 | -- |

### 2.2 High Severity Details (All Dev-Only)

All 6 high-severity vulnerabilities trace to `minimatch` via the `@typescript-eslint/*` toolchain:

| Advisory | Package | Description | Fix |
|---|---|---|---|
| GHSA-3ppc-4f35-3m26 | minimatch | ReDoS via repeated wildcards | Upgrade `@typescript-eslint/*` to v8+ |
| GHSA-7r86-cg39-jmmj | minimatch | ReDoS via GLOBSTAR segments | Same |
| GHSA-23c5-xmqv-rm74 | minimatch | ReDoS via nested extglobs | Same |

**Dependency chain**: `@typescript-eslint/eslint-plugin` -> `@typescript-eslint/type-utils` -> `@typescript-eslint/typescript-estree` -> `minimatch` (vulnerable version)

**Risk Assessment**: Low -- these are dev-only dependencies used during linting. They do not ship in the published package. Upgrading `@typescript-eslint/*` from v6 to v8 and `eslint` from v8 to v9+ would resolve all 6 advisories.

### 2.3 Production Vulnerability Status

**0 known vulnerabilities in production dependencies.** This is unchanged from v3.7.10 and remains a strength of the project.

---

## 3. Bundle Analysis

### 3.1 Bundle Sizes

| Bundle | Size | Lines | Source Maps |
|---|---|---|---|
| CLI (`dist/cli/bundle.js`) | **9.6 MB** | 164,145 | None (bundle-level) |
| MCP (`dist/mcp/bundle.js`) | **11 MB** | 186,482 | None (bundle-level) |

### 3.2 Comparison with v3.7.10

The v3.7.10 baseline reported "Bundles 11 MB each with no minification". In v3.7.14:
- CLI bundle has been reduced from ~11 MB to 9.6 MB (13% reduction)
- MCP bundle remains at 11 MB (no change)
- No minification has been added to either bundle

### 3.3 Build Configuration

Both bundles are built with esbuild:

| Setting | Value | Assessment |
|---|---|---|
| Format | ESM | Correct |
| Platform | Node.js | Correct |
| Bundle | true | Code is bundled |
| Minify | **not set (false)** | **Missing -- 30-40% savings available** |
| Source maps | **not set (false)** | No bundle source maps |
| Tree-shaking | esbuild default (on) | Active but limited by barrel exports |
| Code splitting | not enabled | Single bundle per entry |

### 3.4 Minification Impact Estimate

Based on the unminified bundle sizes and typical esbuild minification ratios for Node.js code:
- CLI: 9.6 MB -> ~5.8-6.7 MB (estimated 30-40% reduction)
- MCP: 11 MB -> ~6.6-7.7 MB (estimated 30-40% reduction)

Adding `minify: true` to the esbuild config is a single-line change with no runtime behavior impact.

### 3.5 Source Maps

The TypeScript compiler generates source maps for individual `.js` files (1,076 `.js.map` files in `dist/`), but the esbuild bundles do not have source maps. This means:
- Stack traces from the bundle will reference bundle line numbers (164K/186K lines)
- Debugging production issues is significantly harder
- Adding `sourcemap: true` to esbuild config would generate companion `.js.map` files

### 3.6 External Modules Strategy

Both bundles exclude native and CJS modules via the `nativeRequirePlugin`:
- 21 native/CJS modules are kept external and loaded via `createRequire()` at runtime
- 7 pure-JS ESM packages are kept external (fast-glob, yaml, commander, chalk, cli-progress, ora, express)
- The `typescriptLazyPlugin` provides a sophisticated lazy-loading Proxy for TypeScript

This architecture is sound and well-documented in the build scripts.

---

## 4. dist/ Output Analysis

| Metric | Count |
|---|---|
| Total dist/ size | 60 MB |
| `.js` files | 1,078 |
| `.d.ts` files | 1,076 |
| `.js.map` files (tsc-generated) | 1,076 |
| `.d.ts.map` files | 1,076 |
| Total files | ~4,306 + bundles |

### 4.1 Published File Breakdown

The `files` field in `package.json` correctly limits publishing to:
- `dist/**/*.js`, `dist/**/*.d.ts`, `dist/**/*.json`, `dist/**/*.node`
- `assets/**` (agents, skills, commands for npm distribution)
- Selected scripts (postinstall, preinstall, validators)
- `.claude/agents`, `.claude/skills`, `.claude/commands`, `.claude/helpers`
- `README.md`, `CHANGELOG.md`, `LICENSE`

Source maps (`.js.map`, `.d.ts.map`) are NOT included in the published package thanks to the `files` whitelist. This is correct.

---

## 5. Package Publishing Health

### 5.1 npm pack Analysis

| Metric | Value | v3.7.10 | Change |
|---|---|---|---|
| Total files | 3,301 | 5,473 | -40% (improved) |
| Package size (compressed) | 10.6 MB | N/A | Baseline |
| Unpacked size | 50.7 MB | N/A | Baseline |

The 40% file count reduction (from 5,473 to 3,301) directly addresses the v3.7.10 finding about the ENOTEMPTY install error. The `.npmignore` and `files` field work together to exclude:
- Source files (`src/`)
- Test files (`tests/`)
- Build configuration files
- CI/CD configuration
- Documentation source files
- IDE configuration

### 5.2 Remaining Concerns

The unpacked size of 50.7 MB is still substantial, primarily due to:
1. Assets directory (agents, skills, commands -- these are user-facing and necessary)
2. Two large bundles (9.6 MB + 11 MB = 20.6 MB)
3. 1,078 individual `.js` files + 1,076 `.d.ts` files from tsc output (~28 MB)

The individual tsc-output files are published alongside the bundles, which means most code ships twice (once in the bundle, once as individual files). This is intentional for library consumers who want to import subpaths, but it doubles the package size.

---

## 6. Circular Dependency Analysis

### 6.1 Summary

| Level | v3.7.10 | v3.7.14 | Delta |
|---|---|---|---|
| Module-level circular chains | 15 | **53** | +253% (regression) |

### 6.2 Core Circular Dependency Clusters

The 53 detected circular chains collapse into a smaller number of root cycles. The key problematic edges are:

**Root Cycle 1: `kernel` <-> `memory` <-> `shared`**
```
kernel -> memory -> kernel
kernel -> memory -> shared -> kernel
```
This is the most foundational cycle. The kernel module depends on memory, which depends back on kernel types/functions. The `shared` module also participates, creating a three-way cycle.

**Root Cycle 2: `shared` <-> `coordination` <-> `domains`**
```
shared -> coordination -> domains -> shared
coordination -> domains -> coordination
```
The shared utilities module imports from coordination/domains, which themselves depend on shared. This violates the expected dependency direction where shared should have zero outgoing dependencies to higher-level modules.

**Root Cycle 3: `integrations` <-> `learning`**
```
integrations -> learning -> integrations
```
Direct mutual dependency between integrations and learning modules.

**Root Cycle 4: `governance` <-> `kernel` (via transitive chains)**
```
governance -> kernel -> memory -> shared -> coordination -> governance
```
Long transitive cycle through 5 modules.

### 6.3 Coupling Metrics by Module

| Module | Ca (Afferent) | Ce (Efferent) | I (Instability) | Risk |
|---|---|---|---|---|
| `shared` | 28 | 4 | 0.12 | Low (stable core) |
| `kernel` | 21 | 6 | 0.22 | Low (stable core) |
| `learning` | 16 | 9 | 0.36 | Low |
| `integrations` | 12 | 6 | 0.33 | Low |
| `logging` | 9 | 1 | 0.10 | Low (very stable) |
| `domains` | 8 | 11 | 0.58 | Medium |
| `coordination` | 6 | 11 | 0.65 | Medium |
| `adapters` | 5 | 5 | 0.50 | Medium |
| `mcp` | 4 | 18 | 0.82 | HIGH (most coupled) |
| `cli` | 0 | 13 | 1.00 | HIGH (leaf, expected) |
| `init` | 2 | 5 | 0.71 | HIGH |
| `workers` | 1 | 4 | 0.80 | HIGH |
| `feedback` | 3 | 4 | 0.57 | Medium |
| `governance` | 3 | 3 | 0.50 | Medium |
| `hooks` | 2 | 4 | 0.67 | Medium |

**Key Observations**:
- `shared` (I=0.12) and `kernel` (I=0.22) are correctly positioned as stable foundations
- `mcp` (I=0.82) has 18 efferent couplings, the highest in the codebase -- expected for a top-level integration layer
- `cli` (I=1.00) is pure consumer (0 afferent, 13 efferent) -- correct for an application entry point
- `shared` having 4 efferent couplings to `coordination`, `kernel`, `learning`, and `mcp` is the primary architectural concern, as shared utilities should ideally depend on nothing

### 6.4 Circular Dependency Tooling

No circular dependency detection tooling (e.g., `madge`, `dpdm`, `circular-dependency-plugin`) was found in the project configuration or devDependencies. The build succeeds despite circular dependencies because:
1. esbuild handles circular imports at the module level
2. TypeScript's `isolatedModules: true` prevents some circular issues at compile time
3. Runtime circular resolution works when modules don't access each other's exports during initialization

### 6.5 Tree-Shaking Effectiveness

| Metric | Count |
|---|---|
| Barrel export files (`index.ts` with `export *`) | 29 |
| Total wildcard re-exports | 97 |

Top offenders:
| File | Wildcard Re-exports |
|---|---|
| `domains/index.ts` | 14 |
| `shared/index.ts` | 13 |
| `index.ts` (root) | 9 |
| `domains/test-execution/services/index.ts` | 9 |
| `coordination/protocols/index.ts` | 6 |
| `governance/index.ts` | 5 |

Wildcard barrel exports (`export * from './module'`) prevent bundlers from effectively tree-shaking unused code. The 97 wildcard re-exports across 29 barrel files means the bundles likely include substantial dead code. Converting to named re-exports would improve tree-shaking significantly.

However, since the `package.json` does not declare `"sideEffects": false`, bundlers must assume all modules have side effects, further limiting tree-shaking opportunities.

---

## 7. Build System Assessment

### 7.1 TypeScript Configuration

| Setting | Value | Assessment |
|---|---|---|
| `strict` | true | Correct |
| `noImplicitAny` | true | Correct |
| `strictNullChecks` | true | Correct |
| `strictFunctionTypes` | true | Correct |
| `noImplicitReturns` | true | Correct |
| `noFallthroughCasesInSwitch` | true | Correct |
| `isolatedModules` | true | Correct (esbuild compat) |
| `forceConsistentCasingInFileNames` | true | Correct |
| `target` | ES2022 | Appropriate for Node 18+ |
| `module` | ESNext | Correct for ESM |
| `moduleResolution` | bundler | Correct for esbuild pipeline |
| `noUnusedLocals` | false | Relaxed (consider enabling) |
| `noUnusedParameters` | false | Relaxed (consider enabling) |

TypeScript strict mode is fully enabled. This is a continued strength from v3.7.10.

### 7.2 Build Pipeline

The build pipeline is a three-step process:
1. `tsc` -- TypeScript compilation (generates individual `.js`, `.d.ts`, `.js.map`, `.d.ts.map`)
2. `build:cli` -- esbuild bundling of CLI entry point
3. `build:mcp` -- esbuild bundling of MCP entry point

The pipeline is sound but could benefit from:
- Adding `minify: true` to esbuild configs
- Adding `sourcemap: true` to esbuild configs
- Running in parallel (`tsc` must complete first, but CLI and MCP builds are independent)

### 7.3 Path Aliases

Path aliases (`@/*`, `@shared/*`, `@kernel/*`, etc.) are defined in `tsconfig.json` but esbuild does not natively resolve them. The build succeeds because esbuild bundles from the TypeScript source, and the aliases resolve through the module graph traversal. However, the individual `.js` files in `dist/` use relative imports (generated by `tsc`), so the aliases do not leak into published output.

---

## 8. Dependency Freshness

### 8.1 Outdated Summary

| Category | Count |
|---|---|
| Total outdated | 23 |
| Major version behind | 7 |
| Minor version behind | 2 |
| Patch version behind | 14 |

### 8.2 Major Version Outdated (Requiring Migration)

| Package | Current | Latest | Notes |
|---|---|---|---|
| `@typescript-eslint/*` | 6.x | 8.x | ESLint v9 migration needed |
| `eslint` | 8.x | 10.x | Flat config migration |
| `commander` | 12.x | 14.x | CLI framework major update |
| `uuid` | 9.x | 13.x | 4 major versions behind |
| `vibium` | 0.1.x | 26.x | Extreme version gap |
| `@ruvector/attention` | 0.1.3 | 0.1.31 | Within 0.x range |
| `@ruvector/gnn` | 0.1.19 | 0.1.25 | Within 0.x range |

### 8.3 Minor/Patch Updates Available

| Package | Current | Wanted | Latest |
|---|---|---|---|
| `jose` | 6.1.3 | 6.2.0 | 6.2.0 |
| `pg` | 8.19.0 | 8.20.0 | 8.20.0 |
| `@types/node` | 20.19.35 | 20.19.37 | 25.3.5 |

---

## 9. Native Module Handling (@ruvector)

### 9.1 Architecture Assessment

The @ruvector native module handling is well-architected:

1. **Platform-specific binaries** are declared as `optionalDependencies` so npm only installs the matching platform
2. **musl-to-gnu aliasing** uses `npm:` protocol aliases to map musl builds to gnu equivalents, preventing duplicate downloads
3. **Matching `overrides`** ensure the aliases propagate through the entire dependency tree
4. **Build script handling**: Both `build-cli.mjs` and `build-mcp.mjs` list all @ruvector packages in `nativeModules` and use the `nativeRequirePlugin` to rewrite imports to `createRequire()`-based loading
5. **Runtime graceful degradation**: The wrappers in `src/integrations/ruvector/` use lazy `require()` with try/catch, preventing crashes when native modules are unavailable

### 9.2 Total Size

- `node_modules/@ruvector`: 32 MB (includes 24 sub-packages for all platforms)
- Per-platform actual install: ~5-8 MB (only matching platform binaries install)

---

## 10. Lock File Health

| Property | Value | Assessment |
|---|---|---|
| Lock file version | 3 | Current (npm v9+) |
| File size | 590 KB | Reasonable |
| Version sync | `3.7.14` in both package.json and lock | Correct |
| Resolution overrides | 3 (`graceful-fs`, `stack-utils`, `tar`) | Documented |
| npm overrides | 4 (musl aliases + `tar` + `markdown-it`) | Correctly applied |

The lock file is healthy and in sync with `package.json`.

---

## 11. v3.7.10 vs v3.7.14 Comparison Matrix

| Finding | v3.7.10 Status | v3.7.14 Status | Verdict |
|---|---|---|---|
| `typescript` in prod deps (+80 MB) | Critical | **Fixed** -- moved to devDeps + lazy plugin | Resolved |
| `@claude-flow/guidance` phantom dep | Critical | **Fixed** -- properly lazy-loaded with fallback | Resolved |
| `@faker-js/faker` in prod deps | Critical | **Remaining** -- 5.3 MB, used in 8 source files | Open |
| Bundles 11 MB each, no minification | Major | CLI reduced to 9.6 MB, MCP at 11 MB, still no minification | Partial |
| 15 circular dependency chains | Major | **Regressed** -- 53 chains at module level | Worsened |
| TypeScript strict mode enabled | Strength | Maintained | No change |
| Clean Architecture dep flow | Strength | Maintained (with circular caveats) | No change |
| 0 production vulnerabilities | Strength | Maintained | No change |
| @ruvector well-architected | Strength | Maintained | No change |
| Package file count 5,473 | Critical (ENOTEMPTY) | **Fixed** -- reduced to 3,301 (40% reduction) | Resolved |

---

## 12. Recommendations

### P0 -- Critical (Address Before Next Release)

1. **Add minification to esbuild bundles**
   - Impact: ~30-40% bundle size reduction (save ~7 MB of uncompressed output)
   - Effort: Single line change in both `build-cli.mjs` and `build-mcp.mjs`
   - Change: Add `minify: true` to the `build()` config objects
   - Risk: None -- esbuild minification is deterministic and well-tested

2. **Break the `kernel` <-> `memory` <-> `shared` circular dependency**
   - Impact: Eliminates the root cycle that cascades into 30+ of the 53 circular chains
   - Approach: Extract shared types/interfaces into a `types` or `contracts` module that both `kernel` and `memory` depend on without depending on each other
   - The `shared` module should have 0 efferent couplings -- its 4 outgoing dependencies to `coordination`, `kernel`, `learning`, and `mcp` violate its architectural role

### P1 -- High Priority (Next Sprint)

3. **Evaluate `@faker-js/faker` dependency strategy**
   - Option A: Apply the same lazy-loading pattern used for TypeScript (proxy + `createRequire()`)
   - Option B: Move to `optionalDependencies` if test generation is opt-in
   - Option C: Replace with a lighter-weight test data generator
   - Savings: 5.3 MB per install for users who don't use test generation

4. **Upgrade `@typescript-eslint/*` to v8 and `eslint` to v9+**
   - Resolves all 6 high-severity `minimatch` vulnerabilities
   - Enables flat config and modern ESLint features
   - Effort: Medium (ESLint config migration)

5. **Add `"sideEffects": false` to package.json**
   - Enables bundlers consuming AQE as a library to tree-shake unused modules
   - Verify no module-level side effects exist first (initializers, polyfills)

### P2 -- Medium Priority (Next Quarter)

6. **Install circular dependency detection tooling**
   - Add `madge` or `dpdm` to devDependencies
   - Configure as a pre-commit hook or CI check
   - Set a threshold (e.g., max 10 module-level cycles) and fail CI if exceeded

7. **Reduce barrel export wildcards**
   - Convert the 97 `export *` re-exports to named exports in the 29 barrel files
   - Prioritize `domains/index.ts` (14 wildcards) and `shared/index.ts` (13 wildcards)
   - This improves tree-shaking, IDE autocompletion, and makes dependency graphs clearer

8. **Add source maps to bundles**
   - Add `sourcemap: true` to both esbuild configs
   - Enables meaningful stack traces for production error debugging
   - Source maps would not be published (excluded by `files` field)

9. **Update `uuid` to v13**
   - 4 major versions behind (9.x -> 13.x)
   - The v13 API is largely compatible; primary change is ESM-native exports

### P3 -- Low Priority (Backlog)

10. **Investigate `vibium` version gap (0.1.x -> 26.x)**
    - The package has jumped from 0.1.x to 26.x, which is unusual
    - Verify this is the correct package and not a case of npm name squatting or a different package entirely

11. **Enable `noUnusedLocals` and `noUnusedParameters` in tsconfig**
    - Currently disabled; enabling would catch dead code at compile time
    - Requires a cleanup pass to remove unused variables/parameters

12. **Consider code splitting for bundles**
    - esbuild supports code splitting with `splitting: true`
    - Would allow lazy-loading of domains (e.g., test-generation only loads when invoked)
    - Requires `format: 'esm'` (already in use) and multiple entry points

---

## Appendix A: Dependency Graph Statistics

| Metric | Value |
|---|---|
| Source files analyzed | 1,077 |
| Top-level modules | 37 |
| Module-level dependency edges | 147 |
| Circular dependency chains | 53 |
| Average module instability | 0.55 |
| Most depended-upon module | `shared` (Ca=28) |
| Most dependent module | `mcp` (Ce=18) |
| Most stable module (lowest I) | `logging` (I=0.10) |
| Most unstable module (highest I) | `mcp` (I=0.82, excluding leaf nodes) |

## Appendix B: Full Coupling Metrics Table

| Module | Ca | Ce | I | Classification |
|---|---|---|---|---|
| shared | 28 | 4 | 0.12 | Stable foundation (with coupling violations) |
| kernel | 21 | 6 | 0.22 | Stable foundation |
| learning | 16 | 9 | 0.36 | Stable service |
| integrations | 12 | 6 | 0.33 | Stable integration layer |
| logging | 9 | 1 | 0.10 | Very stable utility |
| domains | 8 | 11 | 0.58 | Balanced (expected for domain layer) |
| coordination | 6 | 11 | 0.65 | Moderately unstable |
| adapters | 5 | 5 | 0.50 | Balanced |
| mcp | 4 | 18 | 0.82 | Highly unstable (expected for integration) |
| feedback | 3 | 4 | 0.57 | Moderately unstable |
| optimization | 3 | 4 | 0.57 | Moderately unstable |
| routing | 3 | 4 | 0.57 | Moderately unstable |
| governance | 3 | 3 | 0.50 | Balanced |
| memory | 3 | 3 | 0.50 | Balanced (problematic -- should be stable) |
| types | 3 | 0 | 0.00 | Pure abstraction (correct) |
| migrations | 2 | 0 | 0.00 | Pure abstraction |
| migration | 1 | 0 | 0.00 | Pure abstraction |
| audit | 4 | 1 | 0.20 | Stable |
| hooks | 2 | 4 | 0.67 | Moderately unstable |
| init | 2 | 5 | 0.71 | Unstable (expected for bootstrap) |
| strange-loop | 2 | 2 | 0.50 | Balanced |
| agents | 1 | 1 | 0.50 | Balanced |
| planning | 1 | 3 | 0.75 | Unstable |
| sync | 1 | 4 | 0.80 | Unstable |
| validation | 1 | 3 | 0.75 | Unstable |
| workers | 1 | 4 | 0.80 | Unstable |
| cli | 0 | 13 | 1.00 | Pure consumer (correct) |
| benchmarks | 0 | 2 | 1.00 | Pure consumer (correct) |
| causal-discovery | 0 | 2 | 1.00 | Pure consumer |
| early-exit | 0 | 2 | 1.00 | Pure consumer |
| monitoring | 0 | 1 | 1.00 | Pure consumer |
| performance | 0 | 1 | 1.00 | Pure consumer |
| skills | 0 | 3 | 1.00 | Pure consumer |
| test-scheduling | 0 | 3 | 1.00 | Pure consumer |
| testing | 0 | 1 | 1.00 | Pure consumer |
| workflows | 0 | 1 | 1.00 | Pure consumer |

## Appendix C: Circular Dependency Root Cycles

The 53 chains decompose into these root mutual dependencies:

1. `kernel` <-> `memory` (direct)
2. `shared` <-> `coordination` (direct)
3. `shared` <-> `kernel` (via `memory`)
4. `integrations` <-> `learning` (direct)
5. `domains` <-> `coordination` (direct)
6. `domains` <-> `shared` (via `coordination`)
7. `governance` <-> `kernel` (via `memory` -> `shared` -> `coordination`)

Breaking cycles 1 and 2 would eliminate approximately 80% of all detected circular chains.

---

*Report generated by QE Dependency Mapper v3.7.14 -- Opus 4.6 analysis engine*
*Analysis timestamp: 2026-03-09T00:00:00Z*
