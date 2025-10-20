# Learning System Architecture - Visual Diagrams

**Document Version:** 1.0.0
**Last Updated:** 2025-10-20
**Companion to:** learning-system-integration.md

---

## 1. System Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    17 QE Agent Fleet (Application Layer)                 │
│                                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │test-        │  │code-        │  │api-         │  │performance- │    │
│  │generator    │  │reviewer     │  │tester       │  │tester       │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │             │
│         └────────────────┴────────────────┴────────────────┘ ... +13    │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                              │ executeTask()
                              │ ⏱️ 68ms learning overhead
                              │
┌─────────────────────────────▼───────────────────────────────────────────┐
│                         BaseAgent (Future)                               │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Learning Integration Hooks                                      │    │
│  │                                                                  │    │
│  │  1. Get strategy recommendation        (5ms)                    │    │
│  │  2. Execute task with strategy                                  │    │
│  │  3. Record performance snapshot       (10ms)                    │    │
│  │  4. Learn from execution              (30ms)                    │    │
│  │  5. Store state                       (15ms)                    │    │
│  │  6. Emit event                        (8ms)                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                            │
│         ┌────────────────────┼────────────────────┐                      │
│         │                    │                    │                      │
│         ▼                    ▼                    ▼                      │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────┐             │
│  │  Learning   │  │  Performance   │  │  Improvement     │             │
│  │  Engine     │  │  Tracker       │  │  Loop            │             │
│  │             │  │                │  │                  │             │
│  │  Q-learning │  │  Metrics       │  │  A/B testing    │             │
│  │  Patterns   │  │  Baselines     │  │  Strategies     │             │
│  │  Rewards    │  │  Trends        │  │  Optimization   │             │
│  └─────────────┘  └────────────────┘  └──────────────────┘             │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                │ store() / retrieve() / storeEvent()
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│              SwarmMemoryManager (Storage & Coordination)              │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  15 SQLite Tables with Intelligent TTL                       │    │
│  │                                                               │    │
│  │  1. memory_entries      (key-value with ACL)                │    │
│  │  2. memory_acl          (5-level access control)            │    │
│  │  3. events              (30-day TTL event stream)           │    │
│  │  4. patterns            (7-day TTL learned patterns)        │    │
│  │  5. performance_metrics (permanent storage)                  │    │
│  │  6. agent_registry      (lifecycle management)               │    │
│  │  7. workflow_state      (checkpointing)                      │    │
│  │  8. consensus_state     (7-day TTL)                          │    │
│  │  9. artifacts           (permanent)                          │    │
│  │  10. sessions           (resumability)                       │    │
│  │  11-13. GOAP            (planning)                           │    │
│  │  14. OODA cycles        (decision loop)                      │    │
│  │  15. hints              (blackboard pattern)                 │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  📊 Total Size: 10.2 MB (17 agents × 600 KB)                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Task Execution Flow with Timing

