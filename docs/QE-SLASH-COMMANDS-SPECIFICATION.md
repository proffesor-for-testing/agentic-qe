# Agentic QE Fleet - Slash Commands Specification

**Version:** 2.0.0
**Date:** 2025-09-30
**Status:** Architecture Design
**Author:** System Architect

---

## Executive Summary

This document specifies 8 comprehensive slash commands for the Agentic Quality Engineering (AQE) Fleet. Each command is designed for Claude Code integration, leveraging Claude Flow coordination patterns while supporting direct CLI execution.

### Design Principles

1. **Claude Flow Native**: All commands use hooks, memory, and coordination
2. **Agent-Centric**: Commands spawn and coordinate specialized QE agents
3. **Sublinear First**: Leverage O(log n) algorithms for scalability
4. **Framework Agnostic**: Support multiple testing frameworks
5. **Real-time Feedback**: Live progress reporting and metrics
6. **Neural Learning**: Continuous improvement through pattern recognition

---

## Command 1: `/qe-generate`

### Overview
Generate comprehensive test suites using AI-powered analysis and sublinear optimization algorithms.

### Syntax
```bash
/qe-generate <target> [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `target` | path | Yes | - | Source code path to generate tests for |
| `--type` | enum | No | `unit` | Test type: unit, integration, e2e, performance, security |
| `--framework` | string | No | `jest` | Testing framework: jest, mocha, cypress, playwright, vitest |
| `--coverage` | number | No | `95` | Target coverage percentage (0-100) |
| `--property-based` | boolean | No | `false` | Enable property-based testing |
| `--mutation` | boolean | No | `false` | Enable mutation testing |
| `--parallel` | boolean | No | `true` | Generate tests in parallel |
| `--output` | path | No | `./tests` | Output directory for generated tests |
| `--swagger` | path | No | - | OpenAPI/Swagger spec for API testing |
| `--dry-run` | boolean | No | `false` | Preview without writing files |

### Agent Coordination

**Primary Agent:** `qe-test-generator`
**Supporting Agents:**
- `qe-coverage-analyzer` - Analyzes existing coverage
- `qe-quality-gate` - Validates generated test quality

### Memory Keys

**Input Keys:**
- `aqe/source-code/${target}` - Source code analysis
- `aqe/coverage-baseline` - Existing coverage data
- `aqe/test-patterns` - Known test patterns from neural learning

**Output Keys:**
- `aqe/test-generation/results` - Generation results and metadata
- `aqe/test-suite/${target}` - Generated test suite
- `aqe/coverage-projection` - Projected coverage improvement

### Hooks Triggered

**Pre-Task:**
```bash
npx claude-flow@alpha hooks pre-task \
  --description "Generate tests for ${target}" \
  --agent "qe-test-generator"

npx claude-flow@alpha memory retrieve \
  --key "aqe/test-requirements"

npx claude-flow@alpha memory retrieve \
  --key "aqe/coverage-baseline"
```

**Post-Edit:**
```bash
npx claude-flow@alpha hooks post-edit \
  --file "${TEST_FILE}" \
  --memory-key "aqe/test-files/${FILE_NAME}"
```

**Post-Task:**
```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${TASK_ID}" \
  --results "${GENERATION_RESULTS}"

npx claude-flow@alpha memory store \
  --key "aqe/test-generation/results" \
  --value "${TEST_RESULTS}"

npx claude-flow@alpha hooks notify \
  --message "Generated ${TEST_COUNT} tests with ${COVERAGE}% projected coverage"
