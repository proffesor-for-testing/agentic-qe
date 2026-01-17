# v3-qe-memory-system

## Purpose
Guide the implementation of unified memory system for AQE v3 using AgentDB with HNSW vector indexing.

## Activation
- When implementing QE memory persistence
- When adding vector search capabilities
- When optimizing memory performance
- When implementing cross-agent memory sharing

## Memory Architecture

### AgentDB Integration for QE

```typescript
// v3/src/infrastructure/memory/QEAgentDB.ts
import { AgentDB, HNSWIndex, EmbeddingProvider } from '@aqe/agentdb';

export class QEAgentDB {
  private readonly db: AgentDB;
  private readonly indexes: Map<string, HNSWIndex> = new Map();

  constructor(config: QEAgentDBConfig) {
    this.db = new AgentDB({
      storagePath: config.storagePath,
      embeddingProvider: config.embeddingProvider,
      indexConfig: {
        M: 16,           // HNSW connections per node
        efConstruction: 200,
        efSearch: 100
      }
    });

    this.initializeQEIndexes();
  }

  private async initializeQEIndexes(): Promise<void> {
    // Domain-specific indexes for O(log n) search
    const domains = [
      'test-suites',
      'coverage-reports',
      'defect-patterns',
      'quality-gates',
      'learning-patterns',
      'execution-history'
    ];

    for (const domain of domains) {
      const index = await this.db.createIndex(domain, {
        dimensions: 1536,  // OpenAI embedding size
        metric: 'cosine'
      });
      this.indexes.set(domain, index);
    }
  }

  // Store with automatic embedding generation
  async storeTestSuite(testSuite: TestSuite): Promise<void> {
    const embedding = await this.generateTestSuiteEmbedding(testSuite);
    await this.db.store({
      id: testSuite.id,
      index: 'test-suites',
      data: testSuite.toJSON(),
      embedding,
      metadata: {
        framework: testSuite.framework,
        targetPath: testSuite.targetPath,
        testCount: testSuite.testCases.length,
        createdAt: new Date().toISOString()
      }
    });
  }

  // O(log n) semantic search
  async findSimilarTests(query: string, limit: number = 10): Promise<TestSuite[]> {
    const queryEmbedding = await this.db.embed(query);
    const results = await this.indexes.get('test-suites')!.search(queryEmbedding, {
      k: limit,
      filter: { /* optional filters */ }
    });
    return results.map(r => TestSuite.fromJSON(r.data));
  }
}
```

### Memory Namespaces for QE Domains

```typescript
// v3/src/infrastructure/memory/QEMemoryNamespaces.ts
export const QE_NAMESPACES = {
  // Test Generation Domain
  TEST_GENERATION: {
    SUITES: 'qe:test-generation:suites',
    TEMPLATES: 'qe:test-generation:templates',
    PATTERNS: 'qe:test-generation:patterns',
    AI_GENERATED: 'qe:test-generation:ai-generated'
  },

  // Coverage Analysis Domain
  COVERAGE: {
    REPORTS: 'qe:coverage:reports',
    GAPS: 'qe:coverage:gaps',
    TRENDS: 'qe:coverage:trends',
    VECTORS: 'qe:coverage:vectors'
  },

  // Quality Assessment Domain
  QUALITY: {
    GATES: 'qe:quality:gates',
    EVALUATIONS: 'qe:quality:evaluations',
    METRICS: 'qe:quality:metrics',
    THRESHOLDS: 'qe:quality:thresholds'
  },

  // Defect Intelligence Domain
  DEFECTS: {
    PREDICTIONS: 'qe:defects:predictions',
    PATTERNS: 'qe:defects:patterns',
    HISTORY: 'qe:defects:history',
    ROOT_CAUSES: 'qe:defects:root-causes'
  },

  // Test Execution Domain
  EXECUTION: {
    RUNS: 'qe:execution:runs',
    RESULTS: 'qe:execution:results',
    FLAKY: 'qe:execution:flaky',
    PERFORMANCE: 'qe:execution:performance'
  },

  // Learning Optimization Domain
  LEARNING: {
    PATTERNS: 'qe:learning:patterns',
    TRANSFERS: 'qe:learning:transfers',
    IMPROVEMENTS: 'qe:learning:improvements',
    CROSS_DOMAIN: 'qe:learning:cross-domain'
  },

  // Cross-Agent Coordination
  COORDINATION: {
    AGENT_STATE: 'qe:coordination:agent-state',
    TASK_QUEUE: 'qe:coordination:task-queue',
    SHARED_CONTEXT: 'qe:coordination:shared-context'
  }
} as const;
```

### HNSW Configuration for QE Workloads

```typescript
// v3/src/infrastructure/memory/HNSWConfig.ts
export const QE_HNSW_CONFIGS = {
  // High-precision for defect prediction
  DEFECT_PREDICTION: {
    M: 32,              // More connections for accuracy
    efConstruction: 400,
    efSearch: 200,
    metric: 'cosine'
  },

  // Balanced for coverage analysis
  COVERAGE_ANALYSIS: {
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine'
  },

  // Fast for test lookup
  TEST_LOOKUP: {
    M: 8,
    efConstruction: 100,
    efSearch: 50,
    metric: 'euclidean'
  },

  // High-recall for pattern learning
  PATTERN_LEARNING: {
    M: 24,
    efConstruction: 300,
    efSearch: 150,
    metric: 'cosine'
  }
};

// Performance characteristics:
// - Build time: O(n log n)
// - Search time: O(log n)
// - Memory: O(n * M)
// - 150x-12,500x faster than brute force
```

### Cross-Agent Memory Sharing

