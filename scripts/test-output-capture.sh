#!/bin/bash

# Test script for agent output capture functionality

echo "======================================"
echo "Testing Agent Output Capture"
echo "======================================"

# Clean previous test outputs
echo "Cleaning previous test outputs..."
rm -rf reports/agents/risk-oracle 2>/dev/null
rm -rf logs/executions/*risk-oracle* 2>/dev/null

# Create reports and logs directories if they don't exist
mkdir -p reports/agents
mkdir -p logs/executions

echo ""
echo "Running risk-oracle agent..."
echo "Command: aqe spawn --agents risk-oracle --task \"Analyze project for security risks and code quality issues\""
echo ""

# Run the agent
npx ts-node src/cli/aqe.ts spawn --agents risk-oracle --task "Analyze project for security risks and code quality issues"

echo ""
echo "======================================"
echo "Checking for generated reports..."
echo "======================================"

# Check if reports were created
if [ -d "reports/agents/risk-oracle" ]; then
    echo "✅ Report directory created: reports/agents/risk-oracle"

    # List all reports
    echo ""
    echo "Generated reports:"
    ls -la reports/agents/risk-oracle/

    # Show the latest markdown report
    LATEST_MD=$(ls -t reports/agents/risk-oracle/*.md 2>/dev/null | head -1)
    if [ -f "$LATEST_MD" ]; then
        echo ""
        echo "Latest report preview ($LATEST_MD):"
        echo "--------------------------------------"
        head -30 "$LATEST_MD"
        echo "..."
        echo "(truncated - view full report at: $LATEST_MD)"
    fi

    # Show the latest JSON report
    LATEST_JSON=$(ls -t reports/agents/risk-oracle/*.json 2>/dev/null | head -1)
    if [ -f "$LATEST_JSON" ]; then
        echo ""
        echo "Latest JSON report: $LATEST_JSON"
    fi
else
    echo "❌ No report directory found at reports/agents/risk-oracle"
fi

echo ""
echo "======================================"
echo "Checking for execution logs..."
echo "======================================"

# Check if logs were created
LOG_FILES=$(ls logs/executions/*risk-oracle* 2>/dev/null)
if [ -n "$LOG_FILES" ]; then
    echo "✅ Log files created:"
    echo "$LOG_FILES"

    # Show a preview of the latest log
    LATEST_LOG=$(ls -t logs/executions/*risk-oracle* 2>/dev/null | head -1)
    if [ -f "$LATEST_LOG" ]; then
        echo ""
        echo "Latest log preview ($LATEST_LOG):"
        echo "--------------------------------------"
        head -20 "$LATEST_LOG"
        echo "..."
        echo "(truncated - view full log at: $LATEST_LOG)"
    fi
else
    echo "❌ No log files found in logs/executions/"
fi

echo ""
echo "======================================"
echo "Test Complete!"
echo "======================================"
echo ""
echo "Summary:"
echo "- Reports should be in: reports/agents/[agent-name]/"
echo "- Logs should be in: logs/executions/"
echo "- Each execution creates:"
echo "  • [timestamp]-report.json (structured data)"
echo "  • [timestamp]-report.md (human-readable)"
echo "  • [timestamp]-[agent].log (execution log)"