```
Agent starts task
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. GET STRATEGY RECOMMENDATION          │
│                                          │  ⏱️ 5ms
│ LearningEngine.recommendStrategy(state) │
│ • Query Q-table                         │
│ • Check learned patterns                │
│ • Apply ε-greedy exploration            │
│ Returns: StrategyRecommendation         │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. EXECUTE TASK                         │
│                                          │  ⏱️ Variable (e.g., 2000ms)
│ Apply recommended strategy              │
│ • Parallel execution                    │
│ • Resource allocation                   │
│ • Retry policy                          │
│ Collect: time, errors, coverage         │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 3. RECORD PERFORMANCE SNAPSHOT          │
│                                          │  ⏱️ 10ms
│ PerformanceTracker.recordSnapshot()     │
│ • Store metrics                         │
│ • Update baseline (if first)            │
│ • Prune old snapshots (>90 days)        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 4. LEARN FROM EXECUTION                 │
│                                          │  ⏱️ 30ms
│ LearningEngine.learnFromExecution()     │
│ • Extract state-action-reward           │
│ • Calculate reward                      │
│ • Update Q-table (Q-learning)           │
│ • Detect patterns                       │
│ • Identify failure patterns             │
│ • Decay exploration rate                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 5. PERSIST STATE                        │
│                                          │  ⏱️ 15ms
│ SwarmMemory.store()                     │
│ • Save Q-table                          │
│ • Save experiences (last 1000)          │
│ • Save patterns                         │
│ • Update agent registry                 │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 6. EMIT LEARNING EVENT                  │
│                                          │  ⏱️ 8ms
│ SwarmMemory.storeEvent()                │
│ • Type: learning:training               │
│ • Payload: experience + reward          │
│ • TTL: 30 days                          │
│ • Enable: cross-agent monitoring        │
└────────────────┬────────────────────────┘
                 │
                 ▼
        Task completes
     Return: TaskResult

┌─────────────────────────────────────────┐
│ TOTAL OVERHEAD: 5+10+30+15+8 = 68ms    │  ✅ <100ms target
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 7. BACKGROUND: IMPROVEMENT CYCLE        │
│                                          │  ⏱️ 0ms task impact
│ ImprovementLoop.runImprovementCycle()   │  (runs hourly in background)
│ • Analyze performance                   │
│ • Identify failure patterns             │
│ • Discover optimizations                │
│ • Update A/B tests                      │
│ • Apply best strategies                 │
└─────────────────────────────────────────┘
```

---

## 3. Memory Storage Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   Memory Key Hierarchy                          │
└────────────────────────────────────────────────────────────────┘

phase2/learning/
├── {agentId}/                          (Per-agent isolation)
│   ├── config                          TTL: Never
│   │   └── LearningConfig
│   │
│   ├── state                           TTL: Never
│   │   └── LearningModelState
│   │       ├── qTable (serialized)
│   │       ├── experiences (last 1000)
│   │       ├── patterns
│   │       └── config
│   │
│   ├── baseline                        TTL: Never
│   │   └── PerformanceMetrics
│   │
│   ├── snapshots/                      TTL: 90 days
│   │   ├── 1729425600000
│   │   ├── 1729429200000
│   │   └── ...
│   │
│   ├── improvement                     TTL: Never
│   │   └── ImprovementData
│   │
│   ├── abtests/                        TTL: 30 days
│   │   ├── {testId-1}
│   │   ├── {testId-2}
│   │   └── ...
│   │
│   ├── strategies/                     TTL: Never
│   │   ├── parallel-execution
│   │   ├── adaptive-retry
│   │   └── resource-optimization
│   │
│   ├── cycles/                         TTL: 30 days
│   │   ├── 1729425600000
│   │   ├── 1729429200000
│   │   └── ...
│   │
│   └── failure-patterns/               TTL: 7 days
│       ├── {patternId-1}
│       ├── {patternId-2}
│       └── ...
│
└── shared/                             (Cross-agent learning)
    └── patterns/                       TTL: 7 days
        ├── {patternId-1}               Access: SWARM
        ├── {patternId-2}               Access: SWARM
        └── ...

┌────────────────────────────────────────────────────────────────┐
│                    SQLite Table Mapping                         │
└────────────────────────────────────────────────────────────────┘

memory_entries table:
├── phase2/learning/{agentId}/config → LearningConfig
├── phase2/learning/{agentId}/state → LearningModelState
├── phase2/learning/{agentId}/baseline → PerformanceMetrics
├── phase2/learning/{agentId}/snapshots/% → PerformanceSnapshot[]
├── phase2/learning/{agentId}/improvement → ImprovementData
├── phase2/learning/{agentId}/abtests/% → ABTest[]
├── phase2/learning/{agentId}/strategies/% → ImprovementStrategy[]
├── phase2/learning/{agentId}/cycles/% → CycleResult[]
├── phase2/learning/{agentId}/failure-patterns/% → FailurePattern[]
└── phase2/learning/shared/patterns/% → LearnedPattern[]

