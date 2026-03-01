# MADR-{ID}: {Strategic Initiative Title}

| Field | Value |
|-------|-------|
| **Decision ID** | MADR-{ID} |
| **Type** | Master ADR |
| **Initiative** | {Programme/Project Name} |
| **Proposed By** | {Author} |
| **Date** | {YYYY-MM-DD} |
| **Aggregate Status** | {Calculated from children} |

---

## WH(Y) Decision Statement

**In the context of** {strategic context - the overarching system or programme},

**facing** {strategic challenge - the high-level problem or opportunity},

**we decided for** {strategic direction - the approach or initiative},

**and neglected** {alternative strategies considered},

**to achieve** {strategic benefits - high-level outcomes},

**accepting that** {strategic trade-offs - complexity, cost, coordination required}.

---

## Strategic Context

{Detailed description of the business or technical drivers behind this initiative.
What market forces, technical constraints, or organizational goals motivated this?}

---

## Scope Boundary

### In Scope

- {Decision area 1}
- {Decision area 2}
- {Decision area 3}

### Out of Scope

- {Excluded area 1}
- {Excluded area 2}

---

## Child ADR Registry

| ADR ID | Title | Status | Phase | Owner |
|--------|-------|--------|-------|-------|
| ADR-{xxx} | {Title} | Proposed / Approved / Implemented | {Phase number} | {Team} |
| ADR-{xxx} | {Title} | {Status} | {Phase} | {Team} |
| ADR-{xxx} | {Title} | {Status} | {Phase} | {Team} |

<!--
Aggregate Status Rules:
- Proposed: No child ADRs approved yet
- In Progress: At least one child approved, others pending
- Approved: All required child ADRs approved
- Partially Implemented: Some child ADRs implemented
- Completed: All child ADRs implemented or retired
- Blocked: Any child ADR rejected or has unresolved conflict
-->

---

## Decision Sequencing

### Phase 1: {Phase Name} (Foundation)

{Description of this phase's objectives}

**Included ADRs:**
- ADR-{xxx}: {Title}
- ADR-{xxx}: {Title}

**Prerequisites:** None

### Phase 2: {Phase Name}

{Description}

**Included ADRs:**
- ADR-{xxx}: {Title}
- ADR-{xxx}: {Title}

**Prerequisites:** Phase 1 complete

### Phase 3: {Phase Name}

{Description}

**Included ADRs:**
- ADR-{xxx}: {Title}

**Prerequisites:** Phase 1 and 2 complete

---

## Progress Dashboard

```
MADR-{ID}: {Title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Aggregate Status: {Status} ({X}/{Y} approved)

Phase 1: {Name}
  [✓] ADR-xxx: {Title} (Implemented)
  [✓] ADR-xxx: {Title} (Approved)

Phase 2: {Name}
  [~] ADR-xxx: {Title} (Under Review)
  [ ] ADR-xxx: {Title} (Proposed)

Progress: ████████░░░░░░░░ {X}%
```

---

## Aggregate Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | {YYYY-MM-DD} | Initial creation |
| In Progress | {YYYY-MM-DD} | First child ADR approved |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| {Board Name} | {Date} | {Outcome} | {Date} |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| {REF-ID} | {Title} | {Type} | {Location} |

---

## Definition of Done

This Master ADR is complete when:

- [ ] All child ADRs identified and registered
- [ ] Phase sequencing defined with dependencies
- [ ] All Phase 1 (Foundation) ADRs approved
- [ ] Progress dashboard reflects current state
- [ ] Governance review scheduled
