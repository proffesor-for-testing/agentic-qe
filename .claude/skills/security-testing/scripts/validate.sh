#!/bin/bash
# =============================================================================
# AQE Skill Validator: security-testing v1.0.0
# Validates security testing skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (OWASP Top 10, CWE, CVSS structure)
# 2. Required security tools availability (npm, semgrep, trivy)
# 3. OWASP category coverage and completeness
# 4. Finding and recommendation structure
# 5. Security-specific content validation
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
#   0 - Validation passed
#   1 - Validation failed
#   2 - Validation skipped (missing required tools)
#
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Navigate to skill directory and project root
# scripts/ -> security-testing/ -> skills/ -> .claude/ -> project root
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source validator library - check multiple locations
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
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

# Skill name and version
SKILL_NAME="security-testing"
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# jq is essential for JSON parsing
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
# These enhance security scanning capabilities
OPTIONAL_TOOLS=("npm" "semgrep" "trivy" "ajv" "jsonschema" "python3")

# Path to output JSON schema
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Path to sample test data for self-test
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/.claude/skills/.validation/examples/security-testing-output.example.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required fields in output
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.findings" "output.owaspCategories")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

# Security-specific terms that MUST appear in output
MUST_CONTAIN_TERMS=("OWASP" "security" "vulnerability")

# Terms that must NOT appear in output (indicates failure/hallucination)
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

# Enum validations
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

# Minimum array lengths
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
AQE Security Testing Skill Validator v1.0.0

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

Security Tool Requirements:
  Required:  jq (JSON parsing)
  Optional:  npm (dependency audit), semgrep (SAST), trivy (container/deps)

Examples:
  ./validate.sh security-output.json              # Validate output file
  ./validate.sh security-output.json --json       # JSON output for CI
  ./validate.sh --self-test --verbose             # Self-test with debug
  ./validate.sh --list-tools                      # Show available tools

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
  echo "Required tools (validation fails if missing):"
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      version=$($tool --version 2>&1 | head -1 || echo "installed")
      echo "  [OK] $tool - $version"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Optional tools (enhances validation):"
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      version=""
      case "$tool" in
        npm) version=$(npm --version 2>&1 | head -1 || echo "installed") ;;
        semgrep) version=$(semgrep --version 2>&1 | head -1 || echo "installed") ;;
        trivy) version=$(trivy --version 2>&1 | head -1 | awk '{print $2}' || echo "installed") ;;
        python3) version=$(python3 --version 2>&1 | head -1 || echo "installed") ;;
        *) version="installed" ;;
      esac
      echo "  [OK] $tool - $version"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Security Scan Capabilities:"
  if command_exists "npm"; then
    echo "  [OK] npm audit - Dependency vulnerability scanning"
  else
    echo "  [MISSING] npm audit - Install Node.js for dependency scanning"
  fi
  if command_exists "semgrep"; then
    echo "  [OK] semgrep - SAST analysis"
  else
    echo "  [MISSING] semgrep - Install semgrep for static analysis"
  fi
  if command_exists "trivy"; then
    echo "  [OK] trivy - Container and dependency scanning"
  else
    echo "  [MISSING] trivy - Install trivy for comprehensive scanning"
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

  # Step 1: Check Required Tools
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

  # Step 2: Check Optional Security Tools
  echo "--- Step 2: Security Tools ---"
  security_tools=("npm" "semgrep" "trivy")
  available_security=0
  for tool in "${security_tools[@]}"; do
    if command_exists "$tool"; then
      success "Security tool available: $tool"
      ((available_security++)) || true
    else
      warn "Security tool missing: $tool"
      ((self_test_warnings++)) || true
    fi
  done

  if [[ $available_security -eq 0 ]]; then
    warn "No security scanning tools available"
    ((self_test_warnings++)) || true
  fi
  echo ""

  # Step 3: Check Schema File
  echo "--- Step 3: Schema File ---"
  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists: $SCHEMA_PATH"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema file is valid JSON"

      # Check for OWASP-specific schema elements
      if grep -q "owaspCategories" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes OWASP categories definition"
      else
        warn "Schema may be missing OWASP categories"
        ((self_test_warnings++)) || true
      fi

      if grep -q "CWE-" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes CWE pattern validation"
      else
        warn "Schema may be missing CWE pattern"
        ((self_test_warnings++)) || true
      fi
    else
      error "Schema file is NOT valid JSON"
      self_test_passed=false
    fi
  else
    error "Schema file not found: $SCHEMA_PATH"
    self_test_passed=false
  fi
  echo ""

  # Step 4: Test with Sample Data
  echo "--- Step 4: Sample Data Validation ---"
  if [[ -f "$SAMPLE_OUTPUT_PATH" ]]; then
    success "Sample output file exists"

    if validate_json "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
      success "Sample output is valid JSON"

      # Test OWASP-specific validation
      if validate_owasp_findings "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
        success "Sample output has valid OWASP findings"
      else
        warn "Sample output OWASP validation issue"
        ((self_test_warnings++)) || true
      fi
    else
      error "Sample output is NOT valid JSON"
      self_test_passed=false
    fi
  else
    info "No sample output file found at: $SAMPLE_OUTPUT_PATH"
    info "Skipping sample data validation"
  fi
  echo ""

  # Step 5: Library Self-Test
  echo "--- Step 5: Validator Library Self-Test ---"
  if run_self_test 2>/dev/null; then
    success "Library self-test passed"
  else
    error "Library self-test FAILED"
    self_test_passed=false
  fi
  echo ""

  # Summary
  echo "=============================================="
  echo "Self-Test Summary for $SKILL_NAME"
  echo "=============================================="

  if [[ "$self_test_passed" == "true" ]]; then
    if [[ $self_test_warnings -gt 0 ]]; then
      warn "Self-test PASSED with $self_test_warnings warning(s)"
      exit 0
    else
      success "Self-test PASSED"
      exit 0
    fi
  else
    error "Self-test FAILED"
    exit 1
  fi
