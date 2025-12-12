# Strategy Migration Plan

**Version**: 1.0.0
**Date**: 2025-12-12
**Phase**: Phase 2 (B1.2)
**Status**: In Progress

---

## Overview

This document provides a detailed migration plan for integrating the strategy pattern into BaseAgent, reducing it from 1,452 LOC to <300 LOC.

---

## Current State

### BaseAgent (1,452 LOC)

The current BaseAgent contains inline implementations for:
- Lifecycle management (350 lines)
- Memory operations (250 lines)
- Learning engine integration (300 lines)
- Event coordination (200 lines)
- Task execution (150 lines)
- Configuration (100 lines)
- Hooks (100 lines)

### Strategy Files Created

All strategy interfaces and default implementations exist in `src/core/strategies/`:

| File | Status | LOC |
|------|--------|-----|
| `AgentLifecycleStrategy.ts` | Complete | ~90 |
| `AgentMemoryStrategy.ts` | Complete | ~110 |
| `AgentLearningStrategy.ts` | Complete | ~130 |
| `AgentCoordinationStrategy.ts` | Complete | ~100 |
| `DefaultLifecycleStrategy.ts` | Complete | ~200 |
| `DefaultMemoryStrategy.ts` | Complete | ~180 |
| `DefaultLearningStrategy.ts` | Complete | ~220 |
| `DefaultCoordinationStrategy.ts` | Complete | ~160 |
| `DistributedMemoryStrategy.ts` | Stub | ~50 |
| `AcceleratedLearningStrategy.ts` | Stub | ~50 |

---

## Migration Steps

### Step 1: Add Strategy Properties to BaseAgent

**File**: `src/agents/BaseAgent.ts`

```typescript
// Add after line ~50 (after existing properties)
protected readonly lifecycleStrategy: AgentLifecycleStrategy;
protected readonly memoryStrategy: AgentMemoryStrategy;
protected readonly learningStrategy: AgentLearningStrategy;
protected readonly coordinationStrategy: AgentCoordinationStrategy;
```

**Estimated effort**: 10 lines

### Step 2: Modify Constructor to Accept Strategies

**File**: `src/agents/BaseAgent.ts`

```typescript
// In constructor, add strategy injection
constructor(config: AgentConfig) {
  super();

  // ... existing identity setup ...

  // Inject strategies with defaults
  this.lifecycleStrategy = config.lifecycleStrategy
    ?? new DefaultLifecycleStrategy();
  this.memoryStrategy = config.memoryStrategy
    ?? new DefaultMemoryStrategy(this.memoryStore);
  this.learningStrategy = config.learningStrategy
    ?? new DefaultLearningStrategy(this.learningEngine, this.performanceTracker);
  this.coordinationStrategy = config.coordinationStrategy
    ?? new DefaultCoordinationStrategy();
}
```

**Estimated effort**: 20 lines

### Step 3: Update AgentConfig Interface

**File**: `src/types/agent.types.ts`

```typescript
export interface AgentConfig {
  // ... existing properties ...

  // Optional strategy overrides
  lifecycleStrategy?: AgentLifecycleStrategy;
  memoryStrategy?: AgentMemoryStrategy;
  learningStrategy?: AgentLearningStrategy;
  coordinationStrategy?: AgentCoordinationStrategy;
}
```

**Estimated effort**: 10 lines

### Step 4: Delegate Lifecycle Methods

Replace inline lifecycle code with strategy delegation:

```typescript
// Before (inline)
async initialize(): Promise<void> {
  this.status = AgentStatus.INITIALIZING;
  await this.setupComponents();
  await this.loadKnowledge();
  // ... 50+ more lines
}

// After (delegated)
async initialize(): Promise<void> {
  await this.lifecycleStrategy.initialize({
    agentId: this.agentId,
    type: this.type,
    capabilities: this.capabilities,
  });
  await this.initializeComponents(); // Abstract - agent-specific
}
```

