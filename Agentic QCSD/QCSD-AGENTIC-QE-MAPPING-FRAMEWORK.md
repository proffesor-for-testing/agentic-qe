# QCSD to Agentic QE Agent Mapping Framework

**Version**: 1.3
**Date**: 2026-01-23
**Status**: Reference Framework
**Verified Against**:
- Agents: `/workspaces/agentic-qe/v3/assets/agents/v3/`
- Sub-agents: `/workspaces/agentic-qe/v3/assets/agents/v3/subagents/`
- Skills: `/workspaces/agentic-qe/.claude/skills/`

---

## Executive Summary

This framework maps the Quality Conscious Software Delivery (QCSD) flow phases to Agentic QE agent capabilities, providing a structured approach for researchers to identify which agents, sub-agents, and skills support each SDLC phase and how they coordinate across the delivery pipeline.

**Inventory:**
- **44 Verified QE Agents** (in `v3/assets/agents/v3/`)
- **7 Verified Sub-agents** (in `v3/assets/agents/v3/subagents/`)
- **95 Skills** (in `.claude/skills/`)
- **12 DDD Domains**

### Terminology

| Term | Definition |
|------|------------|
| **Agent** | Autonomous QE specialist with full lifecycle capabilities |
| **Sub-agent** | Specialized component spawned by a parent agent for focused tasks |
| **Skill** | Reusable capability/methodology that can be invoked by agents or directly |

---

## QCSD Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUALITY CONSCIOUS SOFTWARE DELIVERY                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ENABLE & ENGAGE              EXECUTE                    EVALUATE           │
│   ┌─────────────┐         ┌─────────────┐            ┌─────────────┐        │
│   │  IDEATION   │────────▶│ DEVELOPMENT │───────────▶│ PRODUCTION  │        │
│   │             │         │             │            │  TELEMETRY  │        │
│   └──────┬──────┘         └──────┬──────┘            └──────┬──────┘        │
│          │                       │                          │               │
│   ┌──────▼──────┐         ┌──────▼──────┐            ┌──────▼──────┐        │
│   │  GROOMING   │────────▶│   CI/CD     │◀───────────│  FEEDBACK   │        │
│   │  SESSIONS   │         │  PIPELINE   │            │    LOOP     │        │
│   └─────────────┘         └─────────────┘            └─────────────┘        │
│                                                                              │
│   ════════════════════════════════════════════════════════════════════      │
│   CONTINUOUS: Testability Sessions | Bi-Weekly Exchanges | Assessments      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: ENABLE & ENGAGE

### 1.1 Ideation Phase

**QCSD Activities:**
- Risk Storming
- Testing the design
- QX sessions (QE + UX pairing)
- Quality Criteria sessions

**Capability Requirements:**

| Capability | Description | Priority |
|------------|-------------|----------|
| Risk Assessment | Identify quality risks in proposed designs | P0 |
| Testability Analysis | Evaluate design testability | P0 |
| Requirements Validation | Validate requirements completeness | P1 |
| Accessibility Analysis | Early a11y considerations | P1 |
| Security Threat Modeling | Identify security risks | P1 |
| UX Quality Analysis | Quality experience assessment | P2 |

**Recommended Agentic QE Agents:**

| Agent | Domain | Role in Ideation |
|-------|--------|------------------|
| **`qe-quality-criteria-recommender`** | **Requirements Validation** | **HTSM v6.3 Quality Criteria analysis - PRIMARY for Quality Criteria sessions** |
| `qe-risk-assessor` | Coverage Analysis | Risk-weighted assessment of design components |
| `qe-requirements-validator` | Requirements Validation | Validate requirements completeness and clarity |
| `qe-accessibility-auditor` | Visual Accessibility | Early accessibility review of UI designs |
| `qe-security-auditor` | Security Compliance | Threat modeling and security risk identification |
| `qe-qx-partner` | Cross-Domain | Quality Experience analysis (QE + UX pairing) |

**Recommended Skills:**

| Skill | Purpose |
|-------|---------|
| `testability-scoring` | Score design testability (10 testability principles) |
| `risk-based-testing` | Focus on highest-risk areas |
| `context-driven-testing` | Adapt approach to context |
| `holistic-testing-pact` | PACT principles for strategy |

### Key Agent: qe-quality-criteria-recommender (HTSM v6.3)

**Purpose:** Implements QCSD Quality Criteria sessions using James Bach's Heuristic Test Strategy Model v6.3.

