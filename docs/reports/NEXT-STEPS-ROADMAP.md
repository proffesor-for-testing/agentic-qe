# Next Steps Roadmap - Phase 1 & 2 Recovery Plan

**Current Status**: 46.6% pass rate (46/99 tests) | **Target**: 65-70% | **Timeline**: This Sprint

---

## 🎯 Mission: Fix Logger, Validate Learning, Complete FleetManager

---

## 📅 Sprint Timeline (Estimated 2-3 Days)

```
Day 1 Morning (2 hours):
  ├─ Fix Logger dependency injection
  ├─ Update PerformanceTracker constructor
  ├─ Update LearningEngine constructor
  └─ Update ImprovementLoop constructor

Day 1 Afternoon (30 mins):
  ├─ Run learning system integration tests
  ├─ Run performance benchmark tests
  └─ Verify Phase 2 validation complete

Day 2 (6 hours):
  ├─ Implement FleetManager.distributeTask()
  ├─ Implement FleetManager.getFleetStatus()
  ├─ Implement FleetManager.calculateEfficiency()
  ├─ Implement FleetManager.shutdown()
  └─ Run FleetManager test suite

Day 3 (2 hours):
  ├─ Fix EventBus error handling edge cases
  ├─ Run full test suite
  └─ Generate final validation report
```

---

## 🔥 Priority 0: Logger Dependency Fix (CRITICAL)

### ⏰ Timeline: 1-2 hours | 🎯 Unlocks: 14 tests (6 learning + 8 performance)

### Step 1: Update PerformanceTracker (30 mins)

**File**: `/workspaces/agentic-qe-cf/src/learning/PerformanceTracker.ts`

**Changes**:
```typescript
// Before:
constructor(agentId: string, memoryStore: SwarmMemoryManager) {
  this.logger = Logger.getInstance(); // ❌ Breaks tests
  // ...
}

// After:
constructor(
  agentId: string,
  memoryStore: SwarmMemoryManager,
  logger?: Logger  // ✅ Allow dependency injection
) {
  this.logger = logger || Logger.getInstance();
  // ...
}
```

**Validation**:
```bash
npm test tests/integration/learning-system.test.ts
# Expected: 6/6 tests passing ✅
```

---

### Step 2: Update LearningEngine (20 mins)

**File**: `/workspaces/agentic-qe-cf/src/learning/LearningEngine.ts`

**Check Constructor**:
```typescript
constructor(
  agentId: string,
  memoryStore: SwarmMemoryManager,
  config: LearningConfig,
  logger?: Logger  // Add if missing
) {
  this.logger = logger || Logger.getInstance();
  // ...
}
```

**Validation**:
```bash
npm test tests/integration/learning-system.test.ts
# All learning engine tests should pass
```

---

### Step 3: Update ImprovementLoop (20 mins)

**File**: `/workspaces/agentic-qe-cf/src/learning/ImprovementLoop.ts`

**Check Constructor**:
```typescript
constructor(
  agentId: string,
  memoryStore: SwarmMemoryManager,
  learningEngine: LearningEngine,
  performanceTracker: PerformanceTracker,
  logger?: Logger  // Add if missing
) {
  this.logger = logger || Logger.getInstance();
  // ...
}
```

**Validation**:
```bash
npm test tests/integration/learning-system.test.ts
# All improvement loop tests should pass
```

---

### Step 4: Update Test Setup (30 mins)

**File**: `/workspaces/agentic-qe-cf/tests/integration/learning-system.test.ts`

**Update beforeEach**:
```typescript
beforeEach(async () => {
  // Create mock logger
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  } as unknown as Logger;

  // Initialize with injected logger
  memoryManager = new SwarmMemoryManager();
  await memoryManager.initialize();

  performanceTracker = new PerformanceTracker(
    TEST_AGENT_ID,
    memoryManager,
    mockLogger  // ✅ Inject logger
  );
  await performanceTracker.initialize();

  learningEngine = new LearningEngine(
    TEST_AGENT_ID,
    memoryManager,
    { enabled: true, learningRate: 0.1, discountFactor: 0.95 },
    mockLogger  // ✅ Inject logger
  );
  await learningEngine.initialize();

  improvementLoop = new ImprovementLoop(
    TEST_AGENT_ID,
    memoryManager,
    learningEngine,
    performanceTracker,
    mockLogger  // ✅ Inject logger
  );
  await improvementLoop.initialize();
});
```

---

### Step 5: Run Performance Benchmarks (10 mins)

**Command**:
```bash
npm test tests/performance/learning-overhead.test.ts
```

**Expected Results**:
```
✅ should measure baseline performance without learning
✅ should measure learning overhead per task (<100ms)
✅ should measure performance tracking overhead (<50ms)
✅ should measure memory storage performance (<30ms)
✅ should measure strategy recommendation overhead
✅ should measure pattern recognition overhead
✅ should measure improvement loop cycle time
✅ should generate comprehensive performance report

Tests: 8 passed, 8 total
```

