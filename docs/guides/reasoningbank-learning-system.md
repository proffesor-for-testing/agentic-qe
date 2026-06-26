# AQE ReasoningBank Learning System — User Guide

## What It Is

The ReasoningBank is a **self-improving memory system** that learns from every QE task you run. It remembers what worked, penalizes what failed, and uses those patterns to make future tasks faster and smarter. Everything persists in `.agentic-qe/memory.db` (SQLite + HNSW vector index).

---

## The Two Entry Points

### 1. Using QE Agents/Skills (from Claude Code)

When you invoke a QE skill (e.g. `/aqe-generate`, `/aqe-analyze`) or spawn a QE agent via the Task tool:

```
You run a skill/agent
       │
       ▼
┌─────────────────────────────┐
│  SessionStart Hook fires    │  ← loads 22+ foundational patterns
│  QEReasoningBank.initialize │  ← seeds cross-domain patterns (once)
│  routeTask() scores agents  │  ← picks best agent based on past patterns
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  UserPromptSubmit Hook      │  ← analyzes your prompt
│  Recommends agent + domain  │  ← e.g. "qe-test-architect, confidence 0.31"
│  Injects guidance from      │     past patterns into agent context
│  past successes             │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Agent executes task        │
│  ExperienceCaptureMiddleware│  ← silently wraps execution
│  records every step         │  ← stores to captured_experiences table
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  TaskCompleted Hook fires   │
│  1. Quality gate check      │  ← pass/fail on coverage, tests, security
│  2. Pattern extraction      │  ← domain-specific strategies pull patterns
│  3. recordOutcome()         │  ← updates confidence via asymmetric learning
│  4. Promotion check         │  ← short-term → long-term if qualified
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  DreamScheduler queues      │  ← experience added to buffer
│  experience for offline     │  ← triggers dream if 20+ buffered
│  consolidation              │     or hourly timer fires
└─────────────────────────────┘
```

**What you see as user:** The `[hooks]` log lines at session start showing pattern counts and domain recommendations. That's the system loading its memory and advising the routing.

### 2. Using MCP Tools / CLI Commands

When you call MCP tools directly:

| MCP Tool | What it does for learning |
|---|---|
| `memory_store` | Stores data, but first runs **MemoryWriteGate** (ADR-058) — checks for contradictions against existing patterns. Blocks or warns if contradicting. |
| `memory_retrieve` | Direct key lookup from namespaced memory |
| `memory_query` | Two modes: glob pattern (`pattern:*`) or **semantic HNSW search** (natural language → vector → O(log n) nearest neighbors) |
| `memory_share` | Transfers knowledge between agents across domains |
| `qe/learning/dream` | Manually trigger dream cycles, view insights, apply insights as new patterns |

The `ReasoningBankService` singleton sits behind all MCP task handlers. Every MCP task call automatically:
1. Calls `startTaskTrajectory()` — begins recording
2. Calls `recordTrajectoryStep()` — logs each action
3. `endTaskTrajectory()` is called automatically via two mechanisms:
   - **Event-driven**: `subscribeTrajectoryEvents()` listens for `TaskCompleted`/`TaskFailed` events on the `CrossDomainEventRouter` (set up once during fleet init)
   - **Startup cleanup**: `cleanupOrphanedTrajectories()` marks stale trajectories (>1 hour old, never completed) as failed at initialization

### 3. Inspecting & Steering — CLI Commands

The learning system runs invisibly, but a standalone CLI (no claude-flow required) lets you inspect and steer it directly. These read/write the same `.agentic-qe/memory.db`.

```bash
# Health & metrics — pattern counts by tier/domain, success rate,
# routing confidence, asymmetric-learning quarantine/rehab counts, HNSW stats
npx aqe learning stats            # add --detailed for per-pattern-type breakdown, --json for raw
npx aqe learning health           # learning-loop health check
npx aqe learning dashboard        # at-a-glance dashboard

# Promote qualified short-term patterns → long-term (see Pattern Lifecycle)
npx aqe learning consolidate

# Trigger / inspect dream consolidation manually
npx aqe learning dream

# Share patterns between projects
npx aqe learning export --output patterns.json
npx aqe learning import --input patterns.json

# Safety & maintenance (memory.db is irreplaceable — back up before destructive ops)
npx aqe learning backup
npx aqe learning verify           # PRAGMA integrity + schema version
npx aqe learning restore
```