**HTSM Quality Criteria Categories (10 Total):**

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

**Evidence Types:**
- **Direct**: Actual code/doc quote with `file:line` reference
- **Inferred**: Logical deduction with reasoning chain
- **Claimed**: Requires verification (no speculation)

**When to Use:** PI Planning, Sprint Planning, Quality Criteria sessions - before development begins.

**Agent Coordination Pattern:**
```
┌─────────────────────────────────────────────────────────────┐
│                      IDEATION SWARM                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Epic/Feature Input                                          │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  qe-quality-criteria-recommender (HTSM v6.3)           ││
│  │  - Analyzes 10 quality categories                       ││
│  │  - Collects evidence with file:line refs               ││
│  │  - Generates quality recommendations                    ││
│  └─────────────────────────────────────────────────────────┘│
│         │                                                    │
│         ├──────────────────┬──────────────────┐             │
│         ▼                  ▼                  ▼             │
│  testability-         qe-risk-         qe-requirements-     │
│  scoring (skill)      assessor         validator            │
│         │                  │                  │             │
│         └──────────────────┴──────────────────┘             │
│                            │                                 │
│                            ▼                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │     IDEATION REPORT                                   │  │
│  │  - HTSM Quality Criteria (10 categories)              │  │
│  │  - Testability Score                                  │  │
│  │  - Risk Assessment                                    │  │
│  │  - Requirements Validation                            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**MCP Integration:**
```javascript
// Ideation Phase Orchestration
mcp__agentic_qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["requirements-validation", "coverage-analysis", "security-compliance"],
  maxAgents: 6
})

mcp__agentic_qe__task_orchestrate({
  task: "ideation-quality-assessment",
  strategy: "parallel",
  payload: {
    designDoc: "path/to/design.md",
    requirements: "path/to/requirements.md"
  }
})
```

---

### 1.2 Grooming Sessions Phase

**QCSD Activities:**
- Story analysis with SFDIPOT
- Finetuning acceptance criteria
- Product Coverage sessions
- Dev + QE pairing

**Capability Requirements:**

| Capability | Description | Priority |
|------------|-------------|----------|
| SFDIPOT Analysis | Systematic product factor analysis | P0 |
| Acceptance Criteria Validation | Verify AC completeness and testability | P0 |
| BDD Scenario Generation | Generate behavior specifications | P1 |
| Coverage Forecasting | Predict test coverage needs | P1 |
| Dependency Analysis | Map story dependencies | P2 |
| Impact Analysis | Assess change impact | P2 |

**Recommended Agentic QE Agents:**

| Agent | Domain | Role in Grooming |
|-------|--------|------------------|
| `qe-product-factors-assessor` | Requirements Validation | SFDIPOT analysis for stories |
| `qe-requirements-validator` | Requirements Validation | AC validation and refinement |
| `qe-bdd-generator` | Requirements Validation | Generate BDD scenarios from ACs |
| `qe-gap-detector` | Coverage Analysis | Forecast coverage gaps |
| `qe-dependency-mapper` | Code Intelligence | Map story dependencies |
| `qe-impact-analyzer` | Code Intelligence | Assess change impact |

**SFDIPOT Pipeline Integration:**

The existing SFDIPOT assessment pipeline provides a three-stage approach:

1. **Generate** - `qe-product-factors-assessor` creates SFDIPOT assessment
2. **Rewrite** - `qe-test-idea-rewriter` transforms test ideas to action patterns
3. **Validate** - Enforce quality gates

```javascript
// SFDIPOT Assessment for Story
Task("Generate SFDIPOT assessment", `
  Generate SFDIPOT Product Factors assessment for:
  [Story: ${storyDescription}]

  Output: .agentic-qe/product-factors-assessments/${storyId}.html
`, "qe-product-factors-assessor")
```

**Agent Coordination Pattern:**
```
┌─────────────────────────────────────────────────────┐
│              GROOMING SWARM                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Story Input ──▶ qe-product-factors-assessor       │
│                          │                          │
│                          ▼                          │
│                  qe-requirements-validator          │
│                          │                          │
│            ┌─────────────┼─────────────┐           │
│            ▼             ▼             ▼           │
│   qe-bdd-       qe-gap-        qe-impact-         │
│   generator     detector       analyzer            │
│            │             │             │           │
│            └─────────────┴─────────────┘           │
│                          │                          │
│                          ▼                          │
│  ┌───────────────────────────────────┐             │
│  │     GROOMING OUTPUT               │             │
│  │  - SFDIPOT Assessment             │             │
│  │  - Validated ACs                  │             │
│  │  - BDD Scenarios                  │             │
│  │  - Coverage Forecast              │             │
│  │  - Impact Analysis                │             │
│  └───────────────────────────────────┘             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Phase 2: EXECUTE

