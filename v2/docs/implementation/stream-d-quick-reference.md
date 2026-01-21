# SwarmOptimizer Quick Reference

## Import
```typescript
import { SwarmOptimizer, Task, Agent } from './core/optimization';
import type {
  OptimizationConfig,
  WorkloadProfile,
  TopologyRecommendation,
  AgentAllocation,
  PerformanceMetrics,
  Bottleneck,
  OptimizationResult
} from './core/optimization';
```

## Initialization
```typescript
const optimizer = new SwarmOptimizer(memoryStore, eventBus);
await optimizer.initialize();
```

## Core Methods

### 1. Recommend Topology
```typescript
const workload: WorkloadProfile = {
  taskCount: 50,
  taskTypes: new Map([['test-generation', 30]]),
  averageComplexity: 0.6,      // 0-1
  parallelizability: 0.8,      // 0-1
  resourceIntensity: 0.5,      // 0-1
  interdependencies: 0.3       // 0-1
};

const recommendation = await optimizer.recommendTopology(workload);
console.log(recommendation.topology);        // 'mesh' | 'hierarchical' | 'ring' | 'star'
console.log(recommendation.expectedSpeedup); // e.g., 3.2
console.log(recommendation.confidence);      // 0-1
```

### 2. Allocate Agents
```typescript
const tasks: Task[] = [{
  id: 'task-1',
  type: 'test-generation',
  complexity: 0.7,
  estimatedDuration: 120000,
  dependencies: [],
  priority: 'critical',
  requiredCapabilities: ['jest']
}];

const agents: Agent[] = [{
  id: 'agent-1',
  type: 'qe-test-generator',
  capabilities: ['jest', 'typescript'],
  currentLoad: 0.2,
  performanceScore: 0.85,
  isAvailable: true
}];

const allocation = await optimizer.allocateAgents(tasks, agents);
console.log(allocation.loadBalance);        // 0-1 (1 = perfect)
console.log(allocation.expectedDuration);   // milliseconds
```

### 3. Detect Bottlenecks
```typescript
const metrics: PerformanceMetrics[] = [{
  taskThroughput: 3.2,         // tasks/second
  averageLatency: 2500,        // milliseconds
  resourceUtilization: 0.88,   // 0-1
  bottlenecks: [],
  timestamp: new Date()
}];

const bottlenecks = await optimizer.detectBottlenecks(metrics);
for (const b of bottlenecks) {
  console.log(b.type);          // 'agent' | 'memory' | 'coordination' | 'io'
  console.log(b.severity);      // 0-1
  console.log(b.recommendation);
}
```

### 4. Optimize
```typescript
const config: OptimizationConfig = {
  targetSpeedup: 3.0,
  maxAgents: 10,
  enableAutoTuning: true,
  enableBottleneckDetection: true,
  enableAdaptiveScaling: true
};

const result = await optimizer.optimize(config);
if (result.success) {
  console.log(result.improvements.get('throughput'));  // % improvement
  console.log(result.improvements.get('latency'));
  console.log(result.improvements.get('overall'));
}
```

## Helper Methods
```typescript
// Register components
optimizer.registerPerformanceTracker(agentId, tracker);
optimizer.registerLearningEngine(agentId, engine);

// Query state
const history = optimizer.getOptimizationHistory();
const topology = optimizer.getCurrentTopology();

// Cleanup
await optimizer.shutdown();
```

## Topology Decision Matrix

| Workload | Recommended | Why |
|----------|-------------|-----|
| High parallelizability (>0.7) | **mesh** | Best parallel execution |
| High interdependencies (>0.6) | **hierarchical** | Better coordination |
| Small swarm (<10 agents) | **star** | Simple coordination |
| Medium complexity | **ring** | Balanced approach |

## Bottleneck Thresholds

| Type | Trigger | Severity Calculation |
|------|---------|---------------------|
| Agent | Utilization > 85% | `(util - 0.85) / 0.15` |
| Memory | Util > 75% AND Latency > 1s | `latency / 5000` |
| Coordination | Latency variance > 50% avg | `variance / (avgLatency * 2)` |
| IO | Throughput < 5 AND Util < 50% | `(0.5 - util) * 2` |

## Performance Scoring

```
Composite Score =
  normalizedThroughput * 0.4 +
  normalizedLatency * 0.3 +
  normalizedUtilization * 0.3

Where:
  normalizedThroughput = min(1, throughput / 10)
  normalizedLatency = max(0, 1 - (latency / 5000))
  normalizedUtilization = utilization
```

## Memory Keys

```
optimization/topology/latest         - Latest recommendation
optimization/allocation/latest       - Latest allocation
optimization/bottlenecks/latest      - Latest bottlenecks
optimization/results/{timestamp}     - Results (30d TTL)
optimization/metrics/current         - Current metrics
optimization/workload/profile        - Workload analysis
optimization/tasks/pending           - Pending tasks
optimization/agents/active           - Active agents
```

## Event Integration

```typescript
// Subscribe to events
eventBus.subscribe('agent:completed', async (event) => {
  // Optimizer handles automatically if registered
});

// Manual trigger
await eventBus.emitAsync('optimization:needed', {
  reason: 'bottleneck-detected'
});
```

## Common Patterns

### Auto-Optimization Loop
```typescript
setInterval(async () => {
  const metrics = await collectMetrics();
  const bottlenecks = await optimizer.detectBottlenecks(metrics);

  if (bottlenecks.some(b => b.severity > 0.5)) {
    await optimizer.optimize(config);
  }
}, 60000); // every minute
```

### Workload-Based Initialization
```typescript
async function initializeSwarm(taskQueue: Task[]) {
  const workload = analyzeTaskQueue(taskQueue);
  const topology = await optimizer.recommendTopology(workload);

  // Initialize swarm with recommended topology
  await swarm.init(topology.topology);

  const agents = await swarm.getAgents();
  const allocation = await optimizer.allocateAgents(taskQueue, agents);

  // Assign tasks based on allocation
  for (const [agentId, taskIds] of allocation.allocations) {
    await swarm.assignTasks(agentId, taskIds);
  }
}
```

### Real-time Bottleneck Monitoring
```typescript
async function monitorBottlenecks() {
  const metrics: PerformanceMetrics[] = [];

  eventBus.subscribe('test:completed', (event) => {
    metrics.push({
      taskThroughput: event.passed / event.duration,
      averageLatency: event.duration,
      resourceUtilization: getCurrentUtilization(),
      bottlenecks: [],
      timestamp: new Date()
    });
  });

  setInterval(async () => {
    if (metrics.length > 10) {
      const bottlenecks = await optimizer.detectBottlenecks(metrics);
      if (bottlenecks.length > 0) {
        console.warn('Bottlenecks detected:', bottlenecks);
      }
      metrics.length = 0; // reset
    }
  }, 30000);
}
```

## Best Practices

1. **Run topology recommendation before swarm initialization**
2. **Update allocations when task queue changes significantly**
3. **Monitor bottlenecks continuously during execution**
4. **Store optimization results for later analysis**
5. **Register performance trackers for accurate metrics**
6. **Use adaptive scaling for dynamic workloads**
7. **Enable auto-tuning for production deployments**

## Error Handling

```typescript
try {
  const result = await optimizer.optimize(config);
  if (!result.success) {
    console.error('Optimization failed');
    // Fallback to default configuration
  }
} catch (error) {
  console.error('Optimizer error:', error);
  // Use previous optimization or defaults
}
```
