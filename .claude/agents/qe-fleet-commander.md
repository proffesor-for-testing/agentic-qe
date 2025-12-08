---
name: qe-fleet-commander
description: Hierarchical fleet coordinator for 50+ agent orchestration with dynamic topology management and resource optimization
---

# Fleet Commander Agent - Hierarchical Agent Orchestration

## Core Responsibilities

1. **Agent Lifecycle Management**: Spawn, monitor, coordinate, and terminate QE agents dynamically
2. **Resource Optimization**: Allocate CPU, memory, and I/O resources efficiently across 50+ agents
3. **Topology Management**: Dynamically adjust coordination topologies based on workload patterns
4. **Conflict Resolution**: Resolve resource conflicts and agent communication deadlocks
5. **Load Balancing**: Distribute testing workloads optimally using sublinear scheduling algorithms
6. **Fault Tolerance**: Detect failures, trigger recovery, and maintain fleet resilience
7. **Scaling Orchestration**: Auto-scale agent pools based on demand and performance metrics
8. **Performance Monitoring**: Track fleet-wide metrics and optimize coordination patterns

## Skills Available

### Core Testing Skills (Phase 1)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work
- **risk-based-testing**: Focus testing effort on highest-risk areas using risk assessment

### Phase 2 Skills (NEW in v1.3.0)
- **test-environment-management**: Manage test environments, infrastructure as code, and environment provisioning
- **test-reporting-analytics**: Comprehensive test reporting with metrics, trends, and actionable insights

Use these skills via:
```bash
# Via CLI
aqe skills show test-environment-management

# Via Skill tool in Claude Code
Skill("test-environment-management")
Skill("test-reporting-analytics")
```

## Analysis Workflow

### Phase 1: Fleet Initialization
```javascript
// Initialize fleet topology and agent pools
const fleetConfig = {
  topology: 'hierarchical', // hierarchical, mesh, hybrid, adaptive
  maxAgents: 50,
  agentPools: {
    'test-generator': { min: 2, max: 10, priority: 'high' },
    'test-executor': { min: 3, max: 15, priority: 'critical' },
    'coverage-analyzer': { min: 1, max: 5, priority: 'high' },
    'quality-gate': { min: 1, max: 3, priority: 'medium' },
    'performance-tester': { min: 1, max: 5, priority: 'medium' },
    'security-scanner': { min: 1, max: 3, priority: 'high' }
  },
  resourceLimits: {
    cpuPerAgent: 0.5,
    memoryPerAgent: '512MB',
    maxConcurrent: 20
  }
};

// Initialize with Claude Flow
await fleetCommander.initialize(fleetConfig);
```

### Phase 2: Dynamic Agent Spawning
```javascript
// Spawn agents based on workload analysis
const workloadAnalysis = await analyzeWorkload({
  testSuiteSize: 1500,
  codeLinesOfCode: 50000,
  frameworks: ['jest', 'cypress', 'playwright'],
  coverage_target: 0.95
});

// Calculate optimal agent distribution
const agentAllocation = sublinearScheduler.optimize({
  workload: workloadAnalysis,
  constraints: fleetConfig.resourceLimits,
  optimization: 'minimize-time'
});

// Spawn agents in parallel
const spawnedAgents = await Promise.all(
  agentAllocation.map(allocation =>
    spawnAgent({
      type: allocation.agentType,
      resources: allocation.resources,
      priority: allocation.priority
    })
  )
);
```

### Phase 3: Coordination Topology Selection
```javascript
// Determine optimal topology based on task complexity
const topologyDecision = {
  hierarchical: taskComplexity < 0.5, // Simple tasks
  mesh: taskComplexity >= 0.5 && taskComplexity < 0.8, // Medium complexity
  hybrid: taskComplexity >= 0.8, // High complexity
  adaptive: enableAdaptiveMode // Dynamic switching
};

// Apply selected topology
await fleetCommander.applyTopology({
  mode: getOptimalTopology(topologyDecision),
  coordinationStrategy: 'consensus-based',
  communicationProtocol: 'event-bus'
});
```

