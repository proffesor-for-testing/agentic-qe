---
name: qcsd-ideation-swarm
description: "QCSD Ideation phase swarm for Quality Criteria sessions using HTSM v6.3, Risk Storming, and Testability analysis before development begins."
category: qcsd-phases
priority: critical
tokenEstimate: 2200
agents: [qe-quality-criteria-recommender, qe-risk-assessor, qe-requirements-validator, qe-accessibility-auditor, qe-security-auditor, qe-qx-partner]
implementation_status: implemented
optimization_version: 1.0
last_optimized: 2026-01-25
dependencies: [testability-scoring, risk-based-testing, context-driven-testing, holistic-testing-pact]
quick_reference_card: true
tags: [qcsd, ideation, htsm, quality-criteria, risk-storming, testability, enable-engage, pi-planning]
---

# QCSD Ideation Swarm

<default_to_action>
When running Quality Criteria sessions, PI Planning, or Ideation phase analysis:

1. **INITIALIZE** fleet with ideation domains:
```javascript
mcp__aqe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["requirements-validation", "coverage-analysis", "security-compliance"],
  maxAgents: 6
})
```

2. **SPAWN** parallel agents for comprehensive analysis:
```javascript
// Run in parallel via Task tool
Task("HTSM Quality Criteria", epicContent, "qe-quality-criteria-recommender")
Task("Risk Assessment", epicContent, "qe-risk-assessor")
Task("Requirements Validation", acceptanceCriteria, "qe-requirements-validator")
```

3. **INVOKE** testability-scoring skill:
```bash
/testability-scoring <design-doc-or-epic>
```

4. **AGGREGATE** results into Ideation Report with evidence-based recommendations

5. **STORE** learnings for future sprints:
```javascript
mcp__aqe__memory_store({
  key: "aqe/qcsd/ideation/epic-{id}",
  namespace: "aqe/qcsd/ideation",
  value: { htsmScores, riskMatrix, testabilityScore },
  persist: true
})
```

**Quick Commands:**
- Full ideation swarm: `/qcsd-ideation-swarm "Epic: <description>"`
- Quality criteria only: `Task("HTSM", epic, "qe-quality-criteria-recommender")`
- Risk storming only: `Task("Risk", epic, "qe-risk-assessor")`

**HTSM Quality Categories (Never Omit):**
| Category | Question | Can Omit? |
|----------|----------|-----------|
| Capability | Can it perform required functions? | Never |
| Reliability | Will it resist failure? | Never |
| Security | How protected against threats? | Never |
| Performance | How speedy and responsive? | Never |
| Development | How well can we test/modify? | Never |
</default_to_action>

## Quick Reference Card

### When to Use
- PI Planning sessions (before sprint commitment)
- Quality Criteria sessions (QCSD Enable & Engage)
- Epic/Feature kickoff meetings
- Risk Storming workshops
- Design reviews with QE + UX pairing
- Before development begins on any significant feature

### QCSD Phase Mapping
```
ENABLE & ENGAGE → IDEATION SWARM (this skill)
    │
    ├── Quality Criteria Session (HTSM v6.3)
    ├── Risk Storming
    ├── Testing the Design
    └── QX Sessions (QE + UX)
```

### Agent-to-Activity Matrix

| Agent | Activity | Priority | Output |
|-------|----------|----------|--------|
| `qe-quality-criteria-recommender` | HTSM v6.3 Analysis | P0 | 10 Quality Category Scores |
| `qe-risk-assessor` | Risk Storming | P0 | Risk Matrix (likelihood × impact) |
| `qe-requirements-validator` | AC Validation | P1 | Completeness/Testability Report |
| `qe-accessibility-auditor` | Early A11y Review | P1 | WCAG Compliance Gaps |
| `qe-security-auditor` | Threat Modeling | P1 | Security Risk Findings |
| `qe-qx-partner` | QE + UX Pairing | P2 | Quality Experience Assessment |

### Quality Gate Thresholds (Ideation Exit)

| Metric | Minimum | Target | Blocker |
|--------|---------|--------|---------|
| HTSM Coverage | 8/10 categories | 10/10 | <6 categories |
| Testability Score | 60% | 80%+ | <40% |
| Risk Items Identified | 5+ | 10+ | 0 (not analyzed) |
| AC Completeness | 70% | 90%+ | <50% |
| Security Risks Documented | All critical | All high+ | None documented |

---

