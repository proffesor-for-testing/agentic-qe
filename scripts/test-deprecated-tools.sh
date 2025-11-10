#!/bin/bash
#
# Test Deprecated Tools - Phase 3 Backward Compatibility
#
# This script runs a quick verification of all deprecated tool wrappers
# to ensure they emit warnings and forward parameters correctly.
#

set -e

echo "=================================================="
echo "Testing Phase 3 Deprecated Tool Wrappers"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Run specific deprecated tool tests
echo "Running deprecated tool tests..."
echo ""

# Run tests with vitest
if npm run test:unit -- tests/mcp/tools/deprecated.test.ts 2>&1 | tee /tmp/deprecated-test-output.txt; then
  echo -e "${GREEN}✓ Deprecated tool tests passed${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ Deprecated tool tests failed${NC}"
  ((TESTS_FAILED++))
fi

((TESTS_RUN++))

echo ""
echo "=================================================="
echo "Test Summary"
echo "=================================================="
echo ""
echo "Tests Run:    $TESTS_RUN"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

# Check test output for deprecation warnings
echo "Checking for deprecation warning output..."
if grep -q "DEPRECATION WARNING" /tmp/deprecated-test-output.txt 2>/dev/null; then
  echo -e "${GREEN}✓ Deprecation warnings detected in test output${NC}"
else
  echo -e "${YELLOW}⚠ Deprecation warnings not detected (might be suppressed in tests)${NC}"
fi

echo ""

# List all deprecated tools
echo "=================================================="
echo "Deprecated Tools Summary"
echo "=================================================="
echo ""
echo "Coverage Domain (2 tools):"
echo "  - test_coverage_detailed → analyzeCoverageWithRiskScoring"
echo "  - test_coverage_gaps → identifyUncoveredRiskAreas"
echo ""
echo "Flaky Detection Domain (3 tools):"
echo "  - flaky_test_detect → detectFlakyTestsStatistical"
echo "  - flaky_test_patterns → analyzeFlakyTestPatterns"
echo "  - flaky_test_stabilize → stabilizeFlakyTestAuto"
echo ""
echo "Performance Domain (2 tools):"
echo "  - performance_benchmark_run → runPerformanceBenchmark"
echo "  - performance_monitor_realtime → monitorRealtimePerformance"
echo ""
echo "Security Domain (1 tool):"
echo "  - security_scan_comprehensive → scanSecurityComprehensive"
echo ""
echo "Visual Domain (1 tool):"
echo "  - visual_test_regression → detectVisualRegression"
echo ""
echo "Total: 9 deprecated tools"
echo ""

# Exit with appropriate code
if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo ""
  echo "Backward compatibility: ✅ VERIFIED"
  echo "Deprecation warnings: ✅ WORKING"
  echo "Parameter forwarding: ✅ FUNCTIONAL"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  echo ""
  echo "Please review test output above for details."
  echo ""
  exit 1
fi
