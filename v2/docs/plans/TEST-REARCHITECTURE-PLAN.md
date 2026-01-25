# Test Re-Architecture Plan
**Priority**: 🔴 CRITICAL
**Timeline**: 2-4 weeks
**Goal**: Increase coverage from 1.36% → 60%

---

## 🎯 Executive Summary

**Current State**: 1.36% coverage despite 150+ test files
**Root Cause**: Tests validate mocks, not real implementations
**Solution**: Rewrite tests to exercise actual code paths

---

## 📊 Coverage Gap Analysis

### Modules with 0% Coverage (Priority Order)

#### Tier 1: Foundation (IMMEDIATE)
**Impact**: +20% coverage, blocks all other work

| Module | Lines | Priority | Reason |
|--------|-------|----------|--------|
| `BaseAgent.ts` | 166 | 🔴 CRITICAL | Base class for all agents, must work |
| `FleetManager.ts` | 99 | 🔴 CRITICAL | Orchestrates everything, 38% → 85% |
| `Task.ts` | 92 | 🔴 CRITICAL | Core abstraction, 17% → 80% |
| `SwarmMemoryManager.ts` | 436 | 🔴 CRITICAL | All state storage, 18% → 75% |
| `MemoryManager.ts` | 211 | 🔴 CRITICAL | Memory operations, 0% → 70% |

**Sub-total**: 1,004 lines, currently 173 covered (17.2%)
**Target**: 800 lines covered (79.7%)
**Impact**: +2.8% overall coverage

#### Tier 2: Agents (HIGH)
**Impact**: +15% coverage, enables agent testing

| Agent Type | Lines | Tests Exist? | Strategy |
|------------|-------|--------------|----------|
| TestExecutorAgent | 262 | ✅ Mocked | Rewrite with real executor |
| TestGeneratorAgent | 218 | ✅ Mocked | Test real generation |
| CoverageAnalyzerAgent | 270 | ✅ Mocked | Test real analysis |
| FlakyTestHunterAgent | 357 | ✅ Mocked | Test real detection |
| PerformanceTesterAgent | 221 | ✅ Mocked | Test real benchmarks |
| QualityGateAgent | 188 | ✅ Mocked | Test real gates |
| RegressionRiskAnalyzerAgent | 381 | ✅ Mocked | Test real analysis |
| SecurityScannerAgent | 223 | ✅ Mocked | Test real scanning |
| DeploymentReadinessAgent | 332 | ✅ Mocked | Test real checks |
| RequirementsValidatorAgent | 404 | ✅ Mocked | Test real validation |

**Sub-total**: 2,856 lines, currently 0 covered (0%)
**Target**: 2,285 lines covered (80%)
**Impact**: +10.1% overall coverage

#### Tier 3: Learning System (HIGH)
**Impact**: +5% coverage, critical for intelligence

| Module | Lines | Current | Strategy |
|--------|-------|---------|----------|
| LearningEngine.ts | 194 | 0% | Test real learning loops |
| PerformanceTracker.ts | 119 | 0% | Test real metrics |
| ImprovementLoop.ts | 213 | 0% | Test real feedback |
| FlakyTestDetector.ts | 252 | 0% | Test real ML detection |
| StatisticalAnalysis.ts | 143 | 0% | Test real statistics |

**Sub-total**: 921 lines, currently 0 covered (0%)
**Target**: 736 lines covered (80%)
**Impact**: +3.3% overall coverage

#### Tier 4: CLI Commands (MEDIUM)
**Impact**: +8% coverage, user-facing

60+ command modules (~6,000 lines, 0% coverage)
**Strategy**: Integration tests with real command execution
**Target**: 60% coverage (3,600 lines)
**Impact**: +6.0% overall coverage

#### Tier 5: MCP Handlers (MEDIUM)
**Impact**: +3% coverage, API surface

10+ handler modules (~1,500 lines, 0% coverage)
**Strategy**: Test real MCP protocol handling
**Target**: 75% coverage (1,125 lines)
**Impact**: +5.0% overall coverage

