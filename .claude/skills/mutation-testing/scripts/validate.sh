#!/bin/bash
# =============================================================================
# AQE Mutation Testing Skill Validator v1.0.0
# Based on: .claude/skills/.validation/templates/validate.template.sh
# =============================================================================
#
# Validates mutation testing skill outputs against the schema and checks
# for mutation-specific content requirements.
#
# Usage: ./validate.sh <output-file> [options]
#
# Options:
#   --self-test    Run validator self-test mode
#   --verbose      Enable verbose output
#   --json         Output results as JSON only
#   --list-tools   Show available validation tools
#   --help         Show this help message
#
# Exit Codes:
#   0 - Validation passed (all checks successful)
#   1 - Validation failed (one or more checks failed)
#   2 - Validation skipped (missing required tools)
#
# =============================================================================

set -euo pipefail

# Get script directory (works even when sourced)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine paths based on where the script is located
# Script is in: .claude/skills/mutation-testing/scripts/
# Skill dir is: .claude/skills/mutation-testing/
# Project root: 3 levels up from skill dir
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source shared library - try multiple locations
VALIDATOR_LIB=""
for lib_path in \
  "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" \
  "$SKILL_DIR/scripts/validator-lib.sh" \
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
  echo "Searched:"
  echo "  - $PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh"
  echo "  - $SKILL_DIR/scripts/validator-lib.sh"
  echo "  - $SCRIPT_DIR/validator-lib.sh"
  echo ""
  echo "Make sure the validator-lib.sh file exists in one of these locations."
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

# Skill name (must match SKILL.md name)
SKILL_NAME="mutation-testing"

# Skill version (for output metadata)
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# jq is required for JSON parsing
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
# Mutation testing frameworks that may have been used
OPTIONAL_TOOLS=("stryker" "pitest" "mutmut" "ajv" "jsonschema" "python3")

# Path to output JSON schema (relative to skill directory)
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Path to sample test data for self-test mode
SAMPLE_OUTPUT_PATH="$SKILL_DIR/test-data/sample-output.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Minimum required fields in output (basic structural validation)
REQUIRED_FIELDS=("skillName" "status" "output" "output.mutationScore" "output.mutants")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

# Terms that MUST appear somewhere in output (case-insensitive)
# Mutation testing domain terminology
MUST_CONTAIN_TERMS=("mutation" "mutant" "killed")

# Terms that must NOT appear in output (indicates failure/hallucination)
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "undefined mutation score")

# Enum fields and their allowed values
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

# Minimum array lengths
# survivors can be empty if mutation score is 100%
MIN_ARRAY_LENGTHS=()

# =============================================================================
# Argument Parsing
# =============================================================================

OUTPUT_FILE=""
SELF_TEST=false
VERBOSE=false
JSON_ONLY=false
LIST_TOOLS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test)
      SELF_TEST=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      export AQE_DEBUG=1
      shift
      ;;
    --json)
      JSON_ONLY=true
      shift
      ;;
    --list-tools)
      LIST_TOOLS=true
      shift
      ;;
    -h|--help)
      cat << 'HELP_EOF'
AQE Mutation Testing Skill Validator

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]
       ./validate.sh --list-tools

Arguments:
  <output-file>     Path to mutation testing skill output JSON file to validate

Options:
  --self-test       Run validator self-test mode
  --verbose, -v     Enable verbose/debug output
  --json            Output results as JSON only (for CI integration)
  --list-tools      Show available validation tools and exit
  --help, -h        Show this help message

Exit Codes:
  0 - Validation passed
  1 - Validation failed
  2 - Validation skipped (missing required tools)

Examples:
  ./validate.sh mutation-results.json           # Validate output file
  ./validate.sh mutation-results.json --json    # JSON output for CI
  ./validate.sh --self-test --verbose           # Self-test with debug
  ./validate.sh --list-tools                    # Show available tools

