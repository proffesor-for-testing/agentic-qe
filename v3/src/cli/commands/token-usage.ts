/**
 * Agentic QE v3 - Token Usage CLI Command
 * ADR-042: V3 QE Token Tracking and Consumption Reduction
 *
 * Provides CLI access to token usage metrics and optimization recommendations.
 *
 * Commands:
 * - aqe token-usage --period 24h
 * - aqe token-usage --by-agent
 * - aqe token-usage --by-domain
 * - aqe token-usage --recommendations
 * - aqe token-usage --export tokens.csv
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  TokenMetricsCollector,
  SessionTokenSummary,
  AgentTokenMetrics,
  TokenUsage,
  Timeframe,
  TokenEfficiencyReport,
} from '../../learning/token-tracker.js';
import { TokenOptimizerService } from '../../optimization/token-optimizer-service.js';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

interface TokenUsageOptions {
  period?: string;
  byAgent?: boolean;
  byDomain?: boolean;
  recommendations?: boolean;
  export?: string;
  json?: boolean;
  verbose?: boolean;
}

// ============================================================================
// Command Implementation
// ============================================================================

/**
 * Create the token-usage command
 */
export function createTokenUsageCommand(): Command {
  const command = new Command('token-usage')
    .description('View and analyze token consumption metrics (ADR-042)')
    .option('-p, --period <period>', 'Time period: 1h, 24h, 7d, 30d', '24h')
    .option('-a, --by-agent', 'Group usage by agent')
    .option('-d, --by-domain', 'Group usage by domain')
    .option('-r, --recommendations', 'Show optimization recommendations')
    .option('-e, --export <file>', 'Export to CSV file')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (options: TokenUsageOptions) => {
      await executeTokenUsage(options);
    });

  return command;
}

/**
 * Execute the token-usage command
 */
