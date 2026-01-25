# v3-qe-core-implementation

## Purpose
Guide the implementation of AQE v3 core domain entities, repositories, and use cases following DDD patterns.

## Activation
- When implementing v3 domain entities or value objects
- When creating v3 repositories and use cases
- When building domain services for QE
- When implementing aggregate roots

## Domain Implementation Patterns

### 1. Test Generation Domain

```typescript
// v3/src/domains/test-generation/entities/TestSuite.ts
import { Entity, UniqueId } from '@aqe/shared-kernel';
import { TestCase } from './TestCase';
import { TestSuiteCreated, TestCaseAdded } from '../events';

export class TestSuite extends Entity<TestSuiteId> {
  private readonly _name: string;
  private readonly _targetPath: string;
  private readonly _framework: TestFramework;
  private readonly _testCases: TestCase[] = [];
  private _coverage: CoverageMetrics | null = null;

  private constructor(props: TestSuiteProps) {
    super(props.id);
    this._name = props.name;
    this._targetPath = props.targetPath;
    this._framework = props.framework;
  }

  static create(props: CreateTestSuiteProps): TestSuite {
    const id = TestSuiteId.create();
    const suite = new TestSuite({ id, ...props });
    suite.addDomainEvent(new TestSuiteCreated(suite));
    return suite;
  }

  addTestCase(testCase: TestCase): void {
    this._testCases.push(testCase);
    this.addDomainEvent(new TestCaseAdded(this.id, testCase));
  }

  get testCases(): ReadonlyArray<TestCase> {
    return [...this._testCases];
  }

  calculateCoverage(): CoverageMetrics {
    // Coverage calculation logic
  }
}
```

### 2. Coverage Analysis Domain

```typescript
// v3/src/domains/coverage-analysis/entities/CoverageReport.ts
import { AggregateRoot } from '@aqe/shared-kernel';
import { CoverageGap } from '../value-objects/CoverageGap';
import { RiskScore } from '../value-objects/RiskScore';

export class CoverageReport extends AggregateRoot<CoverageReportId> {
  private readonly _targetPath: string;
  private readonly _lineCoverage: number;
  private readonly _branchCoverage: number;
  private readonly _functionCoverage: number;
  private readonly _gaps: CoverageGap[] = [];
  private readonly _analyzedAt: Date;

  analyzeGaps(codebaseVectors: Vector[]): CoverageGap[] {
    // O(log n) gap detection using HNSW
    const gapDetector = new SublinearGapDetector();
    this._gaps.push(...gapDetector.detectGaps(codebaseVectors));
    return this._gaps;
  }

  calculateRiskScore(): RiskScore {
    return RiskScore.calculate({
      lineCoverage: this._lineCoverage,
      branchCoverage: this._branchCoverage,
      gapCount: this._gaps.length,
      criticalGaps: this._gaps.filter(g => g.isCritical).length
    });
  }
}
```

### 3. Quality Assessment Domain

```typescript
// v3/src/domains/quality-assessment/entities/QualityGate.ts
export class QualityGate extends AggregateRoot<QualityGateId> {
  private readonly _name: string;
  private readonly _criteria: QualityCriterion[] = [];
  private _status: GateStatus = 'pending';
  private _evaluations: CriterionEvaluation[] = [];

  static createDefault(): QualityGate {
    return QualityGate.create({
      name: 'Default Quality Gate',
      criteria: [
        QualityCriterion.coverage(80),
        QualityCriterion.testPassRate(100),
        QualityCriterion.securityVulnerabilities(0),
        QualityCriterion.codeComplexity(15),
        QualityCriterion.duplicateCode(3)
      ]
    });
  }

  evaluate(metrics: QualityMetrics): GateResult {
    this._evaluations = this._criteria.map(criterion =>
      criterion.evaluate(metrics)
    );

    const passed = this._evaluations.every(e => e.passed);
    this._status = passed ? 'passed' : 'failed';

    this.addDomainEvent(new QualityGateEvaluated(this.id, passed));

    return {
      passed,
      evaluations: this._evaluations,
      recommendations: this.generateRecommendations()
    };
  }
}
```

### 4. Defect Intelligence Domain

