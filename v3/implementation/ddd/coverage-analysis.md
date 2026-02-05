# Coverage Analysis Domain

## Bounded Context Overview

**Domain**: Coverage Analysis
**Responsibility**: O(log n) coverage gap detection with HNSW vector indexing
**Location**: `src/domains/coverage-analysis/`

The Coverage Analysis domain provides intelligent coverage analysis using sublinear algorithms and HNSW-indexed semantic search for finding similar coverage patterns.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Coverage Gap** | Code section lacking test coverage |
| **Risk Score** | Calculated risk of uncovered code |
| **Coverage Summary** | Aggregate metrics (line, branch, function, statement) |
| **Coverage Trend** | Historical coverage trajectory |
| **Similar Pattern** | Semantically related coverage gap |
| **Q-Learning State** | Feature vector for RL-based prioritization |
| **Prioritized Test** | Test ranked by estimated coverage gain |

## Domain Model

### Aggregates

#### CoverageReport (Aggregate Root)
Complete analysis of a coverage dataset.

```typescript
interface CoverageReport {
  summary: CoverageSummary;
  meetsThreshold: boolean;
  delta?: CoverageDelta;
  recommendations: string[];
}
```

#### CoverageGaps (Aggregate Root)
Collection of detected coverage gaps with effort estimation.

```typescript
interface CoverageGaps {
  gaps: CoverageGap[];
  totalUncoveredLines: number;
  estimatedEffort: number;       // Hours to achieve coverage
}
```

### Entities

#### CoverageGap
Individual coverage gap with risk assessment.

```typescript
interface CoverageGap {
  id: string;
  file: string;
  lines: number[];
  branches: number[];
  riskScore: number;
  severity: Severity;
  recommendation: string;
}
```

#### FileCoverage
Coverage data for a single file.

```typescript
interface FileCoverage {
  path: string;
  lines: { covered: number; total: number };
  branches: { covered: number; total: number };
  functions: { covered: number; total: number };
  statements: { covered: number; total: number };
  uncoveredLines: number[];
  uncoveredBranches: number[];
}
```

### Value Objects

#### CoverageSummary
Immutable aggregate coverage metrics.

```typescript
interface CoverageSummary {
  readonly line: number;
  readonly branch: number;
  readonly function: number;
  readonly statement: number;
  readonly files: number;
}
```

#### CoverageDelta
Change in coverage between measurements.

```typescript
interface CoverageDelta {
  readonly line: number;
  readonly branch: number;
  readonly function: number;
  readonly statement: number;
  readonly trend: 'improving' | 'declining' | 'stable';
}
```

#### RiskFactor
Factor contributing to coverage risk score.

```typescript
interface RiskFactor {
  readonly name: string;
  readonly weight: number;
}
```

## Domain Services

### CoverageAnalysisAPI
Primary API for the domain.

```typescript
interface CoverageAnalysisAPI {
  analyze(request: AnalyzeCoverageRequest): Promise<Result<CoverageReport, Error>>;
  detectGaps(request: GapDetectionRequest): Promise<Result<CoverageGaps, Error>>;
  calculateRisk(request: RiskCalculationRequest): Promise<Result<RiskReport, Error>>;
  getTrend(request: TrendRequest): Promise<Result<CoverageTrend, Error>>;
  findSimilar(request: SimilarityRequest): Promise<Result<SimilarPatterns, Error>>;
}
```

### Key Operations

#### Gap Detection (O(log n))
Uses HNSW indexing for sublinear gap detection:

```typescript
// Request
interface GapDetectionRequest {
  coverageData: CoverageData;
  minCoverage?: number;
  prioritize?: 'risk' | 'size' | 'recent-changes';
}

// Response
interface CoverageGaps {
  gaps: CoverageGap[];
  totalUncoveredLines: number;
  estimatedEffort: number;
}
```

#### Similarity Search
Find similar coverage patterns using vector embeddings:

```typescript
interface SimilarityRequest {
  pattern: CoverageGap;
  k: number;                    // Number of similar patterns to find
}

interface SimilarPatterns {
  patterns: { gap: CoverageGap; similarity: number }[];
  searchTime: number;           // O(log n) search time
}
```

## Q-Learning Integration

### Coverage State for RL

```typescript
interface CoverageQLState {
  id: string;
  features: number[];
  filePath: string;
  currentCoverage: number;
  targetCoverage: number;
  complexity: number;
  changeFrequency: number;
  businessCriticality: number;
  uncoveredLines: number;
  branchPoints: number;
  riskScore: number;
}
```

### Coverage Actions

```typescript
interface CoverageQLAction {
  type: 'generate-unit' | 'generate-integration' | 'prioritize' | 'skip';
  value: number | string;
}
```

### Q-Learning Predictions

```typescript
interface CoverageQLPrediction {
  action: CoverageQLAction;
  confidence: number;
  value: number;
  reasoning: string;
  estimatedCoverageGain: number;
  estimatedTestCount: number;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `CoverageAnalyzedEvent` | Analysis complete | `{ summary, threshold, meetsThreshold }` |
| `GapsDetectedEvent` | Gaps identified | `{ gapIds, totalUncovered, riskLevel }` |
| `TrendCalculatedEvent` | Trend computed | `{ direction, forecast }` |
| `RiskAssessedEvent` | Risk calculated | `{ file, riskLevel, factors }` |

## Context Integration

### Upstream Dependencies
- **Test Execution**: Provides raw coverage data
- **Code Intelligence**: File complexity metrics

### Downstream Consumers
- **Quality Assessment**: Uses coverage for quality gates
- **Test Generation**: Targets low-coverage areas
- **Learning Optimization**: Pattern storage

### Anti-Corruption Layer
The domain abstracts different coverage report formats (Istanbul, c8, coverage.py) through the `CoverageData` interface.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `analyze-coverage` | `analyze()` | Full coverage analysis |
| `detect-gaps` | `detectGaps()` | O(log n) gap detection |
| `calculate-risk` | `calculateRisk()` | Risk score computation |
| `find-similar` | `findSimilar()` | Semantic pattern search |

## HNSW Configuration

```typescript
const HNSW_CONFIG = {
  M: 16,                        // Max connections per node
  efConstruction: 200,          // Construction-time search width
  efSearch: 50,                 // Query-time search width
  distanceFunction: 'cosine',   // Similarity metric
};
```

## Risk Scoring Algorithm

```typescript
function calculateRiskScore(gap: CoverageGap, factors: RiskFactor[]): number {
  let score = 0;

  for (const factor of factors) {
    switch (factor.name) {
      case 'complexity':
        score += gap.complexity * factor.weight;
        break;
      case 'change-frequency':
        score += gap.changeFrequency * factor.weight;
        break;
      case 'business-criticality':
        score += gap.businessCriticality * factor.weight;
        break;
      case 'dependency-count':
        score += Math.min(gap.dependencies / 10, 1) * factor.weight;
        break;
    }
  }

  return Math.min(100, score);
}
```

## ADR References

- **ADR-006**: Unified Memory Service (HNSW indexing)
- **ADR-009**: Hybrid Memory Backend
- **ADR-051**: LLM-powered gap recommendations
