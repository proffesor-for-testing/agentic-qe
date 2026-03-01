# ADR-045: Version-Agnostic Naming

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-045 |
| **Status** | Implemented |
| **Date** | 2026-01-14 |
| **Author** | Migration Analysis Agent |
| **Review Cadence** | 12 months |

---

## WH(Y) Decision Statement

**In the context of** Agentic QE's agent, skill, and CLI naming conventions across 47 agents, 12 skills, and 2 CLI binaries,

**facing** version lock-in from `v3-` prefixes that would require renaming everything on each major version, user confusion between v2 naming (`qe-*`) and v3 naming (`v3-qe-*`), documentation debt requiring updates on every version bump, and breaking changes forcing users to update scripts and configurations,

**we decided for** semantic version-agnostic naming that describes function rather than version, renaming all `v3-qe-*` items to `qe-*` and CLI binaries from `aqe-v3` to `aqe`,

**and neglected** keeping v3 prefixes (perpetuates version lock-in), parallel naming schemes supporting both conventions (doubles maintenance burden), and version suffixes like `qe-*-v3` (same problem, different syntax),

**to achieve** stable naming across future versions, elimination of documentation churn on version bumps, consistent naming convention unified with v2 patterns, and simplified user experience with single canonical names,

**accepting that** this required coordinated renaming of 59 files (47 agents, 12 skills), CLI binary changes affecting user scripts, and the decision to skip backward compatibility aliases given the small user base.

---

## Context

The v3 implementation originally used `v3-` prefixes extensively:
- Agent names: `v3-qe-test-architect`
- Skill names: `v3-qe-test-generation`
- CLI binary: `aqe-v3`
- Config paths: `.aqe-v3/`

This created maintenance challenges: version lock-in (what happens at v4?), user confusion (multiple conventions), documentation debt (updates per version), and breaking changes (script updates required).

---

## Options Considered

### Option 1: Version-Agnostic Naming (Selected)

Remove all version prefixes, use semantic names describing function.

**Pros:** Stable across versions, consistent with v2, simplified maintenance
**Cons:** One-time migration effort, potential user script breakage

### Option 2: Keep V3 Prefixes (Rejected)

Maintain current `v3-qe-*` naming convention.

**Why rejected:** Perpetuates version lock-in; every future version requires renaming.

### Option 3: Parallel Naming (Rejected)

Support both `v3-qe-*` and `qe-*` names indefinitely.

**Why rejected:** Doubles maintenance burden, user confusion about which to use.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Supersedes | ADR-037 | V3 QE Agent Naming | Original v3-prefixed naming |
| Part Of | MADR-001 | V3 Implementation Initiative | Migration phase |
| Enables | ADR-048 | V2-V3 Agent Migration | Unified naming required |
| Enables | ADR-049 | V3 Main Publish | Clean names for npm package |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-045-A | Agent Rename Mapping | Technical Spec | [specs/SPEC-045-A-agent-rename-mapping.md](../specs/SPEC-045-A-agent-rename-mapping.md) |
| SPEC-045-B | Migration Strategy | Implementation Guide | [specs/SPEC-045-B-migration-strategy.md](../specs/SPEC-045-B-migration-strategy.md) |
| SPEC-045-C | V2 Compatibility | Compatibility Spec | [specs/SPEC-045-C-v2-compatibility.md](../specs/SPEC-045-C-v2-compatibility.md) |
| SPEC-045-D | Implementation Status | Status Report | [specs/SPEC-045-D-implementation-status.md](../specs/SPEC-045-D-implementation-status.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-14 | Approved | 2027-01-14 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-14 | Initial analysis |
| Approved | 2026-01-14 | User approved immediate migration |
| Implemented | 2026-01-14 | All 59 files renamed, tests passing |
