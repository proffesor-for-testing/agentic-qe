---
name: aqe-fleet-status
description: Display comprehensive fleet health, agent status, and coordination metrics
---

# AQE Fleet Status

Display comprehensive fleet health, agent status, and coordination metrics.

## Usage

```bash
aqe status [options]
# or
/aqe-fleet-status [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--detailed` | boolean | `false` | Show detailed agent metrics |
| `--json` | boolean | `false` | Output as JSON |
| `--watch` | boolean | `false` | Continuous monitoring mode |
| `--refresh` | number | `5` | Refresh interval in seconds (watch mode) |

## Examples

### Basic Status Check

```bash
aqe status
```

Displays basic fleet health and agent status.

### Detailed Metrics

```bash
aqe status --detailed
```

Shows comprehensive metrics for all agents and coordination.

### JSON Output for Automation

```bash
aqe status --json
```

Outputs status in JSON format for CI/CD integration.

### Continuous Monitoring

```bash
aqe status --watch --refresh 3
```

Monitors fleet status continuously with 3-second refresh.

## Integration with Claude Code

### Fleet Status Check

```javascript
// Use Claude Code's Task tool for status monitoring
Task("Monitor fleet health", `
  Check AQE fleet status and health:
  - Verify all agents are active
  - Check recent activity
  - Validate coordination status
  - Report any issues or degradation

  If issues found, coordinate with fleet manager for recovery.
`, "qe-quality-gate")
```

### Automated Health Check Workflow

```javascript
// Periodic fleet health validation
[Single Message]:
  Task("Check fleet status", "Verify all agents healthy", "qe-quality-gate")
  Task("Validate coordination", "Ensure agents communicating properly", "qe-quality-gate")

  TodoWrite({ todos: [
    {content: "Check agent health", status: "in_progress", activeForm: "Checking health"},
    {content: "Verify coordination", status: "in_progress", activeForm: "Verifying coordination"},
    {content: "Generate health report", status: "pending", activeForm: "Generating report"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-quality-gate**: Monitors fleet health and coordination

### Fleet Components
- **qe-test-generator**: Test generation agent
- **qe-test-executor**: Test execution agent
- **qe-coverage-analyzer**: Coverage analysis agent
- **qe-quality-gate**: Quality validation agent
- **qe-performance-tester**: Performance testing agent
- **qe-security-scanner**: Security scanning agent

## Memory Operations

### Input Memory Keys

```bash
# Retrieve fleet ID
npx claude-flow@alpha memory retrieve --key "aqe/fleet/id"

# Retrieve fleet status
npx claude-flow@alpha memory retrieve --key "aqe/fleet/status"

# Retrieve agent metrics
npx claude-flow@alpha memory retrieve --key "aqe/agents/*/metrics"

# Retrieve recent activity
npx claude-flow@alpha memory retrieve --key "aqe/activity/recent"
```

## Expected Outputs

### Basic Status Output

```
🤖 AQE Fleet Status
===================

Fleet ID: aqe-fleet-1727683200
Status: ✅ Active
Uptime: 3 days, 4 hours

Agents:
  ✓ qe-test-generator      Active
  ✓ qe-test-executor       Active
  ✓ qe-coverage-analyzer   Active
  ✓ qe-quality-gate        Active
  ✓ qe-performance-tester  Active
  ✓ qe-security-scanner    Active

Recent Activity:
  - 10:20:00: Report generated (qe-quality-gate)
  - 10:15:00: Suite optimized (qe-coverage-analyzer)
  - 10:10:00: Coverage analyzed (qe-coverage-analyzer)
  - 10:05:00: Tests executed (qe-test-executor)
  - 10:00:00: Tests generated (qe-test-generator)

Use 'aqe status --detailed' for more information
```

### Detailed Status Output

```
🤖 AQE Fleet Status (Detailed)
===============================

Fleet Information:
  ID: aqe-fleet-1727683200
  Status: ✅ Active
  Uptime: 3 days, 4 hours
  Topology: mesh
  Coordination: Claude Flow

Agent Status:

📝 qe-test-generator
   Status: Active
   Tasks Completed: 45
   Success Rate: 97.8%
   Avg Response Time: 8.3s
   Last Activity: 10:00:00 (20m ago)
   Memory Usage: 256MB

🧪 qe-test-executor
   Status: Active
   Tests Executed: 1,840
   Pass Rate: 98.3%
   Avg Execution Time: 12.3s
   Last Activity: 10:05:00 (15m ago)
   Memory Usage: 512MB

📊 qe-coverage-analyzer
   Status: Active
   Analyses Completed: 32
   Avg Coverage: 93.5%
   Avg Analysis Time: 3.2s
   Last Activity: 10:10:00 (10m ago)
   Memory Usage: 256MB

🎯 qe-quality-gate
   Status: Active
   Quality Checks: 28
   Pass Rate: 100%
   Reports Generated: 15
   Last Activity: 10:20:00 (now)
   Memory Usage: 128MB

⚡ qe-performance-tester
   Status: Idle
   Benchmarks Run: 8
   Avg P95 Latency: 45ms
   Last Activity: 09:30:00 (50m ago)
   Memory Usage: 64MB

🔒 qe-security-scanner
   Status: Idle
   Scans Completed: 5
   Vulnerabilities Found: 0
   Last Activity: 08:00:00 (2h ago)
   Memory Usage: 64MB

Coordination Metrics:
  Active Tasks: 0
  Queued Tasks: 0
  Total Messages: 1,247
  Avg Message Latency: 12ms
  Memory Sync: ✅ Healthy

