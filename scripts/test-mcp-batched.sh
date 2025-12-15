#!/bin/bash
# MCP Tests - Batched Execution
# Runs MCP tests in smaller batches to prevent OOM in DevPod/Codespaces
# Issue #39: https://github.com/proffesor-for-testing/agentic-qe/issues/39

set -e  # Exit on first failure

echo "=============================================="
echo "MCP Tests - Batched Execution"
echo "=============================================="
echo ""

# Track results
TOTAL_BATCHES=7
PASSED_BATCHES=0
FAILED_BATCHES=0
FAILED_BATCH_NAMES=""

run_batch() {
    local batch_name=$1
    local batch_cmd=$2

    echo ""
    echo "----------------------------------------------"
    echo "Running Batch: $batch_name"
    echo "----------------------------------------------"

    if $batch_cmd; then
        echo "✅ $batch_name: PASSED"
        ((PASSED_BATCHES++))
    else
        echo "❌ $batch_name: FAILED"
        ((FAILED_BATCHES++))
        FAILED_BATCH_NAMES="$FAILED_BATCH_NAMES $batch_name"
    fi

    # Force garbage collection between batches
    echo "🧹 Cleaning up memory..."
    sleep 1
}

# Run each batch
run_batch "MCP Core" "npm run test:mcp:core"
run_batch "MCP Coordination" "npm run test:mcp:coordination"
run_batch "MCP Memory" "npm run test:mcp:memory"
run_batch "MCP Analysis" "npm run test:mcp:analysis"
run_batch "MCP Test Tools" "npm run test:mcp:test-tools"
run_batch "MCP Security" "npm run test:mcp:security"
run_batch "MCP Other" "npm run test:mcp:other"

# Summary
echo ""
echo "=============================================="
echo "MCP Tests Summary"
echo "=============================================="
echo "Total Batches: $TOTAL_BATCHES"
echo "Passed: $PASSED_BATCHES"
echo "Failed: $FAILED_BATCHES"

if [ $FAILED_BATCHES -gt 0 ]; then
    echo ""
    echo "Failed batches:$FAILED_BATCH_NAMES"
    echo ""
    exit 1
else
    echo ""
    echo "✅ All MCP test batches passed!"
    echo ""
    exit 0
fi
