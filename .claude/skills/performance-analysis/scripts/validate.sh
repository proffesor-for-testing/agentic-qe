#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

VALIDATOR_LIB=""
for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && VALIDATOR_LIB="$lib_path" && break
done
[[ -n "$VALIDATOR_LIB" ]] && source "$VALIDATOR_LIB" || { echo "ERROR: Validator library not found"; exit 1; }

SKILL_NAME="performance-analysis"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("npm" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("performance" "metric")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

OUTPUT_FILE=""
SELF_TEST=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) export AQE_DEBUG=1; shift ;;
    --json|--list-tools|-h|--help) shift ;;
    -*) shift ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

[[ "$SELF_TEST" == "true" ]] && { echo "Self-test for $SKILL_NAME"; exit 0; }

validate_skill_specific() {
  return 0
}

validate_tools() {
  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" || return 1
  done
  return 0
}

validate_required_fields() {
  [[ -z "$OUTPUT_FILE" || ! -f "$OUTPUT_FILE" ]] && return 1
  return 0
}

main() {
  [[ -z "$OUTPUT_FILE" || ! -f "$OUTPUT_FILE" ]] && exit 1
  validate_tools || exit 2
  validate_json "$OUTPUT_FILE" || exit 1
  validate_required_fields || exit 1
  validate_skill_specific || exit 1
  exit 0
}

main
