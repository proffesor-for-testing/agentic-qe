# ADR-042: V3 QE Token Tracking and Consumption Reduction

**Status**: Proposed
**Date**: 2026-01-11
**Author**: Claude Code
**Related**: ADR-040 (Agentic-Flow Integration)

## Context

### Problem Statement

V3 QE agents currently lack:
1. **Token consumption tracking** - No visibility into how many tokens each agent/task consumes
2. **Token optimization patterns** - No mechanisms to reduce token usage while maintaining quality
3. **Cost management** - No way to estimate, track, or optimize API costs per operation
4. **Pattern-based token reduction** - Missing opportunity to reuse successful patterns to avoid re-computation

### Analysis of agentic-flow (v2.0.1-alpha)

After analyzing the [agentic-flow repository](https://github.com/ruvnet/agentic-flow), we identified proven token reduction mechanisms:

| Feature | Claimed Reduction | Mechanism |
|---------|-------------------|-----------|
| ReasoningBank Pattern Reuse | -25% tokens | Vector similarity search avoids re-discovering solutions |
| Adaptive Learner | -32.3% tokens | Iterative improvement with pattern memory |
| Context Synthesizer | -15% redundancy | Focused context generation |
| Memory Optimizer | -20% retrieval | Prunes low-value patterns |

### Current V3 State

```
v3/src/learning/qe-reasoning-bank.ts  - Has QE patterns but NO token tracking
v3/src/mcp/metrics/metrics-collector.ts - Tracks CPU/memory but NO tokens
v3/src/learning/pattern-store.ts - Stores patterns but NO tokensUsed field
```

## Decision

Implement comprehensive token tracking and consumption reduction in V3 QE by:

1. **Add token tracking to all agent operations**
2. **Port agentic-flow's proven reduction patterns**
3. **Create MCP tools for token analysis**
4. **Implement early-exit optimizations for high-confidence patterns**

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     V3 QE Token Tracking System                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                    Token Metrics Collector                      │     │
│  │  • Per-task token tracking (input/output/total)                │     │
│  │  • Per-agent aggregation                                       │     │
│  │  • Per-domain breakdown                                        │     │
│  │  • Session-level summaries                                     │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                              │                                           │
│         ┌────────────────────┼────────────────────┐                     │
│         ▼                    ▼                    ▼                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Pattern    │    │    Cache     │    │  Early Exit  │              │
│  │    Reuse     │    │   Manager    │    │  Optimizer   │              │
│  │              │    │              │    │              │              │
│  │ • HNSW search│    │ • File cache │    │ • High conf  │              │
│  │ • >0.85 sim  │    │ • Query cache│    │   patterns   │              │
│  │ • Skip regen │    │ • 5min TTL   │    │ • Skip LLM   │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                    │                    │                     │
│         └────────────────────┼────────────────────┘                     │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                      Token Reduction Layer                      │     │
│  │  • Pattern-based shortcuts (avoid re-computation)              │     │
│  │  • Batch similar operations (fewer API calls)                  │     │
│  │  • Context compression (focused prompts)                       │     │
│  │  • Response caching (avoid duplicate requests)                 │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. Token Tracking Interface

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

### 2. Extended QE Pattern with Token Tracking

```typescript
// Update v3/src/learning/qe-patterns.ts

export interface QEPattern {
  id: string;
  // ... existing fields ...

  // NEW: Token tracking fields (from agentic-flow)
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;

  // NEW: Optimization metadata
  reusable: boolean;           // Can this pattern be reused?
  reuseCount: number;          // How many times it's been reused
  averageTokenSavings: number; // Avg tokens saved when reused
}
```

### 3. MCP Tool: Token Usage Analysis

```typescript
// v3/src/mcp/tools/analysis/token-usage.ts

export const tokenUsageTool = {
  name: 'token_usage',
  description: 'Analyze token consumption patterns and identify optimization opportunities',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['session', 'agent', 'domain', 'task'],
        description: 'Scope of analysis'
      },
      timeframe: {
        type: 'string',
        enum: ['1h', '24h', '7d', '30d'],
        description: 'Time period to analyze'
      },
      agentId: {
        type: 'string',
        description: 'Specific agent to analyze (optional)'
      },
      domain: {
        type: 'string',
        description: 'Specific domain to analyze (optional)'
      }
    },
    required: ['operation']
  },

  async execute(args: TokenUsageArgs): Promise<TokenUsageResult> {
    const collector = TokenMetricsCollector.getInstance();

    switch (args.operation) {
      case 'session':
        return collector.getSessionSummary(args.timeframe);
      case 'agent':
        return collector.getAgentMetrics(args.agentId, args.timeframe);
      case 'domain':
        return collector.getDomainMetrics(args.domain, args.timeframe);
      case 'task':
        return collector.getTaskMetrics(args.timeframe);
    }
  }
};

// Example output:
{
  "summary": {
    "totalTokens": 45230,
    "totalCost": "$0.68",
    "tokensSaved": 12450,
    "savingsPercentage": 27.5
  },
  "breakdown": {
    "byAgent": {
      "qe-test-generator": { tokens: 15200, cost: "$0.23" },
      "qe-coverage-analyzer": { tokens: 8900, cost: "$0.13" }
    },
    "byDomain": {
      "test-generation": { tokens: 18500 },
      "coverage-analysis": { tokens: 12000 }
    }
  },
  "optimization": {
    "patternsReused": 34,
    "cacheHits": 89,
    "earlyExits": 12,
    "recommendations": [
      "High reuse potential for test-generation patterns (>0.85 similarity)",
      "Consider batching coverage-analysis requests"
    ]
  }
}
```

### 4. Token-Aware Pattern Store

```typescript
// Update v3/src/learning/pattern-store.ts

export interface PatternStoreConfig {
  // ... existing config ...

  // NEW: Token optimization config
  tokenTracking: {
    enabled: boolean;
    trackInputOutput: boolean;    // Track input/output separately
    estimateCosts: boolean;       // Calculate cost estimates
    costPerInputToken: number;    // e.g., 0.003 / 1000
    costPerOutputToken: number;   // e.g., 0.015 / 1000
  };

  // NEW: Reuse optimization config
  reuseOptimization: {
    enabled: boolean;
    minSimilarityForReuse: number;  // e.g., 0.85
    minSuccessRateForReuse: number; // e.g., 0.90
    maxAgeForReuse: number;         // e.g., 7 days
  };
}

// Pattern search now returns token optimization hints
export interface PatternSearchResult {
  pattern: QEPattern;
  similarity: number;

  // NEW: Reuse recommendation
  canReuse: boolean;
  estimatedTokenSavings: number;
  reuseConfidence: number;
}
```

### 5. Early Exit Optimizer

```typescript
// v3/src/optimization/early-exit-token-optimizer.ts

export class EarlyExitTokenOptimizer {
  private patternStore: PatternStore;
  private minConfidenceForExit = 0.85;

  /**
   * Check if we can skip LLM call by reusing a pattern
   */
  async checkEarlyExit(task: QETask): Promise<EarlyExitResult> {
    // Search for highly similar patterns
    const matches = await this.patternStore.search(task.description, {
      limit: 5,
      minSimilarity: this.minConfidenceForExit,
      onlySuccessful: true
    });

    if (matches.length === 0) {
      return { canExit: false };
    }

    const bestMatch = matches[0];

    // Check if pattern is reusable
    if (bestMatch.canReuse && bestMatch.reuseConfidence > 0.9) {
      return {
        canExit: true,
        reusedPattern: bestMatch.pattern,
        estimatedTokensSaved: bestMatch.pattern.tokensUsed || 0,
        confidence: bestMatch.reuseConfidence
      };
    }

    return { canExit: false };
  }
}
```

### 6. Integration with Existing MetricsCollector

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

  // NEW: Token tracking
  tokenUsage?: TokenUsage;
  patternReused?: boolean;
  tokensSaved?: number;
}

