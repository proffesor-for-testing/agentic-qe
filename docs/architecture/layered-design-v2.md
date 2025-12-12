# Layered Architecture Design v2

**Version**: 2.0.0
**Date**: 2025-12-12
**Phase**: Phase 2 (B1.1)
**Target**: BaseAgent < 300 LOC

---

## Executive Summary

This document describes the layered architecture for Agentic QE Fleet, decomposing the 1,452-line BaseAgent into composable strategies and services. The goal is **5x LOC reduction** while maintaining full backward compatibility.

---

## Current State Analysis

### BaseAgent Complexity (1,452 LOC)

| Category | Lines | Percentage | Issues |
|----------|-------|------------|--------|
| Lifecycle management | ~350 | 24% | Mixed with initialization |
| Memory operations | ~250 | 17% | Coupled to SQLite |
| Learning engine | ~300 | 21% | Tightly integrated |
| Coordination/Events | ~200 | 14% | Event bus coupling |
| Task execution | ~150 | 10% | Core responsibility |
| Configuration | ~100 | 7% | Should be external |
| Hooks | ~100 | 7% | Could be strategy |

### Existing Service Classes

Already extracted (but not fully utilized):
- `AgentLifecycleManager` (8,725 bytes) - Lifecycle state machine
- `AgentCoordinator` (6,199 bytes) - Event coordination
- `AgentMemoryService` (10,477 bytes) - Memory operations

---

## Target Architecture

### 7-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 7: Application                      │
│  (Concrete Agents: TestGeneratorAgent, CoverageAgent, etc.) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 6: Agent Core                       │
│            BaseAgent (<300 LOC) - Composition Only          │
│  - Strategy injection                                        │
│  - Abstract task execution                                   │
│  - Minimal orchestration                                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Layer 5:    │    │   Layer 5:    │    │   Layer 5:    │
│   Lifecycle   │    │    Memory     │    │   Learning    │
│   Strategy    │    │   Strategy    │    │   Strategy    │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Layer 4: Coordination                      │
│          AgentCoordinationStrategy (Events, Messages)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: Services                         │
│  - AgentLifecycleManager (existing)                          │
│  - AgentMemoryService (existing)                             │
│  - AgentCoordinator (existing)                               │
│  - PerformanceTracker                                        │
│  - LearningEngine                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 2: Infrastructure                   │
│  - SwarmMemoryManager (SQLite, binary cache)                 │
│  - EventEmitter (Node.js)                                    │
│  - HookManager                                               │
│  - PatternStoreFactory (RuVector/AgentDB/fallback)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Layer 1: Platform                        │
│  - Node.js runtime                                           │
│  - Platform syscalls (clonefile, reflink)                    │
│  - Binary serialization (MessagePack)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Strategy Interfaces

### 1. AgentLifecycleStrategy

Handles agent initialization, state transitions, and cleanup.

```typescript
interface AgentLifecycleStrategy {
  // Initialization
  initialize(agent: BaseAgent, config: AgentConfig): Promise<void>;

  // State management
  getStatus(): AgentStatus;
  transitionTo(status: AgentStatus): Promise<void>;
  waitForStatus(status: AgentStatus, timeout: number): Promise<void>;

  // Cleanup
  shutdown(): Promise<void>;

  // Hooks
  onPreTask?(data: PreTaskData): Promise<void>;
  onPostTask?(data: PostTaskData): Promise<void>;
  onError?(error: Error): Promise<void>;
}
```

**Implementations**:
- `DefaultLifecycleStrategy` - Standard initialization flow
- `PooledLifecycleStrategy` - For agent pooling (Phase 3)
- `DistributedLifecycleStrategy` - For distributed agents (Phase 4)

### 2. AgentMemoryStrategy

Handles memory storage, retrieval, and persistence.

```typescript
interface AgentMemoryStrategy {
  // Storage
  store(key: string, value: any, options?: MemoryOptions): Promise<void>;
  retrieve(key: string): Promise<any>;
  delete(key: string): Promise<void>;

  // Shared memory
  storeShared(agentType: AgentType, key: string, value: any): Promise<void>;
  retrieveShared(agentType: AgentType, key: string): Promise<any>;

  // Bulk operations
  bulkStore(entries: MemoryEntry[]): Promise<void>;
  bulkRetrieve(keys: string[]): Promise<any[]>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

**Implementations**:
- `DefaultMemoryStrategy` - SQLite-backed storage
- `CachedMemoryStrategy` - Binary cache layer (Phase 1 integration)
- `DistributedMemoryStrategy` - S3/Redis backend (Phase 4)

### 3. AgentLearningStrategy

Handles pattern learning, strategy recommendation, and performance tracking.

```typescript
interface AgentLearningStrategy {
  // Pattern management
  storePattern(pattern: LearnedPattern): Promise<void>;
  getPatterns(query: PatternQuery): Promise<LearnedPattern[]>;

