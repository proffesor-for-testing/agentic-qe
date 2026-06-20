---
inclusion: auto
name: qe-holistic-testing-pact
description: "Apply the Holistic Testing Model evolved with PACTS (Proactive, Autonomous, Collaborative, Targeted, Structured) principles. Use when designing comprehensive test strategies for Classical, AI-assisted, Agent based, or Agentic Systems building quality into the team, or implementing whole-team quality practices."
tags: [holistic, pacts, quality, whole-team, proactive, autonomous, collaborative, targeted, structured]
---

# Holistic Testing Model with PACTS Principles

<default_to_action>
When designing test strategies or building quality into teams:
1. APPLY PACTS principles: Proactive (test before bugs), Autonomous (teams own quality), Collaborative (whole-team responsibility), Targeted (risk-focused), Structured (governance, observability, and explainability of agent behavior)
2. IDENTIFY quadrant focus: Technology-facing (unit, integration, performance) or Business-facing (acceptance, exploratory, usability)
3. SELECT agents based on PACTS dimension and testing quadrant
4. IMPLEMENT feedback loops that catch issues in minutes, not days
5. MEASURE outcomes (bug escape rate, release confidence, agent confidence) not activities (test count)

**Quick PACTS Application:**
- Proactive → Design testability into architecture, risk analysis during refinement
- Autonomous → Devs run tests locally, CI pipeline with no manual gates
- Collaborative → Three Amigos, QE pairs with dev, shared test ownership
- Targeted → Risk-based planning, focus on critical flows, kill valueless tests
- Structured → Governance, observability, and explainability of agent behavior; measure confidence, not trust

**Critical Success Factors:**
- Quality is a whole-team responsibility, not a QA phase
- QA as enablers (build infrastructure, coach), not gatekeepers
- Fast feedback during development, not after
</default_to_action>

## Quick Reference Card

### When to Use
- Designing comprehensive test strategies
- Building quality culture in teams
- Choosing testing approach for new projects
- Evolving from sequential QA to concurrent quality

### PACTS Principles
| Principle | Focus | Anti-Pattern |
|-----------|-------|--------------|
| **Proactive** | Test before code, design testability | Waiting for bugs to find you |
| **Autonomous** | Teams deploy when ready | QA as manual gatekeepers |
| **Collaborative** | Whole-team quality thinking | QA works in isolation |
| **Targeted** | Risk-based, high-value tests | Exhaustive checkbox testing |
| **Structured** | Governance, observability, explainability of agent behavior | Bolting agentic AI onto chaos |

### Holistic Testing Quadrants
| Quadrant | Purpose | Examples |
|----------|---------|----------|
| Tech + Support | Fast feedback | Unit, component, integration tests |
| Tech + Critique | Find limits | Performance, security, chaos |
| Business + Support | Shared understanding | BDD, acceptance tests |
| Business + Critique | Discover unknowns | Exploratory, usability, A/B |

### Agent Selection by PACTS + Quadrant
| PACTS Dimension | Agents |
|----------------|--------|
| Proactive + Tech | qe-test-generator, qe-requirements-validator |
| Autonomous + Tech | qe-test-executor, qe-coverage-analyzer |
| Collaborative | qe-fleet-commander (orchestration) |
| Targeted | qe-regression-risk-analyzer, qe-quality-gate |
| Structured | qe-fleet-commander, qe-quality-gate (governance, observability, explainability) |

---

## PACTS in Practice

### Proactive: Test Before Bugs
```javascript
// During API design, ask: "How will we know if this times out under load?"
// Build observability from start
await Task("Risk Analysis", {
  phase: 'refinement',
  question: 'What could go wrong and how will we know?'
}, "qe-requirements-validator");
```

### Autonomous: Teams Own Quality
- Developers run full test suite locally
- CI fails fast with clear diagnostics
- No manual deployment approvals
- Self-service test environments

### Collaborative: Whole-Team Thinking
- QE attends planning and refinement
- Three Amigos for every user story
- Shared ownership of test code
- Ensemble testing for complex scenarios

### Targeted: Test What Matters
```javascript
// E-commerce checkout? Test thoroughly.
// Admin panel used twice a month? Lighter touch.
await Task("Risk-Based Planning", {
  critical: ['checkout', 'payment'],
  light: ['admin-panel', 'settings']
}, "qe-regression-risk-analyzer");
```

### Structured: Governance, Observability, Explainability
The 5th principle for agentic systems. As agents take on quality work, you need
governance (boundaries and guardrails), observability (what agents did and why),
and explainability (decisions you can audit). Especially important in regulated
industries.

- We measure **CONFIDENCE, not trust** — trust is a human feeling; confidence can
  be mathematically explained.
- Ships with a playbook + readiness-assessment guide.
- Anti-pattern: bolting agentic AI onto chaos. Structure first, then automate.

```javascript
// Make agent behavior auditable and explainable, not a black box
await Task("Agent Governance Review", {
  guardrails: ['scope-boundaries', 'approval-gates'],
  observability: ['decision-traces', 'confidence-scores'],
  explainability: 'every-decision-auditable'
}, "qe-fleet-commander");
```

---

## From PACT to PACTS

PACT originated with Reuven Cohen (Agentics Foundation) and was adapted to quality
engineering by Dragan Spiridonov. PACTS adds a fifth principle — **Structured** —
inspired by DORA's research on AI-assisted delivery and platform-engineering
quality measurement. The addition reflects that autonomous, agentic quality work
needs governance, observability, and explainability to be trustworthy at scale.

---

## Evolution from Traditional

| Old Way (Sequential) | Holistic + PACTS (Concurrent) |
|---------------------|------------------------------|
| Dev writes → QA tests → bugs found → fixes | Team discusses what to build and how to test |
| Slow feedback, finger-pointing | Fast feedback, shared ownership |
| Quality as gatekeeping | Quality as enabler |
| QA on critical path | QA builds infrastructure, coaches |

---

## Success Signals

- Features deploy multiple times per day
- Bug escape rate trending down
- Team discusses quality naturally
- Developers write tests without being told
- Releases are boring (in a good way)

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/holistic-testing/
├── pacts-assessment/*    - PACTS maturity analysis
├── quadrant-coverage/*   - Coverage per quadrant
├── team-metrics/*        - Quality ownership metrics
└── feedback-loops/*      - Cycle time data
```

### Fleet Coordination
```typescript
const holisticFleet = await FleetManager.coordinate({
  strategy: 'holistic-testing',
  pacts: { proactive: true, autonomous: true, collaborative: true, targeted: true, structured: true },
  agents: [
    'qe-fleet-commander',       // Orchestration
    'qe-test-generator',        // Tech quadrant
    'qe-requirements-validator', // Business quadrant
    'qe-quality-analyzer'       // Metrics
  ],
  topology: 'mesh'
});
```

---

## Related Skills
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent coordination
- [context-driven-testing](../context-driven-testing/) - Adapt to context
- [shift-left-testing](../shift-left-testing/) - Proactive testing
- [risk-based-testing](../risk-based-testing/) - Targeted testing

---

## Remember

**PACTS = Proactive + Autonomous + Collaborative + Targeted + Structured**

Quality is built in, not tested in. Teams own quality. QA enables, doesn't gate. Test what matters, skip what doesn't. Govern agent behavior with observability and explainability — measure confidence, not trust. Measure outcomes, not activities.

**With Agents:** Agents analyze PACTS maturity, recommend quadrant coverage, and coordinate whole-team quality. Use agents to scale holistic thinking while maintaining human judgment.
