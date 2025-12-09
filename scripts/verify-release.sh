#!/bin/bash
#
# Release Verification Script for Agentic QE
#
# Performs end-to-end verification of a release before publishing:
# 1. Creates a fresh test project
# 2. Runs aqe init -y
# 3. Verifies all files are copied correctly
# 4. Tests MCP server starts
# 5. Tests learning capture flow
#
# Usage: npm run verify:release
#        ./scripts/verify-release.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory (for resolving paths)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
TEST_PROJECT="/tmp/aqe-release-verification-$$"
FAILED=0

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Agentic QE Release Verification${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Get version from package.json
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
echo -e "Version: ${YELLOW}$VERSION${NC}"
echo -e "Test project: ${YELLOW}$TEST_PROJECT${NC}"
echo ""

# Cleanup on exit
cleanup() {
  if [ -d "$TEST_PROJECT" ]; then
    rm -rf "$TEST_PROJECT"
  fi
}
trap cleanup EXIT

# Helper function for check results
check_result() {
  local name="$1"
  local result="$2"
  if [ "$result" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} $name"
  else
    echo -e "  ${RED}✗${NC} $name"
    FAILED=1
  fi
}

# ============================================================================
# Step 1: Build the project
# ============================================================================
echo -e "${YELLOW}[1/6] Building project...${NC}"
cd "$PROJECT_ROOT"
npm run build > /dev/null 2>&1
check_result "TypeScript compilation" $?

# ============================================================================
# Step 2: Create test project
# ============================================================================
echo -e "${YELLOW}[2/6] Creating test project...${NC}"
mkdir -p "$TEST_PROJECT"
cd "$TEST_PROJECT"
npm init -y > /dev/null 2>&1
check_result "Test project created" $?

# ============================================================================
# Step 3: Run aqe init -y
# ============================================================================
echo -e "${YELLOW}[3/6] Running aqe init -y...${NC}"
node "$PROJECT_ROOT/dist/cli/index.js" init -y > /tmp/aqe-init-output.txt 2>&1
INIT_RESULT=$?
check_result "aqe init -y completed" $INIT_RESULT

# Verify directories created
[ -d ".agentic-qe" ] && check_result "Directory: .agentic-qe" 0 || check_result "Directory: .agentic-qe" 1
[ -d ".claude" ] && check_result "Directory: .claude" 0 || check_result "Directory: .claude" 1
[ -d "scripts/hooks" ] && check_result "Directory: scripts/hooks" 0 || check_result "Directory: scripts/hooks" 1

# Verify hook scripts copied
[ -f "scripts/hooks/capture-task-learning.js" ] && check_result "Hook: capture-task-learning.js" 0 || check_result "Hook: capture-task-learning.js" 1
[ -f "scripts/hooks/emit-task-spawn.sh" ] && check_result "Hook: emit-task-spawn.sh" 0 || check_result "Hook: emit-task-spawn.sh" 1
[ -f "scripts/hooks/emit-task-complete.sh" ] && check_result "Hook: emit-task-complete.sh" 0 || check_result "Hook: emit-task-complete.sh" 1

# Verify Claude configuration
[ -f ".claude/settings.json" ] && check_result "File: .claude/settings.json" 0 || check_result "File: .claude/settings.json" 1
[ -d ".claude/agents" ] && check_result "Directory: .claude/agents" 0 || check_result "Directory: .claude/agents" 1
[ -d ".claude/skills" ] && check_result "Directory: .claude/skills" 0 || check_result "Directory: .claude/skills" 1
[ -d ".claude/commands" ] && check_result "Directory: .claude/commands" 0 || check_result "Directory: .claude/commands" 1

# Verify database created
[ -f ".agentic-qe/memory.db" ] && check_result "Database: memory.db" 0 || check_result "Database: memory.db" 1

# ============================================================================
# Step 4: Verify MCP server starts
# ============================================================================
echo -e "${YELLOW}[4/6] Testing MCP server...${NC}"
timeout 5 "$PROJECT_ROOT/bin/aqe-mcp" > /tmp/aqe-mcp-output.txt 2>&1 || true
if grep -q "Agentic QE MCP Server started successfully" /tmp/aqe-mcp-output.txt; then
  check_result "MCP server starts" 0

  # Count tools
  TOOL_COUNT=$(grep -o "mcp__agentic_qe__" /tmp/aqe-mcp-output.txt | wc -l)
  if [ "$TOOL_COUNT" -ge 80 ]; then
    check_result "MCP tools available (≥80)" 0
  else
    check_result "MCP tools available (got $TOOL_COUNT, expected ≥80)" 1
  fi
else
  check_result "MCP server starts" 1
fi

# ============================================================================
# Step 5: Test learning capture
# ============================================================================
echo -e "${YELLOW}[5/6] Testing learning capture...${NC}"

# Simulate a Task completion with PostToolUse hook input
HOOK_INPUT='{"tool_name":"Task","tool_input":{"prompt":"Generate unit tests","subagent_type":"qe-test-generator","description":"Test gen"},"tool_response":{"status":"completed","content":[{"text":"Generated 5 unit tests successfully:\n1. test_create\n2. test_update\n3. test_delete\n4. test_read\n5. test_validate"}],"totalDurationMs":2500,"totalTokens":1500,"totalToolUseCount":3,"agentId":"test-gen-001"}}'

# Run the hook with NODE_PATH set to find better-sqlite3
HOOK_OUTPUT=$(echo "$HOOK_INPUT" | NODE_PATH="$PROJECT_ROOT/node_modules" node scripts/hooks/capture-task-learning.js 2>&1)
if echo "$HOOK_OUTPUT" | grep -q "Learning captured"; then
  check_result "Hook captures learning" 0
else
  check_result "Hook captures learning (output: $HOOK_OUTPUT)" 1
fi

# Verify learning status shows data
LEARN_OUTPUT=$(node "$PROJECT_ROOT/dist/cli/index.js" learn status 2>&1)
if echo "$LEARN_OUTPUT" | grep -q "Total Experiences: 1"; then
  check_result "Learning status shows experience" 0
else
  check_result "Learning status shows experience" 1
fi

# ============================================================================
# Step 6: Verify settings.json hooks configuration
# ============================================================================
echo -e "${YELLOW}[6/6] Verifying hooks configuration...${NC}"

# Check PostToolUse hook for Task
if grep -q '"matcher": "Task"' .claude/settings.json && grep -q 'capture-task-learning.js' .claude/settings.json; then
  check_result "PostToolUse hook configured for Task" 0
else
  check_result "PostToolUse hook configured for Task" 1
fi

# Check PreToolUse hook for memory patterns
if grep -q '"matcher": "Write|Edit|MultiEdit"' .claude/settings.json; then
  check_result "PreToolUse hook configured for edits" 0
else
  check_result "PreToolUse hook configured for edits" 1
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}  ✓ All release verification checks passed!${NC}"
  echo -e "${GREEN}  Version $VERSION is ready for release.${NC}"
else
  echo -e "${RED}  ✗ Some checks failed. Please fix before releasing.${NC}"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

exit $FAILED
