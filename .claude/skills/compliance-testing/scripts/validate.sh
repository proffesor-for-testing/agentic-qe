#!/bin/bash
# =============================================================================
# AQE Skill Validator: Compliance Testing v1.0.0
# Validates compliance-testing skill output against schema and content rules
# =============================================================================
#
# This validator checks:
# 1. JSON syntax validity
# 2. Schema compliance (compliance-testing specific)
# 3. Required compliance framework fields
# 4. Control structure validation
# 5. Risk assessment field validation
# 6. Compliance rule engine checks
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

# Get script directory (handle both direct execution and sourcing)
if [[ -n "${BASH_SOURCE[0]:-}" ]] && [[ "${BASH_SOURCE[0]}" != "$0" || -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  # Fallback: use $0 or detect from current directory
  if [[ -f "$0" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  else
    SCRIPT_DIR="$(pwd)"
  fi
fi

SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Find project root by looking for .claude directory
PROJECT_ROOT="$SKILL_DIR"
while [[ "$PROJECT_ROOT" != "/" ]]; do
  if [[ -d "$PROJECT_ROOT/.claude" ]] && [[ -d "$PROJECT_ROOT/.claude/skills/.validation" ]]; then
    break
  fi
  PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

# Fallback: go up expected number of levels
if [[ "$PROJECT_ROOT" == "/" ]]; then
  PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
fi

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
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="compliance-testing"
SKILL_VERSION="1.0.0"

# Required tools - jq is essential for compliance validation
REQUIRED_TOOLS=("jq")

# Optional tools for enhanced validation
OPTIONAL_TOOLS=("node" "python3" "ajv" "jsonschema")

# Schema path
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Sample output for self-test
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/.claude/skills/.validation/test-data/sample-output.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required base fields
REQUIRED_FIELDS=("skillName" "status" "output" "timestamp")

# Fields that must have values
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.complianceFrameworks")

# Compliance-specific terms that should appear in output
MUST_CONTAIN_TERMS=()  # Set dynamically based on frameworks

# Terms that indicate problems
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder" "example.com")

# Enum validations
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

# Minimum array lengths
MIN_ARRAY_LENGTHS=(
  ".output.complianceFrameworks:1"
)

# =============================================================================
# COMPLIANCE-SPECIFIC CONSTANTS
# =============================================================================

# Valid compliance frameworks
VALID_FRAMEWORKS=("GDPR" "HIPAA" "SOC2" "PCI-DSS" "CCPA" "ISO27001" "NIST" "FedRAMP")

# Required fields per framework
declare -A FRAMEWORK_REQUIRED_TERMS
FRAMEWORK_REQUIRED_TERMS["GDPR"]="data-subject|privacy|consent|erasure|portability"
FRAMEWORK_REQUIRED_TERMS["HIPAA"]="PHI|protected-health|encryption|access-control|audit"
FRAMEWORK_REQUIRED_TERMS["SOC2"]="security|availability|confidentiality|processing-integrity|privacy"
FRAMEWORK_REQUIRED_TERMS["PCI-DSS"]="cardholder|payment|encryption|access|network"
FRAMEWORK_REQUIRED_TERMS["CCPA"]="consumer|privacy|opt-out|sale|personal-information"

# Control ID patterns per framework
declare -A FRAMEWORK_CONTROL_PATTERNS
FRAMEWORK_CONTROL_PATTERNS["GDPR"]="^GDPR-Art[0-9]+"
FRAMEWORK_CONTROL_PATTERNS["HIPAA"]="^HIPAA-[0-9]+"
FRAMEWORK_CONTROL_PATTERNS["SOC2"]="^SOC2-CC[0-9]+"
FRAMEWORK_CONTROL_PATTERNS["PCI-DSS"]="^PCI-[0-9]+"
FRAMEWORK_CONTROL_PATTERNS["CCPA"]="^CCPA-[0-9]+"

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
Compliance Testing Skill Validator

Usage: ./validate.sh <output-file> [options]
       ./validate.sh --self-test [--verbose]
       ./validate.sh --list-tools

Arguments:
  <output-file>     Path to compliance-testing skill output JSON file

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

Compliance Frameworks Validated:
  - GDPR (EU General Data Protection Regulation)
  - HIPAA (Health Insurance Portability and Accountability Act)
  - SOC2 (Service Organization Control 2)
  - PCI-DSS (Payment Card Industry Data Security Standard)
  - CCPA (California Consumer Privacy Act)

Examples:
  ./validate.sh compliance-output.json              # Validate output
  ./validate.sh compliance-output.json --verbose    # Verbose validation
  ./validate.sh --self-test                         # Run self-test

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
  echo "Compliance frameworks supported:"
  for framework in "${VALID_FRAMEWORKS[@]}"; do
    echo "  - $framework"
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
  echo "Validator version: $AQE_VALIDATOR_VERSION"
  echo "Skill version: $SKILL_VERSION"
  echo ""

  self_test_passed=true
  self_test_warnings=0

  # Check required tools
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

  # Check optional tools
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

  # Check schema file
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

  # Check compliance framework constants
  echo "--- Step 4: Framework Configuration ---"
  for framework in "${VALID_FRAMEWORKS[@]}"; do
    if [[ -n "${FRAMEWORK_REQUIRED_TERMS[$framework]:-}" ]]; then
      success "Framework configured: $framework"
    else
      warn "Framework missing terms config: $framework"
      ((self_test_warnings++)) || true
    fi
  done
  echo ""

  # Run library self-test
  echo "--- Step 5: Validator Library ---"
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
    if [[ $self_test_warnings -gt 0 ]]; then
      warn "Self-test PASSED with $self_test_warnings warning(s)"
    else
      success "Self-test PASSED"
    fi
    exit 0
  else
    error "Self-test FAILED"
    exit 1
  fi
fi

# =============================================================================
# COMPLIANCE-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

# Validate compliance frameworks in output
validate_compliance_frameworks() {
  local output_file="$1"
  local has_errors=false

  debug "Validating compliance frameworks..."

  # Get frameworks from output
  local frameworks
  frameworks=$(jq -r '.output.complianceFrameworks[]?.id // empty' "$output_file" 2>/dev/null)

  if [[ -z "$frameworks" ]]; then
    error "No compliance frameworks found in output"
    return 1
  fi

  local framework_count=0
  while IFS= read -r framework; do
    ((framework_count++)) || true

    # Check if framework is valid
    local is_valid=false
    for valid_fw in "${VALID_FRAMEWORKS[@]}"; do
      if [[ "$framework" == "$valid_fw" ]]; then
        is_valid=true
        break
      fi
    done

    if [[ "$is_valid" == "false" ]]; then
      error "Invalid compliance framework: $framework"
      has_errors=true
    else
      debug "Valid framework: $framework"
    fi

    # Check framework has required score
    local score
    score=$(jq -r ".output.complianceFrameworks[] | select(.id == \"$framework\") | .score.percentage // -1" "$output_file" 2>/dev/null)
    if [[ "$score" == "-1" ]] || [[ -z "$score" ]]; then
      error "Framework $framework missing compliance score"
      has_errors=true
    fi
  done <<< "$frameworks"

  if [[ $framework_count -eq 0 ]]; then
    error "No valid compliance frameworks found"
    return 1
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "All $framework_count compliance frameworks are valid"
  return 0
}

# Validate compliance controls structure
validate_compliance_controls() {
  local output_file="$1"
  local has_errors=false

  debug "Validating compliance controls..."

  # Check if controls exist
  local control_count
  control_count=$(jq '.output.controls | length // 0' "$output_file" 2>/dev/null)

  if [[ "$control_count" -eq 0 ]]; then
    warn "No compliance controls in output (may be acceptable for summary-only audit)"
    return 0
  fi

  # Validate each control has required fields
  local invalid_controls=0
  local controls_without_evidence=0

  while IFS= read -r control_json; do
    local control_id requirement status

    control_id=$(echo "$control_json" | jq -r '.id // empty')
    requirement=$(echo "$control_json" | jq -r '.requirement // empty')
    status=$(echo "$control_json" | jq -r '.status // empty')

    # Check required fields
    if [[ -z "$control_id" ]]; then
      ((invalid_controls++)) || true
      debug "Control missing ID"
      continue
    fi

    if [[ -z "$requirement" ]]; then
      ((invalid_controls++)) || true
      debug "Control $control_id missing requirement"
    fi

    if [[ -z "$status" ]]; then
      ((invalid_controls++)) || true
      debug "Control $control_id missing status"
    fi

    # Validate status enum
    if [[ -n "$status" ]]; then
      case "$status" in
        pass|fail|partial|not-applicable|not-tested)
          debug "Control $control_id status valid: $status"
          ;;
        *)
          error "Control $control_id has invalid status: $status"
          has_errors=true
          ;;
      esac
    fi

    # Check for evidence on failed controls
    local evidence
    evidence=$(echo "$control_json" | jq -r '.evidence // empty')
    if [[ "$status" == "fail" ]] && [[ -z "$evidence" ]]; then
      ((controls_without_evidence++)) || true
      debug "Failed control $control_id has no evidence"
    fi
  done < <(jq -c '.output.controls[]?' "$output_file" 2>/dev/null)

  if [[ $invalid_controls -gt 0 ]]; then
    warn "$invalid_controls controls missing required fields"
  fi

  if [[ $controls_without_evidence -gt 0 ]]; then
    warn "$controls_without_evidence failed controls have no evidence"
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Validated $control_count compliance controls"
  return 0
}

# Validate risk assessment structure
validate_risk_assessment() {
  local output_file="$1"

  debug "Validating risk assessment..."

  # Check if risk assessment exists
  local risk_level
  risk_level=$(jq -r '.output.riskAssessment.overallRiskLevel // empty' "$output_file" 2>/dev/null)

  if [[ -z "$risk_level" ]]; then
    warn "No risk assessment in output"
    return 0
  fi

  # Validate risk level enum
  case "$risk_level" in
    critical|high|medium|low|minimal)
      debug "Valid risk level: $risk_level"
      ;;
    *)
      error "Invalid risk level: $risk_level"
      return 1
      ;;
  esac

  # Check risk score
  local risk_score
  risk_score=$(jq '.output.riskAssessment.riskScore // -1' "$output_file" 2>/dev/null)

  if [[ "$risk_score" != "-1" ]]; then
    if (( $(echo "$risk_score < 0 || $risk_score > 100" | bc -l 2>/dev/null || echo "1") )); then
      error "Risk score out of range (0-100): $risk_score"
      return 1
    fi
  fi

  success "Risk assessment validation passed"
  return 0
}

