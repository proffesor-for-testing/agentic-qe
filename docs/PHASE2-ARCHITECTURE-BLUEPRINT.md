# Phase 2 Architecture Blueprint
**Version**: v1.1.0
**Date**: 2025-10-16
**Status**: DESIGN SPECIFICATION

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Phase 2 Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                       │
│  │  Test        │────────▶│ QE Reasoning │                       │
│  │  Generator   │         │    Bank      │                       │
│  │  Agent       │         └──────┬───────┘                       │
│  └──────┬───────┘                │                               │
│         │                        │                               │
│         │ Patterns               │ Success                       │
│         │                        │ Tracking                      │
│         │                        │                               │
│         ▼                        ▼                               │
│  ┌──────────────┐         ┌──────────────┐                       │
│  │  Learning    │◀────────│   Feedback   │                       │
│  │  Engine      │         │   Processor  │                       │
│  └──────┬───────┘         └──────────────┘                       │
│         │                                                         │
│         │ Adaptive                                                │
│         │ Strategies                                              │
│         │                                                         │
│         ▼                                                         │
│  ┌──────────────┐         ┌──────────────┐                       │
│  │  Base Agent  │────────▶│   Swarm      │                       │
│  │  Lifecycle   │         │   Memory     │                       │
│  └──────────────┘         └──────────────┘                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component 1: QEReasoningBank

### Purpose
Store, index, and retrieve quality engineering patterns based on code characteristics, framework requirements, and historical success rates.

### Core Responsibilities
1. **Pattern Storage**: Store test generation patterns with metadata
2. **Semantic Matching**: Find relevant patterns for code signatures
3. **Success Tracking**: Monitor pattern effectiveness over time
4. **Framework Adaptation**: Adapt patterns across testing frameworks
5. **Cross-Project Learning**: Share patterns between projects

### Data Model

```typescript
// Pattern Entity
interface QEPattern {
  // Identity
  id: string;                    // UUID
  name: string;                  // Human-readable name
  version: string;               // Semantic version (1.0.0)

  // Code Characteristics
  codeSignature: {
    hash: string;                // SHA-256 of normalized code structure
    complexity: number;          // Cyclomatic complexity
    language: string;            // TypeScript, JavaScript, Python, etc.
    patterns: string[];          // Detected design patterns
  };

  // Framework & Strategy
  framework: string;             // jest, mocha, pytest, etc.
  testStrategy: {
    unitTests: number;           // Recommended unit test count
    integrationTests: number;    // Recommended integration test count
    edgeCases: string[];         // Edge case categories
    coverage: number;            // Target coverage percentage
  };

  // Effectiveness Metrics
  metrics: {
    successRate: number;         // 0.0 - 1.0
    usageCount: number;          // Times pattern has been used
    avgCoverage: number;         // Average coverage achieved
    avgExecutionTime: number;    // Average test execution time (ms)
    lastUsed: Date;              // Timestamp of last usage
    createdAt: Date;             // Pattern creation timestamp
  };

  // Pattern Content
  content: {
    description: string;         // What this pattern tests
    testCases: TestCaseTemplate[];
    assertions: AssertionTemplate[];
    setup: string;               // Setup code template
    teardown: string;            // Teardown code template
  };

  // Metadata
  metadata: {
    author: string;              // Creator agent ID
    tags: string[];              // Searchable tags
    category: string;            // unit, integration, e2e, etc.
    confidence: number;          // 0.0 - 1.0
  };
}

// Test Case Template
interface TestCaseTemplate {
  name: string;
  type: 'unit' | 'integration' | 'e2e';
  template: string;              // Code template with placeholders
  parameters: ParameterTemplate[];
}

// Parameter Template
interface ParameterTemplate {
  name: string;
  type: string;
  generator: 'random' | 'boundary' | 'property-based';
  constraints?: any;
}

// Assertion Template
interface AssertionTemplate {
  type: 'equality' | 'contains' | 'throws' | 'custom';
  template: string;
  description: string;
}
```

### Storage Strategy

