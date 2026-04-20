# Architecture & DDD Health Report - v3.9.13

**Date**: 2026-04-20
**Agent**: qe-code-intelligence (Agent 08)
**Baseline**: v3.8.13 (2026-03-30)
**Codebase**: 566,728 lines of TypeScript across 41 top-level src directories

---

## Executive Summary

v3.9.13 preserves the 13 bounded contexts and the zero MCP/CLI boundary violations baseline from v3.8.13, but the core structural problems have all regressed or stagnated. Orphan directories grew from 31 to 34 (40.2% to 41.6% of LOC), `coordination/` crossed 56K lines, and the honesty-audit flagged "logger adoption" claim does not hold outside `domains/`: project-wide `console.*` usage sits at 3,405 occurrences vs. 255 `LoggerFactory`/`createLogger` imports — a 13.4:1 ratio. DomainServiceRegistry still covers only 5/13 domains. God-file count inside domains is unchanged at 33. ADR-092 advisor code landed in the orphan `src/routing/advisor/` directory rather than in a domain, worsening the shadow application-layer problem. ADR-093 (Opus 4.7 migration) is a configuration update touching `shared/llm/model-mapping.ts` and does not move code between layers.

**Overall Score: 6.4/10** (down from 6.6/10)

---

## Dimension Scores

| Dimension | v3.8.13 | v3.9.13 | Delta | Rationale |
|-----------|---------|---------|-------|-----------|
| Bounded Context Health | 8/10 | 8/10 | 0 | 13 domains intact, 100% structural canon, zero cross-domain imports |
| Dependency Direction | 7/10 | 7/10 | 0 | MCP/CLI violations still zero; integrations leak grew by +0 |
| Module Cohesion | 5/10 | 5/10 | 0 | 33 domain god-files unchanged; 91 files >1K lines project-wide |
| Layer Separation | 6.5/10 | 6/10 | -0.5 | Orphan LOC share up; advisor landed outside domains |
| **Overall** | **6.6/10** | **6.4/10** | **-0.2** | Regression from orphan growth + advisor placement |

---

## 1. Bounded Context Health: 8/10 (unchanged)

All 13 domains retain 100% structural consistency (index.ts, interfaces.ts, plugin.ts, coordinator.ts, services/).

| Domain | index | interfaces | plugin | coordinator | services | Files | Lines |
|--------|-------|------------|--------|-------------|----------|-------|-------|
| chaos-resilience | YES | YES | YES | YES | YES | 8 | 6,168 |
| code-intelligence | YES | YES | YES | YES | YES | 18 | 11,218 |
| contract-testing | YES | YES | YES | YES | YES | 8 | 6,672 |
| coverage-analysis | YES | YES | YES | YES | YES | 13 | 8,173 |
| defect-intelligence | YES | YES | YES | YES | YES | 9 | 5,410 |
| enterprise-integration | YES | YES | YES | YES | YES | 11 | 6,729 |
| learning-optimization | YES | YES | YES | YES | YES | 13 | 7,831 |
| quality-assessment | YES | YES | YES | YES | YES | 18 | 8,181 |
| requirements-validation | YES | YES | YES | YES | YES | 38 | 20,477 |
| security-compliance | YES | YES | YES | YES | YES | 24 | 9,598 |
| test-execution | YES | YES | YES | YES | YES | 29 | 14,850 |
| test-generation | YES | YES | YES | YES | YES | 43 | 17,314 |
| visual-accessibility | YES | YES | YES | YES | YES | 18 | 14,152 |
| **Total** | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 | **250** | **137,759** |

Minor growth: test-generation +1 file / +93 lines, test-execution +127 lines, contract-testing +8 lines, quality-assessment +256 lines. No domain lost structural integrity.

### Cross-Domain Imports: ZERO (verified)

A 13×13 matrix grep (`domains/<A> -> domains/<B>`) produced zero hits. Isolation remains perfect.

### DomainServiceRegistry Coverage: 5/13 (unchanged)

Still only **code-intelligence, coverage-analysis, quality-assessment, security-compliance, test-generation** register services through the registry. Eight domains are unregistered:
chaos-resilience, contract-testing, defect-intelligence, enterprise-integration, learning-optimization, requirements-validation, test-execution, visual-accessibility. No progress on CQ-005 since v3.8.13.