# Validate findings structure
validate_compliance_findings() {
  local output_file="$1"
  local has_errors=false

  debug "Validating compliance findings..."

  local finding_count
  finding_count=$(jq '.output.findings | length // 0' "$output_file" 2>/dev/null)

  if [[ "$finding_count" -eq 0 ]]; then
    debug "No findings in output (may be compliant)"
    return 0
  fi

  # Validate finding IDs follow pattern COMP-XXX
  local invalid_ids=0
  while IFS= read -r finding_id; do
    if [[ ! "$finding_id" =~ ^COMP-[0-9]{3,6}$ ]]; then
      debug "Invalid finding ID format: $finding_id (expected COMP-XXX)"
      ((invalid_ids++)) || true
    fi
  done < <(jq -r '.output.findings[]?.id // empty' "$output_file" 2>/dev/null)

  if [[ $invalid_ids -gt 0 ]]; then
    warn "$invalid_ids findings have non-standard ID format"
  fi

  # Validate severity distribution makes sense
  local critical_count high_count
  critical_count=$(jq '[.output.findings[]? | select(.severity == "critical")] | length' "$output_file" 2>/dev/null)
  high_count=$(jq '[.output.findings[]? | select(.severity == "high")] | length' "$output_file" 2>/dev/null)

  debug "Findings: $finding_count total, $critical_count critical, $high_count high"

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Validated $finding_count compliance findings"
  return 0
}