```typescript
class QEReasoningBank {
  private patterns: Map<string, QEPattern>;           // In-memory cache
  private memoryManager: SwarmMemoryManager;          // Persistent storage
  private semanticIndex: SemanticIndex;               // Similarity search

  constructor(config: QEReasoningBankConfig) {
    this.patterns = new Map();
    this.memoryManager = config.memoryManager;
    this.semanticIndex = new SemanticIndex();
  }

  // Storage namespace: "reasoning-bank/patterns/{patternId}"
  // Index namespace: "reasoning-bank/index/{framework}/{hash}"

  async storePattern(pattern: QEPattern): Promise<void> {
    // 1. Store in memory cache
    this.patterns.set(pattern.id, pattern);

    // 2. Persist to SwarmMemoryManager
    await this.memoryManager.store(
      `reasoning-bank/patterns/${pattern.id}`,
      pattern,
      { partition: 'patterns', ttl: 86400 * 90 } // 90 days
    );

    // 3. Update semantic index
    await this.semanticIndex.add(pattern.id, pattern.codeSignature);

    // 4. Update framework index
    await this.updateFrameworkIndex(pattern);
  }

  async findPatterns(query: PatternQuery): Promise<QEPattern[]> {
    // 1. Semantic search for code signature
    const candidateIds = await this.semanticIndex.search(
      query.codeSignature,
      { limit: query.limit || 10, threshold: 0.7 }
    );

    // 2. Load patterns from cache or storage
    const candidates = await this.loadPatterns(candidateIds);

    // 3. Filter by criteria
    let results = candidates.filter(p => {
      if (query.framework && p.framework !== query.framework) return false;
      if (query.minSuccessRate && p.metrics.successRate < query.minSuccessRate) return false;
      return true;
    });

    // 4. Sort by relevance
    results = this.sortPatterns(results, query.sortBy || 'successRate');

    return results;
  }

  async updatePatternSuccess(
    patternId: string,
    success: boolean,
    metrics: { coverage: number; executionTime: number }
  ): Promise<void> {
    const pattern = await this.getPattern(patternId);
    if (!pattern) return;

    // Update metrics using running average
    const n = pattern.metrics.usageCount;
    pattern.metrics.usageCount++;
    pattern.metrics.successRate = (pattern.metrics.successRate * n + (success ? 1 : 0)) / (n + 1);
    pattern.metrics.avgCoverage = (pattern.metrics.avgCoverage * n + metrics.coverage) / (n + 1);
    pattern.metrics.avgExecutionTime = (pattern.metrics.avgExecutionTime * n + metrics.executionTime) / (n + 1);
    pattern.metrics.lastUsed = new Date();

    // Persist update
    await this.storePattern(pattern);
  }
}
```

### Semantic Indexing

```typescript
class SemanticIndex {
  private index: Map<string, { id: string; vector: number[] }[]>;

  async add(id: string, codeSignature: CodeSignature): Promise<void> {
    // Convert code signature to semantic vector
    const vector = this.vectorize(codeSignature);

    // Add to index bucketed by complexity
    const bucket = this.getBucket(codeSignature.complexity);
    if (!this.index.has(bucket)) {
      this.index.set(bucket, []);
    }
    this.index.get(bucket)!.push({ id, vector });
  }

  async search(
    codeSignature: string,
    options: { limit: number; threshold: number }
  ): Promise<string[]> {
    const queryVector = this.vectorize({ hash: codeSignature } as any);

    // Search across all buckets
    const results: Array<{ id: string; similarity: number }> = [];

    for (const [bucket, entries] of this.index) {
      for (const entry of entries) {
        const similarity = this.cosineSimilarity(queryVector, entry.vector);
        if (similarity >= options.threshold) {
          results.push({ id: entry.id, similarity });
        }
      }
    }

    // Sort by similarity and return top N
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit)
      .map(r => r.id);
  }

  private vectorize(signature: CodeSignature): number[] {
    // Simple vectorization (in production, use embeddings)
    return [
      signature.complexity / 100,
      signature.patterns?.length || 0,
      // ... more features
    ];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magA * magB);
  }
}
```

---

## Component 2: LearningEngine

### Purpose
Continuously learn from test execution results, adapt strategies, and improve pattern effectiveness through feedback loops.

### Core Responsibilities
1. **Feedback Processing**: Collect and analyze test execution results
2. **Pattern Refinement**: Update pattern success rates and metadata
3. **Strategy Adaptation**: Adjust test generation strategies based on outcomes
4. **Multi-Agent Learning**: Coordinate learning across agent fleet
5. **Performance Optimization**: Identify and optimize slow patterns

