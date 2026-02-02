#!/bin/bash
# =============================================================================
# AQE Accessibility Testing Skill Validator v1.0.0
# Validates accessibility audit output against WCAG 2.2 schema
# =============================================================================
#
# This validator checks accessibility testing skill output for:
#   - Valid JSON structure conforming to accessibility-testing schema
#   - WCAG 2.2 compliance fields (conformance level, POUR breakdown)
#   - Proper finding structure with WCAG criteria and impact
#   - Video caption validation (if video analysis was performed)
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
# .claude/skills/accessibility-testing -> go up 3 levels to project root
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

# Skill name (matches SKILL.md)
SKILL_NAME="accessibility-testing"

# Skill version
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# jq is required for JSON parsing
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
# These are the accessibility testing tools that enable full auditing
OPTIONAL_TOOLS=("axe" "pa11y" "lighthouse" "ffmpeg" "python3" "ajv" "jsonschema")

# Path to output JSON schema
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Sample output for self-test
SAMPLE_OUTPUT_PATH="$SKILL_DIR/test-data/sample-output.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required fields in output
REQUIRED_FIELDS=("skillName" "status" "output" "output.conformanceLevel" "output.pourBreakdown")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.pourBreakdown")

# Terms that MUST appear in accessibility testing output
MUST_CONTAIN_TERMS=("WCAG" "accessibility")

# Terms that must NOT appear in output (indicates failure/hallucination)
# Note: example.com is allowed since it's a valid placeholder domain in samples
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

# Enum fields and allowed values
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
  ".output.conformanceLevel:A,AA,AAA,none"
  ".output.wcagVersion:2.0,2.1,2.2"
)

# Minimum array lengths - findings can be empty (0) for compliant sites
MIN_ARRAY_LENGTHS=(
  ".output.findings:0"
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
AQE Accessibility Testing Validator

Validates accessibility audit output against WCAG 2.2 schema requirements.

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]
       ./validate.sh --list-tools

Arguments:
  <output-file>     Path to accessibility audit JSON file to validate

Options:
  --self-test       Run validator self-test mode
  --verbose, -v     Enable verbose/debug output
  --json            Output results as JSON only (for CI integration)
  --list-tools      Show available validation tools and exit
  --help, -h        Show this help message

Validation Checks:
  - JSON syntax and schema compliance
  - Required fields: skillName, status, output, conformanceLevel, pourBreakdown
  - WCAG conformance level: A, AA, AAA, or none
  - POUR principle breakdown (Perceivable, Operable, Understandable, Robust)
  - Finding structure: id, title, severity, wcagCriterion, pourPrinciple
  - Severity values: critical, serious, moderate, minor
  - WCAG criteria format: X.Y.Z (e.g., 1.1.1, 2.4.7)

Exit Codes:
  0 - Validation passed
  1 - Validation failed
  2 - Validation skipped (missing required tools)

