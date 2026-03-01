# ADR-072: RVF as Primary Persistence Layer -- Migration Strategy

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-072 |
| **Status** | Proposed |
| **Date** | 2026-02-22 |
| **Author** | Architecture Team |
| **Review Cadence** | 3 months (active migration) |

---

## WH(Y) Decision Statement

**In the context of** ADR-065's hybrid architecture decision where SQLite handles relational workloads and RVF handles vector workloads, creating a dual-persistence system that is operational but adds ongoing complexity in data consistency, backup procedures, monitoring, and developer experience,

**facing** the long-term cost of maintaining two persistence engines (two backup strategies, two monitoring dashboards, two failure modes, two sets of expertise), the inability to leverage RVF's full capabilities (COW branching, witness chains, progressive HNSW) for data that remains in SQLite, and the risk that the "temporary" hybrid architecture becomes permanent technical debt,

**we decided for** a phased migration strategy that promotes RVF from complementary to primary persistence over three stages -- Stage 1: dual-write where both engines receive all writes and SQLite remains the source of truth, Stage 2: dual-write with RVF as source of truth and SQLite as fallback, Stage 3: RVF-only with SQLite adapter available as an emergency escape hatch -- with explicit go/no-go criteria at each stage gate,

**and neglected** (a) remaining on hybrid permanently (rejected: doubles operational burden indefinitely and prevents full RVF capability utilization), (b) big-bang cutover from SQLite to RVF (rejected: unacceptable risk for 150K+ irreplaceable learning records), (c) migrating only vector data and keeping SQLite for everything else forever (rejected: this is the ADR-065 interim state, which has known operational costs),

**to achieve** eventual single-engine simplicity where all AQE data lives in RVF with a unified backup, monitoring, and versioning story, full utilization of RVF capabilities (witness chains, COW branching) for all data types, and a reversible migration path where any stage can be rolled back to the previous stage without data loss,

**accepting that** the full migration spans an estimated 10-16 weeks, requires RVF to prove it can handle relational-style queries (KV lookups, Q-value scans, CRDT operations) with acceptable performance, and the escape hatch SQLite adapter must be maintained even after RVF becomes primary to provide a recovery path.

---

## Context

ADR-065 established the hybrid architecture as the correct initial approach: let each engine handle what it does best. This was the right decision for Phase 1 because it de-risked the RVF adoption. However, hybrid architectures have a well-documented tendency to become permanent, accumulating the costs of both engines without the simplicity benefits of either.

The ongoing costs of dual persistence include:
- **Backup complexity**: Two different backup strategies (SQLite `.backup` API vs RVF file copy with witness chain validation)
- **Consistency risk**: Data written to one engine but not the other during a crash creates divergence
- **Monitoring overhead**: Two health check systems, two alerting rules, two capacity planning models
- **Developer cognitive load**: Contributors must understand both SQLite and RVF internals
- **Partial capabilities**: Data in SQLite cannot benefit from COW branching, witness chains, or progressive indexing

This ADR defines the migration strategy to resolve these costs by promoting RVF to primary. The key principle is **reversibility at every stage**: no stage transition is a one-way door.

### Stage Architecture

```
Stage 0 (Current):  SQLite only
Stage 1 (ADR-065):  SQLite primary + RVF complementary (hybrid)
Stage 2 (This ADR): Dual-write, SQLite source of truth, RVF shadow
Stage 3 (This ADR): Dual-write, RVF source of truth, SQLite fallback
Stage 4 (This ADR): RVF primary, SQLite escape hatch (read-only adapter)
```

---

## Options Considered

### Option 1: Phased Dual-Write Migration with Stage Gates (Selected)

Gradually shift the source of truth from SQLite to RVF through three explicit stages, each with measurable go/no-go criteria. Every stage is reversible.

**Pros:**
- Zero-risk migration: any stage can roll back to previous
- Dual-write validates RVF correctness against SQLite ground truth
- Stage gates prevent premature promotion
- Escape hatch preserves SQLite read path even after full migration
- Data loss is structurally impossible (both engines hold complete data during dual-write)

**Cons:**
- 10-16 week timeline for full migration
- Dual-write doubles write I/O during Stages 2 and 3
- Escape hatch SQLite adapter requires ongoing (minimal) maintenance
- Complexity peak occurs during Stage 3 when both engines are sources of truth for different workloads

### Option 2: Permanent Hybrid Architecture (Rejected)

Accept ADR-065's hybrid as the final state. SQLite for relational, RVF for vectors, forever.

**Why rejected:** Doubles operational burden indefinitely. Prevents using COW branching for non-vector data (e.g., Q-value snapshots, GOAP plan versioning). Prevents using witness chains for relational data mutations. The hybrid was the right interim state but should not become the terminal state.

### Option 3: Big-Bang Cutover (Rejected)

Stop SQLite writes, migrate all data to RVF in a single maintenance window, start RVF writes.

**Why rejected:** A single maintenance window for 150K+ records with zero tolerance for data loss is unacceptable risk. Any migration bug that corrupts RVF data during the window has no fallback. RVF's handling of relational-style queries (which it is not optimized for) has not been validated at scale. The hybrid period exists precisely to build this confidence.

### Option 4: Vector-Only Migration, SQLite Forever for Relational (Rejected)

Only migrate vector data (embeddings, HNSW indexes). Keep SQLite as the permanent home for KV store, Q-values, GOAP plans, hypergraph, and CRDT state.

