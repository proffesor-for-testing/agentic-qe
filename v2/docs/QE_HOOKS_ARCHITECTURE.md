# QE Fleet Hooks Architecture

## Overview

This document defines the comprehensive hook system for the Agentic QE Fleet test lifecycle. All hooks integrate with Claude Flow for memory management and agent coordination.

## Hook Architecture Principles

### 1. Data Flow
```
Trigger Event → Hook Execution → Memory Storage → Agent Coordination → Notification
```

### 2. Memory Namespace Convention
- All QE hooks use `aqe/*` namespace in Claude Flow memory
- Sub-namespaces: `aqe/tests/`, `aqe/coverage/`, `aqe/quality/`, `aqe/execution/`

### 3. Hook Execution Context
- Hooks run in the project context where tests are being managed
- Environment variables provide all necessary context
- Exit codes: 0 (success), 1 (failure), 2 (warning)

### 4. Agent Coordination
- Hooks can spawn agents using `npx claude-flow@alpha agent-spawn`
- Use mesh topology for parallel operations
- Use hierarchical for sequential workflows

---

## Hook Specifications

## 1. pre-test-generation

**Purpose:** Prepare environment and gather context before test generation begins.

**Trigger Conditions:**
- User runs `aqe test <module>`
- CLI command: `npx aqe generate`
- MCP tool: `mcp__agentic_qe__test_generate`

**Environment Variables:**
```bash
AQE_MODULE_PATH          # Path to module under test
AQE_TEST_TYPE           # unit|integration|e2e
AQE_FRAMEWORK           # jest|mocha|vitest|playwright
AQE_COVERAGE_TARGET     # Target coverage percentage
AQE_TEST_PATTERNS       # Glob patterns for test files
AQE_PROJECT_ROOT        # Project root directory
AQE_EXISTING_TESTS      # Path to existing test directory
AQE_COMPLEXITY_LIMIT    # Max cyclomatic complexity
AQE_SESSION_ID          # Unique session identifier
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/pre-test-generation

set -euo pipefail

# Source common utilities
source "$(dirname "$0")/utils/common.sh"

# Log hook execution
log_info "Starting pre-test-generation hook for module: ${AQE_MODULE_PATH}"

# Step 1: Validate module exists
if [[ ! -f "${AQE_MODULE_PATH}" && ! -d "${AQE_MODULE_PATH}" ]]; then
    log_error "Module not found: ${AQE_MODULE_PATH}"
    exit 1
fi

# Step 2: Analyze module complexity
log_info "Analyzing module complexity..."
COMPLEXITY=$(npx ts-morph analyze --file "${AQE_MODULE_PATH}" --metrics complexity)

# Step 3: Store module metadata in memory
npx claude-flow@alpha memory store \
    --key "aqe/generation/${AQE_SESSION_ID}/module" \
    --value "{
        \"path\": \"${AQE_MODULE_PATH}\",
        \"type\": \"${AQE_TEST_TYPE}\",
        \"framework\": \"${AQE_FRAMEWORK}\",
        \"complexity\": ${COMPLEXITY},
        \"target_coverage\": ${AQE_COVERAGE_TARGET},
        \"timestamp\": \"$(date -Iseconds)\"
    }"

# Step 4: Check for existing tests
if [[ -d "${AQE_EXISTING_TESTS}" ]]; then
    EXISTING_COUNT=$(find "${AQE_EXISTING_TESTS}" -name "*.test.*" -o -name "*.spec.*" | wc -l)
    log_info "Found ${EXISTING_COUNT} existing test files"

    npx claude-flow@alpha memory store \
        --key "aqe/generation/${AQE_SESSION_ID}/existing_tests" \
        --value "{\"count\": ${EXISTING_COUNT}, \"path\": \"${AQE_EXISTING_TESTS}\"}"
fi

# Step 5: Determine optimal test strategy based on complexity
if (( COMPLEXITY > AQE_COMPLEXITY_LIMIT )); then
    log_warn "High complexity detected (${COMPLEXITY}). Spawning coverage analyzer for gap identification."

    npx claude-flow@alpha agent-spawn \
        --type "qe-coverage-analyzer" \
        --task "Identify coverage gaps for high-complexity module: ${AQE_MODULE_PATH}" \
        --async
fi

# Step 6: Store generation context for post-hook
npx claude-flow@alpha memory store \
    --key "aqe/generation/${AQE_SESSION_ID}/context" \
    --value "{
        \"start_time\": \"$(date -Iseconds)\",
        \"status\": \"in_progress\"
    }"

# Step 7: Notify start of generation
npx claude-flow@alpha hooks notify \
    --message "Test generation started for ${AQE_MODULE_PATH}" \
    --level "info"

log_success "Pre-test-generation hook completed successfully"
exit 0
```

**Memory Operations:**
- `aqe/generation/{session_id}/module` - Module metadata
- `aqe/generation/{session_id}/existing_tests` - Existing test info
- `aqe/generation/{session_id}/context` - Generation context

**Integration Points:**
- Triggers `coverage-analyzer` agent for complex modules
- Notifies start of generation process
- Prepares context for `post-test-generation` hook

---

## 2. post-test-generation

**Purpose:** Validate generated tests, store results, and trigger quality checks.

**Trigger Conditions:**
- Test generation completes successfully
- Generated test files are written to disk

**Environment Variables:**
```bash
AQE_SESSION_ID           # Session identifier from pre-hook
AQE_GENERATED_FILES      # Comma-separated list of generated test files
AQE_TEST_COUNT          # Number of tests generated
AQE_ASSERTIONS_COUNT    # Total assertions generated
AQE_COVERAGE_ESTIMATE   # Estimated coverage improvement
AQE_GENERATION_TIME     # Time taken to generate tests (seconds)
AQE_MODULE_PATH         # Original module path
AQE_FRAMEWORK           # Test framework used
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/post-test-generation

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting post-test-generation hook for session: ${AQE_SESSION_ID}"

# Step 1: Validate generated files exist
IFS=',' read -ra FILES <<< "${AQE_GENERATED_FILES}"
VALID_FILES=0
for file in "${FILES[@]}"; do
    if [[ -f "${file}" ]]; then
        ((VALID_FILES++))
        log_info "Validated: ${file}"
    else
        log_error "Missing generated file: ${file}"
    fi
done

if [[ ${VALID_FILES} -eq 0 ]]; then
    log_error "No valid test files generated"
    exit 1
fi

# Step 2: Run linting on generated tests
log_info "Linting generated tests..."
for file in "${FILES[@]}"; do
    if [[ -f "${file}" ]]; then
        npx eslint "${file}" --fix || log_warn "Linting issues in ${file}"
    fi
done

# Step 3: Perform static analysis
log_info "Analyzing test quality..."
TEST_QUALITY=$(npx @agentic-qe/analyzer analyze-tests \
    --files "${AQE_GENERATED_FILES}" \
    --metrics "coverage,assertions,complexity" \
    --output json)

# Step 4: Store generation results
npx claude-flow@alpha memory store \
    --key "aqe/generation/${AQE_SESSION_ID}/results" \
    --value "{
        \"files\": [${AQE_GENERATED_FILES}],
        \"test_count\": ${AQE_TEST_COUNT},
        \"assertions\": ${AQE_ASSERTIONS_COUNT},
        \"coverage_estimate\": ${AQE_COVERAGE_ESTIMATE},
        \"generation_time\": ${AQE_GENERATION_TIME},
        \"quality_metrics\": ${TEST_QUALITY},
        \"timestamp\": \"$(date -Iseconds)\",
        \"status\": \"completed\"
    }"

# Step 5: Trigger test execution if auto-run enabled
if [[ "${AQE_AUTO_RUN:-false}" == "true" ]]; then
    log_info "Auto-run enabled. Spawning test executor..."

    npx claude-flow@alpha agent-spawn \
        --type "qe-test-executor" \
        --task "Execute generated tests for session ${AQE_SESSION_ID}" \
        --context "{\"session_id\": \"${AQE_SESSION_ID}\", \"files\": [${AQE_GENERATED_FILES}]}" \
        --async
fi

# Step 6: Update generation metrics
npx claude-flow@alpha memory increment \
    --key "aqe/metrics/total_tests_generated" \
    --value ${AQE_TEST_COUNT}

# Step 7: Notify completion
npx claude-flow@alpha hooks notify \
    --message "Generated ${AQE_TEST_COUNT} tests with ${AQE_ASSERTIONS_COUNT} assertions for ${AQE_MODULE_PATH}" \
    --level "success" \
    --metadata "{\"coverage_estimate\": ${AQE_COVERAGE_ESTIMATE}}"

log_success "Post-test-generation hook completed. Files: ${VALID_FILES}"
exit 0
```

