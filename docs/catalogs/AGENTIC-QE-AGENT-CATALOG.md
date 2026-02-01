# Agentic QE Agent and Skill Catalog

**Version**: 1.1
**Generated**: 2026-01-29
**Total Agents**: 63+
**Total Skills**: 91
**V3 Domains**: 12
**QCSD Ideation Agents**: 4 (NEW)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Domain 1: Test Generation](#domain-1-test-generation)
4. [Domain 2: Test Execution](#domain-2-test-execution)
5. [Domain 3: Coverage Analysis](#domain-3-coverage-analysis)
6. [Domain 4: Quality Assessment](#domain-4-quality-assessment)
7. [Domain 5: Defect Intelligence](#domain-5-defect-intelligence)
8. [Domain 6: Code Intelligence](#domain-6-code-intelligence)
9. [Domain 7: Requirements Validation](#domain-7-requirements-validation)
10. [Domain 8: Security Compliance](#domain-8-security-compliance)
11. [Domain 9: Contract Testing](#domain-9-contract-testing)
12. [Domain 10: Visual Accessibility](#domain-10-visual-accessibility)
13. [Domain 11: Chaos Resilience](#domain-11-chaos-resilience)
14. [Domain 12: Learning Optimization](#domain-12-learning-optimization)
15. [Cross-Domain Agents](#cross-domain-agents)
16. [QCSD Phase Mapping](#qcsd-phase-mapping)
17. [Skills Reference](#skills-reference)

---

## Overview

The Agentic QE system provides AI-powered quality engineering through a fleet of specialized agents organized into 12 DDD (Domain-Driven Design) domains. These agents follow **PACT principles**:

- **P**roactive: Analyze pre-merge, predict risk
- **A**utonomous: Execute tests, fix flaky tests
- **C**ollaborative: Multi-agent coordination
- **T**argeted: Risk-based prioritization

### Key Frameworks

| Framework | Purpose |
|-----------|---------|
| **SFDIPOT** | Test idea generation (Structure, Function, Data, Interfaces, Platform, Operations, Time) |
| **PACT** | Agent behavior principles |
| **Holistic Testing Model** | Tech/Business x Support/Critique quadrants |
| **QCSD Phases** | Ideation, Grooming, Development, CI/CD, Production Telemetry |

---

## Architecture Summary

```
                    +-------------------+
                    | qe-fleet-commander|
                    +--------+----------+
                             |
       +---------------------+---------------------+
       |                     |                     |
+------v------+       +------v------+       +------v------+
|  Test Gen   |       | Test Exec   |       | Coverage    |
|  Domain     |       | Domain      |       | Domain      |
+-------------+       +-------------+       +-------------+
       |                     |                     |
       +---------------------+---------------------+
                             |
       +---------------------+---------------------+
       |                     |                     |
+------v------+       +------v------+       +------v------+
|  Quality    |       |  Security   |       |  Learning   |
|  Assessment |       |  Compliance |       |  Optimization|
+-------------+       +-------------+       +-------------+
```

---

## Domain 1: Test Generation

**Purpose**: AI-powered test creation using pattern recognition, code analysis, and intelligent test synthesis.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-test-architect` | Strategic test design | Pattern-based generation, multi-framework support, coverage-driven synthesis | Development, CI/CD |
| `qe-test-generator` | AI-powered test creation | Code analysis, edge case detection, mock generation | Development |
| `qe-tdd-specialist` | TDD workflow specialist | Red-Green-Refactor cycle, behavior-driven design | Grooming, Development |
| `qe-tdd-red` | TDD RED phase | Write failing tests first | Development |
| `qe-tdd-green` | TDD GREEN phase | Minimal implementation to pass | Development |
| `qe-tdd-refactor` | TDD REFACTOR phase | Improve design while keeping tests green | Development |
| `qe-pattern-matcher` | Pattern application | Repository patterns, service patterns, controller patterns | Development |

### Key Capabilities

- **Code Analysis Based Generation**: Analyze methods, branches, dependencies, error paths
- **Pattern-Based Generation**: Apply service-layer, repository, controller patterns
- **Coverage-Driven Generation**: Fill coverage gaps with prioritized test creation
- **Multi-Framework Support**: Jest, Vitest, Mocha, Pytest, JUnit

### Related Skill

**qe-test-generation** - `/workspaces/agentic-qe/.claude/skills/qe-test-generation/SKILL.md`

---

## Domain 2: Test Execution

**Purpose**: Parallel test execution, smart test selection, and flaky test management.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-test-executor` | Multi-framework executor | Jest, Vitest, Mocha, Pytest orchestration | CI/CD |
| `qe-parallel-executor` | Parallel execution | Sharding, worker pool management, resource optimization | CI/CD |
| `qe-flaky-hunter` | Flaky test detection | Pattern recognition, stability scoring, remediation | CI/CD, Production |
| `qe-retry-handler` | Intelligent retry | Exponential backoff, transient failure detection | CI/CD |
| `qe-smart-selector` | Test selection | Impact analysis, change-based selection, risk prioritization | CI/CD |

### Key Capabilities

- **Parallel Sharding**: O(1) distribution across workers
- **Smart Selection**: Run only tests affected by changes
- **Flaky Detection**: Identify and quarantine unstable tests
- **Retry Logic**: Intelligent retry with backoff strategies

### Related Skill

**qe-test-execution** - `/workspaces/agentic-qe/.claude/skills/qe-test-execution/SKILL.md`

---

## Domain 3: Coverage Analysis

**Purpose**: O(log n) sublinear coverage gap detection with risk-weighted analysis.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-coverage-specialist` | Sublinear analysis | O(log n) gap detection, sampling strategies | Development, CI/CD |
| `qe-coverage-analyzer` | Coverage reporting | Line, branch, function, mutation coverage | CI/CD |
| `qe-gap-detector` | Gap identification | Risk-scored gaps, priority recommendations | Development, CI/CD |

### Key Capabilities

- **O(log n) Sublinear Analysis**: Efficient coverage on large codebases
- **Risk-Weighted Gaps**: Prioritize coverage by business risk
- **Multi-Dimensional Coverage**: Statement, branch, path, mutation
- **Trend Analysis**: Track coverage over time

### Related Skill

**qe-coverage-analysis** - `/workspaces/agentic-qe/.claude/skills/qe-coverage-analysis/SKILL.md`

---

## Domain 4: Quality Assessment

**Purpose**: Quality gate enforcement and deployment readiness evaluation.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-quality-gate` | Gate decisions | Pass/fail evaluation, policy enforcement | CI/CD |
| `qe-quality-analyzer` | Quality metrics | Code quality, test quality, maintainability | Development, CI/CD |
| `qe-deployment-advisor` | Deployment readiness | Risk assessment, rollback planning | CI/CD |
| `qe-deployment-readiness` | Release validation | Go/no-go decision support | CI/CD |
| `qe-code-reviewer` | Code review | Quality patterns, anti-pattern detection | Development |
| `qe-code-complexity` | Complexity analysis | Cyclomatic complexity, cognitive complexity | Development |

### Key Capabilities

- **Quality Gates**: Configurable thresholds for coverage, tests, security
- **Deployment Readiness**: Multi-factor release decision support
- **Risk Scoring**: Quantified risk assessment for releases
- **Quality Trends**: Track quality metrics over time

### Related Skill

**qe-quality-assessment** - `/workspaces/agentic-qe/.claude/skills/qe-quality-assessment/SKILL.md`

---

## Domain 5: Defect Intelligence

**Purpose**: ML-powered defect prediction, pattern learning, and root cause analysis.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-defect-predictor` | Defect prediction | ML models, change correlation, risk scoring | Development, CI/CD |
| `qe-root-cause-analyzer` | RCA automation | 5-whys, fishbone, fault tree analysis | CI/CD, Production |
| `qe-pattern-learner` | Pattern discovery | Code smell correlation, change coupling | All Phases |

### Key Capabilities

- **Change-Based Prediction**: Predict defects from PR changes
- **Pattern Learning**: Learn from historical defect data
- **Root Cause Analysis**: Automated 5-whys, fishbone diagrams
- **Risk Factors**: Code churn, complexity, author experience

### Related Skill

**qe-defect-intelligence** - `/workspaces/agentic-qe/.claude/skills/qe-defect-intelligence/SKILL.md`

---

## Domain 6: Code Intelligence

**Purpose**: Knowledge graph-based code understanding with semantic search.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-knowledge-manager` | Knowledge graph | Code relationships, dependency mapping | All Phases |
| `qe-knowledge-graph` | Graph operations | Query, traverse, analyze relationships | All Phases |
| `qe-semantic-searcher` | Semantic search | Natural language code queries | Development |
| `qe-dependency-mapper` | Dependency analysis | Impact analysis, coupling detection | Development, CI/CD |
| `code-analyzer` | Static analysis | AST parsing, pattern detection | Development |

### Key Capabilities

- **Knowledge Graph**: Code entity relationships
- **80% Token Reduction**: Efficient context retrieval
- **Semantic Search**: Natural language code queries
- **Impact Analysis**: Understand change propagation

### Related Skill

**qe-code-intelligence** - `/workspaces/agentic-qe/.claude/skills/qe-code-intelligence/SKILL.md`

---

## Domain 7: Requirements Validation

**Purpose**: BDD scenarios, traceability matrices, and acceptance criteria validation.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-requirements-validator` | Requirements check | SMART criteria, completeness validation | Ideation, Grooming |
| `qe-acceptance-criteria` | AC validation | Testability assessment, clarity scoring | Grooming |
| `qe-traceability-builder` | Traceability matrix | Requirements to tests mapping | Grooming, Development |
| `qe-bdd-specialist` | BDD scenarios | Gherkin generation, step definitions | Grooming, Development |
| `qe-property-tester` | Property-based testing | Invariant discovery, property specification | Development |

### Key Capabilities

- **SMART Validation**: Specific, Measurable, Achievable, Relevant, Testable
- **Traceability Matrix**: Requirements to code to tests
- **BDD Generation**: Auto-generate Gherkin scenarios
- **Coverage Gaps**: Identify untested requirements

### Related Skill

**qe-requirements-validation** - `/workspaces/agentic-qe/.claude/skills/qe-requirements-validation/SKILL.md`

---

## Domain 8: Security Compliance

**Purpose**: SAST/DAST scanning, OWASP compliance, and regulatory validation.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-security-scanner` | Vulnerability scanning | SAST, DAST, dependency scanning | Development, CI/CD |
| `qe-security-auditor` | Security audit | OWASP Top 10, CWE compliance | CI/CD |
| `qe-security-reviewer` | Security review | Threat modeling, code review | Development |
| `qe-compliance-checker` | Compliance validation | SOC2, GDPR, HIPAA, PCI-DSS | CI/CD |

### Key Capabilities

- **OWASP Top 10**: Full coverage of 2021 vulnerabilities
- **Dependency Scanning**: CVE detection in dependencies
- **Secret Detection**: API keys, passwords, tokens
- **Compliance Auditing**: SOC2, GDPR, HIPAA, PCI-DSS

### Related Skill

**qe-security-compliance** - `/workspaces/agentic-qe/.claude/skills/qe-security-compliance/SKILL.md`

---

## Domain 9: Contract Testing

**Purpose**: Consumer-driven contracts, API schema validation, and compatibility checking.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-contract-validator` | Contract verification | Pact, OpenAPI validation | Development, CI/CD |
| `qe-api-contract-validator` | API contract testing | REST, GraphQL contracts | Development, CI/CD |
| `qe-api-tester` | API testing | Endpoint validation, response verification | Development, CI/CD |
| `qe-api-compatibility` | Compatibility check | Breaking change detection | CI/CD |
| `qe-graphql-tester` | GraphQL testing | Schema validation, query testing | Development |

### Key Capabilities

- **Consumer-Driven Contracts**: Pact broker integration
- **Breaking Change Detection**: API version compatibility
- **Schema Validation**: OpenAPI, GraphQL, JSON Schema
- **Event Contracts**: Message schema validation

### Related Skill

**qe-contract-testing** - `/workspaces/agentic-qe/.claude/skills/qe-contract-testing/SKILL.md`

---

## Domain 10: Visual Accessibility

**Purpose**: Visual regression, WCAG compliance, and responsive design testing.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-visual-tester` | Visual regression | Screenshot comparison, diff detection | CI/CD |
| `qe-a11y-validator` | Accessibility validation | WCAG 2.2 AA/AAA compliance | Development, CI/CD |
| `qe-accessibility-agent` | A11y testing | Screen reader, keyboard navigation | Development |
| `qe-responsive-tester` | Responsive testing | Viewport testing, mobile validation | CI/CD |

### Key Capabilities

- **Visual Regression**: Pixel-level comparison with thresholds
- **WCAG 2.2 Compliance**: Level A, AA, AAA validation
- **Responsive Design**: Multi-viewport testing
- **Cross-Browser**: Chrome, Firefox, Safari, Edge

### Related Skill

**qe-visual-accessibility** - `/workspaces/agentic-qe/.claude/skills/qe-visual-accessibility/SKILL.md`

---

## Domain 11: Chaos Resilience

**Purpose**: Fault injection, load testing, and disaster recovery validation.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-chaos-engineer` | Chaos engineering | Fault injection, GameDay orchestration | CI/CD, Production |
| `qe-performance-tester` | Performance testing | Load, stress, soak testing | CI/CD |
| `qe-load-tester` | Load testing | Scalability validation | CI/CD |
| `qe-resilience-tester` | Resilience validation | Circuit breaker, retry testing | CI/CD |

### Key Capabilities

- **Fault Injection**: Network, latency, resource failures
- **GameDay Orchestration**: Coordinated chaos experiments
- **Performance Profiling**: P95/P99 latency, throughput
- **Disaster Recovery**: Failover and recovery testing

### Related Skill

**qe-chaos-resilience** - `/workspaces/agentic-qe/.claude/skills/qe-chaos-resilience/SKILL.md`

---

## Domain 12: Learning Optimization

**Purpose**: Cross-domain pattern learning and continuous improvement.

### Primary Agents

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-learning-coordinator` | Fleet-wide learning | Knowledge sharing, pattern aggregation | All Phases |
| `qe-pattern-learner` | Pattern discovery | Success patterns, anti-patterns | All Phases |
| `qe-optimization-agent` | Test optimization | Test suite optimization, deduplication | CI/CD |

### Key Capabilities

- **Pattern Recognition**: Learn from successful test strategies
- **Knowledge Transfer**: Share patterns across agents
- **Continuous Improvement**: Evolve strategies based on outcomes
- **Memory Persistence**: Store learnings in AgentDB

### Related Skill

**qe-learning-optimization** - `/workspaces/agentic-qe/.claude/skills/qe-learning-optimization/SKILL.md`

---

## Cross-Domain Agents

These agents span multiple domains and provide coordination capabilities.

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-fleet-commander` | Fleet coordination | Multi-agent orchestration, resource allocation | All Phases |
| `qe-production-intelligence` | Production monitoring | Log analysis, anomaly detection | Production |
| `qe-regression-risk-analyzer` | Risk analysis | Change impact, regression prediction | Development, CI/CD |
| `qe-test-data-architect` | Test data management | Data generation, masking, state management | Development, CI/CD |
| `qe-claim-verifier` | Claim verification | Implementation validation | Development |
| `qx-partner` | QE partnership | Human-AI collaboration | All Phases |

---

## QCSD Ideation Agents (New in v3.4)

These agents support the QCSD Ideation phase with comprehensive quality analysis using HTSM v6.3 and SFDIPOT frameworks.

| Agent | Function | Key Capabilities | QCSD Phases |
|-------|----------|------------------|-------------|
| `qe-quality-criteria-recommender` | HTSM v6.3 quality criteria | 10 quality categories, evidence-based recommendations, cross-phase learning | Ideation |
| `qe-product-factors-assessor` | SFDIPOT analysis | 7-factor assessment, 37 subcategories, test idea generation | Ideation, Grooming |
| `qe-risk-assessor` | Risk assessment | Multi-factor scoring, impact analysis, mitigation recommendations | Ideation, Grooming |
| `qe-test-idea-rewriter` | Test idea transformation | Transform "Verify X" to action verbs, enforce quality rules | Grooming, Development |

### HTSM v6.3 Quality Categories

The `qe-quality-criteria-recommender` analyzes requirements against James Bach's 10 quality categories:

| Category | Focus |
|----------|-------|
| Capability | Core functionality |
| Reliability | Consistency under conditions |
| Usability | User experience |
| Charisma | Aesthetics, brand alignment |
| Security | Protection from threats |
| Scalability | Growth handling |
| Compatibility | Integration with other systems |
| Performance | Speed and efficiency |
| Installability | Deployment ease |
| Supportability | Maintenance and debugging |

### SFDIPOT Framework

The `qe-product-factors-assessor` uses SFDIPOT for comprehensive product analysis:

| Factor | Questions |
|--------|-----------|
| **S**tructure | What the product IS (architecture, components) |
| **F**unction | What it DOES (features, calculations) |
| **D**ata | What it PROCESSES (input/output, persistence) |
| **I**nterfaces | How it CONNECTS (UI, APIs, integrations) |
| **P**latform | What it DEPENDS ON (OS, browser, services) |
| **O**perations | How it's USED (workflows, edge cases) |
| **T**ime | WHEN things happen (concurrency, scheduling) |

### Cross-Phase Memory Integration

These agents participate in QCSD feedback loops via the cross-phase memory system:

| Agent | Loop | Role |
|-------|------|------|
| qe-quality-criteria-recommender | Strategic (Loop 1) | CONSUMER - receives production risk weights |
| qe-risk-assessor | Strategic (Loop 1) | CONSUMER - receives production risk weights |
| qe-product-factors-assessor | Tactical (Loop 2) | CONSUMER - receives SFDIPOT factor weights |

See `docs/architecture/CROSS-PHASE-MEMORY-IMPLEMENTATION.md` for full details.

---

## QCSD Phase Mapping

### Ideation Phase

| Agent | Primary Use |
|-------|-------------|
| qe-requirements-validator | Validate requirement quality |
| qe-acceptance-criteria | Assess testability |
| qe-bdd-specialist | Generate initial scenarios |
| **qe-quality-criteria-recommender** | HTSM v6.3 quality criteria analysis (NEW) |
| **qe-risk-assessor** | Multi-factor risk scoring with cross-phase learning (NEW) |
| **qe-product-factors-assessor** | SFDIPOT product factors analysis (NEW) |

### Grooming Phase

| Agent | Primary Use |
|-------|-------------|
| qe-requirements-validator | Refine requirements |
| qe-traceability-builder | Map requirements to tests |
| qe-tdd-specialist | Plan TDD approach |
| qe-bdd-specialist | Create Gherkin scenarios |

### Development Phase

| Agent | Primary Use |
|-------|-------------|
| qe-test-generator | Generate unit tests |
| qe-test-architect | Design test strategy |
| qe-tdd-red/green/refactor | TDD cycle support |
| qe-coverage-analyzer | Monitor coverage |
| qe-security-reviewer | Security code review |
| qe-code-reviewer | Quality code review |

### CI/CD Phase

| Agent | Primary Use |
|-------|-------------|
| qe-parallel-executor | Run tests in parallel |
| qe-quality-gate | Enforce quality gates |
| qe-security-scanner | Automated security scans |
| qe-visual-tester | Visual regression |
| qe-contract-validator | API contract validation |
| qe-deployment-readiness | Release decision |

### Production Telemetry Phase

| Agent | Primary Use |
|-------|-------------|
| qe-production-intelligence | Monitor production |
| qe-chaos-engineer | Chaos experiments |
| qe-root-cause-analyzer | Incident RCA |
| qe-flaky-hunter | Detect production flakiness |

---

## Skills Reference

### Core QE Skills (12)

| Skill | Path | Agents |
|-------|------|--------|
| qe-test-generation | `.claude/skills/qe-test-generation/` | qe-test-generator, qe-pattern-matcher, qe-test-architect |
| qe-test-execution | `.claude/skills/qe-test-execution/` | qe-parallel-executor, qe-flaky-hunter, qe-retry-handler |
| qe-coverage-analysis | `.claude/skills/qe-coverage-analysis/` | qe-coverage-specialist, qe-gap-detector |
| qe-quality-assessment | `.claude/skills/qe-quality-assessment/` | qe-quality-gate, qe-deployment-advisor |
| qe-defect-intelligence | `.claude/skills/qe-defect-intelligence/` | qe-defect-predictor, qe-root-cause-analyzer |
| qe-code-intelligence | `.claude/skills/qe-code-intelligence/` | qe-knowledge-graph, qe-semantic-searcher |
| qe-requirements-validation | `.claude/skills/qe-requirements-validation/` | qe-acceptance-criteria, qe-bdd-specialist |
| qe-security-compliance | `.claude/skills/qe-security-compliance/` | qe-security-auditor, qe-compliance-checker |
| qe-contract-testing | `.claude/skills/qe-contract-testing/` | qe-api-contract, qe-api-compatibility |
| qe-visual-accessibility | `.claude/skills/qe-visual-accessibility/` | qe-visual-tester, qe-accessibility-agent |
| qe-chaos-resilience | `.claude/skills/qe-chaos-resilience/` | qe-chaos-engineer, qe-performance-tester |
| qe-learning-optimization | `.claude/skills/qe-learning-optimization/` | qe-learning-coordinator, qe-pattern-learner |

### Foundational Skills

| Skill | Purpose |
|-------|---------|
| agentic-quality-engineering | Core PACT principles, 19-agent coordination |
| holistic-testing-pact | PACT principles deep dive, quadrant model |
| cicd-pipeline-qe-orchestrator | 5-phase CI/CD orchestration |
| qe-iterative-loop | Autonomous iteration loops (Ralph Wiggum technique) |

### Testing Methodology Skills

| Skill | Purpose |
|-------|---------|
| context-driven-testing | Context-based test decisions |
| risk-based-testing | Risk prioritization |
| exploratory-testing-advanced | SBTM, test tours |
| mutation-testing | Test quality validation |
| tdd-london-chicago | TDD approaches |
| shift-left-testing | Early testing practices |
| shift-right-testing | Production testing |

### Specialized Testing Skills

| Skill | Purpose |
|-------|---------|
| api-testing-patterns | REST, GraphQL patterns |
| contract-testing | Pact, schema validation |
| performance-testing | Load, stress testing |
| security-testing | OWASP, vulnerability testing |
| accessibility-testing | WCAG compliance |
| mobile-testing | iOS, Android testing |
| database-testing | Data integrity |
| compatibility-testing | Cross-browser/platform |
| localization-testing | i18n/l10n testing |
| visual-testing-advanced | Visual regression |

### Process Skills

| Skill | Purpose |
|-------|---------|
| bug-reporting-excellence | Quality bug reports |
| code-review-quality | Code review practices |
| quality-metrics | Measurement and KPIs |
| test-automation-strategy | Automation planning |
| test-data-management | Test data strategies |
| regression-testing | Regression strategies |

### Analysis Skills

| Skill | Purpose |
|-------|---------|
| brutal-honesty-review | Unfiltered technical criticism |
| sherlock-review | Evidence-based investigation |
| six-thinking-hats | Multi-perspective analysis |

---

## V3 Domain Interfaces

The V3 architecture exports 12 domain interfaces from `/workspaces/agentic-qe/v3/src/domains/index.ts`:

```typescript
export * as TestGeneration from './test-generation/interfaces';
export * as TestExecution from './test-execution/interfaces';
export * as CoverageAnalysis from './coverage-analysis/interfaces';
export * as QualityAssessment from './quality-assessment/interfaces';
export * as DefectIntelligence from './defect-intelligence/interfaces';
export * as CodeIntelligence from './code-intelligence/interfaces';
export * as RequirementsValidation from './requirements-validation/interfaces';
export * as SecurityCompliance from './security-compliance/interfaces';
export * as ContractTesting from './contract-testing/interfaces';
export * as VisualAccessibility from './visual-accessibility/interfaces';
export * as ChaosResilience from './chaos-resilience/interfaces';
export * as LearningOptimization from './learning-optimization/interfaces';
```

---

## Agent Invocation

### Via Task Tool (Claude Code)

```typescript
Task("Generate unit tests", `
  Analyze src/services/UserService.ts and generate comprehensive tests.
`, "qe-test-generator", { run_in_background: true })
```

### Via MCP Tools

```javascript
// Initialize fleet
mcp__agentic-qe__fleet_init({ topology: "hierarchical", maxAgents: 15 })

// Spawn specific agent
mcp__agentic-qe__agent_spawn({ domain: "test-generation", type: "worker" })

// Execute domain operation
mcp__agentic-qe__test_generate_enhanced({
  sourceCode: "...",
  language: "typescript",
  testType: "unit"
})
```

### Via CLI

```bash
# Spawn agent
aqe agent spawn qe-test-generator

# Fleet status
aqe fleet status

# Generate tests
aqe test generate --file src/services/UserService.ts --framework jest
```

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Total Agents** | 63+ |
| **V3 Domains** | 12 |
| **QCSD Ideation Agents** | 4 (NEW) |
| **Core QE Skills** | 12 |
| **Total Skills** | 91 |
| **QCSD Phases** | 5 |
| **Coordination Patterns** | 3 (Hierarchical, Mesh, Sequential) |

---

## References

- Fleet Documentation: `/workspaces/agentic-qe/docs/reference/aqe-fleet.md`
- V3 Domains: `/workspaces/agentic-qe/v3/src/domains/`
- Skills Directory: `/workspaces/agentic-qe/.claude/skills/`
- Agent Implementation: `/workspaces/agentic-qe/src/agents/`
