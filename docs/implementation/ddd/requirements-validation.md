# Requirements Validation Domain

## Bounded Context Overview

**Domain**: Requirements Validation
**Responsibility**: Pre-development requirements analysis, BDD generation, testability scoring, SFDIPOT assessment
**Location**: `src/domains/requirements-validation/`

The Requirements Validation domain ensures requirements are testable before development begins, generates BDD scenarios, and applies James Bach's SFDIPOT product factors for comprehensive test ideation.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Testability Score** | Measure of how testable a requirement is (0-100) |
| **BDD Scenario** | Gherkin-format test scenario |
| **Acceptance Criteria** | Conditions for requirement completion |
| **SFDIPOT** | Structure, Function, Data, Interfaces, Platform, Operations, Time |
| **Test Idea** | Generated test concept from SFDIPOT analysis |
| **Ambiguity** | Unclear or vague requirement language |
| **Clarifying Question** | Question surfaced during analysis |

## Domain Model

### Aggregates

#### RequirementAnalysis (Aggregate Root)
Complete analysis of a requirement.

```typescript
interface RequirementAnalysis {
  requirement: Requirement;
  testabilityScore: TestabilityScore;
  validationErrors: ValidationError[];
  ambiguityReport: AmbiguityReport;
  suggestedImprovements: string[];
}
```

#### SFDIPOTAssessment (Aggregate Root)
Full SFDIPOT product factors assessment.

```typescript
interface SFDIPOTAssessment {
  id: string;
  epicId: string;
  epicTitle: string;
  timestamp: Date;
  qualityScore: number;
  testIdeas: TestIdea[];
  clarifyingQuestions: ClarifyingQuestion[];
  categoryAnalysis: CategoryAnalysis[];
  domainDetection: DomainDetection;
  priorityDistribution: PriorityDistribution;
  automationDistribution: AutomationDistribution;
  outputFormats: ('html' | 'json' | 'markdown' | 'gherkin')[];
}
```

### Entities

#### Requirement
User story or requirement to validate.

```typescript
interface Requirement {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  type: 'user-story' | 'functional' | 'non-functional' | 'technical';
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'draft' | 'reviewed' | 'approved' | 'implemented';
}
```

#### BDDScenario
Gherkin-format test scenario.

```typescript
interface BDDScenario {
  id: string;
  feature: string;
  scenario: string;
  given: string[];
  when: string[];
  then: string[];
  tags: string[];
  examples?: DataTable;
}
```

#### TestIdea
Generated test idea from SFDIPOT analysis.

```typescript
interface TestIdea {
  id: string;
  description: string;
  category: SFDIPOTCategory;
  subcategory: string;
  priority: TestPriority;                     // p0 | p1 | p2 | p3
  automationFitness: AutomationFitness;       // unit | integration | e2e | human-exploration | performance | security
  reference?: string;
  humanReason?: string;                       // Required for human-exploration
}
```

### Value Objects

#### TestabilityScore
Immutable testability assessment.

```typescript
interface TestabilityScore {
  readonly value: number;                     // 0-100
  readonly category: 'excellent' | 'good' | 'fair' | 'poor';
  readonly factors: TestabilityFactor[];
}
```

#### TestabilityFactor
Individual factor in testability calculation.

```typescript
interface TestabilityFactor {
  readonly name: string;
  readonly score: number;
  readonly weight: number;
  readonly issues: string[];
}
```

#### ValidationError
Requirement validation issue.

```typescript
interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly suggestion?: string;
}
```

#### AmbiguityReport
Analysis of ambiguous language.

```typescript
interface AmbiguityReport {
  readonly ambiguousTerms: AmbiguousTerm[];
  readonly overallScore: number;
  readonly suggestions: string[];
}
```

## SFDIPOT Categories

| Category | Description | Example Test Ideas |
|----------|-------------|-------------------|
| **Structure** | Internal architecture | Component boundaries, module dependencies |
| **Function** | What it does | Core features, edge cases, error handling |
| **Data** | Information processed | Data validation, transformations, persistence |
| **Interfaces** | External connections | APIs, UI elements, integrations |
| **Platform** | Environment | OS, browsers, hardware dependencies |
| **Operations** | Usage patterns | Installation, configuration, maintenance |
| **Time** | Temporal aspects | Concurrency, scheduling, timeouts |

## Domain Services

### IRequirementsValidationCoordinator
Primary coordinator for the domain.

```typescript
interface IRequirementsValidationCoordinator {
  analyzeRequirement(requirementId: string): Promise<Result<RequirementAnalysis>>;
  generateTestArtifacts(requirementId: string): Promise<Result<TestArtifacts>>;
  validateSprintRequirements(requirementIds: string[]): Promise<Result<SprintValidation>>;
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  isConsensusAvailable(): boolean;
}
```

### ITestabilityScoringService
Evaluates requirement testability.

```typescript
interface ITestabilityScoringService {
  scoreRequirement(requirement: Requirement): Promise<Result<TestabilityScore>>;
  scoreRequirements(requirements: Requirement[]): Promise<Result<Map<string, TestabilityScore>>>;
  suggestImprovements(requirement: Requirement, score: TestabilityScore): Promise<Result<string[]>>;
  meetsThreshold(score: TestabilityScore, threshold: number): boolean;
}
```

### IBDDGenerationService
Generates Gherkin scenarios.

