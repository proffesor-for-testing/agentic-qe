#!/bin/bash
# =============================================================================
# AQE Skill Validator: n8n-expression-testing v1.0.0
# Validates n8n expression testing skill output per ADR-056
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source validator library
for lib_path in \
  "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" \
  "$SKILL_DIR/scripts/validator-lib.sh"; do
  if [[ -f "$lib_path" ]]; then
    source "$lib_path"
    break
  fi
done

SKILL_NAME="n8n-expression-testing"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("node")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.expressionResults" "output.nodeTests")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("expression" "n8n")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

# N8N Expression-specific validation
validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate expression results have required structure
  local expr_count
  expr_count=$(jq '.output.expressionResults | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$expr_count" -gt 0 ]]; then
    # Check expression result structure
    local invalid_exprs
    invalid_exprs=$(jq '[.output.expressionResults[]? | select(.id == null or .expression == null or .status == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_exprs" -gt 0 ]]; then
      warn "$invalid_exprs expression result(s) missing required fields (id, expression, status)"
    fi

    # Validate expression IDs follow pattern
    local invalid_ids
    invalid_ids=$(jq '[.output.expressionResults[]?.id // empty | select(test("^EXPR-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids expression(s) have invalid ID format (should be EXPR-NNN)"
    fi

    # Validate expression status values
    local valid_statuses="valid invalid warning error"
    local statuses
    statuses=$(jq -r '.output.expressionResults[]?.status // empty' "$output_file" 2>/dev/null || true)

    for status in $statuses; do
      if ! echo "$valid_statuses" | grep -qw "$status"; then
        error "Invalid expression status: $status"
        has_errors=true
      fi
    done
  fi

  # Validate node tests
  local node_count
  node_count=$(jq '.output.nodeTests | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$node_count" -gt 0 ]]; then
    local invalid_nodes
    invalid_nodes=$(jq '[.output.nodeTests[]? | select(.nodeId == null or .nodeName == null or .nodeType == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_nodes" -gt 0 ]]; then
      warn "$invalid_nodes node test(s) missing required fields"
    fi
  fi

  # Validate workflow validation if present
  local has_workflow
  has_workflow=$(jq 'has("output") and (.output | has("workflowValidation"))' "$output_file" 2>/dev/null)

  if [[ "$has_workflow" == "true" ]]; then
    local wf_valid
    wf_valid=$(jq '.output.workflowValidation | has("workflowId") and has("valid")' "$output_file" 2>/dev/null)

    if [[ "$wf_valid" != "true" ]]; then
      warn "Workflow validation missing required fields (workflowId, valid)"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "N8N expression testing validation passed"
  return 0
}

# Main validation (delegate to common pattern)
source "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-main.sh" 2>/dev/null || {
  # Fallback if main template not found
  OUTPUT_FILE="${1:-}"
  if [[ -z "$OUTPUT_FILE" ]]; then
    echo "Usage: $0 <output-file>"
    exit 1
  fi

  if [[ ! -f "$OUTPUT_FILE" ]]; then
    echo "ERROR: File not found: $OUTPUT_FILE"
    exit 1
  fi

  echo "Validating $SKILL_NAME output..."

  # Basic JSON validation
  if ! jq empty "$OUTPUT_FILE" 2>/dev/null; then
    echo "ERROR: Invalid JSON"
    exit 1
  fi

  # Run skill-specific validation
  if validate_skill_specific "$OUTPUT_FILE"; then
    echo "PASSED: $SKILL_NAME validation"
    exit 0
  else
    echo "FAILED: $SKILL_NAME validation"
    exit 1
  fi
}
