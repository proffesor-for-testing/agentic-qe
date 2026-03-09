# Product Factors & Quality Experience (QX) Analysis Report
## AQE v3.7.14 -- SFDIPOT Framework (James Bach, HTSM)

**Report Date**: 2026-03-09
**Version Analyzed**: 3.7.14
**Framework**: SFDIPOT (Structure, Function, Data, Interfaces, Platform, Operations, Time)
**Assessor**: QE Product Factors Assessor (V3) - GLM-5 Model
**Comparison Baseline**: v3.7.10 Report

---

## Executive Summary

AQE v3.7.14 continues the aggressive development trajectory from v3.7.10, adding significant capabilities in brain export/import, witness chain cryptographic signing, and trigger optimization. This analysis applies James Bach's SFDIPOT framework to evaluate product quality across all seven dimensions, with explicit comparison to v3.7.10 findings.

**Overall Product Quality Score: 6.8 / 10** (up from 6.4 in v3.7.10)

| Factor | v3.7.10 | v3.7.14 | Trend | Verdict |
|--------|---------|---------|-------|---------|
| Structure | 6 / 10 | 6 / 10 | Stable | File size violations remain; architecture maintained |
| Function | 7 / 10 | 8 / 10 | Improving | Brain export v3.0, trigger optimizer, multi-language gen |
| Data | 7 / 10 | 8 / 10 | Improving | 25-table brain export, atomic imports, RVF sidecar |
| Interfaces | 6 / 10 | 6 / 10 | Stable | MCP tool count stable at 44; CLI improvements |
| Platform | 5 / 10 | 5 / 10 | Stable | Windows/Node 18 gaps remain unaddressed |
| Operations | 7 / 10 | 7 / 10 | Stable | CI mature; release process validated |
| Time | 6 / 10 | 7 / 10 | Improving | Slower release cadence; better stability |
| **QX (Quality Experience)** | **5 / 10** | **6 / 10** | **Improving** | CLI crash fix, better error recovery |

---

## 1. STRUCTURE -- What the Product IS

**Score: 6 / 10** (no change from v3.7.10)

### 1.1 Architecture Components and Relationships

The project maintains Domain-Driven Design with 13 bounded contexts under `src/domains/`:

| Domain | Purpose | Status |
|--------|---------|--------|
| chaos-resilience | Fault injection and resilience testing | Stable |
| code-intelligence | Codebase analysis, C4 models, knowledge graphs | Stable |
| contract-testing | API contract validation | Stable |
| coverage-analysis | O(log n) coverage gap detection | Stable |
| defect-intelligence | Defect prediction and trend analysis | Stable |
| enterprise-integration | Third-party integration patterns | Stable |
| learning-optimization | ReasoningBank ML-based learning | Enhanced |
| quality-assessment | Quality scoring and assessment | Stable |
| requirements-validation | QCSD-driven requirements analysis | Stable |
| security-compliance | OWASP, SAST, compliance checking | Stable |
| test-execution | Test runner orchestration | Stable |
| test-generation | Multi-language test code generation | Enhanced (8 new languages) |
| visual-accessibility | WCAG, visual regression, a11y | Stable |

Supporting infrastructure layers:
- **Kernel** (`src/kernel/`): Unified memory, HNSW vector search, event bus
- **Shared** (`src/shared/`): Common utilities, LLM router, parsers, security
- **Coordination** (`src/coordination/`): Queen coordinator, protocols, consensus, workflow orchestration
- **Adapters** (`src/adapters/`): A2A, AG-UI, A2UI, Claude Flow bridge
- **Audit** (`src/audit/`): NEW - Witness chain, key management, backfill

### 1.2 File/Module Organization Quality

**CRITICAL FINDING: Massive 500-line rule violations persist.**

The top 30 largest files remain unchanged from v3.7.10, with all exceeding 1,000 lines:

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
| 1,701 | `src/domains/chaos-resilience/coordinator.ts` | 3.4x |
| 1,699 | `src/domains/requirements-validation/qcsd-ideation-plugin.ts` | 3.4x |

