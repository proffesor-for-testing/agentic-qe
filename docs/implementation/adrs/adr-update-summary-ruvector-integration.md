# ADR Update Summary: RuVector Integration (2026-03-15)

This document summarizes the architectural decisions arising from the comprehensive RuVector ecosystem research (10 research reports) and Six Thinking Hats analysis conducted on 2026-03-15. It identifies which existing ADRs need updates, lists the new ADRs created, and maps the relationships between them.

---

## 1. New ADRs Created

Five new ADRs were created to formalize decisions from the RuVector integration research:

| ADR | Title | Phase | Key Crate | Primary Impact |
|-----|-------|-------|-----------|---------------|
| ADR-081 | Native HNSW Integration via NAPI | Phase 1: Foundation | ruvector-router-ffi | 150x+ vector search speedup |
| ADR-082 | Neural Model Routing with Tiny Dancer | Phase 2: Intelligence | ruvector-tiny-dancer-node | 70-85% model cost reduction |
| ADR-083 | Coherence-Gated Agent Actions | Phase 3: Safety | prime-radiant | Pre-action coherence verification |
| ADR-084 | Cross-Domain Transfer Learning | Phase 2: Intelligence | ruvector-domain-expansion | Knowledge transfer between 13 domains |
| ADR-085 | Temporal Tensor Pattern Compression | Phase 1: Foundation | ruvector-temporal-tensor | 4-10x memory reduction |

### Dependency Chain

```
ADR-081 (Native HNSW) <--- ADR-085 (Compression)
    |                          |
    v                          v
ADR-082 (Neural Routing)   ADR-066 (RVF Pattern Store)
    |                          |
    v                          v
ADR-083 (Coherence Gate)   ADR-073 (Portable Containers)
    |
    v
ADR-084 (Transfer Learning)
```

---

## 2. Existing ADRs Requiring Updates

The following existing ADRs should be updated to reflect the new RuVector integration decisions. Per project convention, the existing ADR files are not modified directly -- instead, the needed changes are documented here for future action.

### ADR-050: RuVector as Primary Neural Backbone
**Status**: Implemented
**Needed Update**: Add references to ADR-081, ADR-082, ADR-083 as concrete implementations of the neural backbone vision. ADR-050 established ruvector as the primary neural backbone but predates the specific native HNSW (ADR-081) and FastGRNN routing (ADR-082) decisions. The Dependencies table should add:
- `Enables -> ADR-081` (Native HNSW replaces JS wrappers around @ruvector/gnn)
- `Enables -> ADR-082` (Neural routing implements the ML-first routing principle)
- `Enables -> ADR-083` (Coherence gating fulfills the "mandatory observability" goal)

**Conflict**: None. ADR-081/082/083 implement ADR-050's vision with concrete technology choices.

