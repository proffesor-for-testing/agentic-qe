# Tier 3 Benchmark Baseline Results

**Collected:** 2026-03-10T13:20Z
**Database:** `.agentic-qe/memory.db`
**Related:** Issue #334, `docs/tier3-benchmark-baseline-plan.md`

---

## Query 1: Pattern Quality by Domain

| Domain | Count | Avg Quality | Avg Success Rate | Total Usage |
|--------|-------|-------------|------------------|-------------|
| test-generation | 15,015 | 0.000383 | 0.0005 | 340 |
| learning-optimization | 615 | 0.0 | 0.0 | 0 |
| test-execution | 7 | 0.0 | 0.0 | 0 |
| coverage-analysis | 2 | 0.404111 | 0.4306 | 78 |
| security-compliance | 1 | 0.814 | 1.0 | 31 |

**Key finding:** test-generation dominates (96%) but has near-zero quality scores. Only 340 total usages across 15K patterns = 2.3% adoption.

## Query 2: Embedding Coverage

| With Embeddings | Total Patterns | Coverage % |
|-----------------|----------------|------------|
| 671 | 15,640 | 4.29% |

**Note:** Up from 0.26% (40 embeddings) in earlier snapshot. 671 embeddings now indexed.

## Query 3: Trajectory Success Rate

| Total | Successful | Success % |
|-------|-----------|-----------|
| 335 | 217 | 64.8% |

## Query 4: Pattern Tier Distribution

| Tier | Count |
|------|-------|
| short-term | 15,636 |
| archived | 3 |
| long-term | 1 |

**Key finding:** 99.97% of patterns are short-term. Only 1 pattern ever promoted to long-term. Zero heartbeat-driven promotions.

## Query 5: Routing Outcomes

| Total | Avg Quality | Avg Duration (ms) |
|-------|-------------|-------------------|
| 519 | 0.5309 | 1,024.6 |

## Query 6: Stale Patterns (>30 days)

| Stale Patterns |
|----------------|
| 0 |

**Note:** All patterns have been updated within the last 30 days. This may change as the system ages.

## Query 7: Usage Adoption Rate

| Patterns Used | Total Patterns | Adoption % |
|---------------|----------------|------------|
| 201 | 15,640 | 1.29% |

**Key finding:** Only 1.29% of stored patterns have ever been used. 98.7% are dead weight.

## Query 8: Dream Learning Effectiveness

| Status | Count | Avg Duration (ms) |
|--------|-------|-------------------|
| completed | 397 | 15,790.9 |
| failed | 279 | 6,834.0 |
| running | 18 | N/A |

**Key finding:** 58.7% completion rate (397/676 non-running). Failed dreams are ~2.3x faster — likely early exits.

## Query 9: Experience Capture Rate by Domain

| Domain | Count | Avg Quality |
|--------|-------|-------------|
| code-intelligence | 3,349 | 0.4229 |
| test-generation | 342 | 0.7684 |
| coverage-analysis | 80 | 0.71 |
| quality-assessment | 67 | 0.5224 |
| security-compliance | 31 | 0.80 |
| defect-intelligence | 2 | 0.80 |
| chaos-resilience | 1 | 0.80 |
| contract-testing | 1 | 0.80 |
| requirements-validation | 1 | 0.80 |
| test-execution | 1 | 0.80 |
| visual-accessibility | 1 | 0.80 |

**Total:** 3,876 captured experiences. code-intelligence dominates (86%) but has lowest quality.

## Query 10: Sparse/Empty Tables

| Table | Rows |
|-------|------|
| test_outcomes | 3 |
| coverage_sessions | 2 |
| goap_execution_steps | 0 |
| embeddings (legacy) | 0 |

**Note:** `test_outcomes` and `coverage_sessions` now receiving data after persistence fix (2026-03-10). Previously 0.

## Routing Detail: Agent Distribution

| Agent | Count | Avg Quality | Followed Recommendation | Successes |
|-------|-------|-------------|------------------------|-----------|
| qe-test-architect | 278 | 0.3193 | 278 | 278 |
| tier-0 (agent booster) | 195 | 0.7692 | 195 | 185 |
| tier-1 | 24 | 0.80 | 24 | 24 |
| tier-2 | 22 | 0.80 | 22 | 22 |

**Routing stats:** 100% recommendation follow rate, 98.1% success rate (519 total).

---

## Baseline Summary for Tier 3 Features

### Imp-9 (YAML Deterministic Pipelines)
- Pipeline runs tracked: 0 (no pipeline infrastructure yet)
- Token tracking: Not instrumented per-step

### Imp-10 (Token-Free Heartbeat)
- Stale patterns (>30d): 0
- Long-term promotions: 1 (ever)
- Pattern tier: 99.97% short-term, no lifecycle management active

### Imp-11 (GRPO Group Advantages)
- Current single-candidate avg quality: **0.000383** (test-generation domain)
- test_outcomes: 3 records (persistence just fixed)
- **CONTROL GROUP NEEDED:** 50 test generations before implementing GRPO

### Imp-15 (Session Reuse)
- No session-level token aggregation yet
- 335 trajectories tracked, 64.8% success rate

### Imp-18 (Economic Routing)
- 519 routing outcomes, 98.1% success rate
- Tier-0 (agent booster): 37.6% of routes, 0.77 avg quality
- qe-test-architect: 53.6% of routes, 0.32 avg quality
- Recommendation follow rate: 100%
- Avg routing duration: 1,024.6ms

---

## RVF Manifest Discrepancy

- RVF claims `embeddingCount: 911`
- Actual DB: `qe_pattern_embeddings: 671` + `vectors: 410` = 1,081
- Discrepancy likely from stale manifest (not auto-synced)
