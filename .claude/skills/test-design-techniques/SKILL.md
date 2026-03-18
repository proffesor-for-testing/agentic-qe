---
name: test-design-techniques
description: "Systematic test design with boundary value analysis, equivalence partitioning, decision tables, state transition testing, and combinatorial testing. Use when designing comprehensive test cases, reducing redundant tests, or ensuring systematic coverage."
category: specialized-testing
priority: high
tokenEstimate: 900
agents: [qe-test-generator, qe-coverage-analyzer, qe-quality-analyzer]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [test-design, bva, equivalence-partitioning, decision-tables, pairwise, state-transition]
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/test-design-techniques.yaml
---

# Test Design Techniques

<default_to_action>
When designing test cases, select technique by input type:
- Numeric ranges → BVA + EP
- Multiple conditions → Decision Tables
- Workflows → State Transition
- Many parameter combinations → Pairwise Testing
</default_to_action>

## Quick Reference Card

### When to Use
- Designing new test suites
- Optimizing existing tests
- Complex business rules
- Reducing test redundancy

---

## Agent-Driven Test Design

```typescript
// Auto-generate BVA tests
await Task("Generate BVA Tests", {
  field: 'age',
  dataType: 'integer',
  constraints: { min: 18, max: 120 }
}, "qe-test-generator");
// Returns: 6 boundary test cases

// Auto-generate pairwise tests
await Task("Generate Pairwise Tests", {
  parameters: {
    browser: ['Chrome', 'Firefox', 'Safari'],
    os: ['Windows', 'Mac', 'Linux'],
    screen: ['Desktop', 'Tablet', 'Mobile']
  }
}, "qe-test-generator");
// Returns: 9-12 tests (vs 27 full combination)
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/test-design/
├── bva-analysis/*       - Boundary value tests
├── partitions/*         - Equivalence partitions
├── decision-tables/*    - Decision table tests
└── pairwise/*           - Combinatorial reduction
```

### Fleet Coordination
```typescript
const designFleet = await FleetManager.coordinate({
  strategy: 'systematic-test-design',
  agents: [
    'qe-test-generator',    // Apply design techniques
    'qe-coverage-analyzer', // Analyze coverage
    'qe-quality-analyzer'   // Assess test quality
  ],
  topology: 'sequential'
});
```

---

## Related Skills
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven testing
- [risk-based-testing](../risk-based-testing/) - Prioritize by risk
- [mutation-testing](../mutation-testing/) - Validate test effectiveness

---

## Remember

**With Agents:** `qe-test-generator` applies these techniques automatically, generating optimal test suites with maximum coverage and minimum redundancy. Agents identify boundaries, partitions, and combinations from code analysis.