### Phase 4: Load Balancing & Resource Allocation
```javascript
// Monitor agent workload in real-time
const loadMetrics = await monitorAgentLoad();

// Rebalance workload using sublinear algorithms
const rebalancingStrategy = sublinearLoadBalancer.compute({
  currentLoad: loadMetrics,
  targetUtilization: 0.75,
  algorithm: 'johnson-lindenstrauss'
});

// Apply load balancing
await fleetCommander.rebalanceLoad(rebalancingStrategy);
```

## Integration Points

### Memory Coordination
```typescript
// Store fleet topology and configuration
await this.memoryStore.store('aqe/fleet/topology', {
  mode: 'hierarchical',
  agents: 50
}, {
  partition: 'coordination'
});

// Store agent lifecycle status
await this.memoryStore.store('aqe/fleet/agents/active', activeAgentsJson, {
  partition: 'coordination'
});

// Store resource allocation matrix
await this.memoryStore.store('aqe/fleet/resources/allocation', resourceMatrix, {
  partition: 'coordination'
});

// Store coordination metrics
await this.memoryStore.store('aqe/fleet/metrics/coordination', coordinationMetrics, {
  partition: 'coordination'
});
```

### EventBus Integration
```javascript
// Subscribe to agent lifecycle events
eventBus.subscribe('agent:spawned', (event) => {
  fleetCommander.registerAgent(event.agentId, event.agentType);
});

eventBus.subscribe('agent:terminated', (event) => {
  fleetCommander.handleAgentTermination(event.agentId);
});

eventBus.subscribe('agent:overloaded', (event) => {
  fleetCommander.rebalanceLoad(event.agentId);
});

// Broadcast fleet coordination events
eventBus.publish('fleet:topology-changed', {
  oldTopology: 'mesh',
  newTopology: 'hierarchical',
  reason: 'performance-optimization'
});
```

### Agent Collaboration
- **QE Test Generator**: Coordinates test generation workload distribution
- **QE Test Executor**: Manages test execution parallelization
- **QE Coverage Analyzer**: Allocates coverage analysis resources
- **QE Quality Gate**: Schedules quality validation checks
- **QE Performance Tester**: Orchestrates performance testing workflows
- **QE Security Scanner**: Coordinates security scanning tasks

## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies, 100-500x faster).

**Automatic Lifecycle Hooks:**
```typescript
// Called automatically by BaseAgent
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load fleet topology and active agents
  const topology = await this.memoryStore.retrieve('aqe/fleet/topology');
  const activeAgents = await this.memoryStore.retrieve('aqe/fleet/agents/active');

  // Verify environment for fleet orchestration
  const verification = await this.hookManager.executePreTaskVerification({
    task: 'fleet-orchestration',
    context: {
      requiredVars: ['FLEET_MODE', 'MAX_AGENTS'],
      minMemoryMB: 2048,
      requiredKeys: ['aqe/fleet/topology']
    }
  });

  // Emit fleet coordination starting event
  this.eventBus.emit('fleet-commander:starting', {
    agentId: this.agentId,
    topology: topology?.mode || 'hierarchical',
    activeAgents: activeAgents?.length || 0
  });

  this.logger.info('Fleet coordination initialized', {
    topology: topology?.mode || 'hierarchical',
    activeAgents: activeAgents?.length || 0,
    maxAgents: 50,
    verification: verification.passed
  });
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store coordination results and fleet metrics
  await this.memoryStore.store('aqe/fleet/coordination/results', data.result.coordinationOutcomes, {
    partition: 'agent_results',
    ttl: 86400 // 24 hours
  });

  await this.memoryStore.store('aqe/fleet/metrics/performance', data.result.fleetMetrics, {
    partition: 'metrics',
    ttl: 604800 // 7 days
  });

  await this.memoryStore.store('aqe/fleet/agents/active', data.result.activeAgents, {
    partition: 'coordination',
    ttl: 3600 // 1 hour
  });

  // Store fleet coordination metrics
  await this.memoryStore.store('aqe/fleet/metrics/coordination', {
    timestamp: Date.now(),
    agentsOrchestrated: data.result.activeAgents.length,
    throughput: data.result.fleetMetrics.throughput,
    efficiency: data.result.fleetMetrics.efficiency
  }, {
    partition: 'metrics',
    ttl: 604800 // 7 days
  });

  // Emit completion event with fleet coordination results
  this.eventBus.emit('fleet-commander:coordinated', {
    agentId: this.agentId,
    agentsOrchestrated: data.result.activeAgents.length,
    throughput: data.result.fleetMetrics.throughput,
    efficiency: data.result.fleetMetrics.efficiency
  });

  // Validate fleet coordination results
  const validation = await this.hookManager.executePostTaskValidation({
    task: 'fleet-orchestration',
    result: {
      output: data.result,
      activeAgents: data.result.activeAgents,
      metrics: {
        throughput: data.result.fleetMetrics.throughput,
        efficiency: data.result.fleetMetrics.efficiency
      }
    }
  });

  this.logger.info('Fleet coordination completed', {
    agentsOrchestrated: data.result.activeAgents.length,
    throughput: data.result.fleetMetrics.throughput,
    validated: validation.passed
  });
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Store error for fleet analysis
  await this.memoryStore.store(`aqe/errors/${data.assignment.task.id}`, {
    error: data.error.message,
    timestamp: Date.now(),
    agent: this.agentId,
    taskType: 'fleet-coordination',
    topology: data.assignment.task.metadata.topology
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  // Emit error event for fleet coordination
  this.eventBus.emit('fleet-commander:error', {
    agentId: this.agentId,
    error: data.error.message,
    taskId: data.assignment.task.id
  });

  this.logger.error('Fleet coordination failed', {
    error: data.error.message,
    stack: data.error.stack
  });
}
```

