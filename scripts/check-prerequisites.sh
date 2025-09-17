#!/bin/bash

# Agentic QE Framework - Prerequisites Checker
# This script checks if all required components are installed

echo "================================================"
echo "   Agentic QE Framework - Prerequisites Check  "
echo "================================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track if all prerequisites are met
ALL_GOOD=true

# Check Node.js version
echo -e "${BLUE}1. Checking Node.js version...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        echo -e "   ${GREEN}✓${NC} Node.js $NODE_VERSION installed"
    else
        echo -e "   ${RED}✗${NC} Node.js $NODE_VERSION is too old (requires v18+)"
        ALL_GOOD=false
    fi
else
    echo -e "   ${RED}✗${NC} Node.js not installed"
    echo "   Install from: https://nodejs.org"
    ALL_GOOD=false
fi
echo ""

# Check Claude Code
echo -e "${BLUE}2. Checking Claude Code...${NC}"
if [ -f "CLAUDE.md" ]; then
    echo -e "   ${GREEN}✓${NC} Claude Code configured (CLAUDE.md found)"
else
    echo -e "   ${YELLOW}⚠${NC}  CLAUDE.md not found"
    echo "   Claude Code configuration file is missing"
    echo "   Add CLAUDE.md to configure Claude Code for this project"
    # Not marking as failed since this is a warning
fi
echo ""

# Check AQE initialization
echo -e "${BLUE}3. Checking AQE initialization...${NC}"
if [ -f "qe.config.json" ]; then
    echo -e "   ${GREEN}✓${NC} AQE Framework initialized"
    if [ -d "agents" ]; then
        AGENT_COUNT=$(ls -1 agents/ 2>/dev/null | wc -l)
        echo -e "   ${GREEN}✓${NC} $AGENT_COUNT agents available"
    fi
else
    echo -e "   ${YELLOW}⚠${NC}  AQE not initialized in this project"
    echo "   Run: aqe init"
fi
echo ""

# Check Claude-Flow
echo -e "${BLUE}4. Checking Claude-Flow...${NC}"
if npx claude-flow@alpha --version &> /dev/null; then
    FLOW_VERSION=$(npx claude-flow@alpha --version 2>&1 | head -1)
    echo -e "   ${GREEN}✓${NC} Claude-Flow installed: $FLOW_VERSION"

    # Check if swarm is initialized
    echo -e "${BLUE}   Checking swarm status...${NC}"
    if npx claude-flow@alpha swarm status &> /dev/null; then
        echo -e "   ${GREEN}✓${NC} Claude-Flow swarm is initialized"
    else
        echo -e "   ${YELLOW}⚠${NC}  Claude-Flow swarm not initialized"
        echo "   Run: npx claude-flow@alpha swarm init --topology mesh"
    fi
else
    echo -e "   ${RED}✗${NC} Claude-Flow not installed"
    echo "   Install with:"
    echo "   claude mcp add claude-flow npx claude-flow@alpha mcp start"
    ALL_GOOD=false
fi
echo ""

# Check AQE Framework
echo -e "${BLUE}5. Checking Agentic QE Framework...${NC}"
if command -v aqe &> /dev/null; then
    AQE_VERSION=$(aqe --version 2>&1)
    echo -e "   ${GREEN}✓${NC} AQE Framework installed: v$AQE_VERSION"
else
    echo -e "   ${RED}✗${NC} AQE Framework not installed"
    echo "   Install with:"
    echo "   cd /path/to/agentic-qe && npm link"
    ALL_GOOD=false
fi
echo ""

# Summary
echo "================================================"
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ All prerequisites are installed!${NC}"
    echo ""
    echo "You can now use the Agentic QE Framework:"
    echo "  aqe init          - Initialize a new project"
    echo "  aqe list          - List available agents"
    echo "  aqe spawn         - Run quality engineering agents"
else
    echo -e "${RED}❌ Some prerequisites are missing${NC}"
    echo ""
    echo "Please install the missing components above."
fi
echo "================================================"