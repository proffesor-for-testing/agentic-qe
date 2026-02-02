#!/bin/bash
# =============================================================================
# AQE Skill Validator: database-testing v1.0.0
# Validates database testing skill output per ADR-056
# =============================================================================
#
# This validator checks:
# 1. JSON schema compliance (database test types, findings, integrity)
# 2. Required tools availability (jq required, database clients optional)
# 3. Test type coverage (schema, integrity, migration, transaction, performance)
# 4. Finding and recommendation structure validation
# 5. Database-specific content validation
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
# scripts/ -> database-testing/ -> skills/ -> .claude/ -> project root
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
SKILL_NAME="database-testing"
SKILL_VERSION="1.0.0"

# Required tools (validation FAILS with exit 2 if missing)
# jq is essential for JSON parsing
REQUIRED_TOOLS=("jq")

# Optional tools (validation continues with warnings if missing)
# These enhance database testing capabilities
OPTIONAL_TOOLS=("psql" "mysql" "mongo" "sqlite3" "node" "ajv" "jsonschema" "python3")

# Path to output JSON schema
SCHEMA_PATH="$SKILL_DIR/schemas/output.json"

# Path to sample test data for self-test
SAMPLE_OUTPUT_PATH="$PROJECT_ROOT/.claude/skills/.validation/examples/database-testing-output.example.json"

# =============================================================================
# CONTENT VALIDATION CONFIGURATION
# =============================================================================

# Required fields in output
REQUIRED_FIELDS=("skillName" "status" "output" "output.summary" "output.findings" "output.testTypes" "output.databaseInfo")

# Fields that must have non-null, non-empty values
REQUIRED_NON_EMPTY_FIELDS=("output.summary")

# Database-specific terms that MUST appear in output
MUST_CONTAIN_TERMS=("database" "schema" "table")

# Terms that must NOT appear in output (indicates failure/hallucination)
MUST_NOT_CONTAIN_TERMS=("TODO" "placeholder" "FIXME")

# Enum validations
ENUM_VALIDATIONS=(
  ".status:success,partial,failed,skipped"
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
AQE Database Testing Skill Validator v1.0.0

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

Database Tool Support:
  Required:  jq (JSON parsing)
  Optional:  psql (PostgreSQL), mysql (MySQL), mongo (MongoDB),
             sqlite3 (SQLite), node (ORM tools)

Examples:
  ./validate.sh database-output.json              # Validate output file
  ./validate.sh database-output.json --json       # JSON output for CI
  ./validate.sh --self-test --verbose             # Self-test with debug
  ./validate.sh --list-tools                      # Show available tools

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
        psql) version=$(psql --version 2>&1 | head -1 || echo "installed") ;;
        mysql) version=$(mysql --version 2>&1 | head -1 || echo "installed") ;;
        mongo) version=$(mongo --version 2>&1 | head -1 || echo "installed") ;;
        sqlite3) version=$(sqlite3 --version 2>&1 | head -1 || echo "installed") ;;
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
  echo "Database Client Capabilities:"
  if command_exists "psql"; then
    echo "  [OK] PostgreSQL - Full schema/query validation"
  else
    echo "  [MISSING] psql - Install PostgreSQL client for PostgreSQL testing"
  fi
  if command_exists "mysql"; then
    echo "  [OK] MySQL - Full schema/query validation"
  else
    echo "  [MISSING] mysql - Install MySQL client for MySQL testing"
  fi
  if command_exists "mongo" || command_exists "mongosh"; then
    echo "  [OK] MongoDB - Document/collection validation"
  else
    echo "  [MISSING] mongo/mongosh - Install MongoDB tools for MongoDB testing"
  fi
  if command_exists "sqlite3"; then
    echo "  [OK] SQLite - Lightweight database validation"
  else
    echo "  [MISSING] sqlite3 - Install SQLite for embedded database testing"
  fi
  if command_exists "node"; then
    echo "  [OK] Node.js - ORM-based validation (Knex, Prisma, TypeORM)"
  else
    echo "  [MISSING] node - Install Node.js for ORM validation"
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

  # Step 2: Check Database Tools
  echo "--- Step 2: Database Tools ---"
  db_tools=("psql" "mysql" "mongo" "sqlite3")
  available_db_tools=0
  for tool in "${db_tools[@]}"; do
    if command_exists "$tool"; then
      success "Database tool available: $tool"
      ((available_db_tools++)) || true
    else
      warn "Database tool missing: $tool"
      ((self_test_warnings++)) || true
    fi
  done

  if [[ $available_db_tools -eq 0 ]]; then
    warn "No database clients available - limited validation capability"
    ((self_test_warnings++)) || true
  fi
  echo ""

  # Step 3: Check ORM/Node Support
  echo "--- Step 3: ORM/Node Support ---"
  if command_exists "node"; then
    success "Node.js available for ORM validation"
    # Check for common ORMs
    if npm list knex 2>/dev/null | grep -q knex; then
      success "Knex.js available"
    else
      info "Knex.js not detected (optional)"
    fi
  else
    warn "Node.js not available - ORM validation limited"
    ((self_test_warnings++)) || true
  fi
  echo ""

  # Step 4: Check Schema File
  echo "--- Step 4: Schema File ---"
  if [[ -f "$SCHEMA_PATH" ]]; then
    success "Schema file exists: $SCHEMA_PATH"
    if validate_json "$SCHEMA_PATH" 2>/dev/null; then
      success "Schema file is valid JSON"

      # Check for database-specific schema elements
      if grep -q "testTypes" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes testTypes definition"
      else
        warn "Schema may be missing testTypes"
        ((self_test_warnings++)) || true
      fi

      if grep -q "databaseInfo" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes databaseInfo definition"
      else
        warn "Schema may be missing databaseInfo"
        ((self_test_warnings++)) || true
      fi

      if grep -q "schemaValidation" "$SCHEMA_PATH" 2>/dev/null; then
        success "Schema includes schemaValidation definition"
      else
        warn "Schema may be missing schemaValidation"
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

  # Step 5: Test with Sample Data
  echo "--- Step 5: Sample Data Validation ---"
  if [[ -f "$SAMPLE_OUTPUT_PATH" ]]; then
    success "Sample output file exists"

    if validate_json "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
      success "Sample output is valid JSON"

      # Test database-specific validation
      if validate_test_types "$SAMPLE_OUTPUT_PATH" 2>/dev/null; then
        success "Sample output has valid test types"
      else
        warn "Sample output test types validation issue"
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

  # Step 6: Library Self-Test
  echo "--- Step 6: Validator Library Self-Test ---"
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

