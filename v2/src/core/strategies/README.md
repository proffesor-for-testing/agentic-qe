# Agent Strategies

Composable strategy interfaces for BaseAgent decomposition (Phase 2).

## Overview

This module provides pluggable strategy interfaces that allow BaseAgent functionality to be composed from independent, swappable components. This reduces BaseAgent from 1,452 LOC to <300 LOC while maintaining full backward compatibility.

## Strategy Interfaces

### 1. AgentLifecycleStrategy

Handles agent initialization, state transitions, and cleanup.

```typescript
interface AgentLifecycleStrategy {
  initialize(config: LifecycleConfig): Promise<void>;
  getStatus(): AgentStatus;
  transitionTo(status: AgentStatus): Promise<void>;
  shutdown(): Promise<void>;
  onPreTask?(data: PreTaskData): Promise<void>;
  onPostTask?(data: PostTaskData): Promise<void>;
}
```

**Implementations:**
- `DefaultLifecycleStrategy` - Standard initialization flow
- `PooledLifecycleStrategy` - For agent pooling (reusable agents)
- `DistributedLifecycleStrategy` - For distributed deployments

### 2. AgentMemoryStrategy

Handles storage, retrieval, and persistence.

```typescript
interface AgentMemoryStrategy {
  store(key: string, value: unknown, options?: MemoryOptions): Promise<void>;
  retrieve<T>(key: string): Promise<T | undefined>;
  storeShared(agentType: AgentType, key: string, value: unknown): Promise<void>;
  retrieveShared<T>(agentType: AgentType, key: string): Promise<T | undefined>;
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

**Implementations:**
- `DefaultMemoryStrategy` - SQLite-backed storage
- `CachedMemoryStrategy` - Binary cache layer (Phase 1)
- `DistributedMemoryStrategy` - S3/Redis backend (Phase 4)

### 3. AgentLearningStrategy

Handles pattern learning, strategy recommendation, and performance tracking.

```typescript
interface AgentLearningStrategy {
  storePattern(pattern: LearnedPattern): Promise<void>;
  getPatterns(query: PatternQuery): Promise<LearnedPattern[]>;
  recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null>;
  recordExecution(event: ExecutionEvent): Promise<void>;
  train(iterations?: number): Promise<TrainingResult>;
  initialize(): Promise<void>;
  getStatus(): LearningStatus;
}
```

**Implementations:**
- `DefaultLearningStrategy` - PerformanceTracker + LearningEngine
- `AcceleratedLearningStrategy` - Binary cache for patterns
- `DisabledLearningStrategy` - No-op for benchmarks/testing

### 4. AgentCoordinationStrategy

Handles events, messages, and swarm coordination.

```typescript
interface AgentCoordinationStrategy {
  emit(event: QEEvent): void;
  on<T>(eventType: string, handler: EventHandler<T>): void;
  broadcast(message: AgentMessage): Promise<void>;
  send(targetAgent: AgentId, message: AgentMessage): Promise<void>;
  joinSwarm?(swarmId: string): Promise<void>;
  initialize(eventBus: EventEmitter, agentId: AgentId): void;
  shutdown(): Promise<void>;
}
```

**Implementations:**
- `DefaultCoordinationStrategy` - EventEmitter-based
- `SwarmCoordinationStrategy` - Claude Flow integration
- `DistributedCoordinationStrategy` - QUIC-based (Phase 4)

## Usage

### Basic Usage (Default Strategies)

```typescript
import { BaseAgent } from '../agents/BaseAgent';

// Default strategies are injected automatically
const agent = new TestGeneratorAgent({
  type: AgentType.TEST_GENERATOR,
  capabilities: [...],
  context: { projectPath: '/my/project' },
  memoryStore,
  eventBus,
});
```

### Custom Strategy Injection

```typescript
import { BaseAgent } from '../agents/BaseAgent';
import { CachedMemoryStrategy } from './strategies';
import { SwarmCoordinationStrategy } from './strategies';

const agent = new TestGeneratorAgent({
  type: AgentType.TEST_GENERATOR,
  capabilities: [...],
  context: { projectPath: '/my/project' },
  memoryStore,
  eventBus,
  // Custom strategies
  memoryStrategy: new CachedMemoryStrategy({ cachePath: '.cache' }),
  coordinationStrategy: new SwarmCoordinationStrategy({ topology: 'mesh' }),
});
```

### Creating Custom Strategies

```typescript
import type { AgentMemoryStrategy, MemoryOptions } from './strategies';

class RedisMemoryStrategy implements AgentMemoryStrategy {
  private redis: Redis;

  async store(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    const serialized = JSON.stringify(value);
    if (options?.ttl) {
      await this.redis.setex(key, options.ttl / 1000, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async retrieve<T>(key: string): Promise<T | undefined> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : undefined;
  }

  // ... implement remaining interface methods
}
```

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                      BaseAgent (<300 LOC)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │  Lifecycle  │ │   Memory    │ │  Learning   │ │  Coord  │  │
│  │  Strategy   │ │  Strategy   │ │  Strategy   │ │ Strategy│  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └────┬────┘  │
└─────────┼───────────────┼───────────────┼─────────────┼───────┘
          │               │               │             │
          ▼               ▼               ▼             ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐ ┌───────────┐
    │ Lifecycle │   │  Memory   │   │ Learning  │ │   Agent   │
    │  Manager  │   │  Service  │   │  Engine   │ │Coordinator│
    └───────────┘   └───────────┘   └───────────┘ └───────────┘
          │               │               │             │
          └───────────────┼───────────────┼─────────────┘
                          ▼               ▼
                    ┌───────────────────────────┐
                    │     SwarmMemoryManager    │
                    │     (SQLite + Cache)      │
                    └───────────────────────────┘
```

## Migration Guide

### From BaseAgent v1 to v2

1. **No changes required** for basic usage - default strategies maintain compatibility
2. **Optional**: Inject custom strategies for performance optimization
3. **Optional**: Implement custom strategies for specialized use cases

### Backward Compatibility

All existing method signatures are preserved:
- `agent.initialize()` - Still works
- `agent.storeMemory(key, value)` - Still works
- `agent.recommendStrategy(state)` - Still works
- `agent.broadcastMessage(type, payload)` - Still works

## Files

| File | Description |
|------|-------------|
| `AgentLifecycleStrategy.ts` | Lifecycle strategy interface |
| `AgentMemoryStrategy.ts` | Memory strategy interface |
| `AgentLearningStrategy.ts` | Learning strategy interface |
| `AgentCoordinationStrategy.ts` | Coordination strategy interface |
| `DefaultLifecycleStrategy.ts` | Default lifecycle implementation |
| `DefaultMemoryStrategy.ts` | Default memory implementation |
| `DefaultLearningStrategy.ts` | Default learning implementation |
| `DefaultCoordinationStrategy.ts` | Default coordination implementation |
| `index.ts` | Unified exports |

## Related Documentation

- [Layered Design v2](../../docs/architecture/layered-design-v2.md)
- [Migration Plan](../../docs/architecture/migration-plan.md)
- [BaseAgent Refactoring](../../docs/architecture/baseagent-refactoring.md)
