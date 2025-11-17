# Phase 2 File Structure
**Version**: v1.1.0
**Purpose**: Complete directory structure for Phase 2 implementation

---

## Directory Overview

```
/workspaces/agentic-qe-cf/
├── src/
│   ├── reasoning/              # NEW - QEReasoningBank
│   │   ├── QEReasoningBank.ts
│   │   ├── SemanticIndex.ts
│   │   ├── PatternMatcher.ts
│   │   └── index.ts
│   │
│   ├── learning/               # NEW - LearningEngine
│   │   ├── LearningEngine.ts
│   │   ├── FeedbackQueue.ts
│   │   ├── StrategyOptimizer.ts
│   │   └── index.ts
│   │
│   ├── core/                   # ENHANCED
│   │   ├── Phase2Integration.ts  # NEW
│   │   └── ... (existing Phase 1 files)
│   │
│   ├── agents/                 # ENHANCED
│   │   ├── TestGeneratorAgent.ts  # MODIFIED - Add EnhancedTestGeneratorAgent
│   │   ├── FlakyTestHunterAgent.ts  # MODIFIED - Add learning integration
│   │   └── ... (existing agents)
│   │
│   ├── api/                    # NEW
│   │   ├── Phase2API.ts
│   │   └── index.ts
│   │
│   ├── types/                  # ENHANCED
│   │   ├── reasoning.types.ts   # NEW
│   │   ├── learning.types.ts    # NEW
│   │   └── ... (existing types)
│   │
│   └── ... (other directories)
│
├── tests/
│   ├── unit/
│   │   ├── reasoning/          # NEW
│   │   │   ├── QEReasoningBank.test.ts
│   │   │   ├── SemanticIndex.test.ts
│   │   │   └── PatternMatcher.test.ts
│   │   │
│   │   ├── learning/           # NEW
│   │   │   ├── LearningEngine.test.ts
│   │   │   ├── FeedbackQueue.test.ts
│   │   │   └── StrategyOptimizer.test.ts
│   │   │
│   │   └── ... (existing tests)
│   │
│   ├── integration/
│   │   ├── phase2/             # NEW
│   │   │   ├── phase2-integration.test.ts
│   │   │   ├── reasoning-learning-integration.test.ts
│   │   │   └── enhanced-test-generation.test.ts
│   │   │
│   │   └── ... (existing tests)
│   │
│   ├── e2e/                    # ENHANCED
│   │   ├── phase2-e2e.test.ts  # NEW
│   │   ├── pattern-learning-flow.test.ts  # NEW
│   │   └── multi-agent-learning.test.ts   # NEW
│   │
│   ├── performance/            # ENHANCED
│   │   ├── reasoning-bank-perf.test.ts  # NEW
│   │   ├── learning-engine-perf.test.ts  # NEW
│   │   └── phase2-integration-perf.test.ts  # NEW
│   │
│   └── api/                    # NEW
│       └── Phase2API.test.ts
│
├── docs/
│   ├── PHASE2-INTEGRATION-COORDINATOR-REPORT.md  # NEW
│   ├── PHASE2-ARCHITECTURE-BLUEPRINT.md          # NEW
│   ├── PHASE2-IMPLEMENTATION-ROADMAP.md          # NEW
│   ├── PHASE2-INTEGRATION-SUMMARY.md             # NEW
│   ├── PHASE2-FILE-STRUCTURE.md                  # NEW (this file)
│   ├── PHASE2-API-REFERENCE.md                   # TODO
│   ├── PHASE2-INTEGRATION-GUIDE.md               # TODO
│   ├── PHASE2-MIGRATION-GUIDE.md                 # TODO
│   └── PHASE2-EXAMPLES.md                        # TODO
│
├── examples/
│   └── phase2/                 # NEW
│       ├── basic-pattern-usage.ts
│       ├── learning-engine-integration.ts
│       └── custom-pattern-creation.ts
│
├── config/
│   └── phase2.json             # NEW
│
└── ... (other directories)
```