```

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-generate.sh

set -euo pipefail

# Parse arguments
TARGET="${1}"
TYPE="${2:-unit}"
FRAMEWORK="${3:-jest}"
COVERAGE="${4:-95}"

# Validation
if [[ -z "${TARGET}" ]]; then
  echo "Error: Target path required"
  echo "Usage: /qe-generate <target> [type] [framework] [coverage]"
  exit 1
fi

if [[ ! -d "${TARGET}" && ! -f "${TARGET}" ]]; then
  echo "Error: Target path '${TARGET}' does not exist"
  exit 1
fi

# Pre-task hooks
echo "🚀 Initializing test generation for ${TARGET}..."

npx claude-flow@alpha hooks pre-task \
  --description "Generate ${TYPE} tests for ${TARGET}" \
  --agent "qe-test-generator"

# Retrieve context from memory
COVERAGE_BASELINE=$(npx claude-flow@alpha memory retrieve \
  --key "aqe/coverage-baseline" 2>/dev/null || echo "{}")

TEST_REQUIREMENTS=$(npx claude-flow@alpha memory retrieve \
  --key "aqe/test-requirements" 2>/dev/null || echo "{}")

# Generate unique task ID
TASK_ID="qe-gen-$(date +%s)-$$"

# Execute test generation via CLI
echo "🧠 Analyzing source code..."
agentic-qe generate tests \
  --path "${TARGET}" \
  --type "${TYPE}" \
  --framework "${FRAMEWORK}" \
  --coverage-target "${COVERAGE}" \
  --output "./tests/${TYPE}" \
  --task-id "${TASK_ID}" \
  --verbose

# Capture results
GENERATION_RESULTS=$(cat .agentic-qe/results/${TASK_ID}.json)
TEST_COUNT=$(echo "${GENERATION_RESULTS}" | jq -r '.testsGenerated')
PROJECTED_COVERAGE=$(echo "${GENERATION_RESULTS}" | jq -r '.projectedCoverage')

# Post-task hooks
npx claude-flow@alpha hooks post-task \
  --task-id "${TASK_ID}" \
  --results "${GENERATION_RESULTS}"

# Store results in memory
npx claude-flow@alpha memory store \
  --key "aqe/test-generation/${TASK_ID}" \
  --value "${GENERATION_RESULTS}"

# Notify fleet
npx claude-flow@alpha hooks notify \
  --message "✅ Generated ${TEST_COUNT} ${TYPE} tests with ${PROJECTED_COVERAGE}% projected coverage"

# Train neural patterns
npx claude-flow@alpha neural patterns \
  --action "learn" \
  --operation "test-generation" \
  --outcome "${GENERATION_RESULTS}"

echo "✅ Test generation completed successfully!"
echo "   Tests: ${TEST_COUNT}"
echo "   Coverage: ${PROJECTED_COVERAGE}%"
echo "   Framework: ${FRAMEWORK}"
echo "   Output: ./tests/${TYPE}"
```

### Example Usage Scenarios

**Scenario 1: Basic Unit Test Generation**
```bash
/qe-generate src/services/user-service.ts
```

**Scenario 2: E2E Tests from API Spec**
```bash
/qe-generate src/api --type e2e --swagger api-spec.yaml --framework cypress
```

**Scenario 3: Property-Based Testing**
```bash
/qe-generate src/utils --type unit --property-based --coverage 98
```

**Scenario 4: Full Security Test Suite**
```bash
/qe-generate src/ --type security --framework jest --mutation
```

### Success Criteria

- ✅ Tests generated with target coverage
- ✅ All tests syntactically valid
- ✅ Framework-specific best practices applied
- ✅ Memory updated with generation results
- ✅ Neural patterns trained from outcomes

### Error Handling

```bash
# Invalid target path
if [[ ! -e "${TARGET}" ]]; then
  echo "❌ Error: Target '${TARGET}' not found"
  npx claude-flow@alpha hooks notify \
    --message "Test generation failed: Invalid target path"
  exit 1
fi

# Framework not installed
if ! command -v "${FRAMEWORK}" &> /dev/null; then
  echo "⚠️  Warning: ${FRAMEWORK} not installed"
  echo "   Installing ${FRAMEWORK}..."
  npm install --save-dev "${FRAMEWORK}"
fi

# Coverage target validation
if [[ "${COVERAGE}" -lt 0 || "${COVERAGE}" -gt 100 ]]; then
  echo "❌ Error: Coverage must be 0-100"
  exit 1
fi
```

---

## Command 2: `/qe-execute`

### Overview
Execute test suites with parallel orchestration, retry logic, and real-time reporting.

### Syntax
```bash
/qe-execute [suite] [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `suite` | path | No | `./tests` | Test suite path or pattern |
| `--framework` | string | No | `auto-detect` | Testing framework to use |
| `--parallel` | number | No | `auto` | Parallel worker count (auto = CPU cores) |
| `--coverage` | boolean | No | `true` | Collect coverage data |
| `--retry` | number | No | `2` | Retry count for flaky tests |
| `--timeout` | number | No | `30000` | Test timeout in milliseconds |
| `--bail` | boolean | No | `false` | Stop on first failure |
| `--watch` | boolean | No | `false` | Watch mode for continuous testing |
| `--reporter` | string | No | `default` | Reporter: default, json, html, junit |
| `--filter` | string | No | - | Test pattern filter (regex) |

### Agent Coordination

**Primary Agent:** `qe-test-executor`
**Supporting Agents:**
- `qe-coverage-analyzer` - Real-time coverage tracking
- `qe-performance-tester` - Performance monitoring

### Memory Keys

**Input Keys:**
- `aqe/test-suite/${suite}` - Test suite metadata
- `aqe/execution-config` - Execution configuration
- `aqe/flaky-tests` - Known flaky tests for retry logic

**Output Keys:**
- `aqe/execution/results/${run_id}` - Execution results
- `aqe/coverage/current` - Current coverage data
- `aqe/test-failures` - Failed test details

### Hooks Triggered

**Pre-Task:**
```bash
npx claude-flow@alpha hooks pre-task \
  --description "Execute test suite: ${suite}" \
  --agent "qe-test-executor"

npx claude-flow@alpha memory retrieve \
  --key "aqe/flaky-tests"