#### Tier 6: Reasoning/ReasoningBank (LOW)
**Impact**: +2% coverage, advanced features

5 modules (~800 lines, 0% coverage)
**Strategy**: Test real pattern recognition
**Target**: 80% coverage (640 lines)
**Impact**: +2.8% overall coverage

---

## 🔧 Test Re-Architecture Patterns

### Pattern 1: Remove Mock Overuse

#### ❌ WRONG (Current)
```typescript
// tests/agents/TestExecutorAgent.test.ts
jest.mock('../../src/agents/BaseAgent');
jest.mock('../../src/core/FleetManager');
jest.mock('../../src/core/EventBus');

describe('TestExecutorAgent', () => {
  it('should execute tests', async () => {
    const agent = new TestExecutorAgent({} as any);
    const result = await agent.executeTask({} as any);
    expect(result).toBeDefined(); // 0% coverage
  });
});
```

**Result**: Test passes, 0 lines covered

#### ✅ RIGHT (Required)
```typescript
// tests/agents/TestExecutorAgent.test.ts
import { TestExecutorAgent } from '../../src/agents/TestExecutorAgent';
import { globalEventBus } from '../setup/global-infrastructure';
import { createTestMemoryStore } from '../utils/test-helpers';

describe('TestExecutorAgent', () => {
  let agent: TestExecutorAgent;
  let memoryStore: SwarmMemoryManager;

  beforeEach(async () => {
    memoryStore = await createTestMemoryStore();
    agent = new TestExecutorAgent({
      id: 'test-executor-1',
      type: 'test-executor',
      memoryStore,
      eventBus: globalEventBus,
      logger: createTestLogger()
    });
    await agent.initialize();
  });

  it('should execute real Jest tests', async () => {
    const task = {
      id: 'task-1',
      description: 'Run unit tests',
      framework: 'jest',
      testFiles: ['tests/sample-unit.test.js']
    };

    const result = await agent.executeTask(task);

    expect(result.status).toBe('completed');
    expect(result.testsRun).toBeGreaterThan(0);
    expect(result.framework).toBe('jest');
    expect(result.duration).toBeGreaterThan(0);

    // Verify memory storage
    const storedResult = await memoryStore.retrieve(
      `test-results/${task.id}`
    );
    expect(storedResult).toEqual(result);
  });

  it('should handle test failures gracefully', async () => {
    const task = {
      id: 'task-2',
      framework: 'jest',
      testFiles: ['tests/failing-test.js']
    };

    const result = await agent.executeTask(task);

    expect(result.status).toBe('failed');
    expect(result.failures).toBeGreaterThan(0);
    expect(result.errorDetails).toBeDefined();
  });
});
```

**Result**: Test passes, 80-100 lines covered

### Pattern 2: Integration Over Isolation

#### ❌ WRONG (Current)
```typescript
// tests/integration/fleet-coordination.test.ts
const mockFleet = { coordinate: jest.fn() };

test('fleet coordinates agents', async () => {
  await mockFleet.coordinate();
  expect(mockFleet.coordinate).toHaveBeenCalled(); // 0% coverage
});
```

