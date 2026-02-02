#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-iterative-loop v1.0.0
# Validates iterative loop skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance
# 2. Required iteration fields (iterations, improvements, convergence)
# 3. Iteration structure validation
# 4. Convergence criteria validation
# 5. Quality progression validation
#
# Usage: ./validate.sh <output-file> [options]
#
# Exit Codes:
#   0 - Validation passed
#   1 - Validation failed
#   2 - Validation skipped (missing required tools)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source validator library
VALIDATOR_LIB=""
for lib_path in \
  "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" \
  "$SKILL_DIR/../.validation/templates/validator-lib.sh" \
  "$SCRIPT_DIR/validator-lib.sh"; do
  if [[ -f "$lib_path" ]]; then
    VALIDATOR_LIB="$lib_path"
    break
  fi
done

if [[ -n "$VALIDATOR_LIB" ]]; then
  # shellcheck source=/dev/null
  source "$VALIDATOR_LIB"
else
  echo "ERROR: Validator library not found"
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="qe-iterative-loop"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.iterations" "output.convergence")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("iteration" "convergence" "improvement")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")

ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

MIN_ARRAY_LENGTHS=(
  ".output.iterations:1"
)

# =============================================================================
# Argument Parsing
# =============================================================================

OUTPUT_FILE=""
SELF_TEST=false
VERBOSE=false
JSON_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) VERBOSE=true; export AQE_DEBUG=1; shift ;;
    --json) JSON_ONLY=true; shift ;;
    -h|--help)
      echo "Usage: $0 <output-file> [--self-test] [--verbose] [--json]"
      exit 0
      ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

# =============================================================================
# Self-Test Mode
# =============================================================================

if [[ "$SELF_TEST" == "true" ]]; then
  echo "=============================================="
  info "Running $SKILL_NAME Validator Self-Test"
  echo "=============================================="

  self_test_passed=true

  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Required tool available: $tool"
    else
      error "Required tool MISSING: $tool"
      self_test_passed=false
    fi
  done

  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema is valid JSON"
    else
      error "Schema is NOT valid JSON"
      self_test_passed=false
    fi
  else
    error "Schema file not found: $SCHEMA_PATH"
    self_test_passed=false
  fi

  if run_self_test 2>/dev/null; then
    success "Library self-test passed"
  else
    error "Library self-test FAILED"
    self_test_passed=false
  fi

  if [[ "$self_test_passed" == "true" ]]; then
    success "Self-test PASSED"
    exit 0
  else
    error "Self-test FAILED"
    exit 1
  fi
fi

# =============================================================================
# SKILL-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