```

**During Execution (per test file):**
```bash
npx claude-flow@alpha hooks notify \
  --message "Executing: ${TEST_FILE} (${CURRENT}/${TOTAL})"
```

**Post-Task:**
```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${RUN_ID}" \
  --results "${EXECUTION_RESULTS}"

npx claude-flow@alpha memory store \
  --key "aqe/execution/results/${RUN_ID}" \
  --value "${TEST_RESULTS}"
```

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-execute.sh

set -euo pipefail

# Parse arguments
SUITE="${1:-./tests}"
FRAMEWORK="${2:-auto}"
PARALLEL="${3:-auto}"
COVERAGE="${4:-true}"

# Generate execution ID
RUN_ID="qe-exec-$(date +%s)-$$"

# Pre-task hooks
echo "🧪 Executing test suite: ${SUITE}"

npx claude-flow@alpha hooks pre-task \
  --description "Execute test suite: ${SUITE}" \
  --agent "qe-test-executor"

# Retrieve flaky test data
FLAKY_TESTS=$(npx claude-flow@alpha memory retrieve \
  --key "aqe/flaky-tests" 2>/dev/null || echo "[]")

# Auto-detect framework if needed
if [[ "${FRAMEWORK}" == "auto" ]]; then
  if [[ -f "jest.config.js" || -f "jest.config.ts" ]]; then
    FRAMEWORK="jest"
  elif [[ -f "cypress.config.js" ]]; then
    FRAMEWORK="cypress"
  elif [[ -f "playwright.config.ts" ]]; then
    FRAMEWORK="playwright"
  else
    FRAMEWORK="jest"  # Default fallback
  fi
  echo "📦 Auto-detected framework: ${FRAMEWORK}"
fi

# Determine parallel workers
if [[ "${PARALLEL}" == "auto" ]]; then
  PARALLEL=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "4")
  echo "⚡ Using ${PARALLEL} parallel workers"
fi

# Execute tests with real-time monitoring
echo "🚀 Starting test execution..."

agentic-qe run tests \
  --path "${SUITE}" \
  --framework "${FRAMEWORK}" \
  --parallel "${PARALLEL}" \
  --coverage "${COVERAGE}" \
  --retry 2 \
  --run-id "${RUN_ID}" \
  --reporter "default" \
  --json-output ".agentic-qe/results/${RUN_ID}.json" \
  --verbose

# Capture results
EXECUTION_RESULTS=$(cat .agentic-qe/results/${RUN_ID}.json)
TESTS_RUN=$(echo "${EXECUTION_RESULTS}" | jq -r '.numTotalTests')
TESTS_PASSED=$(echo "${EXECUTION_RESULTS}" | jq -r '.numPassedTests')
TESTS_FAILED=$(echo "${EXECUTION_RESULTS}" | jq -r '.numFailedTests')
COVERAGE_PCT=$(echo "${EXECUTION_RESULTS}" | jq -r '.coverageMap.total.pct')

# Post-task hooks
npx claude-flow@alpha hooks post-task \
  --task-id "${RUN_ID}" \
  --results "${EXECUTION_RESULTS}"

# Store results in memory
npx claude-flow@alpha memory store \
  --key "aqe/execution/results/${RUN_ID}" \
  --value "${EXECUTION_RESULTS}"

# Update coverage data
npx claude-flow@alpha memory store \
  --key "aqe/coverage/current" \
  --value "${COVERAGE_PCT}"

# Notify fleet
if [[ "${TESTS_FAILED}" -eq 0 ]]; then
  npx claude-flow@alpha hooks notify \
    --message "✅ All tests passed! ${TESTS_PASSED}/${TESTS_RUN} with ${COVERAGE_PCT}% coverage"
else
  npx claude-flow@alpha hooks notify \
    --message "⚠️  ${TESTS_FAILED} tests failed out of ${TESTS_RUN}"
fi

# Train neural patterns from execution
npx claude-flow@alpha neural patterns \
  --action "learn" \
  --operation "test-execution" \
  --outcome "${EXECUTION_RESULTS}"

echo ""
echo "📊 Execution Summary:"
echo "   Total: ${TESTS_RUN}"
echo "   Passed: ${TESTS_PASSED}"
echo "   Failed: ${TESTS_FAILED}"
echo "   Coverage: ${COVERAGE_PCT}%"
echo "   Duration: $(echo "${EXECUTION_RESULTS}" | jq -r '.testResults[0].perfStats.runtime')ms"

# Exit with failure code if tests failed
exit "${TESTS_FAILED}"
```

### Example Usage Scenarios

**Scenario 1: Run All Tests**
```bash
/qe-execute
```

**Scenario 2: Run Specific Suite in Parallel**
```bash
/qe-execute tests/integration --parallel 8 --coverage
```

**Scenario 3: Watch Mode for TDD**
```bash
/qe-execute tests/unit --watch --bail
```

**Scenario 4: CI/CD Execution**
```bash
/qe-execute --reporter junit --bail --no-coverage
```

