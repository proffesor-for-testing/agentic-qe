#!/bin/bash

# Validation script for skill frontmatter
# Checks all skills have valid YAML frontmatter for progressive disclosure

set -euo pipefail

SKILLS_DIR=".claude/skills"
RESULTS_FILE="/tmp/skill-frontmatter-validation.json"
ERRORS=0
WARNINGS=0
TOTAL=0
VALID=0
MISSING=()
INVALID=()
WARNINGS_LIST=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Validating skill frontmatter..."
echo ""

# Initialize results JSON
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "total_skills": 0,
  "valid_skills": 0,
  "missing_frontmatter": [],
  "invalid_frontmatter": [],
  "warnings": [],
  "token_savings": {
    "before_tokens": 0,
    "after_tokens": 0,
    "reduction_percent": 0
  }
}
EOF

# Function to check if file has valid YAML frontmatter
validate_frontmatter() {
  local file="$1"
  local skill_name
  skill_name=$(basename "$(dirname "$file")")

  TOTAL=$((TOTAL + 1))

  # Check if file starts with ---
  if ! head -n 1 "$file" | grep -q "^---$"; then
    echo -e "${RED}✗${NC} $skill_name: Missing frontmatter"
    MISSING+=("$skill_name")
    ERRORS=$((ERRORS + 1))
    return 1
  fi

  # Extract frontmatter (between first two --- markers)
  local frontmatter
  frontmatter=$(awk '/^---$/{flag=!flag;next}flag' "$file" | head -n 20)

  # Check required fields
  if ! echo "$frontmatter" | grep -q "^name:"; then
    echo -e "${RED}✗${NC} $skill_name: Missing 'name' field"
    INVALID+=("$skill_name")
    ERRORS=$((ERRORS + 1))
    return 1
  fi

  if ! echo "$frontmatter" | grep -q "^description:"; then
    echo -e "${RED}✗${NC} $skill_name: Missing 'description' field"
    INVALID+=("$skill_name")
    ERRORS=$((ERRORS + 1))
    return 1
  fi

  # Check description length (<1024 chars)
  local desc_length
  desc_length=$(echo "$frontmatter" | grep "^description:" | cut -d':' -f2- | wc -c)
  if [ "$desc_length" -gt 1024 ]; then
    echo -e "${YELLOW}⚠${NC} $skill_name: Description too long ($desc_length chars > 1024)"
    WARNINGS_LIST+=("$skill_name: Description too long ($desc_length chars)")
    WARNINGS=$((WARNINGS + 1))
  fi

  # Check YAML syntax (basic check)
  if ! echo "$frontmatter" | grep -qE "^[a-z_]+: .+"; then
    echo -e "${RED}✗${NC} $skill_name: Invalid YAML syntax"
    INVALID+=("$skill_name")
    ERRORS=$((ERRORS + 1))
    return 1
  fi

  echo -e "${GREEN}✓${NC} $skill_name"
  VALID=$((VALID + 1))
  return 0
}

# Calculate token savings
calculate_token_savings() {
  local skills_dir="$1"
  local total_content_size=0
  local total_frontmatter_size=0

  while IFS= read -r -d '' file; do
    # Full content size (approximate tokens = chars / 4)
    local content_size
    content_size=$(wc -c < "$file")
    total_content_size=$((total_content_size + content_size))

    # Frontmatter size (only name + description loaded initially)
    local frontmatter_size
    frontmatter_size=$(awk '/^---$/{flag=!flag;next}flag' "$file" | head -n 20 | wc -c)
    total_frontmatter_size=$((total_frontmatter_size + frontmatter_size))
  done < <(find "$skills_dir" -name "SKILL.md" -type f -print0)

  # Approximate token counts (1 token ≈ 4 characters)
  local before_tokens=$((total_content_size / 4))
  local after_tokens=$((total_frontmatter_size / 4))
  local reduction_percent=0

  if [ "$before_tokens" -gt 0 ]; then
    reduction_percent=$(( (before_tokens - after_tokens) * 100 / before_tokens ))
  fi

  echo "$before_tokens $after_tokens $reduction_percent"
}

# Main validation loop
echo "Scanning skills in $SKILLS_DIR..."
echo ""

while IFS= read -r -d '' file; do
  validate_frontmatter "$file" || true
done < <(find "$SKILLS_DIR" -name "SKILL.md" -type f -print0 | sort -z)

# Calculate token savings
echo ""
echo "📊 Calculating token savings..."
read -r before_tokens after_tokens reduction_percent <<< "$(calculate_token_savings "$SKILLS_DIR")"

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 VALIDATION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Total skills:        $TOTAL"
echo -e "Valid skills:        ${GREEN}$VALID${NC}"
echo -e "Missing frontmatter: ${RED}${#MISSING[@]}${NC}"
echo -e "Invalid frontmatter: ${RED}${#INVALID[@]}${NC}"
echo -e "Warnings:            ${YELLOW}$WARNINGS${NC}"
echo ""
echo "💰 TOKEN SAVINGS (Progressive Disclosure)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Before (full load):  ~${before_tokens} tokens"
echo "After (frontmatter): ~${after_tokens} tokens"
echo -e "Reduction:           ${GREEN}${reduction_percent}%${NC}"
echo ""

# List errors if any
if [ ${#MISSING[@]} -gt 0 ]; then
  echo -e "${RED}❌ Skills missing frontmatter:${NC}"
  printf '   - %s\n' "${MISSING[@]}"
  echo ""
fi

if [ ${#INVALID[@]} -gt 0 ]; then
  echo -e "${RED}❌ Skills with invalid frontmatter:${NC}"
  printf '   - %s\n' "${INVALID[@]}"
  echo ""
fi

if [ ${#WARNINGS_LIST[@]} -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Warnings:${NC}"
  printf '   - %s\n' "${WARNINGS_LIST[@]}"
  echo ""
fi

# Update results JSON
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "total_skills": $TOTAL,
  "valid_skills": $VALID,
  "missing_frontmatter": $(printf '%s\n' "${MISSING[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]"),
  "invalid_frontmatter": $(printf '%s\n' "${INVALID[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]"),
  "warnings": $(printf '%s\n' "${WARNINGS_LIST[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]"),
  "token_savings": {
    "before_tokens": $before_tokens,
    "after_tokens": $after_tokens,
    "reduction_percent": $reduction_percent
  }
}
EOF

echo "📄 Results saved to: $RESULTS_FILE"
echo ""

# Exit with error code if validation failed
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}❌ Validation FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Validation PASSED${NC}"
  exit 0
fi
