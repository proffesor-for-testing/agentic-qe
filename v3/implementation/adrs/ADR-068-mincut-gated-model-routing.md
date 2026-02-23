# ADR-068: Mincut-Gated Model Routing

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-068 |
| **Status** | Proposed |
| **Date** | 2026-02-22 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's 3-tier model routing system (ADR-026) which uses static complexity percentage thresholds (under 30% routes to Haiku, over 30% routes to Sonnet/Opus, with an Agent Booster WASM tier for trivial transforms),

**facing** the limitation that static thresholds cannot adapt to workload topology -- a 25% complexity task that sits at a critical bottleneck in the agent dependency graph may warrant Opus-level reasoning, while a 35% complexity task on an isolated leaf node may be adequately served by Haiku -- resulting in both over-provisioning of expensive models for isolated tasks and under-provisioning for structurally critical ones,

**we decided for** replacing the static complexity threshold with @ruvector/mincut graph analysis that computes the structural criticality of each task within the active agent dependency graph, routing tasks through the mincut bottleneck to higher-tier models and routing tasks on well-connected (high-cut) paths to lower-tier models, using the Subpolynomial Dynamic algorithm (n^0.12 scaling) for real-time routing decisions,

**and neglected** (a) keeping the current static threshold routing (rejected: wastes budget on non-critical tasks while under-serving critical ones), (b) pure cost-optimization routing that always picks the cheapest model (rejected: sacrifices quality on structurally important tasks), (c) manual per-task-type tier assignments (rejected: does not adapt to runtime topology changes as agents spawn and complete),

**to achieve** topology-aware model selection that allocates expensive reasoning capacity where it has maximum structural impact, estimated 30-40% reduction in model costs by downgrading isolated tasks without quality loss, and sub-millisecond routing decisions via the Subpolynomial Dynamic algorithm,

**accepting that** this introduces @ruvector/mincut-node as a routing dependency, requires maintaining a live agent dependency graph, and the mincut heuristic may occasionally misroute tasks during rapid topology changes (mitigated by fallback to static thresholds when the graph is unstable).

---

## Context

AQE v3 routes tasks to one of three model tiers based on a static complexity score:

| Tier | Model | Trigger | Cost |
|------|-------|---------|------|
| 0 | Agent Booster (WASM) | Trivial transforms | $0 |
| 1 | Haiku | Complexity < 30% | $0.0002 |
| 2 | Sonnet/Opus | Complexity >= 30% | $0.003-$0.015 |

This works for isolated tasks but ignores the structural role of each task in the swarm. Consider two scenarios:

1. A test generation task at 28% complexity that is the sole input to a quality gate decision affecting 12 downstream agents. A Haiku-level error here cascades through the entire swarm.
2. A security scan at 40% complexity running on a leaf agent whose output is consumed by no other agent. Opus-level reasoning is wasted here.

The current router treats both by complexity alone. Mincut analysis reveals the structural truth: task (1) sits on a mincut of the dependency graph (removing it disconnects the most nodes), making it structurally critical. Task (2) has high graph connectivity (many alternative paths exist), making it structurally redundant.

RuVector already provides 6 mincut algorithms. The Subpolynomial Dynamic algorithm scales at n^0.12 -- for a 15-agent graph, the computation completes in under 100 microseconds. ADR-047 integrated these algorithms for self-organizing QE but did not apply them to model routing. This ADR extends mincut to the routing decision.

### Routing Formula

The routing tier is determined by combining complexity score with structural criticality:

```
effectiveComplexity = rawComplexity * (1 + criticality * amplificationFactor)
```

Where `criticality` is the normalized mincut value (0.0 to 1.0) of the task node in the dependency graph, and `amplificationFactor` is a tunable parameter (default: 1.5). A task at 20% raw complexity with criticality 0.8 becomes `20% * (1 + 0.8 * 1.5) = 44%`, routing to Sonnet. A task at 40% raw complexity with criticality 0.1 becomes `40% * (1 + 0.1 * 1.5) = 46%`, still Sonnet but barely -- and in practice many such tasks will drop below the threshold.

---

## Options Considered

### Option 1: Mincut-Gated Routing with Subpolynomial Dynamic Algorithm (Selected)

Replace static complexity thresholds with a composite score that multiplies raw complexity by structural criticality derived from mincut analysis of the live agent dependency graph.