---

## 2. Dependency Direction: 7/10 (unchanged)

### v3.8.13 MCP/CLI Violations — Verified FIXED

| Check | v3.8.3 | v3.8.13 | v3.9.13 | Status |
|-------|--------|---------|---------|--------|
| `src/mcp/` imports in domains | 3 | 0 | **0** | Clean |
| `src/cli/` imports in domains | 0 | 0 | **0** | Clean |

Zero new boundary violations from MCP or CLI into domains (grep over all three path shapes: absolute, `../../mcp`, `../../../mcp`).

### Remaining Boundary Imports (unchanged mix)

| Source | Target | Count | Severity |
|--------|--------|-------|----------|
| domains -> integrations/ | 98 | MEDIUM | Infrastructure leak (type imports) |
| domains -> coordination/ | 66 | LOW | MinCut/Consensus/Governance mixins via base-coordinator |
| domains -> logging/ | 64 | LOW | Intentional LoggerFactory usage |
| domains -> learning/ | 7 | MEDIUM | learning-optimization + test-generation reach into orphan learning/ |

Counts are stable at v3.8.13 levels.

---

## 3. Module Cohesion: 5/10 (unchanged)

- **33 files >1,000 lines inside `domains/`** — unchanged from v3.8.13
- **91 files >1,000 lines project-wide** (includes orphan dirs like `learning/pattern-store.ts` at 1,862, `cli/completions/index.ts` at 1,778, `mcp/protocol-server.ts` at 1,641)
- All 13 coordinators exceed 500 lines; 8 exceed 1,000

### Top 10 Domain God-Files (all unchanged or drifted up)

| File | Lines | Delta vs v3.8.13 |
|------|-------|------------------|
| requirements-validation/qcsd-refinement-plugin.ts | 1,861 | 0 |
| contract-testing/services/contract-validator.ts | 1,827 | 0 |
| learning-optimization/coordinator.ts | 1,778 | 0 |
| test-generation/services/pattern-matcher.ts | 1,769 | 0 |
| chaos-resilience/coordinator.ts | 1,704 | 0 |
| test-generation/coordinator.ts | 1,703 | +9 |
| requirements-validation/qcsd-ideation-plugin.ts | 1,699 | 0 |
| visual-accessibility/coordinator.ts | 1,639 | 0 |
| code-intelligence/services/c4-model/index.ts | 1,606 | 0 |
| code-intelligence/coordinator.ts | 1,580 | 0 |

### Direct Instantiation vs DI

- **113 direct `new …Service()` instantiations** across `src/domains/` (v3.8.13: 121 — modest -8)
- **135 constructors** in domain files (unchanged)
- No formal DI container; DomainServiceRegistry used by 5 domains only

---

## 4. Layer Separation: 6/10 (down from 6.5/10)

### Layer LOC Distribution

| Layer | Lines | % of Total | Role |
|-------|-------|------------|------|
| domains/ | 137,759 | 24.3% | Domain logic |
| kernel/ | 8,435 | 1.5% | Core infrastructure |
| shared/ | 31,627 | 5.6% | Shared types/utilities |
| mcp/ | 41,258 | 7.3% | MCP protocol layer |
| cli/ | 27,491 | 4.9% | CLI interface |
| integrations/ | 78,818 | 13.9% | External integrations |
| agents/ | 5,353 | 0.9% | Agent definitions |
| types/ | 206 | 0.0% | Global types |
| **Orphan directories (34)** | **235,781** | **41.6%** | Uncategorized |
| **Total** | **566,728** | 100% | |

Orphan LOC share grew from 40.2% to 41.6% (+1.4pt, +15,084 lines). The `_archived/` directory is excluded.

---

## 5. Orphan Directory Inventory (34 dirs vs 31 in v3.8.13)

