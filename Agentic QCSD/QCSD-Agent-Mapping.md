# QCSD to Agentic QE - Agent & Skill Mapping

## Overview

Mapping of **44 QE agents**, **7 sub-agents**, **95 skills**, and **12 DDD domains** to the QCSD (Quality Conscious Software Delivery) flow from Ideation to Production Telemetry.

### Inventory Summary

| Category | Count | Location |
|----------|-------|----------|
| **Agents** | 44 | `v3/assets/agents/v3/*.md` |
| **Sub-agents** | 7 | `v3/assets/agents/v3/subagents/*.md` |
| **Skills** | 95 | `.claude/skills/*/` |
| **DDD Domains** | 12 | Documented in CLAUDE.md |

---

## QCSD Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ENABLE AND ENGAGE                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  IDEATION          →        GROOMING SESSIONS                                   │
│  • Risk Storming            • Story analysis (SFDIPOT)                          │
│  • Testing the design       • Acceptance criteria                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  EXECUTE                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  DEVELOPMENT        →        CI/CD                                              │
│  • Programming              • Quality gates                                      │
│  • Developer testing        • Automated checks                                   │
│  • Test automation          • Deploy to production                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 EVALUATE                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  PRODUCTION TELEMETRY                                                           │
│  • Enterprise DevOps Metrics    • Site Reliability Engineering                  │
│  • Testing in Production        • Continuous Feedback Loops                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: IDEATION

**QCSD Activities:** Risk Storming, Testing the Design, QX Sessions, Quality Criteria Sessions

### Primary Agents

| Agent | Purpose | Key Capability |
|-------|---------|----------------|
| **`qe-quality-criteria-recommender`** | **HTSM v6.3 Quality Criteria analysis** | **10-category quality framework, evidence-based recommendations** |
| `qe-requirements-validator` | Validate requirements for testability | INVEST criteria, testability assessment |
| `qe-risk-assessor` | Risk assessment for features | Risk-weighted prioritization |
| `qe-qx-partner` | QE + UX pairing | User journey quality analysis |

### Primary Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `testability-scoring` | Score design testability | 10 testability principles |
| `risk-based-testing` | Focus on highest-risk areas | Risk storming sessions |
| `context-driven-testing` | Adapt approach to context | Design reviews |
| `holistic-testing-pact` | PACT principles for strategy | Quality criteria sessions |
| `six-thinking-hats` | Structured analysis | Design evaluation |
| `qe-requirements-validation` | Requirements traceability | Testability assessment |

### Key Agent: qe-quality-criteria-recommender

**Purpose:** Implements QCSD Quality Criteria sessions using James Bach's HTSM v6.3 framework.

**HTSM Categories (10 Total):**

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

### MCP Tools

```javascript
// Risk assessment
mcp__agentic_qe__defect_predict({ target: "feature-spec", predictRisk: true })

// Requirements validation
mcp__agentic_qe__task_orchestrate({
  task: "requirements-validation",
  strategy: "adaptive"
})
```

### Supporting Activities

| QCSD Activity | Agent/Skill Support | Output |
|---------------|---------------------|--------|
| **Quality Criteria Session** | **`qe-quality-criteria-recommender`** | **HTSM 10-category analysis** |
| QX Session (QE + UX) | `qe-qx-partner` | Quality criteria for UX |
| Risk Storming | `qe-risk-assessor` | Risk heat map |
| Testing the Design | `testability-scoring` skill | Testability score |

---

## Phase 2: GROOMING SESSIONS

**QCSD Activities:** Story Analysis with SFDIPOT, Finetuning Acceptance Criteria, Product Coverage Session, Dev + QE Pairing

### Primary Agents

| Agent | Purpose | Key Capability |
|-------|---------|----------------|
| `qe-product-factors-assessor` | SFDIPOT analysis | James Bach's HTSM framework |
| `qe-bdd-generator` | BDD scenario generation | Gherkin syntax, example mapping |
| `qe-requirements-validator` | Requirements traceability | Story-to-test mapping |
| `qe-dependency-mapper` | Impact analysis | Dependency graphs |
| `qe-impact-analyzer` | Change impact analysis | Blast radius assessment |