### Success Criteria

- ✅ All non-flaky tests pass
- ✅ Coverage data collected and stored
- ✅ Results stored in memory
- ✅ Real-time progress updates
- ✅ Performance metrics tracked

---

## Command 3: `/qe-analyze`

### Overview
Analyze test coverage, identify gaps, and use sublinear algorithms to optimize coverage strategy.

### Syntax
```bash
/qe-analyze [target] [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `target` | string | No | `coverage` | Analysis type: coverage, quality, gaps, trends, risk |
| `--path` | path | No | `./src` | Source code path to analyze |
| `--baseline` | path | No | - | Baseline coverage file for comparison |
| `--threshold` | number | No | `95` | Minimum coverage threshold |
| `--sublinear` | boolean | No | `true` | Use sublinear optimization algorithms |
| `--format` | string | No | `text` | Output format: text, json, html, markdown |
| `--output` | path | No | `stdout` | Output file path |
| `--diff` | boolean | No | `false` | Show coverage diff from baseline |

### Agent Coordination

**Primary Agent:** `qe-coverage-analyzer`
**Supporting Agents:**
- `qe-test-generator` - Generates tests for gaps
- `qe-quality-gate` - Validates against thresholds

### Memory Keys

**Input Keys:**
- `aqe/coverage/current` - Current coverage data
- `aqe/coverage/baseline` - Historical coverage baseline
- `aqe/source-code` - Source code analysis

**Output Keys:**
- `aqe/coverage-analysis/results` - Analysis results
- `aqe/coverage-gaps` - Identified coverage gaps
- `aqe/coverage-recommendations` - Optimization recommendations

### Hooks Triggered

**Pre-Task:**
```bash
npx claude-flow@alpha hooks pre-task \
  --description "Analyze coverage for ${target}" \
  --agent "qe-coverage-analyzer"

npx claude-flow@alpha memory retrieve \
  --key "aqe/coverage/current"
```

**Post-Task:**
```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${ANALYSIS_ID}" \
  --results "${ANALYSIS_RESULTS}"

npx claude-flow@alpha memory store \
  --key "aqe/coverage-analysis/results" \
  --value "${ANALYSIS_RESULTS}"
```

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-analyze.sh

set -euo pipefail

# Parse arguments
TARGET="${1:-coverage}"
PATH_ARG="${2:-./src}"
THRESHOLD="${3:-95}"
SUBLINEAR="${4:-true}"

# Generate analysis ID
ANALYSIS_ID="qe-analyze-$(date +%s)-$$"

# Pre-task hooks
echo "📊 Analyzing ${TARGET}..."

npx claude-flow@alpha hooks pre-task \
  --description "Analyze ${TARGET}" \
  --agent "qe-coverage-analyzer"

# Retrieve current coverage data
CURRENT_COVERAGE=$(npx claude-flow@alpha memory retrieve \
  --key "aqe/coverage/current" 2>/dev/null || echo "{}")

# Execute coverage analysis
echo "🔍 Running sublinear coverage analysis..."

agentic-qe analyze coverage \
  --path "${PATH_ARG}" \
  --threshold "${THRESHOLD}" \
  --sublinear "${SUBLINEAR}" \
  --analysis-id "${ANALYSIS_ID}" \
  --output ".agentic-qe/analysis/${ANALYSIS_ID}.json" \
  --verbose

# Capture results
ANALYSIS_RESULTS=$(cat .agentic-qe/analysis/${ANALYSIS_ID}.json)
COVERAGE_PCT=$(echo "${ANALYSIS_RESULTS}" | jq -r '.coverage.total.pct')
GAPS_COUNT=$(echo "${ANALYSIS_RESULTS}" | jq -r '.gaps | length')
CRITICAL_GAPS=$(echo "${ANALYSIS_RESULTS}" | jq -r '.gaps | map(select(.priority == "critical")) | length')

# Post-task hooks
npx claude-flow@alpha hooks post-task \
  --task-id "${ANALYSIS_ID}" \
  --results "${ANALYSIS_RESULTS}"

# Store analysis results
npx claude-flow@alpha memory store \
  --key "aqe/coverage-analysis/${ANALYSIS_ID}" \
  --value "${ANALYSIS_RESULTS}"

# Store identified gaps
GAPS=$(echo "${ANALYSIS_RESULTS}" | jq -r '.gaps')
npx claude-flow@alpha memory store \
  --key "aqe/coverage-gaps" \
  --value "${GAPS}"

# Notify fleet
npx claude-flow@alpha hooks notify \
  --message "📊 Coverage analysis: ${COVERAGE_PCT}% with ${GAPS_COUNT} gaps (${CRITICAL_GAPS} critical)"

# Generate recommendations using sublinear optimization
if [[ "${SUBLINEAR}" == "true" ]]; then
  echo "🧠 Generating optimization recommendations..."

  RECOMMENDATIONS=$(agentic-qe optimize coverage \
    --analysis-id "${ANALYSIS_ID}" \
    --algorithm "sublinear" \
    --target-coverage "${THRESHOLD}")

  npx claude-flow@alpha memory store \
    --key "aqe/coverage-recommendations" \
    --value "${RECOMMENDATIONS}"
fi

# Display results
echo ""
echo "📈 Coverage Analysis Results:"
echo "   Current Coverage: ${COVERAGE_PCT}%"
echo "   Threshold: ${THRESHOLD}%"
echo "   Total Gaps: ${GAPS_COUNT}"
echo "   Critical Gaps: ${CRITICAL_GAPS}"
echo ""

if [[ "${GAPS_COUNT}" -gt 0 ]]; then
  echo "🎯 Top Coverage Gaps:"
  echo "${GAPS}" | jq -r '.[] | select(.priority == "critical") | "   - \(.file):\(.line) (\(.type))"' | head -5
fi

# Exit with failure if below threshold
if (( $(echo "${COVERAGE_PCT} < ${THRESHOLD}" | bc -l) )); then
  echo "❌ Coverage below threshold: ${COVERAGE_PCT}% < ${THRESHOLD}%"
  exit 1
fi

echo "✅ Coverage analysis completed successfully!"
```

