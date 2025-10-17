#!/bin/bash
# Verify Test Cleanup - Quick Status Check

echo "🔍 Test Cleanup Verification"
echo "============================"
echo ""

echo "📁 Disabled Files Location:"
echo "   tests/disabled/until-implementations/"
echo ""

echo "📊 Files Disabled:"
ls -1 tests/disabled/until-implementations/*.test.ts 2>/dev/null | wc -l
echo ""

echo "📝 Files List:"
ls -1 tests/disabled/until-implementations/*.test.ts 2>/dev/null | xargs -n1 basename
echo ""

echo "📏 Total Lines of Test Code:"
wc -l tests/disabled/until-implementations/*.test.ts 2>/dev/null | tail -1
echo ""

echo "📖 Documentation:"
if [ -f "tests/disabled/until-implementations/README.md" ]; then
  echo "   ✅ README.md exists"
else
  echo "   ❌ README.md missing"
fi

if [ -f "docs/reports/TEST-CLEANUP-COMPLETE.md" ]; then
  echo "   ✅ TEST-CLEANUP-COMPLETE.md exists"
else
  echo "   ❌ TEST-CLEANUP-COMPLETE.md missing"
fi
echo ""

echo "🗄️  Swarm Memory:"
if [ -f ".swarm/memory.db" ]; then
  echo "   ✅ Memory database exists"
  echo "   🔑 Keys: tasks/TEST-CLEANUP/status"
  echo "   🔑 Keys: tasks/TEST-CLEANUP/results"
else
  echo "   ⚠️  Memory database not found"
fi
echo ""

echo "🧪 Current Test Status:"
npm test 2>&1 | grep -E "Test Suites:|Tests:" | head -2
echo ""

echo "✅ Cleanup Verification Complete"