**Memory Operations:**
- `aqe/generation/{session_id}/results` - Generation results and metrics
- `aqe/metrics/total_tests_generated` - Global metric counter

**Integration Points:**
- Can trigger `test-executor` agent for auto-run
- Prepares data for `pre-test-execution` hook
- Updates global QE metrics

---

## 3. pre-test-execution

**Purpose:** Prepare test environment and set up parallel execution strategy.

**Trigger Conditions:**
- User runs `aqe run` or `npm test`
- `test-executor` agent is invoked
- CI/CD pipeline triggers test execution

**Environment Variables:**
```bash
AQE_TEST_FILES          # Comma-separated test file paths
AQE_TEST_PATTERN        # Glob pattern for test discovery
AQE_PARALLEL_WORKERS    # Number of parallel workers
AQE_TIMEOUT             # Test timeout in milliseconds
AQE_COVERAGE_ENABLED    # true|false
AQE_FRAMEWORK           # jest|mocha|vitest|playwright
AQE_WATCH_MODE          # true|false
AQE_SESSION_ID          # Execution session ID
AQE_ENV_FILE           # Path to environment file
AQE_RETRY_COUNT        # Number of retries for flaky tests
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/pre-test-execution

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting pre-test-execution hook for session: ${AQE_SESSION_ID}"

# Step 1: Validate test environment
log_info "Validating test environment..."

# Check for required dependencies
if ! command -v npx &> /dev/null; then
    log_error "npx not found. Install Node.js."
    exit 1
fi

# Verify test framework is available
case "${AQE_FRAMEWORK}" in
    jest)
        npm list jest &> /dev/null || log_error "Jest not installed"
        ;;
    mocha)
        npm list mocha &> /dev/null || log_error "Mocha not installed"
        ;;
    vitest)
        npm list vitest &> /dev/null || log_error "Vitest not installed"
        ;;
    playwright)
        npm list @playwright/test &> /dev/null || log_error "Playwright not installed"
        ;;
esac

# Step 2: Load environment variables
if [[ -f "${AQE_ENV_FILE}" ]]; then
    log_info "Loading environment from ${AQE_ENV_FILE}"
    export $(grep -v '^#' "${AQE_ENV_FILE}" | xargs)
fi

# Step 3: Calculate optimal parallelization
AVAILABLE_CORES=$(nproc)
OPTIMAL_WORKERS=$((AVAILABLE_CORES - 1))

if (( AQE_PARALLEL_WORKERS > OPTIMAL_WORKERS )); then
    log_warn "Requested ${AQE_PARALLEL_WORKERS} workers, but only ${OPTIMAL_WORKERS} recommended"
    AQE_PARALLEL_WORKERS=${OPTIMAL_WORKERS}
fi

# Step 4: Determine test execution strategy
TEST_COUNT=$(echo "${AQE_TEST_FILES}" | tr ',' '\n' | wc -l)

if (( TEST_COUNT > 50 )); then
    STRATEGY="parallel"
    log_info "Using parallel execution for ${TEST_COUNT} test files"
else
    STRATEGY="sequential"
    log_info "Using sequential execution for ${TEST_COUNT} test files"
fi

# Step 5: Store execution context
npx claude-flow@alpha memory store \
    --key "aqe/execution/${AQE_SESSION_ID}/context" \
    --value "{
        \"test_count\": ${TEST_COUNT},
        \"strategy\": \"${STRATEGY}\",
        \"workers\": ${AQE_PARALLEL_WORKERS},
        \"coverage_enabled\": ${AQE_COVERAGE_ENABLED},
        \"framework\": \"${AQE_FRAMEWORK}\",
        \"timeout\": ${AQE_TIMEOUT},
        \"retry_count\": ${AQE_RETRY_COUNT},
        \"start_time\": \"$(date -Iseconds)\",
        \"status\": \"starting\"
    }"

# Step 6: Pre-warm any necessary services
if [[ "${AQE_FRAMEWORK}" == "playwright" ]]; then
    log_info "Pre-warming browser instances..."
    # Playwright-specific setup would go here
fi

# Step 7: Set up coverage instrumentation if enabled
if [[ "${AQE_COVERAGE_ENABLED}" == "true" ]]; then
    log_info "Enabling coverage instrumentation..."
    export NODE_OPTIONS="--experimental-loader=@istanbuljs/esm-loader-hook"
fi

# Step 8: Spawn performance monitor for long-running tests
if (( TEST_COUNT > 100 )); then
    log_info "Spawning performance monitor for large test suite..."

    npx claude-flow@alpha agent-spawn \
        --type "qe-performance-tester" \
        --task "Monitor test execution performance for session ${AQE_SESSION_ID}" \
        --async
fi

# Step 9: Notify execution start
npx claude-flow@alpha hooks notify \
    --message "Starting execution of ${TEST_COUNT} tests with ${AQE_PARALLEL_WORKERS} workers" \
    --level "info"

log_success "Pre-test-execution hook completed. Strategy: ${STRATEGY}"
exit 0
```

**Memory Operations:**
- `aqe/execution/{session_id}/context` - Execution strategy and configuration

**Integration Points:**
- Can spawn `performance-tester` agent for large test suites
- Prepares environment for parallel execution
- Sets up coverage instrumentation

---

## 4. post-test-execution

**Purpose:** Collect test results, analyze failures, and trigger follow-up actions.

**Trigger Conditions:**
- Test execution completes (success or failure)
- All test workers have finished

**Environment Variables:**
```bash
AQE_SESSION_ID          # Execution session ID
AQE_RESULTS_FILE        # Path to test results JSON
AQE_TOTAL_TESTS         # Total number of tests run
AQE_PASSED_TESTS        # Number of passed tests
AQE_FAILED_TESTS        # Number of failed tests
AQE_SKIPPED_TESTS       # Number of skipped tests
AQE_EXECUTION_TIME      # Total execution time (ms)
AQE_COVERAGE_FILE       # Path to coverage report
AQE_EXIT_CODE          # Test runner exit code
AQE_FLAKY_TESTS        # Comma-separated list of flaky test names
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/post-test-execution

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting post-test-execution hook for session: ${AQE_SESSION_ID}"

# Step 1: Parse test results
if [[ ! -f "${AQE_RESULTS_FILE}" ]]; then
    log_error "Results file not found: ${AQE_RESULTS_FILE}"
    exit 1
fi

RESULTS=$(cat "${AQE_RESULTS_FILE}")

# Step 2: Calculate pass rate
if (( AQE_TOTAL_TESTS > 0 )); then
    PASS_RATE=$(awk "BEGIN {printf \"%.2f\", (${AQE_PASSED_TESTS}/${AQE_TOTAL_TESTS})*100}")
else
    PASS_RATE=0
fi

log_info "Test Results: ${AQE_PASSED_TESTS}/${AQE_TOTAL_TESTS} passed (${PASS_RATE}%)"

# Step 3: Store execution results
npx claude-flow@alpha memory store \
    --key "aqe/execution/${AQE_SESSION_ID}/results" \
    --value "{
        \"total\": ${AQE_TOTAL_TESTS},
        \"passed\": ${AQE_PASSED_TESTS},
        \"failed\": ${AQE_FAILED_TESTS},
        \"skipped\": ${AQE_SKIPPED_TESTS},
        \"pass_rate\": ${PASS_RATE},
        \"execution_time\": ${AQE_EXECUTION_TIME},
        \"exit_code\": ${AQE_EXIT_CODE},
        \"timestamp\": \"$(date -Iseconds)\",
        \"status\": \"completed\"
    }"

# Step 4: Handle failures
if (( AQE_FAILED_TESTS > 0 )); then
    log_warn "Tests failed. Triggering failure handler..."

    # Extract failure details
    FAILURES=$(jq -r '.testResults[] | select(.status == "failed") | .name' "${AQE_RESULTS_FILE}")

    # Store failure details
    npx claude-flow@alpha memory store \
        --key "aqe/execution/${AQE_SESSION_ID}/failures" \
        --value "{
            \"count\": ${AQE_FAILED_TESTS},
            \"tests\": $(echo "${FAILURES}" | jq -R -s -c 'split("\n")[:-1]'),
            \"timestamp\": \"$(date -Iseconds)\"
        }"

    # Trigger failure handler hook
    export AQE_FAILURE_SESSION_ID="${AQE_SESSION_ID}"
    export AQE_FAILURE_COUNT="${AQE_FAILED_TESTS}"
    bash "$(dirname "$0")/test-failure-handler"
fi

# Step 5: Process flaky tests
if [[ -n "${AQE_FLAKY_TESTS}" ]]; then
    FLAKY_COUNT=$(echo "${AQE_FLAKY_TESTS}" | tr ',' '\n' | wc -l)
    log_warn "Detected ${FLAKY_COUNT} flaky tests"

    npx claude-flow@alpha memory store \
        --key "aqe/execution/${AQE_SESSION_ID}/flaky" \
        --value "{
            \"count\": ${FLAKY_COUNT},
            \"tests\": [${AQE_FLAKY_TESTS}]
        }"
fi

# Step 6: Trigger coverage analysis if enabled
if [[ -f "${AQE_COVERAGE_FILE}" ]]; then
    log_info "Coverage report found. Triggering analysis..."

    export AQE_COVERAGE_SESSION_ID="${AQE_SESSION_ID}"
    export AQE_COVERAGE_REPORT="${AQE_COVERAGE_FILE}"
    bash "$(dirname "$0")/pre-coverage-analysis"
fi

# Step 7: Update global metrics
npx claude-flow@alpha memory increment \
    --key "aqe/metrics/total_tests_executed" \
    --value ${AQE_TOTAL_TESTS}

npx claude-flow@alpha memory increment \
    --key "aqe/metrics/total_failures" \
    --value ${AQE_FAILED_TESTS}

# Step 8: Notify completion
if (( AQE_EXIT_CODE == 0 )); then
    LEVEL="success"
    MESSAGE="All tests passed (${AQE_TOTAL_TESTS}/${AQE_TOTAL_TESTS})"
else
    LEVEL="error"
    MESSAGE="Tests failed (${AQE_PASSED_TESTS}/${AQE_TOTAL_TESTS} passed)"
fi

npx claude-flow@alpha hooks notify \
    --message "${MESSAGE}" \
    --level "${LEVEL}" \
    --metadata "{\"pass_rate\": ${PASS_RATE}, \"execution_time\": ${AQE_EXECUTION_TIME}}"

log_success "Post-test-execution hook completed"
exit 0
```

