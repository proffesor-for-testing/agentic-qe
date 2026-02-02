#!/bin/bash
# =============================================================================
# AQE Skill Validator: performance-testing v1.0.0
# Validates performance testing skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (response time percentiles, throughput, error rates)
# 2. Required performance testing tools availability (k6, artillery, jmeter)
# 3. Performance metrics structure and validity
# 4. SLA compliance validation
# 5. Bottleneck identification structure
# 6. Percentile values are properly ordered (p50 <= p95 <= p99)
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
# scripts/ -> performance-testing/ -> skills/ -> .claude/ -> project root
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
SKILL_NAME="performance-testing"
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# jq is essential for JSON parsing
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
# These enhance performance testing capabilities
OPTIONAL_TOOLS=("k6" "artillery" "jmeter" "node" "ajv" "jsonschema" "python3")

# Path to output JSON schema
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Path to sample test data for self-test
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/.claude/skills/.validation/examples/performance-testing-output.example.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required fields in output
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.testType" "output.metrics")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

# Performance-specific terms that MUST appear in output
MUST_CONTAIN_TERMS=("response" "throughput")

# Terms that must NOT appear in output (indicates failure/hallucination)
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

# Enum validations
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
  ".output.testType:load,stress,endurance,spike,volume,scalability,smoke,soak"
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
AQE Performance Testing Skill Validator v1.0.0

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

Performance Tool Requirements:
  Required:  jq (JSON parsing)
  Optional:  k6, artillery, jmeter (load testing tools)

Examples:
  ./validate.sh perf-output.json              # Validate output file
  ./validate.sh perf-output.json --json       # JSON output for CI
  ./validate.sh --self-test --verbose         # Self-test with debug
  ./validate.sh --list-tools                  # Show available tools

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
        k6) version=$(k6 version 2>&1 | head -1 || echo "installed") ;;
        artillery) version=$(artillery --version 2>&1 | head -1 || echo "installed") ;;
        jmeter) version=$(jmeter --version 2>&1 | grep -oP 'Version.*' | head -1 || echo "installed") ;;
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
  echo "Performance Testing Capabilities:"
  if command_exists "k6"; then
    echo "  [OK] k6 - Modern JavaScript-based load testing"
  else
    echo "  [MISSING] k6 - Install k6 for JavaScript-based load testing"
  fi
  if command_exists "artillery"; then
    echo "  [OK] artillery - YAML-based load testing"
  else
    echo "  [MISSING] artillery - Install artillery for YAML-based testing"
  fi
  if command_exists "jmeter"; then
    echo "  [OK] jmeter - Enterprise Java-based load testing"
  else
    echo "  [MISSING] jmeter - Install JMeter for enterprise testing"
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

  # Step 2: Check Optional Performance Testing Tools
  echo "--- Step 2: Performance Testing Tools ---"
  perf_tools=("k6" "artillery" "jmeter")
  available_perf=0
  for tool in "${perf_tools[@]}"; do
    if command_exists "$tool"; then
      success "Performance tool available: $tool"
      ((available_perf++)) || true
    else
      warn "Performance tool missing: $tool"
      ((self_test_warnings++)) || true
    fi
  done

  if [[ $available_perf -eq 0 ]]; then
    warn "No performance testing tools available"
    ((self_test_warnings++)) || true
  fi
  echo ""

  # Step 3: Check Schema File
  echo "--- Step 3: Schema File ---"
  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists: $SCHEMA_PATH"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema file is valid JSON"

      # Check for performance-specific schema elements
      if grep -q "responseTime" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes response time metrics"
      else
        warn "Schema may be missing response time definition"
        ((self_test_warnings++)) || true
      fi

      if grep -q "throughput" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes throughput metrics"
      else
        warn "Schema may be missing throughput definition"
        ((self_test_warnings++)) || true
      fi

      if grep -q "p95" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes percentile metrics"
      else
        warn "Schema may be missing percentile definitions"
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

      # Test performance-specific validation
      if validate_percentile_order "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
        success "Sample output has valid percentile ordering"
      else
        warn "Sample output percentile validation issue"
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

