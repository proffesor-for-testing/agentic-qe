#!/bin/bash
# Security Fix Script: Replace Math.random() with SecureRandom
# Fixes security vulnerabilities by replacing insecure random with crypto-based secure random
# Alert #1-13 (and many more): Insecure Randomness

set -e

echo "🔒 Security Fix: Replacing Math.random() with SecureRandom"
echo "==============================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Find all TypeScript files with Math.random()
FILES=$(find src -name "*.ts" -type f -exec grep -l "Math\.random()" {} \;)

if [ -z "$FILES" ]; then
  echo "✅ No files with Math.random() found!"
  exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l)
echo "📊 Found ${FILE_COUNT} files to fix"
echo ""

FIXED_COUNT=0

for FILE in $FILES; do
  echo -e "${YELLOW}Processing: $FILE${NC}"

  # Check if file already has SecureRandom import
  if ! grep -q "import.*SecureRandom.*from" "$FILE"; then
    # Determine the correct relative path to SecureRandom
    # Count directory depth
    DEPTH=$(echo "$FILE" | tr -cd '/' | wc -c)
    DEPTH=$((DEPTH - 1))  # Subtract 1 for 'src/'

    # Build relative path
    RELATIVE_PATH=""
    for ((i=0; i<DEPTH; i++)); do
      RELATIVE_PATH="../$RELATIVE_PATH"
    done
    RELATIVE_PATH="${RELATIVE_PATH}utils/SecureRandom.js"

    # Find the last import statement
    LAST_IMPORT_LINE=$(grep -n "^import " "$FILE" | tail -1 | cut -d: -f1)

    if [ -n "$LAST_IMPORT_LINE" ]; then
      # Add import after last import
      sed -i "${LAST_IMPORT_LINE}a import { SecureRandom } from '${RELATIVE_PATH}';" "$FILE"
      echo "  ✓ Added SecureRandom import"
    else
      # No imports found, add at top after first comment block
      # Find line after first /** */ block or at line 1
      sed -i "1i import { SecureRandom } from '${RELATIVE_PATH}';\n" "$FILE"
      echo "  ✓ Added SecureRandom import at top"
    fi
  else
    echo "  ✓ SecureRandom import already exists"
  fi

  # Count replacements
  BEFORE_COUNT=$(grep -o "Math\.random()" "$FILE" | wc -l)

  # Replace patterns (in order of complexity)
  # 1. Math.random().toString(36).substr(2, N) -> SecureRandom.generateId(N/2)
  sed -i 's/Math\.random()\.toString(36)\.substr(2, 9)/SecureRandom.generateId(5)/g' "$FILE"
  sed -i 's/Math\.random()\.toString(36)\.substr(2, 8)/SecureRandom.generateId(4)/g' "$FILE"
  sed -i 's/Math\.random()\.toString(36)\.substr(2, 6)/SecureRandom.generateId(3)/g' "$FILE"
  sed -i 's/Math\.random()\.toString(36)\.substr(2, 4)/SecureRandom.generateId(2)/g' "$FILE"

  # 2. Math.floor(Math.random() * N + M) -> SecureRandom.randomInt(M, M+N)
  # This is complex, so we'll handle common patterns
  # For now, replace with simpler pattern

  # 3. Math.floor(Math.random() * N) -> SecureRandom.randomInt(0, N)
  # We'll do manual replacement for complex patterns

  # 4. Simple Math.random() -> SecureRandom.randomFloat()
  sed -i 's/Math\.random()/SecureRandom.randomFloat()/g' "$FILE"

  AFTER_COUNT=$(grep -o "Math\.random()" "$FILE" | wc -l)
  REPLACED=$((BEFORE_COUNT - AFTER_COUNT))

  if [ $REPLACED -gt 0 ]; then
    echo -e "  ${GREEN}✓ Replaced ${REPLACED} instances${NC}"
    FIXED_COUNT=$((FIXED_COUNT + 1))
  else
    echo "  ℹ Already fixed"
  fi

  echo ""
done

echo "==============================================="
echo -e "${GREEN}✅ Security fix complete!${NC}"
echo "📊 Files processed: ${FILE_COUNT}"
echo "📊 Files modified: ${FIXED_COUNT}"
echo ""
echo "⚠️  Note: Some complex Math.floor(Math.random() * N + M) patterns"
echo "   may need manual review for optimal SecureRandom.randomInt() usage"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Run tests: npm test"
echo "  3. Run build: npm run build"
