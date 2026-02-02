#!/bin/bash
# =============================================================================
# AQE Skill Validator: n8n-workflow-testing-fundamentals v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="n8n-workflow-testing-fundamentals"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.workflowValidation" "output.nodeTests")
MUST_CONTAIN_TERMS=("workflow" "n8n" "test")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate workflow validation
  local has_validation
  has_validation=$(jq '.output.workflowValidation | has("workflowId") and has("valid")' "$output_file" 2>/dev/null)

  if [[ "$has_validation" != "true" ]]; then
    error "Workflow validation missing required fields (workflowId, valid)"
    has_errors=true
  fi

  # Validate node tests
  local test_count
  test_count=$(jq '.output.nodeTests | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$test_count" -gt 0 ]]; then
    local invalid_tests
    invalid_tests=$(jq '[.output.nodeTests[]? | select(.nodeId == null or .nodeName == null or .nodeType == null or .status == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_tests" -gt 0 ]]; then
      warn "$invalid_tests node test(s) missing required fields"
    fi

    # Validate status enum
    local valid_statuses="passed failed skipped untested"
    local statuses
    statuses=$(jq -r '.output.nodeTests[]?.status // empty' "$output_file" 2>/dev/null || true)

    for status in $statuses; do
      if ! echo "$valid_statuses" | grep -qw "$status"; then
        error "Invalid node test status: $status"
        has_errors=true
      fi
    done
  fi

  # Validate connection tests if present
  local conn_count
  conn_count=$(jq '.output.connectionTests | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$conn_count" -gt 0 ]]; then
    local invalid_conns
    invalid_conns=$(jq '[.output.connectionTests[]? | select(.sourceNode == null or .targetNode == null or .valid == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_conns" -gt 0 ]]; then
      warn "$invalid_conns connection test(s) missing required fields"
    fi
  fi

  # Validate test coverage if present
  local has_coverage
  has_coverage=$(jq '.output | has("testCoverage")' "$output_file" 2>/dev/null)

  if [[ "$has_coverage" == "true" ]]; then
    local coverage
    coverage=$(jq '.output.testCoverage.overallCoverage // -1' "$output_file" 2>/dev/null)

    if [[ "$coverage" != "-1" ]] && (( $(echo "$coverage < 0 || $coverage > 100" | bc -l 2>/dev/null || echo "0") )); then
      warn "Overall coverage $coverage is out of range (0-100)"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "N8N workflow testing validation passed"
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