### Example Usage Scenarios

**Scenario 1: Basic Coverage Analysis**
```bash
/qe-analyze coverage
```

**Scenario 2: Gap Identification**
```bash
/qe-analyze gaps --path src/services --threshold 98
```

**Scenario 3: Trend Analysis**
```bash
/qe-analyze trends --baseline coverage-baseline.json --diff
```

**Scenario 4: Risk Assessment**
```bash
/qe-analyze risk --sublinear --format html --output risk-report.html
```

### Success Criteria

- ✅ Coverage data collected and analyzed
- ✅ Gaps identified with priority
- ✅ Recommendations generated
- ✅ Results stored in memory
- ✅ Threshold validation performed

---

## Command 4: `/qe-optimize`

### Overview
Optimize test suites using sublinear algorithms to maximize coverage while minimizing test count and execution time.

### Syntax
```bash
/qe-optimize [target] [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `target` | string | Yes | - | Optimization target: suite, coverage, performance, flakiness |
| `--path` | path | No | `./tests` | Test suite path |
| `--algorithm` | string | No | `sublinear` | Algorithm: sublinear, genetic, greedy, heuristic |
| `--objective` | string | No | `coverage-per-test` | Objective: coverage-per-test, execution-time, reliability |
| `--budget` | number | No | - | Time/test budget constraint |
| `--aggressive` | boolean | No | `false` | Aggressive optimization (may remove tests) |
| `--dry-run` | boolean | No | `false` | Preview optimization without applying |

### Agent Coordination

**Primary Agent:** `qe-coverage-analyzer` (optimization module)
**Supporting Agents:**
- `qe-test-executor` - Validates optimized suite
- `qe-performance-tester` - Measures performance impact

### Memory Keys

**Input Keys:**
- `aqe/test-suite/${suite}` - Test suite metadata
- `aqe/coverage-matrix` - Coverage matrix for optimization
- `aqe/execution-history` - Historical execution data

**Output Keys:**
- `aqe/optimization/results` - Optimization results
- `aqe/optimized-suite` - Optimized test suite
- `aqe/optimization-metrics` - Performance metrics

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-optimize.sh

set -euo pipefail

# Parse arguments
TARGET="${1}"
PATH_ARG="${2:-./tests}"
ALGORITHM="${3:-sublinear}"
OBJECTIVE="${4:-coverage-per-test}"

if [[ -z "${TARGET}" ]]; then
  echo "Error: Optimization target required"
  echo "Usage: /qe-optimize <target> [path] [algorithm] [objective]"
  echo "Targets: suite, coverage, performance, flakiness"
  exit 1
fi

# Generate optimization ID
OPT_ID="qe-opt-$(date +%s)-$$"

# Pre-task hooks
echo "⚡ Optimizing ${TARGET}..."

npx claude-flow@alpha hooks pre-task \
  --description "Optimize ${TARGET} with ${ALGORITHM}" \
  --agent "qe-coverage-analyzer"

# Retrieve test suite metadata
TEST_SUITE=$(npx claude-flow@alpha memory retrieve \
  --key "aqe/test-suite/${PATH_ARG}" 2>/dev/null || echo "{}")

# Execute optimization
echo "🧮 Running ${ALGORITHM} optimization algorithm..."

agentic-qe optimize "${TARGET}" \
  --path "${PATH_ARG}" \
  --algorithm "${ALGORITHM}" \
  --objective "${OBJECTIVE}" \
  --optimization-id "${OPT_ID}" \
  --output ".agentic-qe/optimization/${OPT_ID}.json" \
  --verbose

# Capture results
OPT_RESULTS=$(cat .agentic-qe/optimization/${OPT_ID}.json)
TESTS_BEFORE=$(echo "${OPT_RESULTS}" | jq -r '.before.testCount')
TESTS_AFTER=$(echo "${OPT_RESULTS}" | jq -r '.after.testCount')
COVERAGE_BEFORE=$(echo "${OPT_RESULTS}" | jq -r '.before.coverage')
COVERAGE_AFTER=$(echo "${OPT_RESULTS}" | jq -r '.after.coverage')
TIME_SAVED=$(echo "${OPT_RESULTS}" | jq -r '.timeSaved')

# Calculate improvement
TEST_REDUCTION=$(echo "scale=2; (${TESTS_BEFORE} - ${TESTS_AFTER}) / ${TESTS_BEFORE} * 100" | bc)
COVERAGE_DELTA=$(echo "scale=2; ${COVERAGE_AFTER} - ${COVERAGE_BEFORE}" | bc)

# Post-task hooks
npx claude-flow@alpha hooks post-task \
  --task-id "${OPT_ID}" \
  --results "${OPT_RESULTS}"

# Store optimization results
npx claude-flow@alpha memory store \
  --key "aqe/optimization/${OPT_ID}" \
  --value "${OPT_RESULTS}"

# Notify fleet
npx claude-flow@alpha hooks notify \
  --message "⚡ Optimization complete: ${TEST_REDUCTION}% fewer tests, ${COVERAGE_DELTA}% coverage change, ${TIME_SAVED}s saved"

# Train neural patterns
npx claude-flow@alpha neural patterns \
  --action "learn" \
  --operation "optimization" \
  --outcome "${OPT_RESULTS}"

# Display results
echo ""
echo "📊 Optimization Results:"
echo "   Algorithm: ${ALGORITHM}"
echo "   Objective: ${OBJECTIVE}"
echo ""
echo "   Tests Before: ${TESTS_BEFORE}"
echo "   Tests After: ${TESTS_AFTER}"
echo "   Reduction: ${TEST_REDUCTION}%"
echo ""
echo "   Coverage Before: ${COVERAGE_BEFORE}%"
echo "   Coverage After: ${COVERAGE_AFTER}%"
echo "   Delta: ${COVERAGE_DELTA}%"
echo ""
echo "   Time Saved: ${TIME_SAVED}s per run"
echo ""

if [[ "${COVERAGE_DELTA}" != "-"* ]]; then
  echo "✅ Optimization successful! Fewer tests with maintained/improved coverage."
else
  echo "⚠️  Warning: Coverage decreased by ${COVERAGE_DELTA}%"
fi
```

