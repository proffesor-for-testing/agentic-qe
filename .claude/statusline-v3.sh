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

# v3 Development Targets
DOMAINS_TOTAL=6
AGENTS_TARGET=21
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
if [ -f "$AQE_METRICS" ]; then
  DOMAINS_COMPLETED=$(jq -r '.domains.completed // 0' "$AQE_METRICS" 2>/dev/null || echo "0")
  DDD_PROGRESS=$(jq -r '.ddd.progress // 0' "$AQE_METRICS" 2>/dev/null || echo "0")
  COVERAGE_CURRENT=$(jq -r '.coverage.current // 0' "$AQE_METRICS" 2>/dev/null || echo "0")
else
  # Check for v3 domain directories
  DOMAINS_COMPLETED=0
  [ -d "v3/src/domains/test-generation" ] && ((DOMAINS_COMPLETED++))
  [ -d "v3/src/domains/test-execution" ] && ((DOMAINS_COMPLETED++))
  [ -d "v3/src/domains/coverage-analysis" ] && ((DOMAINS_COMPLETED++))
  [ -d "v3/src/domains/quality-assessment" ] && ((DOMAINS_COMPLETED++))
  [ -d "v3/src/domains/defect-intelligence" ] && ((DOMAINS_COMPLETED++))
  [ -d "v3/src/domains/learning-optimization" ] && ((DOMAINS_COMPLETED++))
fi

# Get pattern count from memory database
if [ -f "$MEMORY_DB" ] && command -v sqlite3 &>/dev/null; then
  PATTERNS_COUNT=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM patterns" 2>/dev/null || echo "0")
fi

# Get learning metrics
if [ -f "$LEARNING_METRICS" ]; then
  LEARNING_PROGRESS=$(jq -r '.improvement // 0' "$LEARNING_METRICS" 2>/dev/null || echo "0")
fi

# Count active QE agents
AGENTS_ACTIVE=$(ps aux 2>/dev/null | grep -E "(qe-|agentic-qe)" | grep -v grep | wc -l | tr -d ' ')
AGENTS_ACTIVE=${AGENTS_ACTIVE:-0}

# Calculate context usage
CONTEXT_PCT=0
CONTEXT_COLOR="${DIM}"
if [ "$CLAUDE_INPUT" != "{}" ]; then
  CONTEXT_REMAINING=$(echo "$CLAUDE_INPUT" | jq '.context_window.remaining_percentage // null' 2>/dev/null)
  if [ "$CONTEXT_REMAINING" != "null" ] && [ -n "$CONTEXT_REMAINING" ]; then
    CONTEXT_PCT=$((100 - CONTEXT_REMAINING))
  fi

  if [ "$CONTEXT_PCT" -lt 50 ]; then
    CONTEXT_COLOR="${BRIGHT_GREEN}"
  elif [ "$CONTEXT_PCT" -lt 75 ]; then
    CONTEXT_COLOR="${BRIGHT_YELLOW}"
  else
    CONTEXT_COLOR="${BRIGHT_RED}"
  fi
fi

# Domain status indicators
COMPLETED_DOMAIN="${BRIGHT_GREEN}●${RESET}"
PENDING_DOMAIN="${DIM}○${RESET}"
DOMAIN_STATUS=""
for i in $(seq 1 $DOMAINS_COMPLETED); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${COMPLETED_DOMAIN}"
done
for i in $(seq $((DOMAINS_COMPLETED + 1)) $DOMAINS_TOTAL); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${PENDING_DOMAIN}"
done

# Coverage status color
COVERAGE_COLOR="${BRIGHT_RED}"
if [ "$COVERAGE_CURRENT" -ge 90 ]; then
  COVERAGE_COLOR="${BRIGHT_GREEN}"
elif [ "$COVERAGE_CURRENT" -ge 70 ]; then
  COVERAGE_COLOR="${BRIGHT_YELLOW}"
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

# Line 1: DDD Domain Progress
OUTPUT="${OUTPUT}\n${BRIGHT_CYAN}🏗️  DDD Domains${RESET}    [${DOMAIN_STATUS}]  ${BRIGHT_GREEN}${DOMAINS_COMPLETED}${RESET}/${BRIGHT_WHITE}${DOMAINS_TOTAL}${RESET}"
OUTPUT="${OUTPUT}    ${COVERAGE_COLOR}📊 Coverage ${COVERAGE_DISPLAY}%${RESET}"

# Line 2: Agent Fleet Status
ACTIVITY_INDICATOR="${DIM}○${RESET}"
if [ "$AGENTS_ACTIVE" -gt 0 ]; then
  ACTIVITY_INDICATOR="${BRIGHT_GREEN}◉${RESET}"
fi

OUTPUT="${OUTPUT}\n${BRIGHT_YELLOW}🤖 QE Fleet${RESET}  ${ACTIVITY_INDICATOR}[${AGENTS_COLOR}${AGENTS_DISPLAY}${RESET}/${BRIGHT_WHITE}${AGENTS_TARGET}${RESET}]"
OUTPUT="${OUTPUT}    ${LEARNING_COLOR}🧠 Patterns ${PATTERNS_DISPLAY}${RESET}"
OUTPUT="${OUTPUT}    ${CONTEXT_COLOR}📂 Context ${CONTEXT_DISPLAY}%${RESET}"

# Line 3: Architecture Status
ADR_STATUS="${BRIGHT_GREEN}●${RESET}"
EVENT_STATUS="${BRIGHT_GREEN}●${RESET}"
PLUGIN_STATUS="${DIM}○${RESET}"

OUTPUT="${OUTPUT}\n${BRIGHT_PURPLE}🔧 Architecture${RESET}    ${CYAN}ADR${RESET} ${ADR_STATUS}  ${DIM}│${RESET}  ${CYAN}Events${RESET} ${EVENT_STATUS}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Plugins${RESET} ${PLUGIN_STATUS}  ${DIM}│${RESET}  ${CYAN}AgentDB${RESET} ${BRIGHT_GREEN}●${RESET}"

# Footer
OUTPUT="${OUTPUT}\n${DIM}─────────────────────────────────────────────────────${RESET}"

printf "%b\n" "$OUTPUT"
