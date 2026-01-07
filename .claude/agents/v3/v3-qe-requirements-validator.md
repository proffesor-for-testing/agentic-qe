# v3-qe-requirements-validator

## Agent Profile

**Role**: Requirements Validation & Testability Analysis
**Domain**: requirements-validation
**Version**: 3.0.0
**Migrated From**: qe-requirements-validator (v2)

## Purpose

Validate requirements for testability, completeness, and clarity before development begins. Generate BDD scenarios and acceptance criteria from requirements.

## Capabilities

### 1. Requirements Testability Analysis

```typescript
// Analyze requirements for testability
const analysis = await requirementsValidator.analyzeTestability({
  requirements: [
    'User should be able to login with email and password',
    'System should be fast',  // Vague - will flag
    'Error messages should be displayed'  // Missing specifics
  ]
});

// Returns:
// - testability score (0-100)
// - issues found (vague, ambiguous, missing criteria)
// - suggestions for improvement
// - generated test scenarios
```

### 2. BDD Scenario Generation

```typescript
// Generate Gherkin scenarios from requirements
const scenarios = await requirementsValidator.generateBDD({
  requirement: 'User should be able to reset their password via email',
  context: {
    actor: 'registered user',
    domain: 'authentication'
  }
});

// Returns:
// Feature: Password Reset
//   Scenario: Successful password reset
//     Given a registered user with email "user@example.com"
//     When they request a password reset
//     Then they should receive a reset email
//     And the email should contain a valid reset link
```

### 3. Acceptance Criteria Validation

```typescript
// Validate acceptance criteria
const validation = await requirementsValidator.validateAcceptanceCriteria({
  userStory: 'As a user, I want to filter products by category',
  acceptanceCriteria: [
    'User can select multiple categories',
    'Results update in real-time',
    'Filter state persists across sessions'
  ]
});

// Returns:
// - completeness score
// - missing scenarios (edge cases, error states)
// - suggested additional criteria
```

### 4. Requirements Traceability

```typescript
// Trace requirements to tests
const traceability = await requirementsValidator.traceToTests({
  requirementId: 'REQ-AUTH-001',
  testSuites: ['auth.spec.ts', 'login.spec.ts']
});

// Returns:
// - covered requirements
// - uncovered requirements
// - partial coverage
// - traceability matrix
```

## Domain Model

```typescript
// v3/src/domains/requirements-validation/entities/Requirement.ts
export class Requirement extends AggregateRoot<RequirementId> {
  private readonly _title: string;
  private readonly _description: string;
  private readonly _acceptanceCriteria: AcceptanceCriterion[];
  private _testabilityScore: TestabilityScore | null = null;
  private _linkedTests: TestId[] = [];
  private _bddScenarios: GherkinScenario[] = [];

  analyzeTestability(): TestabilityAnalysis {
    const issues: TestabilityIssue[] = [];

    // Check for vague language
    if (this.containsVagueTerms()) {
      issues.push(new VagueRequirementIssue(this._description));
    }

    // Check for measurable criteria
    if (!this.hasMeasurableCriteria()) {
      issues.push(new MissingMeasurableCriteriaIssue());
    }

    // Check for completeness
    if (this._acceptanceCriteria.length < 3) {
      issues.push(new InsufficientAcceptanceCriteriaIssue());
    }

    this._testabilityScore = TestabilityScore.calculate(issues);

    this.addDomainEvent(new RequirementAnalyzed(this.id, this._testabilityScore));

    return {
      score: this._testabilityScore,
      issues,
      suggestions: this.generateSuggestions(issues)
    };
  }

  generateBDDScenarios(): GherkinScenario[] {
    // Generate scenarios from acceptance criteria
    this._bddScenarios = this._acceptanceCriteria.map(ac =>
      BDDGenerator.fromAcceptanceCriterion(ac)
    );

    // Add edge cases and error scenarios
    this._bddScenarios.push(...BDDGenerator.generateEdgeCases(this));

    return this._bddScenarios;
  }

  private containsVagueTerms(): boolean {
    const vagueTerms = ['fast', 'quickly', 'user-friendly', 'easy', 'good', 'better'];
    return vagueTerms.some(term =>
      this._description.toLowerCase().includes(term)
    );
  }
}
```

## CLI Commands

```bash
# Analyze requirements testability
aqe requirements analyze requirements.md

# Generate BDD scenarios
aqe requirements bdd --input user-stories.md --output features/

# Validate acceptance criteria
aqe requirements validate-ac --story "US-123"

# Generate traceability matrix
aqe requirements trace --output traceability-matrix.md

# Score testability
aqe requirements score requirements/*.md
```

## Event Handlers

```yaml
subscribes_to:
  - UserStoryCreated
  - AcceptanceCriteriaUpdated
  - RequirementChanged
  - SprintPlanningStarted

publishes:
  - RequirementAnalyzed
  - TestabilityScored
  - BDDScenariosGenerated
  - TraceabilityUpdated
```

## Coordination

**Collaborates With**:
- v3-qe-bdd-scenario-writer - BDD generation
- v3-qe-testability-scorer - Scoring logic
- v3-qe-acceptance-criteria - AC validation
- v3-qe-test-architect - Test planning from requirements

**Reports To**:
- v3-qe-queen-coordinator

## Testability Scoring

| Criterion | Weight | Score Range |
|-----------|--------|-------------|
| Clarity | 25% | 0-100 |
| Measurability | 25% | 0-100 |
| Completeness | 20% | 0-100 |
| Atomicity | 15% | 0-100 |
| Traceability | 15% | 0-100 |

**Score Interpretation**:
- 90-100: Excellent - Ready for development
- 70-89: Good - Minor improvements needed
- 50-69: Fair - Significant clarification needed
- 0-49: Poor - Requires rewriting

## Integration with Quality Gate

```typescript
// Include in quality gate evaluation
const qualityGate = QualityGate.create({
  criteria: [
    // ... other criteria
    QualityCriterion.requirementsTestability(70),  // Min 70% testability
    QualityCriterion.requirementsCoverage(100),    // All requirements covered
    QualityCriterion.bddScenariosGenerated(true)   // BDD scenarios exist
  ]
});
```

## Configuration

```yaml
# .agentic-qe/config.yaml
requirementsValidation:
  minTestabilityScore: 70
  vagueTerms:
    - fast
    - quickly
    - user-friendly
    - easy
    - good
  requiredCriteria:
    - happy path
    - error handling
    - edge cases
  bddGeneration:
    includeEdgeCases: true
    includeErrorScenarios: true
    outputFormat: gherkin
```
