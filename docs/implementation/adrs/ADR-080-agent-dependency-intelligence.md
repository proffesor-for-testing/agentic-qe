# ADR-080: Agent Dependency Intelligence

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-080 |
| **Status** | Implemented |
| **Date** | 2026-03-13 |
| **Author** | AQE Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** an AQE fleet with 60+ agents that have implicit, undocumented dependencies on MCP servers and on each other,

**facing** the problem that agents could be spawned without their required MCP tools being available, and the qe-queen-coordinator had no awareness of dependency ordering when spawning multi-agent tasks,

**we decided for** (1) a pre-spawn MCP validation step that scans agent `.md` files for MCP tool references and validates availability at fleet install time, (2) a structured YAML frontmatter `dependencies` block with topological sort for spawn ordering, and (3) integration into the queen coordinator for phase-ordered spawning,

**and neglected** (1) blocking agent spawn on missing dependencies, (2) runtime-only dependency checks with no install-time validation, and (3) a centralized dependency registry separate from agent files,

**to achieve** early visibility into missing MCP servers, optimal spawn ordering for multi-agent tasks, and reduced manual coordination overhead in complex swarm operations,

**accepting that** agent authors must declare dependencies in frontmatter for full benefit, and advisory-only validation means agents can still spawn with missing tools.

---

## Context

The AQE fleet grew to 60+ agents organically. Each agent's `.md` file referenced MCP tools implicitly in prose and code blocks, but these dependencies were never validated or documented structurally. This caused three problems:

1. **Silent failures**: An agent spawned without its required MCP server would fail at tool-call time with no prior warning.
2. **No spawn ordering**: The queen coordinator spawned agents in arbitrary order. If agent B depended on agent A being ready first, the operator had to manage this manually.
3. **Undiscoverable dependencies**: Understanding what an agent needed required reading its entire markdown file -- there was no structured, machine-readable declaration.

Issue #342 Items 1 and 2 addressed these gaps with two complementary subsystems: pre-spawn MCP validation and structured agent dependencies.

---

## Options Considered

### Option 1: Pre-Spawn MCP Validation + Structured Dependencies (Selected)

Implement two subsystems that work together:

- **MCP Validator** scans agent `.md` files for `mcp__([a-z][a-z0-9-]*)__([a-z][a-z0-9_]*)` references, assigns context-aware confidence (prose = 0.9, code block = 0.5), and validates against available MCP servers. Advisory only -- never blocks spawn. ReDoS prevention via 100KB input cap.
- **Dependency Graph** parses YAML frontmatter `dependencies` blocks declaring `hard`, `soft`, and `peer` dependency types plus MCP server and model requirements. Uses topological sort with cycle detection (DFS) to produce phased spawn plans.

**Pros:**
- Early warning about missing MCP servers at install time
- Machine-readable dependency declarations live with the agent definition
- Topological sort produces optimal parallel-within-phase spawn plans
- Advisory-only approach follows Skillsmith philosophy (warn, never block)

**Cons:**
- Requires agent authors to add frontmatter (adoption effort)
- Regex-based MCP extraction may produce false positives in edge cases (mitigated by confidence scoring)

### Option 2: Block Spawn on Missing Dependencies (Rejected)

**Why rejected:** Violates Skillsmith philosophy. Blocking would prevent agents from running in environments with partial MCP availability, reducing flexibility. Many agents can operate in degraded mode without all their tools.

### Option 3: Runtime-Only Dependency Checks (Rejected)

**Why rejected:** Failures at runtime are harder to diagnose. Install-time validation gives operators advance warning and a chance to configure missing servers before any agent attempts to use them.

### Option 4: Centralized Dependency Registry (Rejected)

**Why rejected:** Separating dependency declarations from agent files creates a synchronization problem. When an agent is updated, its registry entry can drift. Co-locating dependencies in frontmatter follows the single-source-of-truth principle.

---

## Decision Detail

### Part 1: Pre-Spawn MCP Validation (Item 1)

**Implementation:** `src/validation/steps/agent-mcp-validator.ts` (346 lines)

Key design choices:
- **Regex extraction** with pattern `mcp__([a-z][a-z0-9-]*)__([a-z][a-z0-9_]*)` identifies MCP tool references
- **Context-aware confidence**: references in prose get 0.9 confidence (likely intentional), references inside code blocks get 0.5 (may be examples)
- **ReDoS prevention**: input capped at 100KB before regex processing
- **Advisory output**: validation produces warnings with confidence scores, never errors that block execution
- **Fleet install integration**: runs during `aqe install` to surface issues early