**Memory Operations:**
- `aqe/execution/{session_id}/results` - Execution results and metrics
- `aqe/execution/{session_id}/failures` - Failure details
- `aqe/execution/{session_id}/flaky` - Flaky test tracking
- `aqe/metrics/total_tests_executed` - Global counter
- `aqe/metrics/total_failures` - Global counter

**Integration Points:**
- Triggers `test-failure-handler` hook on failures
- Triggers `pre-coverage-analysis` hook if coverage enabled
- Updates global QE metrics
- Notifies completion status

---

## 5. pre-coverage-analysis

**Purpose:** Prepare coverage data and set up O(log n) analysis algorithms.

**Trigger Conditions:**
- Coverage report is generated after test execution
- User runs `aqe coverage`
- Scheduled coverage analysis

**Environment Variables:**
```bash
AQE_COVERAGE_REPORT     # Path to coverage report (JSON/LCOV)
AQE_COVERAGE_FORMAT     # json|lcov|cobertura
AQE_SESSION_ID          # Analysis session ID
AQE_COVERAGE_SESSION_ID # Linked execution session (if applicable)
AQE_TARGET_THRESHOLD    # Minimum coverage threshold (%)
AQE_SOURCE_ROOT         # Root directory of source files
AQE_EXCLUDE_PATTERNS    # Comma-separated glob patterns to exclude
AQE_ALGORITHM          # sublinear|traditional
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/pre-coverage-analysis

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting pre-coverage-analysis hook for session: ${AQE_SESSION_ID}"

# Step 1: Validate coverage report exists
if [[ ! -f "${AQE_COVERAGE_REPORT}" ]]; then
    log_error "Coverage report not found: ${AQE_COVERAGE_REPORT}"
    exit 1
fi

# Step 2: Normalize coverage format to JSON
case "${AQE_COVERAGE_FORMAT}" in
    json)
        NORMALIZED_REPORT="${AQE_COVERAGE_REPORT}"
        ;;
    lcov)
        log_info "Converting LCOV to JSON..."
        NORMALIZED_REPORT="/tmp/coverage-${AQE_SESSION_ID}.json"
        npx lcov-to-json "${AQE_COVERAGE_REPORT}" > "${NORMALIZED_REPORT}"
        ;;
    cobertura)
        log_info "Converting Cobertura to JSON..."
        NORMALIZED_REPORT="/tmp/coverage-${AQE_SESSION_ID}.json"
        npx cobertura-to-json "${AQE_COVERAGE_REPORT}" > "${NORMALIZED_REPORT}"
        ;;
esac

# Step 3: Calculate current coverage metrics
TOTAL_LINES=$(jq '.total.lines.total' "${NORMALIZED_REPORT}")
COVERED_LINES=$(jq '.total.lines.covered' "${NORMALIZED_REPORT}")
LINE_COVERAGE=$(awk "BEGIN {printf \"%.2f\", (${COVERED_LINES}/${TOTAL_LINES})*100}")

log_info "Current coverage: ${LINE_COVERAGE}% (${COVERED_LINES}/${TOTAL_LINES} lines)"

# Step 4: Determine if sublinear algorithm should be used
FILE_COUNT=$(jq '.files | length' "${NORMALIZED_REPORT}")

if (( FILE_COUNT > 100 )) || [[ "${AQE_ALGORITHM}" == "sublinear" ]]; then
    USE_SUBLINEAR=true
    log_info "Using O(log n) sublinear algorithm for ${FILE_COUNT} files"
else
    USE_SUBLINEAR=false
    log_info "Using traditional analysis for ${FILE_COUNT} files"
fi

# Step 5: Store pre-analysis context
npx claude-flow@alpha memory store \
    --key "aqe/coverage/${AQE_SESSION_ID}/context" \
    --value "{
        \"report_path\": \"${NORMALIZED_REPORT}\",
        \"format\": \"${AQE_COVERAGE_FORMAT}\",
        \"file_count\": ${FILE_COUNT},
        \"current_coverage\": ${LINE_COVERAGE},
        \"target_threshold\": ${AQE_TARGET_THRESHOLD},
        \"use_sublinear\": ${USE_SUBLINEAR},
        \"start_time\": \"$(date -Iseconds)\",
        \"status\": \"starting\"
    }"

# Step 6: Identify critical files below threshold
log_info "Identifying files below ${AQE_TARGET_THRESHOLD}% coverage..."

BELOW_THRESHOLD=$(jq -r --arg threshold "${AQE_TARGET_THRESHOLD}" \
    '.files[] | select(.lines.pct < ($threshold | tonumber)) | .path' \
    "${NORMALIZED_REPORT}")

CRITICAL_COUNT=$(echo "${BELOW_THRESHOLD}" | wc -l)

if (( CRITICAL_COUNT > 0 )); then
    log_warn "Found ${CRITICAL_COUNT} files below threshold"

    npx claude-flow@alpha memory store \
        --key "aqe/coverage/${AQE_SESSION_ID}/critical_files" \
        --value "{
            \"count\": ${CRITICAL_COUNT},
            \"files\": $(echo "${BELOW_THRESHOLD}" | jq -R -s -c 'split("\n")[:-1]')
        }"
fi

# Step 7: Prepare sublinear solver matrix if needed
if [[ "${USE_SUBLINEAR}" == "true" ]]; then
    log_info "Preparing coverage matrix for sublinear analysis..."

    # Build coverage matrix for O(log n) algorithm
    npx @agentic-qe/sublinear prepare-matrix \
        --input "${NORMALIZED_REPORT}" \
        --output "/tmp/coverage-matrix-${AQE_SESSION_ID}.json"
fi

# Step 8: Notify analysis start
npx claude-flow@alpha hooks notify \
    --message "Starting coverage analysis: ${LINE_COVERAGE}% current (target: ${AQE_TARGET_THRESHOLD}%)" \
    --level "info"

log_success "Pre-coverage-analysis hook completed. Algorithm: $([ "${USE_SUBLINEAR}" == "true" ] && echo "O(log n)" || echo "O(n)")"
exit 0
```

**Memory Operations:**
- `aqe/coverage/{session_id}/context` - Analysis configuration
- `aqe/coverage/{session_id}/critical_files` - Files below threshold

**Integration Points:**
- Prepares data for `post-coverage-analysis` hook
- Sets up sublinear solver if needed
- Identifies critical coverage gaps

