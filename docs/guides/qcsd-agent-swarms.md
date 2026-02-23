# QCSD Agent Swarms Guide

## Overview

QCSD (Quality Conscious Software Delivery) is a delivery framework created by Lalitkumar Bhamare that puts quality at the center of software delivery. It uses a 4E cycle — **Enable, Engage, Execute, Evaluate** — applied across three notions of quality: Product, People, and Project.

Agentic QE implements QCSD through **5 coordinated AI swarms** that span the full SDLC. Each swarm maps to a QCSD phase, deploys specialized agents, produces quality artifacts, and feeds learnings back to earlier phases — closing the loop that QCSD calls "quality consciousness."

**Inventory:** 44 agents, 7 sub-agents, 95 skills, 12 DDD domains across 5 swarms.

## Quick Start

### Launch a Single QCSD Swarm (Slash Commands)

Each QCSD swarm is invoked as a slash command in Claude Code:

```
# Ideation — analyze an epic or feature before development
/qcsd-ideation-swarm

# Refinement — analyze user stories during sprint refinement
/qcsd-refinement-swarm

# Development — validate code quality during active coding
/qcsd-development-swarm

# CI/CD (Verification) — enforce quality gates on PR/merge events
/qcsd-cicd-swarm

# Production Telemetry — monitor production health post-deployment
/qcsd-production-swarm
```

Each slash command triggers a 9-phase execution flow: Flag Detection → Core Agent Spawn (Batch 1) → Wait → Conditional Agent Spawn (Batch 2) → Wait → Decision Logic → Report Generation → Learning Persistence (Phase 7) → Final Analysis/Transformation Agent (Batch 3).

### 3 Execution Models

Every QCSD swarm supports 3 execution models. The **Task Tool** is the primary model:

| Model | Initialization | Agent Spawn | Memory Store |
|-------|---------------|-------------|--------------|
| **Task Tool** (Primary) | N/A | `Task({ subagent_type, run_in_background: true })` | N/A (use MCP) |
| **MCP Tools** | `fleet_init({})` | `task_submit({})` | `memory_store({})` |
| **CLI** | `swarm init` | `agent spawn` | `memory store` |

---

## What is QCSD?

QCSD addresses the Speed-Cost-Quality triple constraint that every software team faces. The core insight: quality trade-offs happen not because quality is expensive, but because organizations lack a proven, conscious approach to it.

**Core definition:**

> *Delivery of quality products by quality-conscious people, using quality-empowering processes.*

**The 4E Cycle:**

```
         Enable ──────▶ Engage
            ▲                │
            │                ▼
         Evaluate ◀────── Execute
```

| Phase | Purpose | Key Activities |
|-------|---------|----------------|
| **Enable** | Build quality mindset, skills, and culture | Quality Criteria sessions, Testability pairing, "Act Early, Act Small" |
| **Engage** | Active knowledge exchange through collaboration | Product Coverage sessions, SFDIPOT analysis, Dev+QE pairing |
| **Execute** | Continuous discovery and continuous feedback | TDD, continuous testing at all SDLC phases, automated checks |
| **Evaluate** | Assess evidence, identify improvements | DORA metrics, SRE practices, production telemetry, feedback loops |

**QualiTri — Three Notions of Quality:**

- **Product** — quality of what the team builds (assessed via SFDIPOT: Structure, Function, Data, Interfaces, Platform, Operations, Time)
- **People** — quality of individuals' work, skills, and collaboration
- **Project** — quality of the environment: culture, tools, management support

---

## QCSD to Agentic Swarms Mapping

The 4E cycle maps to 5 SDLC phases, each powered by a dedicated AI swarm:

```
ENABLE & ENGAGE                EXECUTE                      EVALUATE
┌────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  1. IDEATION       │   │  3. DEVELOPMENT     │   │  5. PRODUCTION      │
│     SWARM          │──▶│     SWARM           │──▶│     TELEMETRY       │
│                    │   │                     │   │     SWARM           │
│  2. REFINEMENT     │   │  4. CI/CD           │   │                     │
│     SWARM          │──▶│     SWARM           │◀──│  Feedback Loop      │
└────────────────────┘   └─────────────────────┘   └──────────┬──────────┘
                                                               │
                                                               └──▶ Back to
                                                                   Ideation
```

| Swarm | QCSD Phase | 4E Mapping | When to Run |
|-------|------------|------------|-------------|
| Ideation | Quality Criteria, Risk Storming | Enable & Engage | PI Planning, Sprint Planning, new epic/feature |
| Refinement | SFDIPOT, Acceptance Criteria | Enable & Engage | Story grooming, sprint refinement |
| Development | TDD, Test Automation, Code Review | Execute | Active coding, PR creation |
| CI/CD | Quality Gates, Deployment Decisions | Execute | PR merge, branch merge, deploy |
| Production Telemetry | DORA Metrics, SRE, Learning | Evaluate | Post-deployment, continuous |

---

## Swarm 1: Ideation

**QCSD Activities:** Quality Criteria sessions, Risk Storming, QX sessions (QE + UX pairing), Testing the Design

**Purpose:** Analyze an epic or feature before development begins. Apply HTSM v6.3 Quality Criteria across 10 categories, assess testability, identify risks, and validate requirements.

### Agents (9 total: 3 core + 6 conditional)

| Agent | Role | Category | Trigger |
|-------|------|----------|---------|
| `qe-quality-criteria-recommender` | HTSM v6.3 Quality Criteria analysis (10 categories) | Core | Always |
| `qe-risk-assessor` | Risk-weighted assessment of design components | Core | Always |
| `qe-requirements-validator` | Validate requirements completeness and clarity | Core | Always |
| `qe-accessibility-auditor` | Early accessibility review of UI designs | Conditional | HAS_UI |
| `qe-security-auditor` | Threat modeling and security risk identification | Conditional | HAS_SECURITY |
| `qe-qx-partner` | Quality Experience analysis (QE + UX pairing) | Conditional | HAS_UX |
| `qe-middleware-validator` | Middleware/ESB integration validation | Conditional | HAS_MIDDLEWARE |
| `qe-sap-rfc-tester` | SAP RFC/BAPI connection testing | Conditional | HAS_SAP_INTEGRATION |
| `qe-sod-analyzer` | Segregation of Duties compliance | Conditional | HAS_AUTHORIZATION |

### Skills Used

- `testability-scoring` — Score design testability against 10 principles
- `risk-based-testing` — Focus on highest-risk areas
- `context-driven-testing` — Adapt approach to context
- `holistic-testing-pact` — PACT principles for strategy

### How to Run

**Option 1: Slash Command (Recommended)**

```
/qcsd-ideation-swarm
```

This triggers the full 9-phase execution. The swarm detects flags (`HAS_UI`, `HAS_SECURITY`, `HAS_UX`, `HAS_VIDEO`, `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION`) from the input content, spawns 3 core agents in parallel via Task tool, conditionally spawns additional agents based on TRUE flags, applies GO/CONDITIONAL/NO-GO decision logic, persists learnings, and generates the full report.

**Option 2: Task Tool (Programmatic — how the swarm actually spawns agents)**

```javascript
// Phase URL-3: Core agents spawned in ONE message, all in parallel
Task({
  description: "QCSD Quality Criteria Analysis",
  prompt: `You are qe-quality-criteria-recommender analyzing [target].
Analyze ALL 10 HTSM v6.3 categories...`,
  subagent_type: "qe-quality-criteria-recommender",
  run_in_background: true
})

Task({
  description: "QCSD Risk Assessment",
  prompt: `You are qe-risk-assessor analyzing [target].