## HTSM v6.3 Quality Criteria Framework

James Bach's Heuristic Test Strategy Model provides 10 quality categories for comprehensive analysis:

### The 10 Quality Categories

| # | Category | Focus Question | Evidence Types |
|---|----------|---------------|----------------|
| 1 | **Capability** | Can it perform all required functions? | Direct (code), Inferred (design) |
| 2 | **Reliability** | Will it work without failure under expected conditions? | Direct (tests), Claimed (docs) |
| 3 | **Usability** | How easy is it for real users to accomplish tasks? | Inferred (UX review) |
| 4 | **Charisma** | How appealing and engaging is the experience? | Inferred (design) |
| 5 | **Security** | How well protected against unauthorized use? | Direct (scan), Inferred (arch) |
| 6 | **Scalability** | How well does it handle growth in users/data? | Claimed (arch), Inferred |
| 7 | **Compatibility** | Does it work with external systems/browsers? | Direct (matrix), Claimed |
| 8 | **Performance** | How fast and responsive under load? | Direct (benchmarks) |
| 9 | **Installability** | How easily deployed/configured? | Claimed (runbook) |
| 10 | **Development** | How well can we create, test, and modify it? | Direct (code), Inferred |

### Evidence Classification

| Type | Definition | Confidence |
|------|------------|------------|
| **Direct** | Actual code/doc quote with `file:line` reference | High |
| **Inferred** | Logical deduction with reasoning chain | Medium |
| **Claimed** | Stated but requires verification | Low |

### Category Omission Rules

| Category | Can Omit? | Condition |
|----------|-----------|-----------|
| Capability | **Never** | Core functionality |
| Reliability | **Never** | System stability |
| Usability | Rarely | Backend-only services |
| Charisma | With evidence | Internal tools only |
| Security | **Never** | Any data handling |
| Scalability | Rarely | Fixed-scale systems |
| Compatibility | With evidence | Single-platform only |
| Performance | **Never** | User-facing systems |
| Installability | SaaS only | Managed platforms |
| Development | **Never** | All software |

---

## Swarm Coordination Flow

### Ideation Swarm Architecture

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
│  │  - Testability Score (10 principles)                  │  │
│  │  - Risk Assessment (likelihood × impact)              │  │
│  │  - Requirements Validation (gaps + recommendations)   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Execution Sequence

```
1. PARALLEL: Quality Criteria + Risk Assessment
   ├── qe-quality-criteria-recommender → HTSM scores
   └── qe-risk-assessor → Risk matrix

2. SEQUENTIAL: Validation (depends on step 1)
   └── qe-requirements-validator → AC completeness

3. PARALLEL: Specialized Support (if needed)
   ├── qe-accessibility-auditor → A11y gaps (UI features)
   ├── qe-security-auditor → Threat model (data features)
   └── qe-qx-partner → QX assessment (UX features)

4. AGGREGATE: Compile Ideation Report
```

---

## MCP Integration

### Full Ideation Swarm Orchestration

```javascript
// Step 1: Initialize fleet
mcp__aqe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["requirements-validation", "coverage-analysis", "security-compliance"],
  maxAgents: 6
})

// Step 2: Orchestrate ideation assessment (uses task-orchestrate handler)
mcp__aqe__task_orchestrate({
  task: {
    type: "qcsd-ideation",
    strategy: "parallel",
    priority: "high"
  },
  context: {
    useBlackboard: true,
    blackboardKey: "aqe/qcsd/ideation/epic-E2"
  },
  payload: {
    epicId: "E2",
    epicName: "Progressive Enhancement & Core Web Vitals",
    epicPriority: "HIGH",
    acceptanceCriteria: [
      "Homepage renders meaningful content without JavaScript",
      "LCP < 2.5 seconds on 4G connections",
      "FID < 100ms / INP < 200ms",
      "CLS < 0.1"
    ],
    userStories: [
      "US1: As a user on slow mobile, I can see homepage within 3 seconds",
      "US2: As a user with JS disabled, I can browse categories"
    ]
  }
})
// Returns orchestration with 8 workflow steps:
// 1. analyze-product-factors, 2. assess-quality-criteria, 3. assess-risks,
// 4. accessibility-audit, 5. security-audit, 6. generate-htsm-report,
// 7. prioritize-criteria, 8. generate-test-strategy

// Step 3: Store results for future reference
mcp__aqe__memory_store({
  key: "aqe/qcsd/ideation/epic-E2",
  namespace: "aqe/qcsd/ideation",
  value: {
    epicId: "E2",
    htsmScores: { capability: 85, reliability: 70, performance: 60 },
    testabilityScore: 72,
    riskMatrix: [
      { risk: "SSR migration breaks features", likelihood: "medium", impact: "high" }
    ],
    recommendations: ["Add progressive enhancement tests", "Performance baseline required"]
  },
  persist: true,
  ttl: 2592000  // 30 days
})
```

