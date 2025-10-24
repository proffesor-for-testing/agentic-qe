---
name: chaos-engineering-resilience
description: Chaos engineering principles, controlled failure injection, resilience testing, and system recovery validation. Use when testing distributed systems, building confidence in fault tolerance, or validating disaster recovery.
version: 1.0.0
category: specialized-testing
tags: [chaos-engineering, resilience, fault-injection, disaster-recovery, distributed-systems]
difficulty: advanced
estimated_time: 90 minutes
author: agentic-qe
---

# Chaos Engineering & Resilience Testing

## Core Principle

**Systems fail. Build systems that fail gracefully.**

Chaos engineering proactively introduces failures to discover weaknesses before they cause outages. Resilience testing validates recovery capabilities.

## What is Chaos Engineering?

**Chaos Engineering:** Experimenting on distributed systems to build confidence in system ability to withstand turbulent conditions.

**Principles:**
1. Define steady state (normal metrics)
2. Hypothesize steady state continues
3. Introduce real-world failures
4. Try to disprove hypothesis
5. Fix weaknesses, repeat

## Types of Failures to Inject

### Network Failures
- Latency injection
- Packet loss
- Network partitions
- DNS failures
- Connection timeouts

### Infrastructure Failures
- Instance termination
- Disk failures
- CPU exhaustion
- Memory pressure
- Cascading failures

### Application Failures
- Exceptions
- Slow responses
- Resource leaks
- Deadlocks

## Controlled Experiments

**Start small, increase blast radius gradually:**
```
1. Development: Test locally
2. Staging: Test in staging environment
3. Production Canary: 1% of traffic
4. Production Gradual: 10% → 50% → 100%
```

## Netflix Chaos Monkey

**Randomly terminates instances:**
```javascript
// Chaos Monkey configuration
{
  "enabled": true,
  "meanTimeBetweenKillsInWorkDays": 2,
  "minTimeBetweenKillsInWorkDays": 1,
  "grouping": "cluster",
  "regions": ["us-east-1"],
  "exceptions": ["production-critical"]
}
```

## With qe-chaos-engineer Agent

```typescript
// Agent runs controlled chaos experiments
const experiment = await agent.runChaosExperiment({
  target: 'payment-service',
  failure: 'terminate-random-instance',
  blastRadius: '10%',
  duration: '5m',
  steadyStateHypothesis: {
    metric: 'success-rate',
    threshold: 0.99
  }
});

// Verifies:
// - System recovers automatically
// - Error rate stays below threshold
// - No data loss
// - Alerts triggered appropriately
```

## Remember

**Break things on purpose to prevent unplanned outages.**

- Find weaknesses before users do
- Build confidence in system resilience
- Validate recovery procedures work
- Create runbooks from experiments

**With Agents:** `qe-chaos-engineer` automates chaos experiments with blast radius control, automatic rollback, and comprehensive resilience validation.
