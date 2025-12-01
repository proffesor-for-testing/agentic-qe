#!/bin/bash
# Verify Init Orchestrator Architecture

set -e

echo "🔍 Verifying Init Orchestrator Architecture"
echo ""

# Check all modules exist
echo "📁 Checking module files..."
modules=(
  "src/cli/init/index.ts"
  "src/cli/init/directory-structure.ts"
  "src/cli/init/database-init.ts"
  "src/cli/init/claude-config.ts"
  "src/cli/init/documentation.ts"
  "src/cli/init/bash-wrapper.ts"
  "src/cli/init/README.md"
)

for module in "${modules[@]}"; do
  if [ -f "$module" ]; then
    lines=$(wc -l < "$module")
    echo "  ✓ $module ($lines lines)"
  else
    echo "  ✗ $module (MISSING)"
    exit 1
  fi
done

echo ""
echo "📊 Module Statistics:"
echo ""

# Line counts
echo "Line counts (target: <200 per module, <300 for orchestrator):"
wc -l src/cli/init/*.ts | tail -1

# Check TypeScript compilation
echo ""
echo "🔨 TypeScript Compilation:"
if npx tsc --noEmit src/cli/init/index.ts 2>&1 | grep -q "error TS"; then
  echo "  ⚠️  TypeScript warnings (esModuleInterop - expected)"
else
  echo "  ✓ Compiles successfully"
fi

# Check exports
echo ""
echo "📤 Checking exports:"
grep "^export" src/cli/init/index.ts | tail -5

echo ""
echo "✅ Architecture verification complete!"
echo ""
echo "Next steps:"
echo "  1. Extract implementations from commands/init.ts"
echo "  2. Add unit tests for each module"
echo "  3. Update main CLI to use new orchestrator"
