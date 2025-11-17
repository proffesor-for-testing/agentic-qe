---
name: "Sherlock Review"
description: "Evidence-based investigative code review using deductive reasoning to determine what actually happened versus what was claimed. Use when verifying implementation claims, investigating bugs, validating fixes, or conducting root cause analysis. Elementary approach to finding truth through systematic observation."
---

# Sherlock Review

## What This Skill Does

Conducts methodical, evidence-based investigation of code, tests, and system behavior using Holmesian deductive reasoning. Unlike traditional code reviews that focus on style and best practices, Sherlock Review investigates **what actually happened** versus **what was claimed to happen**, seeing what others miss through systematic observation and logical deduction.

## Prerequisites

- Access to codebase and version control history
- Ability to run tests and reproduce issues
- Understanding of the domain and system architecture
- Critical thinking and skepticism

---

## Quick Start (Elementary Method)

### The 3-Step Investigation

```bash
# 1. OBSERVE: Gather all evidence
git log --oneline -10
git diff <commit>
grep -r "claimed feature" .

# 2. DEDUCE: What does the evidence actually show?
npm test
git blame <file>

# 3. CONCLUDE: Does evidence support the claim?
# Document findings with evidence
```

---

## Investigation Methodology

### Level 1: Initial Observation (The Crime Scene)

**Principle**: "You see, but you do not observe. The distinction is clear."

#### What to Examine First

1. **The Claim**: What was supposed to happen?
   - PR description
   - Commit messages
   - Issue tickets
   - Documentation updates

2. **The Evidence**: What actually exists?
   - Actual code changes
   - Test coverage
   - Build/test results
   - Runtime behavior

3. **The Timeline**: When did things happen?
   - Commit history
   - File modification times
   - Test execution logs
   - Deployment records

#### Evidence Collection Checklist

```markdown
## Evidence Collection

### The Claim
- [ ] Read PR/issue description thoroughly
- [ ] Note all claimed features/fixes
- [ ] Identify specific assertions made
- [ ] Record expected behavior

### The Code
- [ ] Examine actual file changes
- [ ] Review implementation details
- [ ] Check for edge cases
- [ ] Verify error handling

### The Tests
- [ ] Count test cases added/modified
- [ ] Run tests independently
- [ ] Check test assertions
- [ ] Verify test coverage

### The Behavior
- [ ] Run the code locally
- [ ] Test claimed scenarios
- [ ] Try edge cases
- [ ] Reproduce reported fixes
```

---

## Level 2: Deductive Analysis (Elementary Reasoning)

### The Sherlock Framework

#### 1. Eliminate the Impossible

**Method**: Systematically rule out what cannot be true

```markdown
## Investigation Notes

### Claim: "Fixed user authentication bug"

#### Evidence Review:
- ✓ Modified auth.js (lines 45-67)
- ✓ Added 2 new test cases
- ✗ No changes to login flow
- ✗ No database migration
- ✗ Tests pass but don't cover reported scenario

#### Deductions:
- IMPOSSIBLE: Fix covers all auth scenarios (no login flow changes)
- POSSIBLE: Fix covers specific password reset case
- LIKELY: Fix is partial, limited to one code path
```

#### 2. Follow the Evidence Chain

**Method**: Connect observable facts to logical conclusions

```markdown
## Evidence Chain

### Observation 1: Test passes locally
### Observation 2: Test fails in CI
### Observation 3: Different Node versions

### Chain of Reasoning:
1. Test behavior differs by environment
2. Environment difference is Node version
3. Code uses Node-version-specific API
4. Therefore: Fix is environment-dependent
5. Conclusion: Claim of "fixed" is incomplete
```

#### 3. Question Everything

**Critical Questions to Ask**:

- Does the code actually do what the commit message claims?
- Do the tests verify the claimed fix?
- Can the bug reproduce in conditions not covered by tests?
- Are there edge cases not considered?
- Does "works on my machine" equal "properly fixed"?

---

## Level 3: Systematic Investigation Process

### Step-by-Step Sherlock Review

#### Step 1: Read the Case File

