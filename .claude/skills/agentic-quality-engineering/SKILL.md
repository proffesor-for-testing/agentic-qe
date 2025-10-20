---
name: agentic-quality-engineering
description: Using AI agents as force multipliers in quality work. Use when designing autonomous testing systems, implementing PACT principles, or scaling quality engineering with intelligent agents. Core skill for all QE agents in the fleet.
version: 1.0.0
category: quality-engineering
tags: [ai-agents, pact-principles, autonomous-testing, multi-agent-systems, test-automation, quality-engineering]
difficulty: advanced
estimated_time: 4-6 hours
author: user
---

# Agentic Quality Engineering

## Overview

Agentic Quality Engineering transforms traditional QE by deploying AI agents as force multipliers - amplifying human judgment through intelligent automation, adaptive testing, and autonomous quality analysis.

**This is the foundational skill for all 17 QE Fleet agents.**

---

## What Is Agentic Quality Engineering?

### The Evolution of Quality Engineering

**Traditional QE:** Human does everything manually
- Manual test execution
- Manual log analysis
- Manual risk assessment
- Human bottleneck at every stage

**Automation QE:** Scripts handle repetitive tasks
- Automated regression tests
- Scripted checks
- Fixed test scenarios
- Still requires human orchestration

**Agentic QE:** AI agents collaborate with humans
- Agents analyze code changes and generate tests
- Agents detect patterns and anomalies autonomously
- Agents adapt strategies based on feedback
- Humans focus on context, risk, and judgment

### Core Premise

**Agents amplify human expertise, not replace it.**

The goal: More effective quality engineers who can:
- Scale across 10x more code
- Find patterns hidden in data volumes
- Adapt testing strategy in real-time
- Focus on high-value activities (exploratory testing, risk analysis, architecture review)

---

## The Agentic QE Architecture

### Multi-Agent Fleet (17 Specialized Agents)

**Core Testing Agents (5):**
- `qe-test-generator` - AI-powered test generation with sublinear optimization
- `qe-test-executor` - Multi-framework parallel test execution
- `qe-coverage-analyzer` - Real-time gap detection with O(log n) algorithms
- `qe-quality-gate` - Intelligent quality gate with risk assessment
- `qe-quality-analyzer` - Comprehensive quality metrics analysis

**Performance & Security (2):**
- `qe-performance-tester` - Load testing with k6/JMeter/Gatling
- `qe-security-scanner` - SAST/DAST multi-layer scanning

**Strategic Planning (3):**
- `qe-requirements-validator` - INVEST criteria + BDD generation
- `qe-production-intelligence` - Production data to test scenarios
- `qe-fleet-commander` - Hierarchical fleet coordination (50+ agents)

**Deployment (1):**
- `qe-deployment-readiness` - Multi-factor risk assessment

**Advanced Testing (4):**
- `qe-regression-risk-analyzer` - ML-driven test selection
- `qe-test-data-architect` - High-speed realistic data (10k+ records/sec)
- `qe-api-contract-validator` - Breaking change detection
- `qe-flaky-test-hunter` - Statistical flakiness detection + auto-fix

**Specialized (2):**
- `qe-visual-tester` - Visual regression with AI comparison
- `qe-chaos-engineer` - Controlled fault injection

### Agent Coordination Patterns

**Hierarchical:**
```
qe-fleet-commander
├── qe-test-generator → qe-test-executor → qe-coverage-analyzer
├── qe-security-scanner + qe-performance-tester (parallel)
└── qe-quality-gate (final validation)
```

**Mesh (Peer-to-Peer):**
```
qe-test-generator ↔ qe-coverage-analyzer ↔ qe-quality-analyzer
           ↕                     ↕                    ↕
qe-requirements-validator ↔ qe-test-executor ↔ qe-quality-gate
```

**Sequential (Pipeline):**
```
Code Change → qe-regression-risk-analyzer → qe-test-generator →
qe-test-executor → qe-coverage-analyzer → qe-quality-gate → Deploy
```

---

## Key Capabilities

### 1. Intelligent Test Generation

**What agents do:**
- Analyze code changes (git diff)
- Identify changed functions and dependencies
- Generate relevant test scenarios
- Prioritize based on risk and coverage gaps

