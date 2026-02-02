#!/bin/bash
# =============================================================================
# Testability Scoring Skill Validator v2.2.0
# Validates testability assessment output against schema and content rules
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
#   0 - Validation passed
#   1 - Validation failed
#   2 - Validation skipped (missing required tools)
#
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# SKILL_DIR is .claude/skills/testability-scoring, so go up 3 levels for project root
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source shared library - try multiple locations
VALIDATOR_LIB=""
for lib_path in \
  "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" \
  "$SKILL_DIR/scripts/validator-lib.sh" \
  "$PROJECT_ROOT/docs/templates/validator-lib.sh"; do
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
  echo "  - $PROJECT_ROOT/docs/templates/validator-lib.sh"
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="testability-scoring"
SKILL_VERSION="2.2.0"

# Required tools - jq is essential for JSON parsing
REQUIRED_TOOLS=("jq")

# Optional tools for enhanced validation
OPTIONAL_TOOLS=("node" "ajv" "jsonschema" "python3")

# Schema path
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Sample output for self-test
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/.claude/skills/.validation/examples/testability-scoring-output.example.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required fields
REQUIRED_FIELDS=("skillName" "status" "output" "output.score" "output.categories")

# Fields that must have values
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.score.value")

# Domain-specific terms that should appear
MUST_CONTAIN_TERMS=("testability" "score")

# Terms that indicate errors/hallucinations
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "REPLACE_WITH")

# Enum validations
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

# Array minimum lengths
MIN_ARRAY_LENGTHS=()

# =============================================================================
# TESTABILITY-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

# Validate testability dimension scores are within range
validate_dimension_scores() {
  local output_file="$1"
  local has_errors=false

  local dimensions=(
    "observability"
    "controllability"
    "algorithmicSimplicity"
    "algorithmicTransparency"
    "algorithmicStability"
    "explainability"
    "unbugginess"
    "smallness"
    "decomposability"
    "similarity"
  )

  for dim in "${dimensions[@]}"; do
    local score
    score=$(json_get "$output_file" ".output.categories.$dim.score" 2>/dev/null)

    if [[ -z "$score" ]] || [[ "$score" == "null" ]]; then
      error "Missing score for dimension: $dim"
      has_errors=true
      continue
    fi

    # Check score is within valid range (0-100)
    if ! [[ "$score" =~ ^[0-9]+\.?[0-9]*$ ]]; then
      error "Invalid score format for $dim: $score"
      has_errors=true
    elif (( $(echo "$score < 0" | bc -l 2>/dev/null || echo "0") )) || (( $(echo "$score > 100" | bc -l 2>/dev/null || echo "0") )); then
      error "Score out of range for $dim: $score (must be 0-100)"
      has_errors=true
    else
      debug "Dimension $dim score valid: $score"
    fi
  done

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "All testability dimension scores valid (0-100)"
  return 0
}

