# SPEC-050-C: Implementation Plan

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-050-C |
| **Parent ADR** | [ADR-050](../adrs/ADR-050-ruvector-neural-backbone.md) |
| **Version** | 1.0 |
| **Status** | In Progress |
| **Last Updated** | 2026-01-20 |
| **Author** | GOAP Specialist |

---

## Overview

This specification documents the phased implementation plan, parallel execution map, risk mitigation, and success criteria for the RuVector Neural Backbone transformation.

---

## Parallel Execution Map

```
                         PHASE 1 (Week 1)
                    ┌────────────────────────┐
     ┌──────────────┤  Can run in parallel   ├──────────────┐
     │              └────────────────────────┘              │
     ▼                         ▼                           ▼
┌─────────┐            ┌─────────────┐             ┌─────────────┐
│ Action 1│            │  Action 2   │             │  Action 5   │
│ Observe │            │ Q-Learning  │             │ Hypergraph  │
│ Layer   │            │ Persistence │             │   Schema    │
└────┬────┘            └──────┬──────┘             └──────┬──────┘
     │                        │                           │
     │              ┌─────────┴─────────┐                 │
     │              ▼                   ▼                 │
     │         PHASE 2 (Week 2)                          │
     │    ┌─────────────┐      ┌─────────────┐           │
     │    │  Action 3   │      │  Action 4   │           │
     │    │    SONA     │      │   Remove    │           │
     │    │ Persistence │      │  Fallbacks  │           │
     │    └──────┬──────┘      └──────┬──────┘           │
     │           │                    │                   │
     │           └────────┬───────────┘                   │
     │                    │                               │
     │                    ▼                               │
     │              PHASE 3 (Week 3)                      │
     │         ┌─────────────────────┐                    │
     │         │      Action 6       │◀───────────────────┘
     │         │  Hypergraph Query   │
     │         │       Engine        │
     │         └─────────┬───────────┘
     │                   │
     │                   ▼
     │              PHASE 4 (Week 4)
     │    ┌─────────────┐      ┌─────────────┐
     │    │  Action 7   │      │  Action 8   │
     │    │ Coordinator │      │  RuVector   │
     │    │ Integration │      │   Server    │
     │    └─────────────┘      └─────────────┘
     │
     └────────────────────────┬─────────────────────────
                              │
                              ▼
                    CONTINUOUS (All Phases)
                    ┌─────────────────────┐
                    │ Metrics Collection  │
                    │ & Alerting         │
                    └─────────────────────┘
```

---

## Parallel Execution Rules

| Actions | Can Parallelize? | Dependencies |
|---------|------------------|--------------|
| 1, 2, 5 | YES | None between them |
| 3, 4 | YES | Both depend on Actions 1, 2 |
| 6 | NO | Depends on Action 5 |
| 7, 8 | YES | 7 depends on 6, 8 depends on 2-3 |

---

## Action Summary

| Action | Title | Priority | Cost | Time | Agent |
|--------|-------|----------|------|------|-------|
| 1 | ML Observability Layer | P0 | 2 | 4h | qe-learning-coordinator |
| 2 | Wire Q-Learning to Persistence | P0 | 4 | 8h | qe-pattern-learner |
| 3 | SONA Pattern Persistence | P0 | 4 | 6h | qe-pattern-learner |
| 4 | Remove Silent Fallbacks | P1 | 6 | 12h | qe-test-architect |
| 5 | Add Hypergraph Schema | P1 | 3 | 4h | qe-kg-builder |
| 6 | Hypergraph Query Engine | P2 | 8 | 16h | qe-kg-builder |
| 7 | Code Intelligence Integration | P2 | 5 | 10h | qe-test-architect |
| 8 | RuVector Server Integration | P3 | 6 | 12h | qe-learning-coordinator |

**Total Estimated Time:** 72 hours across 4 weeks

---

## Risk Mitigation

### Risk 1: RuVector Binary Compatibility

**Risk:** Native bindings fail on certain platforms
**Mitigation:**
- Keep fallback implementations (but make them explicit)
- Add platform detection and clear error messages
- Test on CI matrix (Linux, macOS, Windows)

### Risk 2: Migration Data Loss

**Risk:** Existing patterns/Q-values lost during migration
**Mitigation:**
- Export existing state before migration
- Implement rollback mechanism
- Run parallel systems during transition

### Risk 3: Performance Degradation

**Risk:** SQLite persistence adds latency
**Mitigation:**
- Use WAL mode (already enabled)
- Batch writes with transactions
- Cache hot Q-values in memory

### Risk 4: Breaking Changes

**Risk:** Removing fallbacks breaks existing workflows
**Mitigation:**
- Feature flag for new behavior
- Gradual rollout with monitoring
- Keep fallbacks but make them explicit

