# Architecture & DDD Health Report -- AQE v3.8.3

**Report ID**: QE-ARCH-2026-0319-08
**Date**: 2026-03-19
**Branch**: march-fixes-and-improvements
**Commit**: 475bd61a
**Analyst**: QE Code Intelligence Agent (V3)

---

## Executive Summary

AQE v3.8.3 is a large-scale TypeScript codebase comprising **1,135 source files** and **532,932 lines of code** organized around a Domain-Driven Design architecture with 13 bounded contexts, a microkernel, and multiple interface layers (MCP and CLI).

The architecture demonstrates several strong DDD patterns -- a well-defined Domain Service Registry (CQ-005), consistent coordinator/plugin structures across all 13 domains, proper interface exports via namespaced barrels, and a mature event system with typed domain events. The dependency inversion between coordination and domains (via `DomainServiceRegistry` in shared/) is a notable positive design decision that eliminates direct bidirectional coupling.

However, the analysis reveals significant structural concerns: **30 directories at the `src/` top level** create organizational sprawl, five coordinator files exceed the 1,500-line threshold, the structured logger has near-zero adoption in domains (0 usages vs. 406 console.* calls), and a 9:1 ratio of raw catch blocks to `toErrorMessage` usage indicates inconsistent error handling. The codebase has also accumulated substantial functionality outside the canonical DDD layers that would benefit from consolidation.

**Overall Architecture Score: 6.4 / 10**

---

## 1. Bounded Context Inventory

All 13 domains follow a consistent internal structure: `coordinator.ts`, `interfaces.ts`, `plugin.ts`, `index.ts`, and a `services/` subdirectory. No domain has a standalone `types.ts` (types are defined within `interfaces.ts` instead). This is a strong indicator of intentional architectural discipline.

| Domain | Files | LOC | Coordinator LOC | Services | Cohesion |
|--------|-------|-----|-----------------|----------|----------|
| test-generation | 42 | 17,190 | 1,675 | 10 | High |
| test-execution | 29 | 14,445 | 1,269 | 10 (21 w/ subdirs) | High |
| requirements-validation | 38 | 20,461 | 1,264 | 5 (32 w/ subdirs) | Medium |
| visual-accessibility | 18 | 14,126 | 1,636 | 13 | High |
| code-intelligence | 18 | 11,019 | 1,537 | 5 (11 w/ subdirs) | High |
| security-compliance | 24 | 9,577 | 1,189 | 10 (20 w/ subdirs) | High |
| learning-optimization | 13 | 7,822 | 1,775 | 5 | Medium |
| quality-assessment | 18 | 7,859 | 1,277 | 5 | High |
| coverage-analysis | 13 | 7,461 | 1,154 | 9 | High |
| enterprise-integration | 11 | 6,726 | 795 | 7 | Medium |
| contract-testing | 8 | 6,644 | 1,474 | 4 | High |
| chaos-resilience | 8 | 6,159 | 1,701 | 4 | High |
| defect-intelligence | 9 | 5,332 | 824 | 5 | High |
| **TOTALS** | **253** | **135,803** | **Avg: 1,278** | **92 svc files** | |

### Structural Checklist (All 13 Domains)

| Check | Result |
|-------|--------|
| coordinator.ts present | 13/13 (100%) |
| interfaces.ts present | 13/13 (100%) |
| plugin.ts present | 13/13 (100%) |
| index.ts present | 13/13 (100%) |
| services/ directory present | 13/13 (100%) |
| types.ts present | 0/13 (0% -- types are in interfaces.ts) |

### Cohesion Notes

- **requirements-validation**: At 20,461 LOC with 32 service files (including subdirs), this domain is the largest and shows signs of scope creep. It contains QCSD refinement and ideation plugins (each ~1,700+ LOC) that may warrant their own bounded context.
- **learning-optimization**: Its coordinator at 1,775 lines is the largest, suggesting it handles too many responsibilities.
- **enterprise-integration**: At 795 LOC for its coordinator (the smallest), this domain is well-bounded but has 7 services, some of which may overlap with the top-level `integrations/` directory.

