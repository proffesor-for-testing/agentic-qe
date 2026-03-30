# Product/QX SFDIPOT Report - v3.8.13

**Date**: 2026-03-30
**Agent**: qe-product-factors-assessor
**Baseline**: v3.8.3 (2026-03-19)
**Methodology**: SFDIPOT (Bach's HTSM) + QX
**Source Version**: 3.8.13
**Total Source Files**: 1,195 TypeScript (non-test)
**Total Source Lines**: 549,542
**Test Files**: 717
**Commits Since Baseline**: 50 (non-merge)

---

## Executive Summary

v3.8.13 represents 10 releases of rapid feature development since v3.8.3 (11 days, 50 commits, ~27K insertions). The codebase has grown in capability (RuVector Phase 5, session caching, YAML pipelines, multi-language parsers, economic routing) but structural debt has increased marginally. The ESLint configuration is broken in the current environment, which is a regression. Build succeeds cleanly. The single-platform CI constraint (Node 24, Ubuntu only) remains unchanged despite `engines` field claiming `>=18.0.0`.

**Composite Score: 6.4/10** (v3.8.3 baseline: 6.5/10, delta: -0.1)

---

## S - Structure: 5/10 (Delta: 0 from v3.8.3)

### File Size Distribution

| Threshold | Count | % of 1,195 | v3.8.3 |
|-----------|-------|-------------|--------|
| >2,000 lines | 0 | 0% | Unknown |
| >1,000 lines | 91 | 7.6% | 90 |
| 500-1,000 lines | 352 | 29.5% | Unknown |
| <500 lines | 753 | 63.0% | Unknown |

**Evidence**: 91 files exceed 1,000 lines (up from 90 in v3.8.3). The largest file is `qcsd-refinement-plugin.ts` at 1,861 lines. No files exceed 2,000 lines, which is an improvement from v3.8.3 (which reported having files in that range). The CLAUDE.md rule of "keep files under 500 lines" is violated by 442 files (37% of source).

### Module Organization

| Layer | Expected (DDD) | Actual | Assessment |
|-------|----------------|--------|------------|
| `src/domains/` | Core bounded contexts | 13 domains, 253 files | Well-structured with coordinators + interfaces |
| `src/kernel/` | Infrastructure kernel | Present (4+ schema files) | Exists |
| `src/mcp/` | Protocol layer | 44 tool files, 15 handlers | Heavy, growing |
| `src/cli/` | Command interface | 34 command files | Comprehensive |
| `src/shared/` | Shared utilities | Present | Shared parsers, LLM, security |
| `src/integrations/` | External integrations | RuVector, coherence, n8n, browser | Growing |

**Non-DDD Sprawl**: 936 non-domain files vs 253 domain files (78.7% of source lives outside bounded contexts). Directories like `src/governance/`, `src/coordination/`, `src/learning/`, `src/planning/`, `src/routing/`, `src/strange-loop/`, `src/causal-discovery/`, `src/early-exit/`, `src/feedback/`, `src/optimization/`, `src/performance/`, `src/benchmarks/`, `src/monitoring/` exist outside the DDD `domains/` boundary. This is a structural concern: the project claims DDD architecture but only 21% of code lives inside domain boundaries.

**Top 10 Largest Files** (all >1,600 lines):

1. `domains/requirements-validation/qcsd-refinement-plugin.ts` — 1,861
2. `domains/contract-testing/services/contract-validator.ts` — 1,827
3. `domains/learning-optimization/coordinator.ts` — 1,778
4. `cli/completions/index.ts` — 1,778
5. `domains/test-generation/services/pattern-matcher.ts` — 1,769
6. `domains/chaos-resilience/coordinator.ts` — 1,704
7. `domains/requirements-validation/qcsd-ideation-plugin.ts` — 1,699
8. `domains/test-generation/coordinator.ts` — 1,694
9. `domains/visual-accessibility/coordinator.ts` — 1,639
10. `shared/llm/router/types.ts` — 1,637

### Barrel Files

197 `index.ts` barrel files exist (49 in domains). This is reasonable for a project this size.

### Archived Code

6 archived files in `src/_archived/neural-optimizer/` (2,737 lines). Clean separation from active code.

### Risks

- **R-S1 (HIGH)**: 442 files violate the <500-line project rule. The 91 files over 1,000 lines are concentrated in domain coordinators and plugins, suggesting these grow organically without decomposition pressure.
- **R-S2 (MEDIUM)**: 78.7% of source code outside `domains/` contradicts the DDD architecture claim. `governance/`, `coordination/`, `learning/`, and `planning/` are de facto domains that aren't treated as such.
- **R-S3 (LOW)**: `src/migration/` and `src/migrations/` both exist — potential confusion.

---

## F - Function: 8/10 (Delta: +0.5 from v3.8.3)

### Features Added Since v3.8.3

| Version | Feature | Category |
|---------|---------|----------|
| v3.8.4 | Security P0/P1 fixes from QE swarm | Fix |
| v3.8.5 | Flaky timer fixes, afterEach cleanup (104 files) | Fix |
| v3.8.6 | CodeQL ReDoS elimination, module decomposition | Security |
| v3.8.7 | Hypergraph persistence unification | Fix |
| v3.8.8 | Agents/skills migration MCP-to-CLI, tree-sitter WASM parsers | Feature |
| v3.8.9 | Coherence gate witness persistence, SHA-256 hash fix | Security |
| v3.8.10 | Coverage data flow unification | Fix |
| v3.8.11 | YAML pipelines, heartbeat CLI, economic routing, session cache | Feature |
| v3.8.12 | RuVector Phase 5 (HDC fingerprinting, GraphMAE, meta-learning, E-prop) | Feature |
| v3.8.13 | CLI code intelligence (complexity, incremental indexing) | Feature |

**New CLI Commands Since v3.8.3**:
- `aqe code complexity` with cyclomatic/cognitive/Halstead metrics
- `aqe code index --incremental --git-since`
- `aqe pipeline load/validate/run/list/status/approve/reject`
- `aqe heartbeat status/run-now/history/log/pause/resume`
- `aqe routing economics/accuracy/metrics`

**Feature Completeness Assessment**:
- CLI help output is comprehensive (40+ commands visible)
- `aqe health` returns healthy status with 14 idle domains, 53 agents registered
- `aqe init` has 15+ options including platform integrations (Cursor, Copilot, Kiro, Cline, etc.)
- Build succeeds cleanly (TypeScript compilation + CLI bundle + MCP bundle)
- One build warning: empty glob for platform installers (`init/**/*-installer.js`)

### Half-Implemented Features

- **Platform installers**: The build warns about `import("../../init/${name}-installer.js")` matching no files — the dynamic import pattern exists in `platform.ts` but no installer files exist.
- **Lint tooling**: ESLint config is `.js` but `package.json` has `"type": "module"`, causing ESLint to fail entirely with `module is not defined in ES module scope`. This means **zero lint enforcement** in local development.

### Risks

- **R-F1 (HIGH)**: ESLint is completely broken locally. The `.eslintrc.js` uses CommonJS `module.exports` but the project is ESM. Must be renamed to `.eslintrc.cjs`. This means code quality rules are not enforced.
- **R-F2 (MEDIUM)**: Platform installer glob warning suggests dead code or unfinished feature.
- **R-F3 (LOW)**: 3,010 `console.*` calls remain despite a refactoring commit claiming to replace 401 of them. Structured logger adoption is partial (149 files).

---

## D - Data: 7.5/10 (Delta: 0 from v3.8.3)

### Database Schema

- Unified SQLite persistence through `src/kernel/` (4 schema-related files)
- Schema management in `unified-memory-schemas.ts` and `unified-memory-migration.ts`
- Single migration file: `20260120_add_hypergraph_tables.ts`
- Memory database: `.agentic-qe/memory.db` (150K+ records per CLAUDE.md)

### Data Validation

| Validation Mechanism | Count | Assessment |
|---------------------|-------|------------|
| Zod schema validation | 0 uses | Absent — no runtime schema validation |
| Input validation files | 45 files with patterns | Partial — ad hoc, not systematic |
| Try-catch blocks | 2,604 | Defensive but not preventive |
| Catch blocks | 1,930 | 674 fewer catches than tries — some error swallowing |

**Critical Finding**: Zero Zod validations across the entire codebase. For a project with MCP tools accepting user input, CLI commands accepting flags, and database operations, the absence of any schema-based runtime validation is a significant gap. The project relies entirely on TypeScript compile-time types and ad hoc runtime checks.

### Data Flow

- Coverage data flow was unified in v3.8.10 (previously fabricated up to 95%)
- Hypergraph persistence unified in v3.8.7
- Session cache with SHA-256 fingerprinting added in v3.8.11
- Cross-phase memory with TTL and capacity eviction

### Risks

- **R-D1 (HIGH)**: Zero Zod/runtime schema validation. All MCP tool inputs rely on TypeScript types (compile-time only) and ad hoc checks. A malformed MCP request could pass invalid data through.
- **R-D2 (MEDIUM)**: 674 try blocks without corresponding catch (2,604 try vs 1,930 catch). Some errors may be silently swallowed.
- **R-D3 (MEDIUM)**: SQL allowlist pattern exists but `grep` for the specific variable names returned zero results — the allowlist mechanism may have been refactored or removed.

---

## I - Interfaces: 7/10 (Delta: +0.5 from v3.8.3)

### MCP Interface

- **44 MCP tool files** and **15 handler files**
- `ToolCategory` type is well-defined with 10 categories (core, task, agent, domain, coordination, memory, learning, routing, cross-phase, infra-healing)
- `ToolDefinition` interface includes name, description, parameters, category, domain, and lazyLoad flag
- ToolCategory references found in 56 source files (226 total occurrences) — consistent usage

### CLI Interface

- **34 command files** covering all major functionality
- Help output is clean, well-organized with descriptions
- `aqe init` has 15+ flags including platform integrations
- Shell completions supported via `aqe completions`
- Version flag works (`-V`)

### Interface Improvements Since v3.8.3

- ToolCategory enum is now properly defined and consistently used (was "fixed" in baseline notes)
- CLI code intelligence commands added (complexity, incremental indexing)
- Pipeline CLI with full CRUD + approval workflows
- Heartbeat CLI for scheduler management
- Routing CLI for economic and accuracy metrics

### Startup Noise

Both `aqe health` and `aqe status` emit 15+ lines of initialization logs before the actual output:
```
[INFO ] [ParserRegistry] tree-sitter WASM parsers available for: python, java, csharp, rust, swift
[AdversarialDefense] Guidance ThreatDetector loaded
[AdversarialDefense] Guidance CollusionDetector loaded
Auto-initializing v3 system...
[UnifiedMemory] Initialized: ...
[HybridBackend] Initialized with unified memory: ...
[RealEmbeddings] Loading model: Xenova/all-MiniLM-L6-v2
...
```
This is noisy for a CLI tool. Users want the answer, not the boot sequence.

### Risks

- **R-I1 (MEDIUM)**: CLI startup emits ~15 lines of internal initialization logging before useful output. This degrades the interface quality for all CLI consumers and makes scripting/piping unreliable.
- **R-I2 (LOW)**: No tool search capability noted in v3.8.3 baseline — status unclear if this was addressed.

---

## P - Platform: 5/10 (Delta: 0 from v3.8.3)

### CI Matrix

| Dimension | Actual | Claimed |
|-----------|--------|---------|
| Node version | 24 only (all 9 workflows) | `>=18.0.0` in engines field |
| OS | `ubuntu-latest` only (46 runs-on entries) | No claim |
| Browser testing | Playwright in sauce-demo-e2e | Chromium only |

**Every single workflow job** runs on `ubuntu-latest` with Node 24. There is zero matrix testing for:
- Node 18 (minimum claimed in `engines`)
- Node 20 (current LTS)
- Node 22 (active LTS)
- macOS
- Windows

### Platform-Specific Code

13 files contain platform-specific references (`process.platform`, `os.platform`, `path.win32`, etc.):
- `init/agents-installer.ts`, `init/skills-installer.ts` — platform paths
- `domains/visual-accessibility/` (5 files) — browser/viewport detection
- `cli/completions/index.ts` — shell detection
- `benchmarks/`, `performance/` — platform-aware benchmarking

These files have platform-conditional logic that is never tested on non-Linux platforms.

### Risks

- **R-P1 (HIGH)**: `engines: ">=18.0.0"` claims Node 18+ support but CI only tests Node 24. Node 18 and 20 compatibility is entirely unverified. Users on LTS nodes could hit runtime failures.
- **R-P2 (HIGH)**: Zero macOS/Windows CI coverage despite 13 files with platform-specific code paths.
- **R-P3 (MEDIUM)**: No matrix testing means dependency updates could break on older Node versions silently.

---

## O - Operations: 7.5/10 (Delta: 0 from v3.8.3)

### CI Workflow Health

| Metric | Value |
|--------|-------|
| Total workflows | 9 |
| Main CI (`optimized-ci.yml`) | 394 lines, 11 jobs |
| CI sharding | 4 parallel journey test shards |
| Timeout guards | Present (15-min per shard, 480s per command) |
| Concurrency control | PR-aware cancellation |

**Workflow Inventory**:
1. `optimized-ci.yml` — Main CI (11 sharded jobs)
2. `mcp-tools-test.yml` — MCP tool integration tests (6 jobs)
3. `sauce-demo-e2e.yml` — E2E browser tests (6 jobs)
4. `skill-validation.yml` — Skill validation
5. `benchmark.yml` — Performance benchmarks
6. `coherence.yml` — Coherence gate tests
7. `n8n-workflow-ci.yml` — n8n workflow tests
8. `npm-publish.yml` — Release publishing
9. `qcsd-production-trigger.yml` — Production quality triggers

### Build/Test/Lint Status

| Operation | Status | Notes |
|-----------|--------|-------|
| Build (`npm run build`) | PASS | Clean compilation, 1 non-fatal warning |
| Lint (`npm run lint`) | **FAIL** | ESLint config broken (CJS/ESM conflict) |
| Tests (`npm test`) | Running | Long execution time (>5 min locally) |

### Error Handling

- 2,604 try-catch blocks across the codebase
- Structured logger in 149 files
- 3,010 console.* calls remaining (mixed logging discipline)
- CI timeout guards on all jobs

### Improvements Since v3.8.3

- CI timeout guards added to remaining 5 unguarded commands
- `vitest` process hang handling implemented
- Junit reporter reliability improved
- 104 test files received `afterEach` cleanup
- 11 files received `vi.useFakeTimers()` for timer-based tests

### Risks

- **R-O1 (HIGH)**: ESLint is broken locally — `npm run lint` fails with `module is not defined in ES module scope`. If CI also uses this config, lint checks are not running.
- **R-O2 (MEDIUM)**: Test suite takes >5 minutes locally, suggesting CI sharding is necessary but local development feedback loop is slow.
- **R-O3 (LOW)**: 3,010 console.* calls create noise in production output. The refactoring commit addressed 401 but the bulk remains.

---

## T - Time: 6.5/10 (Delta: 0 from v3.8.3)

### Release Velocity

| Metric | Value |
|--------|-------|
| Releases in 11 days | 10 (v3.8.4 through v3.8.13) |
| Average release cadence | 1.1 days |
| Non-merge commits | 50 |
| Lines changed (last 10 commits) | 27,484 insertions, 13,650 deletions |

### Breaking Changes

- **Zero breaking changes** in recent commits (grep for `BREAKING|breaking change|deprecated` in git log returns empty)
- No deprecation markers in commit messages
- `@deprecated` annotations exist in source (part of 226 ToolCategory-related usages include migration/compat layer)

### Versioning

- Semantic versioning followed (patch increments only: 3.8.4 through 3.8.13)
- All changes are additive features or fixes — appropriate for patch/minor
- Some commits (RuVector Phase 5, YAML pipelines, session caching) are substantial features shipped as patch versions. By strict SemVer, these should be minor bumps.

### Concurrency Handling

- Session cache uses SHA-256 fingerprinting with TTL and capacity eviction
- Cross-phase memory with namespace isolation
- CI concurrency groups with PR-aware cancellation
- Domain circuit breaker registry for fault isolation

### Risks

- **R-T1 (MEDIUM)**: 10 releases in 11 days is extremely aggressive. Each release adds significant features (RuVector Phase 5, YAML pipelines, economic routing) that would normally warrant longer stabilization periods.
- **R-T2 (MEDIUM)**: Major features (RuVector Phase 5 with 456 new tests, YAML pipelines, session caching) are shipped as patch versions (3.8.x). SemVer best practice would use minor bumps for new features.
- **R-T3 (LOW)**: Rapid release cadence means consumers must update frequently to get security fixes (v3.8.6, v3.8.9) that are interleaved with feature changes.

---

## QX - Quality Experience: 6/10

### CLI Output Formatting

**Positive**:
- Help text is well-organized with clear command groupings
- `aqe health` provides a clean summary table with domain counts
- `aqe status` shows agent utilization
- `aqe init --help` shows extensive platform integration options
- Version number is accessible via `-V`

**Negative**:
- Every CLI command emits 15+ lines of initialization noise before useful output
- `[INFO]` and `[AdversarialDefense]` log lines pollute stdout
- No `--quiet` or `--json` output modes visible for common commands
- `aqe health` takes ~5 seconds to produce a 4-line status summary

### Error Message Clarity

**ESLint Failure**: The error message when running `npm run lint` is a raw Node.js stack trace about ES module scope. A user-friendly message explaining the CJS/ESM conflict would be more helpful.

**Build Warning**: The glob warning about missing platform installers is cryptic:
```
▲ [WARNING] The glob pattern import("../../init/**/*-installer.js") did not match any files
```
No guidance on whether this is expected or needs action.

### First-Run Experience

- `aqe init` provides `--wizard` for interactive setup
- `--auto` mode for project analysis
- Auto-initialization on first `aqe health` or `aqe status`
- Good: variety of `--with-*` flags for IDE integration
- Bad: initialization emits verbose debug logging that can overwhelm new users

### Risks

- **R-QX1 (MEDIUM)**: Startup noise is the single biggest QX issue. Every command dumps internal initialization state to stdout.
- **R-QX2 (LOW)**: No obvious `--json` output flag for machine consumption on status/health commands.
- **R-QX3 (LOW)**: 5-second startup time for simple health checks is slow for a CLI tool.

---

## Score Summary

| Factor | Score | v3.8.3 | Delta | Key Evidence |
|--------|-------|--------|-------|--------------|
| **Structure** | 5/10 | 5/10 | 0 | 91 files >1K lines (+1), 442 files >500 lines (37% violate rule), 78.7% code outside domains/ |
| **Function** | 8/10 | 7.5/10 | +0.5 | 10 releases, RuVector Phase 5, YAML pipelines, session caching, economic routing, code intelligence CLI |
| **Data** | 7.5/10 | 7.5/10 | 0 | Unified persistence, but zero Zod validation, 674 try-without-catch, coverage data flow fixed |
| **Interfaces** | 7/10 | 6.5/10 | +0.5 | ToolCategory stable, 44 MCP tools, 34 CLI commands, but noisy startup output |
| **Platform** | 5/10 | 5/10 | 0 | Still Node 24 only, Ubuntu only, engines claims >=18, 13 platform-specific files untested |
| **Operations** | 7.5/10 | 7.5/10 | 0 | 9 workflows, sharded CI, timeout guards; but ESLint broken, slow local tests |
| **Time** | 6.5/10 | 6.5/10 | 0 | 10 releases in 11 days, zero breaking changes, features shipped as patches |
| **QX** | 6/10 | N/A | N/A | Clean help text, but noisy startup, slow commands, broken lint |
| **Composite** | **6.4/10** | 6.5/10 | **-0.1** | Feature velocity improved, structural debt stable, ESLint regression |

---

## Top 10 Risks (Prioritized)

| # | Risk | Factor | Severity | Description |
|---|------|--------|----------|-------------|
| 1 | **R-F1** | Function | P0 | ESLint is completely broken (`module is not defined in ES module scope`). Zero lint enforcement locally. Rename `.eslintrc.js` to `.eslintrc.cjs`. |
| 2 | **R-P1** | Platform | P0 | `engines: ">=18.0.0"` but CI only tests Node 24. Node 18/20/22 compatibility unverified. |
| 3 | **R-D1** | Data | P1 | Zero Zod/runtime schema validation across 1,195 source files. MCP tool inputs have no runtime type checking. |
| 4 | **R-P2** | Platform | P1 | Zero macOS/Windows CI coverage despite 13 files with platform-specific code. |
| 5 | **R-S1** | Structure | P1 | 442 files (37%) violate the <500-line project rule. 91 files exceed 1,000 lines. |
| 6 | **R-I1** | Interfaces | P1 | CLI emits 15+ lines of initialization logs before useful output on every command. |
| 7 | **R-T1** | Time | P2 | 10 releases in 11 days; features (RuVector Phase 5, YAML pipelines) shipped as patches. |
| 8 | **R-S2** | Structure | P2 | 78.7% of source outside `domains/` contradicts DDD architecture claim. |
| 9 | **R-O3** | Operations | P2 | 3,010 console.* calls remaining; structured logger in only 149/1,195 files. |
| 10 | **R-D2** | Data | P2 | 674 try blocks without catch — potential silent error swallowing. |

---

## Recommended Improvements

### Immediate (P0)

1. **Fix ESLint**: Rename `.eslintrc.js` to `.eslintrc.cjs` to resolve CJS/ESM conflict
2. **Add Node version matrix**: CI should test Node 18, 20, 22, and 24

### Short-term (P1)

3. **Add Zod validation**: Start with MCP tool input schemas — these are the system boundary
4. **Suppress startup noise**: Route initialization logs to stderr or gate behind `--verbose`
5. **Add OS matrix**: At minimum, add `macos-latest` to key CI workflows
6. **Decompose large files**: Target the 15 files over 1,500 lines

### Medium-term (P2)

7. **DDD alignment**: Migrate `governance/`, `coordination/`, `learning/` under `domains/` or acknowledge the hybrid architecture
8. **Structured logging migration**: Replace remaining 3,010 console.* calls
9. **SemVer discipline**: Use minor bumps for new features, patches only for bug fixes
10. **Local test speed**: Add `vitest` project-level sharding for local development

---

## Methodology Notes

- Analysis performed on `march-fixes-and-improvements` branch at commit `a20e25e3`
- File counts exclude `*.test.ts` and `*.spec.ts` unless noted
- Line counts from `wc -l` (physical lines, not logical)
- CI analysis covers all 9 `.github/workflows/*.yml` files
- Build verified with `npm run build`; lint verified with `npm run lint`
- Test suite initiated but exceeded 5-minute timeout for this analysis
- Baseline comparison uses v3.8.3 QE swarm scores from 2026-03-19