events table:
├── learning:training → TaskExperience + reward
├── learning:improvement → ImprovementData
├── learning:pattern_discovered → LearnedPattern
├── learning:strategy_changed → StrategyChange
├── learning:abtest_started → ABTest
├── learning:abtest_completed → ABTestResult
└── learning:failure_detected → FailurePattern

patterns table:
└── High-confidence patterns (confidence > 0.8)

performance_metrics table:
├── success_rate → PerformanceMetric[]
├── execution_time → PerformanceMetric[]
├── error_rate → PerformanceMetric[]
├── user_satisfaction → PerformanceMetric[]
└── resource_efficiency → PerformanceMetric[]

agent_registry table:
└── Agent learning status and performance summary
```

---

## 4. Q-Learning Algorithm Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Q-Learning Update Process                     │
└─────────────────────────────────────────────────────────────────┘

Step 1: Extract Experience
─────────────────────────────
Task Execution:
  state = {
    taskComplexity: 0.6,
    requiredCapabilities: ['test-generation'],
    previousAttempts: 0,
    availableResources: 0.8
  }
  action = {
    strategy: 'parallel-execution',
    parallelization: 0.8,
    retryPolicy: 'exponential'
  }
  result = {
    success: true,
    executionTime: 2350ms,
    errors: []
  }

         ↓

Step 2: Calculate Reward
─────────────────────────
reward = 0
  + (success ? 1.0 : -1.0)              = +1.0  (success)
  + (1 - executionTime/30000) * 0.5     = +0.46 (fast execution)
  - errors.length * 0.1                  = +0.0  (no errors)
  + (coverage - 0.8) * 2                 = +0.2  (90% coverage)
                                           ─────
total_reward                              = 1.66

         ↓

Step 3: Encode State & Action
──────────────────────────────
state_key = "0.6,0.1,0.0,0.8,1.0"
  (complexity, capabilities, attempts, resources, time)

action_key = "parallel-execution:0.8:exponential"
  (strategy:parallelization:retry)

         ↓

Step 4: Get Current Q-Value
────────────────────────────
Q(state, action) = qTable.get(state_key).get(action_key)
                 = 0.85  (previous value)

         ↓

Step 5: Get Max Q-Value for Next State
───────────────────────────────────────
next_state_key = "0.6,0.1,0.1,0.72,1.0"
max_Q(next_state) = max(qTable.get(next_state_key).values())
                  = 0.92

         ↓

Step 6: Q-Learning Update
──────────────────────────
Q(s,a) = Q(s,a) + α * [r + γ * max_Q(s',a') - Q(s,a)]

Where:
  α (learning rate) = 0.1
  γ (discount factor) = 0.95
  r (reward) = 1.66
  max_Q(s',a') = 0.92
  Q(s,a) = 0.85

Calculation:
  Q(s,a) = 0.85 + 0.1 * [1.66 + 0.95 * 0.92 - 0.85]
         = 0.85 + 0.1 * [1.66 + 0.874 - 0.85]
         = 0.85 + 0.1 * 1.684
         = 0.85 + 0.1684
         = 1.0184

new Q(s,a) = 1.0184

         ↓

Step 7: Update Q-Table
───────────────────────
qTable.set(state_key, action_key, 1.0184)

         ↓

Step 8: Update Patterns
───────────────────────
pattern_key = "test-generation:parallel-execution"

If pattern exists:
  pattern.usageCount++
  pattern.successRate = (old * count + new) / (count + 1)
  pattern.confidence = min(0.95, confidence + 0.01)

If pattern new:
  pattern = {
    id: uuid(),
    pattern: pattern_key,
    confidence: 0.5,
    successRate: 1.0,
    usageCount: 1
  }

         ↓

Step 9: Decay Exploration
──────────────────────────
explorationRate *= explorationDecay
explorationRate = max(minExplorationRate, explorationRate)

Initial: 0.3
After 100 tasks: 0.3 * (0.995^100) = 0.181
After 1000 tasks: 0.3 * (0.995^1000) = 0.020
```

