#!/bin/bash
# =============================================================================
# AQE Skill Validator: chaos-engineering-resilience v1.0.0
# Validates chaos engineering skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (chaos experiment types, fault injection, steady-state)
# 2. Required chaos tools availability (kubectl, litmus, gremlin)
# 3. Experiment structure and completeness
# 4. Steady-state hypothesis validation
# 5. Blast radius and safety controls
# 6. Chaos-specific content validation
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
# scripts/ -> chaos-engineering-resilience/ -> skills/ -> .claude/ -> project root
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
SKILL_NAME="chaos-engineering-resilience"
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# jq is essential for JSON parsing
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
# These enhance chaos engineering capabilities
OPTIONAL_TOOLS=("chaos" "litmus" "gremlin" "kubectl" "node" "ajv" "jsonschema" "python3")

# Path to output JSON schema
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Path to sample test data for self-test
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/.claude/skills/.validation/examples/chaos-engineering-output.example.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required fields in output
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.experiments" "output.resilienceScore")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

# Chaos-specific terms that MUST appear in output
MUST_CONTAIN_TERMS=("chaos" "experiment" "resilience")

# Terms that must NOT appear in output (indicates failure/hallucination)
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

# Enum validations
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
)

# Minimum array lengths
MIN_ARRAY_LENGTHS=(
  ".output.experiments:1"
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
AQE Chaos Engineering Resilience Skill Validator v1.0.0

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

Chaos Tool Requirements:
  Required:  jq (JSON parsing)
  Optional:  chaos (Chaos Toolkit), litmus (LitmusChaos), gremlin (Gremlin),
             kubectl (Kubernetes), node (Node.js)

Examples:
  ./validate.sh chaos-output.json              # Validate output file
  ./validate.sh chaos-output.json --json       # JSON output for CI
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
        chaos) version=$(chaos version 2>&1 | head -1 || echo "installed") ;;
        litmus) version=$(litmusctl version 2>&1 | head -1 || echo "installed") ;;
        gremlin) version=$(gremlin version 2>&1 | head -1 || echo "installed") ;;
        kubectl) version=$(kubectl version --client 2>&1 | head -1 || echo "installed") ;;
        node) version=$(node --version 2>&1 | head -1 || echo "installed") ;;
        python3) version=$(python3 --version 2>&1 | head -1 || echo "installed") ;;
        *) version="installed" ;;
      esac
      echo "  [OK] $tool - $version"
    else
      echo "  [MISSING] $tool"
    fi
  done
  echo ""
  echo "Chaos Engineering Capabilities:"
  if command_exists "chaos"; then
    echo "  [OK] Chaos Toolkit - Chaos experiments and game days"
  else
    echo "  [MISSING] Chaos Toolkit - Install: pip install chaostoolkit"
  fi
  if command_exists "litmus" || command_exists "litmusctl"; then
    echo "  [OK] LitmusChaos - Kubernetes-native chaos engineering"
  else
    echo "  [MISSING] LitmusChaos - Install: https://litmuschaos.io"
  fi
  if command_exists "gremlin"; then
    echo "  [OK] Gremlin - Enterprise chaos engineering"
  else
    echo "  [MISSING] Gremlin - Install: https://gremlin.com"
  fi
  if command_exists "kubectl"; then
    echo "  [OK] kubectl - Kubernetes pod/node manipulation"
  else
    echo "  [MISSING] kubectl - Required for Kubernetes chaos"
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

  # Step 2: Check Optional Chaos Tools
  echo "--- Step 2: Chaos Engineering Tools ---"
  chaos_tools=("chaos" "litmus" "litmusctl" "gremlin" "kubectl")
  available_chaos=0
  for tool in "${chaos_tools[@]}"; do
    if command_exists "$tool"; then
      success "Chaos tool available: $tool"
      ((available_chaos++)) || true
    else
      warn "Chaos tool missing: $tool"
      ((self_test_warnings++)) || true
    fi
  done

  if [[ $available_chaos -eq 0 ]]; then
    warn "No chaos engineering tools available - limited experiment execution"
    ((self_test_warnings++)) || true
  fi
  echo ""

  # Step 3: Check Schema File
  echo "--- Step 3: Schema File ---"
  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists: $SCHEMA_PATH"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema file is valid JSON"

      # Check for chaos-specific schema elements
      if grep -q "chaosExperiment" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes chaos experiment definition"
      else
        warn "Schema may be missing chaos experiment definition"
        ((self_test_warnings++)) || true
      fi

      if grep -q "steadyStateHypothesis" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes steady-state hypothesis"
      else
        warn "Schema may be missing steady-state hypothesis"
        ((self_test_warnings++)) || true
      fi

      if grep -q "blastRadius" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes blast radius controls"
      else
        warn "Schema may be missing blast radius controls"
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

      # Test chaos-specific validation
      if validate_chaos_experiments "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
        success "Sample output has valid chaos experiments"
      else
        warn "Sample output chaos validation issue"
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