### Primary Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `shift-left-testing` | Move testing earlier | Sprint planning |
| `exploratory-testing-advanced` | Test tours, heuristics | Grooming exploration |
| `contract-testing` | API contract planning | Integration planning |
| `qe-requirements-validation` | BDD scenarios | Acceptance criteria |

### SFDIPOT Framework (via `qe-product-factors-assessor`)

| Factor | Question | Agent Support |
|--------|----------|---------------|
| **S**tructure | What is it made of? | `qe-dependency-mapper` |
| **F**unction | What does it do? | `qe-requirements-validator` |
| **D**ata | What data does it process? | `qe-property-tester` |
| **I**nterfaces | How does it connect? | `qe-contract-validator` |
| **P**latform | What does it depend on? | `qe-dependency-mapper` |
| **O**perations | How is it used? | `qe-bdd-generator` |
| **T**ime | How does it change over time? | `qe-performance-tester` |

### MCP Tools

```javascript
// SFDIPOT analysis via task orchestration
mcp__agentic_qe__task_orchestrate({
  task: "sfdipot-assessment",
  strategy: "sequential"
})

// BDD scenario generation
mcp__agentic_qe__task_orchestrate({
  task: "bdd-scenario-generation",
  strategy: "adaptive"
})
```

### Supporting Activities

| QCSD Activity | Agent Support | Output |
|---------------|---------------|--------|
| SFDIPOT Analysis | `qe-product-factors-assessor` | Test dimension matrix |
| Product Coverage Session | `qe-coverage-specialist` | Coverage targets |
| Dev + QE Pairing | `qe-tdd-specialist` | TDD approach |

---

## Phase 3: DEVELOPMENT

**QCSD Activities:** Programming, Developer Testing for AC, Test Design/Execution/Automation, Code Quality Checks

### Primary Agents

| Agent | Purpose | Key Capability |
|-------|---------|----------------|
| `qe-test-architect` | Strategic test planning | AI-powered test generation |
| `qe-tdd-specialist` | TDD workflow (Red-Green-Refactor) | Full TDD cycle |
| `qe-coverage-specialist` | O(log n) coverage analysis | Sublinear gap detection |
| `qe-security-scanner` | SAST scanning | OWASP Top 10 |
| `qe-code-complexity` | Code quality analysis | Cyclomatic complexity |
| `qe-pattern-learner` | Pattern recognition | Test pattern learning |
| `qe-mutation-tester` | Test quality validation | Mutation score |

### Primary Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `tdd-london-chicago` | TDD methodologies | Test-first development |
| `api-testing-patterns` | API test patterns | Endpoint testing |
| `mutation-testing` | Test quality validation | Test effectiveness |
| `security-testing` | Security vulnerability testing | SAST during dev |
| `code-review-quality` | Context-driven reviews | PR reviews |
| `refactoring-patterns` | Safe code improvement | TDD refactor phase |
| `database-testing` | Data persistence testing | Data layer testing |

### Sub-agents (TDD & Code Review)

| Sub-agent | Purpose | Parent Agent |
|-----------|---------|--------------|
| `qe-tdd-red` | Write failing tests | `qe-tdd-specialist` |
| `qe-tdd-green` | Implement minimal code to pass | `qe-tdd-specialist` |
| `qe-tdd-refactor` | Improve code quality | `qe-tdd-specialist` |
| `qe-code-reviewer` | General code review | `qe-queen-coordinator` |
| `qe-security-reviewer` | Security-focused review | `qe-security-scanner` |
| `qe-performance-reviewer` | Performance-focused review | `qe-performance-tester` |
| `qe-integration-reviewer` | Integration-focused review | `qe-integration-tester` |

### TDD Workflow (via `qe-tdd-specialist` + sub-agents)

```
┌──────────────────────────────────────────────────────────────────┐
│                     qe-tdd-specialist                             │
├──────────────────┬──────────────────┬────────────────────────────┤
│   qe-tdd-red     │   qe-tdd-green   │    qe-tdd-refactor         │
│   (Sub-agent)    │   (Sub-agent)    │    (Sub-agent)             │
├──────────────────┼──────────────────┼────────────────────────────┤
│  Write failing   │   Make pass      │    Improve code            │
│     test         │   (minimal)      │      quality               │
└──────────────────┴──────────────────┴────────────────────────────┘
```

