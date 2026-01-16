#!/bin/bash
# Agentic QE v3 Development Status Line
# Shows DDD architecture progress, coverage analysis, learning metrics, security, and performance

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
V3_QE_TARGET=50   # V3-QE specific agents target (47 after cleanup)
COVERAGE_TARGET=90
LEARNING_TARGET=15  # % improvement per sprint
QE_HOOKS_TOTAL=13  # Total QE hook events
FLASH_ATTENTION_TARGET="2.49x-7.47x"  # Performance target

# Default values
DOMAINS_COMPLETED=0
AGENTS_ACTIVE=0
COVERAGE_CURRENT=0
LEARNING_PROGRESS=0
DDD_PROGRESS=0
PATTERNS_COUNT=0
SYNTHESIZED_COUNT=0
LEARNING_EXP=0
LEARNING_MODE="off"
TRANSFER_COUNT=0
UNIT_TESTS=0
INT_TESTS=0
CVE_FIXED=0
CVE_TOTAL=0
SUB_AGENTS=0
INTELLIGENCE_PCT=0

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

# Get v3 test breakdown by type
UNIT_TESTS=0
INT_TESTS=0
if [ -d "${PROJECT_DIR}/v3/tests" ]; then
  UNIT_TESTS=$(find "${PROJECT_DIR}/v3/tests/unit" -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  INT_TESTS=$(find "${PROJECT_DIR}/v3/tests/integration" -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
fi

# Get REAL test coverage from coverage reports
COVERAGE_FILE="${PROJECT_DIR}/coverage/coverage-summary.json"
if [ -f "$COVERAGE_FILE" ]; then
  COVERAGE_CURRENT=$(jq -r '.total.lines.pct // 0' "$COVERAGE_FILE" 2>/dev/null | awk '{printf "%.0f", $1}')
  COVERAGE_CURRENT=${COVERAGE_CURRENT:-0}
else
  COVERAGE_CURRENT=-1
fi

# Get pattern count and learning metrics from memory database
# Include BOTH patterns and synthesized_patterns for accurate count
if [ -f "$MEMORY_DB" ] && command -v sqlite3 &>/dev/null; then
  PATTERNS_COUNT=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM patterns" 2>/dev/null || echo "0")
  SYNTHESIZED_COUNT=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM synthesized_patterns" 2>/dev/null || echo "0")
  LEARNING_EXP=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM learning_experiences" 2>/dev/null || echo "0")
  TRANSFER_COUNT=$(sqlite3 "$MEMORY_DB" "SELECT COUNT(*) FROM transfer_registry" 2>/dev/null || echo "0")
  PATTERN_SUCCESS=$(sqlite3 "$MEMORY_DB" "SELECT ROUND(AVG(success_rate)*100) FROM patterns WHERE success_rate > 0" 2>/dev/null || echo "0")

  # Calculate intelligence % based on learning experiences and patterns
  # Target: 1000 experiences = 100% intelligence
  if [ "$LEARNING_EXP" -gt 0 ]; then
    INTELLIGENCE_PCT=$((LEARNING_EXP * 100 / 1000))
    [ "$INTELLIGENCE_PCT" -gt 100 ] && INTELLIGENCE_PCT=100
  fi
fi
# Total patterns = patterns + synthesized
TOTAL_PATTERNS=$((PATTERNS_COUNT + SYNTHESIZED_COUNT))

# Get CVE status from claude-flow security (cached for performance)
CVE_CACHE="${PROJECT_DIR}/.agentic-qe/.cve-cache"
CVE_CACHE_AGE=3600  # Refresh every hour
if [ -f "$CVE_CACHE" ]; then
  CACHE_TIME=$(stat -c %Y "$CVE_CACHE" 2>/dev/null || stat -f %m "$CVE_CACHE" 2>/dev/null || echo "0")
  CURRENT_TIME=$(date +%s)
  if [ $((CURRENT_TIME - CACHE_TIME)) -lt $CVE_CACHE_AGE ]; then
    CVE_DATA=$(cat "$CVE_CACHE")
    CVE_TOTAL=$(echo "$CVE_DATA" | jq -r '.total // 0' 2>/dev/null || echo "0")
    CVE_FIXED=$(echo "$CVE_DATA" | jq -r '.fixed // 0' 2>/dev/null || echo "0")
  fi
fi
# If no cache or expired, try to get fresh data (but don't block on it)
if [ "$CVE_TOTAL" -eq 0 ]; then
  # Quick check - parse from npx output if available
  CVE_OUTPUT=$(timeout 2 npx @claude-flow/cli@latest security cve --list 2>/dev/null || echo "")
  if [ -n "$CVE_OUTPUT" ]; then
    CVE_TOTAL=$(echo "$CVE_OUTPUT" | grep -c "CVE-" || echo "0")
    CVE_FIXED=$(echo "$CVE_OUTPUT" | grep -c "Fixed" || echo "0")
    # Cache the result
    mkdir -p "${PROJECT_DIR}/.agentic-qe"
    echo "{\"total\": $CVE_TOTAL, \"fixed\": $CVE_FIXED, \"updated\": \"$(date -Iseconds)\"}" > "$CVE_CACHE" 2>/dev/null
  fi
fi
CVE_UNFIXED=$((CVE_TOTAL - CVE_FIXED))

# Get sub-agents count from Claude Code JSON
if [ "$CLAUDE_INPUT" != "{}" ]; then
  SUB_AGENTS=$(echo "$CLAUDE_INPUT" | jq -r '.agents.active_count // 0' 2>/dev/null || echo "0")
  [ "$SUB_AGENTS" = "null" ] && SUB_AGENTS=0
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

# Count V3-QE agent definitions only
# Note: Agents were renamed from v3-qe-*.md to qe-*.md pattern
AGENTS_DIR="${PROJECT_DIR}/.claude/agents"
if [ -d "$AGENTS_DIR/v3" ]; then
  V3_QE_AGENTS=$(find "$AGENTS_DIR/v3" -name "qe-*.md" 2>/dev/null | wc -l | tr -d ' ')
else
  V3_QE_AGENTS=0
fi
AGENTS_ACTIVE=${V3_QE_AGENTS:-0}

# Calculate context usage from actual token fields
CONTEXT_PCT=0
CONTEXT_COLOR="${DIM}"
if [ "$CLAUDE_INPUT" != "{}" ]; then
  INPUT_TOKENS=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.current_usage.input_tokens // 0' 2>/dev/null)
  CACHE_CREATE=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0' 2>/dev/null)
  CACHE_READ=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0' 2>/dev/null)
  WINDOW_SIZE=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.context_window_size // 0' 2>/dev/null)

  if [ "$WINDOW_SIZE" -gt 0 ] 2>/dev/null; then
    CURRENT_TOKENS=$((INPUT_TOKENS + CACHE_CREATE + CACHE_READ))
    CONTEXT_PCT=$((CURRENT_TOKENS * 100 / WINDOW_SIZE))
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
IN_PROGRESS_DOMAIN="${YELLOW}◐${RESET}"
PENDING_DOMAIN="${DIM}○${RESET}"
DOMAIN_STATUS=""
for i in $(seq 1 $DOMAINS_COMPLETED); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${COMPLETED_DOMAIN}"
done
for i in $(seq 1 $DOMAINS_IN_PROGRESS); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${IN_PROGRESS_DOMAIN}"
done
DOMAINS_EMPTY=$((DOMAINS_TOTAL - DOMAINS_COMPLETED - DOMAINS_IN_PROGRESS))
for i in $(seq 1 $DOMAINS_EMPTY); do
  DOMAIN_STATUS="${DOMAIN_STATUS}${PENDING_DOMAIN}"
done

# CVE status color
CVE_COLOR="${BRIGHT_GREEN}"
CVE_ICON="🟢"
if [ "$CVE_UNFIXED" -gt 0 ]; then
  CVE_COLOR="${BRIGHT_RED}"
  CVE_ICON="🔴"
elif [ "$CVE_TOTAL" -eq 0 ]; then
  CVE_COLOR="${DIM}"
  CVE_ICON="⚪"
fi

# Intelligence status color
INTEL_COLOR="${DIM}"
if [ "$INTELLIGENCE_PCT" -ge 50 ]; then
  INTEL_COLOR="${BRIGHT_GREEN}"
elif [ "$INTELLIGENCE_PCT" -ge 25 ]; then
  INTEL_COLOR="${BRIGHT_YELLOW}"
elif [ "$INTELLIGENCE_PCT" -gt 0 ]; then
  INTEL_COLOR="${YELLOW}"
fi

# Coverage status color
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
PATTERNS_DISPLAY=$(printf "%4d" "$TOTAL_PATTERNS")
AGENTS_DISPLAY=$(printf "%2d" "$AGENTS_ACTIVE")
INTEL_DISPLAY=$(printf "%3d" "$INTELLIGENCE_PCT")

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
OUTPUT="${OUTPUT}\n${DIM}─────────────────────────────────────────────────────────────────${RESET}"

# Line 1: DDD Domain Progress + Flash Attention target
OUTPUT="${OUTPUT}\n${BRIGHT_CYAN}🏗️  DDD Domains${RESET}    [${DOMAIN_STATUS}]  ${BRIGHT_GREEN}${DOMAINS_COMPLETED}${RESET}"
if [ "$DOMAINS_IN_PROGRESS" -gt 0 ]; then
  OUTPUT="${OUTPUT}+${YELLOW}${DOMAINS_IN_PROGRESS}${RESET}"
fi
OUTPUT="${OUTPUT}/${BRIGHT_WHITE}${DOMAINS_TOTAL}${RESET}"
# Flash Attention speedup indicator
OUTPUT="${OUTPUT}    ${BRIGHT_YELLOW}⚡ 1.0x${RESET} ${DIM}→${RESET} ${BRIGHT_YELLOW}${FLASH_ATTENTION_TARGET}${RESET}"

# Line 2: Agent Fleet Status + Security
ACTIVITY_INDICATOR="${DIM}○${RESET}"
if [ "$AGENTS_ACTIVE" -gt 0 ]; then
  ACTIVITY_INDICATOR="${BRIGHT_GREEN}◉${RESET}"
fi

OUTPUT="${OUTPUT}\n${BRIGHT_YELLOW}🤖 V3-QE Fleet${RESET}  ${ACTIVITY_INDICATOR}[${AGENTS_COLOR}${AGENTS_DISPLAY}${RESET}/${BRIGHT_WHITE}${V3_QE_TARGET}${RESET}]"
OUTPUT="${OUTPUT}  ${BRIGHT_PURPLE}👥${RESET}${WHITE}${SUB_AGENTS}${RESET}"
OUTPUT="${OUTPUT}    ${CVE_COLOR}${CVE_ICON} CVE ${CVE_FIXED}/${CVE_TOTAL}${RESET}"
OUTPUT="${OUTPUT}    ${INTEL_COLOR}🧠 ${INTEL_DISPLAY}%${RESET}"
OUTPUT="${OUTPUT}    ${CONTEXT_COLOR}📂 ${CONTEXT_DISPLAY}%${RESET}"

# Line 3: Learning Status (patterns now include synthesized)
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
OUTPUT="${OUTPUT}\n${BRIGHT_PURPLE}🎓 Learning${RESET}     ${CYAN}Patterns${RESET} ${WHITE}${PATTERNS_DISPLAY}${RESET}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Exp${RESET} ${WHITE}${EXP_DISPLAY}${RESET}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Mode${RESET} ${LEARNING_MODE_COLOR}${LEARNING_MODE_INDICATOR}${LEARNING_MODE}${RESET}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}Transfer${RESET} ${TRANSFER_COLOR}${TRANSFER_INDICATOR}${TRANSFER_COUNT}${RESET}"

# Line 4: Architecture Status
ADR_DIR="${PROJECT_DIR}/v3/implementation/adrs"
ADR_FILE="${ADR_DIR}/v3-adrs.md"
ADR_COUNT=0
ADR_ACCEPTED=0
ADR_PROPOSED=0
if [ -d "$ADR_DIR" ]; then
  # Get unique ADR numbers from embedded file
  EMBEDDED_NUMS=$(grep -oE "^## ADR-[0-9]+" "$ADR_FILE" 2>/dev/null | grep -oE "[0-9]+" | sort -u)
  # Get unique ADR numbers from standalone files
  STANDALONE_NUMS=$(find "$ADR_DIR" -maxdepth 1 -name "ADR-0*.md" 2>/dev/null | grep -oE "ADR-[0-9]+" | grep -oE "[0-9]+" | sort -u)
  # Combine and deduplicate
  ALL_ADRS=$(echo -e "${EMBEDDED_NUMS}\n${STANDALONE_NUMS}" | sort -u | grep -v "^$")
  ADR_COUNT=$(echo "$ALL_ADRS" | grep -c "." 2>/dev/null || echo "0")

  # Count statuses from embedded ADRs (primary source)
  ADR_ACCEPTED=$(grep -E "^\*\*Status:\*\* Accepted" "$ADR_FILE" 2>/dev/null | wc -l | tr -d ' ')
  ADR_PROPOSED=$(grep -E "^\*\*Status:\*\* Proposed" "$ADR_FILE" 2>/dev/null | wc -l | tr -d ' ')

  # Also check standalone files for status
  for adr_file in "$ADR_DIR"/ADR-0*.md; do
    if [ -f "$adr_file" ]; then
      # Only count if not already in embedded (check by ADR number)
      ADR_NUM=$(basename "$adr_file" | grep -oE "[0-9]+")
      if ! echo "$EMBEDDED_NUMS" | grep -q "^${ADR_NUM}$"; then
        if grep -qE "^\*\*Status:\*\* Accepted" "$adr_file" 2>/dev/null; then
          ((ADR_ACCEPTED++))
        elif grep -qE "^\*\*Status:\*\* Proposed" "$adr_file" 2>/dev/null; then
          ((ADR_PROPOSED++))
        fi
      fi
    fi
  done
fi

# Color based on status: green=all accepted, yellow=some proposed, dim=none
if [ "$ADR_COUNT" -eq 0 ]; then
  ADR_STATUS="${DIM}○0${RESET}"
elif [ "$ADR_PROPOSED" -eq 0 ]; then
  ADR_STATUS="${BRIGHT_GREEN}●${ADR_COUNT}${RESET}"
elif [ "$ADR_ACCEPTED" -gt "$ADR_PROPOSED" ]; then
  ADR_STATUS="${YELLOW}◐${ADR_COUNT}${RESET} ${DIM}(${ADR_PROPOSED}P)${RESET}"
else
  ADR_STATUS="${YELLOW}○${ADR_COUNT}${RESET} ${DIM}(${ADR_PROPOSED}P)${RESET}"
fi

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

if [ "$DOMAINS_COMPLETED" -ge 10 ]; then
  DOMAINS_STATUS="${BRIGHT_GREEN}●${DOMAINS_COMPLETED}${RESET}"
elif [ "$DOMAINS_COMPLETED" -ge 5 ]; then
  DOMAINS_STATUS="${YELLOW}◐${DOMAINS_COMPLETED}${RESET}"
else
  DOMAINS_STATUS="${DIM}○${DOMAINS_COMPLETED}${RESET}"
fi

AGENTDB_SIZE=""
if [ -f "${PROJECT_DIR}/.agentic-qe/memory.db" ]; then
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

# Show test counts on architecture line
TEST_STATUS=""
if [ "$UNIT_TESTS" -gt 0 ] || [ "$INT_TESTS" -gt 0 ]; then
  TEST_STATUS="  ${DIM}│${RESET}  ${CYAN}Tests${RESET} ${BRIGHT_GREEN}U${WHITE}${UNIT_TESTS}${RESET}/${BRIGHT_CYAN}I${WHITE}${INT_TESTS}${RESET}"
fi

OUTPUT="${OUTPUT}\n${BRIGHT_PURPLE}🔧 Architecture${RESET}    ${CYAN}ADR${RESET} ${ADR_STATUS}  ${DIM}│${RESET}  ${CYAN}Hooks${RESET} ${HOOKS_STATUS}"
OUTPUT="${OUTPUT}  ${DIM}│${RESET}  ${CYAN}AgentDB${RESET} ${AGENTDB_STATUS}${TEST_STATUS}"

# Footer
OUTPUT="${OUTPUT}\n${DIM}─────────────────────────────────────────────────────────────────${RESET}"

printf "%b\n" "$OUTPUT"
