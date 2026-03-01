# ADR-031: Strange Loop Self-Awareness

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-031 |
| **Status** | Accepted |
| **Date** | 2026-01-10 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** V3 AQE agents operating without awareness of their own swarm connectivity or health status,

**facing** no detection of single points of failure (bottlenecks), no self-healing when agents become isolated, external monitoring required for swarm health, and inability to observe and respond to topology degradation,

**we decided for** implementing the Strange Loop pattern enabling agents to observe, model, and heal their own swarm connectivity through a continuous Observe-Model-Decide-Act cycle with min-cut analysis for bottleneck detection,

**and neglected** external monitoring only (Prometheus/Grafana), reactive-only healing (wait for failures), and simple heartbeat-only health checks,

**to achieve** genuine autonomy without external monitoring, automatic bottleneck detection in <100ms, self-healing action execution in <1s, trend prediction accuracy >70%, and zero human intervention for common issues,

**accepting that** debugging emergent behavior is challenging, the system adds complexity with multiple interacting components, and the self-healing actions may occasionally be incorrect requiring rollback capabilities.

---

## Context

Current v3 AQE agents operate without self-awareness: agents don't observe their own swarm connectivity, there's no detection of single points of failure (bottlenecks), no self-healing when agents become isolated, and external monitoring is required for swarm health.

RuVector's Strange Loop example demonstrates a powerful pattern: "You look in a mirror. You see yourself looking. You adjust your hair *because* you saw it was messy. The act of observing changed what you observed." This creates genuine autonomy - the system doesn't need external monitoring because it *is* its own monitor.

---

## Options Considered

### Option 1: Strange Loop Self-Awareness (Selected)

Implement continuous Observe-Model-Decide-Act cycle with min-cut analysis for bottleneck detection and automated self-healing.

**Pros:** Genuine autonomy, real-time bottleneck detection, automatic recovery
**Cons:** Debugging emergent behavior, additional complexity

### Option 2: External Monitoring Only (Rejected)

Use Prometheus/Grafana for monitoring with manual intervention for issues.

**Why rejected:** Requires human operators; doesn't scale; delays in detection and response.

### Option 3: Simple Heartbeat Health Checks (Rejected)

Basic heartbeat monitoring without topology analysis.

**Why rejected:** Can't detect bottlenecks or predict failures; only detects dead agents.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Self-healing infrastructure |
| Enables | ADR-047 | MinCut Self-Organizing QE | Foundation for MinCut integration |
| Relates To | ADR-008 | Queen Coordinator | Strange Loop integrates with Queen |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-031-A | Self-Observation Protocol | Technical Spec | [specs/SPEC-031-A-self-observation-protocol.md](../specs/SPEC-031-A-self-observation-protocol.md) |
| SPEC-031-B | Self-Healing Controller | Implementation Guide | [specs/SPEC-031-B-self-healing-controller.md](../specs/SPEC-031-B-self-healing-controller.md) |
| SPEC-031-C | Implementation Plan | Migration Guide | [specs/SPEC-031-C-implementation-plan.md](../specs/SPEC-031-C-implementation-plan.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-10 | Accepted | 2026-07-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-10 | Initial creation from RuVector MinCut analysis |
| Accepted | 2026-01-10 | Approved by Architecture Team |
