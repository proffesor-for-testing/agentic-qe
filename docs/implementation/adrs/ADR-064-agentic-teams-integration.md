# ADR-064: Agent Teams Integration for AQE Fleet

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-064 |
| **Status** | Accepted |
| **Date** | 2026-02-09 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Analysis Method** | Six Thinking Hats (Agent Teams Integration Review) |
| **Conceptual Inspiration** | [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams), [claude-flow Issue #1098](https://github.com/ruvnet/claude-flow/issues/1098) |

---

## WH(Y) Decision Statement

**In the context of** the AQE fleet with 50+ QE agents coordinated by a Queen Coordinator (ADR-008) using async event bus + memory namespace communication across 13 DDD domains,

**facing** the absence of direct inter-agent messaging — agents can only write to shared memory and hope others read it, with no ability to challenge each other's findings, debate test strategies, or converge on consensus in real-time — which limits root cause analysis to single-hypothesis investigation and prevents the learning feedback loop from closing automatically on task completion,

**we decided for** implementing a hybrid fleet architecture that layers Claude Code Agent Teams' communication patterns (direct mailbox messaging, TeammateIdle/TaskCompleted hooks, task dependency DAG, tiered fleet activation) on top of the existing Queen Coordinator, creating domain-scoped teams of 2-4 agents with domain coordinators as team leads,

**and neglected** (a) replacing Queen Coordinator with Agent Teams entirely (rejected: Queen's priority scheduling, work stealing, and domain routing are proven and not replicated by Agent Teams), (b) waiting for Agent Teams GA (rejected: fallback layer ensures AQE fleet works with or without Agent Teams enabled), (c) building a custom messaging layer from scratch (rejected: Agent Teams' patterns are well-designed and battle-tested),

**to achieve** direct inter-agent communication with <500ms mailbox latency, automated learning feedback via TaskCompleted hooks with pattern training, self-organizing task claiming via TeammateIdle hooks reducing Queen bottleneck, and tiered fleet activation (2-15 agents) to control token costs,

**accepting that** Agent Teams is experimental with known limitations (no session resumption, task status lag, no nested teams), token costs will increase with full Agent Teams activation, and the hybrid architecture adds a coordination layer that increases debugging complexity.

---

## Context

AQE v3's 50+ agent fleet communicates exclusively through async memory writes and event bus subscriptions. An agent writes to shared memory; another agent reads it on its next cycle. This creates several problems:

1. **No direct messaging**: Security agent discovers a vulnerability pattern but can't immediately alert the test generator — it writes to memory and waits.
2. **Single-hypothesis debugging**: Root cause analysis spawns one agent with one theory. No competing hypotheses, no adversarial investigation.
3. **Manual learning extraction**: Patterns from completed tasks must be manually extracted post-hoc rather than automatically trained on completion.
4. **Queen bottleneck**: All task assignment flows through the Queen. Idle agents can't self-organize to claim pending work.
5. **Flat cost profile**: Every quality check activates the full fleet regardless of complexity.

Claude Code Agent Teams (experimental) introduces: team lead + teammates with direct mailbox messaging, `TeammateIdle` and `TaskCompleted` hooks, shared task lists with dependency tracking, and broadcast capability. Claude-flow issue #1098 proposes integrating these with auto-assign on idle and neural pattern training on completion.

The analysis document (`docs/agentic-teams-integration-analysis.md`) applied Six Thinking Hats methodology and recommended a hybrid architecture that preserves Queen Coordinator while adding Agent Teams' communication layer.

---

## Options Considered

### Option 1: Hybrid Fleet Architecture — Layer Agent Teams on Queen (Selected)

Preserve Queen Coordinator for strategic planning, domain routing, and priority scheduling. Add Agent Teams layer for direct messaging, task claiming, and hooks. Create domain-scoped teams (2-4 agents per domain) managed by the Queen.

```
Queen Coordinator (strategic planning, domain routing, priority scheduling)
    |
    +-- Agent Teams Layer (direct messaging, task claiming, hooks)
    |       |
    |       +-- Domain Team: test-generation (3 teammates)
    |       +-- Domain Team: security-compliance (2 teammates)
    |       +-- Domain Team: coverage-analysis (2 teammates)
    |
    +-- Work Stealing (cross-domain load balancing)
    +-- CRDT Sync (state consistency)
```

**Pros:**
- Preserves proven Queen architecture
- Direct messaging eliminates biggest coordination friction
- Hooks close learning feedback loop automatically
- Domain teams respect bounded context boundaries
- Fallback: works without Agent Teams enabled

**Cons:**
- Adds coordination layer complexity
- Agent Teams' flat model doesn't natively support hierarchy
- Token costs increase with full activation

### Option 2: Replace Queen with Agent Teams (Rejected)

Make Agent Teams the sole coordination mechanism, removing Queen Coordinator.

**Why rejected:** Queen provides priority scheduling (p0-p3), domain-aware routing across 13 domains, work stealing with batch optimization, and CRDT sync — none of which Agent Teams replicates. Replacing 1,763 lines of proven coordination with an experimental feature is high-risk.

### Option 3: Wait for Agent Teams GA (Rejected)

Defer integration until Agent Teams exits experimental status.

**Why rejected:** The core communication patterns (mailbox, hooks, task claiming) are sound regardless of GA status. Building with a fallback layer means AQE fleet works with or without Agent Teams, eliminating the stability dependency.

### Option 4: Custom Messaging Layer (Rejected)

Build a bespoke direct messaging system from scratch.

**Why rejected:** Duplicates work that Agent Teams already solves. Agent Teams' patterns (file-locking for task claiming, exit code 2 for hook feedback, broadcast messaging) are well-designed. Building custom means maintaining our own implementation indefinitely.

---

## Technical Design

### Phase 1: Foundation

#### 1A. Agent Teams Communication Adapter

```typescript
// New: v3/src/coordination/agent-teams/adapter.ts
interface AgentTeamsAdapter {
  /** Send direct message to a specific agent */
  sendMessage(targetAgentId: string, message: AgentMessage): Promise<void>;
  /** Broadcast message to all agents in a domain team */
  broadcast(domainTeam: string, message: AgentMessage): Promise<void>;
  /** Subscribe to incoming messages */
  onMessage(handler: (message: AgentMessage) => Promise<void>): void;
  /** Get mailbox contents for an agent */
  getMailbox(agentId: string): Promise<AgentMessage[]>;
}

interface AgentMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  domain: string;
  type: 'task-assignment' | 'finding' | 'challenge' | 'consensus' | 'alert';
  payload: unknown;
  timestamp: number;
  correlationId?: string;
}
```

#### 1B. TeammateIdle Hook

```typescript
// New: v3/src/hooks/teammate-idle-hook.ts
interface TeammateIdleHookConfig {
  /** Idle threshold before hook fires (default: 5000ms) */
  idleThresholdMs: number;
  /** Auto-assign from pending task queue */
  autoAssign: boolean;
  /** Domains this agent can claim from */
  claimableDomains: string[];
}

class TeammateIdleHook {
  async onIdle(agentId: string, config: TeammateIdleHookConfig): Promise<IdleAction> {
    if (!config.autoAssign) return { action: 'wait' };

    const pendingTasks = await this.taskQueue.getPending({
      domains: config.claimableDomains,
      excludeClaimed: true,
      limit: 1,
    });

    if (pendingTasks.length > 0) {
      await this.taskQueue.claim(pendingTasks[0].id, agentId);
      return { action: 'assigned', task: pendingTasks[0] };
    }

    return { action: 'wait' };
  }
}
```

#### 1C. TaskCompleted Hook with Pattern Training

```typescript
// New: v3/src/hooks/task-completed-hook.ts
interface TaskCompletedHookConfig {
  /** Train patterns from completed work */
  trainPatterns: boolean;
  /** Quality gate validation before accepting completion */
  qualityGateEnabled: boolean;
  /** Minimum quality score to accept (exit code 2 rejects) */
  minQualityScore: number;
}

class TaskCompletedHook {
  async onTaskCompleted(
    taskId: string,
    result: TaskResult,
    config: TaskCompletedHookConfig
  ): Promise<CompletionAction> {
    // Quality gate check
    if (config.qualityGateEnabled) {
      const quality = await this.qualityGate.evaluate(result);
      if (quality.score < config.minQualityScore) {
        return { action: 'reject', exitCode: 2, reason: quality.reason };
      }
    }

    // Pattern training
    if (config.trainPatterns) {
      const patterns = await this.patternExtractor.extract(result);
      for (const pattern of patterns) {
        await this.reasoningBank.storePattern(pattern);
      }
    }

    return { action: 'accept' };
  }
}
```

#### 1D. Tiered Fleet Activation

```typescript
// New: v3/src/coordination/fleet-tiers/tier-config.ts
type FleetTier = 'smoke' | 'standard' | 'deep' | 'crisis';

interface TierConfig {
  tier: FleetTier;
  maxAgents: number;
  agentTeamsEnabled: boolean;
  domains: string[];
  estimatedCost: 'minimal' | 'moderate' | 'high' | 'unlimited';
}

const FLEET_TIERS: Record<FleetTier, TierConfig> = {
  smoke:    { tier: 'smoke',    maxAgents: 3,  agentTeamsEnabled: false, domains: ['test-execution', 'quality-assessment'], estimatedCost: 'minimal' },
  standard: { tier: 'standard', maxAgents: 7,  agentTeamsEnabled: false, domains: ['test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment', 'security-compliance'], estimatedCost: 'moderate' },
  deep:     { tier: 'deep',     maxAgents: 15, agentTeamsEnabled: true,  domains: ['all'], estimatedCost: 'high' },
  crisis:   { tier: 'crisis',   maxAgents: 15, agentTeamsEnabled: true,  domains: ['all'], estimatedCost: 'unlimited' },
};
```

#### 1E. Task Dependency DAG

```typescript
// New: v3/src/coordination/task-dag/dag.ts
interface TaskNode {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  blockedBy: string[];
  blocks: string[];
  assignedTo?: string;
  domain: string;
}

class TaskDAG {
  /** Add task with dependency relationships */
  addTask(task: TaskNode): void;
  /** Get tasks ready to execute (no unresolved blockers) */
  getReady(): TaskNode[];
  /** Topological sort for execution order */
  topologicalSort(): TaskNode[];
  /** Mark task complete and unblock dependents */
  complete(taskId: string): TaskNode[];
  /** Detect circular dependencies */
  detectCycles(): string[][] | null;
}
```

### Phase 2: Hybrid Architecture

- **Domain-scoped Agent Teams**: Queen creates small teams per domain (2-4 agents)
- **HNSW graph construction**: Replace O(n) stub at `unified-memory.ts:672` with proper HNSW insert
- **Devil's Advocate agent**: Challenges other agents' outputs
- **Domain-level circuit breakers**: Isolate failing domains

### Phase 3: Learning & Observability (COMPLETE)

- **Memory graduation pipeline**: TaskCompleted -> HNSW -> ReasoningBank promotion via `ReasoningBankPatternStore` adapter
- **ReasoningBank promotion completion**: `promotePattern()` delegates to `patternStore.promote()` + event publish
- **Distributed tracing**: `TraceCollector` with `TraceContext` propagation via `AgentMessage.correlationId` encoding

### Phase 4: Advanced Patterns (COMPLETE)

- **Competing hypotheses**: `HypothesisManager` with evidence scoring and convergence (evidence-scoring, unanimous, majority, timeout)
- **Cross-fleet federation**: `FederationMailbox` with service registry, routing, health monitoring
- **Dynamic agent scaling**: `DynamicScaler` with workload metrics, scaling policies, cooldown, executor callbacks

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-002 | Event-Driven Communication | Hooks extend event system |
| Depends On | ADR-008 | Multi-Agent Coordination | Layers on Queen Coordinator |
| Depends On | ADR-009 | AgentDB Memory Backend | Shared memory for mailboxes |
| Depends On | ADR-016 | Collaborative Task Claims | Extends claim system with auto-assign |
| Depends On | ADR-021 | ReasoningBank | Pattern training on task completion |
| Depends On | ADR-038 | Memory Unification | HNSW for memory graduation pipeline |
| Relates To | ADR-022 | Adaptive Agent Routing | Tier-aware routing decisions |
| Relates To | ADR-023 | Quality Feedback Loop | TaskCompleted hook closes feedback loop |
| Relates To | ADR-031 | Strange Loop Self-Awareness | Drift/health metrics from agent teams |
| Relates To | ADR-060 | Semantic Anti-Drift | Anti-drift on inter-agent messages |
| Relates To | ADR-061 | Asymmetric Learning Rates | Pattern training uses asymmetric rates |
| Part Of | MADR-001 | V3 Implementation Initiative | Phase 14 enhancement |

---

## Success Metrics

- [x] `AgentTeamsAdapter` with mailbox messaging: <500ms round-trip latency
- [x] `TeammateIdleHook` fires after configurable idle threshold and auto-assigns tasks
- [x] `TaskCompletedHook` rejects on exit code 2 when quality gate fails
- [x] `TaskCompletedHook` trains patterns automatically on successful completion
- [x] Tiered fleet activation: smoke (3 agents), standard (7), deep (15), crisis (15)
- [x] Task dependency DAG with topological ordering and cycle detection
- [x] Domain-scoped teams created by Queen (2-4 agents per domain)
- [x] HNSW graph construction replaces O(n) stub (search in O(log n))
- [x] Devil's Advocate agent challenges other agents' outputs in integration test
- [x] Domain-level circuit breakers open/close on failure thresholds
- [x] Memory graduation pipeline: completed task -> HNSW -> ReasoningBank
- [x] Competing hypotheses pattern converges on correct root cause
- [x] 100+ tests across all 4 phases
- [x] Full build passes: `npm run build && npm test -- --run`

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | Claude Code Agent Teams | Feature Docs | [code.claude.com/docs/en/agent-teams](https://code.claude.com/docs/en/agent-teams) |
| EXT-002 | claude-flow Issue #1098 | Integration Proposal | [github.com/ruvnet/claude-flow/issues/1098](https://github.com/ruvnet/claude-flow/issues/1098) |
| INT-001 | Six Thinking Hats Analysis | Analysis | `docs/agentic-teams-integration-analysis.md` |
| INT-002 | Queen Coordinator | Existing Code | `v3/src/coordination/queen-coordinator.ts` |
| INT-003 | Cross-Phase Hooks | Existing Code | `v3/src/hooks/cross-phase-hooks.ts` |
| INT-004 | Work Stealing | Existing Code | `v3/src/coordination/claims/work-stealing.ts` |
| INT-005 | Unified Memory (HNSW stub) | Existing Code | `v3/src/kernel/unified-memory.ts:672` |
| INT-006 | Pattern Promotion | Existing Code | `v3/src/feedback/pattern-promotion.ts` |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Accepted | 2026-02-09 | Created from Six Thinking Hats Agent Teams analysis. Hybrid architecture layering Agent Teams on Queen Coordinator. |
| Implemented | 2026-02-09 | All 4 phases complete. Phase 1: Foundation (adapter, hooks, fleet tiers, task DAG). Phase 2: Hybrid Architecture (domain teams, HNSW, devil's advocate, circuit breakers). Phase 3: Learning & Observability (pattern training pipeline, distributed tracing). Phase 4: Advanced Patterns (competing hypotheses, federation, dynamic scaling). 389+ tests passing, build clean. |