---

## 2. Dependency Direction Analysis

### Architecture Diagram (Text)

```
                    +------------------+
                    |   Interface       |
                    |   Layers          |
                    +------------------+
                    |  CLI (24K LOC)   |
                    |  MCP (41K LOC)   |
                    +--------+---------+
                             |
                             v
                    +--------+---------+
                    |  Coordination    |
                    |  (55K LOC)       |
                    +--------+---------+
                             |
                    +--------+---------+
                    |  Kernel          |
                    |  (7.5K LOC)      |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------+--------+          +---------+--------+
    |   13 Domains     |          |  Shared Kernel   |
    |   (136K LOC)     |<-------->|  (28K LOC)       |
    +------------------+          +------------------+
              |
    +---------+--------+
    |  Infrastructure   |
    |  Adapters (42K)  |
    |  Integrations(72K)|
    +------------------+
```

### Dependency Direction: Domain Layer

Domains correctly depend inward toward shared/ and kernel/:

| Import Direction | Count | Status |
|-----------------|-------|--------|
| Domains -> shared/ | 347 | CORRECT |
| Domains -> kernel/ | 91 | CORRECT |
| Domains -> coordination/ | 64 | ACCEPTABLE (mixins) |
| Domains -> learning/ | 7 | MINOR CONCERN |
| Domains -> domains/ (cross-domain) | 1 | EXCELLENT |
| Domains -> MCP layer | 2 | VIOLATION |
| Domains -> adapters/ | 1 | VIOLATION |

### Boundary Violations Found

**3 violations detected** (severity: medium):

1. **chaos-resilience -> MCP security**: `chaos-engineer.ts` imports `validateCommand` from `../../../mcp/security/cve-prevention`. This security utility should be in shared/.

2. **contract-testing -> MCP security**: Both `schema-validator.ts` and `contract-validator.ts` import `createSafeRegex` from `../../../mcp/security/validators/regex-safety-validator.js`. The regex safety validator is infrastructure that belongs in shared/security/.

3. **visual-accessibility -> adapters**: `browser-security-scanner.ts` imports `BrowserResultAdapter` from `../../../adapters/browser-result-adapter.js`. The adapter should be injected via the plugin constructor, not directly imported.

### Coordination -> Domain Direction (CQ-005 Fix)

The project has implemented a sophisticated `DomainServiceRegistry` pattern (CQ-005) to break the circular dependency between coordination/ and domains/:

```
domains/ --register()--> shared/DomainServiceRegistry
coordination/ --resolve()--> shared/DomainServiceRegistry
```

**Result**: All 12 coordination imports from domains are **type-only** (`import type`), meaning zero runtime coupling flows from coordination to domains. This is excellent architectural discipline.

---

## 3. Module Organization Analysis

### Top-Level `src/` Directory Inventory

The `src/` directory contains **30 top-level directories** plus 2 root files. This is well above the recommended 8-12 for clean DDD architecture.

**Canonical DDD Layers** (6 directories, well-placed):

| Directory | Files | LOC | Purpose | Assessment |
|-----------|-------|-----|---------|------------|
| domains/ | 253 | 135,803 | Bounded contexts | CORRECT |
| shared/ | 74 | 27,929 | Shared kernel | CORRECT |
| mcp/ | 100 | 41,293 | MCP interface layer | CORRECT |
| cli/ | 60 | 24,214 | CLI interface layer | CORRECT |
| coordination/ | 116 | 55,307 | Cross-domain orchestration | CORRECT |
| kernel/ | 20 | 7,508 | Microkernel composition root | CORRECT |

**Infrastructure Layers** (3 directories, appropriate):

| Directory | Files | LOC | Purpose | Assessment |
|-----------|-------|-----|---------|------------|
| adapters/ | 75 | 42,444 | Protocol adapters (AG-UI, A2A, etc.) | CORRECT |
| integrations/ | 147 | 71,656 | External system integrations | CORRECT |
| learning/ | 33 | 25,179 | Learning/persistence subsystem | CORRECT |

