#!/bin/bash
# V3 QE Hook Bridge - Connects Claude Code hooks to V3 QE Learning System
# ADR-021: QE ReasoningBank for Pattern Learning
#
# This script bridges external Claude Code tool events to V3's internal
# QE learning hooks (QEHookRegistry).
#
# Usage: v3-qe-bridge.sh <hook-type> [options]
#
# Hook Types:
#   test-generation   - Pre/post test generation events
#   coverage-analysis - Pre/post coverage analysis events
#   agent-routing     - Agent routing and completion events
#   quality-metrics   - Quality score and risk assessment events
#   pattern-learning  - Pattern learned/applied/promoted events
#   file-edit         - File edit events (maps to appropriate QE hook)
#   command-exec      - Command execution events
#   task-complete     - Task completion events

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
V3_DIR="$PROJECT_ROOT/v3"
MEMORY_DB="${AQE_MEMORY_PATH:-.agentic-qe/memory.db}"
LOG_FILE="$PROJECT_ROOT/.agentic-qe/v3-hooks.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    local level="$1"
    shift
    echo "[$(date -Iseconds)] [$level] $*" >> "$LOG_FILE"
}

# Check if V3 mode is enabled
check_v3_mode() {
    if [[ "${AQE_V3_MODE:-false}" != "true" ]]; then
        log "DEBUG" "V3 mode not enabled, skipping hook"
        exit 0
    fi
}

# Check if learning is enabled
check_learning_enabled() {
    if [[ "${AQE_LEARNING_ENABLED:-false}" != "true" ]]; then
        log "DEBUG" "Learning not enabled, skipping hook"
        exit 0
    fi
}

# Invoke V3 QE hook via Node.js
invoke_qe_hook() {
    local hook_event="$1"
    local hook_data="$2"

    log "INFO" "Invoking QE hook: $hook_event"

    # Pass data via environment variables to avoid shell escaping issues
    # This is more robust than string interpolation with special characters
    QE_HOOK_EVENT="$hook_event" \
    QE_HOOK_DATA="$hook_data" \
    QE_V3_DIR="$V3_DIR" \
    node --experimental-specifier-resolution=node -e "
const v3Dir = process.env.QE_V3_DIR;
const hookEvent = process.env.QE_HOOK_EVENT;
const hookData = process.env.QE_HOOK_DATA;

async function invokeHook() {
    try {
        const { createRealQEReasoningBank } = await import(v3Dir + '/src/learning/real-qe-reasoning-bank.js');
        const { createQEHookRegistry } = await import(v3Dir + '/src/learning/qe-hooks.js');

        const bank = createRealQEReasoningBank();
        await bank.initialize();

        const registry = createQEHookRegistry();
        registry.initialize(bank);

        const data = JSON.parse(hookData);
        const results = await registry.emit(hookEvent, data);

        const patternsLearned = results.reduce((sum, r) => sum + (r.patternsLearned || 0), 0);
        if (patternsLearned > 0) {
            console.log(JSON.stringify({ success: true, patternsLearned }));
        }

        await bank.dispose();
    } catch (error) {
        console.error('Hook error:', error.message);
        process.exit(0); // Don't fail the parent operation
    }
}

invokeHook();
" 2>> "$LOG_FILE" || true
}

# Store pattern via claude-flow memory (fallback)
store_pattern_fallback() {
    local namespace="$1"
    local key="$2"
    local value="$3"

    npx @claude-flow/cli@latest memory store \
        --namespace "$namespace" \
        --key "$key" \
        --value "$value" 2>/dev/null || true
}

# Detect QE domain from file path
detect_domain_from_file() {
    local file="$1"

    case "$file" in
        *test*|*spec*|*.test.*|*.spec.*)
            echo "test-generation"
            ;;
        *coverage*|*istanbul*|*nyc*)
            echo "coverage-analysis"
            ;;
        *security*|*auth*|*crypto*)
            echo "security-compliance"
            ;;
        *api*|*contract*|*schema*)
            echo "contract-testing"
            ;;
        *visual*|*screenshot*|*a11y*|*accessibility*)
            echo "visual-accessibility"
            ;;
        *perf*|*benchmark*|*load*)
            echo "chaos-resilience"
            ;;
        *learn*|*pattern*|*train*)
            echo "learning-optimization"
            ;;
        *)
            echo "code-intelligence"
            ;;
    esac
}

# Detect test type from file
detect_test_type() {
    local file="$1"

    case "$file" in
        *unit*|*.unit.*)
            echo "unit"
            ;;
        *integration*|*.integration.*)
            echo "integration"
            ;;
        *e2e*|*end-to-end*)
            echo "e2e"
            ;;
        *api*|*contract*)
            echo "api"
            ;;
        *)
            echo "unit"
            ;;
    esac
}

# Detect framework from file
detect_framework() {
    local file="$1"

    case "$file" in
        *.test.ts|*.spec.ts)
            if grep -q "vitest\|describe\|it\|expect" "$file" 2>/dev/null; then
                echo "vitest"
            else
                echo "jest"
            fi
            ;;
        *.test.js|*.spec.js)
            echo "jest"
            ;;
        *_test.py|*test_*.py)
            echo "pytest"
            ;;
        *_test.go)
            echo "go-test"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Handle file edit hook
