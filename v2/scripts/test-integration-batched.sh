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

# Get all integration test files organized by category
echo "📋 Discovering integration test files..."

# Main integration tests (root level) - batch size 5
MAIN_FILES=($(find tests/integration -maxdepth 1 -name "*.test.ts" | sort))

# Heavy tests that need individual execution (1024MB each)
HEAVY_FILES=($(find tests/integration/phase2 tests/integration/learning -name "*.test.ts" 2>/dev/null | sort))

# Medium weight tests - batch size 3 (768MB)
MEDIUM_DIRS="tests/integration/agentdb tests/integration/phase1 tests/integration/mcp tests/integration/trm"
MEDIUM_FILES=()
for dir in $MEDIUM_DIRS; do
    if [ -d "$dir" ]; then
        while IFS= read -r file; do
            MEDIUM_FILES+=("$file")
        done < <(find "$dir" -name "*.test.ts" 2>/dev/null | sort)
    fi
done

# Light tests - batch size 5 (512MB)
LIGHT_DIRS="tests/integration/cache tests/integration/output tests/integration/agents tests/integration/pipelines tests/integration/routing tests/integration/strategies"
LIGHT_FILES=()
for dir in $LIGHT_DIRS; do
    if [ -d "$dir" ]; then
        while IFS= read -r file; do
            LIGHT_FILES+=("$file")
        done < <(find "$dir" -name "*.test.ts" 2>/dev/null | sort)
    fi
done

echo "Found ${#MAIN_FILES[@]} main integration tests (batch 5, 768MB)"
echo "Found ${#HEAVY_FILES[@]} heavy tests (individual, 1024MB)"
echo "Found ${#MEDIUM_FILES[@]} medium tests (batch 3, 768MB)"
echo "Found ${#LIGHT_FILES[@]} light tests (batch 5, 512MB)"
echo "Total: $((${#MAIN_FILES[@]} + ${#HEAVY_FILES[@]} + ${#MEDIUM_FILES[@]} + ${#LIGHT_FILES[@]})) test files"
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

# Function to run heavy tests individually
run_heavy_test() {
    local file=$1
    local memory_limit=$2

    echo "🔬 Running $(basename "$file") (${memory_limit}MB)..."
    if node --expose-gc --max-old-space-size=$memory_limit --no-compilation-cache \
        node_modules/.bin/jest "$file" --runInBand --forceExit --silent 2>&1 | \
        tee /tmp/heavy-$(basename "$file").log | tail -5; then

        local passed=$(grep -oP '\d+(?= passed)' /tmp/heavy-$(basename "$file").log | tail -1 || echo "0")
        local failed=$(grep -oP '\d+(?= failed)' /tmp/heavy-$(basename "$file").log | tail -1 || echo "0")

        TOTAL_PASSED=$((TOTAL_PASSED + passed))
        TOTAL_FAILED=$((TOTAL_FAILED + failed))

        echo "✅ $(basename "$file"): $passed passed, $failed failed"
    else
        echo "❌ $(basename "$file") FAILED"
        FAILED_TESTS+=("$file")
    fi

    # Force memory cleanup
    sleep 2
    echo ""
}

# ============================================================================
# TIER 1: Light tests (batch 5, 512MB) - Fastest, lowest memory
# ============================================================================
if [ ${#LIGHT_FILES[@]} -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 TIER 1: Light Integration Tests (batch 5, 512MB)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    batch_num=1
    for ((i=0; i<${#LIGHT_FILES[@]}; i+=5)); do
        batch=("${LIGHT_FILES[@]:i:5}")
        MEMORY_LIMIT=512
        run_batch "L$batch_num" "${batch[@]}"
        batch_num=$((batch_num + 1))
    done
fi

# ============================================================================
# TIER 2: Main integration tests (batch 5, 768MB)
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 TIER 2: Main Integration Tests (batch 5, 768MB)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

batch_num=1
MEMORY_LIMIT=768
for ((i=0; i<${#MAIN_FILES[@]}; i+=5)); do
    batch=("${MAIN_FILES[@]:i:5}")
    run_batch "M$batch_num" "${batch[@]}"
    batch_num=$((batch_num + 1))
done

# ============================================================================
# TIER 3: Medium tests (batch 3, 768MB) - agentdb, phase1, mcp, trm
# ============================================================================
if [ ${#MEDIUM_FILES[@]} -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 TIER 3: Medium Integration Tests (batch 3, 768MB)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    batch_num=1
    MEMORY_LIMIT=768
    for ((i=0; i<${#MEDIUM_FILES[@]}; i+=3)); do
        batch=("${MEDIUM_FILES[@]:i:3}")
        run_batch "D$batch_num" "${batch[@]}"
        batch_num=$((batch_num + 1))
    done
fi

# ============================================================================
# TIER 4: Heavy tests (individual, 1024MB) - learning, phase2
# ============================================================================
if [ ${#HEAVY_FILES[@]} -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 TIER 4: Heavy Integration Tests (individual, 1024MB)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    for file in "${HEAVY_FILES[@]}"; do
        run_heavy_test "$file" 1024
    done
fi

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
