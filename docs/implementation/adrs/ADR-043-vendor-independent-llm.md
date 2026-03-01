# ADR-043: Vendor-Independent LLM Support

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-043 |
| **Status** | Implemented |
| **Date** | 2026-01-13 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** Agentic QE v3's LLM integration layer that currently supports only 3 providers (Claude, OpenAI, Ollama) via ADR-011,

**facing** user demand for access to 100+ models via OpenRouter, enterprise compliance requirements for Azure OpenAI and AWS Bedrock, need for intelligent routing based on task complexity and agent type, cost optimization through automatic model selection, and privacy requirements for local ONNX inference,

**we decided for** a HybridRouter pattern extending ADR-011 with vendor-independent LLM support including 7 providers, bidirectional model ID mapping, 4 routing modes (manual, rule-based, cost-optimized, performance-optimized), agent-aware routing rules, and prompt translation layers,

**and neglected** LiteLLM Gateway (external dependency, deployment complexity), per-provider abstraction alone (insufficient for routing needs), and full router rewrite (unnecessary when extension pattern works),

**to achieve** access to 100+ models through unified interface, 30-50% cost reduction via intelligent routing, zero code changes for existing integrations, enterprise compliance with Azure/Bedrock support, and privacy-sensitive local inference via ONNX,

**accepting that** this adds complexity in the routing layer, requires more configuration options, introduces provider-specific testing requirements, and adds potential routing decision overhead (<10ms target).

---

## Context

ADR-011 established the LLM provider system with 3 providers. Analysis of user requirements revealed gaps: limited model access, no intelligent routing, manual provider switching, no cost optimization, missing enterprise providers, and no local inference option.

Research into agentic-flow's HybridRouter revealed a proven pattern with Strategy-based ModelRouter, capability flags, and cross-vendor model mapping. This pattern enables incremental adoption without breaking existing consumers.

---

## Options Considered

### Option 1: HybridRouter Pattern (Selected)

Extend ADR-011 with multi-provider routing, model mapping, and agent-aware rules.

**Pros:** Proven architecture, minimal breaking changes, DDD alignment, incremental adoption
**Cons:** Additional routing complexity, more configuration to manage

### Option 2: LiteLLM Gateway (Rejected)

Use external LiteLLM as unified gateway.

**Why rejected:** External dependency, deployment complexity, less control over routing logic.

### Option 3: Per-Provider Abstraction Only (Rejected)

Keep current ADR-011 approach, just add more providers.

**Why rejected:** No routing intelligence, no cost optimization, no agent-aware selection.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Extends | ADR-011 | LLM Provider System | Foundation being extended |
| Part Of | MADR-001 | V3 Implementation Initiative | Core infrastructure |
| Enables | ADR-026 | 3-Tier Model Routing | Uses HybridRouter for routing |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-043-A | LLM Provider Adapters | Technical Spec | [specs/SPEC-043-A-llm-provider-adapters.md](../specs/SPEC-043-A-llm-provider-adapters.md) |
| SPEC-043-B | HybridRouter Core | Technical Spec | [specs/SPEC-043-B-hybrid-router-core.md](../specs/SPEC-043-B-hybrid-router-core.md) |
| SPEC-043-C | Model ID Mapping | Technical Spec | [specs/SPEC-043-C-model-mapping.md](../specs/SPEC-043-C-model-mapping.md) |
| SPEC-043-D | Agent-Aware Routing Rules | Technical Spec | [specs/SPEC-043-D-routing-rules.md](../specs/SPEC-043-D-routing-rules.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-13 | Approved | 2026-07-13 |
| Implementation Audit | 2026-01-15 | Verified | - |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-13 | Initial ADR creation |
| Approved | 2026-01-13 | Architecture review passed |
| Implemented | 2026-01-15 | All 12 milestones complete, 4936 tests passing |
