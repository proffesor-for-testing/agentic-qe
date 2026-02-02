#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-chaos-resilience v1.0.0
# Validates chaos resilience skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance
# 2. Required chaos fields (experiments, failureScenarios, recoveryMetrics)
# 3. Experiment types and results validation
# 4. Recovery metrics ranges
# 5. Resilience score validation
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
  "$SKILL_DIR/../.validation/templates/validator-lib.sh" \
  "$SCRIPT_DIR/validator-lib.sh"; do
  if [[ -f "$lib_path" ]]; then
    VALIDATOR_LIB="$lib_path"
    break
  fi
done

if [[ -n "$VALIDATOR_LIB" ]]; then
  # shellcheck source=/dev/null
  source "$VALIDATOR_LIB"
else
  echo "ERROR: Validator library not found"
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="qe-chaos-resilience"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("chaos" "litmus" "kubectl" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.experiments" "output.resilienceScore")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("chaos" "resilience" "experiment")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")

ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

MIN_ARRAY_LENGTHS=(
  ".output.experiments:1"
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
    -h|--help)
      echo "Usage: $0 <output-file> [--self-test] [--verbose] [--json]"
      exit 0
      ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

# =============================================================================
# Self-Test Mode
# =============================================================================

if [[ "$SELF_TEST" == "true" ]]; then
  echo "=============================================="
  info "Running $SKILL_NAME Validator Self-Test"
  echo "=============================================="

  self_test_passed=true

  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Required tool available: $tool"
    else
      error "Required tool MISSING: $tool"
      self_test_passed=false
    fi
  done

  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema is valid JSON"
    else
      error "Schema is NOT valid JSON"
      self_test_passed=false
    fi
  else
    error "Schema file not found: $SCHEMA_PATH"
    self_test_passed=false
  fi

  if run_self_test 2>/dev/null; then
    success "Library self-test passed"
  else
    error "Library self-test FAILED"
    self_test_passed=false
  fi

  if [[ "$self_test_passed" == "true" ]]; then
    success "Self-test PASSED"
    exit 0
  else
    error "Self-test FAILED"
    exit 1
  fi
fi

# =============================================================================
# SKILL-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

validate_chaos_experiments() {
  local output_file="$1"

  local experiment_count
  experiment_count=$(json_count "$output_file" ".output.experiments" 2>/dev/null)

  if [[ -z "$experiment_count" ]] || [[ "$experiment_count" -lt 1 ]]; then
    error "No chaos experiments found"
    return 1
  fi

  debug "Found $experiment_count chaos experiments"

  # Validate first experiment structure
  local first_type first_result
  first_type=$(json_get "$output_file" ".output.experiments[0].type" 2>/dev/null)
  first_result=$(json_get "$output_file" ".output.experiments[0].result" 2>/dev/null)

  if [[ -n "$first_type" ]] && [[ "$first_type" != "null" ]]; then
    if ! validate_enum "$first_type" "network" "resource" "state" "application" "infrastructure" "byzantine"; then
      error "Invalid experiment type: $first_type"
      return 1
    fi
  fi

  if [[ -n "$first_result" ]] && [[ "$first_result" != "null" ]]; then
    if ! validate_enum "$first_result" "passed" "failed" "partial" "expected-fail"; then
      error "Invalid experiment result: $first_result"
      return 1
    fi
  fi

  return 0
}