handle_file_edit() {
    local file="${1:-}"
    local success="${2:-true}"

    if [[ -z "$file" ]]; then
        log "WARN" "No file provided for file-edit hook"
        return
    fi

    local domain=$(detect_domain_from_file "$file")
    local filename=$(basename "$file")

    # Check if it's a test file
    if [[ "$file" == *test* || "$file" == *spec* ]]; then
        local test_type=$(detect_test_type "$file")
        local framework=$(detect_framework "$file")

        local hook_data=$(cat <<EOF
{
    "targetFile": "$file",
    "testType": "$test_type",
    "framework": "$framework",
    "language": "typescript",
    "success": $success,
    "domain": "$domain"
}
EOF
)

        if [[ "$success" == "true" ]]; then
            invoke_qe_hook "qe:post-test-generation" "$hook_data"
        fi
    fi

    # Store file edit pattern
    store_pattern_fallback "file-edits" "edit-$(date +%s)" \
        "{\"file\":\"$file\",\"domain\":\"$domain\",\"success\":$success}"
}

# Handle command execution hook
handle_command_exec() {
    local command="${1:-}"
    local success="${2:-true}"

    if [[ -z "$command" ]]; then
        return
    fi

    # Detect if it's a test command
    if [[ "$command" == *"npm test"* || "$command" == *"vitest"* || "$command" == *"jest"* ]]; then
        local hook_data=$(cat <<EOF
{
    "runId": "run-$(date +%s)",
    "command": "$command",
    "success": $success,
    "passed": 0,
    "failed": 0,
    "duration": 0
}
EOF
)
        invoke_qe_hook "qe:test-execution-result" "$hook_data"
    fi

    # Detect if it's a coverage command
    if [[ "$command" == *"coverage"* || "$command" == *"nyc"* || "$command" == *"istanbul"* ]]; then
        local hook_data=$(cat <<EOF
{
    "targetPath": ".",
    "command": "$command",
    "success": $success
}
EOF
)
        invoke_qe_hook "qe:post-coverage-analysis" "$hook_data"
    fi
}

# Handle task completion hook
handle_task_complete() {
    local task_id="${1:-}"
    local agent_type="${2:-}"
    local success="${3:-true}"
    local duration="${4:-0}"

    if [[ -z "$task_id" ]]; then
        return
    fi

    local hook_data=$(cat <<EOF
{
    "agentType": "$agent_type",
    "taskId": "$task_id",
    "success": $success,
    "duration": $duration
}
EOF
)

    invoke_qe_hook "qe:agent-completion" "$hook_data"

    # Also store in memory for cross-session learning
    store_pattern_fallback "task-completions" "$task_id" \
        "{\"agent\":\"$agent_type\",\"success\":$success,\"duration\":$duration}"
}

# Handle agent routing hook
handle_agent_routing() {
    local task="${1:-}"
    local task_type="${2:-}"

    if [[ -z "$task" ]]; then
        return
    fi

    local hook_data=$(cat <<EOF
{
    "task": "$task",
    "taskType": "$task_type",
    "capabilities": [],
    "context": {}
}
EOF
)

    invoke_qe_hook "qe:agent-routing" "$hook_data"
}

# Handle pattern learned hook
handle_pattern_learned() {
    local pattern_id="${1:-}"
    local pattern_type="${2:-}"
    local domain="${3:-}"
    local confidence="${4:-0.5}"

    local hook_data=$(cat <<EOF
{
    "patternId": "$pattern_id",
    "patternType": "$pattern_type",
    "domain": "$domain",
    "confidence": $confidence
}
EOF
)

    invoke_qe_hook "qe:pattern-learned" "$hook_data"
}

# Handle quality score hook
handle_quality_score() {
    local score="${1:-0}"
    local coverage="${2:-0}"
    local test_quality="${3:-0}"

    local hook_data=$(cat <<EOF
{
    "score": $score,
    "coverageScore": $coverage,
    "testQualityScore": $test_quality,
    "threshold": 0.8,
    "passed": $([ "$(echo "$score >= 0.8" | bc -l)" = "1" ] && echo "true" || echo "false")
}
EOF
)

    invoke_qe_hook "qe:quality-score" "$hook_data"
}

# Main dispatch
main() {
    check_v3_mode
    check_learning_enabled

    local hook_type="${1:-}"
    shift || true

    case "$hook_type" in
        file-edit)
            handle_file_edit "$@"
            ;;
        command-exec)
            handle_command_exec "$@"
            ;;
        task-complete)
            handle_task_complete "$@"
            ;;
        agent-routing)
            handle_agent_routing "$@"
            ;;
        pattern-learned)
            handle_pattern_learned "$@"
            ;;
        quality-score)
            handle_quality_score "$@"
            ;;
        test-generation)
            invoke_qe_hook "qe:pre-test-generation" "${1:-{}}"
            ;;
        coverage-analysis)
            invoke_qe_hook "qe:pre-coverage-analysis" "${1:-{}}"
            ;;
        *)
            log "WARN" "Unknown hook type: $hook_type"
            ;;
    esac
}

main "$@"
