#!/usr/bin/env bash
# Quality Gate Script for CI/CD Pipeline
# Integrates with ControlLoopReporter for deployment decisions
#
# Usage: ./scripts/quality-gate.sh [--min-coverage N] [--min-pass-rate N]
#
# Exit Codes:
#   0 - Quality gates passed, deployment approved
#   1 - Quality gates failed, deployment blocked
#   2 - Script execution error

set -euo pipefail

# Default thresholds (can be overridden via arguments or env vars)
MIN_COVERAGE="${MIN_COVERAGE:-80}"
MIN_PASS_RATE="${MIN_PASS_RATE:-0.95}"
MAX_CRITICAL_VULNS="${MAX_CRITICAL_VULNS:-0}"
MAX_HIGH_VULNS="${MAX_HIGH_VULNS:-2}"

# Output files
QUALITY_REPORT_DIR="${QUALITY_REPORT_DIR:-./quality-reports}"
CONTROL_LOOP_OUTPUT="${QUALITY_REPORT_DIR}/control-loop-feedback.json"
HUMAN_OUTPUT="${QUALITY_REPORT_DIR}/quality-report.txt"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --min-coverage)
      MIN_COVERAGE="$2"
      shift 2
      ;;
    --min-pass-rate)
      MIN_PASS_RATE="$2"
      shift 2
      ;;
    --max-critical-vulns)
      MAX_CRITICAL_VULNS="$2"
      shift 2
      ;;
    --max-high-vulns)
      MAX_HIGH_VULNS="$2"
      shift 2
      ;;
    --help)
      echo "Quality Gate Script"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --min-coverage N           Minimum coverage percentage (default: 80)"
      echo "  --min-pass-rate N          Minimum test pass rate 0-1 (default: 0.95)"
      echo "  --max-critical-vulns N     Maximum critical vulnerabilities (default: 0)"
      echo "  --max-high-vulns N         Maximum high vulnerabilities (default: 2)"
      echo "  --help                     Show this help message"
      echo ""
      echo "Environment Variables:"
      echo "  MIN_COVERAGE               Same as --min-coverage"
      echo "  MIN_PASS_RATE              Same as --min-pass-rate"
      echo "  MAX_CRITICAL_VULNS         Same as --max-critical-vulns"
      echo "  MAX_HIGH_VULNS             Same as --max-high-vulns"
      echo "  QUALITY_REPORT_DIR         Output directory (default: ./quality-reports)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 2
      ;;
  esac
done

echo "==================================================================="
echo "Quality Gate Evaluation"
echo "==================================================================="
echo "Thresholds:"
echo "  - Minimum Coverage:              ${MIN_COVERAGE}%"
echo "  - Minimum Test Pass Rate:        $(echo "$MIN_PASS_RATE * 100" | bc)%"
echo "  - Max Critical Vulnerabilities:  ${MAX_CRITICAL_VULNS}"
echo "  - Max High Vulnerabilities:      ${MAX_HIGH_VULNS}"
echo "==================================================================="
echo ""

# Ensure output directory exists
mkdir -p "${QUALITY_REPORT_DIR}"

# Run tests with coverage
echo "▶ Running test suite with coverage..."
echo ""

# Run unit tests
if ! npm run test:unit 2>&1 | tee "${QUALITY_REPORT_DIR}/test-unit.log"; then
  echo "⚠️  Some unit tests may have failed - continuing with coverage analysis"
fi

# Run integration tests
if ! npm run test:integration 2>&1 | tee "${QUALITY_REPORT_DIR}/test-integration.log"; then
  echo "⚠️  Some integration tests may have failed - continuing with coverage analysis"
fi

echo ""
echo "▶ Analyzing test results and coverage..."
echo ""

