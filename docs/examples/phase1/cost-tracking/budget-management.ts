/**
 * Budget Management Example
 *
 * This example demonstrates comprehensive budget management and alerts.
 */

import { CostTracker, BudgetManager } from 'agentic-qe';
import chalk from 'chalk';

async function budgetManagement() {
  console.log(chalk.bold('\n=== Budget Management Demo ===\n'));

  // Initialize budget manager
  const budgetManager = new BudgetManager({
    storage: {
      type: 'sqlite',
      path: './.agentic-qe/budgets.db'
    }
  });

  // Set up budgets
  console.log(chalk.cyan('Setting up budgets...\n'));

  // Daily budget
  await budgetManager.setBudget({
    id: 'daily-budget',
    period: 'daily',
    limit: 50.00,
    warningThreshold: 40.00,  // 80%
    onWarning: 'notify',
    onExceeded: 'pause',
    notificationChannels: ['email', 'slack']
  });
  console.log(chalk.green('✓ Daily budget: $50.00'));

  // Monthly budget
  await budgetManager.setBudget({
    id: 'monthly-budget',
    period: 'monthly',
    limit: 1000.00,
    warningThreshold: 800.00,  // 80%
    onWarning: 'notify',
    onExceeded: 'downgrade',  // Switch to cheaper models
    notificationChannels: ['email']
  });
  console.log(chalk.green('✓ Monthly budget: $1,000.00'));

  // Project-specific budgets
  await budgetManager.setBudget({
    id: 'auth-service-budget',
    period: 'monthly',
    limit: 300.00,
    projectId: 'auth-service',
    priority: 'critical',
    allowOverage: 20  // Can exceed by 20%
  });
  console.log(chalk.green('✓ Auth service budget: $300.00/month'));

  await budgetManager.setBudget({
    id: 'experimental-budget',
    period: 'monthly',
    limit: 50.00,
    projectId: 'experimental',
    priority: 'low',
    allowOverage: 0  // Strict limit
  });
  console.log(chalk.green('✓ Experimental budget: $50.00/month (strict)'));

  // Team-level budgets
  await budgetManager.setBudget({
    id: 'backend-team-budget',
    period: 'monthly',
    limit: 600.00,
    teamId: 'backend-team',
    members: 10,
    perMemberLimit: 60.00
  });
  console.log(chalk.green('✓ Backend team budget: $600.00/month ($60/member)\n'));

  // Set up alerts
  console.log(chalk.cyan('Configuring alerts...\n'));

  await budgetManager.setAlert({
    id: 'daily-warning',
    budgetId: 'daily-budget',
    type: 'threshold',
    threshold: 0.8,  // 80%
    channels: ['slack'],
    webhook: 'https://hooks.slack.com/services/...',
    message: '⚠️ Daily budget at {{percentage}}% (${{current}}/${{limit}})'
  });
  console.log(chalk.green('✓ Daily warning alert (80%)'));

  await budgetManager.setAlert({
    id: 'monthly-critical',
    budgetId: 'monthly-budget',
    type: 'threshold',
    threshold: 0.95,  // 95%
    channels: ['email', 'slack'],
    message: '🚨 CRITICAL: Monthly budget at {{percentage}}%!'
  });
  console.log(chalk.green('✓ Monthly critical alert (95%)'));

  await budgetManager.setAlert({
    id: 'anomaly-detection',
    type: 'anomaly',
    sensitivity: 'medium',
    channels: ['email'],
    message: '🔍 Unusual spending detected: {{anomaly}}'
  });
  console.log(chalk.green('✓ Anomaly detection alert\n'));

  // Check budget status
  console.log(chalk.cyan('=== Current Budget Status ===\n'));

  const status = await budgetManager.getStatus('daily-budget');
  displayBudgetStatus('Daily Budget', status);

  const monthlyStatus = await budgetManager.getStatus('monthly-budget');
  displayBudgetStatus('Monthly Budget', monthlyStatus);

  // Get all budget statuses
  const allStatuses = await budgetManager.getAllStatuses();
  console.log(chalk.bold('\nAll Budgets Summary:\n'));

  allStatuses.forEach(s => {
    const color = s.percentage > 90 ? chalk.red :
                  s.percentage > 80 ? chalk.yellow :
                  chalk.green;

    console.log(color(`  ${s.name}: ${s.percentage.toFixed(1)}% ($${s.current.toFixed(2)}/$${s.limit})`));
  });

  // Set up dynamic budget adjustment
  console.log(chalk.bold('\n\n=== Dynamic Budget Adjustment ===\n'));

  await budgetManager.setAdjustmentRules({
    beforeRelease: {
      days: 3,
      multiplier: 1.5,
      reason: 'Increased testing before release'
    },
    afterRelease: {
      days: 5,
      multiplier: 0.7,
      reason: 'Reduced testing after release'
    },
    onPullRequest: {
      multiplier: 1.2,
      reason: 'Additional testing for PR'
    },
    onWeekend: {
      multiplier: 0.5,
      reason: 'Reduced activity on weekends'
    }
  });
  console.log(chalk.green('✓ Configured dynamic adjustment rules'));

  // Check upcoming adjustments
  const nextRelease = new Date('2025-11-01');
  const adjustments = await budgetManager.getUpcomingAdjustments(nextRelease);

  console.log(chalk.cyan('\nUpcoming Adjustments:'));
  adjustments.forEach(adj => {
    console.log(chalk.gray(`  ${adj.date}: ${adj.multiplier}x (${adj.reason})`));
  });

  // Forecast future costs
  console.log(chalk.bold('\n\n=== Cost Forecasting ===\n'));

  const forecast = await budgetManager.forecastCosts({
    period: 'month',
    startDate: new Date(),
    includeAdjustments: true,
    confidenceLevel: 0.9
  });

  console.log(chalk.cyan('Monthly Forecast:'));
  console.log(chalk.gray(`  Expected: $${forecast.expected.toFixed(2)}`));
  console.log(chalk.gray(`  Best Case: $${forecast.bestCase.toFixed(2)}`));
  console.log(chalk.gray(`  Worst Case: $${forecast.worstCase.toFixed(2)}`));
  console.log(chalk.gray(`  Confidence: ${(forecast.confidence * 100).toFixed(0)}%`));

  if (forecast.expected > 1000) {
    console.log(chalk.red('\n⚠️  WARNING: Forecast exceeds monthly budget!'));
    console.log(chalk.yellow('Suggested actions:'));
    forecast.suggestions.forEach(s => {
      console.log(chalk.gray(`  - ${s}`));
    });
  } else {
    console.log(chalk.green('\n✓ Forecast within budget'));
  }

  // Generate budget report
  console.log(chalk.bold('\n\n=== Generating Reports ===\n'));

  const report = await budgetManager.generateReport({
    period: 'month',
    format: 'detailed',
    includeForecasts: true,
    includeRecommendations: true
  });

  console.log(chalk.cyan('Budget Report:'));
  console.log(chalk.gray(`  Total Budgets: ${report.budgetCount}`));
  console.log(chalk.gray(`  Total Allocated: $${report.totalAllocated.toFixed(2)}`));
  console.log(chalk.gray(`  Total Spent: $${report.totalSpent.toFixed(2)}`));
  console.log(chalk.gray(`  Utilization: ${report.utilization.toFixed(1)}%`));
  console.log(chalk.gray(`  Remaining: $${report.remaining.toFixed(2)}`));

  // Export report
  const reportPath = await budgetManager.exportReport({
    format: 'pdf',
    output: './budget-report.pdf',
    includecharts: true
  });
  console.log(chalk.green(`\n✓ Report exported to: ${reportPath}`));
}

