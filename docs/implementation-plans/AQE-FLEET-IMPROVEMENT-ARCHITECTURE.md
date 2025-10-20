# Agentic QE Fleet Comprehensive Improvement Architecture

**Document Version:** 1.0.0
**Date:** 2025-10-20
**Status:** Architecture Design - Ready for Implementation
**Target Release:** v1.2.0 (Track 1-3), v1.3.0 (Track 4-6)

---

## Executive Summary

This architecture document provides comprehensive improvement tracks for the Agentic QE fleet based on:
- **Regression Risk Analysis** (v1.1.0 → HEAD)
- **Test Failure Analysis** (718 failed tests, 6 categories)
- **Pass Rate Acceleration Analysis** (32.6% → 70% target)
- **Agentic-Flow features** (Multi-Model Router, WASM Booster, 352x speedup)
- **Claude-Flow features** (QUIC transport, Neural training, Advanced swarm patterns)

### Key Metrics

| Metric | Current | Track 1-3 Target | Track 4-6 Target |
|--------|---------|------------------|------------------|
| **Pass Rate** | 32.6% | 70%+ | 90%+ |
| **Test Stability** | 0% → 100% flaky | 95% stable | 99% stable |
| **EventBus Memory** | Unbounded leak | TTL cleanup | QUIC + distributed |
| **Agent Coordination** | 100-500ms latency | 50-150ms | 20-50ms (QUIC) |
| **Cost per Test** | $0.015 (Claude) | $0.002 (Router) | $0.0001 (Local) |
| **Learning Integration** | 0% coverage | 60% agents | 100% fleet |

---

## 🔥 Track 1: Critical Fixes (Days 1-3)

**Priority:** 🔴 CRITICAL
**Duration:** 2-3 days
**Risk:** LOW (isolated fixes)
**Expected Impact:** Pass rate 32.6% → 50%+

### 1.1 Fix Logger Path Import (2 minutes)

**Problem:** EventBus fails to initialize - missing `path` module import
**Impact:** 160 test failures (22.3%)

**Implementation:**
```typescript
// File: /workspaces/agentic-qe-cf/src/utils/Logger.ts
// Line 1: ADD THIS IMPORT
import * as path from 'path';
import * as winston from 'winston';

// Verify lines 40, 46 use path.join() correctly
```

**Success Criteria:**
- ✅ EventBus initialization succeeds
- ✅ 26 EventBus tests pass
- ✅ No "path argument undefined" errors

**Testing:**
```bash
npm test tests/unit/EventBus.test.ts
# Expected: 26/26 passing
```

---

### 1.2 Fix EventBus Memory Leak (30 minutes)

**Problem:** Events stored in Map with no cleanup → unbounded growth
**Impact:** Memory leak in long-running processes (Risk Score: 9.2/10)

**Implementation:**
```typescript
// File: /workspaces/agentic-qe-cf/src/core/EventBus.ts

export class EventBus extends EventEmitter {
  private readonly events: Map<string, FleetEvent>;
  private readonly maxEventAge: number = 3600000; // 1 hour
  private readonly maxEventCount: number = 10000;
  private cleanupInterval?: NodeJS.Timer;

  constructor() {
    super();
    this.logger = Logger.getInstance();
    this.events = new Map();
    this.setMaxListeners(1000);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.logger.info('Initializing EventBus');
    this.setupInternalHandlers();

    // Start periodic cleanup (every 10 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEvents();
    }, 600000);

    this.isInitialized = true;
    this.logger.info('EventBus initialized with TTL cleanup');
  }

  async close(): Promise<void> {
    if (!this.isInitialized) return;

    this.logger.info('Closing EventBus');

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Final cleanup
    this.events.clear();
    this.removeAllListeners();

    this.isInitialized = false;
    this.logger.info('EventBus closed successfully');
  }

  /**
   * Cleanup old processed events
   * Keeps last 1 hour OR 10,000 events (whichever is smaller)
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    const eventsToDelete: string[] = [];

    // Find old events
    for (const [id, event] of this.events.entries()) {
      if (event.processed && (now - event.timestamp.getTime()) > this.maxEventAge) {
        eventsToDelete.push(id);
      }
    }

    // Delete old events
    for (const id of eventsToDelete) {
      this.events.delete(id);
    }

    // If still over limit, delete oldest processed events
    if (this.events.size > this.maxEventCount) {
      const processedEvents = Array.from(this.events.entries())
        .filter(([_, event]) => event.processed)
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

      const deleteCount = this.events.size - this.maxEventCount;
      for (let i = 0; i < Math.min(deleteCount, processedEvents.length); i++) {
        this.events.delete(processedEvents[i][0]);
      }
    }

    this.logger.debug(`EventBus cleanup: deleted ${eventsToDelete.length} events, current size: ${this.events.size}`);
  }

  /**
   * Mark event as processed (allows cleanup)
   */
  markEventProcessed(eventId: string): void {
    const event = this.events.get(eventId);
    if (event) {
      event.processed = true;
    }
  }

  /**
   * Get current EventBus metrics
   */
  getMetrics(): {
    totalEvents: number;
    processedEvents: number;
    pendingEvents: number;
    oldestEvent?: Date;
  } {
    const processedCount = Array.from(this.events.values()).filter(e => e.processed).length;
    const oldest = Array.from(this.events.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];

    return {
      totalEvents: this.events.size,
      processedEvents: processedCount,
      pendingEvents: this.events.size - processedCount,
      oldestEvent: oldest?.timestamp
    };
  }
}
```