async function executeTokenUsage(options: TokenUsageOptions): Promise<void> {
  const timeframe = parseTimeframe(options.period);

  try {
    if (options.byAgent) {
      await showByAgent(timeframe, options);
    } else if (options.byDomain) {
      await showByDomain(timeframe, options);
    } else if (options.recommendations) {
      await showRecommendations(timeframe, options);
    } else if (options.export) {
      await exportToFile(timeframe, options.export, options);
    } else {
      await showSessionSummary(timeframe, options);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Show session summary (default view)
 */
async function showSessionSummary(timeframe: Timeframe, options: TokenUsageOptions): Promise<void> {
  const summary = TokenMetricsCollector.getSessionSummary(timeframe);

  if (options.json) {
    console.log(JSON.stringify(formatSummaryForJson(summary), null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\n📊 Token Usage Summary\n'));
  console.log(chalk.gray(`Period: ${timeframe}`));
  console.log(chalk.gray(`Session: ${summary.sessionId}\n`));

  // Total usage
  console.log(chalk.bold('Total Usage:'));
  console.log(`  Input tokens:  ${formatNumber(summary.totalUsage.inputTokens)}`);
  console.log(`  Output tokens: ${formatNumber(summary.totalUsage.outputTokens)}`);
  console.log(`  Total tokens:  ${formatNumber(summary.totalUsage.totalTokens)}`);
  if (summary.totalUsage.estimatedCostUsd !== undefined) {
    console.log(`  Estimated cost: ${formatCost(summary.totalUsage.estimatedCostUsd)}`);
  }

  // Optimization stats
  console.log(chalk.bold('\nOptimization Stats:'));
  const { optimizationStats } = summary;
  console.log(`  Patterns reused:    ${optimizationStats.patternsReused}`);
  console.log(`  Cache hits:         ${optimizationStats.cacheHits}`);
  console.log(`  Early exits:        ${optimizationStats.earlyExits}`);
  console.log(`  Tokens saved:       ${formatNumber(optimizationStats.tokensSaved)}`);
  console.log(`  Savings percentage: ${chalk.green(`${optimizationStats.savingsPercentage.toFixed(1)}%`)}`);

  // Quick breakdown
  if (options.verbose) {
    console.log(chalk.bold('\nAgents:'));
    for (const [agentId, metrics] of summary.byAgent) {
      console.log(`  ${agentId}: ${formatNumber(metrics.totalTokens)} tokens (${metrics.tasksExecuted} tasks)`);
    }

    console.log(chalk.bold('\nDomains:'));
    for (const [domain, usage] of summary.byDomain) {
      console.log(`  ${domain}: ${formatNumber(usage.totalTokens)} tokens`);
    }
  }

  // Optimizer stats
  const reuseStats = TokenOptimizerService.getReuseStats();
  if (reuseStats && reuseStats.totalAttempts > 0) {
    console.log(chalk.bold('\nEarly Exit Optimizer:'));
    console.log(`  Total attempts:    ${reuseStats.totalAttempts}`);
    console.log(`  Successful reuses: ${reuseStats.totalReuses}`);
    console.log(`  Exit rate:         ${(reuseStats.exitRate * 100).toFixed(1)}%`);
    console.log(`  Avg search latency: ${reuseStats.avgSearchLatencyMs.toFixed(1)}ms`);
  }

  console.log('');
}

/**
 * Show usage grouped by agent
 */
async function showByAgent(timeframe: Timeframe, options: TokenUsageOptions): Promise<void> {
  const metrics = TokenMetricsCollector.getAgentMetrics(undefined, timeframe);
  const agentMetrics = Array.isArray(metrics) ? metrics : [metrics];

  if (options.json) {
    console.log(JSON.stringify(agentMetrics, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\n📊 Token Usage by Agent\n'));
  console.log(chalk.gray(`Period: ${timeframe}\n`));

  if (agentMetrics.length === 0) {
    console.log(chalk.yellow('No agent metrics available.'));
    return;
  }

  // Sort by total tokens descending
  const sorted = agentMetrics.sort((a, b) => b.totalTokens - a.totalTokens);

  // Table header
  console.log(chalk.bold(
    padRight('Agent', 25) +
    padRight('Input', 12) +
    padRight('Output', 12) +
    padRight('Total', 12) +
    padRight('Tasks', 8) +
    padRight('Saved', 12)
  ));
  console.log(chalk.gray('─'.repeat(81)));

  // Table rows
  for (const agent of sorted) {
    console.log(
      padRight(truncate(agent.agentId, 24), 25) +
      padRight(formatNumber(agent.totalInputTokens), 12) +
      padRight(formatNumber(agent.totalOutputTokens), 12) +
      padRight(formatNumber(agent.totalTokens), 12) +
      padRight(String(agent.tasksExecuted), 8) +
      chalk.green(padRight(formatNumber(agent.estimatedTokensSaved), 12))
    );
  }

  // Total
  const totalTokens = sorted.reduce((sum, a) => sum + a.totalTokens, 0);
  const totalTasks = sorted.reduce((sum, a) => sum + a.tasksExecuted, 0);
  const totalSaved = sorted.reduce((sum, a) => sum + a.estimatedTokensSaved, 0);

  console.log(chalk.gray('─'.repeat(81)));
  console.log(chalk.bold(
    padRight('TOTAL', 25) +
    padRight('', 12) +
    padRight('', 12) +
    padRight(formatNumber(totalTokens), 12) +
    padRight(String(totalTasks), 8) +
    chalk.green(padRight(formatNumber(totalSaved), 12))
  ));
  console.log('');
}

/**
 * Show usage grouped by domain
 */
async function showByDomain(timeframe: Timeframe, options: TokenUsageOptions): Promise<void> {
  const domainMetrics = TokenMetricsCollector.getDomainMetrics(undefined, timeframe);

  if (!(domainMetrics instanceof Map)) {
    console.log(chalk.yellow('Single domain metrics not supported for --by-domain'));
    return;
  }

  if (options.json) {
    const obj = Object.fromEntries(domainMetrics);
    console.log(JSON.stringify(obj, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\n📊 Token Usage by Domain\n'));
  console.log(chalk.gray(`Period: ${timeframe}\n`));

  if (domainMetrics.size === 0) {
    console.log(chalk.yellow('No domain metrics available.'));
    return;
  }

  // Sort by total tokens descending
  const sorted = Array.from(domainMetrics.entries())
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens);

  // Table header
  console.log(chalk.bold(
    padRight('Domain', 25) +
    padRight('Input', 15) +
    padRight('Output', 15) +
    padRight('Total', 15) +
    padRight('Cost', 12)
  ));
  console.log(chalk.gray('─'.repeat(82)));

  // Table rows
  for (const [domain, usage] of sorted) {
    console.log(
      padRight(truncate(domain, 24), 25) +
      padRight(formatNumber(usage.inputTokens), 15) +
      padRight(formatNumber(usage.outputTokens), 15) +
      padRight(formatNumber(usage.totalTokens), 15) +
      padRight(formatCost(usage.estimatedCostUsd || 0), 12)
    );
  }

  // Total
  const totalTokens = sorted.reduce((sum, [_, u]) => sum + u.totalTokens, 0);
  const totalCost = sorted.reduce((sum, [_, u]) => sum + (u.estimatedCostUsd || 0), 0);

  console.log(chalk.gray('─'.repeat(82)));
  console.log(chalk.bold(
    padRight('TOTAL', 25) +
    padRight('', 15) +
    padRight('', 15) +
    padRight(formatNumber(totalTokens), 15) +
    padRight(formatCost(totalCost), 12)
  ));
  console.log('');
}

/**
 * Show optimization recommendations
 */
async function showRecommendations(timeframe: Timeframe, options: TokenUsageOptions): Promise<void> {
  const report = TokenMetricsCollector.getTokenEfficiency(timeframe);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\n💡 Token Optimization Recommendations\n'));
  console.log(chalk.gray(`Period: ${timeframe}\n`));

  // Efficiency stats
  console.log(chalk.bold('Current Efficiency:'));
  console.log(`  Total tokens used:   ${formatNumber(report.totalTokensUsed)}`);
  console.log(`  Total tokens saved:  ${chalk.green(formatNumber(report.totalTokensSaved))}`);
  console.log(`  Savings percentage:  ${chalk.green(`${report.savingsPercentage.toFixed(1)}%`)}`);
  console.log(`  Pattern reuse rate:  ${(report.patternReuseRate * 100).toFixed(1)}%`);
  console.log(`  Avg tokens per task: ${formatNumber(report.averageTokensPerTask)}`);

  // Recommendations
  console.log(chalk.bold('\nRecommendations:'));
  if (report.recommendations.length === 0) {
    console.log(chalk.green('  ✓ Token usage is optimized!'));
  } else {
    for (const rec of report.recommendations) {
      console.log(`  ${chalk.yellow('•')} ${rec}`);
    }
  }

  // Additional optimizer recommendations
  const reuseStats = TokenOptimizerService.getReuseStats();
  if (reuseStats) {
    console.log(chalk.bold('\nPattern Reuse Analysis:'));

    if (reuseStats.exitRate < 0.1 && reuseStats.totalAttempts > 10) {
      console.log(`  ${chalk.yellow('•')} Low early exit rate (${(reuseStats.exitRate * 100).toFixed(1)}%). Consider lowering similarity threshold.`);
    }

    if (reuseStats.reasonBreakdown.confidence_too_low > reuseStats.totalAttempts * 0.3) {
      console.log(`  ${chalk.yellow('•')} Many patterns rejected for low confidence. Review pattern training.`);
    }

    if (reuseStats.reasonBreakdown.pattern_too_old > reuseStats.totalAttempts * 0.2) {
      console.log(`  ${chalk.yellow('•')} Patterns expiring frequently. Consider increasing max pattern age.`);
    }
  }

  console.log('');
}

/**
 * Export metrics to CSV file
 */
async function exportToFile(timeframe: Timeframe, filePath: string, options: TokenUsageOptions): Promise<void> {
  const tasks = TokenMetricsCollector.getTaskMetrics(timeframe);

  // Build CSV content
  const headers = [
    'Task ID',
    'Agent ID',
    'Domain',
    'Operation',
    'Input Tokens',
    'Output Tokens',
    'Total Tokens',
    'Cost (USD)',
    'Pattern Reused',
    'Tokens Saved',
    'Timestamp',
  ];

  const rows = tasks.map(task => [
    task.taskId,
    task.agentId,
    task.domain,
    task.operation,
    task.usage.inputTokens,
    task.usage.outputTokens,
    task.usage.totalTokens,
    task.usage.estimatedCostUsd?.toFixed(6) || '0',
    task.patternReused ? 'Yes' : 'No',
    task.tokensSaved || 0,
    new Date(task.timestamp).toISOString(),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ].join('\n');

  fs.writeFileSync(filePath, csv);

  console.log(chalk.green(`✓ Exported ${tasks.length} records to ${filePath}`));

  // Also export summary if verbose
  if (options.verbose) {
    const summary = TokenMetricsCollector.getSessionSummary(timeframe);
    const summaryPath = filePath.replace('.csv', '-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(formatSummaryForJson(summary), null, 2));
    console.log(chalk.green(`✓ Exported summary to ${summaryPath}`));
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseTimeframe(period?: string): Timeframe {
  const valid: Timeframe[] = ['1h', '24h', '7d', '30d'];
  if (period && valid.includes(period as Timeframe)) {
    return period as Timeframe;
  }
  return '24h';
}

function formatNumber(n: number): string {
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M';
  } else if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'K';
  }
  return String(n);
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

function escapeCSV(value: unknown): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatSummaryForJson(summary: SessionTokenSummary): Record<string, unknown> {
  return {
    sessionId: summary.sessionId,
    startTime: summary.startTime,
    endTime: summary.endTime,
    totalUsage: summary.totalUsage,
    optimizationStats: summary.optimizationStats,
    byAgent: Object.fromEntries(summary.byAgent),
    byDomain: Object.fromEntries(summary.byDomain),
  };
}
