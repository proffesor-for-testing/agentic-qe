---
name: hooks-automation
description: "Automate development operations with intelligent pre/post hooks for editing, testing, and deployment. Coordinate swarm agents, persist session state, train neural patterns, and integrate with Git workflows. Use when setting up automated code validation, agent coordination, or session management hooks."
---

# Hooks Automation

Intelligent hook system that coordinates, validates, and learns from Claude Code operations through MCP integration and neural pattern training.

## Quick Start

```bash
# Initialize hooks
npx claude-flow init --hooks

# Pre-task hook (auto-spawns agents)
npx claude-flow hook pre-task --description "Implement authentication"

# Post-edit hook (auto-formats and stores in memory)
npx claude-flow hook post-edit --file "src/auth.js" --memory-key "auth/login"

# Session end (saves state and metrics)
npx claude-flow hook session-end --session-id "dev-session" --export-metrics
```

## Available Hooks

### Pre-Operation Hooks

| Hook | Purpose | Key Options |
|------|---------|-------------|
| `pre-edit` | Validate/assign agents before edits | `--file`, `--validate-syntax`, `--backup-file` |
| `pre-bash` | Check command safety | `--command`, `--check-safety`, `--estimate-resources` |
| `pre-task` | Auto-spawn agents for tasks | `--description`, `--auto-spawn-agents`, `--load-memory` |
| `pre-search` | Optimize search queries | `--query`, `--check-cache` |

### Post-Operation Hooks

| Hook | Purpose | Key Options |
|------|---------|-------------|
| `post-edit` | Auto-format, validate, train patterns | `--file`, `--auto-format`, `--train-patterns` |
| `post-bash` | Log execution, update metrics | `--command`, `--update-metrics` |
| `post-task` | Performance analysis, store decisions | `--task-id`, `--analyze-performance` |
| `post-search` | Cache results, improve patterns | `--query`, `--cache-results` |

### Session Hooks

| Hook | Purpose |
|------|---------|
| `session-start` | Initialize session, load context |
| `session-restore` | Load previous session state |
| `session-end` | Save state, export metrics, generate summary |
| `notify` | Custom notifications with swarm status |

## Configuration

### Basic `.claude/settings.json`
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^(Write|Edit|MultiEdit)$",
        "hooks": [{ "type": "command", "command": "npx claude-flow hook pre-edit --file '${tool.params.file_path}'" }]
      },
      {
        "matcher": "^Bash$",
        "hooks": [{ "type": "command", "command": "npx claude-flow hook pre-bash --command '${tool.params.command}'" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "^(Write|Edit|MultiEdit)$",
        "hooks": [{ "type": "command", "command": "npx claude-flow hook post-edit --file '${tool.params.file_path}' --auto-format --train-patterns" }]
      }
    ]
  }
}
```

### Advanced Configuration
```json
{
  "hooks": {
    "enabled": true,
    "timeout": 5000,
    "PreToolUse": [
      {
        "matcher": "^Task$",
        "hooks": [{
          "type": "command",
          "command": "npx claude-flow hook pre-task --description '${tool.params.task}' --auto-spawn-agents --load-memory",
          "async": true
        }]
      }
    ],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "npx claude-flow hook session-start --load-context" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "npx claude-flow hook session-end --export-metrics --generate-summary" }] }]
  }
}
```

## MCP Integration

```javascript
// Pre-task: auto-spawn agents
npx claude-flow hook pre-task --description "Build REST API"
// Internally calls:
mcp__claude-flow__agent_spawn { type: "backend-dev", capabilities: ["api", "database"] }
mcp__claude-flow__memory_usage { action: "store", key: "swarm/task/context", value: {...} }

// Post-edit: store patterns
npx claude-flow hook post-edit --file "api/auth.js"
// Internally calls:
mcp__claude-flow__memory_usage { action: "store", key: "swarm/edits/api/auth.js" }
mcp__claude-flow__neural_train { pattern_type: "coordination", training_data: {...} }
```

## Git Integration

### Pre-Commit Hook
```bash
#!/bin/bash
FILES=$(git diff --cached --name-only --diff-filter=ACM)
for FILE in $FILES; do
  npx claude-flow hook pre-edit --file "$FILE" --validate-syntax || exit 1
  npx claude-flow hook post-edit --file "$FILE" --auto-format
done
npm test
```

### Pre-Push Hook
```bash
#!/bin/bash
npm run test:all
npx claude-flow hook session-end --generate-report --export-metrics
TRUTH_SCORE=$(npx claude-flow metrics score --format json | jq -r '.truth_score')
if (( $(echo "$TRUTH_SCORE < 0.95" | bc -l) )); then
  echo "Truth score below threshold: $TRUTH_SCORE < 0.95" && exit 1
fi
```

## Agent Coordination Workflow

```bash
# Agent 1: Backend Developer
npx claude-flow hook pre-task --description "Implement user authentication API" --auto-spawn-agents
npx claude-flow hook pre-edit --file "api/auth.js" --validate-syntax
# ... code changes ...
npx claude-flow hook post-edit --file "api/auth.js" --memory-key "swarm/backend/auth-api" --train-patterns
npx claude-flow hook notify --message "Auth API complete" --broadcast

# Agent 2: Test Engineer (receives notification, reads memory)
npx claude-flow hook session-restore --restore-memory
npx claude-flow hook pre-task --description "Write tests for auth API" --load-memory
npx claude-flow hook post-edit --file "api/auth.test.js" --memory-key "swarm/testing/auth-tests"
```

## Hook Response Format

```json
// Continue
{ "continue": true, "reason": "All validations passed", "metadata": { "agent_assigned": "backend-dev" } }

// Block
{ "continue": false, "reason": "Protected file - manual review required" }

// Warning
{ "continue": true, "warnings": ["Cyclomatic complexity: 15 (threshold: 10)"] }
```

## Performance Tips

1. Keep hooks under 100ms execution time
2. Use `async: true` for heavy operations
3. Cache frequently accessed data
4. Batch related operations
5. Set appropriate TTLs for memory keys

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Hooks not executing | Verify `.claude/settings.json` syntax, check matcher patterns |
| Hook timeouts | Increase timeout, make async, optimize logic |
| Memory issues | Set TTLs, clean old entries, use namespaces |
| Performance | Profile execution times, use caching, batch operations |

## Debugging

```bash
export CLAUDE_FLOW_DEBUG=true
npx claude-flow hook pre-edit --file "test.js" --debug
npx claude-flow hook validate-config
```
