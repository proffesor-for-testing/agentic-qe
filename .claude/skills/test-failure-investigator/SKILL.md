---
name: test-failure-investigator
description: "Use when a test is failing and you need to determine root cause: is it flaky, an environment issue, or a real regression? Traces failure from symptom to fix."
user-invocable: true
---

# Test Failure Investigator

Runbook-style skill for systematic test failure investigation. Given a failing test, determines root cause and recommends action.

## Activation

```
/test-failure-investigator [test-name-or-file]
```

## Investigation Flow

### Step 1: Classify the Failure

Run the test 3 times and classify:

| Result Pattern | Classification | Action |
|---------------|---------------|--------|
| Fails consistently | **Regression** or **Environment** | Continue to Step 2 |
| Fails intermittently | **Flaky** | Skip to Step 4 |
| Passes now | **Transient** | Check CI logs, environment diff |

```bash
# Run test 3 times
for i in 1 2 3; do npx jest {{test_file}} 2>&1 | tail -5; echo "--- Run $i ---"; done
```

### Step 2: Narrow the Scope

```bash
# When did it start failing?
git log --oneline -20 -- {{related_source_files}}

# What changed recently?
git diff HEAD~5 -- {{related_source_files}}

# Does it fail in isolation?
npx jest {{test_file}} --testNamePattern="{{test_name}}"

# Does it fail with other tests?
npx jest --runInBand  # sequential execution
```

### Step 3: Root Cause Analysis

| Symptom | Likely Cause | Investigation |
|---------|-------------|--------------|
| Timeout | Network/DB dependency | Check external service availability |
| Assertion mismatch | Logic change | Compare expected vs actual, check git blame |
| Import error | Dependency change | Check package.json changes, run `npm ci` |
| Permission denied | Environment | Check file permissions, Docker volumes |
| Out of memory | Resource leak | Profile with `--detectOpenHandles` |

### Step 4: Flaky Test Investigation

```bash
# Run 10 times to confirm flakiness
for i in $(seq 1 10); do npx jest {{test_file}} --forceExit 2>&1 | grep -E 'PASS|FAIL'; done

# Common flaky causes:
# - Shared state between tests (missing cleanup)
# - Time-dependent assertions (use fake timers)
# - Race conditions (missing await)
# - Port conflicts (use random ports)
# - Order dependency (run with --randomize)
```

### Step 5: Report

```markdown
## Test Failure Report
- **Test**: {{test_name}}
- **File**: {{test_file}}
- **Classification**: Regression / Flaky / Environment / Transient
- **Root Cause**: {{description}}
- **First Failed**: {{commit_hash}} ({{date}})
- **Fix**: {{recommended_action}}
- **Verified**: [ ] Fix applied and test passes 3x consecutively
```

## Composition

After investigation, compose with:
- **`/bug-reporting-excellence`** — if regression found, file a bug report
- **`/regression-testing`** — if regression, add to regression suite
- **`/qe-test-execution`** — for re-running tests after fix

## Gotchas

- Agent may guess at root cause without running the test — always reproduce first
- "Works on my machine" is not a diagnosis — compare environments (node version, OS, deps)
- Flaky tests that pass 9/10 times will still be reported as "passing" by CI — run 10+ times
- Test isolation failures are the #1 cause of flaky tests — check for shared state in beforeAll/afterAll