```bash
# Examine the claim
git show <commit>
cat PR_DESCRIPTION.md

# Note specific assertions:
# - "Fixes race condition in async handler"
# - "Adds comprehensive error handling"
# - "Improves performance by 40%"
```

#### Step 2: Examine the Evidence

```bash
# What actually changed?
git diff main..feature-branch

# Count the facts:
FILES_CHANGED=$(git diff --name-only main..feature-branch | wc -l)
LINES_ADDED=$(git diff --stat main..feature-branch | tail -1)
TESTS_ADDED=$(git diff main..feature-branch | grep -c "test(" )

echo "Files modified: $FILES_CHANGED"
echo "Tests added: $TESTS_ADDED"
```

#### Step 3: Test the Theory

```bash
# Run claimed fixes through scientific method
npm test -- --coverage

# Test edge cases not covered:
node scripts/test-edge-cases.js

# Reproduce original bug:
git checkout <bug-commit>
npm test -- <failing-test>
git checkout <fix-commit>
npm test -- <failing-test>
```

#### Step 4: Cross-Examine the Code

**Questions for Code Interrogation**:

```javascript
// CLAIMED: "Handles all null cases"
function processData(data) {
  if (data === null) return null;  // ✓ Handles null
  return data.items.map(x => x);    // ✗ Doesn't handle data.items === null
}
// VERDICT: Claim is FALSE - only handles top-level null
```

#### Step 5: Compile the Evidence Report

```markdown
## Sherlock Investigation Report

### Case: PR #123 "Fix race condition in async handler"

### Claimed Facts:
1. "Eliminates race condition"
2. "Adds mutex locking"
3. "100% thread safe"

### Evidence Examined:
- File: src/handlers/async-handler.js
- Changes: Added `async/await`, removed callbacks
- Tests: 2 new tests for async flow
- Coverage: 85% (was 75%)

### Deductive Analysis:

#### Claim 1: "Eliminates race condition"
**Evidence**:
- Added `await` to sequential operations
- No actual mutex/lock mechanism found
- No test for concurrent requests

**Deduction**:
- Code now sequential, not concurrent
- Race condition avoided by removing concurrency
- Not eliminated, just prevented by design change

**Verdict**: PARTIALLY TRUE (solved differently than claimed)

#### Claim 2: "Adds mutex locking"
**Evidence**:
- No mutex library imported
- No lock variables found
- No synchronization primitives

**Deduction**:
- No mutex implementation exists
- Claim is factually incorrect

**Verdict**: FALSE

#### Claim 3: "100% thread safe"
**Evidence**:
- JavaScript is single-threaded
- Node.js event loop model
- No worker threads used

**Deduction**:
- "Thread safe" is meaningless in this context
- Shows misunderstanding of runtime model

**Verdict**: NONSENSICAL

### Final Conclusion:
The fix works but not for the reasons claimed. The race condition is avoided by making operations sequential rather than by adding thread synchronization. Tests verify sequential behavior but don't test the original concurrent scenario.

### Recommendations:
1. Update PR description to accurately reflect solution
2. Add test for concurrent request handling
3. Clarify whether sequential execution is acceptable for performance
4. Remove incorrect technical claims about "mutex" and "thread safety"
```

---

## Level 4: Advanced Investigation Techniques

### Technique 1: The Timeline Reconstruction

**Purpose**: Understand the sequence of events leading to current state

```bash
# Build the timeline
git log --all --graph --oneline --decorate

# Examine critical commits
git log --grep="fix" --grep="bug" --all-match

# Find when bug was introduced
git bisect start
git bisect bad HEAD
git bisect good v1.0.0
```

### Technique 2: The Behavioral Analysis

**Purpose**: Observe what the code actually does, not what it's supposed to do

```javascript
// Add instrumentation
console.log('[SHERLOCK] Entering function with:', arguments);
console.log('[SHERLOCK] State before:', JSON.stringify(state));
// ... original code ...
console.log('[SHERLOCK] State after:', JSON.stringify(state));
console.log('[SHERLOCK] Returning:', result);
```

