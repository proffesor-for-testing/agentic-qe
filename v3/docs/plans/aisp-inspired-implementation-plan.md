# ADR-059/060/061 Parallel Implementation Plan

**Generated:** 2026-02-06
**Analysis:** Six Thinking Hats on AISP v5.1 + aisp-open-core
**Principle:** We value the quality we deliver to our users.

---

## Executive Summary

Three ADRs touching three isolated modules. After resolving one shared-types dependency, all three execute in parallel. **4 phases, 12 milestones, 105+ new tests, max 3 concurrent agents.**

| ADR | Module | Concept Stolen from AISP | Native Implementation |
|-----|--------|--------------------------|----------------------|
| ADR-059 | `coverage-analysis/` | Ghost Intent (psi_g = psi_* - psi_have) | HNSW vector subtraction for phantom test surfaces |
| ADR-060 | `kernel/` | Anti-Drift (Mean(s) = Mean_0(s)) | Cosine similarity fingerprints on domain events |
| ADR-061 | `learning/` | Hebbian 10:1 penalty | Asymmetric confidence + quarantine in ReasoningBank |

---

## Phase 0: Shared Dependency Resolution (Sequential Gate)

### Milestone 0.1: Add SemanticFingerprint to DomainEvent

| Field | Value |
|-------|-------|
| **Agent** | `coder` |
| **File** | `v3/src/shared/types/index.ts` |
| **Operation** | MODIFY (append optional field — backward compatible) |
| **Preconditions** | None |
| **Effects** | `DomainEvent<T>` gains optional `semanticFingerprint`; new `SemanticFingerprint` interface |
| **Gate** | `npm run build` succeeds; all existing tests pass |

---

## Phase 1: New File Creation (Fully Parallel — 3 Agents)

### Milestone 1.1: ADR-059 — Ghost Coverage Analyzer Service

| Field | Value |
|-------|-------|
| **Agent** | `coder` |
| **File** | `v3/src/domains/coverage-analysis/services/ghost-coverage-analyzer.ts` (NEW) |
| **Deps (read)** | `hnsw-index.ts`, `coverage-embedder.ts`, `real-qe-reasoning-bank.ts` |
| **~Lines** | 300-400 |

### Milestone 1.2: ADR-060 — Anti-Drift Middleware

| Field | Value |
|-------|-------|
| **Agent** | `coder` |
| **File** | `v3/src/kernel/anti-drift-middleware.ts` (NEW) |
| **Deps (read)** | `real-embeddings.ts`, `kernel/interfaces.ts`, `shared/types` |
| **~Lines** | 250-350 |

### Milestone 1.3: ADR-061 — Asymmetric Learning Module

| Field | Value |
|-------|-------|
| **Agent** | `coder` |
| **File** | `v3/src/learning/asymmetric-learning.ts` (NEW) |
| **Deps (read)** | `qe-patterns.ts`, `shared/types` |
| **~Lines** | 250-300 |

---

## Phase 2: Test Creation (Fully Parallel — 3 Agents)

### Milestone 2.1: Ghost Coverage Analyzer Tests (40+)

| Field | Value |
|-------|-------|
| **Agent** | `qe-test-writer` |
| **File** | `v3/tests/unit/domains/coverage-analysis/ghost-coverage-analyzer.test.ts` (NEW) |
| **Categories** | PhantomSurface (8), GhostGap detection (8), HNSW ops (8), Embedder integration (6), ReasoningBank (5), Edge cases (5+) |

### Milestone 2.2: Anti-Drift Middleware Tests (35+)

| Field | Value |
|-------|-------|
| **Agent** | `qe-test-writer` |
| **File** | `v3/tests/unit/kernel/anti-drift-middleware.test.ts` (NEW) |
| **Categories** | onEmit (7), onReceive (7), Drift detection (7), Config (5), Events (4), Edge cases (5+) |

### Milestone 2.3: Asymmetric Learning Tests (30+)

