# v3-qe-fleet-coordination

## Purpose
Guide the implementation of hierarchical multi-agent coordination for the AQE v3 fleet of 21 specialized QE agents.

## Activation
- When orchestrating multiple QE agents
- When implementing agent communication protocols
- When building coordination workflows
- When managing agent lifecycle

## Fleet Architecture

### 1. Hierarchical Coordination Structure

```typescript
// v3/src/coordination/QEFleetCoordinator.ts
export class QEFleetCoordinator {
  private readonly queen: QueenCoordinator;
  private readonly groups: Map<string, AgentGroup>;
  private readonly eventBus: DomainEventBus;
  private readonly memory: CrossAgentMemory;

  constructor(config: FleetConfig) {
    this.queen = new QueenCoordinator(config);
    this.groups = new Map();
    this.eventBus = new DomainEventBus();
    this.memory = new CrossAgentMemory(config.memory);

    this.initializeGroups();
  }

  private initializeGroups(): void {
    const groupConfigs: GroupConfig[] = [
      {
        name: 'test-generation',
        agents: ['v3-qe-test-architect', 'v3-qe-tdd-specialist', 'v3-qe-integration-tester', 'v3-qe-property-tester'],
        domain: 'test-generation'
      },
      {
        name: 'quality-gates',
        agents: ['v3-qe-quality-gate', 'v3-qe-deployment-advisor', 'v3-qe-risk-assessor'],
        domain: 'quality-assessment'
      },
      {
        name: 'intelligence',
        agents: ['v3-qe-defect-predictor', 'v3-qe-pattern-learner', 'v3-qe-root-cause-analyzer'],
        domain: 'defect-intelligence'
      },
      {
        name: 'execution',
        agents: ['v3-qe-parallel-executor', 'v3-qe-flaky-hunter', 'v3-qe-retry-handler'],
        domain: 'test-execution'
      },
      {
        name: 'coverage',
        agents: ['v3-qe-coverage-specialist', 'v3-qe-gap-detector', 'v3-qe-risk-scorer'],
        domain: 'coverage-analysis'
      },
      {
        name: 'learning',
        agents: ['v3-qe-learning-coordinator', 'v3-qe-transfer-specialist', 'v3-qe-metrics-optimizer', 'v3-qe-knowledge-manager'],
        domain: 'learning-optimization'
      }
    ];

    for (const config of groupConfigs) {
      this.groups.set(config.name, new AgentGroup(config));
    }
  }

  // Queen delegates to appropriate group
  async orchestrate(task: QETask): Promise<TaskResult> {
    // 1. Queen analyzes task
    const plan = await this.queen.planExecution(task);

    // 2. Share context with relevant agents
    await this.memory.shareContext('queen', plan.targetAgents, {
      taskId: task.id,
      requirements: task.requirements,
      context: task.context
    });

    // 3. Execute through agent groups
    const results = await this.executeGroupTasks(plan);

    // 4. Consolidate and return
    return this.queen.consolidateResults(results);
  }

  private async executeGroupTasks(plan: ExecutionPlan): Promise<GroupResult[]> {
    const groupTasks = this.groupTasksByDomain(plan.tasks);
    const results: GroupResult[] = [];

    // Parallel group execution
    await Promise.all(
      Array.from(groupTasks.entries()).map(async ([groupName, tasks]) => {
        const group = this.groups.get(groupName)!;
        const result = await group.execute(tasks);
        results.push(result);
      })
    );

    return results;
  }
}
```

### 2. Agent Group Implementation

```typescript
// v3/src/coordination/AgentGroup.ts
export class AgentGroup {
  private readonly name: string;
  private readonly agents: Map<string, QEAgent>;
  private readonly loadBalancer: GroupLoadBalancer;

  constructor(config: GroupConfig) {
    this.name = config.name;
    this.agents = new Map();
    this.loadBalancer = new GroupLoadBalancer();

    for (const agentId of config.agents) {
      this.agents.set(agentId, this.createAgent(agentId));
    }
  }

  async execute(tasks: GroupTask[]): Promise<GroupResult> {
    const assignments = this.loadBalancer.assign(tasks, Array.from(this.agents.values()));
    const results: AgentResult[] = [];

    // Execute with coordination
    await Promise.all(
      assignments.map(async (assignment) => {
        const agent = this.agents.get(assignment.agentId)!;
        const result = await agent.execute(assignment.task);
        results.push(result);

        // Share learnings within group
        if (result.learnings) {
          await this.shareWithinGroup(agent.id, result.learnings);
        }
      })
    );

    return {
      group: this.name,
      results,
      aggregatedMetrics: this.aggregateMetrics(results)
    };
  }

  private async shareWithinGroup(sourceAgent: string, learnings: Learning[]): Promise<void> {
    const targetAgents = Array.from(this.agents.keys()).filter(a => a !== sourceAgent);
    for (const learning of learnings) {
      await this.memory.shareContext(sourceAgent, targetAgents, learning);
    }
  }
}
```