Apply SFDIPOT framework...`,
  subagent_type: "qe-risk-assessor",
  run_in_background: true
})

Task({
  description: "QCSD Testability Assessment",
  prompt: `You are qe-requirements-validator analyzing [target].
Apply 10 Principles of Testability...`,
  subagent_type: "qe-requirements-validator",
  run_in_background: true
})
```

**Option 3: MCP Tools**

```javascript
// Initialize fleet
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["requirements-validation", "coverage-analysis", "security-compliance"],
  maxAgents: 6
})

// Submit QCSD ideation task
mcp__agentic-qe__task_submit({
  type: "qcsd-ideation-analysis",
  priority: "p0",
  payload: { targetId: "EPIC-123", targetType: "epic" }
})

// Store results to QCSD namespace
mcp__agentic-qe__memory_store({
  key: "qcsd-ideation-EPIC-123-1706000000000",
  namespace: "qcsd-ideation",
  value: { recommendation: "GO", testabilityScore: 85, htsmCoverage: 9 }
})

// Share to learning coordinator
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-ideation-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-pattern-learner"],
  knowledgeDomain: "ideation-patterns"
})
```

**Option 4: CLI**

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 6
npx @claude-flow/cli@latest memory store \
  --key "qcsd-ideation-EPIC-123" \
  --value '{"recommendation":"GO","testabilityScore":85,"htsmCoverage":9}' \
  --namespace qcsd-ideation
npx @claude-flow/cli@latest memory search --query "ideation recommendation" --namespace qcsd-ideation
```

### Coordination Flow

```
Epic/Feature Input
       │
       ▼
qe-quality-criteria-recommender (HTSM v6.3)
  - Analyzes 10 quality categories
  - Collects evidence with file:line refs
  - Generates quality recommendations
       │
       ├──────────────────┬──────────────────┐
       ▼                  ▼                  ▼
testability-         qe-risk-         qe-requirements-
scoring (skill)      assessor         validator
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                          ▼
               IDEATION REPORT
  - HTSM Quality Criteria (10 categories)
  - Testability Score
  - Risk Assessment
  - Requirements Validation
```

### HTSM Quality Criteria (10 Categories)

| Category | Focus | Can Omit? |
|----------|-------|-----------|
| **Capability** | Can it perform required functions? | Never |
| **Reliability** | Will it resist failure? | Never |
| **Usability** | How easy for real users? | Rarely |
| **Charisma** | How appealing/engaging? | With evidence |
| **Security** | How protected against unauthorized use? | Never |
| **Scalability** | How well does deployment scale? | Rarely |
| **Compatibility** | Works with external components? | With evidence |
| **Performance** | How speedy and responsive? | Never |
| **Installability** | How easily installed? | SaaS only |
| **Development** | How well can we create/test/modify? | Never |

### Artifacts Produced

| Artifact | Format | Contains |
|----------|--------|----------|
| Quality Criteria Report | HTML/Markdown | 10-category HTSM analysis with evidence |
| Testability Score | JSON | Numeric score against 10 testability principles |
| Risk Heat Map | JSON | Risk-weighted component assessment |
| Requirements Validation | Markdown | Completeness, clarity, and testability assessment |

---

## Swarm 2: Refinement

**QCSD Activities:** Story analysis with SFDIPOT, Finetuning acceptance criteria, Product Coverage sessions, Dev + QE pairing

**Purpose:** Analyze user stories using SFDIPOT product factors, generate BDD scenarios, validate acceptance criteria completeness, and map dependencies — all before coding starts.

### Agents (10 total: 3 core + 6 conditional + 1 transformation)

| Agent | Role | Category | Trigger |
|-------|------|----------|---------|
| `qe-product-factors-assessor` | SFDIPOT analysis (7 factors, 37 subcategories) | Core | Always |
| `qe-bdd-generator` | Generate BDD Gherkin scenarios from acceptance criteria | Core | Always |
| `qe-requirements-validator` | Validate acceptance criteria (INVEST + Definition of Ready) | Core | Always |
| `qe-contract-validator` | API contract planning and validation | Conditional | HAS_API |
| `qe-impact-analyzer` | Assess change impact (blast radius) | Conditional | HAS_REFACTORING |
| `qe-dependency-mapper` | Map story dependencies and integration points | Conditional | HAS_DEPENDENCIES |
| `qe-middleware-validator` | Middleware/ESB integration validation | Conditional | HAS_MIDDLEWARE |
| `qe-odata-contract-tester` | SAP OData contract testing | Conditional | HAS_SAP_INTEGRATION |
| `qe-sod-analyzer` | Segregation of Duties compliance | Conditional | HAS_AUTHORIZATION |
| `qe-test-idea-rewriter` | Transform passive test ideas into active test charters | Transformation | Always |

### Skills Used

- `context-driven-testing` — Adapt testing approach to context
- `testability-scoring` — Score design testability against 10 principles
- `risk-based-testing` — Focus on highest-risk areas

### How to Run

**Option 1: Slash Command (Recommended)**

```
/qcsd-refinement-swarm
```

This triggers the 9-phase execution. The swarm detects flags (`HAS_API`, `HAS_REFACTORING`, `HAS_DEPENDENCIES`, `HAS_SECURITY`, `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION`) from the story content, spawns 3 core agents in parallel, conditionally spawns up to 6 additional agents, applies READY/CONDITIONAL/NOT-READY decision logic, persists learnings, then always runs `qe-test-idea-rewriter` as a final transformation.

**Option 2: Task Tool (Programmatic)**

```javascript
// Phase 2: Core agents spawned in ONE message, all in parallel
Task({
  description: "SFDIPOT Product Factors analysis",
  prompt: `You are qe-product-factors-assessor. Analyze ALL 7 SFDIPOT factors
with 37 subcategories for: [user story]...`,
  subagent_type: "qe-product-factors-assessor",
  run_in_background: true
})

Task({
  description: "BDD scenario generation",
  prompt: `You are qe-bdd-generator. Generate Given/When/Then Gherkin scenarios
for: [user story + acceptance criteria]...`,
  subagent_type: "qe-bdd-generator",
  run_in_background: true
})

Task({
  description: "Requirements INVEST validation",
  prompt: `You are qe-requirements-validator. Validate acceptance criteria using
INVEST framework for: [user story]...`,
  subagent_type: "qe-requirements-validator",
  run_in_background: true
})
```

**Option 3: MCP Tools**

```javascript
// Initialize fleet
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["requirements-validation", "contract-testing", "code-intelligence", "test-generation"],
  maxAgents: 7
})

// Store refinement findings to QCSD namespace
mcp__agentic-qe__memory_store({
  key: "qcsd-refinement-STORY-456-1706000000000",
  namespace: "qcsd-refinement",
  value: {
    storyId: "STORY-456",
    recommendation: "READY",
    sfdipotCoverage: 7,
    bddScenarioCount: 12,
    investCompleteness: 85,
    sfdipotPriorities: { structure: "P1", function: "P0", data: "P1", interfaces: "P2", platform: "P3", operations: "P1", time: "P2" }
  }
})

// Share to learning coordinator
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-refinement-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-pattern-learner"],
  knowledgeDomain: "refinement-patterns"
})

// Query previous refinement results
mcp__agentic-qe__memory_query({
  pattern: "qcsd-refinement-*",
  namespace: "qcsd-refinement"
})
```

**Option 4: CLI**

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 7
npx @claude-flow/cli@latest memory store \
  --key "qcsd-refinement-STORY-456" \
  --value '{"recommendation":"READY","sfdipotCoverage":7,"bddScenarioCount":12}' \
  --namespace qcsd-refinement
npx @claude-flow/cli@latest memory search --query "refinement patterns" --namespace qcsd-refinement
```

### Coordination Flow

