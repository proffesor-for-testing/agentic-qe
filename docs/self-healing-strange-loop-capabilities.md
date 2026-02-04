# Self-Healing System: Strange Loop Architecture — Complete Capability Reference

> Everything the existing self-healing agent system can do today in Agentic QE v3.

---

## Overview

The self-healing capability lives in `v3/src/strange-loop/` and operates on a continuous **Observe → Model → Decide → Act** cycle running every 5 seconds.

---

## The 4 Phases

### 1. OBSERVE — Collect swarm state in real-time

| Component | File | What It Does |
|-----------|------|-------------|
| Swarm Observer | `v3/src/strange-loop/swarm-observer.ts` | Collects topology snapshots, agent metrics, connectivity |
| MinCut Health Monitor | `v3/src/coordination/mincut/mincut-health-monitor.ts` | Graph-based health scoring using min-cut analysis. Detects isolated vertices, weak points, critical agents (risk > 0.8). Tracks trends: improving/stable/degrading |
| Agent Health Checker | `v3/src/adapters/a2a/discovery/agent-health.ts` | Per-agent health checks with configurable thresholds (5s timeout, 3 failures = unavailable, 2 successes = recovered). Emits status-change events |

### 2. MODEL — Understand what the observations mean

| Component | File | What It Does |
|-----------|------|-------------|
| Swarm Self-Model | `v3/src/strange-loop/self-model.ts` | Historical trend analysis, bottleneck detection, vulnerability prediction |
| Topology Analyzer | `v3/src/strange-loop/topology-analyzer.ts` | Graph structure analysis — finds single points of failure, overloaded hubs |
| Belief Reconciler | `v3/src/strange-loop/belief-reconciler.ts` | ADR-052 coherence integration — detects when the swarm's "beliefs" about its own state are inconsistent |

### 3. DECIDE — Determine what healing action to take

The `SelfHealingController.decide()` method in `v3/src/strange-loop/healing-controller.ts` runs this priority chain:

```
1. Check critical vulnerabilities first (immediate threats)
2. Run bottleneck analysis from model
3. Evaluate predictive vulnerabilities (if enabled)
4. Monitor agent memory utilization
5. Monitor agent responsiveness
6. Deduplicate overlapping actions
7. Prioritize by severity
```

### 4. ACT — Execute the healing action with cooldown protection

---

## The 12 Healing Actions

| # | Action | What It Does | When Triggered |
|---|--------|-------------|----------------|
| 1 | `spawn_redundant_agent` | Creates a backup agent for a bottlenecked one | Single point of failure detected |
| 2 | `add_connection` | Adds communication links to isolated agents | Agent has too few connections |
| 3 | `remove_connection` | Severs problematic connections | Toxic/cascading failure spreading |
| 4 | `redistribute_load` | Moves tasks from overloaded to underloaded agents | Memory/CPU above threshold |
| 5 | `restart_agent` | Kills and restarts an unresponsive agent | Agent stops responding to health checks |
| 6 | `isolate_agent` | Quarantines a malfunctioning agent | Agent producing errors that affect others |
| 7 | `promote_to_coordinator` | Elevates a worker to coordinator role | Coordinator overloaded or failed |
| 8 | `demote_coordinator` | Reduces coordinator back to worker | Too many coordinators, resource waste |
| 9 | `trigger_failover` | Seamless replacement of a failed agent | Agent declared dead after threshold |
| 10 | `scale_up` | Adds new worker agents | Sustained high load across swarm |
| 11 | `scale_down` | Removes underutilized workers | Low utilization, wasting resources |
| 12 | `rebalance_topology` | Restructures the entire swarm topology | Topology degraded beyond local fixes |

---

## Safety Mechanisms

- **Cooldown timers** — prevents the same action from firing repeatedly
- **Action limits** — caps how many actions can execute per cycle
- **Action history** — full audit trail of every healing action taken
- **Health delta tracking** — measures if the action actually helped (learning)
- **Deduplication** — if two analyses recommend the same fix, it runs once

---

## Beyond Swarm Healing: Other Self-Healing Integrations

