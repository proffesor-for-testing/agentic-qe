# Learning & Optimization Domain

## Bounded Context Overview

**Domain**: Learning & Optimization
**Responsibility**: Pattern learning, cross-agent knowledge transfer, strategy optimization
**Location**: `src/domains/learning-optimization/`

The Learning & Optimization domain enables continuous improvement across the QE platform through pattern extraction, experience mining, strategy optimization, and cross-domain knowledge synthesis.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Learned Pattern** | Extracted approach from successful operations |
| **Experience** | Recorded agent action with outcome |
| **Knowledge** | Transferable insight between domains |
| **Strategy** | Parameterized approach to a task |
| **Reward** | Feedback signal for reinforcement learning |
| **Experience Replay** | Re-using past experiences for learning |
| **Knowledge Transfer** | Sharing insights between agents/domains |
| **Dream Cycle** | Offline pattern consolidation process |

## Domain Model

### Aggregates

#### LearnedPattern (Aggregate Root)
Extracted pattern from QE operations.

```typescript
interface LearnedPattern {
  id: string;
  type: PatternType;
  domain: DomainName;
  name: string;
  description: string;
  confidence: number;
  usageCount: number;
  successRate: number;
  context: PatternContext;
  template: PatternTemplate;
  createdAt: Date;
  lastUsedAt: Date;
}
```

#### OptimizedStrategy (Aggregate Root)
Optimized strategy for domain operations.

```typescript
interface OptimizedStrategy {
  id: string;
  domain: DomainName;
  objective: OptimizationObjective;
  currentStrategy: Strategy;
  optimizedStrategy: Strategy;
  improvement: number;
  confidence: number;
  validationResults: ValidationResult[];
}
```

### Entities

#### Experience
Recorded agent experience for learning.

```typescript
interface Experience {
  id: string;
  agentId: AgentId;
  domain: DomainName;
  action: string;
  state: StateSnapshot;
  result: ExperienceResult;
  reward: number;
  timestamp: Date;
}
```

#### Knowledge
Transferable insight.

```typescript
interface Knowledge {
  id: string;
  type: KnowledgeType;
  domain: DomainName;
  content: KnowledgeContent;
  sourceAgentId: AgentId;
  targetDomains: DomainName[];
  relevanceScore: number;
  version: number;
  createdAt: Date;
  expiresAt?: Date;
}
```

### Value Objects

#### PatternType
```typescript
type PatternType =
  | 'test-pattern'
  | 'fix-pattern'
  | 'optimization-pattern'
  | 'detection-pattern'
  | 'workflow-pattern'
  | 'failure-pattern';
```

#### KnowledgeType
```typescript
type KnowledgeType =
  | 'fact'
  | 'rule'
  | 'heuristic'
  | 'model'
  | 'embedding'
  | 'workflow';
```

#### PatternContext
Context for pattern applicability.

```typescript
interface PatternContext {
  readonly language?: string;
  readonly framework?: string;
  readonly testType?: string;
  readonly codeContext?: string;
  readonly tags: string[];
}
```

#### PatternTemplate
Template for pattern application.

```typescript
interface PatternTemplate {
  readonly type: 'code' | 'prompt' | 'workflow' | 'config';
  readonly content: string;
  readonly variables: TemplateVariable[];
}
```

#### StateSnapshot
Captured state at experience time.

```typescript
interface StateSnapshot {
  readonly context: Record<string, unknown>;
  readonly metrics: Record<string, number>;
  readonly embeddings?: number[];
}
```

#### ExperienceResult
Outcome of an experience.

```typescript
interface ExperienceResult {
  readonly success: boolean;
  readonly outcome: Record<string, unknown>;
  readonly duration: number;
  readonly resourceUsage?: ResourceUsage;
}
```

#### OptimizationObjective
Goal for strategy optimization.

```typescript
interface OptimizationObjective {
  readonly metric: string;
  readonly direction: 'maximize' | 'minimize';
  readonly constraints: Constraint[];
}
```

## Domain Services

### ILearningOptimizationCoordinator
Primary coordinator for the domain.

```typescript
interface ILearningOptimizationCoordinator {
  runLearningCycle(domain: DomainName): Promise<Result<LearningCycleReport>>;
  optimizeAllStrategies(): Promise<Result<OptimizationReport>>;
  shareCrossDomainLearnings(): Promise<Result<CrossDomainSharingReport>>;
  getLearningDashboard(): Promise<Result<LearningDashboard>>;
  exportModels(domains?: DomainName[]): Promise<Result<ModelExport>>;
  importModels(modelExport: ModelExport): Promise<Result<ImportReport>>;
  publishDreamCycleCompleted(
    cycleId: string,
    durationMs: number,
    conceptsProcessed: number,
    insights: DreamInsight[],
    patternsCreated: number
  ): Promise<void>;

  // MinCut integration (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;

  // Consensus integration (MM-001)
  isConsensusAvailable(): boolean;
}
```

