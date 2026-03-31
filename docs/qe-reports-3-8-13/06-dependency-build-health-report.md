# Dependency & Build Health Report - v3.8.13

**Date**: 2026-03-30
**Agent**: qe-dependency-mapper
**Baseline**: v3.8.3 (2026-03-19)

---

## Executive Summary

v3.8.13 shows meaningful improvement in bundle sizes (CLI -29%, MCP -43%) due to minification being enabled since the last baseline. Circular dependencies dropped from 12 to 9. The `typescript` leak into production deps has been fixed and `@faker-js/faker` has been correctly moved to devDependencies. However, `@faker-js/faker` is still imported in production source code, `@claude-flow/guidance` remains as a questionable production dependency, and 7 npm audit vulnerabilities persist in devDependencies. The package continues to grow in file count and unpacked size.

**Overall Grade: B+** (up from B)

---

## 1. Package Size Analysis

| Metric | v3.8.3 | v3.8.13 | Delta | Trend |
|--------|--------|---------|-------|-------|
| Packed (tarball) | 10.9 MB | 11.1 MB | +0.2 MB (+1.8%) | Slight regression |
| Unpacked | 52.2 MB | 54.0 MB | +1.8 MB (+3.4%) | Slight regression |
| Published files | 3,646 | 3,759 | +113 (+3.1%) | Growing |
| dist/ total | ~55 MB | 57 MB | ~+2 MB | Growing |

### File Composition in Package (3,759 files)

| Category | File Count | Notes |
|----------|-----------|-------|
| dist/ (JS, .d.ts, JSON) | ~2,392 | Core build output |
| .claude/ (agents, skills, commands, helpers) | ~736 | Shipped skill/agent definitions |
| assets/ (grammars, agents, skills) | ~469 | Grammar WASM files dominate (8.5 MB) |
| .opencode/ | ~143 | OpenCode agent/skill copies |
| scripts/ | ~8 | Build/validation scripts |

### Size Breakdown of dist/

| Directory | Size | Notes |
|-----------|------|-------|
| mcp/ | 11 MB | Bundle (6.8 MB) + handlers + source maps |
| domains/ | 11 MB | Test generation, visual accessibility, etc. |
| cli/ | 9.7 MB | Bundle (7.0 MB) + commands + source maps |
| integrations/ | 5.8 MB | RuVector wrappers (116 files) |
| coordination/ | 4.3 MB | Queen coordinator, mincut, consensus |
| adapters/ | 2.9 MB | |
| shared/ | 2.6 MB | |
| learning/ | 1.9 MB | |

### Source Maps & Declarations

| Artifact | Total Size | Included in Pack? |
|----------|-----------|-------------------|
| .js.map (source maps) | 4.7 MB | NO (excluded by files glob) |
| .d.ts (declarations) | 7.4 MB | YES (needed for TypeScript users) |
| .d.ts.map (declaration maps) | 5.5 MB | NO (excluded by files glob) |

Good: Source maps and declaration maps are correctly excluded from the published package.

---

## 2. Production Dependencies

### Current Production Dependencies (25)

| Package | Version | Purpose | Concern |
|---------|---------|---------|---------|
| @claude-flow/guidance | 3.0.0-alpha.1 | Governance integration | **Alpha prerelease in prod** |
| @ruvector/attention | 0.1.3 | Native attention layer | Outdated (latest 0.1.31) |
| @ruvector/gnn | 0.1.19 | Graph neural network | Outdated (latest 0.1.25) |
| @ruvector/learning-wasm | ^0.1.29 | WASM learning | OK |
| @ruvector/router | ^0.1.28 | Model routing | Minor update available |
| @ruvector/rvf-node | ^0.1.7 | Native node bindings | Minor update available |
| @ruvector/sona | 0.1.5 | Sona integration | OK |
| @xenova/transformers | ^2.17.2 | Embeddings/ML | OK |
| axe-core | ^4.11.1 | Accessibility testing engine | OK |
| better-sqlite3 | ^12.5.0 | SQLite database | OK |
| chalk | ^5.6.2 | Terminal coloring | OK |
| cli-progress | ^3.12.0 | Progress bars | OK |
| commander | ^12.1.0 | CLI framework | Outdated (latest 14.0.3) |
| fast-glob | ^3.3.3 | File globbing | OK |
| fast-json-patch | ^3.1.1 | JSON patching | OK |
| hnswlib-node | ^3.0.0 | HNSW vector search | OK |
| jose | ^6.1.3 | JWT/token operations | OK |
| ora | ^9.0.0 | Spinners | OK |
| pg | ^8.17.2 | PostgreSQL client | OK |
| prime-radiant-advanced-wasm | ^0.1.3 | WASM acceleration | OK |
| secure-json-parse | ^4.1.0 | Safe JSON parsing | OK |
| uuid | ^9.0.0 | UUID generation | Major outdated (latest 13.0.0) |
| vibium | ^0.1.2 | Browser automation | Major outdated (latest 26.3.18) |
| web-tree-sitter | ~0.24.7 | Code parsing | Outdated (latest 0.26.7) |
| yaml | ^2.8.2 | YAML parsing | OK |

