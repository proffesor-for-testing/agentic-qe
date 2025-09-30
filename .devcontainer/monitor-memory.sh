#!/bin/bash

# Memory Monitoring Script for DevPod Container
# Runs in background to monitor and manage memory usage

# Configuration
LOGFILE="/tmp/devpod-memory-monitor.log"
PIDFILE="/tmp/devpod-memory-monitor.pid"

# Handle both float (0.85) and integer (85) format for thresholds
if [[ "$MEMORY_PRESSURE_THRESHOLD" =~ ^0?\.[0-9]+$ ]]; then
    # Convert float (0.85) to percentage (85)
    WARNING_THRESHOLD=$(awk "BEGIN {printf \"%.0f\", $MEMORY_PRESSURE_THRESHOLD * 100}")
else
    # Use as-is if already an integer
    WARNING_THRESHOLD=${MEMORY_PRESSURE_THRESHOLD:-85}
fi

CRITICAL_THRESHOLD=95
CHECK_INTERVAL=${MEMORY_CHECK_INTERVAL:-5000}  # Convert ms to seconds
CHECK_INTERVAL_SEC=$((CHECK_INTERVAL / 1000))

# Ensure only one instance runs
if [ -f "$PIDFILE" ]; then
    OLD_PID=$(cat "$PIDFILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "Memory monitor already running with PID $OLD_PID"
        exit 0
    fi
fi

echo $$ > "$PIDFILE"

# Trap to cleanup on exit
trap "rm -f $PIDFILE; exit" INT TERM EXIT

# Logging function
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGFILE"
}

# Function to get memory usage
get_memory_usage() {
    free | grep Mem | awk '{print int($3/$2 * 100)}'
}

# Function to get swap usage
get_swap_usage() {
    free | grep Swap | awk '{if ($2 > 0) print int($3/$2 * 100); else print 0}'
}

# Function to get top memory consuming processes
get_top_processes() {
    ps aux --sort=-%mem | head -6 | tail -5
}

# Function to count running agents
count_agents() {
    pgrep -f "claude-flow.*agent" | wc -l
}

# Function to kill highest memory Node.js process
kill_highest_memory_node() {
    local PID=$(ps aux | grep -E "node|nodejs" | grep -v grep | sort -nrk 4 | head -1 | awk '{print $2}')
    if [ -n "$PID" ]; then
        log_message "Killing high-memory Node.js process: PID $PID"
        kill -TERM "$PID" 2>/dev/null || kill -KILL "$PID" 2>/dev/null
        sleep 2
        return 0
    fi
    return 1
}

# Function to trigger garbage collection
trigger_gc() {
    # Find all Node.js processes with --expose-gc flag
    for PID in $(pgrep -f "node.*--expose-gc"); do
        log_message "Triggering GC for Node.js process: PID $PID"
        # Send USR1 signal to trigger GC (if app handles it)
        kill -USR1 "$PID" 2>/dev/null || true
    done

    # Also try direct GC via node
    echo "if (global.gc) { global.gc(); console.log('GC triggered'); }" | node --expose-gc 2>/dev/null || true
}

# Function to reduce agent pool
reduce_agents() {
    local AGENT_COUNT=$(count_agents)
    if [ "$AGENT_COUNT" -gt 1 ]; then
        log_message "Reducing agent pool from $AGENT_COUNT agents"

        # Kill the newest agent process
        local NEWEST_PID=$(pgrep -f "claude-flow.*agent" -n)
        if [ -n "$NEWEST_PID" ]; then
            log_message "Terminating agent: PID $NEWEST_PID"
            kill -TERM "$NEWEST_PID" 2>/dev/null
        fi
    fi
}

# Function to clear system caches (requires privileges)
clear_caches() {
    if [ -w /proc/sys/vm/drop_caches ] || command -v sudo >/dev/null 2>&1; then
        log_message "Clearing system caches"
        sync
        echo 1 | sudo tee /proc/sys/vm/drop_caches >/dev/null 2>&1 || true
    fi
}

