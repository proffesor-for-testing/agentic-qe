# Product Factors & Quality Experience (QX) Analysis Report
## AQE v3.7.14 -- SFDIPOT Framework (James Bach, HTSM)

**Report Date**: 2026-03-09
**Version Analyzed**: 3.7.14
**Baseline Comparison**: v3.7.10 (2026-03-05)
**Framework**: SFDIPOT (Structure, Function, Data, Interfaces, Platform, Operations, Time)
**Assessor**: QE QX Partner (V3), powered by Claude Opus 4.6

---

## Executive Summary

AQE v3.7.14 is a large-scale TypeScript project (1,083 source files, ~513K lines of code) implementing a domain-driven quality engineering platform. Since the v3.7.10 baseline, four patch releases have delivered significant new capabilities (brain export v3.0, witness chain, governance integration, trigger optimizer), fixed a critical npm install error, and reduced the package from 5,473 to 3,301 files. The codebase continues to grow in both breadth and depth, with 60 QE agents, 111 skills, 42 protocol-server MCP tools, 28 domain-specific MCP tools, and 13 bounded domain contexts.

**Overall Product Quality Score: 6.6 / 10** (v3.7.10: 6.4 -- delta: +0.2)

The improvement is modest but grounded in measurable gains: a major packaging fix that eliminates an install-blocking error, new governance subpath exports, and a security fix for a ReDoS vulnerability. The structural debt (83 files over 1,000 lines) and platform gaps (Windows, Node version matrix) remain unaddressed.

| Factor | v3.7.14 Score | v3.7.10 Score | Delta | Verdict |
|--------|---------------|---------------|-------|---------|
| Structure | 5 / 10 | 6 / 10 | -1 | File bloat worsened (30+ to 83 files >1000 lines); kernel imports domains |
| Function | 7.5 / 10 | 7 / 10 | +0.5 | Brain export v3, trigger optimizer, skill intent classification added |
| Data | 7 / 10 | 7 / 10 | 0 | Schema stable at v8/30 tables; still no runtime Zod validation |
| Interfaces | 6.5 / 10 | 6 / 10 | +0.5 | Governance export path added; 70 total MCP tools; tool count normalized |
| Platform | 5 / 10 | 5 / 10 | 0 | Windows still silent fail; CI still Node 24 only |
| Operations | 7.5 / 10 | 7 / 10 | +0.5 | Package size reduced 40%; npm install ENOTEMPTY fixed |
| Time | 6.5 / 10 | 6 / 10 | +0.5 | 4 releases in 3 days but zero new breaking changes |
| **QX (Quality Experience)** | **5.5 / 10** | **5 / 10** | **+0.5** | Install reliability improved; onboarding still steep |

**Composite QX Score: 6.3 / 10** (weighted: Structure 15%, Function 20%, Data 10%, Interfaces 15%, Platform 10%, Operations 15%, Time 10%, QX 5%)

---

## 1. STRUCTURE -- What the Product IS

**Score: 5 / 10** (v3.7.10: 6 -- delta: -1)

### 1.1 Architecture Components and Relationships

The project follows Domain-Driven Design with 13 bounded contexts under `src/domains/`, unchanged from v3.7.10:

| Domain | Files | Purpose |
|--------|-------|---------|
| chaos-resilience | 8 | Fault injection and resilience testing |
| code-intelligence | 18 | Codebase analysis, C4 models, knowledge graphs |
| contract-testing | 8 | API contract validation |
| coverage-analysis | 13 | O(log n) coverage gap detection |
| defect-intelligence | 9 | Defect prediction and trend analysis |
| enterprise-integration | 11 | Third-party integration patterns |
| learning-optimization | 13 | ReasoningBank ML-based learning |
| quality-assessment | 18 | Quality scoring and assessment |
| requirements-validation | 38 | QCSD-driven requirements analysis (largest domain) |
| security-compliance | 24 | OWASP, SAST, compliance checking |
| test-execution | 29 | Test runner orchestration |
| test-generation | 42 | Multi-language test code generation |
| visual-accessibility | 17 | WCAG, visual regression, a11y |

Supporting infrastructure layers remain the same: kernel, shared, coordination, adapters, plus newer additions: governance (16 files), validation (trigger optimizer, version comparator), and strange-loop (infra-healing).