### 2.1 Development Phase

**QCSD Activities:**
- Programming
- Developer testing for AC
- Test design/execution/automation/reporting
- Code Quality checks with SonarQube
- Automation coverage dashboard

**Capability Requirements:**

| Capability | Description | Priority |
|------------|-------------|----------|
| Test Generation | AI-powered test creation | P0 |
| TDD Support | Red-Green-Refactor workflow | P0 |
| Code Quality Analysis | Static analysis, complexity | P0 |
| Coverage Analysis | Real-time coverage tracking | P1 |
| Security Scanning | SAST during development | P1 |
| Test Execution | Parallel test runs | P1 |
| Mutation Testing | Test quality validation | P2 |
| Contract Testing | API contract validation | P2 |

**Recommended Agentic QE Agents:**

| Agent | Domain | Role in Development |
|-------|--------|---------------------|
| `qe-test-architect` | Test Generation | Strategic test planning |
| `qe-tdd-specialist` | Test Generation | TDD red-green-refactor (full cycle) |
| `qe-integration-tester` | Test Generation | Integration test creation |
| `qe-property-tester` | Test Generation | Property-based testing |
| `qe-parallel-executor` | Test Execution | Distributed test execution |
| `qe-flaky-hunter` | Test Execution | Flaky test detection |
| `qe-coverage-specialist` | Coverage Analysis | O(log n) coverage analysis |
| `qe-security-scanner` | Security Compliance | SAST scanning |
| `qe-code-complexity` | Quality Assessment | Code complexity analysis |
| `qe-mutation-tester` | Coverage Analysis | Mutation testing |
| `qe-contract-validator` | Contract Testing | API contract testing |

**TDD Workflow (via `qe-tdd-specialist` + Sub-agents):**

The `qe-tdd-specialist` agent orchestrates the complete Red-Green-Refactor cycle using specialized sub-agents:

| Phase | Sub-agent | Function |
|-------|-----------|----------|
| RED | `qe-tdd-red` | Write failing tests first |
| GREEN | `qe-tdd-green` | Minimal implementation to pass |
| REFACTOR | `qe-tdd-refactor` | Improve design without breaking tests |

```
┌─────────────────────────────────────────────────────────────────┐
│                     qe-tdd-specialist (Parent Agent)              │
├───────────────────┬───────────────────┬───────────────────────────┤
│   qe-tdd-red      │   qe-tdd-green    │    qe-tdd-refactor        │
│   (Sub-agent)     │   (Sub-agent)     │    (Sub-agent)            │
├───────────────────┼───────────────────┼───────────────────────────┤
│  Write failing    │   Make pass       │    Improve code           │
│     test          │   (minimal)       │      quality              │
└───────────────────┴───────────────────┴───────────────────────────┘
```

**Agent Coordination Pattern:**
```
┌─────────────────────────────────────────────────────────────────┐
│                     DEVELOPMENT SWARM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Code Change ──▶ qe-test-architect ──▶ Test Strategy            │
│                          │                                       │
│       ┌──────────────────┼──────────────────┐                   │
│       ▼                  ▼                  ▼                   │
│  qe-tdd-            qe-security-      qe-coverage-              │
│  specialist         scanner           specialist                 │
│       │                  │                  │                   │
│       ▼                  ▼                  ▼                   │
│  ┌─────────┐      ┌─────────┐       ┌─────────┐                │
│  │ Tests   │      │Security │       │Coverage │                │
│  │Generated│      │ Report  │       │  Gaps   │                │
│  └────┬────┘      └────┬────┘       └────┬────┘                │
│       │                │                  │                     │
│       └────────────────┴──────────────────┘                     │
│                        │                                        │
│                        ▼                                        │
│  qe-parallel-executor ──▶ qe-flaky-hunter                       │
│                        │                                        │
│                        ▼                                        │
│  ┌───────────────────────────────────┐                         │
│  │     DEVELOPMENT QUALITY REPORT    │                         │
│  │  - Test Results                   │                         │
│  │  - Coverage Metrics               │                         │
│  │  - Security Findings              │                         │
│  │  - Quality Score                  │                         │
│  └───────────────────────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**MCP Integration:**
```javascript
// Development Phase - Test Generation
mcp__agentic_qe__test_generate_enhanced({
  sourceCode: "src/services/UserService.ts",
  language: "typescript",
  testType: "unit"
})