```typescript
// v3/src/infrastructure/memory/CrossAgentMemory.ts
export class CrossAgentMemory {
  constructor(
    private readonly agentDB: QEAgentDB,
    private readonly eventBus: DomainEventBus
  ) {}

  // Share context between agents
  async shareContext(
    sourceAgent: string,
    targetAgents: string[],
    context: SharedContext
  ): Promise<void> {
    const embedding = await this.agentDB.embed(JSON.stringify(context));

    await this.agentDB.store({
      id: `shared:${sourceAgent}:${Date.now()}`,
      index: 'coordination',
      data: {
        source: sourceAgent,
        targets: targetAgents,
        context,
        sharedAt: new Date().toISOString()
      },
      embedding,
      ttl: context.ttl || 3600 // 1 hour default
    });

    // Notify target agents
    this.eventBus.publish(new ContextShared({
      source: sourceAgent,
      targets: targetAgents,
      contextId: context.id
    }));
  }

  // Retrieve relevant context for agent
  async getRelevantContext(
    agent: string,
    query: string,
    limit: number = 5
  ): Promise<SharedContext[]> {
    const results = await this.agentDB.search(query, {
      index: 'coordination',
      filter: {
        $or: [
          { 'data.targets': { $contains: agent } },
          { 'data.targets': { $contains: '*' } }
        ]
      },
      limit
    });

    return results.map(r => r.data.context);
  }
}
```

### Memory-Backed Pattern Learning

```typescript
// v3/src/domains/learning-optimization/services/MemoryPatternLearner.ts
export class MemoryPatternLearner {
  constructor(private readonly memory: QEAgentDB) {}

  async learnFromTestResults(results: TestResult[]): Promise<LearnedPattern[]> {
    const patterns: LearnedPattern[] = [];

    for (const result of results) {
      if (result.failed) {
        // Find similar past failures
        const similarFailures = await this.memory.search(
          result.errorMessage,
          { index: 'defects', limit: 10 }
        );

        if (similarFailures.length > 0) {
          // Extract pattern from similar failures
          const pattern = this.extractPattern(result, similarFailures);
          patterns.push(pattern);

          // Store new pattern
          await this.memory.store({
            id: `pattern:${pattern.id}`,
            index: 'learning',
            data: pattern,
            embedding: await this.memory.embed(pattern.description)
          });
        }
      }
    }

    return patterns;
  }

  async suggestFixes(failure: TestFailure): Promise<FixSuggestion[]> {
    // O(log n) search for similar failures with known fixes
    const similar = await this.memory.search(failure.errorMessage, {
      index: 'defects',
      filter: { 'data.hasfix': true },
      limit: 5
    });

    return similar.map(s => ({
      confidence: s.score,
      fix: s.data.fix,
      source: s.data.id
    }));
  }
}
```

### Memory Persistence Strategies

```typescript
// v3/src/infrastructure/memory/PersistenceStrategy.ts
export interface PersistenceStrategy {
  persist(key: string, value: any): Promise<void>;
  restore(key: string): Promise<any>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

// SQLite for structured data
export class SQLitePersistence implements PersistenceStrategy {
  constructor(private readonly db: Database) {}

  async persist(key: string, value: any): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO memory (key, value, updated_at) VALUES (?, ?, ?)',
      [key, JSON.stringify(value), new Date().toISOString()]
    );
  }
}

// File-based for large embeddings
export class FilePersistence implements PersistenceStrategy {
  constructor(private readonly basePath: string) {}

  async persist(key: string, value: any): Promise<void> {
    const path = join(this.basePath, `${key}.json`);
    await fs.writeFile(path, JSON.stringify(value));
  }
}

// Hybrid strategy
export class HybridPersistence implements PersistenceStrategy {
  constructor(
    private readonly sqlite: SQLitePersistence,
    private readonly file: FilePersistence
  ) {}

  async persist(key: string, value: any): Promise<void> {
    const size = JSON.stringify(value).length;
    if (size > 1_000_000) { // > 1MB
      await this.file.persist(key, value);
      await this.sqlite.persist(key, { type: 'file', path: `${key}.json` });
    } else {
      await this.sqlite.persist(key, value);
    }
  }
}
```

## File Structure

```
v3/src/infrastructure/memory/
├── QEAgentDB.ts           # Main AgentDB wrapper
├── QEMemoryNamespaces.ts  # Namespace definitions
├── HNSWConfig.ts          # Index configurations
├── CrossAgentMemory.ts    # Inter-agent sharing
├── persistence/
│   ├── PersistenceStrategy.ts
│   ├── SQLitePersistence.ts
│   ├── FilePersistence.ts
│   └── HybridPersistence.ts
├── embedding/
│   ├── EmbeddingProvider.ts
│   ├── OpenAIEmbedding.ts
│   └── LocalEmbedding.ts
└── indexes/
    ├── TestSuiteIndex.ts
    ├── CoverageIndex.ts
    ├── DefectIndex.ts
    └── PatternIndex.ts
```

## Performance Benchmarks

| Operation | Brute Force | HNSW | Speedup |
|-----------|-------------|------|---------|
| 10K vectors | 50ms | 0.3ms | 166x |
| 100K vectors | 500ms | 0.4ms | 1,250x |
| 1M vectors | 5,000ms | 0.4ms | 12,500x |

## Implementation Checklist

- [ ] Set up AgentDB with QE configuration
- [ ] Create domain-specific indexes
- [ ] Implement memory namespaces
- [ ] Add cross-agent memory sharing
- [ ] Implement pattern learning with memory
- [ ] Add persistence strategies
- [ ] Create embedding providers
- [ ] Write performance benchmarks
- [ ] Add memory cleanup/TTL management

## Related Skills
- v3-qe-core-implementation - Domain entities
- v3-qe-performance - Optimization techniques
- v3-qe-fleet-coordination - Agent coordination