```typescript
interface IBDDGenerationService {
  generateScenarios(requirement: Requirement): Promise<Result<BDDScenario[]>>;
  generateScenariosWithExamples(requirement: Requirement, exampleCount: number): Promise<Result<BDDScenario[]>>;
  toGherkin(scenarios: BDDScenario[]): string;
  parseGherkin(gherkinText: string): Result<BDDScenario[]>;
}
```

### ISFDIPOTAssessmentService
SFDIPOT product factors analysis.

```typescript
interface ISFDIPOTAssessmentService {
  assess(input: AssessmentInput, config?: Partial<SFDIPOTConfig>): Promise<Result<SFDIPOTAssessment>>;
  analyzeCategory(input: AssessmentInput, category: SFDIPOTCategory): Promise<Result<CategoryAnalysis>>;
  generateTestIdeas(analysis: CategoryAnalysis, config?: Partial<SFDIPOTConfig>): Promise<Result<TestIdea[]>>;
  generateClarifyingQuestions(assessment: SFDIPOTAssessment): Promise<Result<ClarifyingQuestion[]>>;
  export(assessment: SFDIPOTAssessment, format: 'html' | 'json' | 'markdown' | 'gherkin'): Promise<Result<string>>;
}
```

### ITestIdeaRewritingService
Transforms "Verify" patterns to active test actions.

```typescript
interface ITestIdeaRewritingService {
  rewrite(inputPath: string, outputPath?: string): Promise<Result<RewritingResult>>;
  rewriteTestIdea(testIdea: string): Promise<Result<TestIdeaTransformation>>;
  validate(content: string): Promise<Result<{ isClean: boolean; remainingPatterns: string[] }>>;
  batchRewrite(inputDir: string, outputDir: string, pattern?: string): Promise<Result<RewritingResult[]>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `RequirementAnalyzedEvent` | Analysis complete | `{ requirementId, testabilityScore, improvements }` |
| `BDDScenariosGeneratedEvent` | Scenarios created | `{ requirementId, scenarios, coverageEstimate }` |
| `RequirementValidatedEvent` | Validation done | `{ requirementId, isValid, errors }` |
| `SFDIPOTAssessmentCompletedEvent` | SFDIPOT done | `{ assessmentId, testIdeasCount, qualityScore }` |

## Repositories

```typescript
interface IRequirementRepository {
  findById(id: string): Promise<Requirement | null>;
  findByStatus(status: Requirement['status']): Promise<Requirement[]>;
  findByPriority(priority: Requirement['priority']): Promise<Requirement[]>;
  save(requirement: Requirement): Promise<void>;
  delete(id: string): Promise<void>;
}

interface IBDDScenarioRepository {
  findByRequirementId(requirementId: string): Promise<BDDScenario[]>;
  findByFeature(feature: string): Promise<BDDScenario[]>;
  findByTag(tag: string): Promise<BDDScenario[]>;
  save(scenario: BDDScenario): Promise<void>;
  saveAll(scenarios: BDDScenario[]): Promise<void>;
}
```

## Context Integration

### Upstream Dependencies
- External requirement sources (Jira, Linear, Azure DevOps)

### Downstream Consumers
- **Test Generation**: Uses BDD scenarios as input
- **Quality Assessment**: Testability in quality gates

### Anti-Corruption Layer
The domain uses adapters to import requirements from different systems (Jira, Linear, etc.) and normalize them to the `Requirement` interface.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `analyze-requirement` | `analyzeRequirement()` | Full requirement analysis |
| `generate-bdd` | `generateTestArtifacts()` | BDD scenario generation |
| `validate-sprint` | `validateSprintRequirements()` | Sprint readiness check |
| `sfdipot-assess` | `assess()` | SFDIPOT analysis |

## Testability Scoring Algorithm

```typescript
function calculateTestability(requirement: Requirement): TestabilityScore {
  const factors: TestabilityFactor[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // Factor 1: Clear acceptance criteria (weight: 0.3)
  const acScore = scoreAcceptanceCriteria(requirement.acceptanceCriteria);
  factors.push({ name: 'acceptance-criteria', score: acScore, weight: 0.3, issues: [] });
  totalScore += acScore * 0.3;
  totalWeight += 0.3;

  // Factor 2: Measurable outcomes (weight: 0.25)
  const measurableScore = scoreMeasurability(requirement.description);
  factors.push({ name: 'measurability', score: measurableScore, weight: 0.25, issues: [] });
  totalScore += measurableScore * 0.25;
  totalWeight += 0.25;

  // Factor 3: Specificity (weight: 0.25)
  const specificityScore = scoreSpecificity(requirement);
  factors.push({ name: 'specificity', score: specificityScore, weight: 0.25, issues: [] });
  totalScore += specificityScore * 0.25;
  totalWeight += 0.25;

  // Factor 4: Ambiguity (weight: 0.2)
  const ambiguityScore = 100 - detectAmbiguity(requirement).overallScore;
  factors.push({ name: 'clarity', score: ambiguityScore, weight: 0.2, issues: [] });
  totalScore += ambiguityScore * 0.2;
  totalWeight += 0.2;

  const finalScore = totalScore / totalWeight;

  return {
    value: Math.round(finalScore),
    category: mapScoreToCategory(finalScore),
    factors,
  };
}
```

## ADR References

- **ADR-047**: MinCut topology awareness
- **MM-001**: Consensus for requirement validation
