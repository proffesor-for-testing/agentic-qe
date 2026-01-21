#!/bin/bash
set -e

echo "=========================================="
echo "FULL ESLint FIX VERIFICATION"
echo "=========================================="
echo ""

RESULTS_DIR="/workspaces/agentic-qe-cf/reports/verification"
mkdir -p "$RESULTS_DIR"

# 1. Full ESLint scan
echo "1. Running full ESLint scan..."
npx eslint src --format json > "$RESULTS_DIR/full-lint.json" 2>&1 || true
npx eslint src --format stylish > "$RESULTS_DIR/full-lint.txt" 2>&1 || true

ERRORS=$(cat "$RESULTS_DIR/full-lint.json" | jq '[.[].messages[] | select(.severity == 2)] | length' 2>/dev/null || echo "0")
WARNINGS=$(cat "$RESULTS_DIR/full-lint.json" | jq '[.[].messages[] | select(.severity == 1)] | length' 2>/dev/null || echo "0")

echo "   Total Errors: $ERRORS (target: 0)"
echo "   Total Warnings: $WARNINGS (target: <10)"
echo ""

# 2. TypeScript compilation
echo "2. TypeScript compilation..."
npm run build > "$RESULTS_DIR/build.txt" 2>&1
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
    echo "   ✅ Build PASSED"
else
    echo "   ❌ Build FAILED"
    cat "$RESULTS_DIR/build.txt"
fi
echo ""

# 3. Type checking
echo "3. Type checking..."
npm run typecheck > "$RESULTS_DIR/typecheck.txt" 2>&1
TYPECHECK_EXIT=$?
if [ $TYPECHECK_EXIT -eq 0 ]; then
    echo "   ✅ Type check PASSED"
else
    echo "   ❌ Type check FAILED"
    cat "$RESULTS_DIR/typecheck.txt"
fi
echo ""

# 4. Run test suite
echo "4. Running test suite..."
npm test -- --passWithNoTests --json > "$RESULTS_DIR/tests.json" 2>&1 || true
npm test -- --passWithNoTests > "$RESULTS_DIR/tests.txt" 2>&1 || true

TESTS_PASSED=$(cat "$RESULTS_DIR/tests.json" | jq '.numPassedTests' 2>/dev/null || echo "0")
TESTS_FAILED=$(cat "$RESULTS_DIR/tests.json" | jq '.numFailedTests' 2>/dev/null || echo "0")
TESTS_TOTAL=$(cat "$RESULTS_DIR/tests.json" | jq '.numTotalTests' 2>/dev/null || echo "0")

if [ $TESTS_FAILED -eq 0 ]; then
    echo "   ✅ Tests PASSED ($TESTS_PASSED/$TESTS_TOTAL)"
else
    echo "   ❌ Tests FAILED ($TESTS_FAILED failed, $TESTS_PASSED passed)"
fi
echo ""

# 5. Check specific critical files
echo "5. Checking critical files..."
for file in BaseAgent.ts TestGeneratorAgent.ts ApiContractValidatorAgent.ts CoverageAnalyzerAgent.ts; do
    npx eslint "**/$file" --format json > "$RESULTS_DIR/check-$file.json" 2>&1 || true
    FILE_ISSUES=$(cat "$RESULTS_DIR/check-$file.json" | jq '[.[].messages[]] | length' 2>/dev/null || echo "0")
    if [ $FILE_ISSUES -eq 0 ]; then
        echo "   ✅ $file: 0 issues"
    else
        echo "   ⚠️  $file: $FILE_ISSUES issues"
    fi
done
echo ""

# 6. Coverage check (if available)
echo "6. Running test coverage..."
npm test -- --coverage --passWithNoTests --json > "$RESULTS_DIR/coverage.json" 2>&1 || true
if [ -f "$RESULTS_DIR/coverage.json" ]; then
    COVERAGE=$(cat "$RESULTS_DIR/coverage.json" | jq '.coverageMap' 2>/dev/null || echo "{}")
    echo "   Coverage data collected (see reports/verification/coverage.json)"
else
    echo "   Coverage data not available"
fi
echo ""

echo "=========================================="
echo "VERIFICATION COMPLETE"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ESLint: $ERRORS errors, $WARNINGS warnings"
echo "  Build: $([ $BUILD_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
echo "  Type check: $([ $TYPECHECK_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
echo "  Tests: $TESTS_PASSED passed, $TESTS_FAILED failed"
echo ""

# Overall status
if [ $ERRORS -eq 0 ] && [ $BUILD_EXIT -eq 0 ] && [ $TYPECHECK_EXIT -eq 0 ] && [ $TESTS_FAILED -eq 0 ]; then
    echo "Status: ✅ ALL CHECKS PASSED"
    exit 0
else
    echo "Status: ❌ SOME CHECKS FAILED"
    exit 1
fi
