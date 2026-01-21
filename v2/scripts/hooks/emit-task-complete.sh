#!/bin/bash
# Hook: Post-Task - Emit agent completion event to visualization
# Receives JSON via stdin from Claude Code hook system

# Read input from stdin
INPUT=$(cat)

# Try to get the agent ID from the temp file or generate from description
if [ -f "/tmp/aqe-viz/current-agent-$$" ]; then
  AGENT_ID=$(cat "/tmp/aqe-viz/current-agent-$$")
  rm -f "/tmp/aqe-viz/current-agent-$$"
else
  # Fallback: extract from input
  DESC=$(echo "$INPUT" | jq -r '.tool_input.description // .tool_input.prompt // "task-agent"' 2>/dev/null | head -c 50)
  AGENT_ID=$(echo "$DESC" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | head -c 30)
  AGENT_ID="${AGENT_ID:-task-agent}-recent"
fi

# Check if task was successful (from tool response)
SUCCESS=$(echo "$INPUT" | jq -r '.tool_response.success // .result.success // "unknown"' 2>/dev/null)

# Calculate approximate duration (we don't have exact timing, use 0)
DURATION=0

# Emit completion or error event based on success status (non-blocking, background)
(
  if [ "$SUCCESS" = "false" ]; then
    ERROR_MSG=$(echo "$INPUT" | jq -r '.tool_response.error // .result.error // "Task failed"' 2>/dev/null)
    npx tsx scripts/emit-agent-event.ts error "$AGENT_ID" "$ERROR_MSG" 2>/dev/null
  else
    npx tsx scripts/emit-agent-event.ts complete "$AGENT_ID" "$DURATION" 2>/dev/null
  fi
) &

exit 0
