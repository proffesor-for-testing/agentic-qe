#!/bin/bash
# Post-Release Code Intelligence Indexing Script
#
# Usage: ./scripts/post-release-index.sh [previous-version]
# Example: ./scripts/post-release-index.sh v2.6.1
#
# This script indexes all code changes since the previous release
# for the Code Intelligence semantic search system.

set -e

PREVIOUS_VERSION="${1:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Post-Release Code Intelligence Indexing${NC}"
echo "============================================"

# Get previous version if not provided
if [ -z "$PREVIOUS_VERSION" ]; then
    # Get the second-to-last tag (current release is the latest)
    PREVIOUS_VERSION=$(git tag --sort=-v:refname | head -2 | tail -1)
    if [ -z "$PREVIOUS_VERSION" ]; then
        echo -e "${YELLOW}⚠️  No previous version found. Running full index...${NC}"
        PREVIOUS_VERSION=""
    else
        echo -e "${GREEN}✓ Auto-detected previous version: ${PREVIOUS_VERSION}${NC}"
    fi
fi

# Check prerequisites
echo -e "\n${BLUE}Checking prerequisites...${NC}"

# Check Ollama
if ! command -v ollama &> /dev/null; then
    echo -e "${RED}❌ Ollama not installed. Install from https://ollama.ai${NC}"
    exit 1
fi

if ! ollama list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Ollama not running. Starting...${NC}"
    ollama serve > /dev/null 2>&1 &
    sleep 3
fi
echo -e "${GREEN}✓ Ollama running${NC}"

# Check nomic-embed-text model
if ! ollama list | grep -q "nomic-embed-text"; then
    echo -e "${YELLOW}⚠️  Pulling nomic-embed-text model...${NC}"
    ollama pull nomic-embed-text
fi
echo -e "${GREEN}✓ Embedding model available${NC}"

# Check PostgreSQL container
if ! docker ps --format '{{.Names}}' | grep -q "agentic-qe-ruvector"; then
    echo -e "${YELLOW}⚠️  PostgreSQL container not running. Starting...${NC}"
    if docker ps -a --format '{{.Names}}' | grep -q "agentic-qe-ruvector"; then
        docker start agentic-qe-ruvector-dev
    else
        echo -e "${RED}❌ PostgreSQL container not found. Run: docker run -d --name agentic-qe-ruvector-dev -e POSTGRES_USER=ruvector -e POSTGRES_PASSWORD=ruvector -e POSTGRES_DB=ruvector_db -p 5432:5432 postgres:15${NC}"
        exit 1
    fi
    sleep 3
fi
echo -e "${GREEN}✓ PostgreSQL running${NC}"

# Show changes to be indexed
echo -e "\n${BLUE}Changes since ${PREVIOUS_VERSION:-'beginning'}:${NC}"
if [ -n "$PREVIOUS_VERSION" ]; then
    CHANGED_FILES=$(git diff --name-only "$PREVIOUS_VERSION"..HEAD -- "src/" | wc -l)
    echo "  Files changed in src/: $CHANGED_FILES"
    git diff --stat "$PREVIOUS_VERSION"..HEAD -- "src/" | tail -5
fi

# Run indexing
echo -e "\n${BLUE}Running Code Intelligence indexing...${NC}"
if [ -n "$PREVIOUS_VERSION" ]; then
    npx aqe kg index --incremental --git-since "$PREVIOUS_VERSION" --verbose
else
    npx aqe kg index --verbose
fi

# Show stats
echo -e "\n${BLUE}Knowledge Graph Statistics:${NC}"
npx aqe kg stats

echo -e "\n${GREEN}✅ Post-release indexing complete!${NC}"
echo -e "You can now use: ${YELLOW}aqe kg query \"your search query\"${NC}"
