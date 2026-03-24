---
name: "consultancy-practices"
description: "Apply software quality consultancy practices: assess codebases, advise clients, run ROI analysis, and establish engagement workflows. Use when consulting on quality strategy or advising teams."
---

# Consultancy Practices

Practical patterns for quality engineering consultancy: discovery, assessment, transformation, and knowledge transfer.

## Engagement Workflow

1. **Listen first** -- understand context before prescribing solutions
2. **Discover** -- identify pain points, past attempts, constraints
3. **Prioritize** -- impact/effort matrix, high-impact low-effort first
4. **Transfer knowledge** -- leave them better, not dependent on you
5. **Measure** -- define success metrics upfront, track weekly

## Engagement Types

| Type | Duration | Focus |
|------|----------|-------|
| Assessment | 1-4 weeks | Discover, analyze, recommend |
| Transformation | 3-12 months | Implement new practices |
| Advisory | Ongoing | Strategic guidance, course-correct |
| Crisis | 1-4 weeks | Fix critical production blockers |

## Discovery Questions

- "Walk me through your last deployment"
- "Tell me about a recent bug that escaped to production"
- "If you could fix one thing, what would it be?"

## Common Patterns

### "We Need Test Automation"

**What they mean:** Manual testing is too slow/expensive.

**Typical Finding:** They need faster feedback, not "automation."

**Recommendation:**
1. Unit tests for new code (TDD)
2. Smoke tests for critical paths
3. Keep exploratory for discovery
4. Build automation incrementally

### "Fix Our Quality Problem"

**What they mean:** Something is broken but they don't know what.

**Typical Finding:** No test strategy, testing too late, poor feedback loops.

**Recommendation:**
1. Shift testing left
2. Improve coverage on critical paths
3. Speed up CI/CD feedback
4. Better requirements/acceptance criteria

### "We Want to Scale Quality"

**What they mean:** Can't hire enough QA fast enough.

**Typical Finding:** QA is bottleneck -- manual regression, gatekeeping.

**Recommendation:**
1. Make QA strategic, not tactical
2. Developers own test automation
3. QA focuses on exploratory and risk analysis
4. Use agentic approaches for scale

## Handling Resistance

| Client Says | Response |
|-------------|----------|
| "We already tried that" | "Tell me what you tried and what didn't work" |
| "Our context is special" | "Help me understand what makes yours special" |
| "We don't have budget/time" | "What's the cost of not fixing this? Let's start small" |
| "That won't work here" | "What specific constraints? Let's adapt" |

## Agent-Driven Assessment

```typescript
// Automated codebase assessment
const assessment = await Task("Assess Codebase", {
  scope: 'client-project/',
  depth: 'comprehensive',
  reportFormat: 'executive-summary'
}, "qe-quality-analyzer");
// Returns: { qualityScore, testCoverage, technicalDebt, recommendations }

// ROI analysis for quality initiatives
const roi = await Task("Calculate ROI", {
  currentState: { defectEscapeRate: 0.15, mttr: 48 },
  proposedImprovements: ['test-automation', 'ci-cd-pipeline'],
  timeframe: '6-months'
}, "qe-quality-analyzer");
// Returns: { estimatedCost, estimatedSavings, paybackPeriod }
```

## Related Skills

- [quality-metrics](../quality-metrics/) -- Metrics for client reporting
- [risk-based-testing](../risk-based-testing/) -- Client risk assessment
- [holistic-testing-pact](../holistic-testing-pact/) -- Comprehensive strategy
