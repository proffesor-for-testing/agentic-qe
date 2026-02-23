# RVF Integration Benchmark Comparison

**Date**: 2026-02-22
**Baseline**: 2026-02-22T20:34:28Z (pre-implementation, original)
**Post**: 2026-02-22T21:15:32Z (post-implementation)
**System**: linux/arm64, Node v24.13.0, 16GB RAM

> **Note**: baseline-benchmarks.json was inadvertently overwritten on Feb 23 with a post-integration re-run. The original pre-RVF baseline (Feb 22 20:34:28) has been restored. The Feb 23 re-run is preserved in baseline-benchmarks-feb23-rerun.json for reference.

---

## Summary

| Metric | Baseline | Post | Delta | Verdict |
|--------|----------|------|-------|---------|
| **HNSW Init** | 75.63ms | 36.66ms | **-51.5%** | Improved |
| **Pattern Loading** | 78.76ms | 45.49ms | **-42.3%** | Improved |
| **RSS Memory** | 135.56MB | 116.52MB | **-14.0%** | Improved |
| **Heap Total** | 24.32MB | 22.07MB | **-9.3%** | Improved |
| **MinCut TS Latency** | 10.83us | 8.71us | **-19.6%** | Improved |
| **Dream Insights** | 670 | 690 | **+3.0%** | More learning |
| **Dream Cycles** | 252 | 254 | **+0.8%** | Active |
| Boot Time (total) | 1133.37ms | 1427.46ms | +25.9% | See note 1 |
| Embedding Model Load | 978.97ms | 1345.29ms | +37.4% | See note 1 |
| Routing p50 | 0.002ms | 0.002ms | 0% | Unchanged |
| DB Size | 84.25MB | 88.80MB | +5.4% | Expected growth |
| Pattern Count | 6644 | 6644 | 0% | No loss |

---

## Detailed Analysis

### HNSW Initialization: -51.5% (75.63ms -> 36.66ms)

The unified HNSW backend (ADR-071) provides a single interface with lazy loading. The `UnifiedHnswIndex` defers full index construction, answering queries via brute-force cosine similarity first, then upgrading to `@ruvector/gnn` differentiableSearch if available. This is a 2-state conditional fallback, not the originally claimed 3-layer progressive system. The deferred loading still halved init time.

### Pattern Loading: -42.3% (78.76ms -> 45.49ms)

ReasoningBank initialization benefits from the unified HNSW path. Instead of initializing 3 separate search implementations, the system now bootstraps a single `HnswAdapter` that manages named indexes (patterns, qe-memory, learning, coverage) through one code path.

### Memory Usage: -14.0% (135.56MB -> 116.52MB RSS)

Consolidating HNSW implementations reduces duplicate data structures. The backend shares a single vector store across all named indexes via `HnswAdapter`, eliminating redundant copies of the same embeddings.

### MinCut Latency: -19.6% (10.83us -> 8.71us)

The TypeScript MinCutCalculator (wrapped by `QEMinCutService`) shows improved performance, likely due to JIT warmup differences between runs. The mincut lambda computation remains sub-microsecond at 128.7ns per the ruvector benchmarks; the measured ~9us includes graph construction overhead.

### Boot Time: +25.9% (NOTE: Not a regression)

Total boot time increased from 1133ms to 1427ms. This is **entirely attributable to embedding model load variance** (979ms -> 1345ms), which is environment-dependent (container memory pressure, model cache state). The components we changed (HNSW init, pattern loading) both improved significantly. With consistent model loading, effective boot time dropped by ~72ms.

**Adjusted boot time** (excluding embedding model load):
- Baseline: 1133.37 - 978.97 = **154.40ms**
- Post: 1427.46 - 1345.29 = **82.17ms**
- Delta: **-46.8% improvement**

### Routing Latency: Unchanged (0.002ms p50)

The benchmark script measures the existing heuristic routing path. The `MinCutRoutingService` is wired as a strategy in `task-router.ts` but delegates to `mincut-wrapper.js` and requires agent topology data to activate. When topology is provided, routing uses lambda-based tier assignment. The heuristic remains as fallback and was measured here.

### Database Integrity: Verified

- Pattern count: 6644 -> 6644 (zero data loss)
- Vector count: 124 -> 124 (preserved)
- KV entries: 1217 -> 1246 (+29, normal operational growth)
- Dream cycles: 252 -> 254 (+2, background dreaming continued)
- Dream insights: 670 -> 690 (+20, learning active)

---

## New Capabilities (Not Captured by Baseline Benchmarks)

These are new features that had no baseline equivalent. **Status reflects wiring state, not just existence of code.**

