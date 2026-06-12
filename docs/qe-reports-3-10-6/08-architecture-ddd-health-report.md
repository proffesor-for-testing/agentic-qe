# Architecture & DDD Health Report - v3.10.6

**Date**: 2026-06-12
**Agent**: qe-code-intelligence (Agent 08)
**Baseline**: v3.9.13 (`docs/qe-reports-3-9-13/08-architecture-ddd-health-report.md`)
**Codebase**: 573,720 lines of TypeScript (src, excl. tests & `_archived/`) across 45 top-level src directories
**Evidence**: all counts from `grep`/`find`/`wc` run against the live tree on 2026-06-12 (EXECUTED).

---

## Executive Summary

v3.10.6 holds the line on the two things that were already healthy and lets the two things that were already unhealthy keep drifting. The 13 bounded contexts remain 100% structurally canonical and the **13×13 cross-domain import matrix is still ZERO** (EXECUTED). The MCP/CLI → domains boundary is clean in the dangerous direction (0 domain→mcp, 0 domain→cli imports). But the structural debt is unchanged-to-worse: orphan LOC share is **41.0%** (essentially flat vs 41.6%, but the directory count grew from 34 to 37 with four new top-level dirs — `arena/`, `bridge/`, `contracts/`, `coverage/`), `coordination/` crossed **56,323 lines** and is still a shadow application layer (queen-coordinator, workflow-orchestrator, task-executor, cross-domain-router all live there), DomainServiceRegistry coverage is **stuck at 5/13**, and direct `new …Service()` instantiation is **unchanged at 113**.

The headline new finding: **the entire ADR-104/105..110 pattern-space + arena + verdict-contracts subsystem landed in orphan directories** (`learning/`, `arena/`, `bridge/`, `contracts/`, `validation/`), not in `learning-optimization` or any domain. It is reasonably *internally* bounded (no domain imports it; it does not import domains), so it is not a coupling regression — but it is a fresh +~6.7K LOC of un-homed architecture that deepens the shadow-layer problem.

The honesty audit on logging still stands: **3,401 `console.*` vs 259 `LoggerFactory`/`createLogger`** project-wide (13.1:1), with only 23 `console.*` inside `domains/`.

**Overall Score: 6.3/10** (down 0.1 from 6.4/10)

---

## Dimension Scores

| Dimension | v3.9.13 | v3.10.6 | Delta | Rationale |
|-----------|---------|---------|-------|-----------|
| Bounded Context Health | 8.0 | 8.0 | 0 | 13 domains 100% canonical; cross-domain imports ZERO (re-verified) |
| Dependency Direction | 7.0 | 7.0 | 0 | MCP/CLI→domains reverse imports still 0; boundary import mix flat (98 integrations, 56 coordination, 64 logging) |
| Module Cohesion | 5.0 | 5.0 | 0 | 33 domain god-files (distribution shifted); 94 project-wide (+3) |
| Layer Separation | 6.0 | 5.5 | -0.5 | +4 new orphan dirs; ADR-104/105 subsystem lands outside domains; coordination/ +64 LOC |
| **Overall** | **6.4** | **6.3** | **-0.1** | Orphan dir proliferation + un-homed pattern-space subsystem |

---

## 1. Bounded Context Health: 8/10 (unchanged)

All 13 domains retain 100% structural canon (index.ts, interfaces.ts, plugin.ts, coordinator.ts, services/) — verified by per-dir file existence check, **all 13 = COMPLETE**.

| Domain | Files | LOC | Δ LOC vs v3.9.13 |
|--------|------:|----:|-----------------:|
| chaos-resilience | 8 | 6,177 | +9 |
| code-intelligence | 18 | 11,453 | +235 |
| contract-testing | 8 | 6,678 | +6 |
| coverage-analysis | 13 | 8,168 | -5 |
| defect-intelligence | 9 | 5,417 | +7 |
| enterprise-integration | 11 | 6,726 | -3 |
| learning-optimization | 13 | 7,929 | +98 |
| quality-assessment | 18 | 8,180 | -1 |
| requirements-validation | 38 | 20,476 | -1 |
| security-compliance | 24 | 9,602 | +4 |
| test-execution | 29 | 14,842 | -8 |
| test-generation | 43 | 17,363 | +49 |
| visual-accessibility | 18 | 14,154 | +2 |
| **Total** | **250** | **138,151** | **+392** |

