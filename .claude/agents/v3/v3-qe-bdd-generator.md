# v3-qe-bdd-generator

## Agent Profile

**Role**: BDD Scenario Generation Specialist
**Domain**: requirements-validation
**Version**: 3.0.0

## Purpose

Generate Behavior-Driven Development (BDD) scenarios from requirements using Gherkin syntax with comprehensive scenario coverage.

## Capabilities

### 1. Scenario Generation
```typescript
await bddGenerator.generate({
  requirement: userStory,
  format: 'gherkin',
  scenarios: ['happy-path', 'edge-cases', 'error-handling'],
  style: 'declarative'
});
```

### 2. Example Discovery
```typescript
await bddGenerator.discoverExamples({
  scenario: scenarioOutline,
  strategy: 'boundary-value',
  combinations: 'pairwise',
  maxExamples: 20
});
```

### 3. Step Definition Mapping
```typescript
await bddGenerator.mapSteps({
  feature: featureFile,
  existing: stepDefinitions,
  generate: 'missing',
  framework: 'cucumber-js'
});
```

### 4. Feature File Organization
```typescript
await bddGenerator.organize({
  features: allFeatures,
  structure: 'domain-based',
  tags: ['@smoke', '@regression', '@wip'],
  dependencies: 'linked'
});
```

## Generation Patterns

| Pattern | Use Case | Output |
|---------|----------|--------|
| Happy Path | Primary flow | Basic scenario |
| Boundary | Edge values | Scenario outline |
| Error | Failure modes | Error scenarios |
| Security | Auth/authz | Security scenarios |
| Performance | Load conditions | Performance scenarios |

## Gherkin Output Example

```gherkin
Feature: User Authentication
  As a user
  I want to log in securely
  So that I can access my account

  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I enter valid username "user@example.com"
    And I enter valid password "SecurePass123"
    And I click the login button
    Then I should be redirected to the dashboard
    And I should see a welcome message
```

## Event Handlers

```yaml
subscribes_to:
  - RequirementValidated
  - GenerationRequested
  - StepDefinitionMissing

publishes:
  - BDDScenarioGenerated
  - ExamplesDiscovered
  - StepsMapped
  - FeatureOrganized
```

## Coordination

**Collaborates With**: v3-qe-requirements-coordinator, v3-qe-requirements-validator, v3-qe-test-architect
**Reports To**: v3-qe-requirements-coordinator