// Coverage Analysis
mcp__agentic_qe__coverage_analyze_sublinear({
  target: "src/",
  detectGaps: true
})

// Security Scan
mcp__agentic_qe__security_scan_comprehensive({
  target: "src/",
  sast: true
})
```

---

### 2.2 CI/CD Pipeline Phase

**QCSD Activities:**
- Merge automation PR
- Merge to master
- Merge to pre-prod
- Deploy to production
- Automated quality gates
- Selective run of automated checks

**Capability Requirements:**

| Capability | Description | Priority |
|------------|-------------|----------|
| Quality Gate Evaluation | Pass/fail decisions | P0 |
| Deployment Readiness | Production readiness assessment | P0 |
| Regression Testing | Selective regression runs | P0 |
| Contract Validation | API compatibility checks | P1 |
| Visual Regression | UI regression detection | P1 |
| Performance Baseline | Performance regression detection | P1 |
| Chaos Testing | Pre-deployment resilience tests | P2 |

**Recommended Agentic QE Agents:**

| Agent | Domain | Role in CI/CD |
|-------|--------|---------------|
| `qe-quality-gate` | Quality Assessment | Quality gate decisions |
| `qe-deployment-advisor` | Quality Assessment | Deployment readiness |
| `qe-regression-analyzer` | Defect Intelligence | Regression risk analysis |
| `qe-contract-validator` | Contract Testing | API compatibility checks |
| `qe-graphql-tester` | Contract Testing | GraphQL API testing |
| `qe-visual-tester` | Visual Accessibility | Visual regression testing |
| `qe-load-tester` | Chaos Resilience | Performance baseline validation |
| `qe-chaos-engineer` | Chaos Resilience | Pre-deployment chaos tests |
| `qe-parallel-executor` | Test Execution | Optimize test execution |

**Code Review Sub-agents (PR Pipeline):**

| Sub-agent | Parent Agent | Role in CI/CD |
|-----------|--------------|---------------|
| `qe-code-reviewer` | `qe-queen-coordinator` | General code quality review |
| `qe-security-reviewer` | `qe-security-scanner` | Security vulnerability review |
| `qe-performance-reviewer` | `qe-performance-tester` | Performance impact review |
| `qe-integration-reviewer` | `qe-integration-tester` | Integration compatibility review |

**Quality Gate Integration:**

```
┌─────────────────────────────────────────────────────────────────┐
│                       CI/CD QUALITY GATES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PR Created                                                      │
│      │                                                           │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ GATE 1: Code Quality                                        ││
│  │   qe-code-complexity + qe-security-scanner                  ││
│  │   Criteria: Complexity < 20, No critical vulns              ││
│  └─────────────────────────────────────────────────────────────┘│
│      │ PASS                                                      │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ GATE 2: Test Quality                                        ││
│  │   qe-parallel-executor + qe-coverage-specialist             ││
│  │   Criteria: Tests pass, Coverage >= 80%                     ││
│  └─────────────────────────────────────────────────────────────┘│
│      │ PASS                                                      │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ GATE 3: Contract & Visual                                   ││
│  │   qe-contract-validator + qe-visual-tester                  ││
│  │   Criteria: No contract breaks, No visual regressions       ││
│  └─────────────────────────────────────────────────────────────┘│
│      │ PASS                                                      │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ GATE 4: Deployment Readiness                                ││
│  │   qe-quality-gate + qe-deployment-advisor                   ││
│  │   Criteria: Overall quality score >= 0.85                   ││
│  └─────────────────────────────────────────────────────────────┘│
│      │ PASS                                                      │
│      ▼                                                           │
│  Deploy to Production                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**MCP Integration:**
```javascript
// Quality Gate Assessment
mcp__agentic_qe__quality_assess({
  runGate: true,
  thresholds: {
    coverage: 80,
    qualityScore: 0.85,
    securityVulns: 0
  }
})

// Deployment Readiness Check
mcp__agentic_qe__task_orchestrate({
  task: "deployment-readiness-assessment",
  strategy: "sequential",
  priority: "critical"
})
```

---

## Phase 3: EVALUATE

### 3.1 Production Telemetry Phase

