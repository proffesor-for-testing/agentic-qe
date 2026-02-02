#!/bin/bash
# =============================================================================
# AQE Skill Validator: n8n-trigger-testing-strategies v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="n8n-trigger-testing-strategies"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.triggerTests" "output.triggerAnalysis")
MUST_CONTAIN_TERMS=("trigger" "n8n")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate trigger tests
  local test_count
  test_count=$(jq '.output.triggerTests | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$test_count" -gt 0 ]]; then
    local invalid_tests
    invalid_tests=$(jq '[.output.triggerTests[]? | select(.id == null or .triggerType == null or .testType == null or .status == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_tests" -gt 0 ]]; then
      warn "$invalid_tests trigger test(s) missing required fields"
    fi

    # Validate trigger type enum
    local valid_types="webhook schedule manual polling event cron"
    local types
    types=$(jq -r '.output.triggerTests[]?.triggerType // empty' "$output_file" 2>/dev/null || true)

    for type in $types; do
      if ! echo "$valid_types" | grep -qw "$type"; then
        error "Invalid trigger type: $type"
        has_errors=true
      fi
    done

    # Validate test ID pattern
    local invalid_ids
    invalid_ids=$(jq '[.output.triggerTests[]?.id // empty | select(test("^TRIG-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids trigger test(s) have invalid ID format (should be TRIG-NNN)"
    fi
  fi

  # Validate trigger analysis
  local has_analysis
  has_analysis=$(jq '.output.triggerAnalysis | has("totalTriggers") and has("triggerTypes")' "$output_file" 2>/dev/null)

  if [[ "$has_analysis" != "true" ]]; then
    error "Trigger analysis missing required fields"
    has_errors=true
  fi

  # Validate webhook tests if present
  local webhook_count
  webhook_count=$(jq '.output.webhookTests | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$webhook_count" -gt 0 ]]; then
    local invalid_webhooks
    invalid_webhooks=$(jq '[.output.webhookTests[]? | select(.webhookPath == null or .httpMethod == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_webhooks" -gt 0 ]]; then
      warn "$invalid_webhooks webhook test(s) missing required fields"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "N8N trigger testing validation passed"
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
