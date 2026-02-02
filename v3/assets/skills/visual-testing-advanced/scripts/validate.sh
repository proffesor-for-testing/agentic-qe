#!/bin/bash
# =============================================================================
# AQE Skill Validator: visual-testing-advanced v1.0.0
# Validates advanced visual testing output
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

VALIDATOR_LIB=""
for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && VALIDATOR_LIB="$lib_path" && break
done

[[ -n "$VALIDATOR_LIB" ]] && source "$VALIDATOR_LIB" || exit 1

SKILL_NAME="visual-testing-advanced"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("imagemagick" "playwright" "ajv" "jsonschema" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output")
MUST_CONTAIN_TERMS=("visual" "test" "diff")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

OUTPUT_FILE=""
SELF_TEST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) export AQE_DEBUG=1; shift ;;
    --json|--list-tools|--help|-h) shift ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

if [[ "$SELF_TEST" == "true" ]]; then
  self_test_passed=true
  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" && success "Required: $tool" || { error "Missing: $tool"; self_test_passed=false; }
  done
  [[ -f "$SCHEMA_PATH" ]] && validate_json "$SCHEMA_PATH" 2>/dev/null && success "Schema valid" || self_test_passed=false
  [[ "$self_test_passed" == "true" ]] && exit 0 || exit 1
fi

validate_skill_specific() {
  local output_file="$1"
  local has_comparisons=$(json_get "$output_file" ".output.comparisons" 2>/dev/null)
  [[ -z "$has_comparisons" ]] || [[ "$has_comparisons" == "null" ]] && warn "No comparisons found"
  return 0
}

main() {
  [[ -z "$OUTPUT_FILE" ]] && error "No output file specified" && exit 1
  [[ ! -f "$OUTPUT_FILE" ]] && error "Output file not found" && exit 1

  echo "Validating $SKILL_NAME"

  ! validate_tools && exit $EXIT_SKIP
  ! validate_json "$OUTPUT_FILE" && exit $EXIT_FAIL
  ! validate_schema "$OUTPUT_FILE" 2>/dev/null && exit $EXIT_FAIL
  ! validate_required_fields "$OUTPUT_FILE" && exit $EXIT_FAIL
  ! validate_content_terms "$OUTPUT_FILE" && exit $EXIT_FAIL
  ! validate_skill_specific "$OUTPUT_FILE" && exit $EXIT_FAIL

  success "Validation PASSED"
  exit $EXIT_PASS
}

main
