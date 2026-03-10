# Tier 3 Benchmark Baseline Collection Plan

**Date:** 2026-03-10
**Purpose:** Capture pre-Tier-3 baselines so improvements can be measured
**Related:** Issue #334, `docs/six-hats-aqe-openclaw-analysis-2026-03-09.md`

---

## Current Database Snapshot (2026-03-10)

| Table | Rows | Purpose |
|-------|------|---------|
| qe_patterns | 15,634 | Core learned patterns |
| qe_pattern_embeddings | 40 | Vector embeddings for patterns (0.26% coverage) |
| qe_pattern_usage | 238 | Usage history records |
| qe_patterns_fts | 15,634 | FTS5 full-text search index |
| qe_trajectories | 335 | Learning trajectories (64.8% success) |
| trajectory_steps | 2,030 | Steps within trajectories |
| captured_experiences | 3,614 | Experience records |
| experience_applications | 3 | Applied experiences |
| routing_outcomes | 476 | Model routing decisions |
| vectors | 410 | General vector store |
| embeddings | 0 | Legacy embedding table (empty) |
| kv_store | 4,924 | Key-value memory |
| concept_nodes | 4,677 | Concept graph nodes |
| concept_edges | 68,283 | Concept graph edges |
| dream_cycles | 690 | Dream learning cycles |
| dream_insights | 3,950 | Generated insights |
| rl_q_values | 8 | Reinforcement learning state |
| goap_actions | 2,325 | GOAP action definitions |
| goap_goals | 53 | GOAP goal definitions |
| goap_plans | 101 | GOAP plans (all pending) |
| goap_execution_steps | 0 | GOAP execution (never run) |
| sona_patterns | 1,025 | SONA self-optimizing patterns |
| witness_chain | 12,857 | Immutable audit chain |
| test_outcomes | 0 | Test outcome tracking (empty) |
| coverage_sessions | 0 | Coverage session data (empty) |
| pattern_evolution_events | 20 | Pattern evolution history |
| pattern_relationships | 6 | Pattern parent/child links |
| pattern_versions | 8 | Pattern versioning |
| mincut_history | 501 | Min-cut analysis history |
| mincut_snapshots | 200 | Graph snapshots |
| routing_outcomes | 476 | Routing decision records |

---

## Baselines Per Tier 3 Feature

### Imp-9: YAML Deterministic Pipelines

| Metric | Baseline Value | Collection Method |
|--------|---------------|-------------------|
| Tokens per quality gate run | TBD — enable token tracking | Instrument `test-quality-gate.ts` |
| Pipeline step latency (ms) | TBD — add timing to PhaseResult | Wrap `pipeline.ts` phases |
| Pipeline success rate | TBD — no pipeline runs tracked yet | Log to `coverage_sessions` |
| LLM-parsing failure rate | TBD | Count errors in orchestrator |

**Action:** Run 20 quality gate executions with token tracking enabled, record per-step tokens and latency.

### Imp-10: Token-Free Heartbeat

| Metric | Baseline Value | Collection Method |
|--------|---------------|-------------------|
| Stale patterns (>30d no activity) | Query: `SELECT COUNT(*) FROM qe_patterns WHERE updated_at < datetime('now', '-30 days')` | SQLite query |
| Promotions to long-term tier | 0 (zero promotions ever) | `SELECT COUNT(*) FROM qe_patterns WHERE tier = 'long-term'` |
| Unflushed experiences at session end | TBD — add session-end hook counter | Hook instrumentation |
| Pattern maintenance token cost | TBD — not tracked | Enable for maintenance ops |

**Action:** Run stale pattern query weekly. Add session-end experience buffer snapshot.

### Imp-11: GRPO Group Advantages

| Metric | Baseline Value | Collection Method |
|--------|---------------|-------------------|
| Single-candidate test quality | avg 0.000381 (test-gen domain) | `SELECT AVG(quality_score) FROM qe_patterns WHERE domain = 'test-generation'` |
| Binary reward distribution | TBD — Imp-2 added this, need actual test runs | Query `test_outcomes` (currently empty) |
| Tokens per generated test | TBD | Token tracker per test-gen task |
| Test outcome categories | TBD — `test_outcomes` table is empty | Need test generation runs |

**CRITICAL — TIME SENSITIVE:** Generate 50 tests with single-candidate approach BEFORE implementing GRPO. Record quality + reward + tokens for each. This becomes the control group and cannot be collected retroactively.

