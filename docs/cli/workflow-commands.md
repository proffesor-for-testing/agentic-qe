# Workflow CLI Commands

Comprehensive CLI commands for managing QE workflows with pause, resume, and cancellation capabilities.

## Commands

### 1. `aqe workflow list`

List all workflows with filtering and sorting options.

**Usage:**
```bash
# List all workflows
aqe workflow list

# Filter by status
aqe workflow list --status running
aqe workflow list --status paused,completed

# Filter by name pattern
aqe workflow list --name "test"

# Limit results
aqe workflow list --limit 10

# Sort by field
aqe workflow list --sort startTime
aqe workflow list --sort name
aqe workflow list --sort status

# Output formats
aqe workflow list --format table
aqe workflow list --format json

# Detailed information
aqe workflow list --detailed
```

**Options:**
- `-s, --status <status>` - Filter by status (running, paused, completed, failed, cancelled)
- `-n, --name <pattern>` - Filter by name pattern
- `-l, --limit <number>` - Limit number of results
- `--sort <field>` - Sort by field (startTime, name, status) [default: startTime]
- `-f, --format <format>` - Output format (json, table) [default: table]
- `-d, --detailed` - Show detailed information including steps and progress

**Output:**
- Workflow ID, name, status, progress, start time
- Optional: steps completed, failed steps, execution details

**Memory Integration:**
- Stores list cache: `aqe/swarm/workflow-cli-commands/list-cache`
- Tracks progress: `aqe/swarm/workflow-cli-commands/progress`

---

### 2. `aqe workflow pause <workflow-id>`

Pause a running workflow with graceful shutdown and state preservation.

**Usage:**
```bash
# Graceful pause (default)
aqe workflow pause wf-001

# Immediate pause
aqe workflow pause wf-001 --immediate

# Add reason for pausing
aqe workflow pause wf-001 --reason "Manual intervention required"

# Set timeout for graceful pause
aqe workflow pause wf-001 --timeout 60000
```

**Arguments:**
- `<workflow-id>` - Workflow ID to pause (required)

**Options:**
- `-g, --graceful` - Graceful pause (wait for current step) [default: true]
- `-i, --immediate` - Immediate pause
- `-r, --reason <reason>` - Reason for pausing
- `-t, --timeout <ms>` - Timeout for graceful pause [default: 30000ms]

**Features:**
- **State Preservation**: Saves complete workflow state including:
  - Completed steps
  - Current step position
  - Progress percentage
  - Context and variables
  - Checkpoints

- **Agent Notification**: Notifies all workflow agents of pause event
- **Audit Logging**: Creates audit trail entry with timestamp and reason
- **Memory Checkpoints**: Creates recovery checkpoint for resume

**Memory Integration:**
- Updates status: `aqe/swarm/workflow-cli-commands/workflow-{id}-status`
- Stores checkpoint: `aqe/swarm/workflow-cli-commands/checkpoint-{id}`
- Posts notification: `aqe/notifications/workflow-pause/{id}`
- Audit log: `aqe/audit/workflow-pause/{id}`

**Error Handling:**
- Validates workflow exists
- Checks workflow is in running state
- Prevents duplicate pause operations
- Handles graceful timeout failures

---

### 3. `aqe workflow cancel <workflow-id>`

Cancel a workflow with comprehensive cleanup and resource management.

**Usage:**
```bash
# Graceful cancellation (default)
aqe workflow cancel wf-001

# Forced immediate cancellation
aqe workflow cancel wf-001 --force --confirm

# Add cancellation reason
aqe workflow cancel wf-001 --reason "Requirements changed"

# Preserve partial results
aqe workflow cancel wf-001 --preserve-results

# Full cleanup including memory
aqe workflow cancel wf-001 --cleanup --clean-memory

# Enable retry on failure
aqe workflow cancel wf-001 --retry
```

**Arguments:**
- `<workflow-id>` - Workflow ID to cancel (required)

**Options:**
- `-g, --graceful` - Graceful cancellation (wait for current step) [default: true]
- `-f, --force` - Force immediate cancellation
- `-c, --confirm` - Confirm forced cancellation [default: false]
- `-r, --reason <reason>` - Reason for cancellation
- `--cleanup` - Clean up workflow resources [default: true]
- `--preserve-results` - Preserve partial results
- `--clean-memory` - Clean up workflow memory
- `--retry` - Retry on failure [default: false]

**Features:**
- **State Management**: Saves final workflow state before cancellation
- **Agent Cleanup**: Stops all running agents gracefully
- **Resource Cleanup**: Cleans up:
  - Temporary files
  - Agent resources
  - Execution artifacts
  - Optional: Workflow memory

- **Dependency Notification**: Notifies dependent workflows
- **Checkpoint Creation**: Creates cancellation checkpoint for audit
- **Confirmation Prompt**: Interactive confirmation for forced cancellation

**Cancellation Modes:**
- **Graceful**: Waits for current step to complete
- **Forced**: Immediately stops all operations (requires confirmation)