# Validate test types structure
# Returns: 0 if valid, 1 if invalid
validate_test_types() {
  local output_file="$1"

  # Check testTypes exists
  local test_types_data
  test_types_data=$(json_get "$output_file" ".output.testTypes" 2>/dev/null)

  if [[ -z "$test_types_data" ]] || [[ "$test_types_data" == "null" ]]; then
    warn "Missing testTypes in output"
    return 1
  fi

  # Check that at least some test types are present
  local types_tested=0
  for test_type in "schema" "integrity" "migration" "transaction" "performance" "dataQuality"; do
    local type_data
    type_data=$(json_get "$output_file" ".output.testTypes.$test_type" 2>/dev/null)
    if [[ -n "$type_data" ]] && [[ "$type_data" != "null" ]]; then
      ((types_tested++)) || true
    fi
  done

  if [[ $types_tested -eq 0 ]]; then
    error "No test types found in testTypes"
    return 1
  fi

  debug "Found $types_tested test types in output"
  return 0
}

# Validate database info structure
# Returns: 0 if valid, 1 if invalid
validate_database_info() {
  local output_file="$1"

  # Check databaseInfo exists
  local db_info
  db_info=$(json_get "$output_file" ".output.databaseInfo" 2>/dev/null)

  if [[ -z "$db_info" ]] || [[ "$db_info" == "null" ]]; then
    warn "Missing databaseInfo in output"
    return 1
  fi

  # Check database type is present
  local db_type
  db_type=$(json_get "$output_file" ".output.databaseInfo.type" 2>/dev/null)

  if [[ -z "$db_type" ]] || [[ "$db_type" == "null" ]]; then
    error "Missing database type in databaseInfo"
    return 1
  fi

  # Validate database type is valid enum
  if ! validate_enum "$db_type" "postgresql" "mysql" "mariadb" "mongodb" "sqlite" "mssql" "oracle" "redis" "cassandra" "other"; then
    error "Invalid database type: $db_type"
    return 1
  fi

  debug "Database type: $db_type"
  return 0
}