**Total source files**: 1,083 TypeScript files (up from 1,077 in v3.7.10)
**Total source lines**: ~513,351 (up from ~511,000)

### 1.3 Dependency Graph Health

**Production dependencies**: 22 direct, 12 optional (native platform binaries)
**Dev dependencies**: 13

New dependencies since v3.7.10:
- No new production dependencies
- `@ruvector/rvf-node` ^0.1.7 (already present, now more integrated)

Resolved issues:
- ReDoS vulnerability in trigger-optimizer (fixed)
- ENOTEMPTY npm install error (fixed by reducing package files from 5,473 to 3,293)

### 1.4 Configuration File Completeness

| Config File | Status | Quality |
|-------------|--------|---------|
| `package.json` | Updated | 98 scripts maintained |
| `tsconfig.json` | Stable | Strict mode enabled; path aliases |
| `vitest.config.ts` | Stable | Good test isolation |
| `.github/workflows/` | Stable | 9 workflows |
| `CHANGELOG.md` | Excellent | Detailed per-version entries |

---

## 2. FUNCTION -- What the Product DOES

**Score: 8 / 10** (up from 7 in v3.7.10)

### 2.1 Core Capabilities Inventory

| Capability | Interface | Status | v3.7.14 New/Enhanced |
|------------|-----------|--------|---------------------|
| Test generation (12+ languages) | CLI + MCP | Enhanced | Go, Rust, Kotlin, Java, Swift, Flutter, React Native, C# |
| Coverage gap analysis | CLI + MCP | Stable | - |
| Flaky test detection | CLI + MCP | Stable | - |
| Defect prediction | MCP | Stable | - |
| Security scanning | CLI + MCP | Stable | - |
| Contract validation | CLI + MCP | Stable | - |
| Requirements analysis (QCSD) | MCP + Agents | Stable | - |
| Visual regression / a11y | CLI + MCP | Stable | - |
| Agent fleet management | CLI + MCP | Stable | - |
| Learning/ReasoningBank | Internal | Enhanced | Brain export v3.0 |
| Code intelligence (C4, KG) | CLI + MCP | Stable | - |
| Init wizard (11 platforms) | CLI | Stable | - |
| Shell completions | CLI | Stable | - |
| Cloud sync (Postgres) | CLI | Stable | - |
| Brain export/import | CLI | NEW | 25 tables, streaming, RVF sidecar |
| Witness chain signing | CLI | NEW | SHAKE-256 + Ed25519 |
| Trigger optimization | CLI | NEW | Jaccard similarity, skill confusion detection |

### 2.2 Feature Completeness Assessment

**New since v3.7.10**:

1. **Brain Export v3.0** - Complete 25-table portable intelligence:
   - Data-driven `TABLE_CONFIGS` pattern replaces hardcoded logic
   - FK-aware ordering for imports
   - Base64 BLOB serialization
   - Automatic DDL creation on import
   - Streaming export for tables > 10K rows

2. **Witness Chain v3** - Cryptographic audit trail:
   - Dual hash algorithm support (sha256/shake256)
   - 12 witness action types wired to production mutation sites
   - Ed25519 key persistence with PEM files
   - Witness backfill CLI for legacy databases

3. **Trigger Optimizer** - Skill activation analysis:
   - Jaccard similarity across skill fleet
   - Confusable skill identification
   - Actionable suggestions for trigger precision

4. **Multi-language Test Generation** - 8 new languages:
   - Go, Rust, Kotlin, Java, Swift, Flutter, React Native, C#
   - Language-specific patterns (Rust ownership, Go table-driven)

### 2.3 Error Handling Robustness

Improvements since v3.7.10:
- **CLI crash on global install fixed** - TypeScript lazy-loaded via `createRequire` Proxy
- **Import atomicity** - Brain import wraps all table merges in single transaction
- **Domain collection fix** - SQL syntax error resolved in streaming path