```
User Story + Acceptance Criteria
       │
       ├──────────────────┐
       ▼                  ▼
qe-product-factors-  qe-bdd-generator
assessor (SFDIPOT)   (Given/When/Then)
       │                  │
       └────────┬─────────┘
                ▼
    qe-requirements-validator
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
qe-risk-   qe-gap-   qe-impact-
assessor   detector  analyzer
       │        │        │
       └────────┴────────┘
                │
                ▼
     REFINEMENT OUTPUT
  - SFDIPOT Assessment
  - BDD Scenarios (Gherkin)
  - Validated Acceptance Criteria
  - Coverage Forecast
  - Impact Analysis
```

### SFDIPOT Product Factors

| Factor | Question | Supporting Agent |
|--------|----------|-----------------|
| **S**tructure | What is it made of? | `qe-dependency-mapper` |
| **F**unction | What does it do? | `qe-requirements-validator` |
| **D**ata | What data does it process? | `qe-property-tester` |
| **I**nterfaces | How does it connect? | `qe-contract-validator` |
| **P**latform | What does it depend on? | `qe-dependency-mapper` |
| **O**perations | How is it used? | `qe-bdd-generator` |
| **T**ime | How does it change over time? | `qe-performance-tester` |

### Artifacts Produced

| Artifact | Format | Contains |
|----------|--------|----------|
| SFDIPOT Assessment | HTML | 7-factor product analysis with test ideas |
| BDD Scenarios | Gherkin | Given/When/Then scenarios including edge cases |
| Risk Matrix | JSON | Story-level risk scoring |
| Dependency Map | JSON | Story dependencies and integration points |
| Coverage Forecast | Markdown | Predicted test coverage needs and gaps |

---

## Swarm 3: Development

**QCSD Activities:** Programming, Developer testing for acceptance criteria, Test design/execution/automation/reporting, Code quality checks

**Purpose:** Drive test-first development via TDD Red-Green-Refactor, generate tests, analyze coverage, perform code reviews, and validate test effectiveness through mutation testing.

### Agents (10 total: 3 core + 6 conditional + 1 analysis)

| Agent | Role | Category | Trigger |
|-------|------|----------|---------|
| `qe-tdd-specialist` | TDD adherence assessment and test quality analysis | Core | Always |
| `qe-code-complexity` | Cyclomatic/cognitive complexity analysis | Core | Always |
| `qe-coverage-specialist` | O(log n) sublinear coverage gap detection | Core | Always |
| `qe-security-scanner` | SAST scanning (OWASP Top 10) | Conditional | HAS_SECURITY_CODE |
| `qe-performance-tester` | Performance hotspot analysis | Conditional | HAS_PERFORMANCE_CODE |
| `qe-mutation-tester` | Test quality validation via mutation score | Conditional | HAS_CRITICAL_CODE |
| `qe-message-broker-tester` | Message broker integration testing | Conditional | HAS_MIDDLEWARE |
| `qe-sap-idoc-tester` | SAP IDoc message testing | Conditional | HAS_SAP_INTEGRATION |
| `qe-sod-analyzer` | Segregation of Duties compliance | Conditional | HAS_AUTHORIZATION |
| `qe-defect-predictor` | ML-powered defect prediction from code patterns | Analysis | Always |

### Skills Used

- `tdd-london-chicago` — TDD methodologies (London mock-first, Chicago state-based)
- `mutation-testing` — Test quality validation
- `performance-testing` — Performance hotspot detection
- `security-testing` — SAST during development

### How to Run

**Option 1: Slash Command (Recommended)**

```
/qcsd-development-swarm
```

This triggers the 9-phase execution. The swarm detects flags (`HAS_SECURITY_CODE`, `HAS_PERFORMANCE_CODE`, `HAS_CRITICAL_CODE`, `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION`) from the source code, spawns 3 core agents in parallel, conditionally spawns up to 6 additional agents, applies SHIP/CONDITIONAL/HOLD decision logic, persists learnings, then always runs `qe-defect-predictor` as a final analysis step.

**Option 2: Task Tool (Programmatic)**

```javascript
// Phase 2: Core agents spawned in ONE message, all in parallel
Task({
  description: "TDD adherence and test quality analysis",
  prompt: `You are qe-tdd-specialist. Assess TDD adherence and test quality
for source: [source code] and tests: [test code]...`,
  subagent_type: "qe-tdd-specialist",
  run_in_background: true
})

Task({
  description: "Code complexity analysis",
  prompt: `You are qe-code-complexity. Analyze cyclomatic and cognitive complexity
for: [source code paths]...`,
  subagent_type: "qe-code-complexity",
  run_in_background: true
})

Task({
  description: "Coverage gap detection",
  prompt: `You are qe-coverage-specialist. Detect coverage gaps using O(log n) sublinear
analysis for: [source and test paths]...`,
  subagent_type: "qe-coverage-specialist",
  run_in_background: true
})
```

**Option 3: MCP Tools**

```javascript
// Initialize fleet
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["test-generation", "coverage-analysis", "code-intelligence", "security-compliance"],
  maxAgents: 10
})

// Store development findings to QCSD namespace
mcp__agentic-qe__memory_store({
  key: "qcsd-development-src-auth-1706000000000",
  namespace: "qcsd-development",
  value: {
    sourcePath: "src/auth/",
    recommendation: "SHIP",
    tddAdherence: 48,
    coveragePercent: 87,
    complexityMax: 8,
    mutationScore: 0.82,
    flags: { HAS_SECURITY_CODE: true, HAS_PERFORMANCE_CODE: false }
  }
})

// Share to learning coordinator
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-development-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-pattern-learner"],
  knowledgeDomain: "development-patterns"
})
```

**Option 4: CLI**

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 10
npx @claude-flow/cli@latest memory store \
  --key "qcsd-development-src-auth" \
  --value '{"recommendation":"SHIP","tddAdherence":48,"coveragePercent":87}' \
  --namespace qcsd-development
npx @claude-flow/cli@latest memory search --query "development quality" --namespace qcsd-development
```

### Development Coordination Flow

```
Source Code + Test Files + Refinement BDD Scenarios
       │
       ▼
  PHASE 1: Flag Detection
  (HAS_SECURITY_CODE, HAS_PERFORMANCE_CODE, HAS_CRITICAL_CODE,
   HAS_MIDDLEWARE, HAS_SAP_INTEGRATION, HAS_AUTHORIZATION)
       │
       ▼
  BATCH 1 (Core — Parallel, ALL THREE always run)
  ┌────────────────┬──────────────────┬───────────────────┐
  │                │                  │                   │
  ▼                ▼                  ▼                   │
qe-tdd-         qe-code-         qe-coverage-           │
specialist      complexity       specialist              │
(TDD adherence) (Cyclomatic/     (O(log n) gap          │
                 cognitive)       detection)             │
  │                │                  │                   │
  └────────────────┴──────────────────┘                   │
                   │                                      │
             [METRICS GATE]                               │
                   │                                      │
  BATCH 2 (Conditional — Parallel, flag-dependent)        │
  ┌────────────┬──────────────┬─────────────────┐         │
  │            │              │                 │         │
  ▼            ▼              ▼                 ▼         │
