# ADR-048: V2-to-V3 Agent Migration Upgrade Strategy

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-048 |
| **Status** | Implemented |
| **Date** | 2026-01-17 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** V3 becoming the main release for thousands of existing V2 users with 32 V2 agents needing migration to 48 V3 agents,

**facing** the risk of users receiving duplicate agents (both V2 and V3 versions), confusion about which agents to use, and breaking changes in agent names and capabilities,

**we decided for** a claude-flow-style upgrade-in-place migration with 5 tiers: direct upgrades (7 agents), renamed with v2_compat (14 agents), complex splits (2 agents), new V3-only (21 agents), and consolidated subagents (11->7),

**and neglected** keeping both versions (user confusion, storage bloat), forcing immediate migration (too disruptive), and manual-only migration (error-prone at scale),

**to achieve** seamless upgrades without duplicates, backward compatibility via `v2_compat` fields until V4, automated CLI migration tooling with rollback support, and clear deprecation paths,

**accepting that** all renamed agents need v2_compat fields, directory restructuring is required during release, and compatibility layer needs testing.

---

## Context

When V3 becomes the main release, users should receive upgraded agents, not duplicates. Currently V3 agents are stored in `.claude/agents/v3/` which would result in both V2 (`qe-coverage-analyzer.md`) and V3 (`v3/qe-coverage-specialist.md`) coexisting.

Studying claude-flow's zero-breaking-changes migration approach informed this strategy: `v2_compat` fields, compatibility layers, and automated CLI with rollback.

---

## Options Considered

### Option 1: Upgrade-in-Place with Compatibility Layer (Selected)

5-tier migration with v2_compat fields and CLI tooling.

**Pros:** Seamless user experience, backward compatible, automated with rollback
**Cons:** Requires v2_compat in all renamed agents, directory restructuring

### Option 2: Keep Both Versions (Rejected)

Let V2 and V3 agents coexist indefinitely.

**Why rejected:** User confusion about which to use, storage bloat, maintenance burden.

### Option 3: Force Immediate Migration (Rejected)

Break V2 compatibility on V3 release.

**Why rejected:** Too disruptive for existing users; no rollback path.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-045 | Version-Agnostic Naming | Unified naming required |
| Enables | ADR-049 | V3 Main Publish | Clean migration for npm package |
| Part Of | MADR-001 | V3 Implementation Initiative | Migration phase |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-048-A | Migration Tiers | Technical Spec | [specs/SPEC-048-A-migration-tiers.md](../specs/SPEC-048-A-migration-tiers.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-17 | Approved | 2026-07-17 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-17 | Initial creation |
| Implemented | 2026-01-17 | 5-tier strategy, v2_compat fields, CLI tooling |