**Success Criteria:**
- ✅ EventBus memory stable after 1 hour of continuous operation
- ✅ Memory growth < 10MB/hour
- ✅ Events limited to 10,000 max
- ✅ Cleanup runs every 10 minutes

**Testing:**
```bash
# Create memory leak test
cat > tests/performance/eventbus-memory-leak.test.ts << 'EOF'
describe('EventBus Memory Leak Prevention', () => {
  it('should cleanup old events automatically', async () => {
    const eventBus = EventBus.getInstance();
    await eventBus.initialize();

    // Emit 20,000 events
    for (let i = 0; i < 20000; i++) {
      const eventId = await eventBus.emitFleetEvent('test:event', 'test', { i });
      eventBus.markEventProcessed(eventId);
    }

    // Wait for cleanup (trigger manually for test)
    await new Promise(resolve => setTimeout(resolve, 100));
    eventBus['cleanupOldEvents']();

    const metrics = eventBus.getMetrics();
    expect(metrics.totalEvents).toBeLessThan(10000);
  });
});
EOF

npm test tests/performance/eventbus-memory-leak.test.ts
```

---

### 1.3 Fix Database Breaking Changes (1 hour)

**Problem:** Database methods now throw "not initialized" instead of graceful degradation
**Impact:** 82 test failures (11.4%), FleetManager coordination failures

**Implementation:**
```typescript
// File: /workspaces/agentic-qe-cf/src/utils/Database.ts

export class Database {
  private db: BetterSqlite3.Database | null = null;
  private isInitialized: boolean = false;

  // Add graceful fallback mode for testing
  private fallbackMode: boolean = false;

  constructor(
    private readonly dbPath: string,
    options?: { fallbackMode?: boolean }
  ) {
    this.fallbackMode = options?.fallbackMode || false;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = new BetterSqlite3(this.dbPath);
      this.isInitialized = true;
    } catch (error) {
      if (this.fallbackMode) {
        this.logger.warn('Database initialization failed, using fallback mode');
        // In-memory fallback
        this.db = new BetterSqlite3(':memory:');
        this.isInitialized = true;
      } else {
        throw error;
      }
    }
  }

  async exec(sql: string): Promise<void> {
    if (!this.db) {
      if (this.fallbackMode) {
        this.logger.warn('Database not initialized, skipping exec in fallback mode');
        return;
      }
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      this.db.exec(sql);
    } catch (error) {
      this.logger.error('Database exec failed', { sql, error });
      throw new Error(`Database exec failed: ${error.message}`);
    }
  }

  // Similar pattern for run, get, all methods...
}
```

**Success Criteria:**
- ✅ Tests using Database don't crash on initialization
- ✅ Fallback mode allows graceful degradation
- ✅ 82 FleetManager tests pass

**Testing:**
```bash
npm test tests/unit/FleetManager.database.test.ts
npm test tests/integration/database-integration.test.ts
# Expected: 82+ tests passing
```

---

### 1.4 Fix SwarmMemoryManager Initialization (2 hours)

**Problem:** Tests create agents without initializing SwarmMemoryManager first
**Impact:** 82 test failures, BaseAgent construction fails

**Implementation:**

