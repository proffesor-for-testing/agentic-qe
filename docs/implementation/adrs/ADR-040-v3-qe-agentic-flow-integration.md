# ADR-040: Agentic-Flow Deep Integration

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-040 |
| **Status** | Implemented |
| **Date** | 2026-01-11 |
| **Author** | Claude Code |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** V3 QE requiring deep learning capabilities for intelligent test automation across 12 DDD domains,

**facing** need for SONA learning mode for adaptive pattern recognition, Flash Attention optimizations for attention-heavy workloads, extended RL algorithm support (9 algorithms for diverse QE scenarios), and unified embedding infrastructure with HNSW indexing,

**we decided for** implementing QE wrapper layers for @ruvector packages (sona, attention, gnn) while preserving existing QE implementations for backward compatibility, with all 8 RL algorithms connected to specific domains,

**and neglected** building all learning infrastructure from scratch, using only external packages without QE wrappers, and waiting for GPU/CUDA support before implementing,

**to achieve** native Rust/NAPI performance (0.0099ms cached pattern retrieval - 5x faster than target), feature parity with @ruvector ecosystem, reduced maintenance burden, and 12/12 domains with RL algorithm integration,

**accepting that** WASM-SIMD Flash Attention does not meet speedup targets (4/5 workloads slower than baseline), incremental migration is required for existing code, and dual codepaths increase maintenance during transition.

---

## Context

V3 QE required deep learning capabilities for intelligent test automation. External packages available: `@ruvector/sona` (v0.1.5) with Rust/NAPI SONA, LoRA, EWC++, ReasoningBank; `@ruvector/attention` (v0.1.4) with SIMD-accelerated Flash Attention and 7 mathematical theories; `@ruvector/gnn` (v0.1.22) with Rust NAPI HNSW and differentiable search.

The integration approach added QE wrapper layers in `src/integrations/ruvector/` maintaining backward compatibility with existing QE interfaces while leveraging high-performance Rust/NAPI implementations. All 12 domains now have RL algorithm integration complete with 3,612 passing tests.

---

## Options Considered

### Option 1: QE Wrapper Layers for @ruvector (Selected)

Implement QE-specific wrappers around @ruvector packages while preserving existing implementations.

**Pros:** Native Rust/NAPI performance, feature parity, reduced maintenance, backward compatible
**Cons:** Dual codepaths during migration, API differences require adaptation

### Option 2: Build From Scratch (Rejected)

Implement all learning infrastructure without external packages.

**Why rejected:** Massive development effort; would not achieve native Rust performance.

### Option 3: Direct Package Usage (Rejected)

Use @ruvector packages directly without QE wrapper layers.

**Why rejected:** No QE-specific patterns; would break existing code; no backward compatibility.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Learning infrastructure phase |
| Enables | ADR-042 | Token Tracking | Uses SONA for pattern learning |
| Relates To | ADR-037 | V3 QE Agent Naming | Agent naming conventions |
| Relates To | ADR-038 | Memory Unification | Integrates with unified memory |
| Relates To | ADR-039 | MCP Optimization | Optimizes MCP handlers |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-040-A | Ruvector Wrappers | Technical Spec | [specs/SPEC-040-A-ruvector-wrappers.md](../specs/SPEC-040-A-ruvector-wrappers.md) |
| SPEC-040-B | RL Algorithm Distribution | Implementation Guide | [specs/SPEC-040-B-rl-algorithm-distribution.md](../specs/SPEC-040-B-rl-algorithm-distribution.md) |
| SPEC-040-C | Performance Assessment | Status Report | [specs/SPEC-040-C-performance-assessment.md](../specs/SPEC-040-C-performance-assessment.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-11 | Approved | 2026-07-11 |
| Architecture Team | 2026-01-13 | Implemented | 2026-07-13 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-11 | Initial creation |
| Approved | 2026-01-11 | Architecture review passed |
| Implemented | 2026-01-13 | 12/12 domains complete with RL integration |
