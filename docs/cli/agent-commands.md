# Agent CLI Commands Reference

Complete reference for all 10+ agent management CLI commands in the AQE Fleet system.

## Overview

The AQE Fleet provides comprehensive agent management through CLI commands organized into four categories:

1. **Lifecycle Commands** - Spawn, kill, restart agents
2. **Monitoring Commands** - List, metrics, logs, inspect
3. **Task Commands** - Assign tasks to agents
4. **Interactive Commands** - Attach/detach console sessions

---

## Lifecycle Commands

### `agent restart`

Gracefully restart an agent while preserving configuration and state.

**Usage:**
```bash
aqe agent restart <agentId> [options]
```

**Options:**
- `--preserve-state` - Save and restore agent state (default: true)
- `--timeout <ms>` - Termination timeout in milliseconds (default: 30000)
- `--force` - Force restart without graceful shutdown
- `--no-state` - Skip state preservation

**Examples:**
```bash
# Graceful restart with state preservation
aqe agent restart agent-1 --preserve-state

# Force restart
aqe agent restart agent-1 --force

# Custom timeout
aqe agent restart agent-1 --timeout 60000
```

**Output:**
```json
{
  "agentId": "agent-1",
  "oldInstanceId": "test-generator-1-...",
  "newInstanceId": "test-generator-2-...",
  "status": "active",
  "restartTime": 1534,
  "stateRestored": true
}
```

---

## Monitoring Commands

### `agent inspect`

Display detailed agent information including configuration, metrics, history, and health status.

**Usage:**
```bash
aqe agent inspect <agentId> [options]
```

**Options:**
- `--history` - Include task execution history
- `--metrics` - Include performance metrics (default: true)
- `--logs` - Include recent log entries
- `--format <type>` - Output format: json, yaml, table, detailed (default: json)
- `--depth <level>` - Inspection depth: shallow, deep (default: deep)

**Examples:**
```bash
# Basic inspection
aqe agent inspect agent-1

# Full inspection with history and logs
aqe agent inspect agent-1 --history --logs

# Table format for terminal viewing
aqe agent inspect agent-1 --format table

# YAML output
aqe agent inspect agent-1 --format yaml
```

**Output:**
```json
{
  "id": "test-generator-1-...",
  "type": "TEST_GENERATOR",
  "mcpType": "test-generator",
  "status": "active",
  "configuration": {
    "name": "agent-1",
    "capabilities": ["property-testing", "mutation-testing"],
    "resources": {
      "cpu": "1",
      "memory": "512MB"
    }
  },
  "lifecycle": {
    "spawnedAt": "2025-10-06T13:30:00.000Z",
    "lastActivity": "2025-10-06T13:37:00.000Z",
    "uptime": 420000,
    "restartCount": 2
  },
  "metrics": {
    "tasksCompleted": 47,
    "tasksActive": 1,
    "tasksFailed": 3,
    "averageExecutionTime": 1523,
    "successRate": 0.936
  },
  "health": {
    "status": "healthy",
    "issues": [],
    "lastCheck": "2025-10-06T13:37:10.000Z"
  }
}
```

---

## Task Commands

### `agent assign`

Assign tasks to agents with intelligent load balancing and capability matching.

**Usage:**
```bash
aqe agent assign <taskId> [options]
```

**Options:**
- `--agent <agentId>` - Manually assign to specific agent
- `--auto-balance` - Use load balancing algorithm
- `--require-capability <name>` - Require specific capability
- `--priority <level>` - Task priority: low, medium, high, critical (default: medium)
- `--timeout <ms>` - Task timeout in milliseconds (default: 300000)
- `--retry` - Retry on failure (default: true)

**Examples:**
```bash
# Manual assignment
aqe agent assign task-123 --agent agent-1

# Auto-assignment with load balancing
aqe agent assign task-123 --auto-balance

# Require specific capability
aqe agent assign task-123 --auto-balance --require-capability performance-testing

# High priority task
aqe agent assign task-123 --agent agent-1 --priority high
```

**Output:**
```json
{
  "taskId": "task-123",
  "agentId": "agent-1",
  "agentType": "performance-tester",
  "status": "assigned",
  "assignedAt": "2025-10-06T13:37:15.000Z",
  "estimatedCompletion": "2025-10-06T13:39:00.000Z",
  "capabilities": ["load-testing", "stress-testing"]
}
```

**Queued Response:**
```json
{
  "taskId": "task-124",
  "agentId": "agent-1",
  "agentType": "performance-tester",
  "status": "queued",
  "assignedAt": "2025-10-06T13:37:20.000Z",
  "queuePosition": 2,
  "capabilities": ["load-testing"]
}
```

---

## Interactive Commands

### `agent attach`

Attach to an agent's console for real-time monitoring of logs, metrics, and events.

**Usage:**
```bash
aqe agent attach <agentId> [options]
```