### MCP Tools

```javascript
// AI-powered test generation
mcp__agentic_qe__test_generate_enhanced({
  sourceCode: "src/feature.ts",
  testType: "unit",
  coverage: "mutation"
})

// Coverage analysis (sublinear)
mcp__agentic_qe__coverage_analyze_sublinear({
  target: "src/",
  detectGaps: true
})

// Security scanning
mcp__agentic_qe__security_scan_comprehensive({
  target: "src/",
  sast: true
})
```

### Supporting Activities

| QCSD Activity | Agent Support | Output |
|---------------|---------------|--------|
| Developer Testing for AC | `qe-tdd-specialist` | Unit tests per AC |
| Test Design | `qe-test-architect` | Test strategy |
| Test Automation | `qe-parallel-executor` | Automated suite |
| Code Quality (SonarQube) | `qe-code-complexity` | Quality metrics |
| Automation Coverage Dashboard | `qe-coverage-specialist` | Coverage reports |

---

## Phase 4: CI/CD

**QCSD Activities:** Quality Gates, Automated Checks, Merge Automation, Deploy to Production

### Primary Agents

| Agent | Purpose | Key Capability |
|-------|---------|----------------|
| `qe-quality-gate` | Quality gate decisions | Go/no-go recommendations |
| `qe-deployment-advisor` | Deployment readiness | Risk assessment |
| `qe-parallel-executor` | Parallel test execution | Distributed execution |
| `qe-contract-validator` | API contract testing | Pact verification |
| `qe-visual-tester` | Visual regression | Screenshot comparison |
| `qe-accessibility-auditor` | Accessibility testing | WCAG 2.2 compliance |
| `qe-security-scanner` | DAST scanning | Runtime security |
| `qe-flaky-hunter` | Flaky test detection | Test stability |
| `qe-regression-analyzer` | Regression risk analysis | Change impact |

### Primary Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `cicd-pipeline-qe-orchestrator` | Quality across pipeline | CI/CD integration |
| `contract-testing` | Consumer-driven contracts | API verification |
| `performance-testing` | Load/stress testing | Pre-deployment |
| `accessibility-testing` | WCAG compliance | Automated a11y |
| `compliance-testing` | Regulatory compliance | SOC2, GDPR |
| `qe-quality-assessment` | Quality gate decisions | Deployment readiness |

### Sub-agents (Code Review Pipeline)

| Sub-agent | Purpose | When Active |
|-----------|---------|-------------|
| `qe-code-reviewer` | General code quality review | PR reviews |
| `qe-security-reviewer` | Security vulnerability review | Security gate |
| `qe-performance-reviewer` | Performance impact review | Performance gate |
| `qe-integration-reviewer` | Integration compatibility review | Integration gate |

### Quality Gate Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                        CI/CD PIPELINE                           │
├─────────────┬─────────────┬─────────────┬─────────────┬────────┤
│   GATE 1    │   GATE 2    │   GATE 3    │   GATE 4    │ DEPLOY │
│  Unit Tests │ Integration │  Security   │  Quality    │   ✓    │
│  Coverage   │  Contract   │  A11y       │  Approval   │        │
├─────────────┼─────────────┼─────────────┼─────────────┼────────┤
│ qe-parallel │ qe-contract │ qe-security │ qe-quality  │ qe-    │
│ -executor   │ -validator  │ -scanner    │ -gate       │ deploy │
│ qe-coverage │ qe-graphql  │ qe-access-  │ qe-deploy-  │ ment-  │
│ -specialist │ -tester     │ ibility-aud │ advisor     │ advisor│
├─────────────┼─────────────┼─────────────┼─────────────┼────────┤
│ SUB-AGENTS: │ qe-integra- │ qe-security │ qe-code-    │        │
│             │ tion-review │ -reviewer   │ reviewer    │        │
└─────────────┴─────────────┴─────────────┴─────────────┴────────┘
```

### MCP Tools

```javascript
// Quality gate evaluation
mcp__agentic_qe__quality_assess({
  pipeline: "main",
  enforceGates: true
})