---

## 5. Cross-Agent Learning Flow

```
┌────────────────────────────────────────────────────────────────┐
│          Cross-Agent Pattern Sharing Architecture               │
└────────────────────────────────────────────────────────────────┘

Agent 1: Test Generator                Agent 2: Code Reviewer
┌────────────────────┐                ┌────────────────────┐
│                    │                │                    │
│ Execute 50 tasks   │                │ Waiting for        │
│ ↓                  │                │ patterns...        │
│ Learn patterns     │                │                    │
│ ↓                  │                │                    │
│ High confidence    │                │                    │
│ patterns detected: │                │                    │
│ • Pattern A: 0.92  │                │                    │
│ • Pattern B: 0.88  │                │                    │
│ • Pattern C: 0.85  │                │                    │
└────────┬───────────┘                └───────────┬────────┘
         │                                        │
         │ 1. Share patterns                      │
         │    (confidence > 0.8)                  │
         ▼                                        │
┌─────────────────────────────────────────────────┐
│     SwarmMemoryManager (Shared Storage)         │
│                                                 │
│ phase2/learning/shared/patterns/                │
│ ├── pattern-a-uuid                             │
│ │   ├── pattern: "test-generation:parallel"   │
│ │   ├── confidence: 0.92                       │
│ │   ├── successRate: 0.95                      │
│ │   ├── access: SWARM                          │
│ │   └── owner: agent-1                         │
│ │                                               │
│ ├── pattern-b-uuid                             │
│ └── pattern-c-uuid                             │
│                                                 │
│ Events:                                         │
│ └── learning:pattern_shared                    │
│     ├── pattern: Pattern A                     │
│     ├── source: agent-1                        │
│     └── targets: [agent-2, agent-3, ...]       │
└────────────────────┬────────────────────────────┘
                     │
                     │ 2. Query shared patterns
                     │    (every 1 hour)
                     ▼
┌────────────────────────────────────────────────┐
│ Agent 2: Import Patterns                       │
│                                                │
│ 1. Query: phase2/learning/shared/patterns/%   │
│ 2. Filter: confidence > 0.8                    │
│ 3. Filter: not already known                   │
│ 4. Import: 2 new patterns                      │
│ 5. Apply: Use in recommendations               │
│                                                │
│ Result:                                        │
│ • Faster learning (bootstrap from others)      │
│ • Better recommendations (more patterns)       │
│ • Collaborative intelligence                   │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│              Fleet Learning Metrics             │
│                                                │
│ Total Patterns Shared:        247              │
│ Avg Patterns per Agent:       14.5             │
│ Cross-Agent Imports:          189              │
│ Learning Speedup:             2.3x             │
│ Fleet Improvement Rate:       12.4%            │
└────────────────────────────────────────────────┘
```

---

## 6. Performance Tracking & Improvement