qe-security- qe-perf-     qe-mutation-    Enterprise:    │
scanner      tester        tester          qe-message-   │
[SECURITY]   [PERF]        [CRITICAL]      broker-tester │
                                           qe-sap-idoc-  │
                                           tester         │
                                           qe-sod-        │
                                           analyzer       │
  │            │              │                 │         │
  └────────────┴──────────────┴─────────────────┘         │
                   │                                      │
             [SYNTHESIS + Phase 7: Learning Persistence]  │
                   │                                      │
  BATCH 3 (Analysis — Always runs)                        │
                   │                                      │
             qe-defect-predictor                          │
             (ML defect prediction)                       │
                   │                                      │
                   ▼                                      │
     DEVELOPMENT QUALITY REPORT                           │
  - SHIP / CONDITIONAL / HOLD decision                    │
  - TDD Adherence Score (/60)                             │
  - Coverage Metrics (line, branch, function)             │
  - Complexity Analysis                                   │
  - Mutation Score (if applicable)                        │
  - Security Findings (if applicable)                     │
  - Defect Predictions                                    │
```

### Artifacts Produced

| Artifact | Format | Contains |
|----------|--------|----------|
| Unit Tests | TypeScript/Jest | Tests generated via TDD Red-Green-Refactor |
| Coverage Report | JSON/HTML | Line, branch, function coverage with gap analysis |
| Mutation Score | JSON | Mutation testing effectiveness percentage |
| Security Report | JSON | SAST findings (OWASP Top 10) |
| Code Review | Markdown | Quality, security, performance, integration feedback |

---

## Swarm 4: CI/CD

**QCSD Activities:** Merge automation PR, Merge to master/pre-prod, Deploy to production, Automated quality gates, Selective automated checks

**Purpose:** Enforce quality through 4 sequential gates before deployment. Each gate has specific agents, thresholds, and a pass/fail decision.

### Agents (10 total: 3 core + 6 conditional + 1 analysis)

| Agent | Role | Category | Trigger |
|-------|------|----------|---------|
| `qe-quality-gate` | Quality gate threshold enforcement (4 gates) | Core | Always |
| `qe-regression-analyzer` | Risk-based regression analysis and test selection | Core | Always |
| `qe-flaky-hunter` | Flaky test detection and quarantine | Core | Always |
| `qe-security-scanner` | DAST scanning, secrets detection, SBOM | Conditional | HAS_SECURITY_PIPELINE |
| `qe-chaos-engineer` | Fault injection and resilience validation | Conditional | HAS_PERFORMANCE_PIPELINE |
| `qe-coverage-specialist` | Coverage delta analysis against baseline | Conditional | HAS_INFRA_CHANGE |
| `qe-middleware-validator` | Middleware/ESB pipeline validation | Conditional | HAS_MIDDLEWARE |
| `qe-soap-tester` | SOAP/WSDL service contract testing | Conditional | HAS_SAP_INTEGRATION |
| `qe-sod-analyzer` | Segregation of Duties compliance | Conditional | HAS_AUTHORIZATION |
| `qe-deployment-advisor` | Go/No-Go deployment recommendation (RELEASE/REMEDIATE/BLOCK) | Analysis | Always |

### Skills Used

- `shift-left-testing` — Move testing activities earlier in pipeline
- `shift-right-testing` — Testing in production and canary validation
- `regression-testing` — Risk-based regression test selection
- `security-testing` — Runtime security scanning

### How to Run

**Option 1: Slash Command (Recommended)**

```
/qcsd-cicd-swarm
```

This triggers the 9-phase execution. The swarm detects flags (`HAS_SECURITY_PIPELINE`, `HAS_PERFORMANCE_PIPELINE`, `HAS_INFRA_CHANGE`, `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION`) from pipeline artifacts and CI/CD configuration, spawns 3 core agents in parallel, conditionally spawns up to 6 additional agents, applies RELEASE/REMEDIATE/BLOCK decision logic, persists learnings, then always runs `qe-deployment-advisor` as a final analysis step.

**Cross-Phase Input:** Before executing, the CI/CD swarm retrieves the Development swarm's SHIP/CONDITIONAL/HOLD decision from memory:

```javascript
mcp__agentic-qe__memory_query({
  pattern: "qcsd-development-*",
  namespace: "qcsd-development"
})
```

**Option 2: Task Tool (Programmatic)**

```javascript
// Phase 2: Core agents spawned in ONE message, all in parallel
Task({
  description: "Quality gate enforcement analysis",
  prompt: `You are qe-quality-gate. Analyze pipeline artifacts and enforce
4 sequential quality gates for: [pipeline artifacts path]...`,
  subagent_type: "qe-quality-gate",
  run_in_background: true
})

Task({
  description: "Regression risk analysis",
  prompt: `You are qe-regression-analyzer. Analyze test results and identify
regression risks against baseline: [baseline ref]...`,
  subagent_type: "qe-regression-analyzer",
  run_in_background: true
})

Task({
  description: "Flaky test detection and quarantine",
  prompt: `You are qe-flaky-hunter. Detect flaky tests from pipeline test
results and recommend quarantine actions...`,
  subagent_type: "qe-flaky-hunter",
  run_in_background: true
})
```

**Option 3: MCP Tools**

```javascript
// Initialize fleet
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["quality-assessment", "test-execution", "security-compliance", "coverage-analysis"],
  maxAgents: 10
})

// Store CI/CD findings to QCSD namespace
mcp__agentic-qe__memory_store({
  key: "qcsd-cicd-PR-123-1706000000000",
  namespace: "qcsd-cicd",
  value: {
    pipelineId: "PR-123",
    recommendation: "RELEASE",
    gateResults: { gate1: "PASS", gate2: "PASS", gate3: "PASS", gate4: "PASS" },
    coveragePercent: 82,
    passRate: 99.5,
    flakyRate: 0.3,
    securityCritical: 0
  }
})

// Share to learning coordinator
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-cicd-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-pattern-learner"],
  knowledgeDomain: "cicd-patterns"
})
```

**Option 4: CLI**

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 10
npx @claude-flow/cli@latest memory store \
  --key "qcsd-cicd-PR-123" \
  --value '{"recommendation":"RELEASE","passRate":99.5,"coveragePercent":82}' \
  --namespace qcsd-cicd
npx @claude-flow/cli@latest memory search --query "cicd release decisions" --namespace qcsd-cicd
```

### 4 Quality Gates

```
PR Submitted
    │
    ▼
GATE 1: Static Analysis
  qe-code-complexity + qe-security-scanner
  Criteria: Complexity < 10, No critical vulns, No secrets
    │ PASS
    ▼
GATE 2: Test Execution
  qe-regression-analyzer + qe-flaky-hunter
  Criteria: Tests pass (>= 99%), Flaky rate <= 1%, Duration <= 10min
    │ PASS
    ▼
GATE 3: Coverage & Security
  qe-coverage-specialist + qe-security-scanner
  Criteria: Coverage >= 80%, No critical/high vulns, No contract breaks
    │ PASS
    ▼
GATE 4: Deployment Decision
  qe-quality-gate + qe-deployment-advisor
  Criteria: Overall quality score >= 0.85, Risk assessment acceptable
    │ PASS
    ▼
Deploy to Production
```

### Quality Thresholds

| Category | Metric | Threshold |
|----------|--------|-----------|
| Coverage | Line coverage | >= 80% |
| Coverage | Branch coverage | >= 75% |
| Coverage | Function coverage | >= 85% |
| Security | Critical vulnerabilities | 0 |
| Security | High vulnerabilities | 0 |
| Security | Medium vulnerabilities | <= 5 |
| Complexity | Cyclomatic | <= 10 |
| Complexity | Cognitive | <= 15 |
| Complexity | Maintainability index | >= 70 |
| Tests | Pass rate | >= 99% |
| Tests | Flaky rate | <= 1% |
| Tests | Suite duration | <= 10 min |

### Artifacts Produced

| Artifact | Format | Contains |
|----------|--------|----------|
| Pipeline Verdict | JSON | PASS / FAIL / WARN with gate-by-gate results |
| Security Report | JSON | SAST/DAST findings, secrets scan, dependency audit |
| Test Results | JUnit XML | Pass/fail per test with timing |
| Coverage Report | JSON/HTML | Coverage deltas against baseline |
| Deployment Risk Score | JSON | Risk level with Go/No-Go recommendation |