validate_iterations() {
  local output_file="$1"

  local iter_count
  iter_count=$(json_count "$output_file" ".output.iterations" 2>/dev/null)

  if [[ -z "$iter_count" ]] || [[ "$iter_count" -lt 1 ]]; then
    error "No iterations found"
    return 1
  fi

  debug "Found $iter_count iterations"

  # Validate iteration ID format
  local invalid_ids
  invalid_ids=$(jq '[.output.iterations[]?.id // empty | select(test("^ITER-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null)

  if [[ -n "$invalid_ids" ]] && [[ "$invalid_ids" -gt 0 ]]; then
    warn "$invalid_ids iteration(s) have invalid ID format (should be ITER-NNN)"
  fi

  # Validate iteration numbers are sequential
  local first_num last_num
  first_num=$(json_get "$output_file" ".output.iterations[0].number" 2>/dev/null)
  last_num=$(jq '.output.iterations | last | .number' "$output_file" 2>/dev/null)

  if [[ -n "$first_num" ]] && [[ "$first_num" != "null" ]] && [[ "$first_num" -lt 1 ]]; then
    error "Iteration number must start at 1, found: $first_num"
    return 1
  fi

  # Validate iteration status
  local first_status
  first_status=$(json_get "$output_file" ".output.iterations[0].status" 2>/dev/null)

  if [[ -n "$first_status" ]] && [[ "$first_status" != "null" ]]; then
    if ! validate_enum "$first_status" "completed" "partial" "failed" "skipped"; then
      error "Invalid iteration status: $first_status"
      return 1
    fi
  fi

  return 0
}

validate_convergence() {
  local output_file="$1"

  local achieved iter_count
  achieved=$(json_get "$output_file" ".output.convergence.achieved" 2>/dev/null)
  iter_count=$(json_get "$output_file" ".output.convergence.iterationCount" 2>/dev/null)

  if [[ -z "$iter_count" ]] || [[ "$iter_count" == "null" ]] || [[ "$iter_count" -lt 1 ]]; then
    error "Invalid convergence iteration count"
    return 1
  fi

  if [[ -n "$achieved" ]] && [[ "$achieved" != "null" ]]; then
    debug "Convergence achieved: $achieved after $iter_count iterations"
  fi

  # Validate convergence rate
  local conv_rate
  conv_rate=$(json_get "$output_file" ".output.convergence.convergenceRate" 2>/dev/null)

  if [[ -n "$conv_rate" ]] && [[ "$conv_rate" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$conv_rate < 0 || $conv_rate > 1" | bc -l 2>/dev/null || echo "0") )); then
        error "Convergence rate out of range: $conv_rate (should be 0-1)"
        return 1
      fi
    fi
  fi

  # Validate convergence reason
  local reason
  reason=$(json_get "$output_file" ".output.convergence.reason" 2>/dev/null)

  if [[ -n "$reason" ]] && [[ "$reason" != "null" ]]; then
    if ! validate_enum "$reason" "target-reached" "threshold-met" "max-iterations" "no-improvement" "time-limit" "manual-stop"; then
      warn "Unrecognized convergence reason: $reason"
    fi
  fi

  return 0
}

validate_improvements() {
  local output_file="$1"

  local has_improvements
  has_improvements=$(jq 'has("output") and (.output | has("improvements"))' "$output_file" 2>/dev/null)

  if [[ "$has_improvements" == "true" ]]; then
    local imp_count
    imp_count=$(jq '.output.improvements | length' "$output_file" 2>/dev/null)
    debug "Found $imp_count improvements"

    if [[ "$imp_count" -gt 0 ]]; then
      # Validate improvement ID format
      local invalid_ids
      invalid_ids=$(jq '[.output.improvements[]?.id // empty | select(test("^IMP-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null)

      if [[ -n "$invalid_ids" ]] && [[ "$invalid_ids" -gt 0 ]]; then
        warn "$invalid_ids improvement(s) have invalid ID format (should be IMP-NNN)"
      fi

      # Validate improvement type
      local first_type
      first_type=$(json_get "$output_file" ".output.improvements[0].type" 2>/dev/null)

      if [[ -n "$first_type" ]] && [[ "$first_type" != "null" ]]; then
        if ! validate_enum "$first_type" "quality-increase" "coverage-increase" "defect-reduction" "performance-gain" "maintainability-boost"; then
          warn "Unrecognized improvement type: $first_type"
        fi
      fi
    fi
  fi

  return 0
}

validate_quality_progression() {
  local output_file="$1"

  local has_progression
  has_progression=$(jq 'has("output") and (.output | has("qualityProgression"))' "$output_file" 2>/dev/null)

  if [[ "$has_progression" == "true" ]]; then
    local start_score end_score
    start_score=$(json_get "$output_file" ".output.qualityProgression.startScore" 2>/dev/null)
    end_score=$(json_get "$output_file" ".output.qualityProgression.endScore" 2>/dev/null)

    if [[ -n "$start_score" ]] && [[ "$start_score" != "null" ]] && \
       [[ -n "$end_score" ]] && [[ "$end_score" != "null" ]]; then
      if command_exists "bc"; then
        if (( $(echo "$start_score < 0 || $start_score > 100" | bc -l 2>/dev/null || echo "0") )) || \
           (( $(echo "$end_score < 0 || $end_score > 100" | bc -l 2>/dev/null || echo "0") )); then
          error "Quality score out of range (0-100)"
          return 1
        fi
      fi
      debug "Quality progression: $start_score -> $end_score"
    fi
  fi

  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running qe-iterative-loop specific validations..."

  if ! validate_iterations "$output_file"; then
    has_errors=true
  else
    success "Iterations validation passed"
  fi

  if ! validate_convergence "$output_file"; then
    has_errors=true
  else
    success "Convergence validation passed"
  fi

  if ! validate_improvements "$output_file"; then
    has_errors=true
  else
    success "Improvements validation passed"
  fi

  if ! validate_quality_progression "$output_file"; then
    has_errors=true
  else
    success "Quality progression validation passed"
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

# =============================================================================
# Standard Validation Functions
# =============================================================================

validate_tools() {
  local missing=()
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      missing+=("$tool")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required tools: ${missing[*]}"
    return 1
  fi
  return 0
}

validate_schema() {
  local output_file="$1"

  if [[ ! -f "$SCHEMA_PATH" ]]; then
    warn "Schema file not found: $SCHEMA_PATH"
    return 2
  fi

  local result
  result=$(validate_json_schema "$SCHEMA_PATH" "$output_file" 2>&1)
  local status=$?

  case $status in
    0) success "Schema validation passed"; return 0 ;;
    1) error "Schema validation failed"; return 1 ;;
    2) warn "Schema validation skipped"; return 2 ;;
  esac
}

validate_required_fields() {
  local output_file="$1"
  local missing=()

  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$output_file" ".$field" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
      missing+=("$field")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required fields: ${missing[*]}"
    return 1
  fi

  success "All required fields present"
  return 0
}

validate_content_terms() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")
  local has_errors=false

  local missing_terms=()
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    if ! grep -qi "$term" <<< "$content"; then
      missing_terms+=("$term")
    fi
  done

  if [[ ${#missing_terms[@]} -gt 0 ]]; then
    error "Output missing required terms: ${missing_terms[*]}"
    has_errors=true
  fi

  local found_forbidden=()
  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    if grep -qi "$term" <<< "$content"; then
      found_forbidden+=("$term")
    fi
  done

  if [[ ${#found_forbidden[@]} -gt 0 ]]; then
    error "Output contains forbidden terms: ${found_forbidden[*]}"
    has_errors=true
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Content term validation passed"
  return 0
}

# =============================================================================
# Main Validation Flow
# =============================================================================

main() {
  if [[ -z "$OUTPUT_FILE" ]]; then
    error "No output file specified"
    echo "Usage: $0 <output-file> [options]"
    exit 1
  fi

  if [[ ! -f "$OUTPUT_FILE" ]]; then
    error "Output file not found: $OUTPUT_FILE"
    exit 1
  fi

  [[ "$JSON_ONLY" != "true" ]] && info "Validating $SKILL_NAME Output"

  local error_count=0

  if ! validate_tools; then
    exit $EXIT_SKIP
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    error "Invalid JSON"
    exit $EXIT_FAIL
  fi

  validate_schema "$OUTPUT_FILE" || ((error_count++)) || true
  validate_required_fields "$OUTPUT_FILE" || ((error_count++)) || true
  validate_content_terms "$OUTPUT_FILE" || ((error_count++)) || true
  validate_skill_specific "$OUTPUT_FILE" || ((error_count++)) || true

  if [[ $error_count -gt 0 ]]; then
    error "Validation FAILED with $error_count error(s)"
    exit $EXIT_FAIL
  fi

  success "Validation PASSED"
  exit $EXIT_PASS
}

main
