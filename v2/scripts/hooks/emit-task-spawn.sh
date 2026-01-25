#!/bin/bash
# Hook: Pre-Task - Emit agent spawn event to visualization
# Receives JSON via stdin from Claude Code hook system

# Read input from stdin
INPUT=$(cat)

# Extract task description and agent type from hook input
DESC=$(echo "$INPUT" | jq -r '.tool_input.description // .tool_input.prompt // "task-agent"' 2>/dev/null | head -c 50)
AGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // .tool_input.agent // "coder"' 2>/dev/null)

# Generate agent ID from description
AGENT_ID=$(echo "$DESC" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | head -c 30)
AGENT_ID="${AGENT_ID:-task-agent}-$(date +%s)"

# Store agent ID in temp file for completion hook
mkdir -p /tmp/aqe-viz
echo "$AGENT_ID" > "/tmp/aqe-viz/current-agent-$$"
echo "$AGENT_ID" >> "/tmp/aqe-viz/agent-registry"

# Emit spawn and start events (non-blocking, background)
(
  npx tsx scripts/emit-agent-event.ts spawn "$AGENT_ID" "$AGENT_TYPE" 2>/dev/null
  npx tsx scripts/emit-agent-event.ts start "$AGENT_ID" 2>/dev/null
) &

exit 0
