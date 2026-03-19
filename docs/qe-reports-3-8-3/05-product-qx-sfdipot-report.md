# Report 05: Product Factors & Quality Experience (SFDIPOT) - v3.8.3

**Date**: 2026-03-19
**Version**: 3.8.3 (baseline: v3.7.10)
**Agent**: qe-product-factors-assessor
**Framework**: James Bach's HTSM - SFDIPOT Analysis
**Methodology**: Evidence-based codebase inspection (no fabricated scores)

---

## Executive Summary

AQE v3.8.3 shows measurable improvement across 5 of 7 SFDIPOT dimensions since v3.7.10. The `typescript` dependency has been moved out of production, `execSync` calls have been largely replaced with safer `execFileSync`, and the skill system has undergone a major ADR-086 overhaul. However, structural debt continues to grow (90 files over 1000 lines, up from 30+ in v3.7.10), the CI matrix remains Node 24-only on Ubuntu-only, and MCP tool discoverability still lacks a search/categorization system exposed to users. The codebase is maturing in security posture and operational polish while accumulating complexity faster than it decomposes.

---

## SFDIPOT Scorecard

| Factor | v3.7.10 | v3.8.3 | Delta | Trend |
|--------|---------|--------|-------|-------|
| **Structure** | 6/10 | 5/10 | -1.0 | Regressing |
| **Function** | 7/10 | 7.5/10 | +0.5 | Improving |
| **Data** | 7/10 | 7.5/10 | +0.5 | Improving |
| **Interfaces** | 6/10 | 6.5/10 | +0.5 | Improving |
| **Platform** | 5/10 | 5/10 | 0 | Stagnant |
| **Operations** | 7/10 | 7.5/10 | +0.5 | Improving |
| **Time** | 6/10 | 6.5/10 | +0.5 | Improving |
| **COMPOSITE** | **6.3/10** | **6.5/10** | **+0.2** | **Improving** |

### Quality Experience (QX) Sub-scores

| Dimension | Score | Evidence |
|-----------|-------|----------|
| Developer Experience (DX) | 7/10 | Multi-platform init, 74 skills, README quick-start |
| First-time Setup | 7/10 | `aqe init --auto` works, but several past bugs (v3.7.18-v3.8.2) |
| Error Message Helpfulness | 6/10 | 692 structured error-utils sites, but console.* still dominates |
| Documentation Completeness | 6/10 | 50 release docs, 4 API docs, 3 guides -- sparse for 102+ tools |

**QX Composite: 6.5/10**

---

## 1. Structure (5/10) -- REGRESSING

### What the product IS

