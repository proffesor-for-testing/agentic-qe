#!/bin/bash
# =============================================================================
# AQE Skill Validator: cicd-pipeline-qe-orchestrator v1.0.0
# Validates CI/CD quality orchestration output per ADR-056
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

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

SKILL_NAME="cicd-pipeline-qe-orchestrator"
SKILL_VERSION="1.0.0"

REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("npm" "docker" "python3")

SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.orchestrationPlan")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

MUST_CONTAIN_TERMS=("CI/CD" "pipeline" "test" "quality")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

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
      cat << 'HELP_EOF'
AQE cicd-pipeline-qe-orchestrator Skill Validator v1.0.0

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]

Options:
  --self-test       Run validator self-test mode
  --verbose, -v     Enable verbose/debug output
  --json            Output results as JSON only
  --list-tools      Show available validation tools
  --help, -h        Show this help message

HELP_EOF
      exit 0
      ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

if [[ "$LIST_TOOLS" == "true" ]]; then
  echo "Available tools for $SKILL_NAME:"
  for tool in "${REQUIRED_TOOLS[@]}" "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
    else
      echo "  [MISSING] $tool"
    fi
  done
  exit 0
fi

if [[ "$SELF_TEST" == "true" ]]; then
  echo "Running $SKILL_NAME validator self-test..."
  self_test_passed=true

  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      error "Required tool missing: $tool"
      self_test_passed=false
    fi
  done

  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists"
  else
    error "Schema file not found: $SCHEMA_PATH"
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

validate_orchestration_plan() {
  local output_file="$1"
  local plan_data
  plan_data=$(json_get "$output_file" ".output.orchestrationPlan" 2>/dev/null)

  if [[ -z "$plan_data" ]] || [[ "$plan_data" == "null" ]]; then
    warn "Missing orchestration plan in output"
    return 1
  fi

  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running CI/CD orchestration specific validations..."

  if ! validate_orchestration_plan "$output_file"; then
    has_errors=true
  else
    success "Orchestration plan validation passed"
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

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

validate_enum_fields() {
  local output_file="$1"

  for validation in "${ENUM_VALIDATIONS[@]}"; do
    local field_path="${validation%%:*}"
    local allowed_values="${validation#*:}"
    local actual_value
    actual_value=$(json_get "$output_file" "$field_path" 2>/dev/null)

    if [[ -n "$actual_value" ]] && [[ "$actual_value" != "null" ]]; then
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
    fi
  done

  success "All enum fields valid"
  return 0
}

validate_content_terms() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")

  local missing_terms=()
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    if ! grep -qi "$term" <<< "$content"; then
      missing_terms+=("$term")
    fi
  done

  if [[ ${#missing_terms[@]} -gt 0 ]]; then
    error "Output missing required terms: ${missing_terms[*]}"
    return 1
  fi

  success "All required terms found"
  return 0
}

main() {
  if [[ -z "$OUTPUT_FILE" ]]; then
    error "No output file specified"
    exit 1
  fi

  if [[ ! -f "$OUTPUT_FILE" ]]; then
    error "Output file not found: $OUTPUT_FILE"
    exit 1
  fi

  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "Validating $SKILL_NAME output..."
  fi

  local overall_status="passed"

  if ! validate_tools; then
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "skipped" "skipped" "failed"
    fi
    exit $EXIT_SKIP
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "failed" "failed" "passed"
    fi
    exit $EXIT_FAIL
  fi

  validate_schema "$OUTPUT_FILE" || true
  validate_required_fields "$OUTPUT_FILE" || overall_status="failed"
  validate_enum_fields "$OUTPUT_FILE" || overall_status="failed"
  validate_content_terms "$OUTPUT_FILE" || overall_status="failed"
  validate_skill_specific "$OUTPUT_FILE" || overall_status="failed"

  if [[ "$JSON_ONLY" == "true" ]]; then
    output_validation_report "$SKILL_NAME" "passed" "$overall_status" "passed"
  fi

  if [[ "$overall_status" == "passed" ]]; then
    exit $EXIT_PASS
  else
    exit $EXIT_FAIL
  fi
}

main