---

## Swarm 5: Production Telemetry

**QCSD Activities:** Enterprise DevOps Metrics (DORA), Site Reliability Engineering (SRE), Testing in Production, Assessment: What was done? What must change? What is the risk?

**Purpose:** Monitor production quality, detect defect patterns, perform root cause analysis, run chaos experiments, and — critically — feed learnings back to earlier swarms, completing the QCSD cycle.

### Agents (12 total: 3 core + 7 conditional + 2 feedback)

**Architectural Note:** Production is the only swarm with 12 agents (not 10) and 2 always-run feedback agents. This is by design: Production has dual responsibility — assessing current health AND closing the QCSD feedback loop.

| Agent | Role | Category | Trigger |
|-------|------|----------|---------|
| `qe-metrics-optimizer` | DORA metrics analysis and optimization | Core | Always |
| `qe-defect-predictor` | ML-powered defect prediction from production patterns | Core | Always |
| `qe-root-cause-analyzer` | Systematic 5-Why incident investigation | Core | Always |
| `qe-chaos-engineer` | Fault injection and resilience validation | Conditional | HAS_INFRASTRUCTURE_CHANGE |
| `qe-performance-tester` | Production SLA validation and benchmarking | Conditional | HAS_PERFORMANCE_SLA |
| `qe-regression-analyzer` | Production regression detection | Conditional | HAS_REGRESSION_RISK |
| `qe-pattern-learner` | Pattern discovery from recurring incidents | Conditional | HAS_RECURRING_INCIDENTS |
| `qe-middleware-validator` | Middleware/ESB health validation | Conditional | HAS_MIDDLEWARE |
| `qe-sap-rfc-tester` | SAP RFC/BAPI production health checking | Conditional | HAS_SAP_INTEGRATION |
| `qe-sod-analyzer` | Segregation of Duties compliance | Conditional | HAS_AUTHORIZATION |
| `qe-learning-coordinator` | Cross-domain learning synthesis and feedback mapping | Feedback | Always (runs 1st) |
| `qe-transfer-specialist` | Knowledge transfer to Ideation and Refinement agents | Feedback | Always (runs 2nd, sequential) |

### Skills Used

- `shift-right-testing` — Post-deploy monitoring and observability patterns
- `chaos-engineering-resilience` — Chaos engineering and resilience assessment
- `quality-metrics` — DORA metrics and quality measurement frameworks
- `performance-testing` — Performance SLA validation and benchmarking
- `holistic-testing-pact` — Holistic testing model for cross-phase feedback

### How to Run

**Option 1: Slash Command (Recommended)**

```
/qcsd-production-swarm
```

This triggers the 9-phase execution. The swarm detects flags (`HAS_INFRASTRUCTURE_CHANGE`, `HAS_PERFORMANCE_SLA`, `HAS_REGRESSION_RISK`, `HAS_RECURRING_INCIDENTS`, `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION`) from production telemetry, spawns 3 core agents in parallel, conditionally spawns up to 7 additional agents, applies HEALTHY/DEGRADED/CRITICAL decision logic, persists learnings, then always runs `qe-learning-coordinator` followed by `qe-transfer-specialist` (sequentially, not parallel) to close the QCSD feedback loop.

**Cross-Phase Input:** Before executing, the Production swarm retrieves the CI/CD swarm's RELEASE/REMEDIATE/BLOCK decision from memory:

```javascript
mcp__agentic-qe__memory_query({
  pattern: "qcsd-cicd-*",
  namespace: "qcsd-cicd"
})
```

**Option 2: Task Tool (Programmatic)**

```javascript
// Phase 2: Core agents spawned in ONE message, all in parallel
Task({
  description: "DORA metrics optimization analysis",
  prompt: `You are qe-metrics-optimizer. Analyze DORA metrics (deployment frequency,
lead time, MTTR, change failure rate) from: [telemetry data]...`,
  subagent_type: "qe-metrics-optimizer",
  run_in_background: true
})

Task({
  description: "Defect prediction from production patterns",
  prompt: `You are qe-defect-predictor. Analyze production incident data and predict
defect trends for release: [release ID]...`,
  subagent_type: "qe-defect-predictor",
  run_in_background: true
})

Task({
  description: "Root cause analysis of production incidents",
  prompt: `You are qe-root-cause-analyzer. Apply 5-Why analysis to production
incidents from: [incident data]...`,
  subagent_type: "qe-root-cause-analyzer",
  run_in_background: true
})

// Phase 8: Feedback agents run SEQUENTIALLY (coordinator first, then specialist)
// Step A: Learning coordinator synthesizes all findings
Task({
  description: "Cross-domain learning synthesis and feedback loop coordination",
  prompt: `You are qe-learning-coordinator. Synthesize all production findings
into a Learning Synthesis Matrix and map feedback to Ideation and Refinement...`,
  subagent_type: "qe-learning-coordinator",
  run_in_background: true
})
// WAIT for coordinator to complete, THEN:
// Step B: Transfer specialist closes the feedback loops
Task({
  description: "Knowledge transfer to target QCSD phases",
  prompt: `You are qe-transfer-specialist. Read the coordinator's output and
create transfer plans for all learnings to target agents...`,
  subagent_type: "qe-transfer-specialist",
  run_in_background: true
})
```

**Option 3: MCP Tools**

```javascript
// Initialize fleet (Production uses 12 agents — highest of all swarms)
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["learning-optimization", "defect-intelligence", "chaos-resilience", "enterprise-integration"],
  maxAgents: 12
})

// Store production findings to QCSD namespace
mcp__agentic-qe__memory_store({
  key: "qcsd-production-v3.6.9-1706000000000",
  namespace: "qcsd-production",
  value: {
    releaseId: "v3.6.9",
    recommendation: "HEALTHY",
    doraScore: 0.85,
    slaCompliance: 99.2,
    incidentSeverity: "P3",
    defectTrend: "declining",
    crossPhaseSignals: {
      toIdeation: "DORA trends for risk calibration",
      toRefinement: "RCA patterns for BDD improvement"
    }
  }
})

// Share to BOTH feedback agents (dual responsibility)
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-production-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-transfer-specialist"],
  knowledgeDomain: "production-health-patterns"
})

// Query production history
mcp__agentic-qe__memory_query({
  pattern: "qcsd-production-*",
  namespace: "qcsd-production"
})
```

**Option 4: CLI**

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 12
npx @claude-flow/cli@latest memory store \
  --key "qcsd-production-v3.6.9" \
  --value '{"recommendation":"HEALTHY","doraScore":0.85,"slaCompliance":99.2}' \
  --namespace qcsd-production
npx @claude-flow/cli@latest memory search --query "production health patterns" --namespace qcsd-production
npx @claude-flow/cli@latest memory list --namespace qcsd-production
```

### Production Coordination Flow

```
Production Telemetry + Incident Reports + DORA Data
+ CI/CD Phase Signals (retrieved from qcsd-cicd namespace)
       │
       ▼
  PHASE 1: Flag Detection
  (HAS_INFRASTRUCTURE_CHANGE, HAS_PERFORMANCE_SLA, HAS_REGRESSION_RISK,
   HAS_RECURRING_INCIDENTS, HAS_MIDDLEWARE, HAS_SAP_INTEGRATION,
   HAS_AUTHORIZATION)
       │
       ▼
  BATCH 1 (Core — Parallel, ALL THREE always run)
  ┌────────────────┬──────────────────┬───────────────────┐
  │                │                  │                   │
  ▼                ▼                  ▼                   │