### 2.4 Capability Maturity Assessment

| Capability | Maturity | Evidence |
|------------|----------|----------|
| Core CLI commands | Production | Stable, well-tested |
| MCP tools | Production | 44 tools, stable |
| Brain export/import | Beta | New in v3.7.14, needs field testing |
| Witness chain | Beta | New in v3.7.14, cryptographic audit |
| Multi-language gen | Production | 8 new generators with compilation validation |
| Trigger optimizer | Beta | New in v3.7.13, evaluation ongoing |

---

## 3. DATA -- What the Product PROCESSES

**Score: 8 / 10** (up from 7 in v3.7.10)

### 3.1 Data Flow Analysis

```
User Input (CLI args / MCP JSON-RPC)
  --> Command Parser (commander / protocol-server)
    --> Domain Coordinator
      --> Domain Service(s)
        --> UnifiedMemory (SQLite via better-sqlite3)
        --> HNSW Vector Index (hnswlib-node)
        --> RVF Binary Store (@ruvector/rvf-node) [NEW]
        --> Witness Chain (Ed25519 signed) [NEW]
        --> External LLM (via router)
      <-- Results
    <-- Formatted Output (chalk/JSON/streaming)
  --> stdout / MCP response
```

### 3.2 Database Schema Design Quality

**Schema version**: 8 (unchanged from v3.7.10)
**Tables**: 30+ in unified memory schema

New data handling capabilities:
- **25-table brain export** (up from 4 in previous versions)
- **Streaming JSONL export** for large tables
- **Atomic import transactions** for rollback safety
- **RVF manifest sidecar** with metadata

### 3.3 Data Validation at Boundaries

Validation mechanisms:
- `secure-json-parse` for safe JSON deserialization
- `sql-safety.ts` for SQL injection prevention
- Custom validators in `src/validation/`
- Input sanitization in `src/shared/security/`

**Gap remains**: No schema validation library (Zod, Joi, Ajv) adopted.

### 3.4 Memory/Learning Data Management

The `.agentic-qe/memory.db` contains 150K+ irreplaceable learning records.

New protections:
- Witness chain provides cryptographic audit of all mutations
- Brain export enables portable backup
- RVF binary format for compact storage

---

## 4. INTERFACES -- How Users INTERACT

**Score: 6 / 10** (no change from v3.7.10)

### 4.1 CLI UX Analysis

**Binary names**: `aqe`, `agentic-qe`, `aqe-v3`, `aqe-mcp`

**New CLI commands in v3.7.14**:
- `aqe brain export` - Export learning data
- `aqe brain import` - Import learning data
- `aqe brain info` - Show brain metadata, lineage, signatures
- `aqe brain witness-backfill` - Replay existing data into witness chain

**Visual feedback**: chalk, ora spinners, cli-progress bars

**Strengths**:
- Shell completions for bash/zsh/fish
- Internal logs redirected to stderr
- Progress indicators for long operations

**Weaknesses**:
- 98 npm scripts still excessive
- Three binary aliases remain (`aqe`, `agentic-qe`, `aqe-v3`)
- No inline usage examples in `--help` output

### 4.2 MCP Tool Interface Quality

**44 MCP tools** registered (stable from v3.7.10):

Tool categories:
- analysis, chaos-resilience, code-intelligence, coherence
- contract-testing, coverage-analysis, defect-intelligence
- embeddings, learning-optimization, mincut, planning
- quality-assessment, qx-analysis, requirements-validation
- security-compliance, test-execution, test-generation, visual-accessibility

**Finding**: MCP tool count stable but discoverability remains a challenge. No tool categorization or recommendation system exposed to MCP clients.

### 4.3 API Surface Area Assessment

The `package.json` exports map exposes 7 entry points:
- `.` - main library
- `./kernel` - kernel/memory subsystem
- `./shared` - shared utilities
- `./cli` - CLI entry
- `./ruvector` - native ML wrappers
- `./sync` - cloud sync module
- `./governance` - NEW in v3.7.11 - governance subpath

