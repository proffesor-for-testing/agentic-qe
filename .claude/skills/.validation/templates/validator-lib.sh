#!/bin/bash
# =============================================================================
# AQE Skill Validator Library v2.0.0
# Shared functions for skill validation scripts
# =============================================================================
#
# This library provides a comprehensive set of utilities for skill validation:
#   - Colored logging (info, warn, error, success, debug)
#   - Tool detection with graceful degradation
#   - JSON Schema validation (ajv, jsonschema, python3 fallbacks)
#   - JSON parsing utilities (jq, python3 fallbacks)
#   - Content validation (term matching, regex)
#   - Result output in JSON format
#   - File format handling
#   - Self-test capabilities
#
# Exit Codes:
#   0 - Validation passed
#   1 - Validation failed
#   2 - Validation skipped (missing tools)
#
# Usage:
#   source /path/to/validator-lib.sh
#   check_required_tools "jq" "curl" || exit 2
#   validate_json "$file" || exit 1
#
# =============================================================================

# Prevent multiple inclusion
if [[ -n "${_AQE_VALIDATOR_LIB_LOADED:-}" ]]; then
  return 0 2>/dev/null || true
fi
export _AQE_VALIDATOR_LIB_LOADED=1

# =============================================================================
# Configuration
# =============================================================================
export AQE_VALIDATOR_VERSION="2.0.0"
export AQE_VALIDATION_LOG="${AQE_VALIDATION_LOG:-/tmp/aqe-validation.log}"

# Exit codes
export EXIT_PASS=0
export EXIT_FAIL=1
export EXIT_SKIP=2

# Colors (disable if not in terminal)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  CYAN=''
  NC=''
fi

# =============================================================================
# Logging Functions
# =============================================================================

# Helper function to log to file if available
_log_to_file() {
  if [[ -n "${AQE_VALIDATION_LOG:-}" ]] && [[ "$AQE_VALIDATION_LOG" != "/dev/null" ]]; then
    echo "$*" >> "$AQE_VALIDATION_LOG" 2>/dev/null || true
  fi
}

info() {
  echo -e "${BLUE}[INFO]${NC} $*"
  _log_to_file "[INFO] $*"
}

success() {
  echo -e "${GREEN}[PASS]${NC} $*"
  _log_to_file "[PASS] $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
  _log_to_file "[WARN] $*"
}

error() {
  echo -e "${RED}[FAIL]${NC} $*" >&2
  _log_to_file "[FAIL] $*"
}

debug() {
  if [[ -n "${AQE_DEBUG:-}" ]]; then
    echo -e "${CYAN}[DEBUG]${NC} $*"
    _log_to_file "[DEBUG] $*"
  fi
}

# =============================================================================
# Tool Detection Functions
# =============================================================================

# Check if a command exists
# Usage: command_exists "jq"
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check a single tool with reporting
# Usage: check_tool "jq" true  # required tool
#        check_tool "jq" false # optional tool
# Returns: 0=found, 1=required+missing, 2=optional+missing
check_tool() {
  local tool="$1"
  local required="${2:-false}"

  if command_exists "$tool"; then
    debug "Tool available: $tool"
    return 0
  else
    if [[ "$required" == "true" ]]; then
      error "Required tool missing: $tool"
      return 1
    else
      warn "Optional tool missing: $tool"
      return 2
    fi
  fi
}