# Validate database findings have required fields
# Returns: 0 if valid, 1 if invalid
validate_database_findings() {
  local output_file="$1"

  local finding_count
  finding_count=$(json_count "$output_file" ".output.findings" 2>/dev/null)

  if [[ -z "$finding_count" ]] || [[ "$finding_count" == "null" ]]; then
    finding_count=0
  fi

  debug "Found $finding_count database findings"

  # If there are findings, validate structure of first few
  if [[ "$finding_count" -gt 0 ]]; then
    # Check first finding has required fields
    local first_id first_severity first_test_type
    first_id=$(json_get "$output_file" ".output.findings[0].id" 2>/dev/null)
    first_severity=$(json_get "$output_file" ".output.findings[0].severity" 2>/dev/null)
    first_test_type=$(json_get "$output_file" ".output.findings[0].testType" 2>/dev/null)

    if [[ -z "$first_id" ]] || [[ "$first_id" == "null" ]]; then
      error "Finding missing 'id' field"
      return 1
    fi

    # Validate ID format (DB-XXX)
    if ! [[ "$first_id" =~ ^DB-[0-9]{3,6}$ ]]; then
      warn "Finding ID does not match expected pattern DB-XXX: $first_id"
    fi

    if [[ -z "$first_severity" ]] || [[ "$first_severity" == "null" ]]; then
      error "Finding missing 'severity' field"
      return 1
    fi

    # Validate severity is valid enum
    if ! validate_enum "$first_severity" "critical" "high" "medium" "low" "info"; then
      error "Finding has invalid severity: $first_severity"
      return 1
    fi

    if [[ -z "$first_test_type" ]] || [[ "$first_test_type" == "null" ]]; then
      warn "Finding missing 'testType' - consider adding test type classification"
    else
      # Validate test type is valid enum
      if ! validate_enum "$first_test_type" "schema" "integrity" "migration" "transaction" "performance" "data-quality"; then
        error "Finding has invalid testType: $first_test_type"
        return 1
      fi
    fi
  fi

  return 0
}

# Validate schema validation section if present
# Returns: 0 if valid, 1 if invalid
validate_schema_section() {
  local output_file="$1"

  local schema_data
  schema_data=$(json_get "$output_file" ".output.schemaValidation" 2>/dev/null)

  if [[ -z "$schema_data" ]] || [[ "$schema_data" == "null" ]]; then
    debug "No schemaValidation section found (optional)"
    return 0
  fi

  # If schema validation exists, check for table validations
  local tables_validated
  tables_validated=$(json_get "$output_file" ".output.schemaValidation.tablesValidated" 2>/dev/null)

  if [[ -n "$tables_validated" ]] && [[ "$tables_validated" != "null" ]] && [[ "$tables_validated" -gt 0 ]]; then
    debug "Schema validation covers $tables_validated tables"
  fi

  return 0
}

# Validate migration tests section if present
# Returns: 0 if valid, 1 if invalid
validate_migration_section() {
  local output_file="$1"

  local migration_data
  migration_data=$(json_get "$output_file" ".output.migrationTests" 2>/dev/null)

  if [[ -z "$migration_data" ]] || [[ "$migration_data" == "null" ]]; then
    debug "No migrationTests section found (optional)"
    return 0
  fi

  # If migration tests exist, check structure
  local migrations_tested
  migrations_tested=$(json_get "$output_file" ".output.migrationTests.migrationsTested" 2>/dev/null)

  if [[ -n "$migrations_tested" ]] && [[ "$migrations_tested" != "null" ]]; then
    debug "Migration tests cover $migrations_tested migrations"
  fi

  return 0
}

# Validate ACID compliance section if present
# Returns: 0 if valid, 1 if invalid
validate_acid_section() {
  local output_file="$1"

  local acid_data
  acid_data=$(json_get "$output_file" ".output.transactionTests.acidCompliance" 2>/dev/null)

  if [[ -z "$acid_data" ]] || [[ "$acid_data" == "null" ]]; then
    debug "No ACID compliance section found (optional)"
    return 0
  fi

  # Check for ACID property tests
  for prop in "atomicity" "consistency" "isolation" "durability"; do
    local prop_data
    prop_data=$(json_get "$output_file" ".output.transactionTests.acidCompliance.$prop" 2>/dev/null)
    if [[ -n "$prop_data" ]] && [[ "$prop_data" != "null" ]]; then
      local tested passed
      tested=$(json_get "$output_file" ".output.transactionTests.acidCompliance.$prop.tested" 2>/dev/null)
      passed=$(json_get "$output_file" ".output.transactionTests.acidCompliance.$prop.passed" 2>/dev/null)
      debug "ACID $prop: tested=$tested, passed=$passed"
    fi
  done

  return 0
}