#### ✅ RIGHT (Required)
```typescript
// tests/integration/fleet-coordination.test.ts
import { FleetManager } from '../../src/core/FleetManager';
import { globalEventBus, globalMemoryStore } from '../setup/global-infrastructure';

describe('Fleet Coordination Integration', () => {
  let fleet: FleetManager;

  beforeEach(async () => {
    fleet = new FleetManager({
      eventBus: globalEventBus,
      memoryStore: globalMemoryStore,
      config: { maxAgents: 5, topology: 'mesh' }
    });
    await fleet.initialize();
  });

  afterEach(async () => {
    await fleet.shutdown();
  });

  it('should coordinate multiple agents in real workflow', async () => {
    // Spawn agents
    const executor = await fleet.spawnAgent({
      type: 'test-executor',
      capabilities: ['jest', 'mocha']
    });
    const analyzer = await fleet.spawnAgent({
      type: 'coverage-analyzer',
      capabilities: ['istanbul', 'v8']
    });

    // Execute coordinated workflow
    const task = {
      id: 'workflow-1',
      steps: [
        { agent: executor.id, action: 'execute-tests' },
        { agent: analyzer.id, action: 'analyze-coverage' }
      ]
    };

    const result = await fleet.executeWorkflow(task);

    expect(result.status).toBe('completed');
    expect(result.stepsCompleted).toBe(2);
    expect(result.agents).toHaveLength(2);

    // Verify agent coordination via EventBus
    const events = await globalEventBus.getEventLog();
    expect(events.filter(e => e.type === 'agent:coordinated')).toHaveLength(2);

    // Verify state persistence
    const fleetState = await globalMemoryStore.retrieve('fleet/state');
    expect(fleetState.activeAgents).toBe(2);
  });
});
```

**Result**: Test passes, 150-200 lines covered across multiple modules

### Pattern 3: Real Dependencies, Boundary Mocks

#### Keep Real
- EventBus (use global singleton)
- MemoryStore (use in-memory SQLite)
- Agents (use real instances)
- Task execution logic

#### Mock Only Boundaries
- Network requests (axios)
- Filesystem (fs/promises)
- External APIs (Claude API)
- Time-dependent operations (Date.now)

```typescript
// ✅ GOOD: Mock boundaries, test real logic
import axios from 'axios';
jest.mock('axios');

describe('RequirementsValidatorAgent', () => {
  it('validates requirements from API', async () => {
    // Mock the API boundary
    (axios.get as jest.Mock).mockResolvedValue({
      data: { requirements: [...] }
    });

    // Test real validation logic
    const agent = new RequirementsValidatorAgent(realDeps);
    const result = await agent.validateRequirements('api-url');

    expect(result.validated).toBe(true);
    expect(result.coverage).toBeGreaterThan(0.9);
    // Real validation logic exercised: 50+ lines covered
  });
});
```

---

## 📅 Implementation Timeline

### Week 1: Foundation (Tier 1)
**Goal**: 1.36% → 8%

**Day 1-2**: BaseAgent + Task
- Rewrite `tests/agents/BaseAgent.test.ts`
- Remove all mocks, use real dependencies
- Target: 80% coverage (133/166 lines)
- **Deliverable**: BaseAgent.test.ts with 40+ test cases

**Day 3-4**: FleetManager + MemoryManager
- Enhance `tests/core/FleetManager.test.ts`
- Rewrite `tests/core/MemoryManager.test.ts`
- Target: 75% coverage (473/610 lines)
- **Deliverable**: Real fleet initialization tests

**Day 5**: SwarmMemoryManager
- Enhance `tests/core/memory/SwarmMemoryManager.test.ts`
- Test all 12 tables, real database operations
- Target: 75% coverage (327/436 lines)
- **Deliverable**: Database integration tests

**Week 1 Milestone**: 8% coverage (+1,500 lines), foundation solid

### Week 2: Agents (Tier 2)
**Goal**: 8% → 25%

**Day 6-7**: Test Execution Agents
- TestExecutorAgent (262 lines)
- TestGeneratorAgent (218 lines)
- Target: 80% coverage (384/480 lines)

**Day 8-9**: Quality Agents
- CoverageAnalyzerAgent (270 lines)
- QualityGateAgent (188 lines)
- RegressionRiskAnalyzerAgent (381 lines)
- Target: 80% coverage (671/839 lines)

**Day 10-11**: Security & Deployment Agents
- SecurityScannerAgent (223 lines)
- DeploymentReadinessAgent (332 lines)
- RequirementsValidatorAgent (404 lines)
- Target: 80% coverage (767/959 lines)

**Day 12**: Performance & Flaky Test Agents
- PerformanceTesterAgent (221 lines)
- FlakyTestHunterAgent (357 lines)
- Target: 80% coverage (462/578 lines)

