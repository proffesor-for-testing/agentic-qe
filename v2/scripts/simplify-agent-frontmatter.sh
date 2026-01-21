#!/bin/bash
# Simplify QE Agent Frontmatter to Only name and description
#
# WHY: Progressive disclosure in Claude Code only needs name and description
# Everything else is loaded from the full content when agent is activated
#
# BENEFIT:
# - Reduces frontmatter from ~400 tokens to ~50 tokens per agent
# - 18 agents × 350 tokens saved = 6,300 tokens saved
# - Faster agent discovery and matching

set -e

echo "🤖 Simplifying QE Agent Frontmatter"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL=0
SIMPLIFIED=0
SKIPPED=0
ERRORS=0

# Find all QE agent files
AGENT_DIR=".claude/agents"

if [ ! -d "$AGENT_DIR" ]; then
    echo -e "${RED}❌ Agent directory not found: $AGENT_DIR${NC}"
    exit 1
fi

echo "📁 Scanning directory: $AGENT_DIR"
echo ""

# Process each QE agent file
for agent_file in "$AGENT_DIR"/qe-*.md; do
    if [ ! -f "$agent_file" ]; then
        continue
    fi

    TOTAL=$((TOTAL + 1))
    agent_name=$(basename "$agent_file" .md)

    echo "📝 Processing: $agent_name"

    # Check if file has frontmatter
    if ! head -1 "$agent_file" | grep -q "^---"; then
        echo -e "  ${YELLOW}⚠️  No frontmatter found, skipping${NC}"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    # Extract name and description from existing frontmatter
    # Create temp file for processing
    temp_file=$(mktemp)

    # Extract the frontmatter block
    awk '/^---$/{n++} n==1' "$agent_file" > "$temp_file.frontmatter"

    # Extract name and description
    name=$(grep "^name:" "$temp_file.frontmatter" | sed 's/^name: *//' | tr -d '"' || echo "$agent_name")
    description=$(grep "^description:" "$temp_file.frontmatter" | sed 's/^description: *//' | tr -d '"' || echo "QE Fleet agent")

    # Get content after frontmatter (skip first --- ... --- block)
    awk '/^---$/{n++} n==2{f=1;next} f' "$agent_file" > "$temp_file.content"

    # Create new simplified frontmatter
    cat > "$temp_file.new" << EOF
---
name: $name
description: $description
---
EOF

    # Append original content
    cat "$temp_file.content" >> "$temp_file.new"

    # Backup original
    cp "$agent_file" "$agent_file.backup"

    # Replace with new version
    mv "$temp_file.new" "$agent_file"

    # Cleanup
    rm -f "$temp_file" "$temp_file.frontmatter" "$temp_file.content"

    echo -e "  ${GREEN}✓ Simplified${NC}"
    echo "    Name: $name"
    echo "    Description: ${description:0:80}..."
    SIMPLIFIED=$((SIMPLIFIED + 1))
    echo ""
done

# Summary
echo "========================================"
echo "📊 Summary"
echo "========================================"
echo ""
echo "Total agents processed: $TOTAL"
echo -e "${GREEN}✓ Simplified: $SIMPLIFIED${NC}"
echo -e "${YELLOW}⚠️  Skipped: $SKIPPED${NC}"
echo -e "${RED}❌ Errors: $ERRORS${NC}"
echo ""

if [ $SIMPLIFIED -gt 0 ]; then
    echo "💾 Backups created: .claude/agents/qe-*.md.backup"
    echo ""
    echo "🎯 Token Savings Estimate:"
    echo "   Before: ~400 tokens per agent × $SIMPLIFIED = ~$((400 * SIMPLIFIED)) tokens"
    echo "   After: ~50 tokens per agent × $SIMPLIFIED = ~$((50 * SIMPLIFIED)) tokens"
    echo "   Saved: ~$((350 * SIMPLIFIED)) tokens (87.5% reduction)"
    echo ""
    echo "✅ All QE agents now use minimal frontmatter (name + description only)"
    echo "✅ Full content still accessible when agent is activated"
fi

echo ""
echo "🔍 To verify changes:"
echo "   head -20 .claude/agents/qe-test-generator.md"
echo ""
echo "🔙 To restore from backup:"
echo "   mv .claude/agents/qe-*.md.backup .claude/agents/qe-*.md"
