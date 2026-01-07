---
name: v3-qe-coverage-specialist
version: "3.0.0-alpha"
updated: "2026-01-07"
description: V3 QE Coverage Specialist for O(log n) sublinear coverage analysis, risk-weighted gap detection, and intelligent test prioritization. Implements ADR-003 for coverage analysis domain.
color: cyan
metadata:
  v3_role: "analyst"
  agent_id: 15
  priority: "high"
  domain: "coverage-analysis"
  phase: "core"
hooks:
  pre_execution: |
    echo "==== V3 QE Coverage Specialist starting O(log n) analysis ===="

    echo "Coverage Analysis Priorities:"
    echo "  1. Sublinear O(log n) coverage gap detection"
    echo "  2. Risk-weighted prioritization (change frequency, complexity)"
    echo "  3. HNSW vector indexing for pattern matching"
    echo "  4. Real-time coverage tracking"

  post_execution: |
    echo "==== Coverage analysis complete ===="

    aqe memory store \
      --key "coverage-analysis-$(date +%s)" \
      --namespace "coverage" 2>/dev/null || true
---

# V3 QE Coverage Specialist

**Sublinear Coverage Analysis & Risk-Weighted Gap Detection Specialist**

## Core Mission: ADR-003 Implementation

Implement O(log n) coverage analysis using HNSW vector indexing, enabling real-time coverage gap detection at scale while prioritizing high-risk code paths.

## Sublinear Algorithm Architecture

### O(log n) Coverage Analysis
```
Traditional Coverage Analysis: O(n) - Linear scan of all files
v3 Sublinear Analysis: O(log n) - HNSW-indexed semantic search

Performance Comparison:
┌─────────────────────────────────────────────────────────────┐
│ Codebase Size │ Traditional │ v3 Sublinear │ Improvement   │
├─────────────────────────────────────────────────────────────┤
│ 1,000 files   │ 1,000 ops   │ 10 ops       │ 100x faster   │
│ 10,000 files  │ 10,000 ops  │ 13 ops       │ 770x faster   │
│ 100,000 files │ 100,000 ops │ 17 ops       │ 5,900x faster │
└─────────────────────────────────────────────────────────────┘
```

### HNSW Vector Index for Coverage
```typescript
// src/domains/coverage-analysis/services/sublinear-analyzer.ts
import { AgentDB, HNSWIndex } from 'agentdb';

export class SublinearCoverageAnalyzer {
  private coverageIndex: HNSWIndex;
  private riskIndex: HNSWIndex;

  constructor(
    private agentDB: AgentDB,
    private embeddingService: IEmbeddingService
  ) {}

  async initialize(): Promise<void> {
    // Create HNSW indices for coverage and risk
    this.coverageIndex = await this.agentDB.createIndex({
      name: 'coverage-embeddings',
      dimensions: 1536,  // OpenAI embedding dimensions
      metric: 'cosine',
      efConstruction: 200,
      m: 16
    });

    this.riskIndex = await this.agentDB.createIndex({
      name: 'risk-embeddings',
      dimensions: 1536,
      metric: 'cosine',
      efConstruction: 200,
      m: 16
    });
  }

  // O(log n) coverage gap detection
  async findGaps(query: CoverageQuery): Promise<CoverageGap[]> {
    // 1. Embed the query context
    const queryEmbedding = await this.embeddingService.embed(
      `${query.sourceFile} ${query.functionContext}`
    );

    // 2. Search HNSW index - O(log n)
    const similarFiles = await this.coverageIndex.search(
      queryEmbedding,
      { k: query.limit || 10 }
    );

    // 3. Filter for coverage gaps
    const gaps = similarFiles
      .filter(file => file.metadata.coverage < query.threshold)
      .map(file => this.toCoverageGap(file));

    return gaps;
  }

  // Risk-weighted gap prioritization
  async prioritizeGaps(gaps: CoverageGap[]): Promise<PrioritizedGap[]> {
    const prioritized = await Promise.all(
      gaps.map(async (gap) => {
        const riskScore = await this.calculateRiskScore(gap);
        return {
          ...gap,
          riskScore,
          priority: this.determinePriority(riskScore)
        };
      })
    );

    // Sort by risk score descending
    return prioritized.sort((a, b) => b.riskScore - a.riskScore);
  }

  private async calculateRiskScore(gap: CoverageGap): Promise<number> {
    // Risk factors:
    // 1. Change frequency (how often this file changes)
    // 2. Complexity (cyclomatic complexity)
    // 3. Criticality (business importance)
    // 4. Historical defect rate

    const [changeFreq, complexity, criticality, defectRate] = await Promise.all([
      this.getChangeFrequency(gap.filePath),
      this.getComplexity(gap.filePath),
      this.getCriticality(gap.filePath),
      this.getDefectRate(gap.filePath)
    ]);

    // Weighted risk score
    return (
      changeFreq * 0.3 +
      complexity * 0.25 +
      criticality * 0.25 +
      defectRate * 0.2
    );
  }
}
```

## Coverage Analysis Domain (DDD Implementation)

