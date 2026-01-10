#!/bin/bash
# Agentic QE v3 Development Status Line
# Shows DDD architecture progress, coverage analysis, and learning metrics

# Read Claude Code JSON input from stdin (if available)
CLAUDE_INPUT=$(cat 2>/dev/null || echo "{}")

# Get project directory from Claude Code input or use current directory
PROJECT_DIR=$(echo "$CLAUDE_INPUT" | jq -r '.workspace.project_dir // ""' 2>/dev/null)
if [ -z "$PROJECT_DIR" ] || [ "$PROJECT_DIR" = "null" ]; then
  PROJECT_DIR=$(pwd)
fi

# File paths
AQE_METRICS="${PROJECT_DIR}/.agentic-qe/metrics/v3-progress.json"
MEMORY_DB="${PROJECT_DIR}/.agentic-qe/memory.db"
LEARNING_METRICS="${PROJECT_DIR}/.agentic-qe/metrics/learning.json"

# ANSI Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Bright colors
BRIGHT_RED='\033[1;31m'
BRIGHT_GREEN='\033[1;32m'
BRIGHT_YELLOW='\033[1;33m'
BRIGHT_BLUE='\033[1;34m'
BRIGHT_PURPLE='\033[1;35m'
BRIGHT_CYAN='\033[1;36m'

# v3 Development Targets (12 DDD Domains, V3-QE agent fleet)
DOMAINS_TOTAL=12
V3_QE_TARGET=80   # V3-QE specific agents target
COVERAGE_TARGET=90
LEARNING_TARGET=15  # % improvement per sprint
QE_HOOKS_TOTAL=13  # Total QE hook events

# Default values
DOMAINS_COMPLETED=0
AGENTS_ACTIVE=0
COVERAGE_CURRENT=0
LEARNING_PROGRESS=0
DDD_PROGRESS=0
PATTERNS_COUNT=0
LEARNING_EXP=0
LEARNING_MODE="off"
TRANSFER_COUNT=0
UNIT_TESTS=0
INT_TESTS=0

# Get current git branch
GIT_BRANCH=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
fi

# Get GitHub username
GH_USER=""
if command -v gh >/dev/null 2>&1; then
  GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")
fi
if [ -z "$GH_USER" ]; then
  GH_USER=$(git config user.name 2>/dev/null || echo "developer")
fi

# Check v3 domain implementation progress
# A domain is "implemented" if it has at least 3 TypeScript files (not just scaffolding)
# Scaffolding = 0-1 files, In Progress = 2 files, Implemented = 3+ files
DOMAINS_COMPLETED=0
DOMAINS_IN_PROGRESS=0
V3_DOMAINS="test-generation test-execution coverage-analysis quality-assessment defect-intelligence requirements-validation code-intelligence security-compliance contract-testing visual-accessibility chaos-resilience learning-optimization"