```
┌────────────────────────────────────────────────────────────────┐
│              30-Day Improvement Tracking                        │
└────────────────────────────────────────────────────────────────┘

Day 0: Baseline Established
───────────────────────────
Performance Score: 0.65
├── Success Rate: 0.75
├── Execution Time: 3500ms (normalized: 0.58)
├── Error Rate: 0.15 (normalized: 0.85)
├── User Satisfaction: 0.70
└── Resource Efficiency: 0.50

Composite Score = 0.75*0.3 + 0.58*0.2 + 0.85*0.15 + 0.70*0.25 + 0.50*0.1
                = 0.225 + 0.116 + 0.1275 + 0.175 + 0.05
                = 0.6935

         ↓

Day 7: First Improvement
────────────────────────
Performance Score: 0.71 (+9.2%)
├── Success Rate: 0.82 ↑
├── Execution Time: 3100ms ↑
├── Error Rate: 0.12 ↑
├── User Satisfaction: 0.75 ↑
└── Resource Efficiency: 0.55 ↑

Patterns Learned: 47
Q-Table Size: 1,234 state-action pairs
Exploration Rate: 0.26 (from 0.30)

         ↓

Day 14: Steady Progress
───────────────────────
Performance Score: 0.75 (+8.2%)
├── Success Rate: 0.86 ↑
├── Execution Time: 2800ms ↑
├── Error Rate: 0.09 ↑
├── User Satisfaction: 0.78 ↑
└── Resource Efficiency: 0.62 ↑

Patterns Learned: 89
Q-Table Size: 2,456 state-action pairs
Exploration Rate: 0.23

         ↓

Day 21: Acceleration
────────────────────
Performance Score: 0.79 (+14.0%)
├── Success Rate: 0.91 ↑
├── Execution Time: 2500ms ↑
├── Error Rate: 0.06 ↑
├── User Satisfaction: 0.82 ↑
└── Resource Efficiency: 0.70 ↑

Patterns Learned: 134
Q-Table Size: 3,789 state-action pairs
Exploration Rate: 0.20

         ↓

Day 30: Target Achievement
──────────────────────────
Performance Score: 0.85 (+22.6%) ✅
├── Success Rate: 0.94 ↑
├── Execution Time: 2300ms ↑
├── Error Rate: 0.04 ↑
├── User Satisfaction: 0.86 ↑
└── Resource Efficiency: 0.75 ↑

Patterns Learned: 187
Q-Table Size: 4,932 state-action pairs
Exploration Rate: 0.18

Improvement: +22.6% (Target: 20%) ✅

┌────────────────────────────────────────────────────────────────┐
│                   Improvement Attribution                       │
└────────────────────────────────────────────────────────────────┘

Strategy Improvements:
├── Parallel Execution      +12.3% improvement
├── Adaptive Retry          +6.8% improvement
├── Resource Optimization   +4.2% improvement
└── Caching                 +2.1% improvement

A/B Tests Completed: 8
├── Test 1: Parallel vs Sequential → Parallel wins (15% faster)
├── Test 2: Retry policies → Exponential wins (8% fewer errors)
└── Test 3: Resource allocation → Adaptive wins (12% efficiency)

Failure Patterns Fixed: 23
├── Timeout issues → Increased threshold (5 instances prevented)
├── Memory pressure → Resource pooling (8 instances prevented)
└── Validation errors → Input sanitization (10 instances prevented)
```

---

## 7. A/B Testing Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    A/B Test Lifecycle                           │
└────────────────────────────────────────────────────────────────┘

Phase 1: Opportunity Detection
───────────────────────────────
ImprovementLoop identifies underutilized high-confidence pattern

Pattern: "api-testing:parallel-execution"
├── Confidence: 0.87
├── Success Rate: 0.92
└── Usage Count: 8 (low usage)

Hypothesis: "Parallel execution will improve API testing by 15%"

         ↓

Phase 2: Test Creation
──────────────────────
ImprovementLoop.createABTest({
  name: "API Testing: Parallel vs Sequential",
  strategies: [
    {
      name: "parallel-execution",
      config: { parallelization: 0.8 }
    },
    {
      name: "sequential-execution",
      config: { parallelization: 0.0 }
    }
  ],
  sampleSize: 100
})

Test ID: "abtest-1729425600000"
Status: RUNNING
Start Time: 2024-10-20 10:00:00

         ↓

Phase 3: Execution (Round-Robin)
────────────────────────────────
Task 1  → Strategy A (parallel)     → Success, 1850ms
Task 2  → Strategy B (sequential)   → Success, 2950ms
Task 3  → Strategy A (parallel)     → Success, 1720ms
Task 4  → Strategy B (sequential)   → Failure, 3200ms
Task 5  → Strategy A (parallel)     → Success, 1880ms
...
Task 100 → Strategy B (sequential)  → Success, 2800ms

