#!/bin/bash
# =============================================================================
# AQE Skill Validator: sherlock-review v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="sherlock-review"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.reviewFindings" "output.deductions" "output.codeQuality")
MUST_CONTAIN_TERMS=("evidence" "deduction")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate review findings with evidence
  local finding_count
  finding_count=$(jq '.output.reviewFindings | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$finding_count" -gt 0 ]]; then
    local invalid_findings
    invalid_findings=$(jq '[.output.reviewFindings[]? | select(.id == null or .title == null or .severity == null or .category == null or .evidence == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_findings" -gt 0 ]]; then
      warn "$invalid_findings finding(s) missing required fields (id, title, severity, category, evidence)"
    fi

    # Validate finding ID pattern
    local invalid_ids
    invalid_ids=$(jq '[.output.reviewFindings[]?.id // empty | select(test("^SHRK-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids finding(s) have invalid ID format (should be SHRK-NNN)"
    fi
  fi

  # Validate deductions - this is critical for Sherlock review
  local deduction_count
  deduction_count=$(jq '.output.deductions | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$deduction_count" -eq 0 ]]; then
    warn "No deductions found - Sherlock review should include logical deductions"
  else
    local invalid_deductions
    invalid_deductions=$(jq '[.output.deductions[]? | select(.id == null or .observation == null or .hypothesis == null or .conclusion == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_deductions" -gt 0 ]]; then
      warn "$invalid_deductions deduction(s) missing required fields (id, observation, hypothesis, conclusion)"
    fi

    # Validate deduction ID pattern
    local invalid_ded_ids
    invalid_ded_ids=$(jq '[.output.deductions[]?.id // empty | select(test("^DED-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ded_ids" -gt 0 ]]; then
      warn "$invalid_ded_ids deduction(s) have invalid ID format (should be DED-NNN)"
    fi
  fi

  # Validate evidence chain if present
  local evidence_count
  evidence_count=$(jq '.output.evidenceChain | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$evidence_count" -gt 0 ]]; then
    local invalid_evidence
    invalid_evidence=$(jq '[.output.evidenceChain[]? | select(.type == null or .description == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_evidence" -gt 0 ]]; then
      warn "$invalid_evidence evidence item(s) missing required fields"
    fi
  fi

  # Validate verdict
  local verdict
  verdict=$(jq -r '.output.verdict // ""' "$output_file" 2>/dev/null)

  if [[ -n "$verdict" && "$verdict" != "null" ]]; then
    local valid_verdicts="case-closed-clean minor-infractions significant-concerns major-violations investigation-required"
    if ! echo "$valid_verdicts" | grep -qw "$verdict"; then
      error "Invalid verdict: $verdict"
      has_errors=true
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "Sherlock review validation passed"
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
