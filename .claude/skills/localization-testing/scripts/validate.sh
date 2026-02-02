#!/bin/bash
# =============================================================================
# AQE Localization Testing Skill Validator v1.0.0
# Validates i18n/l10n testing output including translation coverage and RTL
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Source validator library
for lib_path in \
  "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" \
  "$SKILL_DIR/scripts/validator-lib.sh"; do
  if [[ -f "$lib_path" ]]; then
    source "$lib_path"
    break
  fi
done

SKILL_NAME="localization-testing"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
OPTIONAL_TOOLS=("ajv" "jsonschema" "python3")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

REQUIRED_FIELDS=("skillName" "status" "output" "output.localesCovered" "output.translationCoverage" "output.metrics")
REQUIRED_NON_EMPTY_FIELDS=("output.summary" "output.localesCovered")
MUST_CONTAIN_TERMS=("locale" "translation")
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")
MIN_ARRAY_LENGTHS=(".output.localesCovered:1")

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
      echo "Localization Testing Validator Tools"
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

  # Check locale coverage
  local locale_count
  locale_count=$(json_count "$output_file" ".output.localesCovered" 2>/dev/null)
  if [[ -z "$locale_count" ]] || [[ "$locale_count" -lt 1 ]]; then
    error "Must have at least 1 locale covered"
    has_errors=true
  else
    success "Locale coverage: $locale_count locales"
  fi

  # Check translation coverage percentage
  local coverage
  coverage=$(json_get "$output_file" ".output.translationCoverage.coveragePercent" 2>/dev/null)
  if [[ -n "$coverage" ]] && [[ "$coverage" != "null" ]]; then
    success "Translation coverage: $coverage%"
  fi

  # Check RTL validation if RTL locales present
  local rtl_locales
  rtl_locales=$(json_get "$output_file" ".output.rtlValidation.rtlLocales" 2>/dev/null)
  if [[ -n "$rtl_locales" ]] && [[ "$rtl_locales" != "null" ]] && [[ "$rtl_locales" != "[]" ]]; then
    local rtl_supported
    rtl_supported=$(json_get "$output_file" ".output.rtlValidation.supported" 2>/dev/null)
    [[ "$rtl_supported" == "true" ]] && success "RTL languages supported" || warn "RTL support incomplete"
  fi

  # Check finding format
  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)
  if [[ -n "$finding_count" ]] && [[ "$finding_count" -gt 0 ]]; then
    local first_id
    first_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    [[ "$first_id" =~ ^L10N-[0-9]+$ ]] && success "Finding ID format valid" || warn "Finding ID should match L10N-XXX"
  fi

  [[ "$has_errors" == "true" ]] && return 1
  success "Localization-specific validation passed"
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
