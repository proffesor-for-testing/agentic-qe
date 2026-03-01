# ADR-067: Agent Memory Branching via RVF Copy-on-Write

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-067 |
| **Status** | Proposed |
| **Date** | 2026-02-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's multi-agent swarm coordination, where up to 15 concurrent agents share a single SQLite database for pattern storage, Q-values, and learned knowledge,

**facing** contention from concurrent database access requiring careful locking, inability to give agents isolated working memory without full database copies, and no mechanism for speculative execution where agents explore divergent strategies without risk to the shared knowledge base,

**we decided for** using RVF's COW (Copy-on-Write) branching to derive lightweight per-agent .rvf files from the parent knowledge base, where only changed vectors are physically copied (a 1M-vector parent with 100 agent edits produces a 2.5 MB child instead of a 512 MB full copy), with successful patterns merging back via lineage tracking,

**and neglected** (a) full database cloning per agent (rejected: 512 MB per agent at scale of 15 agents is 7.5 GB of redundant storage with full copy overhead on spawn), (b) namespace isolation within shared SQLite (rejected: still requires locking, no true isolation, no discard-on-failure semantics), (c) in-memory-only agent workspaces (rejected: agent crashes lose all work, no persistence for long-running explorations),

**to achieve** lightweight memory isolation at 0.5% storage cost of full copies, zero-cost branch discard for failed explorations, speculative execution for test generation strategies, and cryptographic audit trails for pattern merge provenance via WITNESS_SEG,

**accepting that** this requires ADR-065 and ADR-066 to be implemented first, adds file management complexity for branch lifecycle (creation, merge, cleanup), and merge conflicts between branches that modify the same vectors require a resolution strategy.

---

## Context

When AQE spawns agent swarms for complex quality engineering tasks, each agent needs working memory to store intermediate findings, learned patterns, and exploration state. The current architecture shares a single SQLite database across all agents. This creates two categories of problems.

First, contention: multiple agents writing concurrently to the same database require WAL mode and careful transaction management to avoid SQLITE_BUSY errors. As swarm sizes grow toward the 15-agent maximum, write contention becomes a throughput bottleneck. Second, isolation: there is no way for an agent to speculatively explore a test generation strategy, learn patterns from it, and then discard everything if the strategy fails. Every write is permanent and shared. An agent generating tests based on a flawed hypothesis pollutes the shared pattern store.

RVF's COW branching solves both problems. When an agent spawns, `RvfDatabase.derive()` creates a child .rvf file that shares the parent's data via copy-on-write semantics. The child file initially contains only a header and pointers to the parent's segments. Reads fall through to the parent. Writes create new segment copies in the child only for modified data. A 1M-vector parent knowledge base with 100 agent edits produces a child file of approximately 2.5 MB instead of the 512 MB full copy.

FileIdentity in RVF tracks parent-child relationships, enabling lineage-aware merge operations. When an agent completes successfully and its patterns are validated, changed vectors merge back into the parent. WITNESS_SEG records the merge provenance with cryptographic attestation. Failed branches are discarded by deleting the child .rvf file -- zero computational cost, no rollback transactions needed.

---

## Options Considered

### Option 1: RVF COW Branching per Agent (Selected)

Each spawned agent receives a derived .rvf file via `RvfDatabase.derive()`. Agent reads fall through to parent. Agent writes are isolated in the child. Successful branches merge back. Failed branches are deleted.

**Pros:**
- Storage cost is proportional to changes, not total size (0.5% for typical agent workloads)
- Zero-cost discard of failed branches (delete file)
- True memory isolation without locking coordination
- Lineage tracking via FileIdentity enables audit and merge
- WITNESS_SEG provides cryptographic merge provenance
- Enables speculative execution patterns (explore multiple strategies in parallel)

**Cons:**
- Requires ADR-065 and ADR-066 to be implemented first
- Branch lifecycle management (creation, merge, garbage collection) adds operational complexity
- Merge conflicts when two branches modify the same vector require resolution strategy
- Parent file must remain accessible while children exist

### Option 2: Full Database Clone per Agent (Rejected)

Copy the entire SQLite database (or .rvf file) for each spawned agent.

**Why rejected:** A knowledge base with 1M vectors at 384 dimensions occupies approximately 512 MB. Cloning this for 15 agents requires 7.5 GB of storage and seconds of copy time per spawn. The vast majority of data is never modified by any individual agent, making full copies wasteful.

### Option 3: Namespace Isolation in Shared SQLite (Rejected)

Prefix agent-specific data with agent IDs within the shared database. Each agent reads shared data and writes to its namespace.

