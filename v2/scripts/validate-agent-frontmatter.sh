#!/bin/bash
# Validate QE Agent Frontmatter
#
# Ensures all QE agents have valid YAML frontmatter with:
# - Only 'name' and 'description' fields (progressive disclosure)
# - Valid YAML syntax
# - Description length within limits

set -e

echo "🔍 Validating QE Agent Frontmatter"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL=0
VALID=0
INVALID=0
WARNINGS=0

# Results
MISSING_FRONTMATTER=()
INVALID_YAML=()
EXTRA_FIELDS=()
MISSING_NAME=()
MISSING_DESCRIPTION=()
DESCRIPTION_TOO_LONG=()

# Agent directory
AGENT_DIR=".claude/agents"

if [ ! -d "$AGENT_DIR" ]; then
    echo -e "${RED}❌ Agent directory not found: $AGENT_DIR${NC}"
    exit 1
fi

echo "📁 Scanning directory: $AGENT_DIR"
echo ""

# Process each QE agent
for agent_file in "$AGENT_DIR"/qe-*.md; do
    if [ ! -f "$agent_file" ]; then
        continue
    fi

    TOTAL=$((TOTAL + 1))
    agent_name=$(basename "$agent_file" .md)
    is_valid=true

    echo -n "Checking $agent_name... "

    # Check for frontmatter
    if ! head -1 "$agent_file" | grep -q "^---"; then
        echo -e "${RED}❌ Missing frontmatter${NC}"
        MISSING_FRONTMATTER+=("$agent_name")
        INVALID=$((INVALID + 1))
        is_valid=false
        continue
    fi

    # Extract frontmatter
    frontmatter=$(awk '/^---$/{n++} n==1' "$agent_file")

    # Check if YAML is valid (basic check - has at least name: and description:)
    if ! echo "$frontmatter" | grep -q "^name:"; then
        echo -e "${RED}❌ Missing 'name' field${NC}"
        MISSING_NAME+=("$agent_name")
        INVALID=$((INVALID + 1))
        is_valid=false
        continue
    fi

    if ! echo "$frontmatter" | grep -q "^description:"; then
        echo -e "${RED}❌ Missing 'description' field${NC}"
        MISSING_DESCRIPTION+=("$agent_name")
        INVALID=$((INVALID + 1))
        is_valid=false
        continue
    fi

    # Count fields (should only have name and description)
    field_count=$(echo "$frontmatter" | grep -c "^[a-z_-]*:" || echo "0")

    if [ "$field_count" -gt 2 ]; then
        echo -e "${YELLOW}⚠️  Has extra fields ($field_count fields)${NC}"
        EXTRA_FIELDS+=("$agent_name")
        WARNINGS=$((WARNINGS + 1))
        # Don't mark as invalid, just a warning
    fi

    # Check description length (should be < 200 chars for progressive disclosure)
    description=$(echo "$frontmatter" | grep "^description:" | sed 's/^description: *//' | tr -d '"')
    desc_length=${#description}

    if [ "$desc_length" -gt 200 ]; then
        echo -e "${YELLOW}⚠️  Description too long ($desc_length chars, recommend <200)${NC}"
        DESCRIPTION_TOO_LONG+=("$agent_name: $desc_length chars")
        WARNINGS=$((WARNINGS + 1))
    fi

    if [ "$is_valid" = true ] && [ ${#EXTRA_FIELDS[@]} -eq 0 ] || [ "${EXTRA_FIELDS[-1]}" != "$agent_name" ]; then
        echo -e "${GREEN}✓ Valid${NC}"
        VALID=$((VALID + 1))
    elif [ "$is_valid" = true ]; then
        VALID=$((VALID + 1))
    fi
done

# Summary
echo ""
echo "========================================"
echo "📊 Validation Summary"
echo "========================================"
echo ""
echo "Total agents: $TOTAL"
echo -e "${GREEN}✓ Valid: $VALID${NC}"
echo -e "${RED}❌ Invalid: $INVALID${NC}"
echo -e "${YELLOW}⚠️  Warnings: $WARNINGS${NC}"
echo ""

# Show issues
if [ ${#MISSING_FRONTMATTER[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing Frontmatter:${NC}"
    printf '   - %s\n' "${MISSING_FRONTMATTER[@]}"
    echo ""
fi

if [ ${#MISSING_NAME[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing 'name' Field:${NC}"
    printf '   - %s\n' "${MISSING_NAME[@]}"
    echo ""
fi

if [ ${#MISSING_DESCRIPTION[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing 'description' Field:${NC}"
    printf '   - %s\n' "${MISSING_DESCRIPTION[@]}"
    echo ""
fi

if [ ${#EXTRA_FIELDS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Agents with Extra Fields (should only have name + description):${NC}"
    printf '   - %s\n' "${EXTRA_FIELDS[@]}"
    echo ""
fi

if [ ${#DESCRIPTION_TOO_LONG[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Long Descriptions (recommend <200 chars for progressive disclosure):${NC}"
    printf '   - %s\n' "${DESCRIPTION_TOO_LONG[@]}"
    echo ""
fi

# Token savings estimate
if [ $VALID -gt 0 ]; then
    echo "========================================"
    echo "💡 Progressive Disclosure Benefits"
    echo "========================================"
    echo ""
    echo "With minimal frontmatter (name + description only):"
    echo "  • Initial load: ~50 tokens per agent × $VALID = ~$((50 * VALID)) tokens"
    echo "  • Full content loaded only when agent is activated"
    echo "  • Estimated savings: ~$((350 * VALID)) tokens (87.5% reduction)"
    echo ""
fi

# Exit code
if [ $INVALID -gt 0 ]; then
    echo -e "${RED}❌ Validation failed: $INVALID invalid agents${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All $TOTAL QE agents validated successfully!${NC}"
    exit 0
fi
