# SPEC-042-B: Token Reduction Strategies

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-042-B |
| **Parent ADR** | [ADR-042](../adrs/ADR-042-v3-qe-token-tracking-integration.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Claude Code |

---

## Overview

Defines the four token reduction strategies: pattern reuse (-25%), batch operations (-15%), context compression (-10%), and response caching (-8%). Includes the early-exit optimizer implementation.

---

## Specification Details

### Section 1: Early Exit Optimizer

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

### Section 2: Strategy 1 - Pattern Reuse (Target: -25%)

```typescript
// Before executing a task, check for reusable patterns
const earlyExitCheck = await tokenOptimizer.checkEarlyExit(task);
if (earlyExitCheck.canExit) {
  // Skip LLM call, use cached pattern
  return applyPattern(earlyExitCheck.reusedPattern, task);
}
// Otherwise, execute normally and store pattern
```

### Section 3: Strategy 2 - Batch Operations (Target: -15%)

```typescript
// Instead of N separate file reads, batch them
const files = await batchFileRead(paths);  // 1 operation

// Instead of:
for (const path of paths) {
  await readFile(path);  // N operations
}
```

### Section 4: Strategy 3 - Context Compression (Target: -10%)

```typescript
// Provide focused context, not entire files
const context = await getRelevantContext(task, {
  maxTokens: 2000,
  focusAreas: ['error handling', 'edge cases'],
  excludeBoilerplate: true
});
```

### Section 5: Strategy 4 - Response Caching (Target: -8%)

```typescript
// Cache responses for identical/similar queries
const cacheKey = hashQuery(task.description);
const cached = await responseCache.get(cacheKey);
if (cached && cached.age < 5 * 60 * 1000) {  // 5 min TTL
  return cached.response;
}
```

---

## Performance Targets

| Metric | Baseline | Target | Mechanism |
|--------|----------|--------|-----------|
| Token reduction | 0% | -25% | Pattern reuse + caching |
| Cost savings | 0% | -30% | All strategies combined |
| Cache hit rate | 0% | >40% | Smart caching |
| Pattern reuse rate | 0% | >35% | HNSW similarity search |
| Early exit rate | 0% | >15% | High-confidence patterns |

---

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

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-042-B-001 | Early exit requires similarity > 0.85 | Error |
| SPEC-042-B-002 | Cache TTL must not exceed 5 minutes | Warning |
| SPEC-042-B-003 | Batch operations must group by domain | Info |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-042-A | Token Tracking Schema | Data structures used |
| SPEC-042-C | MCP Tools and CLI | Exposes reduction metrics |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-042-v3-qe-token-tracking-integration.md)
- [ReasoningBank Paper](https://arxiv.org/html/2509.25140v1) - Closed-loop learning with 32.3% token reduction
