# WorkflowOrchestrator

Adaptive workflow execution engine for QE agent swarms with priority-based scheduling, dependency resolution, and checkpointing.

## Features

- **Adaptive Strategy Selection**: Automatically chooses between parallel, sequential, or hybrid execution based on workload characteristics
- **Dependency Resolution**: Topological sorting with cycle detection ensures correct execution order
- **Priority-Based Queue**: Heap-based priority queue for efficient task scheduling
- **Checkpointing**: Save and restore workflow state for failure recovery
- **Event-Driven**: Real-time coordination through QEEventBus
- **Integration**: Works seamlessly with SwarmOptimizer and FleetManager

## Architecture

```
WorkflowOrchestrator
├── Workflow Management (register, list, retrieve)
├── Execution Engine (parallel, sequential, hybrid)
├── Dependency Resolution (topological sort, cycle detection)
├── Checkpointing (save/restore state)
├── Priority Queue (O(log n) enqueue/dequeue)
└── Event Coordination (lifecycle events)
```

## Usage

### Basic Setup

```typescript
import { WorkflowOrchestrator } from './core/orchestration';
import { SwarmMemoryManager } from './core/memory';
import { QEEventBus } from './core/events';

const memoryStore = new SwarmMemoryManager('./data/memory.db');
await memoryStore.initialize();

const eventBus = new QEEventBus(memoryStore);
const orchestrator = new WorkflowOrchestrator(memoryStore, eventBus);
await orchestrator.initialize();
```

### Register a Workflow

```typescript
import { Workflow } from './core/orchestration';

const workflow: Workflow = {
  id: 'test-suite-workflow',
  name: 'Full Test Suite Execution',
  description: 'Generate, execute, and analyze test suite',
  strategy: 'adaptive', // or 'parallel', 'sequential'
  checkpointEnabled: true,
  timeout: 600000, // 10 minutes
  metadata: {
    project: 'UserService',
    framework: 'jest'
  },
  steps: [
    {
      id: 'generate-tests',
      name: 'Generate Unit Tests',
      agentType: 'qe-test-generator',
      action: 'generate-unit-tests',
      inputs: {
        module: 'UserService',
        coverage: 'comprehensive'
      },
      dependencies: [],
      timeout: 120000,
      retries: 2,
      priority: 'high'
    },
    {
      id: 'execute-tests',
      name: 'Execute Test Suite',
      agentType: 'qe-test-executor',
      action: 'run-tests',
      inputs: {
        testFiles: '${generate-tests.output.files}'
      },
      dependencies: ['generate-tests'],
      timeout: 180000,
      retries: 1,
      priority: 'critical'
    },
    {
      id: 'analyze-coverage',
      name: 'Analyze Coverage',
      agentType: 'qe-coverage-analyzer',
      action: 'analyze-coverage',
      inputs: {
        coverageReport: '${execute-tests.output.coverage}'
      },
      dependencies: ['execute-tests'],
      timeout: 60000,
      retries: 1,
      priority: 'medium'
    }
  ]
};

orchestrator.registerWorkflow(workflow);
```

### Execute a Workflow

```typescript
// Execute with default inputs
const execution = await orchestrator.executeWorkflow('test-suite-workflow');

console.log(`Execution ID: ${execution.id}`);
console.log(`Status: ${execution.status}`);
console.log(`Duration: ${execution.metrics.totalDuration}ms`);
console.log(`Completed Steps: ${execution.completedSteps.length}`);
console.log(`Parallelization: ${execution.metrics.parallelization.toFixed(2)}x`);

// Execute with custom inputs
const execution2 = await orchestrator.executeWorkflow('test-suite-workflow', {
  module: 'PaymentService',
  coverage: 'basic'
});
```

### Pause and Resume

```typescript
// Execute workflow
const execution = await orchestrator.executeWorkflow('long-workflow');

// Pause execution (creates checkpoint)
await orchestrator.pauseExecution(execution.id);

// Resume later
await orchestrator.resumeExecution(execution.id);
```

### Checkpointing

```typescript
// Manual checkpoint creation
const checkpoint = await orchestrator.createCheckpoint(execution.id);

console.log('Checkpoint created:', {
  executionId: checkpoint.executionId,
  timestamp: checkpoint.timestamp,
  completedSteps: checkpoint.completedSteps.length
});

// Restore from checkpoint
const restored = await orchestrator.restoreFromCheckpoint(checkpoint);
```

### Monitor Execution

