#!/bin/bash
# =============================================================================
# AQE API Testing Patterns Skill Validator v1.0.0
# Validates output from the api-testing-patterns skill per ADR-056
# =============================================================================
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

# Navigate to skill directory and project root
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

# Source shared library - try multiple locations
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
  echo "Searched:"
  echo "  - $PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh"
  echo "  - $SKILL_DIR/../.validation/templates/validator-lib.sh"
  echo "  - $SCRIPT_DIR/validator-lib.sh"
  echo ""
  echo "Make sure the validator-lib.sh file exists in one of these locations."
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

# Skill name (must match SKILL.md name)
SKILL_NAME="api-testing-patterns"

# Skill version
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# jq is essential for JSON parsing in API testing validation
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
# These enable enhanced validation capabilities
OPTIONAL_TOOLS=("node" "supertest" "pact" "ajv" "jsonschema" "python3")

# Path to output JSON schema
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Path to sample test data for self-test mode
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/.claude/skills/.validation/test-data/sample-output.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Minimum required fields in output (basic structural validation)
REQUIRED_FIELDS=("skillName" "status" "output" "output.testingLevel" "output.endpointCoverage")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.testingLevel")

# Terms that MUST appear somewhere in output (case-insensitive)
# API testing outputs should mention these concepts
MUST_CONTAIN_TERMS=("api" "test")

# Terms that must NOT appear in output (indicates failure/hallucination)
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder" "example.com" "lorem ipsum")

# Enum fields and their allowed values
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
  ".output.testingLevel:contract,component,integration,e2e,load,mixed"
  ".output.apiType:rest,graphql,grpc,websocket,mixed"
)

# Minimum array lengths
MIN_ARRAY_LENGTHS=(
  ".output.endpointCoverage.totalEndpoints:0"
)

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
AQE API Testing Patterns Skill Validator

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

API Testing Specific Validations:
  - Validates endpoint coverage structure
  - Checks for valid HTTP methods (GET, POST, PUT, PATCH, DELETE)
  - Verifies contract testing specifications
  - Validates test recommendation structure
  - Checks for proper status code coverage

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
  echo "Optional tools (enhance validation):"
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Tool purposes:"
  echo "  - jq: JSON parsing and validation (required)"
  echo "  - node: JavaScript runtime for test execution"
  echo "  - supertest: HTTP assertion library for integration tests"
  echo "  - pact: Consumer-driven contract testing"
  echo "  - ajv: JSON Schema validation"
  echo "  - jsonschema: Alternative JSON Schema validation"
  echo "  - python3: Fallback JSON parsing"
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
  # Step 3: Check Schema File
  # -------------------------------------------
  echo "--- Step 3: Schema File ---"
  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists: $SCHEMA_PATH"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema file is valid JSON"
    else
      error "Schema file is NOT valid JSON"
      self_test_passed=false
    fi
  else
    error "Schema file not found: $SCHEMA_PATH"
    self_test_passed=false
  fi
  echo ""

  # -------------------------------------------
  # Step 4: Validate API-Specific Structures
  # -------------------------------------------
  echo "--- Step 4: API Testing Schema Definitions ---"
  if [[ -f "$SCHEMA_PATH" ]]; then
    # Check for API-specific schema definitions
    has_endpoint=$(jq 'has("$defs") and (."$defs" | has("endpoint"))' "$SCHEMA_PATH" 2>/dev/null)
    has_contract=$(jq 'has("$defs") and (."$defs" | has("contract"))' "$SCHEMA_PATH" 2>/dev/null)
    has_coverage=$(jq 'has("$defs") and (."$defs" | has("endpointCoverage"))' "$SCHEMA_PATH" 2>/dev/null)

    if [[ "$has_endpoint" == "true" ]]; then
      success "Schema has endpoint definition"
    else
      warn "Schema missing endpoint definition"
      ((self_test_warnings++)) || true
    fi

    if [[ "$has_contract" == "true" ]]; then
      success "Schema has contract definition"
    else
      warn "Schema missing contract definition"
      ((self_test_warnings++)) || true
    fi

    if [[ "$has_coverage" == "true" ]]; then
      success "Schema has endpointCoverage definition"
    else
      warn "Schema missing endpointCoverage definition"
      ((self_test_warnings++)) || true
    fi
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
      echo "Consider installing missing tools for full validation:"
      echo "  npm install -g supertest pact ajv"
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
# Validation Functions - API Testing Specific
# =============================================================================

