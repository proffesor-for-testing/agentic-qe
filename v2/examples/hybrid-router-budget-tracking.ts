/**
 * Example: HybridRouter Advanced Cost Tracking & Budget Management
 *
 * Demonstrates the new cost tracking features in HybridRouter:
 * - Budget configuration (daily/monthly limits)
 * - Cost tracking by provider, model, and task type
 * - Monthly cost projections
 * - Top costly operations analysis
 * - Detailed cost reports with date filtering
 */

import {
  HybridRouter,
  BudgetConfig,
  BudgetStatus,
  CostSavingsReport
} from '../src/providers/HybridRouter';

async function main() {
  // Initialize the hybrid router
  const router = new HybridRouter({
    defaultStrategy: 'balanced',
    enableCircuitBreaker: true,
    enableLearning: true,
    debug: true
  });

  await router.initialize();

  // ============================================
  // Example 1: Set Budget Configuration
  // ============================================
  console.log('\n=== Setting Budget Configuration ===');

  const budgetConfig: BudgetConfig = {
    monthlyBudget: 100,      // $100/month
    dailyBudget: 5,          // $5/day
    alertThreshold: 0.8,     // Alert at 80% utilization
    enforceLimit: true       // Reject requests over budget
  };

  router.setBudget(budgetConfig);
  console.log('Budget configured:', budgetConfig);

  // ============================================
  // Example 2: Check Budget Status
  // ============================================
  console.log('\n=== Budget Status ===');

  const budgetStatus: BudgetStatus = router.getBudgetStatus();
  console.log('Daily spent:', budgetStatus.dailySpent);
  console.log('Daily remaining:', budgetStatus.dailyRemaining);
  console.log('Monthly spent:', budgetStatus.monthlySpent);
  console.log('Monthly remaining:', budgetStatus.monthlyRemaining);
  console.log('Utilization:', `${budgetStatus.utilizationPercentage.toFixed(2)}%`);
  console.log('Over budget:', budgetStatus.isOverBudget);
  console.log('Alert triggered:', budgetStatus.alertTriggered);

  // ============================================
  // Example 3: Make Some Requests
  // ============================================
  console.log('\n=== Making Requests ===');

  try {
    // Make a few requests to accumulate cost data
    const response1 = await router.complete({
      messages: [
        {
          role: 'user',
          content: 'What is the weather like today?'
        }
      ],
      maxTokens: 100
    });
    console.log('Request 1 completed:', response1.model);

    const response2 = await router.complete({
      messages: [
        {
          role: 'user',
          content: 'Explain quantum computing in simple terms.'
        }
      ],
      maxTokens: 500
    });
    console.log('Request 2 completed:', response2.model);

  } catch (error) {
    console.error('Request failed:', error);
  }

  // ============================================
  // Example 4: Get Detailed Cost Report
  // ============================================
  console.log('\n=== Detailed Cost Report ===');

  const report: CostSavingsReport = router.getDetailedCostReport();

  console.log('\nBasic Metrics:');
  console.log('- Total requests:', report.totalRequests);
  console.log('- Local requests:', report.localRequests);
  console.log('- Cloud requests:', report.cloudRequests);
  console.log('- Cache hits:', report.cacheHits);
  console.log('- Total cost: $', report.totalCost.toFixed(4));
  console.log('- Average cost per request: $', report.averageCostPerRequest.toFixed(4));
  console.log('- Savings: $', report.savings.toFixed(4), `(${report.savingsPercentage.toFixed(2)}%)`);
  console.log('- Cache savings: $', report.cacheSavings.toFixed(4));

  console.log('\nCost by Provider:');
  Object.entries(report.costByProvider).forEach(([provider, cost]) => {
    console.log(`- ${provider}: $${cost.toFixed(4)}`);
  });

  console.log('\nCost by Model:');
  Object.entries(report.costByModel).forEach(([model, cost]) => {
    console.log(`- ${model}: $${cost.toFixed(4)}`);
  });

  console.log('\nCost by Task Type:');
  Object.entries(report.costByTaskType).forEach(([taskType, cost]) => {
    console.log(`- ${taskType}: $${cost.toFixed(4)}`);
  });

  console.log('\nTop Costly Tasks:');
  report.topCostlyTasks.forEach((task, index) => {
    console.log(`${index + 1}. ${task.taskType}: $${task.cost.toFixed(4)} (${task.count} requests)`);
  });

  console.log('\nProjections:');
  console.log('- Monthly cost projection: $', report.monthlyCostProjection.toFixed(2));
  console.log('- Report period:', report.periodStart, 'to', report.periodEnd);

  // ============================================
  // Example 5: Get Top Costly Operations
  // ============================================
  console.log('\n=== Top 5 Costly Operations ===');

  const topOperations = router.getTopCostlyOperations(5);
  topOperations.forEach((op, index) => {
    console.log(`${index + 1}. ${op.taskType}: $${op.cost.toFixed(4)}`);
  });

  // ============================================
  // Example 6: Monthly Cost Projection
  // ============================================
  console.log('\n=== Monthly Cost Projection ===');

  const projection = router.projectMonthlyCost();
  console.log('Projected monthly cost: $', projection.toFixed(2));

  if (budgetConfig.monthlyBudget) {
    const percentOfBudget = (projection / budgetConfig.monthlyBudget) * 100;
    console.log(`This is ${percentOfBudget.toFixed(2)}% of your monthly budget`);

    if (percentOfBudget > 100) {
      console.warn('⚠️  WARNING: Current usage rate will exceed monthly budget!');
    }
  }

  // ============================================
  // Example 7: Date-Filtered Report
  // ============================================
  console.log('\n=== Date-Filtered Report ===');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const filteredReport = router.getDetailedCostReport(yesterday, now);
  console.log('Requests in last 24 hours:', filteredReport.totalRequests);
  console.log('Cost in last 24 hours: $', filteredReport.totalCost.toFixed(4));

  // ============================================
  // Example 8: Budget Alert Simulation
  // ============================================
  console.log('\n=== Budget Alert Simulation ===');

  // Set a very low budget to trigger alerts
  const testBudget: BudgetConfig = {
    monthlyBudget: 1,
    alertThreshold: 0.5,
    enforceLimit: false  // Don't actually reject requests
  };

  router.setBudget(testBudget);

  const alertStatus = router.getBudgetStatus();
  if (alertStatus.alertTriggered) {
    console.log('⚠️  Budget alert triggered!');
    console.log('   Utilization:', `${alertStatus.utilizationPercentage.toFixed(2)}%`);
    console.log('   Monthly spent:', `$${alertStatus.monthlySpent.toFixed(4)}`);
    console.log('   Monthly budget:', `$${testBudget.monthlyBudget}`);
  }

  // ============================================
  // Cleanup
  // ============================================
  await router.shutdown();
  console.log('\n=== Router shut down successfully ===');
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