// Parallel test execution
mcp__agentic_qe__test_execute_parallel({
  testFiles: ["tests/**/*.test.ts"],
  parallel: true,
  shards: 4
})
```

### Supporting Activities

| QCSD Activity | Agent Support | Output |
|---------------|---------------|--------|
| Automated Quality Gates | `qe-quality-gate` | Pass/fail decision |
| Selective Automated Checks | `qe-regression-analyzer` | Risk-based test selection |
| Merge to Pre-prod | `qe-deployment-advisor` | Deployment risk score |
| Deploy to Production | `qe-deployment-advisor` | Go/no-go recommendation |

---

## Phase 5: PRODUCTION TELEMETRY

**QCSD Activities:** Enterprise DevOps Metrics, Site Reliability Engineering, Testing in Production, Learning from Error Logs

### Primary Agents

| Agent | Purpose | Key Capability |
|-------|---------|----------------|
| `qe-defect-predictor` | ML defect prediction | Pattern-based prediction |
| `qe-root-cause-analyzer` | Root cause analysis | Incident investigation |
| `qe-chaos-engineer` | Chaos engineering | Fault injection |
| `qe-performance-tester` | Load testing | SLA validation |
| `qe-load-tester` | Stress testing | Capacity planning |
| `qe-learning-coordinator` | Cross-domain learning | Pattern consolidation |
| `qe-pattern-learner` | Pattern recognition | Incident patterns |
| `qe-metrics-optimizer` | Metrics optimization | DORA improvements |

### Primary Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `shift-right-testing` | Testing in production | Production monitoring |
| `chaos-engineering-resilience` | Resilience validation | Fault injection |
| `qe-defect-intelligence` | Defect pattern analysis | Incident analysis |
| `qe-learning-optimization` | Continuous improvement | Pattern learning |
| `quality-metrics` | DORA metrics | DevOps performance |

### Feedback Loops

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION TELEMETRY                         │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ qe-defect-      │    │ qe-learning-    │                    │
│  │ predictor       │───→│ coordinator     │                    │
│  │ (Collect)       │    │ (Synthesize)    │                    │
│  └─────────────────┘    └────────┬────────┘                    │
│                                  │                              │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
    │  IDEATION    │       │  GROOMING    │       │ DEVELOPMENT  │
    │              │       │              │       │              │
    │ Risk updates │       │ SFDIPOT      │       │ Test pattern │
    │ from prod    │       │ improvements │       │ improvements │
    └──────────────┘       └──────────────┘       └──────────────┘
```

### MCP Tools

```javascript
// Defect prediction from production patterns
mcp__agentic_qe__defect_predict({
  target: "production-logs",
  analyzePatterns: true
})

// Learning coordination
mcp__agentic_qe__memory_share({
  sourceAgentId: "qe-defect-predictor",
  targetAgentIds: ["qe-learning-coordinator"],
  knowledgeDomain: "production-patterns"
})
```

### Supporting Activities

| QCSD Activity | Agent Support | Output |
|---------------|---------------|--------|
| Enterprise DevOps Metrics | `qe-metrics-optimizer` | DORA metrics dashboard |
| Site Reliability Engineering | `qe-chaos-engineer`, `qe-load-tester` | SLO/SLA validation |
| Testing in Production | `qe-chaos-engineer` | Controlled experiments |
| Learning from Error Logs | `qe-root-cause-analyzer`, `qe-pattern-learner` | Incident insights |

---

## Cross-Phase: Supporting Activities

**QCSD Activities:** Testability Improvement, Bi-weekly Tester Exchange, Automation Assessment, Learning from Production

### Continuous Agents

| Agent | Purpose | When Active |
|-------|---------|-------------|
| `qe-learning-coordinator` | Cross-phase learning | Always |
| `qe-fleet-commander` | Agent orchestration | Always |
| `qe-queen-coordinator` | Hierarchical coordination | Complex tasks |
| `qe-transfer-specialist` | Knowledge transfer | Cross-domain learning |