---

### Step 6: Validate Phase 2 Complete (10 mins)

**Run All Phase 2 Tests**:
```bash
npm test tests/integration/learning-system.test.ts tests/performance/learning-overhead.test.ts
```

**Expected Pass Rate**:
```
Phase 2 Tests: 14/14 passing (100%) ✅
Overall: 60/99 tests (60.6%)
```

**Success Criteria**:
- ✅ All 6 learning integration tests passing
- ✅ All 8 performance benchmarks passing
- ✅ Learning overhead <100ms per task
- ✅ Performance tracker overhead <50ms
- ✅ Memory storage overhead <30ms

---

## 🔧 Priority 1: FleetManager Completion (HIGH)

### ⏰ Timeline: 4-6 hours | 🎯 Unlocks: 11 tests

### Step 1: Implement distributeTask (2 hours)

**File**: `/workspaces/agentic-qe-cf/src/agents/FleetManager.ts`

**Requirements**:
```typescript
async distributeTask(task: Task): Promise<TaskResult> {
  // 1. Find available agents with required capabilities
  // 2. Select best agent based on load balancing
  // 3. Assign task to agent
  // 4. Handle agent failure and retry
  // 5. Return task result
}
```

**Tests**:
```bash
npm test tests/unit/fleet-manager.test.ts -- -t "should coordinate task distribution"
npm test tests/unit/fleet-manager.test.ts -- -t "should handle agent failure during task"
```

---

### Step 2: Implement getFleetStatus (1 hour)

**Requirements**:
```typescript
getFleetStatus(): FleetStatus {
  return {
    topology: this.config.topology,
    totalAgents: this.agents.size,
    activeAgents: this.getActiveAgents().length,
    idleAgents: this.getIdleAgents().length,
    tasksInProgress: this.getInProgressTasks().length,
    averageLoad: this.calculateAverageLoad()
  };
}
```

**Tests**:
```bash
npm test tests/unit/fleet-manager.test.ts -- -t "should provide comprehensive fleet status"
```

---

### Step 3: Implement calculateEfficiency (1 hour)

**Requirements**:
```typescript
calculateEfficiency(): EfficiencyMetrics {
  return {
    resourceUtilization: this.calculateResourceUtilization(),
    taskThroughput: this.calculateTaskThroughput(),
    averageResponseTime: this.calculateAverageResponseTime(),
    agentIdleTime: this.calculateAgentIdleTime()
  };
}
```

**Tests**:
```bash
npm test tests/unit/fleet-manager.test.ts -- -t "should calculate fleet efficiency metrics"
```

---

### Step 4: Implement shutdown (1 hour)

**Requirements**:
```typescript
async shutdown(): Promise<void> {
  // 1. Stop accepting new tasks
  // 2. Wait for in-progress tasks to complete (with timeout)
  // 3. Stop all agents gracefully
  // 4. Handle agent shutdown failures
  // 5. Cleanup resources
}
```

**Tests**:
```bash
npm test tests/unit/fleet-manager.test.ts -- -t "shutdown"
```

---

### Step 5: Run Full FleetManager Suite (15 mins)

**Command**:
```bash
npm test tests/unit/fleet-manager.test.ts
```

**Expected Results**:
```
✅ Fleet Initialization (3/3)
✅ Agent Spawning (4/4)
✅ Fleet Coordination (2/2)
✅ Fleet Status and Metrics (2/2)
✅ Fleet Shutdown (2/2)
✅ FleetManager Contracts (1/1)

Tests: 14 passed, 14 total
```

**Success Criteria**:
- ✅ All 14 FleetManager tests passing
- ✅ Overall: 71/99 tests (71.7%)

---

## 🩹 Priority 2: EventBus Error Handling (MEDIUM)

### ⏰ Timeline: 1-2 hours | 🎯 Unlocks: 2 tests

### Step 1: Fix "from" Argument Error (45 mins)

**File**: `/workspaces/agentic-qe-cf/src/core/EventBus.ts`

**Problem**:
```typescript
// Error handling method
handleError(error: Error) {
  // TypeError: The "from" argument must be of type string. Received undefined
}
```

**Fix**: Add error context validation
```typescript
private emitError(error: Error, context: EventContext) {
  const errorEvent = {
    error,
    eventName: context.eventName || 'unknown',
    listenerIndex: context.listenerIndex || 0,
    timestamp: new Date()
  };

  this.emit('error', errorEvent);
}
```

**Test**:
```bash
npm test tests/core/EventBus.test.ts -- -t "should handle listener errors gracefully"
```

---

### Step 2: Fix Error Context Propagation (45 mins)

**Problem**: Error context not properly propagated to error event