**Advanced Verification (Optional):**
```typescript
// Use VerificationHookManager for comprehensive validation
const hookManager = new VerificationHookManager(this.memoryStore);
const verification = await hookManager.executePreTaskVerification({
  task: 'fleet-orchestration',
  context: {
    requiredVars: ['FLEET_MODE', 'MAX_AGENTS'],
    minMemoryMB: 2048,
    requiredKeys: ['aqe/fleet/topology']
  }
});
```

## Learning Integration (Phase 6)

This agent integrates with the **Learning Engine** to continuously improve fleet orchestration and resource allocation.

### Learning Protocol

```typescript
import { LearningEngine } from '@/learning/LearningEngine';

// Initialize learning engine
const learningEngine = new LearningEngine({
  agentId: 'qe-fleet-commander',
  taskType: 'fleet-coordination',
  domain: 'fleet-coordination',
  learningRate: 0.01,
  epsilon: 0.1,
  discountFactor: 0.95
});

await learningEngine.initialize();

// Record fleet coordination episode
await learningEngine.recordEpisode({
  state: {
    topology: 'hierarchical',
    activeAgents: 47,
    workloadComplexity: 0.75,
    resourceUtilization: 0.68
  },
  action: {
    topologyChange: 'none',
    agentAllocation: {
      'test-executor': 15,
      'test-generator': 8,
      'coverage-analyzer': 4
    },
    loadBalancing: 'sublinear'
  },
  reward: fleetEfficiency * 2.0 - resourceWaste * 0.5,
  nextState: {
    throughput: 6561,
    efficiency: 0.85,
    conflictsResolved: 12
  }
});

// Learn from fleet coordination outcomes
await learningEngine.learn();

// Get learned fleet optimization
const prediction = await learningEngine.predict({
  topology: 'hierarchical',
  activeAgents: 47,
  workloadComplexity: 0.75
});
```

### Reward Function

```typescript
function calculateFleetReward(outcome: FleetCoordinationOutcome): number {
  let reward = 0;

  // Base reward for fleet efficiency
  reward += outcome.efficiency * 2.0;

  // Reward for high throughput
  const throughputNormalized = outcome.throughput / 10000; // Normalize
  reward += throughputNormalized * 1.0;

  // Penalty for resource waste
  const wasteRatio = 1 - outcome.resourceUtilization;
  reward -= wasteRatio * 0.5;

  // Reward for conflict resolution
  reward += outcome.conflictsResolved * 0.1;

  // Penalty for agent failures
  reward -= outcome.agentFailures * 0.3;

  // Bonus for meeting SLA
  if (outcome.slaCompliance > 0.99) {
    reward += 0.5;
  }

  // Penalty for coordination overhead
  reward -= outcome.coordinationOverhead * 0.2;

  return reward;
}
```

### Learning Metrics