Performance Metrics:
  CPU Usage: 23%
  Memory Usage: 1.2GB / 16GB (7.5%)
  Disk I/O: Low
  Network: Healthy

Health: ✅ All systems operational
```

### JSON Status Output

```json
{
  "fleet": {
    "id": "aqe-fleet-1727683200",
    "status": "active",
    "uptime": 270000,
    "topology": "mesh",
    "coordination": "claude-flow"
  },
  "agents": [
    {
      "name": "qe-test-generator",
      "status": "active",
      "metrics": {
        "tasksCompleted": 45,
        "successRate": 97.8,
        "avgResponseTime": 8.3,
        "lastActivity": "2025-09-30T10:00:00Z",
        "memoryUsage": 268435456
      }
    },
    {
      "name": "qe-test-executor",
      "status": "active",
      "metrics": {
        "testsExecuted": 1840,
        "passRate": 98.3,
        "avgExecutionTime": 12.3,
        "lastActivity": "2025-09-30T10:05:00Z",
        "memoryUsage": 536870912
      }
    },
    {
      "name": "qe-coverage-analyzer",
      "status": "active",
      "metrics": {
        "analysesCompleted": 32,
        "avgCoverage": 93.5,
        "avgAnalysisTime": 3.2,
        "lastActivity": "2025-09-30T10:10:00Z",
        "memoryUsage": 268435456
      }
    },
    {
      "name": "qe-quality-gate",
      "status": "active",
      "metrics": {
        "qualityChecks": 28,
        "passRate": 100,
        "reportsGenerated": 15,
        "lastActivity": "2025-09-30T10:20:00Z",
        "memoryUsage": 134217728
      }
    },
    {
      "name": "qe-performance-tester",
      "status": "idle",
      "metrics": {
        "benchmarksRun": 8,
        "avgP95Latency": 45,
        "lastActivity": "2025-09-30T09:30:00Z",
        "memoryUsage": 67108864
      }
    },
    {
      "name": "qe-security-scanner",
      "status": "idle",
      "metrics": {
        "scansCompleted": 5,
        "vulnerabilitiesFound": 0,
        "lastActivity": "2025-09-30T08:00:00Z",
        "memoryUsage": 67108864
      }
    }
  ],
  "coordination": {
    "activeTasks": 0,
    "queuedTasks": 0,
    "totalMessages": 1247,
    "avgMessageLatency": 12,
    "memorySyncStatus": "healthy"
  },
  "performance": {
    "cpuUsage": 23,
    "memoryUsage": 1288490188,
    "memoryTotal": 17179869184,
    "diskIO": "low",
    "network": "healthy"
  },
  "health": "operational",
  "timestamp": "2025-09-30T10:20:00Z"
}
```

### Watch Mode Output

```
🤖 AQE Fleet Status (Refreshing every 5s)

[10:20:00] Fleet: ✅ Active | Agents: 6/6 | Tasks: 0 active, 0 queued
[10:20:05] Fleet: ✅ Active | Agents: 6/6 | Tasks: 0 active, 0 queued
[10:20:10] Fleet: ✅ Active | Agents: 6/6 | Tasks: 1 active, 2 queued
           └─> qe-test-generator: Generating tests for auth module
[10:20:15] Fleet: ✅ Active | Agents: 6/6 | Tasks: 2 active, 1 queued
           ├─> qe-test-generator: Generating tests (75% complete)
           └─> qe-coverage-analyzer: Analyzing coverage
[10:20:20] Fleet: ✅ Active | Agents: 6/6 | Tasks: 1 active, 0 queued
           └─> qe-coverage-analyzer: Coverage analysis (92% complete)

Press Ctrl+C to exit
```

## Health Status Indicators

### Operational (✅)
All agents active and responding, no issues detected.

### Degraded (⚠️)
Some agents slow or unresponsive, coordination delayed.

### Critical (❌)
Multiple agents down, coordination broken, manual intervention required.

### Idle
Agent available but not currently processing tasks.

## Error Handling

### Fleet Not Initialized

```bash
❌ Error: AQE Fleet not initialized

Run 'aqe init' to initialize the fleet.
```

**Solution:** Initialize fleet with `aqe init`.

### Agent Not Responding

```bash
⚠️  Warning: Agent 'qe-test-generator' not responding
   Last seen: 2 hours ago

Attempting recovery...
```

**Solution:** Fleet manager will attempt automatic recovery.

### Coordination Issues

```bash
⚠️  Warning: Memory sync degraded
   Latency: 250ms (normal: <50ms)

Coordination may be slower than usual.
```

**Solution:** Monitor and contact support if persists.

## Performance Characteristics

- **Time Complexity**: O(1) for basic status check
- **Target Time**: <1s
- **Memory Usage**: ~64MB peak
- **Refresh Rate**: Configurable (default 5s in watch mode)

## Use Cases

### Pre-Deployment Health Check
```bash
aqe status --detailed
# Verify all agents healthy before deployment
```

### CI/CD Integration
```bash
aqe status --json > fleet-status.json
# Export status for dashboard
```

### Debugging
```bash
aqe status --detailed
# Investigate agent performance issues
```

### Monitoring
```bash
aqe status --watch --refresh 10
# Continuous fleet monitoring
```

## See Also

- `/aqe-generate` - Generate tests
- `/aqe-execute` - Execute tests
- `/aqe-analyze` - Analyze coverage
- `/aqe-report` - Generate reports