# BaseAgent.ts Refactoring Plan

## Executive Summary

**Current State:**
- Cyclomatic Complexity: 136
- Lines of Code: 887
- Defect Risk: 57.4%
- Primary Issue: Violation of Single Responsibility Principle

**Target State:**
- Cyclomatic Complexity: < 80
- Modular architecture with clear separation of concerns
- Reduced defect risk to < 30%

## Complexity Analysis

### High-Risk Areas (Lines 76-157)
**Function2 - Constructor & Initialization:**
- Multiple responsibilities: ID generation, capability setup, memory adapter, hook manager, learning systems, AgentDB
- Deep nesting with conditional logic
- Complex configuration mapping

### Critical Code Smells

1. **God Object Anti-Pattern** (Lines 53-1102)
   - Handles: lifecycle, events, memory, coordination, learning, AgentDB, performance tracking
   - 40+ public/protected methods
   - 15+ instance variables

2. **Long Method** (Lines 189-241)
   - `executeTask()`: 52 lines with multiple responsibilities
   - Task validation, hook execution, broadcasting, metrics, error handling

3. **Deep Nesting** (Lines 583-677)
   - `onPreTask()`: 5 levels of nesting
   - Complex AgentDB integration with error handling
   - Multiple try-catch blocks

4. **Feature Envy** (Lines 699-834)
   - `onPostTask()`: Touches AgentDB, LearningEngine, PerformanceTracker
   - Should delegate to specialized components

## Refactoring Strategy - SOLID Principles

### 1. Single Responsibility Principle (SRP)

**Current Violations:**
- BaseAgent handles 8+ responsibilities
- Mixed concerns: lifecycle, coordination, learning, persistence

**Solution: Extract Classes**

#### 1.1 AgentLifecycleManager
```typescript
// src/agents/lifecycle/AgentLifecycleManager.ts
export class AgentLifecycleManager {
  private status: AgentStatus = AgentStatus.INITIALIZING;

  async initialize(hooks: LifecycleHooks): Promise<void>
  async terminate(hooks: LifecycleHooks): Promise<void>
  getStatus(): AgentStatus
  validateTransition(from: AgentStatus, to: AgentStatus): boolean
}
```

**Responsibilities:**
- Status management
- Lifecycle state transitions
- Hook coordination during lifecycle events

**Benefits:**
- Reduces BaseAgent complexity by ~150 LOC
- Testable in isolation
- Reusable across agent types

#### 1.2 AgentCoordinator
```typescript
// src/agents/coordination/AgentCoordinator.ts
export class AgentCoordinator {
  constructor(
    private eventBus: EventEmitter,
    private memoryStore: MemoryStore
  ) {}

  async broadcastMessage(message: AgentMessage): Promise<void>
  async registerEventHandler(handler: EventHandler): Promise<void>
  async emitEvent(event: QEEvent): void
  async reportStatus(agentId: string, status: any): Promise<void>
}
```

**Responsibilities:**
- Event emission and handling
- Message broadcasting
- Status reporting
- Inter-agent coordination

**Benefits:**
- Isolates coordination logic
- Easier to mock for testing
- Reduces BaseAgent by ~200 LOC

#### 1.3 AgentMemoryService
```typescript
// src/agents/memory/AgentMemoryService.ts
export class AgentMemoryService {
  constructor(
    private memoryStore: MemoryStore,
    private agentId: string
  ) {}

  async store(key: string, value: any, ttl?: number): Promise<void>
  async retrieve(key: string): Promise<any>
  async storeShared(key: string, value: any, ttl?: number): Promise<void>
  async retrieveShared(agentType: AgentType, key: string): Promise<any>
  async storeTaskResult(taskId: string, result: any): Promise<void>
  async restoreState(): Promise<any>
  async saveState(state: any): Promise<void>
}
```

**Responsibilities:**
- Namespaced memory operations
- Shared memory coordination
- State persistence
- Task result storage

**Benefits:**
- Clear memory access patterns
- Automatic namespacing
- Reduces BaseAgent by ~150 LOC

#### 1.4 TaskExecutor
```typescript
// src/agents/execution/TaskExecutor.ts
export class TaskExecutor {
  constructor(
    private hooks: TaskExecutionHooks,
    private metrics: PerformanceMetrics
  ) {}

  async execute(assignment: TaskAssignment): Promise<TaskResult>
  private validateAssignment(assignment: TaskAssignment): void
  private async executePreHooks(data: PreTaskData): Promise<void>
  private async executePostHooks(data: PostTaskData): Promise<void>
  private async handleError(data: TaskErrorData): Promise<void>
}
```

**Responsibilities:**
- Task execution flow (Template Method Pattern)
- Hook orchestration
- Error handling
- Validation

**Benefits:**
- Clear execution flow
- Testable task pipeline
- Reduces BaseAgent by ~200 LOC

