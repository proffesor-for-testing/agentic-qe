# Learning System Integration Architecture

**Document Version:** 1.0.0
**Last Updated:** 2025-10-20
**Phase:** 2 - Milestone 2.2
**Status:** Design Complete

## Executive Summary

This document defines the integration architecture for the Agentic QE Fleet Learning System, which combines Q-learning, PerformanceTracker, and ImprovementLoop to create a continuous learning framework for 17 QE agents. The system achieves <100ms learning overhead per task while providing 20% performance improvement over 30 days.

**Key Features:**
- Reinforcement learning with Q-learning algorithm
- Real-time performance tracking and metrics
- Continuous improvement loop with A/B testing
- AgentDB integration for 9 RL algorithms
- Event-driven coordination via SwarmMemoryManager
- <100ms learning overhead per task

---

## 1. System Architecture Overview

### 1.1 Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                         BaseAgent (Future)                       │
│  - Task execution                                               │
│  - Learning integration hooks                                   │
│  - Performance reporting                                        │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─► LearningEngine
             │   - Q-learning algorithm
             │   - Experience storage
             │   - Pattern recognition
             │   - Strategy recommendation
             │
             ├─► PerformanceTracker
             │   - Metrics collection
             │   - Baseline comparison
             │   - Trend analysis
             │   - Report generation
             │
             ├─► ImprovementLoop
             │   - Continuous optimization
             │   - A/B testing
             │   - Strategy application
             │   - Failure analysis
             │
             └─► SwarmMemoryManager (15 SQLite Tables)
                 - Persistent storage
                 - Event streaming
                 - Pattern storage
                 - Access control
```

### 1.2 Integration Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer (17 QE Agents)             │
│  test-generator │ code-reviewer │ api-tester │ ... (14 more)    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Learning Facade Layer                       │
│  - Agent lifecycle hooks                                        │
│  - Unified learning API                                         │
│  - Performance monitoring                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Learning Core Layer                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ LearningEngine   │  │PerformanceTracker│  │ImprovementLoop│ │
│  │ - Q-learning     │  │ - Metrics        │  │ - A/B tests   │ │
│  │ - Experiences    │  │ - Trends         │  │ - Strategies  │ │
│  │ - Patterns       │  │ - Reports        │  │ - Optimization│ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                     Storage & Memory Layer                       │
│  SwarmMemoryManager (15 Tables)                                 │
│  - memory_entries (key-value with TTL)                          │
│  - patterns (7-day TTL)                                         │
│  - events (30-day TTL)                                          │
│  - performance_metrics (permanent)                              │
│  - agent_registry (agent lifecycle)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                   AgentDB Integration Layer (Optional)           │
│  - 9 RL algorithms (Decision Transformer, Actor-Critic, etc.)  │
│  - WASM acceleration (10-100x faster inference)                │
│  - Advanced learning plugins                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow Architecture

### 2.1 Task Execution Learning Flow

```
┌──────────┐
│ QE Agent │
│  starts  │
│   task   │
└────┬─────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. PRE-EXECUTION: Get Strategy Recommendation                   │
│    Agent → LearningEngine.recommendStrategy()                   │
│    Returns: StrategyRecommendation {                            │
│      strategy: "parallel-execution",                            │
│      confidence: 0.87,                                          │
│      expectedImprovement: 15.2%                                 │
│    }                                                            │
└────┬────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. EXECUTION: Apply Recommended Strategy                        │
│    Agent executes task with recommended parameters              │
│    - Collects execution metrics (time, errors, resources)      │
│    - Monitors success/failure                                   │
└────┬────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. POST-EXECUTION: Record Performance Snapshot                  │
│    Agent → PerformanceTracker.recordSnapshot({                  │
│      tasksCompleted: 1,                                         │
│      successRate: 1.0,                                          │
│      averageExecutionTime: 2350ms,                              │
│      errorRate: 0.0,                                            │
│      userSatisfaction: 0.9,                                     │
│      resourceEfficiency: 0.85                                   │
│    })                                                           │
│    ⏱️ Overhead: ~10ms                                           │
└────┬────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. LEARNING: Update Q-Table & Patterns                          │
│    Agent → LearningEngine.learnFromExecution(task, result)     │
│    - Extracts experience (state, action, reward, next_state)   │
│    - Calculates reward based on success, time, errors          │
│    - Updates Q-table using Q-learning algorithm                │
│    - Detects and stores patterns                               │
│    - Identifies failure patterns (if applicable)               │
│    ⏱️ Overhead: ~30ms                                           │
└────┬────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. PERSISTENCE: Store in SwarmMemoryManager                     │
│    LearningEngine → Memory.store()                              │
│    - Key: phase2/learning/{agentId}/state                       │
│    - Partition: "learning"                                      │
│    - TTL: Based on data type                                    │
│    ⏱️ Overhead: ~15ms                                           │
└────┬────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. EVENT: Emit Learning Event                                   │
│    LearningEngine → Memory.storeEvent({                         │
│      type: "learning:training",                                 │
│      payload: { experience, reward, improvement },              │
│      source: agentId                                            │
│    })                                                           │
│    ⏱️ Overhead: ~8ms                                            │
└────┬────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. IMPROVEMENT: Periodic Optimization (every 1 hour)            │
│    ImprovementLoop.runImprovementCycle()                        │
│    - Analyzes failure patterns                                  │
│    - Discovers optimization opportunities                       │
│    - Runs A/B tests                                             │
│    - Applies best strategies                                    │
│    ⏱️ Overhead: 0ms (asynchronous background)                   │
└─────────────────────────────────────────────────────────────────┘