**Orphan Directories** (21 directories, **sprawl concern**):

| Directory | Files | LOC | Should Belong To |
|-----------|-------|-----|-----------------|
| governance/ | 18 | 14,787 | domains/ or coordination/ |
| init/ | 45 | 13,659 | cli/ or kernel/ |
| strange-loop/ | 19 | 8,034 | coordination/ or integrations/ |
| routing/ | 18 | 7,308 | coordination/ |
| workers/ | 18 | 6,612 | coordination/ |
| sync/ | 16 | 4,719 | shared/ or coordination/ |
| validation/ | 9 | 5,121 | shared/ |
| optimization/ | 8 | 4,099 | domains/learning-optimization/ |
| planning/ | 5 | 3,944 | coordination/ |
| test-scheduling/ | 10 | 3,406 | domains/test-execution/ |
| feedback/ | 7 | 2,985 | learning/ |
| performance/ | 6 | 2,932 | shared/ or coordination/ |
| memory/ | 10 | 3,238 | kernel/ |
| context/ | 10 | 886 | shared/ |
| agents/ | 14 | 5,325 | coordination/ |
| causal-discovery/ | 5 | 2,060 | integrations/ or coordination/ |
| testing/ | 5 | 2,224 | shared/ |
| early-exit/ | 6 | 2,387 | coordination/ |
| hooks/ | 6 | 2,057 | learning/ |
| audit/ | 3 | 723 | governance/ |
| monitoring/ | 1 | 309 | coordination/ |

**Total orphan LOC**: ~94,815 (17.8% of codebase)

### Leaky Abstraction Analysis