### Example Usage Scenarios

**Scenario 1: Optimize Test Suite**
```bash
/qe-optimize suite --path tests/unit --algorithm sublinear
```

**Scenario 2: Maximize Coverage Efficiency**
```bash
/qe-optimize coverage --objective coverage-per-test --aggressive
```

**Scenario 3: Reduce Execution Time**
```bash
/qe-optimize performance --budget 300 --algorithm genetic
```

**Scenario 4: Remove Flaky Tests**
```bash
/qe-optimize flakiness --dry-run
```

---

## Command 5: `/qe-report`

### Overview
Generate comprehensive quality engineering reports with metrics, trends, and actionable insights.

### Syntax
```bash
/qe-report [type] [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | string | No | `summary` | Report type: summary, detailed, trend, executive, custom |
| `--format` | string | No | `markdown` | Format: markdown, html, pdf, json |
| `--output` | path | No | `stdout` | Output file path |
| `--period` | string | No | `last-7-days` | Time period: last-24h, last-7-days, last-30-days, all-time |
| `--include` | string[] | No | `all` | Sections: coverage, performance, quality, trends, recommendations |
| `--charts` | boolean | No | `true` | Include charts and visualizations |

### Agent Coordination

**Primary Agent:** `qe-quality-gate` (reporting module)
**Supporting Agents:**
- `qe-coverage-analyzer` - Coverage metrics
- `qe-test-executor` - Execution metrics
- `qe-performance-tester` - Performance metrics

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-report.sh

set -euo pipefail

REPORT_TYPE="${1:-summary}"
FORMAT="${2:-markdown}"
PERIOD="${3:-last-7-days}"

REPORT_ID="qe-report-$(date +%s)-$$"

echo "📝 Generating ${REPORT_TYPE} report..."

npx claude-flow@alpha hooks pre-task \
  --description "Generate ${REPORT_TYPE} report" \
  --agent "qe-quality-gate"

# Retrieve metrics from memory
COVERAGE_DATA=$(npx claude-flow@alpha memory retrieve \
  --key "aqe/coverage/current" 2>/dev/null || echo "{}")

EXECUTION_DATA=$(npx claude-flow@alpha memory retrieve \
  --key "aqe/execution/history" 2>/dev/null || echo "[]")

# Generate report
agentic-qe report generate \
  --type "${REPORT_TYPE}" \
  --format "${FORMAT}" \
  --period "${PERIOD}" \
  --report-id "${REPORT_ID}" \
  --output ".agentic-qe/reports/${REPORT_ID}.${FORMAT}" \
  --verbose

# Display report location
echo "✅ Report generated: .agentic-qe/reports/${REPORT_ID}.${FORMAT}"

# Store in memory
REPORT_META="{\"id\": \"${REPORT_ID}\", \"type\": \"${REPORT_TYPE}\", \"date\": \"$(date -Iseconds)\"}"
npx claude-flow@alpha memory store \
  --key "aqe/reports/${REPORT_ID}" \
  --value "${REPORT_META}"

# Notify fleet
npx claude-flow@alpha hooks notify \
  --message "📝 ${REPORT_TYPE} report generated: ${REPORT_ID}"
```