Domain LOC grew only +392 (+0.3%) while project LOC grew +2.1% — confirming new code is landing *outside* domains.

### Cross-Domain Imports: ZERO (re-verified, EXECUTED)

Full 13×13 matrix grep (`grep -rEl "from ['\"].*domains/<B>[/'\"]" src/domains/<A>/` for all 156 ordered pairs) returned **0 violations**. Domain isolation remains perfect.

### MCP/CLI → domains boundary

| Check | v3.9.13 | v3.10.6 | Status |
|-------|--------:|--------:|--------|
| domains → mcp imports (reverse, the dangerous one) | 0 | **0** | Clean |
| domains → cli imports | 0 | **0** | Clean |
| mcp → domains imports (allowed direction) | — | 26 | Normal (MCP is a delivery adapter) |
| cli → domains imports (allowed direction) | — | 4 | Normal |

No regression. Recommendation from prior report (add a lint rule to lock this in) remains open.

### DomainServiceRegistry Coverage: 5/13 (UNCHANGED)

Still only `code-intelligence`, `coverage-analysis`, `quality-assessment`, `security-compliance`, `test-generation` use the registry (grep for `DomainServiceRegistry|registerService|serviceRegistry.register`). Eight domains unregistered. **CQ-005 has now been stalled across three consecutive releases.**

---

## 2. Dependency Direction: 7/10 (unchanged)