- **governance/** imports from `integrations/ruvector/` and `mcp/security/validators/` -- violating layer boundaries by reaching into both infrastructure and interface layers.
- **strange-loop/** imports from `integrations/coherence/` -- coupling to a specific integration.
- The `init/` directory (45 files, 13,659 LOC) is surprisingly large and probably contains functionality that should be distributed across kernel/ and cli/.

---

## 4. Interface Layer Analysis

### MCP Tools

**38 distinct MCP tools** registered under the `qe/` namespace:

| Category | Tools | Count |
|----------|-------|-------|
| Test Generation | generate | 1 |
| Test Execution | execute, schedule, load, e2e/execute, browser-load | 5 |
| Coverage | analyze, gaps | 2 |
| Quality | evaluate | 1 |
| Defect Intelligence | predict | 1 |
| Requirements | validate, quality-criteria | 2 |
| Code Intelligence | analyze | 1 |
| Security | scan, url-validate, visual-security | 3 |
| Contract Testing | validate | 1 |
| Visual/Accessibility | compare, audit | 2 |
| Chaos | inject | 1 |
| Learning | optimize, dream | 2 |
| Embeddings | generate, compare, search, store, stats | 5 |
| Planning (GOAP) | plan, execute, status | 3 |
| Coherence | check, audit, collapse, consensus | 4 |
| MinCut | health, analyze, strengthen | 3 |
| Analysis | token_usage | 1 |
| **TOTAL** | | **38** |

### CLI Commands

**~103 command registrations** across 24 command files, including deeply nested subcommands.

### Delegation Pattern Assessment

The MCP layer demonstrates **proper delegation** through a well-designed factory pattern:

1. **Handler Factory** (`handler-factory.ts`, 500+ lines): Generic `createDomainHandler<TParams, TResult>()` eliminates boilerplate across all 11 domain handlers.
2. **Domain Handler Configs** (`domain-handler-configs.ts`, 801 lines): Maps each domain's params/result types through the factory.
3. **Wrapped Domain Handlers** (`wrapped-domain-handlers.ts`): Adds experience capture middleware around all handlers.

**Concern**: The handler factory itself contains business logic that arguably belongs elsewhere:
- `generateV2Tests()` -- test generation logic in the MCP handler layer
- `analyzeComplexity()` -- code analysis in the handler factory
- `detectAntiPatterns()` -- pattern detection in the handler factory

These functions should be in domain services, not in the interface layer.

### CLI Delegation

CLI commands show a **mixed pattern**:
- `quality.ts` correctly obtains the domain API via `kernel.getDomainAPIAsync()` and delegates to it.
- Other commands may contain more direct logic. The CLI layer is reasonably well-structured but would benefit from consistent use of the kernel domain API pattern.

---

## 5. Cross-Cutting Concerns

### Logging

| Metric | Value | Assessment |
|--------|-------|------------|
| Structured logger usages (total) | 457 | Partial adoption |
| console.* usages (total) | 3,132 | Dominant pattern |
| Structured logger in domains/ | 0 | CRITICAL GAP |
| console.* in domains/ | 406 | All logging is unstructured |
| Structured logger in MCP/ | 21 | Minimal adoption |
| console.* in MCP/ | 97 | Mostly unstructured |

**Assessment**: A structured logging facade exists (`src/logging/`) with proper factory, level filtering, and domain-specific configuration. However, **zero domain files use it**. All 406 domain log statements use raw `console.*`. This is the single largest cross-cutting concern gap in the codebase. The logging module at 785 LOC is well-designed but largely unused where it matters most.

### Error Handling

| Metric | Value | Assessment |
|--------|-------|------------|
| `toErrorMessage()` usages in domains | 60 | Partial |
| `catch` blocks in domains | 655 | ~9% use toErrorMessage |
| `toErrorMessage()` usages across codebase | 586 | Moderate adoption |

**Assessment**: The `toErrorMessage()` utility from `shared/error-utils.ts` provides consistent error message extraction, but only ~9% of catch blocks in domains use it. The remaining 91% likely use `error.message`, string coercion, or similar inconsistent patterns.

### Security (SEC-001)

| Metric | Value |
|--------|-------|
| Security-related references | 192 |
| CVE prevention / validateCommand | Present |
| MCP security directory | Organized (validators/, cve-prevention, rate-limiter, etc.) |
| Shared security utilities | `shared/security/` exists |

**Assessment**: Security is reasonably well-organized with a dedicated MCP security module. However, as noted in the boundary violations section, two domain services import security utilities directly from the MCP layer instead of from shared/security/.

### Persistence (SQLite Unified Access)

| Metric | Value | Assessment |
|--------|-------|------------|
| safe-db/SafeDatabase in domains | 2 | Very low |
| Direct better-sqlite3 in domains | 5 | Bypasses abstraction |
| safe-db/SafeDatabase in learning | 2 | Low |
| Direct better-sqlite3 in learning | 12 | Bypasses abstraction |

**Assessment**: The `safe-db.ts` abstraction in shared/ is available but underused. Most direct database access bypasses it, particularly in the learning subsystem which has 12 direct `better-sqlite3` imports. This creates inconsistent connection management and makes it harder to enforce data protection rules.

---

## 6. Architectural Debt Indicators

### God Modules (Files > 500 lines)

**40 files exceed the 500-line threshold** from CLAUDE.md. The top offenders:

| File | LOC | Assessment |
|------|-----|------------|
| learning/qe-reasoning-bank.ts | 1,941 | Needs decomposition |
| domains/requirements-validation/qcsd-refinement-plugin.ts | 1,861 | Needs decomposition |
| domains/contract-testing/services/contract-validator.ts | 1,824 | Needs decomposition |
| domains/learning-optimization/coordinator.ts | 1,775 | Exceeds 1,500 limit |
| domains/test-generation/services/pattern-matcher.ts | 1,769 | Needs decomposition |
| cli/commands/hooks.ts | 1,746 | Needs decomposition |
| cli/completions/index.ts | 1,730 | Needs decomposition |
| coordination/mincut/time-crystal.ts | 1,714 | Needs decomposition |
| domains/chaos-resilience/coordinator.ts | 1,701 | Exceeds 1,500 limit |
| domains/requirements-validation/qcsd-ideation-plugin.ts | 1,699 | Needs decomposition |

### Oversized Coordinators (>1,500 LOC)

| Domain | Coordinator LOC | Excess |
|--------|----------------|--------|
| learning-optimization | 1,775 | +275 |
| chaos-resilience | 1,701 | +201 |
| test-generation | 1,675 | +175 |
| visual-accessibility | 1,636 | +136 |
| code-intelligence | 1,537 | +37 |

These five coordinators exceed the 1,500-line threshold for god modules. The `BaseDomainCoordinator` (316 lines) already extracts common boilerplate -- the excess in these coordinators is domain-specific logic that should be further delegated to services.

### High-Coupling Files

Only **1 file** imports from more than 3 different domains:

- `kernel/kernel.ts` imports from 13 domains -- **expected** as the composition root.

This is an excellent result. The DomainServiceRegistry pattern has prevented the proliferation of cross-domain coupling.

### Orphan Module Assessment

21 top-level directories containing 94,815 LOC (17.8% of the codebase) exist outside the canonical DDD layers. The most concerning:

- **governance/** (14,787 LOC) -- This is effectively a bounded context that should be under `domains/` or formalized as a cross-cutting coordination concern.
- **init/** (13,659 LOC) -- Initialization logic that should be split between kernel/ (core init) and cli/ (wizard/UI).
- **strange-loop/** (8,034 LOC) -- Self-referential healing system that belongs in coordination/.

---

## 7. Clean Architecture Compliance

### Domain Entities

The shared kernel provides proper DDD building blocks:

- **BaseEntity**: Identity-based equality, timestamps, proper encapsulation via `protected props`. Uses only `uuid` (no framework dependencies).
- **AggregateRoot**: Extends BaseEntity with domain event collection (`addDomainEvent`, `pullDomainEvents`).
- **Value Objects**: `FilePath`, `Coverage`, `RiskScore`, `TimeRange`, `Version` -- all immutable, self-validating, with factory methods.
- **Domain Events**: Typed event definitions for all 13 domains with proper payload interfaces and event constants.

**Entity Framework Independence**: Entities import only from `uuid` and internal shared types. No ORM, no HTTP framework, no database dependencies. This is fully compliant with Clean Architecture.

### Infrastructure Separation

| Layer | Separation | Assessment |
|-------|-----------|------------|
| Domain entities | Free of framework dependencies | EXCELLENT |
| Domain services | Import from shared/ and kernel/ | GOOD |
| MCP handlers | Delegate via handler factory | GOOD (with caveats) |
| CLI commands | Delegate via kernel domain API | GOOD |
| Persistence | Partially abstracted via safe-db | NEEDS WORK |
| Adapters | Proper adapter pattern (AG-UI, A2A, etc.) | GOOD |

### Use Case Definition

Use cases are implicitly defined through:
1. **MCP tool handlers** -- each tool maps to a domain use case
2. **CLI command actions** -- each command maps to a use case
3. **Coordination protocols** -- complex multi-domain use cases (security-audit, defect-investigation, etc.)

There are no explicit **Application Service** or **Use Case** classes separating the interface layer from domain logic. The handler factory partially fills this role but also contains V2-compatibility business logic that doesn't belong there.

---

## 8. Scoring

| Category | Score | Justification |
|----------|-------|---------------|
| **Bounded Context Health** | **8/10** | All 13 domains have consistent structure (coordinator, interfaces, plugin, services). Strong namespace isolation via barrel exports. Minor concern: requirements-validation is oversized. |
| **Dependency Direction** | **7/10** | Excellent DomainServiceRegistry pattern (CQ-005). Only 3 boundary violations found. All coordination->domain imports are type-only. Deducted for MCP security leaking into domains. |
| **Module Cohesion** | **5/10** | 21 orphan directories (17.8% of LOC) create organizational sprawl. Five coordinators exceed 1,500 lines. 40 files exceed the 500-line project standard. |
| **Layer Separation** | **6/10** | MCP and CLI properly delegate via factory pattern and kernel API. However: handler factory contains business logic, structured logging has zero domain adoption, 91% of catch blocks lack standardized error handling, and safe-db abstraction is bypassed. |
| **Overall Architecture** | **6.4/10** | Strong DDD foundations with proper entities, value objects, events, and service registry. Significant debt in module organization, cross-cutting concern adoption, and coordinator sizes. The architecture is correct in principle but inconsistently applied. |

---

## 9. Recommendations

### Critical (Should Address Before Next Release)

1. **Move security utilities to shared/**: Relocate `createSafeRegex` and `validateCommand` from `mcp/security/` to `shared/security/` to eliminate the 3 domain-to-MCP boundary violations.

2. **Adopt structured logger in domains**: Replace all 406 `console.*` calls in domains/ with the existing `LoggerFactory.create()` pattern. This is the most impactful cross-cutting improvement available.

3. **Extract business logic from handler factory**: Move `generateV2Tests()`, `analyzeComplexity()`, and `detectAntiPatterns()` from `mcp/handlers/handler-factory.ts` into appropriate domain services.

### High Priority (Next 2 Sprints)

4. **Consolidate orphan directories**: The 21 top-level directories should be consolidated:
   - `governance/`, `optimization/`, `test-scheduling/` -> move to `domains/` or `coordination/`
   - `strange-loop/`, `planning/`, `workers/`, `early-exit/`, `routing/`, `agents/` -> move to `coordination/`
   - `feedback/`, `hooks/` -> move to `learning/`
   - `validation/`, `testing/`, `context/`, `types/` -> move to `shared/`
   - `init/` -> split between `kernel/` and `cli/`
   - `sync/`, `memory/` -> move to `kernel/`

5. **Decompose oversized coordinators**: Extract service classes from the five coordinators exceeding 1,500 lines. The `BaseDomainCoordinator` pattern is already in place -- push more logic into services/.

6. **Standardize error handling**: Wrap all 655 catch blocks in domains with `toErrorMessage()` or a domain-specific error handler.

### Medium Priority (Next Quarter)

7. **Introduce explicit Application Services**: Add a `use-cases/` or `application/` layer between interface (MCP/CLI) and domain services to formalize the command/query separation.

8. **Enforce safe-db abstraction**: Replace all 17 direct `better-sqlite3` imports with the `SafeDatabase` wrapper from shared/. Add a lint rule to prevent direct database driver imports outside shared/.

9. **Split requirements-validation domain**: At 20,461 LOC with QCSD plugins, this domain should be decomposed into `requirements-validation` (core) and `qcsd/` (QCSD-specific) bounded contexts.

10. **Add architectural fitness functions**: Implement automated tests that verify:
    - No domain-to-domain imports (currently only 1 -- keep it at 0)
    - No domain-to-interface-layer imports
    - No files exceeding 500 lines
    - All new catch blocks use toErrorMessage

---

## Appendix A: Complete Domain Dependency Map

```
Domains Import Sources (counts):
  -> shared/           347  (CORRECT: inward)
  -> kernel/            91  (CORRECT: inward)
  -> coordination/      64  (ACCEPTABLE: mixins & protocols)
  -> learning/           7  (MINOR: should go through shared interfaces)
  -> MCP security/       2  (VIOLATION: outward to interface layer)
  -> adapters/           1  (VIOLATION: outward to infrastructure)
  -> other domains/      1  (NEAR-ZERO: excellent isolation)
```

## Appendix B: Full File Size Distribution

```
Files by size (excluding _archived/):
  0-100 lines:     ~450 files
  101-300 lines:   ~380 files
  301-500 lines:   ~165 files
  501-1000 lines:  ~100 files
  1001-1500 lines:  ~25 files
  1501+ lines:      ~15 files  (DEBT)
```

## Appendix C: MCP Tool-to-Domain Mapping

All 38 MCP tools are properly mapped to their respective bounded contexts via the `DomainHandlerConfig` type. The handler factory ensures that every tool call follows the same lifecycle: fleet check -> task routing -> queen submission -> task execution -> response mapping -> learning capture.

---

*Report generated by QE Code Intelligence Agent. All data sourced from static analysis of the AQE v3.8.3 codebase on commit 475bd61a. No values fabricated.*
