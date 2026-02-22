# AQE Dream Cycles & Neural Learning — Full Flow Analysis

## Overview

The system uses a **biological sleep-consolidation metaphor**: during normal QE work, experiences are captured into patterns; periodically, a "dream cycle" runs spreading activation across a concept graph to discover cross-domain insights that improve future agent recommendations.

---

## Phase 1: Pattern Collection (Happens Automatically)

Every time a user runs a QE task — via **agents/skills**, **MCP tools**, or **CLI** — hook events fire on the EventBus:

| User Action | Event Fired | What Gets Captured |
|---|---|---|
| Generate tests | `qe:post-test-generation` | Test strategy, framework, success rate |
| Run coverage analysis | `qe:coverage-gap-identified` | Gap patterns, risk scores |
| Execute quality gate | `qe:quality-score` | Quality metrics, domain guidance |
| Any agent completes | `qe:agent-completion` | Duration, outcome, confidence |

The `QEReasoningBank` stores these as patterns in `qe_patterns` (SQLite) with:
- 384-dimensional vector embeddings (all-MiniLM-L6-v2 via ONNX) for HNSW search
- Confidence scores updated via **asymmetric learning** (success: +0.1, failure: -1.0 — a 10:1 penalty ratio)
- Tier classification: `short-term` → promoted to `long-term` after 3+ successful uses

**Key files:** `v3/src/learning/qe-hooks.ts`, `v3/src/learning/qe-reasoning-bank.ts`, `v3/src/learning/experience-capture.ts`

---

## Phase 2: Dream Cycle Triggers

The `DreamScheduler` (`v3/src/learning/dream/dream-scheduler.ts`) triggers dreams via four mechanisms:

| Trigger | Default Threshold |
|---|---|
| **Time-based** | Every 60 minutes |
| **Experience buffer** | Every 20 captured experiences |
| **Quality gate failure** | Any failed quality gate |
| **Background worker** | `LearningConsolidationWorker` every 30 min |

Minimum gap between dreams: **5 minutes**. Users can also trigger manually:

```bash
# CLI
aqe learning consolidate

# MCP tool
qe/learning/dream  { action: "dream" }

# Session-end hook (automatic)
.claude/helpers/learning-hooks.sh session-end
```

---

## Phase 3: What Happens During a Dream

**Core engine:** `v3/src/learning/dream/dream-engine.ts`

```
1. LOAD CONCEPTS
   └─ Top 200 patterns (confidence >= 0.3) → concept_nodes + concept_edges

2. BUILD GRAPH IN MEMORY
   └─ Pattern nodes, domain nodes, similarity edges, co-occurrence edges

3. SPREADING ACTIVATION (the actual "dreaming")
   └─ Loop until timeout (5s quick / 10s default / 30s full):
       → Pick random concept node
       → Inject noise (simulates REM sleep's reduced logical filtering)
       → Propagate activation to neighbors: weight × 0.5 spread factor
       → Decay all activations by 10% per iteration
       → Track co-activation pairs
       → Detect novel associations (both activated, no existing strong edge)

4. GENERATE INSIGHTS (4 detectors)
   ├─ Pattern merges:      Redundant patterns to consolidate
   ├─ Novel associations:  Cross-domain connections discovered
   ├─ Optimizations:       Low-performing patterns to review
   └─ Gap detection:       Errors without resolution patterns

5. PERSIST
   └─ Insights → dream_insights table (filtered: novelty >= 0.3, max 10)
   └─ Cycle metadata → dream_cycles table
```

---

## Phase 4: Applying Insights

Insights sit in `dream_insights` as pending until applied:

```bash
# View pending insights
MCP: qe/learning/dream { action: "insights" }

# Apply a specific insight (creates a real QE pattern)
MCP: qe/learning/dream { action: "apply", insightId: "..." }
```