### Technique 3: The Stress Test

**Purpose**: Find limits and breaking points

```bash
# Test boundary conditions
npm test -- --iterations=10000

# Test with invalid inputs
echo '{"invalid": null}' | node src/process.js

# Test resource exhaustion
ab -n 10000 -c 100 http://localhost:3000/api/endpoint
```

### Technique 4: The Forensic Diff

**Purpose**: Understand what changed and why

```bash
# Compare claimed vs actual changes
git diff --word-diff main..feature-branch

# Find silent changes (no commit message mention)
git diff main..feature-branch | grep -A5 -B5 "security\|auth\|password"

# Detect code that was removed
git diff main..feature-branch | grep "^-" | grep -v "^---"
```

---

## Investigation Templates

### Template 1: Bug Fix Verification

```markdown
## Sherlock Investigation: Bug Fix Verification

### The Bug Report
- **Reported**: [date]
- **Severity**: [P0/P1/P2/P3]
- **Symptoms**: [what users observed]
- **Expected**: [what should happen]

### The Claimed Fix
- **PR**: #[number]
- **Commit**: [hash]
- **Description**: [claimed solution]

### Evidence Collection

#### 1. Reproduce Original Bug
- [ ] Checkout commit before fix
- [ ] Follow reproduction steps
- [ ] Confirm bug exists
- [ ] Document observed behavior

#### 2. Verify Fix
- [ ] Checkout commit with fix
- [ ] Follow same reproduction steps
- [ ] Confirm bug is resolved
- [ ] Test edge cases

#### 3. Code Analysis
- [ ] Review actual code changes
- [ ] Verify logic addresses root cause
- [ ] Check for side effects
- [ ] Assess test coverage

### Deductive Analysis

**Root Cause Claimed**: [what PR says]
**Root Cause Actual**: [what evidence shows]

**Fix Mechanism Claimed**: [how PR says it works]
**Fix Mechanism Actual**: [how it actually works]

**Coverage Claimed**: [scenarios PR claims to handle]
**Coverage Actual**: [scenarios actually handled]

### Verdict

- [ ] Bug is fully fixed
- [ ] Bug is partially fixed
- [ ] Bug is not fixed (claim is false)
- [ ] Bug is fixed but new bugs introduced

### Evidence Summary
[Concise summary of findings with proof]

### Recommendations
1. [Action based on evidence]
2. [Action based on evidence]
```

### Template 2: Feature Implementation Review

```markdown
## Sherlock Investigation: Feature Implementation

### The Feature Request
- **Requirement**: [what was requested]
- **Acceptance Criteria**: [how to verify]
- **User Story**: [why it's needed]

### The Implementation Claim
- **PR**: #[number]
- **Description**: [what PR claims to deliver]
- **Scope**: [claimed completeness]

### Evidence Examination

#### Code Changes
```bash
git diff main..feature-branch --stat
```

- Files changed: [count]
- Lines added: [count]
- Lines removed: [count]
- Tests added: [count]

#### Acceptance Criteria Testing

| Criterion | Claimed | Tested | Verdict |
|-----------|---------|--------|---------|
| AC1: [criterion] | ✓ | [yes/no] | [pass/fail] |
| AC2: [criterion] | ✓ | [yes/no] | [pass/fail] |
| AC3: [criterion] | ✓ | [yes/no] | [pass/fail] |

### Deductive Analysis

**Claim**: [what PR says is implemented]

**Evidence**:
- [Fact 1 from code]
- [Fact 2 from tests]
- [Fact 3 from behavior]

**Deduction**:
- [Logical conclusion from evidence]

**Verdict**: [supported/partially supported/not supported by evidence]

### Missing Elements
- [ ] [Feature aspect not implemented]
- [ ] [Test scenario not covered]
- [ ] [Edge case not handled]

### Conclusion
[Evidence-based assessment of implementation completeness]
```

### Template 3: Performance Claim Verification

