#!/bin/bash
# Verification script for security-visual-testing skill

set -e

echo "==================================================================="
echo "Security-Visual Testing Skill - Verification"
echo "==================================================================="
echo ""

# Use script's directory to find skill location (works regardless of where run from)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$SCRIPT_DIR"

# Check files exist
echo "✓ Checking files..."
for file in index.ts types.ts skill.yaml README.md INTEGRATION.md; do
  if [ -f "$SKILL_DIR/$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (missing)"
    exit 1
  fi
done
echo ""

# Check line counts
echo "✓ Line counts:"
wc -l "$SKILL_DIR"/*.ts "$SKILL_DIR"/*.yaml 2>/dev/null || true
echo ""

# Check for key components in index.ts
echo "✓ Checking implementation components..."
components=(
  "SecurityVisualTestingSkill"
  "executeSecurityVisualAudit"
  "executePIISafeScreenshot"
  "executeResponsiveVisualAudit"
  "validateURLSecurity"
  "detectPII"
  "initialize"
  "dispose"
)

for component in "${components[@]}"; do
  if grep -q "$component" "$SKILL_DIR/index.ts"; then
    echo "  ✅ $component"
  else
    echo "  ❌ $component (missing)"
    exit 1
  fi
done
echo ""

# Check for type definitions in types.ts
echo "✓ Checking type definitions..."
types=(
  "SecurityVisualAuditOptions"
  "SecurityVisualAuditReport"
  "PIISafeScreenshotOptions"
  "PIISafeScreenshot"
  "ResponsiveVisualAuditOptions"
  "ResponsiveVisualAuditReport"
  "URLSecurityValidation"
  "PIIDetectionResult"
  "ISecurityVisualTestingSkill"
)

for type in "${types[@]}"; do
  if grep -q "$type" "$SKILL_DIR/types.ts"; then
    echo "  ✅ $type"
  else
    echo "  ❌ $type (missing)"
    exit 1
  fi
done
echo ""

# Check for workflows in skill.yaml
echo "✓ Checking YAML workflows..."
workflows=(
  "security-visual-audit"
  "pii-safe-screenshot"
  "responsive-visual-audit"
)

for workflow in "${workflows[@]}"; do
  if grep -q "$workflow" "$SKILL_DIR/skill.yaml"; then
    echo "  ✅ $workflow"
  else
    echo "  ❌ $workflow (missing)"
    exit 1
  fi
done
echo ""

# Check for integration patterns
echo "✓ Checking integration patterns..."
if grep -q "IVisualAccessibilityCoordinator" "$SKILL_DIR/index.ts"; then
  echo "  ✅ IVisualAccessibilityCoordinator (dependency injection)"
else
  echo "  ❌ IVisualAccessibilityCoordinator (missing)"
  exit 1
fi

if grep -q "createBrowserClient" "$SKILL_DIR/index.ts"; then
  echo "  ✅ createBrowserClient (factory pattern)"
else
  echo "  ❌ createBrowserClient (missing)"
  exit 1
fi

if grep -q "Result<" "$SKILL_DIR/index.ts"; then
  echo "  ✅ Result<T, Error> (type-safe error handling)"
else
  echo "  ❌ Result<T, Error> (missing)"
  exit 1
fi

if grep -q "ok(" "$SKILL_DIR/index.ts" && grep -q "err(" "$SKILL_DIR/index.ts"; then
  echo "  ✅ ok/err helpers"
else
  echo "  ❌ ok/err helpers (missing)"
  exit 1
fi
echo ""

# Summary
echo "==================================================================="
echo "✅ All verifications passed!"
echo "==================================================================="
echo ""
echo "Skill Location: $SKILL_DIR"
echo "Files: 5"
echo "Total Lines: $(wc -l "$SKILL_DIR"/*.ts "$SKILL_DIR"/*.yaml 2>/dev/null | tail -1 | awk '{print $1}')"
echo ""
echo "Next Steps:"
echo "  1. Run 'npm run typecheck' to verify TypeScript compilation"
echo "  2. Implement integration tests (Milestone 5, Action A13)"
echo "  3. Test with real browser integration"
echo ""