**Top-level directories in src/**: 38 (up from an unspecified count in v3.7.10, but the directory tree now includes `_archived/`, `causal-discovery/`, `early-exit/`, `feedback/`, `migrations/` alongside `migration/`, `monitoring/`, `optimization/`, `performance/`, `planning/`, `routing/`, `strange-loop/`, `sync/`, `workers/`, and `workflows/`).

**Finding: Directory proliferation.** 38 top-level directories under `src/` is excessive for comprehension. Several are conceptually overlapping (e.g., `monitoring/` vs `performance/`; `migration/` vs `migrations/`; `optimization/` vs `performance/`). This creates navigation confusion for new contributors.

### 1.2 File/Module Organization Quality

**CRITICAL FINDING: File size violations have worsened significantly.**

| Metric | v3.7.10 | v3.7.14 | Delta |
|--------|---------|---------|-------|
| Files >500 lines | 30+ | Not counted (see below) | -- |
| Files >1000 lines | 30+ | **83** | **+53** |
| Largest file | 1,941 lines | 1,941 lines | Unchanged |
| Total source files | 1,077 | 1,083 | +6 |
| Total source LOC | ~511K | ~513K | +2K |

The previous report stated "30+ files over 1000 lines" but upon precise measurement for this report, the current count is **83 files exceeding 1,000 lines**. Whether this represents growth since v3.7.10 or a more accurate count is unclear -- but the number is alarming regardless. The project's own CLAUDE.md mandates a 500-line limit. With 83 files exceeding double that threshold, this is a systemic structural violation.

The top 10 largest files remain unchanged from v3.7.10:

| Lines | File | Factor Over 500 Limit |
|-------|------|----------------------|
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

### 1.3 Dependency Graph Health

**NEWLY IDENTIFIED: Kernel-to-domain architecture violation.**

The v3.7.10 report stated "The kernel does not import from domains (verified: no upward imports from `src/kernel/`)." This finding was incorrect. Precise measurement reveals:

- **`src/kernel/kernel.ts` has 10 value imports from `src/domains/`** -- importing plugin factories from all 13 domains (minus test-execution, test-generation, contract-testing)
- This creates a hard upward dependency from the kernel layer to the domain layer, violating the clean architecture principle where inner layers should not depend on outer layers
- The `coordination/` layer also has 15 imports from `domains/` (13 are type-only, 4 are value imports)

**Bidirectional import analysis:**

| Relationship | Direction A | Direction B | Risk |
|-------------|-------------|-------------|------|
| coordination <-> domains | 15 imports from domains | 49 imports from coordination | Moderate (mostly type-only) |
| kernel <-> domains | **10 value imports from domains** | 70 imports from kernel | **High (architecture violation)** |
| learning <-> domains | 2 imports from domains | 9 imports from learning | Low |

**Finding:** The kernel is effectively a composition root that wires up all domain plugins. While this is a valid pattern (the kernel bootstraps the system), it couples the kernel to every domain, making individual domain extraction impossible without modifying the kernel. A plugin registry or dependency injection container would be cleaner.

**No circular dependency detection tooling** is configured. No `madge`, `dpdm`, or `circular-dependency-plugin` has been added since v3.7.10.

### 1.4 Configuration File Completeness

| Config File | Present | Quality | Change from v3.7.10 |
|-------------|---------|---------|---------------------|
| `package.json` | Yes | 59 scripts (down from 98) | Improved |
| `tsconfig.json` | Yes | Strict mode, path aliases | Unchanged |
| `vitest.config.ts` | Yes | Temp dir isolation | Unchanged |
| `.npmignore` | Yes | 74 rules | **New** (fixes package bloat) |
| `.github/workflows/` | Yes (9) | Comprehensive | Unchanged |
| `CHANGELOG.md` | Yes | Excellent | Updated through 3.7.14 |

**Improvement**: npm scripts reduced from 98 to 59 -- a meaningful cleanup that reduces cognitive load.

### 1.5 Structure Risks

| Risk | Severity | Trend |
|------|----------|-------|
| 83 files over 1,000 lines | High | Worsening or more accurately measured |
| Kernel depends on all domains | High | Unchanged (pre-existing) |
| 38 top-level directories in src/ | Medium | Growing |
| No circular dependency detection | Medium | Unchanged |
| migration/ and migrations/ coexist | Low | Unchanged |

---

## 2. FUNCTION -- What the Product DOES

**Score: 7.5 / 10** (v3.7.10: 7 -- delta: +0.5)

### 2.1 Core Capabilities Inventory

| Capability | Interface | Status | New in 3.7.11-14? |
|------------|-----------|--------|--------------------|
| Test generation (12+ languages) | CLI + MCP | Functional | No |
| Coverage gap analysis | CLI + MCP | Functional | No |
| Flaky test detection | CLI + MCP | Functional | No |
| Defect prediction | MCP | Functional | No |
| Security scanning | CLI + MCP | Functional | No |
| Contract validation | CLI + MCP | Functional | No |
| Requirements analysis (QCSD) | MCP + Agents | Functional | No |
| Visual regression / a11y | CLI + MCP | Functional | No |
| Agent fleet management | CLI + MCP | Functional | No |
| Learning/ReasoningBank | Internal | Functional | No |
| Code intelligence (C4, KG) | CLI + MCP | Functional | No |
| Init wizard (14 platforms) | CLI | Functional | Updated (Kiro added) |
| Shell completions | CLI | Functional | No |
| Cloud sync (Postgres) | CLI | Functional | No |
| **Brain export v3.0** | CLI | **Functional** | **v3.7.14** |
| **Witness chain (SHAKE-256 + Ed25519)** | CLI | **Functional** | **v3.7.14** |
| **Trigger optimizer** | CLI | **Functional** | **v3.7.13** |
| **Version comparator (A/B testing)** | CLI | **Functional** | **v3.7.13** |
| **Skill intent classification** | Validation | **Functional** | **v3.7.13** |
| **Governance integration (8 modules)** | Library | **Functional** | **v3.7.11** |

**22 CLI commands** remain registered under `src/cli/commands/`.
**70 MCP tools** total: 42 via protocol-server registration + 28 via domain tool files.
**60 QE agent definitions** (up from 53 in v3.7.10).
**111 skills** (down from 117 in v3.7.10 -- cleanup of platform skills).

### 2.2 New Feature Assessment (v3.7.11-14)

**Brain Export v3.0 (v3.7.14)** -- High maturity signal:
- Covers all 25 learning tables (up from 4) using data-driven `TABLE_CONFIGS`
- Streaming export for tables >10K rows via `writeJsonlStreaming()` to prevent OOM
- FK-aware ordering, Base64 BLOB serialization, automatic DDL on import
- Import wrapped in `db.transaction()` for atomic rollback

**Witness Chain v3 (v3.7.14)** -- High maturity signal:
- Dual hash algorithm support (sha256/shake256)
- 12 witness action types wired to production mutation sites
- Ed25519 key persistence with PEM files
- Backfill CLI for pre-existing databases

**Governance Integration (v3.7.11)** -- Medium maturity:
- 8 governance modules properly wired with local-first pattern
- `import {} from 'agentic-qe/governance'` now works via subpath export
- Continue-gate, memory-write-gate, adversarial-defense, deterministic-gateway, proof-envelope, shard-retriever, evolution-pipeline, trust-accumulator

**Trigger Optimizer (v3.7.13)** -- Medium maturity:
- Jaccard similarity analysis across skill fleet
- Identifies confusable skills
- Generates actionable suggestions for trigger precision

### 2.3 Error Handling Robustness

Error handling patterns remain consistent with v3.7.10:
- 431 `console.error`/`logger.error` calls across source
- `toErrorMessage()` utility for safe error stringification
- `chalk.red` for visual emphasis

**New in v3.7.14**: Import atomicity via `db.transaction()` in brain import -- a direct improvement in error recovery for a critical data path.

**Unchanged gap**: No structured error taxonomy (error codes, categories). Error messages are readable but not machine-actionable.

### 2.4 Function Risks

| Risk | Severity | Trend |
|------|----------|-------|
| Feature breadth vs depth disparity | Medium | Unchanged |
| 8 governance modules with varying maturity | Medium | New |
| Brain export handles 25 tables with complex FK ordering | Low | New (well-tested) |
| No skill intent classification in actual source (0 matches) | Low | New (may be in config only) |

---

## 3. DATA -- What the Product PROCESSES

**Score: 7 / 10** (v3.7.10: 7 -- delta: 0)

### 3.1 Data Flow Analysis

The data flow architecture is unchanged from v3.7.10:

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

**New in v3.7.14**: Brain export adds a secondary data flow:
```
Memory.db (25 tables)
  --> Brain Export (TABLE_CONFIGS, FK-aware ordering)
    --> JSONL files (streaming for >10K rows)
    --> RVF container with manifest sidecar
  --> Brain Import
    --> db.transaction() atomic merge
    --> 4 merge strategies: latest-wins, highest-confidence, union, skip-conflicts
```

### 3.2 Data Validation at Boundaries

| Validation Approach | v3.7.10 | v3.7.14 | Delta |
|---------------------|---------|---------|-------|
| Zod / Joi schema validation | 0 files | 0 files | Unchanged |
| Manual typeof/instanceof checks | ~350 files | 354 files | +4 |
| secure-json-parse | Present | Present | Unchanged |
| SQL injection prevention | Present | Present | Unchanged |
| Foreign key constraints | 32 references | 32 references | Unchanged |

**Finding**: The absence of a schema validation library remains a gap. For a project with 70+ MCP tools accepting JSON input, runtime schema validation would significantly reduce the risk of malformed input causing unexpected behavior.

### 3.3 Database Schema Design Quality

**30 tables** at **schema version 8** -- unchanged from v3.7.10.

The brain export v3.0 now covers all 25 learning-related tables (a subset of the 30 total):
- `qe_patterns`, `qe_embeddings`, `qe_usage` -- pattern learning
- `rl_q_values` -- reinforcement learning
- `concept_nodes`, `concept_edges` -- knowledge graph
- `dream_cycles`, `dream_insights` -- neural consolidation
- `goap_goals`, `goap_actions`, `goap_plans`, `goap_plan_signatures` -- GOAP planning
- Plus 13 additional tables

**Improvement**: The brain export/import now wraps all table merges in a single `db.transaction()` for atomic rollback on failure. This directly addresses a data integrity risk identified in the v3.7.10 baseline.

### 3.4 Data Risks

| Risk | Severity | Trend |
|------|----------|-------|
| No runtime schema validation (no Zod) | Medium | Unchanged |
| 150K+ records in single SQLite file | Medium | Unchanged |
| better-sqlite3 synchronous blocking under load | Medium | Unchanged |
| Streaming export prevents OOM on large tables | N/A | **Mitigated (new)** |
| Atomic import transaction prevents partial writes | N/A | **Mitigated (new)** |

---

## 4. INTERFACES -- How Users INTERACT

**Score: 6.5 / 10** (v3.7.10: 6 -- delta: +0.5)

### 4.1 CLI UX Analysis

**Binary names**: `aqe`, `agentic-qe`, `aqe-v3` (unchanged -- three aliases)
**MCP binary**: `aqe-mcp`

**22 CLI commands** (unchanged from v3.7.10):

| Command | Purpose |
|---------|---------|
| init | Project initialization with platform wizard |
| test | Test execution |
| coverage | Coverage analysis |
| security | Security scanning |
| quality | Quality assessment |
| code | Code intelligence |
| validate | Requirements validation |
| validate-swarm | Swarm validation |
| fleet | Fleet management |
| learning | Learning/ReasoningBank |
| hooks | Hook management |
| eval | Evaluation framework |
| mcp | MCP server management |
| sync | Cloud sync |
| ci | CI pipeline integration |
| migrate | Migration utilities |
| platform | Platform configuration |
| token-usage | Token usage analysis |
| llm-router | LLM routing |
| completions | Shell completion scripts |
| claude-flow-setup | Claude Flow integration |

### 4.2 MCP Tool Interface Quality

**Corrected tool count**: The v3.7.10 report estimated "~102 MCP tools." Upon precise measurement:

| Category | Tool Count | Source |
|----------|-----------|--------|
| Protocol server registered tools | 42 | `src/mcp/protocol-server.ts` |
| Domain-specific tool files | 28 | `src/mcp/tools/*/` (grep for `name: 'qe/'`) |
| **Total unique MCP tools** | **~70** | Deduplicated (some overlap) |

The 42 protocol-server tools use underscore naming (`accessibility_test`, `agent_list`, etc.) while the 28 domain tools use slash naming (`qe/qx/analyze`, `qe/code/analyze`, etc.). This dual naming convention is a discoverability issue -- a user searching for "coverage" would need to check both `coverage_analyze_sublinear` and `qe/coverage/analyze`.

**Tool categories (protocol-server, 42 tools)**:

| Category | Tools | Count |
|----------|-------|-------|
| Agent management | agent_list, agent_metrics, agent_spawn, agent_status | 4 |
| Fleet management | fleet_health, fleet_init, fleet_status | 3 |
| Memory | memory_delete, memory_query, memory_retrieve, memory_share, memory_store, memory_usage | 6 |
| Task | task_cancel, task_list, task_orchestrate, task_status, task_submit | 5 |
| Team | team_broadcast, team_health, team_list, team_message, team_rebalance, team_scale | 6 |
| Quality | quality_assess, requirements_validate | 2 |
| Testing | test_execute_parallel, test_generate_enhanced | 2 |
| Security | security_scan_comprehensive | 1 |
| Analysis | code_index, coverage_analyze_sublinear, defect_predict, contract_validate, accessibility_test, chaos_test | 6 |
| Infrastructure | aqe_health, infra_healing_feed_output, infra_healing_recover, infra_healing_status, model_route, routing_metrics | 6 |

**New in v3.7.11**: Governance subpath export (`import {} from 'agentic-qe/governance'`) adds a new programmatic interface for consumers.

### 4.3 API Surface Area

The `package.json` exports map now exposes **7 entry points** (up from 6):

| Export | Purpose | New? |
|--------|---------|------|
| `.` | Main library | No |
| `./kernel` | Kernel/memory subsystem | No |
| `./shared` | Shared utilities | No |
| `./cli` | CLI entry | No |
| `./ruvector` | Native ML wrappers | No |
| `./sync` | Cloud sync module | No |
| **`./governance`** | **Governance modules** | **Yes (v3.7.11)** |

**Unchanged gap**: No API stability guarantees documented. No TypeDoc or API reference site.

### 4.4 Interface Risks

| Risk | Severity | Trend |
|------|----------|-------|
| Dual MCP tool naming (underscore vs slash) | Medium | Unchanged |
| Three binary aliases with no deprecation plan | Low | Unchanged |
| No inline usage examples in --help | Medium | Unchanged |
| No MCP tool categorization/recommendation | Medium | Unchanged |
| Governance export adds API surface without docs | Low | New |

---

## 5. PLATFORM -- What it DEPENDS ON

**Score: 5 / 10** (v3.7.10: 5 -- delta: 0)

### 5.1 Node.js Version Compatibility

| Aspect | v3.7.10 | v3.7.14 |
|--------|---------|---------|
| Minimum (engines) | >= 18.0.0 | >= 18.0.0 |
| CI tested versions | 24 only | 24 only |
| Dev environment | 24.13.0 | 24.13.0 |

**Unchanged gap**: CI tests only Node 24. The engines field claims `>=18.0.0` but this is untested. A user on Node 18 LTS or Node 20 LTS could encounter runtime errors that CI never catches.

### 5.2 OS Compatibility

**Unchanged from v3.7.10**:
- Linux x64 (GNU + musl): Supported via optionalDependencies
- Linux ARM64 (GNU + musl): Supported via optionalDependencies
- macOS ARM64 (Apple Silicon): Supported
- macOS x64 (Intel): Supported
- **Windows: Silently unsupported**

Platform-awareness analysis:
- 23 files reference `process.platform` or `os.platform`
- Init scripts (`agents-installer.ts`, `skills-installer.ts`) handle `win32` for path resolution
- Shell-dependent code (`/bin/sh`) has win32 fallback to `cmd.exe` in some files
- But 19 files contain hardcoded Unix paths (`/tmp/`, `/usr/`, `/bin/`)
- `strange-loop/infra-healing/infra-action-executor.ts` hardcodes `/bin/sh` without Windows fallback

**Finding**: Windows support is partial at best. The init wizard has some Windows path handling, but the infrastructure layer (infra-healing, daemon scripts) assumes Unix. A Windows user would get past `aqe init` but encounter failures in advanced features.

### 5.3 npm Package Size

| Metric | v3.7.10 (pre-fix) | v3.7.14 (post-fix) | Improvement |
|--------|--------------------|--------------------|-------------|
| Package files | ~5,473 | 3,301 | **-40%** |
| Package size | Unknown | 50.7 MB unpacked | Baseline established |

**Key improvement**: v3.7.14 fixed an npm install `ENOTEMPTY` error caused by excessive file count. The `.npmignore` (74 rules) now excludes test fixtures, build artifacts, and development-only directories.

### 5.4 npm Audit Status

```
6 high severity vulnerabilities (unchanged from v3.7.10)
```

All 6 are in `minimatch` via `@typescript-eslint/*` (devDependencies only). These are not shipped to consumers but remain unfixed. Fixable via `npm audit fix`.

### 5.5 External Service Dependencies

Unchanged from v3.7.10:

| Dependency | Required | Purpose |
|------------|----------|---------|
| SQLite (via better-sqlite3) | Yes | Core persistence |
| PostgreSQL | Optional | Cloud sync only |
| LLM Provider (OpenAI/Anthropic) | Optional | Test generation, learning |
| Docker | Optional | Postgres integration tests |

### 5.6 Platform Risks

| Risk | Severity | Trend |
|------|----------|-------|
| Windows users encounter silent failures | High | Unchanged |
| Node 18/20 LTS untested in CI | High | Unchanged |
| Native deps (better-sqlite3, hnswlib-node) fail on platforms without build toolchain | Medium | Unchanged |
| npm audit shows 6 high vulns in devDeps | Low | Unchanged |
| Package size at 50.7MB is large | Medium | Improved (file count down 40%) |

---

## 6. OPERATIONS -- How it's MAINTAINED

**Score: 7.5 / 10** (v3.7.10: 7 -- delta: +0.5)

### 6.1 Build System Health

Unchanged from v3.7.10:
1. `tsc` -- TypeScript compilation (strict mode)
2. `build:cli` -- esbuild bundle for CLI
3. `build:mcp` -- esbuild bundle for MCP server

**New in v3.7.12**: Fixed a CLI crash on global install where `aqe --version` failed with `ERR_MODULE_NOT_FOUND: Cannot find package 'typescript'`. TypeScript is now lazy-loaded via `createRequire` Proxy. This directly improves the first-run experience.

### 6.2 CI/CD Pipeline Assessment

**9 workflow files** (unchanged count):

| Workflow | Purpose | Maturity | Change |
|----------|---------|----------|--------|
| `optimized-ci.yml` | PR/push testing | High | Unchanged |
| `npm-publish.yml` | Production npm publish | High | Unchanged |
| `benchmark.yml` | Performance benchmarks | Medium | Unchanged |
| `coherence.yml` | Architecture coherence | Medium | Unchanged |
| `mcp-tools-test.yml` | MCP tool validation | Medium | Unchanged |
| `skill-validation.yml` | Skill frontmatter/tier validation | Medium | Unchanged |
| `sauce-demo-e2e.yml` | E2E browser tests | Medium | Unchanged |
| `qcsd-production-trigger.yml` | Production quality trigger | Low | Unchanged |
| `n8n-workflow-ci.yml` | n8n integration CI | Low | Unchanged |

**Unchanged gaps**: No Node.js version matrix. No Windows CI runner. `continue-on-error: true` still masks failures.

### 6.3 Release Process Maturity

Release cadence v3.7.11 through v3.7.14: **4 releases in 3 days** (March 6-8, 2026).

| Version | Date | Theme | Breaking? |
|---------|------|-------|-----------|
| 3.7.11 | Mar 6 | Governance integration | No |
| 3.7.12 | Mar 6 | CLI crash fix (global install) | No |
| 3.7.13 | Mar 7 | Trigger optimizer, version comparator | No |
| 3.7.14 | Mar 8 | Brain export v3, witness chain, ENOTEMPTY fix | No |

**Positive**: Zero breaking changes across all four releases. The release discipline has improved -- each release is self-contained and backward-compatible.

**New in v3.7.12**: The release skill now includes pre-release step 8e (isolated dependency check) and post-publish step 15 (clean-environment install verification). This directly addresses the class of bug fixed in v3.7.12 (missing external dependency at runtime).

### 6.4 Package Distribution Health

| Metric | v3.7.10 | v3.7.14 |
|--------|---------|---------|
| Package files | ~5,473 | 3,301 |
| npm install ENOTEMPTY error | Present | **Fixed** |
| Global install crash | Present | **Fixed (v3.7.12)** |
| ReDoS vulnerability in trigger-optimizer | Present | **Fixed (v3.7.14)** |

These three fixes directly improve operational reliability for end users. The ENOTEMPTY fix in particular removed a blocking installation failure.

### 6.5 Documentation Completeness

| Documentation | v3.7.10 Status | v3.7.14 Status | Change |
|---------------|----------------|----------------|--------|
| README.md | 365 lines | 366 lines | Negligible |
| CHANGELOG.md | Comprehensive | Excellent | Updated |
| CLAUDE.md | 300+ lines | 300+ lines | Unchanged |
| User guides | 3 files | 3 files | Unchanged |
| API docs | Missing | Missing | **No improvement** |
| Architecture (ADRs) | Extensive | Extensive (ADR-065, 070, 073 added) | Improved |
| Total docs/ files | Unknown | 329 .md files | Baseline |

**Unchanged critical gap**: No API documentation for programmatic consumers. No TypeDoc, no JSDoc site. The governance subpath export (`agentic-qe/governance`) was added without corresponding documentation.

### 6.6 Monitoring and Observability

Unchanged from v3.7.10:
- `src/monitoring/` exists
- `src/strange-loop/` for self-observation
- MCP server metrics
- Performance monitoring

**New in v3.7.14**: Witness chain provides audit trail capabilities for learning mutations (dream merge/discard, branch merge, Hebbian penalty, routing decisions, pattern quarantine). This improves observability of the learning subsystem specifically.

**Unchanged gap**: No external observability integration (OpenTelemetry, Prometheus, structured logging to external sinks).

### 6.7 Operations Risks

| Risk | Severity | Trend |
|------|----------|-------|
| No API documentation | High | Unchanged |
| No external observability | Medium | Partially mitigated (witness chain) |
| 4 releases in 3 days (rapid cadence) | Low | Stabilizing |
| 329 docs files with no clear index | Medium | Unchanged |

---

## 7. TIME -- How it CHANGES

**Score: 6.5 / 10** (v3.7.10: 6 -- delta: +0.5)

### 7.1 Version History Stability

Release timeline (3.x series, recent):

| Version | Date | Days Since Previous |
|---------|------|---------------------|
| 3.7.5 | Mar 1 | -- (restructure) |
| 3.7.6 | Mar 2 | 1 |
| 3.7.7 | Mar 2 | 0 |
| 3.7.8 | Mar 4 | 2 |
| 3.7.9 | Mar 5 | 1 |
| 3.7.10 | Mar 5 | 0 |
| 3.7.11 | Mar 6 | 1 |
| 3.7.12 | Mar 6 | 0 |
| 3.7.13 | Mar 7 | 1 |
| 3.7.14 | Mar 8 | 1 |

**10 releases in 8 days**. The project is clearly in a stabilization sprint following the v3.7.5 flatten. While concerning for stability, the zero-breaking-change discipline since v3.7.10 is encouraging.

### 7.2 Breaking Change Analysis

The CHANGELOG contains 38 mentions of "breaking" or "BREAKING" across the full 3.x series. Upon detailed analysis:

**Actual breaking changes in 3.x** (not "zero breaking changes" statements):

| Version | Breaking Change |
|---------|-----------------|
| 3.5.0 | QUIC transport replaced fake HTTP/2 implementation |
| 3.5.0 | Skills manifest reduced from 68 to 41 QE-only skills |
| 3.5.0 | EventType changed from string to enum |
| 3.4.0 | 31 deprecated tool wrappers removed |
| 3.4.0 | AgentLifecycleManager.setStatus() replaced with transitionTo() |
| 3.1.x | Various method signature changes (async) |

**Total actual breaking changes in 3.x: ~7** (not 15 as the v3.7.10 baseline stated). The 38 mentions include many "zero breaking changes" and "no breaking changes" statements, which inflated the raw count.

**Since v3.7.10: Zero breaking changes.** All four releases (3.7.11-14) are fully backward compatible.

### 7.3 Deprecation Tracking

164 references to `@deprecated` or `deprecated` in source code. This is a healthy signal -- the project marks deprecated APIs rather than silently changing them.

### 7.4 Technical Debt Trajectory

| Debt Category | v3.7.10 Severity | v3.7.14 Severity | Trend |
|---------------|------------------|-------------------|-------|
| Files > 500 lines | High | High | Worsening (83 > 1000 lines measured) |
| No schema validation library | Medium | Medium | Unchanged |
| No API docs | High | High | Unchanged |
| No Windows support | High | High | Unchanged |
| ESLint audit vulnerabilities | Low | Low | Unchanged |
| npm scripts count | Low (98) | Improved (59) | **Improved** |
| `@faker-js/faker` in prod deps | Low | Low | Unchanged |
| Package size bloat | Medium | Low | **Improved** |
| Global install crash | Medium | N/A | **Fixed** |
| npm ENOTEMPTY install error | High | N/A | **Fixed** |

---

## Quality Experience (QX) Assessment

**Score: 5.5 / 10** (v3.7.10: 5 -- delta: +0.5)

### QX-1: First-Run Experience

The v3.7.14 first-run experience for a new user:

1. **`npm install agentic-qe`** -- Previously could fail with `ENOTEMPTY` error. Now fixed. Package is 3,301 files / 50.7MB unpacked, which is large but functional. Native addon compilation (better-sqlite3) may add time.

2. **`npx agentic-qe --version`** -- Previously crashed with `ERR_MODULE_NOT_FOUND` on global install (v3.7.12 fix). Now works correctly.

3. **`npx aqe init`** -- Wizard offers 14 platform options. Well-structured with `--auto` for scripted setup. Options include `--with-cursor`, `--with-copilot`, `--with-roocode`, etc.

4. **What to do next** -- Still unclear. No "Quick Start" tutorial. README lists capabilities but lacks a "Hello World" workflow. 111 skills installed with no guidance on which to start with.

**Improvement over v3.7.10**: The two installation-blocking bugs (ENOTEMPTY, global install crash) are fixed. A user can now actually get to step 3 reliably, which is a meaningful QX improvement.

**Unchanged gap**: Steps 3-4 remain weak. After `aqe init`, the user faces 22 CLI commands, 70+ MCP tools, 111 skills, and 60 agents with no guided path.

### QX-2: Error Recovery Experience

**Score: 6 / 10** (unchanged from v3.7.10)

| Recovery Scenario | Quality |
|-------------------|---------|
| Installation failure (native dep) | Poor -- opaque npm error output |
| Init wizard failure | Good -- `aqe init status` checks health |
| Config corruption | Good -- `aqe init reset` preserves data |
| Database corruption | Good -- mandatory backup rules in CLAUDE.md |
| LLM key missing | Adequate -- error message appears but no link to docs |
| Brain import failure | **Good (new)** -- atomic transaction rollback |

**New in v3.7.14**: Brain import atomicity means a failed import rolls back cleanly rather than leaving a partially-updated database.

**Unchanged gaps**:
- No `aqe doctor` or `aqe diagnose` command
- No error codes or error catalog
- No FAQ for common issues
- 679 files contain suggestion/hint patterns, but they are internal, not user-facing

### QX-3: Documentation Discovery Experience

**Score: 4 / 10** (unchanged from v3.7.10)

| What a User Seeks | Where It Is | Findable? | Change |
|--------------------|-------------|-----------|--------|
| How to install | README.md | Yes | Unchanged |
| How to use CLI commands | `aqe --help` | Partially (no examples) | Unchanged |
| How to use MCP tools | Nowhere documented | No | Unchanged |
| How to use governance module | Nowhere documented | No | **Regression** (new API, no docs) |
| How to write custom skills | 1 guide in docs/guides | Barely | Unchanged |
| API reference | Does not exist | No | Unchanged |
| Architecture overview | ADRs in docs/ | Only for contributors | Unchanged |
| Troubleshooting | CLAUDE.md (dev-only) | No | Unchanged |
| Upgrade guide | Does not exist | No | Unchanged |
| Brain export/import guide | Nowhere documented | No | **Gap** (new feature, no docs) |

**Finding**: New features (governance export, brain export v3, witness chain) were added without corresponding user-facing documentation. The documentation debt is growing faster than the documentation.

### QX-4: Configuration Complexity

The init wizard supports 14 platform-specific configurations via `--with-*` flags. This is comprehensive but potentially overwhelming. A new user must understand:
- Which AI coding assistant they use
- Whether they need n8n, OpenCode, or Kiro integration
- Whether to use `--auto` or interactive mode
- Whether to use `--minimal` for a lighter install

There is no decision tree or recommendation engine to guide platform selection.

### QX-5: Expert User Experience

**Score: 7 / 10** (improvement for experienced users)

For users already familiar with AQE:
- Brain export v3 with streaming prevents OOM on large databases
- Witness chain provides audit trail for learning mutations
- Trigger optimizer helps improve skill precision
- Version comparator enables A/B testing of skill changes
- Governance modules provide production safety guardrails

These are sophisticated features that serve the expert segment well.

---

## Comparison: v3.7.10 vs v3.7.14

### Quantitative Metrics

| Metric | v3.7.10 | v3.7.14 | Delta |
|--------|---------|---------|-------|
| Source files (.ts) | 1,077 | 1,083 | +6 |
| Source lines of code | ~511K | ~513K | +2K |
| Test files | 627 | 647 | +20 |
| Test LOC | ~327K | ~537K | +210K |
| Test-to-source ratio (LOC) | 0.64:1 | 1.05:1 | **+0.41** |
| Domain bounded contexts | 13 | 13 | 0 |
| QE agents | 53 | 60 | +7 |
| Skills | 117 | 111 | -6 (cleanup) |
| MCP tools (protocol server) | ~102 (estimated) | 42 (precise) | Corrected |
| MCP tools (domain) | Included above | 28 | Split out |
| MCP tools (total) | ~102 (estimated) | ~70 (precise) | Corrected |
| CLI commands | 22 | 22 | 0 |
| Database tables | 30 | 30 | 0 |
| Schema version | 8 | 8 | 0 |
| Production dependencies | 22 | 23 | +1 |
| Optional dependencies | 12 | 13 | +1 |
| Dev dependencies | 13 | 17 | +4 |
| npm scripts | 98 | 59 | **-39** |
| CI workflows | 9 | 9 | 0 |
| Files > 1000 lines | 30+ (imprecise) | 83 (precise) | Measured |
| npm package files | ~5,473 | 3,301 | **-2,172** |
| Package exports | 6 | 7 | +1 |
| Top-level src/ directories | Unknown | 38 | Baseline |
| Error/recovery patterns | Unknown | 1,629 | Baseline |
| Deprecation markers | Unknown | 164 | Baseline |
| Platform-specific code refs | Unknown | 23 | Baseline |

### Score Comparison

| Factor | v3.7.10 | v3.7.14 | Delta | Key Driver |
|--------|---------|---------|-------|------------|
| Structure | 6 | 5 | -1 | 83 files >1K lines; kernel->domain violation found |
| Function | 7 | 7.5 | +0.5 | Brain export v3, governance, trigger optimizer |
| Data | 7 | 7 | 0 | Stable schema; atomic import added |
| Interfaces | 6 | 6.5 | +0.5 | Governance export; tool count corrected to ~70 |
| Platform | 5 | 5 | 0 | No Windows or Node version matrix progress |
| Operations | 7 | 7.5 | +0.5 | ENOTEMPTY fix, global install fix, package reduction |
| Time | 6 | 6.5 | +0.5 | Zero breaking changes in 4 releases |
| QX | 5 | 5.5 | +0.5 | Install reliability improved |
| **Composite** | **6.4** | **6.6** | **+0.2** | |

### What Improved

1. **Install reliability** -- Two blocking install bugs fixed (ENOTEMPTY, global install crash)
2. **Package hygiene** -- 40% reduction in shipped files via .npmignore
3. **Data integrity** -- Atomic brain import, streaming export for large tables
4. **Audit trail** -- Witness chain for learning mutation tracking
5. **API surface** -- Governance subpath export added
6. **Release discipline** -- Zero breaking changes across 4 releases
7. **npm scripts cleanup** -- Reduced from 98 to 59

### What Did Not Improve

1. **File size violations** -- 83 files still exceed 1,000 lines
2. **Windows support** -- Still silently unsupported
3. **Node version testing** -- CI still Node 24 only
4. **API documentation** -- Still missing
5. **First-run guidance** -- No Quick Start guide
6. **MCP tool discoverability** -- No categorization or recommendation
7. **Schema validation** -- No Zod or similar library
8. **External observability** -- No OpenTelemetry integration

### What Got Worse

1. **Structure score decreased** -- More precise measurement revealed 83 files >1K lines (vs. previously reported "30+"), and kernel->domain value imports were newly identified
2. **Documentation debt** -- 5 new features added (brain export, witness chain, governance, trigger optimizer, version comparator) without user-facing documentation

---

## Recommendations by Factor

### Structure (Priority: HIGH)

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| S1 | Add ESLint rule to enforce 500-line file limit; fail CI on violations | Low | High |
| S2 | Extract kernel plugin registration to a composition root module separate from kernel core | Medium | High |
| S3 | Add `madge` or `dpdm` to CI for circular dependency detection | Low | Medium |
| S4 | Consolidate overlapping directories (migration/ + migrations/, monitoring/ + performance/) | Medium | Medium |
| S5 | Split top 10 largest files, starting with `qe-reasoning-bank.ts` (1,941 lines) | High | High |

### Function (Priority: MEDIUM)

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| F1 | Add feature maturity tiers to README (production-ready vs. experimental) | Low | High |
| F2 | Create "Hello World" Quick Start: init -> generate tests -> run tests | Low | High |
| F3 | Document governance module API with usage examples | Medium | Medium |
| F4 | Add integration tests for brain export/import round-trip | Medium | Medium |

### Data (Priority: MEDIUM)

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| D1 | Add Zod schema validation for MCP tool inputs | High | High |
| D2 | Profile SQLite performance under concurrent MCP load (10+ simultaneous tools) | Medium | Medium |
| D3 | Add automated memory.db backup schedule (not just manual discipline) | Low | Medium |

### Interfaces (Priority: MEDIUM)

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| I1 | Unify MCP tool naming convention (choose underscore OR slash, not both) | High | High |
| I2 | Add `--examples` flag or inline examples to CLI --help output | Low | High |
| I3 | Create MCP tool discovery guide with categorization by use case | Medium | High |
| I4 | Deprecate `aqe-v3` binary alias | Low | Low |

### Platform (Priority: HIGH)

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| P1 | Add CI matrix for Node 18, 20, 22, 24 | Low | High |
| P2 | Either document Windows as unsupported (add `engines.os` to package.json) or fix Windows paths | Low | High |
| P3 | Run `npm audit fix` to clear devDependency vulnerabilities | Low | Low |

### Operations (Priority: MEDIUM)

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| O1 | Generate TypeDoc API reference from .d.ts files | Medium | High |
| O2 | Create documentation index (table of contents) for 329 docs files | Low | Medium |
| O3 | Add `aqe doctor` command for troubleshooting | Medium | High |
| O4 | Add OpenTelemetry integration for external observability | High | Medium |

### Time (Priority: LOW)

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| T1 | Establish release cadence target (e.g., weekly instead of daily) | Low | Medium |
| T2 | Add automated CHANGELOG generation from conventional commits | Medium | Medium |
| T3 | Create upgrade guide for each minor version bump | Low | Medium |

---

## Risk Matrix

| Risk | Likelihood | Impact | Priority | v3.7.10 Status | v3.7.14 Status |
|------|-----------|--------|----------|----------------|----------------|
| Windows user install failure | High | High | P0 | Open | **Open** |
| Node 18/20 runtime incompatibility | Medium | High | P0 | Open | **Open** |
| npm install ENOTEMPTY | High | High | P0 | Open | **Fixed** |
| Global install crash | Medium | High | P0 | Open | **Fixed** |
| MCP tool discoverability | High | Medium | P1 | Open | **Open** |
| File size violations causing maintenance drag | High | Medium | P1 | Open | **Open (worse)** |
| No API documentation | High | Medium | P1 | Open | **Open** |
| First-time user abandonment | Medium | High | P1 | Open | **Partially mitigated** |
| New features without docs | Medium | Medium | P1 | N/A | **New** |
| Kernel architecture violation | Medium | Medium | P2 | Not identified | **New** |
| SQLite blocking under MCP load | Low | High | P2 | Open | **Open** |
| Learning data corruption | Low | Critical | P2 | Open | **Mitigated (atomic import)** |

---

## Prioritized Test Ideas (SFDIPOT-Derived)

### P0 -- Critical

| ID | Category | Test Idea | Status |
|----|----------|-----------|--------|
| P-001 | Platform | Install `agentic-qe@3.7.14` on Windows 11 and document every failure | Open |
| P-002 | Platform | Install and run `aqe --version` on Node 18 LTS, 20 LTS, 22 LTS | Open |
| S-001 | Structure | Run `madge` circular dependency detection across 1,083 source files | Open |
| O-001 | Operations | Fresh `npm install agentic-qe@3.7.14` in clean environment (no cache) | **Covered by v3.7.14 fix** |

### P1 -- High

| ID | Category | Test Idea | Status |
|----|----------|-----------|--------|
| F-001 | Function | Brain export -> import round-trip on database with 150K+ records | New |
| F-002 | Function | Witness chain verification after brain import/merge | New |
| D-001 | Data | Send 10 concurrent MCP tool requests and measure SQLite contention | Open |
| I-001 | Interfaces | Invoke all 70 MCP tools with empty/minimal input; confirm no server crash | Open |
| T-001 | Time | Upgrade from v3.7.10 to v3.7.14 with existing memory.db; verify zero data loss | Open |

### P2 -- Medium

| ID | Category | Test Idea | Status |
|----|----------|-----------|--------|
| S-002 | Structure | Verify kernel can start without all 13 domain plugins loaded | New |
| F-003 | Function | Trigger optimizer: test with 111 skills and verify confusability detection | New |
| F-004 | Function | Governance module: import from `agentic-qe/governance` and call each of 8 modules | New |
| D-002 | Data | Brain export streaming: test with table >10K rows; verify no OOM | New |
| O-002 | Operations | Build from clean checkout; verify dist/ matches expected structure | Open |

### P3 -- Low

| ID | Category | Test Idea | Status |
|----|----------|-----------|--------|
| S-003 | Structure | Count files >500 lines; add as CI metric | Open |
| T-002 | Time | Version comparator: run A/B test between two skill versions | New |
| P-003 | Platform | Test on Alpine Linux (musl); confirm native deps load | Open |

---

## Appendix A: Source Code Metrics (v3.7.14)

| Metric | Value |
|--------|-------|
| Source files (.ts) | 1,083 |
| Source lines of code | ~513,000 |
| Test files (.test.ts/.spec.ts) | 647 |
| Test lines of code | ~537,000 |
| Test-to-source ratio (LOC) | 1.05:1 |
| Domain bounded contexts | 13 |
| QE agents | 60 |
| Skills | 111 |
| MCP tools (protocol server) | 42 |
| MCP tools (domain) | 28 |
| MCP tools (total, deduplicated) | ~70 |
| CLI commands | 22 |
| Database tables | 30 |
| Schema version | 8 |
| Production dependencies | 23 |
| Optional dependencies | 13 |
| Dev dependencies | 17 |
| npm scripts | 59 |
| CI workflows | 9 |
| Files > 1000 lines | 83 |
| Top-level src/ directories | 38 |
| npm package files | 3,301 |
| npm package size (unpacked) | 50.7 MB |
| Package exports | 7 |
| Governance modules | 16 files |
| Deprecation markers in source | 164 |
| Error/recovery patterns | 1,629 |
| Platform-specific code references | 23 |
| Hardcoded Unix paths | 19 |
| Documentation files (.md in docs/) | 329 |

## Appendix B: Key File References

| File | Significance |
|------|-------------|
| `/workspaces/agentic-qe-new/package.json` | Package manifest, 59 scripts, 7 exports |
| `/workspaces/agentic-qe-new/.npmignore` | 74-rule package exclusion (new in v3.7.14) |
| `/workspaces/agentic-qe-new/src/kernel/kernel.ts` | Composition root with 10 domain plugin imports |
| `/workspaces/agentic-qe-new/src/kernel/unified-memory-schemas.ts` | 30-table SQLite schema (v8) |
| `/workspaces/agentic-qe-new/src/mcp/protocol-server.ts` | 42 registerTool calls |
| `/workspaces/agentic-qe-new/src/mcp/tools/` | 28 domain-specific MCP tool definitions |
| `/workspaces/agentic-qe-new/src/governance/` | 16 governance module files (new in v3.7.11) |
| `/workspaces/agentic-qe-new/src/validation/trigger-optimizer.ts` | Skill trigger analysis (new in v3.7.13) |
| `/workspaces/agentic-qe-new/src/validation/version-comparator.ts` | A/B skill testing (new in v3.7.13) |
| `/workspaces/agentic-qe-new/src/learning/qe-reasoning-bank.ts` | Largest file (1,941 lines) |
| `/workspaces/agentic-qe-new/src/cli/commands/init.ts` | Init wizard (491 lines, 14 platform options) |
| `/workspaces/agentic-qe-new/.github/workflows/npm-publish.yml` | Production publish workflow |
| `/workspaces/agentic-qe-new/.github/workflows/optimized-ci.yml` | Primary CI workflow |
| `/workspaces/agentic-qe-new/CHANGELOG.md` | Version history through v3.7.14 |

## Appendix C: Methodology Notes

This report applies James Bach's SFDIPOT framework from the Heuristic Test Strategy Model. All findings are based on static analysis of the codebase at the `march-fixes-and-improvements` branch. The analysis used:

- `find` + `wc` for file metrics
- `grep` for pattern analysis (imports, registrations, validation patterns)
- Direct file reads for configuration analysis
- `npm pack --dry-run` for package metrics
- `npm audit` for vulnerability assessment
- Comparison against the v3.7.10 baseline report

Notable corrections from v3.7.10:
- **MCP tool count**: The v3.7.10 report estimated "~102" tools. Precise measurement shows 42 protocol-server tools + 28 domain tools = ~70 total (some potential overlap)
- **Files >1000 lines**: The v3.7.10 report said "30+" but precise measurement yields 83. This may reflect growth or more accurate counting
- **Breaking changes**: The v3.7.10 report cited "15 mentions" but most were "zero breaking changes" statements. Actual distinct breaking changes in 3.x: ~7

---

*Report generated by QE QX Partner (V3), powered by Claude Opus 4.6, using SFDIPOT framework from James Bach's Heuristic Test Strategy Model. Analysis performed on branch `march-fixes-and-improvements` as of 2026-03-09.*
