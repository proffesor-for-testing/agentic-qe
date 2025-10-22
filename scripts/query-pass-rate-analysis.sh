#!/bin/bash
# Query Pass Rate Acceleration Analysis from SwarmMemoryManager

echo "=================================================="
echo "Pass Rate Acceleration Analysis - Quick Reference"
echo "=================================================="
echo ""

# Check if database exists
if [ ! -f ".swarm/memory.db" ]; then
  echo "❌ SwarmMemoryManager database not found at .swarm/memory.db"
  echo "Run: npx ts-node scripts/store-pass-rate-analysis.ts"
  exit 1
fi

# Query using ts-node
npx ts-node -e "
import { SwarmMemoryManager } from './src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function query() {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();

  try {
    // Get baseline
    const baseline = await memoryStore.retrieve('tasks/PASS-RATE-ACCELERATION/baseline', {
      partition: 'coordination'
    });

    if (!baseline) {
      console.log('❌ No analysis data found. Run store-pass-rate-analysis.ts first.');
      return;
    }

    console.log('📊 CURRENT STATUS');
    console.log('================================');
    console.log('Pass Rate:', baseline.initialPassRate + '%', '(' + baseline.initialPassing + '/' + baseline.initialTotal + ' tests)');
    console.log('Target:', baseline.targetPassRate + '%', '(' + baseline.targetPassing + '/' + baseline.initialTotal + ' tests)');
    console.log('Gap:', baseline.testsNeeded, 'tests needed');
    console.log('');

    // Get priorities
    const priorities = await memoryStore.retrieve('tasks/PASS-RATE-ACCELERATION/priorities', {
      partition: 'coordination'
    });

    if (priorities) {
      console.log('🎯 STRATEGIC PRIORITIES (by ROI)');
      console.log('================================');
      priorities.priorities.forEach((p: any) => {
        console.log(p.rank + '.', p.category);
        console.log('   Tests:', p.testsAffected, '| Impact: +' + p.expectedImpact + '%', '| Time:', p.estimatedTime);
        console.log('   ROI:', p.roiScore, '| Risk:', p.riskLevel);
        console.log('');
      });
    }

    // Get phase plan
    const plan = await memoryStore.retrieve('tasks/PASS-RATE-ACCELERATION/phase-plan', {
      partition: 'coordination'
    });

    if (plan) {
      console.log('📋 IMPLEMENTATION PHASES');
      console.log('================================');
      console.log('Phase 1:', plan.phases.phase1.name);
      console.log('  Time:', plan.phases.phase1.estimatedTime, '| Gain: +' + plan.phases.phase1.expectedGain + '% → ' + plan.phases.phase1.targetPassRate + '%');
      console.log('  Tasks:', plan.phases.phase1.tasks.join(', '));
      console.log('');
      console.log('Phase 2:', plan.phases.phase2.name, '✅ TARGET');
      console.log('  Time:', plan.phases.phase2.estimatedTime, '| Gain: +' + plan.phases.phase2.expectedGain + '% → ' + plan.phases.phase2.targetPassRate + '%');
      console.log('  Tasks:', plan.phases.phase2.tasks.join(', '));
      console.log('');
      console.log('Phase 3:', plan.phases.phase3.name, '(Optional)');
      console.log('  Time:', plan.phases.phase3.estimatedTime, '| Gain: +' + plan.phases.phase3.expectedGain + '% → ' + plan.phases.phase3.targetPassRate + '%');
      console.log('');
    }

    // Get status
    const status = await memoryStore.retrieve('tasks/PASS-RATE-ACCELERATION/status', {
      partition: 'coordination'
    });

    if (status) {
      console.log('📍 STATUS');
      console.log('================================');
      console.log('Status:', status.status);
      console.log('Current Phase:', status.currentPhase);
      console.log('Recommended Start:', status.recommendedStart);
      console.log('Success Probability:', (status.successProbability * 100).toFixed(1) + '%');
      console.log('Estimated Time:', status.estimatedTotalTime);
      console.log('');
      console.log('📄 Full Report:', status.reportPath);
    }

  } finally {
    await memoryStore.close();
  }
}

query().catch(console.error);
"

echo ""
echo "=================================================="
echo "For detailed analysis, see:"
echo "  docs/reports/PASS-RATE-ACCELERATION-ANALYSIS.md"
echo "  docs/reports/PASS-RATE-ACCELERATION-COMPLETE.md"
echo "=================================================="
