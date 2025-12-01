---
name: "CI/CD Pipeline QE Orchestrator"
description: "Orchestrate comprehensive quality engineering across CI/CD pipeline phases by intelligently selecting QE skills and coordinating specialized agents. Use when designing test strategies, planning quality gates, implementing shift-left/shift-right testing, or ensuring holistic quality coverage throughout the software delivery lifecycle. Integrates all 37 AQE skills and 18 agents for complete pipeline quality assurance."
---

# CI/CD Pipeline QE Orchestrator

## What This Skill Does

The CI/CD Pipeline QE Orchestrator provides intelligent, phase-based quality engineering across the entire software delivery pipeline. It:

1. **Analyzes pipeline phases** (commit, build, test, deploy, production)
2. **Selects optimal QE skills** from the 37 available skills based on phase requirements
3. **Orchestrates specialized agents** from the 18 QE agents for parallel execution
4. **Ensures holistic coverage** with shift-left, shift-right, and continuous quality validation
5. **Adapts strategies** based on risk, complexity, and deployment environment

---

## Prerequisites

- Agentic QE Fleet initialized (`aqe init` completed)
- 18 QE agents available in `.claude/agents/`
- 37 QE skills available in `.claude/skills/`
- Understanding of your CI/CD pipeline structure
- Access to Claude Code Task tool for agent coordination

---

## Quick Start (5 Minutes)

### Analyze Your Pipeline

```javascript
// Use the orchestrator to analyze and plan quality coverage
Task("Pipeline QE Analysis",
     "Analyze our CI/CD pipeline and recommend quality strategy for: commit, build, test, staging, production phases",
     "qe-fleet-commander")
```

### Example Output
```
Pipeline Quality Strategy:
├── Commit Phase (Shift-Left)
│   ├── Skills: tdd-london-chicago, shift-left-testing
│   ├── Agents: qe-test-generator, qe-code-reviewer
│   └── Coverage: Unit tests, static analysis, code review
├── Build Phase
│   ├── Skills: test-automation-strategy, mutation-testing
│   ├── Agents: qe-test-executor, qe-coverage-analyzer
│   └── Coverage: Integration tests, mutation testing, coverage gates
├── Test Phase
│   ├── Skills: api-testing-patterns, performance-testing, security-testing
│   ├── Agents: qe-api-contract-validator, qe-performance-tester, qe-security-scanner
│   └── Coverage: API contracts, load tests, security scans
├── Staging Phase
│   ├── Skills: shift-right-testing, chaos-engineering-resilience
│   ├── Agents: qe-visual-tester, qe-chaos-engineer
│   └── Coverage: Visual regression, chaos testing, smoke tests
└── Production Phase (Shift-Right)
    ├── Skills: shift-right-testing, compliance-testing
    ├── Agents: qe-production-intelligence, qe-deployment-readiness
    └── Coverage: Synthetic monitoring, canary analysis, compliance validation
```

---

## CI/CD Pipeline Phases

### Phase 1: Commit / Pre-Build (Shift-Left)

**Goal**: Catch defects early, ensure testability, validate code quality

**Recommended Skills**:
- `shift-left-testing` - TDD, BDD, design for testability
- `tdd-london-chicago` - Test-first development approaches
- `code-review-quality` - Context-driven code reviews
- `refactoring-patterns` - Safe refactoring techniques

**Recommended Agents**:
- `qe-test-generator` - Generate unit tests for new code
- `qe-requirements-validator` - Validate INVEST criteria, BDD scenarios
- `qe-code-reviewer` (via code-review-swarm) - Automated code review

**Quality Gates**:
- [ ] Unit test coverage > 80%
- [ ] No critical static analysis violations
- [ ] Code review approved
- [ ] Testability score > 85%

**Example Orchestration**:
```javascript
// Parallel execution for commit phase
Task("Generate Tests", "Create unit tests for new UserService methods", "qe-test-generator")
Task("Validate Requirements", "Check BDD scenarios for user stories", "qe-requirements-validator")
Task("Code Review", "Review code quality and testability", "code-review-swarm")
```

---

### Phase 2: Build Phase

**Goal**: Validate integration, ensure coverage, detect test quality issues

**Recommended Skills**:
- `test-automation-strategy` - Test pyramid optimization
- `mutation-testing` - Test quality validation
- `risk-based-testing` - Prioritize test execution
- `regression-testing` - Smart test selection

**Recommended Agents**:
- `qe-test-executor` - Run test suites in parallel
- `qe-coverage-analyzer` - Analyze coverage gaps
- `qe-regression-risk-analyzer` - Select minimal regression suite
- `qe-flaky-test-hunter` - Detect and stabilize flaky tests