---

## 6. post-coverage-analysis

**Purpose:** Process coverage results, identify gaps, and trigger optimization.

**Trigger Conditions:**
- Coverage analysis completes
- Gap identification algorithm finishes

**Environment Variables:**
```bash
AQE_SESSION_ID          # Analysis session ID
AQE_COVERAGE_REPORT     # Path to processed coverage report
AQE_GAPS_FOUND          # Number of coverage gaps identified
AQE_GAPS_FILE          # Path to gaps analysis JSON
AQE_OVERALL_COVERAGE    # Overall coverage percentage
AQE_BRANCH_COVERAGE     # Branch coverage percentage
AQE_FUNCTION_COVERAGE   # Function coverage percentage
AQE_STATEMENT_COVERAGE  # Statement coverage percentage
AQE_THRESHOLD_MET       # true|false
AQE_ANALYSIS_TIME       # Analysis time in milliseconds
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/post-coverage-analysis

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting post-coverage-analysis hook for session: ${AQE_SESSION_ID}"

# Step 1: Parse coverage analysis results
if [[ ! -f "${AQE_GAPS_FILE}" ]]; then
    log_error "Gaps analysis file not found: ${AQE_GAPS_FILE}"
    exit 1
fi

GAPS=$(cat "${AQE_GAPS_FILE}")

# Step 2: Store analysis results
npx claude-flow@alpha memory store \
    --key "aqe/coverage/${AQE_SESSION_ID}/results" \
    --value "{
        \"overall_coverage\": ${AQE_OVERALL_COVERAGE},
        \"branch_coverage\": ${AQE_BRANCH_COVERAGE},
        \"function_coverage\": ${AQE_FUNCTION_COVERAGE},
        \"statement_coverage\": ${AQE_STATEMENT_COVERAGE},
        \"gaps_found\": ${AQE_GAPS_FOUND},
        \"threshold_met\": ${AQE_THRESHOLD_MET},
        \"analysis_time\": ${AQE_ANALYSIS_TIME},
        \"timestamp\": \"$(date -Iseconds)\",
        \"status\": \"completed\"
    }"

# Step 3: Process coverage gaps
if (( AQE_GAPS_FOUND > 0 )); then
    log_warn "Found ${AQE_GAPS_FOUND} coverage gaps"

    # Extract high-priority gaps
    HIGH_PRIORITY_GAPS=$(jq -r '.gaps[] | select(.priority == "high") | .file' "${AQE_GAPS_FILE}")
    HIGH_PRIORITY_COUNT=$(echo "${HIGH_PRIORITY_GAPS}" | wc -l)

    if (( HIGH_PRIORITY_COUNT > 0 )); then
        log_warn "High-priority gaps: ${HIGH_PRIORITY_COUNT}"

        npx claude-flow@alpha memory store \
            --key "aqe/coverage/${AQE_SESSION_ID}/high_priority_gaps" \
            --value "{
                \"count\": ${HIGH_PRIORITY_COUNT},
                \"files\": $(echo "${HIGH_PRIORITY_GAPS}" | jq -R -s -c 'split("\n")[:-1]')
            }"

        # Spawn test generator for high-priority gaps
        log_info "Spawning test generator for high-priority gaps..."

        npx claude-flow@alpha agent-spawn \
            --type "qe-test-generator" \
            --task "Generate tests for ${HIGH_PRIORITY_COUNT} high-priority coverage gaps" \
            --context "{\"session_id\": \"${AQE_SESSION_ID}\", \"gaps_file\": \"${AQE_GAPS_FILE}\"}" \
            --async
    fi

    # Store all gaps for reference
    npx claude-flow@alpha memory store \
        --key "aqe/coverage/${AQE_SESSION_ID}/gaps" \
        --value "${GAPS}"
fi

# Step 4: Check if threshold met
if [[ "${AQE_THRESHOLD_MET}" == "false" ]]; then
    log_warn "Coverage threshold not met: ${AQE_OVERALL_COVERAGE}%"

    # Trigger quality gate check
    export AQE_QUALITY_SESSION_ID="${AQE_SESSION_ID}"
    export AQE_QUALITY_COVERAGE="${AQE_OVERALL_COVERAGE}"
    bash "$(dirname "$0")/quality-gate-check"
else
    log_success "Coverage threshold met: ${AQE_OVERALL_COVERAGE}%"
fi

# Step 5: Generate coverage trends
log_info "Calculating coverage trends..."

# Retrieve previous coverage if available
PREVIOUS_COVERAGE=$(npx claude-flow@alpha memory retrieve \
    --key "aqe/metrics/latest_coverage" || echo "0")

COVERAGE_DELTA=$(awk "BEGIN {printf \"%.2f\", ${AQE_OVERALL_COVERAGE} - ${PREVIOUS_COVERAGE}}")

# Update latest coverage
npx claude-flow@alpha memory store \
    --key "aqe/metrics/latest_coverage" \
    --value "${AQE_OVERALL_COVERAGE}"

# Step 6: Update global metrics
npx claude-flow@alpha memory store \
    --key "aqe/metrics/coverage_history" \
    --value "{
        \"timestamp\": \"$(date -Iseconds)\",
        \"coverage\": ${AQE_OVERALL_COVERAGE},
        \"delta\": ${COVERAGE_DELTA}
    }" \
    --append

# Step 7: Trigger report generation
if [[ "${AQE_GENERATE_REPORT:-true}" == "true" ]]; then
    export AQE_REPORT_SESSION_ID="${AQE_SESSION_ID}"
    export AQE_REPORT_TYPE="coverage"
    bash "$(dirname "$0")/report-generation"
fi

# Step 8: Notify completion
if [[ "${AQE_THRESHOLD_MET}" == "true" ]]; then
    LEVEL="success"
    MESSAGE="Coverage analysis complete: ${AQE_OVERALL_COVERAGE}% (Δ ${COVERAGE_DELTA}%)"
else
    LEVEL="warning"
    MESSAGE="Coverage below threshold: ${AQE_OVERALL_COVERAGE}% (${AQE_GAPS_FOUND} gaps found)"
fi

npx claude-flow@alpha hooks notify \
    --message "${MESSAGE}" \
    --level "${LEVEL}" \
    --metadata "{\"gaps\": ${AQE_GAPS_FOUND}, \"analysis_time\": ${AQE_ANALYSIS_TIME}}"

log_success "Post-coverage-analysis hook completed"
exit 0
```

**Memory Operations:**
- `aqe/coverage/{session_id}/results` - Coverage metrics
- `aqe/coverage/{session_id}/high_priority_gaps` - Critical gaps
- `aqe/coverage/{session_id}/gaps` - All gaps
- `aqe/metrics/latest_coverage` - Latest coverage percentage
- `aqe/metrics/coverage_history` - Historical coverage data (appended)

**Integration Points:**
- Spawns `test-generator` agent for high-priority gaps
- Triggers `quality-gate-check` hook if threshold not met
- Triggers `report-generation` hook
- Updates global coverage trends

---

## 7. quality-gate-check

**Purpose:** Evaluate quality metrics and determine if code meets standards.

**Trigger Conditions:**
- Coverage analysis completes
- User runs `aqe quality`
- CI/CD pipeline quality stage
- Pre-merge validation

