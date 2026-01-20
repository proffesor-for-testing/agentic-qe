# ADR-037: V3 QE Agent Naming Standardization

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-037 |
| **Status** | Superseded |
| **Date** | 2026-01-11 |
| **Author** | Claude Code |
| **Review Cadence** | N/A (Superseded) |

---

## WH(Y) Decision Statement

**In the context of** V3 QE skills referencing agents using inconsistent naming (V2-style short names vs V3 full `v3-qe-*` prefixes),

**facing** confusion about agent versions, potential routing errors in the Task tool, documentation mismatches, and difficulty in agent discovery,

**we decided for** standardizing all V3 QE skills to use the full `v3-qe-*` agent naming convention with format `v3-qe-{domain}-{specialty}`,

**and neglected** keeping V2-style short names (causes version confusion) and mixed naming schemes (compounds discovery issues),

**to achieve** consistent naming across all V3 QE artifacts, clear distinction between V2 and V3 agents, better routing and discovery, and improved documentation clarity,

**accepting that** this creates breaking changes for existing workflows using old `qe-*` names and requires updating references to legacy names.

---

## Superseded Notice

**This ADR has been superseded by [ADR-045: Version-Agnostic Naming](./ADR-045-version-agnostic-naming.md).**

ADR-045 determined that `v3-` prefixes create version lock-in and maintenance burden. All agents were renamed from `v3-qe-*` to `qe-*` for version-agnostic, semantic naming.

**Migration:**
- `v3-qe-test-architect` -> `qe-test-architect`
- `v3-qe-coverage-specialist` -> `qe-coverage-specialist`
- All 47 domain agents and 7 subagents renamed

---

## Context

V3 QE skills originally referenced agents using V2-style short names (e.g., `'test-architect'`) while V3 QE agent definitions used full `v3-qe-*` prefixes. This inconsistency caused routing errors and documentation mismatches.

The decision to use `v3-qe-*` naming was later reversed by ADR-045, which established version-agnostic naming as the standard.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Superseded By | ADR-045 | Version-Agnostic Naming | Replaced v3-prefixed naming |
| Part Of | MADR-001 | V3 Implementation Initiative | Naming standardization phase |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-11 | Approved | N/A |
| Architecture Team | 2026-01-14 | Superseded | N/A |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-11 | Initial creation |
| Implemented | 2026-01-12 | All agents renamed to v3-qe-* |
| Superseded | 2026-01-14 | Replaced by ADR-045 version-agnostic naming |