**Quality Gates**:
- [ ] All tests passing
- [ ] Coverage > 90% on critical paths
- [ ] Mutation score > 70%
- [ ] No flaky tests detected

**Example Orchestration**:
```javascript
// Sequential workflow with memory coordination
Task("Execute Tests", "Run full test suite and store results in aqe/test-results/*", "qe-test-executor")

// Wait for execution, then analyze in parallel
Task("Coverage Analysis", "Read aqe/test-results/* and identify gaps", "qe-coverage-analyzer")
Task("Flaky Detection", "Analyze test history for flakiness patterns", "qe-flaky-test-hunter")
Task("Regression Analysis", "Select minimal suite for code changes", "qe-regression-risk-analyzer")
```

---

### Phase 3: Integration / Test Phase

**Goal**: Validate contracts, test performance, scan security, verify data

**Recommended Skills**:
- `api-testing-patterns` - REST/GraphQL contract testing
- `contract-testing` - Consumer-driven contracts (Pact)
- `performance-testing` - Load, stress, spike testing
- `security-testing` - OWASP Top 10 validation
- `database-testing` - Schema and data integrity
- `test-data-management` - Realistic test data generation

**Recommended Agents**:
- `qe-api-contract-validator` - Validate API contracts
- `qe-performance-tester` - Load test critical paths
- `qe-security-scanner` - SAST/DAST security scans
- `qe-test-data-architect` - Generate test data (10k+ records/sec)

**Quality Gates**:
- [ ] API contracts validated (no breaking changes)
- [ ] Performance SLAs met (p95 < 200ms)
- [ ] No critical security vulnerabilities
- [ ] Data integrity validated

**Example Orchestration**:
```javascript
// Parallel execution for comprehensive testing
Task("API Contracts", "Validate API contracts for breaking changes", "qe-api-contract-validator")
Task("Performance Test", "Load test with 1000 concurrent users", "qe-performance-tester")
Task("Security Scan", "Run SAST/DAST security checks", "qe-security-scanner")
Task("Data Generation", "Generate 10k realistic user records", "qe-test-data-architect")
```

---

### Phase 4: Staging / Pre-Production Phase

**Goal**: Validate production-like environment, test resilience, verify accessibility

**Recommended Skills**:
- `shift-right-testing` - Feature flags, canary deployments
- `chaos-engineering-resilience` - Fault injection, blast radius
- `exploratory-testing-advanced` - SBTM, test tours
- `accessibility-testing` - WCAG 2.2 compliance
- `compatibility-testing` - Cross-browser/device testing
- `visual-testing-advanced` - Visual regression with AI

**Recommended Agents**:
- `qe-chaos-engineer` - Resilience testing with controlled failures
- `qe-visual-tester` - Visual regression testing
- `qe-deployment-readiness` - Multi-factor risk assessment

**Quality Gates**:
- [ ] Chaos testing passed (system recovers from failures)
- [ ] Visual regression tests clean
- [ ] Accessibility score > 95 (WCAG AA)
- [ ] Deployment readiness score > 85%

**Example Orchestration**:
```javascript
// Staging validation workflow
Task("Chaos Testing", "Test system resilience with controlled failures", "qe-chaos-engineer")
Task("Visual Testing", "Run visual regression tests", "qe-visual-tester")
Task("Deployment Check", "Assess deployment readiness", "qe-deployment-readiness")
```

---

### Phase 5: Production / Post-Deploy (Shift-Right)

**Goal**: Monitor real usage, validate compliance, collect production intelligence

**Recommended Skills**:
- `shift-right-testing` - Synthetic monitoring, RUM analysis
- `compliance-testing` - GDPR, HIPAA, SOC2 validation
- `localization-testing` - i18n/l10n for global markets
- `mobile-testing` - iOS/Android production validation

**Recommended Agents**:
- `qe-production-intelligence` - Convert incidents to test scenarios
- `qe-deployment-readiness` - Production health assessment
- `qe-quality-analyzer` - Quality metrics and trends

**Quality Gates**:
- [ ] Synthetic monitors passing
- [ ] No critical production incidents
- [ ] Compliance validated (GDPR, etc.)
- [ ] Error rate < 0.1%

**Example Orchestration**:
```javascript
// Production monitoring and intelligence
Task("Production Intelligence", "Convert production incidents to test scenarios", "qe-production-intelligence")
Task("Quality Analysis", "Analyze production quality metrics", "qe-quality-analyzer")
```

---

## Phase-Based Skill Selection Matrix

Use this matrix to select optimal skills for each pipeline phase:

| Pipeline Phase | Primary Skills | Secondary Skills | Agent Coordination |
|----------------|----------------|------------------|-------------------|
| **Commit** | shift-left-testing, tdd-london-chicago | code-review-quality, refactoring-patterns | qe-test-generator, qe-requirements-validator |
| **Build** | test-automation-strategy, mutation-testing | regression-testing, risk-based-testing | qe-test-executor, qe-coverage-analyzer, qe-flaky-test-hunter |
| **Integration** | api-testing-patterns, contract-testing | performance-testing, security-testing | qe-api-contract-validator, qe-performance-tester, qe-security-scanner |
| **Staging** | shift-right-testing, chaos-engineering-resilience | accessibility-testing, visual-testing-advanced | qe-chaos-engineer, qe-visual-tester, qe-deployment-readiness |
| **Production** | shift-right-testing, compliance-testing | localization-testing, mobile-testing | qe-production-intelligence, qe-quality-analyzer |

---

## Complete Pipeline Orchestration Example

### Scenario: Full-Stack Web Application Deployment

```javascript
// Phase 1: Commit (Shift-Left)
Task("TDD Test Generation", "Generate tests for new features using TDD", "qe-test-generator")
Task("Requirements Validation", "Validate user stories with BDD scenarios", "qe-requirements-validator")

// Phase 2: Build
Task("Test Execution", "Run full test suite with coverage tracking", "qe-test-executor")
Task("Coverage Analysis", "Analyze coverage and identify gaps", "qe-coverage-analyzer")
Task("Flaky Detection", "Hunt and stabilize flaky tests", "qe-flaky-test-hunter")

// Phase 3: Integration
Task("API Contract Validation", "Check for breaking changes in API", "qe-api-contract-validator")
Task("Performance Testing", "Load test with 1000 users", "qe-performance-tester")
Task("Security Scanning", "Run SAST/DAST security checks", "qe-security-scanner")

// Phase 4: Staging
Task("Chaos Engineering", "Test resilience with fault injection", "qe-chaos-engineer")
Task("Visual Regression", "Validate UI with visual tests", "qe-visual-tester")
Task("Deployment Readiness", "Assess go/no-go for production", "qe-deployment-readiness")

// Phase 5: Production
Task("Production Intelligence", "Monitor and convert incidents to tests", "qe-production-intelligence")
Task("Quality Gate", "Validate against quality thresholds", "qe-quality-gate")
```

---

## Adaptive Strategy Selection

The orchestrator adapts based on:

### Risk Level
- **Critical**: Use all phases, maximum coverage, manual gates
- **High**: Use automated gates, comprehensive testing
- **Medium**: Use smart test selection, risk-based prioritization
- **Low**: Use minimal regression suite, fast feedback

### Application Type
- **API**: Focus on contract-testing, api-testing-patterns, performance-testing
- **Web UI**: Focus on visual-testing-advanced, accessibility-testing, compatibility-testing
- **Mobile**: Focus on mobile-testing, performance-testing, compatibility-testing
- **Backend**: Focus on database-testing, performance-testing, security-testing

### Deployment Frequency
- **Continuous (hourly)**: Minimal regression, fast feedback, shift-right monitoring
- **Daily**: Smart test selection, parallel execution, automated gates
- **Weekly**: Comprehensive testing, exploratory sessions, manual validation
- **Monthly**: Full regression, compliance checks, extensive validation

---

## Integration with Existing QE Fleet

### Memory Coordination

All agents coordinate through the `aqe/*` namespace:

```
aqe/
├── pipeline/
│   ├── phase-results/          # Results from each phase
│   ├── quality-gates/          # Gate validation results
│   └── orchestration-plan/     # Selected skills and agents
├── test-plan/generated         # Test plans from generators
├── coverage/gaps               # Coverage analysis results
├── security/findings           # Security scan results
└── performance/results         # Performance test results
```

### Skill Invocation

Invoke individual QE skills as needed:

```javascript
// Use specific QE skills
Skill("shift-left-testing")      // Learn shift-left practices
Skill("chaos-engineering-resilience") // Apply chaos engineering
Skill("api-testing-patterns")    // Implement API testing
```

### Agent Coordination

Use the `qe-fleet-commander` for complex multi-agent orchestration:

```javascript
Task("Fleet Orchestration",
     "Coordinate 10 agents across pipeline phases: commit (2 agents), build (3 agents), test (3 agents), staging (2 agents)",
     "qe-fleet-commander")
```

---

## Quality Gates Configuration

### Gate Templates

**Commit Gate**:
```json
{
  "phase": "commit",
  "gates": [
    { "metric": "unit_coverage", "threshold": 80, "blocking": true },
    { "metric": "static_analysis", "severity": "critical", "max_violations": 0 },
    { "metric": "code_review", "status": "approved", "blocking": true }
  ]
}
```

