# Product Factors & Quality Experience (QX) Analysis Report
## AQE v3.7.10 -- SFDIPOT Framework (James Bach, HTSM)

**Report Date**: 2026-03-06
**Version Analyzed**: 3.7.10
**Framework**: SFDIPOT (Structure, Function, Data, Interfaces, Platform, Operations, Time)
**Assessor**: QE Product Factors Assessor (V3)

---

## Executive Summary

AQE v3.7.10 is a large-scale TypeScript project (1,077 source files, ~511K lines of code) implementing a domain-driven quality engineering platform with CLI, MCP server, 53 specialized agents, 117 skills, and 13 bounded domain contexts. This analysis applies James Bach's SFDIPOT framework from the Heuristic Test Strategy Model to evaluate product quality across all seven factors, supplemented by a Quality Experience (QX) assessment.

**Overall Product Quality Score: 6.4 / 10**

| Factor | Score | Verdict |
|--------|-------|---------|
| Structure | 6 / 10 | Ambitious architecture with significant file-size violations |
| Function | 7 / 10 | Broad capability surface; completeness impressive |
| Data | 7 / 10 | Unified SQLite persistence well-designed; 30-table schema |
| Interfaces | 6 / 10 | CLI functional but MCP tool sprawl is a discoverability risk |
| Platform | 5 / 10 | Linux-first; Windows and native dep compatibility are weak |
| Operations | 7 / 10 | CI/CD mature; documentation and monitoring are gaps |
| Time | 6 / 10 | Rapid release cadence; breaking changes are controlled |
| **QX (Quality Experience)** | **5 / 10** | First-time onboarding is steep; expert UX is solid |

---

## 1. STRUCTURE -- What the Product IS

**Score: 6 / 10**

### 1.1 Architecture Components and Relationships

The project follows Domain-Driven Design with 13 bounded contexts under `src/domains/`:

| Domain | Purpose |
|--------|---------|
| chaos-resilience | Fault injection and resilience testing |
| code-intelligence | Codebase analysis, C4 models, knowledge graphs |
| contract-testing | API contract validation |
| coverage-analysis | O(log n) coverage gap detection |
| defect-intelligence | Defect prediction and trend analysis |
| enterprise-integration | Third-party integration patterns |
| learning-optimization | ReasoningBank ML-based learning |
| quality-assessment | Quality scoring and assessment |
| requirements-validation | QCSD-driven requirements analysis |
| security-compliance | OWASP, SAST, compliance checking |
| test-execution | Test runner orchestration |
| test-generation | Multi-language test code generation |
| visual-accessibility | WCAG, visual regression, a11y |

Supporting infrastructure layers:
- **Kernel** (`src/kernel/`): Unified memory, HNSW vector search, event bus -- 19 files
- **Shared** (`src/shared/`): Common utilities, LLM router, parsers, security -- 21+ subdirectories
- **Coordination** (`src/coordination/`): Queen coordinator, protocols, consensus, workflow orchestration
- **Adapters** (`src/adapters/`): A2A (agent-to-agent), AG-UI, A2UI, Claude Flow bridge

**Finding: Clean layered architecture in principle.** The kernel does not import from domains (verified: no upward imports from `src/kernel/`). Path aliases in `tsconfig.json` (`@domains/*`, `@kernel/*`, etc.) enforce bounded context separation.

### 1.2 File/Module Organization Quality

**CRITICAL FINDING: Massive 500-line rule violations.**

The project's own `CLAUDE.md` mandates files under 500 lines. In practice:

