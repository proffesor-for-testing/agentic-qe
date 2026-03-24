---
name: "qe-chaos-resilience"
description: "Inject faults into distributed systems, run load/stress tests, validate recovery and circuit breakers. Use when testing system resilience or running chaos experiments."
---

# QE Chaos Resilience

Run controlled chaos experiments to validate system resilience through fault injection, load testing, stress testing, and disaster recovery validation.

## Workflow

1. **Define hypothesis** — What behavior do you expect under failure?
2. **Configure safety controls** — Set blast radius, abort conditions, rollback triggers
3. **Inject fault** — Run the experiment against the target service
4. **Monitor metrics** — Track response time, error rate, throughput during experiment
5. **Validate recovery** — Confirm the system recovers within SLA thresholds
6. **Document findings** — Record severity, recommendations, and artifacts

## Quick Start

```bash
# Run chaos experiment
aqe chaos run --experiment network-latency --target api-service

# Load test
aqe chaos load --scenario peak-traffic --duration 30m

# Stress test to breaking point
aqe chaos stress --endpoint /api/users --max-users 10000

# Test circuit breaker
aqe chaos circuit-breaker --service payment-service
```

## Fault Injection Example

```typescript
await chaosEngineer.injectFault({
  target: 'api-service',
  fault: { type: 'latency', parameters: { delay: '500ms', jitter: '100ms', percentage: 50 } },
  duration: '5m',
  monitoring: { metrics: ['response_time', 'error_rate', 'throughput'], alerts: true },
  rollback: { automatic: true, trigger: 'error_rate > 10%' }
});
```

## Load & Stress Testing

```typescript
// Load test with SLA assertions
await loadTester.execute({
  scenario: 'peak-traffic',
  profile: { rampUp: '5m', steadyState: '30m', rampDown: '5m' },
  users: { initial: 100, target: 5000, pattern: 'linear' },
  assertions: { p95_latency: '<500ms', error_rate: '<1%', throughput: '>1000rps' }
});

// Stress test to find breaking point
await loadTester.stressTest({
  endpoint: '/api/checkout',
  strategy: 'step-increase',
  steps: [100, 500, 1000, 2000, 5000],
  stepDuration: '5m',
  findBreakingPoint: true
});
```

## Fault Types

| Fault | Description | Use Case |
|-------|-------------|----------|
| Latency | Add network delay | Test timeouts |
| Packet Loss | Drop network packets | Test retry logic |
| CPU Stress | Consume CPU | Test resource limits |
| Memory Pressure | Consume memory | Test OOM handling |
| Disk Full | Fill disk space | Test disk errors |
| Process Kill | Terminate process | Test recovery |

## Safety Controls

```yaml
safety:
  blast_radius:
    max_affected_pods: 1
    max_affected_percentage: 10
  abort_conditions:
    - error_rate > 50%
    - p99_latency > 10s
    - service_unavailable
  required_approvals:
    production: 2
    staging: 0
```

## Agent Coordination

```typescript
// Parallel chaos experiment workflow
Task("Run chaos experiment", `
  Inject 500ms latency on api-service, monitor health, verify circuit breaker, measure recovery
`, "qe-chaos-engineer")

Task("Performance load test", `
  Simulate peak traffic: 10,000 concurrent users for 30 min, compare against SLAs
`, "qe-load-tester")
```

**Primary Agents**: qe-chaos-engineer, qe-load-tester, qe-resilience-tester
**Related Skills**: qe-performance, security-testing
