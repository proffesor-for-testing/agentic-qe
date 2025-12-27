# Dream Engine & Nightly Learner Architecture

## Overview

The Nightly Learner is a sleep-inspired learning system that processes agent experiences during idle periods to improve future performance. It consists of multiple interconnected components that work together to capture, synthesize, and transfer knowledge between QE agents.

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXPERIENCE CAPTURE                                 │
│                                                                             │
│   QE Agents (BaseAgent)                                                      │
│        │                                                                     │
│        ▼                                                                     │
│   ExperienceCapture.capture()                                               │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────┐                   │
│   │  captured_experiences table (memory.db)             │                   │
│   │  - agent_id, agent_type, task_type                  │                   │
│   │  - execution (success, duration, strategy)          │                   │
│   │  - context (patterns_used, decisions_made, errors)  │                   │
│   │  - outcome (quality_score, confidence)              │                   │
│   └─────────────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NIGHTLY LEARNER                                    │
│                                                                             │
│   SleepScheduler (triggers on idle/schedule/manual)                         │
│        │                                                                     │
│        ▼                                                                     │
│   SleepCycle (4 phases):                                                    │
│        │                                                                     │
│   ┌────┴────────────────────────────────────────────────────────────────┐   │
│   │  N1_CAPTURE (5 min)                                                 │   │
│   │  └─ PatternSynthesis.synthesize()                                   │   │
│   │     └─ Reads from: captured_experiences                             │   │
│   │     └─ Clusters experiences by agent_type + success/failure         │   │
│   │     └─ Writes to: synthesized_patterns table                        │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  N2_PROCESS (10 min)                                                │   │
│   │  └─ ConceptGraph.addConcept()                                       │   │
│   │     └─ Reads from: synthesized_patterns                             │   │
│   │     └─ Creates nodes (pattern, technique, domain, outcome, error)   │   │
│   │     └─ Auto-discovers edges based on similarity                     │   │
│   │     └─ Writes to: concept_nodes, concept_edges tables               │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  N3_CONSOLIDATE (15 min)                                            │   │
│   │  └─ TransferProtocol.broadcast()                                    │   │
│   │     └─ Reads: high-confidence patterns (confidence >= 0.8)          │   │
│   │     └─ Determines compatible agents via transferability rules       │   │
│   │     └─ Writes to: transfer_events, agent Q-tables                   │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  REM_DREAM (20 min)                                                 │   │
│   │  └─ DreamEngine.dream()                                             │   │
│   │     └─ SpreadingActivation: random concept activation               │   │
│   │     └─ Detects co-activations (novelty > 0.5)                       │   │
│   │     └─ InsightGenerator: converts associations to insights          │   │
│   │     └─ Writes to: dream_insights table                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT IMPROVEMENT                                  │
│                                                                             │
│   When agents execute tasks:                                                │
│        │                                                                     │
│   ┌────┴────────────────────────────────────────────────────────────────┐   │
│   │  1. LearningEngine.selectAction()                                   │   │
│   │     └─ Reads: Q-values from q_values table                          │   │
│   │     └─ Uses ε-greedy exploration (explorationRate decays over time) │   │
│   │                                                                     │   │
│   │  2. AgentDB.retrieve() (if enabled)                                 │   │
│   │     └─ Vector similarity search on patterns table                   │   │
│   │     └─ Returns: relevantPatterns, similarTasks                      │   │
│   │                                                                     │   │
│   │  3. QEReasoningBank.selectPattern() (if enabled)                    │   │
│   │     └─ Matches task context to stored patterns                      │   │
│   │     └─ Returns: recommended strategy                                │   │
│   │                                                                     │   │
│   │  4. Execute task with learned strategy                              │   │
│   │                                                                     │   │
│   │  5. LearningEngine.learnFromExecution()                             │   │
│   │     └─ Calculates reward from result                                │   │
│   │     └─ Updates Q-values (Bellman equation)                          │   │
│   │     └─ Stores experience for future learning                        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Tables (memory.db)

### 1. captured_experiences
**Source**: `ExperienceCapture.capture()` called from `BaseAgent.executeTask()`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Unique experience ID |
| agent_id | TEXT | Agent that captured this |
| agent_type | TEXT | Type of agent (test-generator, coverage-analyzer, etc.) |
| task_type | TEXT | Type of task executed |
| execution | TEXT (JSON) | `{success, duration, strategy, steps_taken}` |
| context | TEXT (JSON) | `{patterns_used, decisions_made, errors_encountered}` |
| outcome | TEXT (JSON) | `{quality_score, confidence, improvements}` |
| embedding | BLOB | Vector embedding for similarity search |
| created_at | INTEGER | Unix timestamp |
| processed | INTEGER | 0 = unprocessed, 1 = processed by synthesis |

