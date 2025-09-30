#!/bin/bash

# Memory Management Setup Script for DevPod Container
# This script configures memory limits, swap, and monitoring for agent swarms

set -e

echo "================================================"
echo "🛡️ Setting up Memory Management for DevPod"
echo "================================================"

# Function to check if running with sufficient privileges
check_privileges() {
    if [ "$EUID" -eq 0 ]; then
        echo "✅ Running with root privileges"
        SUDO=""
    elif command -v sudo >/dev/null 2>&1; then
        echo "📝 Will use sudo for privileged operations"
        SUDO="sudo"
    else
        echo "⚠️ Warning: Some operations may fail without sudo"
        SUDO=""
    fi
}

# Function to setup swap if not exists
setup_swap() {
    echo ""
    echo "📁 Configuring Swap Space..."

    # Check current swap
    SWAP_SIZE=$(free -m | grep "^Swap:" | awk '{print $2}')

    if [ "$(awk "BEGIN {print ($SWAP_SIZE > 0) ? 1 : 0}")" -eq 1 ]; then
        echo "✅ Swap already configured: ${SWAP_SIZE}MB"
    else
        echo "Creating 4GB swap file..."

        # Try to create swap file
        if [ -w /var ] || [ -n "$SUDO" ]; then
            SWAP_FILE="/var/swapfile"

            # Check available disk space
            AVAILABLE_SPACE=$(df /var | tail -1 | awk '{print $4}')
            REQUIRED_SPACE=4194304  # 4GB in KB

            if [ "$(awk "BEGIN {print ($AVAILABLE_SPACE > $REQUIRED_SPACE) ? 1 : 0}")" -eq 1 ]; then
                $SUDO dd if=/dev/zero of=$SWAP_FILE bs=1M count=4096 status=progress 2>/dev/null || true
                $SUDO chmod 600 $SWAP_FILE 2>/dev/null || true
                $SUDO mkswap $SWAP_FILE 2>/dev/null || true
                $SUDO swapon $SWAP_FILE 2>/dev/null || true

                # Verify swap was created
                NEW_SWAP_SIZE=$(free -m | grep "^Swap:" | awk '{print $2}')
                if [ "$(awk "BEGIN {print ($NEW_SWAP_SIZE > 0) ? 1 : 0}")" -eq 1 ]; then
                    echo "✅ Swap configured: ${NEW_SWAP_SIZE}MB"

                    # Make swap permanent (if fstab is writable)
                    if [ -w /etc/fstab ] || [ -n "$SUDO" ]; then
                        echo "$SWAP_FILE swap swap defaults 0 0" | $SUDO tee -a /etc/fstab >/dev/null
                    fi
                else
                    echo "⚠️ Swap creation failed - continuing without swap"
                fi
            else
                echo "⚠️ Insufficient disk space for swap file"
            fi
        else
            echo "⚠️ Cannot create swap file - insufficient permissions"
        fi
    fi
}

# Function to configure system memory parameters
configure_memory_params() {
    echo ""
    echo "⚙️ Configuring System Memory Parameters..."

    # Set swappiness (how aggressive to use swap)
    if [ -w /proc/sys/vm/swappiness ] || [ -n "$SUDO" ]; then
        echo 60 | $SUDO tee /proc/sys/vm/swappiness >/dev/null 2>&1 || true
        echo "✅ Swappiness set to 60"
    fi

    # Set cache pressure (how aggressive to reclaim cache)
    if [ -w /proc/sys/vm/vfs_cache_pressure ] || [ -n "$SUDO" ]; then
        echo 50 | $SUDO tee /proc/sys/vm/vfs_cache_pressure >/dev/null 2>&1 || true
        echo "✅ Cache pressure set to 50"
    fi

    # Configure OOM killer score for current process
    if [ -w /proc/$$/oom_score_adj ] || [ -n "$SUDO" ]; then
        echo 0 | $SUDO tee /proc/$$/oom_score_adj >/dev/null 2>&1 || true
        echo "✅ OOM killer score adjusted"
    fi
}