```typescript
// Subscribe to workflow events
eventBus.subscribe('workflow:started', (data) => {
  console.log(`Workflow started: ${data.workflowId}`);
});

eventBus.subscribe('workflow:step:completed', (data) => {
  console.log(`Step completed: ${data.stepId} in ${data.duration}ms`);
});

eventBus.subscribe('workflow:completed', (data) => {
  console.log(`Workflow completed in ${data.duration}ms`);
});

eventBus.subscribe('workflow:failed', (data) => {
  console.error(`Workflow failed: ${data.error}`);
});
```

### Get Execution Metrics

```typescript
const metrics = orchestrator.getExecutionMetrics(execution.id);

console.log('Execution Metrics:', {
  totalDuration: `${metrics.totalDuration}ms`,
  retryCount: metrics.retryCount,
  parallelization: `${metrics.parallelization.toFixed(2)}x`,
  stepDurations: Array.from(metrics.stepDurations.entries()).map(([id, duration]) => ({
    step: id,
    duration: `${duration}ms`
  }))
});
```

## Execution Strategies

### Parallel
Executes all steps concurrently. Best for independent tasks.

```typescript
strategy: 'parallel'
```

**Use when:**
- Steps have no dependencies
- High parallelizability (>70%)
- Resources available for concurrent execution

### Sequential
Executes steps one after another. Best for dependent tasks.

```typescript
strategy: 'sequential'
```

**Use when:**
- Steps have many dependencies
- Low parallelizability (<30%)
- Resource constraints require serialization

### Adaptive
Automatically selects optimal strategy based on workload analysis.

```typescript
strategy: 'adaptive'
```

**Use when:**
- Mixed dependency patterns
- Unsure of optimal strategy
- Want automatic optimization

The orchestrator analyzes:
- Parallelizability (steps with no dependencies)
- Interdependencies (dependency graph complexity)
- Resource intensity (timeout and priority)
- Workload characteristics

### Hybrid
Executes phases sequentially, steps within phases in parallel.

**Automatically used by adaptive strategy when:**
- Some steps can run in parallel
- Other steps have dependencies
- Mixed workload characteristics

## Dependency Resolution

### Topological Sort
Uses Kahn's algorithm for O(n + e) dependency ordering:

```typescript
steps: [
  { id: 'A', dependencies: [] },
  { id: 'B', dependencies: ['A'] },
  { id: 'C', dependencies: ['A'] },
  { id: 'D', dependencies: ['B', 'C'] }
]

// Execution order: A → (B, C in parallel) → D
```

### Cycle Detection
Detects circular dependencies using DFS:

```typescript
// This will throw error: "Workflow contains circular dependencies"
steps: [
  { id: 'A', dependencies: ['B'] },
  { id: 'B', dependencies: ['A'] }
]
```

### Critical Path
Calculates longest dependency chain for duration estimation:

```typescript
const plan = resolveDependencies(workflow.steps);
console.log('Critical path:', plan.criticalPath);
console.log('Estimated duration:', plan.estimatedDuration);
```

## Priority Queue

Heap-based priority queue for O(log n) operations:

```typescript
import { PriorityQueue } from './core/orchestration';

const queue = new PriorityQueue<Task>();

// Enqueue with priority (higher = higher priority)
queue.enqueue(criticalTask, 100);
queue.enqueue(highTask, 75);
queue.enqueue(mediumTask, 50);
queue.enqueue(lowTask, 25);

// Dequeue highest priority
const next = queue.dequeue(); // Returns criticalTask

// Peek without removing
const upcoming = queue.peek(); // Returns highTask

// Check status
console.log('Size:', queue.size());
console.log('Empty:', queue.isEmpty());
```

## Performance Optimization

### 1. SwarmOptimizer Integration

```typescript
const optimizer = new SwarmOptimizer(memoryStore, eventBus);
await optimizer.initialize();

const orchestrator = new WorkflowOrchestrator(
  memoryStore,
  eventBus,
  optimizer // Enables agent allocation optimization
);
```

When SwarmOptimizer is provided:
- Optimal agent allocation for tasks
- Load balancing across agents
- Capability matching
- Performance-based assignment

### 2. Batch Operations

Group related steps to reduce coordination overhead:

```typescript
// Instead of many small steps
steps: [
  { id: 'test-1', ... },
  { id: 'test-2', ... },
  { id: 'test-3', ... }
]

// Use one batched step
steps: [
  {
    id: 'test-batch',
    action: 'batch-test',
    inputs: { tests: ['test-1', 'test-2', 'test-3'] }
  }
]
```

### 3. Checkpoint Strategy

Enable checkpoints for long-running workflows:

```typescript
// For workflows > 5 minutes
checkpointEnabled: true

// Checkpoint every N steps
steps.forEach((step, i) => {
  if (i % 5 === 0) {
    // Create checkpoint
  }
});
```