```typescript
// v3/src/domains/defect-intelligence/entities/DefectPrediction.ts
export class DefectPrediction extends Entity<DefectPredictionId> {
  private readonly _filePath: string;
  private readonly _probability: number;
  private readonly _riskFactors: RiskFactor[];
  private readonly _historicalDefects: DefectHistory[];
  private readonly _predictedAt: Date;

  static async predict(
    filePath: string,
    patternLearner: PatternLearner
  ): Promise<DefectPrediction> {
    const embedding = await patternLearner.getFileEmbedding(filePath);
    const similarDefects = await patternLearner.findSimilarDefectPatterns(embedding);

    const probability = calculateDefectProbability(similarDefects);
    const riskFactors = identifyRiskFactors(filePath, similarDefects);

    return new DefectPrediction({
      id: DefectPredictionId.create(),
      filePath,
      probability,
      riskFactors,
      historicalDefects: similarDefects,
      predictedAt: new Date()
    });
  }
}
```

## Repository Patterns

```typescript
// v3/src/domains/test-generation/repositories/TestSuiteRepository.ts
export interface TestSuiteRepository {
  save(testSuite: TestSuite): Promise<void>;
  findById(id: TestSuiteId): Promise<TestSuite | null>;
  findByTargetPath(path: string): Promise<TestSuite[]>;
  findAll(): Promise<TestSuite[]>;
  delete(id: TestSuiteId): Promise<void>;
}

// v3/src/infrastructure/persistence/AgentDBTestSuiteRepository.ts
export class AgentDBTestSuiteRepository implements TestSuiteRepository {
  constructor(private readonly agentDB: AgentDB) {}

  async save(testSuite: TestSuite): Promise<void> {
    const embedding = await this.generateEmbedding(testSuite);
    await this.agentDB.store({
      id: testSuite.id.value,
      type: 'test-suite',
      data: testSuite.toJSON(),
      embedding
    });
  }

  async findById(id: TestSuiteId): Promise<TestSuite | null> {
    const record = await this.agentDB.get(id.value);
    return record ? TestSuite.fromJSON(record.data) : null;
  }

  async findByTargetPath(path: string): Promise<TestSuite[]> {
    // Use HNSW vector search for semantic matching
    const embedding = await this.generatePathEmbedding(path);
    const results = await this.agentDB.search(embedding, {
      filter: { type: 'test-suite' },
      limit: 100
    });
    return results.map(r => TestSuite.fromJSON(r.data));
  }
}
```

## Use Case Patterns

```typescript
// v3/src/domains/test-generation/use-cases/GenerateTestSuite.ts
export class GenerateTestSuiteUseCase {
  constructor(
    private readonly testSuiteRepo: TestSuiteRepository,
    private readonly aiTestGenerator: AITestGenerator,
    private readonly eventBus: DomainEventBus
  ) {}

  async execute(request: GenerateTestSuiteRequest): Promise<GenerateTestSuiteResponse> {
    // 1. Analyze source code
    const analysis = await this.aiTestGenerator.analyzeCode(request.sourcePath);

    // 2. Create test suite entity
    const testSuite = TestSuite.create({
      name: `${analysis.moduleName}Tests`,
      targetPath: request.sourcePath,
      framework: request.framework
    });

    // 3. Generate test cases
    const testCases = await this.aiTestGenerator.generateTests(analysis, {
      coverage: request.coverageTarget,
      style: request.testStyle
    });

    testCases.forEach(tc => testSuite.addTestCase(tc));

    // 4. Persist
    await this.testSuiteRepo.save(testSuite);

    // 5. Publish domain events
    await this.eventBus.publishAll(testSuite.domainEvents);

    return {
      testSuiteId: testSuite.id.value,
      testCount: testSuite.testCases.length,
      estimatedCoverage: testSuite.calculateCoverage()
    };
  }
}
```

## Value Objects

