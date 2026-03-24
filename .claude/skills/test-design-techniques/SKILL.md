---
name: "test-design-techniques"
description: "Apply systematic test design with boundary value analysis, equivalence partitioning, decision tables, state transition testing, and pairwise combinatorial testing. Use when designing comprehensive test cases or reducing redundant tests."
---

# Test Design Techniques

Select technique by input type, then generate optimal test suites automatically.

## Technique Selection

| Input Type | Technique | Reduction |
|-----------|-----------|-----------|
| Numeric ranges | BVA + Equivalence Partitioning | Test boundaries and class representatives |
| Multiple conditions | Decision Tables | Cover all rule combinations |
| Workflows/states | State Transition | Cover transitions and invalid paths |
| Many parameters | Pairwise Testing | ~60-70% fewer tests than full combination |

## Boundary Value Analysis (BVA)

For a field with constraints `min=18, max=120`:

| Test | Value | Expected |
|------|-------|----------|
| Below min | 17 | Invalid |
| At min | 18 | Valid |
| Above min | 19 | Valid |
| Below max | 119 | Valid |
| At max | 120 | Valid |
| Above max | 121 | Invalid |

```typescript
await Task("Generate BVA Tests", {
  field: 'age',
  dataType: 'integer',
  constraints: { min: 18, max: 120 }
}, "qe-test-generator");
// Returns: 6 boundary test cases
```

## Equivalence Partitioning

Divide input domain into classes where all values should behave identically:

```
Age field:
  Invalid: [-inf, 17]  -> test with 10
  Valid:   [18, 120]    -> test with 50
  Invalid: [121, +inf]  -> test with 200
```

## Decision Tables

For business rules with multiple conditions:

| Condition | R1 | R2 | R3 | R4 |
|-----------|----|----|----|----|
| Premium member | Y | Y | N | N |
| Order > $100 | Y | N | Y | N |
| **Free shipping** | Y | Y | Y | N |
| **Discount %** | 20 | 10 | 5 | 0 |

## Pairwise Testing

Covers all 2-way parameter combinations with minimal tests:

```typescript
await Task("Generate Pairwise Tests", {
  parameters: {
    browser: ['Chrome', 'Firefox', 'Safari'],
    os: ['Windows', 'Mac', 'Linux'],
    screen: ['Desktop', 'Tablet', 'Mobile']
  }
}, "qe-test-generator");
// Returns: 9-12 tests (vs 27 full combination)
```

## State Transition Testing

For workflow-based features:

```
States: Draft -> Submitted -> Approved -> Published
         |         |            |
         v         v            v
       Deleted   Rejected    Archived

Test cases:
1. Happy path: Draft -> Submitted -> Approved -> Published
2. Rejection: Draft -> Submitted -> Rejected -> Draft (resubmit)
3. Invalid: Draft -> Approved (should fail - skip Submitted)
```

## Agent-Driven Generation

```typescript
const designFleet = await FleetManager.coordinate({
  strategy: 'systematic-test-design',
  agents: [
    'qe-test-generator',     // Apply design techniques
    'qe-coverage-analyzer',  // Analyze coverage
    'qe-quality-analyzer'    // Assess test quality
  ],
  topology: 'sequential'
});
```

## Related Skills

- [risk-based-testing](../risk-based-testing/) -- Prioritize by risk
- [mutation-testing](../mutation-testing/) -- Validate test effectiveness
- [agentic-quality-engineering](../agentic-quality-engineering/) -- Agent-driven testing
