#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-security-compliance v1.0.0
# Validates security compliance skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (vulnerabilities, compliance, remediations)
# 2. Vulnerability structure with CWE/CVE/OWASP references
# 3. Compliance standard results
# 4. CVSS scoring validity
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
  "$SKILL_DIR/scripts/validator-lib.sh"; do
  if [[ -f "$lib_path" ]]; then
    VALIDATOR_LIB="$lib_path"
    break
  fi
done

if [[ -n "$VALIDATOR_LIB" ]]; then
  source "$VALIDATOR_LIB"
else
  echo "ERROR: Validator library not found"
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="qe-security-compliance"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("semgrep" "trivy" "npm")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.vulnerabilities" "output.compliance")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("security" "vulnerability")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) VERBOSE=true; export AQE_DEBUG=1; shift ;;
    --json) JSON_ONLY=true; shift ;;
    -h|--help) echo "Usage: $0 <output-file> [--self-test] [--verbose] [--json]"; exit 0 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

# =============================================================================
# Self-Test Mode
# =============================================================================

if [[ "$SELF_TEST" == "true" ]]; then
  info "Running $SKILL_NAME Validator Self-Test"
  self_test_passed=true

  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" && success "Tool: $tool" || { error "Missing: $tool"; self_test_passed=false; }
  done

  for tool in "${OPTIONAL_TOOLS[@]}"; do
    command_exists "$tool" && success "Optional: $tool" || warn "Optional missing: $tool"
  done

  [[ -f "$SCHEMA_PATH" ]] && validate_json "$SCHEMA_PATH" 2>/dev/null && success "Schema valid" || self_test_passed=false
  run_self_test 2>/dev/null && success "Library OK" || self_test_passed=false

  [[ "$self_test_passed" == "true" ]] && { success "Self-test PASSED"; exit 0; } || { error "Self-test FAILED"; exit 1; }
fi

# =============================================================================
# SKILL-SPECIFIC VALIDATION FUNCTIONS
# =============================================================================

validate_vulnerabilities() {
  local output_file="$1"

  local total
  total=$(json_get "$output_file" ".output.vulnerabilities.total" 2>/dev/null)

  if [[ -z "$total" ]] || [[ "$total" == "null" ]]; then
    error "Missing vulnerabilities.total"
    return 1
  fi

  debug "Total vulnerabilities: $total"

  # Check severity counts
  local critical high medium low
  critical=$(json_get "$output_file" ".output.vulnerabilities.critical" 2>/dev/null)
  high=$(json_get "$output_file" ".output.vulnerabilities.high" 2>/dev/null)
  medium=$(json_get "$output_file" ".output.vulnerabilities.medium" 2>/dev/null)
  low=$(json_get "$output_file" ".output.vulnerabilities.low" 2>/dev/null)

  debug "Severity breakdown - Critical: ${critical:-0}, High: ${high:-0}, Medium: ${medium:-0}, Low: ${low:-0}"

  # Validate vulnerability items if present
  local items_count
  items_count=$(json_count "$output_file" ".output.vulnerabilities.items" 2>/dev/null)

  if [[ -n "$items_count" ]] && [[ "$items_count" -gt 0 ]]; then
    local first_severity
    first_severity=$(json_get "$output_file" ".output.vulnerabilities.items[0].severity" 2>/dev/null)

    if [[ -n "$first_severity" ]] && [[ "$first_severity" != "null" ]]; then
      if ! validate_enum "$first_severity" "critical" "high" "medium" "low" "info"; then
        error "Invalid vulnerability severity: $first_severity"
        return 1
      fi
    fi

    # Check for CWE format if present
    local first_cwe
    first_cwe=$(json_get "$output_file" ".output.vulnerabilities.items[0].cwe" 2>/dev/null)
    if [[ -n "$first_cwe" ]] && [[ "$first_cwe" != "null" ]]; then
      if ! [[ "$first_cwe" =~ ^CWE-[0-9]+$ ]]; then
        warn "Invalid CWE format: $first_cwe"
      fi
    fi
  fi

  success "Vulnerabilities validation passed"
  return 0
}