# Check multiple required tools at once
# Usage: check_required_tools "jq" "curl" "node"
# Returns: 0 if all present, 1 if any missing (with details)
check_required_tools() {
  local tools=("$@")
  local missing=()
  local found=()

  for tool in "${tools[@]}"; do
    if command_exists "$tool"; then
      found+=("$tool")
    else
      missing+=("$tool")
    fi
  done

  if [[ ${#found[@]} -gt 0 ]]; then
    debug "Found required tools: ${found[*]}"
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required tools: ${missing[*]}"
    return 1
  fi

  success "All required tools present: ${found[*]}"
  return 0
}

# Check multiple optional tools, report which are available
# Usage: available=$(check_optional_tools "ajv" "jsonschema" "yq")
# Returns: space-separated list of available tools
check_optional_tools() {
  local tools=("$@")
  local available=()
  local missing=()

  for tool in "${tools[@]}"; do
    if command_exists "$tool"; then
      available+=("$tool")
    else
      missing+=("$tool")
    fi
  done

  if [[ ${#available[@]} -gt 0 ]]; then
    debug "Available optional tools: ${available[*]}"
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    debug "Missing optional tools: ${missing[*]}"
  fi

  # Return available tools as space-separated string
  echo "${available[*]}"
}

# Get list of available tools from a set
# Usage: get_available_tools "jq" "python3" "node"
get_available_tools() {
  local tools=("$@")
  local available=()

  for tool in "${tools[@]}"; do
    if command_exists "$tool"; then
      available+=("$tool")
    fi
  done

  echo "${available[@]}"
}

# Check if any of the given tools is available
# Usage: has_any_tool "ajv" "jsonschema" "python3"
# Returns: 0 if at least one is available, 1 if none
has_any_tool() {
  local tools=("$@")

  for tool in "${tools[@]}"; do
    if command_exists "$tool"; then
      return 0
    fi
  done

  return 1
}

# =============================================================================
# JSON Validation Functions
# =============================================================================

# Validate that a file contains valid JSON
# Usage: validate_json "$file"
# Returns: 0=valid, 1=invalid, 2=skipped (no tools)
validate_json() {
  local file="$1"

  if [[ ! -f "$file" ]]; then
    error "File not found: $file"
    return 1
  fi

  if command_exists "jq"; then
    if jq empty "$file" 2>/dev/null; then
      debug "JSON syntax valid (jq): $file"
      return 0
    else
      error "Invalid JSON syntax in: $file"
      return 1
    fi
  elif command_exists "python3"; then
    if python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
      debug "JSON syntax valid (python3): $file"
      return 0
    else
      error "Invalid JSON syntax in: $file"
      return 1
    fi
  elif command_exists "node"; then
    if node -e "JSON.parse(require('fs').readFileSync('$file'))" 2>/dev/null; then
      debug "JSON syntax valid (node): $file"
      return 0
    else
      error "Invalid JSON syntax in: $file"
      return 1
    fi
  else
    warn "No JSON parser available (jq, python3, node)"
    return 2
  fi
}

# =============================================================================
# JSON Schema Validation Functions
# =============================================================================

# Validate data against JSON Schema with graceful degradation
# Usage: validate_json_schema "$schema_path" "$data_path"
# Returns: 0=valid, 1=invalid, 2=skipped (no validator available)
validate_json_schema() {
  local schema_path="$1"
  local data_path="$2"

  if [[ ! -f "$schema_path" ]]; then
    error "Schema file not found: $schema_path"
    return 1
  fi

  if [[ ! -f "$data_path" ]]; then
    error "Data file not found: $data_path"
    return 1
  fi

  # First, validate both files are valid JSON
  if ! validate_json "$schema_path"; then
    error "Schema file is not valid JSON: $schema_path"
    return 1
  fi

  if ! validate_json "$data_path"; then
    error "Data file is not valid JSON: $data_path"
    return 1
  fi

  # Try multiple JSON schema validators in order of preference
  if command_exists "ajv"; then
    debug "Using ajv for schema validation"
    local result
    result=$(ajv validate -s "$schema_path" -d "$data_path" 2>&1)
    local status=$?
    if [[ $status -eq 0 ]]; then
      debug "Schema validation passed (ajv)"
      return 0
    else
      error "Schema validation failed (ajv): $result"
      return 1
    fi
  elif command_exists "jsonschema"; then
    debug "Using jsonschema CLI for validation"
    local result
    result=$(jsonschema -i "$data_path" "$schema_path" 2>&1)
    local status=$?
    if [[ $status -eq 0 ]]; then
      debug "Schema validation passed (jsonschema)"
      return 0
    else
      error "Schema validation failed (jsonschema): $result"
      return 1
    fi
  elif command_exists "python3"; then
    debug "Attempting Python jsonschema validation"
    local result
    result=$(python3 -c "
import json
import sys
try:
    from jsonschema import validate, ValidationError, Draft202012Validator
    with open('$schema_path') as f:
        schema = json.load(f)
    with open('$data_path') as f:
        data = json.load(f)
    # Use Draft 2020-12 for modern schemas
    try:
        Draft202012Validator.check_schema(schema)
        validate(instance=data, schema=schema, cls=Draft202012Validator)
    except:
        # Fallback to default validator
        validate(instance=data, schema=schema)
    print('Schema validation passed')
    sys.exit(0)
except ImportError:
    print('SKIP: Python jsonschema not installed')
    sys.exit(2)
except ValidationError as e:
    print(f'FAIL: {e.message}')
    if e.path:
        print(f'  Path: {\".\".join(str(p) for p in e.path)}')
    sys.exit(1)
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
" 2>&1)
    local status=$?
    case $status in
      0) debug "Schema validation passed (python3)"; return 0 ;;
      2) warn "Python jsonschema not installed, skipping schema validation"; return 2 ;;
      *) error "Schema validation failed (python3): $result"; return 1 ;;
    esac
  else
    warn "No JSON schema validator available (ajv, jsonschema, python3+jsonschema)"
    return 2  # Skip
  fi
}

# Validate schema file itself is a valid JSON Schema
# Usage: validate_schema_syntax "$schema_path"
# Returns: 0=valid, 1=invalid, 2=skipped
validate_schema_syntax() {
  local schema_path="$1"

  if [[ ! -f "$schema_path" ]]; then
    error "Schema file not found: $schema_path"
    return 1
  fi

  # First check it's valid JSON
  if ! validate_json "$schema_path"; then
    return 1
  fi

  # Check for required schema fields
  local has_schema has_type
  has_schema=$(json_get "$schema_path" '."$schema"')
  has_type=$(json_get "$schema_path" '.type')

  if [[ -z "$has_schema" ]] && [[ -z "$has_type" ]]; then
    warn "Schema file may not be a valid JSON Schema (missing \$schema and type)"
    return 0  # Still allow as it might be valid
  fi

  debug "Schema file appears valid: $schema_path"
  return 0
}

# =============================================================================
# JSON Parsing Functions
# =============================================================================

json_get() {
  local json_file="$1"
  local path="$2"

  if command_exists "jq"; then
    jq -r "$path" "$json_file" 2>/dev/null
  elif command_exists "python3"; then
    python3 -c "
import json
import sys
with open('$json_file') as f:
    data = json.load(f)
path = '$path'.strip('.')
for key in path.split('.'):
    if key.startswith('[') and key.endswith(']'):
        idx = int(key[1:-1])
        data = data[idx]
    else:
        data = data.get(key, '')
print(data)
" 2>/dev/null
  else
    error "No JSON parser available (jq or python3)"
    return 1
  fi
}

json_count() {
  local json_file="$1"
  local path="$2"

  if command_exists "jq"; then
    jq "$path | length" "$json_file" 2>/dev/null
  elif command_exists "python3"; then
    python3 -c "
import json
with open('$json_file') as f:
    data = json.load(f)
path = '$path'.strip('.')
for key in path.split('.'):
    if key:
        data = data.get(key, [])
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null
  else
    return 1
  fi
}

# =============================================================================
# Content Validation Functions
# =============================================================================

# Check if content contains ALL specified terms (case-insensitive)
# Usage: contains_all "$content" "term1" "term2" "term3"
# Returns: 0 if all found, 1 if any missing
contains_all() {
  local content="$1"
  shift
  local terms=("$@")
  local missing=()

  for term in "${terms[@]}"; do
    if ! grep -qi "$term" <<< "$content"; then
      missing+=("$term")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    debug "Missing required terms: ${missing[*]}"
    return 1
  fi

  return 0
}

# Check if content contains NONE of the specified terms (case-insensitive)
# Usage: contains_none "$content" "forbidden1" "forbidden2"
# Returns: 0 if none found, 1 if any found
contains_none() {
  local content="$1"
  shift
  local terms=("$@")
  local found=()

  for term in "${terms[@]}"; do
    if grep -qi "$term" <<< "$content"; then
      found+=("$term")
    fi
  done

  if [[ ${#found[@]} -gt 0 ]]; then
    debug "Found forbidden terms: ${found[*]}"
    return 1
  fi

  return 0
}

# Check if content matches a regex pattern
# Usage: matches_regex "$content" "pattern"
# Returns: 0 if matches, 1 if not
matches_regex() {
  local content="$1"
  local pattern="$2"

  grep -qE "$pattern" <<< "$content"
}

# Check if a JSON field contains expected value
# Usage: field_equals "$file" ".status" "success"
# Returns: 0 if matches, 1 if not
field_equals() {
  local file="$1"
  local path="$2"
  local expected="$3"

  local actual
  actual=$(json_get "$file" "$path")

  if [[ "$actual" == "$expected" ]]; then
    debug "Field $path equals expected: $expected"
    return 0
  else
    debug "Field $path: expected '$expected', got '$actual'"
    return 1
  fi
}

# Check if a JSON array field has minimum count
# Usage: array_min_count "$file" ".findings" 1
# Returns: 0 if count >= min, 1 if less
array_min_count() {
  local file="$1"
  local path="$2"
  local min="${3:-1}"

  local count
  count=$(json_count "$file" "$path")

  if [[ -z "$count" ]] || [[ "$count" == "null" ]]; then
    count=0
  fi

  if [[ "$count" -ge "$min" ]]; then
    debug "Array $path has $count items (>= $min)"
    return 0
  else
    debug "Array $path has $count items (< $min required)"
    return 1
  fi
}

# Validate enum value is in allowed list
# Usage: validate_enum "$value" "success" "partial" "failed"
# Returns: 0 if valid, 1 if not
validate_enum() {
  local value="$1"
  shift
  local allowed=("$@")

  for v in "${allowed[@]}"; do
    if [[ "$value" == "$v" ]]; then
      return 0
    fi
  done

  debug "Invalid enum value: '$value' (allowed: ${allowed[*]})"
  return 1
}

# =============================================================================
# Result Output Functions
# =============================================================================

output_result() {
  local status="$1"
  local message="$2"
  local details="${3:-}"

  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  if command_exists "jq"; then
    jq -n \
      --arg status "$status" \
      --arg message "$message" \
      --arg details "$details" \
      --arg timestamp "$timestamp" \
      --arg version "$AQE_VALIDATOR_VERSION" \
      '{
        status: $status,
        message: $message,
        details: $details,
        timestamp: $timestamp,
        validatorVersion: $version
      }'
  else
    cat <<EOF
{
  "status": "$status",
  "message": "$message",
  "details": "$details",
  "timestamp": "$timestamp",
  "validatorVersion": "$AQE_VALIDATOR_VERSION"
}
EOF
  fi
}

output_validation_report() {
  local skill_name="$1"
  local schema_status="$2"
  local content_status="$3"
  local tool_status="$4"

  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local overall_status="passed"
  if [[ "$schema_status" == "failed" ]] || [[ "$content_status" == "failed" ]] || [[ "$tool_status" == "failed" ]]; then
    overall_status="failed"
  elif [[ "$schema_status" == "skipped" ]] || [[ "$content_status" == "skipped" ]] || [[ "$tool_status" == "skipped" ]]; then
    overall_status="partial"
  fi

  if command_exists "jq"; then
    jq -n \
      --arg skill "$skill_name" \
      --arg overall "$overall_status" \
      --arg schema "$schema_status" \
      --arg content "$content_status" \
      --arg tools "$tool_status" \
      --arg timestamp "$timestamp" \
      '{
        skillName: $skill,
        overallStatus: $overall,
        validations: {
          schema: $schema,
          content: $content,
          tools: $tools
        },
        timestamp: $timestamp
      }'
  else
    cat <<EOF
{
  "skillName": "$skill_name",
  "overallStatus": "$overall_status",
  "validations": {
    "schema": "$schema_status",
    "content": "$content_status",
    "tools": "$tool_status"
  },
  "timestamp": "$timestamp"
}
EOF
  fi
}

# =============================================================================
# File Handling Functions
# =============================================================================

get_file_extension() {
  local file="$1"
  echo "${file##*.}"
}

is_json_file() {
  local file="$1"
  [[ "$(get_file_extension "$file")" == "json" ]]
}

is_yaml_file() {
  local file="$1"
  local ext
  ext=$(get_file_extension "$file")
  [[ "$ext" == "yaml" ]] || [[ "$ext" == "yml" ]]
}

ensure_json() {
  local file="$1"
  local output="${2:-/tmp/converted.json}"

  if is_json_file "$file"; then
    cat "$file" > "$output"
    return 0
  elif is_yaml_file "$file"; then
    if command_exists "yq"; then
      yq -o json "$file" > "$output"
      return $?
    elif command_exists "python3"; then
      python3 -c "
import yaml
import json
import sys
with open('$file') as f:
    data = yaml.safe_load(f)
with open('$output', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
      return $?
    else
      error "Cannot convert YAML to JSON (need yq or python3+pyyaml)"
      return 1
    fi
  else
    error "Unknown file format: $file"
    return 1
  fi
}

# =============================================================================
# Self-Test Function
# =============================================================================

# Run comprehensive self-test of validator library
# Usage: run_self_test [--verbose]
# Returns: 0 if all tests pass, 1 if any fail
run_self_test() {
  local verbose=false
  [[ "${1:-}" == "--verbose" ]] && verbose=true

  info "Running validator library self-test (v$AQE_VALIDATOR_VERSION)..."
  echo ""

  local tests_passed=0
  local tests_failed=0
  local tests_skipped=0

  # Create temporary test files
  local temp_dir
  temp_dir=$(mktemp -d)
  local test_json="$temp_dir/test.json"
  local test_schema="$temp_dir/schema.json"
  local invalid_json="$temp_dir/invalid.json"

  # Create valid test JSON
  cat > "$test_json" << 'EOF'
{
  "skillName": "test-skill",
  "version": "1.0.0",
  "timestamp": "2026-02-02T12:00:00Z",
  "status": "success",
  "output": {
    "summary": "Test output",
    "findings": []
  }
}
EOF

  # Create test schema (using draft-07 for broader ajv compatibility)
  cat > "$test_schema" << 'EOF'
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["skillName", "status"],
  "properties": {
    "skillName": { "type": "string" },
    "status": { "type": "string", "enum": ["success", "partial", "failed"] }
  }
}
EOF

  # Create invalid JSON
  echo "{ invalid json" > "$invalid_json"

  echo "=== Tool Detection Tests ==="

  # Test command_exists
  if command_exists "bash"; then
    ((tests_passed++)) || true
    success "command_exists('bash'): found"
  else
    ((tests_failed++)) || true
    error "command_exists('bash'): not found"
  fi

  if ! command_exists "nonexistent_tool_xyz"; then
    ((tests_passed++)) || true
    success "command_exists('nonexistent'): correctly not found"
  else
    ((tests_failed++)) || true
    error "command_exists('nonexistent'): incorrectly found"
  fi

  echo ""
  echo "=== Logging Tests ==="

  # Test logging functions (suppress output)
  if info "Test info" >/dev/null 2>&1; then
    ((tests_passed++)) || true
    success "info(): works"
  else
    ((tests_failed++)) || true
    error "info(): failed"
  fi

  if warn "Test warn" >/dev/null 2>&1; then
    ((tests_passed++)) || true
    success "warn(): works"
  else
    ((tests_failed++)) || true
    error "warn(): failed"
  fi

  echo ""
  echo "=== JSON Validation Tests ==="

  # Test validate_json
  if validate_json "$test_json" 2>/dev/null; then
    ((tests_passed++)) || true
    success "validate_json(valid): passed"
  else
    ((tests_failed++)) || true
    error "validate_json(valid): failed"
  fi

  if ! validate_json "$invalid_json" 2>/dev/null; then
    ((tests_passed++)) || true
    success "validate_json(invalid): correctly rejected"
  else
    ((tests_failed++)) || true
    error "validate_json(invalid): incorrectly accepted"
  fi

  echo ""
  echo "=== JSON Parsing Tests ==="

  # Test json_get
  local skill_name
  skill_name=$(json_get "$test_json" ".skillName" 2>/dev/null)
  if [[ "$skill_name" == "test-skill" ]]; then
    ((tests_passed++)) || true
    success "json_get('.skillName'): got '$skill_name'"
  else
    ((tests_failed++)) || true
    error "json_get('.skillName'): expected 'test-skill', got '$skill_name'"
  fi

  # Test json_count
  local count
  count=$(json_count "$test_json" ".output.findings" 2>/dev/null)
  if [[ "$count" == "0" ]]; then
    ((tests_passed++)) || true
    success "json_count('.output.findings'): got $count"
  else
    ((tests_failed++)) || true
    error "json_count('.output.findings'): expected 0, got '$count'"
  fi

  echo ""
  echo "=== Content Validation Tests ==="

  # Test contains_all
  if contains_all "hello world" "hello" "world"; then
    ((tests_passed++)) || true
    success "contains_all('hello world', 'hello', 'world'): passed"
  else
    ((tests_failed++)) || true
    error "contains_all: failed"
  fi

  if ! contains_all "hello world" "hello" "foo"; then
    ((tests_passed++)) || true
    success "contains_all('hello world', 'hello', 'foo'): correctly failed"
  else
    ((tests_failed++)) || true
    error "contains_all: should have failed with 'foo'"
  fi

  # Test contains_none
  if contains_none "hello world" "foo" "bar"; then
    ((tests_passed++)) || true
    success "contains_none('hello world', 'foo', 'bar'): passed"
  else
    ((tests_failed++)) || true
    error "contains_none: failed"
  fi

  if ! contains_none "hello world" "hello" "bar"; then
    ((tests_passed++)) || true
    success "contains_none('hello world', 'hello', 'bar'): correctly failed"
  else
    ((tests_failed++)) || true
    error "contains_none: should have failed with 'hello'"
  fi

  # Test validate_enum
  if validate_enum "success" "success" "partial" "failed"; then
    ((tests_passed++)) || true
    success "validate_enum('success'): passed"
  else
    ((tests_failed++)) || true
    error "validate_enum('success'): failed"
  fi

  if ! validate_enum "invalid" "success" "partial" "failed"; then
    ((tests_passed++)) || true
    success "validate_enum('invalid'): correctly rejected"
  else
    ((tests_failed++)) || true
    error "validate_enum('invalid'): should have failed"
  fi

  echo ""
  echo "=== Schema Validation Tests ==="

  # Test schema validation (may skip if no validator)
  local schema_result
  schema_result=$(validate_json_schema "$test_schema" "$test_json" 2>&1)
  local schema_status=$?

  case $schema_status in
    0)
      ((tests_passed++)) || true
      success "validate_json_schema(): passed"
      ;;
    2)
      ((tests_skipped++)) || true
      warn "validate_json_schema(): skipped (no validator available)"
      ;;
    *)
      ((tests_failed++)) || true
      error "validate_json_schema(): failed - $schema_result"
      ;;
  esac

  echo ""
  echo "=== Output Functions Tests ==="

  # Test output_result
  local result
  result=$(output_result "passed" "Self-test complete" "details here" 2>/dev/null)
  if [[ -n "$result" ]] && echo "$result" | validate_json /dev/stdin 2>/dev/null; then
    ((tests_passed++)) || true
    success "output_result(): generates valid JSON"
  elif [[ -n "$result" ]]; then
    ((tests_passed++)) || true
    success "output_result(): generates output"
  else
    ((tests_failed++)) || true
    error "output_result(): failed"
  fi

  # Test output_validation_report
  local report
  report=$(output_validation_report "test-skill" "passed" "passed" "passed" 2>/dev/null)
  if [[ -n "$report" ]]; then
    ((tests_passed++)) || true
    success "output_validation_report(): generates output"
  else
    ((tests_failed++)) || true
    error "output_validation_report(): failed"
  fi

  # Cleanup
  rm -rf "$temp_dir"

  echo ""
  echo "=============================================="
  info "Self-test complete:"
  echo "  Passed:  $tests_passed"
  echo "  Failed:  $tests_failed"
  echo "  Skipped: $tests_skipped"
  echo "=============================================="

  if [[ $tests_failed -gt 0 ]]; then
    error "Self-test FAILED"
    return 1
  fi

  success "Self-test PASSED"
  return 0
}

# List available validation tools and their versions
# Usage: list_available_tools
list_available_tools() {
  info "Checking available validation tools..."
  echo ""

  local tools=("jq" "ajv" "jsonschema" "python3" "node" "yq")

  for tool in "${tools[@]}"; do
    if command_exists "$tool"; then
      local version=""
      case "$tool" in
        jq) version=$($tool --version 2>&1 | head -1) ;;
        ajv) version=$($tool --version 2>&1 | head -1) ;;
        python3) version=$($tool --version 2>&1 | head -1) ;;
        node) version=$($tool --version 2>&1 | head -1) ;;
        yq) version=$($tool --version 2>&1 | head -1) ;;
        *) version="installed" ;;
      esac
      success "$tool: $version"
    else
      warn "$tool: not installed"
    fi
  done

  # Check for Python jsonschema module
  if command_exists "python3"; then
    if python3 -c "import jsonschema" 2>/dev/null; then
      local py_version
      py_version=$(python3 -c "import jsonschema; print(jsonschema.__version__)" 2>/dev/null)
      success "python3 jsonschema module: $py_version"
    else
      warn "python3 jsonschema module: not installed"
    fi
  fi

  echo ""
}

# Run self-test if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    --list-tools)
      list_available_tools
      ;;
    --version)
      echo "AQE Validator Library v$AQE_VALIDATOR_VERSION"
      ;;
    *)
      run_self_test "$@"
      ;;
  esac
  exit $?
fi
