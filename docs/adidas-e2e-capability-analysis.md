# Agentic QE v3 Fleet: E2E Testing Capability Analysis — Adidas Order-to-Cash Flow

> **Date:** 2026-02-04
> **Scope:** 7-system Adidas flow: Integrator → API Tester → OMNI → IIB → WMS → SAP/S4 → KIBANA
> **Method:** 4-agent research swarm (goal planner + 3 domain researchers)
> **Overall E2E Readiness: ~67–72%**

---

## Per-System Verdicts

| # | System | Interface Type | Verdict | Coverage | Key Agents/Tools |
|---|--------|---------------|---------|----------|-----------------|
| 1 | **Integrator** | Web App | **SUPPORTED** | ~90% | Vibium MCP (Chrome), qe-visual-tester, qe-responsive-tester, qe-accessibility-auditor |
| 2 | **API Tester** | REST API | **SUPPORTED** | ~95% | qe-contract-validator, qe-integration-tester, qe-graphql-tester, api-testing-patterns skill |
| 3 | **OMNI** | API Heavy | **SUPPORTED** | ~90% | Same API agents + qe-performance-tester, qe-load-tester (k6/Artillery/Gatling) |
| 4 | **IIB** | ESB / SOAP | **NOT SUPPORTED** | ~10% | Zero SOAP/WSDL support. Zero message broker/ESB awareness. Critical gap. |
| 5 | **WMS** | External APIs | **PARTIAL** | ~55% | Generic REST testing works. No WMS-specific protocols or warehouse domain patterns. |
| 6 | **SAP/S4** | Enterprise Web/GUI | **PARTIAL** | ~45–58% | Fiori 70-80% (web agents), OData 60-70% (REST agents). RFC/BAPI and IDoc genuinely missing. Infra healing fully built-in. |
| 7 | **KIBANA** | Data/Web | **SUPPORTED** | ~85% | Vibium MCP for web UI, API testing for Elasticsearch queries, infra healing has ES signatures |

### E2E Flow Coverage Visualization

```
Integrator ──→ API Tester ──→ OMNI ──→ IIB ──→ WMS ──→ SAP/S4 ──→ KIBANA
   [90%]         [95%]        [90%]   [10%]   [55%]    [45%]      [85%]
    ✅             ✅           ✅      ❌       ⚠️       ⚠️         ✅
```

The first three hops (Integrator → API Tester → OMNI) are fully covered. The chain breaks at **IIB** (IBM Integration Bus) because there is no SOAP/ESB capability, then partially recovers for WMS and SAP (using generic REST/web testing), and is strong again at KIBANA.

---

## System-by-System Detailed Analysis

### 1. Integrator — Web Application (Browser-Based UI)

**Coverage: 90% — SUPPORTED**

| Capability | Agent/Skill | Status |
|---|---|---|
| Functional UI testing | `qe-test-architect` (Playwright framework support) | Working |
| Visual regression | `qe-visual-tester` (pixel-diff + AI semantic comparison, multi-viewport) | Working |
| Accessibility | `qe-accessibility-auditor` (WCAG 2.1/2.2, axe-core, pa11y, Lighthouse) | Working |
| Responsive testing | `qe-responsive-tester` (multi-viewport, device emulation, breakpoint validation) | Working |
| Keyboard navigation | `qe-accessibility-auditor` (focus management, tab order, skip links) | Working |
| Cross-browser | `compatibility-testing` skill (Chrome, Firefox, Safari, Edge matrix) | Working |
| Security (XSS, CSRF) | `qe-security-scanner` (DAST with OWASP ZAP) | Working |
| Performance (page load) | `qe-performance-tester` (Lighthouse integration) | Working |
| Video accessibility | `a11y-ally` skill (video caption generation with Claude Vision) | Working |

**Browser Automation:** 3-tier cascade architecture:
- **Tier 1:** Vibium MCP (headless Chrome, configured in `.claude/mcp.json`)
- **Tier 2:** Agent-Browser fallback (`mcp__claude-flow_alpha__browser_open`)
- **Tier 3:** Playwright + Stealth (installed on-the-fly, not in package.json)

**Visual Regression Algorithms:**

| Algorithm | Use Case | Accuracy |
|-----------|----------|----------|
| Pixel diff | Exact match | High |
| Perceptual | Human-like | Medium |
| Structural | Layout | High |
| AI-based | Semantic | Very High |

**Responsive Viewport Matrix:**