#### 1.5 LearningIntegration
```typescript
// src/agents/learning/LearningIntegration.ts
export class LearningIntegration {
  constructor(
    private agentId: string,
    private performanceTracker?: PerformanceTracker,
    private learningEngine?: LearningEngine,
    private agentDB?: AgentDBManager
  ) {}

  async recordTaskExecution(task: QETask, result: any): Promise<void>
  async recordTaskError(task: QETask, error: Error): Promise<void>
  async getRecommendation(state: any): Promise<StrategyRecommendation | null>
  async getStatus(): Promise<LearningStatus>
  private async storePattern(pattern: Pattern): Promise<void>
  private async trainNeural(): Promise<void>
}
```

**Responsibilities:**
- PerformanceTracker integration
- LearningEngine coordination
- AgentDB pattern storage
- Neural training orchestration

**Benefits:**
- Isolates ML/learning logic
- Optional learning without complexity
- Reduces BaseAgent by ~250 LOC

### 2. Open/Closed Principle (OCP)

**Implementation: Strategy Pattern for Task Execution**

```typescript
// src/agents/execution/strategies/TaskExecutionStrategy.ts
export interface TaskExecutionStrategy {
  canHandle(task: QETask): boolean
  execute(task: QETask, context: ExecutionContext): Promise<any>
}

// Concrete strategies
export class StandardExecutionStrategy implements TaskExecutionStrategy
export class LearningEnabledStrategy implements TaskExecutionStrategy
export class AgentDBEnabledStrategy implements TaskExecutionStrategy
```

**Benefits:**
- Add new execution modes without modifying BaseAgent
- Compose strategies for complex behavior
- Easier testing of execution modes

### 3. Liskov Substitution Principle (LSP)

**Current Issue:**
- Subclasses must implement 4 abstract methods correctly
- No enforcement of pre/post conditions

**Solution:**
```typescript
// src/agents/BaseAgent.ts
export abstract class BaseAgent {
  // Template method with pre/post conditions
  public final async executeTask(assignment: TaskAssignment): Promise<any> {
    this.validatePreconditions(assignment);
    const result = await this.executor.execute(assignment);
    this.validatePostconditions(result);
    return result;
  }

  protected abstract performTask(task: QETask): Promise<any>;
  protected validatePreconditions(assignment: TaskAssignment): void;
  protected validatePostconditions(result: any): void;
}
```

### 4. Interface Segregation Principle (ISP)

**Solution: Small, Focused Interfaces**

```typescript
// src/agents/interfaces/AgentInterfaces.ts
export interface IAgentLifecycle {
  initialize(): Promise<void>
  terminate(): Promise<void>
  getStatus(): AgentStatus
}

export interface IAgentCoordination {
  broadcastMessage(message: AgentMessage): Promise<void>
  emitEvent(event: QEEvent): void
}

export interface IAgentMemory {
  storeMemory(key: string, value: any): Promise<void>
  retrieveMemory(key: string): Promise<any>
}

export interface IAgentLearning {
  recordExecution(task: QETask, result: any): Promise<void>
  getRecommendation(state: any): Promise<StrategyRecommendation | null>
}
```

### 5. Dependency Inversion Principle (DIP)

**Current Issue:**
- Concrete dependencies on SwarmMemoryManager, PerformanceTracker, etc.
- Hard to test and swap implementations

**Solution:**
```typescript
// src/agents/BaseAgent.ts
export abstract class BaseAgent {
  constructor(
    private lifecycle: IAgentLifecycle,
    private coordinator: IAgentCoordination,
    private memory: IAgentMemory,
    private learning?: IAgentLearning,
    private executor: ITaskExecutor
  ) {}
}
```

## Template Method Pattern for Execution Flow

```typescript
// src/agents/execution/TaskExecutor.ts
export class TaskExecutor {
  async execute(assignment: TaskAssignment): Promise<TaskResult> {
    // Template method - fixed algorithm, extensible steps
    try {
      this.validateAssignment(assignment);
      await this.executePreHooks(assignment);
      const result = await this.performTask(assignment.task);
      await this.executePostHooks(assignment, result);
      return this.createSuccessResult(result);
    } catch (error) {
      await this.handleError(assignment, error);
      return this.createErrorResult(error);
    }
  }

  // Hook methods - subclasses can override
  protected async executePreHooks(assignment: TaskAssignment): Promise<void> {
    // Default implementation
  }

  protected async executePostHooks(assignment: TaskAssignment, result: any): Promise<void> {
    // Default implementation
  }
}
```

## Guard Clauses & Early Returns

### Before (Lines 189-241):
```typescript
public async executeTask(assignment: TaskAssignment): Promise<any> {
  const startTime = Date.now();
  try {
    this.validateTaskAssignment(assignment);
    this.currentTask = assignment;
    this.status = AgentStatus.ACTIVE;
    // ... 40 more lines
  } catch (error) {
    // error handling
  }
}
```