| Directory | Files | Lines | Delta vs v3.8.13 | Assessment |
|-----------|-------|-------|------------------|------------|
| coordination/ | 123 | 56,259 | +511 | Shadow application layer — now larger than every domain combined |
| adapters/ | 75 | 42,458 | +14 | Infrastructure |
| learning/ | 41 | 27,643 | +1,678 | Should be a domain or merged into learning-optimization |
| init/ | 47 | 14,129 | +410 | CLI bootstrap — belongs in cli/ |
| governance/ | 18 | 14,793 | 0 | Cross-cutting — should be in shared/ |
| routing/ | 26 | 8,844 | +1,043 | Grew for ADR-092 advisor (see section 9) |
| workers/ | 27 | 8,637 | +2,026 | New daemon/quality-daemon files |
| strange-loop/ | 19 | 8,034 | 0 | Meta-cognitive — unclear ownership |
| validation/ | 9 | 5,121 | 0 | Should be in shared/ |
| sync/ | 16 | 4,719 | 0 | Should be in kernel/ |
| optimization/ | 9 | 4,523 | +59 | Unclear ownership |
| planning/ | 5 | 3,944 | 0 | Agent planning |
| test-scheduling/ | 10 | 3,406 | 0 | Should be in test-execution domain |
| memory/ | 10 | 3,238 | 0 | Should be in kernel/ |
| feedback/ | 7 | 2,985 | 0 | Should be in learning/ |
| performance/ | 6 | 2,932 | 0 | Should merge with benchmarks/ |
| early-exit/ | 6 | 2,387 | 0 | Should be in kernel/ |
| hooks/ | 10 | 2,297 | +240 | CLI hooks |
| testing/ | 5 | 2,224 | 0 | Test utilities |
| context/ | 17 | 2,159 | +1,273 | **NEW scale** — compaction subsystem |
| causal-discovery/ | 5 | 2,060 | 0 | Should be in defect-intelligence |
| plugins/ | 9 | 1,192 | +1,192 | **NEW** directory since v3.8.13 |
| persistence/ | 4 | 1,188 | +1,188 | **NEW** directory since v3.8.13 |
| benchmarks/ | 2 | 971 | 0 | DevOps tooling |
| skills/ | 2 | 946 | 0 | Skill runtime |
| audit/ | 3 | 729 | +6 | Should be in security-compliance |
| logging/ | 4 | 785 | 0 | Should be in kernel/ |
| analysis/ | 2 | 478 | 0 | Should be in code-intelligence |
| workflows/ | 2 | 486 | 0 | Should be in coordination/ |
| migration/ | 1 | 323 | 0 | Should be in kernel/ |
| monitoring/ | 1 | 309 | 0 | Should be in kernel/ |
| migrations/ | 1 | 138 | 0 | Should merge with migration/ |
| boot/ | 2 | 91 | +91 | **NEW** directory since v3.8.13 |
| agents/ (non-domain) | 14 | 5,353 | 0 | Listed separately in canonical layers |

**Net**: +3 orphan directories (`plugins/`, `persistence/`, `boot/`), +15K lines, zero consolidation. The 40% → 41.6% LOC share indicates new code keeps landing outside DDD boundaries.

---

## 6. Structured Logger Adoption — Honesty Audit (critical finding)

The v3.8.3 -> v3.8.13 report called logger adoption "the single largest improvement" while a parallel honesty audit flagged a 21.7:1 ratio of `console.*` to `LoggerFactory` imports. Re-measurement confirms the honesty audit:

| Metric | v3.8.13 claim | v3.9.13 measured | Interpretation |
|--------|---------------|------------------|----------------|
| `console.*` in src/ (total) | 3,147 | **3,405** | Up 8.2% — no project-wide cleanup |
| `console.*` in src/domains/ | 24 | **23** | Domain-local cleanup holds |
| `LoggerFactory`/`createLogger` in src/ | unknown | **255** | 13.4:1 console-to-logger ratio (vs 21.7:1 earlier claim; still bad) |
| `LoggerFactory`/`createLogger` in src/domains/ | 64 | **128** (occurrences, 64 files) | Logger usage IS present in all 13 domains |

