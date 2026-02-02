#!/bin/bash
# =============================================================================
# AQE Compatibility Testing Skill Validator v1.0.0
# Validates cross-browser, cross-platform compatibility testing output
# =============================================================================
#
# This validator checks compatibility testing skill output for:
#   - Valid JSON structure conforming to compatibility-testing schema
#   - Browser matrix with coverage metrics
#   - Device coverage by tier (Tier 1/2/3)
#   - Platform results and visual differences
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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source shared library
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
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="compatibility-testing"
SKILL_VERSION="1.0.0"

REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("playwright" "browserstack" "ajv" "jsonschema" "python3")

SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
SAMPLE_OUTPUT_PATH="$SKILL_DIR/test-data/sample-output.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

REQUIRED_FIELDS=("skillName" "status" "output" "output.browserMatrix" "output.deviceCoverage" "output.metrics")
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.browserMatrix")

MUST_CONTAIN_TERMS=("browser" "compatibility")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

MIN_ARRAY_LENGTHS=(
  ".output.browserMatrix.browsers:1"
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
AQE Compatibility Testing Validator

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]

Options:
  --self-test       Run validator self-test mode
  --verbose, -v     Enable verbose/debug output
  --json            Output results as JSON only
  --list-tools      Show available validation tools
  --help, -h        Show this help message

Exit Codes:
  0 - Validation passed
  1 - Validation failed
  2 - Validation skipped (missing required tools)
HELP_EOF
      exit 0
      ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

# Handle --list-tools mode
if [[ "$LIST_TOOLS" == "true" ]]; then
  echo "=============================================="
  echo "Compatibility Testing Validation Tools"
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

  # Step 2: Check Schema
  echo "--- Step 2: Schema File ---"
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

  # Step 3: Test compatibility-specific validation
  echo "--- Step 3: Compatibility Validation Functions ---"

  test_file=$(mktemp)
  cat > "$test_file" << 'EOF'
{
  "skillName": "compatibility-testing",
  "version": "1.0.0",
  "timestamp": "2026-02-02T12:00:00Z",
  "status": "partial",
  "trustTier": 3,
  "output": {
    "summary": "Compatibility testing across 12 browser/device combinations. Chrome and Firefox pass on all platforms.",
    "browserMatrix": {
      "browsers": [
        { "browser": "chrome", "version": "120", "status": "passed", "marketShare": 65 },
        { "browser": "firefox", "version": "121", "status": "passed", "marketShare": 8 },
        { "browser": "safari", "version": "17", "status": "partial", "issueCount": 2, "marketShare": 18 }
      ],
      "coveragePercent": 91
    },
    "deviceCoverage": {
      "tier1": { "devices": ["iPhone 15", "Galaxy S24"], "passRate": 100, "tested": 2, "passed": 2 },
      "tier2": { "devices": ["Pixel 8"], "passRate": 100, "tested": 1, "passed": 1 },
      "totalDevicesTested": 3
    },
    "metrics": {
      "totalCombinations": 12,
      "passed": 10,
      "failed": 2,
      "passRate": 83.3,
      "browsersCovered": 3,
      "devicesCovered": 3
    },
    "findings": [
      {
        "id": "COMPAT-001",
        "title": "Safari flexbox layout issue",
        "severity": "medium",
        "category": "layout",
        "affectedPlatforms": ["safari-macos", "safari-ios"]
      }
    ]
  }
}
EOF

  if validate_json "$test_file" 2>/dev/null; then
    success "Test output is valid JSON"

    # Check browser matrix
    browser_count=$(json_count "$test_file" ".output.browserMatrix.browsers" 2>/dev/null)
    if [[ "$browser_count" -ge 1 ]]; then
      success "Browser matrix detected: $browser_count browsers"
    else
      error "Browser matrix not found"
      self_test_passed=false
    fi

    # Check device coverage
    tier1_pass=$(json_get "$test_file" ".output.deviceCoverage.tier1.passRate" 2>/dev/null)
    if [[ -n "$tier1_pass" ]]; then
      success "Device coverage detected: Tier 1 pass rate = $tier1_pass%"
    fi
  else
    error "Test output validation failed"
    self_test_passed=false
  fi

  rm -f "$test_file"
  echo ""

  # Step 4: Library Self-Test
  echo "--- Step 4: Validator Library Self-Test ---"
  if run_self_test 2>/dev/null; then
    success "Library self-test passed"
  else
    error "Library self-test FAILED"
    self_test_passed=false
  fi
  echo ""

  # Summary
  echo "=============================================="
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

