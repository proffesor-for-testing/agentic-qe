#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-defect-intelligence v1.0.0
# Validates defect intelligence skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance
# 2. Required defect fields (predictions, patterns, clusters)
# 3. Prediction probability ranges (0-1)
# 4. Pattern frequency validation
# 5. Cluster structure validation
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

SKILL_NAME="qe-defect-intelligence"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.predictions" "output.riskScore")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("defect" "prediction" "risk")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")

ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

MIN_ARRAY_LENGTHS=(
  ".output.predictions:1"
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

validate_predictions() {
  local output_file="$1"

  local pred_count
  pred_count=$(json_count "$output_file" ".output.predictions" 2>/dev/null)

  if [[ -z "$pred_count" ]] || [[ "$pred_count" -lt 1 ]]; then
    error "No predictions found"
    return 1
  fi

  debug "Found $pred_count predictions"

  # Validate prediction ID format
  local invalid_ids
  invalid_ids=$(jq '[.output.predictions[]?.id // empty | select(test("^PRED-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null)

  if [[ -n "$invalid_ids" ]] && [[ "$invalid_ids" -gt 0 ]]; then
    warn "$invalid_ids prediction(s) have invalid ID format (should be PRED-NNN)"
  fi

  # Validate probability ranges
  local out_of_range
  out_of_range=$(jq '[.output.predictions[]? | select(.probability < 0 or .probability > 1)] | length' "$output_file" 2>/dev/null)

  if [[ -n "$out_of_range" ]] && [[ "$out_of_range" -gt 0 ]]; then
    error "$out_of_range prediction(s) have probability out of range (0-1)"
    return 1
  fi

  # Validate defect types
  local first_type
  first_type=$(json_get "$output_file" ".output.predictions[0].defectType" 2>/dev/null)

  if [[ -n "$first_type" ]] && [[ "$first_type" != "null" ]]; then
    if ! validate_enum "$first_type" "logic-error" "null-pointer" "race-condition" "resource-leak" "security-flaw" "performance-issue" "boundary-error" "type-error"; then
      warn "Unrecognized defect type: $first_type"
    fi
  fi

  return 0
}

validate_patterns() {
  local output_file="$1"

  local has_patterns
  has_patterns=$(jq 'has("output") and (.output | has("patterns"))' "$output_file" 2>/dev/null)

  if [[ "$has_patterns" == "true" ]]; then
    local pattern_count
    pattern_count=$(jq '.output.patterns | length' "$output_file" 2>/dev/null)
    debug "Found $pattern_count patterns"

    if [[ "$pattern_count" -gt 0 ]]; then
      # Validate pattern ID format
      local invalid_ids
      invalid_ids=$(jq '[.output.patterns[]?.id // empty | select(test("^PATT-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null)

      if [[ -n "$invalid_ids" ]] && [[ "$invalid_ids" -gt 0 ]]; then
        warn "$invalid_ids pattern(s) have invalid ID format (should be PATT-NNN)"
      fi

      # Validate frequency is positive
      local invalid_freq
      invalid_freq=$(jq '[.output.patterns[]? | select(.frequency < 1)] | length' "$output_file" 2>/dev/null)

      if [[ -n "$invalid_freq" ]] && [[ "$invalid_freq" -gt 0 ]]; then
        error "$invalid_freq pattern(s) have invalid frequency (must be >= 1)"
        return 1
      fi
    fi
  fi

  return 0
}

validate_clusters() {
  local output_file="$1"

  local has_clusters
  has_clusters=$(jq 'has("output") and (.output | has("clusters"))' "$output_file" 2>/dev/null)

  if [[ "$has_clusters" == "true" ]]; then
    local cluster_count
    cluster_count=$(jq '.output.clusters | length' "$output_file" 2>/dev/null)
    debug "Found $cluster_count clusters"

    if [[ "$cluster_count" -gt 0 ]]; then
      # Validate cluster structure
      local invalid_clusters
      invalid_clusters=$(jq '[.output.clusters[]? | select(.defectCount < 1)] | length' "$output_file" 2>/dev/null)

      if [[ -n "$invalid_clusters" ]] && [[ "$invalid_clusters" -gt 0 ]]; then
        error "$invalid_clusters cluster(s) have invalid defect count (must be >= 1)"
        return 1
      fi

      # Validate cluster type
      local first_type
      first_type=$(json_get "$output_file" ".output.clusters[0].type" 2>/dev/null)

      if [[ -n "$first_type" ]] && [[ "$first_type" != "null" ]]; then
        if ! validate_enum "$first_type" "spatial" "temporal" "categorical" "author-based" "module-based"; then
          warn "Unrecognized cluster type: $first_type"
        fi
      fi
    fi
  fi

  return 0
}

validate_risk_score() {
  local output_file="$1"

  local score_value score_max
  score_value=$(json_get "$output_file" ".output.riskScore.value" 2>/dev/null)
  score_max=$(json_get "$output_file" ".output.riskScore.max" 2>/dev/null)

  if [[ -z "$score_value" ]] || [[ "$score_value" == "null" ]]; then
    error "Missing risk score value"
    return 1
  fi

  if [[ -z "$score_max" ]] || [[ "$score_max" == "null" ]]; then
    error "Missing risk score max"
    return 1
  fi

  if command_exists "bc"; then
    if (( $(echo "$score_value < 0 || $score_value > $score_max" | bc -l 2>/dev/null || echo "0") )); then
      error "Risk score out of range: $score_value/$score_max"
      return 1
    fi
  fi

  debug "Risk score: $score_value/$score_max"
  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running qe-defect-intelligence specific validations..."

  if ! validate_predictions "$output_file"; then
    has_errors=true
  else
    success "Predictions validation passed"
  fi

  if ! validate_risk_score "$output_file"; then
    has_errors=true
  else
    success "Risk score validation passed"
  fi

  if ! validate_patterns "$output_file"; then
    has_errors=true
  else
    success "Patterns validation passed"
  fi

  if ! validate_clusters "$output_file"; then
    has_errors=true
  else
    success "Clusters validation passed"
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