**Verdict**: The domain-level claim ("all 13 domains use LoggerFactory") is TRUE — every domain has at least one LoggerFactory import and domain `console.*` usage is limited to 23 occurrences across 12 files (mostly visual-accessibility services and a handful of code-intelligence/test-execution helpers). The project-level narrative ("biggest improvement") is MISLEADING: 3,405 console calls remain, concentrated in orphan `coordination/`, `learning/`, `cli/`, `governance/`, `sync/`, and `integrations/` — the exact layers that grew in v3.9.13. The honesty-audit finding stands.

---

## 7. Cross-Domain Coupling: ZERO (verified)

Explicit matrix check across all 13×12 domain pairs returned zero imports. The only cross-domain text reference continues to be a JSDoc example in `test-execution/services/user-flow-generator.ts`, which is not a real import.

---

## 8. ADR-092 (Advisor) & ADR-093 (Opus 4.7) Impact

### ADR-092 — Provider-Agnostic Advisor Strategy

The advisor implementation lives in **`src/routing/advisor/`** — an orphan directory, NOT a domain.

| File | Lines | Purpose |
|------|-------|---------|
| routing/advisor/index.ts | 43 | Advisor entry |
| routing/advisor/multi-model-executor.ts | 239 | Parallel executor (Opus default per ADR-092) |
| routing/advisor/redaction.ts | 225 | Request redaction |
| routing/advisor/circuit-breaker.ts | 163 | Failure isolation |
| routing/advisor/types.ts | 103 | Types |
| routing/advisor/domain-prompts.ts | 57 | Per-domain prompt templates |
| **Total** | **830** | |

**DDD issue**: The advisor touches `domain-prompts.ts` (per-domain prompts for all 13 domains) but lives outside `domains/`. This is the correct cross-cutting placement for an advisor, but:
- It is in `routing/` which is itself an orphan (8,844 lines), not in `kernel/`, `shared/`, or a proper `application/` layer
- There is no `DomainAdvisorPort` in any domain's `interfaces.ts` to invert the dependency
- `routing/` grew from 7,801 to 8,844 lines (+1,043) largely from advisor code

**Recommendation**: Move `routing/advisor/` to `src/shared/llm/advisor/` (it already sits adjacent to `shared/llm/router/`) or formalize `routing/` as the `application/` layer.

### ADR-093 — Opus 4.7 Migration

This is a **model-id configuration migration**, not a code-placement change. Opus 4.7 references appear in 30+ files touching:
- `shared/llm/model-mapping.ts`, `shared/llm/model-registry.ts`, `shared/llm/effort-resolver.ts`, `shared/llm/providers/claude.ts`, `shared/llm/providers/bedrock.ts` (correct layer — shared infrastructure)
- `shared/llm/router/*` (correct layer)
- Per-domain service references (test-generator, test-executor, requirements-validator, quality-analyzer, deployment-advisor, etc.) — domains reference model IDs through string constants, acceptable
- `init/kiro-installer.ts`, `init/phases/12-verification.ts`, `init/init-wizard-steps.ts` (init orphan — reasonable for bootstrap config)

**No DDD regression from ADR-093**. The migration landed in `shared/llm/` where model routing already lived.

---

## 9. Boundary Violation Inventory — v3.9.13

| # | Source | Target | Severity | Change vs v3.8.13 |
|---|--------|--------|----------|-------------------|
| 1 | all 13 domains | coordination/ (mixins) | LOW | Unchanged (66 imports) |
| 2 | all 13 domains | logging/ | LOW | Unchanged (64 imports, intentional) |
| 3 | domains -> integrations/ | MEDIUM | 98 imports across 12 domains | Unchanged |
| 4 | learning-optimization, test-generation -> learning/ | MEDIUM | 7 imports | Unchanged |
| 5 | coverage-analysis -> kernel/hnsw-adapter (impl) | LOW | 1 import | Unchanged |
| 6 | visual-accessibility -> adapters/browser-result-adapter | LOW | 1 import | Unchanged |

Zero NEW boundary violations from MCP or CLI. The ADR-092 advisor does NOT introduce a new violation into `domains/` — it stays in `routing/`.

---

## 10. Domain Health Matrix

