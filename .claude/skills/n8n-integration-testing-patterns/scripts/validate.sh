#!/bin/bash
# =============================================================================
# AQE Skill Validator: n8n-integration-testing-patterns v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="n8n-integration-testing-patterns"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.integrationTests" "output.serviceConnections")
MUST_CONTAIN_TERMS=("integration" "n8n")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate integration tests structure
  local test_count
  test_count=$(jq '.output.integrationTests | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$test_count" -gt 0 ]]; then
    local invalid_tests
    invalid_tests=$(jq '[.output.integrationTests[]? | select(.id == null or .name == null or .testType == null or .status == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_tests" -gt 0 ]]; then
      warn "$invalid_tests integration test(s) missing required fields"
    fi

    # Validate test type enum
    local valid_types="api webhook database file queue external-service e2e"
    local types
    types=$(jq -r '.output.integrationTests[]?.testType // empty' "$output_file" 2>/dev/null || true)

    for type in $types; do
      if ! echo "$valid_types" | grep -qw "$type"; then
        error "Invalid test type: $type"
        has_errors=true
      fi
    done
  fi

  # Validate service connections
  local conn_count
  conn_count=$(jq '.output.serviceConnections | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$conn_count" -gt 0 ]]; then
    local invalid_conns
    invalid_conns=$(jq '[.output.serviceConnections[]? | select(.serviceName == null or .connectionStatus == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_conns" -gt 0 ]]; then
      warn "$invalid_conns service connection(s) missing required fields"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "N8N integration testing validation passed"
  return 0
}

OUTPUT_FILE="${1:-}"
[[ -z "$OUTPUT_FILE" ]] && { echo "Usage: $0 <output-file>"; exit 1; }
[[ ! -f "$OUTPUT_FILE" ]] && { echo "ERROR: File not found: $OUTPUT_FILE"; exit 1; }

echo "Validating $SKILL_NAME output..."
jq empty "$OUTPUT_FILE" 2>/dev/null || { echo "ERROR: Invalid JSON"; exit 1; }

if validate_skill_specific "$OUTPUT_FILE"; then
  echo "PASSED: $SKILL_NAME validation"
  exit 0
else
  echo "FAILED: $SKILL_NAME validation"
  exit 1
fi
