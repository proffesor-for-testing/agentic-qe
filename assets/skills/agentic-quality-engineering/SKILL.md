---
name: agentic-quality-engineering
description: "Use when orchestrating QE agents, understanding PACTS principles, configuring the AQE v3 fleet, or leveraging AI agents as force multipliers for quality work."
category: qe-core
priority: critical
tokenEstimate: 1400
agents: [qe-test-architect, qe-parallel-executor, qe-coverage-specialist, qe-quality-gate, qe-performance-tester, qe-security-scanner, qe-requirements-validator, qe-fleet-commander, qe-deployment-advisor, qe-regression-analyzer, qe-contract-validator, qe-flaky-hunter, qe-visual-tester, qe-chaos-engineer, qe-code-complexity, qe-qx-partner, qe-devils-advocate]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [pacts, agents, fleet, coordination, autonomous, structured, foundational]
trust_tier: 1
validation:
  schema_path: schemas/output.json
---

# Agentic Quality Engineering

<default_to_action>
When implementing agentic QE or coordinating agents:
1. SPAWN appropriate agent(s) for the task using `Task` tool with agent type
2. CONFIGURE agent coordination (hierarchical/mesh/sequential)
3. EXECUTE with PACTS principles: Proactive analysis, Autonomous operation, Collaborative feedback, Targeted risk focus, Structured governance (observability and explainability of agent behavior)
4. VALIDATE results through quality gates before deployment
5. LEARN from outcomes - store patterns in `aqe/learning/*` namespace

**Quick Agent Selection:**
- Test generation needed → `qe-test-architect`
- Coverage gaps → `qe-coverage-specialist`
- Quality decision → `qe-quality-gate`
- Security scan → `qe-security-scanner`
- Performance test → `qe-performance-tester`
- Full pipeline → `qe-fleet-commander`

**Critical Success Factors:**
- Agents amplify human expertise, not replace it
- Human-in-the-loop for critical decisions
- Measure: bugs caught, time saved, coverage improved, and how often agent claims survive verification
- Done means committed, tested, and CI-validated with evidence attached, not "reported as complete"
</default_to_action>

## Quick Reference Card

### When to Use
- Designing autonomous testing systems
- Scaling QE with intelligent agents
- Implementing multi-agent coordination
- Building CI/CD quality pipelines

### PACTS Principles
| Principle | Agent Behavior | Human Role |
|-----------|---------------|------------|
| **P**roactive | Analyze pre-merge, predict risk | Set guardrails |
| **A**utonomous | Execute tests, fix flaky tests | Review critical |
| **C**ollaborative | Multi-agent coordination | Provide context |
| **T**argeted | Risk-based prioritization | Define risk areas |
| **S**tructured | Governance, observability, explainable decisions (measure confidence, not trust) | Audit behavior, set policy |

### Core Agents
The full fleet lives in `.claude/agents/v3/qe-*.md`; these are the agents most core jobs start with.

| Category | Agents | Primary Use |
|----------|--------|-------------|
| Core Testing | qe-test-architect, qe-parallel-executor, qe-coverage-specialist, qe-quality-gate | Daily testing |
| Performance/Security | qe-performance-tester, qe-security-scanner | Non-functional |
| Strategic | qe-requirements-validator, qe-fleet-commander | Planning, orchestration |
| Advanced | qe-regression-analyzer, qe-contract-validator, qe-flaky-hunter | Specialized |
| Visual/Chaos | qe-visual-tester, qe-chaos-engineer | Edge cases |
| Deployment | qe-deployment-advisor | Release |
| Analysis | qe-code-complexity | Maintainability |
| Verification | qe-devils-advocate | Challenge other agents' claims |

### Coordination Patterns
```
Hierarchical: fleet-commander → [generators] → [executors] → quality-gate
Mesh: test-gen ↔ coverage ↔ quality (peer decisions)
Sequential: risk-analyzer → test-gen → executor → coverage → gate
```

### Success Criteria
✅ Deployment frequency rises without escaped defects rising (measured against your own baseline)
✅ Coverage gaps detected in real-time
✅ Bugs caught pre-production
✅ Agent claims checked against evidence before anyone relies on them
❌ Agents acting without human oversight on critical decisions
❌ Deploying the whole fleet at once (start with 1-2)

