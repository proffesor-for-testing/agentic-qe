# Quality Assessment Domain

## Bounded Context Overview

**Domain**: Quality Assessment
**Responsibility**: Intelligent quality gate decisions and deployment recommendations
**Location**: `src/domains/quality-assessment/`

The Quality Assessment domain evaluates software quality metrics, enforces quality gates, and provides AI-powered deployment recommendations.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Quality Gate** | Set of thresholds that must pass for release |
| **Gate Check** | Individual threshold evaluation |
| **Quality Score** | Aggregate quality rating (A-E) |
| **Deployment Advice** | AI recommendation for release decisions |
| **Complexity Hotspot** | High-complexity code requiring attention |
| **Technical Debt** | Accumulated quality issues requiring remediation |
| **Quality Trend** | Historical quality trajectory |

## Domain Model

### Aggregates

#### GateResult (Aggregate Root)
Complete result of a quality gate evaluation.

```typescript
interface GateResult {
  gateName: string;
  passed: boolean;
  checks: GateCheck[];
  overallScore: number;
  failedChecks: string[];
}
```

#### QualityReport (Aggregate Root)
Comprehensive quality analysis with recommendations.

```typescript
interface QualityReport {
  score: QualityScore;
  metrics: QualityMetricDetail[];
  trends: QualityTrend[];
  recommendations: Recommendation[];
  llmInsights?: LLMQualityInsights;    // ADR-051
}
```

### Entities

#### GateCheck
Individual quality gate threshold check.

```typescript
interface GateCheck {
  name: string;
  passed: boolean;
  value: number;
  threshold: number;
  severity: Severity;
}
```

#### ComplexityHotspot
High-complexity code location.

```typescript
interface ComplexityHotspot {
  file: string;
  function: string;
  complexity: number;
  recommendation: string;
}
```

### Value Objects

#### QualityMetrics
Immutable quality metric collection.

```typescript
interface QualityMetrics {
  readonly coverage: number;
  readonly testsPassing: number;
  readonly criticalBugs: number;
  readonly codeSmells: number;
  readonly securityVulnerabilities: number;
  readonly technicalDebt: number;
  readonly duplications: number;
}
```

#### GateThresholds
Quality gate threshold configuration.

```typescript
interface GateThresholds {
  readonly coverage?: { min: number };
  readonly testsPassing?: { min: number };
  readonly criticalBugs?: { max: number };
  readonly codeSmells?: { max: number };
  readonly securityVulnerabilities?: { max: number };
  readonly technicalDebt?: { max: number };
  readonly duplications?: { max: number };
}
```

#### DeploymentAdvice
AI-generated deployment recommendation.

```typescript
interface DeploymentAdvice {
  readonly decision: 'approved' | 'warning' | 'blocked';
  readonly confidence: number;
  readonly riskScore: number;
  readonly reasons: string[];
  readonly conditions?: string[];
  readonly rollbackPlan?: string;
}
```

#### LLMQualityInsights
AI-enhanced quality insights (ADR-051).

```typescript
interface LLMQualityInsights {
  readonly explanation: string;
  readonly prioritizedRecommendations: Array<{
    priority: number;
    title: string;
    description: string;
    estimatedImpact: 'high' | 'medium' | 'low';
    estimatedEffort: 'high' | 'medium' | 'low';
  }>;
  readonly estimatedImpactOnScore: number;
  readonly keySummary: string;
}
```

## Domain Services

### QualityAssessmentAPI
Primary API for the domain.

