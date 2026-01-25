# ADR-032: Time Crystal Scheduling

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-032 |
| **Status** | Accepted |
| **Date** | 2026-01-10 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** v3 AQE test scheduling across multi-phase test pyramids (unit, integration, E2E, performance) coordinated by multi-agent swarms,

**facing** external dependency on CI/CD webhooks and cron schedules, no self-organization where test suites don't adapt scheduling to quality signals, static timing without phase-aware prioritization, and fragile multi-agent coordination depending on message passing,

**we decided for** time crystal scheduling using coupled oscillator dynamics (Central Pattern Generator) for self-organizing test execution phases that generate their own periodic patterns without external timing,

**and neglected** cron-based scheduling (external dependency, no adaptation), event-driven pipelines (reactive only), and static phase sequences (no quality-gated progression),

**to achieve** self-sustaining oscillation without external timers, 4-phase test execution cycle with emergent timing, phase transition detection <100ms, quality-gated phase progression, and crystal stability detection,

**accepting that** this adds complexity to understand oscillator dynamics, requires initial phase synchronization, and quality failures trigger crystal repair (re-synchronization).

---

## Context

Current v3 AQE test scheduling relies on external triggers: CI/CD webhooks, cron-based schedules, manual execution requests, and event-driven pipelines. This approach creates external dependency, prevents self-organization, uses static timing, and makes multi-agent coordination fragile.

RuVector's Time Crystal CPG (Central Pattern Generator) demonstrates a powerful pattern: coupled oscillators produce rhythmic output without external timing, like biological central pattern generators. The system doesn't need external cron jobs because it generates its own periodic patterns.

Each oscillator represents a test phase. Phases cycle through Unit, Integration, E2E, and Performance in a self-sustaining loop. Winner-take-all determines the active phase based on oscillator activity.

---

## Options Considered

### Option 1: Time Crystal CPG (Selected)

Uses Kuramoto-like coupled oscillators where each oscillator represents a test phase. Nearest-neighbor coupling creates ring topology. Phase transitions occur when different oscillator has highest activity.

**Pros:**
- No external timing dependency
- Self-organizing, adaptive to quality signals
- Quality-gated phase progression

**Cons:**
- More complex to understand than cron
- Requires initial synchronization
- Quality failures trigger repair

### Option 2: Cron-Based Scheduling (Rejected)

Use traditional cron jobs to trigger test phases at fixed intervals.

**Why rejected:** External dependency; no adaptation to quality signals or workload.

### Option 3: Event-Driven Pipelines (Rejected)

Trigger test phases based on events (commits, PRs, deployments).

**Why rejected:** Purely reactive; no proactive periodic execution.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Test coordination |
| Relates To | ADR-033 | Early Exit Testing | Phase execution optimization |
| Relates To | ADR-030 | Coherence-Gated Quality Gates | Quality-gated progression |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-032-A | Oscillator Neuron | Technical Spec | [specs/SPEC-032-A-oscillator-neuron.md](../specs/SPEC-032-A-oscillator-neuron.md) |
| SPEC-032-B | Time Crystal Scheduler | Implementation Guide | [specs/SPEC-032-B-time-crystal-scheduler.md](../specs/SPEC-032-B-time-crystal-scheduler.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-10 | Accepted | 2026-07-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-10 | Initial creation from RuVector analysis |
| Accepted | 2026-01-10 | Approved by Architecture Team |
