#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-contract-testing v1.0.0
# Validates contract testing skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance
# 2. Required contract fields (contracts, consumers, providers, compatibility)
# 3. Contract structure validation
# 4. Compatibility score ranges
# 5. Breaking change validation
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

SKILL_NAME="qe-contract-testing"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("pact" "node" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.contracts" "output.compatibility")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("contract" "consumer" "provider")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")

ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

MIN_ARRAY_LENGTHS=(
  ".output.contracts:1"
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

validate_contracts() {
  local output_file="$1"

  local contract_count
  contract_count=$(json_count "$output_file" ".output.contracts" 2>/dev/null)

  if [[ -z "$contract_count" ]] || [[ "$contract_count" -lt 1 ]]; then
    error "No contracts found"
    return 1
  fi

  debug "Found $contract_count contracts"

  # Validate contracts have consumer and provider
  local invalid_contracts
  invalid_contracts=$(jq '[.output.contracts[]? | select(.consumer == null or .provider == null)] | length' "$output_file" 2>/dev/null)

  if [[ -n "$invalid_contracts" ]] && [[ "$invalid_contracts" -gt 0 ]]; then
    error "$invalid_contracts contract(s) missing consumer or provider"
    return 1
  fi

  return 0
}

validate_compatibility() {
  local output_file="$1"

  local compat_status compat_score
  compat_status=$(json_get "$output_file" ".output.compatibility.overallStatus" 2>/dev/null)
  compat_score=$(json_get "$output_file" ".output.compatibility.score" 2>/dev/null)

  if [[ -n "$compat_status" ]] && [[ "$compat_status" != "null" ]]; then
    if ! validate_enum "$compat_status" "compatible" "incompatible" "partial" "unknown"; then
      error "Invalid compatibility status: $compat_status"
      return 1
    fi
  fi

  if [[ -n "$compat_score" ]] && [[ "$compat_score" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$compat_score < 0 || $compat_score > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Compatibility score out of range: $compat_score"
        return 1
      fi
    fi
    debug "Compatibility score: $compat_score"
  fi

  return 0
}

validate_breaking_changes() {
  local output_file="$1"

  local has_breaking
  has_breaking=$(jq 'has("output") and (.output | has("breakingChanges"))' "$output_file" 2>/dev/null)

  if [[ "$has_breaking" == "true" ]]; then
    local breaking_count
    breaking_count=$(jq '.output.breakingChanges | length' "$output_file" 2>/dev/null)
    debug "Found $breaking_count breaking changes"

    if [[ "$breaking_count" -gt 0 ]]; then
      # Validate breaking change structure
      local first_type
      first_type=$(json_get "$output_file" ".output.breakingChanges[0].type" 2>/dev/null)

      if [[ -n "$first_type" ]] && [[ "$first_type" != "null" ]]; then
        if ! validate_enum "$first_type" "removed-endpoint" "removed-field" "type-change" "required-field-added" "response-change" "status-code-change" "removed-enum-value" "narrowed-type"; then
          warn "Unrecognized breaking change type: $first_type"
        fi
      fi
    fi
  fi

  return 0
}

validate_can_i_deploy() {
  local output_file="$1"

  local can_deploy compat_status breaking_count
  can_deploy=$(json_get "$output_file" ".output.canIDeploy" 2>/dev/null)
  compat_status=$(json_get "$output_file" ".output.compatibility.overallStatus" 2>/dev/null)
  breaking_count=$(jq '.output.breakingChanges | length' "$output_file" 2>/dev/null || echo "0")

  # If there are breaking changes and canIDeploy is true, warn
  if [[ "$breaking_count" -gt 0 ]] && [[ "$can_deploy" == "true" ]]; then
    warn "canIDeploy is true but $breaking_count breaking change(s) detected"
  fi

  # If compatibility is incompatible and canIDeploy is true, warn
  if [[ "$compat_status" == "incompatible" ]] && [[ "$can_deploy" == "true" ]]; then
    warn "canIDeploy is true but compatibility status is 'incompatible'"
  fi

  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running qe-contract-testing specific validations..."

  if ! validate_contracts "$output_file"; then
    has_errors=true
  else
    success "Contracts validation passed"
  fi

  if ! validate_compatibility "$output_file"; then
    has_errors=true
  else
    success "Compatibility validation passed"
  fi

  if ! validate_breaking_changes "$output_file"; then
    has_errors=true
  else
    success "Breaking changes validation passed"
  fi

  validate_can_i_deploy "$output_file"

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