Track learning progress:
- **Fleet Efficiency**: Overall coordination efficiency
- **Throughput**: Tasks completed per hour
- **Resource Utilization**: Percentage of resources actively used
- **Conflict Resolution**: Time to resolve resource conflicts
- **Topology Optimization**: Effectiveness of topology switches

```bash
# View learning metrics
aqe learn status --agent qe-fleet-commander

# Export learning history
aqe learn export --agent qe-fleet-commander --format json

# Analyze fleet efficiency trends
aqe learn analyze --agent qe-fleet-commander --metric efficiency
```

## Memory Keys

### Input Keys
- `aqe/fleet/config`: Fleet configuration and limits
- `aqe/fleet/topology`: Current coordination topology
- `aqe/fleet/agents/requested`: Agent spawn requests queue
- `aqe/workload/analysis`: Workload analysis results
- `aqe/resources/available`: Available system resources

### Output Keys
- `aqe/fleet/agents/active`: List of active agents with status
- `aqe/fleet/agents/metrics`: Per-agent performance metrics
- `aqe/fleet/resources/allocation`: Resource allocation matrix
- `aqe/fleet/coordination/results`: Coordination outcomes and decisions
- `aqe/fleet/metrics/performance`: Fleet-wide performance metrics
- `aqe/fleet/topology/history`: Topology change history

### Coordination Keys
- `aqe/fleet/status`: Current fleet operational status
- `aqe/fleet/workload/queue`: Work distribution queue
- `aqe/fleet/conflicts`: Detected conflicts and resolutions
- `aqe/fleet/health`: Fleet health indicators

## Coordination Protocol

### Swarm Integration
```typescript
// Initialize fleet with hierarchical topology
await this.swarmManager.initialize({
  topology: 'hierarchical',
  maxAgents: 50,
  coordinator: 'qe-fleet-commander'
});

// Spawn specialized agent pool via EventBus
this.eventBus.emit('fleet:spawn-pool', {
  type: 'test-executor',
  poolSize: 10,
  priority: 'critical'
});

// Orchestrate distributed testing workflow
await this.taskManager.orchestrate({
  task: 'Execute 5000 tests across frameworks',
  agents: {
    'test-executor': 10,
    'coverage-analyzer': 3
  },
  strategy: 'hierarchical-parallel'
});
```

### Neural Pattern Training
```typescript
// Train fleet coordination patterns
await this.neuralManager.trainPattern({
  patternType: 'fleet-coordination',
  trainingData: coordinationHistory,
  optimization: 'sublinear'
});

// Predict optimal agent allocation
const allocation = await this.neuralManager.predict({
  modelId: 'fleet-allocation-model',
  input: workloadAnalysis
});
```

<learning_protocol>
**⚠️ MANDATORY**: When executed via Claude Code Task tool, you MUST call learning MCP tools to persist learning data.

### Required Learning Actions (Call AFTER Task Completion)

**1. Store Learning Experience:**
```typescript
// Call this MCP tool after completing your task
mcp__agentic_qe__learning_store_experience({
  agentId: "qe-fleet-commander",
  taskType: "fleet-coordination",
  reward: 0.95,  // Your assessment of task success (0-1 scale)
  outcome: {
    // Your actual results (agent-specific)
    agentsCoordinated: 47,
    tasksDistributed: 5000,
    efficiency: 0.85,
    executionTime: 12000
  },
  metadata: {
    // Additional context (agent-specific)
    topology: "hierarchical",
    maxAgents: 50,
    loadBalancing: true
  }
})
```

**2. Store Q-Values for Your Strategy:**
```typescript
// Store Q-value for the strategy you used
mcp__agentic_qe__learning_store_qvalue({
  agentId: "qe-fleet-commander",
  stateKey: "fleet-coordination-state",
  actionKey: "hierarchical-coordination",
  qValue: 0.85,  // Expected value of this approach (based on results)
  metadata: {
    // Strategy details (agent-specific)
    coordinationStrategy: "hierarchical",
    efficiency: 0.85,
    resourceUtilization: 0.68
  }
})
```

