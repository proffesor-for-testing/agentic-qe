# ADR-036: Language-Aware Result Persistence

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-036 |
| **Status** | Implemented |
| **Date** | 2026-01-10 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** the MCP v3 task executor returning real results from domain services that need to be preserved for analysis, comparison, and direct usage,

**facing** results being lost after API response, no historical tracking for trend analysis, inability to diff between runs, generated tests not saved as usable source files, and lack of standard format integration with existing tools,

**we decided for** language/framework-aware result persistence that saves outputs in appropriate formats (SARIF for security, LCOV for coverage, source code for tests) based on task type and target stack, with a unified result index for querying and trend tracking,

**and neglected** database-only storage (loses format compatibility), single-format JSON output (loses tool integration), and external result storage services (adds deployment complexity),

**to achieve** historical result analysis and trend tracking, ready-to-use test files matching project conventions, standard format integration with existing CI/CD tools (SARIF, LCOV), and cross-run comparison capabilities,

**accepting that** this requires disk space for result storage, needs retention policy management, adds I/O overhead per task, and aggregate reporting is deferred to future phases.

---

## Context

The MCP v3 task executor returns real results from domain services, but these results were only returned in the API response without persistence. Users need to review results after completion, compare across runs, track quality trends, generate stakeholder reports, and use generated tests directly.

The solution requires language awareness to save tests with correct naming conventions (e.g., `.test.ts` for Jest, `test_*.py` for pytest) and standard formats for tool integration.

---

## Options Considered

### Option 1: Language-Aware Multi-Format Persistence (Selected)

Save results in format appropriate to task type with language-specific naming for tests.

**Pros:** Tool integration (SARIF, LCOV), ready-to-use test files, historical tracking
**Cons:** Disk space usage, retention management needed, I/O overhead

### Option 2: JSON-Only Storage (Rejected)

Store all results as JSON in database.

**Why rejected:** Loses format compatibility with CI/CD tools, tests not directly usable.

### Option 3: External Storage Service (Rejected)

Use S3/cloud storage for results.

**Why rejected:** Adds deployment complexity, network latency, external dependency.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Result handling infrastructure |
| Relates To | ADR-020 | Real Test Runner Integration | Test execution results persisted |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-036-A | Output Format Matrix | Technical Spec | [specs/SPEC-036-A-output-formats.md](../specs/SPEC-036-A-output-formats.md) |
| SPEC-036-B | Format-Specific Serializers | Technical Spec | [specs/SPEC-036-B-serializers.md](../specs/SPEC-036-B-serializers.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-10 | Approved | 2026-07-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-10 | Initial ADR creation |
| Approved | 2026-01-10 | Architecture review passed |
| Implemented | 2026-01-10 | Core saver (780 LOC), 11 languages, 11+ frameworks |