qe-metrics-     qe-defect-       qe-root-cause-         │
optimizer       predictor        analyzer                │
(DORA metrics)  (ML prediction)  (5-Why analysis)       │
  │                │                  │                   │
  └────────────────┴──────────────────┘                   │
                   │                                      │
             [METRICS GATE]                               │
                   │                                      │
  BATCH 2 (Conditional — Parallel, flag-dependent)        │
  ┌────────────┬──────────────┬─────────────────┐         │
  │            │              │                 │         │
  ▼            ▼              ▼                 ▼         │
qe-chaos-   qe-perf-     qe-regression-  qe-pattern-    │
engineer    tester        analyzer        learner        │
[INFRA]     [SLA]         [REGRESS]       [RECURRING]    │
                                                          │
  Enterprise: qe-middleware-validator [MIDDLEWARE]         │
              qe-sap-rfc-tester [SAP]                     │
              qe-sod-analyzer [AUTH]                       │
  │            │              │                 │         │
  └────────────┴──────────────┴─────────────────┘         │
                   │                                      │
             [SYNTHESIS + Phase 7: Learning Persistence]  │
                   │                                      │
  BATCH 3 (Feedback — SEQUENTIAL, both always run)        │
                   │                                      │
             qe-learning-coordinator (runs FIRST)         │
             (Learning Synthesis Matrix)                   │
                   │                                      │
             [WAIT for output]                            │
                   │                                      │
             qe-transfer-specialist (runs SECOND)         │
             (Knowledge Transfer Plans to                  │
              Ideation + Refinement agents)                │
                   │                                      │
                   ▼                                      │
  PRODUCTION HEALTH ASSESSMENT                            │
  + FEEDBACK LOOP CLOSURE                                 │
  ┌──────────────────────────────────────┐                │
  │  HEALTHY / DEGRADED / CRITICAL       │                │
  │  - What was done? (Release changes)  │                │
  │  - What must change? (Improvements)  │                │
  │  - What is the risk? (Risk posture)  │                │
  │  - DORA Metrics (Elite/High/Med/Low) │                │
  │  - SRE Health (SLO/SLA compliance)   │                │
  │  - Feedback loops closed: X/Y        │                │
  │  - Escape analysis (cross-phase)     │                │
  └──────────────────────────────────────┘                │
```

### Artifacts Produced

| Artifact | Format | Contains |
|----------|--------|----------|
| Defect Predictions | JSON | ML-predicted defect areas with confidence scores |
| Root Cause Analysis | Markdown | Incident timeline, root cause, resolution, prevention |
| Pattern Library | SQLite (memory.db) | Extracted patterns from production incidents |
| DORA Metrics | JSON | Deployment frequency, lead time, MTTR, change failure rate |
| SRE Health Report | JSON | SLO/SLA compliance, error budgets, uptime |
| Learning Updates | Memory Store | Patterns shared back to Ideation and Refinement agents |

---

## Cross-Swarm Communication

The 5 QCSD swarms do not operate in isolation. QCSD's power comes from its feedback loops — production learnings inform future ideation, CI/CD failures improve development practices, and coverage gaps refine acceptance criteria. All cross-swarm communication flows through **QCSD-namespaced memory** in `.agentic-qe/memory.db`.

### 5 QCSD Memory Namespaces

Each swarm writes to its own namespace and reads from upstream namespaces:

| Namespace | Written By | Read By | Key Pattern |
|-----------|-----------|---------|-------------|
| `qcsd-ideation` | `/qcsd-ideation-swarm` | Refinement, Production | `qcsd-ideation-{epicId}-{timestamp}` |
| `qcsd-refinement` | `/qcsd-refinement-swarm` | Development, CI/CD | `qcsd-refinement-{storyId}-{timestamp}` |
| `qcsd-development` | `/qcsd-development-swarm` | CI/CD | `qcsd-development-{sourcePath}-{timestamp}` |
| `qcsd-cicd` | `/qcsd-cicd-swarm` | Production | `qcsd-cicd-{pipelineId}-{timestamp}` |
| `qcsd-production` | `/qcsd-production-swarm` | Ideation, Refinement | `qcsd-production-{releaseId}-{timestamp}` |

### 4 Feedback Loops (with actual memory operations)

```
LOOP 1: Production ──▶ Ideation (Strategic)
  qe-defect-predictor → qe-learning-coordinator → qe-transfer-specialist
  ──▶ memory_share to qe-risk-assessor, qe-quality-criteria-recommender
  Signal: "DORA trends and defect patterns for risk calibration and quality criteria updates"
  Namespace: qcsd-production → consumed by qcsd-ideation

LOOP 2: Production ──▶ Refinement (Tactical)
  qe-root-cause-analyzer → qe-learning-coordinator → qe-transfer-specialist
  ──▶ memory_share to qe-product-factors-assessor, qe-bdd-generator
  Signal: "RCA patterns and escape analysis for test strategy improvement and BDD generation"
  Namespace: qcsd-production → consumed by qcsd-refinement

LOOP 3: CI/CD ──▶ Development (Operational)
  qe-quality-gate → qe-flaky-hunter → qe-deployment-advisor
  ──▶ memory_store to qcsd-cicd namespace
  Signal: "Gate failures and flaky test patterns for TDD improvement"
  Namespace: qcsd-cicd → consumed by qcsd-development

LOOP 4: Development ──▶ Refinement (Quality Criteria)
  qe-coverage-specialist → qe-defect-predictor
  ──▶ memory_store to qcsd-development namespace
  Signal: "BDD scenarios as test specification" + "Coverage gaps as verification focus"
  Namespace: qcsd-development → consumed by qcsd-refinement
```

### How the Feedback Loop Actually Works (MCP)

**Phase 7 (Learning Persistence) — executed by every QCSD swarm:**

```javascript
// Step 1: Store findings to the swarm's own QCSD namespace
mcp__agentic-qe__memory_store({
  key: `qcsd-{phase}-{targetId}-${Date.now()}`,
  namespace: "qcsd-{phase}",         // e.g., "qcsd-production"
  value: {
    recommendation: "HEALTHY",        // phase-specific decision
    metrics: { ... },                 // phase-specific metrics
    flags: { ... },                   // detected flags
    agentsInvoked: [...],             // actual agents that ran
    crossPhaseSignals: {
      toIdeation: "...",              // what Ideation should know
      toRefinement: "..."             // what Refinement should know
    },
    timestamp: new Date().toISOString()
  }
})

// Step 2: Share learnings to the learning coordinator for cross-domain transfer
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-{phase}-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-pattern-learner"],
  knowledgeDomain: "{phase}-patterns"
})

// Step 3: Save learning persistence record to output folder
// Write tool → ${OUTPUT_FOLDER}/09-learning-persistence.json
```

**Phase 0 (Cross-Phase Consumption) — executed at swarm start:**

```javascript
// Production swarm retrieves CI/CD decisions before analyzing
mcp__agentic-qe__memory_query({
  pattern: "qcsd-cicd-*",
  namespace: "qcsd-cicd"
})

// Development swarm retrieves Refinement BDD scenarios
mcp__agentic-qe__memory_query({
  pattern: "qcsd-refinement-*",
  namespace: "qcsd-refinement"
})

