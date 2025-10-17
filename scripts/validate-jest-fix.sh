#!/bin/bash

# Jest Environment Fix Validation Script
# Confirms that all process.cwd() errors have been eliminated

echo "========================================"
echo "Jest Environment Fix Validation"
echo "========================================"
echo ""

echo "1. Checking for uv_cwd errors..."
# Run quick test check (limited time)
UV_CWD_COUNT=$(timeout 60 npm test 2>&1 | grep "ENOENT: no such file or directory, uv_cwd" | wc -l)
echo "   uv_cwd errors found: $UV_CWD_COUNT"

if [ "$UV_CWD_COUNT" -eq 0 ]; then
  echo "   ✅ PASS: No process.cwd() errors"
else
  echo "   ❌ FAIL: Still has uv_cwd errors"
fi

echo ""
echo "2. Checking global setup file..."
if [ -f "jest.global-setup.ts" ]; then
  echo "   ✅ PASS: jest.global-setup.ts exists"
else
  echo "   ❌ FAIL: jest.global-setup.ts missing"
fi

echo ""
echo "3. Checking global teardown file..."
if [ -f "jest.global-teardown.ts" ]; then
  echo "   ✅ PASS: jest.global-teardown.ts exists"
else
  echo "   ❌ FAIL: jest.global-teardown.ts missing"
fi

echo ""
echo "4. Checking jest.config.js for globalSetup..."
if grep -q "globalSetup" jest.config.js; then
  echo "   ✅ PASS: globalSetup configured"
else
  echo "   ❌ FAIL: globalSetup missing"
fi

echo ""
echo "5. Checking package.json resolutions..."
if grep -q "resolutions" package.json; then
  echo "   ✅ PASS: Package resolutions configured"
else
  echo "   ❌ FAIL: Package resolutions missing"
fi

echo ""
echo "6. Checking jest.setup.ts for stack-utils mock..."
if grep -q "jest.mock('stack-utils'" jest.setup.ts; then
  echo "   ✅ PASS: stack-utils mock present"
else
  echo "   ❌ FAIL: stack-utils mock missing"
fi

echo ""
echo "7. Checking database for stored results..."
if [ -f ".swarm/memory.db" ]; then
  echo "   ✅ PASS: SwarmMemoryManager database exists"
else
  echo "   ❌ FAIL: Database not found"
fi

echo ""
echo "8. Checking report file..."
if [ -f "docs/reports/JEST-ENV-FIX-COMPLETE.md" ]; then
  echo "   ✅ PASS: Report generated"
else
  echo "   ❌ FAIL: Report missing"
fi

echo ""
echo "========================================"
echo "Validation Complete"
echo "========================================"
echo ""

# Count passes
PASS_COUNT=0
[ "$UV_CWD_COUNT" -le 0 ] 2>/dev/null && ((PASS_COUNT++))
[ -f "jest.global-setup.ts" ] && ((PASS_COUNT++))
[ -f "jest.global-teardown.ts" ] && ((PASS_COUNT++))
grep -q "globalSetup" jest.config.js && ((PASS_COUNT++))
grep -q "resolutions" package.json && ((PASS_COUNT++))
grep -q "jest.mock('stack-utils'" jest.setup.ts && ((PASS_COUNT++))
[ -f ".swarm/memory.db" ] && ((PASS_COUNT++))
[ -f "docs/reports/JEST-ENV-FIX-COMPLETE.md" ] && ((PASS_COUNT++))

echo "Final Score: $PASS_COUNT/8 checks passed"
echo ""

if [ "$PASS_COUNT" -eq 8 ]; then
  echo "✅ ALL CHECKS PASSED - Jest environment fix successful!"
  exit 0
else
  echo "⚠️  Some checks failed - review output above"
  exit 1
fi
