# ADR-059: Enterprise Integration Testing Gap Closure

**Status:** Implemented
**Date:** 2026-02-04
**Decision Makers:** Architecture Team
**Context Owner:** QE Lead Architect

## Context

The Enterprise Client Order-to-Cash E2E capability analysis (2026-02-04) revealed that the Agentic QE v3 fleet has **67-72% E2E readiness** across a 7-system flow: Integrator → API Tester → OMNI → IIB → WMS → SAP/S4 → KIBANA. While web UI (90%), REST API (95%), and performance testing (90%) are well-covered, critical gaps exist in:

1. **Enterprise middleware** (IIB/ESB): SOAP/WSDL, message broker, ESB routing — **10% coverage**
2. **SAP-specific interfaces**: RFC/BAPI (0%), IDoc (0%), OData-specific (60-70%) — **45-58% coverage**
3. **WMS domain patterns**: EDI/flat-file, batch processing, inventory reconciliation — **55% coverage**
4. **Observability validation**: Dashboard data accuracy, alert/threshold validation — **85% coverage**

These gaps break the E2E chain at the IIB middleware layer and partially degrade coverage for WMS and SAP/S4.

## Decision

Extend the Agentic QE v3 fleet with an **enterprise-integration** bounded context containing 7 new agents and 4 new skills to close the identified gaps.

### New Agents

| Agent | Domain | Priority | Gap Addressed |
|-------|--------|----------|---------------|
| `qe-soap-tester` | enterprise-integration | P1 Critical | SOAP/WSDL testing, XML schema validation |
| `qe-message-broker-tester` | enterprise-integration | P1 Critical | JMS/AMQP/IBM MQ, DLQ, message ordering |
| `qe-sap-rfc-tester` | enterprise-integration | P1 Critical | SAP RFC/BAPI invocation, node-rfc SDK |
| `qe-middleware-validator` | enterprise-integration | P1 Critical | ESB routing rules, message transformation |
| `qe-sap-idoc-tester` | enterprise-integration | P2 High | IDoc segment/field validation, async assertions |
| `qe-odata-contract-tester` | enterprise-integration | P2 High | OData v2/v4 `$metadata`, `$batch`, deep inserts |
| `qe-sod-analyzer` | enterprise-integration | P2 High | SAP Segregation of Duties, role-permission mapping |

### New Skills

| Skill | Category | Priority | Gaps Addressed |
|-------|----------|----------|----------------|
| `middleware-testing-patterns` | enterprise-integration | P1 Critical | Message routing, transformation, DLQ, sequencing |
| `enterprise-integration-testing` | enterprise-integration | P1 Critical | Orchestration skill for all enterprise agents |
| `observability-testing-patterns` | enterprise-integration | P3 Medium | Dashboard data validation, ES assertions, alerting |
| `wms-testing-patterns` | enterprise-integration | P3 Medium | Warehouse domain, EDI, batch processing, inventory |

### New QCSD Flags

| Flag | Trigger Keywords | Conditional Agent |
|------|-----------------|-------------------|
| `HAS_MIDDLEWARE` | ESB, message broker, IIB, MQ, SOAP | `qe-middleware-validator` |
| `HAS_SAP_INTEGRATION` | RFC, BAPI, IDoc, OData, SAP | `qe-sap-rfc-tester` |
| `HAS_DATA_MIGRATION` | data load, conversion, mapping, ETL | `qe-data-migration-validator` (future) |
| `HAS_AUTHORIZATION` | roles, permissions, SoD, authorization | `qe-sod-analyzer` |

## Rationale

1. **DDD Extensibility**: The existing 12-domain architecture (ADR-001) explicitly supports adding new bounded contexts. A new `enterprise-integration` domain follows the established pattern.

2. **Agent-as-Markdown**: V3 agents are `.md` files in `.claude/agents/v3/` — no core code changes needed to add testing capabilities.

3. **Skill Composition**: New skills compose with existing skills (e.g., `enterprise-integration-testing` orchestrates `api-testing-patterns` + `contract-testing` + new enterprise agents).

4. **Learning Continuity**: New agents use the same `memory_namespace` and `learning_protocol` patterns, enabling cross-domain pattern sharing via `qe-learning-coordinator`.

5. **QCSD Integration**: New flags extend the existing QCSD swarm flag detection without modifying core swarm logic.

## Consequences

### Positive
- E2E readiness increases from 67-72% to estimated **85-90%**
- IIB coverage increases from 10% to estimated **70-80%**
- SAP coverage increases from 45-58% to estimated **75-85%**
- WMS coverage increases from 55% to estimated **75-80%**
- KIBANA coverage increases from 85% to estimated **90-95%**

### Negative
- 7 new agents increase fleet size (manageable with hierarchical topology)
- Enterprise testing may require external SDK dependencies (node-rfc, amqplib, soap)
- SOAP/XML testing adds complexity not present in REST-only patterns

### Risks
- External SDK availability and maintenance (mitigated by graceful degradation)
- SOAP/WSDL complexity (mitigated by scoping to contract validation, not full ESB emulation)
- SAP system access requirements for RFC testing (mitigated by mock/stub patterns)

## Implementation

### Phase 1: Agent Definitions + Skills
- Create 7 agent `.md` files following `qe-contract-validator.md` format
- Create 4 skill `SKILL.md` files following `api-testing-patterns` format
- Register in `skills-manifest.json`

### Phase 2: V3 Domain Scaffolding
- Create `v3/src/domains/enterprise-integration/` bounded context
- Implement `EnterpriseIntegrationCoordinator` with DI, mixins, events
- Register domain in init phases

### Phase 3: QCSD Flag Extension
- Add `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION` flags
- Wire conditional agent spawning in QCSD swarm skills

## References

- [Enterprise Client E2E Capability Analysis](../../../Agentic%20QCSD/03%20Reference%20Docs/enterprise-client-e2e-capability-analysis.md)
- [SAP S/4HANA Migration QE Strategy](../../../docs/sap-s4hana-migration-qe-strategy.md)
- [ADR-001: DDD Bounded Contexts](./v3-adrs.md#adr-001)
- [ADR-009: AgentDB Memory Backend](./v3-adrs.md#adr-009)
- [ADR-018: 12-Domain Architecture](./v3-adrs.md#adr-018)
