# SPEC-040-A: Ruvector Wrappers

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-040-A |
| **Parent ADR** | [ADR-040](../adrs/ADR-040-v3-qe-agentic-flow-integration.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-13 |
| **Author** | Claude Code |

---

## Overview

Defines the QE wrapper layers for @ruvector packages: QESONA, QEFlashAttention, and QEGNNEmbeddingIndex. These wrappers provide QE-specific functionality while leveraging high-performance Rust/NAPI implementations.

---

## Specification Details

### Section 1: @ruvector/sona Integration

```typescript
// ruvector/sona-wrapper.ts (890 lines, 37 tests)
import { createQESONA } from './integrations/ruvector/wrappers';

// Create SONA with @ruvector/sona backend
const sona = createQESONA({
  hiddenDim: 256,
  microLoraRank: 1,
  baseLoraRank: 8,
  ewcLambda: 1000.0
});

// Adapt pattern using Rust/NAPI implementation
const result = await sona.adaptPattern(state, 'test-generation', 'test-generation');

// Apply LoRA transformations
const adapted = sona.applyMicroLora(inputVector);
const layerAdapted = sona.applyBaseLora(0, inputVector);

// Force learning cycle
const learnResult = sona.forceLearn();
```

**Features:**
- LoRA transformations: MicroLoRA (rank 1-2) + BaseLoRA (rank 8)
- EWC++ for catastrophic forgetting prevention
- Pattern learning via trajectories: `beginTrajectory`, `addTrajectoryStep`, `endTrajectory`
- HNSW-indexed pattern search via `findPatterns`
- Background learning with configurable intervals

**QE-specific pattern types:**
- test-generation
- defect-prediction
- coverage-optimization
- quality-assessment
- resource-allocation

### Section 2: @ruvector/attention Integration

```typescript
// ruvector/attention-wrapper.ts (620 lines, 31 tests)
import { createQEFlashAttention } from './integrations/ruvector/wrappers';

// Create Flash Attention with specific strategy
const fa = await createQEFlashAttention('test-similarity', {
  strategy: 'flash',
  dim: 384,
  blockSize: 64
});

// Compute attention using SIMD-accelerated Rust
const output = await fa.computeFlashAttention(Q, K, V, seqLen, dim);

// Change to different attention strategy
fa.changeStrategy('hyperbolic');
```

**Supports 7 attention strategies from Rust/NAPI:**
- Flash Attention (memory-efficient)
- Dot Product Attention
- Multi-Head Attention
- Hyperbolic Attention (Poincare ball manifold)
- Linear Attention (O(n) complexity)
- MoE (Mixture of Experts) Attention

**QE workload optimization:**
- test-similarity
- code-embedding
- defect-matching
- coverage-analysis
- pattern-adaptation

### Section 3: @ruvector/gnn Integration

```typescript
// ruvector/gnn-wrapper.ts (310 lines, 13 tests)
import { QEGNNEmbeddingIndex } from './integrations/ruvector/wrappers';

// Create index with differentiable search
const index = new QEGNNEmbeddingIndex({ dimension: 384 });
index.initializeIndex('code');

// Differentiable search with soft weights (gradient-friendly)
const result = index.differentiableSearchWithWeights(
  query,
  candidates,
  k = 5,
  temperature = 1.0
);

// Compress embeddings based on access frequency
const compressed = index.compressEmbedding(embedding, 0.9); // hot data
const coldCompressed = index.compressEmbedding(embedding, 0.1); // cold data
```

**Features:**
- Differentiable search with soft weights (gradient-friendly for RL)
- `RuvectorLayer` for hierarchical feature extraction
- `TensorCompress` for adaptive embedding compression
- Compression levels: none, half, pq8, pq4, binary (based on access frequency)

### Section 4: Wrapper Summary

| Component | Path | Lines | Tests | Description |
|-----------|------|-------|-------|-------------|
| SONA Wrapper | `ruvector/sona-wrapper.ts` | 890 | 37 | QESONA class wrapping @ruvector/sona |
| Attention Wrapper | `ruvector/attention-wrapper.ts` | 620 | 31 | QEFlashAttention wrapping @ruvector/attention |
| GNN Wrapper | `ruvector/gnn-wrapper.ts` | 310 | 13 | QEGNNEmbeddingIndex wrapping @ruvector/gnn |
| Wrappers Export | `ruvector/wrappers.ts` | 50 | - | Unified export of all @ruvector wrappers |
| **Total** | - | **1,870** | **81** | **Real integration tests** |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-040-A-001 | All wrappers must maintain backward compatibility | Error |
| SPEC-040-A-002 | Integration tests must use real native packages (no mocks) | Error |
| SPEC-040-A-003 | Wrappers must gracefully handle missing binaries | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-040-B | RL Algorithm Distribution | Uses wrappers |
| SPEC-040-C | Performance Assessment | Measures wrapper performance |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-13 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-040-v3-qe-agentic-flow-integration.md)
- @ruvector/sona documentation
- @ruvector/attention documentation
- @ruvector/gnn documentation
