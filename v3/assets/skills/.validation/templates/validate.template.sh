#!/bin/bash
# =============================================================================
# AQE Skill Validator Template v2.0.0
# Copy this template to: .claude/skills/{skill-name}/scripts/validate.sh
# =============================================================================
#
# This template provides a comprehensive validation framework for AQE skills.
# It validates skill outputs against schemas, checks required content, and
# provides graceful degradation when validation tools are unavailable.
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
# Self-Test Mode:
#   When called with --self-test, the validator will:
#   1. Check all required tools are available
#   2. Check all optional tools and report availability
#   3. Validate the schema file exists and is valid JSON
#   4. Run a basic validation with sample test data
#   5. Report overall self-test status
#
# Graceful Degradation:
#   - If required tools are missing, validation exits with code 2
#   - If optional tools are missing, validation continues with reduced checks
#   - Schema validation falls back: ajv -> jsonschema -> python3
#   - JSON parsing falls back: jq -> python3 -> node
#
# =============================================================================

set -euo pipefail

# Get script directory (works even when sourced)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine paths based on where the script is located
# If this is the template in docs/templates, use local paths
# If this is copied to a skill, navigate to project root
if [[ "$SCRIPT_DIR" == *"/docs/templates"* ]]; then
  # Running as template from docs/templates
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  SKILL_DIR="$SCRIPT_DIR"
else
  # Running as installed validator in .claude/skills/{skill}/scripts
  SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  PROJECT_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"
fi

# Source shared library - try multiple locations
VALIDATOR_LIB=""
for lib_path in \
  "$SCRIPT_DIR/validator-lib.sh" \
  "$PROJECT_ROOT/docs/templates/validator-lib.sh" \
  "$SKILL_DIR/scripts/validator-lib.sh"; do
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
  echo "  - $SCRIPT_DIR/validator-lib.sh"
  echo "  - $PROJECT_ROOT/docs/templates/validator-lib.sh"
  echo "  - $SKILL_DIR/scripts/validator-lib.sh"
  echo ""
  echo "Make sure the validator-lib.sh file exists in one of these locations."
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION - MODIFY THIS SECTION
# =============================================================================

# Skill name (should match SKILL.md name)
# Example: "security-testing", "accessibility-testing"
SKILL_NAME="REPLACE_WITH_SKILL_NAME"

# Skill version (for output metadata)
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# These tools are essential for the skill to function
# Example: ("playwright" "axe-core")
REQUIRED_TOOLS=()

# Optional tools (validation continues with warnings if missing)
# These tools enable additional validation capabilities
# Default tools for JSON parsing and schema validation
OPTIONAL_TOOLS=("jq" "ajv" "jsonschema" "python3")

# Path to output JSON schema (relative to skill directory)
# Set to empty string if no schema exists (trust_tier < 1)
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Path to sample test data for self-test mode
# If provided, self-test will validate this file against the schema
# Should be a valid example output from the skill
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/docs/templates/test-data/sample-output.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Minimum required fields in output (basic structural validation)
# These fields are checked even if schema validation is unavailable
REQUIRED_FIELDS=("skillName" "status" "output")

# Fields that must have non-null, non-empty values
# Example: ("output.summary" "output.findings")
REQUIRED_NON_EMPTY_FIELDS=()

# Terms that MUST appear somewhere in output (case-insensitive)
# Use for skill-specific domain terminology
# Example: ("WCAG" "accessibility") for accessibility-testing
MUST_CONTAIN_TERMS=()

# Terms that must NOT appear in output (indicates failure/hallucination)
# Use to catch common LLM errors or invalid outputs
# Example: ("TODO" "placeholder" "example.com")
MUST_NOT_CONTAIN_TERMS=()

# Enum fields and their allowed values
# Format: "field_path:value1,value2,value3"
# Example: (".status:success,partial,failed,skipped")
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

# Minimum array lengths
# Format: "field_path:min_count"
# Example: (".output.findings:0" means findings array must exist but can be empty)
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
AQE Skill Validator

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]
       ./validate.sh --list-tools