Memory is also directly addressable:

```bash
npx aqe memory store  --key "auth-jwt-pattern" --value '{"approach":"..."}' --namespace patterns
npx aqe memory search --query "how to mock HTTP"     # semantic HNSW search
npx aqe memory get    --key "auth-jwt-pattern" --namespace patterns
```

`aqe learning stats` is the fastest way to answer *"is the system actually learning?"* — its **Routing Requests**, **Avg Routing Confidence**, **Learning Outcomes**, and **Pattern Success Rate** lines are the same numbers surfaced at session start (see *Understanding the Numbers* below).

---

## The 4-Stage Learning Pipeline

This is what happens under the hood with every task:

**Stage 1 — RETRIEVE**: Before your task runs, the system searches HNSW for similar past experiences. If found, it injects guidance: recommended strategy, suggested actions, pitfalls to avoid, estimated token savings.

**Stage 2 — JUDGE**: After task completion, the `AsymmetricLearningEngine` (ADR-061) evaluates the outcome:
- Success: confidence +0.1
- Failure: confidence **-1.0** (10:1 penalty ratio)
- Security domain: **20:1** penalty ratio
- Infrastructure errors (ECONNREFUSED, ETIMEOUT): **no penalty** — the system distinguishes infra failures from real failures

**Stage 3 — DISTILL**: The `TaskCompletedHook` extracts domain-specific patterns:
- `test-generation` → test templates, assertion patterns, mock patterns
- `coverage-analysis` → coverage strategies, mutation strategies
- `security-compliance` → security patterns, vulnerability fixes
- Up to 5 patterns extracted per task

**Stage 4 — CONSOLIDATE**: The `DreamScheduler` runs offline consolidation:

| Trigger | When | Duration |
|---|---|---|
| Timer | Every 1 hour | 10s |
| Experience buffer full | 20+ experiences queued | 10s |
| Quality gate failure | Any gate fails | 5s (quick) |
| Milestone reached | Domain milestone event | 10s |

During a dream cycle, the `DreamEngine`:
1. Loads all patterns with confidence >= 0.3 into a concept graph
2. Runs **spreading activation** (20 iterations with 0.1 decay, 0.5 spread factor)
3. Finds novel associations between co-activated concepts
4. Generates insights (correlation, anomaly, optimization, anti-pattern, novel)
5. Auto-applies high-confidence insights (>= 0.8) as new patterns

---

## Pattern Lifecycle

```
New pattern stored (short-term, confidence ~0.5)
       │
       ├── Success × 3+ AND successRate >= 70% AND confidence >= 60%
       │          │
       │          ▼
       │   Coherence gate check (ADR-052)
       │          │
       │    ┌─────┴─────┐
       │    │ Pass       │ Fail (contradicts existing long-term patterns)
       │    ▼            ▼
       │  Promoted to    Blocked — stays short-term
       │  long-term      PromotionBlockedEvent published
       │
       ├── Failure streak → confidence drops below 0.3
       │          │
       │          ▼
       │   Quarantined (AsymmetricLearningEngine)
       │          │
       │          ├── 10 consecutive successes → rehabilitated
       │          └── stays quarantined (excluded from guidance)
       │
       └── Drift detected (embedding changes over time)
                  │
                  ▼
           PatternEvolution recommends: update | branch | deprecate
```

---

## Learning From Failure — Kept Nulls (ADR-110)

Most learning systems only remember wins, which creates survivorship bias: a pattern that succeeded 12 times but quietly failed 3 times in *your* kind of project keeps getting recommended. AQE fixes this with **first-class negative pattern records** ("nulls").

When a retrieved pattern is applied and **fails**, the system keeps the failure — it does not delete or zero the pattern (a pattern wrong in one context may be right in another, and a deleted failure is unauditable). Each null records:

- the **pattern id** that failed,
- a **context fingerprint** (so failures cluster by where they happen — e.g. monorepo vs. single-package),
- the **failure mode**, an optional **trajectory reference**, and an **evidence class** (`EXECUTED`, `STATIC`, `INFERRED`, `CONJECTURE` — verdict-pipeline failures are `EXECUTED`).

Repeat failures in the same `(pattern, context)` consolidate into a count rather than piling up one row per incident, so the store stays bounded.

**How it changes what you get back:** at retrieval time, ranking is **discounted by context-matched null density**. A null in *your* context weighs more (`0.15`) than a null from elsewhere (`0.03`), and a discount floor (`0.25`) keeps even heavily-nulled patterns retrievable — nulls *inform* ranking, they never erase a pattern. So instead of an unblemished hit, a retrieval effectively tells the agent *"succeeded 12×, failed 3× — failures cluster in monorepo contexts,"* and agents stop re-trying documented dead ends.

This is independent of the asymmetric confidence penalty (ADR-061): the same FAILURE verdict both records a null (the *where/why*) and applies the Hebbian penalty (the *global weight*). A quarantined pattern with no nulls signals one catastrophic failure; an active pattern with clustered nulls signals systematic failure in that context only.

*Implementation: `src/learning/pattern-null-store.ts`, table `qe_pattern_nulls` (schema v10, migration `20260611_add_pattern_nulls_table`).*

---

## Cross-Domain Transfer

Patterns learned in one domain automatically transfer to related domains:

- `test-generation` ↔ `test-execution`, `coverage-analysis`, `requirements-validation`
- `security-compliance` ↔ `code-intelligence`, `quality-assessment`
- 12 domains total with a compatibility matrix

Transferred patterns get **80% of source confidence** (decayed to prevent over-trust). The transfer runs once per database lifetime at initialization, and ongoing via `ExperienceCaptureService.shareAcrossDomains()`.

---

## What You Actually See

1. **Session start logs**: `AQE Learning: 22 patterns loaded. Top domains: test-generation(2)...`
2. **Agent recommendations**: `"recommendedAgent": "qe-test-architect", "confidence": 0.313` with guidance array
3. **Dream status**: `"pendingExperiences": 103` — experiences waiting for next consolidation
4. **MCP dream tool**: Call `qe/learning/dream` with action `insights` to see what the system has discovered
5. **Fleet status learning metrics**: `fleet_status` includes a `learning` field with real counts from SQLite:
   ```json
   "learning": {
     "totalPatterns": 6029,
     "totalExperiences": 1074,
     "totalTrajectories": 167,
     "vectorCount": 124,
     "experienceApplications": 3,
     "dreamCycles": 243,
     "embeddingDimension": 384
   }
   ```
6. **Memory usage**: `memory_usage` reports real vector count and namespace count from the backend
7. **Persistence**: `memory_store` confirms `"persisted": true` — all data goes to SQLite

The system is designed to be invisible during normal use — it silently captures, learns, and improves routing/guidance without requiring explicit user interaction. The MCP tools and dream commands give you manual access when you want to inspect or steer the learning.

---

## Understanding the Numbers

At session start (and from `aqe learning stats`) you'll see a line like:

```
AQE Learning: 145 patterns loaded. Pattern success rate: 73%. Routing confidence: 40% across 2165 requests.
```

These are **real queries against your local `memory.db`**, not estimates:

| Metric | What it means | Why it moves |
|---|---|---|
| **patterns loaded** | Total patterns in the DB (short- + long-term) | Grows as tasks distill new patterns; pre-seeded with ~22 |
| **pattern success rate** | Weighted average of how often patterns succeeded when applied | Reflects pattern quality; the 10:1 penalty keeps it honest |
| **routing confidence** | How sure the router is about which agent to pick for a task | **Starts low and rises with use** |
| **across N requests** | How many routing decisions have been recorded | Sample size behind the confidence figure |

