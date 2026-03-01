# ADR-069: RVCOW Branching for Reversible Dream Cycles

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-069 |
| **Status** | Proposed |
| **Date** | 2026-02-22 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's Dream Engine (ADR-046), which performs offline consolidation of learned patterns -- replaying experiences, pruning weak patterns, strengthening correlations, and generating hypothetical test scenarios -- as an irreversible write to the shared knowledge base,

**facing** the risk that a dream cycle that consolidates bad data (e.g., patterns learned from a flaky infrastructure period, or overfitting to a temporary codebase state) permanently degrades the knowledge base with no rollback path, forcing manual intervention to identify and revert corrupted patterns from the 150K+ record memory.db,

**we decided for** wrapping each dream cycle execution in an RVCOW (RVF Copy-on-Write) branch, where the Dream Engine operates on an isolated .rvf snapshot of the knowledge base, validates consolidation results against quality thresholds before merging, and discards the branch at zero cost if validation fails,

**and neglected** (a) continuing with irreversible dream cycles (rejected: a single bad consolidation can degrade thousands of patterns with no undo), (b) SQLite savepoints for dream rollback (rejected: savepoints lock the database for the duration of the dream cycle, blocking all concurrent agents, and do not support parallel speculative dreams), (c) full database backup before each dream cycle (rejected: copying 150K+ records takes seconds and doubles storage per dream),

**to achieve** zero-risk dream experimentation where bad consolidations are discarded without touching the production knowledge base, parallel speculative dreaming where multiple dream strategies execute on separate branches simultaneously, and a cryptographic audit trail of which dream-derived patterns were merged and why,

**accepting that** this depends on ADR-065 and ADR-066 being implemented first, dream cycles must operate on RVF-backed pattern data (not raw SQLite), and the merge-back step adds latency to dream completion (estimated 50-200ms for typical consolidation sizes).

---

## Context

The Dream Engine is AQE's offline learning consolidation system. During low-activity periods, it replays recent experiences, identifies pattern correlations, prunes patterns with declining confidence, and generates hypothetical scenarios to fill coverage gaps. This is analogous to biological memory consolidation during sleep.

Currently, dream cycles write directly to the shared knowledge base. Every pattern modification, confidence adjustment, and correlation discovery is immediately committed. If the dream cycle produces bad results -- for example, if it overfits to a temporary spike in flaky test data, or if it incorrectly prunes a pattern that was failing due to infrastructure issues (not pattern quality) -- the damage is done. Reverting requires manually identifying which of potentially hundreds of modifications were bad, a forensic task that is impractical at scale.

ADR-067 established RVCOW branching for agent memory isolation. This ADR extends the same mechanism specifically to dream cycles, with additional requirements:

1. **Validation gate**: Unlike agent branches (which merge on task success), dream branches must pass quality validation -- the consolidated knowledge must demonstrably improve pattern recall, reduce false positives, or increase coverage relative to the pre-dream baseline.
2. **Parallel speculation**: Multiple dream strategies (aggressive pruning, conservative strengthening, hypothetical generation) can execute on separate branches simultaneously. The best-performing branch is merged; others are discarded.
3. **Witness attestation**: The WITNESS_SEG records which dream strategy produced the merged patterns, enabling post-hoc analysis of dream effectiveness.

### Dream Cycle Lifecycle with RVCOW

```
1. Dream trigger (idle period detected)
2. Create RVCOW branch from production .rvf
3. Execute dream consolidation on branch
4. Validate: compare branch recall/precision against production baseline
5a. Validation passes -> merge branch to production, record in WITNESS_SEG
5b. Validation fails -> discard branch (delete file, zero cost)
```

---

## Options Considered

### Option 1: RVCOW-Branched Dream Cycles with Validation Gate (Selected)

Each dream cycle operates on a COW branch. A validation gate compares dream results against production baselines before allowing merge. Failed dreams are discarded at zero cost. Multiple dreams can run in parallel on separate branches.

**Pros:**
- Zero-risk experimentation: bad dreams never touch production
- Parallel speculation: try multiple strategies, keep the best
- Cryptographic audit trail for dream-derived knowledge
- Negligible storage cost (COW only copies modified segments)
- Enables aggressive dream strategies that would be too risky with irreversible writes

**Cons:**
- Requires ADR-065 and ADR-066 to be implemented first
- Validation gate design requires defining "better" (recall, precision, coverage)
- Merge latency adds 50-200ms to dream completion
- Parallel dreams on the same base may produce conflicting merges

### Option 2: Irreversible Dream Cycles (Status Quo, Rejected)

Continue writing dream results directly to the production knowledge base.

**Why rejected:** A single bad dream cycle can corrupt thousands of patterns. With 150K+ records, forensic identification of dream-corrupted patterns is impractical. The asymmetric learning rates (ADR-061) help quarantine individual bad patterns but cannot undo a systemic consolidation error that shifts the confidence distribution.

### Option 3: SQLite Savepoints for Dream Rollback (Rejected)

Use SQLite BEGIN/SAVEPOINT before dream execution, ROLLBACK on failure.

**Why rejected:** Savepoints hold a write lock on the database for the duration of the dream cycle (which can run for minutes during deep consolidation). This blocks all concurrent agents from writing patterns. Additionally, savepoints do not support parallel speculative execution -- only one transaction can be active at a time on a single connection.