### DevDependencies (18)

| Package | Version | Concern |
|---------|---------|---------|
| @faker-js/faker | ^10.2.0 | **Used in production source code** (see below) |
| typescript | ^5.9.3 | Correctly in devDeps now (FIXED from v3.8.3) |
| vitest | ^4.0.16 | OK |
| esbuild | ^0.27.2 | OK |
| @typescript-eslint/* | ^6.13.0 | **Source of all 7 npm audit vulnerabilities** |

### Dependency Leak Assessment

| Check | v3.8.3 | v3.8.13 | Status |
|-------|--------|---------|--------|
| typescript in prod deps | YES | NO | **FIXED** |
| @faker-js/faker in prod deps | YES | NO | **FIXED** (moved to devDeps) |
| @faker-js/faker used in prod src | YES | YES | **UNRESOLVED** |
| @claude-flow/guidance in prod | YES | YES | **UNRESOLVED** (alpha pkg) |

**Critical finding**: `@faker-js/faker` is imported in 2 production source files:
1. `src/domains/test-generation/generators/swift-testing-generator.ts`
2. `src/domains/test-generation/generators/base-test-generator.ts`

These files get bundled into the CLI/MCP bundles. Since esbuild bundles the code, the 6+ MB faker library gets bundled into the output at build time even though it is listed as a devDependency. This works in development but will fail for users who install the package without devDependencies.

---

## 3. Bundle Sizes

| Bundle | v3.8.3 | v3.8.13 | Delta | Status |
|--------|--------|---------|-------|--------|
| CLI bundle (dist/cli/bundle.js) | 9.8 MB | 7.0 MB | **-2.8 MB (-29%)** | Improved |
| MCP bundle (dist/mcp/bundle.js) | 12 MB | 6.8 MB | **-5.2 MB (-43%)** | Improved |
| CLI dir total | N/A | 9.7 MB | -- | -- |
| MCP dir total | N/A | 11 MB | -- | -- |

### Minification Status

| Check | v3.8.3 | v3.8.13 | Status |
|-------|--------|---------|--------|
| CLI minified | NO | **YES** | **FIXED** |
| MCP minified | NO | **YES** | **FIXED** |
| esbuild minify: true | NO | YES | Enabled in both build scripts |

Both `scripts/build-cli.mjs` and `scripts/build-mcp.mjs` now include `minify: true` in the esbuild configuration. The bundles contain minified variable names and compressed output, confirmed by inspection.

### Tree Shaking

| Check | Status | Notes |
|-------|--------|-------|
| esbuild tree shaking | Enabled by default | esbuild enables tree shaking when bundling |
| `sideEffects` in package.json | **MISSING** | Could improve shaking for consumers |
| `treeShaking` explicit config | Not set | Uses esbuild default (enabled) |

---

## 4. Circular Dependencies

| Metric | v3.8.3 | v3.8.13 | Delta |
|--------|--------|---------|-------|
| Circular dependency chains | 12 | **9** | **-3 (-25%)** |

### All 9 Circular Dependencies

| # | Cycle | Severity | Module |
|---|-------|----------|--------|
| 1 | claim-verifier-service.ts -> file-verifier.ts -> index.ts | Medium | agents/claim-verifier |
| 2 | file-verifier.ts -> index.ts | Medium | agents/claim-verifier |
| 3 | index.ts -> output-verifier.ts | Medium | agents/claim-verifier |
| 4 | interfaces.ts -> sycophancy-scorer.ts | Low | coordination/consensus |
| 5 | pattern-store.ts -> filter-adapter.ts | Medium | learning/ruvector |
| 6 | queen-coordinator.ts -> queen-integration.ts | High | coordination/queen |
| 7 | cognitive-container.ts -> cognitive-container-codec.ts | Low | integrations/ruvector |
| 8 | core-handlers.ts -> domain-handlers.ts -> domain-handler-configs.ts -> handler-factory.ts | High | mcp/handlers |
| 9 | core-handlers.ts -> task-handlers.ts | Medium | mcp/handlers |

### Risk Assessment

- **High Risk (2)**: The queen-coordinator and MCP handler cycles affect critical runtime paths
- **Medium Risk (5)**: Claim verifier and learning cycles could cause initialization issues
- **Low Risk (2)**: Interface-level cycles with minimal runtime impact

### Cluster Analysis

3 of 9 cycles are in `agents/claim-verifier/` -- a single barrel export refactor would eliminate all 3. The MCP handler cycle (chain of 4 files) is the most complex and should be prioritized.

---

## 5. npm Audit

| Severity | Count | Source |
|----------|-------|--------|
| High | 6 | minimatch (via @typescript-eslint/*) |
| Moderate | 1 | minimatch |
| **Total** | **7** | All in devDependencies |

All vulnerabilities trace to `minimatch@9.0.0-9.0.6` pulled in by `@typescript-eslint/typescript-estree@6.x`. The fix is upgrading `@typescript-eslint/*` from v6 to v8, which would also bring ESLint compatibility improvements.

**Production impact**: NONE -- all affected packages are devDependencies only.

Fix command: `npm audit fix` (or upgrade @typescript-eslint/* to v8).

---

## 6. Build Health

### Build Configuration

| Setting | Value | Assessment |
|---------|-------|------------|
| TypeScript target | ES2022 | Good |
| Module system | ESNext | Good |
| Module resolution | bundler | Good |
| Strict mode | true | Good |
| Source maps | true | OK (excluded from package) |
| Declaration maps | true | OK (excluded from package) |
| noUnusedLocals | false | **Could be stricter** |
| noUnusedParameters | false | **Could be stricter** |

### Build Pipeline

```
npm run build = tsc && build:cli && build:mcp
                 |       |            |
                 v       v            v
              dist/*.js  dist/cli/    dist/mcp/
              (tsc)      bundle.js    bundle.js
                         (esbuild)    (esbuild)
```

### Build Artifacts Freshness

All build artifacts dated 2026-03-30 (today). Build is current with source.

### esbuild Configuration

| Setting | CLI | MCP |
|---------|-----|-----|
| bundle | true | true |
| minify | true | true |
| platform | node | node |
| format | esm | esm |
| Externals (native) | 21 modules | 21 modules |
| Externals (ESM) | 7 modules | 8 modules |
| Lazy typescript | Yes (plugin) | Yes (plugin) |

Good: TypeScript is lazy-loaded via a plugin to avoid crashing when users install without devDeps.

---

## 7. Dead / Questionable Dependencies

| Package | Imports in src/ | Assessment |
|---------|----------------|------------|
| jose | 1 | Low usage -- consider if JWT is essential |
| pg | 1 | Low usage -- PostgreSQL for optional remote storage |
| axe-core | 1 | Low usage -- accessibility testing engine |
| fast-json-patch | 2 | Low usage but justified |
| secure-json-parse | 3 | OK |
| prime-radiant-advanced-wasm | 4 | OK |
| @claude-flow/guidance | 0 direct imports | **Only type imports via import()** -- lazy loaded |

`@claude-flow/guidance@3.0.0-alpha.1` deserves special attention:
- No direct ESM imports in source
- Used via dynamic `import()` type references and lazy loading
- Pinned to an alpha prerelease version
- Could potentially be made optional or peer dependency

---

## 8. Dependency Freshness

### Significantly Outdated Packages

| Package | Current | Latest | Gap | Risk |
|---------|---------|--------|-----|------|
| vibium | 0.1.8 | 26.3.18 | **Major** | High -- version gap suggests different package or major rewrite |
| uuid | 9.0.1 | 13.0.0 | 4 major | Medium |
| commander | 12.1.0 | 14.0.3 | 2 major | Low |
| web-tree-sitter | 0.24.7 | 0.26.7 | 2 minor | Low |
| @ruvector/attention | 0.1.3 | 0.1.31 | 28 patches | Medium -- native binary, may contain fixes |
| @ruvector/gnn | 0.1.19 | 0.1.25 | 6 patches | Low |
| @typescript-eslint/* | 6.21.0 | 8.57.2 | 2 major | Medium (security vulns) |
| eslint | 8.57.1 | 10.1.0 | 2 major | Low (devDep) |

---

## 9. Metrics Comparison Table

| Metric | v3.8.3 | v3.8.13 | Delta | Status |
|--------|--------|---------|-------|--------|
| Package packed | 10.9 MB | 11.1 MB | +1.8% | Slight growth |
| Package unpacked | 52.2 MB | 54.0 MB | +3.4% | Slight growth |
| Published files | 3,646 | 3,759 | +3.1% | Growing |
| CLI bundle | 9.8 MB | 7.0 MB | **-29%** | **Improved** |
| MCP bundle | 12 MB | 6.8 MB | **-43%** | **Improved** |
| Circular deps | 12 | 9 | **-25%** | **Improved** |
| Production deps | ~25 | 25 | ~0 | Stable |
| Dev deps | ~18 | 18 | ~0 | Stable |
| npm audit vulns | N/A | 7 (all devDeps) | -- | Low risk |
| typescript in prod | YES | NO | -- | **FIXED** |
| @faker-js/faker in prod deps | YES | NO | -- | **FIXED** |
| @faker-js/faker in prod src | YES | YES | -- | Unresolved |
| Minification | NO | YES | -- | **FIXED** |
| Tree shaking | Default | Default | -- | No change |

---

## 10. Recommendations

### Critical (P0)

1. **Fix @faker-js/faker production source usage**: The 2 source files importing faker will fail at runtime when installed without devDeps. Either:
   - Move `@faker-js/faker` back to prod deps (increases install size by ~6 MB), or
   - Replace faker calls with lightweight inline generators, or
   - Make test-generation an optional lazy-loaded module with a clear error message

### High (P1)

2. **Upgrade @typescript-eslint/* to v8**: Eliminates all 7 npm audit vulnerabilities and gets onto supported eslint tooling.

3. **Break MCP handler circular dependency**: The 4-file cycle (core-handlers -> domain-handlers -> domain-handler-configs -> handler-factory) is the most complex and affects a critical runtime path. Extract shared types/interfaces to break the cycle.

4. **Break queen-coordinator circular**: queen-coordinator.ts <-> queen-integration.ts affects swarm coordination. Use dependency inversion or event-based decoupling.

### Medium (P2)

5. **Add `sideEffects: false` to package.json**: Enables better tree shaking for downstream consumers who bundle this package.

6. **Evaluate @claude-flow/guidance**: An alpha prerelease pinned in prod deps is a stability risk. Consider making it a peer dependency or optional dependency.

7. **Refactor claim-verifier barrel exports**: A single index.ts restructure eliminates 3 circular dependencies.

8. **Update @ruvector/attention and @ruvector/gnn**: 28 and 6 patch versions behind respectively -- native binaries may contain important fixes.

### Low (P3)

9. **Evaluate vibium version gap**: Current 0.1.8 vs latest 26.3.18 -- verify this is the correct package or if it has been replaced.

10. **Consider making pg, jose, axe-core optional**: Low-usage dependencies that not all users need. Could be optional/peer deps to reduce install footprint.

11. **Enable noUnusedLocals and noUnusedParameters**: Would catch dead code at compile time.

12. **Investigate package size growth trend**: +3.4% unpacked per release will compound. Consider a size budget in CI.

---

## 11. Grading

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Bundle optimization | A- (minification enabled, good size reduction) | 25% | 0.225 |
| Dependency hygiene | B (typescript fixed, faker src issue remains) | 25% | 0.188 |
| Circular dependencies | B+ (9, down from 12, 2 high-risk remain) | 15% | 0.128 |
| Security (npm audit) | B+ (7 vulns, all devDeps, easy fix) | 15% | 0.128 |
| Build system | A (esbuild+tsc, minified, lazy loading) | 10% | 0.095 |
| Freshness | B- (several significantly outdated) | 10% | 0.070 |

**Weighted Total: 0.833 / 1.0**

### Overall Grade: B+

**Improvement from v3.8.3**: B -> B+ (driven by minification, typescript fix, circular dep reduction)

**Path to A-**: Fix faker source imports, upgrade @typescript-eslint, break the 2 high-risk circular dependencies.

---

## Appendix A: Build Script Locations

- CLI build: `/workspaces/agentic-qe/scripts/build-cli.mjs`
- MCP build: `/workspaces/agentic-qe/scripts/build-mcp.mjs`
- TypeScript config: `/workspaces/agentic-qe/tsconfig.json`
- Package config: `/workspaces/agentic-qe/package.json`

## Appendix B: Circular Dependency Detection

Tool: `madge@8.0.0` with `--circular --extensions ts`
Entry point: `src/index.ts`
Files processed: 875 (18 warnings)