**Example:**
```typescript
// Agent detects new payment method
async function processStripePayment(amount: number, token: string) {
  // New code
}

// Agent generates:
// ✓ Happy path test
// ✓ Invalid token test
// ✓ Zero/negative amount test
// ✓ Network timeout test
// ✓ Idempotency test
```

**Human role:** Review generated tests, add domain-specific edge cases, validate test quality

### 2. Pattern Detection in Logs

**What agents do:**
- Scan thousands of log lines in seconds
- Identify anomaly patterns
- Correlate errors across services
- Detect performance degradation trends

**Example:**
```
Agent finds pattern:
2025-10-20T10:15:32 [ERROR] Payment timeout (customer_123)
2025-10-20T10:16:01 [ERROR] Payment timeout (customer_456)
2025-10-20T10:16:18 [ERROR] Payment timeout (customer_789)

Agent analysis:
→ 15 payment timeouts in 5 minutes
→ All timeouts to Stripe gateway
→ Started after deploy at 10:14:00
→ Recommendation: Rollback deployment
```

**Human role:** Validate analysis, make rollback decision, fix root cause

### 3. Adaptive Test Strategy

**What agents do:**
- Monitor test results and production incidents
- Adjust test focus based on risk signals
- Re-prioritize test execution
- Recommend new test coverage

**Example:**
```
Agent detects:
- 5 production incidents in checkout (last 7 days)
- Current test coverage: 60%
- Flaky test rate: 8%

Agent adapts:
→ Increase checkout test coverage to 90%
→ Add chaos testing for payment gateway
→ Fix/quarantine flaky tests
→ Run checkout tests on every commit
```

**Human role:** Approve strategy changes, validate risk assessment, set guardrails

### 4. Root Cause Analysis

**What agents do:**
- Correlate test failures across test suites
- Link failures to code changes
- Identify affected components
- Suggest likely root causes

**Example:**
```
Test failure: "API returns 500 on POST /orders"

Agent analysis:
→ 12 tests failing (all order-related)
→ Started after commit abc123
→ Changed file: order-service.ts
→ Root cause: Missing null check on line 45
→ Confidence: 95%
```

**Human role:** Verify root cause, implement fix, validate solution

### 5. Documentation Generation

**What agents do:**
- Generate test reports
- Create API documentation from code
- Build quality dashboards
- Write test summaries

**Example:**
```markdown
# Sprint 42 Quality Report (Agent-Generated)

## Test Coverage
- Unit: 85% (↑ 3% from last sprint)
- Integration: 72% (↑ 5%)
- E2E: Critical paths at 100%

## Bugs Found
- Critical: 2 (fixed)
- High: 5 (4 fixed, 1 in progress)
- Medium: 12 (triaged)

## Risk Assessment
🔴 Payment gateway timeout (production incident)
🟡 Checkout flow performance degrading
🟢 Authentication stable
```

**Human role:** Review report, add context, present to stakeholders

---

## PACT Principles for Agentic QE

### Proactive
**Agents act before problems occur:**
- Analyze code changes pre-merge
- Predict high-risk areas
- Generate tests for new code
- Monitor trends in real-time

**Example:** Agent detects increasing error rate and generates alerts before customer impact

### Autonomous
**Agents work independently:**
- Execute tests without human trigger
- Prioritize test execution
- Generate test data
- Fix flaky tests automatically

**Example:** Agent detects flaky test, identifies root cause (timing issue), applies fix, creates PR

### Collaborative
**Agents work with humans and other agents:**
- Multi-agent coordination (test-gen → test-exec → coverage)
- Human-in-the-loop for critical decisions
- Share insights across team
- Learn from human feedback

**Example:** Agent generates tests, human reviews and adds domain knowledge, agent learns patterns

### Targeted
**Agents focus on high-value work:**
- Risk-based test prioritization
- Coverage of critical paths
- Ignore low-risk areas
- Optimize for impact

**Example:** Agent focuses 80% of testing on payment and auth (high risk) vs 20% on admin panel (low risk)

---

## Using with QE Agents

### Agent Assignment by Skill

Each of the 17 QE agents uses this foundational skill plus specialized skills:

