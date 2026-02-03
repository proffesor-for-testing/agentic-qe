#!/bin/bash
# AQE v3 Worker Daemon Startup Script
# Starts all background workers for self-learning system

# Get directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate up from .agentic-qe/workers to project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKERS_DIR="$PROJECT_ROOT/.agentic-qe/workers"
PID_FILE="$WORKERS_DIR/daemon.pid"
LOG_FILE="$WORKERS_DIR/daemon.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Daemon already running (PID: $PID)"
    exit 0
  fi
fi

echo "[$(date)] Starting AQE v3 Worker Daemon..." >> "$LOG_FILE"

# Start MCP server with workers in background
cd "$PROJECT_ROOT/v3"

# Export environment for learning
export AQE_LEARNING_ENABLED=true
export AQE_WORKERS_ENABLED=true
export AQE_HTTP_PORT=0

# Start the daemon via tsx
nohup npm run mcp >> "$LOG_FILE" 2>&1 &
DAEMON_PID=$!

# Save PID
echo $DAEMON_PID > "$PID_FILE"
echo "[$(date)] Daemon started with PID: $DAEMON_PID" >> "$LOG_FILE"

echo "AQE v3 Worker Daemon started (PID: $DAEMON_PID)"
echo "Log file: $LOG_FILE"