### After:
```typescript
public async executeTask(assignment: TaskAssignment): Promise<any> {
  // Guard clauses at the top
  if (!assignment) throw new Error('Assignment required');
  if (!assignment.task) throw new Error('Task required');
  if (this.status === AgentStatus.TERMINATING) {
    throw new Error('Agent is terminating');
  }

  // Early return for duplicate task
  if (this.currentTask?.id === assignment.id) {
    return this.getCachedResult(assignment.id);
  }

  // Delegate to TaskExecutor
  return await this.executor.execute(assignment);
}
```

## Implementation Plan

### Phase 1: Extract Lifecycle Management (Week 1)
**Files to create:**
- `src/agents/lifecycle/AgentLifecycleManager.ts`
- `src/agents/lifecycle/AgentLifecycleManager.test.ts`

**Changes to BaseAgent:**
- Move lifecycle methods to manager
- Inject lifecycle manager in constructor
- Update tests

**Expected impact:**
- -150 LOC from BaseAgent.ts
- Complexity reduction: 20-30 points

### Phase 2: Extract Coordination Logic (Week 1)
**Files to create:**
- `src/agents/coordination/AgentCoordinator.ts`
- `src/agents/coordination/AgentCoordinator.test.ts`

**Changes to BaseAgent:**
- Move event/message methods to coordinator
- Inject coordinator in constructor
- Update event emission calls

**Expected impact:**
- -200 LOC from BaseAgent.ts
- Complexity reduction: 25-35 points

### Phase 3: Extract Memory Service (Week 2)
**Files to create:**
- `src/agents/memory/AgentMemoryService.ts`
- `src/agents/memory/AgentMemoryService.test.ts`

**Changes to BaseAgent:**
- Move memory methods to service
- Inject memory service in constructor
- Update memory access calls

**Expected impact:**
- -150 LOC from BaseAgent.ts
- Complexity reduction: 15-20 points

### Phase 4: Extract Task Execution (Week 2)
**Files to create:**
- `src/agents/execution/TaskExecutor.ts`
- `src/agents/execution/TaskExecutionContext.ts`
- `src/agents/execution/strategies/` (multiple strategy files)
- `src/agents/execution/TaskExecutor.test.ts`

**Changes to BaseAgent:**
- Move executeTask to TaskExecutor
- Implement Template Method Pattern
- Add guard clauses and early returns

**Expected impact:**
- -200 LOC from BaseAgent.ts
- Complexity reduction: 30-40 points

### Phase 5: Extract Learning Integration (Week 3)
**Files to create:**
- `src/agents/learning/LearningIntegration.ts`
- `src/agents/learning/LearningIntegration.test.ts`

**Changes to BaseAgent:**
- Move learning methods to integration
- Inject learning integration in constructor
- Update learning calls in hooks

**Expected impact:**
- -250 LOC from BaseAgent.ts
- Complexity reduction: 20-30 points

### Phase 6: Define Clean Interfaces (Week 3)
**Files to create:**
- `src/agents/interfaces/AgentInterfaces.ts`
- `src/agents/interfaces/README.md`

**Changes to BaseAgent:**
- Implement focused interfaces
- Update constructor to use interfaces
- Add interface documentation

**Expected impact:**
- Better testability
- Clearer contracts
- Foundation for future extensions

## Testing Strategy

### Unit Tests (Parallel with refactoring)
- Test each extracted class in isolation
- Mock dependencies using interfaces
- Aim for >90% coverage per class

### Integration Tests (After Phase 4)
- Test BaseAgent with real components
- Test BaseAgent with mocked components
- Verify lifecycle flows end-to-end

### Regression Tests (After Phase 6)
- Run full test suite
- Verify all existing tests pass
- Check performance benchmarks

## Metrics to Track

### Before Refactoring
- Cyclomatic Complexity: 136
- LOC: 887
- Methods: 40+
- Dependencies: 10+
- Defect Risk: 57.4%

### After Refactoring (Target)
- Cyclomatic Complexity: < 80
- LOC: < 300 (BaseAgent core)
- Methods: < 15 (BaseAgent)
- Dependencies: 5-7 (injected)
- Defect Risk: < 30%

### Additional Metrics
- Test Coverage: >85%
- Build Time: No degradation
- Memory Usage: No increase
- Agent Spawn Time: < 100ms

## Risk Mitigation

### Risks
1. **Breaking Changes**: Existing agents may fail
   - **Mitigation**: Feature flags, parallel implementations

2. **Performance Regression**: More objects = more overhead
   - **Mitigation**: Benchmark before/after, optimize hot paths

3. **Incomplete Migration**: Half-refactored code is worse
   - **Mitigation**: Phase-by-phase approach, automated tests

