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

# Default values
DOMAINS_COMPLETED=0
AGENTS_ACTIVE=0
COVERAGE_CURRENT=0
LEARNING_PROGRESS=0
DDD_PROGRESS=0
PATTERNS_COUNT=0

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

# Get v3 test count (more relevant than coverage for v3)
V3_TEST_COUNT=0
V3_TEST_FILE="${PROJECT_DIR}/v3/package.json"
if [ -d "${PROJECT_DIR}/v3/tests" ]; then
  # Count test files
  V3_TEST_FILES=$(find "${PROJECT_DIR}/v3/tests" -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  # Estimate test count (avg 25 tests per file based on our 1171/46 ratio)
  V3_TEST_COUNT=$((V3_TEST_FILES * 25))
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

# Get pattern count from memory database
if [ -f "$MEMORY_DB" ] && command -v sqlite3 &>/dev/null; then
  PATTERNS_COUNT=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM patterns" 2>/dev/null || echo "0")
fi

# Get learning metrics
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
# Show v3 test count (more useful than coverage for v3)
if [ "$V3_TEST_COUNT" -gt 0 ]; then
  OUTPUT="${OUTPUT}    ${BRIGHT_GREEN}✓ ~${V3_TEST_COUNT} tests${RESET}"
elif [ "$COVERAGE_HIDDEN" = "false" ]; then
  OUTPUT="${OUTPUT}    ${COVERAGE_COLOR}📊 Coverage ${COVERAGE_DISPLAY}%${RESET}"
fi

# Line 2: Agent Fleet Status (V3-QE agents only)
ACTIVITY_INDICATOR="${DIM}○${RESET}"
if [ "$AGENTS_ACTIVE" -gt 0 ]; then
  ACTIVITY_INDICATOR="${BRIGHT_GREEN}◉${RESET}"
fi

OUTPUT="${OUTPUT}\n${BRIGHT_YELLOW}🤖 V3-QE Fleet${RESET}  ${ACTIVITY_INDICATOR}[${AGENTS_COLOR}${AGENTS_DISPLAY}${RESET}/${BRIGHT_WHITE}${V3_QE_TARGET}${RESET}]"
OUTPUT="${OUTPUT}    ${LEARNING_COLOR}🧠 Patterns ${PATTERNS_DISPLAY}${RESET}"
OUTPUT="${OUTPUT}    ${CONTEXT_COLOR}📂 Context ${CONTEXT_DISPLAY}%${RESET}"

# Line 3: Architecture Status (dynamically check real implementation)
# ADRs: count sections in the ADR file (## ADR-XXX)
ADR_FILE="${PROJECT_DIR}/v3/implementation/adrs/v3-adrs.md"
if [ -f "$ADR_FILE" ]; then
  ADR_COUNT=$(grep -c "^## ADR-" "$ADR_FILE" 2>/dev/null || echo "0")
else
  ADR_COUNT=0
fi
if [ "$ADR_COUNT" -ge 10 ]; then
  ADR_STATUS="${BRIGHT_GREEN}●${ADR_COUNT}${RESET}"
elif [ "$ADR_COUNT" -ge 1 ]; then
  ADR_STATUS="${YELLOW}◐${ADR_COUNT}${RESET}"
else
  ADR_STATUS="${DIM}○${RESET}"
fi

# Events: green if 5+, yellow if 1-4, dim if 0
EVENT_COUNT=$(find "${PROJECT_DIR}/v3/src" -path "*/events*" -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$EVENT_COUNT" -ge 5 ]; then
  EVENT_STATUS="${BRIGHT_GREEN}●${RESET}"
elif [ "$EVENT_COUNT" -ge 1 ]; then
  EVENT_STATUS="${YELLOW}◐${RESET}"
else
  EVENT_STATUS="${DIM}○${RESET}"
fi

# Plugins: check domain plugins (v3/src/domains/*/plugin.ts)
PLUGIN_COUNT=$(find "${PROJECT_DIR}/v3/src/domains" -name "plugin.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$PLUGIN_COUNT" -ge 10 ]; then
  PLUGIN_STATUS="${BRIGHT_GREEN}●${PLUGIN_COUNT}${RESET}"
elif [ "$PLUGIN_COUNT" -ge 1 ]; then
  PLUGIN_STATUS="${YELLOW}◐${PLUGIN_COUNT}${RESET}"
else
  PLUGIN_STATUS="${DIM}○${RESET}"
fi

# AgentDB: green if memory.db exists and has data
if [ -f "${PROJECT_DIR}/.agentic-qe/memory.db" ]; then
  AGENTDB_STATUS="${BRIGHT_GREEN}●${RESET}"
else
  AGENTDB_STATUS="${DIM}○${RESET}"
fi

OUTPUT="${OUTPUT}\n${BRIGHT_PURPLE}🔧 Architecture${RESET}    ${CYAN}ADR${RESET} ${ADR_STATUS}  ${DIM}│${RESET}  ${CYAN}Events${RESET} ${EVENT_STATUS}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Plugins${RESET} ${PLUGIN_STATUS}  ${DIM}│${RESET}  ${CYAN}AgentDB${RESET} ${AGENTDB_STATUS}"

# Footer
OUTPUT="${OUTPUT}\n${DIM}─────────────────────────────────────────────────────${RESET}"

printf "%b\n" "$OUTPUT"
