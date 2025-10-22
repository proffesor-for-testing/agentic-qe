---
name: aqe-chaos
description: Run chaos testing scenarios to validate system resilience and fault tolerance
---

# AQE Chaos Testing

Run chaos testing scenarios to validate system resilience and fault tolerance.

## Usage

```bash
aqe chaos <scenario> [options]
# or
/aqe-chaos <scenario> [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scenario` | string | **required** | Chaos scenario: latency, failure, resource-exhaustion, network-partition |
| `--duration` | number | `60` | Test duration in seconds |
| `--intensity` | string | `medium` | Intensity: low, medium, high, extreme |
| `--target` | string | `all` | Target services/components |
| `--recovery-check` | boolean | `true` | Verify system recovery after chaos |
| `--baseline` | path | - | Baseline metrics for comparison |
| `--abort-on-critical` | boolean | `true` | Abort if critical failure detected |

## Examples

### Simulate Latency

```bash
aqe chaos latency --duration 60 --intensity medium
```

Injects network latency for 60 seconds at medium intensity.

### Test Failure Scenarios

```bash
aqe chaos failure --target api-gateway --duration 120
```

Simulates API gateway failures for 2 minutes.

### Resource Exhaustion

```bash
aqe chaos resource-exhaustion --intensity high --recovery-check
```

Tests system behavior under high resource pressure with recovery validation.

### Network Partition

```bash
aqe chaos network-partition --duration 180 --target database
```

Simulates network partition between application and database for 3 minutes.

### Combined Chaos

```bash
aqe chaos latency --intensity low --target api &
aqe chaos failure --intensity low --target database &
wait
```

Runs multiple chaos scenarios simultaneously.

## Integration with Claude Code

### Spawning Chaos Testing Agent

```javascript
// Use Claude Code's Task tool to spawn the chaos testing agent
Task("Execute chaos testing scenario", `
  Run comprehensive chaos testing:
  - Scenario: Network latency + occasional failures
  - Duration: 5 minutes
  - Intensity: Medium
  - Monitor: Response times, error rates, recovery time

  Verify system resilience and document failure modes.
  Store results in memory: aqe/chaos/{chaos-id}
`, "qe-test-executor")
```

### Chaos Engineering Workflow

```javascript
// Systematic chaos testing with monitoring
[Single Message]:
  Task("Run chaos scenario", "Inject latency and monitor system", "qe-test-executor")
  Task("Monitor performance", "Track degradation and recovery", "qe-performance-tester")
  Task("Validate security", "Ensure no security issues during chaos", "qe-security-scanner")

  TodoWrite({ todos: [
    {content: "Inject chaos conditions", status: "in_progress", activeForm: "Injecting chaos"},
    {content: "Monitor system behavior", status: "in_progress", activeForm: "Monitoring behavior"},
    {content: "Validate security posture", status: "in_progress", activeForm: "Validating security"},
    {content: "Verify recovery", status: "pending", activeForm: "Verifying recovery"},
    {content: "Generate chaos report", status: "pending", activeForm: "Generating report"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-test-executor**: Main agent with chaos testing module

### Supporting Agents
- **qe-performance-tester**: Monitors performance impact
- **qe-security-scanner**: Checks for security vulnerabilities during chaos

### Coordination Flow

```
1. Pre-Chaos Hook
   ├─> Establish baseline metrics
   ├─> Verify system health
   ├─> Configure chaos parameters
   └─> Prepare recovery procedures

2. Chaos Injection
   ├─> Begin chaos scenario
   ├─> Monitor system continuously
   ├─> Track performance degradation
   ├─> Record failure modes
   └─> Detect critical failures

3. Recovery Phase
   ├─> Stop chaos injection
   ├─> Verify system recovery
   ├─> Measure recovery time
   ├─> Validate system health
   └─> Compare with baseline