```typescript
interface QualityAssessmentAPI {
  evaluateGate(request: GateEvaluationRequest): Promise<Result<GateResult, Error>>;
  analyzeQuality(request: QualityAnalysisRequest): Promise<Result<QualityReport, Error>>;
  getDeploymentAdvice(request: DeploymentRequest): Promise<Result<DeploymentAdvice, Error>>;
  analyzeComplexity(request: ComplexityRequest): Promise<Result<ComplexityReport, Error>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `GateEvaluatedEvent` | Gate check complete | `{ gateName, passed, failedChecks }` |
| `QualityScoreChangedEvent` | Score updated | `{ previousScore, newScore, trend }` |
| `DeploymentBlockedEvent` | Deployment blocked | `{ reasons, riskScore }` |
| `HotspotDetectedEvent` | Complexity hotspot found | `{ file, function, complexity }` |

## Quality Scoring Algorithm

```typescript
function calculateQualityScore(metrics: QualityMetrics): QualityScore {
  let score = 100;

  // Coverage impact (max 30 points)
  if (metrics.coverage < QUALITY_CONSTANTS.MIN_COVERAGE_FOR_DEPLOY) {
    score -= (QUALITY_CONSTANTS.MIN_COVERAGE_FOR_DEPLOY - metrics.coverage) * 0.3;
  }

  // Test passing rate (max 20 points)
  if (metrics.testsPassing < QUALITY_CONSTANTS.PERFECT_PASSING_RATE) {
    score -= (100 - metrics.testsPassing) * 0.2;
  }

  // Critical bugs (each bug = 10 points)
  score -= metrics.criticalBugs * 10;

  // Security vulnerabilities (capped at 30%)
  score -= Math.min(
    metrics.securityVulnerabilities * QUALITY_CONSTANTS.MAX_HIGH_VULN_IMPACT,
    30
  );

  // Code smells (diminishing impact)
  score -= Math.log10(metrics.codeSmells + 1) * 2;

  // Duplication penalty
  if (metrics.duplications > QUALITY_CONSTANTS.MAX_DUPLICATION_PERCENT) {
    score -= (metrics.duplications - QUALITY_CONSTANTS.MAX_DUPLICATION_PERCENT) * 0.5;
  }

  return mapScoreToGrade(Math.max(0, score));
}

function mapScoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}
```

## Context Integration

### Upstream Dependencies
- **Test Execution**: Test pass/fail results
- **Coverage Analysis**: Coverage metrics
- **Security Compliance**: Vulnerability counts
- **Code Intelligence**: Complexity metrics

### Downstream Consumers
- **Learning Optimization**: Quality pattern learning
- CI/CD pipelines: Gate enforcement

### Anti-Corruption Layer
The domain abstracts different quality tool outputs (SonarQube, CodeClimate, etc.) through the `QualityMetrics` interface.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `evaluate-gate` | `evaluateGate()` | Quality gate evaluation |
| `analyze-quality` | `analyzeQuality()` | Full quality analysis |
| `deployment-advice` | `getDeploymentAdvice()` | AI deployment recommendation |
| `analyze-complexity` | `analyzeComplexity()` | Complexity analysis |

## Configuration Constants

```typescript
const QUALITY_CONSTANTS = {
  PASSING_RATE_WARNING_THRESHOLD: 95,
  PASSING_RATE_CRITICAL_THRESHOLD: 80,
  MIN_COVERAGE_FOR_DEPLOY: 80,
  PERFECT_PASSING_RATE: 100,
  METRIC_TTL_SECONDS: 86400 * 7,        // 7 days
  MAX_HIGH_VULN_IMPACT: 0.3,
  MEDIUM_VULN_IMPACT: 0.1,
  MAX_DUPLICATION_PERCENT: 20,
};
```

## Quality Gate Templates

### Default Gate
```yaml
name: default
thresholds:
  coverage: { min: 80 }
  testsPassing: { min: 95 }
  criticalBugs: { max: 0 }
  securityVulnerabilities: { max: 0 }
  duplications: { max: 5 }
```

### Strict Gate
```yaml
name: strict
thresholds:
  coverage: { min: 90 }
  testsPassing: { min: 100 }
  criticalBugs: { max: 0 }
  codeSmells: { max: 10 }
  securityVulnerabilities: { max: 0 }
  technicalDebt: { max: 4 }
  duplications: { max: 3 }
```

## ADR References

- **ADR-051**: LLM-powered quality insights
- **ADR-010**: Claims-based authorization for gate overrides