```typescript
// v3/src/domains/shared/value-objects/CoveragePercentage.ts
export class CoveragePercentage extends ValueObject<number> {
  private constructor(value: number) {
    super(value);
  }

  static create(value: number): CoveragePercentage {
    if (value < 0 || value > 100) {
      throw new InvalidCoverageError(`Coverage must be 0-100, got ${value}`);
    }
    return new CoveragePercentage(value);
  }

  meetsThreshold(threshold: number): boolean {
    return this.value >= threshold;
  }

  get isExcellent(): boolean {
    return this.value >= 90;
  }

  get isGood(): boolean {
    return this.value >= 80;
  }
}

// v3/src/domains/shared/value-objects/TestFramework.ts
export class TestFramework extends ValueObject<string> {
  static readonly JEST = new TestFramework('jest');
  static readonly VITEST = new TestFramework('vitest');
  static readonly PLAYWRIGHT = new TestFramework('playwright');
  static readonly PYTEST = new TestFramework('pytest');

  get configFile(): string {
    const configs: Record<string, string> = {
      jest: 'jest.config.js',
      vitest: 'vitest.config.ts',
      playwright: 'playwright.config.ts',
      pytest: 'pytest.ini'
    };
    return configs[this.value];
  }
}
```

## Domain Services

```typescript
// v3/src/domains/test-generation/services/TestOptimizationService.ts
export class TestOptimizationService {
  constructor(
    private readonly coverageAnalyzer: CoverageAnalyzer,
    private readonly defectPredictor: DefectPredictor
  ) {}

  async optimizeTestSuite(testSuite: TestSuite): Promise<OptimizationResult> {
    // 1. Analyze current coverage
    const coverage = await this.coverageAnalyzer.analyze(testSuite);

    // 2. Identify redundant tests
    const redundantTests = this.findRedundantTests(testSuite, coverage);

    // 3. Prioritize by defect probability
    const priorities = await this.defectPredictor.prioritizeTests(testSuite.testCases);

    // 4. Generate optimization recommendations
    return {
      redundantTests,
      priorities,
      estimatedTimeReduction: this.calculateTimeReduction(redundantTests),
      recommendations: this.generateRecommendations(coverage, priorities)
    };
  }
}
```

## File Structure

```
v3/src/domains/
├── test-generation/
│   ├── entities/
│   │   ├── TestSuite.ts
│   │   ├── TestCase.ts
│   │   └── TestAssertion.ts
│   ├── value-objects/
│   │   ├── TestType.ts
│   │   └── ExpectedOutcome.ts
│   ├── repositories/
│   │   └── TestSuiteRepository.ts
│   ├── services/
│   │   ├── AITestGenerator.ts
│   │   └── TestOptimizationService.ts
│   ├── use-cases/
│   │   ├── GenerateTestSuite.ts
│   │   └── OptimizeTests.ts
│   └── events/
│       ├── TestSuiteCreated.ts
│       └── TestCaseAdded.ts
├── coverage-analysis/
│   ├── entities/
│   │   └── CoverageReport.ts
│   ├── value-objects/
│   │   ├── CoverageGap.ts
│   │   └── RiskScore.ts
│   └── services/
│       └── SublinearGapDetector.ts
├── quality-assessment/
│   ├── entities/
│   │   └── QualityGate.ts
│   ├── value-objects/
│   │   └── QualityCriterion.ts
│   └── use-cases/
│       └── EvaluateQualityGate.ts
├── defect-intelligence/
│   ├── entities/
│   │   └── DefectPrediction.ts
│   └── services/
│       └── PatternLearner.ts
├── test-execution/
│   ├── entities/
│   │   └── TestRun.ts
│   └── services/
│       └── ParallelExecutor.ts
└── learning-optimization/
    ├── entities/
    │   └── LearningPattern.ts
    └── services/
        └── CrossDomainTransfer.ts
```

## Implementation Checklist

- [ ] Create shared kernel with base classes
- [ ] Implement test-generation domain entities
- [ ] Implement coverage-analysis domain entities
- [ ] Implement quality-assessment domain entities
- [ ] Implement defect-intelligence domain entities
- [ ] Create AgentDB repository implementations
- [ ] Implement domain services
- [ ] Create use cases for each domain
- [ ] Set up domain event bus
- [ ] Write unit tests for entities
- [ ] Write integration tests for repositories

## Related Skills
- v3-qe-ddd-architecture - Architecture patterns
- v3-qe-memory-system - AgentDB integration
- v3-qe-fleet-coordination - Agent orchestration