Boundary import statement counts (EXECUTED, statement-level not file-level — this reconciles the prior report's "66 coordination" which was a file/methodology artifact):

| Source → Target | v3.9.13 | v3.10.6 | Severity |
|-----------------|--------:|--------:|----------|
| domains → integrations/ | 98 | **98** | MEDIUM (infra leak, mostly type imports) |
| domains → coordination/ | 66* | **56** | LOW (base-coordinator mixins) |
| domains → logging/ | 64 | **64** | LOW (intentional LoggerFactory) |
| domains → learning/ (orphan, file count) | 7 files | **4 files** | MEDIUM |

\* Prior "66" was a file-level vs statement-level methodology difference; my statement-level count is 56. Either way: flat-to-slightly-down. No inversion via ports yet (no `DomainIntegrationPort` in any `interfaces.ts`).

The four new orphan dirs (`arena/`, `bridge/`, `contracts/`, `coverage/`) are **not imported by any domain** (grep returned empty), so they introduce no new inbound domain coupling.

---

## 3. Module Cohesion: 5/10 (unchanged)

- **33 files >1,000 lines inside `domains/`** — same total as v3.9.13, but **distribution shifted**: requirements-validation 4→6, test-execution 4→5.
- **94 files >1,000 lines project-wide** (v3.9.13: 91, **+3**).
- Direct instantiation: **113 `new …Service()` across domains** — **unchanged** from v3.9.13.

### God files per domain (>1,000 lines)

| Domain | God files |
|--------|----------:|
| requirements-validation | 6 |
| test-execution | 5 |
| visual-accessibility | 3 |
| test-generation | 3 |
| contract-testing | 3 |
| code-intelligence | 3 |
| security-compliance | 2 |
| learning-optimization | 2 |
| coverage-analysis | 2 |
| chaos-resilience | 2 |
| quality-assessment | 1 |
| defect-intelligence | 1 |
| **Total** | **33** |

### Top project-wide god files (note: 3 of top-5 are orphan/non-domain)

| File | Lines |
|------|------:|
| `src/learning/pattern-store.ts` | 1,962 (orphan) |
| `src/cli/completions/index.ts` | 1,876 |
| `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 |
| `src/domains/contract-testing/services/contract-validator.ts` | 1,827 |
| `src/domains/learning-optimization/coordinator.ts` | 1,784 |
| `src/mcp/protocol-server.ts` | 1,752 |
| `src/cli/commands/learning.ts` | 1,713 |

`src/learning/pattern-store.ts` (the ADR-105 pattern-space store) is now the **single largest file in the entire codebase at 1,962 lines** — and it sits in an orphan directory.

---

## 4. Layer Separation: 5.5/10 (down from 6.0)

### Orphan LOC share: 41.0% / 37 dirs (was 41.6% / 34 dirs)

Canonical layers = `domains, kernel, shared, mcp, cli, integrations, agents, types`.

| Layer | LOC | % of 573,720 |
|-------|----:|-------------:|
| domains/ | 138,151 | 24.1% |
| integrations/ | 80,147 | 14.0% |
| mcp/ | 42,034 | 7.3% |
| shared/ | 32,932 | 5.7% |
| cli/ | 30,826 | 5.4% |
| kernel/ | 8,910 | 1.6% |
| agents/ | 5,353 | 0.9% |
| types/ | 206 | 0.0% |
| **Canonical total** | **338,559** | **59.0%** |
| **Orphan (37 dirs)** | **235,161** | **41.0%** |

LOC share is essentially flat (-0.6pt), but **directory count rose +3 net** (34→37). Four NEW top-level dirs appeared since v3.9.13:

| New dir | Files | LOC | Origin |
|---------|------:|----:|--------|
| `arena/` | 4 | 498 | ADR-104 qe-arena (commit 07326b98) |
| `bridge/` | 1 | 356 | captured-experience bridge (pattern-space wiring) |
| `contracts/` | 1 | 235 | ADR-103 structured verdict handoffs (commit dc6fce5e) |
| `coverage/` | 0 | 0 | **EMPTY** — stub dir, no `.ts` files |

`coverage/` being an empty top-level dir is a structural smell (a stray scaffold). The other three are real subsystems that landed un-homed.

### coordination/ shadow application layer: 56,323 lines (was 56,259, +64)

Still larger than every individual domain. File inventory confirms it is a shadow `application/` layer: `queen-coordinator.ts`, `queen-lifecycle.ts`, `queen-task-management.ts`, `queen-work-stealing.ts`, `workflow-orchestrator.ts`, `task-executor.ts`, `cross-domain-router.ts`, `protocol-executor.ts`. This is orchestration logic that DDD would place in a named `application/` layer, not an orphan `coordination/` dir.

---

## 5. Structured Logger Adoption — Honesty Audit (UNCHANGED, finding stands)

| Metric | v3.9.13 | v3.10.6 | Interpretation |
|--------|--------:|--------:|----------------|
| `console.*` in src/ (excl tests/_archived) | 3,405 | **3,401** | Flat — no project-wide cleanup |
| `console.*` inside src/domains/ | 23 | **23** | Domain-local discipline holds |
| `LoggerFactory`/`createLogger` in src/ | 255 | **259** | 13.1:1 console-to-logger ratio |

(My 3,401 differs slightly from the shared-snapshot 3,413 — the snapshot likely counts a broader regex incl. `console.group/table/count`; my regex was `console.(log|error|warn|info|debug|trace)`. Reconciled: same order of magnitude, same conclusion.)

**Verdict (unchanged):** The "all 13 domains use LoggerFactory" claim is TRUE (23 stray `console.*` total in domains). The project-level "logger adoption is a major win" narrative remains MISLEADING — 3,401 console calls live in the orphan layers (`coordination/`, `learning/`, `cli/`, `governance/`, `integrations/`) that keep growing. The honesty-audit finding from v3.9.13 is **not resolved**.

---

## 6. ADR-104/105..110 Pattern-Space — Architectural Fit (NEW assessment)

The new pattern-space / cross-family interaction / safety-eval / learning-wiring work (PR #523, ADR-104..110) is spread across these locations:

| Location | Role | Layer status |
|----------|------|--------------|
| `src/learning/pattern-store.ts` (1,962 LOC), `pattern-null-store.ts`, `experience-capture.ts`, `pattern-lifecycle.ts`, `pattern-promotion.ts` | Pattern space storage/lifecycle | **ORPHAN** (`learning/`, 30,578 LOC) |
| `src/arena/` (arena.ts, mutator.ts, runner.ts, rng.ts — 498 LOC) | ADR-104 competitive test-strategy tournaments | **ORPHAN** (new dir) |
| `src/contracts/verdicts.ts` (235 LOC) | ADR-103 structured verdict handoffs (RiskDecision et al) | **ORPHAN** (new dir) |
| `src/bridge/captured-experience-bridge.ts` (356 LOC) | Pattern-space ↔ experience wiring | **ORPHAN** (new dir) |
| `src/validation/pipeline.ts`, `steps/requirements.ts`, `parallel-eval-runner.ts` | ADR-105/106 eval pipeline | **ORPHAN** (`validation/`, 5,618 LOC) |
| `src/migrations/20260611_add_pattern_nulls_table.ts` | Pattern-null schema | migrations (orphan) |
| `src/kernel/unified-memory-schemas.ts`, `src/mcp/handlers/validation-pipeline-handler.ts` | Schema + MCP delivery | canonical (kernel/mcp) — OK |

**Assessment — is it correctly bounded?**
- **Internal isolation: GOOD.** None of these are imported by any domain, and none import a domain. The subsystem does not create new cross-domain coupling or new domain→orphan inbound edges (the existing 4 `learning-optimization`/`test-generation` → `learning/` imports are unchanged, not increased).
- **Architectural fit: POOR.** This is a cohesive, ~6.7K-LOC learning/evaluation subsystem that was assembled out of FOUR separate orphan directories (`learning/`, `arena/`, `bridge/`, `contracts/`) plus `validation/`. By DDD logic it is either (a) part of the `learning-optimization` bounded context, or (b) a deliberate cross-cutting `learning-platform`/`application` layer. Instead it fragmented the top-level layout further (+3 new dirs). The placement repeats the exact ADR-092 anti-pattern flagged last release: cohesive new capability lands outside the DDD map.

**Net:** Not a coupling regression (isolation is clean), but a layering regression (fragmentation, no home). This is why Layer Separation drops 0.5.

---

## 7. Remediation Table — Prior Findings Status

| # | Issue | v3.9.13 | v3.10.6 | Status | Priority |
|---|-------|---------|---------|--------|----------|
| R1 | Orphan directories | 34 dirs / 41.6% | **37 dirs / 41.0%** | **REGRESSED** (+3 dirs: arena, bridge, contracts; +empty coverage/) | P0 |
| R2 | `coordination/` shadow layer | 56,259 | **56,323** | UNCHANGED (still shadow app layer) | P0 |
| R3 | DomainServiceRegistry coverage | 5/13 | **5/13** | UNCHANGED (CQ-005 stalled 3 releases) | P0 |
| R4 | `console.*` project-wide | 3,405 | **3,401** | UNCHANGED (flat, no cleanup) | P1 |
| R5 | Domain files >1,000 lines | 33 | **33** | UNCHANGED (distribution shifted: req-val 4→6, test-exec 4→5) | P1 |
| R6 | Direct `new Service()` | 113 | **113** | UNCHANGED | P2 |
| R7 | `domains → integrations/` | 98 | **98** | UNCHANGED (no port inversion) | P2 |
| R8 | ADR-092 advisor placement | `routing/advisor/` | still orphan; **ADR-104/105 repeats the pattern in `arena/`/`bridge/`/`contracts/`** | REGRESSED (pattern recurs) | P2 |
| R9 | MCP/CLI imports in domains | 0 | **0** | MAINTAINED (no lint guard added yet) | — |
| R10 | Honesty: "logger adoption" claim | 13.4:1 | **13.1:1** | UNCHANGED (finding stands) | P1 |
| R11 (new) | Empty `src/coverage/` stub dir | — | 0 files | NEW | P2 |

**P0 count: 3** (R1 orphan dirs regressed, R2 coordination shadow layer, R3 registry coverage).

---

## 8. Domain Health Matrix

| Domain | Structure | Isolation | Cohesion | Logger | Registry | God Files | Health |
|--------|-----------|-----------|----------|--------|----------|----------:|--------|
| chaos-resilience | 5/5 | 5/5 | 3/5 | YES | NO | 2 | GOOD |
| code-intelligence | 5/5 | 5/5 | 2/5 | YES | YES | 3 | GOOD |
| contract-testing | 5/5 | 5/5 | 2/5 | YES | NO | 3 | FAIR |
| coverage-analysis | 5/5 | 4/5 | 3/5 | YES | YES | 2 | GOOD |
| defect-intelligence | 5/5 | 5/5 | 3/5 | YES | NO | 1 | GOOD |
| enterprise-integration | 5/5 | 5/5 | 4/5 | YES | NO | 0 | GOOD |
| learning-optimization | 5/5 | 4/5 | 2/5 | YES | NO | 2 | FAIR |
| quality-assessment | 5/5 | 5/5 | 3/5 | YES | YES | 1 | GOOD |
| requirements-validation | 5/5 | 5/5 | 1/5 | YES | NO | 6 | FAIR (god-files up 4→6) |
| security-compliance | 5/5 | 5/5 | 3/5 | YES | YES | 2 | GOOD |
| test-execution | 5/5 | 3/5 | 2/5 | YES | NO | 5 | FAIR (god-files up 4→5) |
| test-generation | 5/5 | 5/5 | 2/5 | YES | YES | 3 | GOOD |
| visual-accessibility | 5/5 | 4/5 | 2/5 | YES | NO | 3 | FAIR |

---

## Methodology

All data EXECUTED on 2026-06-12 against the live tree (read-only):
- `find` + `wc -l` for LOC/file counts, excluding `_archived/`, `*.test.ts`, `*.spec.ts`.
- 13×13 (156 ordered-pair) matrix grep for cross-domain imports → 0 hits.
- `grep -rEn "from ['\"].*<target>[/'\"]"` for boundary import statement counts.
- Per-dir structural canon check (file existence of index/interfaces/plugin/coordinator + services/ dir).
- `git log --diff-filter=A` to date the new `arena/`, `bridge/`, `contracts/` directories to ADR-103/104 commits.
- Orphan share = (total src LOC 573,720 − canonical-layer LOC 338,559) / 573,720 = 41.0%.

Reconciliations vs shared snapshot: my `console.*` count (3,401) is narrower-regex than the snapshot's 3,413 (`group/table/count` excluded) — same conclusion. Source LOC 573,720 vs snapshot 576,457 — snapshot likely includes `.spec.ts`/non-`.ts`; both within 0.5%.

---

## Shared Memory

(CLI memory store is broken this session — findings recorded here for namespace `aqe/v3/qe-reports-3-10-6`.)

- **arch-1 (P0 REGRESSED)**: Orphan directories grew 34→37 (+arena/, +bridge/, +contracts/, +empty coverage/) while orphan LOC share held at 41.0%. New ADR-104/105 work keeps landing outside the DDD map.
- **arch-2 (verified GOOD)**: 13×13 cross-domain import matrix is ZERO (re-verified, 156 pairs); domains→mcp and domains→cli reverse imports both 0. The healthy boundaries held.
- **arch-3 (P0 UNCHANGED)**: `coordination/` is now 56,323 LOC — a shadow application layer (queen-coordinator, workflow-orchestrator, task-executor, cross-domain-router) larger than any single domain, still not formalized as `application/`.
- **arch-4 (P0 UNCHANGED)**: DomainServiceRegistry coverage stuck at 5/13 across three releases; 113 direct `new …Service()` instantiations unchanged. CQ-005 stalled.
- **arch-5 (ADR-105 fit POOR, coupling OK)**: The ~6.7K-LOC pattern-space/arena/verdict subsystem is internally isolated (no domain imports it, it imports no domain) but fragmented across 4 orphan dirs; `learning/pattern-store.ts` at 1,962 LOC is now the largest file in the repo and lives in an orphan dir.
- **arch-6 (P1 honesty)**: 3,401 `console.*` vs 259 LoggerFactory/createLogger project-wide (13.1:1); only 23 console.* in domains. The "logger adoption" win is domain-scoped only; project-wide claim remains misleading.