When applied, an insight becomes a new pattern in `qe_patterns` with type mapping:
- `cross-domain` → `coverage-strategy`
- `novel-path` → `test-template`
- `cluster` → `refactor-safe`
- `high-activation` → `assertion-pattern`

If `autoApplyHighConfidenceInsights` is enabled, insights with confidence >= 0.8 are applied automatically.

---

## Phase 5: Learned Patterns Influence Future Work

On every new task, `QEReasoningBank.routeTask()` runs:

1. Embeds the task description (384-dim)
2. HNSW search in `qe_patterns` for top-k similar patterns (O(log n))
3. Scores: `similarity × 0.3 + performance × 0.4 + capabilities × 0.3`
4. Returns `recommendedAgent` + `guidance[]` array

This is visible in the session-start hook output:
```json
{
  "recommendedAgent": "qe-test-architect",
  "confidence": 0.313,
  "guidance": ["Follow AAA pattern...", "One assertion per test..."],
  "patternCount": 2
}
```

Dream-generated patterns appear in these search results, meaning **the system's own dreaming directly shapes what guidance future agents receive**.

---

## Complete Flow Diagram

```
USER RUNS QE TASK (skill, agent, MCP tool, or CLI)
        │
        ▼
  ┌─── PRE-HOOK ───────────────────────────────┐
  │  routeTask() → HNSW search qe_patterns     │
  │  Returns: agent recommendation + guidance[] │
  │  (includes dream-generated patterns!)       │
  └────────────────────────────────────────────┘
        │
        ▼
  [ Agent executes with injected guidance ]
        │
        ▼
  ┌─── POST-HOOK ──────────────────────────────┐
  │  recordOutcome() → asymmetric confidence    │
  │  storePattern() if quality >= 0.7           │
  │  promote() if usage >= 3                    │
  │  DreamScheduler.recordExperience()          │
  └────────────────────────────────────────────┘
        │
        ▼
  ┌─── DREAM TRIGGER ─────────────────────────┐
  │  20 experiences / 60 min / gate failure    │
  └────────────────────────────────────────────┘
        │
        ▼
  ┌─── DREAM CYCLE ───────────────────────────┐
  │  Load patterns → Build concept graph       │
  │  Spreading activation with noise           │
  │  Detect: merges, novel links, gaps, opts   │
  │  Store insights → dream_insights           │
  └────────────────────────────────────────────┘
        │
        ▼
  ┌─── APPLY INSIGHT ─────────────────────────┐
  │  Insight → new qe_pattern with embedding   │
  │  Available in HNSW for next routeTask()    │
  └────────────────────────────────────────────┘
        │
        └──────────► NEXT TASK (loop back to top)
```

---

## Pattern Lifecycle Management

Beyond dreams, patterns have ongoing lifecycle management (`v3/src/learning/pattern-lifecycle.ts`):

- **Daily confidence decay**: -0.01/day for unused patterns
- **Deprecation**: 3+ consecutive failures → deprecated
- **Staleness**: 30 days without use → marked stale
- **Quarantine**: Below 0.3 confidence → needs 10 consecutive successes to rehabilitate

---

## Key Files Reference

| Component | File |
|---|---|
| DreamScheduler | `v3/src/learning/dream/dream-scheduler.ts` |
| DreamEngine | `v3/src/learning/dream/dream-engine.ts` |
| ConceptGraph | `v3/src/learning/dream/concept-graph.ts` |
| SpreadingActivation | `v3/src/learning/dream/spreading-activation.ts` |
| InsightGenerator | `v3/src/learning/dream/insight-generator.ts` |
| Dream types | `v3/src/learning/dream/types.ts` |
| DB schema | `v3/src/learning/dream/schema/dream-tables.sql` |
| QE hooks (capture) | `v3/src/learning/qe-hooks.ts` |
| Experience capture | `v3/src/learning/experience-capture.ts` |
| ReasoningBank | `v3/src/learning/qe-reasoning-bank.ts` |
| Pattern store | `v3/src/learning/pattern-store.ts` |
| Asymmetric learning | `v3/src/learning/asymmetric-learning.ts` |
| Pattern lifecycle | `v3/src/learning/pattern-lifecycle.ts` |
| Pattern evolution | `v3/src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts` |
| MCP dream tool | `v3/src/mcp/tools/learning-optimization/dream.ts` |
| Learning CLI | `v3/src/cli/commands/learning.ts` |
| Background worker | `v3/src/workers/workers/learning-consolidation.ts` |
| Shell hooks | `.claude/helpers/learning-hooks.sh` |

