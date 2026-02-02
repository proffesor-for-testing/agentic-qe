#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-requirements-validation v1.0.0
# Validates requirements validation skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (requirements, traceability, coverage)
# 2. Requirements structure and INVEST scoring
# 3. Traceability matrix completeness
# 4. Testability assessment principles
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

SKILL_NAME="qe-requirements-validation"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.requirements" "output.traceability")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("requirement" "traceability")
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

validate_requirements_structure() {
  local output_file="$1"

  local total
  total=$(json_get "$output_file" ".output.requirements.total" 2>/dev/null)

  if [[ -z "$total" ]] || [[ "$total" == "null" ]]; then
    warn "Missing requirements.total"
  else
    debug "Total requirements: $total"
  fi

  # Check requirement items if present
  local items_count
  items_count=$(json_count "$output_file" ".output.requirements.items" 2>/dev/null)

  if [[ -n "$items_count" ]] && [[ "$items_count" -gt 0 ]]; then
    # Validate first item structure
    local first_id first_status
    first_id=$(json_get "$output_file" ".output.requirements.items[0].id" 2>/dev/null)
    first_status=$(json_get "$output_file" ".output.requirements.items[0].status" 2>/dev/null)

    if [[ -n "$first_status" ]] && [[ "$first_status" != "null" ]]; then
      if ! validate_enum "$first_status" "valid" "incomplete" "ambiguous" "untestable" "duplicate"; then
        warn "Invalid requirement status: $first_status"
      fi
    fi

    debug "Found $items_count requirement items"
  fi

  success "Requirements structure validation passed"
  return 0
}

validate_traceability() {
  local output_file="$1"

  local completeness
  completeness=$(json_get "$output_file" ".output.traceability.completeness" 2>/dev/null)

  if [[ -z "$completeness" ]] || [[ "$completeness" == "null" ]]; then
    error "Missing traceability completeness"
    return 1
  fi

  # Check range
  if (( $(echo "$completeness < 0 || $completeness > 100" | bc -l 2>/dev/null || echo "0") )); then
    error "Traceability completeness out of range: $completeness"
    return 1
  fi

  debug "Traceability completeness: $completeness%"
  success "Traceability validation passed"
  return 0
}

validate_testability() {
  local output_file="$1"

  local score
  score=$(json_get "$output_file" ".output.testability.score" 2>/dev/null)

  if [[ -n "$score" ]] && [[ "$score" != "null" ]]; then
    if (( $(echo "$score < 0 || $score > 100" | bc -l 2>/dev/null || echo "0") )); then
      error "Testability score out of range: $score"
      return 1
    fi

    debug "Testability score: $score"

    # Check principles if present
    local principles_count
    principles_count=$(json_count "$output_file" ".output.testability.principles" 2>/dev/null)
    if [[ -n "$principles_count" ]] && [[ "$principles_count" -gt 0 ]]; then
      debug "Found $principles_count testability principles"
    fi
  fi

  success "Testability validation passed"
  return 0
}

validate_coverage() {
  local output_file="$1"

  local percentage
  percentage=$(json_get "$output_file" ".output.coverage.percentage" 2>/dev/null)

  if [[ -n "$percentage" ]] && [[ "$percentage" != "null" ]]; then
    if (( $(echo "$percentage < 0 || $percentage > 100" | bc -l 2>/dev/null || echo "0") )); then
      warn "Coverage percentage out of range: $percentage"
    else
      debug "Requirements coverage: $percentage%"
    fi
  fi

  success "Coverage validation passed"
  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running requirements-validation specific validations..."

  validate_requirements_structure "$output_file" || has_errors=true
  validate_traceability "$output_file" || has_errors=true
  validate_testability "$output_file" || has_errors=true
  validate_coverage "$output_file" || has_errors=true

  # Check for gaps
  local gaps_count
  gaps_count=$(json_count "$output_file" ".output.gaps" 2>/dev/null)
  if [[ -n "$gaps_count" ]] && [[ "$gaps_count" -gt 0 ]]; then
    debug "Found $gaps_count requirement gaps"
  fi

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

  # Schema validation
  [[ -f "$SCHEMA_PATH" ]] && { validate_json_schema "$SCHEMA_PATH" "$OUTPUT_FILE" || ((error_count++)) || true; }

  # Required fields
  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$OUTPUT_FILE" ".$field" 2>/dev/null)
    [[ -z "$value" ]] || [[ "$value" == "null" ]] && { error "Missing: $field"; ((error_count++)) || true; }
  done

  # Content checks
  local content
  content=$(cat "$OUTPUT_FILE")
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    grep -qi "$term" <<< "$content" || { error "Missing term: $term"; ((error_count++)) || true; }
  done

  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    grep -qi "$term" <<< "$content" && { error "Forbidden: $term"; ((error_count++)) || true; }
  done

  validate_skill_specific "$OUTPUT_FILE" || ((error_count++)) || true

  [[ $error_count -gt 0 ]] && { [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED ($error_count errors)"; exit $EXIT_FAIL; }

  [[ "$JSON_ONLY" != "true" ]] && success "Validation PASSED"
  exit $EXIT_PASS
}

main
