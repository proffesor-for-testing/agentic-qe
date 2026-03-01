# ADR-063: Enterprise Integration Testing Gap Closure

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-063 |
| **Status** | Implemented |
| **Date** | 2026-02-04 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Analysis Method** | Enterprise Client E2E Capability Analysis |
| **Context Owner** | QE Lead Architect |

---

## WH(Y) Decision Statement

**In the context of** the 12-domain DDD architecture (ADR-001) with 50+ QE agents providing E2E testing coverage across modern and enterprise systems,

**facing** critical gaps in enterprise middleware coverage — IIB/ESB at 10%, SAP RFC/BAPI at 0%, SAP IDoc at 0%, and WMS domain patterns at 55% — which break the E2E chain at the middleware layer in a 7-system Order-to-Cash flow (Integrator -> API Tester -> OMNI -> IIB -> WMS -> SAP/S4 -> KIBANA),

**we decided for** extending the fleet with a new `enterprise-integration` bounded context (13th domain) containing 7 new agents and 4 new skills to close the identified gaps, following the established DDD plugin pattern and agent-as-markdown convention,

**and neglected** (a) expanding existing domains to absorb enterprise patterns (rejected: violates bounded context principles), (b) external enterprise testing tool integration only (rejected: loses agent coordination and learning benefits), (c) deferring enterprise coverage (rejected: blocks customer E2E readiness),

**to achieve** E2E readiness increase from 67-72% to estimated 85-90%, with IIB coverage rising from 10% to 70-80% and SAP coverage from 45-58% to 75-85%,

**accepting that** 7 new agents increase fleet size, enterprise testing may require external SDK dependencies (node-rfc, amqplib, soap), and SOAP/XML testing adds complexity not present in REST-only patterns.

---

## Context

The Enterprise Client Order-to-Cash E2E capability analysis (2026-02-04) revealed that the Agentic QE v3 fleet has **67-72% E2E readiness** across a 7-system flow: Integrator -> API Tester -> OMNI -> IIB -> WMS -> SAP/S4 -> KIBANA. While web UI (90%), REST API (95%), and performance testing (90%) are well-covered, critical gaps exist in:

1. **Enterprise middleware** (IIB/ESB): SOAP/WSDL, message broker, ESB routing — **10% coverage**
2. **SAP-specific interfaces**: RFC/BAPI (0%), IDoc (0%), OData-specific (60-70%) — **45-58% coverage**
3. **WMS domain patterns**: EDI/flat-file, batch processing, inventory reconciliation — **55% coverage**
4. **Observability validation**: Dashboard data accuracy, alert/threshold validation — **85% coverage**

These gaps break the E2E chain at the IIB middleware layer and partially degrade coverage for WMS and SAP/S4.

---

## Options Considered

### Option 1: New Enterprise-Integration Bounded Context (Selected)

Create a 13th DDD domain with 7 specialized agents and 4 skills following existing patterns.

**Pros:**
- Follows DDD extensibility model (ADR-001)
- No core code changes — agents are `.md` files
- Skills compose with existing patterns
- Learning continuity via shared memory namespace

**Cons:**
- 7 new agents increase fleet size
- External SDK dependencies required
- SOAP/XML complexity

### Option 2: Expand Existing Domains (Rejected)

Add enterprise middleware testing to contract-testing or chaos-resilience domains.

**Why rejected:** Violates bounded context principles. SOAP/WSDL, RFC/BAPI, and IDoc are distinct capabilities with their own domain language and lifecycle.

### Option 3: External Tool Integration Only (Rejected)

Integrate enterprise testing tools (SoapUI, Postman collections) without native agents.

**Why rejected:** Loses agent coordination, pattern learning, and fleet-wide quality gate integration.

---

## Technical Design

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

### Implementation Phases

**Phase 1: Agent Definitions + Skills**
- Create 7 agent `.md` files following `qe-contract-validator.md` format
- Create 4 skill `SKILL.md` files following `api-testing-patterns` format
- Register in `skills-manifest.json`

**Phase 2: V3 Domain Scaffolding**
- Create `v3/src/domains/enterprise-integration/` bounded context
- Implement `EnterpriseIntegrationCoordinator` with DI, mixins, events
- Register domain in init phases

**Phase 3: QCSD Flag Extension**
- Add `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION` flags
- Wire conditional agent spawning in QCSD swarm skills

### Integration Points

| Component | Integration |
|-----------|-------------|
| `queen-coordinator.ts` (ADR-008) | Domain routing for enterprise tasks |
| `qe-agent-registry.ts` (ADR-022) | 7 new agent profiles registered |
| `skills-manifest.json` (ADR-056) | 4 new skills with trust tiers |
| `qcsd-*-swarm` skills | New conditional flags for enterprise agents |
| `cross-phase-hooks.ts` (ADR-002) | Enterprise domain event subscriptions |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-001 | DDD Bounded Contexts | New domain follows DDD pattern |
| Depends On | ADR-009 | AgentDB Memory Backend | Shared memory namespace |
| Depends On | ADR-018 | 12-Domain Architecture | Extends to 13 domains |
| Depends On | ADR-056 | Skill Validation System | Skill registration and trust tiers |
| Relates To | ADR-008 | Multi-Agent Coordination | Queen routes to enterprise domain |
| Relates To | ADR-022 | Adaptive Agent Routing | New agent profiles in registry |
| Relates To | ADR-002 | Event-Driven Communication | Enterprise domain events |
| Part Of | MADR-001 | V3 Implementation Initiative | Phase 13 enterprise integration |

---

## Success Metrics

- [x] 7 new agent `.md` files created and registered
- [x] 4 new skill files created and registered in manifest
- [x] `enterprise-integration` bounded context created with coordinator + services
- [x] QCSD flags `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION` wired
- [x] E2E readiness estimated increase from 67-72% to 85-90%
- [x] IIB coverage increase from 10% to estimated 70-80%
- [x] SAP coverage increase from 45-58% to estimated 75-85%
- [x] Domain registered in init phases and plugin loader

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | Enterprise Client E2E Capability Analysis | Analysis | `Agentic QCSD/03 Reference Docs/enterprise-client-e2e-capability-analysis.md` |
| EXT-002 | SAP S/4HANA Migration QE Strategy | Strategy | `docs/sap-s4hana-migration-qe-strategy.md` |
| INT-001 | DDD Bounded Contexts | ADR | [ADR-001](./v3-adrs.md#adr-001) |
| INT-002 | AgentDB Memory Backend | ADR | [ADR-009](./v3-adrs.md#adr-009) |
| INT-003 | 12-Domain Architecture | ADR | [ADR-018](./v3-adrs.md#adr-018) |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-04 | Created from Enterprise Client E2E Capability Analysis |
| Implemented | 2026-02-04 | 7 agents + 4 skills + enterprise-integration bounded context (13th domain) + QCSD flag extensions |