# Function to handle memory pressure
handle_memory_pressure() {
    local MEM_USAGE=$1
    local SWAP_USAGE=$2

    if [ "$(awk "BEGIN {print ($MEM_USAGE >= $CRITICAL_THRESHOLD) ? 1 : 0}")" -eq 1 ]; then
        log_message "🔴 CRITICAL: Memory at ${MEM_USAGE}%, Swap at ${SWAP_USAGE}%"

        # Emergency actions
        log_message "Taking emergency actions..."

        # 1. Kill highest memory Node.js process
        kill_highest_memory_node

        # 2. Clear system caches
        clear_caches

        # 3. Force garbage collection
        trigger_gc

        # 4. If still critical, kill all agents
        MEM_USAGE=$(get_memory_usage)
        if [ "$(awk "BEGIN {print ($MEM_USAGE >= $CRITICAL_THRESHOLD) ? 1 : 0}")" -eq 1 ]; then
            log_message "Memory still critical, killing all agents"
            pkill -f "claude-flow.*agent" 2>/dev/null || true
        fi

    elif [ "$(awk "BEGIN {print ($MEM_USAGE >= $WARNING_THRESHOLD) ? 1 : 0}")" -eq 1 ]; then
        log_message "⚠️ WARNING: Memory at ${MEM_USAGE}%, Swap at ${SWAP_USAGE}%"

        # Preventive actions
        log_message "Taking preventive actions..."

        # 1. Reduce agent pool
        reduce_agents

        # 2. Trigger garbage collection
        trigger_gc

        # 3. Clear caches if swap is also high
        if [ "$SWAP_USAGE" -gt 50 ]; then
            clear_caches
        fi
    fi
}

# Function to write status file for other processes
write_status() {
    local MEM_USAGE=$1
    local SWAP_USAGE=$2
    local AGENT_COUNT=$3

    cat > /tmp/memory-status.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "memory": {
    "usage_percent": $MEM_USAGE,
    "threshold_warning": $WARNING_THRESHOLD,
    "threshold_critical": $CRITICAL_THRESHOLD
  },
  "swap": {
    "usage_percent": $SWAP_USAGE
  },
  "agents": {
    "count": $AGENT_COUNT,
    "max_allowed": ${MAX_CONCURRENT_AGENTS:-3}
  },
  "status": $([ "$(awk "BEGIN {print ($MEM_USAGE >= $CRITICAL_THRESHOLD) ? 1 : 0}")" -eq 1 ] && echo '"critical"' ||
              [ "$(awk "BEGIN {print ($MEM_USAGE >= $WARNING_THRESHOLD) ? 1 : 0}")" -eq 1 ] && echo '"warning"' ||
              echo '"normal"')
}
EOF
}

# Main monitoring loop
main() {
    log_message "🚀 Memory monitor started"
    log_message "Configuration: Warning=${WARNING_THRESHOLD}%, Critical=${CRITICAL_THRESHOLD}%, Interval=${CHECK_INTERVAL_SEC}s"

    # Initial status
    MEM_USAGE=$(get_memory_usage)
    SWAP_USAGE=$(get_swap_usage)
    log_message "Initial state: Memory=${MEM_USAGE}%, Swap=${SWAP_USAGE}%"

    while true; do
        # Get current usage
        MEM_USAGE=$(get_memory_usage)
        SWAP_USAGE=$(get_swap_usage)
        AGENT_COUNT=$(count_agents)

        # Write status file
        write_status "$MEM_USAGE" "$SWAP_USAGE" "$AGENT_COUNT"

        # Log every 5 checks (to avoid log spam)
        if [ $(($(date +%s) % 25)) -eq 0 ]; then
            log_message "Status: Memory=${MEM_USAGE}%, Swap=${SWAP_USAGE}%, Agents=${AGENT_COUNT}"
        fi

        # Handle memory pressure if needed
        if [ "$(awk "BEGIN {print ($MEM_USAGE >= $WARNING_THRESHOLD) ? 1 : 0}")" -eq 1 ]; then
            handle_memory_pressure "$MEM_USAGE" "$SWAP_USAGE"
        fi

        # Sleep for the configured interval
        sleep "$CHECK_INTERVAL_SEC"
    done
}

# Start monitoring
main "$@"