### Continuous Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `agentic-quality-engineering` | Core PACT principles | All phases |
| `reasoningbank-intelligence` | Adaptive learning | Pattern synthesis |
| `qe-iterative-loop` | Continuous improvement | Test refinement |

---

## Complete Agent-to-Phase Matrix

| Agent | Ideation | Grooming | Development | CI/CD | Production |
|-------|:--------:|:--------:|:-----------:|:-----:|:----------:|
| **qe-quality-criteria-recommender** | **●** | **●** | - | - | - |
| qe-requirements-validator | **●** | **●** | ○ | - | - |
| qe-risk-assessor | **●** | ○ | - | - | ○ |
| qe-qx-partner | **●** | ○ | - | - | - |
| qe-product-factors-assessor | - | **●** | - | - | - |
| qe-bdd-generator | - | **●** | ○ | - | - |
| qe-dependency-mapper | - | **●** | ○ | - | - |
| qe-impact-analyzer | - | **●** | ○ | ○ | - |
| qe-test-architect | - | ○ | **●** | ○ | - |
| qe-tdd-specialist | - | ○ | **●** | - | - |
| qe-coverage-specialist | - | - | **●** | **●** | ○ |
| qe-security-scanner | - | - | ○ | **●** | **●** |
| qe-code-complexity | - | - | **●** | ○ | - |
| qe-pattern-learner | - | - | **●** | ○ | ○ |
| qe-mutation-tester | - | - | **●** | ○ | - |
| qe-quality-gate | - | - | ○ | **●** | - |
| qe-deployment-advisor | - | - | - | **●** | ○ |
| qe-parallel-executor | - | - | ○ | **●** | - |
| qe-contract-validator | - | ○ | ○ | **●** | - |
| qe-visual-tester | - | - | ○ | **●** | - |
| qe-accessibility-auditor | - | - | ○ | **●** | - |
| qe-flaky-hunter | - | - | ○ | **●** | - |
| qe-regression-analyzer | - | - | - | **●** | ○ |
| qe-defect-predictor | ○ | ○ | ○ | - | **●** |
| qe-root-cause-analyzer | - | - | - | - | **●** |
| qe-chaos-engineer | - | - | - | ○ | **●** |
| qe-performance-tester | - | - | - | ○ | **●** |
| qe-load-tester | - | - | - | ○ | **●** |
| qe-learning-coordinator | ○ | ○ | ○ | ○ | **●** |
| qe-metrics-optimizer | - | - | - | ○ | **●** |

**Legend:** ● = Primary, ○ = Supporting, - = Not applicable

---

## Sub-agents-to-Phase Matrix

| Sub-agent | Ideation | Grooming | Development | CI/CD | Production |
|-----------|:--------:|:--------:|:-----------:|:-----:|:----------:|
| `qe-tdd-red` | - | - | **●** | - | - |
| `qe-tdd-green` | - | - | **●** | - | - |
| `qe-tdd-refactor` | - | - | **●** | - | - |
| `qe-code-reviewer` | - | - | **●** | **●** | - |
| `qe-security-reviewer` | - | - | ○ | **●** | ○ |
| `qe-performance-reviewer` | - | - | ○ | **●** | **●** |
| `qe-integration-reviewer` | - | - | ○ | **●** | - |

**Legend:** ● = Primary, ○ = Supporting, - = Not applicable

**Parent Relationships:**
- TDD sub-agents (`qe-tdd-red`, `qe-tdd-green`, `qe-tdd-refactor`) → Parent: `qe-tdd-specialist`
- Review sub-agents (`qe-code-reviewer`, `qe-security-reviewer`, `qe-performance-reviewer`, `qe-integration-reviewer`) → Parents: Various specialized agents

---

## Skills-to-Phase Matrix