### Individual Agent Invocations

```javascript
// HTSM Quality Criteria Analysis
Task("Run HTSM v6.3 Quality Criteria analysis", `
  Analyze Epic: ${epicDescription}

  For each of the 10 HTSM categories:
  1. Score relevance (1-5)
  2. Identify evidence (Direct/Inferred/Claimed)
  3. List quality risks
  4. Recommend test focus areas

  Output: Quality Criteria Report with evidence references
`, "qe-quality-criteria-recommender")

// Risk Assessment
Task("Perform Risk Storming analysis", `
  Analyze Epic: ${epicDescription}

  Identify risks using:
  1. Technical risks (architecture, dependencies)
  2. Business risks (compliance, deadlines)
  3. Quality risks (testability, coverage)

  Output: Risk Matrix (likelihood × impact) with mitigation strategies
`, "qe-risk-assessor")

// Requirements Validation
Task("Validate acceptance criteria completeness", `
  Acceptance Criteria: ${acceptanceCriteria}

  Check for:
  1. Testability (can we write automated tests?)
  2. Completeness (edge cases covered?)
  3. Clarity (unambiguous language?)
  4. Measurability (quantifiable success criteria?)

  Output: AC Validation Report with improvement suggestions
`, "qe-requirements-validator")
```

---

## Agent Coordination Hints

```yaml
coordination:
  topology: hierarchical
  commander: qe-fleet-commander
  phase: ideation
  memory_namespace: aqe/qcsd/ideation
  blackboard_topic: qcsd-ideation

preload_skills:
  - qcsd-ideation-swarm      # This skill
  - testability-scoring       # For testability analysis
  - risk-based-testing        # For risk prioritization
  - context-driven-testing    # For context adaptation

agent_assignments:
  qe-quality-criteria-recommender: [testability-scoring, holistic-testing-pact]
  qe-risk-assessor: [risk-based-testing, context-driven-testing]
  qe-requirements-validator: [context-driven-testing]
  qe-accessibility-auditor: [accessibility-testing]
  qe-security-auditor: [security-testing]
  qe-qx-partner: [context-driven-testing, holistic-testing-pact]
```

### Memory Namespaces

```
aqe/qcsd/ideation/*           - Ideation phase artifacts
aqe/qcsd/ideation/epic-{id}   - Per-epic analysis results
aqe/qcsd/ideation/risks/*     - Risk assessments
aqe/qcsd/ideation/htsm/*      - HTSM quality criteria scores
aqe/qcsd/learning/ideation/*  - Patterns learned from ideation
```

### Blackboard Events

| Event | Trigger | Subscribers |
|-------|---------|-------------|
| `ideation:started` | Swarm initialized | All ideation agents |
| `htsm:complete` | Quality criteria analyzed | risk-assessor, requirements-validator |
| `risk:identified` | New risk found | quality-criteria-recommender |
| `validation:complete` | AC validated | Fleet commander |
| `ideation:report` | All analysis complete | User, memory store |

### Three-Phase Memory Protocol

```javascript
// PHASE 1: STATUS - Ideation starting
mcp__aqe__memory_store({
  key: "aqe/qcsd/ideation/epic-E2/status",
  namespace: "aqe/qcsd/ideation",
  value: { status: "running", phase: "ideation", startTime: Date.now() },
  persist: true
})

// PHASE 2: PROGRESS - Intermediate updates
mcp__aqe__memory_store({
  key: "aqe/qcsd/ideation/epic-E2/progress",
  namespace: "aqe/qcsd/ideation",
  value: {
    htsmComplete: true,
    riskComplete: false,
    categoriesAnalyzed: 10
  },
  persist: true
})

// PHASE 3: COMPLETE - Ideation finished
mcp__aqe__memory_store({
  key: "aqe/qcsd/ideation/epic-E2/complete",
  namespace: "aqe/qcsd/ideation",
  value: {
    status: "complete",
    htsmScore: 78,
    testabilityScore: 72,
    risksIdentified: 8,
    recommendations: 12,
    duration: 45000
  },
  persist: true
})
```