// Ideation swarm retrieves Production feedback (Loop 1)
mcp__agentic-qe__memory_query({
  pattern: "qcsd-production-*",
  namespace: "qcsd-production"
})
```

### How Swarms Share Information

| Mechanism | How it Works | When |
|-----------|-------------|------|
| **`memory_store`** | Each swarm writes to its `qcsd-{phase}` namespace (Phase 7) | After every swarm execution |
| **`memory_query`** | Downstream swarms query upstream namespaces (Phase 0) | Before every swarm starts |
| **`memory_share`** | Direct agent-to-agent knowledge transfer via learning coordinator | After Phase 7, before Phase 8 |
| **ReasoningBank** | Automatic 4-stage learning pipeline (Retrieve → Judge → Distill → Consolidate) | Continuous, behind every task |
| **Dream Cycles** | Offline consolidation that discovers novel cross-domain patterns | Every hour or when 20+ experiences buffered |
| **`09-learning-persistence.json`** | File-based record of what was persisted, per swarm run | Phase 7 of every swarm |

**CLI equivalents for cross-swarm queries:**

```bash
# Query what Ideation learned about an epic
npx @claude-flow/cli@latest memory search --query "quality criteria" --namespace qcsd-ideation

# Query what Refinement learned about stories
npx @claude-flow/cli@latest memory search --query "SFDIPOT priorities" --namespace qcsd-refinement

# Query what Development found in code quality
npx @claude-flow/cli@latest memory search --query "coverage gaps" --namespace qcsd-development

# Query what CI/CD decided about a release
npx @claude-flow/cli@latest memory search --query "release decision" --namespace qcsd-cicd

# Query what Production found post-deploy
npx @claude-flow/cli@latest memory search --query "production health" --namespace qcsd-production
```

### Quality Metrics Flow Across Swarms

```
Ideation: Risk Score, Testability Score, Quality Criteria
    ↓
Refinement: SFDIPOT Score, AC Completeness, BDD Coverage
    ↓
Development: Code Coverage %, Test Quality (Mutation Score), Security Score
    ↓
CI/CD: Quality Gate Score, Deployment Readiness, Contract Compliance
    ↓
Production: DORA Metrics, SRE Metrics, Defect Density
    ↓
Aggregate: Overall Quality Trend → Informs Next Cycle
```

### Requirements-to-Production Traceability

```
Requirements (Ideation/Refinement)
        │
        ▼ qe-requirements-validator
Test Cases (Development)
        │
        ▼ qe-regression-analyzer
Test Results (CI/CD)
        │
        ▼ qe-defect-predictor
Production Outcomes (Evaluate)
        │
        ▼ qe-learning-coordinator
Learnings → Back to Requirements
```

---

## Agent-to-Swarm Quick Reference

Derived from the 5 QCSD SKILL.md files. **C = Core (always), X = Conditional (flag-dependent), A = Analysis/Transformation/Feedback (always).**

### Core & Always-Run Agents

| Agent | Ideation | Refinement | Development | CI/CD | Production |
|-------|:--------:|:----------:|:-----------:|:-----:|:----------:|
| `qe-quality-criteria-recommender` | **C** | - | - | - | - |
| `qe-risk-assessor` | **C** | - | - | - | - |
| `qe-requirements-validator` | **C** | **C** | - | - | - |
| `qe-product-factors-assessor` | - | **C** | - | - | - |
| `qe-bdd-generator` | - | **C** | - | - | - |
| `qe-test-idea-rewriter` | - | **A** | - | - | - |
| `qe-tdd-specialist` | - | - | **C** | - | - |
| `qe-code-complexity` | - | - | **C** | - | - |
| `qe-coverage-specialist` | - | - | **C** | X | - |
| `qe-defect-predictor` | - | - | **A** | - | **C** |
| `qe-quality-gate` | - | - | - | **C** | - |
| `qe-regression-analyzer` | - | - | - | **C** | X |
| `qe-flaky-hunter` | - | - | - | **C** | - |
| `qe-deployment-advisor` | - | - | - | **A** | - |
| `qe-metrics-optimizer` | - | - | - | - | **C** |
| `qe-root-cause-analyzer` | - | - | - | - | **C** |
| `qe-learning-coordinator` | - | - | - | - | **A** |
| `qe-transfer-specialist` | - | - | - | - | **A** |

### Conditional Agents (flag-dependent)

| Agent | Ideation | Refinement | Development | CI/CD | Production | Flag |
|-------|:--------:|:----------:|:-----------:|:-----:|:----------:|------|
| `qe-accessibility-auditor` | X | - | - | - | - | HAS_UI |
| `qe-security-auditor` | X | - | - | - | - | HAS_SECURITY |
| `qe-qx-partner` | X | - | - | - | - | HAS_UX |
| `qe-contract-validator` | - | X | - | - | - | HAS_API |
| `qe-impact-analyzer` | - | X | - | - | - | HAS_REFACTORING |
| `qe-dependency-mapper` | - | X | - | - | - | HAS_DEPENDENCIES |
| `qe-security-scanner` | - | - | X | X | - | HAS_SECURITY_* |
| `qe-performance-tester` | - | - | X | - | X | HAS_PERFORMANCE_* |
| `qe-mutation-tester` | - | - | X | - | - | HAS_CRITICAL_CODE |
| `qe-chaos-engineer` | - | - | - | X | X | HAS_*_PIPELINE / HAS_INFRASTRUCTURE_CHANGE |
| `qe-pattern-learner` | - | - | - | - | X | HAS_RECURRING_INCIDENTS |

### Enterprise Integration Agents (conditional, across all 5 swarms)

| Agent | Ideation | Refinement | Development | CI/CD | Production | Flag |
|-------|:--------:|:----------:|:-----------:|:-----:|:----------:|------|
| `qe-middleware-validator` | X | X | - | X | X | HAS_MIDDLEWARE |
| `qe-sap-rfc-tester` | X | - | - | - | X | HAS_SAP_INTEGRATION |
| `qe-odata-contract-tester` | - | X | - | - | - | HAS_SAP_INTEGRATION |
| `qe-sap-idoc-tester` | - | - | X | - | - | HAS_SAP_INTEGRATION |
| `qe-soap-tester` | - | - | - | X | - | HAS_SAP_INTEGRATION |
| `qe-message-broker-tester` | - | - | X | - | - | HAS_MIDDLEWARE |
| `qe-sod-analyzer` | X | X | X | X | X | HAS_AUTHORIZATION |

**Legend:** C = Core (always runs), X = Conditional (flag-dependent), A = Analysis/Transformation/Feedback (always runs), - = Not in this swarm

---

## Implementation Roadmap

### Weeks 1-2: Foundation (Enable & Engage)

1. Set up the project with `npx @claude-flow/cli@latest init --wizard`
2. Run `/qcsd-ideation-swarm` on your next epic or feature — observe GO/CONDITIONAL/NO-GO decisions
3. Run `/qcsd-refinement-swarm` during sprint grooming — observe READY/CONDITIONAL/NOT-READY decisions
4. Check `qcsd-ideation` and `qcsd-refinement` namespaces to see persisted learnings

### Weeks 3-4: Execution Integration

1. Run `/qcsd-development-swarm` during active coding — observe SHIP/CONDITIONAL/HOLD decisions
2. Run `/qcsd-cicd-swarm` on PR merge events — observe RELEASE/REMEDIATE/BLOCK decisions
3. Verify the CI/CD swarm consumes Development decisions from `qcsd-development` namespace

### Weeks 5-6: Evaluate & Learn

1. Run `/qcsd-production-swarm` post-release — observe HEALTHY/DEGRADED/CRITICAL decisions
2. Verify feedback loops: Production's `qe-transfer-specialist` should produce learnings for Ideation and Refinement agents
3. Query cross-phase signals: `npx @claude-flow/cli@latest memory search --query "production feedback" --namespace qcsd-production`

### Ongoing: Optimization

1. Tune agent routing based on ReasoningBank performance data
2. Adjust quality gate thresholds based on team maturity
3. Review DORA metrics trends to measure QCSD effectiveness
4. Run Dream cycles to consolidate cross-swarm patterns: `mcp__agentic-qe__qe/learning/dream({ action: "insights" })`

---

## CI/CD Integration

The QCSD CI/CD swarm (`/qcsd-cicd-swarm`) enforces 4 sequential quality gates. In GitHub Actions, you can invoke the swarm agents via CLI or run the checks they perform directly:

```yaml
# GitHub Actions example — QCSD Verification Pipeline
name: QCSD Quality Pipeline
on: [pull_request]

