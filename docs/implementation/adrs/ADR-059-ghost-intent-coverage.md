# ADR-059: Ghost Intent Coverage Analysis

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-059 |
| **Status** | Proposed |
| **Date** | 2026-02-06 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Analysis Method** | Six Thinking Hats (AISP Integration Review) |
| **Conceptual Inspiration** | [AISP 5.1 Ghost Intent Search](https://github.com/bar181/aisp-open-core) |

---

## WH(Y) Decision Statement

**In the context of** the coverage-analysis bounded context (ADR-003) which currently detects gaps by scanning what IS covered and finding what falls below thresholds,

**facing** the fundamental limitation that threshold-based gap detection only finds known unknowns (low coverage files) but cannot identify unknown unknowns (behaviors that SHOULD have tests but don't even have code paths),

**we decided for** implementing a Ghost Intent Coverage primitive that computes `PhantomSurface = IdealTestSurface - ActualTestSurface` using HNSW vector operations, inverting the coverage paradigm from "find what's poorly covered" to "find what's missing entirely",

**and neglected** (a) importing AISP as a dependency (rejected: notation overhead, token cost), (b) simple heuristic-based gap detection (rejected: only finds known coverage holes), (c) LLM-only approach without vector math (rejected: non-deterministic, expensive per invocation),

**to achieve** discovery of phantom test surfaces — missing error handlers, absent boundary validations, unprotected state transitions, and missing integration contracts that no existing coverage metric detects,

**accepting that** the "ideal test surface" is a learned approximation from ReasoningBank patterns (not ground truth), requiring sufficient pattern history to be accurate, and that the ghost vector computation adds ~50ms overhead to gap detection.

---

## Context

Current coverage analysis (ADR-003) uses HNSW indexing for O(log n) gap detection, but it operates within a "scan what exists" paradigm. When `detectGaps()` runs, it finds files with low line/branch/function coverage. This is valuable but fundamentally limited: it can only find gaps in code that EXISTS. It cannot discover that an entire error handling path, integration boundary, or state machine transition is absent from the codebase.

AISP 5.1's Ghost Intent Search (`psi_g = psi_* - psi_have`) introduced a mathematically principled approach: compute the vector difference between a target state and current state to find the "ghost" — what's needed but not present. This concept maps directly to QE coverage analysis: if we can represent the "ideal test surface" for a codebase as a vector space, we can compute the phantom surface (what SHOULD be tested but isn't) via vector subtraction in HNSW space.

This ADR does NOT import AISP notation or packages. It implements the ghost intent concept natively in TypeScript, integrated with existing HNSW infrastructure (ADR-003, ADR-038) and ReasoningBank pattern learning (ADR-021).

---

## Options Considered

### Option 1: Native Ghost Intent via HNSW Vector Subtraction (Selected)

Implement `GhostCoverageAnalyzer` as a new service in the coverage-analysis domain. It uses ReasoningBank's learned patterns to construct an "ideal test surface" embedding, then computes the ghost vector against actual coverage embeddings in HNSW space. Returns `PhantomGap[]` — test gaps for code that doesn't exist yet.

**Pros:**
- Discovers unknown unknowns (missing error handlers, absent integrations)
- Builds on existing HNSW + ReasoningBank infrastructure
- Improves over time as ReasoningBank accumulates more patterns
- O(log n) complexity using existing HNSW index
- Zero external dependencies

**Cons:**
- Requires sufficient pattern history (~100+ patterns) for accurate ideal surface
- Ghost vectors are approximations, not ground truth
- Cold-start problem: new projects with no history produce noisy results

### Option 2: Import AISP Library Directly (Rejected)

Use `aisp-validator` and `aisp-converter` npm packages to implement ghost intent search with AISP's full symbolic notation.

**Why rejected:** 8,817 tokens per compilation, 512-symbol vocabulary overhead, external dependency risk. The concept is valuable; the notation is not needed for QE.

### Option 3: LLM-Based Gap Inference (Rejected)

Use an LLM to analyze code and suggest missing test scenarios without vector math.

**Why rejected:** Non-deterministic results, high per-invocation cost (Tier 3 routing required), no mathematical convergence guarantee. Better as a complement to ghost intent, not a replacement.

---

## Technical Design

### Core Interfaces

```typescript
// New service in coverage-analysis domain
interface GhostCoverageAnalyzer {
  /** Compute phantom test surface — what SHOULD exist but DOESN'T */
  computePhantomSurface(request: PhantomSurfaceRequest): Promise<Result<PhantomSurface, Error>>;

  /** Get specific phantom gaps ranked by risk */
  detectPhantomGaps(request: PhantomGapRequest): Promise<Result<PhantomGap[], Error>>;

  /** Update ideal surface model from new patterns */
  updateIdealSurface(patterns: QEPattern[]): Promise<void>;
}

interface PhantomSurfaceRequest {
  /** Current coverage data */
  actualCoverage: CoverageData;
  /** Project context for ideal surface lookup */
  projectContext: ProjectContext;
  /** Minimum confidence threshold for phantom gaps */
  minConfidence?: number; // default 0.6
}

interface PhantomGap {
  /** Category of missing test surface */
  category: 'missing-error-handler' | 'absent-boundary-validation' |
            'unprotected-state-transition' | 'missing-integration-contract' |
            'absent-edge-case' | 'missing-security-check';
  /** Description of what should exist */
  description: string;
  /** File/module most likely to need this */
  suggestedLocation: string;
  /** Confidence that this gap is real (0-1) */
  confidence: number;
  /** Ghost vector distance from ideal surface */
  ghostDistance: number;
  /** Risk score if this phantom gap is exploited */
  riskScore: number;
}

interface PhantomSurface {
  /** Total phantom gaps discovered */
  totalGaps: number;
  /** Gaps by category */
  gapsByCategory: Map<string, PhantomGap[]>;
  /** Overall phantom surface area (0-1, lower is better) */
  phantomRatio: number;
  /** Ideal surface confidence (how reliable is the model) */
  idealSurfaceConfidence: number;
}
```

### Ghost Vector Computation

```typescript
// Core algorithm (conceptual, inspired by AISP psi_g = psi_* - psi_have)
async computeGhostVector(
  actualEmbedding: Float32Array,
  idealEmbedding: Float32Array
): Promise<Float32Array> {
  const ghost = new Float32Array(actualEmbedding.length);
  for (let i = 0; i < ghost.length; i++) {
    ghost[i] = idealEmbedding[i] - actualEmbedding[i];
  }
  // Normalize ghost vector
  const norm = Math.sqrt(ghost.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < ghost.length; i++) ghost[i] /= norm;
  }
  return ghost;
}
```

### Integration Points

| Component | Integration |
|-----------|-------------|
| `hnsw-index.ts` (ADR-003) | Store ideal surface embeddings, query ghost vectors |
| `coverage-embedder.ts` (ADR-003) | Embed actual coverage as vectors |
| `real-qe-reasoning-bank.ts` (ADR-021) | Source learned patterns for ideal surface construction |
| `sublinear-analyzer.ts` (ADR-003) | New `findPhantomGaps()` method |
| `gap-detector.ts` (existing) | Extended with phantom gap category |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-003 | Sublinear Coverage Analysis | HNSW index and coverage embedder |
| Depends On | ADR-021 | ReasoningBank Pattern Learning | Ideal surface model from patterns |
| Depends On | ADR-038 | Memory System Unification | AgentDB + HNSW backend |
| Relates To | ADR-005 | AI-First Test Generation | Ghost gaps feed into test generation |
| Relates To | ADR-030 | Coherence-Gated Quality Gates | Phantom ratio as quality gate metric |
| Relates To | ADR-052 | Coherence-Gated QE | Lambda-coherence on phantom surface |
| Part Of | MADR-001 | V3 Implementation Initiative | Phase 13 enhancement |

---

## Success Metrics

- [ ] `GhostCoverageAnalyzer` service implemented in coverage-analysis domain
- [ ] >80% of phantom gaps validated as genuine missing test surfaces (on 3+ reference projects)
- [ ] <100ms ghost vector computation on codebases up to 10,000 files
- [ ] Integration with test-generation domain: phantom gaps auto-generate test stubs
- [ ] PhantomRatio metric added to quality gate evaluation
- [ ] 40+ unit tests covering ghost vector math, ideal surface construction, cold-start behavior

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | AISP 5.1 Ghost Intent Search | Conceptual Inspiration | [aisp-open-core](https://github.com/bar181/aisp-open-core) |
| INT-001 | Coverage Analysis Domain | Existing Code | `v3/src/domains/coverage-analysis/` |
| INT-002 | ReasoningBank | Existing Code | `v3/src/learning/real-qe-reasoning-bank.ts` |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-06 | Created from Six Thinking Hats AISP analysis. Concept from AISP ghost intent; native implementation. |
