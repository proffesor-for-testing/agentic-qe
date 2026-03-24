---
name: v3-core-implementation
description: "Implement core TypeScript modules for claude-flow v3 using DDD bounded contexts, clean architecture, dependency injection, and comprehensive testing. Scaffold domains, entities, repositories, and use cases. Use when building v3 core domain logic or setting up DDD architecture."
---

# V3 Core Implementation

Implements core TypeScript modules for claude-flow v3 following Domain-Driven Design with clean architecture, dependency injection, and comprehensive test coverage.

## Quick Start

```bash
Task("Core foundation", "Set up DDD domain structure and base classes", "core-implementer")
Task("Task domain", "Implement task management domain", "core-implementer")
Task("Session domain", "Implement session management domain", "core-implementer")
Task("Health domain", "Implement health monitoring domain", "core-implementer")
```

## Domain Structure

```
src/core/
├── kernel/                     # Microkernel pattern
│   ├── claude-flow-kernel.ts
│   ├── domain-registry.ts
│   └── plugin-loader.ts
├── domains/                    # DDD Bounded Contexts
│   ├── task-management/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── events/
│   ├── session-management/
│   ├── health-monitoring/
│   └── event-coordination/
├── shared/                     # Shared kernel
│   ├── domain/ (entity.ts, value-object.ts, aggregate-root.ts)
│   ├── infrastructure/ (event-bus.ts, dependency-container.ts)
│   └── types/ (common.ts, errors.ts, interfaces.ts)
└── application/                # Use cases, commands, queries
```

## Base Domain Classes

### Entity
```typescript
export abstract class Entity<T> {
  protected readonly _id: T;
  private _domainEvents: DomainEvent[] = [];

  constructor(id: T) { this._id = id; }
  get id(): T { return this._id; }

  protected addDomainEvent(event: DomainEvent): void { this._domainEvents.push(event); }
  public getUncommittedEvents(): DomainEvent[] { return this._domainEvents; }
  public markEventsAsCommitted(): void { this._domainEvents = []; }
}
```

### Value Object
```typescript
export abstract class ValueObject<T> {
  protected readonly props: T;
  constructor(props: T) { this.props = Object.freeze(props); }
  public equals(other?: ValueObject<T>): boolean {
    return other ? JSON.stringify(this.props) === JSON.stringify(other.props) : false;
  }
}
```

### Aggregate Root
```typescript
export abstract class AggregateRoot<T> extends Entity<T> {
  private _version: number = 0;
  public applyEvent(event: DomainEvent): void {
    this.addDomainEvent(event);
    this._version++;
  }
}
```

## Task Management Domain

```typescript
export class Task extends AggregateRoot<TaskId> {
  static create(description: string, priority: Priority): Task {
    return new Task({
      id: TaskId.create(), description, priority,
      status: TaskStatus.pending(), createdAt: new Date(), updatedAt: new Date()
    });
  }

  public assignTo(agentId: string): void {
    if (this.props.status.equals(TaskStatus.completed())) throw new Error('Cannot assign completed task');
    this.props.assignedAgentId = agentId;
    this.props.status = TaskStatus.assigned();
    this.applyEvent(new TaskAssignedEvent(this.id.value, agentId, this.props.priority));
  }

  public complete(result: TaskResult): void {
    if (!this.props.assignedAgentId) throw new Error('Cannot complete unassigned task');
    this.props.status = TaskStatus.completed();
    this.applyEvent(new TaskCompletedEvent(this.id.value, result, this.calculateDuration()));
  }
}
```

## Repository Pattern

```typescript
// Interface
export interface ITaskRepository {
  save(task: Task): Promise<void>;
  findById(id: TaskId): Promise<Task | null>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findPendingTasks(): Promise<Task[]>;
}

// SQLite Implementation
@Injectable()
export class SqliteTaskRepository implements ITaskRepository {
  async save(task: Task): Promise<void> {
    await this.db.run(`INSERT OR REPLACE INTO tasks (id, description, priority, status, assigned_agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [task.id.value, task.description, task.priority.value, task.status.value, task.assignedAgentId, task.createdAt.toISOString(), task.updatedAt.toISOString()]);
  }
}
```

## Use Case Implementation

```typescript
@Injectable()
export class AssignTaskUseCase {
  constructor(
    @Inject('TaskRepository') private taskRepo: ITaskRepository,
    @Inject('AgentRepository') private agentRepo: IAgentRepository,
    @Inject('DomainEventBus') private eventBus: DomainEventBus
  ) {}

  async execute(command: AssignTaskCommand): Promise<AssignTaskResult> {
    const task = await this.taskRepo.findById(command.taskId);
    if (!task) throw new TaskNotFoundError(command.taskId);

    const agent = await this.agentRepo.findById(command.agentId);
    if (!agent || !agent.canAcceptTask(task)) throw new AgentCannotAcceptTaskError();

    task.assignTo(command.agentId);
    agent.acceptTask(task.id);

    await Promise.all([this.taskRepo.save(task), this.agentRepo.save(agent)]);
    for (const event of [...task.getUncommittedEvents(), ...agent.getUncommittedEvents()]) {
      await this.eventBus.publish(event);
    }
    return AssignTaskResult.success({ taskId: task.id, agentId: command.agentId });
  }
}
```

## Domain Unit Tests

```typescript
describe('Task Entity', () => {
  it('should create task with pending status', () => {
    const task = Task.create('Test task', Priority.medium());
    expect(task.status.isPending()).toBe(true);
  });

  it('should assign to agent and emit event', () => {
    const task = Task.create('Test', Priority.medium());
    task.assignTo('agent-123');
    expect(task.status.isAssigned()).toBe(true);
    expect(task.getUncommittedEvents()).toHaveLength(1);
    expect(task.getUncommittedEvents()[0]).toBeInstanceOf(TaskAssignedEvent);
  });

  it('should not assign completed task', () => {
    const task = Task.create('Test', Priority.medium());
    task.assignTo('agent-123');
    task.complete(TaskResult.success('done'));
    expect(() => task.assignTo('agent-456')).toThrow('Cannot assign completed task');
  });
});
```

## Dependency Injection

```typescript
export class DependencyContainer {
  private setupBindings(): void {
    this.container.bind<ITaskRepository>(TYPES.TaskRepository).to(SqliteTaskRepository).inSingletonScope();
    this.container.bind<TaskSchedulingService>(TYPES.TaskSchedulingService).to(TaskSchedulingService).inSingletonScope();
    this.container.bind<AssignTaskUseCase>(TYPES.AssignTaskUseCase).to(AssignTaskUseCase).inSingletonScope();
    this.container.bind<DomainEventBus>(TYPES.DomainEventBus).to(InMemoryDomainEventBus).inSingletonScope();
  }
}
```

## Success Metrics

- [ ] Domain Isolation: 100% clean dependency boundaries
- [ ] Test Coverage: >90% for domain logic
- [ ] Type Safety: Strict TypeScript with zero `any` types
- [ ] Performance: <50ms average use case execution
- [ ] Memory: <100MB heap for core domains
