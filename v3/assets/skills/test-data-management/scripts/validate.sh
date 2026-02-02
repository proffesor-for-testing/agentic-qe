#!/bin/bash
# =============================================================================
# AQE Test Data Management Skill Validator v1.0.0
# Validates test data generation and privacy compliance output
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

SKILL_NAME="test-data-management"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("faker" "ajv" "jsonschema" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.dataGeneration" "output.privacyCompliance" "output.metrics")
REQUIRED_NON_EMPTY_FIELDS=("output.summary")
MUST_CONTAIN_TERMS=("data")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

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
      echo "Test Data Management Validator Tools"
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

  # Check data generation strategy
  local strategy
  strategy=$(json_get "$output_file" ".output.dataGeneration.strategy" 2>/dev/null)
  if [[ -n "$strategy" ]] && [[ "$strategy" != "null" ]]; then
    success "Data generation strategy: $strategy"
  fi

  # Check records generated
  local records
  records=$(json_get "$output_file" ".output.dataGeneration.recordsGenerated" 2>/dev/null)
  [[ -n "$records" ]] && [[ "$records" != "null" ]] && success "Records generated: $records"

  # Check privacy compliance
  local gdpr_compliant ccpa_compliant
  gdpr_compliant=$(json_get "$output_file" ".output.privacyCompliance.gdprCompliant" 2>/dev/null)
  ccpa_compliant=$(json_get "$output_file" ".output.privacyCompliance.ccpaCompliant" 2>/dev/null)

  if [[ "$gdpr_compliant" == "true" ]]; then
    success "GDPR compliant"
  elif [[ "$gdpr_compliant" == "false" ]]; then
    warn "Not GDPR compliant"
  fi

  # Check PII handling
  local pii_count
  pii_count=$(json_count "$output_file" ".output.privacyCompliance.piiDetected" 2>/dev/null)
  if [[ -n "$pii_count" ]] && [[ "$pii_count" -gt 0 ]]; then
    success "PII fields detected and handled: $pii_count"
  fi

  # Check data quality
  local quality_score
  quality_score=$(json_get "$output_file" ".output.dataQuality.overallScore" 2>/dev/null)
  [[ -n "$quality_score" ]] && [[ "$quality_score" != "null" ]] && success "Data quality score: $quality_score"

  # Check finding format
  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)
  if [[ -n "$finding_count" ]] && [[ "$finding_count" -gt 0 ]]; then
    local first_id
    first_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    [[ "$first_id" =~ ^DATA-[0-9]+$ ]] && success "Finding ID format valid" || warn "Finding ID should match DATA-XXX"
  fi

  [[ "$has_errors" == "true" ]] && return 1
  success "Test data management validation passed"
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
