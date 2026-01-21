/**
 * Cost Tracking Example
 *
 * This example demonstrates comprehensive cost tracking and budgeting.
 */

import { ModelRouter, CostTracker, ModelExecution } from 'agentic-qe';

async function costTracking() {
  // Initialize cost tracker
  const tracker = new CostTracker({
    storage: {
      type: 'sqlite',
      path: './.agentic-qe/costs.db'
    },
    alerts: [
      {
        type: 'daily',
        threshold: 50.00,
        action: 'email',
        contacts: ['admin@example.com']
      },
      {
        type: 'monthly',
        threshold: 1000.00,
        action: 'slack',
        webhook: 'https://hooks.slack.com/...'
      }
    ]
  });

  // Set budget
  tracker.setBudget({
    period: 'daily',
    limit: 50.00,
    onExceeded: 'pause'
  });

  tracker.setBudget({
    period: 'monthly',
    limit: 1000.00,
    onExceeded: 'downgrade'
  });

  console.log('=== Cost Tracking Demo ===\n');

  // Check current budget status
  const status = await tracker.checkBudget();
  console.log('Budget Status:');
  console.log(`  Daily: $${status.daily.current}/$${status.daily.limit}`);
  console.log(`  Monthly: $${status.monthly.current}/$${status.monthly.limit}`);
  console.log();

  // Simulate some executions
  const executions: ModelExecution[] = [
    {
      taskId: 'test-001',
      modelId: 'gpt-3.5-turbo',
      inputTokens: 800,
      outputTokens: 1200,
      totalCost: 0.004,
      duration: 2300,
      success: true,
      timestamp: Date.now()
    },
    {
      taskId: 'test-002',
      modelId: 'gpt-4',
      inputTokens: 1500,
      outputTokens: 2500,
      totalCost: 0.120,
      duration: 4500,
      success: true,
      timestamp: Date.now()
    },
    {
      taskId: 'security-001',
      modelId: 'claude-sonnet-4.5',
      inputTokens: 2000,
      outputTokens: 3000,
      totalCost: 0.075,
      duration: 5200,
      success: true,
      timestamp: Date.now()
    }
  ];

  // Record executions
  executions.forEach(exec => tracker.record(exec));
  console.log('Recorded 3 executions\n');

  // Get today's costs
  const todayCost = await tracker.getTodayCost();
  console.log(`Today's Total Cost: $${todayCost.toFixed(3)}\n`);

  // Get detailed breakdown
  const breakdown = await tracker.getBreakdown({
    period: 'today',
    groupBy: 'model'
  });

  console.log('Cost Breakdown by Model:');
  breakdown.byModel.forEach(m => {
    console.log(`  ${m.modelId}:`);
    console.log(`    Tasks: ${m.tasks}`);
    console.log(`    Cost: $${m.cost.toFixed(3)}`);
    console.log(`    Avg: $${m.avgCost.toFixed(3)}/task`);
  });
  console.log();

  // Calculate savings
  console.log('Savings Analysis:');
  console.log(`  Single Model Cost (Sonnet): $${(breakdown.totalTasks * 0.15).toFixed(3)}`);
  console.log(`  Multi-Model Cost: $${breakdown.totalCost.toFixed(3)}`);
  console.log(`  Savings: $${breakdown.savings.vsBaseline.toFixed(3)} (${breakdown.savings.percentage.toFixed(1)}%)`);
  console.log();

  // Export report
  const csvPath = await tracker.exportCosts({
    format: 'csv',
    period: 'today',
    output: './costs-today.csv'
  });
  console.log(`Exported report to: ${csvPath}`);

  // Set up real-time monitoring
  console.log('\n=== Starting Real-Time Monitor ===');
  console.log('(Press Ctrl+C to stop)\n');

  const monitor = setInterval(async () => {
    const current = await tracker.getTodayCost();
    const budgetStatus = await tracker.checkBudget();

    const percentage = (current / budgetStatus.daily.limit) * 100;
    const bar = '█'.repeat(Math.floor(percentage / 5)) +
                '░'.repeat(20 - Math.floor(percentage / 5));

    console.clear();
    console.log('=== Cost Dashboard ===\n');
    console.log(`Today: $${current.toFixed(2)} / $${budgetStatus.daily.limit}`);
    console.log(`[${bar}] ${percentage.toFixed(1)}%\n`);

    if (percentage > 80) {
      console.log('⚠️  WARNING: Approaching daily limit!');
    }
  }, 5000);

  // Clean up after 30 seconds
  setTimeout(() => {
    clearInterval(monitor);
    console.log('\nMonitoring stopped.');
  }, 30000);
}

// Run the example
costTracking().catch(console.error);

/**
 * Expected Output:
 *
 * === Cost Tracking Demo ===
 *
 * Budget Status:
 *   Daily: $12.45/$50.00
 *   Monthly: $245.67/$1000.00
 *
 * Recorded 3 executions
 *
 * Today's Total Cost: $0.199
 *
 * Cost Breakdown by Model:
 *   gpt-3.5-turbo:
 *     Tasks: 1
 *     Cost: $0.004
 *     Avg: $0.004/task
 *   gpt-4:
 *     Tasks: 1
 *     Cost: $0.120
 *     Avg: $0.120/task
 *   claude-sonnet-4.5:
 *     Tasks: 1
 *     Cost: $0.075
 *     Avg: $0.075/task
 *
 * Savings Analysis:
 *   Single Model Cost (Sonnet): $0.450
 *   Multi-Model Cost: $0.199
 *   Savings: $0.251 (55.8%)
 *
 * Exported report to: ./costs-today.csv
 *
 * === Starting Real-Time Monitor ===
 * (Press Ctrl+C to stop)
 *
 * === Cost Dashboard ===
 *
 * Today: $12.64 / $50.00
 * [█████░░░░░░░░░░░░░░░] 25.3%
 */