4. Post-Chaos Hook
   ├─> Store chaos results
   ├─> Generate failure report
   ├─> Document lessons learned
   ├─> Train neural patterns
   └─> Notify fleet of findings
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve baseline metrics
npx claude-flow@alpha memory retrieve --key "aqe/chaos/baseline"

# Retrieve system configuration
npx claude-flow@alpha memory retrieve --key "aqe/system/config"

# Retrieve previous chaos results
npx claude-flow@alpha memory retrieve --key "aqe/chaos/history"
```

### Output Memory Keys

```bash
# Store chaos results
npx claude-flow@alpha memory store \
  --key "aqe/chaos/${chaos_id}" \
  --value '{"scenario": "latency", "duration": 60, "failures": 3}'

# Store failure modes
npx claude-flow@alpha memory store \
  --key "aqe/chaos/failure-modes" \
  --value '[{"type": "timeout", "count": 12, "severity": "medium"}]'

# Store recovery metrics
npx claude-flow@alpha memory store \
  --key "aqe/chaos/recovery" \
  --value '{"recoveryTime": 45, "dataLoss": false, "status": "healthy"}'
```

## Hooks and Coordination

### Pre-Task Hook

```bash
npx claude-flow@alpha hooks pre-task \
  --description "Chaos test: ${scenario}" \
  --agent "qe-test-executor"
```

### During Chaos (monitoring)

```bash
npx claude-flow@alpha hooks notify \
  --message "Chaos active: ${scenario} - ${ELAPSED}s / ${DURATION}s"
```

### Post-Task Hook

```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${CHAOS_ID}" \
  --results "${CHAOS_RESULTS}"
```

## Expected Outputs

### Latency Scenario Output

```
💥 Running chaos test: latency
   Duration: 60s
   Intensity: medium
   Target: all services

[00:00] ✓ Baseline established
        └─> Avg latency: 45ms, P95: 120ms, P99: 250ms

[00:10] ⚡ Injecting latency (150ms)
        └─> Current latency: 195ms, P95: 270ms, P99: 420ms

[00:30] ⚡ Latency active (150ms)
        └─> Current latency: 198ms, P95: 285ms, P99: 445ms
        ⚠️  3 timeouts detected

[00:60] ✓ Chaos stopped, monitoring recovery
        └─> Current latency: 52ms, P95: 130ms, P99: 260ms

[01:30] ✓ Recovery complete
        └─> Final latency: 46ms, P95: 122ms, P99: 255ms

📊 Chaos Test Results:
   Scenario: Latency injection (150ms)
   Duration: 60s

   Impact:
   • Timeouts: 3 (0.5% of requests)
   • Errors: 0
   • Avg latency increase: +153ms
   • Max latency: 445ms (P99)

   Recovery:
   • Recovery time: 30s
   • Data loss: None
   • Final status: ✅ Healthy

✅ Chaos test completed! System resilient.
```

### Failure Scenario Output

```
💥 Running chaos test: failure
   Duration: 120s
   Intensity: high
   Target: api-gateway

[00:00] ✓ Baseline established
        └─> Success rate: 100%, Avg response: 45ms

[00:10] 💥 Injecting random failures (30% error rate)
        └─> Success rate: 70%, Errors: 30%

[00:30] ⚠️  Circuit breaker triggered
        └─> Fallback activated, Success rate: 95%

[00:60] 💥 Failures active (30% error rate)
        └─> Success rate: 96%, Circuit breaker: OPEN

[02:00] ✓ Chaos stopped, monitoring recovery
        └─> Success rate: 98%, Circuit breaker: HALF_OPEN

[02:30] ✓ Recovery complete
        └─> Success rate: 100%, Circuit breaker: CLOSED

📊 Chaos Test Results:
   Scenario: Random failures (30% rate)
   Duration: 120s

   Impact:
   • Total requests: 2,400
   • Failed requests: 720 (30%)
   • Circuit breaker activations: 1
   • Fallback activations: 680

   Resilience:
   • Circuit breaker: ✅ Working
   • Fallback: ✅ Effective (94.4% success)
   • Recovery time: 30s
   • Data consistency: ✅ Maintained

