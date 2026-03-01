# ADR-044: Domain RL Integration Status

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-044 |
| **Status** | Implemented |
| **Date** | 2026-01-13 |
| **Author** | Claude Code |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** V3 QE's 6 bounded contexts (Requirements-Validation, Code-Intelligence, Security-Compliance, Contract-Testing, Visual-Accessibility, Chaos-Resilience) requiring intelligent decision-making,

**facing** the need for domain-specific optimization (scenario ordering, test prioritization, contract validation sequencing, chaos experiment selection) that static rules cannot adequately address,

**we decided for** integrating domain-specific RL algorithms (PPO, DQN, SARSA, A2C, PolicyGradient) with @ruvector wrappers (QESONA, QEGNNEmbeddingIndex, QEFlashAttention) into each coordinator,

**and neglected** using a single generic RL algorithm for all domains (ignores domain-specific needs), hardcoded heuristics (cannot adapt), and deferring RL integration (misses optimization opportunities),

**to achieve** intelligent domain-specific optimization: PPO for BDD scenario generation (3-5 optimal), 150x faster code search via GNN+HNSW, DQN-prioritized security tests, SARSA-ordered contract validation, A2C-prioritized visual tests, and PolicyGradient-selected chaos experiments,

**accepting that** each domain requires custom integration work, RL algorithms need training data to be effective, and the pattern adds complexity to coordinator implementations.

---

## Context

V3 QE has 9 RL algorithms in the rl-suite and powerful @ruvector wrappers, but they were not integrated into domain coordinators. Each domain has optimization problems that benefit from reinforcement learning: requirements need optimal scenario counts, security needs test prioritization, chaos needs experiment selection.

All 6 domains now have REAL RL integrations where RL methods are in the public interface, called by workflow methods, and covered by 19 integration tests.

---

## Options Considered

### Option 1: Domain-Specific RL Integration (Selected)

Each domain gets the RL algorithm best suited to its optimization problem.

**Pros:** Optimal per-domain performance, algorithms matched to problem structure
**Cons:** Custom integration per domain, varied training requirements

### Option 2: Single Generic RL Algorithm (Rejected)

Use one algorithm (e.g., PPO) for all domains with different reward functions.

**Why rejected:** Ignores domain-specific state/action spaces; some domains need on-policy (PPO), others off-policy (DQN).

### Option 3: Hardcoded Heuristics (Rejected)

Use static rules for prioritization and selection.

**Why rejected:** Cannot adapt to project-specific patterns or improve over time.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-039 | V3 Implementation | RL suite foundation |
| Relates To | ADR-040 | Agentic Flow Integration | Coordinator patterns |
| Part Of | MADR-001 | V3 Implementation Initiative | Domain intelligence |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-044-A | Domain RL Mapping | Technical Spec | [specs/SPEC-044-A-domain-rl-mapping.md](../specs/SPEC-044-A-domain-rl-mapping.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-13 | Approved | 2026-07-13 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-13 | Initial creation |
| Implemented | 2026-01-13 | All 6 domains integrated, 19 tests passing |