### 2. synthesized_patterns
**Source**: `PatternSynthesis.synthesize()` during N1_CAPTURE phase

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Pattern ID |
| type | TEXT | `success_strategy`, `failure_avoidance`, `efficiency_optimization` |
| description | TEXT | Human-readable description |
| conditions | TEXT (JSON) | When to apply this pattern |
| actions | TEXT (JSON) | What to do |
| confidence | REAL | 0-1, derived from cluster consistency |
| supporting_experiences | TEXT (JSON) | Experience IDs that support this |
| effectiveness | REAL | 0-1, measured improvement |
| agent_types | TEXT (JSON) | Which agents can use this |
| task_types | TEXT (JSON) | Which tasks this applies to |

### 3. concept_nodes
**Source**: `ConceptGraph.addConcept()` during N2_PROCESS phase

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Concept ID |
| type | TEXT | `pattern`, `technique`, `domain`, `outcome`, `error` |
| content | TEXT | Concept description |
| embedding | BLOB | Vector for similarity matching |
| activation_level | REAL | 0-1, current activation |
| last_activated | INTEGER | When last activated |
| metadata | TEXT (JSON) | Additional attributes |

### 4. concept_edges
**Source**: `ConceptGraph.addEdge()` when similarity exceeds threshold

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Edge ID |
| source | TEXT | Source concept ID |
| target | TEXT | Target concept ID |
| weight | REAL | 0-1, strength of association |
| type | TEXT | `similarity`, `causation`, `co_occurrence`, `sequence` |
| evidence | INTEGER | Number of observations |

### 5. dream_insights
**Source**: `InsightGenerator.generateInsights()` during REM_DREAM phase

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Insight ID |
| type | TEXT | `new_pattern`, `optimization`, `warning`, `connection`, `transfer` |
| title | TEXT | Short title |
| description | TEXT | Full description |
| associated_concepts | TEXT (JSON) | Concept IDs involved |
| novelty_score | REAL | 0-1, how unexpected |
| confidence_score | REAL | 0-1, how reliable |
| actionable | INTEGER | 1 if can be acted upon |
| suggested_action | TEXT | What to do |
| target_agent_types | TEXT (JSON) | Which agents should apply |
| priority | TEXT | `high`, `medium`, `low` |
| status | TEXT | `pending`, `applied`, `dismissed`, `validated` |

### 6. q_values (Q-Learning)
**Source**: `LearningEngine.learnFromExecution()` via `SwarmMemoryManager.upsertQValue()`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Unique ID |
| agent_id | TEXT | Agent that learned this |
| state | TEXT | State representation |
| action | TEXT | Action taken |
| value | REAL | Q-value |
| visits | INTEGER | Number of updates |

---

## How `aqe dream run` Works

### Step-by-Step Execution

```typescript
// 1. CLI invokes DreamCommand.runDreamCycle()
await DreamCommand.execute('run', options);

// 2. DreamEngine initialization
const engine = new DreamEngine({
  dbPath: '.agentic-qe/memory.db',
  cycleDuration: 5000,    // Duration of dream
  targetInsights: 5       // Max insights to generate
});
await engine.initialize();

// 3. Load patterns as concepts
// DreamEngine.loadPatternsAsConcepts() reads from:
//   - synthesized_patterns table
//   - patterns table (legacy)
//   - captured_experiences table (recent, unprocessed)
// Converts them to ConceptGraph nodes

// 4. Run spreading activation dream
const result = await engine.dream();
// SpreadingActivation.dream() loop:
//   - Randomly select concept
//   - Apply noise activation (0.1 + random * 0.1)
//   - Spread activation through edges
//   - Detect co-activations (>= 2 nodes with activation > 0.5)
//   - Record associations with novelty scores

// 5. Generate insights from associations
const insights = await insightGenerator.generateInsights(associations);
// For each novel association:
//   - Determine insight type (new_pattern, optimization, warning, etc.)
//   - Calculate confidence score
//   - Generate title, description, suggested action
//   - Store in dream_insights table

// 6. Return results
return {
  cycleId: 'dream-xxx',
  duration: 5085,
  conceptsProcessed: 84,
  associationsFound: 0,
  insightsGenerated: 0,
  insights: []
};
```

### Why No Insights Generated?

When `aqe dream run` returns 0 insights, it's because:

1. **Few edges in concept graph**: Spreading activation needs edges to propagate
2. **Low novelty associations**: Only associations with `novelty > 0.5` become insights
3. **Not enough diverse concepts**: Same agent type + same outcome = low novelty

