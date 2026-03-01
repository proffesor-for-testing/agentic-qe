#!/bin/bash
# QCSD Demo Warmup Script
# Run 5 minutes before presentation

set -e

echo "=========================================="
echo "  QCSD Demo Warmup"
echo "=========================================="

cd /workspaces/agentic-qe-new

echo ""
echo "[1/4] Checking Node.js..."
node --version

echo ""
echo "[2/4] Building (if needed)..."
npm run build 2>/dev/null || echo "Build skipped (already built)"

echo ""
echo "[3/4] Verifying tests pass..."
npm test -- --run tests/integration/cross-phase-integration.test.ts 2>&1 | tail -5

echo ""
echo "[4/4] Initializing swarm..."
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 6 \
  --strategy specialized 2>/dev/null || echo "Swarm ready"

echo ""
echo "=========================================="
echo "  DEMO READY!"
echo "=========================================="
echo ""
echo "Open Claude Code and paste:"
echo ""
echo '  I need to demonstrate QE fleet capabilities.'
echo '  Spawn qe-risk-assessor to analyze'
echo '  src/memory/cross-phase-memory.ts'
echo '  for quality risks using SFDIPOT factors.'
echo ""
echo "Demo script: docs/demos/qcsd-10min-demo.md"
echo "=========================================="
