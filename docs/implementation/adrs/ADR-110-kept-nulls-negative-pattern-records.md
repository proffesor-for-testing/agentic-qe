# ADR-110: Kept Nulls — Negative Pattern Records in the Learning Loop

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-110 |
| **Status** | Implemented |
| **Date** | 2026-06-11 |
| **Author** | AQE Core (Pattern Space cross-pollination initiative, gist `3efec1f`) |
| **Review Cadence** | 6 months |
| **Related** | ADR-104 (arena — losing strategies), ADR-061 (asymmetric learning rates — Hebbian penalties decide *when* a pattern quarantines; nulls record *why* and *where*), ADR-070 (witness chain — null creation is a witnessed pattern mutation), ADR-098 (learning routing hardening — retrieval consumer of null-discounted ranking), ReasoningBank verdict pipeline, `qe_patterns` table |

---

## WH(Y) Decision Statement

**In the context of** AQE's learning loop — ReasoningBank trajectories with verdicts, distilled patterns in `qe_patterns`, arena tournament outcomes — where retrieval surfaces patterns that previously *succeeded*,

**facing** survivorship bias at the **pattern** level: a trajectory verdict records that a run failed, but when a *learned pattern* is retrieved, applied, and fails in a new context, nothing first-class records "tried, didn't hold here, this is why" — so pattern-search re-recommends the same dead end and agents re-derive the same wrong hypothesis; and inspired by the discipline that made Pattern Space auditable — committed nulls (`PLANNED-grip-trajectory.md`: "the hypothesis was NOT supported; null kept", the falsification ledger where most axioms died in public) — and by the one place that discipline broke (the v2.1 losing run never committed) being the project's most expensive wound,

**we decided for** first-class **negative pattern records**: (1) when an applied pattern fails, store a linked null record (pattern id, context fingerprint, failure mode, evidence class per ADR-105) in the same store, so retrieval returns the pattern **with** its kept nulls and agents see "succeeded 12×, failed 3× — failures clustered in monorepo contexts" instead of an unblemished hit; (2) retrieval ranking discounts patterns by context-matched null density (a null in *your* context outweighs successes elsewhere); (3) arena keeps losing strategies and their loss reasons as queryable records, feeding Phase 2 distillation with both poles; (4) abandoned or unfavorable benchmark runs are committed with reasons (jointly with ADR-108),

**and neglected** deleting or down-weighting-to-zero failed patterns (a pattern that fails in one context may be right in another — the null is *information*, not a tombstone; deletion is exactly what made Pattern Space's missing v2.1 data unauditable), a separate nulls table disconnected from retrieval (nulls that don't surface at decision time change nothing), and global failure penalties without context fingerprints (ADR-061's asymmetric learning rates already handle global weighting; the new information is *where* it fails),

**to achieve** a learning loop that converges on patterns that won rather than patterns that merely survived, agents that stop re-trying documented dead ends, and a memory store whose negative space is as queryable as its positive — treating the 1K+ learning records' *gaps* as data,

**accepting that** null records grow the store (bounded: nulls consolidate per pattern × context-fingerprint rather than accumulating per incident), context fingerprints are imperfect (a wrong cluster mis-scopes a null — mitigated by including the trajectory reference so agents can read the original failure), and honest null-reporting depends on agents admitting failure (the verdict pipeline already judges outcomes independently of agent self-report).

---

## Options Considered

### Option 1: Linked null records with context fingerprints, surfaced at retrieval (Selected)
**Pros:** converts failures into retrievable evidence; preserves the pattern while scoping its limits; symmetric with the existing verdict pipeline; the consolidation rule bounds growth.

### Option 2: Hard deletion / zeroing of failed patterns (Rejected)
**Why rejected:** destroys information and audit trail — the un-committed v2.1 run is the cautionary tale; and a context-specific failure is not a global falsification.

### Option 3: Status quo — trajectory verdicts only (Rejected)
**Why rejected:** verdicts record run outcomes; nothing connects a failure back to the *pattern* that recommended the approach, which is where the next retrieval decision happens.

## Implementation Sketch

1. Schema: `qe_pattern_nulls` (pattern_id FK, context_fingerprint, failure_mode, trajectory_ref, evidence class, consolidated count) — additive migration, **no changes to existing tables' data** (per data-protection absolutes: backup + row-count verification before/after).
2. Hook: post-task verdict of FAILURE on a pattern-guided trajectory writes/consolidates a null. **Sequencing vs ADR-061**: null recording and the Hebbian confidence penalty are independent effects of the same FAILURE verdict — both fire, in either order; quarantine (ADR-061's threshold) neither requires nor suppresses a null. A quarantined pattern with no nulls signals one catastrophic failure; an active pattern with clustered nulls signals systematic failure in that context only.
3. Retrieval: pattern-search responses include null summaries; ranking applies context-matched discount.
4. Arena: persist losing strategies + loss reasons into namespace `arena` alongside winners.