Results Recorded:
├── Strategy A: 50 samples
│   ├── Success Rate: 0.94 (47/50)
│   ├── Avg Time: 1825ms
│   └── Score: 0.94*0.7 + (1-1825/30000)*0.3 = 0.94
│
└── Strategy B: 50 samples
    ├── Success Rate: 0.86 (43/50)
    ├── Avg Time: 2875ms
    └── Score: 0.86*0.7 + (1-2875/30000)*0.3 = 0.87

         ↓

Phase 4: Winner Determination
──────────────────────────────
Score A = 0.94
Score B = 0.87

Winner: Strategy A (parallel-execution)
Improvement: +8.0% over baseline

         ↓

Phase 5: Strategy Application
──────────────────────────────
ImprovementLoop applies winning strategy

1. Update default strategy for api-testing
2. Store strategy in memory
3. Emit event: learning:strategy_changed
4. Log: "Applied strategy: parallel-execution"

         ↓

Phase 6: Monitoring
───────────────────
Track performance of applied strategy for next 7 days

If performance degrades:
  → Trigger rollback
  → Restore previous strategy
  → Alert operators

If performance improves:
  → Keep strategy
  → Share pattern with fleet
  → Consider new A/B tests
```

---

## 8. Rollback Architecture

```
┌────────────────────────────────────────────────────────────────┐
│              Performance Degradation Detection                  │
└────────────────────────────────────────────────────────────────┘

Continuous Monitoring (Every 10 tasks)
───────────────────────────────────────
PerformanceSafeguard.checkPerformance()

Current Performance Score: 0.72
Baseline Performance Score: 0.85
Change: -15.3% ⚠️

         ↓

Degradation Threshold Check
────────────────────────────
Threshold: -5%
Current Change: -15.3%
Status: DEGRADED ❌

Consecutive Checks: 1/3

         ↓

Wait for Confirmation
─────────────────────
After 20 more tasks...

Current Performance Score: 0.70
Baseline Performance Score: 0.85
Change: -17.6% ⚠️

Consecutive Checks: 2/3

         ↓

After 30 more tasks...

Current Performance Score: 0.69
Baseline Performance Score: 0.85
Change: -18.8% ⚠️

Consecutive Checks: 3/3 → TRIGGER ROLLBACK 🚨

         ↓

┌────────────────────────────────────────────────────────────────┐
│                     Rollback Sequence                           │
└────────────────────────────────────────────────────────────────┘

Step 1: Disable Learning
─────────────────────────
LearningEngine.setEnabled(false)
Status: Learning DISABLED

         ↓

Step 2: Load Previous State
────────────────────────────
StateVersioning.listVersions()
├── v1729420000000 (current - degraded)
├── v1729416400000 (1 hour ago)
└── v1729412800000 (2 hours ago - last good)

StateVersioning.rollbackToVersion("v1729412800000")

Restored:
├── Q-table: 3,456 state-action pairs
├── Experiences: 1,000 entries
├── Patterns: 124 patterns
└── Config: Previous learning config

         ↓

Step 3: Stop Improvement Loop
──────────────────────────────
ImprovementLoop.stop()
Status: Improvement Loop STOPPED

         ↓

Step 4: Emit Rollback Event
────────────────────────────
SwarmMemory.storeEvent({
  type: 'learning:rollback',
  payload: {
    degradation: -18.8,
    trigger: 'consecutive_degradation',
    timestamp: Date.now(),
    version_restored: 'v1729412800000'
  }
})

         ↓

Step 5: Alert Operators
────────────────────────
AlertService.send({
  severity: 'HIGH',
  message: 'Learning rollback for agent test-generator',
  details: {
    degradation: -18.8,
    threshold: -5.0,
    restored_version: 'v1729412800000'
  }
})

         ↓

Step 6: Manual Review Required
───────────────────────────────
Operator investigates:
├── Recent changes
├── A/B test results
├── Failure patterns
└── Resource constraints

Decision:
├── Re-enable learning with tuning
├── Keep disabled for investigation
└── Rollback to even earlier version
```

---

**Document End**

*These visual diagrams complement the detailed technical specifications in `learning-system-integration.md`.*