jobs:
  qcsd-verification:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install AQE
        run: npm install -g agentic-qe

      - name: QCSD Gate 1 - Static Analysis (qe-quality-gate)
        run: |
          npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 10
          npx @claude-flow/cli@latest agent spawn --type qe-quality-gate \
            --task "Enforce quality gates on PR artifacts"

      - name: QCSD Gate 2 - Regression & Flaky Detection (qe-regression-analyzer + qe-flaky-hunter)
        run: |
          npx @claude-flow/cli@latest agent spawn --type qe-regression-analyzer \
            --task "Analyze test results for regressions against main"
          npx @claude-flow/cli@latest agent spawn --type qe-flaky-hunter \
            --task "Detect flaky tests and recommend quarantine"

      - name: QCSD Gate 3 - Conditional Agents (flag-dependent)
        run: |
          # These agents only run if flags are TRUE in the pipeline context
          # HAS_SECURITY_PIPELINE → qe-security-scanner
          # HAS_PERFORMANCE_PIPELINE → qe-chaos-engineer
          # HAS_INFRA_CHANGE → qe-coverage-specialist
          npx @claude-flow/cli@latest agent spawn --type qe-security-scanner \
            --task "SAST/DAST scanning of pipeline artifacts"

      - name: QCSD Gate 4 - Deployment Decision (qe-deployment-advisor)
        run: |
          npx @claude-flow/cli@latest agent spawn --type qe-deployment-advisor \
            --task "Render RELEASE/REMEDIATE/BLOCK decision"

      - name: QCSD Learning Persistence (Phase 7)
        run: |
          npx @claude-flow/cli@latest memory store \
            --key "qcsd-cicd-${{ github.event.pull_request.number }}-$(date +%s)" \
            --value '{"recommendation":"RELEASE","passRate":99.5,"coveragePercent":82}' \
            --namespace qcsd-cicd
```

---

## Troubleshooting

### QCSD Swarm Agents Not Spawning

```bash
# Check fleet health
npx @claude-flow/cli@latest swarm status

# Verify daemon is running
npx @claude-flow/cli@latest daemon start

# Run diagnostics
npx @claude-flow/cli@latest doctor --fix

# Verify QCSD skills are registered
ls -la .claude/skills/qcsd-*/SKILL.md
```

### QCSD Memory/Learning Not Persisting

```bash
# Check database exists and has data
ls -la .agentic-qe/memory.db
sqlite3 .agentic-qe/memory.db "PRAGMA integrity_check; SELECT COUNT(*) FROM qe_patterns;"

# Verify QCSD namespaces have data
npx @claude-flow/cli@latest memory list --namespace qcsd-ideation
npx @claude-flow/cli@latest memory list --namespace qcsd-refinement
npx @claude-flow/cli@latest memory list --namespace qcsd-development
npx @claude-flow/cli@latest memory list --namespace qcsd-cicd
npx @claude-flow/cli@latest memory list --namespace qcsd-production

# Check dream scheduler status
mcp__agentic-qe__qe/learning/dream({ action: "status" })
```

### Cross-Phase Feedback Not Flowing

```bash
# Verify Production swarm stored its cross-phase signals
npx @claude-flow/cli@latest memory search --query "crossPhaseSignals" --namespace qcsd-production

# Verify Ideation can read Production feedback
npx @claude-flow/cli@latest memory search --query "production health" --namespace qcsd-production

# Check that memory_share was called (should appear in 09-learning-persistence.json)
cat "Agentic QCSD/production/09-learning-persistence.json" 2>/dev/null || echo "No persistence record found"
```

### Quality Gates Too Strict/Lenient

Adjust thresholds based on team maturity. Start lenient, tighten over time:

| Team Maturity | Coverage | Security | Pass Rate |
|---------------|----------|----------|-----------|
| Starting out | >= 60% | Critical: 0 | >= 95% |
| Intermediate | >= 75% | High: 0 | >= 98% |
| Mature | >= 85% | Medium: <= 3 | >= 99.5% |

---

## FAQ

**Q: Do I need to run all 5 swarms?**
A: No. Start with whichever phase matches your current pain point. `/qcsd-ideation-swarm` and `/qcsd-development-swarm` give the most immediate value. Add others incrementally.

**Q: How many agents run at once?**
A: Each swarm uses 9-12 agents (3 core + conditional based on flag detection). Production has the most (12 agents with 2 always-run feedback agents). The hierarchical topology coordinates them through parallel batches. Max recommended across all swarms is 15.

**Q: How do QCSD swarms learn from each other?**
A: Through QCSD-namespaced memory in `.agentic-qe/memory.db`. Every swarm's Phase 7 stores findings via `memory_store` to its own `qcsd-{phase}` namespace and shares via `memory_share` to the learning coordinator. Downstream swarms query upstream namespaces at startup (Phase 0). Dream cycles consolidate cross-namespace patterns offline.

**Q: What triggers the feedback loops?**
A: Phase 7 (Learning Persistence) fires automatically in every QCSD swarm and calls `memory_store` + `memory_share` + saves `09-learning-persistence.json`. The Production swarm additionally runs `qe-learning-coordinator` and `qe-transfer-specialist` (Phase 8) to explicitly close the loop back to Ideation and Refinement agents.

**Q: What are the phase-specific decisions?**
A: Each swarm renders a distinct decision: Ideation (GO/CONDITIONAL/NO-GO), Refinement (READY/CONDITIONAL/NOT-READY), Development (SHIP/CONDITIONAL/HOLD), CI/CD (RELEASE/REMEDIATE/BLOCK), Production (HEALTHY/DEGRADED/CRITICAL).

**Q: What are the flags and conditional agents?**
A: Each swarm detects context-specific flags (e.g., `HAS_SECURITY`, `HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION`). When a flag is TRUE, the corresponding conditional agent is spawned. This ensures enterprise-specific agents (SAP, middleware, SoD) only run when relevant.

**Q: Where does the QCSD framework come from?**
A: QCSD was created by Lalitkumar Bhamare and won the EuroSTAR 2022 Best Paper Award. It builds on work by Jerry Weinberg (quality consciousness), James Bach (HTSM, SFDIPOT), and Michael Bolton (broader coverage). The Agentic QE implementation maps these human practices to AI agent swarms.

---

## Related Documentation

- [QCSD eBook](../../Agentic%20QCSD/Lalitkumar-Bhamare-Quality-Conscious-Software-Delivery-eBook.pdf) — Original QCSD framework by Lalitkumar Bhamare
- [QCSD-Agentic QE Mapping Framework](../../Agentic%20QCSD/02%20QCSD%20agent%20swarm%20related/QCSD-AGENTIC-QE-MAPPING-FRAMEWORK.md) — Detailed agent-to-phase mapping
- [ReasoningBank Learning System](reasoningbank-learning-system.md) — How cross-swarm learning works
- [Skill Validation Guide](skill-validation.md) — Trust tiers for skills used by swarm agents
- [Fleet + Code Intelligence Guide](fleet-code-intelligence-integration.md) — Setting up code intelligence for swarm agents

---

*Part of Agentic QE — QCSD 2.0: Quality Conscious Software Delivery powered by AI Agent Swarms*
