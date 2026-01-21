#!/bin/bash

# Batch conversion script for adding YAML frontmatter to skills
# Processes all skills in .claude/skills/ directory

set -euo pipefail

SKILLS_DIR=".claude/skills"
CONVERSION_LOG="/tmp/skill-frontmatter-conversion.log"
CONVERTED=()
SKIPPED=()
FAILED=()
TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🔄 Adding YAML frontmatter to skills..."
echo ""

# Clear log file
> "$CONVERSION_LOG"

# Function to extract skill name from directory structure
get_skill_name() {
  local file="$1"
  basename "$(dirname "$file")"
}

# Function to extract description from skill content
extract_description() {
  local file="$1"
  local desc=""

  # Try to get first heading description
  desc=$(grep -m 1 "^##" "$file" | sed 's/^##[[:space:]]*//' || true)

  # If no heading, get first paragraph (max 1024 chars)
  if [ -z "$desc" ]; then
    desc=$(awk '/^[A-Z]/{if (NR>5) print; if (length($0)>0) exit}' "$file" | head -c 1024)
  fi

  # Clean up description
  desc=$(echo "$desc" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  # If still empty, use default
  if [ -z "$desc" ]; then
    desc="Quality engineering skill"
  fi

  echo "$desc"
}

# Function to add frontmatter to a skill file
add_frontmatter() {
  local file="$1"
  local skill_name
  local description
  local temp_file

  skill_name=$(get_skill_name "$file")
  TOTAL=$((TOTAL + 1))

  echo -e "${BLUE}Processing:${NC} $skill_name" | tee -a "$CONVERSION_LOG"

  # Check if frontmatter already exists
  if head -n 1 "$file" | grep -q "^---$"; then
    echo -e "${YELLOW}⊙${NC} Skipped (already has frontmatter)" | tee -a "$CONVERSION_LOG"
    SKIPPED+=("$skill_name")
    return 0
  fi

  # Extract description
  description=$(extract_description "$file")

  if [ ${#description} -eq 0 ]; then
    echo -e "${RED}✗${NC} Failed to extract description" | tee -a "$CONVERSION_LOG"
    FAILED+=("$skill_name")
    return 1
  fi

  # Truncate description if too long
  if [ ${#description} -gt 1024 ]; then
    description="${description:0:1021}..."
  fi

  # Create temporary file with frontmatter
  temp_file=$(mktemp)

  cat > "$temp_file" <<EOF
---
name: $skill_name
description: $description
version: 1.0.0
category: quality-engineering
tags: [testing, quality-engineering, automation]
difficulty: intermediate
estimated_time: 45-60 minutes
author: agentic-qe
---

EOF

  # Append original content
  cat "$file" >> "$temp_file"

  # Backup original file
  cp "$file" "${file}.backup"

  # Replace original with new version
  mv "$temp_file" "$file"

  echo -e "${GREEN}✓${NC} Converted successfully" | tee -a "$CONVERSION_LOG"
  CONVERTED+=("$skill_name")

  # Remove backup if conversion successful
  rm -f "${file}.backup"

  return 0
}

# Main conversion loop
echo "Scanning skills in $SKILLS_DIR..."
echo ""

while IFS= read -r -d '' file; do
  # Skip README
  if [[ "$file" == *"/README.md" ]]; then
    continue
  fi

  add_frontmatter "$file" || true
  echo ""
done < <(find "$SKILLS_DIR" -name "SKILL.md" -type f -print0 | sort -z)

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 CONVERSION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Total skills processed: $TOTAL"
echo -e "Converted:              ${GREEN}${#CONVERTED[@]}${NC}"
echo -e "Skipped (existing):     ${YELLOW}${#SKIPPED[@]}${NC}"
echo -e "Failed:                 ${RED}${#FAILED[@]}${NC}"
echo ""

if [ ${#CONVERTED[@]} -gt 0 ]; then
  echo -e "${GREEN}✅ Converted skills:${NC}"
  printf '   - %s\n' "${CONVERTED[@]}"
  echo ""
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo -e "${RED}❌ Failed conversions:${NC}"
  printf '   - %s\n' "${FAILED[@]}"
  echo ""
fi

echo "📄 Full log: $CONVERSION_LOG"
echo ""

# Run validation after conversion
if [ ${#CONVERTED[@]} -gt 0 ]; then
  echo "🔍 Running validation..."
  echo ""
  if [ -f "./scripts/validate-skill-frontmatter.sh" ]; then
    bash ./scripts/validate-skill-frontmatter.sh
  else
    echo -e "${YELLOW}⚠${NC} Validation script not found"
  fi
fi

# Exit with error code if any conversions failed
if [ ${#FAILED[@]} -gt 0 ]; then
  exit 1
else
  echo -e "${GREEN}✅ Conversion completed successfully${NC}"
  exit 0
fi