| Device Category | Width Range | Common Breakpoints |
|-----------------|-------------|-------------------|
| Mobile Small | 320–374px | 320px |
| Mobile Medium | 375–413px | 375px |
| Mobile Large | 414–767px | 414px, 640px |
| Tablet | 768–1023px | 768px |
| Laptop | 1024–1365px | 1024px, 1280px |
| Desktop | 1366–1919px | 1366px, 1536px |
| Large Desktop | 1920px+ | 1920px |

**Gaps:** None significant for standard web UI testing.

---

### 2. API Tester — REST/SOAP API Endpoints

**Coverage: 95% (REST) / 0% (SOAP) — SUPPORTED for REST**

| Capability | Agent/Skill | Status |
|---|---|---|
| REST API testing | `qe-integration-tester`, `api-testing-patterns` skill | Working |
| API contract validation | `qe-contract-validator` (Pact, consumer-driven contracts) | Working |
| OpenAPI/Swagger validation | `qe-contract-validator` (schema drift detection) | Working |
| API security testing | `qe-security-scanner` (DAST: XSS, SQLi, CSRF, SSRF) | Working |
| API performance | `qe-performance-tester` (k6, Gatling, Artillery) | Working |
| Load testing | `qe-load-tester` (smoke, load, stress, spike, soak) | Working |
| Breaking change detection | `qe-contract-validator` (semantic versioning guidance) | Working |
| Test data generation | `qe-data-generator` subagent (Faker.js, edge case synthesis) | Working |
| SOAP/WSDL testing | None | **NOT SUPPORTED** |

**Supported API Types** (from `api-testing-patterns` output schema): `rest`, `graphql`, `grpc`, `websocket`, `mixed`. SOAP is not in the enum.

**Supported Schema Formats:**

| Format | Supported | Agent/Skill |
|--------|-----------|-------------|
| OpenAPI/Swagger | Yes | `qe-contract-validator`, `contract-testing` skill |
| JSON Schema | Yes | `contract-testing` skill (ajv, jsonschema validators) |
| GraphQL Schema | Yes | `qe-graphql-tester` |
| gRPC/Protobuf | Planned | In output schema enum only |
| WSDL | **No** | Zero references in codebase |

**Gap:** SOAP/WSDL support is completely absent. No XML schema validation, no WSDL parsing, no SOAP envelope construction. Zero references to SOAP or WSDL anywhere in the codebase.

---

### 3. OMNI — API-Heavy Omni-Channel Platform

**Coverage: 90% — SUPPORTED**

| Capability | Agent/Skill | Status |
|---|---|---|
| High-volume API testing | `qe-load-tester` (k6, Gatling, up to 8 distributed generators) | Working |
| GraphQL testing | `qe-graphql-tester` (schema, queries, mutations, subscriptions, security) | Working |
| Contract validation | `qe-contract-validator` (multi-consumer contract management) | Working |
| Stress/spike testing | `qe-chaos-engineer` (spike load, ramp-up testing) | Working |
| Concurrency testing | `qe-performance-tester` (parallel endpoint testing) | Working |
| Rate limiting validation | `qe-graphql-tester` (rate limit checks) | Working |
| Cache validation | `qe-chaos-engineer` (cache sync during partition) | Working |
| Circuit breaker testing | `qe-chaos-engineer` (fault injection, service crash) | Working |

**Load Test Profiles:**

| Profile | Duration | Purpose |
|---------|----------|---------|
| Smoke | 1–5 min | Minimal load sanity check |
| Load | 30–60 min | Expected peak traffic |
| Stress | 15–30 min | Beyond capacity limits |
| Spike | 10–15 min | Sharp traffic increase (e.g., Black Friday) |
| Soak | 4–24 hours | Steady-state endurance |

**Gaps:**
- Event-driven/async patterns: `qe-integration-tester` lists "message queue integration testing" as only **Partial** status
- No explicit omni-channel-specific patterns (inventory sync across channels, order routing logic)

---

### 4. IIB (IBM Integration Bus) — ESB/Middleware

**Coverage: 10% — NOT SUPPORTED (Critical Gap)**

| Capability | Agent/Skill | Status |
|---|---|---|
| API contract validation | `qe-contract-validator` (can validate transformed output contracts) | Working |
| Fault injection | `qe-chaos-engineer` (network chaos, service crash) | Working |
| Network partition testing | `qe-chaos-engineer` (zone failure, latency injection) | Working |
| Performance under load | `qe-load-tester` (endpoint throughput) | Working |
| Message transformation testing | None specific | **GAP** |
| Message routing logic | None specific | **GAP** |
| SOAP/WSDL adapter testing | None | **GAP** |
| JMS/AMQP queue testing | None | **GAP** |
| ESB routing rule testing | None | **GAP** |
| Dead letter queue testing | None | **GAP** |
| Message ordering/sequencing | None | **GAP** |

