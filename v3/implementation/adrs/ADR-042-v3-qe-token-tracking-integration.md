# ADR-042: Token Tracking and Consumption Reduction

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-042 |
| **Status** | Implemented |
| **Date** | 2026-01-14 |
| **Author** | Claude Code |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** V3 QE agents operating without visibility into API costs or token consumption patterns,

**facing** no token tracking per agent/task, no cost management or estimation, no pattern-based token reduction mechanisms, and missed opportunities to reuse successful patterns to avoid re-computation,

**we decided for** comprehensive token tracking with consumption reduction strategies including per-task/agent/domain token metrics, early-exit optimization for high-confidence patterns, response caching, and batch operations,

**and neglected** basic logging-only approach (no optimization), external APM tools only (no QE-specific patterns), and manual monitoring (no automation),

**to achieve** visibility into where tokens are spent, cost prediction and optimization, faster responses via caching/reuse, and -25% token reduction through pattern reuse,

**accepting that** this adds tracking infrastructure complexity, requires storage for pattern history that grows over time, and introduces cache staleness risks requiring TTL management.

---

## Context

V3 QE agents lacked visibility into token consumption. Analysis of agentic-flow (v2.0.1-alpha) identified proven reduction mechanisms: ReasoningBank pattern reuse (-25% tokens), Adaptive Learner (-32.3% tokens), Context Synthesizer (-15% redundancy), and Memory Optimizer (-20% retrieval).

The existing v3 architecture had pattern storage but no token tracking: `qe-reasoning-bank.ts` had QE patterns but no token fields, `metrics-collector.ts` tracked CPU/memory but not tokens, and `pattern-store.ts` stored patterns without `tokensUsed` metadata.

---

## Options Considered

### Option 1: Comprehensive Token Tracking with Optimization (Selected)

Add token tracking to all agent operations, port agentic-flow's reduction patterns, create MCP tools for analysis, and implement early-exit for high-confidence patterns.

**Pros:** Full visibility, cost control, performance gains via caching
**Cons:** Additional infrastructure complexity, storage growth over time

### Option 2: Basic Logging Only (Rejected)

Log token usage without optimization mechanisms.

**Why rejected:** Provides visibility but no cost reduction; misses 25%+ savings opportunity.

### Option 3: External APM Tools (Rejected)

Rely on external tools like DataDog or New Relic for token tracking.

**Why rejected:** No QE-specific pattern reuse; generic metrics without optimization actions.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Token optimization phase |
| Relates To | ADR-040 | Agentic-Flow Integration | Ports token reduction patterns |
| Relates To | ADR-021 | QE ReasoningBank | Extends with token tracking |
| Relates To | ADR-038 | Memory Unification | Integrates token tracking |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-042-A | Token Tracking Schema | Technical Spec | [specs/SPEC-042-A-token-tracking-schema.md](../specs/SPEC-042-A-token-tracking-schema.md) |
| SPEC-042-B | Reduction Strategies | Implementation Guide | [specs/SPEC-042-B-reduction-strategies.md](../specs/SPEC-042-B-reduction-strategies.md) |
| SPEC-042-C | MCP Tools and CLI | API Specification | [specs/SPEC-042-C-mcp-tools-cli.md](../specs/SPEC-042-C-mcp-tools-cli.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-14 | Approved | 2026-07-14 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-14 | Initial creation from agentic-flow analysis |
| Implemented | 2026-01-14 | Token tracking and reduction strategies complete |