| Skill | Ideation | Grooming | Development | CI/CD | Production |
|-------|:--------:|:--------:|:-----------:|:-----:|:----------:|
| testability-scoring | **●** | ○ | - | - | - |
| risk-based-testing | **●** | ○ | - | - | - |
| context-driven-testing | **●** | ○ | ○ | - | - |
| holistic-testing-pact | **●** | ○ | ○ | ○ | ○ |
| shift-left-testing | ○ | **●** | ○ | - | - |
| exploratory-testing-advanced | ○ | **●** | ○ | - | - |
| tdd-london-chicago | - | ○ | **●** | - | - |
| api-testing-patterns | - | ○ | **●** | ○ | - |
| mutation-testing | - | - | **●** | ○ | - |
| security-testing | - | - | **●** | **●** | ○ |
| cicd-pipeline-qe-orchestrator | - | - | ○ | **●** | - |
| contract-testing | - | ○ | ○ | **●** | - |
| performance-testing | - | - | - | **●** | **●** |
| accessibility-testing | - | - | ○ | **●** | - |
| shift-right-testing | - | - | - | ○ | **●** |
| chaos-engineering-resilience | - | - | - | ○ | **●** |
| quality-metrics | - | - | - | ○ | **●** |

**Legend:** ● = Primary, ○ = Supporting, - = Not applicable

---

## 12 DDD Domains by QCSD Phase

| Domain | Ideation | Grooming | Development | CI/CD | Production |
|--------|:--------:|:--------:|:-----------:|:-----:|:----------:|
| Requirements Validation | **HIGH** | **HIGH** | Medium | Low | - |
| Test Generation | - | Medium | **HIGH** | Medium | - |
| Test Execution | - | - | **HIGH** | **HIGH** | - |
| Coverage Analysis | - | - | **HIGH** | **HIGH** | Low |
| Quality Assessment | - | Low | Medium | **HIGH** | Medium |
| Defect Intelligence | Low | Medium | **HIGH** | Medium | **HIGH** |
| Code Intelligence | - | Medium | **HIGH** | Medium | Low |
| Security Compliance | - | Low | Medium | **HIGH** | **HIGH** |
| Contract Testing | - | Medium | Medium | **HIGH** | Low |
| Visual Accessibility | Low | Medium | Medium | **HIGH** | Medium |
| Chaos Resilience | - | - | Low | Medium | **HIGH** |
| Learning Optimization | Low | Low | Medium | Medium | **HIGH** |

---

## Quick Reference: Agent by QCSD Activity

| QCSD Activity | Primary Agent | Skill |
|---------------|---------------|-------|
| **Quality Criteria Session** | **`qe-quality-criteria-recommender`** | **HTSM v6.3 framework** |
| Risk Storming | `qe-risk-assessor` | `risk-based-testing` |
| Testing the Design | - | `testability-scoring` |
| QX Session | `qe-qx-partner` | `holistic-testing-pact` |
| SFDIPOT Analysis | `qe-product-factors-assessor` | - |
| Acceptance Criteria | `qe-requirements-validator` | `shift-left-testing` |
| Product Coverage | `qe-coverage-specialist` | `qe-coverage-analysis` |
| Dev + QE Pairing | `qe-tdd-specialist` | `tdd-london-chicago` |
| Developer Testing | `qe-tdd-specialist` | `tdd-london-chicago` |
| Test Automation | `qe-test-architect` | `qe-test-generation` |
| Code Quality (SonarQube) | `qe-code-complexity` | `code-review-quality` |
| Automation Dashboard | `qe-coverage-specialist` | `qe-coverage-analysis` |
| Quality Gates | `qe-quality-gate` | `qe-quality-assessment` |
| Automated Checks | `qe-parallel-executor` | `qe-test-execution` |
| Deploy to Production | `qe-deployment-advisor` | `qe-quality-assessment` |
| DevOps Metrics | `qe-metrics-optimizer` | `quality-metrics` |
| SRE | `qe-chaos-engineer` | `chaos-engineering-resilience` |
| Testing in Production | `qe-chaos-engineer` | `shift-right-testing` |
| Learning from Errors | `qe-learning-coordinator` | `qe-learning-optimization` |

---

## Summary Statistics

