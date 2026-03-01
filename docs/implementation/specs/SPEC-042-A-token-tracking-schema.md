# SPEC-042-A: Token Tracking Schema

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-042-A |
| **Parent ADR** | [ADR-042](../adrs/ADR-042-v3-qe-token-tracking-integration.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Claude Code |

---

## Overview

Defines the data structures for token tracking across V3 QE agents, including per-task metrics, agent aggregations, domain breakdowns, and session summaries with optimization statistics.

---

## Specification Details

### Section 1: Core Token Interfaces

```typescript
// v3/src/learning/token-tracker.ts

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface TaskTokenMetric {
  taskId: string;
  agentId: string;
  domain: DomainName;
  operation: string;
  timestamp: number;
  usage: TokenUsage;
  patternReused: boolean;      // Was a cached pattern used?
  tokensSaved?: number;        // Estimated tokens saved via caching
}

export interface AgentTokenMetrics {
  agentId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  tasksExecuted: number;
  patternsReused: number;      // How many times we skipped LLM calls
  estimatedTokensSaved: number;
}
```

### Section 2: Session Summary

```typescript
export interface SessionTokenSummary {
  sessionId: string;
  startTime: number;
  endTime?: number;
  byAgent: Map<string, AgentTokenMetrics>;
  byDomain: Map<DomainName, TokenUsage>;
  totalUsage: TokenUsage;
  optimizationStats: {
    patternsReused: number;
    cacheHits: number;
    earlyExits: number;
    tokensSaved: number;
    savingsPercentage: number;
  };
}
```

### Section 3: Extended QE Pattern

```typescript
// Update v3/src/learning/qe-patterns.ts

export interface QEPattern {
  id: string;
  // ... existing fields ...

  // Token tracking fields (from agentic-flow)
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;

  // Optimization metadata
  reusable: boolean;           // Can this pattern be reused?
  reuseCount: number;          // How many times it's been reused
  averageTokenSavings: number; // Avg tokens saved when reused
}
```

### Section 4: Pattern Store Configuration

```typescript
export interface PatternStoreConfig {
  // Token optimization config
  tokenTracking: {
    enabled: boolean;
    trackInputOutput: boolean;    // Track input/output separately
    estimateCosts: boolean;       // Calculate cost estimates
    costPerInputToken: number;    // e.g., 0.003 / 1000
    costPerOutputToken: number;   // e.g., 0.015 / 1000
  };

  // Reuse optimization config
  reuseOptimization: {
    enabled: boolean;
    minSimilarityForReuse: number;  // e.g., 0.85
    minSuccessRateForReuse: number; // e.g., 0.90
    maxAgeForReuse: number;         // e.g., 7 days
  };
}

export interface PatternSearchResult {
  pattern: QEPattern;
  similarity: number;
  canReuse: boolean;
  estimatedTokenSavings: number;
  reuseConfidence: number;
}
```

### Section 5: Metrics Collector Integration

```typescript
// Update v3/src/mcp/metrics/metrics-collector.ts

export interface TaskMetric {
  taskId: string;
  agentId: string;
  startTime: [number, number];
  endTime?: [number, number];
  durationMs?: number;
  success: boolean;
  retries: number;

  // Token tracking
  tokenUsage?: TokenUsage;
  patternReused?: boolean;
  tokensSaved?: number;
}

class MetricsCollectorImpl {
  recordTokenUsage(taskId: string, usage: TokenUsage): void {
    const task = this.completedTasks.get(taskId);
    if (task) {
      task.tokenUsage = usage;
      this.updateAgentTokenMetrics(task.agentId, usage);
      this.updateDomainTokenMetrics(task.domain, usage);
    }
  }

  recordPatternReuse(taskId: string, tokensSaved: number): void {
    const task = this.completedTasks.get(taskId);
    if (task) {
      task.patternReused = true;
      task.tokensSaved = tokensSaved;
      this.totalTokensSaved += tokensSaved;
    }
  }

  getTokenEfficiency(): TokenEfficiencyReport {
    return {
      totalTokensUsed: this.totalTokens,
      totalTokensSaved: this.totalTokensSaved,
      savingsPercentage: (this.totalTokensSaved /
        (this.totalTokens + this.totalTokensSaved)) * 100,
      patternReuseRate: this.patternsReused / this.totalTasks,
      averageTokensPerTask: this.totalTokens / this.totalTasks
    };
  }
}
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-042-A-001 | TokenUsage.totalTokens must equal inputTokens + outputTokens | Error |
| SPEC-042-A-002 | estimatedCostUsd must be non-negative when present | Error |
| SPEC-042-A-003 | patternReused true requires tokensSaved > 0 | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-042-B | Reduction Strategies | Uses these schemas |
| SPEC-042-C | MCP Tools and CLI | Exposes these metrics |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-042-v3-qe-token-tracking-integration.md)
- [agentic-flow Token Efficiency Docs](https://github.com/ruvnet/agentic-flow/blob/main/.claude/commands/analysis/token-efficiency.md)
