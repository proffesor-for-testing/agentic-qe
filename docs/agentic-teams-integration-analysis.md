# AQE Fleet Improvement Analysis - Six Thinking Hats

**Date:** 2026-02-08
**Subject:** How to improve AQE Fleet by integrating Claude Code Agent Teams patterns
**Sources:** [Claude Code Agent Teams Docs](https://code.claude.com/docs/en/agent-teams), [claude-flow Issue #1098](https://github.com/ruvnet/claude-flow/issues/1098), AQE Fleet codebase analysis

---

## Context

Claude Code has introduced **Agent Teams** -- an experimental multi-instance coordination feature where a team lead spawns, orchestrates, and manages multiple Claude instances working in parallel. Meanwhile, `claude-flow` issue #1098 proposes integrating this directly into the Claude Flow platform with `TeammateIdle` / `TaskCompleted` hooks, shared mailboxes, and neural pattern training on completion.

This analysis applies Edward de Bono's Six Thinking Hats methodology to evaluate how AQE Fleet can adopt these patterns to improve multi-agent quality engineering.

---

## Current AQE Fleet State

| Metric | Value |
|--------|-------|
| Specialized QE agents | 50+ across 12 DDD domains |
| Topology | Hierarchical-mesh (Queen-led) |
| Max concurrent agents | 15 (configurable up to 50) |
| Communication | Event bus + memory namespace (async) |
| Task assignment | Queen-delegated with work stealing |
| Model routing | 3-tier (WASM / Haiku / Sonnet-Opus) |
| Consensus | Byzantine fault-tolerant (Raft) |
| Memory | Hybrid SQLite + HNSW vector search |

---

## Hat Analysis

### White Hat -- Facts & Data

**What do we KNOW?**

Current Fleet Architecture:
- Queen Coordinator manages 50+ agents across 12 domains with priority-based scheduling (p0-p3)
- Work stealing activates after 5s idle threshold, steals batches of 3 tasks, checks every 10s
- Agent lifecycle: idle -> queued -> running -> completed/failed, with 1-hour TTL cleanup
- Memory leaks fixed (MEM-001 CircularBuffer, MEM-002 auto-cleanup), race conditions fixed (CC-002 atomic counter)

Claude Code Agent Teams Architecture:
- Team lead + teammates model with shared task list and direct mailbox messaging
- Tasks have 3 states: pending, in progress, completed -- with dependency tracking
- File-locking prevents race conditions on task claiming
- `TeammateIdle` hook (exit code 2 sends feedback) and `TaskCompleted` hook for quality gates
- Teammates load project context (CLAUDE.md, MCP, skills) but NOT lead's conversation history
- Automatic message delivery, idle notifications, broadcast capability

Issue #1098 Proposed Integration:
- `teammate-idle` hook with `--auto-assign true` for automatic task assignment on idle
- `task-completed` hook with `--train-patterns` for neural learning from completed work
- Settings generator produces full Agent Teams config on `init`
- Shared memory namespace `agent-teams` across all teammates

Gaps in Current AQE Fleet:
- No direct inter-agent messaging (relies on async memory/events only)
- No auto-scaling based on workload
- HNSW graph construction incomplete (unified-memory.ts:672)
- ReasoningBank promotion not fully implemented
- No circuit breakers for failing domains
- Limited distributed tracing / observability
- Pattern distillation from agent performance only partial

---

### Red Hat -- Emotions & Intuition

**What do we FEEL?**

- **Excited:** Agent Teams' direct mailbox messaging could eliminate the biggest friction in AQE fleet coordination -- agents currently can't talk to each other, they can only write to shared memory and hope another agent reads it. Direct messaging changes everything.

- **Anxious:** Token costs will escalate significantly. Each teammate is a separate Claude instance with its own context window. Running 15 AQE agents as full Agent Teams teammates could be prohibitively expensive for routine quality gates.

- **Frustrated:** The current AQE fleet has 50+ agent types but no way for agents to challenge each other's findings, debate test strategies, or converge on consensus the way Agent Teams' "competing hypotheses" pattern enables. This feels like a missed opportunity.

- **Confident:** The Queen Coordinator + work stealing architecture is solid -- it just needs the communication layer upgrade that Agent Teams provides. The foundation doesn't need replacing, it needs extending.

- **Worried:** Agent Teams is experimental with known limitations (no session resumption, task status lag, no nested teams). Building AQE fleet improvements on an unstable foundation could create technical debt.

- **Optimistic:** The `TeammateIdle` and `TaskCompleted` hooks are exactly what AQE fleet needs to close its learning feedback loop -- train patterns from successful work automatically, not as a post-hoc extraction.

---

### Black Hat -- Risks & Cautions

**What could go WRONG?**

| Risk | Severity | Impact |
|------|----------|--------|
| **Token cost explosion** | Critical | 15 agents x separate context windows = 15x token usage. AQE fleet runs quality checks frequently -- costs could become unsustainable |
| **Agent Teams is experimental** | High | No session resumption, task status lag, one team per session, no nested teams. These limitations could block AQE fleet patterns that depend on multi-level coordination |
| **File conflict risk** | High | Multiple QE agents analyzing the same codebase could generate conflicting test files, competing fix recommendations, or overwrite each other's outputs |
| **Complexity overhead** | High | Adding Agent Teams on top of Queen Coordinator + work stealing + CRDT sync + event bus creates 4 coordination layers. Debugging failures becomes exponentially harder |
| **Context window isolation** | Medium | Teammates don't inherit the lead's conversation history. AQE agents need deep project context for accurate quality assessment -- spawn prompts may not convey enough |
| **No nested teams** | Medium | AQE fleet uses hierarchical-mesh topology where domain leads coordinate sub-agents. Agent Teams' flat structure (lead + teammates only) doesn't map to this |
| **Shutdown coordination** | Medium | Teammates finish current requests before shutting down. In AQE fleet, a long-running mutation test or load test could block team cleanup |
| **Lead bottleneck** | Medium | The lead is fixed for the team's lifetime. If the Queen Coordinator (lead) gets overwhelmed or stuck, there's no failover |
| **Permission blast radius** | Low | All teammates inherit the lead's permissions. A security-focused AQE agent shouldn't have the same write permissions as a code-generation agent |

**Critical Assumption Risks:**
- Assuming Agent Teams will become stable/GA -- if it stays experimental or gets deprecated, AQE fleet becomes dependent on unsupported infrastructure
- Assuming mailbox messaging scales to 15+ agents -- no performance data available for large teams
- Assuming `TeammateIdle` hook latency is acceptable for real-time task reassignment

---

### Yellow Hat -- Benefits & Opportunities

**What's GOOD? What can we leverage?**

**High-Value Improvements:**

1. **Direct Inter-Agent Communication**
   - Current: Agents write to shared memory, hope others read it
   - With Agent Teams: Direct mailbox messaging enables real-time coordination
   - Impact: Security agent can immediately alert test generator about a vulnerability pattern, rather than writing to memory and waiting

2. **Competing Hypotheses for Debugging**
   - Spawn 3-5 AQE agents to investigate a test failure from different angles (flaky test? environment issue? code regression? dependency change?)
   - Agents challenge each other's theories like the "scientific debate" pattern from Agent Teams docs
   - Impact: Root cause analysis converges faster with adversarial investigation

3. **Self-Organizing Task Claiming**
   - Current: Queen assigns all tasks top-down
   - With Agent Teams: Idle agents auto-claim from shared task list via `TeammateIdle` hook
   - Impact: Reduces Queen bottleneck, enables organic load balancing alongside work stealing

4. **Neural Learning on Completion**
   - `TaskCompleted` hook with `--train-patterns` closes the learning feedback loop
   - Every successful quality gate trains the system to do it better next time
   - Impact: Fleet gets smarter over time without manual pattern extraction

5. **Quality Gate Enforcement via Hooks**
   - `TaskCompleted` hook can reject task completion (exit code 2) if quality criteria aren't met
   - Impact: Automated enforcement of coverage thresholds, security baselines, performance budgets

6. **Parallel Code Review with Specialized Lenses**
   - Direct mapping to AQE's existing agent specializations: security reviewer, performance reviewer, integration reviewer, accessibility auditor
   - Each reviews simultaneously with a different focus, then synthesize
   - Impact: Comprehensive reviews in wall-clock time of a single review

**Quick Wins:**
- Enable `TeammateIdle` hook for existing fleet agents (low effort, high impact)
- Add `TaskCompleted` hook for pattern training (closes learning gap)
- Use Agent Teams' task dependency tracking to replace manual Queen scheduling for simple workflows
- Adopt broadcast messaging for fleet-wide alerts (security vulnerabilities, environment changes)

---

### Green Hat -- Creativity & New Ideas

**What ELSE could we try?**

#### Idea 1: Hybrid Fleet Architecture (Recommended)
Don't replace Queen Coordinator with Agent Teams -- layer Agent Teams' communication on top:
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
- Queen creates multiple small Agent Teams (2-4 per domain) instead of one big team
- Each domain team has its own lead (domain coordinator) and teammates
- Queen coordinates across domain teams via existing event bus
- Stays within Agent Teams' "one team per session" limitation

#### Idea 2: Adversarial Quality Gates
Create a "Devil's Advocate" agent type that exists solely to challenge other agents' outputs:
- Test Generator produces tests -> Devil's Advocate reviews for gaps, false positives, missing edge cases
- Security Scanner reports clean -> Devil's Advocate attempts to find what was missed
- Coverage Analyst reports 95% -> Devil's Advocate identifies the untested 5% and argues why it matters
- Uses Agent Teams' direct messaging for real-time debate

#### Idea 3: Tiered Fleet Activation
Not every quality check needs 15 agents. Create activation tiers:

| Tier | Trigger | Agents | Agent Teams? | Cost |
|------|---------|--------|-------------|------|
| **Smoke** | Every commit | 2-3 (lint, unit, smoke) | No -- use subagents | Minimal |
| **Standard** | PR opened | 5-7 (+ security, coverage, integration) | Optional | Moderate |
| **Deep** | Pre-release / critical path | 12-15 (full fleet with debates) | Yes -- full Agent Teams | High |
| **Crisis** | Production incident | Dynamic (hypothesis-driven) | Yes -- competing hypotheses | Whatever it takes |

#### Idea 4: Fleet Memory Graduation
Build a knowledge pipeline from Agent Teams into AQE's learning system:
```
Task Completed
  -> TaskCompleted hook extracts patterns
  -> Patterns stored in cross-phase memory
  -> HNSW indexes for semantic retrieval
  -> ReasoningBank promotes proven patterns
  -> Future agents spawn with distilled knowledge
```
This closes the loop from "agent did good work" to "all future agents benefit."

#### Idea 5: Split-Pane Observability Dashboard
Use Agent Teams' tmux split-pane mode for fleet observability:
- Each pane shows a domain team's activity
- Real-time visibility into what every agent is doing
- Click into a pane to interact with a specific agent
- Quality metrics overlay showing pass/fail rates, coverage deltas

#### Idea 6: Cross-Fleet Federation
For monorepos or multi-service architectures, run separate AQE fleets per service that can communicate:
- Service A fleet discovers an API contract change
- Broadcasts to Service B fleet via a "federation mailbox"
- Service B fleet auto-generates contract tests for the new API
- Uses Agent Teams' broadcast messaging at the federation level

---

### Blue Hat -- Process & Action Plan

**What should we DO?**

#### Phase 1: Foundation (Weeks 1-2)
| # | Action | Owner | Priority |
|---|--------|-------|----------|
| 1.1 | Enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` in AQE project settings | Fleet Lead | P0 |
| 1.2 | Implement `TeammateIdle` hook with auto-assign for existing fleet agents | Hooks Dev | P0 |
| 1.3 | Implement `TaskCompleted` hook with pattern training integration | Hooks Dev | P0 |
| 1.4 | Add direct mailbox messaging to agent communication layer | Kernel Dev | P0 |
| 1.5 | Create fleet activation tier config (smoke/standard/deep/crisis) | Config Dev | P1 |

#### Phase 2: Hybrid Architecture (Weeks 3-4)
| # | Action | Owner | Priority |
|---|--------|-------|----------|
| 2.1 | Implement domain-scoped Agent Teams (2-4 agents per domain team) | Coordination Dev | P0 |
| 2.2 | Wire Queen Coordinator to manage multiple domain teams | Coordination Dev | P0 |
| 2.3 | Add task dependency tracking from Agent Teams to Queen's scheduler | Kernel Dev | P1 |
| 2.4 | Implement "Devil's Advocate" agent type for adversarial quality gates | Agent Dev | P1 |
| 2.5 | Complete HNSW graph construction (unified-memory.ts:672) | Memory Dev | P1 |

#### Phase 3: Learning & Observability (Weeks 5-6)
| # | Action | Owner | Priority |
|---|--------|-------|----------|
| 3.1 | Build memory graduation pipeline (TaskCompleted -> HNSW -> ReasoningBank) | Memory Dev | P0 |
| 3.2 | Complete ReasoningBank promotion implementation | Learning Dev | P1 |
| 3.3 | Add split-pane observability mode for fleet monitoring | UI Dev | P2 |
| 3.4 | Implement circuit breakers for failing domains | Kernel Dev | P1 |
| 3.5 | Add distributed tracing across agent teams | Observability Dev | P2 |

#### Phase 4: Advanced Patterns (Weeks 7-8)
| # | Action | Owner | Priority |
|---|--------|-------|----------|
| 4.1 | Implement competing hypotheses pattern for root cause analysis | Agent Dev | P1 |
| 4.2 | Add cross-fleet federation for multi-service architectures | Coordination Dev | P2 |
| 4.3 | Dynamic agent scaling based on workload metrics | Kernel Dev | P2 |
| 4.4 | Benchmark token costs across activation tiers | Performance Dev | P1 |
| 4.5 | Plan migration path for when Agent Teams exits experimental | Architect | P2 |

#### Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Inter-agent communication latency | N/A (async only) | < 500ms via mailbox | Message round-trip time |
| Root cause analysis convergence | Single-hypothesis | Multi-hypothesis in parallel | Time-to-root-cause |
| Learning feedback loop | Manual/partial | Automated via hooks | Patterns trained per completed task |
| Fleet activation efficiency | Always full fleet | Tiered (2-15 agents) | Token cost per quality check |
| Quality gate enforcement | Manual review | Automated via TaskCompleted hook | Rejection rate, false positive rate |
| Agent idle time | Unknown | < 10% via auto-claim | Idle time / total time ratio |

#### Key Decisions Required

1. **Stability dependency**: Do we build on Agent Teams while it's experimental, or wait for GA? *Recommendation: Build with a fallback layer so AQE fleet works with or without Agent Teams enabled.*

2. **Cost model**: What's the acceptable token budget for full Agent Teams integration? *Recommendation: Start with tiered activation to control costs, measure before scaling.*

3. **Topology mapping**: How do we map hierarchical-mesh to Agent Teams' flat model? *Recommendation: Multiple small domain teams (Idea 1), not one giant team.*

4. **Permission model**: Should all agents share permissions or have role-based access? *Recommendation: Implement role-based permissions at the Queen level since Agent Teams doesn't support per-teammate modes at spawn.*

---

## Summary

The AQE fleet has a strong foundation (Queen Coordinator, 50+ agents, DDD domains, work stealing, CRDT sync) but lacks the direct communication and self-organizing patterns that Claude Code Agent Teams provides. The biggest opportunities are:

1. **Direct mailbox messaging** to replace async-only memory coordination
2. **TeammateIdle/TaskCompleted hooks** to close the learning feedback loop
3. **Competing hypotheses pattern** for faster root cause analysis
4. **Tiered fleet activation** to control token costs
5. **Hybrid architecture** that layers Agent Teams communication on top of Queen Coordinator

The biggest risks are token cost escalation, Agent Teams' experimental status, and coordination complexity. The mitigation is a phased rollout with tiered activation and a fallback layer.

**Bottom line:** Don't replace the Queen -- give her a better communication system.
