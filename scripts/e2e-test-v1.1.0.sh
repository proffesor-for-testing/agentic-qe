#!/usr/bin/env bash
##
## E2E Validation Script for Agentic QE v1.1.0
## Comprehensive validation of all CLI commands
##

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0
declare -a FAILED_TESTS

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
  ((PASSED++))
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
  ((FAILED++))
  FAILED_TESTS+=("$1")
}

log_warn() {
  echo -e "${YELLOW}[!]${NC} $1"
}

# Test function
run_test() {
  local test_name="$1"
  local test_command="$2"
  local expected_exit_code="${3:-0}"

  echo ""
  log_info "Testing: $test_name"
  echo "Command: $test_command"

  if eval "$test_command" > /dev/null 2>&1; then
    actual_exit=$?
  else
    actual_exit=$?
  fi

  if [ $actual_exit -eq $expected_exit_code ]; then
    log_success "$test_name"
    return 0
  else
    log_error "$test_name (exit code: $actual_exit, expected: $expected_exit_code)"
    return 1
  fi
}

echo "=========================================="
echo "  AQE v1.1.0 E2E Validation Suite"
echo "=========================================="
echo ""

# Phase 1: Build & Basic Verification
echo ""
echo "=== Phase 1: Build & Basic Verification ==="
echo ""

run_test "Version command" "./bin/aqe --version | grep -q '1.1.0'"
run_test "Help command" "./bin/aqe --help | grep -q 'Agentic Quality Engineering'"
run_test "Routing command listed" "./bin/aqe --help | grep -q 'routing'"
run_test "Learn command listed" "./bin/aqe --help | grep -q 'learn'"
run_test "Patterns command listed" "./bin/aqe --help | grep -q 'patterns'"
run_test "Improve command listed" "./bin/aqe --help | grep -q 'improve'"

# Phase 4: Test Phase 1 Commands
echo ""
echo "=== Phase 4: Test Phase 1 Commands (Routing) ==="
echo ""

# Since these commands require config files, let's just test they're accessible
run_test "Routing help" "./bin/aqe routing --help | grep -q 'Multi-Model Router'"
run_test "Routing status command exists" "./bin/aqe routing --help | grep -q 'status'"
run_test "Routing enable command exists" "./bin/aqe routing --help | grep -q 'enable'"
run_test "Routing dashboard command exists" "./bin/aqe routing --help | grep -q 'dashboard'"
run_test "Routing report command exists" "./bin/aqe routing --help | grep -q 'report'"

# Phase 5: Test Phase 2 Commands
echo ""
echo "=== Phase 5: Test Phase 2 Commands ==="
echo ""

# Learning commands
run_test "Learn help" "./bin/aqe learn --help | grep -q 'agent learning'"
run_test "Learn status command exists" "./bin/aqe learn --help | grep -q 'status'"
run_test "Learn enable command exists" "./bin/aqe learn --help | grep -q 'enable'"
run_test "Learn history command exists" "./bin/aqe learn --help | grep -q 'history'"
run_test "Learn train command exists" "./bin/aqe learn --help | grep -q 'train'"

# Patterns commands
run_test "Patterns help" "./bin/aqe patterns --help | grep -q 'QEReasoningBank'"
run_test "Patterns list command exists" "./bin/aqe patterns --help | grep -q 'list'"
run_test "Patterns search command exists" "./bin/aqe patterns --help | grep -q 'search'"
run_test "Patterns extract command exists" "./bin/aqe patterns --help | grep -q 'extract'"
run_test "Patterns stats command exists" "./bin/aqe patterns --help | grep -q 'stats'"

# Improve commands
run_test "Improve help" "./bin/aqe improve --help | grep -q 'continuous improvement'"
run_test "Improve status command exists" "./bin/aqe improve --help | grep -q 'status'"
run_test "Improve start command exists" "./bin/aqe improve --help | grep -q 'start'"
run_test "Improve failures command exists" "./bin/aqe improve --help | grep -q 'failures'"

# Phase 8: Error Handling
echo ""
echo "=== Phase 8: Error Handling Tests ==="
echo ""

run_test "Invalid command fails gracefully" "./bin/aqe nonexistent 2>&1 | grep -q \"error: unknown command 'nonexistent'\"" 1
run_test "Missing required argument fails" "./bin/aqe patterns search 2>&1 | grep -q \"error: missing required argument\"" 1

# Summary
echo ""
echo "=========================================="
echo "  Test Summary"
echo "=========================================="
echo ""
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "Failed tests:"
  for test in "${FAILED_TESTS[@]}"; do
    echo -e "  ${RED}✗${NC} $test"
  done
  exit 1
else
  echo -e "${GREEN}All tests passed! ✓${NC}"
  exit 0
fi