Arguments:
  <output-file>     Path to skill output JSON file to validate

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
  ./validate.sh output.json                 # Validate output file
  ./validate.sh output.json --json          # JSON output for CI
  ./validate.sh --self-test --verbose       # Self-test with debug
  ./validate.sh --list-tools                # Show available tools

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
  if [[ ${#REQUIRED_TOOLS[@]} -eq 0 ]]; then
    echo "  (none specified)"
  else
    for tool in "${REQUIRED_TOOLS[@]}"; do
      if command_exists "$tool"; then
        echo "  [OK] $tool"
      else
        echo "  [MISSING] $tool"
      fi
    done
  fi
  echo ""
  echo "Optional tools:"
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
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
  if [[ ${#REQUIRED_TOOLS[@]} -eq 0 ]]; then
    success "No required tools specified"
  else
    for tool in "${REQUIRED_TOOLS[@]}"; do
      if command_exists "$tool"; then
        success "Required tool available: $tool"
      else
        error "Required tool MISSING: $tool"
        self_test_passed=false
      fi
    done
  fi
  echo ""

  # -------------------------------------------
  # Step 2: Check Optional Tools
  # -------------------------------------------
  echo "--- Step 2: Optional Tools ---"
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
    warn "No optional tools available - validation capabilities limited"
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

    # Validate schema is valid JSON
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema file is valid JSON"

      # Check for basic schema structure
      if validate_schema_syntax "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema file has valid structure"
      else
        warn "Schema file may have structural issues"
        ((self_test_warnings++)) || true
      fi
    else
      error "Schema file is NOT valid JSON"
      self_test_passed=false
    fi
  elif [[ -n "$SCHEMA_PATH" ]]; then
    warn "Schema file not found: $SCHEMA_PATH"
    warn "This skill has trust_tier < 1 (no schema validation)"
    ((self_test_warnings++)) || true
  else
    info "No schema path configured (trust_tier 0)"
  fi
  echo ""

  # -------------------------------------------
  # Step 5: Test with Sample Data
  # -------------------------------------------
  echo "--- Step 5: Sample Data Validation ---"
  if [[ -n "$SAMPLE_OUTPUT_PATH" ]] && [[ -f "$SAMPLE_OUTPUT_PATH" ]]; then
    success "Sample output file exists: $SAMPLE_OUTPUT_PATH"

    # Validate sample is valid JSON
    if validate_json "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
      success "Sample output is valid JSON"

      # Test schema validation if available
      if [[ "$schema_validator_available" == "true" ]] && [[ -f "$SCHEMA_PATH" ]]; then
        if validate_json_schema "$SCHEMA_PATH" "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
          success "Sample output passes schema validation"
        else
          error "Sample output FAILS schema validation"
          self_test_passed=false
        fi
      else
        info "Skipping schema validation test (no validator or schema)"
      fi

      # Test required fields
      missing_fields=()
      for field in "${REQUIRED_FIELDS[@]}"; do
        field_value=$(json_get "$SAMPLE_OUTPUT_PATH" ".$field" 2>/dev/null)
        if [[ -z "$field_value" ]] || [[ "$field_value" == "null" ]]; then
          missing_fields+=("$field")
        fi
      done

      if [[ ${#missing_fields[@]} -eq 0 ]]; then
        success "Sample output has all required fields"
      else
        error "Sample output missing fields: ${missing_fields[*]}"
        self_test_passed=false
      fi
    else
      error "Sample output is NOT valid JSON"
      self_test_passed=false
    fi
  else
    info "No sample output file configured or found"
    info "Skipping sample data validation test"
  fi
  echo ""

  # -------------------------------------------
  # Step 6: Run Library Self-Test
  # -------------------------------------------
  echo "--- Step 6: Validator Library Self-Test ---"
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
      echo "Consider installing missing tools for full validation."
      exit 0
    else
      success "Self-test PASSED (all checks successful)"
      exit 0
    fi
  else
    error "Self-test FAILED"
    echo ""
    echo "Required actions:"
    if [[ ${#REQUIRED_TOOLS[@]} -gt 0 ]]; then
      echo "  1. Install missing required tools"
    fi
    echo "  2. Ensure schema file is valid JSON"
    echo "  3. Ensure sample output matches schema"
    exit 1
  fi
fi

# =============================================================================
# Validation Functions - CUSTOMIZE THESE FOR YOUR SKILL
# =============================================================================

# Check that all required tools are available
# Returns: 0 if all present, 1 if any missing
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
# Returns: 0=passed, 1=failed, 2=skipped
validate_schema() {
  local output_file="$1"

  # Check if schema validation is configured
  if [[ -z "$SCHEMA_PATH" ]]; then
    debug "No schema path configured, skipping schema validation"
    return 2
  fi

  if [[ ! -f "$SCHEMA_PATH" ]]; then
    warn "Schema file not found: $SCHEMA_PATH"
    warn "Skipping schema validation (trust_tier < 1)"
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
# Returns: 0 if all present, 1 if any missing
validate_required_fields() {
  local output_file="$1"
  local missing=()
  local empty=()

  # Check required fields exist
  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$output_file" ".$field" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
      missing+=("$field")
    fi
  done

  # Check required non-empty fields
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
# Returns: 0 if all valid, 1 if any invalid
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

    # Convert comma-separated to array and check
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

# Validate array fields have minimum lengths
# Returns: 0 if all valid, 1 if any too short
validate_array_lengths() {
  local output_file="$1"

  if [[ ${#MIN_ARRAY_LENGTHS[@]} -eq 0 ]]; then
    return 0
  fi

  local has_errors=false

  for validation in "${MIN_ARRAY_LENGTHS[@]}"; do
    local field_path="${validation%%:*}"
    local min_length="${validation#*:}"

    local actual_count
    actual_count=$(json_count "$output_file" "$field_path" 2>/dev/null)

    if [[ -z "$actual_count" ]] || [[ "$actual_count" == "null" ]]; then
      actual_count=0
    fi

    if [[ "$actual_count" -lt "$min_length" ]]; then
      error "Array $field_path has $actual_count items (minimum: $min_length)"
      has_errors=true
    else
      debug "Array $field_path has $actual_count items (>= $min_length)"
    fi
  done

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

# Validate content contains expected terms
# Returns: 0 if valid, 1 if invalid
validate_content_terms() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")

  local has_errors=false

  # Check must-contain terms
  if [[ ${#MUST_CONTAIN_TERMS[@]} -gt 0 ]]; then
    local missing_terms=()
    for term in "${MUST_CONTAIN_TERMS[@]}"; do
      if ! grep -qi "$term" <<< "$content"; then
        missing_terms+=("$term")
      fi
    done

    if [[ ${#missing_terms[@]} -gt 0 ]]; then
      error "Output missing required terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "All required terms found"
    fi
  fi

  # Check must-not-contain terms
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
# SKILL-SPECIFIC VALIDATION - CUSTOMIZE THIS FUNCTION
# =============================================================================

# Add your skill-specific validation logic here
# This function is called after all standard validations pass
#
# Example validations:
#   - Check specific field values make sense
#   - Validate relationships between fields
#   - Check business logic constraints
#   - Verify output completeness
#
# Returns: 0 if valid, 1 if invalid
validate_skill_specific() {
  local output_file="$1"

  debug "Running skill-specific validations..."

  # ==========================================================================
  # EXAMPLE 1: Check that findings array has at least one item
  # ==========================================================================
  # local finding_count
  # finding_count=$(json_count "$output_file" ".output.findings")
  # if [[ -z "$finding_count" ]] || [[ "$finding_count" -lt 1 ]]; then
  #   warn "No findings in output - is this expected?"
  # fi

  # ==========================================================================
  # EXAMPLE 2: Validate severity levels are consistent
  # ==========================================================================
  # local critical_count high_count
  # critical_count=$(json_count "$output_file" '.output.findings | map(select(.severity == "critical"))')
  # high_count=$(json_count "$output_file" '.output.findings | map(select(.severity == "high"))')
  # if [[ "$critical_count" -gt 0 ]] && [[ "$high_count" -eq 0 ]]; then
  #   warn "Critical findings exist but no high-severity findings - review classification"
  # fi

  # ==========================================================================
  # EXAMPLE 3: Check for specific domain terms based on skill
  # ==========================================================================
  # local summary
  # summary=$(json_get "$output_file" ".output.summary")
  # if [[ "$SKILL_NAME" == "security-testing" ]]; then
  #   if ! grep -qi "security\|vulnerability\|risk" <<< "$summary"; then
  #     warn "Security testing output should mention security concepts"
  #   fi
  # fi

  # ==========================================================================
  # EXAMPLE 4: Validate cross-field relationships
  # ==========================================================================
  # local status findings_count
  # status=$(json_get "$output_file" ".status")
  # findings_count=$(json_count "$output_file" ".output.findings")
  # if [[ "$status" == "success" ]] && [[ "$findings_count" -gt 10 ]]; then
  #   warn "Status is 'success' but many findings exist - should status be 'partial'?"
  # fi

  # ==========================================================================
  # ADD YOUR SKILL-SPECIFIC VALIDATIONS BELOW THIS LINE
  # ==========================================================================

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

  # Track validation status for each category
  local tool_status="passed"
  local json_status="passed"
  local schema_status="passed"
  local fields_status="passed"
  local enums_status="passed"
  local arrays_status="passed"
  local content_status="passed"
  local specific_status="passed"

  # Track errors and warnings
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
    # Can't continue if JSON is invalid
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

  # Call validate_schema and capture exit code (|| true prevents set -e from exiting)
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
  # Step 6: Validate Array Lengths
  # =========================================
  if [[ ${#MIN_ARRAY_LENGTHS[@]} -gt 0 ]]; then
    if [[ "$JSON_ONLY" != "true" ]]; then
      echo "--- Step 6: Array Validation ---"
    fi

    if ! validate_array_lengths "$OUTPUT_FILE"; then
      arrays_status="failed"
      ((error_count++)) || true
    fi

    [[ "$JSON_ONLY" != "true" ]] && echo ""
  fi

  # =========================================
  # Step 7: Validate Content Terms
  # =========================================
  if [[ ${#MUST_CONTAIN_TERMS[@]} -gt 0 ]] || [[ ${#MUST_NOT_CONTAIN_TERMS[@]} -gt 0 ]]; then
    if [[ "$JSON_ONLY" != "true" ]]; then
      echo "--- Step 7: Content Terms ---"
    fi

    if ! validate_content_terms "$OUTPUT_FILE"; then
      content_status="failed"
      ((error_count++)) || true
    fi

    [[ "$JSON_ONLY" != "true" ]] && echo ""
  fi

  # =========================================
  # Step 8: Skill-Specific Validation
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 8: Skill-Specific Validation ---"
  fi

  if ! validate_skill_specific "$OUTPUT_FILE"; then
    specific_status="failed"
    ((error_count++)) || true
  else
    [[ "$JSON_ONLY" != "true" ]] && success "Skill-specific validation passed"
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # =========================================
  # Determine Overall Status
  # =========================================
  local overall_status="passed"
  local content_overall="passed"

  # Aggregate content validations
  if [[ "$fields_status" == "failed" ]] || \
     [[ "$enums_status" == "failed" ]] || \
     [[ "$arrays_status" == "failed" ]] || \
     [[ "$content_status" == "failed" ]] || \
     [[ "$specific_status" == "failed" ]]; then
    content_overall="failed"
  fi

  # Determine overall
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
    echo "  Tools:        $tool_status"
    echo "  JSON Syntax:  $json_status"
    echo "  Schema:       $schema_status"
    echo "  Fields:       $fields_status"
    if [[ ${#ENUM_VALIDATIONS[@]} -gt 0 ]]; then
      echo "  Enums:        $enums_status"
    fi
    if [[ ${#MIN_ARRAY_LENGTHS[@]} -gt 0 ]]; then
      echo "  Arrays:       $arrays_status"
    fi
    if [[ ${#MUST_CONTAIN_TERMS[@]} -gt 0 ]] || [[ ${#MUST_NOT_CONTAIN_TERMS[@]} -gt 0 ]]; then
      echo "  Content:      $content_status"
    fi
    echo "  Skill-specific: $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:      $overall_status"
    echo "  Errors:       $error_count"
    echo "  Warnings:     $warning_count"
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
      exit $EXIT_PASS  # Partial is still success
      ;;
    "failed")
      [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED"
      exit $EXIT_FAIL
      ;;
  esac
}

# Run main function
main