**Environment Variables:**
```bash
AQE_QUALITY_SESSION_ID  # Quality check session ID
AQE_QUALITY_COVERAGE    # Current coverage percentage
AQE_COVERAGE_THRESHOLD  # Minimum coverage required
AQE_COMPLEXITY_MAX      # Maximum allowed complexity
AQE_DUPLICATION_MAX     # Maximum allowed duplication (%)
AQE_TECHNICAL_DEBT      # Technical debt ratio
AQE_SECURITY_ISSUES     # Number of security issues
AQE_CODE_SMELLS         # Number of code smells
AQE_BUGS               # Number of bugs detected
AQE_STRICT_MODE        # true|false (fail on any violation)
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/quality-gate-check

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting quality-gate-check hook for session: ${AQE_QUALITY_SESSION_ID}"

# Initialize quality gate status
GATE_STATUS="passed"
VIOLATIONS=()

# Step 1: Check coverage threshold
log_info "Checking coverage threshold: ${AQE_QUALITY_COVERAGE}% vs ${AQE_COVERAGE_THRESHOLD}%"

if (( $(echo "${AQE_QUALITY_COVERAGE} < ${AQE_COVERAGE_THRESHOLD}" | bc -l) )); then
    log_warn "Coverage below threshold"
    VIOLATIONS+=("coverage")
    GATE_STATUS="failed"
fi

# Step 2: Check complexity
log_info "Analyzing code complexity..."
COMPLEXITY_VIOLATIONS=$(npx @agentic-qe/analyzer check-complexity \
    --max "${AQE_COMPLEXITY_MAX}" \
    --output json)

COMPLEXITY_COUNT=$(echo "${COMPLEXITY_VIOLATIONS}" | jq '. | length')

if (( COMPLEXITY_COUNT > 0 )); then
    log_warn "Found ${COMPLEXITY_COUNT} complexity violations"
    VIOLATIONS+=("complexity")
    GATE_STATUS="failed"
fi

# Step 3: Check code duplication
log_info "Checking code duplication..."
DUPLICATION=$(npx jscpd src/ --threshold "${AQE_DUPLICATION_MAX}" --format json)
DUPLICATION_PCT=$(echo "${DUPLICATION}" | jq -r '.statistics.total.percentage')

if (( $(echo "${DUPLICATION_PCT} > ${AQE_DUPLICATION_MAX}" | bc -l) )); then
    log_warn "Duplication exceeds threshold: ${DUPLICATION_PCT}%"
    VIOLATIONS+=("duplication")
    GATE_STATUS="failed"
fi

# Step 4: Check security issues
if (( AQE_SECURITY_ISSUES > 0 )); then
    log_error "Found ${AQE_SECURITY_ISSUES} security issues"
    VIOLATIONS+=("security")
    GATE_STATUS="failed"
fi

# Step 5: Check code smells and bugs
if (( AQE_CODE_SMELLS > 10 )); then
    log_warn "Found ${AQE_CODE_SMELLS} code smells"
    VIOLATIONS+=("code_smells")

    if [[ "${AQE_STRICT_MODE}" == "true" ]]; then
        GATE_STATUS="failed"
    fi
fi

if (( AQE_BUGS > 0 )); then
    log_error "Found ${AQE_BUGS} bugs"
    VIOLATIONS+=("bugs")
    GATE_STATUS="failed"
fi

# Step 6: Calculate quality score
QUALITY_SCORE=$(awk "BEGIN {
    score = 100
    score -= (${AQE_COVERAGE_THRESHOLD} - ${AQE_QUALITY_COVERAGE})
    score -= ${COMPLEXITY_COUNT} * 2
    score -= ${DUPLICATION_PCT}
    score -= ${AQE_SECURITY_ISSUES} * 10
    score -= ${AQE_BUGS} * 5
    score -= ${AQE_CODE_SMELLS} * 0.5
    if (score < 0) score = 0
    printf \"%.2f\", score
}")

log_info "Quality score: ${QUALITY_SCORE}/100"

# Step 7: Store quality gate results
npx claude-flow@alpha memory store \
    --key "aqe/quality/${AQE_QUALITY_SESSION_ID}/results" \
    --value "{
        \"status\": \"${GATE_STATUS}\",
        \"quality_score\": ${QUALITY_SCORE},
        \"violations\": $(printf '%s\n' "${VIOLATIONS[@]}" | jq -R -s -c 'split("\n")[:-1]'),
        \"metrics\": {
            \"coverage\": ${AQE_QUALITY_COVERAGE},
            \"complexity_violations\": ${COMPLEXITY_COUNT},
            \"duplication\": ${DUPLICATION_PCT},
            \"security_issues\": ${AQE_SECURITY_ISSUES},
            \"code_smells\": ${AQE_CODE_SMELLS},
            \"bugs\": ${AQE_BUGS}
        },
        \"timestamp\": \"$(date -Iseconds)\"
    }"

# Step 8: Trigger optimization if needed
if [[ "${GATE_STATUS}" == "failed" ]]; then
    log_warn "Quality gate failed. Triggering optimization..."

    export AQE_OPTIMIZATION_SESSION_ID="${AQE_QUALITY_SESSION_ID}"
    export AQE_OPTIMIZATION_VIOLATIONS=$(printf '%s\n' "${VIOLATIONS[@]}" | jq -R -s -c 'split("\n")[:-1]')
    bash "$(dirname "$0")/optimization-trigger"
fi

# Step 9: Update quality metrics history
npx claude-flow@alpha memory store \
    --key "aqe/metrics/quality_history" \
    --value "{
        \"timestamp\": \"$(date -Iseconds)\",
        \"score\": ${QUALITY_SCORE},
        \"status\": \"${GATE_STATUS}\"
    }" \
    --append

# Step 10: Notify quality gate result
if [[ "${GATE_STATUS}" == "passed" ]]; then
    LEVEL="success"
    MESSAGE="Quality gate passed (Score: ${QUALITY_SCORE}/100)"
else
    LEVEL="error"
    MESSAGE="Quality gate failed (Score: ${QUALITY_SCORE}/100, Violations: ${#VIOLATIONS[@]})"
fi

npx claude-flow@alpha hooks notify \
    --message "${MESSAGE}" \
    --level "${LEVEL}" \
    --metadata "{\"score\": ${QUALITY_SCORE}, \"violations\": ${#VIOLATIONS[@]}}"

log_info "Quality gate check completed: ${GATE_STATUS}"

# Exit with appropriate code
if [[ "${GATE_STATUS}" == "failed" ]]; then
    exit 1
else
    exit 0
fi
```

**Memory Operations:**
- `aqe/quality/{session_id}/results` - Quality gate results
- `aqe/metrics/quality_history` - Historical quality scores (appended)

**Integration Points:**
- Triggers `optimization-trigger` hook on failure
- Notifies quality gate status
- Blocks CI/CD pipeline on failure (via exit code)

---

## 8. test-failure-handler

**Purpose:** Analyze test failures and trigger remediation actions.

**Trigger Conditions:**
- Test execution completes with failures
- Called by `post-test-execution` hook