### 4. Timeout Tuning

Set realistic timeouts based on step complexity:

```typescript
steps: [
  {
    id: 'quick-check',
    timeout: 30000,  // 30s
    retries: 1
  },
  {
    id: 'full-analysis',
    timeout: 300000, // 5m
    retries: 2
  }
]
```

## Error Handling

### Automatic Retries

```typescript
steps: [{
  id: 'flaky-operation',
  retries: 3, // Retry up to 3 times
  timeout: 60000
}]
```

Retry strategy:
- Exponential backoff: 1s, 2s, 3s
- Emits `workflow:step:failed` on final failure
- Tracks retry count in metrics

### Critical Steps

```typescript
steps: [{
  id: 'critical-step',
  priority: 'critical', // Fail entire workflow if this fails
  retries: 2
}]
```

### Error Events

```typescript
eventBus.subscribe('workflow:step:failed', async (data) => {
  console.error(`Step ${data.stepId} failed: ${data.error}`);

  // Custom error handling
  if (data.stepId === 'deploy-to-prod') {
    await rollback();
  }
});

eventBus.subscribe('workflow:failed', async (data) => {
  console.error(`Workflow ${data.workflowId} failed: ${data.error}`);
  await notifyTeam(data);
});
```

## Best Practices

### 1. Design for Parallelism
Minimize dependencies to maximize parallel execution:

```typescript
// ✅ Good: Steps can run in parallel
steps: [
  { id: 'unit-tests', dependencies: [] },
  { id: 'integration-tests', dependencies: [] },
  { id: 'e2e-tests', dependencies: [] }
]

// ❌ Bad: Artificial sequential dependency
steps: [
  { id: 'unit-tests', dependencies: [] },
  { id: 'integration-tests', dependencies: ['unit-tests'] }, // Unnecessary
  { id: 'e2e-tests', dependencies: ['integration-tests'] }    // Unnecessary
]
```

### 2. Use Reference Syntax
Pass outputs between steps:

```typescript
steps: [
  {
    id: 'build',
    action: 'compile',
    inputs: { source: 'src/' }
  },
  {
    id: 'test',
    action: 'run-tests',
    inputs: {
      artifacts: '${build.output.artifacts}', // Reference previous output
      config: '${build.output.testConfig}'
    },
    dependencies: ['build']
  }
]
```

### 3. Set Appropriate Priorities
Use priority to optimize critical path:

```typescript
steps: [
  { id: 'critical-tests', priority: 'critical' },   // 100
  { id: 'core-features', priority: 'high' },        // 75
  { id: 'edge-cases', priority: 'medium' },         // 50
  { id: 'documentation', priority: 'low' }          // 25
]
```

### 4. Monitor Metrics
Track performance over time:

```typescript
const executions = orchestrator.listExecutions();
const avgDuration = executions
  .map(e => e.metrics.totalDuration)
  .reduce((sum, d) => sum + d, 0) / executions.length;

const avgParallelization = executions
  .map(e => e.metrics.parallelization)
  .reduce((sum, p) => sum + p, 0) / executions.length;

console.log('Average duration:', avgDuration);
console.log('Average parallelization:', avgParallelization);
```

### 5. Enable Checkpoints for Long Workflows
For workflows > 5 minutes:

```typescript
{
  checkpointEnabled: true,
  timeout: 600000, // 10 minutes
}
```

## Examples

### Example 1: Full Test Pipeline

```typescript
const testPipeline: Workflow = {
  id: 'full-test-pipeline',
  name: 'Complete Test Pipeline',
  description: 'Generate, execute, analyze, and report',
  strategy: 'adaptive',
  checkpointEnabled: true,
  timeout: 900000, // 15 minutes
  metadata: {},
  steps: [
    {
      id: 'generate-unit',
      name: 'Generate Unit Tests',
      agentType: 'qe-test-generator',
      action: 'generate-unit-tests',
      inputs: { module: 'all' },
      dependencies: [],
      timeout: 120000,
      retries: 2,
      priority: 'high'
    },
    {
      id: 'generate-integration',
      name: 'Generate Integration Tests',
      agentType: 'qe-test-generator',
      action: 'generate-integration-tests',
      inputs: { services: 'all' },
      dependencies: [],
      timeout: 120000,
      retries: 2,
      priority: 'high'
    },
    {
      id: 'execute-unit',
      name: 'Execute Unit Tests',
      agentType: 'qe-test-executor',
      action: 'run-unit-tests',
      inputs: { tests: '${generate-unit.output}' },
      dependencies: ['generate-unit'],
      timeout: 180000,
      retries: 1,
      priority: 'critical'
    },
    {
      id: 'execute-integration',
      name: 'Execute Integration Tests',
      agentType: 'qe-test-executor',
      action: 'run-integration-tests',
      inputs: { tests: '${generate-integration.output}' },
      dependencies: ['generate-integration'],
      timeout: 300000,
      retries: 1,
      priority: 'critical'
    },
    {
      id: 'analyze-coverage',
      name: 'Coverage Analysis',
      agentType: 'qe-coverage-analyzer',
      action: 'analyze',
      inputs: {
        unitCoverage: '${execute-unit.output.coverage}',
        integrationCoverage: '${execute-integration.output.coverage}'
      },
      dependencies: ['execute-unit', 'execute-integration'],
      timeout: 60000,
      retries: 1,
      priority: 'medium'
    },
    {
      id: 'generate-report',
      name: 'Generate Report',
      agentType: 'qe-quality-analyzer',
      action: 'generate-report',
      inputs: {
        results: '${analyze-coverage.output}'
      },
      dependencies: ['analyze-coverage'],
      timeout: 30000,
      retries: 1,
      priority: 'low'
    }
  ]
};
```