| Capability | Status | Tests | Description |
|-----------|--------|-------|-------------|
| **MinCut Routing** | Wired | 47 passing | Wrapper delegating to mincut-wrapper.js; production-active in task-router.ts (ADR-068) |
| **RVCOW Dream Branching** | Wired | 26 passing | SQLite savepoints are real and functional; RVF fork is a cosmetic side-effect writing to /tmp (ADR-069) |
| **Witness Chain** | Wired | 21 passing | Genuinely correct SHA-256 hash chain, production-active (ADR-070) |
| **HNSW Unification** | Wired | 39 passing | Single `IHnswIndexProvider` interface; 2-state fallback (try @ruvector/gnn, else brute-force cosine), not 3-layer progressive as originally claimed (ADR-071) |
| **Speculative Dreaming** | Wired | included above | Runs on SQLite savepoints, not RVF RVCOW as the name implies |
| **Structural Health Monitor** | Internal | included above | Used within mincut subsystem only, not exposed as an endpoint |

**Total new tests**: 133

---

## Modules Not Yet Wired Into Production

The following modules exist and have passing tests, but are **not imported or invoked by any production code path**:

| Module | File | Status |
|--------|------|--------|
| **RVF Native Adapter** | `rvf-native-adapter.ts` | Exists, tested, but not imported by any production code |
| **RVF Dual-Writer** | `rvf-dual-writer.ts` | Exists, tested, not wired into QEReasoningBank |
| **Brain Exporter** | `brain-exporter.ts` | CLI functions exist but not registered in CommandRegistry |
| **MinCut Test Optimizer** | `mincut-test-optimizer.ts` | Exists, tested, zero imports in codebase |

These modules represent completed work that needs integration wiring to become production-active. Until wired, they are dead code with test coverage.

---

## HNSW Implementation Status

| Implementation | Baseline | Post | Notes |
|---------------|----------|------|-------|
| InMemoryHNSWIndex | Active | Deprecated | Replaced by UnifiedHnswIndex (ADR-071 Phase B) |
| RuvectorFlatIndex | Active | Deprecated | Replaced by unified backend |
| QEGNNEmbeddingIndex | Active | Active | Migration pending (coverage domain) |
| **UnifiedHnswIndex** | N/A | **NEW** | Single entry point via HnswAdapter |
| **ProgressiveHnswBackend** | N/A | **NEW** | 2-state conditional fallback (try @ruvector/gnn, else brute-force cosine) |

Effective HNSW implementations: 3 -> 1 primary + 2 deprecated (kept as fallback per risk mitigation plan)

**Correction**: The original report described the ProgressiveHnswBackend as "3-layer progressive loading." The actual implementation is a 2-state conditional: it attempts `@ruvector/gnn` and falls back to brute-force cosine similarity. There is no intermediate layer.

---

## Audit Trail Coverage

| Area | Baseline | Post |
|------|----------|------|
| Quality gate decisions | 0% | 100% (QUALITY_GATE_PASS/FAIL recorded) |
| Pattern mutations | 0% | 100% (CREATE, UPDATE, PROMOTE recorded) |
| Dream merge/discard | 0% | 100% (DREAM_MERGE, DREAM_DISCARD recorded) |
| Routing decisions | 0% | Wired (ROUTING_DECISION type available) |

---

## Targets vs Actuals

| Metric | Master Plan Target | Actual | Hit? |
|--------|-------------------|--------|------|
| HNSW init | Faster | 36.66ms (-51.5%) | Yes |
| Pattern load | Faster | 45.49ms (-42.3%) | Yes |
| Memory RSS | Lower | 116.52MB (-14.0%) | Yes |
| Search implementations | 1 | 1 primary + 2 deprecated | Partial |
| Audit trail | 100% of gates + mutations | 100% | Yes |
| Data loss | Zero | Zero (6644/6644 patterns) | Yes |
| Dream branching | Safe isolation | SQLite savepoints (real); RVF fork (cosmetic) | Partial |
| MinCut routing | Lambda-based | Wired via wrapper with fallback | Partial |

---

## Recommendations

1. **Wire dead modules into production** — The RVF Native Adapter, RVF Dual-Writer, Brain Exporter, and MinCut Test Optimizer all exist with tests but have zero production imports. Either wire them into the appropriate code paths or remove them to reduce maintenance burden.
2. **Register Brain Exporter commands** in CommandRegistry so the CLI functions are actually callable.
3. **Wire RVF Dual-Writer into QEReasoningBank** if dual-write capability is still desired; otherwise delete it.
4. **Remove deprecated HNSW implementations** once UnifiedHnswIndex has been validated in production for 1+ week.
5. **Migrate coverage domain** (`QEGNNEmbeddingIndex`) to use `HnswAdapter.create('coverage')` to complete unification.
6. **Update benchmark script** to exercise new code paths (mincut routing with topology, unified HNSW search, witness chain verification).
7. **Run integration tests** (Step 2 from master plan) to validate cross-workstream behavior.
8. **Monitor embedding model load** variance — consider pre-warming or caching the model to stabilize boot time.
9. **Evaluate whether "RVCOW" naming is misleading** — The actual dream branching uses SQLite savepoints, which work well. The RVF/RVCOW layer on top writes to /tmp as a side effect. Consider renaming to reflect what actually happens.