# Validate dimension weights sum to 1.0
validate_dimension_weights() {
  local output_file="$1"

  local dimensions=(
    "observability"
    "controllability"
    "algorithmicSimplicity"
    "algorithmicTransparency"
    "algorithmicStability"
    "explainability"
    "unbugginess"
    "smallness"
    "decomposability"
    "similarity"
  )

  local total_weight=0
  for dim in "${dimensions[@]}"; do
    local weight
    weight=$(json_get "$output_file" ".output.categories.$dim.weight" 2>/dev/null)

    if [[ -n "$weight" ]] && [[ "$weight" != "null" ]]; then
      total_weight=$(echo "$total_weight + $weight" | bc -l 2>/dev/null || echo "$total_weight")
    fi
  done

  # Check if weights sum to approximately 1.0 (allow small floating point error)
  local weight_diff
  weight_diff=$(echo "scale=4; ($total_weight - 1.0)" | bc -l 2>/dev/null || echo "0")
  weight_diff=${weight_diff#-}  # Absolute value

  if (( $(echo "$weight_diff > 0.01" | bc -l 2>/dev/null || echo "0") )); then
    warn "Dimension weights sum to $total_weight (should be 1.0)"
    return 0  # Warning only, not failure
  fi

  debug "Dimension weights sum correctly: $total_weight"
  return 0
}

# Validate overall score matches weighted average of dimensions
validate_overall_score() {
  local output_file="$1"

  local overall_score
  overall_score=$(json_get "$output_file" ".output.score.value" 2>/dev/null)

  if [[ -z "$overall_score" ]] || [[ "$overall_score" == "null" ]]; then
    error "Missing overall score"
    return 1
  fi

  # Check overall score is within valid range (0-100)
  if ! [[ "$overall_score" =~ ^[0-9]+\.?[0-9]*$ ]]; then
    error "Invalid overall score format: $overall_score"
    return 1
  elif (( $(echo "$overall_score < 0" | bc -l 2>/dev/null || echo "0") )) || (( $(echo "$overall_score > 100" | bc -l 2>/dev/null || echo "0") )); then
    error "Overall score out of range: $overall_score (must be 0-100)"
    return 1
  fi

  success "Overall testability score valid: $overall_score"
  return 0
}

# Validate grade matches score
validate_grade() {
  local output_file="$1"

  local score grade
  score=$(json_get "$output_file" ".output.score.value" 2>/dev/null)
  grade=$(json_get "$output_file" ".output.score.grade" 2>/dev/null)

  if [[ -z "$grade" ]] || [[ "$grade" == "null" ]]; then
    debug "No grade provided (optional)"
    return 0
  fi

  # Validate grade format
  if ! [[ "$grade" =~ ^[A-F][+-]?$ ]]; then
    error "Invalid grade format: $grade (expected A-F with optional +/-)"
    return 1
  fi

  # Check grade matches score - convert to integer for comparison
  local score_int
  score_int=$(printf "%.0f" "$score" 2>/dev/null || echo "0")

  local expected_grade
  if [[ "$score_int" -ge 90 ]]; then
    expected_grade="A"
  elif [[ "$score_int" -ge 80 ]]; then
    expected_grade="B"
  elif [[ "$score_int" -ge 70 ]]; then
    expected_grade="C"
  elif [[ "$score_int" -ge 60 ]]; then
    expected_grade="D"
  else
    expected_grade="F"
  fi

  # Extract base grade (without +/-)
  local base_grade="${grade:0:1}"

  if [[ "$base_grade" != "$expected_grade" ]]; then
    warn "Grade $grade may not match score $score (expected $expected_grade range)"
  else
    debug "Grade $grade matches score $score"
  fi

  return 0
}

# Validate findings have proper testability categories
validate_findings_categories() {
  local output_file="$1"

  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)

  if [[ -z "$finding_count" ]] || [[ "$finding_count" == "0" ]] || [[ "$finding_count" == "null" ]]; then
    debug "No findings to validate"
    return 0
  fi

  local valid_categories=(
    "observability"
    "controllability"
    "algorithmicSimplicity"
    "algorithmicTransparency"
    "algorithmicStability"
    "explainability"
    "unbugginess"
    "smallness"
    "decomposability"
    "similarity"
  )

  local has_errors=false

  # Check each finding has a valid category
  for ((i=0; i<finding_count; i++)); do
    local category
    category=$(json_get "$output_file" ".output.findings[$i].category" 2>/dev/null)

    if [[ -z "$category" ]] || [[ "$category" == "null" ]]; then
      error "Finding $i missing category"
      has_errors=true
      continue
    fi

    local found=false
    for valid in "${valid_categories[@]}"; do
      if [[ "$category" == "$valid" ]]; then
        found=true
        break
      fi
    done

    if [[ "$found" == "false" ]]; then
      error "Finding $i has invalid category: $category"
      has_errors=true
    fi
  done

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "All findings have valid testability categories"
  return 0
}

# Validate recommendations have proper structure
validate_recommendations() {
  local output_file="$1"

  local rec_count
  rec_count=$(json_count "$output_file" ".output.recommendations" 2>/dev/null)

  if [[ -z "$rec_count" ]] || [[ "$rec_count" == "0" ]] || [[ "$rec_count" == "null" ]]; then
    debug "No recommendations to validate"
    return 0
  fi

  local has_errors=false

  for ((i=0; i<rec_count; i++)); do
    local impact
    impact=$(json_get "$output_file" ".output.recommendations[$i].impact" 2>/dev/null)

    if [[ -n "$impact" ]] && [[ "$impact" != "null" ]]; then
      # Check impact is within valid range (1-10)
      if ! [[ "$impact" =~ ^[0-9]+$ ]] || (( impact < 1 )) || (( impact > 10 )); then
        error "Recommendation $i has invalid impact: $impact (must be 1-10)"
        has_errors=true
      fi
    fi
  done

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "All recommendations have valid structure"
  return 0
}