  // Strategy recommendation
  recommendStrategy(taskState: TaskState): Promise<StrategyRecommendation | null>;

  // Performance tracking
  recordExecution(event: ExecutionEvent): Promise<void>;
  getMetrics(): Promise<LearningMetrics>;

  // Training
  train(iterations?: number): Promise<TrainingResult>;

  // Lifecycle
  initialize(): Promise<void>;
  getStatus(): LearningStatus;
}
```

**Implementations**:
- `DefaultLearningStrategy` - PerformanceTracker + LearningEngine
- `AcceleratedLearningStrategy` - Binary cache for patterns
- `DisabledLearningStrategy` - No-op for benchmarks/testing

### 4. AgentCoordinationStrategy

Handles event emission, message passing, and swarm coordination.

```typescript
interface AgentCoordinationStrategy {
  // Events
  emit(event: QEEvent): void;
  on(eventType: string, handler: EventHandler): void;
  off(eventType: string, handler: EventHandler): void;

  // Messages
  broadcast(message: AgentMessage): Promise<void>;
  send(targetAgent: AgentId, message: AgentMessage): Promise<void>;

  // Swarm coordination
  joinSwarm?(swarmId: string): Promise<void>;
  leaveSwarm?(): Promise<void>;

  // Lifecycle
  initialize(eventBus: EventEmitter): void;
  shutdown(): Promise<void>;
}
```

**Implementations**:
- `DefaultCoordinationStrategy` - EventEmitter-based
- `SwarmCoordinationStrategy` - Claude Flow integration
- `DistributedCoordinationStrategy` - QUIC-based (Phase 4)

---

## BaseAgent Refactored (Target: <300 LOC)

```typescript
/**
 * BaseAgent v2 - Composition over inheritance
 *
 * Delegates all concerns to pluggable strategies:
 * - Lifecycle → AgentLifecycleStrategy
 * - Memory → AgentMemoryStrategy
 * - Learning → AgentLearningStrategy
 * - Coordination → AgentCoordinationStrategy
 */
export abstract class BaseAgent extends EventEmitter {
  // Identity (immutable)
  protected readonly agentId: AgentId;
  protected readonly capabilities: Map<string, AgentCapability>;
  protected readonly context: AgentContext;

  // Strategies (pluggable)
  protected readonly lifecycle: AgentLifecycleStrategy;
  protected readonly memory: AgentMemoryStrategy;
  protected readonly learning: AgentLearningStrategy;
  protected readonly coordination: AgentCoordinationStrategy;

  // Current state
  protected currentTask?: TaskAssignment;

  constructor(config: BaseAgentConfig) {
    super();
    this.agentId = this.createAgentId(config);
    this.capabilities = new Map(config.capabilities.map(c => [c.name, c]));
    this.context = config.context;

    // Inject strategies (with defaults)
    this.lifecycle = config.lifecycleStrategy ?? new DefaultLifecycleStrategy();
    this.memory = config.memoryStrategy ?? new DefaultMemoryStrategy(config.memoryStore);
    this.learning = config.learningStrategy ?? this.createLearningStrategy(config);
    this.coordination = config.coordinationStrategy ?? new DefaultCoordinationStrategy();
  }

  // === Lifecycle (delegated) ===
  async initialize(): Promise<void> {
    await this.lifecycle.initialize(this, this.context);
    await this.memory.initialize();
    await this.learning.initialize();
    this.coordination.initialize(this.eventBus);
    await this.initializeComponents(); // Abstract - agent-specific
  }

  async shutdown(): Promise<void> {
    await this.cleanup(); // Abstract - agent-specific
    await this.lifecycle.shutdown();
    await this.memory.close();
    this.coordination.shutdown();
  }

  getStatus() { return this.lifecycle.getStatus(); }

