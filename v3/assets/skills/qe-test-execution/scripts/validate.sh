#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-test-execution v1.0.0
# Validates test execution skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (results, parallelization, retries, metrics)
# 2. Test result structure and counts
# 3. Retry configuration and outcomes
# 4. Execution metrics validity
#
# Usage: ./validate.sh <output-file> [options]
#
# Exit Codes:
#   0 - Validation passed
#   1 - Validation failed
#   2 - Validation skipped (missing required tools)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source validator library
VALIDATOR_LIB=""
for lib_path in \
  "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" \
  "$SKILL_DIR/scripts/validator-lib.sh"; do
  if [[ -f "$lib_path" ]]; then
    VALIDATOR_LIB="$lib_path"
    break
  fi
done

if [[ -n "$VALIDATOR_LIB" ]]; then
  source "$VALIDATOR_LIB"
else
  echo "ERROR: Validator library not found"
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="qe-test-execution"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.results" "output.metrics")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("test" "execution")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

# =============================================================================
# Argument Parsing
# =============================================================================

OUTPUT_FILE=""
SELF_TEST=false
VERBOSE=false
JSON_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) VERBOSE=true; export AQE_DEBUG=1; shift ;;
    --json) JSON_ONLY=true; shift ;;
    -h|--help) echo "Usage: $0 <output-file> [--self-test] [--verbose] [--json]"; exit 0 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

# =============================================================================
# Self-Test Mode
# =============================================================================

if [[ "$SELF_TEST" == "true" ]]; then
  info "Running $SKILL_NAME Validator Self-Test"
  self_test_passed=true

  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" && success "Tool: $tool" || { error "Missing: $tool"; self_test_passed=false; }
  done

  [[ -f "$SCHEMA_PATH" ]] && validate_json "$SCHEMA_PATH" 2>/dev/null && success "Schema valid" || self_test_passed=false
  run_self_test 2>/dev/null && success "Library OK" || self_test_passed=false

  [[ "$self_test_passed" == "true" ]] && { success "Self-test PASSED"; exit 0; } || { error "Self-test FAILED"; exit 1; }
fi

# =============================================================================
# SKILL-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

validate_execution_results() {
  local output_file="$1"

  # Check required result fields
  local total passed failed
  total=$(json_get "$output_file" ".output.results.total" 2>/dev/null)
  passed=$(json_get "$output_file" ".output.results.passed" 2>/dev/null)
  failed=$(json_get "$output_file" ".output.results.failed" 2>/dev/null)

  if [[ -z "$total" ]] || [[ "$total" == "null" ]]; then
    error "Missing results.total"
    return 1
  fi

  if [[ -z "$passed" ]] || [[ "$passed" == "null" ]]; then
    error "Missing results.passed"
    return 1
  fi

  if [[ -z "$failed" ]] || [[ "$failed" == "null" ]]; then
    error "Missing results.failed"
    return 1
  fi

  debug "Results: Total=$total, Passed=$passed, Failed=$failed"

  # Validate counts are non-negative
  if [[ "$total" -lt 0 ]] || [[ "$passed" -lt 0 ]] || [[ "$failed" -lt 0 ]]; then
    error "Result counts cannot be negative"
    return 1
  fi

  # Check result status if present
  local status
  status=$(json_get "$output_file" ".output.results.status" 2>/dev/null)
  if [[ -n "$status" ]] && [[ "$status" != "null" ]]; then
    if ! validate_enum "$status" "pass" "fail" "partial"; then
      error "Invalid results status: $status"
      return 1
    fi
  fi

  success "Execution results validation passed"
  return 0
}

validate_parallelization() {
  local output_file="$1"

  local enabled
  enabled=$(json_get "$output_file" ".output.parallelization.enabled" 2>/dev/null)

  if [[ -n "$enabled" ]] && [[ "$enabled" != "null" ]]; then
    debug "Parallelization enabled: $enabled"

    local workers
    workers=$(json_get "$output_file" ".output.parallelization.workers" 2>/dev/null)
    if [[ -n "$workers" ]] && [[ "$workers" != "null" ]]; then
      if [[ "$workers" -lt 1 ]] || [[ "$workers" -gt 64 ]]; then
        warn "Unusual worker count: $workers"
      fi
      debug "Workers: $workers"
    fi

    local strategy
    strategy=$(json_get "$output_file" ".output.parallelization.strategy" 2>/dev/null)
    if [[ -n "$strategy" ]] && [[ "$strategy" != "null" ]]; then
      if ! validate_enum "$strategy" "by-file" "by-test" "by-duration" "by-shard"; then
        warn "Unknown parallelization strategy: $strategy"
      fi
    fi
  fi

  success "Parallelization validation passed"
  return 0
}

