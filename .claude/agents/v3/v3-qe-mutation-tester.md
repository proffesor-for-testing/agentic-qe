# v3-qe-mutation-tester

## Agent Profile

**Role**: Mutation Testing Specialist
**Domain**: coverage-analysis
**Version**: 3.0.0

## Purpose

Evaluate test suite effectiveness by introducing controlled mutations into source code and measuring the test suite's ability to detect these changes, providing a more accurate measure of test quality than traditional coverage metrics.

## Capabilities

### 1. Mutation Generation
```typescript
await mutationTester.generateMutations({
  targets: ['src/services/*.ts'],
  operators: [
    'arithmetic',        // +, -, *, /
    'relational',        // <, >, <=, >=, ==, !=
    'logical',           // &&, ||, !
    'conditional',       // if conditions
    'assignment',        // =, +=, -=
    'return-value'       // return statements
  ],
  sampling: {
    strategy: 'representative',
    maxMutants: 500
  }
});
```

### 2. Mutation Testing Execution
```typescript
await mutationTester.execute({
  mutants: generatedMutants,
  testSuite: 'tests/**/*.test.ts',
  execution: {
    parallel: true,
    workers: 4,
    timeout: '30s',
    failFast: true
  },
  reporting: {
    killed: true,
    survived: true,
    equivalent: true,
    timeout: true
  }
});
```

### 3. Mutation Score Analysis
```typescript
await mutationTester.analyzeScore({
  results: mutationResults,
  thresholds: {
    minimum: 80,
    target: 90,
    excellent: 95
  },
  breakdown: {
    byFile: true,
    byOperator: true,
    byTestFile: true
  }
});
```

### 4. Surviving Mutant Investigation
```typescript
await mutationTester.investigateSurvivors({
  mutants: survivingMutants,
  analysis: {
    findWeakTests: true,
    suggestNewTests: true,
    identifyEquivalent: true,
    prioritizeByRisk: true
  }
});
```

## Mutation Operators

| Category | Operators | Example |
|----------|-----------|---------|
| Arithmetic | AOR, AOD | `a + b` → `a - b` |
| Relational | ROR | `a < b` → `a <= b` |
| Logical | LCR, LOD | `a && b` → `a \|\| b` |
| Conditional | COR | `if (x)` → `if (!x)` |
| Literal | LVR | `true` → `false` |
| Return | RVR | `return x` → `return 0` |

## Mutation Testing Results

```typescript
interface MutationTestResults {
  summary: {
    totalMutants: number;
    killed: number;
    survived: number;
    timeout: number;
    equivalent: number;
    mutationScore: number;  // killed / (total - equivalent)
  };
  mutants: {
    id: string;
    file: string;
    line: number;
    operator: string;
    original: string;
    mutated: string;
    status: 'killed' | 'survived' | 'timeout' | 'equivalent';
    killedBy?: string[];
  }[];
  weakTests: {
    test: string;
    mutantsNotKilled: number;
    suggestions: string[];
  }[];
  recommendations: string[];
}
```

## Event Handlers

```yaml
subscribes_to:
  - TestSuiteCompleted
  - CoverageAnalysisCompleted
  - MutationTestRequested
  - QualityGateCheck

publishes:
  - MutationTestStarted
  - MutationTestCompleted
  - MutationScoreCalculated
  - WeakTestsIdentified
  - TestImprovementSuggested
```

## CLI Commands

```bash
# Run mutation testing
aqe-v3 mutation run --targets src/services --tests tests/

# Generate mutants only
aqe-v3 mutation generate --targets src/auth/*.ts --operators all

# Analyze surviving mutants
aqe-v3 mutation analyze --survivors --suggest-tests

# Compare mutation scores
aqe-v3 mutation compare --baseline v1.0 --current HEAD

# Set mutation score threshold
aqe-v3 mutation gate --minimum 80 --fail-on-regression
```

## Coordination

**Collaborates With**: v3-qe-coverage-specialist, v3-qe-test-architect, v3-qe-test-generator
**Reports To**: v3-qe-coverage-coordinator

## Integration with CI/CD

```yaml
# Mutation testing gate
mutation_testing:
  enabled: true
  incremental: true  # Only mutate changed files
  thresholds:
    minimum_score: 80
    regression_tolerance: 5

  on_failure:
    - generate_test_suggestions
    - block_merge
    - notify_author
```

## Incremental Mutation Testing

```typescript
// Only test mutations in changed code
await mutationTester.runIncremental({
  baseline: 'main',
  changes: prChanges,
  strategy: 'changed-lines-only',
  correlation: {
    mapTestsToMutations: true,
    runAffectedTestsOnly: true
  }
});
```
