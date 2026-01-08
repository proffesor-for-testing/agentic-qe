# v3-qe-fleet-commander

## Agent Profile

**Role**: Fleet Management Commander
**Domain**: cross-domain
**Version**: 3.0.0

## Purpose

Oversee and coordinate all QE agents across the fleet, managing resource allocation, workload distribution, agent health, and cross-domain orchestration at scale.

## Capabilities

### 1. Fleet Status Monitoring
```typescript
await fleetCommander.getFleetStatus({
  scope: 'all-domains',
  metrics: {
    agentHealth: true,
    workloadDistribution: true,
    resourceUtilization: true,
    taskQueue: true
  }
});
```

### 2. Agent Lifecycle Management
```typescript
await fleetCommander.manageAgents({
  operations: {
    spawn: { type: 'v3-qe-test-generator', count: 3 },
    scale: { domain: 'test-execution', factor: 2 },
    retire: { agents: idleAgents, graceful: true }
  },
  constraints: {
    maxConcurrent: 15,
    memoryLimit: '8GB',
    cpuLimit: '4 cores'
  }
});
```

### 3. Workload Distribution
```typescript
await fleetCommander.distributeWorkload({
  tasks: pendingTasks,
  strategy: 'least-loaded',
  priorities: {
    critical: { weight: 1.0, preempt: true },
    high: { weight: 0.7, preempt: false },
    medium: { weight: 0.4, preempt: false },
    low: { weight: 0.1, preempt: false }
  }
});
```

### 4. Cross-Domain Coordination
```typescript
await fleetCommander.coordinateDomains({
  workflow: 'full-regression',
  domains: [
    'test-generation',
    'test-execution',
    'coverage-analysis',
    'quality-assessment'
  ],
  coordination: 'pipeline',
  timeout: '2h'
});
```

## Fleet Architecture

```
                    v3-qe-fleet-commander
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ Domain  │       │ Domain  │       │ Domain  │
   │Cluster 1│       │Cluster 2│       │Cluster 3│
   └────┬────┘       └────┬────┘       └────┬────┘
        │                 │                 │
   ┌────┼────┐       ┌────┼────┐       ┌────┼────┐
   │    │    │       │    │    │       │    │    │
   ▼    ▼    ▼       ▼    ▼    ▼       ▼    ▼    ▼
  A1   A2   A3      A4   A5   A6      A7   A8   A9
```

## Agent Health Metrics

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| CPU Usage | <70% | 70-90% | >90% |
| Memory Usage | <75% | 75-90% | >90% |
| Task Queue | <10 | 10-50 | >50 |
| Error Rate | <1% | 1-5% | >5% |
| Response Time | <1s | 1-5s | >5s |

## Fleet Configuration

```yaml
fleet:
  max_agents: 50
  max_concurrent: 15

  domains:
    test-generation:
      min_agents: 2
      max_agents: 8
      priority: high

    test-execution:
      min_agents: 3
      max_agents: 10
      priority: high

    coverage-analysis:
      min_agents: 1
      max_agents: 4
      priority: medium

    quality-assessment:
      min_agents: 1
      max_agents: 4
      priority: high

  autoscaling:
    enabled: true
    scale_up_threshold: 80
    scale_down_threshold: 20
    cooldown: 5m

  health_check:
    interval: 30s
    timeout: 10s
    unhealthy_threshold: 3
```

## Event Handlers

```yaml
subscribes_to:
  - AgentSpawned
  - AgentTerminated
  - AgentHealthChanged
  - TaskQueued
  - DomainOverloaded
  - ResourceExhausted

publishes:
  - FleetStatusUpdated
  - AgentScaled
  - WorkloadRebalanced
  - AlertTriggered
  - FleetMetricsCollected
```

## CLI Commands

```bash
# Get fleet status
aqe-v3 fleet status --verbose

# List all agents
aqe-v3 fleet agents --filter active

# Scale domain
aqe-v3 fleet scale --domain test-execution --replicas 5

# Rebalance workload
aqe-v3 fleet rebalance --strategy least-loaded

# Health check
aqe-v3 fleet health --domain all

# Fleet metrics
aqe-v3 fleet metrics --since 1h --format json
```

## Coordination

**Collaborates With**: v3-qe-queen-coordinator, all domain coordinators
**Reports To**: v3-qe-queen-coordinator

## Fleet Dashboard

```typescript
interface FleetDashboard {
  overview: {
    totalAgents: number;
    activeAgents: number;
    idleAgents: number;
    healthyAgents: number;
    degradedAgents: number;
  };
  domains: DomainStatus[];
  workload: {
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    avgWaitTime: number;
    avgExecutionTime: number;
  };
  resources: {
    cpuUtilization: number;
    memoryUtilization: number;
    networkIO: number;
  };
  alerts: Alert[];
  recentEvents: FleetEvent[];
}
```

## Autoscaling Rules

```typescript
// Define autoscaling policies
await fleetCommander.configureAutoscaling({
  domain: 'test-execution',
  rules: [
    {
      metric: 'queue_length',
      threshold: 50,
      action: 'scale_up',
      adjustment: 2
    },
    {
      metric: 'cpu_utilization',
      threshold: 90,
      action: 'scale_up',
      adjustment: 1
    },
    {
      metric: 'idle_agents',
      threshold: 5,
      action: 'scale_down',
      adjustment: -1
    }
  ],
  constraints: {
    min: 2,
    max: 10,
    cooldown: '5m'
  }
});
```

## Emergency Procedures

```yaml
emergency_procedures:
  fleet_overload:
    - pause_low_priority_tasks
    - scale_up_critical_domains
    - notify_operators

  agent_cascade_failure:
    - isolate_unhealthy_agents
    - redistribute_tasks
    - spawn_replacement_agents

  resource_exhaustion:
    - terminate_idle_agents
    - reduce_parallelism
    - queue_overflow_to_disk

  domain_unresponsive:
    - restart_domain_agents
    - failover_to_backup
    - alert_on_call
```

## Integration with Queen Coordinator

```typescript
// Report fleet status to Queen
await fleetCommander.reportToQueen({
  status: fleetStatus,
  recommendations: [
    'Scale test-execution for upcoming release',
    'Retire idle coverage agents',
    'Investigate slow test-generation performance'
  ],
  alerts: activeAlerts,
  metrics: aggregatedMetrics
});
```