To generate more insights:
```bash
# 1. Run more agent executions to capture diverse experiences
node scripts/run-agents.js

# 2. Run pattern synthesis to create connected concepts
aqe learn train --agent test-gen --task '{"type":"test-generation"}'

# 3. Run longer dream cycles
aqe dream run --duration 60000 --verbose
```

---

## How QE Agents Improve Over Time

### 1. Q-Learning Improvement Mechanism

```
┌───────────────────────────────────────────────────────────────────┐
│                    Q-LEARNING CYCLE                               │
│                                                                   │
│   State Extraction:                                               │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ StateExtractor.extractState(task) →                      │    │
│   │ {                                                        │    │
│   │   taskType: 'test-generation',                           │    │
│   │   complexity: 'high',                                    │    │
│   │   fileCount: 3,                                          │    │
│   │   hasPatterns: true                                      │    │
│   │ }                                                        │    │
│   └──────────────────────────────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│   Action Selection (ε-greedy):                                    │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ if (random < explorationRate) {                          │    │
│   │   action = randomAction();  // Explore                   │    │
│   │ } else {                                                 │    │
│   │   action = argmax(Q[state]);  // Exploit                 │    │
│   │ }                                                        │    │
│   │                                                          │    │
│   │ explorationRate *= 0.995;  // Decay over time            │    │
│   │ // Starts at 0.3, decays to 0.01 minimum                 │    │
│   └──────────────────────────────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│   Execute Task with Selected Strategy                             │
│                          │                                        │
│                          ▼                                        │
│   Reward Calculation:                                             │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ RewardCalculator.calculateReward(result) →               │    │
│   │ reward = 0                                               │    │
│   │ if (success) reward += 1.0                               │    │
│   │ reward += qualityScore * 0.5  // 0-0.5                   │    │
│   │ if (fast) reward += 0.2       // time bonus              │    │
│   │ if (failure) reward -= 0.5    // penalty                 │    │
│   └──────────────────────────────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│   Q-Value Update (Bellman):                                       │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ Q[s,a] += α * (reward + γ * max(Q[s']) - Q[s,a])         │    │
│   │                                                          │    │
│   │ α = 0.1  (learning rate)                                 │    │
│   │ γ = 0.95 (discount factor)                               │    │
│   │                                                          │    │
│   │ → Stored in q_values table via SwarmMemoryManager        │    │
│   └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│   Over time:                                                      │
│   - Q-values converge to optimal strategy                         │
│   - Exploration rate decreases → more exploitation                │
│   - Agent learns which actions work best for each state           │
└───────────────────────────────────────────────────────────────────┘
```

### 2. Pattern-Based Improvement

```typescript
// Before executing a task, agent retrieves relevant patterns:
const patterns = await agentDB.retrieve({
  query: taskDescription,
  taskType: task.type,
  topK: 5
});

// Patterns contain:
// - Previous successful strategies
// - Failure patterns to avoid
// - Efficiency optimizations

// Agent enriches task context with patterns:
const enrichedContext = {
  ...originalContext,
  relevantPatterns: patterns,
  similarTasks: patterns.map(p => p.taskType)
};

// After execution, agent stores new pattern:
await agentDB.store({
  id: `${agentId}-task-${taskId}`,
  content: taskDescription,
  metadata: {
    agentType: 'test-generator',
    taskType: 'generate-tests',
    success: result.success,
    strategy: result.strategy,
    executionTime: duration
  },
  confidence: result.success ? 0.9 : 0.3
});
```

### 3. Cross-Agent Transfer

```
┌───────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE TRANSFER                             │
│                                                                   │
│   Source Agent (test-generator):                                  │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ Pattern: "Mock external APIs for faster tests"           │    │
│   │ Confidence: 0.95                                         │    │
│   │ Effectiveness: 0.88                                      │    │
│   └──────────────────────────────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│   TransferProtocol.broadcast():                                   │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ 1. Check transferability rules:                          │    │
│   │    - Source confidence >= 0.8 ✓                          │    │
│   │    - Target agents are compatible                        │    │
│   │                                                          │    │
│   │ 2. Calculate transfer coefficient:                       │    │
│   │    transfer = confidence * (1 - distance)                │    │
│   │                                                          │    │
│   │ 3. Adjust for target agent:                              │    │
│   │    targetConfidence = transfer * 0.7  // Discount        │    │
│   └──────────────────────────────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│   Target Agent (integration-tester):                              │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ Receives pattern with adjusted confidence (0.67)         │    │
│   │ Can now use "Mock external APIs" strategy                │    │
│   │ Agent didn't have to learn this from scratch!            │    │
│   └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

---

## Improvement Metrics

### Measuring Agent Improvement

```typescript
// PerformanceTracker collects metrics:
interface PerformanceMetrics {
  successRate: number;         // % of successful tasks
  avgExecutionTime: number;    // Time per task
  avgQualityScore: number;     // Quality of results
  improvementRate: number;     // Change over time
  patternsApplied: number;     // Learning utilization
}

