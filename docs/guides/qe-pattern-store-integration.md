# QE Pattern Store Integration Guide

**Phase 0.5 - RuVector Integration for QE Agents**

This guide shows how QE agents can leverage the RuVector Pattern Store for 150x faster pattern retrieval and GNN-enhanced learning.

## Overview

All QE agents extending `BaseAgent` automatically get access to RuVector pattern storage capabilities:

- **Local HNSW**: Fast in-memory pattern search (default fallback)
- **RuVector Docker**: 150x faster search with GNN reranking and LoRA learning
- **Dual-write mode**: Write to both during migration
- **Auto-sync**: Automatic pattern synchronization to remote service

## Configuration

### Basic Configuration (Local HNSW)

```typescript
import { BaseAgentConfig } from '../agents/BaseAgent';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';

const config: BaseAgentConfig = {
  type: 'test-generator',
  memoryStore: new SwarmMemoryManager(),
  patternStore: {
    enabled: true,
    useRuVector: false,  // Use local HNSW only
    useHNSW: true,
    storagePath: './data/qe-patterns.ruvector',
  },
};
```

### RuVector Docker Configuration

```typescript
const config: BaseAgentConfig = {
  type: 'coverage-analyzer',
  memoryStore: new SwarmMemoryManager(),
  patternStore: {
    enabled: true,
    useRuVector: true,              // Enable RuVector Docker
    useHNSW: true,                  // Keep HNSW as fallback
    dualWrite: false,               // Write to RuVector only
    ruvectorUrl: 'http://localhost:8080',
    autoSync: true,                 // Auto-sync patterns
    storagePath: './data/qe-patterns.ruvector',
  },
};
```

### Migration Configuration (Dual-Write)

```typescript
const config: BaseAgentConfig = {
  type: 'security-scanner',
  memoryStore: new SwarmMemoryManager(),
  patternStore: {
    enabled: true,
    useRuVector: true,
    useHNSW: true,
    dualWrite: true,  // Write to BOTH RuVector and HNSW
    ruvectorUrl: 'http://ruvector-service:8080',
    autoSync: true,
    storagePath: './data/qe-patterns.ruvector',
  },
};
```

## Using Pattern Store in QE Agents

### Example: CoverageAnalyzerAgent with Pattern Learning

```typescript
import { BaseAgent } from '../agents/BaseAgent';
import { QETask } from '../types';

class CoverageAnalyzerAgent extends BaseAgent {
  protected async performTask(task: QETask): Promise<any> {
    const analysisRequest = task.payload as CoverageAnalysisRequest;

    // 1. Generate embedding for the analysis request
    const embedding = await this.generateEmbedding(analysisRequest);

    // 2. Search for similar coverage patterns
    const similarPatterns = await this.searchQEPatterns(embedding, 5, {
      domain: 'coverage-analysis',
      type: 'coverage-gap',
      threshold: 0.75,
      useMMR: true,  // Use Maximal Marginal Relevance for diversity
    });

    // 3. Use learned patterns to improve analysis
    let gaps = await this.analyzeCoverageGaps(analysisRequest);

    if (similarPatterns.length > 0) {
      // Apply learned patterns to refine gap detection
      gaps = this.refinedWithLearnedPatterns(gaps, similarPatterns);
    }

    // 4. Store successful analysis as a new pattern
    if (this.wasSuccessful(gaps)) {
      await this.storeQEPattern({
        id: `coverage-${Date.now()}`,
        type: 'coverage-gap',
        domain: 'coverage-analysis',
        content: JSON.stringify(gaps),
        embedding,
        framework: analysisRequest.framework,
        coverage: this.calculateCoverage(gaps),
        metadata: {
          targetCoverage: analysisRequest.targetCoverage,
          optimizationGoals: analysisRequest.optimizationGoals,
          success: true,
        },
      });
    }

    return {
      gaps,
      learningMetrics: {
        patternsApplied: similarPatterns.length,
        confidence: similarPatterns[0]?.score ?? 0,
      },
    };
  }

  private async generateEmbedding(request: any): Promise<number[]> {
    // Use LLM to generate embedding
    const description = this.serializeRequest(request);
    return await this.llmEmbed(description);
  }

  private refinedWithLearnedPatterns(
    gaps: any[],
    patterns: Array<{ pattern: any; score: number }>
  ): any[] {
    // Apply learned patterns to improve gap detection
    const refinedGaps = [...gaps];

    for (const { pattern, score } of patterns) {
      if (score > 0.85) {
        // High confidence - apply pattern insights
        const learnedGaps = JSON.parse(pattern.content);
        refinedGaps.push(...this.extractRelevantGaps(learnedGaps));
      }
    }

    return refinedGaps;
  }
}
```

### Example: TestGeneratorAgent with Pattern Sync

```typescript
class TestGeneratorAgent extends BaseAgent {
  protected async performTask(task: QETask): Promise<any> {
    const testRequest = task.payload as TestGenerationRequest;

    // Generate test patterns
    const tests = await this.generateTests(testRequest);

    // Store successful test patterns with auto-sync
    for (const test of tests) {
      const embedding = await this.generateTestEmbedding(test);

      const result = await this.storeQEPattern({
        id: `test-${test.name}-${Date.now()}`,
        type: 'test-generation',
        domain: testRequest.domain,
        content: test.code,
        embedding,
        framework: testRequest.framework,
        metadata: {
          testType: test.type,
          complexity: test.complexity,
          edgeCases: test.edgeCases,
        },
      });

      if (result.synced) {
        console.log(`Test pattern synced to RuVector: ${test.name}`);
      }
    }

    // Periodically force learning consolidation
    if (this.shouldTriggerLearning()) {
      const learningResult = await this.forcePatternLearning();
      console.log(`LoRA consolidation: ${learningResult.patternsConsolidated} patterns in ${learningResult.duration}ms`);
    }

    return { tests };
  }

  private shouldTriggerLearning(): boolean {
    // Trigger every 100 tests or 1 hour
    return Math.random() < 0.01;
  }
}
```

