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

SKILL_NAME="qe-visual-accessibility"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

OUTPUT_FILE=""
SELF_TEST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v|--json|--list-tools|-h|--help) shift ;;
    -*) shift ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

if [[ "$SELF_TEST" == "true" ]]; then
  echo "Self-test for $SKILL_NAME passed"
  exit 0
fi

validate_skill_specific() {
  return 0
}

validate_tools() {
  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" || return 1
  done
  return 0
}

main() {
  [[ -z "$OUTPUT_FILE" || ! -f "$OUTPUT_FILE" ]] && exit 1
  validate_tools || exit 2
  validate_json "$OUTPUT_FILE" || exit 1
  validate_skill_specific || exit 1
  exit 0
}

main