**Lines removed**: ~350
**Lines added**: ~20

### Step 5: Delegate Memory Methods

```typescript
// Before (inline)
async storeInMemory(key: string, value: unknown): Promise<void> {
  // 30+ lines of memory management
}

// After (delegated)
async storeInMemory(key: string, value: unknown): Promise<void> {
  return this.memoryStrategy.store(key, value);
}
```

**Lines removed**: ~250
**Lines added**: ~30

### Step 6: Delegate Learning Methods

```typescript
// Before (inline)
async recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null> {
  // 40+ lines of learning logic
}

// After (delegated)
async recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null> {
  return this.learningStrategy.recommendStrategy(taskState);
}
```

**Lines removed**: ~300
**Lines added**: ~20

### Step 7: Delegate Coordination Methods

```typescript
// Before (inline)
emit(event: QEEvent): void {
  // 25+ lines of event handling
}

// After (delegated)
emit(event: QEEvent): void {
  this.coordinationStrategy.emit(event);
}
```

**Lines removed**: ~200
**Lines added**: ~15

---

## File Modifications Summary

### BaseAgent.ts Changes

| Section | Before (LOC) | After (LOC) | Change |
|---------|--------------|-------------|--------|
| Imports | 50 | 60 | +10 |
| Properties | 40 | 50 | +10 |
| Constructor | 80 | 40 | -40 |
| Lifecycle | 350 | 20 | -330 |
| Memory | 250 | 30 | -220 |
| Learning | 300 | 20 | -280 |
| Coordination | 200 | 15 | -185 |
| Task execution | 150 | 100 | -50 |
| Capabilities | 32 | 32 | 0 |
| **Total** | **1,452** | **~270** | **-1,182** |

---

## Testing Strategy

### Unit Tests

1. Test each strategy in isolation (existing: 75 tests)
2. Test BaseAgent with mock strategies
3. Test BaseAgent with default strategies

### Integration Tests

1. Test each of 19 agents with new architecture
2. Verify backward compatibility
3. Performance benchmarks before/after

### Regression Tests

Run full test suite after each migration step:

```bash
npm run test:unit
npm run test:integration
```

---

## Rollback Plan

If issues are discovered:

1. **Feature flag**: Add `USE_STRATEGY_PATTERN` environment variable
2. **Conditional code**:
   ```typescript
   if (process.env.USE_STRATEGY_PATTERN) {
     return this.lifecycleStrategy.initialize(config);
   } else {
     // Original inline code
   }
   ```
3. **Gradual rollout**: Enable for one agent at a time

---

## Timeline

| Step | Description | Estimated Effort |
|------|-------------|------------------|
| 1 | Add strategy properties | 30 min |
| 2 | Modify constructor | 1 hour |
| 3 | Update AgentConfig | 30 min |
| 4 | Delegate lifecycle | 2 hours |
| 5 | Delegate memory | 1.5 hours |
| 6 | Delegate learning | 1.5 hours |
| 7 | Delegate coordination | 1 hour |
| 8 | Run tests, fix issues | 2 hours |
| **Total** | | **~10 hours** |

---

## Success Criteria

- [ ] BaseAgent < 300 LOC
- [ ] All 19 agents functional
- [ ] No breaking API changes
- [ ] All existing tests pass
- [ ] Performance within 5% of current

---

## Dependencies

### Required Before Migration

1. Strategy interfaces complete (Done)
2. Default implementations complete (Done)
3. Strategy tests passing (Done - 75 tests)
4. Platform operations integrated (Pending)

### Post-Migration Tasks

1. Update agent documentation
2. Create migration examples for custom agents
3. Update CLAUDE.md with strategy patterns

---

## Next Steps

1. Read current BaseAgent.ts to understand exact structure
2. Create feature branch: `feature/strategy-integration`
3. Begin Step 1 implementation
4. Run tests after each step
