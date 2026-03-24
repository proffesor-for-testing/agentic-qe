---
name: "risk-based-testing"
description: "Assess risk per component, prioritize testing effort by impact and probability, allocate coverage by risk score. Use when planning test strategy, allocating resources, or justifying coverage decisions."
---

# Risk-Based Testing

<default_to_action>
When planning tests or allocating testing resources:
1. IDENTIFY risks per component (use 1-5 scale for probability and impact)
2. PRIORITIZE: Critical (20+) → High (12-19) → Medium (6-11) → Low (1-5)
3. ALLOCATE effort: 60% critical, 25% high, 10% medium, 5% low
4. REASSESS continuously: Production incidents raise risk; stable code lowers it
</default_to_action>

## Quick Reference Card

### When to Use
- Planning sprint/release test strategy
- Deciding what to automate first
- Allocating limited testing time
- Justifying test coverage decisions

### Effort Allocation by Risk Score
| Score | Priority | Effort | Action |
|-------|----------|--------|--------|
| 20-25 | Critical | 60% | Comprehensive testing, multiple techniques |
| 12-19 | High | 25% | Thorough testing, automation priority |
| 6-11 | Medium | 10% | Standard testing, basic automation |
| 1-5 | Low | 5% | Smoke test, exploratory only |

---

## Apply Test Depth by Risk
```typescript
await Task("Risk-Based Test Generation", {
  critical: {
    features: ['checkout', 'payment'],
    depth: 'comprehensive',
    techniques: ['unit', 'integration', 'e2e', 'performance', 'security']
  },
  high: {
    features: ['auth', 'user-profile'],
    depth: 'thorough',
    techniques: ['unit', 'integration', 'e2e']
  },
  medium: {
    features: ['search', 'notifications'],
    depth: 'standard',
    techniques: ['unit', 'integration']
  },
  low: {
    features: ['admin-panel', 'settings'],
    depth: 'smoke',
    techniques: ['smoke-tests']
  }
}, "qe-test-generator");
```

### Step 3: Reassess Dynamically
```typescript
// Production incident increases risk
await Task("Update Risk Score", {
  feature: 'search',
  event: 'production-incident',
  previousRisk: 9,
  newProbability: 5,  // Increased due to incident
  newRisk: 15         // Now HIGH priority
}, "qe-regression-risk-analyzer");
```

---

## ML-Enhanced Risk Analysis

```typescript
// Agent predicts risk using historical data
const riskAnalysis = await Task("ML Risk Analysis", {
  codeChanges: changedFiles,
  historicalBugs: bugDatabase,
  prediction: {
    model: 'gradient-boosting',
    factors: ['complexity', 'change-frequency', 'author-experience', 'file-age']
  }
}, "qe-regression-risk-analyzer");

// Output: 95% accuracy risk prediction per file
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/risk-based/
├── risk-scores/*        - Current risk assessments
├── historical-bugs/*    - Bug patterns by area
├── production-data/*    - Incident data for risk
└── coverage-map/*       - Test depth by risk level
```

### Fleet Coordination
```typescript
const riskFleet = await FleetManager.coordinate({
  strategy: 'risk-based-testing',
  agents: [
    'qe-regression-risk-analyzer',  // Risk scoring
    'qe-test-generator',            // Risk-appropriate tests
    'qe-production-intelligence',   // Production feedback
    'qe-quality-gate'               // Risk-based gates
  ],
  topology: 'sequential'
});
```

---

## Integration with CI/CD

```yaml
# Risk-based test selection in pipeline
- name: Risk Analysis
  run: aqe risk-analyze --changes ${{ github.event.pull_request.files }}

- name: Run Critical Tests
  if: risk.critical > 0
  run: npm run test:critical

- name: Run High Tests
  if: risk.high > 0
  run: npm run test:high

- name: Skip Low Risk
  if: risk.low_only
  run: npm run test:smoke
```

---

## Related Skills
- [agentic-quality-engineering](../agentic-quality-engineering/) - Risk-aware agents
- [context-driven-testing](../context-driven-testing/) - Context affects risk
- [regression-testing](../regression-testing/) - Risk-based regression selection
- [shift-right-testing](../shift-right-testing/) - Production informs risk

---

## Skill Composition

- **Context analysis** — Use `/context-driven-testing` for context-aware risk assessment
- **Coverage gaps** — Use `/qe-coverage-analysis` to validate risk-based coverage targets
- **Production data** — Use `/shift-right-testing` to feed production incidents into risk scores
