# ADR-{ID}: {Title}

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-{ID} |
| **Status** | Proposed |
| **Date** | {YYYY-MM-DD} |
| **Author** | {Author Name} |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** {describe the functional context - what system, component, or capability this decision affects},

**facing** {describe the non-functional concern - the challenge, constraint, or quality attribute driving this decision},

**we decided for** {state the decision clearly - the specific technology, pattern, approach, or standard chosen},

**and neglected** {list alternatives considered but rejected - include brief reason if helpful},

**to achieve** {list expected benefits - the quality attributes or capabilities gained},

**accepting that** {acknowledge trade-offs - costs, risks, limitations, or technical debt introduced}.

---

## Context

{Provide 2-3 paragraphs of background. Focus on:
- What problem or opportunity triggered this decision?
- What constraints or requirements shape the solution space?
- What prior decisions or existing architecture influences this choice?

Do NOT include implementation details, code examples, or configuration here.}

---

## Options Considered

### Option 1: {Selected Option Name} (Selected)

{Brief description of the approach}

**Pros:**
- {Benefit 1}
- {Benefit 2}

**Cons:**
- {Limitation 1}
- {Limitation 2}

### Option 2: {Alternative Name} (Rejected)

{Brief description of the approach}

**Why rejected:** {1-2 sentences explaining why this wasn't chosen}

### Option 3: {Another Alternative} (Rejected)

{Brief description}

**Why rejected:** {1-2 sentences}

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-{xxx} | {Title} | {Why this dependency exists} |
| Relates To | ADR-{xxx} | {Title} | {How they relate} |
| Part Of | MADR-{xxx} | {Title} | {Parent initiative} |

<!--
Relationship types:
- Depends On: This ADR requires another ADR to be in place
- Supersedes: This ADR replaces a previous ADR
- Relates To: Shared context, should be considered together
- Refines: This ADR provides detail for a broader decision
- Part Of: This ADR is a child of a Master ADR
-->

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-{ID}-A | {Primary Spec Title} | Technical Spec | [specs/SPEC-{ID}-A-{slug}.md](../../specs/SPEC-{ID}-A-{slug}.md) |
| SPEC-{ID}-B | {Secondary Spec Title} | Implementation Guide | [specs/SPEC-{ID}-B-{slug}.md](../../specs/SPEC-{ID}-B-{slug}.md) |

<!--
Reference types:
- Technical Specification: Detailed technical design
- Implementation Guide: Step-by-step implementation instructions
- Migration Guide: Migration procedures and scripts
- Configuration Standard: Standard configuration templates
- API Specification: OpenAPI/AsyncAPI definitions
-->

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| {Team/Board Name} | {YYYY-MM-DD} | Proposed | {YYYY-MM-DD} |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | {YYYY-MM-DD} | Initial creation |

<!--
Status progression:
- Proposed → Under Review → Approved → Implemented
- Or: Proposed → Rejected
- Or: Implemented → Superseded (by ADR-xxx)
-->

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Approach validated (PoC, prior art, or expert input)
- [ ] **C - Criteria**: At least 2 options compared systematically
- [ ] **A - Agreement**: Relevant stakeholders consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: All relationships documented with typed relationships
- [ ] **Rf - References**: Implementation details in SPEC files, all links valid
- [ ] **M - Master**: Linked to Master ADR if part of larger initiative