# Validate recommendations have required structure
# Returns: 0 if valid, 1 if invalid
validate_recommendations() {
  local output_file="$1"

  local rec_count
  rec_count=$(json_count "$output_file" ".output.recommendations" 2>/dev/null)

  if [[ -z "$rec_count" ]] || [[ "$rec_count" == "null" ]]; then
    rec_count=0
  fi

  debug "Found $rec_count recommendations"

  # If there are recommendations, validate structure
  if [[ "$rec_count" -gt 0 ]]; then
    local first_priority first_test_type
    first_priority=$(json_get "$output_file" ".output.recommendations[0].priority" 2>/dev/null)
    first_test_type=$(json_get "$output_file" ".output.recommendations[0].testType" 2>/dev/null)

    if [[ -n "$first_priority" ]] && [[ "$first_priority" != "null" ]]; then
      if ! validate_enum "$first_priority" "critical" "high" "medium" "low"; then
        error "Recommendation has invalid priority: $first_priority"
        return 1
      fi
    fi

    if [[ -n "$first_test_type" ]] && [[ "$first_test_type" != "null" ]]; then
      if ! validate_enum "$first_test_type" "schema" "integrity" "migration" "transaction" "performance" "data-quality"; then
        error "Recommendation has invalid testType: $first_test_type"
        return 1
      fi
    fi
  fi

  return 0
}

# Main skill-specific validation function
# Returns: 0 if valid, 1 if invalid
validate_skill_specific() {
  local output_file="$1"
  local has_errors=false

  debug "Running database-testing specific validations..."

  # Validate test types structure
  if ! validate_test_types "$output_file"; then
    has_errors=true
  else
    success "Test types validation passed"
  fi

  # Validate database info structure
  if ! validate_database_info "$output_file"; then
    has_errors=true
  else
    success "Database info validation passed"
  fi

  # Validate database findings structure
  if ! validate_database_findings "$output_file"; then
    has_errors=true
  else
    success "Database findings validation passed"
  fi

  # Validate schema section (optional)
  if ! validate_schema_section "$output_file"; then
    has_errors=true
  else
    success "Schema validation section passed"
  fi

  # Validate migration section (optional)
  if ! validate_migration_section "$output_file"; then
    has_errors=true
  else
    success "Migration tests section passed"
  fi

  # Validate ACID section (optional)
  if ! validate_acid_section "$output_file"; then
    has_errors=true
  else
    success "ACID compliance section passed"
  fi

  # Validate recommendations
  if ! validate_recommendations "$output_file"; then
    has_errors=true
  else
    success "Recommendations validation passed"
  fi

  # Check for database tool attribution
  local tools_used
  tools_used=$(json_get "$output_file" ".metadata.toolsUsed" 2>/dev/null)
  if [[ -z "$tools_used" ]] || [[ "$tools_used" == "null" ]] || [[ "$tools_used" == "[]" ]]; then
    warn "No database tools listed in metadata.toolsUsed"
  else
    debug "Database tools used: $tools_used"
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
      error "Output missing required database terms: ${missing_terms[*]}"
      has_errors=true
    else
      success "All required database terms found"
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

  # Step 6: Validate Database Content Terms
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 6: Database Content Terms ---"

  if ! validate_content_terms "$OUTPUT_FILE"; then
    content_status="failed"
    ((error_count++)) || true
  fi

  [[ "$JSON_ONLY" != "true" ]] && echo ""

  # Step 7: Database-Specific Validation
  [[ "$JSON_ONLY" != "true" ]] && echo "--- Step 7: Database-Specific Validation ---"

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
    echo "  Tools:              $tool_status"
    echo "  JSON Syntax:        $json_status"
    echo "  Schema:             $schema_status"
    echo "  Required Fields:    $fields_status"
    echo "  Enum Values:        $enums_status"
    echo "  Content Terms:      $content_status"
    echo "  Database-Specific:  $specific_status"
    echo ""
    echo "  ------------------------------"
    echo "  Overall:            $overall_status"
    echo "  Errors:             $error_count"
    echo "  Warnings:           $warning_count"
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