**3. Store Successful Patterns:**
```typescript
// If you discovered a useful pattern, store it
mcp__agentic_qe__learning_store_pattern({
  agentId: "qe-fleet-commander",
  pattern: "Hierarchical coordination with 3-tier architecture achieved 85% efficiency for 50+ agents",
  confidence: 0.95,  // How confident you are (0-1)
  domain: "fleet-management",
  metadata: {
    // Pattern context (agent-specific)
    coordinationPatterns: ["hierarchical", "load-balancing", "conflict-resolution"],
    scalability: 50
  }
})
```

### Learning Query (Use at Task Start)

**Before starting your task**, query for past learnings:

```typescript
// Query for successful experiences
const pastLearnings = await mcp__agentic_qe__learning_query({
  agentId: "qe-fleet-commander",
  taskType: "fleet-coordination",
  minReward: 0.8,  // Only get successful experiences
  queryType: "all",
  limit: 10
});

// Use the insights to optimize your current approach
if (pastLearnings.success && pastLearnings.data) {
  const { experiences, qValues, patterns } = pastLearnings.data;

  // Find best-performing strategy
  const bestStrategy = qValues
    .filter(qv => qv.state_key === "fleet-coordination-state")
    .sort((a, b) => b.q_value - a.q_value)[0];

  console.log(`Using learned best strategy: ${bestStrategy.action_key} (Q-value: ${bestStrategy.q_value})`);

  // Check for relevant patterns
  const relevantPatterns = patterns
    .filter(p => p.domain === "fleet-management")
    .sort((a, b) => b.confidence * b.success_rate - a.confidence * a.success_rate);

  if (relevantPatterns.length > 0) {
    console.log(`Applying pattern: ${relevantPatterns[0].pattern}`);
  }
}
```

### Success Criteria for Learning

**Reward Assessment (0-1 scale):**
- **1.0**: Perfect execution (50+ agents coordinated, 100% efficiency, optimal load)
- **0.9**: Excellent (40+ agents, 95%+ efficiency, good load balance)
- **0.7**: Good (30+ agents, 90%+ efficiency, acceptable balance)
- **0.5**: Acceptable (20+ agents, 80%+ efficiency, completed)
- **<0.5**: Needs improvement (Few agents, low efficiency, poor balance)

**When to Call Learning Tools:**
- ✅ **ALWAYS** after completing main task
- ✅ **ALWAYS** after coordinating agent fleet
- ✅ **ALWAYS** after optimizing topology
- ✅ When discovering new effective coordination strategies
- ✅ When achieving exceptional fleet performance metrics
</learning_protocol>

## Hierarchical Coordination Patterns

### Three-Tier Architecture
```javascript
// Tier 1: Fleet Commander (this agent)
const fleetCommander = {
  role: 'orchestrator',
  responsibilities: [
    'topology-management',
    'resource-allocation',
    'conflict-resolution'
  ]
};

// Tier 2: Team Leaders (specialized coordinators)
const teamLeaders = {
  'test-generation-lead': { manages: ['test-generator:*'] },
  'test-execution-lead': { manages: ['test-executor:*'] },
  'quality-analysis-lead': { manages: ['coverage-analyzer:*', 'quality-gate:*'] }
};

// Tier 3: Worker Agents (execution agents)
const workerAgents = {
  'test-generator': { count: 10, status: 'active' },
  'test-executor': { count: 15, status: 'active' },
  'coverage-analyzer': { count: 5, status: 'active' }
};
```

### Communication Hierarchy
```javascript
// Command flow: Commander -> Team Leaders -> Workers
const commandChain = {
  source: 'fleet-commander',
  command: 'execute-test-suite',
  route: [
    { level: 1, agent: 'fleet-commander', action: 'dispatch' },
    { level: 2, agent: 'test-execution-lead', action: 'coordinate' },
    { level: 3, agents: ['test-executor:1', 'test-executor:2'], action: 'execute' }
  ]
};

// Reporting flow: Workers -> Team Leaders -> Commander
const reportChain = {
  source: 'test-executor:1',
  report: 'test-execution-complete',
  route: [
    { level: 3, agent: 'test-executor:1', action: 'report' },
    { level: 2, agent: 'test-execution-lead', action: 'aggregate' },
    { level: 1, agent: 'fleet-commander', action: 'analyze' }
  ]
};
```

## Conflict Resolution Strategies

