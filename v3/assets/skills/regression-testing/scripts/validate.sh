#!/bin/bash
# =============================================================================
# AQE Regression Testing Skill Validator v1.0.0
# Validates regression testing output including test selection and impact analysis
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in \
  "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" \
  "$SKILL_DIR/scripts/validator-lib.sh"; do
  if [[ -f "$lib_path" ]]; then
    source "$lib_path"
    break
  fi
done

SKILL_NAME="regression-testing"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("ajv" "jsonschema" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.testSelection" "output.impactAnalysis" "output.metrics")
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.testSelection")
MUST_CONTAIN_TERMS=("regression" "test")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped" ".output.testSelection.strategy:change-based,risk-based,historical,time-budget,full,smoke")

OUTPUT_FILE=""
SELF_TEST=false
VERBOSE=false
JSON_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) SELF_TEST=true; shift ;;
    --verbose|-v) VERBOSE=true; export AQE_DEBUG=1; shift ;;
    --json) JSON_ONLY=true; shift ;;
    --list-tools)
      echo "Regression Testing Validator Tools"
      for tool in "${REQUIRED_TOOLS[@]}"; do
        command_exists "$tool" && echo "  [OK] $tool" || echo "  [MISSING] $tool"
      done
      exit 0 ;;
    -h|--help) echo "Usage: $0 <output-file> [--self-test] [--verbose] [--json]"; exit 0 ;;
    -*) error "Unknown option: $1"; exit 1 ;;
    *) OUTPUT_FILE="$1"; shift ;;
  esac
done

if [[ "$SELF_TEST" == "true" ]]; then
  echo "Running $SKILL_NAME Validator Self-Test..."
  for tool in "${REQUIRED_TOOLS[@]}"; do
    command_exists "$tool" && success "Tool: $tool" || error "Missing: $tool"
  done
  [[ -f "$SCHEMA_PATH" ]] && success "Schema exists" || error "Schema missing"
  exit 0
fi

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Check test selection strategy
  local strategy
  strategy=$(json_get "$output_file" ".output.testSelection.strategy" 2>/dev/null)
  if [[ -n "$strategy" ]] && [[ "$strategy" != "null" ]]; then
    success "Test selection strategy: $strategy"
  else
    error "Test selection strategy required"
    has_errors=true
  fi

  # Check selected vs total tests
  local total selected
  total=$(json_get "$output_file" ".output.testSelection.totalTests" 2>/dev/null)
  selected=$(json_get "$output_file" ".output.testSelection.selectedTests" 2>/dev/null)
  if [[ -n "$total" ]] && [[ -n "$selected" ]] && [[ "$total" != "null" ]] && [[ "$selected" != "null" ]]; then
    success "Test selection: $selected of $total tests"
  fi

  # Check risk coverage
  local risk_coverage
  risk_coverage=$(json_get "$output_file" ".output.testSelection.riskCoverage" 2>/dev/null)
  [[ -n "$risk_coverage" ]] && [[ "$risk_coverage" != "null" ]] && success "Risk coverage: $risk_coverage"

  # Check impact analysis
  local changed_files
  changed_files=$(json_count "$output_file" ".output.impactAnalysis.changedFiles" 2>/dev/null)
  [[ -n "$changed_files" ]] && success "Changed files analyzed: $changed_files"

  # Check finding format
  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)
  if [[ -n "$finding_count" ]] && [[ "$finding_count" -gt 0 ]]; then
    local first_id
    first_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    [[ "$first_id" =~ ^REG-[0-9]+$ ]] && success "Finding ID format valid" || warn "Finding ID should match REG-XXX"
  fi

  [[ "$has_errors" == "true" ]] && return 1
  success "Regression-specific validation passed"
  return 0
}

# Main validation
[[ -z "$OUTPUT_FILE" ]] && { error "No output file specified"; exit 1; }
[[ ! -f "$OUTPUT_FILE" ]] && { error "File not found: $OUTPUT_FILE"; exit 1; }

for tool in "${REQUIRED_TOOLS[@]}"; do
  command_exists "$tool" || { error "Missing tool: $tool"; exit 2; }
done

validate_json "$OUTPUT_FILE" || { error "Invalid JSON"; exit 1; }
[[ -f "$SCHEMA_PATH" ]] && validate_json_schema "$SCHEMA_PATH" "$OUTPUT_FILE"

for field in "${REQUIRED_FIELDS[@]}"; do
  value=$(json_get "$OUTPUT_FILE" ".$field" 2>/dev/null)
  [[ -z "$value" ]] || [[ "$value" == "null" ]] && { error "Missing field: $field"; exit 1; }
done

validate_skill_specific "$OUTPUT_FILE" || exit 1

success "Validation PASSED"
exit 0
