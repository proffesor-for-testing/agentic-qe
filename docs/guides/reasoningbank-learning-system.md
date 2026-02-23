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

## Embedding Architecture

The ReasoningBank pipeline uses **384-dimensional** embeddings from `all-MiniLM-L6-v2` (via `computeRealEmbedding` in `v3/src/learning/real-embeddings.ts`). These are used for:
- Semantic memory search (`memory_query` with `semantic: true`)
- Experience replay similarity matching
- Pattern store HNSW indexing

Note: The `coverage-analysis` and `code-intelligence` domains maintain **separate** HNSW indices with 768-dim embeddings for their domain-specific use cases. These do not share indices with the ReasoningBank.

---

## Key Implementation Files (v3)

| File | Role |
|---|---|
| `v3/src/learning/qe-reasoning-bank.ts` | Primary ReasoningBank class |
| `v3/src/learning/real-qe-reasoning-bank.ts` | Production standalone with real embeddings + HNSW |
| `v3/src/learning/sqlite-persistence.ts` | SQLite qe_patterns table, usage tracking, promotion |
| `v3/src/learning/asymmetric-learning.ts` | 10:1 failure penalty engine with quarantine |
| `v3/src/learning/experience-capture.ts` | Task experience lifecycle |
| `v3/src/learning/experience-capture-middleware.ts` | Auto-capture wrapper for all task execution |
| `v3/src/learning/dream/dream-engine.ts` | Dream cycle orchestrator |
| `v3/src/learning/dream/dream-scheduler.ts` | Automated dream triggers |
| `v3/src/hooks/task-completed-hook.ts` | Quality gate + pattern extraction |
| `v3/src/hooks/reasoning-bank-pattern-store.ts` | Adapter bridging hooks to ReasoningBank |
| `v3/src/mcp/services/reasoning-bank-service.ts` | Singleton MCP service for routing + trajectory |
| `v3/src/mcp/handlers/memory-handlers.ts` | MCP memory tools with MemoryWriteGate |
| `v3/src/mcp/tools/learning-optimization/dream.ts` | MCP dream tool |
| `v3/src/integrations/agentic-flow/reasoning-bank/index.ts` | Enhanced adapter combining all subsystems |
| `v3/src/integrations/agentic-flow/reasoning-bank/experience-replay.ts` | HNSW experience storage and retrieval |