  // === Task Execution (core responsibility) ===
  async executeTask(assignment: TaskAssignment): Promise<any> {
    this.currentTask = assignment;
    await this.lifecycle.onPreTask?.(assignment.task);

    try {
      const result = await this.performTask(assignment.task); // Abstract
      await this.lifecycle.onPostTask?.({ task: assignment.task, result });
      await this.learning.recordExecution({ task: assignment.task, result, success: true });
      return result;
    } catch (error) {
      await this.lifecycle.onError?.(error);
      await this.learning.recordExecution({ task: assignment.task, error, success: false });
      throw error;
    } finally {
      this.currentTask = undefined;
    }
  }

  // === Memory (delegated) ===
  async storeMemory(key: string, value: any) {
    return this.memory.store(key, value);
  }
  async retrieveMemory(key: string) {
    return this.memory.retrieve(key);
  }

  // === Learning (delegated) ===
  async recommendStrategy(taskState: any) {
    return this.learning.recommendStrategy(taskState);
  }
  async getLearnedPatterns() {
    return this.learning.getPatterns({});
  }

  // === Coordination (delegated) ===
  async broadcastMessage(type: string, payload: any) {
    return this.coordination.broadcast({ type, payload, sender: this.agentId });
  }

  // === Abstract methods (agent-specific) ===
  protected abstract initializeComponents(): Promise<void>;
  protected abstract performTask(task: QETask): Promise<any>;
  protected abstract loadKnowledge(): Promise<void>;
  protected abstract cleanup(): Promise<void>;

  // === Capabilities (kept in BaseAgent) ===
  hasCapability(name: string): boolean { return this.capabilities.has(name); }
  getCapability(name: string) { return this.capabilities.get(name); }
  getCapabilities() { return Array.from(this.capabilities.values()); }

  // === Helper methods ===
  private createAgentId(config: BaseAgentConfig): AgentId { /* ~10 lines */ }
  private createLearningStrategy(config: BaseAgentConfig): AgentLearningStrategy { /* ~15 lines */ }
}
```

**Estimated LOC**: ~250-280 lines (vs current 1,452)

---

## Migration Plan

### Phase 2A: Create Interfaces (B1.2)
1. Create `src/core/strategies/` directory
2. Define all 4 strategy interfaces
3. Create default implementations that wrap existing code
4. No changes to BaseAgent yet

### Phase 2B: Refactor BaseAgent (B1.2)
1. Add strategy properties to BaseAgent
2. Inject default strategies in constructor
3. Delegate method calls to strategies
4. Remove inline implementations
5. Keep backward-compatible public API

### Phase 2C: Migrate Agents (B1.4)
1. Update all 19 agent subclasses
2. Run full test suite
3. Verify no breaking changes

### Backward Compatibility

- **Public API unchanged**: All existing method signatures preserved
- **Default strategies**: Agents work without configuration changes
- **Opt-in customization**: New strategy injection is optional
- **Gradual migration**: Agents can be migrated one at a time

---

## Success Criteria

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| BaseAgent LOC | 1,452 | <300 | Pending |
| Strategy interfaces | 0 | 4 | Pending |
| Test coverage | ~85% | >90% | Pending |
| Breaking changes | N/A | 0 | Pending |
| All agents functional | 19 | 19 | Pending |

---

## Files to Create/Modify

### New Files
- `src/core/strategies/AgentLifecycleStrategy.ts`
- `src/core/strategies/AgentMemoryStrategy.ts`
- `src/core/strategies/AgentLearningStrategy.ts`
- `src/core/strategies/AgentCoordinationStrategy.ts`
- `src/core/strategies/DefaultLifecycleStrategy.ts`
- `src/core/strategies/DefaultMemoryStrategy.ts`
- `src/core/strategies/DefaultLearningStrategy.ts`
- `src/core/strategies/DefaultCoordinationStrategy.ts`
- `src/core/strategies/index.ts`

### Modified Files
- `src/agents/BaseAgent.ts` (major refactor)
- `src/agents/*Agent.ts` (19 agents - minimal changes)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking agent subclasses | Medium | High | Comprehensive test suite |
| Performance regression | Low | Medium | Benchmark before/after |
| Strategy injection bugs | Medium | Medium | Default strategy fallbacks |
| Migration incomplete | Low | High | Gradual rollout, feature flags |

---

**Next Steps**: Proceed to B1.2 (BaseAgent Decomposition)
