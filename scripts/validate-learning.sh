#!/bin/bash
# Validation Script for Learning System (Phase 4)
# Tests CLI commands and learning metrics

set -e

echo "🧪 Testing Learning System CLI Commands"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to run test
run_test() {
  local test_name="$1"
  local command="$2"

  echo -n "Testing: $test_name... "

  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
  fi
}

# 1. Test aqe learn status
run_test "aqe learn status" "npm run aqe learn status"

# 2. Test aqe learn metrics
run_test "aqe learn metrics" "npm run aqe learn metrics"

# 3. Test aqe learn metrics with days filter
run_test "aqe learn metrics --days 30" "npm run aqe learn metrics -- --days 30"

# 4. Test aqe learn history
run_test "aqe learn history" "npm run aqe learn history"

# 5. Test aqe learn enable
run_test "aqe learn enable --all" "npm run aqe learn enable -- --all"

# Summary
echo ""
echo "========================================"
echo "Test Results:"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
