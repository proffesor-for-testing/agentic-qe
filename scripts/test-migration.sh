#!/bin/bash

##############################################################################
# Migration Test Suite Runner
# Executes all migration-related tests in the correct order
##############################################################################

set -e

echo "🧪 Running Migration Test Suite"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test and track results
run_test() {
  local test_name="$1"
  local test_pattern="$2"

  echo -e "${YELLOW}Running: ${test_name}${NC}"

  if npm run test:unit -- --testPathPattern="${test_pattern}" --silent 2>&1 | grep -q "PASS\|Tests:.*passed"; then
    echo -e "${GREEN}✓ ${test_name} passed${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ ${test_name} failed${NC}"
    ((TESTS_FAILED++))
  fi

  echo ""
}

# Function to run integration test
run_integration_test() {
  local test_name="$1"
  local test_pattern="$2"

  echo -e "${YELLOW}Running: ${test_name}${NC}"

  if npm run test:integration -- --testPathPattern="${test_pattern}" --silent 2>&1 | grep -q "PASS\|Tests:.*passed"; then
    echo -e "${GREEN}✓ ${test_name} passed${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ ${test_name} failed${NC}"
    ((TESTS_FAILED++))
  fi

  echo ""
}

# Phase 1: Unit Tests
echo "📦 Phase 1: Unit Tests"
echo "----------------------"
run_test "Database Migration Functions" "database-migration"
run_test "Schema Version Management" "schema-version"

# Phase 2: Integration Tests
echo "🔗 Phase 2: Integration Tests"
echo "-----------------------------"
run_integration_test "Backup and Restore System" "backup-restore"
run_integration_test "Data Integrity" "data-integrity"
run_integration_test "Rollback Functionality" "rollback"

# Summary
echo ""
echo "================================"
echo "📊 Test Summary"
echo "================================"
echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All migration tests passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Review test coverage report"
  echo "  2. Run migration in staging environment"
  echo "  3. Verify production readiness"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Please review the errors above.${NC}"
  exit 1
fi