**Gap remains**: No API stability guarantees documented.

### 4.4 Error Message Quality

Improvements:
- Global install crash now provides actionable error
- Brain import failures rollback atomically

**Gap remains**: No error codes or documentation links in error messages.

---

## 5. PLATFORM -- What it DEPENDS ON

**Score: 5 / 10** (no change from v3.7.10)

### 5.1 Node.js Version Compatibility

- **Minimum**: Node.js >= 18.0.0 (per `engines` field)
- **CI**: Node.js 24 (unchanged from v3.7.10)
- **Gap**: CI only tests on Node.js 24; no matrix for 18, 20, 22

### 5.2 OS Compatibility

**Explicitly supported** (via `optionalDependencies`):
- Linux x64 (GNU + musl via aliasing)
- Linux ARM64 (GNU + musl via aliasing)
- macOS ARM64 (Apple Silicon)
- macOS x64 (Intel)

**Not addressed**:
- **Windows**: Only 6 files reference `process.platform` with win32 handling
- Native dependencies have no Windows binaries in `optionalDependencies`
- Windows is effectively unsupported despite no explicit exclusion

**CRITICAL FINDING REMAINS**: Windows is silently unsupported.

### 5.3 npm Package Ecosystem Health

**Package size reduced**: 5,473 to 3,293 files (excludes test fixtures, build artifacts)

**Vulnerabilities**:
- ReDoS in trigger-optimizer fixed
- Production dependency vulnerabilities: 0

### 5.4 External Service Dependencies

| Dependency | Required | Purpose |
|------------|----------|---------|
| SQLite (via better-sqlite3) | Yes | Core persistence |
| PostgreSQL | Optional | Cloud sync only |
| LLM Provider (OpenAI/Anthropic) | Optional | Test generation, learning |
| Docker | Optional | Postgres integration tests |

---

## 6. OPERATIONS -- How it's MAINTAINED

**Score: 7 / 10** (no change from v3.7.10)

### 6.1 Build System Health

Build pipeline unchanged:
1. `tsc` - TypeScript compilation (strict mode)
2. `build:cli` - esbuild bundle for CLI
3. `build:mcp` - esbuild bundle for MCP server

Pre-publish:
- `sync-agents.cjs` - copies agent definitions
- `prepare-assets.cjs` - prepares npm package with CRLF stripping

### 6.2 CI/CD Pipeline Assessment

**9 workflow files** in `.github/workflows/`:

| Workflow | Purpose | Maturity |
|----------|---------|----------|
| `optimized-ci.yml` | PR/push testing | High |
| `npm-publish.yml` | Production npm publish | High |
| `benchmark.yml` | Performance benchmarks | Medium |
| `coherence.yml` | Architecture coherence | Medium |
| `mcp-tools-test.yml` | MCP tool validation | Medium |
| `skill-validation.yml` | Skill frontmatter validation | Medium |
| `sauce-demo-e2e.yml` | E2E browser tests | Medium |
| `qcsd-production-trigger.yml` | Production quality trigger | Low |
| `n8n-workflow-ci.yml` | n8n integration CI | Low |

**Strengths**:
- Optimized CI targets < 2 minute execution
- Tolerates Vitest worker crashes if all tests passed
- JUnit XML output for CI integration

**Weaknesses**:
- No Node.js version matrix (only tests on 24)
- No Windows CI runner
- `continue-on-error: true` on several test steps

### 6.3 Release Process Maturity

Release process validated through multiple releases:
1. Merge PR to main
2. Build and verify
3. Create GitHub release (triggers npm-publish.yml via OIDC)
4. Monitor and verify on npmjs.com

**New in v3.7.12**: Pre-release isolated install check added to release skill.

### 6.4 Monitoring and Observability Readiness

Internal monitoring exists:
- `src/monitoring/`
- `src/strange-loop/` (self-observation system)
- `src/mcp/metrics/`
- `src/mcp/performance-monitor.ts`