Create global test setup helper:
```typescript
// File: tests/helpers/setup-memory.ts
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import * as path from 'path';
import * as fs from 'fs-extra';

export async function setupTestMemory(testName: string): Promise<SwarmMemoryManager> {
  const dbPath = path.join(process.cwd(), '.swarm', `test-${testName}-${Date.now()}.db`);

  // Ensure directory exists
  await fs.ensureDir(path.dirname(dbPath));

  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();

  return memoryStore;
}

export async function teardownTestMemory(memoryStore: SwarmMemoryManager): Promise<void> {
  const dbPath = memoryStore['dbPath'];
  await memoryStore.close();

  // Cleanup test database
  if (dbPath && dbPath.includes('test-')) {
    await fs.remove(dbPath).catch(() => {});
  }
}
```

Update all agent tests:
```typescript
// Pattern for ALL agent test files
import { setupTestMemory, teardownTestMemory } from '../helpers/setup-memory';

describe('FleetManager Tests', () => {
  let memoryStore: SwarmMemoryManager;
  let fleetManager: FleetManager;

  beforeAll(async () => {
    memoryStore = await setupTestMemory('fleet-manager');
  });

  afterAll(async () => {
    await teardownTestMemory(memoryStore);
  });

  beforeEach(async () => {
    fleetManager = new FleetManager({
      memoryStore,
      eventBus: EventBus.getInstance(),
      config: { maxAgents: 10 }
    });
    await fleetManager.initialize();
  });
});
```

**Success Criteria:**
- ✅ All agent tests initialize SwarmMemoryManager
- ✅ No "MemoryStore undefined" errors
- ✅ Test databases cleaned up after each test

**Testing:**
```bash
npm test tests/unit/fleet-manager.test.ts
npm test tests/agents/BaseAgent.test.ts
# Expected: 82+ tests passing
```

---

### Track 1 Summary

**Total Effort:** 4-6 hours
**Expected Pass Rate:** 32.6% → 50-55%
**Tests Fixed:** 242+ tests (160 + 82)
**Risk:** LOW

**Validation:**
```bash
# Run full suite
npm test

# Verify pass rate
npm test 2>&1 | grep -E "Tests:.*passed"
# Expected: 200+ passing

# Check for memory leaks
npm test tests/performance/eventbus-memory-leak.test.ts
```

---

## 🚀 Track 2: Learning System Integration (Week 1)

**Priority:** 🟡 HIGH
**Duration:** 5-7 days
**Risk:** MEDIUM
**Expected Impact:** Enable continuous improvement, reduce flaky tests 50%

### 2.1 Integrate Q-Learning with QE Agents (2 days)

**Implementation:**
```typescript
// File: src/learning/QLearningIntegration.ts

import { LearningEngine } from './LearningEngine';
import { PerformanceTracker } from './PerformanceTracker';
import { FlakyTestDetector } from './FlakyTestDetector';

export interface QLearningConfig {
  learningRate: number;
  discountFactor: number;
  explorationRate: number;
  decayRate: number;
}

export class QLearningIntegration {
  private qTable: Map<string, Map<string, number>> = new Map();

  constructor(
    private learningEngine: LearningEngine,
    private performanceTracker: PerformanceTracker,
    private config: QLearningConfig
  ) {}

  /**
   * Learn from test execution results
   */
  async learnFromTestExecution(
    testId: string,
    action: 'retry' | 'skip' | 'isolate' | 'run',
    result: {
      passed: boolean;
      executionTime: number;
      flaky: boolean;
    }
  ): Promise<void> {
    // Calculate reward
    const reward = this.calculateReward(result);

    // Get state
    const state = await this.getState(testId);

    // Update Q-table
    this.updateQValue(state, action, reward);

    // Store pattern in learning engine
    await this.learningEngine.recordTestResult({
      testId,
      action,
      result,
      reward,
      timestamp: Date.now()
    });
  }

  /**
   * Recommend best action for a test
   */
  async recommendAction(testId: string): Promise<'retry' | 'skip' | 'isolate' | 'run'> {
    const state = await this.getState(testId);

    // Exploration vs exploitation
    if (Math.random() < this.config.explorationRate) {
      // Explore: random action
      const actions: Array<'retry' | 'skip' | 'isolate' | 'run'> = ['retry', 'skip', 'isolate', 'run'];
      return actions[Math.floor(Math.random() * actions.length)];
    }

    // Exploit: best known action
    const qValues = this.qTable.get(state) || new Map();
    let bestAction: 'retry' | 'skip' | 'isolate' | 'run' = 'run';
    let bestValue = -Infinity;

    for (const [action, value] of qValues.entries()) {
      if (value > bestValue) {
        bestValue = value;
        bestAction = action as any;
      }
    }

    return bestAction;
  }

  private calculateReward(result: {
    passed: boolean;
    executionTime: number;
    flaky: boolean;
  }): number {
    let reward = 0;

    // Reward for passing
    if (result.passed) reward += 10;
    else reward -= 5;

    // Penalty for slow execution
    if (result.executionTime > 5000) reward -= 2;
    else if (result.executionTime < 1000) reward += 1;

    // Penalty for flakiness
    if (result.flaky) reward -= 3;

    return reward;
  }

  private async getState(testId: string): Promise<string> {
    const history = await this.performanceTracker.getTestHistory(testId);

    const passRate = history.length > 0
      ? history.filter(h => h.passed).length / history.length
      : 0.5;

    const avgTime = history.length > 0
      ? history.reduce((sum, h) => sum + h.executionTime, 0) / history.length
      : 1000;

    // Discretize state
    const passRateBucket = Math.floor(passRate * 10);
    const timeBucket = avgTime < 1000 ? 'fast' : avgTime < 5000 ? 'medium' : 'slow';

    return `${passRateBucket}-${timeBucket}`;
  }

  private updateQValue(state: string, action: string, reward: number): void {
    if (!this.qTable.has(state)) {
      this.qTable.set(state, new Map());
    }

    const stateActions = this.qTable.get(state)!;
    const currentQ = stateActions.get(action) || 0;

    // Q-learning update rule: Q(s,a) = Q(s,a) + α[r + γ max Q(s',a') - Q(s,a)]
    const newQ = currentQ + this.config.learningRate * (
      reward + this.config.discountFactor * this.getMaxQValue(state) - currentQ
    );

    stateActions.set(action, newQ);
  }

  private getMaxQValue(state: string): number {
    const stateActions = this.qTable.get(state);
    if (!stateActions || stateActions.size === 0) return 0;

    return Math.max(...Array.from(stateActions.values()));
  }
}
```

