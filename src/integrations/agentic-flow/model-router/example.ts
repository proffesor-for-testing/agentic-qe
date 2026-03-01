/**
 * Multi-Model Router - Usage Examples
 * Demonstrates the ADR-051 implementation
 */

import {
  createModelRouter,
  createModelRouterWithAgentBooster,
  quickRoute,
  getTierRecommendation,
  checkAgentBoosterEligibility,
  estimateTaskCost,
} from './index';

// ============================================================================
// Example 1: Basic Routing
// ============================================================================

async function example1_basicRouting() {
  console.log('\n=== Example 1: Basic Routing ===\n');

  const router = createModelRouter({
    enableAgentBooster: true,
  });

  // Simple task → Tier 1 (Haiku)
  const decision1 = await router.route({
    task: 'Fix typo in documentation',
  });
  console.log(`Task: "Fix typo in documentation"`);
  console.log(`→ Tier ${decision1.tier} (${decision1.modelId})`);
  console.log(`  Complexity: ${decision1.complexityAnalysis.overall}/100`);
  console.log(`  Rationale: ${decision1.rationale}\n`);

  // Complex task → Tier 4 (Opus)
  const decision2 = await router.route({
    task: 'Design authentication system architecture with OAuth2 and JWT',
    codeContext: '// existing auth code here',
  });
  console.log(`Task: "Design authentication system..."`);
  console.log(`→ Tier ${decision2.tier} (${decision2.modelId})`);
  console.log(`  Complexity: ${decision2.complexityAnalysis.overall}/100`);
  console.log(`  Rationale: ${decision2.rationale}\n`);

  // Mechanical transform → Tier 0 (Agent Booster)
  const decision3 = await router.route({
    task: 'Convert var declarations to const',
    codeContext: 'var x = 1; var y = 2; var z = x + y;',
  });
  console.log(`Task: "Convert var to const"`);
  console.log(`→ Tier ${decision3.tier} (${decision3.modelId})`);
  console.log(`  Agent Booster eligible: ${decision3.agentBoosterEligible}`);
  console.log(`  Transform type: ${decision3.agentBoosterTransform}\n`);
}

// ============================================================================
// Example 2: Agent Booster Integration
// ============================================================================

async function example2_agentBooster() {
  console.log('\n=== Example 2: Agent Booster Integration ===\n');

  const router = await createModelRouterWithAgentBooster({
    agentBoosterThreshold: 0.7,
  });

  const tasks = [
    { task: 'Convert var to const', code: 'var x = 1;' },
    { task: 'Add TypeScript types', code: 'function add(a, b) { return a + b; }' },
    { task: 'Remove console.log statements', code: 'console.log("debug");' },
    { task: 'Implement complex algorithm', code: '' },
  ];

  for (const { task, code } of tasks) {
    const decision = await router.route({
      task,
      codeContext: code,
    });

    console.log(`Task: "${task}"`);
    console.log(`  Tier ${decision.tier}`);
    console.log(`  Agent Booster eligible: ${decision.agentBoosterEligible}`);
    if (decision.agentBoosterTransform) {
      console.log(`  Transform: ${decision.agentBoosterTransform}`);
    }
    console.log(`  Confidence: ${decision.confidence.toFixed(2)}\n`);
  }
}

// ============================================================================
// Example 3: Budget Enforcement
// ============================================================================

async function example3_budgetEnforcement() {
  console.log('\n=== Example 3: Budget Enforcement ===\n');

  const router = createModelRouter({
    budgetConfig: {
      enabled: true,
      maxDailyCostUsd: 10.0,
      tierBudgets: {
        2: {
          tier: 2,
          maxCostPerRequest: 0.05,
          maxRequestsPerHour: 10,
          maxRequestsPerDay: 100,
          maxDailyCostUsd: 5.0,
          enabled: true,
        },
      },
      warningThreshold: 0.8,
      onBudgetExceeded: 'downgrade',
      onBudgetWarning: 'warn',
      allowCriticalOverrides: true,
    },
  });

  // Simulate multiple requests
  for (let i = 0; i < 3; i++) {
    const decision = await router.route({
      task: 'Implement feature with complex logic',
    });

    console.log(`Request ${i + 1}:`);
    console.log(`  Tier: ${decision.tier}`);
    console.log(`  Downgraded: ${decision.budgetDecision.wasDowngraded}`);
    console.log(`  Budget utilization: ${(decision.budgetDecision.currentUsage.budgetUtilization * 100).toFixed(1)}%`);
    console.log(`  Warnings: ${decision.warnings.length > 0 ? decision.warnings[0] : 'None'}\n`);

    // Simulate recording actual cost
    await router['budgetEnforcer'].recordCost(decision.tier, 0.02);
  }
}