### 3. Communication Protocols

```typescript
// v3/src/coordination/protocols/QEProtocols.ts
export const QE_PROTOCOLS = {
  // Morning sync - daily coordination
  MORNING_SYNC: {
    name: 'morning-sync',
    participants: 'all',
    schedule: '0 9 * * *',
    steps: [
      { agent: 'v3-qe-queen', action: 'gather-status' },
      { agent: 'v3-qe-coverage-specialist', action: 'report-coverage' },
      { agent: 'v3-qe-quality-gate', action: 'report-quality' },
      { agent: 'v3-qe-defect-predictor', action: 'report-risks' },
      { agent: 'v3-qe-queen', action: 'prioritize-day' }
    ]
  },

  // Quality gate - pre-release evaluation
  QUALITY_GATE: {
    name: 'quality-gate',
    participants: ['v3-qe-queen', 'v3-qe-quality-gate', 'v3-qe-coverage-specialist', 'v3-qe-risk-assessor'],
    trigger: 'release-candidate',
    steps: [
      { agent: 'v3-qe-coverage-specialist', action: 'analyze-coverage', timeout: 60000 },
      { agent: 'v3-qe-quality-gate', action: 'evaluate-criteria', timeout: 30000 },
      { agent: 'v3-qe-risk-assessor', action: 'assess-risks', timeout: 45000 },
      { agent: 'v3-qe-queen', action: 'make-decision', timeout: 10000 }
    ]
  },

  // Learning consolidation - end of sprint
  LEARNING_CONSOLIDATION: {
    name: 'learning-consolidation',
    participants: ['v3-qe-learning-coordinator', 'v3-qe-transfer-specialist', 'v3-qe-pattern-learner'],
    schedule: '0 18 * * 5', // Friday 6pm
    steps: [
      { agent: 'v3-qe-pattern-learner', action: 'extract-patterns' },
      { agent: 'v3-qe-transfer-specialist', action: 'identify-transfers' },
      { agent: 'v3-qe-learning-coordinator', action: 'consolidate-knowledge' }
    ]
  },

  // Defect investigation - triggered on failure
  DEFECT_INVESTIGATION: {
    name: 'defect-investigation',
    participants: ['v3-qe-defect-predictor', 'v3-qe-root-cause-analyzer', 'v3-qe-flaky-hunter'],
    trigger: 'test-failure',
    steps: [
      { agent: 'v3-qe-flaky-hunter', action: 'check-flakiness' },
      { agent: 'v3-qe-root-cause-analyzer', action: 'analyze-root-cause' },
      { agent: 'v3-qe-defect-predictor', action: 'predict-related-failures' }
    ]
  }
};

// Protocol executor
export class ProtocolExecutor {
  async execute(protocol: Protocol, context: ProtocolContext): Promise<ProtocolResult> {
    const results: StepResult[] = [];

    for (const step of protocol.steps) {
      const agent = await this.getAgent(step.agent);
      const result = await this.executeStep(agent, step, context, step.timeout);
      results.push(result);

      // Pass result to next step
      context.previousResults.push(result);
    }

    return { protocol: protocol.name, results };
  }
}
```

### 4. Task Queue with Priority