# Validate data privacy assessment (GDPR/CCPA specific)
validate_data_privacy() {
  local output_file="$1"

  debug "Validating data privacy assessment..."

  # Check if data privacy section exists
  local privacy_exists
  privacy_exists=$(jq 'has("output") and (.output | has("dataPrivacy"))' "$output_file" 2>/dev/null)

  if [[ "$privacy_exists" != "true" ]]; then
    debug "No data privacy assessment (may not be GDPR/CCPA audit)"
    return 0
  fi

  # Check PII detection
  local pii_detected
  pii_detected=$(jq '.output.dataPrivacy.piiDetected // false' "$output_file" 2>/dev/null)

  if [[ "$pii_detected" == "true" ]]; then
    # If PII detected, should have categories
    local pii_categories
    pii_categories=$(jq '.output.dataPrivacy.piiCategories | length // 0' "$output_file" 2>/dev/null)

    if [[ "$pii_categories" -eq 0 ]]; then
      warn "PII detected but no categories specified"
    else
      debug "PII categories found: $pii_categories"
    fi
  fi

  success "Data privacy assessment validation passed"
  return 0
}

# Main skill-specific validation
validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running compliance-testing specific validations..."

  # Validate compliance frameworks
  if ! validate_compliance_frameworks "$output_file"; then
    has_errors=true
  fi

  # Validate controls structure
  if ! validate_compliance_controls "$output_file"; then
    has_errors=true
  fi

  # Validate risk assessment
  if ! validate_risk_assessment "$output_file"; then
    has_errors=true
  fi

  # Validate findings
  if ! validate_compliance_findings "$output_file"; then
    has_errors=true
  fi

  # Validate data privacy
  if ! validate_data_privacy "$output_file"; then
    has_errors=true
  fi

  # Check overall compliance score exists
  local overall_score
  overall_score=$(jq '.output.overallComplianceScore.percentage // -1' "$output_file" 2>/dev/null)

  if [[ "$overall_score" == "-1" ]]; then
    error "Missing overall compliance score"
    has_errors=true
  else
    debug "Overall compliance score: $overall_score%"
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
    echo "  Schema:  $SCHEMA_PATH"
    echo ""
  fi

  # Track validation status
  local tool_status="passed"
  local json_status="passed"
  local schema_status="passed"
  local fields_status="passed"
  local content_status="passed"
  local specific_status="passed"
  local error_count=0
  local warning_count=0

  # Step 1: Check tools
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 1: Tool Availability ---"
  fi

  local missing_tools=()
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      missing_tools+=("$tool")
    fi
  done

  if [[ ${#missing_tools[@]} -gt 0 ]]; then
    tool_status="failed"
    error "Missing required tools: ${missing_tools[*]}"
    exit $EXIT_SKIP
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "All required tools available" && echo ""

  # Step 2: Validate JSON syntax
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 2: JSON Syntax ---"
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    json_status="failed"
    ((error_count++)) || true
    [[ "$JSON_ONLY" != "true" ]] && error "Invalid JSON syntax"
    exit $EXIT_FAIL
  fi

  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid" && echo ""

  # Step 3: Schema validation
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 3: Schema Validation ---"
  fi

  if [[ -f "$SCHEMA_PATH" ]]; then
    local schema_result
    schema_result=$(validate_json_schema "$SCHEMA_PATH" "$OUTPUT_FILE" 2>&1) || true
    local schema_exit=$?

    case $schema_exit in
      0)
        [[ "$JSON_ONLY" != "true" ]] && success "Schema validation passed"
        ;;
      1)
        schema_status="failed"
        ((error_count++)) || true
        [[ "$JSON_ONLY" != "true" ]] && error "Schema validation failed"
        ;;
      2)
        schema_status="skipped"
        ((warning_count++)) || true
        [[ "$JSON_ONLY" != "true" ]] && warn "Schema validation skipped (no validator)"
        ;;
    esac
  else
    schema_status="skipped"
    ((warning_count++)) || true
    [[ "$JSON_ONLY" != "true" ]] && warn "Schema file not found, skipping validation"
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 4: Required fields
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 4: Required Fields ---"
  fi

  local missing_fields=()
  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(jq -r ".$field // empty" "$OUTPUT_FILE" 2>/dev/null)
    if [[ -z "$value" ]]; then
      missing_fields+=("$field")
    fi
  done

  if [[ ${#missing_fields[@]} -gt 0 ]]; then
    fields_status="failed"
    ((error_count++)) || true
    [[ "$JSON_ONLY" != "true" ]] && error "Missing required fields: ${missing_fields[*]}"
  else
    [[ "$JSON_ONLY" != "true" ]] && success "All required fields present"
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 5: Enum validation
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 5: Enum Validation ---"
  fi

  local status_value
  status_value=$(jq -r '.status // empty' "$OUTPUT_FILE" 2>/dev/null)

  case "$status_value" in
    success|partial|failed|skipped)
      [[ "$JSON_ONLY" != "true" ]] && success "Status enum valid: $status_value"
      ;;
    *)
      content_status="failed"
      ((error_count++)) || true
      [[ "$JSON_ONLY" != "true" ]] && error "Invalid status value: $status_value"
      ;;
  esac

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 6: Compliance-specific validation
  if [[ "$JSON_ONLY" != "true" ]]; then
    echo "--- Step 6: Compliance-Specific Validation ---"
  fi

  if ! validate_skill_specific "$OUTPUT_FILE"; then
    specific_status="failed"
    ((error_count++)) || true
  else
    [[ "$JSON_ONLY" != "true" ]] && success "Compliance-specific validation passed"
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Determine overall status
  local overall_status="passed"
  if [[ "$json_status" == "failed" ]] || \
     [[ "$schema_status" == "failed" ]] || \
     [[ "$fields_status" == "failed" ]] || \
     [[ "$content_status" == "failed" ]] || \
     [[ "$specific_status" == "failed" ]]; then
    overall_status="failed"
  elif [[ "$schema_status" == "skipped" ]]; then
    overall_status="partial"
  fi

  # Output results
  if [[ "$JSON_ONLY" == "true" ]]; then
    output_validation_report "$SKILL_NAME" "$schema_status" "$content_status" "$tool_status"
  else
    echo "=============================================="
    echo "Validation Summary for $SKILL_NAME"
    echo "=============================================="
    echo ""
    echo "  Tools:              $tool_status"
    echo "  JSON Syntax:        $json_status"
    echo "  Schema:             $schema_status"
    echo "  Required Fields:    $fields_status"
    echo "  Content:            $content_status"
    echo "  Compliance-Specific: $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:            $overall_status"
    echo "  Errors:             $error_count"
    echo "  Warnings:           $warning_count"
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

# Run main
main