# Validate chaos experiments structure
# Returns: 0 if valid, 1 if invalid
validate_chaos_experiments() {
  local output_file="$1"

  # Check experiments array exists
  local experiments_data
  experiments_data=$(json_get "$output_file" ".output.experiments" 2>/dev/null)

  if [[ -z "$experiments_data" ]] || [[ "$experiments_data" == "null" ]]; then
    warn "Missing experiments array in output"
    return 1
  fi

  local experiment_count
  experiment_count=$(json_count "$output_file" ".output.experiments" 2>/dev/null)

  if [[ -z "$experiment_count" ]] || [[ "$experiment_count" == "null" ]] || [[ "$experiment_count" -lt 1 ]]; then
    error "No chaos experiments found in output"
    return 1
  fi

  debug "Found $experiment_count chaos experiments"

  # Validate first experiment structure
  local first_id first_type first_result
  first_id=$(json_get "$output_file" ".output.experiments[0].id" 2>/dev/null)
  first_type=$(json_get "$output_file" ".output.experiments[0].type" 2>/dev/null)
  first_result=$(json_get "$output_file" ".output.experiments[0].result" 2>/dev/null)

  if [[ -z "$first_id" ]] || [[ "$first_id" == "null" ]]; then
    error "Experiment missing 'id' field"
    return 1
  fi

  if [[ -z "$first_type" ]] || [[ "$first_type" == "null" ]]; then
    error "Experiment missing 'type' field"
    return 1
  fi

  # Validate type is valid enum
  if ! validate_enum "$first_type" "network" "resource" "state" "application" "infrastructure" "byzantine"; then
    error "Experiment has invalid type: $first_type"
    return 1
  fi

  if [[ -z "$first_result" ]] || [[ "$first_result" == "null" ]]; then
    error "Experiment missing 'result' field"
    return 1
  fi

  # Validate result is valid enum
  if ! validate_enum "$first_result" "passed" "failed" "partial" "expected-fail"; then
    error "Experiment has invalid result: $first_result"
    return 1
  fi

  return 0
}