### ADR-052: Coherence-Gated QE with Prime Radiant
**Status**: Implemented
**Needed Update**: Add a note that ADR-083 extends coherence checking from system-level (Strange Loop, pattern retrieval) to per-action pre-commit gating. The existing CoherenceService, engine adapters (6 engines, 209 tests), and threshold tuner (39 tests) are reused by ADR-083. The Dependencies table should add:
- `Extended By -> ADR-083` (Per-action coherence gating extends ADR-052's system-level checking)

**Conflict**: None. ADR-083 extends ADR-052's scope without modifying existing integration points.

### ADR-060: Semantic Anti-Drift Protocol
**Status**: Proposed
**Needed Update**: ADR-060 uses HNSW-computed semantic fingerprints for drift detection. With ADR-081, this computation moves from JavaScript HNSW to native ruvector-router-ffi, reducing the ~15ms overhead cited in ADR-060 to sub-millisecond. The embedding computation overhead remains (transformer model inference) but the HNSW lookup portion improves dramatically. Update the performance target from "<15ms overhead per event emission" to reflect native HNSW speedup. Also note that ADR-083's coherence gating provides a complementary signal -- drift detected at event boundaries (ADR-060) vs coherence violation at action boundaries (ADR-083).

**Conflict**: None. ADR-081 improves ADR-060's performance without changing its design.

### ADR-065: RVF Integration Strategy -- Hybrid Architecture
**Status**: In Progress
**Needed Update**: Add references to ADR-081 (native HNSW is the runtime query engine for the RVF INDEX_SEG persistence), ADR-085 (temporal compression reduces RVF file sizes), and update the "Evidence of Hybrid Architecture in Practice" section to note that native HNSW and temporal compression further validate the hybrid approach. The Dependencies table should add:
- `Implemented By -> ADR-081` (Runtime query engine for RVF vector workloads)
- `Implemented By -> ADR-085` (Compression for RVF vector segments)

**Conflict**: None. New ADRs implement components of the hybrid architecture.

### ADR-066: RVF-backed Pattern Store with Progressive HNSW
**Status**: In Progress
**Needed Update**: ADR-081 specifies ruvector-router-ffi as the concrete query engine for ADR-066's progressive 3-layer HNSW. ADR-085 adds temporal compression that works alongside progressive layers -- Layer A (hot, 8-bit), Layer B (warm, 5-bit), Layer C (cold, 3-bit) maps naturally to the temporal tier system. The Implementation section's `RvfPatternStore` adapter should reference ADR-081's `NativeHnswProvider` and ADR-085's `TemporalCompressionService`.

**Conflict**: Minor alignment needed. ADR-066 describes progressive HNSW in terms of recall layers (A/B/C). ADR-085 describes compression in terms of access-pattern tiers (hot/warm/cold). These are complementary but their interaction should be explicitly documented: Layer A contains hot patterns at 8-bit, Layer B adds warm patterns at 5-bit, Layer C includes cold patterns at 3-bit.

### ADR-067: Agent Memory Branching via RVF Copy-on-Write
**Status**: In Progress
**Needed Update**: COW branches created for agent memory isolation will contain compressed embeddings (ADR-085). The branch creation cost is even lower than estimated because compressed cold patterns occupy less space. No design change needed, but the storage cost estimate ("2.5 MB child instead of 512 MB full copy") should be updated to reflect compression.

**Conflict**: None.

### ADR-068: Mincut-Gated Model Routing
**Status**: Implemented
**Needed Update**: ADR-082 supersedes ADR-068's rule-based routing with neural FastGRNN routing. However, ADR-068 is not obsoleted -- the mincut criticality computation it defines becomes one of seven input signals to the neural router. ADR-068's status should be updated from "Implemented" to "Superseded by ADR-082" with a note that the mincut criticality signal (the core contribution of ADR-068) is preserved as a neural router input. The routing formula (`effectiveComplexity = rawComplexity * (1 + criticality * amplificationFactor)`) is replaced by the FastGRNN multi-signal scoring.

**Conflict**: Direct supersession. ADR-082 replaces ADR-068's routing decision logic while preserving its mincut criticality signal as an input. The hand-tuned `amplificationFactor` parameter is eliminated in favor of learned neural weights.

### ADR-069: RVCOW Dream Cycle Branching
**Status**: In Progress
**Needed Update**: ADR-084's cross-domain transfer learning integrates naturally with dream cycles (a `TransferDreamStrategy` is defined in ADR-084). The Dependencies table should add:
- `Relates To -> ADR-084` (Transfer learning can execute within dream branches)
- `Relates To -> ADR-085` (Dream branches contain compressed embeddings)

**Conflict**: None.

### ADR-070: Witness Chain Audit Compliance
**Status**: Implemented (partial)
**Needed Update**: ADR-083 (coherence gating) and ADR-084 (transfer learning) both generate witness chain entries for their respective decisions. The "Integration Points" section should be expanded to include:
- Coherence gate decisions (ADR-083): `coherence-gate-pass`, `coherence-gate-block`
- Transfer learning events (ADR-084): `transfer-approved`, `transfer-rejected`, `transfer-verified`

**Conflict**: None. New ADRs add witness chain integration points.

### ADR-071: HNSW Implementation Unification
**Status**: In Progress
**Needed Update**: ADR-081 specifies the concrete native backend (ruvector-router-ffi via NAPI) that implements ADR-071's unified `HnswIndexProvider` interface. ADR-071's implementation plan should reference ADR-081 as the selected runtime engine. The "Decommission Plan" in ADR-071 becomes actionable once ADR-081 is implemented.

**Conflict**: None. ADR-081 is the implementation decision for ADR-071's interface specification.

### ADR-072: RVF as Primary Persistence Layer -- Migration Strategy
**Status**: Proposed
**Needed Update**: ADR-085's temporal compression reduces the data volume that must be migrated from SQLite to RVF in the Stage 2-4 migration. The "Go/No-Go Criteria" for Stage 3 should add: "Compressed embeddings transfer correctly between SQLite BLOB storage and RVF VEC_SEG." Also add dependency on ADR-085.

**Conflict**: None.

### ADR-073: Portable Intelligence Containers
**Status**: Implemented (partial)
**Needed Update**: ADR-085's compression directly benefits portable containers by reducing .rvf file sizes by 4-10x. ADR-084's transfer learning is a key consumer of portable containers -- a container from one organization can seed another's domains via the transfer engine. The Dependencies table should add:
- `Benefits From -> ADR-085` (Compressed containers are 4-10x smaller)
- `Consumed By -> ADR-084` (Transfer learning imports containers for cross-domain seeding)

**Conflict**: None.

### ADR-074: Loki-Mode Adversarial Quality Gates
**Status**: Accepted
**Needed Update**: ADR-082's neural routing consumes ADR-074's EMA calibration weights as a neural input signal. ADR-074's auto-escalation mechanism feeds the neural router's failure-learning loop. The Dependencies table should add:
- `Consumed By -> ADR-082` (EMA calibration and auto-escalation signals feed neural router)

Also note that ADR-083's coherence gating provides a mathematically grounded complement to ADR-074's heuristic-based sycophancy detection. The two systems address different failure modes: ADR-074 catches consensus rubber-stamping and hollow test generation; ADR-083 catches logical contradictions between agent outputs and existing knowledge.

**Conflict**: None. Complementary systems.

### ADR-047: MinCut Self-Organizing QE
**Status**: Implemented
**Needed Update**: ADR-082 uses ADR-047's mincut algorithms as an input signal for neural routing. The Dependencies table should add:
- `Consumed By -> ADR-082` (MinCut criticality signal feeds neural router)

**Conflict**: None. ADR-047's mincut computation is reused, not replaced.

### ADR-030: Coherence-Gated Quality Gates
**Status**: Accepted
**Needed Update**: ADR-083 extends the coherence gating concept from quality gates (ADR-030) to all agent actions. ADR-030 uses lambda-coherence metrics with a 4-tier response system. ADR-083 uses sheaf Laplacian energy with a similar 4-tier compute ladder (Reflex/Retrieval/Heavy/Human). The two should be cross-referenced as applying the same principle at different granularities.

**Conflict**: None. ADR-083 extends the pattern to a broader scope.

---

## 3. Cross-Cutting Observations

### No Existing ADRs Are Obsoleted

All five new ADRs extend or refine existing decisions rather than invalidating them. The closest to a supersession is ADR-082 replacing ADR-068's routing logic, but even there, ADR-068's core contribution (mincut criticality as a routing signal) is preserved.

### Phase Alignment with Six Thinking Hats Roadmap

The new ADRs align with the phased roadmap from the Six Thinking Hats analysis:

| Phase | Weeks | ADRs | Focus |
|-------|-------|------|-------|
| Phase 1: Foundation | 1-3 | ADR-081 (Native HNSW), ADR-085 (Compression) | Make what we have faster |
| Phase 2: Intelligence | 4-6 | ADR-082 (Neural Routing), ADR-084 (Transfer Learning) | Make agents smarter |
| Phase 3: Safety | 7-9 | ADR-083 (Coherence Gate) | Make agents trustworthy |
| Phase 4: Differentiation | 10-14 | (Future ADRs) | Make AQE unique |

### Data Protection Alignment

ADR-085 (temporal compression) is the only new ADR that modifies existing data (the 150K+ pattern database). Its migration protocol follows CLAUDE.md's data protection mandate:
- Backup before any operation (`cp memory.db memory.db.bak-$(date +%s)`)
- Batch processing with per-batch verification
- Integrity checks after operations
- Rollback capability at every step

### Integration Complexity Budget

The five new ADRs add five new ruvector crate dependencies:

| Crate | Type | Size Impact | Required By |
|-------|------|-------------|-------------|
| @ruvector/router-node | NAPI (native) | ~5-15MB per platform | ADR-081 |
| @ruvector/tiny-dancer-node | NAPI (native) | ~2-5MB per platform | ADR-082 |
| prime-radiant-advanced-wasm | WASM | ~1-3MB | ADR-083 (already in ADR-052) |
| ruvector-domain-expansion | NAPI or WASM | ~2-5MB | ADR-084 |
| ruvector-temporal-tensor | WASM or pure Rust | <1MB | ADR-085 |

Total additional dependency weight: ~10-29MB. All crates have fallback strategies (JavaScript implementations) for environments where native binaries are unavailable.

---

## 4. Relationship Diagram

```
                    ┌─────────────────────────┐
                    │     MADR-001             │
                    │ V3 Implementation        │
                    └─────────┬───────────────┘
                              │
            ┌─────────────────┼─────────────────────┐
            │                 │                       │
    ┌───────┴───────┐  ┌─────┴──────┐  ┌────────────┴───────────┐
    │ ADR-050       │  │ ADR-065    │  │ ADR-052                │
    │ Neural        │  │ Hybrid     │  │ Coherence-Gated QE     │
    │ Backbone      │  │ Arch       │  │ (Prime Radiant)        │
    └───┬───┬───────┘  └──┬────┬───┘  └──────┬─────────────────┘
        │   │             │    │              │
        │   │    ┌────────┘    │              │
        │   │    │             │              │
   ┌────┴───┴────┴─┐   ┌──────┴──────┐  ┌───┴───────────────────┐
   │ *ADR-081*     │   │ ADR-066     │  │ *ADR-083*             │
   │ Native HNSW   │   │ RVF Pattern │  │ Coherence-Gated       │
   │ (NAPI)        │◄──┤ Store       │  │ Agent Actions          │
   └───────┬───────┘   └──────┬──────┘  └───────┬───────────────┘
           │                  │                  │
   ┌───────┴───────┐  ┌──────┴──────┐  ┌───────┴───────────────┐
   │ *ADR-085*     │  │ ADR-071     │  │ *ADR-084*             │
   │ Temporal      │  │ HNSW        │  │ Cross-Domain           │
   │ Compression   │  │ Unification │  │ Transfer Learning      │
   └───────────────┘  └─────────────┘  └───────────────────────┘

           ┌───────────────┐
           │ ADR-068       │  ◄── Superseded by ADR-082
           │ Mincut Routing│      (criticality signal preserved)
           └───────┬───────┘
                   │
           ┌───────┴───────┐
           │ *ADR-082*     │
           │ Neural Routing│
           │ (Tiny Dancer) │
           └───────────────┘

   * = New ADR created in this analysis
```

---

## 5. Next Steps

1. **Review and approve** ADRs 081-085 through the Architecture Team review process
2. **Update existing ADRs** per the changes documented in Section 2 (create a follow-up task)
3. **Begin Phase 1 implementation** (ADR-081, ADR-085) as these are foundation changes with the lowest risk
4. **Plan A/B test infrastructure** for ADR-082 (neural routing requires controlled experimentation)
5. **Calibrate coherence thresholds** for ADR-083 across all 13 DDD domains
6. **Identify pilot domain pair** for ADR-084 (e.g., test-generation to api-testing) for initial transfer learning validation