### Resource Conflicts
```javascript
// Detect resource contention
const resourceConflict = {
  type: 'memory-contention',
  agents: ['test-executor:5', 'coverage-analyzer:2'],
  severity: 'high'
};

// Resolve using priority-based allocation
const resolution = resolveConflict({
  conflict: resourceConflict,
  strategy: 'priority-weighted',
  fallback: 'sequential-execution'
});

// Apply resolution
await applyResolution(resolution);
```

### Communication Deadlocks
```javascript
// Detect circular dependencies
const deadlock = detectDeadlock({
  agents: ['agent-A', 'agent-B', 'agent-C'],
  waitGraph: buildWaitGraph()
});

// Break deadlock using timeout-based resolution
const deadlockResolution = {
  method: 'timeout-based',
  victim: selectVictim(deadlock), // Lowest priority agent
  action: 'abort-and-retry'
};

await resolveDeadlock(deadlockResolution);
```

## Load Balancing Algorithms

### Sublinear Scheduling
```javascript
// Use Johnson-Lindenstrauss for workload distribution
const loadBalancing = sublinearScheduler.balance({
  agents: activeAgents,
  workload: testSuiteWorkload,
  algorithm: 'johnson-lindenstrauss',
  optimization: 'minimize-makespan'
});

// Apply load balancing decisions
await distributeWorkload(loadBalancing);
```

### Adaptive Load Rebalancing
```javascript
// Monitor agent performance in real-time
const performanceMetrics = await collectMetrics();

// Detect imbalance
if (detectImbalance(performanceMetrics)) {
  // Rebalance using temporal advantage prediction
  const rebalancing = predictOptimalBalance({
    currentMetrics: performanceMetrics,
    algorithm: 'temporal-advantage',
    horizon: '5m'
  });

  await rebalanceWorkload(rebalancing);
}
```

## Fault Tolerance & Recovery

### Agent Failure Detection
```javascript
// Heartbeat monitoring
const heartbeatMonitor = {
  interval: 5000, // 5 seconds
  timeout: 15000, // 15 seconds
  onFailure: (agentId) => {
    fleetCommander.handleAgentFailure(agentId);
  }
};

// Detect agent failures
eventBus.subscribe('agent:heartbeat-missed', (event) => {
  const failedAgent = event.agentId;

  // Attempt recovery
  recoverAgent(failedAgent)
    .catch(() => {
      // Spawn replacement
      spawnReplacementAgent(failedAgent);
    });
});
```

### State Recovery
```javascript
// Persist agent state for recovery
const persistState = (agentId, state) => {
  memoryManager.store(`aqe/fleet/state/${agentId}`, state);
};

// Restore agent state after failure
const restoreAgent = async (agentId) => {
  const savedState = await memoryManager.retrieve(`aqe/fleet/state/${agentId}`);

  const newAgent = await spawnAgent({
    type: savedState.type,
    state: savedState
  });

  return newAgent;
};
```

## Auto-Scaling Strategies

### Demand-Based Scaling
```javascript
// Monitor workload demand
const demandMetrics = {
  queueLength: 500,
  avgWaitTime: 120, // seconds
  agentUtilization: 0.95
};

// Calculate scaling decision
const scalingDecision = autoScaler.decide({
  metrics: demandMetrics,
  thresholds: {
    scaleUp: { utilization: 0.85, queueLength: 100 },
    scaleDown: { utilization: 0.30, queueLength: 10 }
  }
});

// Execute scaling
if (scalingDecision.action === 'scale-up') {
  await scaleUpAgents(scalingDecision.agentType, scalingDecision.count);
} else if (scalingDecision.action === 'scale-down') {
  await scaleDownAgents(scalingDecision.agentType, scalingDecision.count);
}
```

### Predictive Scaling
```javascript
// Predict future demand using neural patterns
const demandPrediction = await neuralPredictor.forecast({
  historicalData: loadHistory,
  horizon: '30m',
  confidence: 0.85
});

// Proactively scale before demand spike
if (demandPrediction.expectedLoad > currentCapacity * 0.8) {
  await scaleUpProactively(demandPrediction);
}
```

## Performance Monitoring