**What is missing:**
- No ESB/message broker-specific agent
- No understanding of IIB message flows, routing rules, transformation logic, or ESQL
- No message transformation validation (XSLT/ESQL/map)
- No dead letter queue testing patterns
- No message ordering/sequencing tests (critical for order-to-cash flows)
- No IDoc/flat-file format testing (IIB often transforms between IDoc and other formats)

**To fix:** Needs a new `qe-middleware-validator` agent, `qe-message-broker-tester` agent, and a `middleware-testing-patterns` skill.

---

### 5. WMS (Warehouse Management System) — External APIs

**Coverage: 55% — PARTIAL**

| Capability | Agent/Skill | Status |
|---|---|---|
| API contract testing | `qe-contract-validator` (consumer-driven contracts) | Working |
| External service mocking | `qe-integration-tester` (WireMock/test doubles) | Working |
| API integration testing | `qe-integration-tester` (boundary testing) | Working |
| Data validation | `database-testing` skill (referential integrity) | Working |
| Security testing | `qe-security-scanner` (API security) | Working |
| Performance testing | `qe-performance-tester` (external API latency) | Working |
| Chaos testing | `qe-chaos-engineer` (dependency failure simulation) | Working |
| Test data generation | `qe-data-generator` (schema-aware, relationship-preserving) | Working |
| EDI/flat-file testing | None | **GAP** |
| Batch processing validation | None | **GAP** |
| WMS domain patterns | None | **GAP** |

**Gaps:**
- No EDI/flat-file testing (WMS systems often use EDI X12/EDIFACT or proprietary flat-file formats)
- No batch processing validation (ASN, shipment confirmations)
- No inventory reconciliation agent (cannot validate inventory count consistency across WMS and SAP)
- No WMS-specific protocol support (some WMS use proprietary APIs or legacy protocols)
- No warehouse domain knowledge (pick/pack/ship workflows, ASN processing, cycle count validation)

---

### 6. SAP/S4 — Enterprise Application (Multi-Interface)

**Coverage: 45–58% — PARTIAL**

#### SAP Interface Coverage Breakdown

| SAP Interface | Coverage | How |
|---|---|---|
| **Fiori (Web UI)** | 70–80% | Existing web testing agents (visual, accessibility, responsive, security) |
| **OData (REST-like)** | 60–70% | Generic REST/API testing + contract validation |
| **RFC/BAPI** | 0% | **Genuinely missing** — needs `node-rfc` SDK integration |
| **IDoc (async)** | 0% | **Genuinely missing** — needs segment parser + async assertions |
| **SAP GUI** | 0% | **Not supported** — no SAP GUI scripting |
| **Infra Healing** | 100% | 5 built-in error signatures + 2 recovery playbooks |

#### What Works Today

**Fiori UI Testing:**

| Agent | Applicability |
|---|---|
| `qe-visual-tester` | Visual regression across Fiori apps — screenshots, layout comparison |
| `qe-accessibility-auditor` | WCAG 2.2 compliance on Fiori tiles and detail pages |
| `qe-responsive-tester` | Multi-viewport testing for Fiori responsive layouts |
| `qe-security-scanner` | XSS, CSRF scanning on Fiori pages |
| `a11y-ally` skill | Full accessibility audit with video pipeline |

Missing for Fiori: No SAPUI5 control hierarchy awareness (sap.m.Table, sap.m.Input), no Fiori Launchpad navigation testing, no OPA5/QUnit integration.

**OData API Testing:**

Covered by `qe-contract-validator` + `api-testing-patterns` skill:
- REST CRUD patterns → directly applicable to OData CRUD
- Auth/authorization testing → applicable to SAP CSRF token and OAuth flows
- Contract testing with schema validation → applicable to OData `$metadata` contracts
- Input validation testing → applicable to `$filter`, `$expand`, `$select`

Missing for OData: No OData-specific batch operations (`$batch`), deep inserts, navigation properties, function imports. No OData v2 vs v4 protocol awareness. No automatic `$metadata` → test case generation.

#### SAP Infrastructure Self-Healing (Built-In)