for domain in $V3_DOMAINS; do
  domain_dir="${PROJECT_DIR}/v3/src/domains/$domain"
  if [ -d "$domain_dir" ]; then
    ts_count=$(find "$domain_dir" -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$ts_count" -ge 3 ]; then
      ((DOMAINS_COMPLETED++))
    elif [ "$ts_count" -ge 1 ]; then
      ((DOMAINS_IN_PROGRESS++))
    fi
  fi
done

# Get v3 test breakdown by type (more actionable than total count)
UNIT_TESTS=0
INT_TESTS=0
if [ -d "${PROJECT_DIR}/v3/tests" ]; then
  # Count unit test files
  UNIT_TESTS=$(find "${PROJECT_DIR}/v3/tests/unit" -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  # Count integration test files
  INT_TESTS=$(find "${PROJECT_DIR}/v3/tests/integration" -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
fi

# Get REAL test coverage from coverage reports (dynamic, not hardcoded)
COVERAGE_FILE="${PROJECT_DIR}/coverage/coverage-summary.json"
if [ -f "$COVERAGE_FILE" ]; then
  # Read actual line coverage percentage from Jest/Istanbul reports
  COVERAGE_CURRENT=$(jq -r '.total.lines.pct // 0' "$COVERAGE_FILE" 2>/dev/null | awk '{printf "%.0f", $1}')
  COVERAGE_CURRENT=${COVERAGE_CURRENT:-0}
else
  # No coverage data - will hide metric
  COVERAGE_CURRENT=-1
fi

# Get pattern count and learning metrics from memory database
if [ -f "$MEMORY_DB" ] && command -v sqlite3 &>/dev/null; then
  PATTERNS_COUNT=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM patterns" 2>/dev/null || echo "0")
  LEARNING_EXP=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM learning_experiences" 2>/dev/null || echo "0")
  TRANSFER_COUNT=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM transfer_registry" 2>/dev/null || echo "0")
  # Get success rate from patterns if available
  PATTERN_SUCCESS=$(sqlite3 "$MEMORY_DB" "SELECT ROUND(AVG(success_rate)*100) FROM patterns WHERE success_rate > 0" 2>/dev/null || echo "0")
fi

# Get learning mode from config
LEARNING_CONFIG="${PROJECT_DIR}/.agentic-qe/learning-config.json"
if [ -f "$LEARNING_CONFIG" ]; then
  LEARNING_MODE=$(jq -r '.scheduler.mode // "off"' "$LEARNING_CONFIG" 2>/dev/null || echo "off")
  LEARNING_ENABLED=$(jq -r '.enabled // false' "$LEARNING_CONFIG" 2>/dev/null || echo "false")
  if [ "$LEARNING_ENABLED" != "true" ]; then
    LEARNING_MODE="off"
  fi
fi

# Get learning metrics (legacy)
if [ -f "$LEARNING_METRICS" ]; then
  LEARNING_PROGRESS=$(jq -r '.improvement // 0' "$LEARNING_METRICS" 2>/dev/null || echo "0")
fi

# Count V3-QE agent definitions only (v3-qe-* agents in v3/ directory)
# This shows V3-specific QE agents, not legacy or generic agents
AGENTS_DIR="${PROJECT_DIR}/.claude/agents"
if [ -d "$AGENTS_DIR/v3" ]; then
  # Count V3-QE agent files only
  V3_QE_AGENTS=$(find "$AGENTS_DIR/v3" -name "v3-qe-*.md" 2>/dev/null | wc -l | tr -d ' ')
else
  V3_QE_AGENTS=0
fi
AGENTS_ACTIVE=${V3_QE_AGENTS:-0}

# Calculate context usage from actual token fields
CONTEXT_PCT=0
CONTEXT_COLOR="${DIM}"
if [ "$CLAUDE_INPUT" != "{}" ]; then
  # Get token counts from Claude Code JSON
  INPUT_TOKENS=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.current_usage.input_tokens // 0' 2>/dev/null)
  CACHE_CREATE=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0' 2>/dev/null)
  CACHE_READ=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0' 2>/dev/null)
  WINDOW_SIZE=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.context_window_size // 0' 2>/dev/null)

  # Calculate percentage: (current_tokens / window_size) * 100
  if [ "$WINDOW_SIZE" -gt 0 ] 2>/dev/null; then
    CURRENT_TOKENS=$((INPUT_TOKENS + CACHE_CREATE + CACHE_READ))
    CONTEXT_PCT=$((CURRENT_TOKENS * 100 / WINDOW_SIZE))
  fi

  # Color based on usage
  if [ "$CONTEXT_PCT" -lt 50 ]; then
    CONTEXT_COLOR="${BRIGHT_GREEN}"
  elif [ "$CONTEXT_PCT" -lt 75 ]; then
    CONTEXT_COLOR="${BRIGHT_YELLOW}"
  else
    CONTEXT_COLOR="${BRIGHT_RED}"
  fi
fi

# Domain status indicators (3 states: completed, in-progress, empty)
COMPLETED_DOMAIN="${BRIGHT_GREEN}●${RESET}"
IN_PROGRESS_DOMAIN="${YELLOW}◐${RESET}"
PENDING_DOMAIN="${DIM}○${RESET}"
DOMAIN_STATUS=""
# Show completed domains (green)
for i in $(seq 1 $DOMAINS_COMPLETED); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${COMPLETED_DOMAIN}"
done
# Show in-progress domains (yellow)
for i in $(seq 1 $DOMAINS_IN_PROGRESS); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${IN_PROGRESS_DOMAIN}"
done
# Show empty/pending domains (dim)
DOMAINS_EMPTY=$((DOMAINS_TOTAL - DOMAINS_COMPLETED - DOMAINS_IN_PROGRESS))
for i in $(seq 1 $DOMAINS_EMPTY); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${PENDING_DOMAIN}"
done

# Coverage status color (handle -1 = no data)
COVERAGE_COLOR="${BRIGHT_RED}"
COVERAGE_HIDDEN=false
if [ "$COVERAGE_CURRENT" -lt 0 ]; then
  COVERAGE_HIDDEN=true
elif [ "$COVERAGE_CURRENT" -ge 90 ]; then
  COVERAGE_COLOR="${BRIGHT_GREEN}"
elif [ "$COVERAGE_CURRENT" -ge 70 ]; then
  COVERAGE_COLOR="${BRIGHT_YELLOW}"
elif [ "$COVERAGE_CURRENT" -ge 50 ]; then
  COVERAGE_COLOR="${YELLOW}"
fi

# Learning status color
LEARNING_COLOR="${BRIGHT_CYAN}"
if [ "$LEARNING_PROGRESS" -ge "$LEARNING_TARGET" ]; then
  LEARNING_COLOR="${BRIGHT_GREEN}"
fi

# Agents status color
AGENTS_COLOR="${BRIGHT_GREEN}"
if [ "$AGENTS_ACTIVE" -lt 5 ]; then
  AGENTS_COLOR="${YELLOW}"
fi
if [ "$AGENTS_ACTIVE" -eq 0 ]; then
  AGENTS_COLOR="${DIM}"
fi

# Format values with padding
COVERAGE_DISPLAY=$(printf "%3d" "$COVERAGE_CURRENT")
CONTEXT_DISPLAY=$(printf "%3d" "$CONTEXT_PCT")
PATTERNS_DISPLAY=$(printf "%5d" "$PATTERNS_COUNT")
AGENTS_DISPLAY=$(printf "%2d" "$AGENTS_ACTIVE")

# Get model name
MODEL_NAME=""
if [ "$CLAUDE_INPUT" != "{}" ]; then
  MODEL_NAME=$(echo "$CLAUDE_INPUT" | jq -r '.model.display_name // ""' 2>/dev/null)
fi

# Build output
OUTPUT=""

# Header Line
OUTPUT="${BOLD}${BRIGHT_PURPLE}▊ Agentic QE v3 ${RESET}"
OUTPUT="${OUTPUT}${BRIGHT_CYAN}${GH_USER}${RESET}"
if [ -n "$GIT_BRANCH" ]; then
  OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${BRIGHT_BLUE}⎇ ${GIT_BRANCH}${RESET}"
fi
if [ -n "$MODEL_NAME" ]; then
  OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${PURPLE}${MODEL_NAME}${RESET}"
fi

# Separator
OUTPUT="${OUTPUT}\n${DIM}─────────────────────────────────────────────────────${RESET}"

# Line 1: DDD Domain Progress (show completed/in-progress/total)
OUTPUT="${OUTPUT}\n${BRIGHT_CYAN}🏗️  DDD Domains${RESET}    [${DOMAIN_STATUS}]  ${BRIGHT_GREEN}${DOMAINS_COMPLETED}${RESET}"
if [ "$DOMAINS_IN_PROGRESS" -gt 0 ]; then
  OUTPUT="${OUTPUT}+${YELLOW}${DOMAINS_IN_PROGRESS}${RESET}"
fi
OUTPUT="${OUTPUT}/${BRIGHT_WHITE}${DOMAINS_TOTAL}${RESET}"
# Show test type breakdown (more actionable than total count)
if [ "$UNIT_TESTS" -gt 0 ] || [ "$INT_TESTS" -gt 0 ]; then
  OUTPUT="${OUTPUT}    ${BRIGHT_GREEN}📊 Unit${RESET} ${WHITE}${UNIT_TESTS}${RESET}"
  OUTPUT="${OUTPUT} ${DIM}│${RESET} ${BRIGHT_CYAN}Int${RESET} ${WHITE}${INT_TESTS}${RESET}"
fi

# Line 2: Agent Fleet Status (V3-QE agents only)
ACTIVITY_INDICATOR="${DIM}○${RESET}"
if [ "$AGENTS_ACTIVE" -gt 0 ]; then
  ACTIVITY_INDICATOR="${BRIGHT_GREEN}◉${RESET}"
fi

OUTPUT="${OUTPUT}\n${BRIGHT_YELLOW}🤖 V3-QE Fleet${RESET}  ${ACTIVITY_INDICATOR}[${AGENTS_COLOR}${AGENTS_DISPLAY}${RESET}/${BRIGHT_WHITE}${V3_QE_TARGET}${RESET}]"
OUTPUT="${OUTPUT}    ${LEARNING_COLOR}🧠 Patterns ${PATTERNS_DISPLAY}${RESET}"
OUTPUT="${OUTPUT}    ${CONTEXT_COLOR}📂 Context ${CONTEXT_DISPLAY}%${RESET}"

# Line 3: Learning Status
LEARNING_MODE_COLOR="${DIM}"
LEARNING_MODE_INDICATOR="○"
if [ "$LEARNING_MODE" = "continuous" ]; then
  LEARNING_MODE_COLOR="${BRIGHT_GREEN}"
  LEARNING_MODE_INDICATOR="●"
elif [ "$LEARNING_MODE" = "scheduled" ]; then
  LEARNING_MODE_COLOR="${YELLOW}"
  LEARNING_MODE_INDICATOR="◐"
fi

TRANSFER_COLOR="${DIM}"
TRANSFER_INDICATOR="○"
if [ "$TRANSFER_COUNT" -gt 10 ]; then
  TRANSFER_COLOR="${BRIGHT_GREEN}"
  TRANSFER_INDICATOR="●"
elif [ "$TRANSFER_COUNT" -gt 0 ]; then
  TRANSFER_COLOR="${YELLOW}"
  TRANSFER_INDICATOR="◐"
fi

EXP_DISPLAY=$(printf "%4d" "$LEARNING_EXP")
OUTPUT="${OUTPUT}\n${BRIGHT_PURPLE}🎓 Learning${RESET}     ${CYAN}Exp${RESET} ${WHITE}${EXP_DISPLAY}${RESET}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Mode${RESET} ${LEARNING_MODE_COLOR}${LEARNING_MODE_INDICATOR}${LEARNING_MODE}${RESET}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Transfer${RESET} ${TRANSFER_COLOR}${TRANSFER_INDICATOR}${TRANSFER_COUNT}${RESET}"

# Line 4: Architecture Status (dynamically check real implementation)
# ADRs: count embedded sections + standalone ADR files (deduplicated)
ADR_DIR="${PROJECT_DIR}/v3/implementation/adrs"
ADR_FILE="${ADR_DIR}/v3-adrs.md"
ADR_COUNT=0
if [ -d "$ADR_DIR" ]; then
  # Count embedded ADRs in v3-adrs.md
  EMBEDDED_ADRS=$(grep -c "^## ADR-" "$ADR_FILE" 2>/dev/null || echo "0")
  # Count standalone ADR files (ADR-0XX-*.md)
  STANDALONE_ADRS=$(find "$ADR_DIR" -maxdepth 1 -name "ADR-0*.md" 2>/dev/null | wc -l | tr -d ' ')
  # Total (standalone files are typically newer, not in v3-adrs.md yet)
  ADR_COUNT=$((EMBEDDED_ADRS + STANDALONE_ADRS))
fi
if [ "$ADR_COUNT" -ge 20 ]; then
  ADR_STATUS="${BRIGHT_GREEN}●${ADR_COUNT}${RESET}"
elif [ "$ADR_COUNT" -ge 10 ]; then
  ADR_STATUS="${YELLOW}◐${ADR_COUNT}${RESET}"
else
  ADR_STATUS="${DIM}○${ADR_COUNT}${RESET}"
fi

# QE Hooks: count hook files in .claude/hooks
HOOKS_DIR="${PROJECT_DIR}/.claude/hooks"
HOOKS_COUNT=0
if [ -d "$HOOKS_DIR" ]; then
  HOOKS_COUNT=$(find "$HOOKS_DIR" -name "*.sh" -o -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
fi
if [ "$HOOKS_COUNT" -ge 2 ]; then
  HOOKS_STATUS="${BRIGHT_GREEN}●${HOOKS_COUNT}${RESET}"
elif [ "$HOOKS_COUNT" -ge 1 ]; then
  HOOKS_STATUS="${YELLOW}◐${HOOKS_COUNT}${RESET}"
else
  HOOKS_STATUS="${DIM}○${RESET}"
fi

# Domains: count implemented domains
if [ "$DOMAINS_COMPLETED" -ge 10 ]; then
  DOMAINS_STATUS="${BRIGHT_GREEN}●${DOMAINS_COMPLETED}${RESET}"
elif [ "$DOMAINS_COMPLETED" -ge 5 ]; then
  DOMAINS_STATUS="${YELLOW}◐${DOMAINS_COMPLETED}${RESET}"
else
  DOMAINS_STATUS="${DIM}○${DOMAINS_COMPLETED}${RESET}"
fi

# AgentDB: green if memory.db exists and has data
AGENTDB_SIZE=""
if [ -f "${PROJECT_DIR}/.agentic-qe/memory.db" ]; then
  # Get size in MB
  DB_SIZE_KB=$(du -k "${PROJECT_DIR}/.agentic-qe/memory.db" 2>/dev/null | cut -f1)
  if [ "$DB_SIZE_KB" -gt 1024 ]; then
    DB_SIZE_MB=$((DB_SIZE_KB / 1024))
    AGENTDB_SIZE="${DB_SIZE_MB}M"
  else
    AGENTDB_SIZE="${DB_SIZE_KB}K"
  fi
  AGENTDB_STATUS="${BRIGHT_GREEN}●${AGENTDB_SIZE}${RESET}"
else
  AGENTDB_STATUS="${DIM}○${RESET}"
fi

OUTPUT="${OUTPUT}\n${BRIGHT_PURPLE}🔧 Architecture${RESET}    ${CYAN}ADR${RESET} ${ADR_STATUS}  ${DIM}│${RESET}  ${CYAN}Hooks${RESET} ${HOOKS_STATUS}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Domains${RESET} ${DOMAINS_STATUS}  ${DIM}│${RESET}  ${CYAN}AgentDB${RESET} ${AGENTDB_STATUS}"

# Footer
OUTPUT="${OUTPUT}\n${DIM}─────────────────────────────────────────────────────${RESET}"

printf "%b\n" "$OUTPUT"