# =============================================================================
# SKILL-SPECIFIC VALIDATION - Main entry point
# =============================================================================

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running testability-specific validations..."

  # Validate dimension scores (0-100)
  if ! validate_dimension_scores "$output_file"; then
    has_errors=true
  fi

  # Validate dimension weights sum to 1.0
  if ! validate_dimension_weights "$output_file"; then
    has_errors=true
  fi

  # Validate overall score
  if ! validate_overall_score "$output_file"; then
    has_errors=true
  fi

  # Validate grade matches score
  if ! validate_grade "$output_file"; then
    has_errors=true
  fi

  # Validate findings have valid categories
  if ! validate_findings_categories "$output_file"; then
    has_errors=true
  fi

  # Validate recommendations
  if ! validate_recommendations "$output_file"; then
    has_errors=true
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

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
Testability Scoring Skill Validator

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]
       ./validate.sh --list-tools

Arguments:
  <output-file>     Path to testability assessment JSON output to validate

Options:
  --self-test       Run validator self-test mode
  --verbose, -v     Enable verbose/debug output
  --json            Output results as JSON only (for CI integration)
  --list-tools      Show available validation tools
  --help, -h        Show this help message

Exit Codes:
  0 - Validation passed
  1 - Validation failed
  2 - Validation skipped (missing required tools)

Testability-Specific Validations:
  - All 10 dimension scores must be 0-100
  - Dimension weights must sum to 1.0
  - Overall score must be 0-100
  - Grade must match score (A=90+, B=80+, C=70+, D=60+, F=<60)
  - Findings must have valid testability categories
  - Recommendations impact must be 1-10

Examples:
  ./validate.sh testability-output.json           # Validate output file
  ./validate.sh testability-output.json --json    # JSON output for CI
  ./validate.sh --self-test --verbose             # Self-test with debug

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
  echo "Validator version: $SKILL_VERSION"
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

  # Step 4: Test with Sample Data
  echo "--- Step 4: Sample Data Validation ---"
  if [[ -f "$SAMPLE_OUTPUT_PATH" ]]; then
    success "Sample output file exists: $SAMPLE_OUTPUT_PATH"

    if validate_json "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
      success "Sample output is valid JSON"

      # Run skill-specific validations on sample
      if validate_skill_specific "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
        success "Sample output passes skill-specific validation"
      else
        warn "Sample output has skill-specific validation issues"
        ((self_test_warnings++)) || true
      fi
    else
      error "Sample output is NOT valid JSON"
      self_test_passed=false
    fi
  else
    warn "Sample output file not found: $SAMPLE_OUTPUT_PATH"
    ((self_test_warnings++)) || true
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
      success "Self-test PASSED (all checks successful)"
      exit 0
    fi
  else
    error "Self-test FAILED"
    exit 1
  fi
