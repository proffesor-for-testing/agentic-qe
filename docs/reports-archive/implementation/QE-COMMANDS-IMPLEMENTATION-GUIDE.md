# QE Slash Commands - Implementation Guide

**Version:** 2.0.0
**Date:** 2025-09-30
**Purpose:** Practical implementation guide for QE slash commands
**Companion to:** QE-SLASH-COMMANDS-SPECIFICATION.md

---

## Table of Contents

1. [Command Template Structure](#command-template-structure)
2. [Error Handling Patterns](#error-handling-patterns)
3. [Memory Management](#memory-management)
4. [Agent Coordination Protocols](#agent-coordination-protocols)
5. [Testing Commands](#testing-commands)
6. [Deployment Checklist](#deployment-checklist)

---

## Command Template Structure

### Base Command Template

All QE commands follow this standard structure:

```bash
#!/bin/bash
# .claude/commands/<command-name>.sh
# Description: <one-line description>
# Author: AQE Fleet Team
# Version: 2.0.0

set -euo pipefail  # Exit on error, undefined variables, pipe failures

# ============================================================================
# CONFIGURATION
# ============================================================================

readonly COMMAND_NAME="<command-name>"
readonly COMMAND_VERSION="2.0.0"
readonly AQE_DIR=".agentic-qe"
readonly RESULTS_DIR="${AQE_DIR}/results"
readonly LOGS_DIR="${AQE_DIR}/logs"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*" | tee -a "${LOGS_DIR}/${COMMAND_NAME}.log"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2 | tee -a "${LOGS_DIR}/${COMMAND_NAME}.log"
}

log_warn() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*" | tee -a "${LOGS_DIR}/${COMMAND_NAME}.log"
}

# Initialize required directories
init_dirs() {
  mkdir -p "${AQE_DIR}" "${RESULTS_DIR}" "${LOGS_DIR}"
}

# Validate required dependencies
check_dependencies() {
  local deps=("$@")
  local missing=()

  for dep in "${deps[@]}"; do
    if ! command -v "${dep}" &> /dev/null; then
      missing+=("${dep}")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing dependencies: ${missing[*]}"
    log_info "Install with: npm install --save-dev ${missing[*]}"
    exit 1
  fi
}

# Claude Flow hook: pre-task
hook_pre_task() {
  local description="${1}"
  local agent="${2}"

  log_info "Executing pre-task hook: ${description}"

  npx claude-flow@alpha hooks pre-task \
    --description "${description}" \
    --agent "${agent}" \
    2>&1 | tee -a "${LOGS_DIR}/hooks.log" || log_warn "Pre-task hook failed (non-fatal)"
}

# Claude Flow hook: post-task
hook_post_task() {
  local task_id="${1}"
  local results="${2}"

  log_info "Executing post-task hook: ${task_id}"

  npx claude-flow@alpha hooks post-task \
    --task-id "${task_id}" \
    --results "${results}" \
    2>&1 | tee -a "${LOGS_DIR}/hooks.log" || log_warn "Post-task hook failed (non-fatal)"
}

# Claude Flow memory: store
memory_store() {
  local key="${1}"
  local value="${2}"

  log_info "Storing in memory: ${key}"

  npx claude-flow@alpha memory store \
    --key "${key}" \
    --value "${value}" \
    2>&1 | tee -a "${LOGS_DIR}/memory.log" || log_warn "Memory store failed (non-fatal)"
}

# Claude Flow memory: retrieve
memory_retrieve() {
  local key="${1}"
  local default="${2:-{}}"

  npx claude-flow@alpha memory retrieve \
    --key "${key}" \
    2>/dev/null || echo "${default}"
}

# Claude Flow notify
notify_fleet() {
  local message="${1}"

  log_info "Notifying fleet: ${message}"

  npx claude-flow@alpha hooks notify \
    --message "${message}" \
    2>&1 | tee -a "${LOGS_DIR}/notifications.log" || log_warn "Notification failed (non-fatal)"
}

# Neural pattern training
train_neural_pattern() {
  local operation="${1}"
  local outcome="${2}"

  log_info "Training neural pattern: ${operation}"

  npx claude-flow@alpha neural patterns \
    --action "learn" \
    --operation "${operation}" \
    --outcome "${outcome}" \
    2>&1 | tee -a "${LOGS_DIR}/neural.log" || log_warn "Neural training failed (non-fatal)"
}

# Generate unique task ID
generate_task_id() {
  echo "${COMMAND_NAME}-$(date +%s)-$$"
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

usage() {
  cat <<EOF
Usage: ${COMMAND_NAME} [OPTIONS] <ARGS>

Description:
  <command description>

Options:
  --help, -h        Show this help message
  --version, -v     Show version information
  --verbose         Enable verbose logging
  --dry-run         Preview without executing

Arguments:
  <argument>        <description>

Examples:
  ${COMMAND_NAME} <example>

EOF
  exit 0
}

parse_args() {
  # Parse command-line arguments
  while [[ $# -gt 0 ]]; do
    case "${1}" in
      --help|-h)
        usage
        ;;
      --version|-v)
        echo "${COMMAND_NAME} version ${COMMAND_VERSION}"
        exit 0
        ;;
      --verbose)
        set -x
        shift
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      *)
        # Handle positional arguments
        break
        ;;
    esac
  done
}

# ============================================================================
# MAIN COMMAND LOGIC
# ============================================================================

main() {
  # Initialize
  init_dirs
  check_dependencies "node" "npx" "jq"

  # Parse arguments
  parse_args "$@"

  # Generate task ID
  local task_id
  task_id=$(generate_task_id)

  log_info "Starting ${COMMAND_NAME} (task_id: ${task_id})"

  # Pre-task hook
  hook_pre_task "<description>" "<agent>"

  # Retrieve context from memory
  local context
  context=$(memory_retrieve "aqe/<key>")

  # Execute main command logic
  # ... (command-specific implementation)

  # Store results in memory
  memory_store "aqe/${COMMAND_NAME}/${task_id}" "${results}"

  # Post-task hook
  hook_post_task "${task_id}" "${results}"

  # Notify fleet
  notify_fleet "✅ ${COMMAND_NAME} completed: ${task_id}"

  # Train neural patterns
  train_neural_pattern "${COMMAND_NAME}" "${results}"

  log_info "${COMMAND_NAME} completed successfully"
}

# ============================================================================
# ERROR HANDLING
# ============================================================================

cleanup() {
  local exit_code=$?

  if [[ ${exit_code} -ne 0 ]]; then
    log_error "${COMMAND_NAME} failed with exit code ${exit_code}"
    notify_fleet "❌ ${COMMAND_NAME} failed"
  fi

  exit ${exit_code}
}

trap cleanup EXIT ERR INT TERM

# ============================================================================
# ENTRY POINT
# ============================================================================

main "$@"
```

---

## Error Handling Patterns

### Pattern 1: Graceful Degradation

```bash
# Attempt Claude Flow integration, but continue if unavailable
attempt_hook() {
  local hook_type="${1}"
  shift

  if command -v npx &> /dev/null; then
    npx claude-flow@alpha hooks "${hook_type}" "$@" 2>/dev/null || {
      log_warn "Hook '${hook_type}' failed, continuing without coordination"
      return 0
    }
  else
    log_warn "Claude Flow not available, skipping hook '${hook_type}'"
    return 0
  fi
}
```

### Pattern 2: Retry Logic with Exponential Backoff

```bash
retry_with_backoff() {
  local max_attempts="${1}"
  local delay="${2}"
  shift 2
  local cmd=("$@")

  local attempt=1
  while [[ ${attempt} -le ${max_attempts} ]]; do
    log_info "Attempt ${attempt}/${max_attempts}: ${cmd[*]}"

    if "${cmd[@]}"; then
      log_info "Command succeeded on attempt ${attempt}"
      return 0
    fi

    if [[ ${attempt} -lt ${max_attempts} ]]; then
      log_warn "Command failed, retrying in ${delay}s..."
      sleep "${delay}"
      delay=$((delay * 2))  # Exponential backoff
    fi

    attempt=$((attempt + 1))
  done

  log_error "Command failed after ${max_attempts} attempts"
  return 1
}

# Usage
retry_with_backoff 3 2 agentic-qe test run --path ./tests
```

### Pattern 3: Validation Gates

```bash
validate_test_suite() {
  local suite_path="${1}"

  # Gate 1: Path exists
  if [[ ! -d "${suite_path}" ]]; then
    log_error "Test suite not found: ${suite_path}"
    return 1
  fi

  # Gate 2: Contains test files
  local test_files
  test_files=$(find "${suite_path}" -name "*.test.*" -o -name "*.spec.*" | wc -l)
  if [[ ${test_files} -eq 0 ]]; then
    log_error "No test files found in: ${suite_path}"
    return 1
  fi

  # Gate 3: Framework configuration exists
  local framework_configs=("jest.config.js" "jest.config.ts" "cypress.config.js" "playwright.config.ts")
  local config_found=false

  for config in "${framework_configs[@]}"; do
    if [[ -f "${config}" ]]; then
      config_found=true
      break
    fi
  done

  if [[ "${config_found}" == "false" ]]; then
    log_warn "No framework configuration found, using defaults"
  fi

  log_info "Test suite validation passed: ${test_files} test files"
  return 0
}
```

### Pattern 4: Resource Cleanup

```bash
# Track temporary resources for cleanup
declare -a TEMP_RESOURCES=()

create_temp_file() {
  local prefix="${1}"
  local temp_file

  temp_file=$(mktemp "${AQE_DIR}/${prefix}.XXXXXX")
  TEMP_RESOURCES+=("${temp_file}")

  echo "${temp_file}"
}

cleanup_resources() {
  log_info "Cleaning up ${#TEMP_RESOURCES[@]} temporary resources"

  for resource in "${TEMP_RESOURCES[@]}"; do
    if [[ -e "${resource}" ]]; then
      rm -rf "${resource}" || log_warn "Failed to remove: ${resource}"
    fi
  done

  TEMP_RESOURCES=()
}

trap cleanup_resources EXIT
```

---

## Memory Management

### Memory Key Naming Convention

```
aqe/
├── fleet/
│   ├── id                          # Fleet identifier
│   ├── status                      # Fleet status
│   └── topology                    # Fleet topology
├── agents/
│   ├── {agent-name}/status         # Agent status
│   ├── {agent-name}/metrics        # Agent metrics
│   └── {agent-name}/config         # Agent configuration
├── test-generation/
│   ├── results/{task-id}           # Generation results
│   ├── progress                    # Current progress
│   └── patterns                    # Learned patterns
├── test-execution/
│   ├── results/{run-id}            # Execution results
│   ├── history                     # Execution history
│   └── flaky-tests                 # Known flaky tests
├── coverage/
│   ├── current                     # Current coverage
│   ├── baseline                    # Baseline coverage
│   ├── trends                      # Coverage trends
│   └── gaps                        # Coverage gaps
├── optimization/
│   ├── results/{opt-id}            # Optimization results
│   └── recommendations             # Recommendations
└── coordination/
    ├── active-tasks                # Currently active tasks
    ├── task-queue                  # Pending tasks
    └── event-log                   # Event history
```

### Memory Helper Functions

```bash
# Store structured data
memory_store_json() {
  local key="${1}"
  local json_data="${2}"

  # Validate JSON
  if ! echo "${json_data}" | jq empty 2>/dev/null; then
    log_error "Invalid JSON data for key: ${key}"
    return 1
  fi

  memory_store "${key}" "${json_data}"
}

# Retrieve and parse JSON
memory_retrieve_json() {
  local key="${1}"
  local default="${2:-{}}"

  local data
  data=$(memory_retrieve "${key}" "${default}")

  # Validate retrieved data
  if ! echo "${data}" | jq empty 2>/dev/null; then
    log_warn "Invalid JSON retrieved for key ${key}, returning default"
    echo "${default}"
  else
    echo "${data}"
  fi
}

# Append to memory array
memory_append() {
  local key="${1}"
  local value="${2}"

  local current
  current=$(memory_retrieve_json "${key}" "[]")

  local updated
  updated=$(echo "${current}" | jq --arg val "${value}" '. + [$val]')

  memory_store_json "${key}" "${updated}"
}

# Update memory object field
memory_update_field() {
  local key="${1}"
  local field="${2}"
  local value="${3}"

  local current
  current=$(memory_retrieve_json "${key}" "{}")

  local updated
  updated=$(echo "${current}" | jq --arg field "${field}" --arg val "${value}" '.[$field] = $val')

  memory_store_json "${key}" "${updated}"
}

# Memory-based locking
memory_acquire_lock() {
  local lock_key="${1}"
  local timeout="${2:-30}"

  local deadline=$(($(date +%s) + timeout))

  while [[ $(date +%s) -lt ${deadline} ]]; do
    local lock_holder
    lock_holder=$(memory_retrieve "${lock_key}" "null")

    if [[ "${lock_holder}" == "null" ]]; then
      # Acquire lock
      memory_store "${lock_key}" "$$"

      # Verify we got the lock (handle race conditions)
      sleep 0.1
      lock_holder=$(memory_retrieve "${lock_key}")

      if [[ "${lock_holder}" == "$$" ]]; then
        log_info "Lock acquired: ${lock_key}"
        return 0
      fi
    fi

    log_info "Waiting for lock: ${lock_key}"
    sleep 1
  done

  log_error "Lock acquisition timeout: ${lock_key}"
  return 1
}

memory_release_lock() {
  local lock_key="${1}"

  local lock_holder
  lock_holder=$(memory_retrieve "${lock_key}")

  if [[ "${lock_holder}" == "$$" ]]; then
    memory_store "${lock_key}" "null"
    log_info "Lock released: ${lock_key}"
  else
    log_warn "Attempted to release lock not owned by this process"
  fi
}
```

---

## Agent Coordination Protocols

### Protocol 1: Sequential Coordination

```bash
# Task: Generate tests, then execute, then analyze
coordinate_sequential() {
  local module="${1}"

  log_info "Starting sequential coordination for: ${module}"

  # Phase 1: Test Generation
  local gen_task_id
  gen_task_id=$(generate_task_id)

  hook_pre_task "Generate tests for ${module}" "qe-test-generator"

  agentic-qe generate tests \
    --path "${module}" \
    --task-id "${gen_task_id}"

  hook_post_task "${gen_task_id}" "$(cat .agentic-qe/results/${gen_task_id}.json)"

  # Phase 2: Test Execution
  local exec_task_id
  exec_task_id=$(generate_task_id)

  hook_pre_task "Execute tests for ${module}" "qe-test-executor"

  agentic-qe run tests \
    --path "tests/${module}" \
    --run-id "${exec_task_id}"

  hook_post_task "${exec_task_id}" "$(cat .agentic-qe/results/${exec_task_id}.json)"

  # Phase 3: Coverage Analysis
  local analysis_task_id
  analysis_task_id=$(generate_task_id)

  hook_pre_task "Analyze coverage for ${module}" "qe-coverage-analyzer"

  agentic-qe analyze coverage \
    --path "${module}" \
    --analysis-id "${analysis_task_id}"

  hook_post_task "${analysis_task_id}" "$(cat .agentic-qe/analysis/${analysis_task_id}.json)"

  log_info "Sequential coordination completed"
}
```

### Protocol 2: Parallel Coordination

```bash
# Task: Generate tests for multiple modules in parallel
coordinate_parallel() {
  local modules=("$@")

  log_info "Starting parallel coordination for ${#modules[@]} modules"

  local pids=()
  local task_ids=()

  for module in "${modules[@]}"; do
    (
      local task_id
      task_id=$(generate_task_id)

      hook_pre_task "Generate tests for ${module}" "qe-test-generator"

      agentic-qe generate tests \
        --path "${module}" \
        --task-id "${task_id}"

      hook_post_task "${task_id}" "$(cat .agentic-qe/results/${task_id}.json)"

      echo "${task_id}"
    ) &

    pids+=($!)
  done

  # Wait for all parallel tasks
  local failed=0
  for pid in "${pids[@]}"; do
    if ! wait "${pid}"; then
      log_error "Parallel task failed: PID ${pid}"
      failed=$((failed + 1))
    fi
  done

  if [[ ${failed} -gt 0 ]]; then
    log_error "${failed} parallel tasks failed"
    return 1
  fi

  log_info "Parallel coordination completed successfully"
  return 0
}
```

### Protocol 3: Hierarchical Coordination

```bash
# Coordinator spawns workers for distributed execution
coordinate_hierarchical() {
  local coordinator_agent="qe-fleet-coordinator"
  local worker_agents=("qe-test-generator" "qe-test-executor" "qe-coverage-analyzer")

  log_info "Starting hierarchical coordination"

  # Coordinator: Analyze workload
  local workload
  workload=$(agentic-qe analyze workload --output json)

  # Coordinator: Distribute tasks to workers
  local task_assignments
  task_assignments=$(echo "${workload}" | jq -r '.tasks | to_entries | map({worker: .key, tasks: .value}) | .[]')

  # Workers: Execute assigned tasks
  echo "${task_assignments}" | while IFS= read -r assignment; do
    local worker
    worker=$(echo "${assignment}" | jq -r '.worker')

    local tasks
    tasks=$(echo "${assignment}" | jq -r '.tasks[]')

    (
      hook_pre_task "Execute tasks" "${worker}"

      echo "${tasks}" | while IFS= read -r task; do
        agentic-qe execute task \
          --task "${task}" \
          --worker "${worker}"
      done

      hook_post_task "${worker}" "Completed assigned tasks"
    ) &
  done

  # Coordinator: Wait for all workers
  wait

  log_info "Hierarchical coordination completed"
}
```

### Protocol 4: Event-Driven Coordination

```bash
# React to events from other agents
coordinate_event_driven() {
  local event_key="aqe/coordination/events"

  log_info "Starting event-driven coordination"

  # Subscribe to event stream
  while true; do
    local events
    events=$(memory_retrieve_json "${event_key}" "[]")

    # Process each event
    echo "${events}" | jq -c '.[]' | while IFS= read -r event; do
      local event_type
      event_type=$(echo "${event}" | jq -r '.type')

      local event_data
      event_data=$(echo "${event}" | jq -r '.data')

      case "${event_type}" in
        "test-generation-complete")
          log_info "Reacting to: ${event_type}"
          agentic-qe run tests --path "${event_data}"
          ;;

        "test-execution-complete")
          log_info "Reacting to: ${event_type}"
          agentic-qe analyze coverage --run-id "${event_data}"
          ;;

        "coverage-below-threshold")
          log_info "Reacting to: ${event_type}"
          agentic-qe generate tests --coverage-gap "${event_data}"
          ;;

        *)
          log_warn "Unknown event type: ${event_type}"
          ;;
      esac

      # Remove processed event
      events=$(echo "${events}" | jq --arg evt "${event}" 'del(.[] | select(. == ($evt | fromjson)))')
      memory_store_json "${event_key}" "${events}"
    done

    # Polling interval
    sleep 5
  done
}
```

---

## Testing Commands

### Unit Test for Command

```bash
#!/bin/bash
# tests/commands/test-qe-generate.sh

set -euo pipefail

source .claude/commands/qe-generate.sh

# Mock functions
memory_store() { echo "MOCK: memory_store $*"; }
memory_retrieve() { echo "{}"; }
hook_pre_task() { echo "MOCK: hook_pre_task $*"; }
hook_post_task() { echo "MOCK: hook_post_task $*"; }

# Test 1: Basic test generation
test_basic_generation() {
  echo "TEST: Basic test generation"

  local result
  result=$(qe_generate "src/sample.ts" "unit" "jest" "95")

  if [[ $? -eq 0 ]]; then
    echo "✅ PASS: Basic generation"
  else
    echo "❌ FAIL: Basic generation"
    return 1
  fi
}

# Test 2: Invalid arguments
test_invalid_arguments() {
  echo "TEST: Invalid arguments"

  if qe_generate "" "" "" "" 2>/dev/null; then
    echo "❌ FAIL: Should reject empty arguments"
    return 1
  else
    echo "✅ PASS: Correctly rejected invalid arguments"
  fi
}

# Run all tests
test_basic_generation
test_invalid_arguments

echo "All tests passed!"
```

### Integration Test

```bash
#!/bin/bash
# tests/integration/test-qe-workflow.sh

set -euo pipefail

# Integration test: Full QE workflow
test_full_workflow() {
  echo "INTEGRATION TEST: Full QE Workflow"

  # Setup test project
  mkdir -p test-project/src
  cat > test-project/src/calculator.js <<EOF
export function add(a, b) {
  return a + b;
}
EOF

  cd test-project

  # Step 1: Initialize AQE
  aqe init
  if [[ $? -ne 0 ]]; then
    echo "❌ FAIL: AQE initialization failed"
    return 1
  fi

  # Step 2: Generate tests
  /qe-generate src/calculator.js
  if [[ ! -f "tests/src/calculator.test.js" ]]; then
    echo "❌ FAIL: Test file not generated"
    return 1
  fi

  # Step 3: Execute tests
  /qe-execute tests/
  if [[ $? -ne 0 ]]; then
    echo "❌ FAIL: Test execution failed"
    return 1
  fi

  # Step 4: Analyze coverage
  /qe-analyze coverage
  local coverage
  coverage=$(npx claude-flow@alpha memory retrieve --key "aqe/coverage/current" | jq -r '.pct')

  if (( $(echo "${coverage} >= 80" | bc -l) )); then
    echo "✅ PASS: Coverage ${coverage}% meets threshold"
  else
    echo "❌ FAIL: Coverage ${coverage}% below threshold"
    return 1
  fi

  echo "✅ INTEGRATION TEST PASSED"
}

test_full_workflow
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All commands have executable permissions (`chmod +x`)
- [ ] All commands pass shellcheck linting
- [ ] Unit tests written for each command
- [ ] Integration tests pass
- [ ] Documentation complete in CLAUDE.md
- [ ] Memory keys documented
- [ ] Agent coordination tested
- [ ] Error handling verified
- [ ] Logging configured correctly

### Deployment Steps

```bash
# 1. Copy commands to .claude/commands/
mkdir -p .claude/commands
cp commands/*.sh .claude/commands/

# 2. Set executable permissions
chmod +x .claude/commands/*.sh

# 3. Verify commands are accessible
for cmd in .claude/commands/*.sh; do
  bash -n "${cmd}" || echo "Syntax error in: ${cmd}"
done

# 4. Run tests
bash tests/commands/test-all.sh

# 5. Update CLAUDE.md with command documentation
cat >> CLAUDE.md <<EOF

## QE Slash Commands

The following slash commands are available for quality engineering:

- \`/qe-generate\` - Generate tests with AI
- \`/qe-execute\` - Execute test suites
- \`/qe-analyze\` - Analyze coverage and quality
- \`/qe-optimize\` - Optimize test suites
- \`/qe-report\` - Generate QE reports
- \`/qe-fleet-status\` - Show fleet status
- \`/qe-chaos\` - Run chaos tests
- \`/qe-benchmark\` - Performance benchmarking

See docs/QE-SLASH-COMMANDS-SPECIFICATION.md for details.
EOF

# 6. Notify fleet of deployment
npx claude-flow@alpha hooks notify \
  --message "QE slash commands deployed: 8 commands available"
```

### Post-Deployment Validation

```bash
#!/bin/bash
# Validate command deployment

echo "Validating QE command deployment..."

commands=(
  "qe-generate"
  "qe-execute"
  "qe-analyze"
  "qe-optimize"
  "qe-report"
  "qe-fleet-status"
  "qe-chaos"
  "qe-benchmark"
)

failed=0

for cmd in "${commands[@]}"; do
  cmd_path=".claude/commands/${cmd}.sh"

  # Check file exists
  if [[ ! -f "${cmd_path}" ]]; then
    echo "❌ Missing: ${cmd_path}"
    failed=$((failed + 1))
    continue
  fi

  # Check executable
  if [[ ! -x "${cmd_path}" ]]; then
    echo "❌ Not executable: ${cmd_path}"
    failed=$((failed + 1))
    continue
  fi

  # Check syntax
  if ! bash -n "${cmd_path}"; then
    echo "❌ Syntax error: ${cmd_path}"
    failed=$((failed + 1))
    continue
  fi

  # Check --help works
  if ! bash "${cmd_path}" --help &>/dev/null; then
    echo "⚠️  Help not available: ${cmd_path}"
  fi

  echo "✅ Valid: ${cmd}"
done

if [[ ${failed} -eq 0 ]]; then
  echo ""
  echo "✅ All ${#commands[@]} commands deployed successfully!"
  exit 0
else
  echo ""
  echo "❌ ${failed} commands failed validation"
  exit 1
fi
```

### Rollback Procedure

```bash
#!/bin/bash
# Rollback QE command deployment

echo "Rolling back QE commands..."

# Backup current commands
if [[ -d ".claude/commands" ]]; then
  mv .claude/commands ".claude/commands.backup-$(date +%s)"
  echo "✅ Current commands backed up"
fi

# Restore from previous backup
LATEST_BACKUP=$(ls -t .claude/commands.backup-* 2>/dev/null | head -1)

if [[ -n "${LATEST_BACKUP}" ]]; then
  cp -r "${LATEST_BACKUP}" .claude/commands
  echo "✅ Restored from: ${LATEST_BACKUP}"
else
  echo "❌ No backup found for rollback"
  exit 1
fi

# Verify restoration
bash tests/commands/test-all.sh

# Notify fleet
npx claude-flow@alpha hooks notify \
  --message "⚠️ QE commands rolled back to previous version"
```

---

## Command Performance Benchmarks

Each command should meet these performance targets:

| Command | Target Time | Max Memory | Parallel Support |
|---------|-------------|------------|------------------|
| `/qe-generate` | <10s for 10 files | 512MB | Yes (4-8 workers) |
| `/qe-execute` | <30s for 100 tests | 1GB | Yes (CPU cores) |
| `/qe-analyze` | <5s for 1000 LOC | 256MB | Yes (sublinear) |
| `/qe-optimize` | <15s for 500 tests | 512MB | Yes (parallel) |
| `/qe-report` | <3s | 128MB | No |
| `/qe-fleet-status` | <1s | 64MB | No |
| `/qe-chaos` | Variable | 1GB | Yes |
| `/qe-benchmark` | Variable | 512MB | Yes |

### Performance Monitoring

```bash
# Benchmark command execution
benchmark_command() {
  local command="${1}"
  shift
  local args=("$@")

  echo "Benchmarking: ${command} ${args[*]}"

  # Measure time
  local start
  start=$(date +%s.%N)

  # Measure memory
  /usr/bin/time -v "${command}" "${args[@]}" 2>&1 | tee /tmp/bench.log

  local end
  end=$(date +%s.%N)

  # Calculate metrics
  local duration
  duration=$(echo "${end} - ${start}" | bc)

  local max_memory
  max_memory=$(grep "Maximum resident set size" /tmp/bench.log | awk '{print $6}')

  echo ""
  echo "Performance Metrics:"
  echo "  Duration: ${duration}s"
  echo "  Max Memory: $((max_memory / 1024))MB"

  # Store in memory for trending
  local benchmark_data="{\"command\": \"${command}\", \"duration\": ${duration}, \"memory\": ${max_memory}, \"timestamp\": $(date +%s)}"

  npx claude-flow@alpha memory store \
    --key "aqe/benchmarks/${command}/latest" \
    --value "${benchmark_data}"
}
```

---

## Conclusion

This implementation guide provides:

1. ✅ **Standard Command Template** - Consistent structure for all QE commands
2. ✅ **Error Handling Patterns** - Robust error handling and recovery
3. ✅ **Memory Management** - Structured memory key organization
4. ✅ **Agent Coordination** - Multiple coordination protocols
5. ✅ **Testing Framework** - Unit and integration tests
6. ✅ **Deployment Process** - Complete deployment and rollback procedures
7. ✅ **Performance Monitoring** - Benchmarking and optimization

**Next Steps:**
1. Implement each command using the base template
2. Add command-specific logic
3. Test thoroughly with unit and integration tests
4. Deploy following the checklist
5. Monitor performance and optimize as needed

**Reference Documents:**
- Main specification: `QE-SLASH-COMMANDS-SPECIFICATION.md`
- Command templates: This guide
- Agent definitions: `/agentic-qe/.claude/agents/*.md`
- AQE architecture: `/agentic-qe/docs/ARCHITECTURE.md`