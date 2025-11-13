#!/bin/bash
# Agentic QE Fleet Post-Execution Coordination
# This script uses native AQE capabilities - no external dependencies required

# Ensure we're in the project root (works from any directory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

# Capture final fleet status
agentic-qe fleet status --json > /tmp/aqe-fleet-status-post.json 2>/dev/null || true

# Log execution completion
echo "[AQE] Post-execution coordination: Execution completed at $(date)" >> .agentic-qe/logs/coordination.log

# Store execution timestamp
echo "{\"timestamp\": \"$(date -Iseconds)\", \"status\": \"completed\"}" > .agentic-qe/state/coordination/last-execution.json

echo "[AQE] Post-execution coordination complete"