validate_retries() {
  local output_file="$1"

  local enabled
  enabled=$(json_get "$output_file" ".output.retries.enabled" 2>/dev/null)

  if [[ -n "$enabled" ]] && [[ "$enabled" != "null" ]]; then
    debug "Retries enabled: $enabled"

    local max_retries
    max_retries=$(json_get "$output_file" ".output.retries.maxRetries" 2>/dev/null)
    if [[ -n "$max_retries" ]] && [[ "$max_retries" != "null" ]]; then
      if [[ "$max_retries" -lt 0 ]] || [[ "$max_retries" -gt 10 ]]; then
        warn "Unusual maxRetries: $max_retries"
      fi
      debug "Max retries: $max_retries"
    fi

    local tests_retried
    tests_retried=$(json_get "$output_file" ".output.retries.testsRetried" 2>/dev/null)
    if [[ -n "$tests_retried" ]] && [[ "$tests_retried" != "null" ]]; then
      debug "Tests retried: $tests_retried"
    fi
  fi

  success "Retries validation passed"
  return 0
}

validate_metrics() {
  local output_file="$1"

  local duration
  duration=$(json_get "$output_file" ".output.metrics.totalDuration" 2>/dev/null)

  if [[ -z "$duration" ]] || [[ "$duration" == "null" ]]; then
    error "Missing metrics.totalDuration"
    return 1
  fi

  if [[ "$duration" -lt 0 ]]; then
    error "Duration cannot be negative"
    return 1
  fi

  debug "Total duration: ${duration}ms"

  # Check for flaky tests if present
  local flaky_count
  flaky_count=$(json_count "$output_file" ".output.flakyTests" 2>/dev/null)
  if [[ -n "$flaky_count" ]] && [[ "$flaky_count" -gt 0 ]]; then
    debug "Found $flaky_count flaky tests"
  fi

  success "Metrics validation passed"
  return 0
}

validate_failures() {
  local output_file="$1"

  local failures_count
  failures_count=$(json_count "$output_file" ".output.failures" 2>/dev/null)

  if [[ -n "$failures_count" ]] && [[ "$failures_count" -gt 0 ]]; then
    # Validate first failure structure
    local first_name first_error
    first_name=$(json_get "$output_file" ".output.failures[0].name" 2>/dev/null)
    first_error=$(json_get "$output_file" ".output.failures[0].error" 2>/dev/null)

    if [[ -z "$first_error" ]] || [[ "$first_error" == "null" ]]; then
      warn "Failure missing error message"
    fi

    debug "Found $failures_count test failures"
  fi

  success "Failures validation passed"
  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running test-execution specific validations..."

  validate_execution_results "$output_file" || has_errors=true
  validate_parallelization "$output_file" || has_errors=true
  validate_retries "$output_file" || has_errors=true
  validate_metrics "$output_file" || has_errors=true
  validate_failures "$output_file" || has_errors=true

  [[ "$has_errors" == "true" ]] && return 1
  return 0
}

# =============================================================================
# Main Validation Flow
# =============================================================================

main() {
  [[ -z "$OUTPUT_FILE" ]] && { error "No output file specified"; exit 1; }
  [[ ! -f "$OUTPUT_FILE" ]] && { error "File not found: $OUTPUT_FILE"; exit 1; }

  [[ "$JSON_ONLY" != "true" ]] && info "Validating $SKILL_NAME Output"

  local error_count=0

  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" || { error "Missing: $tool"; exit $EXIT_SKIP; }
  done

  validate_json "$OUTPUT_FILE" || { error "Invalid JSON"; exit $EXIT_FAIL; }
  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid"

  [[ -f "$SCHEMA_PATH" ]] && { validate_json_schema "$SCHEMA_PATH" "$OUTPUT_FILE" || ((error_count++)) || true; }

  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$OUTPUT_FILE" ".$field" 2>/dev/null)
    [[ -z "$value" ]] || [[ "$value" == "null" ]] && { error "Missing: $field"; ((error_count++)) || true; }
  done

  local content
  content=$(cat "$OUTPUT_FILE")
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    grep -qi "$term" <<< "$content" || { error "Missing term: $term"; ((error_count++)) || true; }
  done

  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    grep -qi "$term" <<< "$content" && { error "Forbidden: $term"; ((error_count++)) || true; }
  done

  validate_skill_specific "$OUTPUT_FILE" || ((error_count++)) || true

  [[ $error_count -gt 0 ]] && { [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED"; exit $EXIT_FAIL; }

  [[ "$JSON_ONLY" != "true" ]] && success "Validation PASSED"
  exit $EXIT_PASS
}

main