---

## Command 6: `/qe-fleet-status`

### Overview
Display comprehensive fleet health, agent status, and coordination metrics.

### Syntax
```bash
/qe-fleet-status [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `--detailed` | boolean | No | `false` | Show detailed agent metrics |
| `--json` | boolean | No | `false` | Output as JSON |
| `--watch` | boolean | No | `false` | Continuous monitoring mode |

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-fleet-status.sh

set -euo pipefail

echo "🤖 AQE Fleet Status"
echo "==================="
echo ""

# Fleet health
FLEET_ID=$(npx claude-flow@alpha memory retrieve --key "aqe/fleet/id" 2>/dev/null || echo "unknown")
echo "Fleet ID: ${FLEET_ID}"
echo "Status: Active"
echo ""

# Agent status
echo "Agents:"
for agent in qe-test-generator qe-test-executor qe-coverage-analyzer qe-quality-gate qe-performance-tester qe-security-scanner; do
  AGENT_FILE=".claude/agents/${agent}.md"
  if [[ -f "${AGENT_FILE}" ]]; then
    echo "  ✓ ${agent}: Active"
  else
    echo "  ✗ ${agent}: Not registered"
  fi
done
echo ""

# Recent activity
echo "Recent Activity:"
RECENT=$(npx claude-flow@alpha memory retrieve --key "aqe/activity/recent" 2>/dev/null || echo "[]")
echo "${RECENT}" | jq -r '.[] | "  - \(.timestamp): \(.message)"' | head -5

echo ""
echo "Use 'aqe status' for more details"
```

---

## Command 7: `/qe-chaos`

### Overview
Run chaos testing scenarios to validate system resilience and fault tolerance.

### Syntax
```bash
/qe-chaos [scenario] [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `scenario` | string | Yes | - | Chaos scenario: latency, failure, resource-exhaustion, network-partition |
| `--duration` | number | No | `60` | Test duration in seconds |
| `--intensity` | number | No | `medium` | Intensity: low, medium, high, extreme |
| `--target` | string | No | `all` | Target services/components |
| `--recovery-check` | boolean | No | `true` | Verify system recovery after chaos |

### Agent Coordination

**Primary Agent:** `qe-test-executor` (chaos module)
**Supporting Agents:**
- `qe-performance-tester` - Monitors performance impact
- `qe-security-scanner` - Checks for security vulnerabilities during chaos

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-chaos.sh

set -euo pipefail

SCENARIO="${1}"
DURATION="${2:-60}"
INTENSITY="${3:-medium}"

if [[ -z "${SCENARIO}" ]]; then
  echo "Error: Chaos scenario required"
  echo "Usage: /qe-chaos <scenario> [duration] [intensity]"
  echo "Scenarios: latency, failure, resource-exhaustion, network-partition"
  exit 1
fi

CHAOS_ID="qe-chaos-$(date +%s)-$$"

echo "💥 Running chaos test: ${SCENARIO}"
echo "   Duration: ${DURATION}s"
echo "   Intensity: ${INTENSITY}"
echo ""

npx claude-flow@alpha hooks pre-task \
  --description "Chaos test: ${SCENARIO}" \
  --agent "qe-test-executor"

# Execute chaos test
agentic-qe chaos run \
  --scenario "${SCENARIO}" \
  --duration "${DURATION}" \
  --intensity "${INTENSITY}" \
  --chaos-id "${CHAOS_ID}" \
  --output ".agentic-qe/chaos/${CHAOS_ID}.json" \
  --verbose

# Capture results
CHAOS_RESULTS=$(cat .agentic-qe/chaos/${CHAOS_ID}.json)

# Store results
npx claude-flow@alpha memory store \
  --key "aqe/chaos/${CHAOS_ID}" \
  --value "${CHAOS_RESULTS}"

# Notify fleet
npx claude-flow@alpha hooks notify \
  --message "💥 Chaos test ${SCENARIO} completed"

echo "✅ Chaos test completed!"
```

---

## Command 8: `/qe-benchmark`

### Overview
Run performance benchmarks and compare against baselines.