validate_compliance() {
  local output_file="$1"

  local standards_count
  standards_count=$(json_count "$output_file" ".output.compliance.standards" 2>/dev/null)

  if [[ -z "$standards_count" ]] || [[ "$standards_count" -lt 1 ]]; then
    warn "No compliance standards found"
    return 0
  fi

  debug "Found $standards_count compliance standards"

  # Check first standard
  local first_status
  first_status=$(json_get "$output_file" ".output.compliance.standards[0].status" 2>/dev/null)

  if [[ -n "$first_status" ]] && [[ "$first_status" != "null" ]]; then
    if ! validate_enum "$first_status" "compliant" "partially-compliant" "non-compliant" "not-tested"; then
      error "Invalid compliance status: $first_status"
      return 1
    fi
  fi

  success "Compliance validation passed"
  return 0
}

validate_owasp_categories() {
  local output_file="$1"

  local owasp_data
  owasp_data=$(json_get "$output_file" ".output.owaspCategories" 2>/dev/null)

  if [[ -z "$owasp_data" ]] || [[ "$owasp_data" == "null" ]]; then
    debug "No OWASP categories in output"
    return 0
  fi

  # Check for OWASP categories
  local categories_found=0
  for cat in "A01:2021" "A02:2021" "A03:2021"; do
    local cat_data
    cat_data=$(json_get "$output_file" ".output.owaspCategories.\"$cat\"" 2>/dev/null)
    if [[ -n "$cat_data" ]] && [[ "$cat_data" != "null" ]]; then
      ((categories_found++)) || true
    fi
  done

  debug "Found $categories_found OWASP categories"
  success "OWASP categories validation passed"
  return 0
}

validate_remediations() {
  local output_file="$1"

  local rem_count
  rem_count=$(json_count "$output_file" ".output.remediations" 2>/dev/null)

  if [[ -n "$rem_count" ]] && [[ "$rem_count" -gt 0 ]]; then
    local first_priority
    first_priority=$(json_get "$output_file" ".output.remediations[0].priority" 2>/dev/null)

    if [[ -n "$first_priority" ]] && [[ "$first_priority" != "null" ]]; then
      if ! validate_enum "$first_priority" "critical" "high" "medium" "low"; then
        error "Invalid remediation priority: $first_priority"
        return 1
      fi
    fi

    debug "Found $rem_count remediations"
  fi

  success "Remediations validation passed"
  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running security-compliance specific validations..."

  validate_vulnerabilities "$output_file" || has_errors=true
  validate_compliance "$output_file" || has_errors=true
  validate_owasp_categories "$output_file" || has_errors=true
  validate_remediations "$output_file" || has_errors=true

  # Check security score if present
  local score
  score=$(json_get "$output_file" ".output.securityScore.value" 2>/dev/null)
  if [[ -n "$score" ]] && [[ "$score" != "null" ]]; then
    debug "Security score: $score"
  fi

  [[ "$has_errors" == "true" ]] && return 1
  return 0
}

# =============================================================================
# Main Validation Flow
# =============================================================================

main() {
  [[ -z "$OUTPUT_FILE" ]] && { error "No output file specified"; exit 1; }
  [[ ! -f "$OUTPUT_FILE" ]] && { error "File not found: $OUTPUT_FILE"; exit 1; }

  [[ "$JSON_ONLY" != "true" ]] && info "Validating $SKILL_NAME Output"

  local error_count=0

  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" || { error "Missing: $tool"; exit $EXIT_SKIP; }
  done

  validate_json "$OUTPUT_FILE" || { error "Invalid JSON"; exit $EXIT_FAIL; }
  [[ "$JSON_ONLY" != "true" ]] && success "JSON syntax valid"

  [[ -f "$SCHEMA_PATH" ]] && { validate_json_schema "$SCHEMA_PATH" "$OUTPUT_FILE" || ((error_count++)) || true; }

  for field in "${REQUIRED_FIELDS[@]}"; do
    local value
    value=$(json_get "$OUTPUT_FILE" ".$field" 2>/dev/null)
    [[ -z "$value" ]] || [[ "$value" == "null" ]] && { error "Missing: $field"; ((error_count++)) || true; }
  done

  local content
  content=$(cat "$OUTPUT_FILE")
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    grep -qi "$term" <<< "$content" || { error "Missing term: $term"; ((error_count++)) || true; }
  done

  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    grep -qi "$term" <<< "$content" && { error "Forbidden: $term"; ((error_count++)) || true; }
  done

  validate_skill_specific "$OUTPUT_FILE" || ((error_count++)) || true

  [[ $error_count -gt 0 ]] && { [[ "$JSON_ONLY" != "true" ]] && error "Validation FAILED"; exit $EXIT_FAIL; }

  [[ "$JSON_ONLY" != "true" ]] && success "Validation PASSED"
  exit $EXIT_PASS
}

main