**Build Gate**:
```json
{
  "phase": "build",
  "gates": [
    { "metric": "all_tests_passed", "threshold": 100, "blocking": true },
    { "metric": "coverage", "threshold": 90, "blocking": true },
    { "metric": "mutation_score", "threshold": 70, "blocking": false }
  ]
}
```

**Integration Gate**:
```json
{
  "phase": "integration",
  "gates": [
    { "metric": "api_contracts", "breaking_changes": 0, "blocking": true },
    { "metric": "performance_p95", "threshold_ms": 200, "blocking": true },
    { "metric": "security_critical", "max_vulnerabilities": 0, "blocking": true }
  ]
}
```

### Gate Execution

```javascript
// Validate quality gates
Task("Quality Gate Validation",
     "Validate all gates for integration phase: API contracts, performance SLAs, security scans",
     "qe-quality-gate")
```

---

## Advanced Orchestration Patterns

### Pattern 1: Parallel Phase Execution

```javascript
// Execute multiple phases in parallel (for microservices)
Task("Service A Pipeline", "Run full pipeline for service A", "qe-fleet-commander")
Task("Service B Pipeline", "Run full pipeline for service B", "qe-fleet-commander")
Task("Service C Pipeline", "Run full pipeline for service C", "qe-fleet-commander")
```

### Pattern 2: Sequential with Gates

```javascript
// Sequential execution with quality gates
Task("Commit Phase", "Shift-left testing and validation", "qe-test-generator")
// Check gate before proceeding
Task("Build Phase", "Run tests if commit gate passes", "qe-test-executor")
// Check gate before proceeding
Task("Integration Phase", "API and performance tests if build gate passes", "qe-api-contract-validator")
```

### Pattern 3: Adaptive Selection

```javascript
// Adaptive strategy based on code changes
Task("Risk Analysis", "Analyze code changes and select minimal test suite", "qe-regression-risk-analyzer")
// Execute only selected tests
Task("Targeted Testing", "Run minimal test suite based on risk analysis", "qe-test-executor")
```

---

## Troubleshooting

### Issue: Too Many Tests Running (OOM)

**Symptoms**: Build fails with out-of-memory errors
**Cause**: Running all tests in parallel without batching
**Solution**: Use batched execution

```javascript
// Use batched test execution
Task("Batched Tests", "Run tests in batches of 10 with memory limits", "qe-test-executor")
```

See [Test Execution Policy](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/policies/test-execution.md)

### Issue: Pipeline Takes Too Long

**Symptoms**: Pipeline exceeds time budget
**Cause**: Running comprehensive testing on every commit
**Solution**: Use smart test selection

```javascript
// Use regression risk analysis
Task("Smart Selection", "Select minimal test suite based on code changes", "qe-regression-risk-analyzer")
```

### Issue: Quality Gates Failing

**Symptoms**: Deployment blocked by quality gates
**Cause**: Thresholds too strict or tests not comprehensive
**Solution**: Review and adjust gates

```javascript
// Analyze quality metrics
Task("Quality Analysis", "Analyze trends and recommend threshold adjustments", "qe-quality-analyzer")
```

---

## Complete Workflow Templates

### Template 1: Microservice Pipeline

See [resources/workflows/microservice-pipeline.md](resources/workflows/microservice-pipeline.md)

### Template 2: Monolith Pipeline

See [resources/workflows/monolith-pipeline.md](resources/workflows/monolith-pipeline.md)

### Template 3: Mobile App Pipeline

See [resources/workflows/mobile-pipeline.md](resources/workflows/mobile-pipeline.md)

---

## Resources

### Skills Reference
- [All 37 QE Skills](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/reference/skills.md)
- [Shift-Left Testing](../shift-left-testing/SKILL.md)
- [Shift-Right Testing](../shift-right-testing/SKILL.md)
- [Chaos Engineering](../chaos-engineering-resilience/SKILL.md)

### Agent Reference
- [All 18 QE Agents](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/reference/agents.md)
- [Fleet Commander](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/reference/agents.md#qe-fleet-commander)

### Policies
- [Test Execution Policy](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/policies/test-execution.md)
- [Release Verification Policy](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/policies/release-verification.md)

### External Resources
- [Continuous Testing in DevOps](https://www.atlassian.com/continuous-delivery/principles/continuous-integration-vs-delivery-vs-deployment)
- [Shift-Left vs Shift-Right](https://www.dynatrace.com/news/blog/what-is-shift-left-and-shift-right/)
- [Quality Gates in CI/CD](https://docs.sonarqube.org/latest/user-guide/quality-gates/)

---

**Created**: 2025-11-13
**Category**: Quality Engineering Orchestration
**Difficulty**: Advanced
**Estimated Time**: 30-60 minutes for full pipeline setup
**Integrations**: All 37 QE skills, 18 QE agents, CI/CD platforms (GitHub Actions, Jenkins, GitLab CI)