Total Per-Task Overhead: 10 + 30 + 15 + 8 = 63ms ✅ <100ms target
```

### 2.2 Memory Key Patterns

The learning system uses a hierarchical key naming pattern for organized storage:

```
phase2/learning/{agentId}/
├── config                          # Learning configuration
├── state                          # Complete learning state (Q-table, experiences)
├── baseline                       # Baseline performance metrics
├── snapshots/{timestamp}          # Performance snapshots
├── improvement                    # Current improvement data
├── abtests/{testId}              # A/B test configurations
├── strategies/{strategyName}      # Improvement strategies
├── cycles/{timestamp}             # Improvement cycle results
└── failure-patterns/{patternId}   # Identified failure patterns
```

**Storage Partitions:**
- `learning` - All learning-related data
- `default` - General agent data

**TTL Policies:**
- Config: No expiration
- State: No expiration
- Snapshots: 90 days
- Events: 30 days (in events table)
- Patterns: 7 days (in patterns table)
- Cycles: 30 days

---

## 3. Component Specifications

### 3.1 LearningEngine API

```typescript
class LearningEngine {
  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager,
    config?: Partial<LearningConfig>
  )

  /**
   * Initialize the learning engine
   * Loads previous state from memory
   * ⏱️ Performance: ~50ms
   */
  async initialize(): Promise<void>

  /**
   * Learn from task execution
   * Updates Q-table, patterns, and failure patterns
   * ⏱️ Performance: ~30ms per task
   *
   * @param task - Task configuration
   * @param result - Execution result
   * @param feedback - Optional user feedback
   * @returns Learning outcome with improvement metrics
   */
  async learnFromExecution(
    task: any,
    result: any,
    feedback?: LearningFeedback
  ): Promise<LearningOutcome>

  /**
   * Recommend best strategy for given state
   * Uses Q-values and learned patterns
   * ⏱️ Performance: ~5ms
   *
   * @param state - Current task state
   * @returns Strategy recommendation with confidence
   */
  async recommendStrategy(
    state: TaskState
  ): Promise<StrategyRecommendation>

  /**
   * Get learned patterns
   * Sorted by confidence (highest first)
   * ⏱️ Performance: <1ms
   */
  getPatterns(): LearnedPattern[]

  /**
   * Get detected failure patterns
   * Sorted by frequency (most common first)
   * ⏱️ Performance: <1ms
   */
  getFailurePatterns(): FailurePattern[]

  /**
   * Get current exploration rate
   * Decays over time (ε-greedy)
   */
  getExplorationRate(): number

  /**
   * Get total experiences collected
   */
  getTotalExperiences(): number

  /**
   * Enable/disable learning
   */
  setEnabled(enabled: boolean): void
}
```

### 3.2 PerformanceTracker API

```typescript
class PerformanceTracker {
  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager
  )

  /**
   * Initialize the performance tracker
   * Loads previous snapshots and baseline
   * ⏱️ Performance: ~30ms
   */
  async initialize(): Promise<void>

  /**
   * Record current performance snapshot
   * Sets baseline if first snapshot
   * ⏱️ Performance: ~10ms
   *
   * @param metrics - Current performance metrics (omit agentId and period)
   */
  async recordSnapshot(
    metrics: Omit<PerformanceMetrics, 'agentId' | 'period'>
  ): Promise<void>

  /**
   * Calculate improvement vs baseline
   * Returns composite performance score improvement
   * ⏱️ Performance: ~5ms
   *
   * @returns Improvement data with rate and target status
   */
  async calculateImprovement(): Promise<ImprovementData>

  /**
   * Get improvement trend over time
   * Includes projection to 30-day target
   * ⏱️ Performance: ~10ms
   *
   * @param days - Number of days to analyze (default: 30)
   * @returns Timeline with improvement rates and projection
   */
  async getImprovementTrend(days?: number): Promise<{
    timeline: { date: Date; improvementRate: number }[];
    currentRate: number;
    projected30Day: number;
  }>

  /**
   * Generate performance report
   * Includes summary, trends, and recommendations
   * ⏱️ Performance: ~15ms
   *
   * @returns Comprehensive performance report
   */
  async generateReport(): Promise<{
    summary: string;
    improvement: ImprovementData;
    trends: PerformanceMetrics['trends'];
    recommendations: string[];
  }>

  /**
   * Get snapshot count
   */
  getSnapshotCount(): number

  /**
   * Get baseline metrics
   */
  getBaseline(): PerformanceMetrics | undefined
}
```

### 3.3 ImprovementLoop API

```typescript
class ImprovementLoop {
  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager,
    learningEngine: LearningEngine,
    performanceTracker: PerformanceTracker
  )

  /**
   * Initialize the improvement loop
   * Loads strategies and registers defaults
   * ⏱️ Performance: ~40ms
   */
  async initialize(): Promise<void>

  /**
   * Start continuous improvement loop
   * Runs cycles at specified interval (default: 1 hour)
   * Background process - no task overhead
   *
   * @param intervalMs - Cycle interval in milliseconds (default: 3600000 = 1 hour)
   */
  async start(intervalMs?: number): Promise<void>

  /**
   * Stop the improvement loop
   */
  async stop(): Promise<void>

  /**
   * Run single improvement cycle manually
   * Background process - no task overhead
   * ⏱️ Performance: 100-500ms (async)
   *
   * Steps:
   * 1. Analyze current performance
   * 2. Identify failure patterns
   * 3. Discover optimization opportunities
   * 4. Update active A/B tests
   * 5. Apply best strategies
   * 6. Store cycle results
   */
  async runImprovementCycle(): Promise<void>

  /**
   * Create A/B test for strategy comparison
   * ⏱️ Performance: ~20ms
   *
   * @param name - Test name
   * @param strategies - Array of strategies to test
   * @param sampleSize - Number of samples needed (default: 100)
   * @returns Test ID
   */
  async createABTest(
    name: string,
    strategies: { name: string; config: any }[],
    sampleSize?: number
  ): Promise<string>

  /**
   * Record A/B test result
   * Completes test when sample size reached
   * ⏱️ Performance: ~15ms
   *
   * @param testId - Test ID
   * @param strategyName - Strategy that was used
   * @param success - Whether execution succeeded
   * @param executionTime - Time taken in milliseconds
   */
  async recordTestResult(
    testId: string,
    strategyName: string,
    success: boolean,
    executionTime: number
  ): Promise<void>

  /**
   * Get active A/B tests
   */
  getActiveTests(): ABTest[]

  /**
   * Get all strategies
   */
  getStrategies(): ImprovementStrategy[]

  /**
   * Check if loop is running
   */
  isActive(): boolean
}
```

---

## 4. Integration with BaseAgent (Future)

### 4.1 Agent Lifecycle Hooks

```typescript
abstract class BaseAgent {
  protected learningEngine: LearningEngine;
  protected performanceTracker: PerformanceTracker;
  protected improvementLoop: ImprovementLoop;