**Fix**: Wrap listener execution in try-catch with context
```typescript
private async executeListener(listener: EventListener, data: any, context: EventContext) {
  try {
    await listener(data);
  } catch (error) {
    this.emitError(error as Error, context);
  }
}
```

**Test**:
```bash
npm test tests/core/EventBus.test.ts -- -t "should provide error context"
```

---

### Step 3: Validate EventBus Complete (10 mins)

**Command**:
```bash
npm test tests/core/EventBus.test.ts
```

**Expected Results**:
```
Tests: 21 passed, 21 total (100%) ✅
```

**Success Criteria**:
- ✅ All 21 EventBus tests passing
- ✅ Overall: 73/99 tests (73.7%)

---

## 📊 Progress Tracking

### Test Pass Rate Milestones

```
Current State:
├─ 46/99 tests passing (46.6%)
├─ Phase 1: 85.7% complete
└─ Phase 2: 0% validated (blocked)

After Logger Fix:
├─ 60/99 tests passing (60.6%) ✅ Phase 1 Target Met
├─ Phase 1: 85.7% complete
└─ Phase 2: 100% validated

After FleetManager:
├─ 71/99 tests passing (71.7%)
├─ Phase 1: 100% complete
└─ Phase 2: 100% validated

After EventBus Fix:
├─ 73/99 tests passing (73.7%) 🎉 Tier 1 Stable
├─ Phase 1: 100% complete
└─ Phase 2: 100% validated
```

---

## ✅ Validation Checklist

### Phase 1 Sign-Off
- [ ] Logger dependency fixed
- [ ] FleetManager implementation complete
- [ ] EventBus error handling fixed
- [ ] Memory leak prevention verified (<2MB)
- [ ] BaseAgent tests passing (27/27)
- [ ] Test pass rate ≥50%

### Phase 2 Sign-Off
- [ ] Learning system integration tests passing (6/6)
- [ ] Performance benchmarks passing (8/8)
- [ ] Learning overhead <100ms ✅
- [ ] PerformanceTracker overhead <50ms
- [ ] Memory storage overhead <30ms
- [ ] Multi-agent coordination working

### Production Readiness
- [ ] All P0 issues resolved
- [ ] All P1 issues resolved
- [ ] Test pass rate ≥70%
- [ ] No memory leaks detected
- [ ] Performance targets met
- [ ] Documentation updated

---

## 🚨 Risk Mitigation

### Risk #1: Logger Fix Complexity
**Mitigation**: Start with PerformanceTracker only, validate, then extend to other classes.

### Risk #2: FleetManager Scope Creep
**Mitigation**: Implement minimum viable methods to pass tests. Optimize later.

### Risk #3: Performance Benchmark Failures
**Mitigation**: If targets not met, document actual performance and adjust targets based on real-world data.

### Risk #4: Timeline Slip
**Mitigation**: Focus on P0 (Logger) first. P1 (FleetManager) can slip to next sprint if needed.

---

## 📝 Daily Standup Template

### Day 1
**Today**: Fix Logger dependency injection
**Blocker**: None
**Risk**: Ensure all learning classes updated

### Day 2
**Today**: Complete FleetManager implementation
**Blocker**: Waiting for Logger validation
**Risk**: Method complexity may take longer

### Day 3
**Today**: Fix EventBus error handling, final validation
**Blocker**: Waiting for FleetManager completion
**Risk**: None (low priority fixes)

---

## 🎯 Success Definition

**Minimum Success** (50%+ pass rate):
- ✅ Logger dependency fixed
- ✅ Learning system validated
- ✅ Phase 2 tests passing

**Target Success** (65-70% pass rate):
- ✅ Logger dependency fixed
- ✅ Learning system validated
- ✅ FleetManager complete
- ✅ 71/99 tests passing

**Stretch Success** (73%+ pass rate):
- ✅ All of the above
- ✅ EventBus error handling fixed
- ✅ 73/99 tests passing
- ✅ No critical issues

---

## 📞 Escalation Path

**If Logger Fix Takes >2 Hours**:
- Escalate to tech lead
- Consider alternative: Mock Logger globally in jest.setup.ts

**If FleetManager Takes >8 Hours**:
- Split work across multiple developers
- Implement methods in parallel

**If Performance Benchmarks Fail**:
- Document actual performance
- Adjust targets if unrealistic
- Optimize in next sprint

---

## 📚 Related Documents

- Full Analysis: `/workspaces/agentic-qe-cf/docs/reports/PHASE1-2-VALIDATION-REPORT.md`
- Quick Summary: `/workspaces/agentic-qe-cf/docs/reports/VALIDATION-SUMMARY.md`
- Original Plan: `/workspaces/agentic-qe-cf/docs/MILESTONE_3_PLAN.md`

---

**Let's ship this! 🚀**