**Options:**
- `--follow` - Follow log output in real-time (default: true)
- `--metrics` - Show metrics updates (default: true)
- `--logs` - Show log entries (default: true)
- `--events` - Show event notifications (default: true)
- `--refresh <ms>` - Metrics refresh rate in milliseconds (default: 1000)
- `--filter <pattern>` - Filter logs by pattern

**Examples:**
```bash
# Attach with all monitoring
aqe agent attach agent-1

# Attach with only logs
aqe agent attach agent-1 --no-metrics --no-events

# Filter error logs
aqe agent attach agent-1 --filter ERROR

# Custom refresh rate
aqe agent attach agent-1 --refresh 500
```

**Output:**
```
============================================================
📎 Attached to Agent: test-generator-1-...
============================================================
Type: test-generator
Status: active
Tasks Completed: 47
Last Activity: 10/6/2025, 1:37:00 PM
============================================================

[LOG] Starting test generation for module: UserService
[METRIC] {"tasksCompleted":48,"averageExecutionTime":1498}
[EVENT] task_started: Generating unit tests
[LOG] Generated 15 test cases
[LOG] Running property-based testing...
[METRIC] {"tasksCompleted":48,"averageExecutionTime":1501}
[EVENT] task_completed: Test generation completed
```

**Detach:** Press `Ctrl+C` or use `aqe agent detach <agentId>`

---

### `agent detach`

Detach from an active agent console session with optional session archival.

**Usage:**
```bash
aqe agent detach <agentId> [options]
```

**Options:**
- `--save-session` - Archive session data (default: true)
- `--show-stats` - Display session statistics (default: true)
- `--force` - Force detach even if errors occur

**Examples:**
```bash
# Normal detach with stats
aqe agent detach agent-1

# Force detach without saving
aqe agent detach agent-1 --force --no-save-session
```

**Output:**
```
============================================================
📊 Session Statistics
============================================================
Agent ID: agent-1
Session ID: attach-agent-1-1728223030000
Duration: 124.53s
Logs Received: 342
Events Received: 28
Metrics Received: 124
============================================================
```

---

## Advanced Usage

### Load Balancing Algorithm

The `agent assign --auto-balance` command uses a sophisticated scoring algorithm:

```typescript
score = 100
  - (tasksCompleted * 0.1)        // Penalize by load
  - (status === 'busy' ? 50 : 0)  // Penalize busy agents
  - (status === 'error' ? 80 : 0) // Penalize error agents
  + (status === 'idle' ? 20 : 0)  // Bonus for idle
  + max(0, 20 - (avgTime / 1000)) // Bonus for fast agents
```

### Health Checks

Agent health is automatically monitored:

- **Healthy**: Normal operation, no issues
- **Degraded**: Inactive for >1 hour, or no tasks completed after 10min
- **Unhealthy**: Agent in error state

### Session Management

Attach sessions are automatically managed:

- Session metadata stored in `.aqe/sessions/`
- Completed sessions archived in `.aqe/sessions/archive/`
- Auto-cleanup of sessions older than 30 days

---

## Integration with AgentRegistry

All commands integrate with the centralized `AgentRegistry` service:

```typescript
import { getAgentRegistry } from '@/mcp/services/AgentRegistry';

const registry = getAgentRegistry();
const agent = registry.getRegisteredAgent(agentId);
```

---

## Error Handling

### Common Errors

**Agent Not Found:**
```
Error: Agent not found: agent-xyz
```
**Solution:** Check agent ID with `aqe agent list`

**Agent Lacks Capability:**
```
Error: Agent lacks required capability: performance-testing
```
**Solution:** Use `aqe agent inspect <agentId>` to check capabilities

**Not Attached:**
```
Error: Not attached to agent: agent-1
```
**Solution:** Use `aqe agent attach agent-1` first

---

## File Locations

- Agent configs: `.aqe/agents/<agentId>.json`
- Agent state: `.aqe/state/<agentId>.state.json`
- Agent logs: `.aqe/logs/<agentId>.log`
- Task queue: `.aqe/queue/<agentId>.json`
- Attach sessions: `.aqe/sessions/<sessionId>.json`
- Session archive: `.aqe/sessions/archive/<sessionId>.json`

---

## Testing

All commands have comprehensive test coverage:

```bash
npm test -- tests/cli/agent.test.ts
```

**Test Suites:**
- ✅ agent restart (6 tests)
- ✅ agent inspect (7 tests)
- ✅ agent assign (7 tests)
- ✅ agent attach (6 tests)
- ✅ agent detach (7 tests)

**Total:** 33 tests covering all command functionality

---

## Related Commands

- `aqe fleet init` - Initialize AQE fleet
- `aqe fleet status` - Show fleet overview
- `aqe agent spawn` - Create new agent
- `aqe agent list` - List all agents
- `aqe agent metrics` - Show agent metrics

---

## Support

For issues or questions:
- GitHub: https://github.com/ruvnet/agentic-qe
- Documentation: `/docs`
