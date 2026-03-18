---
name: mutation-testing
description: "Test quality validation through mutation testing, assessing test suite effectiveness by introducing code mutations and measuring kill rate. Use when evaluating test quality, identifying weak tests, or proving tests actually catch bugs."
category: specialized-testing
priority: high
tokenEstimate: 900
agents: [qe-test-generator, qe-coverage-analyzer, qe-quality-analyzer, qe-mutation-tester]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [mutation, stryker, test-quality, kill-rate, assertions, effectiveness]
# ADR-056 Trust Tier 3 Validation
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/mutation-testing.yaml
---

# Mutation Testing

<default_to_action>
When validating test quality or improving test effectiveness:
1. MUTATE code (change + to -, >= to >, remove statements)
2. RUN tests against each mutant
3. VERIFY tests catch mutations (kill mutants)
4. IDENTIFY surviving mutants (tests need improvement)
5. STRENGTHEN tests to kill surviving mutants

**Quick Mutation Metrics:**
- Mutation Score = Killed / (Killed + Survived)
- Target: > 80% mutation score
- Surviving mutants = weak tests

**Critical Success Factors:**
- High coverage ≠ good tests (100% coverage, 0% assertions)
- Mutation testing proves tests actually catch bugs
- Focus on critical code paths first
</default_to_action>

## Quick Reference Card

### When to Use
- Evaluating test suite quality
- Finding gaps in test assertions
- Proving tests catch bugs
- Before critical releases

### Mutation Score Interpretation
| Score | Interpretation |
|-------|----------------|
| **90%+** | Excellent test quality |
| **80-90%** | Good, minor improvements |
| **60-80%** | Needs attention |
| **< 60%** | Significant gaps |

### Common Mutation Operators
| Category | Original | Mutant |
|----------|----------|--------|
| **Arithmetic** | `a + b` | `a - b` |
| **Relational** | `x >= 18` | `x > 18` |
| **Logical** | `a && b` | `a \|\| b` |
| **Conditional** | `if (x)` | `if (true)` |
| **Statement** | `return x` | *(removed)* |

---

## How Mutation Testing Works

```javascript
// Original code
function isAdult(age) {
  return age >= 18; // ← Mutant: change >= to >
}

// Strong test (catches mutation)
test('18 is adult', () => {
  expect(isAdult(18)).toBe(true); // Kills mutant!
});

// Weak test (mutation survives)
test('19 is adult', () => {
  expect(isAdult(19)).toBe(true); // Doesn't catch >= vs >
});
// Surviving mutant → Test needs boundary value
```

---

## Using Stryker

```bash
# Install
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner

# Initialize
npx stryker init
```

**Configuration:**
```json
{
  "packageManager": "npm",
  "reporters": ["html", "clear-text", "progress"],
  "testRunner": "jest",
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/**/*.ts",
    "!src/**/*.spec.ts"
  ],
  "thresholds": {
    "high": 90,
    "low": 70,
    "break": 60
  }
}
```

**Run:**
```bash
npx stryker run
```

**Output:**
```
Mutation Score: 87.3%
Killed: 124
Survived: 18
No Coverage: 3
Timeout: 1
```

---

## Fixing Surviving Mutants

```javascript
// Surviving mutant: >= changed to >
function calculateDiscount(quantity) {
  if (quantity >= 10) { // Mutant survives!
    return 0.1;
  }
  return 0;
}

// Original weak test
test('large order gets discount', () => {
  expect(calculateDiscount(15)).toBe(0.1); // Doesn't test boundary
});

// Fixed: Add boundary test
test('exactly 10 gets discount', () => {
  expect(calculateDiscount(10)).toBe(0.1); // Kills mutant!
});

test('9 does not get discount', () => {
  expect(calculateDiscount(9)).toBe(0); // Tests below boundary
});
```

---

## Agent-Driven Mutation Testing

```typescript
// Analyze mutation score and generate fixes
await Task("Mutation Analysis", {
  targetFile: 'src/payment.ts',
  generateMissingTests: true,
  minScore: 80
}, "qe-test-generator");

// Returns:
// {
//   mutationScore: 0.65,
//   survivedMutations: [
//     { line: 45, operator: '>=', mutant: '>', killedBy: null }
//   ],
//   generatedTests: [
//     'test for boundary at line 45'
//   ]
// }

// Coverage + mutation correlation
await Task("Coverage Quality Analysis", {
  coverageData: coverageReport,
  mutationData: mutationReport,
  identifyWeakCoverage: true
}, "qe-coverage-analyzer");
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/mutation-testing/
├── mutation-results/*   - Stryker reports
├── surviving/*          - Surviving mutants
├── generated-tests/*    - Tests to kill mutants
└── trends/*             - Mutation score over time
```

### Fleet Coordination
```typescript
const mutationFleet = await FleetManager.coordinate({
  strategy: 'mutation-testing',
  agents: [
    'qe-test-generator',     // Generate tests for survivors
    'qe-coverage-analyzer',  // Coverage correlation
    'qe-quality-analyzer'    // Quality assessment
  ],
  topology: 'sequential'
});
```

---

## Related Skills
- [tdd-london-chicago](../tdd-london-chicago/) - Write effective tests first
- [test-design-techniques](../test-design-techniques/) - Boundary value analysis
- [quality-metrics](../quality-metrics/) - Measure test effectiveness

---

## Remember

**High code coverage ≠ good tests.** 100% coverage but weak assertions = useless. Mutation testing proves tests actually catch bugs.

**Focus on critical paths first.** Don't mutation test everything - prioritize payment, authentication, data integrity code.

**With Agents:** Agents run mutation analysis, identify surviving mutants, and generate missing test cases to kill them. Automated improvement of test quality.

## Run History

After each mutation test run, append results to `run-history.json` in this skill directory:
```bash
node -e "
const fs = require('fs');
const h = JSON.parse(fs.readFileSync('.claude/skills/mutation-testing/run-history.json'));
h.runs.push({date: new Date().toISOString().split('T')[0], mutation_score_pct: SCORE, killed: KILLED, survived: SURVIVED});
fs.writeFileSync('.claude/skills/mutation-testing/run-history.json', JSON.stringify(h, null, 2));
"
```
Read `run-history.json` before each run to track score improvements over time.

## Skill Composition

- **Before mutation testing** → Run `/qe-test-generation` to ensure tests exist
- **After mutation results** → Use `/qe-coverage-analysis` to prioritize improvement areas
- **Quality gate** → Feed results into `/qe-quality-assessment` for ship/no-ship decision

## Gotchas

- Stryker requires `--testRunner jest` explicitly if both jest and vitest are installed
- Mutating `>=` to `>` in date comparisons rarely gets killed — add boundary tests
- Running on files >500 LOC will timeout; use `--mutate` to target specific functions
- `--concurrency` defaults to CPU count which OOMs in containers — set to 2
