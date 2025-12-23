#!/bin/bash
# Safe batched integration test execution
# Runs integration tests in small batches to prevent memory exhaustion

set -e

echo "🧪 Batched Integration Test Execution"
echo "======================================"
echo ""

# Memory check
echo "🔍 Pre-Test Memory Check:"
free -h | grep "Mem:" || echo "Memory check not available"
echo ""

# Batch configuration
BATCH_SIZE=5
MEMORY_LIMIT=768
FAILED_TESTS=()
TOTAL_PASSED=0
TOTAL_FAILED=0

# Get all integration test files (excluding phase2 for now)
echo "📋 Discovering integration test files..."
TEST_FILES=($(find tests/integration -maxdepth 1 -name "*.test.ts" | sort))
PHASE2_FILES=($(find tests/integration/phase2 -name "*.test.ts" | sort))

echo "Found ${#TEST_FILES[@]} main integration tests"
echo "Found ${#PHASE2_FILES[@]} phase2 integration tests"
echo ""

# Function to run a batch of tests
run_batch() {
    local batch_num=$1
    shift
    local files=("$@")

    echo "🚀 Batch $batch_num: Running ${#files[@]} tests..."
    echo "Files: ${files[*]##*/}"

    if node --expose-gc --max-old-space-size=$MEMORY_LIMIT --no-compilation-cache \
        node_modules/.bin/jest "${files[@]}" --runInBand --forceExit --silent 2>&1 | \
        tee /tmp/batch-$batch_num.log | tail -5; then

        # Extract pass/fail counts from log
        local passed=$(grep -oP '\d+(?= passed)' /tmp/batch-$batch_num.log | tail -1 || echo "0")
        local failed=$(grep -oP '\d+(?= failed)' /tmp/batch-$batch_num.log | tail -1 || echo "0")

        TOTAL_PASSED=$((TOTAL_PASSED + passed))
        TOTAL_FAILED=$((TOTAL_FAILED + failed))

        echo "✅ Batch $batch_num complete: $passed passed, $failed failed"
    else
        echo "❌ Batch $batch_num FAILED"
        for file in "${files[@]}"; do
            FAILED_TESTS+=("$file")
        done
    fi

    # Memory cleanup between batches
    sleep 1
    echo ""
}

# Run main integration tests in batches
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 PHASE 1: Main Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

batch_num=1
for ((i=0; i<${#TEST_FILES[@]}; i+=BATCH_SIZE)); do
    batch=("${TEST_FILES[@]:i:BATCH_SIZE}")
    run_batch $batch_num "${batch[@]}"
    batch_num=$((batch_num + 1))
done

# Run phase2 tests individually (they're heavier)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 PHASE 2: Phase2 Integration Tests (Individual)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for file in "${PHASE2_FILES[@]}"; do
    echo "🔬 Running $(basename "$file")..."
    if node --expose-gc --max-old-space-size=1024 --no-compilation-cache \
        node_modules/.bin/jest "$file" --runInBand --forceExit --silent 2>&1 | \
        tee /tmp/phase2-$(basename "$file").log | tail -5; then

        passed=$(grep -oP '\d+(?= passed)' /tmp/phase2-$(basename "$file").log | tail -1 || echo "0")
        failed=$(grep -oP '\d+(?= failed)' /tmp/phase2-$(basename "$file").log | tail -1 || echo "0")

        TOTAL_PASSED=$((TOTAL_PASSED + passed))
        TOTAL_FAILED=$((TOTAL_FAILED + failed))

        echo "✅ $(basename "$file"): $passed passed, $failed failed"
    else
        echo "❌ $(basename "$file") FAILED"
        FAILED_TESTS+=("$file")
    fi
    sleep 1
    echo ""
done

# Final report
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 FINAL INTEGRATION TEST REPORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Total Passed: $TOTAL_PASSED"
echo "Total Failed: $TOTAL_FAILED"
echo ""

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo "❌ Failed Test Files:"
    for failed in "${FAILED_TESTS[@]}"; do
        echo "   - $failed"
    done
    echo ""
    exit 1
else
    echo "✅ All integration tests passed!"
    exit 0
fi