### Architecture

```typescript
class LearningEngine {
  private memoryManager: SwarmMemoryManager;
  private eventBus: EventBus;
  private reasoningBank: QEReasoningBank;
  private feedbackQueue: FeedbackQueue;
  private strategyOptimizer: StrategyOptimizer;

  constructor(config: LearningEngineConfig) {
    this.memoryManager = config.memoryManager;
    this.eventBus = config.eventBus;
    this.reasoningBank = config.reasoningBank;
    this.feedbackQueue = new FeedbackQueue();
    this.strategyOptimizer = new StrategyOptimizer(this.reasoningBank);
  }

  async initialize(): Promise<void> {
    // Start feedback processing loop
    this.startFeedbackLoop(this.config.feedbackInterval);

    // Register event listeners
    this.registerEventHandlers();

    // Load historical learning data
    await this.loadLearningState();
  }

  private startFeedbackLoop(interval: number): void {
    setInterval(async () => {
      await this.processFeedbackBatch();
    }, interval);
  }

  private registerEventHandlers(): void {
    // Learn from test execution
    this.eventBus.on('test.executed', async (event) => {
      await this.learnFromExecution(event.data);
    });

    // Learn from pattern usage
    this.eventBus.on('pattern.used', async (event) => {
      await this.learnFromPatternUsage(event.data);
    });

    // Adapt strategies on failures
    this.eventBus.on('test.failed', async (event) => {
      await this.adaptOnFailure(event.data);
    });
  }

  async learnFromTask(taskData: PostTaskData): Promise<void> {
    // Extract learning signals
    const feedback: LearningFeedback = {
      taskId: taskData.assignment.id,
      agentId: taskData.assignment.agentId,
      result: this.classifyResult(taskData.result),
      metrics: {
        coverageAchieved: taskData.result.coverage || 0,
        executionTime: Date.now() - taskData.assignment.assignedAt.getTime(),
        qualityScore: this.calculateQualityScore(taskData.result)
      },
      patterns: taskData.result.patternsUsed || [],
      timestamp: new Date()
    };

    // Add to feedback queue
    this.feedbackQueue.enqueue(feedback);
  }

  private async processFeedbackBatch(): Promise<void> {
    const batch = this.feedbackQueue.dequeueAll();
    if (batch.length === 0) return;

    // 1. Update pattern success rates
    await this.updatePatternMetrics(batch);

    // 2. Identify underperforming patterns
    const underperformers = await this.identifyUnderperformers(batch);

    // 3. Optimize strategies
    await this.strategyOptimizer.optimize(batch, underperformers);

    // 4. Store learning insights
    await this.storeLearningInsights(batch);
  }

  private async updatePatternMetrics(batch: LearningFeedback[]): Promise<void> {
    // Group by pattern
    const byPattern = new Map<string, LearningFeedback[]>();

    for (const feedback of batch) {
      for (const patternId of feedback.patterns) {
        if (!byPattern.has(patternId)) {
          byPattern.set(patternId, []);
        }
        byPattern.get(patternId)!.push(feedback);
      }
    }

    // Update each pattern
    for (const [patternId, feedbacks] of byPattern) {
      const avgCoverage = feedbacks.reduce((sum, f) => sum + f.metrics.coverageAchieved, 0) / feedbacks.length;
      const avgTime = feedbacks.reduce((sum, f) => sum + f.metrics.executionTime, 0) / feedbacks.length;
      const successRate = feedbacks.filter(f => f.result === 'success').length / feedbacks.length;

      await this.reasoningBank.updatePatternSuccess(patternId, successRate >= 0.8, {
        coverage: avgCoverage,
        executionTime: avgTime
      });
    }
  }

  async adaptStrategy(agentId: string, metrics: any): Promise<void> {
    // Load current strategy
    const currentStrategy = await this.memoryManager.retrieve(
      `learning/strategies/${agentId}`
    );

    // Adapt based on metrics
    const adaptedStrategy = await this.strategyOptimizer.adapt(
      currentStrategy,
      metrics
    );

    // Store updated strategy
    await this.memoryManager.store(
      `learning/strategies/${agentId}`,
      adaptedStrategy,
      { partition: 'learning' }
    );

    // Notify agent of strategy update
    this.eventBus.emit('strategy.updated', {
      agentId,
      strategy: adaptedStrategy
    });
  }
}
```