// ============================================================================
// Example 4: Metrics Tracking
// ============================================================================

async function example4_metrics() {
  console.log('\n=== Example 4: Metrics Tracking ===\n');

  const router = createModelRouter({
    enableMetrics: true,
  });

  // Make several routing decisions
  const tasks = [
    'Fix typo',
    'Implement feature',
    'Design architecture',
    'Convert var to const',
    'Add error handling',
  ];

  for (const task of tasks) {
    await router.route({ task });
  }

  // Get metrics
  const metrics = router.getMetrics();

  console.log('Routing Metrics:');
  console.log(`  Total decisions: ${metrics.totalDecisions}`);
  console.log(`  Avg decision time: ${metrics.avgDecisionTimeMs.toFixed(2)}ms`);
  console.log(`  P95 decision time: ${metrics.p95DecisionTimeMs.toFixed(2)}ms\n`);

  console.log('Agent Booster Stats:');
  console.log(`  Eligible: ${metrics.agentBoosterStats.eligible}`);
  console.log(`  Used: ${metrics.agentBoosterStats.used}`);
  console.log(`  Fallback to LLM: ${metrics.agentBoosterStats.fallbackToLLM}`);
  console.log(`  Success rate: ${(metrics.agentBoosterStats.successRate * 100).toFixed(1)}%\n`);

  console.log('Budget Stats:');
  console.log(`  Total spent: $${metrics.budgetStats.totalSpentUsd.toFixed(4)}`);
  console.log(`  Downgrades: ${metrics.budgetStats.downgradeCount}`);
  console.log(`  Overrides: ${metrics.budgetStats.overrideCount}\n`);

  console.log('Per-Tier Metrics:');
  for (const [tier, stats] of Object.entries(metrics.byTier)) {
    console.log(`  Tier ${tier}:`);
    console.log(`    Selections: ${stats.selectionCount}`);
    console.log(`    Avg complexity: ${stats.avgComplexity.toFixed(1)}`);
    console.log(`    Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
  }
}

// ============================================================================
// Example 5: Convenience Functions
// ============================================================================

async function example5_convenience() {
  console.log('\n=== Example 5: Convenience Functions ===\n');

  // Quick route
  console.log('Quick Route:');
  const decision = await quickRoute('Fix authentication bug', {
    codeContext: '// buggy auth code',
    isCritical: true,
  });
  console.log(`  Tier: ${decision.tier}`);
  console.log(`  Model: ${decision.modelId}\n`);

  // Get tier recommendation
  console.log('Tier Recommendation:');
  const recommendation = await getTierRecommendation(
    'Refactor authentication module',
    '// auth module code'
  );
  console.log(`  Recommended tier: ${recommendation.tier}`);
  console.log(`  Complexity: ${recommendation.complexity}/100`);
  console.log(`  Confidence: ${recommendation.confidence.toFixed(2)}`);
  console.log(`  Explanation: ${recommendation.explanation}\n`);

  // Check Agent Booster eligibility
  console.log('Agent Booster Eligibility:');
  const eligibility = await checkAgentBoosterEligibility(
    'Convert var to const',
    'var x = 1; var y = 2;'
  );
  console.log(`  Eligible: ${eligibility.eligible}`);
  console.log(`  Transform: ${eligibility.transformType}`);
  console.log(`  Confidence: ${eligibility.confidence.toFixed(2)}\n`);

  // Estimate cost
  console.log('Cost Estimation:');
  const estimate = await estimateTaskCost('Implement OAuth2 authentication flow');
  console.log(`  Recommended tier: ${estimate.recommendedTier}`);
  console.log(`  Estimated cost: $${estimate.recommendedCost.toFixed(4)}`);
  console.log('  Costs by tier:');
  for (const [tier, cost] of Object.entries(estimate.costsByTier)) {
    console.log(`    Tier ${tier}: $${cost.toFixed(4)}`);
  }
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
  try {
    await example1_basicRouting();
    await example2_agentBooster();
    await example3_budgetEnforcement();
    await example4_metrics();
    await example5_convenience();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}