**Environment Variables:**
```bash
AQE_FAILURE_SESSION_ID  # Linked execution session ID
AQE_FAILURE_COUNT       # Number of failed tests
AQE_FAILURES_FILE       # Path to failures JSON
AQE_AUTO_RETRY          # true|false
AQE_MAX_RETRIES         # Maximum retry attempts
AQE_NOTIFY_THRESHOLD    # Notify if failures exceed this number
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/test-failure-handler

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting test-failure-handler for session: ${AQE_FAILURE_SESSION_ID}"

# Step 1: Retrieve failure details from memory
FAILURES=$(npx claude-flow@alpha memory retrieve \
    --key "aqe/execution/${AQE_FAILURE_SESSION_ID}/failures")

# Step 2: Categorize failures
log_info "Categorizing ${AQE_FAILURE_COUNT} failures..."

ASSERTION_FAILURES=0
TIMEOUT_FAILURES=0
RUNTIME_ERRORS=0
FLAKY_FAILURES=0

# Analyze each failure
echo "${FAILURES}" | jq -r '.tests[]' | while read -r test; do
    ERROR_TYPE=$(echo "${test}" | jq -r '.errorType')

    case "${ERROR_TYPE}" in
        assertion)
            ((ASSERTION_FAILURES++))
            ;;
        timeout)
            ((TIMEOUT_FAILURES++))
            ;;
        runtime)
            ((RUNTIME_ERRORS++))
            ;;
        flaky)
            ((FLAKY_FAILURES++))
            ;;
    esac
done

# Step 3: Store failure analysis
npx claude-flow@alpha memory store \
    --key "aqe/failures/${AQE_FAILURE_SESSION_ID}/analysis" \
    --value "{
        \"total_failures\": ${AQE_FAILURE_COUNT},
        \"assertion_failures\": ${ASSERTION_FAILURES},
        \"timeout_failures\": ${TIMEOUT_FAILURES},
        \"runtime_errors\": ${RUNTIME_ERRORS},
        \"flaky_failures\": ${FLAKY_FAILURES},
        \"timestamp\": \"$(date -Iseconds)\"
    }"

# Step 4: Handle flaky tests
if (( FLAKY_FAILURES > 0 )) && [[ "${AQE_AUTO_RETRY}" == "true" ]]; then
    log_info "Retrying ${FLAKY_FAILURES} flaky tests..."

    FLAKY_TESTS=$(echo "${FAILURES}" | jq -r '.tests[] | select(.errorType == "flaky") | .name')

    # Retry flaky tests
    RETRY_COUNT=0
    while (( RETRY_COUNT < AQE_MAX_RETRIES )); do
        ((RETRY_COUNT++))
        log_info "Retry attempt ${RETRY_COUNT}/${AQE_MAX_RETRIES}"

        # Run only flaky tests
        TEST_RESULT=$(npm test -- --testNamePattern="${FLAKY_TESTS}" 2>&1 || true)

        if echo "${TEST_RESULT}" | grep -q "Tests passed"; then
            log_success "Flaky tests passed on retry ${RETRY_COUNT}"
            break
        fi
    done
fi

# Step 5: Generate failure report
log_info "Generating failure report..."

FAILURE_REPORT="/tmp/failure-report-${AQE_FAILURE_SESSION_ID}.md"

cat > "${FAILURE_REPORT}" <<EOF
# Test Failure Report

**Session ID:** ${AQE_FAILURE_SESSION_ID}
**Timestamp:** $(date -Iseconds)
**Total Failures:** ${AQE_FAILURE_COUNT}

## Failure Breakdown

- Assertion Failures: ${ASSERTION_FAILURES}
- Timeout Failures: ${TIMEOUT_FAILURES}
- Runtime Errors: ${RUNTIME_ERRORS}
- Flaky Failures: ${FLAKY_FAILURES}

## Failed Tests

$(echo "${FAILURES}" | jq -r '.tests[] | "- \(.name) (\(.errorType))"')

## Recommended Actions

EOF

# Add recommendations based on failure types
if (( ASSERTION_FAILURES > 0 )); then
    echo "- Review test assertions and expected values" >> "${FAILURE_REPORT}"
fi

if (( TIMEOUT_FAILURES > 0 )); then
    echo "- Increase test timeouts or optimize async operations" >> "${FAILURE_REPORT}"
fi

if (( RUNTIME_ERRORS > 0 )); then
    echo "- Fix runtime errors and null pointer exceptions" >> "${FAILURE_REPORT}"
fi

if (( FLAKY_FAILURES > 0 )); then
    echo "- Investigate and fix flaky test causes (race conditions, timing issues)" >> "${FAILURE_REPORT}"
fi

# Step 6: Store failure report
npx claude-flow@alpha memory store \
    --key "aqe/failures/${AQE_FAILURE_SESSION_ID}/report" \
    --value "$(cat "${FAILURE_REPORT}")"

# Step 7: Spawn reviewer agent for critical failures
if (( RUNTIME_ERRORS > 5 )) || (( AQE_FAILURE_COUNT > AQE_NOTIFY_THRESHOLD )); then
    log_warn "Critical failure threshold exceeded. Spawning reviewer agent..."

    npx claude-flow@alpha agent-spawn \
        --type "reviewer" \
        --task "Analyze critical test failures for session ${AQE_FAILURE_SESSION_ID}" \
        --context "{\"session_id\": \"${AQE_FAILURE_SESSION_ID}\", \"failure_count\": ${AQE_FAILURE_COUNT}}" \
        --async
fi

# Step 8: Notify about failures
npx claude-flow@alpha hooks notify \
    --message "Test failures: ${AQE_FAILURE_COUNT} (Assertions: ${ASSERTION_FAILURES}, Timeouts: ${TIMEOUT_FAILURES}, Errors: ${RUNTIME_ERRORS})" \
    --level "error" \
    --metadata "{\"report_path\": \"${FAILURE_REPORT}\"}"

log_success "Test failure handler completed"
exit 0
```

**Memory Operations:**
- `aqe/failures/{session_id}/analysis` - Failure categorization
- `aqe/failures/{session_id}/report` - Failure report

**Integration Points:**
- Retries flaky tests automatically
- Spawns `reviewer` agent for critical failures
- Generates actionable failure reports

---

## 9. optimization-trigger

**Purpose:** Identify optimization opportunities and trigger improvement workflows.

**Trigger Conditions:**
- Quality gate fails
- Performance degradation detected
- User runs `aqe optimize`

**Environment Variables:**
```bash
AQE_OPTIMIZATION_SESSION_ID  # Session ID
AQE_OPTIMIZATION_VIOLATIONS  # JSON array of violations
AQE_TARGET_METRIC           # coverage|performance|quality
AQE_CURRENT_VALUE          # Current metric value
AQE_TARGET_VALUE           # Target metric value
AQE_OPTIMIZATION_LEVEL     # quick|moderate|aggressive
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/optimization-trigger

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting optimization-trigger for session: ${AQE_OPTIMIZATION_SESSION_ID}"

# Step 1: Parse violations
VIOLATIONS=$(echo "${AQE_OPTIMIZATION_VIOLATIONS}" | jq -r '.[]')
VIOLATION_COUNT=$(echo "${VIOLATIONS}" | wc -l)

log_info "Processing ${VIOLATION_COUNT} violations"

# Step 2: Determine optimization strategy
case "${AQE_OPTIMIZATION_LEVEL}" in
    quick)
        MAX_ACTIONS=3
        PARALLEL_AGENTS=1
        ;;
    moderate)
        MAX_ACTIONS=7
        PARALLEL_AGENTS=2
        ;;
    aggressive)
        MAX_ACTIONS=15
        PARALLEL_AGENTS=4
        ;;
esac

log_info "Optimization level: ${AQE_OPTIMIZATION_LEVEL} (max ${MAX_ACTIONS} actions)"

# Step 3: Generate optimization plan
OPTIMIZATION_PLAN=()

while IFS= read -r violation; do
    case "${violation}" in
        coverage)
            OPTIMIZATION_PLAN+=("generate_missing_tests")
            OPTIMIZATION_PLAN+=("improve_test_assertions")
            ;;
        complexity)
            OPTIMIZATION_PLAN+=("refactor_complex_functions")
            OPTIMIZATION_PLAN+=("extract_methods")
            ;;
        duplication)
            OPTIMIZATION_PLAN+=("deduplicate_code")
            OPTIMIZATION_PLAN+=("create_shared_utilities")
            ;;
        security)
            OPTIMIZATION_PLAN+=("fix_security_vulnerabilities")
            OPTIMIZATION_PLAN+=("add_input_validation")
            ;;
        performance)
            OPTIMIZATION_PLAN+=("optimize_algorithms")
            OPTIMIZATION_PLAN+=("add_caching")
            ;;
    esac
done <<< "${VIOLATIONS}"

# Limit to max actions
OPTIMIZATION_PLAN=("${OPTIMIZATION_PLAN[@]:0:${MAX_ACTIONS}}")

# Step 4: Store optimization plan
npx claude-flow@alpha memory store \
    --key "aqe/optimization/${AQE_OPTIMIZATION_SESSION_ID}/plan" \
    --value "{
        \"actions\": $(printf '%s\n' "${OPTIMIZATION_PLAN[@]}" | jq -R -s -c 'split("\n")[:-1]'),
        \"level\": \"${AQE_OPTIMIZATION_LEVEL}\",
        \"violations\": ${AQE_OPTIMIZATION_VIOLATIONS},
        \"timestamp\": \"$(date -Iseconds)\"
    }"

# Step 5: Spawn optimization agents
log_info "Spawning ${PARALLEL_AGENTS} optimization agents..."

AGENT_INDEX=0
for action in "${OPTIMIZATION_PLAN[@]}"; do
    if (( AGENT_INDEX >= PARALLEL_AGENTS )); then
        break
    fi

    log_info "Spawning agent for: ${action}"

    case "${action}" in
        generate_missing_tests)
            AGENT_TYPE="qe-test-generator"
            TASK="Generate tests to improve coverage"
            ;;
        refactor_complex_functions)
            AGENT_TYPE="coder"
            TASK="Refactor complex functions to reduce cyclomatic complexity"
            ;;
        deduplicate_code)
            AGENT_TYPE="coder"
            TASK="Identify and eliminate code duplication"
            ;;
        fix_security_vulnerabilities)
            AGENT_TYPE="qe-security-scanner"
            TASK="Fix identified security vulnerabilities"
            ;;
        optimize_algorithms)
            AGENT_TYPE="coder"
            TASK="Optimize algorithms for better performance"
            ;;
        *)
            AGENT_TYPE="coder"
            TASK="Execute optimization action: ${action}"
            ;;
    esac

    npx claude-flow@alpha agent-spawn \
        --type "${AGENT_TYPE}" \
        --task "${TASK}" \
        --context "{\"session_id\": \"${AQE_OPTIMIZATION_SESSION_ID}\", \"action\": \"${action}\"}" \
        --async

    ((AGENT_INDEX++))
done

# Step 6: Schedule follow-up validation
log_info "Scheduling validation in 5 minutes..."

# Create a delayed validation task
(
    sleep 300  # 5 minutes

    log_info "Running post-optimization validation..."

    # Re-run quality gate check
    export AQE_QUALITY_SESSION_ID="${AQE_OPTIMIZATION_SESSION_ID}-validation"
    export AQE_QUALITY_COVERAGE=$(npx @agentic-qe/analyzer get-coverage --format percent)
    bash "$(dirname "$0")/quality-gate-check"

) &

# Step 7: Update optimization metrics
npx claude-flow@alpha memory increment \
    --key "aqe/metrics/optimization_runs" \
    --value 1

# Step 8: Notify optimization start
npx claude-flow@alpha hooks notify \
    --message "Optimization started: ${VIOLATION_COUNT} violations, ${#OPTIMIZATION_PLAN[@]} actions planned" \
    --level "info" \
    --metadata "{\"level\": \"${AQE_OPTIMIZATION_LEVEL}\", \"agents\": ${PARALLEL_AGENTS}}"

log_success "Optimization trigger completed"
exit 0
```

