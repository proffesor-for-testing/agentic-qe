#!/bin/bash
# =============================================================================
# AQE Skill Validator: tdd-london-chicago v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="tdd-london-chicago"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.tddCycles" "output.approach")
MUST_CONTAIN_TERMS=("tdd" "test" "red" "green" "refactor")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
  ".output.approach.school:london,chicago,hybrid"
)

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate TDD cycles
  local completed_cycles total_cycles
  completed_cycles=$(jq '.output.tddCycles.completedCycles // 0' "$output_file" 2>/dev/null || echo "0")
  total_cycles=$(jq '.output.tddCycles.totalCycles // 0' "$output_file" 2>/dev/null || echo "0")

  if [[ "$total_cycles" -eq 0 ]]; then
    warn "No TDD cycles recorded - tdd-london-chicago should have at least one cycle"
  else
    if [[ "$completed_cycles" -gt "$total_cycles" ]]; then
      error "Completed cycles ($completed_cycles) exceeds total cycles ($total_cycles)"
      has_errors=true
    fi

    # Check cycle details
    local cycle_count
    cycle_count=$(jq '.output.tddCycles.cycleDetails | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$cycle_count" -eq 0 && "$total_cycles" -gt 0 ]]; then
      warn "Cycle details array is empty but $total_cycles cycles recorded"
    fi

    # Validate cycle phases
    local invalid_phases
    invalid_phases=$(jq '[.output.tddCycles.cycleDetails[]? | select(.phase and (.phase | IN("red", "green", "refactor") | not))] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_phases" -gt 0 ]]; then
      error "$invalid_phases cycle(s) have invalid phase values"
      has_errors=true
    fi

    # Validate test-first ratio if present
    local test_first_ratio
    test_first_ratio=$(jq '.output.tddCycles.testFirstRatio // null' "$output_file" 2>/dev/null)

    if [[ "$test_first_ratio" != "null" && -n "$test_first_ratio" ]]; then
      if (( $(echo "$test_first_ratio < 0 || $test_first_ratio > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Test-first ratio $test_first_ratio out of range (0-100)"
        has_errors=true
      fi
    fi
  fi

  # Validate approach
  local school
  school=$(jq -r '.output.approach.school // ""' "$output_file" 2>/dev/null)

  if [[ -z "$school" ]]; then
    error "Approach school must be specified (london, chicago, or hybrid)"
    has_errors=true
  else
    local justification
    justification=$(jq -r '.output.approach.justification // ""' "$output_file" 2>/dev/null)

    if [[ -z "$justification" || ${#justification} -lt 20 ]]; then
      warn "Approach justification should be substantial (min 20 characters)"
    fi

    # Validate London-specific metrics if school is london
    if [[ "$school" == "london" ]]; then
      local london_metrics
      london_metrics=$(jq '.output.approach.londonMetrics // null' "$output_file" 2>/dev/null)

      if [[ "$london_metrics" == "null" ]]; then
        warn "London school selected but londonMetrics not provided"
      else
        local isolation_level
        isolation_level=$(jq -r '.output.approach.londonMetrics.isolationLevel // ""' "$output_file" 2>/dev/null)

        if [[ -n "$isolation_level" ]] && ! echo "full partial minimal" | grep -qw "$isolation_level"; then
          error "Invalid London isolationLevel: $isolation_level"
          has_errors=true
        fi

        local outside_in_score
        outside_in_score=$(jq '.output.approach.londonMetrics.outsideInScore // null' "$output_file" 2>/dev/null)

        if [[ "$outside_in_score" != "null" && -n "$outside_in_score" ]]; then
          if (( $(echo "$outside_in_score < 0 || $outside_in_score > 100" | bc -l 2>/dev/null || echo "0") )); then
            error "Outside-in score $outside_in_score out of range (0-100)"
            has_errors=true
          fi
        fi
      fi
    fi

    # Validate Chicago-specific metrics if school is chicago
    if [[ "$school" == "chicago" ]]; then
      local chicago_metrics
      chicago_metrics=$(jq '.output.approach.chicagoMetrics // null' "$output_file" 2>/dev/null)

      if [[ "$chicago_metrics" == "null" ]]; then
        warn "Chicago school selected but chicagoMetrics not provided"
      else
        local inside_out_score
        inside_out_score=$(jq '.output.approach.chicagoMetrics.insideOutScore // null' "$output_file" 2>/dev/null)

        if [[ "$inside_out_score" != "null" && -n "$inside_out_score" ]]; then
          if (( $(echo "$inside_out_score < 0 || $inside_out_score > 100" | bc -l 2>/dev/null || echo "0") )); then
            error "Inside-out score $inside_out_score out of range (0-100)"
            has_errors=true
          fi
        fi
      fi
    fi
  fi

  # Validate test metrics if present
  local has_test_metrics
  has_test_metrics=$(jq 'has("output") and (.output | has("testMetrics"))' "$output_file" 2>/dev/null)

  if [[ "$has_test_metrics" == "true" ]]; then
    local total_tests passing failing
    total_tests=$(jq '.output.testMetrics.totalTests // 0' "$output_file" 2>/dev/null || echo "0")
    passing=$(jq '.output.testMetrics.passing // 0' "$output_file" 2>/dev/null || echo "0")
    failing=$(jq '.output.testMetrics.failing // 0' "$output_file" 2>/dev/null || echo "0")

    if [[ "$total_tests" -gt 0 ]]; then
      local sum=$((passing + failing))
      if [[ "$sum" -gt "$total_tests" ]]; then
        warn "Sum of passing ($passing) + failing ($failing) exceeds total ($total_tests)"
      fi
    fi

    # Validate coverage metrics
    local coverage
    coverage=$(jq '.output.testMetrics.coverage // null' "$output_file" 2>/dev/null)

    if [[ "$coverage" != "null" && -n "$coverage" ]]; then
      if (( $(echo "$coverage < 0 || $coverage > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Code coverage $coverage out of range (0-100)"
        has_errors=true
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
    local invalid_ids
    invalid_ids=$(jq '[.output.findings[]?.id // empty | select(test("^TDD-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids finding(s) have invalid ID format (should be TDD-NNN)"
    fi

    # Validate finding categories
    local valid_categories="cycle coverage design mocking isolation refactoring"
    local invalid_categories
    invalid_categories=$(jq '[.output.findings[]?.category // empty | select(IN("cycle", "coverage", "design", "mocking", "isolation", "refactoring") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_categories" -gt 0 ]]; then
      warn "$invalid_categories finding(s) have invalid category values"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "TDD London-Chicago validation passed"
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