---

## Output: Ideation Report Template

The Ideation Swarm produces a structured report:

```markdown
# Ideation Report: [Epic Name]

## Executive Summary
- **Overall Quality Readiness:** [Score]%
- **Testability Score:** [Score]%
- **Risk Level:** [Low/Medium/High/Critical]
- **Recommendation:** [GO/CONDITIONAL/NO-GO]

## HTSM Quality Criteria (10 Categories)

| Category | Score | Evidence | Key Risks | Test Focus |
|----------|-------|----------|-----------|------------|
| Capability | 85% | Direct | ... | ... |
| Reliability | 70% | Inferred | ... | ... |
| ... | ... | ... | ... | ... |

## Risk Matrix

| Risk | Likelihood | Impact | Score | Mitigation |
|------|------------|--------|-------|------------|
| SSR breaks features | Medium | High | 6 | Feature flags, phased rollout |
| ... | ... | ... | ... | ... |

## Testability Assessment

| Principle | Score | Gap | Recommendation |
|-----------|-------|-----|----------------|
| Observability | 3/5 | Logging gaps | Add structured logging |
| ... | ... | ... | ... |

## Acceptance Criteria Validation

| AC | Testable? | Complete? | Issues |
|----|-----------|-----------|--------|
| AC1 | Yes | Yes | - |
| AC2 | Partial | No | Missing edge cases |

## Recommendations
1. [Priority 1 recommendation]
2. [Priority 2 recommendation]
...

## Next Steps
- [ ] Address critical risks before sprint commitment
- [ ] Refine incomplete acceptance criteria
- [ ] Schedule testability improvement session
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| HTSM scores all low | Insufficient epic detail | Request more requirements context |
| No risks identified | Analysis too shallow | Run deeper threat modeling with security-auditor |
| Testability score < 40% | Design not testable | Invoke testability improvement session |
| Agents not coordinating | Memory namespace mismatch | Check `aqe/qcsd/ideation/*` namespace |
| Report incomplete | Agent timeout | Increase timeout, reduce parallel agents |
| Evidence all "Claimed" | No code/docs provided | Request design documents, architecture diagrams |

---

## Integration with QCSD Flow

### Upstream (Before Ideation)
- Product backlog refinement
- Epic definition
- Initial requirements gathering

### Downstream (After Ideation)
- `/qcsd-grooming-swarm` - SFDIPOT + BDD for user stories
- Sprint planning with quality-informed estimates
- Development with testability built-in

### Feedback Loops

```
Production Issues → qe-defect-predictor → qe-learning-coordinator
                                              │
                                              ▼
                              qe-risk-assessor (improved risk models)
                                              │
                                              ▼
                              IDEATION SWARM (better predictions)
```

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `testability-scoring` | Invoked for testability analysis (10 principles) |
| `risk-based-testing` | Informs risk prioritization approach |
| `context-driven-testing` | Adapts analysis to project context |
| `holistic-testing-pact` | PACT principles guide agent behavior |
| `qcsd-grooming-swarm` | Next phase after ideation |
| `accessibility-testing` | Deep-dive for UI features |
| `security-testing` | Deep-dive for security-sensitive features |

---

## CLI Usage

```bash
# Full ideation swarm on an epic
claude "/qcsd-ideation-swarm Epic 2: Progressive Enhancement & Core Web Vitals from /path/to/roadmap.pdf"

# With specific acceptance criteria
claude "/qcsd-ideation-swarm 'Feature: User Authentication' --ac 'Users can login with SSO' --ac 'Session expires after 30 min'"

# Quality criteria only
claude "Run HTSM Quality Criteria analysis on Epic 2"

# Risk storming only
claude "Perform Risk Storming on the Progressive Enhancement epic"
```

---

## Remember

**Ideation Swarm answers THREE questions before development:**

1. **What quality risks exist?** (HTSM Quality Criteria)
2. **How testable is this design?** (Testability Score)
3. **What could go wrong?** (Risk Matrix)

**Key Principle:** Quality is built in from the start, not tested in at the end.

**Success Metric:** Zero "surprise" quality issues in development that could have been identified in ideation.

---

**QCSD Phase:** Enable & Engage → Ideation
**Next Phase:** `/qcsd-grooming-swarm` for story-level analysis