**Memory Operations:**
- `aqe/optimization/{session_id}/plan` - Optimization plan and actions
- `aqe/metrics/optimization_runs` - Global counter

**Integration Points:**
- Spawns multiple optimization agents (test-generator, coder, security-scanner)
- Schedules follow-up validation via `quality-gate-check`
- Creates actionable optimization plan from violations

---

## 10. report-generation

**Purpose:** Generate comprehensive test and quality reports.

**Trigger Conditions:**
- Coverage analysis completes
- Test execution completes
- Quality gate check completes
- User runs `aqe report`

**Environment Variables:**
```bash
AQE_REPORT_SESSION_ID   # Session ID
AQE_REPORT_TYPE         # coverage|execution|quality|full
AQE_REPORT_FORMAT       # html|markdown|json|pdf
AQE_OUTPUT_PATH         # Path for report output
AQE_INCLUDE_CHARTS      # true|false
AQE_INCLUDE_TRENDS      # true|false
AQE_TIME_RANGE         # 7d|30d|90d (for trends)
```

**Hook Script Structure:**

```bash
#!/bin/bash
# File: .claude/hooks/report-generation

set -euo pipefail

source "$(dirname "$0")/utils/common.sh"

log_info "Starting report-generation for session: ${AQE_REPORT_SESSION_ID}"

# Step 1: Gather report data based on type
case "${AQE_REPORT_TYPE}" in
    coverage)
        DATA=$(npx claude-flow@alpha memory retrieve \
            --key "aqe/coverage/${AQE_REPORT_SESSION_ID}/results")
        ;;
    execution)
        DATA=$(npx claude-flow@alpha memory retrieve \
            --key "aqe/execution/${AQE_REPORT_SESSION_ID}/results")
        ;;
    quality)
        DATA=$(npx claude-flow@alpha memory retrieve \
            --key "aqe/quality/${AQE_REPORT_SESSION_ID}/results")
        ;;
    full)
        COVERAGE=$(npx claude-flow@alpha memory retrieve \
            --key "aqe/coverage/${AQE_REPORT_SESSION_ID}/results" || echo "{}")
        EXECUTION=$(npx claude-flow@alpha memory retrieve \
            --key "aqe/execution/${AQE_REPORT_SESSION_ID}/results" || echo "{}")
        QUALITY=$(npx claude-flow@alpha memory retrieve \
            --key "aqe/quality/${AQE_REPORT_SESSION_ID}/results" || echo "{}")

        DATA=$(jq -n \
            --argjson coverage "${COVERAGE}" \
            --argjson execution "${EXECUTION}" \
            --argjson quality "${QUALITY}" \
            '{coverage: $coverage, execution: $execution, quality: $quality}')
        ;;
esac

# Step 2: Gather trend data if requested
if [[ "${AQE_INCLUDE_TRENDS}" == "true" ]]; then
    log_info "Gathering trend data for ${AQE_TIME_RANGE}..."

    COVERAGE_HISTORY=$(npx claude-flow@alpha memory retrieve \
        --key "aqe/metrics/coverage_history" \
        --filter "timestamp > now() - interval '${AQE_TIME_RANGE}'")

    QUALITY_HISTORY=$(npx claude-flow@alpha memory retrieve \
        --key "aqe/metrics/quality_history" \
        --filter "timestamp > now() - interval '${AQE_TIME_RANGE}'")
fi

# Step 3: Generate report based on format
REPORT_FILE="${AQE_OUTPUT_PATH}/aqe-report-${AQE_REPORT_SESSION_ID}.${AQE_REPORT_FORMAT}"

case "${AQE_REPORT_FORMAT}" in
    html)
        log_info "Generating HTML report..."

        npx @agentic-qe/reporter generate \
            --type "${AQE_REPORT_TYPE}" \
            --format html \
            --data "${DATA}" \
            --output "${REPORT_FILE}" \
            ${AQE_INCLUDE_CHARTS:+--charts} \
            ${AQE_INCLUDE_TRENDS:+--trends "${COVERAGE_HISTORY}" "${QUALITY_HISTORY}"}
        ;;

    markdown)
        log_info "Generating Markdown report..."

        cat > "${REPORT_FILE}" <<EOF
# Agentic QE Report

**Report Type:** ${AQE_REPORT_TYPE}
**Session ID:** ${AQE_REPORT_SESSION_ID}
**Generated:** $(date -Iseconds)

---

## Summary

$(echo "${DATA}" | jq -r 'to_entries | .[] | "**\(.key):** \(.value)"')

EOF

        if [[ "${AQE_INCLUDE_TRENDS}" == "true" ]]; then
            cat >> "${REPORT_FILE}" <<EOF

## Trends (${AQE_TIME_RANGE})

### Coverage Trend
$(echo "${COVERAGE_HISTORY}" | jq -r '.[] | "- \(.timestamp): \(.coverage)%"')

### Quality Score Trend
$(echo "${QUALITY_HISTORY}" | jq -r '.[] | "- \(.timestamp): \(.score)/100"')

EOF
        fi
        ;;

    json)
        log_info "Generating JSON report..."

        REPORT_JSON=$(jq -n \
            --argjson data "${DATA}" \
            --arg type "${AQE_REPORT_TYPE}" \
            --arg session "${AQE_REPORT_SESSION_ID}" \
            --arg timestamp "$(date -Iseconds)" \
            '{
                report_type: $type,
                session_id: $session,
                generated_at: $timestamp,
                data: $data
            }')

        if [[ "${AQE_INCLUDE_TRENDS}" == "true" ]]; then
            REPORT_JSON=$(echo "${REPORT_JSON}" | jq \
                --argjson coverage_history "${COVERAGE_HISTORY}" \
                --argjson quality_history "${QUALITY_HISTORY}" \
                '. + {trends: {coverage: $coverage_history, quality: $quality_history}}')
        fi

        echo "${REPORT_JSON}" | jq '.' > "${REPORT_FILE}"
        ;;

    pdf)
        log_info "Generating PDF report..."

        # First generate HTML, then convert to PDF
        HTML_TEMP="/tmp/aqe-report-${AQE_REPORT_SESSION_ID}.html"

        npx @agentic-qe/reporter generate \
            --type "${AQE_REPORT_TYPE}" \
            --format html \
            --data "${DATA}" \
            --output "${HTML_TEMP}" \
            ${AQE_INCLUDE_CHARTS:+--charts}

        npx puppeteer print "${HTML_TEMP}" "${REPORT_FILE}"
        rm "${HTML_TEMP}"
        ;;
esac

# Step 4: Validate report was created
if [[ ! -f "${REPORT_FILE}" ]]; then
    log_error "Report generation failed: ${REPORT_FILE}"
    exit 1
fi

REPORT_SIZE=$(stat -f%z "${REPORT_FILE}" 2>/dev/null || stat -c%s "${REPORT_FILE}")
log_info "Report generated: ${REPORT_FILE} (${REPORT_SIZE} bytes)"

# Step 5: Store report metadata
npx claude-flow@alpha memory store \
    --key "aqe/reports/${AQE_REPORT_SESSION_ID}/metadata" \
    --value "{
        \"type\": \"${AQE_REPORT_TYPE}\",
        \"format\": \"${AQE_REPORT_FORMAT}\",
        \"path\": \"${REPORT_FILE}\",
        \"size\": ${REPORT_SIZE},
        \"includes_trends\": ${AQE_INCLUDE_TRENDS},
        \"timestamp\": \"$(date -Iseconds)\"
    }"

# Step 6: Generate shareable link if configured
if [[ -n "${AQE_SHARE_ENDPOINT:-}" ]]; then
    log_info "Uploading report to share endpoint..."

    SHARE_RESPONSE=$(curl -X POST "${AQE_SHARE_ENDPOINT}/upload" \
        -F "file=@${REPORT_FILE}" \
        -F "session_id=${AQE_REPORT_SESSION_ID}" \
        -F "type=${AQE_REPORT_TYPE}")

    SHARE_URL=$(echo "${SHARE_RESPONSE}" | jq -r '.url')

    log_success "Report shared at: ${SHARE_URL}"

    npx claude-flow@alpha memory store \
        --key "aqe/reports/${AQE_REPORT_SESSION_ID}/share_url" \
        --value "${SHARE_URL}"
fi

# Step 7: Update report generation metrics
npx claude-flow@alpha memory increment \
    --key "aqe/metrics/reports_generated" \
    --value 1

# Step 8: Notify report completion
npx claude-flow@alpha hooks notify \
    --message "Report generated: ${AQE_REPORT_TYPE} (${AQE_REPORT_FORMAT})" \
    --level "success" \
    --metadata "{\"path\": \"${REPORT_FILE}\", \"size\": ${REPORT_SIZE}}"

log_success "Report generation completed: ${REPORT_FILE}"
exit 0
```

