#!/bin/bash
# Demo: Chrome Auto-Launch for Testability Reports

set -e

echo "🎯 Chrome Auto-Launch Demo"
echo "=========================="
echo ""

# Use sample data
SAMPLE_JSON=".claude/skills/testability-scorer/resources/examples/sample-results.json"
DEMO_REPORT="tests/reports/demo-chrome-launch-$(date +%s).html"

echo "📊 Generating testability report..."
echo "   Input:  $SAMPLE_JSON"
echo "   Output: $DEMO_REPORT"
echo ""

# Generate report (Chrome will auto-launch)
node .claude/skills/testability-scorer/scripts/generate-html-report.js \
  "$SAMPLE_JSON" \
  "$DEMO_REPORT"

echo ""
echo "✅ Demo Complete!"
echo ""
echo "What happened:"
echo "  1. ✓ HTML report generated with Chart.js radar chart"
echo "  2. ✓ Chrome attempted to launch automatically"
echo "  3. ✓ Color-coded grades (A=green, F=red)"
echo "  4. ✓ AI-powered recommendations included"
echo ""
echo "Report location:"
echo "  $DEMO_REPORT"
echo ""
echo "To disable auto-launch next time:"
echo "  AUTO_OPEN=false bash $0"
echo ""