---

## Success Criteria

### Phase 1 Complete When:

- [ ] All ruvector calls emit observable metrics
- [ ] Q-values persist to `memory.db` and restore on startup
- [ ] Hypergraph schema exists in `memory.db`

### Phase 2 Complete When:

- [ ] SONA patterns persist and restore
- [ ] Fallbacks only trigger on actual errors
- [ ] Alerts fire when fallback usage exceeds threshold

### Phase 3 Complete When:

- [ ] Cypher-like queries work against hypergraph
- [ ] `findUntestedFunctions()` returns accurate results
- [ ] `findImpactedTests()` works for any changed file set

### Phase 4 Complete When:

- [ ] CodeIntelligenceCoordinator uses hypergraph for impact analysis
- [ ] (Optional) RuVector server running for shared memory

---

## Overall Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| ML Usage Rate | Unknown | >80% | `usedML: true` count / total |
| Pattern Retention | 0% | 100% | Patterns available after restart |
| Q-Value Persistence | 0% | 100% | Q-values restored from DB |
| Cross-Agent Learning | None | Real-time | Shared vector store queries/sec |
| Fallback Alert Rate | 0% | 100% of fallbacks | Alerts sent when fallback used |

---

## Swarm Configuration

```yaml
topology: hierarchical
maxAgents: 8
strategy: specialized

agents:
  # Phase 1 - Parallel
  - id: obs-agent-1
    type: qe-learning-coordinator
    task: "Action 1 - ML Observability Layer"
    phase: 1

  - id: persist-agent-1
    type: qe-pattern-learner
    task: "Action 2 - Q-Learning Persistence"
    phase: 1

  - id: schema-agent-1
    type: qe-kg-builder
    task: "Action 5 - Hypergraph Schema"
    phase: 1

  # Phase 2 - Parallel (after phase 1)
  - id: persist-agent-2
    type: qe-pattern-learner
    task: "Action 3 - SONA Persistence"
    phase: 2
    depends_on: [persist-agent-1]

  - id: refactor-agent-1
    type: qe-test-architect
    task: "Action 4 - Remove Silent Fallbacks"
    phase: 2
    depends_on: [obs-agent-1]

  # Phase 3 - Sequential
  - id: graph-agent-1
    type: qe-kg-builder
    task: "Action 6 - Hypergraph Query Engine"
    phase: 3
    depends_on: [schema-agent-1]

  # Phase 4 - Parallel
  - id: integration-agent-1
    type: qe-test-architect
    task: "Action 7 - Coordinator Integration"
    phase: 4
    depends_on: [graph-agent-1]

  - id: server-agent-1
    type: qe-learning-coordinator
    task: "Action 8 - RuVector Server"
    phase: 4
    depends_on: [persist-agent-2]
```

---

## File Locations

### New Files

| File | Purpose |
|------|---------|
| `v3/src/integrations/ruvector/observability.ts` | ML usage metrics |
| `v3/src/integrations/ruvector/persistent-q-router.ts` | Q-Learning with persistence |
| `v3/src/integrations/ruvector/sona-persistence.ts` | SONA pattern persistence |
| `v3/src/integrations/ruvector/hypergraph-engine.ts` | Cypher-like query engine |
| `v3/src/integrations/ruvector/server-client.ts` | RuVector server integration |
| `v3/migrations/20260120_add_hypergraph_tables.sql` | Schema migration |

### Modified Files

| File | Changes |
|------|---------|
| `v3/src/integrations/ruvector/provider.ts` | ML-first with alerts |
| `v3/src/integrations/ruvector/fallback.ts` | Add explicit fallback flags |
| `v3/src/domains/code-intelligence/coordinator.ts` | Hypergraph integration |
| `v3/src/kernel/unified-memory.ts` | Add hypergraph schema |

---

## CLI Commands for Execution

```bash
# Initialize swarm for plan execution
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized

# Phase 1 - Parallel execution
npx @claude-flow/cli@latest task create --type feature --description "Action 1: ML Observability Layer" --priority high
npx @claude-flow/cli@latest task create --type feature --description "Action 2: Q-Learning Persistence" --priority high
npx @claude-flow/cli@latest task create --type feature --description "Action 5: Hypergraph Schema" --priority high

# Monitor progress
npx @claude-flow/cli@latest hooks metrics --period 24h

# Check ML vs fallback ratio
npx @claude-flow/cli@latest hooks intelligence --showStatus

# Verify persistence
npx @claude-flow/cli@latest memory list --namespace rl-qvalues
npx @claude-flow/cli@latest memory list --namespace sona-patterns
```

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | GOAP Specialist | Initial specification |
