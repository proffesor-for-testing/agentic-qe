#!/bin/bash
# =============================================================================
# AQE Skill Validator: quality-metrics v1.0.0
# Validates quality metrics skill output per ADR-056
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

SKILL_NAME="quality-metrics"
SKILL_VERSION="1.0.0"

REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("ajv" "jsonschema" "python3")

SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.doraMetrics" "output.qualityGates" "output.findings" "output.recommendations")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

MUST_CONTAIN_TERMS=("metric" "DORA")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

# =============================================================================
# Argument Parsing
# =============================================================================

OUTPUT_FILE=""
SELF_TEST=false
VERBOSE=false
JSON_ONLY=false
LIST_TOOLS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) VERBOSE=true; export AQE_DEBUG=1; shift ;;
    --json) JSON_ONLY=true; shift ;;
    --list-tools) LIST_TOOLS=true; shift ;;
    -h|--help)
      echo "AQE Quality Metrics Validator v1.0.0"
      echo "Usage: ./validate.sh <output-file> [options]"
      exit 0
      ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

if [[ "$LIST_TOOLS" == "true" ]]; then
  echo "Required: ${REQUIRED_TOOLS[*]}"
  echo "Optional: ${OPTIONAL_TOOLS[*]}"
  exit 0
fi

# =============================================================================
# Self-Test Mode
# =============================================================================

if [[ "$SELF_TEST" == "true" ]]; then
  info "Running $SKILL_NAME Validator Self-Test"
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
      if grep -q "doraMetrics" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes DORA metrics definition"
      fi
    else
      error "Schema is NOT valid JSON"
      self_test_passed=false
    fi
  else
    error "Schema file not found"
    self_test_passed=false
  fi

  if run_self_test 2>/dev/null; then
    success "Library self-test passed"
  else
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