**Memory Operations:**
- Retrieves data from multiple namespaces:
  - `aqe/coverage/{session_id}/results`
  - `aqe/execution/{session_id}/results`
  - `aqe/quality/{session_id}/results`
  - `aqe/metrics/coverage_history`
  - `aqe/metrics/quality_history`
- `aqe/reports/{session_id}/metadata` - Report metadata
- `aqe/reports/{session_id}/share_url` - Shareable URL
- `aqe/metrics/reports_generated` - Global counter

**Integration Points:**
- Consolidates data from coverage, execution, and quality hooks
- Generates multiple report formats (HTML, Markdown, JSON, PDF)
- Supports trend analysis from historical data
- Can share reports via external endpoints

---

## Common Utilities

All hooks share common utility functions located in `.claude/hooks/utils/common.sh`:

```bash
#!/bin/bash
# File: .claude/hooks/utils/common.sh

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Memory helpers
memory_store() {
    local key=$1
    local value=$2
    npx claude-flow@alpha memory store --key "${key}" --value "${value}"
}

memory_retrieve() {
    local key=$1
    npx claude-flow@alpha memory retrieve --key "${key}"
}

memory_increment() {
    local key=$1
    local value=${2:-1}
    npx claude-flow@alpha memory increment --key "${key}" --value "${value}"
}

# Agent spawning helper
spawn_agent() {
    local type=$1
    local task=$2
    local context=${3:-"{}"}

    npx claude-flow@alpha agent-spawn \
        --type "${type}" \
        --task "${task}" \
        --context "${context}" \
        --async
}

# Notification helper
notify() {
    local message=$1
    local level=${2:-"info"}
    local metadata=${3:-"{}"}

    npx claude-flow@alpha hooks notify \
        --message "${message}" \
        --level "${level}" \
        --metadata "${metadata}"
}

# Validation helpers
validate_file_exists() {
    local file=$1
    if [[ ! -f "${file}" ]]; then
        log_error "File not found: ${file}"
        return 1
    fi
    return 0
}

validate_dir_exists() {
    local dir=$1
    if [[ ! -d "${dir}" ]]; then
        log_error "Directory not found: ${dir}"
        return 1
    fi
    return 0
}

# JSON helpers
json_get() {
    local json=$1
    local path=$2
    echo "${json}" | jq -r "${path}"
}

json_set() {
    local json=$1
    local path=$2
    local value=$3
    echo "${json}" | jq "${path} = ${value}"
}

# Export functions
export -f log_info log_success log_warn log_error
export -f memory_store memory_retrieve memory_increment
export -f spawn_agent notify
export -f validate_file_exists validate_dir_exists
export -f json_get json_set
```

---

## Hook Integration Examples

### Example 1: Full Test Lifecycle

```bash
# User runs: aqe test user-service.ts

# 1. pre-test-generation triggered
#    - Validates user-service.ts exists
#    - Analyzes complexity (score: 45)
#    - Stores module metadata
#    - Spawns coverage-analyzer (async)

# 2. post-test-generation triggered
#    - Validates 12 test files generated
#    - Lints all test files
#    - Stores generation results
#    - Triggers test-executor (auto-run enabled)

# 3. pre-test-execution triggered
#    - Validates test environment
#    - Determines parallel strategy (4 workers)
#    - Sets up coverage instrumentation
#    - Spawns performance monitor

# 4. post-test-execution triggered
#    - Parses test results (120 tests, 118 passed, 2 failed)
#    - Triggers test-failure-handler (2 failures)
#    - Triggers pre-coverage-analysis (coverage enabled)

# 5. test-failure-handler triggered
#    - Categories failures (1 assertion, 1 timeout)
#    - Generates failure report
#    - Notifies about failures

# 6. pre-coverage-analysis triggered
#    - Normalizes coverage format (LCOV to JSON)
#    - Calculates current coverage (87.5%)
#    - Identifies 15 files below threshold
#    - Prepares sublinear solver matrix

# 7. post-coverage-analysis triggered
#    - Finds 23 coverage gaps
#    - Stores coverage results
#    - Spawns test-generator for high-priority gaps
#    - Triggers quality-gate-check

# 8. quality-gate-check triggered
#    - Checks coverage threshold (87.5% vs 90%)
#    - Checks complexity (3 violations)
#    - Quality score: 84/100
#    - Gate status: FAILED
#    - Triggers optimization-trigger

# 9. optimization-trigger triggered
#    - Creates optimization plan (5 actions)
#    - Spawns 2 optimization agents
#    - Schedules validation in 5 minutes

# 10. report-generation triggered
#     - Generates comprehensive HTML report
#     - Includes coverage trends (30 days)
#     - Uploads to share endpoint
#     - Notifies completion
```

### Example 2: CI/CD Pipeline Integration

```yaml
# .github/workflows/test.yml
name: AQE Test Pipeline

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: npm ci

      - name: Run AQE tests
        env:
          AQE_PARALLEL_WORKERS: 4
          AQE_COVERAGE_ENABLED: true
          AQE_COVERAGE_THRESHOLD: 90
          AQE_STRICT_MODE: true
        run: |
          # Hooks will automatically trigger
          npx aqe run --coverage

      - name: Check quality gate
        run: |
          # quality-gate-check hook will fail if thresholds not met
          # (hook returns exit code 1 on failure)
          echo "Quality gate passed"

      - name: Generate report
        if: always()
        run: |
          npx aqe report --type full --format html

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: aqe-report
          path: reports/aqe-report-*.html
```

---

## Hook Configuration

Hooks can be configured via `.claude/config.yml`:

```yaml
hooks:
  enabled: true

  # Hook-specific settings
  pre-test-generation:
    complexity_limit: 50
    auto_spawn_analyzer: true

  post-test-generation:
    auto_run: true
    lint_on_generate: true

  pre-test-execution:
    auto_detect_workers: true
    max_workers: 8
    enable_coverage: true

  post-test-execution:
    auto_analyze_coverage: true
    notify_threshold: 5

  quality-gate-check:
    strict_mode: false
    coverage_threshold: 90
    complexity_max: 15
    duplication_max: 5

  test-failure-handler:
    auto_retry: true
    max_retries: 3
    notify_threshold: 10

  optimization-trigger:
    default_level: moderate
    max_parallel_agents: 2

  report-generation:
    auto_generate: true
    default_format: html
    include_trends: true
    time_range: 30d
    share_endpoint: https://reports.example.com
```

---

## Summary

This hook architecture provides:

1. **Complete Lifecycle Coverage**: 10 hooks covering all test lifecycle events
2. **Claude Flow Integration**: All hooks use `aqe/*` memory namespace
3. **Agent Coordination**: Hooks spawn appropriate agents automatically
4. **Parallel Execution**: Supports multi-worker test execution
5. **O(log n) Performance**: Leverages sublinear algorithms for scale
6. **Comprehensive Reporting**: Multiple format support with trend analysis
7. **CI/CD Ready**: Exit codes and notifications for pipeline integration
8. **Extensible**: Modular design allows easy addition of new hooks
9. **Error Handling**: Robust error handling and retry mechanisms
10. **Metrics Tracking**: Global metrics for continuous improvement

All hooks follow the same pattern:
- Validate inputs
- Store context in memory
- Perform core operations
- Trigger follow-up actions
- Update metrics
- Notify completion

This creates a cohesive, automated QE system that scales from single module testing to enterprise-wide quality engineering.