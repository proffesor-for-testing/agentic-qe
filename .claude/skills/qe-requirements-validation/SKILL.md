---
name: "qe-requirements-validation"
description: "Validate acceptance criteria, trace requirements to tests, generate BDD scenarios, and identify coverage gaps. Use when reviewing stories before development or building traceability matrices."
---

# QE Requirements Validation

Acceptance criteria parsing, requirements traceability, BDD scenario generation, and coverage gap identification.

## Quick Start

```bash
# Parse acceptance criteria
aqe requirements parse --source jira --project MYAPP

# Build traceability matrix
aqe requirements trace --requirements reqs/ --tests tests/

# Generate BDD scenarios
aqe requirements bdd --story US-123 --output features/

# Check requirements coverage
aqe requirements coverage --sprint current
```

## Workflow

### Step 1: Validate Acceptance Criteria

```typescript
await acceptanceCriteria.validate({
  source: { type: 'jira', project: 'MYAPP', stories: 'sprint=current' },
  validation: { specific: true, measurable: true, achievable: true, relevant: true, testable: true },
  output: { score: true, issues: true, suggestions: true }
});
```

**Checkpoint:** All stories score >= 80% on SMART criteria before proceeding.

### Step 2: Build Traceability Matrix

```typescript
await traceabilityBuilder.build({
  requirements: { source: 'jira', types: ['story', 'task', 'bug'] },
  artifacts: {
    tests: 'tests/**/*.test.ts',
    code: 'src/**/*.ts',
    documentation: 'docs/**/*.md'
  },
  output: { matrix: true, coverage: true, gaps: true, orphans: true }
});
```

**Checkpoint:** No high-risk requirements with zero test coverage.

### Step 3: Generate BDD Scenarios

```typescript
await bddGenerator.generate({
  requirements: userStory,
  format: 'gherkin',
  scenarios: { happyPath: true, edgeCases: true, errorCases: true, dataVariations: true },
  output: { featureFile: true, stepDefinitions: 'skeleton' }
});
```

**Output example:**

```gherkin
Feature: User Registration
  @happy-path
  Scenario: Successful registration with valid details
    Given I am on the registration page
    When I enter valid email "user@example.com"
    And I enter valid password "SecurePass123!"
    And I click the register button
    Then I should see a success message
    And I should receive a confirmation email

  @edge-case
  Scenario: Registration with existing email
    Given a user exists with email "existing@example.com"
    When I try to register with email "existing@example.com"
    Then I should see an error "Email already registered"
```

### Step 4: Coverage Analysis

```typescript
await requirementsCoverage.analyze({
  scope: 'sprint-23',
  metrics: { requirementsCovered: true, testCasesCoverage: true, automationCoverage: true, riskAssessment: true },
  report: { summary: true, details: true, recommendations: true }
});
```

## Requirements Quality Checks

```yaml
acceptance_criteria:
  has_given_when_then: preferred
  is_testable: required
  is_measurable: required
  no_ambiguity: required

user_story:
  follows_template: "As a <role>, I want <feature>, so that <benefit>"
  has_acceptance_criteria: required
  estimated: preferred

completeness:
  edge_cases_identified: required
  error_scenarios_covered: required
  non_functional_considered: preferred
```

## Sprint Gate

```typescript
await requirementsValidator.sprintReview({
  sprint: 'current',
  checks: { storiesComplete: true, criteriaValidated: true, testsLinked: true, coverageAdequate: true },
  gates: { minCoverage: 80, maxUntested: 2, requireDemo: true }
});
```

## Coordination

**Primary Agents**: qe-acceptance-criteria, qe-traceability-builder, qe-bdd-specialist
**Related Skills**: qe-test-generation, qe-quality-assessment