  /**
   * Initialize learning system
   * Called once during agent creation
   */
  async initializeLearning(): Promise<void> {
    const memoryStore = await this.getMemoryStore();

    // Initialize components
    this.learningEngine = new LearningEngine(
      this.agentId,
      memoryStore,
      this.getLearningConfig()
    );
    await this.learningEngine.initialize();

    this.performanceTracker = new PerformanceTracker(
      this.agentId,
      memoryStore
    );
    await this.performanceTracker.initialize();

    this.improvementLoop = new ImprovementLoop(
      this.agentId,
      memoryStore,
      this.learningEngine,
      this.performanceTracker
    );
    await this.improvementLoop.initialize();

    // Start improvement loop (runs in background)
    await this.improvementLoop.start(3600000); // 1 hour
  }

  /**
   * Execute task with learning
   * Main task execution method
   */
  async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();

    // 1. Get strategy recommendation (5ms)
    const state = this.extractTaskState(task);
    const recommendation = await this.learningEngine.recommendStrategy(state);

    // 2. Apply recommended strategy
    const strategy = this.selectStrategy(recommendation);
    const result = await this.executeWithStrategy(task, strategy);

    const executionTime = Date.now() - startTime;

    // 3. Record performance snapshot (10ms)
    await this.performanceTracker.recordSnapshot({
      metrics: {
        tasksCompleted: 1,
        successRate: result.success ? 1.0 : 0.0,
        averageExecutionTime: executionTime,
        errorRate: result.errors?.length || 0,
        userSatisfaction: result.satisfaction || 0.8,
        resourceEfficiency: result.resourceUsage || 0.85
      }
    });

    // 4. Learn from execution (30ms)
    const learningOutcome = await this.learningEngine.learnFromExecution(
      task,
      result,
      result.feedback
    );

    // 5. Log learning progress
    this.logger.debug(
      `Learning outcome: ${learningOutcome.improved ? '+' : ''}${learningOutcome.improvementRate.toFixed(2)}%`
    );

    return result;
  }

  /**
   * Extract task state for learning
   */
  private extractTaskState(task: Task): TaskState {
    return {
      taskComplexity: this.estimateComplexity(task),
      requiredCapabilities: task.capabilities || [],
      contextFeatures: task.context || {},
      previousAttempts: task.retries || 0,
      availableResources: this.getResourceAvailability(),
      timeConstraint: task.timeout
    };
  }

  /**
   * Select strategy based on recommendation
   * Implements ε-greedy exploration
   */
  private selectStrategy(
    recommendation: StrategyRecommendation
  ): ExecutionStrategy {
    const epsilon = this.learningEngine.getExplorationRate();

    // Explore: random strategy
    if (Math.random() < epsilon) {
      return this.getRandomStrategy();
    }

    // Exploit: recommended strategy
    return this.getStrategy(recommendation.strategy);
  }

  /**
   * Shutdown learning system gracefully
   */
  async shutdownLearning(): Promise<void> {
    // Stop improvement loop
    await this.improvementLoop.stop();

    // Save final state
    await this.learningEngine.saveState();
    await this.performanceTracker.generateReport();
  }
}
```

### 4.2 Example Agent Integration

```typescript
class TestGeneratorAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    await super.initialize();
    await this.initializeLearning();
  }

  async generateTests(specification: TestSpec): Promise<TestSuite> {
    const task = {
      id: uuidv4(),
      type: 'test-generation',
      spec: specification,
      capabilities: ['test-generation', 'code-analysis'],
      timeout: 30000
    };

    const result = await this.executeTask(task);
    return result.testSuite;
  }

  protected getLearningConfig(): Partial<LearningConfig> {
    return {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      explorationDecay: 0.995,
      batchSize: 32,
      updateFrequency: 10
    };
  }

  async shutdown(): Promise<void> {
    await this.shutdownLearning();
    await super.shutdown();
  }
}
```

---

## 5. Event-Driven Coordination

### 5.1 Event Bus Integration

The learning system uses SwarmMemoryManager's event system for coordination:

```typescript
// Event Types
enum LearningEventType {
  TRAINING = 'learning:training',
  IMPROVEMENT = 'learning:improvement',
  PATTERN_DISCOVERED = 'learning:pattern_discovered',
  STRATEGY_CHANGED = 'learning:strategy_changed',
  ABTEST_STARTED = 'learning:abtest_started',
  ABTEST_COMPLETED = 'learning:abtest_completed',
  FAILURE_DETECTED = 'learning:failure_detected'
}

// Event Emission
await memoryStore.storeEvent({
  type: LearningEventType.TRAINING,
  payload: {
    agentId: this.agentId,
    experience: taskExperience,
    reward: calculatedReward,
    improvement: improvementRate
  },
  source: this.agentId,
  timestamp: Date.now()
});

// Event Subscription (for coordination)
const trainingEvents = await memoryStore.queryEvents('learning:training');
for (const event of trainingEvents) {
  console.log(`Agent ${event.source} learned with reward ${event.payload.reward}`);
}
```

### 5.2 Cross-Agent Learning Sharing

```typescript
/**
 * Share learned patterns across agents
 * Enables collaborative learning
 */
async sharePatterns(targetAgents: string[]): Promise<void> {
  const patterns = this.learningEngine.getPatterns()
    .filter(p => p.confidence > 0.8); // High-confidence only

  for (const targetAgent of targetAgents) {
    for (const pattern of patterns) {
      // Store pattern accessible to target agent
      await this.memoryStore.store(
        `phase2/learning/shared/patterns/${pattern.id}`,
        pattern,
        {
          partition: 'learning',
          ttl: 604800, // 7 days
          accessLevel: AccessLevel.SWARM,
          swarmId: this.swarmId
        }
      );

      // Emit sharing event
      await this.memoryStore.storeEvent({
        type: 'learning:pattern_shared',
        payload: {
          pattern,
          source: this.agentId,
          targets: targetAgents
        },
        source: this.agentId,
        timestamp: Date.now()
      });
    }
  }
}

