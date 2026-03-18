---
name: coverage-drop-investigator
description: "Use when test coverage has dropped and you need to find which changes caused it and what tests to add. Traces coverage regressions to specific commits and files."
user-invocable: true
---

# Coverage Drop Investigator

Runbook-style skill for investigating coverage regressions. Identifies which changes caused coverage to drop and recommends targeted tests.

## Activation

```
/coverage-drop-investigator
```

## Investigation Flow

### Step 1: Measure Current Coverage

```bash
# Generate coverage report
npx jest --coverage --coverageReporters=json-summary

# View summary
cat coverage/coverage-summary.json | jq '.total'
```

### Step 2: Find When Coverage Dropped

```bash
# Compare coverage with main branch
git stash && npx jest --coverage --coverageReporters=json-summary
mv coverage/coverage-summary.json coverage/baseline.json
git stash pop && npx jest --coverage --coverageReporters=json-summary

# Compare
jq -s '.[0].total.statements.pct as $baseline | .[1].total.statements.pct as $current | {baseline: $baseline, current: $current, delta: ($current - $baseline)}' coverage/baseline.json coverage/coverage-summary.json
```

### Step 3: Identify Uncovered Files

```bash
# Find files with lowest coverage
cat coverage/coverage-summary.json | jq 'to_entries | map(select(.key != "total")) | sort_by(.value.statements.pct) | .[0:10] | .[] | {file: .key, statements: .value.statements.pct, branches: .value.branches.pct}'
```

### Step 4: Map to Recent Changes

```bash
# Find recently changed files with low coverage
git diff --name-only main...HEAD | while read file; do
  jq --arg f "$file" '.[$f] // empty | {file: $f, statements: .statements.pct}' coverage/coverage-summary.json
done
```

### Step 5: Recommend Tests

For each uncovered file, identify:
1. **Uncovered functions** — need new test cases
2. **Uncovered branches** — need conditional test cases (if/else paths)
3. **Uncovered lines** — may indicate dead code or missing edge cases

### Step 6: Report

```markdown
## Coverage Drop Report
- **Current**: {{current_pct}}%
- **Baseline (main)**: {{baseline_pct}}%
- **Delta**: {{delta}}%
- **Files causing drop**:
  | File | Coverage | Changed Lines | Tests Needed |
  |------|----------|--------------|-------------|
  | {{file}} | {{pct}}% | {{lines}} | {{count}} |
- **Recommended action**: {{write_tests / accept_drop / mark_as_excluded}}
```

## Composition

After investigation:
- **`/qe-test-generation`** — generate tests for uncovered files
- **`/mutation-testing`** — verify existing tests actually catch bugs
- **`/coverage-guard`** — prevent future drops

## Gotchas

- Coverage can drop because NEW code was added without tests, not because tests were removed
- 100% coverage is not always the goal — focus on critical paths, not getters/setters
- Branch coverage drops are more concerning than line coverage drops — branches indicate logic paths
- Coverage tools may count generated code or type definitions — exclude with coveragePathIgnorePatterns