---

## Core Concepts

### QE Evolution
| Stage | Approach | Limitation |
|-------|----------|------------|
| Traditional | Manual everything | Human bottleneck |
| Automation | Scripts + fixed scenarios | Needs orchestration |
| **Agentic** | AI agents + human judgment | Requires confidence-building: evidence that agent output holds up |

**Core Premise:** Agents amplify human expertise. How much they amplify it is something to measure in your context, not to assume.

**Confidence, not trust:** trust is a feeling; confidence can be explained. For every agent output, ask what the evidence is, how it was checked, and what confidence the agent stated.

### Key Capabilities

**1. Intelligent Test Generation**
```typescript
// Agent analyzes code change, generates targeted tests
const tests = await Task("Generate tests", prDiff, "qe-test-architect");
// → Happy path, edge cases, error handling tests
```

**2. Pattern Detection** - Scan logs, find anomalies, correlate errors

**3. Adaptive Strategy** - Adjust test focus based on risk signals

**4. Root Cause Analysis** - Link failures to code changes, suggest fixes

### Completion Theater (the central failure mode)

Agents optimize for appearing done rather than being done, and it gets harder to spot as their output gets more plausible. Patterns to check for:

- Work reported complete that was never committed
- Tests that assert a status code without checking the payload, or check that variables exist instead of behavior
- Coverage inflated by tests that touch code without exercising it
- Validation that checks counts or thresholds instead of behavior
- Report volume standing in for working software
- Stubs accepted as implementations
- Agent claims that the visible evidence contradicts

An honest, low-confidence answer is safer than a confident fabricated one; a false-safe label on a real security issue is the worst outcome. Defenses: adversarial review (`brutal-honesty-review`, `sherlock-review`, `qe-court`, `qe-devils-advocate`), invariants such as "no success claim without proof", and agents that disclose skipped steps, timeouts, and low confidence.

---

## Agent Coordination

### Memory Namespaces
```
aqe/test-plan/*     - Test planning decisions
aqe/coverage/*      - Coverage analysis results
aqe/quality/*       - Quality metrics and gates
aqe/learning/*      - Patterns and Q-values
aqe/coordination/*  - Cross-agent state
```

### Memory Operations (MCP Tools)

**CRITICAL**: Always use `aqe memory store` with `persist: true` for learnings.

**1. Store data to persistent memory:**
```bash
// Store test plan decisions (persisted to .agentic-qe/memory.db)
aqe memory store \
  --key "aqe/test-plan/pr-123" \
  --namespace "aqe/test-plan" \
  --value '{...}' \
  --json
```

**2. Retrieve prior learnings before task:**
```bash
// Query patterns before starting test generation
const priorData = await aqe memory get --key "aqe/learning/patterns/test-generation/*" --namespace "aqe/learning" --json

// Use patterns to guide current task
if (priorData.success) {
  console.log(`Loaded ${priorData.patterns.length} prior patterns`);
}
```

**3. Store coverage analysis results:**
```bash
aqe memory store \
  --key "aqe/coverage/auth-module" \
  --namespace "aqe/coverage" \
  --value '{...}' \
  --json
```

### Three-Phase Memory Protocol

For coordinated multi-agent tasks, use the STATUS → PROGRESS → COMPLETE pattern:

```bash
// PHASE 1: STATUS - Task starting
aqe memory store \
  --key "aqe/coordination/task-123/status" \
  --namespace "aqe/coordination" \
  --value '{...}' \
  --json

// PHASE 2: PROGRESS - Intermediate updates
aqe memory store \
  --key "aqe/coordination/task-123/progress" \
  --namespace "aqe/coordination" \
  --value '{...}' \
  --json

// PHASE 3: COMPLETE - Task finished
aqe memory store \
  --key "aqe/coordination/task-123/complete" \
  --namespace "aqe/coordination" \
  --value '{...}' \
  --json
```