---

## Detailed File Specifications

### 1. Source Code (`/src`)

#### 1.1 Reasoning Module (`/src/reasoning/`)

**QEReasoningBank.ts** (300-400 lines)
```typescript
/**
 * QEReasoningBank - Pattern storage and retrieval system
 * Implements semantic indexing, pattern matching, and success tracking
 */
export class QEReasoningBank {
  private patterns: Map<string, QEPattern>;
  private semanticIndex: SemanticIndex;
  private memoryManager: SwarmMemoryManager;
  private eventBus: EventBus;

  async initialize(): Promise<void>;
  async storePattern(pattern: QEPattern): Promise<void>;
  async findPatterns(query: PatternQuery): Promise<QEPattern[]>;
  async updatePatternSuccess(patternId: string, success: boolean, metrics: any): Promise<void>;
  async shutdown(): Promise<void>;
}
```

**SemanticIndex.ts** (200-250 lines)
```typescript
/**
 * SemanticIndex - Similarity-based pattern search
 * Uses vectorization and cosine similarity
 */
export class SemanticIndex {
  private index: Map<string, IndexEntry[]>;

  async add(id: string, signature: CodeSignature): Promise<void>;
  async search(signature: string, options: SearchOptions): Promise<string[]>;
  private vectorize(signature: CodeSignature): number[];
  private cosineSimilarity(a: number[], b: number[]): number;
}
```

**PatternMatcher.ts** (150-200 lines)
```typescript
/**
 * PatternMatcher - Advanced pattern matching algorithms
 * Framework-specific and complexity-based matching
 */
export class PatternMatcher {
  matchByCodeSignature(pattern: QEPattern, signature: string): number;
  matchByFramework(pattern: QEPattern, framework: string): boolean;
  matchByComplexity(pattern: QEPattern, complexity: number): number;
  calculateRelevanceScore(pattern: QEPattern, query: PatternQuery): number;
}
```

**index.ts**
```typescript
export { QEReasoningBank } from './QEReasoningBank';
export { SemanticIndex } from './SemanticIndex';
export { PatternMatcher } from './PatternMatcher';
```

#### 1.2 Learning Module (`/src/learning/`)

**LearningEngine.ts** (400-500 lines)
```typescript
/**
 * LearningEngine - Continuous learning from test execution
 * Processes feedback, adapts strategies, optimizes patterns
 */
export class LearningEngine {
  private memoryManager: SwarmMemoryManager;
  private eventBus: EventBus;
  private reasoningBank?: QEReasoningBank;
  private feedbackQueue: FeedbackQueue;
  private strategyOptimizer: StrategyOptimizer;

  async initialize(): Promise<void>;
  async learnFromTask(taskData: PostTaskData): Promise<void>;
  async processFeedback(feedback: LearningFeedback): Promise<void>;
  async adaptStrategy(agentId: string, metrics: any): Promise<void>;
  async shutdown(): Promise<void>;
}
```

**FeedbackQueue.ts** (100-150 lines)
```typescript
/**
 * FeedbackQueue - Thread-safe feedback processing queue
 * Batching and prioritization
 */
export class FeedbackQueue {
  private queue: LearningFeedback[];

  enqueue(feedback: LearningFeedback): void;
  dequeue(): LearningFeedback | undefined;
  dequeueAll(): LearningFeedback[];
  size(): number;
}
```

**StrategyOptimizer.ts** (250-300 lines)
```typescript
/**
 * StrategyOptimizer - Adaptive strategy selection
 * Identifies underperformers and optimizes test strategies
 */
export class StrategyOptimizer {
  private reasoningBank?: QEReasoningBank;

  async optimize(feedbacks: LearningFeedback[], underperformers: string[]): Promise<void>;
  async adapt(currentStrategy: any, metrics: any): Promise<any>;
  private identifyTopPatterns(feedbacks: LearningFeedback[]): Promise<string[]>;
  private identifyUnderperformers(feedbacks: LearningFeedback[]): Promise<string[]>;
}
```