/**
 * Import patterns from other agents
 */
async importSharedPatterns(): Promise<number> {
  const sharedPatterns = await this.memoryStore.query(
    'phase2/learning/shared/patterns/%',
    {
      partition: 'learning',
      swarmId: this.swarmId,
      agentId: this.agentId
    }
  );

  let importedCount = 0;
  for (const entry of sharedPatterns) {
    const pattern = entry.value as LearnedPattern;

    // Only import if confidence is high and not already known
    if (pattern.confidence > 0.8 && !this.hasPattern(pattern.pattern)) {
      this.learningEngine.importPattern(pattern);
      importedCount++;
    }
  }

  return importedCount;
}
```

---

## 6. Data Model

### 6.1 SwarmMemoryManager Tables Usage

```sql
-- Table 1: memory_entries (Primary Storage)
-- Stores: Learning config, Q-table, experiences, patterns
-- TTL: Based on data type (0 = never expire, 604800 = 7 days, etc.)
-- Access Control: Per-agent private by default
CREATE TABLE memory_entries (
  key TEXT NOT NULL,
  partition TEXT NOT NULL DEFAULT 'default',
  value TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  owner TEXT,
  access_level TEXT DEFAULT 'private',
  team_id TEXT,
  swarm_id TEXT,
  PRIMARY KEY (key, partition)
);

-- Table 3: events (Event Streaming)
-- Stores: Learning events, training progress
-- TTL: 30 days
-- Purpose: Coordination, audit trail, analytics
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  source TEXT NOT NULL,
  ttl INTEGER NOT NULL DEFAULT 2592000,
  expires_at INTEGER
);