| Lines | File | Factor Over Limit |
|-------|------|-------------------|
| 1,941 | `src/learning/qe-reasoning-bank.ts` | 3.9x |
| 1,861 | `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 3.7x |
| 1,824 | `src/domains/contract-testing/services/contract-validator.ts` | 3.6x |
| 1,769 | `src/domains/test-generation/services/pattern-matcher.ts` | 3.5x |
| 1,750 | `src/domains/learning-optimization/coordinator.ts` | 3.5x |
| 1,730 | `src/cli/completions/index.ts` | 3.5x |
| 1,714 | `src/coordination/mincut/time-crystal.ts` | 3.4x |
| 1,702 | `src/cli/commands/hooks.ts` | 3.4x |

**All 13 domain coordinators exceed 500 lines**, with the largest at 1,750 lines. This suggests the coordinator pattern is absorbing too much responsibility -- a classic God Object smell.

The top 30 largest files all exceed 1,000 lines. This is not a minor deviation; it is a systemic pattern that the team's own standards do not control.

### 1.3 Dependency Graph Health

**Production dependencies**: 22 direct, 12 optional (native platform binaries)
**Dev dependencies**: 13

Noteworthy dependency choices:
- `better-sqlite3` (native C++ addon) -- good performance, but complicates cross-platform installs
- `@xenova/transformers` -- heavy ML inference dependency for embeddings
- `hnswlib-node` -- another native addon for vector similarity search
- `@ruvector/*` -- custom native modules with musl-to-gnu aliasing workarounds
- `@faker-js/faker` in **production** dependencies -- this is a test data library that should be in devDependencies (or justified with a comment)

**Risk**: Three native C++ addons (`better-sqlite3`, `hnswlib-node`, `@ruvector/*`) create installation friction on platforms without build toolchains. The `optionalDependencies` with `npm:` aliasing for musl/gnu is a clever workaround but adds brittleness.

**No circular dependency detection tooling** is configured (no `madge`, `dpdm`, or `circular-dependency-plugin`). Given the codebase size (1,077 files), this is a testing gap.

### 1.4 Configuration File Completeness

| Config File | Present | Quality |
|-------------|---------|---------|
| `package.json` | Yes | Well-structured; 98 scripts defined (excessive -- many are aliases) |
| `tsconfig.json` | Yes | Strict mode enabled; path aliases configured |
| `vitest.config.ts` | Yes | Good test isolation via temp directories |
| `.eslintrc` | Implicit | Uses `@typescript-eslint` but versions have 6 high-severity audit findings |
| `.github/workflows/` | Yes (9) | CI/CD coverage is comprehensive |
| `CHANGELOG.md` | Yes | Follows Keep a Changelog format correctly |

**Finding**: 98 npm scripts is excessive. Many are thin aliases (e.g., `test:all` = `npm test -- --run`). This creates cognitive load when onboarding.

---

## 2. FUNCTION -- What the Product DOES

**Score: 7 / 10**

### 2.1 Core Capabilities Inventory

| Capability | Interface | Status |
|------------|-----------|--------|
| Test generation (12+ languages) | CLI + MCP | Functional |
| Coverage gap analysis | CLI + MCP | Functional |
| Flaky test detection | CLI + MCP | Functional |
| Defect prediction | MCP | Functional |
| Security scanning | CLI + MCP | Functional |
| Contract validation | CLI + MCP | Functional |
| Requirements analysis (QCSD) | MCP + Agents | Functional |
| Visual regression / a11y | CLI + MCP | Functional |
| Agent fleet management | CLI + MCP | Functional |
| Learning/ReasoningBank | Internal | Functional |
| Code intelligence (C4, KG) | CLI + MCP | Functional |
| Init wizard (11 platforms) | CLI | Functional |
| Shell completions | CLI | Functional |
| Cloud sync (Postgres) | CLI | Functional |

**22 CLI commands** registered under `src/cli/commands/`.
**~102 MCP tools** registered across `src/mcp/tools/`.
**53 QE agent definitions** in `.claude/agents/v3/qe-*.md`.
**117 skills** in `.claude/skills/`.

### 2.2 Feature Completeness Assessment

The feature surface is impressively broad. However, breadth raises the question: **which features are production-hardened vs. MVP-level?**

**Evidence of production hardening**:
- Loki-Mode anti-sycophancy gates (v3.7.8) -- sophisticated quality controls
- Compilation validation loop for generated tests (v3.7.9)
- Resource blocking for E2E tests with 30+ tracker domains (v3.7.7)
- Adaptive locator fallback chain for selector resilience (v3.7.7)

**Evidence of MVP-level features**:
- Cloud sync requires external Postgres -- no documentation on setup beyond CLI flags
- Browser stealth testing via Patchright is "optional" with lazy-loading
- The 117 skills vary dramatically in maturity (some are tier-0 advisory-only, others tier-3 with eval infrastructure)

### 2.3 Error Handling Robustness

CLI error handling uses a consistent pattern:
- 81 `catch` blocks across 20 CLI files
- `toErrorMessage()` utility from `src/shared/error-utils.ts` for safe error stringification
- `chalk.red` used for visual error emphasis in terminal output
- Graceful process exit with a 3-second forced timeout (`setTimeout(() => process.exit(code), 3000)`)

**Finding**: The error handling is adequate but not exceptional. There is no structured error taxonomy (error codes, categories) that would allow programmatic error recovery by consumers.

### 2.4 CLI Command Usability

CLI uses `commander` with well-structured subcommands. Each command has a `.description()`. Shell completions are supported for bash, zsh, and fish.

**Gap**: No `--help` output was found to include usage examples. Commander's default help is functional but terse. A first-time user running `aqe test generate --help` would benefit from inline examples.

---

## 3. DATA -- What the Product PROCESSES

**Score: 7 / 10**

### 3.1 Data Flow Analysis

```
User Input (CLI args / MCP JSON-RPC)
  --> Command Parser (commander / protocol-server)
    --> Domain Coordinator
      --> Domain Service(s)
        --> UnifiedMemory (SQLite via better-sqlite3)
        --> HNSW Vector Index (hnswlib-node)
        --> External LLM (via router)
      <-- Results
    <-- Formatted Output (chalk/JSON/streaming)
  --> stdout / MCP response
```

The data flow is clean with clear entry points. All persistence goes through `UnifiedMemoryManager` (kernel layer).

### 3.2 Data Validation at Boundaries

Input validation is done through **custom validators** rather than schema validation libraries (no Zod, Joi, or Ajv detected in source). Validation found in:
- `src/init/` modules (15 files with validation patterns)
- `src/validation/` module
- `src/mcp/middleware/` (request validation)
- `src/shared/security/` (input sanitization)
- `secure-json-parse` for safe JSON deserialization
- `sql-safety.ts` for SQL injection prevention

**Finding**: The absence of a schema validation library like Zod is notable. Custom validators are harder to audit for completeness. For a project of this size, type-safe runtime validation would reduce risk.

### 3.3 Database Schema Design Quality

**30 tables** in `src/kernel/unified-memory-schemas.ts`, at **schema version 8**:

Core tables:
- `kv_store` -- namespaced key-value with TTL
- `vectors` -- vector embeddings storage
- `rl_q_values` -- reinforcement learning Q-values
- `goap_goals/actions/plans/plan_signatures` -- goal-oriented action planning
- `concept_nodes/edges` -- knowledge graph
- `dream_cycles/insights` -- neural consolidation
- `qe_patterns/embeddings/usage` -- pattern learning
- `qe_trajectories` -- agent trajectory tracking
- `embeddings` -- general embedding store
- `execution_results/executed_steps` -- test execution history
- `mincut_snapshots` -- graph analysis snapshots

Plus hypergraph tables (imported from migration file) and feedback loop persistence tables.

**Strengths**:
- Unified persistence (one DB, one schema) as mandated by architecture docs
- Schema versioning with migration support
- Namespaced key-value store for multi-tenant isolation
- Test isolation via `AQE_PROJECT_ROOT` env var pointing to temp directories

**Risks**:
- 30 tables in a single SQLite file. At 150K+ records (per CLAUDE.md), WAL mode and concurrent access patterns need careful management
- No explicit index definitions visible in the schema excerpt (would need full file review)
- `better-sqlite3` is synchronous -- under heavy MCP tool load, this could block the event loop

### 3.4 Memory/Learning Data Management

The project treats `.agentic-qe/memory.db` as irreplaceable production data (150K+ learning records). CLAUDE.md has 7 explicit data protection rules including mandatory backups and integrity checks.

Learning data flows through:
- `qe-reasoning-bank.ts` (1,941 lines -- the largest file in the project)
- `real-qe-reasoning-bank.ts` (1,347 lines)
- `learning-optimization` domain coordinator (1,750 lines)

**Finding**: The learning subsystem is the largest and most complex part of the codebase. Its concentration in a few very large files makes it a testing risk.

---

## 4. INTERFACES -- How Users INTERACT

**Score: 6 / 10**

### 4.1 CLI UX Analysis

**Binary names**: `aqe`, `agentic-qe`, `aqe-v3` (three aliases for the same binary)
**MCP binary**: `aqe-mcp`

Command structure follows a two-level pattern: `aqe <domain> <action>`, e.g.:
- `aqe init` -- project initialization
- `aqe test generate` -- test generation
- `aqe coverage analyze` -- coverage analysis
- `aqe fleet health` -- fleet status

Visual feedback:
- `chalk` for colored output
- `ora` for spinners
- `cli-progress` for progress bars
- Internal log prefixes redirected to stderr to keep stdout clean for CI/JSON

**Strengths**:
- Shell completions for bash/zsh/fish
- Internal logs redirected to stderr (good for piping)
- Progress indicators for long operations

**Weaknesses**:
- 98 npm scripts create confusion about which to use
- Three binary aliases (`aqe`, `agentic-qe`, `aqe-v3`) with no deprecation plan for `aqe-v3`
- No inline usage examples in `--help` output

### 4.2 MCP Tool Interface Quality

~102 MCP tools registered, organized by domain under `src/mcp/tools/`:

| Tool Category | Count (approx) |
|---------------|----------------|
| analysis | Multiple |
| chaos-resilience | Multiple |
| code-intelligence | Multiple |
| coherence | Multiple |
| contract-testing | Multiple |
| coverage-analysis | Multiple |
| defect-intelligence | Multiple |
| embeddings | Multiple |
| learning-optimization | Multiple |
| mincut | Multiple |
| planning | Multiple |
| quality-assessment | Multiple |
| qx-analysis | Multiple |
| requirements-validation | Multiple |
| security-compliance | Multiple |
| test-execution | Multiple |
| test-generation | Multiple |
| visual-accessibility | Multiple |

**Finding**: 102 tools is a very large surface area. MCP tool discovery becomes a challenge -- a consumer invoking `mcp__agentic-qe__*` tools would need significant documentation to know which tool to use for a given task. There is no tool categorization or recommendation system exposed to the MCP client.

The MCP server includes:
- Connection pooling (`connection-pool.ts`)
- Load balancing (`load-balancer.ts`)
- Performance monitoring (`performance-monitor.ts`)
- Security middleware (`security/`)
- HTTP server for non-stdio transports

### 4.3 API Surface Area Assessment

The `package.json` exports map exposes 5 entry points:
- `.` -- main library
- `./kernel` -- kernel/memory subsystem
- `./shared` -- shared utilities
- `./cli` -- CLI entry
- `./ruvector` -- native ML wrappers
- `./sync` -- cloud sync module

**Finding**: The public API is reasonably segmented. However, there are no API stability guarantees documented. A consumer importing from `agentic-qe/kernel` has no way to know which exports are stable vs. internal.

### 4.4 Error Message Quality

Error messages use `chalk.red` consistently. The streaming utility (`src/cli/utils/streaming.ts`) provides structured error display with:
- Error details and received values
- Pass/fail counters with color coding
- Risk-level color coding (red/yellow/gray)
- Progress bar color coding

**Finding**: Error messages are visual but lack error codes or documentation links. A user seeing a red error has no easy path to resolution beyond reading the error text.

---

## 5. PLATFORM -- What it DEPENDS ON

**Score: 5 / 10**

### 5.1 Node.js Version Compatibility

- **Minimum**: Node.js >= 18.0.0 (per `engines` field)
- **CI**: Node.js 24 (upgraded in v3.7.10)
- **Current dev environment**: Node.js v24.13.0, npm 11.8.0

**Gap**: The engines field says `>=18.0.0` but CI only tests on Node.js 24. There is no CI matrix testing Node.js 18, 20, or 22. A consumer on Node.js 18 LTS may encounter issues that are never caught.

### 5.2 OS Compatibility

**Explicitly supported** (via `optionalDependencies`):
- Linux x64 (GNU + musl via aliasing)
- Linux ARM64 (GNU + musl via aliasing)
- macOS ARM64 (Apple Silicon)
- macOS x64 (Intel)

**Not addressed**:
- **Windows**: Only 6 files reference `process.platform` with any win32 handling. The native dependencies (`better-sqlite3`, `hnswlib-node`, `@ruvector/*`) have no Windows binaries in `optionalDependencies`. Windows is effectively unsupported despite no explicit exclusion.
- **FreeBSD/Alpine**: The musl aliasing to GNU is a workaround, not native support.

**CRITICAL FINDING**: Windows is silently unsupported. A Windows user installing AQE would face native compilation failures with no helpful error message.

### 5.3 npm Package Ecosystem Health

```
6 high severity vulnerabilities (npm audit)
```

All 6 vulnerabilities are in `@typescript-eslint/*` (devDependencies, versions 6.x). These are:
- Not shipped to consumers (devDeps only)
- Fixable via `npm audit fix`
- Related to typescript-estree parsing (DoS potential in dev tooling)

**Risk**: Low (dev-only), but the optics are poor. A consumer running `npm audit` after install would see these flagged.

### 5.4 External Service Dependencies

| Dependency | Required | Purpose |
|------------|----------|---------|
| SQLite (via better-sqlite3) | Yes | Core persistence |
| PostgreSQL | Optional | Cloud sync only |
| LLM Provider (OpenAI/Anthropic) | Optional | Test generation, learning |
| Docker | Optional | Postgres integration tests |

The project has minimal external service coupling for core functionality. SQLite-only operation is the default, which is good for adoption.

---

## 6. OPERATIONS -- How it's MAINTAINED

**Score: 7 / 10**

### 6.1 Build System Health

Build pipeline:
1. `tsc` -- TypeScript compilation (strict mode)
2. `build:cli` -- esbuild bundle for CLI (`scripts/build-cli.mjs`)
3. `build:mcp` -- esbuild bundle for MCP server (`scripts/build-mcp.mjs`)

Pre-publish:
- `sync-agents.cjs` -- copies agent definitions to assets
- `prepare-assets.cjs` -- prepares npm package assets with CRLF stripping

**Strengths**:
- Dual build: tsc for type checking + esbuild for fast bundling
- Pre-publish hooks ensure asset consistency
- Clean script cleans dist without rm -rf risk

### 6.2 CI/CD Pipeline Assessment

**9 workflow files** in `.github/workflows/`:

| Workflow | Purpose | Maturity |
|----------|---------|----------|
| `optimized-ci.yml` | PR/push testing (journey + contract + code-intelligence) | High |
| `npm-publish.yml` | Production npm publish on release | High |
| `benchmark.yml` | Performance benchmarks | Medium |
| `coherence.yml` | Architecture coherence checks | Medium |
| `mcp-tools-test.yml` | MCP tool validation | Medium |
| `skill-validation.yml` | Skill frontmatter/tier validation | Medium |
| `sauce-demo-e2e.yml` | E2E browser tests | Medium |
| `qcsd-production-trigger.yml` | Production quality trigger | Low |
| `n8n-workflow-ci.yml` | n8n integration CI | Low |

**Strengths**:
- Optimized CI targets < 2 minute execution
- Tolerates Vitest worker crashes if all tests passed (pragmatic)
- JUnit XML output for CI integration
- Test isolation via temp directories prevents DB pollution

**Weaknesses**:
- No Node.js version matrix (only tests on 24)
- No Windows CI runner
- `continue-on-error: true` on several test steps masks failures
- The test suite is 627 test files / 327K lines -- CI may be slow without parallelization

### 6.3 Release Process Maturity

Release process documented in CLAUDE.md:
1. Merge PR to main
2. Build and verify
3. Create GitHub release (triggers npm-publish.yml via OIDC)
4. Monitor and verify on npmjs.com

**Strengths**:
- OIDC-based npm trusted publishers (no secrets in CI)
- Automated publish on release creation
- Smoke test: `npx agentic-qe@<version> --version`
- CHANGELOG follows Keep a Changelog

**Weaknesses**:
- Release process is documented in CLAUDE.md (developer instructions) but not in a user-facing release guide
- No automated changelog generation
- Version is manually bumped

### 6.4 Monitoring and Observability Readiness

Monitoring-related files found:
- `src/monitoring/` directory exists
- `src/strange-loop/` -- self-observation system (swarm observer, topology analyzer, infra healing)
- `src/mcp/metrics/` -- MCP server metrics
- `src/mcp/performance-monitor.ts` -- request performance tracking

**Finding**: Internal monitoring exists for the swarm/agent system, but there is **no external observability** (no OpenTelemetry, Prometheus, or structured logging to external sinks). A consumer cannot monitor AQE's health in their own observability stack.

### 6.5 Documentation Completeness

| Documentation | Status | Quality |
|---------------|--------|---------|
| README.md | 365 lines, rewritten v3.7.10 | Good -- outcome-focused |
| CHANGELOG.md | Comprehensive | Excellent -- detailed per-version |
| CLAUDE.md | 300+ lines | Excellent -- thorough dev guide |
| User guides (`docs/guides/`) | 3 files | Sparse |
| API docs | None | Missing |
| Architecture docs (ADRs) | Extensive | Good for contributors |

**CRITICAL GAP**: No API documentation. A consumer importing `agentic-qe` or `agentic-qe/kernel` has no TypeDoc, JSDoc site, or API reference. The `types` field in `package.json` points to `.d.ts` files, which provide types but not documentation.

---

## 7. TIME -- How it CHANGES

**Score: 6 / 10**

### 7.1 Version History Stability

Recent release velocity (since 2026-02-01): **378 commits**, 6 minor/patch releases:

| Version | Date | Theme |
|---------|------|-------|
| 3.7.5 | 2026-03-01 | Flatten v3 to root (major restructure) |
| 3.7.6 | 2026-03-02 | Security fixes, 26 MCP tools, dead code removal |
| 3.7.7 | 2026-03-02 | Browser features, stealth testing, adaptive locator |
| 3.7.8 | 2026-03-04 | Loki-Mode quality gates, smart consolidation |
| 3.7.9 | 2026-03-05 | Multi-language test gen, embedding standardization |
| 3.7.10 | 2026-03-05 | MCP path fix, CRLF fix, README rewrite, Node 24 CI |

**6 releases in 5 days** is extremely rapid. While each release addresses real issues, this cadence suggests either:
1. The project is in a "stabilization sprint" after the v3.7.5 flatten
2. Releases are being used as checkpoints rather than stable versions

### 7.2 Breaking Change Management

**15 mentions of "breaking/BREAKING"** in the changelog. The project uses semver (3.x.y) but all breaking changes happened within the 3.x line, which technically violates semver rules (breaking changes should bump major version).

The v3.7.5 flatten (promoting `v3/` to root) was a significant structural change that required:
- Updated `__dirname` paths
- Changed package name
- Removed dual-package structure
- Updated all CI workflows

### 7.3 Upgrade Path Clarity

The project provides:
- `aqe init migrate` command for v2-to-v3 migration
- `src/migration/agent-compat.ts` for backward-compatible agent name resolution
- V2 detection in the init wizard

**Gap**: No migration guide document. The upgrade path is embedded in code and CLAUDE.md comments, not in a user-facing guide.

### 7.4 Technical Debt Trajectory

| Debt Category | Severity | Trend |
|---------------|----------|-------|
| Files > 500 lines | High | Worsening (30+ files over 1000 lines) |
| `@faker-js/faker` in prod deps | Low | Stable (acknowledged workaround) |
| No schema validation library | Medium | Stable |
| No API docs | High | No improvement |
| No Windows support | High | No improvement |
| ESLint audit vulnerabilities | Low | Fixable but unfixed |
| `_archived/` dead code in repo | Low | Acknowledged |
| 98 npm scripts | Low | Growing |

---

## Quality Experience (QX) Assessment

### QX-1: Developer Experience (DX) When Using AQE as a Consumer

**Score: 5 / 10**

**Positive**:
- `npx agentic-qe init` provides a wizard-driven setup experience
- 11 platform installers (Claude, Cursor, Windsurf, Copilot, Roo Code, Kilo Code, Continue, Cline, Codex, OpenCode, Kiro)
- Shell completions reduce typing burden
- MCP integration "just works" after init

**Negative**:
- No API documentation for programmatic consumers
- 102 MCP tools with no categorization or recommendation
- Error messages lack error codes or documentation links
- Three binary aliases create confusion (`aqe` vs `agentic-qe` vs `aqe-v3`)
- Native dependencies can fail silently on unsupported platforms

### QX-2: First-Time User Experience (Onboarding)

**Score: 4 / 10**

A first-time user would experience:
1. `npm install agentic-qe` -- may take minutes due to native addon compilation
2. `npx aqe init` -- wizard runs, installs agents/skills/hooks
3. Unclear what to do next -- no "getting started" tutorial
4. README lists capabilities but lacks a "Hello World" workflow
5. 117 skills are installed but user doesn't know which to start with

**Critical gap**: No "Quick Start" that takes a user from install to their first meaningful output (e.g., "generate tests for this file") in under 5 minutes.

### QX-3: Error Recovery Experience

**Score: 6 / 10**

**Positive**:
- `aqe init status` checks installation health
- `aqe init reset` allows config reset while preserving data
- Database backup rules prevent data loss
- Graceful shutdown with forced exit timeout

**Negative**:
- No `aqe doctor` or `aqe diagnose` command for troubleshooting
- Error messages are human-readable but not machine-actionable
- No error catalog or FAQ for common issues
- Native dependency compilation failures produce opaque error output

### QX-4: Documentation Discovery

**Score: 4 / 10**

| What a user might look for | Where it is | Findable? |
|-----------------------------|-------------|-----------|
| How to install | README.md | Yes |
| How to use CLI commands | `aqe --help` | Partially (no examples) |
| How to use MCP tools | Nowhere documented | No |
| How to write custom skills | 1 guide in docs/guides | Barely |
| API reference | Does not exist | No |
| Architecture overview | ADRs in docs/ | Only for contributors |
| Troubleshooting | CLAUDE.md (dev-only) | No |
| Upgrade guide | Does not exist | No |

---

## Risk Matrix

| Risk | Likelihood | Impact | Priority | Mitigation |
|------|-----------|--------|----------|------------|
| Windows user install failure | High | High | P0 | Document unsupported platforms; add engines.os field |
| Node 18/20 runtime incompatibility | Medium | High | P0 | Add CI matrix for Node 18, 20, 22, 24 |
| MCP tool discoverability | High | Medium | P1 | Add tool categories, descriptions, and recommendation |
| File size violations causing maintenance drag | High | Medium | P1 | Refactor coordinators; enforce 500-line lint rule |
| No API documentation | High | Medium | P1 | Generate TypeDoc from existing .d.ts files |
| First-time user abandonment | Medium | High | P1 | Create Quick Start guide with concrete example |
| SQLite blocking under MCP load | Low | High | P2 | Profile under concurrent MCP requests |
| Learning data corruption | Low | Critical | P2 | Automated backup schedule; integrity checks in CI |

---

## Prioritized Test Ideas (SFDIPOT-Derived)

### P0 -- Critical

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| S-001 | Structure | Install `agentic-qe` on Node.js 18 LTS and confirm all imports resolve without runtime errors | Integration |
| P-001 | Platform | Run `npx agentic-qe init` on Windows 11 and document every failure point | Human Exploration |
| P-002 | Platform | Install on Alpine Linux (musl) and confirm `better-sqlite3` and `hnswlib-node` load correctly | Integration |
| F-001 | Function | Execute `aqe test generate` on a real TypeScript project with no LLM key configured and confirm error message guides user to resolution | E2E |

### P1 -- High

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| I-001 | Interfaces | Invoke all 102 MCP tools with empty/minimal input and confirm none crash the server | Integration |
| D-001 | Data | Insert 500K records into unified memory and measure query latency degradation | Performance Bench |
| O-001 | Operations | Run `npm audit` on a fresh install and confirm zero high-severity vulnerabilities in production dependencies | Unit |
| T-001 | Time | Upgrade from v3.7.5 to v3.7.10 with existing memory.db and confirm zero data loss | Integration |
| F-002 | Function | Run `aqe init` followed by every documented CLI command in sequence on a fresh project | E2E |
| S-002 | Structure | Use `madge` to detect circular dependencies across all 1,077 source files | Unit |

### P2 -- Medium

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| D-002 | Data | Send malformed JSON-RPC to MCP server and confirm `secure-json-parse` rejects it without crash | Integration |
| I-002 | Interfaces | Measure time to discover the correct MCP tool for "generate unit tests" with no prior knowledge | Human Exploration |
| O-002 | Operations | Build from clean checkout and confirm `dist/` output matches expected file count and structure | Unit |
| T-002 | Time | Run 10 concurrent MCP tool invocations targeting the same SQLite database and confirm no SQLITE_BUSY errors | Integration |
| F-003 | Function | Execute each of the 12 language generators on a sample file and confirm compilation of output | Integration |

### P3 -- Low

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| S-003 | Structure | Count files over 500 lines and track as a lint metric in CI | Unit |
| P-003 | Platform | Test `@xenova/transformers` model download on air-gapped network and confirm graceful fallback | Human Exploration |
| O-003 | Operations | Measure full CI pipeline duration and confirm < 10 minutes | Unit |

---

## Clarifying Questions for Stakeholders

1. **Windows support**: Is Windows explicitly unsupported, or is it an unintentional gap? If supported, what is the minimum viable Windows experience?

2. **Node.js 18 LTS**: The engines field claims `>=18.0.0` but CI only tests Node 24. Should the engines field be updated to `>=24.0.0`, or should CI test older versions?

3. **MCP tool count**: At 102 tools, how does a consumer know which tools to use? Is there a planned recommendation/categorization system?

4. **File size rule**: The CLAUDE.md mandates 500-line files, but 30+ files exceed 1,000 lines. Is this rule aspirational or enforced? Should a lint rule prevent new violations?

5. **API documentation**: Is there a plan for TypeDoc or similar API reference generation? Programmatic consumers currently have no documentation.

6. **`@faker-js/faker` in production**: Is this intentional (needed at runtime for test data generation) or should it move to devDependencies?

7. **Release cadence**: 6 releases in 5 days suggests post-restructure stabilization. What is the target release cadence going forward?

8. **Learning data backup**: The 150K+ records in memory.db are described as irreplaceable. Is there an automated backup strategy, or does this rely on manual discipline?

---

## Appendix A: Source Code Metrics

| Metric | Value |
|--------|-------|
| Source files (.ts) | 1,077 |
| Source lines of code | ~511,000 |
| Test files (.test.ts) | 627 |
| Test lines of code | ~327,000 |
| Test-to-source ratio | 0.64:1 |
| Domain bounded contexts | 13 |
| QE agents | 53 |
| Skills | 117 |
| MCP tools | ~102 |
| CLI commands | 22 |
| Database tables | 30 |
| Schema version | 8 |
| Production dependencies | 22 |
| Optional dependencies | 12 |
| Dev dependencies | 13 |
| npm scripts | 98 |
| CI workflows | 9 |
| Files > 500 lines | 30+ |
| Files > 1000 lines | 30+ |

## Appendix B: Key File References

| File | Significance |
|------|-------------|
| `/workspaces/agentic-qe-new/package.json` | Package manifest, 98 scripts, dependency declarations |
| `/workspaces/agentic-qe-new/tsconfig.json` | TypeScript strict config with path aliases |
| `/workspaces/agentic-qe-new/vitest.config.ts` | Test configuration with temp dir isolation |
| `/workspaces/agentic-qe-new/src/kernel/unified-memory-schemas.ts` | 30-table SQLite schema (schema v8) |
| `/workspaces/agentic-qe-new/src/kernel/unified-memory.ts` | Core persistence manager |
| `/workspaces/agentic-qe-new/src/cli/index.ts` | CLI entry point, commander setup |
| `/workspaces/agentic-qe-new/src/mcp/tools/` | MCP tool registrations (~102 tools) |
| `/workspaces/agentic-qe-new/src/learning/qe-reasoning-bank.ts` | Largest file (1,941 lines) |
| `/workspaces/agentic-qe-new/src/init/init-wizard.ts` | Init wizard facade |
| `/workspaces/agentic-qe-new/.github/workflows/npm-publish.yml` | Production publish workflow |
| `/workspaces/agentic-qe-new/.github/workflows/optimized-ci.yml` | Primary CI workflow |
| `/workspaces/agentic-qe-new/CHANGELOG.md` | Version history with detailed entries |

---

*Report generated by QE Product Factors Assessor (V3) using SFDIPOT framework from James Bach's Heuristic Test Strategy Model. All findings are based on static analysis of the codebase at commit b052d739 on branch working-branch-march.*