# Validate percentile values are properly ordered (p50 <= p75 <= p90 <= p95 <= p99)
# Returns: 0 if valid, 1 if invalid
validate_percentile_order() {
  local output_file="$1"

  # Extract percentiles from response time metrics
  local p50 p75 p90 p95 p99
  p50=$(json_get "$output_file" ".output.metrics.responseTime.p50" 2>/dev/null)
  p75=$(json_get "$output_file" ".output.metrics.responseTime.p75" 2>/dev/null)
  p90=$(json_get "$output_file" ".output.metrics.responseTime.p90" 2>/dev/null)
  p95=$(json_get "$output_file" ".output.metrics.responseTime.p95" 2>/dev/null)
  p99=$(json_get "$output_file" ".output.metrics.responseTime.p99" 2>/dev/null)

  # If no percentiles, skip validation
  if [[ -z "$p50" ]] && [[ -z "$p95" ]] && [[ -z "$p99" ]]; then
    debug "No percentile metrics found, skipping order validation"
    return 0
  fi

  # Validate ordering where values exist
  local has_errors=false

  # Helper function to compare with null/empty handling
  compare_percentiles() {
    local lower="$1"
    local higher="$2"
    local lower_name="$3"
    local higher_name="$4"

    if [[ -n "$lower" ]] && [[ "$lower" != "null" ]] && \
       [[ -n "$higher" ]] && [[ "$higher" != "null" ]]; then
      if command_exists "bc"; then
        if (( $(echo "$lower > $higher" | bc -l 2>/dev/null || echo "0") )); then
          error "Percentile ordering violated: $lower_name ($lower) > $higher_name ($higher)"
          return 1
        fi
      fi
    fi
    return 0
  }

  compare_percentiles "$p50" "$p75" "p50" "p75" || has_errors=true
  compare_percentiles "$p75" "$p90" "p75" "p90" || has_errors=true
  compare_percentiles "$p90" "$p95" "p90" "p95" || has_errors=true
  compare_percentiles "$p95" "$p99" "p95" "p99" || has_errors=true

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  debug "Percentile ordering is valid"
  return 0
}

