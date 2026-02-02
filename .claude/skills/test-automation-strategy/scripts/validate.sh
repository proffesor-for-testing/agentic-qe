#!/bin/bash
# =============================================================================
# AQE Skill Validator: test-automation-strategy v1.0.0
# Validates test automation strategy analysis output
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
  source "$VALIDATOR_LIB"
else
  echo "ERROR: Validator library not found" >&2
  exit 1
fi

SKILL_NAME="test-automation-strategy"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("ajv" "jsonschema" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("strategy" "automation" "test")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

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
AQE Test Automation Strategy Skill Validator v1.0.0

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]
       ./validate.sh --list-tools

Exit Codes:
  0 - Validation passed
  1 - Validation failed
  2 - Validation skipped

HELP_EOF
      exit 0
      ;;
    -*)
      error "Unknown option: $1"
      exit 1
      ;;
    *)
      OUTPUT_FILE="$1"
      shift
      ;;
  esac
done

if [[ "$LIST_TOOLS" == "true" ]]; then
  echo "Available Validation Tools for $SKILL_NAME"
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
  echo "Running $SKILL_NAME Validator Self-Test"
  self_test_passed=true

  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Required tool: $tool"
    else
      error "Missing required tool: $tool"
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
    error "Schema file not found"
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

validate_skill_specific() {
  local output_file="$1"
  debug "Running skill-specific validations..."

  local has_strategies
  has_strategies=$(json_get "$output_file" ".output.strategies" 2>/dev/null)

  if [[ -z "$has_strategies" ]] || [[ "$has_strategies" == "null" ]]; then
    warn "No strategies found in output"
  fi

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

  [[ "$JSON_ONLY" != "true" ]] && echo "Validating $SKILL_NAME Output"

  local overall_status="passed"

  if ! validate_tools; then
    exit $EXIT_SKIP
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    overall_status="failed"
  fi

  if ! validate_schema "$OUTPUT_FILE" 2>/dev/null; then
    overall_status="failed"
  fi

  if ! validate_required_fields "$OUTPUT_FILE"; then
    overall_status="failed"
  fi

  if ! validate_enum_fields "$OUTPUT_FILE"; then
    overall_status="failed"
  fi

  if ! validate_content_terms "$OUTPUT_FILE"; then
    overall_status="failed"
  fi

  if ! validate_skill_specific "$OUTPUT_FILE"; then
    overall_status="failed"
  fi

  if [[ "$overall_status" == "passed" ]]; then
    [[ "$JSON_ONLY" != "true" ]] && success "Validation PASSED"
    exit $EXIT_PASS
  else
    [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED"
    exit $EXIT_FAIL
  fi
}

main
