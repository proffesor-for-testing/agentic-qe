# v3-qe-regression-analyzer

## Agent Profile

**Role**: Regression Risk Analysis & Test Selection
**Domain**: defect-intelligence
**Version**: 3.0.0
**Migrated From**: qe-regression-risk-analyzer (v2)

## Purpose

Analyze code changes to predict regression risk and intelligently select minimal test suites that maximize coverage while minimizing execution time.

## Capabilities

### 1. Regression Risk Prediction

```typescript
// Analyze regression risk for changes
const risk = await regressionAnalyzer.analyzeRisk({
  changes: [
    { file: 'src/auth/user-service.ts', type: 'modified' },
    { file: 'src/api/endpoints.ts', type: 'modified' }
  ],
  baseBranch: 'main'
});

// Returns:
// - overall risk score (0-100)
// - per-file risk scores
// - risk factors (complexity, history, dependencies)
// - recommended test strategy
```

### 2. Intelligent Test Selection

```typescript
// Select optimal test suite for changes
const tests = await regressionAnalyzer.selectTests({
  changes: changedFiles,
  strategy: 'risk-based',  // risk-based | impact-based | time-constrained
  constraints: {
    maxExecutionTime: 300,  // 5 minutes
    minCoverage: 80
  }
});

// Returns:
// - selected tests (prioritized)
// - estimated execution time
// - estimated coverage
// - risk coverage percentage
```

### 3. Historical Analysis

```typescript
// Learn from historical data
const patterns = await regressionAnalyzer.analyzeHistory({
  repository: 'my-project',
  timeRange: '6 months',
  includeMetrics: ['failure_rate', 'change_frequency', 'bug_density']
});

// Returns:
// - hot spots (frequently failing areas)
// - stable areas
// - seasonal patterns
// - developer-specific patterns
```

### 4. Change Impact Scoring

```typescript
// Score change impact
const impact = await regressionAnalyzer.scoreImpact({
  commit: 'abc123',
  considerDependencies: true,
  includeTransitive: true
});

// Returns impact score based on:
// - Lines changed
// - Complexity of changed code
// - Number of dependents
// - Historical bug rate of files
// - Test coverage of changed areas
```

## Domain Model

```typescript
// v3/src/domains/defect-intelligence/entities/RegressionAnalysis.ts
export class RegressionAnalysis extends AggregateRoot<AnalysisId> {
  private readonly _changes: CodeChange[];
  private readonly _historicalData: DefectHistory;
  private _riskScore: RiskScore;
  private _selectedTests: Test[] = [];
  private _riskFactors: RiskFactor[] = [];

  calculateRisk(): RiskScore {
    const factors: RiskFactor[] = [];

    // Factor 1: Change complexity
    const complexityFactor = this.calculateComplexityFactor();
    factors.push(complexityFactor);

    // Factor 2: Historical defect density
    const historyFactor = this.calculateHistoryFactor();
    factors.push(historyFactor);

    // Factor 3: Dependency impact
    const dependencyFactor = this.calculateDependencyFactor();
    factors.push(dependencyFactor);

    // Factor 4: Code coverage
    const coverageFactor = this.calculateCoverageFactor();
    factors.push(coverageFactor);

    // Factor 5: Developer experience
    const experienceFactor = this.calculateExperienceFactor();
    factors.push(experienceFactor);

    this._riskFactors = factors;
    this._riskScore = RiskScore.fromFactors(factors);

    this.addDomainEvent(new RegressionRiskAnalyzed(this.id, this._riskScore));

    return this._riskScore;
  }

  selectOptimalTests(constraints: TestConstraints): Test[] {
    // Use HNSW to find tests related to changed code
    const relatedTests = await this.findRelatedTests();

    // Prioritize by risk contribution
    const prioritized = this.prioritizeByRisk(relatedTests);

    // Apply constraints (time, coverage)
    this._selectedTests = this.applyConstraints(prioritized, constraints);

    this.addDomainEvent(new TestsSelected(this.id, this._selectedTests));

    return this._selectedTests;
  }

  private calculateComplexityFactor(): RiskFactor {
    const avgComplexity = this._changes.reduce(
      (sum, c) => sum + c.cyclomaticComplexity, 0
    ) / this._changes.length;

    return new RiskFactor('complexity', avgComplexity / 10, 0.25);
  }

  private calculateHistoryFactor(): RiskFactor {
    const bugCount = this._historicalData.getBugCountForFiles(
      this._changes.map(c => c.filePath)
    );
    return new RiskFactor('history', Math.min(bugCount / 10, 1), 0.30);
  }
}
```

## Risk Scoring Algorithm

```typescript
// Risk calculation weights
const RISK_WEIGHTS = {
  complexity: 0.25,      // Code complexity
  history: 0.30,         // Historical defects
  dependencies: 0.20,    // Impact on dependents
  coverage: 0.15,        // Test coverage gaps
  experience: 0.10       // Developer familiarity
};

// Risk levels
enum RiskLevel {
  CRITICAL = 'critical',  // 80-100: Full regression suite
  HIGH = 'high',          // 60-79: Extended test suite
  MEDIUM = 'medium',      // 40-59: Standard test suite
  LOW = 'low'             // 0-39: Minimal test suite
}
```

## CLI Commands

```bash
# Analyze regression risk
aqe regression analyze --changes HEAD~5..HEAD

# Select tests for changes
aqe regression select --strategy risk-based --max-time 300

# Show risk report
aqe regression report --format markdown

# Historical analysis
aqe regression history --range "6 months" --hotspots

# Test optimization
aqe regression optimize --target-coverage 90 --max-time 600
```

## Event Handlers

```yaml
subscribes_to:
  - CommitPushed
  - PullRequestOpened
  - CodeChanged
  - TestCompleted

publishes:
  - RegressionRiskAnalyzed
  - TestsSelected
  - HotSpotDetected
  - RiskPatternLearned
```

## Coordination

**Collaborates With**:
- v3-qe-defect-predictor - Defect probability
- v3-qe-pattern-learner - Pattern recognition
- v3-qe-code-intelligence - Change impact
- v3-qe-parallel-executor - Test execution
- v3-qe-coverage-specialist - Coverage gaps

**Reports To**:
- v3-qe-queen-coordinator

## Integration with Quality Gate

```typescript
// Regression analysis in quality gate
const qualityGate = QualityGate.create({
  criteria: [
    QualityCriterion.regressionRisk(60),        // Max 60 risk score
    QualityCriterion.regressionTestCoverage(90), // 90% of risk covered
    QualityCriterion.hotSpotsCovered(100)        // All hot spots tested
  ]
});
```

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Risk analysis | < 5 sec | For typical PR |
| Test selection | < 2 sec | Using HNSW |
| Historical query | < 1 sec | Cached data |

## Configuration

```yaml
# .agentic-qe/config.yaml
regressionAnalysis:
  riskWeights:
    complexity: 0.25
    history: 0.30
    dependencies: 0.20
    coverage: 0.15
    experience: 0.10
  thresholds:
    critical: 80
    high: 60
    medium: 40
  testSelection:
    defaultStrategy: risk-based
    maxTests: 500
    minCoverage: 80
  history:
    lookbackDays: 180
    minSamples: 10
```
