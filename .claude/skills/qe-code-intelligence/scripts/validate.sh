#!/bin/bash
# =============================================================================
# AQE Skill Validator: qe-code-intelligence v1.0.0
# Validates code intelligence skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance
# 2. Required code intelligence fields (codeGraph, dependencies, complexityMetrics)
# 3. Graph structure validation (nodes, edges)
# 4. Complexity metric ranges
# 5. Quality score validation
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
  exit 1
fi

# =============================================================================
# SKILL-SPECIFIC CONFIGURATION
# =============================================================================

SKILL_NAME="qe-code-intelligence"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("node" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.codeGraph" "output.complexityMetrics")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("code" "complexity" "dependency")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME" "placeholder")

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
    -h|--help)
      echo "Usage: $0 <output-file> [--self-test] [--verbose] [--json]"
      exit 0
      ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

# =============================================================================
# Self-Test Mode
# =============================================================================

if [[ "$SELF_TEST" == "true" ]]; then
  echo "=============================================="
  info "Running $SKILL_NAME Validator Self-Test"
  echo "=============================================="

  self_test_passed=true

  for tool in "${REQUIRED_TOOLS[@]}"; do
    if command_exists "$tool"; then
      success "Required tool available: $tool"
    else
      error "Required tool MISSING: $tool"
      self_test_passed=false
    fi
  done

  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema is valid JSON"
    else
      error "Schema is NOT valid JSON"
      self_test_passed=false
    fi
  else
    error "Schema file not found: $SCHEMA_PATH"
    self_test_passed=false
  fi

  if run_self_test 2>/dev/null; then
    success "Library self-test passed"
  else
    error "Library self-test FAILED"
    self_test_passed=false
  fi

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

validate_code_graph() {
  local output_file="$1"

  local has_nodes has_edges
  has_nodes=$(jq 'has("output") and (.output | has("codeGraph")) and (.output.codeGraph | has("nodes"))' "$output_file" 2>/dev/null)
  has_edges=$(jq 'has("output") and (.output | has("codeGraph")) and (.output.codeGraph | has("edges"))' "$output_file" 2>/dev/null)

  if [[ "$has_nodes" != "true" ]]; then
    error "Code graph missing nodes array"
    return 1
  fi

  if [[ "$has_edges" != "true" ]]; then
    error "Code graph missing edges array"
    return 1
  fi

  # Validate node structure
  local node_count
  node_count=$(jq '.output.codeGraph.nodes | length' "$output_file" 2>/dev/null)
  debug "Code graph has $node_count nodes"

  if [[ "$node_count" -gt 0 ]]; then
    local first_node_type
    first_node_type=$(json_get "$output_file" ".output.codeGraph.nodes[0].type" 2>/dev/null)

    if [[ -n "$first_node_type" ]] && [[ "$first_node_type" != "null" ]]; then
      if ! validate_enum "$first_node_type" "module" "class" "function" "method" "file" "package"; then
        error "Invalid node type: $first_node_type"
        return 1
      fi
    fi
  fi

  return 0
}

validate_complexity_metrics() {
  local output_file="$1"

  local cyclomatic_avg maintainability_index
  cyclomatic_avg=$(json_get "$output_file" ".output.complexityMetrics.cyclomaticComplexity.average" 2>/dev/null)
  maintainability_index=$(json_get "$output_file" ".output.complexityMetrics.maintainabilityIndex" 2>/dev/null)

  if [[ -n "$cyclomatic_avg" ]] && [[ "$cyclomatic_avg" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$cyclomatic_avg < 0" | bc -l 2>/dev/null || echo "0") )); then
        error "Cyclomatic complexity cannot be negative: $cyclomatic_avg"
        return 1
      fi
    fi
    debug "Average cyclomatic complexity: $cyclomatic_avg"
  fi

  if [[ -n "$maintainability_index" ]] && [[ "$maintainability_index" != "null" ]]; then
    if command_exists "bc"; then
      if (( $(echo "$maintainability_index < 0 || $maintainability_index > 100" | bc -l 2>/dev/null || echo "0") )); then
        error "Maintainability index out of range: $maintainability_index"
        return 1
      fi
    fi
    debug "Maintainability index: $maintainability_index"
  fi

  return 0
}

validate_dependencies() {
  local output_file="$1"

  local has_deps
  has_deps=$(jq 'has("output") and (.output | has("dependencies"))' "$output_file" 2>/dev/null)

  if [[ "$has_deps" == "true" ]]; then
    local dep_count
    dep_count=$(jq '.output.dependencies | length' "$output_file" 2>/dev/null)
    debug "Found $dep_count dependencies"

    if [[ "$dep_count" -gt 0 ]]; then
      local first_dep_type
      first_dep_type=$(json_get "$output_file" ".output.dependencies[0].type" 2>/dev/null)

      if [[ -n "$first_dep_type" ]] && [[ "$first_dep_type" != "null" ]]; then
        if ! validate_enum "$first_dep_type" "runtime" "devDependency" "peerDependency" "optional" "internal"; then
          warn "Unrecognized dependency type: $first_dep_type"
        fi
      fi
    fi
  fi

  return 0
}

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running qe-code-intelligence specific validations..."

  if ! validate_code_graph "$output_file"; then
    has_errors=true
  else
    success "Code graph validation passed"
  fi

  if ! validate_complexity_metrics "$output_file"; then
    has_errors=true
  else
    success "Complexity metrics validation passed"
  fi

  if ! validate_dependencies "$output_file"; then
    has_errors=true
  else
    success "Dependencies validation passed"
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  return 0
}

# =============================================================================
# Standard Validation Functions
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

  if [[ ! -f "$SCHEMA_PATH" ]]; then
    warn "Schema file not found: $SCHEMA_PATH"
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

validate_content_terms() {
  local output_file="$1"
  local content
  content=$(cat "$output_file")
  local has_errors=false

  local missing_terms=()
  for term in "${MUST_CONTAIN_TERMS[@]}"; do
    if ! grep -qi "$term" <<< "$content"; then
      missing_terms+=("$term")
    fi
  done

  if [[ ${#missing_terms[@]} -gt 0 ]]; then
    error "Output missing required terms: ${missing_terms[*]}"
    has_errors=true
  fi

  local found_forbidden=()
  for term in "${MUST_NOT_CONTAIN_TERMS[@]}"; do
    if grep -qi "$term" <<< "$content"; then
      found_forbidden+=("$term")
    fi
  done

  if [[ ${#found_forbidden[@]} -gt 0 ]]; then
    error "Output contains forbidden terms: ${found_forbidden[*]}"
    has_errors=true
  fi

  if [[ "$has_errors" == "true" ]]; then
    return 1
  fi

  success "Content term validation passed"
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

  [[ "$JSON_ONLY" != "true" ]] && info "Validating $SKILL_NAME Output"

  local error_count=0

  if ! validate_tools; then
    exit $EXIT_SKIP
  fi

  if ! validate_json "$OUTPUT_FILE"; then
    error "Invalid JSON"
    exit $EXIT_FAIL
  fi

  validate_schema "$OUTPUT_FILE" || ((error_count++)) || true
  validate_required_fields "$OUTPUT_FILE" || ((error_count++)) || true
  validate_content_terms "$OUTPUT_FILE" || ((error_count++)) || true
  validate_skill_specific "$OUTPUT_FILE" || ((error_count++)) || true

  if [[ $error_count -gt 0 ]]; then
    error "Validation FAILED with $error_count error(s)"
    exit $EXIT_FAIL
  fi

  success "Validation PASSED"
  exit $EXIT_PASS
}

main