### Part 2: Structured Agent Dependencies (Item 2)

**Implementation:** `src/routing/agent-dependency-graph.ts` (392 lines)

YAML frontmatter schema:
```yaml
dependencies:
  agents:
    - name: qe-test-generator
      type: hard        # must spawn first
    - name: qe-coverage-analyzer
      type: soft        # spawn if available
    - name: qe-reviewer
      type: peer        # coordinate, no ordering
  mcp_servers:
    - name: claude-flow
      required: true
    - name: github
      required: false
  model:
    min_capability: tier-2
```

Three dependency types:
- **hard**: target agent must be spawned and ready before this agent starts
- **soft**: spawn target if available, degrade gracefully if not
- **peer**: agents coordinate at runtime, no spawn ordering constraint

Topological sort uses DFS-based cycle detection. If a cycle is found among hard dependencies, the graph builder emits a warning and breaks the cycle at the lowest-confidence edge. The result is a phased spawn plan: agents within a phase can launch in parallel, phases execute sequentially.

### Part 3: Queen Coordinator Integration

**Implementation:** `src/coordination/queen-coordinator.ts` and `src/coordination/queen-task-management.ts`

The queen coordinator integrates all three dependency intelligence subsystems:

1. **On initialize**: builds the dependency graph from `.claude/agents/v3/` frontmatter, loads available MCP servers, and initializes the co-execution repository for behavioral learning.
2. **On `requestAgentSpawn`**: runs advisory MCP validation for the agent being spawned (warns if MCP servers are missing, never blocks).
3. **On task completion** (`handleTaskCompletionCallback`): records co-execution data for all agents that participated in the task, feeding the behavioral signal into the signal merger for future routing decisions.
4. **On demand** (`getSpawnPlan`): produces a phased spawn plan from the dependency graph that respects hard dependency ordering. Callers can use this for multi-agent task orchestration.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-037 | V3 QE Agent Naming | Agent naming conventions used for dependency references |
| Relates To | ADR-039 | V3 QE MCP Optimization | MCP server availability feeds into validation |
| Relates To | ADR-048 | V2-V3 Agent Migration | Migrated agents need dependency declarations added |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| ISSUE-342 | Agent Dependency Intelligence | GitHub Issue | [#342](https://github.com/proffesor-for-testing/agentic-qe/issues/342) |
| IMPL-080-A | MCP Validator | Source | `src/validation/steps/agent-mcp-validator.ts` |
| IMPL-080-B | Dependency Graph | Source | `src/routing/agent-dependency-graph.ts` |
| IMPL-080-C | Co-Execution Repository | Source | `src/routing/co-execution-repository.ts` |
| IMPL-080-D | Signal Merger | Source | `src/routing/signal-merger.ts` |
| IMPL-080-E | Queen Integration | Source | `src/coordination/queen-coordinator.ts`, `src/coordination/queen-task-management.ts` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Architecture Team | 2026-03-13 | Implemented | 2026-09-13 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Implemented | 2026-03-13 | Delivered as part of Issue #342 Items 1 and 2 |

---

## Consequences

- **Agent authors** should declare dependencies in YAML frontmatter for full benefit of spawn ordering and validation
- **Fleet installer** now logs MCP validation warnings during `aqe init`, giving operators early visibility into missing servers
- **Queen coordinator** validates MCP deps at spawn time (advisory), records co-execution outcomes at task completion, and exposes `getSpawnPlan()` for dependency-aware multi-agent orchestration
- **Existing agents** without frontmatter continue to work unchanged -- the system degrades gracefully to unordered spawning
- **Advisory-only validation** means no agent is ever prevented from spawning, preserving flexibility in partial environments

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [x] **E - Evidence**: MCP validator tested against agent `.md` files with known tool references
- [x] **C - Criteria**: 4 options compared (selected, block-spawn, runtime-only, centralized registry)
- [x] **A - Agreement**: QE domain owners consulted on dependency types and Skillsmith philosophy
- [x] **D - Documentation**: WH(Y) statement complete, ADR published
- [x] **R - Review**: Review cadence set (6 months), architecture team assigned

### Extended
- [x] **Dp - Dependencies**: ADR-037, ADR-039, ADR-048 relationships documented
- [x] **Rf - References**: Issue #342 and implementation files linked
- [x] **M - Master**: Part of Agent Dependency Intelligence initiative (Issue #342)