fi

# =============================================================================
# SKILL-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

# Validate OWASP Top 10 findings structure
# Returns: 0 if valid, 1 if invalid
validate_owasp_findings() {
  local output_file="$1"

  # Check owaspCategories exists
  local owasp_data
  owasp_data=$(json_get "$output_file" ".output.owaspCategories" 2>/dev/null)

  if [[ -z "$owasp_data" ]] || [[ "$owasp_data" == "null" ]]; then
    warn "Missing owaspCategories in output"
    return 1
  fi

  # Check that at least some OWASP categories are present
  local categories_tested=0
  for cat in "A01:2021" "A02:2021" "A03:2021" "A04:2021" "A05:2021" "A06:2021" "A07:2021" "A08:2021" "A09:2021" "A10:2021"; do
    local cat_data
    cat_data=$(json_get "$output_file" ".output.owaspCategories.\"$cat\"" 2>/dev/null)
    if [[ -n "$cat_data" ]] && [[ "$cat_data" != "null" ]]; then
      ((categories_tested++)) || true
    fi
  done

  if [[ $categories_tested -eq 0 ]]; then
    error "No OWASP categories found in owaspCategories"
    return 1
  fi

  debug "Found $categories_tested OWASP categories in output"
  return 0
}

# Validate security findings have required fields
# Returns: 0 if valid, 1 if invalid
validate_security_findings() {
  local output_file="$1"

  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)

  if [[ -z "$finding_count" ]] || [[ "$finding_count" == "null" ]]; then
    finding_count=0
  fi

  debug "Found $finding_count security findings"

  # If there are findings, validate structure of first few
  if [[ "$finding_count" -gt 0 ]]; then
    # Check first finding has required fields
    local first_id first_severity first_owasp
    first_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    first_severity=$(json_get "$output_file" ".output.findings[0].severity" 2>/dev/null)
    first_owasp=$(json_get "$output_file" ".output.findings[0].owasp" 2>/dev/null)

    if [[ -z "$first_id" ]] || [[ "$first_id" == "null" ]]; then
      error "Finding missing 'id' field"
      return 1
    fi

    if [[ -z "$first_severity" ]] || [[ "$first_severity" == "null" ]]; then
      error "Finding missing 'severity' field"
      return 1
    fi

    # Validate severity is valid enum
    if ! validate_enum "$first_severity" "critical" "high" "medium" "low" "info"; then
      error "Finding has invalid severity: $first_severity"
      return 1
    fi

    if [[ -z "$first_owasp" ]] || [[ "$first_owasp" == "null" ]]; then
      warn "Finding missing 'owasp' category - consider adding OWASP classification"
    fi
  fi

  return 0
}

# Validate CWE identifiers are properly formatted
# Returns: 0 if valid, 1 if invalid
validate_cwe_format() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")

  # Check if any CWE references exist and are properly formatted
  if grep -q "CWE-" <<< "$content"; then
    # Validate CWE format (CWE-XXX where XXX is 1-4 digits)
    local invalid_cwes
    invalid_cwes=$(grep -oE "CWE-[0-9]+" <<< "$content" | grep -vE "^CWE-[0-9]{1,4}$" || true)

    if [[ -n "$invalid_cwes" ]]; then
      warn "Found potentially malformed CWE identifiers"
      debug "Invalid CWEs: $invalid_cwes"
    fi
  fi

  return 0
}

# Validate CVSS scores are within valid range
# Returns: 0 if valid, 1 if invalid
validate_cvss_scores() {
  local output_file="$1"

  # Extract CVSS scores and validate they're in range
  local scores
  if command_exists "jq"; then
    scores=$(jq -r '.output.findings[]?.cvss?.score // empty' "$output_file" 2>/dev/null || true)

    for score in $scores; do
      if [[ -n "$score" ]] && [[ "$score" != "null" ]]; then
        # Check score is between 0 and 10
        if (( $(echo "$score < 0 || $score > 10" | bc -l 2>/dev/null || echo "0") )); then
          error "Invalid CVSS score: $score (must be 0-10)"
          return 1
        fi
      fi
    done
  fi

  return 0
}

