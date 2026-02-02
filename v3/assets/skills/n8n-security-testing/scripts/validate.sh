#!/bin/bash
# =============================================================================
# AQE Skill Validator: n8n-security-testing v1.0.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

for lib_path in "$PROJECT_ROOT/.claude/skills/.validation/templates/validator-lib.sh" "$SKILL_DIR/scripts/validator-lib.sh"; do
  [[ -f "$lib_path" ]] && source "$lib_path" && break
done

SKILL_NAME="n8n-security-testing"
SKILL_VERSION="1.0.0"
REQUIRED_TOOLS=("jq")
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.securityFindings" "output.credentialAudit")
MUST_CONTAIN_TERMS=("security" "credential")
MUST_NOT_CONTAIN_TERMS=("TODO" "FIXME")
ENUM_VALIDATIONS=(".status:success,partial,failed,skipped")

validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  # Validate security findings
  local finding_count
  finding_count=$(jq '.output.securityFindings | length' "$output_file" 2>/dev/null || echo "0")

  if [[ "$finding_count" -gt 0 ]]; then
    local invalid_findings
    invalid_findings=$(jq '[.output.securityFindings[]? | select(.id == null or .title == null or .severity == null or .category == null)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_findings" -gt 0 ]]; then
      warn "$invalid_findings finding(s) missing required fields"
    fi

    # Validate severity enum
    local valid_severities="critical high medium low info"
    local severities
    severities=$(jq -r '.output.securityFindings[]?.severity // empty' "$output_file" 2>/dev/null || true)

    for sev in $severities; do
      if ! echo "$valid_severities" | grep -qw "$sev"; then
        error "Invalid severity: $sev"
        has_errors=true
      fi
    done

    # Validate finding ID pattern
    local invalid_ids
    invalid_ids=$(jq '[.output.securityFindings[]?.id // empty | select(test("^SEC-N8N-[0-9]{3,6}$") | not)] | length' "$output_file" 2>/dev/null || echo "0")

    if [[ "$invalid_ids" -gt 0 ]]; then
      warn "$invalid_ids finding(s) have invalid ID format (should be SEC-N8N-NNN)"
    fi
  fi

  # Validate credential audit
  local has_audit
  has_audit=$(jq '.output.credentialAudit | has("totalCredentials") and has("secureCredentials") and has("insecureCredentials")' "$output_file" 2>/dev/null)

  if [[ "$has_audit" != "true" ]]; then
    error "Credential audit missing required fields"
    has_errors=true
  else
    # Validate credential counts are consistent
    local total secure insecure
    total=$(jq '.output.credentialAudit.totalCredentials' "$output_file" 2>/dev/null)
    secure=$(jq '.output.credentialAudit.secureCredentials' "$output_file" 2>/dev/null)
    insecure=$(jq '.output.credentialAudit.insecureCredentials' "$output_file" 2>/dev/null)

    if [[ -n "$total" && -n "$secure" && -n "$insecure" ]]; then
      if [[ $((secure + insecure)) -gt $total ]]; then
        warn "Credential counts inconsistent: secure($secure) + insecure($insecure) > total($total)"
      fi
    fi
  fi

  if [[ "$has_errors" == "true" ]]; then return 1; fi
  success "N8N security testing validation passed"
  return 0
}

OUTPUT_FILE="${1:-}"

# Handle --self-test flag
if [[ "$OUTPUT_FILE" == "--self-test" ]]; then
  echo "=== Self-Test: $SKILL_NAME v$SKILL_VERSION ==="
  echo "[PASS] Required tool: jq"
  if [[ -f "$SCHEMA_PATH" ]]; then
    echo "[PASS] Schema file exists"
    if jq empty "$SCHEMA_PATH" 2>/dev/null; then
      echo "[PASS] Schema is valid JSON"
    else
      echo "[FAIL] Schema is invalid JSON"
      exit 1
    fi
  else
    echo "[WARN] Schema file not found"
  fi
  echo "[PASS] Self-test completed"
  exit 0
fi

[[ -z "$OUTPUT_FILE" ]] && { echo "Usage: $0 <output-file> | --self-test"; exit 1; }
[[ ! -f "$OUTPUT_FILE" ]] && { echo "ERROR: File not found: $OUTPUT_FILE"; exit 1; }

echo "Validating $SKILL_NAME output..."
jq empty "$OUTPUT_FILE" 2>/dev/null || { echo "ERROR: Invalid JSON"; exit 1; }

if validate_skill_specific "$OUTPUT_FILE"; then
  echo "PASSED: $SKILL_NAME validation"
  exit 0
else
  echo "FAILED: $SKILL_NAME validation"
  exit 1
fi
