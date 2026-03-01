# Defect Intelligence Domain

## Bounded Context Overview

**Domain**: Defect Intelligence
**Responsibility**: Defect prediction, root cause analysis, and regression risk assessment
**Location**: `src/domains/defect-intelligence/`

The Defect Intelligence domain uses machine learning to predict defects, analyze root causes, assess regression risk, and cluster similar defects for pattern recognition.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Defect Prediction** | ML-based probability of bugs in code |
| **Root Cause** | Underlying reason for a defect |
| **Regression Risk** | Probability of breaking existing functionality |
| **Defect Cluster** | Group of related defects with common factors |
| **Contributing Factor** | Element that influenced a defect |
| **Defect Pattern** | Learned pattern for defect prevention |
| **Impact Area** | Code region affected by changes |

## Domain Model

### Aggregates

#### PredictionResult (Aggregate Root)
Complete defect prediction analysis.

```typescript
interface PredictionResult {
  predictions: FilePrediction[];
  modelConfidence: number;
  factors: string[];
  llmAnalysis?: LLMDefectAnalysis;    // ADR-051
}
```

#### RootCauseAnalysis (Aggregate Root)
Comprehensive root cause investigation.

```typescript
interface RootCauseAnalysis {
  defectId: string;
  rootCause: string;
  confidence: number;
  contributingFactors: ContributingFactor[];
  relatedFiles: string[];
  recommendations: string[];
  timeline: TimelineEvent[];
}
```

### Entities

#### FilePrediction
Defect prediction for a single file.

```typescript
interface FilePrediction {
  file: string;
  probability: number;
  riskLevel: Severity;
  factors: { name: string; contribution: number }[];
  recommendations: string[];
}
```

#### DefectCluster
Group of related defects.

```typescript
interface DefectCluster {
  id: string;
  label: string;
  defects: string[];
  commonFactors: string[];
  suggestedFix: string;
}
```

#### DefectPattern
Learned pattern for defect prevention.

```typescript
interface DefectPattern {
  id: string;
  name: string;
  indicators: string[];
  frequency: number;
  prevention: string;
}
```

### Value Objects

#### ContributingFactor
Immutable factor contributing to a defect.

```typescript
interface ContributingFactor {
  readonly factor: string;
  readonly impact: 'high' | 'medium' | 'low';
  readonly evidence: string[];
}
```

#### RegressionRisk
Immutable regression risk assessment.

```typescript
interface RegressionRisk {
  readonly overallRisk: number;
  readonly riskLevel: Severity;
  readonly impactedAreas: ImpactedArea[];
  readonly recommendedTests: string[];
  readonly confidence: number;
}
```

#### ImpactedArea
Code area affected by changes.

```typescript
interface ImpactedArea {
  readonly area: string;
  readonly files: string[];
  readonly risk: number;
  readonly reason: string;
}
```

#### LLMDefectAnalysis
AI-enhanced defect analysis (ADR-051).

```typescript
interface LLMDefectAnalysis {
  readonly riskFactors: string[];
  readonly reviewFocusAreas: string[];
  readonly similarHistoricalDefects: string[];
  readonly confidenceLevel: number;
  readonly explanation: string;
}
```

## Domain Services

### DefectIntelligenceAPI
Primary API for the domain.

```typescript
interface DefectIntelligenceAPI {
  predictDefects(request: PredictRequest): Promise<Result<PredictionResult, Error>>;
  analyzeRootCause(request: RootCauseRequest): Promise<Result<RootCauseAnalysis, Error>>;
  analyzeRegressionRisk(request: RegressionRequest): Promise<Result<RegressionRisk, Error>>;
  clusterDefects(request: ClusterRequest): Promise<Result<DefectClusters, Error>>;
  learnPatterns(request: LearnRequest): Promise<Result<LearnedDefectPatterns, Error>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `DefectPredictedEvent` | Prediction complete | `{ file, probability, riskLevel }` |
| `RootCauseIdentifiedEvent` | Root cause found | `{ defectId, rootCause, confidence }` |
| `RegressionRiskAssessedEvent` | Risk calculated | `{ changeset, riskLevel, impactedAreas }` |
| `DefectPatternLearnedEvent` | New pattern learned | `{ patternId, indicators, frequency }` |

## Prediction Features

The defect prediction model uses these features:

| Feature | Weight | Description |
|---------|--------|-------------|
| `change_frequency` | 0.20 | How often file changes |
| `complexity` | 0.15 | Cyclomatic complexity |
| `code_churn` | 0.15 | Lines added/removed recently |
| `author_experience` | 0.10 | Author's familiarity with file |
| `dependency_count` | 0.10 | Number of dependencies |
| `test_coverage` | 0.10 | Current test coverage |
| `historical_defects` | 0.15 | Past defects in file |
| `code_age` | 0.05 | Time since last major refactor |

## Clustering Methods

| Method | Use Case | Algorithm |
|--------|----------|-----------|
| `semantic` | Text similarity | TF-IDF + K-Means |
| `behavioral` | Failure patterns | DBSCAN on execution traces |
| `temporal` | Time-based grouping | Hierarchical clustering |

## Context Integration

### Upstream Dependencies
- **Code Intelligence**: Dependency graphs, complexity metrics
- **Test Execution**: Failure history
- **Learning Optimization**: Pattern storage

### Downstream Consumers
- **Test Generation**: Targets high-risk areas
- **Quality Assessment**: Risk scores for gates

### Anti-Corruption Layer
The domain abstracts different bug tracking systems (Jira, GitHub Issues, Linear) through the `DefectInfo` interface.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `predict-defects` | `predictDefects()` | ML-based prediction |
| `analyze-root-cause` | `analyzeRootCause()` | Root cause analysis |
| `assess-regression` | `analyzeRegressionRisk()` | Regression risk |
| `cluster-defects` | `clusterDefects()` | Defect clustering |
| `learn-patterns` | `learnPatterns()` | Pattern learning |

## Risk Calculation

```typescript
function calculateRegressionRisk(
  changeset: string[],
  dependencies: DependencyGraph,
  history: DefectHistory
): RegressionRisk {
  const impactedAreas: ImpactedArea[] = [];
  let totalRisk = 0;

  for (const file of changeset) {
    // Direct impact
    const directDeps = dependencies.getOutgoing(file);
    const historicalDefects = history.getDefectsFor(file);

    const fileRisk = calculateFileRisk({
      changeSize: getChangeSize(file),
      complexity: getComplexity(file),
      testCoverage: getCoverage(file),
      historicalDefectRate: historicalDefects.length / history.totalPeriod,
      dependentCount: directDeps.length,
    });

    totalRisk = Math.max(totalRisk, fileRisk);

    if (fileRisk > 0.3) {
      impactedAreas.push({
        area: file,
        files: [file, ...directDeps],
        risk: fileRisk,
        reason: determineRiskReason(fileRisk, historicalDefects),
      });
    }
  }

  return {
    overallRisk: totalRisk,
    riskLevel: mapRiskToSeverity(totalRisk),
    impactedAreas,
    recommendedTests: selectTestsForRisk(impactedAreas),
    confidence: calculateConfidence(changeset, history),
  };
}
```

## ADR References

- **ADR-051**: LLM-powered root cause analysis
- **ADR-006**: HNSW indexing for pattern search