**QCSD Activities:**
- Enterprise DevOps Metrics (DORA)
- Site Reliability Engineering (SRE)
- Testing in Production
- Assessment for Quality: What was done? What must change? What is the risk?

**Capability Requirements:**

| Capability | Description | Priority |
|------------|-------------|----------|
| Production Monitoring | Real-time quality monitoring | P0 |
| DORA Metrics | Deployment frequency, lead time, MTTR, change failure | P0 |
| Defect Analysis | Production defect patterns | P0 |
| Root Cause Analysis | Systematic RCA | P1 |
| Production Testing | Synthetic monitoring, canary testing | P1 |
| Performance Analysis | Production performance metrics | P1 |
| Learning Feedback | Feed learnings back to earlier phases | P2 |

**Recommended Agentic QE Agents:**

| Agent | Domain | Role in Production |
|-------|--------|-------------------|
| `qe-defect-predictor` | Defect Intelligence | Pattern-based defect prediction |
| `qe-root-cause-analyzer` | Defect Intelligence | Systematic root cause analysis |
| `qe-pattern-learner` | Defect Intelligence | Learn from production patterns |
| `qe-metrics-optimizer` | Learning Optimization | Optimize quality metrics |
| `qe-performance-tester` | Chaos Resilience | Production performance analysis |
| `qe-load-tester` | Chaos Resilience | Stress testing and capacity |
| `qe-chaos-engineer` | Chaos Resilience | Production resilience validation |
| `qe-learning-coordinator` | Learning Optimization | Cross-domain learning coordination |

**Production Feedback Loop:**

```
┌─────────────────────────────────────────────────────────────────┐
│                  PRODUCTION TELEMETRY SWARM                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Production Metrics ──▶ qe-defect-predictor                     │
│                              │                                   │
│       ┌──────────────────────┼──────────────────────┐           │
│       ▼                      ▼                      ▼           │
│  qe-root-cause-       qe-performance-        qe-chaos-          │
│  analyzer             tester                 engineer            │
│       │                      │                      │           │
│       ▼                      ▼                      ▼           │
│  qe-pattern-learner   ┌───────────────┐    ┌───────────────┐    │
│       │               │ DORA Metrics  │    │ SRE Metrics   │    │
│       │               └───────┬───────┘    └───────┬───────┘    │
│       ▼                      │                    │             │
│  qe-learning-coordinator ◀───┴────────────────────┘             │
│       │                                                         │
│       ▼                                                         │
│  FEEDBACK TO EARLIER PHASES                                     │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │     PRODUCTION QUALITY ASSESSMENT                         │  │
│  │  - What was done? (Release changes)                       │  │
│  │  - What must change? (Improvements needed)                │  │
│  │  - What is the risk? (Current risk posture)               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**MCP Integration:**
```javascript
// Defect Prediction Based on Production Patterns
mcp__agentic_qe__defect_predict({
  target: "src/",
  includeProductionData: true
})

// Store Production Learnings
mcp__agentic_qe__memory_store({
  key: `production-pattern-${incidentId}`,
  value: {
    rootCause: "...",
    resolution: "...",
    preventionStrategy: "..."
  },
  namespace: "production-learnings"
})