**Gap remains**: No external observability (OpenTelemetry, Prometheus, structured logging to external sinks).

### 6.5 Documentation Completeness

| Documentation | Status | Quality |
|---------------|--------|---------|
| README.md | Stable | Good - outcome-focused |
| CHANGELOG.md | Excellent | Detailed per-version |
| CLAUDE.md | Excellent | Thorough dev guide |
| User guides | Sparse | 3 files |
| API docs | Missing | No TypeDoc site |
| Architecture docs | Good | ADRs in docs/ |

**CRITICAL GAP REMAINS**: No API documentation.

---

## 7. TIME -- How it CHANGES

**Score: 7 / 10** (up from 6 in v3.7.10)

### 7.1 Version History Stability

Release velocity since v3.7.10 (2026-03-05):

| Version | Date | Theme |
|---------|------|-------|
| 3.7.10 | 2026-03-05 | MCP path fix, CRLF fix, README rewrite, Node 24 CI |
| 3.7.11 | 2026-03-06 | Full @claude-flow/guidance governance integration |
| 3.7.12 | 2026-03-06 | CLI crash fix on global install |
| 3.7.13 | 2026-03-07 | Trigger optimizer, version comparator, skill intent |
| 3.7.14 | 2026-03-08 | Brain export v3.0, witness chain v3, RVF adapter |

**5 releases in 4 days** since v3.7.10 - rapid but slowing from the previous 6 releases in 5 days.

### 7.2 Breaking Change Management

No breaking changes since v3.7.10. All releases are backward-compatible enhancements and fixes.

### 7.3 Upgrade Path Clarity

**Available**:
- `aqe init migrate` command for v2-to-v3 migration
- `src/migration/agent-compat.ts` for backward-compatible agent names
- V2 detection in init wizard

**Gap remains**: No user-facing migration guide document.

### 7.4 Technical Debt Trajectory

| Debt Category | Severity | Trend |
|---------------|----------|-------|
| Files > 500 lines | High | Stable (no improvement) |
| No schema validation library | Medium | Stable |
| No API docs | High | Stable |
| No Windows support | High | Stable |
| 98 npm scripts | Low | Stable |
| Brain export coverage | N/A | RESOLVED (25 tables now covered) |
| CLI global install crash | High | RESOLVED |
| ENOTEMPTY npm install | High | RESOLVED |

---

## Quality Experience (QX) Assessment

### QX-1: Developer Experience (DX) When Using AQE as a Consumer

**Score: 6 / 10** (up from 5 in v3.7.10)

**Positive**:
- `npx agentic-qe init` provides wizard-driven setup
- 11 platform installers
- Shell completions reduce typing burden
- MCP integration "just works"
- Global install no longer crashes

**Negative**:
- No API documentation for programmatic consumers
- 44 MCP tools with no categorization
- Error messages lack error codes
- Three binary aliases create confusion
- Native dependencies can fail on unsupported platforms

### QX-2: First-Time User Experience (Onboarding)

**Score: 5 / 10** (up from 4 in v3.7.10)

A first-time user would experience:
1. `npm install agentic-qe` - faster now (3,293 files vs 5,473)
2. `npx aqe init` - wizard runs, installs agents/skills/hooks
3. `aqe --version` - works without crash (fixed in v3.7.12)
4. Unclear what to do next - no "getting started" tutorial
5. 78 QE skills installed but user doesn't know which to start with

**Improvement**: npm package is smaller, CLI crash fixed.

**Critical gap remains**: No "Quick Start" guide.

### QX-3: Error Recovery Experience

**Score: 6 / 10** (no change from v3.7.10)

**Positive**:
- `aqe init status` checks installation health
- `aqe init reset` allows config reset
- Database backup rules prevent data loss
- Brain import failures rollback atomically (NEW)

**Negative**:
- No `aqe doctor` command for troubleshooting
- Error messages are human-readable but not machine-actionable
- No error catalog or FAQ