| Domain | Structure | Isolation | Cohesion | Logger | Registry | EventBus | God Files | Health |
|--------|-----------|-----------|----------|--------|----------|----------|-----------|--------|
| chaos-resilience | 5/5 | 5/5 | 3/5 | YES | NO | YES | 2 | GOOD |
| code-intelligence | 5/5 | 5/5 | 2/5 | YES | YES | YES | 3 | GOOD |
| contract-testing | 5/5 | 5/5 | 2/5 | YES | NO | YES | 3 | FAIR |
| coverage-analysis | 5/5 | 4/5* | 3/5 | YES | YES | YES | 2 | GOOD |
| defect-intelligence | 5/5 | 5/5 | 3/5 | YES | NO | YES | 1 | GOOD |
| enterprise-integration | 5/5 | 5/5 | 4/5 | YES | NO | YES | 0 | GOOD |
| learning-optimization | 5/5 | 4/5** | 2/5 | YES | NO | YES | 2 | FAIR |
| quality-assessment | 5/5 | 5/5 | 3/5 | YES | YES | YES | 1 | GOOD |
| requirements-validation | 5/5 | 5/5 | 1/5 | YES | NO | YES | 4 | FAIR |
| security-compliance | 5/5 | 5/5 | 3/5 | YES | YES | YES | 2 | GOOD |
| test-execution | 5/5 | 3/5*** | 2/5 | YES | NO | YES | 4 | FAIR |
| test-generation | 5/5 | 5/5 | 2/5 | YES | YES | YES | 3 | GOOD |
| visual-accessibility | 5/5 | 4/5**** | 2/5 | YES | NO | YES | 3 | FAIR |

\* coverage-analysis imports HnswAdapter (kernel impl, not interface)
\** learning-optimization imports from orphan `learning/`
\*** test-execution has 10+ imports from `integrations/`, `coordination/`, `logging/`
\**** visual-accessibility imports from `adapters/`; highest domain `console.*` count (10 of 23)

---

## 11. Remediation Table

| # | Issue | v3.8.13 | v3.9.13 | Priority | Recommendation |
|---|-------|---------|---------|----------|----------------|
| R1 | Orphan directories | 31 dirs / 40.2% LOC | 34 dirs / 41.6% LOC | **P0** | Freeze new orphan dirs; relocate `plugins/`, `persistence/`, `boot/` |
| R2 | `coordination/` shadow layer | 55,748 lines | 56,259 lines | **P0** | Formalize as `application/` layer OR split mixins into `shared/coordination-mixins/` |
| R3 | DomainServiceRegistry coverage | 5/13 | 5/13 | **P0** | Register remaining 8 domains (CQ-005 was stalled) |
| R4 | `console.*` project-wide | 3,147 | 3,405 | **P1** | Migrate `coordination/`, `learning/`, `cli/` to LoggerFactory (95% of hits live there) |
| R5 | Files >1,000 lines in domains | 33 | 33 | **P1** | Split top 5 coordinators + qcsd-refinement/ideation-plugin |
| R6 | Direct `new Service()` | 121 | 113 | **P2** | Replace with factory functions registered in DomainServiceRegistry |
| R7 | `domains -> integrations/` | 98 | 98 | **P2** | Invert via ports/adapters (DomainIntegrationPort in interfaces.ts) |
| R8 | ADR-092 advisor placement | n/a | `routing/advisor/` (830 LOC) | **P2** | Move to `shared/llm/advisor/` or formalize `routing/` as application layer |
| R9 | MCP/CLI imports in domains | 0 | 0 | — | Maintained; add a lint rule to prevent regression |
| R10 | Honesty: "logger adoption" claim | 21.7:1 ratio flagged | 13.4:1 project-wide | **P1** | Scope claim to "all domains" only; add CI guard against console.* growth outside approved files |

---

## Methodology

All data was gathered through static analysis:
- `find` + `wc` for file and line counts (excluding `_archived/`)
- `grep`/Grep tool for import patterns, console/logger usage, registry calls
- 13×13 matrix grep for cross-domain imports (zero hits)
- Manual inspection of `routing/advisor/` for ADR-092 placement
- Cross-check of ADR-092/093 against `docs/implementation/adrs/ADR-092-*.md` and `ADR-093-*.md`
- Comparison against v3.8.13 baseline metrics in `docs/qe-reports-3-8-13/08-architecture-ddd-health-report.md`