validate_browser_entry() {
  local browser="$1"
  case "$browser" in
    chrome|firefox|safari|edge|opera|mobile-chrome|mobile-safari|samsung-internet)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running compatibility-specific validations..."

  # Validate browser matrix
  echo "  Checking browser matrix..."
  local browser_count
  browser_count=$(json_count "$output_file" ".output.browserMatrix.browsers" 2>/dev/null)

  if [[ -z "$browser_count" ]] || [[ "$browser_count" -lt 1 ]]; then
    error "Browser matrix must have at least 1 browser"
    has_errors=true
  else
    success "Browser matrix has $browser_count browsers"
  fi

  # Check device coverage tiers
  echo "  Checking device coverage..."
  local tier1_tested
  tier1_tested=$(json_get "$output_file" ".output.deviceCoverage.tier1.tested" 2>/dev/null)
  if [[ -n "$tier1_tested" ]] && [[ "$tier1_tested" != "null" ]]; then
    success "Device coverage includes Tier 1 devices"
  else
    warn "Device coverage missing Tier 1 data"
  fi

  # Validate metrics consistency
  echo "  Checking metrics consistency..."
  local total_combos passed failed
  total_combos=$(json_get "$output_file" ".output.metrics.totalCombinations" 2>/dev/null)
  passed=$(json_get "$output_file" ".output.metrics.passed" 2>/dev/null)
  failed=$(json_get "$output_file" ".output.metrics.failed" 2>/dev/null)

  if [[ -n "$total_combos" ]] && [[ -n "$passed" ]] && [[ -n "$failed" ]]; then
    local sum=$((passed + failed))
    if [[ "$sum" -le "$total_combos" ]]; then
      success "Metrics are consistent: $passed passed + $failed failed <= $total_combos total"
    else
      warn "Metrics inconsistency: passed + failed > total combinations"
    fi
  fi

  # Check finding structure if findings exist
  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)
  if [[ -n "$finding_count" ]] && [[ "$finding_count" -gt 0 ]]; then
    local first_finding_id
    first_finding_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    if [[ -n "$first_finding_id" ]] && [[ "$first_finding_id" =~ ^COMPAT-[0-9]+$ ]]; then
      success "Finding ID format valid: $first_finding_id"
    else
      warn "Finding ID should match pattern COMPAT-XXX"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Compatibility-specific validation passed"
  return 0
}

# =============================================================================
# Validation Functions
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
  if [[ -z "$SCHEMA_PATH" ]] || [[ ! -f "$SCHEMA_PATH" ]]; then
    warn "Schema file not found, skipping schema validation"
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

validate_enum_fields() {
  local output_file="$1"
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
      error "Invalid value for $field_path: '$actual_value'"
      has_errors=true
    fi
  done
  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi
  success "All enum fields valid"
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
      error "Missing required terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "Required terms found"
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
      error "Forbidden terms found: ${found_forbidden[*]}"
      has_errors=true
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
  fi

  local tool_status="passed"
  local json_status="passed"
  local schema_status="passed"
  local fields_status="passed"
  local enums_status="passed"
  local content_status="passed"
  local specific_status="passed"
  local error_count=0

  # Step 1: Tools
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 1: Tool Availability ---"
  if ! validate_tools; then
    tool_status="failed"
    ((error_count++))
    exit $EXIT_SKIP
  fi
  [[ "$JSON_ONLY" != "true" ]] && success "Tool check passed" && echo ""

  # Step 2: JSON Syntax
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 2: JSON Syntax ---"
  if ! validate_json "$OUTPUT_FILE"; then
    json_status="failed"
    ((error_count++))
    exit $EXIT_FAIL
  fi
  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid" && echo ""

  # Step 3: Schema
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 3: Schema Validation ---"
  local schema_exit_code
  validate_schema "$OUTPUT_FILE" && schema_exit_code=0 || schema_exit_code=$?
  case $schema_exit_code in
    1) schema_status="failed"; ((error_count++)) ;;
    2) schema_status="skipped" ;;
  esac
  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 4: Required Fields
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 4: Required Fields ---"
  if ! validate_required_fields "$OUTPUT_FILE"; then
    fields_status="failed"
    ((error_count++))
  fi
  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 5: Enum Values
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 5: Enum Validation ---"
  if ! validate_enum_fields "$OUTPUT_FILE"; then
    enums_status="failed"
    ((error_count++))
  fi
  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 6: Content Terms
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 6: Content Terms ---"
  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++))
  fi
  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 7: Skill-Specific
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 7: Compatibility Validation ---"
  if ! validate_skill_specific "$OUTPUT_FILE"; then
    specific_status="failed"
    ((error_count++))
  fi
  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Determine Overall Status
  local overall_status="passed"
  if [[ "$json_status" == "failed" ]] || [[ "$schema_status" == "failed" ]] || \
     [[ "$fields_status" == "failed" ]] || [[ "$specific_status" == "failed" ]]; then
    overall_status="failed"
  elif [[ "$schema_status" == "skipped" ]]; then
    overall_status="partial"
  fi

  # Output Results
  if [[ "$JSON_ONLY" == "true" ]]; then
    output_validation_report "$SKILL_NAME" "$schema_status" "$specific_status" "$tool_status"
  else
    echo "=============================================="
    echo "Validation Summary for $SKILL_NAME"
    echo "=============================================="
    echo "  Overall: $overall_status"
    echo "  Errors:  $error_count"
    echo "=============================================="
  fi

  case "$overall_status" in
    "passed"|"partial") exit $EXIT_PASS ;;
    "failed") exit $EXIT_FAIL ;;
  esac
}

main
