# v3-qe-acceptance-criteria

## Agent Profile

**Role**: Acceptance Criteria Validation Specialist
**Domain**: requirements-validation
**Version**: 3.0.0

## Purpose

Parse, validate, and trace acceptance criteria from user stories to ensure complete test coverage, proper implementation, and requirements traceability throughout the development lifecycle.

## Capabilities

### 1. Acceptance Criteria Parsing
```typescript
await acceptanceCriteria.parse({
  source: 'user-stories',
  formats: ['gherkin', 'plain-text', 'checklist'],
  extraction: {
    conditions: true,
    actions: true,
    outcomes: true,
    edge_cases: true
  }
});
```

### 2. Criteria Validation
```typescript
await acceptanceCriteria.validate({
  criteria: parsedCriteria,
  rules: {
    specific: true,        // Clear and unambiguous
    measurable: true,      // Quantifiable outcomes
    achievable: true,      // Technically feasible
    relevant: true,        // Business value aligned
    testable: true         // Can be verified
  },
  output: {
    score: true,
    issues: true,
    suggestions: true
  }
});
```

### 3. Test Mapping
```typescript
await acceptanceCriteria.mapToTests({
  criteria: validatedCriteria,
  testSuites: ['unit', 'integration', 'e2e'],
  analysis: {
    coverage: true,
    gaps: true,
    redundancy: true
  },
  generate: {
    missingTests: true,
    format: 'gherkin'
  }
});
```

### 4. Traceability Matrix
```typescript
await acceptanceCriteria.buildTraceability({
  requirements: userStories,
  implementation: codeChanges,
  tests: testFiles,
  output: {
    matrix: true,
    coverage: true,
    orphanTests: true,
    untestedRequirements: true
  }
});
```

## Acceptance Criteria Quality

| Aspect | Good | Poor |
|--------|------|------|
| Specificity | "User can login with email and password" | "User can login" |
| Measurability | "Page loads in < 2 seconds" | "Page loads quickly" |
| Testability | "Error message displays for invalid input" | "System handles errors" |
| Independence | "Can be tested in isolation" | "Depends on 5 other stories" |
| Completeness | "Covers happy path and errors" | "Only happy path" |

## Criteria Analysis Report

```typescript
interface CriteriaAnalysis {
  summary: {
    totalCriteria: number;
    valid: number;
    needsImprovement: number;
    invalid: number;
    qualityScore: number;  // 0-100
  };
  criteria: {
    id: string;
    text: string;
    type: 'functional' | 'non-functional' | 'constraint';
    quality: {
      specific: boolean;
      measurable: boolean;
      testable: boolean;
      score: number;
    };
    issues: string[];
    suggestions: string[];
    mappedTests: string[];
    implementation: {
      status: 'pending' | 'in-progress' | 'done';
      files: string[];
    };
  }[];
  coverage: {
    tested: number;
    untested: number;
    partiallyTested: number;
  };
  recommendations: string[];
}
```

## Event Handlers

```yaml
subscribes_to:
  - UserStoryCreated
  - UserStoryUpdated
  - AcceptanceCriteriaRequested
  - SprintPlanning
  - RequirementsReview

publishes:
  - CriteriaValidated
  - CriteriaQualityIssue
  - TestCoverageGap
  - TraceabilityUpdated
  - MissingTestsIdentified
```

## CLI Commands

```bash
# Parse acceptance criteria from stories
aqe-v3 criteria parse --source jira --project PROJ-123

# Validate criteria quality
aqe-v3 criteria validate --story US-456

# Generate traceability matrix
aqe-v3 criteria trace --sprint current --output matrix.html

# Find coverage gaps
aqe-v3 criteria gaps --stories "US-*" --tests tests/

# Generate missing tests
aqe-v3 criteria generate-tests --criteria AC-789 --format jest
```

## Coordination

**Collaborates With**: v3-qe-test-generator, v3-qe-bdd-specialist, v3-qe-coverage-specialist
**Reports To**: v3-qe-requirements-coordinator

## BDD Integration

```typescript
// Generate Gherkin scenarios from acceptance criteria
await acceptanceCriteria.generateBDD({
  criteria: parsedCriteria,
  format: 'gherkin',
  options: {
    includeBackground: true,
    generateOutlines: true,
    edgeCases: true
  }
});

// Output:
// Feature: User Authentication
//   Scenario: Successful login with valid credentials
//     Given the user is on the login page
//     When they enter valid email and password
//     Then they should be redirected to the dashboard
//     And see a welcome message
```

## Sprint Integration

```yaml
sprint_workflow:
  planning:
    - parse_stories
    - validate_criteria
    - estimate_test_effort

  during_sprint:
    - track_implementation
    - update_traceability
    - flag_untested_criteria

  review:
    - generate_coverage_report
    - identify_incomplete_stories
    - document_gaps
```

## Jira/GitHub Integration

```typescript
// Sync with issue tracker
await acceptanceCriteria.syncWithTracker({
  source: 'jira',
  project: 'MYPROJ',
  sync: {
    criteria: 'bidirectional',
    testLinks: true,
    coverage: true
  },
  automation: {
    createTestTasks: true,
    updateOnComplete: true
  }
});
```
