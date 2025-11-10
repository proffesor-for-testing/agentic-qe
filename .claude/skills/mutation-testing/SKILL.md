---
name: mutation-testing
description: Test quality validation through mutation testing, assessing test suite effectiveness by introducing code mutations and measuring kill rate. Use when evaluating test quality, identifying weak tests, or proving tests actually catch bugs.
---

# Mutation Testing

## Core Principle

**Tests test code. But who tests the tests?**

Mutation testing validates test quality by introducing small code changes (mutations) and verifying tests catch them. High mutation score = effective tests.

## What is Mutation Testing?

**Process:**
1. Mutate code (change + to -, < to <=, remove if statements)
2. Run tests against mutated code
3. If tests fail → Mutation "killed" ✅ (good)
4. If tests pass → Mutation "survived" ❌ (weak tests)

**Mutation Score = Killed / (Killed + Survived)**

**Example:**
```javascript
// Original code
function isAdult(age) {
  return age >= 18; // ← Mutation: Change >= to >
}

// Test
test('18 is adult', () => {
  expect(isAdult(18)).toBe(true); // Catches mutation!
});
```

**If test was weak:**
```javascript
test('19 is adult', () => {
  expect(isAdult(19)).toBe(true); // Doesn't catch >= vs >
});
// Mutation survives → Test needs improvement
```

## Mutation Operators

**Arithmetic:** `+ → -`, `* → /`
**Relational:** `< → <=`, `== → !=`
**Logical:** `&& → ||`, `! removed`
**Conditional:** `if (x) → if (true)`, `if (x) → if (false)`
**Statement:** Remove return, remove function call

## Using Stryker

**Install:**
```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner
npx stryker init
```

**Configuration:**
```javascript
// stryker.conf.json
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

## With Agents

```typescript
// qe-test-generator uses mutation testing
const mutationAnalysis = await agent.analyzeMutations({
  targetFile: 'src/payment.ts',
  generateMissingTests: true
});

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
```

## Remember

**High code coverage ≠ good tests**

- 100% coverage but weak assertions = useless
- Mutation testing proves tests work

**With Agents:** Mutation testing handler automatically runs mutations, identifies weak tests, and generates missing test cases to kill surviving mutations.