### IPatternLearningService
Pattern extraction and application.

```typescript
interface IPatternLearningService {
  learnPattern(experiences: Experience[]): Promise<Result<LearnedPattern>>;
  findMatchingPatterns(context: PatternContext, limit?: number): Promise<Result<LearnedPattern[]>>;
  applyPattern(pattern: LearnedPattern, variables: Record<string, unknown>): Promise<Result<string>>;
  updatePatternFeedback(patternId: string, success: boolean): Promise<Result<void>>;
  consolidatePatterns(patternIds: string[]): Promise<Result<LearnedPattern>>;
  getPatternStats(domain?: DomainName): Promise<Result<PatternStats>>;
}
```

### IExperienceMiningService
Experience collection and analysis.

```typescript
interface IExperienceMiningService {
  recordExperience(experience: Omit<Experience, 'id' | 'timestamp'>): Promise<Result<string>>;
  mineExperiences(domain: DomainName, timeRange: TimeRange): Promise<Result<MinedInsights>>;
  calculateReward(result: ExperienceResult, objective: OptimizationObjective): number;
  getReplayBuffer(agentId: AgentId, limit?: number): Promise<Result<Experience[]>>;
  clusterExperiences(experiences: Experience[]): Promise<Result<ExperienceCluster[]>>;
}
```

### IStrategyOptimizerService
Strategy optimization using ML.

```typescript
interface IStrategyOptimizerService {
  optimizeStrategy(
    currentStrategy: Strategy,
    objective: OptimizationObjective,
    experiences: Experience[]
  ): Promise<Result<OptimizedStrategy>>;
  runABTest(strategyA: Strategy, strategyB: Strategy, testConfig: ABTestConfig): Promise<Result<ABTestResult>>;
  recommendStrategy(context: PatternContext): Promise<Result<Strategy>>;
  evaluateStrategy(strategy: Strategy, experiences: Experience[]): Promise<Result<StrategyEvaluation>>;
}
```

### IKnowledgeSynthesisService
Cross-agent knowledge transfer.

```typescript
interface IKnowledgeSynthesisService {
  shareKnowledge(knowledge: Knowledge, targetAgents: AgentId[]): Promise<Result<void>>;
  queryKnowledge(query: KnowledgeQuery): Promise<Result<Knowledge[]>>;
  synthesizeKnowledge(knowledgeIds: string[]): Promise<Result<Knowledge>>;
  transferKnowledge(knowledge: Knowledge, targetDomain: DomainName): Promise<Result<Knowledge>>;
  validateRelevance(knowledge: Knowledge, context: PatternContext): Promise<Result<number>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `PatternLearnedEvent` | Pattern extracted | `{ patternId, patternType, domain, confidence }` |
| `KnowledgeSharedEvent` | Knowledge transferred | `{ knowledgeId, sourceAgent, targetDomains, knowledgeType }` |
| `StrategyOptimizedEvent` | Strategy improved | `{ strategyId, domain, improvement, metric }` |
| `ExperienceRecordedEvent` | Experience logged | `{ experienceId, agentId, domain, reward }` |
| `LearningMilestoneReachedEvent` | Milestone achieved | `{ milestone, domain, metrics }` |
| `DreamCycleCompletedEvent` | Dream cycle done | `{ cycleId, conceptsProcessed, insights, patternsCreated }` |

## Repositories

```typescript
interface IPatternRepository {
  findById(id: string): Promise<LearnedPattern | null>;
  findByDomain(domain: DomainName): Promise<LearnedPattern[]>;
  findByType(type: PatternType): Promise<LearnedPattern[]>;
  findSimilar(embedding: number[], limit: number): Promise<LearnedPattern[]>;
  save(pattern: LearnedPattern): Promise<void>;
  update(pattern: LearnedPattern): Promise<void>;
  delete(id: string): Promise<void>;
}

interface IExperienceRepository {
  findById(id: string): Promise<Experience | null>;
  findByAgentId(agentId: AgentId, limit?: number): Promise<Experience[]>;
  findByDomain(domain: DomainName, timeRange: TimeRange): Promise<Experience[]>;
  save(experience: Experience): Promise<void>;
  deleteOlderThan(date: Date): Promise<number>;
}