**index.ts**
```typescript
export { LearningEngine } from './LearningEngine';
export { FeedbackQueue } from './FeedbackQueue';
export { StrategyOptimizer } from './StrategyOptimizer';
```

#### 1.3 Core Module (`/src/core/`)

**Phase2Integration.ts** (200-250 lines)
```typescript
/**
 * Phase2Integration - Component coordinator
 * Initialization, dependency injection, graceful degradation
 */
export class Phase2Integration {
  private reasoningBank?: QEReasoningBank;
  private learningEngine?: LearningEngine;
  private memoryManager: SwarmMemoryManager;
  private eventBus: EventBus;

  async initialize(): Promise<void>;
  enhanceAgent(agent: BaseAgent): void;
  getReasoningBank(): QEReasoningBank | undefined;
  getLearningEngine(): LearningEngine | undefined;
  async shutdown(): Promise<void>;
}
```

#### 1.4 Agents Module (`/src/agents/`)

**Modifications to TestGeneratorAgent.ts** (add ~100 lines)
```typescript
/**
 * EnhancedTestGeneratorAgent - Pattern-based test generation
 * Extends TestGeneratorAgent with QEReasoningBank integration
 */
export class EnhancedTestGeneratorAgent extends TestGeneratorAgent {
  private reasoningBank?: QEReasoningBank;
  private learningEngine?: LearningEngine;

  setPhase2Components(bank: QEReasoningBank, engine: LearningEngine): void;
  async generateTests(request: TestGenerationRequest): Promise<TestSuite>;
  protected async onPostTask(data: PostTaskData): Promise<void>;
}
```

**Modifications to FlakyTestHunterAgent.ts** (add ~50 lines)
```typescript
// Add learning integration
private learningEngine?: LearningEngine;

setLearningEngine(engine: LearningEngine): void {
  this.learningEngine = engine;
}

// Enhance detectFlakyTests to report patterns
async detectFlakyTests(...): Promise<FlakyTestResult[]> {
  const results = await super.detectFlakyTests(...);

  // Report flaky patterns to learning engine
  if (this.learningEngine) {
    await this.learningEngine.processFeedback({
      type: 'flaky-pattern',
      patterns: results.map(r => r.pattern)
    });
  }

  return results;
}
```

#### 1.5 API Module (`/src/api/`)

**Phase2API.ts** (150-200 lines)
```typescript
/**
 * Phase2API - Public API for Phase 2 components
 * Versioned endpoints with backward compatibility
 */
export class Phase2API {
  private integration: Phase2Integration;

  // QEReasoningBank API
  async storePattern(pattern: QEPattern): Promise<{ id: string }>;
  async findPatterns(query: PatternQuery): Promise<QEPattern[]>;
  async getPattern(id: string): Promise<QEPattern | null>;

  // LearningEngine API
  async submitFeedback(feedback: LearningFeedback): Promise<void>;
  async getAdaptiveStrategy(agentId: string): Promise<any>;
  async getLearningMetrics(): Promise<any>;
}
```

**index.ts**
```typescript
export { Phase2API } from './Phase2API';
```

#### 1.6 Types Module (`/src/types/`)

**reasoning.types.ts** (100-150 lines)
```typescript
export interface QEPattern { /* ... */ }
export interface PatternQuery { /* ... */ }
export interface CodeSignature { /* ... */ }
export interface TestCaseTemplate { /* ... */ }
export interface AssertionTemplate { /* ... */ }
export interface ParameterTemplate { /* ... */ }
```

**learning.types.ts** (80-100 lines)
```typescript
export interface LearningFeedback { /* ... */ }
export interface LearningEngineConfig { /* ... */ }
export interface StrategyOptimizationResult { /* ... */ }
export interface AdaptiveStrategy { /* ... */ }
```

---

### 2. Tests (`/tests`)

#### 2.1 Unit Tests (`/tests/unit/`)