**Memory Integration:**
- Updates status: `aqe/swarm/workflow-cli-commands/workflow-{id}-status`
- Stores metadata: `aqe/swarm/workflow-cli-commands/cancel-metadata-{id}`
- Posts notification: `aqe/notifications/workflow-cancel/{id}`
- Dependency alert: `aqe/notifications/workflow-dependency-cancelled/{id}`
- Audit log: `aqe/audit/workflow-cancel/{id}`
- Checkpoint: `workflow:checkpoint:{checkpoint-id}`

**Error Handling:**
- Validates workflow exists
- Prevents cancellation of completed workflows
- Handles partial cleanup failures
- Supports retry on agent stop failures

---

## Architecture

### Component Structure

```
src/cli/commands/workflow/
├── index.ts          # Exports all workflow commands
├── list.ts           # List workflows with filtering
├── pause.ts          # Pause workflow with state preservation
└── cancel.ts         # Cancel workflow with cleanup
```

### Memory Integration

All commands integrate with `SwarmMemoryManager` for:
- **State Persistence**: Workflow state and checkpoints
- **Coordination**: Agent notifications via blackboard
- **Audit Trail**: Command execution tracking
- **Progress Tracking**: Real-time progress updates

**Memory Partitions:**
- `workflow_executions` - Workflow execution data (TTL: 24h)
- `workflow_states` - Workflow state snapshots (TTL: 7d)
- `workflow_checkpoints` - Recovery checkpoints (TTL: 7d)
- `workflow_cleanup` - Cleanup records (TTL: 7d)
- `workflow_cli` - CLI operation cache (TTL: 1h-7d)

### Hook Integration

Commands execute coordination hooks:
- **Pre-task**: Initialize operation context
- **Post-task**: Complete operation and update metrics
- **Post-hint**: Notify agents via blackboard
- **Session tracking**: Track command execution metrics

---

## Test Coverage

Comprehensive test suite with 50+ tests covering:

### List Command Tests (15 tests)
- Basic functionality (5 tests)
- Filtering options (5 tests)
- Output formats (3 tests)
- Error handling (2 tests)

### Pause Command Tests (17 tests)
- Basic functionality (5 tests)
- Pause options (4 tests)
- State management (3 tests)
- Error handling (2 tests)
- Memory integration (2 tests)
- Integration (1 test)

### Cancel Command Tests (18 tests)
- Basic functionality (5 tests)
- Cancellation options (5 tests)
- Cleanup operations (4 tests)
- State management (3 tests)
- Error handling (3 tests)
- Memory integration (3 tests)
- Integration (2 tests)

**Test Location:** `tests/cli/workflow.test.ts`

---

## Examples

### Scenario 1: Pause for Troubleshooting

```bash
# Pause workflow to investigate issue
aqe workflow pause wf-123 --reason "Investigating test failure"

# List paused workflows
aqe workflow list --status paused

# Resume workflow later (requires resume command)
# aqe workflow resume wf-123
```

### Scenario 2: Cancel Abandoned Workflow

```bash
# Cancel with full cleanup
aqe workflow cancel wf-456 \
  --reason "Requirements changed" \
  --cleanup \
  --preserve-results

# Verify cancellation
aqe workflow list --status cancelled
```

### Scenario 3: Emergency Stop

```bash
# Force cancel with confirmation
aqe workflow cancel wf-789 \
  --force \
  --confirm \
  --reason "Critical bug detected" \
  --clean-memory
```

---

## Integration with MCP Tools

Workflow commands integrate with existing MCP handlers:
- `workflow-execute.ts` - Workflow execution engine
- `workflow-checkpoint.ts` - Checkpoint creation
- `workflow-resume.ts` - Workflow resumption

**MCP Integration:**
```typescript
// Retrieve execution from memory
const execution = await memory.retrieve(
  `workflow:execution:${executionId}`,
  { partition: 'workflow_executions' }
);

// Create checkpoint
await memory.store(
  `workflow:checkpoint:${checkpointId}`,
  checkpoint,
  { partition: 'workflow_checkpoints', ttl: 604800 }
);

// Post notification
await memory.postHint({
  key: `aqe/notifications/workflow-pause/${workflowId}`,
  value: { event: 'workflow_paused', timestamp: new Date().toISOString() },
  ttl: 3600
});
```

---

## Future Enhancements

1. **Resume Command**: Resume paused workflows from checkpoint
2. **Schedule Command**: Schedule workflow execution
3. **Template Commands**: Save/load workflow templates
4. **Batch Operations**: Pause/cancel multiple workflows
5. **Watch Mode**: Real-time workflow monitoring
6. **Export/Import**: Export workflow state for backup

---

## Related Documentation

- [MCP Workflow Handlers](../../src/mcp/handlers/coordination/)
- [Memory Management](../../src/core/memory/)
- [CLI Architecture](../../src/cli/)
- [Hook System](../../docs/hooks/)

---

**Implementation Status:** ✅ Complete

**Test Coverage:** 50+ tests (15 + 17 + 18)

**Memory Integration:** Full SwarmMemoryManager integration

**Agent Coordination:** Blackboard notifications and hooks

**Last Updated:** 2025-10-06