interface IKnowledgeRepository {
  findById(id: string): Promise<Knowledge | null>;
  findByDomain(domain: DomainName): Promise<Knowledge[]>;
  findByType(type: KnowledgeType): Promise<Knowledge[]>;
  search(query: KnowledgeQuery): Promise<Knowledge[]>;
  save(knowledge: Knowledge): Promise<void>;
  update(knowledge: Knowledge): Promise<void>;
  delete(id: string): Promise<void>;
}

interface IStrategyRepository {
  findById(id: string): Promise<OptimizedStrategy | null>;
  findByDomain(domain: DomainName): Promise<OptimizedStrategy[]>;
  findBest(domain: DomainName, objective: string): Promise<OptimizedStrategy | null>;
  save(strategy: OptimizedStrategy): Promise<void>;
}
```

## Context Integration

### Upstream Dependencies
- All domains: Provide experiences and patterns
- Memory backend: HNSW indexing for pattern search

### Downstream Consumers
- **All domains**: Receive optimized strategies and patterns
- **Test Generation**: Pattern-based test creation
- **Defect Intelligence**: Learned defect patterns

### Anti-Corruption Layer
The domain uses the `Experience` interface to normalize feedback from different domains, enabling cross-domain learning.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `learn-patterns` | `learnPattern()` | Extract patterns |
| `optimize-strategy` | `optimizeStrategy()` | Improve strategies |
| `share-knowledge` | `shareKnowledge()` | Cross-agent transfer |
| `run-learning-cycle` | `runLearningCycle()` | Full learning cycle |
| `run-ab-test` | `runABTest()` | Strategy comparison |

## Learning Cycle

```typescript
async function runLearningCycle(domain: DomainName): Promise<LearningCycleReport> {
  // 1. Collect recent experiences
  const experiences = await experienceRepo.findByDomain(domain, last24Hours);

  // 2. Mine for insights
  const insights = await miningService.mineExperiences(domain, experiences);

  // 3. Extract new patterns
  const patterns = await patternService.learnPattern(experiences);

  // 4. Optimize strategies
  const strategies = await optimizerService.optimizeStrategies(domain, experiences);

  // 5. Generate new knowledge
  const knowledge = await synthesisService.synthesize(patterns, insights);

  // 6. Share across domains
  await synthesisService.shareCrossDomain(knowledge);

  return {
    domain,
    experiencesProcessed: experiences.length,
    patternsLearned: patterns.length,
    strategiesOptimized: strategies.length,
    knowledgeGenerated: knowledge.length,
    improvements: calculateImprovements(strategies),
  };
}
```

## Dream Cycle (Offline Consolidation)

The Dream Cycle runs during low-activity periods to consolidate patterns:

```typescript
interface DreamCycleConfig {
  minIdleTime: number;          // Minimum idle before starting
  maxDuration: number;          // Maximum cycle duration
  targetPatternCount: number;   // Patterns to consolidate
  domains: DomainName[];        // Domains to process
}

interface DreamInsight {
  id: string;
  type: string;
  description: string;
  noveltyScore: number;
  confidenceScore: number;
  actionable: boolean;
  suggestedAction?: string;
  sourceConcepts: string[];
}
```

## Reward Calculation

```typescript
function calculateReward(
  result: ExperienceResult,
  objective: OptimizationObjective
): number {
  let reward = 0;

  // Base reward for success
  if (result.success) {
    reward += 1.0;
  }

  // Objective-specific reward
  const objectiveValue = result.outcome[objective.metric] as number;
  if (objectiveValue !== undefined) {
    const normalizedValue = normalizeMetric(objectiveValue, objective);
    reward += objective.direction === 'maximize'
      ? normalizedValue
      : 1 - normalizedValue;
  }

  // Efficiency bonus (faster is better)
  const durationPenalty = Math.min(0.2, result.duration / 60000 * 0.1);
  reward -= durationPenalty;

  // Resource efficiency
  if (result.resourceUsage) {
    const resourcePenalty = (result.resourceUsage.memoryMb / 1024) * 0.05;
    reward -= Math.min(0.1, resourcePenalty);
  }

  // Apply constraints as penalties
  for (const constraint of objective.constraints) {
    const value = result.outcome[constraint.metric] as number;
    if (!meetsConstraint(value, constraint)) {
      reward -= 0.5;
    }
  }

  return Math.max(-1, Math.min(1, reward));
}
```

## ADR References

- **ADR-006**: Unified Memory Service (pattern storage)
- **ADR-009**: Hybrid Memory Backend (HNSW indexing)
- **ADR-047**: MinCut topology for distributed learning
- **MM-001**: Consensus for strategy validation