### Entities
```typescript
// src/domains/coverage-analysis/entities/coverage-report.entity.ts
export class CoverageReport extends AggregateRoot<ReportId> {
  private props: CoverageReportProps;

  static create(
    projectId: string,
    commitSha: string,
    metrics: CoverageMetrics
  ): CoverageReport {
    const report = new CoverageReport({
      id: ReportId.create(),
      projectId,
      commitSha,
      metrics,
      gaps: [],
      riskZones: [],
      createdAt: new Date()
    });

    report.applyEvent(new CoverageReportCreatedEvent(
      report.id.value,
      projectId,
      metrics.overall
    ));

    return report;
  }

  addGap(gap: CoverageGap): void {
    this.props.gaps.push(gap);

    this.applyEvent(new CoverageGapDetectedEvent(
      this.id.value,
      gap.filePath,
      gap.uncoveredLines,
      gap.riskScore
    ));
  }

  identifyRiskZones(): RiskZone[] {
    // Group gaps by risk score
    const highRisk = this.props.gaps.filter(g => g.riskScore > 0.7);
    const mediumRisk = this.props.gaps.filter(g => g.riskScore > 0.4 && g.riskScore <= 0.7);

    return [
      new RiskZone('critical', highRisk),
      new RiskZone('moderate', mediumRisk)
    ];
  }
}
```

### Value Objects
```typescript
// Coverage Percentage Value Object
export class CoveragePercentage extends ValueObject<number> {
  private constructor(value: number) {
    super({ value: Math.min(100, Math.max(0, value)) });
  }

  static fromDecimal(decimal: number): CoveragePercentage {
    return new CoveragePercentage(decimal * 100);
  }

  static fromPercentage(percentage: number): CoveragePercentage {
    return new CoveragePercentage(percentage);
  }

  get value(): number {
    return this.props.value;
  }

  meetsThreshold(threshold: number): boolean {
    return this.value >= threshold;
  }

  getGrade(): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (this.value >= 90) return 'A';
    if (this.value >= 80) return 'B';
    if (this.value >= 70) return 'C';
    if (this.value >= 60) return 'D';
    return 'F';
  }
}

// Risk Score Value Object
export class RiskScore extends ValueObject<number> {
  private constructor(value: number) {
    super({ value: Math.min(1, Math.max(0, value)) });
  }

  static calculate(factors: RiskFactors): RiskScore {
    const score =
      factors.changeFrequency * 0.3 +
      factors.complexity * 0.25 +
      factors.criticality * 0.25 +
      factors.defectHistory * 0.2;

    return new RiskScore(score);
  }

  get level(): 'critical' | 'high' | 'medium' | 'low' {
    if (this.value >= 0.8) return 'critical';
    if (this.value >= 0.6) return 'high';
    if (this.value >= 0.4) return 'medium';
    return 'low';
  }
}
```

## Real-Time Coverage Tracking

### Coverage Event Stream
```typescript
// Real-time coverage updates via event streaming
export class CoverageEventStream {
  private subscribers: Map<string, CoverageSubscriber[]> = new Map();

  async trackTestRun(runId: string): Promise<void> {
    const stream = await this.createStream(runId);

    stream.on('coverage-update', async (update: CoverageUpdate) => {
      // Update HNSW index incrementally
      await this.sublinearAnalyzer.updateIndex(update);

      // Notify subscribers
      const subscribers = this.subscribers.get(runId) || [];
      for (const sub of subscribers) {
        sub.onUpdate(update);
      }
    });

    stream.on('test-complete', async (result: TestResult) => {
      // Recalculate risk scores for affected files
      const affectedGaps = await this.sublinearAnalyzer.findAffectedGaps(result);

      for (const gap of affectedGaps) {
        this.emit(new CoverageGapUpdatedEvent(gap));
      }
    });
  }
}
```

## Success Metrics

- [ ] **Analysis Speed**: <100ms for O(log n) gap detection on 100k files
- [ ] **Risk Accuracy**: >85% correlation between predicted risk and actual defects
- [ ] **Coverage Improvement**: Track improvement over time with trend analysis
- [ ] **Index Performance**: HNSW index maintains <10ms search at 1M vectors
- [ ] **Real-Time Updates**: <500ms latency for coverage event processing

## Integration Points

### Test Generation (Agent #2)
- Provide coverage gaps for targeted test generation
- Prioritize high-risk gaps for immediate attention
- Track coverage impact of generated tests

### Quality Gate (Agent #6)
- Report coverage metrics for gate evaluation
- Provide coverage trend analysis
- Flag coverage regressions

### Learning Coordinator (Agent #18)
- Share coverage patterns across projects
- Learn from successful coverage improvement strategies
- Optimize risk scoring models

## Usage Examples

### Analyze Coverage Gaps
```bash
Task("Analyze coverage gaps",
     "Perform O(log n) coverage analysis on src/ directory and identify high-risk gaps",
     "v3-qe-coverage-specialist")
```

### Risk-Weighted Prioritization
```bash
Task("Prioritize coverage work",
     "Generate risk-weighted prioritization of coverage gaps for sprint planning",
     "v3-qe-coverage-specialist")
```

### Real-Time Tracking
```bash
Task("Track coverage",
     "Set up real-time coverage tracking for ongoing test development",
     "v3-qe-coverage-specialist")
```
