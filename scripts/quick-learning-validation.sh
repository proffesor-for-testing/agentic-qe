#!/bin/bash
# Quick 3-iteration learning validation (faster than 10)
echo "🧪 Quick Learning Validation (3 iterations)"

# Initialize AgentDB
npx aqe init --silent 2>/dev/null || true

for i in {1..3}; do
  echo "Iteration $i..."
  npx tsx src/cli/index.ts learn metrics --days 1 2>&1 | grep -E "Total Patterns|Avg Confidence" | head -2
done

echo "✅ Validation complete - check if patterns increased"