### Real-time Fleet Metrics
```javascript
// Collect fleet-wide metrics
const fleetMetrics = {
  totalAgents: 47,
  activeAgents: 42,
  idleAgents: 5,
  avgCpuUtilization: 0.68,
  avgMemoryUtilization: 0.54,
  totalTasksCompleted: 15234,
  avgTaskCompletionTime: 2.3, // seconds
  failureRate: 0.002 // 0.2%
};

// Store metrics for analysis
await memoryManager.store('aqe/fleet/metrics/realtime', fleetMetrics);
```

### Performance Analysis
```javascript
// Analyze fleet performance trends
const performanceAnalysis = {
  throughput: calculateThroughput(fleetMetrics),
  efficiency: calculateEfficiency(fleetMetrics),
  bottlenecks: identifyBottlenecks(fleetMetrics),
  recommendations: generateRecommendations(fleetMetrics)
};

// Share analysis with coordination layer
await eventBus.publish('fleet:performance-analysis', performanceAnalysis);
```

## Example Outputs

### Fleet Status Report
```json
{
  "fleet_status": "operational",
  "topology": "hierarchical",
  "active_agents": 47,
  "agent_pools": {
    "test-generator": { "active": 8, "idle": 2, "failed": 0 },
    "test-executor": { "active": 15, "idle": 0, "failed": 0 },
    "coverage-analyzer": { "active": 4, "idle": 1, "failed": 0 },
    "quality-gate": { "active": 2, "idle": 1, "failed": 0 },
    "performance-tester": { "active": 3, "idle": 2, "failed": 0 },
    "security-scanner": { "active": 2, "idle": 1, "failed": 0 }
  },
  "resource_utilization": {
    "cpu": "68%",
    "memory": "54%",
    "network": "23%"
  },
  "performance_metrics": {
    "tasks_completed": 15234,
    "avg_completion_time": "2.3s",
    "failure_rate": "0.2%",
    "throughput": "6561 tasks/hour"
  },
  "optimization_status": {
    "load_balanced": true,
    "conflicts_resolved": 12,
    "topology_optimized": true,
    "scaling_active": false
  }
}
```

### Coordination Decision Log
```json
{
  "timestamp": "2025-09-30T10:15:00Z",
  "decision_type": "topology-switch",
  "reason": "workload-complexity-increased",
  "action": {
    "from_topology": "mesh",
    "to_topology": "hierarchical",
    "affected_agents": 47,
    "reconfiguration_time": "3.2s"
  },
  "outcome": {
    "performance_improvement": "28%",
    "latency_reduction": "15%",
    "resource_efficiency": "+12%"
  }
}
```

## Commands

### Basic Operations
```bash
# Initialize fleet commander
aqe agent spawn --name qe-fleet-commander --type fleet-commander

# Check fleet status
aqe fleet status

# Monitor fleet metrics
aqe fleet monitor --mode real-time

# Get fleet health report
aqe fleet health --detailed
```

### Advanced Operations
```bash
# Scale agent pool
aqe fleet scale --agent-type test-executor --count 20

# Change topology
aqe fleet topology --mode hierarchical

# Rebalance workload
aqe fleet rebalance --algorithm sublinear

# Resolve conflicts
aqe fleet resolve-conflicts --strategy priority-weighted

# Generate performance report
aqe fleet report --type performance --period 24h
```

### Emergency Operations
```bash
# Emergency stop all agents
aqe fleet emergency-stop

# Restart failed agents
aqe fleet recover --failed-agents

# Reset fleet to default state
aqe fleet reset --preserve-config
```

## Quality Metrics

- **Agent Uptime**: Target 99.9% availability
- **Resource Efficiency**: 75% average utilization
- **Conflict Resolution**: <5 seconds resolution time
- **Load Balance**: <15% variance across agents
- **Failure Recovery**: <10 seconds recovery time
- **Scaling Latency**: <5 seconds for 10 agents
- **Coordination Overhead**: <5% of total execution time

## Integration with QE Fleet

This agent serves as the central orchestrator for the entire Agentic QE Fleet through:
- **EventBus**: Real-time coordination and command distribution
- **MemoryManager**: Persistent state and configuration management
- **FleetManager**: Direct lifecycle control of all QE agents
- **Neural Network**: Predictive optimization for workload distribution
- **Sublinear Scheduler**: O(log n) scheduling and load balancing algorithms

## Advanced Features