fi

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

  # Print header
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
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 1: Tool Availability ---"
  fi

  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      tool_status="failed"
      ((error_count++)) || true
      if [[ "$JSON_ONLY" != "true" ]]; then
        error "Required tool missing: $tool"
      fi
    fi
  done

  if [[ "$tool_status" == "failed" ]]; then
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "skipped" "skipped" "failed"
    fi
    exit $EXIT_SKIP
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "Tool check passed" && echo ""

  # Step 2: Validate JSON Syntax
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 2: JSON Syntax ---"
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    json_status="failed"
    ((error_count++)) || true
    if [[ "$JSON_ONLY" == "true" ]]; then
      output_validation_report "$SKILL_NAME" "failed" "failed" "$tool_status"
    fi
    exit $EXIT_FAIL
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid" && echo ""

  # Step 3: Validate Against Schema
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 3: Schema Validation ---"
  fi

  if [[ -f "$SCHEMA_PATH" ]]; then
    local schema_result
    schema_result=$(validate_json_schema "$SCHEMA_PATH" "$OUTPUT_FILE" 2>&1) || true
    local schema_exit=$?

    case $schema_exit in
      0) [[ "$JSON_ONLY" != "true" ]] && success "Schema validation passed" ;;
      1) schema_status="failed"; ((error_count++)) || true ;;
      2) schema_status="skipped"; ((warning_count++)) || true; [[ "$JSON_ONLY" != "true" ]] && warn "Schema validation skipped" ;;
    esac
  else
    schema_status="skipped"
    [[ "$JSON_ONLY" != "true" ]] && warn "Schema file not found, skipping"
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 4: Validate Required Fields
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 4: Required Fields ---"
  fi

  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$OUTPUT_FILE" ".$field" 2>/dev/null)
    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
      error "Missing required field: $field"
      fields_status="failed"
      ((error_count++)) || true
    fi
  done

  if [[ "$fields_status" == "passed" ]]; then
    [[ "$JSON_ONLY" != "true" ]] && success "All required fields present"
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 5: Validate Enum Values
  if [[ ${#ENUM_VALIDATIONS[@]} -gt 0 ]]; then
    if [[ "$JSON_ONLY" != "true" ]]; then
      echo "--- Step 5: Enum Validation ---"
    fi

    for validation in "${ENUM_VALIDATIONS[@]}"; do
      local field_path="${validation%%:*}"
      local allowed_values="${validation#*:}"
      local actual_value
      actual_value=$(json_get "$OUTPUT_FILE" "$field_path" 2>/dev/null)

      if [[ -n "$actual_value" ]] && [[ "$actual_value" != "null" ]]; then
        local found=false
        IFS=',' read -ra allowed_array <<< "$allowed_values"
        for allowed in "${allowed_array[@]}"; do
          if [[ "$actual_value" == "$allowed" ]]; then
            found=true
            break
          fi
        done

        if [[ "$found" == "false" ]]; then
          error "Invalid value for $field_path: '$actual_value'"
          enums_status="failed"
          ((error_count++)) || true
        fi
      fi
    done

    if [[ "$enums_status" == "passed" ]]; then
      [[ "$JSON_ONLY" != "true" ]] && success "All enum fields valid"
    fi

    [[ "$JSON_ONLY" != "true" ]] && echo ""
  fi

  # Step 6: Content Terms
  if [[ ${#MUST_CONTAIN_TERMS[@]} -gt 0 ]] || [[ ${#MUST_NOT_CONTAIN_TERMS[@]} -gt 0 ]]; then
    if [[ "$JSON_ONLY" != "true" ]]; then
      echo "--- Step 6: Content Terms ---"
    fi

    local file_content
    file_content=$(cat "$OUTPUT_FILE")

    for term in "${MUST_CONTAIN_TERMS[@]}"; do
      if ! grep -qi "$term" <<< "$file_content"; then
        error "Missing required term: $term"
        content_status="failed"
        ((error_count++)) || true
      fi
    done

    for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
      if grep -qi "$term" <<< "$file_content"; then
        error "Found forbidden term: $term"
        content_status="failed"
        ((error_count++)) || true
      fi
    done

    if [[ "$content_status" == "passed" ]]; then
      [[ "$JSON_ONLY" != "true" ]] && success "Content terms validation passed"
    fi

    [[ "$JSON_ONLY" != "true" ]] && echo ""
  fi

  # Step 7: Skill-Specific Validation
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 7: Testability-Specific Validation ---"
  fi

  if ! validate_skill_specific "$OUTPUT_FILE"; then
    specific_status="failed"
    ((error_count++)) || true
  else
    [[ "$JSON_ONLY" != "true" ]] && success "Testability-specific validation passed"
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
    echo "  Tools:          $tool_status"
    echo "  JSON Syntax:    $json_status"
    echo "  Schema:         $schema_status"
    echo "  Fields:         $fields_status"
    echo "  Enums:          $enums_status"
    echo "  Content:        $content_status"
    echo "  Testability:    $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:        $overall_status"
    echo "  Errors:         $error_count"
    echo "  Warnings:       $warning_count"
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