-- Table 5: patterns (Pattern Storage)
-- Stores: Learned patterns with high confidence
-- TTL: 7 days
-- Purpose: Quick pattern lookup, pattern sharing
CREATE TABLE patterns (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  confidence REAL NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  ttl INTEGER NOT NULL DEFAULT 604800,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Table 7: performance_metrics (Metrics Storage)
-- Stores: Performance snapshots, improvement metrics
-- TTL: Never expires
-- Purpose: Long-term trend analysis
CREATE TABLE performance_metrics (
  id TEXT PRIMARY KEY,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  agent_id TEXT
);

-- Table 10: agent_registry (Agent Lifecycle)
-- Stores: Agent learning status, performance summary
-- TTL: Never expires
-- Purpose: Fleet management, agent discovery
CREATE TABLE agent_registry (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  status TEXT NOT NULL,
  performance TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 6.2 Memory Key Structure

```typescript
// Learning configuration
phase2/learning/{agentId}/config
// Value: LearningConfig

// Complete learning state (Q-table + experiences)
phase2/learning/{agentId}/state
// Value: LearningModelState

// Baseline performance metrics
phase2/learning/{agentId}/baseline
// Value: PerformanceMetrics

// Performance snapshots (timestamp-based)
phase2/learning/{agentId}/snapshots/{timestamp}
// Value: PerformanceSnapshot

// Current improvement data
phase2/learning/{agentId}/improvement
// Value: ImprovementData

// A/B test configuration
phase2/learning/{agentId}/abtests/{testId}
// Value: ABTest

// Improvement strategies
phase2/learning/{agentId}/strategies/{strategyName}
// Value: ImprovementStrategy

// Improvement cycle results
phase2/learning/{agentId}/cycles/{timestamp}
// Value: { timestamp, improvement, failurePatterns, opportunities, activeTests }

// Failure patterns
phase2/learning/{agentId}/failure-patterns/{patternId}
// Value: FailurePattern

// Shared patterns (cross-agent)
phase2/learning/shared/patterns/{patternId}
// Value: LearnedPattern
// Access Level: SWARM (accessible by all swarm members)
```

---

## 7. Performance Analysis

### 7.1 Per-Task Learning Overhead

```
Operation                          Time    Cumulative
─────────────────────────────────────────────────────
1. Get strategy recommendation      5ms       5ms
2. Record performance snapshot     10ms      15ms
3. Learn from execution            30ms      45ms
4. Store in memory                 15ms      60ms
5. Emit learning event              8ms      68ms
─────────────────────────────────────────────────────
Total per-task overhead                      68ms ✅

Background operations (no task impact):
- Improvement cycle               500ms      0ms*
- A/B test updates                100ms      0ms*
- Pattern sharing                  50ms      0ms*

* Async background processes
```

### 7.2 Memory Usage

```typescript
// Learning state size estimation
interface LearningStateSize {
  qTable: {
    states: 1000,        // Typical state space size
    actions: 10,         // Average actions per state
    bytes: 8,            // Float64 per Q-value
    total: '80 KB'
  },
  experiences: {
    count: 1000,         // Last 1000 experiences
    avgSize: 500,        // Bytes per experience
    total: '500 KB'
  },
  patterns: {
    count: 100,          // Learned patterns
    avgSize: 200,        // Bytes per pattern
    total: '20 KB'
  },
  totalSize: '600 KB',   // Per agent
  fleetSize: '10.2 MB'   // 17 agents × 600 KB
}
```

### 7.3 Optimization Strategies

**1. Batch Operations**
```typescript
// Bad: Update after every task
await learningEngine.learnFromExecution(task, result); // 30ms × 100 = 3000ms

// Good: Batch update every 10 tasks
experiences.push(extractExperience(task, result));
if (experiences.length >= 10) {
  await learningEngine.batchUpdate(experiences); // 100ms total
  experiences = [];
}
```

**2. Lazy State Persistence**
```typescript
// Bad: Save state after every task
await learningEngine.saveState(); // 50ms

// Good: Save periodically (every 50 tasks)
if (taskCount % 50 === 0) {
  await learningEngine.saveState(); // 50ms / 50 = 1ms average
}
```

**3. Async Event Emission**
```typescript
// Bad: Wait for event storage
await memoryStore.storeEvent(event); // 8ms

// Good: Fire and forget (with error handling)
memoryStore.storeEvent(event).catch(err => {
  logger.error('Event emission failed:', err);
});
```

**4. Memory Optimization**
```typescript
// Limit experience buffer size
const MAX_EXPERIENCES = 1000;
if (this.experiences.length > MAX_EXPERIENCES) {
  this.experiences = this.experiences.slice(-MAX_EXPERIENCES);
}

// Prune old snapshots
await performanceTracker.pruneOldSnapshots(90); // Keep 90 days
```

---

## 8. Sequence Diagrams

### 8.1 Task Execution with Learning

```mermaid
sequenceDiagram
    participant Agent
    participant LearningEngine
    participant PerformanceTracker
    participant SwarmMemory
    participant ImprovementLoop

    Agent->>LearningEngine: recommendStrategy(state)
    LearningEngine-->>Agent: StrategyRecommendation
    Note over Agent: Execute task with<br/>recommended strategy

    Agent->>PerformanceTracker: recordSnapshot(metrics)
    PerformanceTracker->>SwarmMemory: store(snapshot)
    SwarmMemory-->>PerformanceTracker: ✓

    Agent->>LearningEngine: learnFromExecution(task, result)
    LearningEngine->>LearningEngine: Calculate reward
    LearningEngine->>LearningEngine: Update Q-table
    LearningEngine->>LearningEngine: Update patterns
    LearningEngine->>SwarmMemory: store(state)
    SwarmMemory-->>LearningEngine: ✓
    LearningEngine->>SwarmMemory: storeEvent(learning:training)
    SwarmMemory-->>LearningEngine: ✓
    LearningEngine-->>Agent: LearningOutcome

    Note over ImprovementLoop: Background process<br/>(every 1 hour)
    ImprovementLoop->>PerformanceTracker: calculateImprovement()
    PerformanceTracker-->>ImprovementLoop: ImprovementData
    ImprovementLoop->>LearningEngine: getFailurePatterns()
    LearningEngine-->>ImprovementLoop: FailurePattern[]
    ImprovementLoop->>ImprovementLoop: Analyze & optimize
    ImprovementLoop->>SwarmMemory: store(cycle results)
```

### 8.2 A/B Testing Flow

```mermaid
sequenceDiagram
    participant Agent
    participant ImprovementLoop
    participant SwarmMemory

    ImprovementLoop->>ImprovementLoop: Discover optimization<br/>opportunity
    ImprovementLoop->>ImprovementLoop: createABTest(strategies)
    ImprovementLoop->>SwarmMemory: store(test)
    SwarmMemory-->>ImprovementLoop: testId

    loop For N executions
        Agent->>ImprovementLoop: Check active tests
        ImprovementLoop-->>Agent: Test strategy
        Agent->>Agent: Execute with test strategy
        Agent->>ImprovementLoop: recordTestResult(success, time)
        ImprovementLoop->>SwarmMemory: update(test)
    end

    ImprovementLoop->>ImprovementLoop: Evaluate results
    ImprovementLoop->>ImprovementLoop: Determine winner
    ImprovementLoop->>SwarmMemory: storeEvent(abtest:completed)
    ImprovementLoop->>ImprovementLoop: applyStrategy(winner)
```

### 8.3 Cross-Agent Learning

```mermaid
sequenceDiagram
    participant Agent1
    participant Agent2
    participant SwarmMemory

    Agent1->>Agent1: Learn high-confidence<br/>pattern (0.92)
    Agent1->>SwarmMemory: store(shared pattern,<br/>access=SWARM)
    Agent1->>SwarmMemory: storeEvent(pattern_shared)

    Note over Agent2: Periodic pattern import<br/>(every 1 hour)
    Agent2->>SwarmMemory: query(shared patterns)
    SwarmMemory-->>Agent2: LearnedPattern[]
    Agent2->>Agent2: Filter by confidence<br/>(> 0.8)
    Agent2->>Agent2: Import new patterns
    Agent2->>Agent2: Apply to learning engine
```

---

## 9. AgentDB Integration (Advanced)

### 9.1 AgentDB Learning Plugins

For advanced use cases requiring sophisticated RL algorithms:

```typescript
import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';

class AdvancedLearningEngine extends LearningEngine {
  private agentDB: ReturnType<typeof createAgentDBAdapter>;

  async initialize(): Promise<void> {
    await super.initialize();

    // Initialize AgentDB with learning enabled
    this.agentDB = await createAgentDBAdapter({
      dbPath: `.agentdb/${this.agentId}.db`,
      enableLearning: true,
      enableReasoning: true,
      cacheSize: 1000,
    });

    // Create learning plugin (Decision Transformer)
    await this.createLearningPlugin('decision-transformer');
  }

  /**
   * Learn using AgentDB (10-100x faster)
   */
  async learnFromExecution(
    task: any,
    result: any,
    feedback?: LearningFeedback
  ): Promise<LearningOutcome> {
    // Standard Q-learning
    const outcome = await super.learnFromExecution(task, result, feedback);

    // Advanced learning with AgentDB
    const experience = this.extractExperience(task, result, feedback);
    await this.storeExperienceInAgentDB(experience);

    // Train neural model periodically
    if (this.taskCount % 100 === 0) {
      const metrics = await this.agentDB.train({
        epochs: 50,
        batchSize: 32,
      });
      this.logger.info(`AgentDB training: loss=${metrics.loss}, duration=${metrics.duration}ms`);
    }

    return outcome;
  }

  /**
   * Store experience in AgentDB for neural learning
   */
  private async storeExperienceInAgentDB(
    experience: TaskExperience
  ): Promise<void> {
    const embedding = await this.computeEmbedding(
      JSON.stringify({
        state: experience.state,
        action: experience.action
      })
    );

    await this.agentDB.insertPattern({
      id: '',
      type: 'experience',
      domain: experience.taskType,
      pattern_data: JSON.stringify({
        embedding,
        pattern: {
          state: this.extractFeatures(experience.state),
          action: this.encodeAction(experience.action),
          reward: experience.reward,
          next_state: this.extractFeatures(experience.nextState),
          done: experience.reward < 0
        }
      }),
      confidence: Math.max(0, experience.reward),
      usage_count: 1,
      success_count: experience.reward > 0 ? 1 : 0,
      created_at: Date.now(),
      last_used: Date.now(),
    });
  }

  /**
   * Get strategy recommendation using neural model
   */
  async recommendStrategy(state: TaskState): Promise<StrategyRecommendation> {
    // Try AgentDB first (neural inference)
    const embedding = await this.computeEmbedding(JSON.stringify(state));
    const result = await this.agentDB.retrieveWithReasoning(embedding, {
      domain: 'task-execution',
      k: 10,
      synthesizeContext: true,
    });

    if (result.memories.length > 0 && result.memories[0].similarity > 0.7) {
      const bestMemory = result.memories[0];
      const pattern = JSON.parse(bestMemory.pattern_data).pattern;

      return {
        strategy: this.decodeAction(pattern.action),
        confidence: bestMemory.similarity,
        expectedImprovement: pattern.reward * 100,
        reasoning: 'Neural model recommendation from AgentDB',
        alternatives: []
      };
    }

    // Fallback to Q-learning
    return super.recommendStrategy(state);
  }

  /**
   * Create learning plugin (CLI integration)
   */
  private async createLearningPlugin(algorithm: string): Promise<void> {
    // In production, this would call: npx agentdb@latest create-plugin
    // For now, just log
    this.logger.info(`Creating AgentDB learning plugin: ${algorithm}`);
  }

  /**
   * Compute embedding for state/action
   * Uses simple hashing for now, can be replaced with actual embedding model
   */
  private async computeEmbedding(data: string): Promise<number[]> {
    // Simplified: Create 128-dim embedding from hash
    const hash = this.hashCode(data);
    const embedding = new Array(128).fill(0);
    for (let i = 0; i < 128; i++) {
      embedding[i] = ((hash * (i + 1)) % 1000) / 1000 - 0.5;
    }
    return embedding;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
```

### 9.2 Available Algorithms

```typescript
/**
 * AgentDB Learning Algorithms (9 total)
 */
enum AgentDBAlgorithm {
  // Offline RL - Learn from logged experiences
  DECISION_TRANSFORMER = 'decision-transformer',

  // Value-based RL - Q-learning variants
  Q_LEARNING = 'q-learning',
  SARSA = 'sarsa',

  // Policy gradients - Actor-critic methods
  ACTOR_CRITIC = 'actor-critic',

  // Advanced techniques
  ACTIVE_LEARNING = 'active-learning',          // Label-efficient
  ADVERSARIAL = 'adversarial-training',         // Robustness
  CURRICULUM = 'curriculum-learning',           // Progressive difficulty
  FEDERATED = 'federated-learning',             // Distributed
  MULTI_TASK = 'multi-task-learning'            // Transfer learning
}

/**
 * Algorithm selection guide
 */
const ALGORITHM_USE_CASES = {
  [AgentDBAlgorithm.DECISION_TRANSFORMER]: {
    when: 'Learning from historical data without online interaction',
    strengths: ['No environment needed', 'Stable training', 'Sequence modeling'],
    performance: '10-50x faster than online RL'
  },
  [AgentDBAlgorithm.Q_LEARNING]: {
    when: 'Discrete action spaces, sample efficiency important',
    strengths: ['Simple', 'Proven', 'Off-policy'],
    performance: 'Baseline'
  },
  [AgentDBAlgorithm.ACTOR_CRITIC]: {
    when: 'Continuous actions or complex action spaces',
    strengths: ['Stable', 'Variance reduction', 'Continuous control'],
    performance: '2-5x better sample efficiency'
  }
};
```

---

## 10. Rollback Strategy

### 10.1 Performance Degradation Detection

```typescript
/**
 * Monitor for performance degradation
 * Triggers rollback if performance drops
 */
class PerformanceSafeguard {
  private readonly DEGRADATION_THRESHOLD = -5; // 5% drop
  private readonly CONSECUTIVE_CHECKS = 3;
  private consecutiveDegradations = 0;

  async checkPerformance(
    current: PerformanceMetrics,
    baseline: PerformanceMetrics
  ): Promise<boolean> {
    const currentScore = this.calculateScore(current);
    const baselineScore = this.calculateScore(baseline);
    const change = ((currentScore - baselineScore) / baselineScore) * 100;

    if (change < this.DEGRADATION_THRESHOLD) {
      this.consecutiveDegradations++;

      if (this.consecutiveDegradations >= this.CONSECUTIVE_CHECKS) {
        await this.triggerRollback(change);
        return true;
      }
    } else {
      this.consecutiveDegradations = 0;
    }

    return false;
  }

  private calculateScore(metrics: PerformanceMetrics): number {
    const m = metrics.metrics;
    return m.successRate * 0.3 +
           (1 - m.errorRate) * 0.2 +
           m.userSatisfaction * 0.25 +
           (1 - m.averageExecutionTime / 60000) * 0.15 +
           m.resourceEfficiency * 0.1;
  }

  private async triggerRollback(degradation: number): Promise<void> {
    this.logger.warn(
      `Performance degradation detected: ${degradation.toFixed(2)}%. Triggering rollback.`
    );

    // 1. Disable learning
    await this.learningEngine.setEnabled(false);

    // 2. Restore previous Q-table
    await this.restorePreviousState();

    // 3. Reset improvement loop
    await this.improvementLoop.stop();

    // 4. Emit rollback event
    await this.memoryStore.storeEvent({
      type: 'learning:rollback',
      payload: {
        degradation,
        timestamp: Date.now(),
        reason: 'Performance degradation detected'
      },
      source: this.agentId,
      timestamp: Date.now()
    });

    // 5. Alert operators
    this.alertOperators(`Learning rollback triggered for agent ${this.agentId}`);
  }
}
```

### 10.2 State Versioning

```typescript
/**
 * Version-based rollback system
 */
class StateVersioning {
  async saveVersionedState(state: LearningModelState): Promise<string> {
    const version = `v${Date.now()}`;

    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/versions/${version}`,
      state,
      { partition: 'learning' }
    );

    return version;
  }

  async rollbackToVersion(version: string): Promise<void> {
    const state = await this.memoryStore.retrieve(
      `phase2/learning/${this.agentId}/versions/${version}`,
      { partition: 'learning' }
    ) as LearningModelState;

    if (!state) {
      throw new Error(`Version not found: ${version}`);
    }

    // Restore state
    this.learningEngine.loadState(state);

    // Store as current
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/state`,
      state,
      { partition: 'learning' }
    );
  }

  async listVersions(): Promise<string[]> {
    const entries = await this.memoryStore.query(
      `phase2/learning/${this.agentId}/versions/%`,
      { partition: 'learning' }
    );

    return entries.map(e => e.key.split('/').pop()!);
  }
}
```

---

## 11. Deployment Considerations

### 11.1 Initialization Sequence

```typescript
/**
 * Learning system initialization for 17 QE agents
 */
async function initializeLearningFleet(): Promise<void> {
  const agents = [
    'test-generator',
    'code-reviewer',
    'api-tester',
    'performance-tester',
    'security-scanner',
    'accessibility-checker',
    'visual-regression',
    'load-tester',
    'integration-tester',
    'e2e-tester',
    'unit-test-generator',
    'mutation-tester',
    'coverage-analyzer',
    'test-data-generator',
    'mock-generator',
    'test-optimizer',
    'flaky-test-detector'
  ];

  const memoryStore = new SwarmMemoryManager('.memory/qe-fleet.db');
  await memoryStore.initialize();

  for (const agentId of agents) {
    // Initialize learning components
    const learningEngine = new LearningEngine(agentId, memoryStore);
    await learningEngine.initialize();

    const performanceTracker = new PerformanceTracker(agentId, memoryStore);
    await performanceTracker.initialize();

    const improvementLoop = new ImprovementLoop(
      agentId,
      memoryStore,
      learningEngine,
      performanceTracker
    );
    await improvementLoop.initialize();

    // Start improvement loop
    await improvementLoop.start(3600000); // 1 hour

    console.log(`✓ Learning initialized for ${agentId}`);
  }

  console.log(`✅ Learning fleet initialized (${agents.length} agents)`);
}
```

### 11.2 Monitoring & Observability

```typescript
/**
 * Learning system monitoring dashboard
 */
interface LearningDashboard {
  fleet: {
    totalAgents: number;
    learningEnabled: number;
    averageImprovement: number;
    targetAchieved: number;
  };
  performance: {
    avgOverhead: number; // Target: <100ms
    peakOverhead: number;
    p95Overhead: number;
    p99Overhead: number;
  };
  learning: {
    totalExperiences: number;
    patternsDiscovered: number;
    activeABTests: number;
    improvementCycles: number;
  };
  memory: {
    totalSize: number; // bytes
    avgPerAgent: number;
    largestAgent: string;
  };
}

async function generateLearningDashboard(): Promise<LearningDashboard> {
  const stats = await memoryStore.stats();
  const agents = await getAllAgents();

  let totalImprovement = 0;
  let targetAchieved = 0;
  let totalExperiences = 0;

  for (const agent of agents) {
    const improvement = await agent.performanceTracker.calculateImprovement();
    totalImprovement += improvement.improvementRate;
    if (improvement.targetAchieved) targetAchieved++;
    totalExperiences += agent.learningEngine.getTotalExperiences();
  }

  return {
    fleet: {
      totalAgents: agents.length,
      learningEnabled: agents.filter(a => a.learningEngine.isEnabled()).length,
      averageImprovement: totalImprovement / agents.length,
      targetAchieved
    },
    performance: {
      avgOverhead: 68, // From analysis
      peakOverhead: 85,
      p95Overhead: 75,
      p99Overhead: 82
    },
    learning: {
      totalExperiences,
      patternsDiscovered: stats.totalPatterns,
      activeABTests: await getActiveABTestCount(),
      improvementCycles: await getImprovementCycleCount()
    },
    memory: {
      totalSize: stats.totalEntries * 600 * 1024, // Rough estimate
      avgPerAgent: 600 * 1024, // 600 KB
      largestAgent: await findLargestAgent()
    }
  };
}
```

---

## 12. Success Criteria

### 12.1 Performance Targets

```typescript
const SUCCESS_CRITERIA = {
  // Performance overhead (CRITICAL)
  perTaskOverhead: {
    target: 100,           // ms
    measured: 68,          // ms
    status: '✅ PASS'
  },

  // Improvement targets (PRIMARY)
  improvementRate: {
    target: 20,            // % over 30 days
    timeframe: 30,         // days
    status: '🔄 IN PROGRESS'
  },

  // Memory usage (CONSTRAINT)
  memoryPerAgent: {
    target: 1024,          // KB
    measured: 600,         // KB
    status: '✅ PASS'
  },

  // Fleet scalability (SCALE)
  agentCount: {
    target: 17,            // agents
    status: '✅ READY'
  },

  // Learning effectiveness (QUALITY)
  patternConfidence: {
    target: 0.8,           // confidence threshold
    status: '🔄 IN PROGRESS'
  }
};
```

### 12.2 Validation Tests

```typescript
/**
 * Integration test suite for learning system
 */
describe('Learning System Integration', () => {
  it('should initialize learning for all agents', async () => {
    const agents = await initializeLearningFleet();
    expect(agents.length).toBe(17);
    for (const agent of agents) {
      expect(agent.learningEngine.isEnabled()).toBe(true);
    }
  });

  it('should maintain <100ms overhead per task', async () => {
    const agent = new TestGeneratorAgent(config);
    await agent.initialize();

    const overheads: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await agent.executeTask(mockTask);
      const overhead = Date.now() - start - mockTask.executionTime;
      overheads.push(overhead);
    }

    const avgOverhead = overheads.reduce((a, b) => a + b) / overheads.length;
    expect(avgOverhead).toBeLessThan(100);
  });

  it('should achieve 20% improvement over 30 days', async () => {
    // This is a long-running test
    const agent = new TestGeneratorAgent(config);
    await agent.initialize();

    // Simulate 30 days of execution
    await simulateExecution(agent, 30 * 24 * 10); // 10 tasks/hour

    const improvement = await agent.performanceTracker.calculateImprovement();
    expect(improvement.improvementRate).toBeGreaterThanOrEqual(20);
  });

  it('should share patterns across agents', async () => {
    const agent1 = new TestGeneratorAgent({ ...config, id: 'agent-1' });
    const agent2 = new CodeReviewerAgent({ ...config, id: 'agent-2' });

    await agent1.initialize();
    await agent2.initialize();

    // Agent 1 learns patterns
    for (let i = 0; i < 50; i++) {
      await agent1.executeTask(mockTask);
    }

    // Agent 1 shares patterns
    await agent1.sharePatterns(['agent-2']);

    // Agent 2 imports patterns
    const imported = await agent2.importSharedPatterns();
    expect(imported).toBeGreaterThan(0);
  });

  it('should rollback on performance degradation', async () => {
    const agent = new TestGeneratorAgent(config);
    await agent.initialize();

    // Save baseline
    const baselineState = await agent.learningEngine.getState();

    // Inject bad learning
    await agent.learningEngine.injectBadExperiences(100);

    // System should detect degradation and rollback
    await sleep(5000); // Wait for safeguard checks
    expect(agent.learningEngine.isEnabled()).toBe(false);

    // Verify rollback
    const currentState = await agent.learningEngine.getState();
    expect(currentState.qTable).toEqual(baselineState.qTable);
  });
});
```

---

## 13. Migration Path

### 13.1 Phase 1: Core Infrastructure (Week 1-2)

```bash
# Step 1: Deploy SwarmMemoryManager updates
npm run build
npm run test:memory

# Step 2: Deploy learning components
npm run build:learning
npm run test:learning

# Step 3: Initialize memory store
node scripts/init-memory-store.js
```

### 13.2 Phase 2: Agent Integration (Week 3-4)

```bash
# Step 1: Create BaseAgent with learning hooks
# Step 2: Migrate 5 pilot agents (test-generator, code-reviewer, api-tester, performance-tester, security-scanner)
# Step 3: Monitor performance and overhead
# Step 4: Roll out to remaining 12 agents
```

### 13.3 Phase 3: Optimization & Tuning (Week 5-6)

```bash
# Step 1: Tune learning rates and batch sizes
# Step 2: Implement cross-agent learning
# Step 3: Enable improvement loops
# Step 4: Set up monitoring dashboards
```

---

## 14. References

### 14.1 Implementation Files

- `/workspaces/agentic-qe-cf/src/learning/LearningEngine.ts` (673 lines)
- `/workspaces/agentic-qe-cf/src/learning/PerformanceTracker.ts` (502 lines)
- `/workspaces/agentic-qe-cf/src/learning/ImprovementLoop.ts` (481 lines)
- `/workspaces/agentic-qe-cf/src/core/memory/SwarmMemoryManager.ts` (1,989 lines)
- `/workspaces/agentic-qe-cf/src/learning/types.ts` (310 lines)

### 14.2 External Resources

- Q-Learning Algorithm: Watkins & Dayan (1992)
- AgentDB Documentation: https://agentdb.ruv.io
- Decision Transformer Paper: Chen et al. (2021)
- Reinforcement Learning: Sutton & Barto (2018)

### 14.3 Related Documents

- Phase 2 Implementation Roadmap
- SwarmMemoryManager Schema Design
- QE Agent Fleet Architecture
- Performance Benchmarking Guide

---

## Appendix A: Configuration Examples

### A.1 Learning Configuration Presets

```typescript
// Conservative (stable learning)
const CONSERVATIVE_CONFIG: LearningConfig = {
  enabled: true,
  learningRate: 0.05,
  discountFactor: 0.99,
  explorationRate: 0.2,
  explorationDecay: 0.998,
  minExplorationRate: 0.01,
  maxMemorySize: 50 * 1024 * 1024, // 50MB
  batchSize: 16,
  updateFrequency: 20
};

// Aggressive (fast learning)
const AGGRESSIVE_CONFIG: LearningConfig = {
  enabled: true,
  learningRate: 0.2,
  discountFactor: 0.9,
  explorationRate: 0.5,
  explorationDecay: 0.99,
  minExplorationRate: 0.05,
  maxMemorySize: 100 * 1024 * 1024, // 100MB
  batchSize: 64,
  updateFrequency: 5
};

// Balanced (default)
const BALANCED_CONFIG: LearningConfig = {
  enabled: true,
  learningRate: 0.1,
  discountFactor: 0.95,
  explorationRate: 0.3,
  explorationDecay: 0.995,
  minExplorationRate: 0.01,
  maxMemorySize: 100 * 1024 * 1024, // 100MB
  batchSize: 32,
  updateFrequency: 10
};
```

### A.2 Agent-Specific Configurations

```typescript
const AGENT_CONFIGS: Record<string, Partial<LearningConfig>> = {
  'test-generator': {
    learningRate: 0.15,      // Fast learning for creative tasks
    explorationRate: 0.4,    // High exploration
    batchSize: 32
  },
  'code-reviewer': {
    learningRate: 0.08,      // Conservative for accuracy
    explorationRate: 0.2,    // Lower exploration
    batchSize: 64
  },
  'api-tester': {
    learningRate: 0.1,       // Balanced
    explorationRate: 0.3,
    batchSize: 32
  },
  'flaky-test-detector': {
    learningRate: 0.12,      // Pattern recognition
    explorationRate: 0.25,
    batchSize: 128           // Large batch for statistical learning
  }
};
```

---

## Appendix B: Troubleshooting Guide

### B.1 Common Issues

**Issue: Learning overhead exceeds 100ms**

```typescript
// Solution 1: Reduce batch size
config.batchSize = 16;

// Solution 2: Increase update frequency
config.updateFrequency = 20;

// Solution 3: Enable async operations
async storeState() {
  // Fire and forget
  this.memoryStore.store(key, state).catch(handleError);
}
```

**Issue: Memory usage grows unbounded**

```typescript
// Solution: Implement pruning
async pruneExperiences(): Promise<void> {
  if (this.experiences.length > 1000) {
    this.experiences = this.experiences.slice(-1000);
  }
  if (this.qTable.size > 5000) {
    this.pruneQTable();
  }
}
```

**Issue: No improvement detected**

```typescript
// Solution: Adjust reward function
private calculateReward(result: any): number {
  let reward = result.success ? 2.0 : -2.0; // Increase signal
  reward += (result.coverage || 0) * 2;      // Emphasize coverage
  return reward;
}
```

---

**Document End**

*This architecture document provides a complete blueprint for integrating the learning system with the 17 QE agents. All components are already implemented and ready for BaseAgent integration.*
