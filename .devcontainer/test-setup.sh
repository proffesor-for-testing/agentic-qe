#!/bin/bash
# Test suite for DevContainer setup
# This script tests all fixes for the identified issues

set -e



# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test results array
declare -a TEST_RESULTS

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="${3:-0}"
    
    echo -n "Testing: $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        if [ "$expected_result" -eq 0 ]; then
            echo -e "${GREEN}✅ PASSED${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            TEST_RESULTS+=("✅ $test_name: PASSED")
        else
            echo -e "${RED}❌ FAILED${NC} (expected to fail but passed)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            TEST_RESULTS+=("❌ $test_name: FAILED (unexpected pass)")
        fi
    else
        if [ "$expected_result" -ne 0 ]; then
            echo -e "${GREEN}✅ PASSED${NC} (correctly failed)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            TEST_RESULTS+=("✅ $test_name: PASSED (expected failure)")
        else
            echo -e "${RED}❌ FAILED${NC}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            TEST_RESULTS+=("❌ $test_name: FAILED")
        fi
    fi
}

# Platform detection
detect_platform() {
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
        echo "windows"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "linux"
    fi
}

PLATFORM=$(detect_platform)

echo "=========================================="
echo "🧪 DevContainer Setup Test Suite"
echo "Platform: $PLATFORM"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Test 1: Git safe.directory configuration (Issue #10)
echo "📝 Testing Git Configuration (Issue #10)..."
run_test "Git is installed" "command -v git"
run_test "Git safe.directory is configured" "git config --global --get-all safe.directory | grep -q '*'"
run_test "Git can access current repository" "git status"
echo ""

# Test 2: Line endings in shell scripts (Issue #6)
echo "📝 Testing Line Endings (Issue #6)..."
run_test ".gitattributes exists" "test -f .gitattributes"
run_test ".gitattributes has shell script rules" "grep -q '\*.sh.*eol=lf' .gitattributes"
run_test "install-tools.sh has LF endings" "! file .devcontainer/install-tools.sh | grep -q CRLF"
echo ""

# Test 3: Platform-specific tmux installation (Issue #9)
echo "📝 Testing Terminal Multiplexer (Issue #9)..."
if [ "$PLATFORM" != "windows" ]; then
    run_test "tmux is available (non-Windows)" "command -v tmux"
else
    echo -e "${YELLOW}⚠️ Skipping tmux test on Windows${NC}"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
fi
echo ""

# Test 4: DevPod documentation (Issue #5)
echo "📝 Testing Documentation (Issue #5)..."
run_test "README exists" "test -f README.md"
run_test "README mentions correct DevPod syntax" "grep -q '@workspace/basic' README.md"
run_test "README does NOT mention --branch flag" "! grep -q '\-\-branch' README.md"
echo ""

# Test 5: Secrets management (Issue #11)
echo "📝 Testing Secrets Management (Issue #11)..."
run_test ".env.example exists" "test -f .env.example"
run_test ".env is in .gitignore" "grep -q '^\.env$' .gitignore"
run_test "Secrets directory is ignored" "test -f .devcontainer/secrets/.gitignore"
echo ""

# Test 6: Tool installations
echo "📝 Testing Tool Installations..."
run_test "Node.js is installed" "command -v node"
run_test "npm is installed" "command -v npm"
run_test "Python is installed" "command -v python3"
run_test "GitHub CLI is installed" "command -v gh"
echo ""

# Test 7: Installation report
echo "📝 Testing Installation Report..."
run_test "Installation report exists" "test -f .devcontainer/installation-report.md"
run_test "Installation report is readable" "test -r .devcontainer/installation-report.md"
echo ""

# Test 8: Windows-specific fixes (Issue #4)
if [ "$PLATFORM" == "windows" ]; then
    echo "📝 Testing Windows-Specific Fixes (Issue #4)..."
    run_test "Windows Terminal profile exists" "test -f ~/.windows-terminal-profile.json"
    run_test "DOS2Unix available or sed works" "command -v dos2unix || command -v sed"
else
    echo -e "${YELLOW}⚠️ Skipping Windows-specific tests on $PLATFORM${NC}"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
fi
echo ""

# Summary
echo "=========================================="
echo "📊 Test Results Summary"
echo "=========================================="
echo -e "✅ Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "❌ Failed:  ${RED}$TESTS_FAILED${NC}"
echo -e "⚠️  Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
echo ""

# Detailed results
if [ ${#TEST_RESULTS[@]} -gt 0 ]; then
    echo "Detailed Results:"
    for result in "${TEST_RESULTS[@]}"; do
        echo "  $result"
    done
    echo ""
fi

# Exit code
if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review and fix.${NC}"
    exit 1
fi