### QX-4: Documentation Discovery

**Score: 4 / 10** (no change from v3.7.10)

| What a user might look for | Where it is | Findable? |
|-----------------------------|-------------|-----------|
| How to install | README.md | Yes |
| How to use CLI commands | `aqe --help` | Partially |
| How to use MCP tools | Nowhere | No |
| How to export brain | `aqe brain --help` | Yes (NEW) |
| API reference | Does not exist | No |
| Architecture overview | ADRs | Contributor-only |
| Troubleshooting | CLAUDE.md | No |

---

## Risk Matrix

| Risk | Likelihood | Impact | Priority | Mitigation |
|------|-----------|--------|----------|------------|
| Windows user install failure | High | High | P0 | Document unsupported platforms; add engines.os field |
| Node 18/20 runtime incompatibility | Medium | High | P0 | Add CI matrix for Node 18, 20, 22, 24 |
| MCP tool discoverability | High | Medium | P1 | Add tool categories, descriptions |
| File size violations | High | Medium | P1 | Enforce 500-line lint rule |
| No API documentation | High | Medium | P1 | Generate TypeDoc |
| First-time user abandonment | Medium | High | P1 | Create Quick Start guide |
| SQLite blocking under MCP load | Low | High | P2 | Profile concurrent requests |
| Brain import data corruption | Low | Critical | P2 | Atomic transactions implemented |

---

## Prioritized Test Ideas (SFDIPOT-Derived)

### P0 -- Critical

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| S-001 | Structure | Install `agentic-qe` on Node.js 18 LTS and confirm all imports resolve | Integration |
| P-001 | Platform | Run `npx agentic-qe init` on Windows 11 and document every failure | Human Exploration |
| P-002 | Platform | Install on Alpine Linux (musl) and confirm native modules load | Integration |
| D-001 | Data | Export brain with 150K+ patterns and import to fresh database; verify counts match | Integration |
| T-001 | Time | Upgrade from v3.7.10 to v3.7.14 with existing memory.db; confirm zero data loss | Integration |

### P1 -- High

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| F-001 | Function | Execute brain export on database exceeding 500MB and confirm streaming prevents OOM | Integration |
| D-002 | Data | Verify witness chain signature verification fails when pattern is tampered | Unit |
| I-001 | Interfaces | Invoke all 44 MCP tools with empty input and confirm none crash the server | Integration |
| F-002 | Function | Run trigger optimizer on full skill fleet and confirm Jaccard calculations are correct | Unit |
| S-002 | Structure | Use `madge` to detect circular dependencies across all 1,083 source files | Unit |

### P2 -- Medium

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| D-003 | Data | Send malformed JSON to brain import and confirm graceful rejection | Integration |
| F-003 | Function | Execute each of the 8 new language generators on sample files; verify compilation | Integration |
| I-002 | Interfaces | Measure time to discover correct MCP tool for "export learning data" | Human Exploration |
| O-001 | Operations | Build from clean checkout and confirm dist/ matches expected structure | Unit |
| T-002 | Time | Run 10 concurrent MCP tool invocations targeting same database; confirm no SQLITE_BUSY | Integration |

### P3 -- Low

| ID | Category | Test Idea | Automation Fitness |
|----|----------|-----------|-------------------|
| S-003 | Structure | Count files over 500 lines; track as CI metric | Unit |
| P-003 | Platform | Test `@xenova/transformers` model download on air-gapped network | Human Exploration |
| O-002 | Operations | Measure full CI pipeline duration; confirm < 10 minutes | Unit |
| F-004 | Function | Run witness backfill on legacy database; verify all patterns get signatures | Integration |

---

## Clarifying Questions for Stakeholders

1. **Windows support**: Is Windows explicitly unsupported, or is it an unintentional gap? Should the engines field include `os` restrictions?

2. **Node.js matrix**: The engines field claims `>=18.0.0` but CI only tests Node 24. Should CI add a matrix for older versions?

