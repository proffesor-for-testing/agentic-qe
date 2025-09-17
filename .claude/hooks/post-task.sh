#!/bin/bash
# Post-task hook for QE agents

# Store results
npx claude-flow@alpha memory store "result_$1" "$2"

# Update metrics
npx claude-flow@alpha hooks metrics --update "$1"

# Notify downstream agents
npx claude-flow@alpha hooks notify --downstream "$1"

# Generate report if needed
if [ "$GENERATE_REPORT" = "true" ]; then
  npx claude-flow@alpha hooks report --task "$1"
fi
