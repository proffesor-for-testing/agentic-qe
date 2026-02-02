#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-coverage-analysis v1.0.0
# Validates coverage analysis skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance
# 2. Required coverage fields (coverageMap, gaps, riskScores)
# 3. Coverage percentage ranges (0-100)
# 4. Gap severity validation
# 5. Risk score calculation consistency
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

SKILL_NAME="qe-coverage-analysis"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("nyc" "istanbul" "c8" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.coverageMap" "output.overallCoverage")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("coverage" "gap")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")

ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
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

validate_coverage_percentages() {
  local output_file="$1"

  local line_cov branch_cov func_cov
  line_cov=$(json_get "$output_file" ".output.overallCoverage.lineCoverage" 2>/dev/null)
  branch_cov=$(json_get "$output_file" ".output.overallCoverage.branchCoverage" 2>/dev/null)
  func_cov=$(json_get "$output_file" ".output.overallCoverage.functionCoverage" 2>/dev/null)

  if [[ -n "$line_cov" ]] && [[ "$line_cov" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$line_cov < 0 || $line_cov > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Line coverage out of range: $line_cov"
        return 1
      fi
    fi
    debug "Line coverage: $line_cov%"
  else
    error "Missing line coverage"
    return 1
  fi

  if [[ -n "$branch_cov" ]] && [[ "$branch_cov" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$branch_cov < 0 || $branch_cov > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Branch coverage out of range: $branch_cov"
        return 1
      fi
    fi
    debug "Branch coverage: $branch_cov%"
  fi

  if [[ -n "$func_cov" ]] && [[ "$func_cov" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$func_cov < 0 || $func_cov > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Function coverage out of range: $func_cov"
        return 1
      fi
    fi
    debug "Function coverage: $func_cov%"
  fi

  return 0
}

validate_coverage_gaps() {
  local output_file="$1"

  local has_gaps
  has_gaps=$(jq 'has("output") and (.output | has("gaps"))' "$output_file" 2>/dev/null)

  if [[ "$has_gaps" == "true" ]]; then
    local gap_count
    gap_count=$(jq '.output.gaps | length' "$output_file" 2>/dev/null)
    debug "Found $gap_count coverage gaps"

    if [[ "$gap_count" -gt 0 ]]; then
      # Validate gap ID format
      local invalid_ids
      invalid_ids=$(jq '[.output.gaps[]?.id // empty | select(test("^GAP-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null)

      if [[ -n "$invalid_ids" ]] && [[ "$invalid_ids" -gt 0 ]]; then
        warn "$invalid_ids gap(s) have invalid ID format (should be GAP-NNN)"
      fi

      # Validate gap type
      local first_type
      first_type=$(json_get "$output_file" ".output.gaps[0].type" 2>/dev/null)

      if [[ -n "$first_type" ]] && [[ "$first_type" != "null" ]]; then
        if ! validate_enum "$first_type" "uncovered-function" "uncovered-branch" "uncovered-lines" "low-coverage-module" "critical-path-uncovered"; then
          warn "Unrecognized gap type: $first_type"
        fi
      fi
    fi
  fi

  return 0
}

validate_risk_scores() {
  local output_file="$1"

  local has_risks
  has_risks=$(jq 'has("output") and (.output | has("riskScores"))' "$output_file" 2>/dev/null)

  if [[ "$has_risks" == "true" ]]; then
    local risk_count
    risk_count=$(jq '.output.riskScores | length' "$output_file" 2>/dev/null)
    debug "Found $risk_count risk scores"

    if [[ "$risk_count" -gt 0 ]]; then
      # Validate risk score range
      local out_of_range
      out_of_range=$(jq '[.output.riskScores[]? | select(.score < 0 or .score > 100)] | length' "$output_file" 2>/dev/null)

      if [[ -n "$out_of_range" ]] && [[ "$out_of_range" -gt 0 ]]; then
        error "$out_of_range risk score(s) out of range (0-100)"
        return 1
      fi
    fi
  fi

  return 0
}

validate_coverage_map() {
  local output_file="$1"

  local has_files has_functions
  has_files=$(jq 'has("output") and (.output | has("coverageMap")) and (.output.coverageMap | has("files"))' "$output_file" 2>/dev/null)
  has_functions=$(jq 'has("output") and (.output | has("coverageMap")) and (.output.coverageMap | has("functions"))' "$output_file" 2>/dev/null)

  if [[ "$has_files" == "true" ]]; then
    local file_count
    file_count=$(jq '.output.coverageMap.files | length' "$output_file" 2>/dev/null)
    debug "Coverage map has $file_count files"

    # Validate file coverage ranges
    if [[ "$file_count" -gt 0 ]]; then
      local invalid_cov
      invalid_cov=$(jq '[.output.coverageMap.files[]? | select(.lineCoverage < 0 or .lineCoverage > 100)] | length' "$output_file" 2>/dev/null)

      if [[ -n "$invalid_cov" ]] && [[ "$invalid_cov" -gt 0 ]]; then
        error "$invalid_cov file(s) have invalid coverage percentage"
        return 1
      fi
    fi
  fi

  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running qe-coverage-analysis specific validations..."

  if ! validate_coverage_percentages "$output_file"; then
    has_errors=true
  else
    success "Coverage percentages validation passed"
  fi

  if ! validate_coverage_map "$output_file"; then
    has_errors=true
  else
    success "Coverage map validation passed"
  fi

  if ! validate_coverage_gaps "$output_file"; then
    has_errors=true
  else
    success "Coverage gaps validation passed"
  fi

  if ! validate_risk_scores "$output_file"; then
    has_errors=true
  else
    success "Risk scores validation passed"
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
