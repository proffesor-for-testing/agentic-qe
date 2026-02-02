#!/bin/bash
# =============================================================================
# AQE Mobile Testing Skill Validator v1.0.0
# Validates iOS/Android mobile testing output
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

SKILL_NAME="mobile-testing"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("appium" "ajv" "jsonschema" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.deviceMatrix" "output.platformCoverage" "output.metrics")
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.deviceMatrix")
MUST_CONTAIN_TERMS=("mobile" "device")
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
      echo "Mobile Testing Validator Tools"
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

  # Check device matrix tiers
  local tier1_devices
  tier1_devices=$(json_get "$output_file" ".output.deviceMatrix.tier1.devices" 2>/dev/null)
  if [[ -n "$tier1_devices" ]] && [[ "$tier1_devices" != "null" ]]; then
    success "Device matrix includes Tier 1 devices"
  fi

  # Check platform coverage
  local ios_coverage android_coverage
  ios_coverage=$(json_get "$output_file" ".output.platformCoverage.ios.passRate" 2>/dev/null)
  android_coverage=$(json_get "$output_file" ".output.platformCoverage.android.passRate" 2>/dev/null)

  [[ -n "$ios_coverage" ]] && [[ "$ios_coverage" != "null" ]] && success "iOS coverage: $ios_coverage%"
  [[ -n "$android_coverage" ]] && [[ "$android_coverage" != "null" ]] && success "Android coverage: $android_coverage%"

  # Check gesture validation
  local gesture_tap
  gesture_tap=$(json_get "$output_file" ".output.gestureValidation.tap.status" 2>/dev/null)
  [[ -n "$gesture_tap" ]] && [[ "$gesture_tap" != "null" ]] && success "Gesture validation included"

  # Check performance metrics
  local app_launch
  app_launch=$(json_get "$output_file" ".output.performanceMetrics.appLaunchTime.cold" 2>/dev/null)
  [[ -n "$app_launch" ]] && [[ "$app_launch" != "null" ]] && success "App launch time: ${app_launch}ms"

  # Check finding format
  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)
  if [[ -n "$finding_count" ]] && [[ "$finding_count" -gt 0 ]]; then
    local first_id
    first_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    [[ "$first_id" =~ ^MOB-[0-9]+$ ]] && success "Finding ID format valid" || warn "Finding ID should match MOB-XXX"
  fi

  [[ "$has_errors" == "true" ]] && return 1
  success "Mobile-specific validation passed"
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