### Rollback Plan
- Keep original BaseAgent.ts as BaseAgent.legacy.ts
- Feature flag: `USE_REFACTORED_BASE_AGENT`
- Automated comparison tests between old/new

## Success Criteria

✅ Cyclomatic complexity < 80
✅ BaseAgent.ts < 300 LOC
✅ All existing tests pass
✅ No performance regression
✅ Test coverage maintained >85%
✅ Clear documentation for new architecture
✅ Migration guide for custom agents

## Timeline

- **Week 1**: Phases 1-2 (Lifecycle + Coordination)
- **Week 2**: Phases 3-4 (Memory + Execution)
- **Week 3**: Phases 5-6 (Learning + Interfaces)
- **Week 4**: Testing, documentation, migration guide

**Total Estimated Effort**: 3-4 weeks (1 developer)

## Files to Create

```
src/agents/
  lifecycle/
    AgentLifecycleManager.ts         # Phase 1
    AgentLifecycleManager.test.ts
  coordination/
    AgentCoordinator.ts              # Phase 2
    AgentCoordinator.test.ts
  memory/
    AgentMemoryService.ts            # Phase 3
    AgentMemoryService.test.ts
  execution/
    TaskExecutor.ts                  # Phase 4
    TaskExecutionContext.ts
    TaskResult.ts
    strategies/
      TaskExecutionStrategy.ts
      StandardExecutionStrategy.ts
      LearningEnabledStrategy.ts
    TaskExecutor.test.ts
  learning/
    LearningIntegration.ts           # Phase 5
    LearningIntegration.test.ts
  interfaces/
    AgentInterfaces.ts               # Phase 6
    README.md

docs/refactoring/
  base-agent-refactoring-plan.md     # This file
  migration-guide.md                 # Phase 6
  architecture-diagrams/             # Phase 6
```

## Appendix: Code Examples

### Example: Refactored BaseAgent Constructor

**Before (Lines 82-125):**
```typescript
constructor(config: BaseAgentConfig) {
  super();

  this.agentId = {
    id: config.id || this.generateAgentId(config.type),
    type: config.type,
    created: new Date()
  };

  this.capabilities = new Map(
    config.capabilities.map(cap => [cap.name, cap])
  );

  this.context = config.context;
  this.memoryStore = config.memoryStore;
  this.eventBus = config.eventBus;
  this.enableLearning = config.enableLearning ?? false;
  this.learningConfig = config.learningConfig;

  // ... 20+ more lines of configuration
}
```

**After:**
```typescript
constructor(
  private readonly lifecycle: AgentLifecycleManager,
  private readonly coordinator: AgentCoordinator,
  private readonly memory: AgentMemoryService,
  private readonly executor: TaskExecutor,
  private readonly learning?: LearningIntegration,
  protected readonly agentId: AgentId,
  protected readonly capabilities: Map<string, AgentCapability>
) {
  super();
  // Simple constructor - all complex logic delegated
}
```

### Example: Simplified executeTask

**Before (Lines 189-241):**
```typescript
public async executeTask(assignment: TaskAssignment): Promise<any> {
  const startTime = Date.now();

  try {
    this.validateTaskAssignment(assignment);
    this.currentTask = assignment;
    this.status = AgentStatus.ACTIVE;

    const preTaskData: PreTaskData = { assignment };
    await this.onPreTask(preTaskData);
    await this.executeHook('pre-task', preTaskData);

    await this.broadcastMessage('task-start', assignment);

    const result = await this.performTask(assignment.task);

    const postTaskData: PostTaskData = { assignment, result };
    await this.onPostTask(postTaskData);
    await this.executeHook('post-task', postTaskData);

    this.updatePerformanceMetrics(startTime, true);
    await this.storeTaskResult(assignment.id, result);

    this.currentTask = undefined;
    this.status = AgentStatus.IDLE;

    return result;
  } catch (error) {
    // ... 15 lines of error handling
  }
}
```

**After:**
```typescript
public async executeTask(assignment: TaskAssignment): Promise<any> {
  // Guard clauses
  if (!assignment?.task) throw new Error('Invalid assignment');
  if (this.lifecycle.getStatus() === AgentStatus.TERMINATING) {
    throw new Error('Agent is terminating');
  }

  // Delegate to executor (Template Method Pattern)
  return await this.executor.execute(assignment);
}
```

## Conclusion

This refactoring plan applies SOLID principles systematically to reduce BaseAgent complexity from 136 to <80. The modular architecture improves:

1. **Testability**: Each component tested in isolation
2. **Maintainability**: Clear responsibilities
3. **Extensibility**: Easy to add new features
4. **Reliability**: Reduced defect risk from 57.4% to <30%

The phased approach allows incremental progress with continuous validation, minimizing risk to the production codebase.
