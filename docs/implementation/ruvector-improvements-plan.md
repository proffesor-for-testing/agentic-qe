# RuVector Improvements Plan: 14 New Capabilities

**Date**: 2026-03-29
**Version**: AQE v3.8.11
**Branch**: march-fixes-and-improvements
**Status**: ACTIVE (Milestones 1-4 complete, all feature flags enabled, Milestone 5 backlog)
**Companion**: `ruvector-integration-plan.md` (Issue #355, 26 remaining items)
**Scope**: 14 NEW capabilities NOT in Issue #355, plus EWC++ activation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Integration Order and Dependencies](#integration-order-and-dependencies)
4. [Milestone 1: Pattern Intelligence](#milestone-1-pattern-intelligence-r1-r2-r3-ewc)
5. [Milestone 2: Graph Learning](#milestone-2-graph-learning-r4-r5-r6)
6. [Milestone 3: Scale and Optimization](#milestone-3-scale-and-optimization-r7-r8-r9-r10)
7. [Milestone 4: Advanced Learning](#milestone-4-advanced-learning-r11-r12)
8. [Milestone 5: Backlog](#milestone-5-backlog-r13-r14)
9. [Risk Assessment](#risk-assessment)
10. [Testing Strategy](#testing-strategy)
11. [Deliverables Checklist](#deliverables-checklist)

---

## Executive Summary

### What

14 new RuVector capabilities identified from analysis of 113 crates in `/tmp/RuVector`, plus completing the EWC++ Fisher regularization cycle in the existing `@ruvector/sona` integration (persistence is wired but production call sites are missing). These are distinct from the 26 items tracked in Issue #355.

### Why

AQE's 150K+ pattern memory, 9 RL algorithms, and SONA three-loop engine are production-ready but operate without: compositional pattern fingerprinting (HDC), statistical drift detection (CUSUM), event-sourced pattern history (delta), zero-label graph learning (GraphMAE), associative memory (Hopfield), or sublinear solvers for 500K+ scale. Adding these capabilities addresses three gaps:

1. **Speed at scale**: O(1) HDC fingerprints and O(log n) solvers prevent degradation as pattern count grows beyond 150K toward 500K+.
2. **Self-correction**: CUSUM drift detection and delta event sourcing give the system the ability to detect when its own models are drifting and roll back to known-good states.
3. **Learning depth**: GraphMAE, Hopfield, and e-prop add unsupervised/associative/online learning modes that complement the existing supervised RL suite.

### Expected Outcomes

| Metric | Current | After Milestone 2 | After Milestone 4 |
|--------|---------|--------------------|--------------------|
| Pattern fingerprint time | N/A (no fingerprints) | <1us per 10K-bit HDC bind | <1us |
| Drift detection | None | CUSUM with 4-gate model | CUSUM + coherence gated |
| Pattern history/rollback | None | Delta event sourcing | Delta + CRDT consensus |
| Graph learning | Supervised GNN only | + GraphMAE zero-label | + cold-tier, + Granger |
| Associative recall | HNSW approximate | + Hopfield exact recall | + Hopfield |
| Scale ceiling | ~150K patterns | ~150K patterns | 500K+ via O(log n) solver |
| EWC++ Fisher computation | Persistence wired, three-loop never invoked | Three-loop invoked by domain coordinators | Active + monitored |
| Online learning algorithms | 9 RL (all backprop) | 9 RL | 9 RL + e-prop (no backprop) |

---

## Architecture Overview

### Where These Fit in AQE

```
src/integrations/ruvector/          <-- 43 files, primary integration layer
  |
  |-- [EXISTING] sona-wrapper.ts      -- SONA + three-loop + EWC++ (dormant)
  |-- [EXISTING] gnn-wrapper.ts       -- @ruvector/gnn NAPI wrapper
  |-- [EXISTING] coherence-gate.ts    -- Heuristic coherence scoring
  |-- [EXISTING] domain-transfer.ts   -- Thompson Sampling cross-domain
  |-- [EXISTING] feature-flags.ts     -- Runtime feature toggles
  |
  |-- [NEW R1]  hdc-fingerprint.ts    -- HDC binary hypervector fingerprints
  |-- [NEW R3]  delta-tracker.ts      -- Delta event sourcing for patterns
  |-- [NEW R5]  hopfield-memory.ts    -- Modern Hopfield associative memory
  |-- [NEW R8]  solver-adapter.ts     -- Sublinear PageRank solver
  |-- [NEW R9]  spectral-sparsifier.ts -- Graph sparsification adapter
  |-- [NEW R11] eprop-learner.ts      -- E-prop online learning
  |-- [NEW R12] temporal-causality.ts -- Granger causality for test history

src/learning/                        <-- Learning engine, pattern lifecycle
  |-- [MODIFY R10] experience-replay  -- Add reservoir replay with coherence
  |-- [MODIFY R7]  pattern-promotion  -- Meta-learning enhancements

src/integrations/rl-suite/           <-- RL algorithm suite
  |-- [MODIFY R11] algorithms/        -- Add e-prop as new algorithm
```

### Binding Types

| Improvement | Source Crate | Binding | New npm Package? |
|-------------|-------------|---------|------------------|
| R1: HDC | ruvector-nervous-system::hdc | WASM (no_std) | Yes, or inline WASM |
| R2: CUSUM | neural-trader-coherence | TypeScript only | No |
| R3: Delta | ruvector-delta-wasm | WASM | Yes |
| R4: GraphMAE | ruvector-gnn::graphmae | Existing @ruvector/gnn | No |
| R5: Hopfield | ruvector-nervous-system::hopfield | WASM | Yes, or inline WASM |
| R6: Cold-Tier GNN | ruvector-gnn::cold_tier | Existing @ruvector/gnn | No |
| R7: Meta-Learning | ruvector-domain-expansion::meta_learning | TypeScript | No |
| R8: Solver | ruvector-solver-node | NAPI | Yes |
| R9: Sparsifier | ruvector-sparsifier | WASM or TypeScript | TBD |
| R10: Reservoir Replay | neural-trader-replay | TypeScript | No |
| R11: E-prop | ruvector-nervous-system::plasticity::eprop | WASM | Yes, or inline WASM |
| R12: Granger | ruvector-graph-transformer::temporal | WASM or NAPI | TBD |
| R13: Cognitive Routing | ruvector-nervous-system::routing | WASM | Yes |
| R14: Hyperbolic HNSW | ruvector-hyperbolic-hnsw | NAPI | Yes |
| EWC++ | @ruvector/sona (already installed) | NAPI (existing) | No |

---

## Integration Order and Dependencies

```
                    ┌─────────────┐
                    │  EWC++ Act. │ (no deps, existing code)
                    └──────┬──────┘
                           │
  ┌────────┐  ┌────────┐  │  ┌────────┐
  │ R1:HDC │  │ R2:CUS │  │  │ R3:Del │   Milestone 1 (all independent)
  └────┬───┘  └────┬───┘  │  └────┬───┘
       │           │      │       │
       └─────┬─────┘      │       │
             │             │       │
  ┌────────┐ │  ┌────────┐│  ┌────────┐
  │R4:GMAE │ │  │R5:Hopf ││  │R6:Cold │   Milestone 2
  └────┬───┘ │  └────┬───┘│  └────┬───┘
       │     │       │    │       │
       └──┬──┘       │    │       │
          │          │    │       │
  ┌───────┴┐  ┌──────┴┐  │  ┌────┴───┐
  │R7:Meta │  │R8:Solv │  │  │R9:Spar │   Milestone 3
  └────────┘  └───────┘   │  └────────┘
                    ┌──────┴──────┐
                    │ R10:Replay  │
                    └─────────────┘
  ┌────────┐  ┌────────┐
  │R11:Epr │  │R12:Grng│                   Milestone 4
  └────────┘  └────────┘

  ┌────────┐  ┌────────┐
  │R13:Cog │  │R14:Hyp │                   Milestone 5 (backlog)
  └────────┘  └────────┘
```

### Hard Dependencies

- R7 (Meta-Learning) depends on R2 (CUSUM) for plateau detection input
- R8 (Solver) depends on R1 (HDC) for fingerprint-accelerated PageRank
- R10 (Reservoir Replay) depends on R2 (CUSUM) for coherence-gated admission
- R6 (Cold-Tier GNN) depends on R4 (GraphMAE) sharing the same GNN wrapper

### Soft Dependencies (beneficial but not blocking)

- R5 (Hopfield) benefits from R1 (HDC) for encoding, but can use raw float vectors
- R12 (Granger) benefits from R3 (Delta) for historical event sequences
- R9 (Sparsifier) benefits from R4 (GraphMAE) for pre-sparsification embeddings

---

## Milestone 1: Pattern Intelligence (R1, R2, R3, EWC++)

**Goal**: Add compositional fingerprinting, drift detection, event-sourced history, and activate EWC++ Fisher computation. All four items are independent.

**Timeline**: 2-3 weeks

---

### EWC++ Completion

| Property | Value |
|----------|-------|
| **Complexity** | M (upgraded from S — more work than originally scoped) |
| **New Files** | None |
| **Modified Files** | `sona-persistence.ts`, domain coordinator files (`src/domains/*/coordinator.ts`) |
| **Dependencies (npm)** | None (uses existing `@ruvector/sona` 0.1.5) |

**Description**: The SONA three-loop engine (`sona-three-loop.ts`) has a complete TypeScript `EWCPlusPlus` class (Fisher diagonal, online blending, loss computation, task boundary detection) at line 318. Fisher persistence is **already wired**: `sona-persistence.ts:273` calls `setFisherPersistence()` and line 287 calls `restoreFisher()` during initialization (when `useSONAThreeLoop` flag is enabled, which defaults to `true`). Fisher matrices persist to and restore from SQLite correctly.

**However**, the three-loop methods that actually drive EWC++ are never called in production:
- `backgroundConsolidate()` — defined (line 744) but no domain coordinator calls it
- `instantAdapt()` — defined (line 643) but never called
- `recordOutcome()` — defined (line 706) but never called

Fisher matrices persist/restore on startup but **never update** because consolidation is never triggered. EWC++ is inert.

**Changes**:
1. In domain coordinators (e.g., `quality-assessment/coordinator.ts`): call `threeLoopEngine.recordOutcome(result)` after pattern evaluation completes
2. In domain coordinators: call `threeLoopEngine.backgroundConsolidate()` during dream cycle or after N outcomes (configurable threshold)
3. In domain coordinators: call `threeLoopEngine.instantAdapt(pattern)` for real-time pattern adaptation
4. Add round-trip persistence tests (persist → restart → verify Fisher trace matches)
5. Add integration test: train domain A, consolidate, train domain B, verify EWC loss increases

**Success Criteria**:
- [ ] `backgroundConsolidate()` is called by at least one domain coordinator during dream cycles
- [ ] `recordOutcome()` is called after pattern evaluations in at least one domain
- [ ] Fisher matrix updates after consolidation (verified by comparing `getEWCMetrics()` before and after)
- [ ] Fisher matrix round-trip: persist → engine restart → restore → metrics match pre-restart values
- [ ] EWC regularization loss is non-zero when patterns from multiple domains are loaded
- [ ] No regression in existing 15,493 tests

**Verification**:
- Unit test: mock domain coordinator, call recordOutcome 10 times, trigger backgroundConsolidate, verify Fisher diagonal is non-zero
- Integration test: start engine, train on domain A, consolidate (Fisher persisted), train on domain B, verify EWC loss increases
- Integration test: restart engine, verify Fisher trace matches pre-restart value
- Grep verification: confirm `backgroundConsolidate` and `recordOutcome` have production call sites outside of test files

---

### R1: HDC Pattern Fingerprinting

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | `src/integrations/ruvector/hdc-fingerprint.ts`, `tests/unit/integrations/ruvector/hdc-fingerprint.test.ts` |
| **Modified Files** | `feature-flags.ts`, `index.ts` |
| **Dependencies (npm)** | `@ruvector/hdc-wasm` (to be published from `ruvector-nervous-system::hdc`) or inline WASM blob |

**Description**: 10K-bit binary hypervectors enable O(1) compositional pattern binding. Two patterns can be compared via Hamming distance in nanoseconds. The `no_std` Rust implementation compiles to a small WASM binary (~15KB). This replaces cosine-similarity fingerprinting for Tier 1 Agent Booster pattern matching.

**Implementation**:
1. Create `hdc-fingerprint.ts` with:
   - `HdcFingerprinter` class wrapping WASM `bind()`, `unbind()`, `similarity()` ops
   - `fingerprint(pattern: QEPattern): Uint8Array` (10K-bit = 1250 bytes)
   - `compositionalBind(a: Uint8Array, b: Uint8Array): Uint8Array`
   - `hammingDistance(a: Uint8Array, b: Uint8Array): number`
   - Graceful fallback to TypeScript bit-array implementation if WASM unavailable
2. Add feature flag `useHDCFingerprinting` in `feature-flags.ts`
3. Export from `index.ts`

**Success Criteria**:
- [ ] `fingerprint()` produces deterministic 10K-bit output for same input
- [ ] `hammingDistance()` returns 0 for identical patterns, ~5000 for random pairs
- [ ] `compositionalBind()` is associative: bind(A, bind(B, C)) = bind(bind(A, B), C)
- [ ] Benchmark: fingerprint + compare < 1us for single pair (WASM path)
- [ ] Benchmark: fingerprint + compare < 100us for single pair (TypeScript fallback)
- [ ] Feature flag defaults to `true` (opt-out model — verified features ship enabled; users disable if needed)

**Verification**:
- Unit test: determinism, associativity, distance properties
- Benchmark: timing comparison WASM vs TypeScript fallback
- Integration test: wire into pattern-store search as optional fast-path filter

---

### R2: CUSUM Drift Detection

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | `src/integrations/ruvector/cusum-detector.ts`, `tests/unit/integrations/ruvector/cusum-detector.test.ts` |
| **Modified Files** | `coherence-gate-energy.ts` (post-extraction), `tests/unit/integrations/ruvector/coherence-gate.test.ts` |
| **Dependencies (npm)** | None (TypeScript implementation from `neural-trader-coherence` algorithm) |
| **Prerequisite** | **Coherence-gate extraction** (see below) |

**Prerequisite: Coherence-Gate File Extraction**

`coherence-gate.ts` is currently 930 lines — 86% over the project's 500-line limit. It **must** be split before adding CUSUM. Proposed extraction:

| New File | Lines | Contents |
|----------|-------|----------|
| `coherence-gate-core.ts` | ~250 | CoherenceGate class, public API, types, factory functions |
| `coherence-gate-energy.ts` | ~300 | Reflex/retrieval tiers, contradiction detection, Laplacian deviation |
| `coherence-gate-vector.ts` | ~120 | FNV-1a hashing, feature vectors, cosine similarity (pure math) |
| `coherence-gate-cohomology.ts` | ~80 | WASM CohomologyEngine lazy loader |
| `coherence-gate.ts` | ~20 | Barrel re-export for backward compatibility |

This is a mechanical extraction with no logic changes. Two consumers import from `coherence-gate.ts` (`coherence-validator.ts` and the test file) — the barrel re-export preserves all existing imports.

**Description**: Add CUSUM (Cumulative Sum) change-point detection as a new standalone module. The 4-gate model (retrieve/write/learn/act) gains a statistical drift detector that fires when the cumulative deviation from expected coherence exceeds a threshold. CUSUM lives in its own file (`cusum-detector.ts`) and is integrated into `coherence-gate-energy.ts` post-extraction.

**Implementation**:
1. **First**: Execute coherence-gate extraction (prerequisite above)
2. Create `cusum-detector.ts` (~80 lines):
   - `CusumDetector` class
   - `update(value: number): { driftDetected: boolean; cumulativeSum: number }`
   - Configurable threshold, slack parameter, reset behavior
   - Two-sided detection (both positive and negative drift)
3. Integrate into `coherence-gate-energy.ts` `validateAction()` method for the 4 gate types
4. Emit `drift-detected` event via existing EventBus when CUSUM triggers

**Success Criteria**:
- [ ] CUSUM fires within 10 samples of a mean shift of 2 sigma
- [ ] No false positives on stationary coherence sequences (100K samples, <0.1% false alarm rate)
- [ ] 4-gate model (retrieve/write/learn/act) each have independent CUSUM state
- [ ] Drift events appear in observability logs with gate type and cumulative sum value
- [ ] Backward compatible: existing coherence checks unaffected when CUSUM is not triggered

**Verification**:
- Unit test: inject known mean shift, verify detection within expected sample count
- Unit test: stationary sequence produces no alarms
- Integration test: feed real coherence scores from pattern promotion, verify no spurious alarms

---

### R3: Delta Event Sourcing

| Property | Value |
|----------|-------|
| **Complexity** | L |
| **New Files** | `src/integrations/ruvector/delta-tracker.ts`, `tests/unit/integrations/ruvector/delta-tracker.test.ts` |
| **Modified Files** | `feature-flags.ts`, `index.ts` |
| **Dependencies (npm)** | `@ruvector/delta-wasm` (to be published from `ruvector-delta-core`) or TypeScript-only initial implementation |

**Description**: Track pattern version history as a sequence of delta events. Enables rollback to any previous pattern state, incremental sync between agents, and eventually CRDT-based consensus across fleet members. Initial implementation is TypeScript-only using the existing SQLite persistence layer.

**Migration**: Existing 150K+ patterns have no version history. On first activation (feature flag enabled), each existing pattern receives a "v0" genesis snapshot delta. History tracking begins from that point forward. No retroactive history synthesis.

**Implementation**:
1. Create `delta-tracker.ts` with:
   - `DeltaTracker` class storing deltas in SQLite (`pattern_deltas` table)
   - `recordDelta(patternId: string, before: object, after: object): DeltaEvent`
   - `rollback(patternId: string, toVersion: number): object`
   - `getHistory(patternId: string): DeltaEvent[]`
   - `incrementalSync(since: number): DeltaEvent[]` (for agent-to-agent sync)
   - JSON diff using existing `fast-json-patch` dependency
2. Add feature flag `useDeltaEventSourcing` in `feature-flags.ts`
3. Wire into `pattern-store.ts` update path (after pattern modification)

**Success Criteria**:
- [ ] Every pattern update creates a delta event with before/after diff
- [ ] Rollback to version N restores exact pattern state (verified by deep equality)
- [ ] `incrementalSync(since)` returns only deltas after the given timestamp
- [ ] Delta storage overhead < 20% of pattern storage (measured on 1K pattern updates)
- [ ] Feature flag defaults to `true` (opt-out model — verified features ship enabled; users disable if needed)
- [ ] SQLite schema migration adds `pattern_deltas` table without touching existing tables

**Verification**:
- Unit test: create, update 5 times, rollback to version 2, verify state
- Unit test: incremental sync returns correct subset
- Integration test: two simulated agents sync via delta exchange
- Benchmark: 1K sequential updates complete in < 500ms

---

## Milestone 2: Graph Learning (R4, R5, R6)

**Goal**: Add zero-label graph embeddings, associative pattern recall, and cold-tier GNN training for larger-than-RAM graphs.

**Timeline**: 2-3 weeks (after Milestone 1)

---

### R4: GraphMAE Self-Supervised Learning

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | None (extends existing file) |
| **Modified Files** | `gnn-wrapper.ts`, `tests/unit/integrations/ruvector/gnn-wrapper.test.ts` |
| **Dependencies (npm)** | None (uses existing `@ruvector/gnn` 0.1.19 if graphmae is exposed) |

**Description**: GraphMAE (Graph Masked Autoencoder) produces embeddings from code dependency graphs without labeled training data. The `ruvector-gnn::graphmae` module (439 lines Rust) masks random nodes, reconstructs them, and learns structural embeddings. If `@ruvector/gnn` 0.1.19 does not expose `graphmae`, implement the masking + reconstruction in TypeScript as a preprocessing step that feeds into the existing GNN forward pass.

**Implementation**:
1. Add to `gnn-wrapper.ts`:
   - `GraphMAEEncoder` class (~120 lines)
   - `maskAndEncode(graph: QEGraph, maskRatio: number): Float32Array[]`
   - `reconstructionLoss(original: Float32Array[], reconstructed: Float32Array[]): number`
   - Random node masking (default 50%) with learnable mask token
2. Wire into code-intelligence domain for dependency graph embedding

**Success Criteria**:
- [ ] Produces 128-dim embeddings for nodes in a 1K-node graph
- [ ] Reconstruction loss decreases over 10 training epochs (measured, not just asserted)
- [ ] Embeddings cluster similar code modules (measured by intra-cluster distance < inter-cluster distance)
- [ ] Falls back gracefully when GNN native module unavailable

**Verification**:
- Unit test: mask ratio 0.5 masks ~50% of nodes (within 5% tolerance)
- Unit test: reconstruction loss monotonically decreasing over epochs
- Integration test: embed a real code dependency graph (AQE's own `src/` imports) and verify clustering

---

### R5: Modern Hopfield Networks

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | `src/integrations/ruvector/hopfield-memory.ts`, `tests/unit/integrations/ruvector/hopfield-memory.test.ts` |
| **Modified Files** | `feature-flags.ts`, `index.ts` |
| **Dependencies (npm)** | `@ruvector/hopfield-wasm` (to be published) or TypeScript implementation |

**Description**: Modern Hopfield networks provide exponential-capacity associative memory with exact pattern recall (unlike HNSW which is approximate). For AQE, this means storing canonical "golden" patterns that must be retrieved exactly (e.g., known-good test templates, critical defect signatures).

**Implementation**:
1. Create `hopfield-memory.ts`:
   - `HopfieldMemory` class with configurable capacity and dimension
   - `store(pattern: Float32Array, metadata: object): void`
   - `recall(query: Float32Array): { pattern: Float32Array; metadata: object; energy: number }`
   - `batchRecall(queries: Float32Array[]): RecallResult[]`
   - Exponential interaction function (modern Hopfield, not classical)
   - TypeScript implementation first, WASM upgrade path later
2. Add feature flag `useHopfieldMemory`
3. Wire into pattern-store as exact-recall tier (HNSW for approximate, Hopfield for exact)

**Success Criteria**:
- [ ] Exact recall: store 1000 patterns, query each, 100% exact match
- [ ] Capacity: store 10K patterns in 128-dim without retrieval degradation
- [ ] Energy function: `recall()` returns energy score indicating confidence
- [ ] Benchmark: single recall < 1ms for 1K stored patterns
- [ ] Feature flag defaults to `false`

**Verification**:
- Unit test: store N patterns, recall each, verify bit-exact match
- Unit test: query with noisy version of stored pattern, verify correct recall
- Benchmark: recall latency vs pattern count (100, 1K, 10K)

---

### R6: Cold-Tier GNN Training

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | None |
| **Modified Files** | `gnn-wrapper.ts`, `tests/unit/integrations/ruvector/gnn-wrapper.test.ts` |
| **Dependencies (npm)** | None (uses existing `@ruvector/gnn` 0.1.19 if cold_tier is exposed) |

**Description**: Block-aligned I/O with hotset caching enables GNN training on graphs that exceed available RAM. For AQE's pattern graph at 150K+ nodes, this prevents OOM during full-graph training by streaming cold nodes from disk.

**Implementation**:
1. Add to `gnn-wrapper.ts`:
   - `ColdTierTrainer` class (~100 lines)
   - `trainWithColdTier(graph: QEGraph, hotsetSize: number): TrainingResult`
   - Block-aligned node loading (4KB blocks matching OS page size)
   - LRU hotset cache with configurable size (default: 10K nodes)
   - Falls back to full in-memory training when graph fits in hotsetSize
2. Wire into existing GNN training paths as transparent optimization

**Success Criteria**:
- [ ] Training produces equivalent loss to full in-memory training (within 5% tolerance)
- [ ] Peak memory capped at hotsetSize * nodeSize (not full graph size)
- [ ] Benchmark: 50K node graph trains to convergence with 10K hotset
- [ ] Graceful degradation: if disk I/O is slow, falls back to in-memory

**Verification**:
- Unit test: small graph (100 nodes) produces identical results in both modes
- Benchmark: memory usage measurement during training of 50K node graph
- Integration test: train on AQE pattern graph, verify embeddings are usable

---

## Milestone 3: Scale and Optimization (R7, R8, R9, R10)

**Goal**: Meta-learning enhancements, sublinear solvers, graph sparsification, and reservoir replay. These are the items that unlock 500K+ pattern scale.

**Timeline**: 3-4 weeks (after Milestone 2)

---

### R7: Meta-Learning Enhancements

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | None |
| **Modified Files** | `domain-transfer.ts`, `tests/unit/integrations/ruvector/domain-transfer.test.ts` |
| **Dependencies (npm)** | None (TypeScript implementation) |
| **Depends On** | R2 (CUSUM) for plateau detection |

**Description**: Enhance the existing cross-domain transfer engine with four mechanisms from `ruvector-domain-expansion::meta_learning`: DecayingBeta (exploration decay over time), PlateauDetector (detect when learning stalls), ParetoFront (multi-objective optimization), CuriosityBonus (reward novel patterns).

**Implementation**:
1. Add to `domain-transfer.ts` (currently 324 lines, room for ~175 more):
   - `DecayingBeta`: modify Thompson Sampler alpha/beta to decay with time
   - `PlateauDetector`: use R2's CUSUM on learning rate to detect stalls
   - `ParetoFront`: track Pareto-optimal transfer candidates (multi-objective)
   - `CuriosityBonus`: add intrinsic reward for novel source-target pairs
2. Integrate plateau detection with CUSUM from coherence gate

**Success Criteria**:
- [ ] DecayingBeta reduces exploration rate by 50% after 100 successful transfers
- [ ] PlateauDetector fires when transfer success rate is flat for 20+ attempts
- [ ] ParetoFront correctly identifies non-dominated candidates (verified on synthetic data)
- [ ] CuriosityBonus increases sampling probability of untried domain pairs
- [ ] No regression in existing domain-transfer tests

**Verification**:
- Unit test: each mechanism independently with synthetic data
- Integration test: run full transfer cycle, verify exploration decays and plateaus are detected

---

### R8: Sublinear Solver

| Property | Value |
|----------|-------|
| **Complexity** | L |
| **New Files** | `src/integrations/ruvector/solver-adapter.ts`, `tests/unit/integrations/ruvector/solver-adapter.test.ts` |
| **Modified Files** | `src/learning/pattern-promotion.ts`, `feature-flags.ts`, `index.ts` |
| **Dependencies (npm)** | `@ruvector/solver-node` (NAPI bindings from `ruvector-solver-node`) |
| **Depends On** | R1 (HDC) for fingerprint-accelerated node identification |

**Description**: O(log n) PageRank solver for graph-based pattern importance scoring. Currently `pattern-promotion.ts` (`qe-patterns.ts:322`) uses a simple O(1) weighted formula (`confidence * 0.3 + usageScore * 0.2 + successRate * 0.5`) with no inter-pattern relationship awareness. **No pattern citation graph exists today.** This improvement has two parts: (1) build a pattern citation/dependency graph, and (2) run sublinear PageRank over it. The `ruvector-solver-node` crate provides NAPI bindings for sublinear PageRank.

**Implementation**:
1. Design and build pattern citation graph in `pattern-promotion.ts`:
   - Track which patterns co-occur in the same quality assessments
   - Track which patterns were derived from or supersede other patterns
   - Store graph edges in SQLite (`pattern_citations` table)
   - Bootstrap from existing usage data and co-occurrence analysis
2. Create `solver-adapter.ts`:
   - `SublinearSolver` class wrapping `@ruvector/solver-node`
   - `computeImportance(graph: PatternGraph): Map<string, number>`
   - `rankPatterns(patterns: QEPattern[]): RankedPattern[]`
   - TypeScript fallback using power iteration (O(n) per iteration)
3. Add feature flag `useSublinearSolver`
4. Integrate graph-based scores with existing weighted formula (blend, not replace)

**Success Criteria**:
- [ ] Pattern citation graph is populated from existing usage data (bootstrap)
- [ ] PageRank scores on citation graph correlate with existing quality scores (Spearman rho > 0.5)
- [ ] Benchmark: O(log n) confirmed via timing at 1K, 10K, 100K, 500K scales
- [ ] Benchmark: 500K patterns scored in < 100ms (native), < 5s (TypeScript fallback)
- [ ] Feature flag defaults to `false`
- [ ] Optional dependency: works without `@ruvector/solver-node` installed
- [ ] Graceful fallback: when graph is empty/sparse, fall back to existing weighted formula

**Verification**:
- Unit test: compare solver output to known PageRank on small synthetic graph
- Unit test: verify graph bootstrap populates edges from usage data
- Benchmark: scaling curve (log n vs n) at multiple sizes
- Integration test: feed real pattern graph, verify promotion ordering is reasonable

---

### R9: Spectral Graph Sparsification

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | `src/integrations/ruvector/spectral-sparsifier.ts`, `tests/unit/integrations/ruvector/spectral-sparsifier.test.ts` |
| **Modified Files** | `feature-flags.ts`, `index.ts` |
| **Dependencies (npm)** | TBD (`@ruvector/sparsifier-wasm` or TypeScript implementation) |

**Description**: Compress graphs while preserving Laplacian spectral properties. The sparsified graph has far fewer edges but the same eigenvalue structure, meaning coherence checks and min-cut analysis remain valid. Critical for scaling graph operations beyond 100K edges.

**Implementation**:
1. Create `spectral-sparsifier.ts`:
   - `SpectralSparsifier` class
   - `sparsify(graph: QEGraph, epsilon: number): QEGraph` (epsilon controls approximation quality)
   - `validateSpectral(original: QEGraph, sparsified: QEGraph): SpectralValidation`
   - Effective resistance sampling (Spielman-Srivastava algorithm)
2. Add feature flag `useSpectralSparsification`
3. Wire into coherence checks and mincut-wrapper as preprocessing step

**Success Criteria**:
- [ ] Sparsified graph has < 30% of original edges (at epsilon=0.3)
- [ ] Laplacian eigenvalues within (1+epsilon) of original (top 10 eigenvalues)
- [ ] Min-cut value preserved within 10% of original
- [ ] Feature flag defaults to `false`

**Verification**:
- Unit test: sparsify known graph, verify eigenvalue bounds
- Unit test: min-cut on sparsified graph within tolerance
- Benchmark: sparsification time at 10K, 50K, 100K edges

---

### R10: Reservoir Replay with Coherence Gating

| Property | Value |
|----------|-------|
| **Complexity** | M |
| **New Files** | None |
| **Modified Files** | `src/integrations/agentic-flow/reasoning-bank/experience-replay.ts` |
| **Dependencies (npm)** | None (TypeScript implementation) |
| **Depends On** | R2 (CUSUM) for coherence-gated admission |

**Description**: Replace uniform random replay with reservoir sampling that uses the coherence gate to filter which experiences are admitted to the replay buffer. Segment experiences by coherence quality, prioritize replaying high-coherence examples during consolidation.

**Implementation**:
1. Enhance existing `experience-replay.ts`:
   - Add `ReservoirReplayBuffer` class with coherence-gated admission
   - `admit(experience: Experience, coherenceScore: number): boolean`
   - `sample(batchSize: number, minCoherence: number): Experience[]`
   - Reservoir sampling (Algorithm R) for fixed-size buffer
   - Segment classification: high/medium/low coherence tiers
2. Wire coherence gate from R2 into admission logic

**Success Criteria**:
- [ ] Buffer maintains fixed size (configurable, default 10K)
- [ ] High-coherence experiences are 3x more likely to be replayed than low-coherence
- [ ] Reservoir sampling is statistically uniform within each coherence tier
- [ ] Benchmark: admission decision < 0.1ms per experience
- [ ] No regression in existing experience replay tests

**Verification**:
- Unit test: fill buffer beyond capacity, verify reservoir sampling properties
- Unit test: verify coherence-based admission rates
- Integration test: run learning cycle with replay, verify quality improvement vs uniform replay

---

## Milestone 4: Advanced Learning (R11, R12)

**Goal**: Add online learning without backpropagation and temporal causal discovery for test execution history.

**Timeline**: 2-3 weeks (after Milestone 3)

---

### R11: E-prop Online Learning

| Property | Value |
|----------|-------|
| **Complexity** | L |
| **New Files** | `src/integrations/ruvector/eprop-learner.ts`, `src/integrations/rl-suite/algorithms/eprop.ts`, `tests/unit/integrations/ruvector/eprop-learner.test.ts` |
| **Modified Files** | `src/integrations/rl-suite/index.ts`, `feature-flags.ts` |
| **Dependencies (npm)** | `@ruvector/eprop-wasm` (to be published) or TypeScript implementation |

**Description**: E-prop (eligibility propagation) provides online learning with 12 bytes per synapse, no backpropagation-through-time required. This is ideal for real-time pattern adaptation where the full backprop pipeline (used by the existing 9 RL algorithms: a2c, actor-critic, ddpg, decision-transformer, dqn, policy-gradient, ppo, q-learning, sarsa) is too expensive.

**Implementation**:
1. Create `eprop-learner.ts` (WASM wrapper):
   - `EpropNetwork` class with configurable layer sizes
   - `forward(input: Float32Array): Float32Array`
   - `updateOnline(reward: number): void` (no explicit backward pass)
   - Eligibility trace tracking (12 bytes/synapse)
2. Create `algorithms/eprop.ts` implementing `RLAlgorithm` interface (from `src/integrations/rl-suite/interfaces.ts:133`)
3. Register in RL suite as algorithm #10
4. Add feature flag `useEpropOnlineLearning`

**Success Criteria**:
- [ ] Learns XOR problem within 100 episodes (sanity check)
- [ ] Memory usage: 12 bytes/synapse verified (1M synapses = 12MB)
- [ ] Online update time < 0.1ms per step (WASM), < 1ms (TypeScript fallback)
- [ ] Integrates with existing RL suite via `RLAlgorithm` interface
- [ ] Feature flag defaults to `false`

**Verification**:
- Unit test: learn simple classification task
- Unit test: verify memory footprint matches 12 bytes/synapse
- Benchmark: compare online update latency to existing RL algorithms
- Integration test: use as routing policy for agent task assignment

---

### R12: Granger Causality (Temporal Graph Transformer)

| Property | Value |
|----------|-------|
| **Complexity** | L |
| **New Files** | `src/integrations/ruvector/temporal-causality.ts`, `tests/unit/integrations/ruvector/temporal-causality.test.ts` |
| **Modified Files** | `feature-flags.ts`, `index.ts` |
| **Dependencies (npm)** | TBD (`@ruvector/temporal-wasm` or TypeScript implementation) |

**Description**: Discover causal chains in test execution history. When test A fails, does test B always fail 2 minutes later? Granger causality analysis on temporal test data reveals these hidden dependencies, improving defect prediction and test scheduling.

**Implementation**:
1. Create `temporal-causality.ts`:
   - `GrangerAnalyzer` class
   - `analyzeCausality(timeSeries: TestExecutionHistory[]): CausalLink[]`
   - `significanceTest(link: CausalLink, alpha: number): boolean`
   - VAR model estimation (vector autoregression)
   - F-test for Granger causality significance
2. Add feature flag `useGrangerCausality`
3. Wire into defect prediction domain

**Success Criteria**:
- [ ] Correctly identifies causal link in synthetic data (A causes B with lag 2)
- [ ] F-test p-value < 0.05 for true causal links, > 0.05 for spurious
- [ ] Handles up to 1000 time series of length 500 within 10 seconds
- [ ] Feature flag defaults to `false`

**Verification**:
- Unit test: synthetic causal data with known ground truth
- Unit test: independent time series produce no significant links
- Integration test: analyze AQE's own test execution history for causal patterns

---

## Milestone 5: Backlog (R13, R14)

**Goal**: Fleet communication optimization and hierarchical embedding. Lower priority, implement when bandwidth constraints or hierarchy-aware search become bottlenecks.

**Timeline**: TBD (after Milestones 1-4 complete)

---

### R13: Cognitive Routing

| Property | Value |
|----------|-------|
| **Complexity** | L |
| **New Files** | `src/integrations/ruvector/cognitive-routing.ts` |
| **Dependencies (npm)** | `@ruvector/cognitive-routing-wasm` |

**Description**: Predictive coding (90-99% bandwidth reduction), oscillatory routing, and global workspace theory for fleet communication. Only relevant when fleet has 10+ concurrent agents with heavy inter-agent communication.

**Success Criteria**:
- [ ] Bandwidth reduction > 80% on synthetic fleet traffic
- [ ] Message latency increase < 10% compared to uncompressed
- [ ] Oscillatory routing correctly multiplexes 5+ concurrent message streams

---

### R14: Hyperbolic HNSW

| Property | Value |
|----------|-------|
| **Complexity** | L |
| **New Files** | `src/integrations/ruvector/hyperbolic-hnsw.ts` |
| **Dependencies (npm)** | `@ruvector/hyperbolic-hnsw` |

**Description**: Poincare ball embeddings for hierarchical data. Code module trees and test suite hierarchies have natural tree structure that Euclidean HNSW distorts. Hyperbolic HNSW preserves hierarchical distances.

**Success Criteria**:
- [ ] Nearest-neighbor recall > 95% for hierarchical data (vs ~85% Euclidean HNSW)
- [ ] Correctly embeds AQE's module tree such that parent-child distance < sibling distance
- [ ] Search latency within 2x of Euclidean HNSW at same recall level

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WASM packages not published to npm | Blocks R1, R3, R5, R11 | Medium | All WASM items have TypeScript fallback implementations specified. Build WASM from source as fallback. |
| `@ruvector/gnn` 0.1.19 does not expose graphmae/cold_tier | Blocks native path for R4, R6 | Medium | TypeScript implementations specified for both. Request NAPI exposure in next GNN release. |
| `@ruvector/solver-node` NAPI bindings not published | Blocks native path for R8 | Medium | TypeScript power iteration fallback. O(n) is acceptable up to 100K. |
| Coherence gate file (930 lines) already exceeds 500-line limit | Code quality | **Certain** | **Mandatory prerequisite**: extract into 4 modules before R2 work begins. Not conditional. |
| EWC++ `backgroundConsolidate()` causes training instability when first invoked | Learning regression | Medium | Lambda is already tuned (1000.0). Add kill switch via feature flag. Monitor EWC loss and auto-disable if loss exceeds 10x initial. 48-hour monitoring window. |
| No pattern citation graph exists for R8 | Solver has nothing to traverse | **Certain** | Design graph schema and bootstrap from usage data as prerequisite. Document in R8 implementation. |
| SQLite write contention from delta event writes (R3) | DB lock under 8 concurrent agents | Medium | Use WAL mode (already configured); batch delta writes; test with concurrent writers. |
| Delta event sourcing storage bloat | Disk usage | Medium | Implement delta compaction (merge consecutive small deltas). Set max history depth (default 100 versions). |
| Sublinear solver NAPI binary unavailable on ARM64 | Platform support | Medium | TypeScript fallback is specified. Test on both x64 and ARM64 in CI. |
| Memory pressure from Hopfield networks at 10K patterns | OOM risk | Low | Modern Hopfield uses softmax attention, not full pattern storage. Memory is O(stored * dim), not O(stored^2). Cap at configurable limit. |

---

## Testing Strategy

### Unit Tests (per improvement)

Each new file gets a corresponding test file in `tests/unit/integrations/ruvector/`. Each modified file gets new test cases added to its existing test file.

| Improvement | Test File | Min Test Count |
|-------------|-----------|----------------|
| EWC++ | Extend `sona-persistence.test.ts` + new round-trip tests | 7 |
| R1: HDC | `hdc-fingerprint.test.ts` | 8 |
| R2: CUSUM | `cusum-detector.test.ts` + extend `coherence-gate.test.ts` | 6 |
| R3: Delta | `delta-tracker.test.ts` | 10 |
| R4: GraphMAE | Extend `gnn-wrapper.test.ts` | 6 |
| R5: Hopfield | `hopfield-memory.test.ts` | 8 |
| R6: Cold-Tier | Extend `gnn-wrapper.test.ts` | 5 |
| R7: Meta-Learning | Extend `domain-transfer.test.ts` | 8 |
| R8: Solver | `solver-adapter.test.ts` + graph bootstrap tests | 10 |
| R9: Sparsifier | `spectral-sparsifier.test.ts` | 6 |
| R10: Replay | Extend experience-replay tests | 6 |
| R11: E-prop | `eprop-learner.test.ts` | 8 |
| R12: Granger | `temporal-causality.test.ts` | 6 |
| R13: Cognitive | `cognitive-routing.test.ts` | 5 |
| R14: Hyperbolic | `hyperbolic-hnsw.test.ts` | 5 |

### Integration Tests

- **Prerequisites gate**: Coherence-gate extraction complete (all existing tests pass); performance baselines measured and stored in `tests/performance/baselines.json`; pattern citation graph schema designed.
- **Milestone 1 gate**: EWC++ `backgroundConsolidate()` called from production code paths, Fisher round-trip verified; HDC fingerprints match pattern-store search results; CUSUM drift events fire on real coherence data; Delta rollback restores exact state; existing 150K patterns get v0 genesis snapshots on R3 activation.
- **Milestone 2 gate**: GraphMAE embeddings are usable by downstream consumers; Hopfield exact recall verified end-to-end; Cold-tier training does not OOM on 50K graph.
- **Milestone 3 gate**: Pattern citation graph bootstrapped from usage data; solver PageRank correlates with existing quality scores (rho > 0.5); sparsified graph yields valid min-cut; reservoir replay improves learning quality.
- **Milestone 4 gate**: E-prop integrates as RL algorithm #10 via `RLAlgorithm` interface; Granger correctly identifies known causal test dependencies.

### Benchmarks

Every improvement with performance claims gets a benchmark in `tests/performance/`:

| Benchmark | Target | Method |
|-----------|--------|--------|
| HDC fingerprint + compare | < 1us (WASM) | `vitest bench` with 10K iterations |
| CUSUM update | < 0.01ms per sample | `vitest bench` with 100K samples |
| Delta record + rollback | < 500ms for 1K operations | `vitest bench` sequential ops |
| Hopfield recall | < 1ms at 1K patterns | `vitest bench` |
| Solver PageRank | O(log n) scaling curve | Measure at 1K/10K/100K/500K |
| E-prop online update | < 0.1ms (WASM) | `vitest bench` |

### Regression Safety

- Run `npm test` (15,493 tests) after every milestone
- Run `npm run build` to verify TypeScript compilation
- Feature flags default to `false` for all new capabilities
- No existing test should be modified unless explicitly required

---

## Deliverables Checklist

### Milestone 1: Pattern Intelligence

- [ ] **EWC++ Completion**
  - [x] `sona-persistence.ts` calls `setFisherPersistence()` on init (already done at line 273)
  - [x] `sona-persistence.ts` calls `restoreFisher()` on startup (already done at line 287)
  - [ ] Domain coordinators call `backgroundConsolidate()` during dream cycles
  - [ ] Domain coordinators call `recordOutcome()` after pattern evaluations
  - [ ] Fisher matrix round-trip verified (persist → restart → restore → metrics match)
  - [ ] Unit tests: 7 new tests (including round-trip and production call site verification)
  - [ ] No test regression

- [ ] **R1: HDC Pattern Fingerprinting**
  - [ ] `src/integrations/ruvector/hdc-fingerprint.ts` created
  - [ ] TypeScript fallback implementation working
  - [ ] WASM integration (when package available)
  - [ ] Feature flag `useHDCFingerprinting` added
  - [ ] Unit tests: 8 new tests
  - [ ] Benchmark: < 1us WASM, < 100us TypeScript

- [ ] **R2: CUSUM Drift Detection**
  - [ ] **Prerequisite**: coherence-gate.ts extracted into 4 modules (core, energy, vector, cohomology)
  - [ ] `CusumDetector` class in `src/integrations/ruvector/cusum-detector.ts`
  - [ ] Integrated into `coherence-gate-energy.ts`
  - [ ] 4-gate CUSUM state (retrieve/write/learn/act)
  - [ ] Drift event emission via EventBus
  - [ ] Unit tests: 6 new tests
  - [ ] False alarm rate < 0.1% on stationary data

- [ ] **R3: Delta Event Sourcing**
  - [ ] `src/integrations/ruvector/delta-tracker.ts` created
  - [ ] SQLite `pattern_deltas` table migration
  - [ ] Rollback to any version works
  - [ ] Incremental sync method works
  - [ ] Feature flag `useDeltaEventSourcing` added
  - [ ] Unit tests: 10 new tests

### Milestone 2: Graph Learning

- [x] **R4: GraphMAE Self-Supervised Learning**
  - [x] `GraphMAEEncoder` class in `graphmae-encoder.ts` (separate file; gnn-wrapper.ts already 861 lines)
  - [x] Mask-and-reconstruct pipeline with decoder head (encode → decode → SCE loss vs originals)
  - [x] Reconstruction loss decreasing over epochs (SPSA optimizer, lossHistory exposed)
  - [x] SCE loss matches paper: (1 - cos^γ) / γ with configurable gamma
  - [x] 1K-node graph scale test passing
  - [x] Consumer wired: `coordinator-gnn.ts:generateGraphMAEEmbeddings()`
  - [x] Unit tests: 21 tests (masking, encoding, decoding, convergence, clustering, scale, flags)

- [x] **R5: Modern Hopfield Networks**
  - [x] `src/integrations/ruvector/hopfield-memory.ts` created (331 lines)
  - [x] L2-normalized patterns on store/recall for consistent attention weights
  - [x] Exact recall verified at 1K patterns (cosine > 0.999) and 10K patterns (cosine > 0.95)
  - [x] Feature flag `useHopfieldMemory` added (default false)
  - [x] Consumer wired: `pattern-store.ts` store() + search() exact recall path
  - [x] Dimension-aware singleton prevents mismatch bugs
  - [x] Zero-magnitude patterns rejected
  - [x] Unit tests: 28 tests (exact recall, capacity, energy, noisy, batch, benchmark, flags)
  - [x] Benchmark: < 2ms recall at 1K patterns (CI-safe threshold)

- [x] **R6: Cold-Tier GNN Training**
  - [x] `ColdTierTrainer` class in `cold-tier-trainer.ts` (separate file; gnn-wrapper.ts already 861 lines)
  - [x] `FileBackedGraph` for real disk-backed larger-than-RAM graphs
  - [x] Memory-capped training verified (peakMemoryNodes ≤ hotsetSize)
  - [x] Equivalent loss to in-memory training (within 15% tolerance)
  - [x] Consumer wired: `coordinator-gnn.ts:trainWithColdTier()`
  - [x] Unbiased Fisher-Yates shuffle (rejection sampling)
  - [x] Unit tests: 25 tests (in-memory, cold-tier, convergence, cache, FileBackedGraph, flags)

- [x] **Shared Infrastructure**
  - [x] `Xorshift128` PRNG extracted to `src/shared/utils/xorshift128.ts` (eliminates 3 duplicates)
  - [x] Feature flag activation criteria documented for all 3 flags
  - [x] Barrel exports in `index.ts` for all types, classes, and factory functions

### Milestone 3: Scale and Optimization

- [x] **R7: Meta-Learning Enhancements**
  - [x] DecayingBeta in `domain-transfer.ts`
  - [x] PlateauDetector using CUSUM from R2 (CusumDetector on 'learn' gate)
  - [x] ParetoFront for multi-objective transfer
  - [x] CuriosityBonus for novel domain pairs
  - [x] Feature flag `useMetaLearningEnhancements` gates both config and system flag
  - [x] Unit tests: 46 tests (meta-learning.test.ts)

- [x] **R8: PageRank Solver** (renamed from Sublinear Solver — TS fallback is O(n*m), native is O(log n))
  - [x] Pattern citation graph schema: `PatternCitationGraph` class with `PATTERN_CITATIONS_SCHEMA`
  - [x] Co-occurrence recording: `recordCoOccurrence()`, `recordDerivation()`, `buildGraph()`
  - [x] Graph populated during `promotePattern()` — records co-occurrence with same-domain long-term patterns
  - [x] `src/integrations/ruvector/solver-adapter.ts` created (`PageRankSolver` class)
  - [x] TypeScript power iteration fallback with dangling node handling
  - [x] Integrated into `pattern-promotion.ts` via `computeBlendedImportance()`
  - [x] Feature flag `useSublinearSolver` added
  - [x] Unit tests: 34 tests (solver-adapter.test.ts) + 7 integration tests (milestone3-integration.test.ts)
  - [ ] Benchmark: O(log n) confirmed (requires native @ruvector/solver-node — TS fallback is O(n*m))
  - [ ] Spearman rho > 0.5 correlation with quality scores (needs real pattern data)

- [x] **R9: Spectral Graph Sparsification** (degree-based leverage heuristic, not true effective resistance)
  - [x] `src/integrations/ruvector/spectral-sparsifier.ts` created
  - [x] Eigenvalue computation via power iteration with deflation
  - [x] Wired into `mincut-wrapper.ts` via `maybeSparsify()` (> 100 edges, behind flag)
  - [x] Feature flag `useSpectralSparsification` added
  - [x] Unit tests: 36 tests (spectral-sparsifier.test.ts) including connectivity and compression validation
  - [ ] Eigenvalue bounds formally verified (degree heuristic does not guarantee (1+eps) bounds)

- [x] **R10: Reservoir Replay with Coherence Gating**
  - [x] `ReservoirReplayBuffer` in `reservoir-replay.ts` (standalone, generic)
  - [x] Coherence-gated admission with CUSUM drift-aware threshold tightening
  - [x] Wired into `experience-replay.ts`: admits on `storeExperience()`, samples in `getGuidance()`
  - [x] Feature flag `useReservoirReplay` added
  - [x] Unit tests: 32 tests (reservoir-replay.test.ts) + 3 integration tests (milestone3-integration.test.ts)

- [x] **Shared Infrastructure**
  - [x] 4 feature flags with convenience functions, env var support
  - [x] All types/classes exported via `index.ts`
  - [x] CLI flag descriptions in `ruvector-commands.ts`
  - [x] Integration test suite: `milestone3-integration.test.ts` (13 tests)

### Milestone 4: Advanced Learning

- [x] **R11: E-prop Online Learning**
  - [x] `src/integrations/ruvector/eprop-learner.ts` created (444 lines) — EpropNetwork with 12 bytes/synapse
  - [x] `src/integrations/rl-suite/algorithms/eprop.ts` created (373 lines) — extends BaseRLAlgorithm
  - [x] Registered as RL algorithm #10 (type `'eprop'`, category `'online-learning'`)
  - [x] Exported from `rl-suite/algorithms/index.ts` and `rl-suite/index.ts`
  - [x] Feature flag `useEpropOnlineLearning` added (default false)
  - [x] Unit tests: 30 tests (eprop-learner.test.ts) — XOR convergence, memory budget, traces, benchmark
  - [x] Benchmark: forward+update < 1ms for 100x50 network (TypeScript fallback)

- [x] **R12: Granger Causality**
  - [x] `src/integrations/ruvector/temporal-causality.ts` created (342 lines) — GrangerAnalyzer with VAR + F-test
  - [x] Full statistical math: lnGamma (Lanczos), regularized incomplete beta, F-distribution CDF
  - [x] OLS regression via Gaussian elimination with partial pivoting
  - [x] Wired into `defect-intelligence/coordinator.ts` — enriches `predictDefects()` behind flag
  - [x] Feature flag `useGrangerCausality` added (default false)
  - [x] Unit tests: 33 tests (temporal-causality.test.ts) — synthetic causal data, independence, bidirectional, scale

- [x] **Shared Infrastructure**
  - [x] 2 feature flags with convenience functions, env var support
  - [x] All types/classes exported via `index.ts`
  - [x] CLI flag descriptions in `ruvector-commands.ts`

### Milestone 5: Backlog

- [ ] **R13: Cognitive Routing**
  - [ ] `src/integrations/ruvector/cognitive-routing.ts` created
  - [ ] Bandwidth reduction > 80%
  - [ ] Unit tests: 5 new tests

- [ ] **R14: Hyperbolic HNSW**
  - [ ] `src/integrations/ruvector/hyperbolic-hnsw.ts` created
  - [ ] Hierarchical distance preservation verified
  - [ ] Unit tests: 5 new tests

### Prerequisites (Before Milestone 1)

- [ ] **Coherence-gate extraction**: Split 930-line `coherence-gate.ts` into 4 modules
  - [ ] `coherence-gate-core.ts` (~250 lines) — CoherenceGate class, types, factories
  - [ ] `coherence-gate-energy.ts` (~300 lines) — reflex/retrieval tiers, contradiction detection
  - [ ] `coherence-gate-vector.ts` (~120 lines) — FNV-1a, feature vectors, cosine similarity
  - [ ] `coherence-gate-cohomology.ts` (~80 lines) — WASM CohomologyEngine loader
  - [ ] `coherence-gate.ts` converted to barrel re-export (~20 lines)
  - [ ] All existing tests pass unchanged (import via barrel)
- [ ] **Performance baselines measured** (see Performance Baselines section)
- [ ] **Pattern citation graph schema designed** (prerequisite for R8)

### Cross-Cutting

- [ ] All feature flags documented in `feature-flags.ts`
- [ ] All new exports added to `index.ts`
- [ ] All new interfaces added to `interfaces.ts`
- [ ] `npm test` passes (15,493+ tests)
- [ ] `npm run build` succeeds
- [ ] No file exceeds 500 lines
- [ ] No secrets or credentials committed

---

## Performance Baselines

Baseline measurements must be captured **before** implementation begins so improvement claims are verifiable. Use the existing benchmark harness in `src/benchmarks/performance-benchmarks.ts` and `tests/performance/`.

### Measurement Points

| Operation | File:Line | Current Algorithm | Expected Complexity | Instrumentation Status |
|-----------|-----------|-------------------|--------------------|-----------------------|
| Pattern cosine similarity | `shared/utils/vector-math.ts:5` | Dot product + L2 norms | O(dim) per pair | **Not instrumented** — add timing |
| Coherence reflex tier | `coherence-gate.ts:428` | Heuristic threshold checks | O(1) | Tracked (perf.now at line 277) |
| Coherence retrieval tier | `coherence-gate.ts:463` | Sheaf Laplacian + contradictions | O(n^2) contradiction | Tier-level only — need per-component |
| Contradiction detection | `coherence-gate.ts:544` | Pairwise string matching | O(n^2) | **Not instrumented** |
| Pattern importance | `qe-patterns.ts:322` | Weighted formula | O(1) per pattern | **Not instrumented** (trivial) |
| MinCut (weighted degree) | `mincut-calculator.ts:43` | Weighted degree heuristic | O(V) | Tracked (Date.now at line 44) |
| Find weak vertices | `mincut-calculator.ts:97` | Variance + scoring | O(V^2) worst | **Not instrumented** |
| HNSW search | `hnsw-index.ts:77` | Progressive backend | O(log n) theoretical | Benchmarked in `tests/performance/` |

### Existing Benchmarks to Run

```bash
# HNSW scale benchmarks (insert, search, compression, filter)
RUN_SCALE_BENCH=1 npx vitest bench tests/performance/ruvector-scale-benchmarks.bench.ts

# Migration benchmarks (throughput, compression, rollback, memory)
RUN_SCALE_BENCH=1 npx vitest bench tests/performance/ruvector-migration-benchmark.bench.ts
```

### New Benchmarks to Add

| Benchmark | Baseline For | Target File |
|-----------|-------------|-------------|
| Cosine similarity at 1K/10K/100K pairs | R1 (HDC replaces cosine) | `tests/performance/pattern-similarity.bench.ts` |
| Coherence per-component breakdown | R2 (CUSUM augments) | `tests/performance/coherence-components.bench.ts` |
| Pattern importance at 1K/10K/100K patterns | R8 (solver replaces formula) | `tests/performance/pattern-importance.bench.ts` |
| Graph ops at 10K/50K/100K edges | R9 (sparsification) | `tests/performance/graph-operations.bench.ts` |

**Note**: HNSW performance numbers in code comments (0.1ms at 1K, 0.13ms at 10K, 0.17ms at 100K) in `hnsw-index.ts` are **estimated, not measured**. Run the existing scale benchmarks to get real numbers.

---

## Migration Path

### Existing 150K+ Patterns

| Capability | Migration Strategy |
|-----------|-------------------|
| R1: HDC Fingerprinting | Lazy fingerprinting on next access, or batch during dream cycle. No schema migration needed — fingerprints stored alongside existing vectors. |
| R3: Delta Event Sourcing | On activation, each existing pattern gets a "v0" genesis snapshot delta. History begins from that point. No retroactive history synthesis. |
| R8: Pattern Citation Graph | Bootstrap from existing usage data: co-occurrence in assessments, pattern derivation metadata. Graph starts sparse and densifies over time. |
| EWC++: Fisher Matrices | Fisher starts from zero on first `backgroundConsolidate()`. No migration — just begins accumulating. |

### Schema Additions

| Table | Added By | Migration |
|-------|---------|-----------|
| `pattern_deltas` | R3 | New table, no existing table changes |
| `pattern_citations` | R8 | New table, no existing table changes |

All schema additions are **additive** — no existing tables are modified or dropped.

---

## CI/CD Pipeline Changes

### New Requirements

1. **Optional native dependencies**: `@ruvector/solver-node`, `@ruvector/hdc-wasm`, `@ruvector/hopfield-wasm`, `@ruvector/eprop-wasm` must be declared as `optionalDependencies` in `package.json`. Dynamic imports with `try/catch` ensure CI without Rust toolchains still passes.

2. **Platform matrix**: NAPI binaries need x64 and ARM64 builds. Add to GitHub Actions:
   ```yaml
   strategy:
     matrix:
       os: [ubuntu-latest]
       arch: [x64, arm64]
   ```

3. **Benchmark regression detection**: Add `tests/performance/` to CI with threshold-based alerts:
   - Run benchmarks on PR branches
   - Compare against baseline (stored in `tests/performance/baselines.json`)
   - Alert if any benchmark regresses > 20%

4. **Test time budget**: ~106 new tests across 14 improvements. Estimate ~30-60s additional CI time. Ensure CI timeout accommodates this.

5. **WASM binary caching**: WASM blobs (R1, R3, R5, R11) should be cached in CI to avoid recompilation on every run.

---

## Relationship to Issue #355

These 14 capabilities are **distinct from** the 26 remaining items tracked in [Issue #355](https://github.com/proffesor-for-testing/agentic-qe/issues/355). Key clarifications:

- **No conflicts**: None of the 14 items contradict or block #355 items
- **Shared infrastructure**: R2 (CUSUM) and R3 (Delta) improve infrastructure that #355 items also use (coherence gate, persistence layer)
- **Parallel work**: Milestones 1-2 can proceed in parallel with #355 work
- **Ordering recommendation**: Complete coherence-gate extraction (prerequisite) before any #355 items that touch `coherence-gate.ts`
