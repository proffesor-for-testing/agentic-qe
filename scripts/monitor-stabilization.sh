#!/bin/bash
# Continuous monitoring script for test stabilization
# Usage: ./scripts/monitor-stabilization.sh [interval_minutes]

INTERVAL_MINUTES=${1:-3}
INTERVAL_SECONDS=$((INTERVAL_MINUTES * 60))

echo "🚀 Starting Stabilization Monitoring"
echo "📊 Interval: ${INTERVAL_MINUTES} minutes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

CYCLE=0

while true; do
  CYCLE=$((CYCLE + 1))
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

  echo "🔄 Validation Cycle #${CYCLE} - ${TIMESTAMP}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Run validation
  npx ts-node scripts/stabilization-validator.ts single

  # Check if Tier 1 is achieved
  TIER1_MET=$(node -e "
    const { SwarmMemoryManager } = require('./dist/core/memory/SwarmMemoryManager.js');
    const path = require('path');

    async function check() {
      const dbPath = path.join(process.cwd(), '.swarm/memory.db');
      const memory = new SwarmMemoryManager(dbPath);
      await memory.initialize();
      const tier1 = await memory.retrieve('aqe/stabilization/tier1-check', { partition: 'coordination' });
      await memory.close();
      console.log(tier1?.met ? 'true' : 'false');
    }
    check().catch(() => console.log('false'));
  " 2>/dev/null)

  if [ "$TIER1_MET" = "true" ]; then
    echo ""
    echo "🎉 TIER 1 ACHIEVED! Monitoring complete."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  fi

  echo ""
  echo "⏱️  Next validation in ${INTERVAL_MINUTES} minutes..."
  echo ""

  sleep $INTERVAL_SECONDS
done