- **Total QE Agents:** 44
- **Total Sub-agents:** 7
- **Total Skills:** 95
- **DDD Domains:** 12
- **QCSD Phases Covered:** 5 (Ideation → Production Telemetry)
- **Key QCSD Agent:** `qe-quality-criteria-recommender` - HTSM v6.3 framework for Quality Criteria sessions
- **Key QCSD Skill:** `testability-scoring` - Testability assessment for design reviews
- **Key TDD Sub-agents:** `qe-tdd-red`, `qe-tdd-green`, `qe-tdd-refactor` - TDD workflow phases
- **Feedback Loops:** 4 (Production→Ideation, Production→Grooming, CI/CD→Development, Development→Grooming)

---

## Full Agent Inventory (44 Verified Agents)

### Core Testing Agents (12)
- `qe-test-architect` - Strategic test planning
- `qe-tdd-specialist` - TDD Red-Green-Refactor workflow
- `qe-integration-tester` - Integration test creation
- `qe-property-tester` - Property-based testing
- `qe-parallel-executor` - Distributed test execution
- `qe-flaky-hunter` - Flaky test detection
- `qe-retry-handler` - Test retry logic
- `qe-coverage-specialist` - O(log n) coverage analysis
- `qe-gap-detector` - Coverage gap detection
- `qe-mutation-tester` - Mutation testing
- `qe-quality-gate` - Quality gate decisions
- `qe-deployment-advisor` - Deployment readiness

### Intelligence Agents (12)
- `qe-defect-predictor` - ML defect prediction
- `qe-pattern-learner` - Pattern recognition
- `qe-root-cause-analyzer` - Root cause analysis
- `qe-regression-analyzer` - Regression risk analysis
- `qe-code-intelligence` - Semantic code analysis
- `qe-kg-builder` - Knowledge graph construction
- `qe-dependency-mapper` - Dependency analysis
- `qe-impact-analyzer` - Change impact analysis
- `qe-requirements-validator` - Requirements validation
- `qe-bdd-generator` - BDD scenario generation
- `qe-code-complexity` - Complexity analysis
- `qe-test-idea-rewriter` - Test idea improvement

### Specialized Agents (12)
- `qe-contract-validator` - API contract testing
- `qe-graphql-tester` - GraphQL testing
- `qe-visual-tester` - Visual regression
- `qe-accessibility-auditor` - WCAG compliance
- `qe-responsive-tester` - Responsive design testing
- `qe-security-scanner` - SAST/DAST scanning
- `qe-security-auditor` - Security audit
- `qe-chaos-engineer` - Chaos engineering
- `qe-load-tester` - Load testing
- `qe-performance-tester` - Performance testing
- `qe-product-factors-assessor` - SFDIPOT analysis
- `qe-quality-criteria-recommender` - HTSM v6.3 analysis

### Coordination Agents (8)
- `qe-learning-coordinator` - Cross-domain learning
- `qe-transfer-specialist` - Knowledge transfer
- `qe-metrics-optimizer` - Metrics optimization
- `qe-fleet-commander` - Fleet orchestration
- `qe-queen-coordinator` - Hierarchical coordination
- `qe-qx-partner` - QE + UX pairing
- `qe-risk-assessor` - Risk assessment
- `qe-integration-architect` - Integration architecture

---

## Full Sub-agent Inventory (7 Verified Sub-agents)

### TDD Sub-agents (3)
- `qe-tdd-red` - Write failing tests (RED phase)
- `qe-tdd-green` - Implement minimal code to pass (GREEN phase)
- `qe-tdd-refactor` - Improve code quality (REFACTOR phase)

### Code Review Sub-agents (4)
- `qe-code-reviewer` - General code quality review
- `qe-security-reviewer` - Security vulnerability review
- `qe-performance-reviewer` - Performance impact review
- `qe-integration-reviewer` - Integration compatibility review

---

*Generated from Agentic QE v3 Agent Catalog - January 2026*
*Verified against:*
- *Agents: `/workspaces/agentic-qe/v3/assets/agents/v3/`*
- *Sub-agents: `/workspaces/agentic-qe/v3/assets/agents/v3/subagents/`*
- *Skills: `/workspaces/agentic-qe/.claude/skills/`*