// Share Learnings Across Fleet
mcp__agentic_qe__memory_share({
  sourceAgentId: "qe-defect-predictor",
  targetAgentIds: ["qe-learning-coordinator"],
  knowledgeDomain: "production-patterns"
})
```

---

## Cross-Phase Coordination

### Feedback Loops

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CROSS-PHASE FEEDBACK LOOPS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LOOP 1: Production → Ideation (Strategic)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ qe-defect-predictor → qe-learning-coordinator →                     │    │
│  │ qe-risk-assessor (inform future risk assessments)                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  LOOP 2: Production → Grooming (Tactical)                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ qe-defect-predictor → qe-pattern-learner →                          │    │
│  │ qe-product-factors-assessor (improve SFDIPOT assessments)           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  LOOP 3: CI/CD → Development (Operational)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ qe-quality-gate → qe-flaky-hunter →                                 │    │
│  │ qe-test-architect (improve test generation strategies)              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  LOOP 4: Development → Grooming (Quality Criteria)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ qe-coverage-specialist → qe-gap-detector →                          │    │
│  │ qe-requirements-validator (refine acceptance criteria)              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Continuous Activities Support

**Testability Improvement Sessions:**
- `testability-scoring` skill - Ongoing testability assessment
- `qe-dependency-mapper` agent - Identify coupling issues
- `qe-code-intelligence` agent - Knowledge graph for understanding

**Bi-Weekly Tester Exchange:**
- `qe-transfer-specialist` agent - Enable pattern transfer
- `qe-learning-coordinator` agent - Coordinate cross-team learning

**Periodic Assessment of Automation Suites:**
- `qe-mutation-tester` agent - Test quality assessment
- `qe-flaky-hunter` agent - Identify flaky tests

**Learning from Production Error Logs:**
- `qe-root-cause-analyzer` agent - Systematic analysis
- `qe-pattern-learner` agent - Pattern extraction

---

## Agent-to-Phase Matrix

| Agent | Ideation | Grooming | Development | CI/CD | Production |
|-------|:--------:|:--------:|:-----------:|:-----:|:----------:|
| **`qe-quality-criteria-recommender`** | **P** | **P** | - | - | - |
| `qe-risk-assessor` | P | - | - | - | S |
| `qe-requirements-validator` | P | S | - | - | - |
| `qe-qx-partner` | P | S | - | - | S |
| `qe-product-factors-assessor` | S | P | - | - | - |
| `qe-bdd-generator` | - | P | S | - | - |
| `qe-gap-detector` | - | P | S | S | - |
| `qe-dependency-mapper` | - | P | S | - | - |
| `qe-impact-analyzer` | - | P | S | S | - |
| `qe-test-architect` | - | S | P | - | - |
| `qe-tdd-specialist` | - | - | P | - | - |
| `qe-parallel-executor` | - | - | P | P | - |
| `qe-coverage-specialist` | - | S | P | S | - |
| `qe-security-scanner` | S | - | P | P | - |
| `qe-code-complexity` | - | - | P | S | - |
| `qe-mutation-tester` | - | - | P | S | - |
| `qe-quality-gate` | - | - | S | P | - |
| `qe-deployment-advisor` | - | - | - | P | - |
| `qe-contract-validator` | - | - | S | P | - |
| `qe-graphql-tester` | - | - | S | P | - |
| `qe-visual-tester` | - | - | S | P | - |
| `qe-accessibility-auditor` | S | S | S | P | - |
| `qe-flaky-hunter` | - | - | S | P | - |
| `qe-regression-analyzer` | - | - | - | P | S |
| `qe-defect-predictor` | - | S | S | - | P |
| `qe-root-cause-analyzer` | - | - | - | - | P |
| `qe-pattern-learner` | - | - | S | S | P |
| `qe-chaos-engineer` | - | - | - | S | P |
| `qe-performance-tester` | - | - | - | S | P |
| `qe-load-tester` | - | - | - | S | P |
| `qe-metrics-optimizer` | - | - | - | S | P |
| `qe-learning-coordinator` | S | S | S | S | P |

**Legend:** P = Primary, S = Supporting, - = Not applicable

---

## Sub-agents-to-Phase Matrix

| Sub-agent | Parent Agent | Ideation | Grooming | Development | CI/CD | Production |
|-----------|--------------|:--------:|:--------:|:-----------:|:-----:|:----------:|
| `qe-tdd-red` | `qe-tdd-specialist` | - | - | **P** | - | - |
| `qe-tdd-green` | `qe-tdd-specialist` | - | - | **P** | - | - |
| `qe-tdd-refactor` | `qe-tdd-specialist` | - | - | **P** | - | - |
| `qe-code-reviewer` | `qe-queen-coordinator` | - | - | **P** | **P** | - |
| `qe-security-reviewer` | `qe-security-scanner` | - | - | S | **P** | S |
| `qe-performance-reviewer` | `qe-performance-tester` | - | - | S | **P** | **P** |
| `qe-integration-reviewer` | `qe-integration-tester` | - | - | S | **P** | - |

**Legend:** P = Primary, S = Supporting, - = Not applicable

**Sub-agent Spawn Pattern:**
- TDD sub-agents are spawned by `qe-tdd-specialist` during the Development phase
- Review sub-agents are spawned during PR reviews in Development and CI/CD phases

---

## Skills-to-Phase Matrix

| Skill | Ideation | Grooming | Development | CI/CD | Production |
|-------|:--------:|:--------:|:-----------:|:-----:|:----------:|
| `testability-scoring` | **P** | S | - | - | - |
| `risk-based-testing` | **P** | S | - | - | - |
| `context-driven-testing` | **P** | S | S | - | - |
| `holistic-testing-pact` | **P** | S | S | S | S |
| `shift-left-testing` | S | **P** | S | - | - |
| `exploratory-testing-advanced` | S | **P** | S | - | - |
| `tdd-london-chicago` | - | S | **P** | - | - |
| `api-testing-patterns` | - | S | **P** | S | - |
| `mutation-testing` | - | - | **P** | S | - |
| `security-testing` | - | - | **P** | **P** | S |
| `cicd-pipeline-qe-orchestrator` | - | - | S | **P** | - |
| `contract-testing` | - | S | S | **P** | - |
| `performance-testing` | - | - | - | **P** | **P** |
| `accessibility-testing` | - | - | S | **P** | - |
| `shift-right-testing` | - | - | - | S | **P** |
| `chaos-engineering-resilience` | - | - | - | S | **P** |
| `quality-metrics` | - | - | - | S | **P** |

**Legend:** P = Primary, S = Supporting, - = Not applicable

---

## Integration Points

### 1. Requirements to Test Traceability

```
Requirements (Ideation/Grooming)
        │
        ▼ qe-requirements-validator