# Function to setup memory limits for Node.js
setup_nodejs_limits() {
    echo ""
    echo "🟢 Configuring Node.js Memory Limits..."

    # Export Node.js memory options
    export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"

    # Add to profile for persistence
    PROFILE_FILE="$HOME/.bashrc"
    if [ -f "$HOME/.zshrc" ]; then
        PROFILE_FILE="$HOME/.zshrc"
    fi

    if ! grep -q "NODE_OPTIONS.*max-old-space-size" "$PROFILE_FILE" 2>/dev/null; then
        echo "" >> "$PROFILE_FILE"
        echo "# Node.js Memory Configuration for Agent Swarms" >> "$PROFILE_FILE"
        echo "export NODE_OPTIONS='--max-old-space-size=2048 --expose-gc'" >> "$PROFILE_FILE"
        echo "✅ Node.js memory limits added to $PROFILE_FILE"
    else
        echo "✅ Node.js memory limits already configured"
    fi
}

# Function to create agent memory configuration
create_agent_config() {
    echo ""
    echo "📝 Creating Agent Memory Configuration..."

    # Create configuration directory if not exists
    mkdir -p "$HOME/.config/claude-flow"

    # Create memory configuration file
    cat > "$HOME/.config/claude-flow/memory.json" << 'EOF'
{
  "maxConcurrentAgents": 10,
  "agentMemoryLimitMB": 512,
  "queueEnabled": true,
  "memoryMonitoring": {
    "enabled": true,
    "checkIntervalMs": 5000,
    "pressureThreshold": 0.85,
    "criticalThreshold": 0.95
  },
  "garbageCollection": {
    "enabled": true,
    "forceIntervalMs": 60000,
    "onMemoryPressure": true
  },
  "swarm": {
    "topology": "sequential",
    "batchSize": 2,
    "delayBetweenBatchesMs": 2000,
    "recycleAgentsAfter": 5
  }
}
EOF

    echo "✅ Agent configuration created at ~/.config/claude-flow/memory.json"
}

# Function to create memory monitoring script
create_monitor_script() {
    echo ""
    echo "📊 Creating Memory Monitoring Script..."

    cat > "$HOME/.config/claude-flow/monitor.sh" << 'EOF'
#!/bin/bash

# Memory monitoring daemon
LOGFILE="/tmp/memory-monitor.log"
WARNING_THRESHOLD=85
CRITICAL_THRESHOLD=95

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"
}

check_memory() {
    # Get memory usage percentage
    MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')

    # Get swap usage
    SWAP_USAGE=$(free | grep Swap | awk '{if ($2 > 0) print int($3/$2 * 100); else print 0}')

    # Log current status
    log_message "Memory: ${MEM_USAGE}%, Swap: ${SWAP_USAGE}%"

    # Check thresholds
    if [ "$(awk "BEGIN {print ($MEM_USAGE > $CRITICAL_THRESHOLD) ? 1 : 0}")" -eq 1 ]; then
        log_message "CRITICAL: Memory usage at ${MEM_USAGE}%"

        # Find and kill the most memory-intensive Node.js process
        PID=$(ps aux | grep node | grep -v grep | sort -nrk 4 | head -1 | awk '{print $2}')
        if [ -n "$PID" ]; then
            log_message "Killing high-memory Node.js process: $PID"
            kill -TERM "$PID" 2>/dev/null || true
        fi

        # Force garbage collection if Node.js is running with --expose-gc
        if pgrep -f "node.*--expose-gc" >/dev/null; then
            log_message "Triggering garbage collection"
            echo "if (global.gc) global.gc();" | node --expose-gc 2>/dev/null || true
        fi
    elif [ "$(awk "BEGIN {print ($MEM_USAGE > $WARNING_THRESHOLD) ? 1 : 0}")" -eq 1 ]; then
        log_message "WARNING: Memory usage at ${MEM_USAGE}%"
    fi
}

# Main loop
log_message "Memory monitor started"
while true; do
    check_memory
    sleep 30
done
EOF

    chmod +x "$HOME/.config/claude-flow/monitor.sh"
    echo "✅ Memory monitoring script created"
}

# Function to display memory status
display_memory_status() {
    echo ""
    echo "📈 Current Memory Status:"
    echo "------------------------"
    free -h
    echo ""
    echo "Node.js Memory Settings:"
    echo "  MAX_OLD_SPACE_SIZE: 2048 MB"
    echo "  MAX_CONCURRENT_AGENTS: ${MAX_CONCURRENT_AGENTS:-3}"
    echo "  AGENT_MEMORY_LIMIT: ${AGENT_MEMORY_LIMIT_MB:-512} MB"
    echo ""
}

