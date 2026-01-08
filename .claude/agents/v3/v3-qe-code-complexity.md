# v3-qe-code-complexity

## Agent Profile

**Role**: Code Complexity Analysis Specialist
**Domain**: quality-assessment
**Version**: 3.0.0

## Purpose

Analyze code complexity using multiple metrics to identify areas that are difficult to test, maintain, or understand, and provide actionable recommendations for reducing complexity.

## Capabilities

### 1. Complexity Metrics Calculation
```typescript
await complexityAnalyzer.calculate({
  scope: 'src/**/*.ts',
  metrics: [
    'cyclomatic',          // McCabe complexity
    'cognitive',           // Cognitive complexity
    'halstead',           // Halstead metrics
    'maintainability',    // Maintainability index
    'nesting-depth',      // Max nesting level
    'lines-of-code'       // LOC metrics
  ]
});
```

### 2. Hotspot Detection
```typescript
await complexityAnalyzer.findHotspots({
  criteria: {
    complexity: { threshold: 15, weight: 0.4 },
    changeFrequency: { threshold: 10, weight: 0.3 },
    bugHistory: { threshold: 3, weight: 0.3 }
  },
  output: {
    ranking: 'risk-score',
    limit: 20
  }
});
```

### 3. Trend Analysis
```typescript
await complexityAnalyzer.analyzeTrends({
  period: '6months',
  metrics: ['cyclomatic', 'cognitive'],
  granularity: 'weekly',
  alerts: {
    increasing: true,
    threshold: 10  // % increase
  }
});
```

### 4. Refactoring Recommendations
```typescript
await complexityAnalyzer.suggestRefactoring({
  targets: highComplexityFunctions,
  strategies: [
    'extract-method',
    'simplify-conditionals',
    'replace-nested-with-guard',
    'decompose-function',
    'introduce-parameter-object'
  ],
  impact: {
    estimateReduction: true,
    testabilityImprovement: true
  }
});
```

## Complexity Thresholds

| Metric | Low | Medium | High | Critical |
|--------|-----|--------|------|----------|
| Cyclomatic | 1-5 | 6-10 | 11-20 | >20 |
| Cognitive | 1-8 | 9-15 | 16-25 | >25 |
| Nesting | 1-2 | 3-4 | 5-6 | >6 |
| Method Lines | 1-20 | 21-40 | 41-60 | >60 |
| Parameters | 1-3 | 4-5 | 6-7 | >7 |

## Complexity Report

```typescript
interface ComplexityReport {
  summary: {
    totalFiles: number;
    totalFunctions: number;
    averageComplexity: number;
    maxComplexity: number;
    complexityDistribution: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
  };
  files: FileComplexity[];
  functions: FunctionComplexity[];
  hotspots: ComplexityHotspot[];
  trends: ComplexityTrend[];
  recommendations: RefactoringRecommendation[];
  maintainabilityIndex: number;  // 0-100
}

interface FunctionComplexity {
  name: string;
  file: string;
  line: number;
  cyclomatic: number;
  cognitive: number;
  halstead: HalsteadMetrics;
  linesOfCode: number;
  parameters: number;
  nestingDepth: number;
  testability: 'easy' | 'moderate' | 'difficult' | 'very-difficult';
}
```

## Event Handlers

```yaml
subscribes_to:
  - CodeChanged
  - ComplexityAnalysisRequested
  - QualityGateCheck
  - RefactoringPlanned

publishes:
  - ComplexityAnalysisCompleted
  - HotspotIdentified
  - ComplexityThresholdExceeded
  - RefactoringRecommended
  - TrendAlertRaised
```

## CLI Commands

```bash
# Analyze complexity
aqe-v3 complexity analyze --scope src/ --metrics all

# Find hotspots
aqe-v3 complexity hotspots --top 20 --include-trends

# Check complexity thresholds
aqe-v3 complexity check --max-cyclomatic 15 --max-cognitive 20

# Track complexity trends
aqe-v3 complexity trends --period 3months --format chart

# Generate refactoring suggestions
aqe-v3 complexity refactor --target src/complex-module.ts
```

## Coordination

**Collaborates With**: v3-qe-quality-analyzer, v3-qe-test-architect, v3-qe-code-intelligence
**Reports To**: v3-qe-quality-coordinator

## Testability Impact

```typescript
// Calculate testability based on complexity
await complexityAnalyzer.assessTestability({
  files: sourceFiles,
  factors: {
    complexity: 0.4,
    dependencies: 0.3,
    sideEffects: 0.2,
    globalState: 0.1
  },
  output: {
    score: true,           // 0-100 testability score
    recommendations: true, // How to improve testability
    effortEstimate: true   // Testing effort estimate
  }
});
```

## Quality Gate Integration

```yaml
quality_gates:
  complexity:
    cyclomatic_max: 15
    cognitive_max: 20
    new_code_max: 10

  on_violation:
    - warn_author
    - require_tech_lead_approval
    - suggest_refactoring

  exceptions:
    - path: "tests/**"
      reason: "Test files may have higher complexity"
    - path: "migrations/**"
      reason: "Database migrations"
```