**qe-test-generator:**
- `agentic-quality-engineering` (core)
- `api-testing-patterns`
- `tdd-london-chicago`
- `test-automation-strategy`

**qe-coverage-analyzer:**
- `agentic-quality-engineering` (core)
- `quality-metrics`
- `risk-based-testing`

**qe-flaky-test-hunter:**
- `agentic-quality-engineering` (core)
- `exploratory-testing-advanced`
- `risk-based-testing`

**qe-security-scanner:**
- `agentic-quality-engineering` (core)
- `security-testing`
- `risk-based-testing`

*See `.claude/agents/` for complete agent definitions and skill mappings.*

### Agent Coordination Examples

**Example 1: PR Quality Gate**
```typescript
// 1. qe-regression-risk-analyzer scans PR
const riskAreas = await agent.analyzeRisk(prDiff);

// 2. qe-test-generator creates targeted tests
const newTests = await agent.generateTests(riskAreas);

// 3. qe-test-executor runs test suite
const results = await agent.executeTests(newTests);

// 4. qe-coverage-analyzer checks gaps
const gaps = await agent.analyzeCoverage(results);

// 5. qe-quality-gate makes decision
const decision = await agent.evaluateQuality(results, gaps);
// → PASS: All critical tests passed, coverage > 85%
```

**Example 2: Production Intelligence Loop**
```typescript
// 1. qe-production-intelligence monitors production
const incidents = await agent.monitorProduction();

// 2. Agent converts incident to test scenario
const testScenario = await agent.incidentToTest(incidents[0]);

// 3. qe-test-generator implements test
const test = await agent.generateTest(testScenario);

// 4. qe-test-executor validates fix
const result = await agent.executeTest(test);
// → Test now prevents regression
```

---

## Practical Implementation Guide

### Phase 1: Experiment (Weeks 1-4)

**Goal:** Validate value with one use case

**Pick one agent + one use case:**
- `qe-test-generator` for PR test generation
- `qe-coverage-analyzer` for gap detection
- `qe-quality-gate` for automated quality checks

**Measure:**
- Tests generated per PR
- Coverage improvements
- Bugs caught before production
- Time saved

**Example:**
```bash
# Week 1: Deploy qe-test-generator
aqe agent spawn qe-test-generator

# Week 2-3: Generate tests for 10 PRs
# Track: How many bugs found, test quality, human review time

# Week 4: Measure impact
aqe agent metrics qe-test-generator
# Result: 150 tests generated, 12 bugs found, 8 hours saved
```

### Phase 2: Integrate (Months 2-3)

**Goal:** Build into CI/CD pipeline

**Add agents to workflow:**
```yaml
# .github/workflows/quality-gate.yml
name: Agentic Quality Gate

on: [pull_request]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - name: Analyze Risk
        run: aqe agent run qe-regression-risk-analyzer

      - name: Generate Tests
        run: aqe agent run qe-test-generator

      - name: Execute Tests
        run: aqe agent run qe-test-executor

      - name: Check Coverage
        run: aqe agent run qe-coverage-analyzer

      - name: Quality Gate
        run: aqe agent run qe-quality-gate
```

**Create feedback loops:**
- Agents learn from which tests find bugs
- Humans label false positives
- System adapts over time

### Phase 3: Scale (Months 4-6)

**Goal:** Expand to multiple use cases

**Add more agents:**
- Performance testing (`qe-performance-tester`)
- Security scanning (`qe-security-scanner`)
- Flaky test detection (`qe-flaky-test-hunter`)

**Coordinate agents:**
```typescript
// Fleet coordination
const fleet = await FleetManager.init({
  topology: 'hierarchical',
  agents: [
    'qe-fleet-commander',
    'qe-test-generator',
    'qe-test-executor',
    'qe-coverage-analyzer',
    'qe-security-scanner',
    'qe-quality-gate'
  ]
});

// Commander orchestrates all agents
await fleet.commander.orchestrate(pullRequest);
```

### Phase 4: Evolve (Ongoing)

**Goal:** Continuous improvement through learning

**Agent learning:**
- Track success rates
- Learn from human corrections
- Adapt to codebase patterns
- Improve over time

**Metrics:**
```bash
aqe learn status --agent test-generator
# Shows: Learning progress, pattern recognition, success rate
```