```markdown
## Sherlock Investigation: Performance Claims

### The Claim
"Improved performance by [X]% in [scenario]"

### Investigation Setup

#### Baseline Measurement
```bash
git checkout [before-commit]
npm run benchmark > baseline.txt
```

#### Post-Fix Measurement
```bash
git checkout [after-commit]
npm run benchmark > optimized.txt
```

### Evidence Collection

#### Benchmark Results

| Metric | Before | After | Improvement | Claimed |
|--------|--------|-------|-------------|---------|
| Latency | [ms] | [ms] | [%] | [%] |
| Throughput | [req/s] | [req/s] | [%] | [%] |
| Memory | [MB] | [MB] | [%] | [%] |
| CPU | [%] | [%] | [%] | [%] |

### Deductive Analysis

**Claimed Improvement**: [X]%
**Measured Improvement**: [Y]%
**Variance**: [X-Y]%

**Measurement Conditions**:
- Environment: [prod/dev/local]
- Load: [concurrent users/requests]
- Data size: [records/MB]

**Verdict**:
- [ ] Claim supported by evidence
- [ ] Claim exaggerated (actual: [Y]%)
- [ ] Claim not reproducible
- [ ] Claim based on cherry-picked scenario

### Conclusion
[Evidence-based assessment with actual numbers]
```

---

## Holmesian Principles for QE

### Principle 1: "Data! Data! Data!"

> "I can't make bricks without clay."

**Application**: Collect comprehensive evidence before forming conclusions

- Logs, traces, metrics
- Test results, coverage reports
- Code diffs, git history
- Reproduction steps

### Principle 2: "Eliminate the Impossible"

> "When you have eliminated the impossible, whatever remains, however improbable, must be the truth."

**Application**: Use negative testing and boundary analysis

- Test what should NOT happen
- Verify constraints are enforced
- Check impossible inputs are rejected
- Validate error handling paths

### Principle 3: "Observe, Don't Assume"

> "You see, but you do not observe."

**Application**: Run the code, don't just read it

- Execute tests locally
- Step through debugger
- Profile performance
- Monitor resource usage

### Principle 4: "The Little Things Matter"

> "It has long been an axiom of mine that the little things are infinitely the most important."

**Application**: Pay attention to details others miss

- Off-by-one errors
- Null/undefined handling
- Timezone conversions
- Race conditions
- Memory leaks

### Principle 5: "Question Everything"

> "I never guess. It is a capital mistake to theorize before one has data."

**Application**: Verify all claims empirically

- Don't trust commit messages
- Don't trust documentation
- Don't trust "it works on my machine"
- Trust only reproducible evidence

---

## The Sherlock Review Checklist

Before approving any PR, verify:

### Evidence-Based Review

- [ ] **Claim vs Reality**: Does code match description?
- [ ] **Tests Verify Claims**: Do tests actually prove the fix/feature?
- [ ] **Reproducible**: Can you reproduce the bug/feature locally?
- [ ] **Edge Cases**: Are boundary conditions tested?
- [ ] **Negative Cases**: Are failure paths tested?

### Deductive Reasoning

- [ ] **Root Cause**: Does fix address actual root cause?
- [ ] **Side Effects**: Could this break something else?
- [ ] **Performance**: Any evidence for performance claims?
- [ ] **Security**: Any security implications?
- [ ] **Assumptions**: Are all assumptions validated?

### Observational Analysis

- [ ] **Code Quality**: Is code doing what it appears to do?
- [ ] **Error Handling**: Are errors handled or just hidden?
- [ ] **Resource Management**: Are resources properly managed?
- [ ] **Concurrency**: Any race conditions or deadlocks?
- [ ] **Data Validation**: Is input validated?

### Timeline Verification

- [ ] **Related Changes**: Are there related commits?
- [ ] **Regression Risk**: Could this reintroduce old bugs?
- [ ] **Dependencies**: Are dependency changes necessary?
- [ ] **Migration Path**: Is there a rollback plan?

---

## Common Investigation Scenarios

### Scenario 1: "This Fixed the Bug"