validate_dora_metrics() {
  local output_file="$1"

  local dora_data
  dora_data=$(json_get "$output_file" ".output.doraMetrics" 2>/dev/null)

  if [[ -z "$dora_data" ]] || [[ "$dora_data" == "null" ]]; then
    error "Missing doraMetrics in output"
    return 1
  fi

  # Check all four DORA metrics
  local metrics=("deploymentFrequency" "leadTime" "changeFailureRate" "mttr")
  for metric in "${metrics[@]}"; do
    local metric_data
    metric_data=$(json_get "$output_file" ".output.doraMetrics.$metric" 2>/dev/null)
    if [[ -z "$metric_data" ]] || [[ "$metric_data" == "null" ]]; then
      error "Missing '$metric' in DORA metrics"
      return 1
    fi

    # Check for value
    local value
    value=$(json_get "$output_file" ".output.doraMetrics.$metric.value" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
      warn "Missing value for DORA metric: $metric"
    fi

    # Check for level classification
    local level
    level=$(json_get "$output_file" ".output.doraMetrics.$metric.level" 2>/dev/null)
    if [[ -n "$level" ]] && [[ "$level" != "null" ]]; then
      if ! validate_enum "$level" "elite" "high" "medium" "low"; then
        error "Invalid DORA level for $metric: $level"
        return 1
      fi
    fi
  done

  debug "DORA metrics structure validated"
  return 0
}

validate_quality_gates() {
  local output_file="$1"

  local gates_data
  gates_data=$(json_get "$output_file" ".output.qualityGates" 2>/dev/null)

  if [[ -z "$gates_data" ]] || [[ "$gates_data" == "null" ]]; then
    error "Missing qualityGates in output"
    return 1
  fi

  # Check overall status if present
  local overall_status
  overall_status=$(json_get "$output_file" ".output.qualityGates.overallStatus" 2>/dev/null)
  if [[ -n "$overall_status" ]] && [[ "$overall_status" != "null" ]]; then
    if ! validate_enum "$overall_status" "passing" "failing" "warning"; then
      error "Invalid quality gates status: $overall_status"
      return 1
    fi
  fi

  debug "Quality gates structure validated"
  return 0
}

validate_metrics_ranges() {
  local output_file="$1"

  # Validate change failure rate is percentage
  local cfr
  cfr=$(json_get "$output_file" ".output.doraMetrics.changeFailureRate.value" 2>/dev/null)
  if [[ -n "$cfr" ]] && [[ "$cfr" != "null" ]]; then
    if (( $(echo "$cfr < 0 || $cfr > 100" | bc -l 2>/dev/null || echo "0") )); then
      error "Invalid change failure rate: $cfr (must be 0-100)"
      return 1
    fi
  fi

  return 0
}

validate_no_vanity_metrics() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")

  # Warn if output focuses on vanity metrics without meaningful ones
  local has_meaningful=false
  for term in "escape rate" "MTTD" "MTTR" "change failure"; do
    if grep -qi "$term" <<< "$content"; then
      has_meaningful=true
      break
    fi
  done

  if [[ "$has_meaningful" == "false" ]]; then
    warn "Consider including outcome metrics (bug escape rate, MTTD, MTTR) not just activity metrics"
  fi

  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running quality-metrics specific validations..."

  if ! validate_dora_metrics "$output_file"; then
    has_errors=true
  else
    success "DORA metrics validation passed"
  fi

  if ! validate_quality_gates "$output_file"; then
    has_errors=true
  else
    success "Quality gates validation passed"
  fi

  if ! validate_metrics_ranges "$output_file"; then
    has_errors=true
  else
    success "Metrics ranges validation passed"
  fi

  if ! validate_no_vanity_metrics "$output_file"; then
    has_errors=true
  else
    success "Vanity metrics check passed"
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
    warn "Schema file not found"
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

validate_enum_fields() {
  local output_file="$1"

  for validation in "${ENUM_VALIDATIONS[@]}"; do
    local field_path="${validation%%:*}"
    local allowed_values="${validation#*:}"

    local actual_value
    actual_value=$(json_get "$output_file" "$field_path" 2>/dev/null)

    if [[ -z "$actual_value" ]] || [[ "$actual_value" == "null" ]]; then
      continue
    fi

    local found=false
    IFS=',' read -ra allowed_array <<< "$allowed_values"
    for allowed in "${allowed_array[@]}"; do
      if [[ "$actual_value" == "$allowed" ]]; then
        found=true
        break
      fi
    done

    if [[ "$found" == "false" ]]; then
      error "Invalid value for $field_path: '$actual_value'"
      return 1
    fi
  done

  success "All enum fields valid"
  return 0
}

validate_content_terms() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")
  local has_errors=false

  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    if ! grep -qi "$term" <<< "$content"; then
      error "Missing required term: $term"
      has_errors=true
    fi
  done

  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    if grep -qi "$term" <<< "$content"; then
      error "Found forbidden term: $term"
      has_errors=true
    fi
  done

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Content terms valid"
  return 0
}

# =============================================================================
# Main
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

  [[ "$JSON_ONLY" != "true" ]] && info "Validating $SKILL_NAME Output"

  local error_count=0

  validate_tools || exit $EXIT_SKIP
  validate_json "$OUTPUT_FILE" || exit $EXIT_FAIL

  validate_schema "$OUTPUT_FILE" || ((error_count++)) || true
  validate_required_fields "$OUTPUT_FILE" || ((error_count++)) || true
  validate_enum_fields "$OUTPUT_FILE" || ((error_count++)) || true
  validate_content_terms "$OUTPUT_FILE" || ((error_count++)) || true
  validate_skill_specific "$OUTPUT_FILE" || ((error_count++)) || true

  if [[ $error_count -gt 0 ]]; then
    error "Validation FAILED with $error_count errors"
    exit $EXIT_FAIL
  fi

  success "Validation PASSED"
  exit $EXIT_PASS
}

main
