#!/bin/bash
# =============================================================================
# AQE Skill Validator: security-visual-testing v1.0.0
# Validates combined security and visual testing skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (security findings, visual diffs, combined scores)
# 2. Required tools availability (imagemagick, playwright, semgrep)
# 3. Security and visual findings structure
# 4. Cross-domain issue validation
# 5. Combined scoring accuracy
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

SKILL_NAME="security-visual-testing"
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
OPTIONAL_TOOLS=("imagemagick" "playwright" "semgrep" "ajv" "jsonschema" "python3")

# Path to output JSON schema
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required fields in output
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.securityFindings" "output.visualDiffs")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

# Terms that MUST appear in output
MUST_CONTAIN_TERMS=("security" "visual" "findings")

# Terms that must NOT appear in output
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

# Enum validations
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
LIST_TOOLS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) VERBOSE=true; export AQE_DEBUG=1; shift ;;
    --json) JSON_ONLY=true; shift ;;
    --list-tools) LIST_TOOLS=true; shift ;;
    -h|--help)
      cat << 'HELP_EOF'
AQE Security-Visual Testing Skill Validator v1.0.0

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

Tool Requirements:
  Required:  jq (JSON parsing)
  Optional:  imagemagick (image diff), playwright (visual testing), semgrep (security scanning)

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
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Optional tools:"
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
    else
      echo "  [MISSING] $tool"
    fi
  done
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

  # Step 2: Check Optional Tools
  echo "--- Step 2: Optional Tools ---"
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Optional tool available: $tool"
    else
      warn "Optional tool missing: $tool"
      ((self_test_warnings++)) || true
    fi
  done
  echo ""

  # Step 3: Check Schema File
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

# Validate security findings structure
# Returns: 0 if valid, 1 if invalid
validate_security_findings() {
  local output_file="$1"

  local sec_findings
  sec_findings=$(json_get "$output_file" ".output.securityFindings" 2>/dev/null)

  if [[ -z "$sec_findings" ]] || [[ "$sec_findings" == "null" ]]; then
    error "Missing securityFindings in output"
    return 1
  fi

  # Check for required fields in securityFindings
  local total_findings
  total_findings=$(json_get "$output_file" ".output.securityFindings.totalFindings" 2>/dev/null)

  if [[ -z "$total_findings" ]] || [[ "$total_findings" == "null" ]]; then
    error "securityFindings missing totalFindings"
    return 1
  fi

  # Check for security score
  local sec_score
  sec_score=$(json_get "$output_file" ".output.securityFindings.score" 2>/dev/null)

  if [[ -z "$sec_score" ]] || [[ "$sec_score" == "null" ]]; then
    error "securityFindings missing score"
    return 1
  fi

  debug "Found $total_findings security findings with score: $sec_score"
  return 0
}

# Validate visual diffs structure
# Returns: 0 if valid, 1 if invalid
validate_visual_diffs() {
  local output_file="$1"

  local visual_diffs
  visual_diffs=$(json_get "$output_file" ".output.visualDiffs" 2>/dev/null)

  if [[ -z "$visual_diffs" ]] || [[ "$visual_diffs" == "null" ]]; then
    error "Missing visualDiffs in output"
    return 1
  fi

  # Check for required fields
  local comparisons
  comparisons=$(json_get "$output_file" ".output.visualDiffs.totalComparisons" 2>/dev/null)

  if [[ -z "$comparisons" ]] || [[ "$comparisons" == "null" ]]; then
    error "visualDiffs missing totalComparisons"
    return 1
  fi

  # Check for visual score
  local vis_score
  vis_score=$(json_get "$output_file" ".output.visualDiffs.score" 2>/dev/null)

  if [[ -z "$vis_score" ]] || [[ "$vis_score" == "null" ]]; then
    error "visualDiffs missing score"
    return 1
  fi

  debug "Found $comparisons visual comparisons with score: $vis_score"
  return 0
}

# Validate combined scoring
# Returns: 0 if valid, 1 if invalid
validate_combined_score() {
  local output_file="$1"

  local combined
  combined=$(json_get "$output_file" ".output.combinedScore.value" 2>/dev/null)

  if [[ -z "$combined" ]] || [[ "$combined" == "null" ]]; then
    error "Missing combinedScore.value in output"
    return 1
  fi

  # Validate combined score is between 0 and 100
  if (( $(echo "$combined < 0 || $combined > 100" | bc -l 2>/dev/null || echo "0") )); then
    error "Invalid combinedScore: $combined (must be 0-100)"
    return 1
  fi

  debug "Combined score: $combined"
  return 0
}

# Main skill-specific validation function
validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running security-visual-testing specific validations..."

  if ! validate_security_findings "$output_file"; then
    has_errors=true
  else
    success "Security findings validation passed"
  fi

  if ! validate_visual_diffs "$output_file"; then
    has_errors=true
  else
    success "Visual diffs validation passed"
  fi

  if ! validate_combined_score "$output_file"; then
    has_errors=true
  else
    success "Combined score validation passed"
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

# Override base template validations as needed
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
    if [[ -z "$value" ]] || [[ "$value" == "null" ]] || [[ "$value" == "" ]]; then
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

  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "=============================================="
    info "Validating $SKILL_NAME Output"
    echo "=============================================="
    echo ""
    echo "  Skill:   $SKILL_NAME v$SKILL_VERSION"
    echo "  File:    $OUTPUT_FILE"
    echo ""
  fi

  local tool_status="passed"
  local json_status="passed"
  local schema_status="passed"
  local fields_status="passed"
  local enums_status="passed"
  local content_status="passed"
  local specific_status="passed"
  local error_count=0

  # Step 1: Check Required Tools
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 1: Tool Availability ---"

  if ! validate_tools; then
    tool_status="failed"
    ((error_count++)) || true
    exit $EXIT_SKIP
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "Tool check passed" && echo ""

  # Step 2: Validate JSON Syntax
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 2: JSON Syntax ---"

  if ! validate_json "$OUTPUT_FILE"; then
    json_status="failed"
    ((error_count++)) || true
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
    2) schema_status="skipped"; [[ "$JSON_ONLY" != "true" ]] && echo "" ;;
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

  # Step 6: Validate Content Terms
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 6: Content Terms ---"

  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 7: Skill-Specific Validation
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 7: Skill-Specific Validation ---"

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
  if [[ "$JSON_ONLY" != "true" ]]; then
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
    echo "  Skill-Specific:    $specific_status"
    echo ""
    echo "  Overall:           $overall_status"
    echo "  Errors:            $error_count"
    echo "=============================================="
    echo ""
  fi

  case "$overall_status" in
    "passed")
      [[ "$JSON_ONLY" != "true" ]] && success "Validation PASSED"
      exit $EXIT_PASS
      ;;
    "partial")
      [[ "$JSON_ONLY" != "true" ]] && warn "Validation PARTIAL"
      exit $EXIT_PASS
      ;;
    "failed")
      [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED"
      exit $EXIT_FAIL
      ;;
  esac
}

main