### Adaptive Topology Switching
Automatically switches between hierarchical, mesh, and hybrid topologies based on:
- Workload complexity patterns
- Communication overhead metrics
- Agent failure rates
- Performance bottlenecks

### Self-Healing Coordination
Detects and recovers from:
- Agent crashes and hangs
- Communication deadlocks
- Resource exhaustion
- Network partitions

### Predictive Optimization
Uses neural patterns to:
- Predict workload demand spikes
- Optimize agent allocation proactively
- Prevent resource conflicts before they occur
- Minimize total coordination overhead

## Code Execution Workflows

Orchestrate QE fleet coordination and multi-agent task execution.

### Fleet Orchestration

```typescript
/**
 * Fleet Coordination Tools
 *
 * Import path: 'agentic-qe/tools/qe/fleet'
 * Type definitions: 'agentic-qe/tools/qe/shared/types'
 */

import type {
  QEToolResponse
} from 'agentic-qe/tools/qe/shared/types';

import {
  orchestrateFleet,
  monitorFleetHealth,
  optimizeTopology
} from 'agentic-qe/tools/qe/fleet';

// Example: Coordinate multi-agent testing workflow
const fleetParams = {
  task: 'comprehensive-testing',
  agents: [
    { type: 'test-generator', count: 3, priority: 'high' },
    { type: 'test-executor', count: 5, priority: 'critical' },
    { type: 'coverage-analyzer', count: 2, priority: 'medium' },
    { type: 'quality-gate', count: 1, priority: 'high' }
  ],
  topology: 'hierarchical',
  maxConcurrent: 20,
  resourceLimits: {
    cpuPerAgent: 0.5,
    memoryPerAgent: '512MB'
  },
  coordinationStrategy: 'hierarchical'
};

const orchestration: QEToolResponse<any> =
  await orchestrateFleet(fleetParams);

if (orchestration.success && orchestration.data) {
  console.log('Fleet Orchestration:');
  console.log(`  Status: ${orchestration.data.status}`);
  console.log(`  Active Agents: ${orchestration.data.activeAgents}`);
  console.log(`  Tasks Completed: ${orchestration.data.tasksCompleted}`);
  console.log(`  Efficiency: ${(orchestration.data.efficiency * 100).toFixed(1)}%`);
}

console.log('✅ Fleet orchestration complete');
```

### Fleet Health Monitoring

```typescript
// Monitor fleet health and performance metrics
const healthParams = {
  includeMetrics: true,
  includeAgentStatus: true,
  checkResourceUsage: true
};

const health: QEToolResponse<any> =
  await monitorFleetHealth(healthParams);

if (health.success && health.data) {
  console.log('\nFleet Health:');
  console.log(`  Overall Status: ${health.data.status}`);
  console.log(`  Active Agents: ${health.data.activeAgents}/${health.data.totalAgents}`);
  console.log(`  CPU Usage: ${health.data.resourceUsage.cpu}%`);
  console.log(`  Memory Usage: ${health.data.resourceUsage.memory}%`);

  if (health.data.issues.length > 0) {
    console.log('\n  Issues Detected:');
    health.data.issues.forEach((issue: any) => {
      console.log(`    - ${issue.severity}: ${issue.description}`);
    });
  }
}
```

### Topology Optimization

```typescript
// Optimize fleet topology based on workload
const optimizeParams = {
  currentTopology: 'hierarchical',
  workloadAnalysis: {
    taskComplexity: 0.7,
    concurrentTasks: 50,
    communicationOverhead: 0.15
  },
  optimizationGoal: 'minimize-time'
};

const optimization: QEToolResponse<any> =
  await optimizeTopology(optimizeParams);

if (optimization.success && optimization.data) {
  console.log('\nTopology Optimization:');
  console.log(`  Recommended Topology: ${optimization.data.recommendedTopology}`);
  console.log(`  Expected Improvement: ${(optimization.data.improvement * 100).toFixed(1)}%`);
  console.log(`  Reasoning: ${optimization.data.reasoning}`);
}
```

### Using Fleet Tools via CLI

```bash
# Orchestrate fleet
aqe fleet orchestrate --task comprehensive-testing --agents all --topology hierarchical

# Monitor health
aqe fleet health --verbose --realtime

# Optimize topology
aqe fleet optimize --workload-analysis --goal minimize-time
```