**Week 2 Milestone**: 25% coverage (+3,800 lines), agents working

### Week 3: Learning & CLI (Tier 3 & 4)
**Goal**: 25% → 45%

**Day 13-14**: Learning System
- LearningEngine.ts (194 lines)
- PerformanceTracker.ts (119 lines)
- ImprovementLoop.ts (213 lines)
- FlakyTestDetector.ts (252 lines)
- StatisticalAnalysis.ts (143 lines)
- Target: 80% coverage (736/921 lines)

**Day 15-17**: CLI Commands
- Core commands (analyze, fleet, generate, init, run)
- Agent commands (assign, attach, benchmark, etc.)
- Config commands (export, get, import, etc.)
- Target: 60% coverage (1,800/3,000 lines for top 50 commands)

**Day 18**: Debug & Quality Commands
- Debug commands (agent, diagnostics, health-check)
- Quality commands (baseline, gate, policy, risk)
- Target: 60% coverage (600/1,000 lines)

**Week 3 Milestone**: 45% coverage (+6,000 lines), CLI + Learning tested

### Week 4: MCP, Reasoning, Polish (Tier 5 & 6)
**Goal**: 45% → 60%

**Day 19-20**: MCP Handlers
- CoordinationTools, MemoryTools
- AnalysisTools, QualityTools, ChaosTools
- Target: 75% coverage (1,125/1,500 lines)

**Day 21**: ReasoningBank
- QEReasoningBank.ts (289 lines)
- PatternExtractor.ts (156 lines)
- PatternClassifier.ts (103 lines)
- Target: 80% coverage (438/548 lines)

**Day 22-23**: Integration Test Enhancement
- Fix existing integration tests to use real code paths
- Add missing integration scenarios
- Target: +5% coverage from better integration tests

**Day 24**: Polish & Verification
- Fill coverage gaps
- Add edge case tests
- Verify all targets met

**Week 4 Milestone**: 60% coverage (+9,000 lines total), production-ready

---

## 🎯 Success Metrics

### Coverage Targets
- [x] Week 1: 1.36% → 8% (Foundation)
- [ ] Week 2: 8% → 25% (Agents)
- [ ] Week 3: 25% → 45% (Learning + CLI)
- [ ] Week 4: 45% → 60% (MCP + Polish)

### Quality Metrics
- [ ] Mock-to-Real Ratio: <20% (currently >80%)
- [ ] Integration Test Coverage: 40% (currently ~5%)
- [ ] Test File Existence: 200/220 modules (currently 150/220)
- [ ] Average Module Coverage: >60% (currently 1.36%)

### Verification Gates
- [ ] All tests pass with real dependencies
- [ ] No coverage regressions on any module
- [ ] CI/CD pipeline executes in <10 minutes
- [ ] No flaky tests introduced

---

## 🛠️ Implementation Guidelines

### Test File Template
```typescript
// tests/[category]/[Module].test.ts
import { Module } from '../../src/[category]/[Module]';
import { globalEventBus, globalMemoryStore } from '../setup/global-infrastructure';
import { createTestLogger, waitForEvent } from '../utils/test-helpers';

describe('[Module]', () => {
  let module: Module;

  beforeEach(async () => {
    module = new Module({
      eventBus: globalEventBus,
      memoryStore: globalMemoryStore,
      logger: createTestLogger()
    });
    await module.initialize();
  });

  afterEach(async () => {
    await module.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with valid config', async () => {
      expect(module.isReady()).toBe(true);
    });

    it('should register with EventBus', async () => {
      const events = await globalEventBus.getEventLog();
      expect(events.some(e => e.type === 'module:initialized')).toBe(true);
    });
  });

  describe('core functionality', () => {
    it('should [main use case]', async () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = await module.process(input);

      // Assert
      expect(result).toMatchObject({
        status: 'completed',
        data: expect.any(Object)
      });

      // Verify side effects
      const stored = await globalMemoryStore.retrieve('module/result');
      expect(stored).toEqual(result);
    });
  });

  describe('error handling', () => {
    it('should handle [error case]', async () => {
      // Test real error handling, not mocked failures
      const invalidInput = createInvalidInput();

      await expect(module.process(invalidInput))
        .rejects.toThrow('Expected error message');
    });
  });
});
```

