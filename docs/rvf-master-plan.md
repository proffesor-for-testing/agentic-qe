# RVF Integration Master Plan — AQE Platform

**Date**: 2026-02-22
**Status**: Ready for Execution
**Approach**: Benchmark BEFORE → Full Implementation → Benchmark AFTER → Compare

---

## Executive Summary

This plan integrates RVF (RuVector Format) cognitive containers into the AQE platform through direct, full-mode implementation — no shadow mode, no deferred work. We collect baseline benchmarks first, implement everything for real, then run the same benchmarks to measure improvement.

**Core Insight**: Mincut lambda is a universal structural health primitive applicable to agent routing, test optimization, codebase integrity, knowledge graph analysis, and fleet coordination.

---

## Approach: No Shadow Mode

Shadow mode creates technical debt that gets forgotten. Instead:

1. **BEFORE**: Run comprehensive benchmarks on current system (routing latency, search recall, boot time, dream cycle duration, memory usage)
2. **IMPLEMENT**: Full integration — mincut routing replaces heuristics, RVCOW branching goes live for dreams, witness chain records all decisions, unified HNSW replaces 3 implementations
3. **AFTER**: Run identical benchmarks on new system
4. **COMPARE**: Side-by-side results prove or disprove value

If something breaks, we have SQLite as the untouched backup (additive-only rule still applies).

---

## Research Foundation

### Agents Deployed (4 parallel research agents)

| Agent | Focus | Key Findings |
|-------|-------|-------------|
| RVF Format Architecture | Binary layout, boot sequence, segments | 24 segment types, <5ms boot to 70% recall, 3-layer progressive HNSW |
| Mincut Crates Deep Dive | 6 algorithms, novel applications | 128.7ns query, n^0.12 scaling, attention replacement, integrity monitoring |
| Crate Structure Mapping | 106 crates, dependency graph, APIs | napi-rs bindings ready, rvf-adapters/{agentdb,claude-flow,sona} exist |
| AQE Integration Analysis | Current usage, pain points, ADRs | 3 HNSW fragmentation, ADRs 065-067 proposed but unimplemented |

### Six Thinking Hats Findings

| Hat | Key Insight |
|-----|-------------|
| White (Facts) | 150K records, 3 HNSW impls, 56x faster boot possible, zero mincut usage |
| Red (Intuition) | RVCOW + dream cycles = biggest novel value; migration risk is real |
| Black (Risks) | Data loss catastrophic; RVF is v0.1.0; binary format lock-in |
| Yellow (Benefits) | Portable intelligence, branched dreams, mincut routing, unified HNSW |
| Green (Creative) | QE seed in QR code, adversarial forked brains, mincut-pruned test suites |
| Blue (Action) | Benchmark → Implement → Benchmark → Compare |

---

## Architecture Decision Records

### Existing ADRs (Relevant)

| ADR | Title | Status |
|-----|-------|--------|
| ADR-026 | 3-Tier Model Routing | Implemented — Enhanced by ADR-068 |
| ADR-038 | Memory Unification | Implemented — Target for ADR-072 |
| ADR-047 | MinCut Self-Organizing QE | Implemented — Extended by ADR-068 |
| ADR-050 | RuVector as Primary Neural Backbone | Implemented — Foundation |
| ADR-065 | RVF Hybrid Architecture | Proposed — Umbrella |
| ADR-066 | RVF Progressive HNSW PatternStore | Proposed |
| ADR-067 | Agent Memory COW Branching | Proposed |

### New ADRs Created

| ADR | Title | File |
|-----|-------|------|
| **ADR-068** | Mincut-Gated Model Routing | `v3/implementation/adrs/ADR-068-mincut-gated-model-routing.md` |
| **ADR-069** | RVCOW Dream Cycle Branching | `v3/implementation/adrs/ADR-069-rvcow-dream-cycle-branching.md` |
| **ADR-070** | Witness Chain Audit Compliance | `v3/implementation/adrs/ADR-070-witness-chain-audit-compliance.md` |
| **ADR-071** | HNSW Implementation Unification | `v3/implementation/adrs/ADR-071-hnsw-implementation-unification.md` |
| **ADR-072** | RVF Primary Persistence Migration | `v3/implementation/adrs/ADR-072-rvf-primary-persistence-migration.md` |
| **ADR-073** | Portable Intelligence Containers | `v3/implementation/adrs/ADR-073-portable-intelligence-containers.md` |

### ADR Dependency Graph