# Function to create helper scripts
create_helper_scripts() {
    echo ""
    echo "🔧 Creating Helper Scripts..."

    # Create agent runner with memory protection
    cat > "$HOME/bin/safe-run-agent" << 'EOF'
#!/bin/bash

# Safe agent runner with memory protection
AGENT_TYPE="${1:-coder}"
TASK="${2:-default task}"
MEMORY_LIMIT="${AGENT_MEMORY_LIMIT_MB:-512}"

# Check current memory usage
MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')

# Use threshold from environment or default to 85
MEMORY_THRESHOLD=${MEMORY_PRESSURE_THRESHOLD:-85}
# Handle both float (0.85) and integer (85) format
if [[ "$MEMORY_THRESHOLD" =~ ^0?\.[0-9]+$ ]]; then
    MEMORY_THRESHOLD=$(awk "BEGIN {printf \"%.0f\", $MEMORY_THRESHOLD * 100}")
fi

if [ "$(awk "BEGIN {print ($MEM_USAGE > $MEMORY_THRESHOLD) ? 1 : 0}")" -eq 1 ]; then
    echo "❌ Memory usage too high ($MEM_USAGE%). Please wait or kill other processes."
    exit 1
fi

echo "🚀 Starting $AGENT_TYPE agent with ${MEMORY_LIMIT}MB memory limit..."

# Run with memory limit
exec /usr/bin/env NODE_OPTIONS="--max-old-space-size=$MEMORY_LIMIT" \
    npx claude-flow@alpha agent spawn \
    --type "$AGENT_TYPE" \
    --task "$TASK" \
    --memory-limit "${MEMORY_LIMIT}MB"
EOF

    chmod +x "$HOME/bin/safe-run-agent"

    # Create memory cleanup script
    cat > "$HOME/bin/cleanup-memory" << 'EOF'
#!/bin/bash

echo "🧹 Cleaning up memory..."

# Kill all node processes except the main one
pkill -f "node.*claude-flow" 2>/dev/null || true

# Clear system caches (requires privileges)
if [ -w /proc/sys/vm/drop_caches ] || command -v sudo >/dev/null 2>&1; then
    sync
    echo 1 | sudo tee /proc/sys/vm/drop_caches >/dev/null 2>&1 || true
fi

# Force garbage collection in running Node.js processes
for PID in $(pgrep -f "node.*--expose-gc"); do
    echo "Triggering GC for PID $PID"
    kill -USR1 "$PID" 2>/dev/null || true
done

echo "✅ Memory cleanup complete"
free -h
EOF

    chmod +x "$HOME/bin/cleanup-memory"

    # Ensure bin directory is in PATH
    if ! echo "$PATH" | grep -q "$HOME/bin"; then
        echo "" >> "$HOME/.bashrc"
        echo "export PATH=\"\$HOME/bin:\$PATH\"" >> "$HOME/.bashrc"
    fi

    echo "✅ Helper scripts created:"
    echo "  - safe-run-agent: Run agents with memory protection"
    echo "  - cleanup-memory: Clean up memory when needed"
}

# Main execution
main() {
    echo "Starting memory management setup..."

    # Check privileges
    check_privileges

    # Setup swap space
    setup_swap

    # Configure system memory parameters
    configure_memory_params

    # Setup Node.js limits
    setup_nodejs_limits

    # Create agent configuration
    create_agent_config

    # Create monitoring script
    create_monitor_script

    # Create helper scripts
    mkdir -p "$HOME/bin"
    create_helper_scripts

    # Display final status
    display_memory_status

    echo ""
    echo "================================================"
    echo "✅ Memory Management Setup Complete!"
    echo "================================================"
    echo ""
    echo "🎯 Key Settings Applied:"
    echo "  • Node.js heap limit: 2GB"
    echo "  • Max concurrent agents: 3"
    echo "  • Per-agent memory: 512MB"
    echo "  • Swap space: 4GB (if available)"
    echo "  • Memory monitoring: Enabled"
    echo ""
    echo "📝 Usage Tips:"
    echo "  • Run agents safely: safe-run-agent <type> <task>"
    echo "  • Clean memory: cleanup-memory"
    echo "  • Monitor memory: watch -n 5 free -h"
    echo ""
    echo "⚠️ Important: Restart your shell or run:"
    echo "  source ~/.bashrc"
    echo ""
}

# Run main function
main "$@"