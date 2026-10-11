# ADR-134: Conservative duration fallback for unestimated GOAP actions

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-134 |
| **Status** | Implemented |
| **Date** | 2026-10-11 |
| **Author** | Rudy Celekli (decision); templated by AQE Core |
| **Review Cadence** | 6 months |
| **Supersedes** | — |
| **Related** | [#953](https://github.com/proffesor-for-testing/agentic-qe/pull/953), maintainer follow-up [#911](https://github.com/proffesor-for-testing/agentic-qe/issues/911) |

---

## WH(Y) Decision Statement

**In the context of** the GOAP planner (`src/planning/goap-planner.ts`), which
searches for action sequences under a `maxDurationMs` budget and reuses stored
plans,

**facing** actions with no declared duration estimate counting as zero, so plans
made of them bypassed the duration budget, including on the stored-plan reuse
path, and a startup estimate backfill that could commit only part of its updates,

**we decided for** budgeting every unestimated action at a fixed 1000 ms
(`DEFAULT_ACTION_DURATION_MS`) wherever durations are summed or checked, and for
running the library estimate backfill in one SQLite transaction that is skipped
when nothing is missing,

**and neglected** treating missing estimates as free, rejecting unestimated
actions outright, a new configuration option, and per-row backfill commits,

**to achieve** a duration budget that unestimated plans cannot slip past, the same
answer from search and from plan reuse, and an all-or-nothing backfill,

**accepting that** some plans that previously fit a tight budget no longer do, and
that 1000 ms is a planning estimate, not a measured runtime or a deadline.

---

## Context

GOAP actions may declare `estimatedDurationMs`. Declared estimates are persisted
and used to enforce `maxDurationMs`. Custom actions and some library actions
have no estimate, and the planner summed them as `0`. A plan made only of such
actions therefore always fit any budget, and stored-plan reuse validated its
total the same way.

Startup backfills missing estimates for library actions from their definitions.
That ran one `UPDATE` per action outside a transaction, so a failure part-way
through left some rows updated and others not.

This is a policy decision, not only a bug fix: it fixes what the planner assumes
about an action it knows nothing about, which affects which plans are admissible.

---

## Options Considered

### Option 1: Fixed 1000 ms fallback (Selected)

Budget an undeclared action at 1000 ms in search expansion, in returned plan
totals, in stored-reuse totals, and in reuse constraint validation. An explicit
`0` and any declared estimate are kept as they are. The backfill keeps its
existing narrow definition-match predicate and caller overrides, runs inside one
`db.transaction`, and is skipped when a quick query finds no missing estimates.

**Pros:**
- Missing information is no longer free; budgets bound every plan.
- Search and reuse agree because they use the same constant.
- No new API or configuration surface.

**Cons:**
- One fixed number cannot fit every action; some plans are over- or under-budgeted.
- Previously accepted tight-budget plans can now be rejected.

### Option 2: Treat missing estimates as zero (Rejected)

The previous behavior.

**Why rejected:** Treats missing information as free execution and lets plans
bypass `maxDurationMs`.

### Option 3: Reject unestimated actions (Rejected)

Exclude any action without an estimate from planning.

**Why rejected:** Existing custom actions would stop participating in plans.

### Option 4: Make the fallback configurable (Rejected)

**Why rejected:** A new configuration surface is not needed to restore a
conservative default; it can be added later if a real need appears.

### Option 5: Keep per-row backfill commits (Rejected)

**Why rejected:** Separate commits cannot give an all-or-nothing backfill when one
update fails.

---

## Consequences

- Unestimated actions may no longer fit budgets they fitted before.
- The 1000 ms value is a planning estimate. It does not measure or limit runtime.
- A failed backfill rolls back all of its duration updates. Other initialization
  migrations are not made transactional by this change.
- Startup runs one small "any missing estimate?" query. Custom rows that match no
  library definition keep a missing estimate and are not given a guessed value.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Refines | [ADR-046](./ADR-046-v2-feature-integration.md) | V2 Feature Integration (Q-Values, GOAP, Dreams) | Introduced the GOAP planner and its action library |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| PR-953 | fix(planning): budget missing estimates and backfill atomically | Pull Request | [#953](https://github.com/proffesor-for-testing/agentic-qe/pull/953) |
| ISSUE-911 | GOAP: unestimated actions bypass maxDurationMs; run duration backfill in a transaction | Issue | [#911](https://github.com/proffesor-for-testing/agentic-qe/issues/911) |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Implemented | 2026-10-11 | Merged in #953; converted from an unnumbered ADR to the template |