---

## Access Points Summary

| Method | Command/Tool | What It Does |
|---|---|---|
| **CLI** | `aqe learning stats` | View pattern counts, success rates |
| **CLI** | `aqe learning consolidate` | Promote, prune, run dream cycle |
| **CLI** | `aqe learning daemon --interval 3600` | Background consolidation loop |
| **MCP** | `qe/learning/dream {action:"dream"}` | Run dream cycle on demand |
| **MCP** | `qe/learning/dream {action:"insights"}` | View pending insights |
| **MCP** | `qe/learning/dream {action:"apply"}` | Apply insight as real pattern |
| **MCP** | `qe/learning/dream {action:"status"}` | Dream scheduler status |
| **Hook** | `session-end` | Auto-consolidate on session close |
| **Hook** | `session-start` | Load patterns, show recommendations |
| **Automatic** | `DreamScheduler` | Timer/threshold/event triggers |

---

## Batch Apply Results (2026-02-22)

A batch apply of all pending actionable dream insights was performed:

### Before vs After

| Metric | Before | After |
|---|---|---|
| **Total patterns in DB** | 6,029 | 6,644 |
| **Dream-generated patterns** | 0 | 615 |
| **Pending insights** | 615 | 0 |
| **Applied insights** | 5 | 620 |
| **DB integrity** | ok | ok |

### Dream System State

- **100 total dream cycles** have been executed historically
- **0 pending insights** remaining — all actionable insights applied
- All 615 new patterns are type `coverage-strategy` (from `novel_association` insights)
- Patterns entered as `short-term` tier with confidence ~0.58
- Patterns need vector embeddings (generated lazily on first HNSW search) and successful uses to promote to `long-term`

### Batch Apply Method

For bulk insight application, direct SQL is far more efficient than per-insight CLI calls (which reinitialize the engine each time). The SQL approach:

```sql
-- Create patterns from unapplied actionable insights
INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, tier, template_json, context_json, created_at, updated_at)
SELECT
  'dream-' || di.id,
  CASE di.insight_type
    WHEN 'novel_association' THEN 'coverage-strategy'
    WHEN 'cross-domain' THEN 'coverage-strategy'
    WHEN 'pattern_merge' THEN 'refactor-safe'
    WHEN 'optimization' THEN 'test-template'
    WHEN 'gap_detection' THEN 'coverage-strategy'
    ELSE 'test-template'
  END,
  'learning-optimization', 'learning-optimization',
  'Dream: ' || di.insight_type || ' - ' || substr(di.id, -8),
  substr(di.description, 1, 500),
  di.confidence_score, 'short-term',
  json_object('type', 'workflow', 'content', COALESCE(di.suggested_action, di.description), 'variables', json_array()),
  json_object('tags', json_array('dream-generated', di.insight_type), 'complexity', 'medium'),
  datetime('now'), datetime('now')
FROM dream_insights di
WHERE di.actionable = 1 AND di.applied = 0;

-- Mark all as applied
UPDATE dream_insights SET applied = 1, pattern_id = 'dream-' || id
WHERE actionable = 1 AND applied = 0;
```

**Important:** Always backup the database before batch operations:
```bash
cp .agentic-qe/memory.db .agentic-qe/memory.db.bak-$(date +%s)
```