| Field | Value |
|-------|-------|
| **Agent** | `qe-test-writer` |
| **File** | `v3/tests/unit/learning/asymmetric-learning.test.ts` (NEW) |
| **Categories** | Asymmetry (8), Quarantine (8), Rehabilitation (7), Integration (4), Edge cases (3+) |

---

## Phase 3: Existing File Modifications (Fully Parallel — 3 Agents)

### Milestone 3.1: Wire ADR-059 into Coverage Analysis Domain

| File | Operation |
|------|-----------|
| `coverage-analysis/interfaces.ts` | Add PhantomGap, PhantomSurface, GhostCoverageAnalyzer |
| `coverage-analysis/services/index.ts` | Export ghost-coverage-analyzer |
| `coverage-analysis/coordinator.ts` | Wire ghost analyzer, add analyzeGhostCoverage() |
| `coverage-analysis/plugin.ts` | Register 'analyze-ghost-coverage' task handler |

### Milestone 3.2: Wire ADR-060 into Kernel EventBus

| File | Operation |
|------|-----------|
| `kernel/interfaces.ts` | Add EventMiddleware, AntiDriftConfig, DriftCheckResult |
| `kernel/event-bus.ts` | Add middleware registration + emit/receive hooks |

### Milestone 3.3: Wire ADR-061 into Learning System

| File | Operation |
|------|-----------|
| `learning/qe-patterns.ts` | Add quarantine fields to QEPattern |
| `learning/pattern-lifecycle.ts` | Add quarantine/rehabilitation methods |
| `learning/real-qe-reasoning-bank.ts` | Integrate asymmetric updates into recordOutcome() |

---

## Phase 4: Integration Verification (Sequential)

### Milestone 4.1: Full Build + Test Suite

1. `npm run build` — zero errors
2. `npm test -- --run` — zero regressions
3. `npm run lint` — zero new lint errors
4. Verify 105+ new tests exist and pass

---

## File Ownership Matrix (Zero Conflict Guarantee)

| File | Phase 0 | Agent 1 (059) | Agent 2 (060) | Agent 3 (061) |
|------|---------|---------------|---------------|---------------|
| `shared/types/index.ts` | **WRITE** | read | read | read |
| `coverage-analysis/services/ghost-coverage-analyzer.ts` | — | **WRITE** | — | — |
| `coverage-analysis/interfaces.ts` | — | **WRITE** | — | — |
| `coverage-analysis/services/index.ts` | — | **WRITE** | — | — |
| `coverage-analysis/coordinator.ts` | — | **WRITE** | — | — |
| `coverage-analysis/plugin.ts` | — | **WRITE** | — | — |
| `kernel/anti-drift-middleware.ts` | — | — | **WRITE** | — |
| `kernel/event-bus.ts` | — | — | **WRITE** | — |
| `kernel/interfaces.ts` | — | — | **WRITE** | — |
| `learning/asymmetric-learning.ts` | — | — | — | **WRITE** |
| `learning/real-qe-reasoning-bank.ts` | — | read | — | **WRITE** |
| `learning/pattern-lifecycle.ts` | — | — | — | **WRITE** |
| `learning/qe-patterns.ts` | — | — | — | **WRITE** |

**No file has more than one WRITE owner.**

---

## Execution Dependency Graph

```
Phase 0 (Sequential Gate)
  M0.1: shared/types/index.ts ── build must pass
  │
  ├─────────────────────┬──────────────────────┐
Phase 1 (3 Parallel)    │                      │
  M1.1: ghost-analyzer  M1.2: anti-drift       M1.3: asymmetric
  │                     │                      │
Phase 2 (3 Parallel)    │                      │
  M2.1: ghost tests     M2.2: drift tests      M2.3: learning tests
  │                     │                      │
Phase 3 (3 Parallel)    │                      │
  M3.1: wire 059        M3.2: wire 060         M3.3: wire 061
  │                     │                      │
  └─────────────────────┴──────────────────────┘
  │
Phase 4 (Sequential)
  M4.1: build + test + lint
```