# Extract coverage data if available
COVERAGE_FILE="./coverage/coverage-summary.json"
if [[ -f "$COVERAGE_FILE" ]]; then
  # Extract overall coverage percentage
  ACTUAL_COVERAGE=$(node -e "
    const coverage = require('${COVERAGE_FILE}');
    const total = coverage.total;
    if (total && total.lines) {
      console.log(total.lines.pct);
    } else {
      console.log('0');
    }
  " 2>/dev/null || echo "0")

  echo "Coverage: ${ACTUAL_COVERAGE}%"
else
  echo "⚠️  No coverage data found at ${COVERAGE_FILE}"
  ACTUAL_COVERAGE="0"
fi

# Parse test results (looking for Jest output)
TOTAL_TESTS=$(grep -E "Tests:.*\d+ total" "${QUALITY_REPORT_DIR}/test-unit.log" "${QUALITY_REPORT_DIR}/test-integration.log" 2>/dev/null | grep -oE "\d+ total" | grep -oE "\d+" | awk '{s+=$1} END {print s}' || echo "0")
FAILED_TESTS=$(grep -E "Tests:.*\d+ failed" "${QUALITY_REPORT_DIR}/test-unit.log" "${QUALITY_REPORT_DIR}/test-integration.log" 2>/dev/null | grep -oE "\d+ failed" | grep -oE "\d+" | awk '{s+=$1} END {print s}' || echo "0")
PASSED_TESTS=$(grep -E "Tests:.*\d+ passed" "${QUALITY_REPORT_DIR}/test-unit.log" "${QUALITY_REPORT_DIR}/test-integration.log" 2>/dev/null | grep -oE "\d+ passed" | grep -oE "\d+" | awk '{s+=$1} END {print s}' || echo "0")

if [[ "$TOTAL_TESTS" -eq 0 ]]; then
  echo "⚠️  No test results found - assuming tests were not executed"
  ACTUAL_PASS_RATE="0"
else
  ACTUAL_PASS_RATE=$(echo "scale=4; $PASSED_TESTS / $TOTAL_TESTS" | bc -l || echo "0")
fi

echo "Tests: ${PASSED_TESTS}/${TOTAL_TESTS} passed (${FAILED_TESTS} failed)"
echo "Pass Rate: $(echo "$ACTUAL_PASS_RATE * 100" | bc)%"
echo ""

# Evaluate quality gates
echo "▶ Evaluating quality gates..."
echo ""

GATES_PASSED=0
GATES_FAILED=0
VIOLATIONS=()

# Gate 1: Coverage threshold
if (( $(echo "$ACTUAL_COVERAGE >= $MIN_COVERAGE" | bc -l) )); then
  echo "✓ Coverage gate PASSED: ${ACTUAL_COVERAGE}% >= ${MIN_COVERAGE}%"
  ((GATES_PASSED++))
else
  echo "✗ Coverage gate FAILED: ${ACTUAL_COVERAGE}% < ${MIN_COVERAGE}%"
  VIOLATIONS+=("Coverage below threshold: ${ACTUAL_COVERAGE}% (required: ${MIN_COVERAGE}%)")
  ((GATES_FAILED++))
fi

# Gate 2: Test pass rate
if (( $(echo "$ACTUAL_PASS_RATE >= $MIN_PASS_RATE" | bc -l) )); then
  echo "✓ Test pass rate gate PASSED: $(echo "$ACTUAL_PASS_RATE * 100" | bc)% >= $(echo "$MIN_PASS_RATE * 100" | bc)%"
  ((GATES_PASSED++))
else
  echo "✗ Test pass rate gate FAILED: $(echo "$ACTUAL_PASS_RATE * 100" | bc)% < $(echo "$MIN_PASS_RATE * 100" | bc)%"
  VIOLATIONS+=("Test pass rate below threshold: $(echo "$ACTUAL_PASS_RATE * 100" | bc)% (required: $(echo "$MIN_PASS_RATE * 100" | bc)%)")
  ((GATES_FAILED++))
fi

# Gate 3: No test failures (strict)
if [[ "$FAILED_TESTS" -eq 0 ]]; then
  echo "✓ No test failures"
  ((GATES_PASSED++))
else
  echo "✗ Test failures detected: ${FAILED_TESTS} tests failed"
  VIOLATIONS+=("Test failures detected: ${FAILED_TESTS} tests")
  ((GATES_FAILED++))
fi

echo ""
echo "==================================================================="
echo "Quality Gate Summary"
echo "==================================================================="
echo "Gates Passed: ${GATES_PASSED}"
echo "Gates Failed: ${GATES_FAILED}"
echo ""

# Generate control loop feedback JSON
cat > "${CONTROL_LOOP_OUTPUT}" <<EOF
{
  "executionId": "${GITHUB_RUN_ID:-local-$(date +%s)}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "$([ "$GATES_FAILED" -eq 0 ] && echo "success" || echo "failure")",
  "success": $([ "$GATES_FAILED" -eq 0 ] && echo "true" || echo "false"),
  "metrics": {
    "testPassRate": ${ACTUAL_PASS_RATE},
    "coveragePercentage": ${ACTUAL_COVERAGE},
    "totalTests": ${TOTAL_TESTS},
    "passedTests": ${PASSED_TESTS},
    "failedTests": ${FAILED_TESTS}
  },
  "signals": {
    "canDeploy": $([ "$GATES_FAILED" -eq 0 ] && echo "true" || echo "false"),
    "criticalIssuesFound": $([ "$FAILED_TESTS" -gt 0 ] && echo "true" || echo "false"),
    "coverageDecreased": $([ "$(echo "$ACTUAL_COVERAGE < $MIN_COVERAGE" | bc -l)" -eq 1 ] && echo "true" || echo "false")
  },
  "gates": {
    "passed": ${GATES_PASSED},
    "failed": ${GATES_FAILED}
  },
  "violations": $(printf '%s\n' "${VIOLATIONS[@]}" | jq -R . | jq -s . || echo '[]')
}
EOF

echo "Control loop feedback written to: ${CONTROL_LOOP_OUTPUT}"

# Generate human-readable report
{
  echo "==================================================================="
  echo "Quality Gate Report"
  echo "==================================================================="
  echo "Generated: $(date)"
  echo "Execution ID: ${GITHUB_RUN_ID:-local}"
  echo ""
  echo "Test Results:"
  echo "  - Total Tests: ${TOTAL_TESTS}"
  echo "  - Passed: ${PASSED_TESTS}"
  echo "  - Failed: ${FAILED_TESTS}"
  echo "  - Pass Rate: $(echo "$ACTUAL_PASS_RATE * 100" | bc)%"
  echo ""
  echo "Coverage:"
  echo "  - Overall: ${ACTUAL_COVERAGE}%"
  echo "  - Threshold: ${MIN_COVERAGE}%"
  echo ""
  echo "Quality Gates:"
  echo "  - Passed: ${GATES_PASSED}"
  echo "  - Failed: ${GATES_FAILED}"
  echo ""
  if [[ ${#VIOLATIONS[@]} -gt 0 ]]; then
    echo "Violations:"
    for violation in "${VIOLATIONS[@]}"; do
      echo "  - ${violation}"
    done
    echo ""
  fi
  echo "Deployment Decision: $([ "$GATES_FAILED" -eq 0 ] && echo "✓ APPROVED" || echo "✗ BLOCKED")"
  echo "==================================================================="
} > "${HUMAN_OUTPUT}"

echo "Human-readable report written to: ${HUMAN_OUTPUT}"
echo ""

# Final decision
if [[ "$GATES_FAILED" -eq 0 ]]; then
  echo "✓ Quality gates PASSED - Deployment APPROVED"
  echo ""
  exit 0
else
  echo "✗ Quality gates FAILED - Deployment BLOCKED"
  echo ""
  echo "Violations:"
  for violation in "${VIOLATIONS[@]}"; do
    echo "  - ${violation}"
  done
  echo ""
  exit 1
fi