# Validate steady-state hypothesis structure
# Returns: 0 if valid, 1 if invalid
validate_steady_state() {
  local output_file="$1"

  # Check if any experiment has steady-state hypothesis
  local has_hypothesis=false

  if command_exists "jq"; then
    local hypothesis_count
    hypothesis_count=$(jq '[.output.experiments[] | select(.steadyStateHypothesis != null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$hypothesis_count" -gt 0 ]]; then
      has_hypothesis=true
      debug "Found $hypothesis_count experiments with steady-state hypothesis"

      # Validate first hypothesis structure
      local first_metrics
      first_metrics=$(jq '.output.experiments[] | select(.steadyStateHypothesis != null) | .steadyStateHypothesis.metrics | length' "$output_file" 2>/dev/null | head -1)

      if [[ -n "$first_metrics" ]] && [[ "$first_metrics" -gt 0 ]]; then
        success "Steady-state hypothesis has $first_metrics metrics defined"
      else
        warn "Steady-state hypothesis has no metrics defined"
      fi
    fi
  fi

  if [[ "$has_hypothesis" == "false" ]]; then
    warn "No experiments have steady-state hypothesis defined"
    warn "Best practice: Define steady-state before chaos injection"
  fi

  return 0
}

# Validate blast radius controls
# Returns: 0 if valid, 1 if invalid
validate_blast_radius() {
  local output_file="$1"

  local has_blast_radius=false

  if command_exists "jq"; then
    local blast_radius_count
    blast_radius_count=$(jq '[.output.experiments[] | select(.blastRadius != null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$blast_radius_count" -gt 0 ]]; then
      has_blast_radius=true
      debug "Found $blast_radius_count experiments with blast radius controls"

      # Check for emergency stop
      local emergency_stop_enabled
      emergency_stop_enabled=$(jq '[.output.experiments[] | select(.blastRadius.emergencyStop == true)] | length' "$output_file" 2>/dev/null || echo "0")

      if [[ "$emergency_stop_enabled" -gt 0 ]]; then
        success "Emergency stop enabled for $emergency_stop_enabled experiments"
      else
        warn "No experiments have emergency stop enabled"
      fi
    fi
  fi

  if [[ "$has_blast_radius" == "false" ]]; then
    warn "No experiments have blast radius controls defined"
    warn "Best practice: Always define blast radius limits for safety"
  fi

  return 0
}

# Validate resilience score
# Returns: 0 if valid, 1 if invalid
validate_resilience_score() {
  local output_file="$1"

  local score_value score_max
  score_value=$(json_get "$output_file" ".output.resilienceScore.value" 2>/dev/null)
  score_max=$(json_get "$output_file" ".output.resilienceScore.max" 2>/dev/null)

  if [[ -z "$score_value" ]] || [[ "$score_value" == "null" ]]; then
    error "Missing resilience score value"
    return 1
  fi

  if [[ -z "$score_max" ]] || [[ "$score_max" == "null" ]]; then
    error "Missing resilience score max"
    return 1
  fi

  # Validate score is in range
  if command_exists "bc"; then
    if (( $(echo "$score_value < 0 || $score_value > $score_max" | bc -l 2>/dev/null || echo "0") )); then
      error "Resilience score $score_value out of range (0-$score_max)"
      return 1
    fi
  fi

  debug "Resilience score: $score_value/$score_max"
  return 0
}

# Validate weaknesses structure
# Returns: 0 if valid, 1 if invalid
validate_weaknesses() {
  local output_file="$1"

  local weakness_count
  weakness_count=$(json_count "$output_file" ".output.weaknesses" 2>/dev/null)

  if [[ -z "$weakness_count" ]] || [[ "$weakness_count" == "null" ]]; then
    weakness_count=0
  fi

  debug "Found $weakness_count weaknesses"

  # If there are weaknesses, validate structure
  if [[ "$weakness_count" -gt 0 ]]; then
    local first_severity
    first_severity=$(json_get "$output_file" ".output.weaknesses[0].severity" 2>/dev/null)

    if [[ -n "$first_severity" ]] && [[ "$first_severity" != "null" ]]; then
      if ! validate_enum "$first_severity" "critical" "high" "medium" "low"; then
        error "Weakness has invalid severity: $first_severity"
        return 1
      fi
    fi
  fi

  return 0
}

# Validate recovery times
# Returns: 0 if valid, 1 if invalid
validate_recovery_times() {
  local output_file="$1"

  if command_exists "jq"; then
    local recovery_data
    recovery_data=$(jq '[.output.experiments[] | select(.recoveryTime != null) | .recoveryTime] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$recovery_data" -gt 0 ]]; then
      # Check for SLA compliance
      local sla_violations
      sla_violations=$(jq '[.output.experiments[] | select(.recoveryTime != null and .recoveryTime.withinSla == false)] | length' "$output_file" 2>/dev/null || echo "0")

      if [[ "$sla_violations" -gt 0 ]]; then
        warn "Found $sla_violations experiments with SLA violations"
      else
        success "All experiments with recovery times are within SLA"
      fi
    else
      debug "No experiments have recovery time data"
    fi
  fi

  return 0
}

# Main skill-specific validation function
# Returns: 0 if valid, 1 if invalid
validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running chaos-engineering-resilience specific validations..."

  # Validate chaos experiments structure
  if ! validate_chaos_experiments "$output_file"; then
    has_errors=true
  else
    success "Chaos experiments validation passed"
  fi

  # Validate resilience score
  if ! validate_resilience_score "$output_file"; then
    has_errors=true
  else
    success "Resilience score validation passed"
  fi

  # Validate steady-state hypothesis (warning only)
  if ! validate_steady_state "$output_file"; then
    # Non-fatal warning
    debug "Steady-state validation issue (non-fatal)"
  else
    success "Steady-state hypothesis validation passed"
  fi

  # Validate blast radius (warning only)
  if ! validate_blast_radius "$output_file"; then
    # Non-fatal warning
    debug "Blast radius validation issue (non-fatal)"
  else
    success "Blast radius controls validation passed"
  fi

  # Validate weaknesses
  if ! validate_weaknesses "$output_file"; then
    has_errors=true
  else
    success "Weaknesses validation passed"
  fi

  # Validate recovery times (warning only)
  if ! validate_recovery_times "$output_file"; then
    # Non-fatal warning
    debug "Recovery times validation issue (non-fatal)"
  else
    success "Recovery times validation passed"
  fi

  # Check for chaos tool attribution
  local tools_used
  tools_used=$(json_get "$output_file" ".metadata.toolsUsed" 2>/dev/null)
  if [[ -z "$tools_used" ]] || [[ "$tools_used" == "null" ]] || [[ "$tools_used" == "[]" ]]; then
    warn "No chaos tools listed in metadata.toolsUsed"
  else
    debug "Chaos tools used: $tools_used"
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
      error "Output missing required chaos terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "All required chaos terms found"
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
  local arrays_status="passed"
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

  # Step 6: Validate Array Lengths
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 6: Array Validation ---"

  if ! validate_array_lengths "$OUTPUT_FILE"; then
    arrays_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 7: Validate Chaos Content Terms
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 7: Chaos Content Terms ---"

  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 8: Chaos-Specific Validation
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 8: Chaos-Specific Validation ---"

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
     [[ "$arrays_status" == "failed" ]] || \
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
    echo "  Array Lengths:     $arrays_status"
    echo "  Content Terms:     $content_status"
    echo "  Chaos-Specific:    $specific_status"
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
