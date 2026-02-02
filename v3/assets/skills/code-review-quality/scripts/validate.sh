#!/bin/bash
# =============================================================================
# AQE Skill Validator: code-review-quality v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="code-review-quality"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.reviewFindings" "output.codeQuality")
MUST_CONTAIN_TERMS=("review" "quality")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate review findings
  local finding_count
  finding_count=$(jq '.output.reviewFindings | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$finding_count" -gt 0 ]]; then
    local invalid_findings
    invalid_findings=$(jq '[.output.reviewFindings[]? | select(.id == null or .title == null or .severity == null or .category == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_findings" -gt 0 ]]; then
      warn "$invalid_findings finding(s) missing required fields"
    fi

    # Validate finding ID pattern
    local invalid_ids
    invalid_ids=$(jq '[.output.reviewFindings[]?.id // empty | select(test("^CRQ-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids finding(s) have invalid ID format (should be CRQ-NNN)"
    fi

    # Validate severity enum
    local valid_severities="critical high medium low suggestion"
    local severities
    severities=$(jq -r '.output.reviewFindings[]?.severity // empty' "$output_file" 2>/dev/null || true)

    for sev in $severities; do
      if ! echo "$valid_severities" | grep -qw "$sev"; then
        error "Invalid severity: $sev"
        has_errors=true
      fi
    done
  fi

  # Validate code quality
  local has_quality
  has_quality=$(jq '.output.codeQuality | has("overallScore") and has("grade")' "$output_file" 2>/dev/null)

  if [[ "$has_quality" != "true" ]]; then
    error "Code quality missing required fields (overallScore, grade)"
    has_errors=true
  fi

  # Validate quality gates if present
  local gate_count
  gate_count=$(jq '.output.qualityGates | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$gate_count" -gt 0 ]]; then
    local invalid_gates
    invalid_gates=$(jq '[.output.qualityGates[]? | select(.name == null or .passed == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_gates" -gt 0 ]]; then
      warn "$invalid_gates quality gate(s) missing required fields"
    fi
  fi

  # Validate verdict
  local verdict
  verdict=$(jq -r '.output.verdict // ""' "$output_file" 2>/dev/null)

  if [[ -n "$verdict" && "$verdict" != "null" ]]; then
    local valid_verdicts="approved approved-with-suggestions request-changes blocked"
    if ! echo "$valid_verdicts" | grep -qw "$verdict"; then
      error "Invalid verdict: $verdict"
      has_errors=true
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "Code review quality validation passed"
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