Test Cases (Development)
        │
        ▼ qe-parallel-executor
Test Results (CI/CD)
        │
        ▼ qe-defect-predictor
Production Outcomes (Evaluate)
        │
        ▼ qe-learning-coordinator
Learnings → Back to Requirements
```

### 2. Quality Metrics Flow

```
Ideation: Risk Score, Testability Score
    ↓
Grooming: SFDIPOT Score, AC Completeness
    ↓
Development: Coverage %, Test Quality, Security Score
    ↓
CI/CD: Quality Gate Score, Deployment Readiness
    ↓
Production: DORA Metrics, SRE Metrics, Defect Density
    ↓
Aggregate: Overall Quality Trend → Informs Next Cycle
```

### 3. Knowledge Transfer Protocol

```javascript
// End of Sprint - Store Learnings
mcp__agentic_qe__memory_store({
  key: `sprint-${sprintId}-learnings`,
  value: {
    successPatterns: [...],
    failurePatterns: [...],
    recommendations: [...]
  },
  namespace: "sprint-learnings"
})

// Start of Sprint - Retrieve Learnings
mcp__agentic_qe__memory_query({
  pattern: "sprint-*-learnings",
  namespace: "sprint-learnings"
})
```

---

## Implementation Recommendations

### Phase 1: Foundation (Weeks 1-2)
1. Configure agent fleet for Enable & Engage phases
2. Implement SFDIPOT pipeline for grooming sessions
3. Set up basic feedback loops

### Phase 2: Execution Integration (Weeks 3-4)
1. Integrate test generation agents with development workflow
2. Configure quality gates in CI/CD pipeline
3. Enable parallel test execution

### Phase 3: Evaluate & Learn (Weeks 5-6)
1. Deploy production telemetry agents
2. Implement cross-phase feedback loops
3. Enable continuous learning system

### Phase 4: Optimization (Ongoing)
1. Tune agent routing based on performance
2. Optimize swarm configurations per phase
3. Evolve quality metrics based on outcomes

---

## Appendix A: Full Agent Inventory (44 Verified Agents)

### Core Testing (12 agents)

| Agent | Purpose |
|-------|---------|
| `qe-test-architect` | Strategic test planning |
| `qe-tdd-specialist` | TDD Red-Green-Refactor |
| `qe-integration-tester` | Integration test creation |
| `qe-property-tester` | Property-based testing |
| `qe-parallel-executor` | Distributed test execution |
| `qe-flaky-hunter` | Flaky test detection |
| `qe-retry-handler` | Test retry logic |
| `qe-coverage-specialist` | O(log n) coverage analysis |
| `qe-gap-detector` | Coverage gap detection |
| `qe-mutation-tester` | Mutation testing |
| `qe-quality-gate` | Quality gate decisions |
| `qe-deployment-advisor` | Deployment readiness |

### Intelligence (12 agents)

| Agent | Purpose |
|-------|---------|
| `qe-defect-predictor` | ML defect prediction |
| `qe-pattern-learner` | Pattern recognition |
| `qe-root-cause-analyzer` | Root cause analysis |
| `qe-regression-analyzer` | Regression risk analysis |
| `qe-code-intelligence` | Semantic code analysis |
| `qe-kg-builder` | Knowledge graph construction |
| `qe-dependency-mapper` | Dependency analysis |
| `qe-impact-analyzer` | Change impact analysis |
| `qe-requirements-validator` | Requirements validation |
| `qe-bdd-generator` | BDD scenario generation |
| `qe-code-complexity` | Complexity analysis |
| `qe-test-idea-rewriter` | Test idea improvement |

### Specialized (12 agents)

| Agent | Purpose |
|-------|---------|
| `qe-contract-validator` | API contract testing |
| `qe-graphql-tester` | GraphQL testing |
| `qe-visual-tester` | Visual regression |
| `qe-accessibility-auditor` | WCAG compliance |
| `qe-responsive-tester` | Responsive design testing |
| `qe-security-scanner` | SAST/DAST scanning |
| `qe-security-auditor` | Security audit |
| `qe-chaos-engineer` | Chaos engineering |
| `qe-load-tester` | Load testing |
| `qe-performance-tester` | Performance testing |
| `qe-product-factors-assessor` | SFDIPOT analysis |
| `qe-quality-criteria-recommender` | HTSM v6.3 analysis |

### Coordination (8 agents)

| Agent | Purpose |
|-------|---------|
| `qe-learning-coordinator` | Cross-domain learning |
| `qe-transfer-specialist` | Knowledge transfer |
| `qe-metrics-optimizer` | Metrics optimization |
| `qe-fleet-commander` | Fleet orchestration |
| `qe-queen-coordinator` | Hierarchical coordination |
| `qe-qx-partner` | QE + UX pairing |
| `qe-risk-assessor` | Risk assessment |
| `qe-integration-architect` | Integration architecture |

---

## Appendix B: MCP Tool Reference for QCSD Phases

| QCSD Phase | Primary MCP Tools |
|------------|-------------------|
| Ideation | `fleet_init`, `task_orchestrate`, `memory_query` |
| Grooming | `task_orchestrate`, `memory_query`, `code_index` |
| Development | `test_generate_enhanced`, `test_execute_parallel`, `coverage_analyze_sublinear`, `security_scan_comprehensive` |
| CI/CD | `quality_assess`, `test_execute_parallel` |
| Production | `defect_predict`, `memory_store`, `memory_share` |

---

## Appendix C: Full Sub-agent Inventory (7 Verified Sub-agents)

Sub-agents are specialized components spawned by parent agents for focused tasks. They inherit context from their parent and return results when complete.

### TDD Sub-agents (3)

| Sub-agent | Parent Agent | Purpose | When Spawned |
|-----------|--------------|---------|--------------|
| `qe-tdd-red` | `qe-tdd-specialist` | Write failing tests (RED phase) | Start of TDD cycle |
| `qe-tdd-green` | `qe-tdd-specialist` | Implement minimal code to pass (GREEN phase) | After RED test written |
| `qe-tdd-refactor` | `qe-tdd-specialist` | Improve code quality (REFACTOR phase) | After GREEN tests pass |

### Code Review Sub-agents (4)

| Sub-agent | Parent Agent | Purpose | When Spawned |
|-----------|--------------|---------|--------------|
| `qe-code-reviewer` | `qe-queen-coordinator` | General code quality review | PR creation |
| `qe-security-reviewer` | `qe-security-scanner` | Security vulnerability review | Security gate |
| `qe-performance-reviewer` | `qe-performance-tester` | Performance impact review | Performance gate |
| `qe-integration-reviewer` | `qe-integration-tester` | Integration compatibility review | Integration gate |

### Sub-agent vs Agent Decision Guide

| Consideration | Use Agent | Use Sub-agent |
|---------------|-----------|---------------|
| Scope | Full lifecycle | Focused task |
| Autonomy | High - makes decisions | Low - executes directive |
| Coordination | Peer-to-peer | Parent-child |
| Context | Own context | Inherits from parent |
| Examples | `qe-tdd-specialist` | `qe-tdd-red` |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial framework creation |
| 1.1 | 2026-01-23 | Fixed agent names (removed v3-qe-* prefix), verified against codebase, distinguished agents from skills, updated counts to 44 agents and 97 skills |
| 1.2 | 2026-01-23 | Added 7 sub-agents with proper categorization, added Sub-agents-to-Phase Matrix, added Appendix C for sub-agent inventory, distinguished agents vs sub-agents vs skills terminology |
| 1.3 | 2026-01-23 | Fixed skill count (97→95), corrected MCP tool naming convention (hyphens→underscores) |
