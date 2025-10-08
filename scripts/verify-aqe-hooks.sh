#!/bin/bash
# Verification script for AQE hooks terminology update

echo "🔍 AQE Hooks Terminology Verification"
echo "======================================"
echo ""

# Check for old terminology
echo "1. Checking for remaining 'native-typescript-hooks' references..."
OLD_REFS=$(grep -r "native-typescript-hooks" --include="*.ts" --include="*.js" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude="*.sh" --exclude="*TERMINOLOGY-UPDATE.md" 2>/dev/null | wc -l)

if [ "$OLD_REFS" -eq 0 ]; then
  echo "   ✅ PASS: No old 'native-typescript-hooks' references found"
else
  echo "   ❌ FAIL: Found $OLD_REFS old references"
  grep -r "native-typescript-hooks" --include="*.ts" --include="*.js" --include="*.md" \
    --exclude-dir=node_modules --exclude-dir=dist --exclude="*.sh" 2>/dev/null
fi

echo ""

# Check for new terminology
echo "2. Checking for 'aqe-hooks' references..."
AQE_REFS=$(grep -r "aqe-hooks" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | wc -l)

if [ "$AQE_REFS" -ge 30 ]; then
  echo "   ✅ PASS: Found $AQE_REFS 'aqe-hooks' references (expected: 30+)"
else
  echo "   ⚠️  WARNING: Found only $AQE_REFS 'aqe-hooks' references (expected: 30+)"
fi

echo ""

# Check QE agent files
echo "3. Checking QE agent coordination sections..."
AGENTS_UPDATED=0
for file in .claude/agents/qe-*.md; do
  if [ -f "$file" ]; then
    if grep -q "protocol: aqe-hooks" "$file"; then
      AGENTS_UPDATED=$((AGENTS_UPDATED + 1))
    else
      echo "   ❌ Missing aqe-hooks: $file"
    fi
  fi
done

if [ "$AGENTS_UPDATED" -eq 16 ]; then
  echo "   ✅ PASS: All 16 QE agent files updated with aqe-hooks"
else
  echo "   ⚠️  WARNING: Only $AGENTS_UPDATED/16 QE agents updated"
fi

echo ""

# Check init.ts template
echo "4. Checking CLI init template..."
if grep -q "protocol: aqe-hooks" src/cli/commands/init.ts; then
  echo "   ✅ PASS: init.ts template includes aqe-hooks protocol"
else
  echo "   ❌ FAIL: init.ts template missing aqe-hooks protocol"
fi

echo ""

# Summary
echo "======================================"
echo "📊 Verification Summary"
echo "======================================"
echo "Old references removed: $([ "$OLD_REFS" -eq 0 ] && echo '✅ YES' || echo '❌ NO')"
echo "New references added: $([ "$AQE_REFS" -ge 30 ] && echo '✅ YES' || echo '⚠️  PARTIAL')"
echo "QE agents updated: $([ "$AGENTS_UPDATED" -eq 16 ] && echo '✅ YES (16/16)' || echo "⚠️  PARTIAL ($AGENTS_UPDATED/16)")"
echo ""

if [ "$OLD_REFS" -eq 0 ] && [ "$AQE_REFS" -ge 30 ] && [ "$AGENTS_UPDATED" -eq 16 ]; then
  echo "✅ VERIFICATION PASSED - AQE hooks terminology update complete!"
  exit 0
else
  echo "⚠️  VERIFICATION INCOMPLETE - Please review warnings above"
  exit 1
fi
