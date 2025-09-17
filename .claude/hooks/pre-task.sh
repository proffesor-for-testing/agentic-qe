#!/bin/bash
# Pre-task hook for QE agents

TASK_ID=$(uuidgen)
echo "Task ID: $TASK_ID"

# Store task context
npx claude-flow@alpha memory store "task_$TASK_ID" "$1"

# Check for dependent tasks
npx claude-flow@alpha memory search "task_*" | grep -v "$TASK_ID" | head -5

# Notify swarm members
if [ ! -z "$SWARM_ID" ]; then
  npx claude-flow@alpha hooks notify --swarm "$SWARM_ID" --message "Task $TASK_ID starting"
fi
