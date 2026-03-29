# ADR-087: RuVector Advanced Capabilities — Phase 5 Integration

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-087 |
| **Status** | Active (Milestones 1-4 complete, Milestone 5 backlog) |
| **Date** | 2026-03-29 |
| **Author** | Architecture Team |
| **Review Cadence** | Monthly (active implementation) |
| **Companion Plan** | `docs/implementation/ruvector-improvements-plan.md` |
| **Tracking Issue** | [#355](https://github.com/proffesor-for-testing/agentic-qe/issues/355) |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's completed Phase 1-4 RuVector integration (ADRs 081-085) where 30 adapters, 8 `@ruvector/*` packages, and 98/124 success criteria are operational, providing native HNSW (150x speedup), neural routing, coherence gating, temporal compression, and cross-domain transfer learning,

**facing** a research audit of RuVector's full 113-crate workspace that revealed 14 capabilities directly relevant to AQE's memory/learning/self-improving systems that were not included in the original integration plan — including hyperdimensional computing, statistical drift detection, event-sourced pattern history, self-supervised graph learning, associative memory networks, sublinear solvers, and online biologically-plausible learning — all of which address specific scaling, self-correction, and learning depth gaps as AQE targets 500K+ patterns,

**we decided for** a phased integration of 14 new RuVector capabilities across 5 milestones, plus completing the EWC++ Fisher regularization (persistence wired, production invocation missing), organized by impact and dependency order: Pattern Intelligence (R1-R3, EWC++), Graph Learning (R4-R6), Scale & Optimization (R7-R10), Advanced Learning (R11-R12), and Backlog (R13-R14),

**and neglected** (a) implementing all 14 capabilities simultaneously (rejected: exceeds coordination capacity of 8-agent swarms, risk of destabilizing the 15,493-test baseline), (b) re-implementing the Rust algorithms in pure TypeScript (rejected: defeats the purpose of native performance; many of these algorithms' value is in sub-millisecond execution), (c) waiting for all capabilities to be published as npm packages (rejected: TypeScript fallbacks ensure progress; WASM binaries can be vendored),

**to achieve** O(1) compositional pattern fingerprinting via HDC, statistical drift detection via CUSUM, pattern version history via delta event sourcing, zero-label graph embeddings via GraphMAE, exact associative recall via Modern Hopfield, O(log n) pattern importance via sublinear solvers, multi-objective optimization via Pareto fronts, and online learning via e-prop — all behind feature flags with TypeScript fallbacks,

**accepting that** unpublished `@ruvector/*` packages require TypeScript fallbacks until NAPI/WASM binaries are available, the meta-learning enhancements (R7) revisit decisions in ADR-084 by adding 4 new strategies, the Granger causality module (R12) revisits ADR-035's rejection of Granger in favor of STDP (now justified by Rust implementation addressing the latency concern), and some capabilities (R13 cognitive routing, R14 hyperbolic HNSW) are speculative with unclear production value.

---

## Context

### What Changed Since ADRs 081-085

A comprehensive audit of RuVector's 113-crate repository (9,480 files) revealed that AQE uses ~15 crates out of ~100 workspace members. The remaining 85 crates were analyzed for relevance. Of these, 14 capabilities are directly applicable to AQE's memory, learning, and self-improvement systems and were not tracked in the original integration plan or Issue #355.

### Current State

| Metric | Value |
|--------|-------|
| RuVector adapters integrated | 30 |
| `@ruvector/*` packages used | 8 |
| Success criteria passing | 98/124 |
| Tests passing | 15,493 |
| Pattern database size | 150K+ |
| RL algorithms | 9 |
| EWC++ status | Persistence wired, three-loop methods never invoked in production |

### Gaps Identified

1. **No compositional fingerprinting**: Pattern matching requires full vector comparison. No O(1) compositional binding.
2. **No statistical drift detection**: Coherence gate uses heuristic thresholds, not statistical change-point detection.
3. **No pattern history**: Snapshot-only persistence. Cannot rollback, diff, or incrementally sync patterns.
4. **No unsupervised graph learning**: GNN requires labeled data. No self-supervised embeddings from graph structure.
5. **No exact associative recall**: HNSW provides approximate nearest neighbor only.
6. **No graph-based importance scoring**: Pattern importance uses a simple weighted formula (`confidence * 0.3 + usageScore * 0.2 + successRate * 0.5`), not graph-based ranking. No pattern citation graph exists. Won't scale to 500K+ or capture inter-pattern relationships.
7. **No learning stall detection**: System cannot detect when its own learning has plateaued.
8. **No online learning**: All 9 RL algorithms use episode-based backpropagation.

---

## The 14 Capabilities

### Phase 5A: Pattern Intelligence (Milestone 1)

**R1: Hyperdimensional Computing (HDC) Pattern Fingerprinting**
- **Source**: `ruvector-nervous-system::hdc`
- **What**: 10,000-bit binary hypervectors with SIMD-optimized XOR binding, bundling, and associative memory
- **Why**: O(1) compositional binding ("slow" XOR "flaky" XOR "database" = single vector), nanosecond Hamming distance similarity. Ideal for Agent Booster Tier 1.
- **Integration**: New `src/integrations/ruvector/hdc-fingerprint.ts`
- **Binding**: WASM (no_std, zero deps) with TypeScript fallback
- **New ADR scope**: No existing ADR covers hyperdimensional computing

**R2: CUSUM Drift Detection**
- **Source**: `neural-trader-coherence`
- **What**: Cumulative Sum statistical change-point detection with regime awareness (calm/normal/volatile) and 4-gate model (retrieve/write/learn/act)
- **Why**: Replaces heuristic threshold checks with statistically rigorous drift detection. Dynamically adjusts coherence thresholds based on detected regime.
- **Integration**: Enhance existing `src/integrations/ruvector/coherence-gate.ts` — **prerequisite**: extract 930-line file into 4 modules (core, energy, vector, cohomology) to comply with 500-line limit before adding CUSUM
- **Binding**: TypeScript-only (port algorithm, no new dependency)
- **Existing ADR impact**: Extends ADR-060 (Semantic Anti-Drift, Proposed) and ADR-083 (Coherence Gate)

**R3: Delta Event Sourcing**
- **Source**: `ruvector-delta-core` (5 crates)
- **What**: Sparse/dense delta encoding for vectors, LZ4/Zstd compression, time-windowed aggregation, CRDT consensus
- **Why**: Enables pattern version history, rollback to known-good states, and incremental brain export (only changes since last export)
- **Integration**: New `src/integrations/ruvector/delta-tracker.ts`
- **Binding**: WASM with TypeScript fallback
- **Existing ADR impact**: Extends ADR-065 (Hybrid Architecture) and ADR-072 (RVF Migration)

**EWC++ Activation**
- **Source**: `@ruvector/sona` (already installed)
- **What**: Fisher Information Matrix computation for Elastic Weight Consolidation++
- **Why**: Prevents catastrophic forgetting when learning new domains. Fisher persistence is wired (`sona-persistence.ts:273` calls `setFisherPersistence()`, line 287 calls `restoreFisher()`), but the three-loop methods (`backgroundConsolidate()`, `instantAdapt()`, `recordOutcome()`) are never called by any domain coordinator in production. Fisher matrices persist/restore but never update.
- **Integration**: Add production call sites in domain coordinators (`src/domains/*/coordinator.ts`) to invoke three-loop engine methods; add round-trip persistence tests
- **Binding**: NAPI (already integrated)
- **Existing ADR impact**: Completes ADR-050 (Neural Backbone) EWC++ objective

### Phase 5B: Graph Learning (Milestone 2)

**R4: GraphMAE Self-Supervised Learning**
- **Source**: `ruvector-gnn::graphmae` (439 lines Rust)
- **What**: Masked graph autoencoders — learns graph representations with zero labels via masking and reconstructing node features. GAT encoder, SCE loss, re-masking.
- **Why**: AQE builds knowledge graphs but has no way to learn embeddings from graph structure without manual labeling. GraphMAE auto-generates embeddings from the code dependency graph.
- **Integration**: Wire into `src/integrations/ruvector/gnn-wrapper.ts` (existing `@ruvector/gnn`)
- **Binding**: NAPI (already installed via `@ruvector/gnn`)
- **Existing ADR impact**: Extends ADR-050 (Neural Backbone) GNN capabilities

**R5: Modern Hopfield Networks**
- **Source**: `ruvector-nervous-system::hopfield`
- **What**: Exponential-capacity associative memory equivalent to transformer attention (Ramsauer et al. 2020)
- **Why**: Complements HNSW's approximate nearest neighbor with exact content-addressable recall. "Did we see exactly this pattern before?" (Hopfield) vs "What patterns are similar?" (HNSW).
- **Integration**: New `src/integrations/ruvector/hopfield-memory.ts`
- **Binding**: WASM or thin NAPI with TypeScript fallback
- **Existing ADR impact**: Extends ADR-038 (Memory Unification) with a new memory type

**R6: Cold-Tier GNN Training**
- **Source**: `ruvector-gnn::cold_tier`
- **What**: AGNES-style block-aligned I/O with hotset caching for training GNNs on graphs exceeding RAM
- **Why**: As patterns grow toward 500K+, the knowledge graph may exceed comfortable in-memory limits. Cold-tier training enables learning on larger-than-RAM pattern histories.
- **Integration**: Enhance `src/integrations/ruvector/gnn-wrapper.ts`
- **Binding**: NAPI (via existing `@ruvector/gnn`)
- **Existing ADR impact**: Extends ADR-050 (Neural Backbone) GNN scalability

### Phase 5C: Scale & Optimization (Milestone 3)

**R7: Meta-Learning Enhancements**
- **Source**: `ruvector-domain-expansion::meta_learning`
- **What**: Four composable meta-learning modules: `DecayingBeta` (non-stationary adaptation), `PlateauDetector` (learning stall correction), `ParetoFront` (multi-objective optimization), `CuriosityBonus` (UCB exploration)
- **Why**: AQE's `regret-tracker.ts` and `thompson-sampler.ts` are basic. PlateauDetector detects when learning has stalled and triggers corrective actions. ParetoFront enables optimizing accuracy/cost/speed simultaneously.
- **Integration**: Enhance `src/integrations/ruvector/domain-transfer.ts` and learning engine
- **Binding**: TypeScript (port algorithms)
- **Existing ADR impact**: Extends ADR-084 (Cross-Domain Transfer Learning) with 4 new strategies

**R8: Sublinear Solver**
- **Source**: `ruvector-solver` + `ruvector-solver-node`
- **What**: O(log n) PageRank, sparse linear systems, spectral methods via Neumann series and conjugate gradient
- **Why**: Pattern importance scoring currently uses a simple O(1) weighted formula per pattern with no inter-pattern relationship awareness. At 500K+ patterns, graph-based importance (PageRank over a pattern citation/dependency graph) would capture structural importance but requires sublinear algorithms to be feasible. NAPI bindings already exist.
- **Integration**: New `src/integrations/ruvector/solver-adapter.ts`; also requires building a pattern citation graph in `pattern-promotion.ts` (greenfield — no graph exists today)
- **Binding**: NAPI (`@ruvector/solver-node`) with TypeScript power-iteration fallback
- **Existing ADR impact**: Extends ADR-003 (Sublinear Algorithms) and ADR-047 (MinCut)

**R9: Spectral Graph Sparsification**
- **Source**: `ruvector-sparsifier`
- **What**: Dynamic spectral sparsification maintaining a compressed graph that preserves Laplacian spectral properties
- **Why**: As the knowledge graph grows, graph operations (min-cut, attention, GNN forward pass) get expensive. Sparsification reduces the graph while preserving structural properties.
- **Integration**: New `src/integrations/ruvector/spectral-sparsifier.ts`
- **Binding**: WASM with TypeScript fallback
- **Existing ADR impact**: Extends ADR-047 (MinCut) graph infrastructure

**R10: Reservoir Replay with Coherence Gating**
- **Source**: `neural-trader-replay`
- **What**: Selective memory store with coherence-gated admission, reservoir sampling with O(1) eviction, segment classification (high-uncertainty, regime-transition, structural-anomaly)
- **Why**: AQE's experience replay stores everything equally. Selective admission ensures the replay buffer focuses on interesting/novel patterns.
- **Integration**: Enhance experience replay in learning engine
- **Binding**: TypeScript (port algorithm, uses R2 CUSUM for gating)
- **Existing ADR impact**: Extends ADR-046 (V2 Feature Integration) experience replay

### Phase 5D: Advanced Learning (Milestone 4)

**R11: E-prop Online Learning**
- **Source**: `ruvector-nervous-system::plasticity::eprop`
- **What**: Eligibility propagation — 12 bytes/synapse, no backprop-through-time, handles 1000+ ms temporal credit assignment
- **Why**: AQE's 9 RL algorithms (a2c, actor-critic, ddpg, decision-transformer, dqn, policy-gradient, ppo, q-learning, sarsa) all use episode-based backpropagation. E-prop enables truly online, per-decision learning with near-zero memory overhead.
- **Integration**: New `src/integrations/ruvector/eprop-learner.ts` + `src/integrations/rl-suite/algorithms/eprop.ts` (implements `RLAlgorithm` interface from `rl-suite/interfaces.ts`)
- **Binding**: WASM with TypeScript fallback
- **Existing ADR impact**: Extends ADR-006 (Unified Learning) with algorithm #10

**R12: Granger Causality for Test Failure Prediction**
- **Source**: `ruvector-graph-transformer::temporal`
- **What**: Causal temporal attention with Granger causality extraction, VAR model + F-test, continuous-time ODE
- **Why**: Discovers causal chains: "when test_login fails, test_checkout fails 5min later at 87% probability."
- **Integration**: New `src/integrations/ruvector/temporal-causality.ts`
- **Binding**: WASM with TypeScript fallback
- **Existing ADR impact**: **Revises ADR-035** which rejected Granger ("requires more data, higher latency") in favor of STDP. The Rust implementation addresses the latency concern. This ADR proposes Granger as a **complement** to STDP, not a replacement — STDP for real-time spike-timing correlation, Granger for batch historical analysis.

### Phase 5E: Backlog (Milestone 5)

**R13: Cognitive Routing for Agent Communication**
- **Source**: `ruvector-nervous-system::routing`
- **What**: Predictive coding (90-99% bandwidth reduction), oscillatory Kuramoto routing, global workspace (Miller's Law 4-7 item capacity), circadian scheduling
- **Integration**: Fleet communication optimization
- **Existing ADR impact**: Extends ADR-022 (Agent Routing) and ADR-064 (Teams)

**R14: Hyperbolic HNSW**
- **Source**: `ruvector-hyperbolic-hnsw`
- **What**: Poincare ball embeddings where hierarchical distance is meaningful
- **Integration**: Code module and test suite hierarchy search
- **Existing ADR impact**: Extends ADR-081 (Native HNSW) and ADR-071 (HNSW Unification)

---

## Existing ADR Impact Summary

### ADRs Extended (add cross-reference)

| ADR | Extended By | Impact |
|-----|------------|--------|
| ADR-003 | R8 (Sublinear Solver) | O(log n) algorithms for pattern importance |
| ADR-006 | R11 (E-prop) | 10th learning algorithm, first online/no-backprop |
| ADR-022 | R13 (Cognitive Routing) | Bio-inspired agent communication |
| ADR-038 | R5 (Hopfield) | New associative memory type |
| ADR-046 | R10 (Reservoir Replay) | Coherence-gated experience replay |
| ADR-047 | R8, R9 | Sublinear solver + graph sparsification for MinCut |
| ADR-050 | R4, R6, EWC++ | GraphMAE, cold-tier GNN, EWC++ activation |
| ADR-060 | R2 (CUSUM) | Statistical drift detection (Proposed → implementable) |
| ADR-064 | R13 (Cognitive Routing) | Bio-inspired team communication |
| ADR-065 | R3 (Delta) | Event-sourced pattern persistence |
| ADR-071 | R14 (Hyperbolic) | New HNSW variant for hierarchical data |
| ADR-072 | R3 (Delta) | Incremental sync for RVF migration |
| ADR-081 | R14 (Hyperbolic) | Poincare ball variant alongside Euclidean |
| ADR-083 | R2 (CUSUM) | Statistical coherence gating |
| ADR-084 | R7 (Meta-Learning) | 4 new transfer strategies |

### ADR Revised

| ADR | Revised By | Change |
|-----|-----------|--------|
| ADR-035 | R12 (Granger) | Adds Granger as complement to STDP. Original rejection rationale ("higher latency") addressed by Rust implementation. STDP for real-time, Granger for batch historical analysis. |

### No ADRs Obsoleted

All 14 capabilities extend or complement existing decisions. None invalidate prior architectural choices.

---

## Implementation Approach

### Prerequisites (Must Complete Before Milestone 1)

1. **Coherence-gate extraction**: `coherence-gate.ts` is 930 lines (86% over the 500-line limit). Must be split into 4 modules (`coherence-gate-core.ts`, `coherence-gate-energy.ts`, `coherence-gate-vector.ts`, `coherence-gate-cohomology.ts`) with barrel re-export for backward compatibility before R2 CUSUM can be added.
2. **Performance baselines**: Measure current latency for pattern similarity (cosine similarity in `vector-math.ts`), coherence scoring (per-component breakdown in `coherence-gate.ts`), pattern importance scoring (`calculateQualityScore()` in `qe-patterns.ts`), and graph operations (`approxMinCut()` in `mincut-calculator.ts`). Without before/after numbers, improvement claims are unverifiable.
3. **Pattern citation graph design**: R8 (Sublinear Solver) assumes a pattern graph for PageRank traversal, but no such graph exists. Current importance scoring is a simple O(1) weighted formula. The graph schema must be designed before R8 implementation.

### Performance Baselines (To Be Measured)

| Operation | Current Implementation | File | Baseline Target |
|-----------|----------------------|------|-----------------|
| Pattern similarity | `cosineSimilarity()` | `src/shared/utils/vector-math.ts:5` | Measure at 1K/10K/100K pairs |
| Coherence reflex tier | `computeReflexEnergy()` | `coherence-gate.ts:428` | Already tracked (<1ms budget) |
| Coherence retrieval tier | `computeRetrievalEnergy()` | `coherence-gate.ts:463` | Per-component breakdown needed |
| Contradiction detection | `detectContradictions()` | `coherence-gate.ts:544` | O(n^2) string matching, uninstrumented |
| Pattern importance | `calculateQualityScore()` | `qe-patterns.ts:322` | O(1) per pattern, trivial |
| MinCut | `approxMinCut()` | `mincut-calculator.ts:43` | Already tracked (Date.now) |
| HNSW search | `search()` | `hnsw-index.ts:77` | Benchmarked in `tests/performance/` |

### Migration Path for Existing Patterns

- **Delta event sourcing (R3)**: Existing 150K+ patterns have no version history. On first activation, each pattern receives a "v0" genesis snapshot delta. History tracking begins from that point forward. No retroactive history synthesis.
- **HDC fingerprinting (R1)**: Existing patterns will be fingerprinted lazily on next access, or batch-fingerprinted during a dream cycle consolidation.
- **Pattern citation graph (R8)**: Must be bootstrapped from existing pattern usage data and co-occurrence analysis before PageRank scoring is meaningful.

### Feature Flags (Verified = Default `true`, Unverified = Default `false`)

Every capability is gated behind a feature flag in `src/integrations/ruvector/feature-flags.ts`. **Policy**: features default to `true` (opt-out) after passing verification and benchmarks; unimplemented features default to `false` until verified. Users benefit from improvements by default and can disable if needed.

```typescript
// Milestones 1-4 — verified, default true (opt-out)
useHDCFingerprinting: true,          // R1
useCusumDriftDetection: true,        // R2
useDeltaEventSourcing: true,         // R3
useEwcPlusPlusRegularization: true,  // EWC++
useGraphMAEEmbeddings: true,         // R4
useHopfieldMemory: true,             // R5
useColdTierGNN: true,                // R6
useMetaLearningEnhancements: true,   // R7
useSublinearSolver: true,            // R8
useSpectralSparsification: true,     // R9
useReservoirReplay: true,            // R10
useEpropOnlineLearning: true,        // R11
useGrangerCausality: true,           // R12

// Milestone 5 — backlog, not yet implemented, default false
useCognitiveRouting: false,          // R13
useHyperbolicHnsw: false,            // R14
```

### TypeScript Fallback Guarantee

Every WASM/NAPI integration has a TypeScript fallback so that:
- Unpublished packages do not block progress
- CI environments without native binaries still pass all tests
- Users without Rust toolchains can use all features (with reduced performance)

### Testing Strategy

- ~106 new tests across 14 improvements
- Each milestone has an integration gate before proceeding
- Existing 15,493 tests must not regress
- Benchmark targets for each performance-sensitive capability

### CI/CD Pipeline Changes

- **WASM/NAPI binaries**: CI must handle optional native dependencies. Use `optionalDependencies` in `package.json` and `try/catch` dynamic imports so CI without Rust toolchains still passes.
- **ARM64 matrix**: Native NAPI binaries (`@ruvector/solver-node`, `@ruvector/gnn`) require x64 and ARM64 builds. Add platform matrix to GitHub Actions workflow.
- **Benchmark regression**: Add `tests/performance/` benchmarks to CI with threshold-based regression detection (alert if >20% regression from baseline).
- **106 new tests**: Ensure CI timeout accommodates additional test run time (~30-60s estimated).

### Observability

- **CUSUM drift events**: Emit via existing EventBus, log to observability layer with gate type and cumulative sum value. Define alerting threshold for consecutive drift detections (default: 3 within 10 minutes).
- **EWC++ metrics**: Expose Fisher trace, regularization loss, and task boundary count via `getEWCMetrics()`. Dashboard TBD.
- **Feature flag status**: Log active feature flags at startup for debugging and audit.

---

## Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Unpublished `@ruvector/*` packages | Can't use native performance | Medium | TypeScript fallbacks for every capability |
| EWC++ destabilizes existing learning | Patterns degrade | Low | Kill switch feature flag, monitor regret for 48h |
| Delta event sourcing increases DB size | Storage growth | Medium | LZ4 compression, configurable retention window |
| GraphMAE training too slow in TypeScript | Unusable | Low | Batch training in dream cycles, not real-time |
| Granger causality contradicts STDP (ADR-035) | Conflicting recommendations | Low | Use as complement: STDP real-time, Granger batch |
| 500K+ scale target not met | Performance regression | Medium | R8 solver + R9 sparsification must land together |
| Feature flag proliferation | Config complexity | Low | Group into capability tiers in CLI |
| WASM binary size bloat | Bundle size | Medium | Lazy-load WASM only when feature flag is enabled |
| No pattern citation graph for R8 | Solver has nothing to traverse | High | Design graph schema as prerequisite; bootstrap from usage data |
| SQLite write contention from delta events | DB lock under concurrent agents | Medium | Use WAL mode (already configured); batch delta writes; test with 8 concurrent writers |
| TypeScript fallback performance unacceptable | Features unusable without WASM | Medium | Set explicit fallback perf targets per capability; document minimum acceptable thresholds |
| Concurrent feature flag interactions | Unexpected behavior with multiple flags | Low | Test flag combinations in integration tests; document known interactions |

---

## Decision

Approve the 14-capability Phase 5 integration plan as specified in `docs/implementation/ruvector-improvements-plan.md`, with:

1. All capabilities behind feature flags (default `true` after milestone verification passes; `false` until implemented)
2. TypeScript fallbacks for every WASM/NAPI dependency
3. Milestone-gated rollout (no proceeding until prior milestone passes integration tests)
4. ADR-035 revision acknowledged (Granger as complement to STDP)
5. EWC++ completion (wire production call sites) with 48-hour monitoring window before declaring stable
6. **Prerequisites before Milestone 1**: coherence-gate.ts extraction, performance baseline measurement, pattern citation graph design
7. **Correction**: 9 existing RL algorithms (not 10); e-prop will be #10. Interface is `RLAlgorithm` (not `IRLAlgorithm`)

---

## References

- [RuVector Improvements Plan](../ruvector-improvements-plan.md) — Full implementation plan with milestones and checklists
- [RuVector Integration Plan](../ruvector-integration-plan.md) — Original Phase 1-4 plan (98/124 criteria passing)
- [Issue #355](https://github.com/proffesor-for-testing/agentic-qe/issues/355) — Remaining work tracker
- [ADR Update Summary](./adr-update-summary-ruvector-integration.md) — Phase 1-4 ADR cross-references
- [RuVector Repository](https://github.com/ruvnet/RuVector) — Source crates (113 crates, 9,480 files)
