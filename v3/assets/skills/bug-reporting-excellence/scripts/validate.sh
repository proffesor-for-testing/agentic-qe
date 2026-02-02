#!/bin/bash
# =============================================================================
# AQE Skill Validator: bug-reporting-excellence v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="bug-reporting-excellence"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.bugReports" "output.reportQuality")
MUST_CONTAIN_TERMS=("bug" "steps")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate bug reports
  local report_count
  report_count=$(jq '.output.bugReports | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$report_count" -eq 0 ]]; then
    error "No bug reports found - at least one bug report is required"
    has_errors=true
  else
    local invalid_reports
    invalid_reports=$(jq '[.output.bugReports[]? | select(.id == null or .title == null or .severity == null or .stepsToReproduce == null or .expectedBehavior == null or .actualBehavior == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_reports" -gt 0 ]]; then
      error "$invalid_reports bug report(s) missing required fields"
      has_errors=true
    fi

    # Validate bug ID pattern
    local invalid_ids
    invalid_ids=$(jq '[.output.bugReports[]?.id // empty | select(test("^BUG-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids bug report(s) have invalid ID format (should be BUG-NNN)"
    fi

    # Validate severity enum
    local valid_severities="critical high medium low trivial"
    local severities
    severities=$(jq -r '.output.bugReports[]?.severity // empty' "$output_file" 2>/dev/null || true)

    for sev in $severities; do
      if ! echo "$valid_severities" | grep -qw "$sev"; then
        error "Invalid severity: $sev"
        has_errors=true
      fi
    done

    # Validate steps to reproduce is an array with at least one step
    local reports_without_steps
    reports_without_steps=$(jq '[.output.bugReports[]? | select((.stepsToReproduce | length) == 0)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$reports_without_steps" -gt 0 ]]; then
      warn "$reports_without_steps bug report(s) have empty steps to reproduce"
    fi

    # Validate title length (min 15 chars)
    local short_titles
    short_titles=$(jq '[.output.bugReports[]?.title // "" | select(length < 15)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$short_titles" -gt 0 ]]; then
      warn "$short_titles bug report(s) have title shorter than 15 characters"
    fi
  fi

  # Validate report quality
  local has_quality
  has_quality=$(jq '.output.reportQuality | has("overallScore") and has("grade")' "$output_file" 2>/dev/null)

  if [[ "$has_quality" != "true" ]]; then
    error "Report quality missing required fields (overallScore, grade)"
    has_errors=true
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "Bug reporting excellence validation passed"
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
