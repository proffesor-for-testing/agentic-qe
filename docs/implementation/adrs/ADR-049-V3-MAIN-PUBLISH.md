# ADR-049: V3 Main Package Publication

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-049 |
| **Status** | Accepted |
| **Date** | 2026-01-17 |
| **Author** | Architecture Team |
| **Review Cadence** | 12 months |

---

## WH(Y) Decision Statement

**In the context of** Agentic QE V3 reaching production readiness (3.0.0-alpha.26+) with 12 DDD bounded contexts, 47 specialized agents, HNSW indexing, and comprehensive CLI,

**facing** the need to publish V3 as the main `agentic-qe` npm package while maintaining backward compatibility for existing V2 users and supporting both CLI and programmatic access patterns,

**we decided for** making `@agentic-qe/v3` the main implementation behind the `agentic-qe` package, with root package bin entries pointing to V3 CLI bundles and version aligned at 3.0.0,

**and neglected** keeping V2 as main (blocks V3 adoption), separate package names (fragments ecosystem), and gradual feature migration (delays benefits),

**to achieve** unified user experience with single familiar package name, backward CLI compatibility (aqe/agentic-qe commands work), automatic V3 features for all users, and dual access patterns (CLI + programmatic API),

**accepting that** 2.8.2 to 3.0.0 is a major version jump, package includes V3 distribution size, and dual publishing requires synchronized releases.

---

## Context

V3 represents a complete architectural rewrite with DDD, O(log n) coverage analysis, ReasoningBank learning, and 47 agents. The root package (v2.8.2) has been configured with bin entries pointing to V3 CLI, following the claude-flow publication pattern where root package serves as distribution while V3 contains implementation.

CLI commands (`aqe`, `agentic-qe`, `aqe-mcp`) will continue working, now powered by V3's enhanced capabilities.

---

## Options Considered

### Option 1: V3 as Main Implementation (Selected)

Root `agentic-qe` package version 3.0.0 with V3 CLI bundles.

**Pros:** Unified experience, familiar package name, automatic V3 features
**Cons:** Major version jump, increased package size

### Option 2: Keep V2 as Main (Rejected)

Continue publishing V2 as primary, V3 as separate package.

**Why rejected:** Blocks V3 adoption, fragments user base.

### Option 3: Separate Package Names (Rejected)

Publish V3 as completely different package (e.g., `agentic-qe-next`).

**Why rejected:** Fragments ecosystem, confuses users about official package.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-047 | V3 Implementation Status | Feature completeness |
| Depends On | ADR-048 | V2-to-V3 Migration | Compatibility layer |
| Part Of | MADR-001 | V3 Implementation Initiative | Publication phase |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-17 | Accepted | 2027-01-17 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-17 | Initial creation |
| Accepted | 2026-01-17 | Approved for implementation |