# Validate recommendations have required structure
# Returns: 0 if valid, 1 if invalid
validate_recommendations() {
  local output_file="$1"

  local rec_count
  rec_count=$(json_count "$output_file" ".output.recommendations" 2>/dev/null)

  if [[ -z "$rec_count" ]] || [[ "$rec_count" == "null" ]]; then
    rec_count=0
  fi

  debug "Found $rec_count recommendations"

  # If there are recommendations, validate structure
  if [[ "$rec_count" -gt 0 ]]; then
    local first_priority
    first_priority=$(json_get "$output_file" ".output.recommendations[0].priority" 2>/dev/null)

    if [[ -n "$first_priority" ]] && [[ "$first_priority" != "null" ]]; then
      if ! validate_enum "$first_priority" "critical" "high" "medium" "low"; then
        error "Recommendation has invalid priority: $first_priority"
        return 1
      fi
    fi
  fi

  return 0
}

# Main skill-specific validation function
# Returns: 0 if valid, 1 if invalid
validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running security-testing specific validations..."

  # Validate OWASP findings structure
  if ! validate_owasp_findings "$output_file"; then
    has_errors=true
  else
    success "OWASP categories validation passed"
  fi

  # Validate security findings structure
  if ! validate_security_findings "$output_file"; then
    has_errors=true
  else
    success "Security findings validation passed"
  fi

  # Validate CWE format
  if ! validate_cwe_format "$output_file"; then
    has_errors=true
  else
    success "CWE format validation passed"
  fi

  # Validate CVSS scores
  if ! validate_cvss_scores "$output_file"; then
    has_errors=true
  else
    success "CVSS scores validation passed"
  fi

  # Validate recommendations
  if ! validate_recommendations "$output_file"; then
    has_errors=true
  else
    success "Recommendations validation passed"
  fi

  # Check for security tool attribution
  local tools_used
  tools_used=$(json_get "$output_file" ".metadata.toolsUsed" 2>/dev/null)
  if [[ -z "$tools_used" ]] || [[ "$tools_used" == "null" ]] || [[ "$tools_used" == "[]" ]]; then
    warn "No security tools listed in metadata.toolsUsed"
  else
    debug "Security tools used: $tools_used"
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

# =============================================================================
# Validation Functions (Override base template as needed)
# =============================================================================

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
    return 1
  fi

  debug "All required tools available"
  return 0
}

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
    fi
  done

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "All enum fields have valid values"
  return 0
}

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
      error "Output missing required security terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "All required security terms found"
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
# Main Validation Flow
# =============================================================================

main() {
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

  # Step 1: Check Required Tools
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 1: Tool Availability ---"

  if ! validate_tools; then
    tool_status="failed"
    ((error_count++)) || true
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "skipped" "skipped" "failed"
    fi
    exit $EXIT_SKIP
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "Tool check passed" && echo ""

  # Step 2: Validate JSON Syntax
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 2: JSON Syntax ---"

  if ! validate_json "$OUTPUT_FILE"; then
    json_status="failed"
    ((error_count++)) || true
    [[ "$JSON_ONLY" != "true" ]] && error "File is not valid JSON"
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "failed" "failed" "$tool_status"
    fi
    exit $EXIT_FAIL
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid" && echo ""

  # Step 3: Validate Against Schema
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 3: Schema Validation ---"

  local schema_exit_code
  validate_schema "$OUTPUT_FILE" && schema_exit_code=0 || schema_exit_code=$?

  case $schema_exit_code in
    0) [[ "$JSON_ONLY" != "true" ]] && echo "" ;;
    1) schema_status="failed"; ((error_count++)) || true; [[ "$JSON_ONLY" != "true" ]] && echo "" ;;
    2) schema_status="skipped"; ((warning_count++)) || true; [[ "$JSON_ONLY" != "true" ]] && echo "" ;;
  esac

  # Step 4: Validate Required Fields
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 4: Required Fields ---"

  if ! validate_required_fields "$OUTPUT_FILE"; then
    fields_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 5: Validate Enum Values
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 5: Enum Validation ---"

  if ! validate_enum_fields "$OUTPUT_FILE"; then
    enums_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 6: Validate Security Content Terms
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 6: Security Content Terms ---"

  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 7: Security-Specific Validation
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 7: Security-Specific Validation ---"

  if ! validate_skill_specific "$OUTPUT_FILE"; then
    specific_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Determine Overall Status
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

  # Output Results
  if [[ "$JSON_ONLY" == "true" ]]; then
    output_validation_report "$SKILL_NAME" "$schema_status" "$content_overall" "$tool_status"
  else
    echo "=============================================="
    echo "Validation Summary for $SKILL_NAME"
    echo "=============================================="
    echo ""
    echo "  Tools:             $tool_status"
    echo "  JSON Syntax:       $json_status"
    echo "  Schema:            $schema_status"
    echo "  Required Fields:   $fields_status"
    echo "  Enum Values:       $enums_status"
    echo "  Content Terms:     $content_status"
    echo "  Security-Specific: $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:           $overall_status"
    echo "  Errors:            $error_count"
    echo "  Warnings:          $warning_count"
    echo "=============================================="
    echo ""
  fi

  # Exit with appropriate code
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
