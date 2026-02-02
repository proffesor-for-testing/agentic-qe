#!/bin/bash
# =============================================================================
# AQE Skill Validator: refactoring-patterns v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="refactoring-patterns"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.refactorings")
MUST_CONTAIN_TERMS=("refactor" "pattern" "smell")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate refactorings array
  local refactoring_count
  refactoring_count=$(jq '.output.refactorings | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$refactoring_count" -gt 0 ]]; then
    # Validate each refactoring has required fields
    local invalid_refactorings
    invalid_refactorings=$(jq '[.output.refactorings[]? | select(.id == null or .name == null or .category == null or .status == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_refactorings" -gt 0 ]]; then
      warn "$invalid_refactorings refactoring(s) missing required fields (id, name, category, status)"
    fi

    # Validate refactoring ID pattern
    local invalid_ids
    invalid_ids=$(jq '[.output.refactorings[]?.id // empty | select(test("^REF-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids refactoring(s) have invalid ID format (should be REF-NNN)"
    fi

    # Validate refactoring categories
    local invalid_categories
    invalid_categories=$(jq '[.output.refactorings[]?.category // empty | select(IN("composing-methods", "moving-features", "organizing-data", "simplifying-conditional", "simplifying-method-calls", "dealing-with-generalization", "encapsulation", "inline", "extract") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_categories" -gt 0 ]]; then
      warn "$invalid_categories refactoring(s) have invalid category values"
    fi

    # Validate refactoring status
    local invalid_status
    invalid_status=$(jq '[.output.refactorings[]?.status // empty | select(IN("applied", "suggested", "rejected", "in-progress") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_status" -gt 0 ]]; then
      warn "$invalid_status refactoring(s) have invalid status values"
    fi

    # Validate risk levels
    local invalid_risks
    invalid_risks=$(jq '[.output.refactorings[]?.risk // empty | select(IN("low", "medium", "high") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_risks" -gt 0 ]]; then
      warn "$invalid_risks refactoring(s) have invalid risk values"
    fi

    # Validate effort levels
    local invalid_efforts
    invalid_efforts=$(jq '[.output.refactorings[]?.effort // empty | select(IN("trivial", "low", "medium", "high", "major") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_efforts" -gt 0 ]]; then
      warn "$invalid_efforts refactoring(s) have invalid effort values"
    fi

    # Validate impact scores if present
    local invalid_impacts
    invalid_impacts=$(jq '[.output.refactorings[]?.impact // empty | select(
      (.readability and (.readability < -10 or .readability > 10)) or
      (.maintainability and (.maintainability < -10 or .maintainability > 10)) or
      (.performance and (.performance < -10 or .performance > 10)) or
      (.testability and (.testability < -10 or .testability > 10))
    )] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_impacts" -gt 0 ]]; then
      warn "$invalid_impacts refactoring(s) have impact scores out of range (-10 to 10)"
    fi
  fi

  # Validate code smells
  local smell_count
  smell_count=$(jq '.output.codeSmells | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$smell_count" -gt 0 ]]; then
    # Validate each smell has required fields
    local invalid_smells
    invalid_smells=$(jq '[.output.codeSmells[]? | select(.id == null or .name == null or .severity == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_smells" -gt 0 ]]; then
      warn "$invalid_smells code smell(s) missing required fields (id, name, severity)"
    fi

    # Validate smell ID pattern
    local invalid_smell_ids
    invalid_smell_ids=$(jq '[.output.codeSmells[]?.id // empty | select(test("^SMELL-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_smell_ids" -gt 0 ]]; then
      warn "$invalid_smell_ids code smell(s) have invalid ID format (should be SMELL-NNN)"
    fi

    # Validate smell severity
    local invalid_smell_severities
    invalid_smell_severities=$(jq '[.output.codeSmells[]?.severity // empty | select(IN("critical", "high", "medium", "low", "info") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_smell_severities" -gt 0 ]]; then
      warn "$invalid_smell_severities code smell(s) have invalid severity values"
    fi

    # Validate smell category
    local invalid_smell_categories
    invalid_smell_categories=$(jq '[.output.codeSmells[]?.category // empty | select(IN("bloaters", "oo-abusers", "change-preventers", "dispensables", "couplers") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_smell_categories" -gt 0 ]]; then
      warn "$invalid_smell_categories code smell(s) have invalid category values"
    fi
  fi

  # Validate transformation summary if present
  local has_summary
  has_summary=$(jq 'has("output") and (.output | has("transformationSummary"))' "$output_file" 2>/dev/null)

  if [[ "$has_summary" == "true" ]]; then
    local applied suggested resolved remaining
    applied=$(jq '.output.transformationSummary.appliedRefactorings // 0' "$output_file" 2>/dev/null || echo "0")
    suggested=$(jq '.output.transformationSummary.suggestedRefactorings // 0' "$output_file" 2>/dev/null || echo "0")
    resolved=$(jq '.output.transformationSummary.codeSmellsResolved // 0' "$output_file" 2>/dev/null || echo "0")
    remaining=$(jq '.output.transformationSummary.codeSmellsRemaining // 0' "$output_file" 2>/dev/null || echo "0")

    # Warn if summary numbers don't make logical sense
    if [[ "$applied" -gt 0 && "$suggested" -eq 0 ]]; then
      info "Applied refactorings without suggestions (pure remediation)"
    fi

    if [[ "$resolved" -gt 0 && "$remaining" -eq 0 ]]; then
      info "All code smells resolved"
    fi

    # Validate behavior preservation flags
    local tests_preserved behavior_preserved
    tests_preserved=$(jq '.output.transformationSummary.testsPreserved // null' "$output_file" 2>/dev/null)
    behavior_preserved=$(jq '.output.transformationSummary.behaviorPreserved // null' "$output_file" 2>/dev/null)

    if [[ "$tests_preserved" == "false" || "$behavior_preserved" == "false" ]]; then
      warn "Tests or behavior was not preserved - refactoring may be risky"
    fi
  fi

  # Validate quality metrics if present
  local has_metrics
  has_metrics=$(jq 'has("output") and (.output | has("qualityMetrics"))' "$output_file" 2>/dev/null)

  if [[ "$has_metrics" == "true" ]]; then
    local before_loc after_loc
    before_loc=$(jq '.output.qualityMetrics.beforeRefactoring.linesOfCode // null' "$output_file" 2>/dev/null)
    after_loc=$(jq '.output.qualityMetrics.afterRefactoring.linesOfCode // null' "$output_file" 2>/dev/null)

    if [[ "$before_loc" != "null" && "$after_loc" != "null" && -n "$before_loc" && -n "$after_loc" ]]; then
      if [[ "$after_loc" -gt "$before_loc" ]]; then
        warn "Lines of code increased after refactoring (before: $before_loc, after: $after_loc)"
      fi
    fi
  fi

  # Validate findings if present
  local finding_count
  finding_count=$(jq '.output.findings | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$finding_count" -gt 0 ]]; then
    local invalid_findings
    invalid_findings=$(jq '[.output.findings[]? | select(.id == null or .title == null or .severity == null or .category == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_findings" -gt 0 ]]; then
      warn "$invalid_findings finding(s) missing required fields (id, title, severity, category)"
    fi

    # Validate finding ID pattern
    local invalid_finding_ids
    invalid_finding_ids=$(jq '[.output.findings[]?.id // empty | select(test("^RFP-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_finding_ids" -gt 0 ]]; then
      warn "$invalid_finding_ids finding(s) have invalid ID format (should be RFP-NNN)"
    fi
  fi

  # Validate recommendations if present
  local rec_count
  rec_count=$(jq '.output.recommendations | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$rec_count" -gt 0 ]]; then
    local invalid_recs
    invalid_recs=$(jq '[.output.recommendations[]? | select(.id == null or .title == null or .priority == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_recs" -gt 0 ]]; then
      warn "$invalid_recs recommendation(s) missing required fields (id, title, priority)"
    fi

    # Validate recommendation ID pattern
    local invalid_rec_ids
    invalid_rec_ids=$(jq '[.output.recommendations[]?.id // empty | select(test("^REC-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_rec_ids" -gt 0 ]]; then
      warn "$invalid_rec_ids recommendation(s) have invalid ID format (should be REC-NNN)"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "Refactoring patterns validation passed"
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