**Why rejected:** Does not provide true isolation -- a misbehaving agent can still read and be influenced by another agent's in-progress writes. No discard semantics: cleaning up a failed agent's namespace requires scanning and deleting rows. Still requires database-level locking for concurrent writes. Does not support the speculative execution pattern where failure means "undo everything."

### Option 4: In-Memory Agent Workspaces (Rejected)

Give each agent an in-memory data structure for its working patterns, backed by the shared database for reads.

**Why rejected:** Agent crashes or process restarts lose all in-progress work. Long-running agents (deep analysis tasks taking minutes) accumulate significant state that should survive failures. No persistence means no post-hoc analysis of what an agent explored before failing.

---

## Implementation

### Agent Spawn with COW Branch

```typescript
// v3/src/coordination/agent-memory-branch.ts
interface AgentMemoryBranch {
  /** Derive a COW branch for a new agent */
  createBranch(agentId: string, parentRvfPath: string): Promise<BranchHandle>;
  /** Merge successful branch patterns back to parent */
  mergeBranch(handle: BranchHandle, strategy: MergeStrategy): Promise<MergeResult>;
  /** Discard a failed branch (deletes child .rvf file) */
  discardBranch(handle: BranchHandle): Promise<void>;
  /** List active branches with lineage info */
  listBranches(parentRvfPath: string): Promise<BranchInfo[]>;
}

interface BranchHandle {
  agentId: string;
  childRvfPath: string;
  parentRvfPath: string;
  createdAt: number;
  fileIdentity: FileIdentity;
}

type MergeStrategy = 'parent-wins' | 'child-wins' | 'newest-wins' | 'manual';
```

### Integration with Agent Teams (ADR-064)

```typescript
// Extension to agent spawn lifecycle
class AgentLifecycleManager {
  async spawnAgent(config: AgentConfig): Promise<Agent> {
    // 1. Create COW branch from parent knowledge base
    const branch = await this.memoryBranch.createBranch(
      config.agentId,
      this.parentRvfPath
    );

    // 2. Create agent with isolated RvfPatternStore pointing to child
    const patternStore = new RvfPatternStore({
      rvfPath: branch.childRvfPath,
      dimensions: 384,
    });

    // 3. Spawn agent with isolated memory
    return this.agentFactory.create(config, patternStore);
  }

  async onAgentComplete(agent: Agent, result: TaskResult): Promise<void> {
    if (result.success) {
      // Merge learned patterns back to parent
      await this.memoryBranch.mergeBranch(agent.branchHandle, 'newest-wins');
    } else {
      // Discard failed exploration at zero cost
      await this.memoryBranch.discardBranch(agent.branchHandle);
    }
  }
}
```

### Branch Lifecycle

1. **Creation**: `RvfDatabase.derive()` called during agent spawn. Child .rvf file created in `.agentic-qe/branches/{agentId}.rvf`.
2. **Active use**: Agent reads fall through to parent via COW. Writes create local copies of modified segments.
3. **Merge**: On successful completion, changed vectors are merged into parent. WITNESS_SEG records the merge with agent ID, timestamp, and task context.
4. **Discard**: On failure, child .rvf file is deleted. No parent modification needed.
5. **Garbage collection**: Periodic cleanup removes orphaned branch files from crashed agents.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | Requires RVF as established persistence layer |
| Depends On | ADR-066 | RVF-backed Pattern Store with Progressive HNSW | COW branches derive from the RVF file managed by RvfPatternStore |
| Depends On | ADR-008 | Multi-Agent Coordination | Agent spawn lifecycle managed by Queen Coordinator |
| Relates To | ADR-064 | Agent Teams Integration | Agent teams benefit from memory isolation per teammate |
| Relates To | ADR-016 | Collaborative Task Claims | Branch merge aligns with task completion lifecycle |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration phase |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF COW Branching | Technical Spec | @ruvector/rvf package documentation |
| EXT-002 | RVF FileIdentity | Technical Spec | @ruvector/rvf package documentation |
| INT-001 | Queen Coordinator | Existing Code | `v3/src/coordination/queen-coordinator.ts` |
| INT-002 | Agent Teams Adapter | Existing Code | `v3/src/coordination/agent-teams/adapter.ts` |
| INT-003 | PatternStore | Existing Code | `v3/src/learning/pattern-store.ts` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-15 | Proposed | 2026-08-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-15 | Initial creation. COW branching for agent memory isolation using RVF derive semantics. Depends on ADR-065 and ADR-066 completion. |

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