**reasoning/QEReasoningBank.test.ts** (~300 lines)
- Pattern storage tests
- Pattern retrieval tests
- Success rate tracking
- Memory integration
- Error handling

**reasoning/SemanticIndex.test.ts** (~200 lines)
- Vectorization tests
- Similarity calculation
- Search accuracy
- Performance benchmarks

**reasoning/PatternMatcher.test.ts** (~150 lines)
- Code signature matching
- Framework matching
- Complexity scoring
- Relevance calculation

**learning/LearningEngine.test.ts** (~400 lines)
- Feedback processing
- Strategy adaptation
- Pattern refinement
- Multi-agent coordination
- Event handling

**learning/FeedbackQueue.test.ts** (~100 lines)
- Queue operations
- Thread safety
- Batching logic

**learning/StrategyOptimizer.test.ts** (~200 lines)
- Strategy optimization
- Underperformer identification
- Pattern replacement
- Adaptive selection

#### 2.2 Integration Tests (`/tests/integration/phase2/`)

**phase2-integration.test.ts** (~300 lines)
- Component initialization
- Dependency wiring
- Event propagation
- Graceful degradation
- Error recovery

**reasoning-learning-integration.test.ts** (~250 lines)
- Pattern learning flow
- Feedback loop
- Success rate updates
- Cross-component communication

**enhanced-test-generation.test.ts** (~200 lines)
- Pattern-based generation
- AI + pattern hybrid
- Quality improvements
- Coverage optimization

#### 2.3 E2E Tests (`/tests/e2e/`)

**phase2-e2e.test.ts** (~400 lines)
- Full workflow scenarios
- Multi-agent coordination
- End-to-end pattern learning
- Real-world use cases

**pattern-learning-flow.test.ts** (~250 lines)
- Generate → Execute → Learn → Reuse
- Pattern effectiveness validation
- Long-term learning verification

**multi-agent-learning.test.ts** (~300 lines)
- Concurrent agent learning
- Pattern sharing
- Coordination testing

#### 2.4 Performance Tests (`/tests/performance/`)

**reasoning-bank-perf.test.ts** (~200 lines)
- Pattern lookup latency
- Search performance
- Memory growth
- Concurrent access

**learning-engine-perf.test.ts** (~200 lines)
- Feedback processing throughput
- Strategy optimization speed
- Learning overhead
- Queue performance

**phase2-integration-perf.test.ts** (~150 lines)
- End-to-end latency
- Component initialization time
- Resource utilization

#### 2.5 API Tests (`/tests/api/`)

**Phase2API.test.ts** (~250 lines)
- API endpoint testing
- Error handling
- Backward compatibility
- Versioning validation

---

### 3. Documentation (`/docs`)

**PHASE2-API-REFERENCE.md** (TODO - ~1500 lines)
- Complete API documentation (TypeDoc)
- Interface specifications
- Code examples
- Usage patterns

**PHASE2-INTEGRATION-GUIDE.md** (TODO - ~1000 lines)
- Step-by-step integration
- Configuration options
- Best practices
- Troubleshooting

**PHASE2-MIGRATION-GUIDE.md** (TODO - ~800 lines)
- Upgrading from v1.0.5
- Breaking changes
- Migration steps
- Compatibility matrix

**PHASE2-EXAMPLES.md** (TODO - ~600 lines)
- Basic usage examples
- Advanced patterns
- Common scenarios
- Best practices

---

### 4. Examples (`/examples/phase2/`)

**basic-pattern-usage.ts** (~150 lines)
```typescript
// Example: Store and retrieve patterns
import { QEReasoningBank } from '../src/reasoning';

const bank = new QEReasoningBank(config);
await bank.initialize();

// Store a pattern
await bank.storePattern(myPattern);

// Find patterns
const patterns = await bank.findPatterns({
  framework: 'jest',
  minSuccessRate: 0.8
});
```