## Monitoring Pattern Store

### Get Pattern Store Metrics

```typescript
class MyQEAgent extends BaseAgent {
  async reportMetrics(): Promise<void> {
    const metrics = this.getQEPatternMetrics();

    if (metrics) {
      console.log(`Pattern Store Metrics:
  - Pattern Count: ${metrics.patternCount}
  - Implementation: ${metrics.implementation}
  - Average Search Time: ${metrics.performance?.avgSearchTime.toFixed(2)}ms
  - Estimated QPS: ${metrics.performance?.estimatedQPS.toFixed(0)}
      `);

      if (metrics.gnnLearning) {
        console.log(`GNN Learning:
  - Cache Hit Rate: ${(metrics.gnnLearning.cacheHitRate * 100).toFixed(1)}%
  - Patterns Learned: ${metrics.gnnLearning.patternsLearned}
        `);
      }
    }
  }
}
```

### Check Pattern Store Availability

```typescript
class MyQEAgent extends BaseAgent {
  protected async initializeComponents(): Promise<void> {
    if (this.hasPatternStore()) {
      console.log('Pattern Store is available');

      const stats = this.getLLMStats();
      console.log(`Pattern Store Type: ${stats.patternStoreType}`);
    } else {
      console.log('Pattern Store is not available (using algorithmic fallback)');
    }
  }
}
```

## Manual Pattern Sync

For agents that need more control over pattern synchronization:

```typescript
class MyQEAgent extends BaseAgent {
  async syncMyPatterns(): Promise<void> {
    // Sync all pending patterns to remote RuVector service
    const result = await this.syncPatternsToRemote({ force: false });

    console.log(`Synced ${result.synced} patterns in ${result.duration}ms`);

    if (result.failed > 0) {
      console.warn(`Failed to sync ${result.failed} patterns`);
    }
  }

  async forceSyncAll(): Promise<void> {
    // Force sync all patterns (not just pending)
    const result = await this.syncPatternsToRemote({ force: true });
    console.log(`Force synced ${result.synced} patterns`);
  }
}
```

## Performance Comparison

### Local HNSW vs RuVector Docker

| Metric | Local HNSW | RuVector Docker |
|--------|-----------|-----------------|
| Search Latency (p50) | ~150 µs | ~1.5 µs (100x faster) |
| QPS | ~3,600 | ~192,840 (53x higher) |
| Batch Insert | ~20,980 ops/s | ~2,703,923 ops/s (129x faster) |
| Memory Usage | Baseline | -18% (more efficient) |
| GNN Reranking | No | Yes (LoRA + EWC++) |
| Learning | No | Yes (catastrophic forgetting prevention) |

## Best Practices

### 1. Use MMR for Diverse Results

```typescript
const patterns = await this.searchQEPatterns(embedding, 10, {
  useMMR: true,  // Maximal Marginal Relevance
  threshold: 0.7,
});
```

MMR balances relevance with diversity, preventing redundant pattern matches.

### 2. Domain-Specific Pattern Storage

```typescript
await this.storeQEPattern({
  id: `security-${Date.now()}`,
  type: 'vulnerability',
  domain: 'security-scanning',  // Domain isolation
  content: JSON.stringify(finding),
  embedding,
});
```

Use `domain` to isolate patterns by agent type or use case.

### 3. Gradual Migration with Dual-Write

```typescript
// Step 1: Enable dual-write to test RuVector
patternStore: {
  dualWrite: true,
  useRuVector: true,
  useHNSW: true,
}

// Step 2: Monitor metrics for 1 week

// Step 3: Disable dual-write after validation
patternStore: {
  dualWrite: false,
  useRuVector: true,
  useHNSW: true,  // Keep as fallback
}
```

### 4. Graceful Degradation

BaseAgent automatically falls back to HNSW when RuVector is unavailable:

```typescript
// No special handling needed - automatic fallback
const patterns = await this.searchQEPatterns(embedding, 10);
// Works with RuVector, HNSW, or in-memory
```

## Troubleshooting

### Pattern Store Not Initializing

Check logs for initialization warnings:

```
[agent-id] QE Pattern Store initialized (RuVector: true)
[agent-id] ✅ GNN Learning enabled (active, LoRA: active)
```

If you see warnings:

```
[agent-id] Pattern Store initialization failed: ...
[agent-id] ⚠️ GNN Learning unavailable: ...
```

Verify:
1. RuVector Docker is running: `docker ps | grep ruvector`
2. Port 8080 is accessible: `curl http://localhost:8080/health`
3. Storage path is writable: `ls -la ./data/`

### Low Cache Hit Rate

If GNN cache hit rate is below 30%:

1. Increase `cacheThreshold` (default: 0.85)
2. Force learning consolidation more frequently
3. Verify embedding quality (should be 384-dim)
4. Check pattern diversity (use MMR)

### High Memory Usage

If pattern store uses too much memory:

1. Enable auto-persist: `autoPersist: true`
2. Reduce HNSW parameters: `efSearch`, `efConstruction`
3. Use RuVector Docker (18% less memory than local)
4. Periodically clear old patterns

## Next Steps

- [RuVector Docker Setup](./ruvector-docker-setup.md)
- [GNN Learning Tuning](./gnn-learning-tuning.md)
- [Pattern Store Benchmarks](./pattern-store-benchmarks.md)
- [Migration Guide: HNSW to RuVector](./migration-hnsw-ruvector.md)