// Add methods to MetricsCollectorImpl
class MetricsCollectorImpl {
  // ... existing methods ...

  /**
   * Record token usage for a completed task
   */
  recordTokenUsage(taskId: string, usage: TokenUsage): void {
    const task = this.completedTasks.get(taskId);
    if (task) {
      task.tokenUsage = usage;
      this.updateAgentTokenMetrics(task.agentId, usage);
      this.updateDomainTokenMetrics(task.domain, usage);
    }
  }

  /**
   * Record pattern reuse (tokens saved)
   */
  recordPatternReuse(taskId: string, tokensSaved: number): void {
    const task = this.completedTasks.get(taskId);
    if (task) {
      task.patternReused = true;
      task.tokensSaved = tokensSaved;
      this.totalTokensSaved += tokensSaved;
    }
  }

  /**
   * Get token efficiency metrics
   */
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

### 7. CLI Commands

```bash
# Check token usage for current session
aqe token-usage --period 24h

# Get breakdown by agent
aqe token-usage --by-agent

# Get breakdown by domain
aqe token-usage --by-domain

# Export detailed report
aqe token-usage --period 7d --export tokens.csv

# Show optimization recommendations
aqe token-usage --recommendations
```

## Token Reduction Strategies

### Strategy 1: Pattern Reuse (Target: -25%)

```typescript
// Before executing a task, check for reusable patterns
const earlyExitCheck = await tokenOptimizer.checkEarlyExit(task);
if (earlyExitCheck.canExit) {
  // Skip LLM call, use cached pattern
  return applyPattern(earlyExitCheck.reusedPattern, task);
}
// Otherwise, execute normally and store pattern
```

### Strategy 2: Batch Operations (Target: -15%)

```typescript
// Instead of N separate file reads, batch them
const files = await batchFileRead(paths);  // 1 operation
// Instead of
for (const path of paths) {
  await readFile(path);  // N operations
}
```

### Strategy 3: Context Compression (Target: -10%)

```typescript
// Provide focused context, not entire files
const context = await getRelevantContext(task, {
  maxTokens: 2000,
  focusAreas: ['error handling', 'edge cases'],
  excludeBoilerplate: true
});
```

### Strategy 4: Response Caching (Target: -8%)

```typescript
// Cache responses for identical/similar queries
const cacheKey = hashQuery(task.description);
const cached = await responseCache.get(cacheKey);
if (cached && cached.age < 5 * 60 * 1000) {  // 5 min TTL
  return cached.response;
}
```

## Performance Targets

| Metric | Baseline | Target | Mechanism |
|--------|----------|--------|-----------|
| Token reduction | 0% | -25% | Pattern reuse + caching |
| Cost savings | 0% | -30% | All strategies combined |
| Cache hit rate | 0% | >40% | Smart caching |
| Pattern reuse rate | 0% | >35% | HNSW similarity search |
| Early exit rate | 0% | >15% | High-confidence patterns |

## Migration Path

### Phase 1: Token Tracking (Week 1)
1. Add `TokenUsage` fields to `TaskMetric`
2. Implement `TokenMetricsCollector`
3. Add token tracking to MCP handlers

### Phase 2: MCP Tools (Week 2)
1. Implement `token_usage` MCP tool
2. Add CLI commands
3. Create dashboard integration

### Phase 3: Pattern Optimization (Week 3)
1. Add token fields to `QEPattern`
2. Implement `EarlyExitTokenOptimizer`
3. Enable pattern reuse

### Phase 4: Advanced Reduction (Week 4)
1. Implement batch operations
2. Add context compression
3. Enable response caching

## Consequences

### Positive
- **Visibility**: Know exactly where tokens are spent
- **Cost control**: Predict and optimize API costs
- **Performance**: Faster responses via caching/reuse
- **Sustainability**: -25% token reduction = -25% API costs
- **Learning**: Patterns improve over time

### Negative
- **Complexity**: Additional tracking infrastructure
- **Storage**: Pattern store grows over time
- **Cache staleness**: Risk of stale cached responses

### Mitigation
- **Pruning**: Auto-prune low-value patterns (like agentic-flow's `BatchOperations.pruneData()`)
- **TTL**: Time-based cache expiration
- **Confidence thresholds**: Only reuse high-confidence patterns

## Related Work

### From agentic-flow
- `ReasoningBankController` - Pattern storage with `tokensUsed` tracking
- `BatchOperations.pruneData()` - Data hygiene for pattern store
- `TelemetryManager` - OpenTelemetry integration for metrics
- Reasoning agents (`adaptive-learner`, `pattern-matcher`) - Token reduction strategies

### V3 ADRs
- ADR-021: QE ReasoningBank - Base pattern learning (extend with tokens)
- ADR-033: Early Exit Testing - Apply to token optimization
- ADR-038: Memory Unification - Integrate token tracking
- ADR-040: Agentic-Flow Integration - Parent ADR for this work

## References

- [agentic-flow Token Efficiency Docs](https://github.com/ruvnet/agentic-flow/blob/main/.claude/commands/analysis/token-efficiency.md)
- [ReasoningBank Paper](https://arxiv.org/html/2509.25140v1) - Closed-loop learning with 32.3% token reduction
- [OpenTelemetry for Node.js](https://opentelemetry.io/docs/languages/js/) - Metrics infrastructure