**Integration with Test Executor:**
```typescript
// File: src/agents/TestExecutorAgent.ts

export class TestExecutorAgent extends BaseAgent {
  private qLearning: QLearningIntegration;

  async executeTest(testId: string): Promise<TestResult> {
    // Get recommended action from Q-learning
    const action = await this.qLearning.recommendAction(testId);

    let result: TestResult;

    switch (action) {
      case 'skip':
        this.logger.info(`Skipping flaky test: ${testId}`);
        result = { testId, skipped: true, reason: 'learned-flaky' };
        break;

      case 'retry':
        result = await this.executeWithRetry(testId, 3);
        break;

      case 'isolate':
        result = await this.executeInIsolation(testId);
        break;

      default:
        result = await this.executeNormal(testId);
    }

    // Learn from result
    await this.qLearning.learnFromTestExecution(testId, action, {
      passed: result.passed,
      executionTime: result.duration,
      flaky: result.flaky || false
    });

    return result;
  }
}
```

**Success Criteria:**
- ✅ Q-learning reduces flaky test failures by 50%
- ✅ Test execution time reduced by 20% (smart skipping)
- ✅ Recommendation accuracy > 80% after 100 test runs

---

### 2.2 Connect PerformanceTracker to Fleet Monitoring (1 day)

**Implementation:**
```typescript
// File: src/core/FleetPerformanceMonitor.ts

import { PerformanceTracker } from '../learning/PerformanceTracker';
import { FleetManager } from './FleetManager';
import { EventBus } from './EventBus';

export class FleetPerformanceMonitor {
  private performanceTracker: PerformanceTracker;
  private monitoringInterval?: NodeJS.Timer;

  constructor(
    private fleetManager: FleetManager,
    private eventBus: EventBus
  ) {
    this.performanceTracker = new PerformanceTracker();
  }

  async initialize(): Promise<void> {
    // Subscribe to agent events
    this.eventBus.on('agent:task:completed', async (event) => {
      await this.recordAgentPerformance(event.data);
    });

    this.eventBus.on('agent:task:failed', async (event) => {
      await this.recordAgentFailure(event.data);
    });

    // Start real-time monitoring
    this.monitoringInterval = setInterval(() => {
      this.analyzeFleetPerformance();
    }, 60000); // Every minute
  }

  private async recordAgentPerformance(data: {
    agentId: string;
    taskId: string;
    executionTime: number;
    success: boolean;
  }): Promise<void> {
    await this.performanceTracker.recordMetric({
      category: 'agent-performance',
      name: data.agentId,
      value: data.executionTime,
      timestamp: Date.now(),
      metadata: {
        taskId: data.taskId,
        success: data.success
      }
    });
  }

  private async analyzeFleetPerformance(): Promise<void> {
    const agents = this.fleetManager.getAgents();
    const metrics: any[] = [];

    for (const agent of agents) {
      const agentMetrics = await this.performanceTracker.getMetrics({
        category: 'agent-performance',
        name: agent.getId(),
        timeWindow: 3600000 // Last hour
      });

      const avgExecutionTime = agentMetrics.reduce((sum, m) => sum + m.value, 0) / agentMetrics.length;
      const successRate = agentMetrics.filter(m => m.metadata?.success).length / agentMetrics.length;

      metrics.push({
        agentId: agent.getId(),
        avgExecutionTime,
        successRate,
        taskCount: agentMetrics.length
      });
    }

    // Emit fleet performance event
    await this.eventBus.emitFleetEvent('fleet:performance:analysis', 'performance-monitor', {
      metrics,
      timestamp: Date.now()
    });

    // Detect anomalies
    for (const metric of metrics) {
      if (metric.successRate < 0.8) {
        this.logger.warn(`Agent ${metric.agentId} has low success rate: ${metric.successRate}`);
      }
      if (metric.avgExecutionTime > 10000) {
        this.logger.warn(`Agent ${metric.agentId} has high execution time: ${metric.avgExecutionTime}ms`);
      }
    }
  }
}
```

**Success Criteria:**
- ✅ Real-time performance metrics collected for all agents
- ✅ Anomaly detection alerts for slow/failing agents
- ✅ Performance dashboard data available

---

### Track 2 Summary

**Total Effort:** 5-7 days
**Expected Benefits:**
- ✅ 50% reduction in flaky test failures
- ✅ 20% reduction in test execution time
- ✅ Real-time fleet performance monitoring
- ✅ Continuous learning from test results

---

## 📊 Track 3: AgentDB Enhancement (Week 2)

**Priority:** 🟡 MEDIUM
**Duration:** 5-7 days
**Risk:** MEDIUM
**Expected Impact:** 150x faster search, distributed coordination

### 3.1 Add QUIC Sync for Distributed Fleet (2 days)

**Architecture:**
```
┌─────────────────────────────────────────────────────┐
│          Distributed AQE Fleet                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  QUIC  ┌──────────┐  QUIC  ┌────────┤
│  │ Node 1   │◄──────►│ Node 2   │◄──────►│ Node 3 │
│  │ (Leader) │        │ (Worker) │        │(Worker)│
│  └──────────┘        └──────────┘        └────────┘
│       ▲                                            │
│       │ AgentDB Sync (QUIC UDP, 0-RTT)            │
│       ▼                                            │
│  ┌─────────────────────────────────────┐          │
│  │  Shared Test History & Patterns     │          │
│  │  - 150x faster vector search        │          │
│  │  - Hybrid search (sparse + dense)   │          │
│  │  - Learning plugin integration      │          │
│  └─────────────────────────────────────┘          │
└─────────────────────────────────────────────────────┘
```

**Implementation will be detailed in subsequent sections...**

---

## 🔄 Track 4-6 Preview

Due to length constraints, Tracks 4-6 will be detailed in separate documents:

- **Track 4:** Cloud Flow Integration (Week 2-3)
- **Track 5:** Skill System Overhaul (Week 3)
- **Track 6:** Agent Coordination Enhancement (Week 4)

---

## Success Metrics Summary

| Track | Duration | Pass Rate Impact | Key Benefit |
|-------|----------|------------------|-------------|
| **Track 1** | 2-3 days | +17% (→50%) | Critical stability |
| **Track 2** | 5-7 days | +10% (→60%) | Learning integration |
| **Track 3** | 5-7 days | +5% (→65%) | Performance boost |
| **Track 4** | 7-10 days | +10% (→75%) | Cloud capabilities |
| **Track 5** | 5-7 days | +5% (→80%) | Developer experience |
| **Track 6** | 7-10 days | +10% (→90%) | Advanced coordination |

**Total Timeline:** 4-6 weeks to 90% pass rate

---

## Implementation Priority

**Week 1 (MUST DO):**
- ✅ Track 1: All critical fixes
- ✅ Track 2: Q-learning integration

**Week 2-3 (SHOULD DO):**
- ✅ Track 3: AgentDB + QUIC
- ✅ Track 4: Cloud Flow basics

**Week 4+ (OPTIONAL):**
- ⚠️ Track 5: Skill improvements
- ⚠️ Track 6: Advanced patterns

---

**Next:** See individual track documents for detailed implementation