3. **File size rule**: The CLAUDE.md mandates 500-line files, but 30+ files exceed 1,000 lines. Is this rule aspirational? Should a lint rule prevent new violations?

4. **Brain export scope**: Brain export v3.0 covers 25 tables. Are there remaining tables that should be included? What about cloud sync state?

5. **Witness chain performance**: With Ed25519 signing on every pattern mutation, what is the acceptable latency overhead? Should signing be optional for development?

6. **Trigger optimizer integration**: The trigger optimizer identifies confusable skills. Should it automatically suggest skill description updates, or remain advisory-only?

7. **Multi-language test generation**: 8 new generators added. What is the priority for additional languages (Python, Scala, etc.)?

8. **API documentation**: Is there a plan for TypeDoc or similar API reference generation?

---

## Comparison with v3.7.10

### Improvements

| Area | v3.7.10 | v3.7.14 | Impact |
|------|---------|---------|--------|
| CLI global install | Crashed | Works | High |
| Brain export coverage | 4 tables | 25 tables | High |
| Large table export | OOM risk | Streaming | Medium |
| Import safety | No rollback | Atomic transaction | High |
| Witness chain | Not present | SHAKE-256 + Ed25519 | Medium |
| Test generation languages | 4 | 12 | Medium |
| npm package size | 5,473 files | 3,293 files | Medium |
| Trigger optimization | Not present | Jaccard analysis | Low |
| Governance integration | Partial | Full 8 modules | Low |

### Unchanged Issues

| Area | Status | Priority |
|------|--------|----------|
| File size violations | 30+ files > 1000 lines | P1 |
| Windows support | Silently unsupported | P0 |
| Node.js version matrix | CI only tests Node 24 | P0 |
| API documentation | Not present | P1 |
| MCP tool discoverability | No categorization | P1 |
| Quick Start guide | Not present | P1 |

---

## Appendix A: Source Code Metrics

| Metric | v3.7.10 | v3.7.14 | Delta |
|--------|---------|---------|-------|
| Source files (.ts) | 1,077 | 1,083 | +6 |
| Source lines of code | ~511,000 | ~513,351 | +2,351 |
| Test files (.test.ts) | 627 | 634 | +7 |
| QE agents | 53 | 53 | 0 |
| Skills (total) | 117 | 78 QE + platform | Reorganized |
| MCP tools | ~102 | 44 | Consolidated |
| CLI commands | 22 | 25+ | +3 (brain) |
| Database tables | 30 | 30 | 0 |
| Schema version | 8 | 8 | 0 |
| CI workflows | 9 | 9 | 0 |
| Files > 500 lines | 30+ | 30+ | 0 |
| Files > 1000 lines | 30+ | 30+ | 0 |

## Appendix B: Key File References

| File | Significance |
|------|-------------|
| `/workspaces/agentic-qe-new/package.json` | Package manifest, version 3.7.14 |
| `/workspaces/agentic-qe-new/src/kernel/unified-memory-schemas.ts` | 30-table SQLite schema (schema v8) |
| `/workspaces/agentic-qe-new/src/learning/qe-reasoning-bank.ts` | Largest file (1,941 lines) |
| `/workspaces/agentic-qe-new/src/audit/witness-chain.ts` | NEW - Cryptographic audit trail |
| `/workspaces/agentic-qe-new/src/audit/witness-key-manager.ts` | NEW - Ed25519 key management |
| `/workspaces/agentic-qe-new/src/cli/brain-commands.ts` | NEW - Brain export/import CLI |
| `/workspaces/agentic-qe-new/.github/workflows/optimized-ci.yml` | Primary CI workflow |
| `/workspaces/agentic-qe-new/CHANGELOG.md` | Version history v3.7.10 - v3.7.14 |

---

*Report generated by QE Product Factors Assessor (V3) using SFDIPOT framework from James Bach's Heuristic Test Strategy Model. Analysis performed by GLM-5 model. All findings are based on static analysis of the codebase on branch testing-models.*