**Codebase Scale:**
| Metric | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| Source files (src/*.ts) | ~1,080 | 1,141 | +5.6% |
| Total LOC (src/) | ~460K | 535,669 | +16.4% |
| Files >1000 lines | 30+ | 90 | +200% |
| Files >500 lines | 429 | 438 | +2.1% |
| Files 500-1000 lines | ~399 | 348 | -12.8% |
| Test files | 623 | 689 | +10.6% |
| Top-level src directories | ~35 | 40 | +14% |
| Domain bounded contexts | 13 | 13 | Stable |

**Key Finding: File size explosion.** The count of files over 1000 lines has tripled from 30+ to 90. This is the single most concerning structural metric. These are not just large -- they are god-module scale:

| File | Lines | Role |
|------|-------|------|
| `learning/qe-reasoning-bank.ts` | 1,941 | Learning engine |
| `requirements-validation/qcsd-refinement-plugin.ts` | 1,861 | QCSD refinement |
| `contract-testing/services/contract-validator.ts` | 1,824 | Contract validation |
| `learning-optimization/coordinator.ts` | 1,775 | Learning coord |
| `test-generation/services/pattern-matcher.ts` | 1,769 | Pattern matching |
| `cli/commands/hooks.ts` | 1,746 | Hooks CLI |
| `cli/completions/index.ts` | 1,730 | CLI completions |
| `coordination/mincut/time-crystal.ts` | 1,714 | MinCut engine |
| `chaos-resilience/coordinator.ts` | 1,701 | Chaos coord |
| `requirements-validation/qcsd-ideation-plugin.ts` | 1,699 | QCSD ideation |

Every one of these files exceeds the CLAUDE.md mandate of "Keep files under 500 lines" by 3-4x.

**Architecture Patterns:**
- DDD bounded contexts: 13 domains under `src/domains/` -- well-structured
- Path aliases: 7 defined in tsconfig (`@/*`, `@shared/*`, `@kernel/*`, `@domains/*`, `@coordination/*`, `@adapters/*`, `@integrations/*`) -- good
- TypeScript strict mode: Fully enabled (strict, noImplicitAny, strictNullChecks, strictFunctionTypes, noImplicitReturns, noFallthroughCasesInSwitch) -- excellent
- Type safety: Only 7 `as any` casts, 0 `@ts-ignore` pragmas -- excellent
- Type definition files: 72 (`types.ts` or `interfaces.ts`) -- adequate

**Circular Dependency Detection:**
- No automated tooling (no madge, depcheck, or dpdm in dependencies)
- The v3.7.10 report noted 15 circular dependency chains
- Code comments reference circular deps (e.g., `domain-interface.ts`: "moved to shared/ to break the circular dependency")
- `code-intelligence/services/c4-model/index.ts` has circular dep detection code but for analyzed projects, not for AQE itself

**Strengths:**
- TypeScript strict mode fully enabled, zero ts-ignore
- DDD bounded context architecture is clear and consistent
- Path aliases reduce brittle relative imports

**Risks:**
- 90 files >1000 lines is unsustainable; every coordinator is a god file
- No automated circular dep detection in CI
- 40 top-level src directories suggests boundary erosion (causal-discovery, early-exit, strange-loop, etc. are not DDD bounded contexts)

**Score justification: 5/10** -- Down from 6/10. The tripling of >1000-line files is a significant regression. While type safety is excellent, the structural discipline is deteriorating faster than features are being decomposed.

---

## 2. Function (7.5/10) -- IMPROVING

### What the product DOES

**Capability Inventory:**

| Capability | Count | Status |
|------------|-------|--------|
| QE Agents | 53 (qe-*.md definitions) | Production |
| MCP Tools | 102+ (35 in tools/, rest in handlers) | Production |
| CLI Commands | 24 command files | Production |
| Skills | 117 directories, 74 documented in README | Production |
| Domain Bounded Contexts | 13 | Production |
| Platform Integrations | 11 coding agent platforms | Production |
| LLM Providers | 5 (Ollama, OpenRouter, Groq, Claude, Google) | Production |

**Feature Maturity Assessment:**

| Domain | Maturity | Evidence |
|--------|----------|----------|
| Test Generation | High | Multi-language (Go, Rust, Swift, Kotlin, Python, JUnit, xUnit), faker integration, pattern reuse |
| Coverage Analysis | High | O(log n) sublinear analysis, risk-weighted gap detection |
| Learning/Patterns | High | 150K+ patterns, FTS5 hybrid search, dream cycles, RVF export/import |
| Security Scanning | Medium | SAST (regex + semgrep), DAST (custom fetch), deps (OSV API) -- no real ZAP/TruffleHog |
| Chaos Resilience | Medium | Coordinator exists, fault injection stubs, but limited real chaos |
| Visual/A11y | Medium | axe-core integration, viewport capture, visual regression stubs |
| Enterprise Integration | Low | SAP/SOAP/ESB agents defined, 11% test coverage, limited real integration |
| Contract Testing | Medium-High | OpenAPI, GraphQL, Pact-style validation |
| Code Intelligence | Medium-High | C4 model, knowledge graph, LOC counter, dependency mapping |

**New in v3.8.x (since v3.7.10):**
- RuVector native HNSW backend (150x faster vector search) -- ADR-081
- Neural model routing (TinyDancer) -- ADR-082
- Coherence-gated agent actions -- ADR-083
- Cross-domain transfer learning -- ADR-084
- Temporal tensor compression (4x memory reduction) -- ADR-085
- ADR-086 skill design overhaul (84 skills restructured)
- 5 new skills, 5 on-demand hook skills
- Cognitive container export/import (RVF v2)
- Regret tracker, HNSW health monitor
- Behavior tree orchestration
- CNN visual regression

**@faker-js/faker in production deps:**
The v3.7.10 report flagged this as a P1 issue. It is still in production `dependencies`. However, unlike v3.7.10 where it was called a "phantom dependency", it is now actively imported in 10 source files across test generation generators (base, swift, pytest, junit5, kotlin, go, xunit, test-data-generator). This is a legitimate production dependency since AQE generates test code with faker data. The concern remains that it adds significant install size, but it is NOT phantom -- it is used.

**@claude-flow/guidance in production deps:**
Still present at `3.0.0-alpha.1`. Actively imported via dynamic `import()` in governance integration (trust-accumulator-integration.ts, governance-installer.ts, phases/13-governance.ts). Has a TODO: "Replace @claude-flow/guidance with @ruflo/guidance when published." This is a real dependency, not phantom, but it is an alpha package that may not be published.

**Score justification: 7.5/10** -- Up from 7/10. Significant capability additions (RuVector, TinyDancer, coherence gates, skill overhaul). Function breadth is excellent. Maturity remains uneven -- enterprise integration and chaos resilience are still thin. Security scanner overclaims have been addressed in documentation.

---

## 3. Data (7.5/10) -- IMPROVING

### What it PROCESSES

**Database Architecture:**
- Unified SQLite via better-sqlite3 (single DB, single schema)
- `openSafeDatabase` wrapper: WAL mode, busy_timeout=5000ms, foreign_keys=ON
- SQL table allowlist: 42 tables validated via `ALLOWED_TABLE_NAMES`
- SQL identifier validation: Regex-based (`/^[a-z_][a-z0-9_]{0,62}$/`)
- PostgreSQL sync support via `pg` package
- 150K+ learning patterns in production database

**Data Integrity Measures:**

| Measure | Status | Evidence |
|---------|--------|----------|
| SQL allowlist | Active | `shared/sql-safety.ts` with 42 tables, `validateTableName()` |
| SQL identifier regex | Active | `validateIdentifier()` for dynamic column/table names |
| Safe JSON parsing | Mature | 322 sites using `safeJsonParse` / `secure-json-parse` |
| WAL mode enforcement | Active | `openSafeDatabase` wrapper used consistently |
| DB path safety | Fixed | Tests no longer accidentally open production DB (v3.7.16 fix) |
| WAL checkpoint before export | Active | Brain checkpoint runs WAL checkpoint (v3.7.16) |
| Integrity checks | Active | 150 sites with PRAGMA/backup/WAL patterns |

**Runtime Schema Validation:**
- Zod: 1 reference found -- effectively absent
- Joi: 23 references -- minimal (likely in enterprise-integration domain)
- No runtime schema validation for MCP tool inputs beyond basic type checking
- TypeScript compile-time types provide static safety but no runtime protection
- MCP inputSchema definitions exist but are not enforced with a validation library

**Data Migration:**
- 1 migration file (`20260120_add_hypergraph_tables.ts`) -- migrations are sparse
- Schema creation is done inline in `sqlite-persistence.ts` with `CREATE TABLE IF NOT EXISTS`
- Idempotent schema creation is good, but there is no formal migration versioning system

**Improvements since v3.7.10:**
- DB path safety redirect (v3.7.16): Tests can no longer corrupt production DB
- FTS5 hybrid search (v3.7.15): Better pattern retrieval
- WAL checkpoint before RVF export (v3.7.16): Data consistency
- Swallowed promise handlers replaced with structured logging (v3.7.21)
- SQL allowlist now includes hypergraph tables, captured_experiences, witness_chain

**Remaining Risks:**
- No runtime schema validation library (Zod/Joi) for MCP inputs
- Only 1 formal migration file; schema evolution relies on `IF NOT EXISTS` patterns
- `@claude-flow/guidance` alpha dependency could break data contracts

**Score justification: 7.5/10** -- Up from 7/10. SQL allowlist expanded, DB safety improved, FTS5 added. Still lacks runtime schema validation for MCP inputs, which is the primary remaining gap.

---

## 4. Interfaces (6.5/10) -- IMPROVING

### How it CONNECTS

**MCP Tool Interface:**

| Metric | v3.7.10 | v3.8.3 |
|--------|---------|--------|
| Total MCP tools | 102 | 102+ |
| Tool categories defined | 10 | 10 |
| Tool categories initialized | 7 | 10 (fixed) |
| SEC-001 input validation | Yes | Yes |
| Tool discoverability/search | No | No |

ToolCategory now defines 10 categories: `core`, `task`, `agent`, `domain`, `coordination`, `memory`, `learning`, `routing`, `cross-phase`, `infra-healing`. The v3.7.10 mismatch (7 initialized vs 10 defined) has been addressed.

**CLI Interface:**
- 24 command files in `src/cli/commands/`
- Commander.js-based with subcommands
- `cli/completions/index.ts` at 1,730 lines provides shell completions
- Error messages use `toErrorMessage()` utility (692 sites)
- chalk-based colored output

**API Consistency:**

| Pattern | Adoption | Notes |
|---------|----------|-------|
| ToolResult<T> typed returns | Consistent | Across all MCP handlers |
| SEC-001 input validation | All MCP tools | Tool name format, parameter schema, string sanitization |
| Circuit breakers | 262 sites | Three-tier pattern (connection, service, tool) |
| Structured errors (error-utils) | 692 sites | Good adoption |
| console.* unstructured | 3,409 sites | Still dominates over structured logging (553 logger sites) |

**Input Validation at Boundaries:**
- MCP: SEC-001 validation on all tools (name format, params, sanitization)
- CLI: Commander.js argument parsing with basic validation
- DB: SQL allowlist + identifier regex
- Missing: No Zod/Joi runtime validation for complex input shapes

**Error Message Quality:**
- `toErrorMessage()` provides consistent error formatting
- CLI commands catch errors and display with chalk coloring
- MCP handlers return structured ToolResult with error fields
- 0 silent catch blocks (down from 130 in v3.7.0) -- excellent

**Improvements since v3.7.10:**
- ToolCategory mismatch fixed (10/10 categories now initialized)
- MCP tool prefix mismatch fixed (v3.8.1): `mcp__agentic-qe__` consistent
- Permission pattern mismatch fixed (v3.8.1)
- Better error messages for init failures

**Remaining Risks:**
- No MCP tool discoverability system (users cannot search/filter 102+ tools)
- MCP protocol server hardcodes version `'3.0.0'` instead of reading from package.json
- `required: true` still missing on some MCP params that are actually required (only 2 `required` references in MCP types)
- Bundle sizes still large: CLI 9.8MB, MCP 12MB (no minification)

**Score justification: 6.5/10** -- Up from 6/10. ToolCategory and prefix mismatches fixed. SEC-001 validation mature. Still lacks tool discoverability and runtime input validation.

---

## 5. Platform (5/10) -- STAGNANT

### What it DEPENDS ON

**Node.js Version:**
- `engines.node`: `>=18.0.0` (claimed)
- CI workflows: **Node 24 only** across all 9 workflow files (20 occurrences)
- Dockerfile: Uses `node:18-alpine` -- matches claimed minimum
- No multi-version CI matrix exists
- **Gap**: Claims Node >=18 support but tests only on Node 24

**Operating System:**
- CI: `ubuntu-latest` exclusively (30 `runs-on` entries, zero Windows or macOS)
- Windows handling in source: 18 references (mostly `process.platform === 'win32'`)
  - `agents-installer.ts`: Windows npm global path detection
  - `skills-installer.ts`: Windows npm global path detection
  - `phases/10-workers.ts`: `.cmd` extension for npx on Windows
  - `vitest-executor.ts`: `.cmd` extension for npx on Windows
- **Gap**: Basic Windows path handling exists but is never tested in CI

**Docker Support:**
- `Dockerfile` exists: Multi-stage build, node:18-alpine, non-root user, health check
- `tests/docker-compose.test.yml`: PostgreSQL test container
- No Docker mentioned in CI workflows (0 Docker references)
- Docker image is not published or tested in CI

**Native Binary Compatibility (RuVector):**
- 15 optional native dependencies covering:
  - darwin-arm64, darwin-x64
  - linux-arm64-gnu, linux-arm64-musl (aliased to gnu)
  - linux-x64-gnu, linux-x64-musl (aliased to gnu)
- **Missing**: Windows native binaries entirely
- Graceful degradation: FlashAttention and DecisionTransformer degrade when natives unavailable (v3.7.16 fix)

**Improvements since v3.7.10:**
- ARM64 install failure fixed (v3.8.0): tiny-dancer moved to optionalDependencies
- Graceful native module degradation (v3.7.16)
- No new OS or Node version testing added

**Evidence of Platform Blind Spots:**
1. CI only tests Node 24 on Ubuntu -- no coverage of claimed Node 18/20 support
2. Windows is handled in code but never tested
3. macOS is not tested despite darwin native binaries being published
4. Docker image is never built or tested in CI
5. musl binaries are aliased to gnu variants -- may fail on Alpine without testing

**Score justification: 5/10** -- No change from v3.7.10. The fundamental gaps remain: single Node version, single OS in CI. Native binary graceful degradation is an improvement, but the testing gap is unchanged. The `engines.node >= 18` claim is effectively marketing without CI evidence.

---

## 6. Operations (7.5/10) -- IMPROVING

### How it's USED

**CI/CD Maturity:**

| Metric | v3.7.10 | v3.8.3 | Notes |
|--------|---------|--------|-------|
| CI workflows | ~5 | 9 | +4 workflows |
| CI parallelism | Low | High | Journey tests split into 4 shards |
| Performance gates | Yes | Yes | Run after test shards complete |
| Coverage analysis | Yes | Yes | PR-only, with threshold check |
| Postgres integration | Yes | Yes | Docker service in CI |
| Publish workflow | Yes | Yes | OIDC provenance, version verification |
| Benchmark workflow | New | Yes | Dedicated benchmark CI |
| Skill validation workflow | New | Yes | Automated skill linting |
| Coherence workflow | New | Yes | Coherence checks |
| MCP tools test workflow | New | Yes | Dedicated MCP testing |

The CI has been significantly improved with sharded test execution (v3.8.3 PR #350 fix), dedicated benchmark, skill validation, coherence, and MCP testing workflows.

**Deployment Process:**
- npm publish via GitHub Actions on release tag
- Build verification: typecheck, build, CLI/MCP bundle smoke test
- Version verification: package.json vs git tag
- OIDC provenance for npm publish -- excellent supply chain security
- Dry run support via workflow_dispatch

**Documentation Completeness:**

| Category | Count | Quality |
|----------|-------|---------|
| Release notes (docs/releases/) | 50 files | Good -- individual release docs |
| CHANGELOG.md | Comprehensive | Follows Keep a Changelog format |
| README.md | ~300 lines | Good quick start, platform matrix, agent table |
| API docs (docs/api/) | 4 files | Sparse -- browser-swarm, security-scanner, trajectory, workflow-templates |
| User guides (docs/guides/) | 3 files | Sparse -- fleet-code-intel, reasoningbank, skill-validation |
| Architecture docs (docs/architecture/) | Present | ADR directory exists |
| Skills documentation | 44,909 lines across 117 SKILL.md files | Extensive |
| Docs directory total | 72 items | Many plans/analysis docs, few user-facing guides |

**Onboarding Experience:**
- `aqe init --auto` provides automated setup with platform detection
- Multi-platform init: 11 coding agent platforms supported
- Quick start in README is clear: install, init, use
- Past bugs in init flow (v3.7.18 ESM path, v3.8.2 YAML frontmatter, v3.8.3 portable paths) suggest the init path has been fragile

**Improvements since v3.7.10:**
- CI split into parallel shards (4 journey shards + dedicated test jobs)
- Skill validation CI workflow added
- MCP tools test workflow added
- Benchmark CI workflow added
- ADR-086 skill overhaul: 84 skills restructured with composition, gotchas, references
- 5 new skills (test-failure-investigator, coverage-drop-investigator, etc.)
- Proof-of-Quality CLI command (`aqe prove`) -- v3.7.15
- Structured validation pipeline (13 steps) -- v3.7.17
- 50 release docs (up from ~30 in v3.7.10)

**Remaining Risks:**
- Only 4 API docs for 102+ MCP tools -- most tools are undocumented beyond inline descriptions
- Only 3 user guides -- no "Getting Started" or "Common Workflows" guide
- Console.* still dominates (3,409 vs 553 structured logger) -- operational observability gap
- 113 `process.exit()` calls across source (many in CLI learning.ts) bypass cleanup

**Score justification: 7.5/10** -- Up from 7/10. CI significantly matured with sharding and dedicated workflows. Skill documentation is extensive. User-facing documentation (guides, API docs) remains sparse for the scale of the system.

---

## 7. Time (6.5/10) -- IMPROVING

### WHEN things happen

**Release Cadence:**
- 209 total git tags (all versions)
- 15 releases from v3.7.10 to v3.8.3 (v3.7.10 through v3.8.3)
- 95 commits between v3.7.10 and v3.8.3
- Approximately 13 days between v3.7.10 (2026-03-06) and v3.8.3 (2026-03-18)
- Release pace: ~1 release per day during active development

**Semantic Versioning Compliance:**

| Version Bump | Count (v3.7.10 to v3.8.3) | Actual Breaking Changes |
|-------------|---------------------------|------------------------|
| Patch (3.7.x) | 12 (v3.7.11 to v3.7.22) | 0 formal breaking changes |
| Minor (3.8.0) | 1 | Feature additions (RuVector, TinyDancer) |
| Patch (3.8.x) | 3 (v3.8.1 to v3.8.3) | 0 formal breaking changes |

CHANGELOG explicitly states "No breaking changes" / "zero breaking changes" for most releases. The v3.8.0 minor bump is appropriate for the feature additions (RuVector, coherence gates, etc.).

**Breaking Change Analysis:**
- 14 total references to "breaking" in CHANGELOG
- Most are "No breaking changes" disclaimers
- Historical: v3.5.0 had "Breaking Changes" section (async method signatures)
- The v3.7.10 report claimed "15 breaking changes within 3.x semver" -- this appears to reference accumulated behavioral changes, not formal semver-breaking API changes
- Within v3.7.10-v3.8.3: No formal `BREAKING CHANGE:` entries

**Deprecation Policy:**
- 180 deprecation markers (`@deprecated` or `DEPRECATED`) in source -- active deprecation tracking
- V2 migration code removed in v3.7.22 (~2,400 lines)
- 3 redundant skills removed in v3.8.3 with auto-cleanup via `aqe init --upgrade`
- No formal deprecation timeline or policy document

**Concurrency and Timing:**
- Parallel test execution via journey test shards
- Performance gates run after test shards complete (dependency ordering correct)
- CI concurrency control: cancel-in-progress on PRs, never on main
- `busy_timeout=5000ms` on SQLite operations
- `HEALTHCHECK --interval=30s` in Dockerfile

**Improvements since v3.7.10:**
- No formal BREAKING CHANGE entries in any release (semver discipline improved)
- V2 migration code removed cleanly
- Redundant skills removed with upgrade path
- Active deprecation markers (180 sites)
- CI concurrency management implemented

**Remaining Risks:**
- No formal deprecation policy document
- ~1 release/day pace makes it difficult for users to track changes
- MCP protocol server hardcodes `version: '3.0.0'` -- stale version reporting
- No automated semver check in CI (e.g., semantic-release or commitlint)

**Score justification: 6.5/10** -- Up from 6/10. Semver discipline has improved with no breaking changes in recent releases. V2 migration cleanly removed. Still lacks formal deprecation policy and automated semver enforcement.

---

## Detailed Delta Analysis (v3.7.10 vs v3.8.3)

### Resolved P0-P1 Items from v3.7.10

| # | Item | Status | Evidence |
|---|------|--------|----------|
| P0-1 | Command injection in claim-verifier | Partial | 21 `execSync` converted to `execFileSync` (v3.7.21), but 32 `execSync` remain |
| P0-2 | SQL allowlist gap (3 tables) | RESOLVED | `ALLOWED_TABLE_NAMES` expanded to 42 tables including hypergraph, captured_experiences, witness_chain |
| P0-3 | ToolCategory registration mismatch | RESOLVED | 10/10 categories now initialized |
| P1-4 | Move typescript to devDependencies | RESOLVED | `typescript: ^5.9.3` now in `devDependencies` |
| P1-5 | Remove phantom @claude-flow/guidance and @faker-js/faker | NOT PHANTOM | Both are actively imported; @faker-js/faker in 10 generator files, @claude-flow/guidance in governance integration |
| P1-6 | Enable bundle minification | NOT DONE | CLI: 9.8MB, MCP: 12MB (still unminified) |
| P1-7 | Fix 20x process.exit() | REGRESSED | Now 113 occurrences across source (was 20x in v3.7.10) |
| P1-8 | Decompose createHooksCommand | NOT DONE | `hooks.ts` still 1,746 lines |
| P1-9 | Add Node 18/20 to CI matrix | NOT DONE | Still Node 24 only |
| P1-10 | Fix protocol version mismatch | NOT DONE | Still hardcodes `'3.0.0'` |

### New Risks Identified in v3.8.3

| # | Risk | Severity | Category |
|---|------|----------|----------|
| N1 | 90 files over 1000 lines (3x increase) | HIGH | Structure |
| N2 | 535K LOC in src/ (16% growth in 13 days) | MEDIUM | Structure |
| N3 | 113 process.exit() calls (6x increase from reported 20x) | HIGH | Operations |
| N4 | 3,409 console.* vs 553 structured logger | MEDIUM | Operations |
| N5 | MCP server version hardcoded to '3.0.0' | LOW | Interfaces |
| N6 | No runtime schema validation (Zod: 1 ref, Joi: 23 refs) | MEDIUM | Data |
| N7 | CLI/MCP bundles unminified (9.8MB + 12MB) | MEDIUM | Interfaces |
| N8 | 32 remaining execSync calls in source | MEDIUM | Security/Interfaces |

---

## Priority Matrix (v3.8.3)

### P0 - Release Blockers

1. **File size explosion**: 90 files over 1000 lines violates the project's own CLAUDE.md standard. Top 10 files are 1700-1941 lines. This is technical debt accruing compound interest.

### P1 - Next Sprint

2. Decompose top 10 god files (all >1700 lines) into modules under 500 lines
3. Replace remaining 32 `execSync` calls with `execFileSync` for shell injection prevention
4. Enable esbuild minification for CLI and MCP bundles (estimated 50% size reduction)
5. Add Node 18 and Node 20 to CI test matrix (match `engines.node >= 18` claim)
6. Fix MCP protocol server version to read from package.json instead of hardcoding '3.0.0'
7. Reduce `process.exit()` from 113 to <20 (use graceful shutdown patterns)

### P2 - Medium Term

8. Add automated circular dependency detection in CI (madge or dpdm)
9. Add Windows CI testing or formally document as unsupported
10. Adopt Zod for runtime validation of MCP tool inputs
11. Migrate 3,409 non-CLI console.* calls to structured logger
12. Create "Getting Started" guide for new users (beyond README quick-start)
13. Create MCP tool discoverability/search system
14. Generate API documentation for MCP tools (auto-generate from tool definitions)
15. Add macOS CI testing (darwin native binaries exist but are untested)

### P3 - Backlog

16. Consolidate 40 top-level src directories into proper bounded contexts
17. Add formal deprecation policy document
18. Add automated semver enforcement in CI (commitlint/semantic-release)
19. Build and test Docker image in CI
20. Publish Docker image to container registry
21. Add source maps to production bundles
22. Add property-based testing with fast-check

---

## Evidence Methodology

All scores are derived from direct codebase inspection. Commands run:

- `wc -l` on all 1,141 source files for LOC analysis
- `grep -rn` for pattern counting (console.*, process.exit, as any, etc.)
- Direct file reads of package.json, tsconfig.json, CI workflows, CHANGELOG.md
- `npm audit --production` for vulnerability scan (0 found)
- `ls -lh` for bundle size measurement
- `git tag` and `git log` for release cadence analysis
- Inspection of sql-safety.ts, protocol-server.ts, tool-registry.ts for interface quality

No scores were fabricated or interpolated from prior reports.

---

## Appendix A: Complete File Size Distribution

| Range | Count | % of 1,141 |
|-------|-------|------------|
| 1-100 lines | ~250 | 21.9% |
| 101-500 lines | ~453 | 39.7% |
| 501-1000 lines | 348 | 30.5% |
| 1001-2000 lines | 90 | 7.9% |
| >2000 lines | 0 | 0% |

## Appendix B: Dependency Health

| Category | Count | Notes |
|----------|-------|-------|
| Production deps | 25 | Down from 26 (typescript moved) |
| Dev deps | 17 | Standard toolchain |
| Optional deps | 15 | RuVector native binaries |
| npm audit vulnerabilities | 0 | Clean |
| `as any` casts | 7 | Excellent |
| `@ts-ignore` pragmas | 0 | Perfect |
| Silent catch blocks | 0 | Down from 130 (v3.7.0) |
| safeJsonParse adoption | 322 sites | Mature |
| Math.random usage | 24 | Down from 173 (v3.7.0) |

## Appendix C: CI Workflow Coverage

| Workflow | Trigger | Node | OS |
|----------|---------|------|----|
| optimized-ci.yml | push/PR main,develop | 24 | ubuntu |
| npm-publish.yml | release published | 24 | ubuntu |
| skill-validation.yml | push/PR | env var | ubuntu |
| benchmark.yml | schedule/dispatch | 24 | ubuntu |
| sauce-demo-e2e.yml | push/PR | 24 | ubuntu |
| coherence.yml | push/PR | - | ubuntu |
| mcp-tools-test.yml | push/PR | - | ubuntu |
| n8n-workflow-ci.yml | push/PR | - | ubuntu |
| qcsd-production-trigger.yml | push/PR | - | ubuntu |

**Missing**: Windows, macOS, Node 18, Node 20, Node 22, Docker build