✅ Chaos test completed! Resilience mechanisms effective.
```

### Chaos Test Report

```json
{
  "chaosId": "qe-chaos-1727683200-12345",
  "scenario": "latency",
  "parameters": {
    "duration": 60,
    "intensity": "medium",
    "target": "all",
    "latencyMs": 150
  },
  "baseline": {
    "avgLatency": 45,
    "p95Latency": 120,
    "p99Latency": 250,
    "successRate": 100
  },
  "impact": {
    "totalRequests": 600,
    "timeouts": 3,
    "errors": 0,
    "avgLatencyIncrease": 153,
    "maxLatencyP99": 445
  },
  "recovery": {
    "recoveryTime": 30,
    "dataLoss": false,
    "finalStatus": "healthy",
    "metrics": {
      "avgLatency": 46,
      "p95Latency": 122,
      "p99Latency": 255,
      "successRate": 100
    }
  },
  "failureModes": [
    {
      "type": "timeout",
      "count": 3,
      "severity": "low",
      "service": "api-gateway"
    }
  ],
  "recommendations": [
    "Consider increasing timeout thresholds",
    "Monitor P99 latency more closely",
    "Add retry logic for timeout scenarios"
  ],
  "timestamp": "2025-09-30T10:25:00Z"
}
```

## Chaos Scenarios

### Latency
- **Description**: Injects network latency
- **Use case**: Test timeout handling, retry logic
- **Intensity levels**: 50ms (low), 150ms (medium), 500ms (high), 2000ms (extreme)

### Failure
- **Description**: Random service failures
- **Use case**: Test circuit breakers, fallbacks
- **Intensity levels**: 5% (low), 15% (medium), 30% (high), 50% (extreme)

### Resource Exhaustion
- **Description**: CPU, memory, or disk pressure
- **Use case**: Test resource limits, scaling
- **Intensity levels**: 50% (low), 70% (medium), 90% (high), 100% (extreme)

### Network Partition
- **Description**: Simulates network splits
- **Use case**: Test distributed system behavior
- **Intensity levels**: Partial (low), Full (high)

## Error Handling

### Critical Failure Detected

```bash
❌ CRITICAL: System unresponsive during chaos test
   Aborting chaos scenario...
   Initiating emergency recovery...

✓ Chaos stopped
✓ System recovering...

⚠️  Manual intervention may be required
```

**Solution:** System automatically aborts and begins recovery.

### Recovery Failed

```bash
❌ ERROR: System did not recover within timeout (300s)
   Final status: Degraded

Failed checks:
   • Health endpoint: Timeout
   • Database: Disconnected
   • Cache: Unavailable

Manual recovery required.
```

**Solution:** Manual intervention needed to restore system.

### Target Not Found

```bash
❌ Error: Target service 'invalid-service' not found

Available targets:
   - api-gateway
   - database
   - cache
   - all
```

**Solution:** Use valid target service name.

## Performance Characteristics

- **Time Complexity**: Variable (depends on scenario duration)
- **Target Duration**: 60-300s typical scenarios
- **Memory Usage**: ~1GB peak
- **Monitoring Overhead**: <5% performance impact

## Safety Considerations

⚠️  **WARNING**: Chaos testing can cause temporary service degradation.

- Always run in non-production environments first
- Have recovery procedures ready
- Monitor system closely during tests
- Use `--abort-on-critical` to prevent severe damage
- Start with low intensity and increase gradually
- Notify team before running chaos tests

## See Also

- `/aqe-execute` - Execute tests
- `/aqe-benchmark` - Performance benchmarking
- `/aqe-report` - Generate chaos test reports
- `/aqe-fleet-status` - Monitor fleet health during chaos