### Strategy Optimizer

```typescript
class StrategyOptimizer {
  private reasoningBank: QEReasoningBank;

  async optimize(
    feedbacks: LearningFeedback[],
    underperformers: string[]
  ): Promise<void> {
    // 1. Identify high-performing patterns
    const topPatterns = await this.identifyTopPatterns(feedbacks);

    // 2. Replace underperformers with high-performers
    for (const underperformer of underperformers) {
      const replacement = await this.findReplacement(underperformer, topPatterns);
      if (replacement) {
        await this.replacePattern(underperformer, replacement);
      }
    }

    // 3. Adjust coverage targets
    await this.adjustCoverageTargets(feedbacks);
  }

  async adapt(
    currentStrategy: any,
    metrics: any
  ): Promise<any> {
    // Adaptive strategy selection based on metrics
    if (metrics.coverageAchieved < metrics.coverageTarget) {
      // Increase test generation
      currentStrategy.testCount *= 1.2;
    } else if (metrics.executionTime > metrics.targetTime) {
      // Optimize for speed
      currentStrategy.optimizationMode = 'speed';
    }

    return currentStrategy;
  }
}
```

---

## Component 3: Phase2Integration

### Purpose
Coordinate initialization, dependency injection, and graceful degradation for Phase 2 components.

### Initialization Sequence

```typescript
class Phase2Integration {
  async initialize(): Promise<void> {
    const steps = [
      { name: 'QEReasoningBank', fn: () => this.initReasoningBank(), critical: true },
      { name: 'LearningEngine', fn: () => this.initLearningEngine(), critical: false },
      { name: 'ComponentWiring', fn: () => this.wireComponents(), critical: true }
    ];

    for (const step of steps) {
      try {
        await step.fn();
        console.log(`✅ ${step.name} initialized`);
      } catch (error) {
        if (step.critical && !this.config.integration.gracefulDegradation) {
          throw new Error(`Critical component failed: ${step.name}`);
        }
        console.warn(`⚠️ ${step.name} failed, continuing with degradation`);
      }
    }
  }

  private async wireComponents(): Promise<void> {
    // Wire ReasoningBank to TestGeneratorAgent
    if (this.reasoningBank) {
      this.eventBus.on('test.generation.start', async (event) => {
        const patterns = await this.reasoningBank!.findPatterns({
          codeSignature: event.data.codeSignature,
          framework: event.data.framework,
          minSuccessRate: 0.8
        });

        event.data.patterns = patterns;
      });
    }

    // Wire LearningEngine to agent lifecycle
    if (this.learningEngine) {
      this.eventBus.on('task.completed', async (event) => {
        await this.learningEngine!.learnFromTask(event.data);
      });
    }
  }

  enhanceAgent(agent: BaseAgent): void {
    // Inject Phase 2 capabilities into agent
    const originalOnPostTask = agent['onPostTask'].bind(agent);

    agent['onPostTask'] = async (data) => {
      // Original lifecycle
      await originalOnPostTask(data);

      // Phase 2 learning
      if (this.learningEngine) {
        await this.learningEngine.learnFromTask(data);
      }
    };
  }
}
```

---

## API Design

### Phase2API.ts

```typescript
export class Phase2API {
  private integration: Phase2Integration;

  // QEReasoningBank API
  async storePattern(pattern: QEPattern): Promise<{ id: string }> {
    const bank = this.integration.getReasoningBank();
    if (!bank) {
      throw new Error('QEReasoningBank not available');
    }

    await bank.storePattern(pattern);
    return { id: pattern.id };
  }

  async findPatterns(query: PatternQuery): Promise<QEPattern[]> {
    const bank = this.integration.getReasoningBank();
    if (!bank) {
      return []; // Graceful degradation
    }

    return await bank.findPatterns(query);
  }

  // LearningEngine API
  async submitFeedback(feedback: LearningFeedback): Promise<void> {
    const engine = this.integration.getLearningEngine();
    if (!engine) {
      return; // Graceful degradation
    }

    await engine.processFeedback(feedback);
  }

  async getAdaptiveStrategy(agentId: string): Promise<any> {
    const engine = this.integration.getLearningEngine();
    if (!engine) {
      return { strategy: 'default' };
    }

    return await engine.getStrategy(agentId);
  }
}
```

---

## Integration with Existing Systems

### TestGeneratorAgent Enhancement

```typescript
class EnhancedTestGeneratorAgent extends TestGeneratorAgent {
  private reasoningBank: QEReasoningBank;
  private learningEngine: LearningEngine;

  async generateTests(request: TestGenerationRequest): Promise<TestSuite> {
    // 1. Extract code signature
    const codeSignature = this.extractCodeSignature(request.sourceCode);

    // 2. Query ReasoningBank for patterns
    const patterns = await this.reasoningBank.findPatterns({
      codeSignature,
      framework: request.framework,
      minSuccessRate: 0.85,
      limit: 5
    });

    // 3. Generate tests using patterns
    const tests = await this.generateTestsFromPatterns(patterns, request);

    // 4. Generate additional tests using AI
    const aiTests = await super.generateTests(request);

    // 5. Merge and optimize
    const mergedTests = this.mergeTestSuites(tests, aiTests);

    // 6. Report to learning engine
    this.eventBus.emit('pattern.used', {
      patterns: patterns.map(p => p.id),
      agentId: this.agentId
    });

    return mergedTests;
  }

  protected async onPostTask(data: PostTaskData): Promise<void> {
    await super.onPostTask(data);

    // Report results to learning engine
    if (this.learningEngine) {
      await this.learningEngine.learnFromTask(data);
    }
  }
}
```

---

## Deployment Strategy

### Configuration

```typescript
// config/phase2.json
{
  "reasoningBank": {
    "enabled": true,
    "storage": "memory", // or "sqlite" for persistence
    "namespace": "aqe-reasoning-bank",
    "indexing": {
      "semantic": true,
      "frameworkBased": true
    },
    "cache": {
      "maxSize": 1000,
      "ttl": 7776000 // 90 days
    }
  },
  "learning": {
    "enabled": true,
    "feedbackInterval": 5000, // 5 seconds
    "adaptiveThreshold": true,
    "strategyOptimization": {
      "enabled": true,
      "interval": 60000 // 1 minute
    }
  },
  "integration": {
    "gracefulDegradation": true,
    "retryAttempts": 3,
    "timeout": 30000 // 30 seconds
  }
}
```

### Initialization

```typescript
// src/index.ts
import { Phase2Integration } from './core/Phase2Integration';

async function initializePhase2(
  memoryManager: SwarmMemoryManager,
  eventBus: EventBus
): Promise<Phase2Integration> {
  const config = loadPhase2Config();

  const integration = new Phase2Integration(memoryManager, eventBus, config);
  await integration.initialize();

  return integration;
}
```

---

## Testing Strategy

### Unit Tests
- QEReasoningBank pattern storage and retrieval
- LearningEngine feedback processing
- Phase2Integration initialization sequence
- Semantic indexing accuracy

### Integration Tests
- End-to-end pattern learning
- Multi-agent coordination
- Graceful degradation scenarios
- Performance under load

### Performance Tests
- Pattern lookup latency (target: <50ms p95)
- Learning overhead (target: <100ms per task)
- Memory growth (target: <10MB per 1000 patterns)
- Concurrent access handling

---

## Monitoring & Observability

### Metrics to Track
- Pattern usage frequency
- Pattern success rates
- Learning adaptation events
- Component initialization failures
- API response times

### Logging
```typescript
logger.info('Pattern stored', {
  patternId: pattern.id,
  framework: pattern.framework,
  successRate: pattern.metrics.successRate
});

logger.info('Learning adaptation', {
  agentId,
  oldStrategy,
  newStrategy,
  reason: 'coverage below target'
});
```

---

## Conclusion

This architecture provides a comprehensive blueprint for Phase 2 implementation. The modular design ensures:
- **Scalability**: Components can scale independently
- **Maintainability**: Clear separation of concerns
- **Extensibility**: Easy to add new features
- **Reliability**: Graceful degradation and error handling

**Next Steps**: Proceed with implementation following this blueprint.
