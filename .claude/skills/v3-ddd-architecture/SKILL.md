---
name: "v3-ddd-architecture"
description: "Design and implement Domain-Driven Design architecture for claude-flow v3: decompose god objects into bounded contexts, apply microkernel patterns, and enable modular testable code. Use when refactoring monoliths or designing domain boundaries."
---

# V3 DDD Architecture

Decompose god objects into bounded contexts with clean architecture, event-driven communication, and a microkernel plugin system.

## Quick Start

```bash
# Analyze current architecture and design DDD boundaries
Task("Architecture analysis", "Analyze current architecture and design DDD boundaries", "core-architect")

# Domain decomposition (parallel)
Task("Domain decomposition", "Break down orchestrator god object into domains", "core-architect")
Task("Context mapping", "Map bounded contexts and relationships", "core-architect")
```

## Problem: God Object

```
orchestrator.ts (1,440 lines)
├── Task management
├── Session management
├── Health monitoring
├── Lifecycle management
└── Event coordination
```

**Target:** 5 focused domains, each < 300 lines.

## Domain Boundaries

### 1. Task Management

```typescript
interface TaskManagementDomain {
  entities: { Task: TaskEntity; TaskQueue: TaskQueueEntity };
  valueObjects: { TaskId: TaskIdVO; TaskStatus: TaskStatusVO; Priority: PriorityVO };
  services: { TaskScheduler: TaskSchedulingService; TaskValidator: TaskValidationService };
  repository: ITaskRepository;
}
```

### 2. Session Management

```typescript
interface SessionManagementDomain {
  entities: { Session: SessionEntity; SessionState: SessionStateEntity };
  valueObjects: { SessionId: SessionIdVO; SessionStatus: SessionStatusVO };
  services: { SessionLifecycle: SessionLifecycleService; SessionPersistence: SessionPersistenceService };
  repository: ISessionRepository;
}
```

### 3. Health Monitoring

```typescript
interface HealthMonitoringDomain {
  entities: { HealthCheck: HealthCheckEntity; Metric: MetricEntity };
  valueObjects: { HealthStatus: HealthStatusVO; Threshold: ThresholdVO };
  services: { HealthCollector: HealthCollectionService; AlertManager: AlertManagementService };
  repository: IMetricsRepository;
}
```

## Microkernel Pattern

```typescript
export class ClaudeFlowKernel {
  private domains: Map<string, Domain> = new Map();

  async initialize(): Promise<void> {
    await this.loadDomain('task-management', new TaskManagementDomain());
    await this.loadDomain('session-management', new SessionManagementDomain());
    await this.loadDomain('health-monitoring', new HealthMonitoringDomain());
    this.setupDomainEventHandlers();
  }

  getDomain<T extends Domain>(name: string): T {
    const domain = this.domains.get(name);
    if (!domain) throw new DomainNotLoadedError(name);
    return domain as T;
  }
}
```

## Event-Driven Communication

```typescript
// Domain events flow between bounded contexts
export class TaskCompletedEvent extends DomainEvent {
  constructor(taskId: string, public readonly result: TaskResult, public readonly duration: number) {
    super(taskId);
  }
}

@EventHandler(TaskCompletedEvent)
export class TaskCompletedHandler {
  async handle(event: TaskCompletedEvent): Promise<void> {
    await this.metricsRepository.recordTaskCompletion(event.aggregateId, event.duration);
    await this.sessionService.markTaskCompleted(event.aggregateId, event.result);
  }
}
```

## Clean Architecture Layers

```
Presentation  → CLI, API, UI
Application   → Use Cases, Commands
Domain        → Entities, Services, Events (NO external deps)
Infrastructure → DB, MCP, External APIs
```

Dependency direction: Outside -> Inside.

## Migration Strategy

| Phase | Week | Action |
|-------|------|--------|
| 1 | 1-2 | Extract TaskManager and SessionManager into domains |
| 2 | 3 | Extract HealthMonitor and LifecycleManager |
| 3 | 4 | Wire up domain events, implement plugin system |

## Testing (London School TDD)

```typescript
describe('Task Entity', () => {
  it('should assign to agent and emit event', () => {
    const task = new TaskEntity(TaskId.create(), 'Test task');
    mockAgent.canAcceptTask.mockReturnValue(true);

    task.assignTo(mockAgent);

    expect(task.status.value).toBe('assigned');
    expect(task.getUncommittedEvents()[0]).toBeInstanceOf(TaskAssignedEvent);
  });
});
```

## Success Metrics

- God object eliminated: 1,440 lines -> 5 domains (< 300 lines each)
- 100% domain independence (bounded context isolation)
- Plugin architecture: core + optional modules
- Event-driven loose coupling between domains
- > 90% domain logic test coverage