```typescript
// v3/src/coordination/TaskQueue.ts
export class QETaskQueue {
  private readonly queues: Map<Priority, Task[]> = new Map();
  private readonly agentAssignments: Map<string, Task[]> = new Map();

  constructor() {
    // Initialize priority queues
    for (const priority of ['critical', 'high', 'medium', 'low']) {
      this.queues.set(priority as Priority, []);
    }
  }

  enqueue(task: Task): void {
    const queue = this.queues.get(task.priority)!;
    queue.push(task);
    this.eventBus.publish(new TaskEnqueued(task));
  }

  // Dequeue highest priority task for agent
  dequeue(agentId: string): Task | null {
    for (const priority of ['critical', 'high', 'medium', 'low']) {
      const queue = this.queues.get(priority as Priority)!;
      const task = queue.find(t => this.canAgentHandle(agentId, t));

      if (task) {
        queue.splice(queue.indexOf(task), 1);
        this.assignToAgent(agentId, task);
        return task;
      }
    }
    return null;
  }

  // Work stealing
  stealFrom(fromAgent: string, toAgent: string): Task | null {
    const fromQueue = this.agentAssignments.get(fromAgent) || [];
    if (fromQueue.length > 1) {
      const task = fromQueue.pop()!;
      this.assignToAgent(toAgent, task);
      return task;
    }
    return null;
  }
}
```

### 5. Agent State Management

```typescript
// v3/src/coordination/AgentStateManager.ts
export class AgentStateManager {
  private readonly states: Map<string, AgentState> = new Map();
  private readonly memory: QEAgentDB;

  async getState(agentId: string): Promise<AgentState> {
    // Check memory cache
    const cached = this.states.get(agentId);
    if (cached) return cached;

    // Load from persistent storage
    const persisted = await this.memory.get(`agent:${agentId}:state`);
    if (persisted) {
      this.states.set(agentId, persisted);
      return persisted;
    }

    // Create default state
    return this.createDefaultState(agentId);
  }

  async updateState(agentId: string, update: Partial<AgentState>): Promise<void> {
    const current = await this.getState(agentId);
    const updated = { ...current, ...update, lastUpdated: new Date() };

    this.states.set(agentId, updated);
    await this.memory.store({
      id: `agent:${agentId}:state`,
      index: 'coordination',
      data: updated
    });

    this.eventBus.publish(new AgentStateUpdated(agentId, updated));
  }

  async getAllActiveAgents(): Promise<AgentState[]> {
    const results = await this.memory.search('active', {
      index: 'coordination',
      filter: { 'data.status': 'active' }
    });
    return results.map(r => r.data);
  }
}

export interface AgentState {
  agentId: string;
  status: 'idle' | 'busy' | 'error' | 'inactive';
  currentTask: string | null;
  completedTasks: number;
  errorCount: number;
  lastUpdated: Date;
  metrics: AgentMetrics;
}
```

### 6. Event-Driven Coordination

```typescript
// v3/src/coordination/events/CoordinationEvents.ts
export class CoordinationEventBus {
  private readonly handlers: Map<string, EventHandler[]> = new Map();

  // Domain events for coordination
  readonly EVENTS = {
    TASK_ASSIGNED: 'coordination.task.assigned',
    TASK_COMPLETED: 'coordination.task.completed',
    TASK_FAILED: 'coordination.task.failed',
    AGENT_IDLE: 'coordination.agent.idle',
    AGENT_BUSY: 'coordination.agent.busy',
    PROTOCOL_STARTED: 'coordination.protocol.started',
    PROTOCOL_COMPLETED: 'coordination.protocol.completed',
    KNOWLEDGE_SHARED: 'coordination.knowledge.shared'
  };

  subscribe(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    await Promise.all(handlers.map(h => h(event)));

    // Persist event for replay
    await this.memory.store({
      id: `event:${event.id}`,
      index: 'coordination',
      data: event,
      ttl: 86400 * 7 // 7 days
    });
  }
}
```

## Fleet Topology

```
                    ┌─────────────────┐
                    │  Queen Coord.   │
                    │   (v3-queen)    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│Test Generation│   │Quality Gates  │   │ Intelligence  │
│   Group (4)   │   │   Group (3)   │   │   Group (3)   │
└───────────────┘   └───────────────┘   └───────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Execution    │   │   Coverage    │   │   Learning    │
│   Group (3)   │   │   Group (3)   │   │   Group (4)   │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Implementation Checklist

- [ ] Implement QEFleetCoordinator
- [ ] Create AgentGroup class
- [ ] Define communication protocols
- [ ] Build priority task queue
- [ ] Add agent state management
- [ ] Implement event-driven coordination
- [ ] Add work stealing algorithm
- [ ] Write coordination tests

## Related Skills
- v3-qe-core-implementation - Domain logic
- v3-qe-memory-system - Cross-agent memory
- v3-qe-mcp - MCP tool integration