# Validate throughput metrics have reasonable values
# Returns: 0 if valid, 1 if invalid
validate_throughput_metrics() {
  local output_file="$1"

  local rps total_requests successful_requests failed_requests
  rps=$(json_get "$output_file" ".output.metrics.throughput.requestsPerSecond" 2>/dev/null)
  total_requests=$(json_get "$output_file" ".output.metrics.throughput.totalRequests" 2>/dev/null)
  successful_requests=$(json_get "$output_file" ".output.metrics.throughput.successfulRequests" 2>/dev/null)
  failed_requests=$(json_get "$output_file" ".output.metrics.throughput.failedRequests" 2>/dev/null)

  # Skip if no throughput data
  if [[ -z "$total_requests" ]] || [[ "$total_requests" == "null" ]]; then
    debug "No throughput data found, skipping throughput validation"
    return 0
  fi

  # Validate total = successful + failed if both are present
  if [[ -n "$successful_requests" ]] && [[ "$successful_requests" != "null" ]] && \
     [[ -n "$failed_requests" ]] && [[ "$failed_requests" != "null" ]]; then
    local calculated_total=$((successful_requests + failed_requests))
    if [[ "$calculated_total" -ne "$total_requests" ]] && [[ "$total_requests" -gt 0 ]]; then
      warn "Throughput inconsistency: successful ($successful_requests) + failed ($failed_requests) != total ($total_requests)"
      # This is a warning, not an error
    fi
  fi

  # Validate RPS is non-negative
  if [[ -n "$rps" ]] && [[ "$rps" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$rps < 0" | bc -l 2>/dev/null || echo "0") )); then
        error "Invalid requests per second: $rps (must be >= 0)"
        return 1
      fi
    fi
  fi

  debug "Throughput metrics validation passed"
  return 0
}

# Validate error rate is within reasonable bounds
# Returns: 0 if valid, 1 if invalid
validate_error_rate() {
  local output_file="$1"

  local error_rate
  error_rate=$(json_get "$output_file" ".output.metrics.errorRate.percentage" 2>/dev/null)

  if [[ -z "$error_rate" ]] || [[ "$error_rate" == "null" ]]; then
    debug "No error rate found, skipping error rate validation"
    return 0
  fi

  # Validate error rate is between 0 and 100
  if command_exists "bc"; then
    if (( $(echo "$error_rate < 0 || $error_rate > 100" | bc -l 2>/dev/null || echo "0") )); then
      error "Invalid error rate: $error_rate (must be 0-100)"
      return 1
    fi
  fi

  debug "Error rate validation passed: ${error_rate}%"
  return 0
}

# Validate SLA compliance structure
# Returns: 0 if valid, 1 if invalid
validate_sla_compliance() {
  local output_file="$1"

  local sla_data
  sla_data=$(json_get "$output_file" ".output.slaCompliance" 2>/dev/null)

  if [[ -z "$sla_data" ]] || [[ "$sla_data" == "null" ]]; then
    debug "No SLA compliance data found"
    return 0
  fi

  # Check overallCompliant is boolean
  local overall_compliant
  overall_compliant=$(json_get "$output_file" ".output.slaCompliance.overallCompliant" 2>/dev/null)

  if [[ -n "$overall_compliant" ]] && [[ "$overall_compliant" != "null" ]]; then
    if [[ "$overall_compliant" != "true" ]] && [[ "$overall_compliant" != "false" ]]; then
      error "Invalid overallCompliant value: $overall_compliant (must be boolean)"
      return 1
    fi
  fi

  # Validate thresholds if present
  local threshold_count
  threshold_count=$(json_count "$output_file" ".output.slaCompliance.thresholds" 2>/dev/null)

  if [[ -n "$threshold_count" ]] && [[ "$threshold_count" != "null" ]] && [[ "$threshold_count" -gt 0 ]]; then
    debug "Found $threshold_count SLA thresholds"

    # Check first threshold has required fields
    local first_metric first_passed
    first_metric=$(json_get "$output_file" ".output.slaCompliance.thresholds[0].metric" 2>/dev/null)
    first_passed=$(json_get "$output_file" ".output.slaCompliance.thresholds[0].passed" 2>/dev/null)

    if [[ -z "$first_metric" ]] || [[ "$first_metric" == "null" ]]; then
      warn "SLA threshold missing 'metric' field"
    fi
  fi

  return 0
}

# Validate bottleneck structure
# Returns: 0 if valid, 1 if invalid
validate_bottlenecks() {
  local output_file="$1"

  local bottleneck_count
  bottleneck_count=$(json_count "$output_file" ".output.bottlenecks" 2>/dev/null)

  if [[ -z "$bottleneck_count" ]] || [[ "$bottleneck_count" == "null" ]]; then
    bottleneck_count=0
  fi

  debug "Found $bottleneck_count bottlenecks"

  if [[ "$bottleneck_count" -gt 0 ]]; then
    # Validate first bottleneck structure
    local first_id first_type first_severity
    first_id=$(json_get "$output_file" ".output.bottlenecks[0].id" 2>/dev/null)
    first_type=$(json_get "$output_file" ".output.bottlenecks[0].type" 2>/dev/null)
    first_severity=$(json_get "$output_file" ".output.bottlenecks[0].severity" 2>/dev/null)

    if [[ -z "$first_id" ]] || [[ "$first_id" == "null" ]]; then
      error "Bottleneck missing 'id' field"
      return 1
    fi

    if [[ -n "$first_severity" ]] && [[ "$first_severity" != "null" ]]; then
      if ! validate_enum "$first_severity" "critical" "high" "medium" "low"; then
        error "Bottleneck has invalid severity: $first_severity"
        return 1
      fi
    fi

    # Validate bottleneck type if present
    if [[ -n "$first_type" ]] && [[ "$first_type" != "null" ]]; then
      local valid_types=("cpu" "memory" "disk" "network" "database" "api" "cache" "queue" "thread-pool" "connection-pool" "external-service" "application" "other")
      local type_valid=false
      for vt in "${valid_types[@]}"; do
        if [[ "$first_type" == "$vt" ]]; then
          type_valid=true
          break
        fi
      done
      if [[ "$type_valid" == "false" ]]; then
        warn "Bottleneck has non-standard type: $first_type"
      fi
    fi
  fi

  return 0
}

# Validate test configuration
# Returns: 0 if valid, 1 if invalid
validate_test_configuration() {
  local output_file="$1"

  local config_data
  config_data=$(json_get "$output_file" ".output.testConfiguration" 2>/dev/null)

  if [[ -z "$config_data" ]] || [[ "$config_data" == "null" ]]; then
    debug "No test configuration found"
    return 0
  fi

  # Validate tool if specified
  local tool
  tool=$(json_get "$output_file" ".output.testConfiguration.tool" 2>/dev/null)

  if [[ -n "$tool" ]] && [[ "$tool" != "null" ]]; then
    local valid_tools=("k6" "artillery" "jmeter" "gatling" "locust" "wrk" "ab" "vegeta" "custom")
    local tool_valid=false
    for vt in "${valid_tools[@]}"; do
      if [[ "$tool" == "$vt" ]]; then
        tool_valid=true
        break
      fi
    done
    if [[ "$tool_valid" == "false" ]]; then
      warn "Non-standard performance testing tool: $tool"
    fi
  fi

  # Validate duration is reasonable (not negative)
  local duration
  duration=$(json_get "$output_file" ".output.testConfiguration.duration" 2>/dev/null)

  if [[ -n "$duration" ]] && [[ "$duration" != "null" ]]; then
    if [[ "$duration" -lt 0 ]]; then
      error "Invalid test duration: $duration (must be >= 0)"
      return 1
    fi
  fi

  return 0
}

# Main skill-specific validation function
# Returns: 0 if valid, 1 if invalid
validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running performance-testing specific validations..."

  # Validate percentile ordering
  if ! validate_percentile_order "$output_file"; then
    has_errors=true
  else
    success "Percentile ordering validation passed"
  fi

  # Validate throughput metrics
  if ! validate_throughput_metrics "$output_file"; then
    has_errors=true
  else
    success "Throughput metrics validation passed"
  fi

  # Validate error rate
  if ! validate_error_rate "$output_file"; then
    has_errors=true
  else
    success "Error rate validation passed"
  fi

  # Validate SLA compliance
  if ! validate_sla_compliance "$output_file"; then
    has_errors=true
  else
    success "SLA compliance validation passed"
  fi

  # Validate bottlenecks
  if ! validate_bottlenecks "$output_file"; then
    has_errors=true
  else
    success "Bottleneck validation passed"
  fi

  # Validate test configuration
  if ! validate_test_configuration "$output_file"; then
    has_errors=true
  else
    success "Test configuration validation passed"
  fi

  # Check for performance tool attribution
  local tools_used
  tools_used=$(json_get "$output_file" ".metadata.toolsUsed" 2>/dev/null)
  if [[ -z "$tools_used" ]] || [[ "$tools_used" == "null" ]] || [[ "$tools_used" == "[]" ]]; then
    warn "No performance tools listed in metadata.toolsUsed"
  else
    debug "Performance tools used: $tools_used"
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
      error "Output missing required performance terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "All required performance terms found"
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

  # Step 6: Validate Performance Content Terms
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 6: Performance Content Terms ---"

  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 7: Performance-Specific Validation
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 7: Performance-Specific Validation ---"

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
    echo "  Tools:                $tool_status"
    echo "  JSON Syntax:          $json_status"
    echo "  Schema:               $schema_status"
    echo "  Required Fields:      $fields_status"
    echo "  Enum Values:          $enums_status"
    echo "  Content Terms:        $content_status"
    echo "  Performance-Specific: $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:              $overall_status"
    echo "  Errors:               $error_count"
    echo "  Warnings:             $warning_count"
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