### Example 2: Parallel Test Execution

```typescript
const parallelTests: Workflow = {
  id: 'parallel-test-suites',
  name: 'Parallel Test Suites',
  description: 'Execute multiple test suites in parallel',
  strategy: 'parallel',
  checkpointEnabled: false,
  timeout: 300000,
  metadata: {},
  steps: [
    {
      id: 'unit-tests',
      name: 'Unit Tests',
      agentType: 'qe-test-executor',
      action: 'run-tests',
      inputs: { suite: 'unit' },
      dependencies: [],
      timeout: 120000,
      retries: 1,
      priority: 'high'
    },
    {
      id: 'integration-tests',
      name: 'Integration Tests',
      agentType: 'qe-test-executor',
      action: 'run-tests',
      inputs: { suite: 'integration' },
      dependencies: [],
      timeout: 180000,
      retries: 1,
      priority: 'high'
    },
    {
      id: 'e2e-tests',
      name: 'E2E Tests',
      agentType: 'qe-test-executor',
      action: 'run-tests',
      inputs: { suite: 'e2e' },
      dependencies: [],
      timeout: 240000,
      retries: 1,
      priority: 'medium'
    },
    {
      id: 'performance-tests',
      name: 'Performance Tests',
      agentType: 'qe-performance-tester',
      action: 'run-tests',
      inputs: { suite: 'performance' },
      dependencies: [],
      timeout: 300000,
      retries: 1,
      priority: 'medium'
    }
  ]
};
```

## API Reference

### WorkflowOrchestrator

#### Constructor
```typescript
constructor(
  memoryStore: SwarmMemoryManager,
  eventBus: QEEventBus,
  optimizer?: SwarmOptimizer
)
```

#### Methods

**initialize(): Promise<void>**
Initialize orchestrator and load workflows from memory.

**registerWorkflow(workflow: Workflow): void**
Register a new workflow.

**getWorkflow(id: string): Workflow | undefined**
Get workflow by ID.

**listWorkflows(): Workflow[]**
List all registered workflows.

**executeWorkflow(workflowId: string, inputs?: Record<string, any>): Promise<WorkflowExecution>**
Execute a workflow with optional inputs.

**pauseExecution(executionId: string): Promise<void>**
Pause a running execution.

**resumeExecution(executionId: string): Promise<void>**
Resume a paused execution.

**cancelExecution(executionId: string): Promise<void>**
Cancel an execution.

**createCheckpoint(executionId: string): Promise<WorkflowCheckpoint>**
Create a checkpoint for an execution.

**restoreFromCheckpoint(checkpoint: WorkflowCheckpoint): Promise<WorkflowExecution>**
Restore execution from checkpoint.

**getExecutionMetrics(executionId: string): ExecutionMetrics**
Get metrics for an execution.

**getExecution(executionId: string): WorkflowExecution | undefined**
Get execution by ID.

**listExecutions(): WorkflowExecution[]**
List all executions.

**shutdown(): Promise<void>**
Shutdown orchestrator.

## Event Types

- `workflow:registered` - Workflow registered
- `workflow:started` - Execution started
- `workflow:step:started` - Step started
- `workflow:step:completed` - Step completed successfully
- `workflow:step:failed` - Step failed
- `workflow:completed` - Workflow completed successfully
- `workflow:failed` - Workflow failed
- `workflow:paused` - Execution paused
- `workflow:resumed` - Execution resumed
- `workflow:cancelled` - Execution cancelled

## License

Part of Agentic QE Fleet - MIT License