---

## Challenges and Limitations

### What Agents Can't Do (Yet)

**Business Context:**
- Agents don't understand "why" features exist
- Can't prioritize based on business value without guidance
- Need humans to explain domain constraints

**Ethical Judgment:**
- Agents can't make ethical decisions
- Can't balance competing priorities (speed vs quality)
- Need human oversight for critical decisions

**Creative Exploration:**
- Agents follow patterns, humans explore unknown unknowns
- Humans excel at "what if" scenarios
- Agents need structured problems

**Domain Expertise:**
- Agents lack deep domain knowledge (healthcare, finance, legal)
- Can't replace subject matter experts
- Need human context for specialized systems

### What Agents Excel At

**Data Volume:**
- Scan thousands of log lines in seconds
- Analyze entire codebases
- Process metrics from hundreds of services

**Pattern Detection:**
- Find correlations humans would miss
- Detect subtle anomalies
- Identify trends over time

**Tireless Repetition:**
- Run tests 24/7
- Monitor systems continuously
- Never get bored or tired

**Rapid Feedback:**
- Instant analysis of code changes
- Real-time test generation
- Immediate coverage feedback

---

## Best Practices

### 1. Start Small
```
✅ Deploy one agent for one use case
❌ Deploy all 17 agents at once

✅ Measure impact before scaling
❌ Assume agents will work perfectly

✅ Build feedback loops early
❌ Deploy and forget
```

### 2. Human-Agent Collaboration
```
✅ Agent generates tests → Human reviews → Agent learns
❌ Agent generates tests → Auto-merge without review

✅ Agent flags risk → Human investigates → Agent refines
❌ Agent decides to block deployment autonomously

✅ Agent detects anomaly → Human confirms → Agent adapts
❌ Agent takes action without human validation
```

### 3. Measure Value
```
Track:
- Time saved (manual testing → agent testing)
- Bugs caught (pre-production vs production)
- Coverage improvement (before vs after)
- Developer confidence (survey)

Don't track:
- Number of tests generated (vanity metric)
- Agent uptime (not meaningful)
- Lines of code analyzed (doesn't show value)
```

### 4. Build Trust Gradually
```
Month 1: Agent suggests, human decides
Month 2: Agent acts, human reviews after
Month 3: Agent acts autonomously on low-risk tasks
Month 4: Agent handles critical tasks with human oversight
```

---

## Related Skills

**Core Quality Practices:**
- [holistic-testing-pact](../holistic-testing-pact/) - PACT principles for agentic systems
- [context-driven-testing](../context-driven-testing/) - Adapt testing to context
- [risk-based-testing](../risk-based-testing/) - Focus agents on high-risk areas

**Testing Specializations:**
- [api-testing-patterns](../api-testing-patterns/) - API testing with agents
- [performance-testing](../performance-testing/) - Load testing automation
- [security-testing](../security-testing/) - Security scanning agents
- [test-automation-strategy](../test-automation-strategy/) - Automation best practices

**Development Practices:**
- [tdd-london-chicago](../tdd-london-chicago/) - TDD with agent assistance
- [xp-practices](../xp-practices/) - Pair programming with agents

**Communication:**
- [technical-writing](../technical-writing/) - Agent-generated documentation
- [quality-metrics](../quality-metrics/) - Metrics for agent effectiveness

---

## Resources

**Documentation:**
- [AQE Fleet Original Requirements](../../../docs/Agentic-QE-Framework.md)
- [Agent Definitions](../../../.claude/agents/)
- [CLI Reference](../../../src/cli/)

**Learning:**
- Start with `qe-test-generator` for immediate value
- Use `aqe agent --help` for CLI commands
- Read agent-specific docs in `.claude/agents/`

**Community:**
- [GitHub Discussions](https://github.com/proffesor-for-testing/agentic-qe-cf/discussions)
- [Issue Tracker](https://github.com/proffesor-for-testing/agentic-qe-cf/issues)

---

**Remember:** Agentic QE amplifies human expertise, it doesn't replace it. The goal is more effective quality engineers who can scale their impact 10x through intelligent agent collaboration.

**Success Metric:** Can your QE team confidently deploy 10x more frequently with the same or better quality? If yes, agentic QE is working.