**5 SAP Error Signatures** (in `test-output-observer.ts`):

| Signature | Pattern | Service | Severity |
|-----------|---------|---------|----------|
| SAP RFC communication failure | `RFC_COMMUNICATION_FAILURE\|CpicError.*CMRC` | `sap-rfc` | 0.95 |
| SAP system/ABAP failure | `RFC_SYSTEM_FAILURE\|ABAP.*runtime.*error` | `sap-rfc` | 0.95 |
| SAP BTP connection failure | `ECONNREFUSED.*:443.*sap\|sapbtp\|BTP_.*FAILURE` | `sap-btp` | 0.90 |
| SAP BTP pool exhaustion | `SAP.*pool.*exhausted\|timeout\|BTP.*connection.*pool` | `sap-btp` | 0.85 |
| SAP ICM unavailable | Generic ECONNREFUSED on port 8000 | `sap-rfc` | (generic) |

**2 SAP Recovery Playbooks** (in `default-playbook.yaml`):

| Playbook | Health Check | Recovery Command | Backoff |
|----------|-------------|-----------------|---------|
| `sap-rfc` | `curl -sf http://${SAP_HOST}:${SAP_ICM_PORT}/sap/bc/ping` | `docker compose restart sap-rfc-connector` | [5s, 15s] |
| `sap-btp` | `curl -sf https://${BTP_HOST}:${BTP_PORT}/health` | `docker compose restart sap-btp-proxy` | [10s, 30s] |

Both use environment variable interpolation for any SAP environment without code changes.

**SAP Failure Recovery Pipeline:**
```
SAP fails during test → stderr contains RFC_COMMUNICATION_FAILURE
  → TestOutputObserver matches SAP signature (enterprise patterns match first)
  → Classifies as infra_failure, serviceName: 'sap-rfc'
  → InfraHealingOrchestrator triggers recovery cycle:
    1. Health check: curl SAP ICM /sap/bc/ping
    2. Recover: docker compose restart sap-rfc-connector
    3. Exponential backoff: [5s, 15s]
    4. Verify: re-check /sap/bc/ping
  → On success: re-run only SAP-affected tests
  → CoordinationLock prevents duplicate recovery
```

#### What Is Genuinely Missing

| Capability | Effort | Proposed Agent | Reference |
|-----------|--------|---------------|-----------|
| RFC/BAPI invocation & testing | New domain + SDK | `qe-rfc-compatibility-agent` | SAP migration doc |
| IDoc send/receive/validate | New domain + RFC SDK | `qe-idoc-contract-tester` | SAP migration doc |
| OData-specific test generation | New agent | `qe-odata-contract-tester` | SAP migration doc |
| Async-aware assertions (IDoc wait) | Utility library | `assertEventually` utility | Adidas assessment |
| SAP authorization/SoD testing | New domain | `qe-sod-analyzer` | SAP migration doc |
| Data migration validation | New domain | `qe-data-migration-validator` | SAP migration doc |
| Business process parity | New domain | `qe-process-parity-validator` | SAP migration doc |
| SAP-specific QCSD flags | Flag extension | `HAS_DATA_MIGRATION`, `HAS_INTEGRATION` | SAP migration doc |

---

### 7. KIBANA — Data and Graphs (Elasticsearch Dashboards)

**Coverage: 85% — SUPPORTED**

| Capability | Agent/Skill | Status |
|---|---|---|
| Dashboard UI testing | `qe-visual-tester` (screenshot comparison) | Working |
| Visual regression | `qe-visual-tester` (baseline management) | Working |
| Accessibility | `qe-accessibility-auditor` (WCAG audit on dashboards) | Working |
| Elasticsearch API testing | `qe-integration-tester` (REST API testing) | Working |
| Query performance | `qe-performance-tester` (API latency) | Partial |
| Real-time monitoring | `shift-right-testing` skill (synthetic monitoring) | Partial |
| Data accuracy validation | None specific to Kibana/ES | **GAP** |
| Dashboard data completeness | None | **GAP** |
| Alert/threshold validation | None | **GAP** |

**Gaps:**
- No data accuracy validation (cannot verify dashboards reflect correct underlying pipeline data)
- No dashboard-specific assertions (graph data points, aggregation accuracy, time ranges)
- No alert/threshold validation (Kibana alerting rules, trigger thresholds)

---

## Cross-Cutting E2E Capabilities

These agents/skills apply across all 7 systems:

| Capability | Agent/Skill | Applicability |
|---|---|---|
| E2E test orchestration | `qe-fleet-commander` + `qe-queen-coordinator` | Orchestrates agents across all systems |
| Dependency mapping | `qe-dependency-mapper` (Tarjan's algorithm) | Maps cross-system dependencies |
| SFDIPOT analysis | `qe-product-factors-assessor` | Analyzes all 7 interface factors |
| Quality gate enforcement | `qe-quality-gate` | Go/no-go for E2E readiness |
| Deployment readiness | `qe-deployment-advisor` | Release decision across all systems |
| Risk assessment | `qe-risk-assessor` | Cross-system risk aggregation |
| Impact analysis | `qe-impact-analyzer` | Change impact across systems |
| Test data management | `qe-data-generator` + `test-data-management` skill | Test data for all systems |
| CI/CD pipeline | `qcsd-cicd-swarm` skill | Verification across pipeline |
| Learning/patterns | `qe-learning-coordinator` + `qe-pattern-learner` | Cross-run pattern learning |
| Defect prediction | `qe-defect-predictor` | ML-powered high-risk area prediction |
| BDD scenarios | `qe-bdd-generator` | Generate E2E Gherkin scenarios |
| Security scanning | `qe-security-scanner` (OWASP Web Top 10) | All web-facing systems |

---

## What's Strong

| Capability | Status | Details |
|-----------|--------|---------|
| REST API testing | Fully built | Contract validation, schema checking, response assertions |
| GraphQL testing | Fully built | Dedicated `qe-graphql-tester` agent |
| Web UI testing | Fully built | Vibium MCP (headless Chrome), visual regression, accessibility |
| Performance/Load | Fully built | k6, Artillery, Gatling integration via `qe-performance-tester` |
| Security scanning | Fully built | OWASP Web Top 10, SAST/DAST via `qe-security-scanner` |
| Infra self-healing | Fully built | 34+ signatures including SAP, Salesforce, Elasticsearch |
| Cross-service contract testing | Fully built | Pact + OpenAPI via `qe-contract-validator` |
| Chaos engineering | Fully built | Fault injection, network partition, spike testing |

---

## Gap Summary

### Critical Gaps (Blocking E2E Coverage)

| Gap | Systems Affected | Priority | Effort | New Components Needed |
|-----|-----------------|----------|--------|----------------------|
| SOAP/WSDL testing | IIB, API Tester | **P1 Critical** | Medium | `qe-soap-tester` agent, WSDL parser, XML schema validator |
| IBM MQ / Message broker | IIB | **P1 Critical** | Medium | `qe-message-broker-tester` agent, MQ client integration |
| SAP RFC/BAPI testing | SAP/S4 | **P1 Critical** | High | `qe-sap-rfc-tester` agent, `node-rfc` SDK integration |
| ESB routing/transformation | IIB | **P1 Critical** | Medium | ESB integration testing skill |

### Significant Gaps (Limit Coverage)

| Gap | Systems Affected | Priority | Effort | New Components Needed |
|-----|-----------------|----------|--------|----------------------|
| SAP IDoc testing | SAP/S4 | **P2 High** | Medium | `qe-sap-idoc-tester` agent, IDoc XML parser |
| SAP OData-specific | SAP/S4 | **P2 High** | Low | Extend `qe-contract-validator` with OData `$metadata` awareness |
| Async message flow testing | IIB, OMNI | **P2 High** | Low | Mature async messaging in `qe-integration-tester` |
| SAP authorization/SoD | SAP/S4 | **P2 High** | Medium | `qe-sod-analyzer` agent |

### Moderate Gaps (Enhance Coverage)

| Gap | Systems Affected | Priority | Effort | New Components Needed |
|-----|-----------------|----------|--------|----------------------|
| WMS domain patterns | WMS | **P3 Medium** | Low | WMS skill with domain-specific test patterns |
| EDI/flat-file testing | WMS | **P3 Medium** | Low | EDI format validation capability |
| Dashboard data accuracy | KIBANA | **P3 Medium** | Low | `observability-testing-patterns` skill |
| OWASP API Top 10 | All API systems | **P3 Medium** | Low | Extend `qe-security-scanner` with BOLA/BFLA checks |
| Batch processing validation | WMS | **P3 Medium** | Low | Batch file processing test patterns |

---

## Recommended Gap Closure Plan

### Phase 1: Quick Wins

1. **Extend `qe-contract-validator`** to support SOAP/WSDL schemas — the Pact-based architecture can be extended with WSDL parsing
2. **Create `middleware-testing-patterns` skill** — document message routing, transformation, DLQ, and sequencing test patterns
3. **Create `observability-testing-patterns` skill** — dashboard data validation, Elasticsearch assertion patterns
4. **Enhance async messaging** in `qe-integration-tester` from Partial to Working status

### Phase 2: New Agents

1. **Create `qe-middleware-validator`** agent — as proposed in SAP migration strategy document
2. **Create `qe-odata-contract-tester`** agent — OData v2/v4 `$metadata` validation, batch request testing
3. **Create `qe-idoc-contract-tester`** agent — IDoc segment/field validation against SAP ALE documentation
4. **Create `qe-rfc-compatibility-agent`** agent — BAPI/RFC parameter validation, backward compatibility
5. **Create `assertEventually` utility** — async-aware assertions for IDoc processing and webhook delivery

### Phase 3: Enterprise Extensions

1. **Create SAP authorization domain** — `qe-sod-analyzer`, `qe-role-migration-validator`
2. **Create data reconciliation capability** — cross-system data comparison (SAP vs WMS vs OMNI)
3. **Add SAP GUI automation** — Options: wrap SAP GUI Scripting, use SAP NWBC, or focus on Fiori migration
4. **Add QCSD SAP-specific flags** — `HAS_DATA_MIGRATION`, `HAS_CUSTOM_CODE`, `HAS_INTEGRATION`, `HAS_AUTHORIZATION`, `HAS_CUTOVER`

### Architecture Note

The Agentic QE v3 architecture explicitly supports this kind of extension:
- New agents are `.md` files in `.claude/agents/v3/`
- New skills are directories in `.claude/skills/`
- Both register through existing manifests and coordination systems
- The DDD bounded context architecture (ADR-002) and skill system make adding capabilities straightforward without modifying core code
- The SAP migration strategy document (`docs/sap-s4hana-migration-qe-strategy.md`) already provides blueprints for the needed agents and domains

---

## Conclusion

The Agentic QE v3 fleet is **well-positioned but not yet complete** for the Adidas order-to-cash E2E flow. Its strengths are in web UI testing, REST API testing, performance/load testing, security scanning, and chaos engineering — which cover the modern web-facing systems (Integrator, OMNI, API Tester, KIBANA) effectively. The gaps concentrate in enterprise middleware (IIB/SOAP/ESB), SAP-specific interfaces (BAPI/RFC/IDoc), and domain-specific patterns (WMS, Kibana data validation), which require purpose-built agents that the architecture fully supports creating.

---

## Key Source Files Referenced

| File | Contents |
|------|----------|
| `v3/src/strange-loop/infra-healing/test-output-observer.ts` | 5 SAP error signatures (lines 189–303) |
| `v3/src/strange-loop/infra-healing/default-playbook.yaml` | 2 SAP recovery playbooks (lines 150–183) |
| `v3/tests/unit/strange-loop/infra-healing/enterprise-signatures.test.ts` | SAP signature tests, priority ordering |
| `v3/tests/unit/strange-loop/infra-healing/infra-healing-orchestrator.test.ts` | E2E SAP RFC failure pipeline test |
| `.claude/agents/v3/qe-contract-validator.md` | Consumer-driven contract testing agent |
| `.claude/agents/v3/qe-integration-tester.md` | API/service integration testing agent |
| `.claude/agents/v3/qe-graphql-tester.md` | GraphQL testing agent |
| `.claude/agents/v3/qe-visual-tester.md` | Visual regression testing agent |
| `.claude/agents/v3/qe-responsive-tester.md` | Responsive design testing agent |
| `.claude/agents/v3/qe-accessibility-auditor.md` | WCAG accessibility auditing agent |
| `.claude/agents/v3/qe-security-scanner.md` | OWASP security scanning agent |
| `.claude/agents/v3/qe-load-tester.md` | Load/stress testing agent |
| `.claude/agents/v3/qe-chaos-engineer.md` | Chaos engineering agent |
| `.claude/skills/api-testing-patterns/SKILL.md` | REST/GraphQL API testing patterns |
| `.claude/skills/contract-testing/SKILL.md` | Consumer-driven contract testing |
| `.claude/skills/a11y-ally/SKILL.md` | Accessibility audit with video pipeline |
| `.claude/mcp.json` | Vibium MCP browser automation config |
| `docs/sap-s4hana-migration-qe-strategy.md` | SAP migration strategy with proposed agents |
