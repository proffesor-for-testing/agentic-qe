---
name: shift-left-testing
description: "Move testing activities earlier in the development lifecycle to catch defects when they're cheapest to fix. Use when implementing TDD, CI/CD, or early quality practices."
category: testing-methodologies
priority: high
tokenEstimate: 900
agents: [qe-test-generator, qe-requirements-validator, qe-regression-risk-analyzer]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [shift-left, early-testing, tdd, bdd, ci-cd, prevention]
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/shift-left-testing.yaml
---

# Shift-Left Testing

<default_to_action>
When implementing early testing practices:
1. VALIDATE requirements before coding (testability, BDD scenarios)
2. WRITE tests before implementation (TDD)
3. AUTOMATE in CI pipeline (every commit triggers tests)
4. FIX defects immediately - never let them accumulate

**Quick Shift-Left Levels:**
- Level 1: Unit tests with each PR (developer responsibility)
- Level 2: TDD practice (tests before code)
- Level 3: BDD/Example mapping in refinement (requirements testing)
- Level 4: Risk analysis in design (architecture testing)
</default_to_action>

## Quick Reference Card

### When to Use
- Reducing cost of defects
- Implementing CI/CD pipelines
- Starting TDD practice
- Improving requirements quality

### Shift-Left Levels
| Level | Practice | When |
|-------|----------|------|
| 1 | Unit tests in PR | Before merge |
| 2 | TDD | Before implementation |
| 3 | BDD/Example Mapping | During refinement |
| 4 | Risk Analysis | During design |

---

## Level 1: Tests in Every PR

```yaml
# CI pipeline - tests run on every commit
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run lint

  quality-gate:
    needs: test
    steps:
      - name: Coverage Check
        run: npx coverage-check --min 80
      - name: No New Warnings
        run: npm run lint -- --max-warnings 0
```

---

## Agent-Assisted Shift-Left

```typescript
// Validate requirements testability
await Task("Requirements Validation", {
  requirements: userStories,
  check: ['INVEST-criteria', 'testability', 'ambiguity'],
  generateBDD: true
}, "qe-requirements-validator");

// Generate tests from requirements
await Task("Generate Tests", {
  source: 'requirements',
  types: ['unit', 'integration', 'e2e'],
  coverage: 'comprehensive'
}, "qe-test-generator");

// Smart test selection for changes
await Task("Select Regression Tests", {
  changedFiles: prFiles,
  algorithm: 'risk-based',
  targetReduction: 0.7  // 70% time savings
}, "qe-regression-risk-analyzer");
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/shift-left/
├── requirements/*       - Validated requirements
├── generated-tests/*    - Auto-generated tests
├── coverage-targets/*   - Coverage goals by component
└── pipeline-results/*   - CI/CD test history
```

### Fleet Coordination
```typescript
const shiftLeftFleet = await FleetManager.coordinate({
  strategy: 'shift-left',
  agents: [
    'qe-requirements-validator',     // Level 3-4
    'qe-test-generator',             // Level 2
    'qe-regression-risk-analyzer'    // Smart selection
  ],
  topology: 'sequential'
});
```

---

## Related Skills
- [tdd-london-chicago](../tdd-london-chicago/) - TDD practices
- [holistic-testing-pact](../holistic-testing-pact/) - Proactive testing
- [cicd-pipeline-qe-orchestrator](../cicd-pipeline-qe-orchestrator/) - Pipeline integration
- [shift-right-testing](../shift-right-testing/) - Production feedback

---

## Remember

**With Agents:** Agents validate requirements testability, generate tests from specs, and select optimal regression suites. Use agents to implement shift-left practices consistently.

## Skill Composition

- **TDD practice** → Use `/tdd-london-chicago` for specific TDD guidance
- **Generate tests** → Use `/qe-test-generation` for AI-powered test generation
- **CI/CD quality** → Use `/cicd-pipeline-qe-orchestrator` for pipeline setup

## Gotchas

- "Shift left" doesn't mean "only test left" — production monitoring (shift right) is still needed
- Agent generates tests before understanding requirements — tests for wrong behavior are worse than no tests
- CI pipeline tests that take >10 minutes kill the feedback loop — keep commit-stage tests under 5 minutes
- TDD discipline degrades when agent writes test+code simultaneously — enforce Red phase separation
- Shifting left without lightweight environments just shifts the bottleneck — fix environments first
