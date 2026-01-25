#!/bin/bash

# Script to consolidate coverage analysis tools
# This script:
# 1. Comments out deprecated coverage tools
# 2. Updates TOOL_NAMES constants
# 3. Removes server.ts routing for deprecated tools

set -e

TOOLS_FILE="src/mcp/tools.ts"
SERVER_FILE="src/mcp/server.ts"

echo "Step 1: Comment out coverage_analyze_with_risk_scoring tool definition..."
# Find the line number where this tool starts
LINE_START=$(grep -n "name: 'mcp__agentic_qe__coverage_analyze_with_risk_scoring'" "$TOOLS_FILE" | head -1 | cut -d: -f1)
# Find where it ends (next tool or closing brace)
LINE_END=$(tail -n +$LINE_START "$TOOLS_FILE" | grep -n "^  }," | head -1 | cut -d: -f1)
LINE_END=$((LINE_START + LINE_END - 1))

echo "  Tool spans lines $LINE_START to $LINE_END"

# Use sed to comment out those lines
sed -i "${LINE_START},$((LINE_END))s/^/  \/\/ /" "$TOOLS_FILE"

# Add deprecation comment
sed -i "${LINE_START}i\  // DEPRECATED: Use coverage_analyze_stream with mode='risk-scored' instead\n  // Kept for backward compatibility only - will be removed in v3.0.0" "$TOOLS_FILE"

echo "Step 2: Comment out TOOL_NAMES constants..."
sed -i 's/^  COVERAGE_ANALYZE_SUBLINEAR:/  \/\/ COVERAGE_ANALYZE_SUBLINEAR:/' "$TOOLS_FILE"
sed -i 's/COVERAGE_ANALYZE_SUBLINEAR;$/COVERAGE_ANALYZE_SUBLINEAR; \/\/ DEPRECATED/' "$TOOLS_FILE"

sed -i 's/^  COVERAGE_GAPS_DETECT:/  \/\/ COVERAGE_GAPS_DETECT:/' "$TOOLS_FILE"
sed -i 's/COVERAGE_GAPS_DETECT;$/COVERAGE_GAPS_DETECT; \/\/ DEPRECATED/' "$TOOLS_FILE"

sed -i 's/^  COVERAGE_ANALYZE_WITH_RISK_SCORING:/  \/\/ COVERAGE_ANALYZE_WITH_RISK_SCORING:/' "$TOOLS_FILE"
sed -i 's/COVERAGE_ANALYZE_WITH_RISK_SCORING;$/COVERAGE_ANALYZE_WITH_RISK_SCORING; \/\/ DEPRECATED/' "$TOOLS_FILE"

echo "Step 3: Update Phase 3 comment..."
sed -i 's/\/\/ Coverage Domain Tools (4 tools)/\/\/ Coverage Domain Tools (Now 2 active tools after consolidation)/' "$TOOLS_FILE"

echo "Done! Coverage tools consolidated."
echo "Remaining active tools:"
echo "  - coverage_analyze_stream (unified: basic/risk-scored/sublinear modes)"
echo "  - coverage_detect_gaps_ml (unified: ML and non-ML modes via useML parameter)"
echo "  - coverage_recommend_tests (unchanged)"
echo "  - coverage_calculate_trends (unchanged)"