Examples:
  ./validate.sh audit-output.json              # Validate audit file
  ./validate.sh audit-output.json --json       # JSON output for CI
  ./validate.sh --self-test --verbose          # Self-test with debug
  ./validate.sh --list-tools                   # Show available tools

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
  echo "Accessibility Testing Validation Tools"
  echo "=============================================="
  echo ""
  echo "Required tools (for validation):"
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Optional tools (for full accessibility auditing):"
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      echo "  [OK] $tool"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Accessibility audit tools status:"
  if command_exists "axe"; then
    echo "  [OK] axe-core (automated WCAG testing)"
  else
    echo "  [MISSING] axe-core - Install: npm install -g @axe-core/cli"
  fi
  if command_exists "pa11y"; then
    echo "  [OK] pa11y (HTML CodeSniffer wrapper)"
  else
    echo "  [MISSING] pa11y - Install: npm install -g pa11y"
  fi
  if command_exists "lighthouse"; then
    echo "  [OK] lighthouse (Google accessibility audit)"
  else
    echo "  [MISSING] lighthouse - Install: npm install -g lighthouse"
  fi
  if command_exists "ffmpeg"; then
    echo "  [OK] ffmpeg (video frame extraction for captions)"
  else
    echo "  [MISSING] ffmpeg - Install: apt install ffmpeg or brew install ffmpeg"
  fi
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
    echo "    Install: npm install -g ajv-cli"
    echo "    Or: pip install jsonschema"
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

  # Step 2: Check Optional Tools
  echo "--- Step 2: Optional Tools (Accessibility) ---"
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
  echo ""

  # Step 3: Check Schema
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

  # Step 4: Test WCAG-specific validation
  echo "--- Step 4: WCAG Validation Functions ---"

  # Create a test output
  test_file=$(mktemp)
  cat > "$test_file" << 'EOF'
{
  "skillName": "accessibility-testing",
  "version": "1.0.0",
  "timestamp": "2026-02-02T12:00:00Z",
  "status": "partial",
  "trustTier": 3,
  "output": {
    "summary": "Accessibility audit found 3 WCAG 2.2 violations requiring remediation.",
    "conformanceLevel": "none",
    "targetLevel": "AA",
    "wcagVersion": "2.2",
    "pourBreakdown": {
      "perceivable": { "score": 75, "violationCount": 2, "criticalCount": 0, "seriousCount": 1, "moderateCount": 1, "minorCount": 0 },
      "operable": { "score": 90, "violationCount": 1, "criticalCount": 0, "seriousCount": 0, "moderateCount": 1, "minorCount": 0 },
      "understandable": { "score": 100, "violationCount": 0, "criticalCount": 0, "seriousCount": 0, "moderateCount": 0, "minorCount": 0 },
      "robust": { "score": 100, "violationCount": 0, "criticalCount": 0, "seriousCount": 0, "moderateCount": 0, "minorCount": 0 }
    },
    "findings": [
      {
        "id": "A11Y-001",
        "title": "Image missing alt text",
        "severity": "serious",
        "wcagCriterion": "1.1.1",
        "wcagLevel": "A",
        "pourPrinciple": "perceivable",
        "description": "Image element does not have an alt attribute",
        "impact": "Screen reader users cannot understand the image content"
      }
    ]
  }
}
EOF

  # Test validation
  if validate_json "$test_file" 2>/dev/null; then
    success "Test output is valid JSON"

    # Check WCAG-specific fields
    conformance=$(json_get "$test_file" ".output.conformanceLevel" 2>/dev/null)
    if [[ -n "$conformance" ]]; then
      success "WCAG conformance level detected: $conformance"
    else
      error "WCAG conformance level not found"
      self_test_passed=false
    fi

    # Check POUR breakdown
    pour_perceivable=$(json_get "$test_file" ".output.pourBreakdown.perceivable.score" 2>/dev/null)
    if [[ -n "$pour_perceivable" ]]; then
      success "POUR breakdown detected: perceivable score = $pour_perceivable"
    else
      error "POUR breakdown not found"
      self_test_passed=false
    fi

    # Check finding structure
    finding_wcag=$(json_get "$test_file" ".output.findings[0].wcagCriterion" 2>/dev/null)
    if [[ "$finding_wcag" == "1.1.1" ]]; then
      success "Finding WCAG criterion detected: $finding_wcag"
    else
      warn "Finding WCAG criterion not properly formatted"
      ((self_test_warnings++)) || true
    fi
  else
    error "Test output validation failed"
    self_test_passed=false
  fi

  rm -f "$test_file"
  echo ""

  # Step 5: Run Library Self-Test
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
      echo ""
      echo "The validator is functional but has reduced capabilities."
      echo "Consider installing missing accessibility tools for full auditing."
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
# SKILL-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

# Validate WCAG criterion format (X.Y.Z pattern)
validate_wcag_criterion() {
  local criterion="$1"
  if [[ "$criterion" =~ ^[1-4]\.[0-9]+\.[0-9]+$ ]]; then
    return 0
  else
    return 1
  fi
}

# Validate POUR principle
validate_pour_principle() {
  local principle="$1"
  case "$principle" in
    perceivable|operable|understandable|robust)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# Validate finding severity
validate_finding_severity() {
  local severity="$1"
  case "$severity" in
    critical|serious|moderate|minor)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# =============================================================================