# Check that all required tools are available
validate_tools() {
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
    return 2
  fi

  debug "Validating against schema: $SCHEMA_PATH"

  local result
  result=$(validate_json_schema "$SCHEMA_PATH" "$output_file" 2>&1)
  local status=$?

  case $status in
    0) success "Schema validation passed"; return 0 ;;
    1)
      error "Schema validation failed"
      if [[ "$VERBOSE" == "true" ]]; then
        echo "$result" | while read -r line; do
          echo "    $line"
        done
      fi
      return 1
      ;;
    2) warn "Schema validation skipped (no validator available)"; return 2 ;;
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
      error "Output missing required terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "All required terms found"
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
# SKILL-SPECIFIC VALIDATION - API Testing Patterns
# =============================================================================

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false
  local has_warnings=false

  debug "Running API testing specific validations..."

  # ==========================================================================
  # Validation 1: Check endpoint coverage structure
  # ==========================================================================
  local total_endpoints covered_endpoints
  total_endpoints=$(json_get "$output_file" ".output.endpointCoverage.totalEndpoints" 2>/dev/null)
  covered_endpoints=$(json_get "$output_file" ".output.endpointCoverage.coveredEndpoints" 2>/dev/null)

  if [[ -n "$total_endpoints" ]] && [[ "$total_endpoints" != "null" ]] && [[ -n "$covered_endpoints" ]] && [[ "$covered_endpoints" != "null" ]]; then
    if [[ "$covered_endpoints" -gt "$total_endpoints" ]]; then
      error "Covered endpoints ($covered_endpoints) cannot exceed total endpoints ($total_endpoints)"
      has_errors=true
    else
      debug "Endpoint coverage valid: $covered_endpoints / $total_endpoints"
    fi
  fi

  # ==========================================================================
  # Validation 2: Validate HTTP methods in endpoints
  # ==========================================================================
  local valid_methods=("GET" "POST" "PUT" "PATCH" "DELETE" "OPTIONS" "HEAD")
  local uncovered_endpoints
  uncovered_endpoints=$(jq -r '.output.endpointCoverage.uncoveredEndpoints[]?.method // empty' "$output_file" 2>/dev/null)

  if [[ -n "$uncovered_endpoints" ]]; then
    while IFS= read -r method; do
      local is_valid=false
      for valid in "${valid_methods[@]}"; do
        if [[ "$method" == "$valid" ]]; then
          is_valid=true
          break
        fi
      done
      if [[ "$is_valid" == "false" ]]; then
        error "Invalid HTTP method in uncovered endpoints: $method"
        has_errors=true
      fi
    done <<< "$uncovered_endpoints"
  fi

  # ==========================================================================
  # Validation 3: Check test recommendations have proper structure
  # ==========================================================================
  local rec_count
  rec_count=$(json_count "$output_file" ".output.testRecommendations" 2>/dev/null)

  if [[ -n "$rec_count" ]] && [[ "$rec_count" != "null" ]] && [[ "$rec_count" -gt 0 ]]; then
    # Check each recommendation has required fields
    local invalid_recs
    invalid_recs=$(jq '[.output.testRecommendations[]? | select(.id == null or .testType == null or .endpoint == null or .description == null)] | length' "$output_file" 2>/dev/null)

    if [[ "$invalid_recs" -gt 0 ]]; then
      warn "$invalid_recs test recommendation(s) missing required fields (id, testType, endpoint, description)"
      has_warnings=true
    else
      debug "All test recommendations have required structure"
    fi
  fi

  # ==========================================================================
  # Validation 4: Validate contract testing structure if present
  # ==========================================================================
  local has_contracts
  has_contracts=$(jq 'has("output") and (.output | has("contractTests"))' "$output_file" 2>/dev/null)

  if [[ "$has_contracts" == "true" ]]; then
    local can_deploy
    can_deploy=$(json_get "$output_file" ".output.contractTests.canIDeploy" 2>/dev/null)

    # If there are breaking changes, canIDeploy should be false
    local breaking_count
    breaking_count=$(json_count "$output_file" ".output.contractTests.breakingChanges" 2>/dev/null)

    if [[ -n "$breaking_count" ]] && [[ "$breaking_count" -gt 0 ]] && [[ "$can_deploy" == "true" ]]; then
      warn "canIDeploy is true but breaking changes detected - verify deployment safety"
      has_warnings=true
    fi

    debug "Contract testing structure validated"
  fi

  # ==========================================================================
  # Validation 5: Check API finding IDs follow pattern
  # ==========================================================================
  local invalid_finding_ids
  invalid_finding_ids=$(jq '[.output.findings[]?.id // empty | select(test("^API-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null)

  if [[ -n "$invalid_finding_ids" ]] && [[ "$invalid_finding_ids" -gt 0 ]]; then
    warn "$invalid_finding_ids finding(s) have invalid ID format (should be API-NNN)"
    has_warnings=true
  fi

  # ==========================================================================
  # Validation 6: Validate test scenario categories
  # ==========================================================================
  local valid_categories=("happy-path" "error-handling" "auth" "validation" "idempotency" "concurrency" "rate-limiting" "pagination" "filtering" "sorting")
  local invalid_categories
  invalid_categories=$(jq -r '[.output.testRecommendations[]?.scenarios[]?.category // empty] | unique[]' "$output_file" 2>/dev/null)

  if [[ -n "$invalid_categories" ]]; then
    while IFS= read -r category; do
      local is_valid=false
      for valid in "${valid_categories[@]}"; do
        if [[ "$category" == "$valid" ]]; then
          is_valid=true
          break
        fi
      done
      if [[ "$is_valid" == "false" ]] && [[ -n "$category" ]]; then
        warn "Unrecognized test scenario category: $category"
        has_warnings=true
      fi
    done <<< "$invalid_categories"
  fi

  # ==========================================================================
  # Return Result
  # ==========================================================================
  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  if [[ "$has_warnings" == "true" ]]; then
    warn "API testing validation passed with warnings"
  else
    success "API testing specific validation passed"
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
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 5: Enum Validation ---"
  fi

  if ! validate_enum_fields "$OUTPUT_FILE"; then
    enums_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # =========================================
  # Step 6: Validate Content Terms
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 6: Content Terms ---"
  fi

  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # =========================================
  # Step 7: API Testing Specific Validation
  # =========================================
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 7: API Testing Specific Validation ---"
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
    echo "  Tools:           $tool_status"
    echo "  JSON Syntax:     $json_status"
    echo "  Schema:          $schema_status"
    echo "  Fields:          $fields_status"
    echo "  Enums:           $enums_status"
    echo "  Content:         $content_status"
    echo "  API-specific:    $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:         $overall_status"
    echo "  Errors:          $error_count"
    echo "  Warnings:        $warning_count"
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