**Why rejected:** This is the current ADR-065 interim state. It was explicitly designed as a stepping stone. Keeping it permanently means maintaining dual backup, dual monitoring, and dual expertise forever. It also prevents Q-value snapshots from benefiting from COW branching and prevents GOAP plan mutations from being recorded in witness chains.

---

## Implementation

### Stage 2: Dual-Write with SQLite Source of Truth

All writes go to both SQLite and RVF. Reads come from SQLite. RVF is the "shadow" copy validated against SQLite.

```typescript
// v3/src/persistence/dual-write-adapter.ts
class DualWriteAdapter implements PersistenceAdapter {
  constructor(
    private primary: SqlitePersistence,    // Source of truth
    private shadow: RvfPersistence,        // Shadow copy
    private validator: ConsistencyValidator
  ) {}

  async write(key: string, value: unknown): Promise<void> {
    await this.primary.write(key, value);
    try {
      await this.shadow.write(key, value);
    } catch (error) {
      // Shadow write failure is logged but does not fail the operation
      this.validator.recordDivergence(key, 'shadow-write-failed', error);
    }
  }

  async read(key: string): Promise<unknown> {
    return this.primary.read(key); // Always read from source of truth
  }
}
```

**Go/No-Go Criteria for Stage 3:**
- Shadow divergence rate below 0.01% over 7 consecutive days
- RVF read latency within 2x of SQLite for all query types
- Zero data corruption incidents in shadow copy
- Witness chain verification passes with zero invalid entries
- Backup/restore cycle validated for RVF

### Stage 3: Dual-Write with RVF Source of Truth

RVF becomes the source of truth for reads. SQLite continues to receive all writes as fallback.

```typescript
class Stage3Adapter implements PersistenceAdapter {
  constructor(
    private primary: RvfPersistence,       // New source of truth
    private fallback: SqlitePersistence,    // Kept in sync for rollback
    private validator: ConsistencyValidator
  ) {}

  async read(key: string): Promise<unknown> {
    try {
      return await this.primary.read(key);
    } catch (error) {
      // Fallback to SQLite on RVF read failure
      this.validator.recordFallback(key, error);
      return this.fallback.read(key);
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    await this.primary.write(key, value);
    await this.fallback.write(key, value); // Keep SQLite in sync
  }
}
```

**Go/No-Go Criteria for Stage 4:**
- RVF serving 100% of reads with zero fallbacks over 14 consecutive days
- RVF write latency within 1.5x of SQLite for all operation types
- Full backup/restore cycle validated
- COW branching validated for non-vector data (Q-values, GOAP plans)
- Witness chain recording validated for all mutation types
- Performance under peak load (15 agents) validated

### Stage 4: RVF Primary with SQLite Escape Hatch

RVF is the sole persistence engine. SQLite adapter remains available but not active.

```typescript
class Stage4Adapter implements PersistenceAdapter {
  constructor(
    private primary: RvfPersistence,
    private escapeHatch: SqliteEscapeHatch  // Read-only, not receiving writes
  ) {}

  async read(key: string): Promise<unknown> {
    return this.primary.read(key);
  }

  async write(key: string, value: unknown): Promise<void> {
    return this.primary.write(key, value);
  }

  /** Emergency rollback: export RVF to SQLite and switch */
  async activateEscapeHatch(): Promise<void> {
    await this.escapeHatch.importFromRvf(this.primary);
    // Swap adapters: SQLite becomes primary
  }
}
```

### RVF Relational Query Support

For KV lookups, Q-value scans, and CRDT operations currently served by SQLite, RVF uses META_SEG for structured metadata storage with key-based indexing:

```typescript
// v3/src/persistence/rvf-relational-adapter.ts
interface RvfRelationalAdapter {
  /** KV store operations via META_SEG */
  kvGet(key: string): Promise<unknown>;
  kvSet(key: string, value: unknown): Promise<void>;
  kvScan(prefix: string): Promise<Array<[string, unknown]>>;

  /** Q-value operations via META_SEG with state-action indexing */
  qValueGet(state: string, action: string): Promise<number>;
  qValueUpdate(state: string, action: string, value: number): Promise<void>;

  /** GOAP plan storage via META_SEG */
  goapStore(planId: string, plan: GOAPPlan): Promise<void>;
  goapRetrieve(planId: string): Promise<GOAPPlan>;
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Extends | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | Evolves hybrid into RVF-primary |
| Depends On | ADR-066 | RVF-backed Pattern Store | Vector migration must be complete first |
| Depends On | ADR-071 | HNSW Unification | All HNSW must be on RVF before relational migration |
| Relates To | ADR-070 | Witness Chain Audit | Witness chains for all data types after migration |
| Relates To | ADR-038 | Memory Unification | SQLite unified memory migrates to RVF |
| Relates To | ADR-036 | Result Persistence | Result storage backend migrates |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration Phase 3 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF META_SEG Spec | Technical Spec | @ruvector/rvf package documentation |
| INT-001 | Database Module | Existing Code | `v3/src/database/` |
| INT-002 | Unified Memory | Existing Code | `v3/src/kernel/unified-memory.ts` |
| INT-003 | GOAP Planner | Existing Code | `v3/src/coordination/goap/` |
| INT-004 | CRDT State | Existing Code | `v3/src/coordination/crdt/` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-22 | Proposed | 2026-05-22 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-22 | Initial creation. Phased migration strategy from SQLite to RVF as primary persistence with stage gates and escape hatch. |

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