function displayBudgetStatus(name: string, status: any) {
  const percentage = status.percentage;
  const color = percentage > 90 ? chalk.red :
                percentage > 80 ? chalk.yellow :
                chalk.green;

  const bar = '█'.repeat(Math.floor(percentage / 5)) +
              '░'.repeat(20 - Math.floor(percentage / 5));

  console.log(chalk.bold(name + ':'));
  console.log(color(`  [${bar}] ${percentage.toFixed(1)}%`));
  console.log(chalk.gray(`  Spent: $${status.current.toFixed(2)}`));
  console.log(chalk.gray(`  Limit: $${status.limit.toFixed(2)}`));
  console.log(chalk.gray(`  Remaining: $${status.remaining.toFixed(2)}`));

  if (status.projectedEnd) {
    const daysRemaining = Math.ceil((status.projectedEnd - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) {
      console.log(chalk.red(`  ⚠️  Budget will be exceeded ${Math.abs(daysRemaining)} days before period end!`));
    } else {
      console.log(chalk.gray(`  Projected to last: ${daysRemaining} days`));
    }
  }
  console.log();
}

// Run the example
budgetManagement().catch(console.error);

/**
 * Expected Output:
 *
 * === Budget Management Demo ===
 *
 * Setting up budgets...
 *
 * ✓ Daily budget: $50.00
 * ✓ Monthly budget: $1,000.00
 * ✓ Auth service budget: $300.00/month
 * ✓ Experimental budget: $50.00/month (strict)
 * ✓ Backend team budget: $600.00/month ($60/member)
 *
 * Configuring alerts...
 *
 * ✓ Daily warning alert (80%)
 * ✓ Monthly critical alert (95%)
 * ✓ Anomaly detection alert
 *
 * === Current Budget Status ===
 *
 * Daily Budget:
 *   [████████████░░░░░░░░] 60.2%
 *   Spent: $30.10
 *   Limit: $50.00
 *   Remaining: $19.90
 *   Projected to last: 8 hours
 *
 * Monthly Budget:
 *   [██████░░░░░░░░░░░░░░] 30.5%
 *   Spent: $305.00
 *   Limit: $1,000.00
 *   Remaining: $695.00
 *   Projected to last: 18 days
 *
 * All Budgets Summary:
 *
 *   Daily Budget: 60.2% ($30.10/$50.00)
 *   Monthly Budget: 30.5% ($305.00/$1000.00)
 *   Auth Service: 45.2% ($135.60/$300.00)
 *   Experimental: 78.4% ($39.20/$50.00)
 *   Backend Team: 28.3% ($169.80/$600.00)
 *
 * === Dynamic Budget Adjustment ===
 *
 * ✓ Configured dynamic adjustment rules
 *
 * Upcoming Adjustments:
 *   2025-10-29: 1.5x (Increased testing before release)
 *   2025-11-03: 0.7x (Reduced testing after release)
 *   2025-10-19: 0.5x (Reduced activity on weekends)
 *
 * === Cost Forecasting ===
 *
 * Monthly Forecast:
 *   Expected: $892.50
 *   Best Case: $725.00
 *   Worst Case: $1,125.00
 *   Confidence: 90%
 *
 * ✓ Forecast within budget
 *
 * === Generating Reports ===
 *
 * Budget Report:
 *   Total Budgets: 5
 *   Total Allocated: $2,000.00
 *   Total Spent: $680.70
 *   Utilization: 34.0%
 *   Remaining: $1,319.30
 *
 * ✓ Report exported to: ./budget-report.pdf
 */