**Why routing confidence starts around 40% and climbs slowly:** confidence is grounded in *objective outcomes* fed back into the router (a Q-learning value per agent/domain in `routing_outcomes` / `rl_q_values`, ADR-095/096/098). A fresh project has little outcome history, so the router leans on weak priors. As you run real QE tasks and their results are judged, the router accumulates evidence and its recommendations become better-grounded. A low number is not a defect — it is the system honestly reporting how much it has learned about *your* codebase so far.

---

## Cheap-Local Self-Improvement (ADR-111, opt-in)

The newest direction in self-improvement isn't about patterns — it's about **which model does the work**. Instead of paying for a frontier model on every routine QE call, AQE can route **cheap-local-first** through an escalation ladder (`local → haiku → sonnet → opus`), keeping the worker model frozen and evolving the *harness* around it.

- **Off by default.** Enable with `AQE_FREE_TIER=1` (or `enableFreeTier`).
- A measured benchmark (5 modules, n=30) showed the escalation lane reaches **~frontier quality at ~30% of the cost**, with ~83% of tasks staying $0/local; only the hard tail escalates to a paid tier.
- The accept/reject gate is **pure deterministic code** (real mutants killed, real coverage) — never an LLM judging its own output — which is what keeps the loop honest and immune to "gaming the oracle." Those objective outcomes are also what feed the router and lift routing confidence over time.

*Implementation: `src/routing/free-tier/` (`ladder.ts`, `executor.ts`, `feedback-sink.ts`). See ADR-111 for the full benchmark and the scoped "escalation-lane only" verdict.*

---

## Embedding Architecture

The ReasoningBank pipeline uses **384-dimensional** embeddings from `all-MiniLM-L6-v2` (via `computeRealEmbedding` in `src/learning/real-embeddings.ts`). These are used for:
- Semantic memory search (`memory_query` with `semantic: true`)
- Experience replay similarity matching
- Pattern store HNSW indexing

Note: The `coverage-analysis` and `code-intelligence` domains maintain **separate** HNSW indices with 768-dim embeddings for their domain-specific use cases. These do not share indices with the ReasoningBank.

---

## Key Implementation Files (v3)

| File | Role |
|---|---|
| `src/learning/qe-reasoning-bank.ts` | Primary ReasoningBank class |
| `src/learning/real-qe-reasoning-bank.ts` | Production standalone with real embeddings + HNSW |
| `src/learning/sqlite-persistence.ts` | SQLite qe_patterns table, usage tracking, promotion |
| `src/learning/asymmetric-learning.ts` | 10:1 failure penalty engine with quarantine |
| `src/learning/pattern-null-store.ts` | Kept-nulls: negative pattern records + retrieval discount (ADR-110) |
| `src/learning/experience-capture.ts` | Task experience lifecycle |
| `src/learning/experience-capture-middleware.ts` | Auto-capture wrapper for all task execution |
| `src/learning/dream/dream-engine.ts` | Dream cycle orchestrator |
| `src/learning/dream/dream-scheduler.ts` | Automated dream triggers |
| `src/hooks/task-completed-hook.ts` | Quality gate + pattern extraction |
| `src/hooks/reasoning-bank-pattern-store.ts` | Adapter bridging hooks to ReasoningBank |
| `src/mcp/services/reasoning-bank-service.ts` | Singleton MCP service for routing + trajectory |
| `src/mcp/handlers/memory-handlers.ts` | MCP memory tools with MemoryWriteGate |
| `src/mcp/tools/learning-optimization/dream.ts` | MCP dream tool |
| `src/integrations/agentic-flow/reasoning-bank/index.ts` | Enhanced adapter combining all subsystems |
| `src/integrations/agentic-flow/reasoning-bank/experience-replay.ts` | HNSW experience storage and retrieval |
| `src/routing/free-tier/` | Cheap-local-first escalation ladder + deterministic gate (ADR-111) |
| `src/cli/commands/learning.ts` | `aqe learning` CLI — stats, consolidate, dream, export/import, backup/verify |
| `src/cli/commands/memory.ts` | `aqe memory` CLI — store, search (semantic HNSW), get |
