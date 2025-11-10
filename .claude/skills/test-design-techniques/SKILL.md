---
name: test-design-techniques
description: Systematic test design with boundary value analysis, equivalence partitioning, decision tables, state transition testing, and combinatorial testing. Use when designing comprehensive test cases, reducing redundant tests, or ensuring systematic coverage.
---

# Test Design Techniques

## Core Principle

**Systematic test design finds more bugs with fewer tests.**

Random testing is inefficient. Proven test design techniques (40+ years of research) systematically identify high-value test cases, reduce redundancy, and maximize bug detection.

## Boundary Value Analysis (BVA)

**Principle:** Bugs cluster at boundaries of valid input ranges.

**Test at:**
- Minimum valid value
- Just below minimum (invalid)
- Just above minimum (valid)
- Maximum valid value
- Just above maximum (invalid)
- Just below maximum (valid)

**Example: Age field (18-120)**
```
Test Cases:
✓ 17  - Just below min (invalid, reject)
✓ 18  - Minimum valid (accept)
✓ 19  - Just above min (accept)
✓ 119 - Just below max (accept)
✓ 120 - Maximum valid (accept)
✓ 121 - Just above max (invalid, reject)
```

**With Agents:**
```typescript
// qe-test-generator automatically identifies boundaries
const tests = await agent.generateBVATests({
  field: 'age',
  dataType: 'integer',
  constraints: { min: 18, max: 120 }
});
// Returns: 6 boundary test cases
```

## Equivalence Partitioning (EP)

**Principle:** Divide input into partitions where all values behave the same.

**Example: Discount based on quantity**
```
Quantity Rules:
1-10:    No discount
11-100:  10% discount
101+:    20% discount

Partitions:
1. Invalid: quantity ≤ 0
2. Valid, no discount: 1-10
3. Valid, 10% discount: 11-100
4. Valid, 20% discount: 101+

Test Cases (1 per partition):
✓ -1   → Reject
✓ 5    → 0% discount
✓ 50   → 10% discount
✓ 200  → 20% discount
```

## Decision Tables

**Use for:** Complex business rules with multiple conditions.

**Example: Loan Approval**
```
Conditions:
- Age ≥ 18
- Credit Score ≥ 700
- Income ≥ $50k

Rule 1 | Rule 2 | Rule 3 | Rule 4 | Rule 5
-------|--------|--------|--------|-------
Yes    | Yes    | Yes    | No     | Yes
Yes    | Yes    | No     | Yes    | No
Yes    | No     | Yes    | Yes    | Yes
-------+--------+--------+--------+-------
Approve| Approve| Reject | Reject | Reject
```

**Test Cases:** 5 tests cover all decision combinations.

## State Transition Testing

**Model state changes:**
```
States: Logged Out → Logged In → Premium → Suspended

Transitions:
Login: Logged Out → Logged In
Upgrade: Logged In → Premium
Payment Fail: Premium → Suspended
Logout: Any → Logged Out

Invalid Transitions to Test:
Logged Out → Premium (should reject)
Suspended → Premium (should reject)
```

## Pairwise (Combinatorial) Testing

**Problem:** Testing all combinations explodes.

**Example: Cross-browser testing**
```
Browser: Chrome, Firefox, Safari (3)
OS: Windows, Mac, Linux (3)
Screen: Desktop, Tablet, Mobile (3)

All combinations: 3 × 3 × 3 = 27 tests

Pairwise: 9 tests cover all pairs
```

**With Agents:**
```typescript
// qe-test-generator does pairwise reduction
const tests = await agent.generatePairwiseTests({
  parameters: {
    browser: ['Chrome', 'Firefox', 'Safari'],
    os: ['Windows', 'Mac', 'Linux'],
    screen: ['Desktop', 'Tablet', 'Mobile']
  }
});
// Returns: 9-12 tests (vs 27 full combination)
```

## Related Skills

- [agentic-quality-engineering](../agentic-quality-engineering/)
- [test-automation-strategy](../test-automation-strategy/)
- [risk-based-testing](../risk-based-testing/)

## Remember

**Systematic design > Random testing**

- BVA finds boundary bugs
- EP reduces redundant tests
- Decision tables handle complexity
- Pairwise reduces combinatorial explosion

**With Agents:** `qe-test-generator` applies these techniques automatically, generating optimal test suites with maximum coverage and minimum redundancy.
