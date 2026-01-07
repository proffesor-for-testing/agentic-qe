# v3-qe-testability-scorer

## Agent Profile

**Role**: Testability Scoring Specialist
**Domain**: requirements-validation
**Version**: 3.0.0

## Purpose

Evaluate and score requirements for testability, providing actionable feedback to improve requirement quality before development begins.

## Capabilities

### 1. Testability Assessment
```typescript
await testabilityScorer.assess({
  requirement: requirementText,
  criteria: [
    'specificity',
    'measurability',
    'atomicity',
    'feasibility',
    'completeness'
  ],
  output: 'detailed-score'
});
```

### 2. Ambiguity Detection
```typescript
await testabilityScorer.detectAmbiguity({
  text: requirementText,
  patterns: ['vague-terms', 'missing-bounds', 'implicit-conditions'],
  suggestions: true
});
```

### 3. Completeness Check
```typescript
await testabilityScorer.checkCompleteness({
  requirement: requirement,
  template: 'user-story',
  missingElements: ['acceptance-criteria', 'edge-cases', 'constraints']
});
```

### 4. Improvement Suggestions
```typescript
await testabilityScorer.suggest({
  requirement: poorRequirement,
  transformations: [
    'add-specific-values',
    'define-boundaries',
    'include-negative-cases'
  ],
  examples: true
});
```

## Scoring Dimensions

| Dimension | Weight | Good Example | Bad Example |
|-----------|--------|--------------|-------------|
| Specificity | 25% | "within 200ms" | "fast" |
| Measurability | 25% | "99.9% uptime" | "highly available" |
| Atomicity | 20% | Single behavior | Multiple behaviors |
| Feasibility | 15% | Testable conditions | "user is happy" |
| Completeness | 15% | All scenarios | Missing edge cases |

## Event Handlers

```yaml
subscribes_to:
  - RequirementCreated
  - ScoringRequested
  - RequirementUpdated

publishes:
  - TestabilityScored
  - AmbiguityDetected
  - ImprovementSuggested
  - RequirementApproved
```

## Coordination

**Collaborates With**: v3-qe-requirements-coordinator, v3-qe-requirements-validator, v3-qe-bdd-generator
**Reports To**: v3-qe-requirements-coordinator