# Skill-Specific Validation
# =============================================================================

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running accessibility-specific validations..."

  # Validate POUR breakdown structure
  echo "  Checking POUR breakdown..."
  local pour_principles=("perceivable" "operable" "understandable" "robust")
  for principle in "${pour_principles[@]}"; do
    local score
    score=$(json_get "$output_file" ".output.pourBreakdown.$principle.score" 2>/dev/null)
    if [[ -z "$score" ]] || [[ "$score" == "null" ]]; then
      error "Missing POUR principle: $principle"
      has_errors=true
    else
      debug "POUR $principle score: $score"
    fi
  done

  # Validate findings have proper WCAG structure
  echo "  Checking finding structure..."
  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)

  if [[ -n "$finding_count" ]] && [[ "$finding_count" -gt 0 ]]; then
    # Check first finding for required fields
    local first_finding_id
    first_finding_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    if [[ -z "$first_finding_id" ]] || [[ ! "$first_finding_id" =~ ^A11Y-[0-9]+$ ]]; then
      warn "Finding ID should match pattern A11Y-XXX, got: $first_finding_id"
    fi

    local first_finding_wcag
    first_finding_wcag=$(json_get "$output_file" ".output.findings[0].wcagCriterion" 2>/dev/null)
    if [[ -n "$first_finding_wcag" ]] && ! validate_wcag_criterion "$first_finding_wcag"; then
      error "Invalid WCAG criterion format: $first_finding_wcag (expected X.Y.Z)"
      has_errors=true
    fi

    local first_finding_severity
    first_finding_severity=$(json_get "$output_file" ".output.findings[0].severity" 2>/dev/null)
    if [[ -n "$first_finding_severity" ]] && ! validate_finding_severity "$first_finding_severity"; then
      error "Invalid finding severity: $first_finding_severity"
      has_errors=true
    fi

    local first_finding_pour
    first_finding_pour=$(json_get "$output_file" ".output.findings[0].pourPrinciple" 2>/dev/null)
    if [[ -n "$first_finding_pour" ]] && ! validate_pour_principle "$first_finding_pour"; then
      error "Invalid POUR principle: $first_finding_pour"
      has_errors=true
    fi

    success "Found $finding_count accessibility findings with valid structure"
  else
    info "No findings detected (site may be fully compliant)"
  fi

  # Check conformance level consistency
  echo "  Checking conformance level consistency..."
  local conformance_level
  conformance_level=$(json_get "$output_file" ".output.conformanceLevel" 2>/dev/null)
  local target_level
  target_level=$(json_get "$output_file" ".output.targetLevel" 2>/dev/null)

  if [[ -n "$finding_count" ]] && [[ "$finding_count" -gt 0 ]]; then
    # If there are findings, conformance should likely not be AAA
    if [[ "$conformance_level" == "AAA" ]]; then
      warn "Conformance level is AAA but findings exist - verify this is correct"
    fi
  fi

  # Check for video caption outputs if video analysis was done
  local video_count
  video_count=$(json_count "$output_file" ".output.videoCaptions" 2>/dev/null)
  if [[ -n "$video_count" ]] && [[ "$video_count" -gt 0 ]]; then
    success "Video accessibility analysis included: $video_count video(s)"

    # Check first video has caption path
    local caption_path
    caption_path=$(json_get "$output_file" ".output.videoCaptions[0].captionsPath" 2>/dev/null)
    if [[ -n "$caption_path" ]] && [[ "$caption_path" != "null" ]]; then
      success "WebVTT captions generated: $caption_path"
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Accessibility-specific validation passed"
  return 0
}

# =============================================================================
# Validation Functions (from template)
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
      success "All required terms found (WCAG, accessibility)"
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
    [[ "$JSON_ONLY" != "true" ]] && error "Validation cannot proceed without required tools"
    exit $EXIT_SKIP
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "Tool check passed" && echo ""

  # Step 2: Validate JSON Syntax
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 2: JSON Syntax ---"

  if ! validate_json "$OUTPUT_FILE"; then
    json_status="failed"
    ((error_count++)) || true
    [[ "$JSON_ONLY" != "true" ]] && error "File is not valid JSON - cannot proceed"
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

  # Step 6: Validate Content Terms
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 6: Content Terms ---"

  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 7: Skill-Specific Validation (WCAG/POUR)
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 7: WCAG/Accessibility Validation ---"

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
    echo "  Tools:           $tool_status"
    echo "  JSON Syntax:     $json_status"
    echo "  Schema:          $schema_status"
    echo "  Fields:          $fields_status"
    echo "  Enums:           $enums_status"
    echo "  Content:         $content_status"
    echo "  WCAG/A11y:       $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:         $overall_status"
    echo "  Errors:          $error_count"
    echo "  Warnings:        $warning_count"
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