// ImprovementLoop calculates improvement:
const baseline = await tracker.getBaseline(30); // Last 30 days
const recent = await tracker.getRecent(7);      // Last 7 days

const improvement = {
  successRateDelta: recent.successRate - baseline.successRate,
  executionTimeDelta: (baseline.avgTime - recent.avgTime) / baseline.avgTime,
  qualityDelta: recent.avgQuality - baseline.avgQuality
};

// Target: 20% improvement over 30 days
const meetingTarget = improvement.successRateDelta >= 0.20;
```

### Example Improvement Timeline

```
Day 0:  Agent starts with random strategy (explorationRate = 0.3)
        Success rate: 50%, Q-values: all 0

Day 7:  30 experiences captured, patterns synthesized
        Success rate: 60%, Q-values starting to converge
        explorationRate: 0.27

Day 14: 100 experiences, dream insights generated
        Success rate: 72%, learned patterns being applied
        explorationRate: 0.24

Day 30: 500 experiences, cross-agent transfer active
        Success rate: 85%, Q-values stable
        explorationRate: 0.15

Day 60: 1000+ experiences
        Success rate: 90%+, near-optimal strategies
        explorationRate: 0.05 (mostly exploitation)
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `aqe learn status` | Show learning stats, patterns, top agents |
| `aqe learn status --agent test-gen` | Show specific agent's learning |
| `aqe learn train --agent X --task '{...}'` | Manual single-task training |
| `aqe learn enable --all` | Enable learning for all agents |
| `aqe learn disable --agent X` | Disable learning for specific agent |
| `aqe dream run` | Run a dream cycle (5 seconds) |
| `aqe dream run --duration 60000` | Run longer dream cycle |
| `aqe dream run --verbose` | Show detailed logging |
| `aqe dream insights` | View generated insights |
| `aqe dream insights --actionable` | Show only actionable insights |
| `aqe dream status` | Show dream engine state |

---

## Activation Modes

### 1. Idle Mode (Automatic)
```typescript
const scheduler = new SleepScheduler({
  mode: 'idle',
  learningBudget: { maxPatternsPerCycle: 50 }
});
await scheduler.start();

// IdleDetector monitors:
// - CPU usage < 20%
// - Memory usage < 70%
// - No active tasks
// - Idle for 60+ seconds
```

### 2. Time Mode (Scheduled)
```typescript
const scheduler = new SleepScheduler({
  mode: 'time',
  scheduleHour: 2  // 2 AM
});
await scheduler.start();
```

### 3. Hybrid Mode (Either)
```typescript
const scheduler = new SleepScheduler({
  mode: 'hybrid',  // Triggers on idle OR at scheduled time
  scheduleHour: 2
});
await scheduler.start();
```

### 4. Manual Trigger
```typescript
await scheduler.triggerCycle('manual');
```

---

## File Locations

| Component | File |
|-----------|------|
| ExperienceCapture | `src/learning/capture/ExperienceCapture.ts` |
| PatternSynthesis | `src/learning/synthesis/PatternSynthesis.ts` |
| DreamEngine | `src/learning/dream/DreamEngine.ts` |
| ConceptGraph | `src/learning/dream/ConceptGraph.ts` |
| SpreadingActivation | `src/learning/dream/SpreadingActivation.ts` |
| InsightGenerator | `src/learning/dream/InsightGenerator.ts` |
| SleepScheduler | `src/learning/scheduler/SleepScheduler.ts` |
| SleepCycle | `src/learning/scheduler/SleepCycle.ts` |
| IdleDetector | `src/learning/scheduler/IdleDetector.ts` |
| LearningEngine | `src/learning/LearningEngine.ts` |
| TransferProtocol | `src/learning/transfer/TransferProtocol.ts` |
| BaseAgent | `src/agents/BaseAgent.ts` |
| CLI Commands | `src/cli/commands/learn/index.ts`, `src/cli/commands/dream/index.ts` |

---

## Summary

The Nightly Learner system enables QE agents to:

1. **Capture experiences** from every task execution
2. **Synthesize patterns** from clusters of similar experiences
3. **Discover insights** through sleep-inspired spreading activation
4. **Transfer knowledge** between compatible agents
5. **Improve over time** through Q-learning and pattern matching

All data is stored in a single unified database (`.agentic-qe/memory.db`) ensuring consistency across CLI, MCP, and agent operations.