### Syntax
```bash
/qe-benchmark [target] [options]
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `target` | string | Yes | - | Benchmark target: api, database, function, system |
| `--baseline` | path | No | - | Baseline file for comparison |
| `--iterations` | number | No | `1000` | Number of benchmark iterations |
| `--warmup` | number | No | `100` | Warmup iterations |
| `--concurrency` | number | No | `1` | Concurrent requests |

### Agent Coordination

**Primary Agent:** `qe-performance-tester`
**Supporting Agents:**
- `qe-test-executor` - Orchestrates benchmark execution
- `qe-quality-gate` - Validates against SLAs

### Implementation Structure

```bash
#!/bin/bash
# .claude/commands/qe-benchmark.sh

set -euo pipefail

TARGET="${1}"
ITERATIONS="${2:-1000}"
CONCURRENCY="${3:-1}"

if [[ -z "${TARGET}" ]]; then
  echo "Error: Benchmark target required"
  echo "Usage: /qe-benchmark <target> [iterations] [concurrency]"
  exit 1
fi

BENCH_ID="qe-bench-$(date +%s)-$$"

echo "⚡ Running benchmark: ${TARGET}"

npx claude-flow@alpha hooks pre-task \
  --description "Benchmark: ${TARGET}" \
  --agent "qe-performance-tester"

# Execute benchmark
agentic-qe benchmark run \
  --target "${TARGET}" \
  --iterations "${ITERATIONS}" \
  --concurrency "${CONCURRENCY}" \
  --benchmark-id "${BENCH_ID}" \
  --output ".agentic-qe/benchmarks/${BENCH_ID}.json" \
  --verbose

# Capture and display results
BENCH_RESULTS=$(cat .agentic-qe/benchmarks/${BENCH_ID}.json)

echo ""
echo "📊 Benchmark Results:"
echo "${BENCH_RESULTS}" | jq -r '
  "   Mean: \(.mean)ms",
  "   Median: \(.median)ms",
  "   P95: \(.p95)ms",
  "   P99: \(.p99)ms",
  "   Throughput: \(.throughput) req/s"
'

# Store results
npx claude-flow@alpha memory store \
  --key "aqe/benchmarks/${BENCH_ID}" \
  --value "${BENCH_RESULTS}"

npx claude-flow@alpha hooks notify \
  --message "⚡ Benchmark ${TARGET} completed: $(echo "${BENCH_RESULTS}" | jq -r '.mean')ms mean"
```

---

## Integration with Claude Code

All commands integrate with Claude Code via:

1. **Task Tool Spawning**: Commands spawn agents using Claude Code's Task tool
2. **Memory Coordination**: All results stored in Claude Flow memory
3. **Hook Integration**: Pre/post hooks for every operation
4. **Neural Learning**: Patterns trained from execution outcomes
5. **Real-time Notifications**: Progress updates via EventBus

### Claude Code Agent Spawning Pattern

```javascript
// Example: User invokes /qe-generate via Claude Code

Task("Test Generation", `
  Run /qe-generate command for src/services/user-service.ts
  - Framework: jest
  - Coverage: 95%
  - Property-based: enabled

  Coordinate with coverage analyzer for gap analysis
`, "qe-test-generator")

Task("Coverage Analysis", `
  After test generation, analyze coverage gaps
  Use sublinear algorithms for optimization
`, "qe-coverage-analyzer")
```

---

## File Organization

Commands should be organized as follows:

```
.claude/
├── commands/
│   ├── qe-generate.sh
│   ├── qe-execute.sh
│   ├── qe-analyze.sh
│   ├── qe-optimize.sh
│   ├── qe-report.sh
│   ├── qe-fleet-status.sh
│   ├── qe-chaos.sh
│   └── qe-benchmark.sh
└── agents/
    ├── qe-test-generator.md
    ├── qe-test-executor.md
    ├── qe-coverage-analyzer.md
    ├── qe-quality-gate.md
    ├── qe-performance-tester.md
    └── qe-security-scanner.md
```

---

## Summary

These 8 slash commands provide comprehensive QE automation capabilities:

1. `/qe-generate` - AI-powered test generation
2. `/qe-execute` - Parallel test execution
3. `/qe-analyze` - Coverage and quality analysis
4. `/qe-optimize` - Sublinear test optimization
5. `/qe-report` - Comprehensive reporting
6. `/qe-fleet-status` - Fleet health monitoring
7. `/qe-chaos` - Chaos testing
8. `/qe-benchmark` - Performance benchmarking

Each command is designed for:
- ✅ Claude Flow native integration
- ✅ Agent coordination via hooks
- ✅ Memory-based state sharing
- ✅ Neural pattern learning
- ✅ Real-time progress reporting
- ✅ Sublinear algorithm optimization

**Next Steps:**
1. Implement shell scripts in `.claude/commands/`
2. Test integration with Claude Code
3. Document command usage in CLAUDE.md
4. Create command aliases for CLI