```
ADR-065 (Hybrid Architecture) ── Umbrella
  ├── ADR-066 (Progressive HNSW PatternStore)
  │     └── ADR-071 (HNSW Unification)
  ├── ADR-067 (Agent Memory COW Branching)
  │     └── ADR-069 (Dream Cycle RVCOW)
  ├── ADR-068 (Mincut-Gated Routing)
  ├── ADR-070 (Witness Chain Audit)
  ├── ADR-072 (RVF Primary Migration)
  │     └── ADR-073 (Portable Intelligence)
```

---

## Execution Plan

### Step 0: BASELINE BENCHMARKS (Run First)

Collect measurements on the current system before any changes. Save to `reports/baseline-benchmarks.json`.

| Benchmark | What to Measure | Current Expected |
|-----------|----------------|-----------------|
| **Boot time** | Time from process start to first query answerable | ~280ms |
| **Pattern search latency** | p50/p95/p99 for ReasoningBank pattern search (10 queries) | ~5-50ms |
| **HNSW recall@10** | Search accuracy on 1000 random queries against pattern store | ~85-95% |
| **Routing decision latency** | Time to route a task to an agent (model router) | ~2-10ms |
| **Dream cycle duration** | Time for a full dream consolidation cycle | ~5-30s |
| **Memory usage** | RSS after loading all patterns | ~200-400MB |
| **Pattern count** | Total patterns in memory.db | 150K+ |
| **Search implementations** | Count of distinct HNSW/search code paths | 3 |

**Agent**: performance-benchmarker (1 agent, runs first, blocks everything)

---

### Step 1: FULL IMPLEMENTATION (4 Parallel Workstreams)

All workstreams execute in parallel. Each produces production-ready code, not shadows.

#### WS-A: MinCut Routing (replaces heuristic routing)

| Task | Agent | Description | Key Files |
|------|-------|-------------|-----------|
| A1 | coder | Add @ruvector/mincut dependency, create mincut-wrapper.ts | `package.json`, `v3/src/integrations/ruvector/mincut-wrapper.ts` |
| A2 | coder | MinCutRoutingService — replaces static 3-tier thresholds with lambda-based routing | `v3/src/mcp/mincut-routing-service.ts` |
| A3 | coder | Wire into task-router.ts as PRIMARY routing strategy | `v3/src/mcp/task-router.ts` |
| A4 | coder | Mincut-based test suite optimization | `v3/src/domains/test-execution/mincut-optimizer.ts` |
| A5 | coder | Stoer-Wagner structural health monitor | `v3/src/monitoring/structural-health.ts` |

#### WS-B: Dream Cycles + RVCOW Branching

| Task | Agent | Description | Key Files |
|------|-------|-------------|-----------|
| B1 | coder | RVCOW branch manager for dream cycles | `v3/src/learning/dream/rvcow-branch-manager.ts` |
| B2 | coder | Wire into DreamEngine — dreams run on branches, merge on validation pass | `v3/src/learning/dream/dream-engine.ts` |
| B3 | coder | Multi-strategy dreaming — run 2-3 consolidation strategies in parallel branches | `v3/src/learning/dream/speculative-dreamer.ts` |
| B4 | coder | QE brain export/import CLI | `v3/src/cli/brain-commands.ts` |

#### WS-C: Witness Chain (live, not shadow)

| Task | Agent | Description | Key Files |
|------|-------|-------------|-----------|
| C1 | coder | Witness chain implementation (SHA-256 hash chain, append-only) | `v3/src/audit/witness-chain.ts` |
| C2 | coder | Wire into quality gate decisions — every gate verdict gets a witness entry | `v3/src/domains/quality-assessment/` |
| C3 | coder | Wire into pattern mutations — creation, promotion, quarantine, dream merge | `v3/src/learning/qe-reasoning-bank.ts` |

#### WS-D: HNSW Unification

| Task | Agent | Description | Key Files |
|------|-------|-------------|-----------|
| D1 | analyst | Audit all 3 HNSW implementations — document params, behavior, callers | `reports/hnsw-audit.md` |
| D2 | coder | Create unified HnswIndexProvider interface | `v3/src/kernel/hnsw-index-provider.ts` |
| D3 | coder | Implement progressive 3-layer backend (Layer A: instant, B: warm, C: full) | `v3/src/kernel/progressive-hnsw-backend.ts` |
| D4 | coder | Migrate all 3 callers to use HnswIndexProvider | `v3/src/kernel/unified-memory-hnsw.ts`, coverage domain, learning pipeline |

---

### Step 2: INTEGRATION TESTS

| Task | Agent | Description |
|------|-------|-------------|
| T1 | tester | Mincut routing integration tests — verify lambda-based routing produces valid agent assignments |
| T2 | tester | Dream branching integration tests — verify branch/validate/merge cycle preserves data integrity |
| T3 | tester | Witness chain tests — verify hash chain integrity, no gaps, no tampering |
| T4 | tester | HNSW unification tests — verify search results match across all callers |
| T5 | tester | End-to-end — full task lifecycle with mincut routing + dream + witness |

---

### Step 3: POST-IMPLEMENTATION BENCHMARKS

Run identical benchmarks as Step 0. Save to `reports/post-benchmarks.json`.

| Benchmark | Current | Target |
|-----------|---------|--------|
| Boot time | ~280ms | <50ms (progressive HNSW) |
| Pattern search latency p50 | ~5-50ms | <5ms (unified native HNSW) |
| HNSW recall@10 | ~85-95% | >95% (progressive Layer C) |
| Routing decision latency | ~2-10ms | <1ms (mincut lambda cached at 128.7ns) |
| Dream cycle duration | ~5-30s | Same or faster (branch overhead is ms) |
| Memory usage | ~200-400MB | Lower (temperature-based quantization) |
| Search implementations | 3 | 1 |
| Audit trail coverage | 0% | 100% of quality gates + pattern mutations |

**Agent**: performance-benchmarker (same agent, same script, different output file)

---

### Step 4: COMPARISON REPORT

Auto-generate `reports/rvf-benchmark-comparison.md` showing before/after deltas.

---

## Swarm Execution Strategy

### Agent Fleet

```bash
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 8 \
  --strategy specialized
```

### Execution Order

```
[Step 0] 1 agent: Baseline benchmarks (BLOCKS all else)
    ↓
[Step 1] 4-6 agents in parallel:
    WS-A (coder) ─── MinCut routing tasks A1-A5
    WS-B (coder) ─── Dream/RVCOW tasks B1-B4
    WS-C (coder) ─── Witness chain tasks C1-C3
    WS-D (coder) ─── HNSW unification tasks D1-D4
    ↓
[Step 2] 2 agents: Integration tests T1-T5
    ↓
[Step 3] 1 agent: Post-implementation benchmarks
    ↓
[Step 4] 1 agent: Comparison report generation
```

### Conflict Prevention

| Workstream | Exclusive Files | No Other Workstream Touches |
|-----------|----------------|---------------------------|
| WS-A | `v3/src/mcp/task-router.ts`, `mincut-*` | Routing code |
| WS-B | `v3/src/learning/dream/*`, `brain-*` | Dream engine |
| WS-C | `v3/src/audit/*`, quality gate wiring | Audit code |
| WS-D | `v3/src/kernel/unified-memory-hnsw.ts`, `hnsw-*` | HNSW code |

Shared file `v3/src/learning/qe-reasoning-bank.ts` is touched by WS-C (witness wiring) — WS-C must run after WS-B completes its dream engine changes to avoid merge conflicts. All other workstreams are fully independent.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss | Additive-only; SQLite NEVER modified; `cp memory.db memory.db.bak-$(date +%s)` before any operation |
| Mincut npm binary missing | Fall back to existing TypeScript MinCutCalculator in `v3/src/coordination/mincut/` |
| HNSW unification breaks search | Old implementations kept as dead code until benchmarks confirm parity |
| Dream branching corrupts patterns | Branches are isolated; main state untouched until explicit merge after validation |
| Witness chain adds latency | SHA-256 hash is <1us; append-only write is <100us; negligible |

---

## File Manifest

### Documents

| File | Purpose |
|------|---------|
| `docs/rvf-master-plan.md` | This file — consolidated execution plan |
| `docs/rvf-integration-plan.md` | Detailed task specifications with interfaces and test strategies |
| `v3/implementation/adrs/ADR-068 through ADR-073` | 6 new architecture decision records |

### Benchmark Reports (Generated During Execution)

| File | When |
|------|------|
| `reports/baseline-benchmarks.json` | Step 0 (before implementation) |
| `reports/hnsw-audit.md` | Step 1, WS-D task D1 |
| `reports/post-benchmarks.json` | Step 3 (after implementation) |
| `reports/rvf-benchmark-comparison.md` | Step 4 (auto-generated comparison) |

---

## Next Steps

1. Run Step 0: Baseline benchmarks
2. Launch Step 1: 4 parallel workstreams (full implementation, no shadow)
3. Run Step 2: Integration tests
4. Run Step 3: Post-implementation benchmarks
5. Generate Step 4: Comparison report