### Option 4: Full Database Backup Before Each Dream (Rejected)

Copy the entire memory.db before each dream cycle. Restore on failure.

**Why rejected:** The memory.db contains 150K+ records and occupies significant disk space. Copying the full database takes seconds and doubles storage. Restore requires stopping all agents to swap the file. Does not support parallel speculation.

---

## Implementation

### Dream Branch Manager

```typescript
// v3/src/learning/dream/dream-branch-manager.ts
interface DreamBranchManager {
  /** Create an RVCOW branch for a dream cycle */
  createDreamBranch(
    dreamId: string,
    strategy: DreamStrategy
  ): Promise<DreamBranchHandle>;

  /** Validate dream results against production baseline */
  validateDream(
    handle: DreamBranchHandle,
    baseline: QualityBaseline
  ): Promise<DreamValidationResult>;

  /** Merge validated dream branch to production */
  mergeDream(handle: DreamBranchHandle): Promise<MergeResult>;

  /** Discard a failed dream branch */
  discardDream(handle: DreamBranchHandle): Promise<void>;

  /** Execute parallel speculative dreams, merge the best */
  speculativeDream(
    strategies: DreamStrategy[],
    baseline: QualityBaseline
  ): Promise<SpeculativeDreamResult>;
}

interface DreamValidationResult {
  passed: boolean;
  recallDelta: number;      // Change in pattern recall vs baseline
  precisionDelta: number;   // Change in pattern precision vs baseline
  patternsModified: number; // Count of patterns changed by dream
  patternsCreated: number;  // Count of hypothetical patterns generated
  patternsPruned: number;   // Count of patterns removed by dream
  reason: string;           // Human-readable validation summary
}

type DreamStrategy =
  | 'aggressive-pruning'      // Remove all patterns below confidence threshold
  | 'conservative-strengthen' // Only boost high-confidence patterns
  | 'hypothetical-generation' // Generate new patterns from experience replay
  | 'correlation-discovery'   // Find cross-domain pattern correlations
  | 'balanced';               // Default: moderate pruning + strengthening
```

### Validation Gate

```typescript
// v3/src/learning/dream/dream-validation-gate.ts
interface DreamValidationGate {
  /**
   * Compare dream branch quality against production baseline.
   * Dream passes if:
   * - Recall does not decrease by more than 2%
   * - Precision improves or stays within 1%
   * - No more than 5% of high-confidence patterns are pruned
   */
  validate(
    dreamBranch: RvfDatabase,
    productionBaseline: QualityBaseline,
    thresholds: ValidationThresholds
  ): Promise<DreamValidationResult>;
}

interface ValidationThresholds {
  maxRecallDrop: number;       // Default: 0.02 (2%)
  maxPrecisionDrop: number;    // Default: 0.01 (1%)
  maxHighConfidencePrune: number; // Default: 0.05 (5%)
}
```

### Integration with Existing Dream Engine

The existing Dream Engine (ADR-046) calls pattern store methods directly. The integration wraps these calls with branch management:

```typescript
class RvcowDreamEngine extends DreamEngine {
  async executeDreamCycle(): Promise<DreamResult> {
    const baseline = await this.captureBaseline();
    const handle = await this.branchManager.createDreamBranch(
      generateDreamId(),
      this.currentStrategy
    );

    try {
      // Execute dream on branch (all writes go to COW branch)
      await super.executeDreamCycle(handle.branchedPatternStore);

      // Validate before merging
      const validation = await this.branchManager.validateDream(handle, baseline);
      if (validation.passed) {
        await this.branchManager.mergeDream(handle);
        return { status: 'merged', validation };
      } else {
        await this.branchManager.discardDream(handle);
        return { status: 'discarded', validation };
      }
    } catch (error) {
      await this.branchManager.discardDream(handle);
      throw error;
    }
  }
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | Requires RVF as established persistence layer |
| Depends On | ADR-066 | RVF-backed Pattern Store with Progressive HNSW | Dream cycles operate on RVF-backed patterns |
| Extends | ADR-067 | Agent Memory Branching via RVF COW | Extends COW branching from agents to dream cycles |
| Depends On | ADR-046 | V2 Feature Integration | Dream Engine implementation |
| Relates To | ADR-061 | Asymmetric Learning Rates | Dream validation complements Hebbian quarantine |
| Relates To | ADR-021 | ReasoningBank | Dream cycles consolidate ReasoningBank patterns |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration Phase 1 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF COW Branching | Technical Spec | @ruvector/rvf package documentation |
| INT-001 | Dream Engine | Existing Code | `v3/src/learning/dream/` |
| INT-002 | PatternStore | Existing Code | `v3/src/learning/pattern-store.ts` |
| INT-003 | ReasoningBank | Existing Code | `v3/src/learning/reasoning-bank.ts` |
| INT-004 | Quality Baselines | Existing Code | `v3/src/quality/` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-22 | Proposed | 2026-08-22 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-22 | Initial creation. RVCOW branching for reversible dream cycles with validation gates and parallel speculation. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Approach validated (PoC, prior art, or expert input)
- [ ] **C - Criteria**: At least 2 options compared systematically
- [ ] **A - Agreement**: Relevant stakeholders consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: All relationships documented with typed relationships
- [ ] **Rf - References**: Implementation details in SPEC files, all links valid
- [ ] **M - Master**: Linked to Master ADR if part of larger initiative
