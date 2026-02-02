#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-quality-assessment v1.0.0
# Validates quality assessment skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (quality gates, scores, trends, risk assessment)
# 2. Quality gate structure and thresholds
# 3. Score calculations and grade consistency
# 4. Deployment readiness criteria
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
  "$SKILL_DIR/scripts/validator-lib.sh" \
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

SKILL_NAME="qe-quality-assessment"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("ajv" "jsonschema" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Content validation
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.qualityGates" "output.scores")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("quality" "score" "gate")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
  ".output.qualityGates.overallStatus:pass,fail,warn"
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

  # Check tools
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Required tool available: $tool"
    else
      error "Required tool MISSING: $tool"
      self_test_passed=false
    fi
  done

  # Check schema
  if [[ -f "$SCHEMA_PATH" ]] && validate_json "$SCHEMA_PATH" 2>/dev/null; then
    success "Schema file valid"
  else
    error "Schema file invalid or missing"
    self_test_passed=false
  fi

  # Library self-test
  if run_self_test 2>/dev/null; then
    success "Library self-test passed"
  else
    error "Library self-test FAILED"
    self_test_passed=false
  fi

  [[ "$self_test_passed" == "true" ]] && { success "Self-test PASSED"; exit 0; } || { error "Self-test FAILED"; exit 1; }
fi

# =============================================================================
# SKILL-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

validate_quality_gates() {
  local output_file="$1"

  # Check gates array exists
  local gates_count
  gates_count=$(json_count "$output_file" ".output.qualityGates.gates" 2>/dev/null)

  if [[ -z "$gates_count" ]] || [[ "$gates_count" -lt 1 ]]; then
    error "Quality gates array is empty or missing"
    return 1
  fi

  debug "Found $gates_count quality gates"

  # Validate first gate structure
  local first_name first_status first_value
  first_name=$(json_get "$output_file" ".output.qualityGates.gates[0].name" 2>/dev/null)
  first_status=$(json_get "$output_file" ".output.qualityGates.gates[0].status" 2>/dev/null)
  first_value=$(json_get "$output_file" ".output.qualityGates.gates[0].value" 2>/dev/null)

  if [[ -z "$first_name" ]] || [[ "$first_name" == "null" ]]; then
    error "Gate missing 'name' field"
    return 1
  fi

  if [[ -n "$first_status" ]] && ! validate_enum "$first_status" "pass" "fail" "warn" "skip"; then
    error "Invalid gate status: $first_status"
    return 1
  fi

  success "Quality gates structure valid"
  return 0
}

validate_scores() {
  local output_file="$1"

  # Check overall score exists
  local overall_value
  overall_value=$(json_get "$output_file" ".output.scores.overall.value" 2>/dev/null)

  if [[ -z "$overall_value" ]] || [[ "$overall_value" == "null" ]]; then
    error "Missing overall score"
    return 1
  fi

  # Validate score range
  if (( $(echo "$overall_value < 0 || $overall_value > 100" | bc -l 2>/dev/null || echo "0") )); then
    error "Overall score out of range: $overall_value"
    return 1
  fi

  debug "Overall score: $overall_value"

  # Check grade consistency if present
  local grade
  grade=$(json_get "$output_file" ".output.scores.overall.grade" 2>/dev/null)
  if [[ -n "$grade" ]] && [[ "$grade" != "null" ]]; then
    if ! [[ "$grade" =~ ^[A-F][+-]?$ ]]; then
      error "Invalid grade format: $grade"
      return 1
    fi
  fi

  success "Scores validation passed"
  return 0
}

validate_deployment_readiness() {
  local output_file="$1"

  local deployment_status
  deployment_status=$(json_get "$output_file" ".output.deploymentReadiness.status" 2>/dev/null)

  if [[ -n "$deployment_status" ]] && [[ "$deployment_status" != "null" ]]; then
    if ! validate_enum "$deployment_status" "go" "conditional" "no-go"; then
      error "Invalid deployment status: $deployment_status"
      return 1
    fi
    debug "Deployment status: $deployment_status"
  fi

  success "Deployment readiness validation passed"
  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running quality-assessment specific validations..."

  if ! validate_quality_gates "$output_file"; then
    has_errors=true
  fi

  if ! validate_scores "$output_file"; then
    has_errors=true
  fi

  if ! validate_deployment_readiness "$output_file"; then
    has_errors=true
  fi

  # Check for risk assessment if present
  local risk_level
  risk_level=$(json_get "$output_file" ".output.riskAssessment.level" 2>/dev/null)
  if [[ -n "$risk_level" ]] && [[ "$risk_level" != "null" ]]; then
    if ! validate_enum "$risk_level" "critical" "high" "medium" "low" "minimal"; then
      warn "Invalid risk level: $risk_level"
    else
      debug "Risk level: $risk_level"
    fi
  fi

  [[ "$has_errors" == "true" ]] && return 1
  return 0
}

# =============================================================================
# Main Validation Flow
# =============================================================================

main() {
  if [[ -z "$OUTPUT_FILE" ]]; then
    error "No output file specified"
    exit 1
  fi

  if [[ ! -f "$OUTPUT_FILE" ]]; then
    error "Output file not found: $OUTPUT_FILE"
    exit 1
  fi

  [[ "$JSON_ONLY" != "true" ]] && {
    echo "=============================================="
    info "Validating $SKILL_NAME Output"
    echo "=============================================="
  }

  local error_count=0

  # Check tools
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      error "Missing required tool: $tool"
      exit $EXIT_SKIP
    fi
  done

  # Validate JSON syntax
  if ! validate_json "$OUTPUT_FILE"; then
    error "Invalid JSON"
    exit $EXIT_FAIL
  fi
  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid"

  # Schema validation
  if [[ -f "$SCHEMA_PATH" ]]; then
    validate_json_schema "$SCHEMA_PATH" "$OUTPUT_FILE" && \
      { [[ "$JSON_ONLY" != "true" ]] && success "Schema validation passed"; } || \
      { ((error_count++)) || true; }
  fi

  # Required fields
  local missing=()
  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$OUTPUT_FILE" ".$field" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
      missing+=("$field")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required fields: ${missing[*]}"
    ((error_count++)) || true
  else
    [[ "$JSON_ONLY" != "true" ]] && success "All required fields present"
  fi

  # Content terms
  local content
  content=$(cat "$OUTPUT_FILE")
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    if ! grep -qi "$term" <<< "$content"; then
      error "Missing required term: $term"
      ((error_count++)) || true
    fi
  done

  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    if grep -qi "$term" <<< "$content"; then
      error "Found forbidden term: $term"
      ((error_count++)) || true
    fi
  done

  # Skill-specific validation
  if ! validate_skill_specific "$OUTPUT_FILE"; then
    ((error_count++)) || true
  fi

  # Result
  [[ "$JSON_ONLY" != "true" ]] && {
    echo "=============================================="
    echo "  Errors: $error_count"
    echo "=============================================="
  }

  if [[ $error_count -gt 0 ]]; then
    [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED"
    exit $EXIT_FAIL
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "Validation PASSED"
  exit $EXIT_PASS
}

main