### GitHub CI/CD Self-Healing Pipeline

From `.claude/skills/github-workflow-automation/SKILL.md`:

```yaml
name: Self-Healing Pipeline
on: workflow_run
jobs:
  heal-pipeline:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    run: npx ruv-swarm actions self-heal \
      --run-id ${{ github.event.workflow_run.id }} \
      --auto-fix-common \
      --create-pr-complex
```

Watches for failed GitHub Actions runs and automatically attempts common fixes.

### CLI Self-Healing Command

From `.claude/commands/automation/self-healing.md`:

Detects and recovers from:
- Failed commands / syntax errors
- Missing dependencies (auto-installs)
- Broken tests (analysis + debugging)
- Stores recovery patterns in memory for future reuse

---

## Current Limitations

| Capability | Status |
|-----------|--------|
| Detect agent failure in swarm | YES — health checks, min-cut analysis |
| Restart a failed agent | YES — `restart_agent` action |
| Detect DB connection failure in test output | NO — not wired to parse Selenium output |
| Restart external infrastructure (DB, Redis) | NO — ActionExecutor is NoOpActionExecutor in tests; real executor needs infra access |
| Resume Selenium tests mid-execution | NO — would need test framework integration |
| Re-run failed test subset | PARTIALLY — could invoke `--rerun-failures` via Bash, but not automated |

The system is designed for **swarm-level self-healing** (agents monitoring agents). Extending it to **infrastructure-level self-healing** (agents monitoring databases, message queues, etc.) would require implementing a custom `ActionExecutor` that maps healing actions to infrastructure commands.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│           StrangeLoopOrchestrator                 │
│           (5-second continuous loop)              │
│                                                   │
│   ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│   │ OBSERVE  │→ │  MODEL   │→ │    DECIDE     │  │
│   │          │  │          │  │               │  │
│   │ • Swarm  │  │ • Trends │  │ • Priorities  │  │
│   │   state  │  │ • Predict│  │ • Thresholds  │  │
│   │ • MinCut │  │ • Bottle-│  │ • Dedup       │  │
│   │ • Health │  │   necks  │  │ • Cooldowns   │  │
│   └──────────┘  └──────────┘  └───────┬───────┘  │
│                                       │          │
│                                       ▼          │
│                               ┌───────────────┐  │
│                               │     ACT       │  │
│                               │               │  │
│                               │ 12 healing    │  │
│                               │ action types  │  │
│                               │ + audit trail │  │
│                               └───────────────┘  │
│                                                   │
│   Coherence Integration (ADR-052)                 │
│   └─ BeliefReconciler detects state conflicts     │
│                                                   │
│   Queen Coordinator Integration                   │
│   └─ Self-bottleneck detection + delegation       │
└──────────────────────────────────────────────────┘
```

---

## Key Source Files

| File | Purpose |
|------|---------|
| `v3/src/strange-loop/index.ts` | Barrel exports for entire module |
| `v3/src/strange-loop/types.ts` | All type definitions (23KB) |
| `v3/src/strange-loop/healing-controller.ts` | Decision + execution logic (22KB) |
| `v3/src/strange-loop/strange-loop.ts` | Orchestrator (34KB) |
| `v3/src/strange-loop/self-model.ts` | Self-modeling and prediction |
| `v3/src/strange-loop/belief-reconciler.ts` | Coherence checking (ADR-052) |
| `v3/src/coordination/mincut/mincut-health-monitor.ts` | Graph-based health monitoring |
| `v3/src/adapters/a2a/discovery/agent-health.ts` | Per-agent health checks |
| `v3/implementation/specs/SPEC-031-A-self-observation-protocol.md` | Observation spec |
| `v3/implementation/specs/SPEC-031-B-self-healing-controller.md` | Controller spec |
| `v3/implementation/specs/SPEC-031-C-implementation-plan.md` | Implementation roadmap |
| `v3/implementation/adrs/ADR-031-strange-loop-self-awareness.md` | Architecture decision |
| `v3/implementation/adrs/ADR-052-coherence-gated-qe.md` | Coherence integration ADR |