HELP_EOF
      exit 0
      ;;
    -*)
      error "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
    *)
      OUTPUT_FILE="$1"
      shift
      ;;
  esac
done

# Handle --list-tools mode
if [[ "$LIST_TOOLS" == "true" ]]; then
  echo "=============================================="
  echo "Available Validation Tools for $SKILL_NAME"
  echo "=============================================="
  echo ""
  echo "Required tools:"
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Optional tools (mutation testing frameworks):"
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      local version=""
      case "$tool" in
        stryker) version=$(npx stryker --version 2>/dev/null || echo "installed") ;;
        pitest) version="installed" ;;
        mutmut) version=$(mutmut version 2>/dev/null || echo "installed") ;;
        *) version="installed" ;;
      esac
      echo "  [OK] $tool ($version)"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Schema validation support:"
  if command_exists "ajv"; then
    echo "  [OK] ajv (preferred)"
  elif command_exists "jsonschema"; then
    echo "  [OK] jsonschema CLI"
  elif command_exists "python3" && python3 -c "import jsonschema" 2>/dev/null; then
    echo "  [OK] python3 + jsonschema module"
  else
    echo "  [MISSING] No schema validator available"
  fi
  exit 0
fi

# =============================================================================
# Self-Test Mode
# =============================================================================

if [[ "$SELF_TEST" == "true" ]]; then
  echo "=============================================="
  info "Running $SKILL_NAME Validator Self-Test"
  echo "=============================================="
  echo ""
  echo "Validator version: $AQE_VALIDATOR_VERSION"
  echo "Skill version: $SKILL_VERSION"
  echo ""

  self_test_passed=true
  self_test_warnings=0

  # -------------------------------------------
  # Step 1: Check Required Tools
  # -------------------------------------------
  echo "--- Step 1: Required Tools ---"
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Required tool available: $tool"
    else
      error "Required tool MISSING: $tool"
      self_test_passed=false
    fi
  done
  echo ""

  # -------------------------------------------
  # Step 2: Check Optional Tools
  # -------------------------------------------
  echo "--- Step 2: Optional Tools (Mutation Frameworks) ---"
  available_optional=0
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Optional tool available: $tool"
      ((available_optional++)) || true
    else
      warn "Optional tool missing: $tool"
      ((self_test_warnings++)) || true
    fi
  done

  if [[ $available_optional -eq 0 ]]; then
    warn "No mutation testing frameworks available"
    warn "Install stryker, pitest, or mutmut for full functionality"
    ((self_test_warnings++)) || true
  fi
  echo ""

  # -------------------------------------------
  # Step 3: Check Schema Validation Capability
  # -------------------------------------------
  echo "--- Step 3: Schema Validation Capability ---"
  schema_validator_available=false

  if command_exists "ajv"; then
    success "Schema validator: ajv (preferred)"
    schema_validator_available=true
  elif command_exists "jsonschema"; then
    success "Schema validator: jsonschema CLI"
    schema_validator_available=true
  elif command_exists "python3"; then
    if python3 -c "import jsonschema" 2>/dev/null; then
      success "Schema validator: python3 + jsonschema module"
      schema_validator_available=true
    else
      warn "python3 available but jsonschema module not installed"
      ((self_test_warnings++)) || true
    fi
  fi

  if [[ "$schema_validator_available" == "false" ]]; then
    warn "No schema validator available - schema validation will be skipped"
    ((self_test_warnings++)) || true
  fi
  echo ""

  # -------------------------------------------
  # Step 4: Check Schema File
  # -------------------------------------------
  echo "--- Step 4: Schema File ---"
  if [[ -n "$SCHEMA_PATH" ]] && [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists: $SCHEMA_PATH"

    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema file is valid JSON"
    else
      error "Schema file is NOT valid JSON"
      self_test_passed=false
    fi
  elif [[ -n "$SCHEMA_PATH" ]]; then
    warn "Schema file not found: $SCHEMA_PATH"
    ((self_test_warnings++)) || true
  else
    info "No schema path configured"
  fi
  echo ""

  # -------------------------------------------
  # Step 5: Run Library Self-Test
  # -------------------------------------------
  echo "--- Step 5: Validator Library Self-Test ---"
  if [[ "$VERBOSE" == "true" ]]; then
    if run_self_test --verbose; then
      success "Library self-test passed"
    else
      error "Library self-test FAILED"
      self_test_passed=false
    fi
  else
    if run_self_test 2>/dev/null; then
      success "Library self-test passed"
    else
      error "Library self-test FAILED"
      self_test_passed=false
    fi
  fi
  echo ""

  # -------------------------------------------
  # Self-Test Summary
  # -------------------------------------------
  echo "=============================================="
  echo "Self-Test Summary for $SKILL_NAME"
  echo "=============================================="

  if [[ "$self_test_passed" == "true" ]]; then
    if [[ $self_test_warnings -gt 0 ]]; then
      warn "Self-test PASSED with $self_test_warnings warning(s)"
      echo ""
      echo "The validator is functional but has reduced capabilities."
      echo "Consider installing mutation testing frameworks (stryker, pitest, mutmut)."
      exit 0
    else
      success "Self-test PASSED (all checks successful)"
      exit 0
    fi
  else
    error "Self-test FAILED"
    exit 1
  fi
fi

# =============================================================================
# Validation Functions - MUTATION TESTING SPECIFIC
# =============================================================================

# Check that all required tools are available
validate_tools() {
  if [[ ${#REQUIRED_TOOLS[@]} -eq 0 ]]; then
    debug "No required tools specified"
    return 0
  fi

  local missing=()
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      missing+=("$tool")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required tools: ${missing[*]}"
    echo ""
    echo "Install missing tools and retry:"
    for tool in "${missing[@]}"; do
      echo "  - $tool"
    done
    return 1
  fi

  debug "All required tools available"
  return 0
}

# Validate output against JSON schema
validate_schema() {
  local output_file="$1"

  if [[ -z "$SCHEMA_PATH" ]]; then
    debug "No schema path configured, skipping schema validation"
    return 2
  fi

  if [[ ! -f "$SCHEMA_PATH" ]]; then
    warn "Schema file not found: $SCHEMA_PATH"
    warn "Skipping schema validation"
    return 2
  fi

  debug "Validating against schema: $SCHEMA_PATH"

  local result
  result=$(validate_json_schema "$SCHEMA_PATH" "$output_file" 2>&1)
  local status=$?

  case $status in
    0)
      success "Schema validation passed"
      return 0
      ;;
    1)
      error "Schema validation failed"
      if [[ "$VERBOSE" == "true" ]]; then
        echo "$result" | while read -r line; do
          echo "    $line"
        done
      fi
      return 1
      ;;
    2)
      warn "Schema validation skipped (no validator available)"
      return 2
      ;;
  esac
}

# Validate required fields exist and have values
validate_required_fields() {
  local output_file="$1"
  local missing=()
  local empty=()

  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$output_file" ".$field" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
      missing+=("$field")
    fi
  done

  for field in "${REQUIRED_NON_EMPTY_FIELDS[@]}"; do
    local value
    value=$(json_get "$output_file" ".$field" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]] || [[ "$value" == "" ]] || [[ "$value" == "[]" ]] || [[ "$value" == "{}" ]]; then
      empty+=("$field")
    fi
  done

  local has_errors=false

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required fields: ${missing[*]}"
    has_errors=true
  fi

  if [[ ${#empty[@]} -gt 0 ]]; then
    error "Empty required fields: ${empty[*]}"
    has_errors=true
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "All required fields present and valid"
  return 0
}

# Validate enum fields have allowed values
validate_enum_fields() {
  local output_file="$1"

  if [[ ${#ENUM_VALIDATIONS[@]} -eq 0 ]]; then
    return 0
  fi

  local has_errors=false

  for validation in "${ENUM_VALIDATIONS[@]}"; do
    local field_path="${validation%%:*}"
    local allowed_values="${validation#*:}"

    local actual_value
    actual_value=$(json_get "$output_file" "$field_path" 2>/dev/null)

    if [[ -z "$actual_value" ]] || [[ "$actual_value" == "null" ]]; then
      debug "Enum field $field_path is empty/null (may be optional)"
      continue
    fi

    local found=false
    IFS=',' read -ra allowed_array <<< "$allowed_values"
    for allowed in "${allowed_array[@]}"; do
      if [[ "$actual_value" == "$allowed" ]]; then
        found=true
        break
      fi
    done

    if [[ "$found" == "false" ]]; then
      error "Invalid value for $field_path: '$actual_value' (allowed: $allowed_values)"
      has_errors=true
    else
      debug "Enum field $field_path='$actual_value' is valid"
    fi
  done

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "All enum fields have valid values"
  return 0
}

# Validate content contains expected terms
validate_content_terms() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")

  local has_errors=false

  if [[ ${#MUST_CONTAIN_TERMS[@]} -gt 0 ]]; then
    local missing_terms=()
    for term in "${MUST_CONTAIN_TERMS[@]}"; do
      if ! grep -qi "$term" <<< "$content"; then
        missing_terms+=("$term")
      fi
    done

    if [[ ${#missing_terms[@]} -gt 0 ]]; then
      error "Output missing required mutation testing terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "All required mutation testing terms found"
    fi
  fi

  if [[ ${#MUST_NOT_CONTAIN_TERMS[@]} -gt 0 ]]; then
    local found_forbidden=()
    for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
      if grep -qi "$term" <<< "$content"; then
        found_forbidden+=("$term")
      fi
    done

    if [[ ${#found_forbidden[@]} -gt 0 ]]; then
      error "Output contains forbidden terms: ${found_forbidden[*]}"
      has_errors=true
    else
      success "No forbidden terms found"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

# =============================================================================
# MUTATION TESTING SPECIFIC VALIDATION
# =============================================================================

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false
  local has_warnings=false

  debug "Running mutation testing specific validations..."

  # =========================================================================
  # Validate mutation score is within valid range (0-100)
  # =========================================================================
  local mutation_score
  mutation_score=$(json_get "$output_file" ".output.mutationScore.score" 2>/dev/null)

  if [[ -n "$mutation_score" ]] && [[ "$mutation_score" != "null" ]]; then
    # Check if it's a number
    if [[ "$mutation_score" =~ ^[0-9]+\.?[0-9]*$ ]]; then
      if (( $(echo "$mutation_score < 0" | bc -l 2>/dev/null || echo "0") )); then
        error "Mutation score cannot be negative: $mutation_score"
        has_errors=true
      elif (( $(echo "$mutation_score > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Mutation score cannot exceed 100: $mutation_score"
        has_errors=true
      else
        success "Mutation score is valid: $mutation_score%"
      fi
    else
      error "Mutation score is not a valid number: $mutation_score"
      has_errors=true
    fi
  else
    error "Mutation score is missing or null"
    has_errors=true
  fi

  # =========================================================================
  # Validate killed + survived counts match total (approximately)
  # =========================================================================
  local killed survived total
  killed=$(json_get "$output_file" ".output.mutationScore.killed" 2>/dev/null)
  survived=$(json_get "$output_file" ".output.mutationScore.survived" 2>/dev/null)
  total=$(json_get "$output_file" ".output.mutationScore.total" 2>/dev/null)

  if [[ -n "$killed" ]] && [[ -n "$survived" ]] && [[ -n "$total" ]] && \
     [[ "$killed" != "null" ]] && [[ "$survived" != "null" ]] && [[ "$total" != "null" ]]; then
    # Account for timeout/noCoverage/equivalent mutants
    local timeout noCoverage equivalent
    timeout=$(json_get "$output_file" ".output.mutationScore.timeout" 2>/dev/null || echo "0")
    noCoverage=$(json_get "$output_file" ".output.mutationScore.noCoverage" 2>/dev/null || echo "0")
    equivalent=$(json_get "$output_file" ".output.mutationScore.equivalent" 2>/dev/null || echo "0")

    [[ "$timeout" == "null" ]] && timeout=0
    [[ "$noCoverage" == "null" ]] && noCoverage=0
    [[ "$equivalent" == "null" ]] && equivalent=0

    local sum=$((killed + survived + timeout + noCoverage + equivalent))

    if [[ "$sum" -ne "$total" ]]; then
      warn "Mutant counts don't add up: killed($killed) + survived($survived) + timeout($timeout) + noCoverage($noCoverage) + equivalent($equivalent) = $sum, but total = $total"
      has_warnings=true
    else
      success "Mutant counts are consistent (total: $total)"
    fi
  fi

  # =========================================================================
  # Validate mutation score calculation is correct
  # =========================================================================
  if [[ -n "$killed" ]] && [[ -n "$total" ]] && [[ "$killed" != "null" ]] && [[ "$total" != "null" ]] && [[ "$total" -gt 0 ]]; then
    local expected_score
    expected_score=$(echo "scale=2; $killed * 100 / $total" | bc -l 2>/dev/null || echo "")

    if [[ -n "$expected_score" ]] && [[ -n "$mutation_score" ]]; then
      # Allow for rounding differences (within 1%)
      local diff
      diff=$(echo "scale=2; $mutation_score - $expected_score" | bc -l 2>/dev/null | tr -d '-')

      if [[ -n "$diff" ]] && (( $(echo "$diff > 1" | bc -l 2>/dev/null || echo "0") )); then
        warn "Mutation score ($mutation_score%) differs from calculated ($expected_score%)"
        has_warnings=true
      else
        debug "Mutation score calculation verified"
      fi
    fi
  fi

  # =========================================================================
  # Validate survivors have required fields
  # =========================================================================
  local survivor_count
  survivor_count=$(json_count "$output_file" ".output.survivors" 2>/dev/null)

  if [[ -n "$survivor_count" ]] && [[ "$survivor_count" != "null" ]] && [[ "$survivor_count" -gt 0 ]]; then
    # Check first survivor has required fields
    local first_survivor_id first_survivor_operator first_survivor_file
    first_survivor_id=$(json_get "$output_file" ".output.survivors[0].id" 2>/dev/null)
    first_survivor_operator=$(json_get "$output_file" ".output.survivors[0].operator" 2>/dev/null)
    first_survivor_file=$(json_get "$output_file" ".output.survivors[0].location.file" 2>/dev/null)

    if [[ -z "$first_survivor_id" ]] || [[ "$first_survivor_id" == "null" ]]; then
      error "Surviving mutants missing 'id' field"
      has_errors=true
    fi

    if [[ -z "$first_survivor_operator" ]] || [[ "$first_survivor_operator" == "null" ]]; then
      error "Surviving mutants missing 'operator' field"
      has_errors=true
    fi

    if [[ -z "$first_survivor_file" ]] || [[ "$first_survivor_file" == "null" ]]; then
      warn "Surviving mutants missing location.file - consider adding for better analysis"
      has_warnings=true
    fi

    success "Found $survivor_count surviving mutants with valid structure"
  elif [[ "$survived" -gt 0 ]] && [[ "$survivor_count" -eq 0 ]]; then
    warn "Mutation score shows $survived survivors but survivors array is empty"
    has_warnings=true
  fi

  # =========================================================================
  # Validate operator breakdown totals match
  # =========================================================================
  local operator_count
  operator_count=$(json_count "$output_file" ".output.operatorBreakdown" 2>/dev/null)

  if [[ -n "$operator_count" ]] && [[ "$operator_count" != "null" ]] && [[ "$operator_count" -gt 0 ]]; then
    success "Operator breakdown present with $operator_count operators"
  fi

  # =========================================================================
  # Check for weak tests if survived > 0
  # =========================================================================
  if [[ -n "$survived" ]] && [[ "$survived" != "null" ]] && [[ "$survived" -gt 0 ]]; then
    local weak_test_count
    weak_test_count=$(json_count "$output_file" ".output.weakTests" 2>/dev/null)

    if [[ -z "$weak_test_count" ]] || [[ "$weak_test_count" == "null" ]] || [[ "$weak_test_count" -eq 0 ]]; then
      warn "Surviving mutants exist but no weak tests identified - consider analyzing test effectiveness"
      has_warnings=true
    else
      success "Identified $weak_test_count weak tests for improvement"
    fi
  fi

  # =========================================================================
  # Validate recommendations exist for poor scores
  # =========================================================================
  if [[ -n "$mutation_score" ]] && (( $(echo "$mutation_score < 70" | bc -l 2>/dev/null || echo "0") )); then
    local rec_count
    rec_count=$(json_count "$output_file" ".output.recommendations" 2>/dev/null)

    if [[ -z "$rec_count" ]] || [[ "$rec_count" == "null" ]] || [[ "$rec_count" -eq 0 ]]; then
      warn "Mutation score is below 70% but no recommendations provided"
      has_warnings=true
    else
      success "Found $rec_count recommendations for test improvement"
    fi
  fi

  # =========================================================================
  # Final result
  # =========================================================================
  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  if [[ "$has_warnings" == "true" ]]; then
    warn "Skill-specific validation passed with warnings"
    return 0
  fi

  return 0
}

# =============================================================================
# Main Validation Flow
# =============================================================================

main() {
  # Validate arguments
  if [[ -z "$OUTPUT_FILE" ]]; then
    error "No output file specified"
    echo "Usage: $0 <output-file> [options]"
    echo "Use --help for more information"
    exit 1
  fi

  if [[ ! -f "$OUTPUT_FILE" ]]; then
    error "Output file not found: $OUTPUT_FILE"
    exit 1
  fi

  # Print header (unless JSON-only mode)
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "=============================================="
    info "Validating $SKILL_NAME Output"
    echo "=============================================="
    echo ""
    echo "  Skill:   $SKILL_NAME v$SKILL_VERSION"
    echo "  File:    $OUTPUT_FILE"
    echo "  Schema:  ${SCHEMA_PATH:-none}"
    echo ""
  fi

  # Track validation status
  local tool_status="passed"
  local json_status="passed"
  local schema_status="passed"
  local fields_status="passed"
  local enums_status="passed"
  local content_status="passed"
  local specific_status="passed"

  local error_count=0
  local warning_count=0

  # =========================================
  # Step 1: Check Required Tools
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 1: Tool Availability ---"
  fi

  if ! validate_tools; then
    tool_status="failed"
    ((error_count++)) || true
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "skipped" "skipped" "failed"
    else
      echo ""
      error "Validation cannot proceed without required tools"
    fi
    exit $EXIT_SKIP
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "Tool check passed" && echo ""

  # =========================================
  # Step 2: Validate JSON Syntax
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 2: JSON Syntax ---"
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    json_status="failed"
    ((error_count++)) || true
    if [[ "$JSON_ONLY" != "true" ]]; then
      error "File is not valid JSON - cannot proceed"
    fi
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "failed" "failed" "$tool_status"
    fi
    exit $EXIT_FAIL
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid" && echo ""

  # =========================================
  # Step 3: Validate Against Schema
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 3: Schema Validation ---"
  fi

  local schema_exit_code
  validate_schema "$OUTPUT_FILE" && schema_exit_code=0 || schema_exit_code=$?

  case $schema_exit_code in
    0) [[ "$JSON_ONLY" != "true" ]] && echo "" ;;
    1) schema_status="failed"; ((error_count++)) || true; [[ "$JSON_ONLY" != "true" ]] && echo "" ;;
    2) schema_status="skipped"; ((warning_count++)) || true; [[ "$JSON_ONLY" != "true" ]] && echo "" ;;
  esac

  # =========================================
  # Step 4: Validate Required Fields
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 4: Required Fields ---"
  fi

  if ! validate_required_fields "$OUTPUT_FILE"; then
    fields_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # =========================================
  # Step 5: Validate Enum Values
  # =========================================
  if [[ ${#ENUM_VALIDATIONS[@]} -gt 0 ]]; then
    if [[ "$JSON_ONLY" != "true" ]]; then
      echo "--- Step 5: Enum Validation ---"
    fi

    if ! validate_enum_fields "$OUTPUT_FILE"; then
      enums_status="failed"
      ((error_count++)) || true
    fi

    [[ "$JSON_ONLY" != "true" ]] && echo ""
  fi

  # =========================================
  # Step 6: Validate Content Terms
  # =========================================
  if [[ ${#MUST_CONTAIN_TERMS[@]} -gt 0 ]] || [[ ${#MUST_NOT_CONTAIN_TERMS[@]} -gt 0 ]]; then
    if [[ "$JSON_ONLY" != "true" ]]; then
      echo "--- Step 6: Content Terms ---"
    fi

    if ! validate_content_terms "$OUTPUT_FILE"; then
      content_status="failed"
      ((error_count++)) || true
    fi

    [[ "$JSON_ONLY" != "true" ]] && echo ""
  fi

  # =========================================
  # Step 7: Mutation Testing Specific Validation
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 7: Mutation Testing Specific Validation ---"
  fi

  if ! validate_skill_specific "$OUTPUT_FILE"; then
    specific_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # =========================================
  # Determine Overall Status
  # =========================================
  local overall_status="passed"
  local content_overall="passed"

  if [[ "$fields_status" == "failed" ]] || \
     [[ "$enums_status" == "failed" ]] || \
     [[ "$content_status" == "failed" ]] || \
     [[ "$specific_status" == "failed" ]]; then
    content_overall="failed"
  fi

  if [[ "$json_status" == "failed" ]] || \
     [[ "$schema_status" == "failed" ]] || \
     [[ "$content_overall" == "failed" ]]; then
    overall_status="failed"
  elif [[ "$schema_status" == "skipped" ]]; then
    overall_status="partial"
  fi

  # =========================================
  # Output Results
  # =========================================
  if [[ "$JSON_ONLY" == "true" ]]; then
    output_validation_report "$SKILL_NAME" "$schema_status" "$content_overall" "$tool_status"
  else
    echo "=============================================="
    echo "Validation Summary for $SKILL_NAME"
    echo "=============================================="
    echo ""
    echo "  Tools:            $tool_status"
    echo "  JSON Syntax:      $json_status"
    echo "  Schema:           $schema_status"
    echo "  Fields:           $fields_status"
    echo "  Enums:            $enums_status"
    echo "  Content:          $content_status"
    echo "  Mutation-specific: $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:          $overall_status"
    echo "  Errors:           $error_count"
    echo "  Warnings:         $warning_count"
    echo "=============================================="
    echo ""
  fi

  # =========================================
  # Exit with appropriate code
  # =========================================
  case "$overall_status" in
    "passed")
      [[ "$JSON_ONLY" != "true" ]] && success "Validation PASSED"
      exit $EXIT_PASS
      ;;
    "partial")
      [[ "$JSON_ONLY" != "true" ]] && warn "Validation PARTIAL (some checks skipped)"
      exit $EXIT_PASS
      ;;
    "failed")
      [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED"
      exit $EXIT_FAIL
      ;;
  esac
}

# Run main function
main
