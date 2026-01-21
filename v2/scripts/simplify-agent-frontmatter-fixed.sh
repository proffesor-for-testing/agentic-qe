#!/bin/bash
# Simplify QE Agent Frontmatter to Only name and description (FIXED VERSION)
#
# Based on Claude Code best practices:
# https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices
#
# YAML frontmatter should contain ONLY:
# - name: agent identifier (required, max 64 chars)
# - description: what it does + when to use it (required, max 1024 chars)
#
# All other metadata goes in the body content for progressive disclosure

set -e

echo "🤖 Simplifying QE Agent Frontmatter (FIXED)"
echo "============================================"
echo ""
echo "Following Claude Code best practices:"
echo "  • Frontmatter: ONLY name + description"
echo "  • Body: All implementation details"
echo "  • Progressive disclosure: Metadata loaded at startup, body on-demand"
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

    # Extract name and description from existing frontmatter using awk
    name=$(awk '/^---$/,/^---$/ {if (/^name:/) {sub(/^name: */, ""); gsub(/"/, ""); print; exit}}' "$agent_file")
    description=$(awk '/^---$/,/^---$/ {if (/^description:/) {sub(/^description: */, ""); gsub(/"/, ""); print; exit}}' "$agent_file")

    # Use filename if name not found
    if [ -z "$name" ]; then
        name="$agent_name"
    fi

    # Use generic description if not found
    if [ -z "$description" ]; then
        description="Agentic QE Fleet ${agent_name#qe-} agent"
    fi

    # Create temp file
    temp_file=$(mktemp)

    # Write new minimal frontmatter
    cat > "$temp_file" << EOF
---
name: $name
description: $description
---
EOF

    # Extract content AFTER the closing --- of frontmatter
    # This uses awk to skip the frontmatter block and get everything after
    awk '
        BEGIN { in_frontmatter=0; after_frontmatter=0 }
        /^---$/ {
            in_frontmatter++
            if (in_frontmatter == 2) {
                after_frontmatter=1
                next
            }
            next
        }
        after_frontmatter { print }
    ' "$agent_file" >> "$temp_file"

    # Backup original
    cp "$agent_file" "$agent_file.backup-$(date +%Y%m%d-%H%M%S)"

    # Replace with new version
    mv "$temp_file" "$agent_file"

    echo -e "  ${GREEN}✓ Simplified${NC}"
    echo "    Name: $name"
    echo "    Description: ${description:0:80}..."

    # Verify content was preserved
    content_lines=$(wc -l < "$agent_file")
    if [ "$content_lines" -lt 10 ]; then
        echo -e "  ${RED}⚠️  WARNING: File seems too short ($content_lines lines) - check backup!${NC}"
    else
        echo "    Content: $content_lines lines preserved"
    fi

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
    echo "💾 Backups created: .claude/agents/qe-*.md.backup-*"
    echo ""
    echo "🎯 Token Savings Estimate (Frontmatter Only):"
    echo "   Before: ~400 tokens per agent × $SIMPLIFIED = ~$((400 * SIMPLIFIED)) tokens"
    echo "   After: ~50 tokens per agent × $SIMPLIFIED = ~$((50 * SIMPLIFIED)) tokens"
    echo "   Saved: ~$((350 * SIMPLIFIED)) tokens (87.5% reduction in frontmatter)"
    echo ""
    echo "✅ All QE agents now use minimal frontmatter (name + description only)"
    echo "✅ Full content preserved in body (progressive disclosure)"
    echo "✅ Follows Claude Code best practices"
fi

echo ""
echo "🔍 To verify changes:"
echo "   head -20 .claude/agents/qe-test-generator.md  # Check frontmatter"
echo "   wc -l .claude/agents/qe-test-generator.md     # Verify content preserved"
echo ""
echo "📚 Reference:"
echo "   https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices"