**Investigation Steps**:
1. Reproduce bug on commit before fix
2. Verify bug is gone on commit with fix
3. Check if fix addresses root cause or just symptom
4. Test edge cases not in original bug report
5. Verify no regression in related functionality

**Red Flags**:
- Bug "fix" that just removes error logging
- Fix that works only for specific test case
- Fix that introduces workarounds instead of solving root cause
- No test added to prevent regression

### Scenario 2: "Improved Performance by 50%"

**Investigation Steps**:
1. Run benchmark on baseline commit
2. Run same benchmark on optimized commit
3. Compare results in identical conditions
4. Verify measurement methodology
5. Test under realistic load

**Red Flags**:
- Performance tested only on toy data
- Comparison uses different conditions
- "Improvement" in non-critical path
- Trade-off not mentioned (e.g., memory for speed)

### Scenario 3: "Added Comprehensive Error Handling"

**Investigation Steps**:
1. List all error paths in code
2. Verify each path has handling
3. Test each error condition
4. Check error messages are actionable
5. Verify errors are logged/monitored

**Red Flags**:
- Errors caught but ignored (`catch {}`)
- Generic error messages
- Errors handled by crashing
- No logging of critical errors

---

## Output Format

### The Sherlock Report

```markdown
# Sherlock Investigation Report

**Case**: [PR/Issue number and title]
**Investigator**: [Your name]
**Date**: [Investigation date]

## Summary
[One paragraph: What was claimed, what was found, verdict]

## Claims Examined
1. [Claim 1]
2. [Claim 2]
3. [Claim 3]

## Evidence Collected
- Code changes: [summary]
- Tests added: [count and coverage]
- Benchmarks: [results]
- Manual testing: [scenarios tested]

## Deductive Analysis

### Claim 1: [Claim text]
**Evidence**: [What you found]
**Deduction**: [Logical conclusion]
**Verdict**: ✓ TRUE / ✗ FALSE / ⚠ PARTIALLY TRUE

[Repeat for each claim]

## Findings

### What Works
- [Positive finding with evidence]

### What Doesn't Work
- [Issue found with evidence]

### What's Missing
- [Gap in implementation/testing]

## Overall Verdict

- [ ] Approve: Claims fully supported by evidence
- [ ] Approve with Reservations: Claims mostly accurate
- [ ] Request Changes: Claims not supported by evidence
- [ ] Reject: Claims are false or misleading

## Recommendations
1. [Action item based on findings]
2. [Action item based on findings]

---

**Elementary Evidence**: [Link to detailed evidence files/logs]
**Reproducible**: [Yes/No - Can others verify your findings?]
```

---

## Integration with AQE Fleet

### Use Sherlock Review With:

1. **qe-code-reviewer**: After automated review, investigate flagged issues
2. **qe-security-auditor**: Verify security fix claims
3. **qe-performance-validator**: Validate performance improvement claims
4. **qe-flaky-test-hunter**: Investigate "test fixed" claims
5. **production-validator**: Verify deployment-ready claims

### Workflow Integration

```bash
# 1. Automated review flags issues
aqe review --pr 123

# 2. Sherlock investigates flagged claims
# [Apply Sherlock methodology to each flag]

# 3. Document evidence-based findings
# [Generate Sherlock report]

# 4. Provide actionable feedback
# [Based on evidence, not assumptions]
```

---

## Learn More

### Recommended Reading
- "The Adventure of Silver Blaze" - Importance of negative evidence
- "A Scandal in Bohemia" - Observation vs. seeing
- "The Boscombe Valley Mystery" - Following the evidence chain

### Related QE Skills
- `brutal-honesty-review` - Direct technical criticism
- `context-driven-testing` - Adapt to specific context
- `exploratory-testing-advanced` - Investigation techniques
- `bug-reporting-excellence` - Document findings clearly

---

**Created**: 2025-11-15
**Category**: Quality Engineering
**Approach**: Evidence-Based Investigation
**Philosophy**: "Elementary" - Trust only what can be proven

*"It is a capital mistake to theorize before one has data. Insensibly one begins to twist facts to suit theories, instead of theories to suit facts."* - Sherlock Holmes
