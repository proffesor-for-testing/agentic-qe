#!/bin/bash
# Optimized CI Test Script
# Target: < 2 minutes total execution time
# Strategy: Run journey tests first (highest value), then critical tests

set -e

echo "🚀 Starting Optimized CI Test Suite"
echo "=================================="
START_TIME=$(date +%s)

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Results tracking
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

# Function to run test suite and track time
run_suite() {
    local suite_name=$1
    local test_path=$2
    local memory_limit=${3:-768}

    echo ""
    echo "📦 Running: $suite_name"
    echo "-----------------------------------"
    SUITE_START=$(date +%s)

    if node --expose-gc --max-old-space-size=$memory_limit --no-compilation-cache \
        node_modules/.bin/jest "$test_path" --runInBand --forceExit --passWithNoTests \
        --testTimeout=60000 --silent 2>&1; then
        SUITE_END=$(date +%s)
        SUITE_DURATION=$((SUITE_END - SUITE_START))
        echo -e "${GREEN}✅ $suite_name passed (${SUITE_DURATION}s)${NC}"
        return 0
    else
        SUITE_END=$(date +%s)
        SUITE_DURATION=$((SUITE_END - SUITE_START))
        echo -e "${RED}❌ $suite_name failed (${SUITE_DURATION}s)${NC}"
        return 1
    fi
}

# Track failures
FAILURES=()

# Phase 1: Journey Tests (highest value, real user workflows)
echo ""
echo "🎯 Phase 1: Journey Tests (User Value)"
if ! run_suite "Journey Tests" "tests/journeys" 1024; then
    FAILURES+=("Journey Tests")
fi

# Phase 2: Contract Tests (API stability)
echo ""
echo "📝 Phase 2: Contract Tests (API Stability)"
if [ -d "tests/contracts" ] && [ "$(ls -A tests/contracts/*.test.ts 2>/dev/null)" ]; then
    if ! run_suite "Contract Tests" "tests/contracts" 512; then
        FAILURES+=("Contract Tests")
    fi
else
    echo -e "${YELLOW}⏭️ Contract tests directory empty or not found${NC}"
fi

# Phase 3: Critical Infrastructure Tests
echo ""
echo "🔧 Phase 3: Infrastructure Tests"
if [ -d "tests/infrastructure" ] && [ "$(ls -A tests/infrastructure/*.test.ts 2>/dev/null)" ]; then
    if ! run_suite "Infrastructure Tests" "tests/infrastructure" 768; then
        FAILURES+=("Infrastructure Tests")
    fi
else
    echo -e "${YELLOW}⏭️ Infrastructure tests directory empty or not found${NC}"
fi

# Phase 4: Regression Tests (fixed bugs)
echo ""
echo "🐛 Phase 4: Regression Tests"
if [ -d "tests/regression" ] && [ "$(find tests/regression -name '*.test.ts' 2>/dev/null | head -1)" ]; then
    if ! run_suite "Regression Tests" "tests/regression" 512; then
        FAILURES+=("Regression Tests")
    fi
else
    echo -e "${YELLOW}⏭️ Regression tests directory empty${NC}"
fi

# Calculate total time
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

# Summary
echo ""
echo "=================================="
echo "📊 CI Test Summary"
echo "=================================="
echo "Total Duration: ${TOTAL_DURATION}s"

if [ ${#FAILURES[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All test suites passed!${NC}"

    # Check if under 2 minute target
    if [ $TOTAL_DURATION -lt 120 ]; then
        echo -e "${GREEN}🎉 Under 2 minute target (${TOTAL_DURATION}s < 120s)${NC}"
    else
        echo -e "${YELLOW}⚠️ Over 2 minute target (${TOTAL_DURATION}s > 120s)${NC}"
    fi

    exit 0
else
    echo -e "${RED}❌ Failed suites: ${FAILURES[*]}${NC}"
    exit 1
fi
