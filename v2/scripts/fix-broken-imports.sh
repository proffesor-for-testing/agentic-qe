#!/bin/bash
# Fix broken SecureRandom imports that were inserted in wrong places

set -e

echo "🔧 Fixing broken SecureRandom imports..."

# List of files with broken imports from build errors
BROKEN_FILES=(
  "src/core/memory/SwarmMemoryManager.ts"
  "src/core/memory/ReasoningBankAdapter.ts"
  "src/core/memory/AgentDBManager.ts"
  "src/core/neural/NeuralTrainer.ts"
  "src/mcp/handlers/advanced/mutation-test-execute.ts"
  "src/mcp/handlers/integration/dependency-check.ts"
  "src/mcp/handlers/integration/integration-test-orchestrate.ts"
  "src/mcp/handlers/coordination/workflow-execute.ts"
  "src/mcp/handlers/coordination/workflow-create.ts"
  "src/mcp/handlers/coordination/workflow-resume.ts"
  "src/mcp/handlers/coordination/event-subscribe.ts"
  "src/mcp/handlers/coordination/event-emit.ts"
  "src/mcp/handlers/coordination/workflow-checkpoint.ts"
  "src/mcp/handlers/test/test-generate-enhanced.ts"
  "src/mcp/handlers/test/test-execute-parallel.ts"
  "src/mcp/handlers/test/test-optimize-sublinear.ts"
  "src/mcp/handlers/base-handler.ts"
  "src/mcp/handlers/optimize-tests.ts"
  "src/mcp/handlers/analysis/securityScanComprehensive.ts"
  "src/mcp/handlers/analysis/coverageGapsDetect.ts"
  "src/mcp/handlers/analysis/performance-monitor-realtime-handler.ts"
  "src/mcp/handlers/analysis/performanceMonitorRealtime.ts"
  "src/mcp/handlers/analysis/coverageAnalyzeSublinear.ts"
  "src/mcp/handlers/analysis/performanceBenchmarkRun.ts"
  "src/utils/validation.ts"
)

for FILE in "${BROKEN_FILES[@]}"; do
  if [ -f "$FILE" ]; then
    echo "Processing: $FILE"

    # Remove all SecureRandom import lines (we'll re-add them correctly)
    sed -i '/^import { SecureRandom } from/d' "$FILE"
    sed -i '/^import { SecureRandom} from/d' "$FILE"

    # Find first import line and add SecureRandom import after it
    FIRST_IMPORT=$(grep -n "^import " "$FILE" | head -1 | cut -d: -f1)

    if [ -n "$FIRST_IMPORT" ]; then
      # Calculate depth for relative path
      DEPTH=$(echo "$FILE" | tr -cd '/' | wc -c)
      DEPTH=$((DEPTH - 1))

      RELATIVE_PATH=""
      for ((i=0; i<DEPTH; i++)); do
        RELATIVE_PATH="../$RELATIVE_PATH"
      done
      RELATIVE_PATH="${RELATIVE_PATH}utils/SecureRandom.js"

      # Add import at the top after first import
      sed -i "${FIRST_IMPORT}a import { SecureRandom } from '${RELATIVE_PATH}';" "$FILE"
      echo "  ✓ Fixed import in $FILE"
    fi
  fi
done

echo "✅ All broken imports fixed!"