validate_recovery_metrics() {
  local output_file="$1"

  local mttr availability
  mttr=$(json_get "$output_file" ".output.recoveryMetrics.mttr" 2>/dev/null)
  availability=$(json_get "$output_file" ".output.recoveryMetrics.availability" 2>/dev/null)

  if [[ -n "$mttr" ]] && [[ "$mttr" != "null" ]]; then
    if [[ "$mttr" -lt 0 ]]; then
      error "MTTR cannot be negative: $mttr"
      return 1
    fi
  fi

  if [[ -n "$availability" ]] && [[ "$availability" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$availability < 0 || $availability > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Availability out of range: $availability"
        return 1
      fi
    fi
  fi

  return 0
}

validate_resilience_score() {
  local output_file="$1"

  local score_value score_max
  score_value=$(json_get "$output_file" ".output.resilienceScore.value" 2>/dev/null)
  score_max=$(json_get "$output_file" ".output.resilienceScore.max" 2>/dev/null)

  if [[ -z "$score_value" ]] || [[ "$score_value" == "null" ]]; then
    error "Missing resilience score value"
    return 1
  fi

  if [[ -z "$score_max" ]] || [[ "$score_max" == "null" ]]; then
    error "Missing resilience score max"
    return 1
  fi

  debug "Resilience score: $score_value/$score_max"
  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running qe-chaos-resilience specific validations..."

  if ! validate_chaos_experiments "$output_file"; then
    has_errors=true
  else
    success "Chaos experiments validation passed"
  fi

  if ! validate_resilience_score "$output_file"; then
    has_errors=true
  else
    success "Resilience score validation passed"
  fi

  if ! validate_recovery_metrics "$output_file"; then
    has_errors=true
  else
    success "Recovery metrics validation passed"
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

# =============================================================================
# Standard Validation Functions
# =============================================================================

validate_tools() {
  local missing=()
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      missing+=("$tool")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required tools: ${missing[*]}"
    return 1
  fi
  return 0
}

validate_schema() {
  local output_file="$1"

  if [[ ! -f "$SCHEMA_PATH" ]]; then
    warn "Schema file not found: $SCHEMA_PATH"
    return 2
  fi

  local result
  result=$(validate_json_schema "$SCHEMA_PATH" "$output_file" 2>&1)
  local status=$?

  case $status in
    0) success "Schema validation passed"; return 0 ;;
    1) error "Schema validation failed"; return 1 ;;
    2) warn "Schema validation skipped"; return 2 ;;
  esac
}

validate_required_fields() {
  local output_file="$1"
  local missing=()

  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$output_file" ".$field" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
      missing+=("$field")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required fields: ${missing[*]}"
    return 1
  fi

  success "All required fields present"
  return 0
}

validate_content_terms() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")
  local has_errors=false

  local missing_terms=()
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    if ! grep -qi "$term" <<< "$content"; then
      missing_terms+=("$term")
    fi
  done

  if [[ ${#missing_terms[@]} -gt 0 ]]; then
    error "Output missing required terms: ${missing_terms[*]}"
    has_errors=true
  fi

  local found_forbidden=()
  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    if grep -qi "$term" <<< "$content"; then
      found_forbidden+=("$term")
    fi
  done

  if [[ ${#found_forbidden[@]} -gt 0 ]]; then
    error "Output contains forbidden terms: ${found_forbidden[*]}"
    has_errors=true
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Content term validation passed"
  return 0
}

# =============================================================================
# Main Validation Flow
# =============================================================================

main() {
  if [[ -z "$OUTPUT_FILE" ]]; then
    error "No output file specified"
    echo "Usage: $0 <output-file> [options]"
    exit 1
  fi

  if [[ ! -f "$OUTPUT_FILE" ]]; then
    error "Output file not found: $OUTPUT_FILE"
    exit 1
  fi

  [[ "$JSON_ONLY" != "true" ]] && info "Validating $SKILL_NAME Output"

  local error_count=0

  if ! validate_tools; then
    exit $EXIT_SKIP
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    error "Invalid JSON"
    exit $EXIT_FAIL
  fi

  validate_schema "$OUTPUT_FILE" || ((error_count++)) || true
  validate_required_fields "$OUTPUT_FILE" || ((error_count++)) || true
  validate_content_terms "$OUTPUT_FILE" || ((error_count++)) || true
  validate_skill_specific "$OUTPUT_FILE" || ((error_count++)) || true

  if [[ $error_count -gt 0 ]]; then
    error "Validation FAILED with $error_count error(s)"
    exit $EXIT_FAIL
  fi

  success "Validation PASSED"
  exit $EXIT_PASS
}

main