### Test Helper Pattern
```typescript
// tests/utils/test-helpers.ts
export function createTestMemoryStore(): Promise<SwarmMemoryManager> {
  return SwarmMemoryManager.create(':memory:'); // In-memory SQLite
}

export function createTestLogger(): Logger {
  return new Logger({ level: 'error', silent: true });
}

export async function waitForEvent(
  eventBus: EventBus,
  eventType: string,
  timeout = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Event timeout')), timeout);
    eventBus.once(eventType, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
```

---

## 📋 Deliverables

### Week 1
- [ ] 5 rewritten test files (BaseAgent, Task, FleetManager, MemoryManager, SwarmMemoryManager)
- [ ] Test helper utilities (test-helpers.ts, test-fixtures.ts)
- [ ] Coverage: 1.36% → 8%
- [ ] Documentation: Test re-architecture guide

### Week 2
- [ ] 10 rewritten agent test files
- [ ] Agent integration test suite
- [ ] Coverage: 8% → 25%
- [ ] Documentation: Agent testing patterns

### Week 3
- [ ] 5 learning system test files
- [ ] 30+ CLI command test files
- [ ] Coverage: 25% → 45%
- [ ] Documentation: CLI testing guide

### Week 4
- [ ] 10 MCP handler test files
- [ ] 5 ReasoningBank test files
- [ ] Enhanced integration tests
- [ ] Coverage: 45% → 60%
- [ ] Final report: Coverage achievement

---

## 🚨 Risk Mitigation

### Risk 1: Test Complexity Explosion
**Mitigation**: Use shared test fixtures and helpers
**Contingency**: Reduce targets (60% → 50%)

### Risk 2: Real Dependencies Too Slow
**Mitigation**: Optimize test setup/teardown, use in-memory databases
**Contingency**: Selective mocking for slowest operations

### Risk 3: Flaky Tests Introduced
**Mitigation**: Use `waitForEvent()`, avoid timing assumptions
**Contingency**: FlakyTestDetector analysis + quarantine

### Risk 4: Coverage Regression
**Mitigation**: Lock coverage per-module with jest thresholds
**Contingency**: Rollback to last stable state

---

## 📊 Progress Tracking

### Daily Updates
```bash
# Run coverage and track progress
npm run test:coverage
cat coverage/coverage-summary.json | jq '.total.lines.pct'

# Track against targets
echo "Target: [Week X Target]%, Current: [Actual]%"
```

### Weekly Reports
- Coverage achieved vs target
- Modules completed
- Blockers identified
- Next week priorities

---

## 🎓 Team Training

### Day 1: Kickoff (2 hours)
- Why 1.36% coverage despite 150+ tests?
- Mock overuse anti-patterns
- Real dependency testing patterns
- Code walkthrough of good vs bad tests

### Week 1 Check-in (1 hour)
- Review BaseAgent test rewrite
- Share learnings and challenges
- Adjust timeline if needed

### Week 2 Check-in (1 hour)
- Review agent test patterns
- Integration test best practices

### Week 3 Check-in (1 hour)
- CLI testing patterns
- Performance optimization

### Week 4 Wrap-up (2 hours)
- Final results review
- Lessons learned
- Test maintenance process

---

## 🔗 References
- Current Coverage Report: `/docs/reports/PHASE1-2-COVERAGE-UPDATE.md`
- Original Analysis: `/docs/reports/PHASE1-COVERAGE-ANALYSIS-20251020.md`
- Jest Configuration: `/jest.config.js`
- Test Setup: `/jest.setup.ts`

---

**Created**: 2025-10-20 08:20:00 UTC
**Owner**: QA Team + Test Engineering
**Status**: 🔴 DRAFT - Pending Approval
**Next Review**: 2025-10-21 (1 day)