### Imp-15: Session Reuse

| Metric | Baseline Value | Collection Method |
|--------|---------------|-------------------|
| Tokens per session | TBD — sparse tracking | Enable `TokenMetricsCollector` |
| Session count per operation | TBD | Tag sessions by operation type |
| Repeated operation frequency | TBD | Analyze trajectory descriptions |
| Context re-establishment cost | TBD | Measure first-N-message tokens |

**Action:** Enable session-level token aggregation for 1 week before implementing session reuse.

### Imp-18: Economic Routing

| Metric | Baseline Value | Collection Method |
|--------|---------------|-------------------|
| Routing outcomes | 476 records | `SELECT * FROM routing_outcomes` |
| Override rate | TBD — analyze routing_outcomes | `routing-feedback.ts` analyzeRoutingAccuracy() |
| Cost per quality point | TBD | Cross-reference tokens + quality |
| Tier distribution | TBD | Count routing by tier |

**Action:** Query routing_outcomes for tier distribution and success rates.

---

## Priority 1: Immediate Queries (Zero Code Changes)

Run these SQL queries now and save results as baseline:

```sql
-- 1. Pattern quality by domain
SELECT domain, COUNT(*) as cnt, AVG(quality_score) as avg_quality,
       AVG(success_rate) as avg_success, SUM(usage_count) as total_usage
FROM qe_patterns GROUP BY domain;

-- 2. Embedding coverage
SELECT
  (SELECT COUNT(*) FROM qe_pattern_embeddings) as with_embeddings,
  (SELECT COUNT(*) FROM qe_patterns) as total_patterns,
  ROUND(CAST((SELECT COUNT(*) FROM qe_pattern_embeddings) AS FLOAT) /
        (SELECT COUNT(*) FROM qe_patterns) * 100, 2) as coverage_pct;

-- 3. Trajectory success rate
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
  ROUND(AVG(success) * 100, 1) as success_pct
FROM qe_trajectories;

-- 4. Pattern tier distribution
SELECT tier, COUNT(*) as cnt FROM qe_patterns GROUP BY tier;

-- 5. Routing outcome distribution
SELECT COUNT(*) as total,
       AVG(quality_score) as avg_quality,
       AVG(duration_ms) as avg_duration_ms
FROM routing_outcomes;

-- 6. Stale patterns (no activity in 30 days)
SELECT COUNT(*) FROM qe_patterns
WHERE updated_at < datetime('now', '-30 days');

-- 7. Usage adoption rate
SELECT
  (SELECT COUNT(DISTINCT pattern_id) FROM qe_pattern_usage) as patterns_used,
  (SELECT COUNT(*) FROM qe_patterns) as total_patterns;

-- 8. Dream learning effectiveness
SELECT status, COUNT(*) as cnt, AVG(duration_ms) as avg_ms
FROM dream_cycles GROUP BY status;

-- 9. Experience capture rate
SELECT COUNT(*) as total, domain, AVG(quality) as avg_quality
FROM captured_experiences GROUP BY domain ORDER BY total DESC;

-- 10. Empty tables (features not producing data)
-- test_outcomes: 0, coverage_sessions: 0, goap_execution_steps: 0,
-- embeddings: 0, hypergraph: 0, mincut_observations: 0
```

## Priority 2: Light Instrumentation (~100 LOC)

1. Pipeline phase timer — wrap PhaseResult with `performance.now()`
2. Session-end buffer snapshot — log unflushed experience count
3. Token recording activation — ensure TokenMetricsCollector writes to DB
4. Search latency wrapper — time HNSW + FTS5 queries
5. Routing decision tier tag — log which model tier was used

## Priority 3: GRPO Control Group (Manual, Time-Sensitive)

Before implementing Imp-11:
1. Run 50 test generations with current single-candidate approach
2. Record: quality_score, binary_reward, tokens_used, duration_ms
3. Save results to `docs/grpo-baseline-2026-03-10.json`
4. This is the ONLY metric that cannot be collected retroactively

---

## Sync Verification

### RVF Manifest Discrepancy
- RVF claims `embeddingCount: 911`
- Actual DB: `qe_pattern_embeddings: 40` + `vectors: 410` = 450
- **Investigate:** How does RVF compute embeddingCount? Possible double-count or stale manifest.

### GCloud Backup
- Verify backup script includes all 49 tables
- Verify WAL checkpoint before backup
- Verify backup restoration produces identical row counts