### Blackboard Events
| Event | Trigger | Subscribers |
|-------|---------|-------------|
| `test:generated` | New tests created | executor, coverage |
| `coverage:gap` | Gap detected | test-architect |
| `quality:decision` | Gate evaluated | fleet-commander |
| `security:finding` | Vulnerability found | quality-gate |

### Example: PR Quality Pipeline
```typescript
// 1. Risk analysis
const risks = await Task("Analyze PR", prDiff, "qe-regression-analyzer");

// 2. Generate tests for risks
const tests = await Task("Generate tests", risks, "qe-test-architect");

// 3. Execute + analyze
const results = await Task("Run tests", tests, "qe-parallel-executor");
const coverage = await Task("Check coverage", results, "qe-coverage-specialist");

// 4. Quality decision
const decision = await Task("Evaluate", {results, coverage}, "qe-quality-gate");
// → GO/NO-GO with rationale
```

---

## Implementation Phases

Advance on evidence, not on the calendar. Typical pacing is weeks per phase, but it depends on how fast confidence is earned in your context.

| Phase | Move on when | Goal | Agent(s) |
|-------|--------------|------|----------|
| Experiment | The agent's output survives review on real PRs | Validate one use case | 1 agent |
| Integrate | CI results are stable and findings hold up | CI/CD pipeline | 3-4 agents |
| Scale | Each new use case shows measured value | Multiple use cases | 8+ agents |
| Evolve | Ongoing | Continuous learning | Full fleet |

### Phase 1 Example
```bash
# Start: deploy a single agent
aqe agent spawn qe-test-architect

# Then: generate tests for a handful of real PRs
# Track: bugs found, test quality, review time, claims that failed verification

# Measure impact against your pre-agent baseline
aqe agent metrics qe-test-architect
# → Compare tests, bugs found and review time with the baseline; keep what the data supports
```

---

## Limitations & Strengths

### Agents Excel At
- **Volume**: Scan thousands of logs in seconds
- **Patterns**: Find correlations humans miss
- **Tireless**: 24/7 testing and monitoring
- **Speed**: Instant code change analysis

### Agents Need Humans For
- Business context and priorities
- Ethical judgment and trade-offs
- Creative exploration ("what if" scenarios)
- Domain expertise (healthcare, finance, legal)

---

## Best Practices

| Do | Don't |
|----|-------|
| Start with one agent, one use case | Deploy the whole fleet at once |
| Build feedback loops early | Deploy and forget |
| Human reviews agent output | Auto-merge without review |
| Measure bugs caught, time saved | Track vanity metrics (test count) |
| Earn autonomy with measured confidence | Give full autonomy immediately |

### Autonomy Progression (gated by evidence)
```
Stage 1: Agent suggests → Human decides
Stage 2: Agent acts → Human reviews after      (when its suggestions consistently survive review)
Stage 3: Agent autonomous on low-risk work     (when post-hoc reviews stop finding real problems)
Stage 4: Agent handles critical with oversight (when the low-risk record and its disclosures hold up)
```

---

## Agent Coordination Hints

```yaml
coordination:
  topology: hierarchical
  commander: qe-fleet-commander
  memory_namespace: aqe/coordination
  blackboard_topic: qe-fleet

preload_skills:
  - agentic-quality-engineering  # Always (this skill)
  - risk-based-testing           # For prioritization
  - quality-metrics              # For measurement

agent_assignments:
  qe-test-architect: [api-testing-patterns, tdd-london-chicago]
  qe-coverage-specialist: [quality-metrics, risk-based-testing]
  qe-security-scanner: [security-testing, risk-based-testing]
  qe-performance-tester: [performance-testing]
```

---

## Related Skills
- `holistic-testing-pact` - PACTS principles deep dive
- `risk-based-testing` - Prioritize agent focus
- `quality-metrics` - Measure agent effectiveness
- `api-testing-patterns`, `security-testing`, `performance-testing` - Specialized testing

## Resources
- Agent definitions: `.claude/agents/`
- CLI: `aqe agent --help`
- Fleet status: `aqe fleet status`

---

**Success Metric:** Ship more often with the same or better quality through agent collaboration, and be able to show the evidence for both.
