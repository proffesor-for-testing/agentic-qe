#!/bin/bash
# Testability Scorer - Quick 5-Principle Check

set -e

URL="${1:-https://www.saucedemo.com}"

echo "⚡ Running Quick Testability Check (5 principles)..."
echo "   URL: $URL"
echo "   Estimated time: 2 minutes"
echo ""

# Update config
if [ -f "tests/testability-scorer/config.js" ]; then
  sed -i.bak "s|baseURL:.*|baseURL: '$URL',|" tests/testability-scorer/config.js
fi

# Run quick assessment with JSON output
TIMESTAMP=$(date +%s)
JSON_REPORT="tests/reports/quick-check-$TIMESTAMP.json"
HTML_REPORT="tests/reports/quick-check-$TIMESTAMP.html"

npx playwright test tests/testability-scorer/quick-testability-scorer.spec.js \
  --reporter=list,json

# Copy JSON results if generated
if [ -f "tests/reports/latest.json" ]; then
  cp tests/reports/latest.json "$JSON_REPORT"

  # Generate HTML report
  echo ""
  echo "📊 Generating HTML report..."
  node .claude/skills/testability-scorer/scripts/generate-html-report.js \
    "$JSON_REPORT" \
    "$HTML_REPORT"

  echo ""
  echo "📊 Quick Check HTML Report: $HTML_REPORT"
  echo ""
  echo "View report:"
  echo "   open $HTML_REPORT"
fi

echo ""
echo "✅ Quick check complete!"
echo ""
echo "For comprehensive 10-principle analysis:"
echo "   ./scripts/run-assessment.sh"

# Note: HTML report auto-opens by default via generate-html-report.js
# To disable auto-open, set AUTO_OPEN=false before running this script