**learning-engine-integration.ts** (~200 lines)
```typescript
// Example: Integrate learning engine
import { LearningEngine } from '../src/learning';

const engine = new LearningEngine(config);
await engine.initialize();

// Process feedback
await engine.processFeedback({
  taskId: 'task-123',
  result: 'success',
  metrics: { coverage: 0.95 }
});
```

**custom-pattern-creation.ts** (~250 lines)
```typescript
// Example: Create custom test patterns
const customPattern: QEPattern = {
  id: uuid(),
  name: 'Custom API Test Pattern',
  framework: 'jest',
  testStrategy: { /* ... */ },
  // ... full pattern definition
};

await bank.storePattern(customPattern);
```

---

### 5. Configuration (`/config`)

**phase2.json** (~100 lines)
```json
{
  "reasoningBank": {
    "enabled": true,
    "storage": "memory",
    "namespace": "aqe-reasoning-bank",
    "indexing": {
      "semantic": true,
      "frameworkBased": true
    },
    "cache": {
      "maxSize": 1000,
      "ttl": 7776000
    }
  },
  "learning": {
    "enabled": true,
    "feedbackInterval": 5000,
    "adaptiveThreshold": true,
    "strategyOptimization": {
      "enabled": true,
      "interval": 60000
    }
  },
  "integration": {
    "gracefulDegradation": true,
    "retryAttempts": 3,
    "timeout": 30000
  }
}
```

---

## File Count Summary

| Directory | New Files | Modified Files | Total Lines |
|-----------|-----------|----------------|-------------|
| `/src/reasoning/` | 4 | 0 | ~900 |
| `/src/learning/` | 4 | 0 | ~1000 |
| `/src/core/` | 1 | 0 | ~250 |
| `/src/agents/` | 0 | 2 | ~150 |
| `/src/api/` | 2 | 0 | ~200 |
| `/src/types/` | 2 | 0 | ~250 |
| `/tests/unit/` | 6 | 0 | ~1550 |
| `/tests/integration/` | 3 | 0 | ~750 |
| `/tests/e2e/` | 3 | 0 | ~950 |
| `/tests/performance/` | 3 | 0 | ~550 |
| `/tests/api/` | 1 | 0 | ~250 |
| `/docs/` | 9 | 0 | ~5000 |
| `/examples/` | 3 | 0 | ~600 |
| `/config/` | 1 | 0 | ~100 |
| **TOTAL** | **42** | **2** | **~12,550** |

---

## Implementation Priority

### Critical Path (Must Implement First)
1. `/src/types/reasoning.types.ts`
2. `/src/types/learning.types.ts`
3. `/src/reasoning/QEReasoningBank.ts`
4. `/src/reasoning/SemanticIndex.ts`
5. `/src/learning/LearningEngine.ts`
6. `/src/core/Phase2Integration.ts`

### Secondary (Implement After Critical Path)
7. `/src/learning/FeedbackQueue.ts`
8. `/src/learning/StrategyOptimizer.ts`
9. `/src/reasoning/PatternMatcher.ts`
10. `/src/agents/TestGeneratorAgent.ts` (modifications)
11. `/src/api/Phase2API.ts`

### Tertiary (Implement Last)
12. All test files
13. Documentation
14. Examples
15. Configuration

---

## Build Configuration

### TypeScript Configuration Updates
```json
// tsconfig.json (add to compilerOptions.paths)
{
  "@reasoning/*": ["src/reasoning/*"],
  "@learning/*": ["src/learning/*"]
}
```

### Jest Configuration Updates
```javascript
// jest.config.js (add to moduleNameMapper)
{
  '^@reasoning/(.*)$': '<rootDir>/src/reasoning/$1',
  '^@learning/(.*)$': '<rootDir>/src/learning/$1'
}
```

---

## Conclusion

This file structure provides a complete roadmap for Phase 2 implementation. All files are organized logically, with clear dependencies and implementation priorities.

**Next Steps**: Follow the Implementation Roadmap to create these files in sequence.
