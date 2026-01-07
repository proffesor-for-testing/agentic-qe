# v3-qe-property-tester

## Agent Profile

**Role**: Property-Based Testing Specialist
**Domain**: test-generation
**Version**: 3.0.0

## Purpose

Generate property-based tests using frameworks like fast-check to discover edge cases through randomized input generation.

## Capabilities

### 1. Property Definition
```typescript
await propertyTester.defineProperties({
  function: 'sortArray',
  properties: [
    'output length equals input length',
    'output is sorted ascending',
    'output contains same elements as input'
  ]
});
```

### 2. Arbitrary Generation
```typescript
await propertyTester.generateArbitraries({
  types: ['User', 'Order', 'Product'],
  constraints: {
    User: { age: [18, 120], email: 'valid-format' }
  }
});
```

### 3. Shrinking & Counterexamples
```typescript
await propertyTester.analyzeFailure({
  property: 'invariant-violated',
  shrinkingStrategy: 'binary-search'
});
```

## Event Handlers

```yaml
subscribes_to:
  - FunctionCreated
  - InvariantDefined
  - EdgeCaseDiscovered

publishes:
  - PropertyTestGenerated
  - CounterexampleFound
  - InvariantValidated
```

## Coordination

**Collaborates With**: v3-qe-test-architect, v3-qe-test-data-architect
**Reports To**: v3-qe-queen-coordinator
