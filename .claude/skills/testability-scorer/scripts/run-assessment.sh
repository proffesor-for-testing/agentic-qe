#!/bin/bash
# Testability Scorer - Full Assessment

set -e

# Parse arguments
URL="${1:-https://www.saucedemo.com}"
BROWSER="${2:-chromium}"

echo "🔍 Running Full Testability Assessment..."
echo "   URL: $URL"
echo "   Browser: $BROWSER"
echo ""

# Update config with URL
if [ -f "tests/testability-scorer/config.js" ]; then
  sed -i.bak "s|baseURL:.*|baseURL: '$URL',|" tests/testability-scorer/config.js
fi

# Run full 10-principle assessment
echo "📊 Analyzing all 10 principles..."
echo "   (Serial execution ensures all principles are captured)"
npx playwright test tests/testability-scorer/testability-scorer.spec.js \
  --project=$BROWSER \
  --workers=1 \
  --reporter=html,json

# Generate timestamp for unique report naming
TIMESTAMP=$(date +%s)
JSON_REPORT="tests/reports/testability-results-$TIMESTAMP.json"
HTML_REPORT="tests/reports/testability-report-$TIMESTAMP.html"

# Copy latest JSON results for HTML generation
if [ -f "tests/reports/latest.json" ]; then
  cp tests/reports/latest.json "$JSON_REPORT"
fi

# Generate HTML report with Chart.js visualization
echo ""
echo "📊 Generating HTML report with radar chart..."
node .claude/skills/testability-scorer/scripts/generate-html-report.js \
  "$JSON_REPORT" \
  "$HTML_REPORT"

echo ""
echo "✅ Assessment complete!"
echo ""
echo "📈 Results:"
cat "$JSON_REPORT" | jq '.overall' | while read score; do
  echo "   Overall Score: $score/100"
done

echo ""
echo "📊 HTML Report: $HTML_REPORT"
echo "📄 JSON Report: $JSON_REPORT"
echo "📄 Playwright Report: tests/reports/html/"
echo ""
echo "View HTML report (auto-generated with Chart.js visualization):"
echo "   open $HTML_REPORT"
echo ""
echo "View Playwright report:"
echo "   npx playwright show-report"
echo ""
echo "View trends:"
echo "   node scripts/view-trends.js"

# Note: HTML report auto-opens by default via generate-html-report.js
# To disable auto-open, set AUTO_OPEN=false before running this script