**Pros:**
- Routes expensive models to structurally critical tasks where errors cascade
- Reduces cost by downgrading isolated tasks that can tolerate lower-tier reasoning
- Sub-millisecond routing latency (n^0.12 scaling for 15-agent graphs)
- Leverages existing @ruvector/mincut-node dependency (already used by ADR-047)
- Tunable amplification factor allows gradual rollout

**Cons:**
- Requires maintaining a live dependency graph (updated on agent spawn/complete)
- Mincut values may oscillate during rapid topology changes
- Adds conceptual complexity to routing logic

### Option 2: Static Complexity Thresholds (Status Quo, Rejected)

Keep the current percentage-based routing with fixed tier boundaries.

**Why rejected:** Ignores structural context. Wastes budget on isolated high-complexity tasks and under-serves critical low-complexity tasks. No path to topology-aware cost optimization.

### Option 3: Cost-Optimized Routing (Rejected)

Always route to the cheapest model that meets a minimum quality threshold, ignoring structural position.

**Why rejected:** Optimizes for cost at the expense of quality on critical paths. A single Haiku-level error on a mincut bottleneck can invalidate the work of 10+ downstream agents, costing more in reruns than the savings from cheaper routing.

### Option 4: Manual Per-Task-Type Tier Assignments (Rejected)

Assign tiers based on task type (security always gets Opus, test generation always gets Haiku, etc.).

**Why rejected:** Task types do not capture structural context. The same task type can be critical or redundant depending on its position in the current swarm topology. Manual assignments do not adapt to runtime topology.

---

## Implementation

### Dependency Graph Maintenance

```typescript
// v3/src/routing/dependency-graph.ts
interface AgentDependencyGraph {
  addAgent(agentId: string, dependsOn: string[]): void;
  removeAgent(agentId: string): void;
  getCriticality(agentId: string): number; // 0.0 - 1.0 normalized mincut
  isStable(): boolean; // false during rapid topology changes
}
```

The Queen Coordinator (ADR-008) already tracks agent dependencies. The dependency graph adapter wraps this existing state and computes mincut on demand.

### Enhanced Router

```typescript
// v3/src/routing/mincut-router.ts
interface MincutRouterConfig {
  amplificationFactor: number;   // Default: 1.5
  stabilityThreshold: number;    // Minimum graph stability before using mincut
  fallbackToStatic: boolean;     // Use static thresholds when graph is unstable
  algorithm: 'subpolynomial-dynamic' | 'stoer-wagner' | 'dinics';
}

class MincutRouter implements ModelRouter {
  async route(task: RoutableTask): Promise<ModelTier> {
    const rawComplexity = this.assessComplexity(task);

    if (!this.graph.isStable()) {
      return this.staticFallback(rawComplexity);
    }

    const criticality = this.graph.getCriticality(task.agentId);
    const effective = rawComplexity * (1 + criticality * this.config.amplificationFactor);

    if (effective < 0.05) return ModelTier.Booster;
    if (effective < 0.30) return ModelTier.Haiku;
    if (effective < 0.60) return ModelTier.Sonnet;
    return ModelTier.Opus;
  }
}
```

### Migration Path

1. Deploy mincut router behind `useMinCutRouting` feature flag (default off)
2. Shadow mode: compute mincut routing in parallel with static routing, log divergences
3. Analyze divergence data to tune `amplificationFactor`
4. Enable for new swarms, then existing swarms after validation
5. Remove static router after 2 stable release cycles

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Extends | ADR-026 | 3-Tier Model Routing | Replaces static thresholds with mincut-gated routing |
| Depends On | ADR-047 | MinCut Self-Organizing QE | Uses existing mincut algorithm implementations |
| Depends On | ADR-008 | Queen Coordinator | Agent dependency graph sourced from Queen |
| Relates To | ADR-050 | RuVector Neural Backbone | Mincut is part of ruvector ecosystem |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration Phase 1 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | @ruvector/mincut-node | npm Package | Subpolynomial Dynamic algorithm bindings |
| INT-001 | Model Router | Existing Code | `v3/src/routing/` |
| INT-002 | Queen Coordinator | Existing Code | `v3/src/coordination/queen-coordinator.ts` |
| INT-003 | MinCut Integration | Existing Code | `v3/src/learning/mincut/` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-22 | Proposed | 2026-08-22 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-22 | Initial creation. Mincut-gated model routing replacing static complexity thresholds for topology-aware cost optimization